import { useState } from "react";
import { X, UserCheck, Check, Loader2 } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { salvarVigilante } from "../services/vigilanteService";
import type { Vigilante } from "../types";
import { toast } from "sonner";

interface ModalNovoVigilanteProps {
  vigilanteEmEdicao?: Vigilante | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ModalNovoVigilante({
  vigilanteEmEdicao,
  onFechar,
  onSalvo,
}: ModalNovoVigilanteProps) {
  const [nome, setNome] = useState(vigilanteEmEdicao?.nome || "");
  const [cpf, setCpf] = useState(vigilanteEmEdicao?.cpf || "");
  const [matricula, setMatricula] = useState(vigilanteEmEdicao?.matricula || "");
  const [telefone, setTelefone] = useState(vigilanteEmEdicao?.telefone || "");
  const [turnoPadrao, setTurnoPadrao] = useState<Vigilante["turno_padrao"]>(
    vigilanteEmEdicao?.turno_padrao || "12x36",
  );
  const [observacoes, setObservacoes] = useState(vigilanteEmEdicao?.observacoes || "");
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome completo do vigilante.");
      return;
    }

    setSalvando(true);
    try {
      const res = await salvarVigilante({
        id: vigilanteEmEdicao ? vigilanteEmEdicao.id : undefined,
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        matricula: matricula.trim() || null,
        telefone: telefone.trim() || null,
        turno_padrao: turnoPadrao,
        observacoes: observacoes.trim() || null,
        ativo: true,
      });

      if (res) {
        toast.success(
          vigilanteEmEdicao
            ? `Vigilante ${nome} atualizado com sucesso!`
            : `Vigilante ${nome} cadastrado com sucesso!`,
        );
        onSalvo();
        onFechar();
      } else {
        toast.error("Falha ao salvar vigilante.");
      }
    } catch {
      toast.error("Erro ao salvar cadastro do vigilante.");
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
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {vigilanteEmEdicao ? "Editar Vigilante" : "Novo Vigilante"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cadastro de profissional para rastreamento pessoal
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
                Nome Completo *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Carlos Alberto da Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  CPF
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Matrícula / ID
                </label>
                <input
                  type="text"
                  placeholder="VIG-042"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="(24) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Escala Padrão
                </label>
                <select
                  value={turnoPadrao}
                  onChange={(e) => setTurnoPadrao(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="12x36">12x36 (Padrão)</option>
                  <option value="noturno">Noturno Fixo</option>
                  <option value="diurno">Diurno Fixo</option>
                  <option value="24x48">24x48</option>
                  <option value="personalizado">Personalizado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Observações Operacionais
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Porte de rádio VHF, credencial de acesso aos blocos internos..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 resize-none"
              />
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
                    ? "Salvando..."
                    : vigilanteEmEdicao
                      ? "Salvar Alterações"
                      : "Cadastrar Vigilante"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
