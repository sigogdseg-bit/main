import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  Component,
  type ReactNode,
} from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  X,
  Crosshair,
  Layers,
  Activity,
  Globe,
  Map as MapIcon,
  Moon,
  Sun,
  Sparkles,
  Users,
  Navigation,
  Lock,
  Bell,
  Route,
  Car,
  ArrowLeft,
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  EyeOff,
  Building2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { obterComandosEmAguardo } from "@/features/seguranca/services/comandosEmAguardoService";
import type { VeiculoGps, MapTheme, ModoVisualizacao } from "../types";
import { useGpsRealtime, calcularEstadoPulsoCentral } from "../hooks/useGpsRealtime";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useMapTheme } from "../context/MapThemeContext";
import { obterRecursosPorPlano } from "../utils/planPermissions";
import {
  agruparVeiculosPorCliente,
  deveAgruparPorCliente,
  type ClienteAgrupado,
} from "../utils/agrupamentoClientes";
import { podeAcessarLocalizacaoVeiculo } from "../utils/privacidadeLocalizacao";
import { LeafletEngine, type LeafletEngineHandle } from "./LeafletEngine";
import { MapLibre3DEngine, type MapLibre3DEngineHandle } from "./MapLibre3DEngine";
import {
  carregarPostosVigilancia,
  carregarTurnos,
} from "@/features/vigilantes/services/vigilanteService";
import type { PostoVigilancia, TurnoVigilancia } from "@/features/vigilantes/types";
import { carregarClientes } from "@/features/clientes/services/clienteService";
import type { Cliente } from "@/features/clientes/types";
import { listarLocatarios } from "@/features/locatarios/services/locatarioService";
import type { LocatarioCliente } from "@/features/locatarios/types";
import {
  isPropriedadeMonitorada,
  converterPostoEmVeiculoGps,
} from "../utils/propriedadeMonitoradaUtils";

// ErrorBoundary tático para conter falhas de renderização WebGL 3D e fazer fallback suave para 2D
class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn("Aviso de renderização gráfica 3D interceptado pelo Hunter:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
import { VehicleTelemetryDrawer } from "./VehicleTelemetryDrawer";
import { RefazerTrajetoModal } from "./RefazerTrajetoModal";
import { TrajetoInteligenteModal } from "./TrajetoInteligenteModal";
import { PainelRotasMonitoradasModal } from "./PainelRotasMonitoradasModal";
import { AlertasAcidenteBanner } from "./AlertasAcidenteBanner";
import { UpgradePlanoModal } from "./UpgradePlanoModal";
import { CentralAlertasModal } from "./CentralAlertasModal";
import { ModalBloqueioLocalizacaoRastreador } from "@/features/clientes/components/ModalBloqueioLocalizacaoRastreador";
import {
  verificarStatusFinanceiroCliente,
  type StatusFinanceiroCliente,
} from "@/features/mensalidades/services/mensalidadeService";
import { PainelAgendamentoCliente } from "@/features/clientes/components/PainelAgendamentoCliente";
import {
  avaliarStatusComunicacao,
  testarComunicacaoRastreador,
  salvarAlertaSeguranca,
} from "../services/gpsService";
import { detectarSuspeitaJammer } from "../services/anomaliaService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { dispararNotificacaoNativaAlerta } from "@/shared/lib/webPushService";
import {
  carregarRotaMonitoradaAtiva,
  encerrarRotaMonitorada,
  avaliarDesvioDeRota,
  atualizarStatusDesvioRota,
  type RotaMonitorada,
} from "../services/rotaMonitoradaService";
import type { TrajetoSalvo } from "../services/trajetoSalvoService";
import {
  carregarAreasSeguras,
  verificarPontoNaAreaSegura,
  carregarRegrasVeiculo,
  verificarHorarioPermitido,
  carregarHorarioUtilizacao,
  calcularDistanciaMetros,
  type AreaSegura,
} from "../services/protecaoVeiculoService";
import {
  carregarPreferenciasNotificacao,
  ouvirAtualizacoesPreferenciasNotificacao,
  PREFERENCIAS_PADRAO,
  type PreferenciasNotificacao,
} from "../services/notificacoesService";
import { resolverRegraEntregaAlerta } from "../constants/alertasCatalogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GpsMonitorViewProps {
  onVoltar?: () => void;
  voltarLabel?: string;
  alturaCustomizada?: string;
}

export function GpsMonitorView({
  onVoltar,
  voltarLabel,
  alturaCustomizada,
}: GpsMonitorViewProps = {}) {
  const { session } = useAuth();
  const { theme, setTheme } = useMapTheme();

  const isOperadorOuAdmin = Boolean(
    session?.isAdmin ||
    session?.isOperador ||
    session?.isSuperAdmin ||
    session?.role === "adm" ||
    session?.role === "superadmin" ||
    session?.role === "operador",
  );
  const isContaCliente = Boolean(
    session?.isCliente || session?.role === "cliente" || (!isOperadorOuAdmin && session?.clienteId),
  );

  const {
    veiculos,
    carregando,
    conectado,
    navegadorOnline,
    reconectando,
    erroReconciliacao,
    ultimaAtualizacao,
    veiculoSelecionado,
    setVeiculoSelecionado,
    recarregar,
    forcarReconexao,
    executarBloqueio,
  } = useGpsRealtime();

  const [segundosSemSync, setSegundosSemSync] = useState(0);
  const inicioSessaoPainelRef = useRef(Date.now());

  useEffect(() => {
    const atualizarPulso = () => {
      const diff = Math.max(0, Math.floor((Date.now() - ultimaAtualizacao.getTime()) / 1000));
      setSegundosSemSync(diff);
    };
    atualizarPulso();
    const timer = setInterval(atualizarPulso, 1000);
    return () => clearInterval(timer);
  }, [ultimaAtualizacao]);

  // Auto-reload preventivo a cada 6 horas para zerar acúmulo de RAM/WebGL em operação 24/7
  // Só recarrega se não houver modal aberto, formulário em edição ou comando em aguardo na fila
  useEffect(() => {
    const INTERVALO_AUTO_RELOAD_MS = 6 * 60 * 60 * 1000;
    const timer = setInterval(() => {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      if (Date.now() - inicioSessaoPainelRef.current < INTERVALO_AUTO_RELOAD_MS) return;

      const modalAberto = Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'));
      const elAtivo = document.activeElement as HTMLElement | null;
      const tagAtiva = elAtivo?.tagName?.toUpperCase();
      const emEdicao =
        tagAtiva === "INPUT" ||
        tagAtiva === "TEXTAREA" ||
        tagAtiva === "SELECT" ||
        Boolean(elAtivo?.isContentEditable);
      const comandosPendentes = obterComandosEmAguardo().some(
        (c) => c.status !== "concluido" && c.status !== "cancelado",
      );

      if (!modalAberto && !emEdicao && !comandosPendentes) {
        window.location.reload();
      }
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const estadoPulso = calcularEstadoPulsoCentral({
    conectado,
    navegadorOnline,
    erroReconciliacao,
    segundosSemSync,
    reconectando,
  });
  const pulsoCritico = estadoPulso.critico;
  const textoTempoPulso = estadoPulso.tempoFormatado;

  const recursosPlano = useMemo(
    () => obterRecursosPorPlano(session, veiculoSelecionado?.cliente_plano),
    [session, veiculoSelecionado],
  );

  const leafletRef = useRef<LeafletEngineHandle>(null);
  const maplibreRef = useRef<MapLibre3DEngineHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>("2D");

  const [trafegoAtivo, setTrafegoAtivo] = useState(false);
  const [menuCamadasAberto, setMenuCamadasAberto] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [clienteFiltroSelecionado, setClienteFiltroSelecionado] = useState<string>("todos");
  const [locatariosCliente, setLocatariosCliente] = useState<LocatarioCliente[]>([]);
  const [locatarioFiltroSelecionado, setLocatarioFiltroSelecionado] = useState<string>("todos");
  const [filtroVeiculosIds, setFiltroVeiculosIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("@hunter_filtro_veiculos_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [postosVigilancia, setPostosVigilancia] = useState<PostoVigilancia[]>([]);
  const [turnosVigilancia, setTurnosVigilancia] = useState<TurnoVigilancia[]>([]);
  const [postosExpandidos, setPostosExpandidos] = useState(false);
  const [clientesBase, setClientesBase] = useState<Cliente[]>([]);

  useEffect(() => {
    let ativo = true;
    carregarClientes()
      .then((res) => {
        if (ativo && Array.isArray(res)) {
          setClientesBase(res);
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarPostosVigilancia().then((res) => {
      if (!ativo || !Array.isArray(res)) return;
      const postosAtivos = res.filter((p) => p.ativo);
      setPostosVigilancia(postosAtivos);
      // Só consulta turnos de vigilância quando existirem postos ativos no mapa
      if (postosAtivos.length > 0) {
        carregarTurnos().then((turnosRes) => {
          if (ativo && Array.isArray(turnosRes)) {
            setTurnosVigilancia(turnosRes);
          }
        });
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Carrega locatários do cliente titular caso ele possua locatários subordinados
  useEffect(() => {
    let ativo = true;
    async function carregarLocatarios() {
      const cId =
        session?.clienteId ||
        (clienteFiltroSelecionado !== "todos" ? clienteFiltroSelecionado : undefined);
      if (!cId) {
        if (ativo) {
          setLocatariosCliente([]);
          setLocatarioFiltroSelecionado("todos");
        }
        return;
      }
      try {
        const lista = await listarLocatarios(cId);
        if (ativo && Array.isArray(lista)) {
          setLocatariosCliente(lista);
        }
      } catch {
        if (ativo) setLocatariosCliente([]);
      }
    }
    carregarLocatarios();
    return () => {
      ativo = false;
    };
  }, [session?.clienteId, clienteFiltroSelecionado]);

  const isVeiculoSelecionadoPropriedade = useMemo(() => {
    return isPropriedadeMonitorada(veiculoSelecionado, turnosVigilancia, postosVigilancia);
  }, [veiculoSelecionado, turnosVigilancia, postosVigilancia]);

  useEffect(() => {
    // Purga filtros legados no mount para evitar que clientes ativos fiquem ocultos silenciosamente
    try {
      if (typeof window !== "undefined" && localStorage.getItem("@hunter_filtro_clientes_ids")) {
        localStorage.removeItem("@hunter_filtro_clientes_ids");
      }
    } catch {}

    const handleStorage = () => {
      try {
        const storedV = localStorage.getItem("@hunter_filtro_veiculos_ids");
        setFiltroVeiculosIds(storedV ? JSON.parse(storedV) : []);
      } catch {
        setFiltroVeiculosIds([]);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("hunter_filtro_veiculos_alterado", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("hunter_filtro_veiculos_alterado", handleStorage);
    };
  }, []);

  // Estado financeiro e bloqueio administrativo de localização
  const [statusFinanceiro, setStatusFinanceiro] = useState<StatusFinanceiroCliente | null>(null);

  const [modalBloqueioLocalizacaoAberto, setModalBloqueioLocalizacaoAberto] = useState(false);

  useEffect(() => {
    if (!session || (!session.isCliente && !session.isMotorista)) return;
    verificarStatusFinanceiroCliente(
      session.userId,
      session.clienteId,
      Boolean(session.isMotorista || session.role === "motorista"),
    )
      .then((st) => {
        setStatusFinanceiro(st);
        if (st.bloqueioLocalizacao) {
          setModalBloqueioLocalizacaoAberto(true);
        }
      })
      .catch(() => {});
  }, [session]);

  const listaClientesUnicos = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; nome: string; totalVeiculos: number; totalPostos: number }
    >();

    // 1. Popula com todos os clientes cadastrados no banco de dados
    clientesBase.forEach((c) => {
      if (!c.id) return;
      mapa.set(c.id, {
        id: c.id,
        nome: c.nome_razao_social || "Cliente",
        totalVeiculos: 0,
        totalPostos: 0,
      });
    });

    // 2. Contabiliza veículos e assegura nomes oficiais
    veiculos.forEach((v) => {
      const cId = v.cliente_id;
      if (!cId) return;
      const cNome = v.cliente_nome || "Cliente sem nome";
      if (!mapa.has(cId)) {
        mapa.set(cId, { id: cId, nome: cNome, totalVeiculos: 0, totalPostos: 0 });
      } else if (mapa.get(cId)!.nome === "Cliente" && cNome !== "Cliente") {
        mapa.get(cId)!.nome = cNome;
      }
      mapa.get(cId)!.totalVeiculos += 1;
    });

    // 3. Contabiliza postos de vigilância (propriedades monitoradas)
    postosVigilancia.forEach((p) => {
      const cId = (p as any).cliente_id;
      if (!cId) return;
      if (!mapa.has(cId)) {
        const cliEncontrado = clientesBase.find((c) => c.id === cId);
        mapa.set(cId, {
          id: cId,
          nome: cliEncontrado?.nome_razao_social || "GD Segurança Privada",
          totalVeiculos: 0,
          totalPostos: 0,
        });
      }
      mapa.get(cId)!.totalPostos += 1;
    });

    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientesBase, veiculos, postosVigilancia]);

  // Filtragem de veículos com isolamento estrito de cliente e respeito aos filtros de frota
  const veiculosFiltrados = useMemo(() => {
    return veiculos.filter((v) => {
      // 1. ISOLAMENTO ABSOLUTO: Se for Perfil Cliente (inclusive emulado pelo SuperADM), restringe ESTRITAMENTE aos seus veículos
      if (session?.isCliente && session?.clienteId) {
        if (v.cliente_id !== session.clienteId) {
          return false;
        }
      }

      // Filtro de cliente selecionado na lista suspensa (ADM e Operador - padrão 'todos')
      if (clienteFiltroSelecionado !== "todos" && v.cliente_id !== clienteFiltroSelecionado) {
        return false;
      }

      // Filtro de locatário selecionado na lista suspensa (para o cliente que tem locatário)
      if (locatarioFiltroSelecionado !== "todos") {
        const locObj = locatariosCliente.find((l) => l.id === locatarioFiltroSelecionado);
        if (locObj) {
          const permitidos = Array.isArray(locObj.veiculos_permitidos)
            ? locObj.veiculos_permitidos
            : [];
          const matchId = permitidos.includes(v.id);
          const matchPlaca = Boolean(v.placa && permitidos.includes(v.placa));
          if (!matchId && !matchPlaca) {
            return false;
          }
        }
      }

      // REGRA IMPERIOSA: Perfil S.adm Auditor possui disponibilizado ÚNICA E EXCLUSIVAMENTE o veículo do usuário (AXH0E44)
      if (
        session?.isAuditor ||
        session?.isSuperAdminAuditor ||
        session?.role === "superadmin_auditor"
      ) {
        const placa = (v.placa || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (placa !== "AXH0E44" && v.id !== "3f2e1d2b-ca96-420e-88a5-c33fd98b689d") {
          return false;
        }
      }

      // 2. Filtro individual de veículos selecionados (para ADM ou Cliente com frota; ignorado para Auditor)
      const isAuditorPerfil = Boolean(
        session?.isAuditor ||
        session?.isSuperAdminAuditor ||
        session?.role === "superadmin_auditor",
      );
      if (!isAuditorPerfil && filtroVeiculosIds.length > 0 && !filtroVeiculosIds.includes(v.id)) {
        return false;
      }

      // 3. Busca por texto
      const matchBusca =
        !busca ||
        v.placa.toLowerCase().includes(busca.toLowerCase()) ||
        v.marca_modelo.toLowerCase().includes(busca.toLowerCase()) ||
        (v.cliente_nome && v.cliente_nome.toLowerCase().includes(busca.toLowerCase()));

      // 4. Status operacional
      const podeVerStatusVeiculo = podeAcessarLocalizacaoVeiculo(
        session,
        v,
        Boolean(statusFinanceiro?.bloqueioLocalizacao),
      );
      const matchStatus =
        filtroStatus === "todos" ||
        (podeVerStatusVeiculo &&
          ((filtroStatus === "em_rota" && v.status_operacional === "em_rota") ||
            (filtroStatus === "parado" && v.status_operacional === "parado_ligado") ||
            (filtroStatus === "estacionado" && v.status_operacional === "estacionado") ||
            (filtroStatus === "bloqueado" && v.bloqueado)));

      return matchBusca && matchStatus;
    });
  }, [
    veiculos,
    busca,
    filtroStatus,
    clienteFiltroSelecionado,
    locatarioFiltroSelecionado,
    locatariosCliente,
    filtroVeiculosIds,
    session,
    statusFinanceiro?.bloqueioLocalizacao,
  ]);

  // Síntese de postos de vigilância como ativos para telemetria integrada de propriedades monitoradas
  const postosComoAtivos = useMemo(() => {
    let postos = postosVigilancia;
    if (clienteFiltroSelecionado !== "todos") {
      postos = postos.filter((p) => (p as any).cliente_id === clienteFiltroSelecionado);
    }
    return postos.map((p) => converterPostoEmVeiculoGps(p, turnosVigilancia, veiculos));
  }, [postosVigilancia, turnosVigilancia, veiculos, clienteFiltroSelecionado]);

  // Lista consolidada de todos os ativos sob monitoramento (veículos e postos)
  const todosAtivosMonitorados = useMemo(() => {
    return [...veiculosFiltrados, ...postosComoAtivos];
  }, [veiculosFiltrados, postosComoAtivos]);

  // Auto-sincronização do veículo selecionado com os veículos filtrados e autorizados
  useEffect(() => {
    if (veiculoSelecionado) {
      // Se o ativo selecionado for uma Propriedade Monitorada ou Posto, preserva integralmente a seleção
      const ehPropriedade =
        isPropriedadeMonitorada(veiculoSelecionado, turnosVigilancia, postosVigilancia) ||
        veiculoSelecionado.id.startsWith("posto-");
      if (ehPropriedade) {
        return;
      }
      if (veiculosFiltrados.length > 0) {
        const existe = veiculosFiltrados.some((v) => v.id === veiculoSelecionado.id);
        if (!existe) {
          setVeiculoSelecionado(veiculosFiltrados[0]);
        }
      }
    } else if (
      !veiculoSelecionado &&
      veiculosFiltrados.length === 1 &&
      postosVigilancia.length === 0
    ) {
      setVeiculoSelecionado(veiculosFiltrados[0]);
    }
  }, [
    veiculosFiltrados,
    veiculoSelecionado,
    setVeiculoSelecionado,
    turnosVigilancia,
    postosVigilancia,
  ]);
  const [modalRefazerTrajetoVeiculo, setModalRefazerTrajetoVeiculo] = useState<VeiculoGps | null>(
    null,
  );
  const [viagemInicialPlaybackId, setViagemInicialPlaybackId] = useState<string | undefined>(
    undefined,
  );
  const [modalTrajetoInteligenteVeiculo, setModalTrajetoInteligenteVeiculo] =
    useState<VeiculoGps | null>(null);
  const [modalCentralAlertasAberto, setModalCentralAlertasAberto] = useState(false);
  const [modalRotasMonitoradasAberto, setModalRotasMonitoradasAberto] = useState(false);
  const [modalRotasVeiculo, setModalRotasVeiculo] = useState<VeiculoGps | null>(null);
  const [modalUpgradeAberto, setModalUpgradeAberto] = useState(false);
  const [recursoParaUpgrade, setRecursoParaUpgrade] = useState<string | undefined>();
  const [rotaMonitoradaAtiva, setRotaMonitoradaAtiva] = useState<RotaMonitorada | null>(null);
  const [trajetoParaCarregar, setTrajetoParaCarregar] = useState<TrajetoSalvo | null>(null);

  // Monitoramento de Suspeita de Jammer / Silenciamento Súbito
  const ultimosJammerNotificadosRef = useRef<Set<string>>(new Set());
  const veiculosComSuspeitaJammer = useMemo(() => {
    return veiculos.filter((v) => {
      const { suspeita } = detectarSuspeitaJammer(v);
      return suspeita;
    });
  }, [veiculos]);

  // Estado: preferências de notificação carregadas do banco (cacheadas por veículo e sincronizadas em tempo real)
  const prefsNotificacaoRef = useRef<PreferenciasNotificacao>(PREFERENCIAS_PADRAO);
  const prefsPorVeiculoRef = useRef<Map<string, PreferenciasNotificacao>>(new Map());
  const guinchoConfirmacaoRef = useRef<Map<string, number>>(new Map());
  const veiculosCacheIniciadoRef = useRef<Set<string>>(new Set());

  // Pré-carrega preferências de cada veículo da lista para evitar vazar regras entre veículos distintos
  useEffect(() => {
    if (!veiculos || veiculos.length === 0) return;
    const pendentes = veiculos.filter((v) => v?.id && !veiculosCacheIniciadoRef.current.has(v.id));
    if (pendentes.length === 0) return;

    let ativo = true;
    for (const v of pendentes) {
      veiculosCacheIniciadoRef.current.add(v.id);
      carregarPreferenciasNotificacao(session?.userId, v.id)
        .then((prefs) => {
          if (ativo) {
            prefsPorVeiculoRef.current.set(v.id, prefs);
          }
        })
        .catch(() => {
          if (ativo) {
            veiculosCacheIniciadoRef.current.delete(v.id);
          }
        });
    }

    return () => {
      ativo = false;
    };
  }, [veiculos, session?.userId]);

  // Carrega preferências de notificação para o veículo selecionado e assina atualizações Realtime
  useEffect(() => {
    const vId = veiculoSelecionado?.id;
    prefsNotificacaoRef.current = vId
      ? prefsPorVeiculoRef.current.get(vId) || PREFERENCIAS_PADRAO
      : PREFERENCIAS_PADRAO;

    carregarPreferenciasNotificacao(session?.userId, veiculoSelecionado?.id).then((prefs) => {
      prefsNotificacaoRef.current = prefs;
      if (vId) {
        prefsPorVeiculoRef.current.set(vId, prefs);
        veiculosCacheIniciadoRef.current.add(vId);
      }
    });

    const unsub = ouvirAtualizacoesPreferenciasNotificacao((dados) => {
      if (dados.veiculoId) {
        prefsPorVeiculoRef.current.set(dados.veiculoId, dados.preferencias);
        veiculosCacheIniciadoRef.current.add(dados.veiculoId);
      }
      if (
        !dados.veiculoId ||
        !veiculoSelecionado?.id ||
        dados.veiculoId === veiculoSelecionado.id
      ) {
        prefsNotificacaoRef.current = dados.preferencias;
      }
    });

    return () => unsub();
  }, [session?.userId, veiculoSelecionado?.id]);

  // Detecção automática de solicitação de montagem de rota inteligente via URL (?acao=montar-rota)
  const [rotaAbertaViaUrl, setRotaAbertaViaUrl] = useState(false);
  useEffect(() => {
    if (rotaAbertaViaUrl) return;
    if (typeof window !== "undefined" && veiculosFiltrados.length > 0) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("acao") === "montar-rota" || params.get("montar_rota") === "true") {
        setRotaAbertaViaUrl(true);
        const v = veiculoSelecionado || veiculosFiltrados[0];
        abrirMontarRota(v);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculosFiltrados, veiculoSelecionado, rotaAbertaViaUrl]);

  // Monitoramento de Limites Estabelecidos (Cercas Virtuais / Áreas Seguras)
  const [areasSegurasVeiculo, setAreasSegurasVeiculo] = useState<AreaSegura[]>([]);
  const ultimasSaidasAreaNotificadasRef = useRef<Set<string>>(new Set());

  const veiculoSelecionadoId = veiculoSelecionado?.id;
  useEffect(() => {
    if (!veiculoSelecionadoId) {
      setAreasSegurasVeiculo([]);
      return;
    }
    carregarAreasSeguras(veiculoSelecionadoId).then(setAreasSegurasVeiculo);
  }, [veiculoSelecionadoId]);

  useEffect(() => {
    if (!veiculoSelecionado || areasSegurasVeiculo.length === 0) return;
    if (
      typeof veiculoSelecionado.latitude !== "number" ||
      typeof veiculoSelecionado.longitude !== "number" ||
      (veiculoSelecionado.latitude === 0 && veiculoSelecionado.longitude === 0)
    ) {
      return;
    }

    areasSegurasVeiculo.forEach((area) => {
      if (!area.ativo) return;
      const { dentro } = verificarPontoNaAreaSegura(
        veiculoSelecionado.latitude,
        veiculoSelecionado.longitude,
        area,
      );

      const chaveAlerta = `${veiculoSelecionado.id}-${area.id}`;
      const chaveStorage = `sigo_cerca_estado_${chaveAlerta}`;
      const statusArmazenado =
        typeof window !== "undefined" ? sessionStorage.getItem(chaveStorage) : null;

      // 1. PRIMEIRA LEITURA / BASELINE:
      // Ao abrir o mapa ou selecionar o veículo, apenas memoriza o status atual (dentro ou fora).
      // Jamais dispara alerta retroativo ao abrir a tela se o veículo já estava fora da área.
      // O backend (trigger SQL) é a autoridade única que avalia transições reais de telemetria e notifica o WhatsApp.
      if (statusArmazenado === null) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(chaveStorage, dentro ? "dentro" : "fora");
        }
        return;
      }

      // 2. TRANSIÇÃO REAL AO VIVO: Estava dentro e passou para fora com o mapa aberto
      if (!dentro && statusArmazenado === "dentro") {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(chaveStorage, "fora");
        }
        if (!ultimasSaidasAreaNotificadasRef.current.has(chaveAlerta)) {
          ultimasSaidasAreaNotificadasRef.current.add(chaveAlerta);
          if (area.regra_saida === "alertar" || area.regra_saida === "fora_horario") {
            toast.error(
              `🚨 ALERTA: ${veiculoSelecionado.placa} SAIU DO LIMITE ESTABELECIDO (${area.nome})!`,
              { duration: 8000 },
            );
          }
        }
      }
      // 3. TRANSIÇÃO REAL AO VIVO: Estava fora e passou para dentro com o mapa aberto
      else if (dentro && statusArmazenado === "fora") {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(chaveStorage, "dentro");
        }
        ultimasSaidasAreaNotificadasRef.current.delete(chaveAlerta);
        if (area.regra_entrada === "alertar" || area.regra_entrada === "fora_horario") {
          toast.success(
            `✅ Veículo ${veiculoSelecionado.placa} chegou na área estabelecida (${area.nome}).`,
          );
        }
      }
    });
  }, [veiculoSelecionado, areasSegurasVeiculo]);

  // Monitoramento visual de suspeita de Jammer (sem disparo duplicado na carga inicial da tela)
  useEffect(() => {
    veiculosComSuspeitaJammer.forEach((v) => {
      const chaveStorageJammer = `sigo_jammer_estado_${v.id}`;
      const statusJammerArmazenado =
        typeof window !== "undefined" ? sessionStorage.getItem(chaveStorageJammer) : null;

      // Baseline inicial: se acabou de abrir o mapa, memoriza o status atual sem disparar retroativo
      if (statusJammerArmazenado === null) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(chaveStorageJammer, "jammer");
        }
        return;
      }

      if (statusJammerArmazenado !== "jammer" && !ultimosJammerNotificadosRef.current.has(v.id)) {
        ultimosJammerNotificadosRef.current.add(v.id);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(chaveStorageJammer, "jammer");
        }

        const executarDispatchJammer = (prefsVeiculo: PreferenciasNotificacao) => {
          const regraJammer = resolverRegraEntregaAlerta({
            tipo: "suspeita_jammer",
            alertasAtivos: prefsVeiculo as any,
            canaisGlobais: prefsVeiculo.canais_alertas,
          });
          if (
            !regraJammer.ativo ||
            (!regraJammer.app && !regraJammer.whatsapp && !regraJammer.ligacao)
          ) {
            return;
          }

          const { minutosSemSinal } = detectarSuspeitaJammer(v);
          const descricaoJammer = `Veículo ${v.placa} perdeu contato abruptamente em movimento há ${minutosSemSinal} min sem evento de desligamento normal. Suspeita de bloqueador de sinal celular/GPS ou corte de energia.`;

          salvarAlertaSeguranca({
            veiculo_id: v.id,
            cliente_id: v.cliente_id,
            tipo: "suspeita_jammer",
            gravidade: "critica",
            latitude: v.latitude || 0,
            longitude: v.longitude || 0,
            velocidade: v.velocidade || 0,
            detalhes: descricaoJammer,
          }).catch((err) => console.warn("Falha ao persistir alerta de Jammer:", err));

          enviarNotificacaoViaBd({
            destinatarioClienteId: v.cliente_id,
            titulo: "🚨 Suspeita de Jammer / Silenciamento Súbito",
            mensagem: descricaoJammer,
            tipo: "jammer",
            url: "/monitor-gps",
            placa: v.placa,
          }).catch((err) => console.warn("Falha no disparo de notificação de Jammer:", err));

          if (regraJammer.app) {
            dispararNotificacaoNativaAlerta({
              titulo: "Suspeita de Jammer / Silenciamento Súbito",
              mensagem: descricaoJammer,
              placa: v.placa,
              tipo: "suspeita_jammer",
              destinatarioClienteId: v.cliente_id,
            }).catch(() => {});
          }
        };

        const prefsEmCache = prefsPorVeiculoRef.current.get(v.id);
        if (prefsEmCache) {
          executarDispatchJammer(prefsEmCache);
        } else {
          carregarPreferenciasNotificacao(session?.userId, v.id)
            .then((prefsCarregadas) => {
              prefsPorVeiculoRef.current.set(v.id, prefsCarregadas);
              veiculosCacheIniciadoRef.current.add(v.id);
              executarDispatchJammer(prefsCarregadas);
            })
            .catch(() => {
              executarDispatchJammer(PREFERENCIAS_PADRAO);
            });
        }
      }
    });
  }, [veiculosComSuspeitaJammer, session?.userId]);

  // ─────────────────────────────────────────────────────────────────────────
  // MOTOR DE ALERTAS TELEMETRIA — Velocidade · Ignição · Bateria · Guincho
  // Avalia transições em tempo real enquanto a tela estiver em primeiro plano.
  // Deduplicação persistente em sessionStorage impede repetições em loop ao abrir o app.
  // ─────────────────────────────────────────────────────────────────────────
  const alertasTelemetriaRef = useRef<Record<string, number>>({});
  const estadoAnteriorTelemetriaRef = useRef<
    Record<string, { ignicao?: boolean; velocidade?: number; inicializado: boolean }>
  >({});

  const obterCooldownSession = (chave: string): number => {
    try {
      const raw = sessionStorage.getItem("sigo_cooldowns_telemetria");
      if (raw) {
        const obj = JSON.parse(raw);
        return typeof obj[chave] === "number" ? obj[chave] : 0;
      }
    } catch (e) {
      void e;
    }
    return 0;
  };

  const gravarCooldownSession = (chave: string, ts: number) => {
    try {
      let obj: Record<string, number> = {};
      const raw = sessionStorage.getItem("sigo_cooldowns_telemetria");
      if (raw) obj = JSON.parse(raw);
      obj[chave] = ts;
      const agora = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (agora - v > 10 * 60 * 1000) delete obj[k];
      }
      sessionStorage.setItem("sigo_cooldowns_telemetria", JSON.stringify(obj));
    } catch (e) {
      void e;
    }
  };

  useEffect(() => {
    if (!veiculoSelecionado) return;
    const v = veiculoSelecionado;
    if (!v.cliente_id) return;

    // 1. Controle de Primeira Carga / Transição Real:
    // Se o veículo acabou de ser carregado/selecionado ao abrir o app, memoriza seu estado estático
    // e NÃO dispara alertas repetitivos retroativos (o backend já cuidou do evento no momento do disparo).
    const estadoAnt = estadoAnteriorTelemetriaRef.current[v.id];
    if (!estadoAnt || !estadoAnt.inicializado) {
      estadoAnteriorTelemetriaRef.current[v.id] = {
        ignicao: v.ignicao,
        velocidade: v.velocidade,
        inicializado: true,
      };
      return;
    }

    const houveMudancaIgnicao = estadoAnt.ignicao !== v.ignicao;
    const houveMudancaVelocidade = estadoAnt.velocidade !== v.velocidade;
    estadoAnteriorTelemetriaRef.current[v.id] = {
      ignicao: v.ignicao,
      velocidade: v.velocidade,
      inicializado: true,
    };

    // Só reavalia se houve alteração real em ignição ou velocidade desde o último pacote
    if (!houveMudancaIgnicao && !houveMudancaVelocidade) {
      return;
    }

    const prefsEmCache = prefsPorVeiculoRef.current.get(v.id);
    const agora = Date.now();
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre disparos do mesmo tipo

    const podeDisparar = (chave: string): boolean => {
      const ultimoMemoria = alertasTelemetriaRef.current[chave] || 0;
      const ultimoStorage = obterCooldownSession(chave);
      const ultimo = Math.max(ultimoMemoria, ultimoStorage);
      if (agora - ultimo < COOLDOWN_MS) return false;
      alertasTelemetriaRef.current[chave] = agora;
      gravarCooldownSession(chave, agora);
      return true;
    };

    const dispararAlerta = (
      params: {
        chaveDeduplicacao: string;
        tipo: string;
        gravidade: "media" | "alta" | "critica";
        titulo: string;
        mensagem: string;
      },
      prefs: PreferenciasNotificacao,
    ) => {
      const regraTel = resolverRegraEntregaAlerta({
        tipo: params.tipo,
        alertasAtivos: prefs as any,
        canaisGlobais: prefs.canais_alertas,
      });
      if (!regraTel.ativo || (!regraTel.app && !regraTel.whatsapp && !regraTel.ligacao)) return;
      if (!podeDisparar(params.chaveDeduplicacao)) return;

      // 1. Persiste na Central de Alertas e Segurança
      salvarAlertaSeguranca({
        veiculo_id: v.id,
        cliente_id: v.cliente_id,
        tipo: params.tipo,
        gravidade: params.gravidade,
        latitude: v.latitude || 0,
        longitude: v.longitude || 0,
        velocidade: v.velocidade || 0,
        detalhes: params.mensagem,
      }).catch(() => {});

      // 2. Envia via BD → trigger pg_net → Push VAPID e WhatsApp (notifica o usuário via Realtime sem toasts duplicados)
      enviarNotificacaoViaBd({
        destinatarioClienteId: v.cliente_id,
        titulo: params.titulo,
        mensagem: params.mensagem,
        tipo: params.tipo,
        url: "/monitor-gps",
        placa: v.placa,
      }).catch(() => {});

      // 3. Disparo nativo local somente se o canal App / Push estiver habilitado
      if (regraTel.app) {
        dispararNotificacaoNativaAlerta({
          titulo: params.titulo,
          mensagem: params.mensagem,
          placa: v.placa,
          tipo: params.tipo,
          destinatarioClienteId: v.cliente_id,
        }).catch(() => {});
      }
    };

    // Carrega regras, horários e preferências do veículo (assíncrono, sem bloquear a renderização)
    Promise.all([
      carregarRegrasVeiculo(v.id),
      carregarHorarioUtilizacao(v.id),
      prefsEmCache
        ? Promise.resolve(prefsEmCache)
        : carregarPreferenciasNotificacao(session?.userId, v.id),
    ])
      .then(([regras, horario, prefsCarregadas]) => {
        const prefs = prefsCarregadas || prefsNotificacaoRef.current;
        prefsPorVeiculoRef.current.set(v.id, prefs);
        veiculosCacheIniciadoRef.current.add(v.id);

        const permiteAlertaTel = (tipoChave: string) => {
          const r = resolverRegraEntregaAlerta({
            tipo: tipoChave,
            alertasAtivos: prefs as any,
            canaisGlobais: prefs.canais_alertas,
          });
          return r.ativo && (r.app || r.whatsapp || r.ligacao);
        };

        // ── ALERTA 1: Excesso de Velocidade ──────────────────────────────
        if (
          permiteAlertaTel("excesso_velocidade") &&
          typeof v.velocidade === "number" &&
          v.velocidade > regras.limite_velocidade_geral
        ) {
          dispararAlerta(
            {
              chaveDeduplicacao: `velocidade_${v.id}`,
              tipo: "excesso_velocidade",
              gravidade: "alta",
              titulo: `Excesso de Velocidade — ${v.placa}`,
              mensagem: `Veículo ${v.placa} atingiu ${v.velocidade} km/h, ultrapassando o limite configurado de ${regras.limite_velocidade_geral} km/h.`,
            },
            prefs,
          );
        }

        // ── ALERTA 2: Ignição Fora do Horário ──────────────────────────
        if (permiteAlertaTel("ignicao_fora_horario") && v.ignicao === true && horario) {
          const { permitido, motivo } = verificarHorarioPermitido([horario]);
          if (!permitido) {
            dispararAlerta(
              {
                chaveDeduplicacao: `ignicao_horario_${v.id}`,
                tipo: "ignicao_fora_horario",
                gravidade: "alta",
                titulo: `Ignição Fora do Horário — ${v.placa}`,
                mensagem: motivo || `Motor acionado fora do horário habitual configurado.`,
              },
              prefs,
            );
          }
        }

        // ── ALERTA 3: Movimento Fora do Horário ─────────────────────────
        if (
          permiteAlertaTel("movimento_fora_horario") &&
          typeof v.velocidade === "number" &&
          v.velocidade > 3 &&
          horario
        ) {
          const { permitido } = verificarHorarioPermitido([horario]);
          if (!permitido) {
            dispararAlerta(
              {
                chaveDeduplicacao: `movimento_horario_${v.id}`,
                tipo: "movimento_fora_horario",
                gravidade: "alta",
                titulo: `Deslocamento Fora do Horário — ${v.placa}`,
                mensagem: `Veículo ${v.placa} em deslocamento (${v.velocidade} km/h) fora da janela habitual configurada.`,
              },
              prefs,
            );
          }
        }

        // ── ALERTA 4: Guincho (Movimento com Ignição Desligada) ─────────
        // Anti-Jitter: descarta oscilação de antena (0 a 14 km/h) e exige 2 leituras
        // consecutivas >= 15 km/h com ignição desligada para evitar falso positivo por GPS Drift.
        const emMovimentoSemIgnicao =
          v.ignicao === false && typeof v.velocidade === "number" && v.velocidade >= 15;
        if (!emMovimentoSemIgnicao) {
          guinchoConfirmacaoRef.current.set(v.id, 0);
        } else {
          const contagemGuincho = (guinchoConfirmacaoRef.current.get(v.id) ?? 0) + 1;
          guinchoConfirmacaoRef.current.set(v.id, contagemGuincho);
          if (permiteAlertaTel("guincho") && contagemGuincho >= 2) {
            dispararAlerta(
              {
                chaveDeduplicacao: `guincho_${v.id}`,
                tipo: "guincho",
                gravidade: "critica",
                titulo: `🚨 Veículo em Movimento com Motor Desligado — ${v.placa}`,
                mensagem: `Veículo ${v.placa} detectado em ${v.velocidade} km/h com ignição desligada. Possível reboque ou furto em andamento.`,
              },
              prefs,
            );
          }
        }

        // ── ALERTA 5: Baixa Tensão da Bateria ───────────────────────
        if (
          permiteAlertaTel("baixa_tensao") &&
          typeof v.bateria_veiculo_v === "number" &&
          v.bateria_veiculo_v > 0 &&
          v.bateria_veiculo_v < regras.alerta_baixa_tensao_v
        ) {
          dispararAlerta(
            {
              chaveDeduplicacao: `bateria_${v.id}`,
              tipo: "baixa_tensao",
              gravidade: "media",
              titulo: `Baixa Tensão da Bateria — ${v.placa}`,
              mensagem: `Veículo ${v.placa} com tensão de ${v.bateria_veiculo_v.toFixed(1)}V, abaixo do limiar de ${regras.alerta_baixa_tensao_v}V configurado.`,
            },
            prefs,
          );
        }
      })
      .catch(() => {}); // Silencia falhas de carregamento sem travar o render
  }, [veiculoSelecionado, session?.userId]);

  // Carrega e monitora reativamente a rota monitorada ativa do veículo selecionado
  useEffect(() => {
    if (!veiculoSelecionado) {
      setRotaMonitoradaAtiva(null);
      return;
    }

    carregarRotaMonitoradaAtiva(veiculoSelecionado.id).then((r) => {
      setRotaMonitoradaAtiva(r);
    });

    const canalRota = supabase
      .channel(`hunter_rota_mon_${veiculoSelecionado.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rotas_monitoradas",
          filter: `veiculo_id=eq.${veiculoSelecionado.id}`,
        },
        () => {
          carregarRotaMonitoradaAtiva(veiculoSelecionado.id).then((r) => {
            setRotaMonitoradaAtiva(r);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalRota);
    };
  }, [veiculoSelecionado]);

  const handleEncerrarRotaAtiva = async (rotaId: string) => {
    const ok = await encerrarRotaMonitorada(rotaId, "concluida");
    if (ok) {
      toast.success("Rota monitorada encerrada com sucesso!");
      setRotaMonitoradaAtiva(null);
    } else {
      toast.error("Falha ao encerrar rota monitorada.");
    }
  };

  // Centralização suave no veículo selecionado com zoom tático
  const centralizarNoVeiculo = useCallback(
    (v: VeiculoGps) => {
      if (!v) return;
      if (modoVisualizacao === "2D") {
        leafletRef.current?.centralizarVeiculo(v);
      } else {
        maplibreRef.current?.centralizarVeiculo(v);
      }
    },
    [modoVisualizacao],
  );

  const alvoFocadoRef = useRef(false);

  // Foco imediato e estável no item selecionado (Veículo ou Posto Fixo) vindo do Painel Geral ou URL
  useEffect(() => {
    if (alvoFocadoRef.current || typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const alvoId =
      urlParams.get("veiculo") ||
      urlParams.get("veiculoId") ||
      urlParams.get("posto") ||
      localStorage.getItem("@hunter_veiculo_selecionado_id");

    if (!alvoId) return;

    if (alvoId.startsWith("posto-") || alvoId.startsWith("propriedade-")) {
      const postoIdLimpo = alvoId.replace(/^(posto|propriedade)-/, "");
      const posto = postosVigilancia.find((p) => p.id === postoIdLimpo || p.id === alvoId);
      if (posto) {
        alvoFocadoRef.current = true;
        primeiroEnquadramentoRef.current = true;
        setModoVisaoFrota(false);
        try {
          localStorage.removeItem("@hunter_veiculo_selecionado_id");
        } catch {}

        const lat = Number(posto.latitude);
        const lng = Number(posto.longitude);
        if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
          const aplicarFoco = () => {
            if (modoVisualizacao === "2D") {
              leafletRef.current?.centralizarCoordenadas(lat, lng, 18);
            } else {
              maplibreRef.current?.centralizarCoordenadas?.(lat, lng, 18);
            }
          };
          aplicarFoco();
          const t1 = setTimeout(aplicarFoco, 250);
          const t2 = setTimeout(aplicarFoco, 600);
          return () => {
            clearTimeout(t1);
            clearTimeout(t2);
          };
        }
      }
    } else {
      const veiculo = veiculos.find((v) => v.id === alvoId || v.placa === alvoId);
      if (veiculo) {
        alvoFocadoRef.current = true;
        primeiroEnquadramentoRef.current = true;
        setModoVisaoFrota(false);
        try {
          localStorage.removeItem("@hunter_veiculo_selecionado_id");
        } catch {}

        setVeiculoSelecionado(veiculo);

        const aplicarFoco = () => {
          centralizarNoVeiculo(veiculo);
        };
        aplicarFoco();
        const t1 = setTimeout(aplicarFoco, 250);
        const t2 = setTimeout(aplicarFoco, 600);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
    }
  }, [veiculos, postosVigilancia, modoVisualizacao, centralizarNoVeiculo, setVeiculoSelecionado]);

  // Avaliação contínua de desvio de rota viária em tempo real (Ponto A -> Ponto B)
  useEffect(() => {
    if (!veiculoSelecionado || !rotaMonitoradaAtiva) return;
    if (
      typeof veiculoSelecionado.latitude !== "number" ||
      typeof veiculoSelecionado.longitude !== "number" ||
      (veiculoSelecionado.latitude === 0 && veiculoSelecionado.longitude === 0)
    ) {
      return;
    }

    // Regra Operacional Canônica GD Rastreamento:
    // 1. Veículo Estacionado com ignição desligada NÃO está em desvio de rota!
    // A rota monitorada avalia deslocamento ativo. Disparar alarme com o carro parado e desligado é falso positivo.
    const veiculoEmMovimento =
      Boolean(veiculoSelecionado.ignicao) || (Number(veiculoSelecionado.velocidade) || 0) > 3;
    if (!veiculoEmMovimento) {
      return;
    }

    // 2. Telemetria Válida e Recente:
    // Se o rastreador estiver sem comunicação recente (ex: sem sinal há mais de 10 minutos ou sem fix GPS válido),
    // não podemos calcular desvio com base em coordenadas antigas desatualizadas.
    const statusCom = avaliarStatusComunicacao(veiculoSelecionado.ultima_atualizacao);
    if (!statusCom.ativo || (statusCom.minutos !== null && statusCom.minutos > 10)) {
      return;
    }

    // 3. Verificação de Conclusão ou Proximidade da Origem:
    const coordsRota = rotaMonitoradaAtiva.coordenadas_rota;
    if (Array.isArray(coordsRota) && coordsRota.length >= 2) {
      const pontoOrigemRaw = coordsRota[0];
      const pontoDestinoRaw = coordsRota[coordsRota.length - 1];

      // Normaliza coordenadas [lat, lon]
      const latOrigem =
        Number(pontoOrigemRaw[0]) < -30 ? Number(pontoOrigemRaw[1]) : Number(pontoOrigemRaw[0]);
      const lonOrigem =
        Number(pontoOrigemRaw[0]) < -30 ? Number(pontoOrigemRaw[0]) : Number(pontoOrigemRaw[1]);
      const latDestino =
        Number(pontoDestinoRaw[0]) < -30 ? Number(pontoDestinoRaw[1]) : Number(pontoDestinoRaw[0]);
      const lonDestino =
        Number(pontoDestinoRaw[0]) < -30 ? Number(pontoDestinoRaw[0]) : Number(pontoDestinoRaw[1]);

      const distOrigem = calcularDistanciaMetros(
        veiculoSelecionado.latitude,
        veiculoSelecionado.longitude,
        latOrigem,
        lonOrigem,
      );
      const distDestino = calcularDistanciaMetros(
        veiculoSelecionado.latitude,
        veiculoSelecionado.longitude,
        latDestino,
        lonDestino,
      );

      // Conclusão automática ao se aproximar do destino final
      if (distDestino <= Math.max(120, rotaMonitoradaAtiva.tolerancia_desvio_metros)) {
        toast.success(
          `🏁 Destino alcançado! Rota monitorada "${rotaMonitoradaAtiva.nome}" concluída com sucesso.`,
          { duration: 6000 },
        );
        encerrarRotaMonitorada(rotaMonitoradaAtiva.id, "concluida");
        setRotaMonitoradaAtiva(null);
        return;
      }

      // Se o veículo ainda estiver na proximidade da origem (saída) e com baixa velocidade, ainda está manobrando para sair
      if (
        distOrigem <= Math.max(300, rotaMonitoradaAtiva.tolerancia_desvio_metros) &&
        (Number(veiculoSelecionado.velocidade) || 0) <= 10
      ) {
        return;
      }
    }

    const { emDesvio, distanciaMetros } = avaliarDesvioDeRota(
      veiculoSelecionado.latitude,
      veiculoSelecionado.longitude,
      rotaMonitoradaAtiva,
    );

    const prefsRota =
      prefsPorVeiculoRef.current.get(veiculoSelecionado.id) || prefsNotificacaoRef.current;
    const regraDesvioRota = resolverRegraEntregaAlerta({
      tipo: "desvio_rota",
      alertasAtivos: prefsRota as any,
      canaisGlobais: prefsRota.canais_alertas,
    });
    const deveAlertarDesvioRota =
      regraDesvioRota.ativo &&
      (regraDesvioRota.app || regraDesvioRota.whatsapp || regraDesvioRota.ligacao);

    if (emDesvio && !rotaMonitoradaAtiva.desvio_detectado) {
      // Disparo imediato de Alerta de Desvio de Trajeto somente se o usuário manteve desvio_rota ativo
      if (deveAlertarDesvioRota && regraDesvioRota.app) {
        toast.error(
          `🚨 ALERTA: ${veiculoSelecionado.placa} FORA DA ROTA MONITORADA! Desvio de ${distanciaMetros}m das ruas do trajeto!`,
          { duration: 8000 },
        );
      }
      atualizarStatusDesvioRota(rotaMonitoradaAtiva.id, true, distanciaMetros);

      // Salvar na Central de Alertas e Segurança (Persistência Atômica no Banco)
      // A RPC registrar_alerta_seguranca grava na Central, no histórico de eventos
      // e em notificacoes_sistema (disparando Push VAPID e WhatsApp atômico pelo server, SEM DUPLICIDADE)
      if (deveAlertarDesvioRota) {
        salvarAlertaSeguranca({
          veiculo_id: veiculoSelecionado.id,
          cliente_id: veiculoSelecionado.cliente_id,
          tipo: "desvio_rota",
          gravidade: "media",
          latitude: veiculoSelecionado.latitude || 0,
          longitude: veiculoSelecionado.longitude || 0,
          velocidade: veiculoSelecionado.velocidade || 0,
          detalhes: `Veículo ${veiculoSelecionado.placa} fora da rota monitorada! Desvio de ${distanciaMetros}m das ruas do trajeto.`,
        }).catch((err) => console.warn("Falha ao persistir alerta de desvio de rota:", err));
      }

      setRotaMonitoradaAtiva((prev) =>
        prev
          ? {
              ...prev,
              status: "em_desvio",
              desvio_detectado: true,
              ultima_distancia_desvio_m: distanciaMetros,
            }
          : null,
      );
    } else if (!emDesvio && rotaMonitoradaAtiva.desvio_detectado) {
      // Retorno ao trajeto correto
      toast.success(
        `✅ Veículo ${veiculoSelecionado.placa} retornou ao trajeto da rota monitorada (${distanciaMetros}m da via).`,
      );
      atualizarStatusDesvioRota(rotaMonitoradaAtiva.id, false, distanciaMetros);
      setRotaMonitoradaAtiva((prev) =>
        prev
          ? {
              ...prev,
              status: "ativa",
              desvio_detectado: false,
              ultima_distancia_desvio_m: distanciaMetros,
            }
          : null,
      );
    }
  }, [veiculoSelecionado, rotaMonitoradaAtiva]);

  // Em dispositivos móveis a sidebar inicia recolhida para o mapa abrir diretamente
  const [sidebarAberta, setSidebarAberta] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true,
  );
  // Controle de visualização de tela: "mapa" (100% da tela) ou "cockpit" (tela dedicada de telemetria 3D)
  const [visaoAtiva, setVisaoAtiva] = useState<"mapa" | "cockpit">("mapa");
  // Controle de visão de múltiplos veículos (Modo Frota simultâneo no Mapa)
  const [modoVisaoFrota, setModoVisaoFrota] = useState(false);

  // Auto-enquadramento canônico ao entrar no Mapa ao Vivo:
  // - Contas Operador e Administrador: seleciona e enquadra Mapa Geral (frota e postos simultaneamente)
  // - Contas de Cliente: entra com Frota Total (todos os veículos do cliente no mapa)
  const primeiroEnquadramentoRef = useRef(false);
  useEffect(() => {
    if (primeiroEnquadramentoRef.current || alvoFocadoRef.current) return;
    if (carregando) return;

    // Se o usuário solicitou um alvo específico (via URL ou Painel Geral), bloqueia no ato o fitBounds geral da frota!
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const temAlvo =
        urlParams.get("veiculo") ||
        urlParams.get("veiculoId") ||
        urlParams.get("posto") ||
        localStorage.getItem("@hunter_veiculo_selecionado_id");
      if (temAlvo) {
        primeiroEnquadramentoRef.current = true;
        return;
      }
    }

    const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
    if (alvos.length === 0 && postosVigilancia.length === 0) return;

    const timer = setTimeout(() => {
      if (primeiroEnquadramentoRef.current || alvoFocadoRef.current) return;
      primeiroEnquadramentoRef.current = true;

      setModoVisaoFrota(true);

      if (isOperadorOuAdmin) {
        // Operador e Administrador: por padrão enquadra Mapa Geral
        if (modoVisualizacao === "3D") {
          maplibreRef.current?.fitBoundsGeral?.(alvos, postosVigilancia);
        } else {
          leafletRef.current?.fitBoundsGeral(alvos, postosVigilancia);
        }
      } else {
        // Cliente (ou demais perfis): entra com Frota Total por padrão
        if (modoVisualizacao === "3D") {
          maplibreRef.current?.fitBounds(alvos);
        } else {
          leafletRef.current?.fitBounds(alvos);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    carregando,
    veiculosFiltrados,
    veiculos,
    postosVigilancia,
    isOperadorOuAdmin,
    isContaCliente,
    modoVisualizacao,
  ]);

  const alternarVisaoAtiva = (modo: "mapa" | "cockpit") => {
    setVisaoAtiva(modo);
    if (modo === "mapa") {
      setTimeout(() => {
        leafletRef.current?.fitBounds();
        maplibreRef.current?.fitBounds();
      }, 150);
    }
  };

  // Abertura de montagem de rota com validação estrita de plano
  const abrirMontarRota = (veiculoAlvo?: VeiculoGps | null) => {
    const v = veiculoAlvo || veiculoSelecionado || veiculosFiltrados[0] || null;
    if (!recursosPlano.montarRota) {
      setRecursoParaUpgrade("Trajeto Inteligente com Múltiplas Paradas (Exclusivo Plano Master)");
      setModalUpgradeAberto(true);
      return;
    }
    setModalTrajetoInteligenteVeiculo(v);
  };

  // Abertura de rotas monitoradas salvas no banco de dados (onde vê, altera e exclui)
  const abrirRotasMonitoradas = (veiculoAlvo?: VeiculoGps | null) => {
    const v = veiculoAlvo || veiculoSelecionado || veiculosFiltrados[0] || null;
    if (!v) {
      toast.info("Nenhum veículo disponível para auditar rotas.");
      return;
    }
    setModalRotasVeiculo(v);
    setModalRotasMonitoradasAberto(true);
  };

  const podeVerFiltrosStatus = Boolean(
    session?.isAdmin || session?.isCliente || session?.isMotorista || session?.role === "motorista",
  );

  const temAcessoLocalizacaoVeiculoSelecionado = useMemo(() => {
    return podeAcessarLocalizacaoVeiculo(
      session,
      veiculoSelecionado,
      Boolean(statusFinanceiro?.bloqueioLocalizacao),
    );
  }, [session, veiculoSelecionado, statusFinanceiro?.bloqueioLocalizacao]);

  // Central de Monitoramento: O mapa renderiza os veículos autorizados e filtrados
  const veiculosNoMapa = useMemo(() => {
    if (modoVisaoFrota && veiculosFiltrados.length > 1) {
      return veiculosFiltrados;
    }

    if (!veiculoSelecionado) {
      return veiculosFiltrados.length === 1 ? veiculosFiltrados : [];
    }

    const veiculoAlvo =
      veiculosFiltrados.find((v) => v.id === veiculoSelecionado.id) || veiculosFiltrados[0] || null;

    if (!veiculoAlvo) return [];
    return [veiculoAlvo];
  }, [modoVisaoFrota, veiculosFiltrados, veiculoSelecionado]);

  // Contadores operacionais
  // Regra Canônica Hunter: Derivados estritamente dos veículos autorizados e filtrados
  const totais = useMemo(() => {
    const veiculosComStatusVisivel = veiculosFiltrados.filter((v) =>
      podeAcessarLocalizacaoVeiculo(session, v),
    );

    return {
      total: veiculosFiltrados.length,
      emRota: veiculosComStatusVisivel.filter(
        (v) => v.status_operacional === "em_rota" && !v.bloqueado,
      ).length,
      parados: veiculosComStatusVisivel.filter((v) => v.status_operacional === "parado_ligado")
        .length,
      estacionados: veiculosComStatusVisivel.filter((v) => v.status_operacional === "estacionado")
        .length,
      bloqueados: veiculosComStatusVisivel.filter((v) => v.bloqueado).length,
      possuiStatusVisivel: veiculosComStatusVisivel.length > 0,
    };
  }, [veiculosFiltrados, session]);

  // Determina se a listagem deve ser agrupada por clientes (contas de usuários, exceto instalador e cliente)
  const isAgrupadoPorCliente = useMemo(() => deveAgruparPorCliente(session), [session]);

  // Agrupamento dos veículos filtrados por cliente com respeito estrito à privacidade
  const clientesAgrupados = useMemo<ClienteAgrupado[]>(() => {
    if (!isAgrupadoPorCliente) return [];
    return agruparVeiculosPorCliente(veiculosFiltrados, session);
  }, [isAgrupadoPorCliente, veiculosFiltrados, session]);

  // Estado de clientes expandidos (acordeom - minimizados por padrão)
  const [clientesExpandidos, setClientesExpandidos] = useState<Record<string, boolean>>({});

  // Garante que o cliente do veículo selecionado esteja expandido para visibilidade imediata
  useEffect(() => {
    if (veiculoSelecionado && isAgrupadoPorCliente) {
      const chave =
        veiculoSelecionado.cliente_id || veiculoSelecionado.cliente_nome || "sem_cliente";
      setClientesExpandidos((prev) => ({ ...prev, [chave]: true }));
    }
  }, [veiculoSelecionado, isAgrupadoPorCliente]);

  // Se houver busca textual ativa, expande automaticamente todos os clientes com correspondência
  useEffect(() => {
    if (busca.trim() !== "" && isAgrupadoPorCliente) {
      const expandir: Record<string, boolean> = {};
      clientesAgrupados.forEach((c) => {
        expandir[c.id] = true;
      });
      setClientesExpandidos((prev) => ({ ...prev, ...expandir }));
    }
  }, [busca, isAgrupadoPorCliente, clientesAgrupados]);

  const toggleCliente = (clienteId: string) => {
    setClientesExpandidos((prev) => ({
      ...prev,
      [clienteId]: !prev[clienteId],
    }));
  };

  const alternarTodosClientes = () => {
    const temAlgumAberto = clientesAgrupados.some((c) => Boolean(clientesExpandidos[c.id]));
    const novoEstado: Record<string, boolean> = {};
    clientesAgrupados.forEach((c) => {
      novoEstado[c.id] = !temAlgumAberto;
    });
    setClientesExpandidos(novoEstado);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setFullscreen(false))
        .catch(() => {});
    }
  };

  const alternarModoVisualizacao = (novoModo: ModoVisualizacao) => {
    if (novoModo === "3D" && !recursosPlano.modo3D) {
      toast.error("O Modo 3D com perspectiva requer assinatura do plano Pro ou Master.");
      return;
    }
    setModoVisualizacao(novoModo);
  };

  const selecionarETestarVeiculo = async (v: VeiculoGps) => {
    // Se o cliente ou motorista estiver com bloqueio administrativo de localização ativo, abre o modal oficial
    if (statusFinanceiro?.bloqueioLocalizacao && (session?.isCliente || session?.isMotorista)) {
      setModalBloqueioLocalizacaoAberto(true);
    }

    // Se o usuário clicar no mesmo veículo já selecionado e houver mais de um cadastrado, permite desmarcar
    if (veiculoSelecionado?.id === v.id) {
      if (veiculosFiltrados.length > 1 || postosVigilancia.length > 0) {
        setVeiculoSelecionado(null);
      }
      return;
    }

    setVeiculoSelecionado(v);
    setModoVisaoFrota(false);
    if (window.innerWidth < 768) setSidebarAberta(false);

    const isPropriedade =
      isPropriedadeMonitorada(v, turnosVigilancia, postosVigilancia) || v.id.startsWith("posto-");

    if (modoVisualizacao === "3D") {
      if (isPropriedade) {
        maplibreRef.current?.centralizarCoordenadas?.(v.latitude, v.longitude, 18);
      } else {
        maplibreRef.current?.centralizarVeiculo(v);
      }
    } else {
      if (isPropriedade) {
        leafletRef.current?.centralizarCoordenadas(v.latitude, v.longitude, 18);
      } else {
        leafletRef.current?.centralizarVeiculo(v);
      }
    }

    if (isPropriedade) {
      toast.success(`Propriedade ${v.marca_modelo} selecionada (Monitor 3D Ativo).`, {
        duration: 3000,
      });
      return;
    }

    const toastId = toast.loading(`Testando comunicacao do veiculo ${v.placa}...`);
    try {
      const res = await testarComunicacaoRastreador(v.id);
      if (res.ativo) {
        toast.success(res.mensagem, { id: toastId, duration: 4500 });
      } else {
        toast.warning(res.mensagem, { id: toastId, duration: 5500 });
      }
    } catch {
      toast.dismiss(toastId);
    }
  };

  const selecionarETestarRef = useRef(selecionarETestarVeiculo);
  selecionarETestarRef.current = selecionarETestarVeiculo;

  const handleSelectVeiculoMapa = useCallback((v: VeiculoGps) => {
    void selecionarETestarRef.current(v);
  }, []);

  const focarVeiculoPorId = (veiculoId: string) => {
    const v = veiculos.find((item) => item.id === veiculoId);
    if (v) {
      setVisaoAtiva("mapa");
      setModoVisaoFrota(false);
      setVeiculoSelecionado(v);
      if (window.innerWidth < 768) setSidebarAberta(false);

      if (modoVisualizacao === "3D") {
        maplibreRef.current?.centralizarVeiculo(v);
      } else {
        leafletRef.current?.centralizarVeiculo(v);
      }
      toast.info(`Focado no veículo ${v.placa}`, { duration: 2500 });
    }
  };

  // Escuta evento global disparado pelo banner de alertas do AppShell para focar veículo no mapa
  useEffect(() => {
    function aoFocarVeiculo(e: Event) {
      const customEvent = e as CustomEvent<{ veiculoId: string }>;
      if (customEvent.detail?.veiculoId) {
        focarVeiculoPorId(customEvent.detail.veiculoId);
      }
    }
    window.addEventListener("hunter:focar_veiculo", aoFocarVeiculo);
    return () => window.removeEventListener("hunter:focar_veiculo", aoFocarVeiculo);
  }, [focarVeiculoPorId]);

  // Camadas oficiais sem topográfico/relevo (atendendo determinação expressa)
  const camadas = [
    { id: "streets", label: "Mapa Claro (Ruas)", icone: Sun },
    { id: "dark", label: "Noturno Tático", icone: Moon },
    { id: "satellite", label: "Satélite Real", icone: Globe },
  ];

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${
        fullscreen
          ? "h-screen rounded-none"
          : alturaCustomizada ||
            "h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-5.5rem)] md:min-h-[550px] rounded-2xl sm:rounded-3xl"
      } flex flex-col overflow-hidden bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none select-none transition-all duration-200`}
    >
      {/* 1. Barra de Ferramentas Superior */}
      <header className="z-20 px-3 py-2 sm:px-4 sm:py-2.5 bg-[#eaf0f8]/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-300/60 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-sm">
        {/* Visão Mobile Despoluída (md:hidden): Sem competição de espaço */}
        <div className="flex md:hidden items-center justify-between w-full gap-2">
          {/* Lado Esquerdo: Botão Voltar (se fornecido) + Botão Frota + Status do Veículo Selecionado */}
          <div className="flex items-center gap-1.5 min-w-0">
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shrink-0 active:scale-95 transition cursor-pointer"
                title={voltarLabel || "Voltar"}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-[11px] font-bold">{voltarLabel || "Voltar"}</span>
              </button>
            )}

            <button
              onClick={() => setSidebarAberta(!sidebarAberta)}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 transition shrink-0 active:scale-95"
              title={sidebarAberta ? "Recolher frota" : "Abrir frota"}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            {veiculoSelecionado ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    veiculoSelecionado.ignicao ? "bg-orange-500 animate-pulse" : "bg-slate-400"
                  }`}
                />
                <span className="font-mono font-black text-xs text-slate-900 dark:text-slate-100 truncate">
                  {veiculoSelecionado.placa}
                </span>
                <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold shrink-0">
                  {veiculoSelecionado.velocidade} km/h
                </span>
                {rotaMonitoradaAtiva && (
                  <button
                    onClick={() => handleEncerrarRotaAtiva(rotaMonitoradaAtiva.id)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-[10px] font-bold shrink-0 animate-pulse"
                    title="Desativar rota monitorada"
                  >
                    <Route className="h-3 w-3" />
                    <span className="truncate max-w-[60px] sm:max-w-[100px]">
                      {rotaMonitoradaAtiva.nome}
                    </span>
                    <X className="h-2.5 w-2.5 ml-0.5 text-rose-500" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Frota</span>
                <span className="px-1.5 py-0.2 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold text-[10px]">
                  {totais.total}
                </span>
              </div>
            )}
          </div>

          {/* Lado Direito: Pulso da Central + Alternador 2D/3D + Camadas + FitBounds */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => forcarReconexao()}
              title={
                pulsoCritico
                  ? `Alerta de Conexão: ${estadoPulso.rotulo}. Clique para reconectar.`
                  : `Pulso da Central Online · Última sincronização há ${textoTempoPulso}`
              }
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border text-[10px] font-mono font-bold transition cursor-pointer ${
                pulsoCritico
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 animate-pulse"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {!conectado ? (
                <WifiOff className="h-3 w-3 shrink-0" />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    pulsoCritico ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                />
              )}
              <span>{estadoPulso.rotuloCompacto}</span>
            </button>

            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
              <button
                onClick={() => alternarModoVisualizacao("2D")}
                className={`px-2 py-0.5 rounded-lg transition ${
                  modoVisualizacao === "2D"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                2D
              </button>
              <button
                onClick={() => alternarModoVisualizacao("3D")}
                className={`px-2 py-0.5 rounded-lg transition ${
                  modoVisualizacao === "3D"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-500"
                }`}
              >
                3D
              </button>
            </div>

            {/* Menu de Camadas Mobile */}
            <div className="relative">
              <button
                onClick={() => setMenuCamadasAberto(!menuCamadasAberto)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                title="Camadas de satélite e tema"
              >
                <Layers className="h-4 w-4 text-orange-500" />
              </button>
              {menuCamadasAberto && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 shadow-2xl z-50 text-slate-800 dark:text-slate-200">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                    Provedor de Mapa
                  </div>
                  {camadas.map((c) => {
                    const Icone = c.icone;
                    const selecionada = theme === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setTheme(c.id as MapTheme);
                          setMenuCamadasAberto(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition ${
                          selecionada
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icone className="h-3.5 w-3.5" />
                          <span>{c.label}</span>
                        </div>
                        {selecionada && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Toggle de Tráfego Mobile (Apenas no Modo 2D) */}
            {modoVisualizacao === "2D" && (
              <button
                onClick={() => setTrafegoAtivo(!trafegoAtivo)}
                className={`p-1.5 rounded-xl border transition ${
                  trafegoAtivo
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                }`}
                title={
                  trafegoAtivo
                    ? "Desativar trânsito em tempo real"
                    : "Ativar trânsito em tempo real"
                }
              >
                <Activity className="h-4 w-4 text-amber-500" />
              </button>
            )}

            {/* Mobile: Toda a Frota (Ver Frota / Frota Completa) */}
            <button
              type="button"
              onClick={() => {
                setModoVisaoFrota(true);
                const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
                if (modoVisualizacao === "3D") {
                  maplibreRef.current?.fitBounds(alvos);
                } else {
                  leafletRef.current?.fitBounds(alvos);
                }
              }}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
              title="Ver Frota: mostrar e enquadrar Frota Completa no mapa"
            >
              <Car className="h-4 w-4 text-blue-500" />
            </button>

            {/* Mobile: Todos os Postos */}
            {postosVigilancia.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (modoVisualizacao === "3D") {
                    maplibreRef.current?.fitBoundsPostos?.(postosVigilancia);
                  } else {
                    leafletRef.current?.fitBoundsPostos(postosVigilancia);
                  }
                }}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                title="Mostrar todos os postos"
              >
                <Building2 className="h-4 w-4 text-emerald-500" />
              </button>
            )}

            {/* Mobile: Mapa Geral */}
            <button
              type="button"
              onClick={() => {
                setModoVisaoFrota(true);
                const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
                if (modoVisualizacao === "3D") {
                  maplibreRef.current?.fitBoundsGeral?.(alvos, postosVigilancia);
                } else {
                  leafletRef.current?.fitBoundsGeral(alvos, postosVigilancia);
                }
              }}
              className="p-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-xs"
              title="Mapa Geral: Frota e Postos"
            >
              <Globe className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Visão Desktop Completa (hidden md:flex) */}
        <div className="hidden md:flex items-center justify-between w-full">
          {/* Lado Esquerdo: Contadores, Toggle de Sidebar e Abas de Modo Exclusivo */}
          <div className="flex items-center gap-2 text-xs">
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shrink-0 active:scale-95 transition cursor-pointer"
                title={voltarLabel || "Voltar"}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{voltarLabel || "Voltar"}</span>
              </button>
            )}

            <button
              onClick={() => setSidebarAberta(!sidebarAberta)}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 transition"
              title={sidebarAberta ? "Recolher lista" : "Expandir lista"}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            {/* Abas Principais de Modo Exclusivo (Zero Competição de Espaço) */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                onClick={() => alternarVisaoAtiva("mapa")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                  visaoAtiva === "mapa"
                    ? "bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5 text-orange-500" />
                <span>Mapa ao Vivo</span>
              </button>
              <button
                onClick={() => {
                  if (!veiculoSelecionado && veiculosFiltrados.length > 0) {
                    selecionarETestarVeiculo(veiculosFiltrados[0]);
                  }
                  alternarVisaoAtiva("cockpit");
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                  visaoAtiva === "cockpit"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isVeiculoSelecionadoPropriedade ? "Monitor 3D" : "Cockpit 3D"}</span>
                {veiculoSelecionado && (
                  <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-black/15 dark:bg-black/30 uppercase font-bold">
                    {veiculoSelecionado.placa}
                  </span>
                )}
              </button>
            </div>

            {/* Central de Alertas */}
            <button
              onClick={() => setModalCentralAlertasAberto(true)}
              className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700 font-bold transition text-xs"
              title="Central de Alertas Operacionais GD Rastreamento"
            >
              <Bell className="h-3.5 w-3.5 text-amber-500" />
              <span>Alertas</span>
              {totais.bloqueados > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>

            {rotaMonitoradaAtiva && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-300 font-bold text-xs animate-pulse">
                <Route className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <span
                  className="truncate max-w-[140px] sm:max-w-[220px]"
                  title={rotaMonitoradaAtiva.nome}
                >
                  {rotaMonitoradaAtiva.nome}
                </span>
                {rotaMonitoradaAtiva.desvio_detectado && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500 text-white font-mono">
                    Desvio {rotaMonitoradaAtiva.ultima_distancia_desvio_m}m
                  </span>
                )}
                <button
                  onClick={() => handleEncerrarRotaAtiva(rotaMonitoradaAtiva.id)}
                  className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition ml-0.5"
                  title="Desativar rota monitorada"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Lado Direito: Pulso da Central, Montar Rota, Alternador 2D/3D, Camadas, Trânsito, Fit Bounds e Fullscreen */}
          <div className="flex items-center gap-1.5 text-xs">
            {/* Indicador Discreto e Sempre Visível: Pulso da Central */}
            <button
              type="button"
              onClick={() => forcarReconexao()}
              title={
                pulsoCritico
                  ? `Alerta de Conexão: ${estadoPulso.rotulo}. Clique para reconectar.`
                  : `Pulso da Central Online · Última sincronização há ${textoTempoPulso}`
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition cursor-pointer shadow-xs ${
                pulsoCritico
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 animate-pulse"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15"
              }`}
            >
              {!conectado ? (
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
              ) : reconectando ? (
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    pulsoCritico ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                />
              )}
              <span>{estadoPulso.rotulo}</span>
            </button>

            {/* Botão de Montagem de Rota Inteligente */}
            <button
              onClick={() => abrirMontarRota()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 font-bold transition shadow-xs cursor-pointer active:scale-95"
              title="Montar Rota Inteligente (Otimização pelas ruas com múltiplos destinos)"
            >
              <Navigation className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              <span className="hidden sm:inline">Montar Rota</span>
            </button>

            {/* Seletor de Perspectiva: 2D vs 3D */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                onClick={() => alternarModoVisualizacao("2D")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  modoVisualizacao === "2D"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                2D
              </button>
              <button
                onClick={() => alternarModoVisualizacao("3D")}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                  modoVisualizacao === "3D"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
                title="Modo 3D com perspectiva e inclinação de 60 graus"
              >
                <Sparkles className="h-3 w-3" />
                <span>3D</span>
              </button>
            </div>

            {/* Menu de Camadas Oficiais */}
            <div className="relative">
              <button
                onClick={() => setMenuCamadasAberto(!menuCamadasAberto)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold transition"
                title="Alternar camadas do mapa"
              >
                <Layers className="h-4 w-4 text-orange-500" />
                <span>Camadas</span>
              </button>

              {menuCamadasAberto && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 shadow-2xl z-50 text-slate-800 dark:text-slate-200">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                    Provedor de Mapa
                  </div>
                  {camadas.map((c) => {
                    const Icone = c.icone;
                    const selecionada = theme === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setTheme(c.id as MapTheme);
                          setMenuCamadasAberto(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition ${
                          selecionada
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icone className="h-3.5 w-3.5" />
                          <span>{c.label}</span>
                        </div>
                        {selecionada && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Toggle de Tráfego (Apenas no Modo 2D) */}
            {modoVisualizacao === "2D" && (
              <button
                onClick={() => setTrafegoAtivo(!trafegoAtivo)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-semibold transition ${
                  trafegoAtivo
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
                title="Sobreposição de Trânsito / Tráfego"
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Tráfego</span>
              </button>
            )}

            {/* Botão Tela Cheia */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
              title={fullscreen ? "Sair da tela cheia" : "Modo tela cheia"}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Aviso Tático de Novo Veículo e Agendamento para o Cliente */}
      {session?.isCliente && (
        <div className="z-30 px-3 py-2 bg-amber-50/80 dark:bg-slate-950/60 border-b border-amber-500/20 backdrop-blur-md">
          <PainelAgendamentoCliente />
        </div>
      )}

      {/* Banner de Boas-Vindas e Degustação do Plano Master para Clientes Novos (Não exibido para quem já é Master) */}
      {session?.isCliente && session?.isTrialMaster && session?.planoContratado !== "master" && (
        <div className="z-30 px-3 py-1.5 bg-gradient-to-r from-orange-500/15 via-amber-500/15 to-orange-600/15 border-b border-orange-500/30 backdrop-blur-md flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium truncate">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
            <span className="truncate">
              Você está aproveitando <strong>30 dias de degustação do Plano Master</strong> com
              Montagem de Rotas e Cockpit 3D!
            </span>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 ml-2">
            {session.diasRestantesTrial}{" "}
            {session.diasRestantesTrial === 1 ? "dia restante" : "dias restantes"}
          </span>
        </div>
      )}

      {/* 2. Área Central: Modo Mapa ao Vivo (100% da viewport desobstruída) */}
      <div
        className={`flex-1 relative overflow-hidden min-h-0 ${
          visaoAtiva === "mapa" ? "flex" : "hidden"
        }`}
      >
        {/* Banner Crítico de Suspeita de Jammer / Silenciamento Súbito */}
        {veiculosComSuspeitaJammer.length > 0 && (
          <div className="absolute top-3 left-3 right-3 md:left-1/2 md:-translate-x-1/2 md:w-auto z-30 pointer-events-auto">
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-rose-950/95 border-2 border-rose-500 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-rose-300 uppercase tracking-wider">
                  🛑 ALERTA MÁXIMO: Suspeita de Jammer / Silenciamento
                </span>
                <span className="ml-2 font-mono font-bold text-white">
                  {veiculosComSuspeitaJammer.map((v) => v.placa).join(", ")}
                </span>
              </div>
              <button
                onClick={() => {
                  if (veiculosComSuspeitaJammer[0]) {
                    selecionarETestarVeiculo(veiculosComSuspeitaJammer[0]);
                  }
                  setModalCentralAlertasAberto(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition shadow-xs shrink-0"
              >
                Auditar Alerta
              </button>
            </div>
          </div>
        )}

        {/* Sidebar de Veículos */}
        {sidebarAberta && (
          <aside className="absolute md:relative z-10 w-72 sm:w-80 h-full bg-[#eaf0f8]/95 dark:bg-slate-900/95 md:bg-[#eaf0f8] md:dark:bg-slate-900 border-r border-slate-300/60 dark:border-slate-800 flex flex-col backdrop-blur-md md:backdrop-blur-none transition-all shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
            {/* Campo de Busca e Filtros Rápidos */}
            <div className="p-3 border-b border-slate-300/60 dark:border-slate-800 space-y-2">
              {/* Lista suspensa de clientes para Administrador e Operador (Padrão: Todos) */}
              {isOperadorOuAdmin && listaClientesUnicos.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 px-0.5">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-orange-500" />
                      Cliente:
                    </span>
                    {clienteFiltroSelecionado !== "todos" && (
                      <button
                        type="button"
                        onClick={() => setClienteFiltroSelecionado("todos")}
                        className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                        title="Limpar filtro de cliente"
                      >
                        Ver Todos
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      id="monitor-filtro-cliente"
                      name="monitor-filtro-cliente"
                      aria-label="Filtrar frota por cliente"
                      value={clienteFiltroSelecionado}
                      onChange={(e) => {
                        const novoCliente = e.target.value;
                        setClienteFiltroSelecionado(novoCliente);
                        setTimeout(() => {
                          const alvos =
                            novoCliente === "todos"
                              ? veiculos
                              : veiculos.filter((v) => v.cliente_id === novoCliente);
                          const postosAlvo =
                            novoCliente === "todos"
                              ? postosVigilancia
                              : postosVigilancia.filter(
                                  (p) => (p as any).cliente_id === novoCliente,
                                );
                          if (modoVisualizacao === "3D") {
                            maplibreRef.current?.fitBoundsGeral?.(alvos, postosAlvo);
                          } else {
                            leafletRef.current?.fitBoundsGeral(alvos, postosAlvo);
                          }
                        }, 100);
                      }}
                      className="w-full py-1.5 pl-2.5 pr-8 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 shadow-xs cursor-pointer appearance-none"
                    >
                      <option value="todos">
                        Todos os Clientes ({listaClientesUnicos.length})
                      </option>
                      {listaClientesUnicos.map((cli) => (
                        <option key={cli.id} value={cli.id}>
                          {cli.nome} ({cli.totalVeiculos + cli.totalPostos}{" "}
                          {cli.totalVeiculos + cli.totalPostos === 1 ? "ativo" : "ativos"})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Lista suspensa de usuários para o cliente que tem usuário (Padrão: Todos) */}
              {locatariosCliente.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 px-0.5">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-orange-500" />
                      Usuário:
                    </span>
                    {locatarioFiltroSelecionado !== "todos" && (
                      <button
                        type="button"
                        onClick={() => setLocatarioFiltroSelecionado("todos")}
                        className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                        title="Limpar filtro de usuário"
                      >
                        Ver Todos
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      id="monitor-filtro-usuario"
                      name="monitor-filtro-usuario"
                      aria-label="Filtrar frota por usuário"
                      value={locatarioFiltroSelecionado}
                      onChange={(e) => {
                        const novoLoc = e.target.value;
                        setLocatarioFiltroSelecionado(novoLoc);
                        setTimeout(() => {
                          const alvos =
                            novoLoc === "todos"
                              ? veiculos
                              : veiculos.filter((v) => {
                                  const locObj = locatariosCliente.find((l) => l.id === novoLoc);
                                  const perms = locObj?.veiculos_permitidos || [];
                                  return (
                                    perms.includes(v.id) ||
                                    Boolean(v.placa && perms.includes(v.placa))
                                  );
                                });
                          if (modoVisualizacao === "3D") {
                            maplibreRef.current?.fitBoundsGeral?.(alvos, postosVigilancia);
                          } else {
                            leafletRef.current?.fitBoundsGeral(alvos, postosVigilancia);
                          }
                        }, 100);
                      }}
                      className="w-full py-1.5 pl-2.5 pr-8 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 shadow-xs cursor-pointer appearance-none"
                    >
                      <option value="todos">Todos os Usuários ({locatariosCliente.length})</option>
                      {locatariosCliente.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.nome} ({loc.veiculos_permitidos?.length || 0} veíc.)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="monitor-busca-veiculos"
                    name="monitor-busca-veiculos"
                    aria-label="Buscar placa, modelo ou cliente"
                    type="text"
                    placeholder="Buscar placa, modelo, cliente..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] transition"
                  />
                </div>
                <button
                  onClick={() => setSidebarAberta(false)}
                  className="md:hidden p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  title="Fechar lista de veículos"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Botão de Ação Rápida: Montar Rota */}
              <button
                onClick={() => abrirMontarRota()}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 transition text-xs font-bold shadow-xs active:scale-98"
                title="Planejar Trajeto Inteligente com Múltiplas Paradas (Exclusivo Master)"
              >
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-4 w-4 text-orange-500" />
                  <span>Montar Rota Inteligente</span>
                </div>
                {recursosPlano.montarRota ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300 font-mono uppercase">
                    Liberado
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> Master
                  </span>
                )}
              </button>

              {/* Controles de Visão e Enquadramento no Mapa (Frota, Postos e Mapa Geral) */}
              <div className="p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-500" />
                    Visão no Mapa:
                  </span>
                  {veiculosFiltrados.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const proximo = !modoVisaoFrota;
                        setModoVisaoFrota(proximo);
                        if (proximo) {
                          const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
                          if (modoVisualizacao === "3D") {
                            maplibreRef.current?.fitBounds(alvos);
                          } else {
                            leafletRef.current?.fitBounds(alvos);
                          }
                        } else {
                          // Sai do modo Toda Frota: centraliza e aproxima para zoom automático 17
                          const alvo =
                            veiculoSelecionado ||
                            (veiculosFiltrados.length > 0 ? veiculosFiltrados[0] : null);
                          if (alvo) {
                            if (!veiculoSelecionado) setVeiculoSelecionado(alvo);
                            if (modoVisualizacao === "3D") {
                              maplibreRef.current?.centralizarVeiculo(alvo);
                            } else {
                              leafletRef.current?.centralizarVeiculo(alvo);
                            }
                          }
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        modoVisaoFrota
                          ? "bg-blue-600/15 text-blue-600 dark:text-blue-400"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                      title={
                        modoVisaoFrota
                          ? "Alternar para Foco Individual"
                          : "Alternar para Modo Frota"
                      }
                    >
                      {modoVisaoFrota ? "Modo Frota" : "Modo Foco"}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setModoVisaoFrota(true);
                      const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
                      if (modoVisualizacao === "3D") {
                        maplibreRef.current?.fitBounds(alvos);
                      } else {
                        leafletRef.current?.fitBounds(alvos);
                      }
                    }}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shadow-xs border border-slate-200 dark:border-slate-600 text-center"
                    title="Ver Frota: mostrar e enquadrar Frota Completa no mapa"
                  >
                    <Car className="h-3.5 w-3.5 text-blue-500 mb-0.5" />
                    <span className="text-[10px] font-bold leading-tight">
                      Toda Frota ({veiculosFiltrados.length})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (modoVisualizacao === "3D") {
                        maplibreRef.current?.fitBoundsPostos?.(postosVigilancia);
                      } else {
                        leafletRef.current?.fitBoundsPostos(postosVigilancia);
                      }
                    }}
                    disabled={postosVigilancia.length === 0}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-center transition shadow-xs border ${
                      postosVigilancia.length > 0
                        ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer border-slate-200 dark:border-slate-600"
                        : "opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700"
                    }`}
                    title={
                      postosVigilancia.length > 0
                        ? "Mostrar todos os postos: enquadra todos os postos de vigilância"
                        : "Nenhum posto de vigilância cadastrado"
                    }
                  >
                    <Building2 className="h-3.5 w-3.5 text-emerald-500 mb-0.5" />
                    <span className="text-[10px] font-bold leading-tight">Todos Postos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModoVisaoFrota(true);
                      const alvos = veiculosFiltrados.length > 0 ? veiculosFiltrados : veiculos;
                      if (modoVisualizacao === "3D") {
                        maplibreRef.current?.fitBoundsGeral?.(alvos, postosVigilancia);
                      } else {
                        leafletRef.current?.fitBoundsGeral(alvos, postosVigilancia);
                      }
                    }}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white transition cursor-pointer shadow-xs text-center"
                    title="Mapa Geral: enquadra simultaneamente toda a frota e todos os postos"
                  >
                    <Globe className="h-3.5 w-3.5 mb-0.5" />
                    <span className="text-[10px] font-bold leading-tight">Mapa Geral</span>
                  </button>
                </div>
              </div>

              {/* Filtros de Status (exibido para Administradores e Clientes titulares) */}
              {podeVerFiltrosStatus && (
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {[
                    { id: "todos", label: "Todos" },
                    { id: "em_rota", label: "Em Rota" },
                    { id: "parado", label: "Parados" },
                    { id: "estacionado", label: "Estacionados" },
                    { id: "bloqueado", label: "Bloqueados" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setFiltroStatus(s.id)}
                      className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                        filtroStatus === s.id
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Indicador de Filtro de Veículos Ativo */}
              {filtroVeiculosIds.length > 0 && (
                <div className="flex items-center justify-between px-2 py-1 bg-orange-500/10 text-orange-700 dark:text-orange-300 rounded-lg text-[10px] font-bold border border-orange-500/25">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Layers className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      Filtro de veículos ativo ({filtroVeiculosIds.length} selecionado
                      {filtroVeiculosIds.length > 1 ? "s" : ""})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroVeiculosIds([]);
                      localStorage.setItem("@hunter_filtro_veiculos_ids", "[]");
                      window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));
                    }}
                    className="underline hover:text-orange-950 dark:hover:text-white cursor-pointer ml-2 shrink-0 font-extrabold"
                  >
                    Mostrar Todos
                  </button>
                </div>
              )}

              {/* Barra de Resumo e Ação para Contas com Agrupamento por Cliente */}
              {isAgrupadoPorCliente && clientesAgrupados.length > 0 && (
                <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  <span>
                    {clientesAgrupados.length}{" "}
                    {clientesAgrupados.length === 1 ? "cliente" : "clientes"} ·{" "}
                    {veiculosFiltrados.length}{" "}
                    {veiculosFiltrados.length === 1 ? "veículo" : "veículos"}
                  </span>
                  <button
                    type="button"
                    onClick={alternarTodosClientes}
                    className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                  >
                    {clientesAgrupados.some((c) => Boolean(clientesExpandidos[c.id]))
                      ? "Recolher todos"
                      : "Expandir todos"}
                  </button>
                </div>
              )}
            </div>

            {/* Lista dos Veículos (Agrupada por Cliente para Usuários, ou Direta para Clientes/Instaladores) */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {/* Postos de Vigilância Ativos (Integrados ao Mapa Operacional como Clientes) */}
              {postosVigilancia.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 overflow-hidden shadow-sm mb-2">
                  <button
                    type="button"
                    onClick={() => setPostosExpandidos((prev) => !prev)}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-emerald-500/10 transition text-left cursor-pointer"
                    title={
                      postosExpandidos
                        ? "Recolher postos de vigilância"
                        : "Expandir postos de vigilância"
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            Postos de Vigilância
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-extrabold">
                            POSTO
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {postosVigilancia.length}{" "}
                            {postosVigilancia.length === 1 ? "propriedade" : "propriedades"}{" "}
                            monitorada{postosVigilancia.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-1.5">
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                          postosExpandidos ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </div>
                  </button>

                  {postosExpandidos && (
                    <div className="p-2 space-y-1.5 border-t border-emerald-500/20 bg-white/40 dark:bg-slate-900/40">
                      {postosVigilancia.map((posto) => {
                        const idPosto = `posto-${posto.id}`;
                        const isPostoSelecionado =
                          veiculoSelecionado?.id === idPosto || veiculoSelecionado?.id === posto.id;
                        return (
                          <div
                            key={posto.id}
                            onClick={() => {
                              leafletRef.current?.centralizarCoordenadas(
                                posto.latitude,
                                posto.longitude,
                                18,
                              );
                              maplibreRef.current?.centralizarCoordenadas?.(
                                posto.latitude,
                                posto.longitude,
                                18,
                              );
                              const ativoPropriedade = converterPostoEmVeiculoGps(
                                posto,
                                turnosVigilancia,
                                veiculos,
                              );
                              selecionarETestarVeiculo(ativoPropriedade);
                            }}
                            className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer shadow-xs group ${
                              isPostoSelecionado
                                ? "bg-emerald-500/15 dark:bg-emerald-950/40 border-2 border-emerald-500 ring-2 ring-emerald-500/20"
                                : "bg-white/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700/60"
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {posto.nome}
                                </span>
                              </div>
                              {posto.endereco && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {posto.endereco}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const ativoPropriedade = converterPostoEmVeiculoGps(
                                    posto,
                                    turnosVigilancia,
                                    veiculos,
                                  );
                                  selecionarETestarVeiculo(ativoPropriedade);
                                  alternarVisaoAtiva("cockpit");
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500 hover:text-white transition shrink-0 cursor-pointer text-[10px] font-bold flex items-center gap-1"
                                title="Abrir Monitor 3D desta propriedade"
                              >
                                <Sparkles className="h-3 w-3" />
                                <span>Monitor 3D</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  leafletRef.current?.centralizarCoordenadas(
                                    posto.latitude,
                                    posto.longitude,
                                    18,
                                  );
                                  maplibreRef.current?.centralizarCoordenadas?.(
                                    posto.latitude,
                                    posto.longitude,
                                    18,
                                  );
                                  const ativoPropriedade = converterPostoEmVeiculoGps(
                                    posto,
                                    turnosVigilancia,
                                    veiculos,
                                  );
                                  selecionarETestarVeiculo(ativoPropriedade);
                                }}
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition shrink-0 cursor-pointer"
                                title="Focar no Mapa"
                              >
                                <Crosshair className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {veiculosFiltrados.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500 font-mono">
                  {carregando ? "Carregando frota..." : "Nenhum veículo encontrado."}
                </div>
              ) : isAgrupadoPorCliente ? (
                clientesAgrupados.map((c) => {
                  const isExpandido = Boolean(clientesExpandidos[c.id]);
                  const temVeiculoSelecionado = c.veiculos.some(
                    (v) => v.id === veiculoSelecionado?.id,
                  );

                  return (
                    <div
                      key={c.id}
                      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                        temVeiculoSelecionado
                          ? "border-orange-500/40 bg-orange-500/5 dark:bg-orange-950/20 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60"
                      }`}
                    >
                      {/* Cabeçalho do Cliente com Expansão Acordeom */}
                      <button
                        type="button"
                        onClick={() => toggleCliente(c.id)}
                        className="w-full flex items-center justify-between p-2.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition text-left"
                        title={isExpandido ? "Recolher veículos" : "Expandir veículos"}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
                            <Users className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                {c.nome}
                              </span>
                              {c.temAlerta && (
                                <span className="text-[9px] px-1 rounded bg-rose-500 text-white font-bold animate-pulse">
                                  ALERTA
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span className="font-semibold text-orange-600 dark:text-orange-400">
                                {c.veiculos.length}{" "}
                                {c.veiculos.length === 1 ? "veículo" : "veículos"}
                              </span>
                              {c.totalEmRota > 0 && (
                                <span className="text-orange-500 font-medium">
                                  · {c.totalEmRota} em rota
                                </span>
                              )}
                              {c.totalBloqueados > 0 && (
                                <span className="text-rose-500 font-medium">
                                  · {c.totalBloqueados} bloq.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                          <ChevronDown
                            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                              isExpandido ? "rotate-0" : "-rotate-90"
                            }`}
                          />
                        </div>
                      </button>

                      {/* Lista de Veículos do Cliente */}
                      {isExpandido && (
                        <div className="p-2 pt-1 space-y-1.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30">
                          {c.veiculos.map((v) => {
                            const isSelected = veiculoSelecionado?.id === v.id;
                            const isBloqueado = v.bloqueado;
                            const isLigado = v.ignicao;
                            const temAlerta = v.alerta_acidente;
                            const statusCom = avaliarStatusComunicacao(v.ultima_atualizacao);

                            return (
                              <button
                                key={v.id}
                                onClick={() => selecionarETestarVeiculo(v)}
                                className={`w-full text-left p-2.5 rounded-xl border transition-all duration-150 flex items-center justify-between interactive-tactile-card active:scale-[0.98] ${
                                  isSelected
                                    ? "bg-orange-500/15 border-orange-500/60 shadow-xs ring-1 ring-orange-500/30"
                                    : "bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                      !podeAcessarLocalizacaoVeiculo(session, v)
                                        ? "bg-amber-500/70"
                                        : temAlerta
                                          ? "bg-rose-500 animate-ping"
                                          : isBloqueado
                                            ? "bg-rose-500"
                                            : isLigado
                                              ? "bg-orange-500 animate-pulse"
                                              : "bg-slate-400 dark:bg-slate-600"
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <div className="font-mono font-black text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                                      <span>{v.placa}</span>
                                      {isBloqueado && (
                                        <span className="text-[9px] px-1 rounded bg-rose-500/15 text-rose-500 font-bold">
                                          BLOQ
                                        </span>
                                      )}
                                      {temAlerta && (
                                        <span className="text-[9px] px-1 rounded bg-rose-500 text-white font-bold">
                                          IMPACTO
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                      {v.marca_modelo}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span
                                        className={`inline-flex items-center gap-1 text-[9px] font-bold ${
                                          statusCom.ativo
                                            ? "text-orange-600 dark:text-orange-400"
                                            : "text-rose-600 dark:text-rose-400"
                                        }`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${
                                            statusCom.ativo
                                              ? "bg-orange-500 animate-pulse"
                                              : "bg-rose-500"
                                          }`}
                                        />
                                        {statusCom.rotulo}
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-700 text-[9px]">
                                        ·
                                      </span>
                                      <span className="text-[9px] text-slate-400 truncate">
                                        {statusCom.detalhe}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right font-mono text-xs shrink-0 pl-1 font-tabular">
                                  {podeAcessarLocalizacaoVeiculo(session, v) ? (
                                    <span className="text-orange-600 dark:text-orange-400 font-black block text-[11px]">
                                      {v.velocidade} km/h
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25 inline-flex items-center gap-1">
                                      <EyeOff className="w-2.5 h-2.5" /> Sigilo
                                    </span>
                                  )}
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 ml-auto" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* Modo Direto: Para contas de clientes autenticados ou instaladores */
                veiculosFiltrados.map((v) => {
                  const isSelected = veiculoSelecionado?.id === v.id;
                  const isBloqueado = v.bloqueado;
                  const isLigado = v.ignicao;
                  const temAlerta = v.alerta_acidente;
                  const statusCom = avaliarStatusComunicacao(v.ultima_atualizacao);
                  const podeVer = podeAcessarLocalizacaoVeiculo(session, v);

                  return (
                    <button
                      key={v.id}
                      onClick={() => selecionarETestarVeiculo(v)}
                      className={`w-full text-left p-2.5 rounded-2xl border transition-all duration-150 flex items-center justify-between interactive-tactile-card active:scale-[0.98] ${
                        isSelected
                          ? "bg-orange-500/10 border-orange-500/50 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            !podeVer
                              ? "bg-amber-500/70"
                              : temAlerta
                                ? "bg-rose-500 animate-ping"
                                : isBloqueado
                                  ? "bg-rose-500"
                                  : isLigado
                                    ? "bg-orange-500 animate-pulse"
                                    : "bg-slate-400 dark:bg-slate-600"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="font-mono font-black text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                            <span>{v.placa}</span>
                            {isBloqueado && (
                              <span className="text-[9px] px-1 rounded bg-rose-500/15 text-rose-500 font-bold">
                                BLOQ
                              </span>
                            )}
                            {temAlerta && (
                              <span className="text-[9px] px-1 rounded bg-rose-500 text-white font-bold">
                                IMPACTO
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {v.marca_modelo} · {v.cliente_nome || "Cliente"}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                statusCom.ativo
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  statusCom.ativo ? "bg-orange-500 animate-pulse" : "bg-rose-500"
                                }`}
                              />
                              {statusCom.rotulo}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700 text-[9px]">·</span>
                            <span className="text-[10px] text-slate-400 truncate">
                              {statusCom.detalhe}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono text-xs">
                        {podeVer ? (
                          <span className="text-orange-600 dark:text-orange-400 font-black block">
                            {v.velocidade} km/h
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25 inline-flex items-center gap-1">
                            <EyeOff className="w-2.5 h-2.5" /> Sigilo
                          </span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 ml-auto" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Motores de Mapa: Alternância fluida entre Leaflet 2D e MapLibre 3D */}
        <div className="flex-1 h-full min-h-[280px] relative">
          {/* Banner Tático de Orientação: Quando nenhum veículo está selecionado na frota */}
          {!veiculoSelecionado && veiculosFiltrados.length > 1 && !modoVisaoFrota && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
              <div className="px-4 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-white shadow-xl shadow-slate-300/40 dark:shadow-2xl flex items-center gap-3 text-xs font-semibold">
                <Navigation className="h-4 w-4 text-orange-600 dark:text-orange-400 animate-pulse shrink-0" />
                <span>Selecione um veículo na lista para visualizar no mapa</span>
                <button
                  type="button"
                  onClick={() => {
                    setModoVisaoFrota(true);
                    setTimeout(() => {
                      if (modoVisualizacao === "3D") {
                        maplibreRef.current?.fitBounds(veiculosFiltrados);
                      } else {
                        leafletRef.current?.fitBounds(veiculosFiltrados);
                      }
                    }, 100);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow transition active:scale-95 cursor-pointer shrink-0"
                >
                  Ver toda a frota
                </button>
              </div>
            </div>
          )}

          {/* Banner Flutuante de Alerta Máximo se o Veículo Estiver Fora da Rota Monitorada */}
          {rotaMonitoradaAtiva && rotaMonitoradaAtiva.desvio_detectado && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[30] max-w-lg w-[92%] sm:w-auto px-4 py-2.5 rounded-2xl bg-rose-600/95 text-white shadow-2xl backdrop-blur-md border border-rose-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="h-5 w-5 text-amber-200 animate-bounce shrink-0" />
                <div className="text-xs">
                  <span className="font-black uppercase tracking-wider block text-amber-200">
                    Alerta: Fora da Rota Monitorada!
                  </span>
                  <span className="text-[11px] text-white/95">
                    {veiculoSelecionado?.placa} desviou{" "}
                    {rotaMonitoradaAtiva.ultima_distancia_desvio_m}m das ruas do trajeto.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {veiculoSelecionado && (
                  <button
                    onClick={() => centralizarNoVeiculo(veiculoSelecionado)}
                    className="px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition"
                    title="Recentralizar no veículo"
                  >
                    Localizar
                  </button>
                )}
                <button
                  onClick={() => handleEncerrarRotaAtiva(rotaMonitoradaAtiva.id)}
                  className="p-1 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition"
                  title="Encerrar monitoramento de rota"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Docking Bar Tática Compacta do Veículo Selecionado (100% de mapa livre) */}
          {veiculoSelecionado && (
            <div className="absolute bottom-0 left-0 right-0 z-[25]">
              <VehicleTelemetryDrawer
                veiculo={veiculoSelecionado}
                veiculos={todosAtivosMonitorados}
                postos={postosVigilancia}
                turnos={turnosVigilancia}
                onSelectVeiculo={selecionarETestarVeiculo}
                onCentralizarVeiculo={centralizarNoVeiculo}
                onBloquearToggle={executarBloqueio}
                onAbrirPlayback={(v, viagemId) => {
                  setModalRefazerTrajetoVeiculo(v);
                  setViagemInicialPlaybackId(viagemId);
                }}
                onAbrirTrajetoInteligente={(v) => abrirMontarRota(v)}
                onAbrirRotasMonitoradas={(v) => abrirRotasMonitoradas(v)}
                podeVerSensores={recursosPlano.sensoresFisicos}
                podeVerEletrica={recursosPlano.telemetriaEletrica}
                podeVerSatelites={recursosPlano.rumoESatelites}
                onSolicitarUpgrade={(recurso) => {
                  setRecursoParaUpgrade(recurso);
                  setModalUpgradeAberto(true);
                }}
                recolhido={true}
                onToggleRecolhido={() => alternarVisaoAtiva("cockpit")}
                onVoltarAoMapa={() => alternarVisaoAtiva("mapa")}
                onDeselecionarVeiculo={
                  veiculosFiltrados.length > 1 ? () => setVeiculoSelecionado(null) : undefined
                }
              />
            </div>
          )}

          {/* Canvas do Mapa */}
          <div className="w-full h-full relative">
            {modoVisualizacao === "2D" ? (
              <LeafletEngine
                ref={leafletRef}
                veiculos={veiculosNoMapa}
                theme={theme}
                trafegoAtivo={trafegoAtivo}
                veiculoSelecionado={veiculoSelecionado}
                onSelectVeiculo={handleSelectVeiculoMapa}
                postos={postosVigilancia}
                onSelectPosto={(posto) => {
                  leafletRef.current?.centralizarCoordenadas(posto.latitude, posto.longitude, 18);
                  const ativo = converterPostoEmVeiculoGps(posto, turnosVigilancia, veiculos);
                  selecionarETestarVeiculo(ativo);
                }}
                rotaMonitorada={rotaMonitoradaAtiva}
              />
            ) : (
              <MapErrorBoundary
                fallback={
                  <LeafletEngine
                    ref={leafletRef}
                    veiculos={veiculosNoMapa}
                    theme={theme}
                    trafegoAtivo={trafegoAtivo}
                    veiculoSelecionado={veiculoSelecionado}
                    onSelectVeiculo={handleSelectVeiculoMapa}
                    postos={postosVigilancia}
                    onSelectPosto={(posto) => {
                      leafletRef.current?.centralizarCoordenadas(
                        posto.latitude,
                        posto.longitude,
                        18,
                      );
                      const ativo = converterPostoEmVeiculoGps(posto, turnosVigilancia, veiculos);
                      selecionarETestarVeiculo(ativo);
                    }}
                    rotaMonitorada={rotaMonitoradaAtiva}
                  />
                }
              >
                <MapLibre3DEngine
                  ref={maplibreRef}
                  veiculos={veiculosNoMapa}
                  theme={theme}
                  veiculoSelecionado={veiculoSelecionado}
                  onSelectVeiculo={handleSelectVeiculoMapa}
                  rotaMonitorada={rotaMonitoradaAtiva}
                />
              </MapErrorBoundary>
            )}
          </div>
        </div>
      </div>

      {/* 3. Visualização Exclusiva de Cockpit 3D e Telemetria (Zero Competição com o Mapa) */}
      {visaoAtiva === "cockpit" && (
        <div className="flex-1 h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <VehicleTelemetryDrawer
            veiculo={veiculoSelecionado || todosAtivosMonitorados[0] || null}
            veiculos={todosAtivosMonitorados}
            postos={postosVigilancia}
            turnos={turnosVigilancia}
            onSelectVeiculo={selecionarETestarVeiculo}
            onCentralizarVeiculo={centralizarNoVeiculo}
            onBloquearToggle={executarBloqueio}
            onAbrirPlayback={(v, viagemId) => {
              setModalRefazerTrajetoVeiculo(v);
              setViagemInicialPlaybackId(viagemId);
            }}
            onAbrirTrajetoInteligente={(v) => abrirMontarRota(v)}
            onAbrirRotasMonitoradas={(v) => abrirRotasMonitoradas(v)}
            podeVerSensores={recursosPlano.sensoresFisicos}
            podeVerEletrica={recursosPlano.telemetriaEletrica}
            podeVerSatelites={recursosPlano.rumoESatelites}
            onSolicitarUpgrade={(recurso) => {
              setRecursoParaUpgrade(recurso);
              setModalUpgradeAberto(true);
            }}
            recolhido={false}
            onToggleRecolhido={() => alternarVisaoAtiva("mapa")}
            onVoltarAoMapa={() => alternarVisaoAtiva("mapa")}
            onDeselecionarVeiculo={() => {
              setVeiculoSelecionado(null);
              alternarVisaoAtiva("mapa");
            }}
          />
        </div>
      )}

      {/* 3.5. Barra de Navegação Tática Inferior no Mobile (md:hidden) */}
      <nav className="md:hidden z-30 px-2 py-1.5 pb-safe bg-[#eaf0f8]/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-300/60 dark:border-slate-800 flex items-center justify-around text-slate-600 dark:text-slate-400 shadow-lg shrink-0">
        {/* Aba 1: Mapa */}
        <button
          onClick={() => alternarVisaoAtiva("mapa")}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[10px] font-bold transition active:scale-95 ${
            visaoAtiva === "mapa"
              ? "text-orange-600 dark:text-orange-400 bg-orange-500/10"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <MapIcon className="h-4 w-4" />
          <span>Mapa</span>
        </button>

        {/* Aba 2: Cockpit 3D */}
        <button
          onClick={() => {
            if (!veiculoSelecionado && veiculosFiltrados.length > 0) {
              selecionarETestarVeiculo(veiculosFiltrados[0]);
            }
            alternarVisaoAtiva("cockpit");
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[10px] font-bold transition active:scale-95 ${
            visaoAtiva === "cockpit"
              ? "text-orange-600 dark:text-orange-400 bg-orange-500/10"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>{isVeiculoSelecionadoPropriedade ? "Monitor 3D" : "Cockpit 3D"}</span>
        </button>

        {/* Aba 3: Rotas Monitoradas */}
        <button
          onClick={() => abrirRotasMonitoradas()}
          className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:text-orange-500 active:scale-95 transition"
        >
          <Route className="h-4 w-4 text-orange-500" />
          <span>Rotas</span>
        </button>

        {/* Aba 4: Alertas */}
        <button
          onClick={() => setModalCentralAlertasAberto(true)}
          className="relative flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:text-amber-500 active:scale-95 transition"
        >
          <Bell className="h-4 w-4 text-amber-500" />
          <span>Alertas</span>
          {totais.bloqueados > 0 && (
            <span className="absolute top-1 right-3 h-2 w-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </button>

        {/* Aba 5: Frota */}
        <button
          onClick={() => setSidebarAberta(!sidebarAberta)}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[10px] font-bold transition active:scale-95 ${
            sidebarAberta
              ? "text-orange-600 dark:text-orange-400 bg-orange-500/10"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <Car className="h-4 w-4" />
          <span>Frota ({totais.total})</span>
        </button>
      </nav>

      {/* 4. Modal de Refazer Trajeto em 2D e 3D */}
      {modalRefazerTrajetoVeiculo && (
        <RefazerTrajetoModal
          veiculo={modalRefazerTrajetoVeiculo}
          viagemInicialId={viagemInicialPlaybackId}
          onFechar={() => {
            setModalRefazerTrajetoVeiculo(null);
            setViagemInicialPlaybackId(undefined);
          }}
          podeUsar3D={recursosPlano.modo3D}
        />
      )}

      {/* 5. Modal de Trajeto Inteligente */}
      {modalTrajetoInteligenteVeiculo && (
        <TrajetoInteligenteModal
          veiculo={modalTrajetoInteligenteVeiculo}
          trajetoInicial={trajetoParaCarregar}
          onRotaAtivada={(novaRota) => setRotaMonitoradaAtiva(novaRota)}
          onFechar={() => {
            setModalTrajetoInteligenteVeiculo(null);
            setTrajetoParaCarregar(null);
          }}
        />
      )}

      {/* 5.5. Modal de Rotas Monitoradas (Onde vê, altera tolerância e exclui do banco) */}
      {modalRotasMonitoradasAberto &&
        (modalRotasVeiculo || veiculoSelecionado || veiculosFiltrados[0]) && (
          <PainelRotasMonitoradasModal
            veiculo={modalRotasVeiculo || veiculoSelecionado || veiculosFiltrados[0]}
            onFechar={() => {
              setModalRotasMonitoradasAberto(false);
              setModalRotasVeiculo(null);
            }}
            onAbrirNovoTrajeto={() => {
              setModalRotasMonitoradasAberto(false);
              setTrajetoParaCarregar(null);
              abrirMontarRota(modalRotasVeiculo || veiculoSelecionado);
            }}
            onAbrirComTrajeto={(trajeto) => {
              setModalRotasMonitoradasAberto(false);
              setTrajetoParaCarregar(trajeto);
              abrirMontarRota(modalRotasVeiculo || veiculoSelecionado);
            }}
          />
        )}

      {/* 6. Modal de Upgrade de Plano */}
      <UpgradePlanoModal
        aberto={modalUpgradeAberto}
        onFechar={() => setModalUpgradeAberto(false)}
        recursoSolicitado={recursoParaUpgrade}
      />

      {/* 7. Central de Alertas Operacionais */}
      <CentralAlertasModal
        aberto={modalCentralAlertasAberto}
        onFechar={() => setModalCentralAlertasAberto(false)}
        veiculo={veiculoSelecionado}
        veiculos={veiculos}
        onSelectVeiculo={(v) => {
          selecionarETestarVeiculo(v);
          setModalCentralAlertasAberto(false);
        }}
      />

      {/* 9. Modal Canônico de Bloqueio de Localização por Pendência Financeira ou Administrativa */}
      <ModalBloqueioLocalizacaoRastreador
        aberto={modalBloqueioLocalizacaoAberto}
        onFechar={() => setModalBloqueioLocalizacaoAberto(false)}
        isMotorista={Boolean(session?.isMotorista || session?.role === "motorista")}
        statusFinanceiro={statusFinanceiro}
        onVerificarNovamente={async () => {
          if (!session) return;
          const st = await verificarStatusFinanceiroCliente(
            session.userId,
            session.clienteId,
            Boolean(session.isMotorista || session.role === "motorista"),
          );
          setStatusFinanceiro(st);
          if (!st.bloqueioLocalizacao) {
            setModalBloqueioLocalizacaoAberto(false);
          }
        }}
      />
    </div>
  );
}
