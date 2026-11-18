import { useState } from "react";
import { X, MapPin, Check, Loader2, Clock, AlertTriangle } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { salvarCheckpoint } from "../services/vigilanteService";
import type { RondaCheckpoint } from "../types";
import { toast } from "sonner";

interface ModalNovoCheckpointProps {
  postoId: string;
  coordenadasIniciais?: { latitude: number; longitude: number };
  checkpointEmEdicao?: RondaCheckpoint | null;
  proximaOrdem?: number;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ModalNovoCheckpoint({
  postoId,
  coordenadasIniciais,
  checkpointEmEdicao,
  proximaOrdem = 1,
  onFechar,
  onSalvo,
}: ModalNovoCheckpointProps) {
  const [nome, setNome] = useState(checkpointEmEdicao?.nome || "");
  const [horarioPrevisto, setHorarioPrevisto] = useState(
    checkpointEmEdicao?.horario_previsto
      ? checkpointEmEdicao.horario_previsto.slice(0, 5)
      : "22:00",
  );
  const [ordem, setOrdem] = useState(checkpointEmEdicao?.ordem ?? proximaOrdem);
  const [toleranciaMinutos, setToleranciaMinutos] = useState(
    checkpointEmEdicao?.tolerancia_minutos ?? 3,
  );
  const [raioCapturaMetros, setRaioCapturaMetros] = useState(
    checkpointEmEdicao?.raio_captura_metros ?? 20,
  );
  const [latitude, setLatitude] = useState(
    checkpointEmEdicao?.latitude || coordenadasIniciais?.latitude || 0,
  );
  const [longitude, setLongitude] = useState(
    checkpointEmEdicao?.longitude || coordenadasIniciais?.longitude || 0,
  );
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome ou identificação do ponto de ronda.");
      return;
    }
    if (!horarioPrevisto) {
      toast.error("Informe o horário previsto para a passagem do vigilante.");
      return;
    }
    if (!latitude || !longitude) {
      toast.error("Coordenadas inválidas. Marque o ponto no mapa.");
      return;
    }

    setSalvando(true);
    try {
      const res = await salvarCheckpoint({
        id: checkpointEmEdicao ? checkpointEmEdicao.id : undefined,
        posto_id: postoId,
        nome: nome.trim(),
        latitude,
        longitude,
        ordem,
        horario_previsto: `${horarioPrevisto}:00`,
        tolerancia_minutos: toleranciaMinutos,
        raio_captura_metros: raioCapturaMetros,
        cor_marcador: "#2563eb", // Azul tático canônico
        ativo: true,
      });

      if (res) {
        toast.success(
          checkpointEmEdicao
            ? `Ponto de ronda "${nome}" atualizado com sucesso!`
            : `Ponto de ronda azul "${nome}" criado com sucesso!`,
        );
        onSalvo();
        onFechar();
      } else {
        toast.error("Falha ao salvar ponto de ronda.");
      }
    } catch {
      toast.error("Erro ao salvar ponto de ronda.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Ponto de Ronda Azul</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Checkpoint com horário estrito e janela de tolerância ±3min
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Nome do Ponto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Portaria Principal, Depósito Central, Muro Sul"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  Horário Previsto *
                </label>
                <input
                  type="time"
                  required
                  value={horarioPrevisto}
                  onChange={(e) => setHorarioPrevisto(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Ordem no Roteiro
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={ordem}
                  onChange={(e) => setOrdem(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Aviso da Janela Estrita */}
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Regra de Tolerância: ±{toleranciaMinutos} minutos</span>
              </div>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
                O vigilante deverá ser detectado neste ponto entre{" "}
                <strong>
                  {horarioPrevisto
                    ? `${horarioPrevisto} (-${toleranciaMinutos}m a +${toleranciaMinutos}m)`
                    : "--:--"}
                </strong>
                . Caso não compareça, um alerta sonoro e visual será emitido na Central e enviado
                via WhatsApp para a supervisão.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Tolerância (Minutos)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={toleranciaMinutos}
                  onChange={(e) => setToleranciaMinutos(parseInt(e.target.value, 10) || 3)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Raio Captura (Metros)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={raioCapturaMetros}
                  onChange={(e) => setRaioCapturaMetros(parseInt(e.target.value, 10) || 20)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-400 block font-sans text-[10px]">Lat:</span>
                <span className="text-slate-700 dark:text-slate-300">{latitude.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans text-[10px]">Lng:</span>
                <span className="text-slate-700 dark:text-slate-300">{longitude.toFixed(6)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>
                  {salvando
                    ? "Salvando Ponto..."
                    : checkpointEmEdicao
                      ? "Salvar Alterações"
                      : "Confirmar Checkpoint Azul"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
