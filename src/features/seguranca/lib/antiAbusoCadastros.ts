import { supabase } from "@/integrations/supabase/client";

const DOMINIOS_DESCARTAVEIS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "temp-mail.org",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
]);

export function ehEmailDescartavel(email: string): boolean {
  const dominio = (email || "").trim().toLowerCase().split("@")[1] || "";
  return Boolean(dominio && DOMINIOS_DESCARTAVEIS.has(dominio));
}

export async function verificarAbusoCadastroPublico(params: {
  rota: string;
  email: string;
  documento?: string;
}): Promise<{ permitido: boolean; motivo?: string }> {
  const email = (params.email || "").trim().toLowerCase();
  const documento = (params.documento || "").replace(/\D/g, "");

  if (ehEmailDescartavel(email)) {
    try {
      await (supabase.rpc as any)("registrar_evento_cadastro_suspeito", {
        _rota: params.rota,
        _email: email,
        _documento: documento || null,
        _motivo_bloqueio: "Domínio de e-mail temporário/descartável bloqueado",
        _severidade: "alta",
        _detalhes: { dominio: email.split("@")[1] || "" },
        _bloqueado: true,
      });
    } catch {
      // resiliente
    }
    return {
      permitido: false,
      motivo: "E-mails temporários ou descartáveis não são permitidos no cadastro.",
    };
  }

  return { permitido: true };
}
