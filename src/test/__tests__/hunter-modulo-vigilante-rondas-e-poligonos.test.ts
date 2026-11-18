import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pontoDentroDoPoligono,
  calcularCentroidePoligono,
  calcularDistanciaMetros,
} from "../../features/monitor-gps/services/protecaoVeiculoService";
import {
  converterHoraParaMinutos,
  verificarJanelaHorarioCheckpoint,
  avaliarPosicaoVigilante,
} from "../../features/vigilantes/services/vigilanteService";
import type { PostoVigilancia, RondaCheckpoint } from "../../features/vigilantes/types";

describe("Hunter — Módulo Vigilante, Rondas Táticas e Editor de Polígono Interativo", () => {
  describe("1. Editor de Polígono Interativo (Ray-Casting e Centróide)", () => {
    // Quadrado simples centrado em torno de (-22.50, -44.10)
    const poligonoQuadrado: [number, number][] = [
      [-22.5, -44.1],
      [-22.5, -44.09],
      [-22.51, -44.09],
      [-22.51, -44.1],
    ];

    it("deve identificar ponto dentro do polígono fechado", () => {
      const pontoInterno: [number, number] = [-22.505, -44.095];
      assert.equal(pontoDentroDoPoligono(pontoInterno, poligonoQuadrado), true);
    });

    it("deve identificar ponto fora do polígono", () => {
      const pontoExterno: [number, number] = [-22.52, -44.08];
      assert.equal(pontoDentroDoPoligono(pontoExterno, poligonoQuadrado), false);
    });

    it("deve calcular o centróide e raio aproximado de cobertura", () => {
      const centroide = calcularCentroidePoligono(poligonoQuadrado);
      assert.ok(Math.abs(centroide.latitude - -22.505) < 0.001);
      assert.ok(Math.abs(centroide.longitude - -44.095) < 0.001);
      assert.ok(centroide.raioAproximadoMetros > 100);
    });

    it("não deve considerar área com menos de 3 pontos", () => {
      const doisPontos: [number, number][] = [
        [-22.5, -44.1],
        [-22.51, -44.09],
      ];
      assert.equal(pontoDentroDoPoligono([-22.505, -44.095], doisPontos), false);
    });
  });

  describe("2. Janela Estrita de Tolerância de Rondas (±3 minutos)", () => {
    it("converte horário HH:MM para minutos do dia corretamente", () => {
      assert.equal(converterHoraParaMinutos("00:00"), 0);
      assert.equal(converterHoraParaMinutos("01:30"), 90);
      assert.equal(converterHoraParaMinutos("22:15"), 1335);
    });

    it("aprova passagem exatamente no horário previsto (diferença = 0 min)", () => {
      const horarioPrevisto = "22:15"; // 1335 min
      const agoraMinutos = 1335;
      const res = verificarJanelaHorarioCheckpoint(horarioPrevisto, agoraMinutos, 3);

      assert.equal(res.dentroJanela, true);
      assert.equal(res.atrasado, false);
      assert.equal(res.adiantado, false);
      assert.equal(res.diferencaMinutos, 0);
    });

    it("aprova passagem com até 3 minutos de antecedência (-3 min)", () => {
      const horarioPrevisto = "22:15"; // 1335 min
      const agoraMinutos = 1332; // 22:12 (-3 min)
      const res = verificarJanelaHorarioCheckpoint(horarioPrevisto, agoraMinutos, 3);

      assert.equal(res.dentroJanela, true);
      assert.equal(res.diferencaMinutos, -3);
    });

    it("aprova passagem com até 3 minutos de atraso (+3 min)", () => {
      const horarioPrevisto = "22:15"; // 1335 min
      const agoraMinutos = 1338; // 22:18 (+3 min)
      const res = verificarJanelaHorarioCheckpoint(horarioPrevisto, agoraMinutos, 3);

      assert.equal(res.dentroJanela, true);
      assert.equal(res.diferencaMinutos, 3);
    });

    it("reprova e marca como adiantado se vigilante chegar mais de 3 minutos antes (-4 min)", () => {
      const horarioPrevisto = "22:15"; // 1335 min
      const agoraMinutos = 1330; // 22:10 (-5 min)
      const res = verificarJanelaHorarioCheckpoint(horarioPrevisto, agoraMinutos, 3);

      assert.equal(res.dentroJanela, false);
      assert.equal(res.adiantado, true);
      assert.equal(res.atrasado, false);
    });

    it("reprova e marca como atrasado se vigilante chegar mais de 3 minutos depois (+4 min)", () => {
      const horarioPrevisto = "22:15"; // 1335 min
      const agoraMinutos = 1340; // 22:20 (+5 min)
      const res = verificarJanelaHorarioCheckpoint(horarioPrevisto, agoraMinutos, 3);

      assert.equal(res.dentroJanela, false);
      assert.equal(res.atrasado, true);
      assert.equal(res.adiantado, false);
    });
  });

  describe("3. Avaliação Situacional do Vigilante na Propriedade", () => {
    const postoMock: PostoVigilancia = {
      id: "posto-01",
      nome: "Condomínio Residencial Parque Real",
      latitude: -22.505,
      longitude: -44.095,
      raio_metros: 100,
      perimetro_poligono: {
        type: "Polygon",
        coordinates: [
          [-22.5, -44.1],
          [-22.5, -44.09],
          [-22.51, -44.09],
          [-22.51, -44.1],
        ],
      },
      ativo: true,
    };

    const checkpointsMock: RondaCheckpoint[] = [
      {
        id: "cp-01",
        posto_id: "posto-01",
        nome: "Portaria Principal",
        latitude: -22.502,
        longitude: -44.095,
        ordem: 1,
        horario_previsto: "22:00:00",
        tolerancia_minutos: 3,
        raio_captura_metros: 20,
        cor_marcador: "#2563eb",
        ativo: true,
      },
      {
        id: "cp-02",
        posto_id: "posto-01",
        nome: "Depósito de Materiais",
        latitude: -22.508,
        longitude: -44.095,
        ordem: 2,
        horario_previsto: "22:30:00",
        tolerancia_minutos: 3,
        raio_captura_metros: 20,
        cor_marcador: "#2563eb",
        ativo: true,
      },
    ];

    it("detecta vigilante dentro do perímetro e próximo ao checkpoint 1", () => {
      // Posição a ~5 metros do CP-01
      const latVig = -22.50204;
      const lonVig = -44.09503;
      const horaSimulada = new Date("2026-11-18T22:02:00"); // Dentro da janela (22:00 + 2 min)

      const res = avaliarPosicaoVigilante(latVig, lonVig, postoMock, checkpointsMock, horaSimulada);

      assert.equal(res.dentroDoPerimetro, true);
      assert.notEqual(res.checkpointMaisProximo, null);
      assert.equal(res.checkpointMaisProximo?.checkpoint.id, "cp-01");
      assert.equal(res.checkpointMaisProximo?.dentroRaioCaptura, true);
      assert.equal(res.checkpointMaisProximo?.janelaHorario.dentroJanela, true);
    });

    it("detecta vigilante fora do perímetro da propriedade", () => {
      // Posição distante fora do polígono
      const latVig = -22.55;
      const lonVig = -44.0;
      const horaSimulada = new Date("2026-11-18T22:02:00");

      const res = avaliarPosicaoVigilante(latVig, lonVig, postoMock, checkpointsMock, horaSimulada);
      assert.equal(res.dentroDoPerimetro, false);
    });
  });
});
