-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — CRIAÇÃO DA TABELA public.rondas_execucoes (404)
-- Migration: 20261124203000_create_rondas_execucoes.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.rondas_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id UUID NOT NULL REFERENCES public.postos_vigilancia(id) ON DELETE CASCADE,
  vigilante_id UUID REFERENCES public.vigilantes(id) ON DELETE SET NULL,
  turno_id UUID REFERENCES public.turnos_vigilancia(id) ON DELETE SET NULL,
  ciclo_numero INTEGER NOT NULL DEFAULT 1,
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fim TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  checkpoints_executados JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rondas_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso permitido para usuarios autenticados em rondas_execucoes" ON public.rondas_execucoes;
CREATE POLICY "Acesso permitido para usuarios autenticados em rondas_execucoes"
ON public.rondas_execucoes FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rondas_execucoes TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
