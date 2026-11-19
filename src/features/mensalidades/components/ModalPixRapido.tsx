import React, { useState } from "react";
import { Copy, Check, X, QrCode } from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalPixRapidoProps {
  aberto: boolean;
  onFechar: () => void;
  valor: number;
  qrCodeDataUrl: string;
  pixCopiaECola: string;
  descricao?: string;
}

/**
 * Componente ModalPixRapido
 * Bottom-sheet / Modal refinado de pagamento instantâneo via PIX
 * Inspirado no fluxo de 1 toque da Movitrak:
 * - QR Code em destaque com iluminação limpa
 * - Valor monetário em tipografia tabular
 * - Botão largo de cópia com feedback instantâneo
 * - Micro-interações táteis confortáveis
 */
export const ModalPixRapido: React.FC<ModalPixRapidoProps> = ({
  aberto,
  onFechar,
  valor,
  qrCodeDataUrl,
  pixCopiaECola,
  descricao = "Mensalidade do Rastreamento",
}) => {
  const [copiado, setCopiado] = useState(false);

  if (!aberto) return null;

  const handleCopiarPix = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pixCopiaECola);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = pixCopiaECola;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiado(true);
      toast.success("Código PIX copiado com sucesso! Abra seu banco para pagar.");
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      toast.error("Não foi possível copiar automaticamente o código PIX.");
    }
  };

  const valorFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onFechar}
      >
        <div
          className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom duration-200 text-slate-900 dark:text-slate-100 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Alça visual de bottom-sheet móvel */}
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

          {/* Cabeçalho do Modal: Logo PIX, Título e Valor */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {/* Ícone Estilizado do PIX */}
              <div className="w-6 h-6 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <QrCode className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">
                  Pagar com PIX
                </h3>
                <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{descricao}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-base text-slate-900 dark:text-slate-100 font-tabular">
                {valorFormatado}
              </span>
              <button
                type="button"
                onClick={onFechar}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* QR Code Limpo em Fundo Branco Puro com Cantos Arredondados */}
          <div className="my-5 flex flex-col items-center justify-center">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-inner">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code PIX para Pagamento"
                  className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                />
              ) : (
                <div className="w-48 h-48 sm:w-52 sm:h-52 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <QrCode className="w-10 h-10 animate-pulse text-orange-500" />
                  <span className="text-xs">Gerando QR Code PIX...</span>
                </div>
              )}
            </div>
          </div>

          {/* Botão Largo Preto de Cópia em 1 Toque */}
          <button
            type="button"
            onClick={handleCopiarPix}
            className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md transition-all duration-150 flex items-center justify-center gap-2 active:scale-98 cursor-pointer ${
              copiado
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white"
            }`}
          >
            {copiado ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>Código PIX Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-300" />
                <span>Copiar código PIX</span>
              </>
            )}
          </button>

          {/* Instruções de Orientação */}
          <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-3 leading-tight">
            Abra o app do seu banco, escolha PIX copia e cola e cole o código.
          </p>
        </div>
      </div>
    </ModalPortal>
  );
};
