import { aplicarCertidaoAutenticidadePdf } from "@/features/seguranca/services/certidaoPdfHelper";

/**
 * Converte um arquivo de imagem (JPEG, PNG, WebP) em um documento PDF (A4)
 * padronizado com cabeçalho de comprovação fiscal do GD Rastreamento.
 * Se o arquivo já for PDF, retorna o próprio arquivo intacto.
 */
export async function converterImagemParaPdf(
  file: File,
  meta?: { placa?: string; data?: string; tipo?: string },
): Promise<File> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (e) => reject(e);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = (e) => reject(e);
      img.onload = async () => {
        try {
          // Normaliza e redimensiona a imagem via canvas para evitar estouro de memória no jsPDF
          const maxDim = 1600;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
          }
          const jpegDataUrl = ctx ? canvas.toDataURL("image/jpeg", 0.88) : dataUrl;

          const { default: jsPDF } = await import("jspdf");
          const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
          });

          const pageW = doc.internal.pageSize.getWidth();
          const pageH = doc.internal.pageSize.getHeight();
          const margem = 15;

          // Cabeçalho institucional
          doc.setFillColor(15, 23, 42); // slate-900
          doc.rect(0, 0, pageW, 22, "F");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(255, 255, 255);
          doc.text("GD RASTREAMENTO — COMPROVANTE FISCAL DIGITALIZADO", margem, 11);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184); // slate-400
          const subtitulo = [
            meta?.tipo ? `Tipo: ${meta.tipo}` : "Comprovante de Despesa / Abastecimento",
            meta?.placa ? `Veículo: ${meta.placa}` : "",
            `Arquivo: ${file.name}`,
            `Digitalizado em: ${new Date().toLocaleString("pt-BR")}`,
          ]
            .filter(Boolean)
            .join("  |  ");
          doc.text(subtitulo, margem, 17);

          // Cálculo proporcional da imagem na página
          const maxW = pageW - margem * 2;
          const maxH = pageH - 35; // Espaço disponível abaixo do cabeçalho

          let imgW = maxW;
          let imgH = (h * imgW) / w;

          if (imgH > maxH) {
            imgH = maxH;
            imgW = (w * imgH) / h;
          }

          const posX = margem + (maxW - imgW) / 2;
          const posY = 26 + (maxH - imgH) / 2;

          doc.addImage(jpegDataUrl, "JPEG", posX, posY, imgW, imgH, undefined, "FAST");

          // Rodapé
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(
            "Documento fiscal digitalizado e arquivado para auditoria interna da frota. Válido conforme legislação tributária.",
            pageW / 2,
            pageH - 6,
            { align: "center" },
          );

          const nomePdf = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
          await aplicarCertidaoAutenticidadePdf({
            doc,
            tipoDocumento: "COMPROVANTE_FISCAL",
            nomeArquivo: nomePdf,
            descricao: subtitulo,
            forcarNovaPagina: true,
            metadataExtra: {
              placa: meta?.placa || null,
              tipo_comprovante: meta?.tipo || null,
            },
          });

          const pdfBlob = doc.output("blob");
          const novoFile = new File([pdfBlob], nomePdf, { type: "application/pdf" });

          resolve(novoFile);
        } catch (err) {
          reject(err);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
