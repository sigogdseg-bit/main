# Spec: [Nome da Funcionalidade ou Alteração]

- **Data:** YYYY-MM-DD
- **Autor / Agente:** [Nome]
- **Status:** `Rascunho` | `Aprovada` | `Em Implementação` | `Concluída`
- **Escopo:** `Frontend` | `Backend / Edge` | `Supabase (DDL/RLS/RPC)` | `Gateway TCP`

---

## 0. Mapeamento do Sistema Atual (Discovery Obrigatório)

Antes de propor alterações, registrar o estado real observado no código-fonte:

- **Arquivos e módulos existentes afetados:**
  - `src/...`
- **Banco de dados (tabelas, RPCs, RLS, migrations relacionadas):**
  - `supabase/migrations/...`
- **Infraestrutura / Gateways / Workers envolvidos (se aplicável):**
  - `deploy/hunter-gateway/...` | `src/server.ts`
- **Módulo canônico equivalente em `dev-modulos` (se existir):**
  - Ex.: `PIN` / `MSG` / `MODO` / `SEG` / `RASTREADOR`
- **Testes automatizados existentes relacionados:**
  - `src/test/__tests__/hunter-...test.ts`

---

## 1. Objetivo e Premissas (_Assumptions_)

**Objetivo:** [O que estamos construindo/alterando e por quê. Qual problema raiz resolve.]

**Premissas assumidas (corrigir antes de avançar se alguma estiver errada):**

1. [Premissa 1]
2. [Premissa 2]

**Fora de escopo:**

- [O que NÃO será alterado nesta tarefa]

---

## 2. Contratos e Critérios de Aceite (Testáveis)

- [ ] **Cenário válido:** [Comportamento esperado]
- [ ] **Cenário inválido / erro:** [Tratamento esperado sem mascaramento]
- [ ] **Segurança / RLS / Autorização:** [Validação no servidor/banco, se aplicável]
- [ ] **Regressão:** [Fluxos existentes que devem continuar intactos]

---

## 3. Plano e Tarefas Atômicas (Máx. ~5 arquivos por etapa)

- [ ] **Tarefa 1:** [Descrição objetiva]
  - **Arquivos:** `...`
  - **Aceite:** [O que deve ser verdade ao concluir]
  - **Verificação:** `npx tsc --noEmit && npm test` (ou comando específico)

---

## 4. Fronteiras Operacionais

- **Sempre fazer:** Preservar alterações preexistentes, validar causa raiz, rodar `npx tsc --noEmit`, `npm run format`, `npm test`, `npm run build`.
- **Perguntar antes:** Alterações de schema/DDL no Supabase, mudanças em produção/VPS, criação de commit/tag/push (Gate 6).
- **Nunca fazer:** Expor segredos, mascarar erros, inventar dados/mocks em produção, usar `&` na UI ou referências a outros sistemas.

---

## 5. Registro de Validação (Preencher ao Concluir)

- `npx tsc --noEmit`: [Pendente / Passou]
- `npm run format`: [Pendente / Passou]
- `npm test`: [Pendente / Passou — X/X testes]
- `npm run build`: [Pendente / Passou]
- **Desvios ou decisões alteradas durante a execução:** [Nenhum / Descrever]
