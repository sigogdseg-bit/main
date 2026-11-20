-- ==============================================================================
-- HUNTER-GUARDIAN: Correção Definitiva de Recursão Infinita em RLS de 'instalacoes' e 'clientes'
-- Migration: 20261120180000_hunter_fix_definitivo_rls_recursao_clientes_instalacoes.sql
-- ==============================================================================

-- 1. Helper Function SECURITY DEFINER em PL/pgSQL (impede inlining pelo query planner)
CREATE OR REPLACE FUNCTION public.check_instalacao_pertence_cliente(p_cliente_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  IF p_cliente_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = p_user_id
  ) INTO v_exists;
  RETURN COALESCE(v_exists, FALSE);
END;
$$;

-- 2. Helper Function SECURITY DEFINER em PL/pgSQL para verificar ordens de instaladores
CREATE OR REPLACE FUNCTION public.check_instalador_possui_ordem_cliente(p_cliente_id UUID, p_instalador_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  IF p_cliente_id IS NULL OR p_instalador_id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.instalacoes WHERE cliente_id = p_cliente_id AND instalador_id = p_instalador_id
  ) INTO v_exists;
  RETURN COALESCE(v_exists, FALSE);
END;
$$;

-- 3. Atualizar política em public.instalacoes
DROP POLICY IF EXISTS "Clientes visualizam suas proprias ordens de instalacao" ON public.instalacoes;
DROP POLICY IF EXISTS "Clientes visualizam ordens de instalacao de seus veiculos" ON public.instalacoes;

CREATE POLICY "Clientes visualizam suas proprias ordens de instalacao"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  cliente_user_id = auth.uid()
  OR cliente_id = auth.uid()
  OR public.check_instalacao_pertence_cliente(cliente_id, auth.uid())
);

-- 4. Atualizar política em public.clientes
DROP POLICY IF EXISTS "Instaladores consultam clientes para instalacao" ON public.clientes;

CREATE POLICY "Instaladores consultam clientes para instalacao"
ON public.clientes FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid())
  OR instalador_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'instalador'))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'instalador')
  OR public.check_instalador_possui_ordem_cliente(public.clientes.id, auth.uid())
);

-- 5. Sincronização de profile.cliente_id para todos os clientes ativos
UPDATE public.profiles p
SET cliente_id = c.id
FROM public.clientes c
WHERE c.user_id = p.id AND (p.cliente_id IS NULL OR p.cliente_id != c.id);

-- 6. Invalidação imediata do Schema Cache PostgREST
NOTIFY pgrst, 'reload schema';
