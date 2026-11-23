export interface Coord {
  lat: number;
  lng: number;
}

export interface FrameState {
  lat: number;
  lng: number;
  bearing: number;
}

export type FrameCallback = (state: FrameState) => void;

export function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calcBearing(a: Coord, b: Coord): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function lerpBearing(start: number, end: number, t: number): number {
  const diff = ((end - start + 540) % 360) - 180;
  return (start + diff * t + 360) % 360;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class VehicleMotionController {
  private currentPos: Coord;
  private currentBearing: number;
  private lastTimestamp: number = 0;
  private rafId: number | null = null;
  private onFrame: FrameCallback;
  private animStartTime: number = 0;
  private animStartPos: Coord;
  private animTargetPos: Coord;
  private animStartBearing: number;
  private animTargetBearing: number;
  public static readonly DURATION_MS = 1500;

  constructor(initialPos: Coord, onFrame: FrameCallback, initialBearing: number = 0) {
    this.currentPos = { ...initialPos };
    this.animStartPos = { ...initialPos };
    this.animTargetPos = { ...initialPos };
    this.currentBearing = initialBearing;
    this.animStartBearing = initialBearing;
    this.animTargetBearing = initialBearing;
    this.onFrame = onFrame;
  }

  public updateTarget(newPos: Coord, timestamp?: number | string | Date): void {
    // 1. Trava de timestamp obrigatória: se timestamp <= lastTimestamp, ignore completamente
    if (timestamp !== undefined && timestamp !== null) {
      const tsMs = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();

      if (!isNaN(tsMs) && tsMs > 0) {
        if (tsMs <= this.lastTimestamp) {
          return;
        }
        this.lastTimestamp = tsMs;
      }
    }

    const dist = haversineMeters(this.currentPos, newPos);

    // 2. Trava de zona morta: menor que 3 metros ignora (evita tremor com carro parado)
    if (dist < 3) {
      return;
    }

    // 3. Trava de teleporte: maior que 2000 metros move instantaneamente sem animar
    if (dist > 2000) {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.currentPos = { ...newPos };
      this.animStartPos = { ...newPos };
      this.animTargetPos = { ...newPos };
      this.onFrame({
        lat: newPos.lat,
        lng: newPos.lng,
        bearing: this.currentBearing,
      });
      return;
    }

    // 4. Se chegar um novo pacote durante os 1500ms, cancele o frame anterior (cancelAnimationFrame)
    // e inicie os novos 1500ms a partir da posição exata onde o marcador está naquele milissegundo.
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.animStartPos = { ...this.currentPos };
    this.animTargetPos = { ...newPos };
    this.animStartBearing = this.currentBearing;
    this.animTargetBearing = calcBearing(this.animStartPos, this.animTargetPos);
    this.animStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    const startPos = this.animStartPos;
    const targetPos = this.animTargetPos;
    const startBearing = this.animStartBearing;
    const targetBearing = this.animTargetBearing;

    const step = (now: number) => {
      const elapsed = now - this.animStartTime;
      const progress = Math.min(Math.max(elapsed / VehicleMotionController.DURATION_MS, 0), 1);
      const easedT = easeOutCubic(progress);

      const lat = startPos.lat + (targetPos.lat - startPos.lat) * easedT;
      const lng = startPos.lng + (targetPos.lng - startPos.lng) * easedT;
      const bearing = lerpBearing(startBearing, targetBearing, easedT);

      this.currentPos = { lat, lng };
      this.currentBearing = bearing;

      this.onFrame({
        lat,
        lng,
        bearing,
      });

      if (progress < 1) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  public getPosition(): Coord {
    return { ...this.currentPos };
  }

  public getBearing(): number {
    return this.currentBearing;
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
