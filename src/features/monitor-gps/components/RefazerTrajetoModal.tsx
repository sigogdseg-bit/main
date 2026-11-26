import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Gauge,
  Clock,
  Compass,
  FileDown,
  Layers,
  Activity,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Sun,
  Moon,
  Globe,
  Calendar,
  Route,
  Repeat,
  MapPin,
  Home,
  Hourglass,
  CheckCircle2,
  Navigation,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  VeiculoGps,
  TrajetoViagem,
  PosicaoHistorico,
  ModoVisualizacao,
  MapTheme,
  ParadaJornada,
  JornadaConsolidada,
} from "../types";
import { canonicalGpsOdometryEngine } from "@/shared/lib/gpsOdometryEngine";
import {
  carregarViagensTrajetos,
  carregarViagensPeriodo,
  carregarPontosViagem,
  consolidarJornadaMultiCiclos,
  extrairParadasJornada,
  formatarMinutosJornada,
  isCicloViagemReal,
} from "../services/gpsService";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { toast } from "sonner";
import { useMapTheme } from "../context/MapThemeContext";
import {
  animarMarcadorPlaybackSuave,
  type HandleAnimacaoPlayback,
} from "../utils/interpolacaoMapaSuave";
import {
  aplicarChancelaSimulacaoPdf,
  isModoDegustacao,
} from "@/features/demonstracao/services/degustacaoMasterService";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { formatarDistanciaViagem } from "../utils/formatadoresViagem";
import {
  enriquecerPontosComTelemetria,
  gerarHtmlBalaoTelemetria,
  calcularTelemetriaPonto,
  calcularRumoPonto,
  gerarHtmlBalaoParada,
} from "../utils/telemetriaDinamica";
import { obterEnderecoPorCoordenadas } from "@/features/monitor-gps/services/compartilhamentoService";

interface RefazerTrajetoModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
  podeUsar3D?: boolean;
  viagemInicialId?: string;
}

function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calcularMetricasPontos(pts: PosicaoHistorico[]) {
  if (!pts || pts.length < 2) return { km: 0, velMedia: 0, velMax: 0 };

  const odometria = canonicalGpsOdometryEngine.processTrajectory(
    pts.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      speedKmh: Number(p.velocidade || 0),
      timestamp: p.data_hora_gps,
      ignition: p.ignicao,
    })),
  );

  return {
    km: odometria.distanceProcessedKm,
    velMedia: odometria.averageSpeedKmh,
    velMax: Math.round(odometria.maxSpeedKmh),
  };
}

function extrairParadasDePontos(pontos: PosicaoHistorico[]): ParadaJornada[] {
  const paradas: ParadaJornada[] = [];
  if (!pontos || pontos.length < 2) return paradas;

  let inicioParada: PosicaoHistorico | null = null;
  let ultimoPontoParado: PosicaoHistorico | null = null;
  let indiceInicio = 0;

  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    const vel = Number(p.velocidade) || 0;
    const isParado = vel <= 2;

    if (isParado) {
      if (!inicioParada) {
        inicioParada = p;
        indiceInicio = i;
      }
      ultimoPontoParado = p;
    } else {
      if (inicioParada && ultimoPontoParado) {
        const tIni = new Date(inicioParada.data_hora_gps).getTime();
        const tFim = new Date(ultimoPontoParado.data_hora_gps).getTime();
        const diffMs = tFim - tIni;
        const duracaoMin = Math.round(diffMs / (60 * 1000));

        if (duracaoMin >= 2) {
          paradas.push({
            id: `parada-pts-${paradas.length + 1}-${inicioParada.id || i}`,
            ordem: paradas.length + 1,
            indicePonto: indiceInicio,
            latitude: inicioParada.latitude,
            longitude: inicioParada.longitude,
            inicio_at: inicioParada.data_hora_gps,
            fim_at: p.data_hora_gps,
            duracaoMinutos: duracaoMin,
            duracaoFormatada: formatarMinutosJornada(duracaoMin),
          });
        }
      }
      inicioParada = null;
      ultimoPontoParado = null;
    }
  }

  return paradas;
}

export function RefazerTrajetoModal({
  veiculo,
  onFechar,
  podeUsar3D = true,
  viagemInicialId,
}: RefazerTrajetoModalProps) {
  const { theme, setTheme } = useMapTheme();
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [anoSelecionado, setAnoSelecionado] = useState<number>(anoAtual);
  const [mesSelecionado, setMesSelecionado] = useState<number>(mesAtual);
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  const [viagens, setViagens] = useState<TrajetoViagem[]>([]);
  const [viagemSelecionada, setViagemSelecionada] = useState<TrajetoViagem | null>(null);
  const [pontos, setPontos] = useState<PosicaoHistorico[]>([]);
  const [carregandoViagens, setCarregandoViagens] = useState(true);
  const [carregandoPontos, setCarregandoPontos] = useState(false);

  // Estados da Jornada Completa (Saída ao Retorno com Multi-Ciclos e Paradas)
  const [tipoVisao, setTipoVisao] = useState<"ciclo_unico" | "jornada_completa">(
    "jornada_completa",
  );

  // Estados para Ponto de Partida (Dia, Mês e Ano selecionados separadamente)
  const [anoPartida, setAnoPartida] = useState<number>(anoAtual);
  const [mesPartida, setMesPartida] = useState<number>(mesAtual);
  const [diaPartida, setDiaPartida] = useState<number>(hoje.getDate());
  const [viagensPartida, setViagensPartida] = useState<TrajetoViagem[]>([]);
  const [carregandoViagensPartida, setCarregandoViagensPartida] = useState<boolean>(false);
  const [viagemInicioJornadaId, setViagemInicioJornadaId] = useState<string>("");

  // Estados para Ponto Final (Dia, Mês e Ano selecionados separadamente)
  const [anoFim, setAnoFim] = useState<number>(anoAtual);
  const [mesFim, setMesFim] = useState<number>(mesAtual);
  const [diaFim, setDiaFim] = useState<number>(hoje.getDate());
  const [viagensFim, setViagensFim] = useState<TrajetoViagem[]>([]);
  const [carregandoViagensFim, setCarregandoViagensFim] = useState<boolean>(false);
  const [viagemFimJornadaId, setViagemFimJornadaId] = useState<string>("");

  const [jornadaConsolidada, setJornadaConsolidada] = useState<JornadaConsolidada | null>(null);
  const [paradaAtivaNoMomento, setParadaAtivaNoMomento] = useState<ParadaJornada | null>(null);

  // Marcadores de Paradas (2D e 3D)
  const markersParadas2DRef = useRef<L.Marker[]>([]);
  const markersParadas3DRef = useRef<any[]>([]);

  // Marcadores de Pings / Ponta de Seta Piscante (2D e 3D)
  const markersPings2DRef = useRef<L.Marker[]>([]);
  const markersPings3DRef = useRef<any[]>([]);

  // Menu de Camadas
  const [menuCamadasAberto, setMenuCamadasAberto] = useState(false);

  // Estados de Reprodução (Playback)
  const [modo, setModo] = useState<ModoVisualizacao>("2D");
  const [isPlaying, setIsPlaying] = useState(false);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [velocidadePlayback, setVelocidadePlayback] = useState<number>(2); // 1x, 2x, 5x, 10x

  const map2DContainerRef = useRef<HTMLDivElement>(null);
  const map3DContainerRef = useRef<HTMLDivElement>(null);
  const map2DInstanceRef = useRef<L.Map | null>(null);
  const map3DInstanceRef = useRef<any>(null);
  const tileLayer2DRef = useRef<L.TileLayer | null>(null);
  const marker2DRef = useRef<L.Marker | null>(null);
  const marker3DRef = useRef<any>(null);
  const polyline2DRef = useRef<L.Polyline | null>(null);
  const polylineHitbox2DRef = useRef<L.Polyline | null>(null);
  const popupAtivo2DRef = useRef<L.Popup | null>(null);
  const popupAtivo3DRef = useRef<any>(null);

  const playbackTimerRef = useRef<any>(null);
  const animacaoPlaybackRef = useRef<HandleAnimacaoPlayback | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const velocidadePlaybackRef = useRef(velocidadePlayback);
  velocidadePlaybackRef.current = velocidadePlayback;

  const camadas = [
    { id: "streets" as const, label: "Mapa Claro (Ruas)", icone: Sun },
    { id: "dark" as const, label: "Noturno Tático", icone: Moon },
    { id: "satellite" as const, label: "Satélite Real", icone: Globe },
  ];

  const MESES = [
    { valor: 1, nome: "Janeiro", sigla: "Jan" },
    { valor: 2, nome: "Fevereiro", sigla: "Fev" },
    { valor: 3, nome: "Março", sigla: "Mar" },
    { valor: 4, nome: "Abril", sigla: "Abr" },
    { valor: 5, nome: "Maio", sigla: "Mai" },
    { valor: 6, nome: "Junho", sigla: "Jun" },
    { valor: 7, nome: "Julho", sigla: "Jul" },
    { valor: 8, nome: "Agosto", sigla: "Ago" },
    { valor: 9, nome: "Setembro", sigla: "Set" },
    { valor: 10, nome: "Outubro", sigla: "Out" },
    { valor: 11, nome: "Novembro", sigla: "Nov" },
    { valor: 12, nome: "Dezembro", sigla: "Dez" },
  ];

  const ANOS = [anoAtual, anoAtual - 1, anoAtual - 2];
  const totalDiasMes = new Date(anoSelecionado, mesSelecionado, 0).getDate();
  const totalDiasMesPartida = new Date(anoPartida, mesPartida, 0).getDate();
  const totalDiasMesFim = new Date(anoFim, mesFim, 0).getDate();

  // 1.1 Carrega saídas da data de partida selecionada (Dia, Mês e Ano separados)
  useEffect(() => {
    let montado = true;
    setCarregandoViagensPartida(true);
    carregarViagensTrajetos(veiculo.id, {
      ano: anoPartida,
      mes: mesPartida,
      dia: diaPartida,
      campoData: "inicio_at",
    }).then((res) => {
      if (!montado) return;
      const ordenadas = [...res].sort(
        (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime(),
      );
      setViagensPartida(ordenadas);
      setCarregandoViagensPartida(false);
      if (ordenadas.length > 0) {
        setViagemInicioJornadaId((ant) => {
          if (ant && ordenadas.some((v) => v.id === ant)) return ant;
          return ordenadas[0].id;
        });
      } else {
        setViagemInicioJornadaId("");
      }
    });
    return () => {
      montado = false;
    };
  }, [veiculo.id, anoPartida, mesPartida, diaPartida]);

  // 1.2 Carrega chegadas da data final selecionada (Dia, Mês e Ano separados)
  useEffect(() => {
    let montado = true;
    setCarregandoViagensFim(true);
    carregarViagensTrajetos(veiculo.id, {
      ano: anoFim,
      mes: mesFim,
      dia: diaFim,
      campoData: "fim_at",
    }).then((res) => {
      if (!montado) return;
      const ordenadas = [...res].sort(
        (a, b) =>
          new Date(a.fim_at || a.inicio_at).getTime() - new Date(b.fim_at || b.inicio_at).getTime(),
      );
      setViagensFim(ordenadas);
      setCarregandoViagensFim(false);
      if (ordenadas.length > 0) {
        setViagemFimJornadaId((ant) => {
          if (ant && ordenadas.some((v) => v.id === ant)) return ant;
          return ordenadas[ordenadas.length - 1].id;
        });
      } else {
        setViagemFimJornadaId("");
      }
    });
    return () => {
      montado = false;
    };
  }, [veiculo.id, anoFim, mesFim, diaFim]);

  // 1. Carrega as viagens consolidadas do veículo filtradas por Ano, Mês e Dia
  useEffect(() => {
    let montado = true;
    setCarregandoViagens(true);

    const atualizarViagens = () => {
      carregarViagensTrajetos(veiculo.id, {
        ano: anoSelecionado,
        mes: mesSelecionado,
        dia: diaSelecionado,
      }).then((res) => {
        if (!montado) return;
        const viagensCronologicas = [...res].sort(
          (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime(),
        );
        setViagens(viagensCronologicas);
        setCarregandoViagens(false);
        if (viagensCronologicas.length > 0) {
          setViagemInicioJornadaId((ant) => {
            if (ant && viagensCronologicas.some((v) => v.id === ant)) return ant;
            return viagensCronologicas[0].id;
          });
          setViagemFimJornadaId((ant) => {
            if (ant && viagensCronologicas.some((v) => v.id === ant)) return ant;
            return viagensCronologicas[viagensCronologicas.length - 1].id;
          });

          if (viagemInicialId) {
            const achada = viagensCronologicas.find((v) => v.id === viagemInicialId);
            if (achada) {
              setViagemSelecionada(achada);
              return;
            }
          }
          setViagemSelecionada((ant) => {
            if (ant && viagensCronologicas.some((v) => v.id === ant.id)) return ant;
            return viagensCronologicas[0];
          });
        } else {
          setViagemSelecionada(null);
          setJornadaConsolidada(null);
          setPontos([]);
        }
      });
    };

    atualizarViagens();

    // Reatividade via WebSocket Realtime para ciclos de ignição
    const canal = supabase
      .channel(`hunter_viagens_${veiculo.id}_${anoSelecionado}_${mesSelecionado}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "viagens_trajetos",
          filter: `veiculo_id=eq.${veiculo.id}`,
        },
        () => {
          atualizarViagens();
        },
      )
      .on("broadcast", { event: "telemetria_atualizada" }, () => {
        atualizarViagens();
      })
      .subscribe();

    return () => {
      montado = false;
      supabase.removeChannel(canal);
    };
  }, [veiculo.id, anoSelecionado, mesSelecionado, diaSelecionado, viagemInicialId]);

  // Função estável para desenhar polyline, paradas e marcador no Leaflet 2D
  const desenharPontos2D = useCallback(
    (map: L.Map, pts: PosicaoHistorico[], jornada?: JornadaConsolidada | null) => {
      if (!map) return;

      if (polyline2DRef.current) {
        map.removeLayer(polyline2DRef.current);
        polyline2DRef.current = null;
      }
      if (polylineHitbox2DRef.current) {
        map.removeLayer(polylineHitbox2DRef.current);
        polylineHitbox2DRef.current = null;
      }
      if (popupAtivo2DRef.current) {
        map.removeLayer(popupAtivo2DRef.current);
        popupAtivo2DRef.current = null;
      }
      if (marker2DRef.current) {
        map.removeLayer(marker2DRef.current);
        marker2DRef.current = null;
      }

      // Limpa marcadores anteriores de paradas e pings
      if (markersParadas2DRef.current) {
        markersParadas2DRef.current.forEach((m) => map.removeLayer(m));
        markersParadas2DRef.current = [];
      }
      if (markersPings2DRef.current) {
        markersPings2DRef.current.forEach((m) => map.removeLayer(m));
        markersPings2DRef.current = [];
      }

      const pontosValidos = pts.filter(
        (p) =>
          typeof p.latitude === "number" &&
          typeof p.longitude === "number" &&
          !isNaN(p.latitude) &&
          !isNaN(p.longitude) &&
          (p.latitude !== 0 || p.longitude !== 0),
      );

      if (pontosValidos.length > 0) {
        const pontosEnriquecidos = enriquecerPontosComTelemetria(
          pontosValidos,
          Number(veiculo.odometro) || 0,
        );

        const latlngs = pontosEnriquecidos.map(
          (p) => [p.latitude, p.longitude] as [number, number],
        );

        // 1. Linha visual do trajeto
        const polyline = L.polyline(latlngs, {
          color: "#10B981",
          weight: 5,
          opacity: 0.9,
          smoothFactor: 1,
        }).addTo(map);
        polyline2DRef.current = polyline;

        // 2. Hitbox invisível com área de toque larga (22px) para facilitar clique em celular e mouse
        const polylineHitbox = L.polyline(latlngs, {
          color: "#000000",
          weight: 22,
          opacity: 0,
          interactive: true,
        }).addTo(map);
        polylineHitbox2DRef.current = polylineHitbox;

        // Ação de clique em qualquer trecho do trajeto
        const abrirBalaoPonto2D = (e: L.LeafletMouseEvent) => {
          let menorDistancia = Infinity;
          let idxMaisProximo = 0;
          pontosEnriquecidos.forEach((p, idx) => {
            const d = map.distance(e.latlng, [p.latitude, p.longitude]);
            if (d < menorDistancia) {
              menorDistancia = d;
              idxMaisProximo = idx;
            }
          });

          const pSel = pontosEnriquecidos[idxMaisProximo];
          setIndiceAtual(idxMaisProximo);

          const htmlBalao = gerarHtmlBalaoTelemetria(
            pSel.telemetriaDinamica,
            idxMaisProximo,
            pontosEnriquecidos.length,
          );

          if (popupAtivo2DRef.current) {
            map.removeLayer(popupAtivo2DRef.current);
          }

          const popup = L.popup({
            offset: [0, -10],
            className: "hunter-balao-telemetria-leaflet",
            closeButton: true,
          })
            .setLatLng([pSel.latitude, pSel.longitude])
            .setContent(htmlBalao)
            .openOn(map);

          popupAtivo2DRef.current = popup;
        };

        polyline.on("click", abrirBalaoPonto2D);
        polylineHitbox.on("click", abrirBalaoPonto2D);

        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });

        // 3. Pontas de seta piscantes em cada ponto físico de ping recebido (mostra sentido e permite clique)
        pontosEnriquecidos.forEach((p, idx) => {
          const proximo =
            idx < pontosEnriquecidos.length - 1 ? pontosEnriquecidos[idx + 1] : undefined;
          const anterior = idx > 0 ? pontosEnriquecidos[idx - 1] : undefined;
          const rumo = calcularRumoPonto(p, proximo, anterior);

          const iconeSeta = L.divIcon({
            html: `
              <div class="hunter-seta-ping-container" style="transform: rotate(${rumo}deg); width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Momento ${new Date(p.telemetriaDinamica.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${p.telemetriaDinamica.velocidade} km/h (Sentido: ${rumo}°)">
                <div class="hunter-seta-ping-wrapper" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L21 21L12 17L3 21L12 2Z" fill="#10B981" stroke="#064E3B" stroke-width="1.8" stroke-linejoin="round" />
                  </svg>
                </div>
              </div>
            `,
            className: "custom-hunter-marker",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          const mPing = L.marker([p.latitude, p.longitude], {
            icon: iconeSeta,
            interactive: true,
            zIndexOffset: 150,
          }).addTo(map);

          mPing.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            setIndiceAtual(idx);
            const htmlBalao = gerarHtmlBalaoTelemetria(
              p.telemetriaDinamica,
              idx,
              pontosEnriquecidos.length,
            );
            if (popupAtivo2DRef.current) {
              map.removeLayer(popupAtivo2DRef.current);
            }
            const popup = L.popup({
              offset: [0, -10],
              className: "hunter-balao-telemetria-leaflet",
              closeButton: true,
            })
              .setLatLng([p.latitude, p.longitude])
              .setContent(htmlBalao)
              .openOn(map);
            popupAtivo2DRef.current = popup;
          });

          markersPings2DRef.current.push(mPing);
        });

        // 4. Marcadores de paradas intermediárias com bolinha laranja e balão informativo ao clicar
        const listaParadas: ParadaJornada[] =
          jornada?.paradas && jornada.paradas.length > 0
            ? jornada.paradas
            : extrairParadasDePontos(pontosValidos);

        if (listaParadas.length > 0) {
          listaParadas.forEach((parada) => {
            const customIconParada = L.divIcon({
              html: `
                <div class="hunter-parada-orange-marker" style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Parada ${parada.ordem} · ${parada.duracaoFormatada}">
                  <div class="hunter-parada-pulse-ring" style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(245, 158, 11, 0.45); border: 1.5px solid #F59E0B; pointer-events: none;"></div>
                  <div style="position: relative; width: 15px; height: 15px; border-radius: 50%; background: #F59E0B; border: 2px solid #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10;">
                    <div style="width: 5px; height: 5px; border-radius: 50%; background: #78350F;"></div>
                  </div>
                </div>
              `,
              className: "custom-hunter-marker",
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            const mParada = L.marker([parada.latitude, parada.longitude], {
              icon: customIconParada,
              zIndexOffset: 500,
            }).addTo(map);

            mParada.on("click", async (e) => {
              L.DomEvent.stopPropagation(e);
              if (popupAtivo2DRef.current) {
                map.removeLayer(popupAtivo2DRef.current);
              }
              const popup = L.popup({
                offset: [0, -12],
                className: "hunter-balao-telemetria-leaflet",
                closeButton: true,
              })
                .setLatLng([parada.latitude, parada.longitude])
                .setContent(
                  gerarHtmlBalaoParada(
                    parada,
                    parada.endereco || "Localizando endereço via satélite...",
                  ),
                )
                .openOn(map);

              popupAtivo2DRef.current = popup;

              if (!parada.endereco) {
                try {
                  const enderecoReal = await obterEnderecoPorCoordenadas(
                    parada.latitude,
                    parada.longitude,
                  );
                  parada.endereco = enderecoReal;
                  if (popupAtivo2DRef.current === popup) {
                    popup.setContent(gerarHtmlBalaoParada(parada, enderecoReal));
                  }
                } catch {
                  // Mantém coordenadas se rede falhar
                }
              }
            });

            markersParadas2DRef.current.push(mParada);
          });
        }

        const pInicial = pontosValidos[0];
        const customIcon = L.divIcon({
          html: `
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #0B1120; border: 3px solid #10B981; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: #10B981;"></div>
            </div>
          `,
          className: "hunter-playback-marker",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        marker2DRef.current = L.marker([pInicial.latitude, pInicial.longitude], {
          icon: customIcon,
        }).addTo(map);
      } else {
        const latEfetiva =
          typeof veiculo.latitude === "number" && !isNaN(veiculo.latitude) && veiculo.latitude !== 0
            ? veiculo.latitude
            : pontos.length > 0
              ? pontos[0].latitude
              : 0;
        const lngEfetiva =
          typeof veiculo.longitude === "number" &&
          !isNaN(veiculo.longitude) &&
          veiculo.longitude !== 0
            ? veiculo.longitude
            : pontos.length > 0
              ? pontos[0].longitude
              : 0;
        if (latEfetiva !== 0 && lngEfetiva !== 0) {
          map.setView([latEfetiva, lngEfetiva], 15);
        }

        if (
          typeof veiculo.latitude === "number" &&
          typeof veiculo.longitude === "number" &&
          !isNaN(veiculo.latitude) &&
          !isNaN(veiculo.longitude) &&
          (veiculo.latitude !== 0 || veiculo.longitude !== 0)
        ) {
          const customIcon = L.divIcon({
            html: `
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #0B1120; border: 3px solid #10B981; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: #10B981; animation: pulse 2s infinite;"></div>
              </div>
            `,
            className: "hunter-playback-marker",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          marker2DRef.current = L.marker([latEfetiva, lngEfetiva], {
            icon: customIcon,
          }).addTo(map);
        }
      }
    },
    [veiculo.latitude, veiculo.longitude, veiculo.odometro],
  );

  // 2. Carrega os pontos: Viagem Selecionada (Ciclo Único) OU Jornada Completa (Saída ao Retorno)
  useEffect(() => {
    if (tipoVisao === "ciclo_unico") {
      if (!viagemSelecionada) return;

      setCarregandoPontos(true);
      setIsPlaying(false);
      setIndiceAtual(0);
      setJornadaConsolidada(null);
      setParadaAtivaNoMomento(null);

      carregarPontosViagem(veiculo.id, viagemSelecionada.inicio_at, viagemSelecionada.fim_at).then(
        (pts) => {
          setPontos(pts);
          setCarregandoPontos(false);

          // Autocura de métricas da viagem se estiverem zeradas e houver pontos registrados
          const precisaAutocuraKm =
            !viagemSelecionada.km_percorrido || Number(viagemSelecionada.km_percorrido) === 0;
          const precisaAutocuraVel =
            !viagemSelecionada.velocidade_media || Number(viagemSelecionada.velocidade_media) === 0;
          if (pts.length > 1 && (precisaAutocuraKm || precisaAutocuraVel)) {
            const metricas = calcularMetricasPontos(pts);
            if (metricas.km > 0 || metricas.velMax > 0 || metricas.velMedia > 0) {
              const kmFinal =
                precisaAutocuraKm && metricas.km > 0
                  ? metricas.km
                  : Number(viagemSelecionada.km_percorrido || 0);
              const velMedFinal =
                precisaAutocuraVel && metricas.velMedia > 0
                  ? metricas.velMedia
                  : Number(viagemSelecionada.velocidade_media || 0);
              const velMaxFinal = Math.max(
                viagemSelecionada.velocidade_maxima || 0,
                metricas.velMax,
              );

              setViagemSelecionada((prev) =>
                prev
                  ? {
                      ...prev,
                      km_percorrido: kmFinal,
                      velocidade_media: velMedFinal,
                      velocidade_maxima: velMaxFinal,
                    }
                  : null,
              );
              setViagens((prev) =>
                prev.map((v) =>
                  v.id === viagemSelecionada.id
                    ? {
                        ...v,
                        km_percorrido: kmFinal,
                        velocidade_media: velMedFinal,
                        velocidade_maxima: velMaxFinal,
                      }
                    : v,
                ),
              );
              supabase
                .from("viagens_trajetos")
                .update({
                  km_percorrido: kmFinal,
                  velocidade_media: velMedFinal,
                  velocidade_maxima: velMaxFinal,
                })
                .eq("id", viagemSelecionada.id)
                .then(() => {});
            }
          }
        },
      );
    } else {
      // Modo Jornada Completa (Saída até o Retorno / Viagem Multi-Dias)
      if (!viagemInicioJornadaId || !viagemFimJornadaId) return;

      const vIni = viagensPartida.find((v) => v.id === viagemInicioJornadaId);
      const vFim = viagensFim.find((v) => v.id === viagemFimJornadaId);
      if (!vIni || !vFim) return;

      const t1 = new Date(vIni.inicio_at).getTime();
      const t2 = new Date(vFim.fim_at || vFim.inicio_at).getTime();
      const inicioReal = t1 <= t2 ? vIni.inicio_at : vFim.inicio_at;
      const fimReal = t1 <= t2 ? vFim.fim_at || vFim.inicio_at : vIni.fim_at || vIni.inicio_at;

      setCarregandoPontos(true);
      setIsPlaying(false);
      setIndiceAtual(0);
      setParadaAtivaNoMomento(null);

      Promise.all([
        carregarPontosViagem(veiculo.id, inicioReal, fimReal, 5000),
        carregarViagensPeriodo(veiculo.id, inicioReal, fimReal),
      ]).then(([pts, viagensPeriodo]) => {
        setPontos(pts);
        setCarregandoPontos(false);

        // Agrupa todas as viagens do percurso para consolidação completa das paradas
        const mapaViagens = new Map<string, TrajetoViagem>();
        [...viagensPartida, ...viagensFim, ...viagensPeriodo].forEach((v) => {
          mapaViagens.set(v.id, v);
        });
        const todasViagens = Array.from(mapaViagens.values());

        const consolidado = consolidarJornadaMultiCiclos(vIni.id, vFim.id, todasViagens, pts);
        setJornadaConsolidada(consolidado);
      });
    }
  }, [
    tipoVisao,
    viagemSelecionada,
    viagemInicioJornadaId,
    viagemFimJornadaId,
    viagensPartida,
    viagensFim,
    veiculo.id,
  ]);

  // Ciclo de vida e destruição segura das instâncias de mapa ao desmontar
  useEffect(() => {
    return () => {
      if (map2DInstanceRef.current) {
        map2DInstanceRef.current.remove();
        map2DInstanceRef.current = null;
      }
      if (map3DInstanceRef.current) {
        map3DInstanceRef.current.remove();
        map3DInstanceRef.current = null;
      }
    };
  }, []);

  // Observador de redimensionamento em tempo real (ResizeObserver) para garantir estabilidade contínua dos tiles
  useEffect(() => {
    const el2D = map2DContainerRef.current;
    if (!el2D) return;

    const observer = new ResizeObserver(() => {
      if (map2DInstanceRef.current) {
        map2DInstanceRef.current.invalidateSize({ pan: false });
      }
    });

    observer.observe(el2D);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el3D = map3DContainerRef.current;
    if (!el3D) return;

    const observer = new ResizeObserver(() => {
      if (map3DInstanceRef.current) {
        map3DInstanceRef.current.resize();
      }
    });

    observer.observe(el3D);
    return () => observer.disconnect();
  }, []);

  // Redimensionamento forçado ao alternar entre 2D e 3D
  useEffect(() => {
    const t1 = setTimeout(() => {
      if (modo === "2D" && map2DInstanceRef.current) {
        map2DInstanceRef.current.invalidateSize({ pan: false });
      }
      if (modo === "3D" && map3DInstanceRef.current) {
        map3DInstanceRef.current.resize();
      }
    }, 60);

    const t2 = setTimeout(() => {
      if (modo === "2D" && map2DInstanceRef.current) {
        map2DInstanceRef.current.invalidateSize({ pan: false });
      }
      if (modo === "3D" && map3DInstanceRef.current) {
        map3DInstanceRef.current.resize();
      }
    }, 250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [modo]);

  // 3. Inicialização Única do Mapa 2D (Leaflet)
  useEffect(() => {
    if (modo !== "2D" || !map2DContainerRef.current) return;

    if (!map2DInstanceRef.current) {
      // Instancia sem centro/zoom iniciais para permitir que o TileLayer registre seus eventos antes do primeiro viewreset
      const map = L.map(map2DContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        maxZoom: 21,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Define a camada inicial de tiles imediatamente antes de setView
      const initialLayer = L.tileLayer(
        theme === "satellite"
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          crossOrigin: true,
          subdomains: ["a", "b", "c"],
          maxZoom: 21,
          maxNativeZoom: theme === "satellite" ? 18 : 19,
          attribution: theme === "satellite" ? "&copy; Esri" : "&copy; OpenStreetMap contributors",
        },
      );
      initialLayer.addTo(map);
      tileLayer2DRef.current = initialLayer;

      // Define a visualização inicial com disparo forçado de load e renderização de tiles
      const latInicial =
        typeof veiculo.latitude === "number" && !isNaN(veiculo.latitude) && veiculo.latitude !== 0
          ? veiculo.latitude
          : pontos.length > 0
            ? pontos[0].latitude
            : 0;
      const lngInicial =
        typeof veiculo.longitude === "number" &&
        !isNaN(veiculo.longitude) &&
        veiculo.longitude !== 0
          ? veiculo.longitude
          : pontos.length > 0
            ? pontos[0].longitude
            : 0;
      if (latInicial !== 0 && lngInicial !== 0) {
        map.setView([latInicial, lngInicial], 15, { reset: true });
      }
      map2DInstanceRef.current = map;

      map.invalidateSize({ pan: false });
      if (pontos.length > 0) {
        desenharPontos2D(map, pontos);
      }
      requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        if (pontos.length > 0) {
          desenharPontos2D(map, pontos);
        }
      });
      setTimeout(() => {
        map.invalidateSize({ pan: false });
        if (pontos.length > 0) {
          desenharPontos2D(map, pontos);
        }
      }, 150);
    }
  }, [modo, veiculo.latitude, veiculo.longitude, theme, pontos, desenharPontos2D]);

  // Atualização Dinâmica da Camada de Tiles 2D
  useEffect(() => {
    const map = map2DInstanceRef.current;
    if (!map) return;

    if (tileLayer2DRef.current) {
      map.removeLayer(tileLayer2DRef.current);
    }

    let novaCamada: L.TileLayer;
    if (theme === "satellite") {
      novaCamada = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          crossOrigin: true,
          maxZoom: 21,
          maxNativeZoom: 18,
          attribution: "&copy; Esri",
        },
      );
    } else {
      novaCamada = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        crossOrigin: true,
        subdomains: ["a", "b", "c"],
        maxZoom: 21,
        maxNativeZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      });
    }

    novaCamada.addTo(map);
    novaCamada.redraw();
    tileLayer2DRef.current = novaCamada;
    map.invalidateSize({ pan: false });
  }, [theme]);

  // Atualização de Rota, Traçado e Marcador 2D quando pontos mudarem
  useEffect(() => {
    const map = map2DInstanceRef.current;
    if (!map || modo !== "2D") return;
    desenharPontos2D(map, pontos, jornadaConsolidada);
  }, [modo, pontos, jornadaConsolidada, desenharPontos2D]);

  // Função auxiliar de estilo MapLibre 3D
  const obterEstilo3D = (t: MapTheme) => {
    let tiles = [
      "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    ];
    let maxzoom = 19;

    if (t === "satellite") {
      tiles = [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ];
      maxzoom = 18;
    }

    return {
      version: 8,
      sources: {
        "base-raster-tiles": {
          type: "raster",
          tiles,
          tileSize: 256,
          maxzoom,
        },
      },
      layers: [
        {
          id: "base-raster-layer",
          type: "raster",
          source: "base-raster-tiles",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
  };

  // 4. Inicialização e Atualização do Mapa 3D (MapLibre GL)
  useEffect(() => {
    if (modo !== "3D" || !map3DContainerRef.current) return;

    if (!map3DInstanceRef.current) {
      const map = new maplibregl.Map({
        container: map3DContainerRef.current,
        style: obterEstilo3D(theme) as any,
        center: [veiculo.longitude, veiculo.latitude],
        zoom: 16,
        pitch: 60,
        bearing: -15,
        attributionControl: false,
        preserveDrawingBuffer: true,
      });

      map3DInstanceRef.current = map;
    }

    const map = map3DInstanceRef.current;
    if (!map) return;

    map.setStyle(obterEstilo3D(theme) as any);
    map.resize();
    const raf3d = requestAnimationFrame(() => {
      map.resize();
    });
    const t3d = setTimeout(() => {
      map.resize();
    }, 120);

    map.on("load", () => {
      map.resize();
      desenharRota3D();
    });

    if (map.isStyleLoaded()) {
      desenharRota3D();
    }

    function desenharRota3D() {
      if (pontos.length === 0) {
        // Sem pontos: posiciona no veículo
        if (marker3DRef.current) marker3DRef.current.remove();
        const el = document.createElement("div");
        el.style.width = "36px";
        el.style.height = "36px";
        el.style.borderRadius = "50%";
        el.style.background = "#0B1120";
        el.style.border = "3px solid #10B981";
        el.style.boxShadow = "0 8px 18px rgba(0,0,0,0.8)";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.innerHTML = `<div style="width: 12px; height: 12px; border-radius: 50%; background: #10B981;"></div>`;

        marker3DRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([veiculo.longitude, veiculo.latitude])
          .addTo(map);
        map.flyTo({ center: [veiculo.longitude, veiculo.latitude], zoom: 16, pitch: 55 });
        return;
      }

      if (map.getSource("rota-trajeto")) {
        if (map.getLayer("rota-trajeto-linha-hitbox")) map.removeLayer("rota-trajeto-linha-hitbox");
        if (map.getLayer("rota-trajeto-linha")) map.removeLayer("rota-trajeto-linha");
        map.removeSource("rota-trajeto");
      }

      const pontosEnriquecidos = enriquecerPontosComTelemetria(
        pontos,
        Number(veiculo.odometro) || 0,
      );

      const coordinates = pontosEnriquecidos.map((p) => [p.longitude, p.latitude]);

      map.addSource("rota-trajeto", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        },
      });

      // Camada invisível larga para toque/clique fácil
      map.addLayer({
        id: "rota-trajeto-linha-hitbox",
        type: "line",
        source: "rota-trajeto",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#000000",
          "line-width": 26,
          "line-opacity": 0.001,
        },
      });

      // Camada visível da linha verde
      map.addLayer({
        id: "rota-trajeto-linha",
        type: "line",
        source: "rota-trajeto",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#10B981",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      const abrirBalaoPonto3D = (e: any) => {
        const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
        let menorDistancia = Infinity;
        let idxMaisProximo = 0;
        pontosEnriquecidos.forEach((p, idx) => {
          const d = Math.hypot(p.longitude - lng, p.latitude - lat);
          if (d < menorDistancia) {
            menorDistancia = d;
            idxMaisProximo = idx;
          }
        });

        const pSel = pontosEnriquecidos[idxMaisProximo];
        setIndiceAtual(idxMaisProximo);

        const htmlBalao = gerarHtmlBalaoTelemetria(
          pSel.telemetriaDinamica,
          idxMaisProximo,
          pontosEnriquecidos.length,
        );

        if (popupAtivo3DRef.current) {
          popupAtivo3DRef.current.remove();
        }

        const popup = new maplibregl.Popup({
          offset: 15,
          closeButton: true,
          className: "hunter-balao-telemetria-maplibre",
        })
          .setLngLat([pSel.longitude, pSel.latitude])
          .setHTML(htmlBalao)
          .addTo(map);

        popupAtivo3DRef.current = popup;
      };

      map.on("click", "rota-trajeto-linha", abrirBalaoPonto3D);
      map.on("click", "rota-trajeto-linha-hitbox", abrirBalaoPonto3D);
      map.on("mouseenter", "rota-trajeto-linha", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseenter", "rota-trajeto-linha-hitbox", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "rota-trajeto-linha", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseleave", "rota-trajeto-linha-hitbox", () => {
        map.getCanvas().style.cursor = "";
      });

      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 60, pitch: 60, duration: 1000 });

      // Marcador 3D do veículo
      if (marker3DRef.current) {
        marker3DRef.current.remove();
      }

      // Limpa marcadores 3D anteriores de paradas e pings
      if (markersParadas3DRef.current.length > 0) {
        markersParadas3DRef.current.forEach((m) => m.remove());
        markersParadas3DRef.current = [];
      }
      if (markersPings3DRef.current.length > 0) {
        markersPings3DRef.current.forEach((m) => m.remove());
        markersPings3DRef.current = [];
      }

      // 3. Pontas de seta piscantes 3D em cada ponto físico de ping recebido
      pontosEnriquecidos.forEach((p, idx) => {
        const proximo =
          idx < pontosEnriquecidos.length - 1 ? pontosEnriquecidos[idx + 1] : undefined;
        const anterior = idx > 0 ? pontosEnriquecidos[idx - 1] : undefined;
        const rumo = calcularRumoPonto(p, proximo, anterior);

        const elPing = document.createElement("div");
        elPing.className = "cursor-pointer select-none";
        elPing.title = `Momento ${new Date(p.telemetriaDinamica.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${p.telemetriaDinamica.velocidade} km/h (Sentido: ${rumo}°)`;
        elPing.innerHTML = `
          <div class="hunter-seta-ping-container" style="transform: rotate(${rumo}deg); width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div class="hunter-seta-ping-wrapper" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L21 21L12 17L3 21L12 2Z" fill="#10B981" stroke="#064E3B" stroke-width="1.8" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        `;

        const popup3DPing = new maplibregl.Popup({
          offset: 12,
          closeButton: true,
          className: "hunter-balao-telemetria-maplibre",
        }).setHTML(gerarHtmlBalaoTelemetria(p.telemetriaDinamica, idx, pontosEnriquecidos.length));

        const mPing3D = new maplibregl.Marker({ element: elPing })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(popup3DPing)
          .addTo(map);

        elPing.addEventListener("click", () => {
          setIndiceAtual(idx);
        });

        markersPings3DRef.current.push(mPing3D);
      });

      // 4. Marcadores 3D de paradas intermediárias com bolinha laranja e balão informativo
      const listaParadas3D: ParadaJornada[] =
        jornadaConsolidada?.paradas && jornadaConsolidada.paradas.length > 0
          ? jornadaConsolidada.paradas
          : extrairParadasDePontos(pontos);

      if (listaParadas3D.length > 0) {
        listaParadas3D.forEach((parada) => {
          const elParada = document.createElement("div");
          elParada.className = "cursor-pointer select-none";
          elParada.title = `Parada ${parada.ordem} · ${parada.duracaoFormatada}`;
          elParada.innerHTML = `
            <div class="hunter-parada-orange-marker" style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <div class="hunter-parada-pulse-ring" style="position: absolute; width: 26px; height: 26px; border-radius: 50%; background: rgba(245, 158, 11, 0.45); border: 1.5px solid #F59E0B; pointer-events: none;"></div>
              <div style="position: relative; width: 15px; height: 15px; border-radius: 50%; background: #F59E0B; border: 2px solid #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10;">
                <div style="width: 5px; height: 5px; border-radius: 50%; background: #78350F;"></div>
              </div>
            </div>
          `;

          const popupParada3D = new maplibregl.Popup({
            offset: 14,
            closeButton: true,
            className: "hunter-balao-telemetria-maplibre",
          }).setHTML(
            gerarHtmlBalaoParada(parada, parada.endereco || "Localizando endereço via satélite..."),
          );

          const mParada3D = new maplibregl.Marker({ element: elParada })
            .setLngLat([parada.longitude, parada.latitude])
            .setPopup(popupParada3D)
            .addTo(map);

          elParada.addEventListener("click", async () => {
            if (!parada.endereco) {
              try {
                const enderecoReal = await obterEnderecoPorCoordenadas(
                  parada.latitude,
                  parada.longitude,
                );
                parada.endereco = enderecoReal;
                popupParada3D.setHTML(gerarHtmlBalaoParada(parada, enderecoReal));
              } catch {
                // Mantém coordenadas se rede falhar
              }
            }
          });

          markersParadas3DRef.current.push(mParada3D);
        });
      }

      const el = document.createElement("div");
      el.style.width = "36px";
      el.style.height = "36px";
      el.style.borderRadius = "50%";
      el.style.background = "#0B1120";
      el.style.border = "3px solid #10B981";
      el.style.boxShadow = "0 8px 18px rgba(0,0,0,0.8)";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.innerHTML = `<div style="width: 12px; height: 12px; border-radius: 50%; background: #10B981;"></div>`;

      marker3DRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([pontos[0].longitude, pontos[0].latitude])
        .addTo(map);
    }

    return () => {
      cancelAnimationFrame(raf3d);
      clearTimeout(t3d);
    };
  }, [
    modo,
    pontos,
    jornadaConsolidada,
    theme,
    veiculo.latitude,
    veiculo.longitude,
    veiculo.odometro,
  ]);

  // 5. Motor de Reprodução / Playback
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const intervaloMs = Math.max(100, Math.floor(1000 / velocidadePlayback));

    playbackTimerRef.current = setInterval(() => {
      setIndiceAtual((prev) => {
        if (prev >= pontos.length - 1) {
          setIsPlaying(false);
          return prev;
        }

        // Ao sinalizar uma parada do veículo, não precisa parar no ponto: continua o trajeto sem pausar
        // Pula eventuais repetições de pontos estacionados no mesmo ponto geográfico
        let proximo = prev + 1;
        const ptAtual = pontos[prev];
        if (ptAtual) {
          while (
            proximo < pontos.length - 1 &&
            pontos[proximo].velocidade === 0 &&
            Math.abs(pontos[proximo].latitude - ptAtual.latitude) < 0.00015 &&
            Math.abs(pontos[proximo].longitude - ptAtual.longitude) < 0.00015
          ) {
            proximo++;
          }
        }
        return proximo;
      });
    }, intervaloMs);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, velocidadePlayback, pontos]);

  // 6. Atualiza Marcador e Câmera com base no índice atual do Playback
  useEffect(() => {
    if (pontos.length === 0 || !pontos[indiceAtual]) return;

    const ponto = pontos[indiceAtual];

    // Detecção da parada ativa para exibição do balão informativo sem pausar o deslocamento
    if (jornadaConsolidada && jornadaConsolidada.paradas.length > 0) {
      const paradaProxima = jornadaConsolidada.paradas.find(
        (p) => Math.abs(p.indicePonto - indiceAtual) <= 2,
      );
      setParadaAtivaNoMomento(paradaProxima || null);
    } else {
      setParadaAtivaNoMomento(null);
    }

    const intervaloMs = Math.max(100, Math.floor(1000 / velocidadePlaybackRef.current));
    const duracaoSlideMs = isPlayingRef.current ? Math.min(intervaloMs * 0.9, 600) : 0;
    animacaoPlaybackRef.current?.cancelar();
    animacaoPlaybackRef.current = null;

    // Atualiza marcador 2D com deslizamento contínuo durante playback ativo
    if (
      modo === "2D" &&
      marker2DRef.current &&
      typeof ponto.latitude === "number" &&
      typeof ponto.longitude === "number" &&
      !isNaN(ponto.latitude) &&
      !isNaN(ponto.longitude)
    ) {
      const marker2D = marker2DRef.current;
      const atual2D = marker2D.getLatLng();
      animacaoPlaybackRef.current = animarMarcadorPlaybackSuave({
        de: [atual2D.lat, atual2D.lng],
        para: [ponto.latitude, ponto.longitude],
        duracaoMs: duracaoSlideMs,
        aplicarPosicao: ([lat, lng]) => marker2D.setLatLng([lat, lng]),
      });
      map2DInstanceRef.current?.panTo([ponto.latitude, ponto.longitude], {
        animate: true,
        duration: 0.3,
      });
    }

    // Atualiza marcador 3D com deslizamento contínuo durante playback ativo
    if (
      modo === "3D" &&
      marker3DRef.current &&
      typeof ponto.latitude === "number" &&
      typeof ponto.longitude === "number" &&
      !isNaN(ponto.latitude) &&
      !isNaN(ponto.longitude)
    ) {
      const marker3D = marker3DRef.current;
      const atual3D = marker3D.getLngLat();
      animacaoPlaybackRef.current = animarMarcadorPlaybackSuave({
        de: [atual3D.lat, atual3D.lng],
        para: [ponto.latitude, ponto.longitude],
        duracaoMs: duracaoSlideMs,
        aplicarPosicao: ([lat, lng]) => marker3D.setLngLat([lng, lat]),
      });
      map3DInstanceRef.current?.easeTo({
        center: [ponto.longitude, ponto.latitude],
        bearing: ponto.rumo || 0,
        pitch: 60,
        duration: 300,
      });
    }

    return () => {
      animacaoPlaybackRef.current?.cancelar();
      animacaoPlaybackRef.current = null;
    };
  }, [indiceAtual, pontos, modo, jornadaConsolidada]);

  const pontoAtual = pontos[indiceAtual] || null;
  const pontoAnterior = indiceAtual > 0 ? pontos[indiceAtual - 1] : null;
  const telemetriaPontoAtual = useMemo(() => {
    if (!pontoAtual) return null;
    return calcularTelemetriaPonto(pontoAtual, pontoAnterior, {
      odometroBase: Number(veiculo.odometro) || 0,
    });
  }, [pontoAtual, pontoAnterior, veiculo.odometro]);

  const calcularCardeal = (graus: number): string => {
    const direcoes = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
    const idx = Math.round(graus / 45) % 8;
    return direcoes[idx];
  };

  const rumoMomentoAtual = useMemo(() => {
    if (!pontoAtual) return 0;
    const proximo = indiceAtual < pontos.length - 1 ? pontos[indiceAtual + 1] : undefined;
    const anterior = indiceAtual > 0 ? pontos[indiceAtual - 1] : undefined;
    return calcularRumoPonto(pontoAtual, proximo, anterior);
  }, [pontoAtual, indiceAtual, pontos]);

  const focarEabrirBalaoParada = async (parada: ParadaJornada) => {
    setIndiceAtual(parada.indicePonto);
    setParadaAtivaNoMomento(parada);

    if (modo === "2D" && map2DInstanceRef.current) {
      const map = map2DInstanceRef.current;
      map.setView([parada.latitude, parada.longitude], 17, { animate: true });

      if (popupAtivo2DRef.current) {
        map.removeLayer(popupAtivo2DRef.current);
      }

      const popup = L.popup({
        offset: [0, -12],
        className: "hunter-balao-telemetria-leaflet",
        closeButton: true,
      })
        .setLatLng([parada.latitude, parada.longitude])
        .setContent(
          gerarHtmlBalaoParada(parada, parada.endereco || "Localizando endereço via satélite..."),
        )
        .openOn(map);

      popupAtivo2DRef.current = popup;

      if (!parada.endereco) {
        try {
          const enderecoReal = await obterEnderecoPorCoordenadas(parada.latitude, parada.longitude);
          parada.endereco = enderecoReal;
          if (popupAtivo2DRef.current === popup) {
            popup.setContent(gerarHtmlBalaoParada(parada, enderecoReal));
          }
        } catch {
          // mantém coordenadas se falhar
        }
      }
    } else if (modo === "3D" && map3DInstanceRef.current) {
      const map = map3DInstanceRef.current;
      map.flyTo({
        center: [parada.longitude, parada.latitude],
        zoom: 17,
        pitch: 60,
      });

      if (popupAtivo3DRef.current) {
        popupAtivo3DRef.current.remove();
      }

      const popup = new maplibregl.Popup({
        offset: 14,
        closeButton: true,
        className: "hunter-balao-telemetria-maplibre",
      })
        .setLngLat([parada.longitude, parada.latitude])
        .setHTML(
          gerarHtmlBalaoParada(parada, parada.endereco || "Localizando endereço via satélite..."),
        )
        .addTo(map);

      popupAtivo3DRef.current = popup;

      if (!parada.endereco) {
        try {
          const enderecoReal = await obterEnderecoPorCoordenadas(parada.latitude, parada.longitude);
          parada.endereco = enderecoReal;
          popup.setHTML(gerarHtmlBalaoParada(parada, enderecoReal));
        } catch {
          // mantém coordenadas se falhar
        }
      }
    }
  };

  const ajustarEnquadramentoTrajeto = () => {
    if (modo === "2D" && map2DInstanceRef.current && polyline2DRef.current) {
      map2DInstanceRef.current.fitBounds(polyline2DRef.current.getBounds(), { padding: [40, 40] });
    } else if (modo === "3D" && map3DInstanceRef.current && pontos.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      pontos.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      map3DInstanceRef.current.fitBounds(bounds, { padding: 60, pitch: 60 });
    }
  };

  const navegarParada = (direcao: "anterior" | "proxima") => {
    const listaParadas: ParadaJornada[] =
      jornadaConsolidada?.paradas && jornadaConsolidada.paradas.length > 0
        ? jornadaConsolidada.paradas
        : extrairParadasDePontos(pontos);

    if (listaParadas.length === 0) {
      toast.info("Nenhuma parada detectada neste percurso.");
      return;
    }

    let indiceParada = -1;
    if (paradaAtivaNoMomento) {
      indiceParada = listaParadas.findIndex((p) => p.id === paradaAtivaNoMomento.id);
    }

    let novoIndice: number;
    if (direcao === "proxima") {
      novoIndice = indiceParada < listaParadas.length - 1 ? indiceParada + 1 : 0;
    } else {
      novoIndice = indiceParada > 0 ? indiceParada - 1 : listaParadas.length - 1;
    }

    focarEabrirBalaoParada(listaParadas[novoIndice]);
  };

  // Captura Fotográfica Real do Mapa com Trajeto e Paradas Georreferenciadas
  const capturarSnapshotMapa = async (): Promise<string | null> => {
    try {
      if (modo === "3D" && map3DInstanceRef.current) {
        const canvas = map3DInstanceRef.current.getCanvas();
        if (canvas) {
          return canvas.toDataURL("image/jpeg", 0.88);
        }
      }

      const map = map2DInstanceRef.current;
      const container = map2DContainerRef.current;
      if (!map || !container) return null;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = theme === "dark" ? "#0f172a" : "#f8fafc";
      ctx.fillRect(0, 0, width, height);

      const tileImgs = Array.from(
        container.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img"),
      );
      const containerRect = container.getBoundingClientRect();
      for (const img of tileImgs) {
        if (!img.complete || img.naturalWidth === 0) continue;
        const rect = img.getBoundingClientRect();
        const x = rect.left - containerRect.left;
        const y = rect.top - containerRect.top;
        try {
          ctx.drawImage(img, x, y, rect.width, rect.height);
        } catch {
          // Fallback silencioso para isolamento de erro de tile
        }
      }

      // Linha do Percurso
      if (pontos.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "#10b981"; // Verde esmeralda tático
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        let first = true;
        for (const p of pontos) {
          const pt = map.latLngToContainerPoint([p.latitude, p.longitude]);
          if (first) {
            ctx.moveTo(pt.x, pt.y);
            first = false;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        ctx.stroke();
      }

      // Marcadores de Paradas Georreferenciadas
      const paradasParaDesenhar = jornadaConsolidada
        ? jornadaConsolidada.paradas
        : extrairParadasDePontos(pontos);

      for (const parada of paradasParaDesenhar) {
        const pt = map.latLngToContainerPoint([parada.latitude, parada.longitude]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, 2 * Math.PI);
        ctx.fillStyle = "#f59e0b"; // âmbar
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`P${parada.ordem}`, pt.x, pt.y);
      }

      // Marcador de Saída e Chegada
      if (pontos.length > 0) {
        const p0 = pontos[0];
        const pt0 = map.latLngToContainerPoint([p0.latitude, p0.longitude]);
        ctx.beginPath();
        ctx.arc(pt0.x, pt0.y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        const pFim = pontos[pontos.length - 1];
        const ptFim = map.latLngToContainerPoint([pFim.latitude, pFim.longitude]);
        ctx.beginPath();
        ctx.arc(ptFim.x, ptFim.y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      return canvas.toDataURL("image/jpeg", 0.88);
    } catch (err) {
      console.warn("Falha ao capturar mapa:", err);
      return null;
    }
  };

  // 7. Geração de Laudo Oficial em PDF
  const baixarLaudoPdf = async () => {
    if (tipoVisao === "ciclo_unico" && !viagemSelecionada) {
      toast.error("Nenhuma viagem selecionada para gerar laudo.");
      return;
    }
    if (tipoVisao === "jornada_completa" && !jornadaConsolidada) {
      toast.error("Nenhuma jornada consolidada para gerar laudo.");
      return;
    }

    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF();
      const logoBase64 = await carregarLogoEmblemaBase64();
      const payloadIntegridade = `${veiculo.id}:${veiculo.placa}:${new Date().toISOString()}:${tipoVisao}:${pontos.length}`;
      const hashBuffer = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(payloadIntegridade),
      );
      const hashSha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Cabeçalho Institucional Hunter
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, doc.internal.pageSize.width, 28, "F");

      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 26, doc.internal.pageSize.width, 2, "F");

      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", 8, 2, 24, 24);
        } catch {
          // Fallback silencioso
        }
      }

      const offsetTextoX = logoBase64 ? 38 : 14;

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("GD RASTREAMENTO — LAUDO DE TELEMETRIA E HISTÓRICO VEICULAR", offsetTextoX, 12);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("SISTEMA CANÔNICO DE AUDITORIA E PERCURSO VEICULAR", offsetTextoX, 18);
      doc.text(`Emissão Autenticada · Versão v${APP_VERSION_NUMERO}`, offsetTextoX, 23);

      // Metadados do Veículo
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS DO VEÍCULO E CLIENTE", 14, 35);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Placa: ${veiculo.placa} | Modelo: ${veiculo.marca_modelo}`, 14, 40);

      // Captura da Imagem Real do Mapa com Trajeto Refeito
      const imgMapa = await capturarSnapshotMapa();
      let tabelaStartY = 54;

      if (imgMapa) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("REGISTRO FOTOGRÁFICO DO TRAJETO GEORREFERENCIADO", 14, 54);

        const larguraMapa = 182;
        const alturaMapa = 68;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.roundedRect(13.5, 56.5, larguraMapa + 1, alturaMapa + 1, 1.5, 1.5, "S");
        doc.addImage(imgMapa, "JPEG", 14, 57, larguraMapa, alturaMapa, undefined, "FAST");

        tabelaStartY = 57 + alturaMapa + 8;
      }

      if (tipoVisao === "jornada_completa" && jornadaConsolidada) {
        doc.text(
          `Cliente: ${veiculo.cliente_nome || "Não informado"} | Período da Jornada: ${new Date(jornadaConsolidada.inicio_at).toLocaleString("pt-BR")} até ${new Date(jornadaConsolidada.fim_at).toLocaleString("pt-BR")}`,
          14,
          45,
        );
        doc.text(
          `Distância Total: ${formatarDistanciaViagem(jornadaConsolidada.kmTotal)} | Em Trânsito: ${formatarMinutosJornada(jornadaConsolidada.tempoTransitoMinutos)} | Tempo Parado: ${formatarMinutosJornada(jornadaConsolidada.tempoParadoMinutos)} | Retorno ao Início: ${jornadaConsolidada.retornouAoInicio ? "SIM" : "NÃO"}`,
          14,
          50,
        );

        // Tabela 1: Ciclos de Ignição da Jornada
        const rowsCiclos = jornadaConsolidada.ciclos.map((v) => [
          new Date(v.inicio_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          v.fim_at
            ? new Date(v.fim_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Em rota",
          formatarDistanciaViagem(v.km_percorrido),
          `${v.velocidade_media} km/h`,
          `${v.velocidade_maxima} km/h`,
        ]);

        autoTable(doc, {
          startY: tabelaStartY,
          head: [
            ["Saída (Ignição ON)", "Chegada (Ignição OFF)", "Distância", "Vel. Média", "Vel. Máx"],
          ],
          body: rowsCiclos,
          theme: "striped",
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
        });

        // Tabela 2: Paradas Intermediárias Registradas
        if (jornadaConsolidada.paradas.length > 0) {
          const finalY = (doc as any).lastAutoTable.finalY + 8;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("PARADAS INTERMEDIÁRIAS DETECTADAS", 14, finalY);

          // Geocodificação reversa em paralelo de cada parada para emissão do endereço real
          const paradasComEndereco = await Promise.all(
            jornadaConsolidada.paradas.map(async (p) => {
              let endereco = p.endereco;
              if (!endereco) {
                try {
                  endereco = await obterEnderecoPorCoordenadas(p.latitude, p.longitude);
                } catch {
                  endereco = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
                }
              }
              return { ...p, endereco };
            }),
          );

          const rowsParadas = paradasComEndereco.map((p) => [
            `Parada ${p.ordem}`,
            new Date(p.inicio_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            new Date(p.fim_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            p.duracaoFormatada,
            p.endereco || "Não identificado",
            `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
          ]);

          autoTable(doc, {
            startY: finalY + 4,
            head: [
              ["Parada", "Início", "Retomada", "Tempo Parado", "Endereço do Local", "Coordenadas"],
            ],
            body: rowsParadas,
            theme: "grid",
            headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 16 },
              2: { cellWidth: 16 },
              3: { cellWidth: 22 },
              4: { cellWidth: 78 },
              5: { cellWidth: 34 },
            },
          });
        }
      } else if (viagemSelecionada) {
        doc.text(
          `Cliente: ${veiculo.cliente_nome || "Não informado"} | Período: ${new Date(viagemSelecionada.inicio_at).toLocaleString("pt-BR")} até ${viagemSelecionada.fim_at ? new Date(viagemSelecionada.fim_at).toLocaleString("pt-BR") : "Em rota"}`,
          14,
          45,
        );
        doc.text(
          `Distância Percorrida: ${formatarDistanciaViagem(viagemSelecionada.km_percorrido)} | Velocidade Média: ${viagemSelecionada.velocidade_media} km/h | Velocidade Máxima: ${viagemSelecionada.velocidade_maxima} km/h`,
          14,
          50,
        );

        // Tabela de Pontos / Resumo de Viagens
        const rows = viagens.map((v) => [
          new Date(v.inicio_at).toLocaleString("pt-BR"),
          v.fim_at ? new Date(v.fim_at).toLocaleString("pt-BR") : "Em percurso",
          formatarDistanciaViagem(v.km_percorrido),
          `${v.velocidade_media} km/h`,
          `${v.velocidade_maxima} km/h`,
          !v.fim_at ? "Em Movimento" : "Concluído",
        ]);

        autoTable(doc, {
          startY: tabelaStartY,
          head: [
            [
              "Início (Ignição ON)",
              "Fim (Ignição OFF)",
              "Distância",
              "Vel. Média",
              "Vel. Máx",
              "Status",
            ],
          ],
          body: rows.length > 0 ? rows : [["Nenhum percurso registrado", "-", "-", "-", "-", "-"]],
          theme: "striped",
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
          styles: { fontSize: 8 },
        });

        // Tabela de Paradas da Viagem Selecionada (se houver)
        const paradasCiclo = extrairParadasDePontos(pontos);
        if (paradasCiclo.length > 0) {
          const finalY = (doc as any).lastAutoTable.finalY + 8;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("PARADAS INTERMEDIÁRIAS DETECTADAS NA VIAGEM", 14, finalY);

          const paradasCicloComEndereco = await Promise.all(
            paradasCiclo.map(async (p) => {
              let endereco = p.endereco;
              if (!endereco) {
                try {
                  endereco = await obterEnderecoPorCoordenadas(p.latitude, p.longitude);
                } catch {
                  endereco = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
                }
              }
              return { ...p, endereco };
            }),
          );

          const rowsParadasCiclo = paradasCicloComEndereco.map((p) => [
            `Parada ${p.ordem}`,
            new Date(p.inicio_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            new Date(p.fim_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            p.duracaoFormatada,
            p.endereco || "Não identificado",
            `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
          ]);

          autoTable(doc, {
            startY: finalY + 4,
            head: [
              ["Parada", "Início", "Retomada", "Tempo Parado", "Endereço do Local", "Coordenadas"],
            ],
            body: rowsParadasCiclo,
            theme: "grid",
            headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
              0: { cellWidth: 20 },
              1: { cellWidth: 16 },
              2: { cellWidth: 16 },
              3: { cellWidth: 22 },
              4: { cellWidth: 78 },
              5: { cellWidth: 34 },
            },
          });
        }
      }

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${APP_NOME} v${APP_VERSION_NUMERO} · Laudo Oficial com Cadeia de Custódia`,
          14,
          doc.internal.pageSize.height - 10,
        );
        doc.text(
          `Hash de Integridade SHA-256: ${hashSha256}`,
          14,
          doc.internal.pageSize.height - 6,
        );
        doc.text(
          `Página ${i} de ${pageCount}`,
          doc.internal.pageSize.width - 30,
          doc.internal.pageSize.height - 8,
        );
      }

      const sessaoAtual = obterSessaoCacheada();
      const isSimulacao = Boolean(
        isModoDegustacao(sessaoAtual) ||
        veiculo.id.startsWith("deg-") ||
        veiculo.placa.startsWith("DEG-"),
      );

      if (isSimulacao) {
        aplicarChancelaSimulacaoPdf(doc, "Laudo de Telemetria");
      }

      const nomeArquivo = `GD_Rastreamento_Laudo_Telemetria_${veiculo.placa}.pdf`;

      try {
        const arrayBuffer = doc.output("arraybuffer");
        const hashCalculado = await calcularSha256Buffer(arrayBuffer);
        await registrarDocumentoEmitido({
          nome_arquivo: nomeArquivo,
          hash_sha256: hashCalculado,
          tipo_documento: "LAUDO_TELEMETRIA",
          descricao: `Laudo Oficial de Telemetria e Cadeia de Custódia - Veículo ${veiculo.placa} (${veiculo.marca_modelo})`,
          tamanho_bytes: arrayBuffer.byteLength,
          metadata: {
            veiculo_id: veiculo.id,
            placa: veiculo.placa,
            hash_conteudo: hashSha256,
            total_viagens: viagens.length,
          },
        });
      } catch (errReg) {
        console.warn("Aviso ao registrar laudo de telemetria emitido:", errReg);
      }

      doc.save(nomeArquivo);
      toast.success("Laudo oficial baixado com sucesso!");
    } catch (e: any) {
      console.error("[RefazerTrajetoModal] Falha ao gerar o laudo:", e);
      toast.error(`Falha ao gerar o laudo: ${e?.message || String(e)}`);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-5 bg-slate-950/85 backdrop-blur-md select-none animate-fadeIn overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-6xl h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-2.5rem)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden pb-safe my-auto">
          {/* Header Superior */}
          <header className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between gap-3 bg-[#eaf0f8]/80 dark:bg-slate-950/50">
            <div className="flex items-center gap-3">
              {/* Placa Mercosul */}
              <div className="bg-white border border-slate-800 rounded shadow-md overflow-hidden font-mono text-center">
                <div className="bg-[#003399] h-2 w-full"></div>
                <div className="px-2 py-0.5 text-slate-900 font-black text-xs">{veiculo.placa}</div>
              </div>

              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Refazer Trajeto e Telemetria</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 font-mono font-semibold">
                    {modo}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {veiculo.marca_modelo} · {veiculo.cliente_nome || "Cliente"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Alternador 2D / 3D */}
              <div className="flex items-center rounded-xl bg-slate-200 dark:bg-slate-800 p-0.5 text-xs font-bold">
                <button
                  onClick={() => setModo("2D")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    modo === "2D"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => {
                    if (!podeUsar3D) {
                      toast.error("O Modo 3D requer o plano Pro ou Master.");
                      return;
                    }
                    setModo("3D");
                  }}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                    modo === "3D"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <span>3D</span>
                  {!podeUsar3D && <span className="text-[10px] opacity-75">★</span>}
                </button>
              </div>

              {/* Menu Seletor de Camadas (Provedor de Mapa) */}
              <div className="relative">
                <button
                  onClick={() => setMenuCamadasAberto(!menuCamadasAberto)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs transition"
                  title="Alternar camadas do mapa (Ruas / Claro, Noturno, Satélite)"
                >
                  <Layers className="h-4 w-4 text-orange-500" />
                  <span className="hidden sm:inline">Camadas</span>
                </button>

                {menuCamadasAberto && (
                  <div className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 shadow-2xl z-50 text-slate-800 dark:text-slate-200">
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
                            setTheme(c.id);
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
                          {selecionada && (
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={baixarLaudoPdf}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-500/15 hover:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition shadow-sm"
              >
                <FileDown className="h-4 w-4" />
                <span>Baixar Laudo (PDF)</span>
              </button>

              <button
                onClick={onFechar}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Corpo Principal: Lista de Viagens + Mapa de Replay */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* Coluna Esquerda: Filtro Temporal Obrigatório (Ano / Mês / Dia) + Lista de Viagens */}
            <aside className="w-full md:w-84 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col overflow-hidden max-h-64 md:max-h-full">
              {/* Cabeçalho de Seleção Temporal */}
              {/* Filtros e Seletores de Modo */}
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900/80">
                {/* Alternador de Modo de Visão: Trajeto Completo (Multi-Dias) vs Ciclo Único */}
                <div>
                  <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl gap-1 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTipoVisao("jornada_completa")}
                      className={`py-1.5 px-2 rounded-lg transition text-center flex items-center justify-center gap-1.5 ${
                        tipoVisao === "jornada_completa"
                          ? "bg-orange-500 text-white shadow-xs font-black"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                      }`}
                    >
                      <Repeat className="h-3.5 w-3.5" />
                      <span>Trajeto Completo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoVisao("ciclo_unico")}
                      className={`py-1.5 px-2 rounded-lg transition text-center ${
                        tipoVisao === "ciclo_unico"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-black"
                          : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                      }`}
                    >
                      Ciclo Único
                    </button>
                  </div>
                </div>

                {/* Seletor de Período Geral exclusivo do Modo Ciclo Único */}
                {tipoVisao === "ciclo_unico" && (
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-orange-500" />
                        Período do Trajeto
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        {viagens.length} {viagens.length === 1 ? "ciclo" : "ciclos"}
                      </span>
                    </div>

                    {/* Seletores de Ano e Mês */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">
                          Ano
                        </label>
                        <select
                          value={anoSelecionado}
                          onChange={(e) => {
                            setAnoSelecionado(Number(e.target.value));
                            setDiaSelecionado(null);
                          }}
                          className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                        >
                          {ANOS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">
                          Mês
                        </label>
                        <select
                          value={mesSelecionado}
                          onChange={(e) => {
                            setMesSelecionado(Number(e.target.value));
                            setDiaSelecionado(null);
                          }}
                          className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                        >
                          {MESES.map((m) => (
                            <option key={m.valor} value={m.valor}>
                              {m.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Seletor Opcional de Dia */}
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-slate-400 font-medium">
                          Filtrar por Dia
                        </label>
                        {diaSelecionado !== null && (
                          <button
                            type="button"
                            onClick={() => setDiaSelecionado(null)}
                            className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                          >
                            Ver Mês Inteiro
                          </button>
                        )}
                      </div>
                      <select
                        value={diaSelecionado === null ? "" : diaSelecionado}
                        onChange={(e) =>
                          setDiaSelecionado(e.target.value ? Number(e.target.value) : null)
                        }
                        className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
                      >
                        <option value="">
                          Todos os dias de {MESES.find((m) => m.valor === mesSelecionado)?.nome}
                        </option>
                        {Array.from({ length: totalDiasMes }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            Dia {String(d).padStart(2, "0")} ({String(d).padStart(2, "0")}/
                            {String(mesSelecionado).padStart(2, "0")})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Conteúdo da Coluna Esquerda: Conforme Modo Selecionado */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tipoVisao === "ciclo_unico" ? (
                  carregandoViagens ? (
                    <div className="text-center py-8 text-xs text-slate-400 flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      <span>
                        Carregando trajetos de {MESES.find((m) => m.valor === mesSelecionado)?.nome}
                        /{anoSelecionado}...
                      </span>
                    </div>
                  ) : viagens.length === 0 ? (
                    <div className="text-center py-8 px-4 text-xs text-slate-400 space-y-2">
                      <Route className="h-7 w-7 text-slate-300 dark:text-slate-600 mx-auto" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">
                        Nenhum percurso registrado
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Não há registros de ignição no período selecionado (
                        {MESES.find((m) => m.valor === mesSelecionado)?.nome}/{anoSelecionado}
                        {diaSelecionado ? ` - Dia ${diaSelecionado}` : ""}).
                      </p>
                      {(anoSelecionado !== anoAtual ||
                        mesSelecionado !== mesAtual ||
                        diaSelecionado !== null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAnoSelecionado(anoAtual);
                            setMesSelecionado(mesAtual);
                            setDiaSelecionado(null);
                          }}
                          className="mt-2 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold border border-orange-500/30 transition shadow-xs"
                        >
                          Ir para Mês Atual
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Modo Ciclo Único: Lista tradicional de viagens */
                    viagens.map((v) => {
                      const isSel = viagemSelecionada?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setViagemSelecionada(v)}
                          className={`w-full text-left p-2.5 rounded-2xl border transition-all text-xs ${
                            isSel
                              ? "bg-orange-500/15 border-orange-500 text-emerald-950 dark:text-orange-100 shadow-sm"
                              : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono font-bold">
                            <span className="text-slate-900 dark:text-slate-100">
                              {new Date(v.inicio_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              →{" "}
                              {v.fim_at
                                ? new Date(v.fim_at).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Em rota"}
                            </span>
                            <span className="text-orange-600 dark:text-orange-400">
                              {formatarDistanciaViagem(v.km_percorrido)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1">
                            <span>{new Date(v.inicio_at).toLocaleDateString("pt-BR")}</span>
                            <span>Média: {v.velocidade_media} km/h</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                            <span>Máx: {v.velocidade_maxima} km/h</span>
                            <span
                              className={v.fim_at ? "text-slate-400" : "text-orange-500 font-bold"}
                            >
                              {v.fim_at ? "Concluída" : "Em percurso"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )
                ) : (
                  /* Modo Saída ao Retorno: Configuração de Jornada Multi-Ciclos e Multi-Dias */
                  <div className="space-y-3">
                    {/* Seleção de Ponto de Início (Saída com Dia, Mês e Ano Separados) */}
                    <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>Ponto de Partida (Saída)</span>
                        </label>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">
                          {String(diaPartida).padStart(2, "0")}/
                          {String(mesPartida).padStart(2, "0")}/{anoPartida}
                        </span>
                      </div>

                      {/* Seleção de Dia, Mês e Ano da Partida separadamente */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Dia
                          </label>
                          <select
                            value={diaPartida}
                            onChange={(e) => setDiaPartida(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          >
                            {Array.from({ length: totalDiasMesPartida }, (_, i) => i + 1).map(
                              (d) => (
                                <option key={d} value={d}>
                                  {String(d).padStart(2, "0")}
                                </option>
                              ),
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Mês
                          </label>
                          <select
                            value={mesPartida}
                            onChange={(e) => setMesPartida(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          >
                            {MESES.map((m) => (
                              <option key={m.valor} value={m.valor}>
                                {m.sigla}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Ano
                          </label>
                          <select
                            value={anoPartida}
                            onChange={(e) => setAnoPartida(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          >
                            {ANOS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Lista de Saídas da Data */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                          {carregandoViagensPartida
                            ? "Carregando saídas..."
                            : `Saídas da Data (${viagensPartida.length})`}
                        </label>
                        {viagensPartida.length === 0 ? (
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 text-center">
                            Nenhuma saída nesta data
                          </div>
                        ) : (
                          <select
                            value={viagemInicioJornadaId || ""}
                            onChange={(e) => setViagemInicioJornadaId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          >
                            {viagensPartida.map((v, idx) => (
                              <option key={v.id} value={v.id}>
                                Saída {idx + 1} (
                                {new Date(v.inicio_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                ) · {formatarDistanciaViagem(v.km_percorrido)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Seleção de Ponto Final (Retorno ou Destino com Dia, Mês e Ano Separados) */}
                    <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-extrabold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                          <Navigation className="h-3.5 w-3.5" />
                          <span>Ponto Final (Retorno / Chegada)</span>
                        </label>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">
                          {String(diaFim).padStart(2, "0")}/{String(mesFim).padStart(2, "0")}/
                          {anoFim}
                        </span>
                      </div>

                      {/* Seleção de Dia, Mês e Ano do Fim separadamente */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Dia
                          </label>
                          <select
                            value={diaFim}
                            onChange={(e) => setDiaFim(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                          >
                            {Array.from({ length: totalDiasMesFim }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={d}>
                                {String(d).padStart(2, "0")}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Mês
                          </label>
                          <select
                            value={mesFim}
                            onChange={(e) => setMesFim(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                          >
                            {MESES.map((m) => (
                              <option key={m.valor} value={m.valor}>
                                {m.sigla}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                            Ano
                          </label>
                          <select
                            value={anoFim}
                            onChange={(e) => setAnoFim(Number(e.target.value))}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                          >
                            {ANOS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Lista de Chegadas da Data */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold block mb-0.5 uppercase">
                          {carregandoViagensFim
                            ? "Carregando chegadas..."
                            : `Chegadas da Data (${viagensFim.length})`}
                        </label>
                        {viagensFim.length === 0 ? (
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 text-center">
                            Nenhuma chegada nesta data
                          </div>
                        ) : (
                          <select
                            value={viagemFimJornadaId || ""}
                            onChange={(e) => setViagemFimJornadaId(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                          >
                            {viagensFim.map((v, idx) => (
                              <option key={v.id} value={v.id}>
                                Chegada {idx + 1} (
                                {v.fim_at
                                  ? new Date(v.fim_at).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Em rota"}
                                ) · {formatarDistanciaViagem(v.km_percorrido)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Badge indicativa de percurso multi-dias ou cruzamento de meia-noite */}
                    {(anoPartida !== anoFim || mesPartida !== mesFim || diaPartida !== diaFim) && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[11px] font-bold flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>Percurso Multi-Dias / Madrugada (Cruzamento de datas)</span>
                      </div>
                    )}

                    {/* Cards Consolidados da Jornada */}
                    {jornadaConsolidada && (
                      <div className="space-y-2">
                        {/* Status de Retorno à Origem */}
                        <div
                          className={`p-2 rounded-2xl flex items-center gap-2 text-xs font-bold border ${
                            jornadaConsolidada.retornouAoInicio
                              ? "bg-orange-500/15 border-orange-500/30 text-orange-600 dark:text-orange-400"
                              : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {jornadaConsolidada.retornouAoInicio ? (
                            <>
                              <Home className="h-4 w-4 shrink-0 text-orange-500" />
                              <span>
                                🏠 Retorno ao Ponto Inicial (
                                {jornadaConsolidada.distanciaRetornoMetros}m da saída)
                              </span>
                            </>
                          ) : (
                            <>
                              <Navigation className="h-4 w-4 shrink-0 text-sky-500" />
                              <span>Parada em Destino Final</span>
                            </>
                          )}
                        </div>

                        {/* Grade de Métricas da Jornada com Filtro Bidirecional Interativo */}
                        <div className="grid grid-cols-2 gap-1.5 font-mono">
                          <button
                            type="button"
                            onClick={ajustarEnquadramentoTrajeto}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-500/50 hover:bg-orange-500/5 transition text-left cursor-pointer"
                            title="Clique para reenquadrar o percurso completo no mapa"
                          >
                            <span className="text-[10px] text-slate-400 block font-sans font-bold">
                              Distância Total 🔍
                            </span>
                            <span className="text-sm font-black text-orange-600 dark:text-orange-400">
                              {formatarDistanciaViagem(jornadaConsolidada.kmTotal)}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPlaying(false);
                              setIndiceAtual(0);
                            }}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition text-left cursor-pointer"
                            title="Clique para saltar ao início da movimentação"
                          >
                            <span className="text-[10px] text-slate-400 block font-sans font-bold">
                              Em Movimento
                            </span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                              {formatarMinutosJornada(jornadaConsolidada.tempoTransitoMinutos)}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => navegarParada("proxima")}
                            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition text-left cursor-pointer"
                            title="Clique para navegar e focar nas paradas registradas"
                          >
                            <span className="text-[10px] text-slate-400 block font-sans font-bold">
                              Tempo Parado 🅿️
                            </span>
                            <span className="text-sm font-black text-amber-500">
                              {formatarMinutosJornada(jornadaConsolidada.tempoParadoMinutos)}
                            </span>
                          </button>

                          <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] text-slate-400 block font-sans font-bold">
                              Vel. Média
                            </span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                              {jornadaConsolidada.velocidadeMedia} km/h
                            </span>
                          </div>
                        </div>

                        {/* Lista de Paradas Intermediárias */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="flex items-center justify-between mb-1.5 px-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                              <Hourglass className="h-3 w-3 text-amber-500" />
                              <span>
                                Paradas Intermediárias ({jornadaConsolidada.paradas.length})
                              </span>
                            </span>
                          </div>

                          {jornadaConsolidada.paradas.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                              Nenhuma parada com ignição desligada detectada entre a saída e o
                              destino.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {jornadaConsolidada.paradas.map((parada) => {
                                const isAtiva = paradaAtivaNoMomento?.id === parada.id;
                                return (
                                  <button
                                    key={parada.id}
                                    type="button"
                                    onClick={() => focarEabrirBalaoParada(parada)}
                                    className={`w-full text-left p-2 rounded-xl border transition-all text-xs cursor-pointer ${
                                      isAtiva
                                        ? "bg-amber-500/15 border-amber-500 text-amber-950 dark:text-amber-100 shadow-xs"
                                        : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-amber-400"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-mono font-bold">
                                      <span className="text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                        <span>🅿️ Parada {parada.ordem}</span>
                                      </span>
                                      <span className="text-amber-600 dark:text-amber-400">
                                        {parada.duracaoFormatada}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
                                      <span>
                                        {new Date(parada.inicio_at).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}{" "}
                                        às{" "}
                                        {new Date(parada.fim_at).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                                        Ver detalhes
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* Área Central: Visualizador de Mapa + HUD de Telemetria */}
            <div className="flex-1 relative flex flex-col min-h-0 h-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
              {/* Barra Superior Unificada Flutuante: Telemetria ao Vivo e Legenda Tática */}
              <div className="absolute top-3 inset-x-3 z-20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 pointer-events-none">
                {/* HUD Flutuante com Métricas ao Vivo do Ponto Atual */}
                {pontoAtual ? (
                  <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs shadow-xl font-mono">
                    {/* Velocidade */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-emerald-200 dark:border-emerald-800/60">
                      <Gauge className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                      <span className="font-black text-orange-600 dark:text-orange-400">
                        {telemetriaPontoAtual?.velocidade ?? pontoAtual.velocidade} km/h
                      </span>
                    </div>

                    {/* Rumo / Bússola Cardeal */}
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                      title={`Rumo: ${rumoMomentoAtual}° (${calcularCardeal(rumoMomentoAtual)}) · Sentido da ponta de seta`}
                    >
                      <Compass
                        className="h-3.5 w-3.5 text-orange-500 transition-transform duration-300"
                        style={{ transform: `rotate(${rumoMomentoAtual}deg)` }}
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {rumoMomentoAtual}° {calcularCardeal(rumoMomentoAtual)}
                      </span>
                    </div>

                    {/* Hodômetro (KM) */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60">
                      <Navigation className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {(telemetriaPontoAtual?.odometroKm ?? 0).toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                        km
                      </span>
                    </div>

                    {/* Horário daquele Momento */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <Clock className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {new Date(pontoAtual.data_hora_gps).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>

                    {/* Inclinação: exibe apenas quando houver registro físico factual */}
                    {telemetriaPontoAtual?.inclinacaoGraus !== null &&
                      telemetriaPontoAtual?.inclinacaoGraus !== undefined && (
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60"
                          title={`Inclinação: ${telemetriaPontoAtual.inclinacaoGraus}° (Sensor Físico)`}
                        >
                          <Activity className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                          <span className="font-bold text-amber-700 dark:text-amber-400 text-xs">
                            {telemetriaPontoAtual.inclinacaoGraus}°
                          </span>
                        </div>
                      )}

                    {/* Força G: exibe apenas quando houver registro físico factual */}
                    {telemetriaPontoAtual?.forcaG !== null &&
                      telemetriaPontoAtual?.forcaG !== undefined && (
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60"
                          title={`Força G: ${telemetriaPontoAtual.forcaG.toFixed(2)} G (Alerta de Impacto)`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                          <span className="font-bold text-rose-700 dark:text-rose-400 text-xs">
                            {telemetriaPontoAtual.forcaG.toFixed(2)} G
                          </span>
                        </div>
                      )}
                  </div>
                ) : (
                  <div />
                )}

                {/* Legenda Tática Flutuante no Topo do Mapa */}
                <div className="pointer-events-auto shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg text-[11px] font-mono text-slate-700 dark:text-slate-300">
                  <div
                    className="flex items-center gap-1.5 cursor-help"
                    title="Ponta de seta verde piscante indica o ping de GPS e o sentido exato do deslocamento (mão ou contramão)"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      Seta: Sentido / Ping
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <div
                    className="flex items-center gap-1.5 cursor-help"
                    title="Bolinha laranja indica parada registrada com início, retomada e endereço"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      Bolinha: Parada
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={ajustarEnquadramentoTrajeto}
                    className="text-[10px] text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 font-bold underline transition cursor-pointer"
                    title="Reenquadrar percurso completo"
                  >
                    Enquadrar
                  </button>
                </div>
              </div>

              {/* Balão Informativo de Parada Flutuante no Mapa (sem travar o playback) */}
              {paradaAtivaNoMomento && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-500 text-slate-950 font-bold shadow-2xl border-2 border-white animate-bounce pointer-events-none">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-950 text-amber-400 font-mono text-xs font-black">
                    P{paradaAtivaNoMomento.ordem}
                  </div>
                  <div className="flex flex-col">
                    <div className="text-xs uppercase tracking-wider font-black flex items-center gap-1.5">
                      <span>Parada {paradaAtivaNoMomento.ordem}</span>
                      <span className="bg-slate-950/20 px-2 py-0.5 rounded-full text-[10px]">
                        {paradaAtivaNoMomento.duracaoFormatada}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-900/90 font-mono font-semibold">
                      {new Date(paradaAtivaNoMomento.inicio_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      às{" "}
                      {new Date(paradaAtivaNoMomento.fim_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {isPlaying && " · Deslocamento contínuo"}
                    </span>
                  </div>
                </div>
              )}

              {/* Viewport dos Mapas 2D e 3D */}
              <div className="flex-1 relative w-full h-full min-h-[300px] overflow-hidden">
                {/* Container Mapa 2D */}
                <div
                  className={`absolute inset-0 w-full h-full z-0 ${modo === "2D" ? "block" : "hidden pointer-events-none"} ${theme === "dark" ? "hunter-dark-tiles" : ""}`}
                >
                  <div ref={map2DContainerRef} className="w-full h-full" />
                </div>

                {/* Container Mapa 3D */}
                <div
                  className={`absolute inset-0 w-full h-full z-0 ${modo === "3D" ? "block" : "hidden pointer-events-none"} ${theme === "dark" ? "hunter-dark-tiles" : ""}`}
                >
                  <div ref={map3DContainerRef} className="w-full h-full" />
                </div>
              </div>

              {/* Barra de Controles de Playback (Inferior) */}
              <div className="shrink-0 p-3 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 z-20">
                {/* Linha da Barra de Progresso / Scrubber */}
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, pontos.length - 1)}
                    value={indiceAtual}
                    onChange={(e) => {
                      setIndiceAtual(Number(e.target.value));
                      setIsPlaying(false);
                    }}
                    disabled={pontos.length === 0}
                    className="flex-1 accent-emerald-500 cursor-pointer disabled:opacity-50"
                  />
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {pontos.length > 0 ? `${indiceAtual + 1}/${pontos.length}` : "0/0"}
                  </span>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setIndiceAtual((prev) => Math.max(0, prev - 1));
                      }}
                      disabled={pontos.length === 0 || indiceAtual === 0}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
                      title="Ponto anterior (-1)"
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => {
                        if (pontos.length === 0) {
                          toast.error("Nenhuma viagem com pontos para reproduzir.");
                          return;
                        }
                        if (indiceAtual >= pontos.length - 1) {
                          setIndiceAtual(0);
                        }
                        setIsPlaying(!isPlaying);
                      }}
                      disabled={pontos.length === 0}
                      className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl font-bold text-xs bg-orange-500 text-white hover:bg-orange-600 transition disabled:opacity-50 shadow-sm"
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      <span>{isPlaying ? "Pausar" : "Iniciar"}</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setIndiceAtual((prev) => Math.min(pontos.length - 1, prev + 1));
                      }}
                      disabled={pontos.length === 0 || indiceAtual >= pontos.length - 1}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-40"
                      title="Próximo ponto (+1)"
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => {
                        setIsPlaying(false);
                        setIndiceAtual(0);
                      }}
                      disabled={pontos.length === 0}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                      title="Reiniciar do início"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>

                    {/* Botões de Navegação Rápida entre Paradas */}
                    <div className="h-4 w-px bg-slate-200 dark:border-slate-800 mx-1 hidden sm:block" />

                    <button
                      type="button"
                      onClick={() => navegarParada("anterior")}
                      disabled={pontos.length === 0}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                      title="Ir para a Parada Anterior"
                    >
                      <Hourglass className="h-3.5 w-3.5 text-amber-500" />
                      <span>Parada Ant.</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navegarParada("proxima")}
                      disabled={pontos.length === 0}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-bold transition disabled:opacity-40 cursor-pointer"
                      title="Ir para a Próxima Parada"
                    >
                      <Hourglass className="h-3.5 w-3.5 text-amber-500" />
                      <span>Próx. Parada</span>
                    </button>
                  </div>

                  {/* Seletor de Velocidade */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[11px] font-bold">
                    {[1, 2, 5, 10].map((v) => (
                      <button
                        key={v}
                        onClick={() => setVelocidadePlayback(v)}
                        className={`px-2 py-1 rounded-lg transition ${
                          velocidadePlayback === v
                            ? "bg-orange-500 text-white shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {v}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
