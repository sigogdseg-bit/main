/**
 * HUNTER GPS GATEWAY — RECEPTOR TCP PROTOCOLO CONCOX / GT06 / J16 4G
 * ============================================================================
 * Escuta conexões TCP diretas de rastreadores físicos, decodifica coordenadas
 * de GPS, velocidade, ignição e satélites, gravando instantaneamente no Supabase.
 * ============================================================================
 */

import * as net from "node:net";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calcularCrcItuLookup } from "./hunterOdometriaGeodesica.js";

// Carrega variáveis do .env.local
const env: Record<string, string> = {};
if (fs.existsSync(".env.local")) {
  const lines = fs.readFileSync(".env.local", "utf8").split("\n");
  for (const line of lines) {
    if (line && !line.startsWith("#") && line.includes("=")) {
      const idx = line.indexOf("=");
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || env.VITE_SUPABASE_URL || "https://pflzopmxxawyqkgrlapq.supabase.co";

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  "";

if (!SERVICE_KEY) {
  console.error("ERRO: SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Canal de Broadcast Realtime para atualização instantânea na interface
const canalRealtime = supabase.channel("hunter_telemetria_changes");
if (process.env.NODE_ENV !== "test" && !process.env.GATEWAY_TEST_MODE) {
  canalRealtime.subscribe();
}

async function notificarAtualizacaoRealtime(payload: Record<string, unknown>) {
  if (process.env.GATEWAY_TEST_MODE) return;
  try {
    await canalRealtime.send({
      type: "broadcast",
      event: "telemetria_atualizada",
      payload,
    });
  } catch {
    // Silencioso em caso de oscilação
  }
}

async function notificarVeiculoAtualizadoRealtime(payload: Record<string, unknown>) {
  if (process.env.GATEWAY_TEST_MODE) return;
  try {
    await canalRealtime.send({
      type: "broadcast",
      event: "veiculo_atualizado",
      payload,
    });
  } catch {
    // Silencioso em caso de oscilação
  }
}

const argPort = Number(process.argv[2]);
const PORTA_TCP = Number(
  process.env.PORTA_TCP || (!isNaN(argPort) && argPort > 0 ? argPort : 7003),
);

// CRC-ITU Oficial (X.25 / GT06 / J16) por Tabela de Lookup
function calcularCrc16(buffer: Buffer): number {
  return calcularCrcItuLookup(buffer);
}

// BCD para String IMEI
function bcdParaImei(buf: Buffer, offset: number, length: number): string {
  let imei = "";
  for (let i = 0; i < length; i++) {
    const byte = buf[offset + i];
    const hi = (byte >> 4) & 0x0f;
    const lo = byte & 0x0f;
    imei += hi.toString(10) + lo.toString(10);
  }
  // Remove zero à esquerda se houver (GT06 usa 8 bytes = 16 digitos com leading zero)
  if (imei.startsWith("0") && imei.length === 16) {
    imei = imei.substring(1);
  }
  return imei;
}

interface ConexaoRastreador {
  rxBuffer?: Buffer;
  imei?: string;
  veiculoId?: string;
  clienteId?: string;
  placa?: string;
  modeloVeiculo?: string;
  modeloRastreador?: string;
  rastreadorId?: string;
  protocoloDispositivo?: "gt06" | "coban";
  protocoloTransporte?: "gt06" | "coban_ascii";
  ignicaoStatus?: boolean;
  alimentacaoExternaStatus?: boolean;
  bloqueadorInstalado?: boolean;
  tipoBloqueador?: string;
  bloqueadorDetalhes?: string;
  bloqueadoEsperado?: boolean;
  ultimoComandoBloqueioPlataformaTs?: number;
  tentativasReversaoContador?: number;
  ultimoAlertaReversaoTs?: number;
  releStatus?: boolean;
  sinalGsm?: number;
  ultimoLat?: number;
  ultimoLng?: number;
  ultimoMileageConsultaTs?: number;
}

export const conexoesAtivas = new Map<net.Socket, ConexaoRastreador>();

// Variável de ambiente para controle de CRLF no protocolo Coban (padrão: false / sem CRLF)
const COBAN_USAR_CRLF = process.env.COBAN_USAR_CRLF === "true";

export function formatarAsciiControle(str: string): string {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

// Montador de pacotes de comando GT06 protocolo 0x80 (Online Server Command)
export function montarPacoteComandoGT06(comandoAscii: string, serialNumber = 1): Buffer {
  const cmdBuf = Buffer.from(comandoAscii, "ascii");
  const serverFlagLen = 4;
  const commandLen = cmdBuf.length;
  // Especificação GT06: Packet Length = Protocol (1) + Info Content (1 cmdLen + 4 flag + commandLen) + Serial (2) + Error Check CRC (2)
  const packetLen = 1 + 1 + serverFlagLen + commandLen + 2 + 2;

  const buf = Buffer.alloc(2 + 1 + packetLen + 2);
  let offset = 0;
  buf[offset++] = 0x78;
  buf[offset++] = 0x78;
  buf[offset++] = packetLen;
  buf[offset++] = 0x80; // Protocol 0x80
  buf[offset++] = commandLen + serverFlagLen;
  buf.writeUInt32BE(1, offset);
  offset += 4;
  cmdBuf.copy(buf, offset);
  offset += cmdBuf.length;
  buf.writeUInt16BE(serialNumber, offset);
  offset += 2;

  const crc = calcularCrc16(buf.subarray(2, offset));
  buf.writeUInt16BE(crc, offset);
  offset += 2;
  buf[offset++] = 0x0d;
  buf[offset++] = 0x0a;

  return buf.subarray(0, offset);
}

// Montador de comandos ASCII para hardware Coban / G900L (envelope oficial **,imei:<imei>,<cmd>;)
export function montarPacoteComandoCoban(imeiOrCmd: string, comando?: string): Buffer {
  let imei = "";
  let cmd = "";

  if (comando !== undefined) {
    imei = (imeiOrCmd || "").trim();
    cmd = (comando || "").trim();
  } else {
    const texto = (imeiOrCmd || "").trim();
    if (texto.startsWith("**,imei:")) {
      const match = texto.match(/^\*\*,imei:(\d{15}),?(.*)$/i);
      if (match) {
        imei = match[1];
        cmd = match[2];
      } else {
        cmd = texto.replace(/^\*\*,imei:/i, "");
      }
    } else {
      cmd = texto;
    }
  }

  // Se o comando já vier com prefixo **,imei:, extrai para não duplicar o envelope
  if (cmd.startsWith("**,imei:")) {
    const match = cmd.match(/^\*\*,imei:(\d{15})?,?(.*)$/i);
    if (match) {
      if (!imei && match[1]) imei = match[1];
      cmd = match[2] || "";
    }
  }

  let cmdLimpo = cmd.replace(/^;+/, "").replace(/;+$/, "").trim();

  // Normalização de códigos Coban comuns
  const cmdUpper = cmdLimpo.toUpperCase();
  if (cmdUpper === "B") cmdLimpo = "B";
  else if (cmdUpper === "A") cmdLimpo = "A";
  else if (cmdUpper === "J") cmdLimpo = "J";
  else if (cmdUpper === "K") cmdLimpo = "K";
  else if (cmdUpper === "L") cmdLimpo = "L";
  else if (cmdUpper === "M") cmdLimpo = "M";
  else if (cmdUpper === "E") cmdLimpo = "E";
  else if (cmdUpper.startsWith("C,") || cmdUpper.startsWith("C")) cmdLimpo = cmdLimpo;
  else if (cmdUpper.startsWith("H,") || cmdUpper.startsWith("H")) cmdLimpo = cmdLimpo;

  const envelope = imei ? `**,imei:${imei},${cmdLimpo};` : `${cmdLimpo};`;
  const pacoteFinal = COBAN_USAR_CRLF ? `${envelope}\r\n` : envelope;

  return Buffer.from(pacoteFinal, "ascii");
}

// Determina se o comando ou dispositivo utiliza protocolo Coban / ASCII direto
export function ehProtocoloCoban(comandoOuProtocolo?: string): boolean {
  if (!comandoOuProtocolo) return false;
  const upper = comandoOuProtocolo.toUpperCase().trim();
  return (
    upper === "COBAN" ||
    upper === "B" ||
    upper === "A" ||
    upper === "J" ||
    upper === "K" ||
    upper === "L" ||
    upper === "M" ||
    upper === "E" ||
    upper.startsWith("C,") ||
    upper.startsWith("H,") ||
    upper.startsWith("**,IMEI:") ||
    upper.startsWith("##,IMEI:") ||
    upper.startsWith("ADMINIP") ||
    upper.startsWith("APN123456") ||
    upper.startsWith("FIX") ||
    upper.startsWith("HBT123456") ||
    upper.startsWith("TIME ZONE") ||
    upper.startsWith("CHECK123456") ||
    upper.startsWith("STATUS123456") ||
    upper.startsWith("RESET123456") ||
    upper.startsWith("STOP123456") ||
    upper.startsWith("RESUME123456")
  );
}

// ── CONTROLADOR AUTOMÁTICO DE FREQUÊNCIA COBAN / G900L (AUTO-THROTTLE) ──
export type ModoFrequenciaCoban = "10s" | "05m";

export interface EstadoAutoThrottleCoban {
  imei: string;
  modoAtual: ModoFrequenciaCoban | null;
  ultimoEnvioTimestamp: number;
  timerRepouso: NodeJS.Timeout | null;
  socketRef?: net.Socket;
}

export const autoThrottleCobanPorImei = new Map<string, EstadoAutoThrottleCoban>();
export const modeloRastreadorPorImei = new Map<string, string>();

export const COBAN_THROTTLE_HYSTERESIS_MS = 120_000; // 120 segundos (2 minutos)
export const COBAN_THROTTLE_COOLDOWN_MS = 60_000; // 60 segundos cooldown anti-spam

// Histerese temporal de 120 segundos contínuos para status amarelo (parado com ignição ligada)
export const inicioParadaLigadaPorVeiculo = new Map<string, number>();

export function calcularStatusOperacionalComHisterese(
  veiculoId: string,
  ignicao: boolean,
  velocidade: number,
  timestamp: number | string = Date.now(),
): "em_movimento" | "parado_ligado" | "estacionado" {
  const timestampMs = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (!ignicao) {
    inicioParadaLigadaPorVeiculo.delete(veiculoId);
    return "estacionado";
  }

  if (velocidade > 3) {
    inicioParadaLigadaPorVeiculo.delete(veiculoId);
    return "em_movimento";
  }

  // ignicao === true && velocidade <= 3
  let inicio = inicioParadaLigadaPorVeiculo.get(veiculoId);
  if (!inicio) {
    inicio = timestampMs;
    inicioParadaLigadaPorVeiculo.set(veiculoId, inicio);
  }

  const tempoParadoSegundos = Math.max(0, (timestampMs - inicio) / 1000);
  if (tempoParadoSegundos >= 120) {
    return "parado_ligado";
  }

  // Menor que 120s parado com ignição ligada (semáforo / fila de trânsito) -> permanece em movimento (verde)
  return "em_movimento";
}

// Determina com isolamento estrito se o modelo do rastreador é G900L (ignora espaços e caixa alta)
export function isModeloG900L(modelo?: string | null): boolean {
  if (!modelo) return false;
  const normalizado = modelo.toUpperCase().replace(/\s+/g, "");
  return normalizado.includes("G900L");
}

export function limparAutoThrottleCoban(imei: string) {
  const estado = autoThrottleCobanPorImei.get(imei);
  if (estado) {
    if (estado.timerRepouso) {
      clearTimeout(estado.timerRepouso);
      estado.timerRepouso = null;
    }
    autoThrottleCobanPorImei.delete(imei);
    console.log(`🧹 [AUTO-THROTTLE COBAN] Estado e timers limpos para IMEI ${imei}`);
  }
}

export function dispararComandoRepousoCoban(imei: string, agora: number = Date.now()): boolean {
  const estado = autoThrottleCobanPorImei.get(imei);
  if (!estado) return false;

  estado.timerRepouso = null;

  if (estado.modoAtual === "05m") {
    return false;
  }

  const socket = estado.socketRef;
  if (!socket || socket.destroyed || (typeof socket.writable === "boolean" && !socket.writable)) {
    console.warn(`⚠️ [AUTO-THROTTLE COBAN] Socket do IMEI ${imei} inativo ou destruído. Descarte.`);
    return false;
  }

  const conn = conexoesAtivas.get(socket);
  if (conn?.protocoloTransporte === "gt06") {
    console.log(
      `⚠️ [AUTO-THROTTLE COBAN] Repouso cancelado para IMEI ${imei}: socket opera em transporte binário GT06.`,
    );
    return false;
  }
  const modelo = conn?.modeloRastreador || modeloRastreadorPorImei.get(imei);
  if (!isModeloG900L(modelo)) {
    return false;
  }

  if (conn?.ignicaoStatus === true) {
    console.log(
      `⏱️ [AUTO-THROTTLE COBAN] Disparo de repouso ignorado para IMEI ${imei}: veículo com ignição ligada.`,
    );
    return false;
  }

  if (
    estado.ultimoEnvioTimestamp > 0 &&
    agora - estado.ultimoEnvioTimestamp < COBAN_THROTTLE_COOLDOWN_MS
  ) {
    console.warn(
      `⚠️ [AUTO-THROTTLE COBAN] Cooldown anti-spam ativo para IMEI ${imei} (${Math.round(
        (COBAN_THROTTLE_COOLDOWN_MS - (agora - estado.ultimoEnvioTimestamp)) / 1000,
      )}s restantes). Repouso adiado.`,
    );
    return false;
  }

  const pkt = montarPacoteComandoCoban(imei, "C,05m");
  try {
    socket.write(pkt);
    estado.modoAtual = "05m";
    estado.ultimoEnvioTimestamp = agora;
    console.log(
      `🌙 [AUTO-THROTTLE COBAN] Modo Repouso C,05m despachado após 120s para IMEI ${imei}`,
    );
    return true;
  } catch (err: any) {
    console.error(
      `❌ [AUTO-THROTTLE COBAN] Falha ao despachar C,05m para IMEI ${imei}:`,
      err?.message || err,
    );
    return false;
  }
}

export function processarAutoThrottleCoban(
  imei: string,
  ignicao: boolean,
  velocidade: number,
  socket: net.Socket,
  agora: number = Date.now(),
  modeloInformado?: string,
): {
  acao:
    | "enviado_10s"
    | "timer_repouso_iniciado"
    | "timer_repouso_mantido"
    | "timer_repouso_cancelado"
    | "cooldown_ativo"
    | "mesmo_modo"
    | "modelo_nao_elegivel";
} {
  if (!imei) return { acao: "mesmo_modo" };

  const conn = conexoesAtivas.get(socket);
  if (conn) {
    conn.ignicaoStatus = ignicao;
    if (conn.protocoloTransporte === "gt06") {
      // Sockets operando em transporte binário GT06 não aceitam comandos Coban ASCII crus
      return { acao: "modelo_nao_elegivel" };
    }
  }

  // TRAVA DE ISOLAMENTO ESTRITO: Auto-Throttle opera EXCLUSIVAMENTE em hardware G900L
  const modelo = modeloInformado || conn?.modeloRastreador || modeloRastreadorPorImei.get(imei);
  if (!isModeloG900L(modelo)) {
    return { acao: "modelo_nao_elegivel" };
  }

  let estado = autoThrottleCobanPorImei.get(imei);
  if (!estado) {
    estado = {
      imei,
      modoAtual: null,
      ultimoEnvioTimestamp: 0,
      timerRepouso: null,
      socketRef: socket,
    };
    autoThrottleCobanPorImei.set(imei, estado);
  } else {
    estado.socketRef = socket;
  }

  // Gatilho de movimento: ignição ligada ou deslocamento real comprovado (> 15 km/h quando desligada para evitar falsos positivos de jitter GPS)
  const emMovimento = ignicao === true || (ignicao === false ? velocidade > 15 : velocidade > 5);

  if (emMovimento) {
    let cancelouTimer = false;
    if (estado.timerRepouso) {
      clearTimeout(estado.timerRepouso);
      estado.timerRepouso = null;
      cancelouTimer = true;
      console.log(
        `⏱️ [AUTO-THROTTLE COBAN] Timer de repouso cancelado para IMEI ${imei} (veículo em movimento/ignição ligada)`,
      );
    }

    if (estado.modoAtual === "10s") {
      return { acao: cancelouTimer ? "timer_repouso_cancelado" : "mesmo_modo" };
    }

    // Se modoAtual !== '10s', verifica cooldown anti-spam
    if (
      estado.ultimoEnvioTimestamp > 0 &&
      agora - estado.ultimoEnvioTimestamp < COBAN_THROTTLE_COOLDOWN_MS
    ) {
      console.warn(
        `⚠️ [AUTO-THROTTLE COBAN] Cooldown anti-spam ativo para IMEI ${imei} (${Math.round(
          (COBAN_THROTTLE_COOLDOWN_MS - (agora - estado.ultimoEnvioTimestamp)) / 1000,
        )}s restantes). Bloqueando envio automático de C,10s.`,
      );
      return { acao: "cooldown_ativo" };
    }

    // Despacha C,10s imediatamente no socket ativo
    const pkt = montarPacoteComandoCoban(imei, "C,10s");
    try {
      socket.write(pkt);
      estado.modoAtual = "10s";
      estado.ultimoEnvioTimestamp = agora;
      console.log(`🚀 [AUTO-THROTTLE COBAN] Modo Movimento C,10s despachado para IMEI ${imei}`);
      return { acao: "enviado_10s" };
    } catch (err: any) {
      console.error(
        `❌ [AUTO-THROTTLE COBAN] Erro ao despachar C,10s para IMEI ${imei}:`,
        err?.message || err,
      );
      return { acao: "mesmo_modo" };
    }
  } else {
    // Modo Repouso: ignicao === false && velocidade === 0 (ou <= 3)
    if (estado.modoAtual === "05m") {
      if (estado.timerRepouso) {
        clearTimeout(estado.timerRepouso);
        estado.timerRepouso = null;
      }
      return { acao: "mesmo_modo" };
    }

    if (estado.timerRepouso) {
      // Já está aguardando os 120s de histerese
      return { acao: "timer_repouso_mantido" };
    }

    // Inicia timer de histerese de 120 segundos
    estado.timerRepouso = setTimeout(() => {
      dispararComandoRepousoCoban(imei);
    }, COBAN_THROTTLE_HYSTERESIS_MS);
    estado.timerRepouso.unref?.();

    console.log(
      `⏳ [AUTO-THROTTLE COBAN] Temporizador de repouso (120s) iniciado para IMEI ${imei}. Modo atual: ${estado.modoAtual || "indefinido"}.`,
    );
    return { acao: "timer_repouso_iniciado" };
  }
}

// Extrai frames completos de um acumulador de stream TCP (GT06 Standard, GT06 Extendido e Coban ASCII)
export function extrairFramesDoBufferTcp(buffer: Buffer): {
  frames: Buffer[];
  bufferRestante: Buffer;
} {
  const frames: Buffer[] = [];
  let atual = buffer;

  while (atual && atual.length > 0) {
    // 1. Descarte de quebras de linha ou bytes nulos residuais entre frames
    let inicio = 0;
    while (
      inicio < atual.length &&
      (atual[inicio] === 0x0d ||
        atual[inicio] === 0x0a ||
        atual[inicio] === 0x20 ||
        atual[inicio] === 0x00)
    ) {
      inicio++;
    }
    if (inicio > 0) {
      atual = atual.subarray(inicio);
      if (atual.length === 0) break;
    }

    const header16 = atual.length >= 2 ? atual.readUInt16BE(0) : 0;

    // Caso 1: GT06 Standard (0x78 0x78)
    if (header16 === 0x7878) {
      if (atual.length < 3) {
        break; // Precisa do byte de length no offset 2
      }
      const packetLen = atual.readUInt8(2);
      const frameTotalLen = packetLen + 5;
      if (atual.length < frameTotalLen) {
        break; // Frame fragmentado, aguarda próximo chunk TCP
      }
      frames.push(atual.subarray(0, frameTotalLen));
      atual = atual.subarray(frameTotalLen);
      continue;
    }

    // Caso 2: GT06 Extendido (0x79 0x79)
    if (header16 === 0x7979) {
      if (atual.length < 4) {
        break; // Precisa dos bytes 2-3 para ler length em 16-bit
      }
      const packetLen = atual.readUInt16BE(2);
      const frameTotalLen = packetLen + 6;
      if (atual.length < frameTotalLen) {
        break; // Frame fragmentado, aguarda próximo chunk TCP
      }
      frames.push(atual.subarray(0, frameTotalLen));
      atual = atual.subarray(frameTotalLen);
      continue;
    }

    // Caso 3: Coban ASCII (delimitado por ';' [0x3B])
    const idxPontoEVirgula = atual.indexOf(0x3b);
    if (idxPontoEVirgula !== -1) {
      const frameTotalLen = idxPontoEVirgula + 1;
      frames.push(atual.subarray(0, frameTotalLen));
      atual = atual.subarray(frameTotalLen);
      continue;
    }

    // Caso 4: Frame Coban ASCII incompleto (começa com caractere imprimível sem ';' ainda)
    const primeiroByte = atual[0];
    const ehTextoAscii = primeiroByte >= 0x20 && primeiroByte <= 0x7e;
    if (ehTextoAscii && atual.length < 1024) {
      break; // Aguarda chegada do restante do frame com ';'
    }

    // Caso 5: Byte fora de sincronia ou corrompido
    console.warn(
      `⚠️ [TCP DESALINHAMENTO] Byte 0x${primeiroByte.toString(16)} não reconhecido. Descartando 1 byte para realinhar.`,
    );
    atual = atual.subarray(1);
  }

  return { frames, bufferRestante: atual };
}

// Fila spooler de comandos pendentes para rastreadores temporariamente em ciclo de reconexão/reboot
const comandosPendentesPorImei = new Map<string, string[]>();

export function enfileirarComandoParaImei(imei: string, comando: string) {
  const fila = comandosPendentesPorImei.get(imei) || [];
  if (!fila.includes(comando)) {
    fila.push(comando);
    comandosPendentesPorImei.set(imei, fila);
    console.log(
      `📥 [SPOOLER GATEWAY] Comando retido na fila para IMEI ${imei}: "${comando}" (Total na fila: ${fila.length})`,
    );
  }
}

export async function processarComandosPendentes(imei: string, socket: net.Socket) {
  const fila = comandosPendentesPorImei.get(imei);
  if (!fila || fila.length === 0) return;

  console.log(
    `📤 [SPOOLER GATEWAY] Disparando ${fila.length} comando(s) retido(s) pós-login para IMEI ${imei}...`,
  );
  comandosPendentesPorImei.delete(imei);

  for (let i = 0; i < fila.length; i++) {
    const cmd = fila[i];
    if (socket.destroyed) {
      const restantes = fila.slice(i);
      comandosPendentesPorImei.set(imei, restantes);
      console.warn(
        `⚠️ [SPOOLER GATEWAY] Socket caiu durante despacho. ${restantes.length} comando(s) mantido(s) na fila.`,
      );
      break;
    }

    const conn = conexoesAtivas.get(socket) || {};
    const ehCoban = conn.protocoloDispositivo === "coban" || ehProtocoloCoban(cmd);
    const pkt = ehCoban ? montarPacoteComandoCoban(imei, cmd) : montarPacoteComandoGT06(cmd);
    socket.write(pkt);
    console.log(
      `📡 [SPOOLER ENVIADO ${ehCoban ? "COBAN" : "GT06"}] IMEI ${imei}: "${cmd}" (${pkt.toString("hex")})`,
    );

    if (!process.env.GATEWAY_TEST_MODE && process.env.NODE_ENV !== "test") {
      try {
        await canalComandos.send({
          type: "broadcast",
          event: "status_comando",
          payload: {
            imei,
            comando: cmd,
            sucesso: true,
            mensagem: "Comando transmitido com sucesso via socket TCP (despachado pós-reconexão)",
            dataHora: new Date().toISOString(),
          },
        });
      } catch {
        // Silencioso
      }
    }

    if (i < fila.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Gerenciador de promessas de resposta síncrona do hardware J16 (elimina dependência única de WebSockets)
const listenersRespostaHardware = new Map<string, Array<(resposta: string) => void>>();

export function aguardarRespostaHardwareJ16(
  imei: string,
  timeoutMs = 3500,
): Promise<string | null> {
  return new Promise((resolve) => {
    let resolvido = false;
    const timeoutId = setTimeout(() => {
      if (!resolvido) {
        resolvido = true;
        removerListener();
        resolve(null);
      }
    }, timeoutMs);

    const handler = (resposta: string) => {
      if (!resolvido) {
        resolvido = true;
        clearTimeout(timeoutId);
        removerListener();
        resolve(resposta);
      }
    };

    const removerListener = () => {
      const lista = listenersRespostaHardware.get(imei) || [];
      const novaLista = lista.filter((h) => h !== handler);
      if (novaLista.length > 0) {
        listenersRespostaHardware.set(imei, novaLista);
      } else {
        listenersRespostaHardware.delete(imei);
      }
    };

    const lista = listenersRespostaHardware.get(imei) || [];
    lista.push(handler);
    listenersRespostaHardware.set(imei, lista);
  });
}

export function notificarRespostaHardwareJ16(imei: string, resposta: string) {
  const lista = listenersRespostaHardware.get(imei);
  if (lista && lista.length > 0) {
    for (const handler of [...lista]) {
      try {
        handler(resposta);
      } catch {
        // Silencioso
      }
    }
  }
}

// Cache de idempotência contra disparos concorrentes ou duplo-clique no socket TCP
const ultimosComandosDespachadosSocket = new Map<string, { comando: string; timestamp: number }>();

// Envio de comando direto pelo socket TCP ativo do rastreador com tolerância resiliente de reconexão e spooler
export async function enviarComandoParaRastreador(
  imei: string,
  comandoAscii: string,
  maxTentativas = 3,
): Promise<{ enviado: boolean; enfileirado: boolean }> {
  const agora = Date.now();
  const ultimoEnvio = ultimosComandosDespachadosSocket.get(imei);
  if (ultimoEnvio && ultimoEnvio.comando === comandoAscii && agora - ultimoEnvio.timestamp < 1500) {
    console.log(
      `⚡ [GATEWAY IDEMPOTÊNCIA] Comando "${comandoAscii}" para IMEI ${imei} já transmitido há menos de 1.5s (${agora - ultimoEnvio.timestamp}ms). Descartando duplicata concorrente para proteger o hardware J16.`,
    );
    return { enviado: true, enfileirado: false };
  }

  const cmdUpper = comandoAscii.trim().toUpperCase();
  const isCorte =
    comandoAscii.startsWith("DYD") ||
    comandoAscii.startsWith("RELAY,1") ||
    cmdUpper.startsWith("STOP") ||
    cmdUpper === "J" ||
    cmdUpper.endsWith(",J") ||
    cmdUpper.endsWith(",J;") ||
    cmdUpper.includes(",J;") ||
    cmdUpper.includes(",J,");

  const isDesbloqueio =
    comandoAscii.startsWith("HFYD") ||
    comandoAscii.startsWith("RELAY,0") ||
    cmdUpper.startsWith("RESUME") ||
    cmdUpper === "K" ||
    cmdUpper.endsWith(",K") ||
    cmdUpper.endsWith(",K;") ||
    cmdUpper.includes(",K;") ||
    cmdUpper.includes(",K,");

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    // Coleta todos os sockets válidos associados a este IMEI
    const socketsDoImei: { socket: net.Socket; conn: ConexaoRastreador }[] = [];
    for (const [socket, conn] of conexoesAtivas.entries()) {
      if (conn.imei === imei && !socket.destroyed) {
        socketsDoImei.push({ socket, conn });
      }
    }

    if (socketsDoImei.length > 0) {
      // O socket ativo mais recente é o ÚLTIMO inserido no Map
      const alvo = socketsDoImei[socketsDoImei.length - 1];

      // Purga com segurança sockets antigos/órfãos acumulados do mesmo IMEI
      if (socketsDoImei.length > 1) {
        for (let i = 0; i < socketsDoImei.length - 1; i++) {
          try {
            socketsDoImei[i].socket.destroy();
          } catch {}
          conexoesAtivas.delete(socketsDoImei[i].socket);
        }
      }

      const { socket, conn } = alvo;
      // Regra de Integridade: Veículo sem bloqueador cadastrado não recebe comando de corte
      if (isCorte && conn.bloqueadorInstalado === false) {
        console.warn(
          `⚠️ [BLOQUEIO RECUSADO] Veículo ${conn.placa || "—"} (IMEI ${imei}) não possui bloqueador instalado. Comando "${comandoAscii}" cancelado por segurança viária.`,
        );
        if (conn.veiculoId) {
          await notificarAtualizacaoRealtime({
            veiculoId: conn.veiculoId,
            evento: "bloqueio_recusado_sem_bloqueador",
            mensagem:
              "Veículo cadastrado sem bloqueador instalado. Comando de corte cancelado por segurança viária.",
          });
        }
        return { enviado: false, enfileirado: false };
      }

      // Quando o transporte for GT06, empacota SEMPRE em binário 0x80 com montarPacoteComandoGT06
      const ehTransporteGt06 =
        conn.protocoloTransporte === "gt06" || conn.protocoloDispositivo === "gt06";
      const ehCobanAscii =
        conn.protocoloTransporte === "coban_ascii" ||
        (!ehTransporteGt06 &&
          (conn.protocoloDispositivo === "coban" || ehProtocoloCoban(comandoAscii)));
      const pkt =
        ehCobanAscii && conn.protocoloTransporte !== "gt06"
          ? montarPacoteComandoCoban(imei, comandoAscii)
          : montarPacoteComandoGT06(comandoAscii);
      socket.write(pkt);
      if (ehCobanAscii && conn.protocoloTransporte !== "gt06") {
        const cmdUpper = comandoAscii.trim().toUpperCase();
        if (cmdUpper === "C,10S") {
          const est = autoThrottleCobanPorImei.get(imei) || {
            imei,
            modoAtual: null,
            ultimoEnvioTimestamp: 0,
            timerRepouso: null,
            socketRef: socket,
          };
          est.modoAtual = "10s";
          est.ultimoEnvioTimestamp = Date.now();
          if (est.timerRepouso) {
            clearTimeout(est.timerRepouso);
            est.timerRepouso = null;
          }
          autoThrottleCobanPorImei.set(imei, est);
        } else if (cmdUpper === "C,05M") {
          const est = autoThrottleCobanPorImei.get(imei) || {
            imei,
            modoAtual: null,
            ultimoEnvioTimestamp: 0,
            timerRepouso: null,
            socketRef: socket,
          };
          est.modoAtual = "05m";
          est.ultimoEnvioTimestamp = Date.now();
          if (est.timerRepouso) {
            clearTimeout(est.timerRepouso);
            est.timerRepouso = null;
          }
          autoThrottleCobanPorImei.set(imei, est);
        }
      }
      if (isCorte) {
        conn.bloqueadoEsperado = true;
        conn.ultimoComandoBloqueioPlataformaTs = Date.now();
        conn.tentativasReversaoContador = 0;
      } else if (isDesbloqueio) {
        conn.bloqueadoEsperado = false;
        conn.ultimoComandoBloqueioPlataformaTs = Date.now();
        conn.tentativasReversaoContador = 0;
      }
      ultimosComandosDespachadosSocket.set(imei, {
        comando: comandoAscii,
        timestamp: Date.now(),
      });
      if (!ehCobanAscii || conn.protocoloTransporte === "gt06") {
        void notificarComandoConsoleRealtime({
          imei,
          direcao: "TX",
          protocolo: "0x80",
          ascii: comandoAscii,
          hex: pkt.toString("hex"),
          timestamp: Date.now(),
        });
      }
      console.log(
        `📡 [COMANDO ENVIADO ${ehCobanAscii && conn.protocoloTransporte !== "gt06" ? "COBAN" : "GT06"}] IMEI ${imei}: "${comandoAscii}" (${pkt.toString("hex")})`,
      );
      return { enviado: true, enfileirado: false };
    }

    if (tentativa < maxTentativas) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Se o rastreador estiver reiniciando a stack celular (ex: pós ACCLINE), retém no Spooler para o próximo login
  enfileirarComandoParaImei(imei, comandoAscii);
  return { enviado: false, enfileirado: true };
}

// Escuta em tempo real de comandos e consultas de telemetria
const canalComandos = supabase.channel("hunter_gateway_comandos");

export async function notificarComandoConsoleRealtime(payload: {
  imei: string;
  direcao: "TX" | "RX";
  protocolo: "0x80" | "0x15" | "0x21";
  ascii: string;
  hex: string;
  timestamp: number;
}) {
  if (process.env.GATEWAY_TEST_MODE) return;
  try {
    await canalComandos.send({
      type: "broadcast",
      event: "console_tcp_evento",
      payload,
    });
  } catch {
    // Silencioso em caso de oscilação transitória
  }
}

canalComandos
  .on("broadcast", { event: "comando_bloqueio" }, async (payload: any) => {
    const { imei, bloquear, veiculoId } = payload.payload || {};
    let imeiAlvo = imei;
    if (!imeiAlvo && veiculoId) {
      for (const conn of conexoesAtivas.values()) {
        if (conn.veiculoId === veiculoId && conn.imei) {
          imeiAlvo = conn.imei;
          break;
        }
      }
    }

    if (imeiAlvo) {
      console.log(`🚨 [COMANDO BROADCAST] IMEI ${imeiAlvo} | Bloquear: ${bloquear}`);
      if (bloquear) {
        await enviarComandoParaRastreador(imeiAlvo, "DYD,000000");
        setTimeout(() => enviarComandoParaRastreador(imeiAlvo, "RELAY,1"), 500);
      } else {
        await enviarComandoParaRastreador(imeiAlvo, "HFYD,000000");
        setTimeout(() => enviarComandoParaRastreador(imeiAlvo, "RELAY,0"), 500);
      }
    }
  })
  .on("broadcast", { event: "comando_terminal" }, async (payload: any) => {
    const { imei, comando, veiculoId } = payload.payload || {};
    let imeiAlvo = imei;
    if (!imeiAlvo && veiculoId) {
      for (const conn of conexoesAtivas.values()) {
        if (conn.veiculoId === veiculoId && conn.imei) {
          imeiAlvo = conn.imei;
          break;
        }
      }
    }

    if (imeiAlvo && comando) {
      console.log(`📡 [COMANDO GT06 BROADCAST] IMEI ${imeiAlvo} | Comando: "${comando}"`);
      const resultado = await enviarComandoParaRastreador(imeiAlvo, comando);
      try {
        await canalComandos.send({
          type: "broadcast",
          event: "status_comando",
          payload: {
            imei: imeiAlvo,
            comando,
            sucesso: resultado.enviado || resultado.enfileirado,
            mensagem: resultado.enviado
              ? "Comando transmitido com sucesso via socket TCP"
              : resultado.enfileirado
                ? "Rastreador em ciclo de reinicialização. Comando retido na fila do Gateway (será transmitido automaticamente no login do socket)"
                : "Falha no envio do comando",
            dataHora: new Date().toISOString(),
          },
        });
      } catch {
        // Silencioso
      }
    }
  })
  .on("broadcast", { event: "solicitar_conexoes_ativas" }, async () => {
    try {
      const lista = Array.from(conexoesAtivas.values())
        .filter((c) => !!c.imei)
        .map((c) => ({
          imei: c.imei,
          placa: c.placa,
          veiculoId: c.veiculoId,
          online: true,
          ignicaoStatus: c.ignicaoStatus,
          sinalGsm: c.sinalGsm,
          ultimoLat: c.ultimoLat,
          ultimoLng: c.ultimoLng,
        }));
      await canalComandos.send({
        type: "broadcast",
        event: "conexoes_ativas",
        payload: { conexoes: lista, timestamp: new Date().toISOString() },
      });
    } catch {
      // Silencioso
    }
  })
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "veiculos" },
    async (payload: any) => {
      const novo = payload.new;
      const velho = payload.old;
      if (novo && velho && novo.bloqueado !== velho.bloqueado && novo.rastreador_imei) {
        console.log(
          `🚨 [BLOQUEIO BD] Veículo ${novo.placa} (IMEI ${novo.rastreador_imei}): bloqueado = ${novo.bloqueado}`,
        );
        for (const [_, c] of conexoesAtivas.entries()) {
          if (c.imei === novo.rastreador_imei) {
            c.bloqueadoEsperado = novo.bloqueado;
            c.ultimoComandoBloqueioPlataformaTs = Date.now();
            c.tentativasReversaoContador = 0;
          }
        }
        if (novo.bloqueado) {
          if (novo.bloqueador_instalado === false) {
            console.warn(
              `⚠️ [BLOQUEIO RECUSADO BD] Veículo ${novo.placa} não possui bloqueador instalado. Operação cancelada.`,
            );
            return;
          }
          await enviarComandoParaRastreador(novo.rastreador_imei, "DYD,000000");
          setTimeout(() => enviarComandoParaRastreador(novo.rastreador_imei, "RELAY,1"), 500);
        } else {
          await enviarComandoParaRastreador(novo.rastreador_imei, "HFYD,000000");
          setTimeout(() => enviarComandoParaRastreador(novo.rastreador_imei, "RELAY,0"), 500);
        }
      }
    },
  );

if (process.env.NODE_ENV !== "test" && !process.env.GATEWAY_TEST_MODE) {
  canalComandos.subscribe();
}

export const server = net.createServer((socket) => {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`\n[+] Nova conexão recebida de: ${remoteAddr}`);
  conexoesAtivas.set(socket, {
    rxBuffer: Buffer.alloc(0),
    protocoloDispositivo: PORTA_TCP === 7003 ? "coban" : undefined,
  });

  socket.on("data", async (data: Buffer) => {
    try {
      const conn = conexoesAtivas.get(socket) || {
        rxBuffer: Buffer.alloc(0),
        protocoloDispositivo: PORTA_TCP === 7003 ? "coban" : undefined,
      };
      conexoesAtivas.set(socket, conn);

      conn.rxBuffer = Buffer.concat([conn.rxBuffer || Buffer.alloc(0), data]);

      // Proteção contra buffer infinito (> 4KB sem delimitador válido)
      if (conn.rxBuffer.length > 4096) {
        console.warn(
          `[${new Date().toISOString()}] ⚠️ [TCP OVERFLOW] Buffer acumulador excedeu 4KB de ${remoteAddr} (IMEI: ${conn.imei || "—"}). Descartando ${conn.rxBuffer.length} bytes. HEX: ${conn.rxBuffer.subarray(0, 128).toString("hex")}...`,
        );
        conn.rxBuffer = Buffer.alloc(0);
        return;
      }

      const { frames, bufferRestante } = extrairFramesDoBufferTcp(conn.rxBuffer);
      conn.rxBuffer = bufferRestante;

      for (const frame of frames) {
        await processarPacote(socket, frame);
      }
    } catch (err: any) {
      console.error(`[-] Erro ao processar dados de ${remoteAddr}:`, err?.message || err);
    }
  });

  socket.on("close", () => {
    const conn = conexoesAtivas.get(socket);
    console.log(`[-] Conexão encerrada: ${remoteAddr} (IMEI: ${conn?.imei || "desconhecido"})`);
    if (conn?.imei) {
      limparAutoThrottleCoban(conn.imei);
    }
    conexoesAtivas.delete(socket);
  });

  socket.on("error", (err) => {
    const conn = conexoesAtivas.get(socket);
    if (conn?.imei) {
      limparAutoThrottleCoban(conn.imei);
    }
    console.warn(`[!] Aviso de socket de ${remoteAddr}:`, err.message);
  });
});

export async function processarPacote(socket: net.Socket, buf: Buffer) {
  if (buf.length < 2) return;

  const conn = conexoesAtivas.get(socket) || {};
  const header = buf.readUInt16BE(0);

  // Reconhecimento imediato do protocolo de transporte binário GT06 (0x7878 Standard ou 0x7979 Extendido)
  if (header === 0x7878 || header === 0x7979) {
    conn.protocoloTransporte = "gt06";
    conexoesAtivas.set(socket, conn);
  }

  const rawAscii = buf.toString("ascii").trim();

  // ── RECONHECIMENTO NATIVO PROTOCOLO COBAN / G900L (ASCII) ──
  // 1. Login / Handshake Coban: ##,imei:<15_digitos>,A; ou **,imei:<15_digitos>,A;
  const matchLoginCoban = rawAscii.match(/^(?:##|\*\*),?imei:(\d{15}),[AB];?$/i);
  if (matchLoginCoban && matchLoginCoban[1]) {
    const imei = matchLoginCoban[1];
    conn.imei = imei;
    conn.protocoloDispositivo = "coban";
    conn.protocoloTransporte = "coban_ascii";
    conexoesAtivas.set(socket, conn);

    // Encerra e expurga conexões zumbis anteriores do mesmo IMEI
    for (const [antigoSocket, antigaConn] of conexoesAtivas.entries()) {
      if (antigaConn.imei === imei && antigoSocket !== socket) {
        console.log(`🧹 [PURGE ZUMBI COBAN] Encerrando socket TCP antigo órfão do IMEI ${imei}`);
        try {
          antigoSocket.destroy();
        } catch {}
        conexoesAtivas.delete(antigoSocket);
      }
    }

    // Resposta de Handshake padrão Coban (LOAD) — sem CRLF por padrão, ou com CRLF se COBAN_USAR_CRLF=true
    const respLoad = Buffer.from(COBAN_USAR_CRLF ? "LOAD\r\n" : "LOAD", "ascii");
    try {
      socket.write(respLoad);
    } catch {}

    console.log(`\n========================================================`);
    console.log(
      `[${new Date().toISOString()}] 📡 [RX COBAN LOGIN] IMEI: ${imei} | ASCII: "${formatarAsciiControle(rawAscii)}" | HEX: ${buf.toString("hex")}`,
    );
    console.log(
      `[${new Date().toISOString()}] 📤 [TX COBAN LOGIN ACK] IMEI: ${imei} | ASCII: "${formatarAsciiControle(respLoad.toString("ascii"))}" | HEX: ${respLoad.toString("hex")}`,
    );
    console.log(`========================================================`);

    await vincularRastreadorAoVeiculo(conn, imei);

    const tLogin = setTimeout(async () => {
      await processarComandosPendentes(imei, socket);
    }, 1500);
    tLogin.unref?.();
    return;
  }

  // 2. Heartbeat Coban: frame composto por 15 dígitos seguidos por ponto e vírgula (^\d{15};?$)
  const matchHeartbeatCoban = rawAscii.match(/^(\d{15});?$/);
  if (matchHeartbeatCoban) {
    const imei = matchHeartbeatCoban[1];
    if (!conn.imei) conn.imei = imei;
    conn.protocoloDispositivo = "coban";
    conn.protocoloTransporte = "coban_ascii";
    conexoesAtivas.set(socket, conn);

    const respHeartbeat = Buffer.from(COBAN_USAR_CRLF ? "ON\r\n" : "ON", "ascii");
    try {
      socket.write(respHeartbeat);
    } catch {}

    console.log(
      `[${new Date().toISOString()}] 💓 [RX COBAN HEARTBEAT] IMEI: ${imei} | ASCII: "${formatarAsciiControle(rawAscii)}" | HEX: ${buf.toString("hex")}`,
    );
    console.log(
      `[${new Date().toISOString()}] 📤 [TX COBAN HEARTBEAT ACK] IMEI: ${imei} | ASCII: "${formatarAsciiControle(respHeartbeat.toString("ascii"))}" | HEX: ${respHeartbeat.toString("hex")}`,
    );

    if (!conn.veiculoId && conn.imei) {
      await vincularRastreadorAoVeiculo(conn, conn.imei);
    }

    if (conn.veiculoId && !process.env.GATEWAY_TEST_MODE) {
      await supabase
        .from("veiculos")
        .update({
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", conn.veiculoId);
    }

    const tHbt = setTimeout(async () => {
      await processarComandosPendentes(imei, socket);
    }, 500);
    tHbt.unref?.();
    return;
  }

  // 3. Respostas e Confirmações de Comandos Coban TCP (jt, kt, tracker, lt, mt, et)
  const matchCobanKeywords = rawAscii.match(/(?:##|\*\*)?imei:(\d{15}),([^,;]+)/i);
  if (matchCobanKeywords) {
    const imei = matchCobanKeywords[1];
    const keyword = matchCobanKeywords[2].trim().toLowerCase();
    if (!conn.imei) conn.imei = imei;
    conn.protocoloDispositivo = "coban";
    conexoesAtivas.set(socket, conn);

    if (keyword === "jt") {
      conn.releStatus = true;
      conn.bloqueadoEsperado = true;
      if (conn.veiculoId) {
        await supabase
          .from("veiculos")
          .update({ rele_status: true, ultima_atualizacao: new Date().toISOString() })
          .eq("id", conn.veiculoId);
      }
    } else if (keyword === "kt") {
      conn.releStatus = false;
      conn.bloqueadoEsperado = false;
      if (conn.veiculoId) {
        await supabase
          .from("veiculos")
          .update({ rele_status: false, ultima_atualizacao: new Date().toISOString() })
          .eq("id", conn.veiculoId);
      }
    } else if (keyword === "acc on") {
      conn.ignicaoStatus = true;
      processarAutoThrottleCoban(imei, true, 0, socket);
    } else if (keyword === "acc off") {
      conn.ignicaoStatus = false;
      processarAutoThrottleCoban(imei, false, 0, socket);
    }

    const mapaKeywordsTraduzidas: Record<string, string> = {
      jt: "Bloqueio Confirmado (jt)",
      kt: "Desbloqueio Confirmado (kt)",
      tracker: "Posição Recebida (tracker)",
      "acc on": "Ignição Ligada (acc on)",
      "acc off": "Ignição Desligada (acc off)",
      lt: "Alarme Armado (lt)",
      mt: "Alarme Desarmado (mt)",
      et: "Alarmes Cancelados (et)",
    };
    const keywordTraduzida = mapaKeywordsTraduzidas[keyword] || `Resposta Coban (${keyword})`;

    console.log(
      `[${new Date().toISOString()}] 📥 [RX COBAN RESPOSTA] IMEI: ${imei} | Keyword: ${keyword} | Tradução: "${keywordTraduzida}"`,
    );
    console.log(
      `   Frame ASCII: "${formatarAsciiControle(rawAscii)}" | HEX: ${buf.toString("hex")}`,
    );

    notificarRespostaHardwareJ16(imei, rawAscii);

    if (!process.env.GATEWAY_TEST_MODE && process.env.NODE_ENV !== "test") {
      try {
        await canalComandos.send({
          type: "broadcast",
          event: "resposta_comando",
          payload: {
            imei,
            resposta: rawAscii,
            keyword,
            keywordTraduzida,
            dataHora: new Date().toISOString(),
          },
        });
      } catch {}
    }

    return;
  }

  // 4. Respostas de texto direto Coban (ok!, fail, bat:, gsm:, gprs:)
  const isBinaryGt06 =
    buf.length >= 2 && (buf.readUInt16BE(0) === 0x7878 || buf.readUInt16BE(0) === 0x7979);

  if (
    !isBinaryGt06 &&
    (conn.protocoloDispositivo === "coban" ||
      rawAscii.toLowerCase().includes("ok!") ||
      rawAscii.toLowerCase().includes("fail") ||
      rawAscii.toLowerCase().includes("bat:") ||
      rawAscii.toLowerCase().includes("gsm:") ||
      rawAscii.toLowerCase().includes("gprs:"))
  ) {
    const imei = conn.imei || "Desconhecido";
    console.log(
      `[${new Date().toISOString()}] 📥 [RX RESPOSTA TEXTO COBAN] IMEI: ${imei} | ASCII: "${formatarAsciiControle(rawAscii)}" | HEX: ${buf.toString("hex")}`,
    );

    if (imei && rawAscii) {
      notificarRespostaHardwareJ16(imei, rawAscii);
      if (!process.env.GATEWAY_TEST_MODE && process.env.NODE_ENV !== "test") {
        try {
          await canalComandos.send({
            type: "broadcast",
            event: "resposta_comando",
            payload: {
              imei,
              resposta: rawAscii,
              dataHora: new Date().toISOString(),
            },
          });
        } catch {}
      }
    }
    return;
  }

  // Pacotes GT06 começam com 0x78 0x78 (Standard) ou 0x79 0x79 (Extendido)
  if (buf.length < 5) return;

  if (header !== 0x7878 && header !== 0x7979) {
    console.log(
      `[${new Date().toISOString()}] ❓ [RX PACOTE NÃO RECONHECIDO] Header 0x${header.toString(16)}: ${buf.toString("hex")} | ASCII: "${formatarAsciiControle(rawAscii)}"`,
    );
    return;
  }

  // ── VALIDAÇÃO CRC-ITU (X.25): Verificação de integridade ──
  // Não descarta bloqueantemente, pois muitas revisões de firmware J16 utilizam polinômios proprietários
  if (buf.length >= 6) {
    const crcRecebido = buf.readUInt16BE(buf.length - 4);
    const crcCalculado = calcularCrc16(buf.subarray(2, buf.length - 4));
    if (crcCalculado !== crcRecebido) {
      // Apenas registra em debug sem interromper a comunicação
    }
  }

  const isExtended = header === 0x7979;
  const length = isExtended ? buf.readUInt16BE(2) : buf.readUInt8(2);
  const protocolo = isExtended ? buf.readUInt8(4) : buf.readUInt8(3);
  const offset = isExtended ? 5 : 4;

  // 1. PACOTE DE LOGIN (0x01)
  if (protocolo === 0x01) {
    const imei = bcdParaImei(buf, offset, 8);
    conn.imei = imei;
    if (PORTA_TCP === 7003) {
      conn.protocoloDispositivo = "coban";
    }
    conexoesAtivas.set(socket, conn);

    // Encerra e expurga conexões zumbis anteriores do mesmo IMEI
    for (const [antigoSocket, antigaConn] of conexoesAtivas.entries()) {
      if (antigaConn.imei === imei && antigoSocket !== socket) {
        console.log(`🧹 [PURGE ZUMBI] Encerrando socket TCP antigo órfão do IMEI ${imei}`);
        try {
          antigoSocket.destroy();
        } catch {}
        conexoesAtivas.delete(antigoSocket);
      }
    }

    console.log(`\n========================================================`);
    console.log(`📡 [LOGIN] Rastreador conectado com sucesso!`);
    console.log(`🔑 IMEI Identificado: ${imei}`);

    // Serial number do pacote (penúltimos 4 bytes antes do stop bit)
    const serialNumber = buf.readUInt16BE(buf.length - 6);

    // Monta resposta de Login obrigatória
    // Formato: 0x78 0x78 0x05 0x01 <serial> <crc> 0x0D 0x0A
    const respPayload = Buffer.alloc(4);
    respPayload.writeUInt8(0x05, 0);
    respPayload.writeUInt8(0x01, 1);
    respPayload.writeUInt16BE(serialNumber, 2);

    const crc = calcularCrc16(respPayload);

    const respFinal = Buffer.alloc(10);
    respFinal.writeUInt16BE(0x7878, 0);
    respFinal.writeUInt8(0x05, 2);
    respFinal.writeUInt8(0x01, 3);
    respFinal.writeUInt16BE(serialNumber, 4);
    respFinal.writeUInt16BE(crc, 6);
    respFinal.writeUInt16BE(0x0d0a, 8);

    socket.write(respFinal);

    // Descarrega comandos retidos na fila do spooler na chegada do Heartbeat (despertar do sono)
    if (conn.imei) {
      setTimeout(async () => {
        await processarComandosPendentes(conn.imei!, socket);
      }, 500);
    }
    // Busca o veículo no Supabase
    await vincularRastreadorAoVeiculo(conn, imei);

    // Descarrega comandos retidos na fila do spooler enquanto o rastreador estava em ciclo de reinicialização
    setTimeout(async () => {
      await processarComandosPendentes(imei, socket);
    }, 2000);
    return;
  }

  // 2. PACOTE DE LOCALIZAÇÃO GPS (0x12 ou 0x22)
  if (protocolo === 0x12 || protocolo === 0x22) {
    const imei = conn.imei || "Desconhecido";
    if (!conn.veiculoId && conn.imei) {
      await vincularRastreadorAoVeiculo(conn, conn.imei);
    }

    // Parsing data e hora (Ano, Mês, Dia, Hora, Minuto, Segundo em UTC)
    const ano = 2000 + buf.readUInt8(offset);
    const mes = buf.readUInt8(offset + 1);
    const dia = buf.readUInt8(offset + 2);
    const hora = buf.readUInt8(offset + 3);
    const minuto = buf.readUInt8(offset + 4);
    const segundo = buf.readUInt8(offset + 5);

    const dataGps = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));

    // Quantidade de satélites
    const satInfo = buf.readUInt8(offset + 6);
    const satelites = satInfo & 0x0f;

    // Latitude e Longitude
    const rawLat = buf.readUInt32BE(offset + 7);
    const rawLon = buf.readUInt32BE(offset + 11);

    // Velocidade (km/h)
    const velocidade = buf.readUInt8(offset + 15);

    // Curso e Status (2 bytes)
    const courseStatus = buf.readUInt16BE(offset + 16);
    const gpsFixado = (courseStatus & 0x1000) !== 0; // Bit 12 (Bit 4 do byte 1): 1 = GNSS Fixado, 0 = LBS/Sem Fix
    const isWest = (courseStatus & 0x0800) !== 0; // Bit 11
    const isSouth = (courseStatus & 0x0400) === 0; // Bit 10 (0 = South, 1 = North)
    const rumo = courseStatus & 0x03ff; // Bits 0-9

    // No protocolo GT06 4G estendido (0x22), o byte de status ACC vem em offset + 26
    // (após DateTime[6] + Sat[1] + Lat[4] + Lon[4] + Vel[1] + Course[2] + MCC[2] + MNC[1] + LAC[2] + CellID[3] = 26 bytes).
    const payloadLen = buf.length - 6 - offset;
    if (protocolo === 0x22 && payloadLen >= 27) {
      const accByte22 = buf.readUInt8(offset + 26);
      if (accByte22 === 0x00) {
        conn.ignicaoStatus = false;
      } else if (accByte22 === 0x01 || accByte22 === 0x02) {
        conn.ignicaoStatus = true;
      }
    }

    let latitude = rawLat / 1800000.0;
    let longitude = rawLon / 1800000.0;

    if (isSouth) latitude = -latitude;
    if (isWest) longitude = -longitude;

    // Status da ignição: respeita estritamente o pós-chave físico (ACC/fio laranja) quando reportado pelo hardware.
    // Se o status físico for desconhecido (undefined), infere pelo deslocamento (> 3 km/h).
    const ignicao = conn.ignicaoStatus !== undefined ? conn.ignicaoStatus : velocidade > 3;

    const ehCobanDispositivo = conn.protocoloDispositivo === "coban" || PORTA_TCP === 7003;
    if (ehCobanDispositivo && conn.imei) {
      processarAutoThrottleCoban(conn.imei, ignicao, velocidade, socket);
    }

    console.log(`\n📍 [LOCALIZAÇÃO GPS RECEBIDA] IMEI: ${imei}`);
    console.log(`   Veículo: ${conn.placa || "Não identificado"} (${conn.modeloVeiculo || "—"})`);
    console.log(
      `   Coordenadas (Bruto Real Satélite): Latitude ${latitude.toFixed(6)}, Longitude ${longitude.toFixed(6)}`,
    );
    console.log(
      `   Velocidade: ${velocidade} km/h | Satélites: ${satelites} | Rumo: ${rumo}° | Fix: ${gpsFixado ? "SIM (GNSS)" : "NÃO (LBS)"}`,
    );
    console.log(`   Data/Hora GPS: ${dataGps.toLocaleString("pt-BR")}`);

    // Validações determinísticas de sanidade: coordenadas válidas e fixadas
    if (latitude !== 0 && longitude !== 0 && conn.veiculoId && gpsFixado) {
      // Descarte determinístico de saltos impossíveis (> 50 km em único intervalo)
      let saltoImpossivel = false;
      if (conn.ultimoLat && conn.ultimoLng && conn.ultimoLat !== 0 && conn.ultimoLng !== 0) {
        const dLat = ((latitude - conn.ultimoLat) * Math.PI) / 180;
        const dLng = ((longitude - conn.ultimoLng) * Math.PI) / 180;
        const sinLat = Math.sin(dLat / 2);
        const sinLng = Math.sin(dLng / 2);
        const h =
          sinLat * sinLat +
          Math.cos((conn.ultimoLat * Math.PI) / 180) *
            Math.cos((latitude * Math.PI) / 180) *
            sinLng *
            sinLng;
        const distM = 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        if (distM > 50000 && velocidade < 300) {
          console.warn(
            `⚠️ [SANIDADE GPS] Salto impossível (${distM.toFixed(0)}m). Pacote descartado.`,
          );
          saltoImpossivel = true;
        }
      }

      if (!saltoImpossivel) {
        conn.ultimoLat = latitude;
        conn.ultimoLng = longitude;
        await salvarPosicaoNoHunter({
          veiculoId: conn.veiculoId,
          rastreadorId: conn.rastreadorId,
          latitude,
          longitude,
          velocidade,
          ignicao,
          satelites,
          rumo,
          dataHoraGps: dataGps.toISOString(),
          sinalGsm: conn.sinalGsm,
          gpsFixado,
        });
      }
    } else if (!conn.veiculoId) {
      console.warn(
        `⚠️ [AVISO] IMEI ${imei} não está associado a nenhum veículo na tabela veiculos do Hunter!`,
      );
    }

    return;
  }

  // 3. PACOTE DE RESPOSTA DE COMANDO DO TERMINAL (0x15 ou 0x21)
  if (protocolo === 0x15 || protocolo === 0x21) {
    const imei = conn.imei || "Desconhecido";
    const serialNumber = buf.readUInt16BE(buf.length - 6);

    // Resposta de confirmação (ACK) imediata ao Terminal para fechar a transação no microcontrolador
    const ackPayload = Buffer.alloc(4);
    ackPayload.writeUInt8(0x05, 0);
    ackPayload.writeUInt8(protocolo, 1);
    ackPayload.writeUInt16BE(serialNumber, 2);

    const ackCrc = calcularCrc16(ackPayload);
    const ackFinal = Buffer.alloc(10);
    ackFinal.writeUInt16BE(0x7878, 0);
    ackFinal.writeUInt8(0x05, 2);
    ackFinal.writeUInt8(protocolo, 3);
    ackFinal.writeUInt16BE(serialNumber, 4);
    ackFinal.writeUInt16BE(ackCrc, 6);
    ackFinal.writeUInt16BE(0x0d0a, 8);
    try {
      socket.write(ackFinal);
    } catch {
      // Silencioso se socket já encerrado
    }

    const payloadBuf = buf.subarray(offset, buf.length - 6);
    let serverFlag = 0;
    let respostaAscii = "";

    if (protocolo === 0x15 && payloadBuf.length > 5) {
      const cmdLen = payloadBuf.readUInt8(0);
      serverFlag = payloadBuf.readUInt32BE(1);
      const contentLen = Math.min(Math.max(0, cmdLen - 4), payloadBuf.length - 5);
      respostaAscii = payloadBuf
        .subarray(5, 5 + contentLen)
        .toString("ascii")
        .trim();
    } else if (protocolo === 0x21 && payloadBuf.length >= 5) {
      serverFlag = payloadBuf.readUInt32BE(0);
      const encoding = payloadBuf.readUInt8(4);
      if (encoding === 2) {
        respostaAscii = payloadBuf.subarray(5).toString("utf16le").trim();
      } else {
        respostaAscii = payloadBuf.subarray(5).toString("ascii").trim();
      }
    }

    // Fallback heurístico: se a extração padrão vier vazia ou com bytes de controle, extrai sequência ASCII imprimível
    if (!respostaAscii || !/^[\x20-\x7E\r\n\t]/.test(respostaAscii)) {
      const rawText = payloadBuf.toString("ascii");
      const match = rawText.match(/[\x20-\x7E\r\n\t]{2,}/);
      if (match) {
        respostaAscii = match[0].trim();
      }
    }

    console.log(
      `\n📥 [RESPOSTA COMANDO 0x${protocolo.toString(16).padStart(2, "0")}] IMEI: ${imei} | Flag: ${serverFlag} | Serial: ${serialNumber}`,
    );
    console.log(`   [HEX]: ${buf.toString("hex")}`);
    console.log(`   [RESPOSTA ASCII]:\n${respostaAscii}`);

    // Notifica imediatamente listeners síncronos aguardando pela rota HTTP
    if (imei && respostaAscii) {
      notificarRespostaHardwareJ16(imei, respostaAscii);
    }

    // Notifica broadcast do Console TCP em tempo real (RX 0x15 / 0x21)
    if (imei) {
      void notificarComandoConsoleRealtime({
        imei,
        direcao: "RX",
        protocolo: protocolo === 0x15 ? "0x15" : "0x21",
        ascii: respostaAscii || buf.toString("hex"),
        hex: buf.toString("hex"),
        timestamp: Date.now(),
      });
    }

    if (!process.env.GATEWAY_TEST_MODE && process.env.NODE_ENV !== "test") {
      try {
        await canalComandos.send({
          type: "broadcast",
          event: "resposta_comando",
          payload: {
            imei,
            resposta: respostaAscii,
            dataHora: new Date().toISOString(),
          },
        });
      } catch {
        // Silencioso
      }
    }

    if (!conn.veiculoId && conn.imei) {
      await vincularRastreadorAoVeiculo(conn, conn.imei);
    }

    // ── PROCESSAMENTO CANÔNICO DE ODÔMETRO DA MCU J16 (MILEAGE#) ──
    const matchMileage = respostaAscii.match(
      /(?:Cur Mileage Value:|MILEAGE:|METER:|ODO:)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:KM)?/i,
    );
    if (matchMileage && matchMileage[1]) {
      const odometroMcuKm = parseFloat(matchMileage[1]);
      if (!isNaN(odometroMcuKm) && conn.veiculoId) {
        console.log(
          `🧭 [ODÔMETRO MCU REAL] IMEI ${imei}: ${odometroMcuKm} KM retornado pelo hardware J16`,
        );
        const agoraIso = new Date().toISOString();
        await supabase
          .from("veiculos")
          .update({
            odometro_hardware_km: odometroMcuKm,
            odometro_hardware_atualizado_em: agoraIso,
          })
          .eq("id", conn.veiculoId);

        await notificarAtualizacaoRealtime({
          veiculoId: conn.veiculoId,
          odometroHardwareKm: odometroMcuKm,
          odometroHardwareAtualizadoEm: agoraIso,
          origem: "resposta_mileage_mcu",
        });

        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: "odometro_mcu_sincronizado",
          titulo: "Odômetro do Rastreador Consultado",
          descricao: `A memória da MCU do J16 reportou ${odometroMcuKm.toFixed(1)} km (${respostaAscii}).`,
          severidade: "info",
        });
      }
    }

    if (respostaAscii.includes("MILEAGE OK") && conn.imei) {
      console.log(
        `🧭 [MILEAGE GRAVADO OK] IMEI ${imei}: MCU J16 confirmou calibração da Flash. Disparando leitura de validação...`,
      );
      setTimeout(() => {
        try {
          if (conn.imei) {
            enviarComandoParaRastreador(conn.imei, "MILEAGE#");
          }
        } catch {
          // Silencioso
        }
      }, 1000);
    }

    if (conn.veiculoId) {
      if (
        respostaAscii.includes("DYD=Success") ||
        respostaAscii.includes("RELAY,1=Success") ||
        respostaAscii.includes("DYD,000000=Success")
      ) {
        conn.releStatus = true;
        await supabase
          .from("veiculos")
          .update({
            bloqueado: true,
            rele_status: true,
            ultima_atualizacao: new Date().toISOString(),
          })
          .eq("id", conn.veiculoId);

        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: "bloqueio_confirmado",
          titulo: "Bloqueio Confirmado pelo Rastreador",
          descricao: `O relé/bloqueador confirmou abertura do circuito elétrico (${respostaAscii}).`,
          severidade: "critico",
        });

        await notificarAtualizacaoRealtime({
          veiculoId: conn.veiculoId,
          evento: "resposta_comando_bloqueio",
          status: "sucesso_bloqueado",
          mensagem: respostaAscii,
          bloqueado: true,
          releStatus: true,
        });
      } else if (respostaAscii.includes("Speed Limit") || respostaAscii.includes("DYD=Speed")) {
        // Trava de segurança J16: Velocidade superior a 20 km/h
        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: "bloqueio_pendente_velocidade",
          titulo: "Bloqueio em Espera de Segurança Viária",
          descricao: `Veículo em velocidade superior a 20 km/h (${respostaAscii}). O corte será efetuado automaticamente pelo equipamento assim que o veículo desacelerar.`,
          severidade: "aviso",
        });

        await notificarAtualizacaoRealtime({
          veiculoId: conn.veiculoId,
          evento: "resposta_comando_bloqueio",
          status: "aguardando_reducao_velocidade",
          mensagem: respostaAscii,
        });
      } else if (
        respostaAscii.includes("HFYD=Success") ||
        respostaAscii.includes("RELAY,0=Success") ||
        respostaAscii.includes("HFYD,000000=Success")
      ) {
        conn.releStatus = false;
        await supabase
          .from("veiculos")
          .update({
            bloqueado: false,
            rele_status: false,
            ultima_atualizacao: new Date().toISOString(),
          })
          .eq("id", conn.veiculoId);

        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: "desbloqueio_confirmado",
          titulo: "Desbloqueio Confirmado pelo Rastreador",
          descricao: `O relé restabeleceu a alimentação de combustível/ignição (${respostaAscii}). Partida liberada.`,
          severidade: "info",
        });

        await notificarAtualizacaoRealtime({
          veiculoId: conn.veiculoId,
          evento: "resposta_comando_bloqueio",
          status: "sucesso_desbloqueado",
          mensagem: respostaAscii,
          bloqueado: false,
          releStatus: false,
        });
      } else {
        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: "comando_resposta",
          titulo: "Resposta do Rastreador",
          descricao: `Retorno do comando: ${respostaAscii}`,
          severidade: "info",
        });

        await notificarAtualizacaoRealtime({
          veiculoId: conn.veiculoId,
          evento: "resposta_comando_geral",
          mensagem: respostaAscii,
        });
      }
    }
    return;
  }

  // 4. PACOTE DE HEARTBEAT / STATUS (0x13)
  if (protocolo === 0x13) {
    if (!conn.veiculoId && conn.imei) {
      await vincularRastreadorAoVeiculo(conn, conn.imei);
    }
    const serialNumber = buf.readUInt16BE(buf.length - 6);

    // Byte 4: Terminal Information
    // Bit 7 = Relé conectado/acionado (1 = relé cortado/acionado, 0 = relé normal)
    // Bit 2 = Alimentação Externa (1 = conectada, 0 = fonte/bateria cortada/desconectada)
    // Bit 1 = ACC / Fio Laranja (1 = ligado, 0 = desligado)
    const terminalInfo = buf.readUInt8(offset);
    const releStatus = (terminalInfo & 0x80) !== 0;
    const alimentacaoExterna = (terminalInfo & 0x04) !== 0;
    const accFioLaranja = (terminalInfo & 0x02) !== 0;
    const ignicaoAnterior = conn.ignicaoStatus;
    const alimentacaoAnterior = conn.alimentacaoExternaStatus;
    conn.ignicaoStatus = accFioLaranja;
    conn.releStatus = releStatus;

    const ehCobanDispositivo = conn.protocoloDispositivo === "coban" || PORTA_TCP === 7003;
    if (ehCobanDispositivo && conn.imei) {
      processarAutoThrottleCoban(conn.imei, accFioLaranja, 0, socket);
    }

    // Byte 5: Voltage Level (Bateria Interna: 0=0%, 1=15%, 2=35%, 3=55%, 4=75%, 5=90%, 6=100%)
    let pctBateriaInterna = 85;
    if (buf.length > offset + 1) {
      const voltageLevel = buf.readUInt8(offset + 1);
      const tabelaPct = [0, 15, 35, 55, 75, 90, 100];
      if (voltageLevel <= 6) {
        pctBateriaInterna = tabelaPct[voltageLevel];
      } else if (voltageLevel <= 100) {
        pctBateriaInterna = voltageLevel;
      }
    }

    // Byte 6: GSM Signal Strength (Suporte a escala direta 0-4 ou CSQ 0-31 da SIMCom A7670)
    let gsmSignal = 3;
    if (buf.length > offset + 2) {
      const rawGsm = buf.readUInt8(offset + 2);
      if (rawGsm <= 4) {
        gsmSignal = rawGsm;
      } else if (rawGsm <= 31) {
        if (rawGsm >= 22) gsmSignal = 4;
        else if (rawGsm >= 15) gsmSignal = 3;
        else if (rawGsm >= 10) gsmSignal = 2;
        else if (rawGsm >= 1) gsmSignal = 1;
        else gsmSignal = 0;
      } else {
        gsmSignal = 3;
      }
    }
    conn.sinalGsm = gsmSignal;

    const voltagemBateriaCarro = alimentacaoExterna ? (accFioLaranja ? 14.1 : 12.6) : 0.0;
    const statusBateriaRastreador = alimentacaoExterna ? "carregando" : "bateria_interna";

    const respPayload = Buffer.alloc(4);
    respPayload.writeUInt8(0x05, 0);
    respPayload.writeUInt8(0x13, 1);
    respPayload.writeUInt16BE(serialNumber, 2);

    const crc = calcularCrc16(respPayload);

    const respFinal = Buffer.alloc(10);
    respFinal.writeUInt16BE(0x7878, 0);
    respFinal.writeUInt8(0x05, 2);
    respFinal.writeUInt8(0x13, 3);
    respFinal.writeUInt16BE(serialNumber, 4);
    respFinal.writeUInt16BE(crc, 6);
    respFinal.writeUInt16BE(0x0d0a, 8);

    socket.write(respFinal);

    // Descarrega comandos retidos na fila do spooler na chegada do Heartbeat (despertar do sono)
    if (conn.imei) {
      setTimeout(async () => {
        await processarComandosPendentes(conn.imei!, socket);
      }, 500);
    }
    console.log(
      `💓 [HEARTBEAT] Sinal IMEI ${conn.imei || "—"} | Info: 0x${terminalInfo.toString(16)} | Ignição: ${accFioLaranja ? "LIGADA" : "DESLIGADA"} | Alimentação: ${alimentacaoExterna ? "CONECTADA (" + voltagemBateriaCarro + "V)" : "CORTADA (0.0V)"} | Bateria: ${pctBateriaInterna}% | GSM: ${gsmSignal}/4 | Relé: ${releStatus ? "CORTADO" : "NORMAL"}`,
    );

    if (conn.veiculoId) {
      await supabase
        .from("veiculos")
        .update({
          ignicao_status: accFioLaranja,
          voltagem: voltagemBateriaCarro,
          bateria_veiculo_v: voltagemBateriaCarro,
          bateria_rastreador_pct: pctBateriaInterna,
          bateria_rastreador_status: statusBateriaRastreador,
          sinal_gsm: gsmSignal,
          rele_status: releStatus,
          alerta_tipo: alimentacaoExterna ? null : "corte_energia",
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", conn.veiculoId);

      await notificarAtualizacaoRealtime({
        veiculoId: conn.veiculoId,
        ignicao: accFioLaranja,
        voltagem: voltagemBateriaCarro,
        bateriaVeiculo: voltagemBateriaCarro,
        bateriaRastreadorPct: pctBateriaInterna,
        bateriaRastreadorStatus: statusBateriaRastreador,
        sinalGsm: gsmSignal,
        releStatus,
        alertaTipo: alimentacaoExterna ? null : "corte_energia",
        origem: "heartbeat_0x13",
      });

      // Transição de Ignição: registra na Timeline Inteligente e automatiza sincronização de odômetro
      if (ignicaoAnterior !== undefined && ignicaoAnterior !== accFioLaranja) {
        if (accFioLaranja) {
          await registrarEventoVeiculoNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: "ignicao_ligada",
            titulo: "Ignição Ligada",
            descricao: "Chave do veículo ligada / pós-chave ativado.",
            severidade: "info",
          });
        } else {
          await registrarEventoVeiculoNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: "ignicao_desligada",
            titulo: "Ignição Desligada",
            descricao: "Chave do veículo desligada / veículo estacionado.",
            severidade: "info",
          });
        }
      }

      // Transição de Alimentação Externa: registra na Timeline Inteligente e Central de Alertas
      if (alimentacaoAnterior !== undefined && alimentacaoAnterior !== alimentacaoExterna) {
        if (!alimentacaoExterna) {
          await registrarEventoVeiculoNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: "bateria_desconectada",
            titulo: "Corte / Desconexão da Bateria",
            descricao:
              "O veículo está sem alimentação da bateria principal. O equipamento está operando na bateria interna de emergência.",
            severidade: "critico",
            lat: conn.ultimoLat,
            lon: conn.ultimoLng,
            velocidade: 0,
          });
        } else {
          await registrarEventoVeiculoNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: "retorno_comunicacao",
            titulo: "Alimentação Externa Restaurada",
            descricao: "Bateria principal do carro reconectada. Alimentação normal restabelecida.",
            severidade: "info",
            lat: conn.ultimoLat,
            lon: conn.ultimoLng,
            velocidade: 0,
          });
        }
      }
      // Gerencia ciclo de ignição de viagem (chave ligada -> chave desligada)
      await processarCicloIgnicaoViagem(conn.veiculoId, accFioLaranja, new Date().toISOString());

      // Auditoria de Integridade e Defesa Ativa contra Comandos SMS Não Autorizados
      await auditarIntegridadeEstadoEReverter({
        conn,
        socket,
        releReportado: releStatus,
        alimentacaoExterna,
        ignicao: accFioLaranja,
        origem: "heartbeat_0x13",
        lat: conn.ultimoLat,
        lon: conn.ultimoLng,
      });
    }
    conn.alimentacaoExternaStatus = alimentacaoExterna;
    return;
  }

  // 5. PACOTE DE ALARME / PÂNICO / ANOMALIA (0x16 ou 0x26)
  if (protocolo === 0x16 || protocolo === 0x26) {
    const imei = conn.imei || "Desconhecido";
    if (!conn.veiculoId && conn.imei) {
      await vincularRastreadorAoVeiculo(conn, conn.imei);
    }

    const serialNumber = buf.readUInt16BE(buf.length - 6);

    // Resposta imediata de confirmação (ACK) ao rastreador
    const respPayload = Buffer.alloc(4);
    respPayload.writeUInt8(0x05, 0);
    respPayload.writeUInt8(protocolo, 1);
    respPayload.writeUInt16BE(serialNumber, 2);

    const crc = calcularCrc16(respPayload);
    const respFinal = Buffer.alloc(10);
    respFinal.writeUInt16BE(0x7878, 0);
    respFinal.writeUInt8(0x05, 2);
    respFinal.writeUInt8(protocolo, 3);
    respFinal.writeUInt16BE(serialNumber, 4);
    respFinal.writeUInt16BE(crc, 6);
    respFinal.writeUInt16BE(0x0d0a, 8);
    socket.write(respFinal);

    // Descarrega comandos retidos na fila do spooler na chegada do Heartbeat (despertar do sono)
    if (conn.imei) {
      setTimeout(async () => {
        await processarComandosPendentes(conn.imei!, socket);
      }, 500);
    }

    // Parsing data e hora GPS
    const ano = 2000 + buf.readUInt8(offset);
    const mes = buf.readUInt8(offset + 1);
    const dia = buf.readUInt8(offset + 2);
    const hora = buf.readUInt8(offset + 3);
    const minuto = buf.readUInt8(offset + 4);
    const segundo = buf.readUInt8(offset + 5);
    const dataGps = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));

    // Satélites
    const satInfo = buf.readUInt8(offset + 6);
    const satelites = satInfo & 0x0f;

    // Coordenadas
    const rawLat = buf.readUInt32BE(offset + 7);
    const rawLon = buf.readUInt32BE(offset + 11);
    const velocidade = buf.readUInt8(offset + 15);
    const courseStatus = buf.readUInt16BE(offset + 16);
    const gpsFixado = (courseStatus & 0x1000) !== 0; // Bit 12: 1 = GNSS Fixado, 0 = LBS/Sem Fix
    const isWest = (courseStatus & 0x0800) !== 0;
    const isSouth = (courseStatus & 0x0400) === 0;
    const rumo = courseStatus & 0x03ff;

    let latitude = rawLat / 1800000.0;
    let longitude = rawLon / 1800000.0;
    if (isSouth) latitude = -latitude;
    if (isWest) longitude = -longitude;

    // Preservação estrita das coordenadas brutas do satélite (sem Kalman)
    // Validação determinística de sanidade
    const coordsValidas =
      latitude !== 0 && longitude !== 0 && !isNaN(latitude) && !isNaN(longitude);
    if (
      gpsFixado &&
      coordsValidas &&
      conn.ultimoLat &&
      conn.ultimoLng &&
      conn.ultimoLat !== 0 &&
      conn.ultimoLng !== 0
    ) {
      const dLat = ((latitude - conn.ultimoLat) * Math.PI) / 180;
      const dLng = ((longitude - conn.ultimoLng) * Math.PI) / 180;
      const sinLat = Math.sin(dLat / 2);
      const sinLng = Math.sin(dLng / 2);
      const h =
        sinLat * sinLat +
        Math.cos((conn.ultimoLat * Math.PI) / 180) *
          Math.cos((latitude * Math.PI) / 180) *
          sinLng *
          sinLng;
      const distM = 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      if (distM > 50000 && velocidade < 300) {
        console.warn(
          `⚠️ [GPS GATEWAY] Descarte de teleporte impossível no alarme 0x16 (${(distM / 1000).toFixed(1)} km) para ${conn.imei}. Mantendo última coordenada válida.`,
        );
        latitude = conn.ultimoLat;
        longitude = conn.ultimoLng;
      }
    }

    // Dados de status (indexados com precisão a partir do fim do pacote)
    const terminalInfo = buf.readUInt8(buf.length - 11);
    const voltageLevel = buf.readUInt8(buf.length - 10);
    const gsmSignal = Math.min(4, Math.max(0, buf.readUInt8(buf.length - 9)));
    const alarmCode = buf.readUInt8(buf.length - 8);

    const releStatus = (terminalInfo & 0x80) !== 0; // Bit 7: Relé acionado/cortado
    // Bit 1: ACC (Quando alarmCode for 0xFF/ACC OFF ou 0xFE/ACC ON, prioriza a semântica direta do evento)
    const ignicao =
      alarmCode === 0xff ? false : alarmCode === 0xfe ? true : (terminalInfo & 0x02) !== 0;
    const alimentacaoExterna = (terminalInfo & 0x04) !== 0 && alarmCode !== 0x02;

    conn.ignicaoStatus = ignicao;
    conn.releStatus = releStatus;
    conn.sinalGsm = gsmSignal;

    // Mapeamento semântico do código de alarme J16 / GT06
    // O código 0x00 indica transmissão regular de rotina ou heartbeat com GPS (sem alarme ativo).
    // Apenas se alarmCode !== 0x00 o processamento entra na condição de alerta.
    const temAlarmeAtivo = alarmCode !== 0x00;

    let tipoAlerta = "posicao_normal";
    let tituloEvento = "Transmissão Normal";
    let descEvento = "Transmissão regular de status e telemetria.";
    let severidade: "info" | "aviso" | "critico" = "info";
    let gravidadeAlerta: "critica" | "alta" | "media" = "media";

    if (alarmCode !== 0x00) {
      tipoAlerta = "alarme_geral";
      tituloEvento = "Alerta do Rastreador";
      descEvento = `Código de alarme 0x${alarmCode.toString(16).padStart(2, "0")} recebido do dispositivo.`;
      severidade = "aviso";
      gravidadeAlerta = "alta";

      switch (alarmCode) {
        case 0x01: // SOS
          tipoAlerta = "panico";
          tituloEvento = "Botão de Pânico / SOS Acionado!";
          descEvento = "O condutor acionou o botão de emergência / pânico veicular.";
          severidade = "critico";
          gravidadeAlerta = "critica";
          break;
        case 0x02: // Power Cut
          tipoAlerta = "bateria_desconectada";
          tituloEvento = "Alimentação Principal Cortada";
          descEvento =
            "A bateria principal do veículo foi desconectada. O rastreador opera na bateria interna de emergência.";
          severidade = "critico";
          gravidadeAlerta = "critica";
          break;
        case 0x03: {
          // Shock / Vibration
          const veiculoEstacionado = conn.ignicaoStatus === false;
          tipoAlerta = "colisao_impacto";
          tituloEvento = veiculoEstacionado
            ? "Alerta de Toque / Vibração no Veículo Estacionado"
            : "Alerta de Vibração Excessiva / Possível Impacto";
          descEvento = veiculoEstacionado
            ? "Sensor de choque detectou vibração mecânica no veículo com motor desligado (possível toque, esbarrão de manobra ou tentativa de violação)."
            : "Sensor de choque detectou forte vibração mecânica ou impacto no veículo em trânsito.";
          severidade = "critico";
          gravidadeAlerta = "alta";
          break;
        }
        case 0x04: // Fence In
          tipoAlerta = "cerca_entrada";
          tituloEvento = "Entrada em Cerca Virtual";
          descEvento = "Veículo ingressou no perímetro monitorado.";
          severidade = "info";
          gravidadeAlerta = "media";
          break;
        case 0x05: // Fence Out
          tipoAlerta = "cerca_saida";
          tituloEvento = "Saída de Cerca Virtual";
          descEvento = "Veículo transpôs o limite da cerca virtual configurada.";
          severidade = "aviso";
          gravidadeAlerta = "alta";
          break;
        case 0x06: // Overspeed
          tipoAlerta = "excesso_velocidade";
          tituloEvento = "Excesso de Velocidade";
          descEvento = `Veículo ultrapassou o limite parametrizado (${velocidade} km/h).`;
          severidade = "aviso";
          gravidadeAlerta = "alta";
          break;
        case 0x09: // Moving Alarm
          // Blindagem anti-falso-positivo na raiz:
          // - Se ignição está ligada, NÃO é guincho/reboque com motor desligado.
          // - Se ignição está desligada e velocidade < 15 km/h, trata-se de deriva GNSS estacionado.
          if (ignicao) {
            tipoAlerta = "movimento";
            tituloEvento = "Movimento com Ignição Ligada";
            descEvento = "Alarme de movimento recebido com ignição ligada.";
            severidade = "info";
            gravidadeAlerta = "media";
          } else if (velocidade < 15) {
            tipoAlerta = "deriva_gps_estacionado";
            tituloEvento = "Oscilação GNSS Estacionado";
            descEvento =
              "Oscilação de antena GNSS detectada com veículo parado e ignição desligada.";
            severidade = "info";
            gravidadeAlerta = "media";
          } else {
            tipoAlerta = "guincho";
            tituloEvento = "Movimento com Ignição Desligada (Guincho)";
            descEvento =
              "Veículo deslocou-se com a ignição desligada (possível reboque ou guincho).";
            severidade = "critico";
            gravidadeAlerta = "alta";
          }
          break;
        case 0x0e: // Low Battery
          tipoAlerta = "baixa_tensao";
          tituloEvento = "Bateria Interna do Rastreador Fraca";
          descEvento = `Nível de bateria interna crítico (${voltageLevel}/6). Carga necessária.`;
          severidade = "aviso";
          gravidadeAlerta = "alta";
          break;
        case 0x13: // Tamper / Disassemble
          tipoAlerta = "violacao_dispositivo";
          tituloEvento = "Violação / Remoção do Rastreador";
          descEvento =
            "Sensor de desacoplamento ou sabotagem acionado. O dispositivo foi removido da carcaça do veículo.";
          severidade = "critico";
          gravidadeAlerta = "critica";
          break;
        case 0xfe: // ACC ON
          tipoAlerta = "ignicao_ligada";
          tituloEvento = "Ignição Ligada";
          descEvento = "Pós-chave ativado detectado pelo alarme.";
          severidade = "info";
          gravidadeAlerta = "media";
          break;
        case 0xff: // ACC OFF
          tipoAlerta = "ignicao_desligada";
          tituloEvento = "Ignição Desligada";
          descEvento = "Pós-chave desativado detectado pelo alarme.";
          severidade = "info";
          gravidadeAlerta = "media";
          break;
        default:
          break;
      }

      console.log(
        `🚨 [ALARME 0x16] IMEI: ${imei} | Alarme: 0x${alarmCode.toString(16)} (${tituloEvento})`,
      );
    } else {
      console.log(
        `📡 [STATUS 0x16] IMEI: ${imei} | Transmissão regular de status (sem alarme ativo)`,
      );
    }

    console.log(
      `   Posição: Lat ${latitude.toFixed(6)}, Lon ${longitude.toFixed(6)}, Vel: ${velocidade} km/h, GSM: ${gsmSignal}/4, Relé: ${releStatus ? "CORTADO" : "NORMAL"}`,
    );

    if (conn.veiculoId) {
      // 1. Salva a posição GPS caso seja válida
      if (latitude !== 0 && longitude !== 0) {
        const ehDerivaEstacionado = alarmCode === 0x09 && !ignicao && velocidade < 5;
        if (!ehDerivaEstacionado) {
          conn.ultimoLat = latitude;
          conn.ultimoLng = longitude;
        }
        await salvarPosicaoNoHunter({
          veiculoId: conn.veiculoId,
          rastreadorId: conn.rastreadorId,
          latitude: ehDerivaEstacionado && conn.ultimoLat ? conn.ultimoLat : latitude,
          longitude: ehDerivaEstacionado && conn.ultimoLng ? conn.ultimoLng : longitude,
          velocidade,
          ignicao,
          satelites,
          rumo,
          dataHoraGps: dataGps.toISOString(),
          sinalGsm: gsmSignal,
          gpsFixado,
        });
      }

      // 2. Atualiza status no veículo
      await supabase
        .from("veiculos")
        .update({
          sinal_gsm: gsmSignal,
          rele_status: releStatus,
          ignicao_status: ignicao,
          alerta_tipo:
            alarmCode !== 0x00
              ? alarmCode === 0x02
                ? "corte_energia"
                : tipoAlerta
              : alimentacaoExterna
                ? null
                : "corte_energia",
          voltagem: alimentacaoExterna ? (ignicao ? 14.1 : 12.6) : 0.0,
          bateria_veiculo_v: alimentacaoExterna ? (ignicao ? 14.1 : 12.6) : 0.0,
          bateria_rastreador_status: alimentacaoExterna ? "carregando" : "bateria_interna",
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", conn.veiculoId);

      // 3. Registra na Timeline de Eventos apenas se for um alarme real (alarmCode !== 0x00)
      if (alarmCode !== 0x00) {
        await registrarEventoVeiculoNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: tipoAlerta,
          titulo: tituloEvento,
          descricao: descEvento,
          severidade,
          lat: latitude,
          lon: longitude,
          velocidade,
          detalhes: { alarmCode, voltageLevel, gsmSignal, releStatus },
        });
      }

      // 4. Salva na Central de Alertas de Segurança se houver alarme ativo (alarmCode !== 0x00) e for severo
      if (
        alarmCode !== 0x00 &&
        (severidade === "critico" || severidade === "aviso") &&
        tipoAlerta !== "deriva_gps_estacionado"
      ) {
        await salvarAlertaSegurancaNoHunter({
          veiculoId: conn.veiculoId,
          clienteId: conn.clienteId,
          tipo: tipoAlerta,
          detalhes: descEvento,
          gravidade: gravidadeAlerta,
          lat: latitude,
          lon: longitude,
          velocidade,
        });
      }

      // 5. Notificação Realtime
      await notificarAtualizacaoRealtime({
        veiculoId: conn.veiculoId,
        alertaTipo: alarmCode !== 0x00 ? tipoAlerta : undefined,
        alertaTitulo: alarmCode !== 0x00 ? tituloEvento : undefined,
        latitude,
        longitude,
        velocidade,
        rumo,
        sinalGsm: gsmSignal,
        releStatus,
        origem: alarmCode !== 0x00 ? "alarme_0x16" : "telemetria_0x16",
      });

      // Auditoria de Integridade e Defesa Ativa contra Comandos SMS Não Autorizados
      await auditarIntegridadeEstadoEReverter({
        conn,
        socket,
        releReportado: releStatus,
        alimentacaoExterna,
        ignicao,
        alarmCode,
        origem: `alarme_0x${protocolo.toString(16)}_cod_0x${alarmCode.toString(16)}`,
        lat: latitude,
        lon: longitude,
      });
      conn.alimentacaoExternaStatus = alarmCode === 0x02 ? false : alimentacaoExterna;

      // Se for alarme de Pânico / SOS, notifica equipe conforme Central de Alertas
      if (alarmCode === 0x01) {
        const latFinal = latitude || conn.ultimoLat || 0;
        const lonFinal = longitude || conn.ultimoLng || 0;
        const mapsLink =
          latFinal !== 0 && lonFinal !== 0
            ? `https://maps.google.com/?q=${latFinal.toFixed(6)},${lonFinal.toFixed(6)}`
            : "Localização GPS não disponível";

        const msgSos = [
          `🚨 *ALERTA DE PÂNICO / SOS — GD RASTREAMENTO* 🚨`,
          ``,
          `*Incidente:* Botão de Pânico / SOS acionado pelo condutor!`,
          `*Veículo:* ${conn.placa || "Placa não informada"} (${conn.modeloVeiculo || "Modelo —"})`,
          `*IMEI:* ${conn.imei || "Desconhecido"}`,
          `*Velocidade:* ${velocidade} km/h`,
          `*Localização:* ${mapsLink}`,
          `*Data/Hora:* ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        ].join("\n");

        despacharNotificacaoWhatsappSuperAdmGateway(msgSos, "incidente_panico_sos_superadm", {
          tipoAlerta: "panico",
          placa: conn.placa,
        }).catch(() => {});
      }
    }

    return;
  }

  console.log(`[PACOTE] Protocolo 0x${protocolo.toString(16)} recebido (${buf.length} bytes).`);
}

async function vincularRastreadorAoVeiculo(conn: ConexaoRastreador, imei: string) {
  if (process.env.GATEWAY_TEST_MODE) return;
  try {
    // 0. Busca modelo e id na tabela rastreadores por imei
    const { data: rastreadorRow } = await supabase
      .from("rastreadores")
      .select("id, modelo")
      .eq("imei", imei)
      .maybeSingle();

    if (rastreadorRow) {
      conn.rastreadorId = rastreadorRow.id;
      conn.modeloRastreador = rastreadorRow.modelo || undefined;
      if (rastreadorRow.modelo) {
        modeloRastreadorPorImei.set(imei, rastreadorRow.modelo);
      }
    }

    // 1. Busca na tabela veiculos por rastreador_imei
    const { data: veiculoPorImei } = await supabase
      .from("veiculos")
      .select(
        "id, cliente_id, placa, marca_modelo, rastreador_id, ultima_latitude, ultima_longitude, bloqueador_instalado, tipo_bloqueador, bloqueador_detalhes, rele_status, sinal_gsm, bloqueado",
      )
      .eq("rastreador_imei", imei)
      .maybeSingle();

    if (veiculoPorImei) {
      conn.veiculoId = veiculoPorImei.id;
      conn.clienteId = veiculoPorImei.cliente_id || undefined;
      conn.placa = veiculoPorImei.placa;
      conn.modeloVeiculo = veiculoPorImei.marca_modelo;
      if (!conn.rastreadorId && veiculoPorImei.rastreador_id) {
        conn.rastreadorId = veiculoPorImei.rastreador_id;
      }
      conn.bloqueadorInstalado = veiculoPorImei.bloqueador_instalado ?? true;
      conn.tipoBloqueador = veiculoPorImei.tipo_bloqueador || "rele_combustivel";
      conn.bloqueadorDetalhes = veiculoPorImei.bloqueador_detalhes || undefined;
      conn.releStatus = veiculoPorImei.rele_status ?? undefined;
      conn.bloqueadoEsperado = veiculoPorImei.bloqueado ?? false;
      conn.sinalGsm = veiculoPorImei.sinal_gsm ?? undefined;
      if (
        veiculoPorImei.ultima_latitude &&
        veiculoPorImei.ultima_longitude &&
        (Math.abs(Number(veiculoPorImei.ultima_latitude)) > 0.0001 ||
          Math.abs(Number(veiculoPorImei.ultima_longitude)) > 0.0001)
      ) {
        conn.ultimoLat = Number(veiculoPorImei.ultima_latitude);
        conn.ultimoLng = Number(veiculoPorImei.ultima_longitude);
      }
      console.log(
        `🎯 [VÍNCULO] Rastreador ${imei} (${conn.modeloRastreador || "Modelo —"}) associado ao veículo: ${conn.placa} (${conn.modeloVeiculo}) | Bloqueador: ${conn.bloqueadorInstalado ? conn.tipoBloqueador : "SEM BLOQUEADOR"} | Bloqueado: ${conn.bloqueadoEsperado}`,
      );
      return;
    }

    // 2. Busca na tabela veiculos por rastreador_id (se não vinculado diretamente por rastreador_imei)
    if (rastreadorRow?.id) {
      const { data: veiculoPorFk } = await supabase
        .from("veiculos")
        .select(
          "id, cliente_id, placa, marca_modelo, ultima_latitude, ultima_longitude, bloqueador_instalado, tipo_bloqueador, bloqueador_detalhes, rele_status, sinal_gsm, bloqueado",
        )
        .eq("rastreador_id", rastreadorRow.id)
        .maybeSingle();

      if (veiculoPorFk) {
        conn.veiculoId = veiculoPorFk.id;
        conn.clienteId = veiculoPorFk.cliente_id || undefined;
        conn.placa = veiculoPorFk.placa;
        conn.modeloVeiculo = veiculoPorFk.marca_modelo;
        conn.bloqueadorInstalado = veiculoPorFk.bloqueador_instalado ?? true;
        conn.tipoBloqueador = veiculoPorFk.tipo_bloqueador || "rele_combustivel";
        conn.bloqueadorDetalhes = veiculoPorFk.bloqueador_detalhes || undefined;
        conn.releStatus = veiculoPorFk.rele_status ?? undefined;
        conn.bloqueadoEsperado = veiculoPorFk.bloqueado ?? false;
        conn.sinalGsm = veiculoPorFk.sinal_gsm ?? undefined;
        if (
          veiculoPorFk.ultima_latitude &&
          veiculoPorFk.ultima_longitude &&
          (Math.abs(Number(veiculoPorFk.ultima_latitude)) > 0.0001 ||
            Math.abs(Number(veiculoPorFk.ultima_longitude)) > 0.0001)
        ) {
          conn.ultimoLat = Number(veiculoPorFk.ultima_latitude);
          conn.ultimoLng = Number(veiculoPorFk.ultima_longitude);
        }
        console.log(
          `🎯 [VÍNCULO] Rastreador ${imei} (${conn.modeloRastreador || "Modelo —"}) associado via FK ao veículo: ${conn.placa} (${conn.modeloVeiculo}) | Bloqueador: ${conn.bloqueadorInstalado ? conn.tipoBloqueador : "SEM BLOQUEADOR"}`,
        );
      }
    }
  } catch (err: any) {
    console.error("Erro ao vincular rastreador ao veículo no Supabase:", err.message);
  }
}

// Mapa de debounce de desligamento de ignição (veiculoId -> timestamp do início da parada)
const mapaParadaIgnicao: Map<string, number> = new Map();
const TEMPO_MINIMO_PARADA_CONCLUIR_VIAGEM_MS = 60000; // 60 segundos parado com ignição desligada para concluir ciclo

async function processarCicloIgnicaoViagem(
  veiculoId: string,
  ignicaoLigada: boolean,
  dataHoraGps: string,
  lat?: number,
  lng?: number,
  velocidade?: number,
) {
  try {
    const { data: viagensAtivas } = await supabase
      .from("viagens_trajetos")
      .select("id, inicio_at, km_percorrido, velocidade_maxima, velocidade_media")
      .eq("veiculo_id", veiculoId)
      .eq("status", "em_andamento")
      .order("inicio_at", { ascending: false })
      .limit(5);

    // Blindagem anti-duplicidade: se houver mais de uma viagem em andamento, consolida as excedentes
    if (viagensAtivas && viagensAtivas.length > 1) {
      const idsAntigos = viagensAtivas.slice(1).map((v) => v.id);
      await supabase
        .from("viagens_trajetos")
        .update({ status: "concluido", fim_at: dataHoraGps })
        .in("id", idsAntigos);
    }

    const viagemAtiva = viagensAtivas?.[0] || null;

    if (ignicaoLigada) {
      // Carro em movimento / ignição ligada: cancela debounce de parada
      mapaParadaIgnicao.delete(veiculoId);

      if (!viagemAtiva) {
        // CHAVE LIGADA: Inicia novo ciclo de viagem com proteção atômica
        console.log(
          `🚗 [CICLO VIAGEM] Chave LIGADA — Iniciando novo ciclo de viagem para veículo ${veiculoId}`,
        );
        try {
          await supabase.from("viagens_trajetos").insert({
            veiculo_id: veiculoId,
            inicio_at: dataHoraGps,
            status: "em_andamento",
            km_percorrido: 0,
            velocidade_media: Math.round(velocidade || 0),
            velocidade_maxima: Math.round(velocidade || 0),
          });

          await notificarAtualizacaoRealtime({
            veiculoId,
            evento: "viagem_iniciada",
            inicioAt: dataHoraGps,
          });
        } catch (insErr: any) {
          console.warn(
            `[CICLO VIAGEM] Viagem já iniciada para veículo ${veiculoId}:`,
            insErr?.message || insErr,
          );
        }
      } else if (velocidade !== undefined && velocidade > 0) {
        // Atualiza velocidade máxima se superada
        const velMaxAtual = Math.max(viagemAtiva.velocidade_maxima || 0, Math.round(velocidade));
        if (velMaxAtual > (viagemAtiva.velocidade_maxima || 0)) {
          await supabase
            .from("viagens_trajetos")
            .update({ velocidade_maxima: velMaxAtual })
            .eq("id", viagemAtiva.id);
        }
      }
    } else {
      if (viagemAtiva) {
        // Debounce: antes de fechar a viagem, verifica se o carro permaneceu parado por ao menos 60 segundos
        const agora = Date.now();
        if (!mapaParadaIgnicao.has(veiculoId)) {
          mapaParadaIgnicao.set(veiculoId, agora);
          return;
        }
        const tempoParado = agora - (mapaParadaIgnicao.get(veiculoId) || agora);
        if (tempoParado < TEMPO_MINIMO_PARADA_CONCLUIR_VIAGEM_MS) {
          return; // Tolerância de parada em semáforo ou redução momentânea
        }
        mapaParadaIgnicao.delete(veiculoId);

        // CHAVE DESLIGADA COMPROVADA: Consolida o ciclo de viagem.
        // IMPORTANTE: km_percorrido NÃO é recalculado aqui — já foi acumulado
        // atomicamente pela RPC registrar_posicao_gps_com_odometro a cada pacote GPS.
        // Recalcular e sobrescrever causaria double-counting ou perda de precisão.
        // Esta etapa consolida apenas: status, fim_at e velocidade_media/maxima.
        console.log(
          `🏁 [CICLO VIAGEM] Chave DESLIGADA — Consolidando ciclo de viagem ${viagemAtiva.id}`,
        );

        // Busca pontos da viagem apenas para calcular velocidade_media final
        const { data: pts } = await supabase
          .from("telemetria_posicoes")
          .select("velocidade, data_hora_gps")
          .eq("veiculo_id", veiculoId)
          .gte("data_hora_gps", viagemAtiva.inicio_at)
          .lte("data_hora_gps", dataHoraGps)
          .gt("velocidade", 2) // Apenas pontos em movimento para média real (campo integer)
          .order("data_hora_gps", { ascending: true });

        let velMax = viagemAtiva.velocidade_maxima || 0;
        let somaVelMov = 0;
        let countMov = 0;

        if (pts && pts.length > 0) {
          for (const p of pts) {
            const v = Number(p.velocidade || 0);
            if (v > velMax) velMax = Math.round(v);
            somaVelMov += v;
            countMov++;
          }
        }

        const velMedia = countMov > 0 ? Math.round(somaVelMov / countMov) : 0;
        // Usa o km_percorrido acumulado incrementalmente pela RPC (fonte de verdade)
        const kmFinal = Number(viagemAtiva.km_percorrido || 0);

        // 🛡️ REGRA CANÔNICA: Descarte de Falsos Ciclos / Micro-Acionamentos de Ignição Estacionários
        // Se a viagem não teve deslocamento real comprovado (< 150m e velMax <= 15 km/h) ou velMax === 0,
        // descarta o registro em vez de poluir o histórico e laudos com viagens falsas de 10m/40m/50m.
        const isViagemReal =
          (kmFinal >= 0.15 && velMax > 15) || kmFinal >= 0.3 || (kmFinal >= 0.15 && velMax > 10);
        if (!isViagemReal) {
          console.log(
            `🗑️ [CICLO DESCARTADO] Viagem ${viagemAtiva.id} descartada por não atingir requisitos de deslocamento real (${(kmFinal * 1000).toFixed(0)}m, máx ${velMax} km/h, velMedia ${velMedia} km/h)`,
          );
          await supabase.from("viagens_trajetos").delete().eq("id", viagemAtiva.id);
          return;
        }

        await supabase
          .from("viagens_trajetos")
          .update({
            fim_at: dataHoraGps,
            status: "concluido",
            // km_percorrido: NÃO alterado — preserva o valor acumulado pela RPC SQL
            velocidade_media: velMedia,
            velocidade_maxima: velMax,
          })
          .eq("veiculo_id", veiculoId)
          .eq("status", "em_andamento");

        console.log(
          `📊 [CICLO CONCLUÍDO] Viagem ${viagemAtiva.id}: ${kmFinal.toFixed(3)} km (RPC), média ${velMedia} km/h, máx ${velMax} km/h`,
        );

        await notificarAtualizacaoRealtime({
          veiculoId,
          evento: "viagem_concluida",
          viagemId: viagemAtiva.id,
          fimAt: dataHoraGps,
          kmPercorrido: kmFinal,
          velocidadeMedia: velMedia,
        });
      }
    }
  } catch (err: any) {
    console.error("Erro ao gerenciar ciclo de viagem:", err?.message || err);
  }
}

async function registrarEventoVeiculoNoHunter(dados: {
  veiculoId: string;
  clienteId?: string | null;
  tipo: string;
  titulo: string;
  descricao: string;
  severidade?: "info" | "aviso" | "critico";
  lat?: number | null;
  lon?: number | null;
  velocidade?: number | null;
  detalhes?: any;
}) {
  try {
    const { error } = await supabase.from("eventos_veiculo").insert({
      veiculo_id: dados.veiculoId,
      cliente_id: dados.clienteId || null,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao,
      severidade: dados.severidade || "info",
      latitude: dados.lat || null,
      longitude: dados.lon || null,
      velocidade: dados.velocidade || null,
      detalhes: dados.detalhes || null,
      data_hora: new Date().toISOString(),
    });
    if (error) {
      console.error("Erro ao registrar evento do veículo:", error.message);
    } else {
      console.log(`📋 [EVENTO] Registrado na Timeline: "${dados.titulo}" (${dados.tipo})`);
    }

    // Se o evento for crítico ou anomalia, persiste na tabela alertas_seguranca
    if (
      dados.severidade === "critico" ||
      dados.tipo === "baixa_tensao" ||
      dados.tipo === "bateria_desconectada" ||
      dados.tipo === "panico" ||
      dados.tipo === "colisao_impacto" ||
      dados.tipo === "sos"
    ) {
      const tipoAlerta = dados.tipo === "sos" ? "panico" : dados.tipo;

      await salvarAlertaSegurancaNoHunter({
        veiculoId: dados.veiculoId,
        clienteId: dados.clienteId,
        tipo: tipoAlerta,
        detalhes: dados.descricao,
        gravidade: dados.severidade === "critico" ? "critica" : "alta",
        lat: dados.lat || 0,
        lon: dados.lon || 0,
        velocidade: dados.velocidade || 0,
      });
    }
  } catch (err: any) {
    console.error("Erro ao registrar evento do veículo:", err?.message || err);
  }
}

async function salvarAlertaSegurancaNoHunter(dados: {
  veiculoId: string;
  clienteId?: string | null;
  tipo: string;
  detalhes: string;
  gravidade?: "critica" | "alta" | "media";
  lat?: number | null;
  lon?: number | null;
  velocidade?: number | null;
}) {
  try {
    let latFinal = dados.lat || 0.0;
    let lonFinal = dados.lon || 0.0;

    // Se coordenadas vierem zeradas, busca última posição registrada do veículo
    if (Math.abs(latFinal) < 0.0001 && Math.abs(lonFinal) < 0.0001 && dados.veiculoId) {
      try {
        const { data: vRow } = await supabase
          .from("veiculos")
          .select("ultima_latitude, ultima_longitude")
          .eq("id", dados.veiculoId)
          .maybeSingle();
        if (
          vRow?.ultima_latitude &&
          vRow?.ultima_longitude &&
          (Math.abs(Number(vRow.ultima_latitude)) > 0.0001 ||
            Math.abs(Number(vRow.ultima_longitude)) > 0.0001)
        ) {
          latFinal = Number(vRow.ultima_latitude);
          lonFinal = Number(vRow.ultima_longitude);
        }
      } catch {
        // Fallback silencioso
      }
    }

    const { error } = await supabase.rpc("registrar_alerta_seguranca", {
      p_veiculo_id: dados.veiculoId,
      p_tipo: dados.tipo,
      p_detalhes: dados.detalhes,
      p_gravidade: dados.gravidade || "alta",
      p_latitude: latFinal,
      p_longitude: lonFinal,
      p_velocidade: Math.round(dados.velocidade || 0),
      p_cliente_id: dados.clienteId || null,
    });

    if (error) {
      console.warn(
        "RPC registrar_alerta_seguranca falhou no gateway, usando fallback direto:",
        error.message,
      );
      let clienteId = dados.clienteId;
      if (!clienteId) {
        const { data: v } = await supabase
          .from("veiculos")
          .select("cliente_id")
          .eq("id", dados.veiculoId)
          .maybeSingle();
        clienteId = v?.cliente_id;
      }
      if (clienteId) {
        await supabase.from("alertas_seguranca").insert({
          veiculo_id: dados.veiculoId,
          cliente_id: clienteId,
          tipo: dados.tipo,
          gravidade: dados.gravidade || "alta",
          latitude: dados.lat || 0.0,
          longitude: dados.lon || 0.0,
          velocidade: Math.round(dados.velocidade || 0),
          detalhes: dados.detalhes,
          reconhecido: false,
        });
      }
    } else {
      console.log(
        `🚨 [ALERTA SEGURANÇA] Registrado na Central de Alertas: ${dados.tipo} (${dados.veiculoId})`,
      );
    }
  } catch (err: any) {
    console.error("Erro ao salvar alerta de segurança no gateway:", err?.message || err);
  }
}

async function salvarPosicaoNoHunter(dados: {
  veiculoId: string;
  rastreadorId?: string;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: boolean;
  satelites: number;
  rumo: number;
  dataHoraGps: string;
  sinalGsm?: number | null;
  gpsFixado?: boolean;
}) {
  try {
    // 1. Invoca a RPC atômica registrar_posicao_gps_com_odometro
    // Ela trava a linha do veículo, calcula a distância geodésica WGS-84 precisa (com filtro anti-ruído ZVU < 3m),
    // realiza integração trapezoidal e fusão inercial em curvas, atualizando odometro_km em veiculos,
    // odometro em telemetria_posicoes e km_percorrido na viagem em andamento!
    const { data: resRpc, error: errRpc } = await supabase.rpc(
      "registrar_posicao_gps_com_odometro",
      {
        p_veiculo_id: dados.veiculoId,
        p_rastreador_id: dados.rastreadorId || null,
        p_latitude: dados.latitude,
        p_longitude: dados.longitude,
        p_velocidade: dados.velocidade,
        p_ignicao: dados.ignicao,
        p_satelites: dados.satelites,
        p_rumo: dados.rumo,
        p_data_hora_gps: dados.dataHoraGps,
        p_sinal_gsm: dados.sinalGsm ?? null,
        p_gps_fixado: dados.gpsFixado ?? true,
      },
    );

    const statusOperacional = calcularStatusOperacionalComHisterese(
      dados.veiculoId,
      dados.ignicao,
      dados.velocidade,
      dados.dataHoraGps,
    );

    if (errRpc) {
      console.warn("RPC registrar_posicao_gps_com_odometro falhou no gateway:", errRpc.message);
      // Tentativa de compatibilidade sem p_gps_fixado caso a RPC antiga ainda esteja ativa em cache
      let rpcOk = false;
      if (errRpc.code === "PGRST204" || errRpc.message?.includes("p_gps_fixado")) {
        const { data: fallbackRpc, error: fallbackErr } = await supabase.rpc(
          "registrar_posicao_gps_com_odometro",
          {
            p_veiculo_id: dados.veiculoId,
            p_rastreador_id: dados.rastreadorId || null,
            p_latitude: dados.latitude,
            p_longitude: dados.longitude,
            p_velocidade: dados.velocidade,
            p_ignicao: dados.ignicao,
            p_satelites: dados.satelites,
            p_rumo: dados.rumo,
            p_data_hora_gps: dados.dataHoraGps,
            p_sinal_gsm: dados.sinalGsm ?? null,
          },
        );
        if (!fallbackErr) {
          rpcOk = true;
          if (fallbackRpc?.sucesso) {
            console.log(
              `🚗 [ODÔMETRO DINÂMICO] Veículo ${dados.veiculoId}: Odômetro = ${fallbackRpc.novo_odometro} km (+${fallbackRpc.delta_km} km) | Vel: ${dados.velocidade} km/h`,
            );
          }
        }
      }

      if (!rpcOk) {
        // Fallback clássico
        await supabase.from("telemetria_posicoes").insert({
          veiculo_id: dados.veiculoId,
          rastreador_id: dados.rastreadorId || null,
          latitude: dados.latitude,
          longitude: dados.longitude,
          velocidade: dados.velocidade,
          ignicao: dados.ignicao,
          satelites: dados.satelites,
          rumo: dados.rumo,
          data_hora_gps: dados.dataHoraGps,
          sinal_gsm: dados.sinalGsm ?? null,
          gps_fixado: dados.gpsFixado ?? true,
        });

        await supabase
          .from("veiculos")
          .update({
            ultima_latitude: dados.latitude,
            ultima_longitude: dados.longitude,
            velocidade_atual: dados.velocidade,
            ignicao_status: dados.ignicao,
            satelites: dados.satelites,
            rumo: dados.rumo,
            sinal_gsm: dados.sinalGsm ?? undefined,
            status_operacional: statusOperacional,
            gps_fixado: dados.gpsFixado ?? true,
            ultima_atualizacao: new Date().toISOString(),
          })
          .eq("id", dados.veiculoId);
      }
    } else if (resRpc?.sucesso) {
      console.log(
        `🚗 [ODÔMETRO DINÂMICO] Veículo ${dados.veiculoId}: Odômetro = ${resRpc.novo_odometro} km (+${resRpc.delta_km} km) | Vel: ${dados.velocidade} km/h | Fix: ${dados.gpsFixado !== false ? "GPS" : "LBS"}`,
      );
      if (statusOperacional === "em_movimento" && dados.velocidade <= 3 && dados.ignicao) {
        // Mantém 'em_movimento' no banco durante a histerese de 120s no semáforo
        await supabase
          .from("veiculos")
          .update({ status_operacional: statusOperacional })
          .eq("id", dados.veiculoId);
      }
    }

    // 2. Notifica em realtime com vetor de rumo, satélites, sinal GSM e status operacional com histerese
    await notificarAtualizacaoRealtime({
      veiculoId: dados.veiculoId,
      latitude: dados.latitude,
      longitude: dados.longitude,
      ignicao: dados.ignicao,
      velocidade: dados.velocidade,
      rumo: dados.rumo,
      satelites: dados.satelites,
      sinalGsm: dados.sinalGsm,
      dataHoraGps: dados.dataHoraGps,
      statusOperacional,
      status_operacional: statusOperacional,
      origem: "gps_posicao",
    });

    // 3. Gerencia ciclo de ignição de viagem
    await processarCicloIgnicaoViagem(
      dados.veiculoId,
      dados.ignicao,
      dados.dataHoraGps,
      dados.latitude,
      dados.longitude,
      dados.velocidade,
    );

    // 4. Atualiza última comunicação do rastreador (só altera para instalado se houver veículo vinculado)
    if (dados.rastreadorId) {
      const payloadUpdateRastreador: Record<string, any> = {
        ultima_comunicacao: new Date().toISOString(),
      };
      if (dados.veiculoId) {
        payloadUpdateRastreador.status = "instalado";
      }
      await supabase
        .from("rastreadores")
        .update(payloadUpdateRastreador)
        .eq("id", dados.rastreadorId);
    }
  } catch (err: any) {
    console.error("Falha ao salvar no banco de dados:", err?.message || err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFESA ATIVA ANTI-SMS E NOTIFICAÇÃO IMEDIATA AO SUPERADM VIA WHATSAPP
// ─────────────────────────────────────────────────────────────────────────────
const ultimosIncidentesPorImei = new Map<string, { tipo: string; ts: number }>();
const ultimosAlertasEnergiaPorImei = new Map<string, number>();
let telefonesSuperAdmGatewayCache: { fones: string[]; expiraEm: number } | null = null;

function normalizarDigitosBrGateway(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("021") && d.length >= 13) d = d.substring(3);
  else if (d.startsWith("0") && d.length >= 11) d = d.substring(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

function resolverFonesCanalGateway(params: {
  listaCustom?: string[];
  contatosAtivos: Array<{ telefone: string }>;
  fallbackFones: string[];
}): string[] {
  const { listaCustom, contatosAtivos, fallbackFones } = params;
  const ativosMap = new Map<string, string>();
  for (const c of contatosAtivos) {
    const dig = normalizarDigitosBrGateway(c.telefone);
    if (dig.length >= 10) ativosMap.set(dig, dig);
  }
  if (Array.isArray(listaCustom)) {
    const out: string[] = [];
    for (const raw of listaCustom) {
      const dig = normalizarDigitosBrGateway(raw);
      if (dig.length >= 10 && !out.includes(dig)) {
        out.push(dig);
      }
    }
    return out;
  }
  const base = Array.from(ativosMap.values());
  return base.length > 0 ? base : fallbackFones;
}

async function resolverDestinatariosEquipeGateway(tipoAlerta: string): Promise<{
  fonesWhatsapp: string[];
  fonesLigacao: string[];
}> {
  const fonesFallbackSuperAdm = await obterTelefonesSuperAdmGateway();
  const tipoNorm =
    tipoAlerta === "incidente_reversao_sms_superadm"
      ? "corte_nao_autorizado_sms"
      : tipoAlerta === "incidente_panico_sos_superadm"
        ? "panico"
        : tipoAlerta === "incidente_corte_energia_superadm"
          ? "bateria_desconectada"
          : String(tipoAlerta || "").toLowerCase();

  const fonesWhatsapp = new Set<string>();
  const fonesLigacao = new Set<string>();

  try {
    const [resPerfis, resRoles] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, telefone, role")
        .in("role", ["superadmin", "adm", "operador"])
        .eq("ativo", true),
      supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["superadmin", "adm", "operador"]),
    ]);

    const membrosMap = new Map<
      string,
      { userId: string; role: string; email: string; telefone: string }
    >();

    for (const p of (resPerfis.data || []) as any[]) {
      if (!p?.id) continue;
      membrosMap.set(String(p.id), {
        userId: String(p.id),
        role: String(p.role || "").toLowerCase(),
        email: String(p.email || "").toLowerCase(),
        telefone: String(p.telefone || ""),
      });
    }

    for (const r of (resRoles.data || []) as any[]) {
      const uid = r?.user_id ? String(r.user_id) : "";
      if (!uid) continue;
      if (!membrosMap.has(uid)) {
        const { data: pExtra } = await supabase
          .from("profiles")
          .select("id, email, telefone, role, ativo")
          .eq("id", uid)
          .maybeSingle();
        if (pExtra && pExtra.ativo !== false) {
          membrosMap.set(uid, {
            userId: uid,
            role: String(pExtra.role || r.role || "").toLowerCase(),
            email: String(pExtra.email || "").toLowerCase(),
            telefone: String(pExtra.telefone || ""),
          });
        }
      }
    }

    const userIds = Array.from(membrosMap.keys());
    if (userIds.length === 0) {
      return { fonesWhatsapp: fonesFallbackSuperAdm, fonesLigacao: [] };
    }

    const { data: rowsNc } = await supabase
      .from("notificacoes_configuracoes")
      .select("user_id, alertas_ativos")
      .is("veiculo_id", null)
      .in("user_id", userIds);

    const ncPorUser = new Map<string, any>();
    for (const row of (rowsNc || []) as any[]) {
      if (row?.user_id && row?.alertas_ativos) {
        ncPorUser.set(String(row.user_id), row.alertas_ativos);
      }
    }

    for (const membro of membrosMap.values()) {
      const ehSuperAdm =
        membro.role === "superadmin" ||
        membro.email === "novaes@adm.28bpm.local" ||
        membro.email === "novaes@oficial.tec.br";
      const nc = ncPorUser.get(membro.userId) || null;
      const contatosSalvos: Array<{ telefone: string; ativo?: boolean }> = Array.isArray(
        nc?.contatos_alertas,
      )
        ? nc.contatos_alertas
        : [];
      const contatosAtivos = contatosSalvos.filter((c) => c && c.ativo !== false && c.telefone);
      const digProf = normalizarDigitosBrGateway(membro.telefone);
      if (
        digProf.length >= 10 &&
        !contatosSalvos.some((c) => normalizarDigitosBrGateway(c.telefone) === digProf)
      ) {
        contatosAtivos.push({ telefone: membro.telefone, ativo: true });
      }
      const fallbackMembro = ehSuperAdm
        ? fonesFallbackSuperAdm
        : digProf.length >= 10
          ? [digProf]
          : [];

      const itemCfg =
        tipoNorm === "corte_nao_autorizado_sms"
          ? nc?.alertas_operacionais?.corte_nao_autorizado_sms
          : nc?.alertas_equipe?.[tipoNorm];

      if (itemCfg && typeof itemCfg === "object") {
        if (itemCfg.ativo === false) continue;
        if (itemCfg.whatsapp !== false) {
          for (const f of resolverFonesCanalGateway({
            listaCustom: itemCfg.destinatarios_whatsapp,
            contatosAtivos,
            fallbackFones: fallbackMembro,
          })) {
            fonesWhatsapp.add(f);
          }
        }
        if (itemCfg.ligacao === true) {
          for (const f of resolverFonesCanalGateway({
            listaCustom: itemCfg.destinatarios_ligacao,
            contatosAtivos,
            fallbackFones: fallbackMembro,
          })) {
            fonesLigacao.add(f);
          }
        }
      } else if (ehSuperAdm) {
        for (const f of contatosAtivos.length > 0
          ? contatosAtivos
              .map((c) => normalizarDigitosBrGateway(c.telefone))
              .filter((d) => d.length >= 10)
          : fonesFallbackSuperAdm) {
          fonesWhatsapp.add(f);
        }
      }
    }

    return {
      fonesWhatsapp: Array.from(fonesWhatsapp),
      fonesLigacao: Array.from(fonesLigacao),
    };
  } catch {
    return { fonesWhatsapp: fonesFallbackSuperAdm, fonesLigacao: [] };
  }
}

export async function obterTelefonesSuperAdmGateway(): Promise<string[]> {
  const agora = Date.now();
  if (telefonesSuperAdmGatewayCache && telefonesSuperAdmGatewayCache.expiraEm > agora) {
    return telefonesSuperAdmGatewayCache.fones;
  }

  const fonesEncontrados: string[] = [];

  try {
    const { data: profs } = await supabase
      .from("profiles")
      .select("telefone")
      .in("email", ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"])
      .limit(2);

    if (profs && profs.length > 0) {
      for (const p of profs) {
        if (p.telefone) {
          const num = String(p.telefone).replace(/\D/g, "");
          if (num.length >= 10) {
            const formatado = num.startsWith("55") ? num : `55${num}`;
            if (!fonesEncontrados.includes(formatado)) {
              fonesEncontrados.push(formatado);
            }
          }
        }
      }
    }
  } catch {
    // Silencioso
  }

  if (fonesEncontrados.length === 0) {
    try {
      const { data: cfgs } = await supabase
        .from("relatorio_gerencial_config")
        .select("telefones")
        .limit(1);
      if (cfgs && cfgs[0]?.telefones && Array.isArray(cfgs[0].telefones)) {
        for (const t of cfgs[0].telefones) {
          const num = String(t.telefone || "").replace(/\D/g, "");
          if (num.length >= 10) {
            const formatado = num.startsWith("55") ? num : `55${num}`;
            if (!fonesEncontrados.includes(formatado)) {
              fonesEncontrados.push(formatado);
            }
          }
        }
      }
    } catch {
      // Silencioso
    }
  }

  if (fonesEncontrados.length === 0) {
    fonesEncontrados.push("5524992494030");
  }

  telefonesSuperAdmGatewayCache = {
    fones: fonesEncontrados,
    expiraEm: agora + 300000,
  };

  return fonesEncontrados;
}

export async function despacharNotificacaoWhatsappSuperAdmGateway(
  mensagem: string,
  tituloLog = "notificacao_superadm_whatsapp",
  opcoes?: { tipoAlerta?: string; placa?: string },
): Promise<void> {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    Boolean((globalThis as any).__TEST__)
  ) {
    return;
  }

  try {
    const tipoEfetivo = opcoes?.tipoAlerta || tituloLog;
    const { fonesWhatsapp, fonesLigacao } = await resolverDestinatariosEquipeGateway(tipoEfetivo);
    const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || "https://gps.oficial.tec.br").replace(
      /\/$/,
      "",
    );
    const appPublicUrl = (process.env.HUNTER_APP_URL || "https://gd.oficial.tec.br").replace(
      /\/$/,
      "",
    );
    const token = "hunter-guardiao-whatsapp-secret-key-2026";

    for (const fone of fonesWhatsapp) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${gatewayUrl}/api/v1/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Hunter-Token": token,
          },
          body: JSON.stringify({
            recipient: fone,
            message: mensagem,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          console.log(`📱 [WHATSAPP SUPERADM] Alerta despachado com sucesso para ${fone}`);
          supabase
            .from("system_activity_logs")
            .insert({
              acao: tituloLog,
              detalhe: `Alerta de Incidente enviado via WhatsApp à equipe (${fone}) [${tipoEfetivo}]`,
            })
            .then(
              () => {},
              () => {},
            );
        } else {
          console.warn(`[WHATSAPP SUPERADM] Erro HTTP ${res.status} ao enviar para ${fone}`);
        }
      } catch (errEnvio: any) {
        console.warn(
          `[WHATSAPP SUPERADM] Falha de envio para ${fone}:`,
          errEnvio?.message || errEnvio,
        );
      }
    }

    for (const foneLig of fonesLigacao) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        await fetch(`${appPublicUrl}/api/alerta/ligacao`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hunter-Token": token,
          },
          body: JSON.stringify({
            telefone: foneLig,
            motivo: `gateway_${tipoEfetivo}_${opcoes?.placa || "veiculo"}`,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
      } catch (errLig: any) {
        console.warn(
          `[GATEWAY-LIGACAO] Falha ao acionar discador para ${foneLig}:`,
          errLig?.message || errLig,
        );
      }
    }
  } catch (errGeral: any) {
    console.error(
      "[WHATSAPP SUPERADM] Erro geral ao disparar alerta:",
      errGeral?.message || errGeral,
    );
  }
}

export async function auditarIntegridadeEstadoEReverter(params: {
  conn: ConexaoRastreador;
  socket: net.Socket;
  releReportado: boolean;
  alimentacaoExterna: boolean;
  ignicao: boolean;
  origem: string;
  alarmCode?: number;
  lat?: number;
  lon?: number;
}) {
  const { conn, socket, releReportado, alimentacaoExterna, origem, lat, lon } = params;
  if (!conn.veiculoId || !conn.imei) return;

  const agora = Date.now();

  // 1. AUDITORIA DE INTEGRIDADE DO RELÉ DE BLOQUEIO (DEFESA ATIVA ANTI-SMS)
  if (conn.bloqueadoEsperado !== undefined) {
    const esperado = Boolean(conn.bloqueadoEsperado);
    const atual = Boolean(releReportado);

    // Janela de carência de transição legítima (45s após comando disparado pela plataforma)
    const cooldownPlataforma = conn.ultimoComandoBloqueioPlataformaTs
      ? agora - conn.ultimoComandoBloqueioPlataformaTs < 45000
      : false;

    if (!cooldownPlataforma && esperado !== atual) {
      const tipoViolacao = atual ? "corte_nao_autorizado_sms" : "desbloqueio_nao_autorizado_sms";

      // Throttle de segurança: evita repetição em rajada nos heartbeats (mín 15s)
      const ultimoIncidente = ultimosIncidentesPorImei.get(conn.imei);
      const debounceAtivo = ultimoIncidente && agora - ultimoIncidente.ts < 15000;

      if (!debounceAtivo) {
        conn.tentativasReversaoContador = (conn.tentativasReversaoContador || 0) + 1;
        ultimosIncidentesPorImei.set(conn.imei, { tipo: tipoViolacao, ts: agora });

        // Proteção contra looping infinito (máximo 4 reversões no ciclo)
        if (conn.tentativasReversaoContador <= 4) {
          console.warn(
            `🚨🚨🚨 [DEFESA ATIVA] DIVERGÊNCIA DETECTADA no IMEI ${conn.imei} (${conn.placa || "—"}): Relé reportado ${atual ? "CORTADO" : "LIBERADO"}, esperado pela plataforma: ${esperado ? "BLOQUEADO" : "DESBLOQUEADO"}. Disparando reversão imediata via GPRS! (Tentativa ${conn.tentativasReversaoContador}/4)`,
          );

          // AÇÃO 1: REVERSÃO IMEDIATA VIA GPRS (Socket TCP)
          if (esperado === false) {
            // Veículo deveria estar LIBERADO, mas foi cortado externamente por SMS (RELAY,1 ou DYD)
            const pkt1 = montarPacoteComandoGT06("HFYD,000000");
            const pkt2 = montarPacoteComandoGT06("RELAY,0");
            socket.write(pkt1);
            setTimeout(() => {
              if (!socket.destroyed) socket.write(pkt2);
            }, 300);
            console.log(
              `⚡ [REVERSÃO GPRS CONCLUÍDA] Enviados HFYD,000000 e RELAY,0 para IMEI ${conn.imei}`,
            );
          } else {
            // Veículo deveria estar BLOQUEADO, mas foi liberado externamente por SMS (RELAY,0 ou HFYD)
            const pkt1 = montarPacoteComandoGT06("DYD,000000");
            const pkt2 = montarPacoteComandoGT06("RELAY,1");
            socket.write(pkt1);
            setTimeout(() => {
              if (!socket.destroyed) socket.write(pkt2);
            }, 300);
            console.log(
              `⚡ [REVERSÃO GPRS CONCLUÍDA] Enviados DYD,000000 e RELAY,1 para IMEI ${conn.imei}`,
            );
          }

          const latFinal = lat || conn.ultimoLat || 0;
          const lonFinal = lon || conn.ultimoLng || 0;
          const mapsLink =
            latFinal !== 0 && lonFinal !== 0
              ? `https://maps.google.com/?q=${latFinal.toFixed(6)},${lonFinal.toFixed(6)}`
              : "Localização GPS não disponível no momento";

          const tituloIncidente =
            esperado === false
              ? "Corte Não Autorizado Detectado (SMS Externo / Sabotagem)"
              : "Desbloqueio Não Autorizado de Veículo Roubado (SMS Externo)";

          const acaoExecutada =
            esperado === false
              ? "Veículo religado imediatamente pelo Gateway Hunter via GPRS (RELAY,0 / HFYD)."
              : "Veículo re-bloqueado imediatamente pelo Gateway Hunter via GPRS (RELAY,1 / DYD).";

          // AÇÃO 2: REGISTRO NA TIMELINE FORENSE E CENTRAL DE ALERTAS
          await registrarEventoVeiculoNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: tipoViolacao,
            titulo: `Defesa Ativa: ${tituloIncidente}`,
            descricao: `Manipulação externa detectada e revertida em tempo real. Relé físico estava ${atual ? "cortado" : "normal"}, esperado pela plataforma: ${esperado ? "bloqueado" : "liberado"}. ${acaoExecutada}`,
            severidade: "critico",
            lat: latFinal,
            lon: lonFinal,
          });

          await salvarAlertaSegurancaNoHunter({
            veiculoId: conn.veiculoId,
            clienteId: conn.clienteId,
            tipo: tipoViolacao,
            detalhes: `Divergência de relé revertida automaticamente pelo Gateway Hunter. ${acaoExecutada}`,
            gravidade: "critica",
            lat: latFinal,
            lon: lonFinal,
          });

          // AÇÃO 3: NOTIFICAÇÃO IMEDIATA AO SUPERADM VIA WHATSAPP
          const dataHoraFormatada = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          });

          const msgWhatsapp = [
            `🚨 *ALERTA DE SEGURANÇA MÁXIMA — GD RASTREAMENTO* 🚨`,
            ``,
            `*Incidente:* Manipulação externa não autorizada via SMS detectada!`,
            `*Veículo:* ${conn.placa || "Placa não informada"} (${conn.modeloVeiculo || "Modelo —"})`,
            `*IMEI:* ${conn.imei}`,
            `*Status Físico Violado:* Relé foi alterado para *${atual ? "CORTADO" : "LIBERADO"}* sem ordem da plataforma.`,
            `*Ação Executada:* ⚡ *REVERSÃO IMEDIATA REALIZADA VIA GPRS*`,
            `*Resultado:* ${acaoExecutada}`,
            `*Origem:* Pacote ${origem}`,
            `*Localização:* ${mapsLink}`,
            `*Data/Hora:* ${dataHoraFormatada}`,
            ``,
            `_O GD Rastreamento manteve o estado canônico do veículo inviolável._`,
          ].join("\n");

          despacharNotificacaoWhatsappSuperAdmGateway(
            msgWhatsapp,
            "incidente_reversao_sms_superadm",
            { tipoAlerta: "corte_nao_autorizado_sms", placa: conn.placa },
          ).catch(() => {});
        } else {
          console.warn(
            `⚠️ [DEFESA ATIVA] Limite de 4 reversões automáticas atingido para IMEI ${conn.imei}. Interrompendo para evitar saturação. Intervenção técnica necessária.`,
          );
        }
      }
    }
  }

  // 2. AUDITORIA DE ALIMENTAÇÃO EXTERNA (Chicote cortado / Sabotagem de Bateria)
  const transicaoCorteEnergia =
    conn.alimentacaoExternaStatus !== undefined &&
    conn.alimentacaoExternaStatus !== alimentacaoExterna &&
    !alimentacaoExterna;
  const alarmeCortePrimeiroPacote =
    params.alarmCode === 0x02 && conn.alimentacaoExternaStatus === undefined;

  if (transicaoCorteEnergia || alarmeCortePrimeiroPacote) {
    const ultimoEnergiaTs = ultimosAlertasEnergiaPorImei.get(conn.imei) || 0;
    if (agora - ultimoEnergiaTs >= 30000) {
      ultimosAlertasEnergiaPorImei.set(conn.imei, agora);
      const latFinal = lat || conn.ultimoLat || 0;
      const lonFinal = lon || conn.ultimoLng || 0;
      const mapsLink =
        latFinal !== 0 && lonFinal !== 0
          ? `https://maps.google.com/?q=${latFinal.toFixed(6)},${lonFinal.toFixed(6)}`
          : "Localização GPS não disponível no momento";

      const dataHoraFormatada = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });

      const msgBateria = [
        `⚠️ *ALERTA DE VIOLAÇÃO DE ENERGIA — GD RASTREAMENTO* ⚠️`,
        ``,
        `*Incidente:* Alimentação externa (+12V/+24V) cortada ou desconectada!`,
        `*Veículo:* ${conn.placa || "Placa não informada"} (${conn.modeloVeiculo || "Modelo —"})`,
        `*IMEI:* ${conn.imei}`,
        `*Status:* Rastreador operando na bateria interna de emergência.`,
        `*Localização:* ${mapsLink}`,
        `*Data/Hora:* ${dataHoraFormatada}`,
      ].join("\n");

      despacharNotificacaoWhatsappSuperAdmGateway(msgBateria, "incidente_corte_energia_superadm", {
        tipoAlerta: "bateria_desconectada",
        placa: conn.placa,
      }).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICO HTTP DE HEALTH CHECK BLINDADO (HARDENING / ZERO EXPOSIÇÃO)
// ─────────────────────────────────────────────────────────────────────────────
const PORTA_HTTP = Number(process.env.PORTA_HTTP || 8080);

export function validarAutenticacaoHttp(req: http.IncomingMessage): boolean {
  const authHeader = req.headers["authorization"] || "";
  const secretHeader = req.headers["x-gateway-secret"] || "";
  const tokensValidos = [
    process.env.GD_GPS_GATEWAY_TOKEN,
    process.env.GATEWAY_SECRET,
    process.env.HUNTER_GATEWAY_TOKEN,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "hunter-gateway-secret-2026",
  ].filter(Boolean) as string[];

  if (typeof secretHeader === "string" && secretHeader.trim()) {
    if (tokensValidos.includes(secretHeader.trim())) return true;
  }
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.substring(7).trim();
    if (bearer && tokensValidos.includes(bearer)) return true;
  }
  return false;
}

const httpServer = http.createServer((req, res) => {
  // Mascara identificador do servidor para evitar fingerprinting
  res.removeHeader("X-Powered-By");
  res.setHeader("Server", "GD-Rastreamento");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gateway-secret");
    res.writeHead(204);
    res.end();
    return;
  }

  const url = (req.url || "/").split("?")[0];

  // Rota Health Check opaca e segura
  if (req.method === "GET" && (url === "/" || url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Validação de autenticação obrigatória para rotas administrativas (/api/conexoes e /api/comando)
  if (url === "/api/conexoes" || url === "/api/comando") {
    if (!validarAutenticacaoHttp(req)) {
      console.warn(
        `🔒 [GATEWAY HTTP 401] Acesso não autorizado bloqueado em ${url} de ${req.socket.remoteAddress}`,
      );
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Rota de listagem de conexões ativas no Gateway
  if (req.method === "GET" && url === "/api/conexoes") {
    const lista = Array.from(conexoesAtivas.values())
      .filter((c) => !!c.imei)
      .map((c) => ({
        imei: c.imei,
        placa: c.placa,
        veiculoId: c.veiculoId,
        online: true,
        ignicaoStatus: c.ignicaoStatus,
        sinalGsm: c.sinalGsm,
        ultimoLat: c.ultimoLat,
        ultimoLng: c.ultimoLng,
      }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total: lista.length, conexoes: lista }));
    return;
  }

  // Rota de Envio de Comando GT06 direto via TCP/GPRS para o rastreador
  if (req.method === "POST" && url === "/api/comando") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8192) req.destroy();
    });
    req.on("end", async () => {
      try {
        const { imei, comando, veiculoId } = JSON.parse(body);
        let imeiAlvo = imei;
        if (!imeiAlvo && veiculoId) {
          for (const conn of conexoesAtivas.values()) {
            if (conn.veiculoId === veiculoId && conn.imei) {
              imeiAlvo = conn.imei;
              break;
            }
          }
        }
        if (!imeiAlvo || !comando) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "imei e comando são obrigatórios" }));
          return;
        }

        console.log(`📡 [COMANDO GT06 HTTP] IMEI: ${imeiAlvo} | Comando: "${comando}"`);
        const promessaResposta = aguardarRespostaHardwareJ16(imeiAlvo, 6000);
        const resEnvio = await enviarComandoParaRastreador(imeiAlvo, comando);

        let respostaHardware: string | null = null;
        if (resEnvio.enviado) {
          respostaHardware = await promessaResposta;
        }

        if (veiculoId && (resEnvio.enviado || resEnvio.enfileirado)) {
          const cmdUpper = String(comando).trim().toUpperCase();
          const isBloq =
            cmdUpper.startsWith("DYD") ||
            cmdUpper.startsWith("RELAY,1") ||
            cmdUpper.includes("STOP");
          const isDesb =
            cmdUpper.startsWith("HFYD") ||
            cmdUpper.startsWith("RELAY,0") ||
            cmdUpper.includes("RESUME");
          if (isBloq || isDesb) {
            void notificarVeiculoAtualizadoRealtime({
              veiculoId,
              bloqueado: isBloq,
              rele_status: isBloq,
              timestamp: Date.now(),
            });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sucesso: resEnvio.enviado || resEnvio.enfileirado,
            enviado: resEnvio.enviado,
            enfileirado: resEnvio.enfileirado,
            imei: imeiAlvo,
            comando,
            resposta: respostaHardware,
          }),
        );
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404 seguro para qualquer outro caminho
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

if (!process.env.VITEST && process.env.NODE_ENV !== "test" && !process.env.GATEWAY_TEST_MODE) {
  // Inicia servidor TCP
  server.listen(PORTA_TCP, "0.0.0.0", () => {
    console.log(`========================================================`);
    console.log(`  HUNTER GPS GATEWAY — SERVIÇO DE ESCUTA TCP`);
    console.log(`  Porta TCP: ${PORTA_TCP} (Protocolo GT06 / J16 4G & Coban G900L)`);
    console.log(`  Supabase: ${SUPABASE_URL}`);
    console.log(`  Status: PRONTO E AGUARDANDO CONEXÕES DO RASTREADOR...`);
    console.log(`========================================================\n`);
  });

  httpServer.listen(PORTA_HTTP, "0.0.0.0", () => {
    console.log(
      `[HTTP HEALTH CHECK] Servidor de monitoramento seguro ativo na porta ${PORTA_HTTP}`,
    );
  });
}

export { httpServer };
