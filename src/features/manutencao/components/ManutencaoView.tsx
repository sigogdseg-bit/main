import { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Calendar,
  Clock,
  Car,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  ArrowRight,
  ArrowLeft,
  Bell,
  Settings,
  RefreshCw,
  User,
  ShieldCheck,
  Check,
  ChevronRight,
  Loader2,
  Receipt,
  Download,
  Eye,
  Trash2,
  FileText,
  CreditCard,
  Banknote,
  QrCode,
  Building2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import type {
  PlanoManutencaoItem,
  AgendamentoManutencao,
  ClienteManutencaoResumo,
  VeiculoManutencaoResumo,
  HistoricoManutencaoGasto,
} from "../types";
import {
  carregarClientesParaManutencao,
  carregarVeiculosDoCliente,
  carregarItensManutencao,
  carregarAgendamentos,
  atualizarStatusAgendamento,
  concluirItemManutencao,
  inicializarItensPadraoVeiculo,
  listarHistoricoDespesasVeiculo,
  excluirHistoricoDespesaVeiculo,
} from "../services/manutencaoService";
import { downloadNF, gerarSignedUrl } from "@/features/motoristas/services/nfStorageService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { formatarKm } from "@/features/monitor-gps/utils/formatadoresViagem";
import { AgendamentoModal } from "./AgendamentoModal";
import { ItemManutencaoModal } from "./ItemManutencaoModal";
import { ModalLancamentoDespesaVeiculo } from "./ModalLancamentoDespesaVeiculo";
import { BloqueioPlanoMasterCard } from "./BloqueioPlanoMasterCard";
import { TiltCard } from "@/shared/components/TiltCard";

function formatarMetrica(valor: number, isHorimetro: boolean) {
  if (isHorimetro) {
    return `${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} h`;
  }
  return formatarKm(valor);
}

export function ManutencaoView() {
  const { session } = useAuth();

  // Verificação de permissão e plano: Clientes titulares, Funcionários e Motoristas operam na visão de frota
  const isCliente = Boolean(
    session?.isCliente ||
    session?.isFuncionario ||
    session?.role === "funcionario" ||
    session?.isMotorista ||
    session?.role === "motorista",
  );

  const isMasterOrAdmin = Boolean(
    session?.isSuperAdmin ||
    session?.isSuperAdminAuditor ||
    session?.isAuditor ||
    session?.role === "superadmin_auditor" ||
    session?.isAdmin ||
    session?.role === "operador" ||
    session?.plano === "master" ||
    session?.isTrialMaster ||
    (session?.modulos &&
      (session.modulos.includes("manutencao") ||
        session.modulos.includes("manutencao_preventiva"))),
  );

  // Estados de navegação em etapas: 1 = Clientes (gestor global), 2 = Veículos, 3 = Painel do Carro
  const [etapa, setEtapa] = useState<1 | 2 | 3>(isCliente ? 2 : 1);

  // Dados selecionados
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteManutencaoResumo | null>(
    null,
  );
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoManutencaoResumo | null>(
    null,
  );

  // Listas de dados
  const [clientes, setClientes] = useState<ClienteManutencaoResumo[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoManutencaoResumo[]>([]);
  const [itens, setItens] = useState<PlanoManutencaoItem[]>([]);
  const [agendamentos, setAgendamentos] = useState<AgendamentoManutencao[]>([]);

  // Estados de controle e UI
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"planos" | "agendamentos" | "historico">("planos");
  const [filtroStatusItem, setFiltroStatusItem] = useState<
    "todos" | "vencida" | "proxima" | "em_dia"
  >("todos");

  // Histórico de Gastos e Lançamento de Despesas
  const [historicoDespesas, setHistoricoDespesas] = useState<HistoricoManutencaoGasto[]>([]);
  const [modalDespesaAberto, setModalDespesaAberto] = useState(false);
  const [itemSelecionadoParaConcluir, setItemSelecionadoParaConcluir] =
    useState<PlanoManutencaoItem | null>(null);
  const [baixandoNfId, setBaixandoNfId] = useState<string | null>(null);

  // Modais
  const [modalAgendarAberto, setModalAgendarAberto] = useState(false);
  const [itemSelecionadoParaAgendar, setItemSelecionadoParaAgendar] =
    useState<PlanoManutencaoItem | null>(null);

  const [modalItemAberto, setModalItemAberto] = useState(false);
  const [itemParaEdicao, setItemParaEdicao] = useState<PlanoManutencaoItem | null>(null);

  // 1. Carga inicial de clientes (para operadores) ou veículos (para clientes)
  useEffect(() => {
    if (!isMasterOrAdmin) return;

    if (!isCliente) {
      // Administrador e Operador: carrega a lista de clientes
      carregarListaClientes();
    } else {
      // Cliente autenticado: carrega diretamente os veículos vinculados
      carregarListaVeiculosCliente();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCliente, isMasterOrAdmin, session?.clienteId]);

  const carregarListaClientes = async () => {
    setCarregando(true);
    try {
      const data = await carregarClientesParaManutencao();
      setClientes(data);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
      toast.error("Falha ao carregar lista de clientes.");
    } finally {
      setCarregando(false);
    }
  };

  const carregarListaVeiculosCliente = async (cliente?: ClienteManutencaoResumo) => {
    setCarregando(true);
    try {
      const clienteIdAlvo = cliente?.id || session?.clienteId;
      const data = await carregarVeiculosDoCliente(clienteIdAlvo);
      setVeiculos(data);

      // Se o cliente possuir apenas 1 veículo, já avança direto para o painel
      if (data.length === 1 && (!veiculoSelecionado || isCliente)) {
        const unico = data[0];
        setVeiculoSelecionado(unico);
        setEtapa(3);
        carregarDadosDoVeiculo(unico.id);
      } else {
        setEtapa(2);
      }
    } catch (err) {
      console.error("Erro ao carregar veículos:", err);
      toast.error("Falha ao carregar veículos do cliente.");
    } finally {
      setCarregando(false);
    }
  };

  const carregarDadosDoVeiculo = async (veiculoId: string) => {
    setCarregando(true);
    try {
      const [dadosItens, dadosAgendamentos, dadosHistorico] = await Promise.all([
        carregarItensManutencao(veiculoId),
        carregarAgendamentos(veiculoId),
        listarHistoricoDespesasVeiculo(veiculoId),
      ]);
      setItens(dadosItens);
      setAgendamentos(dadosAgendamentos);
      setHistoricoDespesas(dadosHistorico);
    } catch (err) {
      console.error("Erro ao carregar manutenções do veículo:", err);
      toast.error("Falha ao carregar dados de manutenção do veículo.");
    } finally {
      setCarregando(false);
    }
  };

  // Ações de seleção e navegação
  const handleSelecionarCliente = (cliente: ClienteManutencaoResumo) => {
    setClienteSelecionado(cliente);
    setVeiculoSelecionado(null);
    setBusca("");
    carregarListaVeiculosCliente(cliente);
  };

  const handleSelecionarVeiculo = (veiculo: VeiculoManutencaoResumo) => {
    setVeiculoSelecionado(veiculo);
    setBusca("");
    setEtapa(3);
    carregarDadosDoVeiculo(veiculo.id);
  };

  const handleVoltarParaClientes = () => {
    setClienteSelecionado(null);
    setVeiculoSelecionado(null);
    setItens([]);
    setAgendamentos([]);
    setHistoricoDespesas([]);
    setBusca("");
    setEtapa(1);
  };

  const handleVoltarParaVeiculos = () => {
    setVeiculoSelecionado(null);
    setItens([]);
    setAgendamentos([]);
    setHistoricoDespesas([]);
    setBusca("");
    setEtapa(2);
  };

  // Concluir revisão via Modal com Registro Financeiro e NF
  const handleConcluirRevisao = (item: PlanoManutencaoItem) => {
    setItemSelecionadoParaConcluir(item);
    setModalDespesaAberto(true);
  };

  // Download e visualização de NF para o Cliente ADM
  const handleBaixarNf = async (despesa: HistoricoManutencaoGasto) => {
    if (!despesa.comprovante_url) {
      toast.error("Nenhum comprovante anexado a este lançamento.");
      return;
    }
    setBaixandoNfId(despesa.id);
    try {
      await downloadNF(despesa.comprovante_url, despesa.id, "despesa");
      toast.success("Download da NF iniciado com sucesso!");
    } catch (err: any) {
      toast.error(`Falha no download da NF: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setBaixandoNfId(null);
    }
  };

  const handleVisualizarNf = async (path: string) => {
    try {
      const signedUrl = await gerarSignedUrl(path);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(`Não foi possível abrir o comprovante: ${err?.message || "Erro de rede"}`);
    }
  };

  const handleExcluirDespesa = async (despesaId: string) => {
    if (!window.confirm("Deseja realmente remover este lançamento financeiro do veículo?")) return;
    const res = await excluirHistoricoDespesaVeiculo(despesaId);
    if (res.success) {
      toast.success(res.message);
      if (veiculoSelecionado) carregarDadosDoVeiculo(veiculoSelecionado.id);
    } else {
      toast.error(res.message);
    }
  };

  const [enviandoWhatsId, setEnviandoWhatsId] = useState<string | null>(null);

  // Enviar alerta via notificação imediata inter-dispositivos e Web Push
  const handleNotificarClienteManutencao = async (item: PlanoManutencaoItem) => {
    const clienteNome = clienteSelecionado?.nome_razao_social || "Cliente";
    const placa = veiculoSelecionado?.placa || item.placa || "Veículo";
    const primeiroNome = clienteNome.split(" ")[0];
    const isVencida = item.status === "vencida";
    const titulo = isVencida
      ? `🚨 Manutenção Vencida — ${placa}`
      : `⚠️ Revisão Preventiva Próxima — ${placa}`;

    const mensagem = isVencida
      ? `Olá, ${primeiroNome}. A manutenção de ${item.item_manutencao} do veículo ${placa} atingiu o limite (${formatarKm(item.proximo_km_alvo)}). Agende sua revisão preventiva para manter o veículo em segurança.`
      : `Olá, ${primeiroNome}. A manutenção de ${item.item_manutencao} do veículo ${placa} está próxima (restam ${formatarKm(item.km_restante || 0)}). Entre em contato para agendar o serviço.`;

    try {
      setEnviandoWhatsId(item.id);
      toast.info(`Emitindo notificação imediata de revisão para ${primeiroNome}...`);
      const ok = await enviarNotificacaoViaBd({
        destinatarioClienteId: clienteSelecionado?.id || item.cliente_id || null,
        titulo,
        mensagem,
        tipo: "manutencao",
        url: "/manutencao",
        placa,
      });

      if (ok) {
        toast.success(`Notificação imediata enviada para ${primeiroNome} com sucesso!`);
      } else {
        toast.error(`Falha ao emitir notificação para ${primeiroNome}.`);
      }
    } catch (err: any) {
      toast.error(`Erro ao disparar via servidor: ${err?.message || "Erro de rede"}`);
    } finally {
      setEnviandoWhatsId(null);
    }
  };

  // Alterar status de agendamento
  const handleAlterarStatusAgendamento = async (
    id: string,
    novoStatus: AgendamentoManutencao["status"],
  ) => {
    const res = await atualizarStatusAgendamento(id, novoStatus);
    if (res.success) {
      toast.success(res.message);
      if (veiculoSelecionado) carregarDadosDoVeiculo(veiculoSelecionado.id);
    } else {
      toast.error(res.message);
    }
  };

  // Métricas do veículo selecionado
  const metricasVeiculo = useMemo(() => {
    const totalItens = itens.length;
    const vencidas = itens.filter((i) => i.status === "vencida").length;
    const proximas = itens.filter((i) => i.status === "proxima").length;
    const emDia = itens.filter((i) => i.status === "em_dia").length;
    const agendamentosPendentes = agendamentos.filter((a) => a.status === "solicitado").length;

    return { totalItens, vencidas, proximas, emDia, agendamentosPendentes };
  }, [itens, agendamentos]);

  // Filtros de busca
  const clientesFiltrados = useMemo(() => {
    if (!busca) return clientes;
    const termo = busca.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nome_razao_social.toLowerCase().includes(termo) ||
        (c.documento && c.documento.includes(termo)) ||
        (c.telefone && c.telefone.includes(termo)),
    );
  }, [clientes, busca]);

  const veiculosFiltrados = useMemo(() => {
    if (!busca) return veiculos;
    const termo = busca.toLowerCase();
    return veiculos.filter(
      (v) => v.placa.toLowerCase().includes(termo) || v.marca_modelo.toLowerCase().includes(termo),
    );
  }, [veiculos, busca]);

  const itensFiltrados = useMemo(() => {
    if (filtroStatusItem === "todos") return itens;
    return itens.filter((i) => i.status === filtroStatusItem);
  }, [itens, filtroStatusItem]);

  // Se o cliente não tiver o Plano Master
  if (!isMasterOrAdmin) {
    return <BloqueioPlanoMasterCard />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      {/* Cabeçalho Geral da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
            <Wrench className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              Manutenção Preventiva e Revisões
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Controle individual por odômetro, troca de óleo, pastilhas e avisos antecipados
            </p>
          </div>
        </div>

        {/* Trilha de Navegacao Tatica */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
          {!isCliente ? (
            <>
              <button
                onClick={handleVoltarParaClientes}
                className={`px-3 py-1.5 rounded-xl transition ${
                  etapa === 1
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none"
                    : "bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] text-slate-600 dark:text-slate-400"
                }`}
              >
                1. Clientes
              </button>

              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />

              <button
                onClick={() => {
                  if (etapa === 3) handleVoltarParaVeiculos();
                }}
                disabled={etapa === 1}
                className={`px-3 py-1.5 rounded-xl transition ${
                  etapa === 2
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none"
                    : etapa === 3
                      ? "bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] text-slate-700 dark:text-slate-200"
                      : "opacity-40 cursor-not-allowed text-slate-400"
                }`}
              >
                2. Veículos
              </button>

              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />

              <span
                className={`px-3 py-1.5 rounded-xl ${
                  etapa === 3
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none"
                    : "opacity-40 text-slate-400"
                }`}
              >
                3. Manutenções
              </span>
            </>
          ) : (
            <>
              {veiculos.length > 1 && (
                <>
                  <button
                    onClick={handleVoltarParaVeiculos}
                    className={`px-3 py-1.5 rounded-xl transition ${
                      etapa === 2
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none"
                        : "bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Meus Veículos ({veiculos.length})
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </>
              )}

              <span
                className={`px-3 py-1.5 rounded-xl ${
                  etapa === 3
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none"
                    : "opacity-40 text-slate-400"
                }`}
              >
                {veiculoSelecionado
                  ? `Revisões: ${veiculoSelecionado.placa}`
                  : "Revisões e Alertas"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ETAPA 1: SELEÇÃO DO CLIENTE (Operadores e Administradores)                 */}
      {/* ========================================================================= */}
      {etapa === 1 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Selecione o Cliente para Gerenciar a Frota
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Escolha o cliente para visualizar seus veículos e o plano preventivo
              </p>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente por nome, documento ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2 bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]"
              />
            </div>
          </div>

          {carregando ? (
            <div className="py-20 text-center text-xs text-slate-400">
              Carregando carteira de clientes...
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none">
              Nenhum cliente encontrado com os filtros informados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {clientesFiltrados.map((cliente) => (
                <TiltCard
                  key={cliente.id}
                  onClick={() => handleSelecionarCliente(cliente)}
                  spotlightColor="rgba(16, 185, 129, 0.16)"
                  className="group p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-lg hover:border-orange-500/50 dark:hover:border-orange-500/50 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                        Plano {cliente.plano}
                      </span>
                      <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                        {cliente.total_veiculos}{" "}
                        {cliente.total_veiculos === 1 ? "veículo" : "veículos"}
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 group-hover:text-orange-500 transition line-clamp-1">
                      {cliente.nome_razao_social}
                    </h3>

                    {cliente.documento && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        Doc: {cliente.documento}
                      </p>
                    )}
                    {cliente.telefone && (
                      <p className="text-xs text-slate-400 font-mono">Tel: {cliente.telefone}</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-300/40 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-500 group-hover:text-orange-500 transition">
                    <span>Selecionar Frota</span>
                    <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
                  </div>
                </TiltCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 2: SELEÇÃO DO VEÍCULO                                                */}
      {/* ========================================================================= */}
      {etapa === 2 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {!isCliente && (
                  <button
                    onClick={handleVoltarParaClientes}
                    className="p-2 rounded-xl text-slate-600 dark:text-slate-300 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition"
                    title="Voltar aos Clientes"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {clienteSelecionado
                    ? `Veículos de ${clienteSelecionado.nome_razao_social}`
                    : "Selecione o Veículo"}
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Escolha o carro para visualizar e configurar os planos de manutenção
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar veículos por placa ou modelo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2 bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]"
              />
            </div>
          </div>

          {carregando ? (
            <div className="py-20 text-center text-xs text-slate-400">
              Carregando veículos e odômetros...
            </div>
          ) : veiculosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none">
              {busca
                ? "Nenhum veículo corresponde ao filtro pesquisado."
                : "Nenhum veículo cadastrado ou ativo para este cliente."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {veiculosFiltrados.map((v) => {
                const temVencidos = (v.itens_vencidos_count || 0) > 0;
                const temAlertas = (v.itens_alerta_count || 0) > 0;

                return (
                  <TiltCard
                    key={v.id}
                    onClick={() => handleSelecionarVeiculo(v)}
                    spotlightColor={
                      temVencidos
                        ? "rgba(244, 63, 94, 0.18)"
                        : temAlertas
                          ? "rgba(245, 158, 11, 0.18)"
                          : "rgba(16, 185, 129, 0.16)"
                    }
                    className="group p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-lg hover:shadow-[6px_6px_16px_#b8c6da] hover:border-orange-500/50 dark:hover:border-orange-500/50 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3.5"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100 px-2.5 py-1 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none rounded-xl">
                          {v.placa}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            temVencidos
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : temAlertas
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                          }`}
                        >
                          {temVencidos
                            ? `${v.itens_vencidos_count} Vencidas`
                            : temAlertas
                              ? `${v.itens_alerta_count} Avisos`
                              : "Em Dia"}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 group-hover:text-orange-500 transition">
                          {v.marca_modelo}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {v.tipo_veiculo === "maquina" || v.tipo_veiculo === "trator" ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              🚜 MÁQUINA
                            </span>
                          ) : null}
                          {v.ano_fabricacao && <span>Ano: {v.ano_fabricacao}</span>}
                          {v.cor && <span>• Cor: {v.cor}</span>}
                        </div>
                      </div>

                      {(() => {
                        const isHorimetro =
                          v.tipo_medicao === "horimetro" ||
                          v.tipo_veiculo === "maquina" ||
                          v.tipo_veiculo === "trator" ||
                          v.tipo_veiculo === "equipamento";
                        return (
                          <div className="p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/60 border border-slate-300/50 dark:border-slate-800/80 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              {isHorimetro ? "Horímetro Atual:" : "Odômetro Atual:"}
                            </span>
                            <span
                              className={`font-black font-mono ${isHorimetro ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}
                            >
                              {formatarMetrica(
                                isHorimetro ? v.horimetro || 0 : v.odometro_km,
                                isHorimetro,
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="pt-2 border-t border-slate-300/40 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-500 group-hover:text-orange-500 transition">
                      <span>
                        {v.tipo_veiculo === "maquina" || v.tipo_veiculo === "trator"
                          ? "Abrir Manutenções da Máquina"
                          : "Abrir Manutenções do Veículo"}
                      </span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
                    </div>
                  </TiltCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 3: PAINEL FUNCIONAL DO VEÍCULO SELECIONADO                          */}
      {/* ========================================================================= */}
      {etapa === 3 && veiculoSelecionado && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Barra Superior do Veículo Ativo */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleVoltarParaVeiculos}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition"
                title="Trocar Veículo"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100 px-2.5 py-0.5 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none rounded-lg">
                    {veiculoSelecionado.placa}
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {veiculoSelecionado.marca_modelo}
                  </span>
                  {(veiculoSelecionado.tipo_veiculo === "maquina" ||
                    veiculoSelecionado.tipo_veiculo === "trator") && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      🚜 MÁQUINA
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {veiculoSelecionado.tipo_veiculo === "maquina" ||
                  veiculoSelecionado.tipo_veiculo === "trator" ||
                  veiculoSelecionado.tipo_veiculo === "equipamento" ? (
                    <>
                      Horímetro Registrado:{" "}
                      <strong className="text-amber-600 dark:text-amber-400 font-mono">
                        {formatarMetrica(veiculoSelecionado.horimetro || 0, true)}
                      </strong>
                    </>
                  ) : (
                    <>
                      Odômetro Registrado:{" "}
                      <strong className="text-slate-900 dark:text-slate-100 font-mono">
                        {formatarKm(veiculoSelecionado.odometro_km)}
                      </strong>
                    </>
                  )}
                  {clienteSelecionado && (
                    <span className="ml-2">
                      • Cliente: <strong>{clienteSelecionado.nome_razao_social}</strong>
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Ações do Veículo */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setItemSelecionadoParaConcluir(null);
                  setModalDespesaAberto(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-950 dark:text-emerald-900 bg-orange-400 hover:bg-emerald-300 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#059669] transition cursor-pointer"
              >
                <Receipt className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>+ Lançar Gasto / NF</span>
              </button>

              <button
                onClick={() => {
                  setItemParaEdicao(null);
                  setModalItemAberto(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 stroke-[3]" />
                <span>Novo Item</span>
              </button>

              <button
                onClick={() => {
                  setItemSelecionadoParaAgendar(null);
                  setModalAgendarAberto(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_6px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Agendar Manutenção</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas do Carro Selecionado com Filtro Bidirecional Ativo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TiltCard
              onClick={() => setFiltroStatusItem("todos")}
              spotlightColor="rgba(59, 130, 246, 0.16)"
              className={`p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none cursor-pointer transition text-left ${
                filtroStatusItem === "todos"
                  ? "border-blue-500/60 ring-2 ring-blue-500/20 bg-blue-500/5 dark:bg-blue-900/20"
                  : "border-slate-300/50 dark:border-slate-800 hover:border-blue-400/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Itens Monitorados
                </span>
                {filtroStatusItem === "todos" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400">
                    Ativo
                  </span>
                )}
              </div>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                {metricasVeiculo.totalItens}
              </div>
            </TiltCard>

            <TiltCard
              onClick={() =>
                setFiltroStatusItem(filtroStatusItem === "vencida" ? "todos" : "vencida")
              }
              spotlightColor="rgba(244, 63, 94, 0.18)"
              className={`p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none cursor-pointer transition text-left ${
                filtroStatusItem === "vencida"
                  ? "border-rose-500/60 ring-2 ring-rose-500/20 bg-rose-500/5 dark:bg-rose-900/20"
                  : "border-slate-300/50 dark:border-slate-800 hover:border-rose-400/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  Revisões Vencidas
                </span>
                {filtroStatusItem === "vencida" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-600 dark:text-rose-400">
                    Ativo
                  </span>
                )}
              </div>
              <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                {metricasVeiculo.vencidas}
              </div>
            </TiltCard>

            <TiltCard
              onClick={() =>
                setFiltroStatusItem(filtroStatusItem === "proxima" ? "todos" : "proxima")
              }
              spotlightColor="rgba(245, 158, 11, 0.18)"
              className={`p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none cursor-pointer transition text-left ${
                filtroStatusItem === "proxima"
                  ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-500/5 dark:bg-amber-900/20"
                  : "border-slate-300/50 dark:border-slate-800 hover:border-amber-400/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  Avisos Preventivos
                </span>
                {filtroStatusItem === "proxima" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    Ativo
                  </span>
                )}
              </div>
              <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                {metricasVeiculo.proximas}
              </div>
            </TiltCard>

            <TiltCard
              onClick={() =>
                setFiltroStatusItem(filtroStatusItem === "em_dia" ? "todos" : "em_dia")
              }
              spotlightColor="rgba(16, 185, 129, 0.16)"
              className={`p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none cursor-pointer transition text-left ${
                filtroStatusItem === "em_dia"
                  ? "border-orange-500/60 ring-2 ring-orange-500/20 bg-orange-500/5 dark:bg-emerald-900/20"
                  : "border-slate-300/50 dark:border-slate-800 hover:border-orange-400/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                  Revisões em Dia
                </span>
                {filtroStatusItem === "em_dia" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-600 dark:text-orange-400">
                    Ativo
                  </span>
                )}
              </div>
              <div className="text-xl font-black font-mono text-orange-600 dark:text-orange-400 mt-0.5">
                {metricasVeiculo.emDia}
              </div>
            </TiltCard>
          </div>

          {/* Abas: Planos, Agendamentos e Histórico de Gastos */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] w-fit">
            <button
              onClick={() => setAbaAtiva("planos")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                abaAtiva === "planos"
                  ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              Plano de Manutenção do Veículo
            </button>
            <button
              onClick={() => setAbaAtiva("agendamentos")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                abaAtiva === "agendamentos"
                  ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <span>Agendamentos</span>
              {metricasVeiculo.agendamentosPendentes > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-orange-500 text-slate-950 text-[10px] font-black font-mono">
                  {metricasVeiculo.agendamentosPendentes}
                </span>
              )}
            </button>
            <button
              onClick={() => setAbaAtiva("historico")}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                abaAtiva === "historico"
                  ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Histórico de Gastos</span>
              {historicoDespesas.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 text-[10px] font-black font-mono">
                  {historicoDespesas.length}
                </span>
              )}
            </button>
          </div>

          {/* Conteúdo da Aba Planos */}
          {abaAtiva === "planos" && (
            <div className="space-y-3">
              {carregando ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  Carregando manutenções preventivas do veículo...
                </div>
              ) : itens.length === 0 ? (
                <div className="py-14 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none flex flex-col items-center justify-center gap-3.5 p-6">
                  <Wrench className="h-8 w-8 text-slate-400 stroke-[1.5]" />
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      Nenhum item de revisão cadastrado para este veículo.
                    </p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Você pode criar itens personalizados com o seu próprio tempo ou carregar as
                      sugestões recomendadas.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setItemParaEdicao(null);
                        setModalItemAberto(true);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-slate-950 hover:bg-orange-400 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                    >
                      + Novo Item Personalizado
                    </button>
                    <button
                      onClick={async () => {
                        setCarregando(true);
                        const isHorimetro =
                          veiculoSelecionado.tipo_medicao === "horimetro" ||
                          veiculoSelecionado.tipo_veiculo === "maquina" ||
                          veiculoSelecionado.tipo_veiculo === "trator" ||
                          veiculoSelecionado.tipo_veiculo === "equipamento";
                        await inicializarItensPadraoVeiculo(
                          veiculoSelecionado.id,
                          isHorimetro
                            ? Number(veiculoSelecionado.horimetro || 0)
                            : veiculoSelecionado.odometro_km,
                        );
                        await carregarDadosDoVeiculo(veiculoSelecionado.id);
                        toast.success("Itens recomendados adicionados ao veículo!");
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
                    >
                      Carregar Sugestões Padrão
                    </button>
                  </div>
                </div>
              ) : itensFiltrados.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none p-6 space-y-3">
                  <p className="font-bold text-slate-700 dark:text-slate-300">
                    Nenhum item encontrado para o filtro ativo ({filtroStatusItem.replace("_", " ")}
                    ).
                  </p>
                  <button
                    onClick={() => setFiltroStatusItem("todos")}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition cursor-pointer"
                  >
                    Exibir Todos os Itens
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {itensFiltrados.map((item) => {
                    const isHorimetro =
                      veiculoSelecionado.tipo_medicao === "horimetro" ||
                      veiculoSelecionado.tipo_veiculo === "maquina" ||
                      veiculoSelecionado.tipo_veiculo === "trator" ||
                      veiculoSelecionado.tipo_veiculo === "equipamento";
                    const metricaAtual = isHorimetro
                      ? Math.round(veiculoSelecionado.horimetro || item.horimetro_atual || 0)
                      : Math.round(veiculoSelecionado.odometro_km || item.odometro_atual || 0);
                    const metricaRestante = Math.round(item.proximo_km_alvo - metricaAtual);
                    const percentual = Math.min(
                      100,
                      Math.max(
                        0,
                        Math.round(
                          ((metricaAtual - item.ultimo_km_realizado) /
                            (item.proximo_km_alvo - item.ultimo_km_realizado || 1)) *
                            100,
                        ),
                      ),
                    );

                    const isVencida = item.status === "vencida";
                    const isProxima = item.status === "proxima";
                    const spotlight = isVencida
                      ? "rgba(244, 63, 94, 0.18)"
                      : isProxima
                        ? "rgba(245, 158, 11, 0.18)"
                        : "rgba(16, 185, 129, 0.16)";

                    return (
                      <TiltCard
                        key={item.id}
                        spotlightColor={spotlight}
                        className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-sm hover:shadow-[6px_6px_16px_#b8c6da] transition space-y-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                              {item.item_manutencao}
                            </h3>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Ciclo a cada {formatarMetrica(item.intervalo_km, isHorimetro)} • Aviso
                              prévio: {formatarMetrica(item.aviso_antecipado_km, isHorimetro)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isVencida
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  : isProxima
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                    : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                              }`}
                            >
                              {isVencida
                                ? "Revisão Vencida"
                                : isProxima
                                  ? "Aviso Preventivo"
                                  : "Em Dia"}
                            </span>

                            {/* Botão de Edição de Metas (Plano Master) */}
                            <button
                              onClick={() => {
                                setItemParaEdicao(item);
                                setModalItemAberto(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none hover:shadow-[2px_2px_5px_#b8c6da] transition cursor-pointer"
                              title={
                                isHorimetro
                                  ? "Configurar Metas de Horímetro"
                                  : "Configurar Metas de Odômetro"
                              }
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Barra de Progresso do Odômetro ou Horímetro */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                              Última realização:{" "}
                              <strong className="text-slate-900 dark:text-slate-100">
                                {formatarMetrica(item.ultimo_km_realizado, isHorimetro)}
                              </strong>
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                              Meta Alvo:{" "}
                              <strong className="text-slate-900 dark:text-slate-100">
                                {formatarMetrica(item.proximo_km_alvo, isHorimetro)}
                              </strong>
                            </span>
                          </div>

                          <div className="h-2 w-full bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden shadow-[inset_1px_1px_2px_#b8c6da] dark:shadow-none">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isVencida
                                  ? "bg-rose-500"
                                  : isProxima
                                    ? "bg-amber-500"
                                    : "bg-orange-500"
                              }`}
                              style={{ width: `${percentual}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span
                              className={`font-semibold ${
                                isVencida
                                  ? "text-rose-600 dark:text-rose-400 font-bold"
                                  : isProxima
                                    ? "text-amber-600 dark:text-amber-400 font-bold"
                                    : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {metricaRestante <= 0
                                ? `${isHorimetro ? "Horímetro" : "Odômetro"} excedido em ${formatarMetrica(Math.abs(metricaRestante), isHorimetro)}`
                                : `Faltam ${formatarMetrica(metricaRestante, isHorimetro)} para a revisão`}
                            </span>
                            <span className="text-slate-400 text-[10px] font-mono">
                              {percentual}% do ciclo atingido
                            </span>
                          </div>
                        </div>

                        {/* Ações do Card */}
                        <div className="pt-2.5 border-t border-slate-300/40 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setItemSelecionadoParaAgendar(item);
                                setModalAgendarAberto(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
                            >
                              <Calendar className="h-3.5 w-3.5 text-orange-500" />
                              <span>Agendar</span>
                            </button>

                            {/* Botão de Notificação Imediata para o Operador/Administrador */}
                            {!isCliente && (isVencida || isProxima) && (
                              <button
                                onClick={() => handleNotificarClienteManutencao(item)}
                                disabled={enviandoWhatsId === item.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Notificar cliente instantaneamente via Web Push e Aplicativo"
                              >
                                {enviandoWhatsId === item.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                ) : (
                                  <Bell className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                <span>
                                  {enviandoWhatsId === item.id
                                    ? "Notificando..."
                                    : "Notificar Cliente"}
                                </span>
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => handleConcluirRevisao(item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                            <span>Concluir Revisão</span>
                          </button>
                        </div>
                      </TiltCard>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Conteúdo da Aba Agendamentos */}
          {abaAtiva === "agendamentos" && (
            <div className="space-y-3">
              {carregando ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  Carregando agendamentos...
                </div>
              ) : agendamentos.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none">
                  Nenhum agendamento registrado para este veículo.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {agendamentos.map((agendamento) => (
                    <div
                      key={agendamento.id}
                      className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-sm hover:shadow-[6px_6px_16px_#b8c6da] transition flex flex-col justify-between space-y-3.5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 px-2 py-0.5 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none rounded-lg">
                            {agendamento.placa || veiculoSelecionado.placa}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              agendamento.status === "concluido"
                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                                : agendamento.status === "confirmado"
                                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                                  : agendamento.status === "cancelado"
                                    ? "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {agendamento.status}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                            {agendamento.item_manutencao}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Cliente:{" "}
                            <strong>
                              {agendamento.cliente_nome ||
                                clienteSelecionado?.nome_razao_social ||
                                "Cliente"}
                            </strong>
                          </p>
                        </div>

                        <div className="p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/60 border border-slate-300/50 dark:border-slate-800/80 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none space-y-1 text-xs">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Calendar className="h-3.5 w-3.5 text-orange-500" />
                            <span>
                              Data sugerida: <strong>{agendamento.data_sugerida}</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Clock className="h-3.5 w-3.5 text-orange-500" />
                            <span>
                              Turno: <strong className="capitalize">{agendamento.turno}</strong>
                            </span>
                          </div>
                          {agendamento.observacoes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-300/40 dark:border-slate-800">
                              {agendamento.observacoes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Botões para Administrador e Operador */}
                      {!isCliente && agendamento.status === "solicitado" && (
                        <div className="pt-2 border-t border-slate-300/40 dark:border-slate-800 flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              handleAlterarStatusAgendamento(agendamento.id, "cancelado")
                            }
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                          >
                            Recusar
                          </button>
                          <button
                            onClick={() =>
                              handleAlterarStatusAgendamento(agendamento.id, "confirmado")
                            }
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                          >
                            Confirmar
                          </button>
                        </div>
                      )}

                      {!isCliente && agendamento.status === "confirmado" && (
                        <div className="pt-2 border-t border-slate-300/40 dark:border-slate-800 flex items-center justify-end">
                          <button
                            onClick={() =>
                              handleAlterarStatusAgendamento(agendamento.id, "concluido")
                            }
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                          >
                            Marcar como Concluído
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conteúdo da Aba Histórico de Gastos e Comprovantes / NF */}
          {abaAtiva === "historico" && (
            <div className="space-y-4">
              {/* Barra de Resumo Financeiro do Veículo */}
              <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Total Investido em Serviços / Peças
                    </span>
                    <div className="text-xl sm:text-2xl font-black font-mono text-orange-600 dark:text-orange-400">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(
                        historicoDespesas.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0),
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setItemSelecionadoParaConcluir(null);
                      setModalDespesaAberto(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-orange-400 hover:bg-emerald-300 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#059669] transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[3]" />
                    <span>Lançar Nova Despesa</span>
                  </button>
                </div>
              </div>

              {carregando ? (
                <div className="py-16 text-center text-xs text-slate-400">
                  Carregando histórico de despesas e notas fiscais...
                </div>
              ) : historicoDespesas.length === 0 ? (
                <div className="py-14 text-center text-xs text-slate-500 bg-[#eaf0f8] dark:bg-slate-900/30 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none flex flex-col items-center justify-center gap-3.5 p-6">
                  <Receipt className="h-8 w-8 text-slate-400 stroke-[1.5]" />
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      Nenhum gasto ou revisão com valor financeiro lançado para este veículo.
                    </p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Você pode registrar trocas de óleo, compras de peças, pneus, serviços e anexar
                      a Nota Fiscal para download pelo cliente administrador.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setItemSelecionadoParaConcluir(null);
                      setModalDespesaAberto(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-slate-950 hover:bg-orange-400 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                  >
                    + Lançar Primeiro Gasto
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {historicoDespesas.map((desp) => {
                    const dataFormatada = desp.data_despesa
                      ? new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(desp.data_despesa))
                      : "Data não informada";

                    return (
                      <div
                        key={desp.id}
                        className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-sm flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          {/* Cabeçalho do Card */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                  {desp.tipo_despesa || desp.categoria || "Manutenção"}
                                </span>
                                {desp.odometro_km != null && (
                                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                    {formatarKm(desp.odometro_km)}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {desp.descricao || "Serviço de Manutenção"}
                              </h4>
                            </div>

                            <div className="text-right">
                              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                }).format(Number(desp.valor) || 0)}
                              </span>
                              <div className="text-[10px] text-slate-400">{dataFormatada}</div>
                            </div>
                          </div>

                          {/* Detalhes: Forma de Pagamento e Estabelecimento */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-[#eaf0f8] dark:bg-slate-800/40 p-2.5 rounded-2xl border border-slate-300/50 dark:border-slate-800/80 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none">
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                Como foi pago
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mt-0.5">
                                {desp.forma_pagamento === "pix" && (
                                  <QrCode className="h-3.5 w-3.5 text-orange-500" />
                                )}
                                {(desp.forma_pagamento === "cartao_credito" ||
                                  desp.forma_pagamento === "cartao_debito") && (
                                  <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                                )}
                                {desp.forma_pagamento === "dinheiro" && (
                                  <Banknote className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                {desp.forma_pagamento === "boleto" && (
                                  <FileText className="h-3.5 w-3.5 text-purple-500" />
                                )}
                                <span className="capitalize">
                                  {desp.forma_pagamento
                                    ? desp.forma_pagamento.replace("_", " ")
                                    : "Não informado"}
                                </span>
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                Oficina / Prestador
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mt-0.5 truncate">
                                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {desp.oficina_prestador || "Oficina não informada"}
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Número da NF se houver */}
                          {desp.nf_numero && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              NF / Comprovante:{" "}
                              <strong className="text-slate-700 dark:text-slate-200 font-mono">
                                #{desp.nf_numero}
                              </strong>
                            </div>
                          )}

                          {/* Observações */}
                          {desp.observacoes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                              {desp.observacoes}
                            </p>
                          )}
                        </div>

                        {/* Rodapé: Ações e Download de NF */}
                        <div className="pt-3 border-t border-slate-300/40 dark:border-slate-800/80 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {desp.comprovante_url ? (
                              <>
                                <button
                                  onClick={() => handleVisualizarNf(desp.comprovante_url!)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
                                  title="Visualizar documento em nova aba"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Visualizar</span>
                                </button>
                                <button
                                  onClick={() => handleBaixarNf(desp)}
                                  disabled={baixandoNfId === desp.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-950 dark:text-emerald-900 bg-orange-400 hover:bg-emerald-300 shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#059669] transition cursor-pointer disabled:opacity-50"
                                  title="Baixar Nota Fiscal / Comprovante"
                                >
                                  {baixandoNfId === desp.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                  <span>Baixar NF</span>
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Sem NF anexada
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleExcluirDespesa(desp.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Excluir lançamento financeiro"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Agendamento */}
      {modalAgendarAberto && veiculoSelecionado && (
        <AgendamentoModal
          itemPreSelecionado={itemSelecionadoParaAgendar}
          clienteId={clienteSelecionado?.id || session?.clienteId}
          veiculoId={veiculoSelecionado.id}
          placaVeiculo={veiculoSelecionado.placa}
          onFechar={() => setModalAgendarAberto(false)}
          onSucesso={() => {
            setModalAgendarAberto(false);
            carregarDadosDoVeiculo(veiculoSelecionado.id);
          }}
        />
      )}

      {/* Modal de Item de Manutenção (Criação ou Edição) */}
      {modalItemAberto && veiculoSelecionado && (
        <ItemManutencaoModal
          itemParaEdicao={itemParaEdicao}
          veiculoId={veiculoSelecionado.id}
          placaVeiculo={veiculoSelecionado.placa}
          tipoVeiculo={veiculoSelecionado.tipo_veiculo}
          tipoMedicao={veiculoSelecionado.tipo_medicao}
          odometroAtual={veiculoSelecionado.odometro_km}
          horimetroAtual={veiculoSelecionado.horimetro}
          onFechar={() => setModalItemAberto(false)}
          onSucesso={() => {
            setModalItemAberto(false);
            carregarDadosDoVeiculo(veiculoSelecionado.id);
          }}
        />
      )}

      {/* Modal de Lançamento de Despesa e Conclusão com NF */}
      {modalDespesaAberto && veiculoSelecionado && (
        <ModalLancamentoDespesaVeiculo
          veiculoId={veiculoSelecionado.id}
          placaVeiculo={veiculoSelecionado.placa}
          veiculoModelo={veiculoSelecionado.marca_modelo}
          odometroAtual={veiculoSelecionado.odometro_km}
          clienteId={clienteSelecionado?.id || session?.clienteId}
          itemManutencao={itemSelecionadoParaConcluir}
          onFechar={() => {
            setModalDespesaAberto(false);
            setItemSelecionadoParaConcluir(null);
          }}
          onSucesso={() => {
            setModalDespesaAberto(false);
            setItemSelecionadoParaConcluir(null);
            carregarDadosDoVeiculo(veiculoSelecionado.id);
          }}
        />
      )}
    </div>
  );
}
