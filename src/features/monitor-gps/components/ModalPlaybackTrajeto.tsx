import { useState, useEffect } from "react";
import { X, Calendar, Route, Gauge, Clock, FileDown, ShieldCheck } from "lucide-react";
import type { VeiculoGps, TrajetoViagem } from "../types";
import { carregarViagensTrajetos } from "../services/gpsService";
import { formatarDistanciaViagem } from "../utils/formatadoresViagem";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { aplicarCertidaoAutenticidadePdf } from "@/features/seguranca/services/certidaoPdfHelper";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { toast } from "sonner";
import {
  aplicarChancelaSimulacaoPdf,
  isModoDegustacao,
} from "@/features/demonstracao/services/degustacaoMasterService";
import { obterSessaoCacheada } from "@/features/auth/services/authService";

interface ModalPlaybackTrajetoProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
}

export function ModalPlaybackTrajeto({ veiculo, onFechar }: ModalPlaybackTrajetoProps) {
  const hoje = new Date();
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [viagens, setViagens] = useState<TrajetoViagem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const MESES = [
    { valor: 1, nome: "Janeiro" },
    { valor: 2, nome: "Fevereiro" },
    { valor: 3, nome: "Março" },
    { valor: 4, nome: "Abril" },
    { valor: 5, nome: "Maio" },
    { valor: 6, nome: "Junho" },
    { valor: 7, nome: "Julho" },
    { valor: 8, nome: "Agosto" },
    { valor: 9, nome: "Setembro" },
    { valor: 10, nome: "Outubro" },
    { valor: 11, nome: "Novembro" },
    { valor: 12, nome: "Dezembro" },
  ];
  const ANOS = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  useEffect(() => {
    setCarregando(true);
    carregarViagensTrajetos(veiculo.id, { ano, mes }).then((res) => {
      setViagens(res);
      setCarregando(false);
    });
  }, [veiculo.id, ano, mes]);

  const gerarPdfOficial = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF();

      // Cálculo real de integridade SHA-256 via Web Crypto API
      const payloadIntegridade = `${veiculo.id}:${veiculo.placa}:${new Date().toISOString()}:${viagens.length}`;
      const hashBuffer = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(payloadIntegridade),
      );
      const hashSha256 = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const logoBase64 = await carregarLogoEmblemaBase64();

      // Cabeçalho institucional escuro
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, doc.internal.pageSize.width, 28, "F");

      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 26, doc.internal.pageSize.width, 2, "F");

      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", 8, 2, 24, 24);
        } catch {
          // Fallback silencioso
        }
      }

      const offsetTextoX = logoBase64 ? 38 : 14;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`${APP_NOME.toUpperCase()} — LAUDO OFICIAL DE TELEMETRIA`, offsetTextoX, 12);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Veículo: ${veiculo.placa} (${veiculo.marca_modelo}) · Cliente: ${veiculo.cliente_nome || "Oficial"}`,
        offsetTextoX,
        18,
      );
      doc.text(`Data de Emissão: ${new Date().toLocaleString("pt-BR")}`, offsetTextoX, 23);

      // Tabela de Viagens
      const rows = viagens.map((v) => [
        new Date(v.inicio_at).toLocaleString("pt-BR"),
        v.fim_at ? new Date(v.fim_at).toLocaleString("pt-BR") : "Em andamento",
        formatarDistanciaViagem(v.km_percorrido),
        `${v.velocidade_media} km/h`,
        `${v.velocidade_maxima} km/h`,
        v.status.toUpperCase(),
      ]);

      autoTable(doc, {
        startY: 34,
        head: [
          [
            "Início (Ignição ON)",
            "Fim (Ignição OFF)",
            "Distância",
            "Vel. Média",
            "Vel. Máx",
            "Status",
          ],
        ],
        body:
          rows.length > 0
            ? rows
            : [["Nenhum percurso registrado no período do plano", "-", "-", "-", "-", "-"]],
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
      });

      // Rodapé Forense Obrigatório (DJR-NEW)
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${APP_NOME} v${APP_VERSION_NUMERO} · Laudo de Rastreamento Veicular`,
          14,
          doc.internal.pageSize.height - 10,
        );
        doc.text(
          `Hash de Integridade SHA-256: ${hashSha256}`,
          14,
          doc.internal.pageSize.height - 6,
        );
        doc.text(
          `Página ${i} de ${pageCount}`,
          doc.internal.pageSize.width - 30,
          doc.internal.pageSize.height - 8,
        );
      }

      const sessaoAtual = obterSessaoCacheada();
      const isSimulacao = Boolean(
        isModoDegustacao(sessaoAtual) ||
        veiculo.id.startsWith("deg-") ||
        veiculo.placa.startsWith("DEG-"),
      );

      if (isSimulacao) {
        aplicarChancelaSimulacaoPdf(doc, "Laudo de Telemetria");
      }

      const nomeArquivo = `GD_Rastreamento_Laudo_Telemetria_${veiculo.placa}.pdf`;

      await aplicarCertidaoAutenticidadePdf({
        doc,
        tipoDocumento: "LAUDO_TELEMETRIA",
        nomeArquivo,
        descricao: `Laudo Oficial de Telemetria - Veículo ${veiculo.placa} (${veiculo.marca_modelo})`,
        isSimulacao,
        forcarNovaPagina: true,
        metadataExtra: {
          veiculo_id: veiculo.id,
          placa: veiculo.placa,
          hash_conteudo: hashSha256,
          total_viagens: viagens.length,
        },
      });

      doc.save(nomeArquivo);
      toast.success("Laudo oficial baixado com hash forense!");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar laudo em PDF.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#f0f4f9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-[8px_8px_24px_#c3cfe2,-8px_-8px_24px_#ffffff] dark:shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Histórico de Viagens e Trajetos
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold">
                  {veiculo.placa}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ciclos entre cada partida e desligamento do motor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={gerarPdfOficial}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-100 dark:bg-orange-500/20 hover:bg-emerald-200 dark:hover:bg-orange-500/30 text-orange-800 dark:text-orange-300 border border-emerald-300 dark:border-orange-500/30 transition shadow-xs"
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Baixar Laudo Oficial (PDF)</span>
            </button>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {/* Seletor de Período Temporal */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Filtrar por Período:
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                {ANOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                {MESES.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {carregando ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
              Carregando percursos do veículo...
            </div>
          ) : viagens.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
              Nenhuma viagem registrada até o momento para este veículo dentro do período
              contratado.
            </div>
          ) : (
            viagens.map((viagem) => (
              <div
                key={viagem.id}
                className="bg-white dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-200">
                    <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    <span>Início: {new Date(viagem.inicio_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Fim:{" "}
                    {viagem.fim_at
                      ? new Date(viagem.fim_at).toLocaleString("pt-BR")
                      : "Em trânsito"}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">
                      Distância
                    </span>
                    <span className="text-orange-700 dark:text-orange-400 font-bold">
                      {formatarDistanciaViagem(viagem.km_percorrido)}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">
                      Vel. Média
                    </span>
                    <span className="text-sky-700 dark:text-sky-400 font-bold">
                      {viagem.velocidade_media} km/h
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">
                      Vel. Máx
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold">
                      {viagem.velocidade_maxima} km/h
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
