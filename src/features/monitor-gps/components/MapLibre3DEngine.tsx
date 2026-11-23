import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { VeiculoGps, MapTheme } from "../types";
import {
  normalizarListaCoordenadas,
  avaliarEstadoRotaDinamica,
} from "../services/rotaMonitoradaService";
import { enriquecerTrajetoComMalhaViaria } from "../services/trajetoInteligenteService";
import {
  gerarMarcador3DHtml,
  deveExibirPlacaNoMapa,
  obterCorStatusVeiculo,
} from "../utils/vehicle3dIcons";
import { obterRumoVeiculo } from "../services/orientacaoRuaService";
import { avaliarStatusComunicacao } from "../services/gpsService";
import {
  ControladorMovimentoSuave,
  coordenadaValidaMapa,
  criarChaveVisualMarcador,
  atualizarRotacaoElementoMarcador,
} from "../utils/interpolacaoMapaSuave";
import { clusterizarVeiculos, gerarMarcadorClusterHtml } from "../utils/clusterVeiculos";
import { VehicleMotionController, haversineMeters } from "../../../services/vehicleMotionEngine";
import { requisitarSnapToRoad } from "../../../services/mapMatchingService";

export interface MapLibre3DEngineHandle {
  fitBounds: (veiculosAlvo?: VeiculoGps[]) => void;
  fitBoundsPostos?: (postosAlvo?: any[]) => void;
  fitBoundsGeral?: (veiculosAlvo?: VeiculoGps[], postosAlvo?: any[]) => void;
  centralizarVeiculo: (v: VeiculoGps) => void;
  centralizarCoordenadas?: (lat: number, lng: number, zoom?: number) => void;
}

interface MapLibre3DEngineProps {
  veiculos: VeiculoGps[];
  theme: MapTheme;
  veiculoSelecionado: VeiculoGps | null;
  onSelectVeiculo: (v: VeiculoGps) => void;
  rotaMonitorada?: {
    id?: string;
    veiculo_id?: string;
    coordenadas_rota: [number, number][];
    tolerancia_desvio_metros: number;
    desvio_detectado?: boolean;
    ultima_distancia_desvio_m?: number;
  } | null;
}

export const MapLibre3DEngine = forwardRef<MapLibre3DEngineHandle, MapLibre3DEngineProps>(
  function MapLibre3DEngine(
    { veiculos, theme, veiculoSelecionado, onSelectVeiculo, rotaMonitorada },
    ref,
  ) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<{
      [id: string]: {
        tipo: "generico" | "modelo";
        marker: any;
        visualKey: string;
        veiculoAtual: VeiculoGps;
      };
    }>({});
    const clusterMarkersRef = useRef<{ [id: string]: any }>({});
    const vehicleMotionControllersRef = useRef<Map<string, VehicleMotionController>>(new Map());
    const bufferPontosRecentesRef = useRef<
      Map<string, Array<{ lat: number; lng: number; timestamp?: number }>>
    >(new Map());
    const abortSnapControllersRef = useRef<Map<string, AbortController>>(new Map());
    const [zoomAtual, setZoomAtual] = useState(15);
    const controladorMovimentoRef = useRef<ControladorMovimentoSuave>(
      new ControladorMovimentoSuave(),
    );
    const onSelectVeiculoRef = useRef(onSelectVeiculo);
    onSelectVeiculoRef.current = onSelectVeiculo;
    const veiculoSelecionadoIdRef = useRef<string | null>(veiculoSelecionado?.id ?? null);
    veiculoSelecionadoIdRef.current = veiculoSelecionado?.id ?? null;
    const veiculoSelecionadoRef = useRef<VeiculoGps | null>(veiculoSelecionado);
    veiculoSelecionadoRef.current = veiculoSelecionado;
    const selectedIdAnteriorRef = useRef<string | null>(null);
    const seguindoCameraRef = useRef<boolean>(true);
    const programmaticFlyUntilRef = useRef<number>(0);
    const veiculosRef = useRef(veiculos);
    veiculosRef.current = veiculos;
    const themeRef = useRef(theme);
    const [styleLoaded, setStyleLoaded] = useState(false);
    const [versaoPreferencia, setVersaoPreferencia] = useState(0);

    useEffect(() => {
      const handlePreferencia = () => setVersaoPreferencia((p) => p + 1);
      window.addEventListener("hunter_preferencia_mapa_alterada", handlePreferencia);
      return () => {
        window.removeEventListener("hunter_preferencia_mapa_alterada", handlePreferencia);
        for (const mc of vehicleMotionControllersRef.current.values()) {
          mc.destroy();
        }
        vehicleMotionControllersRef.current.clear();
      };
    }, []);

    // Geração do estilo MapLibre baseado no tema ativo
    const obterEstiloTema = (t: MapTheme) => {
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
      } else {
        tiles = [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ];
        maxzoom = 19;
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

    // Ajusta a visão para abranger todos os veículos sem deixar nenhum de fora
    const ajustarVisaoFrota = (veiculosAlvo?: VeiculoGps[]) => {
      const map = mapInstanceRef.current;
      const frota = veiculosAlvo && veiculosAlvo.length > 0 ? veiculosAlvo : veiculosRef.current;
      if (!map || frota.length === 0) return;

      const pontosValidos = frota.filter((v) => coordenadaValidaMapa(v.latitude, v.longitude));

      if (pontosValidos.length === 1) {
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        map.flyTo({
          center: [pontosValidos[0].longitude, pontosValidos[0].latitude],
          zoom: 16,
          pitch: 0,
          bearing: 0,
          essential: true,
          duration: 1000,
        });
      } else if (pontosValidos.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        pontosValidos.forEach((v) => bounds.extend([v.longitude, v.latitude]));
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        // PITCH 0 e BEARING 0 garantem enquadramento retangular ortogonal exato para TODOS os veículos distantes sem distorção
        map.fitBounds(bounds, {
          padding: 80,
          pitch: 0,
          bearing: 0,
          duration: 1000,
          maxZoom: 16,
        });
      }
    };

    // Ajusta a visão para abranger todos os postos de vigilância
    const ajustarVisaoPostos = (postosAlvo?: any[]) => {
      const map = mapInstanceRef.current;
      const lista = postosAlvo || [];
      if (!map || lista.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();
      let count = 0;
      lista.forEach((p: any) => {
        if (!p.ativo) return;
        if (coordenadaValidaMapa(p.latitude, p.longitude)) {
          bounds.extend([p.longitude, p.latitude]);
          count++;
        }
        if (p.perimetro_poligono?.coordinates && p.perimetro_poligono.coordinates.length >= 3) {
          p.perimetro_poligono.coordinates.forEach(([lat, lng]: [number, number]) => {
            if (coordenadaValidaMapa(lat, lng)) {
              bounds.extend([lng, lat]);
              count++;
            }
          });
        }
      });

      if (count === 1) {
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        map.flyTo({
          center: bounds.getCenter(),
          zoom: 17,
          pitch: 0,
          bearing: 0,
          essential: true,
          duration: 1000,
        });
      } else if (count > 1) {
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        map.fitBounds(bounds, {
          padding: 80,
          pitch: 0,
          bearing: 0,
          duration: 1000,
          maxZoom: 17,
        });
      }
    };

    // Ajusta a visão para o Mapa Geral: abrange toda a frota E todos os postos
    const ajustarVisaoGeral = (veiculosAlvo?: VeiculoGps[], postosAlvo?: any[]) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const frota = veiculosAlvo && veiculosAlvo.length > 0 ? veiculosAlvo : veiculosRef.current;
      const lista = postosAlvo || [];

      const bounds = new maplibregl.LngLatBounds();
      let count = 0;

      frota.forEach((v) => {
        if (coordenadaValidaMapa(v.latitude, v.longitude)) {
          bounds.extend([v.longitude, v.latitude]);
          count++;
        }
      });

      lista.forEach((p: any) => {
        if (!p.ativo) return;
        if (coordenadaValidaMapa(p.latitude, p.longitude)) {
          bounds.extend([p.longitude, p.latitude]);
          count++;
        }
        if (p.perimetro_poligono?.coordinates && p.perimetro_poligono.coordinates.length >= 3) {
          p.perimetro_poligono.coordinates.forEach(([lat, lng]: [number, number]) => {
            if (coordenadaValidaMapa(lat, lng)) {
              bounds.extend([lng, lat]);
              count++;
            }
          });
        }
      });

      if (count === 1) {
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        map.flyTo({
          center: bounds.getCenter(),
          zoom: 16,
          pitch: 0,
          bearing: 0,
          essential: true,
          duration: 1000,
        });
      } else if (count > 1) {
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1300;
        map.fitBounds(bounds, {
          padding: 80,
          pitch: 0,
          bearing: 0,
          duration: 1000,
          maxZoom: 16,
        });
      }
    };

    const sincronizarQuadrosMapLibre = useCallback((_agoraMs: number) => {
      // Hard reset determinístico: a movimentação do marcador é realizada exclusivamente pelo loop de 1500ms do VehicleMotionController
    }, []);

    useImperativeHandle(ref, () => ({
      fitBounds: ajustarVisaoFrota,
      fitBoundsPostos: ajustarVisaoPostos,
      fitBoundsGeral: ajustarVisaoGeral,
      centralizarVeiculo: (v: VeiculoGps) => {
        if (mapInstanceRef.current && coordenadaValidaMapa(v?.latitude, v?.longitude)) {
          seguindoCameraRef.current = true;
          selectedIdAnteriorRef.current = v.id;
          const motionCtrl = vehicleMotionControllersRef.current.get(v.id);
          const pos = motionCtrl ? motionCtrl.getPosition() : { lat: v.latitude, lng: v.longitude };
          const rumo = motionCtrl ? motionCtrl.getBearing() : v.rumo || 0;
          programmaticFlyUntilRef.current =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1150;
          mapInstanceRef.current.flyTo({
            center: [pos.lng, pos.lat],
            zoom: Math.max(mapInstanceRef.current.getZoom(), 18),
            pitch: 60,
            bearing: rumo,
            essential: true,
            duration: 1000,
          });
        }
      },
      centralizarCoordenadas: (lat: number, lng: number, zoom?: number) => {
        if (mapInstanceRef.current && coordenadaValidaMapa(lat, lng)) {
          seguindoCameraRef.current = false;
          mapInstanceRef.current.flyTo({
            center: [lng, lat],
            zoom: zoom || 18,
            pitch: 50,
            duration: 1000,
          });
        }
      },
    }));

    // Inicialização do Mapa 3D WebGL com suporte a dispositivos móveis
    useEffect(() => {
      if (!mapContainerRef.current) return;

      let resizeObserver: ResizeObserver | null = null;
      const timers: NodeJS.Timeout[] = [];
      const controlador = controladorMovimentoRef.current;

      if (!mapInstanceRef.current) {
        try {
          const primeiroValido = veiculosRef.current.find((v) =>
            coordenadaValidaMapa(v.latitude, v.longitude),
          );
          const initialLat = primeiroValido?.latitude ?? -22.5235;
          const initialLng = primeiroValido?.longitude ?? -44.1042;
          const initialBearing = primeiroValido?.rumo ?? -15;

          const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: obterEstiloTema(themeRef.current),
            center: [initialLng, initialLat],
            zoom: 15,
            pitch: 60, // Perspectiva 3D Hunter
            bearing: initialBearing,
            maxPitch: 85,
            attributionControl: false,
          });

          // Controles de Navegação 3D (visualização de pitch e rotação)
          map.addControl(
            new maplibregl.NavigationControl({ visualizePitch: true }),
            "bottom-right",
          );

          map.on("dragstart", (e: any) => {
            if (e?.originalEvent) {
              seguindoCameraRef.current = false;
              programmaticFlyUntilRef.current = 0;
            }
          });
          map.on("moveend", () => {
            programmaticFlyUntilRef.current = 0;
          });
          map.on("zoomend", () => {
            setZoomAtual(map.getZoom());
          });

          mapInstanceRef.current = map;

          // Monitora quando o estilo do MapLibre 3D está 100% pronto para receber sources e layers
          map.on("load", () => {
            setStyleLoaded(true);
          });
          map.on("styledata", () => {
            if (map.isStyleLoaded()) {
              setStyleLoaded(true);
            }
          });
        } catch (errInit) {
          console.error("Falha ao inicializar MapLibre 3D:", errInit);
          return;
        }

        // Disparos escalonados para mobile
        const disparos = [50, 200, 500, 1000];
        disparos.forEach((ms) => {
          const t = setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.resize();
            }
          }, ms);
          timers.push(t);
        });

        if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.resize();
            }
          });
          resizeObserver.observe(mapContainerRef.current);
        }
      }

      return () => {
        controlador.limpar();
        for (const mc of vehicleMotionControllersRef.current.values()) {
          mc.destroy();
        }
        vehicleMotionControllersRef.current.clear();
        timers.forEach(clearTimeout);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }, []);

    // Atualização de Estilo do Mapa quando o tema mudar
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      setStyleLoaded(false);
      try {
        map.setStyle(obterEstiloTema(theme));
      } catch (err) {
        console.warn("Aviso ao definir estilo MapLibre:", err);
      }
      const onStyleData = () => {
        if (map.isStyleLoaded()) {
          setStyleLoaded(true);
        }
      };
      map.once("styledata", onStyleData);
      map.resize();
      const timerA = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.resize();
        }
      }, 50);
      const timerB = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.resize();
        }
      }, 150);

      return () => {
        clearTimeout(timerA);
        clearTimeout(timerB);
      };
    }, [theme]);

    // Atualização dos Marcadores 3D no Mapa com deslocamento fluido a 60 FPS e preservação do DOM
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const controlador = controladorMovimentoRef.current;
      const isGenerico = localStorage.getItem("@hunter_icone_mapa_generico") === "true";
      const mostrarPlaca = deveExibirPlacaNoMapa(veiculos.length);
      const idsVeiculosAtivos = new Set<string>();
      const idsClustersAtivos = new Set<string>();

      // Agrupamento tático conforme solicitação:
      // Ao diminuir muito o mapa, exibe quantidade em círculo com fundo laranja escuro e número em preto
      // Ao dar zoom (ou clicar no número), volta a exibir o pin individual de cada veículo
      const elementos = clusterizarVeiculos(veiculos, zoomAtual);

      elementos.forEach((item) => {
        if (item.tipo === "cluster") {
          const c = item.cluster;
          idsClustersAtivos.add(c.id);

          const existente = clusterMarkersRef.current[c.id];
          if (existente) {
            existente.setLngLat([c.longitude, c.latitude]);
            existente.getElement().innerHTML = gerarMarcadorClusterHtml(c.quantidade);
          } else {
            const elDiv = document.createElement("div");
            elDiv.className = "hunter-cluster-marker-3d cursor-pointer select-none";
            elDiv.innerHTML = gerarMarcadorClusterHtml(c.quantidade);
            elDiv.addEventListener("click", (e) => {
              e.stopPropagation();
              if (c.bounds[0][0] !== c.bounds[1][0] || c.bounds[0][1] !== c.bounds[1][1]) {
                const bounds = new maplibregl.LngLatBounds(
                  [c.bounds[0][1], c.bounds[0][0]],
                  [c.bounds[1][1], c.bounds[1][0]],
                );
                map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 1000 });
              } else {
                map.flyTo({
                  center: [c.longitude, c.latitude],
                  zoom: Math.min(map.getZoom() + 3, 16),
                  duration: 1000,
                });
              }
            });

            const marker = new maplibregl.Marker({ element: elDiv })
              .setLngLat([c.longitude, c.latitude])
              .addTo(map);
            clusterMarkersRef.current[c.id] = marker;
          }
          return;
        }

        const v = item.veiculo;
        if (!coordenadaValidaMapa(v.latitude, v.longitude)) {
          return;
        }
        idsVeiculosAtivos.add(v.id);

        const isSelected = veiculoSelecionado?.id === v.id;
        const isBloqueado = v.bloqueado;
        const isEmRota = v.status_operacional === "em_rota" || (v.velocidade ?? 0) > 3;
        const isParadoLigado = v.status_operacional === "parado_ligado";
        const temAlerta = v.alerta_acidente;
        const statusCom = avaliarStatusComunicacao(v.ultima_atualizacao);
        const isOffline = !statusCom.ativo;

        const corStatus = obterCorStatusVeiculo(v);

        const anguloRumo = obterRumoVeiculo(v);
        const estado = controlador.atualizarDestino({
          id: v.id,
          latitude: v.latitude,
          longitude: v.longitude,
          rumo: anguloRumo,
          velocidadeKmh: v.velocidade ?? 0,
          ignicao: Boolean(v.ignicao),
          bloqueado: Boolean(v.bloqueado),
          online: !isOffline,
          ultimaAtualizacaoIso: v.ultima_atualizacao,
        });

        const visualKey = criarChaveVisualMarcador({
          placa: v.placa,
          chassi: v.chassi,
          tipo: v.tipo_veiculo,
          corStatus,
          isSelected,
          temAlerta,
          isEmRota,
          iconeGenerico: isGenerico,
          mostrarPlaca,
        });

        const entry = markersRef.current[v.id];
        const tipoEsperado: "generico" | "modelo" = isGenerico ? "generico" : "modelo";

        // Integração VehicleMotionController (MapLibre 6.10.0 [lng, lat] em onFrame - loop 1500ms easeOutCubic)
        let motionCtrl = vehicleMotionControllersRef.current.get(v.id);
        if (!motionCtrl) {
          motionCtrl = new VehicleMotionController(
            { lat: v.latitude, lng: v.longitude },
            (frameState) => {
              const entryAtual = markersRef.current[v.id];
              if (entryAtual?.marker) {
                entryAtual.marker.setLngLat([frameState.lng, frameState.lat]);
                atualizarRotacaoElementoMarcador(
                  entryAtual.marker.getElement(),
                  frameState.bearing,
                );

                const map = mapInstanceRef.current;
                const agora = typeof performance !== "undefined" ? performance.now() : Date.now();
                const emVooProgramatico = agora < programmaticFlyUntilRef.current;
                const isFocado =
                  veiculoSelecionadoIdRef.current === v.id ||
                  (Boolean(v.placa) && veiculoSelecionadoRef.current?.placa === v.placa) ||
                  (Boolean((v as any).imei) &&
                    (veiculoSelecionadoRef.current as any)?.imei === (v as any).imei);

                if (map && seguindoCameraRef.current && isFocado && !emVooProgramatico) {
                  map.jumpTo({ center: [frameState.lng, frameState.lat] });
                }
              }
            },
            anguloRumo,
          );
          vehicleMotionControllersRef.current.set(v.id, motionCtrl);
        } else {
          // Mantém buffer dos últimos 4 pontos válidos por veículo
          let buffer = bufferPontosRecentesRef.current.get(v.id) || [];
          const novoPonto = {
            lat: v.latitude,
            lng: v.longitude,
            timestamp: v.ultima_atualizacao ? new Date(v.ultima_atualizacao).getTime() : Date.now(),
          };

          const ultimoPontoBuffer = buffer[buffer.length - 1];
          const distAoUltimo = ultimoPontoBuffer
            ? haversineMeters(ultimoPontoBuffer, novoPonto)
            : 999;

          if (distAoUltimo >= 1.0) {
            buffer = [...buffer, novoPonto];
            if (buffer.length > 4) buffer = buffer.slice(-4);
            bufferPontosRecentesRef.current.set(v.id, buffer);
          }

          // Regras estritas de disparo de Map Matching (snap-to-road):
          // 1. Veículo está selecionado/focado na tela
          const isFocado =
            veiculoSelecionadoIdRef.current === v.id ||
            (Boolean(v.placa) && veiculoSelecionadoRef.current?.placa === v.placa) ||
            (Boolean((v as any).imei) &&
              (veiculoSelecionadoRef.current as any)?.imei === (v as any).imei);

          // 2. Em movimento (velocidade > 3 ou distância > 15m)
          const emMovimento =
            (typeof v.velocidade === "number" && v.velocidade > 3) || distAoUltimo > 15;

          // 3. Zoom >= 14
          const zoomAtualNum = mapInstanceRef.current?.getZoom() ?? zoomAtual ?? 0;
          const zoomAdequado = zoomAtualNum >= 14;

          // 4. Ativo é veículo (nunca disparar para dispositivos portáteis/vigilantes a pé)
          const tipoNorm = String((v as any).tipo_veiculo || (v as any).tipo || "").toLowerCase();
          const ehVeiculoValido =
            !tipoNorm.includes("pessoa") &&
            !tipoNorm.includes("pedestre") &&
            !tipoNorm.includes("vigilante") &&
            !tipoNorm.includes("portatil") &&
            !tipoNorm.includes("propriedade");

          const deveDispararSnap =
            isFocado && emMovimento && zoomAdequado && ehVeiculoValido && buffer.length >= 2;

          if (deveDispararSnap) {
            const ctrlAnterior = abortSnapControllersRef.current.get(v.id);
            if (ctrlAnterior) ctrlAnterior.abort();
            const abortCtrl = new AbortController();
            abortSnapControllersRef.current.set(v.id, abortCtrl);

            const pontosSnapshot = [...buffer];
            requisitarSnapToRoad(pontosSnapshot, abortCtrl.signal)
              .then((vertices) => {
                const mc = vehicleMotionControllersRef.current.get(v.id);
                if (mc) {
                  mc.updateTarget(
                    { lat: v.latitude, lng: v.longitude },
                    v.ultima_atualizacao,
                    vertices || undefined,
                  );
                }
              })
              .catch(() => {
                const mc = vehicleMotionControllersRef.current.get(v.id);
                if (mc) {
                  mc.updateTarget({ lat: v.latitude, lng: v.longitude }, v.ultima_atualizacao);
                }
              });
          } else {
            motionCtrl.updateTarget({ lat: v.latitude, lng: v.longitude }, v.ultima_atualizacao);
          }
        }

        if (entry && entry.tipo === tipoEsperado && entry.marker) {
          entry.veiculoAtual = v;
          if (entry.visualKey !== visualKey) {
            entry.marker.getElement().innerHTML = gerarMarcador3DHtml({
              placa: v.placa,
              chassi: v.chassi,
              tipo: v.tipo_veiculo,
              corStatus,
              anguloRumo: estado.headingContinuous,
              isSelected,
              temAlerta,
              isEmRota,
              iconeGenerico: isGenerico,
              mostrarPlaca,
            });
            entry.visualKey = visualKey;
          } else {
            atualizarRotacaoElementoMarcador(entry.marker.getElement(), estado.headingContinuous);
          }
          return;
        }

        // Remove marcador anterior caso tenha trocado o tipo visual (genérico vs veículo 3D)
        if (entry?.marker) {
          entry.marker.remove();
        }

        const el = document.createElement("div");
        el.className = isGenerico
          ? "hunter-marker-generico-flutuante cursor-pointer select-none"
          : "hunter-marker-3d cursor-pointer select-none";
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";
        el.style.justifyContent = "flex-end";

        el.innerHTML = gerarMarcador3DHtml({
          placa: v.placa,
          chassi: v.chassi,
          tipo: v.tipo_veiculo,
          corStatus,
          anguloRumo: estado.headingContinuous,
          isSelected,
          temAlerta,
          isEmRota,
          iconeGenerico: isGenerico,
          mostrarPlaca,
        });

        el.addEventListener("click", () => {
          seguindoCameraRef.current = true;
          programmaticFlyUntilRef.current = 0;
          const atual = markersRef.current[v.id]?.veiculoAtual ?? v;
          onSelectVeiculoRef.current(atual);
        });

        const marker = new maplibregl.Marker({
          element: el,
          anchor: "bottom", // Ponta do pino ancorada exatamente na coordenada da rua
          rotationAlignment: "viewport",
          pitchAlignment: "viewport",
          rotation: 0,
        })
          .setLngLat([v.longitude, v.latitude])
          .addTo(map);

        markersRef.current[v.id] = {
          tipo: tipoEsperado,
          marker,
          visualKey,
          veiculoAtual: v,
        };
      });

      // Remove marcadores de veículos que não estão mais presentes ou que foram agrupados no cluster
      Object.keys(markersRef.current).forEach((id) => {
        if (!idsVeiculosAtivos.has(id)) {
          const entry = markersRef.current[id];
          if (entry?.marker) entry.marker.remove();
          delete markersRef.current[id];
          const mc = vehicleMotionControllersRef.current.get(id);
          if (mc) {
            mc.destroy();
            vehicleMotionControllersRef.current.delete(id);
          }
          const snapCtrl = abortSnapControllersRef.current.get(id);
          if (snapCtrl) {
            snapCtrl.abort();
            abortSnapControllersRef.current.delete(id);
          }
          bufferPontosRecentesRef.current.delete(id);
        }
      });

      // Remove marcadores de clusters que não estão mais presentes
      Object.keys(clusterMarkersRef.current).forEach((id) => {
        if (!idsClustersAtivos.has(id)) {
          const clusterMarker = clusterMarkersRef.current[id];
          if (clusterMarker) clusterMarker.remove();
          delete clusterMarkersRef.current[id];
        }
      });

      controlador.removerVeiculosAusentes(idsVeiculosAtivos);
    }, [
      veiculos,
      veiculoSelecionado?.id,
      versaoPreferencia,
      zoomAtual,
      sincronizarQuadrosMapLibre,
    ]);

    // Atualiza orientação dos veículos ao rotacionar a câmera do mapa 3D (bearing) ou quando o rumo for calibrado
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const handleRotate = () => {
        // Com rotationAlignment: "map", o MapLibre rotaciona o marcador automaticamente com a câmera
      };

      const handleRumoAtualizado = (evt: Event) => {
        const customEvt = evt as CustomEvent<{ veiculoId: string; placa: string; rumo: number }>;
        const vId = customEvt.detail?.veiculoId;
        const vPlaca = customEvt.detail?.placa;
        const novoRumo = customEvt.detail?.rumo ?? 0;

        const targetV = veiculosRef.current.find((x) => x.id === vId || x.placa === vPlaca);
        if (targetV) {
          const entry = markersRef.current[targetV.id];
          if (entry?.marker) {
            const estadoAtual = controladorMovimentoRef.current.obterEstado(targetV.id);
            let anguloAlvo = novoRumo;
            if (estadoAtual) {
              const atualizado = controladorMovimentoRef.current.atualizarDestino({
                id: targetV.id,
                latitude: estadoAtual.targetLat,
                longitude: estadoAtual.targetLng,
                rumo: novoRumo,
                velocidadeKmh: estadoAtual.velocidadeKmh,
                ignicao: estadoAtual.ignicao,
                bloqueado: estadoAtual.bloqueado,
                online: estadoAtual.online,
                ultimaAtualizacaoIso: estadoAtual.ultimaAtualizacaoIso,
              });
              anguloAlvo = atualizado.headingContinuous;
            }
            atualizarRotacaoElementoMarcador(entry.marker.getElement(), anguloAlvo);
          }
        }
      };

      map.on("rotate", handleRotate);
      if (typeof window !== "undefined") {
        window.addEventListener("sigo:rumo-veiculo-atualizado", handleRumoAtualizado);
      }
      return () => {
        map.off("rotate", handleRotate);
        if (typeof window !== "undefined") {
          window.removeEventListener("sigo:rumo-veiculo-atualizado", handleRumoAtualizado);
        }
      };
    }, []);

    // Renderização e Atualização da Rota Monitorada Ativa no MapLibre 3D
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const sourceId = "hunter-rota-monitorada-source";
      const layerCorredorId = "hunter-rota-monitorada-corredor";
      const layerLinhaId = "hunter-rota-monitorada-linha";

      let cancelado = false;

      const safeRemoveLayersAndSource = () => {
        try {
          if (!map.isStyleLoaded()) return;
          if (map.getLayer(layerLinhaId)) map.removeLayer(layerLinhaId);
          if (map.getLayer(layerCorredorId)) map.removeLayer(layerCorredorId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch {
          // Seguro contra estilos em transição
        }
      };

      if (
        !rotaMonitorada ||
        !rotaMonitorada.coordenadas_rota ||
        rotaMonitorada.coordenadas_rota.length < 2
      ) {
        safeRemoveLayersAndSource();
        return;
      }

      const renderizarGeoJsonRota = (coordsBrutas: [number, number][]) => {
        if (cancelado) return;

        try {
          // Se o estilo ainda não terminou de carregar, agenda para quando o evento disparar
          if (!map.isStyleLoaded()) {
            map.once("styledata", () => {
              if (!cancelado) renderizarGeoJsonRota(coordsBrutas);
            });
            return;
          }

          const coordinates = normalizarListaCoordenadas(coordsBrutas, "lon_lat");

          const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          };

          // Avalia estado do veículo em relação à rota
          const vAlvo =
            veiculoSelecionado && veiculoSelecionado.id === rotaMonitorada.veiculo_id
              ? veiculoSelecionado
              : veiculos.find((v) => v.id === rotaMonitorada.veiculo_id) || veiculoSelecionado;

          let estadoCromatico: "normal" | "atencao" | "desvio_critico" = "normal";
          let caminhoRetomada: [number, number][] = [];

          if (
            vAlvo &&
            typeof vAlvo.latitude === "number" &&
            typeof vAlvo.longitude === "number" &&
            vAlvo.latitude !== 0 &&
            vAlvo.longitude !== 0
          ) {
            const coordsLatLon = normalizarListaCoordenadas(coordsBrutas, "lat_lon");
            const dinamica = avaliarEstadoRotaDinamica(vAlvo.latitude, vAlvo.longitude, {
              ...rotaMonitorada,
              coordenadas_rota: coordsLatLon,
            } as any);
            estadoCromatico = dinamica.estadoCromatico;
            caminhoRetomada = dinamica.caminhoRetomada;
          } else if (rotaMonitorada.desvio_detectado) {
            estadoCromatico = "desvio_critico";
          }

          let corGuia = "#0284c7";
          let corCorredor = "#00e5ff";
          if (estadoCromatico === "desvio_critico") {
            corGuia = "#ef4444";
            corCorredor = "#b91c1c";
          } else if (estadoCromatico === "atencao") {
            corGuia = "#d97706";
            corCorredor = "#f59e0b";
          }

          const source = map.getSource(sourceId) as any;
          if (source) {
            source.setData(geojsonData);
            if (map.getLayer(layerLinhaId)) {
              map.setPaintProperty(layerLinhaId, "line-color", corGuia);
            }
            if (map.getLayer(layerCorredorId)) {
              map.setPaintProperty(layerCorredorId, "line-color", corCorredor);
              map.setPaintProperty(
                layerCorredorId,
                "line-opacity",
                estadoCromatico === "normal" ? 0.4 : 0.45,
              );
            }
          } else {
            map.addSource(sourceId, {
              type: "geojson",
              data: geojsonData,
            });

            // Faixa de Tolerância (Glow Cintilante Waze)
            if (!map.getLayer(layerCorredorId)) {
              map.addLayer({
                id: layerCorredorId,
                type: "line",
                source: sourceId,
                layout: {
                  "line-join": "round",
                  "line-cap": "round",
                },
                paint: {
                  "line-color": corCorredor,
                  "line-width": 16,
                  "line-opacity": estadoCromatico === "normal" ? 0.4 : 0.45,
                },
              });
            }

            // Linha Guia Central da Rota
            if (!map.getLayer(layerLinhaId)) {
              map.addLayer({
                id: layerLinhaId,
                type: "line",
                source: sourceId,
                layout: {
                  "line-join": "round",
                  "line-cap": "round",
                },
                paint: {
                  "line-color": corGuia,
                  "line-width": 5.5,
                  "line-opacity": 0.98,
                },
              });
            }
          }

          // Rota de Retomada em Verde se estiver em desvio crítico
          const retomadaSourceId = "hunter-rota-retomada-source";
          const retomadaCorredorId = "hunter-rota-retomada-corredor";
          const retomadaLinhaId = "hunter-rota-retomada-linha";

          if (estadoCromatico === "desvio_critico" && caminhoRetomada.length >= 2) {
            const coordsRetomadaLonLat = normalizarListaCoordenadas(caminhoRetomada, "lon_lat");
            const geojsonRetomada: GeoJSON.Feature<GeoJSON.LineString> = {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: coordsRetomadaLonLat,
              },
            };

            const srcRetomada = map.getSource(retomadaSourceId) as any;
            if (srcRetomada) {
              srcRetomada.setData(geojsonRetomada);
            } else {
              map.addSource(retomadaSourceId, {
                type: "geojson",
                data: geojsonRetomada,
              });

              if (!map.getLayer(retomadaCorredorId)) {
                map.addLayer({
                  id: retomadaCorredorId,
                  type: "line",
                  source: retomadaSourceId,
                  layout: { "line-join": "round", "line-cap": "round" },
                  paint: {
                    "line-color": "#10b981",
                    "line-width": 14,
                    "line-opacity": 0.45,
                  },
                });
              }

              if (!map.getLayer(retomadaLinhaId)) {
                map.addLayer({
                  id: retomadaLinhaId,
                  type: "line",
                  source: retomadaSourceId,
                  layout: { "line-join": "round", "line-cap": "round" },
                  paint: {
                    "line-color": "#10b981",
                    "line-width": 6,
                    "line-opacity": 0.98,
                  },
                });
              }
            }
          } else {
            // Remove camada de retomada se não estiver em desvio crítico
            if (map.getLayer(retomadaLinhaId)) map.removeLayer(retomadaLinhaId);
            if (map.getLayer(retomadaCorredorId)) map.removeLayer(retomadaCorredorId);
            if (map.getSource(retomadaSourceId)) map.removeSource(retomadaSourceId);
          }
        } catch (err) {
          console.warn("Aviso seguro ao renderizar rota MapLibre:", err);
        }
      };

      if (map.isStyleLoaded()) {
        renderizarGeoJsonRota(rotaMonitorada.coordenadas_rota);
      } else {
        map.once("load", () => {
          if (!cancelado) renderizarGeoJsonRota(rotaMonitorada.coordenadas_rota);
        });
      }

      // Autocura se tiver menos de 50 pontos: substitui instantaneamente a reta pelas ruas reais
      if (rotaMonitorada.coordenadas_rota.length < 50) {
        enriquecerTrajetoComMalhaViaria(rotaMonitorada.coordenadas_rota)
          .then((viarias) => {
            if (!cancelado && viarias && viarias.length > rotaMonitorada.coordenadas_rota.length) {
              renderizarGeoJsonRota(viarias);
            }
          })
          .catch(() => {});
      }

      return () => {
        cancelado = true;
      };
    }, [rotaMonitorada, styleLoaded, veiculoSelecionado, veiculos]);

    // Centraliza com voo 3D apenas quando o veículo selecionado mudar (preserva zoom, pitch e arraste do usuário)
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (!veiculoSelecionado) {
        selectedIdAnteriorRef.current = null;
        return;
      }

      seguindoCameraRef.current = true;

      if (selectedIdAnteriorRef.current === veiculoSelecionado.id) {
        return;
      }

      if (coordenadaValidaMapa(veiculoSelecionado.latitude, veiculoSelecionado.longitude)) {
        selectedIdAnteriorRef.current = veiculoSelecionado.id;
        const estado = controladorMovimentoRef.current.obterEstado(veiculoSelecionado.id);
        const latAlvo = estado ? estado.visualLat : veiculoSelecionado.latitude;
        const lngAlvo = estado ? estado.visualLng : veiculoSelecionado.longitude;
        programmaticFlyUntilRef.current =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1150;
        map.flyTo({
          center: [lngAlvo, latAlvo],
          zoom: Math.max(map.getZoom(), 18),
          pitch: 60,
          bearing: veiculoSelecionado.rumo || 0,
          duration: 1000,
          essential: true,
        });
      }
    }, [veiculoSelecionado]);

    return (
      <div
        className={`w-full h-full relative z-0 overflow-hidden ${theme === "dark" ? "hunter-dark-tiles" : ""}`}
      >
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    );
  },
);
