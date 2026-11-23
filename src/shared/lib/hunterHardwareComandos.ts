/**
 * Hunter — Sanitização Canônica Universal de Comandos de Hardware GT06 / J16 / Concox
 *
 * Regra Universal Comprovada no Hardware Real (Manual Voxter J16 / Protocolo Concox GT06):
 * 1. Comandos de parametrização estendida de registradores da MCU (família SZCS# e consultas CXCS#):
 *    NUNCA devem ter o delimitador '#' no final. No parser da MCU, '#' atua como separador de múltiplos
 *    parâmetros (ex: SZCS#CMD1=1#CMD2=2). Um '#' no final faz a MCU esperar outro parâmetro inexistente
 *    e cuspir "ERROR:".
 *    Além disso, registradores como SZCS#ANGLEVALUE=X-Y exigem intervalo X >= 10s físico no firmware.
 *    Valores menores (ex: 3-015 ou 1-015) são rejeitados pelo hardware com "ERROR: ANGLEVALUE=...".
 *    Exemplos comprovados ao vivo no J16:
 *    - SZCS#ACCLINE=1         -> SETOK: ACCLINE=1
 *    - SZCS#MTK_DISSLP=0      -> SETOK: MTK_DISSLP=0
 *    - SZCS#SLPDISCONNECT=0   -> SETOK: SLPDISCONNECT=0
 *    - SZCS#GPS_DISSLP=0      -> SETOK: GPS_DISSLP=0
 *    - SZCS#GT06IEXVOL=2      -> SETOK: GT06IEXVOL=2
 *    - SZCS#ANGLE,SEND=1      -> SETOK: ANGLE,SEND=1
 *    - SZCS#ANGLEVALUE=10-015 -> SETOK: ANGLEVALUE=10-015
 *    - SZCS#SOURCE,OFF,TYPE=1 -> SETOK: SOURCE,OFF,TYPE=1
 *    - CXCS#MTK_DISSLP        -> READOK: MTK_DISSLP=0
 *
 * 2. Comandos Concox / GT06 padrão:
 *    - Comandos de telemetria, rede e consultas (TIMER, SERVER, APN, HBT, PARAM, STATUS, RELAY#, WHERE, RESET, FACTORY, etc.):
 *      Exigem COMPULSORIAMENTE o terminador '#' no final para o parser da MCU em C delimitar o término da string.
 *    - Comandos de acionamento e corte de relé (RELAY,1, RELAY,0, DYD, HFYD):
 *      NUNCA levam o terminador '#' no final.
 *    Exemplos comprovados ao vivo no J16:
 *    - TIMER,30,1800#
 *    - SERVER,1,gps.oficial.tec.br,7003,0#
 *    - APN,voxter.br,voxter,voxter#
 *    - HBT,120,300#
 *    - RELAY,1
 *    - RELAY,0
 *    - RELAY#
 *    - STATUS#
 *    - PARAM#
 *    - RESET#
 */

export function sanitizarComandoHardware(cmd: string): string {
  let limpo = (cmd || "").trim();
  if (!limpo) return "";

  const isSzcsOuCxcs =
    limpo.toUpperCase().startsWith("SZCS#") ||
    limpo.toUpperCase().startsWith("CXCS#") ||
    (limpo.toUpperCase().startsWith("SCXSZ#") && limpo.length > 6);

  if (isSzcsOuCxcs) {
    // Comandos de registradores da MCU NUNCA levam '#' no final
    while (limpo.endsWith("#")) {
      limpo = limpo.slice(0, -1).trim();
    }

    // Salvaguarda física de firmware Voxter J16: SZCS#ANGLEVALUE=X-Y exige amostragem X >= 10s.
    // Intervalos inferiores a 10s causam "ERROR: ANGLEVALUE=X-Y" no parser da MCU.
    const matchAngle = limpo.match(/^SZCS#ANGLEVALUE=(\d+)-(\d+)$/i);
    if (matchAngle) {
      const segundos = parseInt(matchAngle[1], 10);
      const graus = matchAngle[2].padStart(3, "0");
      if (segundos < 10) {
        limpo = `SZCS#ANGLEVALUE=10-${graus}`;
      }
    }
  } else {
    const upper = limpo.toUpperCase();
    const isRelayAcaoOuCorte =
      upper.startsWith("RELAY,") || upper.startsWith("DYD") || upper.startsWith("HFYD");

    // Comandos de protocolo Coban / G900L / AT Hayes NUNCA devem ter '#' forçado no final
    // Coban utiliza senhas de 4 a 6 dígitos diretamente anexadas ao comando (ex: check123456, status123456, adminip123456, etc.)
    // ou sintaxe específica de telemetria Coban (fix030s***n, time zone, etc.)
    const semHashUpper = upper.replace(/#+$/, "");
    const isCobanComSenha =
      /^(ADMINIP|APN|HBT|CHECK|STATUS|IMEI|GPRS|STOP|RESUME|RESET|EXTPOWER|LOWBATTERY|SHOCK|MOVE|ACC|SLEEP|SPEED|BEGIN|DEACTIVATE|PASSWORD)\d{4,6}(\s|$)/i.test(
        semHashUpper,
      );
    const isCobanSintaxe =
      /^(FIX\d{3}s\*\*\*n|NOFIX|TIME\s*ZONE\d*|G\d{4,6}#?|LESS\s*GPRS|NOGPRS|TCP|UDP|ARM|DISARM)/i.test(
        semHashUpper,
      );
    const isCobanCurto =
      /^(B|A|J|K|L|M|E)(\s*;?\s*)?$/i.test(semHashUpper) ||
      /^(C|H),\d+[smh]?(\s*;?\s*)?$/i.test(semHashUpper) ||
      upper.startsWith("**,IMEI:") ||
      upper.startsWith("##,IMEI:");
    const isAtHayes =
      upper.startsWith("AT") ||
      upper.startsWith("AT+") ||
      upper.startsWith("ATI") ||
      upper.startsWith("ATE");

    if (isRelayAcaoOuCorte || isCobanComSenha || isCobanSintaxe || isCobanCurto || isAtHayes) {
      // Comandos de ação de relé/corte e protocolo Coban/AT NUNCA levam '#' no final
      while (limpo.endsWith("#")) {
        limpo = limpo.slice(0, -1).trim();
      }
    } else if (upper.startsWith("ADMIN")) {
      // Preserva a formatação exata digitada para admin
    } else {
      // Outros comandos Concox padrão e consultas (TIMER, SERVER, APN, HBT, STATUS, PARAM, RELAY#, RESET)
      if (!limpo.endsWith("#")) {
        limpo = `${limpo}#`;
      }
    }
  }

  return limpo;
}

const CONSULTAS_CONCOX_PERMITIDAS = new Set([
  "STATUS",
  "WHERE",
  "PARAM",
  "VERSION",
  "GPRS",
  "GPRSSET",
  "APN",
  "RELAY",
  "MILEAGE",
  "SERVER",
  "HBT",
  "TIMER",
  "SENDS",
  "CENTER",
  "SOS",
  "CXZT",
  "SCXSZ",
  "URL",
  "ACCALM",
  "SENALM",
  "POWERALM",
  "BATALM",
  "MOVING",
  "DEFENSE",
  "SPEED",
  "PASSWORD",
  "LED",
  "LEVEL",
]);

const CONSULTAS_AT_PERMITIDAS = new Set([
  "AT",
  "ATI",
  "AT+CGSN",
  "AT+CGMM",
  "AT+CGMR",
  "AT+CGMI",
  "AT+CCID",
  "AT+ICCID",
  "AT+CSQ",
  "AT+CPIN?",
  "AT+COPS?",
  "AT+CREG?",
  "AT+CEREG?",
  "AT+CGATT?",
  "AT+CGDCONT?",
  "AT+CGACT?",
  "AT+CPSMS?",
  "AT+NETOPEN?",
  "AT+CIPOPEN?",
  "AT+CGPADDR=1",
  "AT+CGPADDR",
  "AT+CGNSSINFO",
  "AT+CFUN?",
]);

const CONSULTAS_COBAN_PERMITIDAS = new Set([
  "B",
  "CHECK123456",
  "STATUS123456",
  "IMEI123456",
  "G123456",
]);

/**
 * Verifica estritamente se um comando de hardware é exclusivamente de consulta (Read-Only)
 * para governança do perfil S.adm Auditor tanto no painel quanto no Gateway/USB.
 */
export function ehComandoConsultaSomenteLeitura(cmd: string): boolean {
  const bruto = (cmd || "")
    .trim()
    .toUpperCase()
    .replace(/[\r\n]/g, "");
  if (!bruto) return false;

  // Consultas de registrador MCU J16: CXCS#<REGISTRADOR> (jamais aceita '=' ou múltiplos comandos)
  const semHashFinal = bruto.replace(/#+$/, "");
  if (/^CXCS#[A-Z0-9_,]+$/.test(semHashFinal)) {
    return true;
  }

  // Consultas AT e Coban (antes de remover qualquer caractere especial)
  if (CONSULTAS_AT_PERMITIDAS.has(bruto) || CONSULTAS_COBAN_PERMITIDAS.has(semHashFinal)) {
    return true;
  }

  // Consultas Concox / GT06 padrão (sem argumentos de escrita)
  return CONSULTAS_CONCOX_PERMITIDAS.has(semHashFinal);
}

/**
 * Verifica se um comando é estritamente de bloqueio / corte de combustível.
 * Utilizado para controle granular independente de permissões do perfil Locatário.
 */
export function ehComandoBloqueio(cmd: string): boolean {
  const upper = (cmd || "")
    .trim()
    .toUpperCase()
    .replace(/[\r\n]/g, "");
  if (!upper) return false;

  // Comandos Concox / GT06 / J16 para armar relé ou cortar combustível
  if (upper.startsWith("RELAY,1") || upper.startsWith("DYD")) {
    return true;
  }

  // Comandos Coban / G900L TCP e SMS para corte
  if (
    upper === "J" ||
    upper === "J;" ||
    upper.endsWith(",J") ||
    upper.endsWith(",J;") ||
    upper.includes(",J;") ||
    upper.includes(",J,") ||
    /^STOP\d{4,6}/i.test(upper)
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se um comando é estritamente de desbloqueio / liberação de combustível.
 * Utilizado para controle granular independente de permissões do perfil Locatário.
 */
export function ehComandoDesbloqueio(cmd: string): boolean {
  const upper = (cmd || "")
    .trim()
    .toUpperCase()
    .replace(/[\r\n]/g, "");
  if (!upper) return false;

  // Comandos Concox / GT06 / J16 para desarme de relé ou restaurar combustível
  if (upper.startsWith("RELAY,0") || upper.startsWith("HFYD")) {
    return true;
  }

  // Comandos Coban / G900L TCP e SMS para liberação
  if (
    upper === "K" ||
    upper === "K;" ||
    upper.endsWith(",K") ||
    upper.endsWith(",K;") ||
    upper.includes(",K;") ||
    upper.includes(",K,") ||
    /^RESUME\d{4,6}/i.test(upper)
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se um comando é de bloqueio ou desbloqueio de veículo.
 * Mantido para auditorias gerais e compatibilidade.
 */
export function ehComandoBloqueioOuDesbloqueio(cmd: string): boolean {
  return ehComandoBloqueio(cmd) || ehComandoDesbloqueio(cmd);
}
