import React, { useMemo } from "react";
import {
  Footprints,
  Activity,
  ShieldAlert,
  BatteryCharging,
  Radio,
  Navigation,
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
  podeVerSensores = true,
  podeVerEletrica = true,
  podeVerSatelites = true,
  getRumoCardeal = (r) => `${r ?? 0}°`,
  statusComunicacao = { ativo: true, minutos: 0 },
  postoVinculado,
  turnoAtivo,
}: MostradoresMonitor3DProps) {
  const velocidade = Number(veiculo.velocidade) || 0;
  const inclinacao =
    veiculo.inclinacao_graus !== undefined && veiculo.inclinacao_graus !== null
      ? Number(veiculo.inclinacao_graus)
      : 5;
  const vibracao =
    veiculo.vibracao_g !== undefined && veiculo.vibracao_g !== null
      ? Number(veiculo.vibracao_g)
      : 1.0;
  const bateriaRastreador =
    veiculo.bateria_rastreador_pct !== undefined && veiculo.bateria_rastreador_pct !== null
      ? Number(veiculo.bateria_rastreador_pct)
      : 90;
  const satelites =
    veiculo.satelites !== undefined && veiculo.satelites !== null && Number(veiculo.satelites) > 0
      ? Number(veiculo.satelites)
      : 12;

  // 1. Ritmo de Deslocamento Humano (m/min e m/s - ZERO km/h)
  const ritmo = useMemo(() => converterVelocidadeParaRitmoHumano(velocidade), [velocidade]);

  // 2. Avaliação de Queda e Postura Corporal (Fusão Inclinômetro + Força G)
  const queda = useMemo(() => avaliarAlertaQueda(inclinacao, vibracao), [inclinacao, vibracao]);

  // 3. Autonomia da Bateria Portátil (Li-Ion 3.7V - 4.2V)
  const infoBateria = useMemo(() => {
    const pct = Math.max(0, Math.min(100, bateriaRastreador));
    const voltagemEstimada = (3.6 + (pct / 100) * 0.6).toFixed(2);
    const horasRestantes = Math.round((pct / 100) * 18); // bateria portátil de ~18h típicas

    let status = "Operacional e Estável";
    let cor = "text-emerald-600 dark:text-emerald-400";
    if (pct <= 20) {
      status = "Carga Crítica (Troca / Recarga Imediata)";
      cor = "text-rose-600 dark:text-rose-400";
    } else if (pct <= 45) {
      status = "Carga Moderada";
      cor = "text-amber-600 dark:text-amber-400";
    }

    return { pct, voltagemEstimada, horasRestantes, status, cor };
  }, [bateriaRastreador]);

  // 4. Distância da Ronda em Metros (ao invés de Odômetro em km)
  const metrosRonda = useMemo(() => {
    // Odômetro acumulado em km convertido para metros, ou distância da ronda atual
    const km = Number(veiculo.odometro) || 0;
    const metros = Math.round(km * 1000);
    const passos = Math.round(metros * 1.3333);
    return { metros, passos };
  }, [veiculo.odometro]);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Banner de Emergência Superior em caso de Queda Confirmada (Man Down) */}
      {queda.temAlertaQueda && (
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
              RONDA A PÉ
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

          {/* Barra Isométrica 3D de Cadência Humana (0 a 160 m/min) */}
          <div
            className="flex items-end gap-1 h-10 w-full px-1 py-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-emerald-500/30"
            style={{ perspective: "400px" }}
          >
            {[...Array(12)].map((_, i) => {
              const limiteSegmento = (i + 1) * 13.3; // até 160 m/min
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
            queda.severidade === "critica"
              ? "border-rose-500 dark:border-rose-500/60 dark:shadow-rose-950/30"
              : queda.severidade === "moderada"
                ? "border-amber-400 dark:border-amber-500/50"
                : "border-slate-300/70 dark:border-blue-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider">
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap ${
                queda.severidade === "critica"
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
                queda.severidade === "critica"
                  ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 animate-pulse"
                  : queda.severidade === "moderada"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20"
              }`}
            >
              {queda.severidade === "critica" ? "QUEDA / MAN DOWN" : "INCLINÔMETRO"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    queda.severidade === "critica"
                      ? "text-rose-600 dark:text-rose-400"
                      : queda.severidade === "moderada"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {Math.abs(inclinacao).toFixed(0)}°
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  INCLINAÇÃO
                </span>
              </div>
              <div
                className={`text-[10px] font-mono font-bold uppercase tracking-wider mt-0.5 ${queda.corTexto}`}
              >
                {queda.mensagem}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div
                className={`font-bold ${
                  queda.severidade === "critica"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {inclinacao >= 60
                  ? "POSIÇÃO NO CHÃO"
                  : inclinacao >= 30
                    ? "EM DESNÍVEL"
                    : "POSTURA ERETA"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                Limiar Normal (menor que 30°)
              </div>
            </div>
          </div>

          {/* Visualizador Holográfico de Postura Humana em 3D (Roll e Pitch) */}
          <div
            className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-blue-500/30 flex items-center justify-center relative overflow-hidden px-2"
            style={{ perspective: "350px" }}
          >
            <div className="absolute inset-x-0 h-px bg-slate-300 dark:bg-slate-700/60 border-dashed" />
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 transition-transform duration-500 shadow-md ${
                queda.severidade === "critica"
                  ? "border-rose-500 bg-rose-500/20 shadow-rose-500/40"
                  : queda.severidade === "moderada"
                    ? "border-amber-500 bg-amber-500/20 shadow-amber-500/40"
                    : "border-blue-500 bg-blue-500/20 shadow-blue-500/40"
              }`}
              style={{
                transform: `rotateZ(${(inclinacao || 0) * 1.5}deg) rotateX(${Math.min(60, Math.abs(inclinacao || 0))}deg)`,
              }}
            >
              <User
                className={`h-4 w-4 ${
                  queda.severidade === "critica"
                    ? "text-rose-600 dark:text-rose-400"
                    : queda.severidade === "moderada"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-blue-600 dark:text-blue-400"
                }`}
              />
              <span className="text-[9px] font-mono font-black text-slate-800 dark:text-slate-200">
                {inclinacao >= 60 ? "HOMEM NO CHÃO" : "VIGILANTE ERETO"}
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
            vibracao >= 2.5
              ? "rgba(244, 63, 94, 0.3)"
              : vibracao >= 1.5
                ? "rgba(245, 158, 11, 0.25)"
                : "rgba(139, 92, 246, 0.25)"
          }
          className={`rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border shadow-[4px_4px_14px_#c3cfe2] flex flex-col justify-between ${
            vibracao >= 2.5
              ? "border-rose-500 dark:border-rose-500/60 dark:shadow-rose-950/30"
              : vibracao >= 1.5
                ? "border-amber-400 dark:border-amber-500/50"
                : "border-slate-300/70 dark:border-purple-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider">
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap ${
                vibracao >= 2.5
                  ? "text-rose-600 dark:text-rose-400"
                  : vibracao >= 1.5
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-purple-600 dark:text-purple-400"
              }`}
            >
              <Activity className="h-4 w-4" /> FORÇA G E IMPACTO
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] border font-bold whitespace-nowrap ${
                vibracao >= 2.5
                  ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                  : vibracao >= 1.5
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20"
              }`}
            >
              {vibracao >= 2.5 ? "IMPACTO SEVERO" : "ACELERÔMETRO"}
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span
                  className={`text-3xl sm:text-4xl font-black font-mono ${
                    vibracao >= 2.5
                      ? "text-rose-600 dark:text-rose-400"
                      : vibracao >= 1.5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-purple-600 dark:text-purple-400"
                  }`}
                >
                  {vibracao.toFixed(1)}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-slate-500 dark:text-slate-400">
                  G (FORÇA)
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider mt-0.5 text-slate-500 dark:text-slate-400">
                {vibracao >= 2.5
                  ? "🚨 ALERTA: IMPACTO DE QUEDA"
                  : vibracao >= 1.5
                    ? "⚠️ MOVIMENTO BRUSCO"
                    : "VIVACIDADE BASAL NORMAL (1.0G)"}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div
                className={`font-bold ${
                  vibracao >= 2.5
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {vibracao >= 2.5 ? "ALERTA IMPACTO" : "ESTABILIDADE OK"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                Gravidade Terrestre: 1.0G
              </div>
            </div>
          </div>

          {/* Radar Inercial Tático com Mira de Alinhamento */}
          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-purple-500/30 flex items-center justify-between px-3 relative overflow-hidden">
            <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
              0.0G (Queda Livre)
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500 animate-ping" />
              <span className="font-mono text-xs font-black text-purple-600 dark:text-purple-400">
                {vibracao.toFixed(2)}G
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
            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[9px] border border-sky-500/20 whitespace-nowrap font-bold">
              RASTREADOR PORTÁTIL
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-3xl sm:text-4xl font-black font-mono text-sky-600 dark:text-sky-300 dark:drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]">
                  {infoBateria.pct}%
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-sky-600/80 dark:text-sky-400/80">
                  CARGA
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                Célula Li-Ion: {infoBateria.voltagemEstimada} V
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className={`font-bold uppercase tracking-wider ${infoBateria.cor}`}>
                {infoBateria.status}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                Autonomia: ~{infoBateria.horasRestantes}h restantes
              </div>
            </div>
          </div>

          {/* Barra de Nível da Célula Portátil */}
          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-sky-500/30 p-1 flex items-center">
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-5 rounded-lg overflow-hidden p-0.5 flex">
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
                Estimativa: ~{metrosRonda.passos.toLocaleString("pt-BR")} passos executados
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className="font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                {postoVinculado ? postoVinculado.nome : "Perímetro da Propriedade"}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                Área de Patrulhamento Ativa
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
        {/* CARD 6: COBERTURA GNSS, CONECTIVIDADE 4G E BOTÃO SOS / PÂNICO             */}
        {/* ========================================================================= */}
        <TiltCard
          maxTilt={10}
          spotlightColor="rgba(249, 115, 22, 0.25)"
          className="rounded-2xl p-4 bg-[#eaf0f8] dark:bg-gradient-to-b dark:from-slate-900/90 dark:to-slate-950/95 border border-slate-300/70 dark:border-orange-500/40 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-xl dark:shadow-orange-950/20 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Radio className="h-4 w-4" /> CONEXÃO E BOTÃO SOS
            </span>
            <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] border border-orange-500/20 whitespace-nowrap font-bold">
              PORTÁTIL 4G
            </span>
          </div>

          <div className="my-2.5 flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline">
                <span className="text-3xl sm:text-4xl font-black font-mono text-orange-600 dark:text-orange-300 dark:drop-shadow-[0_0_12px_rgba(249,115,22,0.5)]">
                  {satelites}
                </span>
                <span className="text-xs font-mono font-bold ml-1.5 text-orange-600/80 dark:text-orange-400/80">
                  SATÉLITES
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                Precisão GNSS Submétrica • Rumo: {getRumoCardeal(veiculo.rumo)}
              </div>
            </div>

            <div className="text-right font-mono text-[10px]">
              <div className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1 justify-end">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>BOTÃO SOS PRONTO</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                Disparo Imediato para Central
              </div>
            </div>
          </div>

          <div className="h-10 w-full bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-orange-500/30 px-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4].map((barra) => (
                  <div
                    key={barra}
                    className={`w-1 rounded-xs transition-all ${
                      (veiculo.sinal_gsm ?? 4) >= barra
                        ? "bg-orange-500 dark:bg-orange-400"
                        : "bg-slate-300 dark:bg-slate-700"
                    }`}
                    style={{ height: `${barra * 3.5 + 4}px` }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                Rede 4G LTE
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              <span>
                Ping:{" "}
                {statusComunicacao.minutos === 0 ? "Agora" : `${statusComunicacao.minutos}m atrás`}
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
                {turnoAtivo.rastreador_imei}
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
