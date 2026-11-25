-- Migration: Endurece gatilho de Alerta E (Guincho / Reboque Não Autorizado) contra falsos positivos por GPS Drift ou pacotes LBS sem fixação
-- Exige: ignição desligada contínua, GPS fixado, velocidade >= 20 km/h E deslocamento físico real >= 50 metros.

DO $$
DECLARE
  v_def text;
  v_new_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'hunter_processar_alertas_telemetria'
  LIMIT 1;

  IF v_def IS NOT NULL THEN
    v_new_def := replace(
      v_def,
      'COALESCE(NEW.velocidade_atual, 0) >= 15
       OR (COALESCE(NEW.velocidade_atual, 0) >= 10 AND v_dist_metros >= 35.0)',
      'COALESCE(NEW.gps_fixado, true) = true
       AND COALESCE(NEW.velocidade_atual, 0) >= 20
       AND v_dist_metros >= 50.0'
    );
    IF v_new_def <> v_def THEN
      EXECUTE v_new_def;
    END IF;
  END IF;
END $$;
