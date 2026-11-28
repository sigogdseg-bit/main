# Spec: Refatoração e Adequação Integral de `/dev-modulos seg` Pertinente ao GD Segurança

- **Data:** 2026-11-27
- **Autor / Agente:** Antigravity
- **Status:** `Implementada e Validada (Aguardando Gate 6)`
- **Escopo:** `Frontend` | `Backend / Edge` | `Supabase (DDL/RLS/RPC)`

---

## 0. Mapeamento do Sistema Atual e Correção de Padrão (Discovery)

### Desvios identificados nos módulos atuais frente ao padrão `/dev-modulos seg`

1. **Arquitetura da Central ([CentralSegurancaView.tsx](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/gd-seguranca/src/features/seguranca/components/CentralSegurancaView.tsx)):**
   - Atual: barra de 12 botões numerados (`"Status da Defesa (19)"`, etc.) e rota bloqueando `superadmin_auditor`.
   - Padrão `dev-modulos seg`: **Hub Executivo com Grid de Cards ordenados alfabeticamente (A-Z)** via `localeCompare('pt-BR')`, acesso permitido para `superadmin`, `adm` e `superadmin_auditor` (somente leitura), e botão de retorno ao Hub.
2. **Dados Fixos / Simulados ([segurancaModulosService.ts](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/gd-seguranca/src/features/seguranca/services/segurancaModulosService.ts)):**
   - Atual: `tabelasSegurancaEstendidasDisponiveis = false` desativa consultas reais ao Supabase (`auditoria_seguranca()`, `login_lockouts`, `honeytokens_deception`, `lgpd_solicitacoes`, `seguranca_dlp_config`), retornando listas estáticas (`tabelasCanonicas`, `honeytokensPadrao`, checksums falsos `"sha256:8f41...b29c"` no FIM e `ultimoBackupEm` sempre simulado como hoje).
   - Padrão `dev-modulos seg`: **Zero simulação**. Todos os dados, contagens, políticas RLS, funções `SECURITY DEFINER`, buckets e vetores devem ser apurados dinamicamente via PostgreSQL (`auditoria_seguranca()`) e tabelas reais.
3. **Ajustes Solicitados pelo Usuário:**
   - **Módulo 20 (2FA / MFA TOTP):** **EXCLUÍDO** (não necessário neste sistema).
   - **Módulo 09 (DLP):** **SEM marca d'água** em tela — manter apenas o **ofuscamento automático por perda de foco (blur)** e proteção contra impressão/cópia, configuráveis via `seguranca_dlp_config`.
   - **Somente o pertinente ao GD Segurança:** Zero referências a SIGOVTR (`vistorias`, `rg`, `nome_de_guerra`, `28bpm`); verificação em lote adaptada para **cadeia de logs + `documentos_emitidos`**.

---

## 1. Módulos Cobertos na Central (18 Módulos Pertinentes, Ordenados A-Z)

1. **Análise Comportamental e Volume Atípico (UEBA)** _(01)_ — Últimos 500 logs (`system_activity_logs`), janela recente, limiares `>25` Alto / `>50` Crítico e encerramento de sessão.
2. **Anomalias de Login** _(02)_ — 4 algoritmos reais sobre `system_login_logs` / `login_falhas` (Credential Stuffing `>=3 IPs` em 24h, Força Bruta Focada, Rajada `>=10` em `<60s`, Enumeração).
3. **Auditoria de Segurança** _(03)_ — Snapshot ao vivo de `auditoria_seguranca()` (Tabelas RLS, Políticas `USING`/`WITH CHECK`, Funções `SECURITY DEFINER`, Buckets Storage + explicações acessíveis).
4. **Bloqueios de Login** _(04)_ — `login_lockouts` / `login_falhas` reais com escalonamento (`5/15m, 10/1h, 20/24h`) e desbloqueio auditado.
5. **Cadeia de Custódia dos Logs** _(05)_ — Encadeamento SHA-256 (`seq`, `prev_hash`, `hash`) em `system_activity_logs` + RPC `verificar_cadeia_logs()` e `estado_cadeia_logs()`.
6. **Defesa Proativa (Honeytokens / Deception)** _(06)_ — Consulta real a `honeytokens_deception` + disparo de bloqueio/registro ao tentar conta isca no login.
7. **Dispositivos** _(07)_ — Gestão TOFU real em `dispositivos_autorizados`.
8. **Forçar Atualização em Massa de Dispositivos** _(08)_ — Broadcast Realtime (`system_version_signals`) para limpar cache SW e recarregar PWAs em campo.
9. **Governança de Dados e Proteção de Tela (DLP)** _(09)_ — Blur por perda de foco e anti-print via `seguranca_dlp_config` (**sem marca d'água**).
10. **Governança de Segurança** _(10)_ — Painel normativo LGPD/CPP/Marco Civil do GD Rastreamento + emissão de Laudo PDF.
11. **Integridade do Schema e Gatilhos (FIM)** _(12)_ — Comparação real de checksums SHA-256 sobre `funcoes_security_definer` e `politicas` da RPC `auditoria_seguranca()`.
12. **LGPD — Solicitações** _(13)_ — Gestão real de `lgpd_solicitacoes` (Art. 18) + tramitação auditada.
13. **Log de Ações Administrativas** _(14)_ — Tabela real `admin_audit_logs` com diff `jsonb` antes/depois para ações privilegiadas.
14. **Log do Sistema** _(15)_ — Trilha detalhada de `system_login_logs` e `system_activity_logs`.
15. **Métricas de Segurança** _(16)_ — KPIs executivos reais com cards clicáveis para drill-down.
16. **Monitoramento de Cadastros (Anti-Abuso)** _(17)_ — Detecção de _tempmail_, rajadas de IP e duplicidades protegendo `cadastro-cliente`, `cadastro-instalador`, `cadastro-parceiro` e `cadastro-locatario`.
17. **Status de Defesa Cibernética** _(19)_ — Semáforo com polling de **30s** enquanto ativo, Matriz de Risco ponderada real e Catálogo de Vetores avaliados dinamicamente (sem MFA/marca d'água).
18. **Verificação em Lote** _(21)_ — Validação paralela da Cadeia SHA-256 dos logs + SHA-256 de `documentos_emitidos` com laudo conjunto em PDF.

---

## 2. Plano de Execução em Etapas

- [ ] **Etapa 1 — Banco de Dados (`supabase/migrations/20261127220000_hunter_seg_suite_completa.sql` + `APLICAR_NO_SQL_EDITOR_SUPABASE.sql`):**
  - Adicionar `seq`, `prev_hash`, `hash` + trigger SHA-256 em `system_activity_logs` (backfill seguro dos 29 registros atuais) e RPCs `verificar_cadeia_logs()` / `estado_cadeia_logs()`.
  - Criar `login_falhas` + RPCs `login_esta_bloqueado`, `listar_bloqueios_ativos`, `admin_desbloquear_login` (integradas a `login_lockouts` e `profiles.role IN ('superadmin', 'adm')`).
  - Criar `admin_audit_logs`, `cadastro_monitoramento_eventos` e `system_version_signals` com RLS estrito e `GRANT` explícito.
  - Atualizar `auditoria_seguranca()` para incluir contagem de `admin_audit_logs`, estado da cadeia de logs e checagem de `superadmin_auditor` em leitura.
  - Finalizar com `NOTIFY pgrst, 'reload schema';`.

- [ ] **Etapa 2 — Camada de Serviços e Proteções (`segurancaModulosService.ts`, `protecoes-ataques.ts`, `avaliar-vetores.ts`, `DlpWatermark.tsx`, `AppShell.tsx`):**
  - Refatorar `segurancaModulosService.ts` eliminando `tabelasSegurancaEstendidasDisponiveis = false` e todo dado fixo/simulado.
  - Ajustar `DlpWatermark.tsx` para operar sem marca d'água (somente blur por perda de foco + anti-print).
  - Atualizar `protecoes-ataques.ts` e `avaliar-vetores.ts` removendo referências a MFA/marca d'água e avaliando controles reais do sistema.
  - Conectar listener Realtime de `system_version_signals` no `AppShell.tsx` e detecção anti-abuso nas rotas de cadastro público.

- [ ] **Etapa 3 — Refatoração da Interface (`CentralSegurancaView.tsx` + subcomponentes por módulo + rota `_authenticated.configuracao.central-seguranca.tsx`):**
  - Substituir a barra atual pelo **Hub Executivo A-Z** de 18 cards com navegação limpa para cada módulo, mantendo o design system Neumórfico/Tático do projeto, filtros bidirecionais, `ModalPortal`, zero `&`, polling de 30s somente na visão de Status (19), e modo leitura para `superadmin_auditor`.

- [ ] **Etapa 4 — Testes Automatizados e Gates (`hunter-dev-modulos-seg-suite.test.ts`):**
  - Atualizar e expandir testes para cobrir os 18 módulos, ausência de dados fixos/simulados, ausência de marca d'água e ausência de `&`.
  - Rodar `npx tsc --noEmit && npm run format && npm test && npm run build`.

---

## 3. Fronteiras

- **Sempre:** Zero simulação, zero `&` na UI, zero SIGOVTR, `NOTIFY pgrst, 'reload schema';`.
- **Perguntar antes:** Aplicação da migration no Supabase e Gate 6 (`npm run release`).
- **Nunca:** Implementar Módulo 20 (MFA/2FA) ou renderizar marca d'água em tela.
