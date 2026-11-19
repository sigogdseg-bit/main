import React from "react";

interface PlacaMercosulBadgeProps {
  placa: string;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
  sombra?: boolean;
}

/**
 * Componente PlacaMercosulBadge
 * Renderiza uma placa veicular no padrão oficial Mercosul brasileiro com alta fidelidade visual:
 * - Faixa superior azul com inscrição "BRASIL" e bandeira nacional
 * - Fundo branco metálico com contorno nítido
 * - Tipografia monoespacada encorpada característica das estampas veiculares
 * - Padrão "unslop" e acabamento com bordas concêntricas
 */
export const PlacaMercosulBadge: React.FC<PlacaMercosulBadgeProps> = ({
  placa,
  tamanho = "md",
  className = "",
  sombra = true,
}) => {
  const placaFormatada = (placa || "ABC1D23").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const dimensoes = {
    sm: {
      largura: "w-20",
      altura: "h-7",
      faixaAzul: "h-2",
      textoBrasil: "text-[5px]",
      bandeira: "w-2.5 h-1.5",
      textoPlaca: "text-[10px]",
      borda: "rounded-md",
    },
    md: {
      largura: "w-28",
      altura: "h-10",
      faixaAzul: "h-2.5",
      textoBrasil: "text-[7px]",
      bandeira: "w-3 h-2",
      textoPlaca: "text-sm",
      borda: "rounded-lg",
    },
    lg: {
      largura: "w-36",
      altura: "h-12",
      faixaAzul: "h-3",
      textoBrasil: "text-[9px]",
      bandeira: "w-4 h-2.5",
      textoPlaca: "text-base",
      borda: "rounded-xl",
    },
  }[tamanho];

  return (
    <div
      className={`inline-flex flex-col overflow-hidden bg-white border border-slate-900/80 ${dimensoes.borda} ${dimensoes.largura} ${dimensoes.altura} ${
        sombra ? "shadow-md drop-shadow-sm" : ""
      } select-none ${className}`}
      title={`Placa Mercosul: ${placaFormatada}`}
    >
      {/* Faixa Superior Azul Mercosul */}
      <div
        className={`w-full ${dimensoes.faixaAzul} bg-[#003399] flex items-center justify-between px-1 shrink-0`}
      >
        {/* Emblema Mercosul Estilizado à esquerda */}
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-1 rounded-full bg-white/80" />
          <div className="w-0.5 h-0.5 rounded-full bg-amber-400" />
        </div>

        {/* Inscrição BRASIL centralizada */}
        <span
          className={`font-black text-white tracking-widest ${dimensoes.textoBrasil} uppercase leading-none`}
        >
          BRASIL
        </span>

        {/* Bandeira do Brasil Simplificada à direita */}
        <div
          className={`${dimensoes.bandeira} bg-[#009c3b] flex items-center justify-center rounded-[1px] relative overflow-hidden shrink-0 shadow-2xs`}
        >
          {/* Losango Amarelo */}
          <div className="w-1.5 h-1.5 bg-[#ffdf00] rotate-45 transform" />
          {/* Círculo Azul */}
          <div className="w-1 h-1 bg-[#002776] rounded-full absolute" />
        </div>
      </div>

      {/* Corpo da Placa com os Caracteres */}
      <div className="flex-1 bg-white flex items-center justify-center px-1">
        <span
          className={`font-mono font-black text-slate-900 tracking-wider ${dimensoes.textoPlaca} leading-none font-tabular`}
          style={{ letterSpacing: "0.12em" }}
        >
          {placaFormatada}
        </span>
      </div>
    </div>
  );
};
