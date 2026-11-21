import { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  Send,
  Trash2,
  Car,
  ChevronDown,
  TrendingUp,
  Percent,
  Edit3,
  Users,
  History,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarPropostas,
  atualizarStatusProposta,
  excluirProposta,
  calcularMetricasPropostas,
  formatarMensagemWhatsAppProposta,
  enviarPropostaViaWhatsapp,
} from "../services/propostaService";
import { emitirPropostaComercialPdf } from "../services/propostaPdfService";
import { ModalNovaProposta } from "./ModalNovaProposta";
import type { PropostaComercial, StatusProposta } from "../types/proposta";
import { useAuth } from "@/features/auth/context/AuthContext";

export function PropostasTab() {
  const { session } = useAuth();
  const [propostas, setPropostas] = useState<PropostaComercial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [modalNovaAberta, setModalNovaAberta] = useState(false);
  const [propostaParaEditar, setPropostaParaEditar] = useState<PropostaComercial | null>(null);
  const [processandoAcaoId, setProcessandoAcaoId] = useState<string | null>(null);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      const filtro = session?.isVendedor
        ? { vendedorId: session.vendedorId }
        : session?.isRevendedor
          ? { revendedorId: session.revendedorId }
          : undefined;
      const lista = await listarPropostas(filtro);
      setPropostas(lista);
    } catch (err) {
      console.error("Erro ao carregar propostas:", err);
      toast.error("Erro ao carregar propostas comerciais.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [session?.isVendedor, session?.isRevendedor, session?.vendedorId, session?.revendedorId]);

  // Métricas de conversão e efetividade
  const metricas = useMemo(() => {
    return calcularMetricasPropostas(propostas);
  }, [propostas]);

  // Lista filtrada
  const propostasFiltradas = useMemo(() => {
    return propostas.filter((p) => {
      if (filtroStatus !== "todos" && p.status !== filtroStatus) {
        return false;
      }
      if (!busca.trim()) return true;

      const termo = busca.toLowerCase();
      const ehFrota = p.tipo_proposta === "frota";
      return (
        p.numero_proposta.toLowerCase().includes(termo) ||
        p.cliente_nome.toLowerCase().includes(termo) ||
        p.cliente_telefone.toLowerCase().includes(termo) ||
        (ehFrota && termo.includes("frota")) ||
        (p.veiculo_marca || "").toLowerCase().includes(termo) ||
        (p.veiculo_modelo || "").toLowerCase().includes(termo)
      );
    });
  }, [propostas, busca, filtroStatus]);

  const handleAlterarStatus = async (proposta: PropostaComercial, novoStatus: StatusProposta) => {
    try {
      setProcessandoAcaoId(proposta.id);
      const ok = await atualizarStatusProposta(proposta.id, novoStatus);
      if (ok) {
        setPropostas((prev) =>
          prev.map((item) => (item.id === proposta.id ? { ...item, status: novoStatus } : item)),
        );
        toast.success(`Status da proposta alterado para ${novoStatus.toUpperCase()}.`);
      } else {
        toast.error("Não foi possível atualizar o status da proposta.");
      }
    } catch {
      toast.error("Erro ao atualizar status da proposta.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const handleExcluir = async (proposta: PropostaComercial) => {
    if (
      !confirm(
        `Confirma a exclusão definitiva da proposta ${proposta.numero_proposta} de ${proposta.cliente_nome}?`,
      )
    ) {
      return;
    }

    try {
      setProcessandoAcaoId(proposta.id);
      const ok = await excluirProposta(proposta.id);
      if (ok) {
        setPropostas((prev) => prev.filter((p) => p.id !== proposta.id));
        toast.success("Proposta excluída com sucesso.");
      } else {
        toast.error("Falha ao excluir proposta.");
      }
    } catch {
      toast.error("Erro ao excluir proposta.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const handleEmitirPdf = async (proposta: PropostaComercial) => {
    try {
      setProcessandoAcaoId(proposta.id);
      toast.info(`Gerando PDF da proposta ${proposta.numero_proposta}...`);
      const emissorStr = session?.nome
        ? `${session.nome} (${(session.role || "Comercial").toUpperCase()})`
        : "Operador Autorizado";
      await emitirPropostaComercialPdf(proposta, emissorStr);
      toast.success("PDF emitido com sucesso.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar PDF da proposta.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const handleCopiarTextoProposta = async (proposta: PropostaComercial) => {
    try {
      const texto = formatarMensagemWhatsAppProposta(proposta);
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo da proposta copiado para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar o texto da proposta.");
    }
  };

  const handleEnviarWhatsApp = async (proposta: PropostaComercial) => {
    try {
      setProcessandoAcaoId(proposta.id);
      toast.info(`Despachando proposta ${proposta.numero_proposta} via WhatsApp...`);

      const emissorStr = session?.nome
        ? `${session.nome} (${(session.role || "Comercial").toUpperCase()})`
        : "Operador Autorizado";

      let pdfBase64: string | undefined;
      let pdfNome: string | undefined;
      try {
        const { gerarPropostaComercialPdfBase64 } = await import("../services/propostaPdfService");
        const resPdf = await gerarPropostaComercialPdfBase64(proposta, emissorStr);
        if (resPdf?.base64) {
          pdfBase64 = resPdf.base64;
          pdfNome = resPdf.nomeArquivo;
        }
      } catch (errPdf) {
        console.warn("Aviso ao gerar PDF para despacho WhatsApp:", errPdf);
      }

      const res = await enviarPropostaViaWhatsapp(
        proposta,
        undefined,
        emissorStr,
        pdfBase64,
        pdfNome,
      );
      if (res.sucesso) {
        toast.success(
          "Proposta com valor promocional enviada pelo WhatsApp e SuperADM notificado!",
        );
        setPropostas((prev) =>
          prev.map((p) => (p.id === proposta.id ? { ...p, status: "enviada" } : p)),
        );
      } else {
        toast.error(`Falha no envio via WhatsApp: ${res.mensagem || "Verifique o gateway"}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao despachar proposta pelo WhatsApp.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const formatMoeda = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s+/g, " ");

  const renderBadgeStatus = (status: StatusProposta) => {
    switch (status) {
      case "aceita":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30">
            <CheckCircle2 className="h-3 w-3" /> Aceita / Contratada
          </span>
        );
      case "enviada":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
            <Send className="h-3 w-3" /> Enviada ao Cliente
          </span>
        );
      case "recusada":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
            <XCircle className="h-3 w-3" /> Recusada
          </span>
        );
      case "expirada":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-400 border border-slate-500/30">
            <AlertCircle className="h-3 w-3" /> Expirada
          </span>
        );
      case "pendente":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            <Clock className="h-3 w-3" /> Pendente / Em Negociação
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-fade-in select-none">
      {/* ─── BARRA DE TOPO: AÇÕES E FILTROS ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Propostas Comerciais e Efetividade</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                {propostas.length}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Gerencie propostas comparativas, acompanhe taxa de conversão e emita apresentações
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={carregarDados}
            disabled={carregando}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 transition shadow-xs"
            title="Recarregar propostas"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setModalNovaAberta(true)}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition shadow-md shadow-orange-600/20 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>Montar Proposta</span>
          </button>
        </div>
      </div>

      {/* ─── CARDS DE MÉTRICAS DE EFETIVIDADE (KPIS) ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total */}
        <div className="p-4 rounded-3xl bg-white/70 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Emitidas
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {metricas.total}
            </span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Taxa de Conversão */}
        <div className="p-4 rounded-3xl bg-orange-500/10 border border-orange-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Efetividade
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-orange-700 dark:text-orange-300">
              {metricas.taxaConversao.toFixed(1)}%
            </span>
            <Percent className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        {/* Pendentes */}
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Em Negociação
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-300">
              {metricas.pendentes}
            </span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Aceitas */}
        <div className="p-4 rounded-3xl bg-orange-500/10 border border-orange-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
            Fechadas / Aceitas
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-orange-700 dark:text-orange-300">
              {metricas.aceitas}
            </span>
            <CheckCircle2 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        {/* Recusadas / Expiradas */}
        <div className="col-span-2 lg:col-span-1 p-4 rounded-3xl bg-slate-500/10 border border-slate-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Recusadas / Expiradas
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-700 dark:text-slate-300">
              {metricas.recusadas + metricas.expiradas}
            </span>
            <XCircle className="h-4 w-4 text-slate-500" />
          </div>
        </div>
      </div>

      {/* ─── FILTROS DE PESQUISA ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, telefone, veículo ou número..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full text-xs pl-10 pr-4 py-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {(["todos", "pendente", "aceita", "recusada", "expirada"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition border ${
                filtroStatus === st
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs"
                  : "bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ─── LISTAGEM DE PROPOSTAS ──────────────────────────────────────── */}
      {carregando ? (
        <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-orange-600 dark:text-orange-400" />
          <span>Carregando propostas comerciais...</span>
        </div>
      ) : propostasFiltradas.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white/40 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3">
          <FileText className="h-10 w-10 text-slate-400 mx-auto stroke-1" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Nenhuma proposta encontrada
            </p>
            <p className="text-xs text-slate-500">
              {busca || filtroStatus !== "todos"
                ? "Tente ajustar os filtros ou o termo de busca pesquisado."
                : "Clique no botão 'Montar Proposta' acima para criar a primeira proposta comercial."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {propostasFiltradas.map((prop) => (
            <div
              key={prop.id}
              className="p-4 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3.5"
            >
              {/* Topo do Card: Número, Badges e Status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black tracking-wider text-slate-900 dark:text-slate-100 font-mono">
                      {prop.numero_proposta}
                    </span>
                    {prop.tipo_proposta === "frota" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                        <Users className="h-2.5 w-2.5" /> Frota
                      </span>
                    )}
                    {prop.historico_contrapropostas &&
                      prop.historico_contrapropostas.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                          title="Histórico de renegociação ativo"
                        >
                          <History className="h-2.5 w-2.5" />{" "}
                          {prop.historico_contrapropostas.length} rev.
                        </span>
                      )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(prop.created_at).toLocaleDateString("pt-BR")} às{" "}
                    {new Date(prop.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {renderBadgeStatus(prop.status)}
              </div>

              {/* Dados do Cliente e Veículo/Frota */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-1.5 text-xs">
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  {prop.cliente_nome}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                  {prop.cliente_telefone}
                </div>
                <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                  {prop.tipo_proposta === "frota" ? (
                    <>
                      <Users className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>Frota Corporativa · Tabela Escalonada (4 Faixas)</span>
                    </>
                  ) : (
                    <>
                      <Car className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                      <span>
                        {prop.veiculo_marca || "Veículo"} {prop.veiculo_modelo || ""} ·{" "}
                        {prop.veiculo_ano || "Ano n/i"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Comparativo de Planos */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Com Fidelidade */}
                <div className="p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase">
                      Com Fidelidade ({prop.com_fidelidade_meses}m)
                    </span>
                    {prop.aplicar_promocao !== false && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300">
                        Promo
                      </span>
                    )}
                  </div>
                  <span className="inline-block text-[9px] font-semibold text-orange-600 dark:text-orange-400">
                    Rastreador e Chip Inclusos
                  </span>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Inst.:{" "}
                    {prop.aplicar_promocao !== false && (
                      <span className="line-through text-slate-400 text-[10px] mr-1">
                        {formatMoeda(prop.com_fidelidade_instalacao_cheia || 380)}
                      </span>
                    )}
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      {formatMoeda(prop.com_fidelidade_instalacao)}
                    </span>
                  </div>
                  <div className="text-xs font-black text-orange-700 dark:text-orange-300">
                    {prop.aplicar_promocao !== false && (
                      <span className="line-through text-slate-400 font-normal text-[10px] mr-1">
                        {formatMoeda(prop.com_fidelidade_mensalidade_cheia || 120)}
                      </span>
                    )}
                    {formatMoeda(prop.com_fidelidade_mensalidade)}{" "}
                    <span className="text-[10px] font-normal">/mês</span>
                  </div>
                </div>

                {/* Sem Fidelidade */}
                <div className="p-2.5 rounded-xl bg-slate-500/5 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                      Sem Fidelidade
                    </span>
                    {prop.aplicar_promocao !== false && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-600 dark:text-slate-400">
                        Promo
                      </span>
                    )}
                  </div>
                  <span className="inline-block text-[9px] font-semibold text-slate-500">
                    Rastreador e Chip Inclusos
                  </span>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Inst.:{" "}
                    {prop.aplicar_promocao !== false && (
                      <span className="line-through text-slate-400 text-[10px] mr-1">
                        {formatMoeda(prop.sem_fidelidade_instalacao_cheia || 420)}
                      </span>
                    )}
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {formatMoeda(prop.sem_fidelidade_instalacao)}
                    </span>
                  </div>
                  <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                    {prop.aplicar_promocao !== false && (
                      <span className="line-through text-slate-400 font-normal text-[10px] mr-1">
                        {formatMoeda(prop.sem_fidelidade_mensalidade_cheia || 160)}
                      </span>
                    )}
                    {formatMoeda(prop.sem_fidelidade_mensalidade)}{" "}
                    <span className="text-[10px] font-normal">/mês</span>
                  </div>
                </div>
              </div>

              {/* Seletor Rápido de Status */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Status:</span>
                <div className="flex items-center gap-1">
                  {(["pendente", "aceita", "recusada", "expirada"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleAlterarStatus(prop, st)}
                      disabled={processandoAcaoId === prop.id || prop.status === st}
                      className={`text-[9px] px-2 py-0.5 rounded-md font-bold transition capitalize ${
                        prop.status === st
                          ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botões de Ação do Card */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleEnviarWhatsApp(prop)}
                    disabled={processandoAcaoId === prop.id}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1 shadow-2xs"
                    title="Enviar Proposta pelo WhatsApp do Cliente e notificar SuperADM"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    onClick={() => handleEmitirPdf(prop)}
                    disabled={processandoAcaoId === prop.id}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition flex items-center gap-1 shadow-2xs"
                    title="Baixar Proposta em PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>PDF</span>
                  </button>

                  <button
                    onClick={() => handleCopiarTextoProposta(prop)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition flex items-center gap-1 shadow-2xs"
                    title="Copiar Resumo da Proposta"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </button>

                  <button
                    onClick={() => {
                      setPropostaParaEditar(prop);
                      setModalNovaAberta(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition flex items-center gap-1 shadow-2xs"
                    title="Editar ou registrar Contraproposta"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Contraproposta</span>
                  </button>
                </div>

                <button
                  onClick={() => handleExcluir(prop)}
                  disabled={processandoAcaoId === prop.id}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Excluir Proposta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Proposta */}
      {modalNovaAberta && (
        <ModalNovaProposta
          onFechar={() => {
            setModalNovaAberta(false);
            setPropostaParaEditar(null);
          }}
          propostaParaEditar={propostaParaEditar}
          onSucesso={(salva) => {
            if (propostaParaEditar) {
              setPropostas((prev) => prev.map((item) => (item.id === salva.id ? salva : item)));
            } else {
              setPropostas((prev) => [salva, ...prev]);
            }
            setModalNovaAberta(false);
            setPropostaParaEditar(null);
          }}
        />
      )}
    </div>
  );
}
