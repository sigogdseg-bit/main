# Spec: QR Code de Autenticidade e Registro Forense em Todos os PDFs

- **Data:** 2026-11-27
- **Autor / Agente:** Antigravity
- **Status:** `Rascunho`
- **Escopo:** `Frontend`

---

## 0. Mapeamento do Sistema Atual (Discovery Obrigatório)

- **Arquivos e módulos existentes afetados:**
  - `src/features/seguranca/services/laudoPericialPdfService.ts` (já possui box de certidão com QR Code `SGD-...`, Código, Hash SHA-256 e registro em `documentos_emitidos`)
  - `src/features/clientes/services/contratoPdfService.ts` (possui QR Code de assinatura; verificar se possui box de conferência pública)
  - `src/features/clientes/services/geradorContratoPdfServer.ts`
  - `src/features/financeiro/services/propostaPdfService.ts`
  - `src/features/financeiro/services/financeiroService.ts` (2 geradores: recibo/comprovante e relatório financeiro)
  - `src/features/monitor-gps/components/ModalPlaybackTrajeto.tsx`
  - `src/features/monitor-gps/components/RefazerTrajetoModal.tsx`
  - `src/features/frota/components/FrotaAnalyticsView.tsx`
  - `src/features/clientes/components/ClienteVeiculosAnalyticsModal.tsx`
  - `src/features/chat/services/whatsappAutoMonitoramentoService.ts`
  - `src/shared/lib/comprovantePdfHelper.ts`
- **Banco de dados (tabelas, RPCs, RLS, migrations relacionadas):**
  - `documentos_emitidos` (já existente; consultada por `/api/contratos/verificar` via `hash_sha256`, `metadata->>selo`, `metadata->>codigo`, `metadata->>hash_conteudo`)
- **Testes automatizados existentes relacionados:**
  - `src/test/__tests__/hunter-estacionado-drift-e-laudo-verificacao.test.ts`

---

## 1. Objetivo e Premissas (_Assumptions_)

**Objetivo:** Padronizar que **todo PDF gerado pelo sistema** incorpore a **Certidão de Autenticidade e Custódia Forense** (Selo `SGD-XXXXXXXX`, Código de Verificação de 6 caracteres, Hash SHA-256, link `https://gd.oficial.tec.br/verificar` e **QR Code** escaneável) e seja registrado em `documentos_emitidos` para conferência pública imediata em `/verificar`.

**Premissas assumidas:**

1. Um único helper reutilizável (`src/features/seguranca/services/certidaoPdfHelper.ts`) centralizará a geração de Selo, Código, QR Code, cálculo do hash SHA-256 binário do PDF final, desenho do box com quebra de página automática (suportando `mm` e `pt`) e chamada a `registrarDocumentoEmitido`.
2. Nenhum PDF terá o caractere `&` em textos, labels ou código.
3. Em modo simulação/degustação, o Selo segue o prefixo `SGD-SIM-XXXXXXXX`.

**Fora de escopo:**

- Alterações no backend `/api/contratos/verificar` ou DDL do Supabase (já suportam `documentos_emitidos` por Selo, Código, Hash do arquivo e `hash_conteudo`).

---

## 2. Contratos e Critérios de Aceite (Testáveis)

- [ ] **Cenário válido:** Todo PDF emitido pelos geradores listados contém QR Code apontando para `https://gd.oficial.tec.br/verificar?selo=SGD-...`, Selo, Código, Hash SHA-256 e é registrado em `documentos_emitidos`.
- [ ] **Cenário inválido / erro:** Falha na geração de imagem do QR Code ou no registro remoto nunca quebra o download do PDF para o operador.
- [ ] **Regressão:** `laudoPericialPdfService.ts` e `contratoPdfService.ts` preservam seus contratos e testes existentes.

---

## 3. Plano e Tarefas Atômicas (Máx. ~5 arquivos por etapa)

- [ ] **Etapa 1 — Helper Canônico de Certidão e QR Code:**
  - **Arquivos:** `src/features/seguranca/services/certidaoPdfHelper.ts`
  - **Aceite:** Helper exporta função única que gera Selo/Código/QR Code, aplica o box no final do PDF (com `addPage()` automático se necessário, compatível com `mm` e `pt`) e registra em `documentos_emitidos`.
- [ ] **Etapa 2 — PDFs Comerciais e Financeiros:**
  - **Arquivos:** `src/features/financeiro/services/propostaPdfService.ts`, `src/features/financeiro/services/financeiroService.ts`, `src/shared/lib/comprovantePdfHelper.ts`, `src/features/clientes/services/geradorContratoPdfServer.ts`
  - **Aceite:** Todos aplicam o helper canônico com QR Code antes de salvar/retornar o PDF.
- [ ] **Etapa 3 — PDFs de Frota, Telemetria e WhatsApp:**
  - **Arquivos:** `src/features/monitor-gps/components/ModalPlaybackTrajeto.tsx`, `src/features/monitor-gps/components/RefazerTrajetoModal.tsx`, `src/features/frota/components/FrotaAnalyticsView.tsx`, `src/features/clientes/components/ClienteVeiculosAnalyticsModal.tsx`, `src/features/chat/services/whatsappAutoMonitoramentoService.ts`
  - **Aceite:** Todos aplicam o helper canônico com QR Code antes de salvar/enviar o PDF.
- [ ] **Etapa 4 — Testes e Validação (Gates 2 a 5):**
  - **Arquivos:** `src/test/__tests__/hunter-qrcode-todos-pdfs.test.ts`
  - **Verificação:** `npx tsc --noEmit && npm run format && npm test && npm run build`

---

## 4. Fronteiras Operacionais

- **Sempre:** Usar o helper único `certidaoPdfHelper.ts` sem duplicar desenho de QR Code/box.
- **Nunca:** Inserir `&` nos arquivos ou quebrar a unidade (`mm` vs `pt`) do `jsPDF` chamador.
