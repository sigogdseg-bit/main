-- ============================================================================
-- HUNTER — PERFIL SUPERVISOR E MAPEAMENTO DE RONDAS POR CELULAR (DJR-NEW)
-- Migration: 20261121190000_hunter_perfil_supervisor_e_mapeamento_rondas.sql
-- ============================================================================

-- 1. Adicionar o valor 'supervisor' ao ENUM public.hunter_role
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'supervisor';

-- 2. Adicionar colunas de configuração de supervisão na tabela public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tipo_supervisor TEXT DEFAULT 'geral';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS acesso_veiculos BOOLEAN DEFAULT true;

-- 3. Comentários canônicos de governança
COMMENT ON COLUMN public.profiles.tipo_supervisor IS 'Define se o supervisor atua como geral (veículos e vigilância) ou vigilante (somente vigilância)';
COMMENT ON COLUMN public.profiles.acesso_veiculos IS 'Determina se o supervisor possui acesso telemétrico aos veículos da frota ou apenas aos postos de vigilância';
