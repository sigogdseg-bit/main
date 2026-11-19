import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Shield,
  MapPin,
  Users,
  Smartphone,
  FileText,
  CreditCard,
  Radio,
  Cpu,
  Sparkles,
  Wrench,
  Palette,
  ShieldCheck,
  Wallet,
  Boxes,
  Activity,
  Fuel,
  Navigation,
  UserCheck,
  Briefcase,
  Store,
  TrendingUp,
  CheckCircle2,
  DollarSign,
  Car,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME, APP_SLOGAN, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { HubModuleCard } from "@/shared/components/HubModuleCard";
import { TiltCard } from "@/shared/components/TiltCard";
import { podeAcessarRota } from "@/shared/lib/permissoesModulos";
import { clientePossuiPendenciaInstalacaoOuAtivacao } from "@/features/clientes/services/clienteService";
import { ClienteHomeView } from "@/features/clientes/components/ClienteHomeView";

interface CardModulo {
  titulo: string;
  rota: string;
  desc: string;
  icone: any;
  tag: string;
  corTag: string;
}

interface SecaoModulos {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  cards: CardModulo[];
}

export function InicioHubView() {
  const { session } = useAuth();
  const [temPendenciaAtivacao, setTemPendenciaAtivacao] = useState(false);
  const [visaoClienteAtiva, setVisaoClienteAtiva] = useState<boolean>(() => {
    // Clientes autenticados entram diretamente na visão personalizada de Meus Veículos
    return Boolean(session?.isCliente);
  });

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

  // Módulos Operacionais Estruturados com o Mesmo Critério Canônico do Menu Hambúrguer:
  // 1º Mapa Operacional para todos os usuários com acesso
  // Em seguida: Monitoramento e Operação, Gestão Comercial e Financeira, Infraestrutura e Governança
  // Regra Pétrea: NUNCA usar caractere comercial proibido (uso estrito da conjunção "e")
  // Atendimento e Suporte, Configurações e Chat ficam exclusivamente no Menu Hambúrguer (ao final) para todos os perfis.
  const secoesModulos: SecaoModulos[] = [
    {
      titulo: "Monitoramento e Operação",
      icone: MapPin,
      cards: [
        {
          titulo: "Mapa Operacional",
          rota: "/monitor-gps",
          desc: "Telemetria em tempo real, status de ignição e bloqueio remoto",
          icone: MapPin,
          tag: "Tempo Real",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: "Módulo Vigilante e Rondas",
          rota: "/vigilantes",
          desc: "Rastreamento pessoal de vigilantes, mapas ultra-aproximados e rondas com janela estrita ±3min",
          icone: ShieldCheck,
          tag: "Ronda Tática",
          corTag: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        },
        {
          titulo: "Rotas e Trajetos Inteligentes",
          rota: "/rotas",
          desc: "Planejamento com múltiplos pontos, desvios e rotas inteligentes pelas ruas",
          icone: Navigation,
          tag: "Navegação",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: "Desempenho da Frota",
          rota: "/frota",
          desc: "Quilometragem diária, tempo ocioso, velocidade máxima e relatórios",
          icone: Activity,
          tag: "Telemetria",
          corTag: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        },
        {
          titulo: "Abastecimento de Veículos",
          rota: "/abastecimento",
          desc: "Lançamento de combustível, leitura de NF com IA e controle de consumo",
          icone: Fuel,
          tag: "Combustível",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: "Manutenção Preventiva",
          rota: "/manutencao",
          desc: "Troca de óleo, pastilhas, controle de odômetro e agendamentos",
          icone: Wrench,
          tag: "Oficina",
          corTag: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        },
        {
          titulo: "Instalações Técnicas",
          rota: "/instalacao",
          desc: "Instalação física de rastreadores, histórico de atendimentos e repasses",
          icone: Wrench,
          tag: "Oficina",
          corTag: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        },
        {
          titulo: "Módulo Demonstração",
          rota: "/demonstracao",
          desc: "Simulador de cadastro de cliente, instalador e demonstração",
          icone: Sparkles,
          tag: "Demonstração",
          corTag: "text-purple-500 bg-purple-500/10 border-purple-500/20",
        },
        ...(session?.isCliente && temPendenciaAtivacao
          ? [
              {
                titulo: "Acompanhamento da Ativação",
                rota: "/onboarding/acompanhamento",
                desc: "Linha do tempo de 6 etapas até a liberação completa do sinal GPS",
                icone: CheckCircle2,
                tag: "Onboarding",
                corTag: "text-amber-500 bg-amber-500/10 border-amber-500/20",
              },
            ]
          : []),
      ],
    },
    {
      titulo: "Gestão Comercial e Financeira",
      icone: Wallet,
      cards: [
        {
          titulo: "Clientes e Planos",
          rota: "/clientes",
          desc: "Controle de clientes, planos Básico/Pro/Master e retenção",
          icone: Users,
          tag: "Comercial",
          corTag: "text-sky-500 bg-sky-500/10 border-sky-500/20",
        },
        {
          titulo: "Gestão de Motoristas",
          rota: "/motoristas",
          desc: "Cadastro, CNH, controle de abastecimentos, despesas e notas fiscais",
          icone: Users,
          tag: "Operação",
          corTag: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        },
        {
          titulo: "Gestão de Funcionários",
          rota: "/funcionarios",
          desc: "Controle de colaboradores da sua equipe e permissões de acesso aos módulos",
          icone: UserCheck,
          tag: "Equipe",
          corTag: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        },
        {
          titulo: "Financeiro e Fluxo de Caixa",
          rota: "/financeiro",
          desc: "Gestão de caixa, DRE operacional, extrato consolidado e relatórios",
          icone: Wallet,
          tag: "Financeiro",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: session?.isCliente ? "Mensalidade" : "Mensalidades e Cobrança",
          rota: "/mensalidades",
          desc: session?.isCliente
            ? "Faturas, 2ª via, vencimentos e chave PIX para pagamento"
            : "Controle financeiro, vencimentos e confirmação de pagamento",
          icone: CreditCard,
          tag: "Financeiro",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: "Estoque e Suprimentos",
          rota: "/estoque",
          desc: "Controle de chips M2M, fios, conectores, relés, rastreadores J16 e compras",
          icone: Boxes,
          tag: "Suprimentos",
          corTag: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        },
        {
          titulo: "Revendedores e Vendedores",
          rota: "/revendedores",
          desc: "Rede comercial parceira, controle de bases, clientes e repasses",
          icone: Briefcase,
          tag: "Comercial",
          corTag: "text-purple-500 bg-purple-500/10 border-purple-500/20",
        },
        {
          titulo: "Minha Franquia e Equipe",
          rota: "/minha-franquia",
          desc: "Gestão da equipe de vendedores, clientes, faturamento e repasses",
          icone: Store,
          tag: "Franquia",
          corTag: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        },
        {
          titulo: "Minhas Vendas e Comissões",
          rota: "/minhas-vendas",
          desc: "Carteira de clientes, comissões de mensalidade e taxas de instalação",
          icone: TrendingUp,
          tag: "Vendas",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
        {
          titulo: "Propostas Comerciais",
          rota: "/propostas",
          desc: "Emissão de propostas oficiais, margem de repasse e envio ao cliente",
          icone: FileText,
          tag: "Comercial",
          corTag: "text-orange-500 bg-orange-500/10 border-orange-500/20",
        },
      ],
    },
    {
      titulo: "Infraestrutura e Governança",
      icone: Shield,
      cards: [
        {
          titulo: "Central de Segurança",
          rota: "/configuracao/central-seguranca",
          desc: "Painel de governança cibernética, status de RLS e integridade forense",
          icone: Shield,
          tag: "Defesa",
          corTag: "text-purple-500 bg-purple-500/10 border-purple-500/20",
        },
        {
          titulo: "Dispositivos Autorizados",
          rota: "/dispositivos",
          desc: "Fingerprint de hardware e política TOFU de confiança",
          icone: Smartphone,
          tag: "Dispositivos",
          corTag: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        },
        ...(session?.isSuperAdmin ||
        session?.isSuperAdminAuditor ||
        session?.isAuditor ||
        session?.role === "superadmin_auditor"
          ? [
              {
                titulo: "Rastreadores J16 4G",
                rota: "/configuracao/rastreador-j16",
                desc:
                  session?.isSuperAdminAuditor ||
                  session?.isAuditor ||
                  session?.role === "superadmin_auditor"
                    ? "Consulta de telemetria, status e leitura de protocolos de hardware"
                    : "Comandos e protocolos Concox / GT06 4G",
                icone: Radio,
                tag: "Hardware",
                corTag: "text-rose-500 bg-rose-500/10 border-rose-500/20",
              },
            ]
          : []),
        {
          titulo: "Usuários e Acessos",
          rota: "/usuarios",
          desc: "Gestão de perfis e controle de acessos",
          icone: Cpu,
          tag: "Acessos",
          corTag: "text-violet-500 bg-violet-500/10 border-violet-500/20",
        },
        {
          titulo: "Temas dos Cards e Módulos",
          rota: "/configuracao/temas",
          desc: "Personalização de cores, dinâmica tátil com mouse e modos visuais",
          icone: Palette,
          tag: "Visual",
          corTag: "text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/20",
        },
        {
          titulo: "Logs do Sistema",
          rota: "/configuracao/logs",
          desc: "Auditoria forense de acessos e operações com hash SHA-256",
          icone: FileText,
          tag: "Auditoria",
          corTag: "text-slate-400 bg-slate-500/10 border-slate-500/20",
        },
      ],
    },
  ];

  // Filtra estritamente os cards por seção conforme as permissões do perfil
  const secoesFiltradas = secoesModulos
    .map((secao) => ({
      ...secao,
      cards: secao.cards.filter((c) => podeAcessarRota(session, c.rota)),
    }))
    .filter((secao) => secao.cards.length > 0);

  // Lista linear de cards filtrados para indexação sequencial de temas e testes
  const todosCards = secoesModulos.flatMap((s) => s.cards);
  const cardsFiltrados = todosCards.filter((c) => podeAcessarRota(session, c.rota));

  // Se a visão de Meus Veículos (Cliente) estiver ativa, renderiza a experiência de alta fidelidade
  if (visaoClienteAtiva) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto select-none">
        {/* Barra superior de retorno / alternância para administradores e operadores */}
        {(session?.isAdmin || session?.isOperador || session?.isSuperAdmin) && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Visualização:{" "}
                <strong className="text-orange-600 dark:text-orange-400">
                  Modo Experiência do Cliente (Meus Veículos)
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVisaoClienteAtiva(false)}
              className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition active:scale-98 cursor-pointer flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Ver Hub de Módulos</span>
            </button>
          </div>
        )}
        <ClienteHomeView onAlternarParaModulos={() => setVisaoClienteAtiva(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      {/* Banner Principal com Adaptação Canônica Neumorphism Suave e Dinâmica Tátil */}
      <TiltCard
        maxTilt={2}
        glowRgb="234, 88, 12"
        className="rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-6 sm:p-8 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl transition-all duration-300"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Logotipo Oficial com Fundo Transparente em Destaque */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:block opacity-90 hover:opacity-100 transition-all hover:scale-105 pointer-events-none">
          <img
            src="/logo.png"
            alt={APP_NOME}
            fetchPriority="high"
            decoding="async"
            className="h-36 w-auto max-w-[200px] object-contain drop-shadow-2xl"
          />
        </div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold mb-3 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span>
              {APP_NOME} v{APP_VERSION_NUMERO}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Painel Geral Operacional
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{APP_SLOGAN}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <span>Usuário Conectado:</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">
              {session?.nome?.replace(/superadmin/gi, "Administrador")}
            </span>
            {session?.isAdmin ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                <span>Administrador</span>
              </span>
            ) : session?.isFinanceiro ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span>Financeiro</span>
              </span>
            ) : (
              <>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                  {session?.role}
                </span>
                {session?.isCliente && session?.plano && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 dark:border-sky-500/30 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                    Plano {session.plano}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Botão de Alternância Direta para Visão de Meus Veículos */}
          <div className="mt-4 pt-3 border-t border-slate-300/40 dark:border-slate-800/80 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisaoClienteAtiva(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-xs transition active:scale-98 cursor-pointer"
            >
              <Car className="w-3.5 h-3.5" />
              <span>
                {session?.isCliente
                  ? "Ver Meus Veículos"
                  : "Acessar Visão do Cliente (Meus Veículos)"}
              </span>
            </button>
          </div>
        </div>
      </TiltCard>

      {/* Grid de Cards Raiz com Sincronização em Tempo Real do Tema Ativo */}
      {cardsFiltrados.length === 0 ? (
        <div className="rounded-3xl p-8 sm:p-12 text-center bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Shield className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Nenhum módulo liberado no momento
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {session?.isFuncionario
                ? "Sua conta de colaborador está ativa, porém nenhum módulo operacional foi atribuído ainda pelo cliente titular da conta. Entre em contato com seu gestor para liberação dos módulos necessários."
                : "Sua conta de operador está ativa, porém nenhum módulo operacional foi atribuído ainda pelo administrador. Entre em contato com a governança para liberação dos módulos necessários."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {secoesFiltradas.map((secao) => {
            const SecaoIcon = secao.icone;
            return (
              <section key={secao.titulo} className="space-y-4">
                <div className="flex items-center gap-2.5 pb-1">
                  <div className="p-1.5 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20 shadow-xs">
                    <SecaoIcon className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                    {secao.titulo}
                  </h2>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    {secao.cards.length} {secao.cards.length === 1 ? "módulo" : "módulos"}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800 to-transparent ml-2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {secao.cards.map((c) => {
                    const globalIdx = cardsFiltrados.findIndex((x) => x.rota === c.rota);
                    return (
                      <HubModuleCard
                        key={c.rota}
                        to={c.rota}
                        title={c.titulo}
                        desc={c.desc}
                        icon={c.icone}
                        footerInfo={c.tag}
                        index={globalIdx >= 0 ? globalIdx : 0}
                        userId={session?.userId}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
