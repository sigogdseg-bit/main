import type { jsPDF } from "jspdf";
import { APP_NOME, APP_SLOGAN, APP_VERSION_NUMERO, APP_PUBLIC_URL } from "@/shared/lib/version";
import type { PropostaComercial } from "../types/proposta";
import { calcularHashProposta } from "./propostaService";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { PLANOS_COMERCIAIS_CATALOGO } from "@/shared/lib/planosComerciais";

async function carregarImagemBase64(url: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 1500);
  });
}

/**
 * Emite e faz o download do documento PDF da Proposta Comercial Oficial GD Rastreamento
 * Estrutura:
 * - Página 1: Dados do Cliente, Veículo, Condições Comerciais (com Equipamentos e Rastreamento Tático Inclusos) e Aceite
 * - Página 2: Catálogo de Módulos e Funcionalidades Explicadas em Detalhes com Transparência Jurídica
 */
export async function emitirPropostaComercialPdf(
  proposta: PropostaComercial,
  usuarioEmissor = "Operador Autorizado",
): Promise<jsPDF> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new JsPdfCtor({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const dataHoje = new Date();
  const dataHojeFormatada = dataHoje.toLocaleDateString("pt-BR");
  const horaHojeFormatada = dataHoje.toLocaleTimeString("pt-BR");

  // Data de validade da proposta (15 dias a partir de hoje)
  const dataValidade = new Date();
  dataValidade.setDate(dataValidade.getDate() + 15);
  const dataValidadeFormatada = dataValidade.toLocaleDateString("pt-BR");

  const formatMoeda = (val: number | string | undefined | null) => {
    const num = typeof val === "number" && !isNaN(val) ? val : Number(val) || 0;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s+/g, " ");
  };

  // Tenta carregar o logotipo
  const logoBase64 = await carregarLogoEmblemaBase64();

  // ═════════════════════════════════════════════════════════════════════════
  // PÁGINA 1: PROPOSTA COMERCIAL E CONDIÇÕES DE CONTRATAÇÃO
  // ═════════════════════════════════════════════════════════════════════════

  // 1. Cabeçalho Institucional
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 32, "F");

  // Faixa de destaque verde esmeralda
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 30, 210, 2, "F");

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 10, 2, 28, 28);
    } catch {
      // Fallback
    }
  }

  const offsetTextoX = logoBase64 ? 42 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(APP_NOME.toUpperCase(), offsetTextoX, 10);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(APP_SLOGAN.toUpperCase(), offsetTextoX, 15, { maxWidth: 160 });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `PROPOSTA COMERCIAL DE PRESTAÇÃO DE SERVIÇOS E SEGURANÇA TÁTICA • v${APP_VERSION_NUMERO}`,
    offsetTextoX,
    20,
    { maxWidth: 160 },
  );
  doc.text(
    `Documento: ${proposta.numero_proposta} • Emissão Oficial: ${dataHojeFormatada} às ${horaHojeFormatada} • Validade: ${dataValidadeFormatada}`,
    offsetTextoX,
    25.5,
    { maxWidth: 160 },
  );

  let posY = 42;

  // 2. Dados do Cliente e do Veículo / Frota
  const isFrota = proposta.tipo_proposta === "frota";

  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(14, posY, 182, 28, 2, 2, "FD");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    isFrota ? "DADOS DO CLIENTE E GESTAO DE FROTA" : "DADOS DO CLIENTE E DO VEICULO",
    18,
    posY + 7,
  );

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);

  // Coluna 1: Cliente
  doc.text(`Cliente / Empresa:`, 18, posY + 14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(proposta.cliente_nome.toUpperCase(), 56, posY + 14);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Telefone de Contato:`, 18, posY + 20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(proposta.cliente_telefone, 56, posY + 20);

  // Coluna 2: Veículo ou Frota
  if (!isFrota) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Marca e Modelo:`, 115, posY + 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const marcaStr = (proposta.veiculo_marca || "")
      .toUpperCase()
      .replace("VEÍCULO", "")
      .replace("VEICULO", "")
      .trim();
    const modeloStr = (proposta.veiculo_modelo || "Veículo").toUpperCase();
    const descVeiculo = marcaStr ? `${marcaStr} ${modeloStr}` : modeloStr;
    doc.text(descVeiculo || "VEÍCULO DE PASSEIO", 148, posY + 14);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Ano de Fabricacao:`, 115, posY + 20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(proposta.veiculo_ano || "Não Informado", 148, posY + 20);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Modalidade:`, 115, posY + 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("FROTA CORPORATIVA", 148, posY + 14);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Hardware:`, 115, posY + 20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text("RASTREADOR E CHIP INCLUSOS", 148, posY + 20);
  }

  posY += 34;

  // 3. Funcionalidades em Destaque
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, posY, 182, 38, 2, 2, "FD");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("FUNCIONALIDADES E BENEFICIOS INCLUSOS", 18, posY + 7);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  const beneficios = [
    [
      "• Automonitoramento continuo 24 horas por satelite GPS",
      "• Historico completo de rotas, trajetos e paradas",
    ],
    [
      "• Aplicativo moderno para celular Android e iOS",
      "• Cercas virtuais com aviso de entrada e saida",
    ],
    [
      "• Notificacao instantanea de ignicao ligada/desligada",
      "• Alertas de velocidade maxima configuravel",
    ],
    [
      "• Fornecimento de rastreador homologado ANATEL e chip M2M inclusos",
      "• Chip M2M multi-operadora dedicado com conexao estavel",
    ],
  ];

  let bY = posY + 13;
  beneficios.forEach((par) => {
    doc.text(par[0], 18, bY);
    doc.text(par[1], 108, bY);
    bY += 5.5;
  });

  posY += 44;

  // 4. Alerta Técnico sobre Bloqueio Veicular (LIN / CAN)
  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(0.5);
  doc.roundedRect(14, posY, 182, 24, 2, 2, "FD");
  doc.setLineWidth(0.1);

  doc.setTextColor(146, 64, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("AVISO TECNICO OBRIGATORIO — ARQUITETURA ELETRONICA E BLOQUEIO REMOTO", 18, posY + 5.5);

  doc.setFontSize(7.8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 53, 15);
  const textoAviso =
    "Para a seguranca do condutor e preservacao da integridade dos modulos originais de fabrica, informamos com total transparencia que a viabilidade de bloqueio remoto de combustivel ou ignicao depende estritamente do modelo, ano e arquitetura eletronica multiplexada do veiculo (redes CAN e LIN). Em determinados veiculos modernos e de alta tecnologia, o bloqueio nao e realizado ou e desaconselhado pelas normas tecnicas das montadoras.";

  const linhasAviso = doc.splitTextToSize(textoAviso, 174);
  doc.text(linhasAviso, 18, posY + 10.5);

  posY += 29;

  // 5. Tabela Comparativa de Planos (Comodato incluso explicitamente)
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    isFrota
      ? "PLANOS DE CONTRATACAO PARA FROTAS (ESCALA POR QUANTIDADE)"
      : "PLANOS DE CONTRATACAO DISPONIVEIS",
    14,
    posY,
  );

  posY += 3;

  if (isFrota && proposta.faixas_frota && proposta.faixas_frota.length > 0) {
    const corpoTabelaFrota = proposta.faixas_frota.map((f) => [
      f.rotulo,
      `Instalacao: ${formatMoeda(f.instalacao_com_fidelidade)}\nMensalidade: ${formatMoeda(f.mensalidade_com_fidelidade)} / veic.`,
      `Instalacao: ${formatMoeda(f.instalacao_sem_fidelidade)}\nMensalidade: ${formatMoeda(f.mensalidade_sem_fidelidade)} / veic.`,
    ]);

    corpoTabelaFrota.push([
      "Fornecimento do Hardware",
      "Equipamento Homologado ANATEL Incluso no Plano",
      "Equipamento Homologado ANATEL Incluso no Plano",
    ]);

    corpoTabelaFrota.push([
      "Permanencia Minima",
      `${proposta.com_fidelidade_meses || 12} meses`,
      "Cancelamento livre sem fidelidade",
    ]);

    corpoTabelaFrota.push([
      "Chips e Conectividade M2M",
      "Inclusos ate 20mb de trafego. Mais capacidade de trafego sob consulta.",
      "Inclusos ate 20mb de trafego. Mais capacidade de trafego sob consulta.",
    ]);

    autoTable(doc, {
      startY: posY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 7.8,
        textColor: [30, 41, 59],
        cellPadding: 2.8,
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: "bold" },
        1: { cellWidth: 66, halign: "center" },
        2: { cellWidth: 66, halign: "center" },
      },
      head: [
        [
          "FAIXA DE VEICULOS",
          `PLANO COM FIDELIDADE (${proposta.com_fidelidade_meses || 12} MESES)`,
          "PLANO SEM FIDELIDADE (LIVRE)",
        ],
      ],
      body: corpoTabelaFrota,
    });
  } else {
    autoTable(doc, {
      startY: posY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 54, fontStyle: "bold" },
        1: { cellWidth: 64, halign: "center" },
        2: { cellWidth: 64, halign: "center" },
      },
      head: [
        [
          "CONDICAO COMERCIAL",
          `PLANO COM FIDELIDADE (${proposta.com_fidelidade_meses} MESES)`,
          "PLANO SEM FIDELIDADE (LIVRE)",
        ],
      ],
      body: [
        [
          "Taxa de Instalacao e Ativacao",
          proposta.aplicar_promocao !== false
            ? `De: ${formatMoeda(proposta.com_fidelidade_instalacao_cheia || 380)}\nPor: ${formatMoeda(proposta.com_fidelidade_instalacao)} (Promocional)`
            : formatMoeda(proposta.com_fidelidade_instalacao),
          proposta.aplicar_promocao !== false
            ? `De: ${formatMoeda(proposta.sem_fidelidade_instalacao_cheia || 420)}\nPor: ${formatMoeda(proposta.sem_fidelidade_instalacao)} (Promocional)`
            : formatMoeda(proposta.sem_fidelidade_instalacao),
        ],
        [
          "Mensalidade Recorrente",
          proposta.aplicar_promocao !== false
            ? `De: ${formatMoeda(proposta.com_fidelidade_mensalidade_cheia || 120)} / mes\nPor: ${formatMoeda(proposta.com_fidelidade_mensalidade)} / mes`
            : `${formatMoeda(proposta.com_fidelidade_mensalidade)} / mes`,
          proposta.aplicar_promocao !== false
            ? `De: ${formatMoeda(proposta.sem_fidelidade_mensalidade_cheia || 160)} / mes\nPor: ${formatMoeda(proposta.sem_fidelidade_mensalidade)} / mes`
            : `${formatMoeda(proposta.sem_fidelidade_mensalidade)} / mes`,
        ],
        [
          "Fornecimento do Equipamento",
          "Equipamento Homologado ANATEL Incluso no Plano",
          "Equipamento Homologado ANATEL Incluso no Plano",
        ],
        [
          "Prazo Contratual Minimo",
          `${proposta.com_fidelidade_meses} meses de permanencia`,
          "Sem fidelidade (cancelamento livre)",
        ],
        [
          "Garantia e Assistencia Tecnica",
          "Permanente durante vigencia do contrato",
          "Permanente durante vigencia do contrato",
        ],
        [
          "Chips e Conectividade M2M",
          "Inclusos ate 20mb de trafego. Mais capacidade de trafego sob consulta.",
          "Inclusos ate 20mb de trafego. Mais capacidade de trafego sob consulta.",
        ],
      ],
    });
  }

  const finalTable = (doc as any).lastAutoTable;
  posY = finalTable ? finalTable.finalY + 5 : posY + 48;

  // 6. Observações
  if (proposta.observacoes) {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, posY, 182, 12, 2, 2, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Observacoes Comerciais:", 18, posY + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(proposta.observacoes, 18, posY + 9);

    posY += 15;
  }

  // 7. Espaço de Aceite
  doc.setDrawColor(203, 213, 225);
  doc.line(18, posY + 12, 95, posY + 12);
  doc.line(115, posY + 12, 192, posY + 12);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Assinatura do Cliente / Aceite Comercial", 28, posY + 16);
  doc.text(`${APP_NOME} — Operador: ${usuarioEmissor}`, 124, posY + 16);

  // Rodapé da Página 1
  const hashFinal =
    proposta.hash_sha256 ||
    (await calcularHashProposta(
      `${proposta.numero_proposta}|${proposta.cliente_nome}|${dataHojeFormatada}`,
    ));

  const desenharRodape = (paginaAtual: number, totalPaginas: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 282, 210, 15, "F");

    doc.setFillColor(16, 185, 129);
    doc.rect(0, 282, 210, 0.5, "F");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${APP_NOME.toUpperCase()} · Seguranca Privada e Rastreamento Tatico Veicular e Patrimonial · Portal: ${APP_PUBLIC_URL}`,
      14,
      286.5,
    );
    doc.text(`Hash Forense de Autenticidade (SHA-256): ${hashFinal}`, 14, 290.5);
    doc.text(
      `Pagina ${paginaAtual} de ${totalPaginas} · Validade legal condicionada a confirmacao de aceite`,
      14,
      294.5,
    );
    const emissorExibicao = (usuarioEmissor || "Operador Autorizado").trim();
    doc.text(`Emitido por: ${emissorExibicao}`, 196, 294.5, { align: "right" });
  };

  desenharRodape(1, 2);

  // ═════════════════════════════════════════════════════════════════════════
  // PÁGINA 2: GUIA COMPLETO DE FUNCIONALIDADES E MÓDULOS EXISTENTES
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage();

  // Cabeçalho Página 2
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 32, "F");

  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 30, 210, 2, "F");

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 10, 2, 28, 28);
    } catch {
      // Fallback
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(APP_NOME.toUpperCase(), offsetTextoX, 10);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(APP_SLOGAN.toUpperCase(), offsetTextoX, 15, { maxWidth: 160 });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `GUIA OFICIAL DE PLANOS E FUNCIONALIDADES CONTEMPLADAS • v${APP_VERSION_NUMERO}`,
    offsetTextoX,
    20,
    { maxWidth: 160 },
  );
  doc.text(
    `Anexo integrante da Proposta Comercial Ref.: #${proposta.numero_proposta}`,
    offsetTextoX,
    25.5,
    { maxWidth: 160 },
  );

  let p2Y = 36;

  // Renderiza os 3 Planos Comerciais Oficiais do GD Rastreamento
  PLANOS_COMERCIAIS_CATALOGO.forEach((plano) => {
    const isMaster = plano.id === "master";
    const cardHeight = isMaster ? 58 : 54;
    const corTema: [number, number, number] =
      plano.id === "master"
        ? [168, 85, 247] // purple-500
        : plano.id === "pro"
          ? [59, 130, 246] // blue-500
          : [16, 185, 129]; // emerald-500

    // Fundo do Card
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(14, p2Y, 182, cardHeight, 2, 2, "FD");

    // Barra lateral colorida do plano
    doc.setFillColor(corTema[0], corTema[1], corTema[2]);
    doc.rect(14, p2Y, 2.5, cardHeight, "F");

    // Título do Plano
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(plano.rotulo, 20, p2Y + 5.5);

    // Badge com Histórico de Trajetos visível no app
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(corTema[0], corTema[1], corTema[2]);
    doc.text(
      `Histórico de Trajetos: ${plano.diasHistoricoVisivel} dias visíveis no app`,
      192,
      p2Y + 5.5,
      { align: "right" },
    );

    // Subtítulo se incluir itens anteriores
    let itemStartY = p2Y + 10;
    if (plano.inclusoTexto) {
      doc.setFontSize(6.8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(plano.inclusoTexto, 20, itemStartY);
      itemStartY += 4.5;
    }

    // Funcionalidades em 2 colunas para layout limpo e legível
    const itens = plano.funcionalidades;
    const meio = Math.ceil(itens.length / 2);
    const col1 = itens.slice(0, meio);
    const col2 = itens.slice(meio);

    const renderizarColuna = (listaItens: typeof itens, startX: number, larguraMax: number) => {
      let curY = itemStartY;
      listaItens.forEach((item) => {
        doc.setFontSize(6.8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text(`• ${item.nome}:`, startX, curY);

        doc.setFontSize(6.2);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105); // slate-600
        const linhasDet = doc.splitTextToSize(item.detalhe, larguraMax);
        doc.text(linhasDet, startX + 2, curY + 3.2);

        curY += 3.2 + linhasDet.length * 2.8 + 1.2;
      });
    };

    renderizarColuna(col1, 20, 82);
    renderizarColuna(col2, 106, 86);

    p2Y += cardHeight + 3.5;
  });

  // Card de Transparência Jurídica alinhado ao Contrato Oficial
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(14, p2Y, 182, 25, 2, 2, "FD");

  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(14, p2Y, 2, 25, "F");

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(7.8);
  doc.setFont("helvetica", "bold");
  doc.text("TRANSPARÊNCIA E TERMOS DO SERVIÇO (GD SEGURANÇA PRIVADA)", 20, p2Y + 5.5);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(6.7);
  doc.setFont("helvetica", "normal");
  const textoTransparencia =
    "A presente proposta contempla a prestação de serviços de rastreamento veicular, telemetria e gestão tática patrimonial pela GD Segurança Privada, com disponibilização de equipamentos eletrônicos homologados ANATEL e acesso total à plataforma de monitoramento web e mobile para acompanhamento em tempo real.";
  const linhasTransparencia = doc.splitTextToSize(textoTransparencia, 172);
  doc.text(linhasTransparencia, 20, p2Y + 10);

  // Rodapé da Página 2
  desenharRodape(2, 2);

  // Download do arquivo PDF gerado e Registro Forense
  const nomeArquivo = `Proposta_${proposta.numero_proposta}_${proposta.cliente_nome.replace(/\s+/g, "_")}.pdf`;

  try {
    const arrayBuffer = doc.output("arraybuffer");
    const hashSha256 = await calcularSha256Buffer(arrayBuffer);
    await registrarDocumentoEmitido({
      nome_arquivo: nomeArquivo,
      hash_sha256: hashSha256,
      tipo_documento: "PROPOSTA_COMERCIAL",
      descricao: `Proposta Comercial ${proposta.numero_proposta} - ${proposta.cliente_nome}`,
      emissor_nome: usuarioEmissor || undefined,
      tamanho_bytes: arrayBuffer.byteLength,
      metadata: {
        proposta_id: proposta.id,
        numero_proposta: proposta.numero_proposta,
        hash_conteudo: hashFinal,
        mensalidade: proposta.com_fidelidade_mensalidade,
      },
    });
  } catch (errReg) {
    console.warn("Aviso ao registrar proposta emitida na auditoria forense:", errReg);
  }

  if (typeof window !== "undefined" && typeof (doc as any).save === "function") {
    try {
      doc.save(nomeArquivo);
    } catch {
      // Ignora se estiver fora do contexto DOM
    }
  }

  return doc;
}

/**
 * Gera a Proposta Comercial em formato Base64 para envio via WhatsApp ou API
 */
export async function gerarPropostaComercialPdfBase64(
  proposta: PropostaComercial,
  usuarioEmissor = "Operador Autorizado",
): Promise<{ nomeArquivo: string; base64: string; arrayBuffer: ArrayBuffer }> {
  const doc = await emitirPropostaComercialPdf(proposta, usuarioEmissor);
  const arrayBuffer = doc.output("arraybuffer");
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(arrayBuffer).toString("base64")
      : btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const nomeArquivo = `Proposta_${proposta.numero_proposta}_${(proposta.cliente_nome || "Cliente").replace(/\s+/g, "_")}.pdf`;
  return { nomeArquivo, base64, arrayBuffer };
}
