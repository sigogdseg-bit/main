import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VeiculoGps } from "../types";
import { carregarVeiculosGps, alternarBloqueioVeiculo } from "../services/gpsService";
import { toast } from "sonner";

export interface PatchTelemetriaTempoReal {
  veiculoId: string;
  latitude?: number | null;
  longitude?: number | null;
  velocidade?: number | null;
  ignicao?: boolean | null;
  bloqueado?: boolean | null;
  rumo?: number | null;
  ultima_atualizacao?: string | null;
  satelites?: number | null;
  voltagem?: number | null;
  bateria_veiculo_v?: number | null;
  bateria_rastreador_pct?: number | null;
  bateria_rastreador_status?: VeiculoGps["bateria_rastreador_status"] | null;
  alimentacao_externa?: boolean | null;
  alerta_acidente?: boolean | null;
  alerta_tipo?: string | null;
  sinal_gsm?: number | null;
  rele_status?: boolean | null;
  inclinacao_graus?: number | null;
  vibracao_g?: number | null;
  status_operacional?: VeiculoGps["status_operacional"] | null;
}

// Rastreamento em memória da histerese de parada contínua com ignição ligada (120s)
export const inicioParadaPorVeiculo = new Map<string, number>();

export function calcularStatusOperacionalFrontend(
  veiculoId: string,
  ignicao: boolean,
  velocidade: number,
  bloqueado?: boolean,
  statusSugerido?: VeiculoGps["status_operacional"] | null,
): VeiculoGps["status_operacional"] {
  if (bloqueado) {
    inicioParadaPorVeiculo.delete(veiculoId);
    return "bloqueado";
  }
  if (!ignicao) {
    inicioParadaPorVeiculo.delete(veiculoId);
    return "estacionado";
  }
  if (velocidade > 3) {
    inicioParadaPorVeiculo.delete(veiculoId);
    return "em_rota";
  }

  // ignicao === true && velocidade <= 3 (parado com motor ligado)
  if (statusSugerido === "parado_ligado") {
    return "parado_ligado";
  }

  const agora = Date.now();
  const inicio = inicioParadaPorVeiculo.get(veiculoId);
  if (!inicio) {
    inicioParadaPorVeiculo.set(veiculoId, agora);
    return "em_rota"; // Semáforo / parada recente: mantém Verde (em_rota)
  }

  if (agora - inicio < 120000) {
    return "em_rota"; // Menos de 120s contínuos: mantém Verde (em_rota)
  }

  return "parado_ligado"; // Parada contínua >= 120s: transiciona para Âmbar (parado_ligado)
}

/**
 * Aplica patch em memória sobre o veículo correspondente a partir do payload WebSocket (PostgreSQL/Broadcast),
 * eliminando espera de roundtrip HTTP antes da atualização visual no mapa.
 */
export function aplicarPatchTempoRealNaLista(
  listaAtual: VeiculoGps[],
  patch: PatchTelemetriaTempoReal,
): { lista: VeiculoGps[]; alterado: boolean } {
  const idx = listaAtual.findIndex((item) => item.id === patch.veiculoId);
  if (idx === -1) {
    return { lista: listaAtual, alterado: false };
  }

  const atual = listaAtual[idx];

  // Descarta pacotes históricos/atrasados mais antigos que a última atualização já exibida
  if (patch.ultima_atualizacao && atual.ultima_atualizacao) {
    const novoMs = Date.parse(patch.ultima_atualizacao);
    const atualMs = Date.parse(atual.ultima_atualizacao);
    if (!isNaN(novoMs) && !isNaN(atualMs) && novoMs < atualMs) {
      return { lista: listaAtual, alterado: false };
    }
  }

  const velocidade =
    typeof patch.velocidade === "number" && !isNaN(patch.velocidade)
      ? patch.velocidade
      : atual.velocidade;
  const ignicaoBase = typeof patch.ignicao === "boolean" ? patch.ignicao : atual.ignicao;
  const ignicao = ignicaoBase || velocidade > 3;
  const bloqueado = typeof patch.bloqueado === "boolean" ? patch.bloqueado : atual.bloqueado;

  const status_operacional = calcularStatusOperacionalFrontend(
    patch.veiculoId,
    ignicao,
    velocidade,
    bloqueado,
    patch.status_operacional,
  );

  const voltagemResolvida =
    typeof patch.bateria_veiculo_v === "number" && !isNaN(patch.bateria_veiculo_v)
      ? patch.bateria_veiculo_v
      : typeof patch.voltagem === "number" && !isNaN(patch.voltagem)
        ? patch.voltagem
        : atual.voltagem;

  const atualizado: VeiculoGps = {
    ...atual,
    latitude:
      typeof patch.latitude === "number" &&
      !isNaN(patch.latitude) &&
      (patch.latitude !== 0 || patch.longitude !== 0)
        ? patch.latitude
        : atual.latitude,
    longitude:
      typeof patch.longitude === "number" &&
      !isNaN(patch.longitude) &&
      (patch.latitude !== 0 || patch.longitude !== 0)
        ? patch.longitude
        : atual.longitude,
    velocidade,
    ignicao,
    bloqueado,
    status_operacional,
    rumo: typeof patch.rumo === "number" && !isNaN(patch.rumo) ? patch.rumo : atual.rumo,
    ultima_atualizacao: patch.ultima_atualizacao || atual.ultima_atualizacao,
    satelites:
      typeof patch.satelites === "number" && !isNaN(patch.satelites)
        ? patch.satelites
        : atual.satelites,
    voltagem: voltagemResolvida,
    bateria_veiculo_v: voltagemResolvida,
    bateria_rastreador_pct:
      typeof patch.bateria_rastreador_pct === "number" && !isNaN(patch.bateria_rastreador_pct)
        ? patch.bateria_rastreador_pct
        : atual.bateria_rastreador_pct,
    bateria_rastreador_status: patch.bateria_rastreador_status ?? atual.bateria_rastreador_status,
    alimentacao_externa:
      typeof patch.alimentacao_externa === "boolean"
        ? patch.alimentacao_externa
        : atual.alimentacao_externa,
    alerta_acidente:
      typeof patch.alerta_acidente === "boolean" ? patch.alerta_acidente : atual.alerta_acidente,
    alerta_tipo:
      patch.alerta_tipo !== undefined ? patch.alerta_tipo || undefined : atual.alerta_tipo,
    sinal_gsm:
      typeof patch.sinal_gsm === "number" && !isNaN(patch.sinal_gsm)
        ? patch.sinal_gsm
        : atual.sinal_gsm,
    rele_status: typeof patch.rele_status === "boolean" ? patch.rele_status : atual.rele_status,
    inclinacao_graus:
      typeof patch.inclinacao_graus === "number" && !isNaN(patch.inclinacao_graus)
        ? patch.inclinacao_graus
        : atual.inclinacao_graus,
    vibracao_g:
      typeof patch.vibracao_g === "number" && !isNaN(patch.vibracao_g)
        ? patch.vibracao_g
        : atual.vibracao_g,
  };

  const novaLista = listaAtual.slice();
  novaLista[idx] = atualizado;
  return { lista: novaLista, alterado: true };
}

export function useGpsRealtime() {
  const [veiculos, setVeiculos] = useState<VeiculoGps[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(new Date());
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoGps | null>(null);

  const veiculoSelecionadoRef = useRef<VeiculoGps | null>(null);
  veiculoSelecionadoRef.current = veiculoSelecionado;
  const seqRef = useRef(0);
  const debounceSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeConectadoRef = useRef(false);
  const ultimaAtividadeSyncRef = useRef(Date.now());

  const recarregar = useCallback(async () => {
    const seqLocal = ++seqRef.current;
    try {
      const lista = await carregarVeiculosGps();
      // Descarta resposta HTTP antiga se já houve atualização Realtime ou consulta mais recente
      if (seqLocal !== seqRef.current) {
        return;
      }

      ultimaAtividadeSyncRef.current = Date.now();
      setVeiculos(lista);
      setUltimaAtualizacao(new Date());

      // Atualiza o veículo selecionado com os dados frescos
      if (veiculoSelecionadoRef.current?.id?.startsWith("posto-")) {
        // Preserva o posto de vigilância ou propriedade monitorada selecionada
      } else if (lista.length === 1) {
        // Regra Hunter: Usuário com apenas um cadastrado já é selecionado por padrão sem opção de desmarcar
        setVeiculoSelecionado(lista[0]);
      } else if (veiculoSelecionadoRef.current) {
        const atualizado = lista.find((v) => v.id === veiculoSelecionadoRef.current?.id);
        setVeiculoSelecionado(atualizado || null);
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  const agendarSincronizacaoCompleta = useCallback(
    (atrasoMs = 700) => {
      if (debounceSyncRef.current) {
        clearTimeout(debounceSyncRef.current);
      }
      debounceSyncRef.current = setTimeout(() => {
        debounceSyncRef.current = null;
        void recarregar();
      }, atrasoMs);
    },
    [recarregar],
  );

  const aplicarPatchImediato = useCallback(
    (patch: PatchTelemetriaTempoReal) => {
      let encontrouNaLista = false;
      setVeiculos((prev) => {
        const { lista, alterado } = aplicarPatchTempoRealNaLista(prev, patch);
        encontrouNaLista = alterado || prev.some((v) => v.id === patch.veiculoId);
        if (!alterado) return prev;

        // Invalida fetches HTTP antigos em voo e registra timestamp do pulso Realtime
        seqRef.current += 1;
        ultimaAtividadeSyncRef.current = Date.now();

        if (veiculoSelecionadoRef.current?.id?.startsWith("posto-")) {
          // Preserva seleção do posto de vigilância ou propriedade monitorada
        } else if (lista.length === 1) {
          setVeiculoSelecionado(lista[0]);
        } else if (veiculoSelecionadoRef.current?.id === patch.veiculoId) {
          const novoSel = lista.find((item) => item.id === patch.veiculoId);
          if (novoSel) setVeiculoSelecionado(novoSel);
        }
        return lista;
      });
      setUltimaAtualizacao(new Date());
      // Só agenda sincronização completa via HTTP se o veículo NÃO foi encontrado na lista local
      // (ex.: veículo recém-cadastrado ou atribuído no banco).
      // Se já estiver na lista, o WebSocket fornece telemetria contínua sem necessidade de polling concorrente.
      if (!encontrouNaLista) {
        agendarSincronizacaoCompleta(150);
      }
    },
    [agendarSincronizacaoCompleta],
  );

  const definirVeiculoSelecionado = useCallback(
    (veiculo: VeiculoGps | null) => {
      // Regra Hunter: Usuário com apenas um cadastrado não pode desmarcar
      if (veiculos.length === 1 && veiculo === null) {
        return;
      }
      setVeiculoSelecionado(veiculo);
    },
    [veiculos.length],
  );

  useEffect(() => {
    recarregar();

    // Reatividade 100% via Broadcast Realtime (zero postgres_changes em veiculos ou telemetria)
    // Regra Hunter: 1 pacote GPS = estritamente 1 única mensagem WebSocket broadcast: telemetria_atualizada
    const canal = supabase
      .channel("hunter_telemetria_changes")
      .on("broadcast", { event: "veiculo_atualizado" }, (msg) => {
        const dados = (msg?.payload || msg) as Record<string, any> | null;
        if (!dados) return;
        const veiculoId = dados.veiculoId || dados.veiculo_id;
        if (typeof veiculoId === "string" && veiculoId.length > 0) {
          aplicarPatchImediato({
            veiculoId,
            bloqueado: typeof dados.bloqueado === "boolean" ? dados.bloqueado : undefined,
            rele_status: typeof dados.rele_status === "boolean" ? dados.rele_status : undefined,
            alerta_acidente:
              typeof dados.alerta_acidente === "boolean" ? dados.alerta_acidente : undefined,
            alerta_tipo: typeof dados.alerta_tipo === "string" ? dados.alerta_tipo : undefined,
            status_operacional: dados.status_operacional || undefined,
          });
        }
        if (dados.recarregar || !veiculoId) {
          agendarSincronizacaoCompleta(100);
        }
      })
      .on("broadcast", { event: "telemetria_atualizada" }, (msg) => {
        const dados = (msg?.payload || msg) as Record<string, any> | null;
        const veiculoId = dados?.veiculoId || dados?.veiculo_id;
        const tsGps =
          typeof dados?.dataHoraGps === "string" && dados.dataHoraGps.length > 0
            ? dados.dataHoraGps
            : typeof dados?.data_hora_gps === "string" && dados.data_hora_gps.length > 0
              ? dados.data_hora_gps
              : typeof dados?.ultima_atualizacao === "string" && dados.ultima_atualizacao.length > 0
                ? dados.ultima_atualizacao
                : undefined;

        if (typeof veiculoId === "string" && veiculoId.length > 0) {
          const statusOpRecebido =
            dados?.statusOperacional || dados?.status_operacional || undefined;
          aplicarPatchImediato({
            veiculoId,
            latitude: typeof dados?.latitude === "number" ? dados.latitude : undefined,
            longitude: typeof dados?.longitude === "number" ? dados.longitude : undefined,
            velocidade: typeof dados?.velocidade === "number" ? dados.velocidade : undefined,
            ignicao: typeof dados?.ignicao === "boolean" ? dados.ignicao : undefined,
            rumo: typeof dados?.rumo === "number" ? dados.rumo : undefined,
            satelites: typeof dados?.satelites === "number" ? dados.satelites : undefined,
            sinal_gsm:
              typeof dados?.sinalGsm === "number"
                ? dados.sinalGsm
                : typeof dados?.sinal_gsm === "number"
                  ? dados.sinal_gsm
                  : undefined,
            status_operacional: statusOpRecebido === "em_movimento" ? "em_rota" : statusOpRecebido,
            ultima_atualizacao: tsGps,
          });
        } else {
          agendarSincronizacaoCompleta(200);
        }
      })
      .subscribe((status) => {
        const sub = status === "SUBSCRIBED";
        realtimeConectadoRef.current = sub;
        setConectado(sub);
      });

    // Reatividade imediata ao focar na janela ou retornar à aba (essencial no Safari iOS)
    const aoMudarVisibilidade = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        recarregar();
      }
    };
    const aoFocarJanela = () => {
      recarregar();
    };

    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", aoMudarVisibilidade);
      window.addEventListener("focus", aoFocarJanela);
      window.addEventListener("online", aoFocarJanela);
    }

    // Contingência reativa suave enquanto a aba estiver ativa:
    // só consulta via HTTP se o WebSocket cair ou ficar >15s sem entrega recente.
    const timerContingencia = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const semPulsoRecente = Date.now() - ultimaAtividadeSyncRef.current >= 15000;
        if (!realtimeConectadoRef.current || semPulsoRecente) {
          recarregar();
        }
      }
    }, 6000);

    return () => {
      clearInterval(timerContingencia);
      if (debounceSyncRef.current) {
        clearTimeout(debounceSyncRef.current);
        debounceSyncRef.current = null;
      }
      if (typeof window !== "undefined") {
        document.removeEventListener("visibilitychange", aoMudarVisibilidade);
        window.removeEventListener("focus", aoFocarJanela);
        window.removeEventListener("online", aoFocarJanela);
      }
      supabase.removeChannel(canal);
    };
  }, [recarregar, agendarSincronizacaoCompleta, aplicarPatchImediato]);

  const executarBloqueio = async (veiculoId: string, bloquear: boolean) => {
    // 1. Atualização otimista imediata na interface do operador (zero delay perceptível)
    aplicarPatchImediato({ veiculoId, bloqueado: bloquear, rele_status: bloquear });
    const ok = await alternarBloqueioVeiculo(veiculoId, bloquear);
    if (ok) {
      toast.success(
        bloquear
          ? "Comando de BLOQUEIO enviado ao rastreador!"
          : "Comando de DESBLOQUEIO enviado ao rastreador!",
      );
      await recarregar();
    } else {
      toast.error("Falha ao comunicar com o rastreador.");
      await recarregar();
    }
    return ok;
  };

  return {
    veiculos,
    carregando,
    conectado,
    ultimaAtualizacao,
    veiculoSelecionado,
    setVeiculoSelecionado: definirVeiculoSelecionado,
    recarregar,
    executarBloqueio,
  };
}
