import { supabase } from "@/integrations/supabase/client";
import type {
  LocatarioCliente,
  DadosCadastroLocatario,
  ConviteLocatarioResultado,
  ValidacaoConviteLocatario,
} from "../types";

/**
 * Lista os locatários vinculados ao cliente titular (ou todos para ADM/Operador)
 */
export async function listarLocatarios(clienteId?: string): Promise<LocatarioCliente[]> {
  try {
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token;

    if (token) {
      const params = new URLSearchParams();
      if (clienteId) params.set("clienteId", clienteId);

      const res = await fetch(`/api/locatarios?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.locatarios)) {
          return json.locatarios;
        }
      }
    }

    // Fallback via Supabase Client direto
    let query = supabase
      .from("locatarios_cliente" as any)
      .select("*, cliente:clientes!locatarios_cliente_cliente_id_fkey(id, nome_razao_social)");

    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    const { data, error } = await query.order("nome", { ascending: true });
    if (error) {
      console.warn("[HUNTER-LOCATARIOS] Erro ao listar locatários via Supabase:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      cliente_nome: row.cliente?.nome_razao_social || undefined,
    }));
  } catch (err) {
    console.error("[HUNTER-LOCATARIOS] Falha ao listar locatários:", err);
    return [];
  }
}

/**
 * Cria ou gera link de convite para cadastrar um novo locatário subordinado
 */
export async function cadastrarOuConvidarLocatario(
  dados: DadosCadastroLocatario,
  clienteId?: string,
): Promise<ConviteLocatarioResultado> {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token;

  if (!token) {
    return { success: false, message: "Sessão expirada. Faça login novamente." };
  }

  const res = await fetch("/api/locatarios/gerar-link-convite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...dados,
      cliente_id: clienteId,
    }),
  });

  const json = await res.json();
  return json;
}

/**
 * Atualiza dados cadastrais, veículos atribuídos e permissão de bloqueio do locatário
 */
export async function atualizarLocatario(
  locatarioId: string,
  dados: Partial<DadosCadastroLocatario>,
): Promise<{ success: boolean; message: string }> {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token;

  if (!token) {
    return { success: false, message: "Sessão expirada. Faça login novamente." };
  }

  const res = await fetch("/api/locatarios", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locatario_id: locatarioId,
      ...dados,
    }),
  });

  return await res.json();
}

/**
 * Alterna bloqueio de acesso do locatário (ativo: true/false)
 */
export async function bloquearDesbloquearLocatario(
  locatarioId: string,
  ativo: boolean,
): Promise<{ success: boolean; message: string }> {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token;

  if (!token) {
    return { success: false, message: "Sessão expirada. Faça login novamente." };
  }

  const res = await fetch("/api/locatarios/bloquear", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locatario_id: locatarioId,
      ativo,
    }),
  });

  return await res.json();
}

/**
 * Reseta a senha do locatário via rota administrativa segura
 */
export async function resetarSenhaLocatario(
  locatarioId: string,
  novaSenha?: string,
): Promise<{ success: boolean; message: string; novaSenha?: string }> {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token;

  if (!token) {
    return { success: false, message: "Sessão expirada. Faça login novamente." };
  }

  const res = await fetch("/api/locatarios/resetar-senha", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locatario_id: locatarioId,
      nova_senha: novaSenha,
    }),
  });

  return await res.json();
}

/**
 * Valida token de convite na rota pública de auto-cadastro
 */
export async function validarConviteLocatario(token: string): Promise<ValidacaoConviteLocatario> {
  try {
    const params = new URLSearchParams();
    params.set("token", token);

    const res = await fetch(`/api/locatarios/validar-convite?${params.toString()}`);
    if (res.ok) {
      return await res.json();
    }
    return { valido: false, mensagem: "Convite de locatário inválido ou expirado." };
  } catch (err: any) {
    return { valido: false, mensagem: err?.message || "Erro de conexão ao validar convite." };
  }
}

/**
 * Conclui o auto-cadastro público do locatário através do link de convite
 */
export async function concluirAutoCadastroLocatario(dados: {
  token: string;
  nome: string;
  email: string;
  telefone?: string;
  cpf_cnpj?: string;
  senha: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/locatarios/concluir-auto-cadastro", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });

  return await res.json();
}
