import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { VehicleMotionController, haversineMeters } from "../../services/vehicleMotionEngine";

// Polyfill de ambiente Node para requestAnimationFrame controlado em testes
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16);
}
if (typeof globalThis.cancelAnimationFrame === "undefined") {
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

describe("Hunter — Zoom Automático no Mapa Operacional e Proteção do Controle Manual", () => {
  test("1. LeafletEngine.tsx implementa zoom 17 na seleção, fitBounds na Toda Frota e proteção de zoom manual", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/LeafletEngine.tsx", import.meta.url),
      "utf-8",
    );

    // 1. Modo Toda Frota executa fitBounds com padding e limpa selectedIdAnteriorRef
    assert.ok(
      code.includes("selectedIdAnteriorRef.current = null"),
      "Modo Toda Frota deve resetar selectedIdAnteriorRef para permitir re-zoom automático na próxima seleção",
    );
    assert.ok(
      code.includes("map.fitBounds(bounds, { padding: [80, 80]"),
      "Modo Toda Frota deve executar fitBounds com padding confortável de 80px",
    );

    // 2. Seleção de veículo executa flyTo aproximando automaticamente para zoom 17
    assert.ok(
      code.includes("const targetZoom = Math.min(17, maxZ)"),
      "LeafletEngine deve calcular zoom automático 17 respeitando maxZoom do mapa",
    );
    assert.ok(
      code.includes("mapInstanceRef.current.flyTo([pos.lat, pos.lng], targetZoom"),
      "centralizarVeiculo no LeafletEngine deve executar flyTo com targetZoom 17",
    );

    // 3. Proteção do controle manual: pacotes GPS do mesmo veículo não forçam o zoom de volta
    assert.ok(
      code.includes("if (selectedIdAnteriorRef.current === veiculoSelecionado.id)"),
      "useEffect deve ignorar re-centralização se for o mesmo veículo selecionado",
    );
    assert.ok(
      code.includes("map.panTo([frameState.lat, frameState.lng], { animate: false })"),
      "onFrame deve usar panTo estritamente com animate: false para preservar o zoom manual do operador",
    );
  });

  test("2. MapLibre3DEngine.tsx implementa zoom 17.5 na seleção, fitBounds na Toda Frota e proteção de zoom manual", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/MapLibre3DEngine.tsx", import.meta.url),
      "utf-8",
    );

    // 1. Modo Toda Frota executa fitBounds com padding e limpa selectedIdAnteriorRef
    assert.ok(
      code.includes("selectedIdAnteriorRef.current = null"),
      "Modo Toda Frota no MapLibre deve resetar selectedIdAnteriorRef",
    );
    assert.ok(
      code.includes("padding: 80"),
      "Modo Toda Frota no MapLibre deve executar fitBounds com padding 80",
    );

    // 2. Seleção de veículo executa flyTo aproximando automaticamente para zoom 17.5
    assert.ok(
      code.includes("const targetZoom = Math.min(17.5, maxZ)"),
      "MapLibre3DEngine deve calcular zoom automático 17.5 respeitando maxZoom do mapa",
    );
    assert.ok(
      code.includes("zoom: targetZoom"),
      "centralizarVeiculo no MapLibre3DEngine deve executar flyTo com zoom 17.5",
    );

    // 3. Proteção do controle manual: pacotes GPS subsequentes preservam zoom manual via jumpTo
    assert.ok(
      code.includes("map.jumpTo({ center: [frameState.lng, frameState.lat] })"),
      "onFrame no MapLibre deve usar jumpTo sem alterar zoom ou pitch para proteger controle manual",
    );
  });

  test("3. GpsMonitorView.tsx desativa modo Toda Frota na seleção e centraliza ao sair da Toda Frota", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // 1. Ao selecionar veículo, sai do modo Toda Frota
    assert.ok(
      code.includes("setModoVisaoFrota(false)"),
      "GpsMonitorView deve desativar modoVisaoFrota ao selecionar veículo",
    );

    // 2. Ao sair do modo Toda Frota pelo botão de alternância, aciona centralização com zoom automático
    assert.ok(
      code.includes("leafletRef.current?.centralizarVeiculo(alvo)"),
      "Ao alternar para modo foco individual, deve centralizar veículo com zoom automático",
    );
  });
});

describe("Hunter — Fila Curta de Waypoints e Eliminação de Corte de Curvas (VehicleMotionController)", () => {
  test("1. Enfileiramento de novo ponto em curva e garantia de passagem pelo vértice intermediário", () => {
    const pontoA = { lat: -22.5235, lng: -44.1042 };
    const verticeB = { lat: -22.5235, lng: -44.1 }; // Esquina (leste)
    const pontoC = { lat: -22.52, lng: -44.1 }; // Após a curva (norte)

    const frames: any[] = [];
    const controller = new VehicleMotionController(pontoA, (f) => frames.push(f));

    // 1. Inicia movimento de A em direção ao vértice da esquina B
    controller.updateTarget(verticeB, 10000);
    assert.equal(controller.isAnimating(), true, "Deve iniciar animação em direção a B");
    assert.equal(controller.getQueueLength(), 0, "Fila deve iniciar vazia");

    // 2. Pacote de curva C chega aos 3 segundos enquanto ainda está no meio do trajeto para B
    controller.updateTarget(pontoC, 13000);

    // Vértice B NÃO é descartado: ponto C deve ser enfileirado na fila curta
    assert.equal(
      controller.getQueueLength(),
      1,
      "Ponto C deve ser enfileirado na fila curta de waypoints",
    );
    const waypoints = controller.getWaypoints();
    assert.equal(waypoints[0].lat, pontoC.lat);
    assert.equal(waypoints[0].lng, pontoC.lng);

    // O controller deve acelerar a conclusão do trecho para B respeitando MIN_WAYPOINT_DURATION_MS = 600ms
    assert.ok(
      controller.getDurationMs() >= VehicleMotionController.MIN_WAYPOINT_DURATION_MS,
      "Trecho acelerado deve respeitar MIN_WAYPOINT_DURATION_MS = 600ms",
    );

    controller.destroy();
  });

  test("2. Limite máximo de 3 pontos na fila curta: descarta os mais antigos mantendo os 2 últimos", () => {
    const pontoA = { lat: -22.5235, lng: -44.1042 };
    const controller = new VehicleMotionController(pontoA, () => {});

    // Inicia trecho base
    controller.updateTarget({ lat: -22.5235, lng: -44.103 }, 1000);

    // Enfileira ponto 1
    controller.updateTarget({ lat: -22.5235, lng: -44.102 }, 2000);
    assert.equal(controller.getQueueLength(), 1);

    // Enfileira ponto 2
    controller.updateTarget({ lat: -22.5235, lng: -44.101 }, 3000);
    assert.equal(controller.getQueueLength(), 2);

    // Enfileira ponto 3 (limite máximo de 3 pontos)
    controller.updateTarget({ lat: -22.5235, lng: -44.1 }, 4000);
    assert.equal(controller.getQueueLength(), 3);

    // Envia ponto 4 (excede 3 pontos, simulando aba em segundo plano)
    const pontoFinal1 = { lat: -22.522, lng: -44.099 };
    controller.updateTarget(pontoFinal1, 5000);

    // Regra: descarta os mais antigos mantendo apenas os 2 últimos para nunca acumular atraso
    assert.equal(
      controller.getQueueLength(),
      2,
      "Fila que excedeu 3 pontos deve descartar mais antigos mantendo apenas os 2 últimos",
    );

    const waypoints = controller.getWaypoints();
    assert.equal(waypoints[waypoints.length - 1].lat, pontoFinal1.lat);
    assert.equal(waypoints[waypoints.length - 1].lng, pontoFinal1.lng);

    controller.destroy();
  });

  test("3. Preservação estrita da zona morta (<3m) e teleporte instantâneo (>2000m)", () => {
    const pontoInicial = { lat: -22.5235, lng: -44.1042 };
    let ultimoFrame: any = null;
    const controller = new VehicleMotionController(pontoInicial, (f) => {
      ultimoFrame = f;
    });

    // 1. Zona morta: variação menor que 3m deve ser ignorada
    controller.updateTarget({ lat: -22.523501, lng: -44.104201 }, 1000);
    assert.equal(controller.getQueueLength(), 0, "Zona morta não deve enfileirar waypoint");
    assert.equal(controller.isAnimating(), false, "Zona morta não deve iniciar animação");

    // 2. Teleporte instantâneo: salto maior que 2000m
    const pontoDistante = { lat: -22.55, lng: -44.1042 };
    const dist = haversineMeters(pontoInicial, pontoDistante);
    assert.ok(dist > 2000, "Distância deve ser superior a 2000m para testar teleporte");

    controller.updateTarget(pontoDistante, 2000);
    assert.equal(controller.getQueueLength(), 0, "Teleporte deve limpar fila de waypoints");
    assert.equal(controller.isAnimating(), false, "Teleporte não deve deixar animação ativa");
    assert.equal(controller.getPosition().lat, pontoDistante.lat);
    assert.equal(controller.getPosition().lng, pontoDistante.lng);
    assert.equal(ultimoFrame.lat, pontoDistante.lat);
    assert.equal(ultimoFrame.lng, pontoDistante.lng);

    controller.destroy();
  });
});
