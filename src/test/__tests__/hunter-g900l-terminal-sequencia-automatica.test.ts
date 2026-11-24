import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("HUNTER-GUARDIAN — Sequência Automática e Catálogo de Comandos G900L no Terminal", () => {
  const filePath = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/RastreadorJ16View.tsx",
  );
  const content = fs.readFileSync(filePath, "utf-8");

  it("1. Deve comutar automaticamente a sequência de lote (batch) para comandos TCP Coban válidos ao selecionar G900L", () => {
    assert.ok(
      content.includes('if (filtroModelo === "g900l")'),
      "RastreadorJ16View deve possuir condicional específica para filtroModelo === 'g900l'",
    );
    assert.ok(
      content.includes("Frequência de Transmissão Coban TCP"),
      "Batch do G900L deve gerar frequência de transmissão TCP (C,<timer>s)",
    );
    assert.ok(
      content.includes("Validação Imediata de Posição Coban TCP (B)"),
      "Batch do G900L deve gerar validação imediata de posição (B)",
    );

    // Valida que o lote TCP do G900L NÃO gera comandos exclusivos de SMS
    const blocoBatchG900L = content.slice(
      content.indexOf('if (filtroModelo === "g900l")'),
      content.indexOf("// BLOCO 1: Conectividade Básica"),
    );
    assert.ok(
      !blocoBatchG900L.includes("adminip${senhaAtiva}"),
      "Batch TCP não deve conter adminip SMS",
    );
    assert.ok(!blocoBatchG900L.includes("apn${senhaAtiva}"), "Batch TCP não deve conter apn SMS");
    assert.ok(
      !blocoBatchG900L.includes("time zone${senhaAtiva}"),
      "Batch TCP não deve conter time zone SMS",
    );
    assert.ok(
      !blocoBatchG900L.includes("reset${senhaAtiva}"),
      "Batch TCP não deve conter reset SMS",
    );
  });

  it("2. Deve comutar o catálogo de comandos para os 19 comandos nativos G900L quando G900L estiver ativo", () => {
    assert.ok(
      content.includes("Catálogo de Comandos do Hardware G900L (Coban)"),
      "Título da seção deve comutar dinamicamente para G900L",
    );
    assert.ok(content.includes("1. Consultar Parâmetros (check)"), "Catálogo deve incluir check");
    assert.ok(content.includes("2. Consultar IP e APN (IPAPN)"), "Catálogo deve incluir IPAPN");
    assert.ok(content.includes("3. Timer Movimento e Parado (fix)"), "Catálogo deve incluir fix");
    assert.ok(
      content.includes("4. Inflexão de Curva (ANGLE - Mín. 25°)"),
      "Catálogo deve incluir ANGLE 25",
    );
    assert.ok(content.includes("5. Sono Profundo ao Parar (sleep)"), "Catálogo deve incluir sleep");
    assert.ok(content.includes("6. Heartbeat Periódico (hbt)"), "Catálogo deve incluir hbt");
    assert.ok(content.includes("7. Bloqueio Veicular Relé (stop)"), "Catálogo deve incluir stop");
    assert.ok(
      content.includes("8. Desbloqueio Veicular Relé (resume)"),
      "Catálogo deve incluir resume",
    );
    assert.ok(content.includes("9. Configurar APN de Dados (apn)"), "Catálogo deve incluir apn");
    assert.ok(
      content.includes("10. Servidor IP e Porta (adminip)"),
      "Catálogo deve incluir adminip",
    );
    assert.ok(
      content.includes("11. Fuso Horário Brasília (time zone)"),
      "Catálogo deve incluir time zone",
    );

    // Valida que o catálogo Coban NÃO expõe comandos obsoletos ou incompatíveis de MCU/MTK
    assert.ok(
      !content.includes("[Exclusivo SMS]"),
      "Catálogo de ações não deve listar comandos exclusivos de SMS",
    );
  });
});
