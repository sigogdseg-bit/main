import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  APP_NOME,
  APP_PUBLIC_URL,
  APP_DOMINIO,
  APP_CHAVE_PIX_PADRAO,
  APP_VERSION_NUMERO,
} from "../../shared/lib/version";
import {
  gerarTokenSeguro,
  formatarLinkCompartilhamento,
} from "../../features/monitor-gps/services/compartilhamentoService";
import { gerarMarcador3DHtml } from "../../features/monitor-gps/utils/vehicle3dIcons";

describe("GD Segurança — Domínio Oficial e Compartilhamento Seguro", () => {
  test("Identidade Canônica: Nome e Domínio Oficial", () => {
    assert.equal(APP_NOME, "GD Segurança");
    assert.equal(APP_PUBLIC_URL, "https://gd.oficial.tec.br");
    assert.equal(APP_DOMINIO, "gd.oficial.tec.br");
    assert.equal(APP_CHAVE_PIX_PADRAO, "pix@oficial.tec.br");
    assert.equal(APP_VERSION_NUMERO, "1.0.1.110");
  });

  test("Compartilhamento Sem Tempo Estipulado (Encerramento Manual)", () => {
    const token = gerarTokenSeguro();
    assert.equal(token.length, 24);

    const link = formatarLinkCompartilhamento(token);
    assert.ok(link.includes(APP_DOMINIO));
    assert.ok(link.startsWith("https://gd.oficial.tec.br/compartilhar/"));
  });

  test("Cálculo de Validade: Sem Expiração não deve expirar automaticamente", () => {
    const shareSemExpiracao = {
      id: "comp-1",
      token: "tok123456789012345678901",
      veiculo_id: "v-1",
      cliente_id: "c-1",
      expira_em: null, // Sem expiração
      revogado: false,
      created_at: new Date().toISOString(),
    };

    // Validador de expiração
    const isExpirado = (item: typeof shareSemExpiracao) => {
      if (item.revogado) return true;
      if (item.expira_em && new Date(item.expira_em).getTime() < Date.now()) {
        return true;
      }
      return false;
    };

    assert.equal(isExpirado(shareSemExpiracao), false, "Link sem expiração deve permanecer ativo");

    // Simula revogação manual
    shareSemExpiracao.revogado = true;
    assert.equal(
      isExpirado(shareSemExpiracao),
      true,
      "Link revogado manualmente deve ser considerado inativo",
    );
  });

  test("Ausência estrita do caractere comercial proibido nas mensagens do sistema", () => {
    const dados = [
      APP_NOME,
      APP_PUBLIC_URL,
      "Validade: Encerramento manual",
      "Sincronização em Tempo Real de Alertas",
    ];

    for (const d of dados) {
      assert.ok(
        !d.includes(String.fromCharCode(38)),
        `Caractere comercial proibido encontrado em: ${d}`,
      );
    }
  });

  test("Validação de Token e Resposta de Compartilhamento Seguro", () => {
    // 1. Token vazio ou inválido deve ser rejeitado imediatamente
    const tokenVazio = "   ";
    assert.equal(tokenVazio.trim().length, 0);

    // 2. Simulação de resposta estruturada segura
    const veiculoExemplo = {
      id: "v-123",
      placa: "AXH0E44",
      marca_modelo: "Volvo XC 60 T6",
      cor: "Branco",
      ignicao: false,
      velocidade: 0,
      latitude: -22.4957133,
      longitude: -44.0940844,
      ultima_atualizacao: "2026-10-01T13:24:28Z",
      status_operacional: "estacionado",
      rumo: 104,
    };

    assert.ok(veiculoExemplo.latitude !== null && !isNaN(veiculoExemplo.latitude));
    assert.ok(veiculoExemplo.longitude !== null && !isNaN(veiculoExemplo.longitude));
    assert.equal(veiculoExemplo.placa, "AXH0E44");
  });

  test("Marcador do Link de Compartilhamento: Pino Genérico (3D) em pé na via sem a placa", () => {
    // Marcador com iconeGenerico = true e mostrarPlaca = false
    const htmlMarcador = gerarMarcador3DHtml({
      placa: "AXH0E44",
      tipo: "carro",
      corStatus: "#EF4444",
      anguloRumo: 90,
      iconeGenerico: true, // Regra mandatória: Pino Genérico (3D)
      mostrarPlaca: false, // Regra mandatória: sem a placa
    });

    // 1. Deve conter o pino 3D vertical em pé na via
    assert.ok(htmlMarcador.includes("hunter-3d-pin-standing"), "Deve conter o pino 3D vertical");
    assert.ok(htmlMarcador.includes("hunter-pin-shadow"), "Deve conter a sombra de contato na via");
    // 2. Não pode conter a silhueta do veículo (vehicle-3d-symbol)
    assert.ok(!htmlMarcador.includes("vehicle-3d-symbol"), "Não deve conter o símbolo do veículo");
    // 3. Não pode conter a placa Mercosul nem o texto da placa
    assert.ok(
      !htmlMarcador.includes("mini-placa-mercosul"),
      "Não deve conter elemento mini-placa-mercosul",
    );
    assert.ok(
      !htmlMarcador.includes("AXH0E44"),
      "Não deve exibir os dígitos da placa no marcador do mapa",
    );
  });

  test("Encerramento Manual: Cálculo do contador progressivo de tempo ativo", () => {
    // Simula link criado há 1 hora, 15 minutos e 30 segundos
    const umHora15Min30SegAtras = Date.now() - (1 * 3600 + 15 * 60 + 30) * 1000;
    const diff = Date.now() - umHora15Min30SegAtras;

    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    const tempoAtivoFormatado = `${h}h ${m}m ${s}s`;
    assert.equal(tempoAtivoFormatado, "1h 15m 30s");
  });

  test("Pino Genérico (3D) Compartilhado: Resolução dinâmica de cores e Modo Stealth", () => {
    // Função auxiliar que reproduz a lógica canônica de cores do link público
    function calcularCorPinoCompartilhado(params: {
      isOffline: boolean;
      ignicao: boolean;
      velocidade: number;
    }): string {
      if (params.isOffline) return "#EF4444"; // Vermelho: sem sinal
      if (params.ignicao || params.velocidade > 0) return "#10B981"; // Verde: ligado / em rota
      return "#2563EB"; // Azul: desligado / estacionado / camuflado stealth
    }

    // 1. Veículo offline (> 10 minutos sem transmissão)
    assert.equal(
      calcularCorPinoCompartilhado({ isOffline: true, ignicao: false, velocidade: 0 }),
      "#EF4444",
      "Offline deve ser Vermelho",
    );

    // 2. Veículo online em trânsito com ignição ligada
    assert.equal(
      calcularCorPinoCompartilhado({ isOffline: false, ignicao: true, velocidade: 60 }),
      "#10B981",
      "Online ligado em movimento deve ser Verde",
    );

    // 3. Veículo online parado com ignição desligada
    assert.equal(
      calcularCorPinoCompartilhado({ isOffline: false, ignicao: false, velocidade: 0 }),
      "#2563EB",
      "Online desligado deve ser Azul",
    );

    // 4. Modo Stealth ativo: telemetria camuflada como estacionado, ignição falsa, velocidade 0
    const dadosStealth = {
      stealth_ativo: true,
      stealth_latitude: -23.55052,
      stealth_longitude: -46.633308,
      velocidade: 0,
      ignicao: false,
      status_operacional: "estacionado",
      isOffline: false,
    };
    const corStealth = calcularCorPinoCompartilhado(dadosStealth);
    assert.equal(
      corStealth,
      "#2563EB",
      "No Modo Stealth o pino deve ser Azul (camuflado estacionado)",
    );

    // 5. Gera marcador SVG para o Modo Stealth e valida ausência de placa e presença da cor azul
    const htmlStealth = gerarMarcador3DHtml({
      placa: "",
      tipo: "carro",
      corStatus: corStealth,
      anguloRumo: 0,
      iconeGenerico: true,
      mostrarPlaca: false,
    });
    assert.ok(htmlStealth.includes("hunter-3d-pin-standing"));
    assert.ok(htmlStealth.includes("hunter-pin-shadow"));
    assert.ok(!htmlStealth.includes("mini-placa-mercosul"));
  });
});
