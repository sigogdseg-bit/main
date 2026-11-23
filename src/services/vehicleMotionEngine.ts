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
  private lastPacketTime: number = 0;
  private rafId: number | null = null;
  private onFrame: FrameCallback;
  private animStartTime: number = 0;
  private animDurationMs: number = 10000;
  private animStartPos: Coord;
  private animTargetPos: Coord;
  private animStartBearing: number;
  private animTargetBearing: number;

  public static readonly MIN_DURATION_MS = 2000;
  public static readonly MAX_DURATION_MS = 13000;
  public static readonly DEFAULT_DURATION_MS = 10000;
  public static readonly DURATION_MS = 10000;

  constructor(initialPos: Coord, onFrame: FrameCallback, initialBearing: number = 0) {
    this.currentPos = { ...initialPos };
    this.animStartPos = { ...initialPos };
    this.animTargetPos = { ...initialPos };
    this.currentBearing = initialBearing;
    this.animStartBearing = initialBearing;
    this.animTargetBearing = initialBearing;
    this.onFrame = onFrame;
  }

  public getPosition(): Coord {
    return { ...this.currentPos };
  }

  public getBearing(): number {
    return this.currentBearing;
  }

  public getDurationMs(): number {
    return this.animDurationMs;
  }

  public updateTarget(newPos: Coord, timestamp?: number | string | Date): void {
    // 1. Trava de timestamp obrigatória: se timestamp fornecido for anterior ou igual ao último timestamp processado, ignore
    if (timestamp !== undefined && timestamp !== null) {
      const tsMs = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();

      if (!isNaN(tsMs) && tsMs > 0) {
        if (tsMs <= this.lastTimestamp) {
          console.warn(
            `[VehicleMotion] ⚠️ Pacote ignorado por trava de timestamp (antigo/fora de ordem): ts=${tsMs} <= lastTs=${this.lastTimestamp}`,
          );
          return;
        }
      }
    }

    // 2. Trava de deduplicação de alvo: se o novo destino for idêntico ao alvo em curso e a animação já estiver rodando, ignore
    const distAlvoAnterior = haversineMeters(this.animTargetPos, newPos);
    if (distAlvoAnterior < 1.0 && this.rafId !== null) {
      return;
    }

    // 3. Trava de zona morta: menor que 3 metros do destino e da posição atual ignora (evita tremor com carro parado)
    const dist = haversineMeters(this.currentPos, newPos);
    if (dist < 3 && distAlvoAnterior < 3) {
      console.log(
        `[VehicleMotion] ⏸️ Pacote ignorado por zona morta (< 3m): dist=${dist.toFixed(1)}m`,
      );
      return;
    }

    const agora = typeof performance !== "undefined" ? performance.now() : Date.now();

    // 4. Trava de teleporte: maior que 2000 metros move instantaneamente sem animar
    if (dist > 2000) {
      console.warn(
        `[VehicleMotion] 🚀 Trava de teleporte acionada (> 2000m): dist=${dist.toFixed(1)}m. Movendo instantaneamente sem animar.`,
      );
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.currentPos = { ...newPos };
      this.animStartPos = { ...newPos };
      this.animTargetPos = { ...newPos };
      this.lastPacketTime = agora;
      if (timestamp !== undefined && timestamp !== null) {
        const tsMs = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
        if (!isNaN(tsMs) && tsMs > 0) this.lastTimestamp = tsMs;
      }
      this.onFrame({
        lat: newPos.lat,
        lng: newPos.lng,
        bearing: this.currentBearing,
      });
      return;
    }

    // 5. Atualiza lastTimestamp apenas quando o pacote é aceito
    if (timestamp !== undefined && timestamp !== null) {
      const tsMs = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
      if (!isNaN(tsMs) && tsMs > 0) {
        this.lastTimestamp = tsMs;
      }
    }

    // 6. Duração dinâmica: calcula intervalo real entre pacotes consecutivos legítimos
    const tempoDecorridoMs = this.lastPacketTime > 0 ? Math.round(agora - this.lastPacketTime) : 0;

    // Se o intervalo real estiver dentro do fluxo contínuo normal (até MAX_DURATION_MS + 2000ms),
    // adiciona margem de 500ms para absorver oscilações de rede GSM (~10s a 12s) sem micro-paradas.
    // Se decorreu muito tempo (> 15s, ex.: veículo retomando movimento após parada), utiliza DEFAULT_DURATION_MS (10000ms).
    const duracaoDinamicaMs =
      this.lastPacketTime > 0 && tempoDecorridoMs <= VehicleMotionController.MAX_DURATION_MS + 2000
        ? Math.min(
            Math.max(tempoDecorridoMs + 500, VehicleMotionController.MIN_DURATION_MS),
            VehicleMotionController.MAX_DURATION_MS,
          )
        : VehicleMotionController.DEFAULT_DURATION_MS;

    this.lastPacketTime = agora;
    this.animDurationMs = duracaoDinamicaMs;

    console.log(
      `[VehicleMotion] updateTarget: dist=${dist.toFixed(1)}m | decorrido=${tempoDecorridoMs}ms | duracaoAnim=${duracaoDinamicaMs}ms | timestamp=${timestamp || "N/A"} | lastTs=${this.lastTimestamp}`,
    );

    console.log(
      `[VehicleMotion] ▶️ Iniciando locomoção contínua linear de ${duracaoDinamicaMs}ms (sem frenagem) para nova posição: dist=${dist.toFixed(1)}m`,
    );

    // 7. Se chegar um novo pacote durante o percurso, cancele o frame anterior (cancelAnimationFrame)
    // e inicie a nova animação linear a partir da posição exata onde o marcador está naquele milissegundo.
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
    const duration = this.animDurationMs;

    const step = (now: number) => {
      const elapsed = now - this.animStartTime;
      // Movimento estritamente linear (t = elapsed / duration) sem curva de desaceleração para evitar que o pin freie
      const progress = Math.min(Math.max(elapsed / duration, 0), 1);
      const t = progress;

      const lat = startPos.lat + (targetPos.lat - startPos.lat) * t;
      const lng = startPos.lng + (targetPos.lng - startPos.lng) * t;
      const bearing = lerpBearing(startBearing, targetBearing, t);

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
        this.currentPos = { ...targetPos };
        this.currentBearing = targetBearing;
        this.onFrame({
          lat: targetPos.lat,
          lng: targetPos.lng,
          bearing: targetBearing,
        });
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
