import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ControladorMovimentoSuave,
  calcularPassoAnguloCurto,
  calcularDistanciaContinuidadeMetros,
  criarChaveVisualMarcador,
  haversineMetros,
  projetarCoordenadaPorRumo,
  DISTANCIA_MAXIMA_PROJECTION_METROS,
  LIMITE_MAXIMO_CONTINUIDADE_SEG,
} from "../../features/monitor-gps/utils/interpolacaoMapaSuave";
import { aplicarPatchTempoRealNaLista } from "../../features/monitor-gps/hooks/useGpsRealtime";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter — Deslocamento Fluido 60 FPS no Mapa (Anti-Congelamento e Anti-Salto)", () => {
  test("1. calcularPassoAnguloCurto evita giros reversos ao cruzar norte magnético (0°/360°)", () => {
    assert.equal(calcularPassoAnguloCurto(350, 10), 370);
    assert.equal(calcularPassoAnguloCurto(10, 350), -10);
    assert.equal(calcularPassoAnguloCurto(715, 5), 725);
    assert.equal(calcularPassoAnguloCurto(0, 90), 90);
    assert.equal(calcularPassoAnguloCurto(180, 180), 180);
  });

  test("2. Veículo verde a 29 km/h desliza continuamente a 60 FPS durante intervalo de 25s entre pacotes J16 sem congelar nem teleportar", () => {
    const controlador = new ControladorMovimentoSuave();
    const lat0 = -22.48086;
    const lng0 = -44.03909;
    const rumo = 90; // Leste
    const velKmh = 29;

    // Pacote T0
    controlador.atualizarDestino(
      {
        id: "v-ltk",
        latitude: lat0,
        longitude: lng0,
        rumo,
        velocidadeKmh: velKmh,
        ignicao: true,
        bloqueado: false,
        online: true,
        ultimaAtualizacaoIso: "2026-11-10T18:07:22.000Z",
      },
      0,
      false,
    );

    // Simula quadros a 60 FPS (16ms) por 25 segundos entre pacotes do hardware
    let distAnteriorM = 0;
    let maiorSaltoQuadroM = 0;
    let prevLat = lat0;
    let prevLng = lng0;

    for (let ms = 16; ms <= 25000; ms += 16) {
      const ativo = controlador.avancarParaInstante(ms, false);
      assert.equal(
        ativo,
        true,
        `Loop deve permanecer ativo aos ${ms}ms enquanto em rota a 29 km/h`,
      );

      const st = controlador.obterEstado("v-ltk")!;
      const saltoQuadro = haversineMetros(prevLat, prevLng, st.visualLat, st.visualLng);
      maiorSaltoQuadroM = Math.max(maiorSaltoQuadroM, saltoQuadro);
      prevLat = st.visualLat;
      prevLng = st.visualLng;

      const distDesdeInicio = haversineMetros(lat0, lng0, st.visualLat, st.visualLng);
      assert.ok(
        distDesdeInicio >= distAnteriorM - 0.01,
        "Deslocamento deve progredir continuamente sem recuos",
      );
      distAnteriorM = distDesdeInicio;
    }

    // Em 25s a 29 km/h (~8.06 m/s real), o marcador já terá percorrido suavemente ~160-190m sem congelar
    assert.ok(
      distAnteriorM > 140 && distAnteriorM < 220,
      `Deslocamento contínuo em 25s esperado entre 140m e 220m, obtido: ${distAnteriorM.toFixed(1)}m`,
    );
    assert.ok(
      maiorSaltoQuadroM < 1.0,
      `Nenhum quadro 60fps pode dar salto abrupto (maior passo: ${maiorSaltoQuadroM.toFixed(3)}m)`,
    );

    // Pacote T1 real chega após 25s exatamente 201m à frente com leve curva (rumo 100°)
    const [lat1, lng1] = projetarCoordenadaPorRumo(lat0, lng0, 90, 201.3);
    controlador.atualizarDestino(
      {
        id: "v-ltk",
        latitude: lat1,
        longitude: lng1,
        rumo: 100,
        velocidadeKmh: velKmh,
        ignicao: true,
        bloqueado: false,
        online: true,
        ultimaAtualizacaoIso: "2026-11-10T18:07:47.000Z",
      },
      25016,
      false,
    );

    // Verifica que no quadro logo após a chegada do novo pacote real não houve teleporte de 200m
    controlador.avancarParaInstante(25032, false);
    const aposPacote = controlador.obterEstado("v-ltk")!;
    const saltoPosPacote = haversineMetros(
      prevLat,
      prevLng,
      aposPacote.visualLat,
      aposPacote.visualLng,
    );
    assert.ok(
      saltoPosPacote < 3.5,
      `Chegada do novo pacote real deve convergir suavemente sem teleporte (salto: ${saltoPosPacote.toFixed(2)}m)`,
    );
  });

  test("3. Blindagem estrita anti-mock: veículo parado, sem ignição, bloqueado, offline ou timeout (>28s) nunca inventa movimento contínuo", () => {
    const controlador = new ControladorMovimentoSuave();
    const lat = -22.5235;
    const lng = -44.1042;

    // Caso A: Estacionado (vel = 0, ignição desligada)
    controlador.atualizarDestino(
      {
        id: "parado",
        latitude: lat,
        longitude: lng,
        rumo: 45,
        velocidadeKmh: 0,
        ignicao: false,
        bloqueado: false,
        online: true,
      },
      0,
      false,
    );
    const precisaParado = controlador.avancarParaInstante(5000, false);
    assert.equal(precisaParado, false);
    assert.equal(controlador.obterEstado("parado")?.visualLat, lat);
    assert.equal(controlador.obterEstado("parado")?.visualLng, lng);

    // Caso B: Marcha lenta (ignição ligada, vel = 0)
    controlador.atualizarDestino(
      {
        id: "marcha-lenta",
        latitude: lat,
        longitude: lng,
        rumo: 45,
        velocidadeKmh: 0,
        ignicao: true,
        bloqueado: false,
        online: true,
      },
      0,
      false,
    );
    assert.equal(controlador.avancarParaInstante(2000, false), false);
    assert.equal(controlador.obterEstado("marcha-lenta")?.visualLat, lat);

    // Caso C: Offline (sem sinal recente) mesmo com último pacote registrando velocidade > 0
    controlador.atualizarDestino(
      {
        id: "offline",
        latitude: lat,
        longitude: lng,
        rumo: 90,
        velocidadeKmh: 60,
        ignicao: true,
        bloqueado: false,
        online: false,
      },
      0,
      false,
    );
    assert.equal(controlador.avancarParaInstante(3000, false), false);
    assert.equal(controlador.obterEstado("offline")?.visualLng, lng);

    // Caso D: Bloqueado
    controlador.atualizarDestino(
      {
        id: "bloqueado",
        latitude: lat,
        longitude: lng,
        rumo: 90,
        velocidadeKmh: 40,
        ignicao: true,
        bloqueado: true,
        online: true,
      },
      0,
      false,
    );
    assert.equal(controlador.avancarParaInstante(3000, false), false);

    // Caso E: Desaceleração obrigatória por teto de continuidade se pacote parar de chegar (>28s)
    const d18 = calcularDistanciaContinuidadeMetros(80, 18);
    const d28 = calcularDistanciaContinuidadeMetros(80, LIMITE_MAXIMO_CONTINUIDADE_SEG);
    const d60 = calcularDistanciaContinuidadeMetros(80, 60);
    assert.ok(d28 >= d18);
    assert.equal(d28, d60, "Após o teto de 28s o avanço visual deve estabilizar em zero");
    assert.ok(d60 <= DISTANCIA_MAXIMA_PROJECTION_METROS);
  });

  test("4. criarChaveVisualMarcador ignora coordenadas, velocidade e rumo para preservar o DOM entre ciclos", () => {
    const k1 = criarChaveVisualMarcador({
      placa: "LTK1A94",
      tipo: "carro",
      corStatus: "#10B981",
      isSelected: true,
      temAlerta: false,
      isEmRota: true,
      iconeGenerico: false,
      mostrarPlaca: true,
    });
    const k2 = criarChaveVisualMarcador({
      placa: "LTK1A94",
      tipo: "carro",
      corStatus: "#10B981",
      isSelected: true,
      temAlerta: false,
      isEmRota: true,
      iconeGenerico: false,
      mostrarPlaca: true,
    });
    const kMudouCor = criarChaveVisualMarcador({
      placa: "LTK1A94",
      tipo: "carro",
      corStatus: "#64748B",
      isSelected: true,
      temAlerta: false,
      isEmRota: false,
      iconeGenerico: false,
      mostrarPlaca: true,
    });

    assert.equal(k1, k2, "Chave visual idêntica evita recriação destrutiva de setIcon/innerHTML");
    assert.notEqual(
      k1,
      kMudouCor,
      "Alteração discreta de status/cor deve atualizar a chave visual",
    );
  });

  test("5. Patch em tempo real do useGpsRealtime atualiza posição/velocidade instantaneamente e descarta pacotes fora de ordem", () => {
    const listaBase: VeiculoGps[] = [
      {
        id: "v-1",
        cliente_id: "c-1",
        placa: "LTK1A94",
        marca_modelo: "Teste",
        ignicao: true,
        bloqueado: false,
        velocidade: 29,
        odometro: 1000,
        latitude: -22.48,
        longitude: -44.04,
        rumo: 86,
        ultima_atualizacao: "2026-11-10T18:07:22.000Z",
        status_operacional: "em_rota",
      },
    ];

    const resNovo = aplicarPatchTempoRealNaLista(listaBase, {
      veiculoId: "v-1",
      latitude: -22.4809,
      longitude: -44.037,
      velocidade: 35,
      rumo: 92,
      ignicao: true,
      ultima_atualizacao: "2026-11-10T18:07:52.000Z",
    });

    assert.equal(resNovo.alterado, true);
    assert.equal(resNovo.lista[0].velocidade, 35);
    assert.equal(resNovo.lista[0].latitude, -22.4809);
    assert.equal(resNovo.lista[0].rumo, 92);
    assert.equal(resNovo.lista[0].status_operacional, "em_rota");

    // Pacote antigo deve ser descartado
    const resAtrasado = aplicarPatchTempoRealNaLista(resNovo.lista, {
      veiculoId: "v-1",
      latitude: -22.47,
      longitude: -44.05,
      velocidade: 12,
      ultima_atualizacao: "2026-11-10T18:07:10.000Z",
    });
    assert.equal(resAtrasado.alterado, false);
    assert.equal(resAtrasado.lista[0].latitude, -22.4809);
  });

  test("6. Engines 2D/3D, useGpsRealtime, Link Público e Playback integram movimento contínuo sem regressões estruturais", async () => {
    const leafletCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/LeafletEngine.tsx", import.meta.url),
      "utf-8",
    );
    const maplibreCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/MapLibre3DEngine.tsx", import.meta.url),
      "utf-8",
    );
    const realtimeCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/hooks/useGpsRealtime.ts", import.meta.url),
      "utf-8",
    );
    const compartilharCode = await fs.readFile(
      new URL("../../../src/routes/compartilhar.$token.tsx", import.meta.url),
      "utf-8",
    );
    const playbackCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
        import.meta.url,
      ),
      "utf-8",
    );

    assert.ok(leafletCode.includes("ControladorMovimentoSuave"));
    assert.ok(leafletCode.includes("criarChaveVisualMarcador"));
    assert.ok(leafletCode.includes("atualizarRotacaoElementoMarcador"));
    assert.ok(!leafletCode.includes("duracaoMs = 800"));
    assert.ok(leafletCode.includes("selectedIdAnteriorRef"));

    assert.ok(maplibreCode.includes("ControladorMovimentoSuave"));
    assert.ok(maplibreCode.includes("criarChaveVisualMarcador"));
    assert.ok(maplibreCode.includes("atualizarRotacaoElementoMarcador"));
    assert.ok(!maplibreCode.includes("duracaoMs = 800"));
    assert.ok(maplibreCode.includes("selectedIdAnteriorRef"));

    assert.ok(realtimeCode.includes("aplicarPatchTempoRealNaLista"));
    assert.ok(realtimeCode.includes("seqRef"));

    assert.ok(compartilharCode.includes("ControladorMovimentoSuave"));
    assert.ok(playbackCode.includes("animarMarcadorPlaybackSuave"));
  });
});
