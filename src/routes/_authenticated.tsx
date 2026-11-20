import { useState, useEffect, useCallback } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClientOnly } from "@/shared/components/ClientOnly";
import { AppShell } from "@/features/layout/components/AppShell";
import { useAuth } from "@/features/auth/context/AuthContext";
import { TelaClienteAguardandoInstalacao } from "@/features/clientes/components/TelaClienteAguardandoInstalacao";
import { TelaBloqueioMensalidadeVencida } from "@/features/clientes/components/TelaBloqueioMensalidadeVencida";
import { TelaBloqueioMotoristaFrota } from "@/features/clientes/components/TelaBloqueioMotoristaFrota";
import { BannerAvisoVencimento } from "@/features/layout/components/BannerAvisoVencimento";
import { BannerPagamentosAguardandoBaixa } from "@/features/mensalidades/components/BannerPagamentosAguardandoBaixa";
import { clientePossuiVeiculosAtivos } from "@/features/clientes/services/clienteService";
import {
  verificarStatusFinanceiroCliente,
  type StatusFinanceiroCliente,
} from "@/features/mensalidades/services/mensalidadeService";
import { supabase } from "@/integrations/supabase/client";
import { PresenceProvider } from "@/features/seguranca/context/PresenceContext";
import { MudarMinhaSenhaModal } from "@/features/auth/components/MudarMinhaSenhaModal";
import {
  inicializarOuvinteNotificacoesBd,
  resetarOuvinteNotificacoes,
} from "@/shared/lib/notificacoesBdService";
import { garantirInscricaoPushAtiva } from "@/shared/lib/webPushService";
import { BarraModoDemonstracao } from "@/features/demonstracao/components/BarraModoDemonstracao";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayoutWrapper,
});

function AuthenticatedLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Verificando credenciais GD Rastreamento...
        </span>
      </div>
    </div>
  );
}

function AuthenticatedLayoutWrapper() {
  return (
    <ClientOnly fallback={<AuthenticatedLoadingFallback />}>
      <AuthenticatedLayout />
    </ClientOnly>
  );
}

function AuthenticatedLayout() {
  const { session, carregando, recarregarSessao } = useAuth();
  const [verificandoVeiculos, setVerificandoVeiculos] = useState(false);
  const [temVeiculosAtivos, setTemVeiculosAtivos] = useState<boolean | null>(null);

  // Controle de Inadimplência e Bloqueio Financeiro do Cliente
  const [verificandoFinanceiro, setVerificandoFinanceiro] = useState(false);
  const [statusFinanceiro, setStatusFinanceiro] = useState<StatusFinanceiroCliente | null>(null);
  const [limiteTempoAtingido, setLimiteTempoAtingido] = useState(false);

  // Watchdog de segurança para boot de sessão: no máximo 800ms aguardando autenticação se deslogado
  useEffect(() => {
    const timer = setTimeout(() => {
      setLimiteTempoAtingido(true);
      setVerificandoVeiculos(false);
      setVerificandoFinanceiro(false);
      if (!session && typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [session]);

  const checarStatusFinanceiro = useCallback(async () => {
    if (!session || (!session.isCliente && !session.isMotorista)) {
      setStatusFinanceiro(null);
      return;
    }

    setVerificandoFinanceiro(true);
    try {
      const status = await verificarStatusFinanceiroCliente(
        session.userId,
        session.clienteId,
        session.isMotorista,
      );
      setStatusFinanceiro(status);
    } catch (err) {
      console.error("Falha ao checar status financeiro:", err);
    } finally {
      setVerificandoFinanceiro(false);
    }
  }, [session]);

  useEffect(() => {
    let ativo = true;

    async function checarVeiculos() {
      if (!session) {
        setTemVeiculosAtivos(null);
        return;
      }

      // Perfil que nao seja cliente ou que esteja em degustacao acessa normalmente o sistema
      if (!session.isCliente || session.isDegustacao) {
        setTemVeiculosAtivos(true);
        return;
      }

      setVerificandoVeiculos(true);
      try {
        const possui = await clientePossuiVeiculosAtivos(session.userId, session.clienteId);
        if (ativo) {
          setTemVeiculosAtivos(possui);
        }
      } catch {
        if (ativo) {
          setTemVeiculosAtivos(false);
        }
      } finally {
        if (ativo) {
          setVerificandoVeiculos(false);
        }
      }
    }

    checarVeiculos();
    checarStatusFinanceiro();

    // Inscrição Realtime para desbloqueio automático quando mensalidade for liquidada ou liberada
    let canal: any;
    if (session?.isCliente || session?.isMotorista) {
      canal = supabase
        .channel(`hunter_cliente_mensalidades_${session.userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "mensalidades" }, () => {
          checarStatusFinanceiro();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
          checarStatusFinanceiro();
        })
        .subscribe();
    }

    return () => {
      ativo = false;
      if (canal) {
        supabase.removeChannel(canal);
      }
    };
  }, [session, checarStatusFinanceiro]);

  const isEquipeTecnicaRealtime = Boolean(
    session?.isSuperAdmin || session?.isAdmin || session?.isOperador,
  );

  useEffect(() => {
    if (!session?.userId) return;
    garantirInscricaoPushAtiva(session.clienteId).catch(() => {});
    try {
      const unsub = inicializarOuvinteNotificacoesBd(
        session.userId,
        session.clienteId,
        isEquipeTecnicaRealtime,
      );
      return () => {
        try {
          unsub();
        } catch {
          // Ignora erro no cancelamento da inscricao
        }
      };
    } catch {
      return () => {};
    }
  }, [session?.userId, session?.clienteId, isEquipeTecnicaRealtime]);

  // Reconexão do Supabase Realtime ao retornar do segundo plano.
  // Quando o usuário abre outro app e volta, o WebSocket pode estar morto.
  // Este handler reativa o canal de notificações e renova a inscrição push.
  useEffect(() => {
    const userId = session?.userId;
    const clienteId = session?.clienteId ?? null;
    if (!userId) return;

    function aoRetomarFoco() {
      if (document.visibilityState !== "visible") return;

      // Reseta e reconecta o canal Supabase Realtime (pode ter fechado em background)
      resetarOuvinteNotificacoes();
      inicializarOuvinteNotificacoesBd(userId, clienteId, isEquipeTecnicaRealtime);

      // Renova a inscrição push VAPID para garantir que o endpoint ainda é válido
      garantirInscricaoPushAtiva(clienteId).catch(() => {});
    }

    document.addEventListener("visibilitychange", aoRetomarFoco);
    return () => {
      document.removeEventListener("visibilitychange", aoRetomarFoco);
    };
  }, [session?.userId, session?.clienteId, isEquipeTecnicaRealtime]);

  // Se o usuário NÃO tem sessão e ainda está carregando no primeiro boot
  if (!session && carregando && !limiteTempoAtingido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Verificando credenciais GD Rastreamento...
          </span>
          <button
            type="button"
            onClick={() => {
              setLimiteTempoAtingido(true);
              if (typeof window !== "undefined") {
                window.location.replace("/login");
              }
            }}
            className="mt-2 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer"
          >
            Demorando? Clique para prosseguir
          </button>
        </div>
      </div>
    );
  }

  // Se não estiver logado, redireciona imediatamente para tela de login com fallback navegável
  if (!session) {
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Redirecionando para login...
          </span>
          <a
            href="/login"
            className="mt-2 text-xs text-orange-600 dark:text-orange-400 font-semibold underline"
          >
            Acessar tela de login
          </a>
        </div>
      </div>
    );
  }

  // Regra de Troca de Senha Obrigatória no Primeiro Acesso (exceto SuperADM)
  if (session.primeiroAcesso && !session.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center">
        <MudarMinhaSenhaModal forcarTroca={true} onFechar={() => recarregarSessao()} />
      </div>
    );
  }

  // Regra de Bloqueio por Inadimplência ou Administrativo (7º dia de atraso ou Bloqueio Manual de Acesso)
  if (statusFinanceiro?.bloqueioLogin) {
    if (session.isCliente) {
      return (
        <TelaBloqueioMensalidadeVencida
          statusFinanceiro={statusFinanceiro}
          onVerificarNovamente={async () => {
            await checarStatusFinanceiro();
            await recarregarSessao();
          }}
        />
      );
    }

    if (session.isMotorista) {
      return (
        <TelaBloqueioMotoristaFrota
          onVerificarNovamente={async () => {
            await checarStatusFinanceiro();
            await recarregarSessao();
          }}
        />
      );
    }
  }

  // Regra de Isolamento Estrito: O perfil Instalador acessa EXCLUSIVAMENTE o módulo /instalacao
  if (session.isInstalador) {
    if (typeof window !== "undefined" && window.location.pathname !== "/instalacao") {
      window.location.href = "/instalacao";
      return null;
    }
  }

  // Regra de Isolamento Estrito: O perfil Revendedor acessa primariamente seu cockpit /minha-franquia
  if (session.isRevendedor) {
    if (
      typeof window !== "undefined" &&
      (window.location.pathname === "/" || window.location.pathname === "/inicio")
    ) {
      window.location.href = "/minha-franquia";
      return null;
    }
  }

  // Regra de Isolamento Estrito: O perfil Vendedor acessa primariamente seu cockpit /minhas-vendas
  if (session.isVendedor) {
    if (
      typeof window !== "undefined" &&
      (window.location.pathname === "/" || window.location.pathname === "/inicio")
    ) {
      window.location.href = "/minhas-vendas";
      return null;
    }
  }

  // Regra de Acesso do Cliente: Se o cliente titular não possui veículos ativos, exibe tela dedicada de espera dentro do AppShell
  if (session.isDegustacao) {
    // Modo Degustacao opera em sandbox com veiculos ativos sem espera de instalacao fisica
  } else if (
    session.isCliente &&
    !session.isRevendedor &&
    !session.isVendedor &&
    temVeiculosAtivos === false
  ) {
    return (
      <PresenceProvider>
        <AppShell>
          <BarraModoDemonstracao />
          <TelaClienteAguardandoInstalacao
            onInstalacaoConcluida={async () => {
              setTemVeiculosAtivos(true);
              await recarregarSessao();
              const possui = await clientePossuiVeiculosAtivos(session.userId, session.clienteId);
              setTemVeiculosAtivos(possui !== false);
            }}
          />
        </AppShell>
      </PresenceProvider>
    );
  }

  return (
    <PresenceProvider>
      <AppShell>
        <BarraModoDemonstracao />
        {!session.isCliente && <BannerPagamentosAguardandoBaixa />}
        {session.isCliente && statusFinanceiro?.avisoVencimentoProximo && (
          <BannerAvisoVencimento
            statusFinanceiro={statusFinanceiro}
            onAtualizado={checarStatusFinanceiro}
          />
        )}
        <Outlet />
      </AppShell>
    </PresenceProvider>
  );
}
