import type { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Cliente } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { carregarVeiculosDoCliente } from "../services/clienteService";
import {
  APP_NOME,
  APP_SLOGAN,
  APP_VERSION_NUMERO,
  APP_EMPRESA,
  APP_CNPJ,
  APP_ENDERECO,
  APP_CIDADE_FORO,
  APP_PUBLIC_URL,
} from "@/shared/lib/version";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { registrarContratoEmitido } from "./contratosAssinadosService";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import {
  obterDefinicaoPlano,
  obterDescritivoFuncionalidadesContrato,
} from "@/shared/lib/planosComerciais";

export interface VeiculoContratoItem {
  placa: string;
  marca_modelo: string;
  ano?: number | null;
  cor?: string | null;
  rastreador_modelo?: string | null;
  rastreador_imei?: string | null;
  rastreador_especificacoes?: string | null;
  homologado_anatel?: boolean | string;
  chip_operadora?: string | null;
  chip_iccid?: string | null;
  chip_linha?: string | null;
  bloqueador_instalado?: boolean;
}

export interface EmitirContratoPdfParams {
  cliente: Cliente;
  veiculos?: VeiculoContratoItem[];
  numeroContrato?: string;
  usuarioEmissor?: string;
  copiaAutenticada?: boolean;
  seloAutenticidade?: string;
  codigoVerificacao?: string;
  hashAssinado?: string;
  dataAssinatura?: string;
  assinadoPorNome?: string;
  statusContrato?: string;
  isAtualizacao?: boolean;
  contratoAnteriorId?: string;
  numeroContratoAnterior?: string;
  baixarPdf?: boolean;
}

/**
 * Formata CPF ou CNPJ brasileiro com pontuação correta.
 */
function formatarDocumento(doc?: string | null): string {
  if (!doc) return "Não informado";
  const limpo = doc.replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (limpo.length === 14) {
    return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

/**
 * Formata telefone brasileiro com DDD e traço.
 */
function formatarTelefone(tel?: string | null): string {
  if (!tel) return "Não informado";
  const limpo = tel.replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (limpo.length === 10) {
    return limpo.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return tel;
}

/**
 * Gera e realiza o download do Contrato Oficial de Prestação de Serviços
 * de Rastreamento Veicular e Telemetria — GD Rastreamento.
 *
 * Cláusulas fundamentadas em:
 *  - Código Civil Brasileiro (Lei n. 10.406/2002)
 *  - Código de Defesa do Consumidor (Lei n. 8.078/1990)
 *  - Lei Geral de Proteção de Dados — LGPD (Lei n. 13.709/2018)
 *  - Regulamento de Serviços M2M — Anatel (Res. 550/2010 e atualizações)
 *  - Código Penal Brasileiro (Decreto-Lei n. 2.848/1940)
 *  - Código de Processo Civil (Lei n. 13.105/2015)
 *  - Lei de Crimes Cibernéticos (Lei n. 12.737/2012)
 *  - Lei de Propriedade Industrial (Lei n. 9.279/1996)
 *  - Lei de Direitos Autorais (Lei n. 9.610/1998)
 */
export async function emitirContratoPrestacaoServicosPdf(
  params: EmitirContratoPdfParams,
): Promise<jsPDF> {
  const {
    cliente,
    veiculos = [],
    numeroContrato: numeroContratoParam,
    usuarioEmissor = "Administrador do Sistema",
    copiaAutenticada = false,
    seloAutenticidade: seloAutenticidadeParam,
    codigoVerificacao: codigoVerificacaoParam,
    hashAssinado = "",
    dataAssinatura,
    assinadoPorNome,
    statusContrato: statusContratoParam,
  } = params;

  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new JsPdfCtor({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const isCopiaAutentica = Boolean(
    copiaAutenticada || statusContratoParam === "assinado" || seloAutenticidadeParam,
  );
  let seloAutenticidade = seloAutenticidadeParam || "";
  let codigoVerificacao = codigoVerificacaoParam || "";
  if (!seloAutenticidade) {
    seloAutenticidade = `SGD-${Date.now().toString(16).toUpperCase().slice(-8)}`;
  }
  if (!codigoVerificacao) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 6; i++) {
      codigoVerificacao += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  const linkAssinatura = `${APP_PUBLIC_URL}/assinar?codigo=${codigoVerificacao}`;
  let qrCodeAssinaturaDataUrl: string | null = null;
  try {
    qrCodeAssinaturaDataUrl = await QRCode.toDataURL(linkAssinatura, { width: 160, margin: 1 });
  } catch {
    // ignora
  }

  const dataHoje = new Date();
  const dataHojeFormatada = dataHoje.toLocaleDateString("pt-BR");
  const horaHojeFormatada = dataHoje.toLocaleTimeString("pt-BR");

  // Carregamento automático dos veículos e equipamentos reais do cliente se não fornecidos.
  let veiculosResolvidos: VeiculoContratoItem[] = [...veiculos];
  if (veiculosResolvidos.length === 0 && cliente.id && cliente.id !== "NOVO-CLIENTE") {
    try {
      const { data: veiculosDb } = await supabase
        .from("veiculos")
        .select(
          `
          id, placa, marca_modelo, ano, cor, rastreador_imei, bloqueador_instalado,
          rastreador:rastreador_id (
            id, imei, modelo,
            chip:chip_id (id, iccid, operadora, linha)
          )
        `,
        )
        .eq("cliente_id", cliente.id)
        .order("created_at", { ascending: true });

      const { data: instsDb } = await supabase
        .from("instalacoes")
        .select(
          "veiculo_id, placa, marca, modelo, rastreador_imei, rastreador_modelo, chip_iccid, chip_operadora, bloqueador_instalado",
        )
        .eq("cliente_id", cliente.id);

      if (veiculosDb && veiculosDb.length > 0) {
        veiculosResolvidos = veiculosDb.map((v: any) => {
          const instMatch = (instsDb || []).find(
            (i: any) => i.veiculo_id === v.id || (i.placa && i.placa === v.placa),
          );
          const imei =
            v.rastreador_imei || v.rastreador?.imei || instMatch?.rastreador_imei || null;
          const modelo = v.rastreador?.modelo || instMatch?.rastreador_modelo || "J16 4G LTE";
          const iccid = v.rastreador?.chip?.iccid || instMatch?.chip_iccid || null;
          const operadora =
            v.rastreador?.chip?.operadora || instMatch?.chip_operadora || "Algar Telecom (M2M)";
          const linha = v.rastreador?.chip?.linha || null;
          const temBloqueio = v.bloqueador_instalado ?? instMatch?.bloqueador_instalado ?? true;

          return {
            placa: v.placa || instMatch?.placa || "SEM PLACA",
            marca_modelo:
              v.marca_modelo ||
              (instMatch
                ? `${instMatch.marca || ""} ${instMatch.modelo || ""}`.trim()
                : "Veículo Cadastrado"),
            ano: v.ano,
            cor: v.cor,
            rastreador_modelo: modelo,
            rastreador_imei: imei,
            rastreador_especificacoes:
              "Módulo GNSS (GPS/BDS/GLONASS) + 4G LTE Cat-1 + Telemetria de Ignição" +
              (temBloqueio ? " + Bloqueio Remoto" : ""),
            homologado_anatel: "Homologado ANATEL",
            chip_operadora: operadora,
            chip_iccid: iccid,
            chip_linha: linha,
            bloqueador_instalado: temBloqueio,
          };
        });
      }
    } catch (err) {
      console.warn(
        "Não foi possível carregar veículos e equipamentos detalhados do cliente para o contrato:",
        err,
      );
    }
  }

  const mesesContrato = cliente.meses_contrato || 12;

  // Resolução dinâmica e real das informações financeiras e de instalação do cliente
  let taxaInstalacao = Number(cliente.taxa_instalacao || 0);
  let taxaPagaDiretoAoInstalador = Boolean(cliente.pago_direto_instalador);
  let statusTaxaInstalacao: "pago" | "pendente" | "parcial" =
    cliente.status_taxa_instalacao || (taxaInstalacao > 0 ? "pago" : "pendente");

  if (cliente.id && cliente.id !== "NOVO-CLIENTE") {
    try {
      const { data: instData } = await supabase
        .from("instalacoes")
        .select("valor_instalacao, status_pagamento, pago_direto_cliente, pago_em, status")
        .eq("cliente_id", cliente.id);

      if (instData && instData.length > 0) {
        const totalInstalacao = instData.reduce(
          (acc, cur) => acc + (Number(cur.valor_instalacao) || 0),
          0,
        );
        taxaInstalacao = totalInstalacao;

        if (instData.some((i) => i.pago_direto_cliente)) {
          taxaPagaDiretoAoInstalador = true;
        }

        const allPagas = instData.every((i) => i.status_pagamento === "pago");
        const somePagas = instData.some((i) => i.status_pagamento === "pago");
        statusTaxaInstalacao = allPagas ? "pago" : somePagas ? "parcial" : "pendente";
      } else {
        const { data: taxaMensalidade } = await supabase
          .from("mensalidades")
          .select("valor, status, data_pagamento")
          .eq("cliente_id", cliente.id)
          .eq("mes_referencia", 0)
          .maybeSingle();

        if (taxaMensalidade) {
          taxaInstalacao = Number(taxaMensalidade.valor || 0);
          statusTaxaInstalacao = taxaMensalidade.status === "pago" ? "pago" : "pendente";
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar dados financeiros reais de instalacao para o contrato:", err);
    }
  }

  const valorMensalidade = Number(cliente.valor_mensalidade || 0);
  const valorTotalContrato = valorMensalidade * mesesContrato;
  const diaVencimento = cliente.dia_vencimento || 10;
  const dataInicioStr = cliente.data_inicio_contrato
    ? new Date(cliente.data_inicio_contrato + "T12:00:00").toLocaleDateString("pt-BR")
    : dataHojeFormatada;

  // Calculo da data final do contrato
  let dataFimStr = "";
  if (cliente.data_fim_contrato) {
    dataFimStr = new Date(cliente.data_fim_contrato + "T12:00:00").toLocaleDateString("pt-BR");
  } else {
    const dInicio = cliente.data_inicio_contrato
      ? new Date(cliente.data_inicio_contrato + "T12:00:00")
      : new Date();
    dInicio.setMonth(dInicio.getMonth() + mesesContrato);
    dataFimStr = dInicio.toLocaleDateString("pt-BR");
  }

  const tipoRenovacaoTexto =
    cliente.tipo_renovacao === "mensal_ate_cancelamento"
      ? "Renovação automática, mês a mês, de forma sucessiva e indefinida, até solicitação formal e escrita de cancelamento com antecedência mínima de 30 (trinta) dias"
      : cliente.tipo_renovacao === "tempo_personalizado"
        ? `Renovação periódica automática por prazo determinado adicional de ${cliente.meses_renovacao || 12} (${cliente.meses_renovacao || 12}) meses`
        : `Renovação automática e sucessiva pelo mesmo período contratado (${mesesContrato} meses), salvo manifestação contrária por escrito`;

  // Determinação canônica e profissional do número de contrato no padrão CTR-XXXX/YYYY
  let seqContrato = "0001";
  if (cliente.id && cliente.id !== "NOVO-CLIENTE") {
    try {
      const { count } = await supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .lte("created_at", cliente.created_at || new Date().toISOString());
      if (count && count > 0) {
        seqContrato = String(count).padStart(4, "0");
      }
    } catch {
      // Fallback silencioso
    }
  }
  const anoContrato = cliente.data_inicio_contrato
    ? new Date(cliente.data_inicio_contrato + "T12:00:00").getFullYear()
    : dataHoje.getFullYear();
  const numeroContrato = numeroContratoParam || `CTR-${seqContrato}/${anoContrato}`;
  const foroComarca = cliente.foro_comarca || "Comarca de Volta Redonda/RJ";

  // Tenta carregar o logotipo oficial
  const logoBase64 = await carregarLogoEmblemaBase64();

  // --- CABEÇALHO INSTITUCIONAL ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 32, "F");

  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 30, 210, 2, "F");

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 10, 2, 28, 28);
    } catch {
      // Fallback silencioso
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
    `CONTRATO DE LOCAÇÃO DE EQUIPAMENTO E AUTOMONITORAMENTO • v${APP_VERSION_NUMERO}`,
    offsetTextoX,
    20,
    { maxWidth: 160 },
  );
  doc.text(
    `Documento: ${numeroContrato} • Emissão Oficial: ${dataHojeFormatada} às ${horaHojeFormatada}`,
    offsetTextoX,
    25.5,
    { maxWidth: 160 },
  );

  let currentY = 40;

  // --- PREÂMBULO ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const preambulo = `Pelo presente instrumento particular, as partes abaixo qualificadas têm entre si justo e acordado o presente CONTRATO DE LOCAÇÃO DE EQUIPAMENTO ELETRÔNICO PARA RASTREAMENTO VEICULAR E AUTOMONITORAMENTO, em conformidade com o Código Civil Brasileiro (Lei nº 10.406/2002 — arts. 565 a 578 pertinentes à Locação de Coisas Móveis), a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), a Lei do Software (Lei nº 9.609/1998) e o Código de Defesa do Consumidor (Lei nº 8.078/1990), regendo-se pelas cláusulas e condições a seguir estipuladas sob os princípios da probidade e da boa-fé objetiva (art. 422 do Código Civil).`;
  const splitPreambulo = doc.splitTextToSize(preambulo, 182);
  doc.text(splitPreambulo, 14, currentY);
  currentY += splitPreambulo.length * 4.2 + 6;

  // --- 1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES", 14, currentY);
  currentY += 4;

  const docFormatado = formatarDocumento(cliente.documento);
  const telFormatado = formatarTelefone(cliente.telefone);
  const enderecoCliente =
    (cliente as any).endereco ||
    (cliente as any).instalador_endereco ||
    "Conforme cadastro na plataforma";

  const partesRows = [
    [
      "CONTRATADA:",
      `DARIO DE NOVAES GONÇALVES JÚNIOR, empresário individual optante pelo Microempreendedor Individual (MEI), inscrito no CNPJ sob o nº 26.581.175/0001-23, com sede na Rua Dom Antônio Cabral, nº 225, Bairro São Luiz, Volta Redonda/RJ, CEP 27286-210, titular dos direitos e da plataforma digital ${APP_NOME.toUpperCase()} (https://gd.oficial.tec.br).`,
    ],
    [
      "CONTRATANTE:",
      `${cliente.nome_razao_social || "Não informado"}\nDocumento (CPF/CNPJ): ${docFormatado}\nEndereço: ${enderecoCliente}\nE-mail: ${cliente.email || "Não informado"}\nTelefone/WhatsApp: ${telFormatado}`,
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Parte", "Qualificação e Dados Cadastrais"]],
    body: partesRows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", fontSize: 8.5 },
      1: { cellWidth: 132, fontSize: 8.5 },
    },
    styles: { cellPadding: 3, overflow: "linebreak" },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- 2. DO OBJETO DO CONTRATO ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("2. DO OBJETO DO CONTRATO E DA MODALIDADE DE SERVIÇO", 14, currentY);
  currentY += 4;

  const objetoTexto = `O presente contrato tem por objeto a prestação de serviços especializados de segurança privada, rastreamento tático veicular e proteção patrimonial, com a cessão em regime de comodato de hardware telemático GPS/GNSS devidamente HOMOLOGADO PELA ANATEL e chip SIM Card M2M dedicado para transmissão de dados. Cada veículo contratado é especificado individualmente na Tabela 3 deste instrumento, discriminando modelo, IMEI, especificações técnicas, homologação ANATEL, operadora e chip M2M em uso. A plataforma digital proprietária ${APP_NOME.toUpperCase()} (acessível via web e aplicativo mobile) é disponibilizada ao CONTRATANTE para acompanhamento tático em tempo real, consultando localização geográfica, histórico de trajetos, registros de paradas e telemetria de ignição.`;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const splitObjeto = doc.splitTextToSize(objetoTexto, 182);
  doc.text(splitObjeto, 14, currentY);
  currentY += splitObjeto.length * 4.5 + 4;

  // Quadro do Plano e Vigência
  const valorTaxaStr = taxaInstalacao.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let textoTaxaInstalacao = "Isenta / Bonificada";
  if (taxaInstalacao > 0) {
    if (taxaPagaDiretoAoInstalador) {
      if (statusTaxaInstalacao === "pago") {
        textoTaxaInstalacao = `R$ ${valorTaxaStr} (paga diretamente ao instalador credenciado no ato da instalação, não reembolsável em qualquer hipótese)`;
      } else {
        textoTaxaInstalacao = `R$ ${valorTaxaStr} (a ser paga diretamente ao instalador credenciado no ato da instalação, não reembolsável em qualquer hipótese)`;
      }
    } else {
      if (statusTaxaInstalacao === "pago") {
        textoTaxaInstalacao = `R$ ${valorTaxaStr} (quitada no ato da contratação, não reembolsável em qualquer hipótese)`;
      } else {
        textoTaxaInstalacao = `R$ ${valorTaxaStr} (devida no ato da contratação, não reembolsável em qualquer hipótese)`;
      }
    }
  }

  const textoMensalidade =
    valorMensalidade > 0
      ? `R$ ${valorMensalidade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por mês (mensalidade do plano)`
      : "Cortesia / Incluso no Plano Master";
  const textoGlobal =
    valorMensalidade > 0
      ? `R$ ${valorTotalContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${mesesContrato} parcelas mensais do plano de serviço)`
      : "Isento / Cortesia Comercial";

  const planoDef = obterDefinicaoPlano(cliente.plano);
  const diasVisiveisFinal = cliente.dias_historico_plano || planoDef.diasHistoricoVisivel;

  const planoRows = [
    ["Plano Contratado", `${planoDef.icone} ${planoDef.rotulo} (${planoDef.nome})`],
    [
      "Funcionalidades Contempladas no Plano",
      obterDescritivoFuncionalidadesContrato(cliente.plano),
    ],
    [
      "Regime Jurídico da Contratação",
      "PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA E RASTREAMENTO TÁTICO COM COMODATO DE EQUIPAMENTOS HOMOLOGADOS PELA ANATEL.",
    ],
    ["Taxa de Instalação e Ativação", textoTaxaInstalacao],
    ["Vigência Inicial Contratada", `${mesesContrato} meses (${dataInicioStr} a ${dataFimStr})`],
    ["Valor Mensal do Plano de Serviço", textoMensalidade],
    ["Valor Global do Período Contratado", textoGlobal],
    ["Data de Vencimento Mensal", `Todo dia ${diaVencimento} de cada mês calendário`],
    ["Regra de Renovação Contratual", tipoRenovacaoTexto],
    [
      "Histórico de Trajetos na Plataforma (Gratuito)",
      `${diasVisiveisFinal} dias visíveis no aplicativo (conforme plano contratado)`,
    ],
    [
      "Encargos Moratórios por Atraso",
      "Multa moratória de 2% + juros de 1% ao mês pro rata die + atualização monetária pelo IPCA/IBGE (art. 52, § 1º, da Lei nº 8.078/1990 c/c art. 406 do Código Civil)",
    ],
    [
      "Indenização por Não Devolução ou Perda do Equipamento",
      "R$ 450,00 por rastreador + R$ 50,00 por chip SIM M2M (cláusula sexta deste contrato)",
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Parâmetro Contratual", "Condição Pactuada entre as Partes"]],
    body: planoRows,
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 74, fontStyle: "bold", fontSize: 8 },
      1: { cellWidth: 108, fontSize: 8 },
    },
    styles: { cellPadding: 2.5, overflow: "linebreak" },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- 3. VEÍCULOS E RASTREADORES ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(
    "3. VEÍCULOS, RASTREADORES E ESPECIFICAÇÕES TÉCNICAS (EQUIPAMENTOS EM COMODATO)",
    14,
    currentY,
  );
  currentY += 4;

  let veiculosRows: string[][] = [];
  if (veiculosResolvidos.length > 0) {
    veiculosRows = veiculosResolvidos.map((v, idx) => {
      const placa = v.placa || "SEM PLACA";
      const modeloVeiculo = v.marca_modelo || "Veículo Cadastrado";
      const anoCor = [v.ano ? `Ano: ${v.ano}` : null, v.cor ? `Cor: ${v.cor}` : null]
        .filter(Boolean)
        .join(" | ");
      const veiculoText = `${placa}\n${modeloVeiculo}${anoCor ? `\n${anoCor}` : ""}`;

      const modeloRastreador = v.rastreador_modelo || "J16 4G LTE";
      const imeiText = v.rastreador_imei
        ? `IMEI: ${v.rastreador_imei}`
        : "IMEI: A vincular na ativação";
      const rastreadorText = `${modeloRastreador}\n${imeiText}\n(Equipamento em Comodato — Propriedade da CONTRATADA)`;

      const homologacaoText = `${v.homologado_anatel || "Homologado ANATEL"}\n${v.rastreador_especificacoes || "GNSS + 4G LTE Cat-1 + Telemetria de Ignição"}`;

      const chipOperadora = v.chip_operadora || "Algar Telecom (M2M)";
      const iccidText = v.chip_iccid ? `ICCID: ${v.chip_iccid}` : "ICCID: A vincular na ativação";
      const linhaText = v.chip_linha ? `Linha: ${v.chip_linha}` : "Tráfego M2M Dedicado";
      const chipText = `${chipOperadora}\n${iccidText}\n${linhaText}`;

      return [`${idx + 1}`, veiculoText, rastreadorText, homologacaoText, chipText];
    });
  } else {
    veiculosRows = [
      [
        "1",
        "A vincular na instalação\nAguardando cadastro de placa",
        "J16 4G LTE\nIMEI: Pendente de ativação\n(Equipamento em Comodato — Propriedade da CONTRATADA)",
        "Homologado ANATEL\nGNSS + 4G LTE Cat-1 + Telemetria de Ignição",
        "Algar Telecom (M2M)\nICCID: Pendente de ativação\nTráfego M2M Dedicado",
      ],
    ];
  }

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        "#",
        "Veículo Cadastrado",
        "Rastreador em Comodato (Hardware)",
        "Homologação ANATEL e Especificações",
        "Chip SIM Card M2M",
      ],
    ],
    body: veiculosRows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 42, fontStyle: "bold" },
      2: { cellWidth: 46 },
      3: { cellWidth: 48 },
      4: { cellWidth: 38 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  if (currentY > 185) {
    doc.addPage();
    currentY = 20;
  }

  // --- 4. CLÁUSULAS CONTRATUAIS ---
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("4. CLÁUSULAS E CONDIÇÕES GERAIS DO CONTRATO", 14, currentY);
  currentY += 6;

  const clausulas = [
    // CLÁUSULA 1 — Natureza da Operação e Serviços de Segurança e Rastreamento
    `CLÁUSULA PRIMEIRA - DA NATUREZA DA OPERAÇÃO E PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA E RASTREAMENTO: A CONTRATADA presta serviços de segurança privada, rastreamento tático veicular e proteção patrimonial através de hardware homologado pela ANATEL em regime de comodato com conectividade M2M e plataforma digital ${APP_NOME.toUpperCase()}. O CONTRATANTE dispõe de ferramentas de monitoramento em tempo real, telemetria e gestão tática.`,

    // CLÁUSULA 2 — Proteção e Gestão Patrimonial
    `CLÁUSULA SEGUNDA - DA PROTEÇÃO E GESTÃO PATRIMONIAL: O presente contrato tem por escopo o rastreamento tático, a segurança patrimonial e a gestão telemática de frotas e veículos. O CONTRATANTE reconhece que o sistema opera como ferramenta de segurança e gestão preventiva. Havendo sinistro, furto ou roubo, a CONTRATADA prestará apoio técnico por meio de sua telemetria e o CONTRATANTE deverá formalizar imediatamente o acionamento dos órgãos policiais competentes (190).`,

    // CLÁUSULA 3 — Do Monitoramento, Conectividade e Áreas de Silêncio Eletromagnético
    `CLÁUSULA TERCEIRA - DO MONITORAMENTO, LIMITAÇÕES TÉCNICAS E ZONAS DE SILÊNCIO ELETROMAGNÉTICO: O serviço depende diretamente da integridade dos satélites de posicionamento global (GPS/GNSS) e dos serviços de telecomunicações e dados móveis (GPRS/LTE/4G). A transmissão e precisão dos dados estão sujeitas a interferências técnicas alheias à CONTRATADA, tais como áreas de sombra celular, subsolos, galpões metálicos ou uso ilícito de bloqueadores de sinal (jammers).
PARÁGRAFO PRIMEIRO — CICLOS DE CONSERVAÇÃO EM REPOUSO: Com o veículo estacionado e a ignição desligada, o equipamento opera em ciclos programados de repouso para conservação da bateria do automóvel.
PARÁGRAFO SEGUNDO — INTERRUPÇÃO EM ÁREAS SEM CONECTIVIDADE E CORTE DE FIAÇÃO: Em situações de ausência temporária de sinal celular, os dados permanecem retidos na memória interna do aparelho até o restabelecimento da conectividade.
PARÁGRAFO TERCEIRO — DA ÚLTIMA LOCALIZAÇÃO CONHECIDA: Na hipótese de corte de fiação ou remoção do rastreador em local sem conectividade, a plataforma registrará e exibirá as coordenadas da última transmissão válida.`,

    // CLÁUSULA 4 — Remuneração dos Serviços
    `CLÁUSULA QUARTA - DA REMUNERAÇÃO DOS SERVIÇOS E ENCARGOS MORATÓRIOS: O valor mensal pactuado remunera a prestação dos serviços de segurança, rastreamento tático e conectividade com cessão em comodato dos equipamentos homologados. O CONTRATANTE pagará a mensalidade até o dia ${diaVencimento} de cada mês. O atraso no pagamento sujeita a: (a) MULTA MORATÓRIA de 2% (dois por cento); (b) JUROS DE MORA de 1% (um por cento) ao mês; e (c) ATUALIZAÇÃO MONETÁRIA pelo IPCA/IBGE. O atraso superior a 5 dias autoriza a suspensão dos serviços e acima de 30 dias a rescisão por inadimplemento.`,

    // CLÁUSULA 5 — Prazo, Vigência e Renovação
    `CLÁUSULA QUINTA - DO PRAZO CONTRATUAL, DA VIGÊNCIA E DA RENOVAÇÃO: O presente contrato possui vigência inicial de ${mesesContrato} (${mesesContrato === 1 ? "um" : mesesContrato === 6 ? "seis" : mesesContrato === 12 ? "doze" : mesesContrato === 24 ? "vinte e quatro" : String(mesesContrato)}) meses, com início em ${dataInicioStr} e término previsto em ${dataFimStr}. O cancelamento imotivado antes do término pelo CONTRATANTE enseja multa penal compensatória equivalente a 20% (vinte por cento) do saldo das parcelas vincendas. Ao término da vigência, aplicar-se-á a regra de renovação pactuada: ${tipoRenovacaoTexto}.`,

    // CLÁUSULA 6 — Regime de Comodato dos Equipamentos, Homologação ANATEL e Devolução
    `CLÁUSULA SEXTA - DO REGIME DE COMODATO DOS EQUIPAMENTOS, HOMOLOGAÇÃO ANATEL E DEVOLUÇÃO: O rastreador veicular e o chip SIM Card M2M vinculados a cada veículo são cedidos sob regime de COMODATO para a prestação dos serviços contratados, permanecendo sob a propriedade da CONTRATADA. Todos os equipamentos são HOMOLOGADOS PELA ANATEL. Rescindido ou encerrado o contrato, a qualquer causa, o CONTRATANTE obriga-se a devolver os equipamentos no prazo de 10 (dez) dias úteis. A não devolução obriga à indenização de R$ 450,00 por rastreador e R$ 50,00 por chip.`,

    // CLÁUSULA 7 — Obrigações do Contratante
    `CLÁUSULA SÉTIMA - DAS OBRIGAÇÕES E RESPONSABILIDADES DO CONTRATANTE: O CONTRATANTE compromete-se a zelar pelo perfeito funcionamento dos equipamentos em comodato, manter suas credenciais seguras e utilizar a ferramenta com estrita observância da legislação e da boa-fé objetiva, cientificando condutores sobre a existência do rastreador em conformidade com a LGPD.`,

    // CLÁUSULA 8 — Obrigações da Contratada
    `CLÁUSULA OITAVA - DAS OBRIGAÇÕES DA CONTRATADA E LIMITAÇÃO DE RESPONSABILIDADE: A CONTRATADA compromete-se a manter a plataforma digital acessível com padrão de disponibilidade comercial habitual, prestar suporte técnico para a operação e substituir equipamentos que apresentarem vícios de fabricação não decorrentes de mau uso.`,

    // CLÁUSULA 9 — Proteção de Dados Pessoais (LGPD)
    `CLÁUSULA NONA - DA PROTEÇÃO DE DADOS PESSOAIS E CONFORMIDADE COM A LGPD: Em cumprimento à LGPD (Lei nº 13.709/2018), os dados de posicionamento e telemetria são tratados com criptografia, controle de acesso e auditoria para a execução dos serviços de segurança e rastreamento contratados.`,

    // CLÁUSULA 10 — Licença de Uso de Software
    `CLÁUSULA DÉCIMA - DA LICENÇA DE USO DE SOFTWARE E PROPRIEDADE INTELECTUAL: A plataforma ${APP_NOME.toUpperCase()}, módulos e códigos constituem propriedade intelectual exclusiva, sendo concedida ao CONTRATANTE licença de uso temporária, intransferível e não exclusiva para a gestão e segurança dos veículos contratados.`,

    // CLÁUSULA 11 — Assinatura Eletrônica
    `CLÁUSULA DÉCIMA PRIMEIRA - DA ASSINATURA ELETRÔNICA E AUTENTICIDADE: As partes reconhecem a plena validade jurídica e executividade deste contrato formalizado por meio eletrônico (art. 10, § 2º, da MP nº 2.200-2/2001 e art. 784, III, do CPC), gerando hash criptográfico SHA-256 e selo de autenticidade SGD gravados imutavelmente.`,

    // CLÁUSULA 12 — Foro
    `CLÁUSULA DÉCIMA SEGUNDA - DO FORO DE ELEIÇÃO: Para dirimir quaisquer controvérsias oriundas da interpretação ou execução do presente instrumento, as partes elegem o Foro da Comarca de ${APP_CIDADE_FORO.toUpperCase()}.`,
  ];

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  clausulas.forEach((cl) => {
    const splitCl = doc.splitTextToSize(cl, 182);
    if (currentY + splitCl.length * 3.8 > 272) {
      doc.addPage();
      currentY = 20;
    }
    doc.text(splitCl, 14, currentY);
    currentY += splitCl.length * 3.8 + 3.5;
  });

  // --- DECLARAÇÃO DE CIÊNCIA E ACEITE ---
  if (currentY + 18 > 272) {
    doc.addPage();
    currentY = 20;
  } else {
    currentY += 6;
  }

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  const declaracao = `DECLARAÇÃO DE ACEITE E CIÊNCIA: O(A) CONTRATANTE declara, sob as penas da lei, que leu e compreendeu integralmente todas as cláusulas e condições do presente Contrato de Prestação de Serviços, que as aceita em sua totalidade, sem ressalvas ou restrições, e que reconhece o presente instrumento como juridicamente válido e vinculante entre as partes. Declara, ainda, que todas as informações fornecidas para a celebração deste contrato são verdadeiras e exatas, respondendo civil e criminalmente pela veracidade das mesmas. Emissão realizada pelo operador: ${usuarioEmissor}. Sistema: ${APP_NOME.toUpperCase()} - ${APP_EMPRESA} - CNPJ: ${APP_CNPJ}.`;
  const splitDeclaracao = doc.splitTextToSize(declaracao, 182);
  if (currentY + splitDeclaracao.length * 4 + 4 > 272) {
    doc.addPage();
    currentY = 20;
  }
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(12, currentY - 3, 186, splitDeclaracao.length * 4 + 5, 2, 2, "F");
  doc.setTextColor(30, 41, 59);
  doc.text(splitDeclaracao, 15, currentY + 1);
  currentY += splitDeclaracao.length * 4 + 10;

  // --- LOCAL, DATA E ASSINATURAS (CONTRATADA E CONTRATANTE) ---
  if (currentY + 40 > 272) {
    doc.addPage();
    currentY = 25;
  } else {
    currentY += 4;
  }

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Volta Redonda - RJ, ${dataHoje.getDate()} de ${dataHoje.toLocaleDateString("pt-BR", { month: "long" })} de ${dataHoje.getFullYear()}.`,
    14,
    currentY,
  );
  currentY += 18;

  const col1X = 20;
  const col2X = 115;
  const lineWidth = 75;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);

  // Linhas de assinatura
  doc.line(col1X, currentY, col1X + lineWidth, currentY);
  doc.line(col2X, currentY, col2X + lineWidth, currentY);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(APP_EMPRESA.substring(0, 36), col1X + lineWidth / 2, currentY + 4.5, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${APP_CNPJ}`, col1X + lineWidth / 2, currentY + 8.5, {
    align: "center",
  });
  doc.text(`CONTRATADA (${APP_NOME.toUpperCase()})`, col1X + lineWidth / 2, currentY + 12.5, {
    align: "center",
  });

  doc.setFont("helvetica", "bold");
  doc.text(
    (cliente.nome_razao_social || "CONTRATANTE").toUpperCase().substring(0, 32),
    col2X + lineWidth / 2,
    currentY + 4.5,
    { align: "center" },
  );
  doc.setFont("helvetica", "normal");
  doc.text(`CPF/CNPJ: ${docFormatado}`, col2X + lineWidth / 2, currentY + 8.5, { align: "center" });
  doc.text("CONTRATANTE", col2X + lineWidth / 2, currentY + 12.5, {
    align: "center",
  });

  // Se for cópia autêntica ou contrato já assinado, adiciona o Carimbo de Certificação Digital do Sistema
  const statusContrato =
    statusContratoParam || (isCopiaAutentica ? "assinado" : "pendente_assinatura");

  if (isCopiaAutentica || statusContrato === "assinado") {
    const boxY = Math.min(currentY + 18, 245);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(16, 185, 129); // emerald-500
    doc.setLineWidth(0.6);
    doc.roundedRect(14, boxY, 182, 32, 2, 2, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105);
    doc.text("CERTIDÃO DIGITAL DE AUTENTICIDADE — SISTEMA GD RASTREAMENTO", 18, boxY + 6);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(`Selo Oficial: ${seloAutenticidade || "SGD-OFICIAL"}`, 18, boxY + 11);
    doc.text(`Código de Verificação: ${codigoVerificacao || "VALIDO"}`, 100, boxY + 11);
    doc.text(`Status do Registro: ASSINADO E ARMAZENADO NO BD`, 18, boxY + 16);

    if (dataAssinatura) {
      const dataAssinaturaFmt = new Date(dataAssinatura).toLocaleDateString("pt-BR");
      const horaAssinaturaFmt = new Date(dataAssinatura).toLocaleTimeString("pt-BR");
      doc.text(`Data Assinatura: ${dataAssinaturaFmt} às ${horaAssinaturaFmt}`, 18, boxY + 21);
      if (assinadoPorNome) {
        doc.text(`Signatário: ${assinadoPorNome}`, 100, boxY + 21);
      }
    } else {
      doc.text(`Emitido em: ${dataHojeFormatada} às ${horaHojeFormatada}`, 18, boxY + 21);
      doc.text(`Emissor: ${usuarioEmissor}`, 100, boxY + 21);
    }

    doc.setFontSize(5.8);
    doc.setFont("courier", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Hash SHA-256 Forense: ${hashAssinado || "Verificação de custódia via sistema"}`,
      18,
      boxY + 26,
    );

    doc.setFontSize(6.2);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Conferência pública de autenticidade instantânea: ${APP_PUBLIC_URL}/verificar`,
      18,
      boxY + 30,
    );
  } else {
    // Bloco de Assinatura Eletrônica pelo Dispositivo do Cliente (MP 2.200-2/2001 e Lei 14.063/2020)
    const boxY = Math.min(currentY + 18, 238);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(14, 116, 144); // sky-600
    doc.setLineWidth(0.6);
    doc.roundedRect(14, boxY, 182, 38, 2, 2, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(14, 116, 144);
    doc.text("ASSINATURA ELETRÔNICA DO CLIENTE VIA DISPOSITIVO MÓVEL", 18, boxY + 6);

    doc.setFontSize(6.2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(
      "Validade Jurídica e Força Executiva Plena (Art. 10, § 2º da MP 2.200-2/2001 e Lei 14.063/2020)",
      18,
      boxY + 10.5,
    );

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(
      "Para assinar este contrato diretamente pelo seu celular ou computador, acesse:",
      18,
      boxY + 16,
    );

    doc.setFont("helvetica", "bold");
    doc.setTextColor(2, 132, 199); // sky-600
    doc.text(linkAssinatura, 18, boxY + 20.5, { maxWidth: 135 });
    doc.link(18, boxY + 16.5, 130, 6, { url: linkAssinatura });

    doc.setFontSize(5.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Ou aponte a câmera do seu celular para o QR Code ao lado para assinar com 1 toque.",
      18,
      boxY + 25.5,
    );
    doc.text(
      "Comprovação pericial por IP, geolocalização GPS, hardware do aparelho e carimbo de tempo UTC.",
      18,
      boxY + 29.5,
    );

    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(`Selo: ${seloAutenticidade} | Código: ${codigoVerificacao}`, 18, boxY + 34);

    // QR Code na lateral direita do box
    if (qrCodeAssinaturaDataUrl) {
      doc.addImage(qrCodeAssinaturaDataUrl, "PNG", 160, boxY + 4, 30, 30);
      doc.link(160, boxY + 4, 30, 30, { url: linkAssinatura });
    }
  }

  // --- RODAPÉ EM TODAS AS PÁGINAS COM SELO DE AUTENTICIDADE DEFINITIVO ---
  const urlVerificacao = `${APP_PUBLIC_URL}/verificar`;
  const textoSelo = isCopiaAutentica
    ? `CÓPIA AUTÊNTICA CERTIFICADA — Selo: ${seloAutenticidade} | Código: ${codigoVerificacao} | Verifique: ${urlVerificacao}`
    : `Selo: ${seloAutenticidade} | Código: ${codigoVerificacao} | Verifique: ${urlVerificacao}`;

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 282, 210, 16, "F");

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);

    // Linha 1 do rodapé à esquerda — Dados da empresa e Canal de Venda Discreto (Rastreabilidade Forense)
    const canalVendaParts: string[] = [];
    const revNome = (cliente as any).revendedor_nome;
    const vendNome = (cliente as any).vendedor_nome;
    if (revNome) canalVendaParts.push(`Revendedor: ${revNome}`);
    if (vendNome) canalVendaParts.push(`Vendedor: ${vendNome}`);
    const canalVendaTexto =
      canalVendaParts.length > 0 ? ` | Canal: ${canalVendaParts.join(" · ")}` : "";

    doc.text(
      `${APP_EMPRESA} - CNPJ: ${APP_CNPJ} - Contrato ${numeroContrato}${canalVendaTexto}`,
      14,
      286,
    );

    // Linha 2 do rodapé à esquerda — Foro e versão
    doc.text(
      `Foro Eleito: ${foroComarca} - ${APP_NOME.toUpperCase()} v${APP_VERSION_NUMERO}`,
      14,
      290,
    );

    // Linha 3 do rodapé — Selo de Autenticidade
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(textoSelo, 14, 294);

    // Paginação à direita, isolada
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${p} de ${totalPages}`, 196, 290, { align: "right" });
  }

  // Download do PDF e Registro Forense + Registro no BD de Contratos Assinados
  const nomeArquivoSanitizado = (cliente.nome_razao_social || "Cliente")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 25);
  const numContratoSanitizado = numeroContrato.replace(/[^a-zA-Z0-9]/g, "_");
  const prefixoNome = isCopiaAutentica ? "Copia_Autentica_Contrato" : "Contrato";
  const nomeArquivo = `${prefixoNome}_${APP_NOME.replace(/\s+/g, "_")}_${nomeArquivoSanitizado}_${numContratoSanitizado}.pdf`;

  // Calcular vigência
  const vigenciaInicioDate = cliente.data_inicio_contrato || new Date().toISOString().slice(0, 10);
  let vigenciaFimDate = cliente.data_fim_contrato || "";
  if (!vigenciaFimDate) {
    const dFim = new Date(vigenciaInicioDate + "T12:00:00");
    dFim.setMonth(dFim.getMonth() + mesesContrato);
    vigenciaFimDate = dFim.toISOString().slice(0, 10);
  }

  // 1. Gera o ArrayBuffer definitivo para calcular o hash SHA-256 exato
  const tempArrayBuffer = doc.output("arraybuffer");
  const hashSha256 = await calcularSha256Buffer(tempArrayBuffer);

  try {
    // 2. Registra na tabela documentos_emitidos (forense)
    await registrarDocumentoEmitido({
      nome_arquivo: nomeArquivo,
      hash_sha256: hashSha256,
      tipo_documento: isCopiaAutentica ? "COPIA_AUTENTICA_CONTRATO" : "CONTRATO_PRESTACAO_SERVICOS",
      descricao: `${isCopiaAutentica ? "Cópia Autêntica Certificada" : "Contrato Oficial de Adesão"} - ${cliente.nome_razao_social || "Cliente"} (${numeroContrato})`,
      emissor_nome: usuarioEmissor || undefined,
      tamanho_bytes: tempArrayBuffer.byteLength,
      metadata: {
        cliente_id: cliente.id,
        numero_contrato: numeroContrato,
        foro: foroComarca,
        copia_autentica: isCopiaAutentica,
        selo: seloAutenticidade,
        codigo: codigoVerificacao,
        link_assinatura: linkAssinatura,
      },
    });

    // 3. Se for emissão de novo contrato original (não cópia existente), registra em contratos_clientes
    if (!isCopiaAutentica) {
      await registrarContratoEmitido({
        cliente_id: cliente.id,
        numero_contrato: numeroContrato,
        tipo_contrato: "PRESTACAO_SERVICOS",
        hash_pdf_original: hashSha256,
        selo_autenticidade: seloAutenticidade,
        codigo_verificacao: codigoVerificacao,
        emitido_por_nome: usuarioEmissor || "Administrador do Sistema",
        vigencia_inicio: vigenciaInicioDate,
        vigencia_fim: vigenciaFimDate,
        valor_mensalidade: valorMensalidade,
        valor_total_contrato: valorTotalContrato,
        is_atualizacao: params.isAtualizacao,
        contrato_anterior_id: params.contratoAnteriorId,
        numero_contrato_anterior: params.numeroContratoAnterior,
        metadata: {
          numero_contrato: numeroContrato,
          foro: foroComarca,
          hash_pdf_original: hashSha256,
          selo_autenticidade: seloAutenticidade,
          codigo_verificacao: codigoVerificacao,
          is_atualizacao: Boolean(params.isAtualizacao),
          contrato_anterior_id: params.contratoAnteriorId || null,
          link_assinatura: linkAssinatura,
        },
      });
    }
  } catch (errReg) {
    console.error("Erro ao registrar contrato no banco de dados:", errReg);
    throw new Error(
      "O documento foi gerado, mas ocorreu uma falha ao registrar a autenticidade no banco de dados. Verifique a conexão.",
    );
  }

  if (params.baixarPdf && typeof window !== "undefined") {
    doc.save(nomeArquivo);
  }

  return doc;
}

/**
 * Emite e faz o download de uma Cópia Autêntica de um contrato existente,
 * já carimbada com a Certificação Digital e Selo de Autenticidade do GD Rastreamento.
 */
export async function emitirCopiaAutenticadaContratoPdf({
  cliente,
  contrato,
  usuarioEmissor = "Administrador do Sistema",
}: {
  cliente: Cliente;
  contrato: {
    numero_contrato: string;
    selo_autenticidade: string;
    codigo_verificacao: string;
    hash_pdf_assinado?: string | null;
    hash_pdf_original?: string | null;
    data_assinatura?: string | null;
    assinado_por_nome?: string | null;
    status: string;
  };
  usuarioEmissor?: string;
}): Promise<jsPDF> {
  return emitirContratoPrestacaoServicosPdf({
    cliente,
    numeroContrato: contrato.numero_contrato,
    usuarioEmissor,
    copiaAutenticada: true,
    seloAutenticidade: contrato.selo_autenticidade,
    codigoVerificacao: contrato.codigo_verificacao,
    hashAssinado: contrato.hash_pdf_assinado || contrato.hash_pdf_original || undefined,
    dataAssinatura: contrato.data_assinatura || undefined,
    assinadoPorNome: contrato.assinado_por_nome || undefined,
    statusContrato: contrato.status,
    baixarPdf: true,
  });
}
