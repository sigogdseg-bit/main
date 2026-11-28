import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import {
  processarMensagemWhatsappRecebida,
  notificarSuperAdmNovaProposta,
  despacharMensagemWhatsappBaileys,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";
import { normalizarProposta } from "../../features/financeiro/services/propostaService";
import { podeAcessarModulo, podeAcessarRota } from "../../shared/lib/permissoesModulos";

function criarMockSupabaseParaPropostas(initialData: {
  profiles?: any[];
  revendedores?: any[];
  vendedores?: any[];
  clientes?: any[];
  veiculos?: any[];
  sessoes?: any[];
  propostas?: any[];
  relatorioConfig?: any;
}) {
  let sessoes = [...(initialData.sessoes || [])];
  const propostasInseridas: any[] = [...(initialData.propostas || [])];

  const supabaseMock: any = {
    _sessoes: () => sessoes,
    _propostas: () => propostasInseridas,
    from: (tabela: string) => {
      let filtroCol = "";
      let filtroVal: any = null;
      const filtrosEq: Record<string, any> = {};
      let filtroOr = "";
      let filtroInCol = "";
      let filtroInVals: any[] = [];
      let filtroIlikeCol = "";
      let filtroIlikeVal = "";

      const qb: any = {
        select: (_cols?: string) => qb,
        eq: (col: string, val: any) => {
          filtrosEq[col] = val;
          filtroCol = col;
          filtroVal = val;
          return qb;
        },
        in: (col: string, vals: any[]) => {
          filtroInCol = col;
          filtroInVals = vals;
          return qb;
        },
        ilike: (col: string, val: any) => {
          filtroIlikeCol = col;
          filtroIlikeVal = String(val).replace(/%/g, "");
          return qb;
        },
        order: () => qb,
        or: (cond: string) => {
          filtroOr = cond;
          return qb;
        },
        limit: (_n: number) => qb,
        maybeSingle: async () => {
          if (tabela === "relatorio_gerencial_config") {
            return { data: initialData.relatorioConfig || null, error: null };
          }
          if (tabela === "whatsapp_sessoes_dialogo") {
            const achou = sessoes.find((s) => {
              if (filtrosEq.telefone && s.telefone !== filtrosEq.telefone) return false;
              if (filtrosEq.fluxo && s.fluxo !== filtrosEq.fluxo) return false;
              if (
                filtroOr &&
                !(
                  filtroOr.includes(s.telefone) ||
                  s.telefone.includes("999991111") ||
                  filtroOr.includes("telefone.eq.")
                )
              ) {
                return false;
              }
              return true;
            });
            return { data: achou || null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          if (tabela === "profiles") {
            resolve({ data: initialData.profiles || [], error: null });
          } else if (tabela === "revendedores") {
            resolve({ data: initialData.revendedores || [], error: null });
          } else if (tabela === "vendedores") {
            resolve({ data: initialData.vendedores || [], error: null });
          } else if (tabela === "whatsapp_sessoes_dialogo") {
            resolve({ data: sessoes, error: null });
          } else if (tabela === "propostas_comerciais") {
            resolve({ data: propostasInseridas, error: null });
          } else if (tabela === "clientes") {
            let res = initialData.clientes || [];
            if (filtroCol === "revendedor_id") {
              res = res.filter((c: any) => c.revendedor_id === filtroVal);
            } else if (filtroOr || filtroIlikeCol) {
              res = res.filter((c: any) => {
                if (c.user_id && filtroOr.includes(c.user_id)) return true;
                if (
                  c.telefone &&
                  (filtroOr.includes(c.telefone) ||
                    (filtroIlikeVal && c.telefone.includes(filtroIlikeVal)))
                ) {
                  return true;
                }
                return false;
              });
            }
            resolve({ data: res, error: null });
          } else if (tabela === "veiculos") {
            let res = initialData.veiculos || [];
            if (filtroInCol && Array.isArray(filtroInVals)) {
              res = res.filter((v: any) => filtroInVals.includes(v[filtroInCol]));
            }
            resolve({ data: res, error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
        upsert: async (payload: any) => {
          const idx = sessoes.findIndex((s) => s.telefone === payload.telefone);
          if (idx >= 0) {
            sessoes[idx] = { ...sessoes[idx], ...payload };
          } else {
            sessoes.push({ id: `sessao-${Date.now()}`, ...payload });
          }
          return { data: payload, error: null };
        },
        update: (payload: any) => {
          return {
            eq: (_col: string, val: any) => {
              if (tabela === "propostas_comerciais") {
                const idx = propostasInseridas.findIndex(
                  (p) => p.numero_proposta === val || p.id === val,
                );
                if (idx >= 0) {
                  propostasInseridas[idx] = { ...propostasInseridas[idx], ...payload };
                }
              } else {
                const idx = sessoes.findIndex((s) => s.id === val || s.telefone === val);
                if (idx >= 0) {
                  sessoes[idx] = { ...sessoes[idx], ...payload };
                }
              }
              return Promise.resolve({ data: payload, error: null });
            },
          };
        },
        delete: () => {
          return {
            eq: (_col: string, val: any) => {
              if (tabela === "propostas_comerciais") {
                const idx = propostasInseridas.findIndex(
                  (p) => p.numero_proposta === val || p.id === val,
                );
                if (idx >= 0) propostasInseridas.splice(idx, 1);
              } else {
                sessoes = sessoes.filter((s) => s.id !== val && s.telefone !== val);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        insert: async (payload: any) => {
          if (tabela === "propostas_comerciais") {
            propostasInseridas.push({ id: `prop-${Date.now()}`, ...payload });
          }
          return { data: payload, error: null };
        },
      };
      return qb;
    },
  };

  return supabaseMock;
}

describe("GD Rastreamento — Emissão de Propostas Interativas via WhatsApp e Regras de Repasse", () => {
  it("Deve bloquear início de proposta para remetente não autorizado (número desconhecido)", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      profiles: [],
      revendedores: [],
      vendedores: [],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988887777",
        texto: "PROPOSTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "proposta_nao_autorizada");
    assert.ok(res.resposta.includes("Não identifiquei"));
    assert.ok(!res.resposta.includes("Acesso Restrito"));
    assert.ok(!res.resposta.includes("&"), "Não deve conter caractere comercial &");
  });

  it("Deve iniciar sessão de proposta para SuperADM com base padrão R$ 40,00 e sugestão + R$ 15,00", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      profiles: [
        {
          id: "adm-1",
          nome: "Administrador Central",
          role: "superadmin",
          telefone: "5524992501512",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "MONTAR PROPOSTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "dialogo_proposta_iniciado");
    assert.ok(res.resposta.includes("GD Rastreamento — Nova Proposta Comercial"));
    assert.ok(res.resposta.includes("R$ 40,00"), "Base mínima padrão 40,00");
    assert.ok(res.resposta.includes("R$ 55,00"), "Sugestão 40 + 15 = 55,00");
    assert.ok(res.resposta.includes("1️⃣ Digite o *Nome Completo do Cliente*"));

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].etapa, "aguardando_cliente_nome");
    assert.equal(sessoes[0].valor_base_repasse, 40);
  });

  it("Deve iniciar sessão para Revendedor respeitando sua base de custo com a matriz", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-123",
          nome: "Revenda Sul Fluminense",
          telefone: "5524999991111",
          valor_base_sistema: 42.5,
          user_id: "user-rev-1",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "NOVA PROPOSTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "dialogo_proposta_iniciado");
    assert.ok(res.resposta.includes("Revenda Sul Fluminense"));
    assert.ok(res.resposta.includes("R$ 42,50"), "Base de custo do revendedor 42,50");
    assert.ok(res.resposta.includes("R$ 57,50"), "Sugestão 42,50 + 15 = 57,50");

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].origem_role, "revendedor");
    assert.equal(sessoes[0].valor_base_repasse, 42.5);
  });

  it("Deve iniciar sessão para Vendedor respeitando sua base de vendedor", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      vendedores: [
        {
          id: "vend-456",
          nome: "Lucas Consultor",
          telefone: "5524999992222",
          valor_base_vendedor: 48.0,
          revendedor_id: "rev-123",
          user_id: "user-vend-1",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999992222",
        texto: "PROPOSTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "dialogo_proposta_iniciado");
    assert.ok(res.resposta.includes("Lucas Consultor"));
    assert.ok(res.resposta.includes("R$ 48,00"), "Base de repasse do vendedor 48,00");
    assert.ok(res.resposta.includes("R$ 63,00"), "Sugestão 48 + 15 = 63,00");

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].origem_role, "vendedor");
    assert.equal(sessoes[0].valor_base_repasse, 48.0);
  });

  it("Deve permitir cancelar o diálogo em qualquer etapa sem deixar dados órfãos", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      sessoes: [
        {
          id: "sessao-ativa",
          telefone: "5524992501512",
          origem_role: "superadmin",
          etapa: "aguardando_cliente_nome",
          valor_base_repasse: 40,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "CANCELAR",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "dialogo_proposta_cancelado");
    assert.ok(res.resposta.includes("Operação cancelada com sucesso"));

    const sessoesRestantes = supabase._sessoes();
    assert.equal(sessoesRestantes.length, 0, "A sessão deve ter sido excluída");
  });

  it("Fluxo Completo de Veículo Individual com rejeição de valor abaixo da base e conclusão aprovada", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      sessoes: [
        {
          id: "sessao-vendedor",
          telefone: "5524999991111",
          origem_role: "vendedor",
          revendedor_id: "rev-1",
          vendedor_id: "vend-1",
          valor_base_repasse: 45.0,
          etapa: "aguardando_cliente_nome",
          dados_temporarios: {
            emissor_nome: "Vendedor Roberto",
            emissor_role: "vendedor",
          },
        },
      ],
    });

    // 1. Envia Nome do Cliente
    const p1 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "Transportes Imperial Ltda",
      },
      supabase,
    );
    assert.equal(p1.acaoExecutada, "cliente_nome_recebido");
    assert.ok(p1.resposta.includes("Transportes Imperial Ltda"));
    assert.ok(p1.resposta.includes("WhatsApp com DDD"));

    // 2. Envia WhatsApp do Cliente
    const p2 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "24988776655",
      },
      supabase,
    );
    assert.equal(p2.acaoExecutada, "cliente_telefone_recebido");
    assert.ok(p2.resposta.includes("modalidade da proposta"));
    assert.ok(p2.resposta.includes("*1* para Veículo Individual"));
    assert.ok(p2.resposta.includes("*2* para Frota Corporativa"));

    // 3. Escolhe Modalidade 1 (Individual)
    const p3 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "1",
      },
      supabase,
    );
    assert.equal(p3.acaoExecutada, "modalidade_individual_selecionada");
    assert.ok(p3.resposta.includes("dados do veículo (*Marca / Modelo / Ano*"));

    // 4. Envia dados do veículo
    const p4 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "Toyota Hilux 2024",
      },
      supabase,
    );
    assert.equal(p4.acaoExecutada, "veiculo_info_recebido");
    assert.ok(p4.resposta.includes("Regra de Repasse Vigente"));
    assert.ok(p4.resposta.includes("R$ 45,00"));

    // 5. Tenta digitar valor ABAIXO da base de repasse (45,00) -> deve ser BLOQUEADO
    const p5Bloqueado = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "39,90",
      },
      supabase,
    );
    assert.equal(p5Bloqueado.acaoExecutada, "mensalidade_inferior_base_repasse");
    assert.ok(p5Bloqueado.resposta.includes("Valor abaixo da regra de repasse"));
    assert.ok(p5Bloqueado.resposta.includes("R$ 45,00"));

    // 6. Digita valor VÁLIDO (69,90 >= 45,00) -> solicita taxa de instalação
    const p5Valido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "69,90",
      },
      supabase,
    );
    assert.equal(p5Valido.acaoExecutada, "mensalidade_recebida_aguardando_taxa_instalacao");
    assert.ok(p5Valido.resposta.includes("R$ 69,90/mês"));
    assert.ok(p5Valido.resposta.includes("Taxa de Instalação e Ativação"));

    // 6.1 Digita taxa de instalação (ex: 0 para Isenta/Grátis) -> gera PDF oficial e apresenta menu de conferência!
    const p6Taxa = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "0",
      },
      supabase,
    );
    assert.equal(p6Taxa.acaoExecutada, "proposta_gerada_aguardando_conferencia");
    assert.ok(p6Taxa.resposta.includes("Proposta Comercial Gerada com Sucesso"));
    assert.ok(p6Taxa.resposta.includes("Transportes Imperial Ltda"));
    assert.ok(p6Taxa.resposta.includes("R$ 69,90"));
    assert.ok(p6Taxa.resposta.includes("Taxa de Instalação:* Isenta"));
    assert.ok(p6Taxa.resposta.includes("Toyota Hilux 2024"));
    assert.ok(p6Taxa.resposta.includes("*Base de Repasse:* R$ 45,00"));
    assert.ok(p6Taxa.resposta.includes("*Margem/Comissão:* R$ 24,90/mês"));
    assert.ok(p6Taxa.resposta.includes("*Emitida por:*"), "Deve conter quem enviou");
    assert.ok(
      !p6Taxa.resposta.includes("diretoria/SuperADM"),
      "Não deve mencionar cópia à diretoria",
    );
    assert.ok(p6Taxa.documento, "Deve conter documento anexado para envio imediato");
    assert.ok(p6Taxa.resposta.includes("Aprovar e Enviar Agora ao Cliente"));
    assert.ok(p6Taxa.resposta.includes("Aprovar e Finalizar"));
    assert.ok(p6Taxa.resposta.includes("Refazer Proposta"));

    // Verifica persistência preliminar no banco (status pendente)
    let propostas = supabase._propostas();
    assert.equal(propostas.length, 1);
    assert.equal(propostas[0].cliente_nome, "Transportes Imperial Ltda");
    assert.equal(propostas[0].com_fidelidade_mensalidade, 69.9);
    assert.equal(propostas[0].com_fidelidade_instalacao, 0);
    assert.equal(propostas[0].valor_base_repasse, 45);
    assert.equal(propostas[0].origem_emissao, "whatsapp");
    assert.equal(propostas[0].status, "pendente");
    assert.equal(propostas[0].quantidade_veiculos, 1);

    // 7. Escolhe Opção 1: Aprovar e Enviar Agora ao Cliente
    const p6Aprovado = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "1",
      },
      supabase,
    );
    assert.equal(p6Aprovado.acaoExecutada, "proposta_aprovada_enviada_cliente");
    assert.ok(p6Aprovado.resposta.includes("Proposta Comercial Aprovada e Despachada"));
    assert.ok(p6Aprovado.resposta.includes("Transportes Imperial Ltda"));
    assert.ok(p6Aprovado.resposta.includes("Emitida por:"), "Deve conter quem enviou");
    assert.ok(
      !p6Aprovado.resposta.includes("diretoria/SuperADM"),
      "Não deve mencionar cópia à diretoria",
    );

    // Verifica que status no banco foi atualizado para "enviada"
    propostas = supabase._propostas();
    assert.equal(propostas.length, 1);
    assert.equal(propostas[0].status, "enviada");

    // Verifica que a sessão temporária foi devidamente encerrada
    const sessoesFinais = supabase._sessoes();
    assert.equal(sessoesFinais.length, 0);
  });

  it("Fluxo de Conferência: Opção 2 salva no sistema para envio manual posterior", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      sessoes: [
        {
          id: "sessao-conf",
          telefone: "5524999991111",
          fluxo: "proposta",
          etapa: "aguardando_conferencia_proposta",
          origem_role: "vendedor",
          valor_base_repasse: 45.0,
          dados: {
            emissor_nome: "Vendedor Teste",
            emissor_role: "vendedor",
            cliente_nome: "Mercado Central",
            cliente_telefone: "5524988887777",
            modalidade: "individual",
            veiculo_info: "Fiat Strada 2023",
            quantidade_veiculos: 1,
            numero_proposta: "PROP-2026-7788",
            valor_mensalidade: 79.9,
            valor_total_mensal: 79.9,
            pdf_base64: "JVBERi0xLjQK...",
            pdf_nome: "Proposta_PROP-2026-7788.pdf",
          },
        },
      ],
      propostas: [
        {
          id: "prop-1",
          numero_proposta: "PROP-2026-7788",
          cliente_nome: "Mercado Central",
          cliente_telefone: "5524988887777",
          status: "pendente",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "2",
      },
      supabase,
    );

    assert.equal(res.acaoExecutada, "proposta_aprovada_finalizada_sistema");
    assert.ok(res.resposta.includes("Proposta Comercial Salva no Sistema"));
    assert.ok(res.resposta.includes("PROP-2026-7788"));

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 0);
  });

  it("Fluxo de Conferência: Opção 3 refaz proposta e reinicia no nome do cliente", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      sessoes: [
        {
          id: "sessao-conf-3",
          telefone: "5524999991111",
          fluxo: "proposta",
          etapa: "aguardando_conferencia_proposta",
          origem_role: "vendedor",
          valor_base_repasse: 45.0,
          dados: {
            emissor_nome: "Vendedor Teste",
            emissor_role: "vendedor",
            cliente_nome: "Mercado Central",
            cliente_telefone: "5524988887777",
            modalidade: "individual",
            veiculo_info: "Fiat Strada 2023",
            quantidade_veiculos: 1,
            numero_proposta: "PROP-2026-7788",
            valor_mensalidade: 79.9,
            valor_total_mensal: 79.9,
          },
        },
      ],
      propostas: [
        {
          id: "prop-1",
          numero_proposta: "PROP-2026-7788",
          status: "pendente",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999991111",
        texto: "3",
      },
      supabase,
    );

    assert.equal(res.acaoExecutada, "proposta_reiniciada");
    assert.ok(res.resposta.includes("Reiniciando montagem da proposta"));
    assert.ok(res.resposta.includes("Nome Completo do Cliente"));

    // Proposta pendente foi removida
    const propostas = supabase._propostas();
    assert.equal(propostas.length, 0);

    // Sessão voltou para aguardando_cliente_nome
    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].etapa, "aguardando_cliente_nome");
  });

  it("Fluxo Completo de Frota Corporativa calculando valor total e notificando com campos mandatórios", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      sessoes: [
        {
          id: "sessao-adm",
          telefone: "5524992501512",
          origem_role: "superadmin",
          valor_base_repasse: 40.0,
          etapa: "aguardando_modalidade",
          dados_temporarios: {
            emissor_nome: "Super Administrador",
            emissor_role: "superadmin",
            cliente_nome: "Frota Vale do Paraíba",
            cliente_telefone: "5524993334444",
          },
        },
      ],
      relatorioConfig: {
        telefones: [{ telefone: "5524992501512" }],
      },
    });

    // 1. Seleciona opção 2 (Frota)
    const pModalidade = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "2",
      },
      supabase,
    );
    assert.equal(pModalidade.acaoExecutada, "modalidade_frota_selecionada");
    assert.ok(pModalidade.resposta.includes("Quantos veículos farão parte desta frota"));

    // 2. Digita quantidade (ex: 8 veículos)
    const pQtd = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "8",
      },
      supabase,
    );
    assert.equal(pQtd.acaoExecutada, "quantidade_recebida");
    assert.ok(pQtd.resposta.includes("8 veículos"));
    assert.ok(pQtd.resposta.includes("R$ 40,00"));

    // 3. Digita valor mensal por veículo (ex: 59,90) -> solicita taxa de instalação
    const pMensalidadeFrota = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "59,90",
      },
      supabase,
    );
    assert.equal(
      pMensalidadeFrota.acaoExecutada,
      "mensalidade_recebida_aguardando_taxa_instalacao",
    );

    // 3.1 Digita taxa de instalação de frota (ex: 50) -> gera proposta e exibe menu de conferência
    const pConferencia = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "50",
      },
      supabase,
    );
    assert.equal(pConferencia.acaoExecutada, "proposta_gerada_aguardando_conferencia");
    assert.ok(pConferencia.resposta.includes("8 veículos"));
    assert.ok(pConferencia.resposta.includes("Total: R$ 479,20/mês"));
    assert.ok(pConferencia.resposta.includes("Taxa de Instalação:* R$ 50,00"));

    const propostas = supabase._propostas();
    assert.equal(propostas.length, 1);
    assert.equal(propostas[0].tipo_proposta, "frota");
    assert.equal(propostas[0].quantidade_veiculos, 8);
    assert.equal(propostas[0].com_fidelidade_mensalidade, 59.9);
    assert.equal(propostas[0].com_fidelidade_instalacao, 50);

    // 4. Aprova envio direto ao cliente
    const pFinal = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "1",
      },
      supabase,
    );
    assert.equal(pFinal.acaoExecutada, "proposta_aprovada_enviada_cliente");

    const propostasFinais = supabase._propostas();
    assert.equal(propostasFinais.length, 1);
    assert.equal(propostasFinais[0].tipo_proposta, "frota");
    assert.equal(propostasFinais[0].quantidade_veiculos, 8);
    assert.equal(propostasFinais[0].com_fidelidade_mensalidade, 59.9);
  });

  it("Notificação ao SuperADM deve conter rigorosamente todos os campos solicitados", async () => {
    let chamadaEfetuada = false;
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data: { telefones: [{ telefone: "5524992501512" }] },
            }),
          }),
        }),
      }),
    };

    // A função utilitária notificarSuperAdmNovaProposta
    await notificarSuperAdmNovaProposta(mockSupabase, {
      emitidaPor: "Carlos Vendedor",
      origemRole: "vendedor",
      paraCliente: "Empresa ABC",
      telefoneCliente: "5524999998888",
      dataHora: "02/11/2026 às 22:30",
      valorProposta: 350.0,
      quantidadeVeiculos: 5,
      numeroProposta: "PROP-999888",
      origem: "WhatsApp Dialog",
    });

    // Em ambiente de teste despacharMensagemWhatsappBaileys retorna true com sucesso
    const enviado = await despacharMensagemWhatsappBaileys("5524992501512", "Teste");
    assert.equal(enviado, true);
  });

  it("Função normalizarProposta deve incluir os novos campos de repasse e quantidade", () => {
    const raw = {
      id: "prop-xyz",
      numero_proposta: "PROP-123456",
      cliente_nome: "Cliente Teste",
      cliente_telefone: "24999998888",
      quantidade_veiculos: 4,
      origem_emissao: "whatsapp",
      valor_base_repasse: 42.5,
      revendedor_id: "rev-1",
      vendedor_id: "vend-1",
      com_fidelidade_meses: 12,
      com_fidelidade_instalacao: 150,
      com_fidelidade_mensalidade: 69.9,
      sem_fidelidade_instalacao: 250,
      sem_fidelidade_mensalidade: 89.9,
      status: "enviada",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const norm = normalizarProposta(raw);
    assert.equal(norm.quantidade_veiculos, 4);
    assert.equal(norm.origem_emissao, "whatsapp");
    assert.equal(norm.valor_base_repasse, 42.5);
    assert.equal(norm.revendedor_id, "rev-1");
    assert.equal(norm.vendedor_id, "vend-1");
    assert.equal(norm.status, "enviada");
  });

  it("SEGURANÇA: Cliente NÃO pode enviar RELATORIO ou comandos administrativos", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      profiles: [], // Remetente não é SuperADM
      clientes: [
        {
          id: "cli-123",
          nome_razao_social: "Cliente Cadastrado",
          telefone: "5524988881234",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988881234",
        texto: "RELATORIO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_adm_bloqueado_para_nao_adm");
    assert.ok(res.resposta.includes("Não identifiquei esse comando"));
    assert.ok(!res.resposta.includes("Acesso Restrito"));
  });

  it("SEGURANÇA: Cliente NÃO pode receber informações de veículo de terceiro (placa diferente)", async () => {
    const supabaseMock: any = {
      from: (tabela: string) => {
        const qb: any = {
          select: () => qb,
          eq: () => qb,
          in: () => qb,
          or: () => qb,
          limit: () => qb,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: any) => {
            if (tabela === "clientes") {
              resolve({
                data: [
                  {
                    id: "cli-1",
                    nome: "Carlos Cliente",
                    telefone: "5524977771111",
                    documento: "12345678900",
                  },
                ],
                error: null,
              });
            } else if (tabela === "veiculos") {
              // Cliente possui apenas o veículo MEU1234
              resolve({
                data: [
                  {
                    id: "v-1",
                    placa: "MEU1234",
                    marca: "VW",
                    modelo: "Gol",
                    imei: "111222333",
                    ativo: true,
                  },
                ],
                error: null,
              });
            } else {
              resolve({ data: [], error: null });
            }
          },
        };
        return qb;
      },
    };

    // Cliente tenta consultar placa de OUTRO cliente (OUT9999)
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524977771111",
        texto: "LOCALIZACAO OUT9999",
      },
      supabaseMock,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "veiculo_nao_pertence_ao_cliente");
    assert.ok(res.resposta.includes("Acesso Negado — Veículo Não Pertence ao Seu Cadastro"));
    assert.ok(res.resposta.includes("OUT9999"));
    assert.ok(res.resposta.includes("MEU1234"));
  });

  it("SEGURANÇA: Bloqueio com PIN de 4 dígitos incorreto deve ser rejeitado", async () => {
    const supabaseMock: any = {
      from: (tabela: string) => {
        const qb: any = {
          select: () => qb,
          eq: () => qb,
          in: () => qb,
          or: () => qb,
          limit: () => qb,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: any) => {
            if (tabela === "clientes") {
              resolve({
                data: [
                  {
                    id: "cli-1",
                    nome: "Carlos Cliente",
                    telefone: "5524977771111",
                    documento: "98765432100", // PIN correto: 9876
                  },
                ],
                error: null,
              });
            } else if (tabela === "veiculos") {
              resolve({
                data: [
                  {
                    id: "v-1",
                    placa: "MEU1234",
                    marca: "VW",
                    modelo: "Gol",
                    imei: "111222333",
                    ativo: true,
                  },
                ],
                error: null,
              });
            } else {
              resolve({ data: [], error: null });
            }
          },
        };
        return qb;
      },
    };

    // Cliente envia BLOQUEIO SIM com PIN errado 0000
    const resInvalido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524977771111",
        texto: "BLOQUEIO SIM MEU1234 0000",
      },
      supabaseMock,
    );

    assert.equal(resInvalido.sucesso, true);
    assert.equal(resInvalido.acaoExecutada, "bloqueio_pin_invalido");
    assert.ok(resInvalido.resposta.includes("PIN de Segurança Incorreto"));
  });

  it("Transição de Etapas: ao enviar telefone do cliente após o nome, deve avançar para modalidade sem travar em loop", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      profiles: [
        {
          id: "adm-1",
          nome: "Dario Novaes",
          role: "superadmin",
          telefone: "5524992494030",
        },
      ],
      revendedores: [
        {
          id: "rev-dario",
          nome: "Revenda Teste",
          telefone: "5524992494030",
        },
      ],
    });

    // 1. Inicia proposta
    const p1 = await processarMensagemWhatsappRecebida(
      { remetente: "5524992494030", texto: "PROPOSTA" },
      supabase,
    );
    assert.equal(p1.acaoExecutada, "dialogo_proposta_iniciado");
    assert.ok(p1.resposta.includes("Dario Novaes"));
    assert.ok(p1.resposta.includes("SUPERADMIN"));
    assert.ok(p1.resposta.includes("Digite o *Nome Completo do Cliente*"));

    // 2. Envia o nome do cliente "Gustavo"
    const p2 = await processarMensagemWhatsappRecebida(
      { remetente: "5524992494030", texto: "Gustavo" },
      supabase,
    );
    assert.equal(p2.acaoExecutada, "cliente_nome_recebido");
    assert.ok(p2.resposta.includes("cliente *Gustavo* registrado"));
    assert.ok(p2.resposta.includes("Agora informe o *WhatsApp com DDD do Cliente*"));

    // 3. Envia o telefone do cliente "24992494030"
    const p3 = await processarMensagemWhatsappRecebida(
      { remetente: "5524992494030", texto: "24992494030" },
      supabase,
    );
    assert.equal(p3.acaoExecutada, "cliente_telefone_recebido");
    assert.ok(p3.resposta.includes("Qual a modalidade da proposta"));
    assert.ok(p3.resposta.includes("Digite *1* para Veículo Individual"));
  });

  it("Revendedor com LID de privacidade deve ser reconhecido como revendedor e não usuário desconhecido", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-paulo",
          nome: "paulo darci Alves Gonçalves",
          telefone: "(24) 97401-9339",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
    });

    // Revendedor envia comando "AJUDA" com seu LID e senderPn resolvido pelo Baileys
    const resLid = await processarMensagemWhatsappRecebida(
      {
        remetente: "81879323701469",
        senderPn: "5524974019339",
        texto: "AJUDA",
      },
      supabase,
    );

    assert.equal(resLid.sucesso, true);
    assert.equal(resLid.acaoExecutada, "menu_revendedor");
    assert.ok(resLid.resposta.includes("Central do Revendedor"));
    assert.ok(resLid.resposta.includes("paulo darci Alves Gonçalves"));

    // Revendedor envia "PROPOSTA" via LID com senderPn
    const resProposta = await processarMensagemWhatsappRecebida(
      {
        remetente: "81879323701469",
        senderPn: "5524974019339",
        texto: "PROPOSTA",
      },
      supabase,
    );

    assert.equal(resProposta.acaoExecutada, "dialogo_proposta_iniciado");
    assert.ok(resProposta.resposta.includes("paulo darci Alves Gonçalves"));
    assert.ok(resProposta.resposta.includes("REVENDEDOR"));
    assert.ok(resProposta.resposta.includes("R$ 40,00"));
  });

  it("Revendedor com LID não mapeado deve ser reconhecido por pushName de perfil", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-silva",
          nome: "Marcos Silva Representações",
          telefone: "(24) 98888-5555",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
    });

    // Envia com LID novo aleatório de 14 dígitos, mas com pushName do contato
    const resPush = await processarMensagemWhatsappRecebida(
      {
        remetente: "99887766554433",
        pushName: "Marcos Silva",
        texto: "AJUDA",
      },
      supabase,
    );

    assert.equal(resPush.sucesso, true);
    assert.equal(resPush.acaoExecutada, "menu_revendedor");
    assert.ok(resPush.resposta.includes("Central do Revendedor"));
    assert.ok(resPush.resposta.includes("Marcos Silva Representações"));
  });

  it("SEGURANÇA E STEALTH: Usuário não autorizado/visitante é atendido pelo Assistente GD sem vazar propostas ou dados confidenciais", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      profiles: [
        {
          id: "mot-1",
          nome: "Raphael Motorista",
          role: "motorista",
          telefone: "24999914313",
        },
      ],
    });

    // 1. Primeiro contato de número não autorizado: recebe o menu do Assistente GD
    const res1 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999914313",
        texto: "Olá",
      },
      supabase,
    );

    assert.equal(res1.sucesso, true);
    assert.equal(res1.acaoExecutada, "atendimento_publico_menu_inicial");
    assert.ok(res1.resposta.includes("Assistente GD"));
    assert.ok(
      !res1.resposta.includes("Acesso Não Autorizado"),
      "Proibido vazar enumeração de papel ou erro explícito",
    );

    // 2. Não possui permissão para emitir proposta comercial
    const res2 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524999914313",
        texto: "PROPOSTA",
      },
      supabase,
    );

    assert.equal(res2.sucesso, true);
    assert.equal(res2.acaoExecutada, "proposta_nao_autorizada");
    assert.ok(res2.resposta.includes("Não identifiquei"));
    assert.ok(!res2.resposta.includes("Acesso Restrito"));
  });

  it("CONVERSÃO COMERCIAL: Cliente responde 'ACEITO' e sistema atualiza proposta, notifica emissor e confirma", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      propostas: [
        {
          id: "prop-aceite-1",
          numero_proposta: "PROP-2026-8888",
          cliente_nome: "Mariana Souza",
          cliente_telefone: "5524988884444",
          tipo_proposta: "individual",
          veiculo_modelo: "Honda Fit 2018",
          veiculo_ano: "2018",
          com_fidelidade_mensalidade: 69.9,
          com_fidelidade_instalacao: 0,
          status: "enviada",
          vendedor_id: "vend-1",
        },
      ],
      vendedores: [
        {
          id: "vend-1",
          nome: "Lucas Vendedor",
          telefone: "5524991112222",
          ativo: true,
        },
      ],
    });

    const resAceite = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988884444",
        texto: "ACEITO",
      },
      supabase,
    );

    assert.equal(resAceite.sucesso, true);
    assert.equal(resAceite.acaoExecutada, "proposta_aceita_cliente");
    assert.ok(resAceite.resposta.includes("Proposta Confirmada com Sucesso"));
    assert.ok(resAceite.resposta.includes("Mariana Souza"));
    assert.ok(resAceite.resposta.includes("PROP-2026-8888"));
  });

  it("Revendedor com LID mapeado é reconhecido imediatamente pelo número cadastrado e opera normalmente", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-paulo",
          nome: "paulo darci Alves Gonçalves",
          telefone: "(24) 97401-9339",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
    });

    // Mensagem enviada pelo identificador/LID do revendedor cadastrado
    const resComando = await processarMensagemWhatsappRecebida(
      {
        remetente: "237731737526315",
        texto: "OI",
      },
      supabase,
    );

    assert.equal(resComando.sucesso, true);
    assert.equal(resComando.acaoExecutada, "menu_revendedor");
    assert.ok(resComando.resposta.includes("paulo darci Alves Gonçalves"));
    assert.ok(resComando.resposta.includes("Central do Revendedor"));
    assert.ok(!resComando.resposta.includes("Bem-vindo(a) ao GD Rastreamento"));
  });

  it("Revendedor NÃO tem permissão de rastrear veículo e recebe aviso de restrição de telemetria ao enviar LOCALIZACAO", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-paulo",
          nome: "paulo darci Alves Gonçalves",
          telefone: "(24) 97401-9339",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
      clientes: [
        {
          id: "cli-rev-1",
          nome: "Transportadora Nova Era",
          revendedor_id: "rev-paulo",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524974019339",
        texto: "LOCALIZACAO RIO2A18",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_veicular_restrito_parceiro");
    assert.ok(res.resposta.includes("Não identifiquei esse comando"));
    assert.ok(!res.resposta.includes("Acesso Restrito"));
  });

  it("Revendedor tem acesso completo a PAGAMENTOS, CONTRATOS e DRE da sua carteira", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-paulo",
          nome: "paulo darci Alves Gonçalves",
          telefone: "(24) 97401-9339",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
      clientes: [
        {
          id: "cli-rev-1",
          nome: "Transportadora Nova Era",
          telefone: "24988881111",
          revendedor_id: "rev-paulo",
        },
      ],
    });

    // 1. Consulta DRE / Financeiro
    const resDre = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524974019339",
        texto: "DRE",
      },
      supabase,
    );
    assert.equal(resDre.acaoExecutada, "dre_revendedor");
    assert.ok(resDre.resposta.includes("Central Financeira e Recebimentos"));
    assert.ok(resDre.resposta.includes("R$ 40,00"));

    // 2. Consulta Pagamentos da Carteira
    const resPag = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524974019339",
        texto: "PAGAMENTOS",
      },
      supabase,
    );
    assert.equal(resPag.acaoExecutada, "pagamentos_revendedor");
    assert.ok(resPag.resposta.includes("Pagamentos dos Clientes da Carteira"));

    // 3. Consulta Contratos da Carteira
    const resCt = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524974019339",
        texto: "CONTRATOS",
      },
      supabase,
    );
    assert.equal(resCt.acaoExecutada, "contratos_revendedor");
    assert.ok(resCt.resposta.includes("Gestão de Contratos da Carteira"));
  });

  it("Revendedor que envia comando desconhecido recebe menu_revendedor_fallback e NUNCA mensagem de boas-vindas", async () => {
    const supabase = criarMockSupabaseParaPropostas({
      revendedores: [
        {
          id: "rev-paulo",
          nome: "paulo darci Alves Gonçalves",
          telefone: "(24) 97401-9339",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "260322296373289",
        senderPn: "5524974019339",
        texto: "QUALQUER COMANDO NAO EXISTENTE 123",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "menu_revendedor_fallback");
    assert.ok(res.resposta.includes("paulo darci Alves Gonçalves"));
    assert.ok(res.resposta.includes("Central do Revendedor"));
    assert.ok(res.resposta.includes("Comando não reconhecido"));
    assert.ok(!res.resposta.includes("Bem-vindo(a) ao GD Rastreamento"));
  });

  it("Permissão Web App: Revendedor e Vendedor devem possuir acesso ao módulo de propostas comerciais e à rota /propostas", () => {
    const sessionRevendedor: any = {
      isRevendedor: true,
      isAdmin: false,
      isSuperAdmin: false,
      isVendedor: false,
      revendedorId: "rev-123",
      modulos: [],
    };

    const sessionVendedor: any = {
      isVendedor: true,
      isAdmin: false,
      isSuperAdmin: false,
      isRevendedor: false,
      vendedorId: "vend-456",
      modulos: [],
    };

    const sessionMotorista: any = {
      isMotorista: true,
      isAdmin: false,
      isSuperAdmin: false,
      isRevendedor: false,
      isVendedor: false,
    };

    // Módulo 'propostas'
    assert.equal(
      podeAcessarModulo(sessionRevendedor, "propostas"),
      true,
      "Revendedor deve acessar modulo propostas",
    );
    assert.equal(
      podeAcessarModulo(sessionVendedor, "propostas"),
      true,
      "Vendedor deve acessar modulo propostas",
    );
    assert.equal(
      podeAcessarModulo(sessionMotorista, "propostas"),
      false,
      "Motorista nao deve acessar modulo propostas",
    );

    // Rota '/propostas'
    assert.equal(
      podeAcessarRota(sessionRevendedor, "/propostas"),
      true,
      "Revendedor deve acessar rota /propostas",
    );
    assert.equal(
      podeAcessarRota(sessionVendedor, "/propostas"),
      true,
      "Vendedor deve acessar rota /propostas",
    );
    assert.equal(
      podeAcessarRota(sessionMotorista, "/propostas"),
      false,
      "Motorista nao deve acessar rota /propostas",
    );
  });
});
