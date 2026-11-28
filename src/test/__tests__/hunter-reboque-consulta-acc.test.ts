import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Consulta Ativa ACC (STATUS#) para Diferenciar Atraso de Reboque Real", () => {
  test("Gateway consulta STATUS# ao detectar movimento > 10 km/h com ACC=OFF e atualiza ignicaoStatus na resposta 0x15/0x21", () => {
    const gatewayPath = path.resolve(
      __dirname,
      "../../../deploy/hunter-gateway/src/hunter-gps-gateway.ts",
    );
    const src = fs.readFileSync(gatewayPath, "utf-8");

    assert.ok(
      src.includes('montarPacoteComandoGT06("STATUS#")') &&
        src.includes("ultimoStatusAccSolicitadoTs") &&
        src.includes("velocidade > 10") &&
        src.includes("conn.ignicaoStatus === false"),
      "Gateway deve consultar STATUS# com cooldown ao detectar movimento > 10 km/h com ACC=OFF",
    );

    assert.ok(
      src.includes("/\\bACC\\s*:\\s*(ON|OFF|1|0)\\b/i") &&
        src.includes("conn.ignicaoStatus = accLigado") &&
        src.includes("ultimoPacoteAccEmTs"),
      "Gateway deve atualizar conn.ignicaoStatus e veiculos.ignicao_status ao receber ACC: ON/OFF em 0x15/0x21",
    );
  });
});
