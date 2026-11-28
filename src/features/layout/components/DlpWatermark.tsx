import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME } from "@/shared/lib/version";
import {
  obterConfiguracaoDlp,
  type ConfiguracaoDlp,
} from "@/features/seguranca/services/segurancaModulosService";

export function DlpWatermark() {
  const { session } = useAuth();
  const [perdeuFoco, setPerdeuFoco] = useState(false);
  const [cfg, setCfg] = useState<ConfiguracaoDlp>({
    blurPerdaFocoAtivo: true,
    bloqueioPrintAtivo: true,
  });

  useEffect(() => {
    let ativo = true;
    obterConfiguracaoDlp()
      .then((res) => {
        if (ativo) setCfg(res);
      })
      .catch(() => {});

    const onConfigAtualizada = (ev: Event) => {
      const detail = (ev as CustomEvent<ConfiguracaoDlp>).detail;
      if (detail) setCfg(detail);
    };
    window.addEventListener("hunter_dlp_config_updated", onConfigAtualizada);
    return () => {
      ativo = false;
      window.removeEventListener("hunter_dlp_config_updated", onConfigAtualizada);
    };
  }, []);

  useEffect(() => {
    const isMobileOuTouch = () => {
      if (typeof window === "undefined") return false;
      return window.innerWidth < 1024 || "ontouchstart" in window || navigator.maxTouchPoints > 0;
    };

    const onBlur = () => {
      if (cfg.blurPerdaFocoAtivo && !isMobileOuTouch()) {
        setPerdeuFoco(true);
      }
    };
    const onFocus = () => setPerdeuFoco(false);
    const onVisibilityChange = () => {
      if (!cfg.blurPerdaFocoAtivo) {
        setPerdeuFoco(false);
        return;
      }
      if (document.hidden) setPerdeuFoco(true);
      else setPerdeuFoco(false);
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [cfg.blurPerdaFocoAtivo]);

  if (!session) return null;

  return (
    <>
      {cfg.bloqueioPrintAtivo && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            body::after {
              content: "${APP_NOME} — Impressão direta bloqueada pela política DLP.";
              visibility: visible !important;
              display: block;
              padding: 2rem;
              font-family: sans-serif;
              font-weight: 700;
            }
          }
        `}</style>
      )}
      {/* Ofuscamento automático (DLP Blur) ao perder foco da janela (sem marca d'água) */}
      {cfg.blurPerdaFocoAtivo && perdeuFoco && (
        <div
          onClick={() => setPerdeuFoco(false)}
          onTouchStart={() => setPerdeuFoco(false)}
          className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md select-none transition-all duration-200 cursor-pointer"
        >
          <div className="rounded-3xl border border-slate-300/80 dark:border-slate-800 bg-[#f0f4f9] dark:bg-slate-900 p-6 text-center shadow-[10px_10px_28px_#c3cfe2] dark:shadow-2xl max-w-sm mx-4">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
              <span className="h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
              {APP_NOME} — Proteção de Tela Ativa
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Toque ou clique na tela para restaurar a visualização confidencial.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
