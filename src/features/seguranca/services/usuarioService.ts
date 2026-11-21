import { supabase } from "@/integrations/supabase/client";
import type { HunterRole, PlanoCliente } from "@/integrations/supabase/types";
import { MODULOS_PADRAO_FINANCEIRO } from "@/shared/lib/permissoesModulos";
import {
  isModoDemonstracaoAtivo,
  obterUsuariosDemonstracaoComoCanonical,
} from "@/features/demonstracao/services/demonstracaoService";

export interface UsuarioCompleto {
  id: string;
  nome: string;
  email: string;
  role: HunterRole;
  ativo: boolean;
  theme_preference?: string;
  map_theme_preference?: string;
  created_at: string;
  modulos: string[];
  plano?: PlanoCliente;
  valor_por_instalacao?: number | null;
  valor_instalacao_sem_bloqueador?: number | null;
  valor_instalacao_com_bloqueador?: number | null;
  chave_pix?: string | null;
  endereco_instalacao?: string | null;
  telefone?: string | null;
  celular?: string | null;
  ultimo_acesso?: string | null;
  tem_sessao_ativa?: boolean;
  ultimo_logout?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  cargo?: string | null;
}

export const MODULOS_SISTEMA = [
  {
    id: "monitor-gps",
    nome: "Mapa Operacional e Telemetria",
    desc: "Acompanhamento em tempo real e rotas",
  },
  {
    id: "rotas",
    nome: "Rotas e Trajetos Inteligentes",
    desc: "Playback, paradas e refazer percursos",
  },
  {
    id: "frota",
    nome: "Desempenho da Frota",
    desc: "Score, ociosidade, KM diário e telemetria",
  },
  {
    id: "abastecimento",
    nome: "Abastecimento de Veículos",
    desc: "Controle de combustível, consumo e OCR de NF-e",
  },
  {
    id: "motoristas",
    nome: "Gestão de Motoristas",
    desc: "Controle de CNH, escalas e condutores",
  },
  {
    id: "funcionarios",
    nome: "Gestão de Funcionários",
    desc: "Controle de cargos e acessos da equipe",
  },
  {
    id: "atendimento",
    nome: "Atendimento ao Cliente",
    desc: "Abertura de chamados e providências",
  },
  { id: "clientes", nome: "Clientes e Planos", desc: "Gestão comercial e dias de retenção" },
  {
    id: "mensalidades",
    nome: "Mensalidades e Cobrança",
    desc: "Controle financeiro e comprovantes",
  },
  {
    id: "financeiro",
    nome: "Gestão Financeira e Fluxo de Caixa",
    desc: "Controle de caixa, DRE operacional, conciliação e relatórios",
  },
  { id: "rastreadores", nome: "Rastreadores J16 4G", desc: "Estoque e comandos SMS de ativação" },
  {
    id: "central-seguranca",
    nome: "Central de Segurança",
    desc: "Painel de governança cibernética e RLS",
  },
  { id: "logs", nome: "Logs e Auditoria Forense", desc: "Registros de login e atividades" },
  { id: "dispositivos", nome: "Dispositivos Autorizados", desc: "Fingerprint de aparelhos e TOFU" },
  {
    id: "manutencao",
    nome: "Manutenção Preventiva e Revisões",
    desc: "Troca de óleo, peças, odômetro e agendamentos pelo app",
  },
  {
    id: "instalacao",
    nome: "Instalações Técnicas",
    desc: "Ordens de instalação física de rastreadores e repasses",
  },
  {
    id: "estoque",
    nome: "Estoque e Suprimentos",
    desc: "Rastreadores, chicotes, insumos e kits de instalação",
  },
  {
    id: "temas",
    nome: "Personalização de Temas",
    desc: "Cores dos cards e identidade visual",
  },
  {
    id: "configuracoes",
    nome: "Configurações do Sistema",
    desc: "Ícones 3D, odômetro, proteções e privacidade",
  },
  { id: "usuarios", nome: "Gestão de Usuários", desc: "Criação de contas e perfis de acesso" },
];

export const MODULOS_CLIENTE_PLANO_MASTER = [
  "monitor-gps",
  "rotas",
  "frota",
  "abastecimento",
  "manutencao",
  "motoristas",
  "funcionarios",
  "mensalidades",
  "atendimento",
  "temas",
  "configuracoes",
];

/**
 * Retorna os módulos pré-selecionados para cada perfil ao cadastrar ou alterar perfil
 */
export function obterModulosPadraoPorPerfil(role: HunterRole): string[] {
  if (role === "superadmin" || role === "adm" || role === "superadmin_auditor") {
    return MODULOS_SISTEMA.map((m) => m.id);
  }
  if (role === "cliente_degustacao") {
    return [...MODULOS_CLIENTE_PLANO_MASTER];
  }
  if (role === "operador") {
    return [
      "atendimento",
      "clientes",
      "configuracoes",
      "estoque",
      "financeiro",
      "instalacao",
      "monitor-gps",
      "mensalidades",
      "temas",
    ];
  }
  if (role === "financeiro") {
    return [...MODULOS_PADRAO_FINANCEIRO];
  }
  if (role === "vigilante") {
    return ["vigilantes"];
  }
  if (role === "instalador") {
    return ["instalacao"];
  }
  if (role === "cliente") {
    return ["monitor-gps", "manutencao", "mensalidades", "atendimento", "configuracoes"];
  }
  if (role === "funcionario") {
    return ["monitor-gps", "manutencao"];
  }
  return [];
}

export async function carregarUsuarios(): Promise<UsuarioCompleto[]> {
  try {
    let profiles: any[] | null = null;
    const { data: pComSessao, error: pError1 } = await supabase
      .from("profiles")
      .select(
        "id, nome, email, role, ativo, created_at, theme_preference, map_theme_preference, valor_por_instalacao, chave_pix, endereco_instalacao, telefone, sessao_ativa, ultimo_login, ultimo_logout, cliente_id",
      )
      .order("nome", { ascending: true });

    if (!pError1 && pComSessao) {
      profiles = pComSessao;
    } else {
      const { data: pFallback, error: pError2 } = await supabase
        .from("profiles")
        .select(
          "id, nome, email, role, ativo, created_at, theme_preference, map_theme_preference, valor_por_instalacao, chave_pix, endereco_instalacao, telefone",
        )
        .order("nome", { ascending: true });
      if (!pError2 && pFallback) {
        profiles = pFallback;
      } else {
        const { data: pCore, error: pError3 } = await supabase
          .from("profiles")
          .select("id, nome, email, role, ativo, created_at")
          .order("nome", { ascending: true });
        if (pError3 || !pCore) {
          console.error("Erro ao listar perfis:", pError3 || pError2 || pError1);
          if (isModoDemonstracaoAtivo()) {
            return obterUsuariosDemonstracaoComoCanonical();
          }
          return [];
        }
        profiles = pCore;
      }
    }

    // Carrega módulos atribuídos para todos os usuários
    const { data: modulesData } = await supabase
      .from("user_module_access")
      .select("user_id, module, ativo")
      .eq("ativo", true);

    // Carrega clientes (para mapear nome da empresa, plano e id)
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, user_id, nome_razao_social, plano, email");

    // Carrega motoristas para mapear vínculo ao cliente titular
    const { data: motoristasData } = await supabase
      .from("motoristas")
      .select("id, user_id, email, cliente_id");

    // Carrega funcionários para mapear vínculo ao cliente titular e cargo
    const { data: funcionariosData } = await supabase
      .from("funcionarios_cliente")
      .select("id, user_id, email, cliente_id, cargo");

    // Otimização de Performance: filtra os logs estritamente pelos IDs dos usuários da lista
    const userIds = profiles.map((p) => p.id).filter(Boolean);
    const [loginsRes, logoutsRes, activityRes, dispRes] = await Promise.all([
      userIds.length > 0
        ? supabase
            .from("system_login_logs")
            .select("session_id, user_id, email, status, created_at")
            .eq("status", "sucesso")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase
            .from("system_login_logs")
            .select("session_id, user_id, email, status, created_at")
            .eq("status", "logout")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase
            .from("system_activity_logs")
            .select("user_id, acao, created_at")
            .in("user_id", userIds)
            .in("acao", ["logout", "desconexao_forcada"])
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase
            .from("dispositivos_autorizados")
            .select("user_id, ultimo_acesso")
            .in("user_id", userIds)
            .order("ultimo_acesso", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] }),
    ]);

    const ultimoLoginPorId = new Map<string, string>();
    const ultimoLoginPorEmail = new Map<string, string>();
    const ultimoLogoutPorId = new Map<string, string>();
    const ultimoLogoutPorEmail = new Map<string, string>();
    const ultimoAcessoDispPorId = new Map<string, string>();

    if (loginsRes.data) {
      for (const log of loginsRes.data) {
        if (log.user_id && !ultimoLoginPorId.has(log.user_id)) {
          ultimoLoginPorId.set(log.user_id, log.created_at);
        }
        if (log.email) {
          const em = log.email.trim().toLowerCase();
          if (!ultimoLoginPorEmail.has(em)) {
            ultimoLoginPorEmail.set(em, log.created_at);
          }
        }
      }
    }

    if (logoutsRes.data) {
      for (const log of logoutsRes.data) {
        if (log.user_id && !ultimoLogoutPorId.has(log.user_id)) {
          ultimoLogoutPorId.set(log.user_id, log.created_at);
        }
        if (log.email) {
          const em = log.email.trim().toLowerCase();
          if (!ultimoLogoutPorEmail.has(em)) {
            ultimoLogoutPorEmail.set(em, log.created_at);
          }
        }
      }
    }

    if (activityRes.data) {
      for (const act of activityRes.data) {
        if (act.user_id) {
          const curr = ultimoLogoutPorId.get(act.user_id);
          if (!curr || new Date(act.created_at).getTime() > new Date(curr).getTime()) {
            ultimoLogoutPorId.set(act.user_id, act.created_at);
          }
        }
      }
    }

    if (dispRes.data) {
      for (const d of dispRes.data) {
        if (d.user_id && !ultimoAcessoDispPorId.has(d.user_id)) {
          ultimoAcessoDispPorId.set(d.user_id, d.ultimo_acesso);
        }
      }
    }

    const modulesByUser = new Map<string, string[]>();
    if (modulesData) {
      for (const m of modulesData) {
        const list = modulesByUser.get(m.user_id) || [];
        list.push(m.module);
        modulesByUser.set(m.user_id, list);
      }
    }

    const planoByUser = new Map<string, PlanoCliente>();
    const clientePorId = new Map<string, { id: string; nome: string; plano: PlanoCliente }>();
    const clientePorUserId = new Map<string, { id: string; nome: string; plano: PlanoCliente }>();
    const clientePorEmail = new Map<string, { id: string; nome: string; plano: PlanoCliente }>();

    if (clientesData) {
      for (const c of clientesData) {
        if (c.user_id) planoByUser.set(c.user_id, c.plano);
        const info = { id: c.id, nome: c.nome_razao_social, plano: c.plano };
        clientePorId.set(c.id, info);
        if (c.user_id) clientePorUserId.set(c.user_id, info);
        if (c.email) clientePorEmail.set(c.email.trim().toLowerCase(), info);
      }
    }

    const motoristaClienteMap = new Map<string, string>();
    if (motoristasData) {
      for (const m of motoristasData) {
        if (m.user_id && m.cliente_id) motoristaClienteMap.set(m.user_id, m.cliente_id);
        if (m.email && m.cliente_id)
          motoristaClienteMap.set(m.email.trim().toLowerCase(), m.cliente_id);
      }
    }

    const funcionarioInfoMap = new Map<string, { cliente_id: string; cargo?: string | null }>();
    if (funcionariosData) {
      for (const f of funcionariosData) {
        const item = { cliente_id: f.cliente_id, cargo: f.cargo };
        if (f.user_id) funcionarioInfoMap.set(f.user_id, item);
        if (f.email) funcionarioInfoMap.set(f.email.trim().toLowerCase(), item);
      }
    }

    const listaUsuarios: UsuarioCompleto[] = profiles.map((p) => {
      const userMods = modulesByUser.get(p.id) || [];
      const modulosFinais =
        userMods.length > 0 ? userMods : obterModulosPadraoPorPerfil(p.role as HunterRole);

      const emailLower = (p.email || "").trim().toLowerCase();
      const loginTimestamp =
        p.ultimo_login || ultimoLoginPorId.get(p.id) || ultimoLoginPorEmail.get(emailLower) || null;
      const logoutTimestamp =
        p.ultimo_logout ||
        ultimoLogoutPorId.get(p.id) ||
        ultimoLogoutPorEmail.get(emailLower) ||
        null;
      const dispTimestamp = ultimoAcessoDispPorId.get(p.id) || null;

      let ultimoAcessoFinal = loginTimestamp;
      if (dispTimestamp) {
        if (
          !ultimoAcessoFinal ||
          new Date(dispTimestamp).getTime() > new Date(ultimoAcessoFinal).getTime()
        ) {
          ultimoAcessoFinal = dispTimestamp;
        }
      }

      // Vínculo hierárquico com cliente titular (para motorista e funcionário)
      let clienteIdVinculado: string | null = p.cliente_id || null;
      let clienteNomeVinculado: string | null = null;
      let cargoVinculado: string | null = null;

      if (p.role === "motorista") {
        const motCliId =
          motoristaClienteMap.get(p.id) || motoristaClienteMap.get(emailLower) || p.cliente_id;
        if (motCliId) {
          clienteIdVinculado = motCliId;
          clienteNomeVinculado = clientePorId.get(motCliId)?.nome || null;
        }
      } else if (p.role === "funcionario") {
        const fInfo = funcionarioInfoMap.get(p.id) || funcionarioInfoMap.get(emailLower);
        const funcCliId = fInfo?.cliente_id || p.cliente_id;
        if (funcCliId) {
          clienteIdVinculado = funcCliId;
          clienteNomeVinculado = clientePorId.get(funcCliId)?.nome || null;
          cargoVinculado = fInfo?.cargo || null;
        }
      } else if (p.role === "cliente") {
        const cliInfo = clientePorUserId.get(p.id) || clientePorEmail.get(emailLower);
        if (cliInfo) {
          clienteIdVinculado = cliInfo.id;
          clienteNomeVinculado = cliInfo.nome;
        }
      }

      // DETERMINAÇÃO DETERMINÍSTICA DE QUEM FEZ LOGOUT VS QUEM AINDA NÃO FEZ (STANDBY):
      let temSessaoAtiva = false;

      // 1. Se a flag do banco diz explicitamente que está ativo
      if (p.sessao_ativa === true) {
        temSessaoAtiva = true;
      } else {
        // 2. Análise determinística por auditoria de eventos (login vs logout vs dispositivos):
        const dataLoginMs = loginTimestamp ? new Date(loginTimestamp).getTime() : 0;
        const dataAcessoMs = ultimoAcessoFinal ? new Date(ultimoAcessoFinal).getTime() : 0;
        const dataAtividadeMs = Math.max(dataLoginMs, dataAcessoMs);
        const dataLogoutMs = logoutTimestamp ? new Date(logoutTimestamp).getTime() : 0;

        if (dataAtividadeMs > 0) {
          if (dataLogoutMs > 0) {
            // Se a atividade/login for mais recente que o logout -> LOGADO (Sessão mantida/Standby)
            // Se o logout for igual ou mais recente que o login -> DESLOGADO COM CERTEZA
            temSessaoAtiva = dataAtividadeMs > dataLogoutMs;
          } else {
            // Se o usuário logou/acessou e NUNCA efetuou logout explícito no sistema:
            // Regra Canônica: O usuário NUNCA é deslogado automaticamente (sessão ativa/standby no dispositivo)
            temSessaoAtiva = true;
          }
        }
      }

      return {
        id: p.id,
        nome: p.nome,
        email: p.email,
        role: p.role as HunterRole,
        ativo: p.ativo,
        theme_preference: p.theme_preference,
        created_at: p.created_at,
        modulos: modulosFinais,
        plano: planoByUser.get(p.id),
        valor_por_instalacao: p.valor_por_instalacao ? Number(p.valor_por_instalacao) : 0,
        chave_pix: p.chave_pix || null,
        endereco_instalacao: p.endereco_instalacao || null,
        telefone: p.telefone || p.celular || null,
        celular: p.celular || p.telefone || null,
        ultimo_acesso: ultimoAcessoFinal,
        tem_sessao_ativa: temSessaoAtiva,
        ultimo_logout: logoutTimestamp,
        cliente_id: clienteIdVinculado,
        cliente_nome: clienteNomeVinculado,
        cargo: cargoVinculado,
      };
    });

    // Se o Modo Demonstração estiver ativo, injeta os usuários virtuais da sandbox (cliente e instalador fantasma)
    if (isModoDemonstracaoAtivo()) {
      const demoUsers = obterUsuariosDemonstracaoComoCanonical();
      const idsExistentes = new Set(listaUsuarios.map((u) => u.id));
      for (const du of demoUsers) {
        if (!idsExistentes.has(du.id)) {
          listaUsuarios.push(du);
        }
      }
    }

    return listaUsuarios;
  } catch (err) {
    console.error("Exceção ao listar usuários:", err);
    if (isModoDemonstracaoAtivo()) {
      return obterUsuariosDemonstracaoComoCanonical();
    }
    return [];
  }
}

function isRpcNotFoundError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const orig = String(err.originalMessage || "").toLowerCase();
  const code = String(err.code || "");
  return (
    code === "PGRST202" ||
    code === "PGRST204" ||
    msg.includes("could not find the function") ||
    orig.includes("could not find the function") ||
    msg.includes("schema cache") ||
    orig.includes("schema cache")
  );
}

function comTimeout<T>(
  promessa: Promise<T>,
  ms: number = 14000,
  mensagemTimeout: string = "Tempo limite excedido na resposta do banco de dados. Tente novamente.",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(mensagemTimeout)), ms);
  });
  return Promise.race([promessa, timeoutPromise]).finally(() => clearTimeout(timer));
}

export async function cadastrarUsuarioAdmin(dados: {
  nome: string;
  email: string;
  senha: string;
  role: HunterRole;
  modulos: string[];
  plano?: PlanoCliente;
  valorPorInstalacao?: number;
  valorInstalacaoSemBloqueador?: number;
  valorInstalacaoComBloqueador?: number;
  chavePix?: string;
  enderecoInstalacao?: string;
  telefone?: string;
}): Promise<{ success: boolean; message: string; userId?: string }> {
  try {
    return await comTimeout(
      (async () => {
        const nomeLimpo = dados.nome.trim();
        const emailLimpo = dados.email.trim().toLowerCase();
        const telefoneLimpo = dados.telefone ? dados.telefone.trim() : null;

        if (
          dados.role === "superadmin" &&
          emailLimpo !== "novaes@adm.28bpm.local" &&
          emailLimpo !== "novaes@oficial.tec.br"
        ) {
          return {
            success: false,
            message:
              "Acesso negado: apenas as contas de governança (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.",
          };
        }

        // 1. Tentativa Completa (10 parâmetros - com telefone para WhatsApp)
        let { data, error } = await supabase.rpc("admin_cadastrar_usuario", {
          p_nome: nomeLimpo,
          p_email: emailLimpo,
          p_senha: dados.senha,
          p_role: dados.role,
          p_modulos: dados.modulos,
          p_plano: dados.plano || "basico",
          p_valor_por_instalacao: dados.valorPorInstalacao || 0,
          p_chave_pix: dados.chavePix ? dados.chavePix.trim() : null,
          p_endereco_instalacao: dados.enderecoInstalacao ? dados.enderecoInstalacao.trim() : null,
          p_telefone: telefoneLimpo,
        });

        if (isRpcNotFoundError(error)) {
          // 2. Tentativa sem p_telefone (9 parâmetros)
          const res9 = await supabase.rpc("admin_cadastrar_usuario", {
            p_nome: nomeLimpo,
            p_email: emailLimpo,
            p_senha: dados.senha,
            p_role: dados.role,
            p_modulos: dados.modulos,
            p_plano: dados.plano || "basico",
            p_valor_por_instalacao: dados.valorPorInstalacao || 0,
            p_chave_pix: dados.chavePix ? dados.chavePix.trim() : null,
            p_endereco_instalacao: dados.enderecoInstalacao
              ? dados.enderecoInstalacao.trim()
              : null,
          });
          data = res9.data;
          error = res9.error;
        }

        // Se o schema cache remoto ainda não conhece p_endereco_instalacao:
        if (isRpcNotFoundError(error)) {
          // 3. Tentativa sem p_endereco_instalacao (8 parâmetros)
          const res2 = await supabase.rpc("admin_cadastrar_usuario", {
            p_nome: nomeLimpo,
            p_email: emailLimpo,
            p_senha: dados.senha,
            p_role: dados.role,
            p_modulos: dados.modulos,
            p_plano: dados.plano || "basico",
            p_valor_por_instalacao: dados.valorPorInstalacao || 0,
            p_chave_pix: dados.chavePix ? dados.chavePix.trim() : null,
          });
          data = res2.data;
          error = res2.error;

          // 4. Tentativa sem p_chave_pix (7 parâmetros)
          if (isRpcNotFoundError(error)) {
            const res3 = await supabase.rpc("admin_cadastrar_usuario", {
              p_nome: nomeLimpo,
              p_email: emailLimpo,
              p_senha: dados.senha,
              p_role: dados.role,
              p_modulos: dados.modulos,
              p_plano: dados.plano || "basico",
              p_valor_por_instalacao: dados.valorPorInstalacao || 0,
            });
            data = res3.data;
            error = res3.error;
          }

          // 5. Tentativa Legada Inicial (6 parâmetros)
          if (isRpcNotFoundError(error)) {
            const res4 = await supabase.rpc("admin_cadastrar_usuario", {
              p_nome: nomeLimpo,
              p_email: emailLimpo,
              p_senha: dados.senha,
              p_role: dados.role,
              p_modulos: dados.modulos,
              p_plano: dados.plano || "basico",
            });
            data = res4.data;
            error = res4.error;
          }
        }

        if (error) throw error;
        const res = data as { success: boolean; message: string; user_id?: string };
        const novoUserId = res?.user_id;

        // Sincronização direta de reforço em public.profiles (garante que campos técnicos fiquem salvos)
        if (novoUserId) {
          try {
            const updates: Record<string, any> = {
              updated_at: new Date().toISOString(),
            };
            if (dados.valorPorInstalacao !== undefined) {
              updates.valor_por_instalacao = dados.valorPorInstalacao;
            }
            if (dados.valorInstalacaoSemBloqueador !== undefined) {
              updates.valor_instalacao_sem_bloqueador = dados.valorInstalacaoSemBloqueador;
              updates.valor_por_instalacao = dados.valorInstalacaoSemBloqueador;
            }
            if (dados.valorInstalacaoComBloqueador !== undefined) {
              updates.valor_instalacao_com_bloqueador = dados.valorInstalacaoComBloqueador;
            }
            if (dados.chavePix !== undefined) {
              updates.chave_pix = dados.chavePix ? dados.chavePix.trim() : null;
            }
            if (dados.enderecoInstalacao !== undefined) {
              updates.endereco_instalacao = dados.enderecoInstalacao
                ? dados.enderecoInstalacao.trim()
                : null;
            }
            if (dados.telefone !== undefined) {
              updates.telefone = dados.telefone ? dados.telefone.trim() : null;
            }

            const { error: pErr } = await supabase
              .from("profiles")
              .update(updates)
              .eq("id", novoUserId);

            if (pErr) {
              delete updates.endereco_instalacao;
              await supabase.from("profiles").update(updates).eq("id", novoUserId);
            }
          } catch (syncErr) {
            console.warn("Aviso ao sincronizar detalhes do perfil:", syncErr);
          }
        }

        return {
          success: true,
          message: res?.message || "Usuário cadastrado com sucesso.",
          userId: novoUserId,
        };
      })(),
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || err?.originalMessage || "");
    let msg = rawMsg;
    if (
      rawMsg.includes("invalid input value for enum hunter_role") ||
      rawMsg.includes("hunter_role")
    ) {
      if (dados.role === "superadmin_auditor") {
        msg =
          "O perfil 'S.adm Auditor' requer a execução do script SQL de governança no SQL Editor do Supabase: ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'superadmin_auditor';";
      } else {
        msg = `O perfil '${dados.role}' ainda não foi habilitado no banco de dados Supabase. Execute o comando SQL no SQL Editor do Supabase: ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS '${dados.role}';`;
      }
    }
    return {
      success: false,
      message: msg || "Não foi possível concluir o cadastro do usuário.",
    };
  }
}

export async function atualizarUsuarioAdmin(dados: {
  userId: string;
  nome: string;
  email?: string;
  role: HunterRole;
  ativo: boolean;
  modulos: string[];
  plano?: PlanoCliente;
  valorPorInstalacao?: number;
  valorInstalacaoSemBloqueador?: number;
  valorInstalacaoComBloqueador?: number;
  chavePix?: string;
  enderecoInstalacao?: string;
  telefone?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    return await comTimeout(
      (async () => {
        const nomeLimpo = dados.nome.trim();
        const emailLimpo = dados.email ? dados.email.trim().toLowerCase() : undefined;
        const telefoneLimpo = dados.telefone ? dados.telefone.trim() : undefined;
        const isSuperAdmEmail =
          emailLimpo === "novaes@adm.28bpm.local" || emailLimpo === "novaes@oficial.tec.br";
        const isSuperAdmAccount =
          isSuperAdmEmail ||
          dados.role === "superadmin" ||
          dados.userId === "00000000-0000-0000-0000-000000000001";

        if (dados.role === "superadmin" && !isSuperAdmEmail) {
          return {
            success: false,
            message:
              "Acesso negado: apenas as contas de governança (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.",
          };
        }

        // Se for conta SuperADM, atualiza diretamente profiles e metadata do auth de forma instantânea
        if (isSuperAdmAccount) {
          try {
            const { data: authUser } = await supabase.auth.getUser();
            if (authUser?.user?.id === dados.userId) {
              await supabase.auth.updateUser({
                data: { nome: nomeLimpo, role: "superadmin", telefone: telefoneLimpo },
              });
            }
          } catch (authErr) {
            console.warn("Aviso ao atualizar auth metadata:", authErr);
          }

          const updatesSuper: Record<string, any> = {
            nome: nomeLimpo,
            role: "superadmin",
            ativo: true,
            updated_at: new Date().toISOString(),
          };
          if (telefoneLimpo !== undefined) {
            updatesSuper.telefone = telefoneLimpo;
          }

          const { error: pErr } = await supabase
            .from("profiles")
            .update(updatesSuper)
            .eq("id", dados.userId);

          if (!pErr) {
            try {
              await supabase.rpc("admin_atualizar_usuario", {
                p_usuario_id: dados.userId,
                p_nome: nomeLimpo,
                p_role: "superadmin",
                p_ativo: true,
                p_modulos: dados.modulos,
                p_telefone: telefoneLimpo || null,
              } as any);
            } catch {
              // Silenciosamente ignora se o banco ainda tiver a RPC antiga
            }

            return {
              success: true,
              message: "Perfil SuperADM atualizado com sucesso.",
            };
          }
        }

        // 1. Tentativa Completa com email, endereço, PIX e telefone
        let { data, error } = await supabase.rpc("admin_atualizar_usuario", {
          p_usuario_id: dados.userId,
          p_nome: nomeLimpo,
          p_role: dados.role,
          p_ativo: dados.ativo,
          p_modulos: dados.modulos,
          p_plano: dados.plano,
          p_valor_por_instalacao:
            dados.valorPorInstalacao !== undefined ? dados.valorPorInstalacao : null,
          p_chave_pix:
            dados.chavePix !== undefined ? (dados.chavePix ? dados.chavePix.trim() : null) : null,
          p_endereco_instalacao:
            dados.enderecoInstalacao !== undefined
              ? dados.enderecoInstalacao
                ? dados.enderecoInstalacao.trim()
                : null
              : null,
          p_email: emailLimpo || null,
          p_telefone: telefoneLimpo || null,
        });

        if (isRpcNotFoundError(error)) {
          // 2. Tentativa sem p_telefone (10 parâmetros)
          const res10 = await supabase.rpc("admin_atualizar_usuario", {
            p_usuario_id: dados.userId,
            p_nome: nomeLimpo,
            p_role: dados.role,
            p_ativo: dados.ativo,
            p_modulos: dados.modulos,
            p_plano: dados.plano,
            p_valor_por_instalacao:
              dados.valorPorInstalacao !== undefined ? dados.valorPorInstalacao : null,
            p_chave_pix:
              dados.chavePix !== undefined ? (dados.chavePix ? dados.chavePix.trim() : null) : null,
            p_endereco_instalacao:
              dados.enderecoInstalacao !== undefined
                ? dados.enderecoInstalacao
                  ? dados.enderecoInstalacao.trim()
                  : null
                : null,
            p_email: emailLimpo || null,
          });
          data = res10.data;
          error = res10.error;
        }

        if (isRpcNotFoundError(error)) {
          // 3. Tentativa sem p_email (legada)
          const res2 = await supabase.rpc("admin_atualizar_usuario", {
            p_usuario_id: dados.userId,
            p_nome: nomeLimpo,
            p_role: dados.role,
            p_ativo: dados.ativo,
            p_modulos: dados.modulos,
            p_plano: dados.plano,
            p_valor_por_instalacao:
              dados.valorPorInstalacao !== undefined ? dados.valorPorInstalacao : null,
            p_chave_pix:
              dados.chavePix !== undefined ? (dados.chavePix ? dados.chavePix.trim() : null) : null,
            p_endereco_instalacao:
              dados.enderecoInstalacao !== undefined
                ? dados.enderecoInstalacao
                  ? dados.enderecoInstalacao.trim()
                  : null
                : null,
          });
          data = res2.data;
          error = res2.error;

          // 4. Tentativa sem p_endereco_instalacao
          if (isRpcNotFoundError(error)) {
            const res3 = await supabase.rpc("admin_atualizar_usuario", {
              p_usuario_id: dados.userId,
              p_nome: nomeLimpo,
              p_role: dados.role,
              p_ativo: dados.ativo,
              p_modulos: dados.modulos,
              p_plano: dados.plano,
              p_valor_por_instalacao:
                dados.valorPorInstalacao !== undefined ? dados.valorPorInstalacao : null,
              p_chave_pix:
                dados.chavePix !== undefined
                  ? dados.chavePix
                    ? dados.chavePix.trim()
                    : null
                  : null,
            });
            data = res3.data;
            error = res3.error;
          }
        }

        if (error) {
          if (
            isSuperAdmAccount &&
            (error.message.includes("blindada") ||
              error.message.includes("rebaixamento") ||
              error.message.includes("alteracao"))
          ) {
            try {
              const { data: authUser } = await supabase.auth.getUser();
              if (authUser?.user?.id === dados.userId) {
                await supabase.auth.updateUser({
                  data: { nome: nomeLimpo, role: "superadmin" },
                });
              }
            } catch (authErr) {
              console.warn("Aviso ao atualizar auth metadata:", authErr);
            }

            const { error: pErr } = await supabase
              .from("profiles")
              .update({
                nome: nomeLimpo,
                role: "superadmin",
                ativo: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", dados.userId);

            if (!pErr) {
              return {
                success: true,
                message: "Nome do SuperADM atualizado com sucesso.",
              };
            }
          }
          throw error;
        }

        // Sincronização direta em public.profiles
        try {
          const updates: Record<string, any> = {
            nome: nomeLimpo,
            updated_at: new Date().toISOString(),
          };
          if (
            emailLimpo &&
            emailLimpo !== "novaes@adm.28bpm.local" &&
            emailLimpo !== "novaes@oficial.tec.br"
          ) {
            updates.email = emailLimpo;
          }
          if (dados.role === "superadmin") {
            updates.role = "superadmin";
          }
          if (dados.valorPorInstalacao !== undefined) {
            updates.valor_por_instalacao = dados.valorPorInstalacao;
          }
          if (dados.valorInstalacaoSemBloqueador !== undefined) {
            updates.valor_instalacao_sem_bloqueador = dados.valorInstalacaoSemBloqueador;
            updates.valor_por_instalacao = dados.valorInstalacaoSemBloqueador;
          }
          if (dados.valorInstalacaoComBloqueador !== undefined) {
            updates.valor_instalacao_com_bloqueador = dados.valorInstalacaoComBloqueador;
          }
          if (dados.chavePix !== undefined) {
            updates.chave_pix = dados.chavePix ? dados.chavePix.trim() : null;
          }
          if (dados.enderecoInstalacao !== undefined) {
            updates.endereco_instalacao = dados.enderecoInstalacao
              ? dados.enderecoInstalacao.trim()
              : null;
          }
          if (dados.telefone !== undefined) {
            updates.telefone = dados.telefone ? dados.telefone.trim() : null;
          }

          const { error: pErr } = await supabase
            .from("profiles")
            .update(updates)
            .eq("id", dados.userId);

          if (pErr) {
            delete updates.endereco_instalacao;
            await supabase.from("profiles").update(updates).eq("id", dados.userId);
          }
        } catch (syncErr) {
          console.warn("Aviso ao sincronizar detalhes do perfil:", syncErr);
        }

        return {
          success: true,
          message: (data as any)?.message || "Usuário atualizado com sucesso.",
        };
      })(),
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || err?.originalMessage || "");
    let msg = rawMsg;
    if (
      rawMsg.includes("invalid input value for enum hunter_role") ||
      rawMsg.includes("hunter_role")
    ) {
      if (dados.role === "superadmin_auditor") {
        msg =
          "O perfil 'S.adm Auditor' requer a execução do script SQL de governança no SQL Editor do Supabase: ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'superadmin_auditor';";
      } else {
        msg = `O perfil '${dados.role}' ainda não foi habilitado no banco de dados Supabase. Execute o comando SQL no SQL Editor do Supabase: ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS '${dados.role}';`;
      }
    }
    return {
      success: false,
      message: msg || "Não foi possível concluir a atualização do usuário.",
    };
  }
}

export async function redefinirSenhaAdmin(
  userId: string,
  novaSenha: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_redefinir_senha", {
      p_user_id: userId,
      p_nova_senha: novaSenha,
    });

    if (error) throw error;
    const res = data as { success: boolean; message: string };
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Falha ao redefinir senha.",
    };
  }
}

export async function excluirUsuarioAdmin(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  // 1. Tenta rota de API segura no Servidor (Trata em cascata clientes, veículos e instalações com service role)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (token) {
      const res = await fetch(`/api/admin/usuarios?id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: data.success ?? true,
          message: data.message || "Usuário excluído com sucesso.",
        };
      } else {
        const errJson = await res.json().catch(() => null);
        if (errJson?.message) {
          // Se for erro explícito de validação (ex: conta SuperADM imutável ou permissão)
          if (res.status === 403 || res.status === 400) {
            return {
              success: false,
              message: errJson.message,
            };
          }
        }
      }
    }
  } catch {
    // Segue para fallback via RPC
  }

  // 2. Fallback para RPC direta no Supabase
  try {
    const { data, error } = await supabase.rpc("admin_excluir_usuario", {
      p_user_id: userId,
    });

    if (error) throw error;
    const res = data as { success: boolean; message: string };
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Falha ao excluir usuário.",
    };
  }
}

export async function alternarStatusAtivoUsuario(
  userId: string,
  novoStatusAtivo: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: usuario, error: userErr } = await supabase
      .from("profiles")
      .select("email, role, nome")
      .eq("id", userId)
      .maybeSingle();

    if (userErr) throw userErr;
    const emailUsuarioLower = (usuario?.email || "").toLowerCase();
    if (
      emailUsuarioLower === "novaes@adm.28bpm.local" ||
      emailUsuarioLower === "novaes@oficial.tec.br"
    ) {
      return {
        success: false,
        message: "A conta de governança e blindada contra alteracao de status ou inativacao.",
      };
    }

    const { error: updErr } = await supabase
      .from("profiles")
      .update({
        ativo: novoStatusAtivo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updErr) throw updErr;

    if (novoStatusAtivo && usuario?.role) {
      // Sincroniza tabela user_roles
      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: usuario.role as any }, { onConflict: "user_id,role" });

      // Se for instalador, garante módulo de instalação liberado
      if (usuario.role === "instalador") {
        await supabase
          .from("user_module_access")
          .upsert(
            { user_id: userId, module: "instalacao", ativo: true },
            { onConflict: "user_id,module" },
          );
      }
    }

    return {
      success: true,
      message: novoStatusAtivo
        ? `Usuário ${usuario?.nome || ""} habilitado e ativado com sucesso!`
        : `Usuário ${usuario?.nome || ""} inativado com sucesso.`,
    };
  } catch (err: any) {
    console.error("Erro ao alternar status do usuário:", err);
    return {
      success: false,
      message: err.message || "Falha ao alterar status do usuário.",
    };
  }
}
