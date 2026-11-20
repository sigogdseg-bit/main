import React, { useState } from "react";
import { X, Gauge, Clock, Check, Sparkles, AlertCircle } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import type { VeiculoGps } from "@/features/monitor-gps/types";
import { atualizarMetricaVeiculo } from "@/features/monitor-gps/services/gpsService";
import { toast } from "sonner";
import { PlacaMercosulBadge } from "@/shared/components/PlacaMercosulBadge";

interface ModalConfigurarMetricaVeiculoProps {
  veiculo: VeiculoGps | null;
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: (veiculoId: string, tipoMedicao: "km" | "horimetro", horimetroHoras: number) => void;
}

export const ModalConfigurarMetricaVeiculo: React.FC<ModalConfigurarMetricaVeiculoProps> = ({
  veiculo,
  aberto,
  onFechar,
  onSalvo,
}) => {
  if (!aberto || !veiculo) return null;

  const [tipoMedicao, setTipoMedicao] = useState<"km" | "horimetro">(
    veiculo.tipo_medicao ||
      (veiculo.tipo_veiculo === "maquina" || veiculo.tipo_veiculo === "trator"
        ? "horimetro"
        : "km"),
  );

  const [horimetroHoras, setHorimetroHoras] = useState<string>(
    String(Number(veiculo.horimetro || veiculo.horimetro_horas || 0).toFixed(1)),
  );

  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const hNum = Number(horimetroHoras.replace(",", "."));
      const res = await atualizarMetricaVeiculo(
        veiculo.id,
        tipoMedicao,
        tipoMedicao === "horimetro" && !isNaN(hNum) ? hNum : undefined,
      );

      if (res.success) {
        toast.success(
          tipoMedicao === "horimetro"
            ? "Métrica alterada para Horímetro. Horas de motor serão computadas em tempo real."
            : "Métrica alterada para Odômetro (KM).",
        );
        onSalvo?.(veiculo.id, tipoMedicao, !isNaN(hNum) ? hNum : 0);
        onFechar();
      } else {
        toast.error(res.message || "Não foi possível atualizar a métrica do veículo.");
      }
    } catch {
      toast.error("Erro inesperado ao salvar a métrica.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none">
        <div className="relative w-full max-w-lg rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[8px_8px_24px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Cabeçalho */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                {tipoMedicao === "horimetro" ? (
                  <Clock className="w-5 h-5" />
                ) : (
                  <Gauge className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                  Métrica Principal de Operação
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <PlacaMercosulBadge placa={veiculo.placa} tamanho="sm" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[180px]">
                    {veiculo.marca_modelo}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corpo */}
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Escolha a métrica oficial utilizada pelo sistema para telemetria, relatórios de uso e
              planos de manutenção preventiva deste veículo.
            </p>

            {/* Opções de Seleção */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: Odômetro (KM) */}
              <button
                type="button"
                onClick={() => setTipoMedicao("km")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  tipoMedicao === "km"
                    ? "bg-white dark:bg-slate-800/90 border-orange-500 shadow-md ring-2 ring-orange-500/20"
                    : "bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`p-2 rounded-xl ${
                      tipoMedicao === "km"
                        ? "bg-orange-500 text-white"
                        : "bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Gauge className="w-4 h-4" />
                  </div>
                  {tipoMedicao === "km" && (
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <div className="font-black text-xs text-slate-900 dark:text-slate-100 uppercase">
                  Odômetro (KM)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Monitoramento por quilômetros rodados. Recomendado para carros, motos, caminhões e
                  vans.
                </div>
              </button>

              {/* Opção 2: Horímetro (Horas) */}
              <button
                type="button"
                onClick={() => setTipoMedicao("horimetro")}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  tipoMedicao === "horimetro"
                    ? "bg-white dark:bg-slate-800/90 border-amber-500 shadow-md ring-2 ring-amber-500/20"
                    : "bg-white/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`p-2 rounded-xl ${
                      tipoMedicao === "horimetro"
                        ? "bg-amber-500 text-white"
                        : "bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </div>
                  {tipoMedicao === "horimetro" && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <div className="font-black text-xs text-slate-900 dark:text-slate-100 uppercase">
                  Horímetro (Horas)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Monitoramento por tempo de motor ligado. Recomendado para tratores, máquinas e
                  geradores.
                </div>
              </button>
            </div>

            {/* Campo de Ajuste de Horas quando Horímetro for Selecionado */}
            {tipoMedicao === "horimetro" && (
              <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Horas Atuais do Painel Físico</span>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                  Informe o valor que consta no horímetro do veículo. O sistema somará
                  automaticamente as horas trabalhadas em tempo real a cada transmissão com a chave
                  ligada.
                </p>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={horimetroHoras}
                    onChange={(e) => setHorimetroHoras(e.target.value)}
                    placeholder="Ex: 150.5"
                    className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/40 text-slate-900 dark:text-white font-mono font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/40"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                    HORAS
                  </span>
                </div>
              </div>
            )}

            {/* Alerta Informativo */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-400">
              <AlertCircle className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
              <span>
                Ao selecionar Horímetro, os planos de manutenção preventiva, limites e relatórios
                passam a ser calculados estritamente com base em horas de funcionamento.
              </span>
            </div>
          </div>

          {/* Rodapé de Ações */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={handleSalvar}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-98 transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{salvando ? "Salvando..." : "Salvar Métrica"}</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
