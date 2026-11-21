import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShieldCheck,
  UserCheck,
  Building2,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
  Radio,
  Play,
  CheckCircle2,
  XCircle,
  Navigation,
  Compass,
  RotateCw,
  Signal,
  Check,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  carregarPostosVigilancia,
  carregarCheckpoints,
  carregarTurnos,
  iniciarCicloRonda,
  registrarCheckinGpsAbsoluto,
  carregarCicloAtivo,
  transmitirPosicaoVigilanteAoVivo,
  verificarDesvioRotaVigilante,
  verificarAtrasoProximoPonto,
  dispararAlertaRonda,
} from "../services/vigilanteService";
import { calcularDistanciaMetros } from "@/features/monitor-gps/services/protecaoVeiculoService";
import type {
  Vigilante,
  PostoVigilancia,
  RondaCheckpoint,
  TurnoVigilancia,
  CicloRondaExecucao,
  CheckpointExecutado,
  StatusCheckinRonda,
} from "../types";
import { toast } from "sonner";

interface VisaoVigilanteOperacionalProps {
  vigilanteLogado?: Vigilante | null;
  onVoltarPainelGeral?: () => void;
  modoSupervisor?: boolean;
}

export function VisaoVigilanteOperacional({
  vigilanteLogado,
  onVoltarPainelGeral,
  modoSupervisor = false,
}: VisaoVigilanteOperacionalProps) {
  const [abaAtiva, setAbaAtiva] = useState<"ronda" | "escala">("ronda");

  // Dados
  const [postos, setPostos] = useState<PostoVigilancia[]>([]);
  const [postoAtivo, setPostoAtivo] = useState<PostoVigilancia | null>(null);
  const [checkpoints, setCheckpoints] = useState<RondaCheckpoint[]>([]);
  const [turnos, setTurnos] = useState<TurnoVigilancia[]>([]);
  const [cicloAtivo, setCicloAtivo] = useState<CicloRondaExecucao | null>(null);

  // Estados de telemetria GPS absoluto do aparelho móvel
  const [posicaoGps, setPosicaoGps] = useState<{
    latitude: number;
    longitude: number;
    precisaoMetros: number;
    ultimaLeitura: Date;
  } | null>(null);
  const [erroGps, setErroGps] = useState<string | null>(null);
  const [processandoCheckin, setProcessandoCheckin] = useState(false);
  const [iniciandoRonda, setIniciandoRonda] = useState(false);

  // Alertas Táticos em Tempo Real
  const [alertaDesvioRota, setAlertaDesvioRota] = useState<string | null>(null);
  const [alertaAtrasoCheckpoint, setAlertaAtrasoCheckpoint] = useState<string | null>(null);

  // Mapa
  const containerMapaRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const checkpointsLayerRef = useRef<L.LayerGroup | null>(null);
  const rotaLinhaRef = useRef<L.Polyline | null>(null);
  const vigilanteMarkerRef = useRef<L.Marker | null>(null);
  const raioMarkerRef = useRef<L.Circle | null>(null);

  // Identificação do vigilante
  const vigilanteEfetivo = useMemo(() => {
    if (vigilanteLogado) return vigilanteLogado;
    return {
      id: "vigilante-plantonista",
      nome: "Vigilante Plantonista",
      matricula: "VIG-01",
      turno_padrao: "12x36" as const,
      ativo: true,
    };
  }, [vigilanteLogado]);

  // Carrega postos e turnos
  const carregarDadosBase = useCallback(async () => {
    try {
      const [pts, trns] = await Promise.all([carregarPostosVigilancia(), carregarTurnos()]);
      setPostos(pts);
      setTurnos(trns);

      if (pts.length > 0 && !postoAtivo) {
        setPostoAtivo(pts[0]);
      }
    } catch {
      /* Fallback */
    }
  }, [postoAtivo]);

  useEffect(() => {
    carregarDadosBase();
  }, [carregarDadosBase]);

  // Carrega checkpoints e ciclo ativo do posto selecionado
  const carregarDadosDoPosto = useCallback(
    async (postoId: string) => {
      try {
        const cps = await carregarCheckpoints(postoId);
        const cpsOrdenados = [...cps].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        setCheckpoints(cpsOrdenados);

        const ciclo = await carregarCicloAtivo(postoId, vigilanteEfetivo.id);
        setCicloAtivo(ciclo);
      } catch {}
    },
    [vigilanteEfetivo.id],
  );

  useEffect(() => {
    if (postoAtivo) {
      carregarDadosDoPosto(postoAtivo.id);
    }
  }, [postoAtivo, carregarDadosDoPosto]);

  // Telemetria Contínua de GPS Absoluto com Alta Precisão e Transmissão ao Vivo
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setErroGps("Geolocalização não suportada neste dispositivo.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const novaPos = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisaoMetros: pos.coords.accuracy,
          ultimaLeitura: new Date(),
        };
        setPosicaoGps(novaPos);
        setErroGps(null);

        // Transmite posição ao vivo para a Central de Monitoramento
        if (postoAtivo) {
          const desvio = verificarDesvioRotaVigilante(novaPos, postoAtivo, checkpoints);
          setAlertaDesvioRota(desvio.emDesvio ? desvio.motivo : null);

          transmitirPosicaoVigilanteAoVivo({
            postoId: postoAtivo.id,
            postoNome: postoAtivo.nome,
            vigilanteId: vigilanteEfetivo.id,
            vigilanteNome: vigilanteEfetivo.nome,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            precisaoMetros: Math.round(pos.coords.accuracy),
            velocidadeKmH: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0,
            cicloId: cicloAtivo?.id,
            statusRota: desvio.emDesvio ? "desvio" : "conforme",
          });

          if (desvio.emDesvio) {
            dispararAlertaRonda({
              postoId: postoAtivo.id,
              postoNome: postoAtivo.nome,
              vigilanteId: vigilanteEfetivo.id,
              vigilanteNome: vigilanteEfetivo.nome,
              tipo: "desvio_rota_vigilante",
              gravidade: "alta",
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              detalhes: `🚨 ${desvio.motivo} (Vigilante: ${vigilanteEfetivo.nome})`,
            });
          }
        }
      },
      (err) => {
        let msg = "Aguardando sinal GPS...";
        if (err.code === 1) msg = "Permissão de localização negada pelo usuário.";
        if (err.code === 2) msg = "Sinal de satélite indisponível no momento.";
        if (err.code === 3) msg = "Tempo limite na captura do satélite GPS.";
        setErroGps(msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [postoAtivo, checkpoints, vigilanteEfetivo, cicloAtivo]);

  // Auditoria contínua de atraso no próximo checkpoint (a cada 10s)
  useEffect(() => {
    if (!postoAtivo || !cicloAtivo || cicloAtivo.status !== "em_andamento") {
      setAlertaAtrasoCheckpoint(null);
      return;
    }

    const checarAtraso = () => {
      const atraso = verificarAtrasoProximoPonto(postoAtivo.id, cicloAtivo, checkpoints);
      if (atraso.atrasado) {
        setAlertaAtrasoCheckpoint(atraso.mensagem || "Ponto de ronda atrasado!");
        dispararAlertaRonda({
          postoId: postoAtivo.id,
          postoNome: postoAtivo.nome,
          vigilanteId: vigilanteEfetivo.id,
          vigilanteNome: vigilanteEfetivo.nome,
          tipo: "ausencia_checkpoint_vigilante",
          gravidade: "alta",
          latitude: atraso.checkpoint?.latitude || postoAtivo.latitude,
          longitude: atraso.checkpoint?.longitude || postoAtivo.longitude,
          detalhes: atraso.mensagem || `Ponto não atingido no posto ${postoAtivo.nome}`,
        });
      } else {
        setAlertaAtrasoCheckpoint(null);
      }
    };

    checarAtraso();
    const interval = setInterval(checarAtraso, 10000);
    return () => clearInterval(interval);
  }, [postoAtivo, cicloAtivo, checkpoints, vigilanteEfetivo]);

  // Próximo checkpoint pendente da rota
  const proximoPontoPendente = useMemo(() => {
    if (!cicloAtivo) {
      return checkpoints.length > 0 ? checkpoints[0] : null;
    }
    const execPendente = cicloAtivo.checkpoints_executados.find((c) => c.status === "pendente");
    if (!execPendente) return null;
    return checkpoints.find((c) => c.id === execPendente.checkpoint_id) || null;
  }, [cicloAtivo, checkpoints]);

  const execucaoDoProximoPonto = useMemo(() => {
    if (!cicloAtivo || !proximoPontoPendente) return null;
    return (
      cicloAtivo.checkpoints_executados.find(
        (c) => c.checkpoint_id === proximoPontoPendente.id && c.status === "pendente",
      ) || null
    );
  }, [cicloAtivo, proximoPontoPendente]);

  // Distância física em metros até o próximo checkpoint
  const distanciaAteProximoMetros = useMemo(() => {
    if (!posicaoGps || !proximoPontoPendente) return null;
    return Math.round(
      calcularDistanciaMetros(
        posicaoGps.latitude,
        posicaoGps.longitude,
        proximoPontoPendente.latitude,
        proximoPontoPendente.longitude,
      ),
    );
  }, [posicaoGps, proximoPontoPendente]);

  // Raio efetivo permitido para o checkpoint atual
  const raioPermitidoMetros = useMemo(() => {
    if (!proximoPontoPendente) return 15;
    return proximoPontoPendente.raio_captura_metros ?? 15;
  }, [proximoPontoPendente]);

  // Está dentro do raio de captura física?
  const estaDentroDoRaio = useMemo(() => {
    if (distanciaAteProximoMetros === null) return false;
    return distanciaAteProximoMetros <= raioPermitidoMetros;
  }, [distanciaAteProximoMetros, raioPermitidoMetros]);

  // Qualidade do sensor GPS
  const qualidadeGps = useMemo(() => {
    if (!posicaoGps) return { nivel: "sem_sinal", cor: "text-slate-400", texto: "Sem Sinal" };
    const acc = posicaoGps.precisaoMetros;
    if (acc <= 10)
      return {
        nivel: "excelente",
        cor: "text-emerald-500",
        texto: `±${Math.round(acc)}m (Excelente)`,
      };
    if (acc <= 25)
      return { nivel: "boa", cor: "text-amber-500", texto: `±${Math.round(acc)}m (Aceitável)` };
    return {
      nivel: "degradado",
      cor: "text-red-500",
      texto: `±${Math.round(acc)}m (Degradado - Céu Aberto Necessário)`,
    };
  }, [posicaoGps]);

  // Inicializa mapa Leaflet tático
  useEffect(() => {
    if (!containerMapaRef.current || mapRef.current || !postoAtivo) return;

    const lat = postoAtivo.latitude || -22.48;
    const lng = postoAtivo.longitude || -44.05;

    const map = L.map(containerMapaRef.current, {
      center: [lat, lng],
      zoom: 19,
      maxZoom: 21,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxNativeZoom: 19,
      maxZoom: 21,
    }).addTo(map);

    checkpointsLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [postoAtivo]);

  // Atualiza checkpoints, rota poligonal e posição do vigilante no mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !postoAtivo) return;

    // 1. Limpa marcadores anteriores de checkpoints
    if (checkpointsLayerRef.current) {
      checkpointsLayerRef.current.clearLayers();
    }

    if (rotaLinhaRef.current) {
      map.removeLayer(rotaLinhaRef.current);
      rotaLinhaRef.current = null;
    }

    // Coordenadas para rota sequencial ligando os checkpoints
    const coordenadasRota: [number, number][] = [];

    // Desenha cada checkpoint
    checkpoints.forEach((cp, idx) => {
      coordenadasRota.push([cp.latitude, cp.longitude]);

      // Verifica status de cumprimento se houver ciclo ativo
      const exec = cicloAtivo?.checkpoints_executados.find((c) => c.checkpoint_id === cp.id);
      const isConcluido = exec && exec.status !== "pendente";
      const isAtual = proximoPontoPendente?.id === cp.id;

      const corBg = isConcluido
        ? exec.status === "conforme"
          ? "#10b981"
          : "#ef4444"
        : isAtual
          ? "#2563eb"
          : "#64748b";

      const htmlIcon = `
        <div style="position:relative; display:flex; align-items:center; justify-content:center; width:34px; height:34px;">
          ${
            isAtual
              ? '<div style="position:absolute; width:44px; height:44px; border-radius:50%; background:rgba(37,99,235,0.3); animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>'
              : ""
          }
          <div style="width:30px; height:30px; border-radius:50%; background:${corBg}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.35);">
            ${idx + 1}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: htmlIcon,
        className: "custom-checkpoint-icon",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([cp.latitude, cp.longitude], { icon: customIcon });
      marker.bindTooltip(
        `<b>Ponto ${idx + 1}: ${cp.nome}</b><br/>Deslocamento estipulado: ${cp.tempo_deslocamento_minutos ?? 5} min (±${cp.tolerancia_minutos ?? 3}m)`,
        { direction: "top", offset: [0, -10] },
      );

      if (checkpointsLayerRef.current) {
        checkpointsLayerRef.current.addLayer(marker);
      }
    });

    // Fecha o circuito circular conectando de volta ao primeiro ponto
    if (coordenadasRota.length > 1) {
      coordenadasRota.push(coordenadasRota[0]);
      rotaLinhaRef.current = L.polyline(coordenadasRota, {
        color: "#2563eb",
        weight: 3,
        opacity: 0.75,
        dashArray: "6, 8",
      }).addTo(map);
    }

    // 2. Marcador do Vigilante ao Vivo via GPS Absoluto
    if (posicaoGps) {
      const { latitude, longitude, precisaoMetros } = posicaoGps;

      if (!vigilanteMarkerRef.current) {
        const vigIcon = L.divIcon({
          html: `
            <div style="position:relative; display:flex; align-items:center; justify-content:center; width:36px; height:36px;">
              <div style="position:absolute; width:36px; height:36px; border-radius:50%; background:rgba(16,185,129,0.35); animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
              <div style="width:24px; height:24px; border-radius:50%; background:#10b981; border:3px solid #ffffff; box-shadow:0 3px 8px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;">
                <div style="width:6px; height:6px; border-radius:50%; background:#ffffff;"></div>
              </div>
            </div>
          `,
          className: "custom-vigilante-live-icon",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        vigilanteMarkerRef.current = L.marker([latitude, longitude], { icon: vigIcon }).addTo(map);
        raioMarkerRef.current = L.circle([latitude, longitude], {
          radius: precisaoMetros,
          color: "#10b981",
          weight: 1,
          fillColor: "#10b981",
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        vigilanteMarkerRef.current.setLatLng([latitude, longitude]);
        if (raioMarkerRef.current) {
          raioMarkerRef.current.setLatLng([latitude, longitude]);
          raioMarkerRef.current.setRadius(precisaoMetros);
        }
      }
    }
  }, [checkpoints, cicloAtivo, proximoPontoPendente, posicaoGps, postoAtivo]);

  // Ação de Iniciar Ronda
  const handleIniciarRonda = async () => {
    if (!postoAtivo) return;
    if (checkpoints.length === 0) {
      toast.error("Este posto ainda não possui checkpoints cadastrados.");
      return;
    }

    setIniciandoRonda(true);
    try {
      const novoCiclo = await iniciarCicloRonda(postoAtivo.id, vigilanteEfetivo.id, null, 1);
      setCicloAtivo(novoCiclo);
      toast.success("Ronda 24h iniciada! Siga para o Ponto 1 dentro da janela estipulada.");
    } catch {
      toast.error("Falha ao iniciar ciclo de ronda.");
    } finally {
      setIniciandoRonda(false);
    }
  };

  // Ação de Check-in no Checkpoint com Validação de GPS Absoluto
  const handleRegistrarCheckinGps = async () => {
    if (!cicloAtivo || !proximoPontoPendente) return;
    if (!posicaoGps) {
      toast.error("Aguardando coordenadas do sensor GPS do aparelho.");
      return;
    }

    setProcessandoCheckin(true);
    try {
      const res = await registrarCheckinGpsAbsoluto(
        cicloAtivo.id,
        proximoPontoPendente.id,
        posicaoGps.latitude,
        posicaoGps.longitude,
        posicaoGps.precisaoMetros,
      );

      if (res.sucesso) {
        toast.success(res.mensagem);
        if (res.cicloAtualizado) {
          setCicloAtivo({ ...res.cicloAtualizado });
        }
      } else {
        toast.error(res.mensagem);
      }
    } catch {
      toast.error("Erro ao validar presença no checkpoint.");
    } finally {
      setProcessandoCheckin(false);
    }
  };

  // Turno de hoje
  const hojeStr = new Date().toISOString().slice(0, 10);
  const turnosHoje = useMemo(() => {
    return turnos.filter((t) => t.data_turno === hojeStr);
  }, [turnos, hojeStr]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto p-2 sm:p-4 pb-24">
      {/* Header do Vigilante */}
      <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {vigilanteEfetivo.nome}
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {vigilanteEfetivo.matricula || "VIG-PLANTÃO"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Building2 className="h-3.5 w-3.5 text-blue-500" />
                <span>
                  Posto Escalado: <strong>{postoAtivo?.nome || "Carregando..."}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Sensor de Precisão GPS Absoluta */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs">
              <Signal className={`h-4 w-4 ${qualidadeGps.cor} animate-pulse`} />
              <div>
                <span className="text-[10px] text-slate-400 block leading-tight">GPS Absoluto</span>
                <span className={`font-mono font-bold text-[11px] ${qualidadeGps.cor}`}>
                  {qualidadeGps.texto}
                </span>
              </div>
            </div>

            {modoSupervisor && onVoltarPainelGeral && (
              <button
                onClick={onVoltarPainelGeral}
                className="px-3 py-1.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              >
                Voltar à Gestão
              </button>
            )}
          </div>
        </div>

        {/* Abas Táticas */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setAbaAtiva("ronda")}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              abaAtiva === "ronda"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-white dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Ronda ao Vivo (Ponto a Ponto)</span>
          </button>
          <button
            onClick={() => setAbaAtiva("escala")}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              abaAtiva === "escala"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-white dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800"
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Minha Escala de Serviço</span>
          </button>
        </div>
      </div>

      {/* ABA 1: RONDA AO VIVO PONTO A PONTO */}
      {abaAtiva === "ronda" && (
        <div className="space-y-4">
          {/* Banners Táticos de Alerta (Desvio de Rota ou Atraso) */}
          {alertaDesvioRota && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2.5 animate-pulse shadow-sm">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div>
                <span className="block font-black text-rose-700 dark:text-rose-300">
                  ALERTA TÁTICO: DESVIO DE ROTA DETECTADO
                </span>
                <span className="font-normal">{alertaDesvioRota}</span>
              </div>
            </div>
          )}

          {alertaAtrasoCheckpoint && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-2.5 shadow-sm">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="block font-black text-amber-700 dark:text-amber-300">
                  ALERTA DE HORÁRIO: PONTO NÃO ATINGIDO NO TEMPO
                </span>
                <span className="font-normal">{alertaAtrasoCheckpoint}</span>
              </div>
            </div>
          )}

          {/* Card do Ponto Alvo Atual e Ação Tática */}
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Alvo Atual da Ronda 24h
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {proximoPontoPendente
                    ? `Ponto ${proximoPontoPendente.ordem}: ${proximoPontoPendente.nome}`
                    : cicloAtivo?.status === "concluido"
                      ? "Ciclo de Ronda Concluído com Sucesso!"
                      : "Nenhum ponto pendente"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {cicloAtivo
                    ? `Volta / Ciclo #${cicloAtivo.ciclo_numero} em andamento no posto ${postoAtivo?.nome}`
                    : "Inicie o ciclo de ronda no ponto em que estiver posicionado."}
                </p>
              </div>

              {/* Botão de Iniciar Ronda ou Check-in */}
              {!cicloAtivo || cicloAtivo.status === "concluido" ? (
                <button
                  onClick={handleIniciarRonda}
                  disabled={iniciandoRonda}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {iniciandoRonda ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 fill-white" />
                  )}
                  <span>Iniciar Nova Ronda 24h no Ponto Atual</span>
                </button>
              ) : (
                <button
                  onClick={handleRegistrarCheckinGps}
                  disabled={
                    processandoCheckin ||
                    !estaDentroDoRaio ||
                    (posicaoGps?.precisaoMetros || 99) > 25
                  }
                  className={`w-full sm:w-auto px-5 py-3 rounded-2xl font-bold text-xs shadow-lg active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                    estaDentroDoRaio && (posicaoGps?.precisaoMetros || 99) <= 25
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25 animate-pulse"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {processandoCheckin ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : estaDentroDoRaio ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  <span>
                    {estaDentroDoRaio
                      ? "✅ Confirmar Presença Física no Ponto (GPS)"
                      : distanciaAteProximoMetros !== null
                        ? `📍 Aproxime-se do Ponto (Faltam ${distanciaAteProximoMetros}m)`
                        : "Aguardando GPS"}
                  </span>
                </button>
              )}
            </div>

            {/* Metadados Táticos do Ponto Alvo */}
            {cicloAtivo && proximoPontoPendente && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">
                    Horário Previsto Dinâmico
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {execucaoDoProximoPonto
                      ? new Date(execucaoDoProximoPonto.hora_prevista).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Janela de Tolerância</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                    ±{proximoPontoPendente.tolerancia_minutos ?? 3} min
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Distância Atual</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {distanciaAteProximoMetros !== null
                      ? `${distanciaAteProximoMetros}m`
                      : "Calculando..."}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Raio Máximo Permitido</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {raioPermitidoMetros} metros
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Mapa Tático do Posto com Rota e Posicionamento ao Vivo */}
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-3 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between pb-2 px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5 text-blue-500" />
                Mapa Perimetral do Posto Fixo ({checkpoints.length} Checkpoints Interligados)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {posicaoGps
                  ? `Sua Posição: ${posicaoGps.latitude.toFixed(5)}, ${posicaoGps.longitude.toFixed(5)}`
                  : "Aguardando GPS"}
              </span>
            </div>
            <div
              ref={containerMapaRef}
              className="w-full h-[360px] sm:h-[420px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* Lista e Timeline dos Checkpoints do Circuito */}
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sequência de Ronda e Auditoria de Passagem
            </h3>

            <div className="space-y-2">
              {checkpoints.map((cp, idx) => {
                const exec = cicloAtivo?.checkpoints_executados.find(
                  (c) => c.checkpoint_id === cp.id,
                );
                const isConcluido = exec && exec.status !== "pendente";
                const isAtual = proximoPontoPendente?.id === cp.id;

                return (
                  <div
                    key={cp.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isAtual
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-900 dark:text-blue-200"
                        : isConcluido
                          ? "bg-white/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
                          : "bg-white/40 dark:bg-slate-950/20 border-dashed border-slate-200 dark:border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-8 w-8 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${
                          isConcluido
                            ? exec?.status === "conforme"
                              ? "bg-emerald-500 text-white"
                              : "bg-red-500 text-white"
                            : isAtual
                              ? "bg-blue-600 text-white shadow"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                            {cp.nome}
                          </span>
                          {isAtual && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-600 text-white font-bold">
                              Alvo Atual
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          Deslocamento estipulado:{" "}
                          <strong>{cp.tempo_deslocamento_minutos ?? 5} min</strong> (Janela: ±
                          {cp.tolerancia_minutos ?? 3} min)
                        </span>
                      </div>
                    </div>

                    {/* Status da Passagem */}
                    <div className="text-right">
                      {isConcluido ? (
                        <div>
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              exec.status === "conforme"
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : exec.status === "atrasado"
                                  ? "bg-red-500/20 text-red-600 dark:text-red-400"
                                  : "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {exec.status.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            {exec.hora_realizada
                              ? new Date(exec.hora_realizada).toLocaleTimeString("pt-BR")
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Previsto</span>
                          <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                            {exec?.hora_prevista
                              ? new Date(exec.hora_prevista).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "--:--"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: MINHA ESCALA DE SERVIÇO */}
      {abaAtiva === "escala" && (
        <div className="space-y-4">
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Escala de Plantão e Postos Atribuídos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consulte os dias, horários de turno e postos fixos sob sua responsabilidade
                </p>
              </div>
            </div>

            {/* Turnos Cadastrados */}
            <div className="space-y-2.5 pt-2">
              {turnos.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                  Nenhum turno agendado para este profissional no momento.
                </div>
              ) : (
                turnos.map((trn) => {
                  const isHoje = trn.data_turno === hojeStr;
                  const posto = postos.find((p) => p.id === trn.posto_id);

                  return (
                    <div
                      key={trn.id}
                      className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isHoje
                          ? "bg-blue-500/10 border-blue-500/40"
                          : "bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-xs ${
                            isHoje
                              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {posto?.nome || "Posto Fixo"}
                            </span>
                            {isHoje && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                PLANTÃO DE HOJE
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                            Data:{" "}
                            <strong>
                              {new Date(trn.data_turno + "T12:00:00").toLocaleDateString("pt-BR")}
                            </strong>{" "}
                            | Turno:{" "}
                            <strong>
                              {trn.hora_inicio?.slice(0, 5)} às {trn.hora_fim?.slice(0, 5)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {isHoje && (
                        <button
                          onClick={() => {
                            if (posto) setPostoAtivo(posto);
                            setAbaAtiva("ronda");
                          }}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Acessar Ronda Deste Posto</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
