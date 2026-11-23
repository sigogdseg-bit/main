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

/**
 * Interpola posição ao longo de uma polilinha com base no progresso normalizado t [0, 1]
 * Calcula a distância acumulada de cada subsegmento e devolve lat, lng e bearing da curva.
 */
export function interpolatePolylinePosition(
  polyline: Coord[],
  t: number,
  fallbackBearing: number = 0,
): FrameState {
  if (!polyline || polyline.length === 0) {
    return { lat: 0, lng: 0, bearing: fallbackBearing };
  }
  if (polyline.length === 1) {
    return { lat: polyline[0].lat, lng: polyline[0].lng, bearing: fallbackBearing };
  }

  const numPontos = polyline.length;
  const segLengths: number[] = [];
  const cumDistances: number[] = [0];

  for (let j = 0; j < numPontos - 1; j++) {
    const d = haversineMeters(polyline[j], polyline[j + 1]);
    segLengths.push(d);
    cumDistances.push(cumDistances[j] + d);
  }

  const totalDistance = cumDistances[cumDistances.length - 1];
  if (totalDistance < 0.1) {
    return {
      lat: polyline[numPontos - 1].lat,
      lng: polyline[numPontos - 1].lng,
      bearing: fallbackBearing,
    };
  }

  const clampedT = Math.min(Math.max(t, 0), 1);
  const targetDist = clampedT * totalDistance;

  let j = 0;
  while (j < numPontos - 2 && cumDistances[j + 1] < targetDist) {
    j++;
  }

  const segLen = segLengths[j];
  const localDist = targetDist - cumDistances[j];
  const localT = segLen > 0 ? Math.min(Math.max(localDist / segLen, 0), 1) : 1;

  const lat = polyline[j].lat + (polyline[j + 1].lat - polyline[j].lat) * localT;
  const lng = polyline[j].lng + (polyline[j + 1].lng - polyline[j].lng) * localT;
  const bearing = calcBearing(polyline[j], polyline[j + 1]);

  return { lat, lng, bearing };
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
  private animPolyline: Coord[] | null = null;
  private animSegLengths: number[] = [];
  private animCumDistances: number[] = [];
  private animTotalDistance: number = 0;

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

  public getPolyline(): Coord[] | null {
    return this.animPolyline ? [...this.animPolyline] : null;
  }

  public updateTarget(newPos: Coord, timestamp?: number | string | Date, caminho?: Coord[]): void {
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
      this.animPolyline = null;
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

    const temCaminho =
      Array.isArray(caminho) &&
      caminho.length >= 2 &&
      caminho.every(
        (p) =>
          typeof p?.lat === "number" &&
          !isNaN(p.lat) &&
          typeof p?.lng === "number" &&
          !isNaN(p.lng),
      );

    if (temCaminho && caminho) {
      // 1. Pivô contínuo obrigatório: encontrar o segmento de caminho mais próximo de currentPos
      let bestSegIdx = 0;
      let minSegDist = Infinity;
      let bestU = 0;

      for (let i = 0; i < caminho.length - 1; i++) {
        const vA = caminho[i];
        const vB = caminho[i + 1];
        const dx = vB.lng - vA.lng;
        const dy = vB.lat - vA.lat;
        const lenSq = dx * dx + dy * dy;

        let u = 0;
        if (lenSq > 0) {
          u = Math.max(
            0,
            Math.min(
              1,
              ((this.currentPos.lng - vA.lng) * dx + (this.currentPos.lat - vA.lat) * dy) / lenSq,
            ),
          );
        }
        const projCoord: Coord = {
          lat: vA.lat + u * dy,
          lng: vA.lng + u * dx,
        };
        const d = haversineMeters(this.currentPos, projCoord);
        if (d < minSegDist) {
          minSegDist = d;
          bestSegIdx = i;
          bestU = u;
        }
      }

      // Vértices à frente do ponto de projeção
      const verticesRestantes =
        bestU < 0.95
          ? caminho.slice(bestSegIdx + 1)
          : caminho.slice(Math.min(bestSegIdx + 2, caminho.length - 1));

      // Monta polilinha iniciando estritamente na posição interpolada atual (pivô contínuo)
      const polylinePontos: Coord[] = [{ ...this.currentPos }];
      for (const pt of verticesRestantes) {
        const ultimo = polylinePontos[polylinePontos.length - 1];
        if (haversineMeters(ultimo, pt) >= 0.1) {
          polylinePontos.push({ lat: pt.lat, lng: pt.lng });
        }
      }
      if (polylinePontos.length < 2) {
        polylinePontos.push({ ...newPos });
      }

      this.animPolyline = polylinePontos;
      this.animSegLengths = [];
      this.animCumDistances = [0];
      for (let j = 0; j < polylinePontos.length - 1; j++) {
        const d = haversineMeters(polylinePontos[j], polylinePontos[j + 1]);
        this.animSegLengths.push(d);
        this.animCumDistances.push(this.animCumDistances[j] + d);
      }
      this.animTotalDistance = this.animCumDistances[this.animCumDistances.length - 1];
    } else {
      this.animPolyline = null;
      this.animSegLengths = [];
      this.animCumDistances = [];
      this.animTotalDistance = 0;
    }

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

      let lat: number;
      let lng: number;
      let bearing: number;

      if (this.animPolyline && this.animPolyline.length >= 2 && this.animTotalDistance > 0.5) {
        const targetDist = t * this.animTotalDistance;
        const numPontos = this.animPolyline.length;
        let j = 0;
        while (j < numPontos - 2 && this.animCumDistances[j + 1] < targetDist) {
          j++;
        }
        const segLen = this.animSegLengths[j];
        const localDist = targetDist - this.animCumDistances[j];
        const localT = segLen > 0 ? Math.min(Math.max(localDist / segLen, 0), 1) : 1;

        lat =
          this.animPolyline[j].lat +
          (this.animPolyline[j + 1].lat - this.animPolyline[j].lat) * localT;
        lng =
          this.animPolyline[j].lng +
          (this.animPolyline[j + 1].lng - this.animPolyline[j].lng) * localT;
        bearing = calcBearing(this.animPolyline[j], this.animPolyline[j + 1]);
      } else {
        lat = startPos.lat + (targetPos.lat - startPos.lat) * t;
        lng = startPos.lng + (targetPos.lng - startPos.lng) * t;
        bearing = lerpBearing(startBearing, targetBearing, t);
      }

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
        const finalPos =
          this.animPolyline && this.animPolyline.length >= 2
            ? this.animPolyline[this.animPolyline.length - 1]
            : targetPos;
        const finalBearing =
          this.animPolyline && this.animPolyline.length >= 2
            ? calcBearing(
                this.animPolyline[this.animPolyline.length - 2],
                this.animPolyline[this.animPolyline.length - 1],
              )
            : targetBearing;

        this.currentPos = { ...finalPos };
        this.currentBearing = finalBearing;
        this.onFrame({
          lat: finalPos.lat,
          lng: finalPos.lng,
          bearing: finalBearing,
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
