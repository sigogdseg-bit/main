// server.ts — Micro-Gateway WhatsApp Baileys para GD Rastreamento
// Otimizado para Fly.io Free Tier (256 MB RAM)

import express, { Request, Response, NextFunction } from "express";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  BufferJSON,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY_ROOT_DIR = path.resolve(__dirname, "..");

const PORT = parseInt(process.env.PORT || "8082", 10);
const IS_TEST_ENV = process.env.HUNTER_GATEWAY_TEST === "1";
const AUTH_DIR = process.env.WHATSAPP_SESSION_DIR || "/data/session-gd";
const API_TOKEN =
  process.env.GD_WHATSAPP_TOKEN ||
  process.env.HUNTER_WHATSAPP_TOKEN ||
  "gd-whatsapp-secret-key-2026";

export function verificarPatchBaileysAtivo(): boolean {
  try {
    const sendPath = path.join(
      GATEWAY_ROOT_DIR,
      "node_modules",
      "@whiskeysockets",
      "baileys",
      "lib",
      "Socket",
      "messages-send.js",
    );
    const recvPath = path.join(
      GATEWAY_ROOT_DIR,
      "node_modules",
      "@whiskeysockets",
      "baileys",
      "lib",
      "Socket",
      "messages-recv.js",
    );
    if (!fs.existsSync(sendPath) || !fs.existsSync(recvPath)) return false;
    const sendOk = fs.readFileSync(sendPath, "utf-8").includes("/* @hunter-patch-v1 */");
    const recvOk = fs.readFileSync(recvPath, "utf-8").includes("/* @hunter-patch-v1 */");
    return sendOk && recvOk;
  } catch {
    return false;
  }
}

const BAILEYS_PATCH_ATIVO = IS_TEST_ENV ? false : verificarPatchBaileysAtivo();

// Garante existência da pasta de dados
if (!IS_TEST_ENV && !fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const app = express();

// Middleware Global de CORS para permitir requisições do frontend da aplicação
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Hunter-Token, x-hunter-token",
  );
  if (_req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

let sock: WASocket | null = null;
let currentQR: string | null = null;
let isConnected = false;
let connectedNumber: string | null = null;
let reconnectAttempts = 0;

function resolverMimetype(nome: string, mimeInformado?: string): string {
  if (
    mimeInformado &&
    mimeInformado !== "application/octet-stream" &&
    mimeInformado.trim() !== ""
  ) {
    return mimeInformado;
  }
  const ext = (nome || "").toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return mimeInformado || "application/octet-stream";
  }
}

// ── ARMAZENAMENTO PERSISTENTE DE CHAVES E MENSAGENS (/data/session/messages) ──
// Garante resolução de "Aguardando mensagem. Isso pode levar alguns instantes"
// mesmo quando o celular mestre com o chip estiver desligado ou sem sinal.

const MSGS_DIR = path.join(AUTH_DIR, "messages");
if (!IS_TEST_ENV && !fs.existsSync(MSGS_DIR)) {
  fs.mkdirSync(MSGS_DIR, { recursive: true });
}

// Cache rápido em memória RAM (LRU de até 1000 mensagens)
const msgMemoryCache = new Map<string, any>();

export function sanitizarIdMensagem(id: string): string {
  return String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function salvarMensagemPersistida(id: string, msg: any) {
  const safeId = sanitizarIdMensagem(id);
  if (!safeId || !msg) return;

  // 1. Memória RAM (atualiza ordem LRU)
  if (msgMemoryCache.has(safeId)) {
    msgMemoryCache.delete(safeId);
  } else if (msgMemoryCache.size >= 1000) {
    const primeiro = msgMemoryCache.keys().next().value;
    if (primeiro) msgMemoryCache.delete(primeiro);
  }
  msgMemoryCache.set(safeId, msg);

  // 2. Disco persistente no volume (/data) usando BufferJSON para preservar mediaKey
  try {
    const filePath = path.join(MSGS_DIR, `${safeId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(msg, BufferJSON.replacer), "utf-8");
  } catch (err) {
    console.warn(`⚠️ [WHATSAPP STORE] Falha ao persistir mensagem ${safeId} em disco:`, err);
  }
}

async function obterMensagemPersistida(id?: string | null): Promise<any | undefined> {
  if (!id) return undefined;
  const safeId = sanitizarIdMensagem(id);
  if (!safeId) return undefined;

  // 1. Tenta recuperar da memória RAM rápida
  if (msgMemoryCache.has(safeId)) {
    return msgMemoryCache.get(safeId);
  }

  // 2. Tenta recuperar do volume persistente /data com restauração fiel de Buffers (mediaKey)
  try {
    const filePath = path.join(MSGS_DIR, `${safeId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data, BufferJSON.reviver);
      msgMemoryCache.set(safeId, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn(`⚠️ [WHATSAPP STORE] Falha ao ler mensagem persistida ${safeId}:`, err);
  }

  return undefined;
}

// ── GERENCIADOR NATIVO DE MAPEAMENTO LID <-> TELEFONE REAL ──────────────────
// Persistência em disco (/data/session/lid_mapping.json)
const LID_MAP_FILE = path.join(AUTH_DIR, "lid_mapping.json");

const lidToPhoneMap = new Map<string, string>();
const phoneToLidMap = new Map<string, string>();

function carregarLidMappingPersistido() {
  try {
    if (fs.existsSync(LID_MAP_FILE)) {
      const conteudo = fs.readFileSync(LID_MAP_FILE, "utf-8");
      const obj = JSON.parse(conteudo);
      for (const [lid, phone] of Object.entries(obj)) {
        if (lid && phone) {
          lidToPhoneMap.set(String(lid), String(phone));
          phoneToLidMap.set(String(phone), String(lid));
        }
      }
      console.log(`📱 [LID MAP] ${lidToPhoneMap.size} mapeamentos carregados do disco.`);
    }
  } catch (err) {
    console.warn("⚠️ [LID MAP] Falha ao carregar lid_mapping.json:", err);
  }
}

function salvarLidMappingPersistido() {
  try {
    const obj: Record<string, string> = {};
    for (const [lid, phone] of lidToPhoneMap.entries()) {
      obj[lid] = phone;
    }
    fs.writeFileSync(LID_MAP_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ [LID MAP] Falha ao salvar lid_mapping.json:", err);
  }
}

export function normalizarTelefoneBr(raw: string): string {
  let phone = String(raw || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
  if (phone.startsWith("021") && phone.length >= 13) {
    phone = phone.substring(3);
  }
  if (phone.startsWith("0")) phone = phone.substring(1);
  if (!phone.startsWith("55") && (phone.length === 10 || phone.length === 11)) {
    phone = `55${phone}`;
  }
  return phone;
}

export function expandirCandidatosJidBr(raw: string): string[] {
  const base = normalizarTelefoneBr(raw);
  if (!base) return [];
  const lista: string[] = [base];
  if (base.startsWith("55")) {
    const semDdi = base.slice(2);
    if (semDdi.length === 11 && /^[1-9]{2}9[6-9]\d{7}$/.test(semDdi)) {
      lista.push(`55${semDdi.slice(0, 2)}${semDdi.slice(3)}`);
    } else if (semDdi.length === 10 && /^[1-9]{2}[6-9]\d{7}$/.test(semDdi)) {
      lista.push(`55${semDdi.slice(0, 2)}9${semDdi.slice(2)}`);
    }
  }
  return Array.from(new Set(lista));
}

export function registrarAssociacaoLid(lidRaw: string, phoneRaw: string): boolean {
  const lidStr = String(lidRaw || "").trim();
  if (
    !lidStr ||
    lidStr.endsWith("@g.us") ||
    lidStr.endsWith("@broadcast") ||
    lidStr.endsWith("@newsletter") ||
    lidStr.endsWith("@s.whatsapp.net")
  ) {
    return false;
  }
  const lid = lidStr.split("@")[0].split(":")[0].replace(/\D/g, "");
  const phone = normalizarTelefoneBr(phoneRaw);
  if (!lid || !phone || phone.length < 10) return false;
  const antigo = lidToPhoneMap.get(lid);
  if (antigo !== phone) {
    lidToPhoneMap.set(lid, phone);
    phoneToLidMap.set(phone, lid);
    if (!IS_TEST_ENV) {
      salvarLidMappingPersistido();
    }
    console.log(`✅ [LID MAP RESOLVIDO] LID ${lid} associado ao Telefone Real: ${phone}`);
    return true;
  }
  return false;
}

// Carrega os mapeamentos persistidos ao iniciar o processo
if (!IS_TEST_ENV) {
  carregarLidMappingPersistido();
}

const LID_NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const lidNegativeLookupCache = new Map<string, number>();

function registrarCacheNegativoLid(telefone: string) {
  if (lidNegativeLookupCache.size >= 1000) {
    const oldest = lidNegativeLookupCache.keys().next().value;
    if (oldest) lidNegativeLookupCache.delete(oldest);
  }
  lidNegativeLookupCache.set(telefone, Date.now());
}

async function resolverJidPreferencial(limpo: string): Promise<string> {
  const candidatos = expandirCandidatosJidBr(limpo);
  const listaCandidatos = candidatos.length > 0 ? candidatos : [limpo];
  for (const cand of listaCandidatos) {
    if (phoneToLidMap.has(cand)) {
      return `${phoneToLidMap.get(cand)}@lid`;
    }
  }
  const primario = listaCandidatos[0] || limpo;
  if (!sock || !isConnected || primario.length < 10 || primario.length > 15) {
    return `${primario}@s.whatsapp.net`;
  }
  const agora = Date.now();
  const todosEmCacheNegativo = listaCandidatos.every((cand) => {
    const ultimaFalha = lidNegativeLookupCache.get(cand);
    return Boolean(ultimaFalha && agora - ultimaFalha < LID_NEGATIVE_CACHE_TTL_MS);
  });
  if (todosEmCacheNegativo) {
    return `${primario}@s.whatsapp.net`;
  }
  try {
    const jidsConsulta = listaCandidatos.map((c) => `${c}@s.whatsapp.net`);
    const results = await Promise.race([
      sock.onWhatsApp(...jidsConsulta),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3500)),
    ]);
    const itemLid = Array.isArray(results)
      ? results.find((r: any) => r?.exists && r?.lid)
      : undefined;
    const itemExistente =
      itemLid || (Array.isArray(results) ? results.find((r: any) => r?.exists) : undefined);
    const lidRes = itemExistente?.lid;
    if (lidRes) {
      const phoneCanonico =
        normalizarTelefoneBr(String(itemExistente?.jid || primario)) || primario;
      registrarAssociacaoLid(String(lidRes), phoneCanonico);
      const lidMapeado = phoneToLidMap.get(phoneCanonico);
      if (lidMapeado) {
        for (const cand of listaCandidatos) {
          if (!phoneToLidMap.has(cand)) {
            phoneToLidMap.set(cand, lidMapeado);
          }
        }
        return `${lidMapeado}@lid`;
      }
    }
    if (itemExistente?.jid) {
      return String(itemExistente.jid);
    }
    for (const cand of listaCandidatos) {
      registrarCacheNegativoLid(cand);
    }
  } catch {
    for (const cand of listaCandidatos) {
      registrarCacheNegativoLid(cand);
    }
  }
  return `${primario}@s.whatsapp.net`;
}

async function sincronizarLidsComWhatsApp(telefones?: string[]) {
  if (!sock || !isConnected) return;
  try {
    let listaTelefones = telefones || [];
    if (listaTelefones.length === 0) {
      const backendUrl = process.env.SIGO_BACKEND_URL || "https://gd.oficial.tec.br";
      try {
        const resp = await fetch(`${backendUrl}/api/whatsapp/telefones-cadastrados`, {
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            "X-Hunter-Token": API_TOKEN,
          },
        });
        if (resp.ok) {
          const dados = (await resp.json()) as any;
          if (Array.isArray(dados?.telefones)) {
            listaTelefones = dados.telefones;
          }
        }
      } catch (errBusca) {
        console.warn("⚠️ [LID SYNC] Não foi possível consultar telefones do backend:", errBusca);
      }
    }

    if (listaTelefones.length > 0) {
      console.log(
        `🔍 [LID SYNC] Sincronizando LIDs nativos via WhatsApp para ${listaTelefones.length} contatos...`,
      );
      for (const tel of listaTelefones) {
        const candidatos = expandirCandidatosJidBr(String(tel));
        if (candidatos.length > 0 && candidatos[0].length >= 10) {
          try {
            const jidsConsulta = candidatos.map((c) => `${c}@s.whatsapp.net`);
            const results = await sock.onWhatsApp(...jidsConsulta);
            const itemLid = Array.isArray(results)
              ? results.find((r: any) => r?.exists && r?.lid)
              : undefined;
            if (itemLid?.lid) {
              const phoneCanonico =
                normalizarTelefoneBr(String(itemLid.jid || candidatos[0])) || candidatos[0];
              registrarAssociacaoLid(String(itemLid.lid), phoneCanonico);
              const lidMapeado = phoneToLidMap.get(phoneCanonico);
              if (lidMapeado) {
                for (const cand of candidatos) {
                  if (!phoneToLidMap.has(cand)) {
                    phoneToLidMap.set(cand, lidMapeado);
                  }
                }
              }
            }
          } catch {
            // Silencioso por contato
          }
        }
      }
      console.log(
        `✅ [LID SYNC] Sincronização concluída. Total de LIDs mapeados no sistema: ${lidToPhoneMap.size}`,
      );
    }
  } catch (errSync) {
    console.warn("⚠️ [LID SYNC] Erro ao sincronizar LIDs:", errSync);
  }
}

// Expurgo automático de mensagens com mais de 14 dias para manter o disco enxuto
function expurgarMensagensAntigas() {
  try {
    if (!fs.existsSync(MSGS_DIR)) return;
    const arquivos = fs.readdirSync(MSGS_DIR);
    const limiteMs = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 dias
    let removidos = 0;
    for (const arq of arquivos) {
      if (!arq.endsWith(".json")) continue;
      const caminho = path.join(MSGS_DIR, arq);
      const stat = fs.statSync(caminho);
      if (stat.mtimeMs < limiteMs) {
        fs.unlinkSync(caminho);
        removidos++;
      }
    }
    if (removidos > 0) {
      console.log(
        `🧹 [WHATSAPP GATEWAY] Expurgo concluído: ${removidos} mensagens antigas removidas.`,
      );
    }
  } catch (errExpurgo) {
    console.warn("Aviso ao expurgar mensagens antigas:", errExpurgo);
  }
}
if (!IS_TEST_ENV) {
  setInterval(expurgarMensagensAntigas, 24 * 60 * 60 * 1000);
  setTimeout(expurgarMensagensAntigas, 15000);
}

// Implementação leve de CacheStore para msgRetryCounterCache e placeholderResendCache
function criarCacheStore(maxItens = 2000): any {
  const map = new Map<string, any>();
  return {
    get(key: string) {
      return map.get(key);
    },
    set(key: string, value: any) {
      if (map.size > maxItens) {
        const primeiro = map.keys().next().value;
        if (primeiro) map.delete(primeiro);
      }
      map.set(key, value);
    },
    del(key: string) {
      map.delete(key);
    },
    flushAll() {
      map.clear();
    },
  };
}

// Logger silencioso para economizar I/O e RAM
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

async function despacharWebhookAutoMonitoramento(payload: {
  remetente: string;
  remoteJid?: string;
  senderPn?: string;
  pushName?: string;
  texto: string;
  mensagemId?: string;
  hasMedia?: boolean;
  mediaMimetype?: string;
}): Promise<{
  resposta?: string;
  documento?: { nome: string; base64: string; mimetype?: string };
} | null> {
  try {
    const webhookUrl =
      process.env.SIGO_WEBHOOK_URL || "https://gd.oficial.tec.br/api/whatsapp/webhook";
    const token = "hunter-guardiao-whatsapp-secret-key-2026";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Hunter-Token": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as any;
      if (data?.sucesso) {
        return {
          resposta:
            typeof data.resposta === "string" && data.resposta.trim() ? data.resposta : undefined,
          documento: data.documento && data.documento.base64 ? data.documento : undefined,
        };
      }
    } else {
      console.warn(
        `[WEBHOOK INBOUND] Resposta HTTP ${res.status} ao repassar mensagem de ${payload.remetente}`,
      );
    }
  } catch (err: any) {
    console.warn(`[WEBHOOK INBOUND] Falha ao repassar mensagem para webhook:`, err?.message || err);
  }
  return null;
}

async function initWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    if (sock) {
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
      } catch {
        /* ignora erro ao remover listeners antigos */
      }
    }

    const msgRetryCounterCache = criarCacheStore(2000);
    const placeholderResendCache = criarCacheStore(2000);

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
      placeholderResendCache,
      logger,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      fireInitQueries: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (key) => {
        console.log(
          `🔄 [GETMESSAGE RETRY] WhatsApp solicitou recuperação da mensagem ID: ${key?.id}`,
        );
        const persistida = await obterMensagemPersistida(key?.id);
        if (persistida) {
          console.log(
            `✅ [GETMESSAGE RETRY] Mensagem ${key?.id} encontrada e devolvida para retransmissão.`,
          );
          return persistida;
        }
        console.warn(
          `⚠️ [GETMESSAGE RETRY] Mensagem não encontrada em cache/disco para ID: ${key?.id}`,
        );
        return undefined;
      },
      maxMsgRetryCount: 5,
      retryRequestDelayMs: 250,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      emitOwnEvents: false,
      markOnlineOnConnect: true,
      shouldIgnoreJid: (jid?: string) => Boolean(jid?.endsWith("@broadcast")),
    });

    sock.ev.on("creds.update", saveCreds);

    // Mapeamento dinâmico e automático de LIDs do WhatsApp para telefones reais (Phone Numbers)
    sock.ev.on("chats.phoneNumberShare", ({ lid, jid }: { lid?: string; jid?: string }) => {
      if (lid && jid) {
        registrarAssociacaoLid(lid, jid);
      }
    });

    // Registra recebimento e envio de mensagens para responder retries do WhatsApp
    sock.ev.on("messages.upsert", async ({ messages }: { messages: any[] }) => {
      try {
        for (const msg of messages) {
          if (msg.key?.id && msg.message) {
            salvarMensagemPersistida(msg.key.id, msg.message);
          }
          const jidOrigem = msg.key?.remoteJid || "";
          if (
            !msg.message ||
            msg.key?.fromMe ||
            jidOrigem.endsWith("@newsletter") ||
            jidOrigem.endsWith("@broadcast") ||
            jidOrigem.endsWith("@g.us")
          ) {
            continue;
          }
          let remetente = jidOrigem.split("@")[0].split(":")[0] || "desconhecido";
          const rawSenderPn =
            (msg as any).senderPn ||
            msg.key?.senderPn ||
            msg.key?.participantPn ||
            (msg as any).participant ||
            msg.key?.participant;
          let senderPn = rawSenderPn
            ? String(rawSenderPn).split("@")[0].split(":")[0].replace(/\D/g, "")
            : undefined;

          // Se veio o número de telefone real para remetente em LID, registra a associação
          if (jidOrigem.endsWith("@lid") && senderPn && senderPn.length >= 10) {
            registrarAssociacaoLid(jidOrigem, senderPn);
            senderPn = normalizarTelefoneBr(senderPn);
          }

          // Se for LID de privacidade, resolve dinamicamente para o telefone real cadastrado
          if (jidOrigem.endsWith("@lid")) {
            if (senderPn && senderPn.length >= 10) {
              remetente = normalizarTelefoneBr(senderPn);
            } else if (lidToPhoneMap.has(remetente)) {
              senderPn = lidToPhoneMap.get(remetente);
              remetente = senderPn!;
            }
          }

          const rawTexto =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            "";
          const hasMedia = Boolean(
            msg.message?.imageMessage ||
            msg.message?.documentMessage ||
            msg.message?.videoMessage ||
            msg.message?.audioMessage,
          );
          const mediaMimetype =
            msg.message?.imageMessage?.mimetype ||
            msg.message?.documentMessage?.mimetype ||
            undefined;

          console.log(
            `📩 [WHATSAPP RECEBIDO] De ${remetente} (JID: ${jidOrigem}): "${rawTexto.slice(0, 80)}"${hasMedia ? " [Mídia/Anexo]" : ""}`,
          );

          if (remetente !== "desconhecido" && (rawTexto || hasMedia)) {
            const pushName = msg.pushName || undefined;

            const respostaWebhook = await despacharWebhookAutoMonitoramento({
              remetente,
              remoteJid: jidOrigem,
              senderPn,
              pushName,
              texto: rawTexto,
              mensagemId: msg.key?.id,
              hasMedia,
              mediaMimetype,
            });

            if (respostaWebhook && sock && isConnected) {
              const jidDestino =
                jidOrigem && !jidOrigem.endsWith("@s.whatsapp.net")
                  ? jidOrigem
                  : await resolverJidPreferencial(normalizarTelefoneBr(remetente));

              // Se o webhook devolveu um documento (PDF ou imagem), despacha imediatamente para o JID de origem
              if (respostaWebhook.documento && respostaWebhook.documento.base64) {
                try {
                  const doc = respostaWebhook.documento;
                  const fileName = doc.nome || "proposta.pdf";
                  let rawBase64 = doc.base64;
                  if (rawBase64.includes(",")) rawBase64 = rawBase64.split(",")[1];
                  const buffer = Buffer.from(rawBase64, "base64");
                  const sentDoc = await sock.sendMessage(jidDestino, {
                    document: buffer,
                    mimetype: doc.mimetype || "application/pdf",
                    fileName,
                  });
                  if (sentDoc?.key?.id && sentDoc.message) {
                    salvarMensagemPersistida(sentDoc.key.id, sentDoc.message);
                  }
                  console.log(
                    `📎 [BOT AUTO-MONITORAMENTO] Documento "${fileName}" enviado com sucesso para ${jidDestino}`,
                  );
                } catch (docErr) {
                  console.warn(
                    "⚠️ [BOT AUTO-MONITORAMENTO] Erro ao enviar documento da resposta:",
                    docErr,
                  );
                }
              }

              if (respostaWebhook.resposta) {
                const sent = await sock.sendMessage(jidDestino, {
                  text: respostaWebhook.resposta,
                  linkPreview: null,
                });
                if (sent?.key?.id && sent.message) {
                  salvarMensagemPersistida(sent.key.id, sent.message);
                }
                console.log(
                  `🤖 [BOT AUTO-MONITORAMENTO] Resposta enviada com sucesso para ${jidDestino}`,
                );
              }
            }
          }
        }
      } catch (upsertErr) {
        console.warn("Aviso ao processar messages.upsert:", upsertErr);
      }
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        isConnected = false;
        console.log("📲 [WHATSAPP GATEWAY] Novo QR Code gerado. Acesse /qrcode no navegador.");
      }

      if (connection === "close") {
        isConnected = false;
        connectedNumber = null;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.warn(
          `⚠️ [WHATSAPP GATEWAY] Conexão encerrada (status ${statusCode}). Reconectar: ${shouldReconnect}`,
        );

        if (statusCode === DisconnectReason.loggedOut) {
          console.warn("🔒 [WHATSAPP GATEWAY] Desconectado pelo aparelho. Limpando sessão...");
          currentQR = null;
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch {
            /* ignora erro ao limpar pasta de autenticação */
          }
          setTimeout(initWhatsApp, 3000);
        } else if (shouldReconnect) {
          reconnectAttempts++;
          const delay = Math.min(reconnectAttempts * 2000, 15000);
          console.log(`🔄 [WHATSAPP GATEWAY] Reconectando em ${delay}ms...`);
          setTimeout(initWhatsApp, delay);
        }
      } else if (connection === "open") {
        isConnected = true;
        currentQR = null;
        reconnectAttempts = 0;
        connectedNumber =
          sock?.user?.id?.split("@")[0]?.split(":")[0] || sock?.user?.id || "Desconhecido";
        if (sock?.user?.id && sock?.user?.lid) {
          registrarAssociacaoLid(sock.user.lid, sock.user.id);
        }
        console.log(`✅ [WHATSAPP GATEWAY] Conectado com sucesso como: ${connectedNumber}`);
        try {
          await sock?.uploadPreKeysToServerIfRequired();
          console.log("🔑 [WHATSAPP GATEWAY] Pre-keys verificadas e sincronizadas no WhatsApp.");
        } catch (errPk) {
          console.warn("Aviso ao verificar pre-keys:", errPk);
        }
        // Dispara sincronização nativa de LIDs com os contatos cadastrados no GD Rastreamento
        setTimeout(() => {
          sincronizarLidsComWhatsApp();
        }, 3000);
      }
    });
  } catch (err) {
    console.error("❌ [WHATSAPP GATEWAY] Erro ao inicializar socket Baileys:", err);
    setTimeout(initWhatsApp, 5000);
  }
}

// Inicializa o socket do WhatsApp (em runtime)
if (!IS_TEST_ENV) {
  if (BAILEYS_PATCH_ATIVO) {
    console.log("🛡️ [WHATSAPP GATEWAY] Patch Signal/LID/Retry v1 ativo no Baileys.");
  } else {
    console.warn("⚠️ [WHATSAPP GATEWAY] Patch Signal/LID/Retry do Baileys NÃO detectado!");
  }
  initWhatsApp();
}

// ── ROTAS HTTP ────────────────────────────────────────────────────────────────

// 1. Tela de QR Code e Status
app.get(["/", "/qrcode"], async (_req: Request, res: Response) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Gateway — GD Segurança</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 9999px; padding: 6px 16px; font-weight: 700; font-size: 14px; margin-bottom: 20px; }
          .pulse { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px #22c55e; }
          h1 { font-size: 20px; margin: 0 0 8px 0; color: #fff; }
          p { color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5; }
          .info { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 16px; font-family: monospace; font-size: 15px; color: #38bdf8; word-break: break-all; }
          .btn-danger { margin-top: 24px; background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.2s; }
          .btn-danger:hover { background: #dc2626; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge"><div class="pulse"></div> Conectado e Operacional</div>
          <h1>GD Segurança — WhatsApp Gateway</h1>
          <p>O gateway exclusivo do GD Segurança está online e pronto para despachar alertas de segurança e mensagens da plataforma.</p>
          <div class="info">Linha GD: +${connectedNumber}</div>
          <form method="POST" action="/api/disconnect" onsubmit="return confirm('Deseja realmente desconectar a linha de WhatsApp do GD Segurança?')">
            <button type="submit" class="btn-danger">Desconectar Aparelho</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  if (currentQR) {
    const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 280, margin: 2 });
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="20">
        <title>Conectar WhatsApp — GD Segurança</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); border-radius: 9999px; padding: 6px 16px; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
          h1 { font-size: 20px; margin: 0 0 8px 0; color: #fff; }
          p { color: #94a3b8; font-size: 13px; margin: 0 0 20px 0; line-height: 1.5; }
          .qr-box { background: white; border-radius: 16px; padding: 12px; display: inline-block; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
          .qr-box img { display: block; border-radius: 8px; }
          .steps { text-align: left; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px; font-size: 12px; color: #cbd5e1; line-height: 1.6; }
          .steps ol { margin: 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Aguardando Conexão</div>
          <h1>GD Segurança — WhatsApp</h1>
          <p>Aponte a câmera do WhatsApp para escanear o QR Code e vincular a nova linha dedicada ao GD Segurança.</p>
          <div class="qr-box">
            <img src="${qrDataUrl}" alt="QR Code WhatsApp" width="280" height="280" />
          </div>
          <div class="steps">
            <ol>
              <li>Abra o <b>WhatsApp</b> no seu celular</li>
              <li>Toque nos <b>três pontinhos</b> ou <b>Configurações</b></li>
              <li>Selecione <b>Aparelhos conectados</b></li>
              <li>Toque em <b>Conectar um aparelho</b> e aponte para a tela</li>
            </ol>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  return res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="3">
      <title>Inicializando — GD Rastreamento</title>
      <style>
        body { font-family: system-ui; background: #0f172a; color: #94a3b8; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { text-align: center; }
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Inicializando serviço WhatsApp...</h2>
        <p>Aguarde alguns segundos enquanto o socket se conecta.</p>
      </div>
    </body>
    </html>
  `);
});

// 2. Healthcheck / Status JSON
app.get("/health", (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    status: isConnected ? "conectado" : currentQR ? "aguardando_qr" : "inicializando",
  });
});

app.get("/status", (_req: Request, res: Response) => {
  return res.json({
    status: isConnected ? "conectado" : currentQR ? "aguardando_qr" : "inicializando",
    conectado: isConnected,
    numero: connectedNumber,
    lids_mapeados: lidToPhoneMap.size,
    patch_baileys_ativo: BAILEYS_PATCH_ATIVO,
    uptime_segundos: Math.round(process.uptime()),
    memoria_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

// 3. API de Disparo de Mensagem (Chamada pelo GD Rastreamento)
app.post(
  ["/api/send", "/api/v1/messages/send", "/api/whatsapp/send"],
  async (req: Request, res: Response): Promise<any> => {
    const authHeader = req.headers["authorization"] || "";
    const tokenBearer = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const token = req.headers["x-hunter-token"] || tokenBearer || req.query.token;

    const tokenValido =
      token === API_TOKEN ||
      token === "hunter-guardiao-whatsapp-secret-key-2026" ||
      token === "gd-whatsapp-secret-key-2026";

    if (!tokenValido) {
      return res.status(401).json({ sucesso: false, erro: "Token de autenticação inválido." });
    }

    if (!isConnected || !sock) {
      return res.status(503).json({
        sucesso: false,
        erro: "WhatsApp não está conectado no momento. Acesse /qrcode para conectar.",
      });
    }

    const {
      numero,
      telefone,
      telefone_destinatario,
      to,
      recipient,
      remoteJid,
      mensagem,
      text,
      message,
      documento,
      document,
      arquivo,
    } = req.body;
    const foneAlvo = numero || telefone || telefone_destinatario || to || recipient;
    const textoMsg = mensagem || text || message || "";
    const doc = documento || document || arquivo;

    if (!foneAlvo && !remoteJid && !textoMsg && !doc) {
      return res.status(400).json({
        sucesso: false,
        erro: "Parâmetros obrigatórios: 'numero' e 'mensagem' ou 'documento'.",
      });
    }

    // Normalização do número de telefone brasileiro
    let limpo = normalizarTelefoneBr(String(foneAlvo || remoteJid || ""));

    // Prioriza o canal exato da conversa (LID nativo já mapeado ou resolvido sob demanda)
    // para evitar conflito de chaves Signal E2EE ("Aguardando mensagem. Essa ação pode levar alguns instantes")
    const candLidEnvio = limpo
      ? expandirCandidatosJidBr(limpo).find((cand) => phoneToLidMap.has(cand))
      : undefined;
    let jid = "";
    if (remoteJid && typeof remoteJid === "string" && remoteJid.includes("@")) {
      jid = remoteJid.trim();
      if (jid.endsWith("@s.whatsapp.net") && candLidEnvio) {
        jid = `${phoneToLidMap.get(candLidEnvio)}@lid`;
      }
    } else if (foneAlvo && String(foneAlvo).includes("@")) {
      jid = String(foneAlvo).trim();
      if (jid.endsWith("@s.whatsapp.net") && candLidEnvio) {
        jid = `${phoneToLidMap.get(candLidEnvio)}@lid`;
      }
    } else if (limpo) {
      jid = await resolverJidPreferencial(limpo);
    }

    if (!jid || jid === "@s.whatsapp.net" || jid === "@lid") {
      return res.status(400).json({
        sucesso: false,
        erro: "Destinatário inválido ou telefone incompleto para envio pelo WhatsApp.",
      });
    }

    try {
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate("composing", jid);
      } catch {
        /* ignora falha de presença */
      }

      let result: any;

      if (doc) {
        const fileName = doc.nome || doc.nomeArquivo || doc.fileName || doc.name || "documento.pdf";
        const mimetype = resolverMimetype(fileName, doc.mimetype || doc.mimeType || doc.tipo);
        const caption = textoMsg ? String(textoMsg).trim() : undefined;
        const isImage = mimetype.startsWith("image/");

        console.log(
          `📎 [WHATSAPP GATEWAY] Despachando ${isImage ? "imagem" : "documento"} "${fileName}" (${mimetype}) para ${jid}...`,
        );

        if (doc.url && typeof doc.url === "string") {
          result = await sock.sendMessage(
            jid,
            isImage
              ? {
                  image: { url: doc.url },
                  caption,
                  mimetype,
                }
              : {
                  document: { url: doc.url },
                  mimetype,
                  fileName,
                  caption,
                },
          );
        } else {
          let rawBase64 =
            typeof doc === "string" ? doc : doc.base64 || doc.data || doc.buffer || "";
          if (rawBase64.includes(",")) {
            rawBase64 = rawBase64.split(",")[1];
          }
          const buffer = Buffer.from(rawBase64, "base64");
          result = await sock.sendMessage(
            jid,
            isImage
              ? {
                  image: buffer,
                  caption,
                  mimetype,
                }
              : {
                  document: buffer,
                  mimetype,
                  fileName,
                  caption,
                },
          );
        }
        console.log(
          `✅ [WHATSAPP GATEWAY] ${isImage ? "Imagem" : "Documento"} transmitido com sucesso. ID: ${result?.key?.id}`,
        );
      } else {
        console.log(`💬 [WHATSAPP GATEWAY] Despachando texto para ${jid}...`);
        result = await sock.sendMessage(jid, { text: String(textoMsg), linkPreview: null });
        console.log(`✅ [WHATSAPP GATEWAY] Texto transmitido com sucesso. ID: ${result?.key?.id}`);
      }

      if (result?.key?.id && result?.message) {
        salvarMensagemPersistida(result.key.id, result.message);
      }

      return res.json({
        sucesso: true,
        messageId: result?.key?.id || null,
        destinatario: limpo,
        temDocumento: Boolean(doc),
      });
    } catch (err: any) {
      console.error("❌ [WHATSAPP GATEWAY] Falha ao enviar mensagem:", err?.message || err);
      return res.status(500).json({
        sucesso: false,
        erro: err?.message || "Falha interna ao transmitir mensagem pelo WhatsApp.",
      });
    }
  },
);

// 4. Sincronização Sob Demanda de LIDs com WhatsApp
app.post("/api/lid/sync", async (req: Request, res: Response): Promise<any> => {
  const authHeader = req.headers["authorization"] || "";
  const tokenBearer = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = req.headers["x-hunter-token"] || tokenBearer || req.query.token;

  const tokenValido =
    token === API_TOKEN ||
    token === "hunter-guardiao-whatsapp-secret-key-2026" ||
    token === "gd-whatsapp-secret-key-2026";

  if (!tokenValido) {
    return res.status(401).json({ sucesso: false, erro: "Token inválido" });
  }

  const { telefones } = req.body || {};
  await sincronizarLidsComWhatsApp(Array.isArray(telefones) ? telefones : undefined);
  return res.json({
    sucesso: true,
    totalMapeados: lidToPhoneMap.size,
    mapeamentos: Object.fromEntries(lidToPhoneMap.entries()),
  });
});

// 5. Desconectar Aparelho
app.post("/api/disconnect", async (_req: Request, res: Response) => {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch {
    /* ignora erro ao fazer logout no WhatsApp */
  }

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {
    /* ignora erro ao limpar credenciais */
  }

  isConnected = false;
  connectedNumber = null;
  currentQR = null;

  setTimeout(initWhatsApp, 1500);

  return res.redirect("/qrcode");
});

if (!IS_TEST_ENV) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 [WHATSAPP GATEWAY] Rodando na porta ${PORT}`);
    console.log(`📁 [WHATSAPP GATEWAY] Pasta de credenciais: ${AUTH_DIR}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENDADOR AUTÔNOMO 24/7: DISPARO DO RELATÓRIO GERENCIAL DIÁRIO (SUPERADM)
// Roda no servidor residente (Oracle Cloud Always Free) que está sempre online.
// ─────────────────────────────────────────────────────────────────────────────
let ultimoDiaDisparoBrt = "";

async function verificarDisparoRelatorioDiario() {
  try {
    const now = new Date();
    // Horário de Brasília (UTC-3)
    const spOffsetMs = 3 * 3600 * 1000;
    const spDate = new Date(now.getTime() - spOffsetMs);
    const hojeBrt = spDate.toISOString().split("T")[0];
    const horaBrt = spDate.getUTCHours();
    const minBrt = spDate.getUTCMinutes();

    // Dispara pontualmente às 10:00 (com janela de tolerância até 10:05)
    // e garante que dispara apenas uma vez por dia
    if (horaBrt === 10 && minBrt < 5 && ultimoDiaDisparoBrt !== hojeBrt) {
      console.log(
        `⏰ [CRON RESIDENTE] Janela de envio das 10:00 BRT atingida (${hojeBrt} ${horaBrt}:${String(minBrt).padStart(2, "0")}). Acionando relatório gerencial...`,
      );
      ultimoDiaDisparoBrt = hojeBrt;

      const endpoint =
        "https://gd.oficial.tec.br/api/relatorios/metricas-diarias/enviar?token=hunter-cron-jammer-2026";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem: "cron_residente_oracle" }),
      });

      const data = await res.json().catch(() => null);
      console.log("✅ [CRON RESIDENTE] Resposta do disparo do relatório diário:", data);
    }
  } catch (errCron) {
    console.warn("⚠️ [CRON RESIDENTE] Erro ao verificar cron do relatório diário:", errCron);
  }
}

if (!IS_TEST_ENV) {
  // Inicia verificação a cada 30 segundos
  setInterval(verificarDisparoRelatorioDiario, 30000);
  // E executa uma checagem 10 segundos após o boot
  setTimeout(verificarDisparoRelatorioDiario, 10000);
}
