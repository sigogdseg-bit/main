import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  Calendar,
  FileText,
  Zap,
  TrendingUp,
  Clock,
  Car,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Search,
  DollarSign,
  Fuel,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  BarChart3,
  PieChart as PieIcon,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Receipt,
  Timer,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME, APP_VERSION_NUMERO, APP_DOMINIO } from "@/shared/lib/version";
import { toast } from "sonner";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { TiltCard } from "@/shared/components/TiltCard";
import { isCicloViagemReal } from "@/features/monitor-gps/services/gpsService";
import { ehAlertaRestritoEquipeTecnica } from "@/features/monitor-gps/constants/alertasCatalogo";

import { carregarClientes } from "@/features/clientes/services/clienteService";
import type { Cliente } from "@/features/clientes/types";
import {
  isModoDegustacao,
  obterVeiculosDegustacaoMaster,
  obterViagensDegustacaoMaster,
  obterAbastecimentosDegustacaoMaster,
  obterDespesasManutencaoDegustacaoMaster,
  obterItensManutencaoDegustacaoMaster,
} from "@/features/demonstracao/services/degustacaoMasterService";
import { formatarKm, formatarMinutos } from "@/features/monitor-gps/utils/formatadoresViagem";
import { ModalLancamentoAbastecimento } from "./ModalLancamentoAbastecimento";
import { ModalLancamentoDespesaVeiculo } from "@/features/manutencao/components/ModalLancamentoDespesaVeiculo";

// ============================================================================
// TIPAGEM E CONSTANTES DE PERÍODO
// ============================================================================
type TipoFiltroPeriodo = "rapido" | "dia_especifico" | "mes_especifico";

const NOMES_MESES = [
  { valor: 1, rotulo: "Janeiro" },
  { valor: 2, rotulo: "Fevereiro" },
  { valor: 3, rotulo: "Março" },
  { valor: 4, rotulo: "Abril" },
  { valor: 5, rotulo: "Maio" },
  { valor: 6, rotulo: "Junho" },
  { valor: 7, rotulo: "Julho" },
  { valor: 8, rotulo: "Agosto" },
  { valor: 9, rotulo: "Setembro" },
  { valor: 10, rotulo: "Outubro" },
  { valor: 11, rotulo: "Novembro" },
  { valor: 12, rotulo: "Dezembro" },
];

const ANOS_FILTRO = [2024, 2025, 2026, 2027];

interface VeiculoAnalyticsData {
  veiculo_id: string;
  placa: string;
  marca_modelo: string;
  data_referencia: string;
  km_rodado: number;
  tempo_direcao_minutos: number;
  tempo_ocioso_minutos: number;
  vel_maxima_atingida: number;
  consumo_kml: number | null;
  score_conducao: number;
  alertas_count?: number;
}

interface VeiculoInfo {
  id: string;
  placa: string;
  marca_modelo: string;
  cliente_id: string;
  odometro_km?: number;
}

interface AbastecimentoRegistro {
  id: string;
  veiculo_id: string;
  data_abastecimento: string;
  km_atual: number | null;
  litros: number;
  valor_total: number;
  combustivel: string;
  posto_nome?: string;
  nf_numero?: string | null;
  nf_foto_url?: string | null;
}

interface DespesaRegistro {
  id: string;
  veiculo_id: string;
  data_despesa: string;
  categoria: string;
  descricao: string;
  valor: number;
  km_atual?: number;
  nf_numero?: string | null;
  nf_foto_url?: string | null;
}

interface ItemFinanceiroConsolidado {
  id: string;
  data: string;
  tipoCategoria: "combustivel" | "manutencao" | "outras";
  categoriaLabel: string;
  veiculo_id: string;
  placa: string;
  marca_modelo: string;
  detalhamento: string;
  km_atual: number | null;
  valor: number;
}

interface AlertaRegistro {
  id: string;
  veiculo_id: string;
  tipo: string;
  gravidade: string;
  velocidade: number;
  detalhes: string;
  created_at: string;
}

interface ManutencaoPlanoRegistro {
  id: string;
  veiculo_id: string;
  item_manutencao: string;
  intervalo_km: number;
  ultimo_km_realizado: number;
  proximo_km_alvo: number;
  proxima_data_alvo?: string;
  status: "em_dia" | "proxima" | "vencida";
}

type SortDirection = "asc" | "desc" | null;

interface SortState {
  campo: string | null;
  direcao: SortDirection;
}

const CORES_PIE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

// Componente Canônico de Cabeçalho com Ordenação Bidirecional
function CabecalhoOrdenavel({
  titulo,
  campo,
  campoAtivo,
  direcao,
  onOrdenar,
  alinhamento = "left",
}: {
  titulo: string;
  campo: string;
  campoAtivo: string | null;
  direcao: SortDirection;
  onOrdenar: (campo: string) => void;
  alinhamento?: "left" | "right" | "center";
}) {
  const ativo = campoAtivo === campo && direcao !== null;
  return (
    <th
      onClick={() => onOrdenar(campo)}
      className={`px-4 py-3 cursor-pointer select-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 ${
        alinhamento === "right"
          ? "text-right"
          : alinhamento === "center"
            ? "text-center"
            : "text-left"
      } ${ativo ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
      title={`Clique para alternar ordenação de ${titulo} (crescente/decrescente)`}
    >
      <div
        className={`inline-flex items-center gap-1.5 ${
          alinhamento === "right"
            ? "justify-end"
            : alinhamento === "center"
              ? "justify-center"
              : "justify-start"
        }`}
      >
        <span>{titulo}</span>
        {ativo && direcao === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        ) : ativo && direcao === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-60 hover:opacity-100 shrink-0" />
        )}
      </div>
    </th>
  );
}

export function FrotaAnalyticsView() {
  const { session } = useAuth();
  const [filtroModo, setFiltroModo] = useState<"rapido" | "dia" | "mes">("rapido");
  const [periodoRapido, setPeriodoRapido] = useState<number>(7);
  const [dataDiaFiltro, setDataDiaFiltro] = useState<string>(() =>
    new Date().toISOString().substring(0, 10),
  );
  const [mesFiltro, setMesFiltro] = useState<number>(() => new Date().getMonth() + 1);
  const [anoFiltro, setAnoFiltro] = useState<number>(() => new Date().getFullYear());

  // Compatibilidade e controle síncrono
  const periodo = periodoRapido;
  const setPeriodo = (dias: number) => {
    setFiltroModo("rapido");
    setPeriodoRapido(dias);
  };

  // Cálculo canônico e reativo do intervalo de datas e texto do período
  const { dataInicio, dataFim, descricaoPeriodo } = useMemo(() => {
    if (filtroModo === "dia") {
      const partes = dataDiaFiltro.split("-");
      const a = Number(partes[0]) || 2026;
      const m = (Number(partes[1]) || 1) - 1;
      const d = Number(partes[2]) || 1;
      const ini = new Date(a, m, d, 0, 0, 0, 0);
      const fim = new Date(a, m, d, 23, 59, 59, 999);
      return {
        dataInicio: ini,
        dataFim: fim,
        descricaoPeriodo: `Dia ${ini.toLocaleDateString("pt-BR")}`,
      };
    }
    if (filtroModo === "mes") {
      const ini = new Date(anoFiltro, mesFiltro - 1, 1, 0, 0, 0, 0);
      const fim = new Date(anoFiltro, mesFiltro, 0, 23, 59, 59, 999);
      const nomeMes = NOMES_MESES.find((m) => m.valor === mesFiltro)?.rotulo || "Mês";
      return {
        dataInicio: ini,
        dataFim: fim,
        descricaoPeriodo: `${nomeMes} de ${anoFiltro}`,
      };
    }
    if (periodoRapido === 1) {
      const ini = new Date();
      ini.setHours(0, 0, 0, 0);
      const fim = new Date();
      fim.setHours(23, 59, 59, 999);
      return {
        dataInicio: ini,
        dataFim: fim,
        descricaoPeriodo: `Hoje (${new Date().toLocaleDateString("pt-BR")})`,
      };
    }
    const dias = periodoRapido;
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    const ini = new Date();
    ini.setDate(ini.getDate() - dias);
    ini.setHours(0, 0, 0, 0);
    return {
      dataInicio: ini,
      dataFim: fim,
      descricaoPeriodo: `Últimos ${dias} dias`,
    };
  }, [filtroModo, dataDiaFiltro, mesFiltro, anoFiltro, periodoRapido]);

  const [abaAtiva, setAbaAtiva] = useState<
    "operacional" | "financeiro" | "seguranca" | "manutencao"
  >("operacional");
  const [ocultarSemDeslocamento, setOcultarSemDeslocamento] = useState(false);

  // Estados principais de dados brutos
  const [dados, setDados] = useState<VeiculoAnalyticsData[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<AbastecimentoRegistro[]>([]);
  const [despesas, setDespesas] = useState<DespesaRegistro[]>([]);
  const [alertas, setAlertas] = useState<AlertaRegistro[]>([]);
  const [manutencoes, setManutencoes] = useState<ManutencaoPlanoRegistro[]>([]);

  const [loading, setLoading] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [placaFiltro, setPlacaFiltro] = useState<string>("todos");

  // Para Admins / Operadores: seleção de cliente da carteira
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>("todos");
  const [nomeClienteAtual, setNomeClienteAtual] = useState<string>("Todos os Clientes");

  // Lista de veículos disponíveis para filtro
  const [todosVeiculos, setTodosVeiculos] = useState<VeiculoInfo[]>([]);

  // Modais de lançamento direto de custos pela gestão / cliente
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false);
  const [modalDespesaAberto, setModalDespesaAberto] = useState(false);
  const [veiculoParaDespesa, setVeiculoParaDespesa] = useState<VeiculoInfo | null>(null);

  // --------------------------------------------------------------------------
  // ESTADOS DE FILTRO INTERATIVO ATIVADOS POR INFOGRÁFICOS / CARDS
  // --------------------------------------------------------------------------
  const [filtroOperacionalKpi, setFiltroOperacionalKpi] = useState<
    | "todos"
    | "score_critico"
    | "score_excelente"
    | "excesso_velocidade"
    | "com_ociosidade"
    | "com_direcao"
  >("todos");

  const [filtroFinanceiroCategoria, setFiltroFinanceiroCategoria] = useState<
    "todas" | "combustivel" | "manutencao" | "outras"
  >("todas");

  const [filtroSegurancaTipo, setFiltroSegurancaTipo] = useState<
    "todos" | "velocidade" | "critica" | "alta" | "media" | "baixa"
  >("todos");

  const [filtroManutencaoStatus, setFiltroManutencaoStatus] = useState<
    "todos" | "em_dia" | "proxima" | "vencida"
  >("todos");

  // --------------------------------------------------------------------------
  // ESTADOS DE ORDENAÇÃO BIDIRECIONAL POR ABA
  // --------------------------------------------------------------------------
  const [sortOperacional, setSortOperacional] = useState<SortState>({
    campo: "data_referencia",
    direcao: "desc",
  });

  const [sortFinanceiro, setSortFinanceiro] = useState<SortState>({
    campo: "data",
    direcao: "desc",
  });

  const [sortSeguranca, setSortSeguranca] = useState<SortState>({
    campo: "created_at",
    direcao: "desc",
  });

  const [sortManutencao, setSortManutencao] = useState<SortState>({
    campo: "status",
    direcao: "desc",
  });

  // Alternador de ordenação (desc -> asc -> null)
  const alternarOrdenacao = (
    campo: string,
    estadoAtual: SortState,
    setEstado: (val: SortState) => void,
  ) => {
    if (estadoAtual.campo !== campo) {
      setEstado({ campo, direcao: "desc" });
    } else if (estadoAtual.direcao === "desc") {
      setEstado({ campo, direcao: "asc" });
    } else if (estadoAtual.direcao === "asc") {
      setEstado({ campo: null, direcao: null });
    } else {
      setEstado({ campo, direcao: "desc" });
    }
  };

  const ehAdminOuOperador = Boolean(
    session?.isAdmin ||
    session?.isSuperAdmin ||
    session?.isOperador ||
    session?.role === "adm" ||
    session?.role === "superadmin" ||
    session?.role === "operador",
  );

  // 1. Carrega clientes para Administrador ou resolve o cliente para usuário Cliente
  useEffect(() => {
    let ativo = true;

    async function inicializar() {
      if (ehAdminOuOperador) {
        try {
          const lista = await carregarClientes();
          if (!ativo) return;
          setClientesDisponiveis(lista || []);
        } catch (err) {
          console.error("[FrotaAnalytics] Erro ao carregar clientes:", err);
        }
      } else if (session?.isCliente) {
        const idCli = session.clienteId || "";
        setClienteSelecionadoId(idCli);
        setNomeClienteAtual(session.nome || "Minha Frota");
      }
    }

    inicializar();
    return () => {
      ativo = false;
    };
  }, [session, ehAdminOuOperador]);

  // 2. Carrega lista de veículos conforme o cliente selecionado
  useEffect(() => {
    let ativo = true;

    async function carregarListaVeiculos() {
      try {
        if (session?.isDegustacao) {
          const veicsDeg = obterVeiculosDegustacaoMaster();
          if (ativo) {
            setTodosVeiculos(
              veicsDeg.map((v) => ({
                id: v.id,
                placa: v.placa,
                marca_modelo: v.marca_modelo,
                cliente_id: "deg-cli-001",
                odometro_km: v.odometro || 18450,
              })),
            );
          }
          return;
        }

        // 1. Prioriza rota segura de backend (/api/veiculos) com Service Role para imunidade contra RLS
        let veiculosCarregados: VeiculoInfo[] = [];
        try {
          const sess = await supabase.auth.getSession();
          const token = sess.data.session?.access_token;
          if (token) {
            const urlApi =
              clienteSelecionadoId && clienteSelecionadoId !== "todos"
                ? `/api/veiculos?clienteId=${encodeURIComponent(clienteSelecionadoId)}`
                : `/api/veiculos/monitor`;
            const res = await fetch(urlApi, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              if (json.success && Array.isArray(json.veiculos)) {
                veiculosCarregados = json.veiculos.map((v: any) => ({
                  id: v.id,
                  placa: v.placa,
                  marca_modelo: v.marca_modelo,
                  cliente_id: v.cliente_id,
                  odometro_km: v.odometro_km || 0,
                }));
              }
            }
          }
        } catch {
          /* fallback */
        }

        if (veiculosCarregados.length > 0) {
          if (ativo) setTodosVeiculos(veiculosCarregados);
          return;
        }

        // 2. Fallback direto via Supabase SDK
        let query = supabase
          .from("veiculos")
          .select("id, placa, marca_modelo, cliente_id, odometro_km");
        if (clienteSelecionadoId && clienteSelecionadoId !== "todos") {
          query = query.eq("cliente_id", clienteSelecionadoId);
        } else if (!ehAdminOuOperador && session?.clienteId) {
          query = query.eq("cliente_id", session.clienteId);
        }

        const { data, error } = await query.order("placa", { ascending: true });
        if (!error && data && ativo) {
          setTodosVeiculos(data as VeiculoInfo[]);
        }
      } catch (err) {
        console.error("[FrotaAnalytics] Erro ao carregar veiculos:", err);
      }
    }

    carregarListaVeiculos();
    return () => {
      ativo = false;
    };
  }, [clienteSelecionadoId, ehAdminOuOperador, session?.clienteId, session?.isDegustacao]);

  // 3. Carrega os dados analíticos de telemetria, custos, alertas e manutenção
  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      let veics: any[] = [];
      let resViagens: any = { data: [] };
      let resAbast: any = { data: [] };
      let resDesp: any = { data: [] };
      let resAlertas: any = { data: [] };
      let resManut: any = { data: [] };

      if (session?.isDegustacao) {
        veics = obterVeiculosDegustacaoMaster().map((v) => ({
          id: v.id,
          placa: v.placa,
          marca_modelo: v.marca_modelo,
          cliente_id: "deg-cli-001",
          odometro_km: v.odometro || 18450,
        }));
        resViagens = { data: obterViagensDegustacaoMaster() };
        resAbast = { data: obterAbastecimentosDegustacaoMaster() };
        resDesp = { data: obterDespesasManutencaoDegustacaoMaster() };
        resAlertas = {
          data: [
            {
              id: "deg-alert-001",
              veiculo_id: "deg-veic-001",
              tipo: "velocidade",
              gravidade: "media",
              velocidade: 88,
              detalhes: "Excesso leve de velocidade na via",
              created_at: new Date().toISOString(),
            },
          ],
        };
        resManut = { data: obterItensManutencaoDegustacaoMaster() };
      } else {
        // 1. Tenta carregar veículos via rota segura de backend (/api/veiculos) com Service Role
        let veiculosEncontrados: any[] = [];
        try {
          const sess = await supabase.auth.getSession();
          const token = sess.data.session?.access_token;
          if (token) {
            const urlApi =
              clienteSelecionadoId && clienteSelecionadoId !== "todos"
                ? `/api/veiculos?clienteId=${encodeURIComponent(clienteSelecionadoId)}`
                : `/api/veiculos/monitor`;
            const res = await fetch(urlApi, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              if (json.success && Array.isArray(json.veiculos)) {
                veiculosEncontrados = json.veiculos;
              }
            }
          }
        } catch {
          /* fallback */
        }

        if (veiculosEncontrados.length > 0) {
          veics = veiculosEncontrados;
        } else {
          let queryVeiculos = supabase
            .from("veiculos")
            .select("id, placa, marca_modelo, cliente_id, odometro_km");
          if (clienteSelecionadoId && clienteSelecionadoId !== "todos") {
            queryVeiculos = queryVeiculos.eq("cliente_id", clienteSelecionadoId);
          } else if (!ehAdminOuOperador && session?.clienteId) {
            queryVeiculos = queryVeiculos.eq("cliente_id", session.clienteId);
          }

          const { data: dbVeics } = await queryVeiculos;
          if (!dbVeics || dbVeics.length === 0) {
            setDados([]);
            setAbastecimentos([]);
            setDespesas([]);
            setAlertas([]);
            setManutencoes([]);
            return;
          }
          veics = dbVeics;
        }

        const veicIds = veics.map((v) => v.id);
        const dataInicioIso = dataInicio.toISOString();
        const dataFimIso = dataFim.toISOString();
        const dataInicioStr = dataInicioIso.substring(0, 10);
        const dataFimStr = dataFimIso.substring(0, 10);

        // Busca paralela de todas as fontes canônicas dentro do intervalo estrito
        const [rViag, rAbast, rDesp, rAlert, rMan] = await Promise.all([
          supabase
            .from("viagens_trajetos")
            .select(
              "veiculo_id, km_percorrido, velocidade_media, velocidade_maxima, inicio_at, fim_at",
            )
            .in("veiculo_id", veicIds)
            .gte("inicio_at", dataInicioIso)
            .lte("inicio_at", dataFimIso)
            .order("inicio_at", { ascending: true }),

          supabase
            .from("motorista_abastecimentos")
            .select(
              "id, veiculo_id, data_abastecimento, km_atual, litros, valor_total, combustivel, posto_nome, nf_numero, nf_foto_url",
            )
            .in("veiculo_id", veicIds)
            .gte("data_abastecimento", dataInicioStr)
            .lte("data_abastecimento", dataFimStr)
            .order("data_abastecimento", { ascending: true }),

          supabase
            .from("motorista_despesas")
            .select(
              "id, veiculo_id, data_despesa, categoria, descricao, valor, km_atual, nf_numero, nf_foto_url",
            )
            .in("veiculo_id", veicIds)
            .gte("data_despesa", dataInicioStr)
            .lte("data_despesa", dataFimStr)
            .order("data_despesa", { ascending: true }),

          supabase
            .from("alertas_seguranca")
            .select("id, veiculo_id, tipo, gravidade, velocidade, detalhes, created_at")
            .in("veiculo_id", veicIds)
            .gte("created_at", dataInicioIso)
            .lte("created_at", dataFimIso)
            .order("created_at", { ascending: false }),

          supabase
            .from("planos_manutencao_preventiva")
            .select(
              "id, veiculo_id, item_manutencao, intervalo_km, ultimo_km_realizado, proximo_km_alvo, proxima_data_alvo, status",
            )
            .in("veiculo_id", veicIds)
            .order("proximo_km_alvo", { ascending: true }),
        ]);

        resViagens = rViag;
        resAbast = rAbast;
        resDesp = rDesp;
        resAlertas = rAlert;
        resManut = rMan;
      }

      const viagens = (resViagens.data || []).filter(isCicloViagemReal);

      // Deduplicação inteligente de abastecimentos (prioriza registros com NF em anexo)
      const mapaAbastDeduplicado = new Map<string, AbastecimentoRegistro>();
      for (const a of (resAbast.data || []) as AbastecimentoRegistro[]) {
        const chave =
          a.nf_numero && a.nf_numero.trim()
            ? `nf_${a.veiculo_id}_${a.nf_numero.trim().toUpperCase()}`
            : `sem_nf_${a.veiculo_id}_${a.data_abastecimento}_${Number(a.km_atual || 0)}_${Number(a.valor_total || 0)}`;

        const existente = mapaAbastDeduplicado.get(chave);
        if (!existente) {
          mapaAbastDeduplicado.set(chave, a);
        } else if (!existente.nf_foto_url && a.nf_foto_url) {
          mapaAbastDeduplicado.set(chave, a);
        }
      }
      const listaAbast = Array.from(mapaAbastDeduplicado.values());

      // Deduplicação inteligente de despesas
      const mapaDespDeduplicado = new Map<string, DespesaRegistro>();
      for (const d of (resDesp.data || []) as DespesaRegistro[]) {
        const chave =
          d.nf_numero && d.nf_numero.trim()
            ? `nf_${d.veiculo_id}_${d.nf_numero.trim().toUpperCase()}`
            : `sem_nf_${d.veiculo_id}_${d.data_despesa}_${Number(d.valor || 0)}_${(d.descricao || "").trim().toUpperCase()}`;

        const existente = mapaDespDeduplicado.get(chave);
        if (!existente) {
          mapaDespDeduplicado.set(chave, d);
        } else if (!existente.nf_foto_url && d.nf_foto_url) {
          mapaDespDeduplicado.set(chave, d);
        }
      }
      const listaDesp = Array.from(mapaDespDeduplicado.values());

      const listaAlertas = ((resAlertas.data as AlertaRegistro[]) || []).filter(
        (a) => ehAdminOuOperador || !ehAlertaRestritoEquipeTecnica(a.tipo),
      );
      const listaManut = (resManut.data as ManutencaoPlanoRegistro[]) || [];

      setAbastecimentos(listaAbast);
      setDespesas(listaDesp);
      setAlertas(listaAlertas);
      setManutencoes(listaManut);

      // Agrupamento de consumo real por abastecimento consecutivo
      const mapaConsumoRealPorDiaVeiculo: Record<string, number> = {};
      for (const veic of veics) {
        const abastsVeic = listaAbast
          .filter((a) => a.veiculo_id === veic.id && Number(a.km_atual || 0) > 0)
          .sort((a, b) => Number(a.km_atual) - Number(b.km_atual));

        for (let i = 1; i < abastsVeic.length; i++) {
          const anterior = abastsVeic[i - 1];
          const atual = abastsVeic[i];
          const deltaKm = Number(atual.km_atual) - Number(anterior.km_atual);
          const litros = Number(atual.litros);
          if (deltaKm > 0 && litros > 0) {
            const kml = Number((deltaKm / litros).toFixed(1));
            mapaConsumoRealPorDiaVeiculo[`${veic.id}_${atual.data_abastecimento}`] = kml;
          }
        }
      }

      // Gera array de datas do intervalo selecionado (do início ao fim)
      const datasIntervalo: string[] = [];
      const cursor = new Date(dataInicio);
      cursor.setHours(0, 0, 0, 0);
      const limite = new Date(dataFim);
      limite.setHours(0, 0, 0, 0);
      while (cursor <= limite) {
        datasIntervalo.push(cursor.toISOString().substring(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }

      // Agrupamento diário de viagens com cálculo de tempo ocioso real
      const mapaAgregado: Record<string, VeiculoAnalyticsData> = {};

      for (const dataStr of datasIntervalo) {
        for (const veic of veics) {
          const chave = `${veic.id}_${dataStr}`;
          mapaAgregado[chave] = {
            veiculo_id: veic.id,
            placa: veic.placa,
            marca_modelo: veic.marca_modelo || "Veículo",
            data_referencia: dataStr,
            km_rodado: 0,
            tempo_direcao_minutos: 0,
            tempo_ocioso_minutos: 0,
            vel_maxima_atingida: 0,
            consumo_kml: mapaConsumoRealPorDiaVeiculo[chave] ?? null,
            score_conducao: 100,
            alertas_count: 0,
          };
        }
      }

      // Contagem de alertas reais por dia e veículo
      for (const al of listaAlertas) {
        const dataStr = al.created_at.substring(0, 10);
        const chave = `${al.veiculo_id}_${dataStr}`;
        if (mapaAgregado[chave]) {
          mapaAgregado[chave].alertas_count = (mapaAgregado[chave].alertas_count || 0) + 1;
        }
      }

      // Consolidação das viagens reais
      for (const v of viagens) {
        if (!v.inicio_at) continue;
        const dataStr = v.inicio_at.substring(0, 10);
        const chave = `${v.veiculo_id}_${dataStr}`;
        if (!mapaAgregado[chave]) continue;

        const km = Number(v.km_percorrido || 0);
        const velMax = Number(v.velocidade_maxima || 0);
        const velMed = Number(v.velocidade_media || 0);

        mapaAgregado[chave].km_rodado += km;
        mapaAgregado[chave].vel_maxima_atingida = Math.max(
          mapaAgregado[chave].vel_maxima_atingida,
          velMax,
        );

        // Ciclos de condução / viagens reais
        if (v.inicio_at && v.fim_at) {
          const inicio = new Date(v.inicio_at).getTime();
          const fim = new Date(v.fim_at).getTime();
          const duracaoMinutos = Math.max(0, Math.round((fim - inicio) / 60000));

          // Tempo de direção: soma de todos os ciclos de condução no dia
          mapaAgregado[chave].tempo_direcao_minutos += duracaoMinutos;

          // Tempo ocioso: ignição ligada sem deslocamento
          const tempoMovimentoMinutos =
            velMed > 0
              ? (km / velMed) * 60
              : velMax > 0 && km > 0 && duracaoMinutos > 0
                ? Math.min(duracaoMinutos, (km / Math.max(10, velMax * 0.45)) * 60)
                : 0;
          const tempoOciosoViagem = Math.max(0, Math.round(duracaoMinutos - tempoMovimentoMinutos));
          mapaAgregado[chave].tempo_ocioso_minutos += tempoOciosoViagem;
        }
      }

      // Cálculo objetivo do Score
      for (const chave in mapaAgregado) {
        const item = mapaAgregado[chave];
        item.km_rodado = Number(item.km_rodado.toFixed(2));
        if (item.km_rodado <= 0) {
          item.score_conducao = 100;
        } else {
          let score = 100;
          if (item.vel_maxima_atingida > 90) {
            score -= item.vel_maxima_atingida - 90;
          }
          if (item.alertas_count && item.alertas_count > 0) {
            score -= item.alertas_count * 5;
          }
          item.score_conducao = Math.max(40, Math.min(100, Math.round(score)));
        }
      }

      const listaFinal = Object.values(mapaAgregado);
      setDados(listaFinal);
    } catch (err) {
      console.error("[FrotaAnalytics] Falha ao carregar métricas:", err);
      toast.error("Erro ao carregar telemetria e dados analíticos da frota.");
    } finally {
      setLoading(false);
    }
  }, [clienteSelecionadoId, dataInicio, dataFim, ehAdminOuOperador, session?.clienteId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Lista única de placas disponíveis
  const placasOrigem =
    dados.length > 0 ? dados.map((d) => d.placa) : todosVeiculos.map((v) => v.placa);
  const veiculosDisponiveis = Array.from(new Set(placasOrigem)).filter(Boolean);

  // --------------------------------------------------------------------------
  // FILTRAGEM OPERACIONAL BÁSICA E TOGGLE ANTI-RUÍDO
  // --------------------------------------------------------------------------
  const dadosBaseOperacionais = dados
    .filter((d) => (placaFiltro === "todos" ? true : d.placa === placaFiltro))
    .filter((d) => {
      if (!ocultarSemDeslocamento) return true;
      return (
        Number(d.km_rodado) > 0 ||
        Number(d.tempo_direcao_minutos) > 0 ||
        Number(d.tempo_ocioso_minutos) > 0 ||
        Number(d.alertas_count || 0) > 0 ||
        d.consumo_kml !== null
      );
    });

  const totalDiasDisponiveis = dados.filter((d) =>
    placaFiltro === "todos" ? true : d.placa === placaFiltro,
  ).length;
  const totalDiasOperacionais = dadosBaseOperacionais.length;

  // Consolidação diária para gráficos da aba operacional
  const dadosGrafico = Object.values(
    dadosBaseOperacionais.reduce(
      (acc, d) => {
        const date = d.data_referencia;
        if (!acc[date]) {
          acc[date] = {
            data_referencia: date,
            km_rodado: 0,
            tempo_direcao_minutos: 0,
            tempo_ocioso_minutos: 0,
            vel_maxima_atingida: 0,
            consumo_soma: 0,
            consumo_count: 0,
            score_soma: 0,
            alertas_total: 0,
            count: 0,
          };
        }
        acc[date].km_rodado += Number(d.km_rodado || 0);
        acc[date].tempo_direcao_minutos += Number(d.tempo_direcao_minutos || 0);
        acc[date].tempo_ocioso_minutos += Number(d.tempo_ocioso_minutos || 0);
        acc[date].vel_maxima_atingida = Math.max(
          acc[date].vel_maxima_atingida,
          Number(d.vel_maxima_atingida || 0),
        );
        if (d.consumo_kml !== null && d.consumo_kml !== undefined && Number(d.consumo_kml) > 0) {
          acc[date].consumo_soma += Number(d.consumo_kml);
          acc[date].consumo_count += 1;
        }
        acc[date].score_soma += Number(d.score_conducao || 0);
        acc[date].alertas_total += Number(d.alertas_count || 0);
        acc[date].count += 1;
        return acc;
      },
      {} as Record<string, any>,
    ),
  )
    .map((d: any) => ({
      ...d,
      km_rodado: Number(Number(d.km_rodado).toFixed(2)),
      score_conducao: Math.round(d.score_soma / d.count),
      consumo_kml: d.consumo_count > 0 ? (d.consumo_soma / d.consumo_count).toFixed(1) : null,
      dataFormatada: new Date(d.data_referencia + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
    }))
    .sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));

  // Totais operacionais agregados
  const totalKm = Number(dadosGrafico.reduce((acc, d) => acc + d.km_rodado, 0).toFixed(2));
  const totalDirecaoMin = dadosGrafico.reduce(
    (acc, d) => acc + Number(d.tempo_direcao_minutos || 0),
    0,
  );
  const totalOciosoMin = dadosGrafico.reduce((acc, d) => acc + d.tempo_ocioso_minutos, 0);
  const maxVelocidade = Math.max(0, ...dadosGrafico.map((d) => d.vel_maxima_atingida));
  const avgScore =
    dadosGrafico.length > 0
      ? Math.round(dadosGrafico.reduce((acc, d) => acc + d.score_conducao, 0) / dadosGrafico.length)
      : totalKm === 0 && todosVeiculos.length > 0
        ? 100
        : 0;

  // --------------------------------------------------------------------------
  // FILTRAGEM E ORDENAÇÃO DINÂMICA DA ABA 1 (OPERACIONAL)
  // --------------------------------------------------------------------------
  const dadosOperacionaisFiltrados = useMemo(() => {
    let filtrados = [...dadosBaseOperacionais];

    if (filtroOperacionalKpi === "score_critico") {
      filtrados = filtrados.filter((d) => d.score_conducao < 75);
    } else if (filtroOperacionalKpi === "score_excelente") {
      filtrados = filtrados.filter((d) => d.score_conducao >= 90);
    } else if (filtroOperacionalKpi === "excesso_velocidade") {
      filtrados = filtrados.filter((d) => d.vel_maxima_atingida > 90);
    } else if (filtroOperacionalKpi === "com_direcao") {
      filtrados = filtrados.filter((d) => d.tempo_direcao_minutos > 0);
    } else if (filtroOperacionalKpi === "com_ociosidade") {
      filtrados = filtrados.filter((d) => d.tempo_ocioso_minutos > 0);
    }

    if (sortOperacional.campo && sortOperacional.direcao) {
      filtrados.sort((a: any, b: any) => {
        let valA = a[sortOperacional.campo!];
        let valB = b[sortOperacional.campo!];

        if (sortOperacional.campo === "consumo_kml") {
          valA = valA === null ? -1 : Number(valA);
          valB = valB === null ? -1 : Number(valB);
        } else if (typeof valA === "string") {
          return sortOperacional.direcao === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        const numA = Number(valA || 0);
        const numB = Number(valB || 0);
        return sortOperacional.direcao === "asc" ? numA - numB : numB - numA;
      });
    }

    return filtrados;
  }, [dadosBaseOperacionais, filtroOperacionalKpi, sortOperacional]);

  // --------------------------------------------------------------------------
  // DADOS DA ABA 2: CUSTOS E FINANCEIRO (TCO)
  // --------------------------------------------------------------------------
  const abastecimentosFiltrados = abastecimentos.filter((a) => {
    if (placaFiltro === "todos") return true;
    const v = todosVeiculos.find((veic) => veic.placa === placaFiltro);
    return v && a.veiculo_id === v.id;
  });

  const despesasFiltradas = despesas.filter((d) => {
    if (placaFiltro === "todos") return true;
    const v = todosVeiculos.find((veic) => veic.placa === placaFiltro);
    return v && d.veiculo_id === v.id;
  });

  const totalGastoCombustivel = abastecimentosFiltrados.reduce(
    (acc, a) => acc + Number(a.valor_total || 0),
    0,
  );
  const totalLitros = abastecimentosFiltrados.reduce((acc, a) => acc + Number(a.litros || 0), 0);
  const totalGastoManutencao = despesasFiltradas
    .filter((d) => d.categoria === "manutencao")
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);
  const totalOutrasDespesas = despesasFiltradas
    .filter((d) => d.categoria !== "manutencao")
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);
  const custoTotalOperacional = totalGastoCombustivel + totalGastoManutencao + totalOutrasDespesas;
  const custoPorKm = totalKm > 0 ? (custoTotalOperacional / totalKm).toFixed(2) : null;

  // Gráfico financeiro diário dentro do período selecionado
  const mapaFinanceiroDiario: Record<
    string,
    { data: string; combustivel: number; manutencao: number; outras: number }
  > = {};
  const cursorFin = new Date(dataInicio);
  cursorFin.setHours(0, 0, 0, 0);
  const limiteFin = new Date(dataFim);
  limiteFin.setHours(0, 0, 0, 0);
  while (cursorFin <= limiteFin) {
    const dataRef = cursorFin.toISOString().substring(0, 10);
    mapaFinanceiroDiario[dataRef] = {
      data: new Date(dataRef + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      combustivel: 0,
      manutencao: 0,
      outras: 0,
    };
    cursorFin.setDate(cursorFin.getDate() + 1);
  }
  for (const a of abastecimentosFiltrados) {
    if (mapaFinanceiroDiario[a.data_abastecimento]) {
      mapaFinanceiroDiario[a.data_abastecimento].combustivel += Number(a.valor_total || 0);
    }
  }
  for (const d of despesasFiltradas) {
    if (mapaFinanceiroDiario[d.data_despesa]) {
      if (d.categoria === "manutencao") {
        mapaFinanceiroDiario[d.data_despesa].manutencao += Number(d.valor || 0);
      } else {
        mapaFinanceiroDiario[d.data_despesa].outras += Number(d.valor || 0);
      }
    }
  }
  const dadosGraficoFinanceiro = Object.values(mapaFinanceiroDiario);

  const dadosPieCustos = [
    { name: "Combustível", valor: Number(totalGastoCombustivel.toFixed(2)), catKey: "combustivel" },
    { name: "Manutenções", valor: Number(totalGastoManutencao.toFixed(2)), catKey: "manutencao" },
    { name: "Outras Despesas", valor: Number(totalOutrasDespesas.toFixed(2)), catKey: "outras" },
  ].filter((item) => item.valor > 0);

  // Lista consolidada de lançamentos financeiros
  const itensFinanceirosConsolidados = useMemo(() => {
    const lista: ItemFinanceiroConsolidado[] = [];

    for (const a of abastecimentosFiltrados) {
      const v = todosVeiculos.find((veic) => veic.id === a.veiculo_id);
      lista.push({
        id: `abast-${a.id}`,
        data: a.data_abastecimento,
        tipoCategoria: "combustivel",
        categoriaLabel: `Combustível (${a.combustivel})`,
        veiculo_id: a.veiculo_id,
        placa: v?.placa || "—",
        marca_modelo: v?.marca_modelo || "",
        detalhamento: `${a.litros} L ${a.posto_nome ? `· ${a.posto_nome}` : ""}`,
        km_atual: a.km_atual,
        valor: Number(a.valor_total || 0),
      });
    }

    for (const d of despesasFiltradas) {
      const v = todosVeiculos.find((veic) => veic.id === d.veiculo_id);
      const cat = d.categoria === "manutencao" ? "manutencao" : "outras";
      lista.push({
        id: `desp-${d.id}`,
        data: d.data_despesa,
        tipoCategoria: cat,
        categoriaLabel: d.categoria,
        veiculo_id: d.veiculo_id,
        placa: v?.placa || "—",
        marca_modelo: v?.marca_modelo || "",
        detalhamento: d.descricao,
        km_atual: d.km_atual || null,
        valor: Number(d.valor || 0),
      });
    }

    let filtrados = lista;
    if (filtroFinanceiroCategoria !== "todas") {
      filtrados = filtrados.filter((item) => item.tipoCategoria === filtroFinanceiroCategoria);
    }

    if (sortFinanceiro.campo && sortFinanceiro.direcao) {
      filtrados.sort((a: any, b: any) => {
        const valA = a[sortFinanceiro.campo!];
        const valB = b[sortFinanceiro.campo!];
        if (typeof valA === "string") {
          return sortFinanceiro.direcao === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        const numA = Number(valA || 0);
        const numB = Number(valB || 0);
        return sortFinanceiro.direcao === "asc" ? numA - numB : numB - numA;
      });
    }

    return filtrados;
  }, [
    abastecimentosFiltrados,
    despesasFiltradas,
    todosVeiculos,
    filtroFinanceiroCategoria,
    sortFinanceiro,
  ]);

  // --------------------------------------------------------------------------
  // DADOS DA ABA 3: SEGURANÇA E ALERTAS
  // --------------------------------------------------------------------------
  const alertasFiltrados = alertas.filter((a) => {
    if (placaFiltro === "todos") return true;
    const v = todosVeiculos.find((veic) => veic.placa === placaFiltro);
    return v && a.veiculo_id === v.id;
  });
  const totalAlertas = alertasFiltrados.length;
  const alertasVelocidade = alertasFiltrados.filter(
    (a) => a.tipo.toLowerCase().includes("velocidade") || a.velocidade > 90,
  ).length;
  const taxaAlertas100Km = totalKm > 0 ? ((totalAlertas / totalKm) * 100).toFixed(1) : "0.0";

  const alertasTabelaFiltrados = useMemo(() => {
    let lista = [...alertasFiltrados];

    if (filtroSegurancaTipo === "velocidade") {
      lista = lista.filter((a) => a.tipo.toLowerCase().includes("velocidade") || a.velocidade > 90);
    } else if (
      filtroSegurancaTipo === "critica" ||
      filtroSegurancaTipo === "alta" ||
      filtroSegurancaTipo === "media" ||
      filtroSegurancaTipo === "baixa"
    ) {
      lista = lista.filter((a) => a.gravidade.toLowerCase() === filtroSegurancaTipo);
    }

    if (sortSeguranca.campo && sortSeguranca.direcao) {
      lista.sort((a: any, b: any) => {
        const valA = a[sortSeguranca.campo!];
        const valB = b[sortSeguranca.campo!];
        if (sortSeguranca.campo === "placa") {
          const vA = todosVeiculos.find((v) => v.id === a.veiculo_id)?.placa || "";
          const vB = todosVeiculos.find((v) => v.id === b.veiculo_id)?.placa || "";
          return sortSeguranca.direcao === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        if (typeof valA === "string") {
          return sortSeguranca.direcao === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        const numA = Number(valA || 0);
        const numB = Number(valB || 0);
        return sortSeguranca.direcao === "asc" ? numA - numB : numB - numA;
      });
    }

    return lista;
  }, [alertasFiltrados, filtroSegurancaTipo, sortSeguranca, todosVeiculos]);

  // --------------------------------------------------------------------------
  // DADOS DA ABA 4: SAÚDE DA FROTA E MANUTENÇÃO PREVENTIVA
  // --------------------------------------------------------------------------
  const manutencoesFiltradas = manutencoes.filter((m) => {
    if (placaFiltro === "todos") return true;
    const v = todosVeiculos.find((veic) => veic.placa === placaFiltro);
    return v && m.veiculo_id === v.id;
  });
  const itensEmDia = manutencoesFiltradas.filter((m) => m.status === "em_dia").length;
  const itensProximos = manutencoesFiltradas.filter((m) => m.status === "proxima").length;
  const itensVencidos = manutencoesFiltradas.filter((m) => m.status === "vencida").length;
  const totalItensManut = manutencoesFiltradas.length;
  const taxaConformidadeManut =
    totalItensManut > 0 ? Math.round((itensEmDia / totalItensManut) * 100) : 100;

  const manutencoesTabelaFiltradas = useMemo(() => {
    let lista = [...manutencoesFiltradas];

    if (filtroManutencaoStatus !== "todos") {
      lista = lista.filter((m) => m.status === filtroManutencaoStatus);
    }

    if (sortManutencao.campo && sortManutencao.direcao) {
      lista.sort((a: any, b: any) => {
        if (sortManutencao.campo === "placa") {
          const vA = todosVeiculos.find((v) => v.id === a.veiculo_id)?.placa || "";
          const vB = todosVeiculos.find((v) => v.id === b.veiculo_id)?.placa || "";
          return sortManutencao.direcao === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        if (sortManutencao.campo === "odometro_km") {
          const odoA = Number(todosVeiculos.find((v) => v.id === a.veiculo_id)?.odometro_km || 0);
          const odoB = Number(todosVeiculos.find((v) => v.id === b.veiculo_id)?.odometro_km || 0);
          return sortManutencao.direcao === "asc" ? odoA - odoB : odoB - odoA;
        }
        if (sortManutencao.campo === "kmRestante") {
          const odoA = Number(todosVeiculos.find((v) => v.id === a.veiculo_id)?.odometro_km || 0);
          const odoB = Number(todosVeiculos.find((v) => v.id === b.veiculo_id)?.odometro_km || 0);
          const restA = Number((a.proximo_km_alvo - odoA).toFixed(2));
          const restB = Number((b.proximo_km_alvo - odoB).toFixed(2));
          return sortManutencao.direcao === "asc" ? restA - restB : restB - restA;
        }
        const valA = a[sortManutencao.campo!];
        const valB = b[sortManutencao.campo!];
        if (typeof valA === "string") {
          return sortManutencao.direcao === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        const numA = Number(valA || 0);
        const numB = Number(valB || 0);
        return sortManutencao.direcao === "asc" ? numA - numB : numB - numA;
      });
    }

    return lista;
  }, [manutencoesFiltradas, filtroManutencaoStatus, sortManutencao, todosVeiculos]);

  // 4. Exportação do Dossiê Executivo Forense em PDF com Infográficos e Todas as Abas
  const handleExportarPDF = async () => {
    try {
      setExportandoPdf(true);
      toast.info("Compilando Dossiê Executivo Forense com infográficos e dados das 4 abas...");

      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF("p", "pt", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;

      // Helper para desenhar Cards de KPI Infográficos em vetor
      const desenharCardKpiPdf = (
        x: number,
        y: number,
        w: number,
        h: number,
        titulo: string,
        valor: string,
        subtitulo: string,
        corDestaque: [number, number, number],
      ) => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, w, h, 6, 6, "FD");

        doc.setFillColor(corDestaque[0], corDestaque[1], corDestaque[2]);
        doc.roundedRect(x, y, 4, h, 2, 2, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(titulo, x + 10, y + 14);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(valor, x + 10, y + 30);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(corDestaque[0], corDestaque[1], corDestaque[2]);
        doc.text(subtitulo, x + 10, y + 42);
      };

      // Helper para desenhar cabeçalho de seção executiva
      const desenharCabecalhoSecaoPdf = (
        y: number,
        titulo: string,
        cor: [number, number, number],
      ) => {
        doc.setFillColor(cor[0], cor[1], cor[2]);
        doc.roundedRect(margin, y, contentWidth, 22, 4, 4, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(255, 255, 255);
        doc.text(titulo.toUpperCase(), margin + 10, y + 15);
      };

      // Helper para desenhar Gráfico Vetorial de Barras de KM Diário
      const desenharGraficoBarrasKmPdf = (
        startX: number,
        startY: number,
        width: number,
        height: number,
      ) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(startX, startY, width, height, 6, 6, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text("Evolução Diária de Quilometragem Percorrida (KM)", startX + 12, startY + 14);

        if (dadosGrafico.length === 0) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text("Sem deslocamentos registrados no período.", startX + 12, startY + 40);
          return;
        }

        const maxKm = Math.max(10, ...dadosGrafico.map((d) => d.km_rodado));
        const chartInnerX = startX + 12;
        const chartInnerY = startY + 22;
        const chartInnerW = width - 24;
        const chartInnerH = height - 36;

        // Linhas guia de grade
        doc.setDrawColor(241, 245, 249);
        doc.line(chartInnerX, chartInnerY, chartInnerX + chartInnerW, chartInnerY);
        doc.line(
          chartInnerX,
          chartInnerY + chartInnerH / 2,
          chartInnerX + chartInnerW,
          chartInnerY + chartInnerH / 2,
        );
        doc.line(
          chartInnerX,
          chartInnerY + chartInnerH,
          chartInnerX + chartInnerW,
          chartInnerY + chartInnerH,
        );

        const numBarras = dadosGrafico.length;
        const larguraBarra = Math.min(22, Math.max(6, chartInnerW / numBarras - 4));
        const espacoTotal = chartInnerW / numBarras;

        dadosGrafico.forEach((d, idx) => {
          const barH = (d.km_rodado / maxKm) * chartInnerH;
          const barX = chartInnerX + idx * espacoTotal + (espacoTotal - larguraBarra) / 2;
          const barY = chartInnerY + chartInnerH - barH;

          doc.setFillColor(59, 130, 246);
          doc.roundedRect(barX, barY, larguraBarra, barH, 2, 2, "F");

          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(100, 116, 139);
          doc.text(d.dataFormatada, barX + larguraBarra / 2, chartInnerY + chartInnerH + 9, {
            align: "center",
          });

          if (d.km_rodado > 0) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6);
            doc.setTextColor(30, 41, 59);
            doc.text(
              formatarKm(d.km_rodado),
              barX + larguraBarra / 2,
              Math.max(chartInnerY + 8, barY - 2),
              { align: "center" },
            );
          }
        });
      };

      // Helper para desenhar Gráfico Vetorial de Composição Financeira TCO
      const desenharGraficoComposicaoCustosPdf = (
        startX: number,
        startY: number,
        width: number,
        height: number,
      ) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(startX, startY, width, height, 6, 6, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text("Composição e Rateio de Custos Operacionais TCO", startX + 12, startY + 14);

        if (custoTotalOperacional <= 0 || dadosPieCustos.length === 0) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text("Nenhum lançamento financeiro registrado no período.", startX + 12, startY + 36);
          return;
        }

        const barX = startX + 12;
        const barY = startY + 24;
        const barW = width - 24;
        const barH = 12;

        let curX = barX;
        dadosPieCustos.forEach((item, idx) => {
          const itemW = (item.valor / custoTotalOperacional) * barW;
          if (itemW > 0) {
            const cor = idx === 0 ? [245, 158, 11] : idx === 1 ? [139, 92, 246] : [59, 130, 246];
            doc.setFillColor(cor[0], cor[1], cor[2]);
            doc.rect(curX, barY, itemW, barH, "F");
            curX += itemW;
          }
        });

        // Legenda detalhada com percentuais
        let legX = barX;
        const legY = barY + 22;
        dadosPieCustos.forEach((item, idx) => {
          const perc = Math.round((item.valor / custoTotalOperacional) * 100);
          const cor = idx === 0 ? [245, 158, 11] : idx === 1 ? [139, 92, 246] : [59, 130, 246];
          doc.setFillColor(cor[0], cor[1], cor[2]);
          doc.circle(legX + 3, legY - 3, 3, "F");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);
          const texto = `${item.name}: R$ ${item.valor.toFixed(2)} (${perc}%)`;
          doc.text(texto, legX + 9, legY);
          legX += doc.getTextWidth(texto) + 18;
        });
      };

      // ───────────────────────────────────────────────────────────────────────
      // PÁGINA 1: CABEÇALHO EXECUTIVO E SEÇÃO 1 (OPERACIONAL E QUILOMETRAGEM)
      // ───────────────────────────────────────────────────────────────────────
      const logoBase64 = await carregarLogoEmblemaBase64();

      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 56, "F");

      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 53, pageWidth, 3, "F");

      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", margin, 5, 46, 46);
        } catch {
          // Fallback silencioso
        }
      }

      const offsetTextoX = logoBase64 ? margin + 54 : margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("DOSSIÊ EXECUTIVO DE TELEMETRIA E DESEMPENHO DA FROTA", offsetTextoX, 28);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`GD Rastreamento · ${APP_DOMINIO} · Emissão Oficial Autenticada`, offsetTextoX, 42);

      // Caixa de Metadados e Filtros Ativos
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, 66, contentWidth, 52, 6, 6, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`Cliente: ${nomeClienteAtual}`, margin + 12, 80);
      doc.text(
        `Veículo(s): ${placaFiltro === "todos" ? "Todos os Veículos da Frota" : placaFiltro}`,
        margin + 12,
        93,
      );
      doc.text(`Período de Análise: ${descricaoPeriodo}`, margin + 12, 106);

      const statusFiltroTexto = [
        ocultarSemDeslocamento
          ? "Apenas dias com deslocamento ativo"
          : "Todos os dias do calendário",
        filtroOperacionalKpi !== "todos" ? `Filtro KPI: ${filtroOperacionalKpi}` : null,
        filtroFinanceiroCategoria !== "todas"
          ? `Cat. Financeira: ${filtroFinanceiroCategoria}`
          : null,
        filtroSegurancaTipo !== "todos" ? `Severidade: ${filtroSegurancaTipo}` : null,
        filtroManutencaoStatus !== "todos" ? `Manutenção: ${filtroManutencaoStatus}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin + 280, 80);
      doc.text(
        `Emissor: ${session?.nome || "SuperADM"} (${session?.email || "novaes@oficial.tec.br"})`,
        margin + 280,
        93,
      );
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(`Filtros na Tela: ${statusFiltroTexto}`, margin + 280, 106);

      // Seção 1: Operacional
      desenharCabecalhoSecaoPdf(
        126,
        "Dimensão 1 · Operacional, Quilometragem e Condução",
        [30, 41, 59],
      );

      // 5 Cards de KPI Operacionais
      const cardW = (contentWidth - 24) / 5;
      desenharCardKpiPdf(
        margin,
        154,
        cardW,
        48,
        "DRIVER SCORE MÉDIO",
        `${avgScore} / 100`,
        avgScore >= 90
          ? "Condução Excelente"
          : avgScore >= 75
            ? "Condução Moderada"
            : "Atenção Necessária",
        [59, 130, 246],
      );
      desenharCardKpiPdf(
        margin + cardW + 6,
        154,
        cardW,
        48,
        "DISTÂNCIA TOTAL",
        formatarKm(totalKm),
        `${totalDiasOperacionais} dias com circulação`,
        [16, 185, 129],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 2,
        154,
        cardW,
        48,
        "TEMPO DE DIREÇÃO",
        formatarMinutos(totalDirecaoMin),
        "Soma de todos os ciclos",
        [37, 99, 235],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 3,
        154,
        cardW,
        48,
        "VELOCIDADE MÁXIMA",
        `${maxVelocidade} km/h`,
        "Pico apurado em viagem",
        [245, 158, 11],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 4,
        154,
        cardW,
        48,
        "TEMPO OCIOSO REAL",
        formatarMinutos(totalOciosoMin),
        "Motor ligado sem deslocar",
        [139, 92, 246],
      );

      // Gráfico Vetorial de Barras de KM Diário
      desenharGraficoBarrasKmPdf(margin, 208, contentWidth, 74);

      // Tabela de Dados Operacionais Exatos da Tela
      const rowsOperacional = dadosOperacionaisFiltrados.map((d) => [
        d.placa,
        new Date(d.data_referencia + "T00:00:00").toLocaleDateString("pt-BR"),
        formatarKm(d.km_rodado),
        formatarMinutos(d.tempo_direcao_minutos),
        `${d.vel_maxima_atingida} km/h`,
        formatarMinutos(d.tempo_ocioso_minutos),
        d.consumo_kml !== null ? `${d.consumo_kml} km/l` : "Dados insuficientes",
        d.alertas_count || 0,
        `${d.score_conducao} pts`,
      ]);

      autoTable(doc, {
        startY: 288,
        theme: "striped",
        styles: { fontSize: 7, font: "helvetica", cellPadding: 3.5 },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
        head: [
          [
            "PLACA",
            "DATA",
            "DISTÂNCIA",
            "TEMPO DIREÇÃO",
            "VEL. MÁX",
            "OCIOSO REAL",
            "CONSUMO REAL",
            "ALERTAS",
            "SCORE",
          ],
        ],
        body:
          rowsOperacional.length > 0
            ? rowsOperacional
            : [
                [
                  "—",
                  "Nenhum registro correspondente ao filtro ativo",
                  "—",
                  "—",
                  "—",
                  "—",
                  "—",
                  "—",
                ],
              ],
        margin: { left: margin, right: margin },
      });

      // ───────────────────────────────────────────────────────────────────────
      // PÁGINA 2: SEÇÃO 2 (CUSTOS E FINANCEIRO TCO)
      // ───────────────────────────────────────────────────────────────────────
      doc.addPage();

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 42, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("GESTÃO FINANCEIRA E TOTAL COST OF OWNERSHIP (TCO)", margin, 26);

      desenharCabecalhoSecaoPdf(
        52,
        "Dimensão 2 · Custos Operacionais e Rateio por KM",
        [5, 150, 105],
      );

      desenharCardKpiPdf(
        margin,
        80,
        cardW,
        48,
        "CUSTO TOTAL (TCO)",
        `R$ ${custoTotalOperacional.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "Combustível e Oficinas",
        [16, 185, 129],
      );
      desenharCardKpiPdf(
        margin + cardW + 6,
        80,
        cardW,
        48,
        "CUSTO REAL POR KM",
        custoPorKm ? `R$ ${custoPorKm} / km` : "—",
        "Média sobre KM real",
        [59, 130, 246],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 2,
        80,
        cardW,
        48,
        "COMBUSTÍVEL",
        `R$ ${totalGastoCombustivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `${totalLitros.toFixed(1)} L abastecidos`,
        [245, 158, 11],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 3,
        80,
        cardW,
        48,
        "MANUTENÇÕES",
        `R$ ${totalGastoManutencao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "Peças e Serviços",
        [139, 92, 246],
      );

      // Gráfico Vetorial de Composição Financeira
      desenharGraficoComposicaoCustosPdf(margin, 134, contentWidth, 54);

      // Tabela Consolidada de Lançamentos Financeiros Exatos da Tela
      const rowsFinanceiro = itensFinanceirosConsolidados.map((item) => [
        new Date(item.data + "T00:00:00").toLocaleDateString("pt-BR"),
        item.categoriaLabel,
        item.placa,
        item.detalhamento,
        item.km_atual ? formatarKm(item.km_atual) : "—",
        `R$ ${item.valor.toFixed(2)}`,
      ]);

      autoTable(doc, {
        startY: 196,
        theme: "striped",
        styles: { fontSize: 7, font: "helvetica", cellPadding: 3.5 },
        headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: "bold" },
        head: [["DATA", "CATEGORIA", "VEÍCULO", "DETALHAMENTO", "ODÔMETRO", "VALOR TOTAL"]],
        body:
          rowsFinanceiro.length > 0
            ? rowsFinanceiro
            : [["—", "Nenhum lançamento correspondente ao filtro ativo", "—", "—", "—", "—"]],
        margin: { left: margin, right: margin },
      });

      // ───────────────────────────────────────────────────────────────────────
      // PÁGINA 3: SEÇÃO 3 (SEGURANÇA E ALERTAS) E SEÇÃO 4 (MANUTENÇÃO PREVENTIVA)
      // ───────────────────────────────────────────────────────────────────────
      doc.addPage();

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 42, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("SEGURANÇA, TELEMETRIA DE ALERTAS E SAÚDE DA FROTA", margin, 26);

      // Seção 3: Segurança
      desenharCabecalhoSecaoPdf(
        52,
        "Dimensão 3 · Trilha Forense de Segurança e Infrações",
        [217, 119, 6],
      );

      desenharCardKpiPdf(
        margin,
        80,
        cardW,
        48,
        "TOTAL DE ALERTAS",
        `${totalAlertas}`,
        "Eventos no período",
        [245, 158, 11],
      );
      desenharCardKpiPdf(
        margin + cardW + 6,
        80,
        cardW,
        48,
        "EXCESSOS VELOCIDADE",
        `${alertasVelocidade}`,
        "Acima de 90 km/h",
        [225, 29, 72],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 2,
        80,
        cardW,
        48,
        "TAXA POR 100 KM",
        `${taxaAlertas100Km}`,
        "Alertas / 100 km",
        [139, 92, 246],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 3,
        80,
        cardW,
        48,
        "CLASSIFICAÇÃO DE RISCO",
        totalAlertas === 0 ? "Baixo" : totalAlertas <= 5 ? "Moderado" : "Alto",
        "Histórico de condução",
        [16, 185, 129],
      );

      const rowsAlertas = alertasTabelaFiltrados.map((al) => {
        const v = todosVeiculos.find((veic) => veic.id === al.veiculo_id);
        return [
          new Date(al.created_at).toLocaleString("pt-BR"),
          v?.placa || "—",
          al.tipo.replace(/_/g, " ").toUpperCase(),
          al.velocidade > 0 ? `${al.velocidade} km/h` : "—",
          al.gravidade.toUpperCase(),
          al.detalhes,
        ];
      });

      autoTable(doc, {
        startY: 134,
        theme: "striped",
        styles: { fontSize: 7, font: "helvetica", cellPadding: 3.5 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: "bold" },
        head: [
          ["DATA E HORA", "VEÍCULO", "TIPO DE ALERTA", "VELOCIDADE", "GRAVIDADE", "DETALHAMENTO"],
        ],
        body:
          rowsAlertas.length > 0
            ? rowsAlertas
            : [["—", "Nenhum alerta registrado para o filtro ativo", "—", "—", "—", "—"]],
        margin: { left: margin, right: margin },
      });

      // Seção 4: Manutenção Preventiva
      let startYManut = (doc as any).lastAutoTable.finalY + 16;
      if (startYManut > 540) {
        doc.addPage();
        startYManut = 50;
      }

      desenharCabecalhoSecaoPdf(
        startYManut,
        "Dimensão 4 · Saúde da Frota e Plano de Manutenção Preventiva",
        [124, 58, 237],
      );

      desenharCardKpiPdf(
        margin,
        startYManut + 28,
        cardW,
        48,
        "CONFORMIDADE",
        `${taxaConformidadeManut}%`,
        "Itens revisados no prazo",
        [124, 58, 237],
      );
      desenharCardKpiPdf(
        margin + cardW + 6,
        startYManut + 28,
        cardW,
        48,
        "RIGOROSAMENTE EM DIA",
        `${itensEmDia}`,
        "Odômetro regular",
        [16, 185, 129],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 2,
        startYManut + 28,
        cardW,
        48,
        "PRÓXIMAS DA REVISÃO",
        `${itensProximos}`,
        "< 1.000 km do limite",
        [245, 158, 11],
      );
      desenharCardKpiPdf(
        margin + (cardW + 6) * 3,
        startYManut + 28,
        cardW,
        48,
        "VENCIDAS / ATRASADAS",
        `${itensVencidos}`,
        itensVencidos > 0 ? "Ação Imediata" : "100% OK",
        [225, 29, 72],
      );

      const rowsManut = manutencoesTabelaFiltradas.map((m) => {
        const v = todosVeiculos.find((veic) => veic.id === m.veiculo_id);
        const odoAtual = Number(v?.odometro_km || 0);
        const kmRest = Number((m.proximo_km_alvo - odoAtual).toFixed(2));
        return [
          v?.placa || "—",
          m.item_manutencao,
          formatarKm(m.ultimo_km_realizado),
          formatarKm(odoAtual),
          formatarKm(m.proximo_km_alvo),
          kmRest < 0
            ? `Vencido por ${formatarKm(Math.abs(kmRest))}`
            : `${formatarKm(kmRest)} restantes`,
          m.status === "em_dia" ? "Em dia" : m.status === "proxima" ? "Próxima" : "VENCIDA",
        ];
      });

      autoTable(doc, {
        startY: startYManut + 82,
        theme: "grid",
        styles: { fontSize: 7, font: "helvetica", cellPadding: 3.5 },
        headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: "bold" },
        head: [
          [
            "VEÍCULO",
            "COMPONENTE",
            "ÚLT. REALIZADA",
            "ODÔMETRO ATUAL",
            "PRÓXIMO ALVO",
            "KM RESTANTE",
            "STATUS",
          ],
        ],
        body:
          rowsManut.length > 0
            ? rowsManut
            : [["—", "Nenhum plano cadastrado", "—", "—", "—", "—", "—"]],
        margin: { left: margin, right: margin },
      });

      // ───────────────────────────────────────────────────────────────────────
      // RODAPÉ FORENSE EM TODAS AS PÁGINAS COM HASH SHA-256 E NUMERAÇÃO
      // ───────────────────────────────────────────────────────────────────────
      const pdfBytes = doc.output("arraybuffer");
      const sha256 = await calcularSha256Buffer(pdfBytes);

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, 816, pageWidth - margin, 816);

        doc.setFontSize(6.5);
        doc.setFont("courier", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(
          `GD Rastreamento · ${APP_DOMINIO} · Hash Forense SHA-256: ${sha256} · Página ${i} de ${totalPages}`,
          margin,
          826,
        );
      }

      // Registro no banco de dados para conferência pública
      await registrarDocumentoEmitido({
        nome_arquivo: `Dossie_Frota_${placaFiltro}_${new Date().toISOString().substring(0, 10)}.pdf`,
        hash_sha256: sha256,
        tipo_documento: "relatorio_frota",
        descricao: `Dossiê Executivo de Frota - ${nomeClienteAtual}`,
        emissor_nome: session?.nome || "SuperADM",
        emissor_email: session?.email || "novaes@oficial.tec.br",
        tamanho_bytes: pdfBytes.byteLength,
        metadata: {
          periodo_dias: periodo,
          total_km: totalKm,
          tco_total: custoTotalOperacional,
          custo_por_km: custoPorKm,
          score_medio: avgScore,
          veiculos_analisados: veiculosDisponiveis.length,
          versao_emissor: APP_VERSION_NUMERO,
          filtros_ativos: statusFiltroTexto,
        },
      });

      doc.save(
        `Dossie_Executivo_Frota_${placaFiltro}_${new Date().toISOString().substring(0, 10)}.pdf`,
      );
      toast.success(
        "Dossiê Executivo Forense da Frota exportado com infográficos e dados das 4 abas!",
      );
    } catch (err) {
      console.error("[FrotaAnalytics] Falha ao exportar PDF:", err);
      toast.error("Erro ao gerar PDF forense.");
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. CABEÇALHO EXECUTIVO E CONTROLES DE FILTRO                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Desempenho da Frota e Telemetria Corporativa
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
              Corporativo e TCO
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Inteligência operacional, custos reais por KM, ociosidade com ignição ligada,
            conformidade mecânica e alertas (todos os infográficos e cabeçalhos são filtros ativos)
          </p>
        </div>

        {/* Seletores e Ações */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Cliente (Administrador) */}
          {ehAdminOuOperador && (
            <div className="flex items-center gap-2 bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={clienteSelecionadoId}
                onChange={(e) => {
                  const val = e.target.value;
                  setClienteSelecionadoId(val);
                  if (val === "todos") {
                    setNomeClienteAtual("Todos os Clientes");
                  } else {
                    const c = clientesDisponiveis.find((cli) => cli.id === val);
                    setNomeClienteAtual(c?.nome_razao_social || "Cliente");
                  }
                  setPlacaFiltro("todos");
                }}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none max-w-[180px] sm:max-w-[220px] truncate"
              >
                <option value="todos">Todos os Clientes (Geral)</option>
                {clientesDisponiveis.map((c) => (
                  <option key={c.id} value={c.id} className="dark:bg-slate-900">
                    {c.nome_razao_social}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Veículo */}
          <select
            value={placaFiltro}
            onChange={(e) => setPlacaFiltro(e.target.value)}
            className="bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 text-xs font-bold rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 outline-none shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] uppercase"
          >
            <option value="todos">
              {veiculosDisponiveis.length > 0
                ? `Todos os Veículos (${veiculosDisponiveis.length})`
                : "Todos os Veículos"}
            </option>
            {veiculosDisponiveis.map((placa) => {
              const info = todosVeiculos.find((v) => v.placa === placa);
              return (
                <option key={placa} value={placa}>
                  {placa} {info?.marca_modelo ? `• ${info.marca_modelo}` : ""}
                </option>
              );
            })}
          </select>

          {/* Seletor de Período Dinâmico (Rápido, Dia Específico, Mês/Ano) */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 text-xs font-bold shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
            {/* Atalhos Rápidos */}
            <button
              onClick={() => {
                setFiltroModo("rapido");
                setPeriodoRapido(1);
              }}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                filtroModo === "rapido" && periodoRapido === 1
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => {
                setFiltroModo("rapido");
                setPeriodoRapido(7);
              }}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                filtroModo === "rapido" && periodoRapido === 7
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              7 dias
            </button>
            <button
              onClick={() => {
                setFiltroModo("rapido");
                setPeriodoRapido(15);
              }}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                filtroModo === "rapido" && periodoRapido === 15
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              15 dias
            </button>
            <button
              onClick={() => {
                setFiltroModo("rapido");
                setPeriodoRapido(30);
              }}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                filtroModo === "rapido" && periodoRapido === 30
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              30 dias
            </button>

            {/* Separador */}
            <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-0.5" />

            {/* Filtro por Dia Específico */}
            <button
              onClick={() => setFiltroModo("dia")}
              className={`px-2.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                filtroModo === "dia"
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Filtrar por data exata (digite ou selecione dia, mês e ano)"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Por Dia</span>
            </button>

            {/* Filtro por Mês e Ano Específico */}
            <button
              onClick={() => setFiltroModo("mes")}
              className={`px-2.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                filtroModo === "mes"
                  ? "bg-blue-600 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8]"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
              title="Filtrar por mês e ano específico"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Por Mês</span>
            </button>

            {/* Controles Dinâmicos de Data e Mês/Ano */}
            {filtroModo === "dia" && (
              <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-300 dark:border-slate-700">
                <input
                  type="date"
                  value={dataDiaFiltro}
                  onChange={(e) => setDataDiaFiltro(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono outline-none shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] focus:ring-1 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            )}

            {filtroModo === "mes" && (
              <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-300 dark:border-slate-700">
                <select
                  value={mesFiltro}
                  onChange={(e) => setMesFiltro(Number(e.target.value))}
                  className="px-2 py-1 text-xs rounded-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold outline-none shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {NOMES_MESES.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
                <select
                  value={anoFiltro}
                  onChange={(e) => setAnoFiltro(Number(e.target.value))}
                  className="px-2 py-1 text-xs rounded-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-mono outline-none shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {ANOS_FILTRO.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Botão de Exportação em PDF */}
          <button
            onClick={handleExportarPDF}
            disabled={loading || exportandoPdf || dadosGrafico.length === 0}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl px-3.5 py-2 transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#1d4ed8] cursor-pointer"
            title="Exportar Dossiê Executivo Forense em PDF"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{exportandoPdf ? "Registrando..." : "Relatório PDF"}</span>
          </button>

          {/* Botão Atualizar */}
          <button
            onClick={carregarDados}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-800 hover:bg-[#dfe7f2] dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#c8d4e4] cursor-pointer"
            title="Atualizar dados de telemetria"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. BARRA DE ABAS ANALÍTICAS EXECUTIVAS                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setAbaAtiva("operacional")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              abaAtiva === "operacional"
                ? "bg-[#eaf0f8] dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Operacional e Quilometragem</span>
          </button>

          <button
            onClick={() => setAbaAtiva("financeiro")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              abaAtiva === "financeiro"
                ? "bg-[#eaf0f8] dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <DollarSign className="h-4 w-4" />
            <span>Custos e Financeiro (TCO)</span>
          </button>

          <button
            onClick={() => setAbaAtiva("seguranca")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              abaAtiva === "seguranca"
                ? "bg-[#eaf0f8] dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Segurança e Alertas ({totalAlertas})</span>
          </button>

          <button
            onClick={() => setAbaAtiva("manutencao")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              abaAtiva === "manutencao"
                ? "bg-[#eaf0f8] dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Wrench className="h-4 w-4" />
            <span>
              Saúde da Frota{" "}
              {itensVencidos > 0 ? (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-600 text-[10px] font-black">
                  {itensVencidos} VENCIDAS
                </span>
              ) : (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-600 text-[10px] font-black">
                  100% OK
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Toggle Anti-Ruído: Ocultar dias sem deslocamento */}
        {abaAtiva === "operacional" && (
          <label className="flex items-center gap-2 cursor-pointer px-3 py-1 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
            <input
              type="checkbox"
              checked={ocultarSemDeslocamento}
              onChange={(e) => setOcultarSemDeslocamento(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span>
              Ocultar dias sem deslocamento ({totalDiasOperacionais} de {totalDiasDisponiveis} dias)
            </span>
          </label>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. CONTEÚDO PRINCIPAL DAS ABAS                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="h-80 flex flex-col items-center justify-center space-y-3 bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 animate-pulse">
            Processando dados analíticos e telemetria da frota...
          </p>
        </div>
      ) : (
        <>
          {/* =============================================================== */}
          {/* ABA 1: OPERACIONAL E QUILOMETRAGEM                              */}
          {/* =============================================================== */}
          {abaAtiva === "operacional" && (
            <div className="space-y-6">
              {/* CARDS DE KPIS OPERACIONAIS - ATIVOS COMO FILTRO */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* KPI 1: SCORE */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(59, 130, 246, 0.35)"
                  onClick={() =>
                    setFiltroOperacionalKpi((prev) =>
                      prev === "score_critico"
                        ? "score_excelente"
                        : prev === "score_excelente"
                          ? "todos"
                          : "score_critico",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroOperacionalKpi === "score_critico" ||
                    filtroOperacionalKpi === "score_excelente"
                      ? "bg-blue-50/80 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para alternar filtro entre Condução Crítica (<75) e Excelente (>=90)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Driver Score Médio
                      <Filter className="h-3 w-3 text-blue-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Activity className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {avgScore}
                    </span>
                    <span className="text-xs font-bold text-slate-400">/ 100</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold truncate">
                      {avgScore >= 90
                        ? "Condução excelente"
                        : avgScore >= 75
                          ? "Condução moderada"
                          : "Atenção necessária"}
                    </p>
                    {filtroOperacionalKpi === "score_critico" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600">
                        Score &lt; 75
                      </span>
                    )}
                    {filtroOperacionalKpi === "score_excelente" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600">
                        Score &gt;= 90
                      </span>
                    )}
                  </div>
                </TiltCard>

                {/* KPI 2: DISTÂNCIA TOTAL */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(16, 185, 129, 0.35)"
                  onClick={() => {
                    setOcultarSemDeslocamento((prev) => !prev);
                  }}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    ocultarSemDeslocamento
                      ? "bg-orange-50/80 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para alternar entre exibir apenas dias com circulação ou todos os dias"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Distância Total
                      <Filter className="h-3 w-3 text-orange-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {totalKm.toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-bold text-slate-400">km</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      {totalDiasOperacionais} dias com circulação ativa
                    </p>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600">
                      {ocultarSemDeslocamento ? "Filtro Ativo" : "Todos os Dias"}
                    </span>
                  </div>
                </TiltCard>

                {/* KPI 3: TEMPO TOTAL DE DIREÇÃO */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(59, 130, 246, 0.35)"
                  onClick={() =>
                    setFiltroOperacionalKpi((prev) =>
                      prev === "com_direcao" ? "todos" : "com_direcao",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroOperacionalKpi === "com_direcao"
                      ? "bg-blue-50/80 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar dias com tempo de direção registrado (soma de todos os ciclos de condução)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Tempo de Direção
                      <Filter className="h-3 w-3 text-blue-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Timer className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {formatarMinutos(totalDirecaoMin)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Soma de todos os ciclos
                    </p>
                    {filtroOperacionalKpi === "com_direcao" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">
                        Direção &gt; 0
                      </span>
                    )}
                  </div>
                </TiltCard>

                {/* KPI 4: VELOCIDADE MÁXIMA */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() =>
                    setFiltroOperacionalKpi((prev) =>
                      prev === "excesso_velocidade" ? "todos" : "excesso_velocidade",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroOperacionalKpi === "excesso_velocidade"
                      ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar dias com excesso de velocidade (> 90 km/h)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Pico de Velocidade
                      <Filter className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Zap className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {maxVelocidade}
                    </span>
                    <span className="text-xs font-bold text-slate-400">km/h</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Pico máximo apurado em trajeto
                    </p>
                    {filtroOperacionalKpi === "excesso_velocidade" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        &gt; 90 km/h
                      </span>
                    )}
                  </div>
                </TiltCard>

                {/* KPI 5: TEMPO OCIOSO REAL */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(168, 85, 247, 0.35)"
                  onClick={() =>
                    setFiltroOperacionalKpi((prev) =>
                      prev === "com_ociosidade" ? "todos" : "com_ociosidade",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroOperacionalKpi === "com_ociosidade"
                      ? "bg-purple-50/80 dark:bg-purple-950/30 border-purple-500 ring-2 ring-purple-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar dias com tempo ocioso registrado (motor ligado sem deslocar)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Tempo Ocioso Real
                      <Filter className="h-3 w-3 text-purple-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Clock className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {formatarMinutos(totalOciosoMin)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Ignição ligada sem deslocamento
                    </p>
                    {filtroOperacionalKpi === "com_ociosidade" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600">
                        Ocioso &gt; 0
                      </span>
                    )}
                  </div>
                </TiltCard>
              </div>

              {/* BARRA DE AVISO DE FILTRO ATIVO POR INFOGRÁFICO */}
              {filtroOperacionalKpi !== "todos" && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs text-blue-900 dark:text-blue-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold">
                      Filtro ativo por infográfico:{" "}
                      <strong className="uppercase">
                        {filtroOperacionalKpi === "score_critico"
                          ? "Score Crítico (< 75)"
                          : filtroOperacionalKpi === "score_excelente"
                            ? "Score Excelente (>= 90)"
                            : filtroOperacionalKpi === "excesso_velocidade"
                              ? "Excesso de Velocidade (> 90 km/h)"
                              : filtroOperacionalKpi === "com_direcao"
                                ? "Com Tempo de Direção Ativo"
                                : "Com Ociosidade de Motor"}
                      </strong>{" "}
                      ({dadosOperacionaisFiltrados.length} registros correspondentes)
                    </span>
                  </div>
                  <button
                    onClick={() => setFiltroOperacionalKpi("todos")}
                    className="flex items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline px-2 py-0.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Limpar Filtro</span>
                  </button>
                </div>
              )}

              {/* GRÁFICOS OPERACIONAIS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* GRÁFICO 1: EVOLUÇÃO DE KM DIÁRIO */}
                <div className="bg-[#eaf0f8] dark:bg-slate-900 p-5 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Quilometragem Diária Percorrida (KM)
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="dataFormatada"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <RechartsTooltip
                          formatter={(valor: any) => [
                            Number(valor || 0).toLocaleString("pt-BR", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            }),
                            "KM Rodados",
                          ]}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderRadius: "12px",
                            border: "1px solid #334155",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Bar
                          dataKey="km_rodado"
                          name="KM Rodados"
                          fill="#3b82f6"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* GRÁFICO 2: SCORE VS VELOCIDADE */}
                <div className="bg-[#eaf0f8] dark:bg-slate-900 p-5 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
                    <Activity className="h-4 w-4 text-orange-500" />
                    Score de Condução e Velocidade Máxima
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dadosGrafico}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="dataFormatada"
                          stroke="#94a3b8"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderRadius: "12px",
                            border: "1px solid #334155",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                        <Line
                          type="monotone"
                          dataKey="score_conducao"
                          name="Score Condução"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="vel_maxima_atingida"
                          name="Vel. Máxima (km/h)"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* TABELA DE REGISTROS DIÁRIOS OPERACIONAIS COM ORDENAÇÃO BIDIRECIONAL */}
              <div className="bg-[#eaf0f8] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                <div className="p-4 sm:p-5 border-b border-slate-300/40 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Car className="h-4 w-4 text-blue-500" />
                    Telemetria Operacional por Veículo ({dadosOperacionaisFiltrados.length}{" "}
                    registros)
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Clique em qualquer cabeçalho para ordenar
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#eaf0f8] dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-300/60 dark:border-slate-800">
                      <tr>
                        <CabecalhoOrdenavel
                          titulo="Veículo / Placa"
                          campo="placa"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Data"
                          campo="data_referencia"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Distância (KM)"
                          campo="km_rodado"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Tempo de Direção"
                          campo="tempo_direcao_minutos"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Vel. Máxima"
                          campo="vel_maxima_atingida"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Tempo Ocioso Real"
                          campo="tempo_ocioso_minutos"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Consumo Real"
                          campo="consumo_kml"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Alertas"
                          campo="alertas_count"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Score"
                          campo="score_conducao"
                          campoAtivo={sortOperacional.campo}
                          direcao={sortOperacional.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortOperacional, setSortOperacional)
                          }
                          alinhamento="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                      {dadosOperacionaisFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-500 italic">
                            Nenhum registro encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        dadosOperacionaisFiltrados.map((d, index) => {
                          const dataFormatada = new Date(
                            d.data_referencia + "T00:00:00",
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          });
                          return (
                            <tr
                              key={`${d.veiculo_id}-${d.data_referencia}-${index}`}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                            >
                              <td className="px-4 py-3">
                                <span className="font-bold text-slate-900 dark:text-white uppercase mr-1.5">
                                  {d.placa}
                                </span>
                                <span className="text-[11px] text-slate-400">{d.marca_modelo}</span>
                              </td>
                              <td className="px-4 py-3">{dataFormatada}</td>
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                {formatarKm(d.km_rodado)}
                              </td>
                              <td
                                className="px-4 py-3 font-mono font-semibold text-blue-600 dark:text-blue-400"
                                title="Tempo gasto dirigindo por dia (soma de todos os ciclos de condução)"
                              >
                                {formatarMinutos(d.tempo_direcao_minutos)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    d.vel_maxima_atingida > 90
                                      ? "text-rose-500 font-bold"
                                      : "text-slate-700 dark:text-slate-300"
                                  }
                                >
                                  {d.vel_maxima_atingida} km/h
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono">
                                {formatarMinutos(d.tempo_ocioso_minutos)}
                              </td>
                              <td className="px-4 py-3">
                                {d.consumo_kml !== null && d.consumo_kml !== undefined ? (
                                  <span className="font-bold text-slate-900 dark:text-slate-100">
                                    {d.consumo_kml} km/l
                                  </span>
                                ) : (
                                  <span
                                    className="text-[11px] text-slate-400 dark:text-slate-500 font-medium italic"
                                    title="Aguardando registros consecutivos de abastecimento com odômetro"
                                  >
                                    Dados insuficientes
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {d.alertas_count && d.alertas_count > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                    {d.alertas_count} alerta{d.alertas_count > 1 ? "s" : ""}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-medium">0</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    d.score_conducao >= 90
                                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                                      : d.score_conducao >= 75
                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  }`}
                                >
                                  {d.score_conducao} pts
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 2: CUSTOS E FINANCEIRO (TCO)                                */}
          {/* =============================================================== */}
          {abaAtiva === "financeiro" && (
            <div className="space-y-6">
              {/* CARDS FINANCEIROS DE TCO - ATIVOS COMO FILTRO */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CARD 1: CUSTO TOTAL */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(16, 185, 129, 0.35)"
                  onClick={() => setFiltroFinanceiroCategoria("todas")}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroFinanceiroCategoria === "todas"
                      ? "bg-orange-50/80 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para exibir todos os lançamentos de custos"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Custo Total Operacional (TCO)
                      <Filter className="h-3 w-3 text-orange-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <DollarSign className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    R$ {custoTotalOperacional.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Combustível, oficinas e despesas
                    </p>
                    {filtroFinanceiroCategoria === "todas" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600">
                        Todos
                      </span>
                    )}
                  </div>
                </TiltCard>

                {/* CARD 2: CUSTO POR KM */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(59, 130, 246, 0.35)"
                  className="bg-[#eaf0f8] dark:bg-slate-900 p-5 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  title="Custo unitário real apurado sobre quilometragem rodada"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold">Custo Real por KM</span>
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                    {custoPorKm ? `R$ ${custoPorKm}` : "—"}
                    {custoPorKm ? (
                      <span className="text-xs font-bold text-slate-400 ml-1">/ km</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    {custoPorKm
                      ? "Média apurada sobre quilometragem real"
                      : "Aguardando deslocamento com custos"}
                  </p>
                </TiltCard>

                {/* CARD 3: COMBUSTÍVEL */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() =>
                    setFiltroFinanceiroCategoria((prev) =>
                      prev === "combustivel" ? "todas" : "combustivel",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroFinanceiroCategoria === "combustivel"
                      ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas lançamentos de Combustível"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Gastos com Combustível
                      <Filter className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Fuel className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    R$ {totalGastoCombustivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      {totalLitros.toFixed(1)} litros abastecidos
                    </p>
                    {filtroFinanceiroCategoria === "combustivel" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        Ativo
                      </span>
                    )}
                  </div>
                </TiltCard>

                {/* CARD 4: MANUTENÇÃO */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(168, 85, 247, 0.35)"
                  onClick={() =>
                    setFiltroFinanceiroCategoria((prev) =>
                      prev === "manutencao" ? "todas" : "manutencao",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroFinanceiroCategoria === "manutencao"
                      ? "bg-purple-50/80 dark:bg-purple-950/30 border-purple-500 ring-2 ring-purple-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas lançamentos de Manutenção"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Gastos com Manutenções
                      <Filter className="h-3 w-3 text-purple-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Wrench className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    R$ {totalGastoManutencao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Peças, revisões e serviços
                    </p>
                    {filtroFinanceiroCategoria === "manutencao" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600">
                        Ativo
                      </span>
                    )}
                  </div>
                </TiltCard>
              </div>

              {/* BARRA DE AVISO DE FILTRO ATIVO POR CATEGORIA */}
              {filtroFinanceiroCategoria !== "todas" && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 dark:bg-orange-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-900 dark:text-orange-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-orange-600" />
                    <span className="font-semibold">
                      Filtro ativo por infográfico: Categoria{" "}
                      <strong className="uppercase">{filtroFinanceiroCategoria}</strong> (
                      {itensFinanceirosConsolidados.length} lançamentos)
                    </span>
                  </div>
                  <button
                    onClick={() => setFiltroFinanceiroCategoria("todas")}
                    className="flex items-center gap-1 font-bold text-orange-700 dark:text-orange-300 hover:underline px-2 py-0.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Limpar Filtro</span>
                  </button>
                </div>
              )}

              {/* GRÁFICOS FINANCEIROS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* EVOLUÇÃO DIÁRIA DE CUSTOS */}
                <div className="lg:col-span-2 bg-[#eaf0f8] dark:bg-slate-900 p-5 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2 mb-4">
                    <BarChart3 className="h-4 w-4 text-orange-500" />
                    Evolução Diária de Despesas da Frota (R$)
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosGraficoFinanceiro}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="data" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <RechartsTooltip
                          formatter={(valor: any) => [`R$ ${Number(valor).toFixed(2)}`, ""]}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderRadius: "12px",
                            border: "1px solid #334155",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                        <Bar
                          dataKey="combustivel"
                          name="Combustível"
                          fill="#f59e0b"
                          stackId="a"
                          radius={[0, 0, 0, 0]}
                          onClick={() => setFiltroFinanceiroCategoria("combustivel")}
                          className="cursor-pointer"
                        />
                        <Bar
                          dataKey="manutencao"
                          name="Manutenção"
                          fill="#8b5cf6"
                          stackId="a"
                          radius={[0, 0, 0, 0]}
                          onClick={() => setFiltroFinanceiroCategoria("manutencao")}
                          className="cursor-pointer"
                        />
                        <Bar
                          dataKey="outras"
                          name="Outras Despesas"
                          fill="#3b82f6"
                          stackId="a"
                          radius={[6, 6, 0, 0]}
                          onClick={() => setFiltroFinanceiroCategoria("outras")}
                          className="cursor-pointer"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* COMPOSIÇÃO DE CUSTOS (DONUT INTERATIVO COMO FILTRO) */}
                <div className="bg-[#eaf0f8] dark:bg-slate-900 p-5 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                      <PieIcon className="h-4 w-4 text-blue-500" />
                      Distribuição de Custos
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Clique para filtrar
                    </span>
                  </div>
                  <div className="h-52 w-full flex items-center justify-center">
                    {dadosPieCustos.length === 0 ? (
                      <div className="text-center text-xs text-slate-400">
                        Nenhum custo registrado no período
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dadosPieCustos}
                            dataKey="valor"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={4}
                            className="cursor-pointer"
                            onClick={(entry: any) => {
                              if (entry?.catKey) {
                                setFiltroFinanceiroCategoria((prev) =>
                                  prev === entry.catKey ? "todas" : entry.catKey,
                                );
                              }
                            }}
                          >
                            {dadosPieCustos.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CORES_PIE[index % CORES_PIE.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, ""]}
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              borderRadius: "12px",
                              border: "1px solid #334155",
                              color: "#fff",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-slate-300/40 dark:border-slate-800 text-[11px]">
                    {dadosPieCustos.map((item, idx) => {
                      const ativo = filtroFinanceiroCategoria === item.catKey;
                      return (
                        <div
                          key={item.name}
                          onClick={() =>
                            setFiltroFinanceiroCategoria((prev) =>
                              prev === item.catKey ? "todas" : (item.catKey as any),
                            )
                          }
                          className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition ${
                            ativo
                              ? "bg-white/80 dark:bg-slate-800 font-bold ring-1 ring-blue-500 shadow-xs"
                              : "hover:bg-white/40 dark:hover:bg-slate-800/50"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: CORES_PIE[idx % CORES_PIE.length] }}
                            />
                            {item.name}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            R$ {item.valor.toFixed(2)} (
                            {custoTotalOperacional > 0
                              ? Math.round((item.valor / custoTotalOperacional) * 100)
                              : 0}
                            %)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* TABELA DE LANÇAMENTOS FINANCEIROS COM ORDENAÇÃO BIDIRECIONAL */}
              <div className="bg-[#eaf0f8] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                <div className="p-4 sm:p-5 border-b border-slate-300/40 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-orange-500" />
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                        Lançamentos de Abastecimento e Despesas Operacionais (
                        {itensFinanceirosConsolidados.length} itens)
                      </h3>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Clique em qualquer cabeçalho para ordenar
                      </span>
                    </div>
                  </div>

                  {/* Ações de lançamento direto pelo cliente / gestor */}
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-novo-abastecimento-frota"
                      type="button"
                      onClick={() => setModalAbastecimentoAberto(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors shadow-sm shadow-orange-600/20"
                    >
                      <Fuel className="h-3.5 w-3.5" />+ Registrar Abastecimento
                    </button>
                    <button
                      id="btn-nova-despesa-frota"
                      type="button"
                      onClick={() => {
                        const veicAlvo =
                          placaFiltro !== "todos"
                            ? todosVeiculos.find((v) => v.placa === placaFiltro)
                            : todosVeiculos[0];
                        if (!veicAlvo) {
                          toast.error("Nenhum veículo encontrado para lançar despesa.");
                          return;
                        }
                        setVeiculoParaDespesa(veicAlvo);
                        setModalDespesaAberto(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm shadow-blue-600/20"
                    >
                      <Receipt className="h-3.5 w-3.5" />+ Lançar Despesa
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <CabecalhoOrdenavel
                          titulo="Data"
                          campo="data"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Tipo / Categoria"
                          campo="categoriaLabel"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Veículo"
                          campo="placa"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Detalhamento"
                          campo="detalhamento"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Odômetro"
                          campo="km_atual"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Valor Total"
                          campo="valor"
                          campoAtivo={sortFinanceiro.campo}
                          direcao={sortFinanceiro.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortFinanceiro, setSortFinanceiro)
                          }
                          alinhamento="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                      {itensFinanceirosConsolidados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                            Nenhum lançamento financeiro correspondente aos filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        itensFinanceirosConsolidados.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                          >
                            <td className="px-4 py-3">
                              {new Date(item.data + "T00:00:00").toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.tipoCategoria === "combustivel"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                    : item.tipoCategoria === "manutencao"
                                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 uppercase"
                                      : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 uppercase"
                                }`}
                              >
                                {item.categoriaLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold">{item.placa}</td>
                            <td className="px-4 py-3">{item.detalhamento}</td>
                            <td className="px-4 py-3 font-mono">
                              {item.km_atual ? formatarKm(item.km_atual) : "—"}
                            </td>
                            <td className="px-4 py-3 font-bold text-right text-orange-600 dark:text-orange-400">
                              R$ {item.valor.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 3: SEGURANÇA E TELEMETRIA DE ALERTAS                         */}
          {/* =============================================================== */}
          {abaAtiva === "seguranca" && (
            <div className="space-y-6">
              {/* CARDS DE ALERTAS - ATIVOS COMO FILTRO */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() => setFiltroSegurancaTipo("todos")}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroSegurancaTipo === "todos"
                      ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para exibir todos os alertas"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Total de Alertas
                      <Filter className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {totalAlertas}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Eventos registrados no período
                    </p>
                    {filtroSegurancaTipo === "todos" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        Todos
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(244, 63, 94, 0.35)"
                  onClick={() =>
                    setFiltroSegurancaTipo((prev) =>
                      prev === "velocidade" ? "todos" : "velocidade",
                    )
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroSegurancaTipo === "velocidade"
                      ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas excessos de velocidade (> 90 km/h)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Excessos de Velocidade
                      <Filter className="h-3 w-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Zap className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-rose-600">
                    {alertasVelocidade}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Velocidade acima de 90 km/h
                    </p>
                    {filtroSegurancaTipo === "velocidade" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600">
                        Ativo
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(244, 63, 94, 0.35)"
                  onClick={() =>
                    setFiltroSegurancaTipo((prev) => (prev === "critica" ? "todos" : "critica"))
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroSegurancaTipo === "critica"
                      ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas alertas com gravidade Crítica"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Alertas Críticos
                      <Filter className="h-3 w-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-rose-600">
                    {alertasFiltrados.filter((a) => a.gravidade.toLowerCase() === "critica").length}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Máxima prioridade operacional
                    </p>
                    {filtroSegurancaTipo === "critica" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600">
                        Crítica
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() =>
                    setFiltroSegurancaTipo((prev) => (prev === "alta" ? "todos" : "alta"))
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroSegurancaTipo === "alta"
                      ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas alertas com gravidade Alta"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Alertas de Alta Severidade
                      <Filter className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-600">
                    {alertasFiltrados.filter((a) => a.gravidade.toLowerCase() === "alta").length}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Taxa de {taxaAlertas100Km} por 100 km
                    </p>
                    {filtroSegurancaTipo === "alta" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        Alta
                      </span>
                    )}
                  </div>
                </TiltCard>
              </div>

              {/* BARRA DE AVISO DE FILTRO ATIVO POR GRAVIDADE */}
              {filtroSegurancaTipo !== "todos" && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-900 dark:text-amber-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold">
                      Filtro ativo por infográfico: Alertas do tipo/severidade{" "}
                      <strong className="uppercase">{filtroSegurancaTipo}</strong> (
                      {alertasTabelaFiltrados.length} ocorrências)
                    </span>
                  </div>
                  <button
                    onClick={() => setFiltroSegurancaTipo("todos")}
                    className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300 hover:underline px-2 py-0.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Limpar Filtro</span>
                  </button>
                </div>
              )}

              {/* TABELA DE OCORRÊNCIAS DE SEGURANÇA COM ORDENAÇÃO BIDIRECIONAL */}
              <div className="bg-[#eaf0f8] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                <div className="p-4 sm:p-5 border-b border-slate-300/40 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    Trilha Forense de Ocorrências e Infrações de Telemetria (
                    {alertasTabelaFiltrados.length} eventos)
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Clique em qualquer cabeçalho para ordenar
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <CabecalhoOrdenavel
                          titulo="Data e Hora"
                          campo="created_at"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Veículo"
                          campo="placa"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Tipo de Alerta"
                          campo="tipo"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Velocidade"
                          campo="velocidade"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Gravidade"
                          campo="gravidade"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Detalhamento"
                          campo="detalhes"
                          campoAtivo={sortSeguranca.campo}
                          direcao={sortSeguranca.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortSeguranca, setSortSeguranca)
                          }
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                      {alertasTabelaFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 italic">
                            Nenhum alerta de segurança ou infração encontrada para os filtros
                            selecionados.
                          </td>
                        </tr>
                      ) : (
                        alertasTabelaFiltrados.map((al) => {
                          const veic = todosVeiculos.find((v) => v.id === al.veiculo_id);
                          return (
                            <tr
                              key={al.id}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                            >
                              <td className="px-4 py-3 font-mono">
                                {new Date(al.created_at).toLocaleString("pt-BR")}
                              </td>
                              <td className="px-4 py-3 font-bold">{veic?.placa || "—"}</td>
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-white uppercase">
                                {al.tipo.replace(/_/g, " ")}
                              </td>
                              <td className="px-4 py-3 font-mono">
                                {al.velocidade > 0 ? `${al.velocidade} km/h` : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    al.gravidade === "critica"
                                      ? "bg-rose-500/20 text-rose-600 border border-rose-500/30"
                                      : al.gravidade === "alta"
                                        ? "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                                        : "bg-blue-500/20 text-blue-600 border border-blue-500/30"
                                  }`}
                                >
                                  {al.gravidade}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {al.detalhes}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 4: SAÚDE DA FROTA E MANUTENÇÃO PREVENTIVA                   */}
          {/* =============================================================== */}
          {abaAtiva === "manutencao" && (
            <div className="space-y-6">
              {/* CARDS DE CONFORMIDADE MECÂNICA - ATIVOS COMO FILTRO */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(168, 85, 247, 0.35)"
                  onClick={() => setFiltroManutencaoStatus("todos")}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroManutencaoStatus === "todos"
                      ? "bg-purple-50/80 dark:bg-purple-950/30 border-purple-500 ring-2 ring-purple-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para exibir todos os itens de manutenção"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Conformidade Preventiva
                      <Filter className="h-3 w-3 text-purple-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <Wrench className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-purple-600">
                    {taxaConformidadeManut}%
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Itens revisados dentro do prazo
                    </p>
                    {filtroManutencaoStatus === "todos" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600">
                        Todos
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(16, 185, 129, 0.35)"
                  onClick={() =>
                    setFiltroManutencaoStatus((prev) => (prev === "em_dia" ? "todos" : "em_dia"))
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroManutencaoStatus === "em_dia"
                      ? "bg-orange-50/80 dark:bg-orange-950/30 border-orange-500 ring-2 ring-orange-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas itens rigorosamente Em Dia"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Itens Rigorosamente em Dia
                      <Filter className="h-3 w-3 text-orange-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-orange-600">
                    {itensEmDia}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      Quilometragem regular
                    </p>
                    {filtroManutencaoStatus === "em_dia" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600">
                        Em Dia
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() =>
                    setFiltroManutencaoStatus((prev) => (prev === "proxima" ? "todos" : "proxima"))
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroManutencaoStatus === "proxima"
                      ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar itens Próximos da Revisão (< 1.000 km)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Próximos da Revisão
                      <Filter className="h-3 w-3 text-amber-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-600">
                    {itensProximos}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                      A menos de 1.000 km do limite
                    </p>
                    {filtroManutencaoStatus === "proxima" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                        Próxima
                      </span>
                    )}
                  </div>
                </TiltCard>

                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(244, 63, 94, 0.35)"
                  onClick={() =>
                    setFiltroManutencaoStatus((prev) => (prev === "vencida" ? "todos" : "vencida"))
                  }
                  className={`p-5 rounded-3xl border transition-all cursor-pointer relative group hover:scale-[1.01] ${
                    filtroManutencaoStatus === "vencida"
                      ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-500 ring-2 ring-rose-500/50 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
                  }`}
                  title="Clique para filtrar apenas Manutenções Vencidas (ação imediata)"
                >
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      Manutenções Vencidas
                      <Filter className="h-3 w-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                    </span>
                    <XCircle className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-rose-600">
                    {itensVencidos}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-rose-600 font-semibold truncate">
                      {itensVencidos > 0 ? "Ação imediata requerida" : "Nenhum item atrasado"}
                    </p>
                    {filtroManutencaoStatus === "vencida" && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600">
                        Vencida
                      </span>
                    )}
                  </div>
                </TiltCard>
              </div>

              {/* BARRA DE AVISO DE FILTRO ATIVO POR STATUS DE MANUTENÇÃO */}
              {filtroManutencaoStatus !== "todos" && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-2xl text-xs text-purple-900 dark:text-purple-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold">
                      Filtro ativo por infográfico: Status{" "}
                      <strong className="uppercase">{filtroManutencaoStatus}</strong> (
                      {manutencoesTabelaFiltradas.length} itens correspondentes)
                    </span>
                  </div>
                  <button
                    onClick={() => setFiltroManutencaoStatus("todos")}
                    className="flex items-center gap-1 font-bold text-purple-700 dark:text-purple-300 hover:underline px-2 py-0.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Limpar Filtro</span>
                  </button>
                </div>
              )}

              {/* TABELA DE PLANO PREVENTIVO COM ORDENAÇÃO BIDIRECIONAL */}
              <div className="bg-[#eaf0f8] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                <div className="p-4 sm:p-5 border-b border-slate-300/40 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-purple-500" />
                    Plano de Manutenção Preventiva dos Veículos da Frota (
                    {manutencoesTabelaFiltradas.length} itens)
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Clique em qualquer cabeçalho para ordenar
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#eaf0f8] dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-300/60 dark:border-slate-800">
                      <tr>
                        <CabecalhoOrdenavel
                          titulo="Veículo"
                          campo="placa"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Componente / Revisão"
                          campo="item_manutencao"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Última Realizada (KM)"
                          campo="ultimo_km_realizado"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Odômetro Atual"
                          campo="odometro_km"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Próximo Alvo (KM)"
                          campo="proximo_km_alvo"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="KM Restante / Atraso"
                          campo="kmRestante"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                        />
                        <CabecalhoOrdenavel
                          titulo="Status"
                          campo="status"
                          campoAtivo={sortManutencao.campo}
                          direcao={sortManutencao.direcao}
                          onOrdenar={(campo) =>
                            alternarOrdenacao(campo, sortManutencao, setSortManutencao)
                          }
                          alinhamento="right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                      {manutencoesTabelaFiltradas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500 italic">
                            Nenhum item de manutenção preventiva encontrado para os filtros
                            selecionados.
                          </td>
                        </tr>
                      ) : (
                        manutencoesTabelaFiltradas.map((m) => {
                          const veic = todosVeiculos.find((v) => v.id === m.veiculo_id);
                          const odoAtual = Number(veic?.odometro_km || 0);
                          const kmRestante = Number((m.proximo_km_alvo - odoAtual).toFixed(2));

                          return (
                            <tr
                              key={m.id}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                            >
                              <td className="px-4 py-3 font-bold">{veic?.placa || "—"}</td>
                              <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                {m.item_manutencao}
                              </td>
                              <td className="px-4 py-3 font-mono">
                                {formatarKm(m.ultimo_km_realizado)}
                              </td>
                              <td className="px-4 py-3 font-mono">{formatarKm(odoAtual)}</td>
                              <td className="px-4 py-3 font-mono">
                                {formatarKm(m.proximo_km_alvo)}
                              </td>
                              <td className="px-4 py-3 font-mono">
                                {kmRestante < 0 ? (
                                  <span className="text-rose-600 font-bold">
                                    Vencido por {Math.abs(kmRestante).toLocaleString("pt-BR")} km
                                  </span>
                                ) : (
                                  <span className="text-orange-600 font-medium">
                                    {kmRestante.toLocaleString("pt-BR")} km restantes
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    m.status === "em_dia"
                                      ? "bg-orange-500/10 text-orange-600 border border-orange-500/20"
                                      : m.status === "proxima"
                                        ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                        : "bg-rose-500/10 text-rose-600 border border-rose-500/20 font-black"
                                  }`}
                                >
                                  {m.status === "em_dia"
                                    ? "Em dia"
                                    : m.status === "proxima"
                                      ? "Próxima"
                                      : "VENCIDA"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL DE ABASTECIMENTO PARA CLIENTE / GESTÃO */}
      {modalAbastecimentoAberto && (
        <ModalLancamentoAbastecimento
          clienteId={
            clienteSelecionadoId !== "todos"
              ? clienteSelecionadoId
              : session?.clienteId || todosVeiculos[0]?.cliente_id || ""
          }
          veiculoId={
            placaFiltro !== "todos"
              ? todosVeiculos.find((v) => v.placa === placaFiltro)?.id
              : undefined
          }
          veiculoPlaca={placaFiltro !== "todos" ? placaFiltro : undefined}
          onFechar={() => setModalAbastecimentoAberto(false)}
          onSucesso={() => {
            setModalAbastecimentoAberto(false);
            carregarDados();
            toast.success("Abastecimento registrado com sucesso!");
          }}
        />
      )}

      {/* MODAL DE DESPESA PARA CLIENTE / GESTÃO */}
      {modalDespesaAberto && veiculoParaDespesa && (
        <ModalLancamentoDespesaVeiculo
          clienteId={
            clienteSelecionadoId !== "todos"
              ? clienteSelecionadoId
              : session?.clienteId || veiculoParaDespesa.cliente_id
          }
          veiculoId={veiculoParaDespesa.id}
          veiculoPlaca={veiculoParaDespesa.placa}
          veiculoModelo={veiculoParaDespesa.marca_modelo}
          odometroAtual={Number(veiculoParaDespesa.odometro_km || 0)}
          onFechar={() => {
            setModalDespesaAberto(false);
            setVeiculoParaDespesa(null);
          }}
          onSucesso={() => {
            setModalDespesaAberto(false);
            setVeiculoParaDespesa(null);
            carregarDados();
            toast.success("Despesa lançada com sucesso!");
          }}
        />
      )}
    </div>
  );
}
