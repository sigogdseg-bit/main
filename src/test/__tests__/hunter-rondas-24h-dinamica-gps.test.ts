import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const memoryStorage = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
  removeItem: (k: string) => memoryStorage.delete(k),
  clear: () => memoryStorage.clear(),
  key: (i: number) => Array.from(memoryStorage.keys())[i] || null,
  get length() {
    return memoryStorage.size;
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

import type { HunterRole } from "../../integrations/supabase/types";
import type { UserSession } from "../../features/auth/types";
import { obterModulosPadraoPorPerfil } from "../../features/seguranca/services/usuarioService";
import {
  calcularTemposDeslocamentoCheckpoints,
  iniciarCicloRonda,
  registrarCheckinGpsAbsoluto,
  salvarCheckpoint,
  transmitirPosicaoVigilanteAoVivo,
  verificarDesvioRotaVigilante,
  verificarAtrasoProximoPonto,
  dispararAlertaRonda,
} from "../../features/vigilantes/services/vigilanteService";
import type { RondaCheckpoint, PostoVigilancia } from "../../features/vigilantes/types";
import fs from "node:fs";
import path from "node:path";

describe("GD Segurança — Ronda Contínua 24h, Deslocamento Dinâmico e GPS Absoluto", () => {
  const postoTesteId = "posto-teste-dinamico-24h";

  beforeEach(async () => {
    mockStorage.clear();
    // Cadastra checkpoints base para os testes de ronda
    await salvarCheckpoint({
      id: "p1",
      posto_id: postoTesteId,
      nome: "Guarita",
      latitude: -22.495,
      longitude: -44.093,
      ordem: 1,
      tempo_deslocamento_minutos: 4,
      tolerancia_minutos: 3,
      raio_captura_metros: 15,
    });
    await salvarCheckpoint({
      id: "p2",
      posto_id: postoTesteId,
      nome: "Depósito",
      latitude: -22.496,
      longitude: -44.094,
      ordem: 2,
      tempo_deslocamento_minutos: 6,
      tolerancia_minutos: 3,
      raio_captura_metros: 15,
    });
  });

  test("1. Garante que o enum HunterRole e UserSession suportam o perfil 'vigilante'", () => {
    const role: HunterRole = "vigilante";
    assert.equal(role, "vigilante");

    const sessaoVigilante: Partial<UserSession> = {
      userId: "usr-vig-01",
      email: "vigilante@gdseguranca.com.br",
      nome: "Carlos Vigilante",
      role: "vigilante",
      isVigilante: true,
      modulos: ["vigilantes"],
    };

    assert.equal(sessaoVigilante.isVigilante, true);
    assert.equal(sessaoVigilante.role, "vigilante");
  });

  test("2. Garante que os módulos padrão do perfil 'vigilante' são restritos a 'vigilantes'", () => {
    const modulos = obterModulosPadraoPorPerfil("vigilante");
    assert.deepEqual(modulos, ["vigilantes"]);
    assert.equal(modulos.includes("financeiro"), false);
    assert.equal(modulos.includes("clientes"), false);
  });

  test("3. Cálculo automático de rota sequencial circular e tempos com margem de ±3 min", async () => {
    // 3 checkpoints em triângulo perimetral (~150m entre cada)
    const cps: RondaCheckpoint[] = [
      {
        id: "cp-1",
        posto_id: postoTesteId,
        nome: "Portaria Principal",
        latitude: -22.495,
        longitude: -44.093,
        ordem: 1,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
      {
        id: "cp-2",
        posto_id: postoTesteId,
        nome: "Galpão Logístico",
        latitude: -22.4965,
        longitude: -44.0945,
        ordem: 2,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
      {
        id: "cp-3",
        posto_id: postoTesteId,
        nome: "Muro Perimetral Norte",
        latitude: -22.494,
        longitude: -44.095,
        ordem: 3,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
    ];

    const calculados = await calcularTemposDeslocamentoCheckpoints(postoTesteId, cps);

    assert.equal(calculados.length, 3);
    // Cada trecho deve ter distância em metros e tempo de deslocamento estimado
    calculados.forEach((cp, idx) => {
      assert.ok(
        cp.distancia_metros && cp.distancia_metros > 0,
        `Ponto ${idx + 1} deve ter distância > 0`,
      );
      assert.ok(
        cp.tempo_deslocamento_minutos && cp.tempo_deslocamento_minutos >= 2,
        `Ponto ${idx + 1} deve ter tempo estimado >= 2 min`,
      );
      assert.equal(cp.tolerancia_minutos, 3, "Tolerância padrão deve ser de ±3 minutos");
      assert.equal(cp.raio_captura_metros, 15, "Raio padrão de captura deve ser de 15 metros");
    });
  });

  test("4. Início dinâmico da ronda 24h: horários calculados a partir da hora real de início", async () => {
    // Configura checkpoints no posto
    await salvarCheckpoint({
      id: "p1",
      posto_id: postoTesteId,
      nome: "Guarita",
      latitude: -22.495,
      longitude: -44.093,
      ordem: 1,
      tempo_deslocamento_minutos: 4,
      tolerancia_minutos: 3,
      raio_captura_metros: 15,
    });
    await salvarCheckpoint({
      id: "p2",
      posto_id: postoTesteId,
      nome: "Depósito",
      latitude: -22.496,
      longitude: -44.094,
      ordem: 2,
      tempo_deslocamento_minutos: 6,
      tolerancia_minutos: 3,
      raio_captura_metros: 15,
    });

    const ciclo = await iniciarCicloRonda(postoTesteId, "vig-01", null, 1);

    assert.equal(ciclo.status, "em_andamento");
    assert.equal(ciclo.checkpoints_executados.length, 2);

    // Ponto 1 tem previsão imediata (momento de início)
    const t0 = new Date(ciclo.data_inicio).getTime();
    const tP1 = new Date(ciclo.checkpoints_executados[0].hora_prevista).getTime();
    assert.equal(t0, tP1);

    // Ponto 2 tem previsão somando 6 minutos (+ 360.000 ms)
    const tP2 = new Date(ciclo.checkpoints_executados[1].hora_prevista).getTime();
    assert.equal(tP2 - t0, 6 * 60 * 1000);
  });

  test("5. Validação de GPS Absoluto: Rejeição de sinal degradado (> 25m)", async () => {
    const ciclo = await iniciarCicloRonda(postoTesteId, "vig-01", null, 1);

    // Sinal degradado com precisão de 35 metros (Wi-Fi ou torre GSM sem satélite)
    const res = await registrarCheckinGpsAbsoluto(
      ciclo.id,
      "p1",
      -22.495,
      -44.093,
      35, // precisão ruim
    );

    assert.equal(res.sucesso, false);
    assert.match(res.mensagem, /Precisão do GPS insuficiente/);
  });

  test("6. Validação de GPS Absoluto: Rejeição de distância fora do raio de captura", async () => {
    const ciclo = await iniciarCicloRonda(postoTesteId, "vig-01", null, 1);

    // Coordenada afastada ~500 metros do checkpoint
    const res = await registrarCheckinGpsAbsoluto(
      ciclo.id,
      "p1",
      -22.5,
      -44.093,
      8, // precisão boa, mas vigilante longe do local
    );

    assert.equal(res.sucesso, false);
    assert.match(res.mensagem, /Desloque-se até o local físico do checkpoint/);
    assert.ok(res.distanciaAferidaMetros && res.distanciaAferidaMetros > 100);
  });

  test("7. Validação de GPS Absoluto com Sucesso e Janela de Tolerância Conforme", async () => {
    const ciclo = await iniciarCicloRonda(postoTesteId, "vig-01", null, 1);

    // Vigilante exatamente no local (-22.495, -44.093) com precisão excelente de 5m
    const res = await registrarCheckinGpsAbsoluto(ciclo.id, "p1", -22.495, -44.093, 5);

    assert.equal(res.sucesso, true);
    assert.equal(res.status, "conforme");
    assert.ok(res.distanciaAferidaMetros !== undefined && res.distanciaAferidaMetros <= 5);

    // Próximo ponto atualizado dinamicamente
    assert.ok(res.cicloAtualizado);
    const p1Exec = res.cicloAtualizado.checkpoints_executados[0];
    assert.equal(p1Exec.status, "conforme");
    assert.ok(p1Exec.hora_realizada);
  });

  test("8. Transmissão em tempo real de coordenadas do vigilante para a Central", async () => {
    await transmitirPosicaoVigilanteAoVivo({
      postoId: postoTesteId,
      postoNome: "Posto Teste 24h",
      vigilanteId: "vig-01",
      vigilanteNome: "Carlos Plantonista",
      latitude: -22.4952,
      longitude: -44.0935,
      precisaoMetros: 6,
      velocidadeKmH: 4,
      statusRota: "conforme",
    });

    const raw = mockStorage.getItem(`gd_posicao_live_${postoTesteId}`);
    assert.ok(raw);
    const salvo = JSON.parse(raw);
    assert.equal(salvo.postoId, postoTesteId);
    assert.equal(salvo.vigilanteId, "vig-01");
    assert.equal(salvo.latitude, -22.4952);
    assert.equal(salvo.longitude, -44.0935);
    assert.equal(salvo.statusRota, "conforme");
  });

  test("9. Detecção de Desvio de Rota: Alerta quando o vigilante se afasta do trajeto ou sai do posto", () => {
    const posto: PostoVigilancia = {
      id: postoTesteId,
      nome: "Propriedade Teste",
      latitude: -22.495,
      longitude: -44.093,
      raio_metros: 80,
      ativo: true,
      created_at: new Date().toISOString(),
    };

    const checkpoints: RondaCheckpoint[] = [
      {
        id: "p1",
        posto_id: postoTesteId,
        nome: "Ponto A",
        latitude: -22.495,
        longitude: -44.093,
        ordem: 1,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
      {
        id: "p2",
        posto_id: postoTesteId,
        nome: "Ponto B",
        latitude: -22.495,
        longitude: -44.095,
        ordem: 2,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
    ];

    // Posição exatamente em cima do segmento A-B
    const noTrajeto = verificarDesvioRotaVigilante(
      { latitude: -22.495, longitude: -44.094 },
      posto,
      checkpoints,
    );
    assert.equal(noTrajeto.emDesvio, false);

    // Posição com afastamento de 150m da rota (perpendicular para o norte)
    const afastado = verificarDesvioRotaVigilante(
      { latitude: -22.4935, longitude: -44.094 },
      posto,
      checkpoints,
    );
    assert.equal(afastado.emDesvio, true);
    assert.match(afastado.motivo, /Afastamento|fora do raio/i);
    assert.ok(afastado.distanciaMetros > 45);
  });

  test("10. Detecção de Checkpoint Atrasado: Alerta quando passou do tempo da janela de ±3 min", async () => {
    const ciclo = await iniciarCicloRonda(postoTesteId, "vig-01", null, 1);

    const checkpoints: RondaCheckpoint[] = [
      {
        id: "p1",
        posto_id: postoTesteId,
        nome: "Ponto 1",
        latitude: -22.495,
        longitude: -44.093,
        ordem: 1,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
      {
        id: "p2",
        posto_id: postoTesteId,
        nome: "Ponto 2",
        latitude: -22.496,
        longitude: -44.094,
        ordem: 2,
        tolerancia_minutos: 3,
        raio_captura_metros: 15,
        cor_marcador: "#2563eb",
        ativo: true,
      },
    ];

    // Momento atual = 2 minutos após o início (dentro da janela de tolerância de ±3 min do P1)
    const agoraDentro = new Date(new Date(ciclo.data_inicio).getTime() + 2 * 60 * 1000);
    const resDentro = verificarAtrasoProximoPonto(postoTesteId, ciclo, checkpoints, agoraDentro);
    assert.equal(resDentro.atrasado, false);

    // Momento atual = 5 minutos após o início (5 min > 3 min de tolerância sem check-in no P1)
    const agoraAtrasado = new Date(new Date(ciclo.data_inicio).getTime() + 5 * 60 * 1000);
    const resAtrasado = verificarAtrasoProximoPonto(
      postoTesteId,
      ciclo,
      checkpoints,
      agoraAtrasado,
    );
    assert.equal(resAtrasado.atrasado, true);
    assert.match(resAtrasado.mensagem || "", /Ponto de ronda não atingido no tempo estipulado/);
    assert.equal(resAtrasado.atrasoMinutos >= 5, true);
  });

  test("11. Disparo e persistência de alertas táticos de ronda com debounce", async () => {
    const ok = await dispararAlertaRonda({
      postoId: postoTesteId,
      postoNome: "Posto Alpha",
      vigilanteId: "vig-01",
      vigilanteNome: "Carlos",
      tipo: "desvio_rota_vigilante",
      gravidade: "alta",
      latitude: -22.495,
      longitude: -44.093,
      detalhes: "Desvio detectado na rota de ronda",
    });

    assert.equal(ok, true);

    const raw = mockStorage.getItem(`gd_alertas_ronda_${postoTesteId}`);
    assert.ok(raw);
    const lista = JSON.parse(raw);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].tipo, "desvio_rota_vigilante");
    assert.equal(lista[0].detalhes, "Desvio detectado na rota de ronda");

    // Segundo disparo imediato deve ser ignorado pelo debounce (anti-spam de 90s)
    const okDebounce = await dispararAlertaRonda({
      postoId: postoTesteId,
      tipo: "desvio_rota_vigilante",
      latitude: -22.495,
      longitude: -44.093,
      detalhes: "Desvio repetido em milissegundos",
    });

    assert.equal(okDebounce, false);
  });

  test("12. Regra Pétrea Hunter-Guardian: Ausência de menção a 'locação' e sem caractere proibido isolado", () => {
    const arquivosVerificar = [
      "src/features/vigilantes/services/vigilanteService.ts",
      "src/features/vigilantes/types.ts",
      "src/features/vigilantes/components/VisaoVigilanteOperacional.tsx",
      "src/features/vigilantes/components/VigilantesView.tsx",
      "src/features/vigilantes/components/MapaRondaVigilante.tsx",
      "src/features/clientes/services/contratoPdfService.ts",
      "src/features/clientes/services/geradorContratoPdfServer.ts",
      "src/features/financeiro/services/propostaPdfService.ts",
      "src/features/mensalidades/services/mensalidadeService.ts",
    ];

    for (const relPath of arquivosVerificar) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Não pode conter caractere ampersand isolado
      const matchesAmp = content.match(/[^&]&[^&]/g);
      assert.equal(
        matchesAmp,
        null,
        `O arquivo ${relPath} não pode conter o caractere comercial proibido isolado: ${matchesAmp?.join(", ")}`,
      );

      // Arquivos de contrato, proposta e mensalidade não podem mencionar locação de rastreador
      if (
        relPath.includes("contrato") ||
        relPath.includes("propostaPdf") ||
        relPath.includes("mensalidadeService")
      ) {
        assert.equal(
          content.includes("locação de equipamento") ||
            content.includes("LOCAÇÃO DE BEM MÓVEL") ||
            content.includes("Locação de rastreador") ||
            content.includes("LOCADORA") ||
            content.includes("Locação para Auto-Monitoramento"),
          false,
          `O arquivo ${relPath} não deve mencionar locação de rastreadores nem locadora`,
        );
      }
    }
  });
});
