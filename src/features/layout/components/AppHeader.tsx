import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Menu,
  LogOut,
  ShieldCheck,
  Wrench,
  Palette,
  BookOpen,
  Key,
  Car,
  MessageSquare,
  Building,
  Briefcase,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { verificarExpiracaoDegustacao } from "@/features/demonstracao/services/degustacaoMasterService";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { ModoPerfilEmulado } from "@/features/auth/types";
import {
  MODOS_PERFIS_DISPONIVEIS,
  MODOS_PERFIS_EMULAVEIS,
  obterRotuloModoPerfil,
} from "@/features/auth/constants/modosPerfis";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { MobileDrawer } from "./MobileDrawer";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { ManualDrawer } from "@/features/manual/components/ManualDrawer";
import { ModalClienteSolicitarVeiculo } from "@/features/clientes/components/ModalClienteSolicitarVeiculo";
import { ModalEnvioRapidoWhatsapp } from "@/features/chat/components/ModalEnvioRapidoWhatsapp";

export function AppHeader() {
  const {
    session,
    sessaoOriginal,
    logout,
    clienteEmulado,
    perfilEmulado,
    emularModoPerfil,
    desfazerEmulacao,
  } = useAuth();
  const isSuperAdmReal = Boolean(sessaoOriginal?.isSuperAdmin || session?.isSuperAdmin);
  const modoAtivo: ModoPerfilEmulado = perfilEmulado || (clienteEmulado ? "cliente" : "superadmin");
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [modalVeiculoAberto, setModalVeiculoAberto] = useState(false);
  const [modalWhatsappAberto, setModalWhatsappAberto] = useState(false);
  const [tempoDegustacao, setTempoDegustacao] = useState<string>("");

  useEffect(() => {
    const handleToggle = () => setMenuMobileAberto((prev) => !prev);
    window.addEventListener("hunter_toggle_menu_mobile", handleToggle);
    return () => window.removeEventListener("hunter_toggle_menu_mobile", handleToggle);
  }, []);

  useEffect(() => {
    if (!session) return;
    const isDeg = Boolean(session.isDegustacao || session.role === "superadmin_auditor");
    if (!isDeg) return;

    const atualizar = () => {
      const info = verificarExpiracaoDegustacao(
        session.userId,
        session.email,
        session.degustacaoPrimeiroAcessoEm,
        {
          expiraEmIso: session.degustacaoExpiraEm,
          revalidadaEmIso: session.degustacaoRevalidadaEm,
        },
      );
      if (info.expirado) {
        logout();
        toast.error("Período de degustação de 24 horas encerrado.");
      } else {
        setTempoDegustacao(info.textoFormatado);
      }
    };

    atualizar();
    const interval = setInterval(atualizar, 30000);
    return () => clearInterval(interval);
  }, [session, logout]);

  if (!session) return null;

  return (
    <>
      <header
        className="sticky top-0 z-50 w-full px-2.5 sm:px-6 select-none transition-colors duration-200 bg-[#eaf0f8] dark:bg-[#0a0a0c] border-b border-slate-300/70 dark:border-slate-800/80 shadow-[0_4px_16px_rgba(195,207,226,0.35)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.85)]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          paddingBottom: "0.25rem",
        }}
      >
        {/* Linha adicional de respiro superior: isolamento contra blur de status bar no iOS */}
        <div className="w-full h-0.5 sm:h-1" aria-hidden="true" />
        <div className="h-16 w-full flex items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink h-full">
            <button
              onClick={() => setMenuMobileAberto(true)}
              className="p-2 sm:px-3 sm:py-2 min-h-[42px] min-w-[42px] rounded-2xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white/80 dark:bg-slate-900/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-800 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0 active:scale-95"
              aria-label="Abrir menu de navegação vertical"
              title="Abrir Menu de Navegação Vertical"
            >
              <Menu className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <span className="text-xs font-bold hidden sm:inline">Menu</span>
            </button>

            <Link
              to="/inicio"
              className="flex items-center gap-2 sm:gap-3 group min-w-0 h-full py-0.5"
              title="Voltar ao Painel Geral"
            >
              <img
                src="/logo-emblema.png"
                alt={APP_NOME}
                fetchPriority="high"
                decoding="async"
                className="h-[56px] w-[56px] sm:h-[62px] sm:w-[62px] object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-200 shrink-0"
              />
              <div className="min-w-0 flex flex-col justify-center">
                <span className="font-black tracking-wider text-xs min-[360px]:text-sm sm:text-base md:text-lg text-slate-900 dark:text-slate-100 uppercase whitespace-nowrap leading-tight truncate">
                  {APP_NOME}
                </span>
                <div className="flex items-center gap-1.5 leading-none mt-0.5">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.reload();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        window.location.reload();
                      }
                    }}
                    className="inline-block px-1.5 py-0.5 rounded-lg text-[9px] min-[360px]:text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 cursor-pointer transition-colors shrink-0"
                    title="Toque para recarregar o sistema"
                  >
                    v{APP_VERSION_NUMERO}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden lg:inline truncate">
                    Segurança e Rastreamento
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Centro: Status do WebSocket Realtime (visível em telas amplas lg:) */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-950/90 border border-slate-300/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 shadow-xs shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Telemetria Realtime
            </span>
          </div>

          {/* Lado Direito: Perfil + Chat + Tema + Senha + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Badges de Perfil e Plano com Distinção Máxima (telas md:) */}
            <div className="hidden md:flex items-center gap-1.5">
              {session.isDegustacao || session.role === "superadmin_auditor" ? (
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 uppercase tracking-wider shadow-xs animate-pulse"
                  title="Degustação do Plano Master de Cliente com 24 horas de acesso"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  <span>
                    Degustação Plano Master {tempoDegustacao ? `· ${tempoDegustacao}` : ""}
                  </span>
                </span>
              ) : session.isAdmin ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 uppercase tracking-wider shadow-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                  <span>Administrador</span>
                </span>
              ) : session.isFinanceiro ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase tracking-wider shadow-xs">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Financeiro</span>
                </span>
              ) : session.isInstalador ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider shadow-xs">
                  <Wrench className="h-3.5 w-3.5 text-amber-500" />
                  <span>Instalador Técnico</span>
                </span>
              ) : session.isRevendedor ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider shadow-xs">
                  <Building className="h-3.5 w-3.5 text-amber-500" />
                  <span>Revendedor</span>
                </span>
              ) : session.isVendedor ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 uppercase tracking-wider shadow-xs">
                  <Briefcase className="h-3.5 w-3.5 text-blue-500" />
                  <span>Vendedor</span>
                </span>
              ) : (
                <>
                  <span className="px-2.5 py-1 text-xs rounded-lg font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 capitalize">
                    {session.role}
                  </span>
                  {session.isCliente && session.plano && (
                    <span className="px-2.5 py-1 text-xs rounded-lg font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 capitalize">
                      Plano {session.plano}
                    </span>
                  )}
                  {session.isCliente && (
                    <button
                      type="button"
                      onClick={() => setModalVeiculoAberto(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-xl font-bold bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition shadow-xs"
                      title="Adicionar novo veículo para rastreamento"
                    >
                      <Car className="h-3.5 w-3.5" />
                      <span>+ Veículo</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Atalho Canônico: MSG WhatsApp Direta (Fly.io Gateway) */}
            {(session?.isAdmin ||
              session?.isOperador ||
              session?.isFinanceiro ||
              session?.isRevendedor ||
              session?.isVendedor) && (
              <button
                type="button"
                onClick={() => setModalWhatsappAberto(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[40px] rounded-xl text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-100 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition shadow-2xs active:scale-95 cursor-pointer font-bold text-xs shrink-0"
                title="Disparo Direto de Mensagem WhatsApp para Clientes, Motoristas e Usuários"
                aria-label="MSG WhatsApp"
              >
                <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">MSG WhatsApp</span>
              </button>
            )}

            {/* Atalho para Temas dos Cards e Módulos (No mobile já está no drawer) */}
            {!session.isCliente && !session.isInstalador && !session.isMotorista && (
              <Link
                to="/configuracao/temas"
                className="hidden sm:flex p-2 min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-500 hover:text-orange-500 hover:bg-orange-500/10 border border-slate-200 dark:border-slate-800 transition shadow-2xs active:scale-95"
                title="Personalizar Temas dos Cards e Módulos"
                aria-label="Temas dos Cards e Módulos"
              >
                <Palette className="h-4 w-4" />
              </Link>
            )}

            {/* Atalho para o Manual do Usuário Modular (No mobile já está no drawer) */}
            <button
              type="button"
              onClick={() => setModalManualAberto(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[40px] rounded-xl text-slate-700 dark:text-slate-200 hover:text-orange-600 dark:hover:text-orange-400 bg-slate-200/60 dark:bg-slate-800/80 hover:bg-orange-500/10 border border-slate-300/80 dark:border-slate-700 transition cursor-pointer shadow-2xs active:scale-95"
              title="Abrir Manual do Usuário Modular"
              aria-label="Manual do Usuário"
            >
              <BookOpen className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-xs font-bold hidden xl:inline">Manual</span>
            </button>

            {/* Seletor de Tema Visual (Claro Neumorphic / Escuro Canônico) */}
            <ThemeToggle />

            {/* Botão Sair com Destaque e Imune a Corte de Viewport */}
            <button
              onClick={() => logout()}
              className="shrink-0 flex items-center justify-center p-2 min-h-[40px] min-w-[40px] rounded-xl text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition shadow-2xs cursor-pointer active:scale-95"
              title="Encerrar Sessão com Segurança"
              aria-label="Sair da Conta"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Banner Tático de Emulação do Modo (Todos os Perfis) */}
      {(clienteEmulado || (isSuperAdmReal && modoAtivo !== "superadmin")) && (
        <div className="w-full bg-amber-100 dark:bg-[#1c180c] border-b border-amber-300 dark:border-amber-700/60 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200 sticky top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-40 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="font-extrabold uppercase tracking-wider text-[10px] bg-amber-500/25 px-1.5 py-0.5 rounded border border-amber-500/40 shrink-0">
              Modo {obterRotuloModoPerfil(modoAtivo)} Ativo
            </span>
            {clienteEmulado ? (
              <span className="truncate text-xs">
                Emulando Cliente: <strong className="font-black">{clienteEmulado.nome}</strong>
              </span>
            ) : (
              <span className="truncate text-xs opacity-90 hidden sm:inline">
                Visão restrita ao perfil emulado
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={modoAtivo}
              onChange={(e) => {
                const novoModo = e.target.value as ModoPerfilEmulado;
                emularModoPerfil(novoModo);
                if (novoModo === "superadmin") {
                  toast.success("Visão SuperADM global restaurada.");
                } else {
                  toast.success(`Modo ${obterRotuloModoPerfil(novoModo)} ativado.`);
                }
              }}
              className="text-[11px] font-bold px-2 py-1 rounded-lg border border-amber-500/40 bg-white/90 dark:bg-slate-900 text-amber-950 dark:text-amber-100 outline-none cursor-pointer shadow-2xs"
              title="Trocar perfil emulado na lista suspensa"
            >
              {MODOS_PERFIS_EMULAVEIS.map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  {m.rotulo}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={desfazerEmulacao}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-[11px] shadow-xs transition flex items-center gap-1 cursor-pointer"
              title="Voltar ao Modo Super Administrador"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Voltar para SuperADM</span>
            </button>
          </div>
        </div>
      )}

      {/* Drawer Mobile acionado pelo hambúrguer */}
      <MobileDrawer
        aberto={menuMobileAberto}
        onFechar={() => setMenuMobileAberto(false)}
        onAbrirManual={() => {
          setMenuMobileAberto(false);
          setModalManualAberto(true);
        }}
        onAbrirWhatsapp={
          session?.isAdmin ||
          session?.isOperador ||
          session?.isFinanceiro ||
          session?.isRevendedor ||
          session?.isVendedor
            ? () => {
                setMenuMobileAberto(false);
                setModalWhatsappAberto(true);
              }
            : undefined
        }
      />

      {/* Drawer Canônico do Manual do Usuário Modular */}
      <ManualDrawer aberto={modalManualAberto} onFechar={() => setModalManualAberto(false)} />

      {/* Modal de Solicitação de Novo Veículo pelo Cliente */}
      <ModalClienteSolicitarVeiculo
        aberto={modalVeiculoAberto}
        onFechar={() => setModalVeiculoAberto(false)}
      />

      {/* Modal de Disparo Direto de Mensagem WhatsApp com Catálogo de Contatos */}
      {(session?.isAdmin ||
        session?.isOperador ||
        session?.isFinanceiro ||
        session?.isRevendedor ||
        session?.isVendedor) && (
        <ModalEnvioRapidoWhatsapp
          aberto={modalWhatsappAberto}
          onClose={() => setModalWhatsappAberto(false)}
        />
      )}
    </>
  );
}
