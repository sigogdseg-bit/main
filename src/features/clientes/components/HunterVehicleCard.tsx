import React, { useState, useEffect } from "react";
import {
  Clock,
  Gauge,
  Battery,
  BatteryCharging,
  KeyRound,
  MapPin,
  Lock,
  Unlock,
  Navigation,
  Box,
  User,
  ShieldAlert,
  Settings2,
} from "lucide-react";
import type { VeiculoGps } from "@/features/monitor-gps/types";
import { PlacaMercosulBadge } from "@/shared/components/PlacaMercosulBadge";
import { VehiclePhotoPlaceholder } from "@/shared/components/VehiclePhotoPlaceholder";
import { avaliarStatusComunicacao } from "@/features/monitor-gps/services/gpsService";
import {
  isPropriedadeMonitorada,
  converterVelocidadeParaRitmoHumano,
} from "@/features/monitor-gps/utils/propriedadeMonitoradaUtils";
import { obterEnderecoPorCoordenadas } from "@/features/monitor-gps/services/compartilhamentoService";

interface HunterVehicleCardProps {
  veiculo: VeiculoGps;
  nomeCondutor?: string;
  enderecoTexto?: string;
  onVerNoMapa?: (veiculo: VeiculoGps) => void;
  onAbrirCockpit?: (veiculo: VeiculoGps) => void;
  onToggleBloqueio?: (veiculo: VeiculoGps) => void;
  onConfigurarMetrica?: (veiculo: VeiculoGps) => void;
  podeBloquear?: boolean;
  className?: string;
}

/**
 * Componente HunterVehicleCard
 * Card de veículo de altíssimo padrão visual inspirado no benchmark de excelência Movitrak:
 * - Fotografia real ou estúdio 3D com iluminação de ponta
 * - Badge de status Online/Offline e cadeado de ignição/combustível
 * - Placa Mercosul autêntica sobreposta diretamente na foto
 * - Marca, modelo e condutor em tipografia nítida
 * - Grid 2x2 com telemetria direta (Atualizado, Velocidade, Rastreador %, Ignição)
 * - Localização em texto e botões táteis de ação rápida com active:scale-[0.98]
 */
export const HunterVehicleCard: React.FC<HunterVehicleCardProps> = ({
  veiculo,
  nomeCondutor,
  enderecoTexto,
  onVerNoMapa,
  onAbrirCockpit,
  onToggleBloqueio,
  onConfigurarMetrica,
  podeBloquear = false,
  className = "",
}) => {
  const statusCom = avaliarStatusComunicacao(veiculo.ultima_atualizacao);
  const isOnline = statusCom.ativo;
  const isPropriedade = isPropriedadeMonitorada(veiculo);
  const isHorimetro =
    veiculo.tipo_medicao === "horimetro" || (veiculo as any).horimetro_modo === "horimetro";

  // Estado e resolução assíncrona do endereço legível (nunca expor coordenadas brutas)
  const [enderecoLocal, setEnderecoLocal] = useState<string>(
    enderecoTexto || (veiculo as any).endereco || "",
  );

  useEffect(() => {
    if (enderecoTexto && enderecoTexto.trim().length > 0) {
      setEnderecoLocal(enderecoTexto);
      return;
    }

    if ((veiculo as any).endereco && (veiculo as any).endereco.trim().length > 0) {
      setEnderecoLocal((veiculo as any).endereco);
      return;
    }

    let ativo = true;
    const lat = veiculo.latitude;
    const lon = veiculo.longitude;

    if (lat && lon && (lat !== 0 || lon !== 0)) {
      obterEnderecoPorCoordenadas(lat, lon)
        .then((end) => {
          if (ativo && end) {
            setEnderecoLocal(end);
          }
        })
        .catch(() => {
          if (ativo) {
            setEnderecoLocal("Localização em monitoramento");
          }
        });
    } else {
      setEnderecoLocal("Localização em monitoramento");
    }

    return () => {
      ativo = false;
    };
  }, [enderecoTexto, veiculo.latitude, veiculo.longitude, (veiculo as any).endereco]);

  // Formatação de telemetria de velocidade (humana ou veicular)
  const telemetriaHumana = isPropriedade
    ? converterVelocidadeParaRitmoHumano(veiculo.velocidade)
    : null;

  const velocidadeRotulo = isPropriedade
    ? `${telemetriaHumana?.ritmoMMin || 0} m/min`
    : `${veiculo.velocidade || 0} km/h`;

  // Carga da bateria do rastreador (0 a 100%)
  const bateriaPct =
    veiculo.bateria_rastreador_pct !== undefined && veiculo.bateria_rastreador_pct !== null
      ? `${veiculo.bateria_rastreador_pct}%`
      : "100%";

  // Status de Ignição / Atividade
  const isIgnicaoLigada = Boolean(veiculo.ignicao);
  const ignicaoTexto = isPropriedade
    ? isIgnicaoLigada
      ? "Em Ronda"
      : "Parado"
    : isHorimetro
      ? isIgnicaoLigada
        ? "Motor Ligado"
        : "Motor Desligado"
      : isIgnicaoLigada
        ? "Ligada"
        : "Desligada";

  // Nome do condutor ou titular
  const condutorExibido = nomeCondutor || veiculo.cliente_nome || "Titular da Proteção";

  return (
    <div
      className={`group flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-none hover:shadow-[0_12px_32px_rgba(0,0,0,0.1)] transition-all duration-200 overflow-hidden ${className}`}
    >
      {/* 1. Área Superior: Fotografia do Veículo com Elementos Flutuantes */}
      <div className="relative aspect-16/10 w-full overflow-hidden bg-slate-950">
        <VehiclePhotoPlaceholder
          fotoUrl={(veiculo as any).foto_url || null}
          tipo={veiculo.tipo_veiculo}
          marcaModelo={veiculo.marca_modelo}
          className="w-full h-full"
        />

        {/* Linha Superior da Imagem: Status Online e Cadeado */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10 pointer-events-none">
          {/* Badge Online/Offline Translúcido */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold shadow-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-400"
              }`}
            />
            <span>{isOnline ? "Online" : "Offline"}</span>
          </div>

          {/* Marca d'água central sutil */}
          <span className="text-[9px] font-black tracking-[0.25em] text-white/60 uppercase hidden sm:inline-block">
            — RASTREAMENTO —
          </span>

          {/* Botão / Indicador de Bloqueio com Cadeado */}
          <button
            type="button"
            disabled={!podeBloquear}
            onClick={(e) => {
              e.stopPropagation();
              onToggleBloqueio?.(veiculo);
            }}
            className={`pointer-events-auto p-1.5 rounded-full backdrop-blur-md border transition-transform active:scale-90 ${
              veiculo.bloqueado
                ? "bg-rose-500/80 border-rose-300 text-white shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                : "bg-black/40 border-white/20 text-emerald-400 hover:text-white"
            } ${podeBloquear ? "cursor-pointer" : "cursor-default"}`}
            title={
              veiculo.bloqueado
                ? "Veículo Bloqueado Remotamente"
                : "Veículo Desbloqueado e Pronto para Partida"
            }
          >
            {veiculo.bloqueado ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Unlock className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Alerta de Impacto ou Emergência Flutuante */}
        {veiculo.alerta_acidente && (
          <div className="absolute top-12 left-3 z-10 px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase flex items-center gap-1 shadow-md animate-pulse">
            <ShieldAlert className="w-3 h-3" />
            <span>Alerta de Impacto</span>
          </div>
        )}

        {/* Canto Inferior Esquerdo: Placa Mercosul Sobreposta */}
        <div className="absolute bottom-3 left-3 z-10 drop-shadow-lg">
          <PlacaMercosulBadge placa={veiculo.placa} tamanho="md" />
        </div>
      </div>

      {/* 2. Corpo de Informações: Marca, Modelo e Condutor */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* Título: Modelo em Negrito */}
          <h3 className="font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg tracking-tight uppercase truncate">
            {veiculo.marca_modelo || "Veículo de Rastreamento"}
          </h3>

          {/* Condutor / Titular */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            <User className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{condutorExibido}</span>
          </div>

          {/* Métrica Principal: Odômetro ou Horímetro em Tempo Real */}
          <div className="flex items-center justify-between text-xs mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {isHorimetro ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Horímetro:{" "}
                  <strong className="font-mono font-tabular">
                    {Number(veiculo.horimetro_horas ?? veiculo.horimetro ?? 0).toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      },
                    )}{" "}
                    h
                  </strong>
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-bold">
                <Gauge className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Odômetro:{" "}
                  <strong className="font-mono font-tabular">
                    {Number(veiculo.odometro || 0).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    km
                  </strong>
                </span>
              </div>
            )}

            {onConfigurarMetrica && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigurarMetrica(veiculo);
                }}
                className="px-2 py-1 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-500/10 transition flex items-center gap-1 cursor-pointer"
                title="Configurar medição entre Odômetro (KM) e Horímetro (Horas de Uso)"
              >
                <Settings2 className="w-3 h-3" />
                <span>Métrica</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. Grid de Telemetria 2x2 com micro-ícones de alta legibilidade */}
        <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800 text-xs">
          {/* Item 1: Atualizado */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-slate-500 shrink-0 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                Atualizado
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                {statusCom.detalhe || "agora"}
              </span>
            </div>
          </div>

          {/* Item 2: Velocidade / Ritmo */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5">
              <Gauge className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                {isPropriedade ? "Ritmo" : "Velocidade"}
              </span>
              <span className="font-black text-slate-900 dark:text-slate-100 font-mono font-tabular truncate block">
                {velocidadeRotulo}
              </span>
            </div>
          </div>

          {/* Item 3: Bateria do Rastreador */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
              {veiculo.alimentacao_externa ? (
                <BatteryCharging className="w-3.5 h-3.5" />
              ) : (
                <Battery className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                Rastreador
              </span>
              <span className="font-black text-slate-900 dark:text-slate-100 font-mono font-tabular truncate block">
                {bateriaPct}
              </span>
            </div>
          </div>

          {/* Item 4: Ignição */}
          <div className="flex items-start gap-2">
            <div
              className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                isIgnicaoLigada
                  ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                {isPropriedade ? "Atividade" : isHorimetro ? "Motor / Horímetro" : "Ignição"}
              </span>
              <span
                className={`font-black truncate block ${
                  isIgnicaoLigada
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {ignicaoTexto}
              </span>
            </div>
          </div>

          {/* Linha Integral: Localização em Texto (Endereço legível - nunca coordenadas brutas) */}
          <div className="col-span-2 flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                Localização
              </span>
              <p
                className={`font-medium truncate text-[11px] ${
                  enderecoLocal
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-slate-400 dark:text-slate-500 animate-pulse"
                }`}
                title={enderecoLocal || "Identificando endereço..."}
              >
                {enderecoLocal || "Identificando endereço..."}
              </p>
            </div>
          </div>
        </div>

        {/* 4. Barra de Ações Rápidas: Ver no Mapa e Cockpit 3D / Monitor 3D */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onVerNoMapa?.(veiculo)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-sm transition-all duration-150 cursor-pointer active:scale-98"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Ver no Mapa</span>
          </button>

          <button
            type="button"
            onClick={() => onAbrirCockpit?.(veiculo)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 shadow-2xs transition-all duration-150 cursor-pointer active:scale-98"
          >
            <Box className="w-3.5 h-3.5 text-orange-500" />
            <span>{isPropriedade ? "Monitor 3D" : "Cockpit 3D"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
