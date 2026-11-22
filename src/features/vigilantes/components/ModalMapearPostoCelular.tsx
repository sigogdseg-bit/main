import { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  MapPin,
  Clock,
  Compass,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  ChevronRight,
  Loader2,
  Building2,
  Footprints,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  salvarCheckpoint,
  calcularTemposDeslocamentoCheckpoints,
} from "../services/vigilanteService";
import { calcularDistanciaMetros } from "@/features/monitor-gps/services/protecaoVeiculoService";
import type { PostoVigilancia, RondaCheckpoint } from "../types";
import { toast } from "sonner";

interface PontoMapeadoTemp {
  idTemp: string;
  nome: string;
  latitude: number;
  longitude: number;
  precisaoMetros: number;
  timestamp: number;
  tempoGastoMinutosTrecho: number;
  distanciaMetrosTrecho: number;
}

interface ModalMapearPostoCelularProps {
  posto: PostoVigilancia;
  onFechar: () => void;
  onSalvo: () => void;
}

const SUGESTOES_NOMES_PONTOS = [
  "Portaria Principal",
  "Guarita Entrada",
  "Guarita Fundos",
  "Estacionamento",
  "Depósito Central",
  "Almoxarifado",
  "Docas de Carga",
  "Caixa d'Água",
  "Muro Norte",
  "Muro Sul",
  "Entrada Funcionários",
  "Fundos do Galpão",
  "Subestação Elétrica",
  "Pátio de Veículos",
];

export function ModalMapearPostoCelular({
  posto,
  onFechar,
  onSalvo,
}: ModalMapearPostoCelularProps) {
  // Estado do GPS do celular
  const [gpsAtivo, setGpsAtivo] = useState(false);
  const [coordsAtuais, setCoordsAtuais] = useState<{
    latitude: number;
    longitude: number;
    precisao: number;
  } | null>(null);
  const [erroGps, setErroGps] = useState<string | null>(null);

  // Controle de gravação da ronda em campo
  const [emGravacao, setEmGravacao] = useState(false);
  const [tempoInicio, setTempoInicio] = useState<number | null>(null);
  const [tempoDecorridoSegundos, setTempoDecorridoSegundos] = useState(0);
  const [pontosMapeados, setPontosMapeados] = useState<PontoMapeadoTemp[]>([]);

  // Modal rápido de nomeação do ponto
  const [modalNomeAberto, setModalNomeAberto] = useState(false);
  const [nomePontoAtual, setNomePontoAtual] = useState("");
  const [coordsPontoMarcado, setCoordsPontoMarcado] = useState<{
    latitude: number;
    longitude: number;
    precisao: number;
  } | null>(null);

  // Estado de finalização
  const [salvando, setSalvando] = useState(false);
  const [resumoFinal, setResumoFinal] = useState<{
    distanciaTotalMetros: number;
    tempoTotalMinutos: number;
    totalPontos: number;
  } | null>(null);

  const watchIdRef = useRef<number | null>(null);

  // Monitora GPS de alta precisão do aparelho móvel
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setErroGps("Geolocalização não suportada neste navegador.");
      return;
    }

    setGpsAtivo(true);
    setErroGps(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoordsAtuais({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisao: Math.round(pos.coords.accuracy || 0),
        });
        setErroGps(null);
      },
      (err) => {
        console.warn("Aviso de GPS móvel:", err.message);
        if (err.code === 1) {
          setErroGps("Permissão de localização negada. Habilite o GPS do celular.");
        } else if (err.code === 2) {
          setErroGps("Sinal de satélite GNSS fraco ou indisponível.");
        } else {
          setErroGps("Aguardando fixação das coordenadas do satélite...");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Cronômetro da ronda em tempo real
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (emGravacao && tempoInicio) {
      interval = setInterval(() => {
        const segs = Math.floor((Date.now() - tempoInicio) / 1000);
        setTempoDecorridoSegundos(segs);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [emGravacao, tempoInicio]);

  // Formatação do tempo HH:MM:SS
  const formatarTempo = (totalSegundos: number) => {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) {
      return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
    }
    return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
  };

  // Iniciar mapeamento
  const handleIniciarMapeamento = () => {
    if (!coordsAtuais) {
      toast.error("Aguarde a fixação do GPS antes de iniciar o mapeamento.");
      return;
    }
    setEmGravacao(true);
    setTempoInicio(Date.now());
    setTempoDecorridoSegundos(0);
    setPontosMapeados([]);
    setResumoFinal(null);
    toast.success(
      "Mapeamento iniciado! Caminhe pelo posto e acione o botão para marcar os pontos.",
    );
  };

  // Abrir tela para nomear ponto atual
  const handleAcionarMarcacao = () => {
    if (!coordsAtuais) {
      toast.error("Coordenadas GPS não disponíveis no momento.");
      return;
    }
    if (!emGravacao) {
      handleIniciarMapeamento();
    }
    setCoordsPontoMarcado(coordsAtuais);
    const sugestaoPadrao =
      pontosMapeados.length === 0 ? "Portaria Principal" : `Ponto ${pontosMapeados.length + 1}`;
    setNomePontoAtual(sugestaoPadrao);
    setModalNomeAberto(true);
  };

  // Confirmar ponto marcado
  const handleConfirmarPonto = () => {
    if (!coordsPontoMarcado) return;
    const nomeFinal = nomePontoAtual.trim() || `Ponto ${pontosMapeados.length + 1}`;

    const agora = Date.now();
    let tempoTrechoMinutos = 5;
    let distanciaTrechoMetros = 0;

    if (pontosMapeados.length > 0) {
      const pontoAnterior = pontosMapeados[pontosMapeados.length - 1];
      const deltaSegundos = Math.max(1, Math.floor((agora - pontoAnterior.timestamp) / 1000));
      tempoTrechoMinutos = Math.max(1, Math.ceil(deltaSegundos / 60));

      distanciaTrechoMetros = Math.round(
        calcularDistanciaMetros(
          pontoAnterior.latitude,
          pontoAnterior.longitude,
          coordsPontoMarcado.latitude,
          coordsPontoMarcado.longitude,
        ),
      );
    } else {
      // Primeiro ponto: tempo de início é 0 ou 1 min
      tempoTrechoMinutos = 1;
      distanciaTrechoMetros = 0;
    }

    const novoPonto: PontoMapeadoTemp = {
      idTemp: "temp-" + Date.now().toString(36),
      nome: nomeFinal,
      latitude: coordsPontoMarcado.latitude,
      longitude: coordsPontoMarcado.longitude,
      precisaoMetros: coordsPontoMarcado.precisao,
      timestamp: agora,
      tempoGastoMinutosTrecho: tempoTrechoMinutos,
      distanciaMetrosTrecho: distanciaTrechoMetros,
    };

    setPontosMapeados((prev) => [...prev, novoPonto]);
    setModalNomeAberto(false);
    toast.success(`Ponto "${nomeFinal}" registrado com sucesso no GPS!`);
  };

  // Remover ponto da lista temporária
  const handleRemoverPonto = (idTemp: string) => {
    setPontosMapeados((prev) => prev.filter((p) => p.idTemp !== idTemp));
    toast.info("Ponto removido da sequência.");
  };

  // Distância total acumulada
  const distanciaAcumuladaMetros = useMemo(() => {
    return pontosMapeados.reduce((acc, p) => acc + p.distanciaMetrosTrecho, 0);
  }, [pontosMapeados]);

  // Finalizar e salvar no banco
  const handleFinalizarMapeamento = async () => {
    if (pontosMapeados.length === 0) {
      toast.error("Marque ao menos um ponto de ronda antes de finalizar.");
      return;
    }

    setSalvando(true);
    try {
      const tempoTotalMinutosCalculado = Math.max(1, Math.ceil(tempoDecorridoSegundos / 60));

      // Salva cada ponto sequencialmente na tabela de rondas_checkpoints
      const listaSalva: RondaCheckpoint[] = [];

      for (let i = 0; i < pontosMapeados.length; i++) {
        const pt = pontosMapeados[i];
        const res = await salvarCheckpoint({
          posto_id: posto.id,
          nome: pt.nome,
          latitude: pt.latitude,
          longitude: pt.longitude,
          ordem: i + 1,
          tempo_deslocamento_minutos: pt.tempoGastoMinutosTrecho,
          distancia_metros: pt.distanciaMetrosTrecho,
          tolerancia_minutos: 3,
          raio_captura_metros: 15,
          cor_marcador: "#2563eb",
          ativo: true,
        });
        if (res) {
          listaSalva.push(res);
        }
      }

      // Recalcula circuito circular fechado e tempos proporcionais
      if (listaSalva.length > 0) {
        await calcularTemposDeslocamentoCheckpoints(posto.id, listaSalva);
      }

      setResumoFinal({
        distanciaTotalMetros: distanciaAcumuladaMetros,
        tempoTotalMinutos: tempoTotalMinutosCalculado,
        totalPontos: pontosMapeados.length,
      });

      setEmGravacao(false);
      toast.success(
        `Ronda do posto "${posto.nome}" mapeada com sucesso! ${pontosMapeados.length} pontos gravados.`,
      );
      onSalvo();
    } catch (err) {
      console.error("Erro ao salvar mapeamento do posto:", err);
      toast.error("Falha ao salvar os pontos da ronda.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                <Navigation className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Mapear Posto com Celular (GPS)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {posto.nome}
                  </span>
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

          {/* Conteúdo Principal */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* Barra de Status do GPS do Celular */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-3 w-3 rounded-full ${
                    coordsAtuais
                      ? coordsAtuais.precisao <= 10
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-amber-500 animate-pulse"
                      : "bg-red-500 animate-pulse"
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>GPS do Aparelho:</span>
                    <span
                      className={
                        coordsAtuais
                          ? coordsAtuais.precisao <= 10
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {coordsAtuais ? `Precisão ±${coordsAtuais.precisao}m` : "Buscando sinal..."}
                    </span>
                  </div>
                  {coordsAtuais ? (
                    <div className="text-[10px] font-mono text-slate-400">
                      {coordsAtuais.latitude.toFixed(6)}, {coordsAtuais.longitude.toFixed(6)}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400">
                      {erroGps || "Aguarde a recepção dos satélites GNSS"}
                    </div>
                  )}
                </div>
              </div>
              <Compass className="h-5 w-5 text-slate-400 shrink-0" />
            </div>

            {/* Painel de Cronometragem da Ronda ao Vivo */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20 text-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center justify-center gap-1.5">
                <Clock className="h-4 w-4" />
                Tempo Gasto no Mapeamento
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-slate-900 dark:text-slate-100 tracking-tight">
                {formatarTempo(tempoDecorridoSegundos)}
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-blue-500" />
                  {pontosMapeados.length} pontos marcados
                </span>
                <span className="flex items-center gap-1">
                  <Footprints className="h-3.5 w-3.5 text-emerald-500" />
                  {distanciaAcumuladaMetros}m percorridos
                </span>
              </div>
            </div>

            {/* Botão Principal de Ação Rápida no Celular */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAcionarMarcacao}
                disabled={salvando}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
              >
                <MapPin className="h-5 w-5 text-white" />
                <span>Marcar Ponto Aqui (GPS)</span>
              </button>
              <p className="text-[10px] text-center text-slate-500 dark:text-slate-400">
                Caminhe até o local físico no posto e toque no botão para registrar as coordenadas
                do ponto.
              </p>
            </div>

            {/* Sequência de Pontos Mapeados */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Sequência da Ronda ({pontosMapeados.length})
                </span>
                {pontosMapeados.length > 0 && (
                  <span className="text-[11px] text-slate-400">Circuito circular do posto</span>
                )}
              </div>

              {pontosMapeados.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-1">
                  <MapPin className="h-6 w-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nenhum ponto marcado ainda.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Inicie a caminhada no posto e toque em "Marcar Ponto Aqui (GPS)".
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {pontosMapeados.map((pt, idx) => (
                    <div
                      key={pt.idTemp}
                      className="p-3 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="h-6 w-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {pt.nome}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)} • ±
                            {pt.precisaoMetros}m
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-[11px] font-mono">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            ~{pt.tempoGastoMinutosTrecho} min
                          </div>
                          <div className="text-slate-400 text-[10px]">
                            {pt.distanciaMetrosTrecho}m
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoverPonto(pt.idTemp)}
                          className="p-1 text-slate-400 hover:text-red-500 transition"
                          title="Remover ponto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resumo Final Pós-Cálculo */}
            {resumoFinal && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Ronda Calculada e Salva com Sucesso!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60">
                    <span className="text-[10px] block opacity-70">Pontos</span>
                    <span className="text-sm font-bold">{resumoFinal.totalPontos}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60">
                    <span className="text-[10px] block opacity-70">Distância Total</span>
                    <span className="text-sm font-bold">{resumoFinal.distanciaTotalMetros}m</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60">
                    <span className="text-[10px] block opacity-70">Tempo da Ronda</span>
                    <span className="text-sm font-bold">~{resumoFinal.tempoTotalMinutos} min</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer com botão de finalizar e calcular */}
          <div className="p-4 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-100/50 dark:bg-slate-950/50">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={handleFinalizarMapeamento}
              disabled={salvando || pontosMapeados.length === 0}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Calculando e Salvando Ronda...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Finalizar Mapeamento e Calcular Ronda</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Rápido de Nomeação do Ponto Marcado */}
        {modalNomeAberto && coordsPontoMarcado && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-sm p-4 sm:p-5 space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-orange-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Nome do Ponto de Ronda
                  </h4>
                </div>
                <button
                  onClick={() => setModalNomeAberto(false)}
                  className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block mb-1">
                  Digite ou Selecione uma Sugestão:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={nomePontoAtual}
                  onChange={(e) => setNomePontoAtual(e.target.value)}
                  placeholder="Ex: Portaria Principal, Depósito Sul"
                  className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </div>

              {/* Sugestões de 1 Toque */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Sugestões Rápidas:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {SUGESTOES_NOMES_PONTOS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setNomePontoAtual(sug)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                        nomePontoAtual === sug
                          ? "bg-orange-500 text-white border-orange-500 font-bold"
                          : "bg-white dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalNomeAberto(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarPonto}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirmar Ponto</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
