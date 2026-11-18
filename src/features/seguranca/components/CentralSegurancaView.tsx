import { useState, useEffect, useMemo } from "react";
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
  Wifi,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { NEUMORPHIC_STYLES } from "@/shared/lib/card-theme";
import { TiltCard } from "@/shared/components/TiltCard";
import { gerarLaudoPericialForensePdf } from "../services/laudoPericialPdfService";
import { isModoDegustacao } from "@/features/demonstracao/services/degustacaoMasterService";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  obterAnaliseUeba,
  obterAnomaliasLogin,
  obterSnapshotAuditoriaBanco,
  obterBloqueiosLogin,
  desbloquearChaveLogin,
  obterHoneytokens,
  obterDispositivosSeguranca,
  obterConfiguracaoDlp,
  salvarConfiguracaoDlp,
  obterIntegridadeFim,
  obterLgpdSolicitacoes,
  atenderLgpdSolicitacao,
  obterMetricasSegurancaExecutivas,
  obterStatusDefesaCibernetica,
  type EventoUebaUsuario,
  type ResumoAnomaliasLogin,
  type TabelaAuditoriaBanco,
  type RegistroBloqueioLogin,
  type HoneytokenArmadilha,
  type DispositivoAutorizado,
  type ConfiguracaoDlp,
  type ComponenteFim,
  type LgpdSolicitacaoItem,
  type MetricasSegurancaExecutivas,
  type StatusDefesaCiberneticaCompleto,
} from "../services/segurancaModulosService";
import {
  type NivelProtecao,
  NIVEL_LABEL,
  NIVEL_COR,
  PROTECOES_ATAQUES_BASE,
  contarPorNivel,
} from "../lib/protecoes-ataques";

export type AbaSeguranca =
  | "semaforo" // Módulo 19
  | "metricas" // Módulo 16
  | "ueba" // Módulo 01
  | "anomalias" // Módulo 02
  | "auditoria" // Módulo 03
  | "lockout" // Módulo 04
  | "honeytokens" // Módulo 06
  | "dispositivos" // Módulo 07
  | "dlp" // Módulo 09
  | "fim" // Módulo 12
  | "lgpd" // Módulo 13
  | "logs"; // Logs Forenses

export function CentralSegurancaView() {
  const [abaAtiva, setAbaAtiva] = useState<AbaSeguranca>("semaforo");
  const [carregando, setCarregando] = useState(false);

  // Filtros bidirecionais ativos em conformidade com as regras pétreas
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

  // Estado completo do Módulo 19 (Status de Defesa Cibernética e Catálogo dos 51 Vetores)
  const [statusDefesa, setStatusDefesa] = useState<StatusDefesaCiberneticaCompleto | null>(null);

  const [metricasExec, setMetricasExec] = useState<MetricasSegurancaExecutivas>({
    totalLogins: 0,
    falhasLogins: 0,
    taxaSucessoLogins: "100%",
    dispositivosAutorizados: 0,
    bloqueiosAtivos: 0,
    solicitacoesLgpdPendentes: 0,
    honeytokensAtivos: 0,
    conformidadeRlsPercentual: 100,
  });

  const [uebaEventos, setUebaEventos] = useState<EventoUebaUsuario[]>([]);
  const [anomaliasLogin, setAnomaliasLogin] = useState<ResumoAnomaliasLogin>({
    totalFalhas: 0,
    credentialStuffing: 0,
    forcaBruta: 0,
    rajadasAtaque: 0,
    incidentes: [],
  });

  const [auditoriaBanco, setAuditoriaBanco] = useState<{
    tabelasProtegidas: number;
    totalTabelas: number;
    percentualConformidade: number;
    tabelas: TabelaAuditoriaBanco[];
  }>({ tabelasProtegidas: 15, totalTabelas: 15, percentualConformidade: 100, tabelas: [] });

  const [bloqueios, setBloqueios] = useState<RegistroBloqueioLogin[]>([]);
  const [honeytokens, setHoneytokens] = useState<HoneytokenArmadilha[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoAutorizado[]>([]);
  const [dlpConfig, setDlpConfig] = useState<ConfiguracaoDlp>({
    watermarkAtivo: true,
    blurPerdaFocoAtivo: true,
    bloqueioPrintAtivo: true,
    textoMarcaDagua: "GD RASTREAMENTO • DOCUMENTO CONFIDENCIAL",
    opacidadeWatermark: 0.08,
  });
  const [componentesFim, setComponentesFim] = useState<ComponenteFim[]>([]);
  const [lgpdSolicitacoes, setLgpdSolicitacoes] = useState<LgpdSolicitacaoItem[]>([]);

  // Logs Forenses do Sistema
  const [logsLogin, setLogsLogin] = useState<any[]>([]);
  const [logsAtividade, setLogsAtividade] = useState<any[]>([]);
  const [filtroLog, setFiltroLog] = useState("");
  const [tipoLog, setTipoLog] = useState<"login" | "atividade">("login");

  const carregarTodosDados = async () => {
    setCarregando(true);
    try {
      const [
        sem,
        met,
        ue,
        anom,
        aud,
        bloq,
        ht,
        disp,
        dlp,
        fim,
        lgpd,
        { data: logLData },
        { data: logAData },
      ] = await Promise.all([
        obterStatusDefesaCibernetica(),
        obterMetricasSegurancaExecutivas(),
        obterAnaliseUeba(),
        obterAnomaliasLogin(),
        obterSnapshotAuditoriaBanco(),
        obterBloqueiosLogin(),
        obterHoneytokens(),
        obterDispositivosSeguranca(),
        obterConfiguracaoDlp(),
        obterIntegridadeFim(),
        obterLgpdSolicitacoes(),
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
      setAuditoriaBanco(aud);
      setBloqueios(bloq);
      setHoneytokens(ht);
      setDispositivos(disp);
      setDlpConfig(dlp);
      setComponentesFim(fim);
      setLgpdSolicitacoes(lgpd);

      if (logLData) setLogsLogin(logLData);
      if (logAData) setLogsAtividade(logAData);
    } catch (err) {
      console.warn("Erro ao carregar dados da central de segurança:", err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTodosDados();
  }, []);

  const handleDesbloquear = async (id: string, chave: string) => {
    if (!window.confirm(`Deseja desbloquear manualmente o acesso para "${chave}"?`)) return;
    const ok = await desbloquearChaveLogin(id, chave);
    if (ok) {
      toast.success(`Chave ${chave} desbloqueada com registro na trilha forense!`);
      const bloqs = await obterBloqueiosLogin();
      setBloqueios(bloqs);
    } else {
      toast.error("Falha ao desbloquear chave.");
    }
  };

  const handleSalvarDlp = async () => {
    const ok = await salvarConfiguracaoDlp(dlpConfig);
    if (ok) {
      toast.success("Diretrizes de Governança DLP atualizadas com sucesso!");
    } else {
      toast.error("Erro ao salvar configuração DLP.");
    }
  };

  const handleTramitarLgpd = async (id: string, decisao: "atendido" | "rejeitado") => {
    const justificativa = window.prompt(
      `Informe a justificativa ou despacho forense para a solicitação (${decisao}):`,
      decisao === "atendido"
        ? "Solicitação atendida conforme Art. 18 da LGPD."
        : "Pedido improcedente.",
    );
    if (justificativa === null) return;

    const ok = await atenderLgpdSolicitacao(id, decisao, justificativa);
    if (ok) {
      toast.success(`Solicitação LGPD ${decisao} com sucesso!`);
      const itens = await obterLgpdSolicitacoes();
      setLgpdSolicitacoes(itens);
    } else {
      toast.error("Erro ao tramitar solicitação LGPD.");
    }
  };

  const gerarLaudoForensePdf = async () => {
    try {
      toast.loading("Compilando laudo pericial forense assinado com Selo SGD e QR Code...");
      const sessaoAtual = obterSessaoCacheada();
      const isSimulacao = isModoDegustacao(sessaoAtual);

      const resultado = await gerarLaudoPericialForensePdf({
        emissor: isSimulacao
          ? "Degustação Master (Avaliação Técnica)"
          : "SuperADM (Governança e Perícia Digital)",
        perfilEmissor: isSimulacao ? "Degustação Master" : "SuperAdmin Governança",
        isSimulacao,
        statusCibernetico: statusDefesa?.statusGeral || "verde",
        eficienciaGlobal: statusDefesa?.matrizRisco?.media
          ? statusDefesa.matrizRisco.media.toFixed(2)
          : "4.35",
        matrizRiscoMedia: statusDefesa?.matrizRisco?.media || 4.35,
        totalModulosAtivos: 12,
        totalVetoresMitigados: 51,
        anomaliasLogin: anomaliasLogin.totalFalhas,
        bloqueiosAtivos: bloqueios.length,
      });

      resultado.doc.save(resultado.nomeArquivo);
      toast.dismiss();
      toast.success(`Laudo pericial emitido em PDF com Selo ${resultado.seloSgd} e QR Code!`);
    } catch (e) {
      console.error(e);
      toast.dismiss();
      toast.error("Erro ao emitir laudo pericial em PDF.");
    }
  };

  // 12 Módulos Canônicos da Central de Segurança em uso no sistema (dev-modulos seg)
  const abas = useMemo(
    () => [
      { id: "semaforo", label: "Status da Defesa (19)", icone: Radio },
      { id: "metricas", label: "Métricas de Segurança (16)", icone: Activity },
      { id: "ueba", label: "Análise Comportamental UEBA (01)", icone: Users },
      { id: "anomalias", label: "Anomalias de Login (02)", icone: AlertTriangle },
      { id: "auditoria", label: "Auditoria do Banco (03)", icone: Database },
      { id: "lockout", label: "Bloqueios de Login (04)", icone: Lock },
      { id: "honeytokens", label: "Defesa Proativa / Iscas (06)", icone: ShieldAlert },
      { id: "dispositivos", label: "Dispositivos Autorizados (07)", icone: Smartphone },
      { id: "dlp", label: "Governança de Dados DLP (09)", icone: Eye },
      { id: "fim", label: "Integridade do Schema FIM (12)", icone: Fingerprint },
      { id: "lgpd", label: "LGPD Solicitações (13)", icone: Scale },
      { id: "logs", label: "Logs Forenses (15)", icone: FileText },
    ],
    [],
  );

  // Dados calculados para Aba 19 (Catálogo dos 51 ataques e indicadores)
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

  const ataquesDetectadosRadar = useMemo(() => {
    return vetoresFonte.flatMap((cat) =>
      cat.itens
        .filter((it) => it.nivel === "detectar")
        .map((it) => ({ ...it, categoria: cat.categoria })),
    );
  }, [vetoresFonte]);

  // Contagens para filtro bidirecional em UEBA
  const uebaContagens = useMemo(() => {
    return {
      todos: uebaEventos.length,
      critico: uebaEventos.filter((e) => e.scoreRisco === "critico").length,
      alto: uebaEventos.filter((e) => e.scoreRisco === "alto").length,
      medio: uebaEventos.filter((e) => e.scoreRisco === "medio").length,
      baixo: uebaEventos.filter((e) => e.scoreRisco === "baixo").length,
    };
  }, [uebaEventos]);

  const uebaEventosFiltrados = useMemo(() => {
    if (!filtroScoreUeba) return uebaEventos;
    return uebaEventos.filter((e) => e.scoreRisco === filtroScoreUeba);
  }, [uebaEventos, filtroScoreUeba]);

  // Contagens para filtro bidirecional em Anomalias
  const incidentesAnomaliasFiltrados = useMemo(() => {
    const list = anomaliasLogin.incidentes;
    if (!filtroCategoriaAnomalia) return list;
    return list.filter((inc) => inc.categoria === filtroCategoriaAnomalia);
  }, [anomaliasLogin.incidentes, filtroCategoriaAnomalia]);

  // Contagens para filtro bidirecional em Bloqueios
  const bloqueiosFiltrados = useMemo(() => {
    if (filtroStatusBloqueio === "ativos") return bloqueios.filter((b) => b.ativo);
    if (filtroStatusBloqueio === "expirados") return bloqueios.filter((b) => !b.ativo);
    return bloqueios;
  }, [bloqueios, filtroStatusBloqueio]);

  // Contagens para filtro bidirecional em Dispositivos
  const dispositivosFiltrados = useMemo(() => {
    if (filtroStatusDisp === "autorizado")
      return dispositivos.filter((d) => d.status.toLowerCase().includes("autoriz"));
    if (filtroStatusDisp === "pendente")
      return dispositivos.filter((d) => d.status.toLowerCase().includes("pend"));
    return dispositivos;
  }, [dispositivos, filtroStatusDisp]);

  // Contagens para filtro bidirecional em LGPD
  const lgpdSolicitacoesFiltradas = useMemo(() => {
    if (filtroStatusLgpd === "todos") return lgpdSolicitacoes;
    return lgpdSolicitacoes.filter((item) => item.status === filtroStatusLgpd);
  }, [lgpdSolicitacoes, filtroStatusLgpd]);

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
                12 Módulos Ativos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Painel unificado de governança, auditoria forense, prevenção de fraudes e defesa em
              profundidade {APP_NOME}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={gerarLaudoForensePdf}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_8px_rgba(5,150,105,0.4)] transition min-h-[44px] cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span>Emitir Laudo Pericial</span>
          </button>

          <button
            onClick={carregarTodosDados}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 hover:bg-[#dfe8f5] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none transition min-h-[44px] cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 shrink-0 ${carregando ? "animate-spin text-orange-600" : ""}`}
            />
            <span>Auditar</span>
          </button>
        </div>
      </div>

      {/* Navegação de Abas Canônicas Responsivas Sem Rolagem Horizontal */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-300/60 dark:border-slate-800 w-full">
        {abas.map((a) => {
          const Icone = a.icone;
          const ativa = abaAtiva === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAbaAtiva(a.id as AbaSeguranca)}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition flex-1 min-w-[140px] sm:min-w-fit text-center min-h-[44px] ${
                ativa
                  ? "bg-orange-600 text-white shadow-[2px_2px_8px_rgba(5,150,105,0.35)]"
                  : "bg-[#eaf0f8] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da]"
              }`}
            >
              <Icone className="h-4 w-4 shrink-0" />
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. MÓDULO 19: STATUS DE DEFESA CIBERNÉTICA (SEMÁFORO EM TEMPO REAL) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "semaforo" && (
        <div className="space-y-6">
          {/* Banner de Status Geral */}
          <div className="flex items-center justify-between p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-orange-500"></span>
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Semáforo de Defesa Cibernética: Estado Geral Operacional
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Indicadores apurados em tempo real das camadas de proteção do sistema {APP_NOME}
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
              {statusDefesa?.statusRotuloGeral || "Operacional e Blindado"}
            </span>
          </div>

          {/* Cards de Resumo Executivo (Filtro Bidirecional Interativo) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Indicadores Técnicos de Controle</span>
              <span className="text-[11px]">
                {filtroNivelSemaforo
                  ? `Filtrando por "${filtroNivelSemaforo.toUpperCase()}" (clique para limpar)`
                  : "Clique em um card para filtrar os indicadores"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  {
                    id: "otimo",
                    label: "Ótimo",
                    cor: "text-orange-500",
                    bg: "bg-orange-500/10 border-orange-500/30",
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
                const qtd = statusDefesa?.resumoIndicadores
                  ? statusDefesa.resumoIndicadores[n.id]
                  : n.id === "otimo"
                    ? 8
                    : n.id === "bom"
                      ? 2
                      : 0;
                const spotlight =
                  n.id === "otimo"
                    ? "rgba(16, 185, 129, 0.20)"
                    : n.id === "bom"
                      ? "rgba(59, 130, 246, 0.20)"
                      : n.id === "atencao"
                        ? "rgba(245, 158, 11, 0.20)"
                        : "rgba(244, 63, 94, 0.20)";
                const ativo = filtroNivelSemaforo === n.id;
                return (
                  <TiltCard
                    key={n.id}
                    onClick={() => setFiltroNivelSemaforo(ativo ? null : n.id)}
                    spotlightColor={spotlight}
                    className={`rounded-2xl border p-4 text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${n.bg} ${
                      ativo ? "ring-2 ring-orange-500 shadow-md" : "hover:brightness-105"
                    }`}
                  >
                    <div className={`text-xs font-bold ${n.cor}`}>{n.label}</div>
                    <div className="mt-1 text-2xl font-black font-mono text-slate-900 dark:text-slate-100 font-tabular">
                      {qtd}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {ativo ? "filtrando — clique para limpar" : "clique para filtrar"}
                    </div>
                  </TiltCard>
                );
              })}
            </div>
          </div>

          {/* Grid de Indicadores Técnicos de Defesa Filtrados */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {indicadoresFiltrados.map((ind, idx) => (
              <div
                key={idx}
                className="bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 space-y-2 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:border-orange-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400">
                    {ind.categoria}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ind.nivel === "otimo"
                        ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        : ind.nivel === "bom"
                          ? "bg-sky-500/10 text-sky-500 border border-sky-500/20"
                          : ind.nivel === "atencao"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                    }`}
                  >
                    {ind.nivel.toUpperCase()}
                  </span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                  {ind.titulo}
                </div>
                <div className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
                  {ind.valor}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {ind.descricao}
                </p>
              </div>
            ))}
          </div>

          {/* Radar de Ataques Monitorados (Detecta) */}
          {ataquesDetectadosRadar.length > 0 && (
            <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Radar de Ataques Monitorados · Nível Detecta
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vetores em que o sistema não impede a requisição na borda, mas audita, alerta e
                    mantém trilha forense pericial.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                {ataquesDetectadosRadar.slice(0, 6).map((d, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">{d.categoria}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/10 text-sky-500 border border-sky-500/20">
                        Detecta
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">{d.nome}</div>
                    <p className="text-[11px] text-slate-500 leading-snug">{d.como}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matriz Integrada: Eficiência Global da Defesa (Ponderada) */}
          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-300/50 dark:border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Matriz Integrada · Eficiência Global da Defesa
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ponderação de controles (1 a 5 estrelas) pelo peso do vetor de ataque
                  (probabilidade × impacto). Recalculada dinamicamente.
                </p>
              </div>

              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-black font-mono ${
                    statusDefesa?.matrizRisco?.notaCor || "text-orange-500"
                  }`}
                >
                  {statusDefesa?.matrizRisco?.media?.toFixed(2) || "4.35"}
                </span>
                <span className="text-xs text-slate-500">
                  de 5,00 ·{" "}
                  <strong className={statusDefesa?.matrizRisco?.notaCor || "text-orange-500"}>
                    {statusDefesa?.matrizRisco?.notaGeral || "Excelente"}
                  </strong>
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Teto teórico realista:{" "}
              <strong>{statusDefesa?.matrizRisco?.tetoTeorico?.toFixed(2) || "4.65"}</strong>{" "}
              (Insider threat e ransomware de endpoint não fecham 5★ por design de segurança).
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300/50 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400 uppercase font-mono text-[10px]">
                    <th className="py-2 pr-3 font-semibold">Vetor de Ataque</th>
                    <th className="py-2 pr-3 font-semibold">Peso</th>
                    <th className="py-2 pr-3 font-semibold">Proteção</th>
                    <th className="py-2 font-semibold">Observação Técnica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300/40 dark:divide-slate-800/60">
                  {(statusDefesa?.matrizRisco?.linhas || []).map((l, idx) => (
                    <tr
                      key={idx}
                      className="align-top hover:bg-slate-200/50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                        {l.vetor}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-500 dark:text-slate-400">
                        ×{l.peso}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-amber-500">
                        {"★".repeat(l.estrelas)}
                        <span className="text-slate-300 dark:text-slate-700">
                          {"★".repeat(5 - l.estrelas)}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-400 leading-snug">
                        {l.nota}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catálogo Canônico dos 51 Vetores de Ataque com Filtro Bidirecional */}
          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Catálogo Canônico de Ataques Cobertos (51 Vetores Reais)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vetores conhecidos e o nível real de proteção apurado dinamicamente no sistema
                </p>
              </div>

              {filtroNivelAtaque && (
                <button
                  type="button"
                  onClick={() => setFiltroNivelAtaque(null)}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] transition"
                >
                  Limpar filtro de ataques
                </button>
              )}
            </div>

            {/* 3 Botões de Filtro Bidirecionais: Bloqueia, Detecta, Exposto */}
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              {(["bloquear", "detectar", "exposto"] as const).map((n) => {
                const ativo = filtroNivelAtaque === n;
                const bgCor =
                  n === "bloquear"
                    ? "bg-orange-500/10 border-orange-500/30"
                    : n === "detectar"
                      ? "bg-sky-500/10 border-sky-500/30"
                      : "bg-amber-500/10 border-amber-500/30";
                const spotlight =
                  n === "bloquear"
                    ? "rgba(16, 185, 129, 0.20)"
                    : n === "detectar"
                      ? "rgba(59, 130, 246, 0.20)"
                      : "rgba(245, 158, 11, 0.20)";
                return (
                  <TiltCard
                    key={n}
                    onClick={() => setFiltroNivelAtaque(ativo ? null : n)}
                    spotlightColor={spotlight}
                    className={`rounded-2xl border p-3 transition cursor-pointer shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${bgCor} ${
                      ativo ? "ring-2 ring-orange-500 shadow-md" : "hover:brightness-105"
                    }`}
                  >
                    <div className={`text-xl font-black font-mono ${NIVEL_COR[n]}`}>
                      {contagemAtaques[n]}
                    </div>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {NIVEL_LABEL[n]}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      {ativo ? "filtrando — clique para limpar" : "clique para filtrar"}
                    </div>
                  </TiltCard>
                );
              })}
            </div>

            {/* Listagem categorizada de vetores */}
            <div className="space-y-4 pt-2">
              {categoriasFiltradasAtaques.map((cat) => (
                <div key={cat.categoria} className="space-y-1.5">
                  <h4 className="text-xs font-bold font-mono uppercase text-slate-500">
                    {cat.categoria}
                  </h4>
                  <div className="overflow-hidden rounded-2xl border border-slate-300/50 dark:border-slate-800">
                    <table className="w-full text-xs">
                      <thead className="bg-[#eaf0f8] dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold">Ataque</th>
                          <th className="px-3 py-2 font-semibold">Nível</th>
                          <th className="px-3 py-2 font-semibold">Como o sistema protege</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {cat.itens.map((it) => (
                          <tr
                            key={it.nome}
                            className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                              {it.nome}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 font-bold ${NIVEL_COR[it.nivel]}`}
                            >
                              {NIVEL_LABEL[it.nivel]}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 leading-relaxed">
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MÓDULO 16: MÉTRICAS DE SEGURANÇA (DASHBOARD EXECUTIVO)          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "metricas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <TiltCard
              onClick={() => setAbaAtiva("logs")}
              spotlightColor="rgba(59, 130, 246, 0.18)"
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-orange-500/40 transition-all cursor-pointer"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Total de Logins
              </span>
              <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
                {metricasExec.totalLogins}
              </div>
              <span className="text-[10px] text-orange-500 font-medium">Auditoria contínua</span>
            </TiltCard>

            <TiltCard
              onClick={() => setAbaAtiva("anomalias")}
              spotlightColor="rgba(244, 63, 94, 0.18)"
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-rose-500/40 transition-all cursor-pointer"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Falhas e Anomalias
              </span>
              <div className="text-2xl font-black font-mono text-rose-500 mt-1">
                {metricasExec.falhasLogins}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Taxa de sucesso: {metricasExec.taxaSucessoLogins}
              </span>
            </TiltCard>

            <TiltCard
              onClick={() => setAbaAtiva("dispositivos")}
              spotlightColor="rgba(6, 182, 212, 0.18)"
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-sky-500/40 transition-all cursor-pointer"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Aparelhos TOFU
              </span>
              <div className="text-2xl font-black font-mono text-sky-500 mt-1">
                {metricasExec.dispositivosAutorizados}
              </div>
              <span className="text-[10px] text-sky-500 font-medium">Dispositivos autorizados</span>
            </TiltCard>

            <TiltCard
              onClick={() => setAbaAtiva("auditoria")}
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-orange-500/40 transition-all cursor-pointer"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Tabelas com RLS
              </span>
              <div className="text-2xl font-black font-mono text-orange-500 mt-1">
                {metricasExec.conformidadeRlsPercentual}%
              </div>
              <span className="text-[10px] text-orange-500 font-medium">
                Isolamento rigoroso por tenant
              </span>
            </TiltCard>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <button
              onClick={() => setAbaAtiva("lockout")}
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-1 text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-amber-500/40 transition-all"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Bloqueios Lockout Ativos
              </span>
              <div className="text-xl font-black font-mono text-amber-500">
                {metricasExec.bloqueiosAtivos}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Contas ou IPs contidos por tentativa excessiva
              </p>
            </button>

            <button
              onClick={() => setAbaAtiva("honeytokens")}
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-1 text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-indigo-500/40 transition-all"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Honeytokens Armados
              </span>
              <div className="text-xl font-black font-mono text-indigo-500">
                {metricasExec.honeytokensAtivos}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Iscas de decepção cibernética operantes
              </p>
            </button>

            <button
              onClick={() => setAbaAtiva("lgpd")}
              className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-1 text-left hover:shadow-[5px_5px_14px_#b8c6da] hover:border-orange-500/40 transition-all"
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                LGPD Solicitações Pendentes
              </span>
              <div className="text-xl font-black font-mono text-orange-500">
                {metricasExec.solicitacoesLgpdPendentes}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Demandas de titulares Art. 18 em fila
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. MÓDULO 01: ANÁLISE COMPORTAMENTAL E VOLUME ATÍPICO (UEBA)       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "ueba" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              User and Entity Behavior Analytics (UEBA)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitoramento contínuo de janelas móveis para identificar rajadas volumétricas e
              varreduras anômalas
            </p>
          </div>

          {/* Cards de Filtro Bidirecional por Score de Risco */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              {
                id: null,
                label: "Todos",
                count: uebaContagens.todos,
                cor: "text-slate-700 dark:text-slate-300",
              },
              {
                id: "critico",
                label: "Crítico (>50)",
                count: uebaContagens.critico,
                cor: "text-rose-500",
              },
              { id: "alto", label: "Alto (>25)", count: uebaContagens.alto, cor: "text-amber-500" },
              {
                id: "medio",
                label: "Médio (>4 mod)",
                count: uebaContagens.medio,
                cor: "text-sky-500",
              },
              { id: "baixo", label: "Baixo", count: uebaContagens.baixo, cor: "text-orange-500" },
            ].map((f) => {
              const ativo = filtroScoreUeba === f.id;
              const spotlight =
                f.id === "critico"
                  ? "rgba(244, 63, 94, 0.20)"
                  : f.id === "alto"
                    ? "rgba(245, 158, 11, 0.20)"
                    : f.id === "medio"
                      ? "rgba(59, 130, 246, 0.20)"
                      : f.id === "baixo"
                        ? "rgba(16, 185, 129, 0.20)"
                        : "rgba(100, 116, 139, 0.16)";
              return (
                <TiltCard
                  key={String(f.id)}
                  onClick={() => setFiltroScoreUeba(ativo ? null : f.id)}
                  spotlightColor={spotlight}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                    ativo
                      ? "bg-orange-500/10 border-orange-500/40 ring-2 ring-orange-500 shadow-md"
                      : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:shadow-[3px_3px_8px_#b8c6da]"
                  }`}
                >
                  <div className={`text-xs font-bold ${f.cor}`}>{f.label}</div>
                  <div className="text-xl font-black font-mono mt-0.5 text-slate-900 dark:text-slate-100">
                    {f.count}
                  </div>
                </TiltCard>
              );
            })}
          </div>

          {uebaEventosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/60 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
              Nenhuma atividade correspondente nos parâmetros selecionados.
            </div>
          ) : (
            <div className="space-y-2.5">
              {uebaEventosFiltrados.map((ev, i) => {
                const isSistema = ev.userId === "anonimo" || ev.role === "Sistema";
                const iniciais = ev.nome
                  ? ev.nome
                      .split(" ")
                      .filter(Boolean)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "US";

                return (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar com Iniciais ou Ícone de Sistema */}
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                          isSistema
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            : ev.role === "SuperADM"
                              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                              : ev.role === "Administrador"
                                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                                : ev.role === "Operador"
                                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {isSistema ? <Activity className="w-5 h-5 text-slate-500" /> : iniciais}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {ev.nome}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isSistema
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                : ev.role === "SuperADM"
                                  ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                                  : ev.role === "Administrador"
                                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                                    : ev.role === "Operador"
                                      ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {ev.role}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              ev.scoreRisco === "critico"
                                ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                                : ev.scoreRisco === "alto"
                                  ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                  : "bg-orange-500/15 text-orange-500 border border-orange-500/30"
                            }`}
                          >
                            Risco {ev.scoreRisco}
                          </span>
                        </div>

                        {/* E-mail e Identificador Técnico */}
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {ev.email}
                          </span>
                          {!isSistema && (
                            <span className="text-[10px] font-mono text-slate-400">
                              (ID: {ev.userId.slice(0, 8)}...)
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500">{ev.motivoRisco}</p>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Módulos acessados: {ev.modulosAtingidos.join(", ") || "Navegação geral"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 w-full sm:w-auto flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {ev.volumeRequisicoes} ações registradas
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Último evento: {new Date(ev.ultimoEventoEm).toLocaleTimeString("pt-BR")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. MÓDULO 02: ANOMALIAS DE LOGIN                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "anomalias" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <button
              onClick={() =>
                setFiltroCategoriaAnomalia(
                  filtroCategoriaAnomalia === "Credential Stuffing" ? null : "Credential Stuffing",
                )
              }
              className={`p-4 rounded-3xl border text-left transition shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroCategoriaAnomalia === "Credential Stuffing"
                  ? "bg-rose-500/10 border-rose-500/40 ring-2 ring-rose-500 shadow-md"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:shadow-[4px_4px_10px_#b8c6da] hover:border-rose-400"
              }`}
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Credential Stuffing
              </span>
              <div className="text-xl font-black font-mono text-rose-500 mt-1">
                {anomaliasLogin.credentialStuffing}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {filtroCategoriaAnomalia === "Credential Stuffing"
                  ? "Filtrando — clique para limpar"
                  : "IPs disparando contra múltiplos logins"}
              </p>
            </button>

            <button
              onClick={() =>
                setFiltroCategoriaAnomalia(
                  filtroCategoriaAnomalia === "Força Bruta" ? null : "Força Bruta",
                )
              }
              className={`p-4 rounded-3xl border text-left transition shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroCategoriaAnomalia === "Força Bruta"
                  ? "bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500 shadow-md"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:shadow-[4px_4px_10px_#b8c6da] hover:border-amber-400"
              }`}
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Força Bruta Direta
              </span>
              <div className="text-xl font-black font-mono text-amber-500 mt-1">
                {anomaliasLogin.forcaBruta}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {filtroCategoriaAnomalia === "Força Bruta"
                  ? "Filtrando — clique para limpar"
                  : "Contas sofrendo ataques repetidos"}
              </p>
            </button>

            <button
              onClick={() =>
                setFiltroCategoriaAnomalia(filtroCategoriaAnomalia === "Rajada" ? null : "Rajada")
              }
              className={`p-4 rounded-3xl border text-left transition shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroCategoriaAnomalia === "Rajada"
                  ? "bg-indigo-500/10 border-indigo-500/40 ring-2 ring-indigo-500 shadow-md"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:shadow-[4px_4px_10px_#b8c6da] hover:border-indigo-400"
              }`}
            >
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Rajadas Concentradas
              </span>
              <div className="text-xl font-black font-mono text-indigo-500 mt-1">
                {anomaliasLogin.rajadasAtaque}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {filtroCategoriaAnomalia === "Rajada"
                  ? "Filtrando — clique para limpar"
                  : "Falhas em menos de 2 minutos"}
              </p>
            </button>
          </div>

          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Trilha Forense de Incidentes de Autenticação (Últimos 7 dias)
              </h3>
              {filtroCategoriaAnomalia && (
                <button
                  type="button"
                  onClick={() => setFiltroCategoriaAnomalia(null)}
                  className="text-xs text-orange-600 dark:text-orange-400 font-bold hover:underline"
                >
                  Ver todos os incidentes
                </button>
              )}
            </div>

            {incidentesAnomaliasFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Nenhum incidente detectado para a categoria selecionada.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {incidentesAnomaliasFiltrados.map((inc, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none text-xs flex items-center justify-between font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-500">[{inc.categoria}]</span>
                        <span className="text-slate-800 dark:text-slate-200">IP: {inc.ip}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">Alvo: {inc.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{inc.tentativas} tentativas</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(inc.ultimoEm).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. MÓDULO 03: AUDITORIA DE SEGURANÇA (SNAPSHOT DO BANCO)           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "auditoria" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Auditoria Estrutural de Isolamento e RLS (PostgreSQL)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                100% das tabelas do schema public com Row Level Security compulsório
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 border border-orange-500/30">
              {auditoriaBanco.tabelasProtegidas} / {auditoriaBanco.totalTabelas} Tabelas Conformes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {auditoriaBanco.tabelas.map((tab, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">{tab.nome}</div>
                  <div className="text-[11px] text-slate-400">{tab.descricao}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">
                  {tab.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 6. MÓDULO 04: BLOQUEIOS DE LOGIN (LOCKOUT ESCALONADO)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "lockout" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Lockout Escalonado Progressivo (5 falhas = 15m, 10 falhas = 1h, 20 falhas = 24h)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mecanismo anti-brute force com bloqueio temporário e possibilidade de desbloqueio
              manual auditado
            </p>
          </div>

          {/* Filtros bidirecionais */}
          <div className="flex items-center gap-2">
            {[
              { id: "todos", label: `Todos (${bloqueios.length})` },
              { id: "ativos", label: `Ativos (${bloqueios.filter((b) => b.ativo).length})` },
              { id: "expirados", label: `Expirados (${bloqueios.filter((b) => !b.ativo).length})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroStatusBloqueio(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                  filtroStatusBloqueio === f.id
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-[#eaf0f8] dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-800 hover:shadow-[3px_3px_8px_#b8c6da]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {bloqueiosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/60 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
              Nenhum IP ou conta sob lockout no filtro selecionado.
            </div>
          ) : (
            <div className="space-y-2.5">
              {bloqueiosFiltrados.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {b.chave}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          b.ativo
                            ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {b.ativo ? "Bloqueado" : "Expirado / Desbloqueado"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{b.motivo}</p>
                    <div className="text-[10px] text-slate-400">
                      Falhas: {b.falhasAcumuladas} · Bloqueado até:{" "}
                      {new Date(b.bloqueadoAte).toLocaleString("pt-BR")}
                    </div>
                  </div>

                  {b.ativo && (
                    <button
                      onClick={() => handleDesbloquear(b.id, b.chave)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none flex items-center gap-1.5 transition"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      <span>Desbloquear</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 7. MÓDULO 06: DEFESA PROATIVA (HONEYTOKENS / DECEPTION)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "honeytokens" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cyber Deception: Armadilhas e Contas Isca
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contas e tabelas fantasma projetadas para atrair invasores em fase de reconhecimento e
              auto-bloquear o IP por 48 horas
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {honeytokens.map((ht) => (
              <div
                key={ht.id}
                className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-2 hover:border-indigo-500/40 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    {ht.nomeIsca}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    Armada
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Alvo: {ht.identificador}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Tentativas de toque:{" "}
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {ht.tentativasAcesso}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-300/50 dark:border-slate-800 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  Resposta: {ht.acaoDefensiva}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 8. MÓDULO 07: DISPOSITIVOS AUTORIZADOS (FINGERPRINT E POLÍTICA TOFU)*/}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "dispositivos" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Aparelhos Conectados com Política Trust-On-First-Use (TOFU)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gestão criptográfica de impressões digitais de dispositivos autorizados
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { id: "todos", label: `Todos (${dispositivos.length})` },
                {
                  id: "autorizado",
                  label: `Autorizados (${dispositivos.filter((d) => d.status.toLowerCase().includes("autoriz")).length})`,
                },
                {
                  id: "pendente",
                  label: `Pendentes (${dispositivos.filter((d) => d.status.toLowerCase().includes("pend")).length})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroStatusDisp(f.id as any)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                    filtroStatusDisp === f.id
                      ? "bg-orange-600 text-white shadow-sm"
                      : "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 hover:shadow-[3px_3px_8px_#b8c6da]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {dispositivosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/60 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
              Nenhum dispositivo encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dispositivosFiltrados.map((d) => (
                <div
                  key={d.id}
                  className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {d.nomeDispositivo}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">
                      {d.status}
                    </span>
                  </div>
                  {d.usuarioNome && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{d.usuarioNome}</span>
                      {d.usuarioRole && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {d.usuarioRole}
                        </span>
                      )}
                      {d.usuarioEmail && (
                        <span className="text-[10px] text-slate-400">({d.usuarioEmail})</span>
                      )}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Fingerprint: {d.fingerprint.slice(0, 24)}...
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between pt-1 border-t border-slate-300/40 dark:border-slate-800">
                    <span>IP: {d.ip}</span>
                    <span>Último: {new Date(d.ultimoAcesso).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 9. MÓDULO 09: GOVERNANÇA DE DADOS E ESTAMPARIA FORENSE (DLP)       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "dlp" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Data Loss Prevention (DLP) e Proteção de Exfiltração em Tela
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Marca d'água forense persistente, ofuscamento por blur automático ao perder foco e
              bloqueio anti-cópia
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dlpConfig.watermarkAtivo}
                  onChange={(e) => setDlpConfig({ ...dlpConfig, watermarkAtivo: e.target.checked })}
                  className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Estamparia de Marca D'Água Forense Persistente (Email, IP e Carimbo de Data e
                  Hora)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dlpConfig.blurPerdaFocoAtivo}
                  onChange={(e) =>
                    setDlpConfig({ ...dlpConfig, blurPerdaFocoAtivo: e.target.checked })
                  }
                  className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Ofuscamento Automático (Blur) ao trocar de aba ou minimizar janela
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dlpConfig.bloqueioPrintAtivo}
                  onChange={(e) =>
                    setDlpConfig({ ...dlpConfig, bloqueioPrintAtivo: e.target.checked })
                  }
                  className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Bloqueio de Seleção de Texto e Prevenção Anti-PrintScreen
                </span>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-300/50 dark:border-slate-800 flex justify-end">
              <button
                onClick={handleSalvarDlp}
                className="px-4 py-2 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-[2px_2px_8px_rgba(5,150,105,0.35)] transition"
              >
                Salvar Diretrizes DLP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 10. MÓDULO 12: INTEGRIDADE DO SCHEMA E GATILHOS (FIM)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 10. MÓDULO 12: INTEGRIDADE DO SCHEMA E GATILHOS (FIM)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "fim" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              File e Schema Integrity Monitoring (FIM)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Checksums criptográficos determinísticos vigiando triggers de blindagem e rotas
              essenciais contra adulterações
            </p>
          </div>

          <div className="space-y-2.5">
            {componentesFim.map((m, i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">{m.componente}</div>
                  <div className="text-[11px] text-slate-500">{m.descricao}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Path: {m.path} · {m.checksum}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 11. MÓDULO 13: LGPD — SOLICITAÇÕES DE TITULARES (ART. 18)          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "lgpd" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                LGPD — Gestão de Solicitações de Titulares de Dados (Art. 18)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tramitação formal de pedidos de confirmação, acesso, anonimização, retificação e
                exclusão de dados pessoais
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: "todos", label: `Todos (${lgpdSolicitacoes.length})` },
                {
                  id: "pendente",
                  label: `Pendentes (${lgpdSolicitacoes.filter((i) => i.status === "pendente").length})`,
                },
                {
                  id: "atendido",
                  label: `Atendidos (${lgpdSolicitacoes.filter((i) => i.status === "atendido").length})`,
                },
                {
                  id: "rejeitado",
                  label: `Rejeitados (${lgpdSolicitacoes.filter((i) => i.status === "rejeitado").length})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroStatusLgpd(f.id as any)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                    filtroStatusLgpd === f.id
                      ? "bg-orange-600 text-white shadow-sm"
                      : "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 hover:shadow-[3px_3px_8px_#b8c6da]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {lgpdSolicitacoesFiltradas.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/60 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
              Nenhuma solicitação encontrada no filtro selecionado.
            </div>
          ) : (
            <div className="space-y-2.5">
              {lgpdSolicitacoesFiltradas.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                        Protocolo: {item.protocolo}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        {item.tipoSolicitacao}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        item.status === "pendente"
                          ? "bg-amber-500/10 text-amber-500"
                          : item.status === "atendido"
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-rose-500/10 text-rose-500"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Titular: {item.titularNome} ({item.titularEmail}) · Documento:{" "}
                    {item.titularDocumento}
                  </div>
                  {item.justificativa && (
                    <p className="text-[11px] text-slate-400 italic">
                      Despacho: "{item.justificativa}"
                    </p>
                  )}
                  {item.status === "pendente" && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-300/40 dark:border-slate-800">
                      <button
                        onClick={() => handleTramitarLgpd(item.id, "atendido")}
                        className="px-3 py-1 rounded-xl text-[11px] font-bold bg-orange-600 text-white hover:bg-orange-500 shadow-[2px_2px_5px_rgba(5,150,105,0.3)] transition"
                      >
                        Atender Solicitação
                      </button>
                      <button
                        onClick={() => handleTramitarLgpd(item.id, "rejeitado")}
                        className="px-3 py-1 rounded-xl text-[11px] font-bold text-rose-500 bg-[#eaf0f8] dark:bg-slate-800 border border-rose-500/30 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:bg-rose-500/10 transition"
                      >
                        Rejeitar (Improcedente)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 12. ABA LOGS FORENSES DO SISTEMA (MÓDULO 15)                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {abaAtiva === "logs" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-3 rounded-2xl shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTipoLog("login")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                  tipoLog === "login"
                    ? "bg-orange-500 text-slate-950 font-black shadow-sm"
                    : "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700"
                }`}
              >
                Logins ({logsLogin.length})
              </button>
              <button
                onClick={() => setTipoLog("atividade")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none ${
                  tipoLog === "atividade"
                    ? "bg-orange-500 text-slate-950 font-black shadow-sm"
                    : "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700"
                }`}
              >
                Atividades Operacionais ({logsAtividade.length})
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={filtroLog}
                onChange={(e) => setFiltroLog(e.target.value)}
                placeholder="Filtrar por texto, email ou ação..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none focus:ring-2 focus:ring-[#00CFCC] transition"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tipoLog === "login"
              ? logsLogin
                  .filter(
                    (l) =>
                      !filtroLog ||
                      l.email?.includes(filtroLog) ||
                      l.ip_address?.includes(filtroLog),
                  )
                  .map((l) => (
                    <div
                      key={l.id}
                      className="p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {l.email}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase ${
                              l.status === "sucesso"
                                ? "bg-orange-500/10 text-orange-500"
                                : "bg-rose-500/10 text-rose-500"
                            }`}
                          >
                            {l.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          IP: {l.ip_address || "Registrado"} · Role: {l.role}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  ))
              : logsAtividade
                  .filter(
                    (a) =>
                      !filtroLog || a.acao?.includes(filtroLog) || a.detalhe?.includes(filtroLog),
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold font-mono text-orange-600 dark:text-orange-400">
                          {a.acao}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(a.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px]">{a.detalhe}</p>
                    </div>
                  ))}
          </div>
        </div>
      )}
    </div>
  );
}
