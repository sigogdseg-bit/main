// interpolacaoMapaSuave.ts — GD Rastreamento
// Motor cinemático de continuidade visual a 60 FPS para marcadores de mapa 2D/3D.
// Preserva 100% a veracidade da telemetria: nunca altera o estado dos dados reais,
// nunca desloca veículos parados, sem ignição, bloqueados ou sem comunicação ativa,
// e converge suavemente sobre cada novo pacote GPS recebido do rastreador.

const RAIO_TERRA_METROS = 6371000;
const RAD_POR_GRAU = Math.PI / 180;

// Hardware J16 transmite normalmente a cada 20-30s em reta e 1-5s em curvas.
// Horizonte limitado garante deslocamento visual contínuo entre pacotes reais sem inventar rota longa.
export const LIMITE_INICIO_AMORTECIMENTO_SEG = 18;
export const LIMITE_MAXIMO_CONTINUIDADE_SEG = 28;
export const FATOR_CONSERVADOR_VELOCIDADE = 0.92;
export const DISTANCIA_MAXIMA_PROJECTION_METROS = 300;
export const DISTANCIA_TELETRANSPORTE_SNAP_METROS = 2000;

export interface AtualizacaoPosicaoVeiculo {
  id: string;
  latitude: number;
  longitude: number;
  rumo: number;
  velocidadeKmh: number;
  ignicao: boolean;
  bloqueado: boolean;
  online: boolean;
  ultimaAtualizacaoIso?: string | null;
}

export interface EstadoMovimentoVeiculo {
  id: string;
  visualLat: number;
  visualLng: number;
  visualHeading: number;
  targetLat: number;
  targetLng: number;
  targetHeading: number;
  headingContinuous: number;
  velocidadeKmh: number;
  ignicao: boolean;
  bloqueado: boolean;
  online: boolean;
  ultimaAtualizacaoIso: string | null;
  packetReceivedAtMs: number;
  coordChangedAtMs: number;
  settled: boolean;
  // Dinâmica de Curvas Suaves e Concordância Viária
  curvaInicioLat?: number;
  curvaInicioLng?: number;
  curvaControleLat?: number;
  curvaControleLng?: number;
  curvaProgresso?: number;
  curvaDuracaoSeg?: number;
}

export interface ChaveVisualMarcadorParams {
  placa?: string | null;
  chassi?: string | null;
  tipo?: string | null;
  corStatus: string;
  isSelected?: boolean;
  temAlerta?: boolean;
  isEmRota?: boolean;
  iconeGenerico?: boolean;
  mostrarPlaca?: boolean;
}

export function normalizarGrausCanonicamente(graus: number): number {
  if (!Number.isFinite(graus)) return 0;
  return ((graus % 360) + 360) % 360;
}

/**
 * Calcula o ângulo contínuo mais próximo de `anguloAtual` equivalente a `alvoGraus` [0, 360).
 * Evita giros reversos de 340+ graus ao cruzar o norte magnético (350° -> 10° resulta em 370°).
 */
export function calcularPassoAnguloCurto(anguloAtual: number, alvoGraus: number): number {
  if (!Number.isFinite(anguloAtual)) return normalizarGrausCanonicamente(alvoGraus);
  if (!Number.isFinite(alvoGraus)) return anguloAtual;
  const alvoNorm = normalizarGrausCanonicamente(alvoGraus);
  let delta = ((((alvoNorm - anguloAtual) % 360) + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return anguloAtual + delta;
}

export function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return 0;
  }
  const dLat = (lat2 - lat1) * RAD_POR_GRAU;
  const dLng = (lng2 - lng1) * RAD_POR_GRAU;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * RAD_POR_GRAU) *
      Math.cos(lat2 * RAD_POR_GRAU) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return RAIO_TERRA_METROS * c;
}

/**
 * Projeta uma coordenada geodésica em linha tangente pelo rumo verdadeiro em graus (0 = Norte, 90 = Leste).
 */
export function projetarCoordenadaPorRumo(
  lat: number,
  lng: number,
  rumoGraus: number,
  distanciaMetros: number,
): [number, number] {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(distanciaMetros) ||
    distanciaMetros <= 0
  ) {
    return [lat, lng];
  }
  const rad = normalizarGrausCanonicamente(rumoGraus) * RAD_POR_GRAU;
  const dLatDeg = (distanciaMetros * Math.cos(rad)) / RAIO_TERRA_METROS / RAD_POR_GRAU;
  const cosLat = Math.max(0.01, Math.cos(lat * RAD_POR_GRAU));
  const dLngDeg = (distanciaMetros * Math.sin(rad)) / (RAIO_TERRA_METROS * cosLat) / RAD_POR_GRAU;
  return [lat + dLatDeg, lng + dLngDeg];
}

export function coordenadaValidaMapa(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  );
}

/**
 * Calcula o azimute em graus (0 a 360) entre duas coordenadas geográficas
 */
export function calcularAzimuteGraus(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Calcula o ponto de controle intermediário de Bézier para concordância tangencial de vias em curvas
 */
export function calcularPontoControleCurva(
  lat0: number,
  lng0: number,
  rumo0: number,
  lat1: number,
  lng1: number,
  rumo1: number,
): [number, number] {
  const dist = haversineMetros(lat0, lng0, lat1, lng1);
  if (dist < 2.5 || dist > 1500) {
    return [(lat0 + lat1) / 2, (lng0 + lng1) / 2];
  }

  // Braço de alavanca proporcional ao vão entre pacotes (máximo 45% do vão, teto 50m)
  const dArm = Math.min(dist * 0.45, 50);
  const [t0Lat, t0Lng] = projetarCoordenadaPorRumo(lat0, lng0, rumo0, dArm);
  const [t1Lat, t1Lng] = projetarCoordenadaPorRumo(
    lat1,
    lng1,
    normalizarGrausCanonicamente(rumo1 + 180),
    dArm,
  );

  return [(t0Lat + t1Lat) / 2, (t0Lng + t1Lng) / 2];
}

/**
 * Avalia a posição [lat, lng] sobre curva quadrática de Bézier com concordância tangencial
 */
export function avaliarBezierQuadratica(
  p0: [number, number],
  c: [number, number],
  p1: [number, number],
  t: number,
): [number, number] {
  const clampedT = Math.max(0, Math.min(1, t));
  const u = 1 - clampedT;
  const lat = u * u * p0[0] + 2 * u * clampedT * c[0] + clampedT * clampedT * p1[0];
  const lng = u * u * p0[1] + 2 * u * clampedT * c[1] + clampedT * clampedT * p1[1];
  return [lat, lng];
}

export function prefereMovimentoReduzido(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Gera chave estrutural apenas para atributos visuais discretos (cor, seleção, placa, tipo).
 * Exclui latitude, longitude, velocidade e rumo para não destruir o DOM do marcador a cada atualização.
 */
export function criarChaveVisualMarcador(params: ChaveVisualMarcadorParams): string {
  return [
    params.placa ?? "",
    params.chassi ?? "",
    params.tipo ?? "carro",
    params.corStatus,
    params.isSelected ? "1" : "0",
    params.temAlerta ? "1" : "0",
    params.isEmRota ? "1" : "0",
    params.iconeGenerico ? "1" : "0",
    params.mostrarPlaca !== false ? "1" : "0",
  ].join("|");
}

/**
 * Atualiza a rotação do elemento do veículo (incluindo mini-placa alinhada à via ou seta do pino)
 * diretamente no DOM sem substituir o innerHTML nem interromper animações CSS ativas.
 */
export function atualizarRotacaoElementoMarcador(
  containerEl: HTMLElement | null | undefined,
  anguloContinuoDeg: number,
): boolean {
  if (!containerEl || !Number.isFinite(anguloContinuoDeg)) return false;
  const alvo =
    (containerEl.querySelector(".vehicle-via-aligned") as HTMLElement | null) ||
    (containerEl.querySelector(".hunter-generico-seta") as HTMLElement | null) ||
    (containerEl.querySelector(".vehicle-3d-symbol") as HTMLElement | null);

  if (!alvo) return false;
  const anguloLimpo = Math.round(anguloContinuoDeg * 10) / 10;
  const valor = `rotate(${anguloLimpo}deg)`;
  if (alvo.style.transform !== valor) {
    alvo.style.transform = valor;
  }
  return true;
}

/**
 * Calcula a distância de continuidade visual limitada desde a última telemetria real recebida,
 * com desaceleração suave (taper cossenoidal C¹) entre 18s e 28s caso nenhum pacote chegue.
 */
export function calcularDistanciaContinuidadeMetros(
  velocidadeKmh: number,
  tempoDesdePacoteSeg: number,
): number {
  if (!Number.isFinite(velocidadeKmh) || velocidadeKmh <= 3 || tempoDesdePacoteSeg <= 0) {
    return 0;
  }

  const velMs = (velocidadeKmh / 3.6) * FATOR_CONSERVADOR_VELOCIDADE;
  const tClamped = Math.min(tempoDesdePacoteSeg, LIMITE_MAXIMO_CONTINUIDADE_SEG);

  let tempoEfetivoSeg = 0;
  if (tClamped <= LIMITE_INICIO_AMORTECIMENTO_SEG) {
    tempoEfetivoSeg = tClamped;
  } else {
    const janelaAmortecimento = LIMITE_MAXIMO_CONTINUIDADE_SEG - LIMITE_INICIO_AMORTECIMENTO_SEG;
    const x = tClamped - LIMITE_INICIO_AMORTECIMENTO_SEG;
    // Integral exata de 0.5 * (1 + cos(pi * u / janela)) para desaceleração contínua até zero
    const integralExtra =
      0.5 * x +
      (janelaAmortecimento / (2 * Math.PI)) * Math.sin((Math.PI * x) / janelaAmortecimento);
    tempoEfetivoSeg = LIMITE_INICIO_AMORTECIMENTO_SEG + integralExtra;
  }

  return Math.min(DISTANCIA_MAXIMA_PROJECTION_METROS, velMs * tempoEfetivoSeg);
}

/**
 * Controlador de estado cinemático por veículo para renderização a 60 FPS sem congelamento nem teletransporte.
 */
export class ControladorMovimentoSuave {
  private estados = new Map<string, EstadoMovimentoVeiculo>();
  private lastStepMs: number | null = null;
  private rafId: number | null = null;

  public obterEstado(id: string): EstadoMovimentoVeiculo | undefined {
    return this.estados.get(id);
  }

  public listarIds(): string[] {
    return Array.from(this.estados.keys());
  }

  public removerVeiculosAusentes(idsAtivos: Set<string>): void {
    for (const id of this.estados.keys()) {
      if (!idsAtivos.has(id)) {
        this.estados.delete(id);
      }
    }
  }

  public atualizarDestino(
    input: AtualizacaoPosicaoVeiculo,
    agoraMs: number = typeof performance !== "undefined" ? performance.now() : Date.now(),
    reduzido: boolean = prefereMovimentoReduzido(),
  ): EstadoMovimentoVeiculo {
    const rumoNormalizado = normalizarGrausCanonicamente(input.rumo);
    const existente = this.estados.get(input.id);

    if (!existente) {
      const podeMover =
        !reduzido &&
        input.online &&
        input.ignicao &&
        !input.bloqueado &&
        Number.isFinite(input.velocidadeKmh) &&
        input.velocidadeKmh > 3;

      const novo: EstadoMovimentoVeiculo = {
        id: input.id,
        visualLat: input.latitude,
        visualLng: input.longitude,
        visualHeading: rumoNormalizado,
        targetLat: input.latitude,
        targetLng: input.longitude,
        targetHeading: rumoNormalizado,
        headingContinuous: rumoNormalizado,
        velocidadeKmh: input.velocidadeKmh,
        ignicao: input.ignicao,
        bloqueado: input.bloqueado,
        online: input.online,
        ultimaAtualizacaoIso: input.ultimaAtualizacaoIso ?? null,
        packetReceivedAtMs: agoraMs,
        coordChangedAtMs: agoraMs,
        settled: !podeMover,
      };
      this.estados.set(input.id, novo);
      return novo;
    }

    const coordMudou =
      existente.targetLat !== input.latitude || existente.targetLng !== input.longitude;
    const timestampMudou = Boolean(
      input.ultimaAtualizacaoIso && input.ultimaAtualizacaoIso !== existente.ultimaAtualizacaoIso,
    );

    if (coordMudou || timestampMudou) {
      if (coordMudou) {
        const distEntrePontos = haversineMetros(
          existente.visualLat,
          existente.visualLng,
          input.latitude,
          input.longitude,
        );

        // Se houver novo pacote GPS e o veículo estiver em trânsito dentro da malha viária (<800m)
        if (distEntrePontos > 2.0 && distEntrePontos <= 800 && !reduzido) {
          existente.curvaInicioLat = existente.visualLat;
          existente.curvaInicioLng = existente.visualLng;
          const [cLat, cLng] = calcularPontoControleCurva(
            existente.visualLat,
            existente.visualLng,
            existente.visualHeading,
            input.latitude,
            input.longitude,
            rumoNormalizado,
          );
          existente.curvaControleLat = cLat;
          existente.curvaControleLng = cLng;
          existente.curvaProgresso = 0;
          const velEfetivaMs = Math.max(5, input.velocidadeKmh / 3.6 || 8);
          existente.curvaDuracaoSeg = Math.max(0.8, distEntrePontos / velEfetivaMs);
        } else {
          existente.curvaProgresso = 1;
        }
      }

      existente.targetLat = input.latitude;
      existente.targetLng = input.longitude;
      if (input.ultimaAtualizacaoIso) {
        existente.ultimaAtualizacaoIso = input.ultimaAtualizacaoIso;
      }
      existente.packetReceivedAtMs = agoraMs;
      if (coordMudou) {
        existente.coordChangedAtMs = agoraMs;
      }
    }

    existente.velocidadeKmh = input.velocidadeKmh;
    existente.ignicao = input.ignicao;
    existente.bloqueado = input.bloqueado;
    existente.online = input.online;
    existente.targetHeading = rumoNormalizado;
    existente.headingContinuous = calcularPassoAnguloCurto(
      existente.headingContinuous,
      rumoNormalizado,
    );

    const distSnap = haversineMetros(
      existente.visualLat,
      existente.visualLng,
      input.latitude,
      input.longitude,
    );

    if (reduzido || distSnap > DISTANCIA_TELETRANSPORTE_SNAP_METROS) {
      existente.visualLat = input.latitude;
      existente.visualLng = input.longitude;
      existente.visualHeading = existente.headingContinuous;
      existente.curvaProgresso = 1;
    }

    const emMovimentoReal = this.podeDeslocarVisualmente(existente, reduzido, agoraMs);
    const gap = haversineMetros(
      existente.visualLat,
      existente.visualLng,
      existente.targetLat,
      existente.targetLng,
    );
    const diffRumo = Math.abs(existente.headingContinuous - existente.visualHeading);

    existente.settled = !emMovimentoReal && gap < 0.25 && diffRumo < 0.15;
    if (existente.settled) {
      existente.visualLat = existente.targetLat;
      existente.visualLng = existente.targetLng;
      existente.visualHeading = existente.headingContinuous;
      existente.curvaProgresso = 1;
    }

    return existente;
  }

  private podeDeslocarVisualmente(
    estado: EstadoMovimentoVeiculo,
    reduzido: boolean,
    agoraMs: number,
  ): boolean {
    if (reduzido) return false;
    if (!estado.online || !estado.ignicao || estado.bloqueado) return false;
    if (!Number.isFinite(estado.velocidadeKmh) || estado.velocidadeKmh <= 3) return false;
    const ageS = Math.max(0, (agoraMs - estado.packetReceivedAtMs) / 1000);
    return ageS < LIMITE_MAXIMO_CONTINUIDADE_SEG;
  }

  /**
   * Avança todos os marcadores para `agoraMs` (ex: timestamp de `requestAnimationFrame`).
   * Retorna `true` se ao menos um veículo ainda exige atualização visual nos próximos quadros.
   */
  public avancarParaInstante(
    agoraMs: number,
    reduzido: boolean = prefereMovimentoReduzido(),
  ): boolean {
    const rawDt =
      this.lastStepMs === null ? 0.016 : Math.max(0, (agoraMs - this.lastStepMs) / 1000);
    this.lastStepMs = agoraMs;

    // Se a aba ficou suspensa por mais de 2.5s, evita salto gigante de delta no primeiro frame
    const retomadaSuspensa = rawDt > 2.5;
    const dtSec = retomadaSuspensa ? 0.016 : Math.min(rawDt, 0.1);

    let possuiAtivos = false;

    for (const estado of this.estados.values()) {
      // 0. Se houver curva viária em andamento (transição suave com concordância tangencial em curvas)
      if (
        !reduzido &&
        estado.curvaProgresso !== undefined &&
        estado.curvaProgresso < 1 &&
        estado.curvaInicioLat !== undefined &&
        estado.curvaInicioLng !== undefined &&
        estado.curvaControleLat !== undefined &&
        estado.curvaControleLng !== undefined &&
        estado.curvaDuracaoSeg &&
        estado.curvaDuracaoSeg > 0
      ) {
        const stepProgresso = dtSec / estado.curvaDuracaoSeg;
        estado.curvaProgresso = Math.min(1, estado.curvaProgresso + stepProgresso);

        let [pLat, pLng] = avaliarBezierQuadratica(
          [estado.curvaInicioLat, estado.curvaInicioLng],
          [estado.curvaControleLat, estado.curvaControleLng],
          [estado.targetLat, estado.targetLng],
          estado.curvaProgresso,
        );

        // Anti-Salto Físico na curva: limita o passo por frame à velocidade física do veículo
        const maxVelCurvaMs = Math.max(14, (estado.velocidadeKmh / 3.6) * 1.35);
        const maxStepCurvaM = maxVelCurvaMs * dtSec;
        const distStepCurvaM = haversineMetros(estado.visualLat, estado.visualLng, pLat, pLng);
        if (distStepCurvaM > maxStepCurvaM && distStepCurvaM > 0) {
          const sc = maxStepCurvaM / distStepCurvaM;
          pLat = estado.visualLat + (pLat - estado.visualLat) * sc;
          pLng = estado.visualLng + (pLng - estado.visualLng) * sc;
        }

        // Heading instantâneo tangente à curva para virar o veículo com suavidade natural
        const dLatCurva = pLat - estado.visualLat;
        const dLngCurva = pLng - estado.visualLng;
        if (Math.hypot(dLatCurva, dLngCurva) > 0.000005) {
          const azimuteInst = calcularPassoAnguloCurto(
            estado.visualHeading,
            calcularAzimuteGraus(estado.visualLat, estado.visualLng, pLat, pLng),
          );
          const alphaH = 1 - Math.exp(-dtSec / 0.18);
          estado.visualHeading += (azimuteInst - estado.visualHeading) * alphaH;
        }

        estado.visualLat = pLat;
        estado.visualLng = pLng;
        possuiAtivos = true;
        continue;
      }

      // 1. Suavização angular pelo caminho mais curto
      const diffRumo = estado.headingContinuous - estado.visualHeading;
      if (reduzido || Math.abs(diffRumo) < 0.15) {
        estado.visualHeading = estado.headingContinuous;
      } else {
        const alphaH = 1 - Math.exp(-dtSec / 0.22);
        estado.visualHeading += diffRumo * alphaH;
      }

      // 2. Âncora cinemática (exata ao parar, ou avanço limitado entre pacotes ao dirigir)
      const emMovimentoAtivo =
        !reduzido &&
        estado.online &&
        estado.ignicao &&
        !estado.bloqueado &&
        Number.isFinite(estado.velocidadeKmh) &&
        estado.velocidadeKmh > 3;

      const ageSeg = Math.max(0, (agoraMs - estado.packetReceivedAtMs) / 1000);
      let guideLat = estado.targetLat;
      let guideLng = estado.targetLng;

      if (emMovimentoAtivo) {
        const distMetros = calcularDistanciaContinuidadeMetros(estado.velocidadeKmh, ageSeg);
        [guideLat, guideLng] = projetarCoordenadaPorRumo(
          estado.targetLat,
          estado.targetLng,
          estado.targetHeading,
          distMetros,
        );
      }

      const distGapM = haversineMetros(estado.visualLat, estado.visualLng, guideLat, guideLng);

      if (reduzido || distGapM > DISTANCIA_TELETRANSPORTE_SNAP_METROS) {
        estado.visualLat = guideLat;
        estado.visualLng = guideLng;
      } else if (!emMovimentoAtivo && distGapM < 0.25) {
        estado.visualLat = guideLat;
        estado.visualLng = guideLng;
      } else {
        // Quando em trânsito, converge suavemente ao guia (curvas/retas) sem teleporte;
        // Quando freado/estacionado, assenta com precisão sub-metro em ~0.85s.
        const tauSeg = !emMovimentoAtivo ? 0.28 : distGapM > 35 ? 0.5 : 0.65;
        const alphaPos = dtSec > 0 ? 1 - Math.exp(-dtSec / tauSeg) : 0;
        let dLat = (guideLat - estado.visualLat) * alphaPos;
        let dLng = (guideLng - estado.visualLng) * alphaPos;

        // Anti-Salto Físico: limita a velocidade máxima visual para nunca disparar a 200+ km/h
        const maxVelMs = !emMovimentoAtivo ? 12 : Math.max(16, (estado.velocidadeKmh / 3.6) * 1.35);
        const maxStepM = maxVelMs * dtSec;
        const stepDistM = haversineMetros(
          estado.visualLat,
          estado.visualLng,
          estado.visualLat + dLat,
          estado.visualLng + dLng,
        );

        if (stepDistM > maxStepM && stepDistM > 0) {
          const scale = maxStepM / stepDistM;
          dLat *= scale;
          dLng *= scale;
        }

        estado.visualLat += dLat;
        estado.visualLng += dLng;
      }

      const gapFinal = haversineMetros(estado.visualLat, estado.visualLng, guideLat, guideLng);
      const diffRumoFinal = Math.abs(estado.headingContinuous - estado.visualHeading);
      const dentroJanelaGlide = emMovimentoAtivo && ageSeg < LIMITE_MAXIMO_CONTINUIDADE_SEG;

      estado.settled = !dentroJanelaGlide && gapFinal < 0.25 && diffRumoFinal < 0.15;

      if (!estado.settled) {
        possuiAtivos = true;
      } else {
        estado.visualLat = guideLat;
        estado.visualLng = guideLng;
        estado.visualHeading = estado.headingContinuous;
      }
    }

    return possuiAtivos;
  }

  public agendarLoop(aoQuadro: (agoraMs: number) => void): void {
    if (this.rafId !== null || typeof requestAnimationFrame !== "function") return;
    const passo = (agora: number) => {
      this.rafId = null;
      const continuar = this.avancarParaInstante(agora);
      aoQuadro(agora);
      if (continuar) {
        this.rafId = requestAnimationFrame(passo);
      } else {
        this.lastStepMs = null;
      }
    };
    this.rafId = requestAnimationFrame(passo);
  }

  public cancelarLoop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastStepMs = null;
  }

  public limpar(): void {
    this.cancelarLoop();
    this.estados.clear();
  }
}

export interface HandleAnimacaoPlayback {
  cancelar: () => void;
}

/**
 * Interpola suavemente um marcador de playback histórico (2D ou 3D) até a coordenada destino,
 * com cancelamento seguro caso o próximo ponto chegue antes da conclusão.
 */
export function animarMarcadorPlaybackSuave(params: {
  de: [number, number];
  para: [number, number];
  duracaoMs: number;
  aplicarPosicao: (pos: [number, number]) => void;
}): HandleAnimacaoPlayback {
  const { de, para, duracaoMs, aplicarPosicao } = params;
  if (
    prefereMovimentoReduzido() ||
    duracaoMs <= 16 ||
    typeof requestAnimationFrame !== "function" ||
    (de[0] === para[0] && de[1] === para[1])
  ) {
    aplicarPosicao(para);
    return { cancelar: () => {} };
  }

  let cancelado = false;
  let rafId: number | null = null;
  const inicio = typeof performance !== "undefined" ? performance.now() : Date.now();

  const passo = (agora: number) => {
    if (cancelado) return;
    const p = Math.min(1, Math.max(0, (agora - inicio) / duracaoMs));
    // Ease linear suave em playback contínuo evita pulso acelerado-freado entre pontos seguidos
    const lat = de[0] + (para[0] - de[0]) * p;
    const lng = de[1] + (para[1] - de[1]) * p;
    aplicarPosicao([lat, lng]);
    if (p < 1 && !cancelado) {
      rafId = requestAnimationFrame(passo);
    }
  };

  rafId = requestAnimationFrame(passo);
  return {
    cancelar: () => {
      cancelado = true;
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
