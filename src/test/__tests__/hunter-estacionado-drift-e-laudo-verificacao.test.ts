import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcularStatusOperacionalFrontend } from "../../features/monitor-gps/hooks/useGpsRealtime";
import { obterCorStatusVeiculo } from "../../features/monitor-gps/utils/vehicle3dIcons";
import { gerarLaudoPericialForensePdf } from "../../features/seguranca/services/laudoPericialPdfService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Estacionado com Drift GNSS Baixo e Registro Forense do Laudo Pericial", () => {
  describe("1. Telemetria: ignição desligada + drift <= 10 km/h mantém Estacionado (Azul)", () => {
    test("ignicao false com velocidade 4 km/h mantém status estacionado e cor Azul #0284C7", () => {
      const status = calcularStatusOperacionalFrontend("veic-llx1e37", false, 4, false, "em_rota");
      assert.equal(status, "estacionado");

      const cor = obterCorStatusVeiculo({
        velocidade: 4,
        ignicao: false,
        status_operacional: "estacionado",
      });
      assert.equal(cor, "#0284C7");

      // Mesmo que o payload tenha status_operacional legado, ignicao false + velocidade 4 mantém Azul
      const corComStatusLegado = obterCorStatusVeiculo({
        velocidade: 4,
        ignicao: false,
        status_operacional: "em_rota",
      });
      assert.equal(corComStatusLegado, "#0284C7");
    });

    test("ignicao false com velocidade 10 km/h (limite do jitter parado) ainda é estacionado", () => {
      const status = calcularStatusOperacionalFrontend("veic-llx-limite", false, 10, false);
      assert.equal(status, "estacionado");
      assert.equal(obterCorStatusVeiculo({ velocidade: 10, ignicao: false }), "#0284C7");
    });

    test("ignicao false com velocidade 25 km/h (reboque / guincho real) marca em_rota e Verde #10B981", () => {
      const status = calcularStatusOperacionalFrontend("veic-guincho", false, 25, false);
      assert.equal(status, "em_rota");
      assert.equal(obterCorStatusVeiculo({ velocidade: 25, ignicao: false }), "#10B981");
    });

    test("ignicao true com velocidade 4 km/h marca em_rota e Verde #10B981", () => {
      const status = calcularStatusOperacionalFrontend("veic-rodando", true, 4, false);
      assert.equal(status, "em_rota");
      assert.equal(obterCorStatusVeiculo({ velocidade: 4, ignicao: true }), "#10B981");
    });
  });

  describe("2. Laudo Pericial Forense e Verificação Pública (/verificar)", () => {
    test("laudoPericialPdfService registra o documento em documentos_emitidos e lista 18 módulos sem MFA/marca d'água/&", async () => {
      const pdfServicePath = path.resolve(
        __dirname,
        "../../features/seguranca/services/laudoPericialPdfService.ts",
      );
      const src = fs.readFileSync(pdfServicePath, "utf-8");

      assert.ok(src.includes("registrarDocumentoEmitido("), "Deve registrar documento emitido");
      assert.ok(src.includes('tipo_documento: "LAUDO_PERICIAL"'));
      assert.ok(src.includes("selo: seloSgd"));
      assert.ok(src.includes("codigo: codigoVerificacao"));
      assert.ok(src.includes("hash_conteudo: hashSha256"));

      // Alinhamento com os 18 módulos pertinentes (sem Módulo 20 MFA e sem máscara/marca d'água no DLP)
      assert.ok(src.includes('"18. Verif. Lote"'));
      assert.ok(!src.includes('"21. RLS Master"'));
      assert.ok(!src.includes("Mascara de chaves"));
      assert.ok(src.includes("sem marca d'agua"));
      assert.ok(!src.includes("&"), "Não deve conter o caractere proibido &");

      const resultado = await gerarLaudoPericialForensePdf({
        emissor: "SuperADM Teste",
        perfilEmissor: "SuperAdmin Governança",
        isSimulacao: false,
        statusCibernetico: "verde",
        eficienciaGlobal: "4.60",
        matrizRiscoMedia: 4.6,
        totalModulosAtivos: 18,
        totalVetoresMitigados: 51,
      });

      assert.match(resultado.seloSgd, /^SGD-[A-F0-9]{8}$/);
      assert.match(resultado.codigoVerificacao, /^[A-F0-9]{6}$/);
      assert.equal(resultado.hashSha256.length, 64);
    });

    test("endpoint /api/contratos/verificar em src/server.ts consulta metadata->>selo, metadata->>codigo e metadata->>hash_conteudo", () => {
      const serverPath = path.resolve(__dirname, "../../server.ts");
      const serverSrc = fs.readFileSync(serverPath, "utf-8");

      assert.ok(serverSrc.includes('.filter("metadata->>selo", "ilike", idUpper)'));
      assert.ok(serverSrc.includes('.filter("metadata->>codigo", "ilike", idUpper)'));
      assert.ok(serverSrc.includes('.filter("metadata->>numero_contrato", "ilike", idUpper)'));
      assert.ok(serverSrc.includes('.filter("metadata->>hash_conteudo", "eq", idLower)'));
    });

    test("src/routes/verificar.tsx suporta fallback para hashes candidatos embutidos ao enviar PDF", () => {
      const verificarPath = path.resolve(__dirname, "../../routes/verificar.tsx");
      const verificarSrc = fs.readFileSync(verificarPath, "utf-8");

      assert.ok(verificarSrc.includes("extrairHashesCandidatosPdf"));
    });
  });
});
