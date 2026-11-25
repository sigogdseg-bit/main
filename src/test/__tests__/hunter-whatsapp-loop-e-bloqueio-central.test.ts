import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  processarMensagemWhatsappRecebida,
  notificarSuperAdmTransbordoHumano,
  encaminharLeadParaVendedorOuSuperAdm,
  definirBloqueioEmergencialWhatsappCache,
  despacharMensagemWhatsappBaileys,
  registrarNumeroRoboDinamico,
  isNumeroRoboOuGateway,
  obterNumerosRoboAtivos,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";

describe("Hunter / GD Rastreamento — Anti-Loop, Isolamento SuperADM e Bloqueio Emergencial do WhatsApp", () => {
  let mockSupabase: any;
  let mockProfiles: any[];
  let mockConfig: any;
  let mockSessoes: Map<string, any>;
  let mockMensagensEnviadas: Array<{ destinatario: string; mensagem: string }>;

  beforeEach(() => {
    mockMensagensEnviadas = [];
    mockSessoes = new Map<string, any>();
    definirBloqueioEmergencialWhatsappCache(false);
    (globalThis as any).__TEST_SIMULAR_REMETENTE_ROBO_PROPRIO__ = false;

    mockProfiles = [
      {
        id: "usr-superadm",
        nome: "Dario Novaes",
        email: "novaes@oficial.tec.br",
        telefone: "5524992494030",
        role: "superadmin",
        ativo: true,
      },
      {
        id: "usr-adm",
        nome: "Leandro Gerolis",
        email: "leandrogerolis@gmail.com",
        telefone: "5524999474455",
        role: "adm",
        ativo: true,
      },
      {
        id: "usr-operador",
        nome: "Nicolas",
        email: "nicolas@gdsegurancaprivada.com.br",
        telefone: "5524999717841",
        role: "operador",
        ativo: true,
      },
    ];

    mockConfig = {
      id: "cfg-1",
      ativo: true,
      enviar_whatsapp: true,
      telefones: [{ nome: "SuperADM", telefone: "5524992494030", padrao: true }],
      secoes_ativas: {
        bloqueio_emergencial: false,
      },
    };

    const criarQueryChain = (dataRetorno: any = []) => {
      const handler: any = {
        data: dataRetorno,
        error: null,
        select: () => handler,
        eq: () => handler,
        neq: () => handler,
        in: () => handler,
        is: () => handler,
        ilike: () => handler,
        or: () => handler,
        order: () => handler,
        limit: () => handler,
        maybeSingle: async () => ({
          data: Array.isArray(dataRetorno) ? dataRetorno[0] || null : dataRetorno,
          error: null,
        }),
        then: (resolve: any) => resolve({ data: dataRetorno, error: null }),
      };
      return handler;
    };

    mockSupabase = {
      from: (tabela: string) => {
        if (tabela === "profiles") {
          return criarQueryChain(mockProfiles);
        }
        if (tabela === "relatorio_gerencial_config") {
          return criarQueryChain(mockConfig);
        }
        if (tabela === "whatsapp_sessoes_dialogo") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: mockSessoes.get(val) || null,
                  error: null,
                }),
              }),
              or: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    const values = Array.from(mockSessoes.values());
                    return { data: values[0] || null, error: null };
                  },
                }),
              }),
            }),
            upsert: async (row: any) => {
              if (row?.telefone) mockSessoes.set(row.telefone, row);
              return { data: null, error: null };
            },
            delete: () => ({
              eq: async (_col: string, val: string) => {
                mockSessoes.delete(val);
                return { data: null, error: null };
              },
            }),
          };
        }
        return criarQueryChain([]);
      },
    };

    (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__ = async (
      destinatario: string,
      mensagem: string,
    ) => {
      mockMensagensEnviadas.push({ destinatario, mensagem });
      return true;
    };
  });

  it("1. Descarta silenciosamente mensagens contendo cabeçalhos ou menus do sistema (Anti-Loop)", async () => {
    const textoEco =
      "🚨 *GD Segurança Privada — Solicitação de Indicação de Vendedor (WhatsApp)*\n\n" +
      "• Interessado(a): GD Rastreamento\n" +
      "• WhatsApp: 5524981498266\n" +
      "• Região: Volta Redonda\n\n" +
      "Comando não reconhecido. Comandos e parâmetros disponíveis:\n" +
      "📋 Comercial: PROPOSTA, PLANOS\n";

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524981498266",
        texto: textoEco,
      },
      mockSupabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "anti_loop_eco_descartado");
    assert.equal(res.resposta, "");
    assert.equal(mockMensagensEnviadas.length, 0);
  });

  it("2. Descarta mensagens originadas do próprio número do gateway (Anti-Self)", async () => {
    (globalThis as any).__TEST_SIMULAR_REMETENTE_ROBO_PROPRIO__ = true;
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "Olá, gostaria de saber os planos",
      },
      mockSupabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "anti_loop_eco_descartado");
    assert.equal(res.resposta, "");
  });

  it("3. Garante que número do gateway (5524992501512) NUNCA é reconhecido como SuperADM", async () => {
    (globalThis as any).__TEST_SIMULAR_REMETENTE_ROBO_PROPRIO__ = true;
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "DRE",
      },
      mockSupabase,
    );

    assert.notEqual(res.acaoExecutada, "dre_superadm");
    assert.equal(res.acaoExecutada, "anti_loop_eco_descartado");
  });

  it("4. Cópias de solicitações de atendimento e indicação vão ESTRITAMENTE para SuperADM, NUNCA para operadores", async () => {
    await notificarSuperAdmTransbordoHumano(mockSupabase, {
      nome: "Cliente Teste",
      telefone: "5524999998888",
      motivo: "Dúvida sobre cobertura",
      dataHora: "25/11/2026 12:00",
    });

    assert.ok(mockMensagensEnviadas.length > 0);
    for (const envio of mockMensagensEnviadas) {
      assert.equal(envio.destinatario, "5524992494030");
      assert.notEqual(envio.destinatario, "5524999717841");
      assert.notEqual(envio.destinatario, "5524999474455");
      assert.notEqual(envio.destinatario, "5524992501512");
    }
  });

  it("5. Rejeita textos multi-linhas ou com símbolos de alerta na etapa aguardando_localizacao", async () => {
    mockSessoes.set("5524977776666", {
      telefone: "5524977776666",
      fluxo: "atendimento_publico",
      etapa: "aguardando_localizacao",
      dados: { interesse: "planos_e_beneficios" },
    });

    const textoInvalido =
      "Rua Quinze de Novembro, perto do mercado central\nSegunda linha informando complemento";

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524977776666",
        texto: textoInvalido,
      },
      mockSupabase,
    );

    assert.equal(res.acaoExecutada, "aguardando_localizacao_invalida");
    assert.ok(res.resposta.includes("informe apenas o nome da sua *Cidade* ou *Bairro*"));
    assert.equal(mockMensagensEnviadas.length, 0);
  });

  it("6. Suprime solicitações duplicadas dentro da janela de 120s (Deduplicação)", async () => {
    await encaminharLeadParaVendedorOuSuperAdm(mockSupabase, {
      nome: "Lead Teste",
      telefone: "5524966665555",
      localizacao: "Angra dos Reis",
    });

    const enviosPrimeiraVez = mockMensagensEnviadas.length;
    assert.ok(enviosPrimeiraVez > 0);

    // Segunda chamada idêntica em seguida
    const respostaSegunda = await encaminharLeadParaVendedorOuSuperAdm(mockSupabase, {
      nome: "Lead Teste",
      telefone: "5524966665555",
      localizacao: "Angra dos Reis",
    });

    assert.ok(respostaSegunda.includes("Localização já anotada!"));
    assert.equal(mockMensagensEnviadas.length, enviosPrimeiraVez);
  });

  it("7. Bloqueio Emergencial da Central suspende imediatamente todos os envios e respostas", async () => {
    definirBloqueioEmergencialWhatsappCache(true);

    const resRecebida = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524988887777",
        texto: "Olá",
      },
      mockSupabase,
    );

    assert.equal(resRecebida.acaoExecutada, "bloqueio_emergencial_ativo");
    assert.equal(resRecebida.resposta, "");

    const enviado = await despacharMensagemWhatsappBaileys("5524992494030", "Alerta de teste");
    assert.equal(enviado, false);
  });

  it("8. Gateway Baileys e Server.ts contêm endpoints e circuit breakers de bloqueio emergencial", () => {
    const gatewayCode = fs.readFileSync(
      path.resolve(process.cwd(), "deploy/hunter-whatsapp-gateway/src/server.ts"),
      "utf-8",
    );
    assert.ok(gatewayCode.includes("bloqueioEmergencialAtivo"));
    assert.ok(gatewayCode.includes("circuitBreakerEnvios"));
    assert.ok(gatewayCode.includes("numerosBloqueadosTemporariamente"));
    assert.ok(gatewayCode.includes("/api/bloqueio-emergencial"));

    const serverCode = fs.readFileSync(path.resolve(process.cwd(), "src/server.ts"), "utf-8");
    assert.ok(serverCode.includes("/api/admin/whatsapp/status-bloqueio"));
    assert.ok(serverCode.includes("/api/admin/whatsapp/bloqueio-emergencial"));
  });

  it("9. Permite registrar dinamicamente novos números de robô e os bloqueia no envio e recebimento", async () => {
    const novoChipRobo = "5524977778888";
    assert.equal(isNumeroRoboOuGateway(novoChipRobo), false);

    registrarNumeroRoboDinamico(novoChipRobo);
    assert.equal(isNumeroRoboOuGateway(novoChipRobo), true);
    assert.ok(obterNumerosRoboAtivos().includes(novoChipRobo));

    // Mensagem recebida deste novo chip é descartada como eco/anti-self
    (globalThis as any).__TEST_SIMULAR_REMETENTE_ROBO_PROPRIO__ = true;
    const resRecebida = await processarMensagemWhatsappRecebida(
      {
        remetente: novoChipRobo,
        texto: "Qualquer texto enviado pelo robô novo",
      },
      mockSupabase,
    );
    assert.equal(resRecebida.acaoExecutada, "anti_loop_eco_descartado");

    // Tentativa de envio para este novo chip é abortada
    const enviado = await despacharMensagemWhatsappBaileys(
      novoChipRobo,
      "Tentando mandar msg para o chip novo do robô",
    );
    assert.equal(enviado, false);
  });
});
