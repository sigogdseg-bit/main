import {
  MapPin,
  Users,
  Wrench,
  Boxes,
  Wallet,
  CreditCard,
  Shield,
  FileText,
  Radio,
  MessageSquare,
  Smartphone,
  Palette,
  Cpu,
  Headphones,
  Sparkles,
  TrendingUp,
  Store,
  FileCheck,
  Bot,
} from "lucide-react";
import type { ElementType } from "react";
import type { UserSession } from "@/features/auth/types";

export interface PassoManual {
  ordem: number;
  acao: string;
  detalhe: string;
  dica?: string;
}

export interface SecaoManual {
  id: string;
  titulo: string;
  subtitulo: string;
  podeAcessar?: (session: UserSession | null) => boolean;
  passos: PassoManual[];
  dicasSeguranca?: string[];
}

export interface ModuloManual {
  id: string;
  titulo: string;
  rota: string;
  tag: string;
  icone: ElementType;
  resumo: string;
  podeAcessar: (session: UserSession | null) => boolean;
  secoes: SecaoManual[];
}

// Catálogo Canônico dos Manuais Modulares do GD Rastreamento
// Regra Pétrea: Zero ocorrências do caractere comercial proibido (uso estrito da conjunção "e")
export const MANUAIS_MODULOS: ModuloManual[] = [
  {
    id: "mapa-operacional",
    titulo: "Mapa Operacional e Telemetria",
    rota: "/monitor-gps",
    tag: "Tempo Real",
    icone: MapPin,
    resumo:
      "Acompanhamento em tempo real da frota e veículos, status de ignição, bloqueio remoto seguro, telemetria avançada e histórico de rotas.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "mapa-navegacao",
        titulo: "Visualização e Navegação no Mapa",
        subtitulo: "Como interagir com os marcadores de veículos e camadas de visualização",
        passos: [
          {
            ordem: 1,
            acao: "Localizar Veículos na Tela",
            detalhe:
              "Os veículos aparecem no mapa como marcadores dinâmicos. A cor indica o status: Verde para em movimento, Laranja para parado com ignição ligada, e Cinza/Azul para ignição desligada.",
            dica: "Passe o cursor sobre o veículo para pré-visualizar a placa e a velocidade atual.",
          },
          {
            ordem: 2,
            acao: "Alternar Camadas do Mapa",
            detalhe:
              "No canto superior do mapa, você pode alternar entre os modos Vetorial (Ruas), Satélite com imagens reais de alta resolução, ou Escuro tático.",
          },
          {
            ordem: 3,
            acao: "Abrir Cockpit de Telemetria",
            detalhe:
              "Clique sobre o marcador do veículo ou selecione-o na lista lateral para abrir a gaveta de telemetria completa com velocímetro, odômetro, nível de bateria e satélites.",
          },
        ],
      },
      {
        id: "bloqueio-remoto",
        titulo: "Bloqueio e Desbloqueio Seguro do Veículo",
        subtitulo: "Procedimento seguro para corte de combustível ou ignição em caso de emergência",
        passos: [
          {
            ordem: 1,
            acao: "Abrir o Modal de Bloqueio Seguro",
            detalhe:
              "Na gaveta de telemetria do veículo, localize o botão com cadeado 'Bloqueio Seguro'. Clique para abrir o diálogo de confirmação protegida.",
          },
          {
            ordem: 2,
            acao: "Análise Automática de Segurança",
            detalhe:
              "O sistema verifica a velocidade do veículo antes de executar. Para segurança dos ocupantes e do trânsito, o bloqueio deve ser aplicado preferencialmente em velocidades inferiores a 20 km/h.",
          },
          {
            ordem: 3,
            acao: "Confirmar a Operação",
            detalhe:
              "Digite a confirmação exigida na tela e clique em executar. O comando é transmitido via protocolo GT06 ou SMS para o rastreador, confirmando o corte do relé.",
            dica: "Para restaurar o funcionamento normal, utilize o botão 'Desbloquear Veículo' no mesmo painel.",
          },
        ],
        dicasSeguranca: [
          "Nunca aplique o bloqueio imediato se o veículo estiver em rodovia de alta velocidade.",
          "Todas as operações de bloqueio e desbloqueio são registradas com data, hora, usuário e IP nos logs de auditoria.",
        ],
      },
      {
        id: "historico-trajeto",
        titulo: "Histórico de Trajetos e Viagens",
        subtitulo: "Consulta e reprodução de trajetos percorridos por período",
        passos: [
          {
            ordem: 1,
            acao: "Acessar o Painel de Trajetos",
            detalhe:
              "Clique no botão 'Trajeto Temporal' na gaveta do veículo ou selecione 'Histórico de Rotas'.",
          },
          {
            ordem: 2,
            acao: "Definir o Intervalo de Datas e Horários",
            detalhe:
              "Escolha o dia inicial, dia final e horários desejados. Clique em 'Carregar Trajeto'.",
          },
          {
            ordem: 3,
            acao: "Reprodução Animada",
            detalhe:
              "Use os controles de reprodução (Play, Pause e Velocidade) para ver o percurso animado, pontos de parada e velocidade em cada trecho.",
          },
        ],
      },
      {
        id: "compartilhamento-ao-vivo",
        titulo: "Compartilhamento de Localização ao Vivo e Modo Stealth",
        subtitulo: "Geração de links criptografados, auditoria de acessos e congelamento tático",
        passos: [
          {
            ordem: 1,
            acao: "Clicar no Botão Compartilhar",
            detalhe:
              "No cockpit do veículo, clique no ícone de compartilhamento para abrir o modal de link temporário.",
          },
          {
            ordem: 2,
            acao: "Escolher a Validade do Link",
            detalhe:
              "Selecione o tempo desejado (1 hora, 6 horas, 24 horas, 7 dias) ou escolha 'Sem expiração (Encerramento manual)'.",
          },
          {
            ordem: 3,
            acao: "Copiar Link Seguro",
            detalhe: "Copie o link seguro gerado para disponibilizar para a pessoa autorizada.",
            dica: "Você pode revogar o link a qualquer momento clicando em 'Encerrar Compartilhamento'.",
          },
          {
            ordem: 4,
            acao: "Ativar Modo Stealth (Congelamento Tático)",
            detalhe:
              "Em caso de necessidade de sigilo ou preservação da segurança operacional, ative a opção 'Modo Stealth'. As coordenadas exibidas no link público permanecem congeladas na última posição transmitida e novos deslocamentos não são revelados ao visitante.",
            dica: "O veículo continua sendo rastreado normalmente no seu painel privado do sistema, apenas o link público fica congelado.",
          },
          {
            ordem: 5,
            acao: "Auditoria de Visualizações e Trajeto Visualizado",
            detalhe:
              "No modal de compartilhamento, consulte a lista de acessos ao link com data, horário, endereço IP e navegador do visitante. Clique em 'Ver Trajeto Visualizado' para inspecionar no mapa a rota exata acompanhada pelo visitante e o período em que o Modo Stealth esteve ativo.",
          },
        ],
        dicasSeguranca: [
          "Links públicos são protegidos por tokens únicos e expiram automaticamente conforme o prazo escolhido.",
          "O histórico de visualizações registra cada visita para fins de auditoria e custódia digital.",
        ],
      },
      {
        id: "ancora-virtual-seguranca",
        titulo: "Âncora Virtual e Cerca de Segurança de 1 Toque",
        subtitulo:
          "Bloqueio geográfico instantâneo ao estacionar com detecção de movimento indevido",
        passos: [
          {
            ordem: 1,
            acao: "Ativar a Âncora ao Estacionar",
            detalhe:
              "Ao estacionar o veículo, acione o botão da Âncora Virtual no cockpit. O sistema fixa um perímetro seguro circular de alta precisão ao redor das coordenadas atuais.",
          },
          {
            ordem: 2,
            acao: "Monitoramento com Tolerância Anti-Ruído",
            detalhe:
              "O algoritmo calcula a distância com tolerância configurada contra oscilações de satélites em garagens ou sob coberturas metálicas, evitando disparos falsos.",
          },
          {
            ordem: 3,
            acao: "Alerta Imediato de Deslocamento",
            detalhe:
              "Se o veículo for movimentado ou guinchado para fora do perímetro da âncora, o sistema dispara imediatamente um alerta sonoro de alta prioridade e notificação Web Push inter-dispositivos.",
          },
        ],
      },
      {
        id: "privacidade-localizacao",
        titulo: "Privacidade de Localização",
        subtitulo: "Ocultação temporária da localização geográfica e situação operacional",
        passos: [
          {
            ordem: 1,
            acao: "Compreender a Regra de Privacidade",
            detalhe:
              "Quando a privacidade está ativada, a visualização da posição geográfica exata do veículo no mapa é restrita exclusivamente ao Cliente titular.",
          },
          {
            ordem: 2,
            acao: "Visão de Operadores e Suporte Técnico",
            detalhe:
              "Para operadores de suporte e administração, o mapa oculta a posição e a situação operacional (em rota, parado ou estacionado), exibindo apenas o total de veículos e a saúde do rastreador sob desfoque seguro, preservando a intimidade do Cliente titular que realiza seu próprio auto-monitoramento.",
          },
          {
            ordem: 3,
            acao: "Alternar Status de Privacidade",
            detalhe:
              "A ativação ou desativação do modo de privacidade é restrita ao Cliente titular através do botão dedicado no painel de detalhes do veículo.",
          },
        ],
      },
    ],
  },
  {
    id: "instalacoes-tecnicas",
    titulo: "Instalações Técnicas",
    rota: "/instalacao",
    tag: "Oficina",
    icone: Wrench,
    resumo:
      "Gestão de ordens de instalação física de rastreadores, checklist de montagem, registro fotográfico de segurança, teste de sinal e repasse financeiro.",
    podeAcessar: (s) =>
      Boolean(
        s &&
        (s.isInstalador || s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador"),
      ),
    secoes: [
      {
        id: "painel-instalador",
        titulo: "Painel de Atendimentos e Repasses",
        subtitulo: "Visão geral de ordens pendentes, concluídas e saldo de comissões",
        passos: [
          {
            ordem: 1,
            acao: "Conferir Ordens Pendentes",
            detalhe:
              "Ao acessar o módulo, veja as instalações aguardando atendimento com nome do cliente, modelo do veículo e rastreador designado.",
          },
          {
            ordem: 2,
            acao: "Saldo e Chave PIX",
            detalhe:
              "No cabeçalho do módulo, confira o valor por instalação cadastrado e certifique-se de que sua Chave PIX está preenchida corretamente para o repasse automático.",
          },
        ],
      },
      {
        id: "execucao-instalacao",
        titulo: "Execução do Checklist e Validação de Sinal",
        subtitulo: "Passo a passo para instalar e validar o rastreador no veículo",
        passos: [
          {
            ordem: 1,
            acao: "Iniciar o Atendimento",
            detalhe:
              "Clique na ordem de serviço desejada para abrir a ficha de instalação técnica.",
          },
          {
            ordem: 2,
            acao: "Verificar Conexões Elétricas",
            detalhe:
              "Conecte o positivo (pós-chave e linha 30), negativo (aterramento sólido) e o chicote de corte ao relé conforme o manual do equipamento.",
          },
          {
            ordem: 3,
            acao: "Testar Comunicação GSM e GPS",
            detalhe:
              "Use o botão 'Testar Sinal em Tempo Real'. O sistema consulta o gateway telemático em tempo real para confirmar se o equipamento conectou na rede celular 4G e obteve fixação precisa de satélites.",
          },
          {
            ordem: 4,
            acao: "Fotografar Conexões e Local de Fixação",
            detalhe:
              "Capture as fotos obrigatórias das conexões elétricas e do local oculto onde o rastreador foi acondicionado. O sistema comprime as fotos automaticamente antes do envio.",
          },
          {
            ordem: 5,
            acao: "Concluir e Liberar para o Cliente",
            detalhe:
              "Com as fotos anexadas e o teste aprovado, clique em 'Concluir Instalação'. A ordem é encerrada, o veículo é ativado no mapa do cliente e o repasse é lançado.",
          },
        ],
      },
      {
        id: "convite-autocadastro-instalador",
        titulo: "Convite e Auto-Cadastro de Instaladores Credenciados",
        subtitulo: "Geração de link de credenciamento autônomo para oficinas parceiras",
        podeAcessar: (s) => Boolean(s && (s.isAdmin || s.isSuperAdmin)),
        passos: [
          {
            ordem: 1,
            acao: "Gerar Link de Convite",
            detalhe:
              "No cabeçalho do módulo de Instalações Técnicas ou Usuários, clique em 'Convidar Instalador' para gerar um token de auto-cadastro com QR Code.",
          },
          {
            ordem: 2,
            acao: "Envio ao Parceiro Técnico",
            detalhe:
              "Envie o link seguro para a oficina ou instalador credenciado preencher diretamente no smartphone.",
          },
          {
            ordem: 3,
            acao: "Preenchimento dos Dados da Oficina e PIX",
            detalhe:
              "O instalador preenche seus dados cadastrais, endereço físico da oficina e a Chave PIX oficial para liquidação automática dos repasses de cada serviço realizado.",
          },
        ],
      },
    ],
  },
  {
    id: "clientes-planos",
    titulo: "Clientes e Planos",
    rota: "/clientes",
    tag: "Comercial",
    icone: Users,
    resumo:
      "Cadastro e administração da carteira de clientes, vinculação de veículos, escolha de planos de assinatura e acompanhamento de retenção.",
    podeAcessar: (s) =>
      Boolean(
        s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador" || s.isCliente),
      ),
    secoes: [
      {
        id: "cadastro-cliente",
        titulo: "Cadastrar Novo Cliente",
        subtitulo: "Como incluir um cliente e seus dados de contrato",
        passos: [
          {
            ordem: 1,
            acao: "Abrir o Modal de Novo Cliente",
            detalhe:
              "Clique no botão 'Novo Cliente' no canto superior direito da tela de Clientes.",
          },
          {
            ordem: 2,
            acao: "Preencher Dados Básicos",
            detalhe:
              "Informe Nome Completo, CPF ou CNPJ, Telefone para contato e avisos e e-mail de acesso ao sistema.",
          },
          {
            ordem: 3,
            acao: "Selecionar o Plano de Serviço",
            detalhe:
              "Escolha entre Plano Básico (rastreamento essencial), Plano Pro (telemetria avançada e bloqueio) ou Plano Master (gestão completa com manutenção e trajetos).",
          },
          {
            ordem: 4,
            acao: "Salvar e Gerar Acesso",
            detalhe:
              "Ao salvar, a conta é criada no sistema e o cliente recebe suas instruções de primeiro acesso.",
          },
        ],
      },
      {
        id: "gestao-veiculos-cliente",
        titulo: "Vincular Veículos e Rastreadores",
        subtitulo: "Adicionar veículos à conta do cliente e associar rastreador ativo",
        passos: [
          {
            ordem: 1,
            acao: "Localizar o Cliente na Lista",
            detalhe:
              "Use a barra de pesquisa por nome, documento ou placa para encontrar o cadastro do cliente.",
          },
          {
            ordem: 2,
            acao: "Clicar em 'Adicionar Veículo'",
            detalhe:
              "Preencha a Placa, Marca, Modelo, Ano e Cor do veículo que receberá o rastreamento.",
          },
          {
            ordem: 3,
            acao: "Designar Rastreador e Chip M2M",
            detalhe:
              "Selecione um rastreador disponível no estoque ou digite o IMEI do aparelho a ser instalado.",
          },
        ],
      },
    ],
  },
  {
    id: "atendimento-cliente",
    titulo: "Atendimento ao Cliente",
    rota: "/atendimento",
    tag: "Suporte",
    icone: Headphones,
    resumo:
      "Gestão de chamados de suporte ao cliente, registro de providências técnicas tomadas com data/hora e conclusão formal de atendimentos.",
    podeAcessar: (s) => Boolean(s && (s.isAdmin || s.isSuperAdmin || s.role === "operador")),
    secoes: [
      {
        id: "abertura-chamado",
        titulo: "Abrir Novo Chamado de Suporte",
        subtitulo: "Registro ágil de solicitações de clientes ou alertas do sistema",
        passos: [
          {
            ordem: 1,
            acao: "Iniciar Chamado",
            detalhe:
              "Clique em 'Novo Atendimento' e selecione o cliente pelo nome, telefone ou placa.",
          },
          {
            ordem: 2,
            acao: "Categorizar o Problema",
            detalhe:
              "Escolha a categoria adequada: Dúvida Operacional, Solicitação de Bloqueio, Falha de Sinal, Troca de Rastreador ou Financeiro.",
          },
          {
            ordem: 3,
            acao: "Descrever o Relato Inicial",
            detalhe:
              "Insira o relato do cliente com clareza e clique em 'Salvar e Abrir Protocolo'.",
          },
        ],
      },
      {
        id: "providencias-conclusao",
        titulo: "Registro de Providências e Conclusão",
        subtitulo: "Acompanhamento do histórico de intervenções até a resolução final",
        passos: [
          {
            ordem: 1,
            acao: "Adicionar Providência",
            detalhe:
              "Conforme ações forem tomadas (ex.: comando de reinicialização enviado, contato com a operadora de chip), registre no campo de providências.",
          },
          {
            ordem: 2,
            acao: "Concluir Atendimento",
            detalhe:
              "Quando a solicitação for solucionada, marque o chamado como 'Concluído' com o resumo da solução adotada.",
          },
        ],
      },
    ],
  },
  {
    id: "estoque-suprimentos",
    titulo: "Estoque e Suprimentos",
    rota: "/estoque",
    tag: "Suprimentos",
    icone: Boxes,
    resumo:
      "Controle de rastreadores J16, chips de dados M2M, relés, chicotes, leitura inteligente de Notas Fiscais em PDF e gestão de fornecedores.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "catalogo-itens",
        titulo: "Gestão de Itens e Peças",
        subtitulo: "Visualização do saldo atual e alertas de estoque mínimo",
        passos: [
          {
            ordem: 1,
            acao: "Monitorar Níveis de Estoque",
            detalhe:
              "A tela exibe cards com a contagem de cada categoria. Itens que atingem o estoque mínimo exibem tarja de atenção em amarelo ou vermelho.",
          },
          {
            ordem: 2,
            acao: "Cadastrar Novo Item Manualmente",
            detalhe:
              "Clique em 'Novo Item', defina a descrição, categoria (Rastreador, Chip, Fio, Conector, Relé), unidade de medida e quantidade inicial.",
          },
        ],
      },
      {
        id: "importacao-pdf-nota",
        titulo: "Leitor Inteligente de Notas Fiscais em PDF",
        subtitulo: "Extração automática de produtos e fornecedor a partir do PDF da nota",
        podeAcessar: (s) => Boolean(s && (s.isAdmin || s.isSuperAdmin)),
        passos: [
          {
            ordem: 1,
            acao: "Abrir o Leitor de PDF",
            detalhe: "No topo da tela de Estoque, clique no botão 'Importar Nota em PDF'.",
          },
          {
            ordem: 2,
            acao: "Arrastar ou Selecionar o Arquivo",
            detalhe:
              "Selecione o arquivo PDF da NF-e ou Danfe de compra. O leitor processa o documento localmente no seu navegador.",
          },
          {
            ordem: 3,
            acao: "Revisar Itens Detectados",
            detalhe:
              "O sistema lista os produtos encontrados com código, descrição, quantidade e valor unitário. Você pode ajustar ou complementar os dados antes de confirmar a entrada.",
          },
          {
            ordem: 4,
            acao: "Confirmar Entrada no Estoque",
            detalhe:
              "Clique em 'Gravar Entrada'. O saldo dos itens é atualizado automaticamente e o fornecedor é registrado.",
          },
        ],
      },
    ],
  },
  {
    id: "financeiro-caixa",
    titulo: "Financeiro e Fluxo de Caixa",
    rota: "/financeiro",
    tag: "Financeiro",
    icone: Wallet,
    resumo:
      "Controle de livro-caixa, conciliação de receitas e despesas, DRE operacional consolidado e emissão de propostas comerciais em PDF oficial.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "livro-caixa",
        titulo: "Lançamento de Receitas e Despesas",
        subtitulo: "Como registrar movimentações financeiras manuais",
        passos: [
          {
            ordem: 1,
            acao: "Nova Transação",
            detalhe:
              "Clique em 'Nova Transação' e escolha se o lançamento é uma Receita ou Despesa.",
          },
          {
            ordem: 2,
            acao: "Preencher Categoria e Valor",
            detalhe:
              "Informe o valor em Reais, a categoria contábil (ex.: Mensalidades, Chips de Dados, Peças, Repasse de Instalação) e anexe comprovante se necessário.",
          },
          {
            ordem: 3,
            acao: "Salvar Lançamento",
            detalhe: "Ao salvar, o saldo geral e o DRE são recalculados instantaneamente.",
          },
        ],
      },
      {
        id: "dre-relatorios",
        titulo: "DRE e Relatórios Contábeis",
        subtitulo: "Análise de lucratividade e exportação de relatórios com assinatura digital",
        podeAcessar: (s) => Boolean(s && (s.isAdmin || s.isSuperAdmin)),
        passos: [
          {
            ordem: 1,
            acao: "Filtrar por Mês e Ano",
            detalhe:
              "Use os seletores no topo para alternar entre os meses de referência e ver a evolução da receita bruta versus custos operacionais.",
          },
          {
            ordem: 2,
            acao: "Gerar Relatório em PDF",
            detalhe:
              "Clique em 'Exportar DRE em PDF'. O documento é gerado no formato canônico com identificador único e hash de integridade.",
          },
        ],
      },
    ],
  },
  {
    id: "mensalidades-cobranca",
    titulo: "Mensalidades e Cobrança",
    rota: "/mensalidades",
    tag: "Financeiro",
    icone: CreditCard,
    resumo:
      "Controle de faturas mensais, acompanhamento de inadimplência, avisos preventivos de vencimento e baixa de pagamentos.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "faturas-gestao",
        titulo: "Gestão de Faturas e Baixas",
        subtitulo: "Visualizar faturas abertas, vencidas e confirmar liquidação",
        passos: [
          {
            ordem: 1,
            acao: "Acompanhar Status das Mensalidades",
            detalhe: "As faturas são organizadas em abas: Em Aberto, Pagas e Inadimplentes.",
          },
          {
            ordem: 2,
            acao: "Dar Baixa em Pagamento",
            detalhe:
              "Ao receber o pagamento de um cliente, localize a fatura e clique em 'Dar Baixa'. Selecione a forma de liquidação (PIX, Boleto ou Cartão).",
          },
          {
            ordem: 3,
            acao: "Desbloqueio Automático",
            detalhe:
              "Assim que a fatura é marcada como paga, o sistema restabelece o acesso completo do cliente de forma imediata via WebSocket.",
          },
        ],
      },
    ],
  },
  {
    id: "manutencao-preventiva",
    titulo: "Manutenção Preventiva",
    rota: "/manutencao",
    tag: "Oficina",
    icone: Wrench,
    resumo:
      "Acompanhamento preventivo de veículos, controle de odômetro real via GPS, trocas de óleo, rodízio de pneus e alertas periódicos.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "agendamento-manutencao",
        titulo: "Cadastrar Nova Manutenção",
        subtitulo: "Definir alertas preventivos por quilometragem ou data limite",
        passos: [
          {
            ordem: 1,
            acao: "Selecionar Veículo",
            detalhe: "Escolha o veículo para o qual deseja configurar a manutenção.",
          },
          {
            ordem: 2,
            acao: "Definir Tipo de Serviço",
            detalhe:
              "Selecione o item (Troca de Óleo, Pastilhas de Freio, Correia Dentada, Pneus ou Revisão Geral).",
          },
          {
            ordem: 3,
            acao: "Quilometragem Limite",
            detalhe:
              "Informe o odômetro de referência. O sistema compara a quilometragem atualizada pelo GPS e gera alertas quando a marca se aproximar.",
          },
        ],
      },
    ],
  },
  {
    id: "dispositivos-autorizados",
    titulo: "Dispositivos Autorizados",
    rota: "/dispositivos",
    tag: "Dispositivos",
    icone: Smartphone,
    resumo:
      "Controle de aparelhos (computadores e celulares) autorizados a acessar o sistema, com identificação digital (fingerprint) e política de confiança.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "gestao-dispositivos",
        titulo: "Aprovação e Revogação de Dispositivos",
        subtitulo: "Segurança de acesso a partir de novos aparelhos",
        passos: [
          {
            ordem: 1,
            acao: "Reconhecimento do Aparelho",
            detalhe:
              "Ao logar em um novo aparelho, o sistema gera uma assinatura digital única com informações do navegador e sistema operacional.",
          },
          {
            ordem: 2,
            acao: "Bloquear ou Revogar Acesso",
            detalhe:
              "Se você suspeitar de algum aparelho desconhecido na lista, clique no botão 'Revogar Dispositivo'. A sessão naquele aparelho é cancelada imediatamente.",
          },
        ],
      },
    ],
  },
  {
    id: "rastreador-j16",
    titulo: "Rastreadores J16 (Comandos e Ativação)",
    rota: "/configuracao/rastreador-j16",
    tag: "Hardware",
    icone: Radio,
    resumo:
      "Configuração de comandos SMS de ativação do modelo J16 4G, parâmetros de APN, servidor de telemetria, porta e comandos de emergência.",
    podeAcessar: (s) => Boolean(s && s.isSuperAdmin),
    secoes: [
      {
        id: "comandos-sms-j16",
        titulo: "Comandos SMS de Inicialização",
        subtitulo: "Protocolo canônico para configurar o rastreador J16 no gateway GD Rastreamento",
        passos: [
          {
            ordem: 1,
            acao: "Configurar Servidor e Porta",
            detalhe:
              "Envie o comando SERVER com o IP e Porta oficial do gateway GD Rastreamento para que o rastreador envie pacotes de telemetria.",
          },
          {
            ordem: 2,
            acao: "Configurar APN da Operadora",
            detalhe:
              "Defina a APN correta do chip M2M utilizado (ex.: Vivo, Claro, Algar ou MVNO especializada).",
          },
          {
            ordem: 3,
            acao: "Ajustar Frequência de Transmissão",
            detalhe:
              "Defina o intervalo de envio: 10 a 30 segundos com ignição ligada e 300 segundos com ignição desligada para economia de bateria.",
          },
        ],
      },
    ],
  },
  {
    id: "temas-cards",
    titulo: "Temas dos Cards e Módulos",
    rota: "/configuracao/temas",
    tag: "Visual",
    icone: Palette,
    resumo:
      "Personalização do esquema de iluminação dos cards e módulos, modos de cores (Duas Cores, Multicor, Monocromático) e efeitos táteis.",
    podeAcessar: (s) => Boolean(s),
    secoes: [
      {
        id: "configuracao-temas",
        titulo: "Esquema Canônico de Cores",
        subtitulo: "Como escolher ou restaurar as cores dos módulos do sistema",
        passos: [
          {
            ordem: 1,
            acao: "Padrão do Sistema",
            detalhe:
              "O padrão do sistema para novos usuários é o Modo Duas Cores (Ciano Ártico e Verde Esmeralda) no tema Claro.",
          },
          {
            ordem: 2,
            acao: "Personalização Individual",
            detalhe:
              "Você pode escolher o modo Multicor (uma cor exclusiva para cada card), Monocromático (cor única de sua preferência) ou Duas/Três/Quatro cores alternadas.",
          },
          {
            ordem: 3,
            acao: "Restaurar Padrão",
            detalhe:
              "A qualquer momento, clique no botão 'Restaurar Padrão' para retornar ao padrão oficial do sistema com Ciano Ártico e Verde Esmeralda.",
          },
        ],
      },
    ],
  },
  {
    id: "central-seguranca",
    titulo: "Central de Segurança e Defesa",
    rota: "/configuracao/central-seguranca",
    tag: "Defesa",
    icone: Shield,
    resumo:
      "Painel de governança cibernética, verificação de políticas de Row Level Security (RLS) ativas em 100% das tabelas e integridade dos dados.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "auditoria-seguranca",
        titulo: "Pilares de Segurança Ativos",
        subtitulo: "Monitoramento dos 5 eixos de segurança do GD Rastreamento",
        passos: [
          {
            ordem: 1,
            acao: "Isolamento Estrito por RLS",
            detalhe:
              "Cada cliente acessa estritamente os seus dados e veículos. O painel verifica a cada instante a integridade das políticas no banco de dados.",
          },
          {
            ordem: 2,
            acao: "Blindagem de Segurança",
            detalhe:
              "A conta raiz de governança é protegida por triggers atômicas que impedem alteração de e-mail, exclusão ou rebaixamento de privilégios.",
          },
        ],
      },
    ],
  },
  {
    id: "logs-auditoria",
    titulo: "Logs e Auditoria Forense",
    rota: "/configuracao/logs",
    tag: "Auditoria",
    icone: FileText,
    resumo:
      "Registro imutável de acessos e operações no sistema, com endereço IP, geolocalização do operador e hash de integridade SHA-256.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "visualizador-logs",
        titulo: "Consultar Histórico de Acessos",
        subtitulo: "Rastreabilidade completa de todas as atividades realizadas",
        passos: [
          {
            ordem: 1,
            acao: "Filtrar por Usuário ou Data",
            detalhe:
              "Selecione o operador ou intervalo de tempo desejado para inspecionar os eventos registrados.",
          },
          {
            ordem: 2,
            acao: "Conferir Assinatura e IP",
            detalhe:
              "Cada registro traz o IP real do cliente, o navegador utilizado e o carimbo de tempo inviolável.",
          },
        ],
      },
    ],
  },
  {
    id: "usuarios-acessos",
    titulo: "Usuários e Acessos",
    rota: "/usuarios",
    tag: "Acessos",
    icone: Cpu,
    resumo:
      "Administração de contas de operadores, administradores e instaladores, controle de permissões e monitor de presença online.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "operador")),
    secoes: [
      {
        id: "gestao-usuarios",
        titulo: "Cadastrar e Gerenciar Usuários",
        subtitulo: "Atribuição correta de perfis para cada integrante da equipe",
        passos: [
          {
            ordem: 1,
            acao: "Cadastrar Operador ou Instalador",
            detalhe:
              "Clique em 'Novo Usuário', preencha nome, e-mail e selecione a role correspondente (Administrador, Operador ou Instalador).",
          },
          {
            ordem: 2,
            acao: "Regras do Instalador",
            detalhe:
              "Ao cadastrar um Instalador, informe o valor por instalação e a chave PIX para repasses automáticos.",
          },
          {
            ordem: 3,
            acao: "Bloqueio e Desconexão Imediata",
            detalhe:
              "Se necessário, um operador pode ser inativado com 1 clique, revogando o acesso imediatamente.",
          },
        ],
      },
    ],
  },
  {
    id: "frota-gestao",
    titulo: "Frota Operacional e Analytics",
    rota: "/frota",
    tag: "Frota",
    icone: TrendingUp,
    resumo:
      "Visão executiva e analítica da frota de veículos, indicadores de conformidade operacional, tempos de ociosidade, quilometragem acumulada e controle de custos por quilômetro.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "indicadores-frota",
        titulo: "Painel de Indicadores e Eficiência",
        subtitulo: "Acompanhamento consolidado do status de todos os veículos da frota",
        passos: [
          {
            ordem: 1,
            acao: "Painel de Ativos e Disponibilidade",
            detalhe:
              "Visualize nos cards superiores o total de veículos, veículos em circulação ativa, parados com ignição ligada (tempo ocioso) e desligados.",
          },
          {
            ordem: 2,
            acao: "Métricas de Quilometragem e Produtividade",
            detalhe:
              "Consulte a quilometragem percorrida no período selecionado, média diária por veículo e gráficos de evolução temporal.",
          },
          {
            ordem: 3,
            acao: "Filtros por Período e Cliente",
            detalhe:
              "Utilize os filtros rápidos de data para auditar a operação de hoje, dos últimos 7 dias, do mês corrente ou intervalos personalizados.",
          },
        ],
      },
      {
        id: "conformidade-custos",
        titulo: "Conformidade, Manutenção e Custo por KM",
        subtitulo: "Índice de revisões preventivas em dia e controle de custo operacional da frota",
        passos: [
          {
            ordem: 1,
            acao: "Índice de Conformidade de Manutenção",
            detalhe:
              "O sistema calcula a porcentagem de veículos com revisões preventivas (óleo, pneus, freios) em dia versus itens pendentes ou em aviso preventivo.",
          },
          {
            ordem: 2,
            acao: "Controle de Tempo Ocioso de Motor",
            detalhe:
              "Monitore o tempo em que os veículos permanecem com o motor ligado sem deslocamento, identificando oportunidades de economia de combustível.",
          },
        ],
      },
    ],
  },
  {
    id: "motoristas-portal",
    titulo: "Motoristas e Portal do Condutor",
    rota: "/motoristas",
    tag: "Condutores",
    icone: Users,
    resumo:
      "Cadastro e acompanhamento de condutores, controle de validade e pontuação de CNH, vinculação de veículos da frota e acesso ao Portal do Motorista.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "gestao-condutores",
        titulo: "Cadastro e Monitoramento de CNH",
        subtitulo: "Controle preventivo de habilitações, exames e dados do motorista",
        passos: [
          {
            ordem: 1,
            acao: "Cadastrar Novo Motorista",
            detalhe:
              "No módulo de Motoristas, clique em 'Novo Motorista'. Preencha Nome Completo, CPF, Telefone, Número da CNH, Categoria e Data de Vencimento.",
          },
          {
            ordem: 2,
            acao: "Avisos de Vencimento de Habilitação",
            detalhe:
              "O sistema monitora os prazos de validade da CNH e exibe badges informativos quando a renovação estiver próxima ou vencida.",
          },
          {
            ordem: 3,
            acao: "Vincular a Veículo da Frota",
            detalhe:
              "Associe o motorista ao veículo habitualmente conduzido. A vinculação permite cruzar a telemetria com a identificação do responsável pela direção.",
          },
        ],
      },
      {
        id: "portal-do-motorista",
        titulo: "Portal do Motorista e Autoatendimento",
        subtitulo: "Interface direta para o motorista no smartphone",
        passos: [
          {
            ordem: 1,
            acao: "Acesso Simplificado pelo Celular",
            detalhe:
              "O condutor acessa o Portal do Motorista através do link exclusivo com credencial segura, sem necessidade de navegar pelo painel administrativo da gestão.",
          },
          {
            ordem: 2,
            acao: "Visualização do Veículo Designado",
            detalhe:
              "Na tela inicial do portal, o motorista visualiza a placa, modelo, status da ignição, nível de bateria e localização do veículo atribuído a ele.",
          },
          {
            ordem: 3,
            acao: "Lançamento de Despesas e Comprovantes",
            detalhe:
              "O condutor pode registrar abastecimentos, pedágios ou pequenos reparos anexando a foto do recibo para conciliação financeira pelo gestor da frota.",
          },
        ],
      },
    ],
  },
  {
    id: "chat-mensageria",
    titulo: "Chat e Mensageria em Tempo Real",
    rota: "/chat",
    tag: "Mensagens",
    icone: MessageSquare,
    resumo:
      "Comunicação direta e criptografada entre clientes, operadores e administradores com notificações Web Push VAPID inter-dispositivos e modo supervisão de conversas.",
    podeAcessar: (s) => Boolean(s),
    secoes: [
      {
        id: "troca-mensagens-push",
        titulo: "Conversas em Tempo Real e Web Push",
        subtitulo: "Troca instantânea de mensagens com recebimento em segundo plano",
        passos: [
          {
            ordem: 1,
            acao: "Selecionar Contato na Lista",
            detalhe:
              "Na barra lateral, localize o cliente, operador ou suporte desejado. A lista exibe o status de presença (online ou offline) e contador de mensagens não lidas.",
          },
          {
            ordem: 2,
            acao: "Envio de Mensagens no Visual Neumórfico",
            detalhe:
              "Digite no campo inferior e pressione Enter ou clique em Enviar. As bolhas azuis em gradiente indicam suas mensagens e os cartões em relevo mostram as respostas do interlocutor.",
          },
          {
            ordem: 3,
            acao: "Notificações com Tela Bloqueada ou App Fechado",
            detalhe:
              "O sistema utiliza Notificações Web Push VAPID integradas ao Service Worker. Mesmo com o celular no bolso ou tela bloqueada, uma notificação sonora com o nome do contato e prévia da mensagem é entregue pontualmente.",
            dica: "Certifique-se de autorizar as notificações no navegador quando o banner superior for exibido.",
          },
        ],
      },
      {
        id: "modo-supervisao-chat",
        titulo: "Modo Supervisão para Administradores",
        subtitulo: "Auditoria transparente de conversas entre operadores e clientes",
        podeAcessar: (s) => Boolean(s && (s.isAdmin || s.isSuperAdmin)),
        passos: [
          {
            ordem: 1,
            acao: "Painel de Conversas Realizadas",
            detalhe:
              "Administradores e SuperADM podem clicar em qualquer contato para visualizar a lista de conversas mantidas por ele com diferentes atendentes.",
          },
          {
            ordem: 2,
            acao: "Leitura em Modo Auditoria",
            detalhe:
              "Abra o histórico completo da conversa para inspecionar as mensagens trocadas, data e horário de cada interação sem interferir no diálogo.",
          },
          {
            ordem: 3,
            acao: "Intervenção Direta Quando Necessário",
            detalhe:
              "A qualquer momento, o administrador pode utilizar a ação 'Conversar Diretamente' para assumir o atendimento e dialogar com o cliente.",
          },
        ],
      },
    ],
  },
  {
    id: "revendedores-vendedores",
    titulo: "Revendedores e Vendedores (Parceiros)",
    rota: "/revendedores",
    tag: "Comercial",
    icone: Store,
    resumo:
      "Gestão de parceiros comerciais, auto-cadastro de revendedores e vendedores, links inteligentes de vendas para WhatsApp, comissão mínima protegida e DRE do parceiro.",
    podeAcessar: (s) =>
      Boolean(
        s && (s.isAdmin || s.isSuperAdmin || s.role === "revendedor" || s.role === "vendedor"),
      ),
    secoes: [
      {
        id: "parceiros-autocadastro",
        titulo: "Auto-Cadastro de Parceiros e Links de Indicação",
        subtitulo:
          "Credenciamento de revendedores e vendedores com chave PIX e compartilhamento ágil",
        passos: [
          {
            ordem: 1,
            acao: "Cadastrar ou Convidar Parceiro Comercial",
            detalhe:
              "Administradores ou Revendedores podem cadastrar diretamente novos vendedores ou gerar um link de convite com QR Code para auto-cadastro com dados pessoais e chave PIX para repasse de comissões.",
          },
          {
            ordem: 2,
            acao: "Compartilhar Proposta de Rastreamento via WhatsApp",
            detalhe:
              "No card do parceiro, utilize o botão de compartilhamento rápido para enviar propostas de rastreamento para clientes no WhatsApp com o código do parceiro já embutido.",
          },
          {
            ordem: 3,
            acao: "Proteção de Margem Mínima (R$ 15,00)",
            detalhe:
              "A plataforma aplica compulsoriamente a sugestão de no mínimo R$ 15,00 sobre o custo base do rastreamento, bloqueando vendas abaixo do piso para assegurar rentabilidade sustentável ao parceiro.",
          },
        ],
      },
      {
        id: "dre-parceiro",
        titulo: "DRE do Parceiro e Acompanhamento de Comissões",
        subtitulo: "Extrato transparente de faturamento, margens líquidas e saldo a receber",
        passos: [
          {
            ordem: 1,
            acao: "Abrir Demonstrativo de Resultados (DRE)",
            detalhe:
              "Acesse o botão 'Mostrar DRE' na listagem ou no cockpit de vendas para inspecionar clientes ativos, receita mensal bruta, custos operacionais de rastreadores e comissão líquida apurada.",
          },
          {
            ordem: 2,
            acao: "Agendamento de Relatório WhatsApp",
            detalhe:
              "O parceiro pode agendar o envio automatizado do resumo de suas métricas e comissões diretamente para o seu WhatsApp pessoal.",
          },
          {
            ordem: 3,
            acao: "Redefinição Segura de Senha",
            detalhe:
              "No primeiro acesso ou quando necessário, o parceiro pode redefinir sua senha diretamente pelo modal dedicado com verificação de segurança.",
          },
        ],
      },
    ],
  },
  {
    id: "contratos-assinatura",
    titulo: "Contratos de Prestação de Serviços e Assinatura Digital",
    rota: "/clientes",
    tag: "Jurídico",
    icone: FileCheck,
    resumo:
      "Emissão de contratos oficiais de prestação de serviços de rastreamento veicular e segurança patrimonial, assinatura biométrica na tela, selo de autenticidade SGD, QR Code forense e hash SHA-256.",
    podeAcessar: (s) => Boolean(s && (!s.isInstalador || s.isAdmin || s.isSuperAdmin)),
    secoes: [
      {
        id: "emissao-contrato",
        titulo: "Emissão do Contrato de Rastreamento e Segurança",
        subtitulo: "Geração de minuta contratual com veículos, valor mensal e plano escolhido",
        passos: [
          {
            ordem: 1,
            acao: "Acessar Contratos do Cliente",
            detalhe:
              "Na ficha do cliente titular ou ao aprovar uma proposta, clique em 'Contrato de Prestação de Serviços' para abrir a central de documentos.",
          },
          {
            ordem: 2,
            acao: "Conferência de Dados e Veículos",
            detalhe:
              "O contrato preenche automaticamente os dados do cliente titular, placas, modelos e equipamentos vinculados ao rastreamento e segurança.",
          },
          {
            ordem: 3,
            acao: "Gerar Link de Assinatura Mobile",
            detalhe:
              "Envie o link seguro via WhatsApp para o cliente assinar diretamente na tela do smartphone com validade jurídica.",
          },
        ],
      },
      {
        id: "assinatura-forense",
        titulo: "Assinatura Eletrônica e Validação Criptográfica",
        subtitulo: "Procedimento seguro com foto de documento, selfie e carimbo de tempo",
        passos: [
          {
            ordem: 1,
            acao: "Rubrica na Tela e Registro Biométrico",
            detalhe:
              "O cliente desenha sua assinatura no canvas touchscreen e captura foto do documento oficial com selfie para comprovação inequívoca de identidade.",
          },
          {
            ordem: 2,
            acao: "Selo de Autenticidade SGD e Código Curto",
            detalhe:
              "O documento final recebe no rodapé o Selo de Autenticidade do GD Rastreamento e um código curto de validação instantânea.",
          },
          {
            ordem: 3,
            acao: "Hash Forense SHA-256 e Verificação Pública",
            detalhe:
              "Cada página e o arquivo completo possuem hash criptográfico imutável SHA-256. Qualquer pessoa pode escanear o QR Code no rodapé ou acessar a rota de verificação para checar a autenticidade original do documento.",
          },
        ],
      },
    ],
  },
  {
    id: "auto-monitoramento-whatsapp",
    titulo: "WhatsApp Dev-Bot e Auto-Monitoramento",
    rota: "/chat",
    tag: "Automação",
    icone: Bot,
    resumo:
      "Atendimento automático ao público em geral, apresentação dos serviços de rastreamento veicular e segurança, cadastro de degustação 24h pelo comando TESTE e reativação segura.",
    podeAcessar: (s) =>
      Boolean(s && (s.isAdmin || s.isSuperAdmin || s.isOperador || s.role === "revendedor")),
    secoes: [
      {
        id: "atendimento-degustacao",
        titulo: "Atendimento ao Visitante e Solicitação de Degustação",
        subtitulo:
          "Fluxo inteligente de autoatendimento para interessados em rastreamento veicular",
        passos: [
          {
            ordem: 1,
            acao: "Primeiro Contato pelo WhatsApp",
            detalhe:
              "O visitante recebe o menu do Assistente GD com explicação clara dos serviços de rastreamento e segurança pelo celular.",
          },
          {
            ordem: 2,
            acao: "Início de Degustação com Comando TESTE",
            detalhe:
              "Operadores, parceiros credenciados ou o SuperADM iniciam o cadastro de um novo interessado digitando o comando TESTE no WhatsApp.",
          },
          {
            ordem: 3,
            acao: "Coleta Segura de Dados",
            detalhe:
              "O bot solicita sequencialmente Nome Completo, E-mail, Celular do Cliente e Senha provisória. O número de celular do cliente serve exclusivamente para o envio dos dados de acesso.",
          },
        ],
      },
      {
        id: "despacho-e-reativacao",
        titulo: "Opção de Envio de Acesso e Reativação de 24 Horas",
        subtitulo: "Controle discricionário de envio ao cliente e renovação de testes existentes",
        passos: [
          {
            ordem: 1,
            acao: "Opção de Envio ao Concluir Cadastro",
            detalhe:
              "Ao finalizar o cadastro, o bot pergunta ao autorizador: '1. Enviar dados de acesso ao cliente' ou '2. Não enviar'. Se escolher 1, uma mensagem cordial com link e login é despachada imediatamente ao WhatsApp informado; se escolher 2, os dados ficam restritos ao autorizador.",
          },
          {
            ordem: 2,
            acao: "Reativação de Cliente Existente (+24h)",
            detalhe:
              "Caso o e-mail informado pertença a um cliente de degustação já cadastrado, o sistema pergunta se deseja reativar o acesso por mais 24 horas no Plano Master. Ao confirmar com a opção 1, o acesso é renovado instantaneamente com todos os 11 módulos.",
          },
          {
            ordem: 3,
            acao: "Blindagem Contra Números Desconhecidos",
            detalhe:
              "Comandos restritos de bloqueio, desbloqueio ou relatórios enviados por números não autorizados são sumariamente ignorados pelo bot, protegendo a segurança patrimonial dos veículos e a privacidade do sistema.",
          },
        ],
      },
    ],
  },
];
