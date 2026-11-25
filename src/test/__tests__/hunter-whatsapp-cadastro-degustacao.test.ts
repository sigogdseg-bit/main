import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processarMensagemWhatsappRecebida,
  cadastrarUsuarioDegustacaoWhatsapp,
  recuperarTelefoneClienteDegustacao,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";
import { MODULOS_CLIENTE_PLANO_MASTER } from "../../features/seguranca/services/usuarioService";

function criarMockSupabaseParaDegustacao(dadosIniciais?: {
  profiles?: any[];
  sessoes?: any[];
  relatorioConfig?: any;
  activityLogs?: any[];
  authUsers?: any[];
}) {
  let sessoes: any[] = [...(dadosIniciais?.sessoes || [])];
  const profiles: any[] = [
    ...(dadosIniciais?.profiles ?? [
      {
        id: "adm-001",
        nome: "Super Administrador",
        telefone: "5524992494030",
        role: "superadmin",
        ativo: true,
      },
      {
        id: "adm-002",
        nome: "Administrador Teste",
        telefone: "5524992501512",
        role: "superadmin",
        ativo: true,
      },
    ]),
  ];
  const userRoles: any[] = [];
  const userModuleAccess: any[] = [];
  const activityLogs: any[] = [...(dadosIniciais?.activityLogs || [])];
  const authUsers: any[] = [...(dadosIniciais?.authUsers || [])];

  const supabaseMock: any = {
    _sessoes: () => sessoes,
    _profiles: () => profiles,
    _userRoles: () => userRoles,
    _userModuleAccess: () => userModuleAccess,
    _activityLogs: () => activityLogs,
    _authUsers: () => authUsers,
    auth: {
      admin: {
        createUser: async (payload: any) => {
          if (authUsers.some((u) => u.email === payload.email)) {
            return {
              data: null,
              error: { message: "A user with this email has already been registered" },
            };
          }
          const userObj = {
            id: `auth-user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            email: payload.email,
            user_metadata: payload.user_metadata,
          };
          authUsers.push(userObj);
          return { data: { user: userObj }, error: null };
        },
        getUserById: async (uid: string) => {
          const u = authUsers.find((item) => item.id === uid) || null;
          return { data: { user: u }, error: null };
        },
        updateUserById: async (uid: string, payload: any) => {
          const idx = authUsers.findIndex((item) => item.id === uid);
          if (idx >= 0) {
            authUsers[idx] = {
              ...authUsers[idx],
              ...payload,
              user_metadata: {
                ...(authUsers[idx].user_metadata || {}),
                ...(payload?.user_metadata || {}),
              },
            };
            return { data: { user: authUsers[idx] }, error: null };
          }
          return { data: { user: null }, error: { message: "User not found" } };
        },
      },
    },
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
        in: (col: string, vals: any[]) => {
          filtroTabela[`${col}_in`] = vals;
          return queryBuilder;
        },
        order: (_col: string, _opts?: any) => queryBuilder,
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
          if (tabela === "profiles") {
            if (filtroTabela.email_ilike) {
              const emailBuscado = String(filtroTabela.email_ilike).toLowerCase();
              const p = profiles.find((prof) => (prof.email || "").toLowerCase() === emailBuscado);
              return { data: p || null, error: null };
            }
            if (filtroTabela.id) {
              const p = profiles.find((prof) => prof.id === filtroTabela.id);
              return { data: p || null, error: null };
            }
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
          if (tabela === "profiles") {
            if ("plano" in upsertPayload) {
              return Promise.resolve({
                data: null,
                error: {
                  message: "Could not find the 'plano' column of 'profiles' in the schema cache",
                },
              });
            }
            if ("modulos" in upsertPayload) {
              return Promise.resolve({
                data: null,
                error: {
                  message: "Could not find the 'modulos' column of 'profiles' in the schema cache",
                },
              });
            }
            if ("degustacao_iniciada_em" in upsertPayload) {
              return Promise.resolve({
                data: null,
                error: {
                  message:
                    "Could not find the 'degustacao_iniciada_em' column of 'profiles' in the schema cache",
                },
              });
            }
            const idx = profiles.findIndex(
              (p) => p.id === upsertPayload.id || p.email === upsertPayload.email,
            );
            if (idx >= 0) {
              profiles[idx] = { ...profiles[idx], ...upsertPayload };
            } else {
              profiles.push(upsertPayload);
            }
          }
          if (tabela === "user_roles") {
            userRoles.push(upsertPayload);
          }
          if (tabela === "user_module_access") {
            if (Array.isArray(upsertPayload)) {
              userModuleAccess.push(...upsertPayload);
            } else {
              userModuleAccess.push(upsertPayload);
            }
          }
          return Promise.resolve({ data: upsertPayload, error: null });
        },
        update: (updatePayload: any) => {
          return {
            eq: (col: string, val: any) => {
              if (tabela === "profiles") {
                const idx = profiles.findIndex((p) => p[col] === val);
                if (idx >= 0) {
                  profiles[idx] = { ...profiles[idx], ...updatePayload };
                }
              }
              return Promise.resolve({ data: updatePayload, error: null });
            },
          };
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
            resolve({ data: profiles, error: null });
            return;
          }
          if (tabela === "system_activity_logs") {
            const lista = activityLogs.filter((l) => {
              if (filtroTabela.user_id && l.user_id !== filtroTabela.user_id) return false;
              if (filtroTabela.acao && l.acao !== filtroTabela.acao) return false;
              if (filtroTabela.acao_in && !filtroTabela.acao_in.includes(l.acao)) return false;
              return true;
            });
            resolve({ data: lista, error: null });
            return;
          }
          if (tabela === "relatorio_gerencial_config") {
            resolve({ data: dadosIniciais?.relatorioConfig || null, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return queryBuilder;
    },
  };

  return supabaseMock;
}

describe("GD Rastreamento — Auto-Cadastro de Usuário Degustação via WhatsApp (Comando TESTE)", () => {
  it("1. Perfil autorizado (SuperADM/Operador/Parceiro) envia TESTE e inicia cadastro para o cliente", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      profiles: [
        {
          id: "adm-001",
          nome: "Super Administrador",
          telefone: "5524992501512",
          role: "superadmin",
          ativo: true,
        },
      ],
    });
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "TESTE",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "inicio_cadastro_degustacao");
    assert.match(res.resposta, /Cadastro de Usuário Degustação \(Plano Master 24h\)/);
    assert.match(res.resposta, /digite o \*Nome Completo do Cliente\*/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0].fluxo, "degustacao");
    assert.equal(sessoes[0].etapa, "aguardando_degustacao_nome");
  });

  it("2. Número não cadastrado não pode pedir degustação e deve ser ignorado (silêncio anti-enumeração)", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524998877665",
          fluxo: "boas_vindas_enviadas",
          etapa: "enviada",
          dados: {},
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524998877665",
        texto: "QUERO TESTAR",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "comando_ignorado_nao_autorizado");
    assert.equal(res.resposta, "");
  });

  it("3. Etapa 1: Rejeita nome curto (< 3 chars) e aceita nome válido avançando para e-mail do cliente", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_nome",
          dados: { remetente: "5524992501512", telefoneCriador: "5524992501512" },
        },
      ],
    });

    // Nome curto/inválido
    const resInvalido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "Ab",
      },
      supabase,
    );
    assert.equal(resInvalido.acaoExecutada, "degustacao_nome_invalido");
    assert.match(resInvalido.resposta, /mínimo de 3 letras/);

    // Repetição da palavra TESTE é tratada amigavelmente
    const resRepeteTeste = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "TESTE",
      },
      supabase,
    );
    assert.equal(resRepeteTeste.acaoExecutada, "degustacao_aguardando_nome");

    // Nome válido
    const resValido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "Carlos Eduardo Silva",
      },
      supabase,
    );
    assert.equal(resValido.acaoExecutada, "degustacao_nome_recebido");
    assert.match(resValido.resposta, /Carlos Eduardo Silva/);
    assert.match(resValido.resposta, /informe o \*E-mail do Cliente\*/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes[0].etapa, "aguardando_degustacao_email");
    assert.equal(sessoes[0].dados.nome, "Carlos Eduardo Silva");
  });

  it("4. Etapa 2: Rejeita e-mail inválido, rejeita e-mail duplicado e aceita válido avançando para telefone do cliente", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      profiles: [
        {
          id: "user-existente-001",
          email: "existente@empresa.com",
          nome: "Usuario Existente",
        },
      ],
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_email",
          dados: {
            remetente: "5524992501512",
            telefoneCriador: "5524992501512",
            nome: "Carlos Eduardo Silva",
          },
        },
      ],
    });

    // E-mail inválido
    const resInvalido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "email_sem_arroba.com",
      },
      supabase,
    );
    assert.equal(resInvalido.acaoExecutada, "degustacao_email_invalido");

    // E-mail já cadastrado
    const resDuplicado = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "existente@empresa.com",
      },
      supabase,
    );
    assert.equal(resDuplicado.acaoExecutada, "degustacao_email_ja_cadastrado");
    assert.match(resDuplicado.resposta, /já possui cadastro no GD Rastreamento/);

    // E-mail válido
    const resValido = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "carlos.degustacao@teste.com",
      },
      supabase,
    );
    assert.equal(resValido.acaoExecutada, "degustacao_email_recebido");
    assert.match(resValido.resposta, /Celular com DDD do Cliente/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes[0].etapa, "aguardando_degustacao_telefone");
    assert.equal(sessoes[0].dados.email, "carlos.degustacao@teste.com");
  });

  it("5. Etapa 3: Coleta celular do cliente (não aceita SIM, sempre número do cliente)", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_telefone",
          dados: {
            remetente: "5524992501512",
            telefoneCriador: "5524992501512",
            nome: "Carlos Eduardo Silva",
            email: "carlos.degustacao@teste.com",
          },
        },
      ],
    });

    // Informa número de celular válido do cliente
    const resTel = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "24988776655",
      },
      supabase,
    );
    assert.equal(resTel.acaoExecutada, "degustacao_telefone_recebido");
    assert.match(resTel.resposta, /Senha de Acesso/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes[0].etapa, "aguardando_degustacao_senha");
    assert.equal(sessoes[0].dados.telefoneCliente, "5524988776655");
  });

  it("6. Etapa 4: Rejeita senha curta (< 6 chars) e conclui cadastro gravando criador no perfil", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_senha",
          dados: {
            remetente: "5524992501512",
            telefoneCriador: "5524992501512",
            nome: "Carlos Eduardo Silva",
            email: "carlos.degustacao@teste.com",
            telefoneCliente: "5524988776655",
          },
        },
      ],
    });

    // Senha curta
    const resCurta = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "12345",
      },
      supabase,
    );
    assert.equal(resCurta.acaoExecutada, "degustacao_senha_invalida");
    assert.match(resCurta.resposta, /no mínimo \*6 caracteres\*/);

    // Senha válida -> criação e pergunta de envio de credenciais ao cliente
    const resPerguntarEnvio = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "SigoMaster2026",
      },
      supabase,
    );

    assert.equal(resPerguntarEnvio.sucesso, true);
    assert.equal(resPerguntarEnvio.acaoExecutada, "degustacao_perguntar_envio_cliente");
    assert.match(resPerguntarEnvio.resposta, /Conta de Degustação Criada com Sucesso!/);
    assert.match(resPerguntarEnvio.resposta, /1º acesso/);
    assert.match(
      resPerguntarEnvio.resposta,
      /Deseja enviar as boas-vindas e os dados de acesso diretamente para o WhatsApp do cliente/,
    );
    assert.match(resPerguntarEnvio.resposta, /\*1\.\* Enviar dados de acesso ao cliente/);
    assert.match(resPerguntarEnvio.resposta, /\*2\.\* Não enviar/);

    // Opção 1: Envia dados de acesso e boas-vindas ao cliente no número de celular informado
    const enviosCapturados: Array<{ telefone: string; mensagem: string }> = [];
    (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__ = async (
      telefone: string,
      mensagem: string,
    ) => {
      enviosCapturados.push({ telefone, mensagem });
      return true;
    };

    let resEnviado: any;
    try {
      resEnviado = await processarMensagemWhatsappRecebida(
        {
          remetente: "5524992501512",
          texto: "1",
        },
        supabase,
      );
    } finally {
      delete (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__;
    }

    assert.equal(resEnviado.sucesso, true);
    assert.equal(resEnviado.acaoExecutada, "degustacao_dados_enviados_ao_cliente");
    assert.match(
      resEnviado.resposta,
      /Dados de acesso e boas-vindas enviados com sucesso para o cliente/,
    );
    assert.match(resEnviado.resposta, /24 horas contadas a partir do 1º acesso/);
    assert.match(resEnviado.resposta, /https:\/\/gd\.oficial\.tec\.br/);
    assert.match(resEnviado.resposta, /carlos\.degustacao@teste\.com/);
    assert.match(resEnviado.resposta, /SigoMaster2026/);

    // Garante que a mensagem de boas-vindas + credenciais foi enviada para o número DO CLIENTE
    const envioCliente = enviosCapturados.find((e) => e.telefone === "5524988776655");
    assert.ok(envioCliente, "Deve despachar credenciais para o número do cliente (5524988776655)");
    assert.match(envioCliente.mensagem, /bem-vindo\(a\) ao \*GD Rastreamento\*/i);
    assert.match(envioCliente.mensagem, /carlos\.degustacao@teste\.com/);
    assert.match(envioCliente.mensagem, /SigoMaster2026/);
    assert.match(envioCliente.mensagem, /1º acesso/);

    // Sessão excluída após sucesso
    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 0);

    // Perfil criado em public.profiles: grava telefone do CLIENTE (SEM coluna plano ou modulos)
    const profiles = supabase._profiles();
    const perfilCriado = profiles.find((p) => p.email === "carlos.degustacao@teste.com");
    assert.ok(perfilCriado, "Perfil deve existir em profiles");
    assert.equal(perfilCriado.role, "cliente_degustacao");
    assert.equal(perfilCriado.plano, undefined, "Coluna plano não deve existir em profiles");
    assert.equal(perfilCriado.telefone, "5524988776655");
    assert.equal(perfilCriado.ativo, true);
    assert.equal(perfilCriado.modulos, undefined, "Coluna modulos não deve existir em profiles");

    // Módulos gravados em user_module_access
    const userMods = supabase._userModuleAccess();
    assert.equal(userMods.length, MODULOS_CLIENTE_PLANO_MASTER.length);

    // Auth user criado com metadados do Plano Master 24h
    const authUsers = supabase._authUsers();
    assert.equal(authUsers.length, 1);
    assert.equal(authUsers[0].email, "carlos.degustacao@teste.com");
    assert.equal(authUsers[0].user_metadata?.plano, "master");
    assert.equal(authUsers[0].user_metadata?.degustacao, true);
  });

  it("6.1. Opção 2 ao concluir cadastro: NÃO envia credenciais ao celular do cliente", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_confirmacao_envio_cliente",
          dados: {
            nome: "Mariana Costa",
            email: "mariana.teste@exemplo.com",
            senha: "SenhaSegura456",
            telefoneCliente: "5524999991111",
          },
        },
      ],
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "2",
      },
      supabase,
    );

    assert.equal(res.acaoExecutada, "degustacao_dados_nao_enviados_ao_cliente");
    assert.match(res.resposta, /Os dados NÃO foram enviados para o cliente/);
    assert.match(res.resposta, /mariana\.teste@exemplo\.com/);
    assert.match(res.resposta, /SenhaSegura456/);

    assert.equal(supabase._sessoes().length, 0);
  });

  it("6.2. Cliente degustação já cadastrado: pergunta se deseja reativar +24h e reativa", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      profiles: [
        {
          id: "usr-deg-existente-1",
          nome: "Roberto Antigo",
          email: "roberto.deg@antigo.com",
          role: "cliente_degustacao",
          telefone: "5524988771122",
          ativo: false,
        },
      ],
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_email",
          dados: {
            remetente: "5524992501512",
            nome: "Roberto Antigo",
          },
        },
      ],
    });

    // Informa o e-mail do cliente de degustação que já existe
    const resCheck = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "roberto.deg@antigo.com",
      },
      supabase,
    );

    assert.equal(resCheck.acaoExecutada, "degustacao_perguntar_reativacao");
    assert.match(resCheck.resposta, /já possui cadastro de degustação/);
    assert.match(resCheck.resposta, /Deseja \*reativar o acesso por mais 24 horas\*/);
    assert.match(resCheck.resposta, /\*1\.\* Sim, reativar mais 24h/);

    // Responde '1' para reativar mais 24h
    const resReativar = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "1",
      },
      supabase,
    );

    assert.equal(resReativar.acaoExecutada, "degustacao_reativada_perguntar_envio");
    assert.match(resReativar.resposta, /Reativado por \+24h!/);

    // Confirma que perfil agora está ativo
    const perfil = supabase._profiles().find((p) => p.email === "roberto.deg@antigo.com");
    assert.ok(perfil);
    assert.equal(perfil.ativo, true);
    assert.equal(perfil.role, "cliente_degustacao");

    // Responde '1' para enviar confirmação para o WhatsApp do cliente
    const resEnvioCliente = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "1",
      },
      supabase,
    );
    assert.equal(resEnvioCliente.acaoExecutada, "degustacao_reativacao_enviada_ao_cliente");
    assert.match(
      resEnvioCliente.resposta,
      /Aviso de reativação enviado com sucesso para o cliente/,
    );
    assert.equal(supabase._sessoes().length, 0);
  });

  it("7. Comando CANCELAR aborta a degustação a qualquer momento", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_email",
          dados: { remetente: "5524992501512", nome: "Carlos Eduardo Silva" },
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

    assert.equal(res.acaoExecutada, "degustacao_cancelada");
    assert.match(res.resposta, /Cadastro de degustação cancelado/);

    const sessoes = supabase._sessoes();
    assert.equal(sessoes.length, 0);
  });

  it("8. Função cadastrarUsuarioDegustacaoWhatsapp cria perfil completo e audita evento", async () => {
    const supabase = criarMockSupabaseParaDegustacao();
    const resultado = await cadastrarUsuarioDegustacaoWhatsapp(supabase, {
      nome: "Fernanda Ribeiro",
      email: "fernanda.lead@teste.com",
      telefoneCliente: "5524988887777",
      telefoneCriador: "5524992501512",
      senha: "SenhaSegura123",
    });

    assert.equal(resultado.sucesso, true);
    assert.ok(resultado.userId);

    const profiles = supabase._profiles();
    const perfil = profiles.find((p) => p.email === "fernanda.lead@teste.com");
    assert.ok(perfil);
    assert.equal(perfil.role, "cliente_degustacao");
    assert.equal(perfil.plano, undefined, "Coluna plano não deve existir em profiles");
    assert.equal(perfil.ativo, true);
    assert.equal(perfil.telefone, "5524988887777");

    const mods = supabase._userModuleAccess();
    assert.equal(mods.length, MODULOS_CLIENTE_PLANO_MASTER.length);

    const logs = supabase._activityLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].acao, "degustacao_cadastrada_whatsapp");
    const det =
      typeof logs[0].detalhe === "string" ? JSON.parse(logs[0].detalhe) : logs[0].details || {};
    assert.equal(det.email, "fernanda.lead@teste.com");
    assert.equal(det.telefone_cliente, "5524988887777");
    assert.equal(det.telefone_criador, "5524992501512");
  });

  it("9. Etapa 3 normaliza DDD com 0 e prefixo de operadora 021/024 e reporta falha honesta quando gateway recusar envio", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      sessoes: [
        {
          telefone: "5524992501512",
          fluxo: "degustacao",
          etapa: "aguardando_degustacao_telefone",
          dados: {
            remetente: "5524992501512",
            telefoneCriador: "5524992501512",
            nome: "Kadu Lead",
            email: "kadu.lead@teste.com",
          },
        },
      ],
    });

    // Prefixo de operadora 021 + DDD 24 + 9 dígitos (14 dígitos brutos)
    const resTel = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "02124998264264",
      },
      supabase,
    );
    assert.equal(resTel.acaoExecutada, "degustacao_telefone_recebido");
    assert.equal(supabase._sessoes()[0].dados.telefoneCliente, "5524998264264");

    // Etapa 4 cria conta
    const resSenha = await processarMensagemWhatsappRecebida(
      {
        remetente: "5524992501512",
        texto: "SenhaForte99",
      },
      supabase,
    );
    assert.equal(resSenha.acaoExecutada, "degustacao_perguntar_envio_cliente");

    // Etapa 5 simula resposta HTTP 200 porém payload JSON { sucesso: false } via fetch real em modo teste
    const origFetch = globalThis.fetch;
    (globalThis as any).__HUNTER_TEST_USE_GLOBAL_FETCH__ = true;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sucesso: false, erro: "JID sem WhatsApp ativo" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any;

    try {
      const resFalha = await processarMensagemWhatsappRecebida(
        {
          remetente: "5524992501512",
          texto: "1",
        },
        supabase,
      );
      assert.equal(resFalha.acaoExecutada, "degustacao_dados_falha_envio_cliente");
      assert.match(resFalha.resposta, /houve falha ao enviar o WhatsApp para o número do cliente/);
      assert.match(resFalha.resposta, /\(24\) 99826-4264/);
      assert.match(resFalha.resposta, /24 horas contadas a partir do 1º acesso/);
    } finally {
      delete (globalThis as any).__HUNTER_TEST_USE_GLOBAL_FETCH__;
      globalThis.fetch = origFetch;
    }
  });

  it("10. Comando REVALIDA (interativo e 1 passo REVALIDA <email>): renova +24h após 1º acesso, recupera telefone legado e rejeita não-degustação", async () => {
    const supabase = criarMockSupabaseParaDegustacao({
      profiles: [
        {
          id: "adm-1",
          nome: "SuperADM",
          role: "superadmin",
          telefone: "5524992501512",
          ativo: true,
        },
        {
          id: "deg-legado-1",
          nome: "Gustavo Legado",
          email: "gustavo.legado@teste.com",
          role: "cliente_degustacao",
          // Conta legada tinha erroneamente o telefone do revendedor gravado em profiles.telefone
          telefone: "5524974019339",
          ativo: false,
          degustacao_primeiro_acesso_em: "2026-11-01T10:00:00.000Z",
          degustacao_expira_em: "2026-11-02T10:00:00.000Z",
        },
        {
          id: "cli-real-1",
          nome: "Cliente Pago",
          email: "pago@cliente.com",
          role: "cliente",
          telefone: "5524991234567",
          ativo: true,
        },
      ],
      activityLogs: [
        {
          user_id: "deg-legado-1",
          acao: "degustacao_cadastrada_whatsapp",
          detalhe: JSON.stringify({
            nome: "Gustavo Legado",
            email: "gustavo.legado@teste.com",
            telefone_cliente: "5524998476249",
            telefone_criador: "5524974019339",
          }),
          created_at: "2026-11-01T09:50:00.000Z",
        },
      ],
      authUsers: [
        {
          id: "deg-legado-1",
          email: "gustavo.legado@teste.com",
          user_metadata: {
            role: "cliente_degustacao",
            degustacao: true,
            degustacao_primeiro_acesso_em: "2026-11-01T10:00:00.000Z",
            degustacao_expira_em: "2026-11-02T10:00:00.000Z",
          },
        },
      ],
    });

    // Recuperação direta de telefone legado prioriza system_activity_logs sobre profiles.telefone errado
    const telRecuperado = await recuperarTelefoneClienteDegustacao(
      supabase,
      supabase._profiles().find((p: any) => p.id === "deg-legado-1"),
      "5524974019339",
    );
    assert.equal(telRecuperado, "5524998476249");

    // A) Fluxo interativo REVALIDA -> pede email -> valida conta não-degustação
    const resInicio = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "REVALIDA" },
      supabase,
    );
    assert.equal(resInicio.acaoExecutada, "inicio_revalida_degustacao");
    assert.match(resInicio.resposta, /E-mail cadastrado do Cliente/);

    const resNaoDeg = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "pago@cliente.com" },
      supabase,
    );
    assert.equal(resNaoDeg.acaoExecutada, "revalida_perfil_nao_degustacao");
    assert.equal(supabase._sessoes().length, 0);

    // B) Fluxo 1 passo: REVALIDA gustavo.legado@teste.com
    const resReval = await processarMensagemWhatsappRecebida(
      { remetente: "5524992501512", texto: "REVALIDA gustavo.legado@teste.com" },
      supabase,
    );
    assert.equal(resReval.acaoExecutada, "revalida_concluida_perguntar_envio");
    assert.match(resReval.resposta, /mais 24 horas contadas a partir do 1º acesso/);
    assert.match(resReval.resposta, /\(24\) 99847-6249/);

    // Timer de 1º acesso foi zerado no perfil e auth_user, com degustacao_revalidada_em gravado
    const perfAtual = supabase._profiles().find((p: any) => p.id === "deg-legado-1");
    assert.equal(perfAtual.ativo, true);
    assert.equal(perfAtual.telefone, "5524998476249");
    assert.equal(perfAtual.degustacao_primeiro_acesso_em, null);
    assert.equal(perfAtual.degustacao_expira_em, null);
    assert.ok(perfAtual.degustacao_revalidada_em);

    const authAtual = supabase._authUsers().find((u: any) => u.id === "deg-legado-1");
    assert.equal(authAtual.user_metadata.degustacao_primeiro_acesso_em, null);
    assert.ok(authAtual.user_metadata.degustacao_revalidada_em);

    // C) Confirmar opção 1 envia aviso de revalidação diretamente para o celular real do cliente
    const enviosReval: Array<{ telefone: string; mensagem: string }> = [];
    (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__ = async (
      telefone: string,
      mensagem: string,
    ) => {
      enviosReval.push({ telefone, mensagem });
      return true;
    };

    try {
      const resConf = await processarMensagemWhatsappRecebida(
        { remetente: "5524992501512", texto: "1" },
        supabase,
      );
      assert.equal(resConf.acaoExecutada, "revalida_enviada_ao_cliente");
      const envioParaCliente = enviosReval.find((e) => e.telefone === "5524998476249");
      assert.ok(envioParaCliente, "Deve enviar confirmação ao telefone real do cliente legado");
      assert.match(envioParaCliente.mensagem, /revalidado por mais 24 horas/);
      assert.match(envioParaCliente.mensagem, /1º acesso/);
      assert.equal(supabase._sessoes().length, 0);
    } finally {
      delete (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__;
    }
  });
});
