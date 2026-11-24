-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — CORREÇÃO DEFINITIVA RLS alertas_seguranca E turnos_vigilancia
-- Migration: 20261124193000_fix_rls_alertas_seguranca_e_turnos.sql
-- ==============================================================================

-- 1. Funções auxiliares SECURITY DEFINER em PL/pgSQL (impede recursão RLS 42P17 -> HTTP 500)
CREATE OR REPLACE FUNCTION public.get_cliente_ids_usuario_atual()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT id FROM public.clientes WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_ids_usuario_atual() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_veiculo_ids_motorista_atual()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
BEGIN
  SELECT public.get_motorista_cliente_id() INTO v_cliente_id;
  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_veiculo_ids_motorista_atual() TO authenticated, service_role;

-- 2. Recriação das políticas RLS de alertas_seguranca sem subqueries recursivas
DROP POLICY IF EXISTS "Alertas visiveis para administradores e operadores" ON public.alertas_seguranca;
CREATE POLICY "Alertas visiveis para administradores e operadores"
ON public.alertas_seguranca FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

DROP POLICY IF EXISTS "Alertas visiveis para o cliente proprietario do veiculo" ON public.alertas_seguranca;
CREATE POLICY "Alertas visiveis para o cliente proprietario do veiculo"
ON public.alertas_seguranca FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT public.get_cliente_ids_usuario_atual())
);

DROP POLICY IF EXISTS "Motoristas registram alertas nos veiculos do seu cliente" ON public.alertas_seguranca;
CREATE POLICY "Motoristas registram alertas nos veiculos do seu cliente"
ON public.alertas_seguranca FOR ALL TO authenticated
USING (
  veiculo_id IN (SELECT public.get_veiculo_ids_motorista_atual())
)
WITH CHECK (
  veiculo_id IN (SELECT public.get_veiculo_ids_motorista_atual())
);

GRANT SELECT, INSERT, UPDATE ON TABLE public.alertas_seguranca TO authenticated, service_role;

-- 3. Garantia da tabela turnos_vigilancia em produção (elimina 404 PGRST205)
CREATE TABLE IF NOT EXISTS public.turnos_vigilancia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vigilante_id UUID,
  posto_id UUID,
  data_turno DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio TEXT NOT NULL DEFAULT '08:00',
  hora_fim TEXT NOT NULL DEFAULT '20:00',
  status TEXT NOT NULL DEFAULT 'agendado',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.turnos_vigilancia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso permitido para usuarios autenticados em turnos_vigilancia" ON public.turnos_vigilancia;
CREATE POLICY "Acesso permitido para usuarios autenticados em turnos_vigilancia"
ON public.turnos_vigilancia FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON TABLE public.turnos_vigilancia TO authenticated, anon, service_role;

-- 4. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
