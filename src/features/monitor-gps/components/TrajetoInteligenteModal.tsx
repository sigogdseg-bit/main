import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import {
  X,
  Navigation,
  MapPin,
  Plus,
  Trash2,
  Sparkles,
  ExternalLink,
  Copy,
  Clock,
  Gauge,
  Search,
  Check,
  ArrowDown,
  ArrowUp,
  LocateFixed,
  Bookmark,
  BookmarkPlus,
  RotateCcw,
  ListOrdered,
  ChevronDown,
  FolderOpen,
  Pencil,
  SlidersHorizontal,
  Save,
  ShieldAlert,
  Volume2,
  VolumeX,
  Radio,
  Route,
} from "lucide-react";
import { toast } from "sonner";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { VeiculoGps } from "../types";
import { coordenadaValidaMapa } from "../utils/interpolacaoMapaSuave";
import {
  buscarEnderecosBrasil,
  otimizarOrdemParadasLogisticaAvancada,
  calcularRotaViariaInteligente,
  calcularDistanciaHaversineKm,
  enriquecerTrajetoComMalhaViaria,
  gerarLinkGoogleMaps,
  gerarLinkWazePonto,
  gerarTextoResumoTrajeto,
  falarTextoVoz,
  pararVoz,
  type PontoRota,
  type EnderecoSugerido,
  type ResultadoTrajetoInteligente,
  type TrechoTrajeto,
  type InstrucaoManobra,
} from "../services/trajetoInteligenteService";
import {
  listarTrajetosSalvos,
  salvarTrajetoNoBanco,
  atualizarTrajetoNoBanco,
  excluirTrajetoDoBanco,
  type TrajetoSalvo,
} from "../services/trajetoSalvoService";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { iniciarRotaMonitorada, type RotaMonitorada } from "../services/rotaMonitoradaService";
import { carregarCheckpoints } from "@/features/vigilantes/services/vigilanteService";

interface TrajetoInteligenteModalProps {
  veiculo?: VeiculoGps | null;
  onFechar: () => void;
  trajetoInicial?: TrajetoSalvo | null;
  onRotaAtivada?: (rota: RotaMonitorada) => void;
}

export function TrajetoInteligenteModal({
  veiculo,
  onFechar,
  trajetoInicial,
  onRotaAtivada,
}: TrajetoInteligenteModalProps) {
  const { session } = useAuth();
  const userId = session?.userId || "";

  const isPropriedade = Boolean(
    veiculo?.tipo_veiculo === "propriedade" ||
    veiculo?.id?.startsWith("posto-") ||
    veiculo?.placa?.startsWith("POSTO-"),
  );

  // 1. Estados dos Pontos da Rota
  const [saida, setSaida] = useState<PontoRota>(() => {
    const temCoords = coordenadaValidaMapa(veiculo?.latitude, veiculo?.longitude);
    const lat = temCoords ? veiculo!.latitude : 0;
    const lon = temCoords ? veiculo!.longitude : 0;
    return {
      id: "origem-inicial",
      titulo: isPropriedade
        ? `Base / Guarita (${veiculo?.marca_modelo || veiculo?.placa})`
        : veiculo
          ? `Posição Atual (${veiculo.placa})`
          : "Ponto de Saída",
      endereco: !temCoords
        ? "Aguardando coordenadas GPS do veículo"
        : isPropriedade
          ? `Ponto Base / Guarita: ${lat.toFixed(5)}, ${lon.toFixed(5)}`
          : `Coordenadas do veículo: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      latitude: lat,
      longitude: lon,
      tipo: "saida",
    };
  });

  const [paradas, setParadas] = useState<PontoRota[]>([]);
  const [retornarAoPontoSaida, setRetornarAoPontoSaida] = useState(isPropriedade);
  const [chegada, setChegada] = useState<PontoRota>({
    id: "chegada-1",
    tipo: "chegada",
    titulo: isPropriedade ? "Retorno à Base (Fim da Ronda)" : "Ponto de Chegada (Destino)",
    endereco: "",
    latitude: 0,
    longitude: 0,
  });

  // Carrega checkpoints cadastrados no banco caso seja uma propriedade/posto fixo
  useEffect(() => {
    if (!isPropriedade || !veiculo) return;
    const postoIdReal = veiculo.id.replace("posto-", "");
    carregarCheckpoints(postoIdReal).then((cps) => {
      if (cps && cps.length > 0) {
        setParadas((prev) => {
          if (prev.length > 0) return prev;
          return cps.map((cp, idx) => ({
            id: cp.id || `cp-${idx}`,
            tipo: "parada",
            titulo: cp.nome,
            endereco: cp.horario_previsto
              ? `Checkpoint ${idx + 1}: ${cp.nome} (Horário: ${cp.horario_previsto})`
              : `Checkpoint ${idx + 1}: ${cp.nome}`,
            latitude: cp.latitude,
            longitude: cp.longitude,
          }));
        });
      }
    });
  }, [isPropriedade, veiculo?.id]);

  // 2. Modos de Ordenação: Automática Inteligente (Logística 2-Opt) ou Manual (Ajustada pelo Usuário)
  const [ordemModo, setOrdemModo] = useState<"auto" | "manual">("auto");
  const [otimizandoIA, setOtimizandoIA] = useState(false);

  // 3. Edição de Rota Salva
  const [trajetoEmEdicao, setTrajetoEmEdicao] = useState<TrajetoSalvo | null>(null);

  // 4. Estados de Busca e Autocompletar
  const [campoBuscaAtivo, setCampoBuscaAtivo] = useState<string | null>(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<EnderecoSugerido[]>([]);
  const [buscandoEnderecos, setBuscandoEnderecos] = useState(false);

  // 5. Estados de Roteirizacao e Resultado
  const [calculandoRota, setCalculandoRota] = useState(false);
  const [resultadoRota, setResultadoRota] = useState<ResultadoTrajetoInteligente | null>(null);
  const [menuWazeAberto, setMenuWazeAberto] = useState(false);
  const [mostrarItinerarioDetalhado, setMostrarItinerarioDetalhado] = useState(false);
  const [mostrarOrientacoesVoz, setMostrarOrientacoesVoz] = useState(false);

  // 6. Estados dos Trajetos Salvos em Banco de Dados (Max 5)
  const [trajetosSalvos, setTrajetosSalvos] = useState<TrajetoSalvo[]>([]);
  const [carregandoSalvos, setCarregandoSalvos] = useState(false);
  const [modalSalvarAberto, setModalSalvarAberto] = useState(false);
  const [modalListaSalvosAberto, setModalListaSalvosAberto] = useState(false);
  const [nomeTrajetoSalvar, setNomeTrajetoSalvar] = useState("");
  const [salvandoNoBanco, setSalvandoNoBanco] = useState(false);

  // 6.1. Rota Monitorada Inteligente (Alerta de Desvio de Trajeto)
  const [modalAtivarMonitoramento, setModalAtivarMonitoramento] = useState(false);
  const [ativandoMonitoramento, setAtivandoMonitoramento] = useState(false);
  const [toleranciaCorredorMetros, setToleranciaCorredorMetros] = useState(150);

  // 6.2. Assistente de Voz Waze (Orientações Faladas e Navegação Guiada por Deslocamento)
  const [falandoVoz, setFalandoVoz] = useState(false);
  const [indiceVozAtual, setIndiceVozAtual] = useState<number | null>(null);
  const [navegacaoVozAtiva, setNavegacaoVozAtiva] = useState(false);
  const [passoAtualIdx, setPassoAtualIdx] = useState<number>(0);
  const [passoPreparacaoFalado, setPassoPreparacaoFalado] = useState<number | null>(null);
  const [passoExecucaoFalado, setPassoExecucaoFalado] = useState<number | null>(null);
  const [distanciaParaProximoPasso, setDistanciaParaProximoPasso] = useState<number | null>(null);
  const [posicaoVeiculo, setPosicaoVeiculo] = useState<{
    lat: number;
    lng: number;
    velocidade?: number;
    rumo?: number;
  }>(() => {
    const temCoords = coordenadaValidaMapa(veiculo?.latitude, veiculo?.longitude);
    const lat = temCoords ? veiculo!.latitude : 0;
    const lng = temCoords ? veiculo!.longitude : 0;
    return {
      lat,
      lng,
      velocidade: veiculo?.velocidade || 0,
      rumo: veiculo?.rumo || 0,
    };
  });
  const veiculoNavMarkerRef = useRef<L.Marker | null>(null);

  // 6.3. Alternância de Visão Mobile / Tablet (Pontos vs Mapa)
  const [abaMobile, setAbaMobile] = useState<"pontos" | "mapa">("pontos");

  // 7. Referencia do Mapa Leaflet
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const rotaLayersRef = useRef<L.Layer[]>([]);
  const markersRef = useRef<L.Marker[]>([]);

  // Carrega trajetos salvos no Banco de Dados
  useEffect(() => {
    if (!userId) return;
    setCarregandoSalvos(true);
    listarTrajetosSalvos(userId)
      .then((lista) => setTrajetosSalvos(lista))
      .catch((err) => console.error("Erro ao carregar trajetos:", err))
      .finally(() => setCarregandoSalvos(false));
  }, [userId]);

  // Sincroniza chegada se opcao de retornar a saida estiver ativa
  useEffect(() => {
    if (retornarAoPontoSaida) {
      setChegada({
        id: "chegada-retorno",
        tipo: "chegada",
        titulo: "Retorno à Saída (Origem)",
        endereco: saida.endereco,
        latitude: saida.latitude,
        longitude: saida.longitude,
      });
    }
  }, [retornarAoPontoSaida, saida.endereco, saida.latitude, saida.longitude]);

  // Debounce para busca de enderecos
  useEffect(() => {
    if (!termoBusca || termoBusca.length < 3) {
      setSugestoes([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoEnderecos(true);
      const resultados = await buscarEnderecosBrasil(termoBusca);
      setSugestoes(resultados);
      setBuscandoEnderecos(false);
    }, 450);

    return () => clearTimeout(timer);
  }, [termoBusca]);

  // Função canônica para ajustar o enquadramento do mapa à rota e marcadores sem tela branca
  const ajustarVisualizacaoRota = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !mapContainerRef.current) return;

    const w = mapContainerRef.current.clientWidth;
    const h = mapContainerRef.current.clientHeight;
    if (w <= 0 || h <= 0) return;

    map.invalidateSize({ pan: false });

    // 1. Se houver polylines de rota, enquadra com segurança
    if (rotaLayersRef.current.length > 0) {
      const firstPoly = rotaLayersRef.current[0] as L.Polyline;
      const b = firstPoly.getBounds();
      if (b && b.isValid()) {
        map.fitBounds(b, { padding: [35, 35], maxZoom: 18 });
        return;
      }
    }

    // 2. Se houver marcadores
    if (markersRef.current.length > 0) {
      const b = L.latLngBounds(markersRef.current.map((m) => m.getLatLng()));
      if (b && b.isValid()) {
        if (markersRef.current.length === 1) {
          map.setView(markersRef.current[0].getLatLng(), 15);
        } else {
          map.fitBounds(b, { padding: [35, 35], maxZoom: 18 });
        }
        return;
      }
    }

    // 3. Fallback: posição inicial
    const lat = saida?.latitude || -22.5235;
    const lng = saida?.longitude || -44.1042;
    map.setView([lat, lng], 14);
  }, [saida]);

  // Inicializa mapa interativo do modal com invalidateSize garantido
  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    const latInicial =
      typeof saida?.latitude === "number" && !isNaN(saida.latitude) && saida.latitude !== 0
        ? saida.latitude
        : -22.5235;
    const lngInicial =
      typeof saida?.longitude === "number" && !isNaN(saida.longitude) && saida.longitude !== 0
        ? saida.longitude
        : -44.1042;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 21,
    }).setView([latInicial, lngInicial], 13);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: ["a", "b", "c"],
      maxZoom: 21,
      maxNativeZoom: 19,
    }).addTo(map);

    leafletMapRef.current = map;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            ajustarVisualizacaoRota();
          }
        }
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      pararVoz();
      map.remove();
      leafletMapRef.current = null;
      veiculoNavMarkerRef.current = null;
    };
  }, [ajustarVisualizacaoRota, saida]);

  // Re-enquadra imediatamente quando o usuário alterna para a aba do Mapa no celular
  useEffect(() => {
    if (abaMobile === "mapa") {
      const t1 = setTimeout(() => ajustarVisualizacaoRota(), 60);
      const t2 = setTimeout(() => ajustarVisualizacaoRota(), 200);
      const t3 = setTimeout(() => ajustarVisualizacaoRota(), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [abaMobile, ajustarVisualizacaoRota]);

  // Atualiza marcadores e traçado no mapa com estilo Waze Azul Cintilante
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Limpa marcadores e camadas anteriores
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    rotaLayersRef.current.forEach((layer) => layer.remove());
    rotaLayersRef.current = [];

    const destinoFinal = retornarAoPontoSaida
      ? {
          ...saida,
          id: "chegada-retorno",
          tipo: "chegada" as const,
          titulo: "Retorno à Saída (Origem)",
        }
      : chegada;

    const pontosComCoordenadas = [saida, ...paradas, destinoFinal].filter(
      (p) =>
        p &&
        typeof p.latitude === "number" &&
        typeof p.longitude === "number" &&
        !isNaN(p.latitude) &&
        !isNaN(p.longitude) &&
        (p.latitude !== 0 || p.longitude !== 0),
    );

    if (pontosComCoordenadas.length === 0) return;

    const bounds = L.latLngBounds([]);

    // Renderiza marcadores com visual tatico
    pontosComCoordenadas.forEach((p, idx) => {
      const isSaida = idx === 0;
      const isChegada = idx === pontosComCoordenadas.length - 1;

      const corBg = isSaida ? "#10b981" : isChegada ? "#ef4444" : "#0284c7";
      const rotulo = isSaida ? "1" : isChegada ? "FIM" : `${idx + 1}`;

      const icon = L.divIcon({
        className: "custom-hunter-waypoint-icon",
        html: `
          <div style="
            background: ${corBg};
            color: #ffffff;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 900;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          ">
            ${rotulo}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([p.latitude, p.longitude], { icon }).addTo(map);
      marker.bindPopup(`<b>${p.titulo}</b><br/><span style="font-size:11px;">${p.endereco}</span>`);
      markersRef.current.push(marker);
      bounds.extend([p.latitude, p.longitude]);
    });

    // Se houver coordenadas da rota calculada, desenha o traçado canônico WAZE AZUL CINTILANTE
    if (resultadoRota && resultadoRota.coordenadasGeoJson.length > 0) {
      const latLngs = resultadoRota.coordenadasGeoJson.map((c) => [c[1], c[0]] as [number, number]);

      // 1. Sombra e contraste de relevo viário
      const l1 = L.polyline(latLngs, {
        color: "#0369a1",
        weight: 15,
        opacity: 0.35,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // 2. Glow / Aura cintilante ciano elétrico Waze
      const l2 = L.polyline(latLngs, {
        color: "#00e5ff",
        weight: 9,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // 3. Pista viária azul automotiva
      const l3 = L.polyline(latLngs, {
        color: "#0284c7",
        weight: 5.5,
        opacity: 0.98,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // 4. Filamento central cintilante
      const l4 = L.polyline(latLngs, {
        color: "#f0f9ff",
        weight: 2,
        opacity: 0.95,
        dashArray: "12, 10",
        lineCap: "round",
      }).addTo(map);

      rotaLayersRef.current = [l1, l2, l3, l4];
      ajustarVisualizacaoRota();
    } else {
      ajustarVisualizacaoRota();
    }
  }, [
    saida,
    paradas,
    chegada,
    retornarAoPontoSaida,
    resultadoRota,
    abaMobile,
    ajustarVisualizacaoRota,
  ]);

  // Monitoramento de Posição Real do Veículo (Rastreador Supabase Realtime)
  useEffect(() => {
    if (!navegacaoVozAtiva || !veiculo?.id) return;

    const canal = supabase
      .channel(`hunter_nav_realtime_${veiculo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "veiculos",
          filter: `id=eq.${veiculo.id}`,
        },
        (payload: any) => {
          const n = payload.new;
          if (n && typeof n.latitude === "number" && typeof n.longitude === "number") {
            setPosicaoVeiculo({
              lat: n.latitude,
              lng: n.longitude,
              velocidade: Number(n.velocidade) || 0,
              rumo: Number(n.direcao_cardeal ?? n.rumo) || 0,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [navegacaoVozAtiva, veiculo?.id]);

  // Monitoramento do Celular / Navegador quando o motorista estiver a bordo
  useEffect(() => {
    if (!navegacaoVozAtiva) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosicaoVeiculo((ant) => ({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          velocidade: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : ant?.velocidade || 0,
          rumo: pos.coords.heading ?? ant?.rumo ?? 0,
        }));
      },
      (err) => console.warn("GPS celular navegacao:", err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [navegacaoVozAtiva]);

  // Atualização do Marcador do Veículo no Mapa Leaflet durante navegação
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !posicaoVeiculo || !coordenadaValidaMapa(posicaoVeiculo.lat, posicaoVeiculo.lng)) return;

    if (!veiculoNavMarkerRef.current) {
      const icon = L.divIcon({
        className: "hunter-nav-car-icon",
        html: `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: 0; background: rgba(6, 182, 212, 0.4); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; background: #06b6d4; color: #020617; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.6); transform: rotate(${posicaoVeiculo.rumo || 0}deg); transition: transform 0.3s ease;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
              </svg>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([posicaoVeiculo.lat, posicaoVeiculo.lng], {
        icon,
        zIndexOffset: 1000,
      }).addTo(map);
      veiculoNavMarkerRef.current = marker;
    } else {
      veiculoNavMarkerRef.current.setLatLng([posicaoVeiculo.lat, posicaoVeiculo.lng]);
    }

    if (navegacaoVozAtiva) {
      map.panTo([posicaoVeiculo.lat, posicaoVeiculo.lng], { animate: true, duration: 0.8 });
    }
  }, [posicaoVeiculo, navegacaoVozAtiva]);

  // Avaliação Dinâmica de Voz Waze Conforme o Deslocamento Real do Veículo
  useEffect(() => {
    if (!navegacaoVozAtiva || !resultadoRota?.instrucoesManobras || !posicaoVeiculo) return;
    const manobras = resultadoRota.instrucoesManobras;
    if (manobras.length === 0) return;

    if (passoAtualIdx >= manobras.length) {
      falarTextoVoz("Você chegou ao seu destino final. Rota concluída.");
      setNavegacaoVozAtiva(false);
      return;
    }

    const manobra = manobras[passoAtualIdx];
    const mLat = manobra.latitude ?? saida.latitude;
    const mLng = manobra.longitude ?? saida.longitude;

    const distMetros = Math.round(
      calcularDistanciaHaversineKm(posicaoVeiculo.lat, posicaoVeiculo.lng, mLat, mLng) * 1000,
    );
    setDistanciaParaProximoPasso(distMetros);

    // 1. Aviso de Preparação (entre 120m e 450m)
    if (distMetros <= 450 && distMetros > 100 && passoPreparacaoFalado !== passoAtualIdx) {
      setPassoPreparacaoFalado(passoAtualIdx);
      const distAprox = Math.max(50, Math.round(distMetros / 50) * 50);
      falarTextoVoz(`Em ${distAprox} metros, ${manobra.texto}.`);
      return;
    }

    // 2. Aviso de Execução Imediata (entre 25m e 80m)
    if (distMetros <= 80 && distMetros > 25 && passoExecucaoFalado !== passoAtualIdx) {
      setPassoExecucaoFalado(passoAtualIdx);
      falarTextoVoz(`${manobra.texto} agora.`);
      return;
    }

    // 3. Transição de Passo Concluído (veículo atingiu a manobra a menos de 25m)
    if (distMetros <= 25) {
      const prox = passoAtualIdx + 1;
      setPassoAtualIdx(prox);
      if (prox < manobras.length) {
        falarTextoVoz(`Em seguida, ${manobras[prox].texto}.`);
      } else {
        falarTextoVoz("Você chegou ao seu destino final. Rota concluída.");
        setNavegacaoVozAtiva(false);
      }
    }
  }, [
    posicaoVeiculo,
    navegacaoVozAtiva,
    passoAtualIdx,
    passoPreparacaoFalado,
    passoExecucaoFalado,
    resultadoRota,
    saida,
  ]);

  // Assistente de Voz Waze (Controles e Ações de Navegação Guiada)
  const handleOuvirManobra = (manobra: InstrucaoManobra, idx: number) => {
    setFalandoVoz(true);
    setIndiceVozAtual(idx);
    setPassoAtualIdx(idx);
    falarTextoVoz(manobra.texto, () => {
      setFalandoVoz(false);
      setIndiceVozAtual(null);
    });
  };

  const handleAlternarNavegacaoWaze = () => {
    if (!resultadoRota?.instrucoesManobras || resultadoRota.instrucoesManobras.length === 0) {
      toast.info("Nenhuma orientação falada disponível para este trajeto.");
      return;
    }

    if (navegacaoVozAtiva) {
      pararVoz();
      setNavegacaoVozAtiva(false);
      setFalandoVoz(false);
      setIndiceVozAtual(null);
      toast.info("Navegação guiada por voz pausada.");
      return;
    }

    setNavegacaoVozAtiva(true);
    setPassoAtualIdx(0);
    setPassoPreparacaoFalado(null);
    setPassoExecucaoFalado(null);
    setAbaMobile("mapa");

    const primeira = resultadoRota.instrucoesManobras[0];
    falarTextoVoz(
      `Iniciando navegação Waze. Percurso de ${resultadoRota.distanciaKm} quilômetros. ${primeira.texto}.`,
    );
    toast.success("Navegação Waze iniciada! As orientações falarão conforme o deslocamento.");
  };

  const handleAvancarPassoManual = () => {
    if (!resultadoRota?.instrucoesManobras) return;
    const prox = passoAtualIdx + 1;
    if (prox < resultadoRota.instrucoesManobras.length) {
      setPassoAtualIdx(prox);
      falarTextoVoz(resultadoRota.instrucoesManobras[prox].texto);
    } else {
      falarTextoVoz("Você chegou ao seu destino final.");
      setNavegacaoVozAtiva(false);
    }
  };

  const handleVoltarPassoManual = () => {
    if (!resultadoRota?.instrucoesManobras) return;
    const ant = Math.max(0, passoAtualIdx - 1);
    setPassoAtualIdx(ant);
    falarTextoVoz(resultadoRota.instrucoesManobras[ant].texto);
  };

  const handleRepetirPassoAtual = () => {
    if (!resultadoRota?.instrucoesManobras) return;
    const atual = resultadoRota.instrucoesManobras[passoAtualIdx];
    if (atual) {
      falarTextoVoz(atual.texto);
    }
  };

  // Ações de Adicionar e Remover Paradas
  const handleAdicionarParada = () => {
    const novaParada: PontoRota = {
      id: `parada-${Date.now()}`,
      tipo: "parada",
      titulo: `Parada ${paradas.length + 1}`,
      endereco: "",
      latitude: 0,
      longitude: 0,
    };
    setParadas([...paradas, novaParada]);
    setCampoBuscaAtivo(novaParada.id);
    setTermoBusca("");
    setResultadoRota(null);
  };

  const handleRemoverParada = (id: string) => {
    const filtradas = paradas.filter((p) => p.id !== id);
    const renumeradas = filtradas.map((p, i) => ({ ...p, titulo: `Parada ${i + 1}` }));
    setParadas(renumeradas);
    setResultadoRota(null);
  };

  // Ajuste Manual de Ordenação: Subir ou Descer uma Parada
  const handleMoverParada = (index: number, direcao: "cima" | "baixo") => {
    const novoIndex = direcao === "cima" ? index - 1 : index + 1;
    if (novoIndex < 0 || novoIndex >= paradas.length) return;

    const novaLista = [...paradas];
    const temp = novaLista[index];
    novaLista[index] = novaLista[novoIndex];
    novaLista[novoIndex] = temp;

    const renumeradas = novaLista.map((p, i) => ({ ...p, titulo: `Parada ${i + 1}` }));
    setParadas(renumeradas);
    setOrdemModo("manual");
    setResultadoRota(null);
    toast.info("Ordem ajustada manualmente. Clique em Montar Trajetória para recalcular.");
  };

  // Reotimizar Logística Inteligente com Parâmetros de Grandes Empresas (2-Opt)
  const handleReotimizarIA = async () => {
    if (paradas.length <= 1) {
      toast.info("Insira pelo menos 2 paradas intermediárias para otimizar.");
      return;
    }

    const destinoFinal: PontoRota = retornarAoPontoSaida
      ? {
          id: "chegada-retorno",
          tipo: "chegada",
          titulo: "Retorno à Saída (Origem)",
          endereco: saida.endereco,
          latitude: saida.latitude,
          longitude: saida.longitude,
        }
      : chegada;

    if (saida.latitude === 0 || destinoFinal.latitude === 0) {
      toast.warning("Defina o endereço de saída e chegada antes de otimizar.");
      return;
    }

    setOtimizandoIA(true);
    try {
      const rotaOtimizada = await otimizarOrdemParadasLogisticaAvancada(
        saida,
        paradas,
        destinoFinal,
      );
      const novasParadas = rotaOtimizada.slice(1, rotaOtimizada.length - 1);
      setParadas(novasParadas);
      setOrdemModo("auto");
      setResultadoRota(null);
      toast.success("Paradas otimizadas por Matriz Viária e Algoritmo 2-Opt!");
    } catch {
      toast.error("Falha ao otimizar trajeto.");
    } finally {
      setOtimizandoIA(false);
    }
  };

  // Seleciona endereco sugerido da busca
  const handleSelecionarEndereco = (sugestao: EnderecoSugerido) => {
    if (campoBuscaAtivo === "saida") {
      setSaida({
        ...saida,
        endereco: sugestao.enderecoCompleto,
        numero: sugestao.numero,
        latitude: sugestao.latitude,
        longitude: sugestao.longitude,
      });
      if (retornarAoPontoSaida) {
        setChegada({
          id: "chegada-retorno",
          tipo: "chegada",
          titulo: "Retorno à Saída (Origem)",
          endereco: sugestao.enderecoCompleto,
          numero: sugestao.numero,
          latitude: sugestao.latitude,
          longitude: sugestao.longitude,
        });
      }
    } else if (campoBuscaAtivo === "chegada") {
      setChegada({
        ...chegada,
        endereco: sugestao.enderecoCompleto,
        numero: sugestao.numero,
        latitude: sugestao.latitude,
        longitude: sugestao.longitude,
      });
    } else {
      setParadas(
        paradas.map((p) =>
          p.id === campoBuscaAtivo
            ? {
                ...p,
                endereco: sugestao.enderecoCompleto,
                numero: sugestao.numero,
                latitude: sugestao.latitude,
                longitude: sugestao.longitude,
              }
            : p,
        ),
      );
    }

    setCampoBuscaAtivo(null);
    setTermoBusca("");
    setSugestoes([]);
    setResultadoRota(null);
  };

  // Calcula a rota viária completa
  const handleCalcularRota = async () => {
    if (saida.latitude === 0 || saida.longitude === 0) {
      toast.error("Por favor, defina o ponto de saída.");
      return;
    }

    const destinoFinal: PontoRota = retornarAoPontoSaida
      ? {
          id: "chegada-retorno",
          tipo: "chegada",
          titulo: "Retorno à Saída (Origem)",
          endereco: saida.endereco,
          latitude: saida.latitude,
          longitude: saida.longitude,
        }
      : chegada;

    if (destinoFinal.latitude === 0 || destinoFinal.longitude === 0) {
      toast.error("Por favor, defina o endereço de chegada (destino) ou marque retornar à saída.");
      return;
    }

    let paradasFinais = [...paradas];

    // Se estiver em modo automático e houver mais de 1 parada, aplica otimização por deslocamento e 2-opt
    if (ordemModo === "auto" && paradas.length > 1) {
      try {
        const rotaOtimizada = await otimizarOrdemParadasLogisticaAvancada(
          saida,
          paradas,
          destinoFinal,
        );
        paradasFinais = rotaOtimizada.slice(1, rotaOtimizada.length - 1);
        setParadas(paradasFinais);
      } catch (err) {
        console.warn("Usando paradas atuais:", err);
      }
    }

    const pontosCompletos = [saida, ...paradasFinais, destinoFinal];
    setCalculandoRota(true);

    try {
      const res = await calcularRotaViariaInteligente(pontosCompletos);
      if (res.sucesso) {
        setResultadoRota(res);
        setAbaMobile("mapa");
        setTimeout(() => leafletMapRef.current?.invalidateSize(), 200);
        toast.success(
          `Trajetória calculada: ${res.distanciaKm} km (~${res.duracaoMinutos} min) ${
            ordemModo === "manual" ? "(Ordem Manual)" : "(Otimizada 2-Opt)"
          }`,
        );
      } else {
        toast.error(res.mensagem || "Não foi possível traçar o trajeto.");
      }
    } catch (err) {
      toast.error("Falha ao comunicar com o motor viário de rotas.");
    } finally {
      setCalculandoRota(false);
    }
  };

  // Copiar resumo completo para o clipboard
  const handleCopiarResumo = () => {
    if (!resultadoRota) return;
    const texto = gerarTextoResumoTrajeto(
      veiculo?.placa || "Veículo",
      resultadoRota.distanciaKm,
      resultadoRota.duracaoMinutos,
      resultadoRota.pontosOrdenados,
      resultadoRota.trechos,
    );
    navigator.clipboard.writeText(texto);
    toast.success("Roteiro detalhado copiado para a área de transferência!");
  };

  // Salvar ou Atualizar trajeto no Banco de Dados Supabase (Limite 5)
  const handleSalvarNoBanco = async (comoNovo: boolean = false) => {
    if (!resultadoRota) {
      toast.error("Calcule a trajetória antes de salvar.");
      return;
    }

    if (!userId) {
      toast.error("Usuário não autenticado para salvar no Banco de Dados.");
      return;
    }

    // Se estiver editando e não for "como novo", faz UPDATE
    if (trajetoEmEdicao && !comoNovo) {
      setSalvandoNoBanco(true);
      try {
        const res = await atualizarTrajetoNoBanco(userId, trajetoEmEdicao.id, {
          nome: nomeTrajetoSalvar.trim() || trajetoEmEdicao.nome,
          retornar_ao_ponto_saida: retornarAoPontoSaida,
          saida,
          paradas,
          chegada: retornarAoPontoSaida ? saida : chegada,
          distancia_km: resultadoRota.distanciaKm,
          duracao_minutos: resultadoRota.duracaoMinutos,
          trechos: resultadoRota.trechos,
        });

        if (res.sucesso) {
          toast.success("Trajeto atualizado com sucesso no Banco de Dados!");
          setModalSalvarAberto(false);
          const novaLista = await listarTrajetosSalvos(userId);
          setTrajetosSalvos(novaLista);
        } else {
          toast.error(res.mensagem || "Erro ao atualizar trajeto.");
        }
      } catch (err: any) {
        toast.error(err.message || "Falha ao atualizar trajeto no Banco de Dados.");
      } finally {
        setSalvandoNoBanco(false);
      }
      return;
    }

    // Caso contrário, faz INSERT (com trava de 5 registros)
    if (trajetosSalvos.length >= 5) {
      toast.error(
        "Limite máximo de 5 trajetos salvos atingido. Exclua um trajeto anterior para salvar um novo.",
      );
      return;
    }

    const nomeFinal =
      nomeTrajetoSalvar.trim() ||
      `Rota ${veiculo ? veiculo.placa : ""} ${new Date().toLocaleDateString("pt-BR")}`;

    setSalvandoNoBanco(true);
    try {
      const res = await salvarTrajetoNoBanco(userId, {
        user_id: userId,
        cliente_id: session?.clienteId || null,
        veiculo_id: veiculo?.id || null,
        nome: nomeFinal,
        retornar_ao_ponto_saida: retornarAoPontoSaida,
        saida,
        paradas,
        chegada: retornarAoPontoSaida ? saida : chegada,
        distancia_km: resultadoRota.distanciaKm,
        duracao_minutos: resultadoRota.duracaoMinutos,
        trechos: resultadoRota.trechos,
      });

      if (res.sucesso) {
        toast.success(res.mensagem || "Trajeto salvo no Banco de Dados!");
        setModalSalvarAberto(false);
        setNomeTrajetoSalvar("");
        setTrajetoEmEdicao(null);
        const novaLista = await listarTrajetosSalvos(userId);
        setTrajetosSalvos(novaLista);
      } else {
        toast.error(res.mensagem || "Erro ao salvar trajeto.");
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao gravar trajeto no Banco de Dados.");
    } finally {
      setSalvandoNoBanco(false);
    }
  };

  // Ativar Rota Monitorada com cálculo de corredor e desvio
  // Se recebeu trajetoInicial, carrega imediatamente
  useEffect(() => {
    if (trajetoInicial) {
      handleCarregarTrajetoSalvo(trajetoInicial, false);
    }
  }, [trajetoInicial]);

  const handleAtivarRotaMonitorada = async () => {
    if (!veiculo) {
      toast.error("Selecione um veículo ativo para monitorar esta rota.");
      return;
    }
    if (
      !resultadoRota ||
      !resultadoRota.coordenadasGeoJson ||
      resultadoRota.coordenadasGeoJson.length < 2
    ) {
      toast.error("É necessário que a rota esteja calculada com pontos de geometria.");
      return;
    }
    try {
      setAtivandoMonitoramento(true);

      // Garante malha viária real pelas ruas antes de ativar o monitoramento
      let coordsParaMonitoramento = resultadoRota.coordenadasGeoJson;
      if (coordsParaMonitoramento.length < 50) {
        try {
          const viarias = await enriquecerTrajetoComMalhaViaria(coordsParaMonitoramento);
          if (viarias && viarias.length > coordsParaMonitoramento.length) {
            coordsParaMonitoramento = viarias;
          }
        } catch {
          // Mantém as coordenadas originais se houver falha
        }
      }

      const nome = `Rota Monitorada ${veiculo.placa} - ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const rotaSalva = await iniciarRotaMonitorada({
        veiculoId: veiculo.id,
        clienteId: veiculo.cliente_id || null,
        nome,
        trajetoSalvoId: trajetoEmEdicao?.id,
        coordenadasRota: coordsParaMonitoramento,
        toleranciaMetros: toleranciaCorredorMetros,
      });
      toast.success(
        "Rota Monitorada ativada! O GD Rastreamento alertará em tempo real se houver desvio de rota.",
      );
      if (onRotaAtivada) {
        onRotaAtivada(rotaSalva);
      }
      setModalAtivarMonitoramento(false);
      onFechar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao ativar monitoramento de rota";
      toast.error(msg);
    } finally {
      setAtivandoMonitoramento(false);
    }
  };

  // Carregar um trajeto salvo do Banco de Dados com traçado automático imediato
  const handleCarregarTrajetoSalvo = async (trajeto: TrajetoSalvo, paraEdicao: boolean = false) => {
    setSaida(trajeto.saida);
    setParadas(trajeto.paradas);
    setRetornarAoPontoSaida(Boolean(trajeto.retornar_ao_ponto_saida));
    setChegada(trajeto.chegada);
    setOrdemModo("manual"); // Respeita a ordem salva originalmente
    setModalListaSalvosAberto(false);

    if (paraEdicao) {
      setTrajetoEmEdicao(trajeto);
      setNomeTrajetoSalvar(trajeto.nome);
      toast.info(`Modo de edição ativado para o trajeto "${trajeto.nome}".`);
    } else {
      setTrajetoEmEdicao(null);
    }

    const destinoFinal = trajeto.retornar_ao_ponto_saida ? trajeto.saida : trajeto.chegada;
    const pontosCompletos = [trajeto.saida, ...(trajeto.paradas || []), destinoFinal];

    setCalculandoRota(true);
    try {
      const res = await calcularRotaViariaInteligente(pontosCompletos);
      if (res.sucesso) {
        setResultadoRota(res);
        toast.success(`Trajeto "${trajeto.nome}" carregado e calculado com sucesso!`);
      } else {
        toast.error(res.mensagem || "Não foi possível traçar a geometria viária.");
      }
    } catch {
      toast.error("Falha ao comunicar com o motor viário de rotas.");
    } finally {
      setCalculandoRota(false);
    }
  };

  // Excluir um trajeto salvo do Banco de Dados
  const handleExcluirTrajetoSalvo = async (id: string, nome: string) => {
    if (!confirm(`Deseja realmente excluir o trajeto "${nome}" do Banco de Dados?`)) return;

    try {
      const res = await excluirTrajetoDoBanco(userId, id);
      if (res.sucesso) {
        toast.success("Trajeto excluído do Banco de Dados.");
        setTrajetosSalvos(trajetosSalvos.filter((t) => t.id !== id));
        if (trajetoEmEdicao?.id === id) {
          setTrajetoEmEdicao(null);
        }
      }
    } catch {
      toast.error("Erro ao excluir trajeto salvo.");
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-5xl h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-2.5rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl pb-safe my-auto">
          {/* Topo do Modal */}
          <div className="p-3.5 sm:p-4 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/90 dark:bg-slate-950/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Navigation className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {isPropriedade
                      ? "Planejamento de Rota de Ronda e Checkpoints"
                      : "Planejamento de Trajeto Inteligente"}
                  </h2>
                  {veiculo && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-bold">
                      {veiculo.placa}
                    </span>
                  )}
                  {isPropriedade && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      POSTO FIXO
                    </span>
                  )}
                  {trajetoEmEdicao && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <Pencil className="h-3 w-3" />
                      <span>Editando: {trajetoEmEdicao.nome}</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isPropriedade
                    ? "Definição de checkpoints georreferenciados para ronda perimetral de vigilantes e segurança patrimonial"
                    : "Otimização por deslocamento viário real (2-Opt) com ajuste manual e edição de rotas salvas"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Botao de Trajetos Salvos em Banco de Dados */}
              <button
                onClick={() => setModalListaSalvosAberto(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                title="Ver e gerenciar rotas salvas no Banco de Dados (máximo 5)"
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                <span>Salvos</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
                  {trajetosSalvos.length}/5
                </span>
              </button>

              <button
                onClick={onFechar}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Banner de Edição Ativa (se houver) */}
          {trajetoEmEdicao && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  Você está alterando a rota salva <strong>"{trajetoEmEdicao.nome}"</strong>. Ao
                  terminar, clique em <strong>Atualizar Rota Salva</strong> para salvar no banco.
                </span>
              </div>
              <button
                onClick={() => {
                  setTrajetoEmEdicao(null);
                  toast.info("Modo de edição cancelado.");
                }}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline ml-2 cursor-pointer"
              >
                Cancelar Edição
              </button>
            </div>
          )}

          {/* Seletor de Visão Mobile / Tablet (Pontos vs Mapa) */}
          <div className="flex lg:hidden items-center border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/80 p-1.5 gap-1.5 shrink-0">
            <button
              onClick={() => setAbaMobile("pontos")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                abaMobile === "pontos"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-800"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Navigation className="h-3.5 w-3.5 text-orange-500" />
              <span>Itinerário e Paradas ({paradas.length})</span>
            </button>
            <button
              onClick={() => {
                setAbaMobile("mapa");
                setTimeout(() => leafletMapRef.current?.invalidateSize(), 150);
              }}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                abaMobile === "mapa"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-800"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Route className="h-3.5 w-3.5 text-orange-500" />
              <span>Mapa Interativo</span>
              {resultadoRota && (
                <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* Corpo do Modal: Split Coluna de Pontos + Mapa */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Lado Esquerdo: Gestão dos Pontos e Paradas (6 colunas) */}
            <div
              className={`lg:col-span-6 p-4 sm:p-5 space-y-3.5 overflow-y-auto max-h-[78vh] ${
                abaMobile === "pontos" ? "block" : "hidden lg:block"
              }`}
            >
              {/* 1. Ponto de Saida */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                    {isPropriedade ? "1. Saída (Ponto Base / Guarita)" : "1. Saída (Origem)"}
                  </span>

                  {veiculo && (
                    <button
                      onClick={() => {
                        setSaida({
                          ...saida,
                          endereco: isPropriedade
                            ? `Ponto Base / Guarita (${veiculo.marca_modelo || veiculo.placa})`
                            : `Posição GPS do veículo ${veiculo.placa}`,
                          latitude: veiculo.latitude || saida.latitude,
                          longitude: veiculo.longitude || saida.longitude,
                        });
                        toast.success(
                          isPropriedade
                            ? "Posição GPS da base / guarita definida como saída!"
                            : "Posição GPS atual do carro definida como saída!",
                        );
                      }}
                      className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-orange-500 flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer"
                    >
                      <LocateFixed className="h-3 w-3" />
                      <span>{isPropriedade ? "Posição da Base" : "Posição do Carro"}</span>
                    </button>
                  )}
                </div>

                {campoBuscaAtivo === "saida" ? (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Digite rua, número, bairro ou cidade..."
                        value={termoBusca}
                        onChange={(e) => setTermoBusca(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-orange-500/50 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                      />
                      <button
                        onClick={() => setCampoBuscaAtivo(null)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {buscandoEnderecos && (
                      <div className="text-[10px] text-slate-400 py-1">
                        Localizando endereços no Brasil...
                      </div>
                    )}

                    {sugestoes.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden max-h-40 overflow-y-auto">
                        {sugestoes.map((sug, i) => (
                          <div
                            key={i}
                            onClick={() => handleSelecionarEndereco(sug)}
                            className="p-2 text-xs hover:bg-orange-500/10 cursor-pointer transition text-slate-700 dark:text-slate-200"
                          >
                            <div className="font-bold text-[11px] flex items-center justify-between gap-1">
                              <span>{sug.nome}</span>
                              {sug.numero && (
                                <span className="px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 font-mono text-[9px] font-bold shrink-0">
                                  Nº {sug.numero}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sug.enderecoCompleto}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setCampoBuscaAtivo("saida");
                      setTermoBusca("");
                    }}
                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 cursor-pointer hover:border-orange-500/40 transition flex items-center justify-between"
                  >
                    <span className="truncate">
                      {saida.endereco || "Clique para definir o endereço de saída..."}
                    </span>
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
                  </div>
                )}
              </div>

              {/* Divisor Visual de Trajetoria */}
              <div className="flex items-center justify-center">
                <ArrowDown className="h-4 w-4 text-slate-400" />
              </div>

              {/* 2. Paradas Intermediarias com Reordenação e Otimização */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {isPropriedade
                        ? `Pontos de Checkpoint da Ronda (${paradas.length})`
                        : `Paradas Intermediárias (${paradas.length})`}
                    </span>

                    {ordemModo === "manual" ? (
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                        Ordem Manual
                      </span>
                    ) : (
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                        Otimizada 2-Opt
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {paradas.length > 1 && (
                      <button
                        onClick={handleReotimizarIA}
                        disabled={otimizandoIA}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition flex items-center gap-1 cursor-pointer"
                        title={
                          isPropriedade
                            ? "Otimizar ordem dos checkpoints pelo caminho mais rápido"
                            : "Otimizar paradas pela Matriz Viária Real e Algoritmo 2-Opt"
                        }
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{otimizandoIA ? "Otimizando..." : "Otimizar por IA"}</span>
                      </button>
                    )}

                    <button
                      onClick={handleAdicionarParada}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{isPropriedade ? "Adicionar Checkpoint" : "Adicionar"}</span>
                    </button>
                  </div>
                </div>

                {paradas.length === 0 ? (
                  <div className="p-3 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400">
                    {isPropriedade
                      ? "Nenhum checkpoint adicionado. Adicione os pontos de passagem e ronda perimetral da propriedade."
                      : "Nenhuma parada adicionada. Adicione quantas visitas ou entregas desejar."}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paradas.map((parada, idx) => {
                      const trechoAtual = resultadoRota?.trechos?.[idx];

                      return (
                        <div
                          key={parada.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                <span>
                                  {isPropriedade ? `Checkpoint ${idx + 1}` : `Parada ${idx + 1}`}
                                </span>
                              </span>

                              {trechoAtual && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-bold">
                                  {trechoAtual.distanciaKm} km · ~{trechoAtual.duracaoMinutos} min
                                </span>
                              )}
                            </div>

                            {/* Controles de Reordenação Manual e Exclusão */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleMoverParada(idx, "cima")}
                                disabled={idx === 0}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 transition cursor-pointer"
                                title="Mover para cima"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => handleMoverParada(idx, "baixo")}
                                disabled={idx === paradas.length - 1}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400 transition cursor-pointer"
                                title="Mover para baixo"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => handleRemoverParada(parada.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer ml-1"
                                title={
                                  isPropriedade ? "Remover este checkpoint" : "Remover esta parada"
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {campoBuscaAtivo === parada.id ? (
                            <div className="space-y-1.5">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder={
                                    isPropriedade
                                      ? "Digite o nome ou local do checkpoint..."
                                      : "Digite o endereço da parada..."
                                  }
                                  value={termoBusca}
                                  onChange={(e) => setTermoBusca(e.target.value)}
                                  className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-amber-500/50 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                                />
                                <button
                                  onClick={() => setCampoBuscaAtivo(null)}
                                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {buscandoEnderecos && (
                                <div className="text-[10px] text-slate-400 py-1">
                                  Buscando endereços...
                                </div>
                              )}

                              {sugestoes.length > 0 && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden max-h-40 overflow-y-auto">
                                  {sugestoes.map((sug, i) => (
                                    <div
                                      key={i}
                                      onClick={() => handleSelecionarEndereco(sug)}
                                      className="p-2 text-xs hover:bg-amber-500/10 cursor-pointer transition text-slate-700 dark:text-slate-200"
                                    >
                                      <div className="font-bold text-[11px] flex items-center justify-between gap-1">
                                        <span>{sug.nome}</span>
                                        {sug.numero && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-bold shrink-0">
                                            Nº {sug.numero}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {sug.enderecoCompleto}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setCampoBuscaAtivo(parada.id);
                                setTermoBusca("");
                              }}
                              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 cursor-pointer hover:border-amber-500/40 transition flex items-center justify-between"
                            >
                              <span className="truncate">
                                {parada.endereco ||
                                  (isPropriedade
                                    ? "Clique para definir o local do checkpoint..."
                                    : "Clique para buscar o endereço da parada...")}
                              </span>
                              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Divisor Visual de Trajetoria */}
              <div className="flex items-center justify-center">
                <ArrowDown className="h-4 w-4 text-slate-400" />
              </div>

              {/* 3. Ponto de Chegada (Destino) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    {isPropriedade
                      ? "Chegada (Retorno à Base / Fim da Ronda)"
                      : "Chegada (Destino Final)"}
                  </span>

                  {/* Opcao de Retornar a Saida */}
                  <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={retornarAoPontoSaida}
                      onChange={(e) => {
                        const marcado = e.target.checked;
                        setRetornarAoPontoSaida(marcado);
                        setResultadoRota(null);
                      }}
                      className="h-3.5 w-3.5 rounded text-orange-500 focus:ring-orange-500 border-slate-300 cursor-pointer"
                    />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {isPropriedade ? "Retornar à Base (Guarita)" : "Retornar à saída"}
                    </span>
                  </label>
                </div>

                {retornarAoPontoSaida ? (
                  <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-700 dark:text-orange-300 flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {isPropriedade
                        ? "Ronda circular: O vigilante retornará ao ponto base/guarita após percorrer todos os checkpoints."
                        : "Rota circular: O veículo retornará ao mesmo endereço de saída."}
                    </span>
                  </div>
                ) : campoBuscaAtivo === "chegada" ? (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Digite o endereço final do destino..."
                        value={termoBusca}
                        onChange={(e) => setTermoBusca(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-rose-500/50 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                      />
                      <button
                        onClick={() => setCampoBuscaAtivo(null)}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {buscandoEnderecos && (
                      <div className="text-[10px] text-slate-400 py-1">
                        Buscando endereço de destino...
                      </div>
                    )}

                    {sugestoes.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden max-h-40 overflow-y-auto">
                        {sugestoes.map((sug, i) => (
                          <div
                            key={i}
                            onClick={() => handleSelecionarEndereco(sug)}
                            className="p-2 text-xs hover:bg-rose-500/10 cursor-pointer transition text-slate-700 dark:text-slate-200"
                          >
                            <div className="font-bold text-[11px] flex items-center justify-between gap-1">
                              <span>{sug.nome}</span>
                              {sug.numero && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono text-[9px] font-bold shrink-0">
                                  Nº {sug.numero}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {sug.enderecoCompleto}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setCampoBuscaAtivo("chegada");
                      setTermoBusca("");
                    }}
                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 cursor-pointer hover:border-rose-500/40 transition flex items-center justify-between"
                  >
                    <span className="truncate">
                      {chegada.endereco || "Clique para definir o destino final..."}
                    </span>
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
                  </div>
                )}
              </div>

              {/* Botões de Ação Principal: Otimizar por IA e Montar Trajetória */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReotimizarIA}
                  disabled={otimizandoIA || calculandoRota}
                  className="sm:col-span-5 py-2.5 px-3 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 active:scale-[0.99] font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  title="Otimizar ordem das paradas intermediárias por IA (Algoritmo 2-Opt)"
                >
                  {otimizandoIA ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span>Otimizando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span>Otimizar por IA</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCalcularRota}
                  disabled={calculandoRota}
                  className="sm:col-span-7 py-2.5 px-3 rounded-2xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  title="Calcular e traçar a rota viária no mapa com cálculo de distância e tempo"
                >
                  {calculandoRota ? (
                    <>
                      <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Calculando...</span>
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4 shrink-0" />
                      <span>
                        {calculandoRota
                          ? "Calculando..."
                          : isPropriedade
                            ? "Montar Rota de Ronda"
                            : ordemModo === "manual"
                              ? "Calcular Trajeto"
                              : "Montar Trajetória"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lado Direito: Mapa Interativo e Metricas da Rota (6 colunas) */}
            <div
              className={`lg:col-span-6 flex flex-col h-full bg-slate-100 dark:bg-slate-950/20 ${
                abaMobile === "mapa" ? "flex" : "hidden lg:flex"
              }`}
            >
              {/* Container do Mapa Leaflet com altura garantida e preenchimento total */}
              <div className="flex-1 min-h-[380px] sm:min-h-[420px] h-[50vh] lg:h-full relative w-full overflow-hidden bg-slate-200 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div
                  ref={mapContainerRef}
                  className="absolute inset-0 w-full h-full z-0 bg-slate-100 dark:bg-slate-900"
                />

                {/* Banner HUD Flutuante de Navegação Waze */}
                {navegacaoVozAtiva &&
                  resultadoRota?.instrucoesManobras &&
                  resultadoRota.instrucoesManobras.length > 0 && (
                    <div className="absolute top-3 left-3 right-3 z-[1000] bg-slate-950/95 border border-orange-500/50 shadow-2xl rounded-2xl p-3 text-white backdrop-blur-md flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-orange-400 shrink-0">
                            <Navigation className="h-5 w-5 animate-pulse" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black font-mono text-orange-400 uppercase tracking-wider">
                                {distanciaParaProximoPasso !== null && distanciaParaProximoPasso > 0
                                  ? distanciaParaProximoPasso > 1000
                                    ? `Em ${(distanciaParaProximoPasso / 1000).toFixed(1)} km`
                                    : `Em ${distanciaParaProximoPasso} m`
                                  : "Siga a rota"}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
                                Passo {passoAtualIdx + 1} de{" "}
                                {resultadoRota.instrucoesManobras.length}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-slate-100 truncate">
                              {resultadoRota.instrucoesManobras[passoAtualIdx]?.texto ||
                                "Siga em frente"}
                            </h4>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            pararVoz();
                            setNavegacaoVozAtiva(false);
                            toast.info("Navegação guiada por voz encerrada.");
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 transition shrink-0 cursor-pointer"
                          title="Encerrar Navegação"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Próximo passo preview */}
                      {resultadoRota.instrucoesManobras[passoAtualIdx + 1] && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1.5 border-t border-slate-800">
                          <span className="text-slate-500 font-bold uppercase text-[9px]">
                            Depois:
                          </span>
                          <span className="truncate">
                            {resultadoRota.instrucoesManobras[passoAtualIdx + 1].texto}
                          </span>
                        </div>
                      )}

                      {/* Controles manuais rápidos */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={passoAtualIdx === 0}
                            onClick={handleVoltarPassoManual}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[10px] font-bold text-slate-300 transition cursor-pointer"
                          >
                            ◀ Voltar
                          </button>
                          <button
                            type="button"
                            onClick={handleRepetirPassoAtual}
                            className="px-2.5 py-1 rounded bg-orange-500/20 hover:bg-orange-500/30 text-[10px] font-bold text-orange-300 border border-orange-500/40 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Volume2 className="h-3 w-3" />
                            <span>Repetir</span>
                          </button>
                          <button
                            type="button"
                            disabled={passoAtualIdx >= resultadoRota.instrucoesManobras.length - 1}
                            onClick={handleAvancarPassoManual}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[10px] font-bold text-slate-300 transition cursor-pointer"
                          >
                            Avançar ▶
                          </button>
                        </div>

                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                          Deslocamento GPS
                        </span>
                      </div>
                    </div>
                  )}
              </div>

              {/* Painel Inferior de Metricas e Exportacao */}
              {resultadoRota ? (
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
                  {/* Metricas Consolidadas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                      <Gauge className="h-5 w-5 text-orange-500 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">
                          Distância Total
                        </div>
                        <div className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-slate-100">
                          {resultadoRota.distanciaKm} km
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                      <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">
                          Tempo Total
                        </div>
                        <div className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-slate-100">
                          {Math.floor(resultadoRota.duracaoMinutos / 60) > 0
                            ? `${Math.floor(resultadoRota.duracaoMinutos / 60)}h ${resultadoRota.duracaoMinutos % 60}m`
                            : `${resultadoRota.duracaoMinutos} min`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Acordeão de Itinerário Detalhado por Ponto */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setMostrarItinerarioDetalhado(!mostrarItinerarioDetalhado)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950/40 text-left text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <ListOrdered className="h-3.5 w-3.5 text-orange-500" />
                        <span>Itinerário Detalhado ({resultadoRota.trechos.length} trechos)</span>
                      </span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                          mostrarItinerarioDetalhado ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {mostrarItinerarioDetalhado && (
                      <div className="p-2.5 max-h-36 overflow-y-auto space-y-1.5 text-xs bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                        {resultadoRota.trechos.map((t) => (
                          <div
                            key={t.indice}
                            className="pt-1.5 first:pt-0 flex items-center justify-between"
                          >
                            <div className="truncate pr-2">
                              <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                                {t.origemTitulo} ➔ {t.destinoTitulo}:
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {t.destinoEndereco}
                              </span>
                            </div>
                            <span className="shrink-0 font-mono font-bold text-[11px] text-orange-600 dark:text-orange-400">
                              {t.distanciaKm} km (~{t.duracaoMinutos}m)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Acordeão de Orientações Faladas por Rua Estilo Waze */}
                  {resultadoRota.instrucoesManobras &&
                    resultadoRota.instrucoesManobras.length > 0 && (
                      <div className="border border-orange-500/30 dark:border-orange-500/20 rounded-xl overflow-hidden bg-orange-50/20 dark:bg-orange-950/20">
                        <button
                          onClick={() => setMostrarOrientacoesVoz(!mostrarOrientacoesVoz)}
                          className="w-full px-3 py-2 text-left text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between hover:bg-orange-500/10 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Radio className="h-3.5 w-3.5 text-orange-500" />
                            <span>
                              Orientações Faladas Waze ({resultadoRota.instrucoesManobras.length}{" "}
                              vias/manobras)
                            </span>
                            {falandoVoz && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500 text-slate-950 font-black animate-pulse">
                                AO VIVO
                              </span>
                            )}
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              mostrarOrientacoesVoz ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {mostrarOrientacoesVoz && (
                          <div className="p-2.5 max-h-40 overflow-y-auto space-y-1.5 text-xs bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                            {resultadoRota.instrucoesManobras.map((manobra, idx) => {
                              const isFalandoEsta =
                                (navegacaoVozAtiva && passoAtualIdx === idx) ||
                                (falandoVoz && indiceVozAtual === idx);
                              return (
                                <div
                                  key={manobra.id}
                                  className={`pt-1.5 first:pt-0 flex items-center justify-between gap-2 p-1.5 rounded-lg transition ${
                                    isFalandoEsta
                                      ? "bg-orange-500/20 border border-orange-400/60 font-bold"
                                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-mono font-black shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="truncate">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-slate-800 dark:text-slate-100 block truncate font-medium">
                                          {manobra.texto}
                                        </span>
                                        {navegacaoVozAtiva && passoAtualIdx === idx && (
                                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-orange-500 text-slate-950 uppercase shrink-0">
                                            PASSO ATUAL
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[9px] text-slate-400 font-mono">
                                        {manobra.distanciaMetros > 0
                                          ? `${manobra.distanciaMetros}m`
                                          : "No local"}{" "}
                                        · {manobra.nomeRua}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleOuvirManobra(manobra, idx)}
                                    className="p-1.5 rounded-lg hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 transition shrink-0"
                                    title="Ouvir esta orientação"
                                  >
                                    <Volume2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                  {/* Botoes de Exportacao e Salvamento */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* Botão de Áudio Waze Falado com Deslocamento em Tempo Real */}
                    <button
                      type="button"
                      onClick={handleAlternarNavegacaoWaze}
                      className={`flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        navegacaoVozAtiva
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md animate-pulse font-black"
                          : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/25"
                      }`}
                      title="Navegação passo a passo com orientações por voz sincronizadas ao deslocamento do veículo"
                    >
                      {navegacaoVozAtiva ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-orange-500" />
                      )}
                      <span>
                        {navegacaoVozAtiva ? "Pausar Navegação Waze" : "Ouvir Rota Waze (Ao Vivo)"}
                      </span>
                    </button>

                    {/* Google Maps com waypoints na ordem calculada */}
                    <a
                      href={gerarLinkGoogleMaps(resultadoRota.pontosOrdenados)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Google Maps</span>
                    </a>

                    {/* Waze Interativo com seletor de paradas */}
                    <div className="relative flex-1 min-w-[110px]">
                      <button
                        onClick={() => setMenuWazeAberto(!menuWazeAberto)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 transition cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Waze</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>

                      {menuWazeAberto && (
                        <div className="absolute bottom-full mb-1 left-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 space-y-1.5 animate-in fade-in">
                          <div className="text-[10px] font-bold text-slate-400 uppercase px-1">
                            Navegar via Waze (ponto a ponto):
                          </div>

                          <div className="max-h-44 overflow-y-auto space-y-1">
                            {resultadoRota.pontosOrdenados.slice(1).map((ponto) => (
                              <a
                                key={ponto.id}
                                href={gerarLinkWazePonto(ponto)}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="block p-1.5 rounded-lg hover:bg-orange-500/10 text-slate-800 dark:text-slate-200 transition text-[11px]"
                              >
                                <div className="font-bold text-orange-600 dark:text-orange-400">
                                  {ponto.titulo}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {ponto.endereco}
                                </div>
                              </a>
                            ))}
                          </div>

                          <div className="text-[9px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1 px-1">
                            *O Waze aceita 1 destino por vez. Para todos os pontos juntos, use
                            Google Maps.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Copiar Resumo */}
                    <button
                      onClick={handleCopiarResumo}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                      title="Copiar resumo de texto da rota"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar</span>
                    </button>

                    {/* Salvar ou Atualizar Trajeto no Banco de Dados Supabase */}
                    {trajetoEmEdicao ? (
                      <button
                        onClick={() => setModalSalvarAberto(true)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition flex items-center gap-1.5 shadow cursor-pointer"
                        title="Salvar alterações no trajeto já existente no Banco de Dados"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Atualizar Salvo</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setNomeTrajetoSalvar(
                            `Rota ${veiculo ? veiculo.placa : ""} ${new Date().toLocaleDateString(
                              "pt-BR",
                            )}`,
                          );
                          setModalSalvarAberto(true);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition flex items-center gap-1.5 cursor-pointer"
                        title="Salvar trajeto no Banco de Dados (máximo 5 salvos)"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        <span>Salvar em BD</span>
                      </button>
                    )}

                    {/* Ativar Rota Monitorada com Alerta de Desvio pelas Ruas */}
                    {veiculo && (
                      <button
                        onClick={() => setModalAtivarMonitoramento(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md shadow-orange-500/20 hover:from-orange-400 hover:to-amber-400 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                        title="Ativar como Rota Monitorada Oficial com alerta em tempo real se o veículo sair das ruas deste trajeto"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        <span>Ativar Rota Monitorada</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-400 shrink-0">
                  Adicione as paradas e clique em <b>Montar Trajetória Inteligente</b>. Você pode
                  mover paradas para cima/baixo para ajustar a ordem manualmente.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Dialog: Salvar ou Atualizar Trajeto no Banco de Dados */}
        {modalSalvarAberto && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-5 w-5 text-amber-500" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {trajetoEmEdicao ? "Atualizar Rota Salva" : "Salvar Trajeto no Banco de Dados"}
                  </h3>
                </div>
                <button
                  onClick={() => setModalSalvarAberto(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {trajetoEmEdicao
                  ? "Confirme o nome da rota para salvar as alterações diretamente no registro existente do Banco de Dados."
                  : "Você pode manter até 5 trajetos salvos no banco de dados para carregar quando quiser. Trajetos sem salvar continuam ilimitados."}
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome do Trajeto
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex.: Rota Diária Centro, Entregas Lote 1..."
                  value={nomeTrajetoSalvar}
                  onChange={(e) => setNomeTrajetoSalvar(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Vagas em Banco de Dados:</span>
                <span className="font-mono font-bold text-amber-500">
                  {trajetoEmEdicao
                    ? "Atualizando registro existente (mantém vaga)"
                    : `${5 - trajetosSalvos.length} restantes de 5`}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
                <button
                  onClick={() => setModalSalvarAberto(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>

                {trajetoEmEdicao && (
                  <button
                    onClick={() => handleSalvarNoBanco(true)}
                    disabled={salvandoNoBanco || trajetosSalvos.length >= 5}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 transition cursor-pointer"
                    title="Criar uma cópia mantendo o trajeto original intacto"
                  >
                    Salvar como Nova
                  </button>
                )}

                <button
                  onClick={() => handleSalvarNoBanco(false)}
                  disabled={salvandoNoBanco}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  {salvandoNoBanco ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Gravando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{trajetoEmEdicao ? "Atualizar Rota" : "Confirmar e Salvar"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Dialog: Ativar Rota Monitorada */}
        {modalAtivarMonitoramento && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-orange-500" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Ativar Rota Monitorada
                  </h3>
                </div>
                <button
                  onClick={() => setModalAtivarMonitoramento(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                O GD Rastreamento criará uma cerca viva de corredor inteligente ao longo de toda a
                rota viária gerada ({resultadoRota?.distanciaKm} km). Se o veículo{" "}
                <b className="text-slate-700 dark:text-slate-200">{veiculo?.placa}</b> sair desse
                corredor viário, um alerta de alta prioridade será gerado imediatamente.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tolerância do Corredor (Distância Lateral Permitida)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 150, 250, 500].map((tol) => (
                    <button
                      key={tol}
                      type="button"
                      onClick={() => setToleranciaCorredorMetros(tol)}
                      className={`py-2 px-1 text-xs rounded-xl font-bold border transition ${
                        toleranciaCorredorMetros === tol
                          ? "bg-orange-500 text-slate-950 border-orange-400 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {tol}m
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Recomendado 150m para vias urbanas para evitar falso-positivo em desvios de faixas
                  e rotatórias.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setModalAtivarMonitoramento(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAtivarRotaMonitorada}
                  disabled={ativandoMonitoramento}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  {ativandoMonitoramento ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Ativando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Confirmar Ativação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Dialog: Lista dos Trajetos Salvos em Banco de Dados com Opção de Editar */}
        {modalListaSalvosAberto && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-amber-500" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Trajetos Salvos no Banco de Dados ({trajetosSalvos.length}/5)
                  </h3>
                </div>
                <button
                  onClick={() => setModalListaSalvosAberto(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                Gerencie seus até 5 trajetos salvos. Você pode <strong>carregar</strong> para rodar,{" "}
                <strong>editar</strong> os pontos para atualizar o registro ou{" "}
                <strong>excluir</strong> para liberar vaga.
              </p>

              <div className="flex-1 overflow-y-auto space-y-2.5">
                {carregandoSalvos ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Carregando trajetos do Banco de Dados...
                  </div>
                ) : trajetosSalvos.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    Nenhum trajeto salvo ainda. Você pode salvar até 5 rotas favoritas.
                  </div>
                ) : (
                  trajetosSalvos.map((tr) => (
                    <div
                      key={tr.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {tr.nome}
                        </div>
                        <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2">
                          <span>{new Date(tr.created_at).toLocaleDateString("pt-BR")}</span>
                          <span>•</span>
                          <span className="text-orange-500 font-bold">{tr.distancia_km} km</span>
                          <span>•</span>
                          <span>~{tr.duracao_minutos} min</span>
                          <span>•</span>
                          <span>{tr.paradas.length} paradas</span>
                          {tr.retornar_ao_ponto_saida && (
                            <span className="text-orange-500 font-bold">(Circular)</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCarregarTrajetoSalvo(tr, false)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 hover:bg-orange-500/25 transition cursor-pointer"
                          title="Carregar este trajeto na tela"
                        >
                          Carregar
                        </button>

                        <button
                          onClick={() => handleCarregarTrajetoSalvo(tr, true)}
                          className="p-1.5 rounded-xl text-amber-500 hover:bg-amber-500/15 transition cursor-pointer"
                          title="Editar pontos e atualizar este trajeto salvo"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => handleExcluirTrajetoSalvo(tr.id, tr.nome)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 transition cursor-pointer"
                          title="Excluir trajeto salvo do Banco de Dados"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
                <button
                  onClick={() => setModalListaSalvosAberto(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
