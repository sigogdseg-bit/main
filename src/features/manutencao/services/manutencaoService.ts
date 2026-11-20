import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  isModoDegustacao,
  obterVeiculosManutencaoDegustacaoMaster,
  obterItensManutencaoDegustacaoMaster,
  obterAgendamentosManutencaoDegustacaoMaster,
  obterDespesasManutencaoDegustacaoMaster,
} from "@/features/demonstracao/services/degustacaoMasterService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { uploadNF, notificarUploadNF } from "@/features/motoristas/services/nfStorageService";
import { salvarSugestaoLocal } from "./sugestoesDespesasService";
import type {
  PlanoManutencaoItem,
  AgendamentoManutencao,
  NovoAgendamentoPayload,
  ClienteManutencaoResumo,
  VeiculoManutencaoResumo,
  SalvarItemManutencaoPayload,
  AlertaWhatsAppInfo,
  HistoricoManutencaoGasto,
  ConcluirManutencaoPayload,
  LancarGastoVeiculoPayload,
} from "../types";

/**
 * Carrega a lista de clientes para a etapa de seleção da Manutenção Preventiva.
 * Apenas acessível por administradores e operadores.
 * Prioriza a rota segura de backend (/api/clientes) com Service Role para imunidade total contra erro 42P17 de RLS.
 */
export async function carregarClientesParaManutencao(): Promise<ClienteManutencaoResumo[]> {
  try {
    // 1. Tenta carregar via rota segura de backend (/api/clientes) com Service Role
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token) {
        const res = await fetch("/api/clientes", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.clientes)) {
            return json.clientes.map((c: any) => ({
              id: c.id,
              nome_razao_social: c.nome_razao_social,
              documento: c.documento || null,
              telefone: c.telefone || null,
              plano: c.plano || "basico",
              total_veiculos: Array.isArray(c.veiculos) ? c.veiculos.length : 0,
            }));
          }
        }
      }
    } catch {
      /* fallback */
    }

    // 2. Fallback direto via Supabase SDK
    const { data, error } = await supabase
      .from("clientes")
      .select(
        `
        id,
        nome_razao_social,
        documento,
        telefone,
        plano,
        veiculos (
          id
        )
      `,
      )
      .order("nome_razao_social", { ascending: true });

    if (error || !data) return [];

    return data.map((c: any) => ({
      id: c.id,
      nome_razao_social: c.nome_razao_social,
      documento: c.documento || null,
      telefone: c.telefone || null,
      plano: c.plano || "basico",
      total_veiculos: Array.isArray(c.veiculos) ? c.veiculos.length : 0,
    }));
  } catch (err) {
    console.error("Erro ao carregar clientes para manutencao:", err);
    return [];
  }
}

/**
 * Carrega os veículos de um cliente com cálculo do resumo de alertas preventivos.
 * Ultra-resiliente a variações de schema e compatível com RLS de clientes.
 */
export async function carregarVeiculosDoCliente(
  clienteId?: string,
): Promise<VeiculoManutencaoResumo[]> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return obterVeiculosManutencaoDegustacaoMaster();
    }

    let veiculosData: any[] = [];

    // 1. Canal primário: Rota segura de backend com Service Role
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token) {
        const urlApi = clienteId
          ? `/api/veiculos?clienteId=${encodeURIComponent(clienteId)}`
          : `/api/veiculos`;
        const res = await fetch(urlApi, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.veiculos)) {
            veiculosData = json.veiculos.filter((v: any) => v.ativo !== false);
          }
        }
      }
    } catch {
      /* fallback */
    }

    // 2. Fallback direto via Supabase SDK caso a rota não responda
    if (veiculosData.length === 0) {
      let query = supabase
        .from("veiculos")
        .select(
          `
          id,
          cliente_id,
          placa,
          marca_modelo,
          tipo_veiculo,
          tipo_medicao,
          odometro_km,
          horimetro_horas,
          ano,
          cor,
          ativo
        `,
        )
        .eq("ativo", true)
        .not("placa", "in", '("HTR4G16","HUN1T26")')
        .order("placa", { ascending: true });

      if (clienteId) {
        query = query.eq("cliente_id", clienteId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("Erro ao buscar veiculos com filtro:", error);
      } else {
        veiculosData = (data || []).filter((v: any) => {
          if (clienteId && v.cliente_id && v.cliente_id !== clienteId) {
            return false;
          }
          return true;
        });
      }
    }

    if (veiculosData.length === 0) return [];

    // Busca opcional dos planos preventivos para contabilizar alertas de forma isolada
    const veiculoIds = veiculosData.map((v: any) => v.id);
    const planosPorVeiculo: Record<string, any[]> = {};

    try {
      const { data: planosData } = await supabase
        .from("planos_manutencao_preventiva" as any)
        .select("id, veiculo_id, status, proximo_km_alvo, aviso_antecipado_km")
        .in("veiculo_id", veiculoIds);

      if (planosData && Array.isArray(planosData)) {
        planosData.forEach((p: any) => {
          if (!planosPorVeiculo[p.veiculo_id]) {
            planosPorVeiculo[p.veiculo_id] = [];
          }
          planosPorVeiculo[p.veiculo_id].push(p);
        });
      }
    } catch (err) {
      console.warn("Nao foi possivel carregar planos preventivos vinculados:", err);
    }

    return veiculosData.map((v: any) => {
      const odometro = Math.round(v.odometro_km || 0);
      const isHorimetro =
        v.tipo_medicao === "horimetro" ||
        v.tipo_veiculo === "maquina" ||
        v.tipo_veiculo === "trator" ||
        v.tipo_veiculo === "equipamento";
      const horimetro = Number(v.horimetro_horas || 0);
      const metricaAtual = isHorimetro ? Math.round(horimetro) : odometro;
      const planos = planosPorVeiculo[v.id] || [];

      let itensAlerta = 0;
      let itensVencidos = 0;

      planos.forEach((p: any) => {
        const restante = Math.round(p.proximo_km_alvo - metricaAtual);
        const aviso = p.aviso_antecipado_km || (isHorimetro ? 25 : 500);
        if (restante <= 0) {
          itensVencidos++;
        } else if (restante <= aviso) {
          itensAlerta++;
        }
      });

      return {
        id: v.id,
        cliente_id: v.cliente_id,
        placa: v.placa,
        marca_modelo: v.marca_modelo,
        tipo_veiculo: v.tipo_veiculo || "carro",
        tipo_medicao: v.tipo_medicao || (isHorimetro ? "horimetro" : "km"),
        odometro_km: odometro,
        horimetro: horimetro,
        ano_fabricacao: v.ano || null,
        cor: v.cor || null,
        itens_alerta_count: itensAlerta,
        itens_vencidos_count: itensVencidos,
      };
    });
  } catch (err) {
    console.error("Erro ao carregar veiculos para manutencao:", err);
    return [];
  }
}

/**
 * Inicializa os itens essenciais de manutenção preventiva caso o veículo ainda não os possua.
 */
export async function inicializarItensPadraoVeiculo(
  veiculoId: string,
  odometroAtual: number,
): Promise<boolean> {
  try {
    const itensPadrao = [
      {
        veiculo_id: veiculoId,
        item_manutencao: "Troca de Óleo e Filtro",
        intervalo_km: 5000,
        ultimo_km_realizado: odometroAtual,
        proximo_km_alvo: odometroAtual + 5000,
        aviso_antecipado_km: 500,
        status: "em_dia",
      },
      {
        veiculo_id: veiculoId,
        item_manutencao: "Pastilhas de Freio",
        intervalo_km: 15000,
        ultimo_km_realizado: odometroAtual,
        proximo_km_alvo: odometroAtual + 15000,
        aviso_antecipado_km: 1000,
        status: "em_dia",
      },
      {
        veiculo_id: veiculoId,
        item_manutencao: "Pneus e Balanceamento",
        intervalo_km: 10000,
        ultimo_km_realizado: odometroAtual,
        proximo_km_alvo: odometroAtual + 10000,
        aviso_antecipado_km: 1000,
        status: "em_dia",
      },
      {
        veiculo_id: veiculoId,
        item_manutencao: "Revisão Geral e Suspensão",
        intervalo_km: 20000,
        ultimo_km_realizado: odometroAtual,
        proximo_km_alvo: odometroAtual + 20000,
        aviso_antecipado_km: 1500,
        status: "em_dia",
      },
    ];

    const { error } = await supabase.from("planos_manutencao_preventiva").insert(itensPadrao);
    return !error;
  } catch (err) {
    console.error("Erro ao inicializar itens padrao de manutencao:", err);
    return false;
  }
}

/**
 * Carrega todos os itens de manutenção vinculados a um veículo.
 */
export async function carregarItensManutencao(veiculoId?: string): Promise<PlanoManutencaoItem[]> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return obterItensManutencaoDegustacaoMaster(veiculoId);
    }

    let query = supabase
      .from("planos_manutencao_preventiva")
      .select(
        `
        id,
        veiculo_id,
        item_manutencao,
        intervalo_km,
        intervalo_meses,
        ultimo_km_realizado,
        ultima_data_realizada,
        proximo_km_alvo,
        proxima_data_alvo,
        aviso_antecipado_km,
        status,
        created_at,
        veiculos (
          cliente_id,
          placa,
          marca_modelo,
          tipo_veiculo,
          tipo_medicao,
          odometro_km,
          horimetro_horas,
          clientes (
            nome_razao_social,
            telefone
          )
        )
      `,
      )
      .order("proximo_km_alvo", { ascending: true });

    if (veiculoId) {
      query = query.eq("veiculo_id", veiculoId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((item: any) => {
      const isHorimetro =
        item.veiculos?.tipo_medicao === "horimetro" ||
        item.veiculos?.tipo_veiculo === "maquina" ||
        item.veiculos?.tipo_veiculo === "trator" ||
        item.veiculos?.tipo_veiculo === "equipamento";
      const odometroAtual = Math.round(item.veiculos?.odometro_km || 0);
      const horimetroAtual = Number(item.veiculos?.horimetro_horas || 0);
      const metricaAtual = isHorimetro ? Math.round(horimetroAtual) : odometroAtual;
      const metricaRestante = Math.round(item.proximo_km_alvo - metricaAtual);
      const avisoAntecipado = item.aviso_antecipado_km || (isHorimetro ? 25 : 500);

      let statusCalculado: PlanoManutencaoItem["status"] = "em_dia";
      if (metricaRestante <= 0) {
        statusCalculado = "vencida";
      } else if (metricaRestante <= avisoAntecipado) {
        statusCalculado = "proxima";
      }

      return {
        id: item.id,
        veiculo_id: item.veiculo_id,
        item_manutencao: item.item_manutencao,
        intervalo_km: item.intervalo_km,
        intervalo_meses: item.intervalo_meses,
        ultimo_km_realizado: item.ultimo_km_realizado,
        ultima_data_realizada: item.ultima_data_realizada,
        proximo_km_alvo: item.proximo_km_alvo,
        proxima_data_alvo: item.proxima_data_alvo,
        aviso_antecipado_km: avisoAntecipado,
        status: statusCalculado,
        created_at: item.created_at,
        cliente_id: item.veiculos?.cliente_id,
        placa: item.veiculos?.placa,
        marca_modelo: item.veiculos?.marca_modelo,
        tipo_veiculo: item.veiculos?.tipo_veiculo || "carro",
        tipo_medicao: item.veiculos?.tipo_medicao || (isHorimetro ? "horimetro" : "km"),
        odometro_atual: odometroAtual,
        horimetro_atual: horimetroAtual,
        km_restante: metricaRestante,
      };
    });
  } catch (err) {
    console.error("Erro ao carregar manutenções preventivas:", err);
    return [];
  }
}

/**
 * Cria ou atualiza um item de manutenção preventiva de um veículo.
 */
export async function salvarItemManutencao(
  payload: SalvarItemManutencaoPayload,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    // Tenta via backend seguro autorizado
    if (token && typeof window !== "undefined") {
      try {
        const response = await fetch("/api/manutencao/item", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const json = await response.json();
          return {
            success: true,
            message: json.message || "Item de manutenção salvo com sucesso!",
          };
        }
      } catch (e) {
        console.warn("Falha na chamada da API backend, tentando fallback direto:", e);
      }
    }

    const proximoKmAlvo = payload.ultimo_km_realizado + payload.intervalo_km;

    if (payload.id) {
      const { error } = await supabase
        .from("planos_manutencao_preventiva")
        .update({
          item_manutencao: payload.item_manutencao,
          intervalo_km: payload.intervalo_km,
          aviso_antecipado_km: payload.aviso_antecipado_km,
          ultimo_km_realizado: payload.ultimo_km_realizado,
          proximo_km_alvo: proximoKmAlvo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);

      if (error) throw error;
      return { success: true, message: "Item de manutenção atualizado com sucesso!" };
    } else {
      const { error } = await supabase.from("planos_manutencao_preventiva").insert({
        veiculo_id: payload.veiculo_id,
        item_manutencao: payload.item_manutencao,
        intervalo_km: payload.intervalo_km,
        aviso_antecipado_km: payload.aviso_antecipado_km,
        ultimo_km_realizado: payload.ultimo_km_realizado,
        proximo_km_alvo: proximoKmAlvo,
        status: "em_dia",
      });

      if (error) throw error;
      return { success: true, message: "Novo item de manutenção cadastrado com sucesso!" };
    }
  } catch (err: any) {
    console.error("Erro ao salvar item de manutencao:", err);
    return { success: false, message: err?.message || "Falha ao salvar item de manutenção." };
  }
}

/**
 * Exclui um item de manutenção preventiva.
 */
export async function excluirItemManutencao(
  itemId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    // Tenta via backend seguro autorizado
    if (token && typeof window !== "undefined") {
      try {
        const response = await fetch(`/api/manutencao/item?id=${encodeURIComponent(itemId)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const json = await response.json();
          return {
            success: true,
            message: json.message || "Item de manutenção removido com sucesso!",
          };
        }
      } catch (e) {
        console.warn("Falha na chamada da API backend, tentando fallback direto:", e);
      }
    }

    const { error } = await supabase.from("planos_manutencao_preventiva").delete().eq("id", itemId);

    if (error) throw error;
    return { success: true, message: "Item de manutenção removido com sucesso!" };
  } catch (err: any) {
    console.error("Erro ao excluir item de manutencao:", err);
    return { success: false, message: err?.message || "Falha ao remover item." };
  }
}

/**
 * Registra a realização de uma revisão concluída e recalcula a próxima meta de km.
 */
export async function concluirItemManutencao(
  itemId: string,
  kmRealizado: number,
  intervaloKm: number,
): Promise<{ success: boolean; message: string }> {
  try {
    const proximoKmAlvo = kmRealizado + intervaloKm;
    const { error } = await supabase
      .from("planos_manutencao_preventiva")
      .update({
        ultimo_km_realizado: kmRealizado,
        ultima_data_realizada: new Date().toISOString().split("T")[0],
        proximo_km_alvo: proximoKmAlvo,
        status: "em_dia",
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    if (error) throw error;
    return {
      success: true,
      message: `Manutenção concluída! Próxima revisão definida para ${proximoKmAlvo.toLocaleString()} km.`,
    };
  } catch (err: any) {
    console.error("Erro ao concluir manutenção:", err);
    return {
      success: false,
      message: err?.message || "Falha ao registrar conclusão de manutenção.",
    };
  }
}

/**
 * Carrega os agendamentos de manutenção preventiva (com filtros opcionais por veículo ou cliente).
 */
export async function carregarAgendamentos(
  veiculoId?: string,
  clienteId?: string,
): Promise<AgendamentoManutencao[]> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return obterAgendamentosManutencaoDegustacaoMaster(veiculoId);
    }

    let query = supabase
      .from("agendamentos_manutencao")
      .select(
        `
        id,
        cliente_id,
        veiculo_id,
        item_manutencao,
        data_sugerida,
        turno,
        oficina_parceira,
        observacoes,
        status,
        created_at,
        veiculos (
          placa
        ),
        clientes (
          nome_razao_social
        )
      `,
      )
      .order("data_sugerida", { ascending: true });

    if (veiculoId) {
      query = query.eq("veiculo_id", veiculoId);
    }
    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((a: any) => ({
      id: a.id,
      cliente_id: a.cliente_id,
      veiculo_id: a.veiculo_id,
      item_manutencao: a.item_manutencao,
      data_sugerida: a.data_sugerida,
      turno: a.turno,
      oficina_parceira: a.oficina_parceira,
      observacoes: a.observacoes,
      status: a.status,
      created_at: a.created_at,
      placa: a.veiculos?.placa,
      cliente_nome: a.clientes?.nome_razao_social,
    }));
  } catch (err) {
    console.error("Erro ao carregar agendamentos:", err);
    return [];
  }
}

export async function solicitarAgendamento(payload: NovoAgendamentoPayload): Promise<boolean> {
  try {
    const { error } = await supabase.from("agendamentos_manutencao").insert({
      cliente_id: payload.cliente_id,
      veiculo_id: payload.veiculo_id,
      item_manutencao: payload.item_manutencao,
      data_sugerida: payload.data_sugerida,
      turno: payload.turno,
      oficina_parceira: payload.oficina_parceira || null,
      observacoes: payload.observacoes || null,
      status: "solicitado",
    });

    if (error) return false;

    // Dispara confirmação imediata via WhatsApp para o cliente
    try {
      const { data: cli } = await supabase
        .from("clientes")
        .select("nome_razao_social, telefone")
        .eq("id", payload.cliente_id)
        .maybeSingle();

      const { data: vei } = await supabase
        .from("veiculos")
        .select("placa, marca_modelo, odometro_km")
        .eq("id", payload.veiculo_id)
        .maybeSingle();

      enviarNotificacaoViaBd({
        destinatarioClienteId: payload.cliente_id,
        titulo: `🔧 Manutenção Agendada — ${vei?.placa || "Veículo"}`,
        mensagem: `Agendamento de ${payload.item_manutencao} confirmado para ${payload.data_sugerida.split("-").reverse().join("/")} (${payload.turno === "manha" ? "Manhã" : "Tarde"}).${payload.oficina_parceira ? ` Oficina: ${payload.oficina_parceira}.` : ""}`,
        tipo: "manutencao",
        url: "/manutencao",
        placa: vei?.placa,
      }).catch(() => {});
    } catch (e) {
      console.warn("Falha no disparo de notificação de agendamento:", e);
    }

    return true;
  } catch (err) {
    console.error("Erro ao solicitar agendamento:", err);
    return false;
  }
}

export async function atualizarStatusAgendamento(
  agendamentoId: string,
  novoStatus: AgendamentoManutencao["status"],
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: agendamento } = await supabase
      .from("agendamentos_manutencao")
      .select(
        "*, clientes(nome_razao_social, telefone), veiculos(placa, marca_modelo, odometro_km)",
      )
      .eq("id", agendamentoId)
      .maybeSingle();

    const { error } = await supabase
      .from("agendamentos_manutencao")
      .update({
        status: novoStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agendamentoId);

    if (error) throw error;

    // Se o status foi atualizado para confirmado ou concluído, envia notificação imediata
    if (agendamento && (novoStatus === "confirmado" || novoStatus === "concluido")) {
      const vei = agendamento.veiculos as any;
      const statusTexto =
        novoStatus === "confirmado" ? "Confirmado no Prazo" : "Concluído com Sucesso";

      enviarNotificacaoViaBd({
        destinatarioClienteId: agendamento.cliente_id,
        titulo: `🔧 Manutenção ${statusTexto} — ${vei?.placa || "Veículo"}`,
        mensagem: `O agendamento de ${agendamento.item_manutencao} foi ${statusTexto.toLowerCase()}.${agendamento.observacoes ? ` Detalhes: ${agendamento.observacoes}` : ""}`,
        tipo: "manutencao",
        url: "/manutencao",
        placa: vei?.placa,
      }).catch(() => {});
    }

    return { success: true, message: `Status do agendamento atualizado para ${novoStatus}.` };
  } catch (err: any) {
    console.error("Erro ao atualizar agendamento:", err);
    return { success: false, message: err?.message || "Falha ao atualizar agendamento." };
  }
}

/**
 * Normaliza e formata o telefone para o padrão internacional E.164 (DDI Brasil 55)
 */
export function formatarTelefoneWhatsApp(telefone?: string | null): string {
  if (!telefone) return "";
  const apenasNumeros = telefone.replace(/\D/g, "");
  if (!apenasNumeros) return "";
  if (
    apenasNumeros.startsWith("55") &&
    (apenasNumeros.length === 12 || apenasNumeros.length === 13)
  ) {
    return apenasNumeros;
  }
  if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
    return `55${apenasNumeros}`;
  }
  return apenasNumeros;
}

/**
 * Gera mensagem formal e amigável de notificação de revisão preventiva para o cliente
 */
export function gerarMensagemWhatsAppManutencao(info: AlertaWhatsAppInfo): string {
  const primeiroNome = info.clienteNome ? info.clienteNome.split(" ")[0] : "Cliente";
  const situacao =
    info.status === "vencida"
      ? `está com a revisão preventiva de *${info.itemManutencao}* VENCIDA (meta de ${info.proximoKmAlvo.toLocaleString("pt-BR")} km atingida)`
      : `está próximo da revisão preventiva de *${info.itemManutencao}* (meta de ${info.proximoKmAlvo.toLocaleString("pt-BR")} km - faltam apenas ${Math.max(0, info.kmRestante).toLocaleString("pt-BR")} km)`;

  return (
    `Olá, ${primeiroNome}! Aqui é da Central GD Rastreamento de Segurança e Telemetria Veicular.\n\n` +
    `Identificamos em nosso sistema que seu veículo *${info.marcaModelo}* (Placa: *${info.placa}*) atingiu o odômetro de *${info.odometroAtual.toLocaleString("pt-BR")} km* e ${situacao}.\n\n` +
    `Podemos agendar a sua revisão preventiva para garantir o perfeito funcionamento e a conservação do seu veículo?\n\n` +
    `Ficamos à disposição para reservar o melhor dia e horário!`
  );
}

/**
 * Gera link direto wa.me para abertura imediata do WhatsApp com a mensagem pré-carregada
 */
export function gerarLinkWhatsAppManutencao(info: AlertaWhatsAppInfo): string | null {
  const tel = formatarTelefoneWhatsApp(info.telefone);
  if (!tel) return null;
  const mensagem = gerarMensagemWhatsAppManutencao(info);
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`;
}

// ---------------------------------------------------------------------------
// GESTÃO DE DESPESAS, MANUTENÇÕES E FORMAS DE PAGAMENTO DO VEÍCULO
// ---------------------------------------------------------------------------

/**
 * Mapeia registro de motorista_despesas para o modelo de Histórico de Gastos do Veículo
 */
function mapearDespesaParaHistorico(r: any): HistoricoManutencaoGasto {
  const obs = r.observacoes || "";
  const matchPag = obs.match(/Pagamento:\s*([A-Za-z0-9_À-ú\s]+?)(?:\s*\||$)/i);
  const matchOfic = obs.match(/Oficina:\s*([A-Za-z0-9_À-ú\s]+?)(?:\s*\||$)/i);

  return {
    id: r.id,
    veiculo_id: r.veiculo_id,
    cliente_id: r.cliente_id,
    motorista_id: r.motorista_id || null,
    motorista_nome: r.motoristas?.nome || "Gestor / Cliente",
    veiculo_placa: r.veiculos?.placa || undefined,
    data_despesa: r.data_despesa,
    categoria: r.categoria || "manutencao",
    descricao: r.descricao || "Manutenção do Veículo",
    valor: Number(r.valor) || 0,
    km_atual: r.km_atual ? Number(r.km_atual) : null,
    odometro_km: r.km_atual ? Number(r.km_atual) : null,
    forma_pagamento: r.forma_pagamento || (matchPag ? matchPag[1].trim().toLowerCase() : "pix"),
    oficina_prestador: r.oficina_prestador || (matchOfic ? matchOfic[1].trim() : null),
    plano_manutencao_id: r.plano_manutencao_id || null,
    tipo_despesa: r.tipo_despesa || "manutencao",
    nf_numero: r.nf_numero || null,
    nf_foto_url: r.nf_foto_url || null,
    comprovante_url: r.nf_foto_url || null,
    nf_upload_em: r.nf_upload_em || null,
    nf_baixado: !!r.nf_baixado,
    nf_baixado_em: r.nf_baixado_em || null,
    nf_expirado: !!r.nf_expirado,
    observacoes: r.observacoes || null,
    created_at: r.created_at,
  };
}

/**
 * Obtém ou resolve um motorista id para manter integridade referencial com a tabela
 */
async function resolverMotoristaParaLancamento(clienteId: string): Promise<string | null> {
  const { data: motCli } = await supabase
    .from("motoristas")
    .select("id")
    .eq("cliente_id", clienteId)
    .limit(1)
    .maybeSingle();

  if (motCli?.id) return motCli.id;

  const { data: qualquer } = await supabase.from("motoristas").select("id").limit(1).maybeSingle();
  return qualquer?.id || null;
}

/**
 * Conclui a revisão preventiva reiniciando o ciclo de odômetro E registra o gasto financeiro,
 * forma de pagamento e nota fiscal para auditoria do cliente / adm.
 */
export async function concluirManutencaoComGasto(
  payload: ConcluirManutencaoPayload,
): Promise<{ success: boolean; message: string; despesaId?: string }> {
  try {
    // 1. Atualizar o odômetro e reiniciar o ciclo preventivo
    const resCiclo = await concluirItemManutencao(
      payload.itemId,
      payload.odometroKm,
      payload.intervaloKm,
    );
    if (!resCiclo.success) {
      return resCiclo;
    }

    // 2. Se não houver valor financeiro nem arquivo NF, conclui somente o ciclo de odômetro
    if (payload.valorTotal <= 0 && !payload.nfFile && !payload.nfNumero) {
      return { success: true, message: "Revisão concluída com sucesso no odômetro!" };
    }

    // 3. Montar observações estruturadas
    const tagPagamento = payload.formaPagamento
      ? `Pagamento: ${payload.formaPagamento.toUpperCase()}`
      : "";
    const tagOficina = payload.oficina ? `Oficina: ${payload.oficina}` : "";
    const obsPartes = [tagPagamento, tagOficina, payload.observacoes || ""]
      .filter(Boolean)
      .join(" | ");

    const motoristaId =
      payload.motoristaId || (await resolverMotoristaParaLancamento(payload.clienteId));

    // 4. Inserir em motorista_despesas com compatibilidade defensiva
    const nfFormatada = payload.nfNumero?.trim() ? payload.nfNumero.trim().toUpperCase() : null;

    if (nfFormatada && payload.veiculoId) {
      const { data: existente } = await supabase
        .from("motorista_despesas")
        .select("id")
        .eq("veiculo_id", payload.veiculoId)
        .ilike("nf_numero", nfFormatada)
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        throw new Error(
          `A Nota Fiscal nº ${nfFormatada} já foi registrada anteriormente para este veículo. Não é permitido envio duplicado.`,
        );
      }
    }

    const payloadDespesa: Record<string, any> = {
      cliente_id: payload.clienteId,
      veiculo_id: payload.veiculoId,
      data_despesa: payload.dataRealizacao,
      categoria: "manutencao",
      descricao: `Revisão: ${payload.itemNome}`,
      valor: Number(payload.valorTotal) || 0,
      km_atual: Number(payload.odometroKm) || null,
      nf_numero: nfFormatada,
      observacoes: obsPartes || null,
    };

    if (motoristaId) {
      payloadDespesa.motorista_id = motoristaId;
    }

    // Tentar com as colunas novas de forma_pagamento, oficina_prestador, plano_manutencao_id
    let despesaId: string | null = null;
    const { data: insData, error: insErr } = await supabase
      .from("motorista_despesas")
      .insert({
        ...payloadDespesa,
        forma_pagamento: payload.formaPagamento || "pix",
        oficina_prestador: payload.oficina || null,
        plano_manutencao_id: payload.itemId,
        tipo_despesa: "manutencao_preventiva",
      })
      .select("id")
      .single();

    if (insErr) {
      if (insErr.code === "23505" || insErr.message?.includes("idx_despesas_unico")) {
        throw new Error(
          "Esta despesa já foi registrada no sistema (Nota Fiscal ou lançamento duplicado).",
        );
      }

      // Fallback sem as colunas caso o PostgREST ainda não tenha recarregado o schema
      const { data: fbData, error: fbErr } = await supabase
        .from("motorista_despesas")
        .insert(payloadDespesa)
        .select("id")
        .single();

      if (fbErr) {
        if (fbErr.code === "23505" || fbErr.message?.includes("idx_despesas_unico")) {
          throw new Error(
            "Esta despesa já foi registrada no sistema (Nota Fiscal ou lançamento duplicado).",
          );
        }
        console.warn("Aviso ao registrar despesa de manutenção:", fbErr);
      } else if (fbData) {
        despesaId = fbData.id;
      }
    } else if (insData) {
      despesaId = insData.id;
    }

    // 5. Upload de NF se arquivo fornecido
    if (despesaId && payload.nfFile) {
      try {
        const { path, uploadEm } = await uploadNF(
          payload.clienteId,
          motoristaId || payload.clienteId,
          despesaId,
          "despesa",
          payload.nfFile,
        );

        // Notificação de Momento 0 para download da NF pelo cliente com anexo no WhatsApp (Item do Plano de Revisão)
        await notificarUploadNF(payload.clienteId, payload.veiculoId, despesaId, "despesa", {
          descricao: payload.itemNome,
          valorTotal: Number(payload.valorTotal) || 0,
          arquivoNf: payload.nfFile,
          pathNf: path,
        });
      } catch (errNf) {
        console.warn("Aviso ao enviar arquivo da NF:", errNf);
      }
    }

    if (payload.itemNome) {
      salvarSugestaoLocal(payload.itemNome, "manutencao", payload.clienteId);
    }

    return {
      success: true,
      message: "Revisão concluída e comprovante/gasto financeiro registrado com sucesso!",
      despesaId: despesaId || undefined,
    };
  } catch (err: any) {
    console.error("Erro ao concluir manutenção com gasto:", err);
    return { success: false, message: err?.message || "Erro ao registrar conclusão da revisão." };
  }
}

/**
 * Lança qualquer gasto avulso no veículo (óleo, palhetas, limpeza, pneus, etc.)
 */
export async function lancarGastoAvulsoVeiculo(
  payload: LancarGastoVeiculoPayload,
): Promise<{ success: boolean; message: string; despesaId?: string }> {
  try {
    const motoristaId =
      payload.motoristaId || (await resolverMotoristaParaLancamento(payload.clienteId));

    const tagPagamento = payload.formaPagamento
      ? `Pagamento: ${payload.formaPagamento.toUpperCase()}`
      : "";
    const tagOficina = payload.oficina ? `Oficina: ${payload.oficina}` : "";
    const obsPartes = [tagPagamento, tagOficina, payload.observacoes || ""]
      .filter(Boolean)
      .join(" | ");

    const nfFormatada = payload.nfNumero?.trim() ? payload.nfNumero.trim().toUpperCase() : null;

    if (nfFormatada && payload.veiculoId) {
      const { data: existente } = await supabase
        .from("motorista_despesas")
        .select("id")
        .eq("veiculo_id", payload.veiculoId)
        .ilike("nf_numero", nfFormatada)
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        throw new Error(
          `A Nota Fiscal nº ${nfFormatada} já foi registrada anteriormente para este veículo. Não é permitido envio duplicado.`,
        );
      }
    } else if (!nfFormatada && payload.veiculoId) {
      const dataDespesaAlvo =
        payload.dataRealizacao || payload.dataDespesa || new Date().toISOString().split("T")[0];
      const { data: existente } = await supabase
        .from("motorista_despesas")
        .select("id")
        .eq("veiculo_id", payload.veiculoId)
        .eq("data_despesa", dataDespesaAlvo)
        .eq("valor", Number(payload.valorTotal) || 0)
        .ilike("descricao", payload.descricao.trim())
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        throw new Error(
          `Já existe uma despesa idêntica registrada para este veículo com o mesmo valor e descrição nesta data.`,
        );
      }
    }

    const payloadDespesa: Record<string, any> = {
      cliente_id: payload.clienteId,
      veiculo_id: payload.veiculoId,
      data_despesa:
        payload.dataRealizacao || payload.dataDespesa || new Date().toISOString().split("T")[0],
      categoria: payload.categoria || "manutencao",
      descricao: payload.descricao.trim(),
      valor: Number(payload.valorTotal) || 0,
      km_atual: payload.odometroKm ? Number(payload.odometroKm) : null,
      nf_numero: nfFormatada,
      observacoes: obsPartes || null,
    };

    if (motoristaId) {
      payloadDespesa.motorista_id = motoristaId;
    }

    let despesaId: string | null = null;
    const { data: insData, error: insErr } = await supabase
      .from("motorista_despesas")
      .insert({
        ...payloadDespesa,
        forma_pagamento: payload.formaPagamento || "pix",
        oficina_prestador: payload.oficina || null,
        plano_manutencao_id: payload.planoManutencaoId || null,
        tipo_despesa: "avulso",
      })
      .select("id")
      .single();

    if (insErr) {
      if (insErr.code === "23505" || insErr.message?.includes("idx_despesas_unico")) {
        throw new Error(
          "Esta despesa já foi registrada no sistema (Nota Fiscal ou lançamento duplicado).",
        );
      }

      const { data: fbData, error: fbErr } = await supabase
        .from("motorista_despesas")
        .insert(payloadDespesa)
        .select("id")
        .single();

      if (fbErr) {
        if (fbErr.code === "23505" || fbErr.message?.includes("idx_despesas_unico")) {
          throw new Error(
            "Esta despesa já foi registrada no sistema (Nota Fiscal ou lançamento duplicado).",
          );
        }
        throw new Error(`Erro ao salvar despesa: ${fbErr.message}`);
      }
      despesaId = fbData?.id || null;
    } else {
      despesaId = insData?.id || null;
    }

    if (despesaId && payload.nfFile) {
      try {
        const { path, uploadEm } = await uploadNF(
          payload.clienteId,
          motoristaId || payload.clienteId,
          despesaId,
          "despesa",
          payload.nfFile,
        );

        // Notificação de Momento 0 para download da NF pelo cliente com anexo no WhatsApp (Gasto Avulso)
        await notificarUploadNF(payload.clienteId, payload.veiculoId, despesaId, "despesa", {
          descricao: payload.descricao,
          valorTotal: Number(payload.valorTotal) || 0,
          arquivoNf: payload.nfFile,
          pathNf: path,
        });
      } catch (errNf) {
        console.warn("Aviso ao enviar arquivo da NF:", errNf);
      }
    }

    if (payload.descricao) {
      salvarSugestaoLocal(payload.descricao, payload.categoria, payload.clienteId);
    }

    return {
      success: true,
      message: "Gasto do veículo registrado com sucesso!",
      despesaId: despesaId || undefined,
    };
  } catch (err: any) {
    console.error("Erro ao lançar gasto avulso do veiculo:", err);
    return { success: false, message: err?.message || "Erro ao registrar gasto do veículo." };
  }
}

/**
 * Lista todo o histórico de despesas e manutenções registradas para o veículo
 */
export async function listarHistoricoDespesasVeiculo(
  veiculoId: string,
  limite = 100,
): Promise<HistoricoManutencaoGasto[]> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return obterDespesasManutencaoDegustacaoMaster(veiculoId);
    }

    const { data, error } = await supabase
      .from("motorista_despesas")
      .select(
        `
        id, veiculo_id, cliente_id, motorista_id,
        data_despesa, categoria, descricao, valor, km_atual,
        nf_numero, nf_foto_url, nf_upload_em, nf_baixado, nf_baixado_em, nf_expirado,
        observacoes, created_at,
        motoristas ( nome ),
        veiculos ( placa )
      `,
      )
      .eq("veiculo_id", veiculoId)
      .order("data_despesa", { ascending: false })
      .limit(limite);

    if (error) {
      console.warn("Aviso ao buscar histórico de despesas do veículo:", error.message);
      return [];
    }

    return (data ?? []).map(mapearDespesaParaHistorico);
  } catch (err) {
    console.error("Erro ao listar historico de despesas do veiculo:", err);
    return [];
  }
}

/**
 * Remove um registro de despesa do veículo
 */
export async function excluirHistoricoDespesaVeiculo(
  despesaId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase.from("motorista_despesas").delete().eq("id", despesaId);
    if (error) throw new Error(error.message);
    return { success: true, message: "Registro de gasto removido com sucesso." };
  } catch (err: any) {
    return { success: false, message: err?.message || "Erro ao remover registro de gasto." };
  }
}
