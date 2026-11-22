import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  gerarMarcador3DHtml,
  gerarMiniPlacaSoloHtml,
  gerarPinoFlutuanteHtml,
  calcularAnguloPlacaVia,
  deveExibirPlacaNoMapa,
} from "../../features/monitor-gps/utils/vehicle3dIcons";

describe("Hunter — Pino 3D Flutuante Reto e Proteção no Local de Origem (DJR-NEW)", () => {
  test("1. Pino 3D deve conter classe hunter-pin-floating e hunter-3d-pin-standing, perfeitamente vertical e reto", () => {
    // Com placa ativa (mais de 1 veículo ou com placa)
    const htmlComPlaca = gerarMarcador3DHtml({
      placa: "BRA2E19",
      corStatus: "#2563EB",
      anguloRumo: 90,
      iconeGenerico: true,
      mostrarPlaca: true,
    });

    assert.ok(
      htmlComPlaca.includes("hunter-pin-floating"),
      "Deve conter a classe de levitação hunter-pin-floating",
    );
    assert.ok(
      htmlComPlaca.includes("hunter-3d-pin-standing"),
      "Deve conter a classe hunter-3d-pin-standing",
    );
    assert.ok(
      htmlComPlaca.includes("hunter-pin-shadow"),
      "Deve conter a sombra de contato no solo hunter-pin-shadow",
    );
    assert.ok(htmlComPlaca.includes("mini-placa-mercosul"), "Deve conter a mini placa Mercosul");
    assert.ok(htmlComPlaca.includes("BRA2E19"), "Deve conter a placa");

    // Sem placa (apenas um veículo ou desativado em configurações)
    const htmlSemPlaca = gerarMarcador3DHtml({
      placa: "BRA2E19",
      corStatus: "#2563EB",
      anguloRumo: 90,
      iconeGenerico: true,
      mostrarPlaca: false,
    });

    assert.ok(
      !htmlSemPlaca.includes("mini-placa-mercosul"),
      "Não deve renderizar a placa quando mostrarPlaca for false",
    );
    assert.ok(
      htmlSemPlaca.includes("hunter-pin-floating"),
      "Pino continua flutuando perfeitamente",
    );

    // Quando em rota / em movimento: o pino NÃO flutua (fica assentado no solo com sombra fixa)
    const htmlEmRota = gerarMarcador3DHtml({
      placa: "BRA2E19",
      corStatus: "#10B981",
      anguloRumo: 90,
      iconeGenerico: true,
      mostrarPlaca: true,
      isEmRota: true,
    });

    assert.ok(
      !htmlEmRota.includes("hunter-pin-floating"),
      "Em movimento o pino NÃO deve ter a classe hunter-pin-floating",
    );
    assert.ok(
      htmlEmRota.includes("hunter-pin-shadow-fixed"),
      "Em movimento o pino deve ter a sombra fixa no asfalto",
    );
  });

  test("2. Funções auxiliares 3D: gerarMiniPlacaSoloHtml e gerarPinoFlutuanteHtml", () => {
    const htmlPlaca = gerarMiniPlacaSoloHtml({
      placa: "BRA2E19",
      anguloRumo: 90,
      isSelected: true,
    });

    assert.ok(htmlPlaca.includes("BRA2E19"), "Mini-placa deve conter os caracteres da placa");
    assert.ok(
      htmlPlaca.includes("transform: rotate(0deg)"),
      "Placa para via horizontal tem ângulo 0deg",
    );

    const htmlPinoFlutuante = gerarPinoFlutuanteHtml({
      corStatus: "#10B981",
      isSelected: true,
      cleanId: "BRA2E19",
    });

    assert.ok(
      htmlPinoFlutuante.includes("hunter-pin-floating"),
      "Pino flutuante deve conter a animação hunter-pin-floating",
    );
    assert.ok(
      htmlPinoFlutuante.includes("hunter-pin-shadow"),
      "Pino flutuante deve conter a sombra de levitação",
    );
  });

  test("3. Proteção e Limites deve estar no menu de ações do VehicleTelemetryDrawer e ausente de ConfiguracoesView", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );

    // Deve estar presente no VehicleTelemetryDrawer
    assert.ok(
      drawerCode.includes("Proteção e Limites"),
      "VehicleTelemetryDrawer deve conter o botão 'Proteção e Limites' no menu de módulos e funções",
    );
    assert.ok(
      drawerCode.includes("ConfiguracaoProtecaoModal"),
      "VehicleTelemetryDrawer deve importar e renderizar ConfiguracaoProtecaoModal",
    );

    // Deve estar ausente de ConfiguracoesView
    assert.ok(
      !configCode.includes("Proteções e Limites"),
      "ConfiguracoesView não deve conter 'Proteções e Limites'",
    );
    assert.ok(
      !configCode.includes("ConfiguracaoProtecaoModal"),
      "ConfiguracoesView não deve mais renderizar ConfiguracaoProtecaoModal",
    );
  });

  test("4. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );
    assert.ok(
      !drawerCode.includes("Proteção & Limites") && !drawerCode.includes("Proteções & Limites"),
      "Proibido usar o caractere comercial proibido em rótulos",
    );
  });

  test("5. Regra inteligente de exibição da placa e preferência de configurações", () => {
    const memoryStorage = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStorage.set(k, v),
      removeItem: (k: string) => memoryStorage.delete(k),
    };
    (globalThis as any).window = {};
    (globalThis as any).localStorage = mockStorage;

    // Modo "auto": apenas se > 1 veículo
    mockStorage.removeItem("@hunter_modo_placa_mapa");
    assert.equal(deveExibirPlacaNoMapa(1), false, "1 veículo no modo auto não deve exibir placa");
    assert.equal(deveExibirPlacaNoMapa(2), true, "2 veículos no modo auto deve exibir placa");

    // Modo "sem_placa"
    mockStorage.setItem("@hunter_modo_placa_mapa", "sem_placa");
    assert.equal(deveExibirPlacaNoMapa(2), false, "Modo sem_placa nunca exibe placa");

    // Modo "com_placa"
    mockStorage.setItem("@hunter_modo_placa_mapa", "com_placa");
    assert.equal(deveExibirPlacaNoMapa(1), true, "Modo com_placa sempre exibe placa");

    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  test("6. ConfiguracoesView deve permitir escolher entre Com Placa e Sem Placa", async () => {
    const configCode = await fs.readFile(
      new URL("../../../src/features/configuracoes/ConfiguracoesView.tsx", import.meta.url),
      "utf-8",
    );
    assert.ok(
      configCode.includes("Identificação por Placa no Mapa"),
      "ConfiguracoesView deve conter seção de Identificação por Placa no Mapa",
    );
    assert.ok(
      configCode.includes("Com Placa") && configCode.includes("Sem Placa"),
      "ConfiguracoesView deve conter as opções 'Com Placa' e 'Sem Placa'",
    );
  });

  test("7. VehicleTelemetryDrawer deve renderizar os modais unificados em ambos os modos (recolhido e expandido Cockpit 3D)", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );
    assert.ok(
      drawerCode.includes("renderModais"),
      "VehicleTelemetryDrawer deve declarar e utilizar renderModais",
    );
    const matches = drawerCode.match(/\{renderModais\(\)\}/g);
    assert.equal(
      matches?.length,
      2,
      "renderModais() deve ser invocado exatamente 2 vezes: no modo recolhido e no modo Cockpit 3D expandido",
    );
  });
});
