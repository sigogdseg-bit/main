import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  isModoDegustacao,
  obterVeiculosDegustacaoMaster,
} from "@/features/demonstracao/services/degustacaoMasterService";
import { calcularEncargosAtraso } from "@/features/mensalidades/utils/encargosLegais";
import { enriquecerNumeracaoParcelasMensalidades } from "@/features/mensalidades/services/mensalidadeService";
import { registrarCobrancaTaxaInstalacao } from "./taxaInstalacaoService";
import { garantirSincronizacaoInstalacaoCliente } from "@/features/instalacoes/services/instalacaoService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import type {
  AgendamentoClienteInfo,
  Cliente,
  InstaladorResumo,
  PlanoCliente,
  StatusCliente,
} from "../types";
import { sincronizarEstoqueInstalacao } from "@/features/estoque/services/estoqueService";
import type { ItemBaixaInstalacao } from "@/features/estoque/types";

export async function carregarInstaladoresAtivos(): Promise<InstaladorResumo[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, nome, telefone, endereco_instalacao, chave_pix, valor_por_instalacao, valor_instalacao_sem_bloqueador, valor_instalacao_com_bloqueador",
      )
      .eq("role", "instalador")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        nome: d.nome,
        telefone: d.telefone || null,
        endereco_instalacao: d.endereco_instalacao || null,
        chave_pix: d.chave_pix || null,
        valor_por_instalacao: d.valor_por_instalacao ? Number(d.valor_por_instalacao) : 0,
        valor_instalacao_sem_bloqueador: d.valor_instalacao_sem_bloqueador
          ? Number(d.valor_instalacao_sem_bloqueador)
          : d.valor_por_instalacao
            ? Number(d.valor_por_instalacao)
            : 0,
        valor_instalacao_com_bloqueador: d.valor_instalacao_com_bloqueador
          ? Number(d.valor_instalacao_com_bloqueador)
          : 0,
      }));
    }

    if (!error && data && data.length === 0) {
      return [];
    }

    // Fallback de resiliencia caso alguma coluna falhe no PostgREST
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("profiles")
      .select("id, nome, endereco_instalacao")
      .eq("role", "instalador")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (fallbackError || !fallbackData) {
      console.warn("Falha no fallback de instaladores:", fallbackError);
      return [];
    }

    return fallbackData.map((d: any) => ({
      id: d.id,
      nome: d.nome,
      telefone: null,
      endereco_instalacao: d.endereco_instalacao || null,
      chave_pix: null,
      valor_por_instalacao: 0,
    }));
  } catch (err) {
    console.error("Erro ao listar instaladores ativos:", err);
    return [];
  }
}

function normalizarClienteRetorno(c: any): Cliente {
  const instalacaoRealizada =
    c.status === "ativo" ||
    c.status_agendamento === "concluido" ||
    (Array.isArray(c.veiculos) &&
      c.veiculos.length > 0 &&
      c.veiculos.every((v: any) => !v.pendente_aprovacao_operador));

  const statusAgendamentoNormalizado =
    instalacaoRealizada && c.status_agendamento === "aguardando_agendamento"
      ? "concluido"
      : c.status_agendamento;

  const instList = Array.isArray(c.instalacoes) ? c.instalacoes : [];
  const totalInstalacao = instList.reduce(
    (acc: number, cur: any) => acc + (Number(cur.valor_instalacao) || 0),
    0,
  );
  const pagoDiretoInstalador = instList.some((i: any) => i.pago_direto_cliente);
  const allInstPagas =
    instList.length > 0 && instList.every((i: any) => i.status_pagamento === "pago");
  const statusTaxaInstalacao = allInstPagas
    ? "pago"
    : instList.some((i: any) => i.status_pagamento === "pago")
      ? "parcial"
      : "pendente";
  const dataPagamentoInstalacao = instList.find((i: any) => i.pago_em)?.pago_em || null;

  return {
    ...c,
    status_agendamento: statusAgendamentoNormalizado,
    privacidade_localizacao: c.privacidade_localizacao ?? true,
    veiculos_count: Array.isArray(c.veiculos) ? c.veiculos.length : 0,
    veiculos_resumo: Array.isArray(c.veiculos)
      ? c.veiculos.map((v: any) => ({
          id: v.id,
          placa: v.placa || "SEM PLACA",
          modelo: v.marca_modelo || v.modelo || "Veículo",
          tipo_veiculo: v.tipo_veiculo || "carro",
          status_bloqueio: v.bloqueado ? "bloqueado" : "desbloqueado",
          pendente_aprovacao_operador: !!v.pendente_aprovacao_operador,
        }))
      : [],
    instalador_nome: c.instalador?.nome || null,
    instalador_endereco: c.instalador?.endereco_instalacao || null,
    instalador_telefone: c.instalador?.telefone || null,
    taxa_instalacao:
      totalInstalacao > 0
        ? totalInstalacao
        : c.taxa_instalacao !== undefined
          ? Number(c.taxa_instalacao)
          : 0,
    pago_direto_instalador: pagoDiretoInstalador,
    status_taxa_instalacao: statusTaxaInstalacao,
    data_pagamento_instalacao: dataPagamentoInstalacao,
  } as Cliente;
}

export async function carregarClientes(): Promise<Cliente[]> {
  try {
    // 1. Tenta carregar via rota segura de backend (/api/clientes) com Service Role
    // Isso evita completamente o erro 42P17 "infinite recursion detected in policy for relation clientes"
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
            return json.clientes.map(normalizarClienteRetorno);
          }
        }
      }
    } catch {
      /* fallback */
    }

    // 2. Consulta direta via Supabase SDK
    const { data, error } = await supabase
      .from("clientes")
      .select(
        `
        *,
        veiculos (id, placa, marca_modelo, tipo_veiculo, bloqueado, pendente_aprovacao_operador),
        instalador:instalador_id (id, nome, telefone, endereco_instalacao),
        instalacoes (id, valor_instalacao, status_pagamento, pago_direto_cliente, pago_em, status)
      `,
      )
      .order("nome_razao_social", { ascending: true });

    if (!error && data) {
      return data.map(normalizarClienteRetorno);
    }

    // Fallback resiliente
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("clientes")
      .select(
        `
        *,
        veiculos (id, placa, marca_modelo, tipo_veiculo, bloqueado),
        instalador:instalador_id (id, nome, endereco_instalacao)
      `,
      )
      .order("nome_razao_social", { ascending: true });

    if (!fallbackError && fallbackData) {
      return fallbackData.map((c: any) => {
        const instalacaoRealizada =
          c.status === "ativo" ||
          c.status_agendamento === "concluido" ||
          (Array.isArray(c.veiculos) && c.veiculos.length > 0);

        const statusAgendamentoNormalizado =
          instalacaoRealizada && c.status_agendamento === "aguardando_agendamento"
            ? "concluido"
            : c.status_agendamento;

        return {
          ...c,
          status_agendamento: statusAgendamentoNormalizado,
          privacidade_localizacao: c.privacidade_localizacao ?? true,
          veiculos_count: Array.isArray(c.veiculos) ? c.veiculos.length : 0,
          veiculos_resumo: Array.isArray(c.veiculos)
            ? c.veiculos.map((v: any) => ({
                id: v.id,
                placa: v.placa || "SEM PLACA",
                modelo: v.marca_modelo || v.modelo || "Veículo",
                tipo_veiculo: v.tipo_veiculo || "carro",
                status_bloqueio: v.bloqueado ? "bloqueado" : "desbloqueado",
                pendente_aprovacao_operador: false,
              }))
            : [],
          instalador_nome: c.instalador?.nome || null,
          instalador_endereco: c.instalador?.endereco_instalacao || null,
          instalador_telefone: null,
        };
      }) as Cliente[];
    }

    // Fallback de ultra-resiliencia: select direto em clientes com busca separada de veiculos
    const { data: rawData, error: rawError } = await supabase
      .from("clientes")
      .select("*")
      .order("nome_razao_social", { ascending: true });

    if (rawError || !rawData) return [];

    const veiculosPorCliente: Record<string, any[]> = {};
    try {
      const { data: veicsRaw } = await supabase
        .from("veiculos")
        .select(
          "id, cliente_id, placa, marca_modelo, tipo_veiculo, bloqueado, pendente_aprovacao_operador",
        );
      if (Array.isArray(veicsRaw)) {
        veicsRaw.forEach((vr: any) => {
          if (!veiculosPorCliente[vr.cliente_id]) veiculosPorCliente[vr.cliente_id] = [];
          veiculosPorCliente[vr.cliente_id].push({
            id: vr.id,
            placa: vr.placa || "SEM PLACA",
            modelo: vr.marca_modelo || "Veículo",
            tipo_veiculo: vr.tipo_veiculo || "carro",
            status_bloqueio: vr.bloqueado ? "bloqueado" : "desbloqueado",
            pendente_aprovacao_operador: !!vr.pendente_aprovacao_operador,
          });
        });
      }
    } catch (_err) {
      // Falha silenciosa com fallback para lista vazia
    }

    return rawData.map((c: any) => {
      const listaV = veiculosPorCliente[c.id] || [];
      return {
        ...c,
        privacidade_localizacao: c.privacidade_localizacao ?? true,
        veiculos_count: listaV.length,
        veiculos_resumo: listaV,
        instalador_nome: null,
        instalador_endereco: null,
        instalador_telefone: null,
      };
    }) as Cliente[];
  } catch (err) {
    console.warn("Erro ao listar clientes:", err);
    return [];
  }
}

export async function salvarCliente(
  cliente: Partial<Cliente> & { id?: string; nome_razao_social?: string },
): Promise<boolean> {
  try {
    const payloadBase: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (cliente.privacidade_localizacao !== undefined) {
      payloadBase.privacidade_localizacao = cliente.privacidade_localizacao;
    }

    if (cliente.nome_razao_social !== undefined) {
      payloadBase.nome_razao_social = cliente.nome_razao_social;
    }
    if (cliente.documento !== undefined) {
      payloadBase.documento = cliente.documento || null;
    }
    if (cliente.email !== undefined) {
      payloadBase.email = cliente.email ? cliente.email.trim().toLowerCase() : null;
    }
    if (cliente.telefone !== undefined) {
      payloadBase.telefone = cliente.telefone || null;
    }
    if (cliente.status !== undefined) {
      payloadBase.status = cliente.status;
    }
    if (cliente.plano !== undefined) {
      payloadBase.plano = cliente.plano;
    }
    if (cliente.dia_vencimento !== undefined) {
      payloadBase.dia_vencimento = cliente.dia_vencimento;
    }
    if (cliente.valor_mensalidade !== undefined) {
      payloadBase.valor_mensalidade = cliente.valor_mensalidade;
    }
    if (cliente.dias_historico_plano !== undefined) {
      payloadBase.dias_historico_plano = cliente.dias_historico_plano;
    }
    if (cliente.dias_retencao_banco !== undefined) {
      payloadBase.dias_retencao_banco = cliente.dias_retencao_banco;
    }
    if (cliente.instalador_id !== undefined) {
      payloadBase.instalador_id = cliente.instalador_id || null;
    }
    if (cliente.data_agendamento !== undefined) {
      payloadBase.data_agendamento = cliente.data_agendamento || null;
    }
    if (cliente.hora_agendamento !== undefined) {
      payloadBase.hora_agendamento = cliente.hora_agendamento || null;
    }
    if (cliente.status_agendamento !== undefined) {
      payloadBase.status_agendamento = cliente.status_agendamento || null;
    }
    if (cliente.regra_horimetro !== undefined) {
      payloadBase.regra_horimetro = cliente.regra_horimetro;
    }
    if (cliente.tem_fidelidade !== undefined) {
      payloadBase.tem_fidelidade = cliente.tem_fidelidade;
    }

    if (cliente.id) {
      const { error } = await supabase.from("clientes").update(payloadBase).eq("id", cliente.id);

      if (error) {
        console.error("Erro no update da tabela clientes:", error);
        throw error;
      }

      // Tenta atualizar campos de contrato de forma tolerante a falhas (caso a migration ainda nao tenha rodado no banco)
      if (cliente.meses_contrato !== undefined) {
        try {
          await supabase
            .from("clientes")
            .update({
              meses_contrato: cliente.meses_contrato,
              data_inicio_contrato:
                cliente.data_inicio_contrato || new Date().toISOString().split("T")[0],
              data_fim_contrato: cliente.data_fim_contrato || null,
              tipo_renovacao: cliente.tipo_renovacao || "mesma_vigencia",
              meses_renovacao: cliente.meses_renovacao || cliente.meses_contrato,
              foro_comarca: cliente.foro_comarca || "Volta Redonda/RJ",
            })
            .eq("id", cliente.id);
        } catch (contratoErr) {
          console.warn("Colunas de contrato ainda pendentes de migracao no banco:", contratoErr);
        }
      }
    } else {
      const { error } = await supabase.from("clientes").insert({
        ...payloadBase,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error("Erro ao salvar cliente:", err);
    return false;
  }
}

export async function cadastrarClienteCompleto(dados: {
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  plano: PlanoCliente;
  diaVencimento?: number;
  valorMensalidade?: number;
  diasHistorico?: number;
  diasRetencao?: number;
  criarUsuario?: boolean;
  senha?: string;
  placa?: string;
  marcaModelo?: string;
  ano?: number;
  cor?: string;
  tipoVeiculo?: string;
  kmInicial?: number;
  instaladorId?: string;
  mesesContrato?: number;
  dataInicioContrato?: string;
  tipoRenovacao?: "mesma_vigencia" | "tempo_personalizado" | "mensal_ate_cancelamento";
  mesesRenovacao?: number;
  foroComarca?: string;
  taxaInstalacao?: number;
  privacidadeLocalizacao?: boolean;
  regraHorimetro?: "pos_chave" | "ignicao_ligada";
  temFidelidade?: boolean;
  horimetroInicial?: number;
  chassi?: string;
  rastreadorImei?: string;
  rastreadorModelo?: string;
  chipOperadora?: string;
  chipIccid?: string;
  chipLinha?: string;
}): Promise<{ success: boolean; message: string; cliente_id?: string; user_id?: string }> {
  try {
    const mesesContratoFinal = dados.mesesContrato ?? 12;
    const dataInicioFinal = dados.dataInicioContrato || new Date().toISOString().split("T")[0];
    const tipoRenovacaoFinal = dados.tipoRenovacao || "mesma_vigencia";
    const mesesRenovacaoFinal = dados.mesesRenovacao ?? mesesContratoFinal;
    const foroComarcaFinal = dados.foroComarca || "Volta Redonda/RJ";
    const taxaInstalacaoFinal = dados.taxaInstalacao ?? 350.0;
    const privacidadeFinal = dados.privacidadeLocalizacao ?? true;

    const { data, error } = await supabase.rpc("admin_cadastrar_cliente_completo", {
      p_nome: dados.nome,
      p_documento: dados.documento || null,
      p_email: dados.email || null,
      p_telefone: dados.telefone || null,
      p_plano: dados.plano,
      p_dia_vencimento: dados.diaVencimento ?? 10,
      p_valor_mensalidade: dados.valorMensalidade ?? 79.9,
      p_dias_historico: dados.diasHistorico ?? 7,
      p_dias_retencao: dados.diasRetencao ?? 10,
      p_criar_usuario: dados.criarUsuario ?? true,
      p_senha: dados.senha || null,
      p_placa: dados.placa || null,
      p_marca_modelo: dados.marcaModelo || null,
      p_km_inicial: dados.kmInicial ?? 0,
      p_instalador_id: dados.instaladorId || null,
      p_meses_contrato: mesesContratoFinal,
      p_data_inicio_contrato: dataInicioFinal,
      p_tipo_renovacao: tipoRenovacaoFinal,
      p_meses_renovacao: mesesRenovacaoFinal,
      p_foro_comarca: foroComarcaFinal,
    });

    if (error) {
      // Fallback resiliente caso a RPC esteja em versao anterior sem os novos parametros
      const { data: fallbackData, error: fallbackError } = await supabase.rpc(
        "admin_cadastrar_cliente_completo",
        {
          p_nome: dados.nome,
          p_documento: dados.documento || null,
          p_email: dados.email || null,
          p_telefone: dados.telefone || null,
          p_plano: dados.plano,
          p_dia_vencimento: dados.diaVencimento ?? 10,
          p_valor_mensalidade: dados.valorMensalidade ?? 79.9,
          p_dias_historico: dados.diasHistorico ?? 7,
          p_dias_retencao: dados.diasRetencao ?? 10,
          p_criar_usuario: dados.criarUsuario ?? true,
          p_senha: dados.senha || null,
          p_placa: dados.placa || null,
          p_marca_modelo: dados.marcaModelo || null,
          p_km_inicial: dados.kmInicial ?? 0,
          p_instalador_id: dados.instaladorId || null,
        },
      );

      if (fallbackError) throw fallbackError;

      const res = fallbackData as {
        success: boolean;
        message: string;
        cliente_id?: string;
        user_id?: string;
      };

      if (res.cliente_id) {
        // Atualiza campos de contrato diretamente caso as colunas existam no banco
        try {
          const dFim = new Date(dataInicioFinal + "T12:00:00");
          dFim.setMonth(dFim.getMonth() + mesesContratoFinal);

          await supabase
            .from("clientes")
            .update({
              meses_contrato: mesesContratoFinal,
              data_inicio_contrato: dataInicioFinal,
              data_fim_contrato: dFim.toISOString().split("T")[0],
              tipo_renovacao: tipoRenovacaoFinal,
              meses_renovacao: mesesRenovacaoFinal,
              foro_comarca: foroComarcaFinal,
              taxa_instalacao: taxaInstalacaoFinal,
              regra_horimetro: dados.regraHorimetro || "pos_chave",
              tem_fidelidade: dados.temFidelidade !== undefined ? dados.temFidelidade : true,
            } as any)
            .eq("id", res.cliente_id);
        } catch (e) {
          // ignora se colunas adicionais não existirem no schema remoto
        }

        // Regra Canônica Hunter-Guardian:
        // A cobrança de mensalidades só inicia APÓS o 1º veículo ativo ser instalado/ativado.
        // Se o cliente for novo e ainda estiver aguardando instalação, as parcelas contratuais são postergadas.
        const { data: veicsAtivos } = await supabase
          .from("veiculos")
          .select("id")
          .eq("cliente_id", res.cliente_id)
          .eq("ativo", true)
          .limit(1);

        if (veicsAtivos && veicsAtivos.length > 0) {
          try {
            await gerarParcelasContratoCliente(res.cliente_id, {
              mesesContrato: mesesContratoFinal,
              dataInicioContrato: dataInicioFinal,
              valorMensalidade: dados.valorMensalidade,
              diaVencimento: dados.diaVencimento,
            });
          } catch (e) {
            console.warn("Aviso ao gerar parcelas contratuais:", e);
          }
        }

        // Registra cobrança da Taxa de Instalação e Ativação no ato da contratação
        try {
          await registrarCobrancaTaxaInstalacao(
            res.cliente_id,
            taxaInstalacaoFinal,
            dataInicioFinal,
          );
        } catch (e) {
          console.warn("Aviso ao registrar taxa de instalação:", e);
        }

        // Provisiona Chip M2M, Rastreador e Ordem de Instalação
        if (dados.rastreadorImei || dados.chipIccid || dados.placa || dados.instaladorId) {
          try {
            await provisionarChipRastreadorEInstalacao({
              clienteId: res.cliente_id,
              instaladorId: dados.instaladorId,
              placa: dados.placa,
              marcaModelo: dados.marcaModelo,
              ano: dados.ano,
              cor: dados.cor,
              tipoVeiculo: dados.tipoVeiculo,
              regraHorimetro: dados.regraHorimetro,
              horimetroInicial: dados.horimetroInicial,
              chassi: dados.chassi,
              rastreadorImei: dados.rastreadorImei,
              rastreadorModelo: dados.rastreadorModelo,
              chipOperadora: dados.chipOperadora,
              chipIccid: dados.chipIccid,
              chipLinha: dados.chipLinha,
            });
          } catch (e) {
            console.warn("Aviso ao provisionar equipamento e chip:", e);
          }
        }
      }

      return res;
    }

    const resFinal = data as {
      success: boolean;
      message: string;
      cliente_id?: string;
      user_id?: string;
    };

    if (resFinal?.cliente_id) {
      try {
        await supabase
          .from("clientes")
          .update({
            taxa_instalacao: taxaInstalacaoFinal,
            regra_horimetro: dados.regraHorimetro || "pos_chave",
            tem_fidelidade: dados.temFidelidade !== undefined ? dados.temFidelidade : true,
          } as any)
          .eq("id", resFinal.cliente_id);
      } catch (e) {
        // ignora se coluna não existir no supabase remoto
      }

      // Regra Canônica Hunter-Guardian:
      // A cobrança de mensalidades só inicia APÓS o 1º veículo ativo ser instalado/ativado.
      const { data: veicsAtivos } = await supabase
        .from("veiculos")
        .select("id")
        .eq("cliente_id", resFinal.cliente_id)
        .eq("ativo", true)
        .limit(1);

      if (veicsAtivos && veicsAtivos.length > 0) {
        await gerarParcelasContratoCliente(resFinal.cliente_id, {
          mesesContrato: mesesContratoFinal,
          dataInicioContrato: dataInicioFinal,
          valorMensalidade: dados.valorMensalidade,
          diaVencimento: dados.diaVencimento,
        });
      }

      // Registra cobrança da Taxa de Instalação e Ativação no ato da contratação
      await registrarCobrancaTaxaInstalacao(
        resFinal.cliente_id,
        taxaInstalacaoFinal,
        dataInicioFinal,
      );

      // Provisiona Chip M2M, Rastreador e Ordem de Instalação
      if (dados.rastreadorImei || dados.chipIccid || dados.placa || dados.instaladorId) {
        try {
          await provisionarChipRastreadorEInstalacao({
            clienteId: resFinal.cliente_id,
            instaladorId: dados.instaladorId,
            placa: dados.placa,
            marcaModelo: dados.marcaModelo,
            ano: dados.ano,
            cor: dados.cor,
            tipoVeiculo: dados.tipoVeiculo,
            regraHorimetro: dados.regraHorimetro,
            horimetroInicial: dados.horimetroInicial,
            chassi: dados.chassi,
            rastreadorImei: dados.rastreadorImei,
            rastreadorModelo: dados.rastreadorModelo,
            chipOperadora: dados.chipOperadora,
            chipIccid: dados.chipIccid,
            chipLinha: dados.chipLinha,
          });
        } catch (e) {
          console.warn("Aviso ao provisionar equipamento e chip:", e);
        }
      }
    }

    return resFinal;
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Falha ao cadastrar cliente e credenciais.",
    };
  }
}

export async function atualizarClienteCompleto(dados: {
  id: string;
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  status: StatusCliente;
  plano: PlanoCliente;
  diaVencimento?: number;
  valorMensalidade?: number;
  diasHistorico?: number;
  diasRetencao?: number;
  senha?: string;
  instaladorId?: string;
  dataAgendamento?: string;
  horaAgendamento?: string;
  statusAgendamento?: string;
  mesesContrato?: number;
  dataInicioContrato?: string;
  tipoRenovacao?: "mesma_vigencia" | "tempo_personalizado" | "mensal_ate_cancelamento";
  mesesRenovacao?: number;
  foroComarca?: string;
  taxaInstalacao?: number;
  privacidadeLocalizacao?: boolean;
  regraHorimetro?: "pos_chave" | "ignicao_ligada";
  temFidelidade?: boolean;
  rastreadorImei?: string;
  rastreadorModelo?: string;
  chipOperadora?: string;
  chipIccid?: string;
  chipLinha?: string;
  placa?: string;
  marcaModelo?: string;
  ano?: number;
  cor?: string;
  tipoVeiculo?: string;
  horimetroInicial?: number;
  kitId?: string;
}): Promise<{ success: boolean; message: string; cliente_id?: string; user_id?: string }> {
  try {
    const mesesContratoFinal = dados.mesesContrato ?? 12;
    const dataInicioFinal = dados.dataInicioContrato || new Date().toISOString().split("T")[0];
    const tipoRenovacaoFinal = dados.tipoRenovacao || "mesma_vigencia";
    const mesesRenovacaoFinal = dados.mesesRenovacao ?? mesesContratoFinal;
    const foroComarcaFinal = dados.foroComarca || "Volta Redonda/RJ";
    const taxaInstalacaoFinal = dados.taxaInstalacao;

    let rpcSuccess = false;
    let rpcResponse: any = null;

    // 1. Tenta a RPC estendida com os novos parâmetros contratuais
    try {
      const { data, error } = await supabase.rpc("admin_atualizar_cliente_completo", {
        p_cliente_id: dados.id,
        p_nome: dados.nome,
        p_documento: dados.documento || null,
        p_email: dados.email || null,
        p_telefone: dados.telefone || null,
        p_status: dados.status,
        p_plano: dados.plano,
        p_dia_vencimento: dados.diaVencimento ?? 10,
        p_valor_mensalidade: dados.valorMensalidade ?? 79.9,
        p_dias_historico: dados.diasHistorico ?? 7,
        p_dias_retencao: dados.diasRetencao ?? 10,
        p_senha: dados.senha || null,
        p_instalador_id: dados.instaladorId || null,
        p_meses_contrato: mesesContratoFinal,
        p_data_inicio_contrato: dataInicioFinal,
        p_tipo_renovacao: tipoRenovacaoFinal,
        p_meses_renovacao: mesesRenovacaoFinal,
        p_foro_comarca: foroComarcaFinal,
        p_gerar_parcelas_ausentes: true,
      });

      if (!error && data) {
        rpcSuccess = true;
        rpcResponse = data;
      }
    } catch {
      // Falhou a RPC estendida, tenta a canonica original
    }

    // 2. Se a RPC estendida falhou, tenta a RPC canônica que existe no banco remoto do Supabase
    if (!rpcSuccess) {
      try {
        const { data: dataCanonico, error: errorCanonico } = await supabase.rpc(
          "admin_atualizar_cliente_completo",
          {
            p_cliente_id: dados.id,
            p_nome: dados.nome,
            p_documento: dados.documento || null,
            p_email: dados.email || null,
            p_telefone: dados.telefone || null,
            p_status: dados.status,
            p_plano: dados.plano,
            p_dia_vencimento: dados.diaVencimento ?? 10,
            p_valor_mensalidade: dados.valorMensalidade ?? 79.9,
            p_dias_historico: dados.diasHistorico ?? 7,
            p_dias_retencao: dados.diasRetencao ?? 10,
            p_senha: dados.senha || null,
            p_instalador_id: dados.instaladorId || null,
          },
        );

        if (!errorCanonico && dataCanonico) {
          rpcSuccess = true;
          rpcResponse = dataCanonico;
        }
      } catch {
        // Falhou a RPC canonica, vai para fallback direto de tabela
      }
    }

    // 3. Se nenhuma RPC tiver respondido, aplica atualização direta e segura via salvarCliente
    if (!rpcSuccess) {
      const ok = await salvarCliente({
        id: dados.id,
        nome_razao_social: dados.nome,
        documento: dados.documento || null,
        email: dados.email || null,
        telefone: dados.telefone || null,
        status: dados.status,
        plano: dados.plano,
        dia_vencimento: dados.diaVencimento ?? 10,
        valor_mensalidade: dados.valorMensalidade ?? 79.9,
        dias_historico_plano: dados.diasHistorico ?? 7,
        dias_retencao_banco: dados.diasRetencao ?? 10,
        instalador_id: dados.instaladorId || null,
        data_agendamento: dados.dataAgendamento || null,
        hora_agendamento: dados.horaAgendamento || null,
        status_agendamento: dados.statusAgendamento || null,
        meses_contrato: mesesContratoFinal,
        data_inicio_contrato: dataInicioFinal,
        tipo_renovacao: tipoRenovacaoFinal,
        meses_renovacao: mesesRenovacaoFinal,
        foro_comarca: foroComarcaFinal,
        ...(dados.privacidadeLocalizacao !== undefined
          ? { privacidade_localizacao: dados.privacidadeLocalizacao }
          : {}),
      });

      if (!ok) {
        return {
          success: false,
          message: "Erro ao atualizar dados do cliente.",
        };
      }
    }

    // 4. Salva dados contratuais e privacidade tolerante a falhas
    try {
      const dFim = new Date(dataInicioFinal + "T12:00:00");
      dFim.setMonth(dFim.getMonth() + mesesContratoFinal);

      const updatePayload: Record<string, any> = {
        meses_contrato: mesesContratoFinal,
        data_inicio_contrato: dataInicioFinal,
        data_fim_contrato: dFim.toISOString().split("T")[0],
        tipo_renovacao: tipoRenovacaoFinal,
        meses_renovacao: mesesRenovacaoFinal,
        foro_comarca: foroComarcaFinal,
        ...(taxaInstalacaoFinal !== undefined ? { taxa_instalacao: taxaInstalacaoFinal } : {}),
        ...(dados.regraHorimetro !== undefined ? { regra_horimetro: dados.regraHorimetro } : {}),
        ...(dados.temFidelidade !== undefined ? { tem_fidelidade: dados.temFidelidade } : {}),
      };

      if (dados.privacidadeLocalizacao !== undefined) {
        updatePayload.privacidade_localizacao = dados.privacidadeLocalizacao;
      }

      await supabase
        .from("clientes")
        .update(updatePayload as any)
        .eq("id", dados.id);

      // Sincronização explícita e direta de email, perfil e campos de mensalidade
      const emailLimpo = dados.email ? dados.email.trim().toLowerCase() : null;
      const updateDiretoCliente: Record<string, any> = {
        nome_razao_social: dados.nome.trim(),
        email: emailLimpo,
        telefone: dados.telefone ? dados.telefone.trim() : null,
        documento: dados.documento ? dados.documento.trim() : null,
        valor_mensalidade:
          dados.valorMensalidade !== undefined ? Number(dados.valorMensalidade) : 79.9,
        dia_vencimento: dados.diaVencimento !== undefined ? Number(dados.diaVencimento) : 10,
        pendente_configuracao_operador: false,
      };

      updateDiretoCliente.instalador_id = dados.instaladorId || null;
      if (dados.instaladorId) {
        const { data: currCliente } = await supabase
          .from("clientes")
          .select("status_agendamento, status")
          .eq("id", dados.id)
          .maybeSingle();

        // NUNCA rebaixa se a instalação já foi concluída ou o cliente já está ativo
        if (
          !currCliente?.status_agendamento &&
          currCliente?.status !== "ativo" &&
          dados.status !== "ativo"
        ) {
          updateDiretoCliente.status_agendamento = "aguardando_agendamento";
        }
      } else {
        // Se desvinculou o instalador, atualiza ordens de serviço pendentes do cliente para sem instalador
        try {
          await supabase
            .from("instalacoes")
            .update({ instalador_id: null, updated_at: new Date().toISOString() })
            .eq("cliente_id", dados.id)
            .neq("status", "concluida");
        } catch (errDesvinc) {
          console.warn("Aviso ao desvincular instalador das ordens pendentes:", errDesvinc);
        }
      }

      await supabase
        .from("clientes")
        .update(updateDiretoCliente as any)
        .eq("id", dados.id);

      // Limpa pendência de aprovação dos veículos deste cliente
      await supabase
        .from("veiculos")
        .update({ pendente_aprovacao_operador: false } as any)
        .eq("cliente_id", dados.id);

      if (dados.instaladorId) {
        try {
          await garantirSincronizacaoInstalacaoCliente(dados.id, dados.instaladorId);
        } catch (err) {
          console.warn("Sincronização imediata de instalação:", err);
        }
      }

      // Provisiona ou atualiza Chip M2M, Rastreador, Veículo e Ordem de Instalação na Edição
      if (
        dados.rastreadorImei ||
        dados.chipIccid ||
        dados.placa ||
        dados.instaladorId ||
        dados.tipoVeiculo ||
        dados.kitId
      ) {
        try {
          await provisionarChipRastreadorEInstalacao({
            clienteId: dados.id,
            instaladorId: dados.instaladorId,
            placa: dados.placa,
            marcaModelo: dados.marcaModelo,
            ano: dados.ano,
            cor: dados.cor,
            tipoVeiculo: dados.tipoVeiculo,
            regraHorimetro: dados.regraHorimetro,
            horimetroInicial: dados.horimetroInicial,
            rastreadorImei: dados.rastreadorImei,
            rastreadorModelo: dados.rastreadorModelo,
            chipOperadora: dados.chipOperadora,
            chipIccid: dados.chipIccid,
            chipLinha: dados.chipLinha,
            kitId: dados.kitId,
          });
        } catch (provErr) {
          console.warn("Aviso ao provisionar/atualizar equipamento na edição:", provErr);
        }
      }

      const { data: cRow } = await supabase
        .from("clientes")
        .select("user_id")
        .eq("id", dados.id)
        .maybeSingle();

      if (cRow?.user_id) {
        const profileUpdates: Record<string, any> = {
          nome: dados.nome.trim(),
          updated_at: new Date().toISOString(),
        };
        if (emailLimpo) {
          profileUpdates.email = emailLimpo;
        }
        await supabase
          .from("profiles")
          .update(profileUpdates as any)
          .eq("id", cRow.user_id);
      }

      if (taxaInstalacaoFinal !== undefined) {
        await registrarCobrancaTaxaInstalacao(dados.id, taxaInstalacaoFinal, dataInicioFinal);
      }
    } catch (contratoErr) {
      console.warn("Colunas contratuais ainda pendentes:", contratoErr);
    }

    // 5. Se o dia de vencimento foi informado e for válido (1 a 31),
    // sincroniza imediata e sincronamente todas as faturas futuras pendentes do cliente
    let totalFuturasSincronizadas = 0;
    if (
      dados.diaVencimento &&
      Number(dados.diaVencimento) >= 1 &&
      Number(dados.diaVencimento) <= 31
    ) {
      try {
        const resSinc = await sincronizarVencimentoMensalidadesFuturasCliente(
          dados.id,
          Number(dados.diaVencimento),
        );
        totalFuturasSincronizadas = resSinc.atualizadas;
      } catch (errSincVenc) {
        console.warn("Aviso ao sincronizar faturas futuras no update do cliente:", errSincVenc);
      }
    }

    // 6. Gera parcelas de forma nao-bloqueante em segundo plano (evita travar a UI)
    gerarParcelasContratoCliente(dados.id, {
      mesesContrato: mesesContratoFinal,
      dataInicioContrato: dataInicioFinal,
      valorMensalidade: dados.valorMensalidade,
      diaVencimento: dados.diaVencimento,
    }).catch((errParc) => console.warn("Aviso ao gerar parcelas em segundo plano:", errParc));

    let msgRetorno = "Cliente atualizado com sucesso!";
    if (totalFuturasSincronizadas > 0) {
      msgRetorno = `Cliente atualizado e ${totalFuturasSincronizadas} cobranças futuras sincronizadas com sucesso!`;
    }

    return (
      rpcResponse || {
        success: true,
        message: msgRetorno,
        cliente_id: dados.id,
      }
    );
  } catch (err: any) {
    console.error("Erro em atualizarClienteCompleto:", err);
    return {
      success: false,
      message: err?.message || "Falha ao atualizar dados do cliente.",
    };
  }
}

/**
 * Sincroniza imediatamente todas as cobranças e mensalidades futuras pendentes de um cliente
 * com o novo dia de vencimento contratual informado.
 * Atualiza com tolerância a falhas tanto a tabela public.mensalidades quanto public.transacoes_financeiras.
 */
export async function sincronizarVencimentoMensalidadesFuturasCliente(
  clienteId: string,
  novoDiaVencimento: number,
): Promise<{ success: boolean; atualizadas: number; message: string }> {
  try {
    if (!clienteId || !novoDiaVencimento || novoDiaVencimento < 1 || novoDiaVencimento > 31) {
      return {
        success: false,
        atualizadas: 0,
        message: "Parâmetros inválidos para sincronizar vencimentos futuros.",
      };
    }

    const hojeStr = new Date().toISOString().split("T")[0];

    // Busca todas as faturas não quitadas do cliente
    const { data: mensalidadesPendentes, error: errBusca } = await supabase
      .from("mensalidades")
      .select("id, mes_referencia, ano_referencia, status, data_vencimento")
      .eq("cliente_id", clienteId)
      .neq("status", "pago");

    if (errBusca) {
      console.warn("Erro ao buscar mensalidades para sincronizar vencimento:", errBusca);
      return { success: false, atualizadas: 0, message: errBusca.message };
    }

    let atualizadas = 0;

    for (const m of mensalidadesPendentes || []) {
      let anoF = Number(m.ano_referencia);
      let mesF = Number(m.mes_referencia);

      // Resiliência caso ano ou mês sejam inválidos/nulos: extrai da data de vencimento
      if (!anoF || !mesF || mesF <= 0 || mesF > 12) {
        if (m.data_vencimento) {
          const partes = m.data_vencimento.split("-").map(Number);
          anoF = partes[0];
          mesF = partes[1];
        }
      }

      if (!anoF || !mesF || mesF <= 0 || mesF > 12) {
        continue;
      }

      const diasNoMes = new Date(anoF, mesF, 0).getDate();
      const diaFinal = Math.min(novoDiaVencimento, diasNoMes);
      const novaDataFutura = `${anoF}-${String(mesF).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
      const statusFuturo = novaDataFutura < hojeStr ? "vencido" : "pendente";

      const { error: errUpd } = await supabase
        .from("mensalidades")
        .update({
          data_vencimento: novaDataFutura,
          status: statusFuturo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id);

      if (errUpd) {
        // Fallback sem updated_at
        await supabase
          .from("mensalidades")
          .update({
            data_vencimento: novaDataFutura,
            status: statusFuturo,
          })
          .eq("id", m.id);
      }

      // Sincroniza espelho correspondente no livro-caixa
      try {
        const { error: errTrans } = await supabase
          .from("transacoes_financeiras" as any)
          .update({
            data_vencimento: novaDataFutura,
            updated_at: new Date().toISOString(),
          })
          .eq("mensalidade_id", m.id);

        if (errTrans) {
          await supabase
            .from("transacoes_financeiras" as any)
            .update({
              data_vencimento: novaDataFutura,
            })
            .eq("mensalidade_id", m.id);
        }
      } catch {
        // Ignora falha em coluna opcional do financeiro
      }

      atualizadas++;
    }

    return {
      success: true,
      atualizadas,
      message: `${atualizadas} cobranças futuras sincronizadas com sucesso para o dia ${novoDiaVencimento}.`,
    };
  } catch (err: any) {
    console.error("Erro ao sincronizar cobranças futuras do cliente:", err);
    return {
      success: false,
      atualizadas: 0,
      message: err?.message || "Falha ao sincronizar cobranças futuras.",
    };
  }
}

/**
 * Inicia a cobrança e gera as parcelas do contrato a partir da data de ativação do primeiro veículo.
 * Regra Canônica Hunter-Guardian: O cliente só é cobrado após o 1º veículo ser instalado e ativado no sistema.
 */
export async function ativarCobrancaPrimeiroVeiculo(
  clienteId: string,
  dataAtivacao?: string,
): Promise<{ success: boolean; geradas: number; message: string }> {
  try {
    // 1. Verifica se o cliente já possui mensalidades cadastradas
    const { data: mensalidadesExistentes } = await supabase
      .from("mensalidades")
      .select("id")
      .eq("cliente_id", clienteId)
      .limit(1);

    if (mensalidadesExistentes && mensalidadesExistentes.length > 0) {
      return {
        success: true,
        geradas: 0,
        message: "Cliente já possui parcelas de cobrança geradas.",
      };
    }

    // 2. Busca dados de contrato do cliente
    const { data: cliente, error: cliErr } = await supabase
      .from("clientes")
      .select("id, dia_vencimento, valor_mensalidade, meses_contrato, status")
      .eq("id", clienteId)
      .maybeSingle();

    if (cliErr || !cliente) {
      return {
        success: false,
        geradas: 0,
        message: "Cliente não encontrado para ativar cobrança.",
      };
    }

    const dataInicioFinal = dataAtivacao || new Date().toISOString().split("T")[0];

    // 3. Atualiza data_inicio_contrato com a data de ativação real
    await supabase
      .from("clientes")
      .update({
        data_inicio_contrato: dataInicioFinal,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", clienteId);

    // 4. Gera parcelas contratuais contando a partir da data da instalação/ativação
    const resultado = await gerarParcelasContratoCliente(clienteId, {
      mesesContrato: cliente.meses_contrato || 12,
      dataInicioContrato: dataInicioFinal,
      valorMensalidade: cliente.valor_mensalidade,
      diaVencimento: cliente.dia_vencimento,
    });

    return {
      success: resultado.success,
      geradas: resultado.geradas,
      message: resultado.message,
    };
  } catch (err: any) {
    console.error("Erro ao ativar cobrança do primeiro veículo:", err);
    return {
      success: false,
      geradas: 0,
      message: err?.message || "Falha ao ativar cobrança do primeiro veículo.",
    };
  }
}

/**
 * Gera automaticamente todas as parcelas mensais contratadas na tabela public.mensalidades.
 * Suporta clientes cortesia (R$ 0,00) e clientes pagantes regulares sem depender de colunas ausentes no banco remoto.
 */
export async function gerarParcelasContratoCliente(
  clienteId: string,
  params?: {
    mesesContrato?: number;
    dataInicioContrato?: string;
    valorMensalidade?: number;
    diaVencimento?: number;
  },
): Promise<{ success: boolean; geradas: number; existentes: number; message: string }> {
  try {
    const mesesTotal = params?.mesesContrato ?? 12;
    let diaVenc = params?.diaVencimento ?? 10;
    let valor =
      params?.valorMensalidade !== undefined ? Number(params.valorMensalidade) : undefined;
    const dataInicioStr = params?.dataInicioContrato;

    // Se faltar algum parâmetro, busca no banco apenas as colunas canônicas existentes (id, dia_vencimento, valor_mensalidade)
    if (valor === undefined || !params?.diaVencimento) {
      const { data: cliente, error: cliError } = await supabase
        .from("clientes")
        .select("id, dia_vencimento, valor_mensalidade")
        .eq("id", clienteId)
        .maybeSingle();

      if (!cliError && cliente) {
        if (!params?.diaVencimento) {
          diaVenc = cliente.dia_vencimento || 10;
        }
        if (valor === undefined) {
          // Preserva estritamente 0 para cortesia!
          valor =
            cliente.valor_mensalidade !== null && cliente.valor_mensalidade !== undefined
              ? Number(cliente.valor_mensalidade)
              : 79.9;
        }
      }
    }

    if (valor === undefined) {
      valor = 79.9;
    }

    const dataInicio = dataInicioStr ? new Date(dataInicioStr + "T12:00:00") : new Date();

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const diaInicio = dataInicio.getDate();
    const mesInicio = dataInicio.getMonth() + 1;
    const anoInicio = dataInicio.getFullYear();

    const totalDiasMesInicio = new Date(anoInicio, mesInicio, 0).getDate();

    // Regra Canonica de Cobranca (Hunter-Guardian):
    // Se a data de contratacao/inicio for APOS o prazo de pagamento escolhido (ex: 5, 10, 15 ou 25) no mes atual:
    // Nao pode criar cliente ja com parcela vencida!
    // A 1ª fatura vai para o proximo mes e nela e inserida a diferenca (pro-rata) dos dias restantes do mes atual.
    const aposPrazoMesAtual = diaInicio > diaVenc;

    let geradas = 0;
    let existentes = 0;

    // Se o cliente for cortesia (valor 0) ou se foi editado para zerar valores:
    // Atualiza imediatamente todas as mensalidades pendentes ou vencidas para valor 0 e status 'pago' (quitadas como cortesia),
    // eliminando qualquer cobranca indevida, juros, multa ou pendencia residual.
    if (valor === 0) {
      await supabase
        .from("mensalidades")
        .update({
          valor: 0,
          status: "pago",
        })
        .eq("cliente_id", clienteId)
        .neq("status", "pago");
    }

    // Se a contratacao foi apos o dia do vencimento do mes de inicio,
    // remove qualquer cobranca indevida gerada no passado do mes atual que ainda nao foi paga
    if (aposPrazoMesAtual) {
      await supabase
        .from("mensalidades")
        .delete()
        .eq("cliente_id", clienteId)
        .eq("mes_referencia", mesInicio)
        .eq("ano_referencia", anoInicio)
        .neq("status", "pago");
    }

    // Calcula a pro-rata dos dias restantes do mes atual se a contratacao foi apos o vencimento
    const diasRestantesMesAtual = Math.max(1, totalDiasMesInicio - diaInicio + 1);
    const proRataMesAtual =
      aposPrazoMesAtual && valor > 0
        ? Number(((valor / totalDiasMesInicio) * diasRestantesMesAtual).toFixed(2))
        : 0;

    // Se foi apos o prazo, o primeiro vencimento salta para o proximo mes (offset 1)
    const offsetInicial = aposPrazoMesAtual ? 1 : 0;

    for (let i = 0; i < mesesTotal; i++) {
      const mesOffset = offsetInicial + i;
      const dRef = new Date(dataInicio);
      dRef.setMonth(dRef.getMonth() + mesOffset);

      const mes = dRef.getMonth() + 1;
      const ano = dRef.getFullYear();

      // Ultimo dia valido do mes
      const ultimoDiaMes = new Date(ano, mes, 0).getDate();
      const diaFinal = Math.min(diaVenc, ultimoDiaMes);
      const dataVenc = new Date(ano, mes - 1, diaFinal);
      const dataVencStr = `${ano}-${String(mes).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;

      // Se for a primeira parcela e houve pro-rata do mes anterior, soma o valor
      let valorFinalParcela = valor;
      if (i === 0 && proRataMesAtual > 0) {
        valorFinalParcela = Number((valor + proRataMesAtual).toFixed(2));
      }

      // Se for cliente cortesia (valor 0), status inicial pode ser 'pago' / quitado como cortesia
      let statusInicial: "pendente" | "pago" | "vencido" = "pendente";
      if (valorFinalParcela === 0) {
        statusInicial = "pago";
      } else if (dataVenc < hoje) {
        statusInicial = "vencido";
      }

      const numeroParcelaAtual = i + 1;

      let { error: insError } = await supabase.from("mensalidades").insert({
        cliente_id: clienteId,
        mes_referencia: mes,
        ano_referencia: ano,
        numero_parcela: numeroParcelaAtual,
        total_parcelas: mesesTotal,
        valor: valorFinalParcela,
        data_vencimento: dataVencStr,
        status: statusInicial,
      });

      if (insError && insError.code !== "23505") {
        const fbIns = await supabase.from("mensalidades").insert({
          cliente_id: clienteId,
          mes_referencia: mes,
          ano_referencia: ano,
          valor: valorFinalParcela,
          data_vencimento: dataVencStr,
          status: statusInicial,
        });
        insError = fbIns.error;
      }

      if (!insError) {
        geradas++;
      } else {
        existentes++;
        // Se ja existe e a fatura nao foi quitada com pagamento real pelo cliente, sincroniza com o novo valor e numeracao
        if (valorFinalParcela === 0) {
          await supabase
            .from("mensalidades")
            .update({
              valor: 0,
              status: "pago",
              data_vencimento: dataVencStr,
              numero_parcela: numeroParcelaAtual,
              total_parcelas: mesesTotal,
            })
            .eq("cliente_id", clienteId)
            .eq("mes_referencia", mes)
            .eq("ano_referencia", ano)
            .neq("status", "pago");
        } else {
          await supabase
            .from("mensalidades")
            .update({
              valor: valorFinalParcela,
              data_vencimento: dataVencStr,
              status: dataVenc < hoje ? "vencido" : "pendente",
              numero_parcela: numeroParcelaAtual,
              total_parcelas: mesesTotal,
            })
            .eq("cliente_id", clienteId)
            .eq("mes_referencia", mes)
            .eq("ano_referencia", ano)
            .neq("status", "pago");
        }
      }
    }

    return {
      success: true,
      geradas,
      existentes,
      message: `${geradas} parcelas geradas (${existentes} já existentes).`,
    };
  } catch (err: any) {
    console.error("Erro ao gerar parcelas de contrato do cliente:", err);
    return {
      success: false,
      geradas: 0,
      existentes: 0,
      message: err?.message || "Falha ao gerar parcelas de contrato.",
    };
  }
}

/**
 * Varre todos os clientes do sistema e garante que tenham parcelas de contrato geradas
 */
export async function sincronizarParcelasFuturasTodosClientes(): Promise<{
  clientesProcessados: number;
  totalGeradas: number;
}> {
  try {
    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, dia_vencimento, valor_mensalidade")
      .order("created_at", { ascending: false });

    if (!clientes || clientes.length === 0) {
      return { clientesProcessados: 0, totalGeradas: 0 };
    }

    let totalGeradas = 0;
    for (const c of clientes) {
      const res = await gerarParcelasContratoCliente(c.id, {
        mesesContrato: 12,
        valorMensalidade:
          c.valor_mensalidade !== null && c.valor_mensalidade !== undefined
            ? Number(c.valor_mensalidade)
            : 79.9,
        diaVencimento: c.dia_vencimento || 10,
      });
      totalGeradas += res.geradas;
    }

    return {
      clientesProcessados: clientes.length,
      totalGeradas,
    };
  } catch (err) {
    console.error("Erro ao sincronizar parcelas futuras de todos os clientes:", err);
    return { clientesProcessados: 0, totalGeradas: 0 };
  }
}

export interface ParcelaContratoItem {
  id: string;
  clienteId: string;
  mesReferencia: number;
  anoReferencia: number;
  numeroParcela?: number;
  totalParcelas?: number;
  dataVencimento: string;
  valorOriginal: number;
  status: "pendente" | "pago" | "vencido";
  tipo: "quitada" | "atrasada" | "atrasada_paga" | "futura";
  dataPagamento?: string;
  valorPago?: number;
  diasAtraso: number;
  valorMulta: number;
  valorJuros: number;
  valorAtualizadoHoje: number;
}

export interface QuadroParcelasContrato {
  parcelas: ParcelaContratoItem[];
  quitadas: ParcelaContratoItem[];
  atrasadas: ParcelaContratoItem[];
  atrasadasPagas: ParcelaContratoItem[];
  futuras: ParcelaContratoItem[];
  totalGeralContrato: number;
  totalQuitado: number;
  totalAtrasadoOriginal: number;
  totalAtrasadoAtualizadoHoje: number;
  totalFuturoAVencer: number;
}

/**
 * Consulta e categoriza as parcelas contratadas de um cliente:
 * - Quitadas no prazo
 * - Atrasadas em aberto (com cálculo de juros e multa do dia de hoje)
 * - Atrasadas pagas (com data em que quitou e valor pago)
 * - Futuras contratadas a vencer
 */
export async function obterParcelasContratoCliente(
  clienteId: string,
): Promise<QuadroParcelasContrato> {
  const { data: mensalidades, error: mensErr } = await supabase
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
      created_at,
      updated_at
    `,
    )
    .eq("cliente_id", clienteId)
    .order("ano_referencia", { ascending: true })
    .order("mes_referencia", { ascending: true });

  let lista = mensalidades || [];

  if (mensErr) {
    const { data: mensFb } = await supabase
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
        created_at,
        updated_at
      `,
      )
      .eq("cliente_id", clienteId)
      .order("ano_referencia", { ascending: true })
      .order("mes_referencia", { ascending: true });
    lista = (mensFb || []) as any;
  }

  // Auto-cura preventiva:
  // 1. Se o cliente for cortesia (valor_mensalidade === 0) e houver faturas com valor residual > 0;
  // 2. Ou se o cliente foi cadastrado apos o vencimento do mes e ficou com fatura vencida indevida naquele mes.
  try {
    const { data: cliInfo } = await supabase
      .from("clientes")
      .select("id, dia_vencimento, valor_mensalidade, created_at")
      .eq("id", clienteId)
      .maybeSingle();

    if (cliInfo) {
      const dataCriacaoCli = cliInfo.created_at ? new Date(cliInfo.created_at) : new Date();
      const diaCriacao = dataCriacaoCli.getDate();
      const diaVencCli = cliInfo.dia_vencimento || 10;
      const mesCriacao = dataCriacaoCli.getMonth() + 1;
      const anoCriacao = dataCriacaoCli.getFullYear();

      const isCortesia = Number(cliInfo.valor_mensalidade || 0) === 0;

      const temPendenciasComValor =
        isCortesia && lista.some((m: any) => m.status !== "pago" && Number(m.valor || 0) > 0);

      const faturaInvalidaMesCriacao =
        !isCortesia &&
        lista.some(
          (m: any) =>
            m.mes_referencia === mesCriacao &&
            m.ano_referencia === anoCriacao &&
            m.status !== "pago" &&
            diaCriacao > diaVencCli,
        );

      if (temPendenciasComValor || faturaInvalidaMesCriacao) {
        await gerarParcelasContratoCliente(clienteId, {
          valorMensalidade: cliInfo.valor_mensalidade,
          diaVencimento: diaVencCli,
          mesesContrato: 12,
          dataInicioContrato: cliInfo.created_at ? cliInfo.created_at.split("T")[0] : undefined,
        });

        const { data: recarregadas } = await supabase
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
            created_at,
            updated_at
          `,
          )
          .eq("cliente_id", clienteId)
          .order("ano_referencia", { ascending: true })
          .order("mes_referencia", { ascending: true });

        if (recarregadas && recarregadas.length > 0) {
          lista = recarregadas;
        }
      }
    }
  } catch (errAutoHeal) {
    console.warn("Aviso na auto-cura de parcelas:", errAutoHeal);
  }

  // Se a lista estiver vazia, auto-gera as parcelas do contrato no banco imediatamente
  if (lista.length === 0) {
    try {
      await gerarParcelasContratoCliente(clienteId);
      const { data: recarregadas } = await supabase
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
          created_at,
          updated_at
        `,
        )
        .eq("cliente_id", clienteId)
        .order("ano_referencia", { ascending: true })
        .order("mes_referencia", { ascending: true });

      if (recarregadas && recarregadas.length > 0) {
        lista = recarregadas;
      }
    } catch (e) {
      console.warn("Auto-geracao de parcelas no banco disparou aviso:", e);
    }
  }

  // Se ainda estiver vazia (ex: restrição transitória de escrita ou RLS), projeta as 12 parcelas do contrato
  if (lista.length === 0) {
    try {
      const { data: cli } = await supabase
        .from("clientes")
        .select("id, dia_vencimento, valor_mensalidade, created_at")
        .eq("id", clienteId)
        .maybeSingle();

      if (cli) {
        const mesesTotal = 12;
        const diaVenc = cli.dia_vencimento || 10;
        const valor =
          cli.valor_mensalidade !== null && cli.valor_mensalidade !== undefined
            ? Number(cli.valor_mensalidade)
            : 79.9;
        const dataCriacao = cli.created_at ? new Date(cli.created_at) : new Date();
        const hojeRef = new Date();
        hojeRef.setHours(0, 0, 0, 0);

        const diaInicio = dataCriacao.getDate();
        const mesInicio = dataCriacao.getMonth() + 1;
        const anoInicio = dataCriacao.getFullYear();
        const totalDiasMesInicio = new Date(anoInicio, mesInicio, 0).getDate();
        const aposPrazoMesAtual = diaInicio > diaVenc;

        const diasRestantesMesAtual = Math.max(1, totalDiasMesInicio - diaInicio + 1);
        const proRataMesAtual =
          aposPrazoMesAtual && valor > 0
            ? Number(((valor / totalDiasMesInicio) * diasRestantesMesAtual).toFixed(2))
            : 0;

        const offsetInicial = aposPrazoMesAtual ? 1 : 0;

        const projetadas = [];
        for (let i = 0; i < mesesTotal; i++) {
          const mesOffset = offsetInicial + i;
          const dRef = new Date(dataCriacao);
          dRef.setMonth(dRef.getMonth() + mesOffset);
          const mes = dRef.getMonth() + 1;
          const ano = dRef.getFullYear();
          const ultimoDiaMes = new Date(ano, mes, 0).getDate();
          const diaFinal = Math.min(diaVenc, ultimoDiaMes);
          const dataVencStr = `${ano}-${String(mes).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
          const dVenc = new Date(ano, mes - 1, diaFinal);
          dVenc.setHours(0, 0, 0, 0);

          let valorFinal = valor;
          if (i === 0 && proRataMesAtual > 0) {
            valorFinal = Number((valor + proRataMesAtual).toFixed(2));
          }

          let status: "pendente" | "pago" | "vencido" = "pendente";
          if (valorFinal === 0) {
            status = "pago";
          } else if (dVenc < hojeRef) {
            status = "vencido";
          }

          projetadas.push({
            id: `proj_${clienteId}_${ano}_${mes}`,
            cliente_id: clienteId,
            mes_referencia: mes,
            ano_referencia: ano,
            numero_parcela: i + 1,
            total_parcelas: mesesTotal,
            valor: valorFinal,
            data_vencimento: dataVencStr,
            status: status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        lista = projetadas;
      }
    } catch (errProj) {
      console.warn("Falha na projecao de parcelas:", errProj);
    }
  }

  const listaNumerada = enriquecerNumeracaoParcelasMensalidades(lista as any[]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const parcelasFormatadas: ParcelaContratoItem[] = listaNumerada.map((m: any) => {
    const vOrig = Number(m.valor) || 0;
    const encargos = calcularEncargosAtraso(vOrig, m.data_vencimento, hoje);

    const [anoV, mesV, diaV] = m.data_vencimento.split("T")[0].split("-").map(Number);
    const dataVenc = new Date(anoV, mesV - 1, diaV);
    dataVenc.setHours(0, 0, 0, 0);

    const isPago = m.status === "pago";
    const isVencido = m.status === "vencido" || (!isPago && dataVenc < hoje);

    let tipo: ParcelaContratoItem["tipo"] = "futura";
    let dataPag: string | undefined;
    let vPago: number | undefined;

    if (isPago) {
      const dataUpdate = m.updated_at ? new Date(m.updated_at) : undefined;
      if (dataUpdate && dataUpdate > dataVenc) {
        // Paga após a data de vencimento
        tipo = "atrasada_paga";
        dataPag = dataUpdate.toISOString().split("T")[0];
        vPago = vOrig;
      } else {
        tipo = "quitada";
        dataPag = dataUpdate ? dataUpdate.toISOString().split("T")[0] : m.data_vencimento;
        vPago = vOrig;
      }
    } else if (isVencido) {
      tipo = "atrasada";
    } else {
      tipo = "futura";
    }

    return {
      id: m.id,
      clienteId: m.cliente_id,
      mesReferencia: m.mes_referencia,
      anoReferencia: m.ano_referencia,
      numeroParcela: m.numero_parcela ?? undefined,
      totalParcelas: m.total_parcelas ?? undefined,
      dataVencimento: m.data_vencimento,
      valorOriginal: vOrig,
      status: m.status,
      tipo,
      dataPagamento: dataPag,
      valorPago: vPago,
      diasAtraso: encargos.diasAtraso,
      valorMulta: encargos.valorMulta,
      valorJuros: encargos.valorJuros,
      valorAtualizadoHoje: encargos.valorTotalAtualizado,
    };
  });

  const quitadas = parcelasFormatadas.filter((p) => p.tipo === "quitada");
  const atrasadas = parcelasFormatadas.filter((p) => p.tipo === "atrasada");
  const atrasadasPagas = parcelasFormatadas.filter((p) => p.tipo === "atrasada_paga");
  const futuras = parcelasFormatadas.filter((p) => p.tipo === "futura");

  const totalGeralContrato = parcelasFormatadas.reduce((acc, p) => acc + p.valorOriginal, 0);
  const totalQuitado = [...quitadas, ...atrasadasPagas].reduce(
    (acc, p) => acc + (p.valorPago || p.valorOriginal),
    0,
  );
  const totalAtrasadoOriginal = atrasadas.reduce((acc, p) => acc + p.valorOriginal, 0);
  const totalAtrasadoAtualizadoHoje = atrasadas.reduce((acc, p) => acc + p.valorAtualizadoHoje, 0);
  const totalFuturoAVencer = futuras.reduce((acc, p) => acc + p.valorOriginal, 0);

  return {
    parcelas: parcelasFormatadas,
    quitadas,
    atrasadas,
    atrasadasPagas,
    futuras,
    totalGeralContrato,
    totalQuitado,
    totalAtrasadoOriginal,
    totalAtrasadoAtualizadoHoje,
    totalFuturoAVencer,
  };
}

/**
 * Renova o contrato do cliente pelo mesmo prazo, prazo informado ou continuo mes a mes
 */
export async function renovarContratoCliente(dados: {
  clienteId: string;
  tipoRenovacao: "mesma_vigencia" | "tempo_personalizado" | "mensal_ate_cancelamento";
  mesesAdicionais?: number;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "admin_renovar_contrato_cliente",
      {
        p_cliente_id: dados.clienteId,
        p_tipo_renovacao: dados.tipoRenovacao,
        p_meses_adicionais: dados.mesesAdicionais || null,
      },
    );

    if (!rpcError && rpcData?.success) {
      return { success: true, message: "Contrato renovado e novas parcelas geradas com sucesso!" };
    }

    // Fallback resiliente caso a RPC falhe
    const { data: cliente, error: cliErr } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", dados.clienteId)
      .single();

    if (cliErr || !cliente) {
      throw new Error("Cliente nao encontrado para renovacao.");
    }

    let mesesRenovar = cliente.meses_contrato || 12;
    if (dados.tipoRenovacao === "tempo_personalizado") {
      mesesRenovar = Math.max(1, dados.mesesAdicionais || cliente.meses_renovacao || 12);
    } else if (dados.tipoRenovacao === "mensal_ate_cancelamento") {
      mesesRenovar = 12;
    }

    const hoje = new Date();
    const dataFimAtual = cliente.data_fim_contrato
      ? new Date(cliente.data_fim_contrato + "T12:00:00")
      : hoje;
    const novaDataInicio = dataFimAtual > hoje ? dataFimAtual : hoje;

    const novaDataFim = new Date(novaDataInicio);
    novaDataFim.setMonth(novaDataFim.getMonth() + mesesRenovar);

    const inicioStr = novaDataInicio.toISOString().split("T")[0];
    const fimStr = novaDataFim.toISOString().split("T")[0];

    await supabase
      .from("clientes")
      .update({
        meses_contrato: mesesRenovar,
        data_inicio_contrato: inicioStr,
        data_fim_contrato: fimStr,
        tipo_renovacao: dados.tipoRenovacao,
        meses_renovacao: dados.mesesAdicionais || mesesRenovar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dados.clienteId);

    await gerarParcelasContratoCliente(dados.clienteId);

    return { success: true, message: "Contrato renovado e parcelas geradas com sucesso!" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Falha ao renovar contrato.",
    };
  }
}

export async function instaladorDefinirAgendamento(
  clienteId: string,
  data: string,
  hora: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: res, error } = await supabase.rpc("instalador_definir_agendamento", {
      p_cliente_id: clienteId,
      p_data: data,
      p_hora: hora,
    });

    if (error) throw error;
    return res as { success: boolean; message: string };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Erro ao definir agendamento de instalação.",
    };
  }
}

export async function obterAgendamentoCliente(
  userId: string,
  email?: string,
  clienteId?: string,
): Promise<AgendamentoClienteInfo | null> {
  try {
    let query = supabase.from("clientes").select(
      `
        id,
        nome_razao_social,
        telefone,
        status,
        status_agendamento,
        data_agendamento,
        hora_agendamento,
        instalador_id,
        instalador:instalador_id (id, nome, telefone, endereco_instalacao)
      `,
    );

    if (clienteId) {
      query = query.eq("id", clienteId);
    } else if (userId) {
      query = query.eq("user_id", userId);
    } else if (email) {
      query = query.ilike("email", email.trim());
    }

    let { data, error } = await query.maybeSingle();

    // Fallback por email se nao localizou por user_id
    if (!data && email) {
      const fb = await supabase
        .from("clientes")
        .select(
          `
          id,
          nome_razao_social,
          telefone,
          status,
          status_agendamento,
          data_agendamento,
          hora_agendamento,
          instalador_id,
          instalador:instalador_id (id, nome, telefone, endereco_instalacao)
        `,
        )
        .ilike("email", email.trim())
        .maybeSingle();
      data = fb.data;
      error = fb.error;
    }

    if (error || !data) return null;

    let statusAgendamento = data.status_agendamento;
    let instalador = data.instalador as any;
    let instaladorId = data.instalador_id;

    // Se cliente tiver status aguardando_instalacao
    if (data.status === "aguardando_instalacao" && !statusAgendamento) {
      statusAgendamento = "aguardando_agendamento";
    }

    if (!instalador && instaladorId) {
      const { data: profInst } = await supabase
        .from("profiles")
        .select("id, nome, telefone, endereco_instalacao")
        .eq("id", instaladorId)
        .maybeSingle();
      if (profInst) {
        instalador = profInst;
      }
    }

    // Verificar na tabela de instalacoes se ha instalacao pendente do cliente
    try {
      const { data: instPendente } = await supabase
        .from("instalacoes")
        .select(
          `
          id,
          status,
          instalador_id,
          instalador:instalador_id (id, nome, telefone, endereco_instalacao)
        `,
        )
        .eq("cliente_id", data.id)
        .neq("status", "concluida")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instPendente) {
        if (!statusAgendamento || statusAgendamento === "concluido") {
          statusAgendamento = "aguardando_agendamento";
        }
        if (!instaladorId && instPendente.instalador_id) {
          instaladorId = instPendente.instalador_id;
        }
        if (!instalador) {
          if (instPendente.instalador) {
            instalador = instPendente.instalador;
          } else if (instPendente.instalador_id) {
            const { data: profInstFallback } = await supabase
              .from("profiles")
              .select("id, nome, telefone, endereco_instalacao")
              .eq("id", instPendente.instalador_id)
              .maybeSingle();
            if (profInstFallback) {
              instalador = profInstFallback;
            }
          }
        }
      }
    } catch {
      // Silencioso em caso de isolamento RLS estrito
    }

    // Verificar na tabela de veiculos se ha veiculo inativo ou sem rastreador
    try {
      const { data: veicsPendentes } = await supabase
        .from("veiculos")
        .select("id, ativo, rastreador_id")
        .eq("cliente_id", data.id)
        .or("ativo.eq.false,rastreador_id.is.null")
        .limit(1);

      if (veicsPendentes && veicsPendentes.length > 0) {
        if (!statusAgendamento || statusAgendamento === "concluido") {
          statusAgendamento = "aguardando_agendamento";
        }
      }
    } catch {
      // Silencioso
    }

    // Se nao tiver nenhuma pendencia de agendamento, retorna null
    if (!statusAgendamento || statusAgendamento === "concluido") {
      return null;
    }

    return {
      cliente_id: data.id,
      cliente_nome: data.nome_razao_social,
      cliente_telefone: data.telefone || null,
      status_cliente: data.status,
      status_agendamento: statusAgendamento,
      data_agendamento: data.data_agendamento || null,
      hora_agendamento: data.hora_agendamento || null,
      instalador_id: instaladorId || null,
      instalador_nome: instalador?.nome || null,
      instalador_endereco: instalador?.endereco_instalacao || null,
      instalador_telefone: instalador?.telefone || null,
    };
  } catch (err) {
    console.error("Erro ao obter agendamento do cliente:", err);
    return null;
  }
}

export async function clientePossuiVeiculosAtivos(
  userId?: string,
  clienteId?: string,
): Promise<boolean> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return true;
    }

    // 1. Prioridade máxima: Rota segura de backend com Service Role (/api/clientes/meu-status)
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const res = await fetch("/api/clientes/meu-status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            if (
              json.temVeiculosAtivos ||
              json.instaladoDiretamente ||
              !json.bloquearPorAguardandoInstalacao
            ) {
              return true;
            }
            if (json.bloquearPorAguardandoInstalacao) {
              return false;
            }
          }
        }
      }
    } catch {
      /* fallback */
    }

    // 2. Fallback via /api/veiculos/monitor (Service Role)
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const res = await fetch("/api/veiculos/monitor", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.veiculos) && json.veiculos.length > 0) {
            return true;
          }
        }
      }
    } catch {
      /* fallback */
    }

    let targetClienteId = clienteId;

    // 3. Se não recebeu cliente_id diretamente, busca a partir do user_id
    if (!targetClienteId && userId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id, status, status_agendamento")
        .eq("user_id", userId)
        .maybeSingle();

      if (!cliente) return false;

      // Veículo ou cliente ativado diretamente
      if (cliente.status === "ativo" && cliente.status_agendamento === "concluido") {
        return true;
      }

      // Se o status do cliente for explicitamente aguardando_instalacao, nao possui veiculos ativos
      if (cliente.status === "aguardando_instalacao") {
        return false;
      }

      targetClienteId = cliente.id;
    }

    if (!targetClienteId) return false;

    // 4. Verificar se ha veiculos ativos com rastreador instalado para este cliente
    const { data: veiculos, error } = await supabase
      .from("veiculos")
      .select("id, ativo, rastreador_id")
      .eq("cliente_id", targetClienteId)
      .eq("ativo", true);

    if (error || !veiculos || veiculos.length === 0) {
      return false;
    }

    return veiculos.some((v) => Boolean(v.ativo) && Boolean(v.rastreador_id));
  } catch {
    return false;
  }
}

/**
 * Verifica de forma factual e auditada se o cliente possui algum veiculo ou esteira
 * pendente de instalacao, agendamento ou ativacao operacional.
 */
export async function clientePossuiPendenciaInstalacaoOuAtivacao(
  userId?: string,
  clienteId?: string,
): Promise<boolean> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return false;
    }

    // 1. Prioridade máxima: Rota segura de backend com Service Role
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const res = await fetch("/api/clientes/meu-status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            return Boolean(json.bloquearPorAguardandoInstalacao);
          }
        }
      }
    } catch {
      /* fallback */
    }

    let targetClienteId = clienteId;

    // 1. Se nao recebeu cliente_id diretamente, busca a partir do user_id
    if (!targetClienteId && userId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id, status")
        .eq("user_id", userId)
        .maybeSingle();

      if (!cliente) return false;

      if (cliente.status === "aguardando_instalacao") {
        return true;
      }

      targetClienteId = cliente.id;
    }

    if (!targetClienteId) return false;

    // 2. Verificar status cadastral do cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("status")
      .eq("id", targetClienteId)
      .maybeSingle();

    if (cliente?.status === "aguardando_instalacao") {
      return true;
    }

    // 3. Verificar se ha registro de onboarding em andamento (etapa nao homologada pelo operador)
    const { data: onboarding } = await supabase
      .from("onboarding_etapas_cliente")
      .select("ativacao_operador_concluida")
      .eq("cliente_id", targetClienteId)
      .maybeSingle();

    if (onboarding && onboarding.ativacao_operador_concluida === false) {
      return true;
    }

    // 4. Verificar se ha ordens de instalacao em andamento ou pendentes
    const { data: instalacoes } = await supabase
      .from("instalacoes")
      .select("id, status")
      .eq("cliente_id", targetClienteId)
      .neq("status", "concluida");

    if (instalacoes && instalacoes.length > 0) {
      return true;
    }

    // 5. Verificar se possui veiculos e se algum esta pendente de instalacao/aprovacao/rastreador
    // A tabela veiculos possui status_operacional e nao status
    const { data: veiculos, error: errVeiculos } = await supabase
      .from("veiculos")
      .select("id, ativo, rastreador_id, pendente_aprovacao_operador, status_operacional")
      .eq("cliente_id", targetClienteId);

    if (errVeiculos) {
      // Fallback resiliente com colunas essenciais
      const { data: veiculosBasic } = await supabase
        .from("veiculos")
        .select("id, ativo, rastreador_id")
        .eq("cliente_id", targetClienteId);

      if (!veiculosBasic || veiculosBasic.length === 0) {
        return false;
      }

      return veiculosBasic.some((v) => !v.ativo || !v.rastreador_id);
    }

    if (!veiculos || veiculos.length === 0) {
      // Cliente sem veiculos cadastrados
      return false;
    }

    const temVeiculoPendente = veiculos.some(
      (v: any) =>
        v.ativo === false ||
        !v.rastreador_id ||
        v.pendente_aprovacao_operador === true ||
        v.status_operacional === "aguardando_instalacao",
    );

    if (temVeiculoPendente) {
      return true;
    }

    // Cliente com todos os veiculos ativos e nenhuma ordem de instalacao pendente
    return false;
  } catch {
    return false;
  }
}

export async function carregarVeiculosDoCliente(clienteId: string): Promise<
  {
    id: string;
    placa: string;
    marca_modelo: string;
    ano?: number | null;
    cor?: string | null;
    ativo: boolean;
    bloqueado: boolean;
    tipo_veiculo?: string | null;
    rastreador_id?: string | null;
  }[]
> {
  try {
    // REGRA IMPERIOSA: Modo Degustacao opera com frota simulada de 3 veiculos ativos isolados em sandbox
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      const veiculosDeg = obterVeiculosDegustacaoMaster();
      return veiculosDeg.map((v) => ({
        id: v.id,
        placa: v.placa,
        marca_modelo: v.marca_modelo,
        ano: v.ano || 2024,
        cor: v.cor || "Prata",
        tipo_veiculo: v.tipo_veiculo || "carro",
        ativo: true,
        bloqueado: Boolean(v.bloqueado),
        rastreador_id: v.rastreador_id,
      }));
    }

    const { data, error } = await supabase
      .from("veiculos")
      .select("id, placa, marca_modelo, ano, cor, tipo_veiculo, ativo, bloqueado, rastreador_id")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    let rows = data;
    if (error || !data) {
      const resFallback = await supabase
        .from("veiculos")
        .select("id, placa, marca_modelo, ano, cor, ativo, bloqueado, rastreador_id")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (resFallback.error || !resFallback.data) return [];
      rows = resFallback.data;
    }

    // REGRA IMPERIOSA: Perfil S.adm Auditor possui disponibilizado ÚNICA E EXCLUSIVAMENTE o veículo do usuário (AXH0E44)
    if (
      sessaoAtual?.isAuditor ||
      sessaoAtual?.isSuperAdminAuditor ||
      sessaoAtual?.role === "superadmin_auditor"
    ) {
      rows = (rows || []).filter((v: any) => {
        const placa = (v.placa || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        return placa === "AXH0E44" || v.id === "3f2e1d2b-ca96-420e-88a5-c33fd98b689d";
      });
    }
    return rows.map((v: any) => ({
      id: v.id,
      placa: v.placa,
      marca_modelo: v.marca_modelo,
      ano: v.ano,
      cor: v.cor,
      tipo_veiculo: v.tipo_veiculo || "carro",
      ativo: Boolean(v.ativo),
      bloqueado: Boolean(v.bloqueado),
      rastreador_id: v.rastreador_id,
    }));
  } catch {
    return [];
  }
}

export async function bloquearDesbloquearVeiculo(
  veiculoId: string,
  bloquear: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    if (
      sessaoAtual?.isAuditor ||
      sessaoAtual?.isSuperAdminAuditor ||
      sessaoAtual?.role === "superadmin_auditor" ||
      sessaoAtual?.isReadOnly
    ) {
      return {
        success: false,
        message:
          "Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Proibido realizar bloqueio de veículos.",
      };
    }
    const { data, error } = await supabase.rpc("admin_bloquear_desbloquear_veiculo", {
      p_veiculo_id: veiculoId,
      p_bloquear: bloquear,
    });

    if (!error && data) {
      const res = data as any;
      return { success: true, message: res.mensagem || "Status de bloqueio atualizado." };
    }

    // Fallback resiliente direto na tabela veiculos
    const { error: errUpdate } = await supabase
      .from("veiculos")
      .update({
        bloqueado: bloquear,
        updated_at: new Date().toISOString(),
      })
      .eq("id", veiculoId);

    if (errUpdate) throw errUpdate;

    return {
      success: true,
      message: bloquear ? "Veículo bloqueado com sucesso." : "Veículo desbloqueado com sucesso.",
    };
  } catch (err: any) {
    console.error("Erro ao alterar bloqueio do veículo:", err);
    return {
      success: false,
      message: err?.message || "Falha ao alterar status de bloqueio do veículo.",
    };
  }
}

export async function editarVeiculo(
  veiculoId: string,
  dados: {
    placa: string;
    marca_modelo: string;
    ano?: number | null;
    cor?: string | null;
    tipo_veiculo?: string | null;
    instaladorId?: string | null;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    const placaLimpa = dados.placa
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!placaLimpa) {
      return { success: false, message: "A placa do veículo é obrigatória." };
    }
    if (!dados.marca_modelo.trim()) {
      return { success: false, message: "A marca e modelo do veículo são obrigatórios." };
    }

    const tipoSanitizado = (dados.tipo_veiculo || "carro").toLowerCase();

    // Atualiza tabela veiculos removendo pendencia de aprovacao
    await supabase
      .from("veiculos")
      .update({
        placa: placaLimpa,
        marca_modelo: dados.marca_modelo.trim(),
        ano: dados.ano || null,
        cor: dados.cor?.trim() || null,
        tipo_veiculo: tipoSanitizado,
        pendente_aprovacao_operador: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", veiculoId);

    // Se um instalador foi atribuído (ou desvinculado) deste veículo específico, atualiza a ordem em instalacoes
    if (dados.instaladorId !== undefined) {
      const novoInstaladorId = dados.instaladorId || null;
      await supabase
        .from("instalacoes")
        .update({
          instalador_id: novoInstaladorId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("veiculo_id", veiculoId)
        .neq("status", "concluida");
    }

    return {
      success: true,
      message: "Dados do veículo e atribuição técnica atualizados com sucesso.",
    };
  } catch (err: any) {
    console.error("Erro ao editar veículo:", err);
    return {
      success: false,
      message: err?.message || "Falha ao atualizar dados do veículo.",
    };
  }
}

export async function excluirVeiculo(
  veiculoId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_excluir_veiculo", {
      p_veiculo_id: veiculoId,
    });

    if (!error && data) {
      const res = data as any;
      return { success: true, message: res.mensagem || "Veículo excluído com sucesso." };
    }

    // Fallback resiliente: desvincula de atendimentos, instalacoes e rastreadores, e deleta
    await supabase.from("atendimentos").update({ veiculo_id: null }).eq("veiculo_id", veiculoId);
    await supabase.from("instalacoes").update({ veiculo_id: null }).eq("veiculo_id", veiculoId);
    await supabase.from("rastreadores").update({ veiculo_id: null }).eq("veiculo_id", veiculoId);

    const { error: errDelete } = await supabase.from("veiculos").delete().eq("id", veiculoId);

    if (errDelete) throw errDelete;

    return {
      success: true,
      message: "Veículo excluído da frota com sucesso.",
    };
  } catch (err: any) {
    console.error("Erro ao excluir veículo:", err);
    let msg = err?.message || "Falha ao excluir veículo.";
    if (
      msg.includes("schema cache") ||
      msg.includes("relation") ||
      msg.includes("column") ||
      msg.includes("PGRST")
    ) {
      msg =
        "Não foi possível excluir o veículo devido a uma instabilidade temporária. Tente novamente.";
    }
    return {
      success: false,
      message: msg,
    };
  }
}

export async function excluirCliente(
  clienteId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_excluir_cliente", {
      p_cliente_id: clienteId,
    });

    if (!error && data) {
      const res = data as any;
      return {
        success: true,
        message: res.mensagem || "Cliente e vínculos excluídos com sucesso.",
      };
    }

    if (error) throw error;

    return {
      success: true,
      message: "Cliente excluído com sucesso.",
    };
  } catch (err: any) {
    console.error("Erro ao excluir cliente:", err);
    let msg = err?.message || "Falha ao excluir cliente.";
    if (msg.includes("SuperADM")) {
      msg = "Ação não permitida: conta SuperADM é imutável e blindada contra exclusão.";
    } else if (msg.includes("Acesso negado")) {
      msg = "Acesso negado: apenas SuperADM e Administradores podem excluir clientes.";
    } else if (msg.includes("não encontrado")) {
      msg = "Cliente não encontrado ou já excluído.";
    } else if (
      msg.includes("schema cache") ||
      msg.includes("relation") ||
      msg.includes("column") ||
      msg.includes("PGRST") ||
      msg.includes("does not exist")
    ) {
      msg =
        "Não foi possível concluir a exclusão do cliente no momento. Tente novamente ou contate o administrador.";
    }
    return {
      success: false,
      message: msg,
    };
  }
}

export async function gerarPendenciaInstalacaoCliente(
  clienteId: string,
  instaladorId?: string,
): Promise<{ success: boolean; message: string; clienteAtualizado?: any }> {
  try {
    const { data, error } = await supabase.rpc("admin_gerar_pendencia_instalacao_cliente", {
      p_cliente_id: clienteId,
      p_instalador_id: instaladorId || null,
    });

    if (!error && data) {
      const res = data as any;
      const { data: cData } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", clienteId)
        .maybeSingle();

      return {
        success: true,
        message: res.mensagem || "Pendência gerada com sucesso.",
        clienteAtualizado: cData || undefined,
      };
    }

    // Fallback resiliente
    const payloadUpdate: any = {
      status: "aguardando_instalacao",
      status_agendamento: "aguardando_agendamento",
      data_agendamento: null,
      hora_agendamento: null,
      updated_at: new Date().toISOString(),
    };
    if (instaladorId) {
      payloadUpdate.instalador_id = instaladorId;
    }

    const { data: updatedCliente, error: errCliente } = await supabase
      .from("clientes")
      .update(payloadUpdate)
      .eq("id", clienteId)
      .select()
      .maybeSingle();

    if (errCliente) throw errCliente;

    return {
      success: true,
      message: "Pendência de instalação gerada com sucesso para o instalador.",
      clienteAtualizado: updatedCliente || undefined,
    };
  } catch (err: any) {
    console.error("Erro ao gerar pendência de instalação:", err);
    return {
      success: false,
      message: err?.message || "Falha ao gerar pendência de instalação.",
    };
  }
}

export async function cadastrarNovosVeiculosCliente(
  clienteId: string,
  veiculos: {
    placa: string;
    marca_modelo: string;
    ano?: number;
    cor?: string;
    tipo_veiculo?: string;
  }[],
  instaladorId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!veiculos || veiculos.length === 0) {
      return { success: true, message: "Nenhum veículo para adicionar." };
    }

    for (const v of veiculos) {
      const placaLimpa = v.placa
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (!placaLimpa) continue;

      const { error: errVeiculo } = await supabase.from("veiculos").insert({
        cliente_id: clienteId,
        placa: placaLimpa,
        marca_modelo: v.marca_modelo.trim(),
        ano: v.ano || null,
        cor: v.cor?.trim() || null,
        tipo_veiculo:
          (v.tipo_veiculo || "carro").trim().toLowerCase() === "quadriciclo"
            ? "quadriciculo"
            : (v.tipo_veiculo || "carro").trim().toLowerCase(),
        ativo: false,
      });

      if (errVeiculo) {
        console.warn("Aviso ao inserir veículo adicional:", errVeiculo);
      }
    }

    if (instaladorId) {
      await supabase
        .from("clientes")
        .update({
          instalador_id: instaladorId,
          status_agendamento: "aguardando_agendamento",
        })
        .eq("id", clienteId);
    }

    return {
      success: true,
      message: `${veiculos.length} veículo(s) cadastrado(s) para agendamento com sucesso!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Falha ao registrar novos veículos do cliente.",
    };
  }
}

export async function provisionarChipRastreadorEInstalacao(dados: {
  clienteId: string;
  instaladorId?: string;
  placa?: string;
  marcaModelo?: string;
  ano?: number;
  cor?: string;
  tipoVeiculo?: string;
  rastreadorImei?: string;
  rastreadorModelo?: string;
  chipOperadora?: string;
  chipIccid?: string;
  chipLinha?: string;
  horimetroInicial?: number;
  regraHorimetro?: string;
  chassi?: string;
  kitId?: string;
}): Promise<{ success: boolean; message: string; instalacaoId?: string }> {
  try {
    let chipId: string | null = null;
    const iccidLimpo = dados.chipIccid ? dados.chipIccid.trim().replace(/[^0-9]/g, "") : null;
    const linhaLimpa = dados.chipLinha?.trim() || null;

    if (iccidLimpo) {
      const { data: chipExistente } = await supabase
        .from("chips")
        .select("id, linha, operadora")
        .eq("iccid", iccidLimpo)
        .maybeSingle();

      if (chipExistente?.id) {
        chipId = chipExistente.id;
        const updateChip: Record<string, any> = {
          operadora: dados.chipOperadora?.trim() || chipExistente.operadora || "Vivo",
        };
        if (linhaLimpa) {
          updateChip.linha = linhaLimpa;
        }
        await supabase.from("chips").update(updateChip).eq("id", chipId);
      } else {
        const { data: novoChip, error: errChip } = await supabase
          .from("chips")
          .insert({
            iccid: iccidLimpo,
            operadora: dados.chipOperadora?.trim() || "Vivo",
            linha: linhaLimpa,
            status: "ativo",
          })
          .select("id")
          .single();

        if (!errChip && novoChip) {
          chipId = novoChip.id;
        }
      }
    }

    let rastreadorId: string | null = dados.kitId || null;
    const imeiLimpo = dados.rastreadorImei
      ? dados.rastreadorImei.trim().replace(/[^0-9]/g, "")
      : null;

    if (imeiLimpo) {
      const { data: rastreadorExistente } = await supabase
        .from("rastreadores")
        .select("id")
        .eq("imei", imeiLimpo)
        .maybeSingle();

      if (rastreadorExistente?.id) {
        rastreadorId = rastreadorExistente.id;
        const updateRastreador: any = {
          modelo: dados.rastreadorModelo?.trim() || "J16 4G",
        };
        if (chipId) updateRastreador.chip_id = chipId;

        // Tenta atualizar com status 'em_instalacao', com fallback seguro se o enum ainda não suportar
        const { error: errStatus } = await supabase
          .from("rastreadores")
          .update({ ...updateRastreador, status: "em_instalacao" })
          .eq("id", rastreadorId);

        if (errStatus) {
          await supabase.from("rastreadores").update(updateRastreador).eq("id", rastreadorId);
        }
      } else {
        // Inserção com fallback seguro
        const resRastreador = await supabase
          .from("rastreadores")
          .insert({
            imei: imeiLimpo,
            modelo: dados.rastreadorModelo?.trim() || "J16 4G",
            chip_id: chipId,
            status: "estoque",
          })
          .select("id")
          .single();

        let novoRastreador = resRastreador.data;
        const errRastreador = resRastreador.error;

        if (errRastreador) {
          const resFallback = await supabase
            .from("rastreadores")
            .insert({
              imei: imeiLimpo,
              modelo: dados.rastreadorModelo?.trim() || "J16 4G",
              chip_id: chipId,
              status: "estoque",
            })
            .select("id")
            .single();
          novoRastreador = resFallback.data;
        }

        if (novoRastreador) {
          rastreadorId = novoRastreador.id;
        }
      }
    } else if (rastreadorId) {
      const updateRastreador: any = {};
      if (chipId) updateRastreador.chip_id = chipId;
      if (dados.rastreadorModelo?.trim()) {
        updateRastreador.modelo = dados.rastreadorModelo.trim();
      }
      const { error: errStatus } = await supabase
        .from("rastreadores")
        .update({ ...updateRastreador, status: "em_instalacao" })
        .eq("id", rastreadorId);
      if (errStatus && Object.keys(updateRastreador).length > 0) {
        await supabase.from("rastreadores").update(updateRastreador).eq("id", rastreadorId);
      }
    }

    if (rastreadorId) {
      try {
        await supabase
          .from("clientes")
          .update({ kit_determinado_id: rastreadorId } as any)
          .eq("id", dados.clienteId);
      } catch {
        // Coluna opcional caso pendente
      }
    }

    // Buscar ou associar ao veículo
    let veiculoId: string | null = null;
    const { data: veiculosCliente } = await supabase
      .from("veiculos")
      .select("id, placa, marca_modelo")
      .eq("cliente_id", dados.clienteId)
      .limit(1);

    const tipoFinal = (dados.tipoVeiculo || "carro").toLowerCase();

    if (veiculosCliente && veiculosCliente.length > 0) {
      veiculoId = veiculosCliente[0].id;
      const updateData: any = {};
      if (rastreadorId) updateData.rastreador_id = rastreadorId;
      if (imeiLimpo) updateData.rastreador_imei = imeiLimpo;
      if (dados.tipoVeiculo) updateData.tipo_veiculo = tipoFinal;
      if (dados.placa && dados.placa.trim() && dados.placa.trim().toUpperCase() !== "A DEFINIR") {
        updateData.placa = dados.placa
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
      }
      if (dados.marcaModelo && dados.marcaModelo.trim()) {
        updateData.marca_modelo = dados.marcaModelo.trim();
      }
      if (dados.ano !== undefined && dados.ano !== null) {
        updateData.ano = dados.ano;
      }
      if (dados.cor?.trim()) {
        updateData.cor = dados.cor.trim();
      }
      if (dados.horimetroInicial !== undefined) {
        updateData.horimetro_horas = Number(dados.horimetroInicial) || 0;
      }
      if (dados.regraHorimetro) {
        updateData.horimetro_modo = dados.regraHorimetro;
      }
      if (dados.chassi?.trim()) {
        updateData.chassi = dados.chassi.trim().toUpperCase();
      }
      if (Object.keys(updateData).length > 0) {
        await supabase.from("veiculos").update(updateData).eq("id", veiculoId);
      }
    } else if ((dados.placa && dados.placa.trim()) || imeiLimpo || dados.chassi) {
      const rawChassi = dados.chassi?.trim().toUpperCase() || null;
      const sufixoChassi = rawChassi && rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
      const isSemPlaca =
        tipoFinal === "maquina" ||
        tipoFinal === "trator" ||
        tipoFinal === "equipamento" ||
        tipoFinal === "moto_eletrica";

      const placaFormatada =
        dados.placa && dados.placa.trim() && dados.placa.trim().toUpperCase() !== "A DEFINIR"
          ? dados.placa
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
          : isSemPlaca && sufixoChassi
            ? sufixoChassi
            : isSemPlaca
              ? "SEM PLACA"
              : "A DEFINIR";

      const { data: novoVeiculo } = await supabase
        .from("veiculos")
        .insert({
          cliente_id: dados.clienteId,
          placa: placaFormatada,
          chassi: rawChassi,
          marca_modelo:
            dados.marcaModelo?.trim() ||
            (tipoFinal === "moto_eletrica"
              ? "Moto Elétrica"
              : isSemPlaca
                ? "Máquina Padrão"
                : "Veículo Padrão"),
          ano: dados.ano || null,
          cor: dados.cor?.trim() || null,
          tipo_veiculo: tipoFinal,
          horimetro_horas: Number(dados.horimetroInicial) || 0,
          horimetro_modo: dados.regraHorimetro || "pos_chave",
          rastreador_id: rastreadorId,
          rastreador_imei: imeiLimpo,
          ativo: false,
          bloqueado: false,
        })
        .select("id")
        .single();

      if (novoVeiculo) {
        veiculoId = novoVeiculo.id;
      }
    }

    // Amarração bidirecional no rastreador
    if (rastreadorId && veiculoId) {
      await supabase
        .from("rastreadores")
        .update({ veiculo_id: veiculoId } as any)
        .eq("id", rastreadorId);
    }

    // Criar ou atualizar ordem na tabela instalacoes para que o instalador confira o IMEI
    const instaladorAlvoId = dados.instaladorId || null;

    if (instaladorAlvoId) {
      const placaFinal =
        (dados.placa && dados.placa.trim().toUpperCase()) ||
        veiculosCliente?.[0]?.placa ||
        "A DEFINIR";

      const mmParts = (
        dados.marcaModelo?.trim() ||
        veiculosCliente?.[0]?.marca_modelo ||
        "Veículo Padrão"
      ).split(" ");
      const marcaFinal = mmParts[0] || "Geral";
      const modeloFinal = mmParts.slice(1).join(" ") || "Veículo";

      // 1. Verifica se já existe ordem pendente para este cliente
      const { data: instExistente } = await supabase
        .from("instalacoes")
        .select("id, status")
        .eq("cliente_id", dados.clienteId)
        .neq("status", "concluida")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instExistente) {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (instaladorAlvoId) updatePayload.instalador_id = instaladorAlvoId;
        if (veiculoId) updatePayload.veiculo_id = veiculoId;
        if (placaFinal && placaFinal !== "A DEFINIR") updatePayload.placa = placaFinal;
        if (marcaFinal && marcaFinal !== "Geral") updatePayload.marca = marcaFinal;
        if (modeloFinal && modeloFinal !== "Veículo") updatePayload.modelo = modeloFinal;
        if (dados.ano !== undefined && dados.ano !== null) updatePayload.ano = dados.ano;
        if (dados.cor?.trim()) updatePayload.cor = dados.cor.trim();
        if (tipoFinal) updatePayload.tipo_veiculo = tipoFinal;
        if (imeiLimpo) updatePayload.rastreador_imei = imeiLimpo;
        if (dados.rastreadorModelo?.trim()) {
          updatePayload.rastreador_modelo = dados.rastreadorModelo.trim();
        }
        if (iccidLimpo) updatePayload.chip_iccid = iccidLimpo;
        if (dados.chipOperadora?.trim()) {
          updatePayload.chip_operadora = dados.chipOperadora.trim();
        }
        if (linhaLimpa) {
          updatePayload.chip_linha = linhaLimpa;
        }
        if (rastreadorId) {
          updatePayload.rastreador_id = rastreadorId;
          updatePayload.kit_determinado_em = new Date().toISOString();
        }
        if (dados.horimetroInicial !== undefined) {
          updatePayload.horimetro_inicial = Number(dados.horimetroInicial) || 0;
        }

        let { data: instData, error: errInst } = await supabase
          .from("instalacoes")
          .update(updatePayload as any)
          .eq("id", instExistente.id)
          .select("id")
          .single();

        // Se der erro por ausência de chip_linha na tabela remota, repete sem a coluna
        if (errInst && errInst.code === "42703") {
          delete updatePayload.chip_linha;
          const retry = await supabase
            .from("instalacoes")
            .update(updatePayload as any)
            .eq("id", instExistente.id)
            .select("id")
            .single();
          instData = retry.data;
          errInst = retry.error;
        }

        if (!errInst && instData) {
          return {
            success: true,
            message: "Ordem de instalação com Chip M2M e IMEI atualizada com sucesso.",
            instalacaoId: instData.id,
          };
        }
      } else {
        // 1b. Antes de criar nova ordem, verifica se este veículo/cliente já possui instalação concluída
        const { data: instConcluida } = await supabase
          .from("instalacoes")
          .select("id, status, veiculo_id, rastreador_imei")
          .eq("cliente_id", dados.clienteId)
          .eq("status", "concluida")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (instConcluida) {
          // Se o veículo já possui instalação concluída, PROIBIDO duplicar criando ordem nova!
          // Garante que o veículo esteja ativo e amarrado à instalação real
          if (veiculoId || instConcluida.veiculo_id) {
            const vIdFinal = veiculoId || instConcluida.veiculo_id;
            await supabase
              .from("veiculos")
              .update({
                ativo: true,
                rastreador_id: rastreadorId || undefined,
                rastreador_imei: imeiLimpo || instConcluida.rastreador_imei || undefined,
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", vIdFinal);
          }
          return {
            success: true,
            message: "Veículo já possui instalação técnica concluída. Cadastro mantido ativo.",
            instalacaoId: instConcluida.id,
          };
        }

        const insertPayload: Record<string, any> = {
          cliente_id: dados.clienteId,
          instalador_id: instaladorAlvoId,
          veiculo_id: veiculoId,
          placa: placaFinal,
          marca: marcaFinal,
          modelo: modeloFinal,
          ano: dados.ano || null,
          cor: dados.cor?.trim() || null,
          tipo_veiculo: tipoFinal,
          rastreador_imei: imeiLimpo || "A CONFERIR",
          rastreador_modelo: dados.rastreadorModelo?.trim() || "J16 4G",
          chip_iccid: iccidLimpo || null,
          chip_operadora: dados.chipOperadora?.trim() || "Vivo",
          chip_linha: linhaLimpa,
          rastreador_id: rastreadorId || null,
          kit_determinado_em: rastreadorId ? new Date().toISOString() : null,
          horimetro_inicial: Number(dados.horimetroInicial) || 0,
          status: "nao_instalado",
          observacoes:
            "Equipamento e chip M2M configurados pela administração do GD Rastreamento. O instalador deve conferir o IMEI físico do rastreador na instalação.",
        };

        let { data: instData, error: errInst } = await supabase
          .from("instalacoes")
          .insert(insertPayload as any)
          .select("id")
          .single();

        if (errInst && errInst.code === "42703") {
          delete insertPayload.chip_linha;
          const retry = await supabase
            .from("instalacoes")
            .insert(insertPayload as any)
            .select("id")
            .single();
          instData = retry.data;
          errInst = retry.error;
        }

        if (!errInst && instData) {
          return {
            success: true,
            message: "Ordem de instalação com Chip M2M e IMEI vinculada com sucesso.",
            instalacaoId: instData.id,
          };
        }
      }
    }

    return { success: true, message: "Equipamento provisionado com sucesso." };
  } catch (err: any) {
    console.warn("Aviso ao provisionar chip e rastreador:", err);
    return { success: false, message: err?.message || "Erro no provisionamento de hardware." };
  }
}

export interface EquipamentoClienteResumo {
  rastreadorImei: string;
  rastreadorModelo: string;
  chipOperadora: string;
  chipIccid: string;
  chipLinha: string;
  placa?: string;
  marcaModelo?: string;
  ano?: number | null;
  cor?: string | null;
  tipoVeiculo?: string | null;
  horimetroInicial?: number | null;
  kitId?: string | null;
}

export async function carregarEquipamentoDoCliente(
  clienteId: string,
): Promise<EquipamentoClienteResumo | null> {
  try {
    // 1. Tenta resgatar da ordem de instalação mais recente
    const { data: inst } = await supabase
      .from("instalacoes")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2. Resgata dados de veículo do cliente para sincronizar placa, marca, modelo e cor
    const { data: veiculos } = await supabase
      .from("veiculos")
      .select(
        `
        id, placa, marca_modelo, ano, cor, tipo_veiculo, horimetro_horas, rastreador_id, rastreador_imei,
        rastreador:rastreadores(id, imei, modelo, chip_id, chip:chips(id, iccid, operadora, linha))
      `,
      )
      .eq("cliente_id", clienteId)
      .limit(1);

    const v: any = veiculos?.[0] || null;

    if (inst) {
      const imeiValido =
        inst.rastreador_imei &&
        inst.rastreador_imei !== "PENDENTE" &&
        inst.rastreador_imei !== "A CONFERIR";

      // Resgate robusto da linha do chip (instalacoes.chip_linha -> chips.linha)
      let linhaChip = (inst as any).chip_linha || "";
      let operadoraChip = inst.chip_operadora || "Vivo";

      if (!linhaChip && inst.chip_iccid) {
        const { data: chipDoc } = await supabase
          .from("chips")
          .select("linha, operadora")
          .eq("iccid", inst.chip_iccid)
          .maybeSingle();
        if (chipDoc?.linha) linhaChip = chipDoc.linha;
        if (chipDoc?.operadora) operadoraChip = chipDoc.operadora;
      }

      if (!linhaChip && inst.rastreador_id) {
        const { data: rastDoc } = await supabase
          .from("rastreadores")
          .select("chip:chips(linha, operadora)")
          .eq("id", inst.rastreador_id)
          .maybeSingle();
        const c = (rastDoc as any)?.chip;
        if (c?.linha) linhaChip = c.linha;
        if (c?.operadora) operadoraChip = c.operadora;
      }

      const placaFinal =
        v?.placa && v.placa !== "A DEFINIR"
          ? v.placa
          : inst.placa && inst.placa !== "A DEFINIR"
            ? inst.placa
            : "";

      const marcaModeloFinal =
        v?.marca_modelo && v.marca_modelo !== "Veículo Padrão"
          ? v.marca_modelo
          : [inst.marca, inst.modelo]
              .filter((m) => m && m !== "A DEFINIR" && m !== "Veículo do Cliente" && m !== "Geral")
              .join(" ");

      return {
        rastreadorImei: imeiValido ? inst.rastreador_imei : v?.rastreador_imei || "",
        rastreadorModelo: inst.rastreador_modelo || "J16 4G",
        chipOperadora: operadoraChip,
        chipIccid: inst.chip_iccid || "",
        chipLinha: linhaChip,
        placa: placaFinal,
        marcaModelo: marcaModeloFinal,
        ano: v?.ano ?? inst.ano,
        cor: v?.cor ?? inst.cor,
        tipoVeiculo: v?.tipo_veiculo || inst.tipo_veiculo || "carro",
        horimetroInicial: v?.horimetro_horas ?? inst.horimetro_inicial ?? 0,
        kitId: inst.rastreador_id || v?.rastreador_id || null,
      };
    }

    // 3. Se não houver ordem, resgata diretamente do veículo
    if (v) {
      const r = v.rastreador;
      const c = r?.chip;
      return {
        rastreadorImei: r?.imei || v.rastreador_imei || "",
        rastreadorModelo: r?.modelo || "J16 4G",
        chipOperadora: c?.operadora || "Vivo",
        chipIccid: c?.iccid || "",
        chipLinha: c?.linha || "",
        placa: v.placa && v.placa !== "A DEFINIR" ? v.placa : "",
        marcaModelo: v.marca_modelo && v.marca_modelo !== "Veículo Padrão" ? v.marca_modelo : "",
        ano: v.ano,
        cor: v.cor,
        tipoVeiculo: v.tipo_veiculo || "carro",
        horimetroInicial: v.horimetro_horas || 0,
        kitId: r?.id || v.rastreador_id || null,
      };
    }

    return null;
  } catch (err) {
    console.warn("Erro ao carregar equipamento do cliente:", err);
    return null;
  }
}

/**
 * Atualiza os status de bloqueio administrativo de localização e de login do cliente.
 * Apenas Operador, Administrador ou SuperADM possuem permissão.
 */
export async function atualizarBloqueioAdministrativoCliente(
  clienteId: string,
  params: {
    status_bloqueio_localizacao?: "automatico" | "bloqueado" | "liberado";
    status_bloqueio_acesso?: "automatico" | "bloqueado" | "liberado";
    motivo?: string;
  },
): Promise<{ success: boolean; message?: string }> {
  try {
    // 1. Tenta via RPC dedicada no banco (com validação estrita e auditoria)
    const { error: rpcError } = await supabase.rpc(
      "atualizar_bloqueio_administrativo_cliente" as any,
      {
        p_cliente_id: clienteId,
        p_status_localizacao: params.status_bloqueio_localizacao || "automatico",
        p_status_acesso: params.status_bloqueio_acesso || "automatico",
        p_motivo: params.motivo || null,
      },
    );

    if (!rpcError) {
      return { success: true, message: "Status de bloqueio atualizado com sucesso via RPC." };
    }

    console.warn(
      "Aviso: RPC atualizar_bloqueio_administrativo_cliente falhou, executando fallback resiliente:",
      rpcError,
    );

    // 2. Fallback resiliente direto na tabela clientes
    // Obs: O trigger do banco atualiza bloqueio_atualizado_em e bloqueio_atualizado_por automaticamente.
    // Não incluímos bloqueio_atualizado_em no payload manual para evitar falhas com schema cache desatualizado.
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.status_bloqueio_localizacao) {
      updatePayload.status_bloqueio_localizacao = params.status_bloqueio_localizacao;
    }
    if (params.status_bloqueio_acesso) {
      updatePayload.status_bloqueio_acesso = params.status_bloqueio_acesso;
    }
    if (params.motivo !== undefined) {
      updatePayload.motivo_bloqueio_manual = params.motivo;
    }

    const { error: updError } = await supabase
      .from("clientes")
      .update(updatePayload)
      .eq("id", clienteId);

    if (updError) {
      console.warn(
        "Aviso: Fallback com colunas estendidas não pôde ser concluído:",
        updError.message,
      );
      // Se a instância ativa do banco ainda não tiver as colunas estendidas no schema cache,
      // aplica a regra nos campos canônicos existentes na tabela clientes (privacidade_localizacao e status)
      if (updError.message?.includes("schema cache") || updError.message?.includes("column")) {
        const payloadCompativel: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (params.status_bloqueio_localizacao) {
          payloadCompativel.privacidade_localizacao =
            params.status_bloqueio_localizacao === "bloqueado";
        }
        if (params.status_bloqueio_acesso === "bloqueado") {
          payloadCompativel.status = "inativo";
        } else if (params.status_bloqueio_acesso === "liberado") {
          payloadCompativel.status = "ativo";
        }

        const { error: compatError } = await supabase
          .from("clientes")
          .update(payloadCompativel)
          .eq("id", clienteId);

        if (!compatError) {
          return {
            success: true,
            message: "Status de bloqueio aplicado com sucesso no cliente.",
          };
        }
      }
      return { success: false, message: updError.message };
    }

    return { success: true, message: "Status de bloqueio atualizado com sucesso." };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Erro inesperado ao alterar bloqueio administrativo.",
    };
  }
}

export interface VeiculoComInstalacao {
  id: string;
  placa: string;
  marca_modelo: string;
  ano?: number | null;
  cor?: string | null;
  tipo_veiculo?: string | null;
  ativo: boolean;
  bloqueado: boolean;
  pendente_aprovacao_operador?: boolean;
  rastreador_id?: string | null;
  rastreador_imei?: string | null;
  instalacao_id?: string | null;
  instalador_id?: string | null;
  instalador_nome?: string | null;
  instalacao_status?: string | null;
  kit_id?: string | null;
  kit_imei?: string | null;
  kit_modelo?: string | null;
  chip_iccid?: string | null;
  chip_operadora?: string | null;
  chip_linha?: string | null;
  data_agendamento?: string | null;
  hora_agendamento?: string | null;
  observacoes?: string | null;
  rele_chicote_do_estoque?: boolean;
}

export interface ItemDistribuicaoVeiculoInstalacao {
  veiculoId: string;
  instalacaoId?: string | null;
  instaladorId: string;
  kitId?: string | null;
  imei?: string | null;
  modelo?: string | null;
  iccid?: string | null;
  operadora?: string | null;
  linha?: string | null;
  dataAgendamento?: string | null;
  horaAgendamento?: string | null;
  observacoes?: string | null;
  localTipo?: "oficina" | "local_veiculo";
  solicitaEnderecoCliente?: boolean;
  releChicoteDoEstoque?: boolean;
}

export function ehVeiculoComInstalacaoConcluida(v: {
  instalacao_status?: string | null;
  status?: string | null;
  ativo?: boolean | null;
  rastreador_id?: string | null;
}): boolean {
  const st = (v.instalacao_status || v.status || "").trim().toLowerCase();
  if (st === "concluida" || st === "concluida_com_pendencia") return true;
  if (v.ativo === true && Boolean(v.rastreador_id)) return true;
  return false;
}

export async function carregarVeiculosComInstalacaoDoCliente(
  clienteId: string,
): Promise<VeiculoComInstalacao[]> {
  try {
    // REGRA IMPERIOSA: Modo Degustacao opera com frota simulada de 3 veiculos ativos isolados em sandbox
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      const veiculosDeg = obterVeiculosDegustacaoMaster();
      return veiculosDeg.map((v) => ({
        id: v.id,
        placa: v.placa,
        marca_modelo: v.marca_modelo,
        ano: v.ano || 2024,
        cor: v.cor || "Prata",
        tipo_veiculo: v.tipo_veiculo || "carro",
        ativo: true,
        bloqueado: Boolean(v.bloqueado),
        rastreador_id: v.rastreador_id,
      }));
    }

    // 0. Tenta primeiro via rota de API segura com Service Role (imune a recursão RLS do Postgres)
    if (typeof window !== "undefined") {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          const resp = await fetch(`/api/veiculos?clienteId=${encodeURIComponent(clienteId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const json = (await resp.json()) as any;
            if (json?.success && Array.isArray(json?.veiculos)) {
              const vRows = json.veiculos;
              const iRows = json.instalacoes || [];
              return vRows.map((v: any) => {
                const instsCandidatas = iRows.filter((i: any) => {
                  if (i.tipo_servico === "retirada") return false;
                  if (i.veiculo_id === v.id) return true;
                  if (
                    !i.veiculo_id &&
                    v.placa &&
                    v.placa !== "A DEFINIR" &&
                    v.placa !== "SEM PLACA" &&
                    v.placa !== "SEMPLACA" &&
                    i.placa &&
                    i.placa.trim().toUpperCase() === v.placa.trim().toUpperCase()
                  ) {
                    return true;
                  }
                  return false;
                });
                const inst =
                  instsCandidatas.find(
                    (i: any) => i.status === "concluida" || i.status === "concluida_com_pendencia",
                  ) || instsCandidatas[0];

                return {
                  id: v.id,
                  placa: v.placa || "A DEFINIR",
                  marca_modelo: v.marca_modelo || "Veículo",
                  ano: v.ano || null,
                  cor: v.cor || null,
                  tipo_veiculo: v.tipo_veiculo || "carro",
                  ativo: Boolean(v.ativo),
                  bloqueado: Boolean(v.bloqueado),
                  pendente_aprovacao_operador: Boolean(v.pendente_aprovacao_operador),
                  rastreador_id: v.rastreador_id || null,
                  rastreador_imei: v.rastreador_imei || null,
                  instalacao_id: inst?.id || null,
                  instalador_id: inst?.instalador_id || null,
                  instalador_nome: inst?.instalador?.nome || null,
                  instalacao_status: inst?.status || null,
                  kit_id: inst?.rastreador_id || v.rastreador_id || null,
                  kit_imei: inst?.rastreador_imei || v.rastreador_imei || null,
                  kit_modelo: "J16 4G",
                  chip_iccid: null,
                  chip_operadora: null,
                  data_agendamento: inst?.data_agendamento || null,
                  hora_agendamento: inst?.hora_agendamento || null,
                  observacoes: inst?.observacoes || null,
                  rele_chicote_do_estoque: false,
                };
              });
            }
          }
        }
      } catch {
        // Fallback para query direta
      }
    }

    // 1. Busca todos os veículos do cliente
    const veiculosQuery = await supabase
      .from("veiculos")
      .select(
        "id, placa, marca_modelo, ano, cor, tipo_veiculo, ativo, bloqueado, rastreador_id, rastreador_imei, pendente_aprovacao_operador, created_at",
      )
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true });

    let veiculosRows = veiculosQuery.data || [];
    if (veiculosQuery.error) {
      const resFb = await supabase
        .from("veiculos")
        .select("id, placa, marca_modelo, ano, cor, ativo, bloqueado, rastreador_id, created_at")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: true });
      veiculosRows = resFb.data || [];
    }

    if (!veiculosRows || veiculosRows.length === 0) {
      return [];
    }

    // REGRA IMPERIOSA: Perfil S.adm Auditor possui disponibilizado ÚNICA E EXCLUSIVAMENTE o veículo do usuário (AXH0E44)
    if (
      sessaoAtual?.isAuditor ||
      sessaoAtual?.isSuperAdminAuditor ||
      sessaoAtual?.role === "superadmin_auditor"
    ) {
      veiculosRows = veiculosRows.filter((v: any) => {
        const placa = (v.placa || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        return placa === "AXH0E44" || v.id === "3f2e1d2b-ca96-420e-88a5-c33fd98b689d";
      });
      if (veiculosRows.length === 0) return [];
    }

    // 2. Busca todas as ordens de instalação para o cliente (ignorando retiradas)
    const { data: instalacoesRows } = await supabase
      .from("instalacoes")
      .select(
        "id, veiculo_id, placa, instalador_id, status, tipo_servico, rastreador_id, rastreador_imei, rastreador_modelo, chip_iccid, chip_operadora, data_agendamento, hora_agendamento, observacoes, created_at",
      )
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    // 3. Mapeia instaladores para resolver o nome
    const instaladorIds = Array.from(
      new Set(
        (instalacoesRows || [])
          .map((i: any) => i.instalador_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const mapNomesInstalador = new Map<string, string>();
    if (instaladorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", instaladorIds);
      (profs || []).forEach((p: any) => mapNomesInstalador.set(p.id, p.nome));
    }

    // 4. Cruza cada veículo com sua instalação (priorizando conclusão existente antes de ordens abertas)
    return veiculosRows.map((v: any) => {
      const instsCandidatas = (instalacoesRows || []).filter((i: any) => {
        if (i.tipo_servico === "retirada") return false;
        if (i.veiculo_id === v.id) return true;
        if (
          !i.veiculo_id &&
          v.placa &&
          v.placa !== "A DEFINIR" &&
          v.placa !== "SEM PLACA" &&
          v.placa !== "SEMPLACA" &&
          i.placa &&
          i.placa.trim().toUpperCase() === v.placa.trim().toUpperCase()
        ) {
          return true;
        }
        return false;
      });

      const inst =
        instsCandidatas.find(
          (i: any) => i.status === "concluida" || i.status === "concluida_com_pendencia",
        ) || instsCandidatas[0];

      const instId = inst?.id || null;
      const instaladorId = inst?.instalador_id || null;
      const instaladorNome = instaladorId ? mapNomesInstalador.get(instaladorId) || null : null;
      const instStatus = inst?.status || null;
      const kitId = inst?.rastreador_id || v.rastreador_id || null;
      const kitImei =
        inst?.rastreador_imei && inst.rastreador_imei !== "AGUARDANDO ESTOQUE"
          ? inst.rastreador_imei
          : v.rastreador_imei || null;

      return {
        id: v.id,
        placa: v.placa || "A DEFINIR",
        marca_modelo: v.marca_modelo || "Veículo",
        ano: v.ano || null,
        cor: v.cor || null,
        tipo_veiculo: v.tipo_veiculo || "carro",
        ativo: Boolean(v.ativo),
        bloqueado: Boolean(v.bloqueado),
        pendente_aprovacao_operador: Boolean(v.pendente_aprovacao_operador),
        rastreador_id: v.rastreador_id || null,
        rastreador_imei: v.rastreador_imei || null,
        instalacao_id: instId,
        instalador_id: instaladorId,
        instalador_nome: instaladorNome,
        instalacao_status: instStatus,
        kit_id: kitId,
        kit_imei: kitImei,
        kit_modelo: inst?.rastreador_modelo || "J16 4G",
        chip_iccid: inst?.chip_iccid || null,
        chip_operadora: inst?.chip_operadora || null,
        data_agendamento: inst?.data_agendamento || null,
        hora_agendamento: inst?.hora_agendamento || null,
        observacoes: inst?.observacoes || null,
        rele_chicote_do_estoque: Boolean(inst?.rele_chicote_do_estoque),
      };
    });
  } catch (err) {
    console.error("Erro ao carregar veículos com instalação do cliente:", err);
    return [];
  }
}

export async function cadastrarVeiculoParaCliente(
  clienteId: string,
  dados: {
    tipo_veiculo: string;
    placa?: string;
    chassi?: string | null;
    marca_modelo?: string;
    ano?: number | null;
    cor?: string | null;
    horimetro_horas?: number;
  },
): Promise<{ success: boolean; message: string; veiculo?: any }> {
  try {
    // 0. Tenta primeiro via rota de API segura com Service Role (imune a recursão RLS do Postgres)
    if (typeof window !== "undefined") {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          const resp = await fetch("/api/veiculos/cadastrar", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ clienteId, dados }),
          });
          if (resp.ok) {
            const json = (await resp.json()) as any;
            if (json?.success) {
              return {
                success: true,
                message: json.message || "Veículo cadastrado na frota com sucesso.",
                veiculo: json.veiculo,
              };
            }
          }
        }
      } catch {
        // Fallback para inserção direta via Supabase Client
      }
    }

    const rawTipo = (dados.tipo_veiculo || "carro").trim().toLowerCase();
    const tipoMapeado = rawTipo === "quadriciclo" ? "quadriciculo" : rawTipo;
    const tiposPermitidos = new Set([
      "carro",
      "moto",
      "moto_eletrica",
      "caminhao",
      "van",
      "ambulancia",
      "onibus",
      "suv",
      "camionete",
      "quadriciculo",
      "triciclo",
      "jetski",
      "maquina",
      "trator",
      "equipamento",
      "outro",
    ]);
    const tipoSanitizado = tiposPermitidos.has(tipoMapeado) ? tipoMapeado : "carro";
    const isSemPlaca =
      tipoSanitizado === "maquina" ||
      tipoSanitizado === "trator" ||
      tipoSanitizado === "equipamento" ||
      tipoSanitizado === "moto_eletrica";

    const rawPlaca = (dados.placa || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");

    const rawChassi = (dados.chassi || "").trim().toUpperCase();
    const chassiFinal = rawChassi ? rawChassi : null;
    const chassiSufixo = chassiFinal && chassiFinal.length >= 6 ? chassiFinal.slice(-6) : null;

    const placaFinal = rawPlaca ? rawPlaca : isSemPlaca ? chassiSufixo || "SEMPLACA" : "A DEFINIR";
    const marcaModeloFinal = (dados.marca_modelo || "").trim() || "Veículo Padrão";

    const payload: Record<string, any> = {
      cliente_id: clienteId,
      placa: placaFinal,
      chassi: chassiFinal,
      marca_modelo: marcaModeloFinal,
      ano: dados.ano || null,
      cor: dados.cor?.trim() || null,
      tipo_veiculo: tipoSanitizado,
      horimetro_horas: Number(dados.horimetro_horas) || 0,
      ativo: false,
      bloqueado: false,
      pendente_aprovacao_operador: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let { data: veiculoCriado, error: errInsert } = await supabase
      .from("veiculos")
      .insert(payload)
      .select()
      .single();

    if (
      errInsert &&
      (errInsert.message?.includes("column") || errInsert.message?.includes("schema cache"))
    ) {
      delete payload.pendente_aprovacao_operador;
      const retry = await supabase.from("veiculos").insert(payload).select().single();
      veiculoCriado = retry.data;
      errInsert = retry.error;
    }

    if (errInsert || !veiculoCriado) {
      throw errInsert || new Error("Falha ao inserir veículo na base.");
    }

    return {
      success: true,
      message: "Veículo cadastrado na frota com sucesso.",
      veiculo: veiculoCriado,
    };
  } catch (err: any) {
    console.error("Erro ao cadastrar veículo para cliente:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível cadastrar o veículo na frota.",
    };
  }
}

export async function salvarDistribuicaoInstalacoesCliente(
  clienteId: string,
  itens: ItemDistribuicaoVeiculoInstalacao[],
): Promise<{ success: boolean; message: string }> {
  try {
    if (!itens || itens.length === 0) {
      return { success: false, message: "Nenhum veículo selecionado para distribuição." };
    }

    // 0. Tenta primeiro via rota de API segura com Service Role (imune a recursão RLS do Postgres)
    if (typeof window !== "undefined") {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          const resp = await fetch("/api/veiculos/distribuir", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ clienteId, itens }),
          });
          if (resp.ok) {
            const json = (await resp.json()) as any;
            if (json?.success) {
              return {
                success: true,
                message: json.message || "Distribuição e ordens de serviço salvas com sucesso!",
              };
            }
          }
        }
      } catch {
        // Fallback para execução direta
      }
    }

    // Busca dados do cliente para notificações e auditoria
    const { data: clienteRow } = await supabase
      .from("clientes")
      .select("id, user_id, nome_razao_social, status")
      .eq("id", clienteId)
      .maybeSingle();

    const clienteUserId = clienteRow?.user_id || null;
    const clienteNome = clienteRow?.nome_razao_social || "Cliente";

    // Busca dados dos veículos para obter placa, marca, modelo, tipo e status ativo/rastreador
    const veiculoIds = itens.map((i) => i.veiculoId);
    const { data: veiculosRows } = await supabase
      .from("veiculos")
      .select("id, placa, marca_modelo, ano, cor, tipo_veiculo, ativo, rastreador_id")
      .in("id", veiculoIds);

    const mapVeiculos = new Map<string, any>();
    (veiculosRows || []).forEach((v: any) => mapVeiculos.set(v.id, v));

    // Carrega ordens existentes do cliente para blindar instalações já concluídas
    const { data: ordensClienteRows } = await supabase
      .from("instalacoes")
      .select("id, veiculo_id, placa, status, tipo_servico")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    const ordensConcluidasIds = new Set<string>();
    const veiculosComOrdemConcluida = new Set<string>();
    const placasComOrdemConcluida = new Set<string>();
    const ordensPorId = new Map<string, any>();

    (ordensClienteRows || []).forEach((ord: any) => {
      ordensPorId.set(ord.id, ord);
      const st = (ord.status || "").trim().toLowerCase();
      if (
        (st === "concluida" || st === "concluida_com_pendencia") &&
        ord.tipo_servico !== "retirada"
      ) {
        ordensConcluidasIds.add(ord.id);
        if (ord.veiculo_id) veiculosComOrdemConcluida.add(ord.veiculo_id);
        const p = (ord.placa || "").trim().toUpperCase();
        if (p && p !== "A DEFINIR" && p !== "SEM PLACA" && p !== "SEMPLACA") {
          placasComOrdemConcluida.add(p);
        }
      }
    });

    let temAlgumSemKit = false;
    let todasComData = true;
    const itensProcessados: ItemDistribuicaoVeiculoInstalacao[] = [];
    const ordensAdotadas = new Set<string>();

    // Busca perfis dos instaladores envolvidos para aplicar as taxas reais cadastradas
    const instaladorIds = Array.from(new Set(itens.map((i) => i.instaladorId).filter(Boolean)));
    const { data: profs } = await supabase
      .from("profiles")
      .select(
        "id, nome, telefone, endereco_instalacao, valor_instalacao_sem_bloqueador, valor_instalacao_com_bloqueador, valor_por_instalacao",
      )
      .in("id", instaladorIds);

    const mapInstaladores = new Map<string, any>();
    (profs || []).forEach((p: any) => mapInstaladores.set(p.id, p));

    for (const item of itens) {
      const temInstalador = Boolean(item.instaladorId);

      const vInfo = mapVeiculos.get(item.veiculoId);
      const placaFormatada = vInfo?.placa || "A DEFINIR";
      const placaUpper = placaFormatada.trim().toUpperCase();
      const ordemInformada = item.instalacaoId ? ordensPorId.get(item.instalacaoId) : null;

      // Blindagem: nunca sobrescreve veículo ou OS que já possui instalação concluída/ativa
      if (
        (item.instalacaoId && ordensConcluidasIds.has(item.instalacaoId)) ||
        veiculosComOrdemConcluida.has(item.veiculoId) ||
        (placaUpper &&
          placaUpper !== "A DEFINIR" &&
          placaUpper !== "SEM PLACA" &&
          placaUpper !== "SEMPLACA" &&
          placasComOrdemConcluida.has(placaUpper)) ||
        ehVeiculoComInstalacaoConcluida({
          instalacao_status: ordemInformada?.status,
          ativo: vInfo?.ativo,
          rastreador_id: vInfo?.rastreador_id,
        })
      ) {
        continue;
      }

      itensProcessados.push(item);

      const rawMarcaModelo = (vInfo?.marca_modelo || "").trim();
      const ehPlaceholderMm =
        !rawMarcaModelo ||
        ["VEÍCULO PADRÃO", "VEICULO PADRAO", "VEÍCULO", "VEICULO", "A DEFINIR", "GERAL"].includes(
          rawMarcaModelo.toUpperCase(),
        );
      const mmParts = (rawMarcaModelo || "Veículo").split(" ");
      const marcaFinal = ehPlaceholderMm ? "" : mmParts[0] || "";
      const modeloFinal = ehPlaceholderMm
        ? rawMarcaModelo || "Veículo Padrão"
        : mmParts.slice(1).join(" ") || mmParts[0] || "Veículo";

      const temKit = Boolean(item.kitId && item.imei);
      if (!temKit) {
        temAlgumSemKit = true;
      }
      if (!item.dataAgendamento) {
        todasComData = false;
      }

      // 1. Atualiza o veículo com os dados de rastreador ou desvincula se sem kit
      const veiculoUpdate: Record<string, any> = {
        pendente_aprovacao_operador: false,
        updated_at: new Date().toISOString(),
      };
      if (temKit) {
        veiculoUpdate.rastreador_id = item.kitId;
        veiculoUpdate.rastreador_imei = item.imei;
      } else {
        veiculoUpdate.rastreador_id = null;
        veiculoUpdate.rastreador_imei = null;
      }

      await supabase.from("veiculos").update(veiculoUpdate).eq("id", item.veiculoId);

      // 2. Se tem kit, atualiza o rastreador no estoque com status válido do enum
      if (temKit && item.kitId) {
        await supabase
          .from("rastreadores")
          .update({
            status: "estoque",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", item.kitId);
      }

      // 3. Localização canônica e unívoca da ordem pendente (nunca reutiliza OS concluída ou de outro veículo)
      let instExistenteId: string | null =
        item.instalacaoId && !ordensConcluidasIds.has(item.instalacaoId) ? item.instalacaoId : null;

      if (!instExistenteId) {
        const instPorVeiculo = (ordensClienteRows || []).find(
          (ord: any) =>
            ord.veiculo_id === item.veiculoId &&
            ord.tipo_servico !== "retirada" &&
            !ordensConcluidasIds.has(ord.id) &&
            !ordensAdotadas.has(ord.id),
        );

        if (instPorVeiculo?.id) {
          instExistenteId = instPorVeiculo.id;
        } else if (placaUpper && !["A DEFINIR", "SEM PLACA", "SEMPLACA"].includes(placaUpper)) {
          const instPorPlaca = (ordensClienteRows || []).find(
            (ord: any) =>
              ord.tipo_servico !== "retirada" &&
              !ordensConcluidasIds.has(ord.id) &&
              !ordensAdotadas.has(ord.id) &&
              (ord.placa || "").trim().toUpperCase() === placaUpper &&
              (!ord.veiculo_id || ord.veiculo_id === item.veiculoId),
          );

          if (instPorPlaca?.id) {
            instExistenteId = instPorPlaca.id;
          }
        }
      }

      // Só adota ordem órfã pendente sem placa definida (ou da mesma placa), evitando reaproveitar ordem de outro veículo
      if (!instExistenteId) {
        const instOrfa = (ordensClienteRows || []).find((ord: any) => {
          if (ord.veiculo_id) return false;
          if (ord.tipo_servico === "retirada") return false;
          if (ordensConcluidasIds.has(ord.id) || ordensAdotadas.has(ord.id)) return false;
          const pOrd = (ord.placa || "").trim().toUpperCase();
          return (
            !pOrd ||
            pOrd === "A DEFINIR" ||
            pOrd === "SEM PLACA" ||
            pOrd === "SEMPLACA" ||
            pOrd === placaUpper
          );
        });

        if (instOrfa?.id) {
          instExistenteId = instOrfa.id;
        }
      }

      if (instExistenteId) {
        ordensAdotadas.add(instExistenteId);
      }

      const statusFinal = temKit ? "agendada" : "nao_instalado";
      const observacaoFinal =
        item.observacoes?.trim() ||
        (temKit
          ? "Kit de comodato atribuído pelo operador. Aguardando realização da instalação física."
          : "Veículo aguardando liberação de kit de rastreador em estoque para agendamento.");

      // Determina se a instalação é com bloqueador e aplica estritamente o valor cadastrado no perfil do instalador
      const temBloqueador = vInfo?.bloqueador_instalado !== false;
      const pInst = mapInstaladores.get(item.instaladorId);

      const valorRepasseCalculado = temBloqueador
        ? Number(pInst?.valor_instalacao_com_bloqueador ?? pInst?.valor_por_instalacao ?? 0)
        : Number(pInst?.valor_instalacao_sem_bloqueador ?? pInst?.valor_por_instalacao ?? 0);

      const ehNoLocalCliente =
        item.localTipo === "local_veiculo" || Boolean(item.solicitaEnderecoCliente);
      const localTipoFinal = ehNoLocalCliente ? "local_veiculo" : "oficina";
      const localEnderecoFinal = ehNoLocalCliente ? null : pInst?.endereco_instalacao || null;

      if (instExistenteId) {
        // Atualiza a ordem existente com vinculação de veículo, kit e dados do agendamento
        const updateOrdem: Record<string, any> = {
          veiculo_id: item.veiculoId,
          instalador_id: item.instaladorId || null,
          placa: placaFormatada,
          marca: marcaFinal,
          modelo: modeloFinal,
          ano: vInfo?.ano || null,
          cor: vInfo?.cor || null,
          tipo_veiculo: vInfo?.tipo_veiculo || "carro",
          status: statusFinal,
          valor_instalacao: valorRepasseCalculado,
          bloqueador_instalado: temBloqueador,
          com_bloqueador: temBloqueador,
          local_tipo: localTipoFinal,
          local_endereco: localEnderecoFinal,
          solicita_endereco_cliente: ehNoLocalCliente,
          solicitado_endereco_em: ehNoLocalCliente ? new Date().toISOString() : null,
          rastreador_id: item.kitId || null,
          rastreador_imei: temKit ? item.imei : "AGUARDANDO ESTOQUE",
          rastreador_modelo: item.modelo || "J16 4G",
          chip_iccid: item.iccid || null,
          chip_operadora: item.operadora || null,
          data_agendamento: item.dataAgendamento || null,
          hora_agendamento: item.horaAgendamento || null,
          observacoes: observacaoFinal,
          rele_chicote_do_estoque: Boolean(item.releChicoteDoEstoque),
          kit_determinado_em: temKit ? new Date().toISOString() : null,
          kit_confirmado_instalador: false,
          updated_at: new Date().toISOString(),
        };

        if (item.linha) {
          updateOrdem.chip_linha = item.linha;
        }

        const { error: errUpd } = await supabase
          .from("instalacoes")
          .update(updateOrdem as any)
          .eq("id", instExistenteId);

        if (errUpd && errUpd.code === "42703") {
          delete updateOrdem.chip_linha;
          delete updateOrdem.rele_chicote_do_estoque;
          await supabase.from("instalacoes").update(updateOrdem).eq("id", instExistenteId);
        }

        // Purga com segurança quaisquer ordens pendentes duplicadas para o mesmo veículo/placa
        try {
          await supabase
            .from("instalacoes")
            .delete()
            .eq("cliente_id", clienteId)
            .neq("id", instExistenteId)
            .eq("veiculo_id", item.veiculoId)
            .neq("status", "concluida");

          if (
            placaFormatada &&
            !["A DEFINIR", "SEM PLACA", "SEMPLACA"].includes(placaFormatada.toUpperCase())
          ) {
            await supabase
              .from("instalacoes")
              .delete()
              .eq("cliente_id", clienteId)
              .neq("id", instExistenteId)
              .ilike("placa", placaFormatada.trim())
              .neq("status", "concluida");
          }
        } catch (errClean) {
          console.warn("Aviso ao limpar ordens pendentes redundantes:", errClean);
        }
      } else {
        // Insere nova ordem de instalação individual para o veículo
        const novaOrdem: Record<string, any> = {
          cliente_id: clienteId,
          veiculo_id: item.veiculoId,
          instalador_id: item.instaladorId || null,
          placa: placaFormatada,
          marca: marcaFinal,
          modelo: modeloFinal,
          ano: vInfo?.ano || null,
          cor: vInfo?.cor || null,
          tipo_veiculo: vInfo?.tipo_veiculo || "carro",
          km_instalacao: 0,
          tipo_servico: "instalacao",
          valor_instalacao: valorRepasseCalculado,
          status_pagamento: "pendente",
          bloqueador_instalado: temBloqueador,
          com_bloqueador: temBloqueador,
          local_tipo: localTipoFinal,
          local_endereco: localEnderecoFinal,
          solicita_endereco_cliente: ehNoLocalCliente,
          solicitado_endereco_em: ehNoLocalCliente ? new Date().toISOString() : null,
          status: statusFinal,
          rastreador_id: item.kitId || null,
          rastreador_imei: temKit ? item.imei : "AGUARDANDO ESTOQUE",
          rastreador_modelo: item.modelo || "J16 4G",
          chip_iccid: item.iccid || null,
          chip_operadora: item.operadora || null,
          data_agendamento: item.dataAgendamento || null,
          hora_agendamento: item.horaAgendamento || null,
          observacoes: observacaoFinal,
          rele_chicote_do_estoque: Boolean(item.releChicoteDoEstoque),
          kit_determinado_em: temKit ? new Date().toISOString() : null,
          kit_confirmado_instalador: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (item.linha) {
          novaOrdem.chip_linha = item.linha;
        }

        const resIns = await supabase
          .from("instalacoes")
          .insert(novaOrdem as any)
          .select("id")
          .maybeSingle();

        let insData = resIns.data;
        const errIns = resIns.error;

        if (errIns && errIns.code === "42703") {
          delete novaOrdem.chip_linha;
          delete novaOrdem.rele_chicote_do_estoque;
          const retryIns = await supabase
            .from("instalacoes")
            .insert(novaOrdem)
            .select("id")
            .maybeSingle();
          insData = retryIns.data;
        }

        instExistenteId = insData?.id || null;
      }

      // Sincronização e Baixa do Relé e Chicote conforme escolha do Operador
      const idInstalacaoFinal = instExistenteId;
      if (idInstalacaoFinal) {
        if (item.releChicoteDoEstoque) {
          try {
            const { data: itensEstoque } = await supabase
              .from("estoque_itens")
              .select("id, codigo_sku, categoria");

            const itemRele = itensEstoque?.find(
              (i) =>
                i.codigo_sku === "MAT-0003" ||
                i.categoria?.toLowerCase().includes("rele") ||
                i.categoria?.toLowerCase().includes("relé"),
            );
            const itemPorta = itensEstoque?.find(
              (i) =>
                i.codigo_sku === "MAT-0004" ||
                i.codigo_sku?.toLowerCase().includes("porta") ||
                i.categoria?.toLowerCase().includes("chicote") ||
                i.categoria?.toLowerCase().includes("fios"),
            );

            const itensParaBaixa: ItemBaixaInstalacao[] = [];
            if (itemRele) {
              itensParaBaixa.push({
                itemId: itemRele.id,
                quantidade: 1,
                observacao: `Baixa de relé do estoque na atribuição do kit placa ${placaFormatada}`,
              });
            }
            if (itemPorta) {
              itensParaBaixa.push({
                itemId: itemPorta.id,
                quantidade: 1,
                observacao: `Baixa de chicote/porta relé do estoque na atribuição do kit placa ${placaFormatada}`,
              });
            }

            if (itensParaBaixa.length > 0) {
              await sincronizarEstoqueInstalacao(
                idInstalacaoFinal,
                itensParaBaixa,
                item.instaladorId || undefined,
              );
            }
          } catch (errEst) {
            console.warn("Aviso ao baixar relé e chicote do estoque na atribuição:", errEst);
          }
        } else {
          try {
            // Se o instalador forneceu, limpa qualquer baixa anterior de relé e chicote desta ordem
            const { data: itensEstoque } = await supabase
              .from("estoque_itens")
              .select("id, codigo_sku, categoria");

            const idsReleChicote = (itensEstoque || [])
              .filter(
                (i) =>
                  i.codigo_sku === "MAT-0003" ||
                  i.codigo_sku === "MAT-0004" ||
                  i.categoria?.toLowerCase().includes("rele") ||
                  i.categoria?.toLowerCase().includes("relé") ||
                  i.categoria?.toLowerCase().includes("porta") ||
                  i.categoria?.toLowerCase().includes("chicote"),
              )
              .map((i) => i.id);

            if (idsReleChicote.length > 0) {
              const { data: movsRemover } = await supabase
                .from("estoque_movimentacoes")
                .select("id, item_id")
                .eq("instalacao_id", idInstalacaoFinal)
                .in("item_id", idsReleChicote);

              if (movsRemover && movsRemover.length > 0) {
                await supabase
                  .from("estoque_movimentacoes")
                  .delete()
                  .eq("instalacao_id", idInstalacaoFinal)
                  .in("item_id", idsReleChicote);

                for (const mov of movsRemover) {
                  await supabase.rpc("reconciliar_saldo_item_estoque", { p_item_id: mov.item_id });
                }
              }
            }
          } catch (errEstLimpeza) {
            console.warn("Aviso ao limpar movimentações de relé/chicote:", errEstLimpeza);
          }
        }
      }

      // Dispara notificação direta e em tempo real para o instalador designado (não-bloqueante)
      if (item.instaladorId) {
        const msgTexto = temKit
          ? `Você recebeu a ordem de serviço do veículo ${placaFormatada} (${marcaFinal} ${modeloFinal}) do cliente ${clienteNome}. Kit rastreador: ${item.imei || "Vinculado"}.`
          : `Você foi designado para o atendimento do veículo ${placaFormatada} (${marcaFinal} ${modeloFinal}) do cliente ${clienteNome}. Aguardando liberação de kit.`;

        enviarNotificacaoViaBd({
          destinatarioUserId: item.instaladorId,
          titulo: temKit
            ? `🔧 Nova Instalação e Kit Atribuídos: ${placaFormatada}`
            : `🔧 Nova Instalação Atribuída: ${placaFormatada}`,
          mensagem: msgTexto,
          tipo: "instalacao",
          url: "/instalacao",
          placa: placaFormatada,
        }).catch((errNotif) =>
          console.warn("Aviso ao disparar notificação para o instalador:", errNotif),
        );

        // Dispara mensagem WhatsApp via Central informando ao instalador sobre o novo serviço
        if (typeof window !== "undefined" && typeof fetch === "function") {
          supabase.auth
            .getSession()
            .then(({ data: sessionData }) => {
              const token = sessionData?.session?.access_token;
              if (!token) return;
              return fetch("/api/whatsapp/instalacao-evento", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  evento: "servico_atribuido",
                  instalacaoId: idInstalacaoFinal,
                  instaladorId: item.instaladorId,
                  clienteId,
                  clienteNome,
                  tipoVeiculo: vInfo?.tipo_veiculo || "carro",
                  placa: placaFormatada,
                  rastreadorImei: temKit ? item.imei : "AGUARDANDO ESTOQUE",
                  localTipo: localTipoFinal,
                  localEndereco: localEnderecoFinal,
                }),
              });
            })
            .catch((errWa) =>
              console.warn("Aviso ao notificar instalador via WhatsApp Central:", errWa),
            );
        }
      }

      // Dispara notificação instantânea para o cliente titular do veículo (não-bloqueante)
      if (clienteUserId) {
        const nomeInst = pInst?.nome || "Técnico Especializado";
        const endInst = pInst?.endereco_instalacao ? ` (${pInst.endereco_instalacao})` : "";

        let tituloCli = "";
        let msgCli = "";

        if (ehNoLocalCliente) {
          tituloCli = `📍 Informe o Endereço de Instalação: ${placaFormatada}`;
          msgCli = `O operador definiu que a instalação do seu veículo ${placaFormatada} será realizada no seu local pelo técnico ${nomeInst}. Por favor, acesse o sistema e informe o endereço onde o veículo estará.`;
        } else if (item.instaladorId) {
          tituloCli = temKit
            ? `🔧 Técnico e Rastreador Definidos: ${placaFormatada}`
            : `🔧 Técnico Designado: ${placaFormatada}`;
          msgCli = `O técnico credenciado ${nomeInst} foi designado para o atendimento do seu veículo ${placaFormatada}. Local de atendimento: Oficina do Instalador${endInst}.`;
        } else {
          tituloCli = `📋 Frota Registrada: ${placaFormatada}`;
          msgCli = `Seu veículo ${placaFormatada} foi cadastrado com sucesso e está aguardando agendamento.`;
        }

        enviarNotificacaoViaBd({
          destinatarioUserId: clienteUserId,
          destinatarioClienteId: clienteId,
          titulo: tituloCli,
          mensagem: msgCli,
          tipo: "instalacao",
          url: "/login",
          placa: placaFormatada,
        }).catch((errCli) => console.warn("Aviso ao notificar cliente na distribuição:", errCli));
      }
    }

    if (itensProcessados.length === 0) {
      return {
        success: false,
        message:
          "Nenhum veículo novo ou pendente selecionado. Veículos com instalação já concluída permanecem preservados.",
      };
    }

    // 4. Atualiza o status geral do cliente e sincroniza o instalador_id estritamente com base nos veículos pendentes processados
    const primeiroInstaladorId =
      itensProcessados.find((i) => Boolean(i.instaladorId))?.instaladorId || null;
    const statusAgendamentoCliente = temAlgumSemKit
      ? "aguardando_agendamento"
      : todasComData
        ? "agendado"
        : "aguardando_agendamento";

    const updateClientePayload: Record<string, any> = {
      pendente_configuracao_operador: false,
      updated_at: new Date().toISOString(),
    };
    if (clienteRow?.status !== "ativo") {
      updateClientePayload.status_agendamento = statusAgendamentoCliente;
    }
    if (primeiroInstaladorId) {
      updateClientePayload.instalador_id = primeiroInstaladorId;
    }
    const primeiroItemComKit = itensProcessados.find((i) => Boolean(i.kitId && i.imei));
    if (primeiroItemComKit?.kitId) {
      updateClientePayload.kit_determinado_id = primeiroItemComKit.kitId;
    }
    const primeiroItemComData = itensProcessados.find((i) => Boolean(i.dataAgendamento));
    if (primeiroItemComData?.dataAgendamento) {
      updateClientePayload.data_agendamento = primeiroItemComData.dataAgendamento;
      updateClientePayload.hora_agendamento = primeiroItemComData.horaAgendamento || null;
    }

    await supabase
      .from("clientes")
      .update(updateClientePayload as any)
      .eq("id", clienteId);

    return {
      success: true,
      message:
        "Distribuição concluída com sucesso! Ordens de serviço geradas apenas para os veículos novos ou pendentes.",
    };
  } catch (err: any) {
    console.error("Erro ao salvar distribuição de instalações:", err);
    return {
      success: false,
      message: err?.message || "Falha ao processar distribuição de instalações e kits.",
    };
  }
}
