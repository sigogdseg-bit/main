import { useState } from "react";
import { X, Calendar, Check, Loader2, ShieldAlert } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { salvarTurno } from "../services/vigilanteService";
import type { Vigilante, PostoVigilancia, TurnoVigilancia } from "../types";
import { toast } from "sonner";

interface ModalEscalaTurnoProps {
  vigilantes: Vigilante[];
  postos: PostoVigilancia[];
  turnoEmEdicao?: TurnoVigilancia | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ModalEscalaTurno({
  vigilantes,
  postos,
  turnoEmEdicao,
  onFechar,
  onSalvo,
}: ModalEscalaTurnoProps) {
  const [vigilanteId, setVigilanteId] = useState(
    turnoEmEdicao?.vigilante_id || vigilantes[0]?.id || "",
  );
  const [postoId, setPostoId] = useState(turnoEmEdicao?.posto_id || postos[0]?.id || "");
  const [rastreadorImei, setRastreadorImei] = useState(turnoEmEdicao?.rastreador_imei || "");
  const [dataTurno, setDataTurno] = useState(
    turnoEmEdicao?.data_turno || new Date().toISOString().slice(0, 10),
  );
  const [horaInicio, setHoraInicio] = useState(
    turnoEmEdicao?.hora_inicio ? turnoEmEdicao.hora_inicio.slice(0, 5) : "18:00",
  );
  const [horaFim, setHoraFim] = useState(
    turnoEmEdicao?.hora_fim ? turnoEmEdicao.hora_fim.slice(0, 5) : "06:00",
  );
  const [status, setStatus] = useState<TurnoVigilancia["status"]>(
    turnoEmEdicao?.status || "em_andamento",
  );
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vigilanteId) {
      toast.error("Selecione um vigilante.");
      return;
    }
    if (!postoId) {
      toast.error("Selecione o posto de vigilância.");
      return;
    }
    if (!rastreadorImei.trim()) {
      toast.error("Informe o IMEI do rastreador portátil entregue ao vigilante.");
      return;
    }

    setSalvando(true);
    try {
      const res = await salvarTurno({
        id: turnoEmEdicao ? turnoEmEdicao.id : undefined,
        vigilante_id: vigilanteId,
        posto_id: postoId,
        rastreador_imei: rastreadorImei.trim(),
        data_turno: dataTurno,
        hora_inicio: `${horaInicio}:00`,
        hora_fim: `${horaFim}:00`,
        status,
      });

      if (res) {
        toast.success(
          turnoEmEdicao
            ? "Escala atualizada com sucesso!"
            : "Turno iniciado e rastreador vinculado ao vigilante!",
        );
        onSalvo();
        onFechar();
      } else {
        toast.error("Falha ao salvar escala de turno.");
      }
    } catch {
      toast.error("Erro ao salvar turno de vigilância.");
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
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {turnoEmEdicao ? "Editar Escala de Plantão" : "Alocação de Turno e Rastreador"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vincular vigilante, posto e rastreador portátil
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
                Vigilante *
              </label>
              <select
                required
                value={vigilanteId}
                onChange={(e) => setVigilanteId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              >
                {vigilantes.length === 0 && <option value="">Nenhum vigilante cadastrado</option>}
                {vigilantes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} {v.matricula ? `(${v.matricula})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Posto de Vigilância / Propriedade *
              </label>
              <select
                required
                value={postoId}
                onChange={(e) => setPostoId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              >
                {postos.length === 0 && <option value="">Nenhum posto cadastrado</option>}
                {postos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1 flex items-center justify-between">
                <span>IMEI do Rastreador Portátil *</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                  Hardware pessoal
                </span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 865893084677543"
                value={rastreadorImei}
                onChange={(e) => setRastreadorImei(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono font-bold"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Informe o número de 15 dígitos do aparelho entregue ao vigilante para este plantão.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Data
                </label>
                <input
                  type="date"
                  required
                  value={dataTurno}
                  onChange={(e) => setDataTurno(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Início
                </label>
                <input
                  type="time"
                  required
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Fim
                </label>
                <input
                  type="time"
                  required
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Status do Turno
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              >
                <option value="em_andamento">🟢 Em Andamento (Ativo)</option>
                <option value="agendado">📅 Agendado</option>
                <option value="concluido">⚪ Concluído</option>
                <option value="cancelado">🔴 Cancelado</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>
                  {salvando
                    ? "Salvando Escala..."
                    : turnoEmEdicao
                      ? "Salvar Alterações"
                      : "Iniciar / Escalar Turno"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
