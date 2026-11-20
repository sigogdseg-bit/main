import { supabase } from "@/integrations/supabase/client";
import type { UserSession } from "../types";
export type { UserSession };
import { saveCardThemeConfig, type CardThemeConfig } from "@/shared/lib/card-theme";
import { aplicarPreferenciasLocais } from "@/shared/lib/userPreferencesService";
import { MODULOS_PADRAO_OPERADOR } from "@/shared/lib/permissoesModulos";
import { cancelarInscricaoPushDispositivoAtual } from "@/shared/lib/webPushService";
import {
  sincronizarPrimeiroAcessoDegustacaoServidor,
  verificarExpiracaoDegustacao,
} from "@/features/demonstracao/services/degustacaoMasterService";

const CACHE_SESSAO_KEY = "hunter-cached-user-session-v1";
export const BACKUP_TOKEN_KEY = "hunter-supabase-token-backup-v1";

export function obterSessaoCacheada(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_SESSAO_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function salvarSessaoCacheada(sessao: UserSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_SESSAO_KEY, JSON.stringify(sessao));
  } catch {
    // quota exceeded
  }
}

export function limparSessaoCacheada(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHE_SESSAO_KEY);
    localStorage.removeItem(BACKUP_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function backupSupabaseToken(): void {
  if (typeof window === "undefined") return;
  try {
    const token = localStorage.getItem("hunter-auth-token-v1");
    if (token) {
      localStorage.setItem(BACKUP_TOKEN_KEY, token);
    }
  } catch {
    // ignore
  }
}

export async function restaurarSupabaseToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const backup = localStorage.getItem(BACKUP_TOKEN_KEY);
    if (!backup) return false;
    const parsed = JSON.parse(backup);
    if (parsed?.access_token && parsed?.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });
      if (data?.session) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function carregarSessaoUsuario(): Promise<UserSession | null> {
  try {
    backupSupabaseToken();

    // 1. Obtém sessão ativa local ou atualiza token se expirado (o getSession já renova automaticamente usando mutex interno)
    let sessionData = (await supabase.auth.getSession()).data;

    let user = sessionData?.session?.user;

    // Se falhou (ex: gotrue dropou o token por erro de rede), tenta restaurar do nosso backup
    if (!user) {
      const restaurado = await restaurarSupabaseToken();
      if (restaurado) {
        sessionData = (await supabase.auth.getSession()).data;
        user = sessionData?.session?.user;
      }
    }

    // Fallback: tenta getUser() se getSession não retornou user
    if (!user) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!authError && authData?.user) {
        user = authData.user;
      }
    }

    if (!user) {
      // Se não encontrou no Supabase, mas temos cache local, preserva sessão
      const cache = obterSessaoCacheada();
      if (cache) {
        return cache;
      }
      return null;
    }

    const userEmail = (user.email || "").toLowerCase();
    const isNovaes =
      userEmail === "novaes@adm.28bpm.local" || userEmail === "novaes@oficial.tec.br";

    // 1. Carrega Perfil com as colunas reais validadas no banco de dados (com fallback Expand-and-Contract)
    let profileData: any = null;

    let { data: pData, error: pError } = await supabase
      .from("profiles")
      .select(
        "id, nome, email, role, ativo, cliente_id, valor_por_instalacao, chave_pix, endereco_instalacao, map_theme_preference, theme_preference, primeiro_acesso, visivel_no_chat, degustacao_primeiro_acesso_em, degustacao_expira_em, degustacao_revalidada_em",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (
      pError &&
      (pError.code === "42703" ||
        pError.code === "PGRST204" ||
        String(pError.message || "").includes("degustacao_"))
    ) {
      const legacyProfileRes = await supabase
        .from("profiles")
        .select(
          "id, nome, email, role, ativo, cliente_id, valor_por_instalacao, chave_pix, endereco_instalacao, map_theme_preference, theme_preference, primeiro_acesso, visivel_no_chat",
        )
        .eq("id", user.id)
        .maybeSingle();
      pData = legacyProfileRes.data as any;
      pError = legacyProfileRes.error;
    }

    if (!pError && pData) {
      profileData = pData;
    } else if (pError) {
      // Se falhar (ex: sem conexão de rede), preserva a sessão em cache
      const cache = obterSessaoCacheada();
      if (cache && cache.userId === user.id) {
        return cache;
      }
    }

    const profile = profileData;

    // Sincronização multi-dispositivo de Preferências do Usuário (Pin vs Veículo, Cores dos Cards, Tema do Mapa e App)
    aplicarPreferenciasLocais(
      {
        icone_mapa_pin: profile?.icone_mapa_pin,
        modo_placa_mapa: profile?.modo_placa_mapa,
        map_theme_preference: profile?.map_theme_preference,
        card_theme_preference: profile?.card_theme_preference,
        theme_preference: profile?.theme_preference,
      },
      user.id,
    );

    // Resolução segura da role (evita rebaixar revendedor, vendedor, instalador ou operador para cliente)
    let roleResolvida = profile?.role;

    if (!isNovaes) {
      const userEmail = (user.email || "").trim().toLowerCase();
      // Checa de forma concorrente vínculos em revendedores e vendedores
      const [{ data: revRow }, { data: vendRow }] = await Promise.all([
        supabase
          .from("revendedores")
          .select("id, user_id")
          .or(`user_id.eq.${user.id},email.ilike.${userEmail || "none"}`)
          .maybeSingle(),
        supabase
          .from("vendedores")
          .select("id, user_id, revendedor_id")
          .or(`user_id.eq.${user.id},email.ilike.${userEmail || "none"}`)
          .maybeSingle(),
      ]);

      const metaRole = (user.user_metadata?.role || user.app_metadata?.role || "") as string;
      const isRev = metaRole === "revendedor" || Boolean(revRow);
      const isVend = metaRole === "vendedor" || Boolean(vendRow);

      if (isRev) {
        roleResolvida = "revendedor";
        if (revRow && revRow.user_id !== user.id) {
          try {
            await supabase.from("revendedores").update({ user_id: user.id }).eq("id", revRow.id);
          } catch {
            // Silencioso se bloqueado por RLS
          }
        }
      } else if (isVend) {
        roleResolvida = "vendedor";
        if (vendRow && vendRow.user_id !== user.id) {
          try {
            await supabase.from("vendedores").update({ user_id: user.id }).eq("id", vendRow.id);
          } catch {
            // Silencioso se bloqueado por RLS
          }
        }
      } else if (!roleResolvida || roleResolvida === "cliente") {
        const { data: rData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (rData?.role && rData.role !== "cliente") {
          roleResolvida = rData.role;
        } else if (metaRole) {
          roleResolvida = metaRole as any;
        }
      }
    }

    let role = (isNovaes ? "superadmin" : roleResolvida || "cliente") as UserSession["role"];
    let nome =
      profile?.nome ||
      user.user_metadata?.nome ||
      user.email?.split("@")[0] ||
      "Usuário GD Rastreamento";
    if (role === "superadmin" && /superadmin/i.test(nome)) {
      nome = nome.replace(/superadmin/gi, "Administrador");
    }

    // 2. Se for cliente, carrega o ID do cliente, plano e data de cadastro
    let clienteId: string | undefined;
    let plano: UserSession["plano"] = undefined;
    let planoContratado: UserSession["planoContratado"] = undefined;
    let isTrialMaster = false;
    let diasRestantesTrial = 0;
    let clienteCreatedAt: string | undefined = undefined;

    let acessoMapaMotorista: boolean | undefined = undefined;
    let locatarioClienteId: string | undefined;
    let veiculosPermitidos: string[] = [];
    let podeBloquear = false;
    let podeDesbloquear = false;
    let podeBloquearDesbloquear = false;

    if (role === "cliente") {
      let { data: cliente } = await supabase
        .from("clientes")
        .select("id, plano, status, created_at, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      // Fallback seguro: se não encontrou por user_id, busca por email do cliente
      if (!cliente && user.email) {
        const { data: clientePorEmail } = await supabase
          .from("clientes")
          .select("id, plano, status, created_at, user_id")
          .ilike("email", user.email.trim())
          .maybeSingle();

        if (clientePorEmail) {
          cliente = clientePorEmail;
          // Se o user_id estava nulo ou desatualizado, vincula de forma atômica
          if (clientePorEmail.user_id !== user.id) {
            try {
              await supabase
                .from("clientes")
                .update({ user_id: user.id })
                .eq("id", clientePorEmail.id);
            } catch {
              // Silencioso se bloqueado por RLS do cliente
            }
          }
        }
      }

      if (cliente) {
        clienteId = cliente.id;
        const planoReal = (cliente.plano || "basico") as UserSession["plano"];
        clienteCreatedAt = cliente.created_at;

        // Regra de Negócio Hunter: Todo cliente novo tem Plano Master por 30 dias, após retorna ao contratado
        // Exceto se o cliente já contratou diretamente o Plano Master (ele já é Master definitivo)
        const dataCadastro = cliente.created_at ? new Date(cliente.created_at) : new Date();
        const diferencaMs = Date.now() - dataCadastro.getTime();
        const diasDesdeCriacao = Math.max(0, Math.floor(diferencaMs / (1000 * 60 * 60 * 24)));
        const jaEhMaster = planoReal === "master";
        isTrialMaster = !jaEhMaster && diasDesdeCriacao <= 30;
        diasRestantesTrial = isTrialMaster ? Math.max(0, 30 - diasDesdeCriacao) : 0;

        planoContratado = planoReal;
        plano = isTrialMaster ? "master" : planoReal;
      } else {
        plano = "basico";
        planoContratado = "basico";
      }

      if (!clienteId && profile?.cliente_id) {
        clienteId = profile.cliente_id;
      }

      // Se ainda não resolveu clienteId (ex: bloqueio de RLS direto no Supabase), busca via backend seguro
      if (!clienteId) {
        try {
          const sess = await supabase.auth.getSession();
          const token = sess.data.session?.access_token;
          if (token && typeof window !== "undefined") {
            const res = await fetch("/api/clientes/meu-status", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const json = await res.json();
              if (json.success && json.clienteId) {
                clienteId = json.clienteId;
                if (!plano) plano = json.plano || "basico";
                if (!planoContratado) planoContratado = json.plano || "basico";
              }
            }
          }
        } catch {
          // fallback
        }
      }
    } else if (role === "motorista") {
      let motQuery = await supabase
        .from("motoristas")
        .select("id, cliente_id, acesso_mapa")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .maybeSingle();

      if (!motQuery.data && user.email) {
        motQuery = await supabase
          .from("motoristas")
          .select("id, cliente_id, acesso_mapa")
          .ilike("email", user.email.trim())
          .eq("ativo", true)
          .maybeSingle();
      }

      const mot = motQuery.data;
      if (mot) {
        clienteId = mot.cliente_id || undefined;
        acessoMapaMotorista = Boolean(mot.acesso_mapa);
        if (clienteId) {
          const { data: cli } = await supabase
            .from("clientes")
            .select("plano, created_at")
            .eq("id", clienteId)
            .maybeSingle();
          if (cli) {
            const planoReal = (cli.plano || "basico") as UserSession["plano"];
            clienteCreatedAt = cli.created_at;
            const diasDesdeCadastro = clienteCreatedAt
              ? Math.floor(
                  (Date.now() - new Date(clienteCreatedAt).getTime()) / (1000 * 60 * 60 * 24),
                )
              : 999;
            const isTrial = diasDesdeCadastro <= 30;
            isTrialMaster = isTrial && planoReal !== "master";
            planoContratado = planoReal;
            plano = isTrialMaster ? "master" : planoReal;
          } else {
            plano = "master";
            planoContratado = "master";
          }
        } else {
          plano = "master";
          planoContratado = "master";
        }
      } else {
        acessoMapaMotorista = false;
      }
    } else if (role === "funcionario") {
      let funcClienteId = profile?.cliente_id;
      if (!funcClienteId) {
        const { data: funcData } = await supabase
          .from("funcionarios_cliente")
          .select("cliente_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (funcData) {
          funcClienteId = funcData.cliente_id;
        }
      }

      clienteId = funcClienteId || undefined;
      if (clienteId) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("plano, created_at")
          .eq("id", clienteId)
          .maybeSingle();
        if (cli) {
          const planoReal = (cli.plano || "basico") as UserSession["plano"];
          clienteCreatedAt = cli.created_at;
          const diasDesdeCadastro = clienteCreatedAt
            ? Math.floor(
                (Date.now() - new Date(clienteCreatedAt).getTime()) / (1000 * 60 * 60 * 24),
              )
            : 999;
          const isTrial = diasDesdeCadastro <= 30;
          isTrialMaster = isTrial && planoReal !== "master";
          planoContratado = planoReal;
          plano = isTrialMaster ? "master" : planoReal;
        } else {
          // Fallback resiliente caso cliente titular seja Master
          plano = "master";
          planoContratado = "master";
        }
      }
    } else if (role === "locatario") {
      let locCliId = profile?.cliente_id;
      const { data: locData } = await supabase
        .from("locatarios_cliente" as any)
        .select(
          "cliente_id, veiculos_permitidos, pode_bloquear, pode_desbloquear, pode_bloquear_desbloquear, ativo",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (locData) {
        if (!locCliId) locCliId = (locData as any).cliente_id;
        locatarioClienteId = (locData as any).cliente_id;
        veiculosPermitidos = (locData as any).veiculos_permitidos || [];
        podeBloquear = Boolean((locData as any).pode_bloquear);
        podeDesbloquear = Boolean((locData as any).pode_desbloquear);
        podeBloquearDesbloquear = Boolean(
          (locData as any).pode_bloquear_desbloquear || (podeBloquear && podeDesbloquear),
        );
      }

      clienteId = locCliId || undefined;
      plano = "master";
      planoContratado = "master";
    }

    // 3. Carrega módulos autorizados
    const { data: modulosData } = await supabase
      .from("user_module_access")
      .select("module")
      .eq("user_id", user.id)
      .eq("ativo", true);

    let modulos = modulosData ? modulosData.map((m) => m.module) : [];

    // Fallback de defesa em profundidade para Funcionário: carrega modulos_permitidos do cadastro
    if (role === "funcionario" && modulos.length === 0) {
      const { data: funcRec } = await supabase
        .from("funcionarios_cliente")
        .select("modulos_permitidos")
        .eq("user_id", user.id)
        .maybeSingle();

      if (funcRec?.modulos_permitidos && Array.isArray(funcRec.modulos_permitidos)) {
        modulos = funcRec.modulos_permitidos.filter(Boolean);
      }
    }

    if (role === "operador" && modulos.length === 0) {
      modulos = [...MODULOS_PADRAO_OPERADOR];
    }

    if (role === "cliente_degustacao") {
      modulos = [
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
    }

    if (role === "superadmin_auditor") {
      modulos = [
        "monitor-gps",
        "rotas",
        "frota",
        "abastecimento",
        "manutencao",
        "instalacao",
        "clientes",
        "motoristas",
        "funcionarios",
        "financeiro",
        "mensalidades",
        "estoque",
        "atendimento",
        "chat",
        "temas",
        "demonstracao",
        "configuracoes",
        "usuarios",
        "central-seguranca",
        "dispositivos",
        "logs",
        "rastreadores",
        "revendedores",
        "propostas",
      ];
    }

    let revendedorId: string | undefined = undefined;
    let vendedorId: string | undefined = undefined;

    if (role === "revendedor") {
      const { data: revData } = await supabase
        .from("revendedores")
        .select("id")
        .or(`user_id.eq.${user.id},email.ilike.${(user.email || "").trim().toLowerCase()}`)
        .maybeSingle();
      if (revData) revendedorId = revData.id;
    } else if (role === "vendedor") {
      const { data: vendData } = await supabase
        .from("vendedores")
        .select("id, revendedor_id")
        .or(`user_id.eq.${user.id},email.ilike.${(user.email || "").trim().toLowerCase()}`)
        .maybeSingle();
      if (vendData) {
        vendedorId = vendData.id;
        revendedorId = vendData.revendedor_id;
      }
    }

    const isDegustacao = Boolean(
      role === "cliente_degustacao" ||
      role === "superadmin_auditor" ||
      (role as string) === "degustacao" ||
      user.user_metadata?.degustacao === true ||
      user.user_metadata?.role === "cliente_degustacao",
    );
    let degustacaoPrimeiroAcessoEm: string | undefined = undefined;
    let degustacaoExpiraEm: string | undefined = undefined;
    let degustacaoRevalidadaEm: string | undefined = undefined;

    if (isDegustacao) {
      const sincronizacaoDeg = await sincronizarPrimeiroAcessoDegustacaoServidor(
        supabase,
        user.id,
        profile,
        user.user_metadata,
      );
      degustacaoPrimeiroAcessoEm = sincronizacaoDeg.primeiroAcessoEm;
      degustacaoExpiraEm = sincronizacaoDeg.expiraEmIso;
      degustacaoRevalidadaEm = sincronizacaoDeg.revalidadaEmIso || undefined;

      if (sincronizacaoDeg.expirado) {
        await encerrarSessao().catch(() => {});
        return null;
      }

      // Regra Hunter: Degustação opera na experiência do Cliente no Plano Master
      role = "cliente";
      plano = "master";
      planoContratado = "master";
      isTrialMaster = true;
      clienteId = clienteId || "deg-cli-001";
      modulos = [
        "monitor-gps",
        "rotas",
        "frota",
        "abastecimento",
        "manutencao",
        "motoristas",
        "motorista",
        "funcionarios",
        "mensalidades",
        "atendimento",
        "chat",
        "configuracoes",
      ];
    }

    if (role === "financeiro" && (!modulos || modulos.length === 0)) {
      modulos = [
        "financeiro",
        "mensalidades",
        "propostas",
        "clientes",
        "revendedores",
        "instalacao",
        "abastecimento",
        "manutencao",
        "estoque",
        "chat",
        "atendimento",
        "configuracoes",
        "temas",
      ];
    }

    const userSession: UserSession = {
      userId: user.id,
      email: user.email || "",
      nome,
      role,
      plano,
      planoContratado,
      isTrialMaster,
      diasRestantesTrial,
      clienteId,
      clienteCreatedAt,
      modulos,
      isSuperAdmin: role === "superadmin",
      isSuperAdminAuditor: role === "superadmin_auditor",
      isAuditor: role === "superadmin_auditor",
      isReadOnly: false,
      isDegustacao,
      degustacaoPrimeiroAcessoEm,
      degustacaoExpiraEm,
      degustacaoRevalidadaEm,
      isAdmin: role === "superadmin" || role === "adm",
      isOperador: role === "superadmin" || role === "adm" || role === "operador",
      isCliente: role === "cliente",
      isLocatario: role === "locatario",
      locatarioClienteId,
      veiculosPermitidos,
      podeBloquear,
      podeDesbloquear,
      podeBloquearDesbloquear,
      isInstalador: role === "instalador",
      isMotorista: role === "motorista",
      isFuncionario: role === "funcionario",
      isFinanceiro: role === "financeiro",
      isRevendedor: role === "revendedor",
      isVendedor: role === "vendedor",
      revendedorId,
      vendedorId,
      acessoMapaMotorista: role === "motorista" ? Boolean(acessoMapaMotorista) : true,
      valorPorInstalacao: profile?.valor_por_instalacao ? Number(profile.valor_por_instalacao) : 0,
      valor_instalacao_sem_bloqueador: profile?.valor_instalacao_sem_bloqueador
        ? Number(profile.valor_instalacao_sem_bloqueador)
        : profile?.valor_por_instalacao
          ? Number(profile.valor_por_instalacao)
          : 50,
      valor_instalacao_com_bloqueador: profile?.valor_instalacao_com_bloqueador
        ? Number(profile.valor_instalacao_com_bloqueador)
        : profile?.valor_por_instalacao
          ? Number(profile.valor_por_instalacao) + 30
          : 80,
      chavePix: profile?.chave_pix || undefined,
      enderecoInstalacao: profile?.endereco_instalacao || undefined,
      mapThemePreference:
        (profile?.map_theme_preference as "streets" | "dark" | "satellite") || "streets",
      primeiroAcesso:
        isNovaes || role === "motorista" ? false : Boolean(profile?.primeiro_acesso === true),
      visivelNoChat: Boolean(profile?.visivel_no_chat),
    };

    salvarSessaoCacheada(userSession);

    // Registra sessão ativa no banco para controle determinístico de presença
    if (user.id) {
      supabase
        .from("profiles")
        .update({ sessao_ativa: true, ultimo_login: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => {})
        .catch(() => {});
    }

    return userSession;
  } catch (err) {
    console.error("Erro ao carregar sessão:", err);
    const cache = obterSessaoCacheada();
    if (cache) {
      return cache;
    }
    return null;
  }
}

export async function registrarLogLogin(
  sessionId: string,
  user: { id?: string; email: string; role: string },
  status: "sucesso" | "falha",
) {
  try {
    await supabase.from("system_login_logs").insert({
      session_id: sessionId,
      user_id: user.id || null,
      email: user.email,
      role: user.role,
      status,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "Hunter-Client",
    });
  } catch (e) {
    console.warn("Falha ao registrar log de login:", e);
  }
}

export async function encerrarSessao(): Promise<void> {
  const sessao = obterSessaoCacheada();
  const userId = sessao?.userId;
  const email = sessao?.email;
  const role = sessao?.role;

  // Limpa o cache de sessão IMEDIATAMENTE para que qualquer reload ou navegação já esteja deslogado
  limparSessaoCacheada();

  try {
    if (userId || email) {
      const sessionId = "logout_" + Math.random().toString(36).substring(2, 15);
      const tarefas: Promise<any>[] = [
        supabase.from("system_login_logs").insert({
          session_id: sessionId,
          user_id: userId || null,
          email: email || "usuario",
          role: role || "autenticado",
          status: "logout",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "Hunter-Client",
        }),
        supabase.from("system_activity_logs").insert({
          user_id: userId || null,
          acao: "logout",
          detalhe: `Usuário ${email || userId} encerrou a sessão.`,
        }),
      ];

      if (userId) {
        tarefas.push(
          supabase
            .from("profiles")
            .update({ sessao_ativa: false, ultimo_logout: new Date().toISOString() })
            .eq("id", userId),
        );
      }

      await Promise.race([
        Promise.allSettled(tarefas),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    }
  } catch (e) {
    console.warn("Aviso ao registrar log de logout:", e);
  } finally {
    await cancelarInscricaoPushDispositivoAtual().catch(() => {});

    try {
      limparSessaoCacheada();
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("hunter-auth-token-v1");
        localStorage.removeItem(CACHE_SESSAO_KEY);
        localStorage.removeItem(BACKUP_TOKEN_KEY);
        sessionStorage.clear();
      }
    }
  }
}
