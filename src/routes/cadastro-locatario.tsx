import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Lock,
  Phone,
  Car,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Eye,
  EyeOff,
  Building2,
  Check,
  X,
  CreditCard,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  validarConviteLocatario,
  concluirAutoCadastroLocatario,
} from "@/features/locatarios/services/locatarioService";
import type { ValidacaoConviteLocatario } from "@/features/locatarios/types";
import { formatarCpfCnpj, formatarTelefone } from "@/shared/utils/mascaras";

export const Route = createFileRoute("/cadastro-locatario")({
  component: CadastroLocatarioPage,
});

function CadastroLocatarioPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string>("");
  const [validando, setValidando] = useState(true);
  const [conviteValido, setConviteValido] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [dadosConvite, setDadosConvite] = useState<any>(null);

  // Campos do formulário
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const t = searchParams.get("token") || "";
    setToken(t);

    if (!t) {
      setValidando(false);
      setConviteValido(false);
      setMensagemErro("Token de convite não encontrado no link.");
      return;
    }

    async function validar() {
      try {
        const resultado: ValidacaoConviteLocatario = await validarConviteLocatario(t);
        if (resultado.valido && resultado.convite) {
          setConviteValido(true);
          setDadosConvite(resultado.convite);
          setNome(resultado.convite.nome || "");
          setEmail(resultado.convite.email || "");
          setTelefone(resultado.convite.telefone || "");
          setCpfCnpj(resultado.convite.cpf_cnpj || "");
        } else {
          setConviteValido(false);
          setMensagemErro(
            resultado.mensagem || "Este link de convite é inválido, expirou ou já foi utilizado.",
          );
        }
      } catch (err: any) {
        setConviteValido(false);
        setMensagemErro("Erro ao consultar dados do convite. Verifique sua conexão.");
      } finally {
        setValidando(false);
      }
    }

    validar();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    if (!senha || senha.length < 6) {
      toast.error("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      toast.error("A confirmação de senha não confere.");
      return;
    }

    setEnviando(true);
    try {
      const res = await concluirAutoCadastroLocatario({
        token,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim() || undefined,
        cpf_cnpj: cpfCnpj.trim() || undefined,
        senha,
      });

      if (res.success) {
        setSucesso(true);
        toast.success("Cadastro concluído com sucesso!");
      } else {
        toast.error(res.message || "Erro ao concluir cadastro.");
      }
    } catch (err: any) {
      toast.error("Falha ao comunicar com o servidor. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none">
      {/* Topo com Logo e Identidade Visual GD Segurança */}
      <div className="max-w-2xl mx-auto w-full pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center shadow-[0_0_20px_rgba(234,88,12,0.4)]">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-black text-sm tracking-widest text-orange-500 uppercase block">
              GD Segurança
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              Plataforma Tática de Rastreamento
            </span>
          </div>
        </div>
        <Link
          to="/login"
          className="text-xs font-bold text-slate-400 hover:text-white transition flex items-center gap-1"
        >
          <span>Já tem conta? Entrar</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="max-w-2xl mx-auto w-full my-auto py-6">
        {/* Estado 1: Validando Convite */}
        {validando && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
            <h2 className="text-base font-bold text-white">
              Validando seu convite de locatário...
            </h2>
            <p className="text-xs text-slate-400">
              Conectando aos servidores seguros da GD Segurança. Aguarde um instante.
            </p>
          </div>
        )}

        {/* Estado 2: Convite Inválido ou Expirado */}
        {!validando && !conviteValido && !sucesso && (
          <div className="bg-slate-900/90 border border-rose-900/50 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                Convite Inválido ou Expirado
              </h2>
              <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                {mensagemErro ||
                  "Este link de ativação expirou, já foi utilizado ou foi revogado pelo cliente locador."}
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer"
              >
                <span>Ir para a Página de Login</span>
              </Link>
            </div>
          </div>
        )}

        {/* Estado 3: Sucesso no Auto-Cadastro */}
        {sucesso && (
          <div className="bg-slate-900/90 border border-emerald-900/50 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Acesso Ativado com Sucesso!
              </h2>
              <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Seu perfil de locatário foi criado. Você já pode acessar a plataforma utilizando seu
                e-mail e a senha cadastrada para monitorar seus veículos autorizados.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left max-w-md mx-auto space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">E-mail:</span>
                <span className="font-mono font-bold text-white">{email}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Locador Titular:</span>
                <span className="font-bold text-orange-400">{dadosConvite?.cliente_nome}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Veículos Liberados:</span>
                <span className="font-bold text-emerald-400">
                  {dadosConvite?.veiculos?.length || 0} veículo(s)
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/login" })}
                className="w-full max-w-md mx-auto flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-sm shadow-xl transition active:scale-98 cursor-pointer"
              >
                <span>Entrar na Minha Conta</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Estado 4: Formulário de Auto-Cadastro do Locatário */}
        {!validando && conviteValido && !sucesso && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6">
            {/* Header do Convite */}
            <div className="border-b border-slate-800 pb-5">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-400 mb-1">
                <Building2 className="w-4 h-4" />
                <span>Convite de Locador Parceiro</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Ativação de Acesso de Locatário
              </h1>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Você foi convidado por{" "}
                <span className="text-orange-400 font-bold">{dadosConvite?.cliente_nome}</span> para
                gerenciar e acompanhar a telemetria dos veículos locados sob sua responsabilidade.
              </p>
            </div>

            {/* Painel de Veículos e Permissões Concedidas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Veículos Autorizados */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Car className="w-4 h-4 text-orange-500" />
                    <span>Veículos Autorizados</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                    {dadosConvite?.veiculos?.length || 0}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {dadosConvite?.veiculos && dadosConvite.veiculos.length > 0 ? (
                    dadosConvite.veiculos.map((v: any) => (
                      <div
                        key={v.id}
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-black text-white bg-slate-800 px-2 py-0.5 rounded-md">
                          {v.placa}
                        </span>
                        <span className="text-slate-400 text-[11px] truncate max-w-[140px]">
                          {v.marca || ""} {v.modelo || ""}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 block italic">
                      Todos os veículos da base do cliente titular
                    </span>
                  )}
                </div>
              </div>

              {/* Permissões Independentes de Bloqueio e Desbloqueio */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Permissões Concedidas</span>
                </span>

                <div className="space-y-2 pt-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bloquear Veículo:</span>
                    <span
                      className={`font-bold flex items-center gap-1 text-[11px] ${
                        dadosConvite?.pode_bloquear ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {dadosConvite?.pode_bloquear ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Autorizado</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" />
                          <span>Bloqueado</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Desbloquear Veículo:</span>
                    <span
                      className={`font-bold flex items-center gap-1 text-[11px] ${
                        dadosConvite?.pode_desbloquear ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {dadosConvite?.pode_desbloquear ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Autorizado</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" />
                          <span>Bloqueado</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Módulos Financeiros:</span>
                    <span className="font-bold flex items-center gap-1 text-[11px] text-slate-500">
                      <X className="w-3.5 h-3.5" />
                      <span>Exclusivo do Titular</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Formulário de Cadastro */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Nome Completo */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Seu nome completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                  </div>
                </div>

                {/* E-mail */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    E-mail de Acesso *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                  </div>
                </div>

                {/* Telefone / WhatsApp */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Telefone celular com DDD
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                  </div>
                </div>

                {/* CPF / CNPJ */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    CPF ou CNPJ (Opcional)
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(formatarCpfCnpj(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                  </div>
                </div>

                {/* Senha */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Criar Senha de Acesso *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={senhaVisivel ? "text" : "password"}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setSenhaVisivel(!senhaVisivel)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                    >
                      {senhaVisivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Senha */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={confirmarSenhaVisivel ? "text" : "password"}
                      required
                      placeholder="Repita sua senha"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setConfirmarSenhaVisivel(!confirmarSenhaVisivel)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                    >
                      {confirmarSenhaVisivel ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Botão de Conclusão */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-sm shadow-xl transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {enviando ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Concluindo seu cadastro...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      <span>Concluir Cadastro e Ativar Acesso</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Rodapé Tático */}
      <div className="max-w-2xl mx-auto w-full pt-4 text-center text-[11px] text-slate-600">
        <span>GD Segurança &copy; 2026 · Todos os direitos reservados · Segurança Militar</span>
      </div>
    </div>
  );
}
