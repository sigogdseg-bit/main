import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("Hunter — Blindagem de RLS nas 3 Telas: Rastreadores, Frota e Manutenção (DJR-NEW)", () => {
  test("1. server.ts deve conter a rota /api/rastreadores com Service Role", async () => {
    const serverCode = await fs.readFile(
      new URL("../../../src/server.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      serverCode.includes("handleApiRastreadores"),
      "server.ts deve declarar a funcao handleApiRastreadores",
    );
    assert.ok(
      serverCode.includes('url.pathname !== "/api/rastreadores"'),
      "server.ts deve tratar /api/rastreadores",
    );
    assert.ok(
      serverCode.includes("const rastreadoresResponse = await handleApiRastreadores"),
      "server.ts deve interceptar /api/rastreadores no router principal",
    );
  });

  test("2. RastreadorJ16View.tsx deve priorizar a rota /api/rastreadores", async () => {
    const viewCode = await fs.readFile(
      new URL("../../../src/features/seguranca/components/RastreadorJ16View.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(
      viewCode.includes('fetch("/api/rastreadores"'),
      "RastreadorJ16View deve chamar /api/rastreadores com Service Role",
    );
  });

  test("3. manutencaoService.ts deve priorizar /api/clientes e /api/veiculos com Service Role", async () => {
    const serviceCode = await fs.readFile(
      new URL("../../../src/features/manutencao/services/manutencaoService.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      serviceCode.includes('fetch("/api/clientes"'),
      "carregarClientesParaManutencao deve chamar /api/clientes",
    );
    assert.ok(
      serviceCode.includes("/api/veiculos"),
      "carregarVeiculosDoCliente deve chamar /api/veiculos",
    );
  });

  test("4. FrotaAnalyticsView.tsx deve priorizar /api/veiculos com Service Role e iniciar com dias visiveis", async () => {
    const frotaCode = await fs.readFile(
      new URL("../../../src/features/frota/components/FrotaAnalyticsView.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(
      frotaCode.includes("/api/veiculos"),
      "FrotaAnalyticsView deve consultar /api/veiculos com Service Role",
    );
    assert.ok(
      frotaCode.includes(
        "const [ocultarSemDeslocamento, setOcultarSemDeslocamento] = useState(false);",
      ),
      "ocultarSemDeslocamento deve iniciar como false para manter visibilidade dos dias",
    );
  });
});
