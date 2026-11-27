-- ============================================================================
-- HUNTER / GD RASTREAMENTO — CORREÇÃO DEFINITIVA DE TELEMETRIA E ALERTA DE GUINCHO
-- ============================================================================
-- Migration: 20261127153000_hunter_fix_definitivo_guincho_e_telemetria.sql
-- Causas-raiz corrigidas (sem mascaramento):
--   1. A migration 20261125194500 buscava pg_proc.proname = 'hunter_processar_alertas_telemetria',
--      nome inexistente no banco (o trigger real chama-se trigger_avaliar_alertas_telemetria),
--      fazendo com que o SQL antigo (>= 15 km/h ou >= 10 km/h + 35m sem fix GNSS) continuasse ativo.
--   2. registrar_posicao_gps_com_odometro atualizava veiculos.ultima_latitude, ultima_longitude
--      e velocidade_atual mesmo quando v_descartado = TRUE (sem fix GNSS/LBS, fora do Brasil,
--      coordenada zero ou spike GPS), injetando dados inválidos no trigger de telemetria.
--   3. ALERTA E (guincho) em trigger_avaliar_alertas_telemetria() não validava gps_fixado,
--      permitia disparo com v_dist_metros = 0 em leitura única isolada (inclusive desaceleração
--      imediata pós-corte de ignição), não validava teto de teleporte e não checava alertas_seguranca.
--   4. disparar_push_vapid_ao_inserir_notificacao() concatenava a placa duas vezes no título.
-- ============================================================================

-- 1. Atualização de public.registrar_posicao_gps_com_odometro com proteção estrita de posição/velocidade
CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id               UUID,
  p_rastreador_id            UUID             DEFAULT NULL,
  p_latitude                 DOUBLE PRECISION DEFAULT 0.0,
  p_longitude                DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade               NUMERIC          DEFAULT 0,
  p_ignicao                  BOOLEAN          DEFAULT FALSE,
  p_satelites                INT              DEFAULT 0,
  p_rumo                     INT              DEFAULT 0,
  p_data_hora_gps            TIMESTAMPTZ      DEFAULT NOW(),
  p_inclinacao_graus         INT              DEFAULT 0,
  p_vibracao_g               NUMERIC          DEFAULT 0.0,
  p_bateria_veiculo_v        NUMERIC          DEFAULT NULL,
  p_bateria_rastreador_pct   INT              DEFAULT NULL,
  p_bateria_rastreador_status TEXT            DEFAULT NULL,
  p_sinal_gsm                INT              DEFAULT NULL,
  p_gps_fixado               BOOLEAN          DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  -- Constantes WGS-84 oficiais (metros)
  c_a          CONSTANT DOUBLE PRECISION := 6378137.0;
  c_b          CONSTANT DOUBLE PRECISION := 6356752.314245;
  c_e2         CONSTANT DOUBLE PRECISION := 0.00669437999014;
  c_raio_esf   CONSTANT DOUBLE PRECISION := 6371000.0;

  c_gap_max_s  CONSTANT NUMERIC          := 1200.0;
  c_spike_kmh  CONSTANT NUMERIC          := 190.0;
  c_dist_max_m CONSTANT NUMERIC          := 15000.0;
  c_zvu_vel    CONSTANT NUMERIC          := 2.0;

  v_veiculo            RECORD;
  v_ultima_telem       RECORD;
  v_dist_metros        DOUBLE PRECISION := 0.0;
  v_dist_geom          DOUBLE PRECISION := 0.0;
  v_dist_trap_m        DOUBLE PRECISION := 0.0;
  v_dist_haversine_m   DOUBLE PRECISION := 0.0;
  v_dist_taylor_m      DOUBLE PRECISION := 0.0;

  v_delta_km            NUMERIC(12, 4)   := 0.0;
  v_delta_cinematico_m  DOUBLE PRECISION := 0.0;
  v_delta_cinematico_km NUMERIC(12, 4)   := 0.0;
  v_delta_motor_a_km    NUMERIC(12, 4)   := 0.0;
  v_delta_motor_b_km    NUMERIC(12, 4)   := 0.0;
  v_delta_motor_c_km    NUMERIC(12, 4)   := 0.0;

  v_novo_wgs84         NUMERIC(12, 3);
  v_novo_cinematico    NUMERIC(12, 3);
  v_novo_motor_a       NUMERIC(12, 3);
  v_novo_motor_b       NUMERIC(12, 3);
  v_novo_motor_c       NUMERIC(12, 3);
  v_novo_media_7       NUMERIC(12, 3);

  v_novo_horimetro     NUMERIC(12, 4)   := 0.0000;
  v_delta_horas        NUMERIC(12, 4)   := 0.0000;
  v_delta_sec_ign      DOUBLE PRECISION := 0.0;
  v_ign_inicio         TIMESTAMPTZ      := NULL;

  v_status_op                 TEXT;
  v_dlat                      DOUBLE PRECISION;
  v_dlon                      DOUBLE PRECISION;
  v_lat_med_rad               DOUBLE PRECISION;
  v_cos_lat                   DOUBLE PRECISION;
  v_sin_lat                   DOUBLE PRECISION;
  v_w2                        DOUBLE PRECISION;
  v_w                         DOUBLE PRECISION;
  v_m_meridiano               DOUBLE PRECISION;
  v_n_normal                  DOUBLE PRECISION;
  v_delta_sec                 DOUBLE PRECISION := 0.0;
  v_vel_calc_kmh              DOUBLE PRECISION := 0.0;
  v_delta_rumo                INT              := 0;
  v_half_angle_rad            DOUBLE PRECISION;
  v_arc_dist                  DOUBLE PRECISION;
  v_viagem_ativa_id           UUID;
  v_descartado                BOOLEAN          := FALSE;
  v_motivo_descarte           TEXT             := NULL;
  v_bloquear_posicao_veiculo  BOOLEAN          := FALSE;
  v_fusao_aplicada            BOOLEAN          := FALSE;
  v_fator_veiculo             NUMERIC(8, 6)    := 1.000000;

  v_estado_a           TEXT             := 'PARADO_ZVU';
  v_estado_b           TEXT             := 'PARADO_ZVU';
  v_estado_c           TEXT             := 'PARADO_ZVU';
  v_pesos_a            JSONB            := '{"gnssOuArco": 52, "cinematico": 28, "mcuJ16": 20}'::jsonb;
  v_pesos_b            JSONB            := '{"gnssOuArco": 57, "cinematico": 25, "mcuJ16": 18}'::jsonb;
  v_pesos_c            JSONB            := '{"gnssOuArco": 6, "cinematico": 4, "mcuJ16": 90}'::jsonb;
BEGIN
  -- 1. Trava atômica do veículo (inclui velocidade_atual e rumo para preservar se o pacote for inválido)
  SELECT id, ultima_latitude, ultima_longitude, velocidade_atual, rumo,
         odometro_km, odometro_wgs84_km, odometro_cinematico_km,
         odometro_motor_a_km, odometro_motor_b_km, odometro_motor_c_km,
         odometro_motor_media_km, ultima_atualizacao, fator_calibracao_odometro,
         horimetro_horas, tipo_medicao, ignicao_status, ignicao_iniciada_em
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_wgs84      := COALESCE(v_veiculo.odometro_wgs84_km, v_veiculo.odometro_km, 0);
  v_novo_cinematico := COALESCE(v_veiculo.odometro_cinematico_km, v_novo_wgs84);
  v_novo_motor_a    := COALESCE(v_veiculo.odometro_motor_a_km, v_novo_wgs84);
  v_novo_motor_b    := COALESCE(v_veiculo.odometro_motor_b_km, v_novo_wgs84);
  v_novo_motor_c    := COALESCE(v_veiculo.odometro_motor_c_km, v_novo_wgs84);
  v_novo_media_7    := COALESCE(v_veiculo.odometro_motor_media_km, v_veiculo.odometro_km, v_novo_wgs84);

  -- 2. Cálculo do Horímetro de Operação Real em Horas
  v_novo_horimetro := COALESCE(v_veiculo.horimetro_horas, 0.0000);
  v_ign_inicio     := v_veiculo.ignicao_iniciada_em;

  IF COALESCE(p_ignicao, FALSE) = TRUE THEN
    IF COALESCE(v_veiculo.ignicao_status, FALSE) = TRUE AND v_veiculo.ultima_atualizacao IS NOT NULL THEN
      v_delta_sec_ign := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_veiculo.ultima_atualizacao)));
      IF v_delta_sec_ign > 0.0 AND v_delta_sec_ign <= 1800.0 THEN
        v_delta_horas    := (v_delta_sec_ign / 3600.0);
        v_novo_horimetro := ROUND((v_novo_horimetro + v_delta_horas)::NUMERIC, 4);
      END IF;
    ELSE
      v_ign_inicio := p_data_hora_gps;
    END IF;
  ELSE
    IF COALESCE(v_veiculo.ignicao_status, FALSE) = TRUE AND v_veiculo.ultima_atualizacao IS NOT NULL THEN
      v_delta_sec_ign := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_veiculo.ultima_atualizacao)));
      IF v_delta_sec_ign > 0.0 AND v_delta_sec_ign <= 1800.0 THEN
        v_delta_horas    := (v_delta_sec_ign / 3600.0);
        v_novo_horimetro := ROUND((v_novo_horimetro + v_delta_horas)::NUMERIC, 4);
      END IF;
    END IF;
    v_ign_inicio := NULL;
  END IF;

  IF v_veiculo.fator_calibracao_odometro IS NOT NULL
     AND v_veiculo.fator_calibracao_odometro BETWEEN 0.850000 AND 1.150000 THEN
    v_fator_veiculo := v_veiculo.fator_calibracao_odometro;
  ELSE
    v_fator_veiculo := 1.000000;
  END IF;

  -- 3. Validação Estrita de Fix GNSS
  IF NOT COALESCE(p_gps_fixado, TRUE) THEN
    v_descartado               := TRUE;
    v_motivo_descarte          := 'sem_fix_gnss_lbs';
    v_bloquear_posicao_veiculo := TRUE;
  END IF;

  -- 4. Validação Geográfica (Brasil)
  IF NOT v_descartado THEN
    IF p_latitude = 0.0 AND p_longitude = 0.0 THEN
      v_descartado               := TRUE;
      v_motivo_descarte          := 'coordenada_zero';
      v_bloquear_posicao_veiculo := TRUE;
    ELSIF p_latitude NOT BETWEEN -35.0 AND 5.5
       OR p_longitude NOT BETWEEN -74.0 AND -28.0 THEN
      v_descartado               := TRUE;
      v_motivo_descarte          := 'fora_brasil';
      v_bloquear_posicao_veiculo := TRUE;
    END IF;
  END IF;

  -- 5. Cálculos Geodésicos e Motores Paralelos
  IF NOT v_descartado
     AND v_veiculo.ultima_latitude  IS NOT NULL
     AND v_veiculo.ultima_longitude IS NOT NULL
     AND (v_veiculo.ultima_latitude  <> 0.0 OR v_veiculo.ultima_longitude <> 0.0)
  THEN
    v_lat_med_rad := radians((p_latitude + v_veiculo.ultima_latitude) / 2.0);
    v_cos_lat     := cos(v_lat_med_rad);
    v_sin_lat     := sin(v_lat_med_rad);
    v_w2          := 1.0 - (c_e2 * v_sin_lat * v_sin_lat);
    v_w           := sqrt(v_w2);

    v_m_meridiano := (c_a * (1.0 - c_e2)) / (v_w * v_w2);
    v_n_normal    := c_a / v_w;

    v_dlat        := radians(p_latitude  - v_veiculo.ultima_latitude);
    v_dlon        := radians(p_longitude - v_veiculo.ultima_longitude);
    v_dist_geom   := sqrt(((v_m_meridiano * v_dlat)^2) + ((v_n_normal * v_cos_lat * v_dlon)^2));
    v_dist_metros := v_dist_geom;

    v_dist_haversine_m := 2.0 * c_raio_esf * asin(
      sqrt(
        sin(v_dlat / 2.0)^2 +
        cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * (sin(v_dlon / 2.0)^2)
      )
    );

    v_dist_taylor_m := v_dist_geom * 1.00027267;

    SELECT data_hora_gps, velocidade, rumo
    INTO v_ultima_telem
    FROM public.telemetria_posicoes
    WHERE veiculo_id = p_veiculo_id
    ORDER BY data_hora_gps DESC
    LIMIT 1;

    IF v_ultima_telem.data_hora_gps IS NOT NULL THEN
      v_delta_sec := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_ultima_telem.data_hora_gps)));
    ELSE
      v_delta_sec := 60.0;
    END IF;

    IF COALESCE(p_ignicao, TRUE) AND p_velocidade > 0 AND v_delta_sec > 0.5 AND v_delta_sec <= 300.0 THEN
      v_dist_trap_m := ((p_velocidade + COALESCE(v_ultima_telem.velocidade, p_velocidade)) / 7.2) * v_delta_sec;
      IF v_dist_trap_m > 0 AND v_dist_trap_m < c_dist_max_m THEN
        v_delta_cinematico_m  := v_dist_trap_m;
        v_delta_cinematico_km := (v_delta_cinematico_m / 1000.0);
        v_novo_cinematico     := ROUND((v_novo_cinematico + v_delta_cinematico_km)::NUMERIC, 3);
      END IF;
    END IF;

    IF v_delta_sec > c_gap_max_s THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'gap_temporal_' || round(v_delta_sec) || 's';
    ELSIF v_delta_sec > 0.5 THEN
      v_vel_calc_kmh := (v_dist_metros / v_delta_sec) * 3.6;
      IF v_vel_calc_kmh > c_spike_kmh AND (p_velocidade IS NULL OR p_velocidade < 160.0) THEN
        v_descartado               := TRUE;
        v_motivo_descarte          := 'spike_gps_' || round(v_vel_calc_kmh) || 'kmh';
        v_bloquear_posicao_veiculo := TRUE;
      END IF;
    END IF;

    IF NOT v_descartado THEN
      IF NOT COALESCE(p_ignicao, TRUE) THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'estacionado_ign_off';
      ELSIF (p_velocidade IS NULL OR p_velocidade < c_zvu_vel) AND v_dist_metros < 3.5 THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'parado_marcha_lenta';
      ELSIF p_velocidade >= c_zvu_vel AND v_dist_metros < 1.0 THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'micro_jitter_movimento';
      END IF;
    END IF;

    IF NOT v_descartado AND v_dist_metros >= c_dist_max_m THEN
      v_descartado               := TRUE;
      v_motivo_descarte          := 'dist_implausivel_' || round(v_dist_metros) || 'm';
      v_bloquear_posicao_veiculo := TRUE;
    END IF;

    IF NOT v_descartado AND v_delta_sec > 0.5 AND v_delta_sec <= 180.0 AND p_velocidade > 2.5 THEN
      IF v_ultima_telem.rumo IS NOT NULL AND p_rumo IS NOT NULL THEN
        v_delta_rumo := ABS(p_rumo - v_ultima_telem.rumo);
        IF v_delta_rumo > 180 THEN
          v_delta_rumo := 360 - v_delta_rumo;
        END IF;

        IF v_delta_rumo >= 10 THEN
          v_half_angle_rad := radians(v_delta_rumo / 2.0);
          IF sin(v_half_angle_rad) > 0.0001 THEN
            v_arc_dist := (v_dist_geom * v_half_angle_rad) / sin(v_half_angle_rad);
            IF v_arc_dist > v_dist_geom AND v_arc_dist < (v_dist_geom * 1.45) THEN
              v_dist_metros    := v_arc_dist;
              v_fusao_aplicada := TRUE;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF NOT v_descartado AND v_dist_metros > 0.0 THEN
      v_delta_km         := ROUND(((v_dist_metros / 1000.0) * v_fator_veiculo)::NUMERIC, 4);
      v_delta_motor_a_km := v_delta_km;
      v_delta_motor_b_km := ROUND(((v_dist_haversine_m / 1000.0) * v_fator_veiculo)::NUMERIC, 4);
      v_delta_motor_c_km := ROUND(((v_dist_taylor_m / 1000.0) * v_fator_veiculo)::NUMERIC, 4);

      v_novo_wgs84   := ROUND((v_novo_wgs84   + v_delta_km)::NUMERIC, 3);
      v_novo_motor_a := ROUND((v_novo_motor_a + v_delta_motor_a_km)::NUMERIC, 3);
      v_novo_motor_b := ROUND((v_novo_motor_b + v_delta_motor_b_km)::NUMERIC, 3);
      v_novo_motor_c := ROUND((v_novo_motor_c + v_delta_motor_c_km)::NUMERIC, 3);
      v_novo_media_7 := ROUND(((v_novo_wgs84 + v_novo_motor_a + v_novo_motor_b + v_novo_motor_c) / 4.0)::NUMERIC, 3);

      v_estado_a := 'OPERANDO_MOV';
      v_estado_b := 'OPERANDO_MOV';
      v_estado_c := 'OPERANDO_MOV';
    END IF;
  END IF;

  -- 6. Determinação do Status Operacional
  IF v_bloquear_posicao_veiculo THEN
    IF COALESCE(p_ignicao, FALSE) THEN
      v_status_op := 'parado_ligado';
    ELSE
      v_status_op := 'estacionado';
    END IF;
  ELSIF COALESCE(p_velocidade, 0) > 3.0 THEN
    v_status_op := 'em_rota';
  ELSIF COALESCE(p_ignicao, FALSE) THEN
    v_status_op := 'parado_ligado';
  ELSE
    v_status_op := 'estacionado';
  END IF;

  -- Gravação em telemetria_posicoes (somente se não for coordenada zero; mantém flag gps_fixado para auditoria)
  IF (p_latitude <> 0.0 OR p_longitude <> 0.0) AND NOT COALESCE(v_motivo_descarte LIKE 'spike_gps_%', FALSE) AND NOT COALESCE(v_motivo_descarte LIKE 'dist_implausivel_%', FALSE) THEN
    INSERT INTO public.telemetria_posicoes (
      veiculo_id,
      rastreador_id,
      latitude,
      longitude,
      velocidade,
      ignicao,
      satelites,
      rumo,
      data_hora_gps,
      inclinacao_graus,
      vibracao_g,
      bateria_veiculo_v,
      bateria_rastreador_pct,
      bateria_rastreador_status,
      sinal_gsm,
      gps_fixado
    ) VALUES (
      p_veiculo_id,
      p_rastreador_id,
      p_latitude,
      p_longitude,
      p_velocidade,
      p_ignicao,
      p_satelites,
      p_rumo,
      p_data_hora_gps,
      COALESCE(p_inclinacao_graus, 0),
      COALESCE(p_vibracao_g, 0.0),
      p_bateria_veiculo_v,
      p_bateria_rastreador_pct,
      p_bateria_rastreador_status,
      p_sinal_gsm,
      COALESCE(p_gps_fixado, TRUE)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Atualização Atômica no Veículo: NUNCA sobrescreve posição/velocidade com pacote sem fix ou spike descartado
  UPDATE public.veiculos
  SET
    ultima_latitude          = CASE
                                 WHEN v_bloquear_posicao_veiculo
                                      AND v_veiculo.ultima_latitude IS NOT NULL
                                      AND v_veiculo.ultima_latitude <> 0.0
                                 THEN v_veiculo.ultima_latitude
                                 WHEN NOT COALESCE(p_ignicao, TRUE)
                                      AND COALESCE(p_velocidade, 0) <= 2.0
                                      AND v_veiculo.ultima_latitude IS NOT NULL
                                      AND v_veiculo.ultima_latitude <> 0.0
                                 THEN v_veiculo.ultima_latitude
                                 ELSE p_latitude
                               END,
    ultima_longitude         = CASE
                                 WHEN v_bloquear_posicao_veiculo
                                      AND v_veiculo.ultima_longitude IS NOT NULL
                                      AND v_veiculo.ultima_longitude <> 0.0
                                 THEN v_veiculo.ultima_longitude
                                 WHEN NOT COALESCE(p_ignicao, TRUE)
                                      AND COALESCE(p_velocidade, 0) <= 2.0
                                      AND v_veiculo.ultima_longitude IS NOT NULL
                                      AND v_veiculo.ultima_longitude <> 0.0
                                 THEN v_veiculo.ultima_longitude
                                 ELSE p_longitude
                               END,
    velocidade_atual         = CASE
                                 WHEN v_bloquear_posicao_veiculo THEN COALESCE(v_veiculo.velocidade_atual, 0)
                                 ELSE p_velocidade
                               END,
    ignicao_status           = p_ignicao,
    ignicao_iniciada_em      = v_ign_inicio,
    horimetro_horas          = v_novo_horimetro,
    odometro_km              = v_novo_media_7,
    odometro_motor_media_km  = v_novo_media_7,
    odometro_wgs84_km        = v_novo_wgs84,
    odometro_cinematico_km   = v_novo_cinematico,
    odometro_motor_a_km      = v_novo_motor_a,
    odometro_motor_b_km      = v_novo_motor_b,
    odometro_motor_c_km      = v_novo_motor_c,
    odometro_motor_a_pesos   = v_pesos_a,
    odometro_motor_b_pesos   = v_pesos_b,
    odometro_motor_c_pesos   = v_pesos_c,
    odometro_motor_a_estado  = v_estado_a,
    odometro_motor_b_estado  = v_estado_b,
    odometro_motor_c_estado  = v_estado_c,
    satelites                = p_satelites,
    rumo                     = CASE
                                 WHEN v_bloquear_posicao_veiculo THEN COALESCE(v_veiculo.rumo, 0)
                                 ELSE p_rumo
                               END,
    inclinacao_graus         = COALESCE(p_inclinacao_graus, inclinacao_graus),
    vibracao_g               = COALESCE(p_vibracao_g, vibracao_g),
    bateria_veiculo_v        = COALESCE(p_bateria_veiculo_v, bateria_veiculo_v),
    bateria_rastreador_pct   = COALESCE(p_bateria_rastreador_pct, bateria_rastreador_pct),
    bateria_rastreador_status= COALESCE(p_bateria_rastreador_status, bateria_rastreador_status),
    sinal_gsm                = COALESCE(p_sinal_gsm, sinal_gsm),
    gps_fixado               = COALESCE(p_gps_fixado, TRUE),
    status_operacional       = v_status_op,
    ultima_atualizacao       = p_data_hora_gps,
    updated_at               = NOW()
  WHERE id = p_veiculo_id;

  -- 8. Acumulação em Viagem Ativa (viagens_trajetos)
  IF v_delta_km > 0 THEN
    SELECT id INTO v_viagem_ativa_id
    FROM public.viagens_trajetos
    WHERE veiculo_id = p_veiculo_id
      AND status = 'em_andamento'
    LIMIT 1;

    IF v_viagem_ativa_id IS NOT NULL THEN
      UPDATE public.viagens_trajetos
      SET
        km_percorrido  = km_percorrido + v_delta_km,
        updated_at     = NOW()
      WHERE id = v_viagem_ativa_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'novo_odometro', v_novo_media_7,
    'novo_odometro_media_7', v_novo_media_7,
    'novo_odometro_wgs84', v_novo_wgs84,
    'novo_odometro_cinematico', v_novo_cinematico,
    'novo_odometro_motor_a', v_novo_motor_a,
    'novo_odometro_motor_b', v_novo_motor_b,
    'novo_odometro_motor_c', v_novo_motor_c,
    'delta_km', v_delta_km,
    'delta_motor_a_km', v_delta_motor_a_km,
    'delta_motor_b_km', v_delta_motor_b_km,
    'delta_motor_c_km', v_delta_motor_c_km,
    'distancia_metros', v_dist_metros,
    'novo_horimetro', v_novo_horimetro,
    'delta_horas', v_delta_horas,
    'tipo_medicao', COALESCE(v_veiculo.tipo_medicao, 'km'),
    'fusao_aplicada', v_fusao_aplicada,
    'descartado', v_descartado,
    'motivo_descarte', v_motivo_descarte
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated, service_role, anon;

-- 2. Atualização declarativa de public.trigger_avaliar_alertas_telemetria() com ALERTA E blindado
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
  v_teve_ign_on_recente     BOOLEAN := false;

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

  -- ALERTA E: GUINCHO / ARRASTO COM MOTOR DESLIGADO (BLINDADO CONTRA FALSO POSITIVO)
  -- Exige: ignição desligada explicitamente (OLD e NEW = false), GNSS fixado,
  -- velocidade >= 20 km/h, deslocamento físico real >= 50m (e < 15km anti-teleporte),
  -- velocidade geodésica plausível (<= 190 km/h) e >= 2 pacotes consecutivos em telemetria_posicoes.
  IF NEW.ignicao_status = false
     AND OLD.ignicao_status IS FALSE
     AND COALESCE(NEW.gps_fixado, true) = true
     AND COALESCE(NEW.velocidade_atual, 0) >= 20
     AND v_dist_metros >= 50.0
     AND v_dist_metros < 15000.0
     AND COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'guincho') THEN

    v_vel_calc_guincho := 0;
    IF OLD.ultima_atualizacao IS NOT NULL AND NEW.ultima_atualizacao IS NOT NULL AND NEW.ultima_atualizacao > OLD.ultima_atualizacao THEN
      v_delta_sec_guincho := EXTRACT(EPOCH FROM (NEW.ultima_atualizacao - OLD.ultima_atualizacao));
      IF v_delta_sec_guincho > 0 AND v_delta_sec_guincho <= 600 THEN
        v_vel_calc_guincho := (v_dist_metros / v_delta_sec_guincho) * 3.6;
      ELSIF v_delta_sec_guincho > 600 THEN
        v_vel_calc_guincho := 999.0; -- Gap longo não comprova arrasto contínuo
      END IF;
    END IF;

    IF v_vel_calc_guincho <= 190.0 THEN
      SELECT COUNT(*), MIN(data_hora_gps)
      INTO v_qtd_telem_guincho, v_min_ts_telem_guincho
      FROM (
        SELECT data_hora_gps
        FROM public.telemetria_posicoes
        WHERE veiculo_id = NEW.id
          AND data_hora_gps >= (COALESCE(NEW.ultima_atualizacao, now()) - INTERVAL '120 seconds')
          AND ignicao = false
          AND COALESCE(gps_fixado, true) = true
          AND velocidade >= 20
        ORDER BY data_hora_gps DESC
        LIMIT 5
      ) sub_guincho;

      IF v_qtd_telem_guincho >= 2 AND v_min_ts_telem_guincho IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.telemetria_posicoes
          WHERE veiculo_id = NEW.id
            AND data_hora_gps > v_min_ts_telem_guincho
            AND data_hora_gps <= COALESCE(NEW.ultima_atualizacao, now())
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

-- 3. Trigger avalia alterações de posição além de velocidade e ignição (cobre velocidade constante durante reboque)
DROP TRIGGER IF EXISTS trg_hunter_alertas_telemetria ON public.veiculos;
CREATE TRIGGER trg_hunter_alertas_telemetria
AFTER UPDATE OF velocidade_atual, ignicao_status, ultima_latitude, ultima_longitude, ultima_atualizacao
ON public.veiculos
FOR EACH ROW
WHEN (
  (
    OLD.velocidade_atual IS DISTINCT FROM NEW.velocidade_atual
    OR OLD.ignicao_status IS DISTINCT FROM NEW.ignicao_status
    OR OLD.ultima_latitude IS DISTINCT FROM NEW.ultima_latitude
    OR OLD.ultima_longitude IS DISTINCT FROM NEW.ultima_longitude
  )
  AND NEW.cliente_id IS NOT NULL
  AND NEW.ativo = true
)
EXECUTE FUNCTION public.trigger_avaliar_alertas_telemetria();

-- 4. Elimina duplicação de sufixo de placa no Web Push quando o título já contém a placa
CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sigoguardiao.oficial.tec.br/api/push/disparar';
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
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
