import React, { useState } from "react";
import type { TipoVeiculo } from "@/features/monitor-gps/types";

interface VehiclePhotoPlaceholderProps {
  fotoUrl?: string | null;
  tipo?: TipoVeiculo | string;
  marcaModelo: string;
  className?: string;
  alt?: string;
}

/**
 * Componente VehiclePhotoPlaceholder
 * Exibe a fotografia real do veículo (caso cadastrada) ou renderiza um estúdio fotográfico
 * profissional com gradiente e silhueta estética do veículo de acordo com a categoria:
 * moto, carro, suv, camionete, van, caminhao, ambulancia, etc.
 * Respeita a regra de "One System" e estética fotográfica de alto padrão.
 */
export const VehiclePhotoPlaceholder: React.FC<VehiclePhotoPlaceholderProps> = ({
  fotoUrl,
  tipo = "carro",
  marcaModelo,
  className = "",
  alt,
}) => {
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [erroArteEstudio, setErroArteEstudio] = useState(false);

  // Se houver URL válida e sem erro de carregamento, renderiza a foto real
  if (fotoUrl && !erroCarregamento) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-slate-900 ${className}`}>
        <img
          src={fotoUrl}
          alt={alt || marcaModelo}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          onError={() => setErroCarregamento(true)}
          loading="lazy"
        />
        {/* Vinheta suave de borda para contraste superior dos badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/40 pointer-events-none" />
      </div>
    );
  }

  // Normalização refinada combinando tipo formal e nome do modelo
  const normalizarTipo = (t?: string, nome?: string): string => {
    const str = `${t || ""} ${nome || ""}`.toLowerCase();
    if (
      str.includes("moto") ||
      str.includes("cg 160") ||
      str.includes("titan") ||
      str.includes("fan") ||
      str.includes("start") ||
      str.includes("biz") ||
      str.includes("bros") ||
      str.includes("xre") ||
      str.includes("fazer") ||
      str.includes("factor") ||
      str.includes("yamaha") ||
      str.includes("honda cg")
    ) {
      return "moto";
    }
    if (
      str.includes("camionete") ||
      str.includes("picape") ||
      str.includes("pickup") ||
      str.includes("l200") ||
      str.includes("triton") ||
      str.includes("hilux") ||
      str.includes("ranger") ||
      str.includes("s10") ||
      str.includes("amarok") ||
      str.includes("frontier") ||
      str.includes("strada") ||
      str.includes("saveiro") ||
      str.includes("montana") ||
      str.includes("toro") ||
      str.includes("oroch")
    ) {
      return "camionete";
    }
    if (
      str.includes("suv") ||
      str.includes("compass") ||
      str.includes("renegade") ||
      str.includes("creta") ||
      str.includes("kicks") ||
      str.includes("t-cross") ||
      str.includes("tracker") ||
      str.includes("duster") ||
      str.includes("hr-v") ||
      str.includes("corolla cross") ||
      str.includes("commander") ||
      str.includes("sw4")
    ) {
      return "suv";
    }
    if (
      str.includes("van") ||
      str.includes("furgao") ||
      str.includes("furgão") ||
      str.includes("sprinter") ||
      str.includes("master") ||
      str.includes("ducato") ||
      str.includes("transit") ||
      str.includes("kombi")
    ) {
      return "van";
    }
    if (
      str.includes("caminhao") ||
      str.includes("caminhão") ||
      str.includes("carreta") ||
      str.includes("reboque") ||
      str.includes("guincho") ||
      str.includes("delivery") ||
      str.includes("accelo") ||
      str.includes("constellation") ||
      str.includes("atego")
    ) {
      return "caminhao";
    }
    if (str.includes("onibus") || str.includes("ônibus") || str.includes("marcopolo")) {
      return "onibus";
    }
    if (
      str.includes("jetski") ||
      str.includes("jet ski") ||
      str.includes("lancha") ||
      str.includes("barco")
    ) {
      return "jetski";
    }
    if (str.includes("posto") || str.includes("propriedade") || str.includes("vigilante")) {
      return "propriedade";
    }
    return "carro";
  };

  const categoria = normalizarTipo(tipo, marcaModelo);

  // Mapa de artes fotográficas de estúdio do Módulo IMAGEM (dev-modulos)
  const ARTES_ESTUDIO: Record<string, string> = {
    camionete: "/veiculos/camionete.png",
    carro: "/veiculos/carro.png",
    suv: "/veiculos/suv.png",
    moto: "/veiculos/moto.png",
    caminhao: "/veiculos/caminhao.png",
    van: "/veiculos/van.png",
    onibus: "/veiculos/onibus.png",
  };

  const arteEstudioUrl = ARTES_ESTUDIO[categoria];

  // Se houver arte fotográfica de estúdio disponível para a categoria e sem erro de carregamento
  if (arteEstudioUrl && !erroArteEstudio) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-slate-950 ${className}`}>
        <img
          src={arteEstudioUrl}
          alt={alt || marcaModelo}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          onError={() => setErroArteEstudio(true)}
          loading="lazy"
        />
        {/* Vinheta tática de borda para contraste superior dos badges e da placa */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 pointer-events-none" />
      </div>
    );
  }

  // Paletas de estúdio refinadas por categoria de veículo
  const configuracoesEstudio: Record<
    string,
    {
      gradienteFundo: string;
      corDestaque: string;
      svgPath: React.ReactNode;
      rotuloCategoria: string;
    }
  > = {
    moto: {
      gradienteFundo: "from-[#232733] via-[#1a1e28] to-[#101319]",
      corDestaque: "#ef4444",
      rotuloCategoria: "Motocicleta",
      svgPath: (
        <svg
          viewBox="0 0 160 100"
          className="w-36 h-24 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Roda Traseira */}
          <circle cx="34" cy="70" r="18" stroke="#334155" strokeWidth="6" fill="#0f172a" />
          <circle cx="34" cy="70" r="10" stroke="#64748b" strokeWidth="2" />
          <circle cx="34" cy="70" r="4" fill="#94a3b8" />
          {/* Roda Dianteira */}
          <circle cx="126" cy="70" r="18" stroke="#334155" strokeWidth="6" fill="#0f172a" />
          <circle cx="126" cy="70" r="10" stroke="#64748b" strokeWidth="2" />
          <circle cx="126" cy="70" r="4" fill="#94a3b8" />
          {/* Chassi e Motor */}
          <path
            d="M34 70 L60 62 L80 72 L65 74 Z"
            fill="#1e293b"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <path
            d="M60 62 L90 52 L110 50 L126 70"
            stroke="#cbd5e1"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Tanque e Carenagem Vermelha Esportiva */}
          <path
            d="M56 46 C64 36, 88 34, 104 42 C108 45, 102 52, 94 54 C82 56, 68 56, 56 46 Z"
            fill="url(#gradienteMoto)"
          />
          {/* Banco Conforto */}
          <path
            d="M38 46 C44 42, 54 42, 64 45 C60 52, 44 54, 38 46 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1.5"
          />
          {/* Guidão e Painel */}
          <path
            d="M104 42 L110 30 L104 28"
            stroke="#94a3b8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="112" cy="30" r="2.5" fill="#f87171" />
          {/* Escapamento Cromado */}
          <path
            d="M66 72 L86 70 L110 66"
            stroke="#94a3b8"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="gradienteMoto" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="50%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#991b1b" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    carro: {
      gradienteFundo: "from-[#1e293b] via-[#0f172a] to-[#090d16]",
      corDestaque: "#f97316",
      rotuloCategoria: "Carro de Passeio",
      svgPath: (
        <svg
          viewBox="0 0 180 80"
          className="w-40 h-20 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Silhueta da Carroceria */}
          <path
            d="M16 54 L32 54 C34 44, 48 44, 52 54 L128 54 C132 44, 146 44, 150 54 L168 54 C172 54, 174 50, 172 46 L158 36 L124 22 L62 22 L36 34 L18 42 C14 44, 12 48, 16 54 Z"
            fill="url(#gradienteCarro)"
          />
          {/* Vidros com Reflexo de Estúdio */}
          <path
            d="M66 25 L120 25 L148 36 L60 36 Z"
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth="0.8"
            strokeOpacity="0.6"
          />
          <path d="M96 25 L96 36" stroke="#1e293b" strokeWidth="2" />
          {/* Farol Dianteiro com Brilho */}
          <path
            d="M166 44 L172 46 L168 50 Z"
            fill="#fef08a"
            filter="drop-shadow(0 0 4px #eab308)"
          />
          {/* Lanterna Traseira Vermelha */}
          <path d="M16 46 L20 45 L18 50 Z" fill="#ef4444" />
          {/* Roda Traseira */}
          <circle cx="42" cy="54" r="14" stroke="#334155" strokeWidth="5" fill="#0f172a" />
          <circle cx="42" cy="54" r="7" stroke="#64748b" strokeWidth="2" fill="#1e293b" />
          {/* Roda Dianteira */}
          <circle cx="139" cy="54" r="14" stroke="#334155" strokeWidth="5" fill="#0f172a" />
          <circle cx="139" cy="54" r="7" stroke="#64748b" strokeWidth="2" fill="#1e293b" />
          <defs>
            <linearGradient id="gradienteCarro" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fdba74" />
              <stop offset="40%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#9a3412" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    suv: {
      gradienteFundo: "from-[#20293a] via-[#131b28] to-[#0c121d]",
      corDestaque: "#3b82f6",
      rotuloCategoria: "SUV Premium",
      svgPath: (
        <svg
          viewBox="0 0 180 85"
          className="w-40 h-20 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Carroceria SUV Alta */}
          <path
            d="M16 58 L32 58 C34 46, 48 46, 52 58 L128 58 C132 46, 146 46, 150 58 L168 58 C172 58, 174 54, 172 48 L160 38 L138 20 L50 20 L32 36 L16 46 C12 50, 12 54, 16 58 Z"
            fill="url(#gradienteSuv)"
          />
          {/* Vidros Amplos */}
          <path
            d="M54 23 L132 23 L152 38 L48 38 Z"
            fill="#0f172a"
            stroke="#60a5fa"
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
          <path d="M88 23 L88 38" stroke="#1e293b" strokeWidth="2.5" />
          <path d="M120 23 L120 38" stroke="#1e293b" strokeWidth="2.5" />
          {/* Rack de Teto */}
          <path d="M60 17 L128 17" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          {/* Roda Traseira Robusta */}
          <circle cx="42" cy="58" r="15" stroke="#334155" strokeWidth="5.5" fill="#0f172a" />
          <circle cx="42" cy="58" r="8" stroke="#64748b" strokeWidth="2" fill="#1e293b" />
          {/* Roda Dianteira Robusta */}
          <circle cx="139" cy="58" r="15" stroke="#334155" strokeWidth="5.5" fill="#0f172a" />
          <circle cx="139" cy="58" r="8" stroke="#64748b" strokeWidth="2" fill="#1e293b" />
          <defs>
            <linearGradient id="gradienteSuv" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="40%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    camionete: {
      gradienteFundo: "from-[#292524] via-[#1c1917] to-[#0c0a09]",
      corDestaque: "#f59e0b",
      rotuloCategoria: "Picape / Camionete",
      svgPath: (
        <svg
          viewBox="0 0 190 85"
          className="w-44 h-20 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Cabine e Caçamba */}
          <path
            d="M12 58 L32 58 C34 46, 50 46, 54 58 L134 58 C138 46, 154 46, 158 58 L178 58 C182 58, 184 54, 182 48 L170 38 L148 22 L94 22 L86 38 L14 38 L12 48 Z"
            fill="url(#gradientePicape)"
          />
          {/* Caçamba Aberta */}
          <path d="M14 38 L86 38" stroke="#44403c" strokeWidth="3" />
          {/* Vidros Cabine */}
          <path
            d="M96 25 L142 25 L162 38 L92 38 Z"
            fill="#0c0a09"
            stroke="#f59e0b"
            strokeWidth="0.8"
            strokeOpacity="0.4"
          />
          {/* Rodas Off-Road */}
          <circle cx="43" cy="58" r="16" stroke="#292524" strokeWidth="6" fill="#0c0a09" />
          <circle cx="43" cy="58" r="8" stroke="#78716c" strokeWidth="2.5" fill="#1c1917" />
          <circle cx="146" cy="58" r="16" stroke="#292524" strokeWidth="6" fill="#0c0a09" />
          <circle cx="146" cy="58" r="8" stroke="#78716c" strokeWidth="2.5" fill="#1c1917" />
          <defs>
            <linearGradient id="gradientePicape" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="40%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    caminhao: {
      gradienteFundo: "from-[#1e293b] via-[#0f172a] to-[#020617]",
      corDestaque: "#10b981",
      rotuloCategoria: "Caminhão / Pesado",
      svgPath: (
        <svg
          viewBox="0 0 190 90"
          className="w-44 h-22 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Baú / Carreta Traseira */}
          <rect
            x="14"
            y="18"
            width="100"
            height="44"
            rx="2"
            fill="#334155"
            stroke="#475569"
            strokeWidth="2"
          />
          <path d="M38 18 L38 62 M62 18 L62 62 M86 18 L86 62" stroke="#1e293b" strokeWidth="1.5" />
          {/* Cabine Frontal Alta */}
          <path
            d="M118 62 L118 20 L160 20 L176 44 L176 62 Z"
            fill="url(#gradienteCaminhao)"
            stroke="#059669"
            strokeWidth="1.5"
          />
          {/* Para-brisa Cabine */}
          <path
            d="M136 24 L158 24 L172 44 L136 44 Z"
            fill="#020617"
            stroke="#6ee7b7"
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
          {/* Três Eixos de Rodas */}
          <circle cx="36" cy="64" r="14" stroke="#1e293b" strokeWidth="5" fill="#020617" />
          <circle cx="70" cy="64" r="14" stroke="#1e293b" strokeWidth="5" fill="#020617" />
          <circle cx="150" cy="64" r="14" stroke="#1e293b" strokeWidth="5" fill="#020617" />
          <defs>
            <linearGradient id="gradienteCaminhao" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    propriedade: {
      gradienteFundo: "from-[#132e27] via-[#091e19] to-[#04100d]",
      corDestaque: "#10b981",
      rotuloCategoria: "Propriedade / Pessoa",
      svgPath: (
        <svg
          viewBox="0 0 160 90"
          className="w-36 h-20 drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Silhueta Tática de Vigilante e Perímetro */}
          <circle cx="80" cy="28" r="12" fill="#34d399" />
          <path
            d="M56 68 C56 48, 64 42, 80 42 C96 42, 104 48, 104 68 Z"
            fill="url(#gradienteVigilante)"
          />
          {/* Escudo de Proteção */}
          <path
            d="M80 50 L92 56 L88 74 L80 80 L72 74 L68 56 Z"
            fill="#065f46"
            stroke="#34d399"
            strokeWidth="2"
          />
          <defs>
            <linearGradient id="gradienteVigilante" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
  };

  const config = configuracoesEstudio[categoria] || configuracoesEstudio.carro;

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-b ${config.gradienteFundo} flex flex-col items-center justify-center select-none ${className}`}
    >
      {/* Luz Superior de Estúdio (Spotlight) */}
      <div className="absolute top-0 w-3/4 h-1/2 bg-white/10 rounded-full blur-2xl pointer-events-none" />

      {/* Grid de Piso de Estúdio Suave */}
      <div
        className="absolute bottom-0 inset-x-0 h-16 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          transform: "perspective(120px) rotateX(45deg)",
        }}
      />

      {/* Sombra de Oclusão do Veículo no Solo */}
      <div className="absolute bottom-4 w-44 h-4 bg-black/60 rounded-full blur-sm pointer-events-none" />

      {/* Ilustração Fotográfica Centralizada */}
      <div className="relative z-10 transition-transform duration-300 hover:scale-105">
        {config.svgPath}
      </div>

      {/* Vinheta Escura de Gradiente para Contraste dos Textos Sobrepostos */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />
    </div>
  );
};
