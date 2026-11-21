import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  UserCheck,
  Building2,
  Calendar,
  MapPin,
  Plus,
  Clock,
  AlertTriangle,
  Radio,
  Send,
  Loader2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Smartphone,
  Navigation,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  carregarVigilantes,
  carregarPostosVigilancia,
  carregarCheckpoints,
  carregarTurnos,
  avaliarPosicaoVigilante,
  notificarAlertaRondaWhatsapp,
  excluirCheckpoint,
  calcularTemposDeslocamentoCheckpoints,
  verificarDesvioRotaVigilante,
  verificarAtrasoProximoPonto,
  carregarCicloAtivo,
  dispararAlertaRonda,
} from "../services/vigilanteService";
import type {
  Vigilante,
  PostoVigilancia,
  RondaCheckpoint,
  TurnoVigilancia,
  CicloRondaExecucao,
} from "../types";
import { MapaRondaVigilante } from "./MapaRondaVigilante";
import { ModalNovoVigilante } from "./ModalNovoVigilante";
import { ModalNovoPosto } from "./ModalNovoPosto";
import { ModalNovoCheckpoint } from "./ModalNovoCheckpoint";
import { ModalEscalaTurno } from "./ModalEscalaTurno";
import { VisaoVigilanteOperacional } from "./VisaoVigilanteOperacional";
import { ModalMapearPostoCelular } from "./ModalMapearPostoCelular";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";

export function VigilantesView() {
  const { session } = useAuth();
  const [modoVisaoVigilante, setModoVisaoVigilante] = useState(false);
  const [calculandoTempos, setCalculandoTempos] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"mapa" | "escalas" | "cadastros">("mapa");

  // Dados
  const [vigilantes, setVigilantes] = useState<Vigilante[]>([]);
  const [postos, setPostos] = useState<PostoVigilancia[]>([]);
  const [turnos, setTurnos] = useState<TurnoVigilancia[]>([]);
  const [postoSelecionado, setPostoSelecionado] = useState<PostoVigilancia | null>(null);
  const [checkpoints, setCheckpoints] = useState<RondaCheckpoint[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modais
  const [modalVigilanteAberto, setModalVigilanteAberto] = useState(false);
  const [modalPostoAberto, setModalPostoAberto] = useState(false);
  const [modalTurnoAberto, setModalTurnoAberto] = useState(false);
  const [modalCheckpointAberto, setModalCheckpointAberto] = useState(false);
  const [modalMapearPostoAberto, setModalMapearPostoAberto] = useState(false);
  const [coordsNovoCheckpoint, setCoordsNovoCheckpoint] = useState<
    { latitude: number; longitude: number } | undefined
  >(undefined);
  const [modoMarcarPontoNoMapa, setModoMarcarPontoNoMapa] = useState(false);

  // Posição ao vivo do rastreador / aplicativo do vigilante
  const [posicaoVigilante, setPosicaoVigilante] = useState<{
    latitude: number;
    longitude: number;
    nome?: string;
    ultimaAtualizacao?: string;
    statusRota?: "conforme" | "desvio" | "atrasado";
    velocidadeKmH?: number;
  } | null>(null);

  // Estados de Auditoria da Ronda na Central
  const [cicloAtivoCentral, setCicloAtivoCentral] = useState<CicloRondaExecucao | null>(null);
  const [alertaCentralDesvio, setAlertaCentralDesvio] = useState<string | null>(null);
  const [alertaCentralAtraso, setAlertaCentralAtraso] = useState<string | null>(null);

  // Turno ativo no posto selecionado
  const turnoAtivoNoPosto = useMemo(() => {
    if (!postoSelecionado) return null;
    return (
      turnos.find((t) => t.posto_id === postoSelecionado.id && t.status === "em_andamento") || null
    );
  }, [postoSelecionado, turnos]);

  // Carrega dados iniciais
  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    try {
      const [vigs, pts, trns] = await Promise.all([
        carregarVigilantes(),
        carregarPostosVigilancia(),
        carregarTurnos(),
      ]);
      setVigilantes(vigs);
      setPostos(pts);
      setTurnos(trns);

      if (pts.length > 0 && !postoSelecionado) {
        setPostoSelecionado(pts[0]);
      }
    } catch (err) {
      console.warn("Erro ao carregar dados do módulo vigilante:", err);
    } finally {
      setCarregando(false);
    }
  }, [postoSelecionado]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  // Carrega checkpoints quando o posto selecionado muda
  const carregarPontosDoPosto = useCallback(async (postoId: string) => {
    const cps = await carregarCheckpoints(postoId);
    setCheckpoints(cps);
  }, []);

  useEffect(() => {
    if (postoSelecionado) {
      carregarPontosDoPosto(postoSelecionado.id);
    } else {
      setCheckpoints([]);
    }
  }, [postoSelecionado, carregarPontosDoPosto]);

  // Monitoramento contínuo de posição e alertas em tempo real na Central
  useEffect(() => {
    if (!postoSelecionado) {
      setPosicaoVigilante(null);
      return;
    }

    const postoId = postoSelecionado.id;

    // 1. Carga inicial da última posição registrada no posto
    try {
      const rawLive = localStorage.getItem(`gd_posicao_live_${postoId}`);
      if (rawLive) {
        const parsed = JSON.parse(rawLive);
        if (parsed.latitude && parsed.longitude) {
          setPosicaoVigilante({
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            nome: parsed.vigilanteNome || turnoAtivoNoPosto?.vigilante?.nome || "Vigilante",
            ultimaAtualizacao: new Date(parsed.timestamp).toLocaleTimeString("pt-BR"),
            statusRota: parsed.statusRota || "conforme",
            velocidadeKmH: parsed.velocidadeKmH,
          });
        }
      } else if (postoSelecionado.latitude && postoSelecionado.longitude) {
        setPosicaoVigilante({
          latitude: postoSelecionado.latitude + 0.00008,
          longitude: postoSelecionado.longitude + 0.00008,
          nome: turnoAtivoNoPosto?.vigilante?.nome || "Vigilante",
          ultimaAtualizacao: "Aguardando sinal",
          statusRota: "conforme",
        });
      }
    } catch {}

    // 2. Inscrição no canal Realtime Broadcast do Posto
    const canalRonda = supabase
      .channel(`hunter_ronda_live_${postoId}`)
      .on("broadcast", { event: "posicao_vigilante" }, (msg: any) => {
        const dados = msg?.payload || msg;
        if (dados?.latitude && dados?.longitude) {
          setPosicaoVigilante({
            latitude: dados.latitude,
            longitude: dados.longitude,
            nome: dados.vigilanteNome || turnoAtivoNoPosto?.vigilante?.nome || "Vigilante",
            ultimaAtualizacao: new Date().toLocaleTimeString("pt-BR"),
            statusRota: dados.statusRota || "conforme",
            velocidadeKmH: dados.velocidadeKmH,
          });
        }
      })
      .on("broadcast", { event: "novo_alerta_ronda" }, (msg: any) => {
        const alerta = msg?.payload || msg;
        if (alerta?.detalhes) {
          toast.error(alerta.detalhes);
        }
      })
      .subscribe();

    // 3. Ouvinte de eventos locais no navegador
    const handlePosicaoLiveLocal = (e: any) => {
      const d = e.detail;
      if (d && d.postoId === postoId && d.latitude && d.longitude) {
        setPosicaoVigilante({
          latitude: d.latitude,
          longitude: d.longitude,
          nome: d.vigilanteNome || turnoAtivoNoPosto?.vigilante?.nome || "Vigilante",
          ultimaAtualizacao: new Date().toLocaleTimeString("pt-BR"),
          statusRota: d.statusRota || "conforme",
          velocidadeKmH: d.velocidadeKmH,
        });
      }
    };

    const handleAlertaRondaLocal = (e: any) => {
      const a = e.detail;
      if (a && a.postoId === postoId) {
        toast.error(`🚨 ${a.detalhes}`);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("hunter:posicao_vigilante_live", handlePosicaoLiveLocal);
      window.addEventListener("hunter:alerta_ronda", handleAlertaRondaLocal);
    }

    return () => {
      supabase.removeChannel(canalRonda);
      if (typeof window !== "undefined") {
        window.removeEventListener("hunter:posicao_vigilante_live", handlePosicaoLiveLocal);
        window.removeEventListener("hunter:alerta_ronda", handleAlertaRondaLocal);
      }
    };
  }, [postoSelecionado, turnoAtivoNoPosto]);

  // Auditoria periódica na Central para detectar Desvios de Rota e Atrasos (Anti-Omissão)
  useEffect(() => {
    if (!postoSelecionado) {
      setAlertaCentralDesvio(null);
      setAlertaCentralAtraso(null);
      return;
    }

    const auditarStatusRondaCentral = async () => {
      // 1. Checa ciclo ativo
      const ciclo = await carregarCicloAtivo(postoSelecionado.id);
      setCicloAtivoCentral(ciclo);

      if (ciclo && ciclo.status === "em_andamento") {
        const atraso = verificarAtrasoProximoPonto(postoSelecionado.id, ciclo, checkpoints);
        setAlertaCentralAtraso(atraso.atrasado ? atraso.mensagem || null : null);
      } else {
        setAlertaCentralAtraso(null);
      }

      // 2. Checa desvio de rota se houver posição conhecida do vigilante
      if (posicaoVigilante && posicaoVigilante.latitude && posicaoVigilante.longitude) {
        const desvio = verificarDesvioRotaVigilante(
          posicaoVigilante,
          postoSelecionado,
          checkpoints,
        );
        setAlertaCentralDesvio(desvio.emDesvio ? desvio.motivo : null);
      } else {
        setAlertaCentralDesvio(null);
      }
    };

    auditarStatusRondaCentral();
    const interval = setInterval(auditarStatusRondaCentral, 10000);
    return () => clearInterval(interval);
  }, [postoSelecionado, checkpoints, posicaoVigilante]);

  // Avaliação situacional da ronda
  const statusRonda = useMemo(() => {
    if (!postoSelecionado || !posicaoVigilante) {
      return { dentroDoPerimetro: true, checkpointMaisProximo: null };
    }
    return avaliarPosicaoVigilante(
      posicaoVigilante.latitude,
      posicaoVigilante.longitude,
      postoSelecionado,
      checkpoints,
    );
  }, [postoSelecionado, posicaoVigilante, checkpoints]);

  // Manipulador de clique no mapa para novo checkpoint
  const handleMapaClickParaCheckpoint = (coords: { latitude: number; longitude: number }) => {
    setCoordsNovoCheckpoint(coords);
    setModoMarcarPontoNoMapa(false);
    setModalCheckpointAberto(true);
  };

  const handleExcluirCheckpoint = async (id: string, nome: string) => {
    if (window.confirm(`Deseja remover o checkpoint "${nome}"?`)) {
      const ok = await excluirCheckpoint(id);
      if (ok) {
        toast.success("Checkpoint removido.");
        if (postoSelecionado) carregarPontosDoPosto(postoSelecionado.id);
      } else {
        toast.error("Falha ao remover checkpoint.");
      }
    }
  };

  const handleDispararAlertaTesteWhatsapp = async (cp: RondaCheckpoint) => {
    if (!postoSelecionado) return;
    const msg =
      `🚨 *ALERTA DE RONDA TÁTICA - GD SEGURANÇA*\n\n` +
      `📍 Posto: *${postoSelecionado.nome}*\n` +
      `👤 Vigilante: *${turnoAtivoNoPosto?.vigilante?.nome || "Não escalado"}*\n` +
      `🔵 Checkpoint: *${cp.nome}*\n` +
      `⏰ Horário Previsto: *${cp.horario_previsto?.slice(0, 5)}* (Janela ±${cp.tolerancia_minutos}min)\n` +
      `⚠️ Status: *Ausência detectada no ponto de ronda após limite de tolerância!*\n` +
      `📡 Hardware: Rastreador Pessoal IMEI ${turnoAtivoNoPosto?.rastreador_imei || "Sem IMEI"}\n\n` +
      `Central de Operações GD acionada.`;

    const tel = "24999999999";
    const ok = await notificarAlertaRondaWhatsapp(tel, msg);
    if (ok) {
      toast.success("Alerta tático de ronda despachado para a Supervisão via WhatsApp!");
    } else {
      toast.info("Simulação de alerta de ronda gerada com sucesso.");
    }
  };

  const handleCalcularTemposCheckpoints = async () => {
    if (!postoSelecionado || checkpoints.length === 0) {
      toast.error("Nenhum checkpoint cadastrado neste posto.");
      return;
    }

    setCalculandoTempos(true);
    try {
      const atualizados = await calcularTemposDeslocamentoCheckpoints(
        postoSelecionado.id,
        checkpoints,
      );
      setCheckpoints(atualizados);
      toast.success(
        "Tempos de deslocamento calculados com sucesso! Janela padrão de ±3 min aplicada.",
      );
    } catch {
      toast.error("Falha ao calcular tempos de deslocamento.");
    } finally {
      setCalculandoTempos(false);
    }
  };

  // Se o usuário logado for Vigilante ou se o supervisor ativar o modo de simulação
  if (session?.isVigilante || modoVisaoVigilante) {
    const vigAtual = vigilantes.find(
      (v) => v.usuario_id === session?.userId || v.email === session?.email,
    );
    return (
      <VisaoVigilanteOperacional
        vigilanteLogado={vigAtual || null}
        modoSupervisor={!session?.isVigilante}
        onVoltarPainelGeral={() => setModoVisaoVigilante(false)}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-2 sm:p-4 pb-20">
      {/* Header do Módulo Vigilante */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Módulo Vigilante e Rondas Táticas
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                PROPRIEDADE FECHADA
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rastreamento de pessoas com mapa ultra-aproximado e tolerância estrita de ±3 minutos
              nos pontos azuis
            </p>
          </div>
        </div>

        {/* Botões Rápidos de Ação */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (!postoSelecionado) {
                toast.error("Selecione um posto fixo para mapear a ronda.");
                return;
              }
              setModalMapearPostoAberto(true);
            }}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 hover:from-orange-500 hover:to-amber-500 text-white shadow-md shadow-orange-500/25 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Mapear Posto com Celular</span>
          </button>

          <button
            onClick={() => setModoVisaoVigilante(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white shadow-md shadow-blue-700/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Simular Visão do Vigilante</span>
          </button>

          <button
            onClick={() => setModalTurnoAberto(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Escalar Plantão</span>
          </button>

          <button
            onClick={() => setModalPostoAberto(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Novo Posto</span>
          </button>

          <button
            onClick={() => setModalVigilanteAberto(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Novo Vigilante</span>
          </button>
        </div>
      </div>

      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-slate-300/60 dark:border-slate-800 pb-2">
        <button
          onClick={() => setAbaAtiva("mapa")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            abaAtiva === "mapa"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <Radio className="h-4 w-4" />
          <span>Cockpit de Ronda ao Vivo</span>
        </button>

        <button
          onClick={() => setAbaAtiva("escalas")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            abaAtiva === "escalas"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Plantões e Rastreadores ({turnos.length})</span>
        </button>

        <button
          onClick={() => setAbaAtiva("cadastros")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            abaAtiva === "cadastros"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Postos e Vigilantes</span>
        </button>
      </div>

      {/* ABA 1: COCKPIT DO MAPA AO VIVO */}
      {abaAtiva === "mapa" && (
        <div className="space-y-4">
          {/* Seletor do Posto e Status Situacional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Seletor de Posto */}
            <div className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                Propriedade / Posto Ativo
              </label>
              <select
                value={postoSelecionado?.id || ""}
                onChange={(e) => {
                  const pt = postos.find((p) => p.id === e.target.value);
                  if (pt) setPostoSelecionado(pt);
                }}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
              >
                {postos.length === 0 && <option value="">Cadastre um posto de vigilância</option>}
                {postos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Vigilante em Turno */}
            <div className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Vigilante em Plantão
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
                  <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                  {turnoAtivoNoPosto?.vigilante?.nome || posicaoVigilante?.nome || "Vigilante"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                  Matrícula: {turnoAtivoNoPosto?.vigilante?.matricula || "VIG-01"}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                  turnoAtivoNoPosto || posicaoVigilante
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
                }`}
              >
                {turnoAtivoNoPosto || posicaoVigilante ? "EM RONDA" : "SEM ESCALA"}
              </span>
            </div>

            {/* Deslocamento ao Vivo do Vigilante */}
            <div className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Monitoramento ao Vivo
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5 font-mono">
                  {posicaoVigilante
                    ? `${posicaoVigilante.latitude.toFixed(5)}, ${posicaoVigilante.longitude.toFixed(5)}`
                    : "Aguardando sinal GPS"}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Última leitura: {posicaoVigilante?.ultimaAtualizacao || "--:--"}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                  alertaCentralDesvio
                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/40 animate-pulse"
                    : alertaCentralAtraso
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40"
                      : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                }`}
              >
                {alertaCentralDesvio ? "DESVIO" : alertaCentralAtraso ? "ATRASO" : "NA ROTA"}
              </span>
            </div>

            {/* Integridade do Perímetro */}
            <div className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Auditoria de Perímetro
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
                  {statusRonda.dentroDoPerimetro && !alertaCentralDesvio ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Dentro da Propriedade
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      <span className="text-rose-600 dark:text-rose-400">Alerta de Trajeto!</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Checkpoints: {checkpoints.length} cadastrados
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalMapearPostoAberto(true)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-sm hover:from-orange-500 hover:to-amber-500"
                  title="Mapear posto em campo usando o GPS do celular"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>Mapear Celular</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoMarcarPontoNoMapa(!modoMarcarPontoNoMapa)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    modoMarcarPontoNoMapa
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{modoMarcarPontoNoMapa ? "Clique no Mapa..." : "Checkpoint Azul"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Alertas em Tempo Real na Central de Monitoramento */}
          {alertaCentralDesvio && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between shadow-sm animate-pulse">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <span className="block font-black text-rose-700 dark:text-rose-300">
                    ALERTA TÁTICO NA CENTRAL: DESVIO DE ROTA DETECTADO!
                  </span>
                  <span className="font-normal">{alertaCentralDesvio}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-rose-600 text-white shrink-0">
                AÇÃO IMEDIATA
              </span>
            </div>
          )}

          {alertaCentralAtraso && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <span className="block font-black text-amber-700 dark:text-amber-300">
                    ALERTA TÁTICO NA CENTRAL: PONTO DE RONDA NÃO ATINGIDO NO TEMPO ESTIPULADO!
                  </span>
                  <span className="font-normal">{alertaCentralAtraso}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 shrink-0">
                JANELA EXPIRADA
              </span>
            </div>
          )}

          {/* Mapa Ultra-Aproximado com Perímetro e Checkpoints Azuis */}
          {postoSelecionado ? (
            <div className="space-y-2">
              {modoMarcarPontoNoMapa && (
                <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>
                      <strong>Modo de Marcação Ativo:</strong> Clique exatamente no local da
                      propriedade onde deseja fixar o checkpoint azul de ronda.
                    </span>
                  </div>
                  <button
                    onClick={() => setModoMarcarPontoNoMapa(false)}
                    className="text-xs font-bold underline hover:text-slate-900 dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <MapaRondaVigilante
                posto={postoSelecionado}
                checkpoints={checkpoints}
                posicaoVigilante={posicaoVigilante}
                modoAdicionarPonto={modoMarcarPontoNoMapa}
                onAdicionarPontoClick={handleMapaClickParaCheckpoint}
                alturaPx={440}
              />
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 rounded-3xl bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-800">
              Nenhum posto de vigilância cadastrado. Clique em "+ Novo Posto" acima para cadastrar a
              propriedade.
            </div>
          )}

          {/* Lista de Checkpoints Azuis com Horários Previstos e Janela ±3min */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-600 inline-block shadow-[0_0_8px_#2563eb]" />
                  Roteiro de Ronda Contínua 24h (Tolerância Dinâmica: ±3 min)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sequência ordenada de pontos onde o deslocamento é calculado automaticamente e a
                  presença física é aferida por GPS absoluto
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCalcularTemposCheckpoints}
                  disabled={calculandoTempos || checkpoints.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {calculandoTempos ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Radio className="h-3.5 w-3.5" />
                  )}
                  <span>Calcular Rota e Tempos (±3 min)</span>
                </button>

                <span className="text-xs font-bold font-mono px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {checkpoints.length} pontos
                </span>
              </div>
            </div>

            {checkpoints.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nenhum checkpoint azul cadastrado neste posto. Clique em "Checkpoint Azul" para
                adicionar pontos com horários.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {checkpoints.map((cp, idx) => {
                  const horaStr = cp.horario_previsto ? cp.horario_previsto.slice(0, 5) : "--:--";
                  return (
                    <div
                      key={cp.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-blue-500/20 hover:border-blue-500/50 transition flex flex-col justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-blue-600 text-white font-mono font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                              {cp.nome}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Captura: {cp.raio_captura_metros || 5}m
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {cp.tempo_deslocamento_minutos
                            ? `+${cp.tempo_deslocamento_minutos} min`
                            : horaStr}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                        <span className="text-slate-500 font-medium">
                          Deslocamento:{" "}
                          <strong className="text-blue-600 dark:text-blue-400">
                            {cp.tempo_deslocamento_minutos ?? 5} min (±{cp.tolerancia_minutos || 3}{" "}
                            min)
                          </strong>
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDispararAlertaTesteWhatsapp(cp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition"
                            title="Testar Alerta de Ausência via WhatsApp"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluirCheckpoint(cp.id, cp.nome)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                            title="Remover Checkpoint"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: ESCALAS DE PLANTÃO E RASTREADORES PESSOAIS */}
      {abaAtiva === "escalas" && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Plantões e Alocação de Rastreadores Portáteis
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Associação de [Vigilante + Posto + IMEI do Rastreador Pessoal] para cada turno
              </p>
            </div>
            <button
              onClick={() => setModalTurnoAberto(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Escala</span>
            </button>
          </div>

          {turnos.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhuma escala de vigilância cadastrada.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {turnos.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {t.vigilante?.nome || "Vigilante"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          t.status === "em_andamento"
                            ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {t.status === "em_andamento" ? "EM TURNO" : t.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>{t.posto?.nome || "Posto"}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3 text-amber-500" />
                        IMEI: {t.rastreador_imei}
                      </span>
                      <span>
                        {t.hora_inicio?.slice(0, 5)} - {t.hora_fim?.slice(0, 5)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: CADASTROS (VIGILANTES E POSTOS) */}
      {abaAtiva === "cadastros" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Coluna Vigilantes */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Vigilantes ({vigilantes.length})
                </h3>
                <p className="text-xs text-slate-500">Profissionais da equipe operacional</p>
              </div>
              <button
                onClick={() => setModalVigilanteAberto(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar</span>
              </button>
            </div>

            <div className="space-y-2">
              {vigilantes.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {v.nome}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {v.matricula ? `Matrícula: ${v.matricula} • ` : ""}
                      {v.telefone || "Sem telefone"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {v.turno_padrao}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Postos */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Postos de Vigilância ({postos.length})
                </h3>
                <p className="text-xs text-slate-500">Propriedades e perímetros monitorados</p>
              </div>
              <button
                onClick={() => setModalPostoAberto(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar</span>
              </button>
            </div>

            <div className="space-y-2">
              {postos.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {p.nome}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {p.endereco || "Sem endereço cadastrado"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {p.perimetro_poligono?.coordinates ? "POLÍGONO" : `${p.raio_metros}m`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalVigilanteAberto && (
        <ModalNovoVigilante
          onFechar={() => setModalVigilanteAberto(false)}
          onSalvo={carregarTudo}
        />
      )}

      {modalPostoAberto && (
        <ModalNovoPosto onFechar={() => setModalPostoAberto(false)} onSalvo={carregarTudo} />
      )}

      {modalTurnoAberto && (
        <ModalEscalaTurno
          vigilantes={vigilantes}
          postos={postos}
          onFechar={() => setModalTurnoAberto(false)}
          onSalvo={carregarTudo}
        />
      )}

      {modalCheckpointAberto && postoSelecionado && (
        <ModalNovoCheckpoint
          postoId={postoSelecionado.id}
          coordenadasIniciais={coordsNovoCheckpoint}
          proximaOrdem={checkpoints.length + 1}
          onFechar={() => {
            setModalCheckpointAberto(false);
            setCoordsNovoCheckpoint(undefined);
          }}
          onSalvo={() => {
            carregarPontosDoPosto(postoSelecionado.id);
          }}
        />
      )}

      {modalMapearPostoAberto && postoSelecionado && (
        <ModalMapearPostoCelular
          posto={postoSelecionado}
          onFechar={() => setModalMapearPostoAberto(false)}
          onSalvo={() => {
            carregarPontosDoPosto(postoSelecionado.id);
          }}
        />
      )}
    </div>
  );
}
