import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processarMensagemWhatsappRecebida,
  normalizarTelefoneParaBusca,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";

function criarMockSupabase(dados: {
  profiles?: any[];
  clientes?: any[];
  veiculos?: any[];
  mensalidades?: any[];
  instalacoes?: any[];
  revendedores?: any[];
  vendedores?: any[];
  instaladores?: any[];
  relatorioConfig?: any;
  sessoes?: any[];
}) {
  const eventosInseridos: any[] = [];
  const veiculosAtualizados: any[] = [];
  let sessoes: any[] = [...(dados.sessoes || [])];

  const supabaseMock: any = {
    _sessoes: () => sessoes,
    from: (tabela: string) => {
      let filtroTabela: any = {};
      const queryBuilder: any = {
        select: (_cols?: string) => queryBuilder,
        eq: (col: string, val: any) => {
          filtroTabela[col] = val;
          return queryBuilder;
        },
        in: (col: string, vals: any[]) => {
          filtroTabela[`${col}_in`] = vals;
          return queryBuilder;
        },
        neq: (col: string, val: any) => {
          filtroTabela[`${col}_neq`] = val;
          return queryBuilder;
        },
        or: (cond: string) => {
          filtroTabela.or = cond;
          return queryBuilder;
        },
        order: (_col: string, _opts?: any) => queryBuilder,
        limit: (_n: number) => queryBuilder,
        maybeSingle: async () => {
          if (tabela === "relatorio_gerencial_config") {
            return { data: dados.relatorioConfig || null, error: null };
          }
          if (tabela === "veiculos") {
            const v = dados.veiculos?.[0] || null;
            return { data: v, error: null };
          }
          if (tabela === "whatsapp_sessoes_dialogo") {
            const achou = sessoes.find(
              (s) =>
                (filtroTabela.telefone && s.telefone === filtroTabela.telefone) ||
                (filtroTabela.or &&
                  (filtroTabela.or.includes(s.telefone) ||
                    (s.telefone && filtroTabela.or.includes(s.telefone.slice(-8))))),
            );
            return { data: achou || null, error: null };
          }
          return { data: null, error: null };
        },
        update: (updatePayload: any) => {
          return {
            eq: (_c: string, idVal: any) => {
              veiculosAtualizados.push({ id: idVal, ...updatePayload });
              return Promise.resolve({ data: updatePayload, error: null });
            },
          };
        },
        insert: (insertPayload: any) => {
          if (tabela === "eventos_veiculo") {
            eventosInseridos.push(insertPayload);
          }
          if (tabela === "whatsapp_sessoes_dialogo") {
            sessoes.push({ id: `sessao-${Date.now()}`, ...insertPayload });
          }
          return Promise.resolve({ data: insertPayload, error: null });
        },
        upsert: (upsertPayload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            const idx = sessoes.findIndex((s) => s.telefone === upsertPayload.telefone);
            if (idx >= 0) {
              sessoes[idx] = { ...sessoes[idx], ...upsertPayload };
            } else {
              sessoes.push({ id: `sessao-${Date.now()}`, ...upsertPayload });
            }
          }
          return Promise.resolve({ data: upsertPayload, error: null });
        },
        delete: () => {
          return {
            eq: (_c: string, val: any) => {
              if (tabela === "whatsapp_sessoes_dialogo") {
                sessoes = sessoes.filter((s) => s.id !== val && s.telefone !== val);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        then: (resolve: (val: any) => void) => {
          if (tabela === "profiles") {
            const pList = (dados.profiles || []).filter((p) => {
              if (filtroTabela.role && p.role !== filtroTabela.role) return false;
              if (filtroTabela.ativo !== undefined && p.ativo !== filtroTabela.ativo) return false;
              return true;
            });
            resolve({ data: pList, error: null });
            return;
          }
          if (tabela === "instaladores") {
            resolve({ data: dados.instaladores || [], error: null });
            return;
          }
          if (tabela === "clientes") {
            resolve({ data: dados.clientes || [], error: null });
            return;
          }
          if (tabela === "veiculos") {
            const vList = (dados.veiculos || []).filter((v) => {
              if (filtroTabela.cliente_id && v.cliente_id !== filtroTabela.cliente_id) return false;
              if (filtroTabela.ativo !== undefined && v.ativo !== filtroTabela.ativo) return false;
              return true;
            });
            resolve({ data: vList, error: null });
            return;
          }
          if (tabela === "mensalidades") {
            const mList = (dados.mensalidades || []).filter((m) => {
              if (filtroTabela.cliente_id && m.cliente_id !== filtroTabela.cliente_id) return false;
              return true;
            });
            resolve({ data: mList, error: null });
            return;
          }
          if (tabela === "instalacoes") {
            const iList = (dados.instalacoes || []).filter((i) => {
              if (filtroTabela.cliente_id && i.cliente_id !== filtroTabela.cliente_id) return false;
              return true;
            });
            resolve({ data: iList, error: null });
            return;
          }
          if (tabela === "revendedores") {
            resolve({ data: dados.revendedores || [], error: null });
            return;
          }
          if (tabela === "vendedores") {
            resolve({ data: dados.vendedores || [], error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return queryBuilder;
    },
    _eventosInseridos: eventosInseridos,
    _veiculosAtualizados: veiculosAtualizados,
  };

  return supabaseMock;
}

describe("HUNTER-GUARDIAN — Auto-Monitoramento Interativo WhatsApp", () => {
  it("deve normalizar telefones extraindo últimos 8 e 9 dígitos", () => {
    const res = normalizarTelefoneParaBusca("+55 (24) 99250-1512");
    assert.equal(res.digitos, "5524992501512");
    assert.equal(res.ultimos8, "92501512");
    assert.equal(res.ultimos9, "992501512");
  });

  it("SuperADM: deve reconhecer comando RELATORIO e retornar resposta imediata", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992494030",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992494030",
        texto: "RELATÓRIO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_disparado");
    assert.ok(res.resposta.includes("Relatório Gerencial Imediato"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("SuperADM: deve retornar raio-x da frota em tempo real com FROTA", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992494030",
        },
      ],
      veiculos: [
        {
          id: "v1",
          placa: "AXH0E44",
          ignicao: true,
          velocidade: 45,
          ativo: true,
          updated_at: new Date().toISOString(),
        },
        {
          id: "v2",
          placa: "LTK1A94",
          ignicao: false,
          velocidade: 0,
          ativo: true,
          updated_at: new Date().toISOString(),
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992494030",
        texto: "FROTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "resumo_frota");
    assert.ok(res.resposta.includes("Total de Veículos Ativos: 2"));
    assert.ok(res.resposta.includes("Em movimento: 1"));
    assert.ok(res.resposta.includes("Estacionados / desligados: 1"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("SuperADM: deve retornar diagnóstico de infraestrutura Oracle Always Free com INFRA", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992494030",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992494030",
        texto: "INFRA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "infra_saude");
    assert.ok(res.resposta.includes("Oracle Cloud Always Free"));
    assert.ok(res.resposta.includes("167.234.233.82"));
    assert.ok(res.resposta.includes("gps.oficial.tec.br"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve retornar localização com link do Google Maps para veículo único", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Transportadora Confiança",
          telefone: "5524988776655",
          status: "ativo",
        },
      ],
      veiculos: [
        {
          id: "v-1",
          cliente_id: clienteId,
          placa: "AXH0E44",
          marca: "Volvo",
          modelo: "XC60",
          latitude: -22.51234,
          longitude: -44.10567,
          velocidade: 60,
          ignicao: true,
          bloqueado: false,
          odometro_km: 183400,
          odometro_motor_media_km: 183420.5,
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "LOCALIZACAO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "localizacao_enviada");
    assert.ok(res.resposta.includes("AXH0E44"));
    assert.ok(res.resposta.includes("Volvo XC60"));
    assert.ok(res.resposta.includes("maps.google.com/?q=-22.51234,-44.10567"));
    assert.ok(res.resposta.includes("183.420,5 km"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve listar opções quando tiver múltiplos veículos e comando genérico", async () => {
    const clienteId = "cli-multi";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Frotas Brasil",
          telefone: "5524977665544",
          status: "ativo",
        },
      ],
      veiculos: [
        {
          id: "v-1",
          cliente_id: clienteId,
          placa: "AXH0E44",
          modelo: "XC60",
          ativo: true,
        },
        {
          id: "v-2",
          cliente_id: clienteId,
          placa: "LTK1A94",
          modelo: "Montana",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524977665544",
        texto: "ONDE ESTA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "listar_veiculos_localizacao");
    assert.ok(res.resposta.includes("Você possui 2 veículos"));
    assert.ok(res.resposta.includes("AXH0E44"));
    assert.ok(res.resposta.includes("LTK1A94"));
    assert.ok(res.resposta.includes("LOCALIZACAO <PLACA>"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve exigir confirmação de segurança antes de efetivar BLOQUEIO", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Transportadora Confiança",
          telefone: "5524988776655",
          status: "ativo",
        },
      ],
      veiculos: [
        {
          id: "v-1",
          cliente_id: clienteId,
          placa: "AXH0E44",
          imei: "868012345678901",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "BLOQUEIO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "confirmacao_bloqueio_solicitada");
    assert.ok(res.resposta.includes("PROTOCOLO DE SEGURANÇA"));
    assert.ok(res.resposta.includes("BLOQUEIO SIM AXH0E44"));
  });

  it("Cliente: deve efetivar bloqueio e registrar evento após confirmação expressa", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Transportadora Confiança",
          telefone: "5524988776655",
          status: "ativo",
        },
      ],
      veiculos: [
        {
          id: "v-1",
          cliente_id: clienteId,
          placa: "AXH0E44",
          imei: "868012345678901",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "BLOQUEIO SIM AXH0E44",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "bloqueio_efetivado");
    assert.ok(res.resposta.includes("COMANDO DE BLOQUEIO TRANSMITIDO"));
    assert.ok(res.resposta.includes("AXH0E44"));

    // Verifica persistência de bloqueio e evento
    assert.equal(supabase._veiculosAtualizados.length, 1);
    assert.equal(supabase._veiculosAtualizados[0].bloqueado, true);
    assert.equal(supabase._eventosInseridos.length, 1);
    assert.equal(supabase._eventosInseridos[0].tipo, "bloqueio_solicitado");
  });

  it("Cliente: deve consultar fatura e gerar PIX Copia e Cola EMV", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Transportadora Confiança",
          telefone: "5524988776655",
          status: "ativo",
        },
      ],
      veiculos: [{ id: "v-1", cliente_id: clienteId, placa: "AXH0E44", ativo: true }],
      mensalidades: [
        {
          id: "m-1",
          cliente_id: clienteId,
          valor: 89.9,
          data_vencimento: "2026-11-10",
          status: "pendente",
          mes_referencia: "11/2026",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "PIX",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "fatura_pix_enviada");
    assert.ok(res.resposta.includes("R$ 89,90"));
    assert.ok(res.resposta.includes("pix@oficial.tec.br"));
    assert.ok(res.resposta.includes("PIX COPIA E COLA"));
    assert.ok(res.resposta.includes("000201"), "Deve conter payload EMV BACEN 000201");
  });

  it("Cliente: deve receber confirmação com opções 1 e 2 ao enviar foto/PDF de comprovante", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Transportadora Confiança",
          telefone: "5524988776655",
          status: "ativo",
        },
      ],
      veiculos: [{ id: "v-1", cliente_id: clienteId, placa: "AXH0E44", ativo: true }],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "comprovante de abastecimento",
        hasMedia: true,
        mediaMimetype: "image/jpeg",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comprovante_recebido");
    assert.ok(res.resposta.includes("Comprovante recebido com sucesso"));
    assert.ok(res.resposta.includes("Digite *1* para Manter"));
    assert.ok(res.resposta.includes("Digite *2* para Excluir"));

    // Testa resposta '1'
    const res1 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "1",
      },
      supabase,
    );
    assert.equal(res1.acaoExecutada, "manter_comprovante");
    assert.ok(res1.resposta.includes("Comprovante mantido"));

    // Testa resposta '2'
    const res2 = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988776655",
        texto: "2",
      },
      supabase,
    );
    assert.equal(res2.acaoExecutada, "excluir_comprovante");
    assert.ok(res2.resposta.includes("Comprovante excluído"));
  });

  it("Número Desconhecido: deve responder com menu de atendimento ao público do Assistente GD (dev-bot)", async () => {
    const supabase = criarMockSupabase({
      clientes: [],
      profiles: [],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5511999990000",
        texto: "Olá",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_publico_menu_inicial");
    assert.ok(res.resposta.includes("Assistente GD"));
    assert.ok(res.resposta.includes("Conhecer Planos e Benefícios"));
    assert.ok(res.resposta.includes("Falar com Atendente Humano"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Operador: deve receber todos os comandos e parâmetros ao enviar AJUDA", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "op-1",
          nome: "Carlos Operador",
          role: "operador",
          telefone: "5524991112233",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "AJUDA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "menu_operador");
    assert.ok(res.resposta.includes("Central Operador"));
    assert.ok(res.resposta.includes("PROPOSTA"));
    assert.ok(res.resposta.includes("RELATORIO"));
    assert.ok(res.resposta.includes("FROTA"));
    assert.ok(res.resposta.includes("INFRA"));
    assert.ok(res.resposta.includes("INADIMPLENTES"));
    assert.ok(res.resposta.includes("COMANDO <PLACA> <CMD>"));
    assert.ok(res.resposta.includes("LOCALIZACAO <PLACA>"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Revendedor: deve receber estritamente parâmetros de revenda ao enviar AJUDA", async () => {
    const supabase = criarMockSupabase({
      revendedores: [
        {
          id: "rev-1",
          nome: "Auto Tracker Revenda",
          telefone: "5524998887766",
          valor_base_sistema: 42.0,
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524998887766",
        texto: "AJUDA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "menu_revendedor");
    assert.ok(res.resposta.includes("Central do Revendedor"));
    assert.ok(res.resposta.includes("PROPOSTA"));
    assert.ok(res.resposta.includes("DRE"));
    assert.ok(res.resposta.includes("CLIENTES"));
    assert.ok(!res.resposta.includes("INFRA"), "Revendedor não deve receber INFRA");
    assert.ok(!res.resposta.includes("INADIMPLENTES"), "Revendedor não deve receber INADIMPLENTES");
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Vendedor: deve receber estritamente parâmetros de venda ao enviar AJUDA", async () => {
    const supabase = criarMockSupabase({
      vendedores: [
        {
          id: "vend-1",
          nome: "Lucas Vendas",
          telefone: "5524997776655",
          valor_base_vendedor: 55.0,
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524997776655",
        texto: "PARAMETROS",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "menu_vendedor");
    assert.ok(res.resposta.includes("Central do Vendedor"));
    assert.ok(res.resposta.includes("PROPOSTA"));
    assert.ok(res.resposta.includes("COMISSAO"));
    assert.ok(!res.resposta.includes("FROTA"), "Vendedor não deve receber FROTA");
    assert.ok(!res.resposta.includes("INFRA"), "Vendedor não deve receber INFRA");
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve receber status da instalação ao enviar INSTALACAO", async () => {
    const clienteId = "cli-recem-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Joao Silva",
          telefone: "5524993334455",
          status: "aguardando_instalacao",
        },
      ],
      instalacoes: [
        {
          id: "inst-1",
          cliente_id: clienteId,
          placa: "RST8E99",
          marca: "Volkswagen",
          modelo: "Gol 1.0",
          status: "agendada",
          data_agendamento: "2026-11-05",
          hora_agendamento: "14:00",
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524993334455",
        texto: "INSTALACAO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "status_instalacao_consultado");
    assert.ok(res.resposta.includes("Status da Instalação"));
    assert.ok(res.resposta.includes("RST8E99"));
    assert.ok(res.resposta.includes("Agendada para 05/11/2026 às 14:00"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve receber comandos autorizados incluindo INSTALACAO ao enviar AJUDA", async () => {
    const clienteId = "cli-1";
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: clienteId,
          nome: "Maria Oliveira",
          telefone: "5524992223344",
          status: "ativo",
        },
      ],
      veiculos: [{ id: "v-1", cliente_id: clienteId, placa: "ABC1D23", ativo: true }],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992223344",
        texto: "AJUDA",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "menu_cliente");
    assert.ok(res.resposta.includes("LOCALIZACAO"));
    assert.ok(res.resposta.includes("BLOQUEIO"));
    assert.ok(res.resposta.includes("DESBLOQUEIO"));
    assert.ok(res.resposta.includes("INSTALACAO"));
    assert.ok(res.resposta.includes("PIX"));
    assert.ok(res.resposta.includes("STATUS"));
    assert.ok(!res.resposta.includes("FROTA"), "Cliente não deve ver FROTA");
    assert.ok(!res.resposta.includes("RELATORIO"), "Cliente não deve ver RELATORIO");
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("SuperADM: deve receber listagem de instaladores com nome, telefone e endereço ao enviar INSTALADORES", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992501512",
          ativo: true,
        },
        {
          id: "inst-1",
          nome: "Carlos Tecnico",
          role: "instalador",
          telefone: "5524988887766",
          endereco_instalacao: "Av. Automotiva 100, Volta Redonda - RJ",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "INSTALADORES",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "instaladores_consultado");
    assert.ok(res.resposta.includes("Instaladores Credenciados"));
    assert.ok(res.resposta.includes("Carlos Tecnico"));
    assert.ok(res.resposta.includes("(24) 98888-7766"));
    assert.ok(res.resposta.includes("Av. Automotiva 100, Volta Redonda - RJ"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Revendedor: deve receber listagem de instaladores ao enviar INSTALADORES", async () => {
    const supabase = criarMockSupabase({
      revendedores: [
        {
          id: "rev-1",
          nome: "Franquia Sul Fluminense",
          telefone: "5524991112233",
          valor_base_sistema: 40.0,
          ativo: true,
        },
      ],
      profiles: [
        {
          id: "inst-1",
          nome: "Marcos Instalador",
          role: "instalador",
          telefone: "5524977778899",
          endereco_instalacao: "Rua das Oficinas 50, Barra Mansa - RJ",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "INSTALADORES",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "instaladores_consultado");
    assert.ok(res.resposta.includes("Instaladores Credenciados"));
    assert.ok(res.resposta.includes("Marcos Instalador"));
    assert.ok(res.resposta.includes("(24) 97777-8899"));
    assert.ok(res.resposta.includes("Rua das Oficinas 50, Barra Mansa - RJ"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Vendedor: deve receber listagem de instaladores ao enviar INSTALADORES", async () => {
    const supabase = criarMockSupabase({
      vendedores: [
        {
          id: "vend-1",
          nome: "Lucas Vendas",
          telefone: "5524997776655",
          valor_base_vendedor: 50.0,
          ativo: true,
        },
      ],
      profiles: [
        {
          id: "inst-1",
          nome: "Oficina EletroAuto",
          role: "instalador",
          telefone: "5524966665544",
          endereco_instalacao: "Av. Brasil 300, Resende - RJ",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524997776655",
        texto: "INSTALADORES",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "instaladores_consultado");
    assert.ok(res.resposta.includes("Instaladores Credenciados"));
    assert.ok(res.resposta.includes("Oficina EletroAuto"));
    assert.ok(res.resposta.includes("(24) 96666-5544"));
    assert.ok(res.resposta.includes("Av. Brasil 300, Resende - RJ"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Cliente: deve ser bloqueado ao tentar enviar INSTALADORES e orientado para INSTALACAO", async () => {
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: "cli-1",
          nome: "Joao Silva",
          telefone: "5524993334455",
          status: "ativo",
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524993334455",
        texto: "INSTALADORES",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "instaladores_restrito_cliente");
    assert.ok(res.resposta.includes("Não identifiquei esse comando"));
    assert.ok(res.resposta.includes("AJUDA"));
    assert.ok(!res.resposta.includes("Acesso Restrito"));
    assert.ok(!res.resposta.includes("Oficina"));
    assert.ok(!res.resposta.includes("&"), "Proibido caractere &");
  });

  it("Menus de AJUDA: SuperADM, Revendedor e Vendedor devem exibir o parâmetro INSTALADORES", async () => {
    // 1. SuperADM
    const supAdm = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "SuperADM",
          role: "superadmin",
          telefone: "5524992501512",
        },
      ],
    });
    const resAdm = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "AJUDA" },
      supAdm,
    );
    assert.ok(resAdm.resposta.includes("INSTALADORES"));

    // 2. Revendedor
    const supRev = criarMockSupabase({
      revendedores: [
        {
          id: "rev-1",
          nome: "Revenda Alpha",
          telefone: "5524991112233",
          ativo: true,
        },
      ],
    });
    const resRev = await processarMensagemWhatsappRecebida(
      { remetente: "5524991112233", texto: "AJUDA" },
      supRev,
    );
    assert.ok(resRev.resposta.includes("INSTALADORES"));

    // 3. Vendedor
    const supVend = criarMockSupabase({
      vendedores: [
        {
          id: "vend-1",
          nome: "Vendedor Beta",
          telefone: "5524997776655",
          ativo: true,
        },
      ],
    });
    const resVend = await processarMensagemWhatsappRecebida(
      { remetente: "5524997776655", texto: "AJUDA" },
      supVend,
    );
    assert.ok(resVend.resposta.includes("INSTALADORES"));
  });

  it("Número Desconhecido: 1º contato recebe menu do Assistente GD; comandos posteriores navegam no menu", async () => {
    const supabase = criarMockSupabase({
      clientes: [],
      profiles: [],
    });

    // 1º contato
    const res1 = await processarMensagemWhatsappRecebida(
      { remetente: "5511999998888", texto: "Olá" },
      supabase,
    );
    assert.equal(res1.acaoExecutada, "atendimento_publico_menu_inicial");
    assert.ok(res1.resposta.includes("Assistente GD"));

    // 2º contato com escolha de planos (Opção 1)
    const res2 = await processarMensagemWhatsappRecebida(
      { remetente: "5511999998888", texto: "1" },
      supabase,
    );
    assert.equal(res2.acaoExecutada, "atendimento_publico_planos");
    assert.ok(res2.resposta.includes("Plano Básico"));
    assert.ok(res2.resposta.includes("Plano Pro"));
    assert.ok(res2.resposta.includes("Plano Master"));
  });

  it("SuperADM: comando STATUS com múltiplos veículos lista opções 1, 2, ... e loop seleciona veículo ou cancela", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "adm-1",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992501512",
        },
      ],
      veiculos: [
        {
          id: "v-1",
          placa: "ABC1D23",
          marca_modelo: "Toyota Hilux 2024",
          ativo: true,
          ignicao_status: "Ligada",
          velocidade_atual: 45,
          odometro_atual: 12500,
          ultima_latitude: -22.5,
          ultima_longitude: -44.1,
          ultima_atualizacao: "2026-11-03T09:00:00Z",
        },
        {
          id: "v-2",
          placa: "XYZ9W87",
          marca_modelo: "VW Polo 2023",
          ativo: true,
          ignicao_status: "Desligada",
          velocidade_atual: 0,
          odometro_atual: 34200,
          ultima_latitude: -22.52,
          ultima_longitude: -44.15,
          ultima_atualizacao: "2026-11-03T09:05:00Z",
        },
      ],
    });

    // 1. Envia STATUS
    const pStatus = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "STATUS" },
      supabase,
    );
    assert.equal(pStatus.acaoExecutada, "status_menu_veiculos");
    assert.ok(pStatus.resposta.includes("1 - *ABC1D23* (Toyota Hilux 2024)"));
    assert.ok(pStatus.resposta.includes("2 - *XYZ9W87* (VW Polo 2023)"));
    assert.ok(pStatus.resposta.includes("Digite a opção desejada"));

    // 2. Envia algo inválido enquanto aguarda opção (não deve sair do fluxo)
    const pInvalido = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "qualquer coisa" },
      supabase,
    );
    assert.equal(pInvalido.acaoExecutada, "status_opcao_invalida");
    assert.ok(pInvalido.resposta.includes("Opção não reconhecida"));

    // 3. Digita a opção 1
    const pOpcao1 = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "1" },
      supabase,
    );
    assert.equal(pOpcao1.acaoExecutada, "status_veiculo_opcao_selecionada");
    assert.ok(pOpcao1.resposta.includes("ABC1D23"));
    assert.ok(pOpcao1.resposta.includes("Toyota Hilux 2024"));

    // Sessão deve ter sido encerrada
    const sessoesRestantes = supabase._sessoes();
    assert.equal(sessoesRestantes.length, 0);
  });

  it("Cliente: comando STATUS com múltiplos veículos lista opções e loop seleciona veículo", async () => {
    const supabase = criarMockSupabase({
      clientes: [
        {
          id: "cli-10",
          nome_razao_social: "Transportadora VIP",
          telefone: "5524998887766",
          cpf_cnpj: "12.345.678/0001-90",
        },
      ],
      veiculos: [
        {
          id: "v-10",
          cliente_id: "cli-10",
          placa: "VIP1A23",
          marca_modelo: "Scania R450",
          ativo: true,
          odometro_atual: 154000,
        },
        {
          id: "v-11",
          cliente_id: "cli-10",
          placa: "VIP2B34",
          marca_modelo: "Volvo FH 540",
          ativo: true,
          odometro_atual: 210000,
        },
      ],
    });

    const pMenu = await processarMensagemWhatsappRecebida(
      { remetente: "5524998887766", texto: "STATUS" },
      supabase,
    );
    assert.equal(pMenu.acaoExecutada, "status_menu_cliente");
    assert.ok(pMenu.resposta.includes("1 - *VIP1A23* (Scania R450)"));
    assert.ok(pMenu.resposta.includes("2 - *VIP2B34* (Volvo FH 540)"));

    // Seleciona opção 2
    const pOpcao2 = await processarMensagemWhatsappRecebida(
      { remetente: "5524998887766", texto: "2" },
      supabase,
    );
    assert.equal(pOpcao2.acaoExecutada, "status_veiculo_opcao_selecionada");
    assert.ok(pOpcao2.resposta.includes("VIP2B34"));
    assert.ok(pOpcao2.resposta.includes("Volvo FH 540"));
  });

  it("Comando PLANO: SuperADM, Revendedor e Vendedor recebem tabela completa dos 3 planos em uso sem retencao de banco", async () => {
    const supabase = criarMockSupabase({
      profiles: [
        {
          id: "u-super",
          nome: "Super Administrador",
          role: "superadmin",
          telefone: "5524992494030",
        },
      ],
      revendedores: [
        {
          id: "rev-1",
          nome: "Revenda Master RJ",
          telefone: "5524988776655",
          ativo: true,
        },
      ],
      vendedores: [
        {
          id: "vend-1",
          revendedor_id: "rev-1",
          nome: "Carlos Vendedor",
          telefone: "5524977665544",
          ativo: true,
        },
      ],
      clientes: [
        {
          id: "cli-1",
          nome_razao_social: "Dario Novaes",
          telefone: "5524999991111",
          plano: "master",
          dias_historico_plano: 30,
        },
      ],
    });

    // 1. SuperADM enviando PLANO
    const resSuper = await processarMensagemWhatsappRecebida(
      { remetente: "5524992494030", texto: "PLANO" },
      supabase,
    );
    assert.equal(resSuper.acaoExecutada, "planos_comerciais_consultado");
    assert.ok(
      resSuper.resposta.includes("PLANOS COMERCIAIS DISPONÍVEIS") ||
        resSuper.resposta.includes("Planos Comerciais Disponíveis"),
    );
    assert.ok(resSuper.resposta.includes("PLANO BÁSICO"));
    assert.ok(resSuper.resposta.includes("7 dias visíveis"));
    assert.ok(resSuper.resposta.includes("PLANO PRO"));
    assert.ok(resSuper.resposta.includes("15 dias visíveis"));
    assert.ok(resSuper.resposta.includes("PLANO MASTER"));
    assert.ok(resSuper.resposta.includes("30 dias visíveis"));
    assert.equal(resSuper.resposta.includes("Personalizado"), false);
    assert.equal(resSuper.resposta.includes("retenção"), false);

    // 2. Revendedor enviando PLANOS
    const resRev = await processarMensagemWhatsappRecebida(
      { remetente: "5524988776655", texto: "PLANOS" },
      supabase,
    );
    assert.equal(resRev.acaoExecutada, "planos_comerciais_consultado");
    assert.ok(resRev.resposta.includes("PLANO BÁSICO"));
    assert.ok(resRev.resposta.includes("PLANO PRO"));
    assert.ok(resRev.resposta.includes("PLANO MASTER"));

    // 3. Vendedor enviando PLANO
    const resVend = await processarMensagemWhatsappRecebida(
      { remetente: "5524977665544", texto: "PLANO" },
      supabase,
    );
    assert.equal(resVend.acaoExecutada, "planos_comerciais_consultado");
    assert.ok(resVend.resposta.includes("PLANO BÁSICO"));

    // 4. Cliente enviando PLANO
    const resCli = await processarMensagemWhatsappRecebida(
      { remetente: "5524999991111", texto: "PLANO" },
      supabase,
    );
    assert.equal(resCli.acaoExecutada, "plano_cliente_consultado");
    assert.ok(resCli.resposta.includes("PLANO MASTER"));
    assert.ok(resCli.resposta.includes("30 dias visíveis"));
  });

  it("Menus AJUDA cobrem todos os perfis oficiais sem & comercial e respeitam desempate de telefone", async () => {
    const perfisBase = [
      { id: "p-super", nome: "Novaes", role: "superadmin", telefone: "5524992494030", ativo: true },
      { id: "p-adm", nome: "Ana ADM", role: "adm", telefone: "5524991110001", ativo: true },
      {
        id: "p-op",
        nome: "Bruno Operador",
        role: "operador",
        telefone: "5524991110002",
        ativo: true,
      },
      {
        id: "p-inst",
        nome: "Carlos Técnico",
        role: "instalador",
        telefone: "5524991110005",
        ativo: true,
      },
      {
        id: "p-func",
        nome: "Fernanda Colaboradora",
        role: "funcionario",
        telefone: "5524991110006",
        ativo: true,
      },
      {
        id: "p-mot",
        nome: "Marcos Motorista",
        role: "motorista",
        telefone: "5524991110007",
        ativo: true,
      },
      {
        id: "p-cli-perfil",
        nome: "Paula Cliente Perfil",
        role: "cliente",
        telefone: "5524991110009",
        ativo: true,
      },
      {
        id: "p-deg",
        nome: "Tiago Degustador",
        role: "cliente_degustacao",
        telefone: "5524991110010",
        ativo: true,
      },
      {
        id: "p-aud",
        nome: "Luiza Auditora",
        role: "superadmin_auditor",
        telefone: "5524991110011",
        ativo: true,
      },
    ];

    const supabase = criarMockSupabase({
      profiles: perfisBase,
      revendedores: [
        { id: "rev-aj", nome: "Revenda Ajuda", telefone: "5524991110003", ativo: true },
      ],
      vendedores: [
        {
          id: "vend-aj",
          revendedor_id: "rev-aj",
          nome: "Vendedor Ajuda",
          telefone: "5524991110004",
          ativo: true,
        },
      ],
      clientes: [
        {
          id: "cli-0v",
          nome_razao_social: "Cliente Zero Veículos",
          telefone: "5524991110008",
          plano: "basico",
        },
      ],
      veiculos: [],
      sessoes: [
        {
          id: "sess-pub-1",
          telefone: "5524991119999",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { tentativas_falha: 0 },
        },
      ],
    });

    // 1. SuperADM
    const rSuper = await processarMensagemWhatsappRecebida(
      { remetente: "5524992494030", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rSuper.acaoExecutada, "menu_superadm");
    assert.ok(rSuper.resposta.includes("Central SuperADM"));
    assert.ok(rSuper.resposta.includes("REVALIDA"));
    assert.ok(!rSuper.resposta.includes("&"));

    // 2. ADM
    const rAdm = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110001", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rAdm.acaoExecutada, "menu_adm");
    assert.ok(rAdm.resposta.includes("Central ADM"));
    assert.ok(rAdm.resposta.includes("TESTE"));
    assert.ok(rAdm.resposta.includes("REVALIDA"));
    assert.ok(!rAdm.resposta.includes("&"));

    // 3. Operador
    const rOp = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110002", texto: "MENU" },
      supabase,
    );
    assert.equal(rOp.acaoExecutada, "menu_operador");
    assert.ok(rOp.resposta.includes("Central Operador"));
    assert.ok(rOp.resposta.includes("TESTE"));
    assert.ok(rOp.resposta.includes("REVALIDA"));
    assert.ok(rOp.resposta.includes("PIX"));
    assert.ok(!rOp.resposta.includes("&"));

    // 4. Revendedor
    const rRev = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110003", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rRev.acaoExecutada, "menu_revendedor");
    assert.ok(rRev.resposta.includes("TESTE"));
    assert.ok(rRev.resposta.includes("REVALIDA"));
    assert.equal(rRev.resposta.includes("*INFRA*"), false);
    assert.equal(rRev.resposta.includes("*INADIMPLENTES*"), false);
    assert.ok(!rRev.resposta.includes("&"));

    // 5. Vendedor
    const rVend = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110004", texto: "PARAMETROS" },
      supabase,
    );
    assert.equal(rVend.acaoExecutada, "menu_vendedor");
    assert.ok(rVend.resposta.includes("TESTE"));
    assert.ok(rVend.resposta.includes("REVALIDA"));
    assert.equal(rVend.resposta.includes("*FROTA*"), false);
    assert.equal(rVend.resposta.includes("*INFRA*"), false);
    assert.ok(!rVend.resposta.includes("&"));

    // 6. Instalador
    const rInst = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110005", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rInst.acaoExecutada, "menu_instalador");
    assert.ok(rInst.resposta.includes("Perfil Instalador"));
    assert.ok(!rInst.resposta.includes("&"));

    // 7. Funcionário
    const rFunc = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110006", texto: "HELP" },
      supabase,
    );
    assert.equal(rFunc.acaoExecutada, "menu_funcionario");
    assert.ok(rFunc.resposta.includes("Perfil Funcionário"));
    assert.ok(!rFunc.resposta.includes("&"));

    // 8. Motorista ("Olá" -> atendimento público; AJUDA explícito -> menu_motorista)
    const rMotOla = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110007", texto: "Olá" },
      supabase,
    );
    assert.equal(rMotOla.acaoExecutada, "atendimento_publico_menu_inicial");
    assert.ok(!rMotOla.resposta.includes("&"));

    const rMotAjuda = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110007", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rMotAjuda.acaoExecutada, "menu_motorista");
    assert.ok(rMotAjuda.resposta.includes("Perfil Motorista"));
    assert.ok(!rMotAjuda.resposta.includes("&"));

    // 9. Cliente cadastrado com 0 veículos e Cliente cadastrado apenas em profiles
    const rCli0v = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110008", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rCli0v.acaoExecutada, "menu_cliente");
    assert.ok(rCli0v.resposta.includes("LOCALIZACAO"));
    assert.ok(!rCli0v.resposta.includes("&"));

    const rCliPerfil = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110009", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rCliPerfil.acaoExecutada, "menu_cliente");
    assert.ok(rCliPerfil.resposta.includes("Paula Cliente Perfil"));
    assert.ok(!rCliPerfil.resposta.includes("&"));

    // 10. Cliente Degustação
    const rDeg = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110010", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rDeg.acaoExecutada, "menu_cliente_degustacao");
    assert.ok(rDeg.resposta.includes("Cliente Degustação"));
    assert.ok(rDeg.resposta.includes("24 horas contadas a partir do seu 1º acesso"));
    assert.ok(!rDeg.resposta.includes("&"));

    // 11. SuperADM Auditor
    const rAud = await processarMensagemWhatsappRecebida(
      { remetente: "5524991110011", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rAud.acaoExecutada, "menu_superadmin_auditor");
    assert.ok(rAud.resposta.includes("SuperADM Auditor"));
    assert.ok(!rAud.resposta.includes("&"));

    // 12. Visitante público em sessão ativa enviando AJUDA
    const rPub = await processarMensagemWhatsappRecebida(
      { remetente: "5524991119999", texto: "AJUDA" },
      supabase,
    );
    assert.equal(rPub.acaoExecutada, "atendimento_publico_menu_ajuda");
    assert.ok(rPub.resposta.includes("Assistente GD"));
    assert.ok(!rPub.resposta.includes("&"));

    // 13. Desempate de telefone duplicado em profiles (ativo supera inativo; prioridade superior vence)
    const supabaseColisao = criarMockSupabase({
      profiles: [
        {
          id: "col-inativo-adm",
          nome: "Antigo Inativo",
          role: "adm",
          telefone: "5524988887777",
          ativo: false,
        },
        {
          id: "col-ativo-op",
          nome: "Operador Ativo",
          role: "operador",
          telefone: "5524988887777",
          ativo: true,
        },
        {
          id: "col-ativo-cli",
          nome: "Cliente Mesmo Numero",
          role: "cliente",
          telefone: "5524988887777",
          ativo: true,
        },
      ],
    });
    const rColisao = await processarMensagemWhatsappRecebida(
      { remetente: "5524988887777", texto: "AJUDA" },
      supabaseColisao,
    );
    assert.equal(
      rColisao.acaoExecutada,
      "menu_operador",
      "Perfil ativo de maior prioridade deve vencer perfil inativo e perfil inferior no mesmo telefone",
    );
    assert.ok(!rColisao.resposta.includes("&"));
  });
});
