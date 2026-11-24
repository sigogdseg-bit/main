#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Script Canônico de Release e Blindagem dos 7 Gates
// Automatiza atomicamente os Gates 2, 3, 4, 5, 6 e 7 sem margem de erro humano.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { verificarSincronizacaoVersao } from "./hunter-gate-check.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

function executarComando(cmd, desc) {
  console.log(`\n⏳ [EXECUTANDO] ${desc}...`);
  console.log(`$ ${cmd}`);
  try {
    execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit" });
    console.log(`✅ [SUCESSO] ${desc}`);
  } catch (err) {
    console.error(`\n❌ [FALHA BLOQUEANTE] Erro durante: ${desc}`);
    console.error(err.message);
    process.exit(1);
  }
}

export function calcularProximaVersao(versaoAtual, tipo = "D") {
  const partes = versaoAtual.split(".").map(Number);
  if (partes.length !== 4 || partes.some(isNaN)) {
    throw new Error(`Versão atual "${versaoAtual}" não está no formato A.B.C.D`);
  }
  const t = String(tipo).toUpperCase();
  if (t === "A" || t === "MAJOR") {
    partes[0] += 1;
    partes[1] = 0;
    partes[2] = 0;
    partes[3] = 0;
  } else if (t === "B" || t === "HARDENING" || t === "SEC") {
    partes[1] += 1;
    partes[2] = 0;
    partes[3] = 0;
  } else if (t === "C" || t === "MODULO" || t === "MODULE" || t === "TELA") {
    partes[2] += 1;
    partes[3] = 0;
  } else {
    // D = Correções / Refinamentos
    partes[3] += 1;
  }
  return partes.join(".");
}

function aplicarVersaoNosCincoArquivos(novaVersao) {
  console.log(`\n📝 Sincronizando versão "${novaVersao}" nos 5 arquivos canônicos...`);

  // 1. package.json
  const pkgPath = path.join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.version = novaVersao;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  // 1.1 package-lock.json
  const lockPath = path.join(ROOT_DIR, "package-lock.json");
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    lock.version = novaVersao;
    if (lock.packages && lock.packages[""]) {
      lock.packages[""].version = novaVersao;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf-8");
  }

  // 2. vite.config.ts
  const vitePath = path.join(ROOT_DIR, "vite.config.ts");
  let viteContent = fs.readFileSync(vitePath, "utf-8");
  viteContent = viteContent.replace(
    /const APP_VERSION\s*=\s*["'][^"']+["']/,
    `const APP_VERSION = "${novaVersao}"`,
  );
  fs.writeFileSync(vitePath, viteContent, "utf-8");

  // 3. src/shared/lib/version.ts
  const verPath = path.join(ROOT_DIR, "src/shared/lib/version.ts");
  let verContent = fs.readFileSync(verPath, "utf-8");
  verContent = verContent.replace(
    /export const APP_VERSION_NUMERO\s*=\s*["'][^"']+["']/,
    `export const APP_VERSION_NUMERO = "${novaVersao}"`,
  );
  fs.writeFileSync(verPath, verContent, "utf-8");

  // 4. src/test/__tests__/hunter-fundacao.test.ts
  const test1Path = path.join(ROOT_DIR, "src/test/__tests__/hunter-fundacao.test.ts");
  let test1Content = fs.readFileSync(test1Path, "utf-8");
  test1Content = test1Content.replace(
    /assert\.equal\(APP_VERSION_NUMERO,\s*["'][^"']+["']\)/,
    `assert.equal(APP_VERSION_NUMERO, "${novaVersao}")`,
  );
  fs.writeFileSync(test1Path, test1Content, "utf-8");

  // 5. src/test/__tests__/hunter-sigoguardiao-dominio-e-compartilhamento.test.ts
  const test2Path = path.join(
    ROOT_DIR,
    "src/test/__tests__/hunter-sigoguardiao-dominio-e-compartilhamento.test.ts",
  );
  let test2Content = fs.readFileSync(test2Path, "utf-8");
  test2Content = test2Content.replace(
    /assert\.equal\(APP_VERSION_NUMERO,\s*["'][^"']+["']\)/,
    `assert.equal(APP_VERSION_NUMERO, "${novaVersao}")`,
  );
  fs.writeFileSync(test2Path, test2Content, "utf-8");

  console.log("✅ Versão aplicada com sucesso nos 5 arquivos.");
}

async function main() {
  const args = process.argv.slice(2);
  let versaoAlvo = null;
  let tipoBump = "D";
  let mensagemCommit = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) {
      versaoAlvo = args[i + 1];
      i++;
    } else if ((args[i] === "--bump" || args[i] === "-b") && args[i + 1]) {
      tipoBump = args[i + 1];
      i++;
    } else if (args[i] === "-m" && args[i + 1]) {
      mensagemCommit = args[i + 1];
      i++;
    }
  }

  const pkgAtual = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
  if (!versaoAlvo) {
    versaoAlvo = calcularProximaVersao(pkgAtual.version, tipoBump);
    console.log(
      `ℹ️  Auto-incrementando casa [${tipoBump.toUpperCase()}] para a versão: ${versaoAlvo}`,
    );
  }

  // Validação estrita do formato A.B.C.D
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(versaoAlvo)) {
    console.error(
      `❌ ERRO: A versão "${versaoAlvo}" deve seguir rigorosamente o padrão A.B.C.D (ex: 2.1.6.17).`,
    );
    process.exit(1);
  }

  console.log("======================================================================");
  console.log(` 🛡️  [HUNTER-GUARDIAN] PROTOCOLO DE RELEASE AUTOMATIZADO v${versaoAlvo}`);
  console.log("======================================================================");

  // 1. Sincronização dos 5 Arquivos de Versão
  aplicarVersaoNosCincoArquivos(versaoAlvo);

  // 2. Sincronização obrigatória de package-lock.json
  executarComando("npm install --package-lock-only", "Sincronização de package-lock.json");

  // 3. Validação dos Gates Obrigatórios
  console.log("\n🧪 Executando bateria de Gates de Qualidade e Segurança...");
  executarComando("npx tsc --noEmit", "Gate 2 — Validação de Tipagem TypeScript");
  executarComando("npm run format", "Gate 3 — Formatação Prettier Estrita");
  executarComando("npm test", "Gate 4 — Validação da Suíte de Testes (100% aprovação)");
  executarComando("npm run build", "Gate 5 — Compilação de Produção Vite");
  executarComando("npx wrangler deploy", "Publicação Cloudflare Edge Workers");

  // 4. Verificação Fisiológica da Versão nos 5 arquivos e package-lock
  verificarSincronizacaoVersao();

  // 5. Staging e Commit
  const msg =
    mensagemCommit || `chore(release): v${versaoAlvo} - atualizacao e blindagem operacional`;
  executarComando(
    "git add -A",
    "Staging completo de todos os arquivos modificados e versionamento",
  );

  // Inclui também outros arquivos que possam estar modificados no working tree se houver
  try {
    execSync('git commit -m "' + msg + '"', { cwd: ROOT_DIR, stdio: "inherit" });
    console.log("✅ Commit criado com sucesso.");
  } catch {
    console.log("ℹ️  Nenhuma nova alteração pendente de commit ou já commitado.");
  }

  // 6. Criação da Tag Anotada
  const tagName = `v${versaoAlvo}`;
  try {
    execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { cwd: ROOT_DIR, stdio: "inherit" });
    console.log(`✅ Tag anotada "${tagName}" criada com sucesso.`);
  } catch (e) {
    console.warn(`⚠️  Tag ${tagName} já existia ou foi atualizada.`);
  }

  // 7. Push Sincronizado da Branch e da Tag (Sem --tags genérico)
  // Conforme AGENTS.md 28.10: bkp-a e bkp-b são Marcos de Segurança IMUTÁVEIS e NUNCA são alterados em releases rotineiras.
  executarComando(
    `git push origin main && git push origin ${tagName}`,
    `Gate 6 — Push da Branch main e da Tag ${tagName} no repositório oficial origin`,
  );

  // 8. Gate 7 — Declaração Formal de Encerramento
  console.log("\n======================================================================");
  console.log(` 🎉 RELEASE CONCLUÍDO COM SUCESSO: Versão ${versaoAlvo} Publicada!`);
  console.log(" 📜 GATE 7 DECLARADO: Normas pétreas da skill hunter cumpridas integralmente.");
  console.log("======================================================================\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error("\n🚨 FALHA CRÍTICA NO RELEASE:", err);
    process.exit(1);
  });
}
