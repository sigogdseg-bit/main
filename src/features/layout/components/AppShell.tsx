import React from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppHeader } from "./AppHeader";
import { DlpWatermark } from "./DlpWatermark";
import { AlertasAcidenteBanner } from "@/features/monitor-gps/components/AlertasAcidenteBanner";
import { BannerComandosAguardoGlobal } from "@/features/seguranca/components/BannerComandosAguardoGlobal";
import { MobileBottomNav } from "./MobileBottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMonitorGps = pathname.includes("/monitor-gps");
  const isChat = pathname.includes("/chat");
  const isFullViewport = isMonitorGps || isChat;

  return (
    <div
      className={`bg-[#eaf0f8] text-slate-800 dark:bg-[#0a0a0c] dark:text-slate-100 flex flex-col font-sans antialiased relative transition-colors duration-200 ${
        isFullViewport ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-screen"
      }`}
    >
      <DlpWatermark />
      <AppHeader />
      {/* Alerta de Segurança e Emergência Global em Camada Superior para Toda a Aplicação */}
      <AlertasAcidenteBanner podeVisualizarAlertas={true} />
      {/* Alerta de Comandos em Aguardo de Despertar com Modo Minimizado / Botão Flutuante em Todas as Telas */}
      <BannerComandosAguardoGlobal />
      <main
        className={`flex-1 w-full min-h-0 ${
          isFullViewport
            ? "p-0 flex flex-col overflow-hidden"
            : "p-3 sm:p-6 pb-20 md:pb-6 overflow-x-clip"
        }`}
        style={
          isFullViewport
            ? {
                maxHeight: "calc(100dvh - 4rem - env(safe-area-inset-top, 0px) - 1.5rem)",
              }
            : {
                paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
              }
        }
      >
        {children}
      </main>
      {/* Barra de Navegação Inferior Móvel Tática */}
      {!isFullViewport && <MobileBottomNav />}
    </div>
  );
}
