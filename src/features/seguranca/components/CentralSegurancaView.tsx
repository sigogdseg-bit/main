import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldCheck,
  Lock,
  Database,
  Smartphone,
  Eye,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Activity,
  RefreshCw,
  Search,
  Fingerprint,
  Scale,
  ShieldAlert,
  Users,
  Radio,
  Unlock,
  Radar,
  ArrowLeft,
  Link2,
  UserPlus,
  ListChecks,
  ScrollText,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { gerarLaudoPericialForensePdf } from "../services/laudoPericialPdfService";
import { isModoDegustacao } from "@/features/demonstracao/services/degustacaoMasterService";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  obterAnaliseUeba,
  encerrarSessaoUsuario,
  obterAnomaliasLogin,
  obterSnapshotAuditoriaBanco,
  obterBloqueiosLogin,
  desbloquearChaveLogin,
  obterHoneytokens,
  obterDispositivosSeguranca,
  alterarStatusDispositivo,
  obterConfiguracaoDlp,
  salvarConfiguracaoDlp,
  obterIntegridadeFim,
  obterLgpdSolicitacoes,
  atenderLgpdSolicitacao,
  obterMetricasSegurancaExecutivas,
  obterStatusDefesaCibernetica,
  verificarCadeiaCustodiaLogs,
  obterHistoricoSinaisVersao,
  obterAdminAuditLogs,
  obterEventosAntiAbusoCadastros,
  executarVerificacaoEmLote,
  type EventoUebaUsuario,
  type ResumoAnomaliasLogin,
  type SnapshotAuditoriaCompleto,
  type RegistroBloqueioLogin,
  type HoneytokenArmadilha,
  type DispositivoAutorizado,
  type ConfiguracaoDlp,
  type ComponenteFim,
  type LgpdSolicitacaoItem,
  type MetricasSegurancaExecutivas,
  type StatusDefesaCiberneticaCompleto,
  type ResultadoCadeiaLogs,
  type SinalVersaoDispositivo,
  type AdminAuditLogItem,
  type EventoAntiAbusoCadastro,
  type ResultadoVerificacaoLote,
} from "../services/segurancaModulosService";
import {
  type NivelProtecao,
  NIVEL_LABEL,
  NIVEL_COR,
  PROTECOES_ATAQUES_BASE,
  contarPorNivel,
} from "../lib/protecoes-ataques";
import {
  PainelCadeiaCustodiaLogs,
  PainelAtualizacaoMassa,
  PainelGovernancaSeguranca,
  PainelAuditAdmin,
  PainelMonitoramentoCadastros,
  PainelVerificacaoLote,
} from "./CentralSegurancaModulosExtras";

export type ModuloSegurancaId =
  | "hub"
  | "ueba"
  | "anomalias"
  | "auditoria"
  | "lockout"
  | "cadeia"
  | "honeytokens"
  | "dispositivos"
  | "atualizacao_massa"
  | "dlp"
  | "governanca"
  | "fim"
  | "lgpd"
  | "audit_admin"
  | "logs"
  | "metricas"
  | "anti_abuso"
  | "semaforo"
  | "verificacao_lote";

export const CARDS_CENTRAL_SEGURANCA: Array<{
  id: Exclude<ModuloSegurancaId, "hub">;
  title: string;
  desc: string;
  icon: any;
}> = [
  {
    id: "ueba",
    title: "Análise Comportamental e Volume Atípico (UEBA)",
    desc: "Monitora rajadas anômalas (>25 ações/janela), acessos fora de hora (00h–05h) e desvios.",
    icon: Users,
  },
  {
    id: "anomalias",
    title: "Anomalias de Login",
    desc: "Classifica falhas em 4 vetores: credential stuffing, força bruta focada, rajadas e enumeração.",
    icon: AlertTriangle,
  },
  {
    id: "auditoria",
    title: "Auditoria de Segurança",
    desc: "Snapshot ao vivo do PostgreSQL: RLS, políticas, funções SECURITY DEFINER e buckets.",
    icon: Database,
  },
  {
    id: "lockout",
    title: "Bloqueios de Login",
    desc: "Gerencia bloqueios progressivos (5 falhas/15m, 10/1h, 20/24h) com desbloqueio auditado.",
    icon: Lock,
  },
  {
    id: "cadeia",
    title: "Cadeia de Custódia dos Logs",
    desc: "Encadeamento SHA-256 contínuo em system_activity_logs com validação pericial ao vivo.",
    icon: Link2,
  },
  {
    id: "honeytokens",
    title: "Defesa Proativa (Honeytokens / Deception)",
    desc: "Contas e tabelas isca monitoradas que bloqueiam por 48h qualquer tentativa de acesso.",
    icon: ShieldAlert,
  },
  {
    id: "dispositivos",
    title: "Dispositivos",
    desc: "Gestão de aparelhos com fingerprint TOFU: autorização e revogação administrativa.",
    icon: Smartphone,
  },
  {
    id: "atualizacao_massa",
    title: "Forçar Atualização em Massa de Dispositivos",
    desc: "Emite sinal Realtime para limpar caches locais e recarregar PWAs de campo.",
    icon: RefreshCw,
  },
  {
    id: "dlp",
    title: "Governança de Dados e Proteção de Tela (DLP)",
    desc: "Ofuscamento automático por perda de foco (blur) e bloqueio preventivo de impressão.",
    icon: Eye,
  },
  {
    id: "governanca",
    title: "Governança de Segurança",
    desc: "Diretrizes técnicas e jurídicas (LGPD, CPP art. 158-A e Marco Civil) com laudo PDF.",
    icon: Scale,
  },
  {
    id: "fim",
    title: "Integridade do Schema e Gatilhos (FIM)",
    desc: "Checksums SHA-256 reais das funções SECURITY DEFINER e políticas RLS do PostgreSQL.",
    icon: Fingerprint,
  },
  {
    id: "lgpd",
    title: "LGPD — Solicitações",
    desc: "Atendimento aos direitos dos titulares (art. 18 LGPD) com trilha de decisão auditada.",
    icon: Scale,
  },
  {
    id: "audit_admin",
    title: "Log de Ações Administrativas",
    desc: "Trilha imutável de atos privilegiados de administradores com diff antes/depois em JSONB.",
    icon: FileText,
  },
  {
    id: "logs",
    title: "Log do sistema",
    desc: "Registro detalhado de autenticações e ações operacionais com IP e dispositivo.",
    icon: ScrollText,
  },
  {
    id: "metricas",
    title: "Métricas de Segurança",
    desc: "Painel executivo: logins, bloqueios, cadeia SHA-256, documentos emitidos e RLS ao vivo.",
    icon: BarChart3,
  },
  {
    id: "anti_abuso",
    title: "Monitoramento de Cadastros",
    desc: "Anti-abuso nas rotas públicas: bloqueio de e-mails descartáveis e detecção de anomalias.",
    icon: UserPlus,
  },
  {
    id: "semaforo",
    title: "Status de Defesa Cibernética",
    desc: "Semáforo em tempo real (polling 30s), Matriz Integrada de Risco e Catálogo de Vetores.",
    icon: Radio,
  },
  {
    id: "verificacao_lote",
    title: "Verificação em Lote",
    desc: "Revalidação conjunta da cadeia SHA-256 dos logs e hashes de documentos emitidos.",
    icon: ListChecks,
  },
];

export function CentralSegurancaView() {
  const sessao = obterSessaoCacheada();
  const isSomenteLeitura = Boolean(sessao?.isAuditor && !sessao?.isAdmin);

  const [moduloAtivo, setModuloAtivo] = useState<ModuloSegurancaId>("hub");
  const [carregando, setCarregando] = useState(false);

  // Filtros bidirecionais ativos
  const [filtroNivelSemaforo, setFiltroNivelSemaforo] = useState<string | null>(null);
  const [filtroNivelAtaque, setFiltroNivelAtaque] = useState<NivelProtecao | null>(null);
  const [filtroScoreUeba, setFiltroScoreUeba] = useState<string | null>(null);
  const [filtroCategoriaAnomalia, setFiltroCategoriaAnomalia] = useState<string | null>(null);
  const [filtroStatusBloqueio, setFiltroStatusBloqueio] = useState<
    "todos" | "ativos" | "expirados"
  >("todos");
  const [filtroStatusDisp, setFiltroStatusDisp] = useState<"todos" | "autorizado" | "pendente">(
    "todos",
  );
  const [filtroStatusLgpd, setFiltroStatusLgpd] = useState<
    "todos" | "pendente" | "atendido" | "rejeitado"
  >("todos");
  const [subAbaAuditoria, setSubAbaAuditoria] = useState<
    "tabelas" | "politicas" | "funcoes" | "buckets"
  >("tabelas");

  const [statusDefesa, setStatusDefesa] = useState<StatusDefesaCiberneticaCompleto | null>(null);
  const [metricasExec, setMetricasExec] = useState<MetricasSegurancaExecutivas>({
    totalLogins: 0,
    falhasLogins: 0,
    taxaSucessoLogins: "0%",
    dispositivosAutorizados: 0,
    dispositivosPendentes: 0,
    bloqueiosAtivos: 0,
    solicitacoesLgpdPendentes: 0,
    honeytokensAtivos: 0,
    honeytokensDisparados: 0,
    adminAuditTotal: 0,
    cadastrosSuspeitos7d: 0,
    documentosEmitidosTotal: 0,
    cadeiaLogsTotal: 0,
    conformidadeRlsPercentual: 0,
  });

  const [uebaEventos, setUebaEventos] = useState<EventoUebaUsuario[]>([]);
  const [anomaliasLogin, setAnomaliasLogin] = useState<ResumoAnomaliasLogin>({
    totalFalhas: 0,
    credentialStuffing: 0,
    forcaBruta: 0,
    rajadasAtaque: 0,
    enumeracao: 0,
    incidentes: [],
  });
  const [auditoriaBanco, setAuditoriaBanco] = useState<SnapshotAuditoriaCompleto>({
    disponivel: false,
    geradoEm: "",
    tabelasProtegidas: 0,
    totalTabelas: 0,
    percentualConformidade: 0,
    tabelas: [],
    politicas: [],
    funcoesSecurityDefiner: [],
    bucketsStorage: [],
    contagens: {},
  });
  const [bloqueios, setBloqueios] = useState<RegistroBloqueioLogin[]>([]);
  const [cadeiaLogs, setCadeiaLogs] = useState<ResultadoCadeiaLogs | null>(null);
  const [honeytokens, setHoneytokens] = useState<HoneytokenArmadilha[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoAutorizado[]>([]);
  const [sinaisVersao, setSinaisVersao] = useState<SinalVersaoDispositivo[]>([]);
  const [dlpConfig, setDlpConfig] = useState<ConfiguracaoDlp>({
    blurPerdaFocoAtivo: true,
    bloqueioPrintAtivo: true,
  });
  const [componentesFim, setComponentesFim] = useState<ComponenteFim[]>([]);
  const [lgpdSolicitacoes, setLgpdSolicitacoes] = useState<LgpdSolicitacaoItem[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [eventosAntiAbuso, setEventosAntiAbuso] = useState<EventoAntiAbusoCadastro[]>([]);
  const [verificacaoLote, setVerificacaoLote] = useState<ResultadoVerificacaoLote | null>(null);

  const [logsLogin, setLogsLogin] = useState<any[]>([]);
  const [logsAtividade, setLogsAtividade] = useState<any[]>([]);
  const [filtroLog, setFiltroLog] = useState("");
  const [tipoLog, setTipoLog] = useState<"login" | "atividade">("login");

  const cardsOrdenadosAZ = useMemo(
    () =>
      [...CARDS_CENTRAL_SEGURANCA].sort((a, b) =>
        a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }),
      ),
    [],
  );

  const carregarTodosDados = useCallback(async () => {
    setCarregando(true);
    try {
      const snap = await obterSnapshotAuditoriaBanco();
      setAuditoriaBanco(snap);

      const [
        sem,
        met,
        ue,
        anom,
        bloq,
        cad,
        ht,
        disp,
        sinais,
        dlp,
        fim,
        lgpd,
        admLogs,
        antiAbuso,
        lote,
        { data: logLData },
        { data: logAData },
      ] = await Promise.all([
        obterStatusDefesaCibernetica(snap),
        obterMetricasSegurancaExecutivas(snap),
        obterAnaliseUeba(),
        obterAnomaliasLogin(),
        obterBloqueiosLogin(),
        verificarCadeiaCustodiaLogs(),
        obterHoneytokens(),
        obterDispositivosSeguranca(),
        obterHistoricoSinaisVersao(),
        obterConfiguracaoDlp(),
        obterIntegridadeFim(snap),
        obterLgpdSolicitacoes(),
        obterAdminAuditLogs(),
        obterEventosAntiAbusoCadastros(),
        executarVerificacaoEmLote(),
        supabase
          .from("system_login_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("system_activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setStatusDefesa(sem);
      setMetricasExec(met);
      setUebaEventos(ue);
      setAnomaliasLogin(anom);
      setBloqueios(bloq);
      setCadeiaLogs(cad);
      setHoneytokens(ht);
      setDispositivos(disp);
      setSinaisVersao(sinais);
      setDlpConfig(dlp);
      setComponentesFim(fim);
      setLgpdSolicitacoes(lgpd);
      setAdminAuditLogs(admLogs);
      setEventosAntiAbuso(antiAbuso);
      setVerificacaoLote(lote);
      if (logLData) setLogsLogin(logLData);
      if (logAData) setLogsAtividade(logAData);
    } catch (err) {
      console.error("Erro ao carregar Central de Segurança:", err);
      toast.error("Erro ao consultar métricas de segurança no banco de dados.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarTodosDados();
  }, [carregarTodosDados]);

  // Módulo 19: Polling automático de 30s exclusivamente enquanto o Status de Defesa estiver aberto
  useEffect(() => {
    if (moduloAtivo !== "semaforo") return;
    const timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        void carregarTodosDados();
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [moduloAtivo, carregarTodosDados]);

  const handleDesbloquear = async (id: string, chave: string) => {
    if (isSomenteLeitura) {
      toast.error("Perfil auditor em modo somente leitura.");
      return;
    }
    const ok = await desbloquearChaveLogin(id, chave);
    if (ok) {
      toast.success(`Chave ${chave} desbloqueada e registrada na auditoria.`);
      setBloqueios(await obterBloqueiosLogin());
    } else {
      toast.error("Erro ao desbloquear chave.");
    }
  };

  const handleSalvarDlp = async () => {
    if (isSomenteLeitura) {
      toast.error("Perfil auditor em modo somente leitura.");
      return;
    }
    const ok = await salvarConfiguracaoDlp(dlpConfig);
    if (ok) {
      toast.success("Diretrizes DLP atualizadas com sucesso!");
    } else {
      toast.error("Erro ao salvar configuração DLP.");
    }
  };

  const handleTratarLgpd = async (id: string, decisao: "atendido" | "rejeitado") => {
    if (isSomenteLeitura) {
      toast.error("Perfil auditor em modo somente leitura.");
      return;
    }
    const justificativa =
      decisao === "atendido"
        ? "Solicitação atendida conforme protocolo Art. 18 LGPD."
        : "Solicitação indeferida por obrigação legal de retenção.";
    const ok = await atenderLgpdSolicitacao(id, decisao, justificativa);
    if (ok) {
      toast.success(`Solicitação marcada como ${decisao}.`);
      setLgpdSolicitacoes(await obterLgpdSolicitacoes());
    } else {
      toast.error("Erro ao tramitar solicitação LGPD.");
    }
  };

  const gerarLaudoForensePdf = async () => {
    try {
      toast.loading("Compilando laudo pericial forense com Selo SGD e QR Code...");
      const sessaoAtual = obterSessaoCacheada();
      const isSimulacao = isModoDegustacao(sessaoAtual);

      const resultado = await gerarLaudoPericialForensePdf({
        emissor: isSimulacao
          ? "Degustação Master (Avaliação Técnica)"
          : `${sessaoAtual?.nome || "SuperADM"} (Governança e Perícia Digital)`,
        perfilEmissor: isSimulacao
          ? "Degustação Master"
          : isSomenteLeitura
            ? "Auditor Somente Leitura"
            : "SuperAdmin Governança",
        isSimulacao,
        statusCibernetico: statusDefesa?.statusGeral || "amarelo",
        eficienciaGlobal: statusDefesa?.matrizRisco?.media
          ? statusDefesa.matrizRisco.media.toFixed(2)
          : "0.00",
        matrizRiscoMedia: statusDefesa?.matrizRisco?.media || 0,
        totalModulosAtivos: CARDS_CENTRAL_SEGURANCA.length,
        totalVetoresMitigados: statusDefesa?.contagemVetores?.bloquear || 0,
        anomaliasLogin: anomaliasLogin.totalFalhas,
        bloqueiosAtivos: metricasExec.bloqueiosAtivos,
      });

      resultado.doc.save(resultado.nomeArquivo);
      toast.dismiss();
      toast.success(`Laudo pericial emitido em PDF com Selo ${resultado.seloSgd}!`);
    } catch (e) {
      console.error(e);
      toast.dismiss();
      toast.error("Erro ao emitir laudo pericial em PDF.");
    }
  };

  const vetoresFonte = statusDefesa?.vetoresApurados || PROTECOES_ATAQUES_BASE;
  const contagemAtaques = statusDefesa?.contagemVetores || contarPorNivel(vetoresFonte);

  const categoriasFiltradasAtaques = useMemo(() => {
    return vetoresFonte
      .map((cat) => ({
        ...cat,
        itens: filtroNivelAtaque
          ? cat.itens.filter((i) => i.nivel === filtroNivelAtaque)
          : cat.itens,
      }))
      .filter((cat) => cat.itens.length > 0);
  }, [vetoresFonte, filtroNivelAtaque]);

  const indicadoresFiltrados = useMemo(() => {
    const todos = statusDefesa?.indicadores || [];
    if (!filtroNivelSemaforo) return todos;
    return todos.filter((ind) => ind.nivel === filtroNivelSemaforo);
  }, [statusDefesa?.indicadores, filtroNivelSemaforo]);

  const uebaContagens = useMemo(
    () => ({
      todos: uebaEventos.length,
      critico: uebaEventos.filter((e) => e.scoreRisco === "critico").length,
      alto: uebaEventos.filter((e) => e.scoreRisco === "alto").length,
      medio: uebaEventos.filter((e) => e.scoreRisco === "medio").length,
      baixo: uebaEventos.filter((e) => e.scoreRisco === "baixo").length,
    }),
    [uebaEventos],
  );

  const uebaEventosFiltrados = useMemo(() => {
    if (!filtroScoreUeba) return uebaEventos;
    return uebaEventos.filter((e) => e.scoreRisco === filtroScoreUeba);
  }, [uebaEventos, filtroScoreUeba]);

  const incidentesAnomaliasFiltrados = useMemo(() => {
    const list = anomaliasLogin.incidentes;
    if (!filtroCategoriaAnomalia) return list;
    return list.filter((inc) => inc.categoria === filtroCategoriaAnomalia);
  }, [anomaliasLogin.incidentes, filtroCategoriaAnomalia]);

  const bloqueiosFiltrados = useMemo(() => {
    if (filtroStatusBloqueio === "ativos") return bloqueios.filter((b) => b.ativo);
    if (filtroStatusBloqueio === "expirados") return bloqueios.filter((b) => !b.ativo);
    return bloqueios;
  }, [bloqueios, filtroStatusBloqueio]);

  const dispositivosFiltrados = useMemo(() => {
    if (filtroStatusDisp === "autorizado")
      return dispositivos.filter((d) => d.status.toLowerCase().includes("autoriz"));
    if (filtroStatusDisp === "pendente")
      return dispositivos.filter((d) => d.status.toLowerCase().includes("pend"));
    return dispositivos;
  }, [dispositivos, filtroStatusDisp]);

  const lgpdSolicitacoesFiltradas = useMemo(() => {
    if (filtroStatusLgpd === "todos") return lgpdSolicitacoes;
    return lgpdSolicitacoes.filter((item) => item.status === filtroStatusLgpd);
  }, [lgpdSolicitacoes, filtroStatusLgpd]);

  const cardAtual = cardsOrdenadosAZ.find((c) => c.id === moduloAtivo);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 select-none transition-all duration-300 pb-28">
      {/* Cabeçalho Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden mt-1 sm:mt-0">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
            <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-slate-100">
                Central de Segurança Cibernética
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 whitespace-nowrap">
                v{APP_VERSION_NUMERO}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 whitespace-nowrap">
                {cardsOrdenadosAZ.length} Módulos A–Z
              </span>
              {isSomenteLeitura && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
                  Modo Auditoria (Somente Leitura)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {cardAtual
                ? cardAtual.title
                : `Governança, auditoria forense ao vivo e defesa em profundidade ${APP_NOME}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {moduloAtivo !== "hub" && (
            <button
              onClick={() => setModuloAtivo("hub")}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 hover:bg-[#dfe8f5] dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300/60 dark:border-slate-700 min-h-[44px] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Central A–Z</span>
            </button>
          )}
          <button
            onClick={gerarLaudoForensePdf}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_8px_rgba(249,115,22,0.35)] transition min-h-[44px] cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span>Emitir Laudo Pericial</span>
          </button>
          <button
            onClick={() => void carregarTodosDados()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 hover:bg-[#dfe8f5] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 transition min-h-[44px] cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 shrink-0 ${carregando ? "animate-spin text-orange-600" : ""}`}
            />
            <span>Auditar</span>
          </button>
        </div>
      </div>

      {/* HUB EXECUTIVO A–Z (PADRÃO CANÔNICO DEV-MODULOS SEG) */}
      {moduloAtivo === "hub" && (
        <div className="space-y-5">
          {/* Resumo Rápido Ao Vivo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setModuloAtivo("semaforo")}
              className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
            >
              <div className="text-[11px] font-bold uppercase text-slate-500">Defesa Geral</div>
              <div className="text-lg font-black mt-1 text-emerald-600 dark:text-emerald-400">
                {statusDefesa ? statusDefesa.matrizRisco.notaGeral : "Carregando..."}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {statusDefesa
                  ? `${statusDefesa.matrizRisco.media.toFixed(2)} / 5.00`
                  : "Apurando PostgreSQL"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setModuloAtivo("auditoria")}
              className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
            >
              <div className="text-[11px] font-bold uppercase text-slate-500">Cobertura RLS</div>
              <div className="text-lg font-black mt-1 text-slate-900 dark:text-slate-100">
                {auditoriaBanco.disponivel
                  ? `${auditoriaBanco.tabelasProtegidas}/${auditoriaBanco.totalTabelas}`
                  : "—"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {auditoriaBanco.percentualConformidade}% ao vivo
              </div>
            </button>
            <button
              type="button"
              onClick={() => setModuloAtivo("cadeia")}
              className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
            >
              <div className="text-[11px] font-bold uppercase text-slate-500">Cadeia SHA-256</div>
              <div
                className={`text-lg font-black mt-1 ${
                  cadeiaLogs?.integra ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"
                }`}
              >
                {cadeiaLogs ? (cadeiaLogs.integra ? "Íntegra" : "Alerta") : "—"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {cadeiaLogs ? `${cadeiaLogs.ok}/${cadeiaLogs.total} logs` : "Verificando"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setModuloAtivo("lockout")}
              className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
            >
              <div className="text-[11px] font-bold uppercase text-slate-500">Bloqueios Ativos</div>
              <div className="text-lg font-black mt-1 text-slate-900 dark:text-slate-100">
                {metricasExec.bloqueiosAtivos}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {anomaliasLogin.totalFalhas} falhas em 7 dias
              </div>
            </button>
          </div>

          {/* Grid Alfabético A–Z */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cardsOrdenadosAZ.map(({ id, title, desc, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setModuloAtivo(id)}
                className="group text-left p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl hover:border-orange-500/50 transition-all cursor-pointer flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 group-hover:scale-105 transition">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {title}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                  Abrir módulo →
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MÓDULO 19: STATUS DE DEFESA CIBERNÉTICA (SEMÁFORO 30s + MATRIZ + 51 VETORES) */}
      {moduloAtivo === "semaforo" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    statusDefesa?.statusGeral === "vermelho"
                      ? "bg-rose-500"
                      : statusDefesa?.statusGeral === "amarelo"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    statusDefesa?.statusGeral === "vermelho"
                      ? "bg-rose-600"
                      : statusDefesa?.statusGeral === "amarelo"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Semáforo de Defesa Cibernética (Atualização Automática 30s)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Indicadores apurados ao vivo via PostgreSQL e tabelas de auditoria do {APP_NOME}
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
              {statusDefesa?.statusRotuloGeral || "Apurando..."}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                {
                  id: "otimo",
                  label: "Ótimo",
                  cor: "text-emerald-500",
                  bg: "bg-emerald-500/10 border-emerald-500/30",
                },
                {
                  id: "bom",
                  label: "Bom",
                  cor: "text-sky-500",
                  bg: "bg-sky-500/10 border-sky-500/30",
                },
                {
                  id: "atencao",
                  label: "Atenção",
                  cor: "text-amber-500",
                  bg: "bg-amber-500/10 border-amber-500/30",
                },
                {
                  id: "critico",
                  label: "Crítico",
                  cor: "text-rose-500",
                  bg: "bg-rose-500/10 border-rose-500/30",
                },
              ] as const
            ).map((n) => {
              const ativo = filtroNivelSemaforo === n.id;
              const qtd = statusDefesa?.resumoIndicadores?.[n.id] ?? 0;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setFiltroNivelSemaforo(ativo ? null : n.id)}
                  className={`rounded-2xl border p-3.5 text-center transition cursor-pointer ${n.bg} ${
                    ativo ? "ring-2 ring-orange-500" : ""
                  }`}
                >
                  <div className={`text-2xl font-black ${n.cor}`}>{qtd}</div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                    {n.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {indicadoresFiltrados.map((ind) => (
              <div
                key={ind.titulo}
                className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {ind.titulo}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    {ind.categoria}
                  </span>
                </div>
                <div className="text-sm font-black text-orange-600 dark:text-orange-400">
                  {ind.valor}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{ind.descricao}</p>
              </div>
            ))}
          </div>

          {statusDefesa?.matrizRisco && (
            <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Matriz Integrada de Risco (Ponderada por Vetor)
                </h4>
                <div className={`text-base font-black ${statusDefesa.matrizRisco.notaCor}`}>
                  {statusDefesa.matrizRisco.media.toFixed(2)} / 5.00 —{" "}
                  {statusDefesa.matrizRisco.notaGeral}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-slate-300/60 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-3">Vetor</th>
                      <th className="py-2 pr-3">Peso</th>
                      <th className="py-2 pr-3">Nota</th>
                      <th className="py-2">Fundamentação Factual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusDefesa.matrizRisco.linhas.map((l) => (
                      <tr
                        key={l.vetor}
                        className="border-b border-slate-200/60 dark:border-slate-800/60"
                      >
                        <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                          {l.vetor}
                        </td>
                        <td className="py-2 pr-3 font-mono">{l.peso}</td>
                        <td className="py-2 pr-3 font-bold text-orange-600">{l.estrelas}★</td>
                        <td className="py-2 text-slate-600 dark:text-slate-400">{l.nota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Catálogo Dinâmico dos Vetores */}
          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-orange-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Catálogo Dinâmico de Vetores de Ataque
                </h4>
              </div>
              <div className="flex gap-2">
                {(["bloquear", "detectar", "exposto"] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFiltroNivelAtaque(filtroNivelAtaque === n ? null : n)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${
                      filtroNivelAtaque === n
                        ? "ring-2 ring-orange-500 bg-orange-500/15"
                        : "bg-white/60 dark:bg-slate-950/60"
                    } ${NIVEL_COR[n]}`}
                  >
                    {NIVEL_LABEL[n]}: {contagemAtaques[n]}
                  </button>
                ))}
              </div>
            </div>

            {categoriasFiltradasAtaques.map((cat) => (
              <div key={cat.categoria} className="space-y-1.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {cat.categoria}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs">
                    <tbody>
                      {cat.itens.map((it) => (
                        <tr
                          key={it.nome}
                          className="border-t first:border-t-0 border-slate-200 dark:border-slate-800"
                        >
                          <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100 w-1/4">
                            {it.nome}
                          </td>
                          <td
                            className={`px-3 py-2 font-bold whitespace-nowrap ${NIVEL_COR[it.nivel]}`}
                          >
                            {NIVEL_LABEL[it.nivel]}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {it.como}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MÓDULO 03: AUDITORIA DO BANCO AO VIVO */}
      {moduloAtivo === "auditoria" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                { id: "tabelas", label: `Tabelas (${auditoriaBanco.tabelas.length})` },
                { id: "politicas", label: `Políticas RLS (${auditoriaBanco.politicas.length})` },
                {
                  id: "funcoes",
                  label: `SECURITY DEFINER (${auditoriaBanco.funcoesSecurityDefiner.length})`,
                },
                { id: "buckets", label: `Buckets (${auditoriaBanco.bucketsStorage.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubAbaAuditoria(tab.id)}
                className={`p-3 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                  subAbaAuditoria === tab.id
                    ? "bg-orange-500 text-slate-950 border-orange-500"
                    : "bg-[#eaf0f8] dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 overflow-x-auto">
            {subAbaAuditoria === "tabelas" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-300/60 dark:border-slate-800">
                    <th className="py-2 pr-3">Tabela</th>
                    <th className="py-2 pr-3">RLS</th>
                    <th className="py-2 pr-3">Políticas</th>
                    <th className="py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoriaBanco.tabelas.map((t) => (
                    <tr
                      key={t.nome}
                      className="border-b border-slate-200/60 dark:border-slate-800/60"
                    >
                      <td className="py-2 pr-3 font-mono font-bold">{t.nome}</td>
                      <td className="py-2 pr-3">{t.rlsAtivo ? "Ativo" : "Inativo"}</td>
                      <td className="py-2 pr-3">{t.totalPoliticas}</td>
                      <td
                        className={`py-2 font-bold ${
                          t.rlsAtivo ? "text-emerald-600" : "text-rose-500"
                        }`}
                      >
                        {t.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {subAbaAuditoria === "politicas" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-300/60 dark:border-slate-800">
                    <th className="py-2 pr-3">Tabela</th>
                    <th className="py-2 pr-3">Política</th>
                    <th className="py-2 pr-3">Cmd</th>
                    <th className="py-2">Expressão USING</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoriaBanco.politicas.map((p, idx) => (
                    <tr
                      key={`${p.tabela}-${p.politica}-${idx}`}
                      className="border-b border-slate-200/60 dark:border-slate-800/60"
                    >
                      <td className="py-2 pr-3 font-mono">{p.tabela}</td>
                      <td className="py-2 pr-3 font-semibold">{p.politica}</td>
                      <td className="py-2 pr-3 font-mono">{p.comando}</td>
                      <td className="py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                        {p.expressaoUsando || p.expressaoVerificando || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {subAbaAuditoria === "funcoes" && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-300/60 dark:border-slate-800">
                    <th className="py-2 pr-3">Função</th>
                    <th className="py-2 pr-3">Retorno</th>
                    <th className="py-2">SHA-256 PostgreSQL</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoriaBanco.funcoesSecurityDefiner.map((f) => (
                    <tr
                      key={f.funcao}
                      className="border-b border-slate-200/60 dark:border-slate-800/60"
                    >
                      <td className="py-2 pr-3 font-mono font-bold">{f.funcao}()</td>
                      <td className="py-2 pr-3">{f.retorna}</td>
                      <td className="py-2 font-mono text-[11px]">
                        {f.checksum ? f.checksum.slice(0, 24) + "..." : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {subAbaAuditoria === "buckets" && (
              <div className="space-y-2">
                {auditoriaBanco.bucketsStorage.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum bucket de storage configurado.</p>
                ) : (
                  auditoriaBanco.bucketsStorage.map((b) => (
                    <div
                      key={b.bucket}
                      className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-mono font-bold">{b.nome}</span>
                      <span
                        className={`font-bold ${b.publico ? "text-amber-500" : "text-emerald-600"}`}
                      >
                        {b.publico ? "Público" : "Privado"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MÓDULO 01: UEBA */}
      {moduloAtivo === "ueba" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(["todos", "critico", "alto", "medio", "baixo"] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => setFiltroScoreUeba(sc === "todos" ? null : sc)}
                className={`p-3 rounded-2xl border text-center cursor-pointer ${
                  (sc === "todos" && !filtroScoreUeba) || filtroScoreUeba === sc
                    ? "bg-orange-500/15 border-orange-500"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                <div className="text-lg font-black">{uebaContagens[sc]}</div>
                <div className="text-[11px] uppercase font-bold text-slate-500">{sc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {uebaEventosFiltrados.map((ev) => (
              <div
                key={ev.userId}
                className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {ev.identificador}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">{ev.motivoRisco}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Módulos: {ev.modulosAtingidos.join(", ") || "—"} · Ações: {ev.volumeRequisicoes}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full font-bold uppercase text-[10px] bg-slate-200 dark:bg-slate-800">
                    {ev.scoreRisco}
                  </span>
                  {ev.userId !== "anonimo" && !isSomenteLeitura && (
                    <button
                      onClick={async () => {
                        const ok = await encerrarSessaoUsuario(ev.userId, ev.nome);
                        if (ok) toast.success(`Sessão encerrada para ${ev.nome}.`);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 font-bold hover:bg-rose-500/25 cursor-pointer"
                    >
                      Encerrar Sessão
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MÓDULO 02: ANOMALIAS DE LOGIN */}
      {moduloAtivo === "anomalias" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { cat: "Credential Stuffing", qtd: anomaliasLogin.credentialStuffing },
              { cat: "Força Bruta", qtd: anomaliasLogin.forcaBruta },
              { cat: "Rajada", qtd: anomaliasLogin.rajadasAtaque },
              { cat: "Enumeração", qtd: anomaliasLogin.enumeracao },
            ].map((item) => (
              <button
                key={item.cat}
                onClick={() =>
                  setFiltroCategoriaAnomalia(filtroCategoriaAnomalia === item.cat ? null : item.cat)
                }
                className={`p-4 rounded-2xl border text-center cursor-pointer ${
                  filtroCategoriaAnomalia === item.cat
                    ? "border-orange-500 bg-orange-500/10"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                <div className="text-2xl font-black">{item.qtd}</div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  {item.cat}
                </div>
              </button>
            ))}
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2">
            {incidentesAnomaliasFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhuma anomalia de login detectada nos últimos 7 dias.
              </p>
            ) : (
              incidentesAnomaliasFiltrados.map((inc, i) => (
                <div
                  key={`${inc.ip}-${inc.email}-${i}`}
                  className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap justify-between gap-2"
                >
                  <div>
                    <strong>{inc.categoria}</strong> ({inc.severidade}) — {inc.email} · {inc.ip}
                  </div>
                  <div className="text-slate-500">
                    {inc.tentativas} tentativas · {new Date(inc.ultimoEm).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MÓDULO 04: BLOQUEIOS DE LOGIN */}
      {moduloAtivo === "lockout" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["todos", "ativos", "expirados"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFiltroStatusBloqueio(st)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold border cursor-pointer ${
                  filtroStatusBloqueio === st
                    ? "bg-orange-500 text-slate-950 border-orange-500"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2">
            {bloqueiosFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum registro de bloqueio encontrado.</p>
            ) : (
              bloqueiosFiltrados.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {b.chave} ({b.tipo}) — {b.falhasAcumuladas} falhas
                    </div>
                    <div className="text-slate-500">{b.motivo}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${b.ativo ? "text-rose-500" : "text-emerald-600"}`}>
                      {b.ativo ? "Bloqueado" : "Expirado/Liberado"}
                    </span>
                    {b.ativo && !isSomenteLeitura && (
                      <button
                        onClick={() => handleDesbloquear(b.id, b.chave)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Desbloquear</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MÓDULO 05: CADEIA DE CUSTÓDIA */}
      {moduloAtivo === "cadeia" && (
        <PainelCadeiaCustodiaLogs cadeiaInicial={cadeiaLogs} onAtualizar={setCadeiaLogs} />
      )}

      {/* MÓDULO 06: HONEYTOKENS */}
      {moduloAtivo === "honeytokens" && (
        <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-3">
          {honeytokens.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum honeytoken encontrado em honeytokens_deception.
            </p>
          ) : (
            honeytokens.map((h) => (
              <div
                key={h.id}
                className="p-4 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold">{h.nomeIsca}</div>
                  <div className="font-mono text-slate-500">
                    {h.identificador} ({h.tipoIsca})
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-orange-600">{h.tentativasAcesso} tentativa(s)</div>
                  <div className="text-[11px] text-slate-500">Ação: {h.acaoDefensiva}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MÓDULO 07: DISPOSITIVOS */}
      {moduloAtivo === "dispositivos" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["todos", "autorizado", "pendente"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFiltroStatusDisp(st)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold border cursor-pointer ${
                  filtroStatusDisp === st
                    ? "bg-orange-500 text-slate-950 border-orange-500"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2">
            {dispositivosFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum dispositivo registrado ainda.</p>
            ) : (
              dispositivosFiltrados.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {d.nomeDispositivo} — {d.usuarioNome || d.usuarioEmail || "Usuário"}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Fingerprint: {d.fingerprint} · Status: {d.status}
                    </div>
                  </div>
                  {!isSomenteLeitura && (
                    <div className="flex gap-2">
                      {d.status !== "autorizado" && (
                        <button
                          onClick={async () => {
                            if (await alterarStatusDispositivo(d.id, "autorizado")) {
                              toast.success("Dispositivo autorizado.");
                              setDispositivos(await obterDispositivosSeguranca());
                            }
                          }}
                          className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-700 font-bold cursor-pointer"
                        >
                          Autorizar
                        </button>
                      )}
                      {d.status !== "revogado" && (
                        <button
                          onClick={async () => {
                            if (await alterarStatusDispositivo(d.id, "revogado")) {
                              toast.success("Dispositivo revogado.");
                              setDispositivos(await obterDispositivosSeguranca());
                            }
                          }}
                          className="px-3 py-1 rounded-xl bg-rose-500/15 text-rose-600 font-bold cursor-pointer"
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MÓDULO 08: ATUALIZAÇÃO EM MASSA */}
      {moduloAtivo === "atualizacao_massa" && (
        <PainelAtualizacaoMassa
          historico={sinaisVersao}
          somenteLeitura={isSomenteLeitura}
          onRecarregar={async () => setSinaisVersao(await obterHistoricoSinaisVersao())}
        />
      )}

      {/* MÓDULO 09: DLP (APENAS BLUR + ANTI-PRINT, SEM MARCA D'ÁGUA) */}
      {moduloAtivo === "dlp" && (
        <div className="p-6 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-orange-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Proteção de Tela e Anti-Exfiltração (DLP)
              </h3>
              <p className="text-xs text-slate-500">
                Ofuscamento por perda de foco e bloqueio de impressão direta (sem marca d'água em
                tela)
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between p-4 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-bold cursor-pointer">
            <span>Ofuscamento automático (Blur) ao perder foco da janela</span>
            <input
              type="checkbox"
              disabled={isSomenteLeitura}
              checked={dlpConfig.blurPerdaFocoAtivo}
              onChange={(e) => setDlpConfig({ ...dlpConfig, blurPerdaFocoAtivo: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs font-bold cursor-pointer">
            <span>Bloqueio preventivo de impressão direta do navegador (@media print)</span>
            <input
              type="checkbox"
              disabled={isSomenteLeitura}
              checked={dlpConfig.bloqueioPrintAtivo}
              onChange={(e) => setDlpConfig({ ...dlpConfig, bloqueioPrintAtivo: e.target.checked })}
            />
          </label>

          {!isSomenteLeitura && (
            <button
              onClick={handleSalvarDlp}
              className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 cursor-pointer"
            >
              Salvar Diretrizes DLP
            </button>
          )}
        </div>
      )}

      {/* MÓDULO 10: GOVERNANÇA */}
      {moduloAtivo === "governanca" && (
        <PainelGovernancaSeguranca onEmitirLaudo={gerarLaudoForensePdf} />
      )}

      {/* MÓDULO 12: FIM REAL */}
      {moduloAtivo === "fim" && (
        <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2.5">
          {componentesFim.length === 0 ? (
            <p className="text-xs text-slate-500">
              Sem dados de integridade FIM disponíveis neste ciclo.
            </p>
          ) : (
            componentesFim.map((f, idx) => (
              <div
                key={`${f.componente}-${idx}`}
                className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-mono font-bold">{f.componente}</div>
                  <div className="text-[11px] text-slate-500">
                    {f.tipo} · {f.descricao}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`font-bold ${
                      f.status === "Íntegro" ? "text-emerald-600" : "text-amber-500"
                    }`}
                  >
                    {f.status}
                  </span>
                  <div className="font-mono text-[10px] text-slate-500">{f.checksum}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MÓDULO 13: LGPD */}
      {moduloAtivo === "lgpd" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["todos", "pendente", "atendido", "rejeitado"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFiltroStatusLgpd(st)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold border cursor-pointer ${
                  filtroStatusLgpd === st
                    ? "bg-orange-500 text-slate-950 border-orange-500"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800"
                }`}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2.5">
            {lgpdSolicitacoesFiltradas.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma solicitação LGPD registrada.</p>
            ) : (
              lgpdSolicitacoesFiltradas.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {item.protocolo} — {item.titularNome} ({item.tipoSolicitacao})
                    </div>
                    <div className="text-slate-500">
                      {item.titularEmail} · Status: {item.status}
                    </div>
                  </div>
                  {item.status === "pendente" && !isSomenteLeitura && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTratarLgpd(item.id, "atendido")}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 font-bold cursor-pointer"
                      >
                        Atender
                      </button>
                      <button
                        onClick={() => handleTratarLgpd(item.id, "rejeitado")}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 font-bold cursor-pointer"
                      >
                        Indeferir
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MÓDULO 14: LOG DE AÇÕES ADMINISTRATIVAS */}
      {moduloAtivo === "audit_admin" && <PainelAuditAdmin logs={adminAuditLogs} />}

      {/* MÓDULO 15: LOG DO SISTEMA */}
      {moduloAtivo === "logs" && (
        <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setTipoLog("login")}
                className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer ${
                  tipoLog === "login"
                    ? "bg-orange-500 text-slate-950"
                    : "bg-white/70 dark:bg-slate-800"
                }`}
              >
                Acessos e Logins ({logsLogin.length})
              </button>
              <button
                onClick={() => setTipoLog("atividade")}
                className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer ${
                  tipoLog === "atividade"
                    ? "bg-orange-500 text-slate-950"
                    : "bg-white/70 dark:bg-slate-800"
                }`}
              >
                Atividades Operacionais ({logsAtividade.length})
              </button>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={filtroLog}
                onChange={(e) => setFiltroLog(e.target.value)}
                placeholder="Filtrar logs..."
                className="pl-8 pr-3 py-2 rounded-2xl text-xs bg-white/80 dark:bg-slate-950 border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(tipoLog === "login" ? logsLogin : logsAtividade)
              .filter((l) => JSON.stringify(l).toLowerCase().includes(filtroLog.toLowerCase()))
              .map((l) => (
                <div
                  key={l.id}
                  className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap justify-between gap-2"
                >
                  <div>
                    <div className="font-bold">
                      {tipoLog === "login" ? `${l.email || "—"} (${l.status})` : l.acao}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tipoLog === "login"
                        ? `${l.role || "—"} · ${l.ip_address || "IP registrado"}`
                        : l.detalhe}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* MÓDULO 16: MÉTRICAS DE SEGURANÇA */}
      {moduloAtivo === "metricas" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: "Total de Logins", valor: metricasExec.totalLogins, target: "logs" as const },
            {
              label: "Taxa de Sucesso",
              valor: metricasExec.taxaSucessoLogins,
              target: "anomalias" as const,
            },
            {
              label: "Conformidade RLS",
              valor: `${metricasExec.conformidadeRlsPercentual}%`,
              target: "auditoria" as const,
            },
            {
              label: "Bloqueios Ativos",
              valor: metricasExec.bloqueiosAtivos,
              target: "lockout" as const,
            },
            {
              label: "Cadeia SHA-256",
              valor: metricasExec.cadeiaLogsTotal,
              target: "cadeia" as const,
            },
            {
              label: "Honeytokens Ativos",
              valor: metricasExec.honeytokensAtivos,
              target: "honeytokens" as const,
            },
            {
              label: "Documentos SHA-256",
              valor: metricasExec.documentosEmitidosTotal,
              target: "verificacao_lote" as const,
            },
            {
              label: "Audit Admin",
              valor: metricasExec.adminAuditTotal,
              target: "audit_admin" as const,
            },
            {
              label: "LGPD Pendentes",
              valor: metricasExec.solicitacoesLgpdPendentes,
              target: "lgpd" as const,
            },
            {
              label: "Cadastros Bloqueados (7d)",
              valor: metricasExec.cadastrosSuspeitos7d,
              target: "anti_abuso" as const,
            },
            {
              label: "Dispositivos Autorizados",
              valor: metricasExec.dispositivosAutorizados,
              target: "dispositivos" as const,
            },
            {
              label: "Dispositivos Pendentes",
              valor: metricasExec.dispositivosPendentes,
              target: "dispositivos" as const,
            },
          ].map((k) => (
            <button
              key={k.label}
              onClick={() => setModuloAtivo(k.target)}
              className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
            >
              <div className="text-[11px] font-bold uppercase text-slate-500">{k.label}</div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-slate-100">
                {k.valor}
              </div>
              <div className="text-[11px] text-orange-600 dark:text-orange-400 mt-1">
                Ver detalhes →
              </div>
            </button>
          ))}
        </div>
      )}

      {/* MÓDULO 17: ANTI-ABUSO DE CADASTROS */}
      {moduloAtivo === "anti_abuso" && <PainelMonitoramentoCadastros eventos={eventosAntiAbuso} />}

      {/* MÓDULO 21: VERIFICAÇÃO EM LOTE */}
      {moduloAtivo === "verificacao_lote" && (
        <PainelVerificacaoLote
          resultadoInicial={verificacaoLote}
          onAtualizar={setVerificacaoLote}
          onEmitirLaudo={gerarLaudoForensePdf}
        />
      )}
    </div>
  );
}
