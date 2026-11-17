/**
 * Sistema de Agrupamento Tático de Veículos (Clustering Hunter)
 * Conforme solicitação operacional:
 * Ao diminuir muito o mapa (aumentar a distância), agrupa os veículos exibindo
 * a quantidade em um círculo com fundo laranja escuro e número em preto.
 * Ao dar zoom ou clicar no número, aproxima e volta a exibir o pin individual.
 */

import type { VeiculoGps } from "../types";
import { coordenadaValidaMapa } from "./interpolacaoMapaSuave";

export interface ClusterItem {
  id: string;
  quantidade: number;
  latitude: number;
  longitude: number;
  bounds: [[number, number], [number, number]]; // [[minLat, minLng], [maxLat, maxLng]]
  veiculos: VeiculoGps[];
}

export type ElementoMapaGps =
  { tipo: "veiculo"; veiculo: VeiculoGps } | { tipo: "cluster"; cluster: ClusterItem };

/**
 * Converte coordenada geográfica em coordenadas de pixel Web Mercator para o zoom fornecido
 */
function latLngParaPixelMercator(lat: number, lng: number, zoom: number): [number, number] {
  const sinY = Math.sin((lat * Math.PI) / 180);
  const clampedSinY = Math.min(Math.max(sinY, -0.9999), 0.9999);
  const escala = 256 * Math.pow(2, zoom);
  const x = (escala * (lng + 180)) / 360;
  const y = escala * (0.5 - Math.log((1 + clampedSinY) / (1 - clampedSinY)) / (4 * Math.PI));
  return [x, y];
}

/**
 * Agrupa veículos por proximidade em tela para o nível de zoom atual.
 * Quando zoom > maxClusterZoom (ex: zoom >= 14), retorna os veículos individualmente.
 */
export function clusterizarVeiculos(
  veiculos: VeiculoGps[],
  zoom: number,
  maxClusterZoom = 13,
  raioPixels = 65,
): ElementoMapaGps[] {
  const validos = veiculos.filter((v) => coordenadaValidaMapa(v.latitude, v.longitude));

  // Ao dar zoom suficiente (zoom >= 14) ou com apenas 1 veículo, exibe o pin individual
  if (zoom > maxClusterZoom || validos.length <= 1) {
    return validos.map((v) => ({ tipo: "veiculo", veiculo: v }));
  }

  interface GrupoTemp {
    pxX: number;
    pxY: number;
    latTotal: number;
    lngTotal: number;
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    veiculos: VeiculoGps[];
  }

  const grupos: GrupoTemp[] = [];

  for (const v of validos) {
    const [pxX, pxY] = latLngParaPixelMercator(v.latitude, v.longitude, zoom);

    let adicionado = false;
    for (const g of grupos) {
      const dist = Math.hypot(g.pxX - pxX, g.pxY - pxY);
      if (dist <= raioPixels) {
        g.veiculos.push(v);
        g.latTotal += v.latitude;
        g.lngTotal += v.longitude;
        g.minLat = Math.min(g.minLat, v.latitude);
        g.maxLat = Math.max(g.maxLat, v.latitude);
        g.minLng = Math.min(g.minLng, v.longitude);
        g.maxLng = Math.max(g.maxLng, v.longitude);

        // Atualiza a posição média em pixels ponderada pelo número de veículos
        const n = g.veiculos.length;
        g.pxX = (g.pxX * (n - 1) + pxX) / n;
        g.pxY = (g.pxY * (n - 1) + pxY) / n;
        adicionado = true;
        break;
      }
    }

    if (!adicionado) {
      grupos.push({
        pxX,
        pxY,
        latTotal: v.latitude,
        lngTotal: v.longitude,
        minLat: v.latitude,
        maxLat: v.latitude,
        minLng: v.longitude,
        maxLng: v.longitude,
        veiculos: [v],
      });
    }
  }

  const elementos: ElementoMapaGps[] = [];

  for (const g of grupos) {
    if (g.veiculos.length === 1) {
      elementos.push({ tipo: "veiculo", veiculo: g.veiculos[0] });
    } else {
      const total = g.veiculos.length;
      const latCentro = g.latTotal / total;
      const lngCentro = g.lngTotal / total;
      const clusterId = `cluster-${latCentro.toFixed(4)}-${lngCentro.toFixed(4)}-${total}`;

      elementos.push({
        tipo: "cluster",
        cluster: {
          id: clusterId,
          quantidade: total,
          latitude: latCentro,
          longitude: lngCentro,
          bounds: [
            [g.minLat, g.minLng],
            [g.maxLat, g.maxLng],
          ],
          veiculos: g.veiculos,
        },
      });
    }
  }

  return elementos;
}

/**
 * Gera o HTML tático do marcador de agrupamento (Cluster).
 * Regra inegociável do usuário:
 * Círculo com fundo laranja escuro e número em preto.
 */
export function gerarMarcadorClusterHtml(quantidade: number): string {
  const tamanho = quantidade > 99 ? 50 : quantidade > 9 ? 46 : 42;
  const fontSize = quantidade > 99 ? "14px" : quantidade > 9 ? "16px" : "17px";

  return `
    <div
      class="hunter-cluster-marker group cursor-pointer select-none transition-transform duration-200 hover:scale-110 active:scale-95"
      style="width: ${tamanho}px; height: ${tamanho}px; position: relative; display: flex; align-items: center; justify-content: center;"
      title="${quantidade} veículos concentrados nesta região. Toque para aproximar."
    >
      <!-- Halo pulsante de radar -->
      <span style="position: absolute; inset: -4px; border-radius: 9999px; background: rgba(234, 88, 12, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>

      <!-- Círculo com fundo laranja escuro conforme regra do usuário -->
      <div style="
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 9999px;
        background: linear-gradient(135deg, #f97316 0%, #ea580c 45%, #c2410c 100%);
        border: 3px solid #7c2d12;
        box-shadow: 0 4px 12px rgba(194, 65, 12, 0.55), inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <!-- Número em preto com alto contraste conforme solicitação do usuário -->
        <span style="
          color: #000000;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: ${fontSize};
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.03em;
          text-shadow: 0 1px 1px rgba(255, 255, 255, 0.35);
        ">
          ${quantidade}
        </span>
      </div>
    </div>
  `.trim();
}
