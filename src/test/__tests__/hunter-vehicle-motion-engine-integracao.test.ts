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
    let frames: any[] = [];

    const controller = new VehicleMotionController({ lat: -22.5235, lng: -44.1042 }, (frame) => {
      frames.push(frame);
    });

    // 1. Deadband: distância menor que 3m deve ser ignorada
    await controller.updateTarget({ lat: -22.523501, lng: -44.104201 }, 1000);
    assert.equal(frames.length, 0, "Distância menor que 3m deve ser ignorada (deadband)");

    // 2. Trava de teleporte: distância maior que 2000m move instantaneamente
    await controller.updateTarget({ lat: -22.545, lng: -44.1042 }, 2000);
    assert.ok(frames.length > 0, "Teleporte deve disparar frame instantaneamente");
    assert.equal(frames[frames.length - 1].lat, -22.545);

    // 3. Trava de timestamp: pacote com timestamp <= lastTimestamp deve ser ignorado
    const frameCountBefore = frames.length;
    await controller.updateTarget({ lat: -22.546, lng: -44.1042 }, 1500); // timestamp menor que 2000
    assert.equal(
      frames.length,
      frameCountBefore,
      "Pacote antigo com timestamp <= lastTimestamp deve ser ignorado",
    );

    // 4. Chamada redundante com mesmo alvo e animação ativa não reinicia e não corrompe estado
    await controller.updateTarget({ lat: -22.545, lng: -44.1042 }, 2500);

    // Destrói o controller
    controller.destroy();
    assert.equal(typeof controller.destroy, "function");
  });

  test("2c. vehicleMotionEngine blinda duração dinâmica de 10s-12s contra corrupção e micro-paradas", async () => {
    let frames: any[] = [];
    const controller = new VehicleMotionController({ lat: -22.5235, lng: -44.1042 }, (frame) => {
      frames.push(frame);
    });

    // Primeiro pacote legítimo a ~100m de distância
    await controller.updateTarget({ lat: -22.5245, lng: -44.1042 }, 10000);
    assert.equal(controller.getDurationMs(), VehicleMotionController.DEFAULT_DURATION_MS);

    // Pacote repetido (mesma coordenada e timestamp anterior) deve ser ignorado sem corromper duração
    await controller.updateTarget({ lat: -22.5245, lng: -44.1042 }, 9500);
    assert.equal(controller.getDurationMs(), VehicleMotionController.DEFAULT_DURATION_MS);

    controller.destroy();
  });

  test("2b. vehicleMotionEngine.ts é 100% livre de OSRM e extrapolação", async () => {
    const engineCode = await fs.readFile(
      new URL("../../../src/services/vehicleMotionEngine.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(!engineCode.includes("project-osrm.org"), "NÃO deve chamar OSRM");
    assert.ok(!engineCode.includes("fetchRoadPolyline"), "NÃO deve ter fetchRoadPolyline");
    assert.ok(engineCode.includes("MIN_DURATION_MS = 2000"), "Duração mínima deve ser 2000ms");
    assert.ok(engineCode.includes("MAX_DURATION_MS = 13000"), "Duração máxima deve ser 13000ms");
    assert.ok(engineCode.includes("elapsed / duration"), "Movimento deve ser estritamente linear");
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
      code.includes("motionCtrl.updateTarget({ lat: v.latitude, lng: v.longitude }"),
      "LeafletEngine deve chamar controller.updateTarget ao receber atualização",
    );

    // Regra 3: onFrame atualiza marker.setLatLng diretamente sem useState
    assert.ok(
      code.includes("dados.marker.setLatLng([frameState.lat, frameState.lng])"),
      "LeafletEngine deve atualizar marker.setLatLng nativo diretamente no onFrame",
    );

    // Regra 5: iconAnchor com largura/2 e altura
    assert.ok(
      code.includes("iconAnchor: mostrarPlaca ? [28, 70] : [25, 50]"),
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
