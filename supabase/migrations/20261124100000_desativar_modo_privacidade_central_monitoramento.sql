-- ==============================================================================
-- HUNTER-GUARDIAN: Desativação Completa do Modo de Privacidade (Central de Monitoramento 24/7)
-- Migration: 20261124100000_desativar_modo_privacidade_central_monitoramento.sql
-- ==============================================================================

-- 1. Remoção definitiva dos triggers e funções de bloqueio de privacidade que causavam recursão infinita
DROP TRIGGER IF EXISTS trg_blindar_privacidade_clientes ON public.clientes;
DROP TRIGGER IF EXISTS trg_blindar_privacidade_veiculos ON public.veiculos;
DROP TRIGGER IF EXISTS trg_sync_privacidade_cliente_veiculos ON public.clientes;
DROP TRIGGER IF EXISTS trg_herdar_privacidade_cliente_novo_veiculo ON public.veiculos;

DROP FUNCTION IF EXISTS public.fn_blindar_privacidade_superadm();
DROP FUNCTION IF EXISTS public.fn_sync_privacidade_cliente_veiculos();
DROP FUNCTION IF EXISTS public.fn_herdar_privacidade_cliente_novo_veiculo();

-- 2. Atualização de todos os veículos e clientes para privacidade desativada (Central 24/7 sempre monitorada)
UPDATE public.veiculos SET privacidade_localizacao = false WHERE privacidade_localizacao IS DISTINCT FROM false;
UPDATE public.clientes SET privacidade_localizacao = false WHERE privacidade_localizacao IS DISTINCT FROM false;

-- 3. Alteração do valor padrão das colunas para FALSE
ALTER TABLE public.veiculos ALTER COLUMN privacidade_localizacao SET DEFAULT false;
ALTER TABLE public.clientes ALTER COLUMN privacidade_localizacao SET DEFAULT false;

-- 4. Notificação de recarga do cache de schema PostgREST
NOTIFY pgrst, 'reload schema';
