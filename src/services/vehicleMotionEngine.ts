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

export interface Waypoint {
  pos: Coord;
  timestamp?: number | string | Date;
  durationMs: number;
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
  private waypointQueue: Waypoint[] = [];

  public static readonly MIN_DURATION_MS = 2000;
  public static readonly MAX_DURATION_MS = 13000;
  public static readonly DEFAULT_DURATION_MS = 10000;
  public static readonly DURATION_MS = 10000;
  // Respeitando MIN_DURATION_MS = 600ms para aceleração de conclusão de trecho/curva
  public static readonly MIN_WAYPOINT_DURATION_MS = 600;
  public static readonly MAX_QUEUE_SIZE = 3;

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

  public getQueueLength(): number {
    return this.waypointQueue.length;
  }

  public getWaypoints(): Coord[] {
    return this.waypointQueue.map((wp) => ({ ...wp.pos }));
  }

  public isAnimating(): boolean {
    return this.rafId !== null;
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

    // 2. Trava de deduplicação de alvo: se o novo destino for idêntico ao último alvo planejado e a animação já estiver rodando, ignore
    const ultimoAlvo =
      this.waypointQueue.length > 0
        ? this.waypointQueue[this.waypointQueue.length - 1].pos
        : this.rafId !== null
          ? this.animTargetPos
          : this.currentPos;
    const distAlvoAnterior = haversineMeters(ultimoAlvo, newPos);
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
      this.waypointQueue = [];
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

    const duracaoDinamicaMs =
      this.lastPacketTime > 0 && tempoDecorridoMs <= VehicleMotionController.MAX_DURATION_MS + 2000
        ? Math.min(
            Math.max(tempoDecorridoMs + 500, VehicleMotionController.MIN_DURATION_MS),
            VehicleMotionController.MAX_DURATION_MS,
          )
        : VehicleMotionController.DEFAULT_DURATION_MS;

    this.lastPacketTime = agora;

    console.log(
      `[VehicleMotion] updateTarget: dist=${dist.toFixed(1)}m | decorrido=${tempoDecorridoMs}ms | duracaoAnim=${duracaoDinamicaMs}ms | timestamp=${timestamp || "N/A"} | lastTs=${this.lastTimestamp}`,
    );

    // 7. Fila Curta de Waypoints: Se a animação anterior já estiver em andamento,
    // enfileira o novo destino em vez de abortar o trajeto anterior e cortar quarteirão.
    if (this.rafId !== null) {
      this.waypointQueue.push({
        pos: { ...newPos },
        timestamp,
        durationMs: duracaoDinamicaMs,
      });

      // Se a fila exceder 3 pontos (ex: aba em segundo plano), descarta os mais antigos mantendo apenas os 2 últimos
      if (this.waypointQueue.length > VehicleMotionController.MAX_QUEUE_SIZE) {
        this.waypointQueue = this.waypointQueue.slice(-2);
      }

      // Acelera proporcionalmente a conclusão do trecho atual (respeitando MIN_DURATION_MS = 600ms)
      // para que o pin passe pelo vértice da esquina antes de dobrar para o próximo ponto.
      const elapsed = agora - this.animStartTime;
      const tempoRestante = Math.max(this.animDurationMs - elapsed, 0);
      const tempoAcelerado = Math.max(
        Math.min(tempoRestante, Math.round(tempoRestante * 0.4)),
        VehicleMotionController.MIN_WAYPOINT_DURATION_MS,
      );

      this.animStartPos = { ...this.currentPos };
      this.animStartBearing = this.currentBearing;
      this.animStartTime = agora;
      this.animDurationMs = tempoAcelerado;
      const distRestante = haversineMeters(this.animStartPos, this.animTargetPos);
      if (distRestante >= 1.0) {
        this.animTargetBearing = calcBearing(this.animStartPos, this.animTargetPos);
      }

      return;
    }

    // Se o veículo estiver parado ou animação concluída, inicia o trecho imediatamente
    this.animDurationMs = duracaoDinamicaMs;
    this.animStartPos = { ...this.currentPos };
    this.animTargetPos = { ...newPos };
    this.animStartBearing = this.currentBearing;
    this.animTargetBearing = calcBearing(this.animStartPos, this.animTargetPos);
    this.animStartTime = agora;

    this.iniciarLoopAnimacao();
  }

  private iniciarLoopAnimacao(): void {
    const step = (now: number) => {
      const elapsed = now - this.animStartTime;
      const duration = this.animDurationMs;
      const progress = Math.min(Math.max(elapsed / duration, 0), 1);
      const t = progress;

      const lat = this.animStartPos.lat + (this.animTargetPos.lat - this.animStartPos.lat) * t;
      const lng = this.animStartPos.lng + (this.animTargetPos.lng - this.animStartPos.lng) * t;
      const bearing = lerpBearing(this.animStartBearing, this.animTargetBearing, t);

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
        // Chegou com precisão ao vértice da esquina/trecho atual
        this.currentPos = { ...this.animTargetPos };
        this.currentBearing = this.animTargetBearing;
        this.onFrame({
          lat: this.animTargetPos.lat,
          lng: this.animTargetPos.lng,
          bearing: this.animTargetBearing,
        });

        // Se houver waypoints enfileirados, avança para o próximo trecho
        if (this.waypointQueue.length > 0) {
          const proximoWp = this.waypointQueue.shift()!;
          this.animStartPos = { ...this.currentPos };
          this.animTargetPos = { ...proximoWp.pos };
          this.animStartBearing = this.currentBearing;
          const distProx = haversineMeters(this.animStartPos, this.animTargetPos);
          this.animTargetBearing =
            distProx >= 1.0
              ? calcBearing(this.animStartPos, this.animTargetPos)
              : this.currentBearing;
          this.animStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
          // Se ainda restarem waypoints na fila, mantém ritmo ágil para não acumular latência
          this.animDurationMs =
            this.waypointQueue.length > 0
              ? Math.max(
                  Math.round(proximoWp.durationMs * 0.5),
                  VehicleMotionController.MIN_WAYPOINT_DURATION_MS,
                )
              : Math.max(proximoWp.durationMs, VehicleMotionController.MIN_WAYPOINT_DURATION_MS);

          this.rafId = requestAnimationFrame(step);
        } else {
          this.rafId = null;
        }
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.waypointQueue = [];
  }
}
