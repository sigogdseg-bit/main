import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gerarMarcador3DHtml } from "../../features/monitor-gps/utils/vehicle3dIcons";

describe("Hunter — Layout Canônico de Configurações, Placa Alinhada à Via e Exclusividade de Odômetro (DJR-NEW)", () => {
  test("1. Marcador GPS 3D deve conter a mini-placa Mercosul alinhada ao rumo da via e ao veículo", () => {
    // Modo Veículo
    const htmlVeiculo = gerarMarcador3DHtml({
      placa: "BRA2E19",
      tipo: "carro",
      corStatus: "#10B981",
      anguloRumo: 45,
      isEmRota: true,
      iconeGenerico: false,
    });

    assert.ok(
      htmlVeiculo.includes("transform: rotate(45deg)"),
      "Contêiner ou placa no modo veículo deve girar no ângulo do rumo da via",
    );
    assert.ok(htmlVeiculo.includes("mini-placa-mercosul"), "Deve renderizar a mini-placa Mercosul");
    assert.ok(htmlVeiculo.includes("BRA2E19"), "Deve conter a placa do veículo");

    // Modo Pino Genérico
    const htmlPino = gerarMarcador3DHtml({
      placa: "HNT2026",
      tipo: "carro",
      corStatus: "#10B981",
      anguloRumo: 90,
      isEmRota: true,
      iconeGenerico: true,
    });

    assert.ok(
      htmlPino.includes("hunter-3d-pin-standing"),
      "Pino genérico deve estar em pé na vertical",
    );
    assert.ok(
      htmlPino.includes("mini-placa-mercosul"),
      "Placa Mercosul deve estar presente acima do pino flutuante",
    );
    assert.ok(htmlPino.includes("HNT2026"), "Deve conter a placa do veículo");
  });

  test("2. Sincronizar/Ajustar Odômetro deve estar ausente em VehicleTelemetryDrawer e restrito a Configurações", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );

    // Não deve conter o botão de sincronizar odômetro no menu de ações do drawer
    assert.ok(
      !drawerCode.includes("Sincronizar Odômetro (KM)"),
      "VehicleTelemetryDrawer não deve conter o botão 'Sincronizar Odômetro (KM)'",
    );

    // Não deve conter o botão AJUSTAR na telemetria do drawer
    assert.ok(
      !drawerCode.includes('title="Sincronizar Odômetro com o Painel do Veículo"'),
      "VehicleTelemetryDrawer não deve conter o botão 'AJUSTAR' no Odômetro 3D",
    );

    // Não deve conter o estado modalAjusteOdometroAberto no drawer
    assert.ok(
      !drawerCode.includes("modalAjusteOdometroAberto"),
      "VehicleTelemetryDrawer não deve gerenciar modalAjusteOdometroAberto",
    );

    // Em contrapartida, ConfiguracoesView deve possuir Sincronizar Odômetro
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );
    assert.ok(
      configCode.includes("Sincronizar Odômetro"),
      "ConfiguracoesView deve conter a opção de Sincronizar Odômetro",
    );
    assert.ok(
      configCode.includes("AjusteOdometroModal"),
      "ConfiguracoesView deve renderizar AjusteOdometroModal",
    );
  });

  test("3. Bloco separado 'Exibição por Condição' deve estar ausente e integrado em 'Veículos Visíveis'", async () => {
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );

    // Não deve existir o bloco isolado desnecessário
    assert.ok(
      !configCode.includes("Exibição por Condição"),
      "ConfiguracoesView não deve conter o bloco separado 'Exibição por Condição'",
    );

    // As opções de modo de operação (SuperADM vs Modo Cliente) e veículos devem estar presentes
    assert.ok(
      configCode.includes("Modo de Operação do Sistema") &&
        configCode.includes("Modo SuperADM") &&
        configCode.includes("Modo Cliente"),
      "Deve possuir o card 'Modo de Operação do Sistema' com alternador entre SuperADM e Modo Cliente",
    );
    assert.ok(
      configCode.includes("Voltar para SuperADM"),
      "Deve possuir o botão de desfazer emulação e voltar para SuperADM",
    );
    assert.ok(
      configCode.includes("Veículos Visíveis no Mapa"),
      "Deve possuir o card consolidado 'Veículos Visíveis no Mapa' para visualização do cliente",
    );
    assert.ok(
      configCode.includes("Condição:"),
      "Deve conter o filtro de condição integrado dentro do card de veículos visíveis",
    );
    assert.ok(configCode.includes('"em_rota"'), "Deve conter a opção Em Rota");
    assert.ok(configCode.includes('"estacionado"'), "Deve conter a opção Estacionado");
  });

  test("4. Tela de Configurações deve seguir o padrão de layout de Estoque e Suprimentos no modo claro", async () => {
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );

    // Deve consumir useCardTheme para suporte canônico neumorphic/light mode
    assert.ok(configCode.includes("useCardTheme"), "ConfiguracoesView deve consumir useCardTheme");
    assert.ok(
      configCode.includes("bg-[#eaf0f8]"),
      "ConfiguracoesView deve aplicar o fundo neumórfico padrão de Estoque e Suprimentos",
    );
    assert.ok(
      configCode.includes("shadow-[4px_4px_10px_#c3cfe2]"),
      "ConfiguracoesView deve aplicar sombras suaves de relevo neumórfico",
    );
    assert.ok(
      configCode.includes("rounded-[22px]"),
      "ConfiguracoesView deve utilizar cantos arredondados canônicos nos cards",
    );
  });

  test("5. Perfil Cliente deve ter acesso permitido e visível a Configurações", async () => {
    const { podeAcessarRota, podeAcessarModulo } =
      await import("../../shared/lib/permissoesModulos");
    const sessaoCliente: any = {
      userId: "cli-dario",
      email: "dario@oficial.tec.br",
      nome: "Dario Novaes",
      role: "cliente",
      modulos: [],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
    };

    assert.equal(
      podeAcessarRota(sessaoCliente, "/configuracoes"),
      true,
      "Cliente deve ter permissão de acessar a rota /configuracoes",
    );
    assert.equal(
      podeAcessarModulo(sessaoCliente, "configuracoes"),
      true,
      "Cliente deve ter permissão no módulo configuracoes",
    );
  });

  test("6. Motorista em Configurações: Acesso estrito a Mudar Senha e Sincronizar KM (demais opções inacessíveis)", async () => {
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );

    // Deve determinar se é motorista
    assert.ok(
      configCode.includes("const isMotorista = Boolean(session?.isMotorista);"),
      "ConfiguracoesView deve identificar perfil isMotorista",
    );

    // Seção de Mapa deve estar bloqueada para motorista
    assert.ok(
      configCode.includes("!isMotorista") && configCode.includes("Preferências do Mapa e Filtros"),
      "Seção 'Preferências do Mapa e Filtros' deve ser inacessível para motoristas",
    );

    // Modo Privativo desativado permanentemente na central de monitoramento
    assert.ok(
      !configCode.includes("handleAlternarPrivacidade"),
      "Modo Privativo deve estar desativado na Central de Monitoramento",
    );

    // Sincronizar Odômetro e Alterar Senha devem estar presentes
    assert.ok(
      configCode.includes("Sincronizar Odômetro"),
      "Sincronizar Odômetro deve estar acessível para o motorista",
    );
    assert.ok(
      configCode.includes("Alteração de Senha"),
      "Alteração de Senha deve estar acessível para o motorista",
    );
  });

  test("7. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em ConfiguracoesView.tsx", async () => {
    const conteudo = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );
    const linhas = conteudo.split("\n");
    linhas.forEach((linha, idx) => {
      if (
        linha.includes("&") &&
        !linha.includes("&&") &&
        !linha.includes("&amp;") &&
        !linha.includes("&nbsp;") &&
        !linha.includes("import")
      ) {
        assert.fail(
          `ConfiguracoesView.tsx linha ${idx + 1} contém caractere comercial proibido: ${linha}`,
        );
      }
    });
  });
});
