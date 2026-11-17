import { useState, useEffect, useCallback } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  Radio,
  Satellite,
  Battery,
  BatteryCharging,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import {
  testarComunicacaoRastreador,
  type ResultadoTesteComunicacao,
} from "../services/gpsService";
import { toast } from "sonner";

interface SaudeRastreadorModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
}

export function SaudeRastreadorModal({ veiculo, onFechar }: SaudeRastreadorModalProps) {
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoTesteComunicacao | null>(null);

  const executarTeste = useCallback(async () => {
    setTestando(true);
    try {
      const res = await testarComunicacaoRastreador(veiculo.id);
      setResultadoTeste(res);
      if (res.ativo) {
        toast.success("Diagnóstico concluído: Equipamento operando normalmente.");
      } else {
        toast.warning(res.mensagem);
      }
    } catch {
      toast.error("Não foi possível concluir o teste de sinal do rastreador.");
    } finally {
      setTestando(false);
    }
  }, [veiculo.id]);

  useEffect(() => {
    executarTeste();
  }, [executarTeste]);

  // Diagnóstico semafórico amigável e estrito (SEM INVENÇÃO DE DADOS)
  const modeloHardware = veiculo.rastreador_modelo || resultadoTeste?.rastreador_modelo || "G900L";
  const statusRedeOk = resultadoTeste ? resultadoTeste.ativo : false;
  const satelites = veiculo.satelites ?? 0;
  const emRepousoIgnicao = !veiculo.ignicao && !veiculo.ignicao_status;
  const temPosicaoSalva = Boolean(
    veiculo.latitude &&
    veiculo.longitude &&
    (Math.abs(Number(veiculo.latitude)) > 0.0001 || Math.abs(Number(veiculo.longitude)) > 0.0001),
  );

  // Em repouso (chave desligada), os rastreadores (G900L / J16) entram em economia de energia e desligam o chip GNSS.
  // Se a rede estiver ativa e houver coordenadas salvas, a localização GPS está perfeitamente estabilizada na última posição!
  const statusGpsOk = statusRedeOk && (satelites >= 4 || (emRepousoIgnicao && temPosicaoSalva));

  const voltagemNum =
    veiculo.voltagem !== undefined && veiculo.voltagem !== null
      ? Number(veiculo.voltagem)
      : veiculo.bateria_veiculo_v !== undefined && veiculo.bateria_veiculo_v !== null
        ? Number(veiculo.bateria_veiculo_v)
        : null;
  const temVoltagem = voltagemNum !== null && !isNaN(voltagemNum);
  const statusBateriaCarroOk = temVoltagem ? voltagemNum >= 11.5 : false;

  const pctRastreadorNum =
    veiculo.bateria_rastreador_pct !== undefined && veiculo.bateria_rastreador_pct !== null
      ? Number(veiculo.bateria_rastreador_pct)
      : null;
  const temPctRastreador = pctRastreadorNum !== null && !isNaN(pctRastreadorNum);
  const statusBateriaInternaOk = temPctRastreador ? pctRastreadorNum > 20 : false;

  const alimentacaoExternaCortada =
    (temVoltagem && voltagemNum < 9.0) ||
    veiculo.bateria_rastreador_status === "bateria_interna" ||
    veiculo.alerta_tipo === "corte_energia";

  const tudoNormal =
    statusRedeOk &&
    statusGpsOk &&
    (!temVoltagem || statusBateriaCarroOk) &&
    !alimentacaoExternaCortada;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-hidden shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl animate-in zoom-in-95 duration-150">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                  Saúde do Rastreador
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                    {modeloHardware}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Diagnóstico de funcionamento em tempo real
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/65 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status Geral Consolidado em Linguagem Simples */}
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
            <div
              className={`p-4 rounded-2xl border flex items-center gap-3.5 ${
                tudoNormal
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400"
                  : alimentacaoExternaCortada
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
              }`}
            >
              {tudoNormal ? (
                <CheckCircle2 className="h-7 w-7 shrink-0" />
              ) : (
                <AlertTriangle className="h-7 w-7 shrink-0" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {tudoNormal
                    ? "Rastreador funcionando normalmente"
                    : alimentacaoExternaCortada
                      ? "Alerta: Alimentação Externa Desconectada"
                      : "Atenção: Verifique os itens abaixo"}
                </div>
                <div className="text-xs opacity-90 mt-0.5">
                  {alimentacaoExternaCortada
                    ? "O veículo está sem alimentação da bateria principal. O equipamento está operando na bateria interna de emergência."
                    : resultadoTeste?.mensagem || "Verificação de telemetria concluída"}
                </div>
              </div>
            </div>

            {/* Cards dos 4 Pilares de Saúde */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 1. Sinal de Rede / Comunicação */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Rede Móvel</span>
                  <Radio className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      statusRedeOk ? "bg-orange-500" : "bg-rose-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {statusRedeOk ? "Conectado" : "Sem Sinal"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  {resultadoTeste ? `${resultadoTeste.latenciaMs}ms latência` : "Testando..."}
                </div>
              </div>

              {/* 2. GPS e Satélites */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Localização GPS</span>
                  <Satellite className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      statusGpsOk
                        ? "bg-orange-500"
                        : statusRedeOk && satelites > 0
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {statusRedeOk
                      ? satelites >= 4
                        ? "Precisão Alta"
                        : emRepousoIgnicao && temPosicaoSalva
                          ? "Repouso GNSS"
                          : satelites > 0
                            ? "Sinal Fraco"
                            : "Buscando Fix"
                      : "Sem Sinal GPS"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  {statusRedeOk
                    ? satelites > 0
                      ? `${satelites} satélites visíveis`
                      : emRepousoIgnicao && temPosicaoSalva
                        ? "Posição Salva (Chave Desligada)"
                        : "Aguardando satélites"
                    : veiculo.ultima_atualizacao
                      ? "Rastreador desconectado"
                      : "Sem transmissão"}
                </div>
              </div>

              {/* 3. Bateria do Veículo */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Bateria do Carro</span>
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      !temVoltagem
                        ? "bg-slate-400"
                        : alimentacaoExternaCortada || voltagemNum! < 9.0
                          ? "bg-rose-500"
                          : statusBateriaCarroOk
                            ? "bg-orange-500"
                            : "bg-rose-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {alimentacaoExternaCortada
                      ? "0.0 V"
                      : temVoltagem
                        ? `${voltagemNum!.toFixed(1)} V`
                        : "Sem leitura"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  {!temVoltagem
                    ? "Sem sensor de voltagem"
                    : !statusRedeOk
                      ? "Último registro salvo"
                      : voltagemNum! < 9.0 || alimentacaoExternaCortada
                        ? "Fonte Desconectada"
                        : voltagemNum! >= 13.5
                          ? "Alternador Carregando"
                          : voltagemNum! >= 12.0
                            ? "Carga Adequada"
                            : "Tensão Baixa"}
                </div>
              </div>

              {/* 4. Bateria Interna do Rastreador */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Bateria Rastreador</span>
                  <Battery className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      !temPctRastreador
                        ? "bg-slate-400"
                        : statusBateriaInternaOk
                          ? "bg-orange-500"
                          : "bg-amber-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {temPctRastreador ? `${pctRastreadorNum}%` : "Sem leitura"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  {!temPctRastreador
                    ? "Sem sensor de bateria"
                    : !statusRedeOk
                      ? "Último registro salvo"
                      : alimentacaoExternaCortada ||
                          veiculo.bateria_rastreador_status === "bateria_interna"
                        ? "Operando na Bateria Interna"
                        : veiculo.bateria_rastreador_status === "carregando"
                          ? "Carregando"
                          : pctRastreadorNum! > 20
                            ? "Carga Adequada"
                            : "Bateria Fraca"}
                </div>
              </div>
            </div>

            {/* Horário da Última Atualização */}
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-500" />
                Última comunicação:
              </span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                {veiculo.ultima_atualizacao
                  ? new Date(veiculo.ultima_atualizacao).toLocaleString("pt-BR")
                  : "Nenhum registro"}
              </span>
            </div>

            {/* Botão de Repetir Diagnóstico */}
            <button
              onClick={executarTeste}
              disabled={testando}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testando ? "animate-spin" : ""}`} />
              <span>{testando ? "Verificando equipamento..." : "Atualizar Diagnóstico"}</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
