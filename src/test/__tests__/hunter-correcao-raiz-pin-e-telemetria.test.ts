import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getGlossyPinWithVehicleSvg,
  gerarMarcador3DHtml,
  obterCorStatusVeiculo,
} from "../../features/monitor-gps/utils/vehicle3dIcons.js";
import {
  aplicarPatchTempoRealNaLista,
  calcularStatusOperacionalFrontend,
  inicioParadaPorVeiculo,
} from "../../features/monitor-gps/hooks/useGpsRealtime.js";
import {
  VehicleMotionController,
  haversineMeters,
  calcBearing,
} from "../../services/vehicleMotionEngine.js";
import type { VeiculoGps } from "../../features/monitor-gps/types.js";

// Polyfill de animação para simulação em ambiente Node.js
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalThis.cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("Hunter — Correção de Causa Raiz: Pino, Coordenadas e Telemetria", () => {
  beforeEach(() => {
    inicioParadaPorVeiculo.clear();
  });

  describe("1. Âncora Geométrica do Pino e Ausência de Flutuação CSS", () => {
    test("SVG do pino possui viewBox='0 0 64 60.5' com ponta física em y=60.5 (0px de erro)", () => {
      const svg = getGlossyPinWithVehicleSvg("carro", "#10B981", "teste-pin");
      assert.ok(svg.includes('viewBox="0 0 64 60.5"'), "Deve conter viewBox='0 0 64 60.5'");
      assert.ok(svg.includes("M 32 60.5"), "Ponta física deve estar em y=60.5");
      // Chanfro 3D não deve ultrapassar y=60.5
      assert.ok(svg.includes('transform="translate(1.5, 0)"'), "Chanfro não deve ter translação Y");
    });

    test("gerarMarcador3DHtml não contém a classe hunter-pin-floating em nenhum estado", () => {
      const htmlEmRota = gerarMarcador3DHtml({
        placa: "RFO6I08",
        tipo: "carro",
        corStatus: "#10B981",
        isEmRota: true,
        mostrarPlaca: true,
      });
      const htmlParado = gerarMarcador3DHtml({
        placa: "RFO6I08",
        tipo: "carro",
        corStatus: "#F59E0B",
        isEmRota: false,
        mostrarPlaca: true,
      });

      assert.ok(
        !htmlEmRota.includes("hunter-pin-floating"),
        "Em rota não deve ter hunter-pin-floating",
      );
      assert.ok(
        !htmlParado.includes("hunter-pin-floating"),
        "Parado não deve ter hunter-pin-floating",
      );
    });

    test("Sombra de contato possui position: absolute na base para não empurrar a altura da gota", () => {
      const html = gerarMarcador3DHtml({
        placa: "RFO6I08",
        tipo: "carro",
        corStatus: "#10B981",
        isEmRota: true,
        mostrarPlaca: true,
      });

      assert.ok(html.includes("position: absolute"), "Sombra deve ter position: absolute");
      assert.ok(html.includes("bottom: 0px"), "Sombra deve estar cravada no bottom: 0px");
      assert.ok(html.includes("hunter-pin-shadow-fixed"), "Deve usar sombra fixa");
    });

    test("Dimensões milimétricas: Placa de 18px (+2px margem) + Pino de 50px = 70px de altura total", () => {
      const html = gerarMarcador3DHtml({
        placa: "RFO6I08",
        tipo: "carro",
        corStatus: "#10B981",
        isEmRota: true,
        mostrarPlaca: true,
      });

      assert.ok(html.includes("height: 18px"), "Placa deve ter height: 18px");
      assert.ok(html.includes("margin-bottom: 2px"), "Margem da placa deve ser 2px");
      assert.ok(html.includes("height: 50px"), "Pino deve ter height: 50px");
    });
  });

  describe("2. Histerese de 120s para Status Operacional e Cor do Ícone", () => {
    test("Veículo que acabou de parar no semáforo (<120s com ignição ligada) mantém status 'em_rota' (Verde)", () => {
      const veiculoId = "veiculo-teste-1";

      // 1. Primeiro pulso: parou no semáforo (vel 0, ignição true)
      const status1 = calcularStatusOperacionalFrontend(veiculoId, true, 0, false);
      assert.equal(status1, "em_rota");

      // Cor correspondente deve ser Verde
      const cor1 = obterCorStatusVeiculo({
        velocidade: 0,
        ignicao: true,
        status_operacional: status1,
      });
      assert.equal(cor1, "#10B981");
    });

    test("Veículo parado com ignição ligada por mais de 120s ininterruptos transiciona para 'parado_ligado' (Amarelo)", () => {
      const veiculoId = "veiculo-teste-2";

      // Simula início da parada há 125 segundos atrás
      inicioParadaPorVeiculo.set(veiculoId, Date.now() - 125000);

      const status2 = calcularStatusOperacionalFrontend(veiculoId, true, 0, false);
      assert.equal(status2, "parado_ligado");

      // Cor correspondente deve ser Âmbar/Amarelo
      const cor2 = obterCorStatusVeiculo({
        velocidade: 0,
        ignicao: true,
        status_operacional: status2,
      });
      assert.equal(cor2, "#F59E0B");
    });

    test("Deslocamento > 3 km/h reseta cronômetro e mantém 'em_rota' (Verde)", () => {
      const veiculoId = "veiculo-teste-3";
      inicioParadaPorVeiculo.set(veiculoId, Date.now() - 200000);

      const status = calcularStatusOperacionalFrontend(veiculoId, true, 15, false);
      assert.equal(status, "em_rota");
      assert.equal(inicioParadaPorVeiculo.has(veiculoId), false);

      const cor = obterCorStatusVeiculo({
        velocidade: 15,
        ignicao: true,
        status_operacional: status,
      });
      assert.equal(cor, "#10B981");
    });

    test("Ignição desligada transiciona imediatamente para 'estacionado' (Azul) e limpa cronômetro", () => {
      const veiculoId = "veiculo-teste-4";
      inicioParadaPorVeiculo.set(veiculoId, Date.now() - 60000);

      const status = calcularStatusOperacionalFrontend(veiculoId, false, 0, false);
      assert.equal(status, "estacionado");
      assert.equal(inicioParadaPorVeiculo.has(veiculoId), false);

      const cor = obterCorStatusVeiculo({
        velocidade: 0,
        ignicao: false,
        status_operacional: status,
      });
      assert.equal(cor, "#0284C7");
    });

    test("Bloqueio ou alerta de acidente sempre sobrepõe qualquer estado com Vermelho", () => {
      const corBloqueado = obterCorStatusVeiculo({
        velocidade: 20,
        ignicao: true,
        bloqueado: true,
        status_operacional: "bloqueado",
      });
      assert.equal(corBloqueado, "#EF4444");

      const corAcidente = obterCorStatusVeiculo({
        velocidade: 0,
        ignicao: false,
        alerta_acidente: true,
      });
      assert.equal(corAcidente, "#EF4444");
    });
  });

  describe("3. Aplicação do Patch em Tempo Real na Lista", () => {
    test("aplica patch de telemetria preservando histerese e atualizando dados", () => {
      const listaOriginal: VeiculoGps[] = [
        {
          id: "v-1",
          cliente_id: "c-1",
          marca_modelo: "Toyota Corolla",
          odometro: 12500,
          placa: "RFO6I08",
          tipo_veiculo: "carro",
          latitude: -22.512345,
          longitude: -44.101234,
          velocidade: 35,
          ignicao: true,
          status_operacional: "em_rota",
          bloqueado: false,
          ultima_atualizacao: "2026-11-24T12:00:00Z",
        },
      ];

      const { lista, alterado } = aplicarPatchTempoRealNaLista(listaOriginal, {
        veiculoId: "v-1",
        latitude: -22.512399,
        longitude: -44.101288,
        velocidade: 0,
        ignicao: true,
        ultima_atualizacao: "2026-11-24T12:00:10Z",
      });

      assert.equal(alterado, true);
      assert.equal(lista[0].latitude, -22.512399);
      assert.equal(lista[0].velocidade, 0);
      // Semáforo recente (<120s): deve manter 'em_rota'
      assert.equal(lista[0].status_operacional, "em_rota");
    });
  });

  describe("4. VehicleMotionController — Interpolação Linear 60fps sem Dependência Externa", () => {
    test("calcula distância haversine e rumo angular corretamente", () => {
      const p1 = { lat: -22.512, lng: -44.101 };
      const p2 = { lat: -22.513, lng: -44.102 };

      const dist = haversineMeters(p1, p2);
      assert.ok(dist > 100 && dist < 200, `Distância calculada: ${dist}`);

      const bearing = calcBearing(p1, p2);
      assert.ok(bearing >= 0 && bearing <= 360, `Rumo calculado: ${bearing}`);
    });

    test("VehicleMotionController inicializa na posição correta e atualiza alvo", () => {
      let ultimosFrames: any[] = [];
      const motion = new VehicleMotionController(
        { lat: -22.512, lng: -44.101 },
        (frame) => {
          ultimosFrames.push(frame);
        },
        90,
      );

      const pos = motion.getPosition();
      assert.equal(pos.lat, -22.512);
      assert.equal(pos.lng, -44.101);
      assert.equal(motion.getBearing(), 90);

      // Atualiza alvo
      motion.updateTarget({ lat: -22.513, lng: -44.102 }, Date.now());
      assert.ok(motion.getDurationMs() >= 2000, "Duração deve ser >= 2000ms");

      motion.destroy();
    });
  });
});
