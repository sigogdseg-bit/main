import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import type {
  DocumentoEmitido,
  RegistrarDocumentoInput,
  ResultadoVerificacaoDocumento,
} from "../types/documento";

/**
 * Calcula o hash SHA-256 binário de um ArrayBuffer usando Web Crypto API.
 */
export async function calcularSha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extrai hashes SHA-256 (sequências de 64 caracteres hexadecimais) embutidos no texto/stream do PDF.
 */
export function extrairHashesCandidatosPdf(buffer: ArrayBuffer): string[] {
  try {
    const bytes = new Uint8Array(buffer);
    let str = "";
    const len = Math.min(bytes.length, 500000); // varredura de até 500KB de streams textuais
    for (let i = 0; i < len; i++) {
      const c = bytes[i];
      if (c >= 32 && c <= 126) {
        str += String.fromCharCode(c);
      } else if (c === 10 || c === 13) {
        str += " ";
      }
    }
    const matches = str.match(/\b([a-fA-F0-9]{64})\b/g);
    if (matches) {
      return Array.from(new Set(matches.map((m) => m.toLowerCase())));
    }
  } catch {
    // ignora falha de decodificação
  }
  return [];
}

/**
 * Registra um documento emitido pelo sistema na base forense auditada.
 */
export async function registrarDocumentoEmitido(
  input: RegistrarDocumentoInput,
): Promise<DocumentoEmitido | null> {
  try {
    let emissorNome = (input.emissor_nome || "").trim() || "Operador";
    let emissorEmail = (input.emissor_email || "").trim();
    let emissorUserId = input.emissor_user_id || null;
    let emissorRole = (input.emissor_role || "").trim() || "operador";

    const ehEmissorGenerico = (nome: string) =>
      !nome || nome === "Operador" || nome === "Operador GD Rastreamento";

    // 1. Tenta capturar dados da sessão ativa em cache (síncrono no navegador)
    const sessaoCache = obterSessaoCacheada();
    if (sessaoCache) {
      emissorUserId = emissorUserId || sessaoCache.userId || null;
      emissorEmail = emissorEmail || sessaoCache.email || "";
      if (ehEmissorGenerico(emissorNome)) {
        emissorNome = sessaoCache.nome || sessaoCache.email || emissorNome;
      }
      if (!input.emissor_role && sessaoCache.role) {
        emissorRole = String(sessaoCache.role);
      }
    }

    // 2. Complementa com sessão Supabase Auth se ainda houver dados ausentes
    try {
      const sess = (await supabase.auth.getSession()).data?.session;
      const user = sess?.user;
      if (user) {
        emissorUserId = emissorUserId || user.id;
        emissorEmail = emissorEmail || user.email || "";
        if (ehEmissorGenerico(emissorNome)) {
          emissorNome =
            (user.user_metadata?.nome as string) ||
            (user.user_metadata?.full_name as string) ||
            user.email ||
            emissorNome;
        }
      }
    } catch {
      // ignora
    }

    emissorEmail = emissorEmail || "sistema@oficial.tec.br";

    const payload = {
      nome_arquivo: input.nome_arquivo.trim(),
      hash_sha256: input.hash_sha256.trim().toLowerCase(),
      tipo_documento: input.tipo_documento.trim(),
      descricao: input.descricao.trim(),
      emissor_nome: emissorNome.trim(),
      emissor_email: emissorEmail.trim(),
      emissor_user_id: emissorUserId,
      emissor_role: emissorRole,
      tamanho_bytes: input.tamanho_bytes || 0,
      metadata: input.metadata || {},
    };

    // 1. Tenta API backend do servidor com service_role (apenas no browser com URL relativa segura)
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/documentos/registrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.documento) {
            return data.documento as DocumentoEmitido;
          }
        }
      } catch (apiErr) {
        console.warn("Aviso ao registrar documento via /api/documentos/registrar:", apiErr);
      }
    }

    // 2. Fallback direto via cliente Supabase
    const { data, error } = await supabase
      .from("documentos_emitidos" as any)
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao registrar documento emitido no Supabase:", error);
      return null;
    }

    return data as unknown as DocumentoEmitido;
  } catch (err) {
    console.error("Exceção ao registrar documento emitido:", err);
    return null;
  }
}

/**
 * Confere e verifica a integridade de um arquivo PDF carregado pelo operador ou administrador.
 */
export async function verificarDocumentoPdf(file: File): Promise<ResultadoVerificacaoDocumento> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashCalculado = await calcularSha256Buffer(arrayBuffer);
    const hashesCandidatos = extrairHashesCandidatosPdf(arrayBuffer);

    // 1. Tenta API backend do servidor
    try {
      const res = await fetch("/api/documentos/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash_sha256: hashCalculado,
          hashes_candidatos: hashesCandidatos,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          integro: Boolean(data?.integro),
          documento: data?.documento || undefined,
          hashCalculado,
          nomeArquivoEnviado: file.name,
          tamanhoArquivoEnviado: file.size,
          mensagem:
            data?.mensagem ||
            (data?.integro
              ? "Documento íntegro e autêntico localizado no sistema."
              : "Documento não encontrado na base de registros forenses ou adulterado."),
        };
      }
    } catch (apiErr) {
      console.warn("Aviso ao verificar documento via API:", apiErr);
    }

    // 2. Fallback direto via cliente Supabase
    const todosHashes = [hashCalculado, ...hashesCandidatos];
    const { data, error } = await supabase
      .from("documentos_emitidos" as any)
      .select("*")
      .in("hash_sha256", todosHashes)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      return {
        integro: true,
        documento: data[0] as unknown as DocumentoEmitido,
        hashCalculado,
        nomeArquivoEnviado: file.name,
        tamanhoArquivoEnviado: file.size,
        mensagem: "Documento íntegro e autêntico localizado no banco de dados.",
      };
    }

    return {
      integro: false,
      hashCalculado,
      nomeArquivoEnviado: file.name,
      tamanhoArquivoEnviado: file.size,
      mensagem: "O hash deste arquivo não foi localizado nos registros de emissão oficial.",
    };
  } catch (err: any) {
    return {
      integro: false,
      hashCalculado: "0000000000000000000000000000000000000000000000000000000000000000",
      nomeArquivoEnviado: file.name,
      tamanhoArquivoEnviado: file.size,
      mensagem: err?.message || "Falha ao processar e conferir o arquivo PDF.",
    };
  }
}

/**
 * Confere integridade diretamente a partir de uma string de Hash SHA-256 informada.
 */
export async function verificarDocumentoPorHash(
  hashHex: string,
): Promise<ResultadoVerificacaoDocumento> {
  const hashLimpo = hashHex.trim().toLowerCase();
  try {
    const res = await fetch("/api/documentos/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash_sha256: hashLimpo }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        integro: Boolean(data?.integro),
        documento: data?.documento || undefined,
        hashCalculado: hashLimpo,
        mensagem: data?.mensagem || "Verificação concluída.",
      };
    }
  } catch {
    // fallback
  }

  const { data } = await supabase
    .from("documentos_emitidos" as any)
    .select("*")
    .eq("hash_sha256", hashLimpo)
    .limit(1);

  if (data && data.length > 0) {
    return {
      integro: true,
      documento: data[0] as unknown as DocumentoEmitido,
      hashCalculado: hashLimpo,
      mensagem: "Documento íntegro e autêntico localizado no banco de dados.",
    };
  }

  return {
    integro: false,
    hashCalculado: hashLimpo,
    mensagem: "Hash SHA-256 não localizado nos registros oficiais do sistema.",
  };
}

/**
 * Lista todos os documentos emitidos oficialmente pelo sistema com ordenação cronológica.
 */
export async function listarDocumentosEmitidos(): Promise<DocumentoEmitido[]> {
  try {
    // 1. Tenta API backend
    try {
      const res = await fetch("/api/documentos/listar");
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data?.documentos)) {
          return data.documentos as DocumentoEmitido[];
        }
      }
    } catch {
      // fallback
    }

    // 2. Fallback direto via Supabase
    const { data, error } = await supabase
      .from("documentos_emitidos" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Erro ao listar documentos emitidos:", error);
      return [];
    }

    return (data || []) as unknown as DocumentoEmitido[];
  } catch (err) {
    console.error("Exceção ao listar documentos emitidos:", err);
    return [];
  }
}
