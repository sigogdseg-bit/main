import { Coord, haversineMeters } from "./vehicleMotionEngine";

export interface SnapRoadPoint {
  lat: number;
  lng: number;
  timestamp?: number;
}

export interface SnapRoadResponse {
  ok: boolean;
  motivo?: string;
  vertices: Coord[];
}

/**
 * Requisita Map Matching (snap-to-road) com timeout estrito de 1500ms
 * Se o backend responder em até 1500ms com vértices válidos, devolve o caminho;
 * Caso contrário (erro, timeout ou token ausente), devolve null de forma transparente.
 */
export async function requisitarSnapToRoad(
  pontos: SnapRoadPoint[],
  signal?: AbortSignal,
): Promise<Coord[] | null> {
  if (!pontos || pontos.length < 2) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const onParentAbort = () => {
      clearTimeout(timeoutId);
      controller.abort();
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        return null;
      }
      signal.addEventListener("abort", onParentAbort, { once: true });
    }

    const res = await fetch("/api/mapa/snap-road", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pontos }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (signal) {
      signal.removeEventListener("abort", onParentAbort);
    }

    if (!res.ok) return null;
    const data = (await res.json()) as SnapRoadResponse;
    if (data && data.ok && Array.isArray(data.vertices) && data.vertices.length >= 2) {
      return data.vertices;
    }
    return null;
  } catch {
    return null;
  }
}
