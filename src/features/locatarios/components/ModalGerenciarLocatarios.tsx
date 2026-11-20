import React, { useState, useEffect } from "react";
import {
  X,
  UserPlus,
  Users,
  Copy,
  Check,
  Share2,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Car,
  ChevronRight,
  ExternalLink,
  Edit2,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import type { VeiculoGps } from "@/features/monitor-gps/types";
import type { LocatarioCliente, DadosCadastroLocatario } from "../types";
import {
  listarLocatarios,
  cadastrarOuConvidarLocatario,
  atualizarLocatario,
  bloquearDesbloquearLocatario,
  resetarSenhaLocatario,
} from "../services/locatarioService";

interface ModalGerenciarLocatariosProps {
  aberto: boolean;
  onFechar: () => void;
  veiculosCliente: VeiculoGps[];
  clienteId?: string;
}

export const ModalGerenciarLocatarios: React.FC<ModalGerenciarLocatariosProps> = ({
  aberto,
  onFechar,
  veiculosCliente,
  clienteId,
}) => {
  const [abaAtiva, setAbaAtiva] = useState<"lista" | "novo">("lista");
  const [locatarios, setLocatarios] = useState<LocatarioCliente[]>([]);
  const [carregando, setCarregando] = useState(false);

  // Form de Novo Convite / Edição
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [veiculosSelecionados, setVeiculosSelecionados] = useState<string[]>([]);
  const [podeBloquear, setPodeBloquear] = useState(false);
  const [podeDesbloquear, setPodeDesbloquear] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Link gerado
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Modal de Senha Resetada
  const [senhaResetadaInfo, setSenhaResetadaInfo] = useState<{
    nome: string;
    senha?: string;
  } | null>(null);

  // Carrega a lista de locatários vinculados
  const carregarDados = async () => {
    setCarregando(true);
    try {
      const lista = await listarLocatarios(clienteId);
      setLocatarios(lista);
    } catch (err) {
      console.error("Erro ao carregar locatários:", err);
      toast.error("Não foi possível carregar a lista de usuários.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (aberto) {
      carregarDados();
      setLinkGerado(null);
      setEditandoId(null);
    }
  }, [aberto, clienteId]);

  if (!aberto) return null;

  // Alterna seleção de um veículo
  const toggleVeiculo = (vId: string) => {
    setVeiculosSelecionados((prev) =>
      prev.includes(vId) ? prev.filter((id) => id !== vId) : [...prev, vId],
    );
  };

  // Selecionar todos os veículos
  const selecionarTodosVeiculos = () => {
    if (veiculosSelecionados.length === veiculosCliente.length) {
      setVeiculosSelecionados([]);
    } else {
      setVeiculosSelecionados(veiculosCliente.map((v) => v.id));
    }
  };

  // Iniciar edição de um usuário existente
  const iniciarEdicao = (loc: LocatarioCliente) => {
    setEditandoId(loc.id);
    setNome(loc.nome || "");
    setEmail(loc.email || "");
    setTelefone(loc.telefone || "");
    setVeiculosSelecionados(loc.veiculos_permitidos || []);
    setPodeBloquear(Boolean(loc.pode_bloquear));
    setPodeDesbloquear(Boolean(loc.pode_desbloquear));
    setAbaAtiva("novo");
  };

  // Limpar formulário de novo convite
  const limparFormulario = () => {
    setEditandoId(null);
    setNome("");
    setEmail("");
    setTelefone("");
    setVeiculosSelecionados([]);
    setPodeBloquear(false);
    setPodeDesbloquear(false);
    setLinkGerado(null);
  };

  // Submissão do convite ou atualização
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (veiculosSelecionados.length === 0) {
      toast.error("Selecione ao menos um veículo para o usuário.");
      return;
    }

    setSalvando(true);
    try {
      if (editandoId) {
        // Atualização de usuário existente
        const res = await atualizarLocatario(editandoId, {
          nome: nome.trim() || undefined,
          telefone: telefone.trim() || undefined,
          veiculos_permitidos: veiculosSelecionados,
          pode_bloquear: podeBloquear,
          pode_desbloquear: podeDesbloquear,
        });

        if (res.success) {
          toast.success("Dados e permissões do usuário atualizados com sucesso!");
          limparFormulario();
          setAbaAtiva("lista");
          carregarDados();
        } else {
          toast.error(res.message || "Erro ao atualizar usuário.");
        }
      } else {
        // Criação de novo convite
        const payload: DadosCadastroLocatario = {
          nome: nome.trim() || "Usuário Convidado",
          email: email.trim(),
          telefone: telefone.trim() || undefined,
          veiculos_permitidos: veiculosSelecionados,
          pode_bloquear: podeBloquear,
          pode_desbloquear: podeDesbloquear,
        };

        const res = await cadastrarOuConvidarLocatario(payload, clienteId);

        if (res.success) {
          const urlFinal =
            res.url_convite ||
            res.link ||
            `${window.location.origin}/cadastro-locatario?token=${res.token}`;
          setLinkGerado(urlFinal);
          toast.success("Link de cadastro gerado com sucesso!");
          carregarDados();
        } else {
          toast.error(res.message || "Erro ao gerar convite.");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha na operação.");
    } finally {
      setSalvando(false);
    }
  };

  // Copiar link de convite
  const handleCopiarLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiado(true);
    toast.success("Link de cadastro copiado para a área de transferência!");
    setTimeout(() => setCopiado(false), 2500);
  };

  // Compartilhar no WhatsApp
  const handleCompartilharWhatsapp = (url: string) => {
    const texto = encodeURIComponent(
      `Olá! Aqui está o link seguro para você se cadastrar e acessar o rastreamento do(s) veículo(s):\n\n${url}\n\nAcesso criptografado GD Segurança.`,
    );
    window.open(`https://api.whatsapp.com/send?text=${texto}`, "_blank");
  };

  // Alternar Bloqueio de Acesso
  const handleBloquearDesbloquear = async (loc: LocatarioCliente) => {
    const novoStatus = !loc.ativo;
    try {
      const res = await bloquearDesbloquearLocatario(loc.id, novoStatus);
      if (res.success) {
        toast.success(
          novoStatus
            ? `Acesso do usuário ${loc.nome} desbloqueado.`
            : `Acesso do usuário ${loc.nome} bloqueado temporariamente.`,
        );
        carregarDados();
      } else {
        toast.error(res.message || "Erro ao alterar status.");
      }
    } catch {
      toast.error("Falha ao comunicar com o servidor.");
    }
  };

  // Reset de Senha
  const handleResetarSenha = async (loc: LocatarioCliente) => {
    if (!loc.user_id) {
      toast.error("O usuário ainda não concluiu o primeiro acesso pelo convite.");
      return;
    }

    const confirma = window.confirm(
      `Deseja realmente redefinir a senha do usuário ${loc.nome}? Uma nova senha temporária será gerada.`,
    );
    if (!confirma) return;

    try {
      const res = await resetarSenhaLocatario(loc.id);
      if (res.success) {
        setSenhaResetadaInfo({
          nome: loc.nome,
          senha: res.novaSenha,
        });
        toast.success("Senha redefinida com sucesso!");
      } else {
        toast.error(res.message || "Erro ao resetar senha.");
      }
    } catch {
      toast.error("Falha ao redefinir senha do usuário.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Gestão de Usuários
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastre e subordine usuários aos seus veículos com permissões granulares
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => {
              setAbaAtiva("lista");
              limparFormulario();
            }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === "lista"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários Cadastrados ({locatarios.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAbaAtiva("novo");
              limparFormulario();
            }}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === "novo" && !editandoId
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>{editandoId ? "Editar Usuário" : "Novo Convite de Usuário"}</span>
          </button>
        </div>

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* ABA 1: LISTAGEM DE LOCATÁRIOS */}
          {abaAtiva === "lista" && (
            <div className="space-y-3">
              {carregando ? (
                <div className="space-y-3 py-6 animate-pulse">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800"
                    />
                  ))}
                </div>
              ) : locatarios.length === 0 ? (
                <div className="rounded-2xl p-8 text-center bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Nenhum usuário cadastrado
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Gere um link de convite para permitir que o usuário se cadastre e acompanhe os
                    veículos selecionados.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      limparFormulario();
                      setAbaAtiva("novo");
                    }}
                    className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                  >
                    Gerar Primeiro Convite
                  </button>
                </div>
              ) : (
                locatarios.map((loc) => {
                  const veiculosNomes = veiculosCliente
                    .filter((v) => (loc.veiculos_permitidos || []).includes(v.id))
                    .map((v) => v.placa);

                  return (
                    <div
                      key={loc.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        loc.ativo
                          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-950 border-slate-200/80 dark:border-slate-800/80 opacity-75"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                              {loc.nome}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                loc.ativo
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {loc.ativo ? "Acesso Ativo" : "Acesso Bloqueado"}
                            </span>
                            {!loc.user_id && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Aguardando Auto-Cadastro
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                            {loc.email && <span>{loc.email}</span>}
                            {loc.telefone && <span>{loc.telefone}</span>}
                          </div>

                          {/* Veículos Autorizados */}
                          <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300">
                            <Car className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span className="font-semibold">
                              {veiculosNomes.length > 0
                                ? `${veiculosNomes.length} veículo(s): ${veiculosNomes.join(", ")}`
                                : `${(loc.veiculos_permitidos || []).length} veículo(s) atribuído(s)`}
                            </span>
                          </div>

                          {/* Permissões Granulares Independentes */}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                loc.pode_bloquear
                                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              <Lock className="w-2.5 h-2.5" />
                              Bloqueio: {loc.pode_bloquear ? "Autorizado" : "Proibido"}
                            </span>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                loc.pode_desbloquear
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              <Unlock className="w-2.5 h-2.5" />
                              Desbloqueio: {loc.pode_desbloquear ? "Autorizado" : "Proibido"}
                            </span>
                          </div>
                        </div>

                        {/* Ações do Locador */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {/* Botão de Editar */}
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(loc)}
                            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                            title="Editar dados e veículos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Botão de Bloquear / Desbloquear Acesso */}
                          <button
                            type="button"
                            onClick={() => handleBloquearDesbloquear(loc)}
                            className={`p-2 rounded-xl border transition cursor-pointer ${
                              loc.ativo
                                ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/40"
                                : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40"
                            }`}
                            title={
                              loc.ativo
                                ? "Bloquear acesso do usuário"
                                : "Desbloquear acesso do usuário"
                            }
                          >
                            {loc.ativo ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Botão de Resetar Senha */}
                          {loc.user_id && (
                            <button
                              type="button"
                              onClick={() => handleResetarSenha(loc)}
                              className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 transition cursor-pointer"
                              title="Redefinir senha do usuário"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ABA 2: FORMULÁRIO DE CONVITE OU EDIÇÃO */}
          {abaAtiva === "novo" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {linkGerado ? (
                <div className="rounded-2xl p-5 bg-emerald-500/10 border border-emerald-500/25 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5" />
                    <span>Link de Cadastro do Usuário Gerado!</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Copie ou envie o link abaixo para o usuário concluir o cadastro pelo celular ou
                    computador:
                  </p>

                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-emerald-500/30">
                    <input
                      type="text"
                      readOnly
                      value={linkGerado}
                      className="flex-1 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopiarLink(linkGerado)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiado ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiado ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCompartilharWhatsapp(linkGerado)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Compartilhar no WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={limparFormulario}
                      className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      Gerar Outro Convite
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Dados Básicos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nome do Usuário
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: João da Silva"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        WhatsApp / Celular
                      </label>
                      <input
                        type="text"
                        placeholder="(99) 99999-9999"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>
                  </div>

                  {!editandoId && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Email (Opcional - usuário pode preencher no cadastro)
                      </label>
                      <input
                        type="email"
                        placeholder="usuario@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>
                  )}

                  {/* Seleção de Veículos Permitidos */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-orange-500" />
                        <span>Veículos da sua base autorizados para este usuário *</span>
                      </label>

                      <button
                        type="button"
                        onClick={selecionarTodosVeiculos}
                        className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                      >
                        {veiculosSelecionados.length === veiculosCliente.length
                          ? "Desmarcar Todos"
                          : "Selecionar Todos"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40">
                      {veiculosCliente.map((v) => {
                        const checked = veiculosSelecionados.includes(v.id);
                        return (
                          <label
                            key={v.id}
                            className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                              checked
                                ? "bg-orange-500/10 border-orange-500/40 text-slate-900 dark:text-slate-100 font-bold"
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVeiculo(v.id)}
                              className="rounded text-orange-600 focus:ring-orange-500 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-mono uppercase font-black">{v.placa}</span>
                              <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {v.marca_modelo}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Permissões Granulares Independentes: Bloqueio e Desbloqueio */}
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      Permissões de Comando Operacional (Independentes)
                    </span>

                    {/* Switch 1: Bloqueio */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            Permitir Bloquear Veículo(s)
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Usuário poderá acionar corte de combustível e bloqueio nos veículos
                            autorizados
                          </span>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={podeBloquear}
                          onChange={(e) => setPodeBloquear(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                      </label>
                    </div>

                    {/* Switch 2: Desbloqueio */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                          <Unlock className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                            Permitir Desbloquear Veículo(s)
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Usuário poderá acionar liberação e restabelecimento do motor
                          </span>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={podeDesbloquear}
                          onChange={(e) => setPodeDesbloquear(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Botão de Envio */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        limparFormulario();
                        setAbaAtiva("lista");
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={salvando}
                      className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {salvando ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : editandoId ? (
                        <span>Salvar Alterações</span>
                      ) : (
                        <span>Gerar Link de Cadastro</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>

        {/* Modal de Senha Resetada */}
        {senhaResetadaInfo && (
          <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <KeyRound className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Nova Senha de {senhaResetadaInfo.nome}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Copie a senha abaixo e envie ao usuário:
              </p>
              <div className="p-3 bg-slate-100 dark:bg-slate-950 rounded-2xl font-mono text-base font-black tracking-widest text-slate-800 dark:text-slate-200 select-all border border-slate-300 dark:border-slate-700">
                {senhaResetadaInfo.senha}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(senhaResetadaInfo.senha || "");
                  toast.success("Senha copiada!");
                  setSenhaResetadaInfo(null);
                }}
                className="w-full py-2.5 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition cursor-pointer"
              >
                Copiar Senha e Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
