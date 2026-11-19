import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PostoVigilancia, RondaCheckpoint } from "../types";

interface MapaRondaVigilanteProps {
  posto: PostoVigilancia;
  checkpoints: RondaCheckpoint[];
  posicaoVigilante?: {
    latitude: number;
    longitude: number;
    nome?: string;
    ultimaAtualizacao?: string;
  } | null;
  modoAdicionarPonto?: boolean;
  onAdicionarPontoClick?: (coords: { latitude: number; longitude: number }) => void;
  alturaPx?: number;
}

export function MapaRondaVigilante({
  posto,
  checkpoints,
  posicaoVigilante,
  modoAdicionarPonto = false,
  onAdicionarPontoClick,
  alturaPx = 420,
}: MapaRondaVigilanteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const perimetroLayerRef = useRef<L.Polygon | L.Circle | null>(null);
  const checkpointsLayerRef = useRef<L.LayerGroup | null>(null);
  const vigilanteMarkerRef = useRef<L.Marker | null>(null);

  // Inicializa mapa em ultra-zoom (zoom 18 - 21)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const latInit = posto.latitude || -22.48;
    const lngInit = posto.longitude || -44.05;

    const map = L.map(containerRef.current, {
      center: [latInit, lngInit],
      zoom: 19, // Ultra aproximação nível lote/imóvel
      maxZoom: 21,
      zoomControl: true,
      attributionControl: false,
    });

    // TileLayer OpenStreetMap com suporte a zoom 21
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
  }, [posto.latitude, posto.longitude]);

  // Atualiza Perímetro Geral da Propriedade (Polígono ou Círculo)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (perimetroLayerRef.current) {
      map.removeLayer(perimetroLayerRef.current);
      perimetroLayerRef.current = null;
    }

    if (posto.perimetro_poligono?.coordinates && posto.perimetro_poligono.coordinates.length >= 3) {
      const poly = L.polygon(posto.perimetro_poligono.coordinates, {
        color: "#10b981", // Verde perimetral
        weight: 3,
        fillColor: "#10b981",
        fillOpacity: 0.12,
        dashArray: "6, 6",
      }).addTo(map);

      poly.bindTooltip(`Perímetro: ${posto.nome}`, {
        direction: "top",
        className: "bg-slate-900 text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded shadow",
      });

      perimetroLayerRef.current = poly;
    } else {
      const circle = L.circle([posto.latitude, posto.longitude], {
        radius: posto.raio_metros || 100,
        color: "#10b981",
        weight: 2,
        fillColor: "#10b981",
        fillOpacity: 0.1,
      }).addTo(map);

      perimetroLayerRef.current = circle;
    }
  }, [posto]);

  // Atualiza Checkpoints em Azul Tático com Horário Previsto (±3 min)
  useEffect(() => {
    const layerGroup = checkpointsLayerRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    checkpoints.forEach((cp, idx) => {
      // Marcador azul com anel externo pulsante
      const customIcon = L.divIcon({
        className: "relative flex items-center justify-center",
        html: `
          <div style="
            background-color: #2563eb;
            color: #ffffff;
            width: 28px;
            height: 28px;
            border-radius: 9999px;
            border: 2.5px solid #ffffff;
            box-shadow: 0 4px 10px rgba(37, 99, 235, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 900;
            font-family: monospace;
          ">
            ${idx + 1}
          </div>
          <div style="
            position: absolute;
            width: 38px;
            height: 38px;
            border-radius: 9999px;
            border: 2px dashed #2563eb;
            opacity: 0.6;
            animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([cp.latitude, cp.longitude], { icon: customIcon });

      const horaCurta = cp.horario_previsto ? cp.horario_previsto.slice(0, 5) : "--:--";
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #0f172a; padding: 4px;">
          <strong style="color: #2563eb; font-size: 13px; display: block;">📍 ${cp.nome}</strong>
          <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
            <span>⏰ Horário Previsto:</span>
            <strong style="background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe;">
              ${horaCurta}
            </strong>
          </div>
          <div style="color: #64748b; font-size: 11px; margin-top: 4px;">
            Janela de Tolerância: <strong>±${cp.tolerancia_minutos || 3} minutos</strong>
          </div>
          <div style="color: #64748b; font-size: 10px; margin-top: 2px;">
            Raio de Captura: ${cp.raio_captura_metros || 5} metros
          </div>
        </div>
      `);

      marker.bindTooltip(
        `Checkpoint ${idx + 1}: ${cp.nome} (${horaCurta} ±${cp.tolerancia_minutos || 3}m)`,
        {
          direction: "top",
          offset: [0, -14],
          className:
            "bg-blue-950 text-blue-200 text-[11px] font-bold px-2 py-0.5 rounded shadow border border-blue-800",
        },
      );

      layerGroup.addLayer(marker);
    });
  }, [checkpoints]);

  // Atualiza Marcador do Vigilante (Pessoa Rastreada)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (posicaoVigilante && posicaoVigilante.latitude && posicaoVigilante.longitude) {
      const vigilanteIcon = L.divIcon({
        className: "relative flex items-center justify-center",
        html: `
          <div style="
            background: linear-gradient(135deg, #ea580c, #c2410c);
            color: #ffffff;
            width: 32px;
            height: 32px;
            border-radius: 9999px;
            border: 2.5px solid #ffffff;
            box-shadow: 0 4px 14px rgba(234, 88, 12, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          ">
            👮
          </div>
          <div style="
            position: absolute;
            width: 44px;
            height: 44px;
            border-radius: 9999px;
            background: rgba(234, 88, 12, 0.25);
            animation: pulse 1.5s infinite;
          "></div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!vigilanteMarkerRef.current) {
        const marker = L.marker([posicaoVigilante.latitude, posicaoVigilante.longitude], {
          icon: vigilanteIcon,
          zIndexOffset: 1000,
        }).addTo(map);

        marker.bindTooltip(
          `Vigilante: ${posicaoVigilante.nome || "Em Turno"}${posicaoVigilante.ultimaAtualizacao ? ` • ${posicaoVigilante.ultimaAtualizacao}` : ""}`,
          {
            permanent: true,
            direction: "bottom",
            offset: [0, 16],
            className:
              "bg-slate-950 text-orange-400 font-bold text-[10px] px-2 py-0.5 rounded border border-orange-500/30 shadow",
          },
        );

        vigilanteMarkerRef.current = marker;
      } else {
        vigilanteMarkerRef.current.setLatLng([
          posicaoVigilante.latitude,
          posicaoVigilante.longitude,
        ]);
        vigilanteMarkerRef.current.setTooltipContent(
          `Vigilante: ${posicaoVigilante.nome || "Em Turno"}${posicaoVigilante.ultimaAtualizacao ? ` • ${posicaoVigilante.ultimaAtualizacao}` : ""}`,
        );
      }
    } else if (vigilanteMarkerRef.current) {
      map.removeLayer(vigilanteMarkerRef.current);
      vigilanteMarkerRef.current = null;
    }
  }, [posicaoVigilante]);

  // Clique no mapa para adicionar novo ponto
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (modoAdicionarPonto && onAdicionarPontoClick) {
        onAdicionarPontoClick({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [modoAdicionarPonto, onAdicionarPontoClick]);

  return (
    <div
      ref={containerRef}
      style={{ height: `${alturaPx}px` }}
      className={`w-full rounded-2xl overflow-hidden border border-slate-300/80 dark:border-slate-800 shadow-inner relative z-0 ${
        modoAdicionarPonto ? "cursor-crosshair ring-2 ring-blue-500" : ""
      }`}
    />
  );
}
