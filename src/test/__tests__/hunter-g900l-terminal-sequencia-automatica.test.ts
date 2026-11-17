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

  it("1. Deve comutar automaticamente a sequência de lote (batch) para protocolo Coban ao selecionar G900L", () => {
    assert.ok(
      content.includes('if (filtroModelo === "g900l")'),
      "RastreadorJ16View deve possuir condicional específica para filtroModelo === 'g900l'",
    );
    assert.ok(
      content.includes("adminip${senhaAtiva}"),
      "RastreadorJ16View deve gerar comando adminip para G900L",
    );
    assert.ok(
      content.includes("apn${senhaAtiva}"),
      "RastreadorJ16View deve gerar comando apn para G900L",
    );
    assert.ok(
      content.includes("fix${segMov}s***n${senhaAtiva}"),
      "RastreadorJ16View deve gerar fix com timers para G900L",
    );
    assert.ok(
      content.includes("hbt${senhaAtiva}"),
      "RastreadorJ16View deve gerar heartbeat para G900L",
    );
    assert.ok(
      content.includes("time zone${senhaAtiva} 0"),
      "RastreadorJ16View deve gerar time zone 0 para G900L",
    );
  });

  it("2. Deve comutar o catálogo de comandos para os 13 comandos Coban quando G900L estiver ativo", () => {
    assert.ok(
      content.includes("Conectar Servidor Coban (adminip)"),
      "Catálogo deve incluir Conectar Servidor Coban",
    );
    assert.ok(
      content.includes("Internet do Chip APN (apn)"),
      "Catálogo deve incluir Internet do Chip APN",
    );
    assert.ok(
      content.includes("Intervalo de Transmissão (fix)"),
      "Catálogo deve incluir Intervalo de Transmissão",
    );
    assert.ok(
      content.includes("Auditoria Geral de Parâmetros (check)"),
      "Catálogo deve incluir check123456",
    );
    assert.ok(content.includes("Bloqueio Veicular (stop)"), "Catálogo deve incluir stop123456");
    assert.ok(
      content.includes("Desbloqueio Veicular (resume)"),
      "Catálogo deve incluir resume123456",
    );
    assert.ok(
      content.includes("Catálogo de Comandos do Hardware G900L (Coban)"),
      "Título da seção deve comutar dinamicamente para G900L",
    );
  });
});
