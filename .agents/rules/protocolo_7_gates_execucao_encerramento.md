# Regra: Protocolo dos 7 Gates de Execução e Encerramento Obrigatórios

> [!CRITICAL]
> Todo e qualquer modelo de IA trabalhando no repositório Hunter (GD Rastreamento) DEVE seguir rigorosamente este protocolo antes de considerar qualquer tarefa finalizada.
> O usuário concede **TODAS AS PERMISSÕES** ao assistente para executar com autonomia total todas as alterações necessárias em qualquer camada do sistema, **inclusive no banco de dados** (PostgreSQL/Supabase), backend, frontend e suíte de testes.

## Diretriz Pétrea de Autonomia e Mudanças no Banco de Dados

- **Permissões Totais Concedidas:** O assistente tem autorização plena para modificar arquivos, criar e rodar testes, compilar e preparar migrations de banco de dados.
- **Execução Integral no Banco de Dados:** Sempre que uma funcionalidade exigir suporte em banco, o assistente DEVE SEMPRE criar as migrations SQL correspondentes (tabelas, colunas, índices, funções RPC, triggers, políticas de RLS e `NOTIFY pgrst`), anexar ao arquivo mestre `supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql` e integrar os serviços do app ponta a ponta sem deixar etapas pendentes para o usuário.

## Os Gates Obrigatórios (Execução Contínua do Gate 0 ao Gate 7)

0. **Gate 0: Leitura, Compreensão e Cumprimento Integral de `AGENTS.md`**
   - Antes de qualquer ação, ler, entender e seguir integralmente TODAS as regras presentes em `AGENTS.md` (incluindo o item 28.1 Anti-Preguiça).
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 1) até concluir o último (Gate 7).

1. **Gate 1: Auto-Auditoria Operacional, Compreensão de Contexto e Aplicação Fiel das Normas Pétreas (Anti-Declaração da Boca Para Fora)**
   - O Gate 1 não é uma frase dita da boca para fora. Ele exige parar e auditar a si mesmo ativamente:
   - **Investigação de Contexto e Histórico:** Obrigação de verificar o histórico e o contexto prévio para resgatar soluções, regras e erros já descobertos anteriormente, compreendendo a fundo o assunto no contexto do sistema antes de intervir.
   - **Antes de responder:** Validar se há suposição ou dedução. Se houver, apagar e buscar o dado factual diretamente na raiz (código-fonte canônico, banco de dados, migrações e arquivos reais).
   - **Antes de encerrar:** Checar se passou pelos Gates e se a Consulta Prévia Obrigatória de Publicação (Gate 6) foi formalizada.
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 2) até concluir o último (Gate 7).

2. **Gate 2: Verificação de Tipos e IDE**
   - Executar `npx tsc --noEmit`. Deve retornar 0 erros de LSP / TypeScript.
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 3) até concluir o último (Gate 7).

3. **Gate 3: Formatação Estrita**
   - Executar `npm run format` (Prettier).
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 4) até concluir o último (Gate 7).

4. **Gate 4: Suíte de Testes Automatizados**
   - Executar `npm test`. Deve obter 100% de aprovação (0 falhas).
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 5) até concluir o último (Gate 7).

5. **Gate 5: Compilação de Produção Local**
   - Executar `npm run build`. Deve concluir com código de saída 0.
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 6) até concluir o último (Gate 7).

6. **Gate 6: Confirmação Prévia, Execução de Mudanças (Inclusive BD), Versão e Push Git**
   - **Consulta Prévia Obrigatória (Anti-Subida em Cascata):** Perguntar explicitamente ao usuário se há mais alterações antes de gerar o bump de versão e tag.
   - **Execução Completa das Mudanças:** Garantir que todas as alterações necessárias (inclusive migrations no banco de dados e testes) estão 100% finalizadas e integradas.
   - A esteira de CI/CD da Cloudflare executa `npm ci` para instalar dependências. Se houver qualquer divergência de versão entre o `package.json` e o `package-lock.json`, o `npm ci` aborta o build da Cloudflare.

   Portanto, a versão **A.B.C.D** DEVE ser atualizada obrigatoriamente e simultaneamente nos seguintes arquivos:
   - `package.json` (`"version": "A.B.C.D"`)
   - `vite.config.ts` (`const APP_VERSION = "A.B.C.D";`)
   - `src/shared/lib/version.ts` (`export const APP_VERSION_NUMERO = "A.B.C.D";`)
   - `src/test/__tests__/hunter-fundacao.test.ts`
   - `src/test/__tests__/hunter-sigoguardiao-dominio-e-compartilhamento.test.ts`
   - **`package-lock.json`**: Executar obrigatoriamente:
     ```bash
     npm install --package-lock-only
     ```
   - **Commit, Tag e Push Explícito**:
     ```bash
     git add .
     git commit -m "tipo(escopo): mensagem descritiva vA.B.C.D"
     git tag -a vA.B.C.D -m "Release vA.B.C.D"
     git push origin main && git push origin vA.B.C.D
     ```
     _(Nota: Não usar `git push --tags` genérico pois tags flutuantes como `ultimo-ponto-de-controle` podem causar rejeição do push. O Ponto de Controle é IMUTÁVEL e nunca é alterado pelo Gate 6)._
   - **Ordem de Continuidade:** Ao finalizar este Gate, execute imediatamente o próximo Gate (Gate 7) até concluir o último.

7. **Gate 7: Comunicação Obrigatória ao Usuário e Declaração de Normas Pétreas**
   - Informar ao usuário a nova versão publicada (ex: `vA.B.C.D`) e declarar expressamente que leu na íntegra as normas pétreas deste sistema novamente, as quais serão rigorosamente seguidas antes de qualquer alteração no próximo prompt.
