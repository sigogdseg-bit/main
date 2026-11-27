import { useState, useEffect, useCallback } from "react";
import {
  X,
  Bell,
  CheckCheck,
  ShieldAlert,
  AlertTriangle,
  Radio,
  Zap,
  Gauge,
  MapPin,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { VeiculoGps, AlertaSeguranca } from "../types";
import { carregarAlertasSeguranca, reconhecerAlertaSeguranca } from "../services/gpsService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { WebPushConfigModal } from "@/shared/components/WebPushConfigModal";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ehAlertaRestritoEquipeTecnica } from "../constants/alertasCatalogo";

interface CentralAlertasModalProps {
  veiculo?: VeiculoGps | null;
  onFechar: () => void;
  aberto?: boolean;
  veiculos?: VeiculoGps[];
  onSelectVeiculo?: (v: VeiculoGps) => void;
}

export function CentralAlertasModal({
  veiculo,
  onFechar,
  aberto,
  veiculos,
  onSelectVeiculo,
}: CentralAlertasModalProps) {
  const { session } = useAuth();
  const isEquipeTecnica = Boolean(session?.isSuperAdmin || session?.isAdmin || session?.isOperador);
  const [alertas, setAlertas] = useState<AlertaSeguranca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendentes" | "reconhecidos">("todos");
  const [filtroVeiculoId, setFiltroVeiculoId] = useState<string>(veiculo?.id || "todos");
  const [modalWebPushAberto, setModalWebPushAberto] = useState(false);
  const [enviandoNotifId, setEnviandoNotifId] = useState<string | null>(null);

  useEffect(() => {
    if (veiculo?.id) {
      setFiltroVeiculoId(veiculo.id);
    }
  }, [veiculo?.id]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const idBusca = filtroVeiculoId !== "todos" ? filtroVeiculoId : undefined;
      const res = await carregarAlertasSeguranca(idBusca);
      setAlertas(res.filter((a) => isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(a.tipo)));
    } catch {
      setAlertas([]);
    } finally {
      setCarregando(false);
    }
  }, [filtroVeiculoId, isEquipeTecnica]);

  useEffect(() => {
    if (aberto !== undefined && !aberto) return;

    carregar();

    const canal = supabase
      .channel("hunter_central_alertas_realtime_modal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alertas_seguranca",
        },
        () => {
          carregar();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [aberto, carregar]);

  if (aberto !== undefined && !aberto) return null;

  const handleReconhecer = async (id: string) => {
    const ok = await reconhecerAlertaSeguranca(id);
    if (ok) {
      toast.success("Alerta reconhecido com sucesso.");
      carregar();
    } else {
      toast.error("Falha ao reconhecer alerta.");
    }
  };

  const alertasFiltrados = alertas.filter((a) => {
    if (!isEquipeTecnica && ehAlertaRestritoEquipeTecnica(a.tipo)) return false;
    if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
    if (filtroStatus === "pendentes" && a.reconhecido) return false;
    if (filtroStatus === "reconhecidos" && !a.reconhecido) return false;
    return true;
  });

  const getSeveridadeBadge = (gravidade: string) => {
    switch (gravidade) {
      case "critica":
        return "bg-rose-500 text-white font-black animate-pulse";
      case "alta":
        return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30";
      case "media":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30";
      default:
        return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30";
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Central de Alertas e Segurança
                  {veiculo && (
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                      {veiculo.placa}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ocorrências de telemetria, eventos e anomalias registradas
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Barra de Filtros e Ações */}
          <div className="p-3 bg-[#eaf0f8]/80 dark:bg-slate-950/40 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 font-medium shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] dark:shadow-none"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="suspeita_jammer">🛑 Suspeita de Jammer / Silenciamento</option>
                <option value="desvio_rota">⚠️ Desvio de Rota</option>
                <option value="saida_area">📍 Saída de Área Segura</option>
                <option value="capotamento_inclinacao">Capotamento / Inclinação</option>
                <option value="colisao_impacto">Colisão / Impacto / Toque</option>
                <option value="guincho">🚨 Guincho / Reboque Não Autorizado</option>
                <option value="parada_repentina_colisao">Parada Repentina / Colisão</option>
                <option value="comportamento_anormal">Comportamento Anormal</option>
                <option value="bateria_desconectada">Corte de Bateria</option>
                {isEquipeTecnica && (
                  <option value="corte_nao_autorizado_sms">🛡️ Defesa Ativa: Sabotagem SMS</option>
                )}
              </select>

              {veiculos && veiculos.length > 1 && (
                <select
                  value={filtroVeiculoId}
                  onChange={(e) => {
                    setFiltroVeiculoId(e.target.value);
                    if (onSelectVeiculo && e.target.value !== "todos") {
                      const v = veiculos.find((x) => x.id === e.target.value);
                      if (v) onSelectVeiculo(v);
                    }
                  }}
                  className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 font-medium shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] dark:shadow-none"
                >
                  <option value="todos">Toda a Frota ({veiculos.length})</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} ({v.marca_modelo})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center rounded-xl bg-slate-200/80 dark:bg-slate-800 p-0.5 text-xs shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none">
                <button
                  onClick={() => setFiltroStatus("todos")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filtroStatus === "todos"
                      ? "bg-[#eaf0f8] dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroStatus("pendentes")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filtroStatus === "pendentes"
                      ? "bg-[#eaf0f8] dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  Pendentes
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalWebPushAberto(true)}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition flex items-center gap-1.5 shadow-xs"
                title="Configurar Notificações no Dispositivo (Push)"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Notificações no Dispositivo</span>
              </button>

              <button
                onClick={carregar}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Atualizar alertas"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Lista de Alertas */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
            {carregando ? (
              <div className="text-center py-12 text-slate-400 text-xs">Carregando alertas...</div>
            ) : alertasFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Nenhum alerta encontrado com os filtros selecionados.
              </div>
            ) : (
              alertasFiltrados.map((alerta) => {
                const ehJammer = alerta.tipo === "suspeita_jammer";
                const ehSigiloTecnico = ehAlertaRestritoEquipeTecnica(alerta.tipo);
                const dadosWhats = {
                  tipo: (ehJammer ? "suspeita_jammer" : alerta.tipo) as any,
                  titulo: alerta.tipo.replace(/_/g, " "),
                  descricao: alerta.detalhes,
                  placa: alerta.placa || "VEÍCULO",
                  modelo: alerta.marca_modelo,
                  clienteNome: alerta.cliente_nome,
                  clienteTelefone: alerta.cliente_telefone,
                  velocidade: alerta.velocidade,
                  latitude: alerta.latitude,
                  longitude: alerta.longitude,
                  dataHora: alerta.created_at,
                };

                const handleNotificarClienteImediato = async () => {
                  if (ehSigiloTecnico) {
                    toast.error(
                      "Alerta restrito à equipe técnica; envio ao cliente bloqueado por sigilo operacional.",
                    );
                    return;
                  }
                  setEnviandoNotifId(alerta.id);
                  try {
                    const ok = await enviarNotificacaoViaBd({
                      destinatarioClienteId: alerta.cliente_id,
                      titulo: ehJammer
                        ? "🚨 SUSPEITA DE JAMMER / CORTE DE SINAL"
                        : `🚨 ALERTA: ${alerta.tipo.replace(/_/g, " ").toUpperCase()}`,
                      mensagem: `${alerta.placa ? `[${alerta.placa}] ` : ""}${alerta.detalhes}`,
                      tipo: ehJammer ? "jammer" : alerta.tipo,
                      url: "/monitor-gps",
                      placa: alerta.placa,
                    });
                    if (ok) {
                      toast.success("Notificação imediata enviada ao cliente com sucesso!");
                    } else {
                      toast.error("Falha ao emitir notificação para o cliente.");
                    }
                  } catch {
                    toast.error("Erro ao emitir notificação imediata.");
                  } finally {
                    setEnviandoNotifId(null);
                  }
                };

                return (
                  <div
                    key={alerta.id}
                    className={`p-3.5 rounded-2xl border transition flex flex-col gap-2 ${
                      ehJammer
                        ? "bg-rose-950/20 border-rose-500/60 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/40"
                        : alerta.reconhecido
                          ? "bg-[#eaf0f8]/60 dark:bg-slate-950/30 border-slate-300/40 dark:border-slate-800/60 opacity-80"
                          : "bg-[#eaf0f8] dark:bg-slate-950/70 border-slate-300/70 dark:border-slate-700 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                            ehJammer
                              ? "bg-rose-500 text-white font-black animate-pulse"
                              : getSeveridadeBadge(alerta.gravidade)
                          }`}
                        >
                          {ehJammer ? "CRÍTICO / JAMMER" : alerta.gravidade}
                        </span>
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {alerta.placa ? `${alerta.placa} · ` : ""}
                          {ehJammer
                            ? "SUSPEITA DE JAMMER / CORTE DE SINAL"
                            : alerta.tipo.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>

                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {new Date(alerta.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {alerta.detalhes}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] gap-2 flex-wrap">
                      <div className="flex items-center gap-3 text-slate-500 font-mono">
                        <span>Vel: {alerta.velocidade} km/h</span>
                        {alerta.latitude && alerta.longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-500 hover:underline flex items-center gap-0.5"
                          >
                            <MapPin className="h-3 w-3" />
                            <span>Mapa</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!ehSigiloTecnico && (
                          <button
                            onClick={handleNotificarClienteImediato}
                            disabled={enviandoNotifId === alerta.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition flex items-center gap-1 shadow-xs"
                            title="Enviar notificação imediata ao cliente"
                          >
                            <Bell className="h-3.5 w-3.5" />
                            <span>
                              {enviandoNotifId === alerta.id ? "Enviando..." : "Notificar"}
                            </span>
                          </button>
                        )}

                        {!alerta.reconhecido ? (
                          <button
                            onClick={() => handleReconhecer(alerta.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition flex items-center gap-1"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            <span>Reconhecer</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <CheckCheck className="h-3.5 w-3.5 text-orange-500" />
                            Reconhecido
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal de Configuração de Web Push no Dispositivo */}
          {modalWebPushAberto && (
            <WebPushConfigModal
              aberto={modalWebPushAberto}
              onFechar={() => setModalWebPushAberto(false)}
            />
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
