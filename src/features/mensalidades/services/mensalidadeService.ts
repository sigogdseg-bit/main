import { supabase } from "@/integrations/supabase/client";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import {
  normalizarTelefoneParaWhatsapp,
  enviarMensagemWhatsappOperador,
} from "@/shared/lib/chatbotxBridge";
import { calcularEncargosAtraso } from "../utils/encargosLegais";
import { APP_NOME } from "@/shared/lib/version";
import type { MensalidadeItem, NovaMensalidadeInput, ResumoFinanceiroMensalidades } from "../types";

export async function listarMensalidades(
  clienteIdFiltro?: string | null,
): Promise<MensalidadeItem[]> {
  try {
    let query = supabase.from("mensalidades").select(
      `
        id,
        cliente_id,
        mes_referencia,
        ano_referencia,
        numero_parcela,
        total_parcelas,
        valor,
        data_vencimento,
        status,
        data_pagamento,
        comprovante_url,
        created_at,
        updated_at,
        clientes (
          id,
          nome_razao_social,
          documento,
          telefone,
          email
        )
      `,
    );

    if (clienteIdFiltro) {
      query = query.eq("cliente_id", clienteIdFiltro);
    }

    let { data, error } = await query.order("data_vencimento", { ascending: true });

    if (error) {
      // Fallback caso colunas numero_parcela/total_parcelas ainda não existam no banco remoto
      let fbQuery = supabase.from("mensalidades").select(
        `
          id,
          cliente_id,
          mes_referencia,
          ano_referencia,
          valor,
          data_vencimento,
          status,
          data_pagamento,
          comprovante_url,
          created_at,
          updated_at,
          clientes (
            id,
            nome_razao_social,
            documento,
            telefone,
            email
          )
        `,
      );
      if (clienteIdFiltro) {
        fbQuery = fbQuery.eq("cliente_id", clienteIdFiltro);
      }
      const fb = await fbQuery.order("data_vencimento", { ascending: true });
      data = fb.data as any;
      error = fb.error;
    }

    if (error) {
      console.warn("Erro ao listar mensalidades:", error);
      return [];
    }

    const hojeStr = new Date().toISOString().split("T")[0];

    const normalizadas = (data || []).map((m: any) => {
      let statusAtualizado = m.status;
      if (statusAtualizado === "pendente" && m.data_vencimento < hojeStr) {
        statusAtualizado = "vencido";
      }

      return {
        ...m,
        status: statusAtualizado,
        valor: Number(m.valor || 0),
      } as MensalidadeItem;
    });

    return enriquecerNumeracaoParcelasMensalidades(normalizadas);
  } catch (err) {
    console.error("Excecao ao listar mensalidades:", err);
    return [];
  }
}

/**
 * Informa o pagamento de uma mensalidade pelo cliente titular,
 * notificando imediatamente o SuperADM via WhatsApp e gerando alerta permanente no sistema.
 */
export async function informarPagamentoCliente(params: {
  mensalidadeId: string;
  comprovanteUrl?: string;
  observacoes?: string;
  dataPagamento?: string;
  clienteNome?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch("/api/mensalidades/informar-pagamento", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.sucesso) {
      return {
        success: true,
        message:
          data.mensagem || "Pagamento informado com sucesso! A administração foi notificada.",
      };
    }

    return {
      success: false,
      message: data?.erro || "Falha ao informar pagamento no servidor.",
    };
  } catch (err: any) {
    console.error("Erro ao informar pagamento da fatura:", err);
    return {
      success: false,
      message: err?.message || "Erro de conexão ao informar pagamento.",
    };
  }
}

/**
 * Retorna todas as mensalidades que tiveram pagamento informado pelo cliente e aguardam confirmação de baixa pelo SuperADM.
 */
export async function obterMensalidadesAguardandoBaixa(): Promise<MensalidadeItem[]> {
  try {
    const res = await fetch("/api/mensalidades/aguardando-baixa");
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json?.sucesso && Array.isArray(json.dados)) {
        return json.dados.map((m: any) => ({
          ...m,
          valor: Number(m.valor || 0),
        })) as MensalidadeItem[];
      }
    }

    // Fallback direto via Supabase se o endpoint remoto estiver temporariamente indisponivel
    let { data, error } = await supabase
      .from("mensalidades")
      .select(
        `
        id,
        cliente_id,
        mes_referencia,
        ano_referencia,
        numero_parcela,
        total_parcelas,
        valor,
        data_vencimento,
        status,
        comprovante_url,
        pagamento_informado_em,
        pagamento_informado_obs,
        created_at,
        clientes (
          id,
          nome_razao_social,
          telefone,
          email
        )
      `,
      )
      .neq("status", "pago")
      .not("comprovante_url", "is", null)
      .order("data_vencimento", { ascending: true });

    if (error) {
      const fb = await supabase
        .from("mensalidades")
        .select(
          `
          id,
          cliente_id,
          mes_referencia,
          ano_referencia,
          valor,
          data_vencimento,
          status,
          comprovante_url,
          created_at,
          clientes (
            id,
            nome_razao_social,
            telefone,
            email
          )
        `,
        )
        .neq("status", "pago")
        .not("comprovante_url", "is", null)
        .order("data_vencimento", { ascending: true });
      data = fb.data as any;
    }

    return (data || []).map((m: any) => ({
      ...m,
      valor: Number(m.valor || 0),
    })) as MensalidadeItem[];
  } catch (err) {
    console.error("Erro ao consultar faturas aguardando baixa:", err);
    return [];
  }
}

export async function gerarMensalidadesLote(
  mes: number,
  ano: number,
): Promise<{
  success: boolean;
  geradas: number;
  jaExistentes: number;
  totalClientes: number;
  message: string;
}> {
  try {
    // 1. Tentativa via RPC dedicada no banco
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "admin_gerar_mensalidades_mes" as any,
      {
        p_mes: mes,
        p_ano: ano,
      },
    );

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const resp = rpcData as any;
      return {
        success: true,
        geradas: Number(resp.geradas || 0),
        jaExistentes: Number(resp.ja_existentes || 0),
        totalClientes: Number(resp.total_clientes || 0),
        message: `${resp.geradas || 0} mensalidades geradas com sucesso para a competencia ${String(mes).padStart(2, "0")}/${ano}.`,
      };
    }

    // 2. Fallback resiliente direto no Supabase Client caso a migracao RPC ainda nao tenha rodado no remoto
    console.warn("RPC indisponivel ou retornou erro, aplicando fallback cliente:", rpcError);

    const { data: clientes, error: cliError } = await supabase
      .from("clientes")
      .select("id, dia_vencimento, valor_mensalidade, nome_razao_social, status")
      .neq("status", "bloqueado")
      .neq("status", "aguardando_instalacao")
      .gt("valor_mensalidade", 0);

    // Consulta veículos ativos para garantir que cobrança só seja gerada após a ativação do 1º veículo
    const { data: veicsAtivos } = await supabase
      .from("veiculos")
      .select("cliente_id")
      .eq("ativo", true);
    const clientesComVeiculoAtivoSet = new Set(
      (veicsAtivos || []).map((v: any) => v.cliente_id).filter(Boolean),
    );

    const clientesAptos = (clientes || []).filter((c) => clientesComVeiculoAtivoSet.has(c.id));

    if (cliError || !clientesAptos || clientesAptos.length === 0) {
      return {
        success: false,
        geradas: 0,
        jaExistentes: 0,
        totalClientes: 0,
        message: "Nenhum cliente ativo com veículo instalado encontrado para gerar cobranças.",
      };
    }

    // Ultimo dia do mes selecionado
    const ultimoDiaMes = new Date(ano, mes, 0).getDate();
    const hojeStr = new Date().toISOString().split("T")[0];

    let geradas = 0;
    let jaExistentes = 0;

    for (const c of clientesAptos) {
      const diaVencimento = Math.min(Math.max(Number(c.dia_vencimento || 10), 1), ultimoDiaMes);
      const dataVencimentoStr = `${ano}-${String(mes).padStart(2, "0")}-${String(diaVencimento).padStart(2, "0")}`;
      const statusInicial = dataVencimentoStr < hojeStr ? "vencido" : "pendente";

      const { count: qtdAnteriores } = await supabase
        .from("mensalidades")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", c.id)
        .gt("mes_referencia", 0);
      const numParcela = ((qtdAnteriores || 0) % 12) + 1;

      let { error: insError } = await supabase.from("mensalidades").insert({
        cliente_id: c.id,
        mes_referencia: mes,
        ano_referencia: ano,
        numero_parcela: numParcela,
        total_parcelas: 12,
        valor: Number(c.valor_mensalidade || 79.9),
        data_vencimento: dataVencimentoStr,
        status: statusInicial,
      });

      if (insError && insError.code !== "23505") {
        const fbIns = await supabase.from("mensalidades").insert({
          cliente_id: c.id,
          mes_referencia: mes,
          ano_referencia: ano,
          valor: Number(c.valor_mensalidade || 79.9),
          data_vencimento: dataVencimentoStr,
          status: statusInicial,
        });
        insError = fbIns.error;
      }

      if (!insError) {
        geradas += 1;
      } else {
        jaExistentes += 1;
      }
    }

    return {
      success: true,
      geradas,
      jaExistentes,
      totalClientes: clientes.length,
      message: `${geradas} mensalidades geradas com sucesso para a competencia ${String(mes).padStart(2, "0")}/${ano}.`,
    };
  } catch (err: any) {
    console.error("Falha ao gerar mensalidades em lote:", err);
    return {
      success: false,
      geradas: 0,
      jaExistentes: 0,
      totalClientes: 0,
      message: err?.message || "Erro inesperado ao gerar mensalidades.",
    };
  }
}

export async function criarMensalidadeManual(
  dados: NovaMensalidadeInput,
): Promise<{ success: boolean; message: string }> {
  try {
    const hojeStr = new Date().toISOString().split("T")[0];
    let statusFinal = dados.status || "pendente";
    if (statusFinal === "pendente" && dados.data_vencimento < hojeStr) {
      statusFinal = "vencido";
    }

    let numParcela = dados.numero_parcela ?? null;
    let totalParcelas = dados.total_parcelas ?? null;

    if (dados.mes_referencia > 0 && (!numParcela || numParcela <= 0)) {
      const { count: qtdExistentes } = await supabase
        .from("mensalidades")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", dados.cliente_id)
        .gt("mes_referencia", 0);
      totalParcelas = totalParcelas && totalParcelas > 0 ? totalParcelas : 12;
      numParcela = ((qtdExistentes || 0) % totalParcelas) + 1;
    }

    let { error } = await supabase.from("mensalidades").insert({
      cliente_id: dados.cliente_id,
      mes_referencia: dados.mes_referencia,
      ano_referencia: dados.ano_referencia,
      numero_parcela: numParcela,
      total_parcelas: totalParcelas,
      valor: dados.valor,
      data_vencimento: dados.data_vencimento,
      status: statusFinal,
      data_pagamento: statusFinal === "pago" ? new Date().toISOString() : null,
    });

    if (error && error.code !== "23505") {
      const fb = await supabase.from("mensalidades").insert({
        cliente_id: dados.cliente_id,
        mes_referencia: dados.mes_referencia,
        ano_referencia: dados.ano_referencia,
        valor: dados.valor,
        data_vencimento: dados.data_vencimento,
        status: statusFinal,
        data_pagamento: statusFinal === "pago" ? new Date().toISOString() : null,
      });
      error = fb.error;
    }

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          message: "Ja existe uma mensalidade cadastrada para este cliente nesta competencia.",
        };
      }
      return { success: false, message: error.message || "Erro ao criar cobranca." };
    }

    return { success: true, message: "Mensalidade cadastrada com sucesso!" };
  } catch (err: any) {
    return { success: false, message: err?.message || "Erro ao cadastrar mensalidade." };
  }
}

export async function darBaixaPagamento(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("mensalidades")
      .update({
        status: "pago",
        data_pagamento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return !error;
  } catch (err) {
    console.error("Erro ao dar baixa em mensalidade:", err);
    return false;
  }
}

export async function reabrirMensalidade(id: string, dataVencimento: string): Promise<boolean> {
  try {
    const hojeStr = new Date().toISOString().split("T")[0];
    const statusDestino = dataVencimento < hojeStr ? "vencido" : "pendente";

    const { error } = await supabase
      .from("mensalidades")
      .update({
        status: statusDestino,
        data_pagamento: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return !error;
  } catch (err) {
    console.error("Erro ao reabrir mensalidade:", err);
    return false;
  }
}

export async function excluirMensalidade(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("mensalidades").delete().eq("id", id);
    return !error;
  } catch (err) {
    console.error("Erro ao excluir mensalidade:", err);
    return false;
  }
}

/**
 * Atualiza a data de vencimento de uma cobrança recorrente de mensalidade.
 * @param mensalidadeId ID da mensalidade a atualizar
 * @param novaDataVencimento Nova data no formato YYYY-MM-DD
 * @param escopo "somente_esta" para alterar apenas esta fatura pontual; "todas_futuras" para atualizar esta e todas as faturas futuras pendentes do cliente, além do dia_vencimento no cadastro do cliente.
 */
export async function atualizarVencimentoMensalidade(
  mensalidadeId: string,
  novaDataVencimento: string,
  escopo: "somente_esta" | "todas_futuras" = "todas_futuras",
): Promise<{ success: boolean; message: string; faturasAtualizadas: number }> {
  try {
    if (!mensalidadeId || !novaDataVencimento) {
      return {
        success: false,
        message: "Dados incompletos para atualizar o vencimento.",
        faturasAtualizadas: 0,
      };
    }

    const hojeStr = new Date().toISOString().split("T")[0];

    // 1. Busca a fatura original
    const { data: faturaAtual, error: errBusca } = await supabase
      .from("mensalidades")
      .select("id, cliente_id, mes_referencia, ano_referencia, status, data_vencimento")
      .eq("id", mensalidadeId)
      .single();

    if (errBusca || !faturaAtual) {
      return {
        success: false,
        message: "Cobrança não encontrada para atualização.",
        faturasAtualizadas: 0,
      };
    }

    // Recalcula o status caso a fatura não esteja quitada
    let novoStatus = faturaAtual.status;
    if (novoStatus !== "pago") {
      novoStatus = novaDataVencimento < hojeStr ? "vencido" : "pendente";
    }

    // 2. Atualiza a fatura selecionada
    const { error: errUpdate } = await supabase
      .from("mensalidades")
      .update({
        data_vencimento: novaDataVencimento,
        status: novoStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mensalidadeId);

    if (errUpdate) {
      // Fallback sem updated_at
      const { error: errFb } = await supabase
        .from("mensalidades")
        .update({
          data_vencimento: novaDataVencimento,
          status: novoStatus,
        })
        .eq("id", mensalidadeId);

      if (errFb) {
        return {
          success: false,
          message: errFb.message || "Falha ao atualizar o vencimento da cobrança.",
          faturasAtualizadas: 0,
        };
      }
    }

    // Sincroniza o espelho no livro-caixa se existir
    try {
      const { error: errEspelho } = await supabase
        .from("transacoes_financeiras" as any)
        .update({
          data_vencimento: novaDataVencimento,
          updated_at: new Date().toISOString(),
        })
        .eq("mensalidade_id", mensalidadeId);

      if (errEspelho) {
        await supabase
          .from("transacoes_financeiras" as any)
          .update({
            data_vencimento: novaDataVencimento,
          })
          .eq("mensalidade_id", mensalidadeId);
      }
    } catch {
      // Ignora falha de espelho financeiro
    }

    let faturasAtualizadas = 1;

    // 3. Se escopo for "todas_futuras", atualiza também as faturas futuras pendentes do cliente e o dia_vencimento no cadastro
    if (escopo === "todas_futuras" && faturaAtual.cliente_id) {
      const partesData = novaDataVencimento.split("-").map(Number);
      const novoDiaVencimento = partesData[2];

      // 3.1 Atualiza dia_vencimento na tabela clientes
      if (novoDiaVencimento && novoDiaVencimento >= 1 && novoDiaVencimento <= 31) {
        try {
          const { error: errCli } = await supabase
            .from("clientes")
            .update({
              dia_vencimento: novoDiaVencimento,
              updated_at: new Date().toISOString(),
            })
            .eq("id", faturaAtual.cliente_id);

          if (errCli) {
            await supabase
              .from("clientes")
              .update({
                dia_vencimento: novoDiaVencimento,
              })
              .eq("id", faturaAtual.cliente_id);
          }
        } catch (errCli) {
          console.warn("Aviso ao atualizar dia_vencimento do cliente:", errCli);
        }
      }

      // 3.2 Busca faturas futuras pendentes do mesmo cliente
      const { data: faturasFuturas } = await supabase
        .from("mensalidades")
        .select("id, mes_referencia, ano_referencia, status, data_vencimento")
        .eq("cliente_id", faturaAtual.cliente_id)
        .neq("id", mensalidadeId)
        .neq("status", "pago");

      if (faturasFuturas && faturasFuturas.length > 0 && novoDiaVencimento) {
        const dataVencAtualRef = faturaAtual.data_vencimento || "";
        const anoAtualRef =
          Number(faturaAtual.ano_referencia) ||
          (dataVencAtualRef ? Number(dataVencAtualRef.split("-")[0]) : 0);
        const mesAtualRef =
          Number(faturaAtual.mes_referencia) ||
          (dataVencAtualRef ? Number(dataVencAtualRef.split("-")[1]) : 0);

        for (const fatura of faturasFuturas) {
          let anoF = Number(fatura.ano_referencia);
          let mesF = Number(fatura.mes_referencia);

          // Resiliência caso ano ou mês sejam inválidos/nulos: extrai da data de vencimento
          if (!anoF || !mesF || mesF <= 0 || mesF > 12) {
            if (fatura.data_vencimento) {
              const pData = fatura.data_vencimento.split("-").map(Number);
              anoF = pData[0];
              mesF = pData[1];
            }
          }

          if (!anoF || !mesF || mesF <= 0 || mesF > 12) {
            continue;
          }

          const isFutura =
            anoF > anoAtualRef ||
            (anoF === anoAtualRef && mesF >= mesAtualRef) ||
            Boolean(
              fatura.data_vencimento &&
              dataVencAtualRef &&
              fatura.data_vencimento >= dataVencAtualRef,
            );

          if (isFutura) {
            const diasNoMes = new Date(anoF, mesF, 0).getDate();
            const diaFinal = Math.min(novoDiaVencimento, diasNoMes);
            const novaDataFutura = `${anoF}-${String(mesF).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
            const statusFuturo = novaDataFutura < hojeStr ? "vencido" : "pendente";

            const { error: errUpdFatura } = await supabase
              .from("mensalidades")
              .update({
                data_vencimento: novaDataFutura,
                status: statusFuturo,
                updated_at: new Date().toISOString(),
              })
              .eq("id", fatura.id);

            if (errUpdFatura) {
              await supabase
                .from("mensalidades")
                .update({
                  data_vencimento: novaDataFutura,
                  status: statusFuturo,
                })
                .eq("id", fatura.id);
            }

            try {
              const { error: errTrans } = await supabase
                .from("transacoes_financeiras" as any)
                .update({
                  data_vencimento: novaDataFutura,
                  updated_at: new Date().toISOString(),
                })
                .eq("mensalidade_id", fatura.id);

              if (errTrans) {
                await supabase
                  .from("transacoes_financeiras" as any)
                  .update({
                    data_vencimento: novaDataFutura,
                  })
                  .eq("mensalidade_id", fatura.id);
              }
            } catch {
              // Ignore
            }

            faturasAtualizadas++;
          }
        }
      }
    }

    const mensagemSucesso =
      escopo === "todas_futuras" && faturasAtualizadas > 1
        ? `Vencimento atualizado nesta cobrança e em ${faturasAtualizadas - 1} faturas futuras do cliente com sucesso!`
        : escopo === "todas_futuras"
          ? "Vencimento atualizado e cadastro do cliente sincronizado para as próximas faturas!"
          : "Vencimento desta cobrança atualizado com sucesso (faturas futuras mantidas).";

    return {
      success: true,
      message: mensagemSucesso,
      faturasAtualizadas,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Erro inesperado ao atualizar vencimento.",
      faturasAtualizadas: 0,
    };
  }
}

export function calcularResumoFinanceiro(lista: MensalidadeItem[]): ResumoFinanceiroMensalidades {
  let totalPrevisto = 0;
  let totalRecebido = 0;
  let totalPendente = 0;
  let totalVencido = 0;

  let qtdRecebido = 0;
  let qtdPendente = 0;
  let qtdVencido = 0;

  for (const m of lista) {
    const v = Number(m.valor || 0);
    totalPrevisto += v;

    if (m.status === "pago") {
      totalRecebido += v;
      qtdRecebido += 1;
    } else if (m.status === "vencido") {
      totalVencido += v;
      qtdVencido += 1;
    } else {
      totalPendente += v;
      qtdPendente += 1;
    }
  }

  return {
    totalPrevisto,
    totalRecebido,
    totalPendente,
    totalVencido,
    qtdTotal: lista.length,
    qtdRecebido,
    qtdPendente,
    qtdVencido,
  };
}

export interface StatusFinanceiroCliente {
  bloqueado: boolean; // Mantido para retrocompatibilidade (= bloqueioLogin)
  bloqueioLocalizacao: boolean;
  bloqueioLogin: boolean;
  diasAtraso: number;
  totalDevido: number;
  qtdFaturasVencidas: number;
  faturaVencidaMaisAntiga?: {
    id: string;
    mes: number;
    ano: number;
    valor: number;
    dataVencimento: string;
    diasAtraso: number;
  };
  avisoVencimentoProximo: boolean;
  faturaAVencer?: {
    id: string;
    mes: number;
    ano: number;
    valor: number;
    dataVencimento: string;
    diasParaVencer: number;
  };
  avisoNotificacaoDia1a4: boolean;
  statusBloqueioLocalizacaoManual: "automatico" | "bloqueado" | "liberado";
  statusBloqueioAcessoManual: "automatico" | "bloqueado" | "liberado";
  isMotorista: boolean;
  clienteId?: string | null;
  clienteStatus?: string | null;
}

export type SituacaoStatusFinanceiroCliente = "em_dia" | "atrasado" | "bloqueado";

export interface ResumoStatusFinanceiroCard {
  situacao: SituacaoStatusFinanceiroCliente;
  label: "Em dia" | "Atrasado" | "Bloqueado";
  descricao: string;
}

/**
 * Resolve o rótulo canônico do card "Status Financeiro" para a visão do Cliente
 * sem expor somatório futuro ("montante a pagar" de parcelas a vencer).
 */
export function resolverStatusFinanceiroCardCliente(params: {
  statusFinanceiro: StatusFinanceiroCliente | null;
  qtdVencido: number;
  clienteStatus?: string | null;
}): ResumoStatusFinanceiroCard {
  const { statusFinanceiro, qtdVencido, clienteStatus } = params;
  const statusResolvidoCliente = clienteStatus ?? statusFinanceiro?.clienteStatus ?? null;
  const totalVencidoQtd = Math.max(qtdVencido, statusFinanceiro?.qtdFaturasVencidas ?? 0);
  const diasAtraso = statusFinanceiro?.diasAtraso ?? 0;
  const bloqueado =
    Boolean(statusFinanceiro?.bloqueioLocalizacao) ||
    Boolean(statusFinanceiro?.bloqueioLogin) ||
    statusResolvidoCliente === "bloqueado";

  if (bloqueado) {
    const motivoManualOuCadastro =
      statusFinanceiro?.statusBloqueioLocalizacaoManual === "bloqueado" ||
      statusFinanceiro?.statusBloqueioAcessoManual === "bloqueado" ||
      statusResolvidoCliente === "bloqueado";

    return {
      situacao: "bloqueado",
      label: "Bloqueado",
      descricao: motivoManualOuCadastro
        ? "Bloqueio administrativo ativo"
        : `${diasAtraso > 0 ? `${diasAtraso} dia(s) de atraso · ` : ""}Regularize para liberar`,
    };
  }

  if (totalVencidoQtd > 0 || diasAtraso > 0) {
    return {
      situacao: "atrasado",
      label: "Atrasado",
      descricao:
        totalVencidoQtd === 1
          ? "1 fatura vencida em aberto"
          : `${totalVencidoQtd} faturas vencidas em aberto`,
    };
  }

  return {
    situacao: "em_dia",
    label: "Em dia",
    descricao: "Nenhuma fatura em atraso",
  };
}

/**
 * Dispara notificação diária automática de aviso de atraso para o cliente titular
 * (dias 1 a 4 de atraso), com recálculo legal de juros/multa e chave PIX.
 */
export async function dispararNotificacaoAutomaticaAtrasoCliente(
  clienteId: string,
  diasAtraso: number,
  fatura: { id: string; valor: number; dataVencimento: string },
): Promise<void> {
  if (typeof window === "undefined") return;
  const hojeStr = new Date().toISOString().split("T")[0];
  const chaveCache = `sigo_notif_atraso_${clienteId}_${hojeStr}`;

  try {
    if (localStorage.getItem(chaveCache)) {
      return; // Já enviado hoje
    }

    const encargos = calcularEncargosAtraso(fatura.valor, fatura.dataVencimento);
    const dataVencFormatada = fatura.dataVencimento.split("-").reverse().join("/");
    const valorAtualizadoFormatado = encargos.valorTotalAtualizado.toFixed(2).replace(".", ",");

    await enviarNotificacaoViaBd({
      destinatarioClienteId: clienteId,
      titulo: `Aviso de Vencimento — ${APP_NOME}`,
      mensagem: `Olá. Identificamos fatura vencida em ${dataVencFormatada} (${diasAtraso} dia(s) em atraso). Valor atualizado com encargos: R$ ${valorAtualizadoFormatado}. Regularize para manter todos os serviços de rastreamento ativos.`,
      tipo: "cobranca",
      url: "/faturas",
    });

    localStorage.setItem(chaveCache, "enviado");
  } catch (err) {
    console.warn("Falha ao registrar notificação automática diária de cobrança:", err);
  }
}

export const MESES_SIGLA = [
  "",
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

/**
 * Formata a competência no padrão oficial com sigla do mês em maiúsculo (ex: NOV/2026)
 */
export function formatarCompetenciaMensalidade(mes: number, ano: number): string {
  if (mes === 0) return "Taxa de Ativação";
  const sigla = MESES_SIGLA[mes] || String(mes).padStart(2, "0");
  return `${sigla}/${ano}`;
}

/**
 * Formata o número da parcela da mensalidade com zeros à esquerda (ex: 01/12, 02/12).
 * Retorna string vazia quando não aplicável (ex: Taxa de Ativação).
 */
export function formatarParcelaMensalidade(
  numeroParcela?: number | null,
  totalParcelas?: number | null,
): string {
  const num = Number(numeroParcela || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  const totalBruto = Number(totalParcelas || 0);
  const total = Math.max(Math.trunc(num), totalBruto > 0 ? Math.trunc(totalBruto) : 12);
  const padLen = Math.max(2, String(total).length);
  return `${String(Math.trunc(num)).padStart(padLen, "0")}/${String(total).padStart(padLen, "0")}`;
}

/**
 * Garante numeração cronológica (01/12, 02/12 ...) para qualquer lista de mensalidades
 * agrupadas por cliente, preservando os valores gravados em banco ou calculando de forma
 * determinística quando ainda não persistidos (ex: mes_referencia = 0 fica sem parcela).
 */
export function enriquecerNumeracaoParcelasMensalidades<
  T extends {
    id?: string;
    cliente_id?: string | null;
    mes_referencia: number;
    ano_referencia: number;
    data_vencimento?: string | null;
    created_at?: string | null;
    numero_parcela?: number | null;
    total_parcelas?: number | null;
  },
>(lista: T[]): T[] {
  if (!Array.isArray(lista) || lista.length === 0) {
    return [];
  }

  const porCliente = new Map<string, T[]>();
  for (const item of lista) {
    if (Number(item.mes_referencia || 0) <= 0) continue;
    const chaveCliente = String(item.cliente_id || "__single__");
    if (!porCliente.has(chaveCliente)) {
      porCliente.set(chaveCliente, []);
    }
    porCliente.get(chaveCliente)!.push(item);
  }

  const mapaNumeracao = new Map<T, { numero_parcela: number; total_parcelas: number }>();

  for (const [, itensCliente] of porCliente) {
    const ordenados = [...itensCliente].sort((a, b) => {
      if ((a.ano_referencia || 0) !== (b.ano_referencia || 0)) {
        return (a.ano_referencia || 0) - (b.ano_referencia || 0);
      }
      if ((a.mes_referencia || 0) !== (b.mes_referencia || 0)) {
        return (a.mes_referencia || 0) - (b.mes_referencia || 0);
      }
      const dvA = String(a.data_vencimento || "");
      const dvB = String(b.data_vencimento || "");
      if (dvA !== dvB) return dvA.localeCompare(dvB);
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    const totalPersistido = ordenados.find(
      (i) => typeof i.total_parcelas === "number" && i.total_parcelas > 0,
    )?.total_parcelas;
    const cicloPadrao = totalPersistido && totalPersistido > 0 ? totalPersistido : 12;

    ordenados.forEach((item, index) => {
      const totalItem =
        item.total_parcelas && item.total_parcelas > 0 ? item.total_parcelas : cicloPadrao;
      const numItem =
        item.numero_parcela && item.numero_parcela > 0
          ? item.numero_parcela
          : ordenados.length > cicloPadrao
            ? (index % cicloPadrao) + 1
            : index + 1;

      mapaNumeracao.set(item, {
        numero_parcela: numItem,
        total_parcelas: Math.max(numItem, totalItem),
      });
    });
  }

  return lista.map((item) => {
    if (Number(item.mes_referencia || 0) <= 0) {
      return {
        ...item,
        numero_parcela: null,
        total_parcelas: null,
      };
    }
    const calc = mapaNumeracao.get(item);
    return {
      ...item,
      numero_parcela: calc ? calc.numero_parcela : (item.numero_parcela ?? 1),
      total_parcelas: calc ? calc.total_parcelas : (item.total_parcelas ?? 12),
    };
  });
}

/**
 * Dispara lembrete preventivo oficial de mensalidade a vencer via WhatsApp
 * no formato padrão canônico da Central de Segurança GD Rastreamento.
 */
export async function dispararLembretePreventivoMensalidadeWhatsApp(
  cliente: {
    id: string;
    nome: string;
    telefone?: string | null;
  },
  fatura: {
    id: string;
    valor: number;
    dataVencimento: string;
    mesReferencia: number;
    anoReferencia: number;
    numeroParcela?: number | null;
    totalParcelas?: number | null;
    chavePix?: string;
  },
): Promise<{ sucesso: boolean; mensagem?: string; erro?: string }> {
  if (!cliente.telefone) {
    return { sucesso: false, erro: "Cliente sem telefone cadastrado." };
  }

  const telefoneNormalizado = normalizarTelefoneParaWhatsapp(cliente.telefone);
  if (!telefoneNormalizado) {
    return { sucesso: false, erro: "Telefone do cliente inválido para WhatsApp." };
  }

  const primeiroNome = cliente.nome.split(" ")[0] || "Cliente";
  const dataVencFormatada = fatura.dataVencimento.split("-").reverse().join("/");
  const valorFormatado = Number(fatura.valor || 0).toFixed(2);
  const competencia = formatarCompetenciaMensalidade(fatura.mesReferencia, fatura.anoReferencia);
  const parcelaFmt = formatarParcelaMensalidade(fatura.numeroParcela, fatura.totalParcelas);
  const sufixoParcela = parcelaFmt ? ` (Parcela ${parcelaFmt})` : "";
  const horarioAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const textoMensagem = [
    `🚨 *📅 Vencimento do Plano (${competencia}${parcelaFmt ? ` · ${parcelaFmt}` : ""}) — ${APP_NOME}*`,
    ``,
    `Olá, ${primeiroNome}. Sua fatura de ${competencia}${sufixoParcela} com vencimento em ${dataVencFormatada} no valor de R$ ${valorFormatado} já está disponível para pagamento via PIX.`,
    `🕒 Horário: ${horarioAtual}`,
    ``,
    `_${APP_NOME} — Segurança Privada e Rastreamento Tático_`,
  ].join("\n");

  try {
    const res = await enviarMensagemWhatsappOperador({
      telefone: telefoneNormalizado,
      mensagem: textoMensagem,
      clienteNome: cliente.nome,
      categoriaMensagem: "financeiro",
    });
    return {
      sucesso: res.sucesso,
      mensagem: "Lembrete de cobrança enviado com sucesso via WhatsApp.",
    };
  } catch (err: any) {
    return { sucesso: false, erro: err?.message || "Falha ao despachar WhatsApp." };
  }
}

/**
 * Consulta a adimplência e o status de bloqueio administrativo do cliente ou motorista.
 *
 * Régua Canônica de Inadimplência Hunter:
 * 1. Dias 1 a 4: Mensagem diária automática para o cliente informando valor atualizado e vencimento.
 * 2. Dia 5+: Bloqueio da visualização da localização dos rastreadores (modo privado para cliente e seus motoristas).
 * 3. Dia 7+: Bloqueio total de login do cliente e de seus motoristas.
 * 4. Controles manuais (Operador / ADM): status_bloqueio_localizacao e status_bloqueio_acesso ('automatico' | 'bloqueado' | 'liberado').
 * 5. Motoristas vinculados NUNCA recebem cobrança, dados financeiros ou notificações de débito.
 */
export async function verificarStatusFinanceiroCliente(
  userId: string,
  clienteIdInformado?: string | null,
  isMotorista = false,
): Promise<StatusFinanceiroCliente> {
  const statusPadrao: StatusFinanceiroCliente = {
    bloqueado: false,
    bloqueioLocalizacao: false,
    bloqueioLogin: false,
    diasAtraso: 0,
    totalDevido: 0,
    qtdFaturasVencidas: 0,
    avisoVencimentoProximo: false,
    avisoNotificacaoDia1a4: false,
    statusBloqueioLocalizacaoManual: "automatico",
    statusBloqueioAcessoManual: "automatico",
    isMotorista,
  };

  try {
    let resolvedClienteId: string | null = clienteIdInformado || null;

    // 1. Se for motorista e não tiver clienteId informado, consulta vínculo na tabela motoristas
    if (isMotorista && !resolvedClienteId) {
      const { data: mot } = await supabase
        .from("motoristas")
        .select("cliente_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (mot?.cliente_id) {
        resolvedClienteId = mot.cliente_id;
      }
    }

    // 2. Se for cliente e não tiver clienteId, consulta tabela clientes pelo user_id
    let clienteData: any = null;
    const buscarClienteComDefesa = async (campo: "user_id" | "id", valor: string) => {
      const res = await supabase
        .from("clientes")
        .select("id, status, status_bloqueio_localizacao, status_bloqueio_acesso")
        .eq(campo, valor)
        .maybeSingle();

      if (res.error && (res.error.code === "PGRST204" || res.error.code === "42703")) {
        const fallback = await supabase
          .from("clientes")
          .select("id, status")
          .eq(campo, valor)
          .maybeSingle();
        return fallback.data;
      }
      return res.data;
    };

    if (!resolvedClienteId && !isMotorista) {
      const cli = await buscarClienteComDefesa("user_id", userId);
      if (cli) {
        clienteData = cli;
        resolvedClienteId = cli.id;
      }
    } else if (resolvedClienteId) {
      const cli = await buscarClienteComDefesa("id", resolvedClienteId);
      if (cli) {
        clienteData = cli;
      }
    }

    if (!resolvedClienteId || !clienteData) {
      return statusPadrao;
    }

    // Se o cliente estiver aguardando instalação ou não tiver veículos ativos, não há cobrança nem bloqueios
    if (clienteData.status === "aguardando_instalacao") {
      return {
        ...statusPadrao,
        clienteId: resolvedClienteId,
        clienteStatus: clienteData.status || null,
      };
    }

    const { data: veicsDoCliente } = await supabase
      .from("veiculos")
      .select("id")
      .eq("cliente_id", resolvedClienteId)
      .eq("ativo", true)
      .limit(1);

    if (!veicsDoCliente || veicsDoCliente.length === 0) {
      return {
        ...statusPadrao,
        clienteId: resolvedClienteId,
        clienteStatus: clienteData.status || null,
      };
    }

    const statusLocManual: "automatico" | "bloqueado" | "liberado" =
      clienteData.status_bloqueio_localizacao === "bloqueado" ||
      clienteData.status_bloqueio_localizacao === "liberado"
        ? clienteData.status_bloqueio_localizacao
        : "automatico";

    const statusAcessoManual: "automatico" | "bloqueado" | "liberado" =
      clienteData.status_bloqueio_acesso === "bloqueado" ||
      clienteData.status_bloqueio_acesso === "liberado"
        ? clienteData.status_bloqueio_acesso
        : "automatico";

    // 3. Consulta faturas em aberto do cliente
    const { data: mensalidades, error: mensErr } = await supabase
      .from("mensalidades")
      .select("id, mes_referencia, ano_referencia, valor, data_vencimento, status")
      .eq("cliente_id", resolvedClienteId)
      .neq("status", "pago")
      .order("data_vencimento", { ascending: true });

    const hoje = new Date().toISOString().split("T")[0];
    const hojeMs = new Date(hoje).getTime();

    let totalDevido = 0;
    let qtdFaturasVencidas = 0;
    let maiorDiasAtraso = 0;
    let faturaVencidaMaisAntiga: StatusFinanceiroCliente["faturaVencidaMaisAntiga"] = undefined;
    let faturaAVencer: StatusFinanceiroCliente["faturaAVencer"] = undefined;
    let avisoVencimentoProximo = false;

    if (!mensErr && mensalidades && mensalidades.length > 0) {
      for (const m of mensalidades) {
        const v = Number(m.valor || 0);
        const dataVenc = m.data_vencimento;

        if (dataVenc < hoje) {
          totalDevido += v;
          qtdFaturasVencidas += 1;

          const vencMs = new Date(dataVenc).getTime();
          const dias = Math.max(1, Math.floor((hojeMs - vencMs) / (1000 * 60 * 60 * 24)));
          if (dias > maiorDiasAtraso) {
            maiorDiasAtraso = dias;
          }

          if (!faturaVencidaMaisAntiga) {
            faturaVencidaMaisAntiga = {
              id: m.id,
              mes: m.mes_referencia,
              ano: m.ano_referencia,
              valor: v,
              dataVencimento: dataVenc,
              diasAtraso: dias,
            };
          }
        } else if (!avisoVencimentoProximo) {
          const vencMs = new Date(dataVenc).getTime();
          const diffDias = Math.ceil((vencMs - hojeMs) / (1000 * 60 * 60 * 24));

          if (diffDias >= 0 && diffDias <= 5) {
            avisoVencimentoProximo = true;
            faturaAVencer = {
              id: m.id,
              mes: m.mes_referencia,
              ano: m.ano_referencia,
              valor: v,
              dataVencimento: dataVenc,
              diasParaVencer: diffDias,
            };
          }
        }
      }
    }

    // 4. Aplicação das Regras dos 3 Estágios de Inadimplência
    const avisoNotificacaoDia1a4 = maiorDiasAtraso >= 1 && maiorDiasAtraso <= 4;

    // Se for cliente e estiver no intervalo de 1 a 4 dias, dispara aviso automático diário
    if (!isMotorista && avisoNotificacaoDia1a4 && faturaVencidaMaisAntiga) {
      dispararNotificacaoAutomaticaAtrasoCliente(
        resolvedClienteId,
        maiorDiasAtraso,
        faturaVencidaMaisAntiga,
      ).catch(() => {});
    }

    // Bloqueio de Localização: manual 'bloqueado', ou 'automatico' com 5+ dias de atraso
    let bloqueioLocalizacao = false;
    if (statusLocManual === "bloqueado") {
      bloqueioLocalizacao = true;
    } else if (statusLocManual === "liberado") {
      bloqueioLocalizacao = false;
    } else {
      bloqueioLocalizacao = maiorDiasAtraso >= 5;
    }

    // Bloqueio de Login / Acesso: manual 'bloqueado', ou 'automatico' com 7+ dias de atraso
    let bloqueioLogin = false;
    if (statusAcessoManual === "bloqueado") {
      bloqueioLogin = true;
    } else if (statusAcessoManual === "liberado") {
      bloqueioLogin = false;
    } else {
      bloqueioLogin = maiorDiasAtraso >= 7;
    }

    // 5. REGRA MANDATÓRIA: Motorista NUNCA recebe valores financeiros, dívidas ou PIX
    if (isMotorista) {
      return {
        bloqueado: bloqueioLogin,
        bloqueioLocalizacao,
        bloqueioLogin,
        diasAtraso: 0,
        totalDevido: 0,
        qtdFaturasVencidas: 0,
        faturaVencidaMaisAntiga: undefined,
        avisoVencimentoProximo: false,
        avisoNotificacaoDia1a4: false,
        statusBloqueioLocalizacaoManual: statusLocManual,
        statusBloqueioAcessoManual: statusAcessoManual,
        isMotorista: true,
        clienteId: resolvedClienteId,
      };
    }

    return {
      bloqueado: bloqueioLogin,
      bloqueioLocalizacao,
      bloqueioLogin,
      diasAtraso: maiorDiasAtraso,
      totalDevido,
      qtdFaturasVencidas,
      faturaVencidaMaisAntiga,
      avisoVencimentoProximo,
      faturaAVencer,
      avisoNotificacaoDia1a4,
      statusBloqueioLocalizacaoManual: statusLocManual,
      statusBloqueioAcessoManual: statusAcessoManual,
      isMotorista: false,
      clienteId: resolvedClienteId,
      clienteStatus: clienteData.status || null,
    };
  } catch (err) {
    console.error("Erro ao verificar status financeiro:", err);
    return statusPadrao;
  }
}
