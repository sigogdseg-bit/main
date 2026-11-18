import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Layers, Undo, Trash2, CheckCircle2, Info } from "lucide-react";
import { calcularCentroidePoligono } from "../services/protecaoVeiculoService";

interface MapaEditorPoligonoProps {
  pontosIniciais?: [number, number][]; // [[lat, lng], ...]
  latitudeCentro?: number;
  longitudeCentro?: number;
  onPoligonoChange: (
    pontos: [number, number][],
    centroide: { latitude: number; longitude: number; raioAproximadoMetros: number },
  ) => void;
  alturaPx?: number;
}

export function MapaEditorPoligono({
  pontosIniciais = [],
  latitudeCentro,
  longitudeCentro,
  onPoligonoChange,
  alturaPx = 280,
}: MapaEditorPoligonoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [pontos, setPontos] = useState<[number, number][]>(pontosIniciais);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Notifica o pai quando os pontos mudam
  const atualizarParent = useCallback(
    (novosPontos: [number, number][]) => {
      const centroide = calcularCentroidePoligono(novosPontos);
      onPoligonoChange(novosPontos, centroide);
    },
    [onPoligonoChange],
  );

  // Inicializa mapa Leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const latInit = latitudeCentro && latitudeCentro !== 0 ? latitudeCentro : -22.48;
    const lngInit = longitudeCentro && longitudeCentro !== 0 ? longitudeCentro : -44.05;

    const map = L.map(containerRef.current, {
      center: [latInit, lngInit],
      zoom: 17,
      maxZoom: 21,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // TileLayer padrão OSM com alta nitidez
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxNativeZoom: 19,
      maxZoom: 21,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitudeCentro, longitudeCentro]);

  // Desloca o mapa dinamicamente quando o centro mudar (ex.: via busca de endereço)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !latitudeCentro || !longitudeCentro) return;
    map.flyTo([latitudeCentro, longitudeCentro], 18, {
      duration: 1.2,
      animate: true,
    });
  }, [latitudeCentro, longitudeCentro]);

  // Renderiza polígono, polylines e vértices clicáveis
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpa camadas antigas
    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }
    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    // Se temos 3 ou mais pontos: desenha polígono fechado
    if (pontos.length >= 3) {
      const poly = L.polygon(pontos, {
        color: "#ea580c", // Laranja GD
        weight: 3,
        fillColor: "#ea580c",
        fillOpacity: 0.22,
        dashArray: "4, 4",
      }).addTo(map);
      polygonLayerRef.current = poly;
    } else if (pontos.length === 2) {
      // 2 pontos: linha aberta
      const line = L.polyline(pontos, {
        color: "#ea580c",
        weight: 3,
        dashArray: "4, 4",
      }).addTo(map);
      polylineLayerRef.current = line;
    }

    // Desenha cada ponto como um CircleMarker interativo
    pontos.forEach((p, idx) => {
      const marker = L.circleMarker(p, {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#ea580c",
        fillOpacity: 1,
      }).addTo(map);

      marker.bindTooltip(`Ponto ${idx + 1} (Clique para remover)`, {
        direction: "top",
        offset: [0, -8],
        className: "bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow",
      });

      // Ao clicar em cima do ponto: remove-o
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        setPontos((atuais) => {
          const filtrados = atuais.filter((_, i) => i !== idx);
          atualizarParent(filtrados);
          return filtrados;
        });
      });

      markersRef.current.push(marker);
    });
  }, [pontos, atualizarParent]);

  // Evento de clique no mapa para adicionar novo ponto
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const novoPonto: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPontos((atuais) => {
        const novos = [...atuais, novoPonto];
        atualizarParent(novos);
        return novos;
      });
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [atualizarParent]);

  const limparPontos = () => {
    setPontos([]);
    atualizarParent([]);
  };

  const desfazUltimoPonto = () => {
    setPontos((atuais) => {
      const novos = atuais.slice(0, atuais.length - 1);
      atualizarParent(novos);
      return novos;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-orange-500" />
          Desenho Interativo da Área ({pontos.length} ponto{pontos.length === 1 ? "" : "s"})
        </span>
        <div className="flex items-center gap-1">
          {pontos.length > 0 && (
            <>
              <button
                type="button"
                onClick={desfazUltimoPonto}
                className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                title="Remover último ponto"
              >
                <Undo className="h-3 w-3" /> Desfazer
              </button>
              <button
                type="button"
                onClick={limparPontos}
                className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                title="Limpar todos os pontos"
              >
                <Trash2 className="h-3 w-3" /> Limpar
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ height: `${alturaPx}px` }}
        className="w-full rounded-2xl overflow-hidden border border-slate-300/80 dark:border-slate-800 shadow-inner relative z-0"
      />

      <div className="flex items-start gap-1.5 p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-800 dark:text-orange-300">
        <Info className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
        <div>
          {pontos.length < 3 ? (
            <span>
              Clique no mapa para marcar os pontos. Ao marcar <strong>pelo menos 3 pontos</strong>,
              eles se unirão automaticamente formando o perímetro fechado.
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              Área poligonal ativa e fechada! Clique em novos locais para expandir ou clique em cima
              de um ponto para removê-lo.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
