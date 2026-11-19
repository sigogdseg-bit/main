-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261119170000_hunter_perfil_e_gestao_locatarios_cliente.sql
-- Sistema: GD Rastreamento | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Adicionar valor 'locatario' ao ENUM public.hunter_role.
-- 2. Garantir coluna cliente_id na tabela public.postos_vigilancia.
-- 3. Criar tabela public.locatarios_cliente para subordinação de locatários ao cliente locador.
-- 4. RLS estrito: locatários acessam estritamente veículos autorizados de sua base.
-- 5. RPCs canônicas: cadastrar_locatario, atualizar_locatario, bloquear_locatario, resetar_senha_locatario.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Adicionar papel 'locatario' no ENUM hunter_role (fora de DO block) ────
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'locatario';

-- ── 2. Garantir coluna cliente_id em public.postos_vigilancia ────────────────
ALTER TABLE public.postos_vigilancia
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_postos_vigilancia_cliente_id ON public.postos_vigilancia(cliente_id);

-- ── 3. Criar tabela public.locatarios_cliente ────────────────────────────────
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

-- Garantir colunas granulares caso a tabela já exista
ALTER TABLE public.locatarios_cliente
  ADD COLUMN IF NOT EXISTS pode_bloquear BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.locatarios_cliente
  ADD COLUMN IF NOT EXISTS pode_desbloquear BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_locatarios_cliente_cliente_id ON public.locatarios_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_locatarios_cliente_user_id ON public.locatarios_cliente(user_id);
CREATE INDEX IF NOT EXISTS idx_locatarios_cliente_email ON public.locatarios_cliente(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_locatarios_cliente_convite_token ON public.locatarios_cliente(convite_token);

-- ── 4. RLS em public.locatarios_cliente ──────────────────────────────────────
ALTER TABLE public.locatarios_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locatarios_cliente_select" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_select" ON public.locatarios_cliente
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm', 'operador'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_insert" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_insert" ON public.locatarios_cliente
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_update" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_update" ON public.locatarios_cliente
  FOR UPDATE TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "locatarios_cliente_delete" ON public.locatarios_cliente;
CREATE POLICY "locatarios_cliente_delete" ON public.locatarios_cliente
  FOR DELETE TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.locatarios_cliente TO authenticated, service_role;
GRANT SELECT ON TABLE public.locatarios_cliente TO anon;

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
