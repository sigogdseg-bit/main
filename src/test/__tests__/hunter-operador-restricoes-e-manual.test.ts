import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MANUAIS_MODULOS } from "../../features/manual/data/manualData";
import { agruparVeiculosPorCliente } from "../../features/monitor-gps/utils/agrupamentoClientes";
import { podeAcessarLocalizacaoVeiculo } from "../../features/monitor-gps/utils/privacidadeLocalizacao";
import type { UserSession } from "../../features/auth/types";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter — Restrições do Operador, Privacidade e Manual Modular", () => {
  const sessaoOperador: UserSession = {
    userId: "op-1",
    email: "operador@hunter.com",
    nome: "Operador de Rastreamento",
    role: "operador",
    isOperador: true,
    isAdmin: false,
    isSuperAdmin: false,
    isInstalador: false,
    isMotorista: false,
    isCliente: false,
    modulos: ["inicio", "monitor-gps", "estoque", "financeiro", "clientes"],
  };

  const sessaoSuperAdm: UserSession = {
    userId: "adm-novaes",
    email: "novaes@adm.28bpm.local",
    nome: "SuperADM Blindado",
    role: "superadmin",
    isSuperAdmin: true,
    isAdmin: false,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    isCliente: false,
    modulos: ["todos"],
  };

  const sessaoCliente: UserSession = {
    userId: "cli-user-1",
    clienteId: "cli-1",
    email: "cliente@frota.com",
    nome: "Cliente Titular",
    role: "cliente",
    isCliente: true,
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    plano: "pro",
    modulos: ["monitor-gps", "manutencao", "mensalidades"],
  };

  it("1. Operador deve acessar os módulos operacionais no Manual, mas sem ver seções de custos ou fornecedores", () => {
    const modulosOperador = MANUAIS_MODULOS.filter((m) => m.podeAcessar(sessaoOperador));
    const idsModulos = modulosOperador.map((m) => m.id);

    // Operador acessa os módulos principais
    assert.ok(idsModulos.includes("mapa-operacional"));
    assert.ok(idsModulos.includes("estoque-suprimentos"));
    assert.ok(idsModulos.includes("financeiro-caixa"));
    assert.ok(idsModulos.includes("clientes-planos"));

    // Mas não acessa módulos exclusivos de SuperADM
    assert.ok(!idsModulos.includes("rastreador-j16-sms"));

    // No módulo de Estoque, a seção de Importação de NF-e / Fornecedor deve ser restrita
    const modEstoque = modulosOperador.find((m) => m.id === "estoque-suprimentos");
    assert.ok(modEstoque);
    const secoesEstoqueOperador = modEstoque.secoes.filter(
      (s) => !s.podeAcessar || s.podeAcessar(sessaoOperador),
    );
    const idsSecoesEstoque = secoesEstoqueOperador.map((s) => s.id);
    assert.ok(idsSecoesEstoque.includes("catalogo-itens"));
    assert.ok(
      !idsSecoesEstoque.includes("importacao-pdf-nota"),
      "Operador não deve ver seção de notas fiscais ou fornecedores no manual de estoque",
    );

    // No módulo de Financeiro, a seção de DRE deve ser restrita
    const modFinanceiro = modulosOperador.find((m) => m.id === "financeiro-caixa");
    assert.ok(modFinanceiro);
    const secoesFinOperador = modFinanceiro.secoes.filter(
      (s) => !s.podeAcessar || s.podeAcessar(sessaoOperador),
    );
    const idsSecoesFin = secoesFinOperador.map((s) => s.id);
    assert.ok(idsSecoesFin.includes("livro-caixa"));
    assert.ok(
      !idsSecoesFin.includes("dre-relatorios"),
      "Operador não deve ver seção de DRE ou relatórios contábeis no manual financeiro",
    );
  });

  it("2. Manual de Privacidade não deve citar SuperADM e deve registrar visibilidade restrita ao Cliente titular", () => {
    const modMapa = MANUAIS_MODULOS.find((m) => m.id === "mapa-operacional");
    assert.ok(modMapa);

    const secaoPrivacidade = modMapa.secoes.find((s) => s.id === "privacidade-localizacao");
    assert.ok(secaoPrivacidade);

    const textoCompleto = JSON.stringify(secaoPrivacidade);
    assert.ok(
      !textoCompleto.includes("SuperADM"),
      "Texto da seção de privacidade não deve citar SuperADM",
    );
    assert.ok(
      textoCompleto.includes("Cliente titular"),
      "Texto da seção de privacidade deve citar expressamente o Cliente titular",
    );
    assert.ok(
      textoCompleto.includes("apenas o total"),
      "Texto deve indicar que a situação do veículo é ocultada restando apenas o total",
    );
  });

  it("3. Central de Monitoramento: Todos os veículos são monitorados e exibem situação operacional para operadores e clientes", () => {
    const veiculosComPrivacidade: VeiculoGps[] = [
      {
        id: "v-priv-1",
        cliente_id: "cli-1",
        cliente_nome: "Cliente Titular",
        placa: "PRIV001",
        marca_modelo: "Honda Civic",
        odometro: 12000,
        latitude: -22.52,
        longitude: -44.1,
        ultima_atualizacao: new Date().toISOString(),
        ignicao: true,
        bloqueado: false,
        velocidade: 60,
        status_operacional: "em_rota",
        privacidade_localizacao: false,
      },
      {
        id: "v-priv-2",
        cliente_id: "cli-1",
        cliente_nome: "Cliente Titular",
        placa: "PRIV002",
        marca_modelo: "VW Gol",
        odometro: 25000,
        latitude: -22.53,
        longitude: -44.11,
        ultima_atualizacao: new Date().toISOString(),
        ignicao: false,
        bloqueado: false,
        velocidade: 0,
        status_operacional: "estacionado",
        privacidade_localizacao: false,
      },
    ];

    // Para operador: central de monitoramento 24/7 sempre visualiza localização e situação
    assert.strictEqual(
      podeAcessarLocalizacaoVeiculo(sessaoOperador, veiculosComPrivacidade[0]),
      true,
    );

    const agrupadoOperador = agruparVeiculosPorCliente(veiculosComPrivacidade, sessaoOperador);
    assert.strictEqual(agrupadoOperador.length, 1);
    assert.strictEqual(agrupadoOperador[0].veiculos.length, 2);
    assert.strictEqual(agrupadoOperador[0].totalEmRota, 1);
    assert.strictEqual(agrupadoOperador[0].totalEstacionados, 1);

    // Para o cliente titular: pode acessar
    assert.strictEqual(
      podeAcessarLocalizacaoVeiculo(sessaoCliente, veiculosComPrivacidade[0]),
      true,
    );
    const agrupadoCliente = agruparVeiculosPorCliente(veiculosComPrivacidade, sessaoCliente);
    assert.strictEqual(agrupadoCliente[0].totalEmRota, 1);
    assert.strictEqual(agrupadoCliente[0].totalEstacionados, 1);
  });

  it("4. Regra Pétrea: Zero ocorrências do caractere comercial proibido em todo o manual modular", () => {
    const jsonManual = JSON.stringify(MANUAIS_MODULOS);
    // Não deve conter o caractere comercial isolado ou em conjunções
    const matchAmp = jsonManual.match(/\s&\s/g);
    assert.strictEqual(
      matchAmp,
      null,
      "Não deve existir o caractere comercial em textos do manual modular",
    );
  });

  it("5. Catálogo Canônico do Manual deve conter os novos módulos e seções de segurança", () => {
    const idsModulos = MANUAIS_MODULOS.map((m) => m.id);
    assert.ok(idsModulos.includes("frota-gestao"), "Deve conter módulo de frota-gestao");
    assert.ok(idsModulos.includes("motoristas-portal"), "Deve conter módulo de motoristas-portal");
    assert.ok(idsModulos.includes("chat-mensageria"), "Deve conter módulo de chat-mensageria");
    assert.ok(
      idsModulos.includes("revendedores-vendedores"),
      "Deve conter módulo de revendedores-vendedores",
    );
    assert.ok(
      idsModulos.includes("contratos-assinatura"),
      "Deve conter módulo de contratos-assinatura",
    );
    assert.ok(
      idsModulos.includes("auto-monitoramento-whatsapp"),
      "Deve conter módulo de auto-monitoramento-whatsapp",
    );

    const modMapa = MANUAIS_MODULOS.find((m) => m.id === "mapa-operacional");
    assert.ok(modMapa);
    const idsSecoesMapa = modMapa.secoes.map((s) => s.id);
    assert.ok(
      idsSecoesMapa.includes("compartilhamento-ao-vivo"),
      "Deve conter seção de compartilhamento ao vivo",
    );
    assert.ok(
      idsSecoesMapa.includes("ancora-virtual-seguranca"),
      "Deve conter seção de ancora virtual",
    );

    const modInstalacao = MANUAIS_MODULOS.find((m) => m.id === "instalacoes-tecnicas");
    assert.ok(modInstalacao);
    const idsSecoesInstalacao = modInstalacao.secoes.map((s) => s.id);
    assert.ok(
      idsSecoesInstalacao.includes("convite-autocadastro-instalador"),
      "Deve conter seção de convite e auto-cadastro de instalador credenciado",
    );
  });
});
