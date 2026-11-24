import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ShieldAlert,
  CheckCircle2,
  Phone,
  PhoneCall,
  ExternalLink,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Navigation,
  MapPin,
  HeartPulse,
  Flame,
  User,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Gauge,
  Compass,
} from "lucide-react";
import type { AlertaSeguranca } from "../types";
import {
  carregarAlertasSeguranca,
  reconhecerAlertaSeguranca,
  ultimoCarregamentoAlertasTeveErro,
} from "../services/gpsService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dispararNotificacaoNativaAlerta } from "@/shared/lib/webPushService";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ehAlertaRestritoEquipeTecnica } from "../constants/alertasCatalogo";

interface AlertasAcidenteBannerProps {
  onFocarVeiculo?: (veiculoId: string) => void;
  podeVisualizarAlertas?: boolean;
}

export function AlertasAcidenteBanner({
  onFocarVeiculo,
  podeVisualizarAlertas = true,
}: AlertasAcidenteBannerProps) {
  const { session } = useAuth();
  const isEquipeTecnica = Boolean(session?.isSuperAdmin || session?.isAdmin || session?.isOperador);
  const [alertas, setAlertas] = useState<AlertaSeguranca[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [modalAlerta, setModalAlerta] = useState<AlertaSeguranca | null>(null);
  const [somSilenciado, setSomSilenciado] = useState(false);
  const [copiadoCoords, setCopiadoCoords] = useState(false);
  const [copiadoBriefing, setCopiadoBriefing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Função para tocar bipe suave de emergência tática sem dependência de arquivo externo
  const tocarAlarmeEmergencia = useCallback(() => {
    if (somSilenciado) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Tom A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Ignora restrições de autoplay silenciosamente
    }
  }, [somSilenciado]);

  useEffect(() => {
    if (!podeVisualizarAlertas) return;

    // 1. Carga inicial dos alertas pendentes
    carregarAlertasSeguranca().then((res) => {
      const naoReconhecidos = res.filter(
        (a) => !a.reconhecido && (isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(a.tipo)),
      );
      setAlertas(naoReconhecidos);
      if (naoReconhecidos.length > 0) {
        tocarAlarmeEmergencia();
      }
    });

    // 2. Escuta reativa via Supabase Realtime (Anti-Polling total)
    let realtimeAtivo = false;
    const canal = supabase
      .channel("sigo_guardiao_alertas_seguranca_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alertas_seguranca",
        },
        () => {
          carregarAlertasSeguranca().then((res) => {
            const ativos = res.filter(
              (a) => !a.reconhecido && (isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(a.tipo)),
            );
            setAlertas(ativos);
            if (ativos.length > 0) {
              tocarAlarmeEmergencia();
              const primeiro = ativos[0];
              dispararNotificacaoNativaAlerta({
                id: primeiro.id,
                titulo: formatarTituloTipo(primeiro.tipo, primeiro.detalhes),
                mensagem:
                  primeiro.detalhes ||
                  `Ocorrência crítica detectada no veículo ${primeiro.placa || ""}`,
                tipo: primeiro.tipo,
                placa: primeiro.placa,
              }).catch(() => {});
            }
          });
        },
      )
      .subscribe((status) => {
        realtimeAtivo = status === "SUBSCRIBED";
      });

    // 3. Reconciliação longa (5 min) quando Realtime conectado, ou fallback com backoff em caso de erro 500/404
    let ultimoSyncAlertas = Date.now();
    let falhasConsecutivas = 0;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const agora = Date.now();
      const baseMs = realtimeAtivo ? 300000 : 30000;
      const intervaloNecessario =
        falhasConsecutivas > 0
          ? Math.min(baseMs * Math.pow(2, falhasConsecutivas), 300000)
          : baseMs;
      if (agora - ultimoSyncAlertas < intervaloNecessario) return;
      ultimoSyncAlertas = agora;
      carregarAlertasSeguranca().then((res) => {
        if (ultimoCarregamentoAlertasTeveErro()) {
          falhasConsecutivas = Math.min(falhasConsecutivas + 1, 4);
          return;
        }
        falhasConsecutivas = 0;
        setAlertas(
          res.filter(
            (a) => !a.reconhecido && (isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(a.tipo)),
          ),
        );
      });
    }, 30000);

    return () => {
      supabase.removeChannel(canal);
      clearInterval(timer);
    };
  }, [podeVisualizarAlertas, isEquipeTecnica, tocarAlarmeEmergencia]);

  if (!podeVisualizarAlertas || alertas.length === 0) return null;

  const alertaPrincipal = alertas[0];

  const handleReconhecer = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await reconhecerAlertaSeguranca(id);
    if (ok) {
      toast.success("Alerta de segurança reconhecido e registrado na auditoria.");
      setAlertas((prev) => prev.filter((a) => a.id !== id));
      if (modalAlerta?.id === id) {
        setModalAlerta(null);
      }
    }
  };

  const executarFocoVeiculo = (veiculoId: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hunter:focar_veiculo", { detail: { veiculoId } }));
    }
    if (onFocarVeiculo) {
      onFocarVeiculo(veiculoId);
    } else if (
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/monitor-gps")
    ) {
      window.location.href = `/monitor-gps?veiculo=${encodeURIComponent(veiculoId)}`;
    }
  };

  const formatarTituloTipo = (tipo: string, detalhes?: string) => {
    switch (tipo) {
      case "desvio_rota_vigilante":
        return "🚨 Desvio de Rota do Vigilante (Ronda Tática)";
      case "ausencia_checkpoint_vigilante":
        return "⏰ Checkpoint de Ronda Não Atingido no Tempo Estipulado";
      case "suspeita_jammer":
        return "Suspeita de Jammer / Silenciamento Súbito";
      case "desvio_rota":
        return "Desvio de Rota Monitorada";
      case "saida_area":
        return "Saída de Limite Estabelecido";
      case "capotamento_inclinacao":
        return "Capotamento / Inclinação Crítica";
      case "colisao_impacto":
        if (
          detalhes?.toLowerCase().includes("estacionado") ||
          detalhes?.toLowerCase().includes("toque")
        ) {
          return "Toque / Vibração no Veículo Estacionado";
        }
        return "Impacto Severo / Colisão";
      case "guincho":
        return "Guincho / Reboque Não Autorizado";
      case "parada_repentina_colisao":
        return "Parada Brusca com Choque";
      case "comportamento_anormal":
        return "Comportamento Anormal / Condução Perigosa";
      case "bateria_desconectada":
        return "Corte / Desconexão da Bateria";
      case "corte_nao_autorizado_sms":
      case "desbloqueio_nao_autorizado_sms":
        return "Defesa Ativa: Sabotagem de Relé via SMS";
      case "sos_panico":
      case "panico":
      case "sos":
        return "Botão de Pânico / SOS";
      default:
        return "Anomalia Veicular Crítica";
    }
  };

  const getBadgeCor = (gravidade: string) => {
    switch (gravidade) {
      case "critica":
        return "bg-rose-600 text-white animate-pulse";
      case "alta":
        return "bg-amber-600 text-white";
      default:
        return "bg-yellow-600 text-white";
    }
  };

  const temCoordsValidas = (lat?: number | null, lng?: number | null) => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    return Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001;
  };

  const copiarCoordenadas = (lat: number, lng: number) => {
    if (!temCoordsValidas(lat, lng)) {
      toast.error("Coordenadas GPS não disponíveis para este evento.");
      return;
    }
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopiadoCoords(true);
    toast.success("Coordenadas GPS copiadas para a área de transferência.");
    setTimeout(() => setCopiadoCoords(false), 2500);
  };

  const copiarBriefingSocorro = (alerta: AlertaSeguranca) => {
    const coordsValidas = temCoordsValidas(alerta.latitude, alerta.longitude);
    const coordsTexto = coordsValidas
      ? `${alerta.latitude.toFixed(6)}, ${alerta.longitude.toFixed(6)}`
      : "Não reportadas no evento (sem sinal de satélite)";
    const mapsTexto = coordsValidas
      ? `https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}`
      : "Indisponível (aguardando sinal GPS)";

    const texto = [
      `*OCORRÊNCIA DE EMERGÊNCIA — GD RASTREAMENTO*`,
      `*Tipo:* ${formatarTituloTipo(alerta.tipo, alerta.detalhes)} (${alerta.gravidade.toUpperCase()})`,
      `*Veículo:* ${alerta.placa || "Placa N/I"} — ${alerta.marca_modelo || "Modelo N/I"}`,
      `*Cliente/Proprietário:* ${alerta.cliente_nome || "Não informado"}`,
      `*Telefone:* ${alerta.cliente_telefone || "Não informado"}`,
      `*Documento:* ${alerta.cliente_documento || "Não informado"}`,
      `*Velocidade no Impacto:* ${alerta.velocidade} km/h`,
      `*Força G:* ${alerta.vibracao_g}G | *Inclinação:* ${alerta.inclinacao_graus}°`,
      `*Detalhes:* ${alerta.detalhes}`,
      `*Coordenadas:* ${coordsTexto}`,
      `*Google Maps:* ${mapsTexto}`,
      `*Horário:* ${new Date(alerta.created_at).toLocaleString("pt-BR")}`,
    ].join("\n");

    navigator.clipboard.writeText(texto);
    setCopiadoBriefing(true);
    toast.success("Briefing de socorro copiado para a área de transferência!");
    setTimeout(() => setCopiadoBriefing(false), 2500);
  };

  return (
    <>
      {/* BANNER TÁTICO FLUTUANTE DE ALERTA DE EMERGÊNCIA (Totalmente Desacoplado do Canvas do Mapa) */}
      <div className="fixed top-20 right-3 sm:right-6 z-40 max-w-[calc(100vw-1.5rem)] sm:max-w-md w-full pointer-events-auto transition-all duration-300">
        <div className="bg-slate-950/95 border-2 border-rose-500 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl text-white">
          {/* Cabeçalho do Card Flutuante */}
          <div className="flex items-center justify-between gap-2 border-b border-rose-900/60 pb-2">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping inline-block" />
              <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
              <span className="truncate">
                Alerta de Segurança {alertas.length > 1 ? `(${alertas.length})` : ""}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSomSilenciado(!somSilenciado)}
                className="p-1 rounded-lg hover:bg-rose-900/80 text-rose-300 hover:text-white transition"
                title={somSilenciado ? "Ativar som de emergência" : "Silenciar alarme"}
              >
                {somSilenciado ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setExpandido(!expandido)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-900/60 hover:bg-rose-800 text-[11px] text-rose-200 hover:text-white font-semibold transition"
                title={expandido ? "Recolher detalhes" : "Expandir detalhes"}
              >
                <span>{expandido ? "Recolher" : "Expandir"}</span>
                {expandido ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Dados do Alerta Principal */}
          <div className="mt-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-white flex items-center gap-2 flex-wrap">
                <span className="font-mono bg-rose-900/90 text-white px-2 py-0.5 rounded border border-rose-700 tracking-wider">
                  {alertaPrincipal.placa || "VEÍCULO"}
                </span>
                <span className="text-rose-200 truncate font-semibold">
                  {formatarTituloTipo(alertaPrincipal.tipo, alertaPrincipal.detalhes)}
                </span>
              </div>

              <div className="text-[11px] text-rose-100 mt-1.5 leading-relaxed font-sans">
                {alertaPrincipal.detalhes}
              </div>

              {alertaPrincipal.cliente_nome && (
                <div className="text-[10px] text-rose-300/90 mt-1 flex items-center gap-1 font-mono">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">Cliente: {alertaPrincipal.cliente_nome}</span>
                </div>
              )}
            </div>
          </div>

          {/* PAINEL EXPANDIDO COM TELEMETRIA E HISTÓRICO DE ALERTAS */}
          {expandido && (
            <div className="mt-3 pt-2.5 border-t border-rose-900/80 space-y-2.5 animate-in fade-in duration-200">
              {/* Telemetria Expandida do Alerta Atual */}
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-[11px] space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                    <span className="text-rose-200">Velocidade:</span>
                    <span className="font-mono font-bold text-white">
                      {alertaPrincipal.velocidade} km/h
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span className="text-rose-200">Força G / Incl:</span>
                    <span className="font-mono font-bold text-white">
                      {alertaPrincipal.vibracao_g}G · {alertaPrincipal.inclinacao_graus}°
                    </span>
                  </div>
                </div>

                {/* Coordenadas e Links Rápidos */}
                {temCoordsValidas(alertaPrincipal.latitude, alertaPrincipal.longitude) ? (
                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-rose-900/60 flex-wrap">
                    <div className="flex items-center gap-1 font-mono text-[10px] text-rose-300">
                      <MapPin className="h-3 w-3 text-rose-400 shrink-0" />
                      <span>
                        {alertaPrincipal.latitude.toFixed(5)},{" "}
                        {alertaPrincipal.longitude.toFixed(5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          copiarCoordenadas(alertaPrincipal.latitude, alertaPrincipal.longitude)
                        }
                        className="px-2 py-0.5 rounded bg-rose-900/90 hover:bg-rose-800 text-[10px] font-semibold text-rose-200 hover:text-white transition flex items-center gap-1"
                      >
                        {copiadoCoords ? (
                          <Check className="h-3 w-3 text-orange-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span>{copiadoCoords ? "Copiado" : "Copiar"}</span>
                      </button>
                      <a
                        href={`https://www.google.com/maps?q=${alertaPrincipal.latitude},${alertaPrincipal.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-0.5 rounded bg-sky-900/80 hover:bg-sky-800 text-[10px] font-bold text-sky-200 hover:text-white transition flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Google Maps</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-rose-900/60 text-[10px] text-amber-300 font-sans italic py-0.5">
                    <MapPin className="h-3 w-3 text-amber-400 shrink-0" />
                    <span>Localização GPS pendente / sem sinal no evento</span>
                  </div>
                )}

                {/* Contatos do Cliente */}
                {alertaPrincipal.cliente_telefone && (
                  <div className="flex items-center gap-2 pt-1 border-t border-rose-900/60">
                    <a
                      href={`tel:${alertaPrincipal.cliente_telefone.replace(/\D/g, "")}`}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold text-[10px] transition shadow-xs"
                    >
                      <Phone className="h-3 w-3" />
                      <span>Ligar ({alertaPrincipal.cliente_telefone})</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Lista dos demais alertas pendentes */}
              {alertas.length > 1 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <div className="text-[10px] font-mono uppercase text-rose-300 font-bold tracking-wider">
                    Outros Alertas Pendentes ({alertas.length - 1}):
                  </div>
                  {alertas.slice(1).map((a) => (
                    <div
                      key={a.id}
                      className="p-2 rounded-xl bg-rose-950/60 border border-rose-900 text-[11px] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-white mr-1.5">{a.placa}</span>
                        <span className="text-rose-200">
                          {formatarTituloTipo(a.tipo, a.detalhes)}
                        </span>
                        <div className="text-[10px] text-rose-300 truncate">
                          {a.cliente_nome ? `Cliente: ${a.cliente_nome}` : a.detalhes}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => executarFocoVeiculo(a.veiculo_id)}
                          className="px-2 py-0.5 rounded bg-white text-slate-950 font-black hover:bg-rose-100 text-[10px] transition"
                        >
                          Focar
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalAlerta(a)}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold hover:bg-rose-500 text-[10px] transition"
                        >
                          Socorro
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleReconhecer(a.id, e)}
                          className="px-2 py-0.5 rounded bg-rose-900 text-rose-200 hover:text-white font-bold text-[10px] transition"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botões de Ação do Alerta Principal */}
          <div className="mt-3 pt-2.5 border-t border-rose-900/80 flex items-center justify-between gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => executarFocoVeiculo(alertaPrincipal.veiculo_id)}
              className="px-3 py-1.5 rounded-xl bg-white text-rose-950 font-black hover:bg-rose-100 transition shadow-sm text-xs flex items-center gap-1 active:scale-95"
            >
              <Navigation className="h-3 w-3" />
              <span>Focar Mapa</span>
            </button>

            <button
              type="button"
              onClick={() => setModalAlerta(alertaPrincipal)}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-500 transition shadow-sm text-xs flex items-center gap-1 active:scale-95"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Socorro e Ficha</span>
            </button>

            <button
              type="button"
              onClick={(e) => handleReconhecer(alertaPrincipal.id, e)}
              className="px-3 py-1.5 rounded-xl bg-rose-900/90 text-rose-200 hover:text-white hover:bg-rose-800 border border-rose-700 font-semibold transition text-xs flex items-center gap-1 active:scale-95"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Reconhecer</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL MILITAR DE SOCORRO IMEDIATO, FICHA DO CLIENTE E TELEFONES DE RESGATE (Renderizado via Portal Canônico) */}
      {modalAlerta &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn overflow-y-auto">
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-950 border-2 border-rose-600/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
              {/* Header de Emergência */}
              <div className="bg-gradient-to-r from-rose-950 via-rose-900 to-slate-950 p-4 sm:p-5 border-b border-rose-800/80 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/40 animate-pulse shrink-0">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${getBadgeCor(modalAlerta.gravidade)}`}
                      >
                        {modalAlerta.gravidade}
                      </span>
                      <span className="text-xs font-mono text-rose-300">
                        {new Date(modalAlerta.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                      {formatarTituloTipo(modalAlerta.tipo, modalAlerta.detalhes)}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalAlerta(null)}
                  className="p-1.5 rounded-xl bg-rose-900/40 hover:bg-rose-800/60 text-rose-200 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Conteúdo com Scroll Interno */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-800 dark:text-slate-200">
                {/* 1. Detalhes Técnicos do Impacto e Veículo */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 font-bold mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Telemetria do Veículo no Evento
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Placa
                      </span>
                      <span className="font-mono font-black text-slate-900 dark:text-white text-sm bg-white dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 inline-block">
                        {modalAlerta.placa || "N/I"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Veículo
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate block">
                        {modalAlerta.marca_modelo || "Não informado"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Velocidade
                      </span>
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {modalAlerta.velocidade} km/h
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Força G / Inclinação
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {modalAlerta.vibracao_g}G · {modalAlerta.inclinacao_graus}°
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-rose-700 dark:text-rose-200 leading-relaxed font-mono">
                    {modalAlerta.detalhes}
                  </div>
                </div>

                {/* 2. Ficha Cadastral Completa do Cliente */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 font-bold mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Cadastro do Cliente / Proprietário
                    </span>
                    {modalAlerta.cliente_plano && (
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 text-[10px] font-mono font-bold border border-sky-300 dark:border-transparent">
                        Plano {modalAlerta.cliente_plano.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Nome / Razão Social
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {modalAlerta.cliente_nome || "Nome não cadastrado"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Documento (CPF / CNPJ)
                      </span>
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {modalAlerta.cliente_documento || "Não informado"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        E-mail de Contato
                      </span>
                      <span className="text-slate-700 dark:text-slate-200 truncate block">
                        {modalAlerta.cliente_email || "Não informado"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                        Telefone Principal
                      </span>
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400 text-sm">
                        {modalAlerta.cliente_telefone || "Sem telefone"}
                      </span>
                    </div>
                  </div>

                  {/* Ações de Contato Direto com o Cliente */}
                  {modalAlerta.cliente_telefone && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-wrap">
                      <a
                        href={`tel:${modalAlerta.cliente_telefone.replace(/\D/g, "")}`}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-md"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>Ligar para o Cliente ({modalAlerta.cliente_telefone})</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* 3. Localização com Navegação Rápida e Cópia */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2 flex-wrap">
                  {temCoordsValidas(modalAlerta.latitude, modalAlerta.longitude) ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                          <span>GPS: </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {modalAlerta.latitude.toFixed(6)}, {modalAlerta.longitude.toFixed(6)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            copiarCoordenadas(modalAlerta.latitude, modalAlerta.longitude)
                          }
                          className="p-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1 transition border border-slate-200 dark:border-slate-700"
                          title="Copiar Coordenadas"
                        >
                          {copiadoCoords ? (
                            <Check className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiadoCoords ? "Copiado" : "Copiar"}</span>
                        </button>

                        <a
                          href={`https://www.google.com/maps?q=${modalAlerta.latitude},${modalAlerta.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 px-2.5 rounded-lg bg-sky-100 dark:bg-sky-600/20 hover:bg-sky-200 dark:hover:bg-sky-600/30 border border-sky-300 dark:border-sky-500/40 text-sky-800 dark:text-sky-300 hover:text-sky-900 dark:hover:text-white text-xs font-bold flex items-center gap-1 transition shadow-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Google Maps</span>
                        </a>

                        <a
                          href={`https://waze.com/ul?ll=${modalAlerta.latitude},${modalAlerta.longitude}&navigate=yes`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 px-2.5 rounded-lg bg-orange-100 dark:bg-orange-600/20 hover:bg-orange-200 dark:hover:bg-orange-600/30 border border-orange-300 dark:border-orange-500/40 text-orange-800 dark:text-orange-300 hover:text-orange-900 dark:hover:text-white text-xs font-bold flex items-center gap-1 transition shadow-xs"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Waze</span>
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Localização GPS pendente / sem sinal de satélite no momento do evento
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Discagem Rápida para Números Oficiais de Socorro */}
                <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-rose-950/40 dark:to-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 font-bold mb-3 flex items-center gap-1.5">
                    <HeartPulse className="h-3.5 w-3.5" /> Telefones Oficiais de Socorro e
                    Emergência Imediata
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <a
                      href="tel:192"
                      className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center text-center transition shadow-md group"
                    >
                      <HeartPulse className="h-5 w-5 mb-1 group-hover:scale-110 transition" />
                      <span className="font-black text-base font-mono">192</span>
                      <span className="text-[10px] font-semibold opacity-90">SAMU (Médico)</span>
                    </a>

                    <a
                      href="tel:193"
                      className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white flex flex-col items-center justify-center text-center transition shadow-md group"
                    >
                      <Flame className="h-5 w-5 mb-1 group-hover:scale-110 transition" />
                      <span className="font-black text-base font-mono">193</span>
                      <span className="text-[10px] font-semibold opacity-90">Bombeiros</span>
                    </a>

                    <a
                      href="tel:190"
                      className="p-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white flex flex-col items-center justify-center text-center transition shadow-md group"
                    >
                      <ShieldAlert className="h-5 w-5 mb-1 group-hover:scale-110 transition" />
                      <span className="font-black text-base font-mono">190</span>
                      <span className="text-[10px] font-semibold opacity-90">Polícia Militar</span>
                    </a>

                    <a
                      href="tel:191"
                      className="p-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white flex flex-col items-center justify-center text-center transition shadow-md group"
                    >
                      <Navigation className="h-5 w-5 mb-1 group-hover:scale-110 transition" />
                      <span className="font-black text-base font-mono">191</span>
                      <span className="text-[10px] font-semibold opacity-90">PRF (Rodovias)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Rodapé de Ações do Modal */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => copiarBriefingSocorro(modalAlerta)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition shadow-xs border border-slate-200 dark:border-slate-700"
                >
                  {copiadoBriefing ? (
                    <Check className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>{copiadoBriefing ? "Briefing Copiado" : "Copiar Briefing de Socorro"}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onFocarVeiculo(modalAlerta.veiculo_id);
                      setModalAlerta(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-black text-xs hover:bg-slate-800 dark:hover:bg-slate-100 transition shadow"
                  >
                    Focar no Mapa
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReconhecer(modalAlerta.id)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconhecer Alerta</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
