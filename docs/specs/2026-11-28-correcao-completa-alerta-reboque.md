# Spec: Correção Completa do Alerta de Reboque (Guincho), Telemetria G900L e Despacho Configurável

- **Data:** 2026-11-28
- **Autor / Agente:** Antigravity
- **Status:** `Concluída`
- **Escopo:** `Frontend` | `Backend / Edge` | `Supabase (DDL/RLS/RPC)` | `Gateway TCP`

---

## 0. Mapeamento do Sistema Atual (Discovery Obrigatório)

- **Arquivos e módulos existentes afetados:**
  - `deploy/hunter-gateway/src/hunter-gps-gateway.ts`
  - `supabase/migrations/20261128103000_hunter_fix_completo_alerta_reboque_e_push.sql`
  - `supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql`
  - `src/features/monitor-gps/components/GpsMonitorView.tsx`
  - `src/server.ts`
- **Banco de dados (funções/triggers em produção):**
  - `public.disparar_push_vapid_ao_inserir_notificacao()`
  - `public.cron_disparar_relatorio_gerencial()`
  - `public.hunter_atualizar_veiculo_pos_telemetria()`
  - `public.trigger_avaliar_alertas_telemetria()`
  - `public.registrar_posicao_gps_com_odometro(...)`
- **Testes automatizados existentes relacionados:**
  - `src/test/__tests__/hunter-guincho-audit-definitivo.test.ts`
  - `src/test/__tests__/hunter-estacionado-drift-e-laudo-verificacao.test.ts`

---

## 1. Objetivo e Premissas (_Assumptions_)

**Objetivo:** Eliminar falsos positivos de reboque (`guincho`) em veículos com pós-chave (fio laranja) conectado, blindar a fila de posições contra descarga histórica em buffer fora de ordem, corrigir o despacho quebrado de Push/WhatsApp (`sigoguardiao.oficial.tec.br` -> `gd.oficial.tec.br`) e assegurar que **somente** os destinatários e canais configurados no sistema (`regras_veiculo` + `notificacoes_configuracoes`) recebam alertas — zero destinatários fixos em código.

**Premissas assumidas:**

1. Todos os veículos ativos (`LLX1E37`, `KVP6G73`, `RNM1B70`, `RFO6I08`) estão com fio pós-chave conectado ao laranja (`ACC`).
2. Padrão inicial de entrega é o cliente titular (conforme `regras_veiculo`), porém as configurações de cada veículo (`regras_veiculo`) e da equipe (`notificacoes_configuracoes.alertas_equipe`) determinam quem recebe e por qual canal (`app`, `whatsapp`, `ligacao`).

**Fora de escopo:**

- Regravação de firmware físico nos módulos `G900L`.

---

## 2. Contratos e Critérios de Aceite (Testáveis)

- [ ] **Cenário válido (Entrega configurável):** Ao gerar alerta `guincho`, `disparar_push_vapid_ao_inserir_notificacao()` chama `https://gd.oficial.tec.br/api/push/disparar` com timeout de `15000 ms`, e `/api/push/disparar` entrega apenas aos destinatários e canais habilitados nas configurações (cliente/adicionais/motoristas em `regras_veiculo` e membros em `notificacoes_configuracoes.alertas_equipe`).
- [ ] **Cenário de partida normal e descarga de buffer:** Pacotes históricos atrasados (`> 180s`) ou rajadas iniciais de `< 90s` antes do próximo heartbeat ACC nunca disparam `guincho` nem retrocedem `veiculos.ultima_atualizacao`.
- [ ] **Alarme `0x09` no Gateway:** Exige `distM !== null && distM >= 50`, `gpsFixado`, `!saltoImpossivel`, `!ignicao`, `velocidade >= 20` e pacote em tempo real (`<= 180s`).

---

## 3. Plano e Tarefas Atômicas

- [x] **Etapa 1 — Migração SQL e Sincronização Mestre:** Corrigir `disparar_push_vapid_ao_inserir_notificacao()`, `cron_disparar_relatorio_gerencial()`, `hunter_atualizar_veiculo_pos_telemetria()` e `trigger_avaliar_alertas_telemetria()`, aplicar no Supabase e espelhar em `APLICAR_NO_SQL_EDITOR_SUPABASE.sql`.
- [x] **Etapa 2 — Gateway TCP (`hunter-gps-gateway.ts`):** Carregar `ignicao_status` ao vincular veículo, isolar pacotes históricos (`0x22` re-upload ou atraso `> 180s`), exigir `distM !== null && distM >= 50` no alarme `0x09`.
- [x] **Etapa 3 — Validação de Destinatários e Testes:** Garantir ausência de destinatários fixos no código para `guincho`, atualizar/criar testes de regressão e validar Gates 2 a 5 (`tsc`, `format`, `test`, `build`).
