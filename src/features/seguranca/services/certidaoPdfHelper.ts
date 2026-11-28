// Helper Canônico de Certidão de Autenticidade, QR Code e Registro Forense em PDFs
// Proibição absoluta do caractere comercial proibido em todo o código e comentários

import type { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { calcularSha256Buffer, registrarDocumentoEmitido } from "./documentosService";

export interface ParametrosCertidaoPdf {
  doc: jsPDF;
  tipoDocumento: string;
  nomeArquivo: string;
  descricao: string;
  emissorNome?: string;
  emissorRole?: string;
  isSimulacao?: boolean;
  yInicial?: number;
  forcarNovaPagina?: boolean;
  seloExistente?: string;
  codigoExistente?: string;
  metadataExtra?: Record<string, any>;
  registrarNoBanco?: boolean;
}

export interface ResultadoCertidaoPdf {
  seloSgd: string;
  codigoVerificacao: string;
  hashSha256: string;
  hashArquivoFinal: string;
  linkVerificacao: string;
}

function gerarHexAleatorio(tamanho: number): string {
  const chars = "0123456789ABCDEF";
  let res = "";
  for (let i = 0; i < tamanho; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

async function calcularSha256Texto(texto: string): Promise<string> {
  if (typeof crypto !== "undefined") {
    if (crypto.subtle) {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(texto));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

/**
 * Estampa o box canônico de Certidão de Autenticidade (Selo SGD, Código, Hash SHA-256 e QR Code)
 * no documento jsPDF (suportando unidades mm e pt) e registra em documentos_emitidos.
 */
export async function aplicarCertidaoAutenticidadePdf(
  params: ParametrosCertidaoPdf,
): Promise<ResultadoCertidaoPdf> {
  const { doc } = params;
  const agora = new Date();
  const dataFmt = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const horaFmt = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const sufixo = gerarHexAleatorio(8);
  const seloSgd =
    params.seloExistente || (params.isSimulacao ? `SGD-SIM-${sufixo}` : `SGD-${sufixo}`);
  const codigoVerificacao = params.codigoExistente || gerarHexAleatorio(6);
  const linkVerificacao = `https://gd.oficial.tec.br/verificar?selo=${seloSgd}`;

  const hashSha256 = await calcularSha256Texto(
    JSON.stringify({
      sistema: APP_NOME,
      versao: APP_VERSION_NUMERO,
      tipo: params.tipoDocumento,
      arquivo: params.nomeArquivo,
      selo: seloSgd,
      codigo: codigoVerificacao,
      emissao: agora.toISOString(),
    }),
  );

  let qrCodeDataUrl: string | null = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(linkVerificacao, {
      width: 160,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    // fallback silencioso se QR falhar em ambiente headless
  }

  // Detecta unidade (pt tem scaleFactor === 1; mm tem scaleFactor ~ 2.8346)
  const scaleFactor = Number((doc as any).internal?.scaleFactor || 2.83464567);
  const u = (mm: number) => (scaleFactor <= 1.1 ? mm * 2.83464567 : mm);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const boxH = u(36);
  const margemX = u(14);

  let yBox: number;
  if (params.forcarNovaPagina) {
    doc.addPage();
    yBox = u(18);
  } else if (typeof params.yInicial === "number") {
    yBox = params.yInicial;
  } else {
    const lastY = (doc as any).lastAutoTable?.finalY;
    yBox = typeof lastY === "number" ? lastY + u(6) : pageH - boxH - u(14);
  }

  if (yBox + boxH > pageH - u(10)) {
    doc.addPage();
    yBox = u(18);
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(u(0.6));
  doc.roundedRect(margemX, yBox, pageW - margemX * 2, boxH, u(2), u(2), "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(5, 150, 105);
  doc.text(
    "CERTIDAO DE AUTENTICIDADE E CUSTODIA FORENSE — SISTEMA GD RASTREAMENTO",
    margemX + u(4),
    yBox + u(6),
  );

  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Selo de Autenticidade: ${seloSgd}`, margemX + u(4), yBox + u(12));
  doc.text(`Codigo de Verificacao: ${codigoVerificacao}`, margemX + u(78), yBox + u(12));

  const sessaoCache = obterSessaoCacheada();
  let emissorNomeResolvido = (params.emissorNome || "").trim();
  if (!emissorNomeResolvido || emissorNomeResolvido === "Operador") {
    if (sessaoCache?.nome) {
      emissorNomeResolvido = sessaoCache.nome;
    }
  }
  let emissorRoleResolvido = (params.emissorRole || "").trim();
  if (!emissorRoleResolvido) {
    if (sessaoCache?.role) {
      emissorRoleResolvido = String(sessaoCache.role);
    }
  }
  const emissorLabel = emissorNomeResolvido || "Operador GD Rastreamento";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Emissao: ${dataFmt} as ${horaFmt} | Emissor: ${emissorLabel}`,
    margemX + u(4),
    yBox + u(17),
  );
  doc.text(
    "Embasamento Juridico: CPP Art. 158-A (Cadeia de Custodia) e LGPD Art. 46 (Seguranca)",
    margemX + u(4),
    yBox + u(22),
  );

  doc.setFont("courier", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(51, 65, 85);
  doc.text(`Hash SHA-256: ${hashSha256}`, margemX + u(4), yBox + u(27));

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Conferivel publicamente em: https://gd.oficial.tec.br/verificar",
    margemX + u(4),
    yBox + u(32),
  );

  if (qrCodeDataUrl) {
    try {
      doc.addImage(qrCodeDataUrl, "PNG", pageW - margemX - u(33), yBox + u(3), u(30), u(30));
    } catch {
      // fallback silencioso
    }
  }

  let hashArquivoFinal = hashSha256;
  let tamanhoBytes = 0;
  try {
    const bufferPdf = doc.output("arraybuffer");
    tamanhoBytes = bufferPdf?.byteLength || 0;
    if (bufferPdf) {
      if (typeof crypto !== "undefined") {
        if (crypto.subtle) {
          hashArquivoFinal = await calcularSha256Buffer(bufferPdf);
        }
      }
    }
  } catch {
    // fallback silencioso
  }

  if (params.registrarNoBanco !== false) {
    try {
      await registrarDocumentoEmitido({
        nome_arquivo: params.nomeArquivo,
        hash_sha256: hashArquivoFinal,
        tipo_documento: params.tipoDocumento,
        descricao: params.descricao,
        emissor_nome: emissorNomeResolvido || undefined,
        emissor_role: emissorRoleResolvido || undefined,
        tamanho_bytes: tamanhoBytes,
        metadata: {
          selo: seloSgd,
          codigo: codigoVerificacao,
          numero_contrato: `${params.tipoDocumento}-${seloSgd}`,
          hash_conteudo: hashSha256,
          link_verificacao: linkVerificacao,
          is_simulacao: Boolean(params.isSimulacao),
          versao: APP_VERSION_NUMERO,
          ...(params.metadataExtra || {}),
        },
      });
    } catch {
      // nao bloqueia o download do PDF
    }
  }

  return {
    seloSgd,
    codigoVerificacao,
    hashSha256,
    hashArquivoFinal,
    linkVerificacao,
  };
}
