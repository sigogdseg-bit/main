import { useState } from "react";
import { Lock, Mail, ArrowRight, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registrarLogLogin, carregarSessaoUsuario } from "../services/authService";
import { useAuth } from "../context/AuthContext";
import { APP_NOME, APP_SLOGAN, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { toast } from "sonner";

export function LoginView() {
  const { recarregarSessao } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha) {
      toast.error("Informe e-mail e senha.");
      return;
    }

    setCarregando(true);
    const sessionId = "sess_" + Math.random().toString(36).substring(2, 15);
    const emailSanitizado = email.trim().toLowerCase();

    try {
      // Módulo 04: Verifica lockout escalonado antes de tentar autenticação
      try {
        const { data: lockInfo } = await (supabase.rpc as any)("login_esta_bloqueado", {
          _identificador: emailSanitizado,
        });
        if (lockInfo?.bloqueado) {
          toast.error(
            `Acesso temporariamente bloqueado (${lockInfo.motivo || "excesso de tentativas"}). Aguarde antes de tentar novamente.`,
          );
          return;
        }
      } catch {
        // segue fluxo normal se RPC indisponível
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailSanitizado,
        password: senha,
      });

      if (error) {
        await Promise.allSettled([
          registrarLogLogin(sessionId, { email: emailSanitizado, role: "desconhecido" }, "falha"),
          (supabase.rpc as any)("registrar_falha_login", {
            _identificador: emailSanitizado,
            _motivo: error.message || "Credenciais inválidas",
            _device_id:
              typeof localStorage !== "undefined" ? localStorage.getItem("app_device_id") : null,
            _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          }),
        ]);
        if (
          error.message.includes("Invalid login credentials") ||
          error.message.includes("invalid_grant")
        ) {
          toast.error("Credenciais inválidas. Verifique seu e-mail e senha.");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("E-mail pendente de confirmação no sistema.");
        } else {
          toast.error(`Falha no login: ${error.message}`);
        }
        return;
      }

      if (data?.user) {
        await registrarLogLogin(
          sessionId,
          { id: data.user.id, email: data.user.email || emailSanitizado, role: "autenticado" },
          "sucesso",
        );
        toast.success("Autenticado com sucesso!");
        const sessao = await recarregarSessao();
        if (!sessao) {
          toast.error(
            "Acesso de Degustação Expirado (Limite de 24 horas atingido). Entre em contato com a administração.",
          );
          return;
        }
        // Redirecionamento baseado no perfil
        if (sessao?.isInstalador) {
          window.location.href = "/instalacao";
        } else if (sessao?.isRevendedor) {
          window.location.href = "/minha-franquia";
        } else if (sessao?.isVendedor) {
          window.location.href = "/minhas-vendas";
        } else {
          window.location.href = "/inicio";
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao comunicar com o servidor.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#eaf0f8] dark:bg-[#0a0a0c] text-slate-800 dark:text-slate-100 relative overflow-hidden font-sans select-none transition-colors duration-200">
      {/* Botão de Alternância de Tema Flutuante no Canto Superior */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Luz ambiente de fundo Neumorphic Laranja */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-orange-500/15 dark:bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-[#f0f4f9] dark:bg-[#121215] border border-slate-300/80 dark:border-orange-500/25 rounded-3xl p-6 sm:p-8 shadow-[12px_12px_28px_#c3cfe2,-12px_-12px_28px_#ffffff] dark:shadow-[0_0_40px_rgba(234,88,12,0.14)] backdrop-blur-xl transition-all duration-200">
        {/* Header com Logo Hunter Oficial */}
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto flex items-center justify-center">
            <div className="h-28 w-28 sm:h-32 sm:w-32 flex items-center justify-center rounded-3xl overflow-hidden p-0 bg-transparent hover:scale-105 transition-transform duration-200">
              <img
                src="/logo-emblema.png"
                alt={APP_NOME}
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 uppercase mt-2">
              {APP_NOME}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{APP_SLOGAN}</p>
          </div>
        </div>

        {/* Formulário de Login */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
            >
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@gd.oficial.tec.br"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] transition"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Senha de Acesso
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                id="login-password"
                name="password"
                type={senhaVisivel ? "text" : "password"}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] transition"
              />
              <button
                type="button"
                onClick={() => setSenhaVisivel(!senhaVisivel)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                title={senhaVisivel ? "Ocultar senha" : "Ver senha"}
                aria-label={senhaVisivel ? "Ocultar senha" : "Ver senha"}
              >
                {senhaVisivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-orange-600 hover:bg-orange-500 text-white transition shadow-md shadow-orange-600/25 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] cursor-pointer"
          >
            <span>{carregando ? "Autenticando..." : "Entrar no Sistema"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Rodapé de Segurança e Governança */}
        <div className="mt-7 pt-4 border-t border-slate-200 dark:border-slate-800 text-center space-y-1.5">
          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-[11px] text-orange-800 dark:text-orange-300 font-semibold shadow-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            <span>Ambiente Protegido por RLS e Defesa Cibernética</span>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {APP_NOME} v{APP_VERSION_NUMERO}
          </div>
        </div>
      </div>
    </div>
  );
}
