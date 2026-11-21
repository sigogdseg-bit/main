import { useState, useEffect } from "react";
import {
  X,
  User,
  Mail,
  Key,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Copy,
  Check,
  RefreshCw,
  Link2,
  Phone,
  Car,
} from "lucide-react";
import { toast } from "sonner";
import type { HunterRole, PlanoCliente } from "@/integrations/supabase/types";
import {
  type UsuarioCompleto,
  MODULOS_SISTEMA,
  MODULOS_CLIENTE_PLANO_MASTER,
  obterModulosPadraoPorPerfil,
  cadastrarUsuarioAdmin,
  atualizarUsuarioAdmin,
} from "../services/usuarioService";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { ModalConviteInstalador } from "./ModalConviteInstalador";

interface UsuarioFormModalProps {
  usuario?: UsuarioCompleto | null;
  onSalvo: () => void;
  onFechar: () => void;
}

export function UsuarioFormModal({ usuario, onSalvo, onFechar }: UsuarioFormModalProps) {
  const isEdicao = !!usuario;
  const userEmailLower = usuario?.email?.toLowerCase().trim() || "";
  const isSuperAdmEmail =
    userEmailLower === "novaes@adm.28bpm.local" || userEmailLower === "novaes@oficial.tec.br";
  const isSuperAdm = isSuperAdmEmail;
  const [modalConviteAberto, setModalConviteAberto] = useState(false);

  const [nome, setNome] = useState(usuario?.nome || "");
  const [email, setEmail] = useState(usuario?.email || "");
  const [telefone, setTelefone] = useState(usuario?.telefone || usuario?.celular || "");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<HunterRole>(
    isSuperAdm
      ? "superadmin"
      : usuario?.role === "superadmin"
        ? "adm"
        : usuario?.role || "operador",
  );
  const [plano, setPlano] = useState<PlanoCliente>(usuario?.plano || "basico");
  const [valorSemBloqueador, setValorSemBloqueador] = useState<number>(
    usuario?.valor_instalacao_sem_bloqueador ?? usuario?.valor_por_instalacao ?? 60,
  );
  const [valorComBloqueador, setValorComBloqueador] = useState<number>(
    usuario?.valor_instalacao_com_bloqueador ??
      (usuario?.valor_por_instalacao ? usuario.valor_por_instalacao + 30 : 90),
  );
  const [ativo, setAtivo] = useState(usuario ? usuario.ativo : true);
  const [tipoSupervisor, setTipoSupervisor] = useState<"geral" | "vigilante">(
    usuario?.tipo_supervisor || "geral",
  );
  const [acessoVeiculos, setAcessoVeiculos] = useState<boolean>(
    usuario?.acesso_veiculos !== false,
  );
  const [chavePix, setChavePix] = useState(usuario?.chave_pix || "");
  const [enderecoInstalacao, setEnderecoInstalacao] = useState(usuario?.endereco_instalacao || "");
  const [modulos, setModulos] = useState<string[]>(() => {
    if (!usuario) return obterModulosPadraoPorPerfil("operador");
    if (isSuperAdm || usuario.role === "superadmin") {
      return MODULOS_SISTEMA.map((m) => m.id);
    }
    if (usuario.modulos && usuario.modulos.length > 0) {
      return usuario.modulos;
    }
    return obterModulosPadraoPorPerfil(usuario.role);
  });

  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const gerarSenhaForte = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!";
    let s = "";
    for (let i = 0; i < 12; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSenha(s);
    toast.info("Senha gerada com sucesso!");
  };

  const copiarSenha = () => {
    if (!senha) return;
    navigator.clipboard.writeText(senha);
    setCopiado(true);
    toast.success("Senha copiada para a área de transferência!");
    setTimeout(() => setCopiado(false), 2500);
  };

  const toggleModulo = (modId: string) => {
    setModulos((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId],
    );
  };

  const aplicarPacote = (tipoPacote: "basico" | "pro" | "master") => {
    if (tipoPacote === "basico") {
      setModulos(["monitor-gps", "atendimento", "mensalidades"]);
      toast.info("Pacote Básico aplicado (3 módulos).");
    } else if (tipoPacote === "pro") {
      if (role === "cliente" || role === "superadmin_auditor" || role === "cliente_degustacao") {
        setModulos(["monitor-gps", "atendimento", "mensalidades", "manutencao"]);
        toast.info("Pacote Pro de Cliente aplicado (4 módulos).");
      } else {
        setModulos([
          "monitor-gps",
          "atendimento",
          "mensalidades",
          "clientes",
          "rastreadores",
          "dispositivos",
        ]);
        toast.info("Pacote Pro aplicado (6 módulos).");
      }
    } else if (tipoPacote === "master") {
      if (role === "cliente" || role === "superadmin_auditor" || role === "cliente_degustacao") {
        setModulos([...MODULOS_CLIENTE_PLANO_MASTER]);
        toast.info(
          `Pacote Master de Cliente aplicado (${MODULOS_CLIENTE_PLANO_MASTER.length} módulos concedidos).`,
        );
      } else {
        setModulos(MODULOS_SISTEMA.map((m) => m.id));
        toast.info("Pacote Master aplicado (Todos os módulos concedidos).");
      }
    }
  };

  const selecionarTodosModulos = () => {
    if (role === "cliente" || role === "superadmin_auditor" || role === "cliente_degustacao") {
      setModulos([...MODULOS_CLIENTE_PLANO_MASTER]);
    } else {
      setModulos(MODULOS_SISTEMA.map((m) => m.id));
    }
  };

  const limparModulos = () => {
    setModulos([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Informe o nome completo.");
      return;
    }

    if (!email.trim()) {
      toast.error("Informe o e-mail.");
      return;
    }

    if (!isEdicao && (!senha || senha.length < 6)) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (role === "instalador" && !enderecoInstalacao.trim()) {
      toast.error("Informe o endereço da oficina ou ponto de atendimento do instalador.");
      return;
    }

    setSalvando(true);
    const roleFinal = isSuperAdm ? "superadmin" : role;
    const modulosFinais =
      roleFinal === "superadmin"
        ? MODULOS_SISTEMA.map((m) => m.id)
        : roleFinal === "cliente" ||
            roleFinal === "superadmin_auditor" ||
            roleFinal === "cliente_degustacao"
          ? modulos.filter((m) => MODULOS_CLIENTE_PLANO_MASTER.includes(m))
          : modulos && modulos.length > 0
            ? modulos
            : obterModulosPadraoPorPerfil(roleFinal);

    // Timer defensivo de segurança (máximo 16s) para garantir que a UI nunca trave em "Salvando..."
    let timerSeguranca: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ success: false; message: string }>((resolve) => {
      timerSeguranca = setTimeout(() => {
        resolve({
          success: false,
          message:
            "Tempo limite excedido ao salvar usuário. Verifique a conexão com o banco de dados.",
        });
      }, 16000);
    });

    try {
      if (isEdicao && usuario) {
        const res = await Promise.race([
          atualizarUsuarioAdmin({
            userId: usuario.id,
            nome: nome.trim(),
            email: email.trim(),
            role: roleFinal,
            ativo: isSuperAdm ? true : ativo,
            modulos: modulosFinais,
            plano: undefined,
            valorPorInstalacao: roleFinal === "instalador" ? Number(valorSemBloqueador) : undefined,
            valorInstalacaoSemBloqueador:
              roleFinal === "instalador" ? Number(valorSemBloqueador) : undefined,
            valorInstalacaoComBloqueador:
              roleFinal === "instalador" ? Number(valorComBloqueador) : undefined,
            chavePix: roleFinal === "instalador" ? chavePix.trim() : undefined,
            enderecoInstalacao: roleFinal === "instalador" ? enderecoInstalacao.trim() : undefined,
            tipoSupervisor: roleFinal === "supervisor" ? tipoSupervisor : undefined,
            acessoVeiculos: roleFinal === "supervisor" ? acessoVeiculos : undefined,
            telefone: telefone.trim() || undefined,
          }),
          timeoutPromise,
        ]);

        if (res.success) {
          toast.success(res.message);
          onSalvo();
        } else {
          toast.error(res.message, { duration: 8000 });
        }
      } else {
        const res = await Promise.race([
          cadastrarUsuarioAdmin({
            nome: nome.trim(),
            email: email.trim(),
            senha,
            role: roleFinal,
            modulos: modulosFinais,
            plano: undefined,
            valorPorInstalacao: roleFinal === "instalador" ? Number(valorSemBloqueador) : undefined,
            valorInstalacaoSemBloqueador:
              roleFinal === "instalador" ? Number(valorSemBloqueador) : undefined,
            valorInstalacaoComBloqueador:
              roleFinal === "instalador" ? Number(valorComBloqueador) : undefined,
            chavePix: roleFinal === "instalador" ? chavePix.trim() : undefined,
            enderecoInstalacao: roleFinal === "instalador" ? enderecoInstalacao.trim() : undefined,
            tipoSupervisor: roleFinal === "supervisor" ? tipoSupervisor : undefined,
            acessoVeiculos: roleFinal === "supervisor" ? acessoVeiculos : undefined,
            telefone: telefone.trim() || undefined,
          }),
          timeoutPromise,
        ]);

        if (res.success) {
          toast.success(res.message);
          onSalvo();
        } else {
          toast.error(res.message, { duration: 8000 });
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Ocorreu um erro ao salvar usuário. Tente novamente.");
    } finally {
      if (timerSeguranca) clearTimeout(timerSeguranca);
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
        <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl my-auto flex flex-col">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#eaf0f8]/90 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  {isEdicao ? "Editar Perfil e Acessos" : "Novo Cadastro de Usuário"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modelo corporativo com controle granular de módulos
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: Carlos Eduardo Silva"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* E-mail */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      E-mail Institucional / Login *
                    </label>
                    {isSuperAdmEmail && (
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                        Governança Imutável
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      disabled={isSuperAdmEmail}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="usuario@empresa.com.br"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-orange-500 focus:outline-none disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Celular / WhatsApp */}
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Celular / WhatsApp{" "}
                        {role === "instalador" ? "(Notificações de Instalações e Demandas) *" : ""}
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Disparo automático via WhatsApp
                    </span>
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="tel"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="Ex: (24) 99123-4567"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Utilizado para envio de mensagens via WhatsApp e notificações de novas ordens de
                    serviço.
                  </span>
                </div>
              </div>

              {/* Senha (apenas na criação) */}
              {!isEdicao && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Senha Inicial de Acesso *
                    </label>
                    <button
                      type="button"
                      onClick={gerarSenhaForte}
                      className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Gerar Senha Forte
                    </button>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    {senha && (
                      <button
                        type="button"
                        onClick={copiarSenha}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                        title="Copiar senha"
                      >
                        {copiado ? (
                          <Check className="h-4 w-4 text-orange-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Perfil e Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                    <span>Perfil de Acesso (Cargo) *</span>
                  </label>
                  <select
                    value={role}
                    disabled={isSuperAdm}
                    onChange={(e) => {
                      const novaRole = e.target.value as HunterRole;
                      setRole(novaRole);
                      const padrao = obterModulosPadraoPorPerfil(novaRole);
                      setModulos(padrao);
                      if (novaRole === "instalador") {
                        toast.success(
                          "Perfil Instalador selecionado: módulo Instalações Técnicas atribuído.",
                        );
                      } else if (novaRole === "financeiro") {
                        toast.success(
                          "Perfil Financeiro selecionado: módulos financeiros, abastecimento, manutenção e estoque atribuídos.",
                        );
                      } else if (novaRole === "adm" || novaRole === "superadmin") {
                        toast.success("Perfil Administrador: todos os módulos foram liberados.");
                      } else if (
                        novaRole === "superadmin_auditor" ||
                        novaRole === "cliente_degustacao"
                      ) {
                        toast.success(
                          "Perfil Degustação: Cliente no Plano Master liberado com dados fictícios e expiração em 24h.",
                        );
                      } else if (novaRole === "operador") {
                        toast.success("Perfil Operador: módulos pertinentes pré-selecionados.");
                      } else if (novaRole === "supervisor") {
                        toast.success(
                          "Perfil Supervisor: defina se terá acesso a veículos ou exclusivamente a vigilantes.",
                        );
                        setModulos(obterModulosPadraoPorPerfil("supervisor", tipoSupervisor));
                      } else if (novaRole === "cliente") {
                        toast.success("Perfil Cliente Titular selecionado.");
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-orange-500 focus:outline-none disabled:opacity-80"
                  >
                    {isSuperAdm ? (
                      <option value="superadmin">SuperADM (Governança e Infraestrutura)</option>
                    ) : (
                      <>
                        <option value="operador">Operador de Monitoramento</option>
                        <option value="supervisor">Supervisor Operacional</option>
                        <option value="vigilante">Vigilante (Rondas e Escala Tática)</option>
                        <option value="financeiro">
                          Financeiro (Gestão Financeira e Cobrança)
                        </option>
                        <option value="adm">Administrador Geral</option>
                        <option value="instalador">Instalador Técnico (Apenas Instalação)</option>
                        <option value="cliente">Cliente (Titular)</option>
                        <option value="cliente_degustacao">
                          Cliente Degustação Plano Master (Expira em 24h)
                        </option>
                        <option value="superadmin_auditor">
                          S.adm Auditor (Consulta e Auditoria)
                        </option>
                      </>
                    )}
                  </select>
                  {isSuperAdm ? (
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Perfil pré-setado como SuperADM (Blindado contra regressão de privilégio).
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 block">
                      Clientes e planos comerciais são gerenciados exclusivamente na seção Clientes
                      e Planos.
                    </span>
                  )}
                </div>

                {role === "supervisor" && (
                  <div className="sm:col-span-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-orange-500" />
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Escopo de Acesso do Supervisor *
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Defina se o supervisor terá acesso amplo (veículos e vigilantes) ou se será dedicado exclusivamente à supervisão de postos fixos e vigilantes físicos.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTipoSupervisor("geral");
                          setAcessoVeiculos(true);
                          setModulos(obterModulosPadraoPorPerfil("supervisor", "geral"));
                          toast.info("Supervisor Geral selecionado: acesso liberado a Veículos e Vigilantes.");
                        }}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 ${
                          tipoSupervisor === "geral" && acessoVeiculos
                            ? "bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400 font-bold shadow-sm"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            🚗 Supervisor Geral (Com Veículos)
                          </span>
                          {tipoSupervisor === "geral" && acessoVeiculos && (
                            <Check className="h-3.5 w-3.5 text-orange-500" />
                          )}
                        </div>
                        <span className="text-[10px] opacity-80">
                          Acesso completo: frota rastreada, mapa ao vivo, rotas, abastecimento, escalas e postos de vigilantes.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTipoSupervisor("vigilante");
                          setAcessoVeiculos(false);
                          setModulos(obterModulosPadraoPorPerfil("supervisor", "vigilante"));
                          toast.info("Supervisor de Vigilante selecionado: foco estrito em Postos Fixos e Rondas.");
                        }}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-1.5 ${
                          tipoSupervisor === "vigilante" || !acessoVeiculos
                            ? "bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-sm"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            🛡️ Somente Supervisor de Vigilante
                          </span>
                          {(tipoSupervisor === "vigilante" || !acessoVeiculos) && (
                            <Check className="h-3.5 w-3.5 text-blue-500" />
                          )}
                        </div>
                        <span className="text-[10px] opacity-80">
                          Sem acesso aos veículos. Acesso focado em postos fixos, mapeamento GPS de rondas, escalas e equipe de vigilantes.
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {role === "instalador" ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Valor SEM Bloqueador (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={(Number(valorSemBloqueador) || 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          onChange={(e) => {
                            const apenasDigitos = e.target.value.replace(/\D/g, "");
                            setValorSemBloqueador(
                              apenasDigitos ? parseInt(apenasDigitos, 10) / 100 : 0,
                            );
                          }}
                          placeholder="0,00"
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Repasse padrão para instalação simples de rastreador.
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Valor COM Bloqueador (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={(Number(valorComBloqueador) || 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          onChange={(e) => {
                            const apenasDigitos = e.target.value.replace(/\D/g, "");
                            setValorComBloqueador(
                              apenasDigitos ? parseInt(apenasDigitos, 10) / 100 : 0,
                            );
                          }}
                          placeholder="0,00"
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Repasse técnico para instalação de rastreador + relé de bloqueio.
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chave PIX do Instalador
                      </label>
                      <input
                        type="text"
                        value={chavePix}
                        onChange={(e) => setChavePix(e.target.value)}
                        placeholder="CPF, E-mail, Celular ou Chave Aleatória"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono focus:border-orange-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Utilizada na geração automática de QR Code PIX (individual e em lote).
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Status da Conta
                      </label>
                      <div className="flex items-center gap-3 pt-1.5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={ativo}
                            onChange={(e) => setAtivo(e.target.checked)}
                            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Conta Ativa e Habilitada
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Endereço da Oficina / Ponto de Atendimento do Instalador *
                      </label>
                      <input
                        type="text"
                        required
                        value={enderecoInstalacao}
                        onChange={(e) => setEnderecoInstalacao(e.target.value)}
                        placeholder="Ex: Av. Brasil, 1500 - Centro, Rio de Janeiro - RJ"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-orange-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Local físico exibido para o cliente no agendamento para levar o veículo para
                        instalação.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Status da Conta
                    </label>
                    {isSuperAdm ? (
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-bold">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-500" />
                        <span>Conta Ativa Permanente (Blindagem Anti-Desativação)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 pt-1.5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={ativo}
                            onChange={(e) => setAtivo(e.target.checked)}
                            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Conta Ativa e Habilitada
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Módulos Concedidos */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                {role === "instalador" && !isEdicao && (
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-800 dark:text-sky-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <Link2 className="h-5 w-5 text-sky-500 shrink-0" />
                      <div>
                        <span className="font-bold">
                          Prefere que o instalador preencha os próprios dados?
                        </span>
                        <p className="text-[11px] text-sky-700/90 dark:text-sky-300/90">
                          Gere um link seguro de uso único para envio ao instalador. A conta será
                          criada obrigatoriamente inativa e aguardará sua habilitação.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalConviteAberto(true)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 transition shadow-sm"
                    >
                      <Link2 className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>Gerar Link de Convite</span>
                    </button>
                  </div>
                )}

                {role === "instalador" && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5 mb-2">
                    <ShieldCheck className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <span className="font-bold">Acesso Estrito de Instalador Técnico:</span>
                      <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                        O instalador tem acesso exclusivo e restrito ao módulo de Instalações
                        Técnicas. Demais telas administrativas e de rastreamento são bloqueadas.
                      </p>
                    </div>
                  </div>
                )}

                {role === "financeiro" && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 mb-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="font-bold">Acesso ao Setor Financeiro:</span>
                      <p className="text-[11px] text-emerald-700/90 dark:text-emerald-300/90">
                        O perfil Financeiro possui acesso canônico a fluxo de caixa, DRE,
                        mensalidades, cobrança, propostas comerciais, contratos de clientes,
                        repasses, abastecimento com notas fiscais, manutenção preventiva e controle
                        de estoque. Os módulos selecionados prevalecerão integralmente.
                      </p>
                    </div>
                  </div>
                )}

                {(role === "superadmin" || role === "adm") && (
                  <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-800 dark:text-orange-300 text-xs flex items-center gap-2.5 mb-2">
                    <ShieldCheck className="h-5 w-5 text-orange-500 shrink-0" />
                    <div>
                      <span className="font-bold">Acesso Total de Administrador:</span>
                      <p className="text-[11px] text-orange-700/90 dark:text-orange-300/90">
                        Todos os {MODULOS_SISTEMA.length} módulos do sistema são liberados e
                        ativados automaticamente com acesso irrestrito.
                      </p>
                    </div>
                  </div>
                )}

                {(role === "superadmin_auditor" || role === "cliente_degustacao") && (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-800 dark:text-purple-300 text-xs flex items-center gap-2.5 mb-2">
                    <ShieldCheck className="h-5 w-5 text-purple-500 shrink-0" />
                    <div>
                      <span className="font-bold">
                        Acesso Degustação Plano Master (Cliente Fictício · Expira em 24h):
                      </span>
                      <p className="text-[11px] text-purple-700/90 dark:text-purple-300/90">
                        Permite ao cliente experimentar todas as funcionalidades do Plano Master de
                        Cliente (mapa 3D, rotas, frota, manutenção, abastecimento e motoristas) com
                        dados fictícios isolados em sandbox, sem alterar o banco de dados de
                        produção e sem acesso a dados administrativos internos.
                      </p>
                    </div>
                  </div>
                )}

                {role !== "instalador" && (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-orange-500" />
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Módulos de Navegação Permitidos
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={selecionarTodosModulos}
                          className="text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                        >
                          Marcar Todos
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <button
                          type="button"
                          onClick={limparModulos}
                          className="text-slate-500 hover:underline font-semibold"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {/* Atalhos de Pacotes Fechados */}
                    <div className="grid grid-cols-3 gap-2 py-1">
                      <button
                        type="button"
                        onClick={() => aplicarPacote("basico")}
                        className="px-2.5 py-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 text-[11px] font-bold hover:bg-orange-500/20 transition"
                      >
                        Pacote Básico
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarPacote("pro")}
                        className="px-2.5 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[11px] font-bold hover:bg-sky-500/20 transition"
                      >
                        Pacote Pro
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarPacote("master")}
                        className="px-2.5 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[11px] font-bold hover:bg-purple-500/20 transition"
                      >
                        Pacote Master
                      </button>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 sm:max-h-72 overflow-y-auto p-1 border border-slate-100 dark:border-slate-800/80 rounded-2xl">
                  {MODULOS_SISTEMA.filter((mod) => {
                    if (
                      role === "cliente" ||
                      role === "superadmin_auditor" ||
                      role === "cliente_degustacao"
                    ) {
                      return MODULOS_CLIENTE_PLANO_MASTER.includes(mod.id);
                    }
                    return true;
                  }).map((mod) => {
                    const ativoMod = modulos.includes(mod.id);
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        disabled={isSuperAdm && role === "superadmin"}
                        onClick={() => toggleModulo(mod.id)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition flex items-start justify-between gap-2 ${
                          ativoMod
                            ? "bg-orange-500/10 border-orange-500/40 text-orange-700 dark:text-orange-300 font-semibold"
                            : "bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold truncate">{mod.nome}</div>
                          <div className="text-[10px] opacity-70 truncate">{mod.desc}</div>
                        </div>
                        <div
                          className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                            ativoMod
                              ? "bg-orange-500 border-orange-500 text-slate-950"
                              : "border-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {ativoMod && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                {salvando ? "Salvando..." : isEdicao ? "Salvar Alterações" : "Concluir Cadastro"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <ModalConviteInstalador
        aberto={modalConviteAberto}
        onFechar={() => setModalConviteAberto(false)}
      />
    </ModalPortal>
  );
}
