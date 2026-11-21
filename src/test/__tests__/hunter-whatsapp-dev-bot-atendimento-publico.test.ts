import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processarMensagemWhatsappRecebida,
  obterMenuPublicoDevBot,
  obterRespostaPlanosDevBot,
  obterRespostaComoFuncionaDevBot,
  isSolicitacaoTransbordoHumano,
  isSolicitacaoEncerramento,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";

function criarMockSupabaseParaDevBot(dadosIniciais?: {
  profiles?: any[];
  sessoes?: any[];
  clientes?: any[];
  relatorioConfig?: any;
}) {
  let sessoes: any[] = [...(dadosIniciais?.sessoes || [])];
  const profiles: any[] = [...(dadosIniciais?.profiles || [])];
  const clientes: any[] = [...(dadosIniciais?.clientes || [])];
  const activityLogs: any[] = [];

  const supabaseMock: any = {
    _sessoes: () => sessoes,
    _activityLogs: () => activityLogs,
    from: (tabela: string) => {
      let filtroTabela: any = {};
      const queryBuilder: any = {
        select: (_cols?: string) => queryBuilder,
        eq: (col: string, val: any) => {
          filtroTabela[col] = val;
          return queryBuilder;
        },
        ilike: (col: string, val: any) => {
          filtroTabela[`${col}_ilike`] = val;
          return queryBuilder;
        },
        or: (cond: string) => {
          filtroTabela.or = cond;
          return queryBuilder;
        },
        limit: (_n: number) => queryBuilder,
        maybeSingle: async () => {
          if (tabela === "relatorio_gerencial_config") {
            return { data: dadosIniciais?.relatorioConfig || null, error: null };
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
        insert: (insertPayload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            sessoes.push({ id: `sessao-${Date.now()}`, ...insertPayload });
          }
          if (tabela === "system_activity_logs") {
            activityLogs.push(insertPayload);
          }
          return { data: insertPayload, error: null };
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
          return { data: upsertPayload, error: null };
        },
        update: (updatePayload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo" && filtroTabela.id) {
            const idx = sessoes.findIndex((s) => s.id === filtroTabela.id);
            if (idx >= 0) sessoes[idx] = { ...sessoes[idx], ...updatePayload };
          }
          return { data: updatePayload, error: null };
        },
        delete: () => {
          const deleteBuilder: any = {
            eq: (col: string, val: any) => {
              sessoes = sessoes.filter((s) => s[col] !== val);
              return { error: null };
            },
          };
          return deleteBuilder;
        },
      };

      if (tabela === "profiles") {
        queryBuilder.then = (resolve: any) => resolve({ data: profiles, error: null });
      } else if (tabela === "clientes") {
        queryBuilder.then = (resolve: any) => resolve({ data: clientes, error: null });
      } else if (tabela === "revendedores" || tabela === "vendedores") {
        queryBuilder.then = (resolve: any) => resolve({ data: [], error: null });
      }

      return queryBuilder;
    },
  };

  return supabaseMock;
}

describe("SKILL dev-bot — Atendimento ao Público em Geral via WhatsApp", () => {
  it("1. Primeiro contato de número não cadastrado recebe menu do Assistente GD com pushName", async () => {
    const supabase = criarMockSupabaseParaDevBot();
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "Olá, boa tarde!",
        pushName: "Rodrigo Alcantara",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_publico_menu_inicial");
    assert.match(res.resposta, /Rodrigo/);
    assert.match(res.resposta, /Assistente GD/);
    assert.match(res.resposta, /1.*Conhecer Planos e Benefícios/);
    assert.match(res.resposta, /2.*Como Funciona o Sistema de Rastreamento/);
    assert.match(res.resposta, /3.*Consultar Vendedor Credenciado/);
    assert.match(res.resposta, /4.*Falar com Atendente Humano/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].fluxo, "atendimento_publico");
    assert.equal(sessoes[0].etapa, "menu_principal");
  });

  it("2. Visitante escolhe Opção 1 e recebe Planos e Benefícios sem valores (valores somente com vendedores)", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "1",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_publico_planos");
    assert.match(res.resposta, /Plano Básico/);
    assert.match(res.resposta, /Plano Pro/);
    assert.match(res.resposta, /Plano Master/);
    assert.match(res.resposta, /Vendedores e Consultores Credenciados/);
    assert.doesNotMatch(res.resposta, /R\$ 45,00/);
    assert.doesNotMatch(res.resposta, /R\$ 55,00/);
    assert.doesNotMatch(res.resposta, /R\$ 65,00/);
  });

  it("3. Visitante escolhe Opção 2 e recebe explicação de como funciona o rastreamento e segurança", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "2",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_publico_como_funciona");
    assert.match(res.resposta, /Como Funciona o Rastreamento e Segurança GD/);
    assert.match(res.resposta, /Monitoramento no App/);
    assert.match(res.resposta, /Autonomia e Bloqueio/);
  });

  it("3B. Visitante não autorizado tenta pedir TESTE e é completamente ignorado (silêncio anti-enumeração)", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "TESTE",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_ignorado_nao_autorizado");
    assert.equal(res.resposta, "");
  });

  it("4. Visitante escolhe Opção 3 e informa localização para consultar vendedor credenciado mais próximo", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "3",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_publico_solicitar_localizacao");
    assert.match(res.resposta, /Consultar Vendedor ou Instalador Credenciado/);

    // Visitante informa sua cidade/bairro
    const resLoc = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "Volta Redonda / Aterrado",
      },
      supabase,
    );

    assert.equal(resLoc.sucesso, true);
    assert.equal(resLoc.acaoExecutada, "atendimento_publico_localizacao_encaminhada");
    assert.match(
      resLoc.resposta,
      /Localização Registrada com Sucesso|Consultor Credenciado Localizado/,
    );
  });

  it("5. Solicitação explícita de atendente humano realiza transbordo imediato", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "quero falar com um atendente humano",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "transbordo_humano_acionado");
    assert.match(
      res.resposta,
      /Estou te transferindo agora mesmo para um de nossos atendentes humanos/,
    );

    const sessoes = supabase._sessoes();
    assert.equal(sessoes[0].etapa, "em_atendimento_humano");
  });

  it("6. Mensagens subsequentes em atendimento humano mantêm a espera sem loop do bot", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "em_atendimento_humano",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "estou aguardando aqui",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "atendimento_humano_aguardando");
    assert.match(res.resposta, /Sua solicitação de atendimento humano já foi repassada/);

    // Se o visitante quiser voltar ao menu, digita MENU
    const resMenu = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "MENU",
      },
      supabase,
    );
    assert.equal(resMenu.acaoExecutada, "atendimento_publico_menu_retomado");
    assert.match(resMenu.resposta, /Assistente GD/);
  });

  it("7. Fallback progressivo: 1ª, 2ª incompreensão e transbordo na 3ª falha", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo", tentativas_falha: 0 },
        },
      ],
    });

    // 1ª falha
    const f1 = await processarMensagemWhatsappRecebida(
      { remetente: "5524991112233", texto: "blablabla incompreensivel" },
      supabase,
    );
    assert.equal(f1.acaoExecutada, "atendimento_publico_fallback_1");
    assert.match(f1.resposta, /Não compreendi a sua mensagem/);

    // 2ª falha
    const f2 = await processarMensagemWhatsappRecebida(
      { remetente: "5524991112233", texto: "xpto zzz" },
      supabase,
    );
    assert.equal(f2.acaoExecutada, "atendimento_publico_fallback_2");
    assert.match(f2.resposta, /Ainda não consegui entender bem/);

    // 3ª falha -> Transbordo humano automático
    const f3 = await processarMensagemWhatsappRecebida(
      { remetente: "5524991112233", texto: "ainda sem sentido" },
      supabase,
    );
    assert.equal(f3.acaoExecutada, "atendimento_publico_transbordo_fallback_3");
    assert.match(
      f3.resposta,
      /Estou te transferindo agora mesmo para um de nossos atendentes humanos/,
    );

    const sessoes = supabase._sessoes();
    assert.equal(sessoes[0].etapa, "em_atendimento_humano");
  });

  it("8. Encerramento amigável dispara pesquisa de satisfação de 1 a 5", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      sessoes: [
        {
          telefone: "5524991112233",
          fluxo: "atendimento_publico",
          etapa: "menu_principal",
          dados: { pushName: "Rodrigo" },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "Muito obrigado, era só isso!",
      },
      supabase,
    );

    assert.equal(res.acaoExecutada, "pesquisa_satisfacao_iniciada");
    assert.match(res.resposta, /Foi um prazer te atender/);
    assert.match(res.resposta, /como você avalia o atendimento do \*Assistente GD\* de 1 a 5/);

    // Resposta com nota 5
    const resNota = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "5",
      },
      supabase,
    );

    assert.equal(resNota.acaoExecutada, "pesquisa_satisfacao_concluida");
    assert.match(resNota.resposta, /Muito obrigado pela sua avaliação com nota \*5\*/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 0);

    const logs = supabase._activityLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].acao || logs[0].action, "pesquisa_satisfacao_whatsapp_dev_bot");
    const detNota =
      typeof logs[0].detalhe === "string" ? JSON.parse(logs[0].detalhe) : logs[0].details || {};
    assert.equal(detNota.nota, 5);
  });

  it("9. Comandos veiculares de segurança enviados por número desconhecido são completamente ignorados", async () => {
    const supabase = criarMockSupabaseParaDevBot();
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "BLOQUEIO",
      },
      supabase,
    );

    assert.equal(res.acaoExecutada, "comando_ignorado_nao_autorizado");
    assert.equal(res.resposta, "");
  });

  it("10. Funções auxiliares do dev-bot obedecem especificações canônicas", () => {
    assert.equal(isSolicitacaoTransbordoHumano("4"), true);
    assert.equal(isSolicitacaoTransbordoHumano("ATENDENTE"), true);
    assert.equal(isSolicitacaoTransbordoHumano("QUERO FALAR COM PESSOA"), true);
    assert.equal(isSolicitacaoTransbordoHumano("BOM DIA"), false);

    assert.equal(isSolicitacaoEncerramento("OBRIGADO"), true);
    assert.equal(isSolicitacaoEncerramento("VALEU"), true);
    assert.equal(isSolicitacaoEncerramento("TCHAU"), true);
    assert.equal(isSolicitacaoEncerramento("PLANO"), false);

    const menu = obterMenuPublicoDevBot("Carlos Alberto");
    assert.match(menu, /Carlos/);
    assert.match(menu, /Assistente GD/);

    const planos = obterRespostaPlanosDevBot();
    assert.match(planos, /Plano Básico/);
    assert.match(planos, /Plano Pro/);
    assert.match(planos, /Plano Master/);
    assert.match(planos, /Vendedores e Consultores Credenciados/);
    assert.doesNotMatch(planos, /R\$ 45,00/);

    const comoFunciona = obterRespostaComoFuncionaDevBot();
    assert.match(comoFunciona, /Equipamento Homologado/);
    assert.match(comoFunciona, /Monitoramento no App/);
    assert.match(comoFunciona, /Autonomia e Bloqueio/);
  });

  it("11. Comandos administrativos ou gerenciais enviados por número desconhecido são ignorados", async () => {
    const supabase = criarMockSupabaseParaDevBot();
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524991112233",
        texto: "RELATORIO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_ignorado_nao_autorizado");
    assert.equal(res.resposta, "");
  });

  it("12. Usuários cadastrados como cliente_degustacao NUNCA podem acessar comandos operacionais", async () => {
    const supabase = criarMockSupabaseParaDevBot({
      profiles: [
        {
          id: "user-degustacao-123",
          nome: "Visitante Degustação",
          telefone: "5524993334455",
          role: "cliente_degustacao",
          ativo: true,
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524993334455",
        texto: "BLOQUEIO",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_ignorado_nao_autorizado");
    assert.equal(res.resposta, "");
  });
});
