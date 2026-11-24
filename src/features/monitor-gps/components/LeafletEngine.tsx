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
import { VehicleMotionController } from "../../../services/vehicleMotionEngine";

import type { PostoVigilancia } from "@/features/vigilantes/types";

export interface LeafletEngineHandle {
  fitBounds: (veiculosAlvo?: VeiculoGps[]) => void;
  fitBoundsPostos: (postosAlvo?: PostoVigilancia[]) => void;
  fitBoundsGeral: (veiculosAlvo?: VeiculoGps[], postosAlvo?: PostoVigilancia[]) => void;
  centralizarVeiculo: (v: VeiculoGps) => void;
  centralizarCoordenadas: (lat: number, lng: number, zoom?: number) => void;
}

interface LeafletEngineProps {
  veiculos: VeiculoGps[];
  theme: MapTheme;
  trafegoAtivo?: boolean;
  veiculoSelecionado: VeiculoGps | null;
  onSelectVeiculo: (v: VeiculoGps) => void;
  postos?: PostoVigilancia[];
  onSelectPosto?: (p: PostoVigilancia) => void;
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
    {
      veiculos,
      theme,
      trafegoAtivo = false,
      veiculoSelecionado,
      onSelectVeiculo,
      postos,
      onSelectPosto,
      rotaMonitorada,
    },
    ref,
  ) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const trafficLayerRef = useRef<L.TileLayer | null>(null);
    const markersGroupRef = useRef<L.LayerGroup | null>(null);
    const rotaGroupRef = useRef<L.LayerGroup | null>(null);
    const postosGroupRef = useRef<L.LayerGroup | null>(null);
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
    const vehicleMotionControllersRef = useRef<Map<string, VehicleMotionController>>(new Map());
    const [zoomAtual, setZoomAtual] = useState(14);
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
    const userDraggingRef = useRef<boolean>(false);
    const ultimoPanFollowMsRef = useRef<number>(0);
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
    const veiculosRef = useRef(veiculos);
    veiculosRef.current = veiculos;
    const postosRef = useRef(postos);
    postosRef.current = postos;

    // Ajusta a visão para abranger todos os veículos sem deixar nenhum de fora (Modo Toda Frota)
    const ajustarVisaoFrota = (veiculosAlvo?: VeiculoGps[]) => {
      const map = mapInstanceRef.current;
      const frota = veiculosAlvo && veiculosAlvo.length > 0 ? veiculosAlvo : veiculosRef.current;
      if (!map || frota.length === 0) return;

      selectedIdAnteriorRef.current = null;
      seguindoCameraRef.current = false;

      const pontosValidos = frota.filter((v) => coordenadaValidaMapa(v.latitude, v.longitude));

      if (pontosValidos.length === 1) {
        map.setView([pontosValidos[0].latitude, pontosValidos[0].longitude], 16, {
          animate: true,
        });
      } else if (pontosValidos.length > 1) {
        const bounds = L.latLngBounds(pontosValidos.map((v) => [v.latitude, v.longitude]));
        // Padding confortável de 80px para garantir enquadramento da frota completa
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
      }
    };

    // Ajusta a visão para abranger todos os postos de vigilância
    const ajustarVisaoPostos = (postosAlvo?: PostoVigilancia[]) => {
      const map = mapInstanceRef.current;
      const lista = postosAlvo && postosAlvo.length > 0 ? postosAlvo : postosRef.current || [];
      if (!map || lista.length === 0) return;

      const coordenadas: [number, number][] = [];
      lista.forEach((p) => {
        if (!p.ativo) return;
        if (coordenadaValidaMapa(p.latitude, p.longitude)) {
          coordenadas.push([p.latitude, p.longitude]);
        }
        if (p.perimetro_poligono?.coordinates && p.perimetro_poligono.coordinates.length >= 3) {
          p.perimetro_poligono.coordinates.forEach(([lat, lng]) => {
            if (coordenadaValidaMapa(lat, lng)) {
              coordenadas.push([lat, lng]);
            }
          });
        }
      });

      if (coordenadas.length === 1) {
        map.setView(coordenadas[0], 17, { animate: true });
      } else if (coordenadas.length > 1) {
        const bounds = L.latLngBounds(coordenadas);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17, animate: true });
      }
    };

    // Ajusta a visão para o Mapa Geral: abrange toda a frota E todos os postos
    const ajustarVisaoGeral = (veiculosAlvo?: VeiculoGps[], postosAlvo?: PostoVigilancia[]) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const frota = veiculosAlvo && veiculosAlvo.length > 0 ? veiculosAlvo : veiculosRef.current;
      const listaPostos =
        postosAlvo && postosAlvo.length > 0 ? postosAlvo : postosRef.current || [];

      const coordenadas: [number, number][] = [];

      frota.forEach((v) => {
        if (coordenadaValidaMapa(v.latitude, v.longitude)) {
          coordenadas.push([v.latitude, v.longitude]);
        }
      });

      listaPostos.forEach((p) => {
        if (!p.ativo) return;
        if (coordenadaValidaMapa(p.latitude, p.longitude)) {
          coordenadas.push([p.latitude, p.longitude]);
        }
        if (p.perimetro_poligono?.coordinates && p.perimetro_poligono.coordinates.length >= 3) {
          p.perimetro_poligono.coordinates.forEach(([lat, lng]) => {
            if (coordenadaValidaMapa(lat, lng)) {
              coordenadas.push([lat, lng]);
            }
          });
        }
      });

      if (coordenadas.length === 1) {
        map.setView(coordenadas[0], 16, { animate: true });
      } else if (coordenadas.length > 1) {
        const bounds = L.latLngBounds(coordenadas);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
      }
    };

    const sincronizarQuadrosLeaflet = useCallback((_agoraMs: number) => {
      // Hard reset determinístico: a movimentação do marcador é realizada exclusivamente pelo loop de 1500ms do VehicleMotionController
    }, []);

    useImperativeHandle(ref, () => ({
      fitBounds: ajustarVisaoFrota,
      fitBoundsPostos: ajustarVisaoPostos,
      fitBoundsGeral: ajustarVisaoGeral,
      centralizarVeiculo: (v: VeiculoGps) => {
        if (mapInstanceRef.current && coordenadaValidaMapa(v?.latitude, v?.longitude)) {
          seguindoCameraRef.current = true;
          userDraggingRef.current = false;
          selectedIdAnteriorRef.current = v.id;
          const motionCtrl = vehicleMotionControllersRef.current.get(v.id);
          const pos = motionCtrl ? motionCtrl.getPosition() : { lat: v.latitude, lng: v.longitude };
          const maxZ = mapInstanceRef.current.getMaxZoom() ?? 21;
          const targetZoom = Math.min(17, maxZ);
          mapInstanceRef.current.flyTo([pos.lat, pos.lng], targetZoom, {
            duration: 1.2,
          });
        }
      },
      centralizarCoordenadas: (lat: number, lng: number, zoom?: number) => {
        if (mapInstanceRef.current && coordenadaValidaMapa(lat, lng)) {
          seguindoCameraRef.current = false;
          mapInstanceRef.current.setView([lat, lng], zoom || 18, {
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
        postosGroupRef.current = L.layerGroup().addTo(map);

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
            iconSize: mostrarPlaca ? [56, 70] : [50, 50],
            iconAnchor: mostrarPlaca ? [28, 70] : [25, 50],
          });
        };

        const dadosAnteriores = markersMapRef.current.get(v.id);

        if (dadosAnteriores) {
          dadosAnteriores.veiculoAtual = v;
          if (!markersGroup.hasLayer(dadosAnteriores.marker)) {
            markersGroup.addLayer(dadosAnteriores.marker);
          }
          if (dadosAnteriores.visualKey !== visualKey) {
            dadosAnteriores.marker.setIcon(criarDivIcon());
            dadosAnteriores.visualKey = visualKey;
          }
          if (dadosAnteriores.popupKey !== popupKey) {
            dadosAnteriores.marker.setPopupContent(criarPopupHtml());
            dadosAnteriores.popupKey = popupKey;
          }
        } else {
          // Cria novo marcador tático UMA ÚNICA VEZ por veículo
          const marker = L.marker([v.latitude, v.longitude], { icon: criarDivIcon() });
          marker.bindPopup(criarPopupHtml(), { offset: [0, -15] });

          marker.on("click", () => {
            seguindoCameraRef.current = true;
            userDraggingRef.current = false;
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

        // Integração VehicleMotionController: ÚNICA entidade autorizada a invocar marker.setLatLng (loop 1500ms easeOutCubic)
        let motionCtrl = vehicleMotionControllersRef.current.get(v.id);
        if (!motionCtrl) {
          motionCtrl = new VehicleMotionController(
            { lat: v.latitude, lng: v.longitude },
            (frameState) => {
              const dados = markersMapRef.current.get(v.id);
              if (dados?.marker) {
                dados.marker.setLatLng([frameState.lat, frameState.lng]);
                atualizarRotacaoElementoMarcador(dados.marker.getElement(), frameState.bearing);

                const map = mapInstanceRef.current;
                const isFocado =
                  veiculoSelecionadoIdRef.current === v.id ||
                  (Boolean(v.placa) && veiculoSelecionadoRef.current?.placa === v.placa) ||
                  (Boolean((v as any).imei) &&
                    (veiculoSelecionadoRef.current as any)?.imei === (v as any).imei);

                if (
                  map &&
                  seguindoCameraRef.current &&
                  isFocado &&
                  !userDraggingRef.current &&
                  !(map as any)._animatingZoom
                ) {
                  map.panTo([frameState.lat, frameState.lng], { animate: false });
                }
              }
            },
            anguloRumo,
          );
          vehicleMotionControllersRef.current.set(v.id, motionCtrl);
        } else {
          motionCtrl.updateTarget({ lat: v.latitude, lng: v.longitude }, v.ultima_atualizacao);
        }
      });

      // Remove marcadores de veículos que não estão mais presentes ou que foram agrupados no cluster
      for (const [id, dados] of markersMapRef.current.entries()) {
        if (!idsVeiculosAtivos.has(id)) {
          markersGroup.removeLayer(dados.marker);
          markersMapRef.current.delete(id);
          const mc = vehicleMotionControllersRef.current.get(id);
          if (mc) {
            mc.destroy();
            vehicleMotionControllersRef.current.delete(id);
          }
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

    // Centraliza com zoom automático 17 apenas quando o operador troca de veículo selecionado ou sai do modo Toda Frota
    // Proteção de zoom manual: pacotes GPS subsequentes do mesmo veículo NÃO forçam o zoom de volta para 17
    useEffect(() => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (!veiculoSelecionado) {
        selectedIdAnteriorRef.current = null;
        return;
      }

      seguindoCameraRef.current = true;
      userDraggingRef.current = false;

      if (selectedIdAnteriorRef.current === veiculoSelecionado.id) {
        return;
      }

      const lat = veiculoSelecionado.latitude;
      const lon = veiculoSelecionado.longitude;

      if (coordenadaValidaMapa(lat, lon)) {
        selectedIdAnteriorRef.current = veiculoSelecionado.id;
        const motionCtrl = vehicleMotionControllersRef.current.get(veiculoSelecionado.id);
        const pos = motionCtrl ? motionCtrl.getPosition() : { lat, lng: lon };
        const maxZ = map.getMaxZoom() ?? 21;
        const targetZoom = Math.min(17, maxZ);
        map.flyTo([pos.lat, pos.lng], targetZoom, {
          duration: 1.2,
        });
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

    // Renderização dos Postos de Vigilância Ativos no Mapa Operacional
    useEffect(() => {
      const group = postosGroupRef.current;
      if (!group) return;

      group.clearLayers();

      if (!postos || postos.length === 0) return;

      postos.forEach((posto) => {
        if (!posto.ativo) return;

        // 1. Polígono de demarcação da área geral do posto
        if (
          posto.perimetro_poligono?.coordinates &&
          posto.perimetro_poligono.coordinates.length >= 3
        ) {
          const latlngs = posto.perimetro_poligono.coordinates.map(
            ([lat, lng]) => [lat, lng] as [number, number],
          );
          const poligono = L.polygon(latlngs, {
            color: "#00CFCC",
            weight: 2,
            opacity: 0.9,
            fillColor: "#00CFCC",
            fillOpacity: 0.2,
            dashArray: "4, 6",
          });
          poligono.bindTooltip(
            `<b>${posto.nome}</b><br/><span style="font-size:10px; opacity:0.8;">Posto Tático de Vigilância</span>`,
            {
              direction: "top",
              sticky: true,
              className: "leaflet-tooltip-tatico",
            },
          );
          poligono.addTo(group);
        } else if (posto.raio_metros && coordenadaValidaMapa(posto.latitude, posto.longitude)) {
          const circulo = L.circle([posto.latitude, posto.longitude], {
            radius: posto.raio_metros,
            color: "#00CFCC",
            weight: 1.5,
            fillColor: "#00CFCC",
            fillOpacity: 0.15,
            dashArray: "3, 5",
          });
          circulo.addTo(group);
        }

        // 2. Marcador tático no centro do posto
        if (coordenadaValidaMapa(posto.latitude, posto.longitude)) {
          const iconHtml = `
            <div style="
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 36px;
              height: 36px;
              background: #0f172a;
              border: 2px solid #00CFCC;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(0, 207, 204, 0.4), 0 2px 4px rgba(0,0,0,0.5);
              cursor: pointer;
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00CFCC" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
                <path d="M10 6h4"/>
                <path d="M10 10h4"/>
                <path d="M10 14h4"/>
                <path d="M10 18h4"/>
              </svg>
              <span style="
                position: absolute;
                top: -3px;
                right: -3px;
                width: 9px;
                height: 9px;
                background: #10b981;
                border: 2px solid #0f172a;
                border-radius: 50%;
              "></span>
            </div>
          `;

          const customIcon = L.divIcon({
            className: "custom-posto-marker",
            html: iconHtml,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18],
          });

          const marker = L.marker([posto.latitude, posto.longitude], {
            icon: customIcon,
          });

          const popupHtml = `
            <div style="font-family: inherit; font-size: 12px; min-width: 200px; padding: 4px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="background: #00CFCC; color: #0c121c; font-weight: bold; font-size: 9px; padding: 2px 6px; border-radius: 4px;">POSTO TÁTICO</span>
                <span style="font-weight: 700; color: #1e293b; font-size: 13px;">${posto.nome}</span>
              </div>
              ${posto.endereco ? `<p style="margin: 0 0 6px 0; color: #64748b; font-size: 11px;">${posto.endereco}</p>` : ""}
              <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #10b981; font-weight: 600; font-size: 10px;">● Vigilância Ativa</span>
                <span style="color: #64748b; font-size: 10px;">Raio: ${posto.raio_metros || 100}m</span>
              </div>
            </div>
          `;

          marker.bindPopup(popupHtml);
          marker.on("click", () => {
            onSelectPosto?.(posto);
          });
          marker.addTo(group);
        }
      });
    }, [postos, onSelectPosto]);

    return (
      <div
        className={`w-full h-full relative z-0 overflow-hidden ${theme === "dark" ? "hunter-dark-tiles" : ""}`}
      >
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    );
  },
);
