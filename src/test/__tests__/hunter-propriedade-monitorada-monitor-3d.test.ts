import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  isPropriedadeMonitorada,
  converterVelocidadeParaRitmoHumano,
  avaliarAlertaQueda,
  converterPostoEmVeiculoGps,
} from "../../features/monitor-gps/utils/propriedadeMonitoradaUtils";
import type { VeiculoGps } from "../../features/monitor-gps/types";
import type { PostoVigilancia, TurnoVigilancia } from "../../features/vigilantes/types";

describe("Hunter — Propriedade Monitorada e Monitor 3D (Telemetria Pessoal e Man Down)", () => {
  test("1. isPropriedadeMonitorada deve identificar corretamente ativos de pessoa, vigilante e propriedade", () => {
    // Veículo comum
    const carro: VeiculoGps = {
      id: "v-1",
      cliente_id: "c-1",
      placa: "BRA2E19",
      marca_modelo: "Toyota Corolla 2.0",
      tipo_veiculo: "carro",
      ignicao: true,
      bloqueado: false,
      velocidade: 60,
      odometro: 15000,
      latitude: -22.49,
      longitude: -44.09,
      ultima_atualizacao: new Date().toISOString(),
      status_operacional: "em_rota",
    };
    assert.equal(
      isPropriedadeMonitorada(carro),
      false,
      "Carro não deve ser classificado como propriedade monitorada",
    );

    // Ativo com tipo_veiculo explícito
    const vigilanteTipo: VeiculoGps = {
      ...carro,
      tipo_veiculo: "propriedade",
      marca_modelo: "Guarita Principal",
    };
    assert.equal(
      isPropriedadeMonitorada(vigilanteTipo),
      true,
      "tipo_veiculo=propriedade deve ser reconhecido",
    );

    const pessoaTipo: VeiculoGps = {
      ...carro,
      tipo_veiculo: "pessoa",
      marca_modelo: "Vigilante Ronda 01",
    };
    assert.equal(
      isPropriedadeMonitorada(pessoaTipo),
      true,
      "tipo_veiculo=pessoa deve ser reconhecido",
    );

    // Ativo com placa/prefixo de posto ou propriedade
    const postoPlaca: VeiculoGps = {
      ...carro,
      tipo_veiculo: "carro",
      placa: "POSTO-GUARI",
    };
    assert.equal(isPropriedadeMonitorada(postoPlaca), true, "Placa POSTO- deve ser reconhecida");

    // Ativo com descrição textual
    const modeloRonda: VeiculoGps = {
      ...carro,
      marca_modelo: "Ronda Noturna Patrimonial",
    };
    assert.equal(
      isPropriedadeMonitorada(modeloRonda),
      true,
      "Modelo contendo 'ronda' deve ser reconhecido",
    );

    // Vínculo por IMEI com Turno de Vigilância
    const turno: TurnoVigilancia = {
      id: "t-1",
      vigilante_id: "vig-1",
      posto_id: "posto-1",
      rastreador_imei: "863874085999999",
      data_turno: "2026-11-19",
      hora_inicio: "18:00:00",
      hora_fim: "06:00:00",
      status: "em_andamento",
    };
    const veiculoImei: VeiculoGps = {
      ...carro,
      rastreador_imei: "863874085999999",
    };
    assert.equal(
      isPropriedadeMonitorada(veiculoImei, [turno]),
      true,
      "Veículo com rastreador vinculado a turno de vigilância deve ser reconhecido",
    );
  });

  test("2. converterVelocidadeParaRitmoHumano deve calcular m/min, m/s e passos/min sem usar km/h como primário", () => {
    // Parado
    const parado = converterVelocidadeParaRitmoHumano(0);
    assert.equal(parado.ritmoMMin, 0);
    assert.equal(parado.ritmoMS, 0);
    assert.equal(parado.cadenciaPassosMin, 0);
    assert.equal(parado.categoria, "estatico");

    // Caminhada Normal de Ronda: ~3.6 km/h -> 60 m/min, 1.0 m/s, ~80 passos/min
    const caminhada = converterVelocidadeParaRitmoHumano(3.6);
    assert.equal(caminhada.ritmoMMin, 60);
    assert.equal(caminhada.ritmoMS, 1.0);
    assert.equal(caminhada.cadenciaPassosMin, 80);
    assert.equal(caminhada.categoria, "caminhada");
    assert.equal(caminhada.isEmbarcado, false);

    // Patrulha Acelerada: ~6 km/h -> 100 m/min
    const patrulha = converterVelocidadeParaRitmoHumano(6.0);
    assert.equal(patrulha.ritmoMMin, 100);
    assert.equal(patrulha.categoria, "patrulha");
    assert.equal(patrulha.isEmbarcado, false);

    // Corrida / Deslocamento de Intervenção: ~12 km/h -> 200 m/min
    const corrida = converterVelocidadeParaRitmoHumano(12.0);
    assert.equal(corrida.ritmoMMin, 200);
    assert.equal(corrida.categoria, "corrida");
    assert.equal(corrida.isEmbarcado, false);

    // Embarcado em viatura: 40 km/h
    const embarcado = converterVelocidadeParaRitmoHumano(40.0);
    assert.equal(embarcado.categoria, "embarcado");
    assert.equal(embarcado.isEmbarcado, true);
  });

  test("3. avaliarAlertaQueda deve disparar alarme em caso de corpo na horizontal (>60°) ou impacto brusco (>=2.5G)", () => {
    // Caso 1: Normal (5 graus, 1.0G basal)
    const normal = avaliarAlertaQueda(5, 1.0);
    assert.equal(normal.temAlertaQueda, false);
    assert.equal(normal.tipo, "normal");

    // Caso 2: Queda / Homem Caído (Man Down) - 75 graus de inclinação horizontal
    const homemCaido = avaliarAlertaQueda(75, 1.1);
    assert.equal(homemCaido.temAlertaQueda, true);
    assert.equal(homemCaido.severidade, "critica");
    assert.ok(homemCaido.mensagem.includes("QUEDA"));

    // Caso 3: Choque / Impacto violento de queda (2.8G)
    const impacto = avaliarAlertaQueda(10, 2.8);
    assert.equal(impacto.temAlertaQueda, true);
    assert.equal(impacto.severidade, "critica");
    assert.ok(impacto.mensagem.includes("IMPACTO"));

    // Caso 4: Queda Confirmada (Impacto 3.2G + Corpo no chão a 80 graus)
    const quedaSevera = avaliarAlertaQueda(80, 3.2);
    assert.equal(quedaSevera.temAlertaQueda, true);
    assert.equal(quedaSevera.tipo, "queda_confirmada");
    assert.equal(quedaSevera.severidade, "critica");
  });

  test("4. converterPostoEmVeiculoGps deve sintetizar o ativo de propriedade para foco no Monitor 3D", () => {
    const posto: PostoVigilancia = {
      id: "posto-condominio-1",
      nome: "Condomínio Reserva das Flores",
      endereco: "Av. Central, 100",
      latitude: -22.496,
      longitude: -44.092,
      raio_metros: 150,
      ativo: true,
    };

    const ativoGps = converterPostoEmVeiculoGps(posto);
    assert.equal(ativoGps.id, "posto-posto-condominio-1");
    assert.equal(ativoGps.tipo_veiculo, "propriedade");
    assert.equal(ativoGps.latitude, -22.496);
    assert.equal(ativoGps.longitude, -44.092);
    assert.ok(ativoGps.marca_modelo.includes("Propriedade Monitorada"));
    assert.equal(isPropriedadeMonitorada(ativoGps), true);
  });

  test("5. Interface deve alternar dinamicamente entre 'Cockpit 3D' para veículos e 'Monitor 3D' para propriedades", async () => {
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );

    // GpsMonitorView deve conter a alternância canônica
    assert.ok(
      gpsMonitorCode.includes('isVeiculoSelecionadoPropriedade ? "Monitor 3D" : "Cockpit 3D"'),
      "GpsMonitorView deve alternar botão do cabeçalho para Monitor 3D quando for propriedade monitorada",
    );
    assert.ok(
      gpsMonitorCode.includes("MostradoresMonitor3D") ||
        drawerCode.includes("MostradoresMonitor3D"),
      "Sistema deve integrar o componente MostradoresMonitor3D",
    );

    // VehicleTelemetryDrawer deve renderizar MostradoresMonitor3D condicionalmente
    assert.ok(
      drawerCode.includes("<MostradoresMonitor3D"),
      "VehicleTelemetryDrawer deve renderizar MostradoresMonitor3D quando for propriedade monitorada",
    );
    assert.ok(
      drawerCode.includes("<MostradoresCockpit3D"),
      "VehicleTelemetryDrawer deve renderizar MostradoresCockpit3D quando for veículo",
    );
  });

  test("6. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nos novos arquivos", async () => {
    const arquivosParaVerificar = [
      "src/features/monitor-gps/utils/propriedadeMonitoradaUtils.ts",
      "src/features/monitor-gps/components/MostradoresMonitor3D.tsx",
    ];

    for (const relPath of arquivosParaVerificar) {
      const code = await fs.readFile(new URL(`../../../${relPath}`, import.meta.url), "utf-8");
      const lines = code.split("\n");
      lines.forEach((line, idx) => {
        // Ignora comentários de código e imports
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;
        // Procura '&' solto em strings literais ou JSX
        const stringMatches = line.match(/(["'`])(?:(?=(\\?))\2.)*?\1/g) || [];
        for (const str of stringMatches) {
          assert.ok(
            !str.includes("&"),
            `Caractere proibido encontrado em ${relPath}:${idx + 1} -> ${str}`,
          );
        }
      });
    }
  });
});
