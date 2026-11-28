-- ==============================================================================
-- HUNTER — MIGRATION: ADEQUAÇÃO INTEGRAL DEV-MODULOS SEG PERTINENTE (GD SEGURANÇA)
-- Módulos: 03 (Auditoria), 04 (Lockout), 05 (Cadeia SHA-256), 06 (Honeytokens),
-- 08 (Reload em Massa), 12 (FIM real), 14 (Audit Admin), 17 (Anti-Abuso), 21 (Lote)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. MÓDULO 05: CADEIA DE CUSTÓDIA SHA-256 EM public.system_activity_logs
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.system_activity_logs
  ADD COLUMN IF NOT EXISTS chain_seq BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS chain_hash TEXT;

CREATE SEQUENCE IF NOT EXISTS public.system_activity_logs_chain_seq START 1;

CREATE INDEX IF NOT EXISTS idx_system_activity_logs_chain_seq
  ON public.system_activity_logs (chain_seq ASC);

CREATE OR REPLACE FUNCTION public.calcular_hash_cadeia_log(
  p_prev_hash TEXT,
  p_seq BIGINT,
  p_acao TEXT,
  p_detalhe TEXT,
  p_created_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    extensions.digest(
      convert_to(
        COALESCE(p_prev_hash, 'GENESIS') || ':' ||
        COALESCE(p_seq::text, '0') || ':' ||
        COALESCE(p_acao, '') || ':' ||
        COALESCE(p_detalhe, '') || ':' ||
        COALESCE(to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_encadear_system_activity_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev_hash TEXT;
  v_seq BIGINT;
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;

  -- Serializa encadeamento para evitar colisão de prev_hash em escritas concorrentes
  PERFORM pg_advisory_xact_lock(94827105);

  SELECT chain_hash INTO v_prev_hash
    FROM public.system_activity_logs
   WHERE chain_hash IS NOT NULL
   ORDER BY chain_seq DESC NULLS LAST, created_at DESC, id DESC
   LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  v_seq := nextval('public.system_activity_logs_chain_seq');
  NEW.chain_seq := v_seq;
  NEW.prev_hash := v_prev_hash;
  NEW.chain_hash := public.calcular_hash_cadeia_log(
    NEW.prev_hash,
    NEW.chain_seq,
    NEW.acao,
    NEW.detalhe,
    NEW.created_at
  );
  IF NEW.hash_sha256 IS NULL OR NEW.hash_sha256 = '' THEN
    NEW.hash_sha256 := NEW.chain_hash;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_activity_logs_chain ON public.system_activity_logs;
CREATE TRIGGER trg_system_activity_logs_chain
  BEFORE INSERT ON public.system_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_encadear_system_activity_logs();

-- Backfill seguro e ordenado para registros preexistentes sem cadeia
DO $$
DECLARE
  r RECORD;
  v_prev TEXT := 'GENESIS';
  v_seq BIGINT := 0;
  v_max_seq BIGINT := 0;
BEGIN
  SELECT COALESCE(MAX(chain_seq), 0) INTO v_max_seq FROM public.system_activity_logs;
  IF v_max_seq > 0 THEN
    SELECT chain_hash INTO v_prev
      FROM public.system_activity_logs
     WHERE chain_seq = v_max_seq
     LIMIT 1;
    v_seq := v_max_seq;
  END IF;

  FOR r IN
    SELECT id, acao, detalhe, created_at
      FROM public.system_activity_logs
     WHERE chain_hash IS NULL OR chain_seq IS NULL
     ORDER BY created_at ASC, id ASC
  LOOP
    v_seq := v_seq + 1;
    UPDATE public.system_activity_logs
       SET chain_seq = v_seq,
           prev_hash = COALESCE(v_prev, 'GENESIS'),
           chain_hash = public.calcular_hash_cadeia_log(
             COALESCE(v_prev, 'GENESIS'),
             v_seq,
             r.acao,
             r.detalhe,
             r.created_at
           ),
           hash_sha256 = COALESCE(
             NULLIF(hash_sha256, ''),
             public.calcular_hash_cadeia_log(
               COALESCE(v_prev, 'GENESIS'),
               v_seq,
               r.acao,
               r.detalhe,
               r.created_at
             )
           )
     WHERE id = r.id;

    v_prev := public.calcular_hash_cadeia_log(
      COALESCE(v_prev, 'GENESIS'),
      v_seq,
      r.acao,
      r.detalhe,
      r.created_at
    );
  END LOOP;

  IF v_seq > 0 THEN
    PERFORM setval('public.system_activity_logs_chain_seq', v_seq, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.estado_cadeia_logs()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_ultimo_hash TEXT;
  v_ultimo_evento TIMESTAMPTZ;
BEGIN
  SELECT count(*),
         (SELECT chain_hash FROM public.system_activity_logs WHERE chain_hash IS NOT NULL ORDER BY chain_seq DESC LIMIT 1),
         (SELECT created_at FROM public.system_activity_logs ORDER BY chain_seq DESC NULLS LAST, created_at DESC LIMIT 1)
    INTO v_total, v_ultimo_hash, v_ultimo_evento
    FROM public.system_activity_logs;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'ultimo_hash', COALESCE(v_ultimo_hash, 'GENESIS'),
    'ultimo_evento_em', v_ultimo_evento
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verificar_cadeia_logs()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r RECORD;
  v_total BIGINT := 0;
  v_ok BIGINT := 0;
  v_prev_esperado TEXT := 'GENESIS';
  v_hash_esperado TEXT;
  v_quebra JSONB := NULL;
  v_ultimo_hash TEXT := 'GENESIS';
BEGIN
  FOR r IN
    SELECT id, chain_seq, acao, detalhe, created_at, prev_hash, chain_hash
      FROM public.system_activity_logs
     WHERE chain_seq IS NOT NULL
     ORDER BY chain_seq ASC
  LOOP
    v_total := v_total + 1;
    v_hash_esperado := public.calcular_hash_cadeia_log(
      v_prev_esperado,
      r.chain_seq,
      r.acao,
      r.detalhe,
      r.created_at
    );

    IF r.prev_hash IS DISTINCT FROM v_prev_esperado OR r.chain_hash IS DISTINCT FROM v_hash_esperado THEN
      IF v_quebra IS NULL THEN
        v_quebra := jsonb_build_object(
          'chain_seq', r.chain_seq,
          'event_at', r.created_at,
          'acao', r.acao,
          'prev_hash_esperado', v_prev_esperado,
          'prev_hash_registrado', COALESCE(r.prev_hash, ''),
          'hash_esperado', v_hash_esperado,
          'hash_registrado', COALESCE(r.chain_hash, '')
        );
      END IF;
    ELSE
      v_ok := v_ok + 1;
    END IF;

    v_prev_esperado := COALESCE(r.chain_hash, v_hash_esperado);
    v_ultimo_hash := v_prev_esperado;
  END LOOP;

  RETURN jsonb_build_object(
    'verificado_em', NOW(),
    'total', v_total,
    'ok', v_ok,
    'integra', (v_quebra IS NULL),
    'quebra', v_quebra,
    'ultimo_hash', v_ultimo_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.estado_cadeia_logs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verificar_cadeia_logs() TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. MÓDULO 04 & 06: FALHAS DE LOGIN, LOCKOUT PROGRESSIVO E HONEYTOKENS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_falhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identificador TEXT NOT NULL,
  motivo TEXT,
  device_id TEXT,
  user_agent TEXT,
  ip TEXT,
  tentativa_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_falhas_ident_tempo ON public.login_falhas (identificador, tentativa_em DESC);
CREATE INDEX IF NOT EXISTS idx_login_falhas_tempo ON public.login_falhas (tentativa_em DESC);
CREATE INDEX IF NOT EXISTS idx_login_falhas_ip_tempo ON public.login_falhas (ip, tentativa_em DESC);

ALTER TABLE public.login_falhas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.login_falhas TO authenticated;
GRANT ALL ON public.login_falhas TO service_role;

DROP POLICY IF EXISTS "Admins e auditores leem login_falhas" ON public.login_falhas;
CREATE POLICY "Admins e auditores leem login_falhas"
  ON public.login_falhas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role IN ('superadmin', 'adm', 'superadmin_auditor') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

CREATE OR REPLACE FUNCTION public.login_esta_bloqueado(_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ident TEXT;
  v_lock RECORD;
BEGIN
  IF _identificador IS NULL OR length(btrim(_identificador)) = 0 THEN
    RETURN jsonb_build_object('bloqueado', false, 'falhas', 0);
  END IF;

  v_ident := lower(btrim(_identificador));

  SELECT id, chave, falhas_acumuladas, bloqueado_ate, motivo
    INTO v_lock
    FROM public.login_lockouts
   WHERE lower(chave) = v_ident
     AND bloqueado_ate > NOW()
     AND desbloqueado_em IS NULL
   ORDER BY bloqueado_ate DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'bloqueado', true,
      'motivo', v_lock.motivo,
      'falhas', v_lock.falhas_acumuladas,
      'desbloqueio_em', v_lock.bloqueado_ate
    );
  END IF;

  RETURN jsonb_build_object('bloqueado', false, 'falhas', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_falha_login(
  _identificador TEXT,
  _motivo TEXT DEFAULT 'Credenciais inválidas',
  _ip TEXT DEFAULT NULL,
  _device_id TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ident TEXT := lower(btrim(COALESCE(_identificador, 'desconhecido')));
  v_falhas INT := 0;
  v_bloqueado_ate TIMESTAMPTZ := NULL;
  v_honeytoken BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.login_falhas (identificador, motivo, device_id, user_agent, ip, tentativa_em)
  VALUES (v_ident, _motivo, _device_id, _user_agent, _ip, NOW());

  -- Verifica se o identificador é um honeytoken cadastrado
  IF EXISTS (
    SELECT 1 FROM public.honeytokens_deception
     WHERE ativo = TRUE AND lower(identificador) = v_ident
  ) THEN
    v_honeytoken := TRUE;
    UPDATE public.honeytokens_deception
       SET tentativas_acesso = tentativas_acesso + 1,
           ultimo_ip = COALESCE(_ip, ultimo_ip),
           ultimo_acesso = NOW()
     WHERE lower(identificador) = v_ident;

    v_bloqueado_ate := NOW() + INTERVAL '48 hours';
    INSERT INTO public.login_lockouts (chave, tipo, falhas_acumuladas, bloqueado_ate, motivo, desbloqueado_em)
    VALUES (v_ident, 'conta', 99, v_bloqueado_ate, 'Honeytoken acionado (Deception)', NULL)
    ON CONFLICT (chave) DO UPDATE
      SET falhas_acumuladas = public.login_lockouts.falhas_acumuladas + 1,
          bloqueado_ate = EXCLUDED.bloqueado_ate,
          motivo = EXCLUDED.motivo,
          desbloqueado_em = NULL,
          updated_at = NOW();

    RETURN jsonb_build_object('bloqueado', true, 'honeytoken', true, 'bloqueado_ate', v_bloqueado_ate);
  END IF;

  SELECT count(*) INTO v_falhas
    FROM public.login_falhas
   WHERE identificador = v_ident
     AND tentativa_em > NOW() - INTERVAL '24 hours';

  IF v_falhas >= 20 THEN
    v_bloqueado_ate := NOW() + INTERVAL '24 hours';
  ELSIF v_falhas >= 10 THEN
    v_bloqueado_ate := NOW() + INTERVAL '60 minutes';
  ELSIF v_falhas >= 5 THEN
    v_bloqueado_ate := NOW() + INTERVAL '15 minutes';
  END IF;

  IF v_bloqueado_ate IS NOT NULL THEN
    INSERT INTO public.login_lockouts (chave, tipo, falhas_acumuladas, bloqueado_ate, motivo, desbloqueado_em)
    VALUES (v_ident, 'conta', v_falhas, v_bloqueado_ate, COALESCE(_motivo, 'Excesso de falhas de login'), NULL)
    ON CONFLICT (chave) DO UPDATE
      SET falhas_acumuladas = v_falhas,
          bloqueado_ate = EXCLUDED.bloqueado_ate,
          motivo = EXCLUDED.motivo,
          desbloqueado_em = NULL,
          updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'bloqueado', (v_bloqueado_ate IS NOT NULL),
    'honeytoken', false,
    'falhas', v_falhas,
    'bloqueado_ate', v_bloqueado_ate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_esta_bloqueado(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_falha_login(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. MÓDULO 08: FORÇAR ATUALIZAÇÃO EM MASSA DE DISPOSITIVOS (REALTIME)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_version_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  versao_alvo TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT 'Atualização operacional obrigatória',
  emitido_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_version_signals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.system_version_signals TO authenticated, service_role;

DROP POLICY IF EXISTS "Autenticados leem sinais de versao" ON public.system_version_signals;
CREATE POLICY "Autenticados leem sinais de versao"
  ON public.system_version_signals FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins emitem sinais de versao" ON public.system_version_signals;
CREATE POLICY "Admins emitem sinais de versao"
  ON public.system_version_signals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_version_signals;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. MÓDULO 14: LOG DE AÇÕES ADMINISTRATIVAS (IMUTÁVEL)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  admin_nome TEXT,
  acao TEXT NOT NULL,
  tabela_alvo TEXT NOT NULL,
  registro_id TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_acao ON public.admin_audit_logs (acao);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

DROP POLICY IF EXISTS "Admins e auditores leem admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "Admins e auditores leem admin_audit_logs"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role IN ('superadmin', 'adm', 'superadmin_auditor') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

DROP POLICY IF EXISTS "Admins inserem admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "Admins inserem admin_audit_logs"
  ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. MÓDULO 17: MONITORAMENTO DE CADASTROS (ANTI-ABUSO EM ROTAS PÚBLICAS)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cadastro_monitoramento_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota TEXT NOT NULL,
  email TEXT,
  documento TEXT,
  motivo_bloqueio TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'media', -- 'baixa', 'media', 'alta'
  ip_address TEXT,
  detalhes JSONB DEFAULT '{}'::jsonb,
  bloqueado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cad_monit_created ON public.cadastro_monitoramento_eventos (created_at DESC);

ALTER TABLE public.cadastro_monitoramento_eventos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cadastro_monitoramento_eventos TO authenticated;
GRANT ALL ON public.cadastro_monitoramento_eventos TO service_role;

DROP POLICY IF EXISTS "Admins e auditores leem monitoramento cadastros" ON public.cadastro_monitoramento_eventos;
CREATE POLICY "Admins e auditores leem monitoramento cadastros"
  ON public.cadastro_monitoramento_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role IN ('superadmin', 'adm', 'superadmin_auditor') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_evento_cadastro_suspeito(
  _rota TEXT,
  _email TEXT DEFAULT NULL,
  _documento TEXT DEFAULT NULL,
  _motivo_bloqueio TEXT DEFAULT 'Tentativa suspeita em cadastro público',
  _severidade TEXT DEFAULT 'media',
  _detalhes JSONB DEFAULT '{}'::jsonb,
  _bloqueado BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.cadastro_monitoramento_eventos (
    rota, email, documento, motivo_bloqueio, severidade, detalhes, bloqueado, created_at
  )
  VALUES (
    COALESCE(_rota, '/cadastro'),
    NULLIF(lower(btrim(COALESCE(_email, ''))), ''),
    NULLIF(btrim(COALESCE(_documento, '')), ''),
    COALESCE(_motivo_bloqueio, 'Evento suspeito'),
    COALESCE(_severidade, 'media'),
    COALESCE(_detalhes, '{}'::jsonb),
    COALESCE(_bloqueado, TRUE),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_evento_cadastro_suspeito(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. POLÍTICAS DE LEITURA PARA AUDITOR (superadmin_auditor) NAS TABELAS SEG
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditores leem bloqueios de login" ON public.login_lockouts;
CREATE POLICY "Auditores leem bloqueios de login"
  ON public.login_lockouts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'superadmin_auditor'
    )
  );

DROP POLICY IF EXISTS "Auditores leem honeytokens" ON public.honeytokens_deception;
CREATE POLICY "Auditores leem honeytokens"
  ON public.honeytokens_deception FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'superadmin_auditor'
    )
  );

DROP POLICY IF EXISTS "Auditores leem solicitacoes LGPD" ON public.lgpd_solicitacoes;
CREATE POLICY "Auditores leem solicitacoes LGPD"
  ON public.lgpd_solicitacoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'superadmin_auditor'
    )
  );

DROP POLICY IF EXISTS "Auditores leem config DLP" ON public.seguranca_dlp_config;
CREATE POLICY "Auditores leem config DLP"
  ON public.seguranca_dlp_config FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'superadmin_auditor'
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. ATUALIZAÇÃO DA RPC public.auditoria_seguranca() COM CONTAGENS COMPLETAS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auditoria_seguranca()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tabelas jsonb;
  v_policies jsonb;
  v_funcoes jsonb;
  v_buckets jsonb;
  v_contagens jsonb;
  v_cadeia jsonb;
BEGIN
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_uid
       AND (p.role IN ('superadmin', 'adm', 'superadmin_auditor') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  ) THEN
    RAISE EXCEPTION 'Acesso negado à auditoria de segurança' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'tabela', c.relname,
    'rls_habilitado', c.relrowsecurity,
    'rls_forcado', c.relforcerowsecurity,
    'total_politicas', (
      SELECT count(*) FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname
    )
  ) ORDER BY c.relname)
    INTO v_tabelas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r';

  SELECT jsonb_agg(jsonb_build_object(
    'tabela', tablename, 'politica', policyname, 'comando', cmd,
    'permissiva', permissive, 'roles', roles,
    'expressao_usando', qual, 'expressao_verificando', with_check
  ) ORDER BY tablename, policyname)
    INTO v_policies FROM pg_policies WHERE schemaname = 'public';

  SELECT jsonb_agg(jsonb_build_object(
    'funcao', p.proname,
    'security_definer', p.prosecdef,
    'linguagem', l.lanname,
    'retorna', pg_catalog.format_type(p.prorettype, NULL),
    'stable_ou_immutable', CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    'checksum', encode(extensions.digest(convert_to(COALESCE(pg_get_functiondef(p.oid), p.proname), 'UTF8'), 'sha256'), 'hex')
  ) ORDER BY p.proname)
    INTO v_funcoes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.prosecdef = true;

  SELECT jsonb_agg(jsonb_build_object(
    'bucket', id, 'nome', name, 'publico', public, 'criado_em', created_at
  ) ORDER BY name) INTO v_buckets FROM storage.buckets;

  v_cadeia := public.estado_cadeia_logs();

  v_contagens := jsonb_build_object(
    'logins_total', (SELECT count(*) FROM public.system_login_logs),
    'logins_ultimos_30d', (
      SELECT count(*) FROM public.system_login_logs
       WHERE created_at > now() - interval '30 days'
    ),
    'sessoes_abertas_agora', (
      SELECT count(DISTINCT user_id) FROM public.system_login_logs
       WHERE created_at >= now() - interval '3 minutes'
    ),
    'usuarios_multi_sessao_24h', (
      SELECT count(*) FROM (
        SELECT user_id FROM public.system_login_logs
         WHERE created_at > now() - interval '24 hours' AND ip_address IS NOT NULL
         GROUP BY user_id HAVING count(DISTINCT ip_address) > 1
      ) x
    ),
    'atividades_total', (SELECT count(*) FROM public.system_activity_logs),
    'atividades_ultimos_30d', (
      SELECT count(*) FROM public.system_activity_logs
       WHERE created_at > now() - interval '30 days'
    ),
    'cadeia_logs_total', COALESCE((v_cadeia->>'total')::bigint, 0),
    'cadeia_logs_ultimo_hash', COALESCE(v_cadeia->>'ultimo_hash', 'GENESIS'),
    'dispositivos_autorizados', (
      SELECT count(*) FROM public.dispositivos_autorizados WHERE status = 'autorizado'
    ),
    'dispositivos_pendentes', (
      SELECT count(*) FROM public.dispositivos_autorizados WHERE status = 'pendente'
    ),
    'login_falhas_ultima_hora', (
      SELECT count(*) FROM public.system_login_logs
       WHERE status = 'falha' AND created_at > now() - interval '1 hour'
    ),
    'identificadores_bloqueados_agora', (
      SELECT count(*) FROM public.login_lockouts
       WHERE bloqueado_ate > now() AND desbloqueado_em IS NULL
    ),
    'honeytokens_ativos', (
      SELECT count(*) FROM public.honeytokens_deception WHERE ativo = true
    ),
    'honeytokens_disparados', (
      SELECT COALESCE(sum(tentativas_acesso), 0) FROM public.honeytokens_deception
    ),
    'solicitacoes_lgpd_pendentes', (
      SELECT count(*) FROM public.lgpd_solicitacoes WHERE status = 'pendente'
    ),
    'admin_audit_total', (SELECT count(*) FROM public.admin_audit_logs),
    'cadastros_suspeitos_7d', (
      SELECT count(*) FROM public.cadastro_monitoramento_eventos
       WHERE created_at > now() - interval '7 days'
    ),
    'documentos_emitidos_total', (SELECT count(*) FROM public.documentos_emitidos),
    'total_admins', (
      SELECT count(*) FROM public.profiles WHERE role IN ('superadmin', 'adm')
    )
  );

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'tabelas', COALESCE(v_tabelas, '[]'::jsonb),
    'politicas', COALESCE(v_policies, '[]'::jsonb),
    'funcoes_security_definer', COALESCE(v_funcoes, '[]'::jsonb),
    'buckets_storage', COALESCE(v_buckets, '[]'::jsonb),
    'contagens', v_contagens
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.auditoria_seguranca() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
