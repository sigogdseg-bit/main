// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Esteira de Onboarding do Cliente (Linha do Tempo de 6 Etapas)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import {
  CreditCard,
  UserCheck,
  Calendar,
  Wrench,
  FileCheck,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Car,
  MapPin,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  clientePossuiPendenciaInstalacaoOuAtivacao,
  carregarVeiculosDoCliente,
} from "@/features/clientes/services/clienteService";
import { obterEtapasOnboardingCliente } from "@/features/revendedores/services/revendedoresService";
import type { EtapasOnboardingCliente } from "@/features/revendedores/types";

export function OnboardingAcompanhamentoView() {
  const { session } = useAuth();
  const [etapas, setEtapas] = useState<EtapasOnboardingCliente | null>(null);
  const [temPendencia, setTemPendencia] = useState<boolean | null>(null);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  const isGestao = Boolean(
    session?.isAdmin || session?.isSuperAdmin || session?.role === "operador",
  );

  useEffect(() => {
    let cancelado = false;

    async function carregarDados() {
      setCarregando(true);
      try {
        if (isGestao) {
          // Perfil de gestão: tela informativa sem esteira simulada
          setCarregando(false);
          return;
        }

        if (session?.isCliente) {
          const pendente = await clientePossuiPendenciaInstalacaoOuAtivacao(
            session.userId,
            session.clienteId,
          );

          if (!cancelado) {
            setTemPendencia(pendente);
          }

          if (session.clienteId) {
            const [etapasRes, veiculosRes] = await Promise.all([
              obterEtapasOnboardingCliente(session.clienteId).catch(() => null),
              carregarVeiculosDoCliente(session.clienteId).catch(() => []),
            ]);

            if (!cancelado) {
              setEtapas(etapasRes);
              setVeiculos(veiculosRes);
            }
          }
        }
      } catch {
        toast.error("Erro ao verificar status de ativação.");
      } finally {
        if (!cancelado) {
          setCarregando(false);
        }
      }
    }

    carregarDados();

    return () => {
      cancelado = true;
    };
  }, [session, isGestao]);

  // Estado de Carregamento
  if (carregando) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          Carregando status de ativação...
        </p>
      </div>
    );
  }

  // 1. Visão de Gestão (Administrador / Operador / SuperADM)
  if (isGestao) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-4">
        {/* Cabeçalho de Governança Administrativa */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Acompanhamento da Ativação
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                Visão Administrativa
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              A esteira de 6 etapas é exclusiva para autoatendimento de clientes com veículos
              pendentes de instalação.
            </p>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-500" />
            <span>Perfil Central / Operação</span>
          </div>
        </div>

        {/* Card Informativo com Redirecionamentos */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Módulo Exclusivo para Clientes em Esteira de Instalação
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Como gestor do sistema, para acompanhar e gerenciar ordens de serviço, atribuição de
                técnicos instaladores, agendamentos e homologação de rastreadores em campo, utilize
                a <strong>Central de Instalações Técnicas</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Link
              to="/instalacao"
              className="p-4 rounded-2xl border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-500/60 transition group flex flex-col justify-between text-left"
            >
              <div>
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                  <Wrench className="h-5 w-5" />
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Instalações Técnicas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Gerenciar ordens de serviço, kits de rastreador e relatórios de campo.
                </p>
              </div>
            </Link>

            <Link
              to="/inicio"
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:border-slate-300 dark:hover:border-slate-700 transition group flex flex-col justify-between text-left"
            >
              <div>
                <div className="flex items-center justify-between text-orange-600 dark:text-orange-400 mb-2">
                  <LayoutDashboard className="h-5 w-5" />
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Painel Geral</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Voltar para o hub principal e módulos operacionais.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Visão de Cliente com Frota 100% Ativa (Sem Pendências de Instalação ou Ativação)
  if (session?.isCliente && !temPendencia) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-4">
        {/* Cabeçalho */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Acompanhamento da Ativação
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                Frota 100% Ativa
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Todos os seus veículos estão homologados e operando normalmente no sistema.
            </p>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Nenhuma Pendência</span>
          </div>
        </div>

        {/* Card Principal de Confirmação Operacional */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="h-16 w-16 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 shadow-xs">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Sua esteira de ativação foi concluída com sucesso!
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Você já possui seus veículos cadastrados, com rastreadores instalados e sinal GPS
                liberado. A tela de acompanhamento passo a passo é reservada para novos veículos que
                aguardam agendamento ou instalação física.
              </p>
            </div>
          </div>

          {/* Lista de Veículos Ativos */}
          {veiculos.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 text-left">
                Veículos Ativos na sua Frota ({veiculos.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {veiculos.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                        <Car className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white block">
                          {v.placa}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {v.marca_modelo}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                      Homologado
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 justify-center sm:justify-start">
            <Link
              to="/monitor-gps"
              className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-orange-600 hover:bg-orange-500 text-white transition flex items-center gap-2 shadow-lg shadow-orange-600/20 cursor-pointer"
            >
              <MapPin className="h-4 w-4" />
              <span>Ver Veículos no Mapa</span>
            </Link>

            <Link
              to="/inicio"
              className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Ir para o Painel Geral</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Visão de Cliente com Pendência Real (Esteira Ativa de 6 Etapas)
  const etapaAtual = etapas?.etapa_atual || 1;

  const listaEtapas = [
    {
      num: 1,
      titulo: "Pagamento da Taxa",
      subtitulo: "Adesão e Ativação",
      descricao:
        etapas?.taxa_paga || (etapas !== null && (etapas?.valor_taxa_instalacao || 0) === 0)
          ? "Taxa de adesão confirmada com sucesso."
          : `Aguardando confirmação do pagamento da taxa de instalação (R$ ${(etapas?.valor_taxa_instalacao || 0).toFixed(2)}).`,
      icone: CreditCard,
      concluida:
        Boolean(etapas?.taxa_paga) ||
        (etapas !== null && (etapas?.valor_taxa_instalacao || 0) === 0),
      ativa: etapaAtual === 1,
    },
    {
      num: 2,
      titulo: "Atribuição do Instalador",
      subtitulo: "Profissional Técnico",
      descricao: etapas?.instalador_nome
        ? `Instalador designado: ${etapas.instalador_nome}${etapas.instalador_telefone ? ` (${etapas.instalador_telefone})` : ""}.`
        : "Nossa equipe está selecionando o instalador credenciado mais próximo para atendê-lo.",
      icone: UserCheck,
      concluida: Boolean(etapas?.instalador_atribuido_id) || etapaAtual > 2,
      ativa: etapaAtual === 2,
    },
    {
      num: 3,
      titulo: "Agendamento da Instalação",
      subtitulo: "Data e Local",
      descricao:
        "Alinhamento da data, horário e local de preferência para instalação física do rastreador.",
      icone: Calendar,
      concluida: etapaAtual > 3,
      ativa: etapaAtual === 3,
    },
    {
      num: 4,
      titulo: "Instalação Concluída",
      subtitulo: "Validação em Campo",
      descricao: etapas?.instalacao_concluida
        ? "Equipamento fixado no veículo e teste elétrico concluído pelo técnico."
        : "Aguardando o instalador finalizar a fixação física do aparelho e checklist.",
      icone: Wrench,
      concluida: Boolean(etapas?.instalacao_concluida) || etapaAtual > 4,
      ativa: etapaAtual === 4,
    },
    {
      num: 5,
      titulo: "Assinatura do Contrato",
      subtitulo: "Validade Jurídica SGD",
      descricao: etapas?.contrato_assinado
        ? "Contrato assinado eletronicamente com selo forense de autenticidade SGD."
        : "Aguardando a sua assinatura digital no contrato de rastreamento e segurança.",
      icone: FileCheck,
      concluida: Boolean(etapas?.contrato_assinado) || etapaAtual > 5,
      ativa: etapaAtual === 5,
    },
    {
      num: 6,
      titulo: "Ativação no Sistema",
      subtitulo: "Homologação Operacional",
      descricao: etapas?.ativacao_operador_concluida
        ? "Sinal GPS homologado pelo operador. Acesso completo liberado!"
        : "Nossos operadores estão realizando a conferência final da telemetria e satélites.",
      icone: ShieldCheck,
      concluida: Boolean(etapas?.ativacao_operador_concluida),
      ativa: etapaAtual === 6,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Linha do Tempo de Ativação
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Etapa {etapaAtual} de 6
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe o passo a passo da ativação do seu rastreador veicular até a liberação do
            acesso completo.
          </p>
        </div>

        {etapas?.ativacao_operador_concluida ? (
          <div className="px-4 py-2 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Acesso Total Liberado</span>
          </div>
        ) : (
          <div className="px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Ativação em Andamento</span>
          </div>
        )}
      </div>

      {/* Stepper Vertical da Linha do Tempo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="space-y-4">
          {listaEtapas.map((etp, idx) => {
            const Icone = etp.icone;
            const isUltimo = idx === listaEtapas.length - 1;

            return (
              <div key={etp.num} className="relative flex items-start gap-4">
                {/* Linha conectora vertical */}
                {!isUltimo && (
                  <div
                    className={`absolute left-5 top-10 bottom-0 w-0.5 -ml-px ${
                      etp.concluida
                        ? "bg-orange-500"
                        : etp.ativa
                          ? "bg-amber-500"
                          : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  />
                )}

                {/* Marcador Numérico / Ícone */}
                <div
                  className={`relative z-10 flex items-center justify-center h-10 w-10 rounded-2xl shrink-0 font-bold text-xs transition ${
                    etp.concluida
                      ? "bg-orange-500 text-slate-950 shadow-md shadow-orange-500/20"
                      : etp.ativa
                        ? "bg-amber-500 text-slate-950 ring-4 ring-amber-500/20 shadow-md shadow-amber-500/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {etp.concluida ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Icone className="h-4 w-4" />
                  )}
                </div>

                {/* Conteúdo da Etapa */}
                <div
                  className={`flex-1 p-4 rounded-2xl border transition ${
                    etp.ativa
                      ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/30"
                      : etp.concluida
                        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        : "bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800/60 opacity-60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-slate-400">
                          Etapa {etp.num}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                          {etp.subtitulo}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                        {etp.titulo}
                      </h3>
                    </div>

                    <div>
                      {etp.concluida ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Concluída</span>
                        </span>
                      ) : etp.ativa ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1 animate-pulse">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Em Andamento</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                          Aguardando
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{etp.descricao}</p>

                  {/* Ação especial na Etapa 5 (Assinatura do Contrato) */}
                  {etp.num === 5 && !etp.concluida && etp.ativa && (
                    <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center justify-between">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                        Seu contrato está pronto para assinatura digital.
                      </p>
                      <Link
                        to="/assinar"
                        className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Assinar Contrato</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Box Informativo de Blindagem do Acesso */}
      {!etapas?.ativacao_operador_concluida && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-4 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-amber-500 shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white block font-bold">
              Segurança e Conformidade GD Rastreamento
            </strong>
            O mapa em tempo real, telemetria de ignição e relatórios veiculares são liberados
            automaticamente no seu painel assim que a Etapa 6 for homologada pelo operador da
            central.
          </div>
        </div>
      )}
    </div>
  );
}
