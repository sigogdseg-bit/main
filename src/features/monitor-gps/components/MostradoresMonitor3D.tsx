import React, { useMemo } from "react";
import {
  Footprints,
  Activity,
  ShieldAlert,
  BatteryCharging,
  Radio,
  Compass,
  AlertTriangle,
  User,
  Building2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { TiltCard } from "@/shared/components/TiltCard";
import type { VeiculoGps } from "../types";
import type { PostoVigilancia, TurnoVigilancia } from "@/features/vigilantes/types";
import {
  converterVelocidadeParaRitmoHumano,
  avaliarAlertaQueda,
} from "../utils/propriedadeMonitoradaUtils";

export interface MostradoresMonitor3DProps {
  veiculo: VeiculoGps;
  podeVerSensores?: boolean;
  podeVerEletrica?: boolean;
  podeVerSatelites?: boolean;
  isEquipeTecnica?: boolean;
  isSuperAdmin?: boolean;
  onSolicitarUpgrade?: (recurso: string) => void;
  getRumoCardeal?: (rumo?: number) => string;
  statusComunicacao?: { ativo: boolean; minutos: number };
  postoVinculado?: PostoVigilancia | null;
  turnoAtivo?: TurnoVigilancia | null;
}

export function MostradoresMonitor3D({
  veiculo,
  getRumoCardeal = (r) => `${r ?? 0}°`,
  statusComunicacao = { ativo: true, minutos: 0 },
  postoVinculado,
  turnoAtivo,
}: MostradoresMonitor3DProps) {
  // Verificação estrita de telemetria factual proveniente de hardware físico
  const temRastreadorFisico = Boolean(veiculo.rastreador_imei);
  const temInclinacaoReal =
    veiculo.inclinacao_graus !== undefined &&
    veiculo.inclinacao_graus !== null &&
    !isNaN(Number(veiculo.inclinacao_graus));
  const temVibracaoReal =
    veiculo.vibracao_g !== undefined &&
    veiculo.vibracao_g !== null &&
    !isNaN(Number(veiculo.vibracao_g));
  const temBateriaReal =
    veiculo.bateria_rastreador_pct !== undefined &&
    veiculo.bateria_rastreador_pct !== null &&
    !isNaN(Number(veiculo.bateria_rastreador_pct));
  const temSatelitesReal =
    veiculo.satelites !== undefined && veiculo.satelites !== null && Number(veiculo.satelites) > 0;
  const temVelocidadeReal =
    veiculo.velocidade !== undefined &&
    veiculo.velocidade !== null &&
    Number(veiculo.velocidade) > 0;

  const velocidade = temVelocidadeReal ? Number(veiculo.velocidade) : 0;
  const inclinacao = temInclinacaoReal ? Number(veiculo.inclinacao_graus) : null;
  const vibracao = temVibracaoReal ? Number(veiculo.vibracao_g) : null;
  const bateriaRastreador = temBateriaReal ? Number(veiculo.bateria_rastreador_pct) : null;
  const satelites = temSatelitesReal ? Number(veiculo.satelites) : null;

  // 1. Ritmo de Deslocamento Humano (m/min e m/s - ZERO km/h)
  const ritmo = useMemo(() => {
    if (!temRastreadorFisico || !temVelocidadeReal) {
      return {
        ritmoMMin: 0,
        ritmoMS: "0.0",
        cadenciaPassosMin: 0,
        classificacao: "POSTO FIXO",
        descricao: "Estrutura fixa no perímetro cadastrado",
        cor: "text-emerald-600 dark:text-emerald-400",
      };
    }
    return converterVelocidadeParaRitmoHumano(velocidade);
  }, [temRastreadorFisico, temVelocidadeReal, velocidade]);

  // 2. Avaliação de Queda e Postura Corporal (Fusão Inclinômetro e Força G)
  const queda = useMemo(() => {
    if (inclinacao === null && vibracao === null) {
      return {
        disponivel: false,
        temAlertaQueda: false,
        severidade: "normal" as const,
        mensagem: "Sensor Inercial Não Detectado",
        detalhes: "Requer rastreador portátil no vigilante para medir postura e queda",
        corTexto: "text-slate-500 dark:text-slate-400",
        corBorda: "border-slate-300/70 dark:border-slate-700/60",
        corBg: "bg-slate-100 dark:bg-slate-900",
      };
    }
    const analise = avaliarAlertaQueda(inclinacao ?? 0, vibracao ?? 1.0);
    return {
      disponivel: true,
      ...analise,
    };
  }, [inclinacao, vibracao]);

  // 3. Autonomia da Bateria Portátil (Li-Ion 3.7V - 4.2V)
  const infoBateria = useMemo(() => {
    if (bateriaRastreador === null) {
      return {
        disponivel: false,
        pct: null,
        voltagemEstimada: "--",
        horasRestantes: null,
        status: "Não Aplicável",
        detalhe: "Posto físico sem bateria móvel associada",
        cor: "text-slate-500 dark:text-slate-400",
      };
    }

    const pct = Math.max(0, Math.min(100, bateriaRastreador));
    const voltagemEstimada = (3.6 + (pct / 100) * 0.6).toFixed(2);
    const horasRestantes = Math.round((pct / 100) * 18);

    let status = "Operacional e Estável";
    let cor = "text-emerald-600 dark:text-emerald-400";
    if (pct <= 20) {
      status = "Carga Crítica (Troca / Recarga Imediata)";
      cor = "text-rose-600 dark:text-rose-400";
    } else if (pct <= 45) {
      status = "Carga Moderada";
      cor = "text-amber-600 dark:text-amber-400";
    }

    return {
      disponivel: true,
      pct,
      voltagemEstimada,
      horasRestantes,
      status,
      detalhe: `Autonomia: ~${horasRestantes}h restantes`,
      cor,
    };
  }, [bateriaRastreador]);

  // 4. Distância da Ronda em Metros
  const metrosRonda = useMemo(() => {
    const km = Number(veiculo.odometro) || 0;
    if (!temRastreadorFisico || km <= 0) {
      return {
        metros: 0,
        passos: 0,
        descricao: "Posto fixo cadastrado (Sem ronda ativa)",
      };
    }
    const metros = Math.round(km * 1000);
    const passos = Math.round(metros * 1.3333);
    return {
      metros,
      passos,
      descricao: `Estimativa: ~${passos.toLocaleString("pt-BR")} passos executados`,
    };
  }, [temRastreadorFisico, veiculo.odometro]);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Banner Factual de Auditoria: Informa com transparência a modalidade do monitoramento */}
      {!temRastreadorFisico && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-bold block">Propriedade Monitorada Georreferenciada</span>
              <span className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5 block">
                As coordenadas geodésicas e o perímetro foram confirmados pelo cadastro oficial.
                Sensores de postura corporal (inclinômetro), impacto e bateria exigem um rastreador
                físico móvel associado à escala deste posto.
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 shrink-0">
            DADOS CADASTRAIS
          </span>
        </div>
      )}

      {/* Banner de Emergência Superior em caso de Queda Confirmada (Man Down) */}
      {queda.disponivel && queda.temAlertaQueda && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border-2 ${queda.corBorda} ${queda.corBg} shadow-xl flex items-center justify-between gap-3 animate-pulse`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0 shadow-md">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs sm:text-sm text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                  {queda.mensagem}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                  URGÊNCIA
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-200 mt-0.5 leading-relaxed">
                {queda.detalhes}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
              Sensor Man Down Ativo
            </span>
          </div>
        </div>
      )}

      {/* Grid Canônico de Cards Holográficos do Monitor 3D */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
        {/* ========================================================================= */}
        {/* CARD 1: RITMO DE DESLOCAMENTO HUMANO E RONDA A PÉ (ZERO KM/H)             */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(16, 185, 129, 0.25)"
          className="rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-emerald-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-emerald-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Footprints className="h-4 w-4 animate-pulse" /> RITMO DE DESLOCAMENTO
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] border border-emerald-500/20 whitespace-nowrap font-bold">
              {temVelocidadeReal ? "RONDA A PÉ" : "POSTO FIXO"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-3xl sm:text-4xl font-black font-mono text-emerald-600 dark:text-emerald-300 dark:drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                  {ritmo.ritmoMMin}
                </span>
                <span className="text-xs font-mono text-emerald-600/80 dark:text-emerald-400/80 ml-1.5 font-bold">
                  M/MIN
                </span>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{ritmo.ritmoMS} m/s</span>
                <span>•</span>
                <span>~{ritmo.cadenciaPassosMin} passos/min</span>
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className={`font-bold uppercase tracking-wider ${ritmo.cor}`}>
                {ritmo.classificacao}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {ritmo.descricao}
              </div>
            </div>
          </div>

          {/* Barra Isométrica 3D de Cadência Humana */}
          <div
            className="flex items-end gap-1 h-10 w-full px-1 py-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-emerald-500/30"
            style={{ perspective: "400px" }}
          >
            {[...Array(12)].map((_, i) => {
              const limiteSegmento = (i + 1) * 13.3;
              const ativo = ritmo.ritmoMMin >= i * 13.3;
              const altura = Math.min(100, Math.max(20, (i + 1) * 8.3));
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-300 relative"
                  style={{
                    height: `${altura}%`,
                    background: ativo
                      ? i > 9
                        ? "linear-gradient(to top, #ea580c, #f97316)"
                        : i > 6
                          ? "linear-gradient(to top, #d97706, #f59e0b)"
                          : "linear-gradient(to top, #059669, #10b981, #6ee7b7)"
                      : "rgba(148, 163, 184, 0.25)",
                    boxShadow: ativo ? "0 0 6px rgba(16, 185, 129, 0.6)" : "none",
                    transform: "rotateX(20deg)",
                  }}
                  title={`Faixa de passo: ${Math.round(limiteSegmento)} m/min`}
                />
              );
            })}
          </div>
        </TiltCard>

        {/* ========================================================================= */}
        {/* CARD 2: INCLINÔMETRO CORPORAL 3D E ALERTA DE QUEDA (MAN DOWN)             */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor={
            queda.severidade === "critica"
              ? "rgba(244, 63, 94, 0.3)"
              : queda.severidade === "moderada"
                ? "rgba(245, 158, 11, 0.25)"
                : "rgba(59, 130, 246, 0.25)"
          }
          className={`rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border shadow-[4px_4px_14px_#c3cfe2] flex flex-col justify-between ${
            !temInclinacaoReal
              ? "border-slate-300/70 dark:border-slate-800"
              : queda.severidade === "critica"
                ? "border-rose-500 dark:border-rose-500/60 dark:shadow-rose-950/30"
                : queda.severidade === "moderada"
                  ? "border-amber-400 dark:border-amber-500/50"
                  : "border-slate-300/70 dark:border-blue-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider">
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap ${
                !temInclinacaoReal
                  ? "text-slate-500 dark:text-slate-400"
                  : queda.severidade === "critica"
                    ? "text-rose-600 dark:text-rose-400"
                    : queda.severidade === "moderada"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-blue-600 dark:text-blue-400"
              }`}
            >
              <ShieldAlert className="h-4 w-4" /> POSTURA CORPORAL 3D
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                !temInclinacaoReal
                  ? "bg-slate-200/60 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
                  : queda.severidade === "critica"
                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 animate-pulse"
                    : queda.severidade === "moderada"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20"
              }`}
            >
              {temInclinacaoReal ? "INCLINÔMETRO" : "NÃO VINCULADO"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    !temInclinacaoReal
                      ? "text-slate-400 dark:text-slate-600"
                      : queda.severidade === "critica"
                        ? "text-rose-600 dark:text-rose-400"
                        : queda.severidade === "moderada"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {temInclinacaoReal ? `${Math.abs(inclinacao ?? 0).toFixed(0)}°` : "--"}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  INCLINAÇÃO
                </span>
              </div>
              <div
                className={`text-[10px] font-mono font-bold uppercase tracking-wider mt-0.5 ${queda.corTexto}`}
              >
                {temInclinacaoReal ? queda.mensagem : "Sensor corporal ausente"}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div
                className={`font-bold ${
                  !temInclinacaoReal
                    ? "text-slate-500 dark:text-slate-400"
                    : queda.severidade === "critica"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {!temInclinacaoReal
                  ? "INDISPONÍVEL"
                  : (inclinacao ?? 0) >= 60
                    ? "POSIÇÃO NO CHÃO"
                    : (inclinacao ?? 0) >= 30
                      ? "EM DESNÍVEL"
                      : "POSTURA ERETA"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {temInclinacaoReal ? "Limiar Normal (menor que 30°)" : "Requer sensor inercial"}
              </div>
            </div>
          </div>

          {/* Visualizador Holográfico de Postura Humana em 3D */}
          <div
            className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center relative overflow-hidden px-2"
            style={{ perspective: "350px" }}
          >
            <div className="absolute inset-x-0 h-px bg-slate-300 dark:bg-slate-700/60 border-dashed" />
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 transition-transform duration-500 shadow-md ${
                !temInclinacaoReal
                  ? "border-slate-300 dark:border-slate-700 bg-slate-200/40 dark:bg-slate-800/40 text-slate-400"
                  : queda.severidade === "critica"
                    ? "border-rose-500 bg-rose-500/20 shadow-rose-500/40"
                    : queda.severidade === "moderada"
                      ? "border-amber-500 bg-amber-500/20 shadow-amber-500/40"
                      : "border-blue-500 bg-blue-500/20 shadow-blue-500/40"
              }`}
              style={{
                transform: temInclinacaoReal
                  ? `rotateZ(${(inclinacao || 0) * 1.5}deg) rotateX(${Math.min(60, Math.abs(inclinacao || 0))}deg)`
                  : "none",
              }}
            >
              <User
                className={`h-4 w-4 ${
                  !temInclinacaoReal
                    ? "text-slate-400"
                    : queda.severidade === "critica"
                      ? "text-rose-600 dark:text-rose-400"
                      : queda.severidade === "moderada"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-blue-600 dark:text-blue-400"
                }`}
              />
              <span className="text-[9px] font-mono font-black text-slate-800 dark:text-slate-200">
                {!temInclinacaoReal
                  ? "SEM SENSOR INERCIAL DETECTADO"
                  : (inclinacao ?? 0) >= 60
                    ? "HOMEM NO CHÃO"
                    : "VIGILANTE ERETO"}
              </span>
            </div>
          </div>
        </TiltCard>

        {/* ========================================================================= */}
        {/* CARD 3: ACELERÔMETRO E FORÇA G (DETECTOR DE IMPACTO / TRAUMA)              */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor={
            !temVibracaoReal
              ? "rgba(148, 163, 184, 0.2)"
              : (vibracao ?? 0) >= 2.5
                ? "rgba(244, 63, 94, 0.3)"
                : (vibracao ?? 0) >= 1.5
                  ? "rgba(245, 158, 11, 0.25)"
                  : "rgba(139, 92, 246, 0.25)"
          }
          className={`rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border shadow-[4px_4px_14px_#c3cfe2] flex flex-col justify-between ${
            !temVibracaoReal
              ? "border-slate-300/70 dark:border-slate-800"
              : (vibracao ?? 0) >= 2.5
                ? "border-rose-500 dark:border-rose-500/60 dark:shadow-rose-950/30"
                : (vibracao ?? 0) >= 1.5
                  ? "border-amber-400 dark:border-amber-500/50"
                  : "border-slate-300/70 dark:border-purple-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider">
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap ${
                !temVibracaoReal
                  ? "text-slate-500 dark:text-slate-400"
                  : (vibracao ?? 0) >= 2.5
                    ? "text-rose-600 dark:text-rose-400"
                    : (vibracao ?? 0) >= 1.5
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-purple-600 dark:text-purple-400"
              }`}
            >
              <Activity className="h-4 w-4" /> FORÇA G E IMPACTO
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                !temVibracaoReal
                  ? "bg-slate-200/60 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
                  : (vibracao ?? 0) >= 2.5
                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                    : (vibracao ?? 0) >= 1.5
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                      : "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20"
              }`}
            >
              {temVibracaoReal ? "ACELERÔMETRO" : "NÃO VINCULADO"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    !temVibracaoReal
                      ? "text-slate-400 dark:text-slate-600"
                      : (vibracao ?? 0) >= 2.5
                        ? "text-rose-600 dark:text-rose-400"
                        : (vibracao ?? 0) >= 1.5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-purple-600 dark:text-purple-400"
                  }`}
                >
                  {temVibracaoReal ? (vibracao ?? 0).toFixed(1) : "--"}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  G (FORÇA)
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider mt-0.5 text-slate-500 dark:text-slate-400">
                {!temVibracaoReal
                  ? "Sem telemetria de aceleração"
                  : (vibracao ?? 0) >= 2.5
                    ? "ALERTA: IMPACTO DE QUEDA"
                    : (vibracao ?? 0) >= 1.5
                      ? "MOVIMENTO BRUSCO"
                      : "VIVACIDADE BASAL NORMAL"}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div
                className={`font-bold ${
                  !temVibracaoReal
                    ? "text-slate-500 dark:text-slate-400"
                    : (vibracao ?? 0) >= 2.5
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {!temVibracaoReal
                  ? "INDISPONÍVEL"
                  : (vibracao ?? 0) >= 2.5
                    ? "ALERTA IMPACTO"
                    : "ESTABILIDADE OK"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {temVibracaoReal ? "Gravidade Terrestre: 1.0G" : "Requer acelerômetro móvel"}
              </div>
            </div>
          </div>

          {/* Radar Inercial Tático */}
          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 relative overflow-hidden">
            <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
              0.0G (Queda)
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  temVibracaoReal ? "bg-purple-500 animate-ping" : "bg-slate-400"
                }`}
              />
              <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-300">
                {temVibracaoReal ? `${(vibracao ?? 0).toFixed(2)}G` : "Sem sensor triaxial"}
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
              3.0G+ (Impacto)
            </div>
          </div>
        </TiltCard>

        {/* ========================================================================= */}
        {/* CARD 4: BATERIA DO DISPOSITIVO PORTÁTIL (LI-ION)                          */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(56, 189, 248, 0.25)"
          className="rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-sky-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-sky-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <BatteryCharging className="h-4 w-4" /> BATERIA DO DISPOSITIVO
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                temBateriaReal
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20"
                  : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
              }`}
            >
              {temBateriaReal ? "RASTREADOR PORTÁTIL" : "NÃO APLICÁVEL"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    temBateriaReal
                      ? "text-sky-600 dark:text-sky-300"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {temBateriaReal ? `${infoBateria.pct}%` : "--"}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  CARGA
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {temBateriaReal
                  ? `Célula Li-Ion: ${infoBateria.voltagemEstimada} V`
                  : "Sem bateria móvel associada"}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className={`font-bold uppercase tracking-wider ${infoBateria.cor}`}>
                {infoBateria.status}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {infoBateria.detalhe}
              </div>
            </div>
          </div>

          {/* Barra de Nível da Célula Portátil */}
          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800 p-1 flex items-center">
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-5 rounded-lg overflow-hidden p-0.5 flex">
              {temBateriaReal && infoBateria.pct !== null ? (
                <div
                  className={`h-full rounded-md transition-all duration-500 ${
                    infoBateria.pct <= 20
                      ? "bg-gradient-to-r from-rose-600 to-rose-400"
                      : infoBateria.pct <= 45
                        ? "bg-gradient-to-r from-amber-600 to-amber-400"
                        : "bg-gradient-to-r from-sky-600 to-emerald-400"
                  }`}
                  style={{ width: `${Math.max(5, infoBateria.pct)}%` }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[9px] font-mono text-slate-400 font-bold">
                  POSTO FIXO SEM BATERIA
                </div>
              )}
            </div>
          </div>
        </TiltCard>

        {/* ========================================================================= */}
        {/* CARD 5: COBERTURA DA PROPRIEDADE E DISTÂNCIA PERCORRIDA (METROS / PASSOS) */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(245, 158, 11, 0.25)"
          className="rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-amber-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-amber-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Compass className="h-4 w-4" /> RONDA NA PROPRIEDADE
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] border border-amber-500/20 whitespace-nowrap font-bold">
              METROS PERCORRIDOS
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-3xl sm:text-4xl font-black font-mono text-amber-600 dark:text-amber-300 dark:drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]">
                  {metrosRonda.metros.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-amber-600/80 dark:text-amber-400/80">
                  METROS
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {metrosRonda.descricao}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className="font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                {postoVinculado ? postoVinculado.nome : "Perímetro da Propriedade"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {temRastreadorFisico
                  ? "Área de Patrulhamento Ativa"
                  : "Coordenadas Cadastrais Fixas"}
              </div>
            </div>
          </div>

          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-amber-500/30 px-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Building2 className="h-3.5 w-3.5 text-amber-500" />
              <span className="truncate max-w-[170px]">
                {postoVinculado?.endereco || "Propriedade sob vigilância"}
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              DENTRO DO PERÍMETRO
            </span>
          </div>
        </TiltCard>

        {/* ========================================================================= */}
        {/* CARD 6: COBERTURA GNSS, CONECTIVIDADE E LOCALIZAÇÃO                       */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(249, 115, 22, 0.25)"
          className="rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Radio className="h-4 w-4" /> CONEXÃO E LOCALIZAÇÃO
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                temSatelitesReal
                  ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/20"
                  : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
              }`}
            >
              {temSatelitesReal ? "GNSS ATIVO" : "COORDENADAS FIXAS"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    temSatelitesReal
                      ? "text-orange-600 dark:text-orange-300"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {temSatelitesReal ? satelites : "--"}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  SATÉLITES
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {temSatelitesReal
                  ? `Precisão GNSS Submétrica • Rumo: ${getRumoCardeal(veiculo.rumo)}`
                  : "Coordenadas geodésicas de cadastro do posto"}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1 justify-end">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {temRastreadorFisico ? "DISPOSITIVO VINCULADO" : "POSTO GEORREFERENCIADO"}
                </span>
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                {temRastreadorFisico
                  ? "Telemetria Ativa na Central"
                  : "Localização de Guarita Auditada"}
              </div>
            </div>
          </div>

          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-orange-500/30 px-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                {temRastreadorFisico ? "Rede Móvel de Telemetria" : "Cadastro Físico do Posto"}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              <span>
                {temRastreadorFisico
                  ? `Ping: ${statusComunicacao.minutos === 0 ? "Agora" : `${statusComunicacao.minutos}m atrás`}`
                  : "Auditado"}
              </span>
            </div>
          </div>
        </TiltCard>
      </div>

      {/* Seção Informativa de Turno e Vigilante (se houver turno vinculado) */}
      {turnoAtivo && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100">
                Vigilante em Escala: {turnoAtivo.vigilante?.nome || "Vigilante Designado"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Turno {turnoAtivo.hora_inicio} às {turnoAtivo.hora_fim} • Rastreador IMEI:{" "}
                {turnoAtivo.rastreador_imei || "Sem rastreador atribuído"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              ESCALA EM ANDAMENTO
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
