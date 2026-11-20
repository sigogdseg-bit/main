-- ============================================================================
-- HUNTER: GARANTIR GRANTS E PERMISSÕES NA TABELA POSTOS_VIGILANCIA
-- Migration: 20261120174500_hunter_postos_vigilancia_grants_e_sync.sql
-- ============================================================================

GRANT ALL ON public.postos_vigilancia TO authenticated, anon, service_role;
GRANT ALL ON public.vigilantes TO authenticated, anon, service_role;
GRANT ALL ON public.rondas_checkpoints TO authenticated, anon, service_role;
GRANT ALL ON public.turnos_vigilancia TO authenticated, anon, service_role;
GRANT ALL ON public.rondas_passagens TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
