import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  LISTA_TIPOS_VEICULO,
  getGlossyPinWithVehicleSvg,
  getGlossyPin3DSvg,
  obterPaletaGlossyPin,
  obterCorStatusVeiculo,
  gerarMarcador3DHtml,
} from "../../features/monitor-gps/utils/vehicle3dIcons";

describe("Hunter — Pin 3D Volumétrico com Tipo de Veículo no Interior (DJR-NEW)", () => {
  test("1. Deve renderizar o Pin 3D com a miniatura para todos os 13 modelos de veículos disponíveis", () => {
    assert.equal(
      LISTA_TIPOS_VEICULO.length,
      13,
      "Sistema deve conter exatamente 13 modelos de veículos disponíveis",
    );

    for (const { id: tipo } of LISTA_TIPOS_VEICULO) {
      const svg = getGlossyPinWithVehicleSvg(tipo, "#10B981", `test-${tipo}`);
      assert.ok(svg.length > 200, `Pin 3D para ${tipo} deve conter SVG volumétrico estruturado`);
      assert.ok(
        svg.includes("hunter-pin-vehicle-model"),
        `Pin 3D para ${tipo} deve conter a miniatura 3D na vitrine`,
      );
      assert.ok(
        svg.includes('<ellipse cx="32" cy="60"'),
        `Pin 3D para ${tipo} deve conter o ponto de contato do pino no solo da via`,
      );
    }
  });

  test("2. Deve aplicar a paleta correta para os 4 estados operacionais canônicos do sistema", () => {
    // Verde: Em Rota
    const paletaVerde = obterPaletaGlossyPin("#10B981");
    assert.equal(paletaVerde.gradCentro, "#10B981");

    // Azul: Parado com Ignição Ligada
    const paletaAzul = obterPaletaGlossyPin("#38BDF8");
    assert.equal(paletaAzul.gradCentro, "#2563EB");

    // Âmbar / Ouro: Parado com Ignição Ligada (Calibrado para amarelo-ouro #FBBF24 inconfundível)
    const paletaAmbar = obterPaletaGlossyPin("#F97316");
    assert.equal(paletaAmbar.gradCentro, "#FBBF24");

    // Vermelho: Alerta / Bloqueado / Offline
    const paletaVermelho = obterPaletaGlossyPin("#EF4444");
    assert.equal(paletaVermelho.gradCentro, "#DC2626");

    // Cinza Slate: Desconectado / Inativo prolongado (NÃO deve ser vermelho)
    const paletaCinza = obterPaletaGlossyPin("#64748B");
    assert.equal(paletaCinza.gradCentro, "#64748B");
  });

  test("2.1. Deve calcular a cor canônica conforme o status operacional do veículo", () => {
    // Veículo estacionado com chave desligada deve ser Azul (#0284C7)
    assert.equal(
      obterCorStatusVeiculo({ velocidade: 0, ignicao: false, status_operacional: "estacionado" }),
      "#0284C7",
    );

    // Veículo em trânsito com ignição ligada deve ser Verde (#10B981)
    assert.equal(
      obterCorStatusVeiculo({ velocidade: 45, ignicao: true, status_operacional: "em_rota" }),
      "#10B981",
    );

    // Veículo parado com ignição ligada deve ser Âmbar (#F59E0B)
    assert.equal(
      obterCorStatusVeiculo({ velocidade: 0, ignicao: true, status_operacional: "parado_ligado" }),
      "#F59E0B",
    );

    // Veículo bloqueado deve ser Vermelho (#EF4444)
    assert.equal(
      obterCorStatusVeiculo({ bloqueado: true, status_operacional: "bloqueado" }),
      "#EF4444",
    );

    // Veículo com alerta deve ser Vermelho (#EF4444)
    assert.equal(obterCorStatusVeiculo({ alerta_acidente: true }), "#EF4444");
  });

  test("3. Marcador 3D padrão do mapa deve renderizar o Pino 3D com o tipo do veículo e mini-placa Mercosul", () => {
    const html = gerarMarcador3DHtml({
      placa: "KVP6G73",
      tipo: "camionete",
      corStatus: "#F97316",
      anguloRumo: 180,
      isEmRota: false,
      iconeGenerico: false,
    });

    assert.ok(
      html.includes("vpin-KVP6G73"),
      "Marcador 3D no modo veículo deve renderizar o Pin 3D com o veículo",
    );
    assert.ok(html.includes("KVP6G73"), "Deve conter a placa do veículo");
    assert.ok(
      html.includes("mini-placa-mercosul"),
      "Deve conter a mini-placa Mercosul posicionada acima do pino",
    );
    assert.ok(
      html.includes("hunter-3d-pin-standing"),
      "Deve manter o pino em pé na vertical com a ponta tocando a via",
    );
  });

  test("4. Opção Genérica (3D) deve manter o Pino 3D clássico sem veículo", () => {
    const htmlGenerico = gerarMarcador3DHtml({
      placa: "KVP6G73",
      tipo: "camionete",
      corStatus: "#EF4444",
      iconeGenerico: true,
    });

    assert.ok(
      htmlGenerico.includes("pin-KVP6G73"),
      "Modo genérico deve renderizar o pino clássico com id pin-",
    );
    assert.ok(!htmlGenerico.includes("hunter-pin-vehicle-model"));
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em textos", async () => {
    const iconCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/utils/vehicle3dIcons.ts", import.meta.url),
      "utf8",
    );
    // Verifica que não há o caractere isolado em textos ou comentários (excluindo operador lógico &&)
    const linhas = iconCode.split("\n");
    const violacoes = linhas.filter(
      (l) => !l.includes("&&") && (l.includes(" & ") || l.includes(" &") || l.includes("& ")),
    );
    assert.equal(
      violacoes.length,
      0,
      `Proibido o uso do caractere comercial nas linhas: ${violacoes.join(" | ")}`,
    );
  });
});
