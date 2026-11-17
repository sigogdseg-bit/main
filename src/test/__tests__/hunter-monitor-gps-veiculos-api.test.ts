import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

describe("Hunter — Monitor GPS: Rota Segura e Carregamento de Frota", () => {
  it("1. server.ts deve conter a rota /api/veiculos/monitor para consulta com Service Role", () => {
    const serverContent = fs.readFileSync("src/server.ts", "utf8");
    assert.ok(
      serverContent.includes("/api/veiculos/monitor"),
      "server.ts deve tratar /api/veiculos/monitor",
    );
  });

  it("2. gpsService.ts deve priorizar /api/veiculos/monitor antes de consultas diretas", () => {
    const gpsServiceContent = fs.readFileSync(
      "src/features/monitor-gps/services/gpsService.ts",
      "utf8",
    );
    assert.ok(
      gpsServiceContent.includes("/api/veiculos/monitor"),
      "gpsService.ts deve consultar /api/veiculos/monitor",
    );
  });

  it("3. gpsService.ts deve conter fallback seguro sem join de clientes para imunidade a RLS", () => {
    const gpsServiceContent = fs.readFileSync(
      "src/features/monitor-gps/services/gpsService.ts",
      "utf8",
    );
    assert.ok(
      gpsServiceContent.includes("semJoin"),
      "gpsService.ts deve conter fallback sem join de clientes",
    );
  });

  it("4. server.ts deve conter a rota /api/veiculos/saude para diagnóstico em tempo real", () => {
    const serverContent = fs.readFileSync("src/server.ts", "utf8");
    assert.ok(
      serverContent.includes("/api/veiculos/saude"),
      "server.ts deve tratar /api/veiculos/saude",
    );
  });

  it("5. gpsService.ts deve priorizar /api/veiculos/saude no teste de comunicação e diagnóstico", () => {
    const gpsServiceContent = fs.readFileSync(
      "src/features/monitor-gps/services/gpsService.ts",
      "utf8",
    );
    assert.ok(
      gpsServiceContent.includes("/api/veiculos/saude"),
      "gpsService.ts deve consultar /api/veiculos/saude",
    );
  });

  it("6. Suporte universal a modelos de hardware G900L e J16 no Cockpit e comandos", () => {
    const gpsServiceContent = fs.readFileSync(
      "src/features/monitor-gps/services/gpsService.ts",
      "utf8",
    );
    assert.ok(
      gpsServiceContent.includes("isG900L"),
      "gpsService.ts deve diferenciar o hardware G900L",
    );
    assert.ok(
      gpsServiceContent.includes("stop123456"),
      "gpsService.ts deve suportar comando de corte do G900L",
    );
  });

  it("7. Proibição estrita do caractere comercial em gpsService", () => {
    const gpsServiceContent = fs.readFileSync(
      "src/features/monitor-gps/services/gpsService.ts",
      "utf8",
    );
    const linhas = gpsServiceContent.split("\n");
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      // Verifica comentários e strings que possam ter o caractere comercial isolado
      if (linha.includes("//") || linha.includes("/*") || linha.includes("*")) {
        assert.ok(
          !linha.includes(" & "),
          `Linha ${i + 1} contém caractere comercial proibido: ${linha}`,
        );
      }
    }
  });
});
