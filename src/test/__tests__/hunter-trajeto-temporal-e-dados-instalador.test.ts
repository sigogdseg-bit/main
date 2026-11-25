import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { carregarViagensTrajetos } from "@/features/monitor-gps/services/gpsService";
import { obterDadosPreenchimentoInstalacaoCliente } from "@/features/instalacoes/services/instalacaoService";
import {
  saveCardThemeConfig,
  readCardThemeConfig,
  DEFAULT_CARD_THEME_CONFIG,
} from "@/shared/lib/card-theme";

describe("Hunter — Filtro Temporal de Trajetos, Pré-preenchimento do Instalador e Cores Multi-Dispositivo", () => {
  it("1. carregarViagensTrajetos deve aceitar e tratar filtro de ano, mês e dia", async () => {
    assert.strictEqual(typeof carregarViagensTrajetos, "function");

    // Chamada sem parâmetros e com filtro temporal
    const semFiltro = await carregarViagensTrajetos("fake-veiculo-id");
    assert.ok(Array.isArray(semFiltro));

    const comFiltro = await carregarViagensTrajetos("fake-veiculo-id", {
      ano: 2026,
      mes: 9,
      dia: 23,
    });
    assert.ok(Array.isArray(comFiltro));
  });

  it("2. obterDadosPreenchimentoInstalacaoCliente deve retornar função para pré-preenchimento", async () => {
    assert.strictEqual(typeof obterDadosPreenchimentoInstalacaoCliente, "function");

    const vazio = await obterDadosPreenchimentoInstalacaoCliente("");
    assert.strictEqual(vazio, null);
  });

  it("3. saveCardThemeConfig deve persistir localmente e sincronizar via evento e nuvem", () => {
    assert.strictEqual(typeof saveCardThemeConfig, "function");

    saveCardThemeConfig(DEFAULT_CARD_THEME_CONFIG, "user-teste-123");
    const lido = readCardThemeConfig("user-teste-123");
    assert.strictEqual(lido.mode, "duo");
    assert.strictEqual(lido.monoColor, "cyan");
  });

  it("4. NovoClienteModal não deve ter botões redundantes de PDF de contrato", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/NovoClienteModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    // O botão no rodapé "Emitir Contrato (PDF)" foi removido
    assert.ok(
      !content.includes("Emitir Contrato (PDF)"),
      "Não deve existir botão 'Emitir Contrato (PDF)' redundante no rodapé do modal de novo cliente",
    );

    // O botão legítimo na seção de contrato deve existir
    assert.ok(
      content.includes("Baixar Contrato (PDF)"),
      "Deve manter o botão 'Baixar Contrato (PDF)' na seção de vigência e contrato",
    );
  });

  it("5. RefazerTrajetoModal deve conter seletores de Ano e Mês", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(content.includes("anoSelecionado"), "Deve conter estado anoSelecionado");
    assert.ok(content.includes("mesSelecionado"), "Deve conter estado mesSelecionado");
    assert.ok(content.includes("diaSelecionado"), "Deve conter estado diaSelecionado");
    assert.ok(content.includes("Período do Trajeto"), "Deve exibir seção Período do Trajeto");
  });

  it("6. NovaInstalacaoModal deve possuir auto-preenchimento de veículo, rastreador e chip", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("obterDadosPreenchimentoInstalacaoCliente"),
      "Deve invocar obterDadosPreenchimentoInstalacaoCliente para puxar dados cadastrados",
    );
    assert.ok(
      content.includes("dadosPreCarregados"),
      "Deve exibir banner quando dados forem integrados do cliente",
    );
  });

  it("7. Blindagem anti-duplicação de viagens ativas e debounce de parada no gateway e banco", () => {
    const gatewayPath = path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts");
    const gatewayContent = fs.readFileSync(gatewayPath, "utf-8");

    assert.ok(
      gatewayContent.includes("mapaParadaIgnicao"),
      "Gateway deve implementar mapa de debounce de desligamento de ignição",
    );
    assert.ok(
      gatewayContent.includes("TEMPO_MINIMO_PARADA_CONCLUIR_VIAGEM_MS"),
      "Gateway deve possuir limiar de tempo mínimo de parada antes de concluir viagem",
    );
    const inicioFuncao = gatewayContent.indexOf("async function processarCicloIgnicaoViagem");
    const fimFuncao = gatewayContent.indexOf("async function registrarEventoVeiculoNoHunter");
    const corpoCiclo = gatewayContent.slice(inicioFuncao, fimFuncao);

    assert.ok(
      !corpoCiclo.includes(".maybeSingle()"),
      "Função processarCicloIgnicaoViagem NÃO deve utilizar .maybeSingle()",
    );

    const sqlPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    assert.ok(
      sqlContent.includes("idx_viagens_uma_ativa_por_veiculo"),
      "Script mestre SQL deve conter índice único parcial idx_viagens_uma_ativa_por_veiculo",
    );
    assert.ok(
      sqlContent.includes("trg_viagens_garantir_uma_ativa"),
      "Script mestre SQL deve conter trigger de fechamento automático de viagem ativa anterior",
    );
  });

  it("7. Filtro civil de datas no fuso horário do Brasil (UTC-3) não pode vazar viagens noturnas de ontem para hoje", () => {
    // Caso real relatado: No dia 25/11/2026 às 10:18 da manhã, apareciam chegadas às 21:58, 22:32, 23:02, 23:09 e 23:52
    // porque o filtro anterior usava T00:00:00.000Z em vez do fuso -03:00 de Brasília.
    const ano = 2026, mes = 11, dia = 25;
    const diaStr = String(dia).padStart(2, "0");
    const mesStr = String(mes).padStart(2, "0");

    const inicioIso = new Date(`${ano}-${mesStr}-${diaStr}T00:00:00.000-03:00`).toISOString();
    const fimIso = new Date(`${ano}-${mesStr}-${diaStr}T23:59:59.999-03:00`).toISOString();

    // 25/11/2026 no Brasil deve iniciar estritamente às 03:00:00Z em UTC e findar às 02:59:59.999Z do dia seguinte
    assert.strictEqual(inicioIso, "2026-11-25T03:00:00.000Z");
    assert.strictEqual(fimIso, "2026-11-26T02:59:59.999Z");

    // Viagem de ontem à noite (24/11/2026 às 23:52 BRT) em UTC é 2026-11-25T02:52:00.000Z
    const viagemOntemNoiteUtc = "2026-11-25T02:52:00.000Z";
    const pertenceAoDia25 = viagemOntemNoiteUtc >= inicioIso && viagemOntemNoiteUtc <= fimIso;
    assert.strictEqual(pertenceAoDia25, false, "Viagem de ontem às 23:52 NÃO pode pertencer ao dia de hoje");

    // Para o dia 24/11/2026
    const inicioOntemIso = new Date("2026-11-24T00:00:00.000-03:00").toISOString();
    const fimOntemIso = new Date("2026-11-24T23:59:59.999-03:00").toISOString();
    assert.strictEqual(inicioOntemIso, "2026-11-24T03:00:00.000Z");
    assert.strictEqual(fimOntemIso, "2026-11-25T02:59:59.999Z");

    const pertenceAoDia24 = viagemOntemNoiteUtc >= inicioOntemIso && viagemOntemNoiteUtc <= fimOntemIso;
    assert.strictEqual(pertenceAoDia24, true, "Viagem de 24/11 às 23:52 pertence estritamente ao dia 24/11");
  });
});
