// chatbotxBridge.ts — GD Rastreamento
// Bridge de Comunicação com o Microsserviço ChatbotX (Omnichannel & Alertas em Tempo Real)

import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";

export interface PayloadAlertaChatbotX {
  evento: "ALERTA_J16" | "FATURA_VENCIDA" | "COMUNICADO_SUPORTE";
  tipo: "POWERALM" | "BATALM" | "SPEED" | "MOVING" | "SENALM" | "SOS" | "DEFENSE" | string;
  titulo: string;
  placa?: string;
  veiculo?: string;
  imei?: string;
  telefone_destinatario: string;
  data_hora: string;
  endereco?: string;
  link_rastreamento?: string;
  metadados?: Record<string, unknown>;
}

export interface RespostaChatbotX {
  sucesso: boolean;
  mensagemId?: string;
  erro?: string;
}

/**
 * Obtém a URL base configurada para o microsserviço ChatbotX.
 * Permite configuração via variável de ambiente ou fallback.
 */
export function obterUrlChatbotX(): string {
  if (typeof import.meta !== "undefined") {
    if (import.meta.env?.VITE_WHATSAPP_GATEWAY_URL) {
      return (import.meta.env.VITE_WHATSAPP_GATEWAY_URL as string).replace(/\/$/, "");
    }
    if (import.meta.env?.VITE_CHATBOTX_API_URL) {
      return (import.meta.env.VITE_CHATBOTX_API_URL as string).replace(/\/$/, "");
    }
  }
  // Em ambiente de navegador, prioriza o proxy canônico interno da aplicação (/api/whatsapp)
  // eliminando bloqueio de adblocker, problemas de CORS e latência de rede externa.
  if (typeof window !== "undefined" && window.location?.origin) {
    return "/api/whatsapp";
  }
  return "https://gps.oficial.tec.br:8082";
}

/**
 * Formata um número de telefone para o padrão internacional canônico (E.164)
 * Ex: "(11) 99999-8888" -> "5511999998888"
 */
export function normalizarTelefoneParaWhatsapp(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return "";

  // Se já tiver DDI do Brasil (55)
  if (digitos.startsWith("55") && digitos.length >= 12) {
    return digitos;
  }

  // Se for DDD + Número (10 ou 11 dígitos)
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return digitos;
}

/**
 * Monta o payload canônico para envio de alertas do Hardware J16 para o ChatbotX.
 */
export function montarPayloadAlertaJ16(parametros: {
  tipo: PayloadAlertaChatbotX["tipo"];
  placa: string;
  veiculo?: string;
  imei: string;
  telefone: string;
  endereco?: string;
  linkRastreamento?: string;
  dataHoraIso?: string;
}): PayloadAlertaChatbotX {
  const dataRef = parametros.dataHoraIso ? new Date(parametros.dataHoraIso) : new Date();

  const titulosPorTipo: Record<string, string> = {
    POWERALM: "🚨 ALERTA: Corte de Alimentação Externa (Bateria do Veículo)",
    BATALM: "⚠️ AVISO: Bateria Interna do Rastreador Baixa",
    SPEED: "⚡ ALERTA: Excesso de Velocidade Detectado",
    MOVING: "🚛 ALERTA: Movimentação Indevida / Suspeita de Reboque",
    SENALM: "📳 ALERTA: Vibração / Sensor de Impacto com Ignição Desligada",
    SOS: "🆘 EMERGÊNCIA: Botão de Pânico / Alerta SOS Pressionado",
    DEFENSE: "🛡️ AVISO: Modo Antifurto Armado / Desarmado",
  };

  const titulo = titulosPorTipo[parametros.tipo] ?? `⚠️ Alerta de Hardware J16: ${parametros.tipo}`;

  // Formatação em fuso horário canônico do Brasil
  const dataFormatada =
    dataRef.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) +
    " às " +
    formatarHoraBrasil(dataRef);

  return {
    evento: "ALERTA_J16",
    tipo: parametros.tipo,
    titulo,
    placa: parametros.placa.toUpperCase().trim(),
    veiculo: parametros.veiculo ?? "Veículo Rastreado",
    imei: parametros.imei.trim(),
    telefone_destinatario: normalizarTelefoneParaWhatsapp(parametros.telefone),
    data_hora: dataFormatada,
    endereco: parametros.endereco ?? "Localização em processamento no mapa",
    link_rastreamento: parametros.linkRastreamento,
  };
}

/**
 * Dispara o webhook de alerta do J16 para a API do microsserviço ChatbotX.
 * Executa de forma resiliente: nunca trava o fluxo de telemetria se o ChatbotX estiver fora do ar.
 */
export async function dispararAlertaParaChatbotX(
  payload: PayloadAlertaChatbotX,
  tokenSecreto?: string,
): Promise<RespostaChatbotX> {
  const urlBase = obterUrlChatbotX();
  const endpoint = `${urlBase}/api/v1/webhooks/hunter-alertas`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (tokenSecreto) {
      headers["Authorization"] = `Bearer ${tokenSecreto}`;
    }

    const resposta = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      const textoErro = await resposta.text().catch(() => "Erro desconhecido");
      return {
        sucesso: false,
        erro: `Falha ao acionar ChatbotX (Status HTTP ${resposta.status}): ${textoErro}`,
      };
    }

    const dados = await resposta.json().catch(() => ({}));
    return {
      sucesso: true,
      mensagemId: dados.id ?? dados.messageId,
    };
  } catch (erro: any) {
    return {
      sucesso: false,
      erro: `Erro de rede ao conectar ao ChatbotX: ${erro?.message ?? String(erro)}`,
    };
  }
}

export interface DocumentoWhatsappEnvio {
  nome: string;
  base64: string;
  mimetype: string;
  tamanho?: number;
}

export interface ParametrosEnvioWhatsappOperador {
  clienteNome?: string;
  telefone: string;
  mensagem?: string;
  operadorNome?: string;
  clienteId?: string;
  tokenSecreto?: string;
  tipoContato?: "cliente" | "motorista" | "usuario" | "instalador" | "adicional" | string;
  categoriaMensagem?: "administrativo" | "financeiro" | "operacional" | "alerta";
  documento?: DocumentoWhatsappEnvio | null;
}

/**
 * Regra Pétrea de Blindagem Administrativa:
 * Mensagens administrativas referentes ao plano, faturas e mensalidades
 * são restritas exclusivamente ao cliente titular, sendo inadmissível o envio a motoristas ou outros contatos.
 */
export function validarDestinatarioMensagemAdministrativa(
  tipoContato?: string,
  categoriaMensagem?: "administrativo" | "financeiro" | "operacional" | "alerta",
  textoMensagem?: string,
): { permitido: boolean; motivo?: string } {
  const texto = (textoMensagem || "").toLowerCase();
  const termosPlanoAdministrativo = [
    "mensalidade do seu plano",
    "plano de rastreamento",
    "mensalidade",
    "fatura do plano",
    "cobrança",
    "fatura disponível",
    "2ª via com chave pix",
    "chave pix",
  ];

  const contemTermoPlano = termosPlanoAdministrativo.some((termo) => texto.includes(termo));
  const ehCategoriaAdm =
    categoriaMensagem === "administrativo" || categoriaMensagem === "financeiro";

  if (ehCategoriaAdm || contemTermoPlano) {
    if (tipoContato && tipoContato !== "cliente") {
      return {
        permitido: false,
        motivo:
          "Inadmissível: Mensagens administrativas referentes ao plano são exclusivas para o cliente titular e não podem ser enviadas para motoristas ou outros contatos.",
      };
    }
  }

  return { permitido: true };
}

/**
 * Gera um link oficial wa.me para abertura direta no WhatsApp Web / Desktop / Celular
 */
export function gerarLinkWhatsappWeb(telefone: string, mensagem: string): string {
  const foneLimpo = normalizarTelefoneParaWhatsapp(telefone);
  const textoEncoded = encodeURIComponent(mensagem);
  return `https://wa.me/${foneLimpo}?text=${textoEncoded}`;
}

/**
 * Envia uma mensagem personalizada via API do ChatbotX para o WhatsApp do cliente.
 */
export async function enviarMensagemWhatsappOperador(
  parametros: ParametrosEnvioWhatsappOperador,
): Promise<RespostaChatbotX> {
  // Blindagem Administrativa: mensagens de plano sempre e somente para o cliente titular
  const validacaoAdm = validarDestinatarioMensagemAdministrativa(
    parametros.tipoContato,
    parametros.categoriaMensagem,
    parametros.mensagem,
  );

  if (!validacaoAdm.permitido) {
    return {
      sucesso: false,
      erro: validacaoAdm.motivo || "Envio administrativo bloqueado por política de segurança.",
    };
  }

  const urlBase = obterUrlChatbotX();
  const foneNormalizado = normalizarTelefoneParaWhatsapp(parametros.telefone);

  if (!foneNormalizado) {
    return {
      sucesso: false,
      erro: "Telefone do destinatário inválido ou não informado.",
    };
  }

  const textoMensagem = (parametros.mensagem || "").trim();

  if (!textoMensagem && !parametros.documento) {
    return {
      sucesso: false,
      erro: "Mensagem ou documento obrigatório para envio.",
    };
  }

  const payload: Record<string, any> = {
    channel: "whatsapp",
    recipient: foneNormalizado,
    message: textoMensagem,
    metadata: {
      origem: "gd_seguranca_painel_operador",
      operador: parametros.operadorNome ?? "Operador GD Rastreamento",
      cliente_nome: parametros.clienteNome,
      cliente_id: parametros.clienteId,
      timestamp: new Date().toISOString(),
      tem_documento: Boolean(parametros.documento),
    },
  };

  if (parametros.documento) {
    payload.documento = {
      nome: parametros.documento.nome,
      base64: parametros.documento.base64,
      mimetype: parametros.documento.mimetype,
      tamanho: parametros.documento.tamanho,
    };
    payload.document = payload.documento;
  }

  const endpointPrincipal = urlBase.startsWith("/api/whatsapp")
    ? "/api/whatsapp/send"
    : `${urlBase}/api/v1/messages/send`;

  const fallbackEndpoint = "https://gps.oficial.tec.br:8082/api/v1/messages/send";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token =
    parametros.tokenSecreto ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_GATEWAY_TOKEN) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_CHATBOTX_TOKEN) ||
    "hunter-guardiao-whatsapp-secret-key-2026";

  headers["Authorization"] = `Bearer ${token}`;
  headers["x-hunter-token"] = token;

  try {
    const resposta = await fetch(endpointPrincipal, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      return {
        sucesso: true,
        mensagemId: dados.id ?? dados.messageId,
      };
    }

    const textoBruto = await resposta.text().catch(() => "Erro desconhecido");
    const textoErro =
      textoBruto
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || textoBruto;
    if (endpointPrincipal === fallbackEndpoint || endpointPrincipal.startsWith("/api/whatsapp")) {
      return {
        sucesso: false,
        erro: `Falha no envio via Gateway WhatsApp (Status HTTP ${resposta.status}): ${textoErro}`,
      };
    }
    console.warn("Aviso ao enviar via proxy primário, tentando contingência direta:", textoErro);
  } catch (erroPrimario: any) {
    if (endpointPrincipal === fallbackEndpoint) {
      return {
        sucesso: false,
        erro: `Erro de rede ao conectar ao Gateway WhatsApp: ${erroPrimario?.message ?? String(erroPrimario)}`,
      };
    }
  }

  // Contingência direta ao gateway Fly.io caso o proxy local falhe
  try {
    const respostaFallback = await fetch(fallbackEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (respostaFallback.ok) {
      const dados = await respostaFallback.json().catch(() => ({}));
      return {
        sucesso: true,
        mensagemId: dados.id ?? dados.messageId,
      };
    }

    const textoBrutoFallback = await respostaFallback.text().catch(() => "Erro desconhecido");
    const textoErroFallback =
      textoBrutoFallback
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || textoBrutoFallback;
    return {
      sucesso: false,
      erro: `Falha no envio via Gateway WhatsApp (Status HTTP ${respostaFallback.status}): ${textoErroFallback}`,
    };
  } catch (erroFallback: any) {
    return {
      sucesso: false,
      erro: `Erro de rede ao conectar ao Gateway WhatsApp: ${erroFallback?.message ?? String(erroFallback)}`,
    };
  }
}
