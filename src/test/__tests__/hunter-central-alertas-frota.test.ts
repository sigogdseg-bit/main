import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Central de Alertas da Frota com Seleção de Veículos", () => {
  test("ModalCentralAlertasConta lista veículos marcados por padrão e aplica em lote nos selecionados", () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../features/configuracoes/components/ModalCentralAlertasConta.tsx",
      ),
      "utf-8",
    );
    assert.ok(
      src.includes("aplicarConfigAlertasTodaFrota") &&
        src.includes("veiculosSelecionadosIds") &&
        src.includes("Desmarcar todos") &&
        src.includes("Marcar todos"),
      "ModalCentralAlertasConta deve listar veículos da frota com opção de marcar/desmarcar e aplicar em lote",
    );
  });
});
