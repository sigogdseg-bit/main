import { supabase } from "@/integrations/supabase/client";
import type {
  ItemEstoque,
  Fornecedor,
  MovimentacaoEstoque,
  EntradaEstoqueInput,
  NovoFornecedorInput,
  ItemBaixaInstalacao,
  NovoItemEstoqueInput,
  EditarCompraInput,
  KitEstoque,
  SalvarKitInput,
} from "../types";

export async function listarItensEstoque(): Promise<ItemEstoque[]> {
  try {
    // 1. Prioridade máxima: Rota segura do backend (/api/estoque/itens) com Service Role
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const res = await fetch("/api/estoque/itens", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.itens)) {
            return json.itens.map((item: any) => ({
              id: item.id,
              codigo_sku: item.codigo_sku,
              nome: item.nome,
              descricao: item.descricao,
              categoria: item.categoria,
              quantidade_atual: Number(item.quantidade_atual || 0),
              quantidade_minima: Number(item.quantidade_minima || 0),
              unidade_medida: item.unidade_medida,
              custo_medio_unitario: Number(item.custo_medio_unitario || 0),
              custo_base: Number(item.custo_base ?? item.custo_medio_unitario ?? 0),
              custo_frete: Number(item.custo_frete || 0),
              preco_venda: Number(item.preco_venda || 0),
              markup_percentual: Number(item.markup_percentual || 0),
              localizacao: item.localizacao,
              ativo: item.ativo,
              created_at: item.created_at,
              updated_at: item.updated_at,
            })) as ItemEstoque[];
          }
        }
      }
    } catch {
      /* fallback */
    }

    const { data, error } = await supabase
      .from("estoque_itens" as any)
      .select("*")
      .order("nome", { ascending: true });

    if (error || !data) {
      console.warn("Erro ao listar itens de estoque:", error);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      codigo_sku: item.codigo_sku,
      nome: item.nome,
      descricao: item.descricao,
      categoria: item.categoria,
      quantidade_atual: Number(item.quantidade_atual || 0),
      quantidade_minima: Number(item.quantidade_minima || 0),
      unidade_medida: item.unidade_medida,
      custo_medio_unitario: Number(item.custo_medio_unitario || 0),
      custo_base: Number(item.custo_base ?? item.custo_medio_unitario ?? 0),
      custo_frete: Number(item.custo_frete || 0),
      preco_venda: Number(item.preco_venda || 0),
      markup_percentual: Number(item.markup_percentual || 0),
      localizacao: item.localizacao,
      ativo: item.ativo,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })) as ItemEstoque[];
  } catch (err) {
    console.error("Falha ao consultar estoque de itens:", err);
    return [];
  }
}

export async function listarFornecedores(): Promise<Fornecedor[]> {
  try {
    const { data, error } = await supabase
      .from("fornecedores" as any)
      .select("*")
      .order("nome_fantasia", { ascending: true });

    if (error || !data) {
      console.warn("Erro ao listar fornecedores:", error);
      return [];
    }

    return data as Fornecedor[];
  } catch (err) {
    console.error("Falha ao consultar fornecedores:", err);
    return [];
  }
}

export async function salvarFornecedor(
  dados: NovoFornecedorInput,
  fornecedorId?: string,
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const payload = {
      razao_social: dados.razaoSocial,
      nome_fantasia: dados.nomeFantasia,
      cnpj_cpf: dados.cnpjCpf || null,
      contato_nome: dados.contatoNome || null,
      telefone: dados.telefone || null,
      email: dados.email || null,
      categoria: dados.categoria,
      chave_pix: dados.chavePix || null,
      dados_bancarios: dados.dadosBancarios || null,
      observacoes: dados.observacoes || null,
      updated_at: new Date().toISOString(),
    };

    if (fornecedorId) {
      const { data, error } = await supabase
        .from("fornecedores" as any)
        .update(payload)
        .eq("id", fornecedorId)
        .select("id")
        .single();

      if (error) {
        console.warn("Tentando salvar via RPC de contingência após erro de RLS:", error.message);
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "salvar_fornecedor_seguro" as any,
          {
            p_id: fornecedorId,
            p_razao_social: payload.razao_social,
            p_nome_fantasia: payload.nome_fantasia,
            p_cnpj_cpf: payload.cnpj_cpf,
            p_contato_nome: payload.contato_nome,
            p_telefone: payload.telefone,
            p_email: payload.email,
            p_categoria: payload.categoria,
            p_chave_pix: payload.chave_pix,
            p_dados_bancarios: payload.dados_bancarios,
            p_observacoes: payload.observacoes,
          },
        );

        if (rpcErr || (rpcData && !(rpcData as any).sucesso)) {
          throw error;
        }

        return {
          success: true,
          message: (rpcData as any)?.mensagem || "Fornecedor atualizado com sucesso!",
          id: (rpcData as any)?.id || fornecedorId,
        };
      }

      return {
        success: true,
        message: "Fornecedor atualizado com sucesso!",
        id: (data as any)?.id,
      };
    } else {
      const { data, error } = await supabase
        .from("fornecedores" as any)
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        console.warn("Tentando cadastrar via RPC de contingência após erro de RLS:", error.message);
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "salvar_fornecedor_seguro" as any,
          {
            p_razao_social: payload.razao_social,
            p_nome_fantasia: payload.nome_fantasia,
            p_cnpj_cpf: payload.cnpj_cpf,
            p_contato_nome: payload.contato_nome,
            p_telefone: payload.telefone,
            p_email: payload.email,
            p_categoria: payload.categoria,
            p_chave_pix: payload.chave_pix,
            p_dados_bancarios: payload.dados_bancarios,
            p_observacoes: payload.observacoes,
          },
        );

        if (rpcErr || (rpcData && !(rpcData as any).sucesso)) {
          throw error;
        }

        return {
          success: true,
          message: (rpcData as any)?.mensagem || "Fornecedor cadastrado com sucesso!",
          id: (rpcData as any)?.id,
        };
      }

      return {
        success: true,
        message: "Fornecedor cadastrado com sucesso!",
        id: (data as any)?.id,
      };
    }
  } catch (err: any) {
    console.error("Erro ao salvar fornecedor:", err);
    return { success: false, message: err?.message || "Não foi possível salvar o fornecedor." };
  }
}

export async function registrarEntradaCompra(
  input: EntradaEstoqueInput,
): Promise<{ success: boolean; message: string; despesa_id?: string; novo_saldo?: number }> {
  try {
    const { data, error } = await supabase.rpc("registrar_entrada_estoque_financeiro", {
      p_item_id: input.itemId,
      p_quantidade: input.quantidade,
      p_custo_unitario: input.custoUnitario,
      p_fornecedor_id: input.fornecedorId || null,
      p_documento_fiscal: input.documentoFiscal || null,
      p_data_pagamento: input.dataPagamento || new Date().toISOString().split("T")[0],
      p_observacoes: input.observacoes || null,
      p_valor_frete: input.valorFrete || 0,
    });

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: res.mensagem || "Entrada e lançamento financeiro registrados!",
        despesa_id: res.despesa_id,
        novo_saldo: res.novo_saldo,
      };
    }

    return {
      success: false,
      message: res?.mensagem || "Não foi possível registrar a entrada de estoque.",
    };
  } catch (err: any) {
    console.error("Erro ao registrar entrada de estoque:", err);
    return {
      success: false,
      message: err?.message || "Erro de conexão ao processar compra de estoque.",
    };
  }
}

export async function editarEntradaCompra(
  input: EditarCompraInput,
): Promise<{ success: boolean; message: string; novo_saldo?: number }> {
  try {
    const { data, error } = await supabase.rpc("editar_entrada_compra_financeiro", {
      p_movimentacao_id: input.movimentacaoId,
      p_quantidade: input.quantidade,
      p_custo_unitario: input.custoUnitario,
      p_valor_frete: input.valorFrete || 0,
      p_fornecedor_id: input.fornecedorId || null,
      p_documento_fiscal: input.documentoFiscal || null,
      p_data_pagamento: input.dataPagamento || null,
      p_observacoes: input.observacoes || null,
    });

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: res.mensagem || "Compra e movimentação atualizadas com sucesso!",
        novo_saldo: res.novo_saldo,
      };
    }

    return {
      success: false,
      message: res?.mensagem || "Não foi possível atualizar a compra.",
    };
  } catch (err: any) {
    console.error("Erro ao editar compra de estoque:", err);
    return {
      success: false,
      message: err?.message || "Erro de conexão ao processar edição da compra.",
    };
  }
}
export async function obterMateriaisInstalacao(instalacaoId: string): Promise<
  {
    item_id: string;
    nome: string;
    codigo_sku: string;
    unidade_medida: string;
    quantidade: number;
    custo_unitario: number;
  }[]
> {
  try {
    const { data, error } = await supabase.rpc("obter_materiais_instalacao", {
      p_instalacao_id: instalacaoId,
    });

    if (error || !data) {
      console.warn("Erro ao obter materiais da instalação:", error);
      return [];
    }

    return (data as any[]).map((row) => ({
      item_id: row.item_id,
      nome: row.nome,
      codigo_sku: row.codigo_sku,
      unidade_medida: row.unidade_medida,
      quantidade: Number(row.quantidade || 0),
      custo_unitario: Number(row.custo_unitario || 0),
    }));
  } catch (err) {
    console.warn("Exceção ao buscar materiais da instalação:", err);
    return [];
  }
}

export async function sincronizarEstoqueInstalacao(
  instalacaoId: string,
  itens: ItemBaixaInstalacao[],
  instaladorId?: string,
): Promise<{
  success: boolean;
  message: string;
  itens_baixados?: number;
  itens_estornados?: number;
}> {
  try {
    const { data, error } = await supabase.rpc("sincronizar_estoque_instalacao", {
      p_instalacao_id: instalacaoId,
      p_itens: itens.map((i) => ({
        item_id: i.itemId,
        quantidade: i.quantidade,
        observacao: i.observacao || null,
      })),
      p_instalador_id: instaladorId || null,
    });

    if (error) throw error;

    const res = data as any;
    return {
      success: !!res?.sucesso,
      message: res?.mensagem || "Estoque sincronizado com sucesso.",
      itens_baixados: res?.itens_baixados || 0,
      itens_estornados: res?.itens_estornados || 0,
    };
  } catch (err: any) {
    console.error("Erro ao sincronizar estoque da instalação:", err);
    return {
      success: false,
      message: err?.message || "Falha ao sincronizar materiais no estoque.",
    };
  }
}

export async function registrarBaixaInstalacao(
  instalacaoId: string,
  itens: ItemBaixaInstalacao[],
  instaladorId?: string,
): Promise<{
  success: boolean;
  message: string;
  itens_baixados?: number;
  itens_estornados?: number;
}> {
  return sincronizarEstoqueInstalacao(instalacaoId, itens, instaladorId);
}

export async function listarMovimentacoesEstoque(filtros?: {
  itemId?: string;
  instalacaoId?: string;
  tipo?: string;
  limit?: number;
}): Promise<MovimentacaoEstoque[]> {
  try {
    // 1. Prioridade máxima: Rota segura de backend (/api/estoque/movimentacoes) com Service Role
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const res = await fetch("/api/estoque/movimentacoes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.movimentacoes)) {
            let lista = json.movimentacoes;
            if (filtros?.itemId) {
              lista = lista.filter((m: any) => m.item_id === filtros.itemId);
            }
            if (filtros?.instalacaoId) {
              lista = lista.filter((m: any) => m.instalacao_id === filtros.instalacaoId);
            }
            if (filtros?.tipo && filtros.tipo !== "todos") {
              lista = lista.filter((m: any) => m.tipo === filtros.tipo);
            }
            return lista.slice(0, filtros?.limit || 100).map((m: any) => ({
              ...m,
              quantidade: Number(m.quantidade || 0),
              custo_unitario: Number(m.custo_unitario || 0),
              valor_total: Number(m.valor_total || 0),
              saldo_anterior: Number(m.saldo_anterior || 0),
              saldo_posterior: Number(m.saldo_posterior || 0),
            })) as MovimentacaoEstoque[];
          }
        }
      }
    } catch {
      /* fallback */
    }

    let query = supabase
      .from("estoque_movimentacoes" as any)
      .select(
        `
        *,
        item:item_id (
          nome,
          codigo_sku,
          unidade_medida,
          categoria
        ),
        fornecedor:fornecedor_id (
          nome_fantasia,
          razao_social
        ),
        instalacao:instalacao_id (
          placa,
          modelo
        )
      `,
      )
      .order("data_movimento", { ascending: false })
      .limit(filtros?.limit || 50);

    if (filtros?.itemId) {
      query = query.eq("item_id", filtros.itemId);
    }

    if (filtros?.instalacaoId) {
      query = query.eq("instalacao_id", filtros.instalacaoId);
    }

    if (filtros?.tipo && filtros.tipo !== "todos") {
      query = query.eq("tipo", filtros.tipo);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as any[]).map((m) => ({
      ...m,
      quantidade: Number(m.quantidade || 0),
      custo_unitario: Number(m.custo_unitario || 0),
      valor_total: Number(m.valor_total || 0),
      saldo_anterior: Number(m.saldo_anterior || 0),
      saldo_posterior: Number(m.saldo_posterior || 0),
    })) as MovimentacaoEstoque[];
  } catch (err) {
    console.warn("Erro ao listar movimentações de estoque:", err);
    return [];
  }
}

export async function salvarItemEstoque(
  input: NovoItemEstoqueInput,
): Promise<{ success: boolean; message: string; item?: ItemEstoque }> {
  try {
    const custoBase = Number(
      input.custo_base !== undefined ? input.custo_base : (input.custo_medio_unitario ?? 0),
    );
    const custoFrete = Number(input.custo_frete || 0);
    const custoMedioUnitario = Number(
      input.custo_medio_unitario !== undefined
        ? input.custo_medio_unitario
        : custoBase + custoFrete,
    );

    const payload = {
      codigo_sku: input.codigo_sku.trim().toUpperCase(),
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() || null,
      categoria: input.categoria.trim(),
      quantidade_minima: Number(input.quantidade_minima || 5),
      unidade_medida: input.unidade_medida?.trim() || "unidade",
      localizacao: input.localizacao?.trim() || "Almoxarifado",
      custo_base: custoBase,
      custo_frete: custoFrete,
      custo_medio_unitario: custoMedioUnitario,
      preco_venda: Number(input.preco_venda || 0),
      markup_percentual: Number(input.markup_percentual || 0),
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { data, error } = await supabase
        .from("estoque_itens" as any)
        .update(payload)
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: "Material atualizado com sucesso!", item: data as any };
    } else {
      const { data, error } = await supabase
        .from("estoque_itens" as any)
        .insert({
          ...payload,
          quantidade_atual: 0,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: "Material cadastrado com sucesso!", item: data as any };
    }
  } catch (err: any) {
    console.error("Erro ao salvar material no estoque:", err);
    return {
      success: false,
      message: err?.message || "Falha ao salvar material no estoque.",
    };
  }
}

export async function excluirItemEstoque(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "excluir_item_estoque_seguro" as any,
      { p_id: id },
    );

    if (!rpcErr && rpcData) {
      const res = rpcData as any;
      if (res.sucesso) {
        return { success: true, message: res.mensagem || "Material excluído com sucesso!" };
      }
    }

    const { error } = await supabase
      .from("estoque_itens" as any)
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true, message: "Material removido do catálogo com sucesso!" };
  } catch (err: any) {
    console.error("Erro ao excluir material do estoque:", err);
    return {
      success: false,
      message: err?.message || "Falha ao excluir material.",
    };
  }
}

export async function excluirFornecedor(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "excluir_fornecedor_seguro" as any,
      { p_id: id },
    );

    if (!rpcErr && rpcData) {
      const res = rpcData as any;
      if (res.sucesso) {
        return { success: true, message: res.mensagem || "Fornecedor excluído com sucesso!" };
      }
    }

    const { error } = await supabase
      .from("fornecedores" as any)
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true, message: "Fornecedor removido com sucesso!" };
  } catch (err: any) {
    console.error("Erro ao excluir fornecedor:", err);
    return {
      success: false,
      message: err?.message || "Falha ao excluir fornecedor.",
    };
  }
}

export async function excluirMovimentacaoEstoque(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "excluir_movimentacao_estoque_seguro" as any,
      { p_id: id },
    );

    if (!rpcErr && rpcData) {
      const res = rpcData as any;
      if (res.sucesso) {
        return { success: true, message: res.mensagem || "Movimentação estornada com sucesso!" };
      }
    }

    const { error } = await supabase
      .from("estoque_movimentacoes" as any)
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true, message: "Movimentação excluída com sucesso!" };
  } catch (err: any) {
    console.error("Erro ao excluir movimentação:", err);
    return {
      success: false,
      message: err?.message || "Falha ao excluir movimentação.",
    };
  }
}

export async function listarKitsEstoque(): Promise<KitEstoque[]> {
  try {
    const { data, error } = await supabase
      .from("estoque_kits" as any)
      .select(
        `
        *,
        itens:estoque_kit_itens (
          id,
          kit_id,
          item_id,
          quantidade,
          material:estoque_itens (
            id,
            codigo_sku,
            nome,
            unidade_medida,
            custo_medio_unitario,
            preco_venda,
            quantidade_atual
          )
        )
      `,
      )
      .order("nome", { ascending: true });

    if (error || !data) {
      console.warn("Erro ao listar kits de estoque:", error);
      return [];
    }

    return data.map((kit: any) => ({
      id: kit.id,
      codigo_sku: kit.codigo_sku,
      nome: kit.nome,
      descricao: kit.descricao || undefined,
      custo_total: Number(kit.custo_total || 0),
      custo_mao_de_obra: Number(kit.custo_mao_de_obra || 0),
      preco_venda: Number(kit.preco_venda || 0),
      markup_percentual: Number(kit.markup_percentual || 0),
      ativo: Boolean(kit.ativo ?? true),
      created_at: kit.created_at,
      updated_at: kit.updated_at,
      itens: Array.isArray(kit.itens)
        ? kit.itens.map((it: any) => ({
            id: it.id,
            kit_id: it.kit_id,
            item_id: it.item_id,
            quantidade: Number(it.quantidade || 1),
            material: it.material
              ? {
                  id: it.material.id,
                  codigo_sku: it.material.codigo_sku,
                  nome: it.material.nome,
                  unidade_medida: it.material.unidade_medida,
                  custo_medio_unitario: Number(it.material.custo_medio_unitario || 0),
                  preco_venda: Number(it.material.preco_venda || 0),
                  quantidade_atual: Number(it.material.quantidade_atual || 0),
                }
              : undefined,
          }))
        : [],
    }));
  } catch (err) {
    console.warn("Exceção ao listar kits:", err);
    return [];
  }
}

export async function salvarKitEstoque(
  input: SalvarKitInput,
): Promise<{ success: boolean; message: string; kit_id?: string }> {
  try {
    const itensPayload = input.itens.map((i) => ({
      item_id: (i.item_id || i.itemId || "").trim(),
      quantidade: Number(i.quantidade || 1),
    }));

    const codigoSku = (input.codigo_sku || input.codigoSku || "").trim().toUpperCase();
    const custoTotal = Number(input.custo_total ?? input.custoTotal ?? 0);
    const custoMaoDeObra = Number(input.custo_mao_de_obra ?? input.custoMaoDeObra ?? 0);
    const precoVenda = Number(input.preco_venda ?? input.precoVenda ?? 0);
    const markupPercentual = Number(input.markup_percentual ?? input.markupPercentual ?? 0);

    const { data, error } = await supabase.rpc("salvar_kit_estoque_seguro" as any, {
      p_id: input.id || null,
      p_codigo_sku: codigoSku,
      p_nome: input.nome.trim(),
      p_descricao: input.descricao?.trim() || null,
      p_custo_total: custoTotal,
      p_preco_venda: precoVenda,
      p_markup_percentual: markupPercentual,
      p_itens: itensPayload,
      p_custo_mao_de_obra: custoMaoDeObra,
    });

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: res.mensagem || "Kit salvo com sucesso!",
        kit_id: res.kit_id,
      };
    }

    return {
      success: false,
      message: res?.mensagem || "Não foi possível salvar o kit.",
    };
  } catch (err: any) {
    console.error("Erro ao salvar kit de estoque:", err);
    return {
      success: false,
      message: err?.message || "Falha na comunicação ao salvar o kit.",
    };
  }
}

export async function excluirKitEstoque(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("excluir_kit_estoque_seguro" as any, { p_id: id });

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: res.mensagem || "Kit excluído com sucesso!",
      };
    }

    return {
      success: false,
      message: res?.mensagem || "Falha ao excluir o kit.",
    };
  } catch (err: any) {
    console.error("Erro ao excluir kit:", err);
    return {
      success: false,
      message: err?.message || "Falha ao excluir o kit.",
    };
  }
}
