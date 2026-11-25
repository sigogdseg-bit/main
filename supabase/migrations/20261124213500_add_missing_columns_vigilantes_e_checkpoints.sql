-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — COLUNAS FALTANTES EM rondas_checkpoints E vigilantes
-- Migration: 20261124213500_add_missing_columns_vigilantes_e_checkpoints.sql
-- ==============================================================================

ALTER TABLE public.rondas_checkpoints ADD COLUMN IF NOT EXISTS tempo_deslocamento_minutos INTEGER;
ALTER TABLE public.rondas_checkpoints ADD COLUMN IF NOT EXISTS distancia_metros DOUBLE PRECISION;

ALTER TABLE public.vigilantes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.vigilantes ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
