-- ============================================================================
-- HUNTER — HORÍMETRO REAL (REGISTRO IMEDIATO POR IGNIÇÃO/PÓS-CHAVE)
-- E SELEÇÃO DE MÉTRICA PRINCIPAL DO VEÍCULO (KM VS HORÍMETRO)
-- ============================================================================

-- 1. Colunas tipo_medicao, ignicao_iniciada_em e precisão de horimetro_horas
DO $$
BEGIN
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS tipo_medicao TEXT DEFAULT 'km';
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS ignicao_iniciada_em TIMESTAMPTZ DEFAULT NULL;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS horimetro_horas NUMERIC(12, 4) DEFAULT 0.0000;

  -- Constraint para tipo_medicao: estritamente 'km' ou 'horimetro'
  ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS chk_veiculos_tipo_medicao;
  ALTER TABLE public.veiculos ADD CONSTRAINT chk_veiculos_tipo_medicao
    CHECK (tipo_medicao IN ('km', 'horimetro'));

  -- Auto-definir horímetro para máquinas e tratores preexistentes
  UPDATE public.veiculos
  SET tipo_medicao = 'horimetro'
  WHERE tipo_veiculo IN ('maquina', 'trator', 'equipamento')
    AND (tipo_medicao IS NULL OR tipo_medicao = 'km');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. RPC Atômica para o Usuário Alternar a Métrica do Veículo (KM vs Horímetro)
CREATE OR REPLACE FUNCTION public.atualizar_metrica_veiculo(
  p_veiculo_id UUID,
  p_tipo_medicao TEXT,
  p_horimetro_horas NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_medicao TEXT;
  v_final_h NUMERIC(12, 4);
BEGIN
  v_medicao := LOWER(TRIM(p_tipo_medicao));
  IF v_medicao NOT IN ('km', 'horimetro') THEN
    v_medicao := 'km';
  END IF;

  UPDATE public.veiculos
  SET
    tipo_medicao = v_medicao,
    horimetro_horas = CASE
      WHEN p_horimetro_horas IS NOT NULL AND p_horimetro_horas >= 0 THEN ROUND(p_horimetro_horas::NUMERIC, 4)
      ELSE horimetro_horas
    END,
    updated_at = NOW()
  WHERE id = p_veiculo_id
  RETURNING horimetro_horas INTO v_final_h;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'veiculo_id', p_veiculo_id,
    'tipo_medicao', v_medicao,
    'horimetro_horas', v_final_h
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.atualizar_metrica_veiculo(UUID, TEXT, NUMERIC) TO authenticated, service_role, anon;

-- 3. Atualização da RPC atômica registrar_posicao_gps_com_odometro com Horímetro Real
CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id            UUID,
  p_rastreador_id         UUID        DEFAULT NULL,
  p_latitude              DOUBLE PRECISION DEFAULT 0.0,
  p_longitude             DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade            NUMERIC     DEFAULT 0,
  p_ignicao               BOOLEAN     DEFAULT FALSE,
  p_satelites             INT         DEFAULT 0,
  p_rumo                  INT         DEFAULT 0,
  p_data_hora_gps         TIMESTAMPTZ DEFAULT NOW(),
  p_inclinacao_graus      INT         DEFAULT 0,
  p_vibracao_g            NUMERIC     DEFAULT 0.0,
  p_bateria_veiculo_v     NUMERIC     DEFAULT NULL,
  p_bateria_rastreador_pct INT        DEFAULT NULL,
  p_bateria_rastreador_status TEXT    DEFAULT NULL,
  p_sinal_gsm             INT         DEFAULT NULL,
  p_gps_fixado            BOOLEAN     DEFAULT TRUE
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
  c_raio_esf   CONSTANT DOUBLE PRECISION := 6371000.0; -- Haversine puro

  -- Tolerância de gap ampliada para 1200s (20 min) para cobrir folgadamente repouso com HBT 600s
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

  v_delta_km           NUMERIC(12, 4)   := 0.0;
  v_delta_cinematico_m DOUBLE PRECISION := 0.0;
  v_delta_cinematico_km NUMERIC(12, 4)  := 0.0;
  v_delta_motor_a_km   NUMERIC(12, 4)   := 0.0;
  v_delta_motor_b_km   NUMERIC(12, 4)   := 0.0;
  v_delta_motor_c_km   NUMERIC(12, 4)   := 0.0;

  -- Leituras acumuladas dos medidores de KM
  v_novo_wgs84         NUMERIC(12, 3);
  v_novo_cinematico    NUMERIC(12, 3);
  v_novo_motor_a       NUMERIC(12, 3);
  v_novo_motor_b       NUMERIC(12, 3);
  v_novo_motor_c       NUMERIC(12, 3);
  v_novo_media_7       NUMERIC(12, 3);

  -- Horímetro de Operação Real em Horas
  v_novo_horimetro     NUMERIC(12, 4)   := 0.0000;
  v_delta_horas        NUMERIC(12, 4)   := 0.0000;
  v_delta_sec_ign      DOUBLE PRECISION := 0.0;
  v_ign_inicio         TIMESTAMPTZ      := NULL;

  v_status_op          TEXT;
  v_dlat               DOUBLE PRECISION;
  v_dlon               DOUBLE PRECISION;
  v_lat_med_rad        DOUBLE PRECISION;
  v_cos_lat            DOUBLE PRECISION;
  v_sin_lat            DOUBLE PRECISION;
  v_w2                 DOUBLE PRECISION;
  v_w                  DOUBLE PRECISION;
  v_m_meridiano        DOUBLE PRECISION;
  v_n_normal           DOUBLE PRECISION;
  v_delta_sec          DOUBLE PRECISION := 0.0;
  v_vel_calc_kmh       DOUBLE PRECISION := 0.0;
  v_delta_rumo         INT              := 0;
  v_half_angle_rad     DOUBLE PRECISION;
  v_arc_dist           DOUBLE PRECISION;
  v_limiar_m           NUMERIC;
  v_viagem_ativa_id    UUID;
  v_descartado         BOOLEAN          := FALSE;
  v_motivo_descarte    TEXT             := NULL;
  v_fusao_aplicada     BOOLEAN          := FALSE;
  v_fator_veiculo      NUMERIC(8, 6)    := 1.000000;

  -- Estados ZVU dos motores
  v_estado_a           TEXT             := 'PARADO_ZVU';
  v_estado_b           TEXT             := 'PARADO_ZVU';
  v_estado_c           TEXT             := 'PARADO_ZVU';
  v_pesos_a            JSONB            := '{"gnssOuArco": 52, "cinematico": 28, "mcuJ16": 20}'::jsonb;
  v_pesos_b            JSONB            := '{"gnssOuArco": 57, "cinematico": 25, "mcuJ16": 18}'::jsonb;
  v_pesos_c            JSONB            := '{"gnssOuArco": 6, "cinematico": 4, "mcuJ16": 90}'::jsonb;
BEGIN
  -- ── 1. Trava atômica do veículo ──────────────────────────────────────────
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, odometro_wgs84_km,
         odometro_cinematico_km, odometro_motor_a_km, odometro_motor_b_km, odometro_motor_c_km,
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

  -- ── 2. Cálculo Atômico e Imediato do Horímetro de Operação ────────────────
  -- Registra sempre a hora de forma imediata à ligação da chave até o desligamento
  v_novo_horimetro := COALESCE(v_veiculo.horimetro_horas, 0.0000);
  v_ign_inicio     := v_veiculo.ignicao_iniciada_em;

  IF COALESCE(p_ignicao, FALSE) = TRUE THEN
    IF COALESCE(v_veiculo.ignicao_status, FALSE) = TRUE AND v_veiculo.ultima_atualizacao IS NOT NULL THEN
      -- Chave segue ligada: calcula intervalo desde o último pacote transmitido
      v_delta_sec_ign := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_veiculo.ultima_atualizacao)));
      -- Tolerância de até 1800s (30min) por transmissão ativa
      IF v_delta_sec_ign > 0.0 AND v_delta_sec_ign <= 1800.0 THEN
        v_delta_horas    := (v_delta_sec_ign / 3600.0);
        v_novo_horimetro := ROUND((v_novo_horimetro + v_delta_horas)::NUMERIC, 4);
      END IF;
    ELSE
      -- A chave acabou de ser ligada neste instante!
      v_ign_inicio := p_data_hora_gps;
    END IF;
  ELSE
    -- Chave desligada neste pacote
    IF COALESCE(v_veiculo.ignicao_status, FALSE) = TRUE AND v_veiculo.ultima_atualizacao IS NOT NULL THEN
      -- Chave estava ligada no pacote anterior: acumula a fração final até desligar
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

  -- ── 3. Validação Estrita de Fix GNSS ──────────────────────────────────────
  IF NOT COALESCE(p_gps_fixado, TRUE) THEN
    v_descartado      := TRUE;
    v_motivo_descarte := 'sem_fix_gnss_lbs';
  END IF;

  -- ── 4. Validação Geográfica (Brasil) ──────────────────────────────────────
  IF NOT v_descartado THEN
    IF p_latitude = 0.0 AND p_longitude = 0.0 THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'coordenada_zero';
    ELSIF p_latitude NOT BETWEEN -35.0 AND 5.5
       OR p_longitude NOT BETWEEN -74.0 AND -28.0 THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'fora_brasil';
    END IF;
  END IF;

  -- ── 5. Cálculos Geodésicos e Motores Paralelos ────────────────────────────
  IF NOT v_descartado
     AND v_veiculo.ultima_latitude  IS NOT NULL
     AND v_veiculo.ultima_longitude IS NOT NULL
     AND (v_veiculo.ultima_latitude  <> 0.0 OR v_veiculo.ultima_longitude <> 0.0)
  THEN
    -- 5a. Métrica Diferencial Elipsoidal Gauss/WGS-84 de Alta Precisão (Motor 1)
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

    -- 5b. Métrica Haversine Esférico Puro (Motor B)
    v_dist_haversine_m := 2.0 * c_raio_esf * asin(
      sqrt(
        sin(v_dlat / 2.0)^2 +
        cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * (sin(v_dlon / 2.0)^2)
      )
    );

    -- 5c. Métrica Taylor 4ª Ordem (Motor C - EKF)
    v_dist_taylor_m := v_dist_geom * 1.00027267;

    -- Intervalo temporal real (Δt)
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

    -- Medição Cinemática (Motor 2)
    IF COALESCE(p_ignicao, TRUE) AND p_velocidade > 0 AND v_delta_sec > 0.5 AND v_delta_sec <= 300.0 THEN
      v_dist_trap_m := ((p_velocidade + COALESCE(v_ultima_telem.velocidade, p_velocidade)) / 7.2) * v_delta_sec;
      IF v_dist_trap_m > 0 AND v_dist_trap_m < c_dist_max_m THEN
        v_delta_cinematico_m  := v_dist_trap_m;
        v_delta_cinematico_km := (v_delta_cinematico_m / 1000.0);
        v_novo_cinematico     := ROUND((v_novo_cinematico + v_delta_cinematico_km)::NUMERIC, 3);
      END IF;
    END IF;

    -- Filtro de Gaps Temporais Anômalos (> 1200s)
    IF v_delta_sec > c_gap_max_s THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'gap_temporal_' || round(v_delta_sec) || 's';

    -- Spike Geodésico
    ELSIF v_delta_sec > 0.5 THEN
      v_vel_calc_kmh := (v_dist_metros / v_delta_sec) * 3.6;
      IF v_vel_calc_kmh > c_spike_kmh AND (p_velocidade IS NULL OR p_velocidade < 160.0) THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'spike_gps_' || round(v_vel_calc_kmh) || 'kmh';
      END IF;
    END IF;

    -- Zero-Velocity Update (ZVU)
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
      v_descartado      := TRUE;
      v_motivo_descarte := 'dist_implausivel_' || round(v_dist_metros) || 'm';
    END IF;

    -- Fusão em Curvas para Motor 1 e Motor A
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

    -- Acumulação dos Motores Paralelos com Fator de Calibração
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

  -- ── 6. Determinação do Status Operacional ──────────────────────────────────
  IF COALESCE(p_velocidade, 0) > 3.0 THEN
    v_status_op := 'em_rota';
  ELSIF COALESCE(p_ignicao, FALSE) THEN
    v_status_op := 'parado_ligado';
  ELSE
    v_status_op := 'estacionado';
  END IF;

  -- Gravação em telemetria_posicoes
  IF p_latitude <> 0.0 OR p_longitude <> 0.0 THEN
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

  -- ── 7. Atualização Atômica no Veículo ──────────────────────────────────────
  UPDATE public.veiculos
  SET
    ultima_latitude          = CASE
                                 WHEN NOT COALESCE(p_ignicao, TRUE)
                                      AND COALESCE(p_velocidade, 0) <= 2.0
                                      AND v_veiculo.ultima_latitude IS NOT NULL
                                      AND v_veiculo.ultima_latitude <> 0.0
                                 THEN v_veiculo.ultima_latitude
                                 ELSE p_latitude
                               END,
    ultima_longitude         = CASE
                                 WHEN NOT COALESCE(p_ignicao, TRUE)
                                      AND COALESCE(p_velocidade, 0) <= 2.0
                                      AND v_veiculo.ultima_longitude IS NOT NULL
                                      AND v_veiculo.ultima_longitude <> 0.0
                                 THEN v_veiculo.ultima_longitude
                                 ELSE p_longitude
                               END,
    velocidade_atual         = p_velocidade,
    ignicao_status           = p_ignicao,
    ignicao_iniciada_em      = v_ign_inicio,
    horimetro_horas          = v_novo_horimetro,    -- Horímetro Real em Horas
    odometro_km              = v_novo_media_7,      -- Medidor 7: Odômetro Principal do Sistema
    odometro_motor_media_km  = v_novo_media_7,      -- Medidor 7 persistido
    odometro_wgs84_km        = v_novo_wgs84,        -- Medidor 1
    odometro_cinematico_km   = v_novo_cinematico,   -- Medidor 2
    odometro_motor_a_km      = v_novo_motor_a,      -- Medidor 4
    odometro_motor_b_km      = v_novo_motor_b,      -- Medidor 5
    odometro_motor_c_km      = v_novo_motor_c,      -- Medidor 6
    odometro_motor_a_pesos   = v_pesos_a,
    odometro_motor_b_pesos   = v_pesos_b,
    odometro_motor_c_pesos   = v_pesos_c,
    odometro_motor_a_estado  = v_estado_a,
    odometro_motor_b_estado  = v_estado_b,
    odometro_motor_c_estado  = v_estado_c,
    satelites                = p_satelites,
    rumo                     = p_rumo,
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

  -- ── 8. Acumulação em Viagem Ativa (viagens_trajetos) ───────────────────────
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

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
