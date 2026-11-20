import { useState } from "react";
import { X, Wrench, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import type { PlanoManutencaoItem, SalvarItemManutencaoPayload } from "../types";
import { salvarItemManutencao, excluirItemManutencao } from "../services/manutencaoService";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ItemManutencaoModalProps {
  itemParaEdicao?: PlanoManutencaoItem | null;
  veiculoId: string;
  placaVeiculo: string;
  tipoVeiculo?: string;
  tipoMedicao?: "km" | "horimetro";
  odometroAtual: number;
  horimetroAtual?: number;
  onFechar: () => void;
  onSucesso: () => void;
}

export function ItemManutencaoModal({
  itemParaEdicao,
  veiculoId,
  placaVeiculo,
  tipoVeiculo,
  tipoMedicao,
  odometroAtual,
  horimetroAtual = 0,
  onFechar,
  onSucesso,
}: ItemManutencaoModalProps) {
  const isEdicao = !!itemParaEdicao;
  const isMaquina =
    tipoVeiculo === "maquina" || tipoVeiculo === "trator" || tipoVeiculo === "equipamento";
  const isHorimetro = tipoMedicao === "horimetro" || isMaquina;

  const metricaAtual = isHorimetro ? horimetroAtual : odometroAtual;
  const unidade = isHorimetro ? "horas" : "km";
  const unidadeCurta = isHorimetro ? "h" : "km";

  const [itemNome, setItemNome] = useState(itemParaEdicao?.item_manutencao || "");
  const [intervaloKm, setIntervaloKm] = useState(
    itemParaEdicao?.intervalo_km || (isHorimetro ? 250 : 5000),
  );
  const [avisoAntecipadoKm, setAvisoAntecipadoKm] = useState(
    itemParaEdicao?.aviso_antecipado_km || (isHorimetro ? 25 : 500),
  );
  const [ultimoKm, setUltimoKm] = useState(
    itemParaEdicao ? itemParaEdicao.ultimo_km_realizado : metricaAtual,
  );
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const proximoAlvoCalculado = (Number(ultimoKm) || 0) + (Number(intervaloKm) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemNome.trim()) {
      toast.error("Informe o nome do item de manutenção preventiva.");
      return;
    }

    if (intervaloKm <= 0) {
      toast.error("O intervalo de quilometragem deve ser maior que zero.");
      return;
    }

    if (avisoAntecipadoKm < 0 || avisoAntecipadoKm >= intervaloKm) {
      toast.error("O aviso antecipado deve ser menor que o intervalo de quilometragem.");
      return;
    }

    setSalvando(true);
    const payload: SalvarItemManutencaoPayload = {
      id: itemParaEdicao?.id,
      veiculo_id: veiculoId,
      item_manutencao: itemNome.trim(),
      intervalo_km: Number(intervaloKm),
      aviso_antecipado_km: Number(avisoAntecipadoKm),
      ultimo_km_realizado: Number(ultimoKm) || 0,
    };

    const res = await salvarItemManutencao(payload);
    setSalvando(false);

    if (res.success) {
      toast.success(res.message);
      onSucesso();
      onFechar();
    } else {
      toast.error(res.message);
    }
  };

  const handleExcluir = async () => {
    if (!itemParaEdicao?.id) return;
    if (!window.confirm(`Confirma a remoção do item "${itemParaEdicao.item_manutencao}"?`)) {
      return;
    }

    setExcluindo(true);
    const res = await excluirItemManutencao(itemParaEdicao.id);
    setExcluindo(false);

    if (res.success) {
      toast.success(res.message);
      onSucesso();
      onFechar();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl transition-colors flex flex-col">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>{isEdicao ? "Editar Item de Revisão" : "Novo Item de Manutenção"}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-xs">
                    {placaVeiculo}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Parâmetros exclusivos de odômetro e aviso prévio
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              disabled={salvando || excluindo}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              {/* Nome do Item */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Item de Manutenção / Serviço
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Troca de Óleo e Filtro, Pastilhas, Correia Dentada..."
                  value={itemNome}
                  onChange={(e) => setItemNome(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-2xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-xs"
                />
              </div>

              {/* Grid de Configurações de Odômetro ou Horímetro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Intervalo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isMaquina ? "Intervalo do Ciclo (Horas)" : "Intervalo do Ciclo (Km)"}
                  </label>
                  <input
                    type="number"
                    min={isMaquina ? "25" : "500"}
                    step={isMaquina ? "25" : "500"}
                    required
                    value={intervaloKm}
                    onChange={(e) => setIntervaloKm(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-2xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isMaquina
                      ? "Ex: a cada 250h, 500h ou 1.000h"
                      : "Ex: a cada 5.000 ou 10.000 km"}
                  </span>
                </div>

                {/* Aviso Antecipado */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isMaquina ? "Aviso Antecipado (Horas)" : "Aviso Antecipado (Km)"}
                  </label>
                  <input
                    type="number"
                    min={isMaquina ? "5" : "100"}
                    step={isMaquina ? "5" : "100"}
                    required
                    value={avisoAntecipadoKm}
                    onChange={(e) => setAvisoAntecipadoKm(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-2xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {isMaquina ? "Alertar 25h antes da revisão" : "Alertar antes da meta"}
                  </span>
                </div>
              </div>

              {/* Último Odômetro / Horímetro Realizado */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isMaquina
                    ? "Horímetro da Última Realização (Horas)"
                    : "Odômetro da Última Realização (Km)"}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={ultimoKm}
                  onChange={(e) => setUltimoKm(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-2xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <span>
                    {isMaquina
                      ? `Horímetro atual da máquina: ${metricaAtual.toLocaleString()} horas`
                      : `Odômetro atual do veículo: ${odometroAtual.toLocaleString()} km`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUltimoKm(metricaAtual)}
                    className="text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                  >
                    Usar atual
                  </button>
                </div>
              </div>

              {/* Card Resumo do Próximo Alvo */}
              <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-between text-xs shadow-xs">
                <div>
                  <span className="text-orange-700 dark:text-orange-400 font-bold block">
                    Próxima Meta de Revisão
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isMaquina ? "Alvo calculado no horímetro" : "Alvo calculado no odômetro"}
                  </span>
                </div>
                <div className="text-base font-black font-mono text-orange-700 dark:text-orange-400">
                  {proximoAlvoCalculado.toLocaleString()} {unidadeCurta}
                </div>
              </div>
            </div>

            {/* Ações do Rodapé Fixo */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {isEdicao ? (
                <button
                  type="button"
                  onClick={handleExcluir}
                  disabled={salvando || excluindo}
                  className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={onFechar}
                  disabled={salvando || excluindo}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs transition flex items-center justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || excluindo}
                  className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 transition shadow-md shadow-orange-500/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{salvando ? "Salvando..." : "Salvar Configuração"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
