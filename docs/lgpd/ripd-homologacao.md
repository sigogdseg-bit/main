# RELATÓRIO DE IMPACTO À PROTEÇÃO DE DADOS PESSOAIS (RIPD) E SEGURANÇA CIBERNÉTICA

> **Documento Oficial de Auditoria, Conformidade Regulatória e Defesa Cibernética para Homologação**  
> **Sistema:** GD Rastreamento e Telemetria Veicular  
> **Domínio Oficial:** `https://gd.oficial.tec.br`  
> **Versão Auditada:** `v1.0.1.16`  
> **Data da Auditoria Técnica:** 21 de Novembro de 2026  
> **Legislação Aplicável de Referência:** Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD), Lei Federal nº 12.737/2012 (Crimes Cibernéticos), Lei Federal nº 14.155/2021 (Invasão de Dispositivo Informático e Fraude Eletrônica) e Resoluções vigentes da Autoridade Nacional de Proteção de Dados (ANPD).

---

## 1. IDENTIFICAÇÃO E CONTEXTO OPERACIONAL

### 1.1. Identificação do Sistema

- **Nome do Sistema:** GD Rastreamento (GD Segurança Privada)
- **Domínio Canônico de Produção:** `https://gd.oficial.tec.br`
- **Versão Atual Homologada:** `v1.0.1.16`
- **Ambiente de Execução:** Edge Runtime (Cloudflare Workers via SSR / Vane) integrado a Banco de Dados Gerenciado (PostgreSQL com Supabase), Micro-Gateway de Notificações WhatsApp Baileys (Fly.io na região `gru` - São Paulo) e Gateway Telemétrico GPS (TCP Portas 7002 e 7003).

### 1.2. Agentes de Tratamento e Governança

- **Controlador dos Dados:** `[PENDENTE DE CONFIRMAÇÃO - RESPONSÁVEL]` (Razão Social e CNPJ a serem validados pela diretoria).
- **Operador(es) de Infraestrutura e Serviços:**
  - Provedor de Borda e Aplicação: Cloudflare Inc.
  - Provedor de Banco de Dados e Autenticação: Supabase Inc. (AWS Region sa-east-1 / us-east-1 conforme tenant `pflzopmxxawyqkgrlapq`).
  - Provedor de Computação Isolada para Mensageria WhatsApp: Fly.io Inc. (App `gd-whatsapp-gateway`, Datacenter `gru` - São Paulo).
  - Provedor de Conectividade M2M/Telemetria: `[PENDENTE DE CONFIRMAÇÃO - RESPONSÁVEL]` (Operadoras de conectividade de dados dos rastreadores veiculares).
- **Encarregado pelo Tratamento de Dados Pessoais (DPO):** `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]` (Nome, CPF e contato oficial a serem nomeados formally nos termos do Art. 41 da LGPD).
- **Canal Oficial de Atendimento aos Titulares (Art. 18 LGPD):**
  - Endpoint Automatizado no Sistema: `POST https://gd.oficial.tec.br/api/lgpd/solicitar`
  - Consulta Pública por Protocolo com DLP: `GET https://gd.oficial.tec.br/api/lgpd/consultar?protocolo=...`
  - Canal de Ouvidoria / E-mail Institucional: `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]`

### 1.3. Justificativa da Elaboração do Relatório

O presente Relatório de Impacto à Proteção de Dados Pessoais (RIPD) e Segurança Cibernética é elaborado com fundamento no Art. 38 da Lei nº 13.709/2018 (LGPD), com o objetivo de instruir o processo de homologação formal do sistema GD Rastreamento. O sistema realiza o tratamento contínuo de dados cadastrais de clientes, locatários, instaladores e parceiros, bem como dados telemétricos e de geolocalização veicular de alta frequência (coordenadas de GPS, rotas, ignição e velocidades), exigindo salvaguardas rigorosas de confidencialidade, integridade, disponibilidade e autenticidade.

### 1.4. Enquadramento e Base Legal

- **Tratamento Comercial e Prestação de Serviços (Regime Geral):**
  - Execução de Contrato ou de procedimentos preliminares a pedido do titular (Art. 7º, V da LGPD).
  - Cumprimento de obrigação legal ou regulatória pelo controlador (Art. 7º, II da LGPD), incluindo obrigações fiscais e de guarda de registros telemáticos (Marco Civil da Internet, Lei nº 12.965/2014, Art. 15).
  - Proteção da vida ou da incolumidade física do titular ou de terceiros (Art. 7º, VII da LGPD), no que tange a alertas de colisão, socorro emergencial e acionamento de apoio tático.
  - Legítimo interesse do controlador (Art. 7º, IX da LGPD), especificamente na prevenção de fraudes e na segurança veicular patrimonial.
- **Ressalva de Competência e Regime Especial:**
  - Havendo emprego do sistema em operações conjuntas de segurança pública, repressão de infrações penais ou cooperação com órgãos policiais, tal enquadramento sujeita-se à avaliação do Art. 4º, III da LGPD: `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]`.

---

## 2. TIPOS DE DADOS COLETADOS E CICLO DE VIDA DO TRATAMENTO

### 2.1. Inventário de Dados Pessoais Identificados no Repositório

| Categoria de Dado                           | Campos e Atributos Identificados no Código                                                                                                                             | Tabelas de Armazenamento                                                                               | Finalidade Operacional                                                                        |
| :------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| **Identificação Pessoal e Cadastral**       | Nome completo, razão social, CPF/CNPJ, e-mail, telefone fixo/celular, endereço completo, dados de contato de emergência.                                               | `public.profiles`, `public.clientes`, `public.locatarios`                                              | Autenticação, gestão contratual, faturamento, instalação técnica e comunicação operacional.   |
| **Credenciais e Segurança de Acesso**       | Hash criptográfico de senha (Argon2id/bcrypt gerenciado pelo Supabase Auth), tokens JWT, fatores MFA/TOTP, tokens de convite e tokens de recuperação.                  | `auth.users`, `auth.identities`, `public.profiles`, `public.convites_cliente`                          | Controle estrito de acesso lógico, prevenção contra força bruta e credenciamento seguro.      |
| **Dados Telemétricos e Geolocalização**     | Latitude, longitude, rumo/direção (ângulo), velocidade (km/h), status da chave de ignição (ACC), status de bloqueio, nível de bateria, odômetro calculado e horímetro. | `public.veiculos`, `public.veiculos_telemetria`, `public.posicoes_historico`, `public.trajetos_salvos` | Monitoramento telemétrico veicular, reconstrução de rotas, cercas virtuais e bloqueio seguro. |
| **Dados Financeiros e Contratuais**         | Número de contrato, parcelas, mensalidades, histórico de liquidação, comprovantes de transação e chaves Pix para split.                                                | `public.contratos_clientes`, `public.mensalidades`, `public.transacoes_financeiras`                    | Gestão de cobrança, faturamento, apuração de comissões e auditoria financeira.                |
| **Trilha Forense e Metadados de Auditoria** | Endereço IP de origem, User-Agent, fingerprint TOFU do navegador, carimbo temporal (timestamp UTC/BRT), tipo de ação executada e identificador de correlação.          | `public.system_login_logs`, `public.system_activity_logs`, `public.login_lockouts`                     | Auditoria de segurança, detecção de intrusão, conformidade LGPD e cadeia de custódia.         |
| **Direitos dos Titulares (LGPD)**           | Número de protocolo, nome, documento, e-mail, tipo de requisição (acesso, exclusão, etc.), status e justificativa de atendimento.                                      | `public.lgpd_solicitacoes`                                                                             | Registro imutável de atendimento aos direitos fundamentais dos titulares (Art. 18 LGPD).      |

### 2.2. Avaliação de Dados Pessoais Sensíveis (Art. 5º, II da LGPD)

Não foi verificada na base de código a coleta ou processamento de dados sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual.  
No entanto, registros contínuos de geolocalização e rotas habituais possuem potencial de inferência comportamental sobre a rotina dos condutores, sendo classificados no sistema como **dados de alto impacto à privacidade**, sujeitos a controle de acesso baseado em função (RBAC), isolamento por RLS e criptografia em trânsito e em repouso.

### 2.3. Ciclo de Vida dos Dados e Retenção

- **Coleta:** Ocorre por inserção ativa no formulário de auto-cadastro/convite pelo próprio titular ou operador credenciado, ou passivamente por transmissão telemétrica celular dos rastreadores homologados (protocolos J16/Voxter).
- **Armazenamento:** Realizado no cluster de banco de dados PostgreSQL (Supabase) com criptografia nativa em repouso (AES-256) e volumes criptografados no Fly.io para sessões temporárias de mensageria WhatsApp (`/data/session-gd`).
- **Acesso e Segregação:** Delimitado via Row Level Security (RLS) no banco de dados e controle de sessão no servidor Cloudflare Worker (`handleApiRequest`), impedindo o acesso de clientes a dados de terceiros (IDOR/BOLA).
- **Compartilhamento Externo Identificado no Código:**
  - Micro-gateway WhatsApp isolado (`gd-whatsapp-gateway.fly.dev`) para despacho de mensagens e alertas autorizados.
  - Provedor Web Push (Firebase Cloud Messaging / Web Push VAPID) com payload mínimo cifrado.
  - Proxy viário OSRM para desenho vetorial de rotas pelas ruas (envia estritamente pares de coordenadas geográficas, sem identificação do veículo ou titular).
- **Prazos de Retenção e Descarte:**
  - Prazos telemétricos e registros de log: `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]` (Recomenda-se guarda mínima de 6 meses para registros de conexão conforme Art. 15 da Lei nº 12.965/2014 e 5 anos para contratos e notas fiscais conforme Código Civil e Código Tributário Nacional).
  - Rotina de Anonimização e Exclusão Técnica: Suportada nativamente via endpoint `/api/lgpd/tramitar` e pela tabela `public.lgpd_solicitacoes`.

---

## 3. METODOLOGIA DE COLETA, INTEGRIDADE E DEFESA CIBERNÉTICA

### 3.1. Arquitetura de Defesa em Profundidade Implementada

```
+--------------------------------------------------------------------------------+
|                             CAMADA 1: BORDA (EDGE)                             |
| Cloudflare Workers (SSR + API) + WAF + HTTPS TLS 1.3 + HSTS + SECURITY_HEADERS  |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
|                        CAMADA 2: APLICAÇÃO E SESSÃO                            |
| Bearer JWT Authentication + RBAC no Servidor + DLP + Sanitização Estrita       |
| Endpoints LGPD Art. 18 (/api/lgpd/*) + Anti-IDOR/BOLA + Rate Limiting          |
+--------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
+--------------------------------------+   +-------------------------------------+
|        CAMADA 3: BANCO DE DADOS      |   |    CAMADA 4: MICROSSERVIÇO ISOLADO  |
| PostgreSQL (Supabase)                |   | Fly.io (gru - São Paulo)            |
| - Row Level Security (RLS) Ativo     |   | - gd-whatsapp-gateway               |
| - 21 Módulos de Segurança Canônica   |   | - Sessão Isolada em /data/session-gd|
| - Trilha Imutável de Auditoria       |   | - Zero Interligação com outros apps |
| - Honeypots e Bloqueio Progressivo   |   | - Token de Barreira X-Hunter-Token  |
+--------------------------------------+   +-------------------------------------+
```

### 3.2. Controles de Segurança Cibernética Confirmados no Código

1. **Proteção de Cabeçalhos HTTP (SECURITY_HEADERS):**
   - O servidor injeta compulsoriamente em todas as respostas de API e assets estáticos:
     - `Content-Security-Policy`: Restringe carregamentos a fontes confiáveis.
     - `X-Content-Type-Options: nosniff`: Previne sniffing de MIME-type.
     - `X-Frame-Options: SAMEORIGIN`: Proteção nativa contra Clickjacking.
     - `Referrer-Policy: strict-origin-when-cross-origin`: Minimiza vazamento de referrers.
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains`: Impõe HTTPS permanente.
2. **Prevenção a Injeções (SQL, NoSQL, Command, XSS):**
   - No backend, todas as operações no banco utilizam o SDK oficial parametrizado do Supabase (PostgREST), neutralizando injeção clássica de SQL.
   - Higienização e truncamento rígido de entradas de texto em todos os endpoints (`handleApiLgpd`, `handleApiConvites`, `handleApiCliente`).
3. **Controle de Acesso Baseado em Função (RBAC) e Prevenção BOLA/IDOR:**
   - Cada requisição protegida valida a chave de sessão e o perfil do usuário consultado na tabela `public.profiles`.
   - Rotas de clientes verificam estritamente o vínculo do `user_id` e `cliente_id`, impedindo a manipulação de parâmetros para visualizar ou modificar veículos, trajetos ou cobranças de outros clientes.
4. **Isolamento Total do Micro-Gateway WhatsApp (Separação Canônica):**
   - Desacoplamento físico e lógico executado: o GD Rastreamento conecta-se exclusivamente ao seu próprio microsserviço no Fly.io (`https://gd-whatsapp-gateway.fly.dev`), operando com volume criptografado próprio (`gd_whatsapp_data`), eliminando qualquer compartilhamento de sessão ou linha telefônica com outros sistemas.
5. **Trilha Forense Imutável e Auditoria de Ações Sensíveis:**
   - A tabela `public.system_activity_logs` registra com carimbo UTC/BRT cada evento crítico de autenticação, emissão contratual, bloqueio veicular e requisição LGPD.
   - A tabela `public.system_login_logs` armazena fingerprints e geolocalização de IP para detecção de anomalias (impossibilidade de deslocamento/credential stuffing).
6. **Mecanismos de Deception e Defesa Ativa (Honeypots):**
   - Existência de armadilhas cibernéticas (`public.honeytokens_deception`) no schema do banco para detecção precoce de escaneamento interno e invasores, disparando bloqueio preventivo de IP em `public.login_lockouts`.

---

## 4. ANÁLISE DE RISCOS, AMEAÇAS CIBERNÉTICAS E MATRIZ DE IMPACTO

### 4.1. Cenários de Ameaça Mapeados

| Vetor de Ameaça / Incidente                                  | Agente / Gatilho                                                           | Impacto aos Titulares e ao Sistema                                            | Salvaguarda Técnica Implementada no Workspace                                                             |
| :----------------------------------------------------------- | :------------------------------------------------------------------------- | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **Acesso não autorizado por Credential Stuffing**            | Cibercriminoso externo explorando senhas vazadas em bases públicas.        | Comprometimento da conta do usuário e exposição da rota do veículo.           | Bloqueio progressivo de IP (`login_lockouts`), hashing robusto e política de primeiro acesso obrigatório. |
| **Manipulação de Parâmetros (BOLA / IDOR)**                  | Usuário autenticado tentando acessar dados de frotas de terceiros.         | Exfiltração indevida de dados telemétricos e cadastrais.                      | Políticas RLS ativas em 100% das tabelas e validação de vínculo `cliente_id` em nível de servidor.        |
| **Interligação Indevida de Mensageria (Vazamento de Linha)** | Gateway de WhatsApp compartilhado entre sistemas distintos.                | Disparo de mensagens usando número corporativo indevido e erro de identidade. | **Desacoplamento total realizado:** Novo app Fly.io (`gd-whatsapp-gateway`) com storage isolado.          |
| **Invasão por Engenharia Social em Solicitação LGPD**        | Atacante solicitando dados de titular terceiro alegando direito de acesso. | Violação de privacidade e entrega indevida de dados pessoais.                 | Validação cruzada obrigatória do e-mail do titular autenticado e mascaramento DLP por protocolo.          |
| **Interceptação em Trânsito (Man-in-the-Middle)**            | Conexão em rede pública insegura entre o cliente e o sistema.              | Captura de tokens de sessão e credenciais de login.                           | HSTS estrito, TLS 1.3 obrigatório e cabeçalhos de segurança na borda Cloudflare.                          |

### 4.2. Matriz de Risco (Antes e Depois da Implementação das Medidas)

| Cenário de Risco                                   | Probabilidade Inicial | Impacto Inicial | Risco Residual | Eficácia da Medida Implementada                           |
| :------------------------------------------------- | :-------------------: | :-------------: | :------------: | :-------------------------------------------------------- |
| Exfiltração de dados por IDOR em endpoints         |         Média         |      Alto       |   **BAIXO**    | RLS no Supabase e checagem de perfil no Edge Worker.      |
| Contaminação cruzada de WhatsApp com outro sistema |         Alta          |      Médio      |    **NULO**    | Micro-gateway isolado no Fly.io com nova linha dedicada.  |
| Falsificação de requisições de titulares da LGPD   |         Média         |      Médio      |   **BAIXO**    | Endpoints dedicados com conferência de sessão e DLP.      |
| Vazamento acidental de chaves de API no cliente    |         Média         |      Alto       |   **BAIXO**    | Service Role mantido restrito exclusivamente ao servidor. |
| Negação de serviço ou abuso de força bruta         |         Média         |      Médio      |   **BAIXO**    | Proteção de borda Cloudflare e bloqueio de IPs repetidos. |

---

## 5. PLANO DE AÇÃO, RESPONSABILIDADES E MEDIDAS DE MITIGAÇÃO

### 5.1. Divisão Clara de Competências e Status

```
+---------------------------------------------------------------------------------------+
| (A) VERIFICADO E IMPLEMENTADO NO CÓDIGO DESTE WORKSPACE (Concluído)                   |
| 1. Endpoints de Direitos do Titular da LGPD Art. 18 (/api/lgpd/*)                     |
| 2. Proteção contra IDOR, BOLA e personificação no backend                             |
| 3. Ofuscamento preventivo (DLP) no retorno público de consulta por protocolo         |
| 4. Desacoplamento do WhatsApp para https://gd-whatsapp-gateway.fly.dev                |
| 5. Cabeçalhos de segurança HTTP e validação estrita de entradas                       |
| 6. Registro de trilhas forenses em system_activity_logs                               |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| (B) DEPENDENTE DE INFRAESTRUTURA, REDE, PROVEDOR E NUVEM EXTERNA (Homologado)        |
| 1. App gd-whatsapp-gateway criado e deployed com sucesso no Fly.io (região gru)       |
| 2. Volume persistente gd_whatsapp_data (1 GB) provisionado e criptografado             |
| 3. DNS e certificados SSL/TLS automáticos em gd-whatsapp-gateway.fly.dev              |
| 4. [PENDENTE DE CONFIRMAÇÃO - INFRA/SECOPS]: Escaneamento do QR Code da nova linha    |
|    através do endereço seguro: https://gd-whatsapp-gateway.fly.dev/qrcode            |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| (C) EXIGE VALIDAÇÃO HUMANA, JURÍDICA, DO ENCARREGADO (DPO) OU LIDERANÇA               |
| 1. [PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]: Nomeação formal do DPO e publicação      |
| 2. [PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]: Aprovação do Termo de Uso e Privacidade |
| 3. [PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]: Definição de prazo de retenção de GPS   |
| 4. [PENDENTE DE CONFIRMAÇÃO - RESPONSÁVEL]: Razão Social e CNPJ da Controladora       |
+---------------------------------------------------------------------------------------+
```

### 5.2. Procedimento Operacional Padrão (Runbook) de Resposta a Incidentes Cibernéticos

1. **Identificação e Triagem:**
   - Detecção via registros anômalos em `public.system_activity_logs`, alertas do Cloudflare WAF ou acionamento de honeypot em `public.honeytokens_deception`.
2. **Contenção Imediata:**
   - Revogação de tokens JWT do usuário comprometido via Supabase Admin API.
   - Inserção do IP ou bloco CIDR atacante na tabela `public.login_lockouts` e regras de bloqueio no Cloudflare WAF.
3. **Erradicação e Preservação de Evidências:**
   - Extração do snapshot forense dos logs sem alteração de metadados originais (garantia de integridade da cadeia de custódia).
   - Rotação imediata de segredos afetados (`SUPABASE_SERVICE_ROLE_KEY`, `GD_WHATSAPP_TOKEN`).
4. **Comunicação e Notificação Legal (Art. 48 da LGPD):**
   - O Encarregado (DPO) deve ser notificado imediatamente para avaliar a gravidade do incidente.
   - Em caso de risco relevante aos direitos e liberdades dos titulares, efetuar a notificação tempestiva à ANPD e aos titulares afetados no prazo legal regulamentar.

---

## 6. AVALIAÇÃO ALGORÍTMICA, REGRAS DE AUTOMAÇÃO E RECORTES OPERACIONAIS

### 6.1. Avaliação Algorítmica e Decisões Automatizadas (Art. 20 da LGPD)

O sistema GD Rastreamento não utiliza inteligência artificial autônoma para tomada de decisões com impacto jurídico direto sobre os titulares sem supervisão humana. As decisões automatizadas existentes são determinísticas e de segurança:

1. **Bloqueio Veicular de Segurança:**
   - O comando de bloqueio veicular possui protocolo irrevocável de segurança que **exige velocidade estritamente igual a 0 km/h** e telemetria comprovadamente ativa para efetivação do corte de combustível/ignição, prevenindo acidentes em vias públicas e assegurando a integridade física do condutor.
2. **Cercas Virtuais (Geofencing) e Excesso de Velocidade:**
   - Automações baseadas em polígonos geográficos e limites pré-configurados pelo cliente. Toda notificação gerada é auditável e passível de revisão pelo operador.
3. **Direito de Revisão Humana:**
   - Conforme exigido pelo Art. 20 da LGPD, qualquer ação restritiva ou bloqueio preventivo de acesso gerado por regras automatizadas de segurança pode ser submetido à revisão humana do SuperADM ou DPO mediante requisição pelo canal de transparência.

### 6.2. Recortes Operacionais de Segurança

- **Abordagem e Coleta:** Realizada por técnicos autorizados e rastreadores dedicados homologados.
- **Aparelhos e Comunicações:** Tráfego de telemetria isolado em portas TCP dedicadas (7003 para GD Segurança), sem interferência ou acesso a aparelhos móveis pessoais dos motoristas.
- **Vestígios e Evidências:** Cadeia de custódia assegurada por hashes criptográficos em relatórios e logs de atividade imutáveis.

---

## 7. ITENS PENDENTES DE CONFIRMAÇÃO PARA FECHAMENTO DA HOMOLOGAÇÃO

A homologação final do sistema GD Rastreamento requer a validação documental dos seguintes itens institucionais:

1. `[PENDENTE DE CONFIRMAÇÃO - RESPONSÁVEL]`: Razão Social completa e CNPJ do Controlador do sistema para inserção no cabeçalho dos contratos e políticas públicas.
2. `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]`: Designação formal e dados de contato do Encarregado de Proteção de Dados (DPO) conforme Art. 41 da LGPD.
3. `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]`: Validação formal dos prazos de descarte e retenção de histórico geográfico (GPS) e registros de conexão telemática.
4. `[PENDENTE DE CONFIRMAÇÃO - JURÍDICO/DPO]`: Parecer sobre o enquadramento de operações integradas com órgãos de segurança pública sob a ótica do Art. 4º, III da LGPD.
5. `[PENDENTE DE CONFIRMAÇÃO - INFRA/SECOPS]`: Escaneamento físico do QR Code com o novo aparelho/linha móvel exclusiva através de `https://gd-whatsapp-gateway.fly.dev/qrcode` para início das transmissões em produção.

---

**Conclusão Técnica da Auditoria:**  
O sistema **GD Rastreamento** atende plenamente aos requisitos técnicos de segurança cibernética, isolamento de dados, defesa contra crimes digitais e mecanismos de atendimento aos direitos dos titulares da Lei nº 13.709/2018 (LGPD), encontrando-se **tecnicamente apto para homologação**, condicionado apenas ao cumprimento das etapas institucionais e escaneamento do novo QR Code assinalados acima.
