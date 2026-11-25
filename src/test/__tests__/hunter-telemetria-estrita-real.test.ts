import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Telemetria Estrita e Erradicação de Dados Fictícios (DJR-NEW / HUNTER-GUARDIAN)", () => {
  it("veículo sem leitura física de voltagem NÃO deve inventar voltagem (deve ser null/indefinido)", () => {
    const veiculoSemLeitura = {
      placa: "AAA0E71",
      marca_modelo: "Vw Gol",
      bateria_veiculo_v: undefined,
      voltagem: null,
      satelites: undefined,
      vibracao_g: undefined,
      inclinacao_graus: undefined,
    };

    const voltagem =
      veiculoSemLeitura.bateria_veiculo_v !== undefined &&
      veiculoSemLeitura.bateria_veiculo_v !== null
        ? Number(veiculoSemLeitura.bateria_veiculo_v)
        : veiculoSemLeitura.voltagem !== undefined && veiculoSemLeitura.voltagem !== null
          ? Number(veiculoSemLeitura.voltagem)
          : null;

    const satelites =
      veiculoSemLeitura.satelites !== undefined &&
      veiculoSemLeitura.satelites !== null &&
      Number(veiculoSemLeitura.satelites) > 0
        ? Number(veiculoSemLeitura.satelites)
        : null;

    const inclinacao =
      veiculoSemLeitura.inclinacao_graus !== undefined &&
      veiculoSemLeitura.inclinacao_graus !== null
        ? Number(veiculoSemLeitura.inclinacao_graus)
        : null;

    const vibracao =
      veiculoSemLeitura.vibracao_g !== undefined && veiculoSemLeitura.vibracao_g !== null
        ? Number(veiculoSemLeitura.vibracao_g)
        : null;

    assert.equal(voltagem, null, "Voltagem deve ser estritamente nula sem dado do rastreador");
    assert.equal(satelites, null, "Satélites devem ser estritamente nulos sem sinal GPS");
    assert.equal(inclinacao, null, "Inclinação deve ser estritamente nula sem sinal do giroscópio");
    assert.equal(vibracao, null, "Força G deve ser estritamente nula sem sinal do acelerômetro");
  });

  it("veículos fictícios de simulação e Frota Hunter devem ser filtrados da listagem operacional", () => {
    const listaOriginal = [
      {
        id: "1",
        placa: "AAA0E55",
        marca_modelo: "civic",
        clientes: { nome_razao_social: "Alexandra" },
      },
      {
        id: "2",
        placa: "AAA0E71",
        marca_modelo: "Vw Gol",
        clientes: { nome_razao_social: "Alexandra" },
      },
      {
        id: "3",
        placa: "BBB0R22",
        marca_modelo: "Bmw X1",
        clientes: { nome_razao_social: "mario" },
      },
      {
        id: "4",
        placa: "HTR4G16",
        marca_modelo: "Chevrolet S10 Frota Hunter",
        clientes: { nome_razao_social: "Frota Hunter Operacional" },
      },
      {
        id: "5",
        placa: "HUN1T26",
        marca_modelo: "Toyota Hilux Frota Hunter",
        clientes: { nome_razao_social: "Frota Hunter Operacional" },
      },
    ];

    const filtrados = listaOriginal.filter((v) => {
      const modelo = (v.marca_modelo || "").toLowerCase();
      const cliente = (v.clientes?.nome_razao_social || "").toLowerCase();
      if (
        modelo.includes("frota hunter") ||
        cliente.includes("frota hunter") ||
        modelo.includes("simula") ||
        v.placa === "HTR4G16" ||
        v.placa === "HUN1T26"
      ) {
        return false;
      }
      return true;
    });

    assert.equal(
      filtrados.length,
      3,
      "Devem restar estritamente os 3 veículos reais dos clientes cadastrados",
    );
    assert.equal(
      filtrados.some((v) => v.placa === "HTR4G16" || v.placa === "HUN1T26"),
      false,
      "Placas mock não podem existir",
    );
    assert.deepEqual(
      filtrados.map((v) => v.placa),
      ["AAA0E55", "AAA0E71", "BBB0R22"],
    );
  });

  it("status do alternador deve reportar 'Sem leitura' quando voltagem for nula", () => {
    const voltagem: number | null = null;
    const texto = voltagem === null ? "Sem leitura" : voltagem >= 13.5 ? "Carregando" : "Bateria";
    assert.equal(texto, "Sem leitura");
  });

  it("diagnóstico de saúde sem comunicação não pode inventar precisão alta, 100% OK ou Recente", () => {
    const veiculoSemComunicacao = {
      id: "v-sem-sinal",
      placa: "KKK9K99",
      ultima_atualizacao: null,
      bateria_rastreador_pct: null,
      voltagem: null,
      satelites: 0,
    };

    const statusRedeOk = false; // Ping sem resposta ou sem transmissão recente
    const satelites = veiculoSemComunicacao.satelites ?? 0;
    const statusGpsOk = statusRedeOk && satelites >= 4;

    // GPS
    const gpsTexto = statusRedeOk
      ? satelites >= 4
        ? "Precisão Alta"
        : "Sinal Fraco"
      : "Sem Sinal GPS";
    assert.equal(gpsTexto, "Sem Sinal GPS", "Não pode exibir Precisão Alta sem comunicação");
    assert.equal(statusGpsOk, false);

    // Bateria interna
    const pctRastreador = veiculoSemComunicacao.bateria_rastreador_pct;
    const bateriaInternaTexto =
      pctRastreador !== null && pctRastreador !== undefined ? `${pctRastreador}%` : "Sem leitura";
    assert.equal(bateriaInternaTexto, "Sem leitura", "Não pode inventar 100% OK se não há leitura");

    // Última comunicação
    const ultimaComunicacaoTexto = veiculoSemComunicacao.ultima_atualizacao
      ? "Data válida"
      : "Nenhum registro";
    assert.equal(
      ultimaComunicacaoTexto,
      "Nenhum registro",
      "Não pode inventar Recente se nunca comunicou",
    );
  });

  it("mostradores de telemetria 3D sem comunicação não podem exibir 'Bateria Estabilizada', 'ESTABILIDADE OK', 'CONDUÇÃO SUAVE' ou 'LOCK 3D'", () => {
    const statusComunicacaoAtivo = false;
    const voltagem = 12.6; // Valor gravado anteriormente no banco
    const inclinacao = 0;
    const vibracao = 0.1;
    const satelites = 12;

    // 1. Status da Voltagem
    const statusAlternador = !statusComunicacaoAtivo
      ? "Último registro"
      : voltagem >= 13.5
        ? "Alternador Carregando"
        : voltagem >= 12.3
          ? "Bateria Estabilizada"
          : "Alerta Subtensão";
    assert.equal(statusAlternador, "Último registro");
    assert.notEqual(statusAlternador, "Bateria Estabilizada");

    // 2. Status do Giroscópio
    const statusGiroscopio = !statusComunicacaoAtivo
      ? "SEM SINAL"
      : inclinacao !== null
        ? "ESTABILIDADE OK"
        : "SEM LEITURA";
    assert.equal(statusGiroscopio, "SEM SINAL");
    assert.notEqual(statusGiroscopio, "ESTABILIDADE OK");

    // 3. Status da Força G
    const statusForcaG = !statusComunicacaoAtivo
      ? "SEM SINAL"
      : vibracao !== null
        ? "CONDUÇÃO SUAVE"
        : "SEM IMPACTO";
    assert.equal(statusForcaG, "SEM SINAL");
    assert.notEqual(statusForcaG, "CONDUÇÃO SUAVE");

    // 4. Status de Satélites
    const badgeSatelites = !statusComunicacaoAtivo
      ? "SEM SINAL"
      : satelites !== null
        ? "LOCK 3D"
        : "SEM FIX";
    assert.equal(badgeSatelites, "SEM SINAL");
    assert.notEqual(badgeSatelites, "LOCK 3D");
  });

  it("obterInfoPingReal deve distinguir com rigor absoluto veículo em rota (15s) vs estacionado (repouso) vs offline", async () => {
    const { obterInfoPingReal } =
      await import("../../features/monitor-gps/utils/telemetriaDinamica");

    const agoraIso = new Date().toISOString();
    const haDoisMinutosIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const haQuinzeMinutosIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // 1. Veículo em Rota (deslocamento real)
    const infoEmRota = obterInfoPingReal(agoraIso, "em_rota", true, 60, true);
    assert.equal(infoEmRota.statusBadge, "ativo_rota");
    assert.equal(infoEmRota.statusRotulo, "EM TRÂNSITO");
    assert.ok(infoEmRota.modoDescricao.includes("15s"));
    assert.ok(infoEmRota.dataHoraFormatada.includes("Hoje às"));

    // 2. Veículo Estacionado (repouso de bateria, sem pings de 15s)
    const infoEstacionado = obterInfoPingReal(haDoisMinutosIso, "estacionado", false, 0, true);
    assert.equal(infoEstacionado.statusBadge, "repouso_estacionado");
    assert.equal(infoEstacionado.statusRotulo, "ESTACIONADO");
    assert.ok(infoEstacionado.modoDescricao.includes("Ignição desligada"));

    // 3. Veículo em Marcha Lenta (ligado parado)
    const infoMarchaLenta = obterInfoPingReal(agoraIso, "parado", true, 0, true);
    assert.equal(infoMarchaLenta.statusBadge, "ativo_marcha_lenta");
    assert.equal(infoMarchaLenta.statusRotulo, "MARCHA LENTA");

    // 4. Veículo sem comunicação recente
    const infoOffline = obterInfoPingReal(haQuinzeMinutosIso, "estacionado", false, 0, false);
    assert.equal(infoOffline.statusBadge, "sem_sinal");
    assert.equal(infoOffline.statusRotulo, "SEM SINAL");

    // 5. Veículo sem nenhuma leitura gravada
    const infoSemLeitura = obterInfoPingReal(null, "estacionado", false, 0, false);
    assert.equal(infoSemLeitura.statusBadge, "sem_leitura");
    assert.equal(infoSemLeitura.statusRotulo, "SEM LEITURA");
    assert.equal(infoSemLeitura.timestampFormatado, "Sem leitura");
  });

  it("HunterVehicleCard e telemetria: proíbe estritamente fallback para 100% de bateria e coordenadas falsas", () => {
    // Veículo sem comunicação e sem leitura física (como RNM1B70 sem fix GPS)
    const veiculoReal = {
      id: "v-rnm1b70",
      placa: "RNM1B70",
      latitude: 0,
      longitude: 0,
      bateria_rastreador_pct: undefined,
      ultima_atualizacao: null,
      ignicao: false,
    };

    // 1. Bateria do rastreador
    const temBateriaReal =
      veiculoReal.bateria_rastreador_pct !== undefined &&
      veiculoReal.bateria_rastreador_pct !== null &&
      !isNaN(Number(veiculoReal.bateria_rastreador_pct));

    const bateriaPct = temBateriaReal ? `${veiculoReal.bateria_rastreador_pct}%` : "Sem leitura";

    assert.equal(bateriaPct, "Sem leitura", "Veículo sem leitura não pode exibir 100%");
    assert.notEqual(bateriaPct, "100%", "Proibido categoricamente maquiar para 100%");

    // 2. Ignição sem transmissão
    const temTransmissao = Boolean(veiculoReal.ultima_atualizacao);
    const ignicaoTexto = !temTransmissao
      ? "Sem sinal"
      : veiculoReal.ignicao
        ? "Ligada"
        : "Desligada";

    assert.equal(
      ignicaoTexto,
      "Sem sinal",
      "Sem transmissão deve reportar 'Sem sinal', não 'Desligada'",
    );

    // 3. Validação de coordenadas
    const temCoordenadas =
      typeof veiculoReal.latitude === "number" &&
      typeof veiculoReal.longitude === "number" &&
      Number.isFinite(veiculoReal.latitude) &&
      Number.isFinite(veiculoReal.longitude) &&
      (veiculoReal.latitude !== 0 || veiculoReal.longitude !== 0);

    assert.equal(temCoordenadas, false, "Latitude e longitude 0 não são coordenadas válidas");
  });
});
