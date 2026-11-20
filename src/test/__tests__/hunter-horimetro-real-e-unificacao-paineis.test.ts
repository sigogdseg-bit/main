import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Horímetro Real de Operação e Unificação dos Painéis", () => {
  const rootDir = process.cwd();

  const caminhoInicioHub = path.join(rootDir, "src/features/inicio/components/InicioHubView.tsx");
  const caminhoClienteHome = path.join(
    rootDir,
    "src/features/clientes/components/ClienteHomeView.tsx",
  );
  const caminhoHunterCard = path.join(
    rootDir,
    "src/features/clientes/components/HunterVehicleCard.tsx",
  );
  const caminhoModalMetrica = path.join(
    rootDir,
    "src/features/clientes/components/ModalConfigurarMetricaVeiculo.tsx",
  );
  const caminhoTelemetryDrawer = path.join(
    rootDir,
    "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
  );
  const caminhoManutencaoService = path.join(
    rootDir,
    "src/features/manutencao/services/manutencaoService.ts",
  );
  const caminhoMigration = path.join(
    rootDir,
    "supabase/migrations/20261119223000_hunter_horimetro_real_e_tipo_medicao.sql",
  );
  const caminhoServer = path.join(rootDir, "src/server.ts");

  test("1. Unificação Definitiva: InicioHubView renderiza ClienteHomeView sem banners redundantes", () => {
    assert.ok(fs.existsSync(caminhoInicioHub), "InicioHubView deve existir");
    const conteudo = fs.readFileSync(caminhoInicioHub, "utf-8");

    // Deve integrar ClienteHomeView como visão única e padrão
    assert.ok(
      conteudo.includes("ClienteHomeView"),
      "InicioHubView deve importar e renderizar ClienteHomeView",
    );
    assert.ok(
      conteudo.includes("visaoClienteAtiva"),
      "InicioHubView deve manter visaoClienteAtiva como true para compatibilidade de testes",
    );

    // Não deve mais conter o banner redundante de alternância para o hub antigo
    assert.ok(
      !conteudo.includes("Ver Hub de Módulos"),
      "InicioHubView NÃO deve conter botão 'Ver Hub de Módulos' (painel unificado único)",
    );
    assert.ok(
      !conteudo.includes("Modo Experiência do Cliente (Meus Veículos)"),
      "InicioHubView NÃO deve conter banner 'Modo Experiência do Cliente' (redundante)",
    );
  });

  test("2. ClienteHomeView: Ergonomia mobile com padding inferior amplo e remoção de atalho redundante", () => {
    assert.ok(fs.existsSync(caminhoClienteHome), "ClienteHomeView deve existir");
    const conteudo = fs.readFileSync(caminhoClienteHome, "utf-8");

    // Padding inferior ampliado para não ser coberto pela barra MobileBottomNav
    assert.ok(
      conteudo.includes("pb-32 sm:pb-20") || conteudo.includes("pb-28 sm:pb-16"),
      "ClienteHomeView deve ter espaçamento inferior suficiente para evitar sobreposição da barra inferior",
    );

    // Remoção do botão de rodapé para módulos antigos
    assert.ok(
      !conteudo.includes("Ver Todos os Módulos Operacionais"),
      "ClienteHomeView NÃO deve conter botão redundante 'Ver Todos os Módulos Operacionais'",
    );

    // Integração do Modal de Configuração de Métrica
    assert.ok(
      conteudo.includes("ModalConfigurarMetricaVeiculo"),
      "ClienteHomeView deve importar e integrar ModalConfigurarMetricaVeiculo",
    );
    assert.ok(
      conteudo.includes("veiculoParaMetrica"),
      "ClienteHomeView deve possuir estado para configurar métrica do veículo",
    );
    assert.ok(
      conteudo.includes("handleSalvarMetrica"),
      "ClienteHomeView deve possuir handler handleSalvarMetrica",
    );
  });

  test("3. HunterVehicleCard: Suporte factual a Odômetro (KM) ou Horímetro Real (Horas)", () => {
    assert.ok(fs.existsSync(caminhoHunterCard), "HunterVehicleCard deve existir");
    const conteudo = fs.readFileSync(caminhoHunterCard, "utf-8");

    // Suporte a métrica e botão de configuração
    assert.ok(
      conteudo.includes("onConfigurarMetrica"),
      "HunterVehicleCard deve aceitar prop onConfigurarMetrica",
    );
    assert.ok(
      conteudo.includes("isHorimetro"),
      "HunterVehicleCard deve calcular isHorimetro baseado em veiculo.tipo_medicao",
    );
    assert.ok(
      conteudo.includes("Horímetro:"),
      "HunterVehicleCard deve exibir rótulo Horímetro quando ativado",
    );
    assert.ok(
      conteudo.includes("Odômetro:"),
      "HunterVehicleCard deve exibir rótulo Odômetro quando em KM",
    );
    assert.ok(
      conteudo.includes("Motor Ligado") && conteudo.includes("Motor Desligado"),
      "HunterVehicleCard deve diferenciar Motor Ligado e Desligado para horímetro",
    );
  });

  test("4. ModalConfigurarMetricaVeiculo: Permite ao usuário alternar entre KM e Horímetro com horas iniciais", () => {
    assert.ok(fs.existsSync(caminhoModalMetrica), "ModalConfigurarMetricaVeiculo deve existir");
    const conteudo = fs.readFileSync(caminhoModalMetrica, "utf-8");

    assert.ok(
      conteudo.includes("atualizarMetricaVeiculo"),
      "Modal deve chamar atualizarMetricaVeiculo",
    );
    assert.ok(conteudo.includes("tipoMedicao"), "Modal deve controlar tipoMedicao");
    assert.ok(
      conteudo.includes("horimetroHoras"),
      "Modal deve permitir informar as horas atuais do painel",
    );
  });

  test("5. Cockpit 3D e Telemetria: VehicleTelemetryDrawer exibe Horímetro quando configurado", () => {
    assert.ok(fs.existsSync(caminhoTelemetryDrawer), "VehicleTelemetryDrawer deve existir");
    const conteudo = fs.readFileSync(caminhoTelemetryDrawer, "utf-8");

    assert.ok(
      conteudo.includes('veiculo.tipo_medicao === "horimetro"'),
      "VehicleTelemetryDrawer deve verificar se veiculo.tipo_medicao === 'horimetro'",
    );
    assert.ok(
      conteudo.includes("HORÍMETRO OPERACIONAL"),
      "VehicleTelemetryDrawer deve renderizar o card de Horímetro Operacional",
    );
  });

  test("6. Manutenção Preventiva: manutencaoService recalcula revisões por horas de uso", () => {
    assert.ok(fs.existsSync(caminhoManutencaoService), "manutencaoService deve existir");
    const conteudo = fs.readFileSync(caminhoManutencaoService, "utf-8");

    assert.ok(
      conteudo.includes('v.tipo_medicao === "horimetro"'),
      "manutencaoService deve avaliar se veículo utiliza horímetro",
    );
    assert.ok(
      conteudo.includes("isHorimetro"),
      "manutencaoService deve usar isHorimetro para definir metas e alertas em horas",
    );
  });

  test("7. Migração SQL: Tabela veiculos possui colunas tipo_medicao, ignicao_iniciada_em e RPC atômica", () => {
    assert.ok(fs.existsSync(caminhoMigration), "Migração de Horímetro Real deve existir");
    const conteudo = fs.readFileSync(caminhoMigration, "utf-8");

    assert.ok(
      conteudo.includes("tipo_medicao"),
      "Migração deve adicionar ou garantir a coluna tipo_medicao",
    );
    assert.ok(
      conteudo.includes("ignicao_iniciada_em"),
      "Migração deve adicionar ignicao_iniciada_em para computação factual de horas",
    );
    assert.ok(
      conteudo.includes("atualizar_metrica_veiculo"),
      "Migração deve criar RPC atualizar_metrica_veiculo",
    );
    assert.ok(
      conteudo.includes("registrar_posicao_gps_com_odometro"),
      "Migração deve atualizar registrar_posicao_gps_com_odometro para acumular horas de motor",
    );
  });

  test("8. Backend Server: Rota POST /api/veiculos/metrica exposta com fallback atômico", () => {
    assert.ok(fs.existsSync(caminhoServer), "server.ts deve existir");
    const conteudo = fs.readFileSync(caminhoServer, "utf-8");

    assert.ok(
      conteudo.includes("/api/veiculos/metrica"),
      "server.ts deve ter rota /api/veiculos/metrica",
    );
    assert.ok(
      conteudo.includes("atualizar_metrica_veiculo"),
      "server.ts deve invocar a RPC atualizar_metrica_veiculo",
    );
  });

  test("9. Regra Pétrea Gate 5: Ausência do caractere comercial isolado proibido nos arquivos alterados", () => {
    const arquivosVerificar = [
      caminhoInicioHub,
      caminhoClienteHome,
      caminhoHunterCard,
      caminhoModalMetrica,
    ];

    const charProibido = String.fromCharCode(38); // '&'

    for (const arq of arquivosVerificar) {
      const conteudo = fs.readFileSync(arq, "utf-8");
      const linhasComProibido = conteudo
        .split("\n")
        .filter((l) => !l.includes("&&") && l.includes(` ${charProibido} `));

      assert.equal(
        linhasComProibido.length,
        0,
        `Arquivo ${path.basename(arq)} não deve conter o caractere comercial isolado proibido '&'`,
      );
    }
  });
});
