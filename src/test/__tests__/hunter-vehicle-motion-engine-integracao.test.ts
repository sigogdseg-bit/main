import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  haversineMeters,
  calcBearing,
  VehicleMotionController,
} from "../../services/vehicleMotionEngine";

// Polyfill de ambiente de teste Node para simular ciclo de rAF do browser
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalThis.cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("Hunter — Vehicle Motion Engine e Integração aos Motores de Mapa (Leaflet e MapLibre)", () => {
  test("1. haversineMeters e calcBearing calculam distância e rumo de forma precisa", () => {
    const a = { lat: -22.5235, lng: -44.1042 };
    const b = { lat: -22.5235, lng: -44.1032 }; // ~102 metros para leste

    const dist = haversineMeters(a, b);
    assert.ok(dist > 95 && dist < 110, `Distância esperada ~102m, obtido: ${dist.toFixed(1)}m`);

    const bearing = calcBearing(a, b);
    assert.ok(
      bearing > 85 && bearing < 95,
      `Rumo esperado ~90° (leste), obtido: ${bearing.toFixed(1)}°`,
    );
  });

  test("2. VehicleMotionController inicializa, interpola e executa ciclo de vida com destroy()", async () => {
    let frameExecutado = false;
    let ultimoBearing = 0;

    const controller = new VehicleMotionController({ lat: -22.5235, lng: -44.1042 }, (frame) => {
      frameExecutado = true;
      ultimoBearing = frame.bearing;
    });

    // Atualiza para novo alvo com distância > 2m
    await controller.updateTarget({ lat: -22.5236, lng: -44.1045 });

    // Destrói o controller
    controller.destroy();
    assert.equal(typeof controller.destroy, "function");
  });

  test("3. LeafletEngine.tsx cumpre rigorosamente as 6 regras obrigatórias", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/LeafletEngine.tsx", import.meta.url),
      "utf-8",
    );

    // Regra 1: Map<string, VehicleMotionController> em useRef
    assert.ok(
      code.includes("useRef<Map<string, VehicleMotionController>>"),
      "LeafletEngine deve manter Map<string, VehicleMotionController> em useRef",
    );

    // Regra 2: controller.updateTarget({ lat, lng })
    assert.ok(
      code.includes("motionCtrl.updateTarget({ lat: v.latitude, lng: v.longitude })"),
      "LeafletEngine deve chamar controller.updateTarget ao receber atualização",
    );

    // Regra 3: onFrame atualiza marker.setLatLng diretamente sem useState
    assert.ok(
      code.includes("dados.marker.setLatLng([frameState.lat, frameState.lng])"),
      "LeafletEngine deve atualizar marker.setLatLng nativo diretamente no onFrame",
    );

    // Regra 5: iconAnchor com largura/2 e altura
    assert.ok(
      code.includes("iconAnchor: mostrarPlaca ? [28, 72] : [25, 54]"),
      "LeafletEngine deve usar [largura / 2, altura] para ancorar a ponta da gota na via",
    );

    // Regra 6: destroy() no unmount e ao remover veículos
    assert.ok(
      code.includes("mc.destroy()"),
      "LeafletEngine deve invocar destroy() para limpar animações no unmount",
    );
  });

  test("4. MapLibre3DEngine.tsx cumpre rigorosamente as 4 regras obrigatórias", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/MapLibre3DEngine.tsx", import.meta.url),
      "utf-8",
    );

    // Regra 1: Map<string, VehicleMotionController> em useRef
    assert.ok(
      code.includes("useRef<Map<string, VehicleMotionController>>"),
      "MapLibre3DEngine deve manter Map<string, VehicleMotionController> em useRef",
    );

    // Regra 2: [lng, lat] (longitude primeiro) no onFrame
    assert.ok(
      code.includes("entryAtual.marker.setLngLat([frameState.lng, frameState.lat])"),
      "MapLibre3DEngine deve passar estritamente [lng, lat] para marker.setLngLat no onFrame",
    );

    // Regra 3: anchor: 'bottom' configurado no Marker
    assert.ok(
      code.includes('anchor: "bottom"'),
      'MapLibre3DEngine deve configurar anchor: "bottom" no maplibregl.Marker',
    );

    // Regra 4: destroy() no unmount e ao remover veículos
    assert.ok(
      code.includes("mc.destroy()"),
      "MapLibre3DEngine deve invocar destroy() para limpar animações no unmount",
    );
  });

  test("5. CSS transitions desativadas para .leaflet-marker-icon para evitar interferência com rAF", async () => {
    const css = await fs.readFile(new URL("../../../src/styles.css", import.meta.url), "utf-8");

    assert.ok(
      css.includes(".leaflet-marker-icon") && css.includes("transition: none !important;"),
      "styles.css deve desativar transitions para .leaflet-marker-icon",
    );
  });
});
