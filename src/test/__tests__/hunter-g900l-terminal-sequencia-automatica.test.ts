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

  it("2. Deve comutar o catálogo de comandos para os 10 comandos TCP Coban quando G900L estiver ativo", () => {
    assert.ok(
      content.includes("Catálogo de Comandos do Hardware G900L (Coban)"),
      "Título da seção deve comutar dinamicamente para G900L",
    );
    assert.ok(
      content.includes("Localização em Tempo Real (B) [TCP]"),
      "Catálogo deve incluir comando TCP B",
    );
    assert.ok(
      content.includes("Intervalo em Movimento 30s (C,30s) [TCP]"),
      "Catálogo deve incluir comando TCP C,30s",
    );
    assert.ok(
      content.includes("Intervalo em Movimento 10s (C,10s) [TCP]"),
      "Catálogo deve incluir comando TCP C,10s",
    );
    assert.ok(
      content.includes("Parar Envio Contínuo (A) [TCP]"),
      "Catálogo deve incluir comando TCP A",
    );
    assert.ok(
      content.includes("Bloqueio Veicular Relé (J) [TCP]"),
      "Catálogo deve incluir comando TCP J",
    );
    assert.ok(
      content.includes("Desbloqueio Veicular Relé (K) [TCP]"),
      "Catálogo deve incluir comando TCP K",
    );
    assert.ok(
      content.includes("Armar Alarme de Segurança (L) [TCP]"),
      "Catálogo deve incluir comando TCP L",
    );
    assert.ok(content.includes("Desarmar Alarme (M) [TCP]"), "Catálogo deve incluir comando TCP M");
    assert.ok(
      content.includes("Cancelar Alarmes Ativos (E) [TCP]"),
      "Catálogo deve incluir comando TCP E",
    );
    assert.ok(
      content.includes("Alerta de Limite de Velocidade 80 km/h (H,080) [TCP]"),
      "Catálogo deve incluir comando TCP H,080",
    );

    // Valida que o catálogo Coban NÃO expõe comandos exclusivos de SMS
    assert.ok(
      !content.includes("[Exclusivo SMS]"),
      "Catálogo de ações não deve listar comandos exclusivos de SMS",
    );
  });
});
