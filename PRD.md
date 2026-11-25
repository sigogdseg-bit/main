# PRD — GD Segurança (GD-SEGURANÇA / DJR-NEW)

> **Documento Oficial de Requisitos de Produto (Product Requirements Document)**  
> **Versão do Sistema:** `v1.0.1.50`  
> **Status da Auditoria:** 100% Auditado Factualmente via `/dev-analise`  
> **Data de Atualização:** 25 de Novembro de 2026  
> **Classificação de Integridade:** Produção Crítica / Grau de Defesa Militar

---

## 1. Visão Geral e Propósito

O **GD Segurança** (GD Rastreamento) é a plataforma canônica de rastreamento veicular, telemetria avançada, automonitoramento operacional, gestão de frotas, vigilância patrimonial georreferenciada e segurança cibernética do ecossistema Antigravity.

Projetado para operar em tempo real com tolerância zero a falhas e zero invenção de dados, o sistema atende desde proprietários de veículos particulares, locadoras de veículos e frotistas corporativos até redes de franquias, postos de vigilância patrimonial armada e desarmada, revendedores e frotas táticas institucionais. O sistema integra hardware de telemetria 4G (protocolo Concox/GT06 e rastreadores J16 Voxter), fusão inercial de odômetros em 8 camadas matemáticas, bloqueio veicular com salvaguardas físicas de velocidade, faturamento recorrente, laudos de instalação com registros fotográficos, rondas de vigilantes com checkpoints georreferenciados e central de inteligência contra ameaças digitais.

---

## 2. Arquitetura e Stack Tecnológica

| Camada                  | Tecnologia Adotada                       | Finalidade no Sistema                                                                                                      |
| :---------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **Apresentação / PWA**  | React 19.2 + Vite 8.0 + TypeScript 5.8.3 | Single Page Application (SPA) e Progressive Web App de alta performance                                                    |
| **Roteamento**          | TanStack Router (Start) 1.170            | Roteamento baseado em arquivos com árvore de rotas tipadas (80 identificadores de rota em `src/routeTree.gen.ts`)          |
| **Design System**       | Tailwind CSS 4.2 + Lucide Icons          | Modos Claro (Neumórfico suave canônico #eaf0f8) e Noturno Tático (Perfil Laranja Escuro da Marca #0a0a0c / Laranja Tático) |
| **Cartografia Dual**    | MapLibre GL 6.10 + Leaflet Engine        | Mapas híbridos 2D ultrarrápidos e 3D vetoriais com rotação de rumo, polígonos de rondas e replay temporal                  |
| **Computação de Borda** | Servidor Nitro nativo (`src/server.ts`)  | Proxy reverso de mensageria, endpoints com `service_role`, Web Push VAPID e Kill Switch emergencial                        |
| **Banco de Dados**      | Supabase PostgreSQL 15                   | 72 tabelas públicas, 242 migrations SQL e reatividade contínua via Supabase Realtime                                       |
| **Segurança no Banco**  | Row Level Security (RLS) + 146 Funções   | Políticas de linha e funções atômicas `SECURITY DEFINER` com `search_path = public, auth, pg_temp`                         |
| **Mensageria Externa**  | Gateway Baileys + Webhooks               | Envio de alertas de 1 toque, automonitoramento WhatsApp com circuit breaker, anti-loop e isolamento estrito ao SuperADM    |
| **Qualidade e Testes**  | Node Test Runner (`node:test`) + `tsx`   | **1.476 testes automatizados (192 suítes) com 100% de aprovação**                                                          |

---

## 3. Perfis de Usuário e Matriz de Acesso (RBAC)

O sistema segrega estritamente o acesso em 12 perfis distintos, protegidos por guards de interface (`AuthContext.tsx`) e confirmados fisicamente no banco de dados por políticas de RLS e funções RPC:

| Perfil                      |    Nível de Acesso     | Escopo de Visualização e Operação                                                                                                                                                                           |
| :-------------------------- | :--------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SuperADM**                |    Total / Soberano    | Acesso irrestrito a configurações globais, bancada de comandos J16, DRE corporativo, expurgo, kill switch WhatsApp e recebimento exclusivo de cópias de leads e transbordo humano.                          |
| **Degustação Plano Master** | Cliente Fictício (24h) | Acesso completo às funcionalidades do Plano Master de Cliente (mapa 3D, rotas, frota, manutenção, motoristas) com dados fictícios isolados em sandbox, expiração em 24h e bloqueio a dados administrativos. |
| **Administrador**           |   Gestão Operacional   | Administração de clientes, frotas, mensalidades, faturamento, estoque de kits e relatórios operacionais.                                                                                                    |
| **Operador**                |      Operacional       | Monitoramento GPS em tempo real, disparo de comandos seguros, chat e chamados de suporte.                                                                                                                   |
| **Supervisor**              |  Supervisão de Rondas  | Gestão de postos de vigilância, definição de perímetros poligonais, desenho de checkpoints e auditoria de check-ins de vigilantes.                                                                          |
| **Cliente**                 |   Titular do Veículo   | Acesso estrito aos veículos de sua titularidade (`cliente_id`), bloqueio do seu carro, locatários vinculados e faturas.                                                                                     |
| **Locatário**               |  Sub-Locação Veicular  | Acesso condicionado aos veículos permitidos delegados pelo cliente locador, com permissões granulares de bloqueio e desbloqueio.                                                                            |
| **Motorista**               |    Portal PWA Móvel    | Acesso exclusivo ao veículo designado, controle de CNH e lançamento de despesas e abastecimentos.                                                                                                           |
| **Instalador**              |    Técnico de Campo    | Acesso restrito às ordens de instalação atribuídas, checklist de bancada e laudos fotográficos.                                                                                                             |
| **Revendedor**              |  Franqueado Parceiro   | Gestão de sua carteira de clientes, comissões de mensalidade e demonstrativo financeiro setorial (DRE).                                                                                                     |
| **Vendedor**                |   Comercial Parceiro   | Geração de propostas comerciais e links de auto-cadastro com piso mínimo protegido (+ R$ 15,00).                                                                                                            |
| **Funcionário**             |  Operador Corporativo  | Gestão de frotas e motoristas delegada pelo cliente empresarial contratante.                                                                                                                                |

---

## 4. Módulos e Funcionalidades do Sistema

### 4.1. Monitoramento GPS em Tempo Real, Rotas e Cockpit Veicular (`/monitor-gps`, `/rotas`, `/compartilhar/$token`)

- **Cockpit com 8 Motores de Odômetro:** Fusão comparativa entre WGS-84, Cinemático, J16 Flash EEPROM, Motor A Bayesiano 1D (Gauss + ZVU), Motor B Haversine, Motor C EKF Taylor 4ª ordem, Medidor 7 Média Fusional e Medidor 8 Motor D (Compensação Cinemática Retroativa para gaps GNSS com ignição ligada). `[IMPLEMENTADA]`
- **Pulso da Central 24x7 com Histerese Anti-Flicker:** Conexão contínua com Supabase Realtime (`hunter_telemetria_changes`). Isolamento do relógio visual de exibição (`há Xs`) e histerese de 4 segundos em caso de oscilação transitória de conexão (`CLOSED`/`CHANNEL_ERROR`), mantendo o indicador estável e mudando para vermelho imediatamente apenas em caso de queda real de rede (`navigator.onLine === false`). `[IMPLEMENTADA]`
- **Refazer Trajeto e Telemetria com Exportação Visual:** Modal de reconstrução temporal de viagens por ciclo ou data, com gráfico de velocidade e inclinação, cálculo de paradas em destino e renderização de rota real sem sobreposição de barras visuais. `[IMPLEMENTADA]`
- **Alerta Preditivo de Descarga Parasita de Bateria:** Monitoramento inteligente de queda de voltagem (> 0.2V/h por mais de 3 horas com ignição desligada), prevenindo perda total de carga no veículo. `[IMPLEMENTADA]`
- **Cartografia Híbrida 2D/3D:** Alternância fluida entre camadas (Ruas, Noturno Tático, Satélite) com zoom expandido (níveis 19 a 21 sem tela cinza). `[IMPLEMENTADA]`
- **Bloqueio e Desbloqueio Seguro:** Protocolo em duas fases que impede o corte de combustível em velocidade superior a 0 km/h ou sem telemetria recente. `[IMPLEMENTADA]`
- **Âncora Virtual de 1 Toque:** Perímetro de segurança circular ativado ao estacionar, com compensação de dispersão métrica e detecção de reboque ou guincho. `[IMPLEMENTADA]`
- **Replay de Histórico e Viagens:** Linha do tempo animada com gráficos de elevação, velocidade, paradas e ignição. `[IMPLEMENTADA]`
- **Criação e Controle de Rotas (`/rotas`):** Módulo de planejamento de trajetos, definição de corredores autorizados e comparação entre rota planejada e executada. `[IMPLEMENTADA]`
- **Compartilhamento Público com Modo Stealth (`/compartilhar/$token`):** Geração de link com token temporário e QR Code; permite congelar coordenadas públicas sem afetar a central. `[IMPLEMENTADA]`
- **Leitura Manual MCU J16 (Comando `MILEAGE#`):** Leitura sob demanda canônica via SMS/GPRS ou bancada técnica da memória flash do equipamento J16 Voxter, preservando franquia M2M e vida útil de gravação da MCU. `[IMPLEMENTADA]`

### 4.2. Gestão de Frotas, Veículos, Clientes e Motoristas (`/frota`, `/motoristas`, `/motorista`, `/clientes`, `/funcionarios`, `/abastecimento`, `/manutencao`)

- **Cadastro Completo de Veículos (`/frota`):** Controle de chassis, marcas, placas Mercosul, modelos e modos de horímetro (pós-chave ou vibração). `[IMPLEMENTADA]`
- **Gestão Cadastral e Jurídica de Clientes (`/clientes`):** Cadastro de pessoas físicas e jurídicas, veículos vinculados, contratos ativos e responsáveis operacionais. `[IMPLEMENTADA]`
- **Gestão de Funcionários de Frotas (`/funcionarios`):** Delegação e controle de permissões para operadores e condutores de frotistas empresariais. `[IMPLEMENTADA]`
- **Controle de Abastecimentos (`/abastecimento`):** Registro de abastecimentos, postos conveniados, odômetro do veículo, tipo de combustível e cálculo de média de consumo (km/l). `[IMPLEMENTADA]`
- **Gestão de Manutenções Preventivas e Corretivas (`/manutencao`):** Agendamentos por data e quilometragem, histórico de oficinas e controle de custos de peças. `[IMPLEMENTADA]`
- **Portal do Condutor PWA (`/motorista`):** Interface móvel adaptativa para checklist de partida, abastecimento e registro de despesas com fotos de comprovantes. `[IMPLEMENTADA]`
- **Gestão e Conciliação de Tags de Pedágio:** Conciliação geoespacial e temporal de passagens de pedágio (Sem Parar, ConectCar, Veloe) com a telemetria GPS e importação de extratos em CSV. `[IMPLEMENTADA]`
- **Monitoramento de Validade de CNH (`/motoristas`):** Alertas preventivos automáticos de vencimento e controle de pontuação. `[IMPLEMENTADA]`
- **Cálculo de Score de Condução:** Pontuação base 100 com penalidades proporcionais por frenagens bruscas e excessos de velocidade (> 90 km/h). `[IMPLEMENTADA]`

### 4.3. Instalações Técnicas, Credenciamento e Onboarding (`/instalacao`, `/cadastro-instalador`, `/onboarding/acompanhamento`)

- **Esteira de Atendimento Técnico e Ordens (`/instalacao`):** Interface tática de alta visibilidade com abas de contraste acentuado (padrão Rastreadores J16), badges numéricos em tempo real e layout flexível anti-overflow. `[IMPLEMENTADA]`
- **Baixa Atômica de Estoque:** Descontos automáticos de chicotes, relés, rastreadores e chips M2M vinculados à ordem. `[IMPLEMENTADA]`
- **Liquidação de Mão de Obra:** Controle de repasses financeiros por instalação com chave PIX do instalador. `[IMPLEMENTADA]`
- **Auto-Cadastro por Convite (`/cadastro-instalador`):** Geração de link exclusivo para credenciamento autônomo de instaladores parceiros. `[IMPLEMENTADA]`
- **Acompanhamento de Onboarding (`/onboarding/acompanhamento`):** Painel do ciclo de vida de ativação de clientes, rastreadores e vínculos veiculares. `[IMPLEMENTADA]`

### 4.4. Suprimentos, Dispositivos e Chips M2M (`/estoque`, `/dispositivos`)

- **Gestão de Kits e Peças (`/estoque`):** Controle de saldo mínimo, composição de kits de instalação e histórico de movimentações. `[IMPLEMENTADA]`
- **Leitor Inteligente de NF-e (PDF/OCR):** Importação automatizada de dados de notas fiscais com extração dinâmica sob demanda para inclusão no estoque. `[IMPLEMENTADA]`
- **Controle de Chips M2M (`/dispositivos`):** Monitoramento de operadoras calibrado com medições reais de consumo, virada no dia 23 e chips livres com 0.00 MB. `[IMPLEMENTADA]`

### 4.5. Comercial, Parcerias, Franquias e Assinatura Digital (`/propostas`, `/revendedores`, `/minha-franquia`, `/minhas-vendas`, `/cadastro-cliente`, `/cadastro-parceiro`, `/demonstracao`, `/assinar`, `/verificar`)

- **Emissão de Propostas Comerciais (`/propostas`):** Gerador de propostas com numeração sequencial atômica, simulação de planos e carregamento assíncrono de PDF sob demanda. `[IMPLEMENTADA]`
- **Portal de Revendedores e Vendedores (`/revendedores`, `/minha-franquia`, `/minhas-vendas`):** Dashboard individualizado com controle de comissões, faturamento da carteira e DRE setorial. `[IMPLEMENTADA]`
- **Auto-Cadastro de Clientes por Convite (`/cadastro-cliente`):** Fluxo público de adesão autônoma de novos clientes com proteção de dados. `[IMPLEMENTADA]`
- **Auto-Cadastro de Parceiros Comerciais (`/cadastro-parceiro`):** Credenciamento público e seguro de revendedores e vendedores. `[IMPLEMENTADA]`
- **Ambiente de Demonstração Guiada (`/demonstracao`):** Showcase interativo com visualização funcional dos recursos do sistema para prospects. `[IMPLEMENTADA]`
- **Portal de Assinatura Digital de Contratos (`/assinar`):** Assinatura eletrônica com geolocalização do signatário, carimbo de data e hora e hash de integridade. `[IMPLEMENTADA]`
- **Portal Público de Validação Documental (`/verificar`):** Consulta pública de autenticidade documental por hash criptográfico SHA-256 via RPC segura. `[IMPLEMENTADA]`
- **Salvaguarda Comercial de Piso Mínimo:** Trava de segurança que impede a geração de links de venda com margem inferior a R$ 15,00 acima do custo base. `[IMPLEMENTADA]`
- **Redefinição Segura de Senha de Parceiros:** RPC com imposição de troca de senha no primeiro acesso e validação de CPF/CNPJ. `[IMPLEMENTADA]`

### 4.6. Financeiro, Mensalidades e DRE (`/financeiro`, `/mensalidades`)

- **Faturamento Recorrente de Mensalidades (`/mensalidades`):** Gestão de títulos, controle de inadimplência, juros diários e multas automáticas. `[IMPLEMENTADA]`
- **Lembrete Preventivo de Mensalidade via WhatsApp com PIX:** Notificação amigável de 1 a 3 dias antes do vencimento com chave PIX e valor detalhado. `[IMPLEMENTADA]`
- **Livro-Caixa e Gestão de Despesas (`/financeiro`):** Lançamentos com categorias contábeis, conversão cambial (USD) e parcelamentos. `[IMPLEMENTADA]`
- **Demonstrativo do Resultado do Exercício (DRE):** Apuração contábil de receitas, custos diretos de instalação, chips e margem líquida com exportações em PDF e Excel carregadas sob demanda. `[IMPLEMENTADA]`
- **Exportação Contábil SPED Fiscal:** Exportação oficial no layout SPED Fiscal (Blocos 0, C, D, E e 9) para integração com sistemas contábeis e EFD ICMS/IPI. `[IMPLEMENTADA]`

### 4.7. Central de Segurança, Defesa Cibernética e Bancada J16 (`/configuracao/central-seguranca`, `/configuracao/logs`, `/configuracao/rastreador-j16`)

- **21 Módulos de Auditoria em Tempo Real (`/configuracao/central-seguranca`):** Status de sockets TCP, polling a cada 30 segundos, matriz de risco e saúde do sistema. `[IMPLEMENTADA]`
- **Catálogo de 51 Vetores de Ataque Reais:** Monitoramento de SQL Injection, XSS, Spoofing GPS, Jammer e Replay em 9 categorias. `[IMPLEMENTADA]`
- **Bancada Especialista Rastreador J16 (`/configuracao/rastreador-j16`):** Painel de envio, auditoria e batch de comandos de telemetria, corte e parametrização direta do hardware Voxter J16. `[IMPLEMENTADA]`
- **Proteção Anti-Jammer Inteligente:** Detecção de inibidores de sinal condicionada a velocidade física comprovada. `[IMPLEMENTADA]`
- **Detecção Comportamental UEBA e Honeytokens:** Rastreamento de acessos anômalos e armadilhas para captura de credenciais sintéticas. `[IMPLEMENTADA]`
- **Trilha Forense Imutável (`/configuracao/logs`):** Registro completo de IPs, sessões, horários e ações em `system_activity_logs`. `[IMPLEMENTADA]`
- **Emissão de Laudo Pericial Forense Oficial com Selo SGD e QR Code:** Geração de laudo pericial oficial em PDF com numeração SGD atômica (ou `SGD-SIM-XXXXXXXX` em simulação), código curto verificador, QR Code para validação pública, hash forense SHA-256 e Chancela de Simulação obrigatória em modo de degustação e veículos de teste. `[IMPLEMENTADA]`

### 4.8. Mensageria, WhatsApp, Anti-Loop e Modo de Bloqueio Emergencial (`/api/whatsapp`, `/atendimento`, `/chat`, `/configuracoes`)

- **Micro-Gateway Baileys com Descoberta Dinâmica de Linha:** Rastreamento dinâmico do número conectado em tempo de execução via `sock.user.id` e endpoint `/status`, permitindo troca de chips sem alteração de código-fonte. `[IMPLEMENTADA]`
- **Blindagem Anti-Loop e Anti-Eco em Duas Camadas:** Descarte sumário de mensagens contendo cabeçalhos de sistema (`🚨 *GD`, `🛡️ *GD`, `• Interessado(a):`, `Comando não reconhecido`, `📋 Comercial:`) e rejeição de mensagens com remetente do próprio robô (`fromMe` e `isNumeroRoboOuGateway`). `[IMPLEMENTADA]`
- **Validação Estrutural da Entrada de Localização:** Rejeição rigorosa de respostas com quebras de linha (`\n`), mais de 80 caracteres ou símbolos de robô na etapa `aguardando_localizacao`, impedindo que respostas de bots sejam aninhadas como localização. `[IMPLEMENTADA]`
- **Isolamento de Cópias Estritamente para o SuperADM:** Cópias de leads, solicitações comerciais e transbordo humano são despachadas exclusivamente para o SuperADM (`5524992494030`). Operadores e administradores gerais nunca recebem cópias no WhatsApp. `[IMPLEMENTADA]`
- **Modo de Bloqueio Emergencial via Central (Kill Switch Instantâneo):** Botão de parada imediata em `/configuracoes`, conectado aos endpoints `/api/whatsapp/bloqueio-emergencial` no backend e no gateway, suspendendo 100% dos envios e respostas ativas na hora. `[IMPLEMENTADA]`
- **Rate Limiter e Circuit Breaker Físico:** Disjuntor de taxa limitando a no máximo 4 mensagens a cada 15 segundos por número e disjuntor global de no máximo 12 mensagens a cada 10 segundos no gateway. Deduplicação com janela de 120 segundos para alertas de leads. `[IMPLEMENTADA]`
- **Notificações Web Push VAPID em Segundo Plano:** Service Worker oficial (`/sw.js`) ativo para entrega de alertas com tela bloqueada. `[IMPLEMENTADA]`
- **Webhook de Ligação Telefônica de Emergência:** Acionamento de chamada direta ao operador para ocorrências críticas. `[IMPLEMENTADA]`
- **Chat Interno com Modo Supervisão (`/chat`, `/atendimento`):** Conversas em tempo real com indicador de presença e auditoria administrativa. `[IMPLEMENTADA]`

### 4.9. Configurações Globais, Temas e Gestão de Usuários (`/configuracoes`, `/configuracao/temas`, `/usuarios`, `/login`, `/inicio`)

- **Painel Geral de Configurações (`/configuracoes`):** Ajustes de parâmetros do sistema, prazos de alerta, tolerâncias de velocidade e controle de bloqueio emergencial do WhatsApp. `[IMPLEMENTADA]`
- **Personalização de Temas e Design System (`/configuracao/temas`):** Alternância e calibração de modos Claro (#eaf0f8 - Neumórfico suave) e Noturno Tático (#0a0a0c / Perfil Laranja Escuro da Marca), com persistência em camada tripla. `[IMPLEMENTADA]`
- **Gestão Global de Usuários e Perfis (`/usuarios`):** Controle de contas, redefinição de acessos e concessão de privilégios RBAC com 12 perfis suportados. `[IMPLEMENTADA]`
- **Fluxos de Autenticação e Entrada Segura (`/login`, `/inicio`):** Validação de credenciais, controle de sessão ativa e redirecionamento por perfil. `[IMPLEMENTADA]`

### 4.10. Gestão de Locatários e Sub-Locação Veicular (`/cadastro-locatario`, `src/features/locatarios`)

- **Subordinação de Locatários ao Cliente Titular:** Tabela `locatarios_cliente` vinculando condutores autorizados à carteira de veículos do cliente locador. `[IMPLEMENTADA]`
- **Controle Granular de Bloqueio e Desbloqueio:** Permissões individuais (`pode_bloquear`, `pode_desbloquear`) configuráveis por locatário. `[IMPLEMENTADA]`
- **Auto-Cadastro por Convite Seguro (`/cadastro-locatario`):** Geração de link com token temporário e expiração programada para adesão autônoma de locatários. `[IMPLEMENTADA]`
- **RLS com Menor Privilégio:** Isolamento estrito no banco impedindo que locatários acessem dados financeiros ou veículos de outros clientes. `[IMPLEMENTADA]`

### 4.11. Vigilância Patrimonial, Postos e Rondas Georreferenciadas (`/vigilantes`, `src/features/vigilantes`)

- **Gestão de Postos de Vigilância e Perímetros:** Cadastro georreferenciado de postos (`postos_vigilancia`) com definição de perímetros poligonais e raios de contenção em metros. `[IMPLEMENTADA]`
- **Checkpoints Georreferenciados de Ronda:** Desenho de rotas de ronda (`rondas_checkpoints`) com ordenação sequencial, raio de captura estrito (15 metros) e tolerância temporal (3 minutos). `[IMPLEMENTADA]`
- **Gestão de Turnos de Vigilância:** Configuração de turnos diurno, noturno, 12x36 e 24x48 com alocação de efetivo tático. `[IMPLEMENTADA]`
- **Auditoria de Check-ins em Tempo Real:** Registro e classificação de conformidade de ronda (`conforme`, `atrasado`, `adiantado`, `pendente`) em `rondas_execucoes` e `registros_ronda`. `[IMPLEMENTADA]`
- **Perfil Supervisor de Vigilância:** Acesso exclusivo para vistoria de postos e criação de checkpoints diretamente via dispositivo móvel. `[IMPLEMENTADA]`

---

## 5. Modelo de Dados e Banco de Dados (Supabase / Postgres)

- **Volume de Migrações:** 242 arquivos de migração DDL em `supabase/migrations/`.
- **Total de Tabelas no Schema `public`:** 72 tabelas ativas.
- **Stored Procedures e Funções:** Mais de 146 funções únicas catalogadas e RPCs ativas invocadas no frontend e rotinas de borda (`SECURITY DEFINER` e `search_path = public, auth, pg_temp`).

### Entidades do Schema Público Auditadas (72 Tabelas):

1. `agendamentos_manutencao`
2. `alertas_seguranca`
3. `alertas_telemetria_cooldown`
4. `areas_seguras`
5. `atendimento_providencias`
6. `atendimentos`
7. `chat_mensagens`
8. `chat_presenca`
9. `chips`
10. `clientes`
11. `compartilhamentos_acessos`
12. `compartilhamentos_temporarios`
13. `contratos_clientes`
14. `convites_cliente`
15. `convites_instalador`
16. `dispositivos_autorizados`
17. `documentos_emitidos`
18. `estoque_itens`
19. `estoque_movimentacoes`
20. `eventos_veiculo`
21. `fornecedores`
22. `funcionarios_cliente`
23. `honeytokens_deception`
24. `horarios_utilizacao`
25. `instalacoes`
26. `instalacoes_historico_atendimentos`
27. `lgpd_solicitacoes`
28. `locatarios_cliente`
29. `login_lockouts`
30. `mensalidades`
31. `motorista_abastecimentos`
32. `motorista_analytics_diario`
33. `motorista_despesas`
34. `motorista_veiculos`
35. `motoristas`
36. `notificacoes_configuracoes`
37. `notificacoes_sistema`
38. `onboarding_etapas_cliente`
39. `planos_manutencao_preventiva`
40. `postos_vigilancia`
41. `profiles`
42. `propostas_comerciais`
43. `rastreadores`
44. `registros_ronda`
45. `regras_veiculo`
46. `relatorio_gerencial_config`
47. `relatorios_diarios_whatsapp`
48. `revendedores`
49. `rondas_checkpoints`
50. `rondas_execucoes`
51. `rotas_monitoradas`
52. `seguranca_dlp_config`
53. `system_activity_logs`
54. `system_login_logs`
55. `telemetria_posicoes`
56. `trajetos_salvos`
57. `transacoes_financeiras`
58. `turnos_vigilancia`
59. `user_module_access`
60. `user_push_subscriptions`
61. `user_roles`
62. `veiculo_analytics_diario`
63. `veiculo_areas_estado`
64. `veiculo_calibracoes_odometro`
65. `veiculo_convidados`
66. `veiculos`
67. `vendedores`
68. `viagens_trajetos`
69. `vigilantes`
70. `whatsapp_config`
71. `whatsapp_mensagens_fila`
72. `whatsapp_sessoes_dialogo`

---

## 6. Integrações Externas e Comunicação

1. **Protocolo Concox / GT06 (Porta 7003 GD / Porta 7002 Guardião):** Ingestão contínua de pacotes binários de telemetria enviados por rastreadores 4G, com separação física de portas e zero conflito de reprogramação com a base do SIGO Guardião.
2. **Micro-gateway WhatsApp Baileys com Descoberta Dinâmica:** Pareamento via QR Code, armazenamento de sessão isolado, descoberta dinâmica do chip conectado (`sock.user.id`), rate limiters e disjuntores de segurança.
3. **MapTiler / OpenStreetMap:** Servidores de tiles cartográficos de alta definição com chaves seguras.
4. **Web Push VAPID:** Infraestrutura padronizada IETF para notificações PWA no navegador e Android TWA.
5. **MacroDroid Gateway:** Integração local via webhook para discagem automática de alertas no celular do operador.

---

## 7. Regras de Negócio Inegociáveis (Regras Pétreas)

1. **Causa Raiz Obrigatória:** É proibido aplicar contornos sintomáticos ou mascaramentos; diagnósticos devem ser sustentados por evidências de código e banco.
2. **Zero Invenção de Dados:** Proibido o uso de mocks, dados sintéticos ou estimativas aleatórias em produção.
3. **Bloqueio Seguro Inegociável:** O corte de ignição é bloqueado no banco caso o veículo esteja em movimento (velocidade > 0 km/h) ou sem sinal recente.
4. **Isolamento de RLS:** Toda tabela com dados de clientes, veículos, locatários e vigilantes deve possuir política de RLS vinculada ao `auth.uid()`.
5. **Exclusividade das Notificações ao SuperADM:** Cópias de leads, solicitações comerciais e transbordo humano via WhatsApp pertencem com exclusividade ao SuperADM (`5524992494030`). Operadores e administradores gerais nunca recebem cópias no WhatsApp.
6. **Anti-Loop de Mensageria:** Proibição absoluta de processar respostas automáticas de outros sistemas/robôs ou mensagens que contenham comandos do sistema. Rejeição de entradas multi-linhas ou com símbolos na coleta de dados.
7. **Preservação de Integridade:** Modificações devem preservar alterações preexistentes; commits, tags e publicações dependem de autorização explícita do usuário (Gate 6).

---

## 8. Diagnóstico Consolidado da Implementação

| Módulo Funcional                          | Implementadas | Parciais | Não Implementadas |     Status Geral     |
| :---------------------------------------- | :-----------: | :------: | :---------------: | :------------------: |
| **Cockpit, Rotas e Monitoramento GPS**    |      22       |    0     |         0         |      `ESTÁVEL`       |
| **Gestão de Frotas, Veículos e Clientes** |      18       |    0     |         0         |      `ESTÁVEL`       |
| **Motoristas e Portal PWA**               |      10       |    0     |         0         |      `ESTÁVEL`       |
| **Instalações, Ordens e Onboarding**      |      15       |    0     |         0         |      `ESTÁVEL`       |
| **Estoque, Peças e Dispositivos**         |      11       |    0     |         0         |      `ESTÁVEL`       |
| **Comercial, Propostas e Assinatura**     |      18       |    0     |         0         |      `ESTÁVEL`       |
| **Financeiro, Mensalidades e DRE**        |      14       |    0     |         0         |      `ESTÁVEL`       |
| **Central de Segurança, Logs e J16**      |      15       |    0     |         0         |      `BLINDADO`      |
| **Mensageria, Push e WhatsApp**           |      16       |    0     |         0         |      `BLINDADO`      |
| **Configurações, Temas e Usuários**       |      13       |    0     |         0         |      `ESTÁVEL`       |
| **Locatários e Sub-Locação Veicular**     |       8       |    0     |         0         |      `ESTÁVEL`       |
| **Vigilância, Postos e Rondas Táticas**   |       8       |    0     |         0         |      `ESTÁVEL`       |
| **Total Geral**                           |    **168**    |  **0**   |       **0**       | **100,0% Concluído** |

---

## 9. Divergências Detectadas e Sanadas (Frontend vs Backend vs Documentação)

- **Eliminação do Loop Infinito no WhatsApp e Proteção Anti-Eco (`v1.0.1.50`):** `[RESOLVIDO]` Corrigida a recursão infinita provocada pela ingestão de respostas automatizadas de outros robôs (SIGO Guardião) na etapa `aguardando_localizacao`. Adicionado filtro semântico de cabeçalhos de sistema, validação estrutural da localização (rejeição de textos multi-linhas, > 80 caracteres ou com símbolos de alerta), disjuntor de taxa (rate limiter e circuit breaker), isolamento das cópias de leads estritamente ao SuperADM (`5524992494030`) e descoberta dinâmica dos números dos chips conectados via `/status` do gateway e variáveis de ambiente.
- **Modo de Bloqueio Emergencial via Central (Kill Switch WhatsApp):** `[RESOLVIDO]` Implementado controle instantâneo de paralisação em `/configuracoes`, integrado com endpoints de contingência no backend Nitro e no Gateway Baileys, permitindo interromper imediatamente envios e respostas ativas em caso de emergência operacional.
- **Estabilização do Pulso da Central 24x7 e Histerese Anti-Flicker (`v1.0.1.50`):** `[RESOLVIDO]` Sanada a oscilação de 1 segundo entre verde e vermelho no indicador do WebSocket Realtime em `GpsMonitorView.tsx` e `useGpsRealtime.ts`. O ciclo do timer visual foi desacoplado da conexão com o Supabase e foi implementada histerese defensiva de 4 segundos para quedas transitórias, mantendo o indicador estável.
- **Correção da Sobreposição de Barras no Modal Refazer Trajeto:** `[RESOLVIDO]` Calibrado o alinhamento visual de badges de status e barras de telemetria no `RefazerTrajetoModal.tsx`, assegurando exibição nítida dos dados de condução e suporte à inclusão de imagens do mapa de trajeto no relatório.
- **Mapeamento Oficial dos Módulos de Locatários e Vigilantes:** `[RESOLVIDO]` Integrados formalmente na documentação os módulos `locatarios` e `vigilantes`, refletindo a existência das 72 tabelas públicas ativas e das rotas `/cadastro-locatario` e `/vigilantes`.
- **Saneamento da Contagem de Migrações e Testes:** `[RESOLVIDO]` Atualizado o volume oficial para 242 migrações DDL e 1.476 testes automatizados aprovados na suíte do Node Test Runner.

---

## 10. Dívidas Técnicas e Oportunidades de Refatoração

1. **Otimização de Bundles Secundários:** `[CONCLUÍDA]` Implementado code splitting com importação dinâmica sob demanda (`await import(...)`) para `jspdf`, `exceljs` e `unpdf` em todos os modais de exportação, geradores de contrato, propostas e leitores de OCR/NF-e.
2. **Medidor 3 J16 (Decisão Arquitetural Homologada):** Homologado formalmente que a leitura sob demanda da MCU J16 via comando `MILEAGE#` não constitui dívida técnica, mas uma salvaguarda física intencional para economia de dados celular e preservação da vida útil da memória flash da MCU do rastreador.

---

## 11. Riscos de Segurança e Integridade

- **Proteção contra Injeção:** Coberta pelo uso do PostgREST com Prepared Statements e tipagem estrita no TypeScript.
- **Risco de Downgrade:** Protegido pelos scripts de marco de segurança A/B e verificação atômica de versão nos 5 arquivos canônicos (`gate:check`).
- **Proteção de Segredos:** Nenhuma chave privilegiada reside no código cliente; todas as rotas sensíveis utilizam o backend Nitro com isolamento de variáveis de ambiente.
- **Proteção contra Recursão de Mensageria:** Bloqueio em camadas física, semântica e de taxa, prevenindo floods ouloops infinitos de mensageria WhatsApp.

---

## 12. Próximos Passos e Prioridades Recomendadas

1. **Gaps de Produto Fechados:** Concluída a implementação de todos os módulos autorizados, incluindo os módulos recentes de sub-locação de veículos (`locatarios`), supervisão de rondas patrimoniais (`vigilantes`), blindagem de telemetria em tempo real e disjuntores de mensageria.
2. **Operação e Governança:** Manutenção preventiva contínua, governança estrita de limites Free Tier e expansão contínua da cobertura de testes automatizados.
