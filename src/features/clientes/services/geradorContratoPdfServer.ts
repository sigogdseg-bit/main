import { jsPDF } from "jspdf";
import {
  obterDefinicaoPlano,
  obterDescritivoFuncionalidadesContrato,
} from "@/shared/lib/planosComerciais";

export interface DadosContratoPdfServer {
  contrato: {
    numero_contrato?: string;
    selo_autenticidade?: string;
    codigo_verificacao?: string;
    data_emissao?: string;
    status?: string;
    data_assinatura?: string | null;
    assinado_por_nome?: string | null;
    assinatura_ip?: string | null;
    hash_pdf_assinado?: string | null;
    hash_pdf_original?: string | null;
    metadata?: {
      rubrica_base64?: string | null;
      trilha_auditoria?: {
        signatario_nome?: string;
        signatario_documento?: string;
        ip_origem?: string;
        geolocalizacao?: {
          latitude: number;
          longitude: number;
          precisao: number;
        } | null;
        device_info?: any;
        timestamp_utc?: string;
        hash_forense_aceite?: string;
      } | null;
    } | null;
  };
  cliente: {
    nome_razao_social?: string;
    documento?: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    plano?: string;
    valor_mensalidade?: number;
    dia_vencimento?: number;
  };
  veiculos?: Array<{
    placa?: string;
    modelo?: string;
    marca_modelo?: string;
    ano?: number | null;
    cor?: string | null;
    rastreador_imei?: string | null;
    imei?: string | null;
    rastreador_modelo?: string | null;
  }>;
}

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

function formatarTelefone(tel?: string | null): string {
  if (!tel) return "Não informado";
  const limpo = tel.replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return tel;
}

export function gerarContratoPdfBufferServer(dados: DadosContratoPdfServer): Uint8Array {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const { contrato, cliente, veiculos = [] } = dados;
  const numeroContrato = contrato.numero_contrato || "CTR-0001/2026";
  const selo = contrato.selo_autenticidade || "SGD-OFICIAL";
  const codigo = contrato.codigo_verificacao || "SGA7M9";
  const dataHoje = new Date();
  const dataFormatada = dataHoje.toLocaleDateString("pt-BR");

  let y = 18;

  // Cabeçalho institucional
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, y, 182, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("GD SEGURANÇA PRIVADA — CONTRATO DE PRESTAÇÃO DE SERVIÇOS", 18, y + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("Segurança Privada e Rastreamento Tático Veicular e Patrimonial", 18, y + 14);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(`Nº ${numeroContrato}`, 190, y + 8, { align: "right" });
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Selo: ${selo} | Cód: ${codigo}`, 190, y + 14, { align: "right" });

  y += 28;

  // Preâmbulo
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const preambulo = `Pelo presente instrumento particular, as partes qualificadas têm entre si justo e acordado o presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA PRIVADA, RASTREAMENTO TÁTICO E MONITORAMENTO VEICULAR, em conformidade com o Código Civil Brasileiro (Lei nº 10.406/2002), a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), a Lei do Software (Lei nº 9.609/1998) e o Código de Defesa do Consumidor (Lei nº 8.078/1990), regendo-se pelas cláusulas a seguir sob os princípios da probidade e da boa-fé objetiva (art. 422 do CC).`;
  const splitPreambulo = doc.splitTextToSize(preambulo, 182);
  doc.text(splitPreambulo, 14, y);
  y += splitPreambulo.length * 3.8 + 5;

  // 1. Partes Contratantes
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES", 16, y + 4.5);
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  const contratadaTexto = `CONTRATADA: DARIO DE NOVAES GONÇALVES JÚNIOR - MEI, CNPJ nº 26.581.175/0001-23, com sede na Rua Dom Antônio Cabral, nº 225, Bairro São Luiz, Volta Redonda/RJ, CEP 27286-210, detentora da plataforma digital GD Segurança Privada (https://gd.oficial.tec.br).`;
  const splitContratada = doc.splitTextToSize(contratadaTexto, 182);
  doc.text(splitContratada, 14, y);
  y += splitContratada.length * 3.6 + 3;

  const contratanteTexto = `CONTRATANTE: ${cliente?.nome_razao_social || "Cliente"}, inscrito(a) no CPF/CNPJ sob o nº ${formatarDocumento(cliente?.documento)}, Telefone/WhatsApp: ${formatarTelefone(cliente?.telefone)}, residente/sediado no endereço informado no cadastro da plataforma.`;
  const splitContratante = doc.splitTextToSize(contratanteTexto, 182);
  doc.text(splitContratante, 14, y);
  y += splitContratante.length * 3.6 + 5;

  // 2. Do Objeto
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("2. DO OBJETO DO CONTRATO E MODALIDADE DE SERVIÇO", 16, y + 4.5);
  y += 8;

  const defPlano = obterDefinicaoPlano(cliente?.plano);
  const diasVisiveisFinal = (cliente as any)?.dias_historico_plano || defPlano.diasHistoricoVisivel;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const objetoTexto = `Constitui objeto deste instrumento a prestação de serviços especializados de segurança privada, rastreamento tático veicular e proteção patrimonial, com a cessão em regime de comodato de equipamento eletrônico de rastreamento telemático GPS/GNSS devidamente HOMOLOGADO PELA ANATEL, acompanhado de chip SIM Card M2M/LTE dedicado para transmissão de dados. A plataforma web e mobile GD Segurança é disponibilizada ao CONTRATANTE para acompanhamento tático em tempo real no ${defPlano.rotulo} (${defPlano.nome}). Funcionalidades contempladas: ${obterDescritivoFuncionalidadesContrato(cliente?.plano)} Histórico de trajetos: ${diasVisiveisFinal} dias visíveis no aplicativo.`;
  const splitObjeto = doc.splitTextToSize(objetoTexto, 182);
  doc.text(splitObjeto, 14, y);
  y += splitObjeto.length * 3.6 + 5;

  // 3. Veículos e Equipamentos
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("3. VEÍCULOS VINCULADOS E ESPECIFICAÇÕES DOS EQUIPAMENTOS EM COMODATO", 16, y + 4.5);
  y += 8;

  if (veiculos && veiculos.length > 0) {
    veiculos.forEach((v, i) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Veículo ${i + 1}: Placa ${v.placa || "SEM PLACA"} - ${v.modelo || v.marca_modelo || "Veículo Cadastrado"}`,
        16,
        y,
      );
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Rastreador: J16 4G LTE | IMEI: ${v.rastreador_imei || v.imei || "Vinculado na Ativação"} | Homologado ANATEL`,
        16,
        y,
      );
      y += 5;
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Veículo e rastreador cadastrados no sistema e vinculados a este contrato.", 16, y);
    y += 5;
  }
  y += 2;

  // 4. Cláusulas Gerais
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("4. CLÁUSULAS E CONDIÇÕES GERAIS DO CONTRATO", 16, y + 4.5);
  y += 8;

  const clausulas = [
    "CLÁUSULA 1ª - DOS SERVIÇOS DE SEGURANÇA E RASTREAMENTO TÁTICO: A CONTRATADA presta serviços especializados de segurança privada, rastreamento tático veicular e proteção patrimonial, com disponibilização da plataforma digital para acompanhamento em tempo real.",
    "CLÁUSULA 2ª - DA PROTEÇÃO E GESTÃO PATRIMONIAL: O presente contrato tem por escopo o rastreamento tático, monitoramento e gestão patrimonial preventiva. Havendo sinistro, furto ou roubo, a CONTRATADA prestará apoio técnico de telemetria e o CONTRATANTE acionará as autoridades públicas competentes.",
    "CLÁUSULA 3ª - DO MONITORAMENTO, CONECTIVIDADE E ÁREAS DE SILÊNCIO ELETROMAGNÉTICO: O funcionamento do equipamento depende de cobertura satelital (GPS) e sinais de telefonia celular móvel (LTE/4G). O serviço está sujeito a interferências técnicas alheias à CONTRATADA, tais como áreas de sombra celular, zonas rurais, subsolos, garagens enclausuradas, túneis, galpões metálicos ou uso criminoso de bloqueadores (jammers). Com o veículo estacionado, o equipamento opera em ciclos programados de conservação. Em caso de corte de fiação, violação, remoção do aparelho ou deslocamento do veículo em locais desprovidos de cobertura de telefonia móvel, a plataforma exibirá estritamente as coordenadas do último ponto de comunicação válida com as antenas celulares, ficando a CONTRATADA isenta de responsabilidade caso o veículo seja deslocado desprovido do rastreador ou sob zonas de silêncio eletromagnético.",
    "CLÁUSULA 4ª - DA VIGÊNCIA E RESCISÃO: O contrato possui vigência inicial de 12 meses, prorrogável automaticamente por iguais períodos, salvo manifestação em contrário com antecedência de 30 dias. O encerramento imotivado antes do prazo inicial sujeita à multa compensatória de 20% do saldo restante.",
    "CLÁUSULA 5ª - DO REGIME DE COMODATO E DEVOLUÇÃO: Os rastreadores e chips M2M são cedidos em regime de comodato enquanto perdurar a contratação. Encerrado o contrato por qualquer motivo, o CONTRATANTE compromete-se a devolver os equipamentos no prazo de 10 dias úteis, sob pena de indenização de R$ 450,00 por rastreador e R$ 50,00 por chip.",
    "CLÁUSULA 6ª - DA PROTEÇÃO DE DADOS (LGPD): Em conformidade com a Lei nº 13.709/2018, os dados de posicionamento são tratados exclusivamente para a execução do contrato de segurança e rastreamento, sendo mantidos sob rígidos controles de segurança cibernética e sigilo.",
    "CLÁUSULA 7ª - DA ASSINATURA ELETRÔNICA E FORÇA EXECUTIVA: As partes reconhecem a plena validade jurídica, integridade e eficácia executiva do presente instrumento assinado eletronicamente por meio digital (Art. 10, § 2º da MP nº 2.200-2/2001 e Art. 784, III do CPC).",
    "CLÁUSULA 8ª - DO FORO DE ELEIÇÃO: Fica eleito o Foro da Comarca de Volta Redonda/RJ para dirimir eventuais dúvidas ou controvérsias decorrentes deste contrato, com renúncia de qualquer outro.",
  ];

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  clausulas.forEach((cl) => {
    const splitCl = doc.splitTextToSize(cl, 182);
    if (y + splitCl.length * 3.5 > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(splitCl, 14, y);
    y += splitCl.length * 3.5 + 2.5;
  });

  // Declaração de aceite
  if (y + 25 > 275) {
    doc.addPage();
    y = 20;
  } else {
    y += 3;
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, 182, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const decTexto = `DECLARAÇÃO FORMAL: O(A) Contratante declara que leu integralmente e compreendeu todas as cláusulas e condições estipuladas neste instrumento, aceitando-as em sua totalidade de forma irrevogável e vinculante.`;
  const splitDec = doc.splitTextToSize(decTexto, 178);
  doc.text(splitDec, 16, y + 5);
  y += 22;

  // Bloco de Assinaturas
  if (y + 35 > 275) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(`Volta Redonda/RJ, ${dataFormatada}.`, 14, y);
  y += 14;

  const col1X = 20;
  const col2X = 115;
  const lineW = 75;

  // Se o contrato já foi assinado e possui a rubrica manuscrita do cliente
  const rubrica = contrato.metadata?.rubrica_base64;
  if (rubrica) {
    try {
      doc.addImage(rubrica, "PNG", col2X + 10, y - 16, 55, 14);
    } catch (errImg) {
      console.warn("Aviso ao desenhar rubrica no PDF:", errImg);
    }
  }

  // Carimbo digital da CONTRATADA
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(5, 150, 105);
  doc.text("EMITIDO E CERTIFICADO PELO SISTEMA", col1X + lineW / 2, y - 3, { align: "center" });

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(col1X, y, col1X + lineW, y);
  doc.line(col2X, y, col2X + lineW, y);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("DARIO DE NOVAES GONÇALVES JÚNIOR - MEI", col1X + lineW / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text("CONTRATADA (GD RASTREAMENTO)", col1X + lineW / 2, y + 8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.text((cliente?.nome_razao_social || "CONTRATANTE").toUpperCase(), col2X + lineW / 2, y + 4, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.text(`CPF/CNPJ: ${formatarDocumento(cliente?.documento)}`, col2X + lineW / 2, y + 8, {
    align: "center",
  });
  doc.text("CONTRATANTE", col2X + lineW / 2, y + 12, { align: "center" });

  y += 18;

  // Se o contrato estiver assinado, renderiza a Certidão Digital de Autenticidade Forense
  const isAssinado = contrato.status === "assinado" || Boolean(contrato.data_assinatura);
  if (isAssinado) {
    if (y + 42 > 275) {
      doc.addPage();
      y = 20;
    }

    const boxY = y;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(16, 185, 129); // emerald-500
    doc.setLineWidth(0.6);
    doc.roundedRect(14, boxY, 182, 38, 2, 2, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105);
    doc.text("CERTIDÃO DIGITAL DE AUTENTICIDADE FORENSE — SISTEMA GD RASTREAMENTO", 18, boxY + 6);

    doc.setFontSize(6.8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(`Selo Oficial: ${selo}`, 18, boxY + 11.5);
    doc.text(`Código de Verificação: ${codigo}`, 105, boxY + 11.5);

    const dataAssinaturaTexto = contrato.data_assinatura
      ? new Date(contrato.data_assinatura).toLocaleString("pt-BR")
      : dataFormatada;
    const signatarioNome = contrato.assinado_por_nome || cliente?.nome_razao_social || "Cliente";
    const signatarioDoc = formatarDocumento(cliente?.documento);

    doc.setFont("helvetica", "normal");
    doc.text(`Data/Hora Assinatura: ${dataAssinaturaTexto} (Horário de Brasília)`, 18, boxY + 16.5);
    doc.text(`Signatário: ${signatarioNome} (CPF: ${signatarioDoc})`, 105, boxY + 16.5);

    const trilha = contrato.metadata?.trilha_auditoria;
    const ip = trilha?.ip_origem || contrato.assinatura_ip || "Auditado via Web";
    const geo = trilha?.geolocalizacao;
    const geoTexto = geo
      ? ` • GPS: ${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)} (±${geo.precisao}m)`
      : "";

    doc.text(`Conexão de Origem: IP ${ip}${geoTexto}`, 18, boxY + 21.5);

    doc.setFontSize(5.8);
    doc.setFont("courier", "bold");
    doc.setTextColor(71, 85, 105);
    const hashDefinitivo =
      contrato.hash_pdf_assinado || trilha?.hash_forense_aceite || "CERTIFICADO_NA_CUSTODIA";
    doc.text(`Hash SHA-256 Forense: ${hashDefinitivo}`, 18, boxY + 26.5);

    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Documento formalizado conforme o Art. 10, § 2º da MP nº 2.200-2/2001 e Lei Federal nº 14.063/2020. Título executivo (Art. 784, III do CPC).",
      18,
      boxY + 31,
    );
    doc.text(
      "Conferência pública de autenticidade instantânea: https://gd.oficial.tec.br/verificar",
      18,
      boxY + 35,
    );

    y += 44;
  }

  // Rodapé em todas as páginas
  const pageCount = (doc.internal as any).getNumberOfPages
    ? (doc.internal as any).getNumberOfPages()
    : doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      `GD Rastreamento • Contrato nº ${numeroContrato} • Selo: ${selo} • Cód: ${codigo}`,
      14,
      290,
    );
    doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: "right" });
  }

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
