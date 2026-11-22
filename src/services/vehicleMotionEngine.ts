export interface Coord {
  lat: number;
  lng: number;
}

export interface FrameState {
  lat: number;
  lng: number;
  bearing: number;
}

type FrameCallback = (state: FrameState) => void;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calcBearing(a: Coord, b: Coord): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function lerpBearing(start: number, end: number, t: number): number {
  const diff = ((end - start + 540) % 360) - 180;
  return (start + diff * t + 360) % 360;
}

async function fetchRoadPolyline(from: Coord, to: Coord): Promise<Coord[]> {
  const straightDist = haversineMeters(from, to);
  if (straightDist < 10) return [from, to];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [from, to];

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return [from, to];

    // Trava de sanidade: descarta se o OSRM tentar dar a volta no quarteirao
    if (route.distance > straightDist * 3 && route.distance > 120) {
      return [from, to];
    }

    return route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
      lat,
      lng,
    }));
  } catch {
    return [from, to];
  } finally {
    clearTimeout(timeout);
  }
}

export class VehicleMotionController {
  private currentPos: Coord;
  private currentBearing: number = 0;
  private lastPacketTime: number = Date.now();
  private rafId: number | null = null;
  private onFrame: FrameCallback;
  private isRouting = false;
  private pendingTarget: Coord | null = null;

  constructor(initialPos: Coord, onFrame: FrameCallback) {
    this.currentPos = initialPos;
    this.onFrame = onFrame;
  }

  public async updateTarget(newPos: Coord): Promise<void> {
    const dist = haversineMeters(this.currentPos, newPos);
    if (dist < 2) return;

    const now = Date.now();
    const packetInterval = Math.min(Math.max(now - this.lastPacketTime, 1000), 12000);
    this.lastPacketTime = now;

    if (this.isRouting) {
      this.pendingTarget = newPos;
      return;
    }

    this.isRouting = true;
    const startPoint = { ...this.currentPos };
    const polyline = await fetchRoadPolyline(startPoint, newPos);
    this.isRouting = false;

    this.animateAlongPolyline(polyline, packetInterval);

    if (this.pendingTarget) {
      const next = this.pendingTarget;
      this.pendingTarget = null;
      this.updateTarget(next);
    }
  }

  private animateAlongPolyline(points: Coord[], durationMs: number): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (points.length < 2) return;

    const cumDist: number[] = [0];
    let totalDist = 0;
    for (let i = 1; i < points.length; i++) {
      totalDist += haversineMeters(points[i - 1], points[i]);
      cumDist.push(totalDist);
    }

    if (totalDist === 0) return;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const targetDist = progress * totalDist;

      let segIdx = 0;
      while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetDist) {
        segIdx++;
      }

      const segStart = points[segIdx];
      const segEnd = points[segIdx + 1];
      const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
      const segT = segLen > 0 ? (targetDist - cumDist[segIdx]) / segLen : 0;

      const lat = segStart.lat + (segEnd.lat - segStart.lat) * segT;
      const lng = segStart.lng + (segEnd.lng - segStart.lng) * segT;
      const targetBearing = calcBearing(segStart, segEnd);

      this.currentPos = { lat, lng };
      this.currentBearing = lerpBearing(this.currentBearing, targetBearing, 0.25);

      this.onFrame({
        lat,
        lng,
        bearing: this.currentBearing,
      });

      if (progress < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
