import React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MapPin, CreditCard, MessageCircle, Menu } from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";

/**
 * Componente MobileBottomNav
 * Barra de navegação inferior tática para dispositivos móveis
 * Inspirada na arquitetura e ergonomia de 1 toque da Movitrak:
 * - Acesso instantâneo a Home (Meus Veículos), Mapa ao Vivo, Financeiro (PIX), Chat e Menu Mais
 * - Respeita a safe-area do iOS e Android (sem sobreposição)
 * - Área de toque mínima de 44x44px com feedback tátil de clique
 * - Unslop: sem efeitos desnecessários, apenas precisão e acabamento fino
 */
export const MobileBottomNav: React.FC = () => {
  const { session } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session) return null;

  const handleAbrirMenu = () => {
    window.dispatchEvent(new Event("hunter_toggle_menu_mobile"));
  };

  const abas = [
    {
      id: "inicio",
      rotulo: "Início",
      rota: "/inicio",
      icone: Home,
      ativo: pathname === "/inicio" || pathname === "/",
    },
    {
      id: "mapa",
      rotulo: "Mapa",
      rota: "/monitor-gps",
      icone: MapPin,
      ativo: pathname.includes("/monitor-gps"),
    },
    {
      id: "financeiro",
      rotulo: "Financeiro",
      rota: "/mensalidades",
      icone: CreditCard,
      ativo: pathname.includes("/mensalidades") || pathname.includes("/financeiro"),
    },
    {
      id: "chat",
      rotulo: "Atendimento",
      rota: "/chat",
      icone: MessageCircle,
      ativo: pathname.includes("/chat"),
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.6)] select-none transition-colors duration-200"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingTop: "6px",
      }}
      aria-label="Navegação móvel inferior"
    >
      <div className="grid grid-cols-5 items-center justify-around px-2 max-w-md mx-auto">
        {abas.map((aba) => {
          const Icone = aba.icone;
          return (
            <Link
              key={aba.id}
              to={aba.rota as any}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1 px-1 rounded-xl transition-all duration-150 active:scale-90 ${
                aba.ativo
                  ? "text-orange-600 dark:text-orange-400 font-black"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              }`}
            >
              <div className="relative">
                <Icone
                  className={`w-5 h-5 transition-transform duration-150 ${
                    aba.ativo ? "scale-110 stroke-[2.2px]" : "stroke-[1.75px]"
                  }`}
                />
                {aba.ativo && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-600 dark:bg-orange-400" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1 leading-none">{aba.rotulo}</span>
            </Link>
          );
        })}

        {/* Botão "Mais" para abrir a gaveta lateral completa */}
        <button
          type="button"
          onClick={handleAbrirMenu}
          className="flex flex-col items-center justify-center min-h-[44px] py-1 px-1 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all duration-150 active:scale-90 cursor-pointer font-medium"
          title="Abrir Menu Completo"
        >
          <Menu className="w-5 h-5 stroke-[1.75px]" />
          <span className="text-[10px] tracking-tight mt-1 leading-none">Mais</span>
        </button>
      </div>
    </nav>
  );
};
