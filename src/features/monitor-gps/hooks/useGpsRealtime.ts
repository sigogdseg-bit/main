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

  let status_operacional: VeiculoGps["status_operacional"] = "estacionado";
  if (bloqueado) {
    status_operacional = "bloqueado";
  } else if (velocidade > 3) {
    status_operacional = "em_rota";
  } else if (ignicao) {
    status_operacional = "parado_ligado";
  }

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
    rumo:
      typeof patch.rumo === "number" && !isNaN(patch.rumo) && patch.rumo > 0
        ? patch.rumo
        : atual.latitude &&
            atual.longitude &&
            typeof patch.latitude === "number" &&
            typeof patch.longitude === "number" &&
            (patch.latitude !== atual.latitude || patch.longitude !== atual.longitude)
          ? Math.round(
              ((Math.atan2(
                Math.sin(((patch.longitude - atual.longitude) * Math.PI) / 180) *
                  Math.cos((patch.latitude * Math.PI) / 180),
                Math.cos((atual.latitude * Math.PI) / 180) *
                  Math.sin((patch.latitude * Math.PI) / 180) -
                  Math.sin((atual.latitude * Math.PI) / 180) *
                    Math.cos((patch.latitude * Math.PI) / 180) *
                    Math.cos(((patch.longitude - atual.longitude) * Math.PI) / 180),
              ) *
                180) /
                Math.PI +
                360) %
                360,
            )
          : atual.rumo,
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
      // Coalesce sincronização completa de odômetros/clientes em apenas 1 requisição após rajadas WebSocket
      agendarSincronizacaoCompleta(encontrouNaLista ? 850 : 150);
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

    // Reatividade via WebSocket Realtime (sem polling contínuo!)
    const canal = supabase
      .channel("hunter_telemetria_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "veiculos" }, (payload) => {
        const row = (payload?.new || null) as Record<string, any> | null;
        if (row && typeof row.id === "string") {
          aplicarPatchImediato({
            veiculoId: row.id,
            latitude: row.ultima_latitude !== null ? Number(row.ultima_latitude) : undefined,
            longitude: row.ultima_longitude !== null ? Number(row.ultima_longitude) : undefined,
            velocidade: row.velocidade_atual !== null ? Number(row.velocidade_atual) : undefined,
            ignicao: row.ignicao_status,
            bloqueado: row.bloqueado,
            rumo: row.rumo !== null && row.rumo !== undefined ? Number(row.rumo) : undefined,
            ultima_atualizacao: row.ultima_atualizacao,
            satelites:
              row.satelites !== null && row.satelites !== undefined
                ? Number(row.satelites)
                : undefined,
            voltagem:
              row.voltagem !== null && row.voltagem !== undefined
                ? Number(row.voltagem)
                : undefined,
            bateria_veiculo_v:
              row.bateria_veiculo_v !== null && row.bateria_veiculo_v !== undefined
                ? Number(row.bateria_veiculo_v)
                : undefined,
            bateria_rastreador_pct:
              row.bateria_rastreador_pct !== null && row.bateria_rastreador_pct !== undefined
                ? Number(row.bateria_rastreador_pct)
                : undefined,
            bateria_rastreador_status: row.bateria_rastreador_status,
            alimentacao_externa: row.alimentacao_externa,
            alerta_acidente: row.alerta_acidente,
            alerta_tipo: row.alerta_tipo,
            sinal_gsm:
              row.sinal_gsm !== null && row.sinal_gsm !== undefined
                ? Number(row.sinal_gsm)
                : undefined,
            rele_status: row.rele_status,
            inclinacao_graus:
              row.inclinacao_graus !== null && row.inclinacao_graus !== undefined
                ? Number(row.inclinacao_graus)
                : undefined,
            vibracao_g:
              row.vibracao_g !== null && row.vibracao_g !== undefined
                ? Number(row.vibracao_g)
                : undefined,
          });
        } else {
          agendarSincronizacaoCompleta(150);
        }
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telemetria_posicoes" },
        (payload) => {
          const row = (payload?.new || null) as Record<string, any> | null;
          if (row && typeof row.veiculo_id === "string") {
            aplicarPatchImediato({
              veiculoId: row.veiculo_id,
              latitude: row.latitude !== null ? Number(row.latitude) : undefined,
              longitude: row.longitude !== null ? Number(row.longitude) : undefined,
              velocidade: row.velocidade !== null ? Number(row.velocidade) : undefined,
              ignicao: row.ignicao,
              rumo: row.rumo !== null && row.rumo !== undefined ? Number(row.rumo) : undefined,
              ultima_atualizacao: row.data_hora_gps || undefined,
            });
          } else {
            agendarSincronizacaoCompleta(300);
          }
        },
      )
      .on("broadcast", { event: "telemetria_atualizada" }, (msg) => {
        const dados = (msg?.payload || msg) as Record<string, any> | null;
        const veiculoId = dados?.veiculoId || dados?.veiculo_id;
        if (typeof veiculoId === "string" && veiculoId.length > 0) {
          aplicarPatchImediato({
            veiculoId,
            latitude: typeof dados?.latitude === "number" ? dados.latitude : undefined,
            longitude: typeof dados?.longitude === "number" ? dados.longitude : undefined,
            velocidade: typeof dados?.velocidade === "number" ? dados.velocidade : undefined,
            ignicao: typeof dados?.ignicao === "boolean" ? dados.ignicao : undefined,
            rumo: typeof dados?.rumo === "number" ? dados.rumo : undefined,
            ultima_atualizacao:
              typeof dados?.ultima_atualizacao === "string"
                ? dados.ultima_atualizacao
                : dados?.origem === "gps_posicao"
                  ? new Date().toISOString()
                  : undefined,
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
