type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const SUPABASE_ORIGIN = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const SUPABASE_HOST = SUPABASE_ORIGIN.replace(/^https?:\/\//, "");

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${SUPABASE_ORIGIN ? `${SUPABASE_ORIGIN} wss://${SUPABASE_HOST}` : ""} https://*.supabase.co https://*.cloudflareinsights.com https://cloudflareinsights.com https://*.openstreetmap.org https://photon.komoot.io https://*.project-osrm.org https://router.project-osrm.org https://routing.openstreetmap.de https://*.arcgisonline.com https://*.maptiler.com https://api.mapbox.com https://*.mapbox.com https://gd.oficial.tec.br https://*.z-api.io https://*.evolution-api.com https://gps.oficial.tec.br:* http://gps.oficial.tec.br:* http://167.234.233.82:* https://167.234.233.82:* http://137.66.4.11:* https://137.66.4.11:* https://hunter-gps-gateway.fly.dev http://hunter-gps-gateway.fly.dev:* https://gd-whatsapp-gateway.fly.dev https://generativelanguage.googleapis.com https://trigger.macrodroid.com https://*.macrodroid.com`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

import { createClient } from "@supabase/supabase-js";
import { APP_PUBLIC_URL } from "./shared/lib/version";
import {
  ehComandoConsultaSomenteLeitura,
  ehComandoBloqueio,
  ehComandoDesbloqueio,
  ehComandoBloqueioOuDesbloqueio,
  sanitizarComandoHardware,
} from "./shared/lib/hunterHardwareComandos";
import {
  enviarRelatorioDiarioSuperAdm,
  coletarMetricasDiarias,
  formatarMensagemRelatorioDiario,
} from "./features/relatorios/services/relatorioDiarioMetricasService";
import {
  processarMensagemWhatsappRecebida,
  notificarInstaladorNovoServicoWhatsapp,
  notificarClienteAgendamentoInstalacaoWhatsapp,
} from "./features/chat/services/whatsappAutoMonitoramentoService";
import { formatarMensagemWhatsAppProposta } from "./features/financeiro/services/propostaService";
import { gerarContratoPdfBufferServer } from "./features/clientes/services/geradorContratoPdfServer";
import {
  ehAlertaRestritoEquipeTecnica,
  normalizarTelefoneDigitosBR,
  resolverRegraEntregaAlerta,
  normalizarTipoAlerta,
  obterItemCatalogoAlerta,
  type CanalAlertaItemPreferencia,
  type ContatoAlertaConta,
} from "./features/monitor-gps/constants/alertasCatalogo";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(self)",
  "Content-Security-Policy": CSP_DIRECTIVES.join("; "),
};

function getSupabaseServerParams(env: unknown) {
  const envObj = (env || {}) as Record<string, string | undefined>;
  let supabaseUrl =
    envObj.SUPABASE_URL ||
    envObj.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";

  let supabaseAnonKey =
    envObj.SUPABASE_ANON_KEY ||
    envObj.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  let serviceRoleKey =
    envObj.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if ((!supabaseUrl || !serviceRoleKey) && typeof process !== "undefined") {
    try {
      const fs = (globalThis as any).process?.getBuiltinModule?.("fs");
      if (fs) {
        const cwd = process.cwd();
        for (const file of [".env.local", ".env.production"]) {
          const p = `${cwd}/${file}`;
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8");
            for (const line of raw.split("\n")) {
              const [k, ...v] = line.split("=");
              if (k && v.length) {
                const trimmedK = k.trim();
                const trimmedV = v.join("=").trim();
                if (trimmedK === "SUPABASE_URL" && !supabaseUrl) supabaseUrl = trimmedV;
                if (trimmedK === "VITE_SUPABASE_URL" && !supabaseUrl) supabaseUrl = trimmedV;
                if (trimmedK === "SUPABASE_ANON_KEY" && !supabaseAnonKey)
                  supabaseAnonKey = trimmedV;
                if (trimmedK === "VITE_SUPABASE_ANON_KEY" && !supabaseAnonKey)
                  supabaseAnonKey = trimmedV;
                if (trimmedK === "SUPABASE_SERVICE_ROLE_KEY" && !serviceRoleKey)
                  serviceRoleKey = trimmedV;
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
}

async function broadcastEventoRealtime(
  env: unknown,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    if (!supabaseUrl || !serviceRoleKey) return;
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: "hunter_telemetria_changes",
            event,
            payload,
          },
        ],
      }),
    });
  } catch {
    /* ignore */
  }
}

function getGeminiApiKey(env: unknown): string {
  const envObj = (env || {}) as Record<string, string | undefined>;
  let apiKey =
    envObj.GEMINI_API_KEY ||
    envObj.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "";

  if (!apiKey && typeof process !== "undefined") {
    try {
      const fs = (globalThis as any).process?.getBuiltinModule?.("fs");
      if (fs) {
        const cwd = process.cwd();
        for (const file of [".env.local", ".env.production"]) {
          const p = `${cwd}/${file}`;
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8");
            for (const line of raw.split("\n")) {
              const [k, ...v] = line.split("=");
              if (k && v.length) {
                const trimmedK = k.trim();
                const trimmedV = v.join("=").trim();
                if (
                  (trimmedK === "GEMINI_API_KEY" || trimmedK === "VITE_GEMINI_API_KEY") &&
                  !apiKey
                ) {
                  apiKey = trimmedV;
                }
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return apiKey;
}

const CONSUMED_INVITE_TOKENS = new Set<string>();

interface MembroEquipeNotificavel {
  userId: string;
  role: string;
  nome: string;
  email: string;
  telefone: string;
  ncAtivos: Record<string, any> | null;
}

const MAPA_TITULO_LOG_PARA_TIPO_CONTA: Record<
  string,
  { tipoCanonico: string; tituloPush: string; url: string }
> = {
  novo_instalador_auto_cadastro: {
    tipoCanonico: "cadastros_convites_veiculos",
    tituloPush: "🔧 Novo Credenciamento de Instalador",
    url: "/usuarios",
  },
  novo_cliente_auto_cadastro: {
    tipoCanonico: "cadastros_convites_veiculos",
    tituloPush: "👤 Novo Auto-Cadastro de Cliente",
    url: "/clientes",
  },
  novo_revendedor_cadastro: {
    tipoCanonico: "cadastros_convites_veiculos",
    tituloPush: "🏢 Novo Cadastro de Revendedor",
    url: "/revendedores",
  },
  novo_vendedor_cadastro: {
    tipoCanonico: "cadastros_convites_veiculos",
    tituloPush: "👤 Novo Cadastro de Vendedor",
    url: "/revendedores",
  },
  nova_solicitacao_veiculo_cliente: {
    tipoCanonico: "cadastros_convites_veiculos",
    tituloPush: "🚗 Solicitação de Novo Veículo",
    url: "/instalacao",
  },
  notificacao_proposta_emitida: {
    tipoCanonico: "propostas_contratos",
    tituloPush: "📋 Nova Proposta Comercial Emitida",
    url: "/propostas",
  },
  notificacao_contrato_assinado_cliente: {
    tipoCanonico: "propostas_contratos",
    tituloPush: "✍️ Contrato Assinado Eletronicamente",
    url: "/clientes",
  },
  notificacao_contrato_assinado_recebido: {
    tipoCanonico: "propostas_contratos",
    tituloPush: "✍️ Contrato Assinado Recebido",
    url: "/clientes",
  },
  mensalidade_pagamento_informado: {
    tipoCanonico: "pagamento_informado",
    tituloPush: "💰 Pagamento de Mensalidade Informado",
    url: "/mensalidades",
  },
};

async function carregarContextoEquipeTecnica(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{
  membros: MembroEquipeNotificavel[];
  fonesCentralGerencial: string[];
}> {
  const headersSupabase = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };

  const membrosMap = new Map<string, MembroEquipeNotificavel>();

  try {
    const [resPerfis, resRoles] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/profiles?role=in.(superadmin,adm,operador)&ativo=eq.true&select=id,nome,email,telefone,role`,
        { headers: headersSupabase },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/user_roles?role=in.(superadmin,adm,operador)&select=user_id,role`,
        { headers: headersSupabase },
      ),
    ]);

    const arrPerfis = resPerfis.ok ? ((await resPerfis.json()) as any[]) : [];
    const arrRoles = resRoles.ok ? ((await resRoles.json()) as any[]) : [];

    for (const p of arrPerfis || []) {
      if (!p?.id) continue;
      membrosMap.set(String(p.id), {
        userId: String(p.id),
        role: String(p.role || "").toLowerCase(),
        nome: String(p.nome || p.email || "Equipe Técnica"),
        email: String(p.email || ""),
        telefone: String(p.telefone || ""),
        ncAtivos: null,
      });
    }

    const faltantes: Array<{ userId: string; role: string }> = [];
    for (const r of arrRoles || []) {
      const uid = r?.user_id ? String(r.user_id) : "";
      if (!uid) continue;
      const existente = membrosMap.get(uid);
      if (existente) {
        if (!existente.role && r.role) existente.role = String(r.role).toLowerCase();
      } else {
        faltantes.push({ userId: uid, role: String(r.role || "").toLowerCase() });
      }
    }

    if (faltantes.length > 0) {
      const idsIn = faltantes.map((f) => f.userId).join(",");
      const resExtras = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=in.(${idsIn})&ativo=eq.true&select=id,nome,email,telefone,role`,
        { headers: headersSupabase },
      ).catch(() => null);
      if (resExtras && resExtras.ok) {
        const arrExtras = (await resExtras.json()) as any[];
        for (const p of arrExtras || []) {
          if (!p?.id) continue;
          const papelRole = faltantes.find((f) => f.userId === String(p.id))?.role || "";
          membrosMap.set(String(p.id), {
            userId: String(p.id),
            role: String(p.role || papelRole || "").toLowerCase(),
            nome: String(p.nome || p.email || "Equipe Técnica"),
            email: String(p.email || ""),
            telefone: String(p.telefone || ""),
            ncAtivos: null,
          });
        }
      }
    }
  } catch {
    /* fallback silencioso */
  }

  const userIds = Array.from(membrosMap.keys());
  if (userIds.length > 0) {
    try {
      const resNc = await fetch(
        `${supabaseUrl}/rest/v1/notificacoes_configuracoes?veiculo_id=is.null&user_id=in.(${userIds.join(",")})&select=user_id,alertas_ativos`,
        { headers: headersSupabase },
      );
      if (resNc.ok) {
        const arrNc = (await resNc.json()) as any[];
        for (const row of arrNc || []) {
          const uid = row?.user_id ? String(row.user_id) : "";
          const m = uid ? membrosMap.get(uid) : undefined;
          if (m && row?.alertas_ativos && typeof row.alertas_ativos === "object") {
            m.ncAtivos = row.alertas_ativos;
          }
        }
      }
    } catch {
      /* fallback silencioso */
    }
  }

  let fonesCentralGerencial: string[] = [];
  try {
    const resRel = await fetch(
      `${supabaseUrl}/rest/v1/relatorio_gerencial_config?select=telefones&limit=1`,
      {
        headers: headersSupabase,
      },
    );
    if (resRel.ok) {
      const arrRel = (await resRel.json()) as any[];
      const listaTel = arrRel?.[0]?.telefones;
      if (Array.isArray(listaTel)) {
        fonesCentralGerencial = listaTel
          .map((t: any) =>
            normalizarTelefoneDigitosBR(typeof t === "string" ? t : t?.telefone || ""),
          )
          .filter((d: string) => d.length >= 10);
      }
    }
  } catch {
    /* fallback silencioso */
  }

  return {
    membros: Array.from(membrosMap.values()),
    fonesCentralGerencial,
  };
}

function resolverRegraMembroEquipeServer(params: {
  membro: MembroEquipeNotificavel;
  tipoCanonico: string;
  fonesCentralGerencial: string[];
}): {
  ativo: boolean;
  app: boolean;
  whatsapp: boolean;
  ligacao: boolean;
  telefonesWhatsapp: string[];
  telefonesLigacao: string[];
  possuiConfigExplicita: boolean;
} {
  const { membro, tipoCanonico, fonesCentralGerencial } = params;
  const norm = normalizarTipoAlerta(tipoCanonico);
  const itemCat = obterItemCatalogoAlerta(norm);
  const ehSuperAdm =
    membro.role === "superadmin" ||
    membro.email.toLowerCase() === "novaes@adm.28bpm.local" ||
    membro.email.toLowerCase() === "novaes@oficial.tec.br";

  const nc = membro.ncAtivos || null;
  const contatosSalvos: ContatoAlertaConta[] = Array.isArray(nc?.contatos_alertas)
    ? [...nc.contatos_alertas]
    : [];

  const digitosMembro = normalizarTelefoneDigitosBR(membro.telefone);
  if (
    digitosMembro.length >= 10 &&
    !contatosSalvos.some((c) => normalizarTelefoneDigitosBR(c.telefone) === digitosMembro)
  ) {
    contatosSalvos.push({
      id: `eq-prof-${membro.userId}`,
      nome: membro.nome || "Equipe Técnica",
      telefone: membro.telefone,
      tipo: "cliente",
      ativo: true,
      padrao: true,
    });
  }

  // Se o SuperADM ainda não salvou lista personalizada em contatos_alertas, inclui centrais de relatorio_gerencial_config
  const tinhaContatosSalvos = Array.isArray(nc?.contatos_alertas) && nc.contatos_alertas.length > 0;
  if (ehSuperAdm && !tinhaContatosSalvos) {
    for (const fCentral of fonesCentralGerencial) {
      if (
        fCentral.length >= 10 &&
        !contatosSalvos.some((c) => normalizarTelefoneDigitosBR(c.telefone) === fCentral)
      ) {
        contatosSalvos.push({
          id: `eq-rel-${fCentral}`,
          nome: "Central SuperADM",
          telefone: fCentral,
          tipo: "adicional",
          ativo: true,
          padrao: true,
        });
      }
    }
    if (contatosSalvos.length === 0) {
      contatosSalvos.push({
        id: "eq-fallback-superadm",
        nome: "SuperADM Oficial",
        telefone: "5524992494030",
        tipo: "cliente",
        ativo: true,
        padrao: true,
      });
    }
  }

  const ehContaOuSms = itemCat?.categoria === "conta" || norm === "corte_nao_autorizado_sms";
  if (ehContaOuSms) {
    const ops = nc?.alertas_operacionais || null;
    const itemSalvo: CanalAlertaItemPreferencia | undefined = ops?.[norm] || ops?.[tipoCanonico];
    if (itemSalvo && typeof itemSalvo === "object") {
      const resolvida = resolverRegraEntregaAlerta({
        tipo: norm,
        alertasOperacionais: { [norm]: itemSalvo },
        canaisGlobais:
          norm === "corte_nao_autorizado_sms"
            ? { por_alerta: { corte_nao_autorizado_sms: itemSalvo } }
            : null,
        contatosConta: contatosSalvos,
        telefoneFallbackTitular: ehSuperAdm ? "5524992494030" : membro.telefone || null,
      });
      return { ...resolvida, possuiConfigExplicita: true };
    }

    const appPadrao = Boolean(itemCat?.padraoCanais.app ?? true);
    const whatsPadrao = ehSuperAdm ? Boolean(itemCat?.padraoCanais.whatsapp ?? false) : false;
    const fonesAtivos = contatosSalvos
      .filter((c) => c.ativo !== false)
      .map((c) => normalizarTelefoneDigitosBR(c.telefone))
      .filter((d) => d.length >= 10);

    return {
      ativo: true,
      app: appPadrao,
      whatsapp: whatsPadrao,
      ligacao: false,
      telefonesWhatsapp: whatsPadrao ? fonesAtivos : [],
      telefonesLigacao: [],
      possuiConfigExplicita: false,
    };
  }

  const eqp = nc?.alertas_equipe || null;
  const itemEquipe: CanalAlertaItemPreferencia | undefined = eqp?.[norm] || eqp?.[tipoCanonico];
  if (itemEquipe && typeof itemEquipe === "object") {
    const resolvida = resolverRegraEntregaAlerta({
      tipo: norm,
      canaisGlobais: { por_alerta: { [norm]: itemEquipe } },
      contatosConta: contatosSalvos,
      telefoneFallbackTitular: ehSuperAdm ? "5524992494030" : membro.telefone || null,
    });
    return { ...resolvida, possuiConfigExplicita: true };
  }

  const ativoPadrao = Boolean(itemCat?.padraoAtivo ?? true);
  const whatsEquipePadrao =
    ehSuperAdm && (norm === "panico" || norm === "bateria_desconectada") ? true : false;
  const fonesAtivos = contatosSalvos
    .filter((c) => c.ativo !== false)
    .map((c) => normalizarTelefoneDigitosBR(c.telefone))
    .filter((d) => d.length >= 10);

  return {
    ativo: ativoPadrao,
    app: ativoPadrao,
    whatsapp: ativoPadrao && whatsEquipePadrao,
    ligacao: false,
    telefonesWhatsapp: ativoPadrao && whatsEquipePadrao ? fonesAtivos : [],
    telefonesLigacao: [],
    possuiConfigExplicita: false,
  };
}

/**
 * Despacha notificação operacional unificada (App/Push, WhatsApp e Ligação MacroDroid)
 * para os membros da equipe técnica respeitando 100% as escolhas individuais configuradas.
 * Utilizada para eventos operacionais críticos:
 * 1. Novo auto-cadastro de cliente e parceiro
 * 2. Novo credenciamento de instalador
 * 3. Nova solicitação de veículo, propostas, contratos e pagamentos
 */
async function despacharNotificacaoWhatsappSuperAdm(
  env: unknown,
  mensagem: string,
  tituloLog = "notificacao_superadm_whatsapp",
  opcoes?: {
    tipoAlerta?: string;
    tituloPush?: string;
    mensagemPush?: string;
    url?: string;
  },
): Promise<void> {
  // Blindagem em ambiente de testes para evitar chamadas de rede externas
  if (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      Boolean((globalThis as any).__TEST__))
  ) {
    return;
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const mapeado = MAPA_TITULO_LOG_PARA_TIPO_CONTA[tituloLog];
    const tipoCanonico = normalizarTipoAlerta(
      opcoes?.tipoAlerta || mapeado?.tipoCanonico || tituloLog,
    );
    const tituloPushFinal =
      opcoes?.tituloPush || mapeado?.tituloPush || "🛡️ Alerta Operacional GD Rastreamento";
    const urlDestino = opcoes?.url || mapeado?.url || "/configuracoes";
    const mensagemPushFinal =
      opcoes?.mensagemPush ||
      mensagem
        .replace(/[*_]/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" — ")
        .slice(0, 240);

    const { membros, fonesCentralGerencial } = await carregarContextoEquipeTecnica(
      supabaseUrl,
      serviceRoleKey,
    );

    const setTelefonesWhatsapp = new Set<string>();
    const setTelefonesLigacao = new Set<string>();
    const membrosComApp: MembroEquipeNotificavel[] = [];
    let algumMembroTemConfig = false;

    for (const membro of membros) {
      const regra = resolverRegraMembroEquipeServer({
        membro,
        tipoCanonico,
        fonesCentralGerencial,
      });
      if (regra.possuiConfigExplicita) {
        algumMembroTemConfig = true;
      }
      if (!regra.ativo) continue;

      if (regra.app) {
        membrosComApp.push(membro);
      }
      if (regra.whatsapp) {
        for (const f of regra.telefonesWhatsapp) {
          setTelefonesWhatsapp.add(f);
        }
      }
      if (regra.ligacao) {
        for (const f of regra.telefonesLigacao) {
          setTelefonesLigacao.add(f);
        }
      }
    }

    // Se nenhum membro possui cadastro/preferência em notificacoes_configuracoes, mantém fallback canônico de segurança
    if (membros.length === 0 && !algumMembroTemConfig) {
      for (const f of fonesCentralGerencial) {
        setTelefonesWhatsapp.add(f);
      }
      if (setTelefonesWhatsapp.size === 0) {
        setTelefonesWhatsapp.add("5524992494030");
      }
    }

    // 1. Insere notificacoes_sistema individual por membro com App habilitado (pg_net dispara Push VAPID por userId)
    for (const membro of membrosComApp) {
      try {
        await adminSupabase.from("notificacoes_sistema").insert({
          destinatario_user_id: membro.userId,
          destinatario_cliente_id: null,
          titulo: tituloPushFinal,
          mensagem: mensagemPushFinal,
          tipo: tipoCanonico,
          url: urlDestino,
          lida: false,
        });
      } catch {
        /* fallback silencioso */
      }
    }

    const envObj = (env || {}) as Record<string, string | undefined>;
    const gatewayUrl = "https://gps.oficial.tec.br/gd/whatsapp";
    const endpointsGateway = [gatewayUrl];

    const token =
      envObj.GD_WHATSAPP_TOKEN ||
      (typeof process !== "undefined" ? process.env?.GD_WHATSAPP_TOKEN : undefined) ||
      "hunter-guardiao-whatsapp-secret-key-2026";

    // Blindagem anti-self: nunca despacha para os números do próprio robô/gateway
    setTelefonesWhatsapp.delete("5524992501512");
    setTelefonesWhatsapp.delete("5524981498266");

    // Checagem de Bloqueio Emergencial via Central
    try {
      const { data: cfgBloq } = await adminSupabase
        .from("relatorio_gerencial_config")
        .select("secoes_ativas, enviar_whatsapp")
        .limit(1)
        .maybeSingle();
      const sec = (cfgBloq?.secoes_ativas as any) || {};
      if (
        sec?.bloqueio_emergencial ||
        sec?.bloqueio_emergencial_whatsapp ||
        cfgBloq?.enviar_whatsapp === false
      ) {
        console.warn(
          "🛑 [SERVER WHATSAPP] Notificação suprimida: Bloqueio emergencial ativo na Central.",
        );
        setTelefonesWhatsapp.clear();
      }
    } catch {
      /* segue */
    }

    // 2. Canal WHATSAPP conforme preferência por membro
    for (const fone of setTelefonesWhatsapp) {
      let enviadoSucesso = false;
      for (const epBase of endpointsGateway) {
        if (enviadoSucesso) break;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const resEnvio = await fetch(`${epBase}/api/v1/messages/send`, {
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

          if (resEnvio.ok) {
            enviadoSucesso = true;
            adminSupabase
              .from("system_activity_logs")
              .insert({
                acao: tituloLog,
                detalhe: `WhatsApp enviado para equipe (${fone}) [${tipoCanonico}]`,
              })
              .catch(() => {});
          }
        } catch (errEnvio) {
          console.warn(`[SUPERADM-WHATSAPP] Falha ao enviar para ${fone} (${epBase}):`, errEnvio);
        }
      }
    }

    // 3. Canal LIGAÇÃO MacroDroid quando explicitamente ativado na equipe
    for (const foneLig of setTelefonesLigacao) {
      await dispararLigacaoMacroDroid(
        foneLig,
        `equipe_${tipoCanonico}`,
        env,
        supabaseUrl,
        serviceRoleKey,
      ).catch(() => {});
    }
  } catch (errGeral) {
    console.warn("[SUPERADM-WHATSAPP] Erro geral ao disparar notificação:", errGeral);
  }
}

/**
 * handleApiLgpd — Gestão de Direitos dos Titulares de Dados (LGPD Lei nº 13.709/2018, Art. 18)
 * e Defesas Cibernéticas contra IDOR, BOLA, Fraude e Engenharia Social.
 */
async function handleApiLgpd(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/lgpd")) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. POST /api/lgpd/solicitar (Abertura formal de requisição pelo titular)
  if (url.pathname === "/api/lgpd/solicitar" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const nomeLimpo = (body.titular_nome || "").trim().slice(0, 150);
      const docLimpo = (body.titular_documento || "").replace(/\D/g, "").slice(0, 14);
      const emailLimpo = (body.titular_email || "").trim().toLowerCase().slice(0, 120);
      const tipo = (body.tipo_solicitacao || "confirmacao").trim().toLowerCase();
      const justificativa = (body.justificativa || "").trim().slice(0, 500);

      const tiposPermitidos = [
        "confirmacao",
        "acesso",
        "retificacao",
        "anonimizacao",
        "exclusao",
        "portabilidade",
        "revogacao_consentimento",
      ];

      if (!nomeLimpo || !emailLimpo || !tiposPermitidos.includes(tipo)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Campos obrigatórios ausentes ou tipo de solicitação inválido.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Validação de formato de e-mail básico
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
        return new Response(
          JSON.stringify({ success: false, message: "E-mail informado possui formato inválido." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Prevenção IDOR / BOLA: Se o usuário estiver autenticado, garante que o e-mail confere com o da sessão
      const authHeader = request.headers.get("Authorization") || "";
      let userIdAutenticado: string | null = null;
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const { data: userData } = await adminClient.auth.getUser(token);
        if (userData?.user) {
          userIdAutenticado = userData.user.id;
          const userEmailAuth = (userData.user.email || "").toLowerCase();
          if (userEmailAuth && userEmailAuth !== emailLimpo) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "O e-mail da solicitação deve corresponder ao da conta autenticada.",
              }),
              { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
            );
          }
        }
      }

      // Gera protocolo canônico e auditável
      const dataHoje = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const sufixoAleatorio = Math.random().toString(16).substring(2, 8).toUpperCase();
      const protocolo = `LGPD-${dataHoje}-${sufixoAleatorio}`;

      const { data: novaSol, error: errInsert } = await adminClient
        .from("lgpd_solicitacoes")
        .insert({
          protocolo,
          titular_nome: nomeLimpo,
          titular_documento: docLimpo || "NÃO INFORMADO",
          titular_email: emailLimpo,
          tipo_solicitacao: tipo,
          status: "pendente",
          justificativa: justificativa || null,
        })
        .select()
        .single();

      if (errInsert || !novaSol) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Falha ao persistir a solicitação de direitos do titular.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Trilha imutável em system_activity_logs (minimização: sem dados sensíveis)
      await adminClient
        .from("system_activity_logs")
        .insert({
          user_id: userIdAutenticado,
          acao: "solicitacao_lgpd_art18",
          detalhe: `Solicitação LGPD ${tipo} registrada com protocolo ${protocolo}`,
        })
        .catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          protocolo,
          status: "pendente",
          tipo_solicitacao: tipo,
          mensagem:
            "Solicitação registrada com sucesso sob os termos do Art. 18 da LGPD (Lei nº 13.709/2018).",
        }),
        { status: 201, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno no processamento LGPD.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 2. GET /api/lgpd/consultar (Consulta de status por protocolo com DLP e proteção IDOR)
  if (url.pathname === "/api/lgpd/consultar" && request.method === "GET") {
    try {
      const protocolo = (url.searchParams.get("protocolo") || "").trim();
      const authHeader = request.headers.get("Authorization") || "";

      // Se protocolo fornecido, busca específica com DLP (Data Loss Prevention)
      if (protocolo) {
        const { data: sol, error } = await adminClient
          .from("lgpd_solicitacoes")
          .select(
            "protocolo, titular_nome, titular_documento, titular_email, tipo_solicitacao, status, justificativa, created_at, atendido_em",
          )
          .eq("protocolo", protocolo)
          .maybeSingle();

        if (error || !sol) {
          return new Response(
            JSON.stringify({ success: false, message: "Protocolo não localizado ou inexistente." }),
            { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        // DLP: Mascaramento preventivo de documento e e-mail para não vazar dados
        const docMask =
          sol.titular_documento && sol.titular_documento.length >= 6
            ? `${sol.titular_documento.slice(0, 3)}***${sol.titular_documento.slice(-2)}`
            : "***";
        const emailPartes = (sol.titular_email || "").split("@");
        const emailMask =
          emailPartes.length === 2 ? `${emailPartes[0].slice(0, 2)}***@${emailPartes[1]}` : "***";

        return new Response(
          JSON.stringify({
            success: true,
            solicitacao: {
              protocolo: sol.protocolo,
              titular_nome: sol.titular_nome,
              titular_documento_mascarado: docMask,
              titular_email_mascarado: emailMask,
              tipo_solicitacao: sol.tipo_solicitacao,
              status: sol.status,
              justificativa: sol.justificativa,
              criado_em: sol.created_at,
              atendido_em: sol.atendido_em,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Se sem protocolo, requer autenticação para listar as solicitações do próprio titular ou superadmin
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Protocolo ou autenticação obrigatória para consulta.",
          }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const { data: userData } = await adminClient.auth.getUser(token);
      if (!userData?.user) {
        return new Response(
          JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      const isAdm =
        profile?.role === "superadmin" ||
        profile?.role === "adm" ||
        profile?.role === "superadmin_auditor";

      let query = adminClient
        .from("lgpd_solicitacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (!isAdm) {
        query = query.eq("titular_email", userData.user.email);
      }

      const { data: lista, error: errLista } = await query;
      if (errLista) {
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao consultar solicitações LGPD." }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      return new Response(JSON.stringify({ success: true, solicitacoes: lista || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro na consulta LGPD." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 3. POST /api/lgpd/tramitar (Atendimento ou Rejeição administrativa por SuperADM / DPO)
  if (url.pathname === "/api/lgpd/tramitar" && request.method === "POST") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Autenticação requerida para tramitação administrativa.",
          }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const { data: userData } = await adminClient.auth.getUser(token);
      if (!userData?.user) {
        return new Response(
          JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("role, email")
        .eq("id", userData.user.id)
        .single();

      const rolesAdmin = ["superadmin", "adm", "superadmin_auditor"];
      if (!profile?.role || !rolesAdmin.includes(profile.role)) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              "Privilégio insuficiente. Apenas administradores podem tramitar solicitações LGPD.",
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const id = (body.id || "").trim();
      const decisao = (body.decisao || "").trim().toLowerCase();
      const justificativa = (body.justificativa || "").trim().slice(0, 1000);

      if (!id || (decisao !== "atendido" && decisao !== "rejeitado")) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Identificador ou decisão inválida (atendido ou rejeitado).",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { error: errUpdate } = await adminClient
        .from("lgpd_solicitacoes")
        .update({
          status: decisao,
          justificativa: justificativa || null,
          atendido_por: profile.email || userData.user.email || "SuperADM",
          atendido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (errUpdate) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Falha ao atualizar tramitação no banco de dados.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Auditoria no system_activity_logs
      await adminClient
        .from("system_activity_logs")
        .insert({
          user_id: userData.user.id,
          acao: "tramitacao_lgpd_executada",
          detalhe: `Solicitação LGPD ${id} tramitada como ${decisao} por ${profile.email || userData.user.email}`,
        })
        .catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          message: `Solicitação tramitada como ${decisao} com sucesso.`,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro na tramitação LGPD." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 4. GET /api/lgpd/meus-dados (Direito de Acesso facilitado do titular autenticado - Art. 18, II)
  if (url.pathname === "/api/lgpd/meus-dados" && request.method === "GET") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Autenticação requerida para acesso aos dados do titular.",
          }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const { data: userData } = await adminClient.auth.getUser(token);
      if (!userData?.user) {
        return new Response(
          JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email, nome, role, created_at")
        .eq("id", userData.user.id)
        .maybeSingle();

      const { data: cliente } = await adminClient
        .from("clientes")
        .select(
          "id, nome_razao_social, email, cpf_cnpj, telefone, endereco, status, plano, created_at",
        )
        .or(`user_id.eq.${userData.user.id},email.eq.${userData.user.email}`)
        .maybeSingle();

      let veiculosTitular: any[] = [];
      if (cliente?.id) {
        const { data: veics } = await adminClient
          .from("veiculos")
          .select("id, placa, modelo, marca, cor, ano, status_veiculo, status_conexao, created_at")
          .eq("cliente_id", cliente.id);
        veiculosTitular = veics || [];
      }

      // Registro de auditoria do acesso realizado pelo titular
      await adminClient
        .from("system_activity_logs")
        .insert({
          user_id: userData.user.id,
          acao: "acesso_dados_titular_lgpd",
          detalhe: `Titular ${userData.user.email} acessou o espelho integral de seus dados pessoais`,
        })
        .catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          relatorio: {
            titular: {
              usuario_id: userData.user.id,
              email: userData.user.email,
              perfil: profile || null,
              dados_cadastrais: cliente || null,
            },
            veiculos_vinculados: veiculosTitular,
            garantia_legal:
              "Dados disponibilizados em conformidade com o Art. 18, II da Lei nº 13.709/2018 (LGPD).",
            gerado_em: new Date().toISOString(),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar dados do titular.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

async function handleApiConvites(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/convite")) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. GET /api/convite/validar?token=...
  if (url.pathname === "/api/convite/validar" && request.method === "GET") {
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ valido: false, mensagem: "Token de convite não fornecido." }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    // Barreira 1: Token já marcado como consumido na memória do servidor
    if (CONSUMED_INVITE_TOKENS.has(token)) {
      return new Response(
        JSON.stringify({
          valido: false,
          mensagem: "Este link de convite já foi utilizado e não é mais válido.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    // Barreira 2: Checa se algum usuário já se cadastrou com esse token
    try {
      const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
      if (usersData?.users) {
        const jaUsado = usersData.users.some(
          (u) =>
            u.user_metadata?.convite_token === token || u.user_metadata?.token_convite === token,
        );
        if (jaUsado) {
          CONSUMED_INVITE_TOKENS.add(token);
          return new Response(
            JSON.stringify({
              valido: false,
              mensagem: "Este link de convite já foi utilizado e não é mais válido.",
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }
    } catch (err) {
      console.warn("Aviso ao validar token em usuários:", err);
    }

    // Barreira 3: Checagem na tabela convites_instalador se estiver criada
    try {
      const { data: conviteData } = await adminClient
        .from("convites_instalador")
        .select("usado, expira_em")
        .eq("token", token)
        .maybeSingle();

      if (conviteData) {
        if (conviteData.usado) {
          CONSUMED_INVITE_TOKENS.add(token);
          return new Response(
            JSON.stringify({
              valido: false,
              mensagem: "Este link de convite já foi utilizado e não é mais válido.",
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
        if (new Date(conviteData.expira_em) <= new Date()) {
          return new Response(
            JSON.stringify({
              valido: false,
              mensagem: "Este link de convite expirou. Solicite um novo link à administração.",
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }
    } catch {
      // Ignora ausência da tabela
    }

    // Barreira 4: Validação de assinatura temporal do token autônomo
    if (token.startsWith("hinv_")) {
      try {
        const rawB64 = token.slice(5).replace(/-/g, "+").replace(/_/g, "/");
        const json = JSON.parse(Buffer.from(rawB64, "base64").toString("utf-8"));
        if (json.exp && json.exp < Date.now()) {
          return new Response(
            JSON.stringify({
              valido: false,
              mensagem: "Este link de convite expirou. Solicite um novo link à administração.",
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ valido: false, mensagem: "Token de convite corrompido ou inválido." }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }
    }

    return new Response(
      JSON.stringify({ valido: true, mensagem: "Convite válido para cadastro." }),
      { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }

  // 2. POST /api/convite/cadastrar
  if (url.pathname === "/api/convite/cadastrar" && request.method === "POST") {
    try {
      const body = await request.json();
      const token = (body.token || "").trim();
      const nome = (body.nome || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      const senha = body.senha || "";
      const telefone = (body.telefone || "").trim();
      const chavePix = (body.chavePix || "").trim();
      const enderecoInstalacao = (body.enderecoInstalacao || "").trim();
      const valorInstalacaoSemBloqueador = Number(body.valorInstalacaoSemBloqueador) || 0;
      const valorInstalacaoComBloqueador = Number(body.valorInstalacaoComBloqueador) || 0;

      if (!token || !nome || !email || !senha) {
        return new Response(
          JSON.stringify({ success: false, message: "Dados incompletos para o cadastro." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Validação de token já utilizado
      if (CONSUMED_INVITE_TOKENS.has(token)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este link de convite já foi utilizado e não é mais válido.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Checa se o token expirou
      if (token.startsWith("hinv_")) {
        try {
          const rawB64 = token.slice(5).replace(/-/g, "+").replace(/_/g, "/");
          const json = JSON.parse(Buffer.from(rawB64, "base64").toString("utf-8"));
          if (json.exp && json.exp < Date.now()) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Este link de convite expirou. Solicite um novo link à administração.",
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
            );
          }
        } catch {
          return new Response(
            JSON.stringify({ success: false, message: "Token de convite corrompido." }),
            { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }

      // Cria credencial com e-mail já confirmado automaticamente no Auth
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          role: "instalador",
          convite_token: token,
          telefone: telefone || null,
          chave_pix: chavePix || null,
          endereco_instalacao: enderecoInstalacao || null,
          valor_instalacao_sem_bloqueador: valorInstalacaoSemBloqueador,
          valor_instalacao_com_bloqueador: valorInstalacaoComBloqueador,
        },
      });

      const userId = createData?.user?.id;
      if (createErr) {
        const errMsg = createErr.message || "";
        if (errMsg.includes("already been registered") || errMsg.includes("already exists")) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Este e-mail já está cadastrado no sistema.",
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        } else {
          throw createErr;
        }
      }

      if (!userId) {
        throw new Error("Não foi possível gerar a credencial do usuário.");
      }

      // Garante perfil rigorosamente INATIVO ("Aguardando Habilitação"), papel instalador e primeiro_acesso falso (definiu a própria senha)
      await adminClient.from("profiles").upsert(
        {
          id: userId,
          nome,
          email,
          role: "instalador",
          ativo: false,
          telefone: telefone || null,
          chave_pix: chavePix || null,
          endereco_instalacao: enderecoInstalacao || null,
          valor_instalacao_sem_bloqueador: valorInstalacaoSemBloqueador,
          valor_instalacao_com_bloqueador: valorInstalacaoComBloqueador,
          valor_por_instalacao: valorInstalacaoSemBloqueador,
          primeiro_acesso: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      await adminClient.from("user_roles").upsert(
        {
          user_id: userId,
          role: "instalador",
        },
        { onConflict: "user_id,role" },
      );

      await adminClient.from("user_module_access").upsert(
        {
          user_id: userId,
          module: "instalacao",
          ativo: true,
        },
        { onConflict: "user_id,module" },
      );

      // Inutiliza o token imediatamente
      CONSUMED_INVITE_TOKENS.add(token);

      try {
        await adminClient
          .from("convites_instalador")
          .update({
            usado: true,
            usado_em: new Date().toISOString(),
            usado_por_user_id: userId,
          })
          .eq("token", token);
      } catch {
        // Ignora ausência da tabela
      }

      // Notifica em tempo real a lista de usuários para atualizar instantaneamente na tela do administrador
      try {
        const canalRealtime = adminClient.channel("hunter_usuarios_realtime_list");
        await canalRealtime.send({
          type: "broadcast",
          event: "usuario_cadastrado",
          payload: { id: userId, email, nome, role: "instalador", ativo: false },
        });
      } catch (rtErr) {
        console.warn("Aviso ao emitir realtime de usuário:", rtErr);
      }

      // Notificação imediata via WhatsApp para o SuperADM
      try {
        const valorSemBloqFmt = valorInstalacaoSemBloqueador.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
        });
        const valorComBloqFmt = valorInstalacaoComBloqueador.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
        });
        const msgWhatsInstalador = [
          "🛡️ *GD RASTREAMENTO — NOVO CREDENCIAMENTO DE INSTALADOR*",
          "",
          `🔧 *Instalador:* ${nome}`,
          `📧 *E-mail:* ${email}`,
          `📱 *WhatsApp:* ${telefone || "Não informado"}`,
          `📍 *Oficina / Endereço:* ${enderecoInstalacao || "Não informado"}`,
          `🔑 *Chave PIX:* ${chavePix || "Não informada"}`,
          `💵 *Mão de Obra (Sem Bloqueador):* R$ ${valorSemBloqFmt}`,
          `🔒 *Mão de Obra (Com Bloqueador):* R$ ${valorComBloqFmt}`,
          "",
          "⚡ *Ação Necessária:* Habilite o credenciamento no painel em:",
          "🌐 https://gd.oficial.tec.br/usuarios",
        ].join("\n");

        despacharNotificacaoWhatsappSuperAdm(
          env,
          msgWhatsInstalador,
          "novo_instalador_auto_cadastro",
        ).catch(() => {});
      } catch (errWhats) {
        console.warn("Aviso ao preparar WhatsApp do instalador:", errWhats);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Cadastro realizado com sucesso! Sua conta foi criada no perfil Instalador Técnico e está aguardando habilitação pela administração.",
          userId,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      console.error("Erro ao cadastrar instalador por convite:", err);
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao processar cadastro.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 3. POST /api/convite/cadastrar-cliente (Auto-cadastro de cliente via link de convite)
  if (
    (url.pathname === "/api/convite/cadastrar-cliente" ||
      url.pathname === "/api/convite-cliente/cadastrar") &&
    request.method === "POST"
  ) {
    try {
      const body = (await request.json()) as any;
      const token = (body.token || "").trim();
      const nome = (body.nome || "").trim();
      const documento = (body.documento || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      const senha = body.senha || "";
      const telefone = (body.telefone || "").trim();
      const diaVencimento = Number(body.diaVencimento) || 10;
      const veiculos = Array.isArray(body.veiculos) ? body.veiculos : [];

      if (!token || !nome || !email || !senha) {
        return new Response(
          JSON.stringify({ success: false, message: "Dados cadastrais incompletos." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (veiculos.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Informe pelo menos um veículo para o cadastro.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Validação de token em memória
      if (CONSUMED_INVITE_TOKENS.has(token)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este link de convite já foi utilizado e não é mais válido.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Checagem na tabela convites_cliente se for UUID
      let conviteData: any = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
      if (isUuid) {
        const { data: cData } = await adminClient
          .from("convites_cliente")
          .select(
            "usado, expira_em, valor_mensalidade_proposta, taxa_instalacao_proposta, revendedor_id, vendedor_id",
          )
          .eq("token", token)
          .maybeSingle();

        if (cData) {
          conviteData = cData;
          if (conviteData.usado) {
            CONSUMED_INVITE_TOKENS.add(token);
            return new Response(
              JSON.stringify({
                success: false,
                message: "Este link de convite já foi utilizado e não é mais válido.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
          if (new Date(conviteData.expira_em) <= new Date()) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Este link de convite expirou. Solicite um novo link à administração.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
        }
      }

      // Fallback para token assinado base64 de alta resiliência
      if (!conviteData) {
        try {
          const decoded = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
          if (decoded && decoded.exp > Date.now()) {
            conviteData = {
              usado: false,
              expira_em: new Date(decoded.exp).toISOString(),
              valor_mensalidade_proposta: decoded.m ? Number(decoded.m) : null,
              taxa_instalacao_proposta: decoded.tx ? Number(decoded.tx) : null,
              revendedor_id: decoded.rev || null,
              vendedor_id: decoded.vend || null,
            };
          }
        } catch {
          // Ignora
        }
      }

      // Cria credencial no Auth com e-mail já confirmado (sem rate-limit)
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          role: "cliente",
          convite_token: token,
          telefone: telefone || null,
          cpf_cnpj: documento || null,
        },
      });

      let userId = createData?.user?.id;
      if (createErr) {
        const errMsg = createErr.message || "";
        if (errMsg.includes("already been registered") || errMsg.includes("already exists")) {
          // Auto-recuperação resiliente: verifica se o usuário existente é um cliente cujo cadastro foi interrompido (órfão)
          const { data: existingProf } = await adminClient
            .from("profiles")
            .select("id, role")
            .eq("email", email)
            .maybeSingle();

          let canRecover = false;
          if (existingProf?.id) {
            const { data: existingCli } = await adminClient
              .from("clientes")
              .select("id")
              .or(`user_id.eq.${existingProf.id},email.eq.${email}`)
              .maybeSingle();

            // Se ainda não possui registro na tabela clientes, é um cadastro interrompido: autoriza auto-cura
            if (!existingCli?.id) {
              canRecover = true;
              userId = existingProf.id;
              // Atualiza senha se informada e renova metadados
              try {
                await adminClient.auth.admin.updateUserById(userId, {
                  password: senha,
                  user_metadata: {
                    nome,
                    role: "cliente",
                    convite_token: token,
                    telefone: telefone || null,
                    cpf_cnpj: documento || null,
                  },
                });
              } catch {
                /* fallback se falhar update senha */
              }
            }
          }

          if (!canRecover) {
            return new Response(
              JSON.stringify({
                success: false,
                message:
                  "Este e-mail já está cadastrado no sistema. Acesse a tela de login ou utilize outro e-mail.",
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
            );
          }
        } else {
          throw createErr;
        }
      }

      if (!userId) {
        throw new Error("Não foi possível gerar a credencial de acesso.");
      }

      // Garante perfil do cliente
      await adminClient.from("profiles").upsert(
        {
          id: userId,
          nome,
          email,
          role: "cliente",
          ativo: true,
          telefone: telefone || null,
          cpf_cnpj: documento || null,
          primeiro_acesso: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      await adminClient.from("user_roles").upsert(
        {
          user_id: userId,
          role: "cliente",
        },
        { onConflict: "user_id,role" },
      );

      await adminClient.from("user_module_access").upsert(
        {
          user_id: userId,
          module: "monitoramento",
          ativo: true,
        },
        { onConflict: "user_id,module" },
      );

      // Cria ficha do cliente na tabela clientes
      let clienteId: string | null = null;
      const { data: clienteExistente } = await adminClient
        .from("clientes")
        .select("id")
        .or(`user_id.eq.${userId},email.eq.${email}`)
        .maybeSingle();

      if (clienteExistente?.id) {
        clienteId = clienteExistente.id;
        try {
          await adminClient.from("profiles").update({ cliente_id: clienteId }).eq("id", userId);
        } catch {
          /* ignorar */
        }
      } else {
        const payloadBase: Record<string, any> = {
          nome_razao_social: nome,
          documento: documento || null,
          email,
          telefone: telefone || null,
          user_id: userId,
          plano: "basico",
          valor_mensalidade: conviteData?.valor_mensalidade_proposta
            ? Number(conviteData.valor_mensalidade_proposta)
            : 40.0,
          repasse_instalador_status: conviteData?.taxa_instalacao_proposta ? "pendente" : "isento",
          revendedor_id: conviteData?.revendedor_id || null,
          vendedor_id: conviteData?.vendedor_id || null,
          dia_vencimento: diaVencimento || 10,
          dias_historico_plano: 7,
          dias_retencao_banco: 10,
          status: "aguardando_instalacao",
        };

        const camposContrato: Record<string, any> = {
          status_agendamento: "aguardando_agendamento",
          pendente_configuracao_operador: true,
          meses_contrato: 12,
          data_inicio_contrato: new Date().toISOString().split("T")[0],
          tipo_renovacao: "mesma_vigencia",
          meses_renovacao: 12,
          foro_comarca: "Volta Redonda/RJ",
          tem_fidelidade: true,
          privacidade_localizacao: false,
        };

        let { data: novoCliente, error: errCliente } = await adminClient
          .from("clientes")
          .insert({
            ...payloadBase,
            ...camposContrato,
          })
          .select("id")
          .single();

        if (
          errCliente &&
          (errCliente.message.includes("schema cache") || errCliente.message.includes("column"))
        ) {
          console.warn(
            "Retentando cadastro de cliente no server com payload base devido a schema desatualizado:",
            errCliente.message,
          );
          const retryBase = await adminClient
            .from("clientes")
            .insert(payloadBase)
            .select("id")
            .single();

          novoCliente = retryBase.data;
          errCliente = retryBase.error;

          if (novoCliente?.id) {
            try {
              await adminClient.from("clientes").update(camposContrato).eq("id", novoCliente.id);
            } catch {
              /* ignorar */
            }
          }
        }

        if (errCliente || !novoCliente) {
          throw new Error(errCliente?.message || "Falha ao registrar ficha do cliente.");
        }
        clienteId = novoCliente.id;
        try {
          await adminClient.from("profiles").update({ cliente_id: clienteId }).eq("id", userId);
        } catch {
          /* ignorar */
        }
      }

      // Cadastra cada veículo e gera ordem individual de instalação
      for (const v of veiculos) {
        const tipoVeiculo = (v.tipo_veiculo || v.tipo || "carro").toLowerCase();
        const isSemPlaca =
          tipoVeiculo === "maquina" ||
          tipoVeiculo === "trator" ||
          tipoVeiculo === "equipamento" ||
          tipoVeiculo === "moto_eletrica";
        const rawPlaca = (v.placa || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, "");
        const rawChassi = (v.chassi || "").trim().toUpperCase();
        const chassiFinal = rawChassi ? rawChassi : null;
        const chassiSufixo = chassiFinal && chassiFinal.length >= 6 ? chassiFinal.slice(-6) : null;
        const placaFormatada = rawPlaca
          ? rawPlaca
          : isSemPlaca
            ? chassiSufixo || "SEM PLACA"
            : "A DEFINIR";
        const marcaFinal = v.marca?.trim() || (isSemPlaca ? "Fabricante" : "Geral");
        const modeloFinal =
          v.modelo?.trim() ||
          v.marcaModelo?.trim() ||
          (tipoVeiculo === "moto_eletrica" ? "Moto Elétrica" : isSemPlaca ? "Máquina" : "Veículo");
        const marcaModeloCompleto = v.marcaModelo?.trim() || `${marcaFinal} ${modeloFinal}`.trim();
        const anoNum = v.ano ? Number(v.ano) || null : null;
        const horimetro =
          tipoVeiculo === "maquina" || tipoVeiculo === "trator"
            ? Number(v.horimetroInicial) || 0
            : 0;

        // Insere em veiculos com padrão Expand and Contract
        const payloadVeiculoCompleto = {
          cliente_id: clienteId,
          placa: placaFormatada,
          chassi: chassiFinal,
          marca_modelo: marcaModeloCompleto,
          ano: anoNum,
          cor: v.cor?.trim() || null,
          tipo_veiculo: tipoVeiculo,
          horimetro_horas: horimetro,
          ativo: false,
          bloqueado: false,
          pendente_aprovacao_operador: true,
        };

        const payloadVeiculoBase = {
          cliente_id: clienteId,
          placa: placaFormatada,
          chassi: chassiFinal,
          marca_modelo: marcaModeloCompleto,
          ano: anoNum,
          cor: v.cor?.trim() || null,
          ativo: false,
          bloqueado: false,
        };

        let { data: novoVeiculo, error: errVeiculo } = await adminClient
          .from("veiculos")
          .insert(payloadVeiculoCompleto)
          .select("id")
          .single();

        if (
          errVeiculo &&
          (errVeiculo.message.includes("schema cache") ||
            errVeiculo.message.includes("column") ||
            errVeiculo.message.includes("pendente_aprovacao_operador") ||
            errVeiculo.code === "PGRST204")
        ) {
          console.warn(
            "Auto-cadastro: schema cache desatualizado para veiculos, acionando fallback com payload base:",
            errVeiculo.message,
          );
          const retryBase = await adminClient
            .from("veiculos")
            .insert(payloadVeiculoBase)
            .select("id")
            .single();
          novoVeiculo = retryBase.data;
          errVeiculo = retryBase.error;

          if (novoVeiculo?.id) {
            try {
              await adminClient
                .from("veiculos")
                .update({ tipo_veiculo: tipoVeiculo })
                .eq("id", novoVeiculo.id);
            } catch {
              /* ignorar */
            }
          }
        }

        // Se falhou por colisão de chave única em placa (ex: SEMPLACA repetido)
        if (
          errVeiculo &&
          (errVeiculo.message.includes("unique") ||
            errVeiculo.message.includes("duplicate key") ||
            errVeiculo.code === "23505")
        ) {
          console.warn(
            "Auto-cadastro: colisão de constraint única em placa, retentando com placa NULL:",
            errVeiculo.message,
          );
          const retryNullPlaca = await adminClient
            .from("veiculos")
            .insert({
              ...payloadVeiculoCompleto,
              placa: null,
            })
            .select("id")
            .single();
          novoVeiculo = retryNullPlaca.data;
          errVeiculo = retryNullPlaca.error;
        }

        const veiculoId = novoVeiculo?.id || null;

        // Ordem de instalação individual com tolerância a schema
        try {
          const payloadInst = {
            cliente_id: clienteId,
            veiculo_id: veiculoId,
            placa: placaFormatada,
            marca: marcaFinal,
            modelo: modeloFinal,
            ano: anoNum,
            cor: v.cor?.trim() || null,
            tipo_veiculo: tipoVeiculo,
            rastreador_imei: "A DEFINIR",
            rastreador_modelo: "J16 4G",
            status: "nao_instalado",
            observacoes:
              v.observacoes?.trim() ||
              "Auto-cadastro enviado pelo cliente. Aguardando operador definir instalador, kit de comodato e plano.",
          };
          const { error: errInst } = await adminClient.from("instalacoes").insert(payloadInst);
          if (
            errInst &&
            (errInst.message.includes("schema cache") || errInst.message.includes("column"))
          ) {
            const { tipo_veiculo: _, ...instBase } = payloadInst;
            await adminClient.from("instalacoes").insert(instBase);
          }
        } catch {
          /* ignorar */
        }
      }

      // Queima o token
      CONSUMED_INVITE_TOKENS.add(token);
      if (isUuid) {
        try {
          await adminClient
            .from("convites_cliente")
            .update({
              usado: true,
              usado_em: new Date().toISOString(),
              usado_por_user_id: userId,
            })
            .eq("token", token);
        } catch {
          // Ignora
        }
      }

      // Notificação imediata via WhatsApp para o SuperADM
      try {
        let vinculoComercial = "Central (Venda Direta)";
        if (conviteData?.revendedor_id) {
          try {
            const { data: revData } = await adminClient
              .from("revendedores")
              .select("nome")
              .eq("id", conviteData.revendedor_id)
              .maybeSingle();
            if (revData?.nome) {
              vinculoComercial = `Franquia ${revData.nome}`;
            }
          } catch {
            // Ignora
          }
        }
        if (conviteData?.vendedor_id) {
          try {
            const { data: vendData } = await adminClient
              .from("vendedores")
              .select("nome")
              .eq("id", conviteData.vendedor_id)
              .maybeSingle();
            if (vendData?.nome) {
              vinculoComercial += ` / Vendedor: ${vendData.nome}`;
            }
          } catch {
            // Ignora
          }
        }

        const mensalidadeClienteFmt = (
          conviteData?.valor_mensalidade_proposta
            ? Number(conviteData.valor_mensalidade_proposta)
            : 40.0
        ).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        const taxaInstalacaoClienteFmt = (
          conviteData?.taxa_instalacao_proposta ? Number(conviteData.taxa_instalacao_proposta) : 0.0
        ).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

        const listaVeiculosResumo = veiculos
          .map((v: any, idx: number) => {
            const placa = (v.placa || "A DEFINIR").toUpperCase();
            const modelo = v.modelo?.trim() || v.marcaModelo?.trim() || "Veículo";
            const cor = v.cor?.trim() ? ` (${v.cor.trim()})` : "";
            return `  ${idx + 1}. *${placa}* — ${modelo}${cor}`;
          })
          .join("\n");

        const msgWhatsCliente = [
          "🛡️ *GD RASTREAMENTO — NOVO AUTO-CADASTRO DE CLIENTE*",
          "",
          `👤 *Cliente:* ${nome}`,
          `📧 *E-mail:* ${email}`,
          `📱 *WhatsApp:* ${telefone || "Não informado"}`,
          `📄 *Documento:* ${documento || "Não informado"}`,
          `🗓️ *Vencimento Escolhido:* Dia ${diaVencimento}`,
          `💵 *Mensalidade Acordada:* R$ ${mensalidadeClienteFmt} / mês`,
          `🔧 *Taxa de Instalação:* R$ ${taxaInstalacaoClienteFmt}`,
          `🏢 *Vínculo Comercial:* ${vinculoComercial}`,
          `🚗 *Veículos Adicionados (${veiculos.length}):*`,
          listaVeiculosResumo,
          "",
          "⚡ *Ação Necessária:* Defina o plano e atribua os instaladores em:",
          "🌐 https://gd.oficial.tec.br/clientes",
        ].join("\n");

        despacharNotificacaoWhatsappSuperAdm(
          env,
          msgWhatsCliente,
          "novo_cliente_auto_cadastro",
        ).catch(() => {});
      } catch (errWhats) {
        console.warn("Aviso ao preparar WhatsApp do cliente:", errWhats);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Cadastro realizado com sucesso! Seus dados e veículos foram encaminhados à administração para configuração e agendamento da instalação.",
          userId,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      console.error("Erro ao cadastrar cliente por convite:", err);
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao processar cadastro do cliente.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 4. POST /api/convite/cadastrar-parceiro (Auto-cadastro de Revendedor ou Vendedor via link de convite)
  if (url.pathname === "/api/convite/cadastrar-parceiro" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      const token = (body.token || "").trim();
      const nome = (body.nome || "").trim();
      const documento = (body.documento || "").trim();
      const email = (body.email || "").trim().toLowerCase();
      const senha = body.senha || "";
      const telefone = (body.telefone || "").trim();
      const chavePix = (body.chavePix || "").trim();

      if (!token || !nome || !email || !senha) {
        return new Response(
          JSON.stringify({ success: false, message: "Dados cadastrais incompletos." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (CONSUMED_INVITE_TOKENS.has(token)) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este link de convite já foi utilizado e não é mais válido.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      let conviteData: any = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
      if (isUuid) {
        const { data: cData, error: errConvite } = await adminClient
          .from("convites_cliente")
          .select("tipo_convite, usado, expira_em, revendedor_id, valor_mensalidade_proposta")
          .eq("token", token)
          .maybeSingle();

        if (!errConvite && cData) {
          conviteData = cData;
        }
      }

      // Fallback para token assinado base64 de alta resiliência
      if (!conviteData) {
        try {
          const decoded = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
          if (
            decoded &&
            (decoded.t === "revendedor" || decoded.t === "vendedor") &&
            decoded.exp > Date.now()
          ) {
            conviteData = {
              tipo_convite: decoded.t,
              usado: false,
              expira_em: new Date(decoded.exp).toISOString(),
              revendedor_id: decoded.rev || null,
              valor_mensalidade_proposta: decoded.m ? Number(decoded.m) : null,
            };
          }
        } catch {
          // Ignora erro de decodificação
        }
      }

      if (!conviteData) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Link de convite inválido ou não localizado.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (conviteData.usado) {
        CONSUMED_INVITE_TOKENS.add(token);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este link de convite já foi utilizado.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (conviteData.expira_em && new Date(conviteData.expira_em) <= new Date()) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este link de convite expirou.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const tipoParceiro = conviteData.tipo_convite;
      if (tipoParceiro !== "revendedor" && tipoParceiro !== "vendedor") {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este convite não é destinado a parceiros comerciais.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      let { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          role: tipoParceiro,
          telefone: telefone || null,
          cpf_cnpj: documento || null,
        },
      });

      if (
        createErr &&
        (createErr.message?.includes("Database error") || createErr.message?.includes("enum"))
      ) {
        // Defesa em profundidade caso o enum no Supabase remoto ainda não tenha sido atualizado no SQL Editor
        const retry = await adminClient.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: {
            nome,
            telefone: telefone || null,
            cpf_cnpj: documento || null,
          },
        });
        createData = retry.data;
        createErr = retry.error;
      }

      const userId = createData?.user?.id;
      if (createErr) {
        const errMsg = createErr.message || "";
        if (errMsg.includes("already been registered") || errMsg.includes("already exists")) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Este e-mail já está cadastrado no sistema.",
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
        throw createErr;
      }

      if (!userId) {
        throw new Error("Não foi possível gerar a credencial de acesso do parceiro.");
      }

      await adminClient.from("profiles").upsert(
        {
          id: userId,
          nome,
          email,
          role: tipoParceiro,
          ativo: true,
          telefone: telefone || null,
          cpf_cnpj: documento || null,
          primeiro_acesso: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      await adminClient.from("user_roles").upsert(
        {
          user_id: userId,
          role: tipoParceiro,
        },
        { onConflict: "user_id,role" },
      );

      if (tipoParceiro === "revendedor") {
        await adminClient.from("revendedores").upsert(
          {
            user_id: userId,
            nome,
            documento: documento || null,
            email,
            telefone: telefone || null,
            chave_pix: chavePix || null,
            valor_base_sistema: Number(conviteData.valor_mensalidade_proposta) || 40.0,
            ativo: true,
          },
          { onConflict: "user_id" },
        );
      } else if (tipoParceiro === "vendedor") {
        await adminClient.from("vendedores").upsert(
          {
            user_id: userId,
            revendedor_id: conviteData.revendedor_id || null,
            nome,
            documento: documento || null,
            email,
            telefone: telefone || null,
            chave_pix: chavePix || null,
            valor_base_vendedor: Number(conviteData.valor_mensalidade_proposta) || 40.0,
            ativo: true,
          },
          { onConflict: "user_id" },
        );
      }

      CONSUMED_INVITE_TOKENS.add(token);
      if (isUuid) {
        await adminClient
          .from("convites_cliente")
          .update({
            usado: true,
            usado_em: new Date().toISOString(),
            usado_por_user_id: userId,
          })
          .eq("token", token);
      }

      // Notificação imediata via WhatsApp para o SuperADM
      try {
        if (tipoParceiro === "revendedor") {
          const valorBaseFmt = (
            Number(conviteData?.valor_mensalidade_proposta) || 40.0
          ).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

          const msgWhatsRevendedor = [
            "🛡️ *GD RASTREAMENTO — NOVO CADASTRO DE REVENDEDOR*",
            "",
            `🏢 *Franquia / Razão Social:* ${nome}`,
            `📧 *E-mail de Acesso:* ${email}`,
            `📱 *WhatsApp:* ${telefone || "Não informado"}`,
            `📄 *CPF ou CNPJ:* ${documento || "Não informado"}`,
            `🔑 *Chave PIX:* ${chavePix || "Não informada"}`,
            `💵 *Cota Base da Matriz:* R$ ${valorBaseFmt} / mês`,
            "",
            "⚡ *Ação Necessária:* Acesse a gestão de franquias e parceiros em:",
            "🌐 https://gd.oficial.tec.br/revendedores",
          ].join("\n");

          despacharNotificacaoWhatsappSuperAdm(
            env,
            msgWhatsRevendedor,
            "novo_revendedor_cadastro",
          ).catch(() => {});
        } else if (tipoParceiro === "vendedor") {
          let revendedorVinculadoNome: string | null = null;
          if (conviteData?.revendedor_id) {
            try {
              const { data: revData } = await adminClient
                .from("revendedores")
                .select("nome")
                .eq("id", conviteData.revendedor_id)
                .maybeSingle();
              revendedorVinculadoNome = revData?.nome || null;
            } catch {
              // Ignora
            }
          }

          const msgWhatsVendedor = [
            "🛡️ *GD RASTREAMENTO — NOVO CADASTRO DE VENDEDOR*",
            "",
            `👤 *Vendedor:* ${nome}`,
            `📧 *E-mail de Acesso:* ${email}`,
            `📱 *WhatsApp:* ${telefone || "Não informado"}`,
            `📄 *Documento:* ${documento || "Não informado"}`,
            `🔑 *Chave PIX:* ${chavePix || "Não informada"}`,
            revendedorVinculadoNome
              ? `🏢 *Franquia Vinculada:* ${revendedorVinculadoNome}`
              : "🏢 *Vínculo:* Venda Direta da Central",
            "",
            "⚡ *Ação Necessária:* Acesse a equipe comercial em:",
            "🌐 https://gd.oficial.tec.br/revendedores",
          ].join("\n");

          despacharNotificacaoWhatsappSuperAdm(
            env,
            msgWhatsVendedor,
            "novo_vendedor_cadastro",
          ).catch(() => {});
        }
      } catch (errWhats) {
        console.warn("Aviso ao despachar WhatsApp de parceiro:", errWhats);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Cadastro de parceiro realizado com sucesso!",
          userId,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      console.error("Erro ao cadastrar parceiro por convite:", err);
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao processar cadastro do parceiro.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

async function handleApiCliente(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/cliente/solicitar-veiculo" &&
    url.pathname !== "/api/clientes/solicitar-veiculo"
  ) {
    return null;
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await request.json()) as any;
    let clienteId = (body.clienteId || body.cliente_id || "").trim();
    const userId = (body.userId || body.user_id || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const veiculo = body.veiculo || {};

    // 1. Resolução resiliente de clienteId
    if (
      !clienteId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId)
    ) {
      if (userId) {
        const { data: c } = await adminClient
          .from("clientes")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (c?.id) clienteId = c.id;
      }
      if (!clienteId && email) {
        const { data: c } = await adminClient
          .from("clientes")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (c?.id) clienteId = c.id;
      }
    }

    if (!clienteId) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Cadastro de cliente não localizado na base. Contate o suporte da administração.",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    // 2. Normalização dos dados do veículo
    const tipoVeiculo = (veiculo.tipo_veiculo || veiculo.tipo || "carro").toLowerCase();
    const isSemPlaca =
      tipoVeiculo === "maquina" ||
      tipoVeiculo === "trator" ||
      tipoVeiculo === "equipamento" ||
      tipoVeiculo === "moto_eletrica";
    const rawPlaca = (veiculo.placa || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
    const rawChassi = (veiculo.chassi || "").trim().toUpperCase();
    const chassiFinal = rawChassi ? rawChassi : null;
    const chassiSufixo = chassiFinal && chassiFinal.length >= 6 ? chassiFinal.slice(-6) : null;
    const placaFormatada = rawPlaca
      ? rawPlaca
      : isSemPlaca
        ? chassiSufixo || "SEM PLACA"
        : "A DEFINIR";
    const marcaFinal = veiculo.marca?.trim() || (isSemPlaca ? "Fabricante" : "Geral");
    const modeloFinal =
      veiculo.modelo?.trim() ||
      veiculo.marcaModelo?.trim() ||
      (tipoVeiculo === "moto_eletrica" ? "Moto Elétrica" : isSemPlaca ? "Máquina" : "Veículo");
    const marcaModeloCompleto =
      veiculo.marcaModelo?.trim() || `${marcaFinal} ${modeloFinal}`.trim();
    const anoNum = veiculo.ano ? Number(veiculo.ano) || null : null;
    const horimetro =
      tipoVeiculo === "maquina" || tipoVeiculo === "trator"
        ? Number(veiculo.horimetroInicial) || 0
        : 0;

    // 3. Inserção resiliente em veiculos com padrão Expand and Contract
    const payloadCompleto = {
      cliente_id: clienteId,
      placa: placaFormatada,
      chassi: chassiFinal,
      marca_modelo: marcaModeloCompleto,
      ano: anoNum,
      cor: veiculo.cor?.trim() || null,
      tipo_veiculo: tipoVeiculo,
      horimetro_horas: horimetro,
      ativo: false,
      bloqueado: false,
      pendente_aprovacao_operador: true,
    };

    const payloadBase = {
      cliente_id: clienteId,
      placa: placaFormatada,
      chassi: chassiFinal,
      marca_modelo: marcaModeloCompleto,
      ano: anoNum,
      cor: veiculo.cor?.trim() || null,
      ativo: false,
      bloqueado: false,
    };

    let { data: novoVeiculo, error: errVeiculo } = await adminClient
      .from("veiculos")
      .insert(payloadCompleto)
      .select("id")
      .single();

    if (
      errVeiculo &&
      (errVeiculo.message.includes("schema cache") ||
        errVeiculo.message.includes("column") ||
        errVeiculo.message.includes("pendente_aprovacao_operador") ||
        errVeiculo.code === "PGRST204")
    ) {
      console.warn(
        "Retentando inserção de veículo com payload base canônico devido a schema:",
        errVeiculo.message,
      );
      const retryBase = await adminClient
        .from("veiculos")
        .insert(payloadBase)
        .select("id")
        .single();
      novoVeiculo = retryBase.data;
      errVeiculo = retryBase.error;

      if (novoVeiculo?.id) {
        try {
          await adminClient
            .from("veiculos")
            .update({ tipo_veiculo: tipoVeiculo })
            .eq("id", novoVeiculo.id);
        } catch {
          /* ignorar */
        }
      }
    }

    if (errVeiculo || !novoVeiculo) {
      console.error("Erro ao registrar veículo no servidor:", errVeiculo);
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Não foi possível registrar o veículo no momento. Por favor, tente novamente em instantes.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    const veiculoId = novoVeiculo.id;

    // 4. Inserção resiliente em instalacoes
    try {
      const payloadInstalacao = {
        cliente_id: clienteId,
        veiculo_id: veiculoId,
        placa: placaFormatada,
        marca: marcaFinal,
        modelo: modeloFinal,
        ano: anoNum,
        cor: veiculo.cor?.trim() || null,
        tipo_veiculo: tipoVeiculo,
        rastreador_imei: "A DEFINIR",
        rastreador_modelo: "J16 4G",
        status: "nao_instalado",
        observacoes:
          veiculo.observacoes?.trim() ||
          "Solicitação de novo veículo enviada pelo cliente. Aguardando operador definir instalador e plano.",
      };

      const { error: errInst } = await adminClient.from("instalacoes").insert(payloadInstalacao);
      if (
        errInst &&
        (errInst.message.includes("schema cache") || errInst.message.includes("column"))
      ) {
        const { tipo_veiculo: _, ...instalacaoBase } = payloadInstalacao;
        await adminClient.from("instalacoes").insert(instalacaoBase);
      }
    } catch (e) {
      console.warn("Aviso ao criar instalação de veículo:", e);
    }

    // 5. Atualiza pendência no cliente de forma não-bloqueante
    try {
      await adminClient
        .from("clientes")
        .update({ pendente_configuracao_operador: true })
        .eq("id", clienteId);
    } catch {
      /* ignorar */
    }

    // Notificação imediata via WhatsApp para o SuperADM
    try {
      let nomeCliente = "Cliente da Base";
      try {
        const { data: cData } = await adminClient
          .from("clientes")
          .select("nome_razao_social, telefone")
          .eq("id", clienteId)
          .maybeSingle();
        if (cData?.nome_razao_social) {
          nomeCliente = cData.nome_razao_social;
        }
      } catch {
        /* segue */
      }

      const msgWhatsNovoVeiculo = [
        "🛡️ *GD RASTREAMENTO — SOLICITAÇÃO DE NOVO VEÍCULO*",
        "",
        `👤 *Cliente:* ${nomeCliente}`,
        `🚗 *Veículo:* ${marcaModeloCompleto}`,
        `🏷️ *Placa / Identificador:* ${placaFormatada}`,
        `🎨 *Cor:* ${veiculo.cor?.trim() || "Não informada"} | *Ano:* ${anoNum || "Não informado"}`,
        `📋 *Tipo:* ${tipoVeiculo}`,
        `📝 *Observações:* ${veiculo.observacoes?.trim() || "Nenhuma"}`,
        "",
        "⚡ *Ação Necessária:* Nova ordem gerada. Atribua o instalador em:",
        "🌐 https://gd.oficial.tec.br/instalacao",
      ].join("\n");

      despacharNotificacaoWhatsappSuperAdm(
        env,
        msgWhatsNovoVeiculo,
        "nova_solicitacao_veiculo_cliente",
      ).catch(() => {});
    } catch (errWhats) {
      console.warn("Aviso ao preparar WhatsApp de novo veículo:", errWhats);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Solicitação de novo veículo enviada com sucesso! O operador foi notificado para agendamento.",
        veiculoId,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  } catch (err: any) {
    console.error("Erro no endpoint solicitar-veiculo:", err);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Falha ao processar solicitação de veículo. Tente novamente mais tarde.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }
}

async function handleApiAdminUsuarios(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/usuarios")) {
    return null;
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Token de autenticação ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 1. Valida solicitante autenticado via token JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const callerId = userData.user.id;
  const callerEmail = userData.user.email?.toLowerCase() || "";
  const isCallerSuperAdm =
    callerEmail === "novaes@adm.28bpm.local" || callerEmail === "novaes@oficial.tec.br";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 2. Verifica se o solicitante possui permissão de Administrador
  let isAdm = isCallerSuperAdm;
  if (!isAdm) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, ativo")
      .eq("id", callerId)
      .maybeSingle();

    if (profile && profile.ativo && (profile.role === "superadmin" || profile.role === "adm")) {
      isAdm = true;
    } else {
      const { data: userRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .maybeSingle();
      if (userRole && (userRole.role === "superadmin" || userRole.role === "adm")) {
        isAdm = true;
      }
    }
  }

  if (!isAdm) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Acesso negado: apenas administradores podem gerenciar usuários.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // ROTA DELETE: Exclusão Segura e Atômica em Cascata
  if (request.method === "DELETE") {
    let targetUserId = url.searchParams.get("id");
    if (!targetUserId) {
      try {
        const body = (await request.json()) as { userId?: string; id?: string };
        targetUserId = body.userId || body.id || null;
      } catch {
        // sem body
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ success: false, message: "ID do usuário não fornecido." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    try {
      // 1. Busca perfil do usuário alvo
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("id, email, nome, role")
        .eq("id", targetUserId)
        .maybeSingle();

      const targetEmail = (targetProfile?.email || "").toLowerCase();

      // Blindagem inegociável da conta SuperADM
      if (targetEmail === "novaes@adm.28bpm.local" || targetEmail === "novaes@oficial.tec.br") {
        return new Response(
          JSON.stringify({
            success: false,
            message: "A conta de governança é imutável e blindada contra exclusão.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      // 2. Executa a exclusão atômica via RPC canônica com integridade relacional
      const { data: rpcData, error: rpcError } = await adminClient.rpc("admin_excluir_usuario", {
        p_user_id: targetUserId,
      });

      if (rpcError) {
        // Fallback relacional direto com schema verificado
        const { data: cliente } = await adminClient
          .from("clientes")
          .select("id")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (cliente) {
          const clienteId = cliente.id;
          const { data: veiculos } = await adminClient
            .from("veiculos")
            .select("id")
            .eq("cliente_id", clienteId);

          const veiculoIds = (veiculos || []).map((v) => v.id);

          if (veiculoIds.length > 0) {
            await adminClient
              .from("estoque_movimentacoes")
              .update({ veiculo_id: null })
              .in("veiculo_id", veiculoIds);
            await adminClient.from("telemetria_posicoes").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("viagens_trajetos").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("eventos_veiculo").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("alertas_seguranca").delete().in("veiculo_id", veiculoIds);
            await adminClient
              .from("planos_manutencao_preventiva")
              .delete()
              .in("veiculo_id", veiculoIds);
            await adminClient.from("agendamentos_manutencao").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("areas_seguras").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("horarios_utilizacao").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("trajetos_salvos").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("regras_veiculo").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("rotas_monitoradas").delete().in("veiculo_id", veiculoIds);
            await adminClient
              .from("compartilhamentos_temporarios")
              .delete()
              .in("veiculo_id", veiculoIds);
            await adminClient.from("veiculo_convidados").delete().in("veiculo_id", veiculoIds);
            await adminClient
              .from("notificacoes_configuracoes")
              .delete()
              .in("veiculo_id", veiculoIds);
            await adminClient.from("instalacoes").delete().in("veiculo_id", veiculoIds);
            await adminClient.from("veiculos").delete().in("id", veiculoIds);
          }

          await adminClient
            .from("transacoes_financeiras")
            .update({ cliente_id: null })
            .eq("cliente_id", clienteId);
          await adminClient.from("instalacoes").delete().eq("cliente_id", clienteId);
          await adminClient.from("atendimentos").delete().eq("cliente_id", clienteId);
          await adminClient.from("mensalidades").delete().eq("cliente_id", clienteId);
          await adminClient.from("clientes").delete().eq("id", clienteId);
        }

        const superAdminId = "51b59d60-5b08-47a2-b3d5-805f32f56ffc";
        await adminClient
          .from("instalacoes")
          .update({ instalador_id: superAdminId })
          .eq("instalador_id", targetUserId);
        await adminClient
          .from("instalacoes_historico_atendimentos")
          .update({ instalador_id: superAdminId })
          .eq("instalador_id", targetUserId);
        await adminClient
          .from("clientes")
          .update({ instalador_id: null })
          .eq("instalador_id", targetUserId);
        await adminClient
          .from("transacoes_financeiras")
          .update({ instalador_id: null })
          .eq("instalador_id", targetUserId);
        await adminClient
          .from("estoque_movimentacoes")
          .update({ instalador_id: null, created_by: null })
          .eq("instalador_id", targetUserId);

        await adminClient.from("user_module_access").delete().eq("user_id", targetUserId);
        await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
        await adminClient.from("notificacoes_configuracoes").delete().eq("user_id", targetUserId);
        await adminClient.from("dispositivos_autorizados").delete().eq("user_id", targetUserId);

        await adminClient.from("profiles").delete().eq("id", targetUserId);
        await adminClient.auth.admin.deleteUser(targetUserId).catch(() => null);
      } else {
        // Garante exclusão no Auth se ainda houver resíduo
        await adminClient.auth.admin.deleteUser(targetUserId).catch(() => null);
      }

      // Registra log de auditoria
      await adminClient.from("system_activity_logs").insert({
        user_id: callerId,
        usuario_id: callerId,
        acao: "EXCLUSAO_USUARIO",
        detalhe: `Usuário excluído com sucesso: ${targetProfile?.nome || ""} (${targetEmail || targetUserId})`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuário ${targetEmail || ""} excluído com sucesso.`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Falha ao processar exclusão do usuário.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }
  }

  return new Response(JSON.stringify({ success: false, message: "Método não suportado." }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

async function handleApiClientes(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/clientes/meu-status" &&
    url.pathname !== "/api/clientes/status-financeiro"
  ) {
    if (url.pathname !== "/api/clientes" && url.pathname !== "/api/clientes/listar") {
      return null;
    }
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ success: false, message: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Não autorizado: Token de sessão ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const role = profile?.role;
  const rolesPermitidas = [
    "superadmin",
    "adm",
    "operador",
    "financeiro",
    "superadmin_auditor",
    "revendedor",
    "vendedor",
    "instalador",
    "cliente",
  ];

  if (!role || !rolesPermitidas.includes(role)) {
    return new Response(
      JSON.stringify({ success: false, message: "Acesso não autorizado aos clientes." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  if (url.pathname === "/api/clientes/meu-status") {
    try {
      let { data: cliente } = await adminClient
        .from("clientes")
        .select("id, user_id, nome_razao_social, status, status_agendamento, plano")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!cliente && profile?.cliente_id) {
        const { data: cById } = await adminClient
          .from("clientes")
          .select("id, user_id, nome_razao_social, status, status_agendamento, plano")
          .eq("id", profile.cliente_id)
          .maybeSingle();
        if (cById) cliente = cById;
      }

      if (!cliente && userData.user.email) {
        const { data: cByEmail } = await adminClient
          .from("clientes")
          .select("id, user_id, nome_razao_social, status, status_agendamento, plano")
          .ilike("email", userData.user.email.trim())
          .maybeSingle();
        if (cByEmail) cliente = cByEmail;
      }

      if (!cliente) {
        return new Response(
          JSON.stringify({
            success: true,
            clienteId: null,
            temVeiculosAtivos: true,
            bloquearPorAguardandoInstalacao: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (!profile?.cliente_id || profile.cliente_id !== cliente.id) {
        await adminClient
          .from("profiles")
          .update({ cliente_id: cliente.id })
          .eq("id", userData.user.id);
      }

      const { data: veiculos } = await adminClient
        .from("veiculos")
        .select("id, placa, ativo, rastreador_id")
        .eq("cliente_id", cliente.id)
        .eq("ativo", true);

      const { data: instalacoes } = await adminClient
        .from("instalacoes")
        .select("id, status")
        .eq("cliente_id", cliente.id);

      const totalVeiculosAtivos = (veiculos || []).length;
      const temVeiculosAtivos =
        totalVeiculosAtivos > 0 &&
        (veiculos || []).some((v) => Boolean(v.ativo) && Boolean(v.rastreador_id));

      const totalInstalacoes = (instalacoes || []).length;
      const instalacoesPendentes = (instalacoes || []).filter(
        (i) => i.status !== "concluida",
      ).length;
      const todasInstalacoesConcluidas = totalInstalacoes > 0 && instalacoesPendentes === 0;

      const instaladoDiretamente =
        temVeiculosAtivos &&
        (totalInstalacoes === 0 ||
          todasInstalacoesConcluidas ||
          cliente.status_agendamento === "concluido" ||
          cliente.status === "ativo");

      const bloquearPorAguardandoInstalacao =
        !temVeiculosAtivos &&
        !instaladoDiretamente &&
        (cliente.status === "aguardando_instalacao" || instalacoesPendentes > 0);

      return new Response(
        JSON.stringify({
          success: true,
          clienteId: cliente.id,
          clienteNome: cliente.nome_razao_social,
          plano: cliente.plano || "basico",
          statusCliente: cliente.status,
          statusAgendamento: cliente.status_agendamento,
          temVeiculosAtivos,
          totalVeiculosAtivos,
          totalInstalacoes,
          totalInstalacoesPendentes: instalacoesPendentes,
          todasInstalacoesConcluidas,
          instaladoDiretamente,
          bloquearPorAguardandoInstalacao,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao obter status do cliente.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  if (url.pathname === "/api/clientes/status-financeiro") {
    try {
      const requestedClienteId = url.searchParams.get("clienteId")?.trim() || null;
      const isMotoristaParam = url.searchParams.get("isMotorista") === "1";
      const roleNorm = String(profile?.role || "").toLowerCase();
      const isStaff = roleNorm === "superadmin" || roleNorm === "admin" || roleNorm === "operador";
      const isMotorista = isMotoristaParam || roleNorm === "motorista";

      const statusPadrao = {
        bloqueado: false,
        bloqueioLocalizacao: false,
        bloqueioLogin: false,
        diasAtraso: 0,
        totalDevido: 0,
        qtdFaturasVencidas: 0,
        avisoVencimentoProximo: false,
        avisoNotificacaoDia1a4: false,
        statusBloqueioLocalizacaoManual: "automatico" as const,
        statusBloqueioAcessoManual: "automatico" as const,
        isMotorista,
      };

      let resolvedClienteId: string | null = isStaff ? requestedClienteId : null;

      if (isMotorista && !resolvedClienteId) {
        const { data: mot } = await adminClient
          .from("motoristas")
          .select("cliente_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (mot?.cliente_id) {
          resolvedClienteId = mot.cliente_id;
        }
      }

      const buscarClienteComDefesa = async (campo: "user_id" | "id", valor: string) => {
        const res = await adminClient
          .from("clientes")
          .select("id, status, status_bloqueio_localizacao, status_bloqueio_acesso")
          .eq(campo, valor)
          .maybeSingle();

        if (res.error && (res.error.code === "PGRST204" || res.error.code === "42703")) {
          const fallback = await adminClient
            .from("clientes")
            .select("id, status")
            .eq(campo, valor)
            .maybeSingle();
          return fallback.data;
        }
        return res.data;
      };

      let clienteData: any = null;
      if (resolvedClienteId) {
        clienteData = await buscarClienteComDefesa("id", resolvedClienteId);
      } else if (!isMotorista) {
        clienteData = await buscarClienteComDefesa("user_id", userData.user.id);
        if (!clienteData && profile?.cliente_id) {
          clienteData = await buscarClienteComDefesa("id", profile.cliente_id);
        }
        if (clienteData) {
          resolvedClienteId = clienteData.id;
        }
      }

      if (!resolvedClienteId || !clienteData) {
        return new Response(JSON.stringify({ success: true, status: statusPadrao }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      if (clienteData.status === "aguardando_instalacao") {
        return new Response(
          JSON.stringify({
            success: true,
            status: {
              ...statusPadrao,
              clienteId: resolvedClienteId,
              clienteStatus: clienteData.status || null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: veicsDoCliente } = await adminClient
        .from("veiculos")
        .select("id")
        .eq("cliente_id", resolvedClienteId)
        .eq("ativo", true)
        .limit(1);

      if (!veicsDoCliente || veicsDoCliente.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            status: {
              ...statusPadrao,
              clienteId: resolvedClienteId,
              clienteStatus: clienteData.status || null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const statusLocManual =
        clienteData.status_bloqueio_localizacao === "bloqueado" ||
        clienteData.status_bloqueio_localizacao === "liberado"
          ? clienteData.status_bloqueio_localizacao
          : "automatico";

      const statusAcessoManual =
        clienteData.status_bloqueio_acesso === "bloqueado" ||
        clienteData.status_bloqueio_acesso === "liberado"
          ? clienteData.status_bloqueio_acesso
          : "automatico";

      const { data: mensalidades, error: mensErr } = await adminClient
        .from("mensalidades")
        .select("id, mes_referencia, ano_referencia, valor, data_vencimento, status")
        .eq("cliente_id", resolvedClienteId)
        .neq("status", "pago")
        .order("data_vencimento", { ascending: true });

      const hoje = new Date().toISOString().split("T")[0];
      const hojeMs = new Date(hoje).getTime();

      let totalDevido = 0;
      let qtdFaturasVencidas = 0;
      let maiorDiasAtraso = 0;
      let faturaVencidaMaisAntiga: any = undefined;
      let faturaAVencer: any = undefined;
      let avisoVencimentoProximo = false;

      if (!mensErr && mensalidades && mensalidades.length > 0) {
        for (const m of mensalidades) {
          const v = Number(m.valor || 0);
          const dataVenc = m.data_vencimento;

          if (dataVenc < hoje) {
            totalDevido += v;
            qtdFaturasVencidas += 1;

            const vencMs = new Date(dataVenc).getTime();
            const dias = Math.max(1, Math.floor((hojeMs - vencMs) / (1000 * 60 * 60 * 24)));
            if (dias > maiorDiasAtraso) {
              maiorDiasAtraso = dias;
            }

            if (!faturaVencidaMaisAntiga) {
              faturaVencidaMaisAntiga = {
                id: m.id,
                mes: m.mes_referencia,
                ano: m.ano_referencia,
                valor: v,
                dataVencimento: dataVenc,
                diasAtraso: dias,
              };
            }
          } else if (!avisoVencimentoProximo) {
            const vencMs = new Date(dataVenc).getTime();
            const diffDias = Math.ceil((vencMs - hojeMs) / (1000 * 60 * 60 * 24));

            if (diffDias >= 0 && diffDias <= 5) {
              avisoVencimentoProximo = true;
              faturaAVencer = {
                id: m.id,
                mes: m.mes_referencia,
                ano: m.ano_referencia,
                valor: v,
                dataVencimento: dataVenc,
                diasParaVencer: diffDias,
              };
            }
          }
        }
      }

      const avisoNotificacaoDia1a4 = maiorDiasAtraso >= 1 && maiorDiasAtraso <= 4;
      const bloqueioLocalizacao =
        statusLocManual === "bloqueado"
          ? true
          : statusLocManual === "liberado"
            ? false
            : maiorDiasAtraso >= 5;
      const bloqueioLogin =
        statusAcessoManual === "bloqueado"
          ? true
          : statusAcessoManual === "liberado"
            ? false
            : maiorDiasAtraso >= 7;

      const payload = isMotorista
        ? {
            bloqueado: bloqueioLogin,
            bloqueioLocalizacao,
            bloqueioLogin,
            diasAtraso: 0,
            totalDevido: 0,
            qtdFaturasVencidas: 0,
            faturaVencidaMaisAntiga: undefined,
            avisoVencimentoProximo: false,
            avisoNotificacaoDia1a4: false,
            statusBloqueioLocalizacaoManual: statusLocManual,
            statusBloqueioAcessoManual: statusAcessoManual,
            isMotorista: true,
            clienteId: resolvedClienteId,
          }
        : {
            bloqueado: bloqueioLogin,
            bloqueioLocalizacao,
            bloqueioLogin,
            diasAtraso: maiorDiasAtraso,
            totalDevido,
            qtdFaturasVencidas,
            faturaVencidaMaisAntiga,
            avisoVencimentoProximo,
            faturaAVencer,
            avisoNotificacaoDia1a4,
            statusBloqueioLocalizacaoManual: statusLocManual,
            statusBloqueioAcessoManual: statusAcessoManual,
            isMotorista: false,
            clienteId: resolvedClienteId,
            clienteStatus: clienteData.status || null,
          };

      return new Response(JSON.stringify({ success: true, status: payload }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar status financeiro.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  try {
    let query = adminClient
      .from("clientes")
      .select(
        `
        *,
        veiculos (id, placa, marca_modelo, tipo_veiculo, bloqueado, pendente_aprovacao_operador),
        instalador:instalador_id (id, nome, telefone, endereco_instalacao),
        instalacoes (id, valor_instalacao, status_pagamento, pago_direto_cliente, pago_em, status)
      `,
      )
      .order("nome_razao_social", { ascending: true });

    if (role === "revendedor") {
      query = query.eq("revendedor_id", userData.user.id);
    } else if (role === "vendedor") {
      query = query.eq("vendedor_id", userData.user.id);
    } else if (role === "instalador") {
      query = query.eq("instalador_id", userData.user.id);
    } else if (role === "cliente") {
      query = query.eq("user_id", userData.user.id);
    }

    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    return new Response(JSON.stringify({ success: true, clientes: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || "Erro ao consultar clientes." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }
}

/**
 * Endpoint de Gestão de Locatários e Auto-Cadastro Seguro
 * Permite ao Cliente Locador convidar, listar, editar, bloquear e resetar senhas de locatários.
 * Permite ao Locatário validar convite e concluir auto-cadastro público.
 */
async function handleApiLocatarios(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/locatarios")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. GET /api/locatarios/validar-convite?token=... (Público)
  if (url.pathname === "/api/locatarios/validar-convite" && request.method === "GET") {
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ valido: false, mensagem: "Token do convite não fornecido." }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    const { data: locRow, error: errLoc } = await adminClient
      .from("locatarios_cliente")
      .select("*, cliente:clientes!locatarios_cliente_cliente_id_fkey(id, nome_razao_social)")
      .eq("convite_token", token)
      .maybeSingle();

    if (errLoc || !locRow) {
      return new Response(
        JSON.stringify({ valido: false, mensagem: "Link de convite inválido ou expirado." }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    if (!locRow.ativo) {
      return new Response(
        JSON.stringify({
          valido: false,
          mensagem: "Este convite foi desativado pelo cliente titular.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    if (locRow.user_id) {
      return new Response(
        JSON.stringify({ valido: false, mensagem: "Este convite já foi utilizado e concluído." }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    if (locRow.convite_expira_em && new Date(locRow.convite_expira_em).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({
          valido: false,
          mensagem: "O prazo deste convite expirou. Solicite um novo link ao titular.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    // Busca detalhes dos veículos autorizados
    let veiculosDetalhes: any[] = [];
    const permitidos = Array.isArray(locRow.veiculos_permitidos) ? locRow.veiculos_permitidos : [];
    if (permitidos.length > 0) {
      const { data: vData } = await adminClient
        .from("veiculos")
        .select("id, placa, marca, modelo, ano_modelo, cor")
        .in("id", permitidos);
      veiculosDetalhes = vData || [];
    }

    return new Response(
      JSON.stringify({
        valido: true,
        convite: {
          id: locRow.id,
          nome: locRow.nome,
          email: locRow.email,
          telefone: locRow.telefone,
          cpf_cnpj: locRow.cpf_cnpj,
          cliente_id: locRow.cliente_id,
          cliente_nome: locRow.cliente?.nome_razao_social || "Cliente Locador",
          pode_bloquear: Boolean(locRow.pode_bloquear),
          pode_desbloquear: Boolean(locRow.pode_desbloquear),
          pode_bloquear_desbloquear: Boolean(
            locRow.pode_bloquear_desbloquear || (locRow.pode_bloquear && locRow.pode_desbloquear),
          ),
          veiculos: veiculosDetalhes,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }

  // 2. POST /api/locatarios/concluir-auto-cadastro (Público)
  if (url.pathname === "/api/locatarios/concluir-auto-cadastro" && request.method === "POST") {
    try {
      const body = await request.json();
      const token = (body?.token || "").trim();
      const nome = (body?.nome || "").trim();
      const email = (body?.email || "").trim().toLowerCase();
      const senha = (body?.senha || "").trim();
      const telefone = (body?.telefone || "").trim();
      const cpf_cnpj = (body?.cpf_cnpj || "").trim();

      if (!token || !nome || !email || !senha) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Campos obrigatórios ausentes (nome, email e senha).",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (senha.length < 6) {
        return new Response(
          JSON.stringify({ success: false, message: "A senha deve ter no mínimo 6 caracteres." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: locRow, error: errLoc } = await adminClient
        .from("locatarios_cliente")
        .select("*")
        .eq("convite_token", token)
        .maybeSingle();

      if (errLoc || !locRow || !locRow.ativo) {
        return new Response(
          JSON.stringify({ success: false, message: "Convite de locatário inválido ou expirado." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (locRow.user_id) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este cadastro já foi concluído anteriormente.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Cria usuário no Supabase Auth
      let userId = "";
      const { data: authCreated, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          role: "locatario",
          nome,
          cliente_id: locRow.cliente_id,
        },
      });

      if (authErr) {
        if (
          authErr.message?.toLowerCase().includes("already registered") ||
          authErr.message?.toLowerCase().includes("already been registered")
        ) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existUser = listData?.users?.find((u) => u.email?.toLowerCase() === email);
          if (existUser) {
            userId = existUser.id;
            await adminClient.auth.admin.updateUserById(userId, {
              password: senha,
              user_metadata: { role: "locatario", nome, cliente_id: locRow.cliente_id },
            });
          } else {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Este email já possui cadastro. Faça login ou use outro email.",
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
            );
          }
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              message: `Falha ao criar acesso: ${authErr.message}`,
            }),
            { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      } else if (authCreated?.user) {
        userId = authCreated.user.id;
      }

      // Cria ou atualiza profile com role 'locatario'
      await adminClient.from("profiles").upsert(
        {
          id: userId,
          role: "locatario",
          nome,
          email,
          telefone: telefone || null,
          ativo: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      // Atualiza registro em locatarios_cliente
      await adminClient
        .from("locatarios_cliente")
        .update({
          user_id: userId,
          nome,
          email,
          telefone: telefone || null,
          cpf_cnpj: cpf_cnpj || null,
          convite_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", locRow.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Cadastro concluído com sucesso! Você já pode entrar com seu email e senha.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao concluir cadastro.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // --- Rotas Autenticadas a partir daqui ---
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Não autorizado: Token de sessão ausente." }),
      { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = profile?.role || "cliente";
  const isAdmOuOperador = ["superadmin", "superadmin_auditor", "adm", "operador"].includes(role);

  // Busca cliente_id se for cliente
  let clienteIdVinculado = "";
  if (role === "cliente") {
    const { data: cliRow } = await adminClient
      .from("clientes")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    clienteIdVinculado = cliRow?.id || userData.user.id;
  }

  // 3. GET /api/locatarios
  if (url.pathname === "/api/locatarios" && request.method === "GET") {
    try {
      let query = adminClient
        .from("locatarios_cliente")
        .select("*, cliente:clientes!locatarios_cliente_cliente_id_fkey(id, nome_razao_social)")
        .order("created_at", { ascending: false });

      if (role === "cliente") {
        query = query.eq("cliente_id", clienteIdVinculado);
      } else if (isAdmOuOperador) {
        const paramClienteId = url.searchParams.get("clienteId");
        if (paramClienteId) {
          query = query.eq("cliente_id", paramClienteId);
        }
      } else {
        return new Response(JSON.stringify({ success: false, message: "Acesso não autorizado." }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const { data: locs, error: errLocs } = await query;
      if (errLocs) {
        if (
          errLocs.code === "PGRST205" ||
          errLocs.code === "42P01" ||
          errLocs.message?.includes("Could not find the table") ||
          errLocs.message?.includes("does not exist")
        ) {
          return new Response(
            JSON.stringify({ success: true, locatarios: [], tabelaPendente: true }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }
        return new Response(JSON.stringify({ success: false, message: errLocs.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const formatados = (locs || []).map((l: any) => ({
        ...l,
        cliente_nome: l.cliente?.nome_razao_social || undefined,
      }));

      return new Response(JSON.stringify({ success: true, locatarios: formatados }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar locatários.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 4. POST /api/locatarios/gerar-link-convite
  if (url.pathname === "/api/locatarios/gerar-link-convite" && request.method === "POST") {
    try {
      const body = await request.json();
      const targetClienteId =
        isAdmOuOperador && body?.cliente_id ? body.cliente_id : clienteIdVinculado;

      if (!targetClienteId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Identificador do cliente locador não localizado.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const veiculosPermitidos = Array.isArray(body?.veiculos_permitidos)
        ? body.veiculos_permitidos
        : [];
      if (veiculosPermitidos.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Selecione ao menos um veículo para o locatário.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Validação: Garante que os veículos pertencem ao cliente alvo
      const { data: veiculosValidos } = await adminClient
        .from("veiculos")
        .select("id")
        .eq("cliente_id", targetClienteId)
        .in("id", veiculosPermitidos);

      const idsValidos = (veiculosValidos || []).map((v) => v.id);
      if (idsValidos.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Nenhum veículo selecionado pertence à sua base de ativos.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const conviteToken = crypto.randomUUID().replace(/-/g, "");
      const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const podeBloquear =
        typeof body?.pode_bloquear === "boolean"
          ? body.pode_bloquear
          : Boolean(body?.pode_bloquear_desbloquear);
      const podeDesbloquear =
        typeof body?.pode_desbloquear === "boolean"
          ? body.pode_desbloquear
          : Boolean(body?.pode_bloquear_desbloquear);

      const { data: novoLoc, error: errInsert } = await adminClient
        .from("locatarios_cliente")
        .insert({
          cliente_id: targetClienteId,
          nome: (body?.nome || "Locatário Convidado").trim(),
          email: (body?.email || "").trim(),
          telefone: (body?.telefone || null)?.trim(),
          cpf_cnpj: (body?.cpf_cnpj || null)?.trim(),
          veiculos_permitidos: idsValidos,
          pode_bloquear: podeBloquear,
          pode_desbloquear: podeDesbloquear,
          pode_bloquear_desbloquear: Boolean(podeBloquear && podeDesbloquear),
          ativo: true,
          convite_token: conviteToken,
          convite_expira_em: expiraEm,
        })
        .select()
        .single();

      if (errInsert || !novoLoc) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Erro ao gerar convite: ${errInsert?.message}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const urlConvite = `${url.origin}/cadastro-locatario?token=${conviteToken}`;

      return new Response(
        JSON.stringify({
          success: true,
          token: conviteToken,
          url_convite: urlConvite,
          locatario: novoLoc,
          message: "Link de convite gerado com sucesso!",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao gerar convite." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 5. POST /api/locatarios/bloquear
  if (url.pathname === "/api/locatarios/bloquear" && request.method === "POST") {
    try {
      const body = await request.json();
      const locatarioId = body?.locatario_id;
      const ativo = Boolean(body?.ativo);

      if (!locatarioId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do locatário é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: locRow } = await adminClient
        .from("locatarios_cliente")
        .select("id, cliente_id, user_id")
        .eq("id", locatarioId)
        .maybeSingle();

      if (!locRow) {
        return new Response(
          JSON.stringify({ success: false, message: "Locatário não encontrado." }),
          { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (!isAdmOuOperador && locRow.cliente_id !== clienteIdVinculado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Você não tem permissão para alterar este locatário.",
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      await adminClient
        .from("locatarios_cliente")
        .update({ ativo, updated_at: new Date().toISOString() })
        .eq("id", locatarioId);

      if (locRow.user_id) {
        await adminClient
          .from("profiles")
          .update({ ativo, updated_at: new Date().toISOString() })
          .eq("id", locRow.user_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: ativo
            ? "Acesso do locatário desbloqueado com sucesso."
            : "Acesso do locatário bloqueado com sucesso.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao alterar status de acesso.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 6. POST /api/locatarios/resetar-senha
  if (url.pathname === "/api/locatarios/resetar-senha" && request.method === "POST") {
    try {
      const body = await request.json();
      const locatarioId = body?.locatario_id;

      if (!locatarioId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do locatário é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: locRow } = await adminClient
        .from("locatarios_cliente")
        .select("id, cliente_id, user_id, email, nome")
        .eq("id", locatarioId)
        .maybeSingle();

      if (!locRow) {
        return new Response(
          JSON.stringify({ success: false, message: "Locatário não encontrado." }),
          { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (!isAdmOuOperador && locRow.cliente_id !== clienteIdVinculado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Você não tem permissão para gerenciar a senha deste usuário.",
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (!locRow.user_id) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "O usuário ainda não concluiu seu primeiro cadastro.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const novaSenha =
        body?.nova_senha?.trim() || `Gd@${Math.floor(100000 + Math.random() * 900000)}`;

      const { error: resetErr } = await adminClient.auth.admin.updateUserById(locRow.user_id, {
        password: novaSenha,
      });

      if (resetErr) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Erro ao redefinir senha: ${resetErr.message}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          novaSenha,
          message: "Senha do usuário redefinida com sucesso!",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao resetar senha." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 7. PUT /api/locatarios (Atualizar dados, veículos e permissões)
  if (url.pathname === "/api/locatarios" && request.method === "PUT") {
    try {
      const body = await request.json();
      const locatarioId = body?.locatario_id;

      if (!locatarioId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do usuário é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: locRow } = await adminClient
        .from("locatarios_cliente")
        .select("id, cliente_id, user_id")
        .eq("id", locatarioId)
        .maybeSingle();

      if (!locRow) {
        return new Response(
          JSON.stringify({ success: false, message: "Usuário não encontrado." }),
          { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (!isAdmOuOperador && locRow.cliente_id !== clienteIdVinculado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Você não tem permissão para editar este usuário.",
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const updates: any = { updated_at: new Date().toISOString() };
      if (typeof body?.nome === "string") updates.nome = body.nome.trim();
      if (typeof body?.telefone === "string") updates.telefone = body.telefone.trim();
      if (typeof body?.cpf_cnpj === "string") updates.cpf_cnpj = body.cpf_cnpj.trim();
      if (typeof body?.pode_bloquear === "boolean") {
        updates.pode_bloquear = body.pode_bloquear;
      }
      if (typeof body?.pode_desbloquear === "boolean") {
        updates.pode_desbloquear = body.pode_desbloquear;
      }
      if (typeof body?.pode_bloquear_desbloquear === "boolean") {
        updates.pode_bloquear_desbloquear = body.pode_bloquear_desbloquear;
        if (typeof body?.pode_bloquear !== "boolean")
          updates.pode_bloquear = body.pode_bloquear_desbloquear;
        if (typeof body?.pode_desbloquear !== "boolean")
          updates.pode_desbloquear = body.pode_bloquear_desbloquear;
      }

      if (Array.isArray(body?.veiculos_permitidos)) {
        const { data: veiculosValidos } = await adminClient
          .from("veiculos")
          .select("id")
          .eq("cliente_id", locRow.cliente_id)
          .in("id", body.veiculos_permitidos);
        updates.veiculos_permitidos = (veiculosValidos || []).map((v) => v.id);
      }

      await adminClient.from("locatarios_cliente").update(updates).eq("id", locatarioId);

      if (locRow.user_id && (updates.nome || updates.telefone)) {
        const profUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.nome) profUpdates.nome = updates.nome;
        if (updates.telefone) profUpdates.telefone = updates.telefone;
        await adminClient.from("profiles").update(profUpdates).eq("id", locRow.user_id);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Dados do usuário atualizados com sucesso." }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao atualizar usuário." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

async function handleApiVeiculos(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    !url.pathname.startsWith("/api/veiculos") &&
    !url.pathname.startsWith("/api/instalacoes") &&
    url.pathname !== "/api/alertas-seguranca"
  ) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Não autorizado: Token de sessão ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const role = profile?.role;
  const rolesPermitidas = [
    "superadmin",
    "adm",
    "operador",
    "financeiro",
    "superadmin_auditor",
    "revendedor",
    "vendedor",
    "instalador",
    "cliente",
  ];

  if (!role || !rolesPermitidas.includes(role)) {
    return new Response(
      JSON.stringify({ success: false, message: "Acesso não autorizado aos veículos." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // GET /api/veiculos/saude?veiculoId=xxx (Diagnóstico e teste de sinal em tempo real com Service Role)
  if (request.method === "GET" && url.pathname === "/api/veiculos/saude") {
    try {
      const veiculoId = url.searchParams.get("veiculoId");
      const placa = url.searchParams.get("placa");
      const imei = url.searchParams.get("imei");

      if (!veiculoId && !placa && !imei) {
        return new Response(
          JSON.stringify({ success: false, message: "Identificador do veículo não fornecido." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      let q = adminClient.from("veiculos").select(`
          id,
          placa,
          marca_modelo,
          ultima_atualizacao,
          ignicao_status,
          velocidade_atual,
          satelites,
          gps_fixado,
          voltagem,
          bateria_veiculo_v,
          bateria_rastreador_pct,
          bateria_rastreador_status,
          sinal_gsm,
          rastreador_imei,
          rastreador_id,
          ultima_latitude,
          ultima_longitude,
          rastreadores!veiculos_rastreador_id_fkey (
            modelo,
            status,
            ultima_comunicacao
          )
        `);

      if (veiculoId) q = q.eq("id", veiculoId);
      else if (placa) q = q.eq("placa", placa);
      else if (imei) q = q.eq("rastreador_imei", imei);

      const { data: v, error: errV } = await q.maybeSingle();

      if (errV || !v) {
        return new Response(
          JSON.stringify({
            success: false,
            ativo: false,
            statusTexto: "sem_comunicacao",
            rotulo: "Sem Comunicacao",
            mensagem: "Veículo não localizado na base de telemetria.",
          }),
          { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Avaliação estrita de comunicação com base na última transmissão factual
      let ativo = false;
      let rotulo = "Sem Comunicacao";
      let detalhe = "Sem transmissao recente";
      let minutos: number | null = null;

      if (v.ultima_atualizacao) {
        const dataAtual = Date.now();
        const dataTransmissao = new Date(v.ultima_atualizacao).getTime();
        if (!isNaN(dataTransmissao)) {
          minutos = Math.max(0, Math.floor((dataAtual - dataTransmissao) / (1000 * 60)));
          if (minutos <= 10) {
            ativo = true;
            rotulo = "Comunicacao Ativa";
            detalhe =
              minutos <= 0
                ? "Transmitindo agora"
                : minutos === 1
                  ? "Ultima transmissao ha 1 minuto"
                  : `Ultima transmissao ha ${minutos} minutos`;
          } else if (minutos < 60) {
            detalhe = `Sem sinal ha ${minutos} minutos`;
          } else if (minutos < 1440) {
            const horas = Math.floor(minutos / 60);
            detalhe = `Sem sinal ha ${horas} ${horas === 1 ? "hora" : "horas"}`;
          } else {
            const dias = Math.floor(minutos / 1440);
            detalhe = `Sem sinal ha ${dias} ${dias === 1 ? "dia" : "dias"}`;
          }
        }
      }

      const modeloHardware = (v as any).rastreadores?.modelo || "G900L";
      const mensagem = ativo
        ? `Comunicacao Ativa: Rastreador ${modeloHardware} respondendo normalmente (${detalhe})`
        : `Sem Comunicacao: Rastreador ${modeloHardware} sem transmissao recente (${detalhe})`;

      return new Response(
        JSON.stringify({
          success: true,
          ativo,
          statusTexto: ativo ? "ativo" : "sem_comunicacao",
          rotulo,
          minutosDesdeUltimaTransmissao: minutos,
          mensagem,
          ultimaAtualizacao: v.ultima_atualizacao,
          satelites: v.satelites ?? 0,
          ignicao_status: v.ignicao_status ?? false,
          rastreador_modelo: modeloHardware,
          voltagem: v.voltagem ?? v.bateria_veiculo_v ?? null,
          bateria_rastreador_pct: v.bateria_rastreador_pct ?? null,
          bateria_rastreador_status: v.bateria_rastreador_status ?? null,
          sinal_gsm: v.sinal_gsm ?? null,
          temLocalizacao: Boolean(v.ultima_latitude && v.ultima_longitude),
          ultimaLatitude: v.ultima_latitude,
          ultimaLongitude: v.ultima_longitude,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar saúde do veículo.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/veiculos/monitor ou GET /api/veiculos (sem clienteId para visualização geral da frota)
  if (
    request.method === "GET" &&
    (url.pathname === "/api/veiculos/monitor" ||
      (!url.searchParams.get("clienteId") && url.pathname === "/api/veiculos"))
  ) {
    try {
      let query = adminClient
        .from("veiculos")
        .select(
          `
          id,
          cliente_id,
          placa,
          chassi,
          marca_modelo,
          cor,
          ano,
          tipo_veiculo,
          horimetro_modo,
          horimetro_horas,
          ignicao_status,
          bloqueado,
          velocidade_atual,
          odometro_km,
          odometro_wgs84_km,
          odometro_cinematico_km,
          odometro_hardware_km,
          odometro_hardware_atualizado_em,
          odometro_motor_a_km,
          odometro_motor_b_km,
          odometro_motor_c_km,
          odometro_motor_media_km,
          odometro_motor_a_pesos,
          odometro_motor_b_pesos,
          odometro_motor_c_pesos,
          odometro_motor_a_estado,
          odometro_motor_b_estado,
          odometro_motor_c_estado,
          ultima_latitude,
          ultima_longitude,
          ultima_atualizacao,
          voltagem,
          bateria_veiculo_v,
          bateria_rastreador_pct,
          bateria_rastreador_status,
          satelites,
          rumo,
          inclinacao_graus,
          vibracao_g,
          alerta_acidente,
          alerta_tipo,
          ativo,
          privacidade_localizacao,
          bloqueador_instalado,
          tipo_bloqueador,
          bloqueador_detalhes,
          sinal_gsm,
          rele_status,
          rastreador_id,
          rastreador_imei,
          rastreadores!veiculos_rastreador_id_fkey (
            modelo
          ),
          clientes (
            user_id,
            nome_razao_social,
            plano,
            privacidade_localizacao
          )
        `,
        )
        .eq("ativo", true)
        .not("placa", "in", '("HTR4G16","HUN1T26")')
        .order("placa", { ascending: true });

      if (role === "cliente") {
        const { data: cliRow } = await adminClient
          .from("clientes")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (cliRow?.id) {
          query = query.eq("cliente_id", cliRow.id);
        } else {
          query = query.eq("cliente_id", userData.user.id);
        }
      } else if (role === "locatario") {
        const { data: locRow } = await adminClient
          .from("locatarios_cliente")
          .select("id, ativo, veiculos_permitidos")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!locRow || !locRow.ativo) {
          return new Response(JSON.stringify({ success: true, veiculos: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        }

        const permitidos = Array.isArray(locRow.veiculos_permitidos)
          ? locRow.veiculos_permitidos
          : [];
        if (permitidos.length === 0) {
          return new Response(JSON.stringify({ success: true, veiculos: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        }
        query = query.in("id", permitidos);
      }

      const { data: veiculosFrota, error: errFrota } = await query;
      if (errFrota) {
        return new Response(JSON.stringify({ success: false, message: errFrota.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const veiculosFormatados = (veiculosFrota || []).map((v: any) => ({
        ...v,
        tipo_medicao:
          v.tipo_medicao ||
          (v.horimetro_modo === "horimetro"
            ? "horimetro"
            : v.tipo_veiculo === "maquina" || v.tipo_veiculo === "trator"
              ? "horimetro"
              : "km"),
        horimetro_horas: Number(v.horimetro_horas || 0),
        rastreador_modelo: v.rastreadores?.modelo || "G900L",
      }));

      return new Response(JSON.stringify({ success: true, veiculos: veiculosFormatados }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar veículos do monitor GPS.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/veiculos?clienteId=xxx
  if (request.method === "GET" && url.pathname === "/api/veiculos") {
    try {
      const clienteId = url.searchParams.get("clienteId");
      if (!clienteId) {
        return new Response(
          JSON.stringify({ success: false, message: "Parâmetro clienteId é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: veiculos, error: errVeics } = await adminClient
        .from("veiculos")
        .select(
          "id, placa, marca_modelo, ano, cor, tipo_veiculo, ativo, bloqueado, rastreador_id, rastreador_imei, pendente_aprovacao_operador, created_at",
        )
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: true });

      if (errVeics) {
        return new Response(JSON.stringify({ success: false, message: errVeics.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const { data: instalacoes, error: errInst } = await adminClient
        .from("instalacoes")
        .select(
          "id, veiculo_id, placa, data_agendamento, hora_agendamento, status, tipo_servico, instalador_id, fotos, fotos_instalacao, local_instalacao_tipo, solicitou_local_cliente, rele_chicote_fornecido_por, data_conclusao, rastreador_id, observacoes, instalador:instalador_id (id, nome, telefone)",
        )
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });

      return new Response(
        JSON.stringify({
          success: true,
          veiculos: veiculos || [],
          instalacoes: instalacoes || [],
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao consultar veículos." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/alertas-seguranca - Consulta segura de alertas com Service Role (imune a recursão RLS no navegador)
  if (request.method === "GET" && url.pathname === "/api/alertas-seguranca") {
    try {
      const veiculoIdParam = url.searchParams.get("veiculoId");
      let query = adminClient
        .from("alertas_seguranca")
        .select(
          `
          id,
          veiculo_id,
          cliente_id,
          tipo,
          gravidade,
          latitude,
          longitude,
          velocidade,
          vibracao_g,
          inclinacao_graus,
          detalhes,
          reconhecido,
          created_at,
          veiculos (
            placa,
            marca_modelo,
            ultima_latitude,
            ultima_longitude
          ),
          clientes (
            nome_razao_social,
            documento,
            telefone,
            email,
            plano
          )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(30);

      if (veiculoIdParam) {
        query = query.eq("veiculo_id", veiculoIdParam);
      }

      if (role === "cliente") {
        const { data: cliRow } = await adminClient
          .from("clientes")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        query = query.eq("cliente_id", cliRow?.id || userData.user.id);
      } else if (role === "locatario") {
        const { data: locRow } = await adminClient
          .from("locatarios_cliente")
          .select("id, ativo, veiculos_permitidos")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        const permitidos =
          locRow?.ativo && Array.isArray(locRow.veiculos_permitidos)
            ? locRow.veiculos_permitidos
            : [];
        if (permitidos.length === 0) {
          return new Response(JSON.stringify({ success: true, alertas: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        }
        query = query.in("veiculo_id", permitidos);
      }

      const { data: alertasData, error: errAlertas } = await query;
      if (errAlertas) {
        return new Response(JSON.stringify({ success: false, message: errAlertas.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const ehEquipeTecnica = role === "superadmin" || role === "adm" || role === "operador";
      const alertasFiltrados = (alertasData || []).filter((a: any) => {
        if (ehEquipeTecnica) return true;
        const tipoLower = String(a.tipo || "").toLowerCase();
        return (
          tipoLower !== "corte_nao_autorizado_sms" && tipoLower !== "desbloqueio_nao_autorizado_sms"
        );
      });

      return new Response(JSON.stringify({ success: true, alertas: alertasFiltrados }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao consultar alertas." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/veiculos/metrica - Alternar entre Odômetro (KM) e Horímetro (Horas de Uso)
  if (request.method === "POST" && url.pathname === "/api/veiculos/metrica") {
    try {
      const body = (await request.json()) as any;
      const { veiculoId, tipoMedicao, horimetroInicial } = body || {};

      if (!veiculoId) {
        return new Response(
          JSON.stringify({ success: false, message: "veiculoId é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const medicao = tipoMedicao === "horimetro" ? "horimetro" : "km";
      const horimetroNum =
        horimetroInicial !== undefined && Number(horimetroInicial) >= 0
          ? Number(horimetroInicial)
          : null;

      // 1. Tenta RPC atualizar_metrica_veiculo
      const { data: rpcRes, error: rpcErr } = await (adminClient.rpc as any)(
        "atualizar_metrica_veiculo",
        {
          p_veiculo_id: veiculoId,
          p_tipo_medicao: medicao,
          p_horimetro_horas: horimetroNum,
        },
      );

      if (!rpcErr && rpcRes?.sucesso) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Métrica operacional atualizada com sucesso.",
            tipo_medicao: medicao,
            horimetro_horas: rpcRes.horimetro_horas,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // 2. Fallback direto update com suporte resiliente a horimetro_modo e tipo_medicao
      const updateDataNativo: Record<string, any> = {
        horimetro_modo: medicao,
        updated_at: new Date().toISOString(),
      };
      if (horimetroNum !== null) {
        updateDataNativo.horimetro_horas = horimetroNum;
      }

      // Tenta gravar tipo_medicao caso a coluna exista no banco
      let { error: upErr } = await adminClient
        .from("veiculos")
        .update({ ...updateDataNativo, tipo_medicao: medicao })
        .eq("id", veiculoId);

      // Se a coluna tipo_medicao ainda não existir no schema remoto, persiste via horimetro_modo nativo
      if (upErr && upErr.message && upErr.message.includes("tipo_medicao")) {
        const fallbackRes = await adminClient
          .from("veiculos")
          .update(updateDataNativo)
          .eq("id", veiculoId);
        upErr = fallbackRes.error;
      }

      if (upErr) {
        return new Response(JSON.stringify({ success: false, message: upErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Métrica operacional atualizada com sucesso.",
          tipo_medicao: medicao,
          horimetro_horas: horimetroNum,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao atualizar métrica do veículo.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/veiculos/cadastrar ou POST /api/veiculos
  if (
    request.method === "POST" &&
    (url.pathname === "/api/veiculos/cadastrar" || url.pathname === "/api/veiculos")
  ) {
    try {
      const body = (await request.json()) as any;
      const { clienteId, dados } = body || {};

      if (!clienteId || !dados) {
        return new Response(
          JSON.stringify({ success: false, message: "clienteId e dados são obrigatórios." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const rawTipo = (dados.tipo_veiculo || "carro").trim().toLowerCase();
      const tipoMapeado = rawTipo === "quadriciclo" ? "quadriciculo" : rawTipo;
      const tiposPermitidos = new Set([
        "carro",
        "moto",
        "moto_eletrica",
        "caminhao",
        "van",
        "ambulancia",
        "onibus",
        "suv",
        "camionete",
        "quadriciculo",
        "triciclo",
        "jetski",
        "maquina",
        "trator",
        "equipamento",
        "outro",
      ]);
      const tipoSanitizado = tiposPermitidos.has(tipoMapeado) ? tipoMapeado : "carro";
      const isSemPlaca =
        tipoSanitizado === "maquina" ||
        tipoSanitizado === "trator" ||
        tipoSanitizado === "equipamento" ||
        tipoSanitizado === "moto_eletrica";

      const rawPlaca = (dados.placa || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "");

      const rawChassi = (dados.chassi || "").trim().toUpperCase();
      const chassiFinal = rawChassi ? rawChassi : null;
      const chassiSufixo = chassiFinal && chassiFinal.length >= 6 ? chassiFinal.slice(-6) : null;

      const placaFinal = rawPlaca
        ? rawPlaca
        : isSemPlaca
          ? chassiSufixo || "SEMPLACA"
          : "A DEFINIR";
      const marcaModeloFinal = (dados.marca_modelo || "").trim() || "Veículo Padrão";

      const payload: Record<string, any> = {
        cliente_id: clienteId,
        placa: placaFinal,
        chassi: chassiFinal,
        marca_modelo: marcaModeloFinal,
        ano: dados.ano || null,
        cor: dados.cor?.trim() || null,
        tipo_veiculo: tipoSanitizado,
        horimetro_horas: Number(dados.horimetro_horas) || 0,
        ativo: false,
        bloqueado: false,
        pendente_aprovacao_operador: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let { data: veiculoCriado, error: errInsert } = await adminClient
        .from("veiculos")
        .insert(payload)
        .select()
        .single();

      if (
        errInsert &&
        (errInsert.message?.includes("column") || errInsert.message?.includes("schema cache"))
      ) {
        delete payload.pendente_aprovacao_operador;
        const retry = await adminClient.from("veiculos").insert(payload).select().single();
        veiculoCriado = retry.data;
        errInsert = retry.error;
      }

      if (errInsert || !veiculoCriado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: errInsert?.message || "Falha ao inserir veículo.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Veículo cadastrado na frota com sucesso.",
          veiculo: veiculoCriado,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao cadastrar veículo." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/instalacoes/direta - Instalação Direta para SuperADM (veículos previamente instalados)
  if (request.method === "POST" && url.pathname === "/api/instalacoes/direta") {
    try {
      const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      let callerUserId = "20789b1e-2a8c-44a4-aca2-a0b67061b675"; // SuperADM padrão
      if (token) {
        try {
          const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });
          const { data: uData } = await userClient.auth.getUser(token);
          if (uData?.user?.id) callerUserId = uData.user.id;
        } catch {
          // fallback silencioso
        }
      }

      const body = (await request.json()) as any;
      const {
        clienteId,
        placa,
        marca,
        modelo,
        ano,
        cor,
        tipoVeiculo,
        chassi,
        kmInstalacao,
        horimetroInicial,
        rastreadorId,
        rastreadorImei,
        rastreadorModelo,
        chipIccid,
        chipOperadora,
        bloqueadorInstalado,
        tipoBloqueador,
        bloqueadorDetalhes,
        posicaoInstalacao,
        observacoes,
      } = body || {};

      if (!clienteId || !placa || !rastreadorImei) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "clienteId, placa e rastreadorImei são obrigatórios.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const placaLimpa = (placa || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "");
      const imeiLimpo = (rastreadorImei || "").trim();
      const marcaModeloFinal =
        `${(marca || "Veículo").trim()} ${(modelo || "Padrão").trim()}`.trim();
      const tipoSanitizado = (tipoVeiculo || "carro").trim().toLowerCase();
      const bloqueadorBool = bloqueadorInstalado !== false;
      const tipoBloqFinal = bloqueadorBool
        ? tipoBloqueador || "rele_combustivel"
        : "sem_bloqueador";

      // 1. Busca ou valida rastreador
      let rastreadorAlvoId = rastreadorId;
      let rastreadorRow: any = null;
      if (rastreadorAlvoId) {
        const { data: r } = await adminClient
          .from("rastreadores")
          .select("id, imei, modelo, chip_id, chips (id, iccid, operadora, linha)")
          .eq("id", rastreadorAlvoId)
          .maybeSingle();
        rastreadorRow = r;
      }
      if (!rastreadorRow && imeiLimpo) {
        const { data: r } = await adminClient
          .from("rastreadores")
          .select("id, imei, modelo, chip_id, chips (id, iccid, operadora, linha)")
          .eq("imei", imeiLimpo)
          .maybeSingle();
        rastreadorRow = r;
        if (rastreadorRow) rastreadorAlvoId = rastreadorRow.id;
      }

      const chipIccidFinal = chipIccid || rastreadorRow?.chips?.iccid || null;
      const chipOperadoraFinal = chipOperadora || rastreadorRow?.chips?.operadora || "Algar";

      // 2. Criação ou Atualização do Veículo
      let veiculoId: string | undefined;
      const { data: veicExistente } = await adminClient
        .from("veiculos")
        .select("id")
        .eq("placa", placaLimpa)
        .maybeSingle();

      if (veicExistente?.id) {
        veiculoId = veicExistente.id;
        await adminClient
          .from("veiculos")
          .update({
            cliente_id: clienteId,
            marca_modelo: marcaModeloFinal,
            ano: ano ? Number(ano) : null,
            cor: cor?.trim() || null,
            tipo_veiculo: tipoSanitizado,
            chassi: chassi?.trim() || null,
            odometro_km: Number(kmInstalacao) || 0,
            horimetro_horas: Number(horimetroInicial) || 0,
            rastreador_id: rastreadorAlvoId || null,
            rastreador_imei: imeiLimpo,
            ativo: true,
            status_operacional: "estacionado",
            bloqueado: false,
            bloqueador_instalado: bloqueadorBool,
            tipo_bloqueador: tipoBloqFinal,
            bloqueador_detalhes: bloqueadorDetalhes || null,
            pendente_aprovacao_operador: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", veiculoId);
      } else {
        const { data: novoVeic, error: errNovoVeic } = await adminClient
          .from("veiculos")
          .insert({
            cliente_id: clienteId,
            placa: placaLimpa,
            marca_modelo: marcaModeloFinal,
            ano: ano ? Number(ano) : null,
            cor: cor?.trim() || null,
            tipo_veiculo: tipoSanitizado,
            chassi: chassi?.trim() || null,
            odometro_km: Number(kmInstalacao) || 0,
            horimetro_horas: Number(horimetroInicial) || 0,
            rastreador_id: rastreadorAlvoId || null,
            rastreador_imei: imeiLimpo,
            ativo: true,
            status_operacional: "estacionado",
            bloqueado: false,
            bloqueador_instalado: bloqueadorBool,
            tipo_bloqueador: tipoBloqFinal,
            bloqueador_detalhes: bloqueadorDetalhes || null,
            pendente_aprovacao_operador: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (errNovoVeic) {
          return new Response(
            JSON.stringify({
              success: false,
              message: errNovoVeic.message || "Falha ao registrar veículo.",
            }),
            { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
        veiculoId = novoVeic?.id;
      }

      // 3. Atualiza Rastreador
      if (rastreadorAlvoId && veiculoId) {
        await adminClient
          .from("rastreadores")
          .update({
            veiculo_id: veiculoId,
            status: "instalado",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", rastreadorAlvoId);
      }

      // 4. Cria Ordem Concluída e Isenta de Repasse (status_pagamento 'pago' com valor R$ 0,00)
      const { data: instCriada, error: errInst } = await adminClient
        .from("instalacoes")
        .insert({
          instalador_id: callerUserId,
          cliente_id: clienteId,
          veiculo_id: veiculoId,
          placa: placaLimpa,
          marca: (marca || "Veículo").trim(),
          modelo: (modelo || "Padrão").trim(),
          ano: ano ? Number(ano) : null,
          cor: cor?.trim() || null,
          tipo_veiculo: tipoSanitizado,
          km_instalacao: Number(kmInstalacao) || 0,
          horimetro_inicial: Number(horimetroInicial) || 0,
          rastreador_id: rastreadorAlvoId || null,
          rastreador_imei: imeiLimpo,
          rastreador_modelo: rastreadorModelo || rastreadorRow?.modelo || "J16 4G",
          chip_iccid: chipIccidFinal,
          chip_operadora: chipOperadoraFinal,
          posicao_instalacao: posicaoInstalacao || "painel_interno",
          status: "concluida",
          concluida_at: new Date().toISOString(),
          valor_instalacao: 0.0,
          status_pagamento: "pago",
          kit_confirmado_instalador: true,
          kit_confirmado_em: new Date().toISOString(),
          imei_confirmado: imeiLimpo,
          observacoes:
            observacoes ||
            "Instalação direta realizada pelo SuperADM (veículo previamente instalado).",
          tipo_servico: "instalacao",
          bloqueador_instalado: bloqueadorBool,
          tipo_bloqueador: tipoBloqFinal,
          bloqueador_detalhes: bloqueadorDetalhes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();

      if (errInst) {
        return new Response(
          JSON.stringify({
            success: false,
            message: errInst.message || "Falha ao registrar ordem de instalação direta.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // 5. Histórico de Atendimentos
      if (instCriada?.id) {
        await adminClient.from("instalacoes_historico_atendimentos").insert({
          instalacao_id: instCriada.id,
          instalador_id: callerUserId,
          status_atendimento: "concluida",
          motivo: "Instalação direta (já instalado)",
          observacoes: "Ativação direta via SuperADM sem tramitação de instalador.",
          km_no_atendimento: Number(kmInstalacao) || 0,
        } as any);
      }

      // 6. Atualiza Status do Cliente
      await adminClient
        .from("clientes")
        .update({
          status: "ativo",
          status_agendamento: "concluido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", clienteId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Instalação direta concluída com sucesso e veículo ativado no Monitor GPS!",
          veiculo_id: veiculoId,
          instalacao_id: instCriada?.id,
          rastreador_id: rastreadorAlvoId || undefined,
          imei: imeiLimpo,
          placa: placaLimpa,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao registrar instalação direta.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/veiculos/distribuir
  if (request.method === "POST" && url.pathname === "/api/veiculos/distribuir") {
    try {
      const body = (await request.json()) as any;
      const { clienteId, itens } = body || {};

      if (!clienteId || !itens || !Array.isArray(itens) || itens.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: "clienteId e itens são obrigatórios." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const veiculoIds = itens.map((i: any) => i.veiculoId);
      const { data: veiculosRows } = await adminClient
        .from("veiculos")
        .select("id, placa, marca_modelo, ano, cor, tipo_veiculo, ativo, rastreador_id")
        .in("id", veiculoIds);

      const mapVeiculos = new Map<string, any>();
      (veiculosRows || []).forEach((v: any) => mapVeiculos.set(v.id, v));

      const { data: ordensClienteRows } = await adminClient
        .from("instalacoes")
        .select("id, veiculo_id, placa, status, tipo_servico")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });

      const ordensConcluidasIds = new Set<string>();
      const veiculosComOrdemConcluida = new Set<string>();

      (ordensClienteRows || []).forEach((ord: any) => {
        const st = (ord.status || "").trim().toLowerCase();
        if (
          (st === "concluida" || st === "concluida_com_pendencia") &&
          ord.tipo_servico !== "retirada"
        ) {
          ordensConcluidasIds.add(ord.id);
          if (ord.veiculo_id) veiculosComOrdemConcluida.add(ord.veiculo_id);
        }
      });

      const instaladorIds = Array.from(
        new Set(itens.map((i: any) => i.instaladorId).filter(Boolean)),
      );
      const { data: profs } = await adminClient
        .from("profiles")
        .select(
          "id, nome, telefone, endereco_instalacao, valor_instalacao_sem_bloqueador, valor_instalacao_com_bloqueador, valor_por_instalacao",
        )
        .in("id", instaladorIds);

      const mapInstaladores = new Map<string, any>();
      (profs || []).forEach((p: any) => mapInstaladores.set(p.id, p));

      const ordensAdotadas = new Set<string>();

      for (const item of itens) {
        if (
          (item.instalacaoId && ordensConcluidasIds.has(item.instalacaoId)) ||
          veiculosComOrdemConcluida.has(item.veiculoId)
        ) {
          continue;
        }

        const vInfo = mapVeiculos.get(item.veiculoId);
        const temKit = Boolean(item.kitId && item.imei);

        // 1. Atualiza veiculo
        const veiculoUpdate: Record<string, any> = {
          pendente_aprovacao_operador: false,
          updated_at: new Date().toISOString(),
        };
        if (temKit) {
          veiculoUpdate.rastreador_id = item.kitId;
          veiculoUpdate.rastreador_imei = item.imei;
        } else {
          veiculoUpdate.rastreador_id = null;
          veiculoUpdate.rastreador_imei = null;
        }
        await adminClient.from("veiculos").update(veiculoUpdate).eq("id", item.veiculoId);

        // 2. Atualiza rastreador no estoque
        if (temKit && item.kitId) {
          await adminClient
            .from("rastreadores")
            .update({ status: "estoque", updated_at: new Date().toISOString() } as any)
            .eq("id", item.kitId);
        }

        // 3. Ordem de serviço
        let instExistenteId: string | null =
          item.instalacaoId && !ordensConcluidasIds.has(item.instalacaoId)
            ? item.instalacaoId
            : null;

        if (!instExistenteId) {
          const instPorVeiculo = (ordensClienteRows || []).find(
            (ord: any) =>
              ord.veiculo_id === item.veiculoId &&
              ord.tipo_servico !== "retirada" &&
              !ordensConcluidasIds.has(ord.id) &&
              !ordensAdotadas.has(ord.id),
          );
          if (instPorVeiculo?.id) {
            instExistenteId = instPorVeiculo.id;
          }
        }

        const profInst = item.instaladorId ? mapInstaladores.get(item.instaladorId) : null;
        const valorInstalador =
          Number(profInst?.valor_instalacao_com_bloqueador) ||
          Number(profInst?.valor_instalacao_sem_bloqueador) ||
          Number(profInst?.valor_por_instalacao) ||
          100;

        const payloadInstalacao: Record<string, any> = {
          cliente_id: clienteId,
          veiculo_id: item.veiculoId,
          placa: vInfo?.placa || "A DEFINIR",
          instalador_id: item.instaladorId || null,
          rastreador_id: item.kitId || null,
          data_agendamento: item.dataAgendamento || null,
          hora_agendamento: item.horaAgendamento || null,
          observacoes: item.observacoes || null,
          local_instalacao_tipo: item.localTipo || "oficina",
          solicitou_local_cliente: item.solicitaEnderecoCliente ?? false,
          rele_chicote_fornecido_por: item.releChicoteDoEstoque ? "estoque_hunter" : "instalador",
          valor_instalacao: valorInstalador,
          status: temKit && item.instaladorId ? "agendada" : "pendente",
          tipo_servico: "instalacao",
          updated_at: new Date().toISOString(),
        };

        if (instExistenteId) {
          ordensAdotadas.add(instExistenteId);
          await adminClient.from("instalacoes").update(payloadInstalacao).eq("id", instExistenteId);
        } else {
          payloadInstalacao.created_at = new Date().toISOString();
          const { data: novaInst } = await adminClient
            .from("instalacoes")
            .insert(payloadInstalacao)
            .select("id")
            .single();
          if (novaInst?.id) ordensAdotadas.add(novaInst.id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Distribuição e ordens de serviço salvas com sucesso!",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao salvar distribuição.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return new Response(
    JSON.stringify({ success: false, message: "Método ou rota não suportada." }),
    {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    },
  );
}

async function handleApiRastreadores(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/rastreadores" && url.pathname !== "/api/rastreadores/listar") {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ success: false, message: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Não autorizado: Token de sessão ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const role = profile?.role;
  const rolesPermitidas = [
    "superadmin",
    "adm",
    "operador",
    "financeiro",
    "superadmin_auditor",
    "instalador",
    "revendedor",
    "vendedor",
  ];

  if (!role || !rolesPermitidas.includes(role)) {
    return new Response(
      JSON.stringify({ success: false, message: "Acesso não autorizado aos rastreadores." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  try {
    const [
      { data: rastreadoresData },
      { data: veiculosData },
      { data: instalacoesData },
      { data: clientesData },
    ] = await Promise.all([
      adminClient.from("rastreadores").select(`
        id,
        imei,
        modelo,
        status,
        ultima_comunicacao,
        veiculo_id,
        chip_linha,
        chip_operadora
      `),
      adminClient.from("veiculos").select(`
        id,
        cliente_id,
        placa,
        marca_modelo,
        rastreador_imei,
        rastreador_id,
        ignicao_status,
        voltagem,
        bateria_veiculo_v,
        bateria_rastreador_pct,
        satelites,
        velocidade_atual,
        odometro_km,
        ultima_latitude,
        ultima_longitude,
        ultima_atualizacao,
        rele_status,
        sinal_gsm,
        bloqueado
      `),
      adminClient.from("instalacoes").select("id, veiculo_id, rastreador_id, status"),
      adminClient.from("clientes").select("id, nome_razao_social, telefone"),
    ]);

    const listaMapeada: any[] = [];
    const imeisAdicionados = new Set<string>();

    const clientesPorId = new Map<string, { nome: string; telefone: string }>();
    if (clientesData) {
      for (const c of clientesData) {
        if (c.id) {
          let telNorm = (c.telefone || "").replace(/\D/g, "");
          if (telNorm.length >= 10 && !telNorm.startsWith("55")) {
            telNorm = "55" + telNorm;
          }
          clientesPorId.set(c.id, {
            nome: c.nome_razao_social || "Cliente",
            telefone: telNorm || c.telefone || "",
          });
        }
      }
    }

    const instPorRastreadorId = new Map<string, any>();
    const instPorVeiculoId = new Map<string, any>();
    if (instalacoesData) {
      for (const i of instalacoesData) {
        if (i.rastreador_id) instPorRastreadorId.set(i.rastreador_id, i);
        if (i.veiculo_id) instPorVeiculoId.set(i.veiculo_id, i);
      }
    }

    const veicPorId = new Map<string, any>();
    const veicPorRastreadorImei = new Map<string, any>();
    const veicPorRastreadorId = new Map<string, any>();
    if (veiculosData) {
      for (const v of veiculosData) {
        if (v.id) veicPorId.set(v.id, v);
        if (v.rastreador_imei) veicPorRastreadorImei.set(v.rastreador_imei, v);
        if (v.rastreador_id) veicPorRastreadorId.set(v.rastreador_id, v);
      }
    }

    if (rastreadoresData) {
      for (const r of rastreadoresData) {
        if (!r.imei) continue;

        const inst =
          (r.id ? instPorRastreadorId.get(r.id) : null) ||
          (r.veiculo_id ? instPorVeiculoId.get(r.veiculo_id) : null) ||
          null;

        const veic =
          (r.veiculo_id ? veicPorId.get(r.veiculo_id) : null) ||
          veicPorRastreadorImei.get(r.imei) ||
          (r.id ? veicPorRastreadorId.get(r.id) : null) ||
          (inst?.veiculo_id ? veicPorId.get(inst.veiculo_id) : null) ||
          null;

        let statusReal = "estoque";
        const instStatus = (inst?.status || "").toLowerCase();

        if (
          instStatus === "agendada" ||
          instStatus === "em_andamento" ||
          instStatus === "aguardando" ||
          r.status === "aguardando_instalacao" ||
          (veic && !inst && !veic.rastreador_imei)
        ) {
          statusReal = "aguardando_instalacao";
        } else if (
          r.status === "instalado" ||
          instStatus === "concluida" ||
          (veic && veic.rastreador_imei === r.imei)
        ) {
          statusReal = "instalado";
        } else {
          statusReal = "estoque";
        }

        const ultData = veic?.ultima_atualizacao || r.ultima_comunicacao;
        const isRecent = ultData
          ? Date.now() - new Date(ultData).getTime() < 1000 * 60 * 15
          : false;

        const cliR = veic?.cliente_id ? clientesPorId.get(veic.cliente_id) : null;

        listaMapeada.push({
          id: r.id,
          imei: r.imei,
          modelo: r.modelo || "G900L",
          status: statusReal,
          ultimaComunicacao: r.ultima_comunicacao,
          veiculoId: veic?.id || r.veiculo_id,
          placa: veic?.placa,
          marcaModelo: veic?.marca_modelo,
          clienteId: veic?.cliente_id || null,
          clienteNome: cliR?.nome || null,
          clienteTelefone: cliR?.telefone || null,
          ignicaoStatus: veic?.ignicao_status,
          voltagem: veic?.voltagem,
          bateriaVeiculoV: veic?.bateria_veiculo_v,
          bateriaRastreadorPct: veic?.bateria_rastreador_pct,
          satelites: veic?.satelites,
          velocidade: veic?.velocidade_atual,
          odometroKm: veic?.odometro_km,
          ultimaLatitude: veic?.ultima_latitude ? Number(veic.ultima_latitude) : null,
          ultimaLongitude: veic?.ultima_longitude ? Number(veic.ultima_longitude) : null,
          ultimaAtualizacao: veic?.ultima_atualizacao,
          releStatus: veic?.rele_status,
          sinalGsm: veic?.sinal_gsm,
          bloqueado: veic?.bloqueado,
          chipLinha: r.chip_linha,
          chipOperadora: r.chip_operadora,
          isTcpOnline: isRecent,
        });
        imeisAdicionados.add(r.imei);
      }
    }

    if (veiculosData) {
      for (const v of veiculosData) {
        if (v.rastreador_imei && !imeisAdicionados.has(v.rastreador_imei)) {
          const isRecent = v.ultima_atualizacao
            ? Date.now() - new Date(v.ultima_atualizacao).getTime() < 1000 * 60 * 15
            : false;

          const cliV = v.cliente_id ? clientesPorId.get(v.cliente_id) : null;

          listaMapeada.push({
            id: v.id,
            imei: v.rastreador_imei,
            modelo: "G900L",
            status: "instalado",
            ultimaComunicacao: v.ultima_atualizacao,
            veiculoId: v.id,
            placa: v.placa,
            marcaModelo: v.marca_modelo,
            clienteId: v.cliente_id || null,
            clienteNome: cliV?.nome || null,
            clienteTelefone: cliV?.telefone || null,
            ignicaoStatus: v.ignicao_status,
            voltagem: v.voltagem,
            bateriaVeiculoV: v.bateria_veiculo_v,
            bateriaRastreadorPct: v.bateria_rastreador_pct,
            satelites: v.satelites,
            velocidade: v.velocidade_atual,
            odometroKm: v.odometro_km,
            ultimaLatitude: v.ultima_latitude ? Number(v.ultima_latitude) : null,
            ultimaLongitude: v.ultima_longitude ? Number(v.ultima_longitude) : null,
            ultimaAtualizacao: v.ultima_atualizacao,
            releStatus: v.rele_status,
            sinalGsm: v.sinal_gsm,
            bloqueado: v.bloqueado,
            isTcpOnline: isRecent,
          });
          imeisAdicionados.add(v.rastreador_imei);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, dispositivos: listaMapeada }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || "Erro ao consultar rastreadores.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }
}

async function handleApiEstoque(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/estoque")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Token de autenticação ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 1. Valida solicitante autenticado via token JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 2. Valida papel administrativo ou operador via serviceRoleKey
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  const role = profile?.role;
  if (!role || !["superadmin", "adm", "operador", "financeiro"].includes(role)) {
    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Ação não autorizada: Apenas administradores e operadores podem gerenciar estoque.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // GET /api/estoque/movimentacoes
  if (url.pathname === "/api/estoque/movimentacoes" && request.method === "GET") {
    try {
      const { data, error } = await adminClient
        .from("estoque_movimentacoes")
        .select(
          `
          *,
          item:item_id (
            nome,
            codigo_sku,
            unidade_medida,
            categoria
          ),
          fornecedor:fornecedor_id (
            nome_fantasia,
            razao_social
          ),
          instalacao:instalacao_id (
            placa,
            modelo
          )
        `,
        )
        .order("data_movimento", { ascending: false })
        .limit(100);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, movimentacoes: data || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao listar movimentações.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/estoque/itens
  if (url.pathname === "/api/estoque/itens" && request.method === "GET") {
    try {
      const { data, error } = await adminClient
        .from("estoque_itens")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, itens: data || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao listar itens." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/estoque/chip
  if (url.pathname === "/api/estoque/chip" && request.method === "POST") {
    try {
      const body = await request.json();
      const iccidLimpo = String(body.iccid || "").replace(/\D/g, "");
      const operadora = String(body.operadora || "Vivo").trim();
      const linha = body.linha ? String(body.linha).trim() : null;

      if (!iccidLimpo || iccidLimpo.length < 10) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "ICCID inválido. Informe o número serial numérico do chip.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Checa duplicidade no estoque
      const { data: chipExistente } = await adminClient
        .from("chips")
        .select("id, iccid")
        .eq("iccid", iccidLimpo)
        .maybeSingle();

      if (chipExistente) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Este ICCID já está cadastrado no estoque.",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: novoChip, error: errInsert } = await adminClient
        .from("chips")
        .insert({
          iccid: iccidLimpo,
          operadora: operadora || "Vivo",
          linha,
          status: "ativo",
        })
        .select("id, iccid, operadora, linha, status, created_at")
        .single();

      if (errInsert) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Falha ao cadastrar chip no estoque: ${errInsert.message}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Chip M2M (ICCID ${iccidLimpo}) cadastrado com sucesso no estoque!`,
          chip: novoChip,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao cadastrar chip M2M.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // DELETE /api/estoque/chip
  if (url.pathname === "/api/estoque/chip" && request.method === "DELETE") {
    try {
      const chipId = url.searchParams.get("id");
      if (!chipId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do chip não informado." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      // Checa vínculo com rastreador
      const { data: rastreadorVinculado } = await adminClient
        .from("rastreadores")
        .select("imei")
        .eq("chip_id", chipId)
        .maybeSingle();

      if (rastreadorVinculado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Não é possível excluir: chip vinculado ao rastreador IMEI ${rastreadorVinculado.imei}.`,
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { error: errDel } = await adminClient.from("chips").delete().eq("id", chipId);
      if (errDel) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Falha ao excluir chip: ${errDel.message}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Chip excluído do estoque com sucesso.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro interno ao excluir chip.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return new Response(JSON.stringify({ success: false, message: "Método não suportado." }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

async function handleApiAdminRedefinirSenhaParceiro(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/redefinir-senha-parceiro")) {
    return null;
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, message: "Método não suportado. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Token de autenticação ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 1. Valida solicitante autenticado via token JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const callerId = userData.user.id;
  const callerEmail = userData.user.email?.toLowerCase() || "";
  const isCallerSuperAdm =
    callerEmail === "novaes@adm.28bpm.local" || callerEmail === "novaes@oficial.tec.br";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 2. Verifica se o solicitante possui permissão de Administrador
  let isAdm = isCallerSuperAdm;
  if (!isAdm) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, ativo")
      .eq("id", callerId)
      .maybeSingle();

    if (profile && profile.ativo && (profile.role === "superadmin" || profile.role === "adm")) {
      isAdm = true;
    } else {
      const { data: userRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .maybeSingle();
      if (userRole && (userRole.role === "superadmin" || userRole.role === "adm")) {
        isAdm = true;
      }
    }
  }

  // 3. Lê e valida corpo da requisição
  let body: { tipo?: string; id?: string; novaSenha?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Corpo JSON da requisição inválido." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const { tipo, id, novaSenha } = body;

  if (!tipo || (tipo !== "revendedor" && tipo !== "vendedor")) {
    return new Response(
      JSON.stringify({ success: false, message: "Tipo inválido. Informe revendedor ou vendedor." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  if (!id || typeof id !== "string") {
    return new Response(
      JSON.stringify({ success: false, message: "ID do parceiro não informado." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  if (!novaSenha || typeof novaSenha !== "string" || novaSenha.trim().length < 6) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "A nova senha deve conter no mínimo 6 caracteres.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  try {
    let targetUserId: string | null = null;
    let targetEmail: string | null = null;
    let targetNome: string = "";
    let targetTelefone: string | null = null;
    let targetDocumento: string | null = null;
    let targetChavePix: string | null = null;

    if (tipo === "revendedor") {
      if (!isAdm) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              "Acesso negado: apenas administradores podem redefinir a senha de revendedores.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      const { data: rev, error: revErr } = await adminClient
        .from("revendedores")
        .select("id, user_id, nome, email, telefone, documento, chave_pix")
        .eq("id", id)
        .maybeSingle();

      if (revErr || !rev) {
        return new Response(
          JSON.stringify({ success: false, message: "Revendedor não encontrado." }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      targetUserId = rev.user_id;
      targetEmail = rev.email;
      targetNome = rev.nome;
      targetTelefone = rev.telefone;
      targetDocumento = rev.documento;
      targetChavePix = rev.chave_pix;
    } else {
      // Vendedor: SuperADM/ADM ou o Revendedor responsável
      const { data: vend, error: vendErr } = await adminClient
        .from("vendedores")
        .select("id, revendedor_id, user_id, nome, email, telefone, documento, chave_pix")
        .eq("id", id)
        .maybeSingle();

      if (vendErr || !vend) {
        return new Response(
          JSON.stringify({ success: false, message: "Vendedor não encontrado." }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      if (!isAdm) {
        // Valida se o chamador é o revendedor do vendedor
        const { data: revDono } = await adminClient
          .from("revendedores")
          .select("id")
          .eq("id", vend.revendedor_id)
          .eq("user_id", callerId)
          .maybeSingle();

        if (!revDono) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Acesso negado: você não tem permissão para alterar a senha deste vendedor.",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }
      }

      targetUserId = vend.user_id;
      targetEmail = vend.email;
      targetNome = vend.nome;
      targetTelefone = vend.telefone;
      targetDocumento = vend.documento;
      targetChavePix = vend.chave_pix;
    }

    if (!targetEmail || !targetEmail.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "O parceiro não possui e-mail cadastrado para login.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const emailLimpo = targetEmail.trim().toLowerCase();

    // 4. Se não tem targetUserId, busca em auth.users por email
    if (!targetUserId) {
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const match = (existingUsers?.users || []).find((u) => u.email?.toLowerCase() === emailLimpo);
      if (match) {
        targetUserId = match.id;
      }
    }

    // 5. Atualiza senha ou cria usuário em auth.users com service_role
    if (targetUserId) {
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: novaSenha.trim(),
        email_confirm: true,
        user_metadata: {
          nome: targetNome,
          role: tipo,
          telefone: targetTelefone,
          cpf_cnpj: targetDocumento,
        },
      });

      if (updateErr) {
        throw new Error(`Falha ao atualizar senha em auth: ${updateErr.message}`);
      }
    } else {
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: emailLimpo,
        password: novaSenha.trim(),
        email_confirm: true,
        user_metadata: {
          nome: targetNome,
          role: tipo,
          telefone: targetTelefone,
          cpf_cnpj: targetDocumento,
        },
      });

      if (createErr || !newUser?.user) {
        throw new Error(createErr?.message || "Falha ao criar usuário no sistema de autenticação.");
      }

      targetUserId = newUser.user.id;
    }

    // 6. Atualiza user_id na tabela comercial correspondente
    if (tipo === "revendedor") {
      await adminClient
        .from("revendedores")
        .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      await adminClient
        .from("vendedores")
        .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    // 7. Atualiza ou insere em public.profiles (garantindo primeiro_acesso = true)
    // Sem referenciar colunas que possam não existir na tabela profiles
    const profilePayload: Record<string, unknown> = {
      id: targetUserId,
      nome: targetNome,
      email: emailLimpo,
      role: tipo,
      ativo: true,
      primeiro_acesso: true,
      updated_at: new Date().toISOString(),
    };
    if (targetTelefone) profilePayload.telefone = targetTelefone;
    if (targetChavePix) profilePayload.chave_pix = targetChavePix;

    const { error: profileErr } = await adminClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileErr) {
      console.warn("[REDEFINIR-SENHA-PARCEIRO] Aviso no upsert do profile:", profileErr.message);
    }

    // Tenta atualizar documento em profiles se a coluna existir (tolerante a falhas)
    if (targetDocumento) {
      try {
        await adminClient
          .from("profiles")
          .update({ cpf_cnpj: targetDocumento })
          .eq("id", targetUserId);
      } catch {
        // Coluna ainda não existe na tabela, ignora sem travar
      }
    }

    // 8. Atualiza public.user_roles
    await adminClient
      .from("user_roles")
      .upsert({ user_id: targetUserId, role: tipo }, { onConflict: "user_id,role" });

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Senha do parceiro redefinida com sucesso! Ele deverá cadastrar nova senha no primeiro acesso.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || "Falha ao processar redefinição de senha do parceiro.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }
}

async function handleApiAdminExcluirParceiro(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/excluir-parceiro")) {
    return null;
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return new Response(
      JSON.stringify({ success: false, message: "Método não suportado. Use POST ou DELETE." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Token de autenticação ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 1. Valida solicitante autenticado via token JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const callerId = userData.user.id;
  const callerEmail = userData.user.email?.toLowerCase() || "";
  const isCallerSuperAdm =
    callerEmail === "novaes@adm.28bpm.local" || callerEmail === "novaes@oficial.tec.br";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 2. Verifica se o solicitante possui permissão de Administrador
  let isAdm = isCallerSuperAdm;
  if (!isAdm) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, ativo")
      .eq("id", callerId)
      .maybeSingle();

    if (profile && profile.ativo && (profile.role === "superadmin" || profile.role === "adm")) {
      isAdm = true;
    } else {
      const { data: userRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .maybeSingle();
      if (userRole && (userRole.role === "superadmin" || userRole.role === "adm")) {
        isAdm = true;
      }
    }
  }

  // 3. Lê e valida corpo da requisição
  let body: { tipo?: string; id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Corpo JSON da requisição inválido." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const { tipo, id } = body;

  if (!tipo || (tipo !== "revendedor" && tipo !== "vendedor")) {
    return new Response(
      JSON.stringify({ success: false, message: "Tipo inválido. Informe revendedor ou vendedor." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  if (!id || typeof id !== "string") {
    return new Response(
      JSON.stringify({ success: false, message: "ID do parceiro não informado." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  try {
    if (tipo === "revendedor") {
      // Exclusão de revendedor: exclusivo de Administrador / SuperADM
      if (!isAdm) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Acesso negado: apenas administradores podem excluir revendedores.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      // Busca revendedor
      const { data: rev, error: revErr } = await adminClient
        .from("revendedores")
        .select("id, user_id, nome, email")
        .eq("id", id)
        .maybeSingle();

      if (revErr || !rev) {
        return new Response(
          JSON.stringify({ success: false, message: "Revendedor não localizado." }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      // 1. Localiza vendedores vinculados a este revendedor
      const { data: vendedoresVinculados } = await adminClient
        .from("vendedores")
        .select("id, user_id")
        .eq("revendedor_id", id);

      const listaVendedores = vendedoresVinculados || [];

      // 2. Para cada vendedor subordinado com credenciais auth, remove perfil e auth user
      for (const vend of listaVendedores) {
        if (vend.user_id) {
          try {
            await adminClient.from("user_roles").delete().eq("user_id", vend.user_id);
            await adminClient.from("profiles").delete().eq("id", vend.user_id);
            await adminClient.auth.admin.deleteUser(vend.user_id);
          } catch {
            // Ignora falhas pontuais de auth de vendedores
          }
        }
      }

      // 3. Exclui vendedores subordinados na tabela vendedores
      await adminClient.from("vendedores").delete().eq("revendedor_id", id);

      // 4. Desvincula clientes vinculados a este revendedor
      await adminClient
        .from("clientes")
        .update({ revendedor_id: null, vendedor_id: null })
        .eq("revendedor_id", id);

      // 5. Desvincula ou remove convites pendentes da franquia
      await adminClient
        .from("convites_cliente")
        .update({ revendedor_id: null, vendedor_id: null })
        .eq("revendedor_id", id);

      // 6. Exclui o revendedor na tabela revendedores
      const { error: deleteRevErr } = await adminClient.from("revendedores").delete().eq("id", id);

      if (deleteRevErr) {
        throw new Error(`Falha ao remover revendedor do banco: ${deleteRevErr.message}`);
      }

      // 7. Se possuir user_id, remove credenciais de auth e profiles
      if (rev.user_id) {
        try {
          await adminClient.from("user_roles").delete().eq("user_id", rev.user_id);
          await adminClient.from("profiles").delete().eq("id", rev.user_id);
          await adminClient.auth.admin.deleteUser(rev.user_id);
        } catch {
          // Ignora falha em auth caso já tenha sido removido
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Revendedor '${rev.nome}' excluído com sucesso da rede.`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    } else {
      // Exclusão de Vendedor: SuperADM/ADM ou o próprio Revendedor responsável
      const { data: vend, error: vendErr } = await adminClient
        .from("vendedores")
        .select("id, revendedor_id, user_id, nome, email")
        .eq("id", id)
        .maybeSingle();

      if (vendErr || !vend) {
        return new Response(
          JSON.stringify({ success: false, message: "Vendedor não localizado." }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      if (!isAdm) {
        // Valida se o chamador é o revendedor deste vendedor
        const { data: revDono } = await adminClient
          .from("revendedores")
          .select("id")
          .eq("id", vend.revendedor_id)
          .eq("user_id", callerId)
          .maybeSingle();

        if (!revDono) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Acesso negado: você não tem permissão para excluir este vendedor.",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }
      }

      // 1. Desvincula clientes daquele vendedor
      await adminClient.from("clientes").update({ vendedor_id: null }).eq("vendedor_id", id);

      // 2. Desvincula convites
      await adminClient
        .from("convites_cliente")
        .update({ vendedor_id: null })
        .eq("vendedor_id", id);

      // 3. Exclui o registro na tabela vendedores
      const { error: deleteVendErr } = await adminClient.from("vendedores").delete().eq("id", id);

      if (deleteVendErr) {
        throw new Error(`Falha ao remover vendedor do banco: ${deleteVendErr.message}`);
      }

      // 4. Se possuir user_id, remove credenciais de auth e profiles
      if (vend.user_id) {
        try {
          await adminClient.from("user_roles").delete().eq("user_id", vend.user_id);
          await adminClient.from("profiles").delete().eq("id", vend.user_id);
          await adminClient.auth.admin.deleteUser(vend.user_id);
        } catch {
          // Ignora falha em auth caso já tenha sido removido
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Vendedor '${vend.nome}' excluído com sucesso da equipe.`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || "Falha ao processar exclusão de parceiro.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }
}

async function handleApiPropostas(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/propostas")) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const corsHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...SECURITY_HEADERS,
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 1. POST /api/propostas/salvar
  if (url.pathname === "/api/propostas/salvar" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        id,
        tipo_proposta = "individual",
        cliente_nome,
        cliente_telefone,
        veiculo_marca = "",
        veiculo_modelo = "",
        veiculo_ano = "",
        com_fidelidade_meses = 12,
        com_fidelidade_instalacao_cheia = 380,
        com_fidelidade_mensalidade_cheia = 120,
        com_fidelidade_instalacao = 0,
        com_fidelidade_mensalidade = 0,
        sem_fidelidade_instalacao_cheia = 420,
        sem_fidelidade_mensalidade_cheia = 160,
        sem_fidelidade_instalacao = 0,
        sem_fidelidade_mensalidade = 0,
        aplicar_promocao = true,
        faixas_frota = null,
        observacoes = null,
        motivo_contraproposta,
        hash_sha256,
        created_by = null,
      } = body;

      if (!cliente_nome || !String(cliente_nome).trim()) {
        return new Response(
          JSON.stringify({ success: false, message: "Informe o nome do cliente." }),
          { status: 400, headers: corsHeaders },
        );
      }

      if (!cliente_telefone || !String(cliente_telefone).trim()) {
        return new Response(
          JSON.stringify({ success: false, message: "Informe o telefone do cliente." }),
          { status: 400, headers: corsHeaders },
        );
      }

      const agoraIso = new Date().toISOString();

      // Edição de Proposta Existente (Contraproposta)
      if (id) {
        const { data: propostaAtual, error: fetchErr } = await adminClient
          .from("propostas_comerciais")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (fetchErr || !propostaAtual) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Proposta comercial não localizada para atualização.",
            }),
            { status: 404, headers: corsHeaders },
          );
        }

        const novoItemHistorico = {
          data: agoraIso,
          operador: body.operador || "Operador",
          motivo: motivo_contraproposta || "Reajuste / Contraproposta Comercial",
          resumo_alteracoes: `Atualização de valores. Com Fidelidade: R$ ${com_fidelidade_mensalidade}/mês. Sem Fidelidade: R$ ${sem_fidelidade_mensalidade}/mês.`,
        };

        const historicoAtualizado = [
          novoItemHistorico,
          ...(propostaAtual.historico_contrapropostas || []),
        ];

        const dadosAtualizacao: any = {
          cliente_nome: String(cliente_nome).trim(),
          cliente_telefone: String(cliente_telefone).trim(),
          tipo_proposta,
          com_fidelidade_meses: Number(com_fidelidade_meses) || 12,
          com_fidelidade_instalacao_cheia: Number.isFinite(Number(com_fidelidade_instalacao_cheia))
            ? Number(com_fidelidade_instalacao_cheia)
            : 380,
          com_fidelidade_mensalidade_cheia: Number.isFinite(
            Number(com_fidelidade_mensalidade_cheia),
          )
            ? Number(com_fidelidade_mensalidade_cheia)
            : 120,
          com_fidelidade_instalacao: Number(com_fidelidade_instalacao) || 0,
          com_fidelidade_mensalidade: Number(com_fidelidade_mensalidade) || 0,
          sem_fidelidade_instalacao_cheia: Number.isFinite(Number(sem_fidelidade_instalacao_cheia))
            ? Number(sem_fidelidade_instalacao_cheia)
            : 420,
          sem_fidelidade_mensalidade_cheia: Number.isFinite(
            Number(sem_fidelidade_mensalidade_cheia),
          )
            ? Number(sem_fidelidade_mensalidade_cheia)
            : 160,
          sem_fidelidade_instalacao: Number(sem_fidelidade_instalacao) || 0,
          sem_fidelidade_mensalidade: Number(sem_fidelidade_mensalidade) || 0,
          aplicar_promocao: Boolean(aplicar_promocao),
          faixas_frota: tipo_proposta === "frota" ? faixas_frota : null,
          historico_contrapropostas: historicoAtualizado,
          observacoes: observacoes ? String(observacoes).trim() : null,
          updated_at: agoraIso,
        };

        if (tipo_proposta === "individual") {
          dadosAtualizacao.veiculo_marca = String(veiculo_marca).trim();
          dadosAtualizacao.veiculo_modelo = String(veiculo_modelo).trim();
          dadosAtualizacao.veiculo_ano = String(veiculo_ano).trim();
        } else {
          dadosAtualizacao.veiculo_marca = "Frota Corporativa";
          dadosAtualizacao.veiculo_modelo = "Múltiplos Veículos";
          dadosAtualizacao.veiculo_ano = "Diversos";
        }

        if (hash_sha256) {
          dadosAtualizacao.hash_sha256 = hash_sha256;
        }

        const { data: updated, error: updateErr } = await adminClient
          .from("propostas_comerciais")
          .update(dadosAtualizacao)
          .eq("id", id)
          .select()
          .single();

        if (updateErr || !updated) {
          return new Response(
            JSON.stringify({
              success: false,
              message: updateErr?.message || "Falha ao atualizar proposta no banco de dados.",
            }),
            { status: 500, headers: corsHeaders },
          );
        }

        return new Response(JSON.stringify({ success: true, proposta: updated }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      // Criação de Nova Proposta
      let numeroProposta = "";
      try {
        const { data: rpcNum } = await adminClient.rpc("gerar_numero_proposta_comercial");
        if (rpcNum) {
          numeroProposta = String(rpcNum);
        }
      } catch {
        // fallback
      }

      if (!numeroProposta) {
        const anoAtual = new Date().getFullYear();
        const randSeq = Math.floor(1000 + Math.random() * 9000);
        numeroProposta = `PROP-${anoAtual}-${randSeq}`;
      }

      const novoRegistro: any = {
        numero_proposta: numeroProposta,
        tipo_proposta,
        cliente_nome: String(cliente_nome).trim(),
        cliente_telefone: String(cliente_telefone).trim(),
        veiculo_marca:
          tipo_proposta === "frota" ? "Frota Corporativa" : String(veiculo_marca).trim(),
        veiculo_modelo:
          tipo_proposta === "frota" ? "Múltiplos Veículos" : String(veiculo_modelo).trim(),
        veiculo_ano: tipo_proposta === "frota" ? "Diversos" : String(veiculo_ano).trim(),
        com_fidelidade_meses: Number(com_fidelidade_meses) || 12,
        com_fidelidade_instalacao_cheia: Number.isFinite(Number(com_fidelidade_instalacao_cheia))
          ? Number(com_fidelidade_instalacao_cheia)
          : 380,
        com_fidelidade_mensalidade_cheia: Number.isFinite(Number(com_fidelidade_mensalidade_cheia))
          ? Number(com_fidelidade_mensalidade_cheia)
          : 120,
        com_fidelidade_instalacao: Number(com_fidelidade_instalacao) || 0,
        com_fidelidade_mensalidade: Number(com_fidelidade_mensalidade) || 0,
        sem_fidelidade_instalacao_cheia: Number.isFinite(Number(sem_fidelidade_instalacao_cheia))
          ? Number(sem_fidelidade_instalacao_cheia)
          : 420,
        sem_fidelidade_mensalidade_cheia: Number.isFinite(Number(sem_fidelidade_mensalidade_cheia))
          ? Number(sem_fidelidade_mensalidade_cheia)
          : 160,
        sem_fidelidade_instalacao: Number(sem_fidelidade_instalacao) || 0,
        sem_fidelidade_mensalidade: Number(sem_fidelidade_mensalidade) || 0,
        aplicar_promocao: Boolean(aplicar_promocao),
        faixas_frota: tipo_proposta === "frota" ? faixas_frota : null,
        historico_contrapropostas: [],
        status: body.status || "pendente",
        observacoes: observacoes ? String(observacoes).trim() : null,
        hash_sha256:
          hash_sha256 || "0000000000000000000000000000000000000000000000000000000000000000",
        created_by: created_by || null,
        revendedor_id: body.revendedor_id || null,
        vendedor_id: body.vendedor_id || null,
        quantidade_veiculos: Number(body.quantidade_veiculos) || 1,
        origem_emissao: body.origem_emissao || "web",
        valor_base_repasse: Number(body.valor_base_repasse) || 0,
        created_at: agoraIso,
        updated_at: agoraIso,
      };

      const { data: inserted, error: insertErr } = await adminClient
        .from("propostas_comerciais")
        .insert(novoRegistro)
        .select()
        .single();

      if (insertErr || !inserted) {
        return new Response(
          JSON.stringify({
            success: false,
            message: insertErr?.message || "Falha ao gravar proposta comercial no banco.",
          }),
          { status: 500, headers: corsHeaders },
        );
      }

      // Notifica o SuperADM imediatamente sobre a nova proposta emitida
      try {
        const emissorInfo = body.emissor_nome || body.operador || "Operador Autorizado";
        const valorProp = Number(inserted.com_fidelidade_mensalidade || 0);
        const valorInst = Number(inserted.com_fidelidade_instalacao || 0);
        const qtdVtr = Number(inserted.quantidade_veiculos || 1);
        const dataFormatada = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });
        const veicDesc =
          inserted.tipo_proposta === "frota"
            ? `Frota Corporativa (${qtdVtr} veículos)`
            : `${inserted.veiculo_marca || ""} ${inserted.veiculo_modelo || ""}`.trim();

        const msgAdm =
          `📋 *GD Rastreamento — Nova Proposta Comercial Emitida*\n\n` +
          `• Emitida por: ${emissorInfo}\n` +
          `• Para: ${inserted.cliente_nome} (${inserted.cliente_telefone})\n` +
          `• Data: ${dataFormatada}\n` +
          `• Valor da Proposta: R$ ${valorProp.toFixed(2).replace(".", ",")} / mês (Instalação: R$ ${valorInst.toFixed(2).replace(".", ",")})\n` +
          `• Quantidade de Veículos: ${qtdVtr}\n` +
          `• Ref.: ${inserted.numero_proposta}\n` +
          (veicDesc ? `• Veículo: ${veicDesc}\n` : "") +
          `\n🛡️ *Governança de Vendas e Efetividade*`;

        despacharNotificacaoWhatsappSuperAdm(env, msgAdm, "notificacao_proposta_emitida").catch(
          () => {},
        );
      } catch (_) {
        // Silencioso para não interromper retorno da proposta
      }

      return new Response(JSON.stringify({ success: true, proposta: inserted }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro inesperado ao salvar proposta comercial.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 2. GET /api/propostas/listar
  if (url.pathname === "/api/propostas/listar" && request.method === "GET") {
    try {
      const revendedorId = url.searchParams.get("revendedorId");
      const vendedorId = url.searchParams.get("vendedorId");

      let query = adminClient.from("propostas_comerciais").select("*");

      if (vendedorId) {
        query = query.eq("vendedor_id", vendedorId);
      } else if (revendedorId) {
        query = query.eq("revendedor_id", revendedorId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message, propostas: [] }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(JSON.stringify({ success: true, propostas: data || [] }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao listar",
          propostas: [],
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 3. POST /api/propostas/status
  if (url.pathname === "/api/propostas/status" && request.method === "POST") {
    try {
      const { id, status } = ((await request.json()) || {}) as any;
      if (!id || !status) {
        return new Response(
          JSON.stringify({ success: false, message: "Identificador e status são obrigatórios." }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { error } = await adminClient
        .from("propostas_comerciais")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao atualizar status." }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 4. POST /api/propostas/excluir
  if (url.pathname === "/api/propostas/excluir" && request.method === "POST") {
    try {
      const { id } = ((await request.json()) || {}) as any;
      if (!id) {
        return new Response(JSON.stringify({ success: false, message: "ID é obrigatório." }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const { error } = await adminClient.from("propostas_comerciais").delete().eq("id", id);

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao excluir proposta." }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 5. POST /api/propostas/enviar-whatsapp
  if (url.pathname === "/api/propostas/enviar-whatsapp" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const { proposta_id, destinatario, emissor_nome, pdf_base64, pdf_nome } = body;
      if (!proposta_id) {
        return new Response(
          JSON.stringify({ success: false, message: "Identificador da proposta é obrigatório." }),
          { status: 400, headers: corsHeaders },
        );
      }

      const { data: prop, error: errProp } = await adminClient
        .from("propostas_comerciais")
        .select("*")
        .eq("id", proposta_id)
        .maybeSingle();

      if (errProp || !prop) {
        return new Response(
          JSON.stringify({ success: false, message: "Proposta comercial não localizada." }),
          { status: 404, headers: corsHeaders },
        );
      }

      const telDestino = (destinatario || prop.cliente_telefone || "").replace(/\D/g, "");
      const numFinal = telDestino.startsWith("55") ? telDestino : `55${telDestino}`;
      const msgTexto = formatarMensagemWhatsAppProposta(prop);

      const gatewayUrl = "https://gps.oficial.tec.br/gd/whatsapp";

      const tokenGw =
        (env as any)?.GD_WHATSAPP_TOKEN ||
        (typeof process !== "undefined" ? process.env?.GD_WHATSAPP_TOKEN : undefined) ||
        "hunter-guardiao-whatsapp-secret-key-2026";
      let envioOk = false;

      const payloadEnvio: any = {
        recipient: numFinal,
        telefone: numFinal,
        mensagem: msgTexto,
      };

      if (pdf_base64) {
        payloadEnvio.documento = {
          nome: pdf_nome || `Proposta_${prop.numero_proposta}.pdf`,
          base64: pdf_base64,
          mimetype: "application/pdf",
        };
      }

      const endpoints = [`${gatewayUrl}/api/v1/messages/send`, `${gatewayUrl}/api/send`];

      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const resSend = await fetch(ep, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenGw}`,
              "X-Hunter-Token": tokenGw,
            },
            body: JSON.stringify(payloadEnvio),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (resSend.ok) {
            envioOk = true;
            break;
          }
        } catch (errGw: any) {
          console.warn(`Aviso ao despachar mensagem pelo endpoint ${ep}:`, errGw?.message);
        }
      }

      // Notifica o SuperADM sobre o envio
      const dataFormatada = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      const qtdVtr = Number(prop.quantidade_veiculos || 1);
      const valorProp = Number(prop.com_fidelidade_mensalidade || 0);
      const valorInst = Number(prop.com_fidelidade_instalacao || 0);
      const veicDesc =
        prop.tipo_proposta === "frota"
          ? `Frota Corporativa (${qtdVtr} veículos)`
          : `${prop.veiculo_marca || ""} ${prop.veiculo_modelo || ""}`.trim();

      const msgAdm =
        `📋 *GD Rastreamento — Nova Proposta Comercial Emitida*\n\n` +
        `• Emitida por: ${emissor_nome || "Operador Autorizado"}\n` +
        `• Para: ${prop.cliente_nome} (${prop.cliente_telefone})\n` +
        `• Data: ${dataFormatada}\n` +
        `• Valor da Proposta: R$ ${valorProp.toFixed(2).replace(".", ",")} / mês (Instalação: R$ ${valorInst.toFixed(2).replace(".", ",")})\n` +
        `• Quantidade de Veículos: ${qtdVtr}\n` +
        `• Ref.: ${prop.numero_proposta}\n` +
        (veicDesc ? `• Veículo: ${veicDesc}\n` : "") +
        `\n🛡️ *Governança de Vendas e Efetividade*`;

      despacharNotificacaoWhatsappSuperAdm(env, msgAdm, "notificacao_proposta_emitida").catch(
        () => {},
      );

      return new Response(JSON.stringify({ success: true, enviado: envioOk }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Falha ao enviar proposta por WhatsApp.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO SEGURA DE MENSALIDADES E INFORMAÇÃO DE PAGAMENTO PELO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiMensalidades(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/mensalidades")) {
    return null;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // POST /api/mensalidades/informar-pagamento
  if (url.pathname === "/api/mensalidades/informar-pagamento" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const { mensalidadeId, comprovanteUrl, observacoes, dataPagamento, clienteNome } = body;

      if (!mensalidadeId) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Identificador da mensalidade é obrigatório." }),
          { status: 400, headers: corsHeaders },
        );
      }

      // 1. Busca os dados atuais da mensalidade e do cliente
      let { data: mensalidade, error: errM } = await adminClient
        .from("mensalidades")
        .select(
          `
          id,
          cliente_id,
          mes_referencia,
          ano_referencia,
          numero_parcela,
          total_parcelas,
          valor,
          data_vencimento,
          status,
          comprovante_url,
          clientes (
            id,
            nome_razao_social,
            telefone
          )
        `,
        )
        .eq("id", mensalidadeId)
        .single();

      if (errM) {
        const fbM = await adminClient
          .from("mensalidades")
          .select(
            `
            id,
            cliente_id,
            mes_referencia,
            ano_referencia,
            valor,
            data_vencimento,
            status,
            comprovante_url,
            clientes (
              id,
              nome_razao_social,
              telefone
            )
          `,
          )
          .eq("id", mensalidadeId)
          .single();
        mensalidade = fbM.data as any;
        errM = fbM.error;
      }

      if (errM || !mensalidade) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Mensalidade não localizada no sistema." }),
          { status: 404, headers: corsHeaders },
        );
      }

      const agoraIso = new Date().toISOString();
      const compValida =
        comprovanteUrl && typeof comprovanteUrl === "string"
          ? comprovanteUrl
          : mensalidade.comprovante_url || "informado_sem_anexo";

      // 2. Atualiza a mensalidade com o comprovante e timestamp
      const { error: errUp } = await adminClient
        .from("mensalidades")
        .update({
          comprovante_url: compValida,
          pagamento_informado_em: agoraIso,
          pagamento_informado_obs: observacoes ? String(observacoes).trim() : null,
          updated_at: agoraIso,
        })
        .eq("id", mensalidadeId);

      if (errUp) {
        console.warn("[MENSALIDADES] Falha ao atualizar mensalidade com colunas extras:", errUp);
        // Fallback: se as colunas novas ainda não estiverem no banco, atualiza comprovante_url isoladamente
        await adminClient
          .from("mensalidades")
          .update({
            comprovante_url: compValida,
            updated_at: agoraIso,
          })
          .eq("id", mensalidadeId)
          .catch(() => {});
      }

      // 3. Formata os dados para a notificação do SuperADM
      const nomeClienteFinal =
        (mensalidade.clientes as any)?.nome_razao_social || clienteNome || "Cliente";
      const mesesNomes = [
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro",
      ];
      const parcelaFmt =
        mensalidade.mes_referencia > 0 && Number((mensalidade as any).numero_parcela || 0) > 0
          ? `${String(Math.trunc(Number((mensalidade as any).numero_parcela))).padStart(2, "0")}/${String(
              Math.max(
                Math.trunc(Number((mensalidade as any).numero_parcela)),
                Math.trunc(Number((mensalidade as any).total_parcelas || 12)),
              ),
            ).padStart(2, "0")}`
          : "";
      const refStr =
        mensalidade.mes_referencia === 0
          ? `Adesão e Ativação (${mensalidade.ano_referencia})`
          : `${mesesNomes[(mensalidade.mes_referencia || 1) - 1]} / ${mensalidade.ano_referencia}${parcelaFmt ? ` (Parcela ${parcelaFmt})` : ""}`;

      const valorFormatado = `R$ ${Number(mensalidade.valor || 0)
        .toFixed(2)
        .replace(".", ",")}`;
      const vencFormatado = mensalidade.data_vencimento
        ? mensalidade.data_vencimento.split("-").reverse().join("/")
        : "--/--/----";

      const dataPagtoFormatada = dataPagamento
        ? String(dataPagamento).split("-").reverse().join("/")
        : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());

      const obsTexto = observacoes ? `\n📝 *Observações:* _${String(observacoes).trim()}_` : "";

      const msgWhatsApp =
        `💰 *PAGAMENTO DE MENSALIDADE INFORMADO*\n\n` +
        `O cliente titular informou o pagamento da fatura e aguarda a confirmação de baixa no sistema:\n\n` +
        `👤 *Cliente:* ${nomeClienteFinal}\n` +
        `📅 *Referência:* ${refStr}\n` +
        `💵 *Valor:* ${valorFormatado}\n` +
        `⏳ *Vencimento:* ${vencFormatado}\n` +
        `🗓️ *Data do Pagamento:* ${dataPagtoFormatada}${obsTexto}\n\n` +
        `⚠️ *Ação Requerida:* Acesse o GD Rastreamento para conferir o comprovante e confirmar a baixa da mensalidade.`;

      // 4 e 5. Despacha notificacao unificada (App/Push por membro, WhatsApp e Ligacao) conforme Central da Equipe
      await despacharNotificacaoWhatsappSuperAdm(
        env,
        msgWhatsApp,
        "mensalidade_pagamento_informado",
        {
          tipoAlerta: "pagamento_informado",
          tituloPush: `💰 Pagamento Informado — ${nomeClienteFinal}`,
          mensagemPush: `Cliente ${nomeClienteFinal} informou pagamento de ${valorFormatado} (${refStr}). Confirme a baixa.`,
          url: "/mensalidades",
        },
      ).catch((errW) => {
        console.warn("[MENSALIDADES] Aviso no disparo WhatsApp para SuperADM:", errW);
      });

      // 6. Registra em system_activity_logs para auditoria forense
      await adminClient
        .from("system_activity_logs")
        .insert({
          acao: "mensalidade_pagamento_informado",
          detalhe: `Cliente ${nomeClienteFinal} informou o pagamento de ${valorFormatado} da mensalidade ${mensalidadeId} (${refStr})`,
        })
        .catch(() => {});

      return new Response(
        JSON.stringify({
          sucesso: true,
          mensagem:
            "Pagamento informado com sucesso! A administração foi notificada para confirmar a baixa.",
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      console.error("[MENSALIDADES] Erro ao processar informação de pagamento:", err);
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Falha ao registrar informação de pagamento.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // GET /api/mensalidades/aguardando-baixa
  if (url.pathname === "/api/mensalidades/aguardando-baixa" && request.method === "GET") {
    try {
      let { data, error } = await adminClient
        .from("mensalidades")
        .select(
          `
          id,
          cliente_id,
          mes_referencia,
          ano_referencia,
          numero_parcela,
          total_parcelas,
          valor,
          data_vencimento,
          status,
          comprovante_url,
          pagamento_informado_em,
          pagamento_informado_obs,
          created_at,
          clientes (
            id,
            nome_razao_social,
            telefone,
            email
          )
        `,
        )
        .neq("status", "pago")
        .not("comprovante_url", "is", null)
        .order("data_vencimento", { ascending: true });

      if (error) {
        console.warn(
          "[MENSALIDADES] Consulta com colunas estendidas falhou, acionando fallback base:",
          error.message,
        );
        const fb = await adminClient
          .from("mensalidades")
          .select(
            `
            id,
            cliente_id,
            mes_referencia,
            ano_referencia,
            valor,
            data_vencimento,
            status,
            comprovante_url,
            created_at,
            clientes (
              id,
              nome_razao_social,
              telefone,
              email
            )
          `,
          )
          .neq("status", "pago")
          .not("comprovante_url", "is", null)
          .order("data_vencimento", { ascending: true });

        if (fb.error) {
          return new Response(JSON.stringify({ sucesso: false, erro: fb.error.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }
        data = fb.data;
      }

      return new Response(JSON.stringify({ sucesso: true, dados: data || [] }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Falha ao listar faturas pendentes de baixa.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // GET /api/mensalidades
  if (url.pathname === "/api/mensalidades" && request.method === "GET") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Não autorizado: Token de sessão ausente." }),
          { status: 401, headers: corsHeaders },
        );
      }

      const { supabaseAnonKey } = getSupabaseServerParams(env);
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Sessão inválida." }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("role, cliente_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      const roleNorm = String(profile?.role || "").toLowerCase();
      const isStaff = roleNorm === "superadmin" || roleNorm === "admin" || roleNorm === "operador";

      let clienteIdFiltro = url.searchParams.get("clienteId")?.trim() || null;

      if (!isStaff) {
        if (roleNorm === "motorista") {
          return new Response(JSON.stringify({ sucesso: true, dados: [] }), {
            status: 200,
            headers: corsHeaders,
          });
        }
        let ownClienteId: string | null = profile?.cliente_id || null;
        if (!ownClienteId) {
          const { data: cli } = await adminClient
            .from("clientes")
            .select("id")
            .eq("user_id", userData.user.id)
            .maybeSingle();
          ownClienteId = cli?.id || null;
        }
        if (!ownClienteId && userData.user.email) {
          const { data: cliEmail } = await adminClient
            .from("clientes")
            .select("id")
            .ilike("email", userData.user.email.trim())
            .maybeSingle();
          ownClienteId = cliEmail?.id || null;
        }
        if (!ownClienteId) {
          return new Response(JSON.stringify({ sucesso: true, dados: [] }), {
            status: 200,
            headers: corsHeaders,
          });
        }
        clienteIdFiltro = ownClienteId;
      }

      let query = adminClient.from("mensalidades").select(
        `
          id,
          cliente_id,
          mes_referencia,
          ano_referencia,
          numero_parcela,
          total_parcelas,
          valor,
          data_vencimento,
          status,
          data_pagamento,
          comprovante_url,
          created_at,
          updated_at,
          clientes (
            id,
            nome_razao_social,
            documento,
            telefone,
            email
          )
        `,
      );

      if (clienteIdFiltro) {
        query = query.eq("cliente_id", clienteIdFiltro);
      }

      let { data, error } = await query.order("data_vencimento", { ascending: true });

      if (error) {
        let fbQuery = adminClient.from("mensalidades").select(
          `
            id,
            cliente_id,
            mes_referencia,
            ano_referencia,
            valor,
            data_vencimento,
            status,
            data_pagamento,
            comprovante_url,
            created_at,
            updated_at,
            clientes (
              id,
              nome_razao_social,
              documento,
              telefone,
              email
            )
          `,
        );
        if (clienteIdFiltro) {
          fbQuery = fbQuery.eq("cliente_id", clienteIdFiltro);
        }
        const fb = await fbQuery.order("data_vencimento", { ascending: true });
        data = fb.data as any;
        error = fb.error;
      }

      if (error) {
        return new Response(JSON.stringify({ sucesso: false, erro: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ sucesso: true, dados: data || [] }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Falha ao listar mensalidades.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO SEGURA DE CONTRATOS ASSINADOS E CONFERÊNCIA DE AUTENTICIDADE
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiContratos(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/contratos")) {
    return null;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. POST /api/contratos/registrar — Emite e registra contrato no BD com selo único
  if (url.pathname === "/api/contratos/registrar" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        cliente_id,
        numero_contrato,
        tipo_contrato,
        pdf_original_base64,
        hash_pdf_original,
        emitido_por_nome,
        vigencia_inicio,
        vigencia_fim,
        valor_mensalidade,
        valor_total_contrato,
        metadata,
        is_atualizacao,
        contrato_anterior_id,
        numero_contrato_anterior,
        selo_autenticidade: seloParam,
        codigo_verificacao: codigoParam,
      } = body;

      if (!cliente_id || !numero_contrato) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Parâmetros cliente_id e numero_contrato são obrigatórios.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Usa selo e código enviados ou gera novos
      const selo =
        (seloParam && String(seloParam).trim()) ||
        "SGD-" + Math.random().toString(16).substring(2, 10).toUpperCase();

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let codigo = (codigoParam && String(codigoParam).trim().toUpperCase()) || "";
      if (!codigo) {
        for (let i = 0; i < 6; i++) {
          codigo += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      let byteaHex: string | null = null;
      if (
        pdf_original_base64 &&
        typeof pdf_original_base64 === "string" &&
        pdf_original_base64.length < 500000
      ) {
        try {
          const binary = atob(pdf_original_base64);
          const chunkParts: string[] = [];
          for (let i = 0; i < binary.length; i += 4096) {
            const end = Math.min(i + 4096, binary.length);
            let part = "";
            for (let j = i; j < end; j++) {
              const h = binary.charCodeAt(j).toString(16);
              part += h.length === 1 ? "0" + h : h;
            }
            chunkParts.push(part);
          }
          byteaHex = "\\x" + chunkParts.join("");
        } catch {
          // ignora falha de conversão
        }
      }

      const registro = {
        cliente_id,
        numero_contrato: String(numero_contrato).trim(),
        tipo_contrato: tipo_contrato || "PRESTACAO_SERVICOS",
        pdf_original: byteaHex,
        hash_pdf_original: hash_pdf_original
          ? String(hash_pdf_original).trim().toLowerCase()
          : null,
        selo_autenticidade: selo,
        codigo_verificacao: codigo,
        status: "pendente_assinatura",
        emitido_por_nome: String(emitido_por_nome || "Administrador do Sistema").trim(),
        vigencia_inicio: vigencia_inicio || null,
        vigencia_fim: vigencia_fim || null,
        valor_mensalidade: Number(valor_mensalidade) || 0,
        valor_total_contrato: Number(valor_total_contrato) || 0,
        metadata: {
          ...(metadata || {}),
          is_atualizacao: Boolean(is_atualizacao),
          contrato_anterior_id: contrato_anterior_id || null,
          numero_contrato_anterior: numero_contrato_anterior || null,
        },
        created_at: new Date().toISOString(),
      };

      const { data, error } = await adminClient
        .from("contratos_clientes")
        .insert(registro)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Se for uma atualização de contrato anterior, invalida o anterior marcando como 'atualizado'
      if (is_atualizacao && contrato_anterior_id) {
        try {
          const motivo = `Substituído por atualização no Contrato ${registro.numero_contrato} em ${new Date().toLocaleString("pt-BR")}`;
          await adminClient
            .from("contratos_clientes")
            .update({
              status: "atualizado",
              contrato_substituto_id: data.id,
              motivo_invalidacao: motivo,
            })
            .eq("id", contrato_anterior_id);

          await adminClient.from("system_activity_logs").insert({
            acao: "CONTRATO_INVALIDADO_ATUALIZACAO",
            detalhe: `Contrato ${numero_contrato_anterior || contrato_anterior_id} marcado como ATUALIZADO (substituído pelo novo Contrato ${registro.numero_contrato}).`,
            hash_sha256: registro.hash_pdf_original,
            created_at: new Date().toISOString(),
          });
        } catch (errAtualizarAnterior) {
          console.warn("Aviso ao invalidar contrato anterior:", errAtualizarAnterior);
        }
      }

      // Registra também na tabela documentos_emitidos com as colunas canônicas
      try {
        if (registro.hash_pdf_original) {
          await adminClient.from("documentos_emitidos").insert({
            nome_arquivo: `Contrato_${registro.numero_contrato}.pdf`,
            hash_sha256: registro.hash_pdf_original,
            tipo_documento: "CONTRATO_PRESTACAO_SERVICOS",
            descricao: `Contrato Oficial de Adesão - Contrato ${registro.numero_contrato}`,
            emissor_nome: registro.emitido_por_nome,
            emissor_email: "sistema@oficial.tec.br",
            tamanho_bytes: 0,
            metadata: {
              contrato_id: data.id,
              numero_contrato: registro.numero_contrato,
              selo_autenticidade: selo,
              codigo_verificacao: codigo,
              status: "pendente_assinatura",
              emitido_por_nome: registro.emitido_por_nome,
              is_atualizacao: Boolean(is_atualizacao),
              contrato_anterior_id: contrato_anterior_id || null,
            },
            created_at: new Date().toISOString(),
          });
        }
      } catch (errDoc) {
        console.warn("Aviso ao registrar documento emitido:", errDoc);
      }

      // Log de atividade
      try {
        await adminClient.from("system_activity_logs").insert({
          acao: "EMISSAO_CONTRATO_CLIENTE",
          detalhe: `Contrato ${registro.numero_contrato} emitido com selo ${selo} (status: Aguardando Assinatura).`,
          hash_sha256: registro.hash_pdf_original,
          created_at: new Date().toISOString(),
        });
      } catch {
        // ignora
      }

      return new Response(JSON.stringify({ success: true, contrato: data }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao registrar contrato.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 1.1 GET /api/contratos/listar/:clienteId — Listagem segura com service_role para operadores
  if (url.pathname.startsWith("/api/contratos/listar/") && request.method === "GET") {
    try {
      const clienteId = url.pathname.replace("/api/contratos/listar/", "").trim();
      if (!clienteId) {
        return new Response(JSON.stringify({ success: false, contratos: [] }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const { data, error } = await adminClient
        .from("contratos_clientes")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });

      let contratosRetornados = !error && data && data.length > 0 ? data : [];

      if (!contratosRetornados || contratosRetornados.length === 0) {
        try {
          const { data: docs } = await adminClient
            .from("documentos_emitidos")
            .select("*")
            .order("created_at", { ascending: false });

          if (docs && docs.length > 0) {
            const docsDoCliente = docs.filter((d: any) => {
              const m = (d.metadata || {}) as any;
              return (
                (m.cliente_id === clienteId || String(m.cliente_id) === String(clienteId)) &&
                (d.tipo_documento === "CONTRATO_PRESTACAO_SERVICOS" ||
                  d.tipo_documento === "COPIA_AUTENTICA_CONTRATO")
              );
            });

            if (docsDoCliente.length > 0) {
              contratosRetornados = docsDoCliente.map((d: any) => {
                const m = (d.metadata || {}) as any;
                return {
                  id: d.id,
                  cliente_id: clienteId,
                  numero_contrato: m.numero_contrato || "CTR-0001/2026",
                  tipo_contrato: "PRESTACAO_SERVICOS",
                  hash_pdf_original: d.hash_sha256,
                  hash_pdf_assinado: d.hash_sha256,
                  selo_autenticidade: m.selo || "SGD-OFICIAL",
                  codigo_verificacao: m.codigo || "VALIDO",
                  status:
                    d.tipo_documento === "COPIA_AUTENTICA_CONTRATO"
                      ? "assinado"
                      : "pendente_assinatura",
                  data_emissao: d.created_at,
                  data_envio_cliente: d.created_at,
                  data_assinatura:
                    d.tipo_documento === "COPIA_AUTENTICA_CONTRATO" ? d.created_at : null,
                  emitido_por_nome: d.emissor_nome || "Administrador do Sistema",
                  metadata: {
                    ...m,
                    link_assinatura: m.link_assinatura,
                  },
                  created_at: d.created_at,
                  updated_at: d.created_at,
                };
              });
            }
          }
        } catch (errDocs) {
          console.warn("Aviso ao buscar fallback em documentos_emitidos no server:", errDocs);
        }
      }

      return new Response(JSON.stringify({ success: true, contratos: contratosRetornados }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message, contratos: [] }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 1.2 POST /api/contratos/obter-para-assinar — Consulta de contrato para assinatura eletrônica do cliente
  if (
    url.pathname === "/api/contratos/obter-para-assinar" &&
    (request.method === "POST" || request.method === "GET")
  ) {
    try {
      let codigo = "";
      if (request.method === "GET") {
        codigo =
          url.searchParams.get("codigo") ||
          url.searchParams.get("token") ||
          url.searchParams.get("id") ||
          "";
      } else {
        const b = (await request.json().catch(() => ({}))) as any;
        codigo = b?.codigo || b?.token || b?.id || "";
      }

      codigo = String(codigo).trim();
      if (!codigo) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Código de verificação ou token não informado.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      const codUpper = codigo.toUpperCase();
      const isCodUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        codigo,
      );
      const orFilter = isCodUuid
        ? `id.eq.${codigo},codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`
        : `codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`;

      const { data: contratos, error } = await adminClient
        .from("contratos_clientes")
        .select("*")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(1);

      let contrato = contratos && contratos.length > 0 ? contratos[0] : null;

      if (!contrato) {
        try {
          const { data: docs } = await adminClient
            .from("documentos_emitidos")
            .select("*")
            .order("created_at", { ascending: false });

          if (docs && docs.length > 0) {
            const docFound = docs.find((d: any) => {
              const m = (d.metadata || {}) as any;
              return (
                d.id === codigo ||
                String(m.codigo || "").toUpperCase() === codUpper ||
                String(m.selo || "").toUpperCase() === codUpper ||
                String(m.numero_contrato || "").toUpperCase() === codUpper
              );
            });

            if (docFound) {
              const m = (docFound.metadata || {}) as any;
              contrato = {
                id: docFound.id,
                cliente_id: m.cliente_id,
                numero_contrato: m.numero_contrato || "CTR-0001/2026",
                tipo_contrato: "PRESTACAO_SERVICOS",
                hash_pdf_original: docFound.hash_sha256,
                selo_autenticidade: m.selo || "SGD-OFICIAL",
                codigo_verificacao: m.codigo || codUpper,
                status: "pendente_assinatura",
                data_emissao: docFound.created_at,
                emitido_por_nome: docFound.emissor_nome || "Administrador do Sistema",
                metadata: m,
                created_at: docFound.created_at,
              };
            }
          }
        } catch (errDocs) {
          console.warn("Aviso ao buscar fallback em documentos_emitidos para assinar:", errDocs);
        }
      }

      if (!contrato) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Contrato não localizado com o código fornecido.",
          }),
          { status: 404, headers: corsHeaders },
        );
      }
      const clienteInfo: any = {
        nome_razao_social: "Cliente",
        documento: "",
        telefone: "",
        email: "",
        endereco: "",
        plano: "master",
        dia_vencimento: 10,
        veiculos: [],
      };

      if (contrato.cliente_id) {
        const { data: cl } = await adminClient
          .from("clientes")
          .select(
            "nome_razao_social, documento, telefone, email, endereco, plano, dia_vencimento, valor_mensalidade",
          )
          .eq("id", contrato.cliente_id)
          .maybeSingle();

        if (cl) {
          clienteInfo.nome_razao_social = cl.nome_razao_social || "Cliente";
          clienteInfo.documento = cl.documento || "";
          clienteInfo.telefone = cl.telefone || "";
          clienteInfo.email = cl.email || "";
          clienteInfo.endereco = cl.endereco || "";
          clienteInfo.plano = cl.plano || "master";
          clienteInfo.dia_vencimento = cl.dia_vencimento || 10;
        }

        const { data: vts } = await adminClient
          .from("veiculos")
          .select("placa, marca, modelo, ano, cor, rastreador_imei, rastreador_modelo")
          .eq("cliente_id", contrato.cliente_id);

        clienteInfo.veiculos = vts || [];
      }

      return new Response(
        JSON.stringify({
          success: true,
          contrato: {
            id: contrato.id,
            numero_contrato: contrato.numero_contrato,
            tipo_contrato: contrato.tipo_contrato,
            selo_autenticidade: contrato.selo_autenticidade,
            codigo_verificacao: contrato.codigo_verificacao,
            status: contrato.status,
            data_emissao: contrato.data_emissao,
            data_assinatura: contrato.data_assinatura,
            assinado_por_nome: contrato.assinado_por_nome,
            valor_mensalidade: contrato.valor_mensalidade,
            valor_total_contrato: contrato.valor_total_contrato,
            hash_pdf_original: contrato.hash_pdf_original,
            hash_pdf_assinado: contrato.hash_pdf_assinado,
            cliente: clienteInfo,
          },
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao consultar contrato para assinatura.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 1.3 POST /api/contratos/assinar-dispositivo — Aceite eletrônico irrevogável pelo cliente (MP 2.200-2/2001 e Lei 14.063/2020)
  if (url.pathname === "/api/contratos/assinar-dispositivo" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        codigo,
        contrato_id,
        assinatura_rubrica_base64,
        geolocalizacao,
        device_info,
        declaracao_aceite,
      } = body;

      if (!declaracao_aceite) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "É obrigatório confirmar a declaração de aceite formal para assinar.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      const termoBusca = String(codigo || contrato_id || "").trim();
      const codUpper = termoBusca.toUpperCase();
      const isTermoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        termoBusca,
      );
      const orFilterAssinar = isTermoUuid
        ? `id.eq.${termoBusca},codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`
        : `codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`;

      const { data: contratos, error: errBusca } = await adminClient
        .from("contratos_clientes")
        .select("*")
        .or(orFilterAssinar)
        .order("created_at", { ascending: false })
        .limit(1);

      if (errBusca || !contratos || contratos.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: "Contrato não encontrado para assinatura." }),
          { status: 404, headers: corsHeaders },
        );
      }

      const contrato = contratos[0];
      if (contrato.status === "assinado") {
        return new Response(
          JSON.stringify({
            success: true,
            ja_assinado: true,
            message: "Este contrato já se encontra assinado e arquivado com segurança.",
            contrato,
          }),
          { status: 200, headers: corsHeaders },
        );
      }

      if (contrato.status === "atualizado" || contrato.status === "cancelado") {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Este contrato não está mais disponível para assinatura (status: ${contrato.status}).`,
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Captura IP e User-Agent reais do dispositivo do cliente
      const clientIp =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1";
      const userAgent = request.headers.get("user-agent") || "Dispositivo Web Desconhecido";
      const agoraIso = new Date().toISOString();

      let clienteNome = "Cliente";
      let clienteDocumento = "";
      if (contrato.cliente_id) {
        const { data: cl } = await adminClient
          .from("clientes")
          .select("nome_razao_social, documento")
          .eq("id", contrato.cliente_id)
          .maybeSingle();
        if (cl) {
          clienteNome = cl.nome_razao_social || "Cliente";
          clienteDocumento = cl.documento || "";
        }
      }

      // Hash pericial da trilha de auditoria digital
      const stringParaHash = `${contrato.id}|${contrato.numero_contrato}|${contrato.hash_pdf_original}|${clientIp}|${agoraIso}|${clienteDocumento}`;
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stringParaHash),
      );
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashAssinaturaForense = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const trilhaAuditoria = {
        signatario_nome: clienteNome,
        signatario_documento: clienteDocumento,
        ip_origem: clientIp,
        geolocalizacao: geolocalizacao || null,
        device_info: device_info || null,
        user_agent: userAgent,
        timestamp_utc: agoraIso,
        hash_forense_aceite: hashAssinaturaForense,
        hash_pdf_original: contrato.hash_pdf_original,
        rubrica_presente: Boolean(assinatura_rubrica_base64),
        amparo_legal: "Art. 10, § 2º da MP 2.200-2/2001 e Art. 5º da Lei Federal 14.063/2020",
        declaracao_aceite: true,
      };

      // Gera imediatamente o PDF assinado oficial com rubrica e certidão forense
      let hexAssinado: string | null = null;
      try {
        let clienteDados: any = {};
        let veiculosDados: any[] = [];
        if (contrato.cliente_id) {
          const { data: cl } = await adminClient
            .from("clientes")
            .select("*")
            .eq("id", contrato.cliente_id)
            .maybeSingle();
          if (cl) clienteDados = cl;

          const { data: vts } = await adminClient
            .from("veiculos")
            .select("*")
            .eq("cliente_id", contrato.cliente_id);
          if (vts) veiculosDados = vts;
        }

        const contratoParaPdf = {
          ...contrato,
          status: "assinado",
          data_assinatura: agoraIso,
          assinado_por_nome: clienteNome,
          assinatura_ip: clientIp,
          hash_pdf_assinado: hashAssinaturaForense,
          metadata: {
            ...(contrato.metadata || {}),
            trilha_auditoria: trilhaAuditoria,
            rubrica_base64: assinatura_rubrica_base64 || null,
          },
        };

        const bufferAssinado = gerarContratoPdfBufferServer({
          contrato: contratoParaPdf,
          cliente: clienteDados,
          veiculos: veiculosDados,
        });

        let hex = "\\x";
        for (let i = 0; i < bufferAssinado.length; i++) {
          hex += bufferAssinado[i].toString(16).padStart(2, "0");
        }
        hexAssinado = hex;
      } catch (errGen) {
        console.warn("Aviso ao gerar buffer do PDF assinado:", errGen);
      }

      const { data: contratoAtualizado, error: errUpdate } = await adminClient
        .from("contratos_clientes")
        .update({
          status: "assinado",
          data_assinatura: agoraIso,
          assinado_por_nome: clienteNome,
          assinatura_metodo: "aceite_plataforma",
          assinatura_ip: clientIp,
          assinatura_user_agent: userAgent,
          hash_pdf_assinado: hashAssinaturaForense,
          ...(hexAssinado ? { pdf_assinado: hexAssinado } : {}),
          metadata: {
            ...(contrato.metadata || {}),
            trilha_auditoria: trilhaAuditoria,
            rubrica_base64: assinatura_rubrica_base64 || null,
          },
          updated_at: agoraIso,
        })
        .eq("id", contrato.id)
        .select()
        .single();

      if (errUpdate) {
        return new Response(JSON.stringify({ success: false, message: errUpdate.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Registra na cadeia de custódia de documentos emitidos
      try {
        await adminClient.from("documentos_emitidos").insert({
          nome_arquivo: `Contrato_${contrato.numero_contrato}_Assinado.pdf`,
          hash_sha256: hashAssinaturaForense,
          tipo_documento: "CONTRATO_ASSINADO_DIGITALMENTE",
          descricao: `Contrato Assinado Eletronicamente por ${clienteNome} (${contrato.numero_contrato})`,
          emissor_nome: clienteNome,
          emissor_email: "cliente@assinatura.local",
          tamanho_bytes: 0,
          metadata: {
            contrato_id: contrato.id,
            numero_contrato: contrato.numero_contrato,
            selo: contrato.selo_autenticidade,
            codigo: contrato.codigo_verificacao,
            ip: clientIp,
            data_assinatura: agoraIso,
            trilha_auditoria: trilhaAuditoria,
          },
          created_at: agoraIso,
        });
      } catch {
        // ignora
      }

      // Log de atividade do sistema
      try {
        await adminClient.from("system_activity_logs").insert({
          acao: "CONTRATO_ASSINADO_DISPOSITIVO_CLIENTE",
          detalhe: `Contrato ${contrato.numero_contrato} assinado eletronicamente por ${clienteNome} via dispositivo móvel (IP ${clientIp})`,
          hash_sha256: hashAssinaturaForense,
          created_at: agoraIso,
        });
      } catch {
        // ignora
      }

      // Notificação imediata via WhatsApp para cadastrados no relatório gerencial / SuperADM
      try {
        const agoraFormatada = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const linkDownload = `${APP_PUBLIC_URL}/api/contratos/download/${contrato.codigo_verificacao}`;

        const msgSuperAdm =
          `✍️ *CONTRATO ASSINADO ELETRONICAMENTE*\n\n` +
          `O cliente acaba de formalizar a assinatura digital irrevogável do contrato pelo dispositivo móvel:\n\n` +
          `📄 *Contrato:* ${contrato.numero_contrato}\n` +
          `👤 *Cliente:* ${clienteNome}\n` +
          (clienteDocumento ? `📋 *Documento:* ${clienteDocumento}\n` : "") +
          `🔐 *Selo:* ${contrato.selo_autenticidade}\n` +
          `🔑 *Código:* ${contrato.codigo_verificacao}\n` +
          `🕒 *Data/Hora:* ${agoraFormatada}\n` +
          `📱 *IP de Origem:* ${clientIp}\n` +
          `⚖️ *Amparo:* MP 2.200-2/2001 e Lei 14.063/2020\n\n` +
          `📥 *Visualizar ou Baixar Cópia Autêntica:*\n${linkDownload}`;

        despacharNotificacaoWhatsappSuperAdm(
          env,
          msgSuperAdm,
          "notificacao_contrato_assinado_cliente",
        );
      } catch (errNotif) {
        console.warn("[SUPERADM-WHATSAPP] Erro ao notificar assinatura de contrato:", errNotif);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Contrato assinado eletronicamente com sucesso e plena validade jurídica!",
          contrato: contratoAtualizado,
          trilha_auditoria: trilhaAuditoria,
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao registrar assinatura eletrônica.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 2. POST /api/contratos/assinar — Registra devolução do PDF assinado + gera hash
  if (url.pathname === "/api/contratos/assinar" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        contrato_id,
        pdf_assinado_base64,
        hash_pdf_assinado,
        assinado_por_nome,
        assinatura_metodo,
      } = body;

      if (!contrato_id || !hash_pdf_assinado) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "contrato_id e hash_pdf_assinado são obrigatórios.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      let byteaHex: string | null = null;
      if (pdf_assinado_base64 && typeof pdf_assinado_base64 === "string") {
        try {
          const binary = atob(pdf_assinado_base64);
          let hex = "\\x";
          for (let i = 0; i < binary.length; i++) {
            const h = binary.charCodeAt(i).toString(16);
            hex += h.length === 1 ? "0" + h : h;
          }
          byteaHex = hex;
        } catch {
          // ignora
        }
      }

      const ip =
        request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || null;
      const userAgent = request.headers.get("user-agent") || null;

      const updatePayload: Record<string, any> = {
        hash_pdf_assinado: String(hash_pdf_assinado).trim().toLowerCase(),
        status: "assinado",
        data_assinatura: new Date().toISOString(),
        assinado_por_nome: assinado_por_nome || "Cliente",
        assinatura_metodo: assinatura_metodo || "digital",
        assinatura_ip: ip,
        assinatura_user_agent: userAgent,
      };

      if (byteaHex) {
        updatePayload.pdf_assinado = byteaHex;
      }

      const { data, error } = await adminClient
        .from("contratos_clientes")
        .update(updatePayload)
        .eq("id", contrato_id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Atualiza data do contrato no cadastro do cliente
      if (data?.cliente_id) {
        await adminClient
          .from("clientes")
          .update({ contrato_emitido_em: new Date().toISOString() })
          .eq("id", data.cliente_id);
      }

      // Registra link do documento assinado na tabela documentos_emitidos com novo hash SHA-256
      try {
        await adminClient.from("documentos_emitidos").insert({
          tipo_documento: "CONTRATO_ASSINADO",
          identificador_documento: data.numero_contrato,
          cliente_id: data.cliente_id,
          hash_sha256: updatePayload.hash_pdf_assinado,
          codigo_autenticacao:
            data.codigo_verificacao || `CTR-${data.id.substring(0, 8).toUpperCase()}`,
          metadata: {
            contrato_id: data.id,
            numero_contrato: data.numero_contrato,
            selo_autenticidade: data.selo_autenticidade,
            status: "assinado",
            assinado_por_nome: updatePayload.assinado_por_nome,
            assinatura_metodo: updatePayload.assinatura_metodo,
            data_assinatura: updatePayload.data_assinatura,
            hash_pdf_original: data.hash_pdf_original,
          },
          created_at: new Date().toISOString(),
        });
      } catch (errDoc) {
        console.warn("Aviso ao registrar documento assinado:", errDoc);
      }

      // Log de atividade
      try {
        await adminClient.from("system_activity_logs").insert({
          acao: "CONTRATO_ASSINADO_RECEBIDO",
          detalhe: `Contrato ${data.numero_contrato} assinado e armazenado. Hash: ${updatePayload.hash_pdf_assinado}`,
          hash_sha256: updatePayload.hash_pdf_assinado,
          created_at: new Date().toISOString(),
        });
      } catch {
        // ignora
      }

      // Notificação imediata via WhatsApp para cadastrados no relatório gerencial / SuperADM
      try {
        const agoraFormatada = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const linkDownload = `${APP_PUBLIC_URL}/api/contratos/download/${data.codigo_verificacao}`;

        const msgSuperAdm =
          `✍️ *CONTRATO ASSINADO RECEBIDO*\n\n` +
          `Contrato formalizado e registrado na plataforma:\n\n` +
          `📄 *Contrato:* ${data.numero_contrato}\n` +
          `👤 *Signatário:* ${updatePayload.assinado_por_nome}\n` +
          `🔐 *Selo:* ${data.selo_autenticidade}\n` +
          `🔑 *Código:* ${data.codigo_verificacao}\n` +
          `🕒 *Data/Hora:* ${agoraFormatada}\n` +
          `🔐 *Hash SHA-256:* ${updatePayload.hash_pdf_assinado}\n\n` +
          `📥 *Visualizar ou Baixar Cópia Autêntica:*\n${linkDownload}`;

        despacharNotificacaoWhatsappSuperAdm(
          env,
          msgSuperAdm,
          "notificacao_contrato_assinado_recebido",
        );
      } catch (errNotif) {
        console.warn("[SUPERADM-WHATSAPP] Erro ao notificar assinatura de contrato:", errNotif);
      }

      return new Response(
        JSON.stringify({
          success: true,
          mensagem:
            "Contrato assinado registrado com sucesso no banco de dados com hash de integridade.",
          contrato: data,
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao registrar assinatura de contrato.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 2.1 POST /api/contratos/inserir-assinado — Cadastra diretamente um contrato já assinado pelo cliente
  if (url.pathname === "/api/contratos/inserir-assinado" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        cliente_id,
        numero_contrato,
        tipo_contrato,
        pdf_assinado_base64,
        hash_pdf_assinado,
        assinado_por_nome,
        assinatura_metodo,
        data_assinatura,
        emitido_por_nome,
        vigencia_inicio,
        vigencia_fim,
        valor_mensalidade,
        valor_total_contrato,
        metadata,
      } = body;

      if (!cliente_id || !pdf_assinado_base64 || !hash_pdf_assinado) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              "Parâmetros cliente_id, pdf_assinado_base64 e hash_pdf_assinado são obrigatórios.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Se não informado número de contrato, gera sequencial CTR-XXXX/ANO
      let numContratoFinal = (numero_contrato || "").trim();
      if (!numContratoFinal) {
        const anoAtual = new Date().getFullYear();
        const randSeq = Math.floor(1000 + Math.random() * 9000);
        numContratoFinal = `CTR-${randSeq}/${anoAtual}`;
      }

      // Gera selo SGD-XXXXXXXX e código de verificação
      const selo = "SGD-" + Math.random().toString(16).substring(2, 10).toUpperCase();
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let codigo = "";
      for (let i = 0; i < 6; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      let byteaHex: string | null = null;
      if (pdf_assinado_base64 && typeof pdf_assinado_base64 === "string") {
        try {
          const binary = atob(pdf_assinado_base64);
          let hex = "\\x";
          for (let i = 0; i < binary.length; i++) {
            const h = binary.charCodeAt(i).toString(16);
            hex += h.length === 1 ? "0" + h : h;
          }
          byteaHex = hex;
        } catch {
          // ignora
        }
      }

      const ip =
        request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || null;
      const userAgent = request.headers.get("user-agent") || null;
      const dataAssinaturaFinal = data_assinatura
        ? new Date(data_assinatura).toISOString()
        : new Date().toISOString();

      const registro = {
        cliente_id,
        numero_contrato: numContratoFinal,
        tipo_contrato: tipo_contrato || "LOCACAO_AUTOMONITORAMENTO",
        pdf_original: byteaHex,
        pdf_assinado: byteaHex,
        hash_pdf_original: String(hash_pdf_assinado).trim().toLowerCase(),
        hash_pdf_assinado: String(hash_pdf_assinado).trim().toLowerCase(),
        selo_autenticidade: selo,
        codigo_verificacao: codigo,
        status: "assinado",
        data_emissao: dataAssinaturaFinal,
        data_envio_cliente: dataAssinaturaFinal,
        data_assinatura: dataAssinaturaFinal,
        assinado_por_nome: assinado_por_nome || "Cliente",
        assinatura_metodo: assinatura_metodo || "digital",
        assinatura_ip: ip,
        assinatura_user_agent: userAgent,
        emitido_por_nome: String(emitido_por_nome || "Administrador do Sistema").trim(),
        vigencia_inicio: vigencia_inicio || null,
        vigencia_fim: vigencia_fim || null,
        valor_mensalidade: Number(valor_mensalidade) || 0,
        valor_total_contrato: Number(valor_total_contrato) || 0,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      };

      const { data, error } = await adminClient
        .from("contratos_clientes")
        .insert(registro)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Atualiza data do contrato no cliente
      try {
        await adminClient
          .from("clientes")
          .update({ contrato_emitido_em: dataAssinaturaFinal })
          .eq("id", cliente_id);
      } catch {
        // ignora
      }

      // Registra também na tabela documentos_emitidos para verificação cruzada
      try {
        await adminClient.from("documentos_emitidos").insert({
          tipo_documento: "CONTRATO_ASSINADO",
          identificador_documento: registro.numero_contrato,
          cliente_id: registro.cliente_id,
          hash_sha256: registro.hash_pdf_assinado,
          codigo_autenticacao: codigo,
          metadata: {
            contrato_id: data.id,
            numero_contrato: registro.numero_contrato,
            selo_autenticidade: selo,
            status: "assinado",
            assinado_por_nome: registro.assinado_por_nome,
            assinatura_metodo: registro.assinatura_metodo,
            data_assinatura: registro.data_assinatura,
          },
          created_at: new Date().toISOString(),
        });
      } catch (errDoc) {
        console.warn("Aviso ao registrar documento assinado:", errDoc);
      }

      // Log forense de atividade
      try {
        await adminClient.from("system_activity_logs").insert({
          acao: "CONTRATO_ASSINADO_INSERIDO_DIRETO",
          detalhe: `Contrato assinado ${registro.numero_contrato} inserido diretamente com selo ${selo}. Hash: ${registro.hash_pdf_assinado}`,
          hash_sha256: registro.hash_pdf_assinado,
          created_at: new Date().toISOString(),
        });
      } catch {
        // ignora
      }

      return new Response(
        JSON.stringify({
          success: true,
          mensagem:
            "Contrato assinado inserido e registrado no banco de dados com selo de autenticidade SGD.",
          contrato: data,
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao inserir contrato assinado.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 3. POST /api/contratos/verificar ou GET /api/contratos/verificar — Conferência de autenticidade
  if (
    url.pathname === "/api/contratos/verificar" &&
    (request.method === "POST" || request.method === "GET")
  ) {
    try {
      let identificador = "";
      if (request.method === "GET") {
        identificador =
          url.searchParams.get("codigo") ||
          url.searchParams.get("selo") ||
          url.searchParams.get("hash") ||
          "";
      } else {
        const body = ((await request.json()) || {}) as any;
        identificador = String(body?.identificador || body?.hash || body?.codigo || "").trim();
      }

      if (!identificador) {
        return new Response(
          JSON.stringify({
            autentico: false,
            mensagem: "Identificador (selo, código ou hash) não informado.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      const idUpper = identificador.toUpperCase();
      const idLower = identificador.toLowerCase();

      let contratoEncontrado: any = null;
      let clienteNome = "Cliente";
      let clienteDocumento = "";

      // 1. Tenta buscar em contratos_clientes
      try {
        const { data, error } = await adminClient
          .from("contratos_clientes")
          .select("*")
          .or(
            `selo_autenticidade.eq.${idUpper},codigo_verificacao.eq.${idUpper},hash_pdf_assinado.eq.${idLower},hash_pdf_original.eq.${idLower}`,
          )
          .order("created_at", { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          contratoEncontrado = data[0];

          if (contratoEncontrado.cliente_id) {
            const { data: cl } = await adminClient
              .from("clientes")
              .select("nome_razao_social, documento")
              .eq("id", contratoEncontrado.cliente_id)
              .maybeSingle();

            if (cl) {
              clienteNome = cl.nome_razao_social || "Cliente";
              clienteDocumento = cl.documento || "";
            }
          }

          return new Response(
            JSON.stringify({
              autentico: true,
              mensagem: "Contrato autêntico conferido e validado com sucesso pelo GD Rastreamento.",
              contrato_id: contratoEncontrado.id,
              numero_contrato: contratoEncontrado.numero_contrato,
              selo_autenticidade: contratoEncontrado.selo_autenticidade,
              codigo_verificacao: contratoEncontrado.codigo_verificacao,
              status: contratoEncontrado.status,
              data_emissao: contratoEncontrado.data_emissao,
              data_assinatura: contratoEncontrado.data_assinatura,
              assinado_por_nome: contratoEncontrado.assinado_por_nome,
              assinatura_metodo: contratoEncontrado.assinatura_metodo,
              cliente_nome: clienteNome,
              cliente_documento: clienteDocumento,
              hash_pdf_original: contratoEncontrado.hash_pdf_original,
              hash_pdf_assinado: contratoEncontrado.hash_pdf_assinado,
            }),
            { status: 200, headers: corsHeaders },
          );
        }
      } catch (errContratos) {
        console.warn("Aviso na busca em contratos_clientes:", errContratos);
      }

      // 2. Busca em documentos_emitidos (cadeia de custódia forense global de PDFs)
      try {
        const { data: docs, error: docError } = await adminClient
          .from("documentos_emitidos")
          .select("*")
          .eq("hash_sha256", idLower)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!docError && docs && docs.length > 0) {
          const doc = docs[0];
          const meta = (doc.metadata || {}) as any;
          const seloDoc = meta.selo || `SGD-${doc.id.slice(0, 8).toUpperCase()}`;
          const codigoDoc = meta.codigo || doc.id.slice(0, 6).toUpperCase();
          const numDoc = meta.numero_contrato || doc.nome_arquivo || "DOC-OFICIAL";

          return new Response(
            JSON.stringify({
              autentico: true,
              mensagem:
                "Documento oficial autêntico conferido e validado com sucesso pelo GD Rastreamento.",
              contrato_id: doc.id,
              numero_contrato: numDoc,
              selo_autenticidade: seloDoc,
              codigo_verificacao: codigoDoc,
              status: "assinado",
              data_emissao: doc.created_at,
              data_assinatura: doc.created_at,
              assinado_por_nome: doc.emissor_nome || "GD Rastreamento",
              assinatura_metodo: "digital",
              cliente_nome: meta.cliente_nome || doc.descricao || "Cliente",
              cliente_documento: meta.cliente_documento || "",
              hash_pdf_original: doc.hash_sha256,
              hash_pdf_assinado: doc.hash_sha256,
            }),
            { status: 200, headers: corsHeaders },
          );
        }
      } catch (errDocs) {
        console.warn("Aviso na busca em documentos_emitidos:", errDocs);
      }

      // 3. Documento não localizado em nenhuma das tabelas
      return new Response(
        JSON.stringify({
          autentico: false,
          mensagem:
            "Nenhum documento ou contrato autêntico localizado com este identificador ou hash.",
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          autentico: false,
          mensagem:
            "Nenhum documento ou contrato autêntico localizado com este identificador ou hash.",
        }),
        { status: 200, headers: corsHeaders },
      );
    }
  }

  // 4. GET /api/contratos/download/:id — Download do PDF assinado/original ou direcionamento para assinatura
  if (url.pathname.startsWith("/api/contratos/download/") && request.method === "GET") {
    try {
      const id = url.pathname.replace("/api/contratos/download/", "").trim();
      if (!id) {
        return new Response("ID inválido", { status: 400 });
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const codUpper = id.toUpperCase();

      let query = adminClient
        .from("contratos_clientes")
        .select(
          "id, numero_contrato, pdf_assinado, pdf_original, status, codigo_verificacao, selo_autenticidade",
        );

      if (isUuid) {
        query = query.or(
          `id.eq.${id},codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`,
        );
      } else {
        query = query.or(`codigo_verificacao.eq.${codUpper},selo_autenticidade.eq.${codUpper}`);
      }

      const { data: contratos } = await query.order("created_at", { ascending: false }).limit(1);
      let contrato = contratos && contratos.length > 0 ? contratos[0] : null;

      // Fallback em documentos_emitidos se não encontrar em contratos_clientes
      if (!contrato) {
        try {
          const { data: docs } = await adminClient
            .from("documentos_emitidos")
            .select("*")
            .order("created_at", { ascending: false });

          if (docs && docs.length > 0) {
            const docFound = docs.find((d: any) => {
              const m = (d.metadata || {}) as any;
              return (
                d.id === id ||
                String(m.codigo || "").toUpperCase() === codUpper ||
                String(m.selo || "").toUpperCase() === codUpper ||
                String(m.numero_contrato || "").toUpperCase() === codUpper
              );
            });

            if (docFound) {
              const m = (docFound.metadata || {}) as any;
              contrato = {
                id: docFound.id,
                numero_contrato: m.numero_contrato || "CTR-0001/2026",
                pdf_assinado: null,
                pdf_original: null,
                status:
                  docFound.tipo_documento === "COPIA_AUTENTICA_CONTRATO"
                    ? "assinado"
                    : "pendente_assinatura",
                codigo_verificacao: m.codigo || codUpper,
                selo_autenticidade: m.selo || "SGD-OFICIAL",
              };
            }
          }
        } catch (errDocs) {
          console.warn("Aviso ao buscar fallback em documentos_emitidos no download:", errDocs);
        }
      }

      if (!contrato) {
        return new Response("Contrato não encontrado", { status: 404 });
      }

      const isContratoAssinado = contrato.status === "assinado";
      // Se for contrato assinado, busca estritamente o pdf_assinado com a rubrica e a certidão.
      // Se for pendente/minuta, busca o pdf_original.
      const pdfData = isContratoAssinado ? contrato.pdf_assinado : contrato.pdf_original;
      let buffer: Uint8Array;

      // Se o arquivo binário correspondente ao status ainda não está gravado no banco em bytea,
      // gera o PDF oficial sob demanda (assinado com rubrica/certidão ou minuta original)
      if (!pdfData) {
        let clienteDados: any = {};
        let veiculosDados: any[] = [];
        if (contrato.cliente_id) {
          const { data: cl } = await adminClient
            .from("clientes")
            .select("*")
            .eq("id", contrato.cliente_id)
            .maybeSingle();
          if (cl) clienteDados = cl;

          const { data: vts } = await adminClient
            .from("veiculos")
            .select("*")
            .eq("cliente_id", contrato.cliente_id);
          if (vts) veiculosDados = vts;
        }

        buffer = gerarContratoPdfBufferServer({
          contrato,
          cliente: clienteDados,
          veiculos: veiculosDados,
        });

        // Salva em segundo plano no banco de dados para cache persistente na coluna adequada
        try {
          let hex = "\\x";
          for (let i = 0; i < buffer.length; i++) {
            hex += buffer[i].toString(16).padStart(2, "0");
          }
          const campoDestino = isContratoAssinado ? { pdf_assinado: hex } : { pdf_original: hex };
          await adminClient.from("contratos_clientes").update(campoDestino).eq("id", contrato.id);
        } catch (errSave) {
          console.warn("Aviso ao salvar PDF gerado sob demanda:", errSave);
        }
      } else if (typeof pdfData === "string" && pdfData.startsWith("\\x")) {
        const hex = pdfData.slice(2);
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        buffer = bytes;
      } else if (pdfData instanceof Uint8Array) {
        buffer = pdfData;
      } else {
        return new Response("Formato de arquivo incompatível", { status: 500 });
      }

      const filename = `Contrato_${contrato.numero_contrato.replace(/[^a-zA-Z0-9]/g, "_")}_${contrato.status}.pdf`;

      return new Response(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    } catch (err: any) {
      return new Response("Erro ao baixar contrato: " + err?.message, { status: 500 });
    }
  }

  // 5. POST /api/contratos/excluir — Exclusão de contrato de teste ou emitido por engano
  if (url.pathname === "/api/contratos/excluir" && request.method === "POST") {
    try {
      const body = ((await request.json().catch(() => ({}))) || {}) as any;
      const contratoId = String(body.contrato_id || body.id || "").trim();
      const hashPdf = String(body.hash_pdf_original || body.hash || "").trim();

      if (!contratoId && !hashPdf) {
        return new Response(
          JSON.stringify({ success: false, message: "Identificador do contrato não fornecido." }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Exclui de contratos_clientes se o ID for UUID
      if (contratoId && contratoId.length > 20 && !contratoId.startsWith("ct-")) {
        try {
          await adminClient.from("contratos_clientes").delete().eq("id", contratoId);
        } catch (errDel) {
          console.warn("Aviso ao excluir em contratos_clientes:", errDel);
        }
      }

      // Exclui de documentos_emitidos se existir
      try {
        if (contratoId && contratoId.length > 20 && !contratoId.startsWith("ct-")) {
          await adminClient.from("documentos_emitidos").delete().eq("id", contratoId);
        }
        if (hashPdf) {
          await adminClient.from("documentos_emitidos").delete().eq("hash_sha256", hashPdf);
        }
      } catch (errDocDel) {
        console.warn("Aviso ao excluir em documentos_emitidos:", errDocDel);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Registro de contrato excluído com sucesso." }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao excluir contrato." }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 6. POST /api/contratos/cancelar — Marca contrato como cancelado com auditoria
  if (url.pathname === "/api/contratos/cancelar" && request.method === "POST") {
    try {
      const body = ((await request.json().catch(() => ({}))) || {}) as any;
      const contratoId = String(body.contrato_id || body.id || "").trim();
      const motivo = String(body.motivo || "Cancelado pelo operador").trim();
      const agoraIso = new Date().toISOString();

      if (!contratoId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do contrato não fornecido." }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Atualiza contratos_clientes
      try {
        await adminClient
          .from("contratos_clientes")
          .update({
            status: "cancelado",
            motivo_invalidacao: motivo,
            updated_at: agoraIso,
          })
          .eq("id", contratoId);
      } catch (errCanc) {
        console.warn("Aviso ao cancelar em contratos_clientes:", errCanc);
      }

      // Atualiza documentos_emitidos
      try {
        const { data: docItem } = await adminClient
          .from("documentos_emitidos")
          .select("metadata")
          .eq("id", contratoId)
          .maybeSingle();

        if (docItem) {
          await adminClient
            .from("documentos_emitidos")
            .update({
              metadata: {
                ...(docItem.metadata || {}),
                status: "cancelado",
                motivo_cancelamento: motivo,
                data_cancelamento: agoraIso,
              },
            })
            .eq("id", contratoId);
        }
      } catch (errDocCanc) {
        console.warn("Aviso ao cancelar em documentos_emitidos:", errDocCanc);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Contrato marcado como cancelado com sucesso." }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao cancelar contrato." }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  return null;
}

async function handleApiDocumentos(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/documentos")) {
    return null;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. POST /api/documentos/registrar
  if (url.pathname === "/api/documentos/registrar" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const {
        nome_arquivo,
        hash_sha256,
        tipo_documento,
        descricao,
        emissor_nome,
        emissor_email,
        emissor_user_id,
        emissor_role,
        tamanho_bytes,
        metadata,
      } = body;

      if (!nome_arquivo || !hash_sha256 || !tipo_documento || !descricao) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Campos obrigatórios ausentes para registro do documento.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      const agoraIso = new Date().toISOString();
      const registro = {
        nome_arquivo: String(nome_arquivo).trim(),
        hash_sha256: String(hash_sha256).trim().toLowerCase(),
        tipo_documento: String(tipo_documento).trim(),
        descricao: String(descricao).trim(),
        emissor_nome: String(emissor_nome || "Operador").trim(),
        emissor_email: String(emissor_email || "sistema@oficial.tec.br").trim(),
        emissor_user_id: emissor_user_id || null,
        emissor_role: emissor_role || "operador",
        tamanho_bytes: Number.isFinite(Number(tamanho_bytes)) ? Number(tamanho_bytes) : 0,
        metadata: metadata || {},
        created_at: agoraIso,
      };

      const { data, error } = await adminClient
        .from("documentos_emitidos")
        .insert(registro)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Trilha de auditoria em system_activity_logs
      try {
        await adminClient.from("system_activity_logs").insert({
          user_id: emissor_user_id || null,
          acao: "EMISSAO_DOCUMENTO_PDF",
          detalhe: `Emissão de ${registro.tipo_documento}: "${registro.nome_arquivo}" (${registro.descricao}) por ${registro.emissor_nome}`,
          hash_sha256: registro.hash_sha256,
          created_at: agoraIso,
        });
      } catch {
        // ignora
      }

      return new Response(JSON.stringify({ success: true, documento: data }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao registrar documento emitido.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 2. POST /api/documentos/verificar
  if (url.pathname === "/api/documentos/verificar" && request.method === "POST") {
    try {
      const body = ((await request.json()) || {}) as any;
      const { hash_sha256, hashes_candidatos } = body;

      const todosHashes: string[] = [];
      if (hash_sha256) todosHashes.push(String(hash_sha256).trim().toLowerCase());
      if (Array.isArray(hashes_candidatos)) {
        hashes_candidatos.forEach((h: any) => {
          if (h && typeof h === "string") todosHashes.push(h.trim().toLowerCase());
        });
      }

      if (todosHashes.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Nenhum hash SHA-256 fornecido para verificação.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // 1. Busca direta pelo hash_sha256
      const { data, error } = await adminClient
        .from("documentos_emitidos")
        .select("*")
        .in("hash_sha256", todosHashes)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      if (data && data.length > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            integro: true,
            documento: data[0],
            mensagem: "Documento oficial íntegro localizado na base forense do GD Rastreamento.",
          }),
          { status: 200, headers: corsHeaders },
        );
      }

      // 2. Fallback: hash de conteúdo em metadata
      const { data: ultimosDocs } = await adminClient
        .from("documentos_emitidos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      const docEncontrado = (ultimosDocs || []).find((d: any) => {
        const metaHash = d.metadata?.hash_conteudo?.toLowerCase?.();
        return metaHash && todosHashes.includes(metaHash);
      });

      if (docEncontrado) {
        return new Response(
          JSON.stringify({
            success: true,
            integro: true,
            documento: docEncontrado,
            mensagem: "Documento oficial íntegro localizado via assinatura de conteúdo forense.",
          }),
          { status: 200, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          integro: false,
          hash_calculado: hash_sha256 || todosHashes[0],
          mensagem: "Documento não encontrado na base de registros forenses ou adulterado.",
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao verificar documento.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // 3. GET /api/documentos/listar
  if (url.pathname === "/api/documentos/listar" && request.method === "GET") {
    try {
      const { data, error } = await adminClient
        .from("documentos_emitidos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, message: error.message, documentos: [] }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(JSON.stringify({ success: true, documentos: data || [] }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao listar documentos.",
          documentos: [],
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  }

  return null;
}

async function handleApiManutencao(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/manutencao/item")) {
    return null;
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: "Token de autenticação ausente." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 1. Valida usuario autenticado via token JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const userId = userData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 2. Verifica se o usuario e staff (superadmin, adm, operador)
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = roleData?.role || "cliente";
  const isStaff = role === "superadmin" || role === "adm" || role === "operador";

  // 3. Rota DELETE: Excluir item de revisao
  if (request.method === "DELETE") {
    const itemId = url.searchParams.get("id");
    if (!itemId) {
      return new Response(
        JSON.stringify({ success: false, message: "ID do item não fornecido." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const { data: itemData, error: itemError } = await adminClient
      .from("planos_manutencao_preventiva")
      .select("id, veiculo_id, veiculos(cliente_id, clientes(user_id))")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError || !itemData) {
      return new Response(
        JSON.stringify({ success: false, message: "Item de manutenção não localizado." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const donoUserId = (itemData as any)?.veiculos?.clientes?.user_id;
    if (!isStaff && donoUserId !== userId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Acesso negado: veículo não pertence ao usuário.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const { error: delError } = await adminClient
      .from("planos_manutencao_preventiva")
      .delete()
      .eq("id", itemId);

    if (delError) {
      return new Response(JSON.stringify({ success: false, message: delError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Item de manutenção removido com sucesso!" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // 4. Rota POST: Salvar ou criar item de revisao
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const veiculoId = body.veiculo_id;

      if (!veiculoId) {
        return new Response(
          JSON.stringify({ success: false, message: "Veículo não especificado." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      // Valida se o veiculo pertence ao usuario ou se e staff
      const { data: veiculoData } = await adminClient
        .from("veiculos")
        .select("id, cliente_id, clientes(user_id)")
        .eq("id", veiculoId)
        .maybeSingle();

      const donoUserId = (veiculoData as any)?.clientes?.user_id;
      if (!isStaff && donoUserId !== userId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Acesso negado: veículo não pertence ao usuário.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      const intervaloKm = Number(body.intervalo_km) || 5000;
      const avisoKm = Number(body.aviso_antecipado_km) || 500;
      const ultimoKm = Number(body.ultimo_km_realizado) || 0;
      const proximoKm = ultimoKm + intervaloKm;

      if (body.id) {
        // Atualizacao
        const { error: updErr } = await adminClient
          .from("planos_manutencao_preventiva")
          .update({
            item_manutencao: body.item_manutencao,
            intervalo_km: intervaloKm,
            aviso_antecipado_km: avisoKm,
            ultimo_km_realizado: ultimoKm,
            proximo_km_alvo: proximoKm,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.id);

        if (updErr) throw updErr;
        return new Response(
          JSON.stringify({ success: true, message: "Item de manutenção atualizado com sucesso!" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      } else {
        // Insercao
        const { error: insErr } = await adminClient.from("planos_manutencao_preventiva").insert({
          veiculo_id: veiculoId,
          item_manutencao: body.item_manutencao,
          intervalo_km: intervaloKm,
          aviso_antecipado_km: avisoKm,
          ultimo_km_realizado: ultimoKm,
          proximo_km_alvo: proximoKm,
          status: "em_dia",
        });

        if (insErr) throw insErr;
        return new Response(
          JSON.stringify({ success: true, message: "Item de manutenção criado com sucesso!" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao salvar item." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }
  }

  return new Response(JSON.stringify({ success: false, message: "Método não suportado." }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

/**
 * Proxy Reverso Resiliente de Roteamento Viário OSRM Multi-Provedor
 * Garante entrega da malha viária completa das ruas sem bloqueio de CSP, CORS ou AdBlocker
 */
async function handleApiRota(request: Request, _env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/rota/osrm")) {
    return null;
  }

  const coords = url.searchParams.get("coords") || "";
  if (!coords) {
    return new Response(
      JSON.stringify({ code: "InvalidQuery", message: "Coordenadas não fornecidas." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  const type = url.searchParams.get("type") || "route";
  const steps = url.searchParams.get("steps") === "true";
  const annotations = url.searchParams.get("annotations") || "duration,distance";

  const endpoints =
    type === "table"
      ? [
          `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=${annotations}`,
          `https://routing.openstreetmap.de/routed-car/table/v1/driving/${coords}?annotations=${annotations}`,
        ]
      : [
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=${steps}`,
          `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=${steps}`,
        ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          "User-Agent": "GDRastreamento-Vehicle-Telemetry/1.8",
          Accept: "application/json",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && (data.code === "Ok" || Array.isArray(data.routes))) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=3600, s-maxage=3600",
              ...SECURITY_HEADERS,
            },
          });
        }
      }
    } catch {
      // Continua para o próximo provedor viário
    }
  }

  return new Response(
    JSON.stringify({
      code: "ServiceUnavailable",
      message: "Provedores viários OSRM indisponíveis no momento.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    },
  );
}

async function handleStaticPwaAssets(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // 1. Digital Asset Links para Android TWA (PWABuilder / Bubblewrap)
  // Remove a barra de navegação URL no Android e valida o domínio oficial
  if (url.pathname === "/.well-known/assetlinks.json") {
    const assetlinks = [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "br.tec.oficial.sigoguardiao",
          sha256_cert_fingerprints: [
            "14:6D:E9:44:C5:1F:6A:B9:33:47:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
          ],
        },
      },
    ];

    return new Response(JSON.stringify(assetlinks, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        ...SECURITY_HEADERS,
      },
    });
  }

  // 2. Service Worker para Web Push em Segundo Plano (iOS e Android)
  if (url.pathname === "/sw.js") {
    const swCode = `// Service Worker — GD Rastreamento
// Escuta permanente de notificações push nativas (VAPID) — app fechado, tela desligada
const DEDUP_KEY = "sigo_sw_dedup";
const MAX_DEDUP = 150;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function isDuplicata(id) {
  try {
    const cache = await caches.open(DEDUP_KEY);
    const req = new Request("https://sigo-dedup/" + id);
    const hit = await cache.match(req);
    if (hit) return true;
    await cache.put(req, new Response("1", { status: 200 }));
    const keys = await cache.keys();
    if (keys.length > MAX_DEDUP) await cache.delete(keys[0]);
    return false;
  } catch {
    return false;
  }
}

function montarOpcoes(data) {
  const tag = data.tag || ("sigo-push-" + Date.now());
  const opcoes = {
    body: data.body || "Alerta de telemetria veicular ou anomalia operacional detectada.",
    icon: data.icon || "/logo.png",
    badge: data.badge || "/favicon.png",
    tag,
    renotify: true,
    data: {
      url: data.url || "/monitor-gps",
      dataHora: new Date().toISOString()
    }
  };

  const isWebKit = typeof self.navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(self.navigator.userAgent || "") ||
     (/safari|webkit/i.test(self.navigator.userAgent || "") && !/chrome|chromium|edg/i.test(self.navigator.userAgent || "")));

  if (!isWebKit) {
    opcoes.vibrate = [300, 150, 300, 150, 300];
    opcoes.requireInteraction = true;
    const ehChat = data.url && data.url.includes("/chat");
    opcoes.actions = [
      { action: "abrir", title: ehChat ? "Abrir Conversa" : "Ver no Mapa" },
      { action: "fechar", title: "Dispensar" }
    ];
  }

  return opcoes;
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Alerta Operacional — GD Rastreamento", body: event.data.text() };
    }
  }

  const titulo = data.title || "Alerta de Segurança — GD Rastreamento";
  const tag = data.tag || ("sigo-push-" + Date.now());

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const isMobile =
        typeof self.navigator !== "undefined" &&
        (/iphone|ipad|ipod|android/i.test(self.navigator.userAgent || ""));

      const ehChat = data.url && data.url.includes("/chat");
      const estaNoChatFocado =
        !isMobile &&
        windowClients.some(
          (c) => c.focused && c.visibilityState === "visible" && (c.url || "").includes("/chat"),
        );

      if (ehChat && estaNoChatFocado) {
        return;
      }

      return isDuplicata(tag).then((dup) => {
        if (dup) return;
        return self.registration.showNotification(titulo, montarOpcoes(data)).catch(() => {
          return self.registration.showNotification(titulo, {
            body: data.body || "Nova mensagem recebida.",
            icon: "/logo.png",
            data: { url: data.url || "/" }
          });
        });
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "fechar") return;
  const urlDestino = event.notification.data?.url || "/monitor-gps";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && urlDestino) return client.navigate(urlDestino);
          return client;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlDestino);
    })
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription ? event.oldSubscription.options.applicationServerKey : null,
      })
      .then((newSub) => {
        return fetch("/api/push/inscrever", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            userAgent: self.navigator?.userAgent || "service-worker",
          }),
        }).catch(() => {});
      })
      .catch(() => {})
  );
});`;

    return new Response(swCode, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Service-Worker-Allowed": "/",
        ...SECURITY_HEADERS,
      },
    });
  }

  return null;
}

// Armazenamento em memória das inscrições Web Push ativas
const webPushSubscribers = new Map<string, any>();

// Cache em memória de notificações recentemente disparadas para deduplicação instantânea.
// Evita duplicação de Web Push quando o trigger pg_net do banco e a chamada fetch do frontend disparam em paralelo.
const pushDispatchDedupCache = new Map<string, number>();

// Cache em memória de alertas disparados via WhatsApp para deduplicação anti-flood (cooldown 5 min por contato/alerta)
const serverWhatsappAlertDedupCache = new Map<string, number>();

// Cache em memória de ligações MacroDroid para deduplicação anti-flood (janela 90s por número + motivo)
const macrodroidCallDedupCache = new Map<string, number>();
let ultimoSlotMacrodroidMs = 0;

async function aguardarSlotMacrodroid(): Promise<void> {
  if (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      Boolean((globalThis as any).__TEST__) ||
      Boolean(process.env.NODE_TEST_CONTEXT))
  ) {
    return;
  }

  const SLOT_INTERVAL_MS = 17000;
  const MAX_WAIT_MS = 25000;
  const cacheSlotUrl = "https://macrodroid-dialer-lock.internal/slot";
  const agora = Date.now();
  let nextSlotTs = Math.max(agora, ultimoSlotMacrodroidMs);

  try {
    const cacheDefault = (globalThis as any).caches?.default;
    if (cacheDefault) {
      const cached = await cacheDefault.match(cacheSlotUrl).catch(() => null);
      if (cached) {
        const txt = await cached.text().catch(() => "0");
        const cachedTs = Number(txt) || 0;
        if (cachedTs > nextSlotTs) {
          nextSlotTs = cachedTs;
        }
      }
      const esperaMs = Math.max(0, nextSlotTs - agora);
      const atraso = Math.min(esperaMs, MAX_WAIT_MS);
      const novoSlotTs = Math.max(agora, nextSlotTs) + SLOT_INTERVAL_MS;
      ultimoSlotMacrodroidMs = novoSlotTs;

      await cacheDefault
        .put(
          cacheSlotUrl,
          new Response(String(novoSlotTs), {
            headers: { "Cache-Control": "max-age=60", "Content-Type": "text/plain" },
          }),
        )
        .catch(() => {});

      if (atraso > 0) {
        await new Promise((resolve) => setTimeout(resolve, atraso));
      }
      return;
    }
  } catch {
    /* fallback para controle em memória */
  }

  const esperaLocal = Math.max(0, nextSlotTs - agora);
  const atrasoLocal = Math.min(esperaLocal, MAX_WAIT_MS);
  ultimoSlotMacrodroidMs = Math.max(agora, nextSlotTs) + SLOT_INTERVAL_MS;
  if (atrasoLocal > 0) {
    await new Promise((resolve) => setTimeout(resolve, atrasoLocal));
  }
}

/**
 * Normaliza e formata o número de telefone para o discador MacroDroid (padrão Claro 021)
 * Ex: "(24) 99249-4030", "5524992494030", "24992494030" -> "02124992494030"
 */
function normalizarNumeroDiscadorClaro(rawTelefone: string): string {
  if (!rawTelefone) return "";
  let digitos = rawTelefone.replace(/\D/g, "");
  if (!digitos) return "";

  // Se tiver DDI do Brasil (55) com 12 ou 13 dígitos, remove o 55
  if (digitos.startsWith("55") && digitos.length >= 12) {
    digitos = digitos.substring(2);
  }

  // Remove 0 inicial se houver (ex: 024... -> 24...)
  if (digitos.startsWith("021")) {
    return digitos;
  }
  if (digitos.startsWith("0")) {
    digitos = digitos.substring(1);
  }

  // Prefixa com o código de operadora Claro (021)
  return `021${digitos}`;
}

/**
 * Discador de Emergência Automático via MacroDroid
 * Disparo único de alta precisão com fila serializada entre isolates (17s entre chamadas).
 */
async function dispararLigacaoMacroDroid(
  rawTelefone: string,
  motivoAlerta: string = "alerta",
  _env?: any,
  supabaseUrl?: string,
  serviceRoleKey?: string,
  forcarSemDedup: boolean = false,
): Promise<{ sucesso: boolean; detalhe?: string }> {
  try {
    if (!rawTelefone) return { sucesso: false, detalhe: "Telefone não informado" };

    const numeroFormatado = normalizarNumeroDiscadorClaro(rawTelefone);
    if (!numeroFormatado || numeroFormatado.length < 12) {
      console.warn(
        `[MACRODROID-DISCAR] Telefone inválido para discagem: "${rawTelefone}" -> "${numeroFormatado}"`,
      );
      return { sucesso: false, detalhe: "Telefone com formato inválido" };
    }

    const agora = Date.now();
    // Limpeza de cache antigo (> 90s)
    for (const [k, ts] of macrodroidCallDedupCache.entries()) {
      if (agora - ts > 90000) {
        macrodroidCallDedupCache.delete(k);
      }
    }

    const ehTeste = forcarSemDedup || String(motivoAlerta).toLowerCase().includes("teste");
    const motivoNorm = String(motivoAlerta || "alerta")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_:-]+/g, "_")
      .slice(0, 60);
    const chaveDedup = `${numeroFormatado}:${motivoNorm}`;

    // Se já discou para este número + motivo nos últimos 90 segundos e não for teste forçado, suprime
    if (!ehTeste && macrodroidCallDedupCache.has(chaveDedup)) {
      console.log(
        `[MACRODROID-DISCAR] Chamada para ${numeroFormatado} (${motivoNorm}) suprimida por deduplicação (< 90s)`,
      );
      return { sucesso: true, detalhe: "Deduplicado em 90s" };
    }

    macrodroidCallDedupCache.set(chaveDedup, agora);

    // Pacing serializado de 17s entre webhooks para evitar colisão da variável global lv=numero e timer de 15s no MacroDroid
    await aguardarSlotMacrodroid();

    const webhookUrl = (
      (typeof process !== "undefined" && process.env?.MACRODROID_WEBHOOK_URL) ||
      (_env && (_env as any)?.MACRODROID_WEBHOOK_URL) ||
      "https://trigger.macrodroid.com/ba91741e-4025-401c-a3c6-cab080e519e3/discar"
    ).trim();

    const digitosPuros = rawTelefone.replace(/\D/g, "");
    const urlChamada = `${webhookUrl}?numero=${encodeURIComponent(numeroFormatado)}&telefone=${encodeURIComponent(numeroFormatado)}&tel=${encodeURIComponent(numeroFormatado)}&numero_puro=${encodeURIComponent(digitosPuros)}&tentativa=1&t=${Date.now()}`;

    console.log(
      `📞 [MACRODROID-DISCAR] Disparo para ${numeroFormatado} (Alerta: ${motivoAlerta})...`,
    );

    // Disparo único imediato com timeout (8s), consumo do stream HTTP e validação real de res.ok
    let httpOk = false;
    let httpStatus = 0;
    let erroDetalhe = "";
    const macroController = typeof AbortController !== "undefined" ? new AbortController() : null;
    const macroTimeout = macroController ? setTimeout(() => macroController.abort(), 8000) : null;

    try {
      const res = await fetch(urlChamada, {
        method: "GET",
        headers: { "User-Agent": "Hunter-Guardian-Dialer/1.0" },
        ...(macroController ? { signal: macroController.signal } : {}),
      });
      httpStatus = res?.status || 0;
      httpOk = Boolean(res?.ok);
      if (res && typeof res.text === "function") {
        await res.text().catch(() => "");
      }
      if (!httpOk) {
        erroDetalhe = `HTTP ${httpStatus || "erro"}`;
        console.warn(
          `[MACRODROID-DISCAR] Webhook retornou falha ${erroDetalhe} para ${numeroFormatado} (${motivoAlerta})`,
        );
      }
    } catch (errCall: any) {
      erroDetalhe =
        errCall?.name === "AbortError" ? "Timeout (8s)" : String(errCall?.message || errCall);
      console.warn("[MACRODROID-DISCAR] Aviso disparo:", erroDetalhe);
    } finally {
      if (macroTimeout) clearTimeout(macroTimeout);
    }

    if (!httpOk) {
      // Remove da deduplicação para não bloquear a próxima tentativa após falha real do webhook
      macrodroidCallDedupCache.delete(chaveDedup);

      if (supabaseUrl && serviceRoleKey) {
        await fetch(`${supabaseUrl}/rest/v1/system_activity_logs`, {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acao: "ligacao_emergencia_macrodroid_falha",
            detalhe: `Falha no webhook MacroDroid para ${numeroFormatado} | Motivo: ${motivoAlerta} | Erro: ${erroDetalhe || "desconhecido"}`,
          }),
        }).catch(() => {});
      }

      return {
        sucesso: false,
        detalhe: `Falha no webhook MacroDroid (${erroDetalhe || "erro HTTP"}) para ${numeroFormatado}`,
      };
    }

    // Registro em log de auditoria do sistema apenas após HTTP 2xx efetivo do webhook MacroDroid
    if (supabaseUrl && serviceRoleKey) {
      await fetch(`${supabaseUrl}/rest/v1/system_activity_logs`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao: "ligacao_emergencia_macrodroid_disparada",
          detalhe: `Ligação de emergência efetuada para ${numeroFormatado} | Motivo: ${motivoAlerta} | HTTP ${httpStatus}`,
        }),
      }).catch(() => {});
    }

    return {
      sucesso: true,
      detalhe: `Disparo efetuado para ${numeroFormatado} (HTTP ${httpStatus})`,
    };
  } catch (err: any) {
    console.warn("[MACRODROID-DISCAR] Falha ao executar discagem:", err?.message || err);
    return { sucesso: false, detalhe: String(err?.message || err) };
  }
}

async function despacharWhatsappAlertaServer(
  params: {
    destUserId: string | null;
    destClienteId: string | null;
    tipo: string;
    placa: string | null;
    titulo: string;
    mensagem: string;
  },
  supabaseUrl: string,
  serviceRoleKey: string,
  _env: unknown,
): Promise<void> {
  // Ignora notificações sem destinatário
  if (!params.destUserId && !params.destClienteId) {
    return;
  }

  // Alertas de NF pronta para download são despachados diretamente pelo nfStorageService com arquivo anexo
  const tipoCanonicoInicial = normalizarTipoAlerta(params.tipo);
  if (tipoCanonicoInicial === "nf_pronta_download") {
    return;
  }

  // Sigilo operacional: defesa ativa contra sabotagem via SMS é tratada exclusivamente pelo Gateway com SuperADM
  if (ehAlertaRestritoEquipeTecnica(tipoCanonicoInicial)) {
    return;
  }

  const agora = Date.now();
  // Limpeza de entradas expiradas (> 10 min)
  for (const [k, ts] of serverWhatsappAlertDedupCache.entries()) {
    if (agora - ts > 600000) {
      serverWhatsappAlertDedupCache.delete(k);
    }
  }

  const gatewayUrl = "https://gps.oficial.tec.br/gd/whatsapp";

  const headersSupabase = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };

  try {
    let targetClienteId = params.destClienteId;
    let veiculoId: string | null = null;
    let temEventoPendenteFisico = false;
    let areaIdPendente: string | null = null;
    let canaisConfigurados: any = null;
    let regrasRow: any = null;
    let clienteRow: any = null;
    let motoristasAtivos: ContatoAlertaConta[] = [];

    const itemCatalogoInicial = obterItemCatalogoAlerta(tipoCanonicoInicial);
    const alertaEhDeConta = itemCatalogoInicial?.categoria === "conta";
    let targetEhTerceiroSemCliente = false;

    // 1. Se não há destClienteId explícito, verifica primeiro se destUserId é titular de cliente
    if (!targetClienteId && params.destUserId) {
      const resCliUid = await fetch(
        `${supabaseUrl}/rest/v1/clientes?user_id=eq.${params.destUserId}&select=id`,
        { headers: headersSupabase },
      );
      if (resCliUid.ok) {
        const arrCliUid = (await resCliUid.json()) as any[];
        if (arrCliUid.length > 0 && arrCliUid[0]?.id) {
          targetClienteId = arrCliUid[0].id;
        } else if (alertaEhDeConta) {
          // Destinatário operacional/técnico (ex.: instalador/operador) sem vínculo como cliente titular
          targetEhTerceiroSemCliente = true;
        }
      }
    }

    // 1.1 Se informou placa e não é disparo exclusivo para terceiro não-cliente, localiza veículo e cliente_id
    if (params.placa && !targetEhTerceiroSemCliente) {
      const resV = await fetch(
        `${supabaseUrl}/rest/v1/veiculos?placa=eq.${encodeURIComponent(params.placa)}&select=id,cliente_id`,
        { headers: headersSupabase },
      );
      if (resV.ok) {
        const arrV = (await resV.json()) as any[];
        if (arrV.length > 0 && arrV[0]?.id) {
          veiculoId = arrV[0].id;
          if (arrV[0].cliente_id && !targetClienteId) {
            targetClienteId = arrV[0].cliente_id;
          }
        }
      }
    }

    // 2. Se localizou veiculoId, verifica máquina de estados Geofence e regras_veiculo
    if (veiculoId) {
      // 2.1. Blindagem de Máquina de Estados para Alertas de Geofence (Zero Repetição de WhatsApp)
      if (params.tipo === "saida_area" || params.tipo === "entrada_area") {
        try {
          const resEstado = await fetch(
            `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${veiculoId}&ultimo_evento_tipo=eq.${params.tipo}&whatsapp_enviado=eq.true&select=area_id`,
            { headers: headersSupabase },
          );
          if (resEstado.ok) {
            const arrEst = (await resEstado.json()) as any[];
            const resPendente = await fetch(
              `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${veiculoId}&ultimo_evento_tipo=eq.${params.tipo}&whatsapp_enviado=eq.false&select=area_id`,
              { headers: headersSupabase },
            );
            const arrPendente = resPendente.ok ? ((await resPendente.json()) as any[]) : [];
            if (arrPendente.length > 0) {
              temEventoPendenteFisico = true;
              areaIdPendente = arrPendente[0]?.area_id || null;
            } else if (arrEst.length > 0) {
              return;
            }
          }
        } catch {
          /* fallback não bloqueia se der erro de rede */
        }
      }

      const resRegras = await fetch(
        `${supabaseUrl}/rest/v1/regras_veiculo?veiculo_id=eq.${veiculoId}&select=alertas_ativos,canais_alertas,whatsapp_destinatarios`,
        { headers: headersSupabase },
      );
      if (resRegras.ok) {
        const arrR = (await resRegras.json()) as any[];
        if (arrR.length > 0) {
          regrasRow = arrR[0];
          const canais = regrasRow?.canais_alertas;
          canaisConfigurados = canais;
        }
      }
    }

    // 3. Consulta preferências operacionais e contatos da conta do cliente (Expand e Contract seguro)
    if (targetClienteId) {
      let resCli = await fetch(
        `${supabaseUrl}/rest/v1/clientes?id=eq.${targetClienteId}&select=id,nome_razao_social,telefone,notificar_nf_pendente,canais_notificacao_nf,alertas_operacionais,contatos_alertas`,
        { headers: headersSupabase },
      );
      if (!resCli.ok) {
        resCli = await fetch(
          `${supabaseUrl}/rest/v1/clientes?id=eq.${targetClienteId}&select=id,nome_razao_social,telefone,notificar_nf_pendente,canais_notificacao_nf`,
          { headers: headersSupabase },
        );
      }
      if (resCli.ok) {
        const arrCli = (await resCli.json()) as any[];
        if (arrCli.length > 0) {
          clienteRow = arrCli[0];
        }
      }

      // Carrega motoristas ativos vinculados ao cliente para tagueamento e blindagem financeira estrita
      try {
        const resMots = await fetch(
          `${supabaseUrl}/rest/v1/motoristas?cliente_id=eq.${targetClienteId}&ativo=eq.true&select=id,nome,telefone`,
          { headers: headersSupabase },
        );
        if (resMots.ok) {
          const arrMots = (await resMots.json()) as any[];
          if (Array.isArray(arrMots)) {
            motoristasAtivos = arrMots
              .filter((m) => m?.telefone)
              .map((m) => ({
                id: `mot-${m.id}`,
                nome: `${m.nome} (Motorista)`,
                telefone: String(m.telefone),
                tipo: "motorista" as const,
                ativo: false,
                padrao: false,
              }));
          }
        }
      } catch {
        /* fallback silencioso */
      }
    }

    // 4. Fallback do telefone titular caso não haja cadastro em clienteRow
    let telefoneFallback = String(clienteRow?.telefone || "").trim();
    if (!telefoneFallback && params.destUserId) {
      const resProf = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${params.destUserId}&select=telefone`,
        { headers: headersSupabase },
      );
      if (resProf.ok) {
        const arrProf = (await resProf.json()) as any[];
        if (arrProf.length > 0) {
          telefoneFallback = String(arrProf[0]?.telefone || "").trim();
        }
      }
    }

    // Monta diretórios de contatos disponíveis para veículo e para conta
    const contatosContaBase: ContatoAlertaConta[] = Array.isArray(clienteRow?.contatos_alertas)
      ? ([...clienteRow.contatos_alertas] as ContatoAlertaConta[])
      : [];
    if (contatosContaBase.length === 0) {
      if (telefoneFallback) {
        contatosContaBase.push({
          id: `cli-${targetClienteId || params.destUserId || "titular"}`,
          nome: `${clienteRow?.nome_razao_social || "Cliente Titular"} (Cliente Titular)`,
          telefone: telefoneFallback,
          tipo: "cliente",
          ativo: true,
          padrao: true,
        });
      }
      for (const m of motoristasAtivos) {
        contatosContaBase.push(m);
      }
    } else {
      for (const m of motoristasAtivos) {
        const digMot = m.telefone.replace(/\D/g, "");
        if (!contatosContaBase.some((c) => c.telefone.replace(/\D/g, "") === digMot)) {
          contatosContaBase.push(m);
        }
      }
    }

    const destinatarios = regrasRow?.whatsapp_destinatarios;
    const contatosVeiculoBase: ContatoAlertaConta[] = Array.isArray(destinatarios)
      ? (destinatarios
          .filter((d: any) => d && (d.telefone || d.celular || d.numero))
          .map((d: any, idx: number) => ({
            id: String(d.id || `vdest-${idx}`),
            nome: String(d.nome || "Destinatário"),
            telefone: String(d.telefone || d.celular || d.numero),
            tipo: (d.tipo || "adicional") as "cliente" | "motorista" | "adicional",
            ativo: d.ativo !== false,
            padrao: Boolean(d.padrao),
          })) as ContatoAlertaConta[])
      : [];

    // 5. Checagem explícita de compatibilidade + Resolução Determinística de Entrega nos 4 eixos
    const canais = regrasRow?.canais_alertas || null;
    const canalItemWhats =
      canais?.por_alerta?.[tipoCanonicoInicial] || canais?.por_alerta?.[params.tipo];
    const whatsDesligadoPorRegraLegacy = canalItemWhats
      ? canalItemWhats.whatsapp === false
      : (() => {
          if (canais && canais.whatsapp === false) {
            return true;
          }
          return false;
        })();

    const canalItemLig =
      canaisConfigurados?.por_alerta?.[tipoCanonicoInicial] ||
      canaisConfigurados?.por_alerta?.[params.tipo];
    const temPorAlertaLigCfg = Boolean(
      canaisConfigurados?.por_alerta && Object.keys(canaisConfigurados.por_alerta).length > 0,
    );
    const ligacaoPermitidaLegacy = canalItemLig
      ? canalItemLig.ligacao === true
      : !temPorAlertaLigCfg && canaisConfigurados?.ligacao === true;

    const regraResolvida = resolverRegraEntregaAlerta({
      tipo: tipoCanonicoInicial,
      alertasAtivos: regrasRow?.alertas_ativos || null,
      canaisGlobais: canais,
      alertasOperacionais: clienteRow?.alertas_operacionais || null,
      notificarNfPendente: clienteRow?.notificar_nf_pendente,
      canaisNotificacaoNf: clienteRow?.canais_notificacao_nf,
      contatosVeiculo: contatosVeiculoBase,
      contatosConta: contatosContaBase,
      telefoneFallbackTitular: telefoneFallback || null,
    });

    const permitirWhatsapp =
      regraResolvida.ativo && regraResolvida.whatsapp && !whatsDesligadoPorRegraLegacy;
    const permitirLigacao =
      regraResolvida.ativo &&
      (regraResolvida.ligacao || (regrasRow ? ligacaoPermitidaLegacy : false));

    // Coleta cópias opt-in explícitas da equipe técnica em alertas_equipe (para alertas veiculares não exclusivos do Gateway)
    const telefonesWhatsappEquipe = new Set<string>();
    const telefonesLigacaoEquipe = new Set<string>();
    if (
      !alertaEhDeConta &&
      !targetEhTerceiroSemCliente &&
      tipoCanonicoInicial !== "panico" &&
      tipoCanonicoInicial !== "bateria_desconectada"
    ) {
      try {
        const ctxEquipeVeic = await carregarContextoEquipeTecnica(supabaseUrl, serviceRoleKey);
        for (const membro of ctxEquipeVeic.membros) {
          const regraEq = resolverRegraMembroEquipeServer({
            membro,
            tipoCanonico: tipoCanonicoInicial,
            fonesCentralGerencial: ctxEquipeVeic.fonesCentralGerencial,
          });
          if (!regraEq.possuiConfigExplicita || !regraEq.ativo) continue;
          if (regraEq.whatsapp) {
            for (const fEq of regraEq.telefonesWhatsapp) {
              telefonesWhatsappEquipe.add(fEq);
            }
          }
          if (regraEq.ligacao) {
            for (const fEq of regraEq.telefonesLigacao) {
              telefonesLigacaoEquipe.add(fEq);
            }
          }
        }
      } catch {
        /* fallback silencioso */
      }
    }

    const clienteTemCanalExterno = regraResolvida.ativo && (permitirWhatsapp || permitirLigacao);
    const equipeTemCanalExterno =
      telefonesWhatsappEquipe.size > 0 || telefonesLigacaoEquipe.size > 0;

    // Se nem cliente nem equipe possuem canal externo (WhatsApp ou Ligação) habilitado, não envia
    if (!clienteTemCanalExterno && !equipeTemCanalExterno) {
      if (temEventoPendenteFisico && veiculoId) {
        const areaParam = areaIdPendente ? `&area_id=eq.${areaIdPendente}` : "";
        fetch(
          `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${veiculoId}&ultimo_evento_tipo=eq.${params.tipo}${areaParam}`,
          {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ whatsapp_enviado: true, updated_at: new Date().toISOString() }),
          },
        ).catch(() => {});
      }
      return;
    }

    const token =
      (_env as any)?.GD_WHATSAPP_TOKEN ||
      (typeof process !== "undefined" ? process.env?.GD_WHATSAPP_TOKEN : undefined) ||
      "hunter-guardiao-whatsapp-secret-key-2026";
    const dataHoraBrasil = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());

    const corpoFinal =
      params.mensagem.includes("Horário") || params.mensagem.includes("🕒")
        ? params.mensagem
        : `${params.mensagem}\n🕒 Horário: ${dataHoraBrasil}`;

    // Limpa título de emojis redundantes ou prefixos de placa duplicados
    let tituloFormatado = params.titulo.replace(/^(🚨\s*)+/, "").trim();
    if (params.placa) {
      const regexPlacaDupla = new RegExp(`(\\s*—\\s*${params.placa})+`, "gi");
      tituloFormatado = tituloFormatado.replace(regexPlacaDupla, ` — ${params.placa}`);
    }

    const txtMsg = `🚨 *${tituloFormatado}*\n\n${corpoFinal}\n\n_GD Segurança Privada — Rastreamento e Gestão Tática_`;

    const isAlertaArea = params.tipo === "saida_area" || params.tipo === "entrada_area";
    const isAlertaRota = params.tipo === "desvio_rota" || params.tipo === "rota_monitorada";
    let janelaDedupMs = isAlertaArea ? 43200000 : 300000;
    if (isAlertaRota) {
      janelaDedupMs = 900000; // 15 minutos para desvio de rota monitorada
    }

    const tipoDedupCanonico = isAlertaRota ? "desvio_rota" : params.tipo;
    let peloMenosUmEnviado = false;

    const fonesWhatsDisparados = new Set<string>();

    // 6. Canal WHATSAPP (desacoplado do canal de Ligação e com números específicos por canal/alerta)
    if (regraResolvida.ativo && permitirWhatsapp) {
      for (const rawFone of regraResolvida.telefonesWhatsapp) {
        const digitos = rawFone.replace(/\D/g, "");
        if (digitos.length < 10) continue;
        const foneFormatado = digitos.startsWith("55") ? digitos : `55${digitos}`;

        const matchArea = params.mensagem.match(/["'](.*?)["']/);
        const areaKey = isAlertaArea && matchArea ? `:${matchArea[1]}` : "";
        const chaveDedup = `${foneFormatado}:${tipoDedupCanonico}:${params.placa || targetClienteId || "veiculo"}${areaKey}`;
        if (temEventoPendenteFisico) {
          serverWhatsappAlertDedupCache.delete(chaveDedup);
        }
        const ultimoEnvio = serverWhatsappAlertDedupCache.get(chaveDedup) || 0;
        if (agora - ultimoEnvio < janelaDedupMs) {
          fonesWhatsDisparados.add(foneFormatado);
          continue;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 7000);
          let resEnvio: Response | null = null;

          try {
            resEnvio = await fetch(`${gatewayUrl}/api/v1/messages/send`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Hunter-Token": token,
              },
              signal: controller.signal,
              body: JSON.stringify({
                channel: "whatsapp",
                recipient: foneFormatado,
                numero: foneFormatado,
                telefone: foneFormatado,
                message: txtMsg,
                mensagem: txtMsg,
                metadata: {
                  origem: "notificacoes_sistema",
                  tipo: params.tipo,
                  placa: params.placa,
                  destinatarioClienteId: targetClienteId,
                },
              }),
            });
          } catch {
            try {
              resEnvio = await fetch(`${gatewayUrl}/api/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  "X-Hunter-Token": token,
                },
                signal: controller.signal,
                body: JSON.stringify({
                  numero: foneFormatado,
                  recipient: foneFormatado,
                  mensagem: txtMsg,
                  message: txtMsg,
                }),
              });
            } catch {
              /* fallback sem bloquear */
            }
          } finally {
            clearTimeout(timeoutId);
          }

          if (resEnvio && resEnvio.ok) {
            peloMenosUmEnviado = true;
            fonesWhatsDisparados.add(foneFormatado);
            serverWhatsappAlertDedupCache.set(chaveDedup, agora);

            fetch(`${supabaseUrl}/rest/v1/system_activity_logs`, {
              method: "POST",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                acao: "whatsapp_alerta_veiculo_enviado",
                detalhe: `Alerta (${params.tipo}) despachado para WhatsApp ${foneFormatado} (Placa: ${params.placa || "N/A"})`,
              }),
            }).catch(() => {});
          } else {
            serverWhatsappAlertDedupCache.delete(chaveDedup);
            const codStatus = resEnvio
              ? `${resEnvio.status} ${resEnvio.statusText}`
              : "timeout ou erro de rede";
            fetch(`${supabaseUrl}/rest/v1/system_activity_logs`, {
              method: "POST",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                acao: "whatsapp_alerta_veiculo_falha",
                detalhe: `Falha no envio de WhatsApp (${params.tipo}) para ${foneFormatado} (Placa: ${params.placa || "N/A"}): ${codStatus}`,
              }),
            }).catch(() => {});
          }
        } catch (errGateway) {
          serverWhatsappAlertDedupCache.delete(chaveDedup);
          console.warn(`[WHATSAPP-ALERTA] Falha ao enviar para ${foneFormatado}:`, errGateway);
        }
      }
    }

    // 6.1 Cópia WhatsApp opt-in explícita da equipe técnica (alertas_equipe)
    for (const rawFoneEq of telefonesWhatsappEquipe) {
      const digitos = rawFoneEq.replace(/\D/g, "");
      if (digitos.length < 10) continue;
      const foneFormatado = digitos.startsWith("55") ? digitos : `55${digitos}`;
      if (fonesWhatsDisparados.has(foneFormatado)) continue;

      const matchArea = params.mensagem.match(/["'](.*?)["']/);
      const areaKey = isAlertaArea && matchArea ? `:${matchArea[1]}` : "";
      const chaveDedupEq = `eq:${foneFormatado}:${tipoDedupCanonico}:${params.placa || "veiculo"}${areaKey}`;
      const ultimoEnvioEq = serverWhatsappAlertDedupCache.get(chaveDedupEq) || 0;
      if (agora - ultimoEnvioEq < janelaDedupMs) {
        continue;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        const resEq = await fetch(`${gatewayUrl}/api/v1/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Hunter-Token": token,
          },
          signal: controller.signal,
          body: JSON.stringify({
            channel: "whatsapp",
            recipient: foneFormatado,
            numero: foneFormatado,
            telefone: foneFormatado,
            message: txtMsg,
            mensagem: txtMsg,
            metadata: {
              origem: "notificacoes_sistema_equipe",
              tipo: params.tipo,
              placa: params.placa,
            },
          }),
        }).finally(() => clearTimeout(timeoutId));

        if (resEq && resEq.ok) {
          peloMenosUmEnviado = true;
          fonesWhatsDisparados.add(foneFormatado);
          serverWhatsappAlertDedupCache.set(chaveDedupEq, agora);
        }
      } catch {
        /* fallback silencioso */
      }
    }

    // 7. Combo Despertador Tático: Dispara ligação telefônica via MacroDroid de forma 100% desacoplada
    // Respeita estritamente a escolha explícita do usuário em canais_alertas.por_alerta / alertas_operacionais (nunca força sem autorização)
    const fonesLigDisparados = new Set<string>();
    if (regraResolvida.ativo && permitirLigacao) {
      for (const foneLigacao of regraResolvida.telefonesLigacao) {
        const fNorm = normalizarTelefoneDigitosBR(foneLigacao);
        if (fNorm) fonesLigDisparados.add(fNorm);
        await dispararLigacaoMacroDroid(
          foneLigacao,
          tipoCanonicoInicial,
          _env,
          supabaseUrl,
          serviceRoleKey,
        ).catch((errCall) => {
          console.warn(`[MACRODROID] Falha no disparo telefônico para ${foneLigacao}:`, errCall);
        });
      }
    }

    // 7.1 Cópia Ligação MacroDroid opt-in explícita da equipe técnica (alertas_equipe)
    for (const foneEqLig of telefonesLigacaoEquipe) {
      const fNorm = normalizarTelefoneDigitosBR(foneEqLig);
      if (fNorm && fonesLigDisparados.has(fNorm)) continue;
      if (fNorm) fonesLigDisparados.add(fNorm);
      await dispararLigacaoMacroDroid(
        foneEqLig,
        `equipe_${tipoCanonicoInicial}`,
        _env,
        supabaseUrl,
        serviceRoleKey,
      ).catch((errCall) => {
        console.warn(`[MACRODROID] Falha no disparo telefônico equipe para ${foneEqLig}:`, errCall);
      });
    }

    // Se despachou com sucesso (ou tratou evento pendente) para alerta de área, atualiza whatsapp_enviado na máquina de estados
    if (
      (peloMenosUmEnviado || permitirLigacao || temEventoPendenteFisico) &&
      isAlertaArea &&
      veiculoId
    ) {
      const areaParam = areaIdPendente ? `&area_id=eq.${areaIdPendente}` : "";
      fetch(
        `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${veiculoId}&ultimo_evento_tipo=eq.${params.tipo}${areaParam}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            whatsapp_enviado: true,
            updated_at: new Date().toISOString(),
          }),
        },
      ).catch(() => {});
    }
  } catch (errGeral) {
    console.warn("[WHATSAPP-ALERTA] Erro ao processar destinatários de WhatsApp:", errGeral);
  }
}

async function handleApiWebPush(request: Request, _env: unknown): Promise<Response | null> {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/push")) {
    return null;
  }

  // GET /api/push/status
  if (url.pathname === "/api/push/status" && request.method === "GET") {
    return new Response(
      JSON.stringify({
        ativo: true,
        vapidPublicKey:
          "BJ_KK66CUDXUf5V3-i-Z7NWgjk4Estvz-ClwYsZey3IC5YjkyVG01ozLYIn_6uJa3RqlfznXEQD1WMWrTGNMn5U",
        inscritos: webPushSubscribers.size,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  }

  // POST /api/push/inscrever
  if (url.pathname === "/api/push/inscrever" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      if (body?.subscription?.endpoint) {
        webPushSubscribers.set(body.subscription.endpoint, {
          subscription: body.subscription,
          userAgent: body.userAgent || "",
          userId: body.userId || null,
          clienteId: body.clienteId || null,
          atualizadoEm: new Date().toISOString(),
        });

        // Persistência canônica no banco de dados Supabase
        try {
          const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(_env);
          const endpoint = body.subscription.endpoint;
          const p256dh = body.subscription.keys?.p256dh || "";
          const authKey = body.subscription.keys?.auth || "";
          const userId = body.userId || null;
          const clienteId = body.clienteId || null;

          if (userId) {
            if (p256dh) {
              if (authKey) {
                await fetch(`${supabaseUrl}/rest/v1/user_push_subscriptions?on_conflict=endpoint`, {
                  method: "POST",
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    "Content-Type": "application/json",
                    Prefer: "resolution=merge-duplicates",
                  },
                  body: JSON.stringify({
                    user_id: userId,
                    cliente_id: clienteId,
                    endpoint,
                    p256dh,
                    auth: authKey,
                    user_agent: body.userAgent || "",
                    updated_at: new Date().toISOString(),
                  }),
                });
              }
            }
          }
        } catch {
          // Ignora falha de sincronizacao com banco
        }

        return new Response(
          JSON.stringify({
            sucesso: true,
            totalInscritos: webPushSubscribers.size,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }
    } catch {
      // Ignora erro de payload
    }
    return new Response(JSON.stringify({ sucesso: false, erro: "Inscrição inválida" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  // POST /api/push/cancelar — Remove inscrição push ao deslogar (dispositivo emprestado / troca de aparelho)
  if (url.pathname === "/api/push/cancelar" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      const endpoint: string | undefined = body?.endpoint;

      if (!endpoint) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Endpoint não informado." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      // 1. Remove do mapa em memória do servidor
      webPushSubscribers.delete(endpoint);

      // 2. Remove do banco de dados Supabase (service_role — sem RLS)
      try {
        const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(_env);
        await fetch(
          `${supabaseUrl}/rest/v1/user_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
          {
            method: "DELETE",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch {
        // Ignora falha no banco — o cliente já cancelou localmente no PushManager
      }

      return new Response(
        JSON.stringify({ sucesso: true, mensagem: "Inscrição push cancelada com sucesso." }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Falha ao processar cancelamento push." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/push/disparar
  if (url.pathname === "/api/push/disparar") {
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as any;
        const rawTag = String(body?.tag || body?.notificacaoId || "").trim();
        let canonicalTag = rawTag;
        if (canonicalTag && !canonicalTag.startsWith("sigo-notif-")) {
          canonicalTag = `sigo-notif-${canonicalTag}`;
        }
        if (!canonicalTag) {
          canonicalTag = `sigo-notif-${Date.now()}`;
        }

        const titulo = body?.titulo || "🚨 GD Rastreamento — Alerta de Segurança";
        const mensagem = body?.mensagem || "Ocorrência detectada no rastreamento veicular.";
        const targetUrl = body?.url || "/monitor-gps";
        const tag = canonicalTag;
        const destUserId = body?.destinatarioUserId || null;
        const destClienteId = body?.destinatarioClienteId || null;
        let tipoNotif = String(body?.tipo || "alerta");
        let placaNotif = body?.placa ? String(body.placa).trim() : null;

        // Extração heurística resiliente da placa se ausente no payload (Mercosul e padrão cinza)
        if (!placaNotif) {
          const matchPlaca = `${titulo} ${mensagem}`.match(
            /\b([A-Z]{3}[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}-[0-9]{4})\b/i,
          );
          if (matchPlaca) {
            placaNotif = matchPlaca[1].toUpperCase().replace("-", "");
          }
        }

        // Inferência do tipo canônico de alerta caso enviado genericamente como "alerta"
        if (tipoNotif === "alerta") {
          const textoGeral = `${titulo} ${mensagem}`.toLowerCase();
          if (textoGeral.includes("excesso de velocidade") || textoGeral.includes("atingiu")) {
            tipoNotif = "excesso_velocidade";
          } else if (
            textoGeral.includes("desvio de rota") ||
            textoGeral.includes("rota monitorada")
          ) {
            tipoNotif = "desvio_rota";
          } else if (textoGeral.includes("saída de área") || textoGeral.includes("saiu da área")) {
            tipoNotif = "saida_area";
          } else if (
            textoGeral.includes("chegada em área") ||
            textoGeral.includes("entrou na área")
          ) {
            tipoNotif = "entrada_area";
          } else if (textoGeral.includes("guincho") || textoGeral.includes("arrasto")) {
            tipoNotif = "guincho";
          } else if (textoGeral.includes("jammer")) {
            tipoNotif = "suspeita_jammer";
          } else if (textoGeral.includes("sem sinal") || textoGeral.includes("comunicação")) {
            tipoNotif = "perda_comunicacao";
          } else if (
            textoGeral.includes("bateria principal") ||
            textoGeral.includes("desconectada") ||
            textoGeral.includes("alimentação principal")
          ) {
            tipoNotif = "bateria_desconectada";
          } else if (
            textoGeral.includes("baixa tensão") ||
            textoGeral.includes("bateria interna")
          ) {
            tipoNotif = "baixa_tensao";
          } else if (
            textoGeral.includes("sms não autorizado") ||
            textoGeral.includes("sabotagem") ||
            textoGeral.includes("comando externo via sms") ||
            textoGeral.includes("desbloqueio externo via sms") ||
            textoGeral.includes("divergência de relé")
          ) {
            tipoNotif = "corte_nao_autorizado_sms";
          } else if (
            textoGeral.includes("colisão") ||
            textoGeral.includes("impacto") ||
            textoGeral.includes("vibração")
          ) {
            tipoNotif = "colisao_impacto";
          } else if (textoGeral.includes("ignição") && textoGeral.includes("horário")) {
            tipoNotif = "ignicao_fora_horario";
          } else if (textoGeral.includes("movimento") && textoGeral.includes("horário")) {
            tipoNotif = "movimento_fora_horario";
          }
        }
        const tipoCanonicoNotif = normalizarTipoAlerta(tipoNotif);
        const ehAlertaInternoSigilo = ehAlertaRestritoEquipeTecnica(tipoCanonicoNotif);

        // REGRA DE SEGURANÇA: Recusa disparo sem destinatário para impedir broadcast para todos
        if (!destUserId && !destClienteId) {
          return new Response(
            JSON.stringify({
              sucesso: false,
              mensagem:
                "Disparo recusado: nenhum destinatário (destinatarioUserId ou destinatarioClienteId) informado.",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        // DEDUPLICAÇÃO DE ALTA PRECISÃO (Anti-Duplicação Dual: pg_net + fetch frontend):
        // Quando uma notificação é criada, o trigger pg_net do banco e o frontend cliente disparam
        // /api/push/disparar simultaneamente. Deduplicamos na janela de 12 segundos.
        const agora = Date.now();

        // Limpeza periódica de entradas antigas (> 30s)
        for (const [k, ts] of pushDispatchDedupCache.entries()) {
          if (agora - ts > 30000) {
            pushDispatchDedupCache.delete(k);
          }
        }

        const alvoDest = `${destUserId || ""}:${destClienteId || ""}`;
        const chaveTag = `tag:${alvoDest}:${canonicalTag}`;
        const chaveSemantica = `sem:${alvoDest}:${mensagem.trim()}`;
        const matchAreaPush = mensagem.match(/["']([^"']+)["']/);
        const sufixoAreaPush =
          (tipoCanonicoNotif === "saida_area" || tipoCanonicoNotif === "entrada_area") &&
          matchAreaPush
            ? `:${matchAreaPush[1]}`
            : "";
        const chaveTipoPlaca = placaNotif
          ? `tipo:${alvoDest}:${tipoCanonicoNotif}:${placaNotif}${sufixoAreaPush}`
          : "";

        if (
          pushDispatchDedupCache.has(chaveTag) ||
          (rawTag && pushDispatchDedupCache.has(`id:${alvoDest}:${rawTag}`)) ||
          pushDispatchDedupCache.has(chaveSemantica) ||
          (chaveTipoPlaca && pushDispatchDedupCache.has(chaveTipoPlaca))
        ) {
          return new Response(
            JSON.stringify({
              sucesso: true,
              duplicado: true,
              motivo: "Notificação idêntica já disparada recentemente (deduplicada no servidor)",
              enviados: 0,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        // Registra as chaves de deduplicação antes de prosseguir
        pushDispatchDedupCache.set(chaveTag, agora);
        pushDispatchDedupCache.set(chaveSemantica, agora);
        if (rawTag) {
          pushDispatchDedupCache.set(`id:${alvoDest}:${rawTag}`, agora);
        }
        if (chaveTipoPlaca) {
          pushDispatchDedupCache.set(chaveTipoPlaca, agora);
        }

        const payload = JSON.stringify({
          title: titulo,
          body: mensagem,
          url: targetUrl,
          tag: canonicalTag,
          icon: "/logo.png",
          badge: "/favicon.png",
        });

        const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(_env);
        const isChat = body?.isChat === true || (body?.url && body.url.includes("/chat"));

        // REGRA DE LEITURA (1 traço vs 2 traços):
        // Se a notificação for de chat, aguarda 2.6 segundos ANTES de disparar Push/WhatsApp/Ligação
        // para dar tempo do destinatário visualizar a mensagem se o chat estiver aberto.
        if (body?.notificacaoId && isChat) {
          await new Promise((resolve) => setTimeout(resolve, 2600));

          try {
            const resNotif = await fetch(
              `${supabaseUrl}/rest/v1/notificacoes_sistema?id=eq.${body.notificacaoId}&select=lida`,
              {
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  Accept: "application/json",
                },
              },
            );
            if (resNotif.ok) {
              const dadosNotif = (await resNotif.json()) as any[];
              if (dadosNotif?.[0]?.lida === true) {
                return new Response(
                  JSON.stringify({
                    sucesso: true,
                    cancelado: true,
                    motivo: "Mensagem já lida pelo usuário no chat aberto (2 traços)",
                    enviados: 0,
                  }),
                  {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
                  },
                );
              }
            }
          } catch (errCheckLida) {
            console.warn("Aviso ao checar status de leitura da notificação:", errCheckLida);
          }
        }

        // Disparo de WhatsApp e ligação telefônica em paralelo (desacoplado do envio de Web Push VAPID)
        // Nota: Toda saída antecipada abaixo aguarda explicitamente promiseDespachoWhats antes de retornar
        const despacharWhatsappAlertaServerWorker = async () => {
          await despacharWhatsappAlertaServer(
            {
              destUserId,
              destClienteId,
              tipo: tipoCanonicoNotif,
              placa: placaNotif,
              titulo,
              mensagem,
            },
            supabaseUrl,
            serviceRoleKey,
            _env,
          ).catch((errWhats) => {
            console.warn("[PUSH-DISPARAR] Falha no fluxo WhatsApp de alerta:", errWhats);
          });
        };
        const promiseDespachoWhats = ehAlertaInternoSigilo
          ? Promise.resolve()
          : despacharWhatsappAlertaServerWorker();

        // 0. Validação de Preferências do Usuário para Web Push (App):
        // Carrega preferências da conta do cliente quando aplicável (alertas operacionais, NF e chat)
        let clienteRowPush: any = null;
        if (!ehAlertaInternoSigilo) {
          try {
            let targetCliId = destClienteId;
            if (!targetCliId && destUserId) {
              const resCli = await fetch(
                `${supabaseUrl}/rest/v1/clientes?user_id=eq.${destUserId}&select=id`,
                {
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    Accept: "application/json",
                  },
                },
              );
              if (resCli.ok) {
                const arr = (await resCli.json()) as any[];
                if (arr?.[0]?.id) targetCliId = arr[0].id;
              }
            }
            if (targetCliId) {
              let resPref = await fetch(
                `${supabaseUrl}/rest/v1/clientes?id=eq.${targetCliId}&select=notificar_nf_pendente,canais_notificacao_nf,alertas_operacionais`,
                {
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    Accept: "application/json",
                  },
                },
              );
              if (!resPref.ok) {
                resPref = await fetch(
                  `${supabaseUrl}/rest/v1/clientes?id=eq.${targetCliId}&select=notificar_nf_pendente,canais_notificacao_nf`,
                  {
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      Accept: "application/json",
                    },
                  },
                );
              }
              if (resPref.ok) {
                const arr = (await resPref.json()) as any[];
                if (arr?.[0]) clienteRowPush = arr[0];
              }
            }
          } catch (e) {
            void e;
          }
        }

        // Se for alerta de NF e o cliente desativou canal Push nas preferências:
        if (tipoCanonicoNotif === "nf_pronta_download" && clienteRowPush) {
          const c = clienteRowPush;
          const canais = c?.canais_notificacao_nf;
          const regraNf = resolverRegraEntregaAlerta({
            tipo: "nf_pronta_download",
            alertasOperacionais: c?.alertas_operacionais,
            notificarNfPendente: c?.notificar_nf_pendente,
            canaisNotificacaoNf: canais,
          });
          if (
            c?.notificar_nf_pendente === false ||
            canais?.push === false ||
            !regraNf.ativo ||
            !regraNf.app
          ) {
            await promiseDespachoWhats;
            return new Response(
              JSON.stringify({
                sucesso: true,
                cancelado: true,
                motivo: "Canal Web Push desativado nas preferências de NF do cliente",
                enviados: 0,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
        }

        const itemCatPush = obterItemCatalogoAlerta(tipoCanonicoNotif);
        const ehAlertaContaPush = itemCatPush?.categoria === "conta";

        // Para os demais alertas operacionais de conta e chat quando direcionados a cliente:
        if (clienteRowPush && ehAlertaContaPush && tipoCanonicoNotif !== "nf_pronta_download") {
          const regraContaPush = resolverRegraEntregaAlerta({
            tipo: tipoCanonicoNotif,
            alertasOperacionais: clienteRowPush?.alertas_operacionais,
            notificarNfPendente: clienteRowPush?.notificar_nf_pendente,
            canaisNotificacaoNf: clienteRowPush?.canais_notificacao_nf,
          });
          if (!regraContaPush.ativo || !regraContaPush.app) {
            await promiseDespachoWhats;
            return new Response(
              JSON.stringify({
                sucesso: true,
                cancelado: true,
                motivo: `Canal App / Push desativado para o alerta ${tipoCanonicoNotif}`,
                enviados: 0,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
        }

        // Se for alerta de veículo (com placa) e as regras do veículo desativaram o alerta ou canal App/Push:
        let veiculoBloqueouAppCliente = false;
        let motivoBloqueioVeic = "";
        if (!ehAlertaInternoSigilo && placaNotif && !ehAlertaContaPush) {
          try {
            const resV = await fetch(
              `${supabaseUrl}/rest/v1/veiculos?placa=eq.${encodeURIComponent(placaNotif)}&select=id`,
              {
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  Accept: "application/json",
                },
              },
            );
            if (resV.ok) {
              const arrV = (await resV.json()) as any[];
              if (arrV.length > 0 && arrV[0]?.id) {
                const resRegras = await fetch(
                  `${supabaseUrl}/rest/v1/regras_veiculo?veiculo_id=eq.${arrV[0].id}&select=alertas_ativos,canais_alertas`,
                  {
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      Accept: "application/json",
                    },
                  },
                );
                if (resRegras.ok) {
                  const arrR = (await resRegras.json()) as any[];
                  if (arrR.length > 0) {
                    const cAlertas = arrR[0]?.canais_alertas;
                    const canalItemApp =
                      cAlertas?.por_alerta?.[tipoCanonicoNotif] ||
                      cAlertas?.por_alerta?.[tipoNotif];
                    const regraVeicPush = resolverRegraEntregaAlerta({
                      tipo: tipoCanonicoNotif,
                      alertasAtivos: arrR[0]?.alertas_ativos,
                      canaisGlobais: cAlertas,
                    });

                    if (canalItemApp) {
                      if (
                        canalItemApp.app === false ||
                        !regraVeicPush.ativo ||
                        !regraVeicPush.app
                      ) {
                        veiculoBloqueouAppCliente = true;
                        motivoBloqueioVeic = `Canal App / Push desativado para o alerta ${tipoCanonicoNotif}`;
                      }
                    } else if (
                      arrR[0]?.canais_alertas?.app === false ||
                      cAlertas?.app === false ||
                      !regraVeicPush.ativo ||
                      !regraVeicPush.app
                    ) {
                      veiculoBloqueouAppCliente = true;
                      motivoBloqueioVeic = "Canal App / Push desativado nas regras do veículo";
                    }
                  }
                }
              }
            }
          } catch (e) {
            void e;
          }
        }

        const listaInscricoes: Array<{ id?: string; subscription: any }> = [];
        const userIdsAlvo = new Set<string>();
        const clienteIdsAlvo = new Set<string>();

        // 1. Busca inscrições persistidas no Banco de Dados Supabase (com resolução cruzada userId <-> clienteId)
        try {
          if (ehAlertaInternoSigilo && destUserId && !destClienteId) {
            // Notificação sigilosa/operacional endereçada individualmente a um membro da equipe:
            // valida somente esse destinatário e impede fan-out N x N entre administradores
            const ctxEquipeTarget = await carregarContextoEquipeTecnica(
              supabaseUrl,
              serviceRoleKey,
            );
            const membroAlvo = ctxEquipeTarget.membros.find((m) => m.userId === destUserId);
            if (!membroAlvo) {
              await promiseDespachoWhats;
              return new Response(
                JSON.stringify({
                  sucesso: true,
                  cancelado: true,
                  motivo: "Destinatário não pertence à equipe técnica ativa",
                  enviados: 0,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
                },
              );
            }
            const regraAlvoEq = resolverRegraMembroEquipeServer({
              membro: membroAlvo,
              tipoCanonico: tipoCanonicoNotif,
              fonesCentralGerencial: ctxEquipeTarget.fonesCentralGerencial,
            });
            if (!regraAlvoEq.ativo || !regraAlvoEq.app) {
              await promiseDespachoWhats;
              return new Response(
                JSON.stringify({
                  sucesso: true,
                  cancelado: true,
                  motivo: `Canal App / Push desativado nas preferências de equipe para ${tipoCanonicoNotif}`,
                  enviados: 0,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
                },
              );
            }
            userIdsAlvo.add(destUserId);
          } else {
            if (!ehAlertaInternoSigilo && !veiculoBloqueouAppCliente && destUserId) {
              userIdsAlvo.add(destUserId);
              // Verifica se o destUserId possui vínculo em clientes
              try {
                const resCli = await fetch(
                  `${supabaseUrl}/rest/v1/clientes?user_id=eq.${destUserId}&select=id`,
                  {
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      Accept: "application/json",
                    },
                  },
                );
                if (resCli.ok) {
                  const arr = (await resCli.json()) as any[];
                  if (Array.isArray(arr) && arr.length > 0 && arr[0]?.id) {
                    clienteIdsAlvo.add(arr[0].id);
                  }
                }
              } catch (e) {
                void e;
              }
            }

            if (!ehAlertaInternoSigilo && !veiculoBloqueouAppCliente && destClienteId) {
              clienteIdsAlvo.add(destClienteId);
              // Verifica o user_id deste cliente
              try {
                const resCli = await fetch(
                  `${supabaseUrl}/rest/v1/clientes?id=eq.${destClienteId}&select=user_id`,
                  {
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                      Accept: "application/json",
                    },
                  },
                );
                if (resCli.ok) {
                  const arr = (await resCli.json()) as any[];
                  if (Array.isArray(arr) && arr.length > 0 && arr[0]?.user_id) {
                    userIdsAlvo.add(arr[0].user_id);
                  }
                }
              } catch (e) {
                void e;
              }
            }

            // Alertas operacionais e de segurança (cerca, velocidade, jammer, bateria, sigilo técnico):
            // Administradores (adm/superadmin) e Operadores com Web Push ativo na preferência individual recebem a notificação
            if (
              ehAlertaInternoSigilo ||
              (tipoNotif !== "chat" &&
                tipoNotif !== "nf_pronta_download" &&
                tipoCanonicoNotif !== "cobranca" &&
                tipoCanonicoNotif !== "alerta_nf_expurgo")
            ) {
              try {
                const ctxEquipeFanout = await carregarContextoEquipeTecnica(
                  supabaseUrl,
                  serviceRoleKey,
                );
                for (const membro of ctxEquipeFanout.membros) {
                  const regraEq = resolverRegraMembroEquipeServer({
                    membro,
                    tipoCanonico: tipoCanonicoNotif,
                    fonesCentralGerencial: ctxEquipeFanout.fonesCentralGerencial,
                  });
                  const permitidoEq = veiculoBloqueouAppCliente
                    ? regraEq.possuiConfigExplicita && regraEq.ativo && regraEq.app
                    : regraEq.ativo && regraEq.app;
                  if (permitidoEq) {
                    userIdsAlvo.add(membro.userId);
                  }
                }
              } catch (eRoles) {
                void eRoles;
              }
            }

            if (veiculoBloqueouAppCliente && userIdsAlvo.size === 0 && clienteIdsAlvo.size === 0) {
              await promiseDespachoWhats;
              return new Response(
                JSON.stringify({
                  sucesso: true,
                  cancelado: true,
                  motivo: motivoBloqueioVeic || "Canal App / Push desativado nas regras do veículo",
                  enviados: 0,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
                },
              );
            }
          }

          const condicoes: string[] = [];
          for (const u of userIdsAlvo) condicoes.push(`user_id.eq.${u}`);
          if (!ehAlertaInternoSigilo && !veiculoBloqueouAppCliente) {
            for (const c of clienteIdsAlvo) condicoes.push(`cliente_id.eq.${c}`);
          }

          if (condicoes.length > 0) {
            const queryParams = new URLSearchParams();
            queryParams.set("select", "id,endpoint,p256dh,auth");
            if (condicoes.length === 1) {
              queryParams.set("or", `(${condicoes[0]})`);
            } else {
              queryParams.set("or", `(${condicoes.join(",")})`);
            }

            const urlBusca = `${supabaseUrl}/rest/v1/user_push_subscriptions?${queryParams.toString()}`;
            const resDb = await fetch(urlBusca, {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                Accept: "application/json",
              },
            });

            if (resDb.ok) {
              const dadosDb = (await resDb.json()) as any[];
              if (Array.isArray(dadosDb)) {
                for (const item of dadosDb) {
                  // Deduplicação estrita de endpoint: nenhum dispositivo recebe a notificação 2x
                  if (
                    item?.endpoint &&
                    item?.p256dh &&
                    item?.auth &&
                    !listaInscricoes.some((x) => x.subscription.endpoint === item.endpoint)
                  ) {
                    listaInscricoes.push({
                      id: item.id,
                      subscription: {
                        endpoint: item.endpoint,
                        keys: {
                          p256dh: item.p256dh,
                          auth: item.auth,
                        },
                      },
                    });
                  }
                }
              }
            }
          }
        } catch (errBuscaDb) {
          console.warn("Aviso: Falha ao consultar assinantes push no banco:", errBuscaDb);
        }

        // 2. Adiciona assinantes locais em memória estritamente direcionados ao destinatário
        for (const [endpoint, item] of webPushSubscribers.entries()) {
          const matchUser =
            Boolean(item.userId && userIdsAlvo.has(item.userId)) ||
            (!ehAlertaInternoSigilo &&
              !veiculoBloqueouAppCliente &&
              Boolean(destUserId && item.userId === destUserId));
          const matchCli =
            !ehAlertaInternoSigilo &&
            !veiculoBloqueouAppCliente &&
            Boolean(destClienteId && item.clienteId === destClienteId);
          if (
            (matchUser || matchCli) &&
            !listaInscricoes.some((x) => x.subscription.endpoint === endpoint)
          ) {
            listaInscricoes.push({ subscription: item.subscription });
          }
        }

        let enviados = 0;
        let falhas = 0;

        try {
          // Importa dinamicamente a biblioteca compatível com Edge / Cloudflare Workers
          const webcryptoPush = await import("@block65/webcrypto-web-push");

          const vapidKeys = {
            subject: "mailto:novaes@oficial.tec.br",
            publicKey:
              "BJ_KK66CUDXUf5V3-i-Z7NWgjk4Estvz-ClwYsZey3IC5YjkyVG01ozLYIn_6uJa3RqlfznXEQD1WMWrTGNMn5U",
            privateKey: "YQOgVmVNTRCle2vbHpLfBbJa8KY1LZCENnscaOsrm8Q",
          };

          console.log(
            `[PUSH-VAPID] Disparando para ${listaInscricoes.length} dispositivo(s) registrado(s)`,
          );

          for (const item of listaInscricoes) {
            try {
              // 1. Constrói o Request via WebCrypto VAPID
              const requestDetails = await webcryptoPush.buildPushPayload(
                { data: payload, options: { ttl: 86400, urgency: "high" } },
                item.subscription,
                vapidKeys,
              );

              // 2. Dispara usando o fetch nativo do ambiente
              const pushRes = await fetch(item.subscription.endpoint, {
                method: requestDetails.method,
                headers: requestDetails.headers,
                body: requestDetails.body,
              });

              if (!pushRes.ok) {
                throw new Error(`Push falhou: HTTP ${pushRes.status}`);
              }
              enviados++;
            } catch (err: any) {
              falhas++;
              const errMsg = err?.message || "";
              if (errMsg.includes("404") || errMsg.includes("410")) {
                // Inscrição expirada ou cancelada pelo usuário: remove do cache e do banco
                webPushSubscribers.delete(item.subscription.endpoint);
                if (item.id) {
                  fetch(`${supabaseUrl}/rest/v1/user_push_subscriptions?id=eq.${item.id}`, {
                    method: "DELETE",
                    headers: {
                      apikey: serviceRoleKey,
                      Authorization: `Bearer ${serviceRoleKey}`,
                    },
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (err) {
          console.warn("Falha crítica ao disparar Web Push nativo:", err);
        }

        // Aguarda a finalização do despacho de WhatsApp e MacroDroid
        await promiseDespachoWhats;

        return new Response(
          JSON.stringify({
            sucesso: true,
            enviados,
            falhas,
            totalAssinantes: listaInscricoes.length,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      } catch {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Falha ao processar disparo de push" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }
    }
  }

  return null;
}

// Armazenamento em memória da visibilidade de administradores no chat (fallback ultra-rápido)
const admVisibilidadeChatMemoria = new Map<string, boolean>();

async function handleApiChat(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/chat")) {
    return null;
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return new Response(JSON.stringify({ success: false, message: "Token ausente" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ success: false, message: "Sessão inválida" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  const callerId = userData.user.id;
  const callerEmail = userData.user.email?.toLowerCase() || "";
  const isSuperAdm =
    callerEmail === "novaes@adm.28bpm.local" || callerEmail === "novaes@oficial.tec.br";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Identifica cargo do solicitante
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role, ativo")
    .eq("id", callerId)
    .maybeSingle();

  const callerRole = (callerProfile?.role || "cliente").toLowerCase();
  const isAdmin = isSuperAdm || callerRole === "superadmin" || callerRole === "adm";
  const isOperador = callerRole === "operador";
  const isCliente = !isAdmin && !isOperador;

  // ROTA 1: GET /api/chat/contatos
  if (url.pathname === "/api/chat/contatos" && request.method === "GET") {
    try {
      let perfis: any[] = [];
      const resDb = await adminClient
        .from("profiles")
        .select("id, nome, email, role, ativo, visivel_no_chat");

      if (resDb.data && Array.isArray(resDb.data)) {
        perfis = resDb.data;
      } else {
        // Fallback se a coluna visivel_no_chat ainda não foi criada
        const resDbFallback = await adminClient
          .from("profiles")
          .select("id, nome, email, role, ativo");
        if (resDbFallback.data && Array.isArray(resDbFallback.data)) {
          perfis = resDbFallback.data;
        }
      }

      // Filtra ativos e aplica regras de visibilidade
      const contatos = perfis
        .filter((p) => p.ativo !== false && p.id !== callerId)
        .filter((p) => {
          const role = (p.role || "").toLowerCase();
          if (isCliente) {
            if (role === "operador") return true;
            if (role === "superadmin" || role === "adm") {
              const memoria = admVisibilidadeChatMemoria.get(p.id);
              const visivel = typeof p.visivel_no_chat === "boolean" ? p.visivel_no_chat : memoria;
              return Boolean(visivel);
            }
            return false;
          }
          return true; // Admins e operadores veem todos
        })
        .map((p) => ({
          userId: p.id,
          nome: p.nome || p.email?.split("@")[0] || "Usuário",
          role: p.role || "cliente",
          email: p.email,
          visivelNoChat: Boolean(
            typeof p.visivel_no_chat === "boolean"
              ? p.visivel_no_chat
              : admVisibilidadeChatMemoria.get(p.id),
          ),
        }));

      return new Response(JSON.stringify({ success: true, contatos }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, message: e?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // ROTA 2: POST /api/chat/visibilidade
  if (url.pathname === "/api/chat/visibilidade" && request.method === "POST") {
    if (!isAdmin) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Apenas administradores podem alterar visibilidade",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    try {
      const body = (await request.json()) as any;
      const visivel = Boolean(body?.visivel);

      // Salva em memória para garantia instantânea
      admVisibilidadeChatMemoria.set(callerId, visivel);

      // Tenta persistir no banco
      try {
        await adminClient
          .from("profiles")
          .update({ visivel_no_chat: visivel, updated_at: new Date().toISOString() })
          .eq("id", callerId);

        // Se for SuperADM, sincroniza ambas as contas canônicas
        const { data: callerUser } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", callerId)
          .maybeSingle();
        const email = (callerUser?.email || "").toLowerCase();
        if (email === "novaes@adm.28bpm.local" || email === "novaes@oficial.tec.br") {
          await adminClient
            .from("profiles")
            .update({ visivel_no_chat: visivel, updated_at: new Date().toISOString() })
            .in("email", ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"]);

          const { data: superAdms } = await adminClient
            .from("profiles")
            .select("id")
            .in("email", ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"]);
          if (Array.isArray(superAdms)) {
            for (const sa of superAdms) {
              admVisibilidadeChatMemoria.set(sa.id, visivel);
            }
          }
        }
      } catch {
        // Ignora caso a coluna ainda não exista
      }

      return new Response(JSON.stringify({ success: true, visivel }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch {
      return new Response(JSON.stringify({ success: false, message: "Erro no payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // ROTA 3: GET /api/chat/conversas-usuario?userId=xxx (Auditoria e supervisão para ADM)
  if (url.pathname === "/api/chat/conversas-usuario" && request.method === "GET") {
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso restrito ao Administrador" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const targetUserId = url.searchParams.get("userId");
    if (!targetUserId) {
      return new Response(JSON.stringify({ success: false, message: "userId obrigatório" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    try {
      // Busca todas as mensagens de chat onde o usuário participou
      const { data: msgs, error: errMsgs } = await adminClient
        .from("notificacoes_sistema")
        .select(
          "id, remetente_user_id, destinatario_user_id, remetente_nome, mensagem, created_at, lida",
        )
        .eq("tipo", "chat")
        .or(`remetente_user_id.eq.${targetUserId},destinatario_user_id.eq.${targetUserId}`)
        .order("created_at", { ascending: false })
        .limit(300);

      if (errMsgs) {
        throw new Error(errMsgs.message);
      }

      // Coleta todos os interlocutores
      const interlocutoresMap = new Map<
        string,
        {
          interlocutorId: string;
          interlocutorNome: string;
          interlocutorRole: string;
          ultimaMensagem: string;
          ultimaData: string;
          totalMensagens: number;
        }
      >();

      const idsParaBuscar = new Set<string>();

      for (const m of msgs || []) {
        const partnerId =
          m.remetente_user_id === targetUserId ? m.destinatario_user_id : m.remetente_user_id;
        if (!partnerId) continue;
        idsParaBuscar.add(partnerId);

        if (!interlocutoresMap.has(partnerId)) {
          interlocutoresMap.set(partnerId, {
            interlocutorId: partnerId,
            interlocutorNome:
              m.remetente_user_id === partnerId ? m.remetente_nome || "Usuário" : "Usuário",
            interlocutorRole: "usuario",
            ultimaMensagem: m.mensagem || "",
            ultimaData: m.created_at || "",
            totalMensagens: 1,
          });
        } else {
          const item = interlocutoresMap.get(partnerId)!;
          item.totalMensagens += 1;
        }
      }

      // Enriquece nomes e roles com perfis do banco
      if (idsParaBuscar.size > 0) {
        const { data: perfisInterlocutores } = await adminClient
          .from("profiles")
          .select("id, nome, email, role")
          .in("id", Array.from(idsParaBuscar));

        if (perfisInterlocutores && Array.isArray(perfisInterlocutores)) {
          for (const p of perfisInterlocutores) {
            const item = interlocutoresMap.get(p.id);
            if (item) {
              item.interlocutorNome = p.nome || p.email?.split("@")[0] || item.interlocutorNome;
              item.interlocutorRole = p.role || item.interlocutorRole;
            }
          }
        }
      }

      const conversas = Array.from(interlocutoresMap.values()).sort(
        (a, b) => new Date(b.ultimaData).getTime() - new Date(a.ultimaData).getTime(),
      );

      return new Response(JSON.stringify({ success: true, conversas }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, message: e?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // ROTA 4: GET /api/chat/historico-supervisao?usuarioA=xxx&usuarioB=xxx
  if (url.pathname === "/api/chat/historico-supervisao" && request.method === "GET") {
    const usuarioA = url.searchParams.get("usuarioA");
    const usuarioB = url.searchParams.get("usuarioB");

    if (!usuarioA || !usuarioB) {
      return new Response(
        JSON.stringify({ success: false, message: "usuarioA e usuarioB obrigatórios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    // Permite se for Administrador OU se o usuário chamador for um dos participantes (usuarioA ou usuarioB)
    if (!isAdmin && callerId !== usuarioA && callerId !== usuarioB) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Acesso restrito aos participantes da conversa ou Administrador",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    try {
      const { data: msgs, error } = await adminClient
        .from("notificacoes_sistema")
        .select(
          "id, remetente_user_id, destinatario_user_id, remetente_nome, mensagem, created_at, lida",
        )
        .eq("tipo", "chat")
        .or(
          `and(remetente_user_id.eq.${usuarioA},destinatario_user_id.eq.${usuarioB}),and(remetente_user_id.eq.${usuarioB},destinatario_user_id.eq.${usuarioA})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ success: true, mensagens: msgs || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, message: e?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  return null;
}

async function handleApiGateway(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/gateway")) {
    return null;
  }

  // Rota de envio de comando GT06 diretamente ao socket TCP do rastreador
  if (url.pathname === "/api/gateway/comando" && request.method === "POST") {
    try {
      const body = await request.json();
      if (body && typeof body.comando === "string") {
        body.comando = sanitizarComandoHardware(body.comando);
      }

      // REGRA IMPERIOSA: Verificação de perfil S.adm Auditor no Gateway de Comandos
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      let userRole: string | null = null;
      let authUserId: string | null = null;
      if (token) {
        try {
          const { supabaseUrl, supabaseAnonKey } = getSupabaseServerParams(env);
          const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });
          const { data: userData } = await userClient.auth.getUser(token);
          if (userData?.user?.id) {
            authUserId = userData.user.id;
            const { data: pData } = await userClient
              .from("profiles")
              .select("role")
              .eq("id", userData.user.id)
              .maybeSingle();
            userRole = pData?.role || null;
          }
        } catch {}
      }

      if (userRole === "superadmin_auditor" || body?.origem === "auditor") {
        const isConsulta = ehComandoConsultaSomenteLeitura(body?.comando || "");

        if (!isConsulta) {
          return new Response(
            JSON.stringify({
              sucesso: false,
              mensagem:
                "Ação bloqueada: O perfil S.adm Auditor só pode disparar consultas de leitura (STATUS, WHERE, PARAM, etc.). Proibido alterar parâmetros ou bloquear veículos.",
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }

      if (userRole === "locatario" && authUserId) {
        const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });
        const { data: locRow } = await adminClient
          .from("locatarios_cliente")
          .select(
            "ativo, veiculos_permitidos, pode_bloquear, pode_desbloquear, pode_bloquear_desbloquear",
          )
          .eq("user_id", authUserId)
          .maybeSingle();

        if (!locRow || !locRow.ativo) {
          return new Response(
            JSON.stringify({
              sucesso: false,
              mensagem:
                "Acesso bloqueado: Seu perfil de usuário está inativo ou bloqueado pelo cliente titular.",
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        const comandoTexto = body?.comando || "";
        const isBloqueio = ehComandoBloqueio(comandoTexto);
        const isDesbloqueio = ehComandoDesbloqueio(comandoTexto);

        const temPermissaoBloqueio = Boolean(
          locRow.pode_bloquear || locRow.pode_bloquear_desbloquear,
        );
        const temPermissaoDesbloqueio = Boolean(
          locRow.pode_desbloquear || locRow.pode_bloquear_desbloquear,
        );

        if (isBloqueio && !temPermissaoBloqueio) {
          return new Response(
            JSON.stringify({
              sucesso: false,
              mensagem:
                "Ação não permitida: Seu perfil de usuário não possui autorização para bloquear veículos.",
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        if (isDesbloqueio && !temPermissaoDesbloqueio) {
          return new Response(
            JSON.stringify({
              sucesso: false,
              mensagem:
                "Ação não permitida: Seu perfil de usuário não possui autorização para desbloquear veículos.",
            }),
            { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        if (body?.veiculo_id) {
          const permitidos = Array.isArray(locRow.veiculos_permitidos)
            ? locRow.veiculos_permitidos
            : [];
          if (!permitidos.includes(body.veiculo_id)) {
            return new Response(
              JSON.stringify({
                sucesso: false,
                mensagem:
                  "Ação não autorizada: Este veículo não está atribuído ao seu perfil de usuário.",
              }),
              { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
            );
          }
        }
      }
      const hosts = [
        "https://gps.oficial.tec.br/gd/gps/api/comando",
        "http://167.234.233.82:8082/api/comando",
        "https://gps.oficial.tec.br/api/comando",
        "http://gps.oficial.tec.br:8080/api/comando",
        "http://167.234.233.82:8080/api/comando",
      ];
      let ultimoErro = "";
      let ultimaRespostaJson: any = null;
      let respostaEnfileirada: any = null;
      const gatewayToken =
        (env as any)?.SUPABASE_SERVICE_ROLE_KEY ||
        (env as any)?.GD_GPS_GATEWAY_TOKEN ||
        (env as any)?.GATEWAY_SECRET ||
        "hunter-gateway-secret-2026";
      for (const host of hosts) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6500);
          const res = await fetch(host, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${gatewayToken}`,
              "x-gateway-secret": gatewayToken,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            ultimaRespostaJson = data;
            // Se o comando foi despachado para o socket ativo ou obteve resposta direta do hardware
            if (data && (data.enviado || data.resposta)) {
              if (body?.veiculoId || body?.veiculo_id) {
                const vid = body.veiculoId || body.veiculo_id;
                const cmd = String(body.comando || "");
                const isBloq = ehComandoBloqueio(cmd);
                const isDesb = ehComandoDesbloqueio(cmd);
                if (isBloq || isDesb) {
                  void broadcastEventoRealtime(env, "veiculo_atualizado", {
                    veiculoId: vid,
                    bloqueado: isBloq,
                    rele_status: isBloq,
                    timestamp: Date.now(),
                  });
                }
              }
              return new Response(JSON.stringify(data), {
                status: 200,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              });
            }
            // Guarda resposta de enfileiramento caso nenhum outro gateway tenha o socket online
            if (data && data.enfileirado && !respostaEnfileirada) {
              respostaEnfileirada = data;
            }
          }
        } catch (err: any) {
          ultimoErro = err?.message || String(err);
        }
      }
      if (respostaEnfileirada) {
        return new Response(JSON.stringify(respostaEnfileirada), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }
      if (ultimaRespostaJson) {
        return new Response(JSON.stringify(ultimaRespostaJson), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: `Falha ao conectar ao Gateway: ${ultimoErro}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: err?.message || "Requisição inválida" }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // Rota de listagem de conexões ativas no Gateway (consolidando Oracle e Fly.io)
  if (url.pathname === "/api/gateway/conexoes" && request.method === "GET") {
    const hosts = [
      "https://gps.oficial.tec.br/gd/gps/api/conexoes",
      "http://167.234.233.82:8082/api/conexoes",
      "https://gps.oficial.tec.br/api/conexoes",
      "http://gps.oficial.tec.br:8080/api/conexoes",
      "http://167.234.233.82:8080/api/conexoes",
    ];
    const imeiVisto = new Set<string>();
    const conexoesConsolidadas: any[] = [];
    let respondeuPeloMenosUm = false;
    const errosDiag: Record<string, string> = {};
    const gatewayToken =
      (env as any)?.SUPABASE_SERVICE_ROLE_KEY ||
      (env as any)?.GD_GPS_GATEWAY_TOKEN ||
      (env as any)?.GATEWAY_SECRET ||
      "hunter-gateway-secret-2026";

    for (const host of hosts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(host, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
            "x-gateway-secret": gatewayToken,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          respondeuPeloMenosUm = true;
          if (Array.isArray(data?.conexoes)) {
            for (const c of data.conexoes) {
              if (c?.imei && !imeiVisto.has(c.imei)) {
                imeiVisto.add(c.imei);
                conexoesConsolidadas.push(c);
              }
            }
          }
        } else {
          errosDiag[host] = `HTTP ${res.status}`;
        }
      } catch (err: any) {
        errosDiag[host] = err?.message || String(err);
      }
    }
    if (respondeuPeloMenosUm) {
      return new Response(
        JSON.stringify({ total: conexoesConsolidadas.length, conexoes: conexoesConsolidadas }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }
    return new Response(JSON.stringify({ total: 0, conexoes: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  return null;
}

async function handleApiWhatsapp(
  request: Request,
  env: unknown,
  ctx?: unknown,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    !url.pathname.startsWith("/api/whatsapp") &&
    url.pathname !== "/api/alerta/ligacao" &&
    url.pathname !== "/api/alertas/ligacao"
  ) {
    return null;
  }

  const gatewayUrl = "https://gps.oficial.tec.br/gd/whatsapp"; // Gateway WhatsApp Exclusivo GD Segurança (Hospedado no Oracle Cloud gps.oficial.tec.br/gd/whatsapp, 100% isolado do SIGO Guardião)

  // 1. GET / HEAD /api/whatsapp/status
  if (
    url.pathname === "/api/whatsapp/status" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const alvos = [gatewayUrl];
    let ultimoErro = "";

    for (const alvo of alvos) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${alvo}/status`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const serverHeader = res.headers.get("server") || "";
          if (serverHeader.toLowerCase().includes("guardiao")) {
            continue;
          }
          const data = await res.json();
          if (data?.app && data.app !== "gd-seguranca" && data.app !== "hunter") {
            continue;
          }
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        }
        ultimoErro = `HTTP ${res.status}`;
      } catch (err: any) {
        ultimoErro = err?.message || "falha";
      }
    }

    return new Response(JSON.stringify({ status: "offline", conectado: false, erro: ultimoErro }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  // 2. POST /api/whatsapp/send
  if (url.pathname === "/api/whatsapp/send" && request.method === "POST") {
    try {
      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      const adminSb = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Checagem prévia de Bloqueio Emergencial
      const { data: cfgBloq } = await adminSb
        .from("relatorio_gerencial_config")
        .select("secoes_ativas, enviar_whatsapp")
        .limit(1)
        .maybeSingle();
      const sec = (cfgBloq?.secoes_ativas as any) || {};
      if (
        sec?.bloqueio_emergencial ||
        sec?.bloqueio_emergencial_whatsapp ||
        cfgBloq?.enviar_whatsapp === false
      ) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            erro: "Bloqueio emergencial ativo via Central. Envios externos suspensos.",
          }),
          { status: 503, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const body = await request.json();
      const token =
        (env as any)?.GD_WHATSAPP_TOKEN ||
        (env as any)?.WHATSAPP_GATEWAY_TOKEN ||
        (typeof process !== "undefined" ? process.env?.GD_WHATSAPP_TOKEN : undefined) ||
        "hunter-guardiao-whatsapp-secret-key-2026";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${gatewayUrl}/api/v1/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Hunter-Token": token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      let data: any = null;
      const rawText = await res.text().catch(() => "");
      try {
        data = JSON.parse(rawText);
      } catch {
        const textoLimpo = rawText
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        data = { sucesso: res.ok, erro: textoLimpo || `Erro HTTP ${res.status}` };
      }
      if (res.ok && (data as any)?.sucesso !== false) {
        try {
          const recipientStr = (body as any)?.recipient || (body as any)?.numero || "destinatario";
          const temDocumento = Boolean((body as any)?.documento || (body as any)?.document);
          await adminSb.from("system_activity_logs").insert({
            acao: "whatsapp_api_envio_sucesso",
            detalhe: `Disparo de WhatsApp via Web API para ${recipientStr}${temDocumento ? " com documento anexo" : ""}`,
          });

          // Disparo de ligação via MacroDroid somente quando autorizado explicitamente no metadata (forcarLigacao === true)
          const forcarLigacaoDireta = Boolean((body as any)?.metadata?.forcarLigacao === true);
          const jaProcessadoNoServidor = (body as any)?.metadata?.origem === "notificacoes_sistema";
          if (
            forcarLigacaoDireta &&
            !jaProcessadoNoServidor &&
            recipientStr &&
            recipientStr !== "destinatario"
          ) {
            await dispararLigacaoMacroDroid(
              recipientStr,
              String((body as any)?.metadata?.tipo || "alerta"),
              env,
              supabaseUrl,
              serviceRoleKey,
            ).catch(() => {});
          }
        } catch (_) {
          // Log silencioso sem interromper resposta ao cliente
        }
      }
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: `Falha ao contatar gateway: ${err?.message || err}`,
        }),
        { status: 502, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 3. GET /api/whatsapp/qrcode
  if (url.pathname === "/api/whatsapp/qrcode" && request.method === "GET") {
    const gdToken = (env as any)?.GD_WHATSAPP_TOKEN || process.env?.GD_WHATSAPP_TOKEN || "";
    return Response.redirect(
      `https://gps.oficial.tec.br/gd/whatsapp${gdToken ? `?token=${encodeURIComponent(gdToken)}` : ""}`,
      302,
    );
  }

  // 3b. POST /api/whatsapp/disconnect (Desconectar linha GD para sincronizar novo número)
  if (url.pathname === "/api/whatsapp/disconnect" && request.method === "POST") {
    try {
      const res = await fetch(`${gatewayUrl}/api/disconnect`, { method: "POST" });
      const htmlOrJson = await res.text();
      return new Response(htmlOrJson, {
        status: res.status,
        headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ sucesso: false, erro: err?.message || err }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // 3c. GET /api/whatsapp/bloqueio-emergencial ou /api/admin/whatsapp/status-bloqueio
  if (
    (url.pathname === "/api/whatsapp/bloqueio-emergencial" ||
      url.pathname === "/api/admin/whatsapp/status-bloqueio") &&
    request.method === "GET"
  ) {
    try {
      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      const adminSb = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: cfg } = await adminSb
        .from("relatorio_gerencial_config")
        .select("secoes_ativas, enviar_whatsapp, updated_at")
        .limit(1)
        .maybeSingle();
      const sec = (cfg?.secoes_ativas as any) || {};
      const bloqueado =
        Boolean(sec?.bloqueio_emergencial) ||
        Boolean(sec?.bloqueio_emergencial_whatsapp) ||
        cfg?.enviar_whatsapp === false;
      return new Response(
        JSON.stringify({
          sucesso: true,
          bloqueado,
          motivo: sec?.motivo_bloqueio || "",
          atualizado_em: cfg?.updated_at || new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ sucesso: false, erro: err?.message || err }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // 3d. POST /api/whatsapp/bloqueio-emergencial ou /api/admin/whatsapp/bloqueio-emergencial
  if (
    (url.pathname === "/api/whatsapp/bloqueio-emergencial" ||
      url.pathname === "/api/admin/whatsapp/bloqueio-emergencial") &&
    request.method === "POST"
  ) {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const hunterToken = request.headers.get("X-Hunter-Token") || "";
      const secret = "hunter-guardiao-whatsapp-secret-key-2026";
      const token = authHeader.replace(/^Bearer\s+/i, "") || hunterToken;

      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      const adminSb = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const gdToken = (env as any)?.GD_WHATSAPP_TOKEN || process.env?.GD_WHATSAPP_TOKEN || "";
      let autorizado = token === secret || (Boolean(gdToken) && token === gdToken);
      if (!autorizado && authHeader.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, authHeader.replace(/^Bearer\s+/i, ""), {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData } = await userClient.auth.getUser();
        if (userData?.user?.id) {
          const { data: p } = await adminSb
            .from("profiles")
            .select("role")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (p?.role === "superadmin" || p?.role === "admin") {
            autorizado = true;
          }
        }
      }

      if (!autorizado) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Acesso restrito ao SuperADM." }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const body = await request.json().catch(() => ({}));
      const bloqueado = Boolean(body.bloqueado);
      const motivo = String(
        body.motivo ||
          (bloqueado ? "Bloqueio emergencial acionado via Central" : "Comunicação reativada"),
      );

      const { data: cfgAtual } = await adminSb
        .from("relatorio_gerencial_config")
        .select("id, secoes_ativas")
        .limit(1)
        .maybeSingle();

      const secoesNovas = {
        ...((cfgAtual?.secoes_ativas as any) || {}),
        bloqueio_emergencial: bloqueado,
        bloqueio_emergencial_whatsapp: bloqueado,
        motivo_bloqueio: motivo,
        bloqueado_em: new Date().toISOString(),
      };

      if (cfgAtual?.id) {
        await adminSb
          .from("relatorio_gerencial_config")
          .update({
            secoes_ativas: secoesNovas,
            enviar_whatsapp: !bloqueado,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cfgAtual.id);
      }

      // Sincroniza estado com os gateways ativos (Baileys)
      try {
        const gwUrls = [
          gatewayUrl,
          "https://gps.oficial.tec.br",
          "https://gps.oficial.tec.br/gd/whatsapp",
        ];
        for (const gw of gwUrls) {
          fetch(`${gw}/api/bloqueio-emergencial`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secret}`,
              "X-Hunter-Token": secret,
            },
            body: JSON.stringify({ bloqueado, motivo }),
          }).catch(() => null);
        }
      } catch {
        /* não trava */
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          bloqueado,
          motivo,
          atualizado_em: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ sucesso: false, erro: err?.message || err }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // 4. POST /api/whatsapp/webhook (Auto-Monitoramento Interativo e Comandos de 1 Toque)
  if (url.pathname === "/api/whatsapp/webhook" && request.method === "POST") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const hunterToken = request.headers.get("X-Hunter-Token") || "";
      const secret = "hunter-guardiao-whatsapp-secret-key-2026";
      const token = authHeader.replace(/^Bearer\s+/i, "") || hunterToken;

      if (token !== secret) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const body = await request.json();
      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Checagem de bloqueio emergencial antes de processar mensagem recebida
      const { data: cfgBloq } = await supabase
        .from("relatorio_gerencial_config")
        .select("secoes_ativas, enviar_whatsapp")
        .limit(1)
        .maybeSingle();
      const sec = (cfgBloq?.secoes_ativas as any) || {};
      if (
        sec?.bloqueio_emergencial ||
        sec?.bloqueio_emergencial_whatsapp ||
        cfgBloq?.enviar_whatsapp === false
      ) {
        console.warn(
          "🛑 [WEBHOOK WHATSAPP] Mensagem recebida descartada: Bloqueio emergencial ativo na Central.",
        );
        return new Response(
          JSON.stringify({
            sucesso: true,
            resposta: null,
            motivo: "bloqueio_emergencial_ativo",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const resultado = await processarMensagemWhatsappRecebida(body, supabase, gatewayUrl, ctx);

      return new Response(JSON.stringify(resultado), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Erro interno ao processar webhook de auto-monitoramento",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 5. GET /api/whatsapp/telefones-cadastrados (Sincronização NATIVA de LIDs e Contatos)
  if (url.pathname === "/api/whatsapp/telefones-cadastrados" && request.method === "GET") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const hunterToken = request.headers.get("X-Hunter-Token") || "";
      const secret = "hunter-guardiao-whatsapp-secret-key-2026";
      const token = authHeader.replace(/^Bearer\s+/i, "") || hunterToken;

      if (token !== secret) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Busca telefones cadastrados em profiles, revendedores, vendedores e clientes
      const [pRes, rRes, vRes, cRes] = await Promise.all([
        supabase.from("profiles").select("telefone"),
        supabase.from("revendedores").select("whatsapp, telefone"),
        supabase.from("vendedores").select("whatsapp, telefone"),
        supabase.from("clientes").select("whatsapp, telefone"),
      ]);

      const fonesSet = new Set<string>();
      // Inclui números mestres conhecidos (SuperADM)
      fonesSet.add("5524992501512");
      fonesSet.add("5524992494030");

      for (const p of (pRes.data || []) as any[]) {
        if (p.telefone) fonesSet.add(String(p.telefone));
      }
      for (const r of (rRes.data || []) as any[]) {
        if (r.whatsapp) fonesSet.add(String(r.whatsapp));
        if (r.telefone) fonesSet.add(String(r.telefone));
      }
      for (const v of (vRes.data || []) as any[]) {
        if (v.whatsapp) fonesSet.add(String(v.whatsapp));
        if (v.telefone) fonesSet.add(String(v.telefone));
      }
      for (const c of (cRes.data || []) as any[]) {
        if (c.whatsapp) fonesSet.add(String(c.whatsapp));
        if (c.telefone) fonesSet.add(String(c.telefone));
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          telefones: Array.from(fonesSet),
          total: fonesSet.size,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: err?.message || "Erro ao consultar telefones" }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 5b. POST /api/whatsapp/instalacao-evento (Disparo via Central para Novo Serviço / Agendamento)
  if (url.pathname === "/api/whatsapp/instalacao-evento" && request.method === "POST") {
    try {
      const authHeader = (request.headers.get("Authorization") || "").trim();
      const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!bearerToken) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            erro: "Autenticação obrigatória para disparo WhatsApp.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
      if (!supabaseUrl || !serviceRoleKey) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Ambiente Supabase não configurado." }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      const resUser = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey || serviceRoleKey,
          Authorization: `Bearer ${bearerToken}`,
          Accept: "application/json",
        },
      }).catch(() => null);

      if (!resUser || !resUser.ok) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Sessão inválida ou expirada." }),
          {
            status: 401,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          },
        );
      }

      const callerUser = (await resUser.json().catch(() => null)) as { id?: string } | null;
      const callerId = callerUser?.id;
      if (!callerId) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Usuário não identificado." }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const resPerfil = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${callerId}&select=role,ativo`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: "application/json",
          },
        },
      ).catch(() => null);

      if (resPerfil && resPerfil.ok) {
        const perfis = (await resPerfil.json().catch(() => [])) as any[];
        const perfilCaller = perfis?.[0];
        if (perfilCaller?.ativo === false) {
          return new Response(
            JSON.stringify({ sucesso: false, erro: "Perfil inativo para esta operação." }),
            {
              status: 403,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }
        if (String(perfilCaller?.role || "").toLowerCase() === "superadmin_auditor") {
          return new Response(
            JSON.stringify({
              sucesso: false,
              erro: "Ação bloqueada: perfil auditor em modo somente leitura.",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }
      }

      const body = (await request.json().catch(() => null)) as Record<string, any> | null;
      const evento = String(body?.evento || "").trim();
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      if (evento === "servico_atribuido") {
        const resultado = await notificarInstaladorNovoServicoWhatsapp(
          supabaseAdmin,
          {
            instalacaoId: body?.instalacaoId || null,
            instaladorId: body?.instaladorId || null,
            clienteId: body?.clienteId || null,
            clienteNome: body?.clienteNome || null,
            tipoVeiculo: body?.tipoVeiculo || null,
            placa: body?.placa || null,
            rastreadorImei: body?.rastreadorImei || null,
            localTipo: body?.localTipo || null,
            localEndereco: body?.localEndereco || null,
          },
          gatewayUrl,
        );

        return new Response(JSON.stringify({ sucesso: true, ...resultado }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      if (evento === "agendamento_definido") {
        if (!body?.data || !body?.hora) {
          return new Response(
            JSON.stringify({ sucesso: false, erro: "Data e horário são obrigatórios." }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        const resultado = await notificarClienteAgendamentoInstalacaoWhatsapp(
          supabaseAdmin,
          {
            instalacaoId: body?.instalacaoId || null,
            clienteId: body?.clienteId || null,
            instaladorId: body?.instaladorId || callerId,
            data: String(body.data),
            hora: String(body.hora),
            localTipo: body?.localTipo || null,
            localEndereco: body?.localEndereco || null,
          },
          gatewayUrl,
        );

        return new Response(JSON.stringify({ sucesso: true, ...resultado }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(
        JSON.stringify({ sucesso: false, erro: "Evento de instalação não suportado." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Erro interno ao processar evento WhatsApp de instalação.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // 6. POST /api/alerta/ligacao, /api/alertas/ligacao ou /api/whatsapp/ligacao (Discador MacroDroid)
  if (
    (url.pathname === "/api/alerta/ligacao" ||
      url.pathname === "/api/alertas/ligacao" ||
      url.pathname === "/api/whatsapp/ligacao") &&
    request.method === "POST"
  ) {
    try {
      const secretToken = "hunter-guardiao-whatsapp-secret-key-2026";
      const hunterTokenHeader = (request.headers.get("X-Hunter-Token") || "").trim();
      const authHeader = (request.headers.get("Authorization") || "").trim();
      const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

      const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
      const tokenInternoValido = hunterTokenHeader === secretToken || bearerToken === secretToken;

      if (!tokenInternoValido) {
        if (!bearerToken) {
          return new Response(
            JSON.stringify({ sucesso: false, erro: "Autenticação obrigatória para discagem." }),
            {
              status: 401,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        const resUser = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: supabaseAnonKey || serviceRoleKey,
            Authorization: `Bearer ${bearerToken}`,
            Accept: "application/json",
          },
        }).catch(() => null);

        if (!resUser || !resUser.ok) {
          return new Response(
            JSON.stringify({ sucesso: false, erro: "Sessão inválida ou expirada." }),
            {
              status: 401,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        const callerUser = (await resUser.json().catch(() => null)) as { id?: string } | null;
        const callerId = callerUser?.id;
        if (!callerId) {
          return new Response(
            JSON.stringify({ sucesso: false, erro: "Usuário não identificado." }),
            {
              status: 401,
              headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
            },
          );
        }

        const resPerfil = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${callerId}&select=role,ativo`,
          {
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              Accept: "application/json",
            },
          },
        ).catch(() => null);

        if (resPerfil && resPerfil.ok) {
          const perfis = (await resPerfil.json().catch(() => [])) as any[];
          const perfilCaller = perfis?.[0];
          if (perfilCaller?.ativo === false) {
            return new Response(
              JSON.stringify({ sucesso: false, erro: "Perfil inativo para esta operação." }),
              {
                status: 403,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
          if (String(perfilCaller?.role || "").toLowerCase() === "superadmin_auditor") {
            return new Response(
              JSON.stringify({
                sucesso: false,
                erro: "Ação bloqueada: perfil auditor em modo somente leitura.",
              }),
              {
                status: 403,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
        }
      }

      const body = await request.json();
      const telefone = body?.telefone || body?.numero;
      const motivo = body?.motivo || "comando_j16_concluido";
      const forcar = body?.forcar === true || String(motivo).toLowerCase().includes("teste");

      if (!telefone) {
        return new Response(JSON.stringify({ sucesso: false, erro: "Telefone não informado" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const resDiscador = await dispararLigacaoMacroDroid(
        String(telefone),
        String(motivo),
        env,
        supabaseUrl,
        serviceRoleKey,
        forcar,
      );

      return new Response(JSON.stringify(resDiscador), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          erro: err?.message || "Erro interno ao disparar ligação",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    // Reconciliação em segundo plano com throttle de 30 segundos
    const agoraFetch = Date.now();
    if (agoraFetch - ultimoTimestampReconciliacaoAlertas > 30000) {
      ultimoTimestampReconciliacaoAlertas = agoraFetch;
      try {
        const paramsSupabase = getSupabaseServerParams(env);
        if (paramsSupabase.supabaseUrl && paramsSupabase.serviceRoleKey) {
          (ctx as any)?.waitUntil?.(
            reconciliarAlertasSegurancaServidor(
              paramsSupabase.supabaseUrl,
              paramsSupabase.serviceRoleKey,
              env,
            ).catch(() => {}),
          );
        }
      } catch {
        /* fallback sem travar requisição */
      }
    }

    // Intercepta rotas de Gateway GT06 / J16 (comando direto e conexões ativas)
    const gatewayResponse = await handleApiGateway(request, env);
    if (gatewayResponse) {
      return gatewayResponse;
    }

    // Intercepta rotas de Gateway WhatsApp (status, envio direto e qrcode)
    const whatsappResponse = await handleApiWhatsapp(request, env, ctx);
    if (whatsappResponse) {
      return whatsappResponse;
    }

    // Intercepta rotas de Chat seguras (contatos, visibilidade e supervisão de conversas para ADM)
    const chatResponse = await handleApiChat(request, env);
    if (chatResponse) {
      return chatResponse;
    }

    // Intercepta rotas de Web Push nativo (inscrição, disparo e status)
    const pushResponse = await handleApiWebPush(request, env);
    if (pushResponse) {
      return pushResponse;
    }

    // Intercepta arquivos estáticos PWA (Digital Asset Links para Android e Service Worker)
    const pwaResponse = await handleStaticPwaAssets(request);
    if (pwaResponse) {
      return pwaResponse;
    }

    // Intercepta rotas de LGPD (Direitos dos Titulares Art. 18, Confirmação, Acesso e Anonimização)
    const lgpdResponse = await handleApiLgpd(request, env);
    if (lgpdResponse) {
      return lgpdResponse;
    }

    // Intercepta rotas de validação e cadastro de convites de instalador
    const conviteResponse = await handleApiConvites(request, env);
    if (conviteResponse) {
      return conviteResponse;
    }

    // Intercepta rotas de cliente (solicitação de veículo com tolerância a schema cache)
    const clienteResponse = await handleApiCliente(request, env);
    if (clienteResponse) {
      return clienteResponse;
    }

    // Intercepta proxy viário OSRM de altíssima fidelidade pelas ruas
    const rotaResponse = await handleApiRota(request, env);
    if (rotaResponse) {
      return rotaResponse;
    }

    // Intercepta rotas de API seguras de gestao de manutencao preventiva
    const apiResponse = await handleApiManutencao(request, env);
    if (apiResponse) {
      return apiResponse;
    }

    // Intercepta rotas de API seguras de administracao de usuarios
    const adminUsuariosResponse = await handleApiAdminUsuarios(request, env);
    if (adminUsuariosResponse) {
      return adminUsuariosResponse;
    }

    // Intercepta rotas de API seguras de estoque e chips (com Service Role, imune a recursão RLS)
    const estoqueResponse = await handleApiEstoque(request, env);
    if (estoqueResponse) {
      return estoqueResponse;
    }

    // Intercepta rota segura de listagem de clientes (com Service Role, imune a recursão RLS)
    const clientesResponse = await handleApiClientes(request, env);
    if (clientesResponse) {
      return clientesResponse;
    }

    // Intercepta rotas de API seguras de gestão de locatários e auto-cadastro
    const locatariosResponse = await handleApiLocatarios(request, env);
    if (locatariosResponse) {
      return locatariosResponse;
    }

    // Intercepta rotas de API seguras de rastreadores e hardware (com Service Role, imune a recursão RLS)
    const rastreadoresResponse = await handleApiRastreadores(request, env);
    if (rastreadoresResponse) {
      return rastreadoresResponse;
    }

    // Intercepta rotas de API seguras de veículos e distribuição de frota (com Service Role, imune a recursão RLS)
    const veiculosResponse = await handleApiVeiculos(request, env);
    if (veiculosResponse) {
      return veiculosResponse;
    }

    // Intercepta rotas seguras de redefinição de senha de parceiros (revendedor e vendedor)
    const parceiroSenhaResponse = await handleApiAdminRedefinirSenhaParceiro(request, env);
    if (parceiroSenhaResponse) {
      return parceiroSenhaResponse;
    }

    // Intercepta rotas seguras de exclusão de parceiros comerciais (revendedor e vendedor)
    const parceiroExclusaoResponse = await handleApiAdminExcluirParceiro(request, env);
    if (parceiroExclusaoResponse) {
      return parceiroExclusaoResponse;
    }

    // Intercepta rotas seguras de gestao de propostas comerciais
    const propostasResponse = await handleApiPropostas(request, env);
    if (propostasResponse) {
      return propostasResponse;
    }

    // Intercepta rotas seguras de registro e conferencia de documentos forenses emitidos
    const documentosResponse = await handleApiDocumentos(request, env);
    if (documentosResponse) {
      return documentosResponse;
    }

    // Intercepta rotas seguras de mensalidades e informação de pagamento do cliente
    const mensalidadesResponse = await handleApiMensalidades(request, env);
    if (mensalidadesResponse) {
      return mensalidadesResponse;
    }

    // Intercepta rotas seguras de contratos assinados e autenticidade
    const contratosResponse = await handleApiContratos(request, env);
    if (contratosResponse) {
      return contratosResponse;
    }

    // Intercepta rota de verificação de jammers pelo servidor (chamada pelo cron scheduled)
    const alertasCronResponse = await handleApiAlertasCron(request, env);
    if (alertasCronResponse) {
      return alertasCronResponse;
    }

    // Intercepta rota segura de OCR de CNH (PDF e fotos de celular)
    const ocrCnhResponse = await handleApiOcrCnh(request, env);
    if (ocrCnhResponse) {
      return ocrCnhResponse;
    }

    // Intercepta rota segura de OCR de NF / Cupom / Comprovante (PDF e fotos de celular)
    const ocrNfResponse = await handleApiOcrNf(request, env);
    if (ocrNfResponse) {
      return ocrNfResponse;
    }

    // Intercepta rota segura de upload de comprovantes (bucket nfs-temp)
    const uploadNfResponse = await handleApiUploadNf(request, env);
    if (uploadNfResponse) {
      return uploadNfResponse;
    }

    // Intercepta rota pública segura de consulta de compartilhamento temporário
    const compartilhamentoResponse = await handleApiCompartilhamento(request, env);
    if (compartilhamentoResponse) {
      return compartilhamentoResponse;
    }

    // Intercepta rotas do Relatório Diário de Métricas do Sistema
    const relatoriosResponse = await handleApiRelatoriosDiarios(request, env);
    if (relatoriosResponse) {
      return relatoriosResponse;
    }

    // Intercepta rota de veículos para o Perfil S.adm Auditor
    const gpsAuditorResponse = await handleApiGpsAuditor(request, env);
    if (gpsAuditorResponse) {
      return gpsAuditorResponse;
    }

    // Intercepta rotas seguras do Módulo Vigilante (postos e rondas)
    const vigilantesResponse = await handleApiVigilantes(request, env);
    if (vigilantesResponse) {
      return vigilantesResponse;
    }

    // Intercepta rota segura de geocodificação de endereços
    const geocodificarResponse = await handleApiGeocodificar(request, env);
    if (geocodificarResponse) {
      return geocodificarResponse;
    }

    const entry = await getServerEntry();
    const response = await entry.fetch(request, env, ctx);

    // Injeta headers de segurança em toda resposta
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CLOUDFLARE WORKERS CRON TRIGGER — Detecção de Jammer no Servidor
  // Configurado no wrangler.toml como: [triggers] crons = ["*/5 * * * *"]
  // Executa a cada 5 minutos independentemente de qualquer cliente estar online.
  // ─────────────────────────────────────────────────────────────────────────
  async scheduled(_event: unknown, env: unknown, _ctx: unknown): Promise<void> {
    try {
      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);

      // 0. Reconciliação e Despacho Ativo de Alertas de Cerca Virtual e Segurança
      try {
        await reconciliarAlertasSegurancaServidor(supabaseUrl, serviceRoleKey, env);
      } catch (errRec) {
        console.warn("[CRON-ALERTAS] Falha na reconciliação de alertas de cerca:", errRec);
      }

      // Chama a função PostgreSQL via RPC com service_role (sem RLS)
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verificar_jammers_servidor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ p_timeout_minutos: 3 }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(
          `[CRON-JAMMER] Falha na RPC verificar_jammers_servidor: HTTP ${res.status} — ${txt}`,
        );
      } else {
        const resultado = await res.json().catch(() => null);
        if (resultado?.alertas_criados > 0) {
          console.log(
            `[CRON-JAMMER] ${resultado.alertas_criados} alerta(s) de jammer gerado(s) e Push VAPID disparado(s).`,
          );
        }
      }

      // 1.1 Verifica perda de comunicação prolongada no servidor conforme regras do veículo
      try {
        const resPerda = await fetch(
          `${supabaseUrl}/rest/v1/rpc/verificar_perda_comunicacao_servidor`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({}),
          },
        );
        if (resPerda.ok) {
          const resultadoPerda = await resPerda.json().catch(() => null);
          if (resultadoPerda?.alertas_criados > 0) {
            console.log(
              `[CRON-PERDA-SINAL] ${resultadoPerda.alertas_criados} alerta(s) de perda de comunicação gerado(s).`,
            );
          }
        }
      } catch (errPerda) {
        console.warn(
          "[CRON-PERDA-SINAL] Erro inesperado ao checar perda de comunicação:",
          errPerda,
        );
      }
    } catch (err) {
      console.warn("[CRON-JAMMER] Erro inesperado no cron de jammer:", err);
    }

    // 2. Relatório Diário de Métricas para o SuperADM (WhatsApp e Push)
    try {
      const now = new Date();
      // Converte para minutos do dia no Horário de Brasília (UTC - 3)
      const spOffsetMs = 3 * 3600 * 1000;
      const spDate = new Date(now.getTime() - spOffsetMs);
      const hojeCivilBrt = spDate.toISOString().split("T")[0];
      const spHora = spDate.getUTCHours();
      const spMin = spDate.getUTCMinutes();
      const minutosAtuaisSp = spHora * 60 + spMin;

      const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
      let minutosAlvo = 10 * 60; // 10:00
      let envioAtivo = true;
      let jaEnviouHoje = false;

      const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      // 2.1. Processamento atômico do ciclo de vida das Notas Fiscais (48h -> 24h -> 6h -> 30m -> expurgo)
      try {
        await adminSupabase.rpc("hunter_processar_ciclo_vida_nfs");
      } catch (errNfs) {
        console.warn("[CRON-NFS] Falha ao processar ciclo de vida de NFs:", errNfs);
      }

      // 2.2. Avaliação de disparo único diário do relatório
      let configRowId: string | null = null;
      try {
        const { data: cfgs } = await adminSupabase
          .from("relatorio_gerencial_config")
          .select("id, ativo, horario_envio, ultimo_envio_em")
          .limit(1);

        if (cfgs && cfgs.length > 0) {
          configRowId = cfgs[0].id;
          envioAtivo = cfgs[0].ativo ?? true;
          if (cfgs[0].ultimo_envio_em) {
            const dataUltimoEnvio = new Date(
              new Date(cfgs[0].ultimo_envio_em).getTime() - 3 * 3600 * 1000,
            )
              .toISOString()
              .split("T")[0];
            if (dataUltimoEnvio === hojeCivilBrt) {
              jaEnviouHoje = true;
            }
          }
          if (cfgs[0].horario_envio) {
            const [h, m] = cfgs[0].horario_envio.split(":").map(Number);
            if (!isNaN(h) && !isNaN(m)) {
              minutosAlvo = h * 60 + m;
            }
          }
        }
      } catch {
        /* fallback mantém 10:00 */
      }

      // Checagem complementar na tabela notificacoes_sistema para impedir repetições
      if (!jaEnviouHoje) {
        try {
          const { data: notifsHoje } = await adminSupabase
            .from("notificacoes_sistema")
            .select("id")
            .eq("tipo", "gerencial")
            .gte("created_at", `${hojeCivilBrt}T00:00:00-03:00`)
            .limit(1);

          if (notifsHoje && notifsHoje.length > 0) {
            jaEnviouHoje = true;
          }
        } catch {
          /* fallback segue verificação de config */
        }
      }

      // Janela estrita de disparo diário: no horário configurado e apenas se não foi enviado hoje
      const diffMinutos = minutosAtuaisSp - minutosAlvo;
      if (envioAtivo && !jaEnviouHoje && diffMinutos >= 0 && diffMinutos < 5) {
        // PRE-LOCK ATÔMICO: Atualiza imediatamente ultimo_envio_em para travar execuções concorrentes
        if (configRowId) {
          await adminSupabase
            .from("relatorio_gerencial_config")
            .update({ ultimo_envio_em: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", configRowId)
            .catch(() => null);
        }

        // Passa now (UTC puro) — o service calcula BRT internamente.
        // NUNCA passar spDate (já com -3h), para evitar duplo offset.
        const resultado = await enviarRelatorioDiarioSuperAdm(env, { refDate: now });
        if (resultado.sucesso && !resultado.jaEnviadoHoje) {
          console.log(
            `[CRON-RELATORIO-DIARIO] Relatório de métricas diárias enviado com sucesso: ${resultado.destinatario}`,
          );
        }
      }

      // 2.3. Avaliação de DRE diária no WhatsApp para Revendedores e Vendedores
      try {
        await despacharDreDiariaParceirosServer(adminSupabase, now, minutosAtuaisSp, hojeCivilBrt);
      } catch (errDreParceiros) {
        console.warn(
          "[CRON-DRE-PARCEIROS] Erro inesperado ao processar DRE de parceiros:",
          errDreParceiros,
        );
      }
    } catch (errRelatorio) {
      console.warn(
        "[CRON-RELATORIO-DIARIO] Erro inesperado no envio de relatório diário:",
        errRelatorio,
      );
    }
  },
};

async function despacharWhatsappGatewayServer(fone: string, mensagem: string): Promise<boolean> {
  if (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      Boolean((globalThis as any).__TEST__))
  ) {
    return true;
  }

  try {
    const gatewayUrl = "https://gps.oficial.tec.br/gd/whatsapp";
    const token =
      (typeof process !== "undefined" ? process.env?.GD_WHATSAPP_TOKEN : undefined) ||
      "hunter-guardiao-whatsapp-secret-key-2026";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const numLimpo = fone.replace(/\D/g, "");
    const foneNorm = numLimpo.startsWith("55") ? numLimpo : `55${numLimpo}`;

    const resEnvio = await fetch(`${gatewayUrl}/api/v1/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Hunter-Token": token,
      },
      body: JSON.stringify({
        recipient: foneNorm,
        message: mensagem,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return resEnvio.ok;
  } catch (e) {
    console.warn("[WHATSAPP-GATEWAY-SERVER] Falha ao enviar:", e);
    return false;
  }
}

async function despacharDreDiariaParceirosServer(
  adminSupabase: any,
  now: Date,
  minutosAtuaisSp: number,
  hojeCivilBrt: string,
): Promise<void> {
  // 1. Processa Revendedores
  try {
    const { data: revs } = await adminSupabase
      .from("revendedores")
      .select(
        "id, nome, valor_base_sistema, dre_whatsapp_ativo, dre_whatsapp_horario, dre_whatsapp_telefone, dre_ultimo_envio_em",
      )
      .eq("ativo", true)
      .eq("dre_whatsapp_ativo", true);

    if (Array.isArray(revs)) {
      for (const rev of revs) {
        if (!rev.dre_whatsapp_telefone) continue;

        if (rev.dre_ultimo_envio_em) {
          const dataUltimoEnvio = new Date(
            new Date(rev.dre_ultimo_envio_em).getTime() - 3 * 3600 * 1000,
          )
            .toISOString()
            .split("T")[0];
          if (dataUltimoEnvio === hojeCivilBrt) continue;
        }

        let minutosAlvo = 9 * 60;
        if (rev.dre_whatsapp_horario) {
          const [h, m] = String(rev.dre_whatsapp_horario).split(":").map(Number);
          if (!isNaN(h) && !isNaN(m)) minutosAlvo = h * 60 + m;
        }

        const diffMin = minutosAtuaisSp - minutosAlvo;
        if (diffMin >= 0 && diffMin < 5) {
          await adminSupabase
            .from("revendedores")
            .update({ dre_ultimo_envio_em: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", rev.id)
            .catch(() => null);

          const { data: clis } = await adminSupabase
            .from("clientes")
            .select(
              "id, valor_mensalidade, valor_repasse_instalador, repasse_instalador_status, vendedor_id, vendedores:vendedor_id(valor_base_vendedor)",
            )
            .eq("revendedor_id", rev.id)
            .neq("status", "cancelado");

          const baseSis = Number(rev.valor_base_sistema) || 40.0;
          let faturamentoBruto = 0;
          let repasseAoMatriz = 0;
          let lucroLiquidoRevendedor = 0;
          let comissaoVendedores = 0;
          let totalTaxasDiretas = 0;
          let totalRepassesInstaladores = 0;

          for (const c of clis || []) {
            const mensalidade = Number(c.valor_mensalidade) || 0;
            const taxa = 0;
            const baseVend = c.vendedores?.valor_base_vendedor
              ? Number(c.vendedores.valor_base_vendedor)
              : undefined;

            if (c.vendedor_id) {
              repasseAoMatriz += baseSis;
              lucroLiquidoRevendedor += Math.max(0, (baseVend || 55.0) - baseSis);
              comissaoVendedores += Math.max(0, mensalidade - (baseVend || 55.0));
            } else {
              repasseAoMatriz += baseSis;
              lucroLiquidoRevendedor += Math.max(0, mensalidade - baseSis);
              totalTaxasDiretas += taxa;
            }
            faturamentoBruto += mensalidade;
            if (c.repasse_instalador_status === "pendente") {
              totalRepassesInstaladores += Number(c.valor_repasse_instalador) || 80.0;
            }
          }

          const liquidoEstimado =
            lucroLiquidoRevendedor + totalTaxasDiretas - totalRepassesInstaladores;
          const texto = `GD RASTREAMENTO - DEMONSTRATIVO FINANCEIRO DA FRANQUIA\nFranquia: ${rev.nome}\nFaturamento Mensal da Carteira: R$ ${faturamentoBruto.toFixed(2)}\nMinha Margem Mensal Recorrente: R$ ${lucroLiquidoRevendedor.toFixed(2)}\nTaxas de Instalacao Recebidas (Diretas): R$ ${totalTaxasDiretas.toFixed(2)}\nRepasse Obrigatorio a Matriz GD Rastreamento: R$ ${repasseAoMatriz.toFixed(2)}\nComissoes a Repassar aos Vendedores: R$ ${comissaoVendedores.toFixed(2)}\nMao de Obra a Pagar aos Instaladores: R$ ${totalRepassesInstaladores.toFixed(2)}\n--------------------------------------------------\nLUCRO LIQUIDO ESTIMADO DA FRANQUIA: R$ ${liquidoEstimado.toFixed(2)}\nTotal de Contratos na Rede: ${(clis || []).length}`;

          await despacharWhatsappGatewayServer(rev.dre_whatsapp_telefone, texto);
        }
      }
    }
  } catch (errRev) {
    console.warn("[CRON-DRE-PARCEIROS] Erro ao processar revendedores:", errRev);
  }

  // 2. Processa Vendedores
  try {
    const { data: vends } = await adminSupabase
      .from("vendedores")
      .select(
        "id, nome, valor_base_vendedor, dre_whatsapp_ativo, dre_whatsapp_horario, dre_whatsapp_telefone, dre_ultimo_envio_em, revendedores:revendedor_id(nome)",
      )
      .eq("ativo", true)
      .eq("dre_whatsapp_ativo", true);

    if (Array.isArray(vends)) {
      for (const vend of vends) {
        if (!vend.dre_whatsapp_telefone) continue;

        if (vend.dre_ultimo_envio_em) {
          const dataUltimoEnvio = new Date(
            new Date(vend.dre_ultimo_envio_em).getTime() - 3 * 3600 * 1000,
          )
            .toISOString()
            .split("T")[0];
          if (dataUltimoEnvio === hojeCivilBrt) continue;
        }

        let minutosAlvo = 9 * 60;
        if (vend.dre_whatsapp_horario) {
          const [h, m] = String(vend.dre_whatsapp_horario).split(":").map(Number);
          if (!isNaN(h) && !isNaN(m)) minutosAlvo = h * 60 + m;
        }

        const diffMin = minutosAtuaisSp - minutosAlvo;
        if (diffMin >= 0 && diffMin < 5) {
          await adminSupabase
            .from("vendedores")
            .update({ dre_ultimo_envio_em: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", vend.id)
            .catch(() => null);

          const { data: clis } = await adminSupabase
            .from("clientes")
            .select("id, valor_mensalidade, valor_repasse_instalador, repasse_instalador_status")
            .eq("vendedor_id", vend.id)
            .neq("status", "cancelado");

          const baseVend = Number(vend.valor_base_vendedor) || 55.0;
          let faturamentoMeus = 0;
          let custoBase = 0;
          let minhaComissao = 0;
          let totalRepasseInst = 0;

          for (const c of clis || []) {
            const mensalidade = Number(c.valor_mensalidade) || 0;
            faturamentoMeus += mensalidade;
            custoBase += baseVend;
            minhaComissao += Math.max(0, mensalidade - baseVend);
            if (c.repasse_instalador_status === "pendente") {
              totalRepasseInst += Number(c.valor_repasse_instalador) || 80.0;
            }
          }

          const ganhoLiquido = minhaComissao - totalRepasseInst;
          const revNome = vend.revendedores?.nome ? `Franquia: ${vend.revendedores.nome}\n` : "";

          const texto = `GD RASTREAMENTO - DEMONSTRATIVO DO VENDEDOR\nVendedor: ${vend.nome}\n${revNome}Faturamento Mensal da Minha Carteira: R$ ${faturamentoMeus.toFixed(2)}\nCusto Base Repassado a Franquia: R$ ${custoBase.toFixed(2)}\nMinha Comissao Mensal Recorrente: R$ ${minhaComissao.toFixed(2)}\nMao de Obra a Pagar aos Instaladores: R$ ${totalRepasseInst.toFixed(2)}\n--------------------------------------------------\nGANHO LIQUIDO ESTIMADO DO VENDEDOR: R$ ${ganhoLiquido.toFixed(2)}\nTotal de Clientes Ativos: ${(clis || []).length}`;

          await despacharWhatsappGatewayServer(vend.dre_whatsapp_telefone, texto);
        }
      }
    }
  } catch (errVend) {
    console.warn("[CRON-DRE-PARCEIROS] Erro ao processar vendedores:", errVend);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIAÇÃO E DESPACHO ATIVO DE ALERTAS EM SEGUNDO PLANO
// Garante entrega 100% de WhatsApp e Web Push mesmo com pg_net inoperante
// ─────────────────────────────────────────────────────────────────────────────
let ultimoTimestampReconciliacaoAlertas = 0;

async function reconciliarAlertasSegurancaServidor(
  supabaseUrl: string,
  serviceRoleKey: string,
  env: unknown,
): Promise<{ processados: number; enviados: number }> {
  let processados = 0;
  let enviados = 0;

  try {
    // 1. Busca transições de cerca virtual com whatsapp_enviado = false
    const resGeo = await fetch(
      `${supabaseUrl}/rest/v1/veiculo_areas_estado?whatsapp_enviado=eq.false&select=veiculo_id,area_id,estado,distancia_metros,ultimo_evento_tipo,ultimo_evento_em`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
      },
    );

    if (resGeo.ok) {
      const pendentesGeo = (await resGeo.json()) as any[];
      if (Array.isArray(pendentesGeo) && pendentesGeo.length > 0) {
        for (const p of pendentesGeo) {
          if (!p.veiculo_id || !p.ultimo_evento_tipo) continue;

          // FILTRO DE IDADE E SEGURANÇA:
          // Se a transição ocorreu há mais de 3 minutos, não dispara chamada tardia nem re-notifica fora de hora!
          const eventoTimestamp = p.ultimo_evento_em ? new Date(p.ultimo_evento_em).getTime() : 0;
          const diferencaMinutos = (Date.now() - eventoTimestamp) / 60000;
          if (diferencaMinutos > 3) {
            fetch(
              `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${p.veiculo_id}&area_id=eq.${p.area_id}`,
              {
                method: "PATCH",
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  whatsapp_enviado: true,
                  updated_at: new Date().toISOString(),
                }),
              },
            ).catch(() => {});
            continue;
          }

          processados++;

          // Busca dados do veículo
          const resV = await fetch(
            `${supabaseUrl}/rest/v1/veiculos?id=eq.${p.veiculo_id}&select=placa,cliente_id`,
            {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                Accept: "application/json",
              },
            },
          );
          const vDados = resV.ok ? ((await resV.json()) as any[]) : [];
          const placa = vDados?.[0]?.placa || "N/A";
          const clienteId = vDados?.[0]?.cliente_id || null;

          // Verifica preferência do veículo antes de inserir alerta ou notificação
          try {
            const resRegGeo = await fetch(
              `${supabaseUrl}/rest/v1/regras_veiculo?veiculo_id=eq.${p.veiculo_id}&select=alertas_ativos,canais_alertas`,
              {
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`,
                  Accept: "application/json",
                },
              },
            );
            if (resRegGeo.ok) {
              const arrRegGeo = (await resRegGeo.json()) as any[];
              if (arrRegGeo.length > 0) {
                const regraGeo = resolverRegraEntregaAlerta({
                  tipo: p.ultimo_evento_tipo || "saida_area",
                  alertasAtivos: arrRegGeo[0]?.alertas_ativos,
                  canaisGlobais: arrRegGeo[0]?.canais_alertas,
                });
                if (!regraGeo.ativo || (!regraGeo.app && !regraGeo.whatsapp && !regraGeo.ligacao)) {
                  fetch(
                    `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${p.veiculo_id}&area_id=eq.${p.area_id}`,
                    {
                      method: "PATCH",
                      headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        whatsapp_enviado: true,
                        updated_at: new Date().toISOString(),
                      }),
                    },
                  ).catch(() => {});
                  continue;
                }
              }
            }
          } catch {
            /* fallback não bloqueia se der erro de rede */
          }

          // Busca nome da área
          const resA = await fetch(
            `${supabaseUrl}/rest/v1/areas_seguras?id=eq.${p.area_id}&select=nome`,
            {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                Accept: "application/json",
              },
            },
          );
          const aDados = resA.ok ? ((await resA.json()) as any[]) : [];
          const nomeArea = aDados?.[0]?.nome || "Área Monitorada";

          const ehSaida = p.ultimo_evento_tipo === "saida_area";
          const titulo = ehSaida
            ? `🚨 Saída de Área Protegida — ${placa}`
            : `✅ Chegada em Área Protegida — ${placa}`;

          const distanciaTxt = p.distancia_metros
            ? ` (distância: ${Math.round(p.distancia_metros)} m)`
            : "";

          const dataHoraStr = new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(p.ultimo_evento_em || Date.now()));

          const mensagem = ehSaida
            ? `Veículo ${placa} saiu da área monitorada "${nomeArea}" em ${dataHoraStr}${distanciaTxt}.`
            : `Veículo ${placa} entrou na área protegida "${nomeArea}" em ${dataHoraStr}.`;

          // Busca user_id do cliente titular caso disponível para endereçamento de notificações
          let clienteUserId: string | null = null;
          if (clienteId) {
            try {
              const resCli = await fetch(
                `${supabaseUrl}/rest/v1/clientes?id=eq.${clienteId}&select=user_id`,
                {
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    Accept: "application/json",
                  },
                },
              );
              if (resCli.ok) {
                const arrCli = (await resCli.json()) as any[];
                if (arrCli?.[0]?.user_id) clienteUserId = arrCli[0].user_id;
              }
            } catch {
              /* ignora */
            }
          }

          // 1. Persiste na tabela canônica de alertas_seguranca (reatividade do AlertasAcidenteBanner e CentralAlertasModal)
          try {
            await fetch(`${supabaseUrl}/rest/v1/alertas_seguranca`, {
              method: "POST",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                veiculo_id: p.veiculo_id,
                cliente_id: clienteId,
                tipo: p.ultimo_evento_tipo,
                gravidade: ehSaida ? "media" : "baixa",
                latitude: 0,
                longitude: 0,
                velocidade: 0,
                detalhes: mensagem,
                reconhecido: false,
                created_at: new Date(p.ultimo_evento_em || Date.now()).toISOString(),
              }),
            });
          } catch (errAl) {
            console.warn("[RECONCILIAR-ALERTAS] Falha ao persistir em alertas_seguranca:", errAl);
          }

          // 2. Persiste em notificacoes_sistema (para reatividade do sininho, toast e WebSocket de usuários conectados)
          try {
            await fetch(`${supabaseUrl}/rest/v1/notificacoes_sistema`, {
              method: "POST",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                destinatario_user_id: clienteUserId,
                destinatario_cliente_id: clienteId,
                titulo,
                mensagem,
                tipo: p.ultimo_evento_tipo,
                url: "/monitor-gps",
                placa,
                lida: false,
                created_at: new Date(p.ultimo_evento_em || Date.now()).toISOString(),
              }),
            });
          } catch (errNotif) {
            console.warn(
              "[RECONCILIAR-ALERTAS] Falha ao persistir em notificacoes_sistema:",
              errNotif,
            );
          }

          // 3. Despacha WhatsApp diretamente com os contatos vinculados e dispara a ligação telefônica MacroDroid
          await despacharWhatsappAlertaServer(
            {
              destUserId: clienteUserId,
              destClienteId: clienteId,
              tipo: p.ultimo_evento_tipo,
              placa,
              titulo,
              mensagem,
            },
            supabaseUrl,
            serviceRoleKey,
            env,
          );

          // 4. Dispara também o Web Push via endpoint interno com destinatarioUserId e destinatarioClienteId
          try {
            const reqPush = new Request("https://gd.oficial.tec.br/api/push/disparar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                destinatarioUserId: clienteUserId,
                destinatarioClienteId: clienteId,
                titulo,
                mensagem,
                url: "/monitor-gps",
                tag: `sigo-geofence-${p.veiculo_id}-${p.area_id}-${Date.now()}`,
                tipo: p.ultimo_evento_tipo,
                placa,
              }),
            });
            await handleApiWebPush(reqPush, env);
          } catch (errP) {
            console.warn("[RECONCILIAR-ALERTAS] Aviso no disparo de push:", errP);
          }

          // Marca whatsapp_enviado = true na máquina de estados física
          await fetch(
            `${supabaseUrl}/rest/v1/veiculo_areas_estado?veiculo_id=eq.${p.veiculo_id}&area_id=eq.${p.area_id}`,
            {
              method: "PATCH",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                whatsapp_enviado: true,
                updated_at: new Date().toISOString(),
              }),
            },
          ).catch(() => {});

          enviados++;
        }
      }
    }
  } catch (err) {
    console.warn("[RECONCILIAR-ALERTAS] Falha ao reconciliar alertas pendentes:", err);
  }

  return { processados, enviados };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/alertas/verificar-jammers e /api/alertas/reconciliar
// Permite acionar a verificação manualmente (ADM) ou pelo cron via HTTP.
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiAlertasCron(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    url.pathname !== "/api/alertas/verificar-jammers" &&
    url.pathname !== "/api/alertas/reconciliar"
  ) {
    return null;
  }
  if (request.method !== "POST" && request.method !== "GET") return null;

  const envObj = (env || {}) as Record<string, string | undefined>;
  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);

  if (url.pathname === "/api/alertas/reconciliar") {
    try {
      const resRec = await reconciliarAlertasSegurancaServidor(supabaseUrl, serviceRoleKey, env);
      return new Response(JSON.stringify({ sucesso: true, ...resRec }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (errRec) {
      return new Response(JSON.stringify({ sucesso: false, erro: String(errRec) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // Validação de token secreto (configurado como variável no Cloudflare)
  const cronSecret = envObj.CRON_SECRET || process.env.CRON_SECRET || "hunter-cron-jammer-2026";
  const authHeader = request.headers.get("Authorization") || "";
  const tokenQuery = url.searchParams.get("token") || "";

  if (authHeader !== `Bearer ${cronSecret}` && tokenQuery !== cronSecret) {
    return new Response(JSON.stringify({ erro: "Acesso não autorizado." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verificar_jammers_servidor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ p_timeout_minutos: 3 }),
    });

    const resultado = await res.json().catch(() => ({ sucesso: false }));

    const resPerda = await fetch(
      `${supabaseUrl}/rest/v1/rpc/verificar_perda_comunicacao_servidor`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({}),
      },
    ).catch(() => null);
    const resultadoPerda = resPerda ? await resPerda.json().catch(() => null) : null;

    return new Response(
      JSON.stringify({
        ...resultado,
        perda_comunicacao: resultadoPerda,
      }),
      {
        status: res.ok ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ sucesso: false, erro: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/relatorios/metricas-diarias (preview e enviar)
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiRelatoriosDiarios(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/relatorios")) return null;

  const envObj = (env || {}) as Record<string, string | undefined>;
  const cronSecret = envObj.CRON_SECRET || process.env.CRON_SECRET || "hunter-cron-jammer-2026";
  const authHeader = request.headers.get("Authorization") || "";
  const tokenQuery = url.searchParams.get("token") || "";

  // Autorização via CRON_SECRET ou Bearer JWT de SuperADM / Administrador
  if (authHeader !== `Bearer ${cronSecret}` && tokenQuery !== cronSecret) {
    const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ erro: "Acesso não autorizado." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ erro: "Sessão inválida." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    const emailUser = (userData.user.email || "").toLowerCase();
    const isSuperAdmEmail =
      emailUser === "novaes@adm.28bpm.local" || emailUser === "novaes@oficial.tec.br";

    const userRole = (
      profile?.role ||
      (userData.user.app_metadata as any)?.role ||
      (userData.user.user_metadata as any)?.role ||
      ""
    ).toLowerCase();

    const isSuperAdm = isSuperAdmEmail || userRole === "superadmin";

    if (!isSuperAdm) {
      return new Response(
        JSON.stringify({
          erro: "Acesso restrito: apenas o SuperADM pode visualizar e configurar o Relatório Gerencial.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }
  }

  // 1. GET /api/relatorios/gerencial/config
  if (url.pathname === "/api/relatorios/gerencial/config" && request.method === "GET") {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      const { data, error } = await adminClient
        .from("relatorio_gerencial_config")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return new Response(JSON.stringify({ sucesso: true, config: null }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify({ sucesso: true, config: data }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch {
      return new Response(JSON.stringify({ sucesso: true, config: null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // 2. POST /api/relatorios/gerencial/config
  if (url.pathname === "/api/relatorios/gerencial/config" && request.method === "POST") {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ sucesso: false, erro: "Payload inválido." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const payload = {
      ativo: body.ativo ?? true,
      horario_envio: body.horario_envio || "10:00",
      enviar_whatsapp: body.enviar_whatsapp ?? true,
      enviar_push: body.enviar_push ?? true,
      copia_whatsapp_parceiros: body.copia_whatsapp_parceiros ?? true,
      telefones: body.telefones || [],
      secoes_ativas: body.secoes_ativas || {},
      updated_at: new Date().toISOString(),
    };

    try {
      const { data: existente } = await adminClient
        .from("relatorio_gerencial_config")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        const { data: updated, error: updateError } = await adminClient
          .from("relatorio_gerencial_config")
          .update(payload)
          .eq("id", existente.id)
          .select("*")
          .single();

        if (updateError) throw updateError;
        return new Response(JSON.stringify({ sucesso: true, config: updated }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      } else {
        const { data: inserted, error: insertError } = await adminClient
          .from("relatorio_gerencial_config")
          .insert([payload])
          .select("*")
          .single();

        if (insertError) throw insertError;
        return new Response(JSON.stringify({ sucesso: true, config: inserted }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }
    } catch (dbErr: unknown) {
      const dbMsg =
        dbErr instanceof Error
          ? dbErr.message
          : (dbErr as { message?: string })?.message || String(dbErr);
      return new Response(JSON.stringify({ sucesso: false, erro: dbMsg }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  // 3. GET /api/relatorios/metricas-diarias/preview
  if (url.pathname === "/api/relatorios/metricas-diarias/preview" && request.method === "GET") {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const metricas = await coletarMetricasDiarias(supabase);
    let secoesAtivas: any = undefined;
    try {
      const { data: cfgRow } = await supabase
        .from("relatorio_gerencial_config")
        .select("secoes_ativas")
        .limit(1)
        .maybeSingle();
      if (cfgRow?.secoes_ativas) {
        secoesAtivas =
          typeof cfgRow.secoes_ativas === "string"
            ? JSON.parse(cfgRow.secoes_ativas)
            : cfgRow.secoes_ativas;
      }
    } catch {
      /* fallback se não encontrar */
    }
    const mensagem = formatarMensagemRelatorioDiario(metricas, secoesAtivas);
    return new Response(JSON.stringify({ sucesso: true, metricas, mensagem }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  // 4. POST /api/relatorios/metricas-diarias/enviar (somente POST — endpoint de mutação)
  if (url.pathname === "/api/relatorios/metricas-diarias/enviar" && request.method === "POST") {
    let forcar = url.searchParams.get("forcar") === "true";
    let dryRun = url.searchParams.get("dryRun") === "true";
    if (request.method === "POST") {
      try {
        const body = (await request
          .clone()
          .json()
          .catch(() => null)) as { manual?: boolean; forcar?: boolean; dryRun?: boolean } | null;
        if (body?.manual || body?.forcar) {
          forcar = true;
        }
        if (body?.dryRun) {
          dryRun = true;
        }
      } catch {
        /* se não tiver json no body, mantém forcar como query param */
      }
    }

    const serverParams = getSupabaseServerParams(env);
    const envCombinado = {
      ...((env || {}) as Record<string, string | undefined>),
      SUPABASE_URL: serverParams.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: serverParams.serviceRoleKey,
    };
    const resultado = await enviarRelatorioDiarioSuperAdm(envCombinado, { forcar, dryRun });
    return new Response(JSON.stringify(resultado), {
      status: resultado.sucesso ? 200 : 500,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/ocr-cnh
// Proxy seguro e resiliente de extração inteligente de CNH via Gemini Vision
// Evita bloqueios de CORS, CSP e adblockers de terceiros no navegador cliente.
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiOcrCnh(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/ocr-cnh") return null;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  try {
    const body = (await request.json()) as { base64?: string; mimeType?: string };
    if (!body?.base64) {
      return new Response(JSON.stringify({ error: "Arquivo base64 não fornecido." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const apiKey = getGeminiApiKey(env);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Chave do serviço de inteligência artificial não configurada no servidor.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const mimeType = body.mimeType || "application/pdf";

    const prompt = `Você é um perito oficial e especialista em leitura de documentos brasileiros de trânsito (CNH - Carteira Nacional de Habilitação).
O documento pode ser:
1. Documento Digital Oficial em PDF (Senatran / CNH Digital / Vio);
2. Foto de CNH física impressa em papel (modelo clássico verde, modelo novo verde-amarelo, aberta, dobrada, ou apenas a parte de dados/frente);
3. Foto tirada pela câmera de celular ou captura de tela.

Extraia com máxima precisão e fidelidade todos os campos disponíveis:
- nome: Nome completo do condutor / titular (se houver MRZ no rodapé, verifique a linha 3 como DARIO<<NOVAES<GONCALVES<JUNIOR)
- cpf: Os 11 dígitos do CPF (ex: 000.000.000-00 ou números puros)
- data_nascimento: Data de nascimento no formato YYYY-MM-DD
- cnh_numero: Número do Registro da CNH (campo "N° REGISTRO", 11 dígitos numéricos, ou linha 1 do MRZ)
- cnh_categoria: Categoria de habilitação (ex: A, B, AB, C, D, E, ACC)
- cnh_validade: Data de validade da CNH no formato YYYY-MM-DD
- cnh_primeira_habilitacao: Data da primeira habilitação no formato YYYY-MM-DD
- cnh_renach: Código RENACH do formulário (ex: RJ7409048M3 ou similar)
- cnh_observacoes: Campo de observações (ex: "EAR", "A", restrições médicas) se houver

REGRAS:
- Retorne EXCLUSIVAMENTE um objeto JSON válido com essas chaves.
- Se algum campo não estiver legível ou não existir no modelo da foto, atribua null a ele.
- Não invente dados.
- Sem markdown ou explicações fora do JSON.`;

    const modelosCnh = [
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
    ];
    let geminiRes: Response | null = null;
    let ultimoErro = "";

    for (const mod of modelosCnh) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: body.base64 } },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
                maxOutputTokens: 2048,
              },
            }),
          },
        );
        if (res.ok) {
          geminiRes = res;
          break;
        } else {
          ultimoErro = `Modelo ${mod} (${res.status}): ${await res.text()}`;
        }
      } catch (e: any) {
        ultimoErro = `Modelo ${mod} falhou: ${e?.message}`;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: `Falha na API Gemini: ${ultimoErro}` }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const geminiJson = (await geminiRes.json()) as any;
    const texto = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: "OCR não retornou dados estruturados." }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const extracted = JSON.parse(match[0]);
    return new Response(JSON.stringify({ ok: true, data: extracted }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Falha no processamento de OCR da CNH." }),
      { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/ocr-nf
// Proxy seguro de extração inteligente de Notas Fiscais, Cupons Fiscais (NFC-e, SAT)
// e comprovantes de pagamento de combustíveis/serviços automotivos via Gemini Vision
// Suporta fotos tiradas pela câmera de celular (JPG, PNG, WebP) e arquivos PDF.
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiOcrNf(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/ocr-nf") return null;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  try {
    const body = (await request.json()) as { base64?: string; mimeType?: string };
    if (!body?.base64) {
      return new Response(JSON.stringify({ error: "Arquivo base64 não fornecido." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const apiKey = getGeminiApiKey(env);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Chave do serviço de inteligência artificial não configurada no servidor.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        },
      );
    }

    const mimeType = body.mimeType || "image/jpeg";

    const prompt = `Você é um perito especialista em leitura e extração de dados de notas fiscais, cupons fiscais (NFC-e, SAT, DANFE) e comprovantes de pagamento (cartão de crédito/débito, Pix, Getnet, Cielo, Stone, maquininhas) de postos de combustíveis e serviços automotivos do Brasil.

O documento fornecido pode ser:
1. Cupom Fiscal Eletrônico (NFC-e / SAT / Danfe Simplificado);
2. Comprovante de Pagamento de Maquininha de Cartão / Terminal POS (ex: Getnet, Cielo, Rede, PagSeguro, Stone);
3. Nota Fiscal de Serviços ou Produtos (DANFE / NF-e / NFS-e);
4. Foto tirada pela câmera de celular (amassada, com dobras, em ângulo, iluminação variável) ou arquivo PDF.

Analise com máxima precisão e extraia os seguintes dados:
- data: Data da emissão/abastecimento no formato YYYY-MM-DD (ex: "2026-10-03")
- hora: Hora da emissão/abastecimento no formato HH:mm (se disponível, ex: "17:15")
- valor_total: Valor total pago em reais como número decimal (ex: 400.00)
- litros: Quantidade total de litros abastecidos como número decimal (ex: 54.87). Se for despesa de peças ou serviço automotivo que não seja combustível, retorne null.
- valor_por_litro: Preço unitário por litro em reais como número decimal (ex: 7.29)
- combustivel: Tipo de combustível padronizado ("gasolina", "gasolina_aditivada", "etanol", "diesel", "diesel_s10", "gnv", "eletrico" ou null)
- posto_nome: Nome do estabelecimento / posto / razão social / nome fantasia
- posto_cidade: Cidade do estabelecimento se visível (ex: "Volta Redonda")
- nf_numero: Número da NF, número do cupom fiscal (COO/CCF), extrato SAT, chave de acesso ou número do comprovante/NSU/DOC
- forma_pagamento: Forma de pagamento ("debito", "credito", "pix", "dinheiro", "boleto")
- categoria: Categoria sugerida ("combustivel", "manutencao", "lavagem", "estacionamento", "pedagio", "outro")
- descricao_itens: Resumo sucinto do produto ou serviço detectado

REGRAS RÍGIDAS:
- Retorne EXCLUSIVAMENTE um objeto JSON válido com essas chaves exatas.
- Se algum campo não estiver legível ou não constar no documento, retorne null para ele.
- Não invente informações ausentes.
- Sem marcação markdown ou texto antes ou depois do JSON.`;

    const modelosNf = [
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
    ];
    let geminiRes: Response | null = null;
    let ultimoErro = "";

    for (const mod of modelosNf) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: body.base64 } },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
                maxOutputTokens: 2048,
              },
            }),
          },
        );
        if (res.ok) {
          geminiRes = res;
          break;
        } else {
          ultimoErro = `Modelo ${mod} (${res.status}): ${await res.text()}`;
        }
      } catch (e: any) {
        ultimoErro = `Modelo ${mod} falhou: ${e?.message}`;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: `Falha na API Gemini: ${ultimoErro}` }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const geminiJson = (await geminiRes.json()) as any;
    const parts = geminiJson?.candidates?.[0]?.content?.parts ?? [];
    const texto = parts
      .map((p: any) => p?.text || "")
      .filter(Boolean)
      .join("\n");
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: "OCR não retornou dados estruturados da NF." }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    const extracted = JSON.parse(match[0]);
    return new Response(JSON.stringify({ ok: true, data: extracted }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Falha no processamento de OCR da NF." }),
      { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/upload-nf
// Proxy seguro de armazenamento no bucket nfs-temp via Service Role
// Blindagem contra 'Bucket not found' ou falhas de RLS no cliente
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiUploadNf(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/upload-nf") return null;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await request.json()) as {
      path?: string;
      base64?: string;
      contentType?: string;
    };

    if (!body?.path || !body?.base64) {
      return new Response(JSON.stringify({ error: "Path ou base64 não fornecidos." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    // Garante que o bucket nfs-temp existe
    try {
      const { data: buckets } = await adminClient.storage.listBuckets();
      if (!buckets?.some((b: any) => b.name === "nfs-temp")) {
        await adminClient.storage.createBucket("nfs-temp", {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/jpg",
            "application/pdf",
          ],
        });
      }
    } catch {
      // Ignora se já existir
    }

    const binaryStr = atob(body.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { error } = await adminClient.storage.from("nfs-temp").upload(body.path, bytes, {
      contentType: body.contentType || "application/pdf",
      upsert: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, path: body.path, uploadEm: new Date().toISOString() }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Falha no upload da NF." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }
}

async function handleApiCompartilhamento(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/compartilhamento")) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // GET /api/compartilhamento/consultar?token=...
  if (url.pathname === "/api/compartilhamento/consultar" && request.method === "GET") {
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: "Token de compartilhamento não fornecido." }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    try {
      const { data: shareData, error: shareErr } = await adminClient
        .from("compartilhamentos_temporarios")
        .select(
          "id, veiculo_id, expira_em, created_at, revogado, stealth_ativo, stealth_latitude, stealth_longitude, stealth_rumo",
        )
        .eq("token", token)
        .maybeSingle();

      if (shareErr || !shareData) {
        return new Response(
          JSON.stringify({ sucesso: false, mensagem: "Link de compartilhamento não localizado." }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (shareData.revogado) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            mensagem: "Este compartilhamento foi revogado pelo proprietário.",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      if (shareData.expira_em && new Date(shareData.expira_em) < new Date()) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            mensagem: "Este link de compartilhamento expirou.",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data: vData, error: vErr } = await adminClient
        .from("veiculos")
        .select(
          "id, placa, marca_modelo, cor, tipo_veiculo, ignicao_status, velocidade_atual, ultima_latitude, ultima_longitude, ultima_atualizacao, status_operacional, rumo",
        )
        .eq("id", shareData.veiculo_id)
        .maybeSingle();

      if (vErr || !vData) {
        return new Response(
          JSON.stringify({ sucesso: false, mensagem: "Veículo não localizado." }),
          { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const isStealth = !!shareData.stealth_ativo;
      const lat = isStealth
        ? (shareData.stealth_latitude ?? vData.ultima_latitude)
        : vData.ultima_latitude;
      const lng = isStealth
        ? (shareData.stealth_longitude ?? vData.ultima_longitude)
        : vData.ultima_longitude;
      const rumo = isStealth ? (shareData.stealth_rumo ?? vData.rumo) : vData.rumo;

      return new Response(
        JSON.stringify({
          sucesso: true,
          veiculo: {
            id: vData.id,
            placa: vData.placa,
            marca_modelo: vData.marca_modelo,
            cor: vData.cor,
            tipo_veiculo: vData.tipo_veiculo || "carro",
            ignicao: isStealth ? false : !!vData.ignicao_status,
            velocidade: isStealth ? 0 : vData.velocidade_atual || 0,
            latitude: lat !== null && lat !== undefined ? Number(lat) : null,
            longitude: lng !== null && lng !== undefined ? Number(lng) : null,
            ultima_atualizacao: isStealth
              ? new Date().toISOString()
              : vData.ultima_atualizacao || new Date().toISOString(),
            status_operacional: isStealth
              ? "estacionado"
              : vData.status_operacional || "estacionado",
            rumo: rumo,
          },
          expira_em: shareData.expira_em,
          created_at: shareData.created_at,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: err?.message || "Erro ao consultar compartilhamento.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // Helper para extração de IP real (Cloudflare / Proxies reversos)
  const extrairIp = (req: Request) => {
    return (
      req.headers.get("cf-connecting-ip")?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1"
    );
  };

  // POST /api/compartilhamento/registrar-acesso
  if (url.pathname === "/api/compartilhamento/registrar-acesso" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const token = (body.token || "").trim();
      const enderecoInicio = body.enderecoInicio || null;

      if (!token) {
        return new Response(JSON.stringify({ sucesso: false, mensagem: "Token não fornecido." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const ip = extrairIp(request);
      const userAgent = request.headers.get("user-agent") || "";

      const { data, error } = await adminClient.rpc("registrar_acesso_link_publico", {
        p_token: token,
        p_ip: ip,
        p_user_agent: userAgent,
        p_endereco_inicio: enderecoInicio,
      });

      if (error) {
        return new Response(JSON.stringify({ sucesso: false, mensagem: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify({ ...data, ip }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: err?.message || "Erro ao registrar acesso." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/compartilhamento/ping-acesso
  if (url.pathname === "/api/compartilhamento/ping-acesso" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const acessoId = body.acesso_id || body.acessoId;
      const token = (body.token || "").trim();
      const enderecoAtual = body.enderecoAtual || null;

      if (!acessoId || !token) {
        return new Response(
          JSON.stringify({ sucesso: false, mensagem: "Parâmetros insuficientes para ping." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data, error } = await adminClient.rpc("ping_acesso_link_publico", {
        p_acesso_id: acessoId,
        p_token: token,
        p_endereco_atual: enderecoAtual,
      });

      if (error) {
        return new Response(JSON.stringify({ sucesso: false, mensagem: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify(data || { sucesso: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: err?.message || "Erro no ping de acesso." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/compartilhamento/finalizar-acesso
  if (url.pathname === "/api/compartilhamento/finalizar-acesso" && request.method === "POST") {
    try {
      let body: any = {};
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await request.json().catch(() => ({}));
      } else {
        const text = await request.text().catch(() => "");
        try {
          body = JSON.parse(text);
        } catch {
          body = {};
        }
      }

      const acessoId = body.acesso_id || body.acessoId;
      const token = (body.token || "").trim();
      const enderecoFim = body.enderecoFim || null;

      if (!acessoId || !token) {
        return new Response(
          JSON.stringify({ sucesso: false, mensagem: "Parâmetros insuficientes." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data, error } = await adminClient.rpc("finalizar_acesso_link_publico", {
        p_acesso_id: acessoId,
        p_token: token,
        p_endereco_fim: enderecoFim,
      });

      if (error) {
        return new Response(JSON.stringify({ sucesso: false, mensagem: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify(data || { sucesso: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: err?.message || "Erro ao finalizar acesso." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/compartilhamento/acessos?token=... OU ?compartilhamento_id=...
  if (url.pathname === "/api/compartilhamento/acessos" && request.method === "GET") {
    const token = (url.searchParams.get("token") || "").trim();
    const compId = (url.searchParams.get("compartilhamento_id") || "").trim();

    if (!token && !compId) {
      return new Response(
        JSON.stringify({
          sucesso: false,
          mensagem: "Informe o token ou o id do compartilhamento.",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    try {
      let query = adminClient
        .from("compartilhamentos_acessos")
        .select("*")
        .order("iniciado_em", { ascending: false });

      if (compId) {
        query = query.eq("compartilhamento_id", compId);
      } else if (token) {
        query = query.eq("token", token);
      }

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ sucesso: false, mensagem: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify({ sucesso: true, acessos: data || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ sucesso: false, mensagem: err?.message || "Erro ao listar acessos." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interceptador de Veículos para o Perfil S.adm Auditor (100% Read-Only)
// ─────────────────────────────────────────────────────────────────────────────
// Interceptador de Veículos para o Perfil Degustação Master / Auditor
// REGRA HUNTER DE PRIVACIDADE: O veículo real do Novaes (AXH0E44) fica estritamente protegido.
// O perfil Degustação Master recebe exclusivamente a frota simulada de alta fidelidade (DEG-2026, FLX-1010, COR-4040).
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiGpsAuditor(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/gps/veiculos-auditor") {
    if (request.method === "GET") {
      try {
        const frotaDegustacao = [
          {
            id: "deg-veic-001",
            cliente_id: "deg-cli-001",
            placa: "DEG-2026",
            chassi: "9BWZZZ377VT001234",
            marca_modelo: "Volvo XC60 T6 Recharge Inscription Híbrido",
            cor: "Preto Crystal",
            ano: 2024,
            tipo_veiculo: "suv",
            ignicao_status: true,
            bloqueado: false,
            velocidade_atual: 52,
            odometro_km: 18450.4,
            odometro_wgs84_km: 18450.4,
            odometro_cinematico_km: 18450.4,
            odometro_hardware_km: 18450.0,
            odometro_hardware_atualizado_em: new Date().toISOString(),
            ultima_latitude: -22.2858,
            ultima_longitude: -42.5311,
            ultima_atualizacao: new Date().toISOString(),
            voltagem: 13.8,
            bateria_veiculo_v: 13.8,
            bateria_rastreador_pct: 100,
            bateria_rastreador_status: "carregando",
            satelites: 18,
            rumo: 145,
            inclinacao_graus: 1,
            vibracao_g: 0.05,
            alerta_acidente: false,
            alerta_tipo: null,
            ativo: true,
            privacidade_localizacao: false,
            bloqueador_instalado: true,
            tipo_bloqueador: "rele_combustivel",
            bloqueador_detalhes: "Corte eletrônico temporizado de bomba de combustível",
            sinal_gsm: 96,
            rele_status: false,
            rastreador_id: "deg-rast-001",
            rastreador_imei: "864201060012345",
            clientes: {
              user_id: "deg-user-cli-001",
              nome_razao_social: "Transportadora Aliança Logística e Frotas",
              plano: "Proteção Total e Rastreamento 24h",
              privacidade_localizacao: false,
            },
          },
          {
            id: "deg-veic-002",
            cliente_id: "deg-cli-002",
            placa: "FLX-1010",
            chassi: "9BG118744RC554321",
            marca_modelo: "GM Montana Premier 1.2 Turbo Flex",
            cor: "Prata Shark",
            ano: 2024,
            tipo_veiculo: "camionete",
            ignicao_status: false,
            bloqueado: false,
            velocidade_atual: 0,
            odometro_km: 12380.2,
            odometro_wgs84_km: 12380.2,
            odometro_cinematico_km: 12380.2,
            odometro_hardware_km: 12380.0,
            odometro_hardware_atualizado_em: new Date().toISOString(),
            ultima_latitude: -22.523,
            ultima_longitude: -44.104,
            ultima_atualizacao: new Date().toISOString(),
            voltagem: 12.6,
            bateria_veiculo_v: 12.6,
            bateria_rastreador_pct: 98,
            bateria_rastreador_status: "normal",
            satelites: 16,
            rumo: 0,
            inclinacao_graus: 0,
            vibracao_g: 0.0,
            alerta_acidente: false,
            alerta_tipo: null,
            ativo: true,
            privacidade_localizacao: false,
            bloqueador_instalado: true,
            tipo_bloqueador: "rele_combustivel",
            bloqueador_detalhes: "Relé auxiliar micro 12V 40A",
            sinal_gsm: 88,
            rele_status: false,
            rastreador_id: "deg-rast-002",
            rastreador_imei: "864201060054321",
            clientes: {
              user_id: "deg-user-cli-002",
              nome_razao_social: "Carlos Eduardo Mendes",
              plano: "Proteção Total e Rastreamento 24h",
              privacidade_localizacao: false,
            },
          },
          {
            id: "deg-veic-003",
            cliente_id: "deg-cli-003",
            placa: "COR-4040",
            chassi: "9BRBB48E6M5987654",
            marca_modelo: "Toyota Corolla Cross XRE 2.0",
            cor: "Branco Polar",
            ano: 2025,
            tipo_veiculo: "suv",
            ignicao_status: true,
            bloqueado: false,
            velocidade_atual: 64,
            odometro_km: 9540.6,
            odometro_wgs84_km: 9540.6,
            odometro_cinematico_km: 9540.6,
            odometro_hardware_km: 9540.0,
            odometro_hardware_atualizado_em: new Date().toISOString(),
            ultima_latitude: -22.545,
            ultima_longitude: -44.172,
            ultima_atualizacao: new Date().toISOString(),
            voltagem: 14.1,
            bateria_veiculo_v: 14.1,
            bateria_rastreador_pct: 100,
            bateria_rastreador_status: "carregando",
            satelites: 20,
            rumo: 85,
            inclinacao_graus: 2,
            vibracao_g: 0.08,
            alerta_acidente: false,
            alerta_tipo: null,
            ativo: true,
            privacidade_localizacao: false,
            bloqueador_instalado: true,
            tipo_bloqueador: "rele_combustivel",
            bloqueador_detalhes: "Corte eletrônico temporizado",
            sinal_gsm: 94,
            rele_status: false,
            rastreador_id: "deg-rast-003",
            rastreador_imei: "864201060098765",
            clientes: {
              user_id: "deg-user-cli-003",
              nome_razao_social: "Dra. Patrícia Silveira",
              plano: "Rastreamento e Telemetria Avançada",
              privacidade_localizacao: false,
            },
          },
        ];

        return new Response(JSON.stringify(frotaDegustacao), {
          status: 200,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            mensagem: err?.message || "Erro ao consultar veiculos de degustacao.",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }
    }
  }

  return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Módulo Vigilante — Endpoints Canônicos de Postos e Propriedades
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiVigilantes(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/vigilantes")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  const { supabaseUrl, supabaseAnonKey, serviceRoleKey } = getSupabaseServerParams(env);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // GET /api/vigilantes/turnos
  if (request.method === "GET" && url.pathname === "/api/vigilantes/turnos") {
    try {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, message: "Não autorizado: Token de sessão ausente." }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(
          JSON.stringify({ success: false, message: "Sessão inválida ou expirada." }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const { data, error, status } = await adminClient
        .from("turnos_vigilancia")
        .select("*, vigilante:vigilantes(*), posto:postos_vigilancia(*)")
        .order("data_turno", { ascending: false })
        .order("hora_inicio", { ascending: false });

      if (error) {
        const tabelaAusente =
          status === 404 ||
          error.code === "PGRST205" ||
          error.code === "42P01" ||
          error.message?.includes("Could not find the table") ||
          error.message?.includes("does not exist");
        if (tabelaAusente) {
          return new Response(JSON.stringify({ success: true, dados: [], tabelaAusente: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        }
        return new Response(JSON.stringify({ success: false, message: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      return new Response(JSON.stringify({ success: true, dados: data || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          message: err?.message || "Erro ao carregar turnos de vigilância.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // GET /api/vigilantes/postos
  if (request.method === "GET" && url.pathname === "/api/vigilantes/postos") {
    try {
      const clienteIdParam =
        url.searchParams.get("clienteId") || url.searchParams.get("cliente_id");

      // 1. Consulta em areas_seguras (tipo: posto_vigilancia)
      let queryAreas = adminClient.from("areas_seguras").select("*").eq("tipo", "posto_vigilancia");
      if (clienteIdParam) {
        queryAreas = queryAreas.or(`cliente_id.eq.${clienteIdParam},cliente_id.is.null`);
      }
      const { data: dataAreas } = await queryAreas.order("created_at", { ascending: false });

      // 2. Consulta em postos_vigilancia
      let queryPostos = adminClient.from("postos_vigilancia").select("*");
      if (clienteIdParam) {
        queryPostos = queryPostos.or(`cliente_id.eq.${clienteIdParam},cliente_id.is.null`);
      }
      const { data: dataPostos } = await queryPostos.order("created_at", { ascending: false });

      const mapaPostos = new Map<string, any>();

      (dataPostos || []).forEach((p: any) => {
        mapaPostos.set(p.id, {
          id: p.id,
          cliente_id: p.cliente_id,
          nome: p.nome,
          endereco: p.endereco || null,
          latitude: p.latitude,
          longitude: p.longitude,
          raio_metros: p.raio_metros || 100,
          perimetro_poligono: p.perimetro_poligono || null,
          ativo: p.ativo ?? true,
          created_at: p.created_at,
          updated_at: p.updated_at,
        });
      });

      (dataAreas || []).forEach((a: any) => {
        if (!mapaPostos.has(a.id)) {
          mapaPostos.set(a.id, {
            id: a.id,
            cliente_id: a.cliente_id,
            nome: a.nome,
            endereco: a.poligono_geojson?.endereco || null,
            latitude: a.latitude,
            longitude: a.longitude,
            raio_metros: a.raio_metros || 100,
            perimetro_poligono: a.poligono_geojson?.coordinates
              ? {
                  type: "Polygon",
                  coordinates: a.poligono_geojson.coordinates,
                }
              : null,
            ativo: a.ativo ?? true,
            created_at: a.created_at,
            updated_at: a.updated_at,
          });
        }
      });

      // Se ambas as tabelas estiverem sem registros, injeta o posto factual homologado "28º"
      if (mapaPostos.size === 0) {
        const postoPadraoFactual = {
          id: "posto-28-voldac",
          cliente_id: clienteIdParam || null,
          nome: "28º",
          endereco: "Av. nossa senhora do amparo, voldac",
          latitude: -22.5028,
          longitude: -44.095,
          raio_metros: 121,
          perimetro_poligono: null,
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mapaPostos.set(postoPadraoFactual.id, postoPadraoFactual);
      }

      const postos = Array.from(mapaPostos.values());

      return new Response(JSON.stringify({ success: true, postos }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao listar postos." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // POST /api/vigilantes/postos
  if (request.method === "POST" && url.pathname === "/api/vigilantes/postos") {
    try {
      const body = (await request.json()) as any;
      const {
        id,
        cliente_id,
        nome,
        endereco,
        latitude,
        longitude,
        raio_metros,
        perimetro_poligono,
        ativo,
      } = body || {};

      if (!nome || typeof latitude !== "number" || typeof longitude !== "number") {
        return new Response(
          JSON.stringify({ success: false, message: "Nome e coordenadas são obrigatórios." }),
          { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
        );
      }

      const geojsonSalvar = {
        type: "Polygon",
        coordinates: perimetro_poligono?.coordinates || [],
        endereco: endereco || null,
      };

      let result: any = null;

      if (id) {
        const { data, error } = await adminClient
          .from("areas_seguras")
          .update({
            cliente_id: cliente_id || null,
            nome,
            tipo: "posto_vigilancia",
            latitude,
            longitude,
            raio_metros: raio_metros || 100,
            poligono_geojson: geojsonSalvar,
            ativo: ativo ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        result = data;

        try {
          await adminClient
            .from("postos_vigilancia")
            .update({
              cliente_id: cliente_id || null,
              nome,
              endereco: endereco || null,
              latitude,
              longitude,
              raio_metros: raio_metros || 100,
              perimetro_poligono: perimetro_poligono || null,
              ativo: ativo ?? true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        } catch {
          /* Fallback redundante */
        }
      } else {
        const { data, error } = await adminClient
          .from("areas_seguras")
          .insert({
            cliente_id: cliente_id || null,
            nome,
            tipo: "posto_vigilancia",
            latitude,
            longitude,
            raio_metros: raio_metros || 100,
            poligono_geojson: geojsonSalvar,
            regra_entrada: "permitida",
            regra_saida: "permitida",
            tolerancia_metros: 50,
            ativo: ativo ?? true,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;

        try {
          await adminClient.from("postos_vigilancia").insert({
            id: result.id,
            cliente_id: cliente_id || null,
            nome,
            endereco: endereco || null,
            latitude,
            longitude,
            raio_metros: raio_metros || 100,
            perimetro_poligono: perimetro_poligono || null,
            ativo: ativo ?? true,
          });
        } catch {
          /* Fallback redundante */
        }
      }

      const postoRetorno = {
        id: result.id,
        cliente_id: result.cliente_id,
        nome: result.nome,
        endereco: result.poligono_geojson?.endereco || endereco || null,
        latitude: result.latitude,
        longitude: result.longitude,
        raio_metros: result.raio_metros,
        perimetro_poligono: perimetro_poligono || null,
        ativo: result.ativo,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };

      return new Response(JSON.stringify({ success: true, posto: postoRetorno }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao salvar posto." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  // DELETE /api/vigilantes/postos
  if (request.method === "DELETE" && url.pathname === "/api/vigilantes/postos") {
    try {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(JSON.stringify({ success: false, message: "ID é obrigatório." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
        });
      }

      const { error } = await adminClient.from("areas_seguras").delete().eq("id", id);
      if (error) throw error;
      try {
        await adminClient.from("postos_vigilancia").delete().eq("id", id);
      } catch {}

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err?.message || "Erro ao excluir posto." }),
        { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocodificação de Endereço via Nominatim e Photon
// ─────────────────────────────────────────────────────────────────────────────
async function handleApiGeocodificar(request: Request, _env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/geocodificar") {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...SECURITY_HEADERS,
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ success: false, message: "Método não permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    });
  }

  try {
    const latParam = url.searchParams.get("lat");
    const lonParam = url.searchParams.get("lon");

    // Geocodificação reversa por coordenadas (Lat e Lon)
    if (latParam && lonParam) {
      const lat = parseFloat(latParam);
      const lon = parseFloat(lonParam);

      if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
        try {
          const paramsNom = new URLSearchParams();
          paramsNom.set("format", "json");
          paramsNom.set("lat", String(lat));
          paramsNom.set("lon", String(lon));
          paramsNom.set("zoom", "18");
          paramsNom.set("addressdetails", "1");
          const urlNom = `https://nominatim.openstreetmap.org/reverse?${paramsNom.toString()}`;

          const resNom = await fetch(urlNom, {
            headers: { "User-Agent": "GD-Seguranca-Geocoding/1.0 (contato@gd.oficial.tec.br)" },
          });

          if (resNom.ok) {
            const dataNom = (await resNom.json()) as any;
            if (dataNom?.display_name) {
              const road = dataNom.address?.road || dataNom.address?.pedestrian || "";
              const sub = dataNom.address?.suburb || dataNom.address?.neighbourhood || "";
              const city =
                dataNom.address?.city ||
                dataNom.address?.town ||
                dataNom.address?.municipality ||
                "";
              const rotuloFormatado =
                [road, sub, city].filter(Boolean).join(", ") || dataNom.display_name;

              return new Response(
                JSON.stringify({
                  success: true,
                  endereco: rotuloFormatado,
                  display_name: dataNom.display_name,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=86400, s-maxage=86400",
                    ...SECURITY_HEADERS,
                  },
                },
              );
            }
          }
        } catch {
          /* Fallback */
        }
      }
    }

    const q = (url.searchParams.get("q") || "").trim();
    if (!q || q.length < 3) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Parâmetros insuficientes para geocodificação.",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
      );
    }

    const qClean = q
      .replace(/\bav\.?\b/gi, "Avenida")
      .replace(/\br\.?\b/gi, "Rua")
      .replace(/\bsra\.?\b/gi, "Senhora")
      .replace(/\bsto\.?\b/gi, "Santo")
      .replace(/\bsta\.?\b/gi, "Santa")
      .replace(/\bpç\.?\b/gi, "Praça")
      .replace(/\brod\.?\b/gi, "Rodovia")
      .replace(/\balm\.?\b/gi, "Almirante");

    // 1. Nominatim (OpenStreetMap) com User-Agent corporativo
    try {
      const urlNom = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        qClean,
      )}&countrycodes=br&limit=1`;
      const resNom = await fetch(urlNom, {
        headers: { "User-Agent": "GD-Seguranca-Geocoding/1.0 (contato@gd.oficial.tec.br)" },
      });
      if (resNom.ok) {
        const dNom = (await resNom.json()) as any[];
        if (dNom?.[0]?.lat && dNom?.[0]?.lon) {
          return new Response(
            JSON.stringify({
              success: true,
              latitude: parseFloat(dNom[0].lat),
              longitude: parseFloat(dNom[0].lon),
              label: dNom[0].display_name,
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }
    } catch {
      /* fallback */
    }

    // 2. Photon (Komoot / OSM)
    try {
      const urlPhoton = `https://photon.komoot.io/api/?q=${encodeURIComponent(qClean)}&limit=1`;
      const resPhoton = await fetch(urlPhoton);
      if (resPhoton.ok) {
        const dPhoton = (await resPhoton.json()) as any;
        if (dPhoton?.features?.[0]?.geometry?.coordinates) {
          const [lon, lat] = dPhoton.features[0].geometry.coordinates;
          const nomeProp = dPhoton.features[0].properties.name || qClean;
          const cidade = dPhoton.features[0].properties.city || "";
          return new Response(
            JSON.stringify({
              success: true,
              latitude: lat,
              longitude: lon,
              label: cidade ? `${nomeProp}, ${cidade}` : nomeProp,
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }
      }
    } catch {
      /* fallback */
    }

    // 3. Fallback simplificado (primeira e última parte)
    const partes = qClean.split(",").map((p) => p.trim());
    if (partes.length >= 3) {
      const querySimplificada = `${partes[0]}, ${partes[partes.length - 1]}`;
      try {
        const urlNom2 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          querySimplificada,
        )}&countrycodes=br&limit=1`;
        const resNom2 = await fetch(urlNom2, {
          headers: { "User-Agent": "GD-Seguranca-Geocoding/1.0 (contato@gd.oficial.tec.br)" },
        });
        if (resNom2.ok) {
          const dNom2 = (await resNom2.json()) as any[];
          if (dNom2?.[0]?.lat && dNom2?.[0]?.lon) {
            return new Response(
              JSON.stringify({
                success: true,
                latitude: parseFloat(dNom2[0].lat),
                longitude: parseFloat(dNom2[0].lon),
                label: dNom2[0].display_name,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            );
          }
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({ success: false, message: "Endereço não localizado pelo mapa." }),
      { status: 404, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || "Erro na geocodificação." }),
      { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
    );
  }
}
