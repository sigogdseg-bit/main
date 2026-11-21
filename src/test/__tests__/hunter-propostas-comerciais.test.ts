import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularMetricasPropostas,
  formatarMensagemWhatsAppProposta,
  gerarLinkWhatsAppProposta,
} from "../../features/financeiro/services/propostaService";
import type { PropostaComercial } from "../../features/financeiro/types/proposta";

describe("GD Rastreamento — Módulo de Propostas Comerciais e Efetividade de Vendas", () => {
  const propostaExemplo: PropostaComercial = {
    id: "prop-uuid-1234",
    numero_proposta: "PROP-2026-0001",
    cliente_nome: "Roberto Carlos Silveira",
    cliente_telefone: "(24) 99876-5432",
    veiculo_marca: "Toyota",
    veiculo_modelo: "Corolla Altis Hybrid",
    veiculo_ano: "2024",
    com_fidelidade_meses: 12,
    com_fidelidade_instalacao: 150.0,
    com_fidelidade_mensalidade: 69.9,
    sem_fidelidade_instalacao: 250.0,
    sem_fidelidade_mensalidade: 89.9,
    status: "pendente",
    observacoes: "Agendamento prioritário para instalação aos sábados.",
    hash_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    created_at: "2026-09-25T10:00:00.000Z",
    updated_at: "2026-09-25T10:00:00.000Z",
  };

  test("Cálculo de Métricas e Taxa de Efetividade/Conversão", () => {
    const lista: PropostaComercial[] = [
      { ...propostaExemplo, id: "1", status: "aceita" },
      { ...propostaExemplo, id: "2", status: "aceita" },
      { ...propostaExemplo, id: "3", status: "pendente" },
      { ...propostaExemplo, id: "4", status: "recusada" },
    ];

    const metricas = calcularMetricasPropostas(lista);
    assert.equal(metricas.total, 4);
    assert.equal(metricas.aceitas, 2);
    assert.equal(metricas.pendentes, 1);
    assert.equal(metricas.recusadas, 1);
    assert.equal(metricas.expiradas, 0);
    // 2 de 4 = 50%
    assert.equal(metricas.taxaConversao, 50.0);
  });

  test("Métricas em lista vazia", () => {
    const metricas = calcularMetricasPropostas([]);
    assert.equal(metricas.total, 0);
    assert.equal(metricas.taxaConversao, 0);
  });

  test("Mensagem Comercial Amigável para WhatsApp com Valor Promocional e Chamada ao PDF", () => {
    const msg = formatarMensagemWhatsAppProposta(propostaExemplo);

    assert.ok(
      msg.includes("Olá, *Roberto*! Tudo bem?"),
      "Deve conter saudação amigável personalizada",
    );
    assert.ok(
      msg.includes("valor promocional especial"),
      "Deve informar claramente que segue com valor promocional",
    );
    assert.ok(
      msg.includes("Toyota Corolla Altis Hybrid (2024)"),
      "Deve citar o veículo da proposta de forma elegante",
    );
    assert.ok(
      msg.includes("documento oficial em PDF (*Ref.: #PROP-2026-0001*)"),
      "Deve indicar a referência oficial e o anexo PDF",
    );
    assert.ok(
      msg.includes("Dê uma olhadinha no PDF!"),
      "Deve conter chamada para despertar o interesse em abrir o PDF",
    );

    // Regra de Negócio: Não deve conter texto auxiliar longo para não desestimular a abertura do PDF
    assert.ok(
      !msg.includes("AVISO TÉCNICO SOBRE BLOQUEIO VEICULAR"),
      "Mensagem de WhatsApp não deve conter aviso técnico extenso de bloqueio",
    );
    assert.ok(
      !msg.includes("Enquadramento Legal: Locação de Bem Móvel"),
      "Mensagem de WhatsApp não deve conter texto auxiliar jurídico extenso",
    );
  });

  test("Aviso Técnico de Bloqueio (LIN/CAN) e Planos Detalhados no Documento Oficial PDF", () => {
    const pdfServiceContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );

    assert.ok(
      pdfServiceContent.includes("CAN e LIN") || pdfServiceContent.includes("redes CAN"),
      "O documento oficial em PDF deve conter a advertência técnica sobre arquitetura CAN/LIN",
    );
    assert.ok(
      pdfServiceContent.includes("bloqueio remoto de combustivel"),
      "O documento oficial em PDF deve detalhar as condições técnicas de bloqueio",
    );
    assert.ok(
      pdfServiceContent.includes("COM FIDELIDADE") || pdfServiceContent.includes("com_fidelidade"),
      "O PDF deve detalhar os planos e valores comparativos",
    );
  });

  test("Geração de Link Universal do WhatsApp com Telefone Sanitizado", () => {
    const link = gerarLinkWhatsAppProposta(propostaExemplo);

    assert.ok(link.startsWith("https://wa.me/5524998765432?text="));
    assert.ok(link.includes(encodeURIComponent("PROP-2026-0001")));
  });

  test("Ausência Estrita do Caractere Comercial Proibido (&)", () => {
    const msg = formatarMensagemWhatsAppProposta(propostaExemplo);
    const link = gerarLinkWhatsAppProposta(propostaExemplo);

    // Na mensagem em si não deve haver o caractere ampersand
    assert.ok(
      !msg.includes(String.fromCharCode(38)),
      "A mensagem comercial não pode conter o caractere ampersand (&)",
    );

    // No link gerado, apenas o parâmetro de query string ?text= é permitido
    const semParametroQuery = link.replace("?text=", "");
    assert.ok(
      !semParametroQuery.includes(String.fromCharCode(38)),
      "O conteúdo do link não deve conter ampersand indevido",
    );
  });

  test("Proposta Oficial em PDF: Segurança Privada, Rastreamento Tático e Ausência de Menção a Locação", () => {
    const pdfServiceContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );
    assert.ok(
      !pdfServiceContent.toLowerCase().includes("locação") &&
        !pdfServiceContent.toLowerCase().includes("locacao"),
      "Documento oficial PDF não deve conter menção a locação de rastreadores",
    );
    assert.ok(
      pdfServiceContent.toLowerCase().includes("seguranca") ||
        pdfServiceContent.toLowerCase().includes("segurança"),
      "Documento oficial PDF deve destacar a segurança e rastreamento tático",
    );
    const msg = formatarMensagemWhatsAppProposta(propostaExemplo);
    assert.ok(
      !msg.toLowerCase().includes("comodato"),
      "Mensagem de WhatsApp não deve citar comodato",
    );
  });

  test("Proposta de Frota Corporativa sem exigência de veículo individual", () => {
    const propostaFrota: PropostaComercial = {
      ...propostaExemplo,
      id: "prop-frota-999",
      numero_proposta: "PROP-FROTA-2026-0001",
      tipo_proposta: "frota",
      veiculo_marca: "",
      veiculo_modelo: "",
      veiculo_ano: "",
      faixas_frota: [
        {
          chave: "ate_4",
          rotulo: "Até 4 veículos",
          min: 1,
          max: 4,
          instalacao_com_fidelidade: 120.0,
          mensalidade_com_fidelidade: 59.9,
          instalacao_sem_fidelidade: 220.0,
          mensalidade_sem_fidelidade: 79.9,
        },
        {
          chave: "5_a_9",
          rotulo: "De 5 a 9 veículos",
          min: 5,
          max: 9,
          instalacao_com_fidelidade: 99.0,
          mensalidade_com_fidelidade: 54.9,
          instalacao_sem_fidelidade: 199.0,
          mensalidade_sem_fidelidade: 74.9,
        },
        {
          chave: "10_a_14",
          rotulo: "De 10 a 14 veículos",
          min: 10,
          max: 14,
          instalacao_com_fidelidade: 79.0,
          mensalidade_com_fidelidade: 49.9,
          instalacao_sem_fidelidade: 179.0,
          mensalidade_sem_fidelidade: 69.9,
        },
        {
          chave: "acima_15",
          rotulo: "A partir de 15 veículos",
          min: 15,
          max: null,
          instalacao_com_fidelidade: 49.0,
          mensalidade_com_fidelidade: 44.9,
          instalacao_sem_fidelidade: 149.0,
          mensalidade_sem_fidelidade: 64.9,
        },
      ],
      historico_contrapropostas: [
        {
          data: "2026-09-25T11:00:00.000Z",
          operador: "SuperADM",
          motivo: "Desconto especial negociado com diretoria para fechar 10 placas",
          resumo_alteracoes: "Instalação com fidelidade reduzida para R$ 79,00",
        },
      ],
    };

    const msgFrota = formatarMensagemWhatsAppProposta(propostaFrota);

    assert.ok(
      msgFrota.includes("frota corporativa"),
      "Deve citar frota corporativa na mensagem amigável",
    );
    assert.ok(
      msgFrota.includes("valor promocional especial"),
      "Deve indicar que segue proposta com valor promocional",
    );
    assert.ok(
      msgFrota.includes("Ref.: #PROP-FROTA-2026-0001"),
      "Deve conter a referência da proposta",
    );
    assert.ok(
      !msgFrota.includes(String.fromCharCode(38)),
      "Proposta de frota não pode conter ampersand (&)",
    );

    // No PDF, as faixas de frota permanecem catalogadas
    const pdfServiceContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );
    assert.ok(
      pdfServiceContent.includes("faixas_frota") || pdfServiceContent.includes("faixa"),
      "O gerador de PDF deve renderizar as faixas de frota",
    );
  });

  test("Condição Promocional: Valores Promocionais e Chamada no WhatsApp e Detalhamento no PDF", () => {
    // Proposta com condição promocional ativa
    const propostaComPromo: PropostaComercial = {
      ...propostaExemplo,
      com_fidelidade_instalacao_cheia: 380.0,
      com_fidelidade_mensalidade_cheia: 120.0,
      com_fidelidade_instalacao: 150.0,
      com_fidelidade_mensalidade: 69.9,
      sem_fidelidade_instalacao_cheia: 420.0,
      sem_fidelidade_mensalidade_cheia: 160.0,
      sem_fidelidade_instalacao: 250.0,
      sem_fidelidade_mensalidade: 89.9,
      aplicar_promocao: true,
    };

    const msgComPromo = formatarMensagemWhatsAppProposta(propostaComPromo);
    assert.ok(
      msgComPromo.includes("valor promocional especial"),
      "Deve destacar o valor promocional na mensagem amigável",
    );
    assert.ok(
      msgComPromo.includes("Dê uma olhadinha no PDF!"),
      "Deve convidar o cliente a abrir e verificar a proposta oficial",
    );

    // No PDF, os valores e badges promocionais são renderizados
    const pdfCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );
    assert.ok(
      pdfCode.includes("aplicar_promocao") || pdfCode.includes("promocional"),
      "PDF deve processar a condição promocional",
    );
  });

  test("Endpoint Server-Side /api/propostas/salvar e Resiliência contra Bloqueio RLS", () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), "src/server.ts"), "utf-8");
    assert.ok(
      serverCode.includes('"/api/propostas/salvar"'),
      "server.ts deve conter endpoint /api/propostas/salvar",
    );
    assert.ok(
      serverCode.includes("handleApiPropostas"),
      "server.ts deve invocar handleApiPropostas no router",
    );
    assert.ok(
      serverCode.includes('"/api/propostas/listar"'),
      "server.ts deve expor rota /api/propostas/listar com service_role",
    );
  });

  test("Condição de Conectividade M2M na Proposta Comercial (Até 20MB de Tráfego)", () => {
    const pdfCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );
    assert.ok(
      pdfCode.includes('"Inclusos ate 20mb de trafego. Mais capacidade de trafego sob consulta."'),
      "Deve conter a descrição canônica de 20mb de tráfego",
    );
    assert.ok(
      !pdfCode.includes('"Inclusos sem custo adicional de trafego"'),
      "Não deve mais conter a redação antiga",
    );
  });

  test("Eliminação de Glitches de Codificação (Ø=ßâ / Emojis) nos Títulos de Planos no PDF", () => {
    const pdfCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/financeiro/services/propostaPdfService.ts"),
      "utf-8",
    );
    assert.ok(
      !pdfCode.includes("${plano.icone}"),
      "PDF não deve injetar emojis de ícone no texto do plano para evitar corrupção de caracteres",
    );
    assert.ok(
      pdfCode.includes("doc.text(plano.rotulo, 20, p2Y + 5.5)"),
      "PDF deve renderizar o rótulo limpo do plano diretamente",
    );
  });
});
