import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CardVisualVariant = "neumorphic" | "canonical";

export type CardThemeMode = "color" | "mono" | "duo" | "trio" | "quad";

export type CardColorKey =
  "blue" | "orange" | "red" | "green" | "purple" | "cyan" | "amber" | "pink";

export interface CardThemeConfig {
  variant?: CardVisualVariant;
  mode: CardThemeMode;
  monoColor: CardColorKey;
  duoColors: [CardColorKey, CardColorKey];
  trioColors: [CardColorKey, CardColorKey, CardColorKey];
  quadColors: [CardColorKey, CardColorKey, CardColorKey, CardColorKey];
}

export const DEFAULT_CARD_THEME_CONFIG: CardThemeConfig = {
  variant: "neumorphic",
  mode: "duo",
  monoColor: "cyan",
  duoColors: ["cyan", "green"],
  trioColors: ["cyan", "green", "blue"],
  quadColors: ["cyan", "green", "blue", "orange"],
};

export const CARD_COLOR_OPTIONS: {
  key: CardColorKey;
  label: string;
  bgHex: string;
  borderHex: string;
}[] = [
  { key: "blue", label: "Azul Safira", bgHex: "#2563eb", borderHex: "#3b82f6" },
  { key: "orange", label: "Laranja Fogo", bgHex: "#ea580c", borderHex: "#f97316" },
  { key: "red", label: "Vermelho Rubi", bgHex: "#dc2626", borderHex: "#ef4444" },
  { key: "green", label: "Verde Esmeralda", bgHex: "#059669", borderHex: "#10b981" },
  { key: "purple", label: "Púrpura Violeta", bgHex: "#9333ea", borderHex: "#a855f7" },
  { key: "cyan", label: "Ciano Ártico", bgHex: "#0891b2", borderHex: "#06b6d4" },
  { key: "amber", label: "Âmbar Dourado", bgHex: "#d97706", borderHex: "#f59e0b" },
  { key: "pink", label: "Rosa Framboesa", bgHex: "#db2777", borderHex: "#ec4899" },
];

export const PRIMARY_STORAGE_KEY = "hunter-card-theme-config";

let rpcPreferenciasIndisponivel = true;

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as { __HUNTER_USER_ID__?: string };
  if (win.__HUNTER_USER_ID__) return win.__HUNTER_USER_ID__;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const uid = parsed?.user?.id;
          if (uid) {
            win.__HUNTER_USER_ID__ = uid;
            return uid;
          }
        }
      }
    }
  } catch {
    /* ignora erro */
  }
  return null;
}

export function setCurrentUserId(userId: string | null): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __HUNTER_USER_ID__?: string | null }).__HUNTER_USER_ID__ = userId;
}

export function getCardThemeStorageKey(userId?: string | null): string {
  const resolvedId = userId ?? getCurrentUserId();
  if (resolvedId) return `hunter-card-theme:${resolvedId}`;
  return PRIMARY_STORAGE_KEY;
}

export function readCardThemeConfig(userId?: string | null): CardThemeConfig {
  if (typeof window === "undefined") return DEFAULT_CARD_THEME_CONFIG;
  try {
    const resolvedId = userId ?? getCurrentUserId();
    // 1. Tenta chave do usuário se existir
    if (resolvedId) {
      const rawUser = window.localStorage.getItem(`hunter-card-theme:${resolvedId}`);
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && typeof parsed === "object" && parsed.mode) {
          return {
            ...DEFAULT_CARD_THEME_CONFIG,
            ...parsed,
            variant: parsed.variant || "neumorphic",
          };
        }
      }
    }

    // 2. Tenta chave primária global
    const rawGlobal = window.localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (rawGlobal) {
      const parsed = JSON.parse(rawGlobal);
      if (parsed && typeof parsed === "object" && parsed.mode) {
        return {
          ...DEFAULT_CARD_THEME_CONFIG,
          ...parsed,
          variant: parsed.variant || "neumorphic",
        };
      }
    }
  } catch {
    /* ignora erro */
  }
  return DEFAULT_CARD_THEME_CONFIG;
}

export function saveCardThemeConfig(config: CardThemeConfig, userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(config);
    // Salva na chave primária global do navegador
    window.localStorage.setItem(PRIMARY_STORAGE_KEY, json);

    // E na chave associada ao usuário se existir
    const resolvedId = userId ?? getCurrentUserId();
    if (resolvedId) {
      window.localStorage.setItem(`hunter-card-theme:${resolvedId}`, json);

      // Sincronização multi-dispositivo na nuvem (Supabase) via RPC ou update direto se suportado
      if (!rpcPreferenciasIndisponivel) {
        supabase
          .rpc("salvar_preferencias_usuario", {
            p_preferencias: { card_theme_preference: config },
            p_user_id: resolvedId,
          })
          .then((res) => {
            if (res && res.error) {
              const msg = (res.error.message || "").toLowerCase();
              if (
                res.error.code === "PGRST202" ||
                res.error.code === "404" ||
                msg.includes("schema cache") ||
                msg.includes("could not find the function")
              ) {
                rpcPreferenciasIndisponivel = true;
              }
            }
          })
          .catch(() => {
            rpcPreferenciasIndisponivel = true;
          });
      }
    }

    // Despacha evento para atualização em tempo real em todas as telas
    window.dispatchEvent(
      new CustomEvent("hunter-card-theme-change", {
        detail: { config, userId: resolvedId || null },
      }),
    );
  } catch {
    /* ignora erro */
  }
}

export function useCardTheme(explicitUserId?: string | null): CardThemeConfig {
  const [config, setConfig] = useState<CardThemeConfig>(() => {
    return readCardThemeConfig(explicitUserId);
  });

  useEffect(() => {
    const resolvedId = explicitUserId ?? getCurrentUserId();
    setConfig(readCardThemeConfig(resolvedId));

    // Se houver usuário, busca no banco para garantir que novo dispositivo sincronize imediatamente
    if (resolvedId && !rpcPreferenciasIndisponivel) {
      supabase
        .from("profiles")
        .select("card_theme_preference")
        .eq("id", resolvedId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            rpcPreferenciasIndisponivel = true;
            return;
          }
          if (data?.card_theme_preference && typeof data.card_theme_preference === "object") {
            const remoteConfig = {
              ...DEFAULT_CARD_THEME_CONFIG,
              ...data.card_theme_preference,
            };
            setConfig(remoteConfig);
            try {
              window.localStorage.setItem(
                `hunter-card-theme:${resolvedId}`,
                JSON.stringify(remoteConfig),
              );
              window.localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(remoteConfig));
            } catch {
              /* ignora */
            }
          }
        })
        .catch(() => {});
    }

    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ config: CardThemeConfig; userId?: string | null }>;
      if (custom.detail?.config) {
        setConfig(custom.detail.config);
      }
    };

    window.addEventListener("hunter-card-theme-change", handler);
    return () => {
      window.removeEventListener("hunter-card-theme-change", handler);
    };
  }, [explicitUserId]);

  return config;
}

/**
 * Classes canônicas de estilo unificado para o Product UI Styleguide (Neumorphism Suave)
 * Utilizadas em 100% das telas e modais do sistema GD Rastreamento.
 */
export const NEUMORPHIC_STYLES = {
  pageContainer:
    "max-w-7xl mx-auto p-3 sm:p-5 lg:p-6 space-y-6 select-none transition-all duration-300",
  card: "rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl transition-all duration-200",
  cardHeader:
    "p-5 sm:p-6 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4",
  subcard:
    "p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none transition-all duration-200",
  input:
    "w-full py-2.5 px-3.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none focus:ring-2 focus:ring-orange-500 transition",
  inputSearch:
    "w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none focus:ring-2 focus:ring-orange-500 transition",
  btnTactile:
    "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition-all duration-150 cursor-pointer",
  chip: "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800/80 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none text-slate-700 dark:text-slate-300 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 cursor-pointer",
  tabBtn:
    "flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition flex-1 min-w-[140px] sm:min-w-fit text-center min-h-[40px]",
  tabBtnActive: "bg-orange-600 text-white shadow-[2px_2px_8px_rgba(234,88,12,0.35)]",
  tabBtnInactive:
    "bg-[#eaf0f8] dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da]",
};
