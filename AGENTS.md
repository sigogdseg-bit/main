# Regras Globais do Projeto GD Segurança

> [!CRITICAL]
>
> ## PROTOCOLO OBRIGATÓRIO DE TRABALHO E ENCERRAMENTO (GD-SEGURANÇA / DJR-NEW)
>
> **STOP & READ:** É obrigatório **ler, entender e seguir integralmente TODAS as regras presentes neste `AGENTS.md`** (incluindo o item 28.1 Anti-Preguiça: proibição de terceirizar comandos manuais ao usuário ou deixar tarefas incompletas). Antes de invocar qualquer ferramenta de edição ou comando de escrita, o assistente DEVE OBRIGATORIAMENTE certificar-se de que identificou a causa raiz sem mascaramento, que os dados são factuais e auditados (zero mock/zero inventar dados), que as alterações preexistentes estão preservadas e que nenhuma publicação, tag ou push será realizado sem a confirmação e autorização prévia expressa do usuário (Gate 6). Imediatamente após qualquer publicação (Gate 7), é compulsório reler na íntegra as normas deste manual.

---

## 1. PRINCÍPIOS FUNDAMENTAIS

### 1.1. Preservação da integridade do sistema

Toda atividade deve preservar a integridade, a segurança, a rastreabilidade e a continuidade operacional do GD Rastreamento.

Nenhuma tarefa deve provocar alterações fora do escopo solicitado, comprometer dados existentes, enfraquecer controles de acesso ou remover proteções sem autorização expressa.

### 1.2. Autonomia técnica com limites explícitos

O agente pode realizar autonomamente as etapas técnicas necessárias para cumprir uma tarefa autorizada, respeitando os limites estabelecidos pelo usuário.

A autonomia para investigar, planejar, analisar, testar ou implementar uma solução **não equivale a autorização irrestrita para modificar todos os recursos disponíveis**.

A autorização deve ser interpretada de acordo com:

- O objetivo expressamente solicitado.
- Os arquivos, módulos, sistemas e ambientes abrangidos.
- Os efeitos esperados da operação.
- O nível de risco e a reversibilidade da ação.
- As restrições específicas estabelecidas pelo usuário.

A autorização para uma tarefa não deve ser ampliada por inferência para abranger outras tarefas ou recursos.

### 1.3. Nenhuma alteração sem autorização correspondente

Não alterar arquivos, código, banco de dados, infraestrutura, configurações, credenciais, repositórios ou ambientes sem autorização específica compatível com a operação pretendida.

Quando a tarefa estiver limitada a análise, diagnóstico, auditoria, inspeção ou revisão, a execução deverá permanecer nesse limite.

A disponibilidade técnica de uma ferramenta, credencial ou permissão não representa autorização para utilizá-la em qualquer finalidade.

### 1.4. Isolamento dos sistemas e ambientes

Manter o isolamento entre projetos, repositórios, ambientes, bancos de dados, credenciais e recursos operacionais.

Não presumir que autorização concedida para um sistema se estenda a outro.

Não reutilizar configurações, segredos, identificadores ou recursos de outro projeto sem confirmação de que isso é apropriado e autorizado.

### 1.5. Fonte de verdade

Utilizar como referência a implementação efetiva, as configurações existentes, as instruções aplicáveis e os registros disponíveis.

Não inventar campos, tabelas, funções, permissões, rotas, integrações, configurações ou comportamentos.

Quando uma informação não puder ser confirmada, identificá-la como desconhecida, pendente de validação ou hipótese.

---

## 2. CONTRATO DA TAREFA E PLANEJAMENTO

Antes de executar uma tarefa com impacto técnico:

1. Identificar o objetivo e o resultado esperado.
2. Consultar as instruções aplicáveis, incluindo este arquivo e eventuais instruções hierarquicamente superiores.
3. Identificar arquivos, módulos, serviços, banco de dados e ambientes potencialmente envolvidos.
4. Verificar alterações preexistentes que possam ser afetadas.
5. Definir o escopo autorizado e os limites da operação.
6. Avaliar riscos, dependências, compatibilidade e possibilidade de reversão.
7. Estabelecer critérios objetivos de conclusão e validação.

Para tarefas simples e de baixo risco, o planejamento pode ser proporcionalmente reduzido.

Se houver ambiguidade que possa resultar em alteração destrutiva, ampliação de permissões, exposição de dados ou impacto relevante em produção, interromper a etapa de execução e solicitar esclarecimento.

Não expandir silenciosamente o escopo para resolver problemas adicionais encontrados durante a tarefa.

---

## 3. PRESERVAÇÃO DAS ALTERAÇÕES EXISTENTES

Antes de modificar arquivos ou código, verificar o estado atual do ambiente de trabalho.

Preservar integralmente as alterações preexistentes, inclusive aquelas que não tenham sido produzidas pelo agente atual.

É proibido:

- Sobrescrever trabalho preexistente sem autorização.
- Descartar alterações locais para facilitar a implementação.
- Executar restaurações destrutivas sem avaliar os efeitos.
- Substituir arquivos inteiros quando uma alteração localizada for suficiente.
- Remover funcionalidades ou trechos não relacionados ao objetivo solicitado.
- Tratar arquivos modificados como descartáveis apenas porque não foram criados na tarefa atual.

Quando houver conflito entre a implementação necessária e alterações preexistentes, identificar o conflito e escolher uma abordagem que preserve o trabalho existente. Se isso não for possível com segurança, solicitar orientação.

---

## 4. REVISÃO DO GIT E CONTROLE DAS ALTERAÇÕES

Quando o trabalho envolver Git:

1. Examinar `git status` antes e depois das alterações.
2. Examinar `git diff` para identificar precisamente o que mudou.
3. Revisar arquivos novos, modificados, removidos e renomeados.
4. Restringir o staging aos arquivos expressamente relacionados à tarefa.
5. Não incluir alterações preexistentes ou arquivos sensíveis por conveniência.
6. Conferir o conteúdo staged antes de qualquer commit.
7. Não executar `reset --hard`, limpeza destrutiva, rebase, force push ou operações equivalentes sem autorização específica e avaliação dos riscos.

Commit, push, publicação, deploy e outras operações externas são etapas distintas. A autorização para editar código não deve ser interpretada automaticamente como autorização para executar todas essas etapas.

Quando houver exigência de autorização para publicação, respeitá-la mesmo que os testes tenham sido concluídos com sucesso.

---

## 5. AUTORIZAÇÃO CONSISTENTE EM TODAS AS CAMADAS

A autorização deve ser aplicada de forma coerente em todas as camadas relevantes do sistema:

- Interface e componentes visuais.
- Rotas e navegação.
- Camada de aplicação.
- Serviços e lógica de negócio.
- APIs e endpoints.
- Funções de servidor.
- RPCs e procedimentos executados no banco.
- Permissões e políticas de acesso ao banco de dados.

Ocultar um botão ou bloquear uma rota na interface não substitui a autorização no servidor ou no banco de dados.

Não presumir que a autorização existente em uma camada garanta a autorização em todas as demais.

Ao corrigir uma falha de autorização, verificar a cadeia completa de execução e os caminhos alternativos que possam permitir a mesma operação.

---

## 6. AUTORIZAÇÃO CONFIÁVEL NO SERVIDOR E NO BANCO DE DADOS

As decisões de segurança devem ser tomadas em uma camada confiável, não exclusivamente no cliente.

Aplicar o princípio do menor privilégio.

Quando pertinente, validar no servidor:

- A identidade autenticada.
- O perfil ou papel do usuário.
- A permissão para executar a operação.
- O escopo dos dados acessíveis.
- As condições de negócio.
- A legitimidade dos parâmetros recebidos.
- A autorização para consultar, criar, modificar ou excluir cada recurso.

Não confiar em identificadores, perfis, flags, permissões ou valores enviados pelo cliente sem validação apropriada.

Políticas de segurança em nível de linha, como RLS quando utilizadas, devem ser avaliadas em conjunto com privilégios de tabelas, funções, views, RPCs e demais mecanismos de acesso.

Alterações em políticas, grants, funções ou estrutura do banco exigem autorização compatível com o impacto pretendido.

---

## 7. SEGREDOS E INFORMAÇÕES DE ACESSO

Proteger tokens, senhas, chaves, credenciais, variáveis de ambiente e demais informações confidenciais.

É proibido:

- Inserir segredos diretamente no código-fonte.
- Expor credenciais em logs, relatórios ou mensagens.
- Reproduzir segredos em documentação sem necessidade e autorização.
- Enviar credenciais a serviços externos sem autorização.
- Ampliar permissões de acesso por conveniência.
- Tratar dados de exemplo como credenciais reais sem confirmação.

Utilizar mecanismos apropriados de armazenamento e configuração de segredos.

Ao encontrar uma possível exposição, avaliar o risco e recomendar medidas corretivas. Revogar ou rotacionar credenciais somente quando a operação estiver autorizada.

---

## 8. DIAGNÓSTICO E CORREÇÃO DA CAUSA RAIZ

Investigar a causa raiz antes de implementar uma correção.

Não mascarar sintomas com soluções que introduzam inconsistências, efeitos colaterais, duplicidade de lógica ou complexidade desnecessária.

O processo deve considerar:

1. Reprodução do problema, quando possível.
2. Evidências técnicas disponíveis.
3. Identificação do componente responsável.
4. Análise das dependências e dos caminhos afetados.
5. Formulação de uma hipótese verificável.
6. Correção mínima compatível com a causa identificada.
7. Testes que demonstrem a resolução.
8. Verificação de regressões.

Não afirmar que uma causa foi comprovada quando houver apenas indícios.

Se a causa não puder ser confirmada, registrar a limitação e distinguir o diagnóstico provável da conclusão demonstrada.

---

## 9. PROVA FUNCIONAL E EVIDÊNCIAS

Uma alteração não deve ser considerada concluída apenas porque o código foi escrito ou compilou.

A validação deve ser proporcional ao risco e ao tipo de mudança.

Quando aplicável, verificar:

- Resultado funcional esperado.
- Comportamento em cenários válidos e inválidos.
- Permissões de acesso.
- Tratamento de erros e estados de falha.
- Compatibilidade com os componentes dependentes.
- Persistência e consistência dos dados.
- Ausência de regressões relevantes.
- Funcionamento das rotas e interfaces afetadas.

Registrar evidências suficientes para sustentar a conclusão, como resultados de testes, comandos executados, logs não sensíveis, diferenças revisadas ou passos reproduzíveis.

Capturas de tela podem complementar a comprovação visual, mas não substituem testes técnicos quando estes forem necessários.

Não declarar testes aprovados se não tiverem sido executados. Não declarar validação completa quando houver etapas pendentes.

---

## 10. QUALIDADE DO CÓDIGO E AUSÊNCIA DE RESÍDUOS

Toda alteração deve manter a base de código coerente, legível e sustentável.

É proibido deixar, como consequência evitável da tarefa:

- Código órfão.
- Imports não utilizados.
- Variáveis ou funções sem uso.
- Implementações duplicadas sem justificativa.
- Comentários que descrevam comportamentos inexistentes.
- Tipos incorretos usados para contornar erros.
- Tratamentos de erro que ocultem falhas relevantes.
- Desabilitações de lint ou verificações para mascarar problemas.
- Código temporário, depurações ou dados artificiais de teste em produção.

Antes de remover código aparentemente obsoleto, verificar suas referências, dependências e possíveis usos indiretos.

Não realizar refatorações amplas sem necessidade ou autorização compatível.

---

## 11. INSTRUÇÕES, HISTÓRICO E CONTEXTO DO PROJETO

Antes de iniciar alterações, ler as instruções aplicáveis e consultar o histórico técnico necessário para compreender a implementação existente.

Verificar, conforme a tarefa:

- Arquivos `AGENTS.md` e instruções locais.
- Documentação oficial do projeto.
- Implementações semelhantes já existentes.
- Histórico relevante de alterações.
- Contratos de APIs e funções.
- Estruturas de dados e dependências.
- Testes relacionados.
- Decisões técnicas previamente estabelecidas.

Não substituir decisões arquiteturais existentes apenas por preferência pessoal ou por uma solução genérica.

Se uma instrução atual conflitar com outra, avaliar a hierarquia, a especificidade e o escopo de cada uma. Não ignorar silenciosamente o conflito.

---

## 12. AUDITORIA E CONSULTA EM MODO READ-ONLY

Auditorias, inspeções, diagnósticos e revisões devem permanecer estritamente em modo de leitura quando assim definidos.

Em uma tarefa READ-ONLY, não executar operações de escrita, incluindo, mas não se limitando a:

- `INSERT`, `UPDATE`, `DELETE`, `UPSERT` e `MERGE`.
- `CREATE`, `ALTER`, `DROP` ou outras alterações de DDL.
- Migrations, seeds e sincronizações que modifiquem dados.
- RPCs ou funções com efeitos de escrita.
- Reconciliações que alterem registros.
- Modificações em logs, hashes, registros de auditoria ou cadeias de custódia.
- Alterações em políticas, privilégios, configurações ou estruturas.
- Escritas indiretas desencadeadas por triggers, jobs ou automações.

Não presumir que uma operação seja somente de leitura pelo nome da função. Verificar seu comportamento e os efeitos indiretos quando isso for possível.

Preferir consultas explicitamente somente de leitura, credenciais com privilégios mínimos e ambientes de inspeção apropriados.

Se não for possível garantir que uma operação respeite o modo READ-ONLY, não executá-la. Relatar a limitação e propor uma alternativa segura.

A autorização para consultar dados não implica autorização para alterá-los.

---

## 13. RELATÓRIOS HISTÓRICOS E PRESERVAÇÃO DOS REGISTROS ORIGINAIS

Relatórios históricos devem ser consultados e utilizados de modo a preservar os registros originais.

Quando o objetivo for análise, comparação ou reconstrução histórica:

- Priorizar consultas e extrações de leitura.
- Preservar os dados de origem.
- Não corrigir registros históricos diretamente para adequá-los ao relatório.
- Distinguir valores originais de cálculos, projeções ou interpretações.
- Identificar lacunas, inconsistências e limitações da fonte.
- Evitar apresentar estimativas como dados históricos confirmados.

Quando houver necessidade de corrigir um dado de origem, tratar a correção como uma operação separada, sujeita à autorização correspondente e aos mecanismos de rastreabilidade aplicáveis.

---

## 14. AUDITORIA DE SEGURANÇA

Uma auditoria de segurança deve avaliar, conforme o escopo, os controles relevantes para a arquitetura existente:

- Autenticação e gestão de sessão.
- Autorização e segregação de privilégios.
- Validação de entradas e parâmetros.
- Proteção de APIs, rotas e funções.
- Políticas de acesso aos dados.
- Proteção de segredos.
- Exposição de informações em respostas e logs.
- Tratamento de erros.
- Integridade dos registros.
- Dependências e configurações relevantes.
- Riscos de acesso indevido e alteração não autorizada.
- Controles de auditoria e rastreabilidade.

A lista é uma referência de avaliação, não uma declaração de que todos esses mecanismos existem ou estão habilitados no GD Rastreamento.

Registrar separadamente:

1. Controles confirmados.
2. Controles encontrados, mas não validados.
3. Vulnerabilidades demonstradas.
4. Riscos potenciais.
5. Itens não avaliados.
6. Recomendações e prioridades.

Não classificar um controle como ativo apenas porque há código, configuração ou documentação que o menciona.

---

## 15. REGRESSÃO E COMPATIBILIDADE

Toda alteração deve considerar o risco de regressão nas funcionalidades existentes.

Identificar os fluxos diretamente afetados e os componentes que dependem deles.

Executar testes de regressão proporcionais ao impacto, priorizando:

- Funcionalidades modificadas.
- Fluxos relacionados.
- Permissões e controles de segurança.
- Integrações e contratos.
- Persistência de dados.
- Compatibilidade com versões e configurações suportadas.

Não presumir que uma alteração isolada seja segura apenas porque os testes unitários passaram.

Quando não houver condições de executar testes relevantes, documentar quais não foram realizados e quais riscos permanecem.

---

## 16. DOCUMENTAÇÃO PROPORCIONAL AO IMPACTO

A documentação deve refletir a implementação efetiva e o impacto da mudança.

Atualizar os documentos pertinentes quando houver alteração relevante em:

- Arquitetura.
- Contratos de APIs.
- Configurações.
- Fluxos operacionais.
- Requisitos de segurança.
- Procedimentos de implantação ou recuperação.
- Comportamento funcional.
- Requisitos de manutenção.
- Limitações conhecidas.

Não atualizar indiscriminadamente documentos sem relação com a tarefa.

Não registrar como concluído um recurso que esteja apenas planejado, parcialmente implementado ou não validado.

Distinguir comportamento implementado, comportamento esperado, limitações conhecidas e melhorias futuras.

---

## 17. CLASSIFICAÇÃO E PROTEÇÃO DE DOCUMENTOS

Tratar documentos de acordo com seu conteúdo, finalidade, público autorizado e classificação aplicável.

Antes de gerar, compartilhar, publicar ou exportar um documento, verificar se ele contém:

- Dados pessoais.
- Informações confidenciais.
- Segredos ou credenciais.
- Detalhes técnicos que não devam ser divulgados.
- Identificadores internos.
- Informações de acesso ou de infraestrutura.
- Dados cujo compartilhamento dependa de autorização.

Aplicar minimização de dados: incluir apenas o necessário para a finalidade do documento.

Não presumir que um documento possa ser publicado externamente apenas porque foi produzido para uso interno.

A classificação e as regras de compartilhamento devem seguir as políticas aplicáveis ao projeto e as determinações do responsável autorizado.

---

## 18. INTEGRIDADE E RASTREABILIDADE DE PDFs E ARQUIVOS

Quando PDFs ou outros documentos precisarem de verificação de integridade, utilizar mecanismos compatíveis com a finalidade e com os controles já existentes.

Quando aplicável:

- Calcular hashes criptográficos do arquivo final.
- Registrar o algoritmo utilizado.
- Vincular o hash à versão exata do arquivo.
- Preservar a associação entre o documento e seus metadados de origem.
- Permitir a verificação posterior de alterações.
- Distinguir a integridade do arquivo da autenticidade de sua origem.

Um hash, isoladamente, não prova autoria, legitimidade ou momento de criação.

Não modificar arquivos, hashes registrados ou mecanismos de rastreabilidade existentes sem autorização específica.

Se já houver uma cadeia de integridade ou custódia, preservá-la e respeitar os procedimentos documentados.

---

## 19. REGISTROS AUDITÁVEIS DE OPERAÇÕES RELEVANTES

Operações relevantes devem possuir rastreabilidade compatível com o risco, com os requisitos do sistema e com as políticas aplicáveis.

Quando implementado e autorizado, o registro pode incluir:

- Identificação do evento.
- Data e hora.
- Identidade ou contexto autorizado do responsável.
- Recurso afetado.
- Tipo de operação.
- Resultado.
- Identificador de correlação.
- Motivo ou justificativa, quando exigidos.
- Referência à evidência técnica pertinente.

Registrar apenas dados necessários e evitar segredos, credenciais e informações pessoais desnecessárias.

Não inventar eventos, não simular registros de auditoria e não declarar que existe rastreabilidade inviolável sem validação técnica.

Não alterar, apagar, reconstruir ou inserir registros em mecanismos de auditoria durante tarefas READ-ONLY.

---

## 20. PADRONIZAÇÃO DE DATAS, HORÁRIOS E MEDIDAS

Exibir datas, horários, valores numéricos e medidas de forma consistente com os contratos de dados e as convenções definidas pelo projeto.

Antes de alterar uma formatação, identificar:

- O formato armazenado.
- O formato esperado pela API.
- A unidade de medida.
- O fuso horário aplicável.
- A regra de conversão.
- A precisão necessária.
- O impacto sobre cálculos, comparações e relatórios.

Não converter valores silenciosamente quando isso puder alterar seu significado.

Datas e horários devem preservar o instante e o fuso corretos. Medidas, como distâncias, devem identificar claramente a unidade utilizada.

Formatação visual não deve alterar o valor de origem nem introduzir arredondamentos indevidos nos cálculos.

Quando houver inconsistência entre fontes, expor a divergência em vez de escolher arbitrariamente um valor.

---

## 21. CONTROLES DE CONFIGURAÇÃO E INFRAESTRUTURA

Alterações em configurações, permissões, infraestrutura, serviços externos, cache, políticas, dependências e ambientes de execução devem ser avaliadas de acordo com seu impacto.

Antes de aplicar mudanças:

1. Identificar o comportamento atual.
2. Determinar o recurso e o ambiente afetados.
3. Verificar dependências e compatibilidade.
4. Identificar os riscos de indisponibilidade ou perda de dados.
5. Confirmar a autorização correspondente.
6. Definir a validação posterior.
7. Prever recuperação quando aplicável.

Não executar migrations, ajustes de permissões, limpeza de cache, publicação ou mudanças de infraestrutura como etapas automáticas de uma tarefa de análise ou correção de código, salvo quando abrangidas pela autorização.

Não declarar que uma alteração foi publicada ou está ativa sem evidência suficiente.

---

## 22. CHECKPOINTS E RECUPERAÇÃO

Quando existirem checkpoints, backups ou pontos de recuperação definidos pelo projeto, respeitar as regras de criação, preservação e restauração aplicáveis.

Não modificar checkpoints imutáveis ou cópias de segurança protegidas sem autorização específica.

Antes de restaurar qualquer estado, identificar:

- O conteúdo que será substituído.
- As alterações posteriores ao checkpoint.
- Os efeitos sobre dados e configurações.
- A possibilidade de perda de trabalho.
- O procedimento de validação após a restauração.

Um backup existente não constitui autorização para sobrescrever o ambiente atual.

Não afirmar que existe backup válido ou recuperação garantida sem evidências verificáveis.

---

## 23. MATRIZ DE VALIDAÇÃO E ENCERRAMENTO

Ao finalizar uma tarefa técnica, avaliar os itens pertinentes à mudança.

| Critério               | Evidência esperada                             |
| ---------------------- | ---------------------------------------------- |
| Escopo respeitado      | Alterações restritas ao objetivo autorizado    |
| Integridade preservada | Ausência de perda ou sobrescrita indevida      |
| Causa tratada          | Diagnóstico sustentado por evidências          |
| Testes                 | Resultados reais dos testes executados         |
| Segurança              | Controles relevantes avaliados                 |
| Regressão              | Verificações proporcionais ao impacto          |
| Código                 | Ausência de resíduos evitáveis                 |
| Documentação           | Atualização pertinente, quando necessária      |
| Git                    | Diferenças e arquivos alterados revisados      |
| Publicação             | Estado real confirmado, se aplicável           |
| Pendências             | Limitações e itens não validados identificados |

Os itens não pertinentes podem ser marcados como não aplicáveis, com justificativa quando necessário.

A conclusão deve distinguir claramente:

- **Concluído e validado:** há evidências suficientes.
- **Implementado, mas não validado:** a alteração existe, mas faltam verificações.
- **Parcialmente concluído:** parte do objetivo permanece pendente.
- **Bloqueado:** existe impedimento identificado.
- **Não executado:** a etapa não foi realizada.

Não declarar sucesso integral se houver etapas obrigatórias pendentes.

---

## 24. VERSIONAMENTO E CONTROLE DE PUBLICAÇÃO

Quando o projeto possuir política de versionamento, segui-la sem inventar regras incompatíveis com o padrão estabelecido.

Uma alteração de versão deve corresponder ao estado real da implementação e aos arquivos de referência definidos pelo projeto.

Antes de concluir uma tarefa que envolva versionamento, verificar os arquivos pertinentes e a consistência entre eles.

Não incrementar versões artificialmente para aparentar conclusão.

Build, testes, commit, push, publicação e validação em produção são eventos distintos. Relatar separadamente o que foi realizado e o que permanece pendente.

Não publicar, fazer push ou promover mudanças para produção sem a autorização exigida para essa etapa.

---

## 25. PROIBIÇÃO DE CONCLUSÕES SEM EVIDÊNCIA

Toda declaração de conclusão deve ser sustentada por evidências observáveis.

Não afirmar que:

- Um erro foi corrigido sem validação adequada.
- Um teste passou sem execução.
- Uma vulnerabilidade inexiste porque não foi encontrada.
- Uma proteção está ativa apenas porque foi documentada.
- Uma publicação foi concluída sem confirmação.
- Um arquivo foi atualizado sem verificar o resultado.
- Um banco de dados permaneceu inalterado sem evidência compatível com o nível de garantia declarado.

Usar linguagem precisa para indicar o grau de certeza.

Quando a validação for parcial, informar o que foi comprovado, o que não foi testado e quais limitações permanecem.

---

## 26. REGRA DE PRECEDÊNCIA E RESOLUÇÃO DE CONFLITOS

Em caso de conflito entre instruções:

1. Respeitar as instruções de maior precedência aplicáveis.
2. Respeitar as restrições específicas e expressas do usuário para a tarefa.
3. Respeitar o escopo de autorização concedido.
4. Preservar os controles de segurança e integridade.
5. Não interpretar autonomia técnica como autorização para ultrapassar os limites estabelecidos.

Instruções específicas de um projeto, módulo ou ambiente devem ser aplicadas somente ao contexto correspondente, sem serem generalizadas automaticamente para outros sistemas.

Se duas instruções aplicáveis forem incompatíveis e não houver resolução segura pela hierarquia ou pelo escopo, interromper a operação afetada e solicitar esclarecimento.

---

## 27. REGRA FINAL DE INTEGRIDADE OPERACIONAL

A prioridade é preservar a segurança, a integridade, a rastreabilidade e a continuidade do GD Rastreamento.

O agente deve executar o trabalho autorizado com rigor técnico, investigar a causa raiz, validar os resultados e comunicar as limitações com transparência.

**Nenhuma conveniência operacional, autonomia técnica, pressão por rapidez ou tentativa de concluir uma tarefa justifica ultrapassar a autorização concedida, comprometer dados ou declarar resultados que não foram comprovados.**

---

## 28. PROTOCOLO OPERACIONAL ESPECÍFICO DO GD RASTREAMENTO

Esta seção consolida as regras técnicas executáveis, ferramentas canônicas, barreiras físicas e comandos mandatórios do projeto GD Rastreamento. Nenhuma tarefa técnica é considerada válida ou concluída sem a aplicação integral deste protocolo:

### 28.1. Autonomia Plena com Permissões Totais para Sistema e Banco de Dados (Anti-Preguiça)

- O assistente possui todas as permissões concedidas pelo usuário para criar, alterar, excluir, migrar e configurar de ponta a ponta: frontend, rotas, backend (`src/server.ts`), schemas, tabelas, colunas, triggers, RPCs, políticas RLS, permissões GRANT, `NOTIFY pgrst` e atualização imediata do script mestre `supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql`.
- Proibido delegar comandos manuais ou scripts para o usuário rodar no terminal ou console do Supabase quando o assistente tiver capacidade de realizar a operação autônoma.

### 28.2. Protocolo dos 7 Gates de Execução e Encerramento Obrigatórios

Nenhum ciclo é encerrado sem validação formal dos 7 gates:

1. **Gate 1 — Auto-Auditoria Operacional, Compreensão de Contexto e Aplicação Fiel das Normas Pétreas (Anti-Declaração da Boca Para Fora):**
   - O Gate 1 não é uma frase dita da boca para fora. Ele exige parar e auditar a si mesmo ativamente:
   - **Investigação de Contexto e Histórico:** Obrigação de verificar o histórico e o contexto prévio para resgatar soluções, regras e erros já descobertos anteriormente, compreendendo a fundo o assunto no contexto do sistema antes de intervir.
   - **Antes de responder:** Validar se há suposição ou dedução. Se houver, apagar e buscar o dado factual diretamente na raiz (código-fonte canônico, banco de dados, migrações e arquivos reais).
   - **Antes de encerrar:** Checar se passou pelos Gates e se a Consulta Prévia Obrigatória de Publicação (Gate 6) foi formalizada.
2. **Gate 2 — Zero Erros de Tipagem / LSP:** Validação via `npx tsc --noEmit`.
3. **Gate 3 — Formatação Estrita:** Padronização integral via `npm run format`.
4. **Gate 4 — 100% de Aprovação na Suíte de Testes:** Execução de `npm test` (0 falhas toleradas).
5. **Gate 5 — Compilação de Produção:** Build concluído com sucesso via `npm run build` (código de saída 0).
6. **Gate 6 — Consulta Prévia Obrigatória (Anti-Subida em Cascata) e Versionamento A.B.C.D:**
   - **Consulta Prévia Obrigatória:** Antes de atualizar a versão e gerar tags, o assistente DEVE OBRIGATORIAMENTE perguntar ao usuário se há mais alterações pendentes e se já está autorizado a publicar a nova versão.
   - Após autorização expressa, sincronizar a versão A.B.C.D em:
     1. `package.json` (`"version": "A.B.C.D"`)
     2. `vite.config.ts` (`const APP_VERSION = "A.B.C.D";`)
     3. `src/shared/lib/version.ts` (`export const APP_VERSION_NUMERO = "A.B.C.D";`)
     4. `src/test/__tests__/hunter-fundacao.test.ts`
     5. `src/test/__tests__/hunter-sigoguardiao-dominio-e-compartilhamento.test.ts`
   - Executar obrigatoriamente `npm install --package-lock-only` para sincronizar `package-lock.json` (evita quebra de `npm ci` na Cloudflare).
   - Realizar o commit, tag anotada e push: `git add <arquivos-do-plano> && git commit -m "..." && git tag -a vA.B.C.D -m "Release vA.B.C.D" && git push origin main && git push origin vA.B.C.D`.
7. **Gate 7 — Declaração Formal de Encerramento:** Informar ao usuário a versão publicada (vA.B.C.D), apresentar a Matriz de Validação e declarar expressamente que leu na íntegra as normas pétreas deste sistema novamente, as quais serão rigorosamente seguidas antes de qualquer alteração no próximo prompt.

### 28.3. Root Cause First e Proibição Absoluta de Contornar ou Mascarar Erros (Correção Obrigatória na Origem e Zero Workaround)

- **NUNCA contorne um erro no código ou mascare o erro: CORRIJA O ERRO.**
- É terminantemente proibido criar rotas fantasmas, aliases redundantes, adaptadores paliativos, tratamentos ad-hoc para aceitar chamadas/parâmetros incorretos, gambiarras de redirecionamento ou rotinas de contorno para fazer uma chamada errada funcionar.
- Se uma chamada, URL, rota, RPC, payload, parâmetro ou componente chamar algo errado ou inexistente, a correção DEVE OBRIGATORIAMENTE ser realizada diretamente na raiz e na origem da chamada (consertando quem chama para chamar o recurso canônico correto), mantendo a arquitetura limpa, canônica e livre de remendos.
- Proibido qualquer tipo de mascaramento de erros, `try/catch` vazios que engolem exceções, hardcodes para contornar falhas ou filtros cosméticos de incidentes.
- Toda correção deve solucionar a causa raiz comprovando tecnicamente o caminho causal desde a origem dos dados até a apresentação.

### 28.4. SuperADM Imutável

- As contas oficiais `novaes@adm.28bpm.local` e `novaes@oficial.tec.br` são blindadas no banco de dados contra rebaixamento de nível, alteração de e-mail ou exclusão de conta.
- A nomenclatura oficial é estritamente **SuperADM** (proibido o uso de termos como "SuperAdmin Mestre", "Conta Mestre" ou "Acesso Mestre").

### 28.5. Invalidação Compulsória de Cache PostgREST e Padrão "Expand and Contract"

- Todo script SQL de migração DDL (`supabase/migrations/*.sql`) DEVE OBRIGATORIAMENTE finalizar com a instrução: `NOTIFY pgrst, 'reload schema';`.
- Novas colunas em tabelas operacionais devem possuir valor padrão (`DEFAULT`) ou permitir nulo (`NULL`).
- Inserções críticas devem implementar defesa em profundidade com fallback automático para o payload base essencial caso ocorra erro transitório de schema cache (`PGRST204`).
- Toda nova tabela deve conter permissões explícitas `GRANT` para a Data API (`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nome TO authenticated, service_role;` e `GRANT SELECT ON TABLE public.nome TO anon;` conforme RLS).
- Todas as alterações DDL devem ser idempotentes e imediatamente espelhadas no script mestre `supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql`.

### 28.6. Ergonomia Canônica de Modais (Zero Corte de Viewport e Portal Global)

- Todo modal do sistema DEVE ser renderizado via `createPortal(..., document.body)` através do componente canônico `ModalPortal`.
- Dimensionamento com `max-h-[90vh]`, `overflow-y-auto`, centralização `my-auto` e botões de ação do rodapé fixos ou sempre visíveis e clicáveis em qualquer resolução ou orientação de tela.

### 28.7. Interdição do Caractere Comercial e Isolamento Total de Marca

- Ausência total do caractere comercial `&` em interfaces, cards, menus, PDFs, comprovantes e mensagens ao usuário, utilizando sempre a conjunção vernácula **"e"** (validado pela suíte de testes).
- Proibição absoluta de utilizar referências cruzadas a outros sistemas (como SIGOVTR, SIGOFROTA, PCSv) em qualquer elemento do GD Rastreamento.

### 28.8. Balões e Cards Interativos com Filtro Bidirecional (em 100% das Telas)

- Todo balão de contagem, indicador estatístico ou cartão infográfico atua obrigatoriamente como botão de filtro ativo para a listagem correspondente, alternando de forma bidirecional entre o subconjunto filtrado e a visão ampla geral.

### 28.9. Anti-Polling Total e Reatividade Real

- Proibido qualquer tipo de polling cego (`setInterval`) com telas ou chats fechados. Toda reatividade deve ocorrer via WebSockets (Supabase Realtime).

### 28.10. Protocolo Permanente de Duplo Marco de Segurança (BKP-A e BKP-B com Rotação do Mais Antigo)

- Repositórios isolados dedicados:
  - **BKP-A:** `https://github.com/sigogdseg-bit/BKP-A.git` (remote `bkp-a`)
  - **BKP-B:** `https://github.com/sigogdseg-bit/BKP-B.git` (remote `bkp-b`)
- Os Marcos de Segurança são **IMUTÁVEIS** e nunca são alterados em publicações rotineiras. Só podem ser gravados sob comando explícito do usuário (_"faça o marco de seguranca"_).
- Norma de Rotação Automática: O marco mais antigo em versão e data entre BKP-A e BKP-B é compulsoriamente o substituído, mantendo o mais recente intacto. Script exclusivo: `npm run marco:save`.
- Restauração Direta: Comando oficial `npm run marco:restore` (podendo passar `A` ou `B`), restaurando o estado íntegro diretamente para a aplicação real com validação de testes e build.

### 28.11. Contas Oficiais de Serviços e Infraestrutura

Sempre que solicitado, fornecer as contas vinculadas à infraestrutura do GD Rastreamento:

- **Fly.io:** `dev@oficial.tec.br`
- **Cloudflare:** `djrnovaes@yahoo.com.br`
- **Supabase:** `hunter@oficial.tec.br`
- **Lara:** `dev@oficial.tec.br`
- **GitHub:** `sigoguardiao@oficial.tec.br`
- **MapTiler:** Google (`dev@oficial.tec.br`)

### 28.12. Protocolo Nativo de Especificação Viva (Spec-Driven Development Interno)

Para garantir controle, previsibilidade e documentação viva sem depender de skills externas genéricas, toda nova funcionalidade, refatoração estrutural ou alteração que envolva **3 ou mais arquivos**, **alteração de banco/RPC/RLS** ou **mudança de protocolo/gateway** deve seguir obrigatoriamente o fluxo em 4 etapas utilizando o template [docs/specs/_TEMPLATE.md](docs/specs/_TEMPLATE.md):

1. **Mapeamento (Discovery):** Inspecionar os arquivos reais afetados (`src/`, `supabase/migrations/`, `deploy/hunter-gateway/`, testes `hunter-*.test.ts` e o módulo correspondente em `dev-modulos`) antes de propor qualquer código.
2. **Especificação (`docs/specs/YYYY-MM-DD-nome-curto.md`):** Registrar premissas, o que está fora de escopo, critérios de aceite testáveis, tarefas atômicas (máximo ~5 arquivos por etapa) e fronteiras (`Sempre / Perguntar antes / Nunca`).
3. **Validação Prévia:** Submeter a spec ao usuário para aprovação antes de iniciar alterações de código (não aplicável a correções pontuais de 1–2 arquivos com requisito inequívoco).
4. **Execução e Atualização Viva:** Implementar etapa por etapa, atualizar a spec caso decisões mudem durante a execução, preencher a seção de validação com resultados reais (Gates 2 a 5) e versionar a spec junto com o código (mediante autorização no Gate 6).
