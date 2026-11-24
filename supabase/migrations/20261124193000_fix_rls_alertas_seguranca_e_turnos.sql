-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — CORREÇÃO DEFINITIVA RLS (42P17) E TABELAS PENDENTES (404)
-- Migration: 20261124193000_fix_rls_alertas_seguranca_e_turnos.sql
-- ==============================================================================

-- 1. Correção definitiva da recursão infinita (42P17) em public.clientes e public.instalacoes
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

DROP POLICY IF EXISTS "Clientes visualizam suas proprias ordens de instalacao" ON public.instalacoes;
DROP POLICY IF EXISTS "Clientes visualizam ordens de instalacao de seus veiculos" ON public.instalacoes;
CREATE POLICY "Clientes visualizam suas proprias ordens de instalacao"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  cliente_user_id = auth.uid()
  OR cliente_id = auth.uid()
  OR public.check_instalacao_pertence_cliente(cliente_id, auth.uid())
);

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

-- 2. Funções auxiliares SECURITY DEFINER para alertas_seguranca
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

-- 3. Tabela locatarios_cliente (elimina PGRST205 / 404)
CREATE TABLE IF NOT EXISTS public.locatarios_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  cpf_cnpj TEXT,
  veiculos_permitidos UUID[] NOT NULL DEFAULT '{}',
  pode_bloquear BOOLEAN NOT NULL DEFAULT false,
  pode_desbloquear BOOLEAN NOT NULL DEFAULT false,
  pode_bloquear_desbloquear BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  convite_token TEXT UNIQUE,
  convite_expira_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.locatarios_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locatarios_cliente_select" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_select" ON public.locatarios_cliente
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT public.get_cliente_ids_usuario_atual())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm', 'operador'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_insert" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_insert" ON public.locatarios_cliente
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT public.get_cliente_ids_usuario_atual())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_update" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_update" ON public.locatarios_cliente
  FOR UPDATE TO authenticated
  USING (
    cliente_id IN (SELECT public.get_cliente_ids_usuario_atual())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_delete" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_delete" ON public.locatarios_cliente
  FOR DELETE TO authenticated
  USING (
    cliente_id IN (SELECT public.get_cliente_ids_usuario_atual())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.locatarios_cliente TO authenticated, service_role;

-- 4. Tabela turnos_vigilancia (elimina 404 PGRST205)
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

-- 5. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
