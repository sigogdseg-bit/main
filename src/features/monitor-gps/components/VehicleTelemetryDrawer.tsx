import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  Gauge,
  Battery,
  BatteryCharging,
  Compass,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Navigation,
  Activity,
  AlertTriangle,
  Play,
  Lock,
  Sparkles,
  Zap,
  Wrench,
  Radio,
  Cpu,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Loader2,
  Shield,
  Share2,
  HeartPulse,
  History,
  Route,
  ArrowLeft,
  X,
  SlidersHorizontal,
  LocateFixed,
  EyeOff,
  RotateCw,
  RotateCcw,
  Layers,
  ShieldAlert,
  Signal,
  Wifi,
  Calculator,
  Headphones,
} from "lucide-react";
import { toast } from "sonner";
import type { VeiculoGps } from "../types";
import {
  MotorOdometroPropostaA,
  MotorOdometroPropostaB,
  MotorOdometroPropostaC,
  calcularOdometroMedia1456,
  type LeituraMostrador,
  type TelemetriaPingComparativo,
} from "../lib/motoresOdometroComparativo";
import {
  avaliarStatusComunicacao,
  testarComunicacaoRastreador,
  consultarOdometroHardwareJ16,
  calibrarOdometroHardwareJ16,
} from "../services/gpsService";
import { obterRumoVeiculo } from "../services/orientacaoRuaService";
import { detectarSuspeitaJammer } from "../services/anomaliaService";
import { obterInfoPingReal } from "../utils/telemetriaDinamica";
import { TiltCard } from "@/shared/components/TiltCard";
import { AreasSegurasModal } from "./AreasSegurasModal";
import { TimelineVeiculoDrawer } from "./TimelineVeiculoDrawer";
import { SaudeRastreadorModal } from "./SaudeRastreadorModal";
import { ModoViagemModal } from "./ModoViagemModal";
import { CompartilharLocalizacaoModal } from "./CompartilharLocalizacaoModal";
import { ConfiguracaoProtecaoModal } from "./ConfiguracaoProtecaoModal";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { SafeModalBoundary } from "@/shared/components/SafeModalBoundary";
import { carregarCompartilhamentosAtivos } from "../services/compartilhamentoService";
import { ResumoDiarioCard } from "./ResumoDiarioCard";
import { ModalBloqueioSeguroVeiculo } from "./ModalBloqueioSeguroVeiculo";
import { Vehicle3DGraphic } from "./Vehicle3DGraphic";
import {
  obterRotuloTipoVeiculo,
  formatarPlacaOuChassi,
  obterCorStatusVeiculo,
} from "../utils/vehicle3dIcons";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarLocalizacaoVeiculo } from "../utils/privacidadeLocalizacao";
import { PainelSaudePrivacidadeRastreador } from "./PainelSaudePrivacidadeRastreador";
import { supabase } from "@/integrations/supabase/client";
import type { PostoVigilancia, TurnoVigilancia } from "@/features/vigilantes/types";
import { isPropriedadeMonitorada } from "../utils/propriedadeMonitoradaUtils";
import { MostradoresMonitor3D } from "./MostradoresMonitor3D";

interface VehicleTelemetryDrawerProps {
  veiculo: VeiculoGps | null;
  veiculos?: VeiculoGps[];
  postos?: PostoVigilancia[];
  turnos?: TurnoVigilancia[];
  onSelectVeiculo?: (veiculo: VeiculoGps) => void;
  onCentralizarVeiculo?: (veiculo: VeiculoGps) => void;
  onBloquearToggle: (veiculoId: string, bloquear: boolean) => void;
  onAbrirPlayback: (veiculo: VeiculoGps, viagemId?: string) => void;
  onAbrirTrajetoInteligente?: (veiculo: VeiculoGps) => void;
  onAbrirRotasMonitoradas?: (veiculo: VeiculoGps) => void;
  podeVerSensores?: boolean;
  podeVerEletrica?: boolean;
  podeVerSatelites?: boolean;
  onSolicitarUpgrade?: (recurso: string) => void;
  recolhido?: boolean;
  onToggleRecolhido?: () => void;
  onVoltarAoMapa?: () => void;
  onDeselecionarVeiculo?: () => void;
}

export function VehicleTelemetryDrawer({
  veiculo,
  veiculos,
  postos,
  turnos,
  onSelectVeiculo,
  onCentralizarVeiculo,
  onBloquearToggle,
  onAbrirPlayback,
  onAbrirTrajetoInteligente,
  onAbrirRotasMonitoradas,
  podeVerSensores = true,
  podeVerEletrica = true,
  podeVerSatelites = true,
  onSolicitarUpgrade,
  recolhido = false,
  onToggleRecolhido,
  onVoltarAoMapa,
  onDeselecionarVeiculo,
}: VehicleTelemetryDrawerProps) {
  const [copiado, setCopiado] = useState(false);
  const [testandoCom, setTestandoCom] = useState(false);
  const [ultimoPing, setUltimoPing] = useState<number | null>(null);
  const [menuAcoesAberto, setMenuAcoesAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnAcoesRef = useRef<HTMLButtonElement>(null);
  const btnAcoesCockpitRef = useRef<HTMLButtonElement>(null);

  // Fechar menu de ações ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        (menuRef.current && menuRef.current.contains(target)) ||
        (btnAcoesRef.current && btnAcoesRef.current.contains(target)) ||
        (btnAcoesCockpitRef.current && btnAcoesCockpitRef.current.contains(target))
      ) {
        return;
      }
      setMenuAcoesAberto(false);
    }
    if (menuAcoesAberto) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuAcoesAberto]);

  // Estados dos Novos Modais do Hunter
  const [modalAreasAberto, setModalAreasAberto] = useState(false);
  const [modalProtecaoAberto, setModalProtecaoAberto] = useState(false);
  const [modalTimelineAberto, setModalTimelineAberto] = useState(false);
  const [modalSaudeAberto, setModalSaudeAberto] = useState(false);
  const [modalModoViagemAberto, setModalModoViagemAberto] = useState(false);
  const [modalCompartilharAberto, setModalCompartilharAberto] = useState(false);
  const [modalBloqueioSeguroAberto, setModalBloqueioSeguroAberto] = useState(false);
  const [linksCompartilhamentoAtivos, setLinksCompartilhamentoAtivos] = useState<number>(0);
  const [consultandoOdometroMcu, setConsultandoOdometroMcu] = useState(false);
  const [calibrandoOdometroMcu, setCalibrandoOdometroMcu] = useState(false);
  const [odometroMcuLocal, setOdometroMcuLocal] = useState<number | null>(null);
  const [odometroMcuAtualizadoEmLocal, setOdometroMcuAtualizadoEmLocal] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setOdometroMcuLocal(null);
    setOdometroMcuAtualizadoEmLocal(null);
  }, [veiculo?.id]);

  const isPropriedade = useMemo(() => {
    return isPropriedadeMonitorada(veiculo, turnos, postos);
  }, [veiculo, turnos, postos]);

  const postoVinculado = useMemo(() => {
    if (!postos || postos.length === 0 || !veiculo) return null;
    return postos.find((p) => p.id === veiculo.id || `posto-${p.id}` === veiculo.id) || null;
  }, [postos, veiculo]);

  const turnoAtivo = useMemo(() => {
    if (!turnos || turnos.length === 0 || !veiculo) return null;
    return (
      turnos.find(
        (t) =>
          veiculo.rastreador_imei &&
          t.rastreador_imei &&
          t.rastreador_imei.trim() === veiculo.rastreador_imei.trim(),
      ) || null
    );
  }, [turnos, veiculo]);

  useEffect(() => {
    let cancelado = false;
    if (!veiculo?.id) {
      setLinksCompartilhamentoAtivos(0);
      return;
    }
    carregarCompartilhamentosAtivos(veiculo.id)
      .then((lista) => {
        if (!cancelado) {
          setLinksCompartilhamentoAtivos(lista.length);
        }
      })
      .catch(() => {
        if (!cancelado) setLinksCompartilhamentoAtivos(0);
      });

    return () => {
      cancelado = true;
    };
  }, [veiculo?.id, modalCompartilharAberto]);

  const statusComunicacao = useMemo(() => {
    return avaliarStatusComunicacao(veiculo?.ultima_atualizacao);
  }, [veiculo?.ultima_atualizacao]);

  const { session } = useAuth();
  const temAcessoLocalizacao = useMemo(() => {
    return podeAcessarLocalizacaoVeiculo(session, veiculo);
  }, [session, veiculo]);

  // Operadores NÃO devem visualizar a condição do veículo (parado, em rota, estacionado).
  // Além disso, quando o veículo está em Modo de Privacidade, a condição operacional
  // é estritamente ocultada de todos os usuários.
  const podeVerCondicaoOperacional = useMemo(() => {
    if (!temAcessoLocalizacao) return false;
    if (session?.role === "operador") return false;
    return Boolean(
      session?.isAdmin ||
      session?.isCliente ||
      session?.isMotorista ||
      session?.role === "motorista",
    );
  }, [temAcessoLocalizacao, session]);

  const suspeitaJammer = useMemo(() => {
    if (!veiculo) return { suspeita: false, minutosSemSinal: 0, ultimaVelocidade: 0 };
    return detectarSuspeitaJammer(veiculo);
  }, [veiculo]);

  const handleTestarComunicacao = async () => {
    if (!veiculo) return;
    setTestandoCom(true);
    const toastId = toast.loading(
      `Testando comunicacao do veiculo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}...`,
    );
    try {
      const res = await testarComunicacaoRastreador(veiculo.id);
      setUltimoPing(res.latenciaMs);
      if (res.ativo) {
        toast.success(res.mensagem, { id: toastId, duration: 4500 });
      } else {
        toast.warning(res.mensagem, { id: toastId, duration: 5500 });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Falha ao comunicar com o rastreador.");
    } finally {
      setTestandoCom(false);
    }
  };

  const handleConsultarOdometroMcu = async () => {
    if (!veiculo) return;
    const modeloRastreador = veiculo.rastreador_modelo || "G900L";
    setConsultandoOdometroMcu(true);
    const toastId = toast.loading(
      `Consultando odômetro / status da MCU (${modeloRastreador} IMEI ${veiculo.rastreador_imei || "—"})...`,
    );
    try {
      const res = await consultarOdometroHardwareJ16(
        veiculo.rastreador_imei || null,
        veiculo.id,
        modeloRastreador,
      );
      if (res.success) {
        toast.success(res.mensagem, { id: toastId, duration: 5000 });
      } else {
        toast.warning(res.mensagem, { id: toastId, duration: 6000 });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Falha ao enviar comando de leitura para o rastreador.");
    } finally {
      setConsultandoOdometroMcu(false);
    }
  };

  const handleCalibrarOdometroMcu = async () => {
    if (!veiculo) return;
    const modeloRastreador = veiculo.rastreador_modelo || "G900L";
    const odometroAlvo = Number(veiculo.odometro || 0);
    const confirma = window.confirm(
      `Deseja sincronizar a MCU ${modeloRastreador} gravando o odômetro atual do sistema (${odometroAlvo.toFixed(1)} km) na memória do rastreador?`,
    );
    if (!confirma) return;
    setCalibrandoOdometroMcu(true);
    const toastId = toast.loading(
      `Gravando ${odometroAlvo.toFixed(1)} km na MCU ${modeloRastreador}...`,
    );
    try {
      const res = await calibrarOdometroHardwareJ16(
        odometroAlvo,
        veiculo.rastreador_imei || null,
        veiculo.id,
        modeloRastreador,
      );
      if (res.success) {
        setOdometroMcuLocal(Math.round(odometroAlvo));
        setOdometroMcuAtualizadoEmLocal(new Date().toISOString());
        toast.success(res.mensagem, { id: toastId, duration: 5000 });
      } else {
        toast.warning(res.mensagem, { id: toastId, duration: 6000 });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Falha ao enviar comando de calibração para o rastreador.");
    } finally {
      setCalibrandoOdometroMcu(false);
    }
  };

  if (!veiculo) return null;

  const isBloqueado = veiculo.bloqueado;
  const temBloqueador = veiculo.bloqueador_instalado !== false;
  const isEmRota = veiculo.status_operacional === "em_rota";
  const isParadoLigado = veiculo.status_operacional === "parado_ligado";
  const temAlerta = veiculo.alerta_acidente;

  // Sigilo Operacional: Informações do tipo/tecnologia de bloqueio (Relé, CAN/LIN, etc.)
  // são visíveis exclusivamente para Administradores e Operadores. Clientes e Motoristas não veem.
  const podeVerTipoBloqueador = Boolean(
    session?.isSuperAdmin || session?.isAdmin || session?.isOperador,
  );
  const isEquipeTecnica = podeVerTipoBloqueador;
  const isSuperAdmin = Boolean(
    session?.isSuperAdmin ||
    session?.email === "novaes@adm.28bpm.local" ||
    session?.email === "novaes@oficial.tec.br",
  );

  const corStatus = obterCorStatusVeiculo(veiculo);

  const copiarCoordenadas = () => {
    const texto = `${veiculo.latitude.toFixed(6)}, ${veiculo.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const getRumoCardeal = (graus?: number) => {
    if (graus === undefined) return "N";
    const direcoes = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
    const idx = Math.round(graus / 45) % 8;
    return direcoes[idx];
  };

  // Menu Dropdown Reutilizável de Módulos e Funções renderizado via Portal Global (Zero corte de Viewport)
  const renderMenuAcoes = (posicao: "top" | "bottom" = "bottom") => {
    if (typeof document === "undefined") return null;

    return createPortal(
      <>
        {/* Backdrop para fechar ao clicar fora em qualquer parte da viewport */}
        <div
          className="fixed inset-0 z-[9998] bg-black/15 dark:bg-black/40 backdrop-blur-[0.5px]"
          onClick={() => setMenuAcoesAberto(false)}
        />
        <div
          ref={menuRef}
          className={`fixed ${
            posicao === "top"
              ? "bottom-16 sm:bottom-18 right-2 sm:right-6"
              : "top-20 sm:top-24 right-3 sm:right-8"
          } w-72 max-w-[calc(100vw-1rem)] max-h-[82vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-[9999] p-2 text-slate-800 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
            <span>
              {isPropriedade
                ? "Módulos e Funções da Propriedade"
                : "Módulos e Funções do Veículo"}
            </span>
            <button
              onClick={() => setMenuAcoesAberto(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {isPropriedade ? (
            /* MENU EXCLUSIVO PARA PROPRIEDADE MONITORADA / POSTO DE VIGILÂNCIA */
            <>
              {/* Seção 1: Segurança e Perímetro */}
              <div className="space-y-0.5 py-1">
                <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Segurança e Perímetro
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuAcoesAberto(false);
                    setModalAreasAberto(true);
                  }}
                  className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-emerald-500/10 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition text-left cursor-pointer"
                >
                  <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      Perímetro de Segurança (Cercas Virtuais)
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Raio de proteção e cerca virtual em torno do imóvel
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuAcoesAberto(false);
                    setModalProtecaoAberto(true);
                  }}
                  className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-emerald-500/10 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition text-left cursor-pointer"
                >
                  <ShieldAlert className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      Proteção e Horários de Vigilância
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Vigilância de horário e perímetro patrimonial
                    </div>
                  </div>
                </button>
              </div>

              {/* Seção 2: Diagnóstico e Conexão */}
              <div className="space-y-0.5 py-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Diagnóstico e Conexão
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuAcoesAberto(false);
                    handleTestarComunicacao();
                  }}
                  disabled={testandoCom}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-500/10 text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition text-left cursor-pointer disabled:opacity-50"
                >
                  <Radio className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>Testar Sinal e Latência</span>
                </button>
              </div>

              {/* Seção 3: Operação e Atendimento */}
              <div className="space-y-0.5 py-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  Operação e Suporte
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuAcoesAberto(false);
                    setModalCompartilharAberto(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-sky-500/10 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition text-left cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>Compartilhar Localização</span>
                </button>
                <Link
                  to="/chat"
                  onClick={() => setMenuAcoesAberto(false)}
                  className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left cursor-pointer"
                >
                  <Headphones className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      Central de Operações 24h
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Canal de suporte e registro de ocorrências
                    </div>
                  </div>
                </Link>
              </div>
            </>
          ) : (
            /* MENU PARA VEÍCULOS AUTOMOTORES REGULARES */
            <>
              {/* Seção 1: Navegação e Trajetos */}
          <div className="space-y-0.5 py-1">
            <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Navegação e Trajetos
            </div>
            {onAbrirTrajetoInteligente && (
              <button
                onClick={() => {
                  setMenuAcoesAberto(false);
                  onAbrirTrajetoInteligente(veiculo);
                }}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left"
              >
                <Navigation className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>Trajeto Inteligente (A → B)</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-500 font-mono">
                      IA
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Calcular caminho pelas ruas e vigiar desvios
                  </div>
                </div>
              </button>
            )}
            {onAbrirRotasMonitoradas && (
              <button
                onClick={() => {
                  setMenuAcoesAberto(false);
                  onAbrirRotasMonitoradas(veiculo);
                }}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left"
              >
                <Route className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Rotas Monitoradas
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Auditar status de desvio das rotas ativas
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Seção 2: Segurança e Proteção */}
          <div className="space-y-0.5 py-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Segurança e Proteção
            </div>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalAreasAberto(true);
              }}
              className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left"
            >
              <Shield className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Áreas Seguras (Cercas Virtuais)
                </div>
                <div className="text-[10px] text-slate-400">
                  Perímetro / raio em torno de Casa ou Trabalho
                </div>
              </div>
            </button>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalModoViagemAberto(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left"
            >
              <Navigation className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span>Modo Viagem HUD</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalProtecaoAberto(true);
              }}
              className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold hover:bg-rose-500/10 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition text-left cursor-pointer"
            >
              <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Proteção e Limites
                </div>
                <div className="text-[10px] text-slate-400">
                  Velocidade máxima, cerca virtual e horário
                </div>
              </div>
            </button>
          </div>

          {/* Seção 3: Diagnóstico e Custódia */}
          <div className="space-y-0.5 py-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Diagnóstico e Custódia
            </div>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalTimelineAberto(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 transition text-left"
            >
              <History className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span>Timeline do Veículo</span>
            </button>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalSaudeAberto(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-orange-500/10 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 transition text-left"
            >
              <HeartPulse className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span>Saúde do Rastreador</span>
            </button>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                handleTestarComunicacao();
              }}
              disabled={testandoCom}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 transition text-left"
            >
              <Radio className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <span>Testar Sinal e Latência</span>
            </button>
          </div>

          {/* Seção 4: Operação */}
          <div className="space-y-0.5 py-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Operação
            </div>
            <button
              onClick={() => {
                setMenuAcoesAberto(false);
                setModalCompartilharAberto(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-sky-500/10 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition text-left"
            >
              <Share2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />
              <span>Compartilhar Localização</span>
            </button>
            <Link
              to="/manutencao"
              onClick={() => setMenuAcoesAberto(false)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-500/10 text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition text-left"
            >
              <Wrench className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>Manutenção Preventiva</span>
            </Link>
            <Link
              to="/frota"
              onClick={() => setMenuAcoesAberto(false)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-500/10 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition text-left"
            >
              <Activity className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Desempenho da Frota</span>
            </Link>
          </div>
            </>
          )}
        </div>
      </>,
      document.body,
    );
  };

  // Renderização unificada de modais acionados pelo menu de módulos ou ações táticas
  const renderModais = () => (
    <>
      {modalAreasAberto && (
        <SafeModalBoundary
          titulo="Áreas Seguras Indisponível"
          onClose={() => setModalAreasAberto(false)}
        >
          <AreasSegurasModal veiculo={veiculo} onFechar={() => setModalAreasAberto(false)} />
        </SafeModalBoundary>
      )}
      {modalProtecaoAberto && veiculo && (
        <SafeModalBoundary
          titulo="Proteção e Limites Indisponível"
          onClose={() => setModalProtecaoAberto(false)}
        >
          <ConfiguracaoProtecaoModal
            veiculo={veiculo}
            onFechar={() => setModalProtecaoAberto(false)}
          />
        </SafeModalBoundary>
      )}
      {modalTimelineAberto && (
        <TimelineVeiculoDrawer
          veiculo={veiculo}
          onFechar={() => setModalTimelineAberto(false)}
          onReproduzirCiclo={(viagemId) => {
            setModalTimelineAberto(false);
            onAbrirPlayback(veiculo, viagemId);
          }}
        />
      )}
      {modalSaudeAberto && (
        <SaudeRastreadorModal veiculo={veiculo} onFechar={() => setModalSaudeAberto(false)} />
      )}
      {modalModoViagemAberto && (
        <ModoViagemModal veiculo={veiculo} onFechar={() => setModalModoViagemAberto(false)} />
      )}
      {modalCompartilharAberto && (
        <CompartilharLocalizacaoModal
          veiculo={veiculo}
          onFechar={() => setModalCompartilharAberto(false)}
        />
      )}
      {modalBloqueioSeguroAberto && (
        <ModalBloqueioSeguroVeiculo
          veiculo={veiculo}
          onConfirmarBloqueio={async (veiculoId, bloquear) => {
            onBloquearToggle(veiculoId, bloquear);
          }}
          onFechar={() => setModalBloqueioSeguroAberto(false)}
        />
      )}
    </>
  );

  // =========================================================================
  // MODO RECOLHIDO: DOCKING BAR TÁTICA COMPACTA (100% DE MAPA LIVRE NA TELA)
  // =========================================================================
  if (recolhido) {
    return (
      <div className="z-20 p-2 sm:p-2.5 bg-[#eaf0f8]/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-300/60 dark:border-slate-800 shadow-[0_-4px_14px_#c3cfe2] dark:shadow-2xl transition-all select-none relative">
        <div className="flex items-center justify-between gap-2 max-w-full overflow-hidden">
          {/* Lado Esquerdo: Mini Placa Mercosul + Modelo, Status e Coordenadas */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Símbolo 3D Moderno do Veículo */}
            <div className="shrink-0 p-1 rounded-xl bg-[#eaf0f8] dark:bg-slate-800/80 border border-slate-300/60 dark:border-slate-700/60 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-xs flex items-center justify-center">
              <Vehicle3DGraphic tipo={veiculo.tipo_veiculo} corStatus={corStatus} size={34} />
            </div>

            {/* Placa Padrão Mercosul Oficial */}
            <div className="bg-white border border-slate-900 rounded shadow-xs overflow-hidden font-mono text-center min-w-[76px] shrink-0">
              <div className="bg-[#003399] px-1 py-0.2 flex items-center justify-between">
                <span className="text-[6px] text-white font-bold tracking-widest">BRASIL</span>
                <div className="w-1.5 h-1 bg-[#FFCC00] rounded-xs" />
              </div>
              <div className="px-1 py-0.5 text-slate-950 font-black text-xs tracking-wider">
                {formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                  {veiculo.marca_modelo}
                </span>
                <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                  {obterRotuloTipoVeiculo(veiculo.tipo_veiculo)}
                </span>
                {suspeitaJammer.suspeita ? (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-rose-600 text-white animate-pulse border border-rose-400 flex items-center gap-1 shrink-0"
                    title={`Ausência de telemetria há ${suspeitaJammer.minutosSemSinal} min em trânsito`}
                  >
                    <span className="h-1 w-1 rounded-full bg-white animate-ping" />
                    JAMMER
                  </span>
                ) : statusComunicacao.ativo ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1 shrink-0">
                    <span className="h-1 w-1 rounded-full bg-orange-500 animate-ping" />
                    Ativo
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0">
                    <span className="h-1 w-1 rounded-full bg-rose-500" />
                    Sem Sinal
                  </span>
                )}
                {temAlerta && (
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-rose-500 text-white animate-pulse shrink-0">
                    IMPACTO
                  </span>
                )}
                {podeVerCondicaoOperacional && (
                  <>
                    {isBloqueado ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                        Bloqueado
                      </span>
                    ) : isEmRota ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shrink-0">
                        Em Rota
                      </span>
                    ) : isParadoLigado ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                        Ligado
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                        Estacionado
                      </span>
                    )}
                  </>
                )}

                {/* Indicador de Tipo de Bloqueador - Restrito a Administradores e Operadores */}
                {podeVerTipoBloqueador &&
                  (!temBloqueador ? (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 shrink-0"
                      title="Veículo sem relé de corte por incompatibilidade técnica com o tipo de veículo"
                    >
                      Sem Bloqueador
                    </span>
                  ) : (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0"
                      title={`Tecnologia de bloqueio instalada: ${
                        veiculo.tipo_bloqueador === "outro"
                          ? veiculo.bloqueador_detalhes || "Bloqueador Específico"
                          : "Relé de Corte de Combustível / Ignição"
                      }`}
                    >
                      {veiculo.tipo_bloqueador === "outro" ? "Personalizado" : "Relé"}
                    </span>
                  ))}

                {/* Indicador de Sinal Celular GSM */}
                {veiculo.sinal_gsm !== undefined && veiculo.sinal_gsm !== null && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center gap-1 shrink-0"
                    title={`Sinal Celular do Rastreador: ${
                      veiculo.sinal_gsm === 4
                        ? "Excelente (4/4)"
                        : veiculo.sinal_gsm === 3
                          ? "Bom (3/4)"
                          : veiculo.sinal_gsm === 2
                            ? "Médio (2/4)"
                            : veiculo.sinal_gsm === 1
                              ? "Fraco (1/4)"
                              : "Sem Sinal (0/4)"
                    }`}
                  >
                    <span className="font-mono">4G</span>
                    <span className="flex items-end gap-[1.5px] h-2">
                      <span
                        className={`w-[2px] h-[3px] rounded-sm ${veiculo.sinal_gsm >= 1 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"}`}
                      />
                      <span
                        className={`w-[2px] h-[5px] rounded-sm ${veiculo.sinal_gsm >= 2 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"}`}
                      />
                      <span
                        className={`w-[2px] h-[7px] rounded-sm ${veiculo.sinal_gsm >= 3 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"}`}
                      />
                      <span
                        className={`w-[2px] h-[9px] rounded-sm ${veiculo.sinal_gsm >= 4 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"}`}
                      />
                    </span>
                  </span>
                )}
              </div>

              {!temAcessoLocalizacao ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-bold">Modo de Privacidade Ativo</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                    · Localização confidencial
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] font-mono mt-0.5">
                  <span className="text-orange-600 dark:text-orange-400 font-black shrink-0">
                    {veiculo.velocidade || 0} km/h
                  </span>

                  {/* Coordenadas e atalhos externos (visíveis a partir de md) */}
                  <div className="hidden md:flex items-center gap-1.5 text-slate-400">
                    <span>·</span>
                    <button
                      onClick={() => {
                        copiarCoordenadas();
                        if (onCentralizarVeiculo) onCentralizarVeiculo(veiculo);
                      }}
                      className="hover:text-orange-500 transition py-0.5 flex items-center gap-1 font-mono text-[11px]"
                      title="Centralizar no mapa e copiar coordenadas"
                    >
                      <LocateFixed className="h-3 w-3 text-orange-500" />
                      <span>
                        {copiado
                          ? "Copiado!"
                          : `${veiculo.latitude.toFixed(4)}, ${veiculo.longitude.toFixed(4)}`}
                      </span>
                    </button>
                    <span>·</span>
                    <a
                      href={`https://www.google.com/maps?q=${veiculo.latitude},${veiculo.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-500 hover:underline"
                    >
                      Maps
                    </a>
                    <span>·</span>
                    <a
                      href={`https://waze.com/ul?ll=${veiculo.latitude},${veiculo.longitude}&navigate=yes`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-500 hover:underline"
                    >
                      Waze
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: Ações Principais Objetivas + Menu de Módulos */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
            {!temAcessoLocalizacao ? (
              <>
                <button
                  type="button"
                  onClick={handleTestarComunicacao}
                  disabled={testandoCom}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Testar sinal e latência do rastreador"
                >
                  <Radio className="h-3.5 w-3.5" />
                  <span>
                    {testandoCom
                      ? "Testando..."
                      : ultimoPing !== null
                        ? `${ultimoPing}ms`
                        : "Testar Sinal"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalSaudeAberto(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                  title="Saúde do Rastreador"
                >
                  <HeartPulse className="h-3.5 w-3.5 text-orange-500" />
                  <span className="hidden sm:inline">Saúde</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleRecolhido}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition hover:bg-amber-500/25 cursor-pointer"
                  title="Abrir diagnóstico do rastreador"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Diagnóstico</span>
                </button>
              </>
            ) : (
              <>
                {/* 1. Botão Direto para o Cockpit / Monitor 3D (Desktop / Tablet) */}
                <button
                  onClick={onToggleRecolhido}
                  className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md shadow-orange-500/20 hover:from-orange-400 hover:to-amber-400 transition active:scale-95 cursor-pointer shrink-0"
                  title={
                    isPropriedade
                      ? "Abrir tela exclusiva de Monitor 3D e Telemetria de Segurança"
                      : "Abrir tela exclusiva de Cockpit 3D e Telemetria"
                  }
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isPropriedade ? "Monitor 3D" : "Cockpit 3D"}</span>
                </button>

                {/* 2. Botão Rápido: Refazer Trajeto */}
                <button
                  onClick={() => onAbrirPlayback(veiculo)}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition hover:bg-orange-500/25 flex items-center gap-1 active:scale-95 cursor-pointer"
                  title="Refazer Trajeto do Dia"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span className="hidden sm:inline">Trajeto</span>
                </button>

                {/* 3. Botão Crítico: Modo Segurança (Cadeado Digital Anti-Furto) */}
                <button
                  onClick={() => {
                    if (!temBloqueador) {
                      toast.error(
                        `O veículo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)} não possui bloqueador instalado. Operação de bloqueio indisponível por segurança.`,
                      );
                      return;
                    }
                    if (session?.isAuditor || session?.isSuperAdminAuditor || session?.isReadOnly) {
                      toast.error(
                        "Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Não pode realizar bloqueio.",
                      );
                      return;
                    }
                    if (session?.isAuditor || session?.isSuperAdminAuditor || session?.isReadOnly) {
                      toast.error(
                        "Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Não pode realizar bloqueio.",
                      );
                      return;
                    }
                    if (isBloqueado) {
                      if (
                        window.confirm(
                          `Confirma desativar o Modo Segurança e liberar a partida do veículo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}?`,
                        )
                      ) {
                        onBloquearToggle(veiculo.id, false);
                      }
                    } else {
                      setModalBloqueioSeguroAberto(true);
                    }
                  }}
                  disabled={!temBloqueador}
                  className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 flex items-center gap-1.5 ${
                    !temBloqueador
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50"
                      : isBloqueado
                        ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/30 animate-pulse cursor-pointer"
                        : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/25 cursor-pointer"
                  }`}
                  title={
                    !temBloqueador
                      ? "Veículo sem bloqueador instalado: operação indisponível por segurança"
                      : isBloqueado
                        ? "Modo Segurança Armado: Partida Bloqueada (Clique para Desativar)"
                        : "Armar Modo de Segurança com Protocolo de Cautela e Parada"
                  }
                >
                  <Lock
                    className={`h-4 w-4 ${
                      !temBloqueador
                        ? "text-slate-400"
                        : isBloqueado
                          ? "text-rose-500"
                          : "text-orange-500"
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {!temBloqueador
                      ? "Sem Bloqueador"
                      : isBloqueado
                        ? "Cadeado Ativo"
                        : "Modo Segurança"}
                  </span>
                </button>

                {/* 3.1 Compartilhamento com Contagem de Links Ativos */}
                <button
                  onClick={() => setModalCompartilharAberto(true)}
                  className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer flex items-center gap-1 ${
                    linksCompartilhamentoAtivos > 0
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/25"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                  title={
                    linksCompartilhamentoAtivos > 0
                      ? `${linksCompartilhamentoAtivos} link(s) de compartilhamento ativo(s)`
                      : "Compartilhar localização do veículo"
                  }
                >
                  <Share2
                    className={`h-4 w-4 ${linksCompartilhamentoAtivos > 0 ? "text-sky-500" : "text-slate-400"}`}
                  />
                  <span className="hidden md:inline">Links</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                      linksCompartilhamentoAtivos > 0
                        ? "bg-sky-500 text-white shadow-xs"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {linksCompartilhamentoAtivos}
                  </span>
                </button>

                {/* 4. Menu Suspenso de Ações e Módulos */}
                <div className="relative">
                  <button
                    ref={btnAcoesRef}
                    onClick={() => setMenuAcoesAberto(!menuAcoesAberto)}
                    className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                    title="Abrir módulos e recursos do veículo"
                  >
                    <SlidersHorizontal className="h-4 w-4 text-orange-500" />
                    <span className="hidden md:inline">Ações</span>
                    <ChevronUp className="h-3 w-3 text-slate-400" />
                  </button>

                  {menuAcoesAberto && renderMenuAcoes("top")}
                </div>
              </>
            )}

            {/* 5. Fechar Seleção e Limpar Mapa */}
            {onDeselecionarVeiculo && (
              <button
                onClick={onDeselecionarVeiculo}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                title="Desmarcar veículo e limpar mapa"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Modais acionados pelo menu suspenso ou ações rápidas */}
        {renderModais()}
      </div>
    );
  }

  // =========================================================================
  // MODO EXPANDIDO: TELA DEDICADA DO COCKPIT E TELEMETRIA 3D (TELA CHEIA)
  // =========================================================================
  return (
    <div className="w-full h-full flex flex-col gap-4 p-3 sm:p-5 overflow-y-auto bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      {/* 1. Barra de Navegação Tática da Tela do Cockpit */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-3 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md">
        {/* Lado Esquerdo: Botão Voltar ao Mapa + Identificação Mercosul e Veículo */}
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          {/* Botão de Retorno ao Mapa */}
          <button
            onClick={onVoltarAoMapa || onToggleRecolhido}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-slate-950 bg-orange-400 hover:bg-orange-300 shadow-md shadow-orange-500/20 active:scale-95 transition shrink-0 cursor-pointer"
            title="Retornar à visualização completa do mapa"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao Mapa</span>
          </button>

          {/* Seletor Rápido de Veículo se houver múltiplos veículos na frota */}
          {veiculos && veiculos.length > 1 && onSelectVeiculo && (
            <div className="relative">
              <select
                value={veiculo.id}
                onChange={(e) => {
                  const v = veiculos.find((x) => x.id === e.target.value);
                  if (v) onSelectVeiculo(v);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] dark:shadow-none focus:outline-none focus:border-orange-500 transition cursor-pointer"
                title={
                  isPropriedade
                    ? "Trocar de monitorado no Monitor 3D"
                    : "Trocar de veículo no Cockpit"
                }
              >
                {!veiculos.some((x) => x.id === veiculo.id) && (
                  <option key={veiculo.id} value={veiculo.id}>
                    {veiculo.placa} — {veiculo.marca_modelo}
                  </option>
                )}
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.marca_modelo}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Placa Padrão Mercosul Oficial ou Crachá de Propriedade Monitorada */}
          {isPropriedade ? (
            <div className="bg-emerald-600 dark:bg-emerald-700 border-2 border-emerald-800 rounded-md shadow-xs overflow-hidden font-mono text-center min-w-[95px] shrink-0 text-white">
              <div className="bg-emerald-950 px-2 py-0.5 flex items-center justify-between">
                <span className="text-[7px] text-emerald-200 font-bold tracking-widest">
                  PROPRIEDADE
                </span>
                <div className="w-2 h-1.5 bg-emerald-400 rounded-xs" />
              </div>
              <div className="px-2 py-0.5 font-black text-xs sm:text-sm tracking-wider">
                {formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}
              </div>
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-900 rounded-md shadow-xs overflow-hidden font-mono text-center min-w-[95px] shrink-0">
              <div className="bg-[#003399] px-2 py-0.5 flex items-center justify-between">
                <span className="text-[7px] text-white font-bold tracking-widest">BRASIL</span>
                <div className="w-2 h-1.5 bg-[#FFCC00] rounded-xs" />
              </div>
              <div className="px-2 py-0.5 text-slate-950 font-black text-xs sm:text-sm tracking-wider">
                {formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}
              </div>
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-black text-sm text-slate-900 dark:text-slate-100 truncate">
                {veiculo.marca_modelo}
              </h2>
              {suspeitaJammer.suspeita ? (
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white animate-pulse border border-rose-400 flex items-center gap-1 shrink-0"
                  title={`Ausência de telemetria há ${suspeitaJammer.minutosSemSinal} min em trânsito`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                  SUSPEITA DE JAMMER
                </span>
              ) : statusComunicacao.ativo ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                  Ativo
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Sem Sinal
                </span>
              )}
              {isPropriedade ? (
                <>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                    Propriedade Fixa
                  </span>
                  {turnoAtivo ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 shrink-0">
                      Escala Ativa
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                      Sem Vigilante Escalado
                    </span>
                  )}
                  {veiculo.rastreador_imei ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                      Rastreador Conectado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                      Sem Dispositivo Portátil
                    </span>
                  )}
                </>
              ) : (
                podeVerCondicaoOperacional && (
                  <>
                    {isBloqueado && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                        Bloqueado
                      </span>
                    )}
                    {isEmRota ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shrink-0">
                        Em Rota
                      </span>
                    ) : isParadoLigado ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                        Ligado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                        Estacionado
                      </span>
                    )}
                  </>
                )
              )}

              {/* Indicador de Tipo de Bloqueador no Cockpit - Omitido em Propriedades Monitoradas */}
              {!isPropriedade &&
                podeVerTipoBloqueador &&
                (!temBloqueador ? (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700 shrink-0"
                    title="Veículo sem relé de corte"
                  >
                    Sem Bloqueador
                  </span>
                ) : (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0"
                    title={`Tecnologia de bloqueio instalada: ${
                      veiculo.tipo_bloqueador === "outro"
                        ? veiculo.bloqueador_detalhes || "Bloqueador Específico"
                        : "Relé de Corte de Combustível / Ignição"
                    }`}
                  >
                    {veiculo.tipo_bloqueador === "outro" ? "Personalizado" : "Relé"}
                  </span>
                ))}

              {/* Indicador de Sinal Celular GSM no Cockpit */}
              {veiculo.sinal_gsm !== undefined && veiculo.sinal_gsm !== null && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center gap-1 shrink-0"
                  title={`Sinal Celular do Rastreador: ${
                    veiculo.sinal_gsm === 4
                      ? "Excelente (4/4)"
                      : veiculo.sinal_gsm === 3
                        ? "Bom (3/4)"
                        : veiculo.sinal_gsm === 2
                          ? "Médio (2/4)"
                          : veiculo.sinal_gsm === 1
                            ? "Fraco (1/4)"
                            : "Sem Sinal (0/4)"
                  }`}
                >
                  <span className="font-mono">4G</span>
                  <span className="flex items-end gap-0.5 h-2.5">
                    <span
                      className={`w-0.5 h-1 rounded-xs ${
                        veiculo.sinal_gsm >= 1 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                    <span
                      className={`w-0.5 h-1.5 rounded-xs ${
                        veiculo.sinal_gsm >= 2 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                    <span
                      className={`w-0.5 h-2 rounded-xs ${
                        veiculo.sinal_gsm >= 3 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                    <span
                      className={`w-0.5 h-2.5 rounded-xs ${
                        veiculo.sinal_gsm >= 4 ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                  </span>
                </span>
              )}
            </div>
            {!temAcessoLocalizacao ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                <span className="font-bold">Modo de Privacidade Ativo</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5 flex-wrap">
                {isPropriedade ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    Posto Georreferenciado
                  </span>
                ) : (
                  <>
                    <span className="text-orange-600 dark:text-orange-400 font-bold">
                      {veiculo.velocidade || 0} km/h
                    </span>
                    <span>·</span>
                    <span>{veiculo.ignicao ? "Ignição Ligada" : "Ignição Desligada"}</span>
                  </>
                )}
                {veiculo.latitude && veiculo.longitude && (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={copiarCoordenadas}
                      className="hover:text-orange-500 transition cursor-pointer flex items-center gap-0.5"
                      title="Clique para copiar coordenadas exatas"
                    >
                      <LocateFixed className="h-3 w-3 text-orange-500" />
                      <span>
                        {veiculo.latitude.toFixed(4)}, {veiculo.longitude.toFixed(4)}
                      </span>
                    </button>
                    <span>·</span>
                    <a
                      href={`https://www.google.com/maps?q=${veiculo.latitude},${veiculo.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-sky-400 text-sky-500 font-medium transition"
                      title="Abrir no Google Maps"
                    >
                      Maps
                    </a>
                    <span>·</span>
                    <a
                      href={`https://waze.com/ul?ll=${veiculo.latitude},${veiculo.longitude}&navigate=yes`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-sky-400 text-sky-500 font-medium transition"
                      title="Abrir no Waze"
                    >
                      Waze
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações Rápidas do Cockpit */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end relative">
          {!temAcessoLocalizacao ? (
            <>
              <button
                type="button"
                onClick={handleTestarComunicacao}
                disabled={testandoCom}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Testar sinal e latência do rastreador"
              >
                <Radio className="h-4 w-4" />
                <span>
                  {testandoCom
                    ? "Testando..."
                    : ultimoPing !== null
                      ? `Latência: ${ultimoPing}ms`
                      : "Testar Sinal e Latência"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalSaudeAberto(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                title="Saúde do Rastreador"
              >
                <HeartPulse className="h-4 w-4 text-orange-500" />
                <span>Saúde do Rastreador</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onAbrirPlayback(veiculo)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500/15 hover:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition active:scale-95 cursor-pointer"
                title="Refazer Trajeto"
              >
                <Play className="h-4 w-4 fill-current" />
                <span className="hidden sm:inline">Refazer Trajeto</span>
              </button>

              <button
                onClick={() => {
                  if (!temBloqueador) {
                    toast.error(
                      `O veículo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)} não possui bloqueador instalado. Operação de bloqueio indisponível por segurança.`,
                    );
                    return;
                  }
                  if (session?.isAuditor || session?.isSuperAdminAuditor || session?.isReadOnly) {
                    toast.error(
                      "Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Não pode realizar bloqueio.",
                    );
                    return;
                  }
                  if (isBloqueado) {
                    if (
                      window.confirm(
                        `Confirma desativar o Modo Segurança e liberar a partida do veículo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}?`,
                      )
                    ) {
                      onBloquearToggle(veiculo.id, false);
                    }
                  } else {
                    setModalBloqueioSeguroAberto(true);
                  }
                }}
                disabled={!temBloqueador}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 ${
                  !temBloqueador
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50"
                    : isBloqueado
                      ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/30 animate-pulse cursor-pointer"
                      : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/25 cursor-pointer"
                }`}
                title={
                  !temBloqueador
                    ? "Veículo sem bloqueador instalado: operação indisponível por segurança"
                    : isBloqueado
                      ? "Modo Segurança Armado: Partida Bloqueada (Clique para Desativar)"
                      : "Armar Modo de Segurança com Protocolo de Cautela e Parada"
                }
              >
                <Lock
                  className={`h-4 w-4 ${
                    !temBloqueador
                      ? "text-slate-400"
                      : isBloqueado
                        ? "text-rose-500"
                        : "text-orange-500"
                  }`}
                />
                <span>
                  {!temBloqueador
                    ? "Sem Bloqueador"
                    : isBloqueado
                      ? "Cadeado Ativo"
                      : "Modo Segurança"}
                </span>
              </button>

              {/* Botão de Compartilhamento com Contagem de Links Ativos no Cockpit 3D */}
              <button
                onClick={() => setModalCompartilharAberto(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                  linksCompartilhamentoAtivos > 0
                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/25"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                title={
                  linksCompartilhamentoAtivos > 0
                    ? `${linksCompartilhamentoAtivos} link(s) de compartilhamento ativo(s) em tempo real`
                    : "Nenhum link ativo. Clique para criar link de compartilhamento"
                }
              >
                <Share2
                  className={`h-4 w-4 ${linksCompartilhamentoAtivos > 0 ? "text-sky-500" : "text-slate-400"}`}
                />
                <span className="hidden sm:inline">Compartilhar</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                    linksCompartilhamentoAtivos > 0
                      ? "bg-sky-500 text-white shadow-xs"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {linksCompartilhamentoAtivos}
                </span>
              </button>

              <div className="relative">
                <button
                  ref={btnAcoesCockpitRef}
                  onClick={() => setMenuAcoesAberto(!menuAcoesAberto)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4 text-orange-500" />
                  <span>Ações e Módulos</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {menuAcoesAberto && renderMenuAcoes("bottom")}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Banner Tático de Alta Proteção do Modo Segurança (Cadeado Digital) */}
      {isBloqueado && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                <span>MODO SEGURANÇA ATIVADO (CADEADO DIGITAL)</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {podeVerTipoBloqueador
                  ? veiculo.tipo_bloqueador === "outro"
                    ? `A partida do veículo está bloqueada (${veiculo.bloqueador_detalhes || "bloqueador específico"}). Desative para liberar o motor.`
                    : "A partida do veículo está bloqueada por relé de corte. Desative para liberar o motor."
                  : "A partida do veículo está protegida pelo Cadeado Digital. É obrigatório desativar este modo antes de ligar o motor."}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Confirma desativar o Modo Segurança e liberar a partida do veículo ${formatarPlacaOuChassi(veiculo.placa, veiculo.chassi)}?`,
                )
              ) {
                onBloquearToggle(veiculo.id, false);
              }
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white active:scale-95 transition shadow-xs shrink-0 cursor-pointer"
          >
            Desativar Modo Segurança
          </button>
        </div>
      )}

      {/* Modo de Privacidade Ativo vs Cockpit Completo */}
      {!temAcessoLocalizacao ? (
        <PainelSaudePrivacidadeRastreador veiculo={veiculo} statusComunicacao={statusComunicacao} />
      ) : (
        <>
          {/* 2. Resumo Diário Consolidado (exclusivo para veículos automotores) */}
          {!isPropriedade && (
            <ResumoDiarioCard
              veiculoId={veiculo.id}
              onAbrirTimeline={() => setModalTimelineAberto(true)}
            />
          )}

          {/* 3. Mostradores 3D Holográficos: Cockpit 3D (Veicular) ou Monitor 3D (Propriedade Monitorada e Pessoal) */}
          <div className="w-full flex-1">
            {isPropriedade ? (
              <MostradoresMonitor3D
                veiculo={veiculo}
                podeVerSensores={podeVerSensores}
                podeVerEletrica={podeVerEletrica}
                podeVerSatelites={podeVerSatelites}
                isEquipeTecnica={isEquipeTecnica}
                isSuperAdmin={isSuperAdmin}
                onSolicitarUpgrade={onSolicitarUpgrade}
                getRumoCardeal={getRumoCardeal}
                statusComunicacao={statusComunicacao}
                postoVinculado={postoVinculado}
                turnoAtivo={turnoAtivo}
              />
            ) : (
              <MostradoresCockpit3D
                veiculo={veiculo}
                podeVerSensores={podeVerSensores}
                podeVerEletrica={podeVerEletrica}
                podeVerSatelites={podeVerSatelites}
                podeVerTipoBloqueador={podeVerTipoBloqueador}
                isEquipeTecnica={isEquipeTecnica}
                isSuperAdmin={isSuperAdmin}
                onSolicitarUpgrade={onSolicitarUpgrade}
                getRumoCardeal={getRumoCardeal}
                statusComunicacao={statusComunicacao}
                onConsultarOdometroMcu={handleConsultarOdometroMcu}
                onCalibrarOdometroMcu={handleCalibrarOdometroMcu}
                consultandoOdometroMcu={consultandoOdometroMcu}
                calibrandoOdometroMcu={calibrandoOdometroMcu}
                odometroMcuLocal={odometroMcuLocal}
                setOdometroMcuLocal={setOdometroMcuLocal}
                odometroMcuAtualizadoEmLocal={odometroMcuAtualizadoEmLocal}
              />
            )}
          </div>
        </>
      )}

      {/* Modais de Recursos de Proteção Hunter acionados no Cockpit 3D */}
      {renderModais()}
    </div>
  );
}

// ==========================================
// 1. COCKPIT 3D HOLOGRÁFICO (COM GRÁFICOS VOLUMÉTRICOS E TILT PARALLAX)
// ==========================================
interface SubMostradorProps {
  veiculo: VeiculoGps;
  podeVerSensores: boolean;
  podeVerEletrica: boolean;
  podeVerSatelites: boolean;
  podeVerTipoBloqueador?: boolean;
  isEquipeTecnica?: boolean;
  isSuperAdmin?: boolean;
  onSolicitarUpgrade?: (recurso: string) => void;
  getRumoCardeal: (graus?: number) => string;
  statusComunicacao?: {
    ativo: boolean;
    rotulo: string;
    detalhe: string;
    minutos: number | null;
  };
  onConsultarOdometroMcu?: () => void;
  onCalibrarOdometroMcu?: () => void;
  consultandoOdometroMcu?: boolean;
  calibrandoOdometroMcu?: boolean;
  odometroMcuLocal?: number | null;
  setOdometroMcuLocal?: React.Dispatch<React.SetStateAction<number | null>>;
  odometroMcuAtualizadoEmLocal?: string | null;
}

function MostradoresCockpit3D({
  veiculo,
  podeVerSensores,
  podeVerEletrica,
  podeVerSatelites,
  podeVerTipoBloqueador,
  isEquipeTecnica = false,
  isSuperAdmin = false,
  onSolicitarUpgrade,
  getRumoCardeal,
  statusComunicacao,
  onConsultarOdometroMcu,
  onCalibrarOdometroMcu,
  consultandoOdometroMcu,
  calibrandoOdometroMcu,
  odometroMcuLocal,
  setOdometroMcuLocal,
  odometroMcuAtualizadoEmLocal,
}: SubMostradorProps) {
  const velocidade = Number(veiculo.velocidade) || 0;
  const voltagem =
    veiculo.bateria_veiculo_v !== undefined && veiculo.bateria_veiculo_v !== null
      ? Number(veiculo.bateria_veiculo_v)
      : veiculo.voltagem !== undefined && veiculo.voltagem !== null
        ? Number(veiculo.voltagem)
        : null;
  const bateriaRastreador =
    veiculo.bateria_rastreador_pct !== undefined && veiculo.bateria_rastreador_pct !== null
      ? Number(veiculo.bateria_rastreador_pct)
      : null;
  const inclinacao =
    veiculo.inclinacao_graus !== undefined && veiculo.inclinacao_graus !== null
      ? Number(veiculo.inclinacao_graus)
      : null;
  const vibracao =
    veiculo.vibracao_g !== undefined && veiculo.vibracao_g !== null
      ? Number(veiculo.vibracao_g)
      : null;

  const satelites =
    veiculo.satelites !== undefined && veiculo.satelites !== null && Number(veiculo.satelites) > 0
      ? Number(veiculo.satelites)
      : null;

  const statusAlternador = useMemo(() => {
    if (voltagem === null) return { texto: "Sem leitura", cor: "text-slate-400" };
    if (!statusComunicacao?.ativo) {
      return { texto: "Último registro", cor: "text-slate-400" };
    }
    if (voltagem >= 13.5) return { texto: "Alternador Carregando", cor: "text-orange-400" };
    if (voltagem >= 12.3) return { texto: "Bateria Estabilizada", cor: "text-sky-400" };
    if (voltagem > 9.0) return { texto: "Alerta Subtensão", cor: "text-amber-400" };
    return { texto: "Bateria Desconectada", cor: "text-rose-400" };
  }, [voltagem, statusComunicacao?.ativo]);

  const statusBateriaRastreador = useMemo(() => {
    if (bateriaRastreador === null) return { texto: "Não informada", cor: "text-slate-400" };
    if (bateriaRastreador <= 20) return { texto: "Crítica", cor: "text-rose-400" };
    if (bateriaRastreador <= 50) return { texto: "Média", cor: "text-amber-400" };
    return { texto: "Operacional", cor: "text-orange-400" };
  }, [bateriaRastreador]);

  const infoPing = useMemo(() => {
    return obterInfoPingReal(
      veiculo.ultima_atualizacao,
      veiculo.status_operacional,
      veiculo.ignicao,
      velocidade,
      statusComunicacao?.ativo,
    );
  }, [
    veiculo.ultima_atualizacao,
    veiculo.status_operacional,
    veiculo.ignicao,
    velocidade,
    statusComunicacao?.ativo,
  ]);

  // ── Motores Comparativos em Tempo Real (A, B e C) para SuperADM ──
  const odometroBaseKm = Number(veiculo.odometro_motor_media_km ?? veiculo.odometro) || 0;
  const storageKey = `hunter_odometros_cockpit_${veiculo.id || veiculo.placa}`;

  const kmABanco =
    veiculo.odometro_motor_a_km !== null && veiculo.odometro_motor_a_km !== undefined
      ? Number(veiculo.odometro_motor_a_km)
      : null;
  const kmBBanco =
    veiculo.odometro_motor_b_km !== null && veiculo.odometro_motor_b_km !== undefined
      ? Number(veiculo.odometro_motor_b_km)
      : null;
  const kmCBanco =
    veiculo.odometro_motor_c_km !== null && veiculo.odometro_motor_c_km !== undefined
      ? Number(veiculo.odometro_motor_c_km)
      : null;

  const motoresRef = useRef<{
    a: MotorOdometroPropostaA;
    b: MotorOdometroPropostaB;
    c: MotorOdometroPropostaC;
  } | null>(null);

  if (!motoresRef.current) {
    let kmA = kmABanco ?? odometroBaseKm;
    let kmB = kmBBanco ?? odometroBaseKm;
    let kmC = kmCBanco ?? odometroBaseKm;
    try {
      const salvo = localStorage.getItem(storageKey);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed.kmA && Number(parsed.kmA) >= odometroBaseKm * 0.8 && kmABanco === null)
          kmA = Number(parsed.kmA);
        if (parsed.kmB && Number(parsed.kmB) >= odometroBaseKm * 0.8 && kmBBanco === null)
          kmB = Number(parsed.kmB);
        if (parsed.kmC && Number(parsed.kmC) >= odometroBaseKm * 0.8 && kmCBanco === null)
          kmC = Number(parsed.kmC);
      }
    } catch {
      // Fallback
    }
    kmA = Math.max(kmA, odometroBaseKm);
    kmB = Math.max(kmB, odometroBaseKm);
    kmC = Math.max(kmC, odometroBaseKm);

    motoresRef.current = {
      a: new MotorOdometroPropostaA(kmA),
      b: new MotorOdometroPropostaB(kmB),
      c: new MotorOdometroPropostaC(kmC),
    };
  }

  const [leituraA, setLeituraA] = useState<LeituraMostrador>(() => {
    const km = kmABanco ?? odometroBaseKm;
    return {
      motorId: "a",
      titulo: "Mostrador A · Fusão Bayesiana 1D",
      subtitulo: "Curvatura Gaussiana e ZVU Histerético",
      odometroKm: km,
      odometroMetros: Math.round(km * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.000215,
      estadoZvu:
        (veiculo.odometro_motor_a_estado as any) ||
        (veiculo.status_operacional === "em_rota" ? "MOVIMENTO" : "PARADO_ZVU"),
      bloqueioMotivo: veiculo.ignicao ? undefined : "IGNIÇÃO_DESLIGADA",
      pesos: veiculo.odometro_motor_a_pesos || { gnssOuArco: 52, cinematico: 28, mcuJ16: 20 },
      divergenciaPainelKm: 0.0,
    };
  });

  const [leituraB, setLeituraB] = useState<LeituraMostrador>(() => {
    const km = kmBBanco ?? odometroBaseKm;
    return {
      motorId: "b",
      titulo: "Mostrador B · Haversine Esférico",
      subtitulo: "Doppler Trapezoidal e Variâncias Fixas",
      odometroKm: km,
      odometroMetros: Math.round(km * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.0,
      estadoZvu:
        (veiculo.odometro_motor_b_estado as any) ||
        (veiculo.status_operacional === "em_rota" ? "MOVIMENTO" : "PARADO_ZVU"),
      bloqueioMotivo: veiculo.ignicao ? undefined : "IGNIÇÃO_DESLIGADA",
      pesos: veiculo.odometro_motor_b_pesos || { gnssOuArco: 57, cinematico: 25, mcuJ16: 18 },
      divergenciaPainelKm: 0.0,
    };
  });

  const [leituraC, setLeituraC] = useState<LeituraMostrador>(() => {
    const km = kmCBanco ?? odometroBaseKm;
    return {
      motorId: "c",
      titulo: "Mostrador C · EKF 1D Canônico",
      subtitulo: "Expansão Taylor 4ª Ordem e ZVU 6 Regras",
      odometroKm: km,
      odometroMetros: Math.round(km * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.00027267,
      estadoZvu:
        (veiculo.odometro_motor_c_estado as any) ||
        (veiculo.status_operacional === "em_rota" ? "MOVIMENTO" : "PARADO_ZVU"),
      bloqueioMotivo: veiculo.ignicao ? undefined : "IGNIÇÃO_DESLIGADA",
      pesos: veiculo.odometro_motor_c_pesos || { gnssOuArco: 6, cinematico: 4, mcuJ16: 90 },
      divergenciaPainelKm: 0.0,
    };
  });

  const ultimoPingRef = useRef<{
    lat: number;
    lng: number;
    vel: number;
    ts: number;
    odo: number;
  } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;

    // Sincronização direta de retaguarda quando o banco atualiza permanentemente
    if (kmABanco !== null && Math.abs(kmABanco - leituraA.odometroKm) > 0.005) {
      setLeituraA((prev) => ({
        ...prev,
        odometroKm: kmABanco,
        odometroMetros: Math.round(kmABanco * 1000),
        estadoZvu: (veiculo.odometro_motor_a_estado as any) || prev.estadoZvu,
        pesos: veiculo.odometro_motor_a_pesos || prev.pesos,
      }));
    }
    if (kmBBanco !== null && Math.abs(kmBBanco - leituraB.odometroKm) > 0.005) {
      setLeituraB((prev) => ({
        ...prev,
        odometroKm: kmBBanco,
        odometroMetros: Math.round(kmBBanco * 1000),
        estadoZvu: (veiculo.odometro_motor_b_estado as any) || prev.estadoZvu,
        pesos: veiculo.odometro_motor_b_pesos || prev.pesos,
      }));
    }
    if (kmCBanco !== null && Math.abs(kmCBanco - leituraC.odometroKm) > 0.005) {
      setLeituraC((prev) => ({
        ...prev,
        odometroKm: kmCBanco,
        odometroMetros: Math.round(kmCBanco * 1000),
        estadoZvu: (veiculo.odometro_motor_c_estado as any) || prev.estadoZvu,
        pesos: veiculo.odometro_motor_c_pesos || prev.pesos,
      }));
    }

    if (!veiculo.latitude || !veiculo.longitude) return;

    const lat = Number(veiculo.latitude);
    const lng = Number(veiculo.longitude);
    const vel = Number(veiculo.velocidade) || 0;
    const rumo = Number(veiculo.rumo) || 0;
    const ign = Boolean(veiculo.ignicao);
    const sats = Number(veiculo.satelites) || 8;
    const odoMcu =
      (Number(odometroMcuLocal) ||
        Number(veiculo.odometro_hardware_km) ||
        Number(veiculo.odometro) ||
        0) * 1000;
    const ts = veiculo.ultima_atualizacao
      ? new Date(veiculo.ultima_atualizacao).getTime()
      : Date.now();

    const ant = ultimoPingRef.current;
    if (ant && ant.lat === lat && ant.lng === lng && ant.vel === vel && ant.ts === ts) {
      return;
    }

    const ping: TelemetriaPingComparativo = {
      imei: veiculo.rastreador_imei || veiculo.placa || "VEICULO",
      timestamp: ts,
      latitude: lat,
      longitude: lng,
      velocidade: vel,
      curso: rumo,
      ignicao: ign,
      satelites: sats,
      odometro_mcu_metros: odoMcu,
    };

    if (motoresRef.current) {
      const resA = motoresRef.current.a.processarPing(ping);
      const resB = motoresRef.current.b.processarPing(ping);
      const resC = motoresRef.current.c.processarPing(ping);

      setLeituraA(resA);
      setLeituraB(resB);
      setLeituraC(resC);

      ultimoPingRef.current = { lat, lng, vel, ts, odo: Number(veiculo.odometro) || 0 };

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            kmA: resA.odometroKm,
            kmB: resB.odometroKm,
            kmC: resC.odometroKm,
            ts,
          }),
        );
      } catch {
        // Fallback
      }
    }
  }, [
    isSuperAdmin,
    veiculo.latitude,
    veiculo.longitude,
    veiculo.velocidade,
    veiculo.rumo,
    veiculo.ignicao,
    veiculo.satelites,
    veiculo.ultima_atualizacao,
    veiculo.odometro,
    odometroMcuLocal,
    veiculo.odometro_hardware_km,
    kmABanco,
    kmBBanco,
    kmCBanco,
    veiculo.odometro_motor_a_estado,
    veiculo.odometro_motor_b_estado,
    veiculo.odometro_motor_c_estado,
    veiculo.odometro_motor_a_pesos,
    veiculo.odometro_motor_b_pesos,
    veiculo.odometro_motor_c_pesos,
    storageKey,
    veiculo.placa,
    veiculo.rastreador_imei,
    leituraA.odometroKm,
    leituraB.odometroKm,
    leituraC.odometroKm,
  ]);

  // Listener para sincronização atômica emitida pelo modal ou outros módulos
  useEffect(() => {
    const handleSincronizado = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      if (detail.veiculoId === veiculo.id || detail.placa === veiculo.placa) {
        const novoKm = Number(detail.novoKm);
        if (!isNaN(novoKm)) {
          if (motoresRef.current) {
            motoresRef.current.a.equalizar(novoKm);
            motoresRef.current.b.equalizar(novoKm);
            motoresRef.current.c.equalizar(novoKm);
          }
          setLeituraA((prev) => ({
            ...prev,
            odometroKm: novoKm,
            odometroMetros: Math.round(novoKm * 1000),
            deltaMetros: 0,
            divergenciaPainelKm: 0,
          }));
          setLeituraB((prev) => ({
            ...prev,
            odometroKm: novoKm,
            odometroMetros: Math.round(novoKm * 1000),
            deltaMetros: 0,
            divergenciaPainelKm: 0,
          }));
          setLeituraC((prev) => ({
            ...prev,
            odometroKm: novoKm,
            odometroMetros: Math.round(novoKm * 1000),
            deltaMetros: 0,
            divergenciaPainelKm: 0,
          }));
          setOdometroMcuLocal(novoKm);
        }
      }
    };

    window.addEventListener("hunter_odometro_sincronizado", handleSincronizado);
    return () => {
      window.removeEventListener("hunter_odometro_sincronizado", handleSincronizado);
    };
  }, [veiculo.id, veiculo.placa]);

  const handleEqualizarTodosSuperAdm = async () => {
    if (!motoresRef.current) return;
    const targetKm = Number(veiculo.odometro_motor_media_km ?? veiculo.odometro) || 0;
    motoresRef.current.a.equalizar(targetKm);
    motoresRef.current.b.equalizar(targetKm);
    motoresRef.current.c.equalizar(targetKm);

    setLeituraA((prev) => ({
      ...prev,
      odometroKm: targetKm,
      odometroMetros: Math.round(targetKm * 1000),
      deltaMetros: 0,
      divergenciaPainelKm: 0,
    }));
    setLeituraB((prev) => ({
      ...prev,
      odometroKm: targetKm,
      odometroMetros: Math.round(targetKm * 1000),
      deltaMetros: 0,
      divergenciaPainelKm: 0,
    }));
    setLeituraC((prev) => ({
      ...prev,
      odometroKm: targetKm,
      odometroMetros: Math.round(targetKm * 1000),
      deltaMetros: 0,
      divergenciaPainelKm: 0,
    }));
    setOdometroMcuLocal(targetKm);

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          kmA: targetKm,
          kmB: targetKm,
          kmC: targetKm,
          ts: Date.now(),
        }),
      );
    } catch {
      // Fallback
    }

    try {
      await (supabase.rpc as any)("ajustar_odometro_veiculo", {
        p_veiculo_id: veiculo.id,
        p_novo_odometro: targetKm,
      });
      await supabase
        .from("veiculos")
        .update({
          odometro_km: targetKm,
          odometro_motor_media_km: targetKm,
          odometro_wgs84_km: targetKm,
          odometro_cinematico_km: targetKm,
          odometro_motor_a_km: targetKm,
          odometro_motor_b_km: targetKm,
          odometro_motor_c_km: targetKm,
          odometro_hardware_km: Math.round(targetKm),
          odometro_hardware_atualizado_em: new Date().toISOString(),
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", veiculo.id);
    } catch (e) {
      console.warn("[TelemetryDrawer] Falha ao persistir equalização no banco:", e);
    }

    toast.success(
      `Todos os 7 odômetros equalizados com sucesso em ${targetKm.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km!`,
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* 1. Velocidade Real via Satélite GPS e Sinal Físico de Ignição */}
      <TiltCard
        maxTilt={10}
        spotlightColor="rgba(249, 115, 22, 0.25)"
        className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Gauge className="h-3.5 w-3.5 animate-pulse" /> VELOCIDADE REAL
          </span>
          <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
            GPS / ACC
          </span>
        </div>

        <div className="my-2 flex items-baseline justify-between">
          <div>
            <span className="text-3xl sm:text-4xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">
              {velocidade}
            </span>
            <span className="text-xs font-mono text-orange-600/80 dark:text-orange-400/80 ml-1">
              KM/H
            </span>
          </div>
          <div className="text-right font-mono text-[10px]">
            <div
              className={
                veiculo.ignicao
                  ? "text-orange-600 dark:text-orange-400 font-bold"
                  : "text-slate-500 dark:text-slate-400"
              }
            >
              {veiculo.ignicao ? "IGNIÇÃO LIGADA (ACC)" : "IGNIÇÃO DESLIGADA"}
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {velocidade > 0 ? "EM TRÂNSITO" : veiculo.ignicao ? "PARADO LIGADO" : "ESTACIONADO"}
            </div>
          </div>
        </div>

        {/* Colunas Isométricas de Velocidade */}
        <div
          className="flex items-end gap-1 h-10 w-full px-1 py-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-orange-500/30"
          style={{ perspective: "400px" }}
        >
          {[...Array(12)].map((_, i) => {
            const nivel = Math.floor((velocidade / 160) * 12);
            const ativo = i <= nivel;
            const altura = Math.min(100, Math.max(20, (i + 1) * 8.3));
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all duration-300 relative"
                style={{
                  height: `${altura}%`,
                  background: ativo
                    ? "linear-gradient(to top, #059669, #10b981, #6ee7b7)"
                    : "rgba(148, 163, 184, 0.25)",
                  boxShadow: ativo ? "0 0 6px rgba(16, 185, 129, 0.7)" : "none",
                  transform: "rotateX(20deg)",
                }}
              />
            );
          })}
        </div>
      </TiltCard>

      {/* 2. Célula de Bateria 3D (Dados Reais do Rastreador) */}
      {podeVerEletrica ? (
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(56, 189, 248, 0.25)"
          className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-sky-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-sky-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Zap className="h-3.5 w-3.5" /> ENERGIA 3D
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                veiculo.alimentacao_externa === false
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse font-black"
                  : "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20"
              }`}
            >
              {veiculo.alimentacao_externa === false ? "VCC DESCONECTADA" : "ALIMENTAÇÃO VCC"}
            </span>
          </div>

          <div className="my-2 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl sm:text-3xl font-black font-mono text-sky-600 dark:text-sky-300 dark:drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]">
                  {voltagem !== null ? voltagem.toFixed(1) : "—"}
                </span>
                <span className="text-xs font-mono text-sky-600/80 dark:text-sky-400/80 ml-1">
                  {voltagem !== null ? "VOLTS" : "V (Carro)"}
                </span>
              </div>
              <div className="text-right font-mono text-[10px]">
                <div className={`font-bold ${statusAlternador.cor}`}>{statusAlternador.texto}</div>
                <div className="text-slate-500 dark:text-slate-400">
                  {veiculo.alimentacao_externa === false
                    ? "Alimentação Rompida"
                    : "Bateria do Carro"}
                </div>
              </div>
            </div>

            {/* Bateria Interna do Rastreador */}
            <div className="pt-1.5 border-t border-slate-200 dark:border-sky-950/80 flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Battery className="h-3 w-3 text-sky-500" /> Rastreador:
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold ${statusBateriaRastreador.cor}`}>
                  {bateriaRastreador !== null ? `${bateriaRastreador}%` : "Não informada"}
                </span>
                <span className="text-[9px] text-slate-400">
                  {veiculo.alimentacao_externa === false ? "(Backup)" : "(Principal)"}
                </span>
              </div>
            </div>
          </div>

          {/* Gráfico 3D de Oscilação de Carga ou Estado Neutro */}
          <div className="relative h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-sky-500/30 overflow-hidden flex items-center justify-center px-2">
            {voltagem !== null && statusComunicacao?.ativo ? (
              <svg className="w-full h-8" viewBox="0 0 100 30" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <path d="M 0 20 Q 25 10 50 15 T 100 12 L 100 30 L 0 30 Z" fill="url(#skyGrad)" />
                <path
                  d="M 0 20 Q 25 10 50 15 T 100 12"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2"
                />
              </svg>
            ) : voltagem !== null ? (
              <span className="text-[10px] font-mono text-slate-500">
                Última leitura ({voltagem.toFixed(1)}V) · Offline
              </span>
            ) : (
              <span className="text-[10px] font-mono text-slate-500">
                Aguardando leitura do rastreador
              </span>
            )}
          </div>
        </TiltCard>
      ) : (
        <CardPaywall3D
          titulo="ENERGIA 3D"
          icone={BatteryCharging}
          cor="sky"
          recurso="Telemetria Elétrica da Bateria"
          onSolicitarUpgrade={onSolicitarUpgrade}
        />
      )}

      {/* 3. Giroscópio 3D com Chassi em Perspectiva Real */}
      {podeVerSensores ? (
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(245, 158, 11, 0.25)"
          className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-amber-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-amber-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Activity className="h-3.5 w-3.5" /> GIROSCÓPIO 3D
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                !statusComunicacao?.ativo
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20"
              }`}
            >
              {!statusComunicacao?.ativo ? "OFFLINE" : "ROLL / PITCH"}
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-300 dark:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
                  {inclinacao !== null ? `${inclinacao}°` : "0.0°"}
                </span>
                <span className="text-xs font-mono font-bold text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                  GRAUS
                </span>
              </div>
              <div className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mt-0.5">
                {inclinacao !== null
                  ? Math.abs(inclinacao) > 15
                    ? "ALERTA DE RAMPA"
                    : "CALIBRADO · NIVELADO"
                  : "CALIBRADO · STANDBY"}
              </div>
            </div>
            <div className="text-right font-mono text-[10px]">
              <div
                className={`font-bold ${statusComunicacao?.ativo ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}
              >
                {!statusComunicacao?.ativo
                  ? "SEM SINAL"
                  : inclinacao !== null
                    ? Math.abs(inclinacao) > 15
                      ? "ALERTA RAMPA"
                      : "ESTABILIDADE OK"
                    : "ESTABILIDADE OK"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                {!statusComunicacao?.ativo ? "Aguardando sinal" : "Limiar Seguro (< 25°)"}
              </div>
            </div>
          </div>

          {/* Renderização do Chassi do Veículo em CSS 3D */}
          <div
            className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-amber-500/30 flex items-center justify-center relative overflow-hidden px-2"
            style={{ perspective: "300px" }}
          >
            {statusComunicacao?.ativo ? (
              <>
                <div className="absolute inset-x-0 h-px bg-amber-500/30 border-dashed" />
                <div
                  className="w-16 h-5 rounded-md border-2 border-amber-500 bg-amber-500/20 flex items-center justify-between px-1 transition-transform duration-500 shadow-md shadow-amber-500/40"
                  style={{
                    transform: `rotateZ(${(inclinacao || 0) * 2}deg) rotateX(${Math.abs(inclinacao || 0)}deg)`,
                  }}
                >
                  <div className="w-1.5 h-3 bg-amber-400 rounded-xs" />
                  <div className="text-[7px] font-mono font-black text-amber-700 dark:text-amber-200">
                    CHASSI
                  </div>
                  <div className="w-1.5 h-3 bg-amber-400 rounded-xs" />
                </div>
              </>
            ) : (
              <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 text-center leading-tight">
                Sem sinal de giroscópio ativo
              </span>
            )}
          </div>
        </TiltCard>
      ) : (
        <CardPaywall3D
          titulo="GIROSCÓPIO 3D"
          icone={Activity}
          cor="amber"
          recurso="Giroscópio e Inclinação do Chassi"
          onSolicitarUpgrade={onSolicitarUpgrade}
        />
      )}

      {/* 4. Radar Polar 3D de Força G e Acelerômetro Inercial */}
      {podeVerSensores ? (
        (() => {
          const valorForcaG = vibracao !== null ? vibracao : 0.0;
          const isEstacionado = !veiculo.ignicao || velocidade === 0;
          const isSevero = valorForcaG > 1.2;
          const isModerado = valorForcaG > 0.4 && valorForcaG <= 1.2;

          return (
            <TiltCard
              maxTilt={10}
              spotlightColor={
                isSevero
                  ? "rgba(244, 63, 94, 0.25)"
                  : isModerado
                    ? "rgba(245, 158, 11, 0.25)"
                    : "rgba(16, 185, 129, 0.20)"
              }
              className={`rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border shadow-[4px_4px_14px_#c3cfe2] flex flex-col justify-between ${
                isSevero
                  ? "border-rose-400 dark:border-rose-500/50 dark:shadow-xl dark:shadow-rose-950/30"
                  : isModerado
                    ? "border-amber-400 dark:border-amber-500/50 dark:shadow-xl dark:shadow-amber-950/20"
                    : "border-slate-300/70 dark:border-slate-700/60 dark:shadow-xl dark:shadow-slate-950/20"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider">
                <span
                  className={`flex items-center gap-1.5 whitespace-nowrap ${
                    isSevero
                      ? "text-rose-600 dark:text-rose-400"
                      : isModerado
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> FORÇA G 3D
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                    !statusComunicacao?.ativo
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      : isSevero
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 animate-pulse"
                        : isModerado
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30"
                  }`}
                >
                  {!statusComunicacao?.ativo ? "OFFLINE" : "TRIAXIAL"}
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span
                      className={`text-2xl sm:text-3xl font-black font-mono ${
                        isSevero
                          ? "text-rose-600 dark:text-rose-400 dark:drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                          : isModerado
                            ? "text-amber-600 dark:text-amber-400 dark:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                            : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {valorForcaG.toFixed(2)}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 ml-1.5">
                      G-FORCE
                    </span>
                  </div>
                  <div
                    className={`text-[9px] font-mono font-bold uppercase tracking-wider mt-0.5 ${
                      isSevero
                        ? "text-rose-600 dark:text-rose-400"
                        : isModerado
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {!statusComunicacao?.ativo
                      ? "SINAL OFFLINE"
                      : isSevero
                        ? "DESACELERAÇÃO SEVERA"
                        : isModerado
                          ? "ACELERAÇÃO DINÂMICA"
                          : isEstacionado
                            ? "VEÍCULO EM REPOUSO · ESTÁTICO"
                            : "CONDUÇÃO SUAVE · ESTÁVEL"}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div
                    className={`font-bold ${
                      !statusComunicacao?.ativo
                        ? "text-slate-500 dark:text-slate-400"
                        : isSevero
                          ? "text-rose-600 dark:text-rose-400"
                          : isModerado
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {!statusComunicacao?.ativo
                      ? "SEM SINAL"
                      : isSevero
                        ? "FRENAGEM SEVERA"
                        : isModerado
                          ? "FORÇA G ATIVA"
                          : isEstacionado
                            ? "ESTABILIDADE TOTAL"
                            : "CONDUÇÃO SUAVE"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {!statusComunicacao?.ativo
                      ? "Aguardando sinal"
                      : isEstacionado && valorForcaG === 0
                        ? "Motor Desligado (0G)"
                        : isSevero
                          ? "Alerta Impacto (> 1.2G)"
                          : "Limiar Seguro (< 1.5G)"}
                  </div>
                </div>
              </div>

              {/* Radar Polar 3D com Vetor de Deslocamento */}
              <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 relative flex items-center justify-center overflow-hidden px-2">
                {statusComunicacao?.ativo ? (
                  <>
                    <div className="absolute w-8 h-8 rounded-full border border-slate-300 dark:border-slate-700/60" />
                    <div className="absolute w-16 h-16 rounded-full border border-slate-300/60 dark:border-slate-800/60" />
                    <div
                      className={`h-3 w-3 rounded-full shadow-md transition-all duration-300 ${
                        isSevero
                          ? "bg-rose-500 shadow-rose-500/80 animate-pulse"
                          : isModerado
                            ? "bg-amber-500 shadow-amber-500/80"
                            : "bg-orange-500 shadow-orange-500/80"
                      }`}
                      style={{
                        transform: `translate(${(valorForcaG * 8).toFixed(1)}px, -${(valorForcaG * 3).toFixed(1)}px)`,
                      }}
                    />
                  </>
                ) : (
                  <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 text-center leading-tight">
                    Sem sinal de aceleração ativo
                  </span>
                )}
              </div>
            </TiltCard>
          );
        })()
      ) : (
        <CardPaywall3D
          titulo="FORÇA G 3D"
          icone={AlertTriangle}
          cor="rose"
          recurso="Sensores de Força G e Colisão"
          onSolicitarUpgrade={onSolicitarUpgrade}
        />
      )}

      {/* 5. Constelação Orbital 3D de Satélites e Rede Celular 4G (GSM) */}
      {podeVerSatelites ? (
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(249, 115, 22, 0.25)"
          className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between col-span-1 sm:col-span-2 xl:col-span-2"
        >
          {(() => {
            const emRepousoIgnicao = !veiculo.ignicao;
            const temFix = satelites !== null && satelites > 0;
            const badgeTexto = !statusComunicacao?.ativo
              ? "SEM SINAL"
              : temFix
                ? "LOCK 3D ORBITAL"
                : emRepousoIgnicao
                  ? "REPOUSO GNSS"
                  : "BUSCANDO FIX";
            const badgeCor = !statusComunicacao?.ativo
              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20"
              : temFix
                ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/20"
                : emRepousoIgnicao
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20"
                  : "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20";

            const temSinalGsm = veiculo.sinal_gsm !== undefined && veiculo.sinal_gsm !== null;
            const sinalBarras = temSinalGsm ? Number(veiculo.sinal_gsm) : null;
            const gsmDescricao = !statusComunicacao?.ativo
              ? "Último registro (Aguardando sinal)"
              : sinalBarras === 4
                ? "Sinal Excelente (Nível Máximo)"
                : sinalBarras === 3
                  ? "Sinal Bom (Operacional)"
                  : sinalBarras === 2
                    ? "Sinal Médio (Estável)"
                    : sinalBarras === 1
                      ? "Sinal Fraco (Instável)"
                      : sinalBarras === 0
                        ? "Sem Sinal de Antena"
                        : "Sem leitura de sinal";

            return (
              <>
                <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <Compass className="h-3.5 w-3.5 text-orange-500" /> GNSS E REDE 4G (GSM)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${badgeCor}`}
                    >
                      {badgeTexto}
                    </span>
                  </div>
                </div>

                {/* Grid Principal: GNSS Orbital (Esquerda) vs Rede 4G M2M (Direita) */}
                <div className="my-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Bloco 1: GNSS Orbital */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-orange-500/30 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[9px] font-mono text-orange-600 dark:text-orange-400 font-bold">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Compass className="h-3 w-3" /> CONSTELAÇÃO GNSS
                      </span>
                      <span className="text-[8px] px-1 py-0.2 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 font-bold">
                        GPS/GLONASS
                      </span>
                    </div>
                    <div className="my-1.5 flex items-baseline">
                      <span className="text-2xl sm:text-3xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]">
                        {temFix ? satelites : emRepousoIgnicao ? "0" : "—"}
                      </span>
                      <span className="text-[10px] font-mono text-orange-600/80 dark:text-orange-400/80 ml-1.5 font-bold">
                        {temFix
                          ? "SATÉLITES FIXADOS"
                          : emRepousoIgnicao
                            ? "MODO REPOUSO (CHAVE DESLIGADA)"
                            : "BUSCANDO CONSTELAÇÃO"}
                      </span>
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                      <span>Rumo / Azimute:</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">
                        {veiculo.rumo !== undefined
                          ? `${veiculo.rumo}° ${getRumoCardeal(veiculo.rumo)}`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Bloco 2: Rede Celular 4G LTE M2M */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-sky-500/30 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[9px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Signal className="h-3 w-3" /> REDE CELULAR 4G
                      </span>
                      <span className="text-[8px] px-1 py-0.2 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold">
                        LTE Cat-1
                      </span>
                    </div>

                    <div className="my-1.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base sm:text-lg font-black font-mono text-sky-600 dark:text-sky-300">
                            {sinalBarras !== null ? `${sinalBarras}/4` : "—"}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 font-bold">
                            {sinalBarras !== null ? "BARRAS" : "SEM LEITURA"}
                          </span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                          {gsmDescricao}
                        </div>
                      </div>

                      {/* Barras Gráficas 4G */}
                      <div className="flex items-end gap-1 h-5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span
                          className={`w-1 h-1.5 rounded-xs transition-colors ${
                            sinalBarras !== null && sinalBarras >= 1
                              ? "bg-sky-500"
                              : "bg-slate-300 dark:bg-slate-700"
                          }`}
                        />
                        <span
                          className={`w-1 h-2.5 rounded-xs transition-colors ${
                            sinalBarras !== null && sinalBarras >= 2
                              ? "bg-sky-500"
                              : "bg-slate-300 dark:bg-slate-700"
                          }`}
                        />
                        <span
                          className={`w-1 h-3.5 rounded-xs transition-colors ${
                            sinalBarras !== null && sinalBarras >= 3
                              ? "bg-sky-500"
                              : "bg-slate-300 dark:bg-slate-700"
                          }`}
                        />
                        <span
                          className={`w-1 h-4.5 rounded-xs transition-colors ${
                            sinalBarras !== null && sinalBarras >= 4
                              ? "bg-sky-500"
                              : "bg-slate-300 dark:bg-slate-700"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                      <span>Conectividade:</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">
                        {isEquipeTecnica ? "Multi-Operadora M2M" : "Rede Móvel de Telemetria"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Anéis Orbitais em CSS 3D com Rotação e Status da Conexão */}
          <div
            className="h-9 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-orange-500/30 flex items-center justify-between px-3 relative overflow-hidden"
            style={{ perspective: "250px" }}
          >
            <div className="flex items-center gap-2 z-10 text-[10px] font-mono text-slate-600 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
              <span>Conexão Segura Criptografada • Telemetria Ativa</span>
            </div>

            {satelites !== null && statusComunicacao?.ativo && (
              <div className="flex items-center gap-1.5 z-10 text-[9px] font-mono text-orange-600 dark:text-orange-400 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span>Fixação Satélite 3D</span>
              </div>
            )}
          </div>
        </TiltCard>
      ) : (
        <CardPaywall3D
          titulo="GNSS ORBITAL"
          icone={Compass}
          cor="teal"
          recurso="Constelação de Satélites e Rumo"
          onSolicitarUpgrade={onSolicitarUpgrade}
          className="col-span-1 sm:col-span-2 xl:col-span-2"
        />
      )}

      {/* 6 e 7. Odômetro Servidor (WGS-84) e Odômetro Hardware J16 (MCU) separados, ou Horímetro Operacional para Máquinas */}
      {(() => {
        const isMaquinaOuTrator =
          veiculo.tipo_veiculo === "maquina" ||
          veiculo.tipo_veiculo === "trator" ||
          veiculo.tipo_veiculo === "equipamento";

        if (isMaquinaOuTrator) {
          return (
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(245, 158, 11, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-amber-400/50 dark:border-amber-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-amber-950/20 flex flex-col justify-between col-span-1 sm:col-span-2 xl:col-span-2"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Gauge className="h-3.5 w-3.5" /> HORÍMETRO OPERACIONAL
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] border font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 whitespace-nowrap">
                  HORAS DE MOTOR
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-300 dark:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
                      {Number(veiculo.horimetro || 0).toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                      HORAS
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Horímetro Acumulado
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-amber-600 dark:text-amber-400 font-bold">
                    {veiculo.ignicao ? "OPERANDO" : "DESLIGADO"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    HORAS DE IGNIÇÃO
                  </div>
                </div>
              </div>

              {/* Rodapé de Telemetria: Último Ping */}
              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-amber-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-amber-300 whitespace-nowrap">
                    <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" /> ÚLTIMO PING
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {infoPing.dataHoraFormatada}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span
                    className={`px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${infoPing.corBadge} ${infoPing.bgBadge} ${infoPing.bordaBadge}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        infoPing.statusBadge === "ativo_rota"
                          ? "bg-amber-500 animate-ping"
                          : "bg-slate-400"
                      }`}
                    />
                    {infoPing.statusRotulo}
                  </span>
                  <span
                    className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate"
                    title={infoPing.modoDescricao}
                  >
                    {infoPing.modoDescricao}
                  </span>
                </div>
              </div>
            </TiltCard>
          );
        }

        const odometroServidor = Number(veiculo.odometro || 0);
        const odometroCinematico =
          veiculo.odometro_cinematico_km !== undefined && veiculo.odometro_cinematico_km !== null
            ? Number(veiculo.odometro_cinematico_km)
            : null;
        const odometroHardware =
          odometroMcuLocal !== null
            ? odometroMcuLocal
            : veiculo.odometro_hardware_km !== undefined && veiculo.odometro_hardware_km !== null
              ? Number(veiculo.odometro_hardware_km)
              : null;
        const dataHardware =
          odometroMcuAtualizadoEmLocal || veiculo.odometro_hardware_atualizado_em;
        const delta =
          odometroHardware !== null ? Math.abs(odometroServidor - odometroHardware) : null;
        const deltaCinematico =
          odometroCinematico !== null ? Math.abs(odometroServidor - odometroCinematico) : null;
        const estaSincronizado = delta !== null && delta < 0.05;

        // Motores A, B e C: Leituras canônicas e persistentes 24/7 no banco
        const kmMotorA = kmABanco !== null && kmABanco > 0 ? kmABanco : leituraA.odometroKm;
        const kmMotorB = kmBBanco !== null && kmBBanco > 0 ? kmBBanco : leituraB.odometroKm;
        const kmMotorC = kmCBanco !== null && kmCBanco > 0 ? kmCBanco : leituraC.odometroKm;

        const kmWgs84 =
          veiculo.odometro_wgs84_km !== null && veiculo.odometro_wgs84_km !== undefined
            ? Number(veiculo.odometro_wgs84_km)
            : odometroServidor;

        const deltaMotorA = kmMotorA - kmWgs84;
        const deltaMotorB = kmMotorB - kmWgs84;
        const deltaMotorC = kmMotorC - kmWgs84;

        const pesosMotorA = veiculo.odometro_motor_a_pesos || leituraA.pesos;
        const pesosMotorB = veiculo.odometro_motor_b_pesos || leituraB.pesos;
        const pesosMotorC = veiculo.odometro_motor_c_pesos || leituraC.pesos;

        const estadoMotorA = veiculo.odometro_motor_a_estado || leituraA.estadoZvu;
        const estadoMotorB = veiculo.odometro_motor_b_estado || leituraB.estadoZvu;
        const estadoMotorC = veiculo.odometro_motor_c_estado || leituraC.estadoZvu;

        // ── 7º Medidor: Média das somas dos medidores 1, 4, 5 e 6 em Tempo Real (Odômetro Principal do Sistema) ──
        const odometroPrincipal7 = calcularOdometroMedia1456(kmWgs84, kmMotorA, kmMotorB, kmMotorC);
        const deltaMotorMedia7 = odometroPrincipal7 - kmWgs84;

        // ── 8º Medidor: Motor D (Fusão com Compensação de Sombra GNSS / Cold-Start) ──
        const kmDBanco =
          (veiculo as any).odometro_motor_d_km !== null &&
          (veiculo as any).odometro_motor_d_km !== undefined
            ? Number((veiculo as any).odometro_motor_d_km)
            : null;
        const kmMotorD = kmDBanco !== null && kmDBanco > 0 ? kmDBanco : kmMotorA;
        const deltaMotorD = kmMotorD - kmWgs84;
        const pesosMotorD = (veiculo as any).odometro_motor_d_pesos || {
          gnssOuArco: 50,
          cinematico: 30,
          compensacaoSombra: 20,
        };
        const estadoMotorD =
          (veiculo as any).odometro_motor_d_estado ||
          (estadoMotorA === "MOVIMENTO" ? "COMPENSADO" : "PARADO_ZVU");

        // ── Para Clientes e perfis não técnicos: Exibir estritamente o 7º Medidor como Odômetro Principal oficial ──
        if (!isEquipeTecnica) {
          return (
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(249, 115, 22, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between col-span-1 sm:col-span-2 xl:col-span-2"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Gauge className="h-3.5 w-3.5 animate-pulse" /> ODÔMETRO ACUMULADO
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
                  PRECISÃO OFICIAL
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">
                      {odometroPrincipal7.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-orange-600/80 dark:text-orange-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Quilometragem Oficial do Veículo
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div
                    className={
                      veiculo.status_operacional === "em_rota"
                        ? "text-orange-600 dark:text-orange-400 font-bold"
                        : veiculo.ignicao
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-sky-600 dark:text-sky-400 font-bold"
                    }
                  >
                    {veiculo.status_operacional === "em_rota"
                      ? "EM TRÂNSITO"
                      : veiculo.ignicao
                        ? "LIGADO"
                        : "ESTACIONADO"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {veiculo.status_operacional === "em_rota"
                      ? "Telemetria Contínua"
                      : veiculo.ignicao
                        ? "Motor Ligado"
                        : "Veículo Estacionado"}
                  </div>
                </div>
              </div>

              {/* Rodapé de Telemetria: Última Transmissão */}
              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-orange-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-orange-300 whitespace-nowrap">
                    <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" /> ÚLTIMA
                    TRANSMISSÃO
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {infoPing.dataHoraFormatada}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span
                    className={`px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${infoPing.corBadge} ${infoPing.bgBadge} ${infoPing.bordaBadge}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        infoPing.statusBadge === "ativo_rota"
                          ? "bg-orange-500 animate-ping"
                          : infoPing.statusBadge === "ativo_marcha_lenta"
                            ? "bg-amber-500 animate-pulse"
                            : infoPing.statusBadge === "sem_sinal"
                              ? "bg-rose-500"
                              : "bg-sky-500"
                      }`}
                    />
                    {infoPing.statusRotulo}
                  </span>
                  <span
                    className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate"
                    title={infoPing.modoDescricao}
                  >
                    {infoPing.modoDescricao}
                  </span>
                </div>
              </div>
            </TiltCard>
          );
        }

        // ── Demais perfis não SuperADM: Exibir apenas o 7º Odômetro Principal (demais 6 exclusivos do SuperADM) ──
        if (!isSuperAdmin) {
          return (
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(249, 115, 22, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between col-span-1 sm:col-span-2 xl:col-span-2"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Gauge className="h-3.5 w-3.5 animate-pulse" /> ODÔMETRO ACUMULADO
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
                  PRECISÃO OFICIAL
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">
                      {odometroPrincipal7.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-orange-600/80 dark:text-orange-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Quilometragem Oficial do Veículo
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div
                    className={
                      veiculo.status_operacional === "em_rota"
                        ? "text-orange-600 dark:text-orange-400 font-bold"
                        : veiculo.ignicao
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-sky-600 dark:text-sky-400 font-bold"
                    }
                  >
                    {veiculo.status_operacional === "em_rota"
                      ? "EM TRÂNSITO"
                      : veiculo.ignicao
                        ? "LIGADO"
                        : "ESTACIONADO"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {veiculo.status_operacional === "em_rota"
                      ? "Telemetria Contínua"
                      : veiculo.ignicao
                        ? "Motor Ligado"
                        : "Veículo Estacionado"}
                  </div>
                </div>
              </div>

              {/* Rodapé de Telemetria: Última Transmissão */}
              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-orange-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-orange-300 whitespace-nowrap">
                    <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" /> ÚLTIMA
                    TRANSMISSÃO
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {infoPing.dataHoraFormatada}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span
                    className={`px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${infoPing.corBadge} ${infoPing.bgBadge} ${infoPing.bordaBadge}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        infoPing.statusBadge === "ativo_rota"
                          ? "bg-orange-500 animate-ping"
                          : infoPing.statusBadge === "ativo_marcha_lenta"
                            ? "bg-amber-500 animate-pulse"
                            : infoPing.statusBadge === "sem_sinal"
                              ? "bg-rose-500"
                              : "bg-sky-500"
                      }`}
                    />
                    {infoPing.statusRotulo}
                  </span>
                  <span
                    className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate"
                    title={infoPing.modoDescricao}
                  >
                    {infoPing.modoDescricao}
                  </span>
                </div>
              </div>
            </TiltCard>
          );
        }

        // ── Exclusivo SuperADM: Todos os 7 Odômetros Ativos e em Confrontação em Tempo Real ──
        return (
          <>
            {/* Faixa Tática SuperADM: Governança dos 7 Odômetros */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 p-2.5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
                <span className="font-mono font-bold text-xs text-white uppercase tracking-wider">
                  BANCADA DE ODOMETRIA COMPARATIVA · 7 MOTORES SIMULTÂNEOS ATIVOS
                </span>
                <span className="text-[10px] font-mono text-indigo-300 hidden md:inline">
                  (Exclusivo SuperADM · Deslocamento real e Média Consensual)
                </span>
              </div>
              <button
                type="button"
                onClick={handleEqualizarTodosSuperAdm}
                className="px-3 py-1 rounded-xl text-[10px] font-mono font-bold bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-500/40 transition active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Equalizar todos os 7 odômetros com a marcação oficial do WGS-84"
              >
                <RotateCcw className="h-3 w-3" />
                <span>EQUALIZAR TODOS (WGS-84)</span>
              </button>
            </div>

            {/* 1. Odômetro Base (WGS-84 / Fusão Satélite) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(249, 115, 22, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Gauge className="h-3.5 w-3.5 animate-pulse" /> 1. BASE (WGS-84)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
                  GEODÉSICO BASE
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">
                      {kmWgs84.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-orange-600/80 dark:text-orange-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Geodésico WGS-84 · ZVU 1.0m
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div
                    className={
                      veiculo.status_operacional === "em_rota"
                        ? "text-orange-600 dark:text-orange-400 font-bold"
                        : veiculo.ignicao
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-sky-600 dark:text-sky-400 font-bold"
                    }
                  >
                    {veiculo.status_operacional === "em_rota"
                      ? "EM TRÂNSITO"
                      : veiculo.ignicao
                        ? "LIGADO"
                        : "ESTACIONADO"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    Fusão Satélite / Curvas
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-orange-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-orange-300 whitespace-nowrap">
                    <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" /> ÚLTIMO PING
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {infoPing.dataHoraFormatada}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                    WGS-84 Padrão
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Referência Canônica
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 2. Odômetro Cinemático (v × Δt em Paralelo) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(139, 92, 246, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-violet-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-violet-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Activity className="h-3.5 w-3.5" /> 2. CINEMÁTICO (v × Δt)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[9px] border border-violet-500/20 whitespace-nowrap font-bold">
                  AFERIÇÃO PARALELA
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-violet-600 dark:text-violet-300 dark:drop-shadow-[0_0_12px_rgba(139,92,246,0.6)]">
                      {(odometroCinematico ?? odometroServidor).toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-violet-600/80 dark:text-violet-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Integração Velocidade e Tempo
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-violet-600 dark:text-violet-400 font-bold">
                    {deltaCinematico !== null && deltaCinematico >= 0.01
                      ? `Δ ${odometroCinematico && odometroCinematico >= odometroServidor ? "+" : "-"}${deltaCinematico.toFixed(2)} km`
                      : deltaCinematico !== null
                        ? "Δ +0.00 km"
                        : "CALIBRADO"}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {deltaCinematico !== null && deltaCinematico < 0.01
                      ? !veiculo.ignicao || velocidade === 0
                        ? "Marco Base (Parado)"
                        : "Aferição 100% Alinhada"
                      : "Confrontação Direta"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-violet-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-violet-300 whitespace-nowrap">
                    <Route className="h-3 w-3 text-violet-600 dark:text-violet-400" /> CONFRONTAÇÃO
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {odometroCinematico !== null
                      ? `${(odometroCinematico - odometroServidor >= 0 ? "+" : "") + (odometroCinematico - odometroServidor).toFixed(3)} km vs WGS-84`
                      : "Sincronizado na linha de base"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    Cinemático Ativo
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Trapézio (v1+v2)/2 · Δt
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 3. Odômetro Hardware (MCU Flash / G900L / J16) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(14, 165, 233, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-sky-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-sky-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Cpu className="h-3.5 w-3.5" /> 3. {veiculo.rastreador_modelo || "G900L"} (MCU
                  FLASH)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[9px] border border-sky-500/20 whitespace-nowrap font-bold">
                  {veiculo.rastreador_modelo?.toUpperCase().includes("G900")
                    ? "G900L 4G"
                    : "GT06 FLASH"}
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-sky-600 dark:text-sky-300 dark:drop-shadow-[0_0_12px_rgba(14,165,233,0.6)]">
                      {odometroHardware !== null
                        ? odometroHardware.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })
                        : "—"}
                    </span>
                    <span className="text-xs font-mono font-bold text-sky-600/80 dark:text-sky-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    {odometroHardware !== null
                      ? dataHardware
                        ? `Lido às ${formatarHoraBrasil(dataHardware, false)}`
                        : `Flash EEPROM ${veiculo.rastreador_modelo || "G900L"} (Auto 5m)`
                      : "Aguardando leitura MCU"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 font-mono">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onConsultarOdometroMcu}
                      disabled={consultandoOdometroMcu}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title={
                        veiculo.rastreador_modelo?.toUpperCase().includes("G900")
                          ? "Consultar parâmetros e status da controladora G900L"
                          : "Enviar comando MILEAGE# para ler quilometragem interna da MCU"
                      }
                    >
                      {consultandoOdometroMcu ? "LENDO..." : "LER MCU"}
                    </button>
                    <button
                      type="button"
                      onClick={onCalibrarOdometroMcu}
                      disabled={calibrandoOdometroMcu}
                      className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title={`Gravar ${odometroServidor.toFixed(1)} km na MCU ${veiculo.rastreador_modelo || "G900L"}`}
                    >
                      {calibrandoOdometroMcu ? "GRAVANDO..." : "EQUALIZAR"}
                    </button>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[8.5px]">
                    Auto-sync 5m
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-sky-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-sky-300 whitespace-nowrap">
                    <SlidersHorizontal className="h-3 w-3 text-sky-600 dark:text-sky-400" /> DESVIO
                    MCU
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black">
                    {odometroHardware !== null && delta !== null
                      ? `Δ = ${delta.toFixed(2)} km`
                      : "Auto-atualização ativa"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span
                    className={`px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                      odometroHardware === null
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                        : estaSincronizado
                          ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        odometroHardware === null
                          ? "bg-slate-400"
                          : estaSincronizado
                            ? "bg-orange-500"
                            : "bg-amber-500"
                      }`}
                    />
                    {odometroHardware === null
                      ? "Aguardando Leitura"
                      : estaSincronizado
                        ? "100% Sincronizado"
                        : `Desvio: ±${delta?.toFixed(2)} km`}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    {odometroHardware !== null ? "Flash EEPROM J16" : "Clique em LER MCU"}
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 4. Motor A: Fusão Bayesiana 1D (Curvatura Gaussiana e ZVU Histerético) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(99, 102, 241, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-indigo-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-indigo-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Sparkles className="h-3.5 w-3.5" /> 4. MOTOR A (BAYESIANO 1D)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[9px] border border-indigo-500/20 whitespace-nowrap font-bold">
                  CURVATURA GAUSS
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-indigo-600 dark:text-indigo-300 dark:drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]">
                      {kmMotorA.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-600/80 dark:text-indigo-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    ZVU Histerético · Pesos Dinâmicos
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-indigo-600 dark:text-indigo-400 font-bold">
                    {`Δ ${(deltaMotorA >= 0 ? "+" : "") + deltaMotorA.toFixed(2)} km`}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {estadoMotorA === "MOVIMENTO" ? "Em Deslocamento" : "Parado (ZVU)"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-indigo-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-indigo-300 whitespace-nowrap">
                    <Layers className="h-3 w-3 text-indigo-600 dark:text-indigo-400" /> PESOS
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">
                    {`Arco ${Math.round(pesosMotorA.gnssOuArco)}% · Cin ${Math.round(pesosMotorA.cinematico)}% · MCU ${Math.round(pesosMotorA.mcuJ16)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />k ={" "}
                    {leituraA.fatorCalibracaoK.toFixed(4)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Curvatura WGS-84
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 5. Motor B: Haversine Esférico (Doppler Trapezoidal e Variâncias Fixas) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(245, 158, 11, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-amber-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-amber-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Compass className="h-3.5 w-3.5" /> 5. MOTOR B (HAVERSINE)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] border border-amber-500/20 whitespace-nowrap font-bold">
                  DOPPLER TRAP
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-300 dark:drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
                      {kmMotorB.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Esférico R=6371km · Variância Fixa
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-amber-600 dark:text-amber-400 font-bold">
                    {`Δ ${(deltaMotorB >= 0 ? "+" : "") + deltaMotorB.toFixed(2)} km`}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {estadoMotorB === "MOVIMENTO" ? "Em Deslocamento" : "Parado (ZVU)"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-amber-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-amber-300 whitespace-nowrap">
                    <Route className="h-3 w-3 text-amber-600 dark:text-amber-400" /> PESOS
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">
                    {`GNSS ${Math.round(pesosMotorB.gnssOuArco)}% · Dop ${Math.round(pesosMotorB.cinematico)}% · MCU ${Math.round(pesosMotorB.mcuJ16)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Haversine Puro
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Controle de Histerese
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 6. Motor C: EKF 1D Canônico (Filtro de Kalman Estendido com Expansão de Taylor) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(249, 115, 22, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <ShieldCheck className="h-3.5 w-3.5" /> 6. MOTOR C (EKF CANÔNICO)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
                  TAYLOR 4ª ORDEM
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(249,115,22,0.6)]">
                      {kmMotorC.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-orange-600/80 dark:text-orange-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Filtro Kalman Estendido · 6 Regras ZVU
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-orange-600 dark:text-orange-400 font-bold">
                    {`Δ ${(deltaMotorC >= 0 ? "+" : "") + deltaMotorC.toFixed(2)} km`}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {estadoMotorC === "MOVIMENTO" ? "Fusão EKF Ativa" : "Parado (ZVU 6R)"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-orange-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-orange-300 whitespace-nowrap">
                    <Zap className="h-3 w-3 text-orange-600 dark:text-orange-400" /> PESOS EKF
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">
                    {`Arco ${Math.round(pesosMotorC.gnssOuArco)}% · Cin ${Math.round(pesosMotorC.cinematico)}% · MCU ${Math.round(pesosMotorC.mcuJ16)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />k ={" "}
                    {leituraC.fatorCalibracaoK.toFixed(5)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    ZVU 6 Regras Anti-Ruído
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 7. Odômetro Principal (Média Fusional de 1, 4, 5 e 6 em Tempo Real) */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(236, 72, 153, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-pink-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-pink-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Calculator className="h-3.5 w-3.5 animate-pulse" /> 7. PRINCIPAL (1, 4, 5 E 6)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-300 text-[9px] border border-pink-500/20 whitespace-nowrap font-bold">
                  MÉDIA FUSIONAL
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-pink-600 dark:text-pink-300 dark:drop-shadow-[0_0_12px_rgba(236,72,153,0.6)]">
                      {odometroPrincipal7.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-pink-600/80 dark:text-pink-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Média Consensual (M1+M4+M5+M6)/4
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-pink-600 dark:text-pink-400 font-bold">
                    {`Δ ${(deltaMotorMedia7 >= 0 ? "+" : "") + deltaMotorMedia7.toFixed(2)} km`}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {veiculo.status_operacional === "em_rota"
                      ? "Consenso em Rota"
                      : "Consenso Parado"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-pink-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-pink-300 whitespace-nowrap">
                    <Layers className="h-3 w-3 text-pink-600 dark:text-pink-400" /> COMPOSIÇÃO
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">
                    M1 25% · M4 25% · M5 25% · M6 25%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-pink-500 animate-ping" />
                    Tempo Real Ativo
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Reatividade Imediata
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* 8. Motor D: Fusão Bayesiana com Compensação de Sombra GNSS / Cold-Start */}
            <TiltCard
              maxTilt={10}
              spotlightColor="rgba(59, 130, 246, 0.25)"
              className="rounded-2xl p-3.5 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-blue-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-blue-950/20 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <LocateFixed className="h-3.5 w-3.5 animate-pulse text-blue-600 dark:text-blue-400" />{" "}
                  8. MOTOR D (COMPENSADO GNSS)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[9px] border border-blue-500/20 whitespace-nowrap font-bold">
                  SOMBRA GNSS
                </span>
              </div>

              <div className="my-2 flex items-baseline justify-between">
                <div>
                  <div className="flex items-baseline">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 dark:text-blue-300 dark:drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]">
                      {kmMotorD.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-600/80 dark:text-blue-400/80 ml-1.5">
                      KM
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Recuperação de Gap · Sem Degrau
                  </div>
                </div>
                <div className="text-right font-mono text-[10px]">
                  <div className="text-blue-600 dark:text-blue-400 font-bold">
                    {`Δ ${(deltaMotorD >= 0 ? "+" : "") + deltaMotorD.toFixed(2)} km`}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[9px]">
                    {estadoMotorD === "COMPENSADO" || estadoMotorD === "MOVIMENTO"
                      ? "Em Deslocamento"
                      : "Parado (ZVU)"}
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-100/90 dark:bg-slate-950/90 rounded-xl border border-slate-200 dark:border-blue-500/30 p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-blue-300 whitespace-nowrap">
                    <Layers className="h-3 w-3 text-blue-600 dark:text-blue-400" /> PESOS
                  </span>
                  <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">
                    {`Arco ${Math.round(pesosMotorD.gnssOuArco || 50)}% · Cin ${Math.round(pesosMotorD.cinematico || 30)}% · Gap ${Math.round(pesosMotorD.compensacaoSombra || 20)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-[9px] font-mono pt-1 border-t border-slate-200/80 dark:border-slate-800/80">
                  <span className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wider flex items-center gap-1 shrink-0 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
                    Anti-Degrau
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[8.5px] text-right truncate">
                    Reaquisição Contínua
                  </span>
                </div>
              </div>
            </TiltCard>
          </>
        );
      })()}
    </div>
  );
}

// ==========================================
// 2. CARD DE PAYWALL 3D (COM EFEITO HOLOGRÁFICO TILT)
// ==========================================
interface CardPaywall3DProps {
  titulo: string;
  icone: any;
  cor: "sky" | "amber" | "rose" | "teal";
  recurso: string;
  onSolicitarUpgrade?: (recurso: string) => void;
  className?: string;
}

function CardPaywall3D({
  titulo,
  icone: Icone,
  cor,
  recurso,
  onSolicitarUpgrade,
  className,
}: CardPaywall3DProps) {
  const coresBorda = {
    sky: "border-sky-500/30 hover:border-sky-500/60 bg-sky-500/5",
    amber: "border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5",
    rose: "border-rose-500/30 hover:border-rose-500/60 bg-rose-500/5",
    teal: "border-orange-500/30 hover:border-orange-500/60 bg-orange-500/5",
  };

  const coresTexto = {
    sky: "text-sky-500",
    amber: "text-amber-500",
    rose: "text-rose-500",
    teal: "text-orange-500",
  };

  return (
    <TiltCard
      maxTilt={8}
      spotlightColor="rgba(245, 158, 11, 0.2)"
      onClick={() => onSolicitarUpgrade && onSolicitarUpgrade(recurso)}
      className={`p-3 rounded-2xl border ${coresBorda[cor]} flex flex-col items-center justify-between text-center cursor-pointer transition-all duration-300 group ${className || ""}`}
      title="Recurso restrito ao plano atual. Clique para solicitar upgrade."
    >
      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <Icone className={`h-3.5 w-3.5 ${coresTexto[cor]} opacity-80`} />
        <span>{titulo}</span>
      </div>

      <div className="my-3 flex flex-col items-center justify-center">
        <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all duration-300 shadow-xs">
          <Lock className="h-4 w-4" />
        </div>
      </div>

      <div>
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-slate-900/90 text-amber-800 dark:text-amber-400 border border-amber-400/40 dark:border-amber-500/30 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-xs">
          Fazer Upgrade
        </span>
      </div>
    </TiltCard>
  );
}
