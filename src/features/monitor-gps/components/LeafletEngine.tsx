import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { VeiculoGps, MapTheme } from "../types";
import {
  normalizarListaCoordenadas,
  avaliarEstadoRotaDinamica,
} from "../services/rotaMonitoradaService";
import { enriquecerTrajetoComMalhaViaria } from "../services/trajetoInteligenteService";
import {
  gerarMarcador3DHtml,
  deveExibirPlacaNoMapa,
  formatarPlacaOuChassi,
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

export interface LeafletEngineHandle {
  fitBounds: (veiculosAlvo?: VeiculoGps[]) => void;
  centralizarVeiculo: (v: VeiculoGps) => void;
}

interface LeafletEngineProps {
  veiculos: VeiculoGps[];
  theme: MapTheme;
  trafegoAtivo?: boolean;
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

export const LeafletEngine = forwardRef<LeafletEngineHandle, LeafletEngineProps>(
  function LeafletEngine(
    { veiculos, theme, trafegoAtivo = false, veiculoSelecionado, onSelectVeiculo, rotaMonitorada },
    ref,
  ) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const trafficLayerRef = useRef<L.TileLayer | null>(null);
    const markersGroupRef = useRef<L.LayerGroup | null>(null);
    const rotaGroupRef = useRef<L.LayerGroup | null>(null);
    const markersMapRef = useRef<
      Map<
        string,
        {
          marker: L.Marker;
          visualKey: string;
          popupKey: string;
          veiculoAtual: VeiculoGps;
        }
      >
    >(new Map());
    const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
    const [zoomAtual, setZoomAtual] = useState(14);
    const controladorMovimentoRef = useRef<ControladorMovimentoSuave>(
      new ControladorMovimentoSuave(),
    );
    const onSelectVeiculoRef = useRef(onSelectVeiculo);
    onSelectVeiculoRef.current = onSelectVeiculo;
    const veiculoSelecionadoIdRef = useRef<string | null>(veiculoSelecionado?.id ?? null);
    veiculoSelecionadoIdRef.current = veiculoSelecionado?.id ?? null;
    const selectedIdAnteriorRef = useRef<string | null>(null);
    const seguindoCameraRef = useRef<boolean>(true);
    const userDraggingRef = useRef<boolean>(false);
    const ultimoPanFollowMsRef = useRef<number>(0);
    const [versaoPreferencia, setVersaoPreferencia] = useState(0);

    useEffect(() => {
      const handlePreferencia = () => setVersaoPreferencia((p) => p + 1);
      window.addEventListener("hunter_preferencia_mapa_alterada", handlePreferencia);
      return () =>
        window.removeEventListener("hunter_preferencia_mapa_alterada", handlePreferencia);
    }, []);
    const veiculosRef = useRef(veiculos);
    veiculosRef.current = veiculos;

    // Ajusta a visão para abranger todos os veículos sem deixar nenhum de fora
    const ajustarVisaoFrota = (veiculosAlvo?: VeiculoGps[]) => {
      const map = mapInstanceRef.current;
      const frota = veiculosAlvo && veiculosAlvo.length > 0 ? veiculosAlvo : veiculosRef.current;
      if (!map || frota.length === 0) return;

      const pontosValidos = frota.filter((v) => coordenadaValidaMapa(v.latitude, v.longitude));

      if (pontosValidos.length === 1) {
        map.setView([pontosValidos[0].latitude, pontosValidos[0].longitude], 16, {
          animate: true,
        });
      } else if (pontosValidos.length > 1) {
        const bounds = L.latLngBounds(pontosValidos.map((v) => [v.latitude, v.longitude]));
        // Padding generoso de 80px para garantir que veículos nas bordas ou distantes nunca fiquem fora da visão
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
      }
    };

    const sincronizarQuadrosLeaflet = useCallback((agoraMs: number) => {
      const map = mapInstanceRef.current;
      const controlador = controladorMovimentoRef.current;

      for (const [id, dados] of markersMapRef.current.entries()) {
        const estado = controlador.obterEstado(id);
        if (!estado) continue;

        dados.marker.setLatLng([estado.visualLat, estado.visualLng]);
        atualizarRotacaoElementoMarcador(dados.marker.getElement(), estado.headingContinuous);

        if (
          map &&
          seguindoCameraRef.current &&
          veiculoSelecionadoIdRef.current === id &&
          !userDraggingRef.current &&
          !(map as any)._animatingZoom &&
          agoraMs - ultimoPanFollowMsRef.current >= 320
        ) {
          try {
            const centroPx = map.latLngToContainerPoint(map.getCenter());
            const marcadorPx = map.latLngToContainerPoint([estado.visualLat, estado.visualLng]);
            const distPx = Math.hypot(centroPx.x - marcadorPx.x, centroPx.y - marcadorPx.y);
            if (distPx > 22) {
              ultimoPanFollowMsRef.current = agoraMs;
              map.panTo([estado.visualLat, estado.visualLng], {
                animate: true,
                duration: 0.35,
                easeLinearity: 1,
                noMoveStart: true,
              });
            }
          } catch {
            // Mapa em transição de layout
          }
        }
      }
    }, []);

    useImperativeHandle(ref, () => ({
      fitBounds: ajustarVisaoFrota,
      centralizarVeiculo: (v: VeiculoGps) => {
        if (mapInstanceRef.current && coordenadaValidaMapa(v?.latitude, v?.longitude)) {
          seguindoCameraRef.current = true;
          selectedIdAnteriorRef.current = v.id;
          const estado = controladorMovimentoRef.current.obterEstado(v.id);
          const latAlvo = estado ? estado.visualLat : v.latitude;
          const lngAlvo = estado ? estado.visualLng : v.longitude;
          const zoomAtual = mapInstanceRef.current.getZoom();
          mapInstanceRef.current.setView([latAlvo, lngAlvo], Math.max(zoomAtual, 16), {
            animate: true,
          });
        }
      },
    }));

    // Inicialização do mapa com suporte a dispositivos móveis
    useEffect(() => {
      if (!mapContainerRef.current) return;

      let resizeObserver: ResizeObserver | null = null;
      const timers: NodeJS.Timeout[] = [];
      const controlador = controladorMovimentoRef.current;

      if (!mapInstanceRef.current) {
        const primeiroValido = veiculosRef.current.find((v) =>
          coordenadaValidaMapa(v.latitude, v.longitude),
        );
        const initialLat = primeiroValido?.latitude ?? -22.5235;
        const initialLng = primeiroValido?.longitude ?? -44.1042;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 14,
          maxZoom: 21,
          zoomControl: false,
          attributionControl: false,
        });

        L.control.zoom({ position: "bottomright" }).addTo(map);

        map.on("dragstart", () => {
          userDraggingRef.current = true;
          seguindoCameraRef.current = false;
        });
        map.on("dragend", () => {
          userDraggingRef.current = false;
        });
        map.on("zoomend", () => {
          setZoomAtual(map.getZoom());
        });

        mapInstanceRef.current = map;
        markersGroupRef.current = L.layerGroup().addTo(map);
        rotaGroupRef.current = L.layerGroup().addTo(map);

        // Suporte robusto a dispositivos móveis:
        // Disparos escalonados garantem que os tiles do mapa carreguem mesmo com renderização assíncrona da viewport móvel
        const disparos = [50, 200, 500, 1000];
        disparos.forEach((ms) => {
          const t = setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize({ pan: false });
            }
          }, ms);
          timers.push(t);
        });

        // Observador de redimensionamento contínuo para rotação e gavetas no mobile
        if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize({ pan: false });
            }
          });
          resizeObserver.observe(mapContainerRef.current);
        }
      }

      return () => {
        controlador.limpar();
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

    // Atualização de Camadas e Provedores de Mapa (Sem marcas d'água de erro e sem quebra no zoom)
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }

      let newTileLayer: L.TileLayer;

      if (theme === "satellite") {
        // Satélite Real Esri com maxNativeZoom para permitir zoom 19, 20 e 21 sem tela cinza
        newTileLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 21,
            maxNativeZoom: 18,
          },
        );
      } else if (theme === "streets") {
        // Ruas OpenStreetMap claro e nítido (balanceado com subdomínios a, b, c e overzoom suave)
        newTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          subdomains: ["a", "b", "c"],
          maxZoom: 21,
          maxNativeZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        });
      } else {
        // Noturno Tático OpenStreetMap com filtro militar dark (balanceado com subdomínios a, b, c e overzoom suave)
        newTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          subdomains: ["a", "b", "c"],
          maxZoom: 21,
          maxNativeZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        });
      }

      newTileLayer.addTo(map);
      tileLayerRef.current = newTileLayer;

      // Força o Leaflet a recalcular a viewport e carregar tiles imediatamente na troca de camada
      map.invalidateSize({ pan: false });
      const timerA = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ pan: false });
        }
      }, 50);
      const timerB = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ pan: false });
        }
      }, 150);

      return () => {
        clearTimeout(timerA);
        clearTimeout(timerB);
      };
    }, [theme]);

    // Camada de Tráfego / Trânsito
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (trafficLayerRef.current) {
        map.removeLayer(trafficLayerRef.current);
        trafficLayerRef.current = null;
      }

      if (trafegoAtivo) {
        // Overlay de linhas de fluxo de tráfego e trânsito em tempo real
        const trafficLayer = L.tileLayer(
          "https://mt{s}.google.com/vt?lyrs=h,traffic&x={x}&y={y}&z={z}",
          {
            subdomains: ["0", "1", "2", "3"],
            opacity: 0.85,
            maxZoom: 21,
            maxNativeZoom: 19,
          },
        );
        trafficLayer.addTo(map);
        trafficLayerRef.current = trafficLayer;
      }
    }, [trafegoAtivo]);

    // Atualização dos Marcadores Táticos com Rumo, Status e Deslocamento Fluido a 60 FPS
    useEffect(() => {
      const map = mapInstanceRef.current;
      const markersGroup = markersGroupRef.current;
      if (!map || !markersGroup) return;

      const controlador = controladorMovimentoRef.current;
      const isGenerico = localStorage.getItem("@hunter_icone_mapa_generico") === "true";
      const mostrarPlaca = deveExibirPlacaNoMapa(veiculos.length);
      const idsVeiculosAtivos = new Set<string>();
      const idsClustersAtivos = new Set<string>();

      // Agrupamento tático conforme solicitação:
      // Ao diminuir muito o mapa, exibe quantidade em círculo com fundo laranja escuro e número em preto
      // Ao dar zoom (ou clicar no número), volta a exibir o pin individual de cada veículo
      const elementos = clusterizarVeiculos(veiculos, zoomAtual);

      elementos.forEach((el) => {
        if (el.tipo === "cluster") {
          const c = el.cluster;
          idsClustersAtivos.add(c.id);

          const clusterTamanho = c.quantidade > 99 ? 50 : c.quantidade > 9 ? 46 : 42;
          const divIcon = L.divIcon({
            html: gerarMarcadorClusterHtml(c.quantidade),
            className: "custom-hunter-cluster-marker",
            iconSize: [clusterTamanho, clusterTamanho],
            iconAnchor: [clusterTamanho / 2, clusterTamanho / 2],
          });

          const existente = clusterMarkersRef.current.get(c.id);
          if (existente) {
            existente.setLatLng([c.latitude, c.longitude]);
            existente.setIcon(divIcon);
            if (!markersGroup.hasLayer(existente)) {
              markersGroup.addLayer(existente);
            }
          } else {
            const marker = L.marker([c.latitude, c.longitude], {
              icon: divIcon,
              zIndexOffset: 1000,
            });
            marker.on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              if (c.bounds[0][0] !== c.bounds[1][0] || c.bounds[0][1] !== c.bounds[1][1]) {
                const bounds = L.latLngBounds(c.bounds);
                map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
              } else {
                map.setView([c.latitude, c.longitude], Math.min(map.getZoom() + 3, 16), {
                  animate: true,
                });
              }
            });
            marker.addTo(markersGroup);
            clusterMarkersRef.current.set(c.id, marker);
          }
          return;
        }

        const v = el.veiculo;
        if (!coordenadaValidaMapa(v.latitude, v.longitude)) {
          return;
        }
        idsVeiculosAtivos.add(v.id);

        const isSelected = veiculoSelecionado?.id === v.id;
        const isBloqueado = v.bloqueado;
        const isEmRota = v.status_operacional === "em_rota";
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

        const idFormatado = formatarPlacaOuChassi(v.placa, v.chassi);
        const popupKey = `${idFormatado}|${v.marca_modelo}|${v.cliente_nome || ""}|${v.velocidade}|${v.ignicao ? 1 : 0}`;

        const criarPopupHtml = () => `
            <div style="font-family: sans-serif; font-size: 12px; color: #0F172A; padding: 2px;">
              <div style="font-weight: bold; font-size: 13px;">${idFormatado} · ${v.marca_modelo}</div>
              <div style="color: #64748B; font-size: 11px;">${v.cliente_nome || "Cliente"}</div>
              <div style="margin-top: 4px; display: flex; gap: 8px;">
                <span>Velocidade: <b>${v.velocidade} km/h</b></span>
                <span>Ignição: <b>${v.ignicao ? "Ligada" : "Desligada"}</b></span>
              </div>
            </div>
          `;

        const criarDivIcon = () => {
          const iconeHtml = gerarMarcador3DHtml({
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

          return L.divIcon({
            html: iconeHtml,
            className: "custom-hunter-marker",
            iconSize: mostrarPlaca ? [56, 72] : [50, 54],
            iconAnchor: mostrarPlaca ? [28, 72] : [25, 54],
          });
        };

        const dadosAnteriores = markersMapRef.current.get(v.id);

        if (dadosAnteriores) {
          dadosAnteriores.veiculoAtual = v;
          if (!markersGroup.hasLayer(dadosAnteriores.marker)) {
            markersGroup.addLayer(dadosAnteriores.marker);
          }
          dadosAnteriores.marker.setLatLng([estado.visualLat, estado.visualLng]);
          if (dadosAnteriores.visualKey !== visualKey) {
            dadosAnteriores.marker.setIcon(criarDivIcon());
            dadosAnteriores.visualKey = visualKey;
          } else {
            atualizarRotacaoElementoMarcador(
              dadosAnteriores.marker.getElement(),
              estado.headingContinuous,
            );
          }
          if (dadosAnteriores.popupKey !== popupKey) {
            dadosAnteriores.marker.setPopupContent(criarPopupHtml());
            dadosAnteriores.popupKey = popupKey;
          }
        } else {
          // Cria novo marcador tático
          const marker = L.marker([estado.visualLat, estado.visualLng], { icon: criarDivIcon() });
          marker.bindPopup(criarPopupHtml(), { offset: [0, -15] });

          marker.on("click", () => {
            const atual = markersMapRef.current.get(v.id)?.veiculoAtual ?? v;
            onSelectVeiculoRef.current(atual);
          });

          marker.addTo(markersGroup);
          markersMapRef.current.set(v.id, {
            marker,
            visualKey,
            popupKey,
            veiculoAtual: v,
          });
        }
      });

      // Remove marcadores de veículos que não estão mais presentes ou que foram agrupados no cluster
      for (const [id, dados] of markersMapRef.current.entries()) {
        if (!idsVeiculosAtivos.has(id)) {
          markersGroup.removeLayer(dados.marker);
          markersMapRef.current.delete(id);
        }
      }

      // Remove marcadores de clusters que não estão mais presentes
      for (const [id, marker] of clusterMarkersRef.current.entries()) {
        if (!idsClustersAtivos.has(id)) {
          markersGroup.removeLayer(marker);
          clusterMarkersRef.current.delete(id);
        }
      }

      controlador.removerVeiculosAusentes(idsVeiculosAtivos);
      controlador.agendarLoop(sincronizarQuadrosLeaflet);
    }, [veiculos, veiculoSelecionado?.id, versaoPreferencia, zoomAtual, sincronizarQuadrosLeaflet]);

    // Listener reativo para atualizar a rotação do veículo assim que a geometria da rua for calculada
    useEffect(() => {
      const handleRumoAtualizado = (e: Event) => {
        const custom = e as CustomEvent<{ veiculoId: string; rumo: number }>;
        if (!custom.detail) return;
        const { veiculoId, rumo } = custom.detail;
        const dados = markersMapRef.current.get(veiculoId);
        if (dados && dados.marker) {
          const estadoAtual = controladorMovimentoRef.current.obterEstado(veiculoId);
          let anguloAlvo = rumo;
          if (estadoAtual && dados.veiculoAtual) {
            const atualizado = controladorMovimentoRef.current.atualizarDestino({
              id: veiculoId,
              latitude: estadoAtual.targetLat,
              longitude: estadoAtual.targetLng,
              rumo,
              velocidadeKmh: estadoAtual.velocidadeKmh,
              ignicao: estadoAtual.ignicao,
              bloqueado: estadoAtual.bloqueado,
              online: estadoAtual.online,
              ultimaAtualizacaoIso: estadoAtual.ultimaAtualizacaoIso,
            });
            anguloAlvo = atualizado.headingContinuous;
          }
          atualizarRotacaoElementoMarcador(dados.marker.getElement(), anguloAlvo);
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener("sigo:rumo-veiculo-atualizado", handleRumoAtualizado);
      }
      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("sigo:rumo-veiculo-atualizado", handleRumoAtualizado);
        }
      };
    }, []);

    // Centraliza apenas quando o veículo selecionado muda (preserva zoom e arraste livre do usuário)
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (!veiculoSelecionado) {
        selectedIdAnteriorRef.current = null;
        return;
      }

      if (selectedIdAnteriorRef.current === veiculoSelecionado.id) {
        return;
      }

      const lat = veiculoSelecionado.latitude;
      const lon = veiculoSelecionado.longitude;

      if (coordenadaValidaMapa(lat, lon)) {
        selectedIdAnteriorRef.current = veiculoSelecionado.id;
        seguindoCameraRef.current = true;
        const estado = controladorMovimentoRef.current.obterEstado(veiculoSelecionado.id);
        const latAlvo = estado ? estado.visualLat : lat;
        const lonAlvo = estado ? estado.visualLng : lon;
        map.setView([latAlvo, lonAlvo], Math.max(map.getZoom(), 16), { animate: true });
      }
    }, [veiculoSelecionado]);

    // Renderização e Atualização da Rota Monitorada Ativa no Leaflet 2D
    useEffect(() => {
      const rotaGroup = rotaGroupRef.current;
      if (!rotaGroup) return;

      rotaGroup.clearLayers();

      if (
        !rotaMonitorada ||
        !rotaMonitorada.coordenadas_rota ||
        rotaMonitorada.coordenadas_rota.length < 2
      ) {
        return;
      }

      let cancelado = false;

      const desenharPolilinhas = (coordsBrutas: [number, number][]) => {
        if (cancelado) return;
        rotaGroup.clearLayers();

        // Normaliza garantindo [latitude, longitude] para a Polyline do Leaflet
        const coordsNormalizadas = normalizarListaCoordenadas(coordsBrutas, "lat_lon");

        // Identifica o veículo monitorado para calcular o desvio em tempo real
        const vAlvo =
          veiculoSelecionado && veiculoSelecionado.id === rotaMonitorada.veiculo_id
            ? veiculoSelecionado
            : veiculos.find((v) => v.id === rotaMonitorada.veiculo_id) || veiculoSelecionado;

        let estadoCromatico: "normal" | "atencao" | "desvio_critico" = "normal";
        let caminhoRetomada: [number, number][] = [];
        let pontoReingresso: [number, number] | null = null;

        if (
          vAlvo &&
          typeof vAlvo.latitude === "number" &&
          typeof vAlvo.longitude === "number" &&
          vAlvo.latitude !== 0 &&
          vAlvo.longitude !== 0
        ) {
          const dinamica = avaliarEstadoRotaDinamica(vAlvo.latitude, vAlvo.longitude, {
            ...rotaMonitorada,
            coordenadas_rota: coordsNormalizadas,
          } as any);
          estadoCromatico = dinamica.estadoCromatico;
          caminhoRetomada = dinamica.caminhoRetomada;
          pontoReingresso = dinamica.pontoMaisProximo;
        } else if (rotaMonitorada.desvio_detectado) {
          estadoCromatico = "desvio_critico";
        }

        if (estadoCromatico === "desvio_critico") {
          // Desvio Crítico (> tolerância estipulada): Via Vermelha de Emergência
          L.polyline(coordsNormalizadas, {
            color: "#b91c1c",
            weight: 15,
            opacity: 0.45,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          L.polyline(coordsNormalizadas, {
            color: "#ef4444",
            weight: 6,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          L.polyline(coordsNormalizadas, {
            color: "#fee2e2",
            weight: 2.2,
            opacity: 0.95,
            dashArray: "10, 8",
            lineCap: "round",
          }).addTo(rotaGroup);

          // CAMINHO DE RETOMADA PARA A ROTA EM VERDE
          if (caminhoRetomada && caminhoRetomada.length >= 2) {
            L.polyline(caminhoRetomada, {
              color: "#059669",
              weight: 14,
              opacity: 0.5,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(rotaGroup);

            L.polyline(caminhoRetomada, {
              color: "#10b981",
              weight: 6,
              opacity: 0.98,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(rotaGroup);

            L.polyline(caminhoRetomada, {
              color: "#ecfdf5",
              weight: 2.5,
              opacity: 0.98,
              dashArray: "8, 6",
              lineCap: "round",
            }).addTo(rotaGroup);

            // Marcador no ponto de reingresso à rota
            if (pontoReingresso) {
              const markerRetomadaHtml = `
                <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                  <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #10B98140; animation: ping 1.2s cubic-bezier(0,0,0.2,1) infinite;"></div>
                  <div style="width: 18px; height: 18px; border-radius: 50%; background: #10B981; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
                    <div style="width: 5px; height: 5px; border-radius: 50%; background: #FFFFFF;"></div>
                  </div>
                </div>
              `;
              const iconRetomada = L.divIcon({
                html: markerRetomadaHtml,
                className: "custom-hunter-reingresso",
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              });
              L.marker(pontoReingresso, { icon: iconRetomada }).addTo(rotaGroup);
            }
          }
        } else if (estadoCromatico === "atencao") {
          // Desvio Moderado (Saída da rota em curso): Via Laranja
          L.polyline(coordsNormalizadas, {
            color: "#d97706",
            weight: 15,
            opacity: 0.4,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          L.polyline(coordsNormalizadas, {
            color: "#f59e0b",
            weight: 6,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          L.polyline(coordsNormalizadas, {
            color: "#fef3c7",
            weight: 2.2,
            opacity: 0.95,
            dashArray: "10, 8",
            lineCap: "round",
          }).addTo(rotaGroup);
        } else {
          // Traçado Canônico Waze: Azul Cintilante Neon de Alta Visibilidade (Dentro da Rota)
          // 1. Sombra e contraste de relevo viário
          L.polyline(coordsNormalizadas, {
            color: "#0369a1",
            weight: 15,
            opacity: 0.35,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          // 2. Glow / Aura cintilante ciano elétrico
          L.polyline(coordsNormalizadas, {
            color: "#00e5ff",
            weight: 9,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          // 3. Pista viária azul automotiva
          L.polyline(coordsNormalizadas, {
            color: "#0284c7",
            weight: 5.5,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(rotaGroup);

          // 4. Filamento central cintilante navegável
          L.polyline(coordsNormalizadas, {
            color: "#f0f9ff",
            weight: 2,
            opacity: 0.95,
            dashArray: "12, 10",
            lineCap: "round",
          }).addTo(rotaGroup);
        }
      };

      // Desenho imediato
      desenharPolilinhas(rotaMonitorada.coordenadas_rota);

      // Autocura se tiver menos de 50 pontos: substitui instantaneamente a reta pelas ruas reais
      if (rotaMonitorada.coordenadas_rota.length < 50) {
        enriquecerTrajetoComMalhaViaria(rotaMonitorada.coordenadas_rota)
          .then((viarias) => {
            if (!cancelado && viarias && viarias.length > rotaMonitorada.coordenadas_rota.length) {
              desenharPolilinhas(viarias);
            }
          })
          .catch(() => {});
      }

      return () => {
        cancelado = true;
      };
    }, [rotaMonitorada, veiculoSelecionado, veiculos]);

    return (
      <div
        className={`w-full h-full relative z-0 overflow-hidden ${theme === "dark" ? "hunter-dark-tiles" : ""}`}
      >
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    );
  },
);
