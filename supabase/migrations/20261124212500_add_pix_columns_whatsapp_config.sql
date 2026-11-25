-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — COLUNAS PIX NA TABELA public.whatsapp_config (400)
-- Migration: 20261124212500_add_pix_columns_whatsapp_config.sql
-- ==============================================================================

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS chave_pix TEXT;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS titular_pix TEXT;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS cidade_pix TEXT;

NOTIFY pgrst, 'reload schema';
