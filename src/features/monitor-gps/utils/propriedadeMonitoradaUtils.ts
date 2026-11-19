import type { VeiculoGps } from "../types";
import type { PostoVigilancia, TurnoVigilancia } from "@/features/vigilantes/types";

export interface RitmoDeslocamentoHumano {
  velocidadeKmH: number;
  ritmoMMin: number; // metros por minuto
  ritmoMS: number; // metros por segundo
  cadenciaPassosMin: number; // passos estimados por minuto
  classificacao: string;
  categoria: "estatico" | "caminhada" | "patrulha" | "corrida" | "embarcado";
  cor: string;
  isEmbarcado: boolean;
  descricao: string;
}

export interface AvaliacaoQueda {
  temAlertaQueda: boolean;
  tipo: "normal" | "inclinacao_acentuada" | "impacto_brusco" | "queda_confirmada";
  severidade: "baixa" | "moderada" | "critica";
  inclinacaoGraus: number;
  vibracaoG: number;
  mensagem: string;
  corTexto: string;
  corBorda: string;
  corBg: string;
  detalhes: string;
}

/**
 * Converte velocidade em km/h para métricas humanas de ronda (m/min, m/s e passos/min)
 */
export function converterVelocidadeParaRitmoHumano(velocidadeKmH: number): RitmoDeslocamentoHumano {
  const v = Math.max(0, Number(velocidadeKmH) || 0);

  // 1 km/h = 1000m / 60min = 16.6667 m/min
  const ritmoMMin = Math.round(v * 16.6667);
  // 1 km/h = 1 / 3.6 m/s
  const ritmoMS = Number((v / 3.6).toFixed(1));
  // Comprimento médio do passo humano na ronda ~ 0.75m -> passos/min = m/min / 0.75 = m/min * 1.333
  const cadenciaPassosMin = Math.round(ritmoMMin * 1.3333);

  if (v <= 0.4) {
    return {
      velocidadeKmH: v,
      ritmoMMin: 0,
      ritmoMS: 0,
      cadenciaPassosMin: 0,
      classificacao: "Parado no Posto",
      categoria: "estatico",
      cor: "text-slate-500 dark:text-slate-400",
      isEmbarcado: false,
      descricao: "Posição fixa na guarita ou ponto de apoio",
    };
  }

  if (v <= 4.8) {
    return {
      velocidadeKmH: v,
      ritmoMMin,
      ritmoMS,
      cadenciaPassosMin,
      classificacao: "Ronda a Pé (Passo Normal)",
      categoria: "caminhada",
      cor: "text-emerald-600 dark:text-emerald-400",
      isEmbarcado: false,
      descricao: "Patrulhamento perimetral em velocidade adequada",
    };
  }

  if (v <= 8.5) {
    return {
      velocidadeKmH: v,
      ritmoMMin,
      ritmoMS,
      cadenciaPassosMin,
      classificacao: "Patrulha Acelerada",
      categoria: "patrulha",
      cor: "text-amber-600 dark:text-amber-400",
      isEmbarcado: false,
      descricao: "Deslocamento rápido para averiguação de chamado",
    };
  }

  if (v <= 18.0) {
    return {
      velocidadeKmH: v,
      ritmoMMin,
      ritmoMS,
      cadenciaPassosMin,
      classificacao: "Corrida / Intervenção Tática",
      categoria: "corrida",
      cor: "text-orange-600 dark:text-orange-400",
      isEmbarcado: false,
      descricao: "Corrida ou intervenção de emergência na ronda",
    };
  }

  return {
    velocidadeKmH: v,
    ritmoMMin,
    ritmoMS,
    cadenciaPassosMin,
    classificacao: "Embarcado em Viatura / Moto",
    categoria: "embarcado",
    cor: "text-purple-600 dark:text-purple-400",
    isEmbarcado: true,
    descricao: "Velocidade superior ao limite humano a pé",
  };
}

/**
 * Avalia de forma combinada o Inclinômetro (Postura Corporal) e a Força G (Acelerômetro)
 * para detecção imediata de queda corporal ou homem caído (Man Down)
 */
export function avaliarAlertaQueda(
  inclinacaoGraus: number | null | undefined,
  vibracaoG: number | null | undefined,
): AvaliacaoQueda {
  const inc = Math.abs(Number(inclinacaoGraus) || 0);
  const g = Number(vibracaoG) || 1.0;

  const isCorpoHorizontal = inc >= 60; // Pessoa deitada no chão
  const isImpactoBrusco = g >= 2.5; // Choque súbito de queda
  const isMovimentoSevero = g >= 1.6 && g < 2.5;
  const isInclinacaoModerada = inc >= 30 && inc < 60; // Agachado ou rampa acentuada

  // Queda Confirmada: Impacto brusco e/ou corpo totalmente horizontal
  if (isCorpoHorizontal && isImpactoBrusco) {
    return {
      temAlertaQueda: true,
      tipo: "queda_confirmada",
      severidade: "critica",
      inclinacaoGraus: inc,
      vibracaoG: g,
      mensagem: "ALERTA CRÍTICO: QUEDA E IMPACTO VIOLENTO (MAN DOWN)",
      corTexto: "text-rose-600 dark:text-rose-400",
      corBorda: "border-rose-500",
      corBg: "bg-rose-500/15",
      detalhes: `Impacto de ${g.toFixed(1)}G registrado e inclinação corporal em ${inc}° (posição horizontal no solo).`,
    };
  }

  if (isCorpoHorizontal) {
    return {
      temAlertaQueda: true,
      tipo: "queda_confirmada",
      severidade: "critica",
      inclinacaoGraus: inc,
      vibracaoG: g,
      mensagem: "ALERTA DE QUEDA: HOMEM CAÍDO / DEITADO NO SOLO",
      corTexto: "text-rose-600 dark:text-rose-400",
      corBorda: "border-rose-500",
      corBg: "bg-rose-500/15",
      detalhes: `Vigilante em posição horizontal (${inc}°). Sem postura vertical detectada.`,
    };
  }

  if (isImpactoBrusco) {
    return {
      temAlertaQueda: true,
      tipo: "impacto_brusco",
      severidade: "critica",
      inclinacaoGraus: inc,
      vibracaoG: g,
      mensagem: "ALERTA DE IMPACTO: CHOQUE BRUSCO DETECTADO",
      corTexto: "text-rose-600 dark:text-rose-400",
      corBorda: "border-rose-500",
      corBg: "bg-rose-500/15",
      detalhes: `Força G atingiu pico de ${g.toFixed(1)}G (limiar de trauma / queda).`,
    };
  }

  if (isInclinacaoModerada || isMovimentoSevero) {
    return {
      temAlertaQueda: false,
      tipo: "inclinacao_acentuada",
      severidade: "moderada",
      inclinacaoGraus: inc,
      vibracaoG: g,
      mensagem: isInclinacaoModerada
        ? "INCLINAÇÃO ACENTUADA (AGAÇHADO / DESNÍVEL)"
        : "MOVIMENTO BRUSCO EM RONDA",
      corTexto: "text-amber-600 dark:text-amber-400",
      corBorda: "border-amber-500/40",
      corBg: "bg-amber-500/10",
      detalhes: `Inclinação em ${inc}° com aceleração de ${g.toFixed(1)}G. Monitorando estabilidade.`,
    };
  }

  return {
    temAlertaQueda: false,
    tipo: "normal",
    severidade: "baixa",
    inclinacaoGraus: inc,
    vibracaoG: g,
    mensagem: "POSTURA ERETA • VIVACIDADE NORMAL",
    corTexto: "text-emerald-600 dark:text-emerald-400",
    corBorda: "border-emerald-500/30",
    corBg: "bg-emerald-500/10",
    detalhes: `Estabilidade corporal confirmada (${inc}°). Aceleração basal estável em ${g.toFixed(1)}G.`,
  };
}

/**
 * Identifica se um ativo representa uma Propriedade Monitorada ou Monitoramento de Pessoa / Vigilante
 */
export function isPropriedadeMonitorada(
  veiculo: VeiculoGps | null | undefined,
  turnos?: TurnoVigilancia[],
  postos?: PostoVigilancia[],
): boolean {
  if (!veiculo) return false;

  // 0. Identificador sintetizado de Posto de Vigilância
  if (veiculo.id && veiculo.id.startsWith("posto-")) {
    return true;
  }

  // 1. Tipo de Veículo / Ativo explícito
  const tipo = (veiculo.tipo_veiculo || "").toLowerCase().trim();
  if (
    tipo === "propriedade" ||
    tipo === "posto" ||
    tipo === "pessoa" ||
    tipo === "vigilante" ||
    tipo === "portatil" ||
    tipo === "ronda" ||
    tipo === "cracha"
  ) {
    return true;
  }

  // 2. Placa ou identificador com prefixo/termo de posto ou propriedade
  const placa = (veiculo.placa || "").toUpperCase().trim();
  if (
    placa.startsWith("POSTO-") ||
    placa.startsWith("PROP-") ||
    placa.startsWith("VIGIA-") ||
    placa.startsWith("VIG-") ||
    placa.startsWith("RONDA-") ||
    placa.includes("POSTO") ||
    placa.includes("PROP") ||
    placa.includes("VIGIA") ||
    placa.includes("CRACHA")
  ) {
    return true;
  }

  // 3. Marca / Modelo / Descrição
  const modelo = (veiculo.marca_modelo || "").toLowerCase();
  const termosPropriedade = [
    "propriedade",
    "posto",
    "vigilante",
    "guarita",
    "ronda",
    "portatil",
    "portátil",
    "cracha",
    "crachá",
    "tornozeleira",
    "pessoa",
    "pedestre",
    "patrulha",
    "man down",
    "homem caido",
    "homem caído",
  ];
  if (termosPropriedade.some((termo) => modelo.includes(termo))) {
    return true;
  }

  // 4. Vínculo com Turno de Vigilância Ativo por IMEI
  if (veiculo.rastreador_imei && turnos && turnos.length > 0) {
    const imeiLimpo = veiculo.rastreador_imei.trim();
    const temTurno = turnos.some(
      (t) => t.rastreador_imei && t.rastreador_imei.trim() === imeiLimpo,
    );
    if (temTurno) return true;
  }

  // 5. Vínculo direto por ID com Postos de Vigilância cadastrados
  if (postos && postos.length > 0) {
    if (postos.some((p) => p.id === veiculo.id || `posto-${p.id}` === veiculo.id)) {
      return true;
    }
  }

  return false;
}

/**
 * Cria ou sintetiza um ativo do tipo VeiculoGps a partir de um Posto de Vigilância
 * para permitir visualização e monitoramento tático no Monitor 3D
 */
export function converterPostoEmVeiculoGps(
  posto: PostoVigilancia,
  turnos?: TurnoVigilancia[],
  veiculosExistentes?: VeiculoGps[],
): VeiculoGps {
  // Localiza turno ativo no posto
  const turnoAtivo =
    turnos?.find((t) => t.posto_id === posto.id && t.status === "em_andamento") ||
    turnos?.find((t) => t.posto_id === posto.id);

  // Localiza se há algum rastreador correspondente ao IMEI do turno
  let veiculoRef: VeiculoGps | undefined;
  if (turnoAtivo?.rastreador_imei && veiculosExistentes) {
    const imeiTurno = turnoAtivo.rastreador_imei.trim();
    veiculoRef = veiculosExistentes.find(
      (v) => v.rastreador_imei && v.rastreador_imei.trim() === imeiTurno,
    );
  }

  const siglaPosto =
    posto.nome
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase() || "POSTO";

  return {
    id: `posto-${posto.id}`,
    cliente_id: posto.cliente_id || "propriedade-sistema",
    cliente_nome: posto.nome,
    placa: `POSTO-${siglaPosto}`,
    marca_modelo: `${posto.nome} (Propriedade Monitorada)`,
    tipo_veiculo: "propriedade",
    ignicao: turnoAtivo ? turnoAtivo.status === "em_andamento" : false,
    bloqueado: false,
    velocidade: veiculoRef ? veiculoRef.velocidade : 0,
    odometro: veiculoRef ? veiculoRef.odometro : 0,
    latitude: veiculoRef?.latitude ?? posto.latitude,
    longitude: veiculoRef?.longitude ?? posto.longitude,
    voltagem: veiculoRef?.voltagem,
    bateria_rastreador_pct: veiculoRef?.bateria_rastreador_pct ?? 92,
    bateria_rastreador_status: veiculoRef?.bateria_rastreador_status ?? "bateria_interna",
    alimentacao_externa: false,
    satelites: veiculoRef?.satelites ?? 12,
    rumo: veiculoRef?.rumo ?? 0,
    inclinacao_graus: veiculoRef?.inclinacao_graus ?? 5,
    vibracao_g: veiculoRef?.vibracao_g ?? 1.0,
    ultima_atualizacao: veiculoRef?.ultima_atualizacao ?? new Date().toISOString(),
    status_operacional: veiculoRef?.status_operacional ?? "parado_ligado",
    rastreador_imei: turnoAtivo?.rastreador_imei || veiculoRef?.rastreador_imei || null,
  };
}
