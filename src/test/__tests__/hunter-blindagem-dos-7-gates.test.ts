import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { verificarSincronizacaoVersao } from "../../../scripts/hunter-gate-check.mjs";
import { calcularProximaVersao } from "../../../scripts/hunter-release.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("Hunter — Blindagem Física dos 7 Gates e Protocolo de Release (AGENTS.md / SKILL hunter)", () => {
  it("1. Barreira Física: O Git Hook pre-push deve existir e possuir permissão executável", () => {
    const hookPath = path.join(ROOT_DIR, ".git", "hooks", "pre-push");
    assert.ok(
      fs.existsSync(hookPath),
      "Arquivo .git/hooks/pre-push deve existir obrigatoriamente.",
    );
    const stat = fs.statSync(hookPath);
    // Verifica se possui permissão de execução (bit 0o111)
    const isExecutavel = Boolean(stat.mode & 0o111);
    assert.ok(isExecutavel, "O hook .git/hooks/pre-push deve ser executável.");
    const conteudo = fs.readFileSync(hookPath, "utf-8");
    assert.ok(
      conteudo.includes("hunter-gate-check.mjs"),
      "O hook pre-push deve invocar hunter-gate-check.mjs",
    );
  });

  it("2. Script de Release Oficial: Deve existir e possuir automação dos 7 gates", () => {
    const releasePath = path.join(ROOT_DIR, "scripts", "hunter-release.mjs");
    assert.ok(fs.existsSync(releasePath), "scripts/hunter-release.mjs deve existir.");
    const conteudo = fs.readFileSync(releasePath, "utf-8");
    assert.ok(
      conteudo.includes("npm install --package-lock-only"),
      "Deve sincronizar package-lock",
    );
    assert.ok(conteudo.includes("git tag -a"), "Deve gerar tag anotada com vA.B.C.D");
    assert.ok(conteudo.includes("npm test"), "Deve executar bateria de testes (Gate 4)");
    assert.ok(conteudo.includes("npm run build"), "Deve compilar build de produção (Gate 5)");
  });

  it("3. Verificador de Conformidade: Deve sincronizar a versão nos 5 arquivos canônicos", () => {
    const versao = verificarSincronizacaoVersao();
    assert.ok(versao, "A versão deve ser retornada");
    assert.match(versao, /^\d+\.\d+\.\d+\.\d+$/, "A versão deve respeitar o formato A.B.C.D");
  });

  it("4. Package.json: Deve conter os scripts release, gate:check e prepare", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
    assert.ok(pkg.scripts.release, "Deve ter script release");
    assert.ok(pkg.scripts["gate:check"], "Deve ter script gate:check");
    assert.ok(pkg.scripts.prepare, "Deve ter script prepare para manter os hooks instalados");
  });

  it("5. Semântica Canônica A.B.C.D de Versionamento", () => {
    // A = Maior / Quebra estrutural
    assert.equal(calcularProximaVersao("1.0.0.41", "A"), "2.0.0.0");
    // B = Hardening / Segurança Cibernética
    assert.equal(calcularProximaVersao("1.0.0.41", "B"), "1.1.0.0");
    // C = Novos Módulos / Telas / Relatórios (ex: Módulo Vigilante)
    assert.equal(calcularProximaVersao("1.0.0.41", "C"), "1.0.1.0");
    // D = Correções / Refinamentos
    assert.equal(calcularProximaVersao("1.0.0.41", "D"), "1.0.0.42");
  });
});
