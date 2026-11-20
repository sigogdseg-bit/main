import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  clientePossuiVeiculosAtivos,
  clientePossuiPendenciaInstalacaoOuAtivacao,
} from "../../features/clientes/services/clienteService";

describe("Hunter — Acesso Garantido e Direto para Clientes com Veículos Já Instalados", () => {
  const rootDir = process.cwd();

  it("1. clienteService deve exportar clientePossuiVeiculosAtivos e clientePossuiPendenciaInstalacaoOuAtivacao", () => {
    assert.equal(
      typeof clientePossuiVeiculosAtivos,
      "function",
      "clientePossuiVeiculosAtivos deve ser uma função exportada",
    );
    assert.equal(
      typeof clientePossuiPendenciaInstalacaoOuAtivacao,
      "function",
      "clientePossuiPendenciaInstalacaoOuAtivacao deve ser uma função exportada",
    );
  });

  it("2. server.ts deve implementar a rota /api/clientes/meu-status com Service Role", () => {
    const serverPath = path.join(rootDir, "src/server.ts");
    assert.ok(fs.existsSync(serverPath), "server.ts deve existir");

    const content = fs.readFileSync(serverPath, "utf-8");
    assert.ok(
      content.includes('url.pathname === "/api/clientes/meu-status"'),
      "server.ts deve conter o endpoint /api/clientes/meu-status",
    );
    assert.ok(
      content.includes("bloquearPorAguardandoInstalacao"),
      "Deve calcular a flag bloquearPorAguardandoInstalacao no backend",
    );
    assert.ok(
      content.includes("instaladoDiretamente"),
      "Deve identificar clientes com veículos instalados de forma direta",
    );
  });

  it("3. clienteService.ts deve consultar prioritariamente /api/clientes/meu-status para evitar recursão RLS", () => {
    const servicePath = path.join(rootDir, "src/features/clientes/services/clienteService.ts");
    const content = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      content.includes('fetch("/api/clientes/meu-status"'),
      "clientePossuiVeiculosAtivos deve consultar /api/clientes/meu-status",
    );
    assert.ok(
      content.includes("json.instaladoDiretamente"),
      "Deve verificar a flag instaladoDiretamente retornada pelo servidor",
    );
  });

  it("4. _authenticated.tsx deve liberar acesso imediato ao painel quando instalacao for concluida", () => {
    const authRoutePath = path.join(rootDir, "src/routes/_authenticated.tsx");
    const content = fs.readFileSync(authRoutePath, "utf-8");

    assert.ok(content.includes("onInstalacaoConcluida"), "Deve escutar a conclusão da instalação");
    assert.ok(
      content.includes("setTemVeiculosAtivos(true)"),
      "Deve atualizar temVeiculosAtivos para true imediatamente ao concluir",
    );
  });

  it("5. Migração SQL 20261120180000 e CORRECAO_IMEDIATA_RLS_RECURSAO_INSTALACOES devem existir com PL/pgSQL", () => {
    const migPath = path.join(
      rootDir,
      "supabase/migrations/20261120180000_hunter_fix_definitivo_rls_recursao_clientes_instalacoes.sql",
    );
    assert.ok(fs.existsSync(migPath), "Migração SQL definitiva deve existir");

    const migContent = fs.readFileSync(migPath, "utf-8");
    assert.ok(
      migContent.includes("LANGUAGE plpgsql"),
      "As funções de checagem devem ser declaradas como LANGUAGE plpgsql para impedir inlining",
    );
    assert.ok(
      migContent.includes("check_instalacao_pertence_cliente"),
      "Deve conter a função check_instalacao_pertence_cliente",
    );
    assert.ok(
      migContent.includes("check_instalador_possui_ordem_cliente"),
      "Deve conter a função check_instalador_possui_ordem_cliente",
    );

    const scriptPath = path.join(
      rootDir,
      "supabase/CORRECAO_IMEDIATA_RLS_RECURSAO_INSTALACOES.sql",
    );
    assert.ok(fs.existsSync(scriptPath), "Script de correção imediata deve existir");
  });
});
