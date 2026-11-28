import { supabase } from "@/integrations/supabase/client";
import {
  APP_NOME,
  APP_VERSION_NUMERO,
  APP_CHAVE_PIX_PADRAO,
  APP_PUBLIC_URL,
} from "@/shared/lib/version";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { aplicarCertidaoAutenticidadePdf } from "@/features/seguranca/services/certidaoPdfHelper";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { gerarPayloadPix } from "@/features/instalacoes/utils/pixPayload";
import {
  obterConfigPixSistemaSync,
  gerarMensagemLembreteVencimentoLeve,
} from "@/shared/lib/pixSistemaService";
import {
  enriquecerNumeracaoParcelasMensalidades,
  formatarParcelaMensalidade,
} from "@/features/mensalidades/services/mensalidadeService";
import type {
  TransacaoFinanceira,
  ResumoFluxoCaixa,
  DREOperacional,
  NovaTransacaoInput,
  StatusTransacao,
  TipoTransacao,
  CategoriaTransacao,
  MoedaTransacao,
  FontePagamentoTransacao,
  StatusRessarcimento,
  ResumoRessarcimento,
  ClienteInadimplente,
  MensalidadeInadimplente,
  ResumoInadimplencia,
} from "../types";

export async function listarTransacoes(): Promise<TransacaoFinanceira[]> {
  try {
    // Carrega em paralelo as 3 fontes de dados do Supabase
    const [transacoesRes, mensalidadesRes, instalacoesRes] = await Promise.all([
      supabase
        .from("transacoes_financeiras" as any)
        .select(
          `
          id,
          tipo,
          categoria,
          descricao,
          valor,
          data_competencia,
          data_vencimento,
          data_pagamento,
          status,
          liquidado_pelo_cliente,
          fonte_pagamento,
          responsavel_pagamento_id,
          responsavel_pagamento_nome,
          status_ressarcimento,
          data_ressarcimento,
          mensalidade_id,
          instalacao_id,
          cliente_id,
          instalador_id,
          comprovante_url,
          observacoes,
          recorrencia_id,
          modalidade,
          parcela_atual,
          total_parcelas,
          recorrencia_ativa,
          moeda,
          valor_moeda_original,
          cotacao_moeda,
          created_at,
          updated_at,
          revendedor_id,
          vendedor_id,
          clientes:cliente_id (
            nome_razao_social
          ),
          instalador:instalador_id (
            nome
          ),
          revendedores:revendedor_id (
            id,
            nome,
            chave_pix
          ),
          vendedores:vendedor_id (
            id,
            nome,
            chave_pix
          )
        `,
        )
        .order("data_competencia", { ascending: false }),

      supabase
        .from("mensalidades")
        .select(
          `
          id,
          valor,
          mes_referencia,
          ano_referencia,
          numero_parcela,
          total_parcelas,
          data_vencimento,
          data_pagamento,
          status,
          cliente_id,
          created_at,
          clientes (
            nome_razao_social,
            valor_mensalidade
          )
        `,
        )
        .order("data_vencimento", { ascending: false }),

      supabase
        .from("instalacoes")
        .select(
          `
          id,
          valor_instalacao,
          status,
          status_pagamento,
          pago_direto_cliente,
          pago_em,
          placa,
          instalador_id,
          created_at,
          concluida_at,
          instalador:instalador_id (
            nome
          )
        `,
        )
        .order("created_at", { ascending: false }),
    ]);

    let dadosTransacoes: any[] = transacoesRes.data || [];

    // Fallback de ultra-resiliencia para transacoes caso o join de FK sofra interrupcao
    if (transacoesRes.error) {
      console.warn("Recuperando transacoes sem relacionamentos:", transacoesRes.error);
      const fallbackTrans = await supabase
        .from("transacoes_financeiras" as any)
        .select("*")
        .order("data_competencia", { ascending: false });
      if (fallbackTrans.data) {
        dadosTransacoes = fallbackTrans.data;
      }
    }

    let dadosInstalacoes: any[] = instalacoesRes.data || [];
    if (instalacoesRes.error) {
      console.warn(
        "Recuperando instalacoes sem relacionamentos/colunas opcionais:",
        instalacoesRes.error,
      );
      const fallbackInst = await supabase
        .from("instalacoes")
        .select(
          "id, valor_instalacao, status, status_pagamento, placa, instalador_id, created_at, concluida_at, pago_em",
        )
        .order("created_at", { ascending: false });
      if (fallbackInst.data) {
        dadosInstalacoes = fallbackInst.data;
      }
    }

    let dadosMensalidadesRaw: any[] = mensalidadesRes.data || [];
    if (mensalidadesRes.error) {
      const fallbackMens = await supabase
        .from("mensalidades")
        .select(
          `
          id,
          valor,
          mes_referencia,
          ano_referencia,
          data_vencimento,
          data_pagamento,
          status,
          cliente_id,
          created_at,
          clientes (
            nome_razao_social,
            valor_mensalidade
          )
        `,
        )
        .order("data_vencimento", { ascending: false });
      if (fallbackMens.data) {
        dadosMensalidadesRaw = fallbackMens.data;
      }
    }

    const dadosMensalidadesEnriquecidas =
      enriquecerNumeracaoParcelasMensalidades(dadosMensalidadesRaw);
    const mapaMensalidadesPorId = new Map<string, any>();
    for (const m of dadosMensalidadesEnriquecidas) {
      mapaMensalidadesPorId.set(m.id, m);
    }

    const listaUnificada: TransacaoFinanceira[] = [];
    const mensalidadesVinculadas = new Set<string>();
    const instalacoesVinculadas = new Set<string>();

    // 1. Processa todas as transacoes gravadas na tabela transacoes_financeiras
    for (const t of dadosTransacoes) {
      const tipoNormalizado: "entrada" | "saida" =
        t.tipo === "saida" || t.tipo === "despesa" ? "saida" : "entrada";

      let statusNormalizado: "pendente" | "concluido" | "cancelado" = "pendente";
      if (t.status === "concluido" || t.status === "pago") {
        statusNormalizado = "concluido";
      } else if (t.status === "cancelado" || t.status === "estornado") {
        statusNormalizado = "cancelado";
      }

      if (t.mensalidade_id) mensalidadesVinculadas.add(t.mensalidade_id);
      if (t.instalacao_id) instalacoesVinculadas.add(t.instalacao_id);

      const mensRef = t.mensalidade_id ? mapaMensalidadesPorId.get(t.mensalidade_id) : null;
      let modalidade = t.modalidade || "avulsa";
      let recorrenciaId = t.recorrencia_id || null;
      const parcelaAtual = t.parcela_atual || mensRef?.numero_parcela || null;
      const totalParcelas = t.total_parcelas || mensRef?.total_parcelas || null;
      let descricaoFinal: string = t.descricao || "";

      if (
        t.categoria === "mensalidade" &&
        parcelaAtual &&
        totalParcelas &&
        (!mensRef || mensRef.mes_referencia > 0)
      ) {
        const pFmt = formatarParcelaMensalidade(parcelaAtual, totalParcelas);
        if (pFmt && !descricaoFinal.includes(pFmt)) {
          if (/Mensalidade \d{2}\/\d{4}/i.test(descricaoFinal)) {
            descricaoFinal = descricaoFinal.replace(/(Mensalidade \d{2}\/\d{4})/i, `$1 (${pFmt})`);
          } else {
            descricaoFinal = `${descricaoFinal} (${pFmt})`;
          }
        }
      }
      const recorrenciaAtiva = t.recorrencia_ativa ?? true;
      let moeda = t.moeda || "BRL";
      let valorMoedaOriginal = t.valor_moeda_original ? Number(t.valor_moeda_original) : null;
      let cotacaoMoeda = t.cotacao_moeda ? Number(t.cotacao_moeda) : null;

      let fontePagamento: FontePagamentoTransacao =
        (t.fonte_pagamento as FontePagamentoTransacao) || "caixa_empresa";
      let respId = t.responsavel_pagamento_id || null;
      let respNome = t.responsavel_pagamento_nome || null;
      let statusRessarcimento: StatusRessarcimento =
        (t.status_ressarcimento as StatusRessarcimento) || "nao_aplicavel";
      let dataRessarcimento = t.data_ressarcimento || null;

      // Resiliência caso colunas ainda estejam em observações estruturadas
      if (!recorrenciaId && t.observacoes && t.observacoes.includes("[REC:")) {
        const matchRec = t.observacoes.match(/\[REC:([^\]]+)\]/);
        if (matchRec) {
          recorrenciaId = matchRec[1];
          modalidade = t.descricao.includes("/") ? "parcelada" : "recorrente";
        }
      }
      if (moeda === "BRL" && t.observacoes && t.observacoes.includes("[MOEDA:USD")) {
        moeda = "USD";
        const matchV = t.observacoes.match(/VALOR_USD:([0-9.]+)/);
        const matchC = t.observacoes.match(/COTACAO:([0-9.]+)/);
        if (matchV) valorMoedaOriginal = Number(matchV[1]);
        if (matchC) cotacaoMoeda = Number(matchC[1]);
      }

      // Resiliência de metadados de origem da verba e ressarcimento em observações
      if (!t.fonte_pagamento && t.observacoes && t.observacoes.includes("[FONTE:")) {
        const matchFonte = t.observacoes.match(/\[FONTE:([^\]|]+)/);
        if (matchFonte) fontePagamento = matchFonte[1].trim() as FontePagamentoTransacao;
        const matchRespNome = t.observacoes.match(/RESP:([^\]|]+)/);
        if (matchRespNome) respNome = matchRespNome[1].trim();
        const matchRespId = t.observacoes.match(/RESP_ID:([^\]|]+)/);
        if (matchRespId) respId = matchRespId[1].trim();
        const matchRessarc = t.observacoes.match(/RESSARC:([^\]|]+)/);
        if (matchRessarc) statusRessarcimento = matchRessarc[1].trim() as StatusRessarcimento;
        const matchDataRessarc = t.observacoes.match(/DATA_RESSARC:([^\]|]+)/);
        if (matchDataRessarc) dataRessarcimento = matchDataRessarc[1].trim();
      }

      if (
        tipoNormalizado === "saida" &&
        fontePagamento === "operador_adm" &&
        (!statusRessarcimento || statusRessarcimento === "nao_aplicavel")
      ) {
        statusRessarcimento = "pendente";
      }

      listaUnificada.push({
        ...t,
        descricao: descricaoFinal,
        tipo: tipoNormalizado,
        status: statusNormalizado,
        valor: t.liquidado_pelo_cliente ? 0 : Number(t.valor || 0),
        liquidado_pelo_cliente: Boolean(t.liquidado_pelo_cliente),
        clientes: t.clientes || null,
        instalador: t.instalador || null,
        modalidade,
        recorrencia_id: recorrenciaId,
        parcela_atual: parcelaAtual,
        total_parcelas: totalParcelas,
        recorrencia_ativa: recorrenciaAtiva,
        moeda,
        valor_moeda_original: valorMoedaOriginal,
        cotacao_moeda: cotacaoMoeda,
        fonte_pagamento: fontePagamento,
        responsavel_pagamento_id: respId,
        responsavel_pagamento_nome: respNome,
        status_ressarcimento: statusRessarcimento,
        data_ressarcimento: dataRessarcimento,
      });
    }

    // 2. Mescla mensalidades de clientes que ainda nao estejam na tabela de transacoes
    if (dadosMensalidadesEnriquecidas.length > 0) {
      for (const m of dadosMensalidadesEnriquecidas) {
        if (mensalidadesVinculadas.has(m.id)) continue;

        const mesStr = String(m.mes_referencia).padStart(2, "0");
        const cliNome = m.clientes?.nome_razao_social || "Cliente";
        const val = Number(m.valor || 0);
        const cliBase = Number(m.clientes?.valor_mensalidade || 45);
        const isProRata = Math.abs(val - cliBase) > 0.05 && val > 0;
        const complementoProRata = isProRata ? " (Pró-rata + Mensalidade)" : "";
        const parcelaFmt = formatarParcelaMensalidade(m.numero_parcela, m.total_parcelas);
        const descricaoMensalidade =
          m.mes_referencia === 0
            ? `Taxa de Ativação (${m.ano_referencia}) - ${cliNome}`
            : `Mensalidade ${mesStr}/${m.ano_referencia}${parcelaFmt ? ` (${parcelaFmt})` : ""} - ${cliNome}${complementoProRata}`;

        listaUnificada.push({
          id: `m-${m.id}`,
          tipo: "entrada",
          categoria: "mensalidade",
          descricao: descricaoMensalidade,
          valor: val,
          data_competencia:
            m.data_vencimento ||
            `${m.ano_referencia}-${String(Math.max(1, m.mes_referencia)).padStart(2, "0")}-01`,
          data_vencimento: m.data_vencimento,
          data_pagamento: m.data_pagamento,
          status: m.status === "pago" ? "concluido" : "pendente",
          mensalidade_id: m.id,
          cliente_id: m.cliente_id,
          parcela_atual: m.numero_parcela ?? null,
          total_parcelas: m.total_parcelas ?? null,
          created_at: m.created_at,
          updated_at: m.created_at,
          clientes: m.clientes,
        });
      }
    }

    // 3. Mescla repasses de instaladores que ainda nao estejam na tabela de transacoes
    if (dadosInstalacoes && dadosInstalacoes.length > 0) {
      for (const inst of dadosInstalacoes) {
        if (instalacoesVinculadas.has(inst.id)) continue;
        if (!inst.valor_instalacao || Number(inst.valor_instalacao) <= 0) continue;

        // Regra Contábil Hunter: Apenas instalações CONCLUÍDAS geram obrigações de repasse financeiro a pagar!
        const isConcluida =
          inst.status === "concluida" || inst.status === "concluida_com_pendencia";
        if (!isConcluida) continue;

        const instNome = inst.instalador?.nome || "Tecnico Credenciado";
        const dataReferencia = inst.concluida_at || inst.created_at;
        const dataFormatada = dataReferencia
          ? dataReferencia.split("T")[0]
          : new Date().toISOString().split("T")[0];

        const isPagoCliente = Boolean(inst.pago_direto_cliente);
        const valorEfetivo = isPagoCliente ? 0 : Number(inst.valor_instalacao || 0);
        const descComplemento = isPagoCliente ? " (Liquidado pelo Cliente)" : "";
        const placaRef =
          inst.placa && inst.placa !== "A DEFINIR" && inst.placa !== "SEM PLACA"
            ? ` - Placa ${inst.placa}`
            : ` - Ordem #${inst.id.slice(0, 6)}`;

        listaUnificada.push({
          id: `i-${inst.id}`,
          tipo: "saida",
          categoria: "repasse_instalador",
          descricao: `Repasse Instalador (${instNome})${placaRef}${descComplemento}`,
          valor: valorEfetivo,
          data_competencia: dataFormatada,
          data_vencimento: dataFormatada,
          data_pagamento: inst.pago_em,
          status: inst.status_pagamento === "pago" || isPagoCliente ? "concluido" : "pendente",
          liquidado_pelo_cliente: isPagoCliente,
          instalacao_id: inst.id,
          instalador_id: inst.instalador_id,
          created_at: inst.created_at,
          updated_at: inst.created_at,
          instalador: inst.instalador,
        });
      }
    }

    // Ordena unificadamente por data de competencia decrescente
    return listaUnificada.sort((a, b) => b.data_competencia.localeCompare(a.data_competencia));
  } catch (err) {
    console.error("Excecao ao compor fluxo financeiro do banco:", err);
    return [];
  }
}

export function calcularResumoFluxoCaixa(
  transacoes: TransacaoFinanceira[],
  saldoAnteriorTransportado = 0,
): ResumoFluxoCaixa {
  let entradasRealizadas = 0;
  let entradasPrevistas = 0;
  let saidasRealizadas = 0;
  let saidasPrevistas = 0;

  for (const t of transacoes) {
    const v = Number(t.valor || 0);

    if (t.tipo === "entrada") {
      if (t.status === "concluido") {
        entradasRealizadas += v;
      } else if (t.status === "pendente") {
        entradasPrevistas += v;
      }
    } else if (t.tipo === "saida") {
      if (t.status === "concluido") {
        saidasRealizadas += v;
      } else if (t.status === "pendente") {
        saidasPrevistas += v;
      }
    }
  }

  const saldoAtual = Number(
    (saldoAnteriorTransportado + entradasRealizadas - saidasRealizadas).toFixed(2),
  );
  const saldoProjetadoFinal = Number((saldoAtual + entradasPrevistas - saidasPrevistas).toFixed(2));

  return {
    saldoAtual,
    entradasRealizadas: Number(entradasRealizadas.toFixed(2)),
    entradasPrevistas: Number(entradasPrevistas.toFixed(2)),
    saidasRealizadas: Number(saidasRealizadas.toFixed(2)),
    saidasPrevistas: Number(saidasPrevistas.toFixed(2)),
    totalTransacoes: transacoes.length,
    saldoAnteriorTransportado: Number(saldoAnteriorTransportado.toFixed(2)),
    saldoProjetadoFinal,
  };
}

export function calcularDREOperacional(transacoes: TransacaoFinanceira[]): DREOperacional {
  let receitaBruta = 0;
  let custoInstalacoes = 0;
  let custoConectividade = 0;
  let despesasOperacionais = 0;

  for (const t of transacoes) {
    if (t.status !== "concluido") continue;

    const v = Number(t.valor || 0);
    if (t.tipo === "entrada") {
      receitaBruta += v;
    } else if (t.tipo === "saida") {
      if (t.categoria === "repasse_instalador") {
        custoInstalacoes += v;
      } else if (t.categoria === "chips_conectividade") {
        custoConectividade += v;
      } else {
        despesasOperacionais += v;
      }
    }
  }

  const lucroOperacionalLiquido =
    receitaBruta - custoInstalacoes - custoConectividade - despesasOperacionais;

  const margemOperacionalPercentual =
    receitaBruta > 0 ? (lucroOperacionalLiquido / receitaBruta) * 100 : 0;

  return {
    receitaBruta,
    custoInstalacoes,
    custoConectividade,
    despesasOperacionais,
    lucroOperacionalLiquido,
    margemOperacionalPercentual,
  };
}

export async function criarTransacaoManual(dados: NovaTransacaoInput): Promise<{
  success: boolean;
  message: string;
  transacoesCriadas?: number;
  transacao?: TransacaoFinanceira;
}> {
  try {
    const moeda = dados.moeda || "BRL";
    const cotacao = dados.cotacaoMoeda && dados.cotacaoMoeda > 0 ? Number(dados.cotacaoMoeda) : 1.0;
    const isDolar = moeda === "USD";

    const valorOriginalInformado = Number(dados.valorMoedaOriginal || dados.valor || 0);
    const valorBaseBrl = isDolar
      ? Number((valorOriginalInformado * cotacao).toFixed(2))
      : Number(dados.valor || 0);

    const modalidade = dados.modalidade || "avulsa";
    const dataBase = dados.data_competencia || new Date().toISOString().split("T")[0];
    const dataVencBase = dados.data_vencimento || dataBase;

    const fontePagamento = dados.fonte_pagamento || "caixa_empresa";
    const isOperadorAdm = fontePagamento === "operador_adm";
    const statusRessarcimento = isOperadorAdm
      ? dados.status_ressarcimento || "pendente"
      : "nao_aplicavel";
    const dataRessarcimento =
      dados.data_ressarcimento ||
      (statusRessarcimento === "ressarcido" ? new Date().toISOString() : null);

    // 1. Despesa Avulsa (única)
    if (modalidade === "avulsa" || dados.tipo === "entrada") {
      const dataPag = dados.status === "concluido" ? new Date().toISOString() : null;

      const payload = {
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: dados.descricao.trim(),
        valor: valorBaseBrl,
        data_competencia: dataBase,
        data_vencimento: dataVencBase,
        data_pagamento: dataPag,
        status: dados.status,
        observacoes: dados.observacoes?.trim() || null,
        modalidade: "avulsa",
        moeda,
        valor_moeda_original: isDolar ? valorOriginalInformado : null,
        cotacao_moeda: isDolar ? cotacao : 1.0,
        fonte_pagamento: fontePagamento,
        responsavel_pagamento_id: dados.responsavel_pagamento_id || null,
        responsavel_pagamento_nome: dados.responsavel_pagamento_nome?.trim() || null,
        status_ressarcimento: statusRessarcimento,
        data_ressarcimento: dataRessarcimento,
      };

      try {
        const { data, error } = await supabase
          .from("transacoes_financeiras" as any)
          .insert(payload)
          .select()
          .single();

        if (!error && data) {
          return {
            success: true,
            message: "Transação registrada com sucesso no livro-caixa!",
            transacao: data,
            transacoesCriadas: 1,
          };
        }
      } catch {
        // Fallback para schema sem colunas novas
      }

      // Fallback tolerante
      let metaObs = dados.observacoes?.trim() || "";
      if (isDolar) {
        metaObs =
          `[MOEDA:USD | VALOR_USD:${valorOriginalInformado} | COTACAO:${cotacao}] ${metaObs}`.trim();
      }
      if (isOperadorAdm) {
        const respTag = dados.responsavel_pagamento_nome
          ? ` | RESP:${dados.responsavel_pagamento_nome.trim()}`
          : "";
        const respIdTag = dados.responsavel_pagamento_id
          ? ` | RESP_ID:${dados.responsavel_pagamento_id}`
          : "";
        const ressarcTag = ` | RESSARC:${statusRessarcimento}`;
        const dataRessarcTag = dataRessarcimento ? ` | DATA_RESSARC:${dataRessarcimento}` : "";
        metaObs =
          `[FONTE:operador_adm${respTag}${respIdTag}${ressarcTag}${dataRessarcTag}] ${metaObs}`.trim();
      }

      const { data: fbData, error: fbErr } = await supabase
        .from("transacoes_financeiras" as any)
        .insert({
          tipo: dados.tipo,
          categoria: dados.categoria,
          descricao: dados.descricao.trim(),
          valor: valorBaseBrl,
          data_competencia: dataBase,
          data_vencimento: dataVencBase,
          data_pagamento: dataPag,
          status: dados.status,
          observacoes: metaObs || null,
        })
        .select()
        .single();

      if (fbErr) {
        return { success: false, message: fbErr.message || "Erro ao registrar transação." };
      }

      return {
        success: true,
        message: "Transação registrada com sucesso!",
        transacao: fbData,
        transacoesCriadas: 1,
      };
    }

    // 2. Despesa Parcelada a Prazo (ex: 6x, 10x) ou Recorrente Mensal Contínua
    const totalParcelas =
      modalidade === "parcelada"
        ? Math.max(2, Math.min(60, Number(dados.quantidadeParcelas || 2)))
        : 12;

    const tipoValor = dados.tipoValor || "parcela";
    const valorParcelaBrl =
      modalidade === "parcelada" && tipoValor === "total"
        ? Number((valorBaseBrl / totalParcelas).toFixed(2))
        : valorBaseBrl;

    const valorParcelaOrig = isDolar
      ? modalidade === "parcelada" && tipoValor === "total"
        ? Number((valorOriginalInformado / totalParcelas).toFixed(2))
        : valorOriginalInformado
      : valorParcelaBrl;

    const prefixo = modalidade === "parcelada" ? "PARC" : "REC";
    const recorrenciaId = `${prefixo}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const loteParaInserir: any[] = [];
    const [anoIni, mesIni, diaIni] = dataBase.split("-").map(Number);
    const [, , diaVencNum] = dataVencBase.split("-").map(Number);

    for (let i = 0; i < totalParcelas; i++) {
      const dComp = new Date(anoIni, mesIni - 1 + i, diaIni || 1);
      const anoC = dComp.getFullYear();
      const mesC = dComp.getMonth() + 1;
      const ultimoDiaC = new Date(anoC, mesC, 0).getDate();
      const diaC = Math.min(diaIni || 1, ultimoDiaC);
      const dataCompStr = `${anoC}-${String(mesC).padStart(2, "0")}-${String(diaC).padStart(2, "0")}`;

      const diaVencFinal = Math.min(diaVencNum || diaC, ultimoDiaC);
      const dataVencStr = `${anoC}-${String(mesC).padStart(2, "0")}-${String(diaVencFinal).padStart(2, "0")}`;

      const statusParcela = i === 0 ? dados.status : "pendente";
      const dataPagParcela = statusParcela === "concluido" ? new Date().toISOString() : null;

      const descSufixo =
        modalidade === "parcelada" ? ` (${i + 1}/${totalParcelas})` : ` (Recorrente)`;
      const descFinal = `${dados.descricao.trim()}${descSufixo}`;

      let metaTag = isDolar
        ? `[REC:${recorrenciaId} | MOEDA:USD | VALOR_USD:${valorParcelaOrig} | COTACAO:${cotacao}]`
        : `[REC:${recorrenciaId}]`;

      if (isOperadorAdm) {
        const respTag = dados.responsavel_pagamento_nome
          ? ` | RESP:${dados.responsavel_pagamento_nome.trim()}`
          : "";
        const respIdTag = dados.responsavel_pagamento_id
          ? ` | RESP_ID:${dados.responsavel_pagamento_id}`
          : "";
        metaTag = `${metaTag} [FONTE:operador_adm${respTag}${respIdTag} | RESSARC:${statusRessarcimento}]`;
      }

      const obsFinal = `${metaTag} ${dados.observacoes?.trim() || ""}`.trim();

      loteParaInserir.push({
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: descFinal,
        valor: valorParcelaBrl,
        data_competencia: dataCompStr,
        data_vencimento: dataVencStr,
        data_pagamento: dataPagParcela,
        status: statusParcela,
        observacoes: obsFinal,
        recorrencia_id: recorrenciaId,
        modalidade,
        parcela_atual: modalidade === "parcelada" ? i + 1 : null,
        total_parcelas: modalidade === "parcelada" ? totalParcelas : null,
        recorrencia_ativa: true,
        moeda,
        valor_moeda_original: isDolar ? valorParcelaOrig : null,
        cotacao_moeda: isDolar ? cotacao : 1.0,
        fonte_pagamento: fontePagamento,
        responsavel_pagamento_id: dados.responsavel_pagamento_id || null,
        responsavel_pagamento_nome: dados.responsavel_pagamento_nome?.trim() || null,
        status_ressarcimento: statusRessarcimento,
        data_ressarcimento: dataRessarcimento,
      });
    }

    // Tenta inserir lote com colunas enriquecidas
    let insercaoOk = false;
    try {
      const { error: batchErr } = await supabase
        .from("transacoes_financeiras" as any)
        .insert(loteParaInserir);

      if (!batchErr) {
        insercaoOk = true;
      }
    } catch {
      // Fallback
    }

    // Fallback tolerante para colunas canônicas caso ainda não existam colunas novas
    if (!insercaoOk) {
      const loteFallback = loteParaInserir.map((p) => ({
        tipo: p.tipo,
        categoria: p.categoria,
        descricao: p.descricao,
        valor: p.valor,
        data_competencia: p.data_competencia,
        data_vencimento: p.data_vencimento,
        data_pagamento: p.data_pagamento,
        status: p.status,
        observacoes: p.observacoes,
      }));

      const { error: fbBatchErr } = await supabase
        .from("transacoes_financeiras" as any)
        .insert(loteFallback);

      if (fbBatchErr) {
        return {
          success: false,
          message: fbBatchErr.message || "Erro ao gerar parcelas da despesa.",
        };
      }
    }

    const mensagemSucesso =
      modalidade === "parcelada"
        ? `${totalParcelas} parcelas geradas com sucesso para o planejamento financeiro!`
        : `Despesa recorrente mensal registrada! ${totalParcelas} meses futuros adicionados ao planejamento.`;

    return {
      success: true,
      message: mensagemSucesso,
      transacoesCriadas: totalParcelas,
    };
  } catch (err: any) {
    console.error("Exceção na criação da transação:", err);
    return {
      success: false,
      message: err?.message || "Falha de comunicação com o banco de dados.",
    };
  }
}

/**
 * Verifica se já existe uma transação idêntica/semelhante cadastrada na mesma data
 * para alertar o usuário contra duplicidades acidentais.
 */
export async function buscarTransacaoSemelhante(dados: {
  tipo: TipoTransacao;
  descricao: string;
  valor: number;
  dataCompetencia: string;
  idIgnorar?: string;
}): Promise<{ existe: boolean; transacao?: TransacaoFinanceira }> {
  try {
    const descTrim = dados.descricao.trim().toLowerCase();
    const { data, error } = await supabase
      .from("transacoes_financeiras" as any)
      .select("*")
      .eq("tipo", dados.tipo)
      .eq("data_competencia", dados.dataCompetencia)
      .neq("status", "cancelado");

    if (error || !data || data.length === 0) {
      return { existe: false };
    }

    const match = data.find((t: any) => {
      if (dados.idIgnorar && t.id === dados.idIgnorar) return false;
      const descBanco = (t.descricao || "").trim().toLowerCase();
      const valorBanco = Number(t.valor || 0);
      const valorDiff = Math.abs(valorBanco - dados.valor);
      return descBanco === descTrim && valorDiff < 0.05;
    });

    if (match) {
      return { existe: true, transacao: match as TransacaoFinanceira };
    }

    return { existe: false };
  } catch (err) {
    console.error("Erro ao verificar transação semelhante:", err);
    return { existe: false };
  }
}

/**
 * Atualiza um lançamento manual existente no livro-caixa (receita ou despesa).
 * Permite corrigir descrição, categoria, valor, datas, status, moeda e observações.
 */
export async function atualizarTransacaoManual(
  id: string,
  dados: {
    tipo: TipoTransacao;
    categoria: CategoriaTransacao;
    descricao: string;
    valor: number;
    data_competencia: string;
    data_vencimento?: string;
    status: StatusTransacao;
    observacoes?: string;
    moeda?: MoedaTransacao;
    valorMoedaOriginal?: number;
    cotacaoMoeda?: number;
    fonte_pagamento?: FontePagamentoTransacao;
    responsavel_pagamento_id?: string | null;
    responsavel_pagamento_nome?: string | null;
    status_ressarcimento?: StatusRessarcimento;
    data_ressarcimento?: string | null;
    escopoRecorrencia?: "somente_esta" | "todas_futuras";
  },
): Promise<{
  success: boolean;
  message: string;
  transacao?: TransacaoFinanceira;
}> {
  try {
    if (!id || id.startsWith("m-") || id.startsWith("i-")) {
      return {
        success: false,
        message:
          "Apenas lançamentos avulsos ou manuais do livro-caixa podem ser editados diretamente.",
      };
    }

    const moeda = dados.moeda || "BRL";
    const cotacao = dados.cotacaoMoeda && dados.cotacaoMoeda > 0 ? Number(dados.cotacaoMoeda) : 1.0;
    const isDolar = moeda === "USD";

    const valorOriginalInformado = Number(dados.valorMoedaOriginal || dados.valor || 0);
    const valorBaseBrl = isDolar
      ? Number((valorOriginalInformado * cotacao).toFixed(2))
      : Number(dados.valor || 0);

    const dataBase = dados.data_competencia || new Date().toISOString().split("T")[0];
    const dataVencBase = dados.data_vencimento || dataBase;
    const dataPag = dados.status === "concluido" ? new Date().toISOString() : null;

    const fontePagamento = dados.fonte_pagamento || "caixa_empresa";
    const isOperadorAdm = fontePagamento === "operador_adm";
    const statusRessarcimento = isOperadorAdm
      ? dados.status_ressarcimento || "pendente"
      : "nao_aplicavel";
    const dataRessarcimento =
      dados.data_ressarcimento ||
      (statusRessarcimento === "ressarcido" ? new Date().toISOString() : null);

    // Busca o registro existente no banco para preservar dados de recorrência, mensalidade e cliente
    const { data: transacaoExistente } = await supabase
      .from("transacoes_financeiras" as any)
      .select(
        "id, recorrencia_id, modalidade, descricao, categoria, tipo, cliente_id, mensalidade_id, data_competencia, data_vencimento, observacoes",
      )
      .eq("id", id)
      .maybeSingle();

    let recorrenciaId = transacaoExistente?.recorrencia_id || null;
    const obsOrig = transacaoExistente?.observacoes || "";
    if (!recorrenciaId && obsOrig.includes("[REC:")) {
      const matchRec = obsOrig.match(/\[REC:([A-Za-z0-9_-]+)/);
      if (matchRec) recorrenciaId = matchRec[1].trim();
    }
    if (!recorrenciaId && dados.observacoes?.includes("[REC:")) {
      const matchRec = dados.observacoes.match(/\[REC:([A-Za-z0-9_-]+)/);
      if (matchRec) recorrenciaId = matchRec[1].trim();
    }

    const isRecorrenteDetectado = Boolean(
      recorrenciaId ||
      transacaoExistente?.modalidade === "recorrente" ||
      dados.descricao.includes("(Recorrente)") ||
      transacaoExistente?.descricao?.includes("(Recorrente)") ||
      dados.escopoRecorrencia === "todas_futuras",
    );

    if (dados.escopoRecorrencia === "todas_futuras" && !recorrenciaId && isRecorrenteDetectado) {
      recorrenciaId = `REC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    }

    const observacoesLimpas = (dados.observacoes || "").replace(/\[FONTE:[^\]]+\]/g, "").trim();

    const payload: any = {
      tipo: dados.tipo,
      categoria: dados.categoria,
      descricao: dados.descricao.trim(),
      valor: valorBaseBrl,
      data_competencia: dataBase,
      data_vencimento: dataVencBase,
      data_pagamento: dataPag,
      status: dados.status,
      observacoes: observacoesLimpas || null,
      moeda,
      valor_moeda_original: isDolar ? valorOriginalInformado : null,
      cotacao_moeda: isDolar ? cotacao : 1.0,
      fonte_pagamento: fontePagamento,
      responsavel_pagamento_id: isOperadorAdm ? dados.responsavel_pagamento_id || null : null,
      responsavel_pagamento_nome: isOperadorAdm
        ? dados.responsavel_pagamento_nome?.trim() || null
        : null,
      status_ressarcimento: statusRessarcimento,
      data_ressarcimento: dataRessarcimento,
      updated_at: new Date().toISOString(),
    };

    if (recorrenciaId) {
      payload.recorrencia_id = recorrenciaId;
      payload.modalidade = "recorrente";
    }

    // Função interna que sincroniza de ponta a ponta as parcelas futuras da mesma recorrência
    const sincronizarFuturas = async (): Promise<number> => {
      if (dados.escopoRecorrencia !== "todas_futuras") return 0;
      let count = 0;
      const novoDiaVencimento = dados.data_vencimento
        ? Number(dados.data_vencimento.split("-")[2])
        : null;

      // Se houver cliente vinculado e novo dia, atualiza o dia_vencimento no cliente
      const clienteIdVinculado = transacaoExistente?.cliente_id;
      if (
        clienteIdVinculado &&
        novoDiaVencimento &&
        novoDiaVencimento >= 1 &&
        novoDiaVencimento <= 31
      ) {
        try {
          const { error: errCli } = await supabase
            .from("clientes")
            .update({ dia_vencimento: novoDiaVencimento, updated_at: new Date().toISOString() })
            .eq("id", clienteIdVinculado);

          if (errCli) {
            await supabase
              .from("clientes")
              .update({ dia_vencimento: novoDiaVencimento })
              .eq("id", clienteIdVinculado);
          }
        } catch (_err) {
          // Ignora falha de permissão no update do cliente
        }
      }

      // Sincroniza espelho da transação atual na mensalidade se existir
      const mensalidadeIdAtual = transacaoExistente?.mensalidade_id;
      if (mensalidadeIdAtual) {
        try {
          const statusAtualizadoMens =
            dataVencBase < new Date().toISOString().split("T")[0] ? "vencido" : "pendente";
          await supabase
            .from("mensalidades")
            .update({
              data_vencimento: dataVencBase,
              status: dados.status === "concluido" ? "pago" : statusAtualizadoMens,
              updated_at: new Date().toISOString(),
            })
            .eq("id", mensalidadeIdAtual);
        } catch (_err) {
          // Ignora falha se espelho da mensalidade não existir
        }
      }

      // Busca futuras da recorrência via recorrencia_id, observações ou descrição base
      const descBase = (transacaoExistente?.descricao || dados.descricao || "")
        .replace(/\(Recorrente\)/g, "")
        .replace(/\(\d+\/\d+\)/g, "")
        .trim();

      const mapaFuturas = new Map<string, any>();

      if (recorrenciaId) {
        const { data: dCol } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, data_competencia, data_vencimento, status, observacoes, mensalidade_id")
          .eq("recorrencia_id", recorrenciaId)
          .neq("id", id)
          .neq("status", "concluido");
        (dCol || []).forEach((t: any) => mapaFuturas.set(t.id, t));

        const { data: dObs } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, data_competencia, data_vencimento, status, observacoes, mensalidade_id")
          .ilike("observacoes", `%[REC:${recorrenciaId}%`)
          .neq("id", id)
          .neq("status", "concluido");
        (dObs || []).forEach((t: any) => mapaFuturas.set(t.id, t));
      }

      if (descBase && descBase.length >= 3) {
        const { data: dDesc } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, data_competencia, data_vencimento, status, observacoes, mensalidade_id")
          .ilike("descricao", `%${descBase}%`)
          .eq("tipo", dados.tipo)
          .eq("categoria", dados.categoria)
          .neq("id", id)
          .neq("status", "concluido");
        (dDesc || []).forEach((t: any) => mapaFuturas.set(t.id, t));
      }

      const refDataAtual =
        transacaoExistente?.data_vencimento || transacaoExistente?.data_competencia || dataBase;
      const [anoAtualRef, mesAtualRef] = refDataAtual.split("-").slice(0, 2).map(Number);

      for (const transFutura of mapaFuturas.values()) {
        const refF = transFutura.data_vencimento || transFutura.data_competencia || "";
        const [anoF, mesF] = refF.split("-").slice(0, 2).map(Number);

        if (!anoF || !mesF || mesF <= 0 || mesF > 12) {
          continue;
        }

        const isFutura =
          anoF > anoAtualRef ||
          (anoF === anoAtualRef && mesF >= mesAtualRef) ||
          Boolean(refF && refDataAtual && refF >= refDataAtual);

        if (!isFutura) continue;

        let novaDataVencFutura: string | undefined = undefined;
        if (novoDiaVencimento) {
          const ultimoDia = new Date(anoF, mesF, 0).getDate();
          const diaFinal = Math.min(novoDiaVencimento, ultimoDia);
          novaDataVencFutura = `${anoF}-${String(mesF).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
        }

        const obsFuturaLimpa = (transFutura.observacoes || "")
          .replace(/\[MOEDA:[^\]]+\]/g, "")
          .replace(/\[REC:[^\]]+\]/g, "")
          .replace(/\[FONTE:[^\]]+\]/g, "")
          .trim();

        let metaTagFutura = isDolar
          ? `[REC:${recorrenciaId} | MOEDA:USD | VALOR_USD:${valorOriginalInformado} | COTACAO:${cotacao}]`
          : `[REC:${recorrenciaId}]`;

        if (isOperadorAdm) {
          const respTag = dados.responsavel_pagamento_nome
            ? ` | RESP:${dados.responsavel_pagamento_nome.trim()}`
            : "";
          const respIdTag = dados.responsavel_pagamento_id
            ? ` | RESP_ID:${dados.responsavel_pagamento_id}`
            : "";
          metaTagFutura = `${metaTagFutura} [FONTE:operador_adm${respTag}${respIdTag} | RESSARC:${statusRessarcimento}]`;
        }

        const obsFinalFutura = `${metaTagFutura} ${obsFuturaLimpa}`.trim();

        const payloadFuturo: any = {
          tipo: dados.tipo,
          categoria: dados.categoria,
          valor: valorBaseBrl,
          moeda,
          valor_moeda_original: isDolar ? valorOriginalInformado : null,
          cotacao_moeda: isDolar ? cotacao : 1.0,
          fonte_pagamento: fontePagamento,
          responsavel_pagamento_id: dados.responsavel_pagamento_id || null,
          responsavel_pagamento_nome: dados.responsavel_pagamento_nome?.trim() || null,
          status_ressarcimento: statusRessarcimento,
          recorrencia_id: recorrenciaId,
          modalidade: "recorrente",
          observacoes: obsFinalFutura,
          updated_at: new Date().toISOString(),
        };

        if (novaDataVencFutura) {
          payloadFuturo.data_vencimento = novaDataVencFutura;
        }

        const { error: errUpd } = await supabase
          .from("transacoes_financeiras" as any)
          .update(payloadFuturo)
          .eq("id", transFutura.id);

        if (errUpd) {
          const payloadFb: any = {
            tipo: dados.tipo,
            categoria: dados.categoria,
            valor: valorBaseBrl,
            observacoes: obsFinalFutura,
            updated_at: new Date().toISOString(),
          };
          if (novaDataVencFutura) {
            payloadFb.data_vencimento = novaDataVencFutura;
          }
          const { error: errFb } = await supabase
            .from("transacoes_financeiras" as any)
            .update(payloadFb)
            .eq("id", transFutura.id);

          if (errFb && novaDataVencFutura) {
            await supabase
              .from("transacoes_financeiras" as any)
              .update({ data_vencimento: novaDataVencFutura })
              .eq("id", transFutura.id);
          }
        }

        // Se a transação futura tiver vínculo com mensalidades, atualiza a mensalidade também!
        if (transFutura.mensalidade_id && novaDataVencFutura) {
          try {
            const statusFutMens =
              novaDataVencFutura < new Date().toISOString().split("T")[0] ? "vencido" : "pendente";
            const { error: errMens } = await supabase
              .from("mensalidades")
              .update({
                data_vencimento: novaDataVencFutura,
                status: statusFutMens,
                updated_at: new Date().toISOString(),
              })
              .eq("id", transFutura.mensalidade_id);

            if (errMens) {
              await supabase
                .from("mensalidades")
                .update({
                  data_vencimento: novaDataVencFutura,
                  status: statusFutMens,
                })
                .eq("id", transFutura.mensalidade_id);
            }
          } catch (_err) {
            // Ignora se mensalidade não puder ser atualizada
          }
        }

        count++;
      }

      return count;
    };

    try {
      const { data, error } = await supabase
        .from("transacoes_financeiras" as any)
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (!error && data) {
        const transacaoAtualizada = data as TransacaoFinanceira;
        const totalFuturasSincronizadas = await sincronizarFuturas();

        let msgFinal = "Lançamento atualizado com sucesso no livro-caixa!";
        if (totalFuturasSincronizadas > 0) {
          msgFinal = `Lançamento atualizado e ${totalFuturasSincronizadas} parcelas futuras sincronizadas com sucesso!`;
        } else if (recorrenciaId && dados.escopoRecorrencia === "somente_esta") {
          msgFinal = "Lançamento atualizado com sucesso (parcelas futuras mantidas).";
        }

        return {
          success: true,
          message: msgFinal,
          transacao: transacaoAtualizada,
        };
      }
    } catch {
      // Fallback para schema sem colunas novas
    }

    // Fallback tolerante para colunas básicas
    let metaObs = dados.observacoes?.trim() || "";
    if (isDolar) {
      metaObs =
        `[MOEDA:USD | VALOR_USD:${valorOriginalInformado} | COTACAO:${cotacao}] ${metaObs}`.trim();
    }
    if (recorrenciaId) {
      metaObs = `[REC:${recorrenciaId}] ${metaObs}`.trim();
    }
    if (isOperadorAdm) {
      const respTag = dados.responsavel_pagamento_nome
        ? ` | RESP:${dados.responsavel_pagamento_nome.trim()}`
        : "";
      const respIdTag = dados.responsavel_pagamento_id
        ? ` | RESP_ID:${dados.responsavel_pagamento_id}`
        : "";
      const ressarcTag = ` | RESSARC:${statusRessarcimento}`;
      const dataRessarcTag = dataRessarcimento ? ` | DATA_RESSARC:${dataRessarcimento}` : "";
      metaObs =
        `[FONTE:operador_adm${respTag}${respIdTag}${ressarcTag}${dataRessarcTag}] ${metaObs}`.trim();
    }

    const { data: fbData, error: fbErr } = await supabase
      .from("transacoes_financeiras" as any)
      .update({
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: dados.descricao.trim(),
        valor: valorBaseBrl,
        data_competencia: dataBase,
        data_vencimento: dataVencBase,
        data_pagamento: dataPag,
        status: dados.status,
        observacoes: metaObs || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (fbErr) {
      return { success: false, message: fbErr.message || "Erro ao atualizar lançamento." };
    }

    const fbTransacao = fbData as TransacaoFinanceira;
    const fbFuturasCount = await sincronizarFuturas();

    const msgFbFinal =
      fbFuturasCount > 0
        ? `Lançamento atualizado e ${fbFuturasCount} parcelas futuras sincronizadas com sucesso!`
        : "Lançamento atualizado com sucesso!";

    return {
      success: true,
      message: msgFbFinal,
      transacao: fbTransacao,
    };
  } catch (err: any) {
    console.error("Exceção na atualização da transação:", err);
    return {
      success: false,
      message: err?.message || "Falha de comunicação com o banco de dados.",
    };
  }
}

/**
 * Encerra uma receita ou despesa recorrente contínua.
 * EXCLUI do banco de dados todas as prestações futuras que ainda estão com status 'pendente' (não quitadas).
 * As competências anteriores já quitadas ('concluido' ou 'pago') permanecem preservadas no histórico contábil.
 */
export async function encerrarRecorrencia(
  recorrenciaId: string,
): Promise<{ success: boolean; message: string; canceladas: number }> {
  try {
    if (!recorrenciaId) {
      return { success: false, message: "Identificador de recorrência inválido.", canceladas: 0 };
    }

    // 1. Busca todas as transações ligadas a esta recorrência (coluna direta ou meta tag em observações)
    const { data: transacoesDiretas } = await supabase
      .from("transacoes_financeiras" as any)
      .select("id, status, recorrencia_id, observacoes")
      .eq("recorrencia_id", recorrenciaId);

    const { data: transacoesFallback } = await supabase
      .from("transacoes_financeiras" as any)
      .select("id, status, recorrencia_id, observacoes")
      .ilike("observacoes", `%[REC:${recorrenciaId}%`);

    const mapa = new Map<string, any>();
    (transacoesDiretas || []).forEach((t: any) => mapa.set(t.id, t));
    (transacoesFallback || []).forEach((t: any) => mapa.set(t.id, t));

    const todas = Array.from(mapa.values());
    const pendentes = todas.filter((t) => t.status === "pendente");
    const quitadas = todas.filter((t) => t.status !== "pendente");

    let excluidas = 0;

    // 2. EXCLUI efetivamente as prestações não quitadas (status = 'pendente')
    if (pendentes.length > 0) {
      const idsPendentes = pendentes.map((t) => t.id);
      const { error: delErr } = await supabase
        .from("transacoes_financeiras" as any)
        .delete()
        .in("id", idsPendentes);

      if (!delErr) {
        excluidas = idsPendentes.length;
      } else {
        // Fallback: tenta deletar uma por uma
        for (const id of idsPendentes) {
          const { error: singleErr } = await supabase
            .from("transacoes_financeiras" as any)
            .delete()
            .eq("id", id);
          if (!singleErr) excluidas++;
        }
      }
    }

    // 3. Nas prestações JÁ QUITADAS, preserva o registro contábil e apenas desativa a flag de recorrência
    if (quitadas.length > 0) {
      const idsQuitadas = quitadas.map((t) => t.id);
      await supabase
        .from("transacoes_financeiras" as any)
        .update({
          recorrencia_ativa: false,
          updated_at: new Date().toISOString(),
        })
        .in("id", idsQuitadas);
    }

    return {
      success: true,
      message: `Recorrência encerrada com sucesso! ${excluidas} prestação(ões) não quitada(s) foram excluídas. O histórico quitado foi preservado.`,
      canceladas: excluidas,
    };
  } catch (err: any) {
    console.error("Erro ao encerrar recorrência:", err);
    return {
      success: false,
      message: err?.message || "Falha ao encerrar recorrência.",
      canceladas: 0,
    };
  }
}

/**
 * Alias retrocompatível para chamadas legadas
 */
export const encerrarDespesaRecorrente = encerrarRecorrencia;

/**
 * Garante que todas as despesas e receitas recorrentes ativas tenham sempre
 * uma janela rolante (Rolling Window) de pelo menos 12 meses futuros projetados.
 * À medida que o tempo avança, projeta novas competências mensais automaticamente,
 * garantindo que despesas contínuas nunca expirem sozinhas e não tenham data final.
 */
export async function estenderJanelaRecorrenciasPerpetuas(
  horizonteMinimoMeses: number = 12,
): Promise<{ recorrenciasProcessadas: number; novasCompetenciasGeradas: number }> {
  try {
    const { data: recorrentes, error } = await supabase
      .from("transacoes_financeiras" as any)
      .select("*")
      .eq("modalidade", "recorrente")
      .eq("recorrencia_ativa", true);

    if (error || !recorrentes || recorrentes.length === 0) {
      return { recorrenciasProcessadas: 0, novasCompetenciasGeradas: 0 };
    }

    const grupos = new Map<string, any[]>();
    for (const t of recorrentes) {
      const recId = t.recorrencia_id || t.observacoes?.match(/\[REC:([A-Za-z0-9_-]+)/)?.[1] || null;
      if (!recId) continue;
      if (!grupos.has(recId)) grupos.set(recId, []);
      grupos.get(recId)!.push(t);
    }

    const hoje = new Date();
    const dataAlvoLimite = new Date(hoje.getFullYear(), hoje.getMonth() + horizonteMinimoMeses, 1);

    let novasCompetenciasGeradas = 0;
    let recorrenciasProcessadas = 0;

    for (const [recId, transacoes] of grupos.entries()) {
      recorrenciasProcessadas++;
      transacoes.sort((a, b) => b.data_competencia.localeCompare(a.data_competencia));
      const ultimaTransacao = transacoes[0];
      if (!ultimaTransacao) continue;

      const [anoUlt, mesUlt, diaUlt] = ultimaTransacao.data_competencia.split("-").map(Number);
      const loteNovas: any[] = [];
      let cursorData = new Date(anoUlt, mesUlt, 1); // Próximo mês

      while (cursorData <= dataAlvoLimite) {
        const anoN = cursorData.getFullYear();
        const mesN = cursorData.getMonth() + 1;
        const ultimoDiaMes = new Date(anoN, mesN, 0).getDate();
        const diaN = Math.min(diaUlt || 1, ultimoDiaMes);

        const dataCompStr = `${anoN}-${String(mesN).padStart(2, "0")}-${String(diaN).padStart(2, "0")}`;

        const jaExiste = transacoes.some((t) => t.data_competencia === dataCompStr);
        if (!jaExiste) {
          const obsBase = (ultimaTransacao.observacoes || "")
            .replace(/\[MOEDA:[^\]]+\]/g, "")
            .replace(/\[REC:[^\]]+\]/g, "")
            .replace(/\[FONTE:[^\]]+\]/g, "")
            .trim();

          const isDolar = ultimaTransacao.moeda === "USD";
          const cotacao = ultimaTransacao.cotacao_moeda || 1.0;
          const valorOrig = ultimaTransacao.valor_moeda_original || ultimaTransacao.valor;

          let metaTag = isDolar
            ? `[REC:${recId} | MOEDA:USD | VALOR_USD:${valorOrig} | COTACAO:${cotacao}]`
            : `[REC:${recId}]`;

          if (ultimaTransacao.fonte_pagamento === "operador_adm") {
            const respNome = ultimaTransacao.responsavel_pagamento_nome
              ? ` | RESP:${ultimaTransacao.responsavel_pagamento_nome}`
              : "";
            const respId = ultimaTransacao.responsavel_pagamento_id
              ? ` | RESP_ID:${ultimaTransacao.responsavel_pagamento_id}`
              : "";
            metaTag = `${metaTag} [FONTE:operador_adm${respNome}${respId} | RESSARC:pendente]`;
          }

          loteNovas.push({
            tipo: ultimaTransacao.tipo,
            categoria: ultimaTransacao.categoria,
            descricao: ultimaTransacao.descricao,
            valor: ultimaTransacao.valor,
            data_competencia: dataCompStr,
            data_vencimento: dataCompStr,
            data_pagamento: null,
            status: "pendente",
            observacoes: `${metaTag} ${obsBase}`.trim(),
            recorrencia_id: recId,
            modalidade: "recorrente",
            parcela_atual: null,
            total_parcelas: null,
            recorrencia_ativa: true,
            moeda: ultimaTransacao.moeda || "BRL",
            valor_moeda_original: ultimaTransacao.valor_moeda_original || null,
            cotacao_moeda: ultimaTransacao.cotacao_moeda || 1.0,
            fonte_pagamento: ultimaTransacao.fonte_pagamento || "caixa_empresa",
            responsavel_pagamento_id:
              ultimaTransacao.fonte_pagamento === "operador_adm"
                ? ultimaTransacao.responsavel_pagamento_id || null
                : null,
            responsavel_pagamento_nome:
              ultimaTransacao.fonte_pagamento === "operador_adm"
                ? ultimaTransacao.responsavel_pagamento_nome || null
                : null,
            status_ressarcimento:
              ultimaTransacao.fonte_pagamento === "operador_adm" ? "pendente" : "nao_aplicavel",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        cursorData = new Date(anoN, mesN, 1);
      }

      if (loteNovas.length > 0) {
        try {
          await supabase.from("transacoes_financeiras" as any).insert(loteNovas);
          novasCompetenciasGeradas += loteNovas.length;
        } catch (insertErr) {
          console.warn("[FINANCEIRO] Erro ao inserir lote de extensão de recorrência:", insertErr);
        }
      }
    }

    return { recorrenciasProcessadas, novasCompetenciasGeradas };
  } catch (err) {
    console.warn("[FINANCEIRO] Exceção em estenderJanelaRecorrenciasPerpetuas:", err);
    return { recorrenciasProcessadas: 0, novasCompetenciasGeradas: 0 };
  }
}

/**
 * Regra canônica Hunter: a opção "Liquidado pelo Cliente" só se aplica a saídas
 * referentes a instalação para pagamento ao técnico instalador.
 */
export function podeLiquidarPeloCliente(
  transacao?: Pick<TransacaoFinanceira, "id" | "tipo" | "categoria" | "instalacao_id"> | null,
): boolean {
  if (!transacao) return false;
  if (transacao.tipo !== "saida") return false;
  return (
    transacao.categoria === "repasse_instalador" ||
    Boolean(transacao.instalacao_id) ||
    String(transacao.id || "").startsWith("i-")
  );
}

export interface OpcoesLiquidacaoTransacao {
  liquidadoPeloCliente?: boolean;
  fontePagamento?: FontePagamentoTransacao;
  responsavelPagamentoId?: string | null;
  responsavelPagamentoNome?: string | null;
  statusRessarcimento?: StatusRessarcimento;
}

export async function atualizarStatusTransacao(
  id: string,
  novoStatus: StatusTransacao,
  options?: OpcoesLiquidacaoTransacao,
): Promise<boolean> {
  try {
    const agoraIso = new Date().toISOString();
    const dataPagamento = novoStatus === "concluido" ? agoraIso : null;

    // Caso de liquidação pago diretamente pelo cliente (valor zerado)
    // Permitido estritamente para repasses de instalação ao instalador.
    if (options?.liquidadoPeloCliente) {
      let transExistenteGuard: any = null;
      if (!id.startsWith("i-")) {
        const { data: transGuard } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, tipo, categoria, instalacao_id, descricao")
          .eq("id", id)
          .maybeSingle();

        transExistenteGuard = transGuard;
        const tipoVal = String((transGuard as any)?.tipo || "");
        const categoriaVal = String((transGuard as any)?.categoria || "");
        const instalacaoIdVal = (transGuard as any)?.instalacao_id;
        const ehRepasseInstalador =
          (tipoVal === "saida" || tipoVal === "despesa") &&
          (categoriaVal === "repasse_instalador" || Boolean(instalacaoIdVal));

        if (!transGuard || !ehRepasseInstalador) {
          console.warn(
            "Bloqueado: liquidadoPeloCliente permitido somente para repasses de instalação ao instalador.",
          );
          return false;
        }
      }

      try {
        const { error: rpcErr } = await (supabase.rpc as any)(
          "liquidar_repasse_instalacao_pelo_cliente",
          {
            p_transacao_id: id,
            p_instalacao_id: id.startsWith("i-") ? id.replace("i-", "") : null,
          },
        );
        if (!rpcErr) return true;

        const msgErr = String(rpcErr?.message || "").toLowerCase();
        if (
          msgErr.includes("apenas repasses") ||
          msgErr.includes("acesso negado") ||
          msgErr.includes("não encontrada")
        ) {
          console.warn("RPC liquidar_repasse_instalacao_pelo_cliente bloqueou operação:", rpcErr);
          return false;
        }
      } catch (e) {
        console.warn("RPC liquidar_repasse_instalacao_pelo_cliente fallback:", e);
      }

      if (id.startsWith("i-")) {
        const instalacaoId = id.replace("i-", "");
        await supabase
          .from("instalacoes")
          .update({
            status_pagamento: "pago",
            pago_direto_cliente: true,
            pago_em: agoraIso,
          })
          .eq("id", instalacaoId);

        await (supabase.from("transacoes_financeiras" as any) as any)
          .update({
            valor: 0.0,
            status: "concluido",
            liquidado_pelo_cliente: true,
            fonte_pagamento: "caixa_empresa",
            status_ressarcimento: "nao_aplicavel",
            data_pagamento: agoraIso,
            updated_at: agoraIso,
          })
          .eq("instalacao_id", instalacaoId);

        return true;
      }

      const descAtual = transExistenteGuard?.descricao || "";
      const novaDesc = descAtual.includes("(Liquidado pelo Cliente)")
        ? descAtual
        : `${descAtual} (Liquidado pelo Cliente)`;

      const { error: errTrans } = await (supabase.from("transacoes_financeiras" as any) as any)
        .update({
          valor: 0.0,
          status: "concluido",
          liquidado_pelo_cliente: true,
          fonte_pagamento: "caixa_empresa",
          responsavel_pagamento_id: null,
          responsavel_pagamento_nome: null,
          status_ressarcimento: "nao_aplicavel",
          data_ressarcimento: null,
          descricao: novaDesc,
          data_pagamento: agoraIso,
          updated_at: agoraIso,
        })
        .eq("id", id);

      if (transExistenteGuard?.instalacao_id) {
        await supabase
          .from("instalacoes")
          .update({
            status_pagamento: "pago",
            pago_direto_cliente: true,
            pago_em: agoraIso,
          })
          .eq("id", transExistenteGuard.instalacao_id);
      }

      return !errTrans;
    }

    if (id.startsWith("m-")) {
      // Atualiza na tabela de mensalidades
      const mensalidadeId = id.replace("m-", "");
      const { error } = await supabase
        .from("mensalidades")
        .update({
          status: novoStatus === "concluido" ? "pago" : "pendente",
          data_pagamento: dataPagamento,
        })
        .eq("id", mensalidadeId);
      return !error;
    }

    if (id.startsWith("i-")) {
      // Atualiza na tabela de instalacoes
      const instalacaoId = id.replace("i-", "");
      const { error } = await supabase
        .from("instalacoes")
        .update({
          status_pagamento: novoStatus === "concluido" ? "pago" : "pendente",
          pago_direto_cliente: false,
          pago_em: dataPagamento,
        })
        .eq("id", instalacaoId);

      if (error) return false;

      // Se liquidada com caixa de ADM/Operador, registra/sincroniza em transacoes_financeiras
      // para rastreamento contábil e controle de ressarcimento ao responsável
      if (novoStatus === "concluido" && options?.fontePagamento === "operador_adm") {
        const { data: inst } = await supabase
          .from("instalacoes")
          .select(
            "id, valor_instalacao, placa, concluida_at, created_at, cliente_id, instalador_id, instalador:instalador_id(nome)",
          )
          .eq("id", instalacaoId)
          .maybeSingle();

        if (inst) {
          const instAny = inst as any;
          const statusRessarc: StatusRessarcimento =
            options.statusRessarcimento === "ressarcido" ? "ressarcido" : "pendente";
          const dataRessarc = statusRessarc === "ressarcido" ? agoraIso : null;
          const dataRef = (instAny.concluida_at || instAny.created_at || agoraIso).split("T")[0];
          const instNome = instAny.instalador?.nome || "Tecnico Credenciado";
          const placaRef =
            instAny.placa && instAny.placa !== "A DEFINIR" && instAny.placa !== "SEM PLACA"
              ? ` - Placa ${instAny.placa}`
              : ` - Ordem #${instalacaoId.slice(0, 6)}`;

          const { data: transVinculada } = await supabase
            .from("transacoes_financeiras" as any)
            .select("id")
            .eq("instalacao_id", instalacaoId)
            .maybeSingle();

          if (transVinculada && (transVinculada as any).id) {
            await (supabase.from("transacoes_financeiras" as any) as any)
              .update({
                status: "concluido",
                liquidado_pelo_cliente: false,
                data_pagamento: agoraIso,
                fonte_pagamento: "operador_adm",
                responsavel_pagamento_id: options.responsavelPagamentoId || null,
                responsavel_pagamento_nome: options.responsavelPagamentoNome?.trim() || null,
                status_ressarcimento: statusRessarc,
                data_ressarcimento: dataRessarc,
                updated_at: agoraIso,
              })
              .eq("id", (transVinculada as any).id);
          } else {
            await (supabase.from("transacoes_financeiras" as any) as any).insert({
              tipo: "saida",
              categoria: "repasse_instalador",
              descricao: `Repasse Instalador (${instNome})${placaRef}`,
              valor: Number(instAny.valor_instalacao || 0),
              data_competencia: dataRef,
              data_vencimento: dataRef,
              data_pagamento: agoraIso,
              status: "concluido",
              liquidado_pelo_cliente: false,
              instalacao_id: instalacaoId,
              instalador_id: instAny.instalador_id || null,
              cliente_id: instAny.cliente_id || null,
              fonte_pagamento: "operador_adm",
              responsavel_pagamento_id: options.responsavelPagamentoId || null,
              responsavel_pagamento_nome: options.responsavelPagamentoNome?.trim() || null,
              status_ressarcimento: statusRessarc,
              data_ressarcimento: dataRessarc,
            });
          }
        }
      }

      return true;
    }

    // Atualiza na tabela transacoes_financeiras
    const payloadUpdate: any = {
      status: novoStatus,
      data_pagamento: dataPagamento,
      updated_at: agoraIso,
    };

    if (novoStatus === "pendente") {
      payloadUpdate.liquidado_pelo_cliente = false;
    }

    if (options?.fontePagamento) {
      const { data: transInfo } = await supabase
        .from("transacoes_financeiras" as any)
        .select("id, tipo, observacoes")
        .eq("id", id)
        .maybeSingle();

      const tipoAtual = String((transInfo as any)?.tipo || "");
      const isSaidaRegistro = tipoAtual === "saida" || tipoAtual === "despesa" || !transInfo;

      if (isSaidaRegistro) {
        const obsSemFonte = String((transInfo as any)?.observacoes || "")
          .replace(/\[FONTE:[^\]]+\]/g, "")
          .trim();

        if (options.fontePagamento === "operador_adm") {
          const stRessarc: StatusRessarcimento =
            options.statusRessarcimento === "ressarcido" ? "ressarcido" : "pendente";
          payloadUpdate.fonte_pagamento = "operador_adm";
          payloadUpdate.responsavel_pagamento_id = options.responsavelPagamentoId || null;
          payloadUpdate.responsavel_pagamento_nome =
            options.responsavelPagamentoNome?.trim() || null;
          payloadUpdate.status_ressarcimento = stRessarc;
          payloadUpdate.data_ressarcimento = stRessarc === "ressarcido" ? agoraIso : null;
        } else {
          payloadUpdate.fonte_pagamento = "caixa_empresa";
          payloadUpdate.responsavel_pagamento_id = null;
          payloadUpdate.responsavel_pagamento_nome = null;
          payloadUpdate.status_ressarcimento = "nao_aplicavel";
          payloadUpdate.data_ressarcimento = null;
          if (transInfo) {
            payloadUpdate.observacoes = obsSemFonte || null;
          }
        }
      }
    }

    const { error } = await supabase
      .from("transacoes_financeiras" as any)
      .update(payloadUpdate)
      .eq("id", id);

    if (error) {
      console.error("Erro ao atualizar status da transacao no banco:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Excecao ao atualizar status no banco:", err);
    return false;
  }
}

export async function excluirTransacao(id: string): Promise<boolean> {
  try {
    if (id.startsWith("m-")) {
      const mensalidadeId = id.replace("m-", "");
      const { error } = await supabase.from("mensalidades").delete().eq("id", mensalidadeId);
      return !error;
    }

    if (id.startsWith("i-")) {
      const instalacaoId = id.replace("i-", "");
      const { error } = await supabase.from("instalacoes").delete().eq("id", instalacaoId);
      return !error;
    }

    const { error } = await supabase
      .from("transacoes_financeiras" as any)
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir transacao do banco:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Excecao ao excluir transacao do banco:", err);
    return false;
  }
}

// Gera Hash SHA-256 no browser para auditoria forense do relatorio
async function calcularHashSHA256(texto: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dados = encoder.encode(texto);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

export async function exportarRelatorioPDF(
  transacoes: TransacaoFinanceira[],
  resumo: ResumoFluxoCaixa,
  dre: DREOperacional,
  usuarioNome: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dataHojeStr = new Date().toLocaleDateString("pt-BR");
  const horaHojeStr = new Date().toLocaleTimeString("pt-BR");

  const logoBase64 = await carregarLogoEmblemaBase64();

  // Cabeçalho institucional Hunter
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 30, "F");

  // Faixa de destaque verde esmeralda
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 28, 210, 2, "F");

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 8, 2, 26, 26);
    } catch {
      // Fallback silencioso
    }
  }

  const offsetTextoX = logoBase64 ? 38 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${APP_NOME.toUpperCase()} — RELATORIO FINANCEIRO CONSOLIDADO`, offsetTextoX, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `Demonstrativo de Fluxo de Caixa e DRE Operacional · Versao v${APP_VERSION_NUMERO}`,
    offsetTextoX,
    18,
  );
  doc.text(`Emissao: ${dataHojeStr} as ${horaHojeStr} por ${usuarioNome}`, offsetTextoX, 24);

  // Quadro de Resumo de Caixa
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("1. Resumo Executivo do Fluxo de Caixa", 14, 38);

  const resumoRows = [
    ["Saldo em Caixa Realizado", `R$ ${resumo.saldoAtual.toFixed(2)}`],
    ["Total de Entradas Realizadas (Recebidas)", `R$ ${resumo.entradasRealizadas.toFixed(2)}`],
    ["Total de Entradas Previstas (A Receber)", `R$ ${resumo.entradasPrevistas.toFixed(2)}`],
    ["Total de Saidas Realizadas (Pagas)", `R$ ${resumo.saidasRealizadas.toFixed(2)}`],
    ["Total de Saidas Previstas (A Pagar)", `R$ ${resumo.saidasPrevistas.toFixed(2)}`],
  ];

  autoTable(doc, {
    startY: 40,
    head: [["Indicador", "Valor"]],
    body: resumoRows,
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });

  const finalYResumo = (doc as any).lastAutoTable.finalY + 8;

  // Quadro DRE Operacional
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("2. Demonstrativo de Resultado (DRE Operacional)", 14, finalYResumo);

  const dreRows = [
    ["Receita Operacional Bruta", `R$ ${dre.receitaBruta.toFixed(2)}`],
    ["(-) Custos Diretos com Instaladores", `R$ ${dre.custoInstalacoes.toFixed(2)}`],
    ["(-) Custos com Chips e Conectividade M2M", `R$ ${dre.custoConectividade.toFixed(2)}`],
    ["(-) Despesas Operacionais e Administrativas", `R$ ${dre.despesasOperacionais.toFixed(2)}`],
    ["(=) Resultado Liquido Operacional", `R$ ${dre.lucroOperacionalLiquido.toFixed(2)}`],
    ["Margem Liquida Operacional", `${dre.margemOperacionalPercentual.toFixed(1)}%`],
  ];

  autoTable(doc, {
    startY: finalYResumo + 3,
    head: [["Conta Contabil / Estrutura", "Valor"]],
    body: dreRows,
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });

  const finalYDRE = (doc as any).lastAutoTable.finalY + 8;

  // Extrato de Transacoes
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("3. Extrato Analitico de Movimentacoes", 14, finalYDRE);

  const transRows = transacoes.map((t) => [
    t.data_competencia.split("-").reverse().join("/"),
    t.tipo.toUpperCase(),
    t.categoria.replace("_", " ").toUpperCase(),
    t.descricao,
    t.status.toUpperCase(),
    `R$ ${Number(t.valor).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: finalYDRE + 3,
    head: [["Data", "Tipo", "Categoria", "Descricao", "Status", "Valor"]],
    body: transRows,
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7.5 },
    margin: { left: 14, right: 14 },
  });

  // Calculo de Hash Forense SHA-256 e Rodape de Rastreabilidade em todas as paginas
  const payloadRastreabilidade = `${dataHojeStr}-${horaHojeStr}-${usuarioNome}-${resumo.saldoAtual}-${transacoes.length}`;
  const hashSHA256 = await calcularHashSHA256(payloadRastreabilidade);

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont("courier", "normal");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 287, 196, 287);

    doc.text(`${APP_NOME} v${APP_VERSION_NUMERO} · Emitido por: ${usuarioNome}`, 14, 291);
    doc.text(`Hash Forense SHA-256: ${hashSHA256.slice(0, 32)}...`, 80, 291);
    doc.text(`Pagina ${i} de ${totalPages}`, 175, 291);
  }

  const nomeArquivo = `gd-rastreamento-relatorio-financeiro-${new Date().toISOString().split("T")[0]}.pdf`;

  await aplicarCertidaoAutenticidadePdf({
    doc,
    tipoDocumento: "RELATORIO_FINANCEIRO",
    nomeArquivo,
    descricao: `Relatório Financeiro Operacional - ${transacoes.length} transações`,
    emissorNome: usuarioNome || undefined,
    forcarNovaPagina: true,
    metadataExtra: {
      hash_conteudo: hashSHA256,
      total_transacoes: transacoes.length,
      saldo_atual: resumo.saldoAtual,
    },
  });

  doc.save(nomeArquivo);
}

export async function exportarRelatorioExcel(
  transacoes: TransacaoFinanceira[],
  resumo: ResumoFluxoCaixa,
  dre: DREOperacional,
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NOME;
  workbook.created = new Date();

  // Aba 1: Resumo Executivo e DRE
  const sheetResumo = workbook.addWorksheet("Resumo e DRE");
  sheetResumo.columns = [
    { header: "Indicador / Conta", key: "item", width: 40 },
    { header: "Valor (R$)", key: "valor", width: 22 },
  ];

  sheetResumo.addRow({ item: "SALDO ATUAL EM CAIXA", valor: resumo.saldoAtual });
  sheetResumo.addRow({ item: "Entradas Realizadas (Recebidas)", valor: resumo.entradasRealizadas });
  sheetResumo.addRow({ item: "Entradas Previstas (A Receber)", valor: resumo.entradasPrevistas });
  sheetResumo.addRow({ item: "Saidas Realizadas (Pagas)", valor: resumo.saidasRealizadas });
  sheetResumo.addRow({ item: "Saidas Previstas (A Pagar)", valor: resumo.saidasPrevistas });
  sheetResumo.addRow({});
  sheetResumo.addRow({ item: "DRE - Receita Bruta", valor: dre.receitaBruta });
  sheetResumo.addRow({ item: "DRE - Custos de Instalacao", valor: dre.custoInstalacoes });
  sheetResumo.addRow({ item: "DRE - Custos de Chips M2M", valor: dre.custoConectividade });
  sheetResumo.addRow({ item: "DRE - Despesas Operacionais", valor: dre.despesasOperacionais });
  sheetResumo.addRow({
    item: "DRE - Lucro Liquido Operacional",
    valor: dre.lucroOperacionalLiquido,
  });

  // Aba 2: Extrato Detalhado de Transacoes
  const sheetTransacoes = workbook.addWorksheet("Extrato de Transacoes");
  sheetTransacoes.columns = [
    { header: "Data Competencia", key: "data", width: 16 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Categoria", key: "categoria", width: 25 },
    { header: "Descricao", key: "descricao", width: 45 },
    { header: "Status", key: "status", width: 14 },
    { header: "Valor (R$)", key: "valor", width: 16 },
    { header: "Data Pagamento", key: "pagamento", width: 18 },
  ];

  for (const t of transacoes) {
    sheetTransacoes.addRow({
      data: t.data_competencia,
      tipo: t.tipo.toUpperCase(),
      categoria: t.categoria.replace("_", " ").toUpperCase(),
      descricao: t.descricao,
      status: t.status.toUpperCase(),
      valor: t.valor,
      pagamento: t.data_pagamento ? t.data_pagamento.split("T")[0] : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gd-rastreamento-financeiro-${new Date().toISOString().split("T")[0]}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Calculo exato de dias em atraso a partir de uma data de vencimento (YYYY-MM-DD)
 */
export function calcularDiasAtraso(dataVencimentoStr: string): number {
  if (!dataVencimentoStr) return 0;
  const [ano, mes, dia] = dataVencimentoStr.split("-").map(Number);
  const dataVenc = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dataVenc.setHours(0, 0, 0, 0);
  const diffMs = hoje.getTime() - dataVenc.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? diffDias : 0;
}

/**
 * Formata e normaliza o numero de telefone para o padrao internacional E.164 exigido pelo WhatsApp (DDI Brasil 55)
 */
export function formatarTelefoneWhatsApp(telefone?: string | null): string {
  if (!telefone) return "";
  const apenasNumeros = telefone.replace(/\D/g, "");
  if (!apenasNumeros) return "";
  // Se tem 12 ou 13 digitos e ja comeca com 55 (ex: 5511999999999)
  if (
    apenasNumeros.startsWith("55") &&
    (apenasNumeros.length === 12 || apenasNumeros.length === 13)
  ) {
    return apenasNumeros;
  }
  // Se tem 10 ou 11 digitos (DDD + telefone), adiciona DDI 55
  if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
    return `55${apenasNumeros}`;
  }
  return apenasNumeros;
}

/**
 * Gera texto formal e amigavel de cobranca preventiva para envio direto pelo WhatsApp
 * Respeita a identidade visual oficial do Hunter e a proibicao absoluta do e comercial
 */
export function gerarMensagemWhatsAppInadimplente(
  cliente: ClienteInadimplente,
  chavePixRecebimento?: string,
): string {
  const primeiroNome = cliente.nome_razao_social.trim().split(" ")[0];
  const valorTotalFmt = cliente.totalDevido.toFixed(2).replace(".", ",");
  const dataMaisAntigaFmt = cliente.mensalidadeMaisAntigaVencimento
    ? cliente.mensalidadeMaisAntigaVencimento.split("-").reverse().join("/")
    : "";

  let texto = `Ola, ${primeiroNome}! Aqui e do setor financeiro do GD Rastreamento.\n\n`;
  texto += `Identificamos que consta(m) ${cliente.qtdMensalidadesAtrasadas} mensalidade(s) em aberto referente ao servico de rastreamento veicular, totalizando R$ ${valorTotalFmt}.\n`;

  if (dataMaisAntigaFmt) {
    texto += `Vencimento mais antigo: ${dataMaisAntigaFmt} (${cliente.maiorAtrasoDias} dias em atraso).\n\n`;
  } else {
    texto += `\n`;
  }

  const chaveConfigurada = obterConfigPixSistemaSync().chavePix;
  const chavePixFinal =
    (chavePixRecebimento && chavePixRecebimento.trim()) || chaveConfigurada || APP_CHAVE_PIX_PADRAO;

  let payloadPix = "";
  try {
    const rawId = String(cliente.cliente_id || "SIGO");
    payloadPix = gerarPayloadPix({
      chavePix: chavePixFinal,
      nomeRecebedor: "GD Rastreamento",
      cidadeRecebedor: "BRASIL",
      valor: cliente.totalDevido,
      identificador: `FAT${rawId
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .toUpperCase()}`,
    });
  } catch (err) {
    console.warn("Nao foi possivel gerar payload pix:", err);
  }

  texto += `Para pagamento instantaneo via PIX:\n`;
  texto += `Chave PIX: ${chavePixFinal}\n\n`;

  if (payloadPix) {
    texto += `PIX COPIA E COLA (Basta copiar e colar no app do seu banco):\n${payloadPix}\n\n`;
  }

  texto += `Link para visualizar o QR Code da fatura no portal:\n${APP_PUBLIC_URL}/cliente/financeiro\n\n`;

  texto += `Para manter o rastreamento veicular ativo e garantir a protecao continua do seu veiculo, solicitamos a regularizacao do debito.\n`;
  texto += `Caso o pagamento ja tenha sido realizado, por gentileza nos envie o comprovante para darmos a baixa imediata no sistema.\n\n`;
  texto += `Estamos a disposicao para qualquer esclarecimento!\n`;
  texto += `Equipe GD Rastreamento`;

  return texto;
}

/**
 * Gera link direto wa.me para abertura imediata do WhatsApp Web ou Mobile com a mensagem pre-carregada
 */
export function gerarLinkWhatsAppInadimplente(
  cliente: ClienteInadimplente,
  chavePixRecebimento?: string,
): string {
  const telefoneLimpo = formatarTelefoneWhatsApp(cliente.telefone);
  if (!telefoneLimpo) return "";
  const mensagem = gerarMensagemWhatsAppInadimplente(cliente, chavePixRecebimento);
  return `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Totaliza os indicadores gerais de inadimplencia da carteira
 */
export function calcularResumoInadimplencia(clientes: ClienteInadimplente[]): ResumoInadimplencia {
  let totalInadimplente = 0;
  let totalMensalidadesVencidas = 0;
  let maiorAtrasoGeralDias = 0;

  for (const c of clientes) {
    totalInadimplente += c.totalDevido;
    totalMensalidadesVencidas += c.qtdMensalidadesAtrasadas;
    if (c.maiorAtrasoDias > maiorAtrasoGeralDias) {
      maiorAtrasoGeralDias = c.maiorAtrasoDias;
    }
  }

  return {
    totalInadimplente,
    totalClientesInadimplentes: clientes.length,
    totalMensalidadesVencidas,
    maiorAtrasoGeralDias,
  };
}

/**
 * Lista todos os clientes inadimplentes com mensalidades vencidas em aberto no Supabase
 */
export async function listarClientesInadimplentes(): Promise<ClienteInadimplente[]> {
  try {
    const hojeStr = new Date().toISOString().split("T")[0];

    let { data, error } = await supabase
      .from("mensalidades")
      .select(
        `
        id,
        mes_referencia,
        ano_referencia,
        numero_parcela,
        total_parcelas,
        valor,
        data_vencimento,
        status,
        cliente_id,
        clientes (
          id,
          nome_razao_social,
          documento,
          telefone,
          email,
          status
        )
      `,
      )
      .in("status", ["pendente", "vencido"])
      .order("data_vencimento", { ascending: true });

    if (error) {
      const fb = await supabase
        .from("mensalidades")
        .select(
          `
          id,
          mes_referencia,
          ano_referencia,
          valor,
          data_vencimento,
          status,
          cliente_id,
          clientes (
            id,
            nome_razao_social,
            documento,
            telefone,
            email,
            status
          )
        `,
        )
        .in("status", ["pendente", "vencido"])
        .order("data_vencimento", { ascending: true });
      data = fb.data as any;
      error = fb.error;
    }

    if (error) {
      console.warn("Erro ao buscar mensalidades inadimplentes:", error);
      return [];
    }

    // Consulta veículos ativos para blindar contra cobrança indevida de clientes sem veículos ativos
    const { data: veiculosAtivos } = await supabase
      .from("veiculos")
      .select("cliente_id")
      .eq("ativo", true);

    const clientesComVeiculoAtivo = new Set(
      (veiculosAtivos || []).map((v: any) => v.cliente_id).filter(Boolean),
    );

    const mapaClientes = new Map<string, ClienteInadimplente>();

    for (const m of (data || []) as any[]) {
      // Filtra faturas vencidas (vencimento anterior a hoje ou marcadas como vencido)
      const vencida = m.status === "vencido" || m.data_vencimento < hojeStr;
      if (!vencida) continue;

      const cli = m.clientes;
      if (!cli) continue;

      const clienteId = cli.id || m.cliente_id;

      // Regra Canônica: O cliente só inicia cobrança e pode ser considerado inadimplente após a ativação do 1º veículo.
      // Clientes sem nenhum veículo ativo ou com status 'aguardando_instalacao' não possuem débitos nem inadimplência.
      if (cli.status === "aguardando_instalacao" || !clientesComVeiculoAtivo.has(clienteId)) {
        continue;
      }

      const diasAtraso = calcularDiasAtraso(m.data_vencimento);

      const faturaInadimplente: MensalidadeInadimplente = {
        id: m.id,
        mes_referencia: m.mes_referencia,
        ano_referencia: m.ano_referencia,
        numero_parcela: m.numero_parcela ?? null,
        total_parcelas: m.total_parcelas ?? null,
        valor: Number(m.valor || 0),
        data_vencimento: m.data_vencimento,
        diasAtraso,
        status: m.status,
      };

      if (!mapaClientes.has(clienteId)) {
        mapaClientes.set(clienteId, {
          cliente_id: clienteId,
          nome_razao_social: cli.nome_razao_social || "Cliente GD Rastreamento",
          documento: cli.documento || null,
          telefone: cli.telefone || null,
          email: cli.email || null,
          status_cliente: cli.status || "ativo",
          totalDevido: faturaInadimplente.valor,
          qtdMensalidadesAtrasadas: 1,
          maiorAtrasoDias: diasAtraso,
          mensalidadeMaisAntigaVencimento: m.data_vencimento,
          mensalidades: [faturaInadimplente],
        });
      } else {
        const existente = mapaClientes.get(clienteId)!;
        existente.totalDevido += faturaInadimplente.valor;
        existente.qtdMensalidadesAtrasadas += 1;
        if (diasAtraso > existente.maiorAtrasoDias) {
          existente.maiorAtrasoDias = diasAtraso;
        }
        if (m.data_vencimento < existente.mensalidadeMaisAntigaVencimento) {
          existente.mensalidadeMaisAntigaVencimento = m.data_vencimento;
        }
        existente.mensalidades.push(faturaInadimplente);
      }
    }

    const lista = Array.from(mapaClientes.values());
    // Ordena priorizando maior atraso em dias e maior volume financeiro
    lista.sort((a, b) => b.maiorAtrasoDias - a.maiorAtrasoDias || b.totalDevido - a.totalDevido);
    return lista;
  } catch (err) {
    console.error("Excecao ao listar clientes inadimplentes:", err);
    return [];
  }
}

export { gerarMensagemLembreteVencimentoLeve };

export interface ClienteLembreteVencimento {
  clienteId: string;
  clienteNome: string;
  telefone: string;
  valor: number;
  dataVencimento: string;
  dataVencimentoFormatada: string;
  diasRestantes: number;
  mensagem: string;
  payloadPix: string;
}

/**
 * Localiza mensalidades de clientes ativos cujo vencimento ocorre exatamente daqui a `dias` dias (padrao 3 dias),
 * preparando a mensagem de lembrete leve e amigavel com a Chave PIX oficial do sistema e link do portal.
 */
export async function buscarClientesVencendoEmDias(
  dias: number = 3,
): Promise<ClienteLembreteVencimento[]> {
  try {
    const dataAlvo = new Date();
    dataAlvo.setDate(dataAlvo.getDate() + dias);
    const dataAlvoStr = dataAlvo.toISOString().split("T")[0];
    const dataAlvoFormatada = `${String(dataAlvo.getDate()).padStart(2, "0")}/${String(
      dataAlvo.getMonth() + 1,
    ).padStart(2, "0")}/${dataAlvo.getFullYear()}`;

    const { data, error } = await supabase
      .from("mensalidades")
      .select(
        `
        id,
        valor,
        data_vencimento,
        status,
        cliente_id,
        clientes (
          id,
          nome_razao_social,
          telefone,
          status
        )
      `,
      )
      .eq("status", "pendente")
      .eq("data_vencimento", dataAlvoStr);

    if (error || !Array.isArray(data)) {
      return [];
    }

    const lista: ClienteLembreteVencimento[] = [];
    const cfgPix = obterConfigPixSistemaSync();

    for (const m of data as any[]) {
      const cli = m.clientes;
      if (!cli || !cli.telefone || cli.status === "inativo") continue;

      const valor = Number(m.valor || 0);
      const { mensagem, payloadPix } = gerarMensagemLembreteVencimentoLeve({
        clienteNome: cli.nome_razao_social || "Cliente",
        valor,
        dataVencimentoFormatada: dataAlvoFormatada,
        diasRestantes: dias,
        chavePixCustomizada: cfgPix.chavePix,
      });

      lista.push({
        clienteId: cli.id || m.cliente_id,
        clienteNome: cli.nome_razao_social || "Cliente",
        telefone: cli.telefone,
        valor,
        dataVencimento: m.data_vencimento,
        dataVencimentoFormatada: dataAlvoFormatada,
        diasRestantes: dias,
        mensagem,
        payloadPix,
      });
    }

    return lista;
  } catch (err) {
    console.warn("Aviso ao buscar clientes com vencimento em " + dias + " dias:", err);
    return [];
  }
}

/**
 * Retorna os membros da equipe (superadmin, adm, operador) aptos a adiantar pagamentos
 */
export async function listarResponsaveisPagamento(): Promise<
  { id: string; nome: string; role: string }[]
> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, role")
      .in("role", ["superadmin", "adm", "operador"])
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((p) => ({
      id: p.id,
      nome: p.nome || "Usuário",
      role: p.role,
    }));
  } catch {
    return [];
  }
}

/**
 * Calcula o resumo consolidado de valores a ressarcir a operadores e administradores
 */
export function calcularResumoRessarcimento(
  transacoes: TransacaoFinanceira[],
): ResumoRessarcimento {
  let totalPendente = 0;
  let totalRessarcido = 0;
  let totalGeral = 0;
  let quantidadePendente = 0;
  let quantidadeRessarcida = 0;
  let quantidadeTotal = 0;

  const responsaveisMap = new Map<
    string,
    {
      id: string;
      nome: string;
      totalPendente: number;
      totalRessarcido: number;
      totalGeral: number;
      quantidadePendente: number;
      quantidadeRessarcida: number;
    }
  >();

  for (const t of transacoes) {
    if (t.tipo !== "saida") continue;
    if (t.fonte_pagamento !== "operador_adm") continue;

    const valor = Number(t.valor || 0);
    totalGeral += valor;
    quantidadeTotal++;

    const respId = t.responsavel_pagamento_id || "desconhecido";
    const respNome = t.responsavel_pagamento_nome || "Responsável não especificado";

    if (!responsaveisMap.has(respId)) {
      responsaveisMap.set(respId, {
        id: respId,
        nome: respNome,
        totalPendente: 0,
        totalRessarcido: 0,
        totalGeral: 0,
        quantidadePendente: 0,
        quantidadeRessarcida: 0,
      });
    }

    const reg = responsaveisMap.get(respId)!;
    reg.totalGeral += valor;

    if (t.status_ressarcimento === "pendente") {
      totalPendente += valor;
      quantidadePendente++;
      reg.totalPendente += valor;
      reg.quantidadePendente++;
    } else if (t.status_ressarcimento === "ressarcido") {
      totalRessarcido += valor;
      quantidadeRessarcida++;
      reg.totalRessarcido += valor;
      reg.quantidadeRessarcida++;
    }
  }

  const porResponsavel = Array.from(responsaveisMap.values()).sort(
    (a, b) => b.totalPendente - a.totalPendente,
  );

  return {
    totalPendente,
    totalRessarcido,
    totalGeral,
    quantidadePendente,
    quantidadeRessarcida,
    quantidadeTotal,
    porResponsavel,
  };
}

/**
 * Efetiva a quitação e ressarcimento de uma despesa adiantada por operador ou adm
 */
export async function efetivarRessarcimento(
  transacaoId: string,
  dataRessarcimento?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const dataHora = dataRessarcimento || new Date().toISOString();

    // 1. Tenta atualizar diretamente no schema enriquecido
    const { error } = await supabase
      .from("transacoes_financeiras" as any)
      .update({
        status_ressarcimento: "ressarcido",
        data_ressarcimento: dataHora,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transacaoId);

    if (!error) {
      return { success: true, message: "Ressarcimento registrado com sucesso!" };
    }

    // 2. Fallback: se coluna não existir no cache, atualiza nas observações estruturadas
    const { data: tExist } = await supabase
      .from("transacoes_financeiras" as any)
      .select("observacoes")
      .eq("id", transacaoId)
      .single();

    const obsAtual = tExist?.observacoes || "";
    const novaObs = obsAtual.includes("[RESSARC:")
      ? obsAtual.replace(/\[RESSARC:[^\]]+\]/, `[RESSARC:ressarcido | DATA_RESSARC:${dataHora}]`)
      : `${obsAtual} [RESSARC:ressarcido | DATA_RESSARC:${dataHora}]`.trim();

    const { error: errFb } = await supabase
      .from("transacoes_financeiras" as any)
      .update({
        observacoes: novaObs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transacaoId);

    if (errFb) {
      return { success: false, message: errFb.message || "Erro ao registrar ressarcimento." };
    }

    return { success: true, message: "Ressarcimento registrado com sucesso!" };
  } catch (err: any) {
    return { success: false, message: err?.message || "Erro de comunicação com o banco." };
  }
}

/**
 * Gera relatório oficial em PDF com o detalhamento de ressarcimentos a operadores/adms
 */
export async function exportarRelatorioRessarcimentoPDF(
  transacoes: TransacaoFinanceira[],
  usuarioNome: string,
  filtroResponsavelNome?: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dataHojeStr = new Date().toLocaleDateString("pt-BR");
  const horaHojeStr = new Date().toLocaleTimeString("pt-BR");

  const transacoesRessarcimento = transacoes.filter(
    (t) => t.tipo === "saida" && t.fonte_pagamento === "operador_adm",
  );

  const resumo = calcularResumoRessarcimento(transacoesRessarcimento);
  const logoBase64 = await carregarLogoEmblemaBase64();

  // Cabeçalho institucional
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 30, "F");

  // Faixa de destaque verde esmeralda
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 28, 210, 2, "F");

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 8, 2, 26, 26);
    } catch {
      // Fallback
    }
  }

  const offsetTextoX = logoBase64 ? 38 : 14;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`${APP_NOME.toUpperCase()} — RELATÓRIO DE RESSARCIMENTO`, offsetTextoX, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `Prestação de Contas e Reembolsos a Operadores e Administradores · Versão v${APP_VERSION_NUMERO}`,
    offsetTextoX,
    18,
  );
  doc.text(
    `Emissão: ${dataHojeStr} às ${horaHojeStr} por ${usuarioNome}${
      filtroResponsavelNome ? ` · Filtro: ${filtroResponsavelNome}` : ""
    }`,
    offsetTextoX,
    24,
  );

  // Quadro de Resumo
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. Resumo Executivo de Reembolsos", 14, 38);

  const resumoRows = [
    ["Total de Despesas Adiantadas por Operadores / ADM", `R$ ${resumo.totalGeral.toFixed(2)}`],
    ["Total Já Ressarcido / Quitado", `R$ ${resumo.totalRessarcido.toFixed(2)}`],
    ["Saldo Pendente de Ressarcimento (A Reembolsar)", `R$ ${resumo.totalPendente.toFixed(2)}`],
    [
      "Quantidade de Lançamentos Pendentes",
      `${resumo.quantidadePendente} de ${resumo.quantidadeTotal}`,
    ],
  ];

  autoTable(doc, {
    startY: 41,
    head: [["Indicador", "Valor Consolidado"]],
    body: resumoRows,
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 120 },
      1: { halign: "right", fontStyle: "bold" },
    },
  });

  const finalYResumo = (doc as any).lastAutoTable.finalY || 70;

  // Tabela de itens
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("2. Detalhamento de Despesas para Ressarcimento", 14, finalYResumo + 8);

  const itensRows = transacoesRessarcimento.map((t) => [
    t.data_competencia ? t.data_competencia.split("-").reverse().join("/") : "-",
    t.responsavel_pagamento_nome || "Operador/ADM",
    t.descricao,
    t.categoria ? t.categoria.replace(/_/g, " ").toUpperCase() : "OUTROS",
    `R$ ${Number(t.valor || 0).toFixed(2)}`,
    t.status_ressarcimento === "ressarcido" ? "RESSARCIDO" : "PENDENTE",
    t.data_ressarcimento ? new Date(t.data_ressarcimento).toLocaleDateString("pt-BR") : "-",
  ]);

  autoTable(doc, {
    startY: finalYResumo + 11,
    head: [["Data", "Quem Pagou", "Descrição", "Categoria", "Valor", "Situação", "Data Ressarc."]],
    body:
      itensRows.length > 0
        ? itensRows
        : [["-", "-", "Nenhuma despesa para ressarcimento no período.", "-", "-", "-", "-"]],
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 32, fontStyle: "bold" },
      2: { cellWidth: 46 },
      3: { cellWidth: 28 },
      4: { halign: "right", fontStyle: "bold", cellWidth: 22 },
      5: { halign: "center", fontStyle: "bold", cellWidth: 22 },
      6: { halign: "center", cellWidth: 20 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        if (data.cell.raw === "RESSARCIDO") {
          data.cell.styles.textColor = [16, 185, 129];
        } else if (data.cell.raw === "PENDENTE") {
          data.cell.styles.textColor = [245, 158, 11];
        }
      }
    },
  });

  const finalYItens = (doc as any).lastAutoTable.finalY || 160;

  // Termo de Quitação e Assinaturas
  let yTermo = finalYItens + 10;
  if (yTermo > 230) {
    doc.addPage();
    yTermo = 25;
  }

  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(14, yTermo, 182, 42, "F");
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.rect(14, yTermo, 182, 42, "S");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("TERMO DE PRESTAÇÃO DE CONTAS E QUITAÇÃO DE REEMBOLSO", 18, yTermo + 6);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Declaro para os devidos fins que os valores discriminados como ressarcidos foram integralmente quitados e creditados,",
    18,
    yTermo + 11,
  );
  doc.text(
    "dando a empresa plena, geral e irrevogável quitação de reembolso pelas despesas operacionais adiantadas.",
    18,
    yTermo + 15,
  );

  // Linhas de assinatura
  doc.line(22, yTermo + 30, 85, yTermo + 30);
  doc.text("Assinatura do Favorecido / Operador", 26, yTermo + 34);

  doc.line(115, yTermo + 30, 178, yTermo + 30);
  doc.text("Assinatura da Gestão / Financeiro", 122, yTermo + 34);

  const nomeArquivo = `GD_Rastreamento_Relatorio_Ressarcimento_${dataHojeStr.replace(/\//g, "-")}.pdf`;

  await aplicarCertidaoAutenticidadePdf({
    doc,
    tipoDocumento: "RELATORIO_FINANCEIRO",
    nomeArquivo,
    descricao: `Relatório de Ressarcimento de Despesas — ${dataHojeStr}`,
    yInicial: yTermo + 40,
    metadataExtra: {
      tipo: "relatorio_ressarcimento",
      versao: APP_VERSION_NUMERO,
      total_geral: resumo.totalGeral,
      total_pendente: resumo.totalPendente,
      total_ressarcido: resumo.totalRessarcido,
      filtro_responsavel: filtroResponsavelNome || "Todos",
    },
  });

  doc.save(nomeArquivo);
}

/**
 * Exporta para planilha Excel (.xlsx) as despesas adiantadas para ressarcimento
 */
export async function exportarRelatorioRessarcimentoExcel(
  transacoes: TransacaoFinanceira[],
  filtroResponsavelNome?: string,
) {
  const transacoesRessarcimento = transacoes.filter(
    (t) => t.tipo === "saida" && t.fonte_pagamento === "operador_adm",
  );

  const resumo = calcularResumoRessarcimento(transacoesRessarcimento);
  const dataHojeStr = new Date().toLocaleDateString("pt-BR");

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NOME;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Ressarcimentos");

  // Cabeçalho
  worksheet.addRow([`${APP_NOME} — RELATÓRIO DE RESSARCIMENTO DE DESPESAS`]);
  worksheet.addRow([
    `Emissão: ${dataHojeStr} | Filtro: ${filtroResponsavelNome || "Todos os Operadores/ADMs"}`,
  ]);
  worksheet.addRow([]);

  // Quadro Resumo
  worksheet.addRow(["RESUMO EXECUTIVO"]);
  worksheet.addRow(["Total de Despesas Adiantadas", resumo.totalGeral]);
  worksheet.addRow(["Total Já Ressarcido", resumo.totalRessarcido]);
  worksheet.addRow(["Total Pendente a Ressarcir", resumo.totalPendente]);
  worksheet.addRow(["Quantidade Pendente", resumo.quantidadePendente]);
  worksheet.addRow([]);

  // Tabela
  const cabecalhoTabela = [
    "Data",
    "Quem Pagou (Operador/ADM)",
    "Descrição da Despesa",
    "Categoria",
    "Valor (R$)",
    "Situação",
    "Data Ressarcimento",
    "Observações",
  ];
  worksheet.addRow(cabecalhoTabela);

  transacoesRessarcimento.forEach((t) => {
    worksheet.addRow([
      t.data_competencia ? t.data_competencia.split("-").reverse().join("/") : "",
      t.responsavel_pagamento_nome || "Operador/ADM",
      t.descricao,
      t.categoria ? t.categoria.replace(/_/g, " ") : "outros",
      Number(t.valor || 0),
      t.status_ressarcimento === "ressarcido" ? "Ressarcido" : "Pendente",
      t.data_ressarcimento ? new Date(t.data_ressarcimento).toLocaleDateString("pt-BR") : "",
      t.observacoes || "",
    ]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GD_Rastreamento_Ressarcimento_Despesas_${dataHojeStr.replace(/\//g, "-")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
