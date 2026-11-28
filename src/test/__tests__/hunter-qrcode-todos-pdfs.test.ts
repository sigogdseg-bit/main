import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { aplicarCertidaoAutenticidadePdf } from "../../features/seguranca/services/certidaoPdfHelper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — QR Code de Autenticidade em Todos os PDFs do Sistema", () => {
  test("1. Helper aplicarCertidaoAutenticidadePdf gera Selo, Código, Hash e QR Code em mm e pt sem '&'", async () => {
    const helperPath = path.resolve(
      __dirname,
      "../../features/seguranca/services/certidaoPdfHelper.ts",
    );
    const src = fs.readFileSync(helperPath, "utf-8");
    assert.ok(!src.includes("&"), "Helper não deve conter o caractere proibido &");

    const docMm = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    docMm.text("Relatório Teste MM", 14, 20);
    const resMm = await aplicarCertidaoAutenticidadePdf({
      doc: docMm,
      tipoDocumento: "TESTE_MM",
      nomeArquivo: "teste_mm.pdf",
      descricao: "Teste unitário mm",
      registrarNoBanco: false,
    });
    assert.match(resMm.seloSgd, /^SGD-[A-F0-9]{8}$/);
    assert.match(resMm.codigoVerificacao, /^[A-F0-9]{6}$/);
    assert.equal(resMm.hashSha256.length, 64);
    assert.ok(resMm.linkVerificacao.includes("https://gd.oficial.tec.br/verificar?selo=SGD-"));

    const docPt = new jsPDF("p", "pt", "a4");
    docPt.text("Relatório Teste PT", 40, 60);
    const resPt = await aplicarCertidaoAutenticidadePdf({
      doc: docPt,
      tipoDocumento: "TESTE_PT",
      nomeArquivo: "teste_pt.pdf",
      descricao: "Teste unitário pt",
      isSimulacao: true,
      forcarNovaPagina: true,
      registrarNoBanco: false,
    });
    assert.match(resPt.seloSgd, /^SGD-SIM-[A-F0-9]{8}$/);
    assert.equal((docPt as any).internal.getNumberOfPages(), 2);
  });

  test("2. Todos os geradores de PDF do sistema aplicam certidaoPdfHelper ou QRCode de verificação", () => {
    const arquivos = [
      "../../features/seguranca/services/laudoPericialPdfService.ts",
      "../../features/financeiro/services/propostaPdfService.ts",
      "../../features/financeiro/services/financeiroService.ts",
      "../../shared/lib/comprovantePdfHelper.ts",
      "../../features/clientes/services/geradorContratoPdfServer.ts",
      "../../features/monitor-gps/components/ModalPlaybackTrajeto.tsx",
      "../../features/monitor-gps/components/RefazerTrajetoModal.tsx",
      "../../features/frota/components/FrotaAnalyticsView.tsx",
      "../../features/clientes/components/ClienteVeiculosAnalyticsModal.tsx",
      "../../features/chat/services/whatsappAutoMonitoramentoService.ts",
    ];

    for (const rel of arquivos) {
      const abs = path.resolve(__dirname, rel);
      const content = fs.readFileSync(abs, "utf-8");
      const temCertidao =
        content.includes("aplicarCertidaoAutenticidadePdf") ||
        (content.includes("QRCode.toDataURL") && content.includes("gd.oficial.tec.br/verificar"));
      assert.ok(temCertidao, `${rel} deve incorporar QR Code de autenticidade`);
    }

    const whatsappSrc = fs.readFileSync(
      path.resolve(__dirname, "../../features/chat/services/whatsappAutoMonitoramentoService.ts"),
      "utf-8",
    );
    assert.ok(
      whatsappSrc.includes("selo: cert.seloSgd") &&
        whatsappSrc.includes("codigo: cert.codigoVerificacao") &&
        whatsappSrc.includes("hash_conteudo: cert.hashSha256") &&
        !whatsappSrc.includes("emissorNome: remetenteLimpo") &&
        !whatsappSrc.includes("emissor_nome: remetenteLimpo"),
      "whatsappAutoMonitoramentoService deve gravar selo, codigo, hash_conteudo e nome do usuário cadastrado",
    );
  });
});
