import { useEffect, useState } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { Link } from "@tanstack/react-router";
import {
  X,
  MapPin,
  Users,
  CreditCard,
  Headphones,
  Shield,
  FileText,
  Radio,
  Cpu,
  Smartphone,
  LogOut,
  LayoutDashboard,
  Wrench,
  Palette,
  Boxes,
  Wallet,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  BookOpen,
  MessageCircle,
  Settings2,
  Activity,
  Fuel,
  Navigation,
  Key,
  MessageSquare,
  Sparkles,
  UserCheck,
  Briefcase,
  Store,
  CheckCircle2,
  Building,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { podeAcessarRota, podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { clientePossuiPendenciaInstalacaoOuAtivacao } from "@/features/clientes/services/clienteService";

interface MobileDrawerProps {
  aberto: boolean;
  onFechar: () => void;
  onAbrirManual?: () => void;
  onAbrirWhatsapp?: () => void;
}

interface ItemMenu {
  titulo: string;
  rota: string;
  icone: React.ComponentType<{ className?: string }>;
  badge?: string;
  descricao?: string;
}

interface SecaoMenu {
  titulo: string;
  itens: ItemMenu[];
}

export function MobileDrawer({
  aberto,
  onFechar,
  onAbrirManual,
  onAbrirWhatsapp,
}: MobileDrawerProps) {
  const { session, logout } = useAuth();
  const [temPendenciaAtivacao, setTemPendenciaAtivacao] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (session?.isCliente) {
      clientePossuiPendenciaInstalacaoOuAtivacao(session.userId, session.clienteId)
        .then((tem) => {
          if (!cancelado) setTemPendenciaAtivacao(tem);
        })
        .catch(() => {
          if (!cancelado) setTemPendenciaAtivacao(false);
        });
    }
    return () => {
      cancelado = true;
    };
  }, [session?.isCliente, session?.userId, session?.clienteId]);

  // Fecha com tecla ESC e trava scroll do fundo
  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };

    document.addEventListener("keydown", handleKeyDown);
    const scrollOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = scrollOriginal;
    };
  }, [aberto, onFechar]);

  if (!aberto || !session) return null;

  // Montagem estruturada das seções verticais do menu
  let secoesMenu: SecaoMenu[] = [];

  if (session.isInstalador) {
    secoesMenu = [
      {
        titulo: "Operações Técnicas",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão executiva e módulos liberados",
          },
          {
            titulo: "Instalações Técnicas",
            rota: "/instalacao",
            icone: Wrench,
            descricao: "Cadastro e checklist de novos rastreadores",
          },
        ],
      },
    ];
  } else if (session.isFinanceiro || session.role === "financeiro") {
    secoesMenu = [
      {
        titulo: "Operações Financeiras",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão executiva e atalhos rápidos",
          },
          {
            titulo: "Financeiro e Fluxo de Caixa",
            rota: "/financeiro",
            icone: DollarSign,
            descricao: "Demonstrativo DRE, conciliação e despesas",
          },
          {
            titulo: "Mensalidades e Cobrança",
            rota: "/mensalidades",
            icone: CreditCard,
            descricao: "Faturas, baixas manuais e status PIX",
          },
          {
            titulo: "Propostas Comerciais",
            rota: "/propostas",
            icone: FileText,
            descricao: "Emissão de propostas comerciais e contratos",
          },
          {
            titulo: "Clientes e Planos",
            rota: "/clientes",
            icone: Users,
            descricao: "Dados cadastrais, contratos e faturamento",
          },
          {
            titulo: "Revendedores e Parceiros",
            rota: "/revendedores",
            icone: Building,
            descricao: "Repasses, comissões de parceiros e franquias",
          },
          {
            titulo: "Instalações Técnicas",
            rota: "/instalacao",
            icone: Wrench,
            descricao: "Controle de repasses de mão de obra de instalações",
          },
          {
            titulo: "Abastecimento e Notas Fiscais",
            rota: "/abastecimento",
            icone: Fuel,
            descricao: "Lançamento de combustível, conferência de NFs e despesas",
          },
          {
            titulo: "Manutenção Preventiva",
            rota: "/manutencao",
            icone: Wrench,
            descricao: "Revisões, pneus, peças e custos de manutenção",
          },
          {
            titulo: "Estoque e Suprimentos",
            rota: "/estoque",
            icone: Boxes,
            descricao: "Entrada de notas fiscais, rastreadores e insumos",
          },
          ...(podeAcessarModulo(session, "monitor-gps")
            ? [
                {
                  titulo: "Mapa Operacional",
                  rota: "/monitor-gps",
                  icone: MapPin,
                  descricao: "Telemetria em tempo real e localização",
                },
              ]
            : []),
          ...(podeAcessarModulo(session, "rotas")
            ? [
                {
                  titulo: "Rotas Inteligentes",
                  rota: "/rotas",
                  icone: Navigation,
                  descricao: "Planejamento e rotas pelas ruas",
                },
              ]
            : []),
          ...(podeAcessarModulo(session, "frota")
            ? [
                {
                  titulo: "Desempenho da Frota",
                  rota: "/frota",
                  icone: Activity,
                  descricao: "Telemetria consolidada da frota",
                },
              ]
            : []),
          ...(podeAcessarModulo(session, "motoristas")
            ? [
                {
                  titulo: "Gestão de Motoristas",
                  rota: "/motoristas",
                  icone: Users,
                  descricao: "Controle de condutores e frotistas",
                },
              ]
            : []),
        ],
      },
    ];
  } else if (session.isRevendedor) {
    secoesMenu = [
      {
        titulo: "Operações da Franquia",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão geral e atalhos rápidos",
          },
          {
            titulo: "Minha Franquia e Equipe",
            rota: "/minha-franquia",
            icone: Store,
            descricao: "Gestão de vendedores, clientes, faturamento e repasses",
          },
          {
            titulo: "Minhas Vendas e Comissões",
            rota: "/minhas-vendas",
            icone: TrendingUp,
            descricao: "Carteira direta de clientes e taxas de ativação",
          },
          {
            titulo: "Propostas Comerciais",
            rota: "/propostas",
            icone: FileText,
            descricao: "Emissão de propostas comerciais e contrapropostas",
          },
        ],
      },
    ];
  } else if (session.isVendedor) {
    secoesMenu = [
      {
        titulo: "Operações Comerciais",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão geral e atalhos rápidos",
          },
          {
            titulo: "Minhas Vendas e Comissões",
            rota: "/minhas-vendas",
            icone: TrendingUp,
            descricao: "Minha carteira, comissões ativas e repasses de instalação",
          },
          {
            titulo: "Propostas Comerciais",
            rota: "/propostas",
            icone: FileText,
            descricao: "Emissão de propostas comerciais e contrapropostas",
          },
        ],
      },
    ];
  } else if (session.isMotorista) {
    const itensMotorista = [
      {
        titulo: "Painel Geral",
        rota: "/inicio",
        icone: LayoutDashboard,
        descricao: "Módulos autorizados ao motorista",
      },
      // Mapa Operacional ao Vivo: SOMENTE se autorizado no cadastro do motorista (1º da lista)
      ...(session.acessoMapaMotorista
        ? [
            {
              titulo: "Mapa Operacional",
              rota: "/monitor-gps",
              icone: MapPin,
              descricao: "Localização ao vivo do veículo atribuído",
            },
          ]
        : []),
      {
        titulo: "Rotas e Trajetos Inteligentes",
        rota: "/rotas",
        icone: Navigation,
        descricao: "Planejar rotas pelas ruas com múltiplos destinos",
      },
      {
        titulo: "Abastecimento de Veículos",
        rota: "/abastecimento",
        icone: Fuel,
        descricao: "Lançamento de combustível com leitura de NF",
      },
      {
        titulo: "Manutenção Preventiva",
        rota: "/manutencao",
        icone: Wrench,
        descricao: "Revisões e alertas preventivos da frota",
      },
    ];

    secoesMenu = [
      {
        titulo: "Operação do Veículo",
        itens: itensMotorista,
      },
    ];
  } else if (session.isFuncionario) {
    const itensFuncionario: any[] = [
      {
        titulo: "Painel Geral",
        rota: "/inicio",
        icone: LayoutDashboard,
        descricao: "Módulos autorizados pelo cliente titular",
      },
    ];

    if (podeAcessarModulo(session, "monitor-gps")) {
      itensFuncionario.push({
        titulo: "Mapa Operacional",
        rota: "/monitor-gps",
        icone: MapPin,
        descricao: "Localização ao vivo, rotas e ignição",
      });
    }

    if (podeAcessarModulo(session, "rotas")) {
      itensFuncionario.push({
        titulo: "Rotas e Trajetos Inteligentes",
        rota: "/rotas",
        icone: Navigation,
        descricao: "Planejar rotas pelas ruas com múltiplos destinos",
      });
    }

    if (podeAcessarModulo(session, "frota")) {
      itensFuncionario.push({
        titulo: "Desempenho da Frota",
        rota: "/frota",
        icone: Activity,
        descricao: "KM rodado, consumo, score de condução e relatórios",
      });
    }

    if (podeAcessarModulo(session, "abastecimento")) {
      itensFuncionario.push({
        titulo: "Abastecimento de Veículos",
        rota: "/abastecimento",
        icone: Fuel,
        descricao: "Controle de notas fiscais e abastecimentos",
      });
    }

    if (podeAcessarModulo(session, "manutencao")) {
      itensFuncionario.push({
        titulo: "Manutenção Preventiva",
        rota: "/manutencao",
        icone: Wrench,
        descricao: "Revisões, pneus e trocas de óleo",
      });
    }

    if (podeAcessarModulo(session, "motoristas")) {
      itensFuncionario.push({
        titulo: "Gestão de Motoristas",
        rota: "/motoristas",
        icone: Users,
        descricao: "Visualização de motoristas da frota",
      });
    }

    secoesMenu = [
      {
        titulo: "Módulos Autorizados",
        itens: itensFuncionario,
      },
    ];
  } else if (session.isCliente) {
    secoesMenu = [
      {
        titulo: "Navegação Principal",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão geral e módulos da frota",
          },
          {
            titulo: "Mapa Operacional",
            rota: "/monitor-gps",
            icone: MapPin,
            descricao: "Localização ao vivo, rotas e ignição",
          },
          {
            titulo: "Rotas e Trajetos Inteligentes",
            rota: "/rotas",
            icone: Navigation,
            descricao: "Planejar rotas pelas ruas com múltiplos destinos",
          },
          {
            titulo: "Desempenho da Frota",
            rota: "/frota",
            icone: Activity,
            descricao: "KM rodado, consumo, score de condução e relatórios",
          },
          {
            titulo: "Abastecimento de Veículos",
            rota: "/abastecimento",
            icone: Fuel,
            descricao: "Controle de notas fiscais e abastecimentos",
          },
          ...(temPendenciaAtivacao
            ? [
                {
                  titulo: "Acompanhamento da Ativação",
                  rota: "/onboarding/acompanhamento",
                  icone: CheckCircle2,
                  descricao: "Linha do tempo de 6 etapas até a liberação do sinal",
                },
              ]
            : []),
          {
            titulo: "Manutenção Preventiva",
            rota: "/manutencao",
            icone: Wrench,
            descricao: "Revisões, pneus e trocas de óleo",
          },
          {
            titulo: "Gestão de Motoristas",
            rota: "/motoristas",
            icone: Users,
            descricao: "Cadastro, CNH, despesas e notas fiscais",
          },
          {
            titulo: "Gestão de Funcionários",
            rota: "/funcionarios",
            icone: UserCheck,
            descricao: "Cadastro de usuários e permissões da equipe",
          },
          {
            titulo: "Mensalidade",
            rota: "/mensalidades",
            icone: CreditCard,
            descricao: "Faturas, 2ª via e chave PIX",
          },
        ],
      },
    ];
  } else {
    // Perfil Administrativo / SuperADM / Operador
    secoesMenu = [
      {
        titulo: "Monitoramento e Operação",
        itens: [
          {
            titulo: "Painel Geral",
            rota: "/inicio",
            icone: LayoutDashboard,
            descricao: "Visão executiva e telemetria consolidada",
          },
          {
            titulo: "Mapa Operacional",
            rota: "/monitor-gps",
            icone: MapPin,
            descricao: "Rastreamento tático e bloqueio remoto",
          },
          {
            titulo: "Rotas e Trajetos Inteligentes",
            rota: "/rotas",
            icone: Navigation,
            descricao: "Planejar rotas pelas ruas com múltiplos destinos",
          },
          {
            titulo: "Desempenho da Frota",
            rota: "/frota",
            icone: Activity,
            descricao: "Analytics consolidado, telemetria diária e relatórios",
          },
          {
            titulo: "Abastecimento de Veículos",
            rota: "/abastecimento",
            icone: Fuel,
            descricao: "Gestão e auditoria de combustível da frota",
          },
          {
            titulo: "Manutenção Preventiva",
            rota: "/manutencao",
            icone: Wrench,
            descricao: "Agendamentos, revisão e controle de oficinas",
          },
          {
            titulo: "Instalações Técnicas",
            rota: "/instalacao",
            icone: Wrench,
            descricao: "Ordens de serviço e calibração de GPS",
          },
          {
            titulo: "Módulo Demonstração",
            rota: "/demonstracao",
            icone: Sparkles,
            descricao: "Simulador de cadastro de cliente e instalador",
          },
        ],
      },
      {
        titulo: "Gestão Comercial e Financeira",
        itens: [
          {
            titulo: "Clientes e Planos",
            rota: "/clientes",
            icone: Users,
            descricao: "Gestão de carteira, veículos e comodato",
          },
          {
            titulo: "Gestão de Motoristas",
            rota: "/motoristas",
            icone: Users,
            descricao: "Gestão de motoristas, CNHs e despesas",
          },
          {
            titulo: "Gestão de Funcionários",
            rota: "/funcionarios",
            icone: UserCheck,
            descricao: "Cadastro de colaboradores e permissões da equipe",
          },
          {
            titulo: "Financeiro e Fluxo de Caixa",
            rota: "/financeiro",
            icone: Wallet,
            descricao: "Gestão de caixa, DRE operacional e relatórios",
          },
          {
            titulo: "Mensalidades e Cobrança",
            rota: "/mensalidades",
            icone: CreditCard,
            descricao: "Controle de recebimentos e régua de cobrança",
          },
          {
            titulo: "Estoque e Suprimentos",
            rota: "/estoque",
            icone: Boxes,
            descricao: "Rastreadores físicos, chicotes e chips M2M",
          },
          {
            titulo: "Revendedores e Vendedores",
            rota: "/revendedores",
            icone: Briefcase,
            descricao: "Rede parceira, gestão de bases, equipe e repasses",
          },
        ],
      },
      {
        titulo: "Infraestrutura e Governança",
        itens: [
          {
            titulo: "Central de Segurança",
            rota: "/configuracao/central-seguranca",
            icone: Shield,
            descricao: "Blindagem, políticas RLS e conformidade",
          },
          {
            titulo: "Dispositivos Autorizados",
            rota: "/dispositivos",
            icone: Smartphone,
            descricao: "Controle de acessos móveis autorizados",
          },
          ...(session.isSuperAdmin ||
          session.isSuperAdminAuditor ||
          session.isAuditor ||
          session.role === "superadmin_auditor"
            ? [
                {
                  titulo: "Rastreadores J16 4G",
                  rota: "/configuracao/rastreador-j16",
                  icone: Radio,
                  descricao:
                    session.isSuperAdminAuditor ||
                    session.isAuditor ||
                    session.role === "superadmin_auditor"
                      ? "Consulta de telemetria e leitura de parâmetros"
                      : "Comandos e parâmetros de conexão",
                },
              ]
            : []),
          {
            titulo: "Usuários e Acessos",
            rota: "/usuarios",
            icone: Cpu,
            descricao: "Gestão de operadores e permissões de perfil",
          },
          {
            titulo: "Logs do Sistema",
            rota: "/configuracao/logs",
            icone: FileText,
            descricao: "Rastreabilidade de ações e segurança",
          },
        ],
      },
    ];
  }

  // Regra Canônica: Atendimento e Suporte, Chat e Configurações ficam exclusivamente no Menu Hambúrguer, no final, para todos os usuários
  secoesMenu.push({
    titulo: session.isInstalador ? "Comunicação e Acesso" : "Comunicação e Configurações",
    itens: [
      {
        titulo: "Atendimento e Suporte",
        rota: "/atendimento",
        icone: Headphones,
        descricao: "Chamados, suporte técnico e solicitações",
      },
      {
        titulo: "Chat em Tempo Real",
        rota: "/chat",
        icone: MessageCircle,
        descricao: "Mensagens instantâneas com operadores e suporte",
      },
      {
        titulo: session.isInstalador ? "Troca de Senha" : "Configurações do Sistema", // titulo: "Configurações do Sistema"
        rota: "/configuracoes",
        icone: session.isInstalador ? Key : Settings2,
        descricao: session.isInstalador
          ? "Alteração de senha de acesso da conta técnica"
          : session.isMotorista
            ? "Sincronização de odômetro e alteração de senha"
            : "Ícones 3D dos veículos, odômetro e preferências",
      },
      {
        titulo: "Temas dos Cards e Módulos",
        rota: "/configuracao/temas",
        icone: Palette,
        descricao: "Cores dos cards e identidade visual",
      },
    ],
  });

  // Filtra estritamente itens e seções conforme o perfil e módulos atribuídos ao usuário
  const secoesMenuFiltradas = secoesMenu
    .map((secao) => ({
      ...secao,
      itens: secao.itens.filter((item) => podeAcessarRota(session, item.rota)),
    }))
    .filter((secao) => secao.itens.length > 0);

  const drawerContent = (
    <div className="fixed inset-0 z-[99999] flex select-none">
      {/* Backdrop estável e com fade suave (sem desfoque bugado de GPU) */}
      <div
        className="fixed inset-0 bg-slate-950/70 transition-opacity duration-300 animate-in fade-in"
        onClick={onFechar}
        aria-hidden="true"
      />

      {/* Painel do Menu Vertical Lateral */}
      <aside
        className="relative z-10 w-80 max-w-[88vw] h-full bg-[#f8fafc] dark:bg-[#0c121c] border-r border-slate-200/90 dark:border-slate-800/90 flex flex-col justify-between shadow-2xl text-slate-800 dark:text-slate-100 transition-all duration-300 animate-in slide-in-from-left"
        role="dialog"
        aria-modal="true"
        aria-label="Menu Principal de Navegação"
      >
        {/* TOPO: Identificação e Botão Fechar */}
        <div
          className="p-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/80"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}
        >
          <div className="flex items-center justify-between">
            <Link
              to="/inicio"
              onClick={onFechar}
              className="flex items-center gap-3 group cursor-pointer"
              title="Voltar ao Painel Geral"
            >
              <img
                src="/logo-emblema.png"
                alt={APP_NOME}
                className="h-14 w-14 object-contain shrink-0 drop-shadow-md group-hover:scale-105 transition-transform duration-200"
              />
              <div>
                <span className="font-black text-slate-900 dark:text-slate-100 tracking-wider text-sm uppercase block group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  {APP_NOME}
                </span>
                <span className="text-[10px] text-orange-600 dark:text-orange-400 font-mono font-bold block">
                  v{APP_VERSION_NUMERO}
                </span>
              </div>
            </Link>

            <button
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer active:scale-95"
              aria-label="Fechar menu"
              title="Fechar Menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Card do Usuário Logado */}
          <div className="mt-3.5 p-3 rounded-2xl bg-white/80 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {session.nome}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
              {session.email}
            </div>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 text-[9px] rounded-lg font-bold uppercase tracking-wider bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/25">
                {session.isAdmin
                  ? "Administrador"
                  : session.isFinanceiro
                    ? "Financeiro"
                    : session.isRevendedor
                      ? "Revendedor"
                      : session.isVendedor
                        ? "Vendedor"
                        : session.role}
              </span>
              {session.isCliente && session.plano && (
                <span className="px-2 py-0.5 text-[9px] rounded-lg font-bold uppercase tracking-wider bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/25">
                  Plano {session.plano}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CORPO: Lista Vertical com Seções */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-5 custom-scrollbar">
          {/* Botão de Destaque: Manual do Usuário Modular */}
          {onAbrirManual && (
            <button
              type="button"
              onClick={() => {
                onFechar();
                onAbrirManual();
              }}
              className="w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold text-orange-800 dark:text-orange-300 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 transition-all duration-150 shadow-xs cursor-pointer text-left group active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform duration-150">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Manual do Usuário
                  </div>
                  <div className="text-[10px] text-orange-700 dark:text-orange-400 font-normal">
                    Guias passo a passo por módulo
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-orange-600 dark:text-orange-400 opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* Botão de Destaque: MSG WhatsApp Direta (Fly.io Gateway) */}
          {onAbrirWhatsapp &&
            (session?.isAdmin ||
              session?.isOperador ||
              session?.isFinanceiro ||
              session?.isRevendedor ||
              session?.isVendedor) && (
              <button
                type="button"
                onClick={() => {
                  onFechar();
                  onAbrirWhatsapp();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all duration-150 shadow-xs cursor-pointer text-left group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 group-hover:scale-105 transition-transform duration-150">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>MSG WhatsApp</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        Gateway
                      </span>
                    </div>
                    <div className="text-[10px] text-orange-700 dark:text-orange-400 font-normal">
                      Disparo rápido para clientes e motoristas
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-orange-600 dark:text-orange-400 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

          {/* Iteração de Seções e Itens */}
          {secoesMenuFiltradas.map((secao) => (
            <div key={secao.titulo} className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2.5 block">
                {secao.titulo}
              </span>

              <nav className="space-y-1">
                {secao.itens.map((item) => {
                  const Icone = item.icone;
                  return (
                    <Link
                      key={item.rota}
                      to={item.rota}
                      onClick={onFechar}
                      className="flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-all duration-150 group active:scale-[0.99]"
                      activeProps={{
                        className:
                          "bg-orange-500/15 text-orange-800 dark:text-orange-300 font-bold border border-orange-500/30 shadow-xs",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icone className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors shrink-0" />
                        <div className="truncate">
                          <div className="truncate font-semibold">{item.titulo}</div>
                          {item.descricao && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-normal">
                              {item.descricao}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.badge ? (
                        <span className="px-1.5 py-0.5 rounded-lg text-[9px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0">
                          {item.badge}
                        </span>
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* RODAPÉ: Tema Visual e Logout Seguro */}
        <div
          className="p-3.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/90 space-y-2.5"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Tema Visual
            </span>
            <ThemeToggle />
          </div>

          <button
            onClick={() => {
              onFechar();
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all duration-150 shadow-xs cursor-pointer active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Encerrar Sessão com Segurança</span>
          </button>
        </div>
      </aside>
    </div>
  );

  return <ModalPortal>{drawerContent}</ModalPortal>;
}
