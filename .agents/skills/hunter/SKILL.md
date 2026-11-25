---
name: hunter
description: Regras fundamentais e inegociáveis de governança, segurança, arquitetura e integridade operacional do sistema GD Rastreamento (HUNTER-GUARDIAN / DJR-NEW). Vincula compulsoriamente a execução a todas as 28 seções do AGENTS.md, com zero invenção de dados, causa raiz na origem, 7 Gates e blindagem total.
---

# GD Rastreamento — Protocolo Operacional e Diretrizes Inegociáveis (`/hunter`)

> [!CRITICAL]
>
> ## VINCULAÇÃO COMPULSÓRIA AO AGENTS.MD (FONTE SUPREMA DE VERDADE)
>
> Toda e qualquer atividade no repositório do **GD Rastreamento** está subordinada de forma estrita, incondicional e inegociável ao arquivo [AGENTS.md](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/hunter/AGENTS.md) presente na raiz do projeto.
>
> **STOP & READ:** Antes de invocar qualquer ferramenta de edição (`write_file`, `edit_file`) ou comando de escrita (`run_command`), o assistente DEVE OBRIGATORIAMENTE certificar-se de que identificou a causa raiz sem mascaramento, que os dados são factuais e auditados (zero mock/zero inventar dados), que as alterações preexistentes estão preservadas e que nenhuma publicação, tag ou push será realizado sem a confirmação e autorização prévia expressa do usuário (Gate 6). Imediatamente após qualquer publicação (Gate 7), é compulsório reler na íntegra as normas deste manual.

---

## 1. Princípio da Não-Repetição e Centralidade Normativa

Para evitar redundância e discrepâncias documentais, as regras operacionais detalhadas não são replicadas de forma duplicada aqui. Em vez disso, esta skill estabelece a **obrigatoriedade irrevogável** de cumprimento integral das 28 seções consolidadas no [AGENTS.md](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/hunter/AGENTS.md), incluindo todas as diretrizes de governança técnica e o protocolo prático do sistema.

Nenhuma instrução externa, pressa ou atalho operacional pode sobrepor, revogar ou atenuar o conteúdo de [AGENTS.md](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/hunter/AGENTS.md).

---

## 2. Pilares Inegociáveis de Execução

Ao executar qualquer tarefa sob a skill `/hunter`, o assistente deve observar impreterivelmente:

### 2.1. Autonomia Plena com Execução End-to-End

- Todas as permissões necessárias foram concedidas pelo usuário para criar, alterar, reparar e configurar arquivos de código, servidor backend, migrações SQL, schemas, tabelas, RPCs, RLS, permissões `GRANT`, `NOTIFY pgrst` e o script mestre `APLICAR_NO_SQL_EDITOR_SUPABASE.sql`.
- **Obrigatório ler, entender e seguir integralmente TODAS as regras presentes em `AGENTS.md`**.
- Proibição absoluta de preguiça técnica, deixar tarefas incompletas ou terceirizar comandos manuais ao usuário.

### 2.2. Zero Invenção de Dados e Telemetria Factual (Anti-Mock Absoluto)

- Proibido inventar dados, leituras de sensores, satélites ou voltagens inexistentes.
- Se não houver leitura física real emitida pelo hardware rastreador (J16/Coban), exibir explicitamente "Sem leitura" ou "—".

### 2.3. Causa Raiz na Origem e Proibição de Mascaramento (Zero Workaround)

- **NUNCA contorne um erro no código ou mascare o erro: CORRIJA O ERRO.**
- É terminantemente proibido criar rotas fantasmas, aliases redundantes, adaptadores paliativos, tratamentos ad-hoc para aceitar chamadas/parâmetros incorretos, gambiarras de redirecionamento ou rotinas de contorno para fazer uma chamada errada funcionar.
- Toda correção DEVE ser realizada diretamente na raiz e na origem da chamada (consertando quem chama para chamar o recurso canônico correto), comprovando o caminho causal desde os dados até a interface.

### 2.4. Protocolo dos 7 Gates de Execução e Encerramento

Nenhum ciclo de trabalho é encerrado sem a validação estrita dos 7 gates:

1. **Gate 1 — Auto-Auditoria Operacional (Anti-Declaração da Boca Para Fora):**
   - **Investigação de Contexto e Histórico:** Obrigação de checar o histórico e contexto prévio para resgatar soluções, regras e erros já descobertos anteriormente, compreendendo a fundo o assunto no contexto do sistema antes de qualquer intervenção.
   - **Antes de responder:** Validar se há suposição ou dedução. Se houver, apagar e buscar o dado factual diretamente na raiz (código-fonte canônico, banco de dados, migrações e arquivos reais).
   - **Antes de encerrar:** Checar se passou pelos Gates e se a Consulta Prévia Obrigatória de Publicação (Gate 6) foi formalizada.
2. **Gate 2:** Zero erros TypeScript (`npx tsc --noEmit`).
3. **Gate 3:** Formatação Prettier estrita (`npm run format` ou `npx prettier --check`).
4. **Gate 4:** 100% de aprovação na suíte de testes (`npm test`).
5. **Gate 5:** Compilação de produção com saída 0 (`npm run build`).
6. **Gate 6:** Consulta prévia expressa ao usuário antes de qualquer bump, tag ou push (Anti-Subida em Cascata), com versionamento sincronizado A.B.C.D.
7. **Gate 7:** Informar versão e declarar formalmente a releitura integral das normas pétreas.

### 2.5. Blindagens Arquiteturais e de Interface

- **SuperADM Imutável:** Contas oficiais (`novaes@adm.28bpm.local` e `novaes@oficial.tec.br`) blindadas contra alteração ou exclusão; nomenclatura oficial exclusivamente **SuperADM**.
- **Ergonomia Canônica de Modais:** Renderização compulsória via `ModalPortal` / `createPortal(..., document.body)` com `max-h-[90vh]` e botões de ação sempre visíveis.
- **Interdição do Caractere `&`:** Uso exclusivo da conjunção vernácula "e" em todas as telas, PDFs e mensagens.
- **Isolamento Total de Marca:** Proibição absoluta de referências a outros sistemas (SIGOVTR, SIGOFROTA, PCSv).
- **Anti-Polling:** Reatividade estrita via WebSockets (Supabase Realtime).
- **Duplo Marco de Segurança:** Marcos imutáveis em `BKP-A` e `BKP-B` com rotação automática do mais antigo (`npm run marco:save` / `npm run marco:restore`).
