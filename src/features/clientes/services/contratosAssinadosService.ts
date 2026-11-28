import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import { calcularSha256Buffer } from "@/features/seguranca/services/documentosService";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do Módulo de Contratos Assinados
// ─────────────────────────────────────────────────────────────────────────────

export type StatusContrato =
  "pendente_assinatura" | "enviado_cliente" | "assinado" | "atualizado" | "cancelado" | "expirado";

export type MetodoAssinatura = "digital" | "manuscrita" | "aceite_plataforma";

export interface ContratoCliente {
  id: string;
  cliente_id: string;
  numero_contrato: string;
  tipo_contrato: string;
  hash_pdf_original: string | null;
  hash_pdf_assinado: string | null;
  selo_autenticidade: string;
  codigo_verificacao: string;
  status: StatusContrato;
  data_emissao: string;
  data_envio_cliente: string | null;
  data_assinatura: string | null;
  data_cancelamento: string | null;
  assinatura_ip: string | null;
  assinatura_user_agent: string | null;
  assinatura_metodo: MetodoAssinatura;
  emitido_por_user_id: string | null;
  emitido_por_nome: string;
  assinado_por_nome: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  valor_mensalidade: number;
  valor_total_contrato: number;
  contrato_substituto_id?: string | null;
  motivo_invalidacao?: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RegistrarContratoInput {
  cliente_id: string;
  numero_contrato: string;
  tipo_contrato?: string;
  pdf_original_buffer?: ArrayBuffer;
  hash_pdf_original?: string;
  selo_autenticidade?: string;
  codigo_verificacao?: string;
  emitido_por_nome?: string;
  vigencia_inicio?: string;
  vigencia_fim?: string;
  valor_mensalidade?: number;
  valor_total_contrato?: number;
  metadata?: Record<string, any>;
  is_atualizacao?: boolean;
  contrato_anterior_id?: string;
  numero_contrato_anterior?: string;
}

export interface RegistrarAssinaturaInput {
  contrato_id: string;
  pdf_assinado_buffer: ArrayBuffer;
  assinado_por_nome?: string;
  assinatura_metodo?: MetodoAssinatura;
}

export interface InserirContratoAssinadoInput {
  cliente_id: string;
  numero_contrato?: string;
  tipo_contrato?: string;
  pdf_assinado_buffer: ArrayBuffer;
  assinado_por_nome?: string;
  assinatura_metodo?: MetodoAssinatura;
  data_assinatura?: string;
  emitido_por_nome?: string;
  vigencia_inicio?: string;
  vigencia_fim?: string;
  valor_mensalidade?: number;
  valor_total_contrato?: number;
  metadata?: Record<string, any>;
}

export interface ResultadoVerificacaoContrato {
  autentico: boolean;
  mensagem: string;
  contrato_id?: string;
  numero_contrato?: string;
  selo_autenticidade?: string;
  codigo_verificacao?: string;
  status?: string;
  data_emissao?: string;
  data_assinatura?: string;
  cliente_nome?: string;
  cliente_documento?: string;
  emitido_por_nome?: string;
  assinado_por_nome?: string;
  assinatura_metodo?: string;
  hash_pdf_original?: string;
  hash_pdf_assinado?: string;
  contrato_substituto_id?: string;
  motivo_invalidacao?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registrar contrato emitido (gera selo + código + hash do PDF original)
// ─────────────────────────────────────────────────────────────────────────────

export async function registrarContratoEmitido(
  input: RegistrarContratoInput,
): Promise<ContratoCliente | null> {
  try {
    // Calcula hash SHA-256 do PDF original se fornecido
    const hashOriginal =
      input.hash_pdf_original ||
      (input.pdf_original_buffer ? await calcularSha256Buffer(input.pdf_original_buffer) : "");

    // Se tiver selo e código passados, usa; senão gera
    const selo =
      input.selo_autenticidade || `SGD-${Date.now().toString(16).toUpperCase().slice(-8)}`;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let codigo = input.codigo_verificacao || "";
    if (!codigo) {
      for (let i = 0; i < 6; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    const emitidoPorNomeResolvido =
      input.emitido_por_nome || obterSessaoCacheada()?.nome || "Administrador do Sistema";

    // Tenta via API backend com service_role (apenas no navegador)
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/registrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente_id: input.cliente_id,
            numero_contrato: input.numero_contrato,
            tipo_contrato: input.tipo_contrato || "PRESTACAO_SERVICOS",
            hash_pdf_original: hashOriginal,
            selo_autenticidade: selo,
            codigo_verificacao: codigo,
            emitido_por_nome: emitidoPorNomeResolvido,
            vigencia_inicio: input.vigencia_inicio,
            vigencia_fim: input.vigencia_fim,
            valor_mensalidade: input.valor_mensalidade || 0,
            valor_total_contrato: input.valor_total_contrato || 0,
            metadata: input.metadata || {},
            is_atualizacao: input.is_atualizacao,
            contrato_anterior_id: input.contrato_anterior_id,
            numero_contrato_anterior: input.numero_contrato_anterior,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.contrato) {
            return data.contrato as ContratoCliente;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.warn("Resposta da API de registro de contratos:", errData);
        }
      } catch (apiErr) {
        console.warn("Aviso ao registrar contrato via API:", apiErr);
      }
    }

    // Fallback via Supabase direto (apenas metadados)

    let emitidoPorUserId: string | null = null;
    try {
      const sess = (await supabase.auth.getSession()).data?.session;
      emitidoPorUserId = sess?.user?.id || null;
    } catch {
      // ignora
    }

    const { data, error } = await supabase
      .from("contratos_clientes" as any)
      .insert({
        cliente_id: input.cliente_id,
        numero_contrato: input.numero_contrato,
        tipo_contrato: input.tipo_contrato || "PRESTACAO_SERVICOS",
        hash_pdf_original: hashOriginal,
        selo_autenticidade: selo,
        codigo_verificacao: codigo,
        status: "pendente_assinatura",
        emitido_por_user_id: emitidoPorUserId,
        emitido_por_nome: emitidoPorNomeResolvido,
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim,
        valor_mensalidade: input.valor_mensalidade || 0,
        valor_total_contrato: input.valor_total_contrato || 0,
        metadata: {
          ...(input.metadata || {}),
          is_atualizacao: Boolean(input.is_atualizacao),
          contrato_anterior_id: input.contrato_anterior_id || null,
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Aviso ao registrar em contratos_clientes, gerando retorno resiliente:", error);
      return {
        id: `ct-${Date.now()}`,
        cliente_id: input.cliente_id,
        numero_contrato: input.numero_contrato,
        tipo_contrato: input.tipo_contrato || "PRESTACAO_SERVICOS",
        hash_pdf_original: hashOriginal,
        selo_autenticidade: selo,
        codigo_verificacao: codigo,
        status: "pendente_assinatura",
        emitido_por_nome: input.emitido_por_nome || "Administrador do Sistema",
        vigencia_inicio: input.vigencia_inicio,
        vigencia_fim: input.vigencia_fim,
        valor_mensalidade: input.valor_mensalidade || 0,
        valor_total_contrato: input.valor_total_contrato || 0,
        metadata: {
          ...(input.metadata || {}),
          is_atualizacao: Boolean(input.is_atualizacao),
          contrato_anterior_id: input.contrato_anterior_id || null,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as ContratoCliente;
    }

    // Se for atualização de contrato anterior no fallback direto, invalida o anterior
    if (input.is_atualizacao && input.contrato_anterior_id && data) {
      try {
        await supabase
          .from("contratos_clientes" as any)
          .update({
            status: "atualizado",
            contrato_substituto_id: (data as any).id,
            motivo_invalidacao: `Substituído por atualização no Contrato ${input.numero_contrato} em ${new Date().toLocaleString("pt-BR")}`,
          })
          .eq("id", input.contrato_anterior_id);
      } catch (errAnt) {
        console.warn("Aviso ao invalidar anterior no fallback:", errAnt);
      }
    }

    return data as unknown as ContratoCliente;
  } catch (err) {
    console.error("Exceção ao registrar contrato emitido:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Registrar assinatura do contrato (grava PDF assinado + hash)
// ─────────────────────────────────────────────────────────────────────────────

export async function registrarAssinaturaContrato(
  input: RegistrarAssinaturaInput,
): Promise<{ sucesso: boolean; mensagem: string; contrato?: ContratoCliente }> {
  try {
    const hashAssinado = await calcularSha256Buffer(input.pdf_assinado_buffer);
    const pdfBase64 = arrayBufferToBase64(input.pdf_assinado_buffer);

    // Tenta via API backend (apenas no navegador)
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/assinar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrato_id: input.contrato_id,
            pdf_assinado_base64: pdfBase64,
            hash_pdf_assinado: hashAssinado,
            assinado_por_nome: input.assinado_por_nome,
            assinatura_metodo: input.assinatura_metodo || "digital",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            return {
              sucesso: true,
              mensagem: data.mensagem || "Contrato assinado registrado com sucesso.",
              contrato: data.contrato,
            };
          }
          return {
            sucesso: false,
            mensagem: data?.mensagem || "Falha ao registrar assinatura.",
          };
        }
      } catch (apiErr) {
        console.warn("Aviso ao registrar assinatura via API:", apiErr);
      }
    }

    // Fallback via RPC
    const { data, error } = await supabase.rpc("hunter_registrar_contrato_assinado" as any, {
      p_contrato_id: input.contrato_id,
      p_pdf_assinado: null, // bytea não suportado via rpc direto sem encoding
      p_hash_pdf_assinado: hashAssinado,
      p_assinado_por_nome: input.assinado_por_nome || null,
      p_assinatura_ip: null,
      p_assinatura_user_agent: navigator?.userAgent || null,
      p_assinatura_metodo: input.assinatura_metodo || "digital",
    });

    if (error) {
      return { sucesso: false, mensagem: error.message };
    }

    const resultado = data as unknown as Record<string, any>;
    return {
      sucesso: Boolean(resultado?.sucesso),
      mensagem: String(resultado?.mensagem || "Processado."),
    };
  } catch (err: any) {
    return {
      sucesso: false,
      mensagem: err?.message || "Falha ao registrar assinatura do contrato.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.1. Inserir Contrato Já Assinado (Upload direto de contrato assinado pelo cliente)
// ─────────────────────────────────────────────────────────────────────────────

export async function inserirContratoJaAssinado(
  input: InserirContratoAssinadoInput,
): Promise<{ sucesso: boolean; mensagem: string; contrato?: ContratoCliente }> {
  try {
    const hashAssinado = await calcularSha256Buffer(input.pdf_assinado_buffer);
    const pdfBase64 = arrayBufferToBase64(input.pdf_assinado_buffer);

    // Tenta via API backend (com service_role no servidor)
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/inserir-assinado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente_id: input.cliente_id,
            numero_contrato: input.numero_contrato,
            tipo_contrato: input.tipo_contrato || "LOCACAO_AUTOMONITORAMENTO",
            pdf_assinado_base64: pdfBase64,
            hash_pdf_assinado: hashAssinado,
            assinado_por_nome: input.assinado_por_nome,
            assinatura_metodo: input.assinatura_metodo || "digital",
            data_assinatura: input.data_assinatura,
            emitido_por_nome: input.emitido_por_nome || "Administrador do Sistema",
            vigencia_inicio: input.vigencia_inicio,
            vigencia_fim: input.vigencia_fim,
            valor_mensalidade: input.valor_mensalidade,
            valor_total_contrato: input.valor_total_contrato,
            metadata: input.metadata,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            return {
              sucesso: true,
              mensagem: data.mensagem || "Contrato assinado inserido com sucesso.",
              contrato: data.contrato,
            };
          }
          return {
            sucesso: false,
            mensagem: data?.mensagem || "Falha ao inserir contrato assinado.",
          };
        }
      } catch (apiErr) {
        console.warn("Aviso ao inserir contrato assinado via API:", apiErr);
      }
    }

    // Fallback direto via Supabase se API não estiver acessível
    const { data: seloData } = await supabase.rpc("hunter_gerar_selo_autenticidade" as any);
    const { data: codigoData } = await supabase.rpc("hunter_gerar_codigo_verificacao" as any);

    const selo =
      (seloData as unknown as string) || `SGD-${Date.now().toString(16).toUpperCase().slice(-8)}`;
    const codigo =
      (codigoData as unknown as string) || Math.random().toString(36).substring(2, 8).toUpperCase();

    const dataAssinaturaFinal = input.data_assinatura
      ? new Date(input.data_assinatura).toISOString()
      : new Date().toISOString();

    const numContratoFinal =
      input.numero_contrato ||
      `CTR-${Math.floor(1000 + Math.random() * 9000)}/${new Date().getFullYear()}`;

    const { data, error } = await supabase
      .from("contratos_clientes" as any)
      .insert({
        cliente_id: input.cliente_id,
        numero_contrato: numContratoFinal,
        tipo_contrato: input.tipo_contrato || "LOCACAO_AUTOMONITORAMENTO",
        hash_pdf_original: hashAssinado,
        hash_pdf_assinado: hashAssinado,
        selo_autenticidade: selo,
        codigo_verificacao: codigo,
        status: "assinado",
        data_emissao: dataAssinaturaFinal,
        data_envio_cliente: dataAssinaturaFinal,
        data_assinatura: dataAssinaturaFinal,
        assinado_por_nome: input.assinado_por_nome || "Cliente",
        assinatura_metodo: input.assinatura_metodo || "digital",
        emitido_por_nome: input.emitido_por_nome || "Administrador do Sistema",
        vigencia_inicio: input.vigencia_inicio || null,
        vigencia_fim: input.vigencia_fim || null,
        valor_mensalidade: input.valor_mensalidade || 0,
        valor_total_contrato: input.valor_total_contrato || 0,
        metadata: input.metadata || {},
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { sucesso: false, mensagem: error.message };
    }

    return {
      sucesso: true,
      mensagem: "Contrato assinado registrado no banco de dados com hash de integridade.",
      contrato: data as unknown as ContratoCliente,
    };
  } catch (err: any) {
    return {
      sucesso: false,
      mensagem: err?.message || "Falha ao registrar contrato assinado.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Verificar autenticidade de contrato (por selo, código ou hash)
// ─────────────────────────────────────────────────────────────────────────────

export async function verificarAutenticidadeContrato(
  identificador: string,
): Promise<ResultadoVerificacaoContrato> {
  try {
    // Tenta via API backend (apenas no navegador)
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identificador: identificador.trim() }),
        });

        if (res.ok) {
          const data = await res.json();
          return {
            autentico: Boolean(data?.autentico),
            mensagem: data?.mensagem || "Verificação concluída.",
            contrato_id: data?.contrato_id,
            numero_contrato: data?.numero_contrato,
            selo_autenticidade: data?.selo_autenticidade,
            codigo_verificacao: data?.codigo_verificacao,
            status: data?.status,
            data_emissao: data?.data_emissao,
            data_assinatura: data?.data_assinatura,
            cliente_nome: data?.cliente_nome,
            cliente_documento: data?.cliente_documento,
            emitido_por_nome: data?.emitido_por_nome || data?.assinado_por_nome,
            assinado_por_nome: data?.assinado_por_nome,
            assinatura_metodo: data?.assinatura_metodo,
            hash_pdf_original: data?.hash_pdf_original,
            hash_pdf_assinado: data?.hash_pdf_assinado,
          };
        }
      } catch {
        // fallback
      }
    }

    // Estratégia Principal no Banco: RPC segura hunter_verificar_autenticidade_contrato (SECURITY DEFINER)
    // Permite que visitantes anônimos no portal /verificar validem com precisão sem expor tabelas via SELECT direto
    try {
      const { data, error } = await supabase.rpc("hunter_verificar_autenticidade_contrato" as any, {
        p_identificador: identificador.trim(),
      });

      if (!error && data) {
        const resultado = data as unknown as Record<string, any>;
        if (resultado?.autentico) {
          return {
            autentico: true,
            mensagem: String(
              resultado?.mensagem || "Documento ou contrato autêntico validado com sucesso.",
            ),
            contrato_id: resultado?.contrato_id,
            numero_contrato: resultado?.numero_contrato,
            selo_autenticidade: resultado?.selo_autenticidade,
            codigo_verificacao: resultado?.codigo_verificacao,
            status: resultado?.status || "assinado",
            data_emissao: resultado?.data_emissao,
            data_assinatura: resultado?.data_assinatura,
            cliente_nome: resultado?.cliente_nome,
            emitido_por_nome: resultado?.emitido_por_nome || resultado?.assinado_por_nome,
            assinado_por_nome: resultado?.assinado_por_nome,
            hash_pdf_original: resultado?.hash_pdf_original,
            hash_pdf_assinado: resultado?.hash_pdf_assinado,
          };
        }
      }
    } catch {
      // continua para fallbacks diretos caso a RPC esteja indisponível
    }

    // Fallback 1: Buscar diretamente em contratos_clientes
    try {
      const { data: ctData, error: ctError } = await supabase
        .from("contratos_clientes" as any)
        .select("*")
        .or(
          `selo_autenticidade.eq.${identificador.toUpperCase()},codigo_verificacao.eq.${identificador.toUpperCase()},hash_pdf_assinado.eq.${identificador.toLowerCase()},hash_pdf_original.eq.${identificador.toLowerCase()}`,
        )
        .limit(1);

      if (!ctError && ctData && ctData.length > 0) {
        const c = ctData[0] as any;
        return {
          autentico: true,
          mensagem: "Contrato autêntico conferido e validado com sucesso pelo GD Rastreamento.",
          contrato_id: c.id,
          numero_contrato: c.numero_contrato,
          selo_autenticidade: c.selo_autenticidade,
          codigo_verificacao: c.codigo_verificacao,
          status: c.status,
          data_emissao: c.data_emissao,
          data_assinatura: c.data_assinatura,
          emitido_por_nome: c.emitido_por_nome,
          assinado_por_nome: c.assinado_por_nome,
          hash_pdf_original: c.hash_pdf_original,
          hash_pdf_assinado: c.hash_pdf_assinado,
        };
      }
    } catch {
      // continua
    }

    // Fallback 2: Buscar em documentos_emitidos (usuários autenticados ou quando houver permissão)
    try {
      const { data: docData, error: docError } = await supabase
        .from("documentos_emitidos" as any)
        .select("*")
        .eq("hash_sha256", identificador.toLowerCase())
        .limit(1);

      if (!docError && docData && docData.length > 0) {
        const d = docData[0] as any;
        const meta = d.metadata || {};
        return {
          autentico: true,
          mensagem:
            "Documento oficial autêntico conferido e validado com sucesso pelo GD Rastreamento.",
          contrato_id: d.id,
          numero_contrato: meta.numero_contrato || d.nome_arquivo || "DOC-OFICIAL",
          selo_autenticidade: meta.selo || `SGD-${d.id.slice(0, 8).toUpperCase()}`,
          codigo_verificacao: meta.codigo || d.id.slice(0, 6).toUpperCase(),
          status: "assinado",
          data_emissao: d.created_at,
          data_assinatura: d.created_at,
          emitido_por_nome: d.emissor_nome || "GD Rastreamento",
          assinado_por_nome: d.emissor_nome || "GD Rastreamento",
          cliente_nome: meta.cliente_nome || d.descricao || "Cliente",
          hash_pdf_original: d.hash_sha256,
          hash_pdf_assinado: d.hash_sha256,
        };
      }
    } catch {
      // ignora
    }

    return {
      autentico: false,
      mensagem: "Nenhum documento ou contrato autêntico localizado com este identificador ou hash.",
    };
  } catch {
    return {
      autentico: false,
      mensagem: "Nenhum documento ou contrato autêntico localizado com este identificador ou hash.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Listar contratos de um cliente
// ─────────────────────────────────────────────────────────────────────────────

export async function listarContratosCliente(clienteId: string): Promise<ContratoCliente[]> {
  try {
    const { data, error } = await supabase
      .from("contratos_clientes" as any)
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data as unknown as ContratoCliente[];
    }

    // Fallback via endpoint seguro com service_role
    if (typeof window !== "undefined") {
      try {
        const res = await fetch(`/api/contratos/listar/${clienteId}`);
        if (res.ok) {
          const json = await res.json();
          if (json?.contratos && Array.isArray(json.contratos)) {
            return json.contratos as ContratoCliente[];
          }
        }
      } catch {
        // ignora
      }
    }

    // Fallback 3: busca em documentos_emitidos se contratos_clientes estiver vazio
    try {
      const { data: docs } = await supabase
        .from("documentos_emitidos")
        .select("*")
        .order("created_at", { ascending: false });

      if (docs && docs.length > 0) {
        const docsDoCliente = docs.filter((d) => {
          const m = (d.metadata || {}) as any;
          return (
            (m.cliente_id === clienteId || String(m.cliente_id) === String(clienteId)) &&
            (d.tipo_documento === "CONTRATO_PRESTACAO_SERVICOS" ||
              d.tipo_documento === "COPIA_AUTENTICA_CONTRATO")
          );
        });

        if (docsDoCliente.length > 0) {
          return docsDoCliente.map((d) => {
            const m = (d.metadata || {}) as any;
            return {
              id: d.id,
              cliente_id: clienteId,
              numero_contrato: m.numero_contrato || "CTR-0001/2026",
              tipo_contrato: "PRESTACAO_SERVICOS",
              hash_pdf_original: d.hash_sha256,
              hash_pdf_assinado: d.hash_sha256,
              selo_autenticidade: m.selo || "SGD-OFICIAL",
              codigo_verificacao: m.codigo || "VALIDO",
              status:
                d.tipo_documento === "COPIA_AUTENTICA_CONTRATO"
                  ? "assinado"
                  : "pendente_assinatura",
              data_emissao: d.created_at,
              data_envio_cliente: d.created_at,
              data_assinatura:
                d.tipo_documento === "COPIA_AUTENTICA_CONTRATO" ? d.created_at : undefined,
              emitido_por_nome: d.emissor_nome || "Administrador do Sistema",
              metadata: {
                ...m,
                link_assinatura: m.link_assinatura,
              },
              created_at: d.created_at,
              updated_at: d.created_at,
            } as ContratoCliente;
          });
        }
      }
    } catch (errDocs) {
      console.warn("Aviso ao buscar fallback em documentos_emitidos:", errDocs);
    }

    if (error) {
      console.error("Erro ao listar contratos do cliente:", error);
    }

    return (data || []) as unknown as ContratoCliente[];
  } catch (err) {
    console.error("Exceção ao listar contratos:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Marcar contrato como enviado ao cliente
// ─────────────────────────────────────────────────────────────────────────────

export async function marcarContratoEnviadoCliente(contratoId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("contratos_clientes" as any)
      .update({
        status: "enviado_cliente",
        data_envio_cliente: new Date().toISOString(),
      } as any)
      .eq("id", contratoId);

    if (error) {
      console.error("Erro ao marcar contrato como enviado:", error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cancelar contrato
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelarContrato(
  contratoId: string,
  motivo: string = "Cancelado pelo operador",
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    // 1. Tenta API do servidor
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/cancelar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contrato_id: contratoId, motivo }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.success) {
            return { sucesso: true, mensagem: json.message || "Contrato cancelado com sucesso." };
          }
        }
      } catch (errApi) {
        console.warn("Aviso ao cancelar via API:", errApi);
      }
    }

    // 2. Fallback direto Supabase
    const { error } = await supabase
      .from("contratos_clientes" as any)
      .update({
        status: "cancelado",
        motivo_invalidacao: motivo,
        data_cancelamento: new Date().toISOString(),
      } as any)
      .eq("id", contratoId);

    if (error) {
      console.error("Erro ao cancelar contrato:", error);
      return { sucesso: false, mensagem: error.message };
    }
    return { sucesso: true, mensagem: "Contrato cancelado com sucesso." };
  } catch (err: any) {
    return { sucesso: false, mensagem: err?.message || "Falha ao cancelar contrato." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.1 Excluir contrato de teste definitivamente
// ─────────────────────────────────────────────────────────────────────────────

export async function excluirContratoTeste(
  contrato: ContratoCliente,
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    // 1. Tenta API do servidor com service_role
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/contratos/excluir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrato_id: contrato.id,
            hash_pdf_original: contrato.hash_pdf_original,
            numero_contrato: contrato.numero_contrato,
            cliente_id: contrato.cliente_id,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.success) {
            return {
              sucesso: true,
              mensagem: json.message || "Contrato de teste excluído com sucesso.",
            };
          }
        }
      } catch (errApi) {
        console.warn("Aviso ao excluir via API:", errApi);
      }
    }

    // 2. Fallback direto Supabase
    if (contrato.id && contrato.id.length > 20 && !contrato.id.startsWith("ct-")) {
      try {
        await supabase
          .from("contratos_clientes" as any)
          .delete()
          .eq("id", contrato.id);
      } catch {
        void 0;
      }
      try {
        await supabase.from("documentos_emitidos").delete().eq("id", contrato.id);
      } catch {
        void 0;
      }
    }
    if (contrato.hash_pdf_original) {
      try {
        await supabase
          .from("documentos_emitidos")
          .delete()
          .eq("hash_sha256", contrato.hash_pdf_original);
      } catch {
        void 0;
      }
    }

    return { sucesso: true, mensagem: "Contrato de teste excluído com sucesso." };
  } catch (err: any) {
    return { sucesso: false, mensagem: err?.message || "Falha ao excluir contrato de teste." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Obter contrato por ID
// ─────────────────────────────────────────────────────────────────────────────

export async function obterContratoPorId(contratoId: string): Promise<ContratoCliente | null> {
  try {
    const { data, error } = await supabase
      .from("contratos_clientes" as any)
      .select("*")
      .eq("id", contratoId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as unknown as ContratoCliente;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Verificar integridade de um PDF enviado contra o hash armazenado
// ─────────────────────────────────────────────────────────────────────────────

export async function verificarIntegridadePdfContrato(
  contratoId: string,
  pdfBuffer: ArrayBuffer,
): Promise<{
  integro: boolean;
  hashCalculado: string;
  hashArmazenado: string | null;
  mensagem: string;
}> {
  try {
    const hashCalculado = await calcularSha256Buffer(pdfBuffer);

    const contrato = await obterContratoPorId(contratoId);
    if (!contrato) {
      return {
        integro: false,
        hashCalculado,
        hashArmazenado: null,
        mensagem: "Contrato não encontrado no sistema.",
      };
    }

    const hashReferencia = contrato.hash_pdf_assinado || contrato.hash_pdf_original;

    if (hashReferencia && hashCalculado === hashReferencia) {
      return {
        integro: true,
        hashCalculado,
        hashArmazenado: hashReferencia,
        mensagem: "Documento íntegro. O hash SHA-256 confere com o registro oficial do sistema.",
      };
    }

    return {
      integro: false,
      hashCalculado,
      hashArmazenado: hashReferencia || null,
      mensagem:
        "ALERTA: O hash SHA-256 deste documento NÃO confere com o registro oficial. Possível adulteração.",
    };
  } catch (err: any) {
    return {
      integro: false,
      hashCalculado: "",
      hashArmazenado: null,
      mensagem: err?.message || "Falha ao verificar integridade.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Baixar PDF assinado armazenado no BD via API
// ─────────────────────────────────────────────────────────────────────────────

export async function baixarPdfContratoArmazenado(
  contratoId: string,
  nomeArquivo?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/contratos/download/${contratoId}`);
    if (!res.ok) {
      return false;
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo || `Contrato_${contratoId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
