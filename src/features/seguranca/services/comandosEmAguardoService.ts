import { supabase } from "@/integrations/supabase/client";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { dispararNotificacaoNativaAlerta } from "@/shared/lib/webPushService";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import { resolverRegraEntregaAlerta } from "@/features/monitor-gps/constants/alertasCatalogo";
import { toast } from "sonner";

export interface ComandoEmAguardoItem {
  id: string;
  imei: string;
  placa?: string;
  modelo?: string;
  clienteNome?: string;
  comando: string;
  horaDisparo: string;
  timestampInicio: number;
  hbtSegundos: number;
  segundosRestantes: number;
  segundosAteProximoProbe: number;
  segundosDecorridoTotal: number;
  status: "aguardando" | "transmitindo" | "aguardando_retorno" | "concluido" | "cancelado";
  tentativasEnvio: number;
  ultimoDisparoTs?: number;
  mensagemStatus?: string;
  respostaHardware?: string;
}

export interface CanaisAlertaComandoAguardo {
  app: boolean;
  whatsapp: boolean;
  ligacao: boolean;
  telefoneDestino?: string;
}

export interface NovoComandoEmAguardoParams {
  imei: string;
  placa?: string;
  modelo?: string;
  clienteNome?: string;
  comando: string;
  horaDisparo: string;
  hbtSegundos?: number;
}

const STORAGE_KEY_COMANDOS = "hunter_comandos_em_aguardo_lista";
const STORAGE_KEY_CANAIS = "hunter_canais_alerta_comando_aguardo";
const STORAGE_KEY_MINIMIZADO = "hunter_alerta_aguardo_minimizado";
const STORAGE_KEY_MUDO = "hunter_j16_alerta_aguardo_mudo";

type ListenerComandos = (itens: ComandoEmAguardoItem[]) => void;
const listeners = new Set<ListenerComandos>();

let comandosCache: ComandoEmAguardoItem[] = [];
let inicializado = false;
let audioContext: AudioContext | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export const STORAGE_KEY_CONSOLE_LOGS = "hunter_j16_console_logs_historico";

export function salvarLogNoHistoricoConsole(log: {
  id: string;
  hora: string;
  tipo: "envio" | "resposta" | "status" | "erro" | "info";
  texto: string;
  imei?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const salvo = localStorage.getItem(STORAGE_KEY_CONSOLE_LOGS);
    const lista = salvo ? JSON.parse(salvo) : [];
    lista.push(log);
    const truncada = lista.slice(-100);
    localStorage.setItem(STORAGE_KEY_CONSOLE_LOGS, JSON.stringify(truncada));
  } catch {}
}

export function carregarLogsHistoricoConsole(): Array<{
  id: string;
  hora: string;
  tipo: "envio" | "resposta" | "status" | "erro" | "info";
  texto: string;
  imei?: string;
}> {
  if (typeof window === "undefined") return [];
  try {
    const salvo = localStorage.getItem(STORAGE_KEY_CONSOLE_LOGS);
    if (salvo) {
      const logs = JSON.parse(salvo);
      if (Array.isArray(logs) && logs.length > 0) return logs;
    }
  } catch {}
  return [];
}

export function limparHistoricoLogsConsole() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_CONSOLE_LOGS);
  } catch {}
}

export function emitirLogConsoleJ16(
  tipo: "envio" | "resposta" | "status" | "erro" | "info",
  texto: string,
  imei?: string,
) {
  const novoLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    hora: formatarHoraBrasil(new Date(), true),
    tipo,
    texto,
    imei,
  };

  salvarLogNoHistoricoConsole(novoLog);

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("hunter_j16_console_log", {
          detail: novoLog,
        }),
      );
    } catch {}
  }
}

function carregarDoStorage(): ComandoEmAguardoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const salvo = localStorage.getItem(STORAGE_KEY_COMANDOS);
    if (salvo) {
      const parsed: ComandoEmAguardoItem[] = JSON.parse(salvo);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          return {
            ...item,
            segundosAteProximoProbe: item.segundosAteProximoProbe ?? 15,
            segundosDecorridoTotal: item.segundosDecorridoTotal ?? 0,
            segundosRestantes: item.segundosAteProximoProbe ?? 15,
          };
        });
      }
    }
  } catch {}
  return [];
}

function salvarNoStorage(itens: ComandoEmAguardoItem[]) {
  comandosCache = itens;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_COMANDOS, JSON.stringify(itens));
    } catch {}
  }
  listeners.forEach((fn) => fn([...itens]));
}

export function normalizarNumeroDiscadorClaro(rawTelefone: string): string {
  if (!rawTelefone) return "";
  let digitos = rawTelefone.replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55") && digitos.length >= 12) {
    digitos = digitos.substring(2);
  }
  if (digitos.startsWith("021")) {
    return digitos;
  }
  if (digitos.startsWith("0")) {
    digitos = digitos.substring(1);
  }
  return `021${digitos}`;
}

export function obterCanaisAlerta(): CanaisAlertaComandoAguardo {
  const padrao: CanaisAlertaComandoAguardo = { app: true, whatsapp: true, ligacao: false };
  if (typeof window === "undefined") {
    return padrao;
  }
  try {
    const salvo = localStorage.getItem(STORAGE_KEY_CANAIS);
    let canais = salvo ? JSON.parse(salvo) : padrao;
    if (!canais.telefoneDestino) {
      const tel =
        localStorage.getItem("hunter_alerta_comando_telefone") ||
        localStorage.getItem("hunter_alerta_telefone_padrao") ||
        "";
      if (tel) canais.telefoneDestino = tel;
    }
    return canais;
  } catch {}
  return padrao;
}

type ListenerCanais = (canais: CanaisAlertaComandoAguardo) => void;
const canaisListeners = new Set<ListenerCanais>();

export function inscreverAtualizacaoCanais(listener: ListenerCanais): () => void {
  canaisListeners.add(listener);
  return () => {
    canaisListeners.delete(listener);
  };
}

export function salvarCanaisAlerta(canais: CanaisAlertaComandoAguardo) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_CANAIS, JSON.stringify(canais));
    if (canais.telefoneDestino) {
      localStorage.setItem("hunter_alerta_comando_telefone", canais.telefoneDestino);
    }
  }
  canaisListeners.forEach((fn) => fn({ ...canais }));
}

export function obterAlertaMinimizado(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_MINIMIZADO) === "true";
}

export function salvarAlertaMinimizado(minimizado: boolean) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_MINIMIZADO, String(minimizado));
  }
}

export function obterSomMudo(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_MUDO) === "true";
}

export function salvarSomMudo(mudo: boolean) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_MUDO, String(mudo));
  }
}

export function tocarSomTaticoConclusao() {
  if (obterSomMudo()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const agora = audioContext.currentTime;
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, agora); // D5
    osc1.frequency.exponentialRampToValueAtTime(880.0, agora + 0.15); // A5

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(880.0, agora + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, agora + 0.35); // D6

    gain.gain.setValueAtTime(0.001, agora);
    gain.gain.exponentialRampToValueAtTime(0.2, agora + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    osc1.start(agora);
    osc1.stop(agora + 0.2);
    osc2.start(agora + 0.15);
    osc2.stop(agora + 0.4);
  } catch {}
}

export function tocarSomTaticoDespertar() {
  if (obterSomMudo()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const agora = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440.0, agora); // A4
    osc.frequency.exponentialRampToValueAtTime(659.25, agora + 0.15); // E5

    gain.gain.setValueAtTime(0.001, agora);
    gain.gain.exponentialRampToValueAtTime(0.18, agora + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.3);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(agora);
    osc.stop(agora + 0.3);
  } catch {}
}

export function obterComandosEmAguardo(): ComandoEmAguardoItem[] {
  if (!inicializado) {
    comandosCache = carregarDoStorage();
    inicializado = true;
    iniciarWatchdogGlobal();
  }
  return comandosCache;
}

export function adicionarComandoEmAguardo(item: NovoComandoEmAguardoParams) {
  const listaAtual = obterComandosEmAguardo();
  iniciarWatchdogGlobal();
  const novoId = `cmd_${item.imei}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Impede duplicata exata do mesmo comando já pendente na fila
  const jaExiste = listaAtual.some(
    (c) =>
      c.imei === item.imei &&
      c.comando.trim().toUpperCase() === item.comando.trim().toUpperCase() &&
      c.status !== "concluido" &&
      c.status !== "cancelado",
  );
  if (jaExiste) {
    toast.info(`O comando "${item.comando}" já está na fila deste veículo.`);
    return;
  }

  // Verifica quantos comandos já estão na fila para este IMEI
  const pendentesImei = listaAtual.filter(
    (c) => c.imei === item.imei && c.status !== "concluido" && c.status !== "cancelado",
  );
  const posicaoFila = pendentesImei.length + 1;

  const novoItem: ComandoEmAguardoItem = {
    ...item,
    id: novoId,
    timestampInicio: Date.now(),
    hbtSegundos: item.hbtSegundos || 300,
    segundosRestantes: 1,
    segundosAteProximoProbe: 1,
    segundosDecorridoTotal: 0,
    status: "aguardando",
    tentativasEnvio: 0,
    mensagemStatus:
      posicaoFila > 1
        ? `Fila sequencial: #${posicaoFila} · Será enviado logo após o anterior responder`
        : "Iniciando busca ativa do J16 (probes a cada 15s)...",
  };

  // Mantém TODOS os comandos em fila sequencial ordenada (FIFO)
  salvarNoStorage([...listaAtual, novoItem]);
  toast.success(
    posicaoFila > 1
      ? `Comando "${item.comando}" adicionado à fila (#${posicaoFila})!`
      : `Comando "${item.comando}" em aguardo de repouso!`,
  );
}

export function atualizarEstadoComando(imei: string, atualizacoes: Partial<ComandoEmAguardoItem>) {
  const listaAtual = obterComandosEmAguardo();
  let mudou = false;
  const alterados = listaAtual.map((item) => {
    if (item.imei === imei && item.status !== "concluido") {
      mudou = true;
      return { ...item, ...atualizacoes };
    }
    return item;
  });
  if (mudou) {
    salvarNoStorage(alterados);
  }
}

export function marcarComandoConcluido(
  imei: string,
  resposta: string,
  comandoOriginal?: string,
): boolean {
  const listaAtual = obterComandosEmAguardo();
  let tevePendente = false;
  let itemConcluido: ComandoEmAguardoItem | null = null;

  const atualizados = listaAtual.map((item) => {
    // Conclui apenas o primeiro comando pendente deste IMEI (o ativo)
    if (
      item.imei === imei &&
      item.status !== "concluido" &&
      item.status !== "cancelado" &&
      !tevePendente
    ) {
      tevePendente = true;
      itemConcluido = {
        ...item,
        status: "concluido",
        respostaHardware: resposta,
        mensagemStatus: `Concluído: "${resposta}"`,
      };
      return itemConcluido;
    }
    return item;
  });

  if (!tevePendente) return false;

  // Se houver próximo comando na fila para este mesmo IMEI, o hardware está ACORDADO agora!
  const proximoPendente = atualizados.find(
    (c) =>
      c.imei === imei &&
      (c.status === "aguardando" || c.status === "transmitindo") &&
      c.id !== itemConcluido?.id,
  );

  if (proximoPendente) {
    emitirLogConsoleJ16(
      "envio",
      `⚡ [FILA SEQUENCIAL J16] Hardware acordado! Transmitindo próximo comando da fila: "${proximoPendente.comando}"...`,
      imei,
    );
    setTimeout(() => {
      reenviarComandoParaImei(imei, proximoPendente.comando, {
        placa: proximoPendente.placa,
        origem: "fila_sequencial_j16_acordado",
        tentativa: 1,
      });
    }, 250);

    proximoPendente.status = "transmitindo";
    proximoPendente.segundosAteProximoProbe = 15;
    proximoPendente.tentativasEnvio = 1;
    proximoPendente.mensagemStatus = "Hardware acordado · Enviado imediatamente via socket TCP!";
  }

  salvarNoStorage(atualizados);
  tocarSomTaticoConclusao();

  emitirLogConsoleJ16(
    "resposta",
    `✅ [CONCLUÍDO] Hardware respondeu ao comando agendado para IMEI ${imei}: "${resposta}"`,
    imei,
  );

  // Despacho multicanal exclusivamente para comandos agendados em aguardo
  const canais = obterCanaisAlerta();
  const placaOuImei = itemConcluido?.placa || imei;

  void (async () => {
    try {
      let permitirApp = canais.app;
      let permitirWhatsapp = canais.whatsapp;
      let permitirLigacao = canais.ligacao;
      let telefonesWhatsapp = canais.telefoneDestino ? [canais.telefoneDestino] : [];
      let telefonesLigacao = canais.telefoneDestino ? [canais.telefoneDestino] : [];
      let authToken: string | undefined;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        authToken = session?.access_token;
        if (session?.user?.id) {
          const { data: cfg } = await supabase
            .from("notificacoes_configuracoes")
            .select("alertas_ativos")
            .eq("user_id", session.user.id)
            .is("veiculo_id", null)
            .maybeSingle();

          const ativos = (cfg?.alertas_ativos as Record<string, any>) || null;
          if (ativos?.alertas_operacionais?.comandos_j16) {
            const regra = resolverRegraEntregaAlerta({
              tipo: "comandos_j16",
              alertasOperacionais: ativos.alertas_operacionais,
              contatosConta: Array.isArray(ativos.contatos_alertas)
                ? ativos.contatos_alertas
                : null,
              telefoneFallbackTitular: canais.telefoneDestino || null,
            });
            permitirApp = regra.ativo && regra.app;
            permitirWhatsapp = regra.ativo && regra.whatsapp;
            permitirLigacao = regra.ativo && regra.ligacao;
            if (regra.telefonesWhatsapp.length > 0) {
              telefonesWhatsapp = regra.telefonesWhatsapp;
            }
            if (regra.telefonesLigacao.length > 0) {
              telefonesLigacao = regra.telefonesLigacao;
            }
          }
        }
      } catch {
        // fallback mantém canais locais
      }

      if (permitirApp) {
        try {
          dispararNotificacaoNativaAlerta({
            tipo: "comandos_j16",
            titulo: `Comando J16 Concluído: ${placaOuImei}`,
            mensagem: `O veículo respondeu ao comando agendado "${comandoOriginal || itemConcluido?.comando || "J16"}": "${resposta}"`,
            url: "/configuracao/rastreador-j16",
          });
        } catch {}
      }

      if (permitirWhatsapp && telefonesWhatsapp.length > 0) {
        const msgWhatsapp =
          `📡 *GD RASTREAMENTO — RETORNO DE COMANDO J16*\n\n` +
          `🚗 *Veículo:* ${itemConcluido?.placa || "—"} (${itemConcluido?.modelo || "J16"})\n` +
          `🔑 *IMEI:* ${imei}\n` +
          `⚡ *Comando Agendado:* ${comandoOriginal || itemConcluido?.comando || "—"}\n` +
          `✅ *Resposta da MCU:* "${resposta}"\n` +
          `⏰ *Horário:* ${formatarHoraBrasil(new Date(), true)}`;

        for (const telDestino of telefonesWhatsapp) {
          try {
            enviarMensagemWhatsappOperador({
              telefone: telDestino,
              categoriaMensagem: "alerta",
              tipoContato: "usuario",
              mensagem: msgWhatsapp,
            });
          } catch {}
        }
      }

      if (permitirLigacao && telefonesLigacao.length > 0) {
        for (const telDestino of telefonesLigacao) {
          try {
            emitirLogConsoleJ16(
              "status",
              `📞 [LIGAÇÃO MACRODROID] Disparando chamada de emergência via servidor para ${telDestino}...`,
              imei,
            );

            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (authToken) {
              headers.Authorization = `Bearer ${authToken}`;
            }

            await fetch("/api/alerta/ligacao", {
              method: "POST",
              headers,
              body: JSON.stringify({
                telefone: telDestino,
                motivo: `comandos_j16:${placaOuImei}:${resposta}`,
              }),
            }).catch(() => {});
          } catch {}
        }
      }
    } catch {}
  })();

  return true;
}

export function removerComandoEmAguardo(id: string) {
  const listaAtual = obterComandosEmAguardo();
  salvarNoStorage(listaAtual.filter((c) => c.id !== id));
}

export function limparComandosConcluidos() {
  const listaAtual = obterComandosEmAguardo();
  salvarNoStorage(listaAtual.filter((c) => c.status !== "concluido"));
}

export function limparTodosComandosEmAguardo() {
  salvarNoStorage([]);
}

export function inscreverAtualizacaoComandos(callback: ListenerComandos): () => void {
  listeners.add(callback);
  callback(obterComandosEmAguardo());
  return () => {
    listeners.delete(callback);
  };
}

export async function reenviarComandoParaImei(
  imei: string,
  comando: string,
  metadados?: {
    placa?: string;
    origem?: string;
    veiculoId?: string;
    tentativa?: number;
  },
): Promise<boolean> {
  const placaOuImei = metadados?.placa ? `${metadados.placa} (${imei})` : imei;
  const numTentativa = metadados?.tentativa ? ` [Tentativa ${metadados.tentativa}]` : "";

  emitirLogConsoleJ16(
    "envio",
    `📡 [GATEWAY TCP] Transmitindo comando "${comando}" para ${placaOuImei}${numTentativa} via socket TCP/GPRS...`,
    imei,
  );

  try {
    const res = await fetch("/api/gateway/comando", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imei,
        comando,
        veiculoId: metadados?.veiculoId,
        origem: metadados?.origem || "painel_j16_aguardo",
      }),
    });

    if (!res.ok) {
      emitirLogConsoleJ16(
        "erro",
        `❌ [GATEWAY TCP FALHA HTTP] Erro ${res.status} ao enviar comando "${comando}" para IMEI ${imei}`,
        imei,
      );
      toast.error(`Falha ao reenviar comando para IMEI ${imei}`);
      return false;
    }

    const dados = (await res.json().catch(() => null)) as {
      resposta?: string;
      enviado?: boolean;
      sucesso?: boolean;
      enfileirado?: boolean;
    } | null;

    // Se o hardware respondeu imediatamente (síncrono 0x15/0x21 ou ASCII Coban)
    if (dados?.resposta) {
      emitirLogConsoleJ16(
        "resposta",
        `✅ [RESPOSTA HARDWARE] IMEI ${imei}: "${dados.resposta}"`,
        imei,
      );
      marcarComandoConcluido(imei, dados.resposta, comando);
      toast.success(`Resposta recebida do hardware para ${placaOuImei}: "${dados.resposta}"`);
      return true;
    }

    if (dados?.enfileirado && !dados?.enviado) {
      emitirLogConsoleJ16(
        "status",
        `⏳ [SPOOLER GATEWAY] Rastreador ${placaOuImei} em repouso/reconexão GSM. Comando retido no Spooler TCP do Gateway.`,
        imei,
      );
      atualizarEstadoComando(imei, {
        status: "aguardando",
        mensagemStatus: "Retido no Spooler TCP · Aguardando pacote GSM",
      });
      return true;
    }

    if (dados?.enviado || (dados?.sucesso && !dados?.enfileirado)) {
      emitirLogConsoleJ16(
        "status",
        `📡 [SOCKET TCP ENTREGUE] Pacote entregue com sucesso ao socket ativo do rastreador ${placaOuImei}. Aguardando retorno da MCU (0x15)...`,
        imei,
      );
      atualizarEstadoComando(imei, {
        status: "aguardando",
        mensagemStatus: "Pacote entregue ao socket TCP · Aguardando retorno 0x15",
      });
      return true;
    }

    return true;
  } catch (err) {
    emitirLogConsoleJ16(
      "erro",
      `❌ [GATEWAY TCP ERRO] Falha de conexão ao enviar para IMEI ${imei}: ${String(err)}`,
      imei,
    );
    toast.error(`Erro ao conectar com o gateway: ${String(err)}`);
    return false;
  }
}

export async function reiniciarEForcarComandoEmAguardo(
  imei: string,
  comando: string,
  metadados?: { placa?: string; veiculoId?: string },
): Promise<boolean> {
  const placaOuImei = metadados?.placa ? `${metadados.placa} (${imei})` : imei;

  atualizarEstadoComando(imei, {
    status: "transmitindo",
    segundosAteProximoProbe: 15,
    tentativasEnvio: 1,
    ultimoDisparoTs: Date.now(),
    mensagemStatus: "Operador disparou envio imediato via TCP · Buscando retorno 0x15",
  });

  emitirLogConsoleJ16(
    "envio",
    `⚡ [ENVIO IMEDIATO] Operador disparou envio direto para ${placaOuImei}. Comando: "${comando}" via socket TCP...`,
    imei,
  );

  return await reenviarComandoParaImei(imei, comando, {
    placa: metadados?.placa,
    veiculoId: metadados?.veiculoId,
    origem: "manual_forcar_envio",
    tentativa: 1,
  });
}

// Watchdog global: efetua probe ativo a cada 15 segundos para encontrar o J16 acordado
let timerInterval: ReturnType<typeof setInterval> | null = null;

function iniciarWatchdogGlobal() {
  if (typeof window === "undefined") return;

  if (!timerInterval) {
    timerInterval = setInterval(() => {
      const temAtivos = comandosCache.some(
        (c) => c.status !== "concluido" && c.status !== "cancelado",
      );
      if (!temAtivos) {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        return;
      }

      let mudou = false;
      const imeisProcessados = new Set<string>();

      const tick: ComandoEmAguardoItem[] = comandosCache.map((item): ComandoEmAguardoItem => {
        if (item.status === "concluido" || item.status === "cancelado") {
          return item;
        }

        // Se este IMEI já tem um comando anterior sendo sondado ativamente, este aguarda na fila sequencial
        if (imeisProcessados.has(item.imei)) {
          return {
            ...item,
            mensagemStatus: "Fila sequencial · Aguardando conclusão do comando anterior...",
          };
        }

        imeisProcessados.add(item.imei);
        mudou = true;
        const decorrido = (item.segundosDecorridoTotal || 0) + 1;
        const proxProbe = (item.segundosAteProximoProbe ?? 15) - 1;

        // Se chegou o momento do probe ativo (a cada 15 segundos)
        if (proxProbe <= 0) {
          const novasTentativas = (item.tentativasEnvio || 0) + 1;

          // Trava de segurança Hunter contra loops infinitos de sondagem (máx 5 tentativas / 75 segundos)
          if (novasTentativas > 5) {
            setTimeout(() => {
              emitirLogConsoleJ16(
                "erro",
                `⏱️ [PROBE TIMEOUT] Limite de 5 probes atingido para ${item.placa || item.imei}. Rastreador offline ou em repouso profundo. Encerrando sondagem ativa.`,
                item.imei,
              );
            }, 50);

            return {
              ...item,
              status: "cancelado" as const,
              segundosDecorridoTotal: decorrido,
              mensagemStatus: "Sondagem finalizada · Dispositivo sem resposta TCP",
            };
          }

          setTimeout(() => {
            emitirLogConsoleJ16(
              "envio",
              `📡 [PROBE 15s #${novasTentativas}/5] Buscando rastreador acordado (${item.placa || item.imei}). Enviando "${item.comando}" via socket TCP...`,
              item.imei,
            );
            reenviarComandoParaImei(item.imei, item.comando, {
              placa: item.placa,
              origem: "probe_ativo_15s",
              tentativa: novasTentativas,
            });
          }, 50);

          return {
            ...item,
            segundosAteProximoProbe: 15,
            segundosDecorridoTotal: decorrido,
            segundosRestantes: 15,
            tentativasEnvio: novasTentativas,
            status: "transmitindo" as const,
            ultimoDisparoTs: Date.now(),
            mensagemStatus: `Probe #${novasTentativas}/5 enviado · Buscando rastreador acordado a cada 15s...`,
          };
        }

        return {
          ...item,
          segundosAteProximoProbe: proxProbe,
          segundosDecorridoTotal: decorrido,
          segundosRestantes: proxProbe,
        };
      });

      if (mudou) {
        salvarNoStorage(tick);
      }
    }, 1000);
  }

  // Listener Realtime global do canal do Gateway TCP
  if (!realtimeChannel) {
    try {
      realtimeChannel = supabase
        .channel("hunter_comandos_aguardo_global_channel")
        .on(
          "broadcast",
          { event: "resposta_comando" },
          (payload: {
            payload?: { imei?: string; resposta?: string; comandoOriginal?: string };
          }) => {
            const { imei, resposta, comandoOriginal } = payload.payload || {};
            if (imei && resposta) {
              marcarComandoConcluido(imei, resposta, comandoOriginal);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "eventos_veiculo",
            filter: "tipo=eq.comando_resposta",
          },
          (payload: { new?: { descricao?: string; veiculo_id?: string } }) => {
            const desc = payload.new?.descricao || "";
            const match = desc.match(/Retorno do comando:\s*(.+)$/);
            if (match && match[1]) {
              const respTexto = match[1].trim();
              const matchImei = respTexto.match(/(?:IMEI|ID):(\d{15})/);
              if (matchImei?.[1]) {
                marcarComandoConcluido(matchImei[1], respTexto);
              }
            }
          },
        )
        .subscribe();
    } catch {}
  }
}
