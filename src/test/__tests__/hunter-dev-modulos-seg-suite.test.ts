import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  obterConfiguracaoDlp,
  obterIntegridadeFim,
} from "../../features/seguranca/services/segurancaModulosService";
import { avaliarVetoresDinamicos } from "../../features/seguranca/lib/avaliar-vetores";
import { ehEmailDescartavel } from "../../features/seguranca/lib/antiAbusoCadastros";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Dev-Módulos SEG Pertinente (Padrão Real Sem Simulação)", () => {
  test("1. Serviço de segurança não contém trava estática nem dados simulados/hardcoded", () => {
    const servicePath = path.resolve(
      __dirname,
      "../../features/seguranca/services/segurancaModulosService.ts",
    );
    const conteudo = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      !conteudo.includes("tabelasSegurancaEstendidasDisponiveis = false"),
      "Não deve conter flag bloqueando consultas reais ao Supabase",
    );
    assert.ok(
      !conteudo.includes("tabelasCanonicas"),
      "Não deve retornar lista estática de tabelas",
    );
    assert.ok(!conteudo.includes("honeytokensPadrao"), "Não deve retornar honeytokens estáticos");
    assert.ok(!conteudo.includes("sha256:8f41"), "Não deve retornar checksums falsos no FIM");
  });

  test("2. Avaliador dinâmico rebaixa vetores quando controles reais não estão confirmados", () => {
    const vetoresSemBanco = avaliarVetoresDinamicos({
      totalTabelas: 0,
      tabelasProtegidasRls: 0,
      bloqueiosAtivos: 0,
      totalFalhasRecentes: 0,
      totalAdmins: 1,
      cadeiaLogsIntegra: false,
      cadeiaLogsTotal: 0,
      honeytokensAtivos: 0,
      dlpBlurAtivo: false,
      fimIntegro: false,
      auditoriaDisponivel: false,
    });

    const todos = vetoresSemBanco.flatMap((c) => c.itens);
    const sqli = todos.find((i) => i.nome === "SQL Injection");
    const cadeia = todos.find((i) => i.nome === "Adulteração de logs");
    const ht = todos.find((i) => i.nome === "Armadilhas e Honeytokens (Deception)");
    const dlp = todos.find((i) => i.nome === "Proteção de Tela e Anti-Exfiltração (DLP)");
    const fim = todos.find((i) => i.nome === "Monitoramento de Integridade de Schema (FIM)");

    assert.equal(sqli?.nivel, "detectar");
    assert.equal(cadeia?.nivel, "detectar");
    assert.equal(ht?.nivel, "exposto");
    assert.equal(dlp?.nivel, "detectar");
    assert.equal(fim?.nivel, "detectar");
  });

  test("3. Central de Segurança implementa Hub A-Z com 18 módulos pertinentes, sem Módulo 20 e sem marca d'água", () => {
    const viewPath = path.resolve(
      __dirname,
      "../../features/seguranca/components/CentralSegurancaView.tsx",
    );
    const extrasPath = path.resolve(
      __dirname,
      "../../features/seguranca/components/CentralSegurancaModulosExtras.tsx",
    );
    const dlpPath = path.resolve(__dirname, "../../features/layout/components/DlpWatermark.tsx");

    const viewCode = fs.readFileSync(viewPath, "utf-8");
    const extrasCode = fs.readFileSync(extrasPath, "utf-8");
    const dlpCode = fs.readFileSync(dlpPath, "utf-8");

    assert.ok(viewCode.includes("CARDS_CENTRAL_SEGURANCA"), "Deve definir grid A-Z de cards");
    assert.ok(viewCode.includes('localeCompare(b.title, "pt-BR"'), "Cards ordenados A-Z");
    assert.ok(viewCode.includes("PainelCadeiaCustodiaLogs"), "Deve integrar Módulo 05");
    assert.ok(viewCode.includes("PainelAtualizacaoMassa"), "Deve integrar Módulo 08");
    assert.ok(viewCode.includes("PainelGovernancaSeguranca"), "Deve integrar Módulo 10");
    assert.ok(viewCode.includes("PainelAuditAdmin"), "Deve integrar Módulo 14");
    assert.ok(viewCode.includes("PainelMonitoramentoCadastros"), "Deve integrar Módulo 17");
    assert.ok(viewCode.includes("PainelVerificacaoLote"), "Deve integrar Módulo 21");

    // Exclusões expressas do usuário
    assert.ok(!viewCode.includes("Verificação em 2 etapas"), "Não deve incluir Módulo 20 (MFA)");
    assert.ok(!dlpCode.includes("textoMarcaDagua"), "DLP não deve renderizar marca d'água");

    // Zero SIGOVTR
    assert.ok(!viewCode.includes("vistorias") && !extrasCode.includes("vistorias"));

    // Regra Pétrea: zero '&' em UI
    assert.ok(
      !viewCode.replace(/&&/g, "").includes("&"),
      "Sem caractere & em CentralSegurancaView",
    );
    assert.ok(
      !extrasCode.replace(/&&/g, "").includes("&"),
      "Sem caractere & em CentralSegurancaModulosExtras",
    );
  });

  test("4. Módulo 09 (DLP) retorna apenas blurPerdaFocoAtivo e bloqueioPrintAtivo (sem marca d'água)", async () => {
    const dlp = await obterConfiguracaoDlp();
    assert.equal(typeof dlp.blurPerdaFocoAtivo, "boolean");
    assert.equal(typeof dlp.bloqueioPrintAtivo, "boolean");
    assert.equal("textoMarcaDagua" in (dlp as any), false);
  });

  test("5. Módulo 12 (FIM) sem snapshot disponível retorna vazio em vez de dados falsos", async () => {
    const fim = await obterIntegridadeFim({
      disponivel: false,
      geradoEm: "",
      tabelasProtegidas: 0,
      totalTabelas: 0,
      percentualConformidade: 0,
      tabelas: [],
      politicas: [],
      funcoesSecurityDefiner: [],
      bucketsStorage: [],
      contagens: {},
    });
    assert.deepEqual(fim, []);
  });

  test("6. Módulo 17 (Anti-Abuso) detecta e-mails descartáveis e libera domínios legítimos", () => {
    assert.equal(ehEmailDescartavel("atacante@mailinator.com"), true);
    assert.equal(ehEmailDescartavel("bot@yopmail.com"), true);
    assert.equal(ehEmailDescartavel("cliente@gmail.com"), false);
  });

  test("7. Migração e Script Mestre contêm tabelas e RPCs da suíte SEG completa", () => {
    const migracaoPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/20261127220000_hunter_seg_suite_completa.sql",
    );
    assert.ok(fs.existsSync(migracaoPath), "Migration completa deve existir");

    const sqlScriptPath = path.resolve(
      __dirname,
      "../../../supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const sqlMestre = fs.readFileSync(sqlScriptPath, "utf-8");

    for (const token of [
      "verificar_cadeia_logs",
      "login_falhas",
      "registrar_falha_login",
      "system_version_signals",
      "admin_audit_logs",
      "cadastro_monitoramento_eventos",
      "registrar_evento_cadastro_suspeito",
      "NOTIFY pgrst",
    ]) {
      assert.ok(sqlMestre.includes(token), `Script mestre deve conter ${token}`);
    }
  });
});
