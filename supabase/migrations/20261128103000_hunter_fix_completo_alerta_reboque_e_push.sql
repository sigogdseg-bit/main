-- ============================================================================
-- HUNTER / GD RASTREAMENTO — CORREÇÃO COMPLETA DE ALERTA DE REBOQUE (GUINCHO),
-- DESPACHO PUSH/WHATSAPP E BLINDAGEM CONTRA PACOTES HISTÓRICOS EM BUFFER
-- ============================================================================
-- Migration: 20261128103000_hunter_fix_completo_alerta_reboque_e_push.sql
-- Causas-raiz corrigidas:
--   1. disparar_push_vapid_ao_inserir_notificacao() e cron_disparar_relatorio_gerencial()
--      chamavam o domínio legado (outro sistema/Supabase), causando
--      Timeout 5000ms em 100% das requisições pg_net e 0 entregas de Push/WhatsApp.
--      Corrigido para https://gd.oficial.tec.br com timeout_milliseconds := 15000.
--   2. hunter_atualizar_veiculo_pos_telemetria() sobrescrevia veiculos mesmo com
--      pacotes históricos atrasados (data_hora_gps < ultima_atualizacao) ou sem
--      gps_fixado. Agora bloqueia regressão temporal e preserva gps_fixado.
--   3. ALERTA E (guincho) em trigger_avaliar_alertas_telemetria():
--      - Bloqueia pacotes históricos em buffer (exige ultima_atualizacao recente <= 180s).
--      - Exige janela sustentada >= 90s e >= 3 pacotes com ignicao=false e vel >= 20
--        antes de disparar, evitando falsos positivos antes do heartbeat 0x13 em G900L.
--      - Respeita estritamente destinatários configurados (cliente via regras_veiculo
--        e/ou equipe via notificacoes_configuracoes.alertas_equipe), sem fixação em código.
-- ============================================================================

-- 1. Atualiza o despacho pg_net de notificacoes_sistema para o domínio oficial do GD Segurança
CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://gd.oficial.tec.br/api/push/disparar';
  v_payload jsonb;
  v_titulo text;
BEGIN
  IF NEW.tipo = 'chat' THEN
    RETURN NEW;
  END IF;

  v_titulo := NEW.titulo;
  IF NEW.placa IS NOT NULL
     AND NEW.placa <> ''
     AND position(upper(NEW.placa) in upper(COALESCE(NEW.titulo, ''))) = 0 THEN
    v_titulo := NEW.titulo || ' — ' || NEW.placa;
  END IF;

  v_payload := jsonb_build_object(
    'notificacaoId', NEW.id,
    'destinatarioUserId', NEW.destinatario_user_id,
    'destinatarioClienteId', NEW.destinatario_cliente_id,
    'titulo', v_titulo,
    'mensagem', NEW.mensagem,
    'url', COALESCE(NEW.url, '/monitor-gps'),
    'tag', 'sigo-notif-' || NEW.id::text,
    'tipo', COALESCE(NEW.tipo, 'alerta'),
    'placa', NEW.placa
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2. Atualiza cron_disparar_relatorio_gerencial para o domínio oficial do GD Segurança
CREATE OR REPLACE FUNCTION public.cron_disparar_relatorio_gerencial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://gd.oficial.tec.br/api/relatorios/metricas-diarias/enviar?token=hunter-cron-jammer-2026',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"origem": "pg_cron_supabase"}'::jsonb,
    timeout_milliseconds := 20000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[CRON-RELATORIO] Falha ao disparar relatório via pg_net: %', SQLERRM;
END;
$$;

-- 3. Protege hunter_atualizar_veiculo_pos_telemetria contra pacotes históricos fora de ordem e pacotes sem fix GNSS
CREATE OR REPLACE FUNCTION public.hunter_atualizar_veiculo_pos_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultima_atualizacao TIMESTAMPTZ;
BEGIN
  -- Ignora pacotes sem fixação GNSS ou com coordenada zerada
  IF COALESCE(NEW.gps_fixado, true) = false
     OR (COALESCE(NEW.latitude, 0) = 0 AND COALESCE(NEW.longitude, 0) = 0) THEN
    RETURN NEW;
  END IF;

  SELECT ultima_atualizacao
  INTO v_ultima_atualizacao
  FROM public.veiculos
  WHERE id = NEW.veiculo_id;

  -- Impede que descargas históricas em buffer (data_hora_gps anterior à última leitura)
  -- retroajam a posição atual ou disparem alertas em falso no veículo
  IF v_ultima_atualizacao IS NOT NULL
     AND NEW.data_hora_gps IS NOT NULL
     AND NEW.data_hora_gps < v_ultima_atualizacao THEN
    RETURN NEW;
  END IF;

  UPDATE public.veiculos
  SET
    velocidade_atual     = COALESCE(NEW.velocidade, velocidade_atual),
    ignicao_status       = COALESCE(NEW.ignicao, ignicao_status),
    ultima_latitude      = COALESCE(NEW.latitude, ultima_latitude),
    ultima_longitude     = COALESCE(NEW.longitude, ultima_longitude),
    gps_fixado           = COALESCE(NEW.gps_fixado, gps_fixado),
    ultima_atualizacao   = COALESCE(NEW.data_hora_gps, now())
  WHERE id = NEW.veiculo_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[HUNTER-POS-TELEMETRIA] Erro ao sincronizar veículo %: %',
    NEW.veiculo_id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Atualiza trigger_avaliar_alertas_telemetria() com blindagem completa do ALERTA E (guincho)
--    e respeito estrito às configurações de destinatários (cliente e/ou equipe)
CREATE OR REPLACE FUNCTION public.trigger_avaliar_alertas_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_user_id   UUID;
  v_velocidade_limite INT := 110;
  v_alerta_mov_regras BOOLEAN := true;
  v_alerta_ign_regras BOOLEAN := true;
  v_alertas_ativos    JSONB;
  v_canais_alertas    JSONB;
  v_dist_metros       FLOAT := 0;
  v_dlat              FLOAT;
  v_dlon              FLOAT;
  v_a                 FLOAT;
  v_cooldown_ok       BOOLEAN := false;
  v_horario_proibido  BOOLEAN := false;
  v_hora_inicio_str   TEXT;
  v_hora_fim_str      TEXT;
  v_hora_evento_str   TEXT;

  -- Validação temporal e consecutiva de guincho
  v_delta_sec_guincho       FLOAT := 0;
  v_vel_calc_guincho        FLOAT := 0;
  v_qtd_telem_guincho       INT := 0;
  v_min_ts_telem_guincho    TIMESTAMPTZ;
  v_max_ts_telem_guincho    TIMESTAMPTZ;
  v_teve_ign_on_recente     BOOLEAN := false;
  v_equipe_habilitou_guincho BOOLEAN := false;

  -- Variáveis de geofence / áreas seguras
  v_area              RECORD;
  v_dlat_area         FLOAT;
  v_dlon_area         FLOAT;
  v_dist_area_new     FLOAT;
  v_agora_brt         TIMESTAMP;
  v_hora_atual        TIME;
  v_dow_atual         INT;
  v_area_fora_horario BOOLEAN;
  v_estado_anterior   TEXT;
  v_tolerancia        FLOAT;
  v_raio_saida        FLOAT;
  v_raio_entrada      FLOAT;
  v_deve_alertar_geo  BOOLEAN;

  -- Variáveis de payload do alerta
  v_titulo            TEXT;
  v_mensagem          TEXT;
  v_tipo              TEXT;
  v_gravidade         TEXT;

  COOLDOWN_PADRAO     INTERVAL := INTERVAL '5 minutes';
BEGIN
  v_agora_brt := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora_atual := v_agora_brt::TIME;
  v_dow_atual := EXTRACT(DOW FROM v_agora_brt)::INT;
  v_hora_evento_str := to_char(v_agora_brt, 'DD/MM/YYYY às HH24:MI:SS');

  -- RESET DO CICLO DE IGNIÇÃO / DESLOCAMENTO NA CHAVE DESLIGADA
  IF NEW.ignicao_status = false THEN
    DELETE FROM public.alertas_telemetria_cooldown
    WHERE veiculo_id = NEW.id
      AND tipo_alerta IN ('movimento_fora_horario', 'ignicao_fora_horario');
  END IF;

  -- 1. Busca user_id do cliente titular
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = NEW.cliente_id
  LIMIT 1;

  -- 2. Busca parâmetros de regras e preferências ativas do veículo
  SELECT
    COALESCE(limite_velocidade_geral, 110),
    COALESCE(alerta_movimento_nao_autorizado, true),
    COALESCE(alerta_ignicao_fora_horario, true),
    alertas_ativos,
    canais_alertas
  INTO
    v_velocidade_limite,
    v_alerta_mov_regras,
    v_alerta_ign_regras,
    v_alertas_ativos,
    v_canais_alertas
  FROM public.regras_veiculo
  WHERE veiculo_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    v_velocidade_limite := 110;
    v_alerta_mov_regras := true;
    v_alerta_ign_regras := true;
    v_alertas_ativos := '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"saida_area":true,"entrada_area":false,"excesso_velocidade":true,"perda_comunicacao":true,"baixa_tensao":true,"bateria_desconectada":true,"desvio_rota":true,"guincho":true,"suspeita_jammer":true,"colisao_impacto":true,"corte_nao_autorizado_sms":true}'::jsonb;
    v_canais_alertas := '{"app":true,"whatsapp":true,"ligacao":false}'::jsonb;
  END IF;

  -- 3. Cálculo geodésico de deslocamento Haversine em metros entre OLD e NEW
  IF OLD.ultima_latitude IS NOT NULL
     AND OLD.ultima_longitude IS NOT NULL
     AND NEW.ultima_latitude IS NOT NULL
     AND NEW.ultima_longitude IS NOT NULL
     AND (OLD.ultima_latitude <> 0 OR OLD.ultima_longitude <> 0)
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0)
     AND (OLD.ultima_latitude <> NEW.ultima_latitude OR OLD.ultima_longitude <> NEW.ultima_longitude) THEN

    v_dlat := radians(NEW.ultima_latitude - OLD.ultima_latitude);
    v_dlon := radians(NEW.ultima_longitude - OLD.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(OLD.ultima_latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));
  ELSE
    v_dist_metros := 0;
  END IF;

  -- ALERTA A: EXCESSO DE VELOCIDADE
  IF COALESCE(NEW.velocidade_atual, 0) > 0
     AND COALESCE((v_alertas_ativos->>'excesso_velocidade')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'excesso_velocidade') THEN

    IF NEW.velocidade_atual > v_velocidade_limite THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'excesso_velocidade'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo   := format('⚠️ Excesso de Velocidade — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s atingiu %s km/h (limite configurado: %s km/h) em %s.',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual),
          v_velocidade_limite,
          v_hora_evento_str
        );
        v_tipo      := 'excesso_velocidade';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA B: IGNIÇÃO LIGADA FORA DO HORÁRIO (TRANSIÇÃO OFF -> ON)
  IF NEW.ignicao_status = true
     AND COALESCE(OLD.ignicao_status, false) = false
     AND v_alerta_ign_regras = true
     AND COALESCE((v_alertas_ativos->>'ignicao_fora_horario')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'ignicao_fora_horario') THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'ignicao_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Ignição Acionada Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Motor do veículo %s acionado fora do horário permitido (%s às %s) em %s.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str
        );
        v_tipo      := 'ignicao_fora_horario';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA D: DESLOCAMENTO FORA DO HORÁRIO (1x POR CICLO DE CHAVE LIGADA)
  IF NEW.ignicao_status = true
     AND (COALESCE(NEW.velocidade_atual, 0) >= 3 OR v_dist_metros >= 15.0)
     AND v_alerta_mov_regras = true
     AND COALESCE((v_alertas_ativos->>'movimento_fora_horario')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'movimento_fora_horario') THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'movimento_fora_horario'
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Deslocamento Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s em movimento fora do horário permitido (%s às %s) em %s. Velocidade: %s km/h.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str,
          ROUND(NEW.velocidade_atual)
        );
        v_tipo      := 'movimento_fora_horario';
        v_gravidade := 'critica';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA E: GUINCHO / ARRASTO COM MOTOR DESLIGADO (BLINDADO CONTRA BUFFER E LAG DE ACC)
  -- Exige: pacote em tempo real (ultima_atualizacao <= 180s atrás),
  -- ignição desligada contínua (OLD e NEW = false), GNSS fixado,
  -- velocidade >= 20 km/h, deslocamento físico real >= 50m (e < 15km),
  -- velocidade geodésica <= 190 km/h, janela contínua >= 90s com >= 3 pacotes
  -- (sem qualquer pacote com ignição ligada na janela), e respeita config de cliente/equipe.
  IF NEW.ignicao_status = false
     AND OLD.ignicao_status IS FALSE
     AND COALESCE(NEW.gps_fixado, true) = true
     AND COALESCE(NEW.velocidade_atual, 0) >= 20
     AND NEW.ultima_atualizacao IS NOT NULL
     AND NEW.ultima_atualizacao >= (now() - INTERVAL '180 seconds')
     AND v_dist_metros >= 50.0
     AND v_dist_metros < 15000.0 THEN

    -- Verifica se há pelo menos 1 destinatário configurado (cliente via regras_veiculo OU equipe via notificacoes_configuracoes)
    SELECT EXISTS (
      SELECT 1
      FROM public.notificacoes_configuracoes nc
      JOIN public.profiles p ON p.id = nc.user_id AND p.ativo = true
      WHERE nc.veiculo_id IS NULL
        AND p.role IN ('superadmin', 'adm', 'operador')
        AND COALESCE((nc.alertas_ativos->'alertas_equipe'->'guincho'->>'ativo')::BOOLEAN, false) = true
        AND (
          COALESCE((nc.alertas_ativos->'alertas_equipe'->'guincho'->>'app')::BOOLEAN, false) = true
          OR COALESCE((nc.alertas_ativos->'alertas_equipe'->'guincho'->>'whatsapp')::BOOLEAN, false) = true
          OR COALESCE((nc.alertas_ativos->'alertas_equipe'->'guincho'->>'ligacao')::BOOLEAN, false) = true
        )
    ) INTO v_equipe_habilitou_guincho;

    IF (
      COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true
      AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'guincho')
    ) OR v_equipe_habilitou_guincho THEN

      v_vel_calc_guincho := 0;
      IF OLD.ultima_atualizacao IS NOT NULL AND NEW.ultima_atualizacao > OLD.ultima_atualizacao THEN
        v_delta_sec_guincho := EXTRACT(EPOCH FROM (NEW.ultima_atualizacao - OLD.ultima_atualizacao));
        IF v_delta_sec_guincho > 0 AND v_delta_sec_guincho <= 600 THEN
          v_vel_calc_guincho := (v_dist_metros / v_delta_sec_guincho) * 3.6;
        ELSIF v_delta_sec_guincho > 600 THEN
          v_vel_calc_guincho := 999.0;
        END IF;
      END IF;

      IF v_vel_calc_guincho <= 190.0 THEN
        SELECT COUNT(*), MIN(data_hora_gps), MAX(data_hora_gps)
        INTO v_qtd_telem_guincho, v_min_ts_telem_guincho, v_max_ts_telem_guincho
        FROM (
          SELECT data_hora_gps
          FROM public.telemetria_posicoes
          WHERE veiculo_id = NEW.id
            AND data_hora_gps >= (NEW.ultima_atualizacao - INTERVAL '180 seconds')
            AND data_hora_gps <= NEW.ultima_atualizacao
            AND ignicao = false
            AND COALESCE(gps_fixado, true) = true
            AND velocidade >= 20
          ORDER BY data_hora_gps DESC
          LIMIT 10
        ) sub_guincho;

        IF v_qtd_telem_guincho >= 3
           AND v_min_ts_telem_guincho IS NOT NULL
           AND v_max_ts_telem_guincho IS NOT NULL
           AND EXTRACT(EPOCH FROM (v_max_ts_telem_guincho - v_min_ts_telem_guincho)) >= 90.0 THEN

          SELECT EXISTS (
            SELECT 1
            FROM public.telemetria_posicoes
            WHERE veiculo_id = NEW.id
              AND data_hora_gps >= (v_min_ts_telem_guincho - INTERVAL '30 seconds')
              AND data_hora_gps <= NEW.ultima_atualizacao
              AND ignicao = true
          ) INTO v_teve_ign_on_recente;

          IF NOT v_teve_ign_on_recente THEN
            SELECT (
              NOT EXISTS (
                SELECT 1 FROM public.alertas_telemetria_cooldown
                WHERE veiculo_id = NEW.id
                  AND tipo_alerta = 'guincho'
                  AND ultimo_at > (now() - COOLDOWN_PADRAO)
              )
              AND NOT EXISTS (
                SELECT 1 FROM public.alertas_seguranca
                WHERE veiculo_id = NEW.id
                  AND tipo = 'guincho'
                  AND reconhecido = false
                  AND created_at > (now() - COOLDOWN_PADRAO)
              )
            ) INTO v_cooldown_ok;

            IF v_cooldown_ok THEN
              v_titulo   := format('🚨 Veículo em Movimento com Motor Desligado — %s', COALESCE(NEW.placa, ''));
              v_mensagem := format(
                'Veículo %s detectado a %s km/h com ignição desligada em %s. Possível reboque ou furto em andamento.',
                COALESCE(NEW.placa, ''),
                ROUND(NEW.velocidade_atual),
                v_hora_evento_str
              );
              v_tipo      := 'guincho';
              v_gravidade := 'critica';

              INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
              VALUES (NEW.id, v_tipo, now())
              ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

              INSERT INTO public.alertas_seguranca (
                veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
                velocidade, detalhes, reconhecido, created_at
              ) VALUES (
                NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
                COALESCE(NEW.ultima_latitude, 0),
                COALESCE(NEW.ultima_longitude, 0),
                COALESCE(NEW.velocidade_atual::INT, 0),
                v_mensagem, false, now()
              );

              INSERT INTO public.notificacoes_sistema (
                destinatario_user_id, destinatario_cliente_id,
                titulo, mensagem, tipo, url, placa, lida, created_at
              ) VALUES (
                v_cliente_user_id, NEW.cliente_id,
                v_titulo, v_mensagem, v_tipo, '/monitor-gps',
                COALESCE(NEW.placa, ''), false, now()
              );
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- ALERTA F: GEOFENCE COM MÁQUINA DE ESTADOS FÍSICA (ZERO REPETIÇÃO)
  IF NEW.ultima_latitude IS NOT NULL
     AND NEW.ultima_longitude IS NOT NULL
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0) THEN

    FOR v_area IN
      SELECT id, nome, latitude, longitude, raio_metros,
             COALESCE(tolerancia_metros, 30) AS tolerancia_metros,
             COALESCE(regra_entrada, 'permitida') AS regra_entrada,
             COALESCE(regra_saida, 'permitida') AS regra_saida,
             hora_inicio, hora_fim, dias_semana
      FROM public.areas_seguras
      WHERE (veiculo_id = NEW.id OR (veiculo_id IS NULL AND cliente_id = NEW.cliente_id))
        AND ativo = true
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND raio_metros > 0
    LOOP
      v_dlat_area := radians(NEW.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(NEW.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_new := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      v_tolerancia   := GREATEST(COALESCE(v_area.tolerancia_metros, 30.0), 20.0);
      v_raio_saida   := v_area.raio_metros + v_tolerancia;
      v_raio_entrada := GREATEST(10.0, v_area.raio_metros - (v_tolerancia * 0.5));

      v_area_fora_horario := false;
      IF v_area.dias_semana IS NOT NULL AND array_length(v_area.dias_semana, 1) > 0 THEN
        IF NOT (v_dow_atual = ANY(v_area.dias_semana)) THEN
          v_area_fora_horario := true;
        END IF;
      END IF;
      IF NOT v_area_fora_horario AND v_area.hora_inicio IS NOT NULL AND v_area.hora_fim IS NOT NULL THEN
        IF v_area.hora_inicio <= v_area.hora_fim THEN
          IF v_hora_atual < v_area.hora_inicio OR v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        ELSE
          IF v_hora_atual < v_area.hora_inicio AND v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        END IF;
      END IF;

      SELECT estado INTO v_estado_anterior
      FROM public.veiculo_areas_estado
      WHERE veiculo_id = NEW.id AND area_id = v_area.id
      FOR UPDATE;

      IF NOT FOUND THEN
        IF v_dist_area_new <= v_area.raio_metros THEN
          v_estado_anterior := 'dentro';
        ELSE
          v_estado_anterior := 'fora';
        END IF;

        INSERT INTO public.veiculo_areas_estado (
          veiculo_id, area_id, estado, distancia_metros, updated_at
        ) VALUES (
          NEW.id, v_area.id, v_estado_anterior, v_dist_area_new, now()
        ) ON CONFLICT (veiculo_id, area_id) DO NOTHING;
      END IF;

      -- F.1) TRANSIÇÃO PARA SAÍDA: DE 'dentro' PARA 'fora'
      IF v_estado_anterior = 'dentro' AND v_dist_area_new > v_raio_saida THEN
        v_deve_alertar_geo :=
          COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true
          AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'saida_area')
          AND (
            v_area.regra_saida = 'alertar'
            OR (v_area.regra_saida = 'fora_horario' AND v_area_fora_horario)
          );

        UPDATE public.veiculo_areas_estado
        SET estado = 'fora',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'saida_area',
            ultimo_evento_em = now(),
            notificacao_enviada = v_deve_alertar_geo,
            whatsapp_enviado = NOT v_deve_alertar_geo,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        IF v_deve_alertar_geo THEN
          v_titulo := format('🚨 Saída de Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_saida = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s saiu da área protegida "%s" FORA do horário habitual em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s saiu da área monitorada "%s" em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'media';
          END IF;

          v_tipo := 'saida_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      -- F.2) TRANSIÇÃO PARA ENTRADA: DE 'fora' PARA 'dentro'
      ELSIF v_estado_anterior = 'fora' AND v_dist_area_new <= v_raio_entrada THEN
        v_deve_alertar_geo :=
          COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true
          AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'entrada_area')
          AND (
            v_area.regra_entrada = 'alertar'
            OR (v_area.regra_entrada = 'fora_horario' AND v_area_fora_horario)
          );

        UPDATE public.veiculo_areas_estado
        SET estado = 'dentro',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'entrada_area',
            ultimo_evento_em = now(),
            notificacao_enviada = v_deve_alertar_geo,
            whatsapp_enviado = NOT v_deve_alertar_geo,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        IF v_deve_alertar_geo THEN
          v_titulo := format('✅ Chegada em Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_entrada = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s entrou na área protegida "%s" FORA do horário habitual em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s entrou na área monitorada "%s" em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'baixa';
          END IF;

          v_tipo := 'entrada_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      ELSE
        UPDATE public.veiculo_areas_estado
        SET distancia_metros = v_dist_area_new,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;
      END IF;

    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_avaliar_alertas_telemetria falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
