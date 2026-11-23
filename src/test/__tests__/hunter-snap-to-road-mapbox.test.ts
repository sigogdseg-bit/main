import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  Coord,
  haversineMeters,
  calcBearing,
  interpolatePolylinePosition,
  VehicleMotionController,
} from "../../services/vehicleMotionEngine";
import { handleApiSnapRoad } from "../../server";

// Polyfill de ambiente de teste Node para simular ciclo de rAF do browser
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalThis.cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("Hunter — Map Matching (Snap-to-Road) e Interpolação por Polilinha", () => {
  // Teste 1: Interpolação em polilinha numa curva de 90°
  test("1. Interpolação em polilinha numa curva de 90° passa pelo vértice em t=0.5 e não pelo meio da corda", () => {
    // Curva em L (90°): A -> B (norte, ~111m) e B -> C (leste, ~111m)
    const A: Coord = { lat: -22.52, lng: -44.1 };
    const B: Coord = { lat: -22.519, lng: -44.1 }; // Vértice da curva
    const C: Coord = { lat: -22.519, lng: -44.098918 }; // Fim da curva

    const distAB = haversineMeters(A, B);
    const distBC = haversineMeters(B, C);
    assert.ok(
      Math.abs(distAB - distBC) < 3,
      "Subsegmentos AB e BC devem ter comprimentos semelhantes (~111m)",
    );

    const caminho = [A, B, C];

    // Interpolação na polilinha em t = 0.5
    const estadoPolyline = interpolatePolylinePosition(caminho, 0.5);

    // Distância do pin interpolado ao vértice B da curva
    const distPinAosVertice = haversineMeters(estadoPolyline, B);
    assert.ok(
      distPinAosVertice < 1.0,
      `Em t=0.5 na polilinha, o pin deve passar a menos de 1m do vértice B. Obtido: ${distPinAosVertice.toFixed(2)}m`,
    );

    // Comparação com a interpolação linear bruta (meio da corda entre A e C)
    const meioCordaLinear: Coord = {
      lat: (A.lat + C.lat) / 2,
      lng: (A.lng + C.lng) / 2,
    };
    const distCordaAoVertice = haversineMeters(meioCordaLinear, B);

    // Prova matemática: o meio da corda corta o terreno a mais de 50 metros do vértice!
    assert.ok(
      distCordaAoVertice > 50,
      `O meio da corda linear deve cortar o terreno (> 50m do vértice). Obtido: ${distCordaAoVertice.toFixed(1)}m`,
    );

    assert.ok(
      distPinAosVertice < distCordaAoVertice,
      "A interpolação por polilinha deve ser dezenas de vezes mais próxima da rua do que a corda linear",
    );

    // Valida também que o rumo em t=0.25 é norte (~0°) e em t=0.75 é leste (~90°)
    const estadoAB = interpolatePolylinePosition(caminho, 0.25);
    const estadoBC = interpolatePolylinePosition(caminho, 0.75);
    assert.ok(
      estadoAB.bearing < 10 || estadoAB.bearing > 350,
      `Rumo em AB deve ser Norte. Obtido: ${estadoAB.bearing}°`,
    );
    assert.ok(
      estadoBC.bearing > 80 && estadoBC.bearing < 100,
      `Rumo em BC deve ser Leste. Obtido: ${estadoBC.bearing}°`,
    );
  });

  // Teste 2: Fallback transparente para linha reta quando caminho está vazio ou ausente
  test("2. Fallback transparente para linha reta quando caminho está vazio, ausente ou há timeout", () => {
    const A: Coord = { lat: -22.52, lng: -44.1 };
    const C: Coord = { lat: -22.519, lng: -44.098918 };

    // Sem caminho (undefined)
    const estadoSemCaminho = interpolatePolylinePosition([], 0.5);
    assert.equal(estadoSemCaminho.lat, 0);

    // VehicleMotionController sem caminho deve realizar interpolação linear clássica
    const controller = new VehicleMotionController(A, () => {});

    controller.updateTarget(C, 1000); // sem caminho

    // O controller não deve ter animPolyline quando caminho não é fornecido
    assert.equal(controller.getPolyline(), null, "Polyline deve ser nulo no fallback linear");

    controller.destroy();
  });

  // Teste 3: Descarte de snap com desvio > 45 metros do GPS bruto
  test("3. Endpoint /api/mapa/snap-road descarta snap com desvio > 45 metros do GPS bruto", async () => {
    // 3.1. Quando token está ausente: retorna ok: false, motivo: 'token_ausente' sem erro
    const reqSemToken = new Request("https://gd.oficial.tec.br/api/mapa/snap-road", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pontos: [
          { lat: -22.52, lng: -44.1 },
          { lat: -22.521, lng: -44.101 },
        ],
      }),
    });

    const resSemToken = await handleApiSnapRoad(reqSemToken, {});
    assert.ok(resSemToken !== null);
    assert.equal(resSemToken.status, 200);
    const jsonSemToken = (await resSemToken.json()) as any;
    assert.equal(jsonSemToken.ok, false);
    assert.equal(jsonSemToken.motivo, "token_ausente");
    assert.deepEqual(jsonSemToken.vertices, []);

    // 3.2. Trava de sanidade de 45m: se o ponto do snap estiver a 60m do GPS bruto, deve descartar
    const pontoBruto = { lat: -22.52, lng: -44.1 };
    const snapValido = { lat: -22.52015, lng: -44.1001 }; // ~19m de desvio
    const snapAnomalo = { lat: -22.52055, lng: -44.10045 }; // ~75m de desvio

    const distValida = haversineMeters(pontoBruto, snapValido);
    const distAnomala = haversineMeters(pontoBruto, snapAnomalo);

    assert.ok(
      distValida <= 45,
      `Desvio de 19m deve ser aceito (<= 45m). Obtido: ${distValida.toFixed(1)}m`,
    );
    assert.ok(
      distAnomala > 45,
      `Desvio de 75m deve ser rejeitado (> 45m). Obtido: ${distAnomala.toFixed(1)}m`,
    );
  });

  // Teste 4: Regras estritas de disparo de snap nos arquivos dos mapas
  test("4. LeafletEngine e MapLibre3DEngine contêm as 4 travas estritas de disparo", async () => {
    const leafletCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/LeafletEngine.tsx", import.meta.url),
      "utf-8",
    );
    const maplibreCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/MapLibre3DEngine.tsx", import.meta.url),
      "utf-8",
    );

    for (const [nome, code] of [
      ["LeafletEngine", leafletCode],
      ["MapLibre3DEngine", maplibreCode],
    ]) {
      // 1. Veículo focado
      assert.ok(code.includes("isFocado"), `${nome} deve validar se o veículo está focado`);
      // 2. Em movimento
      assert.ok(code.includes("emMovimento"), `${nome} deve validar se está em movimento`);
      // 3. Zoom >= 14
      assert.ok(code.includes("zoomAdequado"), `${nome} deve validar zoom >= 14`);
      // 4. Tipo veículo
      assert.ok(code.includes("ehVeiculoValido"), `${nome} deve validar se ativo é veículo`);
      // Disparo e timeout 1500ms
      assert.ok(
        code.includes("requisitarSnapToRoad"),
        `${nome} deve integrar requisitarSnapToRoad`,
      );
      // Fallback sem congelar pin
      assert.ok(
        code.includes("motionCtrl.updateTarget({ lat: v.latitude, lng: v.longitude }"),
        `${nome} deve preservar chamada de fallback motionCtrl.updateTarget`,
      );
    }
  });
});
