import { useState, useEffect, useCallback } from "react";
import {
  X,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  Check,
  Play,
  StopCircle,
  MapPin,
  Clock,
  Loader2,
  Route,
  Bookmark,
  ExternalLink,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import {
  listarRotasMonitoradas,
  encerrarRotaMonitorada,
  excluirRotaMonitorada,
  atualizarRotaMonitorada,
  type RotaMonitorada,
} from "../services/rotaMonitoradaService";
import {
  listarTrajetosSalvos,
  excluirTrajetoDoBanco,
  type TrajetoSalvo,
} from "../services/trajetoSalvoService";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";

interface PainelRotasMonitoradasModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
  onAbrirNovoTrajeto: () => void;
  onAbrirComTrajeto?: (trajeto: TrajetoSalvo) => void;
  onFocarRotaNoMapa?: (coordenadas: [number, number][]) => void;
}

export function PainelRotasMonitoradasModal({
  veiculo,
  onFechar,
  onAbrirNovoTrajeto,
  onAbrirComTrajeto,
  onFocarRotaNoMapa,
}: PainelRotasMonitoradasModalProps) {
  const { session } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState<"monitoradas" | "salvas">("monitoradas");
  const [rotas, setRotas] = useState<RotaMonitorada[]>([]);
  const [trajetosSalvos, setTrajetosSalvos] = useState<TrajetoSalvo[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estados de edição de rota
  const [editandoRotaId, setEditandoRotaId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [toleranciaEditada, setToleranciaEditada] = useState(250);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [resRotas, resTrajetos] = await Promise.all([
        listarRotasMonitoradas(veiculo.id),
        session ? listarTrajetosSalvos(session.userId) : Promise.resolve([]),
      ]);
      setRotas(resRotas);
      setTrajetosSalvos(resTrajetos);
    } catch {
      toast.error("Erro ao carregar dados de rotas do veículo.");
    } finally {
      setCarregando(false);
    }
  }, [veiculo.id, session]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleEncerrar = async (rotaId: string) => {
    if (!window.confirm("Deseja encerrar o monitoramento ativo desta rota?")) return;
    const ok = await encerrarRotaMonitorada(rotaId, "concluida");
    if (ok) {
      toast.success("Rota monitorada encerrada com sucesso!");
      carregarDados();
    } else {
      toast.error("Falha ao encerrar rota monitorada.");
    }
  };

  const handleExcluirRota = async (rotaId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta rota monitorada do histórico?"))
      return;
    const ok = await excluirRotaMonitorada(rotaId);
    if (ok) {
      toast.success("Rota monitorada excluída com sucesso do banco de dados!");
      carregarDados();
    } else {
      toast.error("Falha ao excluir rota monitorada.");
    }
  };

  const handleSalvarEdicao = async (rotaId: string) => {
    setSalvandoEdicao(true);
    const ok = await atualizarRotaMonitorada(rotaId, {
      nome: nomeEditado,
      toleranciaMetros: toleranciaEditada,
    });
    setSalvandoEdicao(false);
    if (ok) {
      toast.success("Configuração da rota monitorada atualizada!");
      setEditandoRotaId(null);
      carregarDados();
    } else {
      toast.error("Erro ao atualizar rota.");
    }
  };

  const handleExcluirTrajetoSalvo = async (trajetoId: string) => {
    if (!session) return;
    if (!window.confirm("Deseja excluir este trajeto salvo do banco de dados?")) return;
    const res = await excluirTrajetoDoBanco(session.userId, trajetoId);
    if (res.sucesso) {
      toast.success("Trajeto salvo removido com sucesso!");
      carregarDados();
    } else {
      toast.error("Erro ao excluir trajeto salvo.");
    }
  };

  const rotasAtivas = rotas.filter((r) => r.status === "ativa" || r.status === "em_desvio");
  const rotasHistorico = rotas.filter((r) => r.status !== "ativa" && r.status !== "em_desvio");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none animate-fadeIn overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden pb-safe my-auto">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Rotas e Trajetos Monitorados
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhamento em tempo real de corredores viários e alerta de desvios
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

          {/* Abas Superiores com Layout Responsivo Mobile / Desktop */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-3 sm:px-5 py-2.5 bg-[#eaf0f8]/80 dark:bg-slate-950/50 border-b border-slate-300/60 dark:border-slate-800 shrink-0 gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x flex-nowrap shrink-0">
              <button
                onClick={() => setAbaAtiva("monitoradas")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  abaAtiva === "monitoradas"
                    ? "bg-orange-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Navigation className="h-3.5 w-3.5 shrink-0" />
                <span>Rotas Monitoradas ({rotas.length})</span>
              </button>

              <button
                onClick={() => setAbaAtiva("salvas")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                  abaAtiva === "salvas"
                    ? "bg-orange-500 text-slate-950 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0" />
                <span>Trajetos Salvos ({trajetosSalvos.length}/5)</span>
              </button>
            </div>

            <button
              onClick={() => {
                onFechar();
                onAbrirNovoTrajeto();
              }}
              className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-sm hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Play className="h-3 w-3 fill-current shrink-0" />
              <span>Criar Nova Rota</span>
            </button>
          </div>

          {/* Conteúdo com Scroll */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {carregando ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                <span className="text-xs">Carregando rotas do veículo...</span>
              </div>
            ) : abaAtiva === "monitoradas" ? (
              /* ABA 1: ROTAS MONITORADAS */
              <div className="space-y-4">
                {/* Rotas Ativas */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                    Monitoramento em Andamento ({rotasAtivas.length})
                  </h4>

                  {rotasAtivas.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                      Nenhuma rota monitorada ativa no momento para este veículo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rotasAtivas.map((r) => {
                        const isDesvio = r.desvio_detectado || r.status === "em_desvio";
                        const isEditando = editandoRotaId === r.id;

                        return (
                          <div
                            key={r.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              isDesvio
                                ? "bg-rose-500/10 border-rose-500/30"
                                : "bg-orange-500/10 border-orange-500/30"
                            }`}
                          >
                            {isEditando ? (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label
                                    htmlFor="rota-monitorada-nome"
                                    className="text-[11px] font-bold text-slate-400"
                                  >
                                    Nome da Rota
                                  </label>
                                  <input
                                    id="rota-monitorada-nome"
                                    name="rota-monitorada-nome"
                                    type="text"
                                    value={nomeEditado}
                                    onChange={(e) => setNomeEditado(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 shadow-inner"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    Tolerância de Desvio Permitida
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {[100, 250, 500, 1000].map((tol) => (
                                      <button
                                        key={tol}
                                        type="button"
                                        onClick={() => setToleranciaEditada(tol)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                                          toleranciaEditada === tol
                                            ? "bg-orange-500 text-slate-950 border-orange-400 shadow-xs"
                                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        {tol}m
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditandoRotaId(null)}
                                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={salvandoEdicao}
                                    onClick={() => handleSalvarEdicao(r.id)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 text-slate-950 flex items-center gap-1"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                      {r.nome}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                        isDesvio
                                          ? "bg-rose-500 text-white animate-pulse"
                                          : "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                                      }`}
                                    >
                                      {isDesvio ? "Desvio Detectado" : "Na Rota"}
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span>Tolerância: {r.tolerancia_desvio_metros}m</span>
                                    <span>·</span>
                                    <span>
                                      Distância da rota: {r.ultima_distancia_desvio_m || 0}m
                                    </span>
                                    <span>·</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3 text-slate-400" />
                                      Iniciada:{" "}
                                      {new Date(r.iniciada_at).toLocaleTimeString("pt-BR")}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {onFocarRotaNoMapa && r.coordenadas_rota?.length > 0 && (
                                    <button
                                      onClick={() => {
                                        onFocarRotaNoMapa(r.coordenadas_rota);
                                        onFechar();
                                      }}
                                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-orange-500 hover:text-slate-950 transition"
                                      title="Ver traçado no mapa"
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      setEditandoRotaId(r.id);
                                      setNomeEditado(r.nome);
                                      setToleranciaEditada(r.tolerancia_desvio_metros || 250);
                                    }}
                                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                    title="Alterar tolerância ou nome da rota"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>

                                  <button
                                    onClick={() => handleEncerrar(r.id)}
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition text-xs font-bold flex items-center gap-1"
                                    title="Encerrar monitoramento da rota"
                                  >
                                    <StopCircle className="h-3.5 w-3.5" />
                                    <span>Encerrar</span>
                                  </button>

                                  <button
                                    onClick={() => handleExcluirRota(r.id)}
                                    className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/20 transition"
                                    title="Excluir rota monitorada"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Histórico de Rotas Encerradas */}
                {rotasHistorico.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                      Histórico de Rotas Concluídas
                    </h4>

                    <div className="space-y-2">
                      {rotasHistorico.map((r) => (
                        <div
                          key={r.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {r.nome}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Iniciada: {new Date(r.iniciada_at).toLocaleString("pt-BR")} · Status:{" "}
                              <span className="capitalize">{r.status}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {onFocarRotaNoMapa && r.coordenadas_rota?.length > 0 && (
                              <button
                                onClick={() => {
                                  onFocarRotaNoMapa(r.coordenadas_rota);
                                  onFechar();
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-orange-400"
                                title="Visualizar traçado"
                              >
                                <MapPin className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleExcluirRota(r.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                              title="Excluir do histórico"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ABA 2: TRAJETOS SALVOS */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Trajetos Gravados na sua Conta</span>
                  <span className="font-mono font-bold text-orange-500">
                    {trajetosSalvos.length} de 5 utilizados
                  </span>
                </div>

                {trajetosSalvos.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <Bookmark className="h-8 w-8 text-slate-400 mx-auto" />
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Nenhum trajeto salvo ainda.
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      Você pode salvar até 5 trajetos frequentes com saídas, paradas e destinos
                      otimizados pela IA para iniciar o monitoramento com 1 clique.
                    </p>
                  </div>
                ) : (
                  trajetosSalvos.map((ts) => (
                    <div
                      key={ts.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>{ts.nome}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono">
                            {ts.distancia_km} km · {ts.duracao_minutos} min
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                          <div className="truncate">
                            <strong>Origem:</strong> {ts.saida.endereco}
                          </div>
                          <div className="truncate">
                            <strong>Destino:</strong> {ts.chegada.endereco}
                          </div>
                          {ts.paradas.length > 0 && (
                            <div className="text-[11px] text-orange-600 dark:text-orange-400">
                              {ts.paradas.length} parada(s) intermediária(s) otimizada(s)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            onFechar();
                            if (onAbrirComTrajeto) {
                              onAbrirComTrajeto(ts);
                            } else {
                              onAbrirNovoTrajeto();
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-orange-500 text-slate-950 font-bold text-xs hover:brightness-110 transition flex items-center gap-1"
                          title="Carregar trajeto para monitoramento"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Carregar</span>
                        </button>

                        <button
                          onClick={() => handleExcluirTrajetoSalvo(ts.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Excluir trajeto salvo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
