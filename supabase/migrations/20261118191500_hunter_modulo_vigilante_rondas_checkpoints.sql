-- ============================================================================
-- HUNTER — MÓDULO VIGILANTE: GESTÃO DE RONDAS, CHECKPOINTS E RASTREAMENTO PESSOAL
-- Migration: 20261118191500_hunter_modulo_vigilante_rondas_checkpoints.sql
-- ============================================================================
-- Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- 1. Cadastro de Vigilantes (Nome, CPF/Documento, Telefone WhatsApp, Matrícula, Status).
-- 2. Cadastro de Postos de Vigilância / Clientes (Propriedade com polígono geodésico).
-- 3. Checkpoints de Ronda azuis (Horário planejado, tolerância estrita de +-3min).
-- 4. Turnos de Trabalho (Vínculo temporal Vigilante + Posto + Rastreador Portátil IMEI).
-- 5. Registro de Passagens e Alertas de Descumprimento de Ronda.
-- ============================================================================

-- 1. Tabela: Vigilantes
CREATE TABLE IF NOT EXISTS public.vigilantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT,
  matricula TEXT,
  telefone TEXT,
  foto_url TEXT,
  turno_padrao TEXT DEFAULT 'noturno', -- diurno, noturno, 12x36
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vigilantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso permitido para usuarios autenticados em vigilantes"
ON public.vigilantes FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Tabela: Postos de Vigilância (Propriedades / Clientes)
CREATE TABLE IF NOT EXISTS public.postos_vigilancia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  endereco TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  raio_metros INTEGER DEFAULT 100,
  perimetro_poligono JSONB DEFAULT NULL, -- GeoJSON dos vértices da propriedade
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.postos_vigilancia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso permitido para usuarios autenticados em postos_vigilancia"
ON public.postos_vigilancia FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Tabela: Checkpoints de Ronda (Pontos Azuis)
CREATE TABLE IF NOT EXISTS public.rondas_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id UUID NOT NULL REFERENCES public.postos_vigilancia(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  horario_previsto TIME NOT NULL, -- Ex: 22:15:00
  tolerancia_minutos INTEGER NOT NULL DEFAULT 3, -- Fixo em 3 min para menos e 3 min para mais
  raio_captura_metros INTEGER NOT NULL DEFAULT 20, -- Distância máxima do ponto para validar presença
  cor_marcador TEXT NOT NULL DEFAULT '#2563eb', -- Marcador em Azul
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rondas_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso permitido para usuarios autenticados em rondas_checkpoints"
ON public.rondas_checkpoints FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Tabela: Turnos de Vigilância (Escala de Serviço)
CREATE TABLE IF NOT EXISTS public.turnos_vigilancia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vigilante_id UUID NOT NULL REFERENCES public.vigilantes(id) ON DELETE CASCADE,
  posto_id UUID NOT NULL REFERENCES public.postos_vigilancia(id) ON DELETE CASCADE,
  rastreador_imei TEXT NOT NULL, -- IMEI do rastreador pessoal portátil em posse no turno
  data_turno DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio TIME NOT NULL DEFAULT '18:00:00',
  hora_fim TIME NOT NULL DEFAULT '06:00:00',
  status TEXT NOT NULL DEFAULT 'em_andamento', -- agendado, em_andamento, concluido, cancelado
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turnos_vigilancia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso permitido para usuarios autenticados em turnos_vigilancia"
ON public.turnos_vigilancia FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Tabela: Registros de Ronda e Verificação de Presença
CREATE TABLE IF NOT EXISTS public.registros_ronda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID REFERENCES public.turnos_vigilancia(id) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL REFERENCES public.rondas_checkpoints(id) ON DELETE CASCADE,
  vigilante_id UUID REFERENCES public.vigilantes(id) ON DELETE SET NULL,
  posto_id UUID REFERENCES public.postos_vigilancia(id) ON DELETE CASCADE,
  data_ronda DATE NOT NULL DEFAULT CURRENT_DATE,
  horario_previsto TIME NOT NULL,
  horario_realizado TIMESTAMPTZ,
  distancia_metros DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, cumprido, descumprido, atrasado
  alerta_disparado BOOLEAN NOT NULL DEFAULT false,
  alerta_whatsapp_enviado BOOLEAN NOT NULL DEFAULT false,
  latitude_capturada DOUBLE PRECISION,
  longitude_capturada DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.registros_ronda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso permitido para usuarios autenticados em registros_ronda"
ON public.registros_ronda FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 6. Adicionar tabelas na publicação do Supabase Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vigilantes;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.postos_vigilancia;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rondas_checkpoints;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.turnos_vigilancia;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registros_ronda;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
