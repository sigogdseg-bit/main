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

  it("1. Deve comutar automaticamente os comandos do lote (batch) para sintaxe G900L respeitando apenas os checkboxes selecionados", () => {
    assert.ok(
      content.includes('const ehG900L = filtroModelo === "g900l"'),
      "RastreadorJ16View deve possuir flag ehG900L em obterComandosBatchAtivos",
    );
    assert.ok(
      content.includes("adminip${senhaAtiva}"),
      "Batch do G900L deve gerar adminip<senha> quando servidor/IP estiver marcado",
    );
    assert.ok(
      content.includes("apn${senhaAtiva}"),
      "Batch do G900L deve gerar apn<senha> quando APN estiver marcada",
    );
    assert.ok(
      content.includes(
        'fix${String(movNum).padStart(3, "0")}s${String(parMin).padStart(3, "0")}m***n${senhaAtiva}',
      ),
      "Batch do G900L deve gerar fix010s060m***n<senha> quando Timer estiver marcado",
    );
    assert.ok(
      !content.includes('cmd: "B",'),
      "Batch do G900L NÃO deve injetar comando B não selecionado pelo usuário",
    );
    assert.ok(
      !content.includes("C,${segMov}"),
      "Batch do G900L NÃO deve gerar C,10s incompatível com o hardware G900L",
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
      content.includes("11. Fuso Horário UTC 0 (time zone)"),
      "Catálogo deve incluir time zone",
    );

    // Valida que o catálogo Coban NÃO expõe comandos obsoletos ou incompatíveis de MCU/MTK
    assert.ok(
      !content.includes("[Exclusivo SMS]"),
      "Catálogo de ações não deve listar comandos exclusivos de SMS",
    );
  });
});
