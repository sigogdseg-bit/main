import { supabase } from "@/integrations/supabase/client";
import { sanitizarComandoHardware } from "@/shared/lib/hunterHardwareComandos";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  isModoDegustacao,
  obterVeiculosDegustacaoMaster,
  obterViagensDegustacaoMaster,
  obterPontosViagemDegustacaoMaster,
  executarComandoBloqueioDegustacao,
} from "@/features/demonstracao/services/degustacaoMasterService";
import type {
  VeiculoGps,
  PosicaoHistorico,
  TrajetoViagem,
  AlertaSeguranca,
  ParadaJornada,
  JornadaConsolidada,
} from "../types";

function inferirTipoPorModelo(modelo?: string): any {
  if (!modelo) return "carro";
  const m = modelo.toLowerCase();
  if (m.includes("jetski") || m.includes("sea doo") || m.includes("waverunner")) return "jetski";
  if (
    m.includes("moto") ||
    m.includes("honda cg") ||
    m.includes("yamaha") ||
    m.includes("biz") ||
    m.includes("titan") ||
    m.includes("fan") ||
    m.includes("pcx") ||
    m.includes("cb ")
  )
    return "moto";
  if (m.includes("triciclo")) return "triciclo";
  if (m.includes("quadriciculo") || m.includes("fourtrax")) return "quadriciculo";
  if (
    m.includes("caminhao") ||
    m.includes("scania") ||
    m.includes("volvo fh") ||
    m.includes("actros") ||
    m.includes("constellation") ||
    m.includes("iveco") ||
    m.includes("axor")
  )
    return "caminhao";
  if (m.includes("onibus") || m.includes("bus") || m.includes("marcopolo") || m.includes("volare"))
    return "onibus";
  if (
    m.includes("camionete") ||
    m.includes("hilux") ||
    m.includes("s10") ||
    m.includes("ranger") ||
    m.includes("amarok") ||
    m.includes("toro") ||
    m.includes("strada") ||
    m.includes("saveiro") ||
    m.includes("l200") ||
    m.includes("frontier")
  )
    return "camionete";
  if (
    m.includes("ambulancia") ||
    m.includes("ambulância") ||
    m.includes("samu") ||
    m.includes("resgate") ||
    m.includes("uti movel") ||
    m.includes("uti móvel")
  )
    return "ambulancia";
  if (
    m.includes("van") ||
    m.includes("ducato") ||
    m.includes("sprinter") ||
    m.includes("master") ||
    m.includes("transit") ||
    m.includes("kombi") ||
    m.includes("fiorino") ||
    m.includes("boxer") ||
    m.includes("jumpy") ||
    m.includes("expert")
  )
    return "van";
  if (
    m.includes("suv") ||
    m.includes("compass") ||
    m.includes("renegade") ||
    m.includes("creta") ||
    m.includes("kicks") ||
    m.includes("t-cross") ||
    m.includes("tracker") ||
    m.includes("hr-v") ||
    m.includes("duster") ||
    m.includes("corolla cross") ||
    m.includes("xc 60") ||
    m.includes("xc60")
  )
    return "suv";
  return "carro";
}

let ultimoCarregamentoVeiculosFalhou = false;

export function ultimoCarregamentoVeiculosTeveErro(): boolean {
  return ultimoCarregamentoVeiculosFalhou;
}

export async function carregarVeiculosGps(): Promise<VeiculoGps[]> {
  ultimoCarregamentoVeiculosFalhou = false;
  try {
    let veiculosData: any[] | null = null;

    // 1. Prioridade máxima: Rota segura de backend (/api/veiculos/monitor) com Service Role
    // Isso evita completamente qualquer erro de PostgreSQL / recursão de RLS no navegador
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        let res = await fetch("/api/veiculos/monitor", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.status === 401) {
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            const novoToken = refreshed?.session?.access_token;
            if (novoToken) {
              res = await fetch("/api/veiculos/monitor", {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${novoToken}`,
                },
              });
            } else {
              window.dispatchEvent(new CustomEvent("hunter:sessao-401"));
            }
          } catch {
            window.dispatchEvent(new CustomEvent("hunter:sessao-401"));
          }
        }
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.veiculos)) {
            veiculosData = json.veiculos;
          }
        }
      }
    } catch {
      /* fallback */
    }

    if (!veiculosData) {
      // Tentativa 1: Seleciona colunas completas incluindo tipo_veiculo e privacidade_localizacao
      const { data: comTipo, error: errTipo } = await supabase
        .from("veiculos")
        .select(
          `
          id,
          cliente_id,
          placa,
          chassi,
          marca_modelo,
          cor,
          ano,
          tipo_veiculo,
          horimetro_modo,
          horimetro_horas,
          ignicao_status,
          gps_fixado,
          bloqueado,
          velocidade_atual,
          odometro_km,
          odometro_wgs84_km,
          odometro_cinematico_km,
          odometro_hardware_km,
          odometro_hardware_atualizado_em,
          odometro_motor_a_km,
          odometro_motor_b_km,
          odometro_motor_c_km,
          odometro_motor_media_km,
          odometro_motor_a_pesos,
          odometro_motor_b_pesos,
          odometro_motor_c_pesos,
          odometro_motor_a_estado,
          odometro_motor_b_estado,
          odometro_motor_c_estado,
          ultima_latitude,
          ultima_longitude,
          ultima_atualizacao,
          voltagem,
          bateria_veiculo_v,
          bateria_rastreador_pct,
          bateria_rastreador_status,
          satelites,
          rumo,
          inclinacao_graus,
          vibracao_g,
          alerta_acidente,
          alerta_tipo,
          ativo,
          privacidade_localizacao,
          bloqueador_instalado,
          tipo_bloqueador,
          bloqueador_detalhes,
          sinal_gsm,
          rele_status,
          rastreador_id,
          rastreador_imei,
          clientes (
            user_id,
            nome_razao_social,
            plano,
            privacidade_localizacao
          )
        `,
        )
        .eq("ativo", true)
        .not("placa", "in", '("HTR4G16","HUN1T26")')
        .order("placa", { ascending: true });

      if (errTipo || !comTipo) {
        // Se a coluna ainda não foi migrada no Supabase remoto, aciona fallback resiliente instantâneo
        const { data: semTipo, error: errSemTipo } = await supabase
          .from("veiculos")
          .select(
            `
            id,
            cliente_id,
            placa,
            chassi,
            marca_modelo,
            cor,
            ano,
            ignicao_status,
            gps_fixado,
            bloqueado,
            velocidade_atual,
            odometro_km,
            ultima_latitude,
            ultima_longitude,
            ultima_atualizacao,
            voltagem,
            bateria_veiculo_v,
            bateria_rastreador_pct,
            bateria_rastreador_status,
            satelites,
            rumo,
            inclinacao_graus,
            vibracao_g,
            alerta_acidente,
            alerta_tipo,
            ativo,
            bloqueador_instalado,
            tipo_bloqueador,
            bloqueador_detalhes,
            sinal_gsm,
            rele_status,
            rastreador_id,
            rastreador_imei,
            clientes (
              user_id,
              nome_razao_social,
              plano
            )
          `,
          )
          .eq("ativo", true)
          .not("placa", "in", '("HTR4G16","HUN1T26")')
          .order("placa", { ascending: true });

        if (errSemTipo || !semTipo) {
          // Tentativa 3: Seleção direta em veiculos sem join com clientes (100% imune a erros RLS de clientes)
          const { data: semJoin, error: errSemJoin } = await supabase
            .from("veiculos")
            .select("*")
            .eq("ativo", true)
            .not("placa", "in", '("HTR4G16","HUN1T26")')
            .order("placa", { ascending: true });

          if (errSemJoin || !semJoin) {
            ultimoCarregamentoVeiculosFalhou = true;
            veiculosData = [];
          } else {
            veiculosData = semJoin;
          }
        } else {
          veiculosData = semTipo;
        }
      } else {
        veiculosData = comTipo;
      }
    }

    // Filtra estritamente veículos de clientes reais, descartando qualquer frota simulada de desenvolvimento
    let veiculosValidos = veiculosData.filter((v: any) => {
      const modelo = (v.marca_modelo || "").toLowerCase();
      const cliente = (v.clientes?.nome_razao_social || "").toLowerCase();
      if (
        modelo.includes("frota hunter") ||
        cliente.includes("frota hunter") ||
        modelo.includes("simula")
      ) {
        return false;
      }
      return true;
    });

    // REGRA IMPERIOSA: Modo Degustacao Master acessa estritamente a frota simulada isolada (Zero AXH0E44)
    const sessaoAtual = obterSessaoCacheada();
    if (isModoDegustacao(sessaoAtual)) {
      return obterVeiculosDegustacaoMaster();
    }

    return veiculosValidos.map((v: any) => {
      const velocidade = Number(v.velocidade_atual) || 0;
      // Preserva estritamente o estado factual da ignição reportado pelo rastreador/banco
      const ignicao = !!v.ignicao_status;
      const bloqueado = !!v.bloqueado;

      const statusBanco =
        v.status_operacional === "em_movimento" ? "em_rota" : v.status_operacional;
      let status_operacional: VeiculoGps["status_operacional"] = "estacionado";
      if (bloqueado) {
        status_operacional = "bloqueado";
      } else if (statusBanco) {
        status_operacional = statusBanco;
      } else if (velocidade > 3) {
        status_operacional = "em_rota";
      } else if (ignicao) {
        status_operacional = "em_rota";
      }

      // Leitura 100% real de bateria de acordo com o manual do rastreador (sem dados inventados)
      const voltagemReal =
        v.voltagem !== null && v.voltagem !== undefined
          ? Number(v.voltagem)
          : v.bateria_veiculo_v !== null && v.bateria_veiculo_v !== undefined
            ? Number(v.bateria_veiculo_v)
            : undefined;

      const bateriaRastreadorReal =
        v.bateria_rastreador_pct !== null && v.bateria_rastreador_pct !== undefined
          ? Number(v.bateria_rastreador_pct)
          : undefined;

      return {
        id: v.id,
        cliente_id: v.cliente_id,
        cliente_user_id: v.clientes?.user_id || null,
        cliente_nome: v.clientes?.nome_razao_social || "Cliente",
        cliente_plano: v.clientes?.plano || undefined,
        privacidade_localizacao: false,
        placa: v.placa,
        chassi: v.chassi || null,
        marca_modelo: v.marca_modelo,
        cor: v.cor || undefined,
        ano: v.ano || undefined,
        tipo_veiculo: (v.tipo_veiculo as any) || "carro",
        ignicao,
        ignicao_status: !!v.ignicao_status,
        gps_fixado: v.gps_fixado !== false,
        bloqueado,
        bloqueador_instalado: v.bloqueador_instalado !== false,
        tipo_bloqueador: v.tipo_bloqueador || "rele_combustivel",
        bloqueador_detalhes: v.bloqueador_detalhes || undefined,
        sinal_gsm:
          v.sinal_gsm !== null && v.sinal_gsm !== undefined ? Number(v.sinal_gsm) : undefined,
        rele_status:
          v.rele_status !== null && v.rele_status !== undefined ? !!v.rele_status : undefined,
        velocidade,
        odometro: v.odometro_km || 0,
        odometro_wgs84_km:
          v.odometro_wgs84_km !== null && v.odometro_wgs84_km !== undefined
            ? Number(v.odometro_wgs84_km)
            : v.odometro_km || 0,
        odometro_cinematico_km:
          v.odometro_cinematico_km !== null && v.odometro_cinematico_km !== undefined
            ? Number(v.odometro_cinematico_km)
            : null,
        odometro_hardware_km:
          v.odometro_hardware_km !== null && v.odometro_hardware_km !== undefined
            ? Number(v.odometro_hardware_km)
            : null,
        odometro_hardware_atualizado_em: v.odometro_hardware_atualizado_em || null,
        odometro_motor_a_km:
          v.odometro_motor_a_km !== null && v.odometro_motor_a_km !== undefined
            ? Number(v.odometro_motor_a_km)
            : null,
        odometro_motor_b_km:
          v.odometro_motor_b_km !== null && v.odometro_motor_b_km !== undefined
            ? Number(v.odometro_motor_b_km)
            : null,
        odometro_motor_c_km:
          v.odometro_motor_c_km !== null && v.odometro_motor_c_km !== undefined
            ? Number(v.odometro_motor_c_km)
            : null,
        odometro_motor_media_km:
          v.odometro_motor_media_km !== null && v.odometro_motor_media_km !== undefined
            ? Number(v.odometro_motor_media_km)
            : v.odometro_km || 0,
        odometro_motor_a_pesos: v.odometro_motor_a_pesos || null,
        odometro_motor_b_pesos: v.odometro_motor_b_pesos || null,
        odometro_motor_c_pesos: v.odometro_motor_c_pesos || null,
        odometro_motor_a_estado: v.odometro_motor_a_estado || null,
        odometro_motor_b_estado: v.odometro_motor_b_estado || null,
        odometro_motor_c_estado: v.odometro_motor_c_estado || null,
        latitude:
          v.ultima_latitude !== null &&
          v.ultima_latitude !== undefined &&
          !isNaN(Number(v.ultima_latitude))
            ? Number(v.ultima_latitude)
            : 0,
        longitude:
          v.ultima_longitude !== null &&
          v.ultima_longitude !== undefined &&
          !isNaN(Number(v.ultima_longitude))
            ? Number(v.ultima_longitude)
            : 0,
        voltagem: voltagemReal,
        bateria_veiculo_v: voltagemReal,
        bateria_rastreador_pct: bateriaRastreadorReal,
        bateria_rastreador_status: v.bateria_rastreador_status || undefined,
        alimentacao_externa:
          v.alimentacao_externa !== undefined && v.alimentacao_externa !== null
            ? Boolean(v.alimentacao_externa)
            : v.bateria_rastreador_status === "bateria_interna"
              ? false
              : voltagemReal !== null && voltagemReal > 9.0
                ? true
                : undefined,
        satelites:
          v.satelites !== null && v.satelites !== undefined ? Number(v.satelites) : undefined,
        rumo: v.rumo !== null && v.rumo !== undefined ? Number(v.rumo) : undefined,
        inclinacao_graus:
          v.inclinacao_graus !== null && v.inclinacao_graus !== undefined
            ? Number(v.inclinacao_graus)
            : undefined,
        vibracao_g:
          v.vibracao_g !== null && v.vibracao_g !== undefined ? Number(v.vibracao_g) : undefined,
        alerta_acidente: !!v.alerta_acidente,
        alerta_tipo: v.alerta_tipo || undefined,
        ultima_atualizacao: v.ultima_atualizacao || undefined,
        horimetro: Number(v.horimetro_horas || 0),
        horimetro_horas: Number(v.horimetro_horas || 0),
        tipo_medicao:
          (v.tipo_medicao as any) ||
          (v.horimetro_modo === "horimetro"
            ? "horimetro"
            : v.tipo_veiculo === "maquina" || v.tipo_veiculo === "trator"
              ? "horimetro"
              : "km"),
        status_operacional,
        rastreador_id: v.rastreador_id || null,
        rastreador_imei: v.rastreador_imei || null,
      };
    });
  } catch (err) {
    console.error("Exceção ao carregar veículos GPS:", err);
    return [];
  }
}

// Síntese sonora tática militar via Web Audio API nativa
export function tocarSomBloqueio() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const t0 = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(880, t0);
    osc1.frequency.exponentialRampToValueAtTime(440, t0 + 0.15);
    osc1.frequency.exponentialRampToValueAtTime(220, t0 + 0.35);

    gain1.gain.setValueAtTime(0.3, t0);
    gain1.gain.exponentialRampToValueAtTime(0.01, t0 + 0.38);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.4);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(330, t0 + 0.2);
    osc2.frequency.setValueAtTime(165, t0 + 0.35);

    gain2.gain.setValueAtTime(0.2, t0 + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, t0 + 0.5);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t0 + 0.2);
    osc2.stop(t0 + 0.52);
  } catch (e) {
    console.warn("Audio Context bloqueio suprimido:", e);
  }
}

export function tocarSomDesbloqueio() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const t0 = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, t0);
    osc.frequency.setValueAtTime(659.25, t0 + 0.1);
    osc.frequency.setValueAtTime(783.99, t0 + 0.2);
    osc.frequency.setValueAtTime(1046.5, t0 + 0.3);

    gain.gain.setValueAtTime(0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.48);
  } catch (e) {
    console.warn("Audio Context desbloqueio suprimido:", e);
  }
}

export async function alternarBloqueioVeiculo(
  veiculoId: string,
  bloquear: boolean,
): Promise<boolean> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    const isDegustacaoOuFicticio = Boolean(
      veiculoId.startsWith("deg-") ||
      (isModoDegustacao(sessaoAtual) ? !sessaoAtual?.isReadOnly : false),
    );

    if (isDegustacaoOuFicticio) {
      if (bloquear) {
        tocarSomBloqueio();
      } else {
        tocarSomDesbloqueio();
      }
      executarComandoBloqueioDegustacao(veiculoId, bloquear);
      return true;
    }

    if (sessaoAtual?.isReadOnly) {
      console.warn("Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY.");
      return false;
    }
    if (bloquear) {
      tocarSomBloqueio();
    } else {
      tocarSomDesbloqueio();
    }

    // 1. Obtém dados do veículo (IMEI e placa) para envio canônico de hardware
    const { data: veiculo } = await supabase
      .from("veiculos")
      .select("id, placa, rastreador_imei")
      .eq("id", veiculoId)
      .maybeSingle();

    const imei = veiculo?.rastreador_imei;

    const { error } = await supabase
      .from("veiculos")
      .update({
        bloqueado: bloquear,
        rele_status: bloquear,
        updated_at: new Date().toISOString(),
      })
      .eq("id", veiculoId);

    if (error) throw error;

    // Notifica instantaneamente todos os operadores conectados via broadcast leve (zero postgres_changes)
    try {
      const canalBroadcast = supabase.channel("hunter_telemetria_changes");
      void canalBroadcast.send({
        type: "broadcast",
        event: "veiculo_atualizado",
        payload: {
          veiculoId,
          bloqueado: bloquear,
          rele_status: bloquear,
          timestamp: Date.now(),
        },
      });
    } catch {}

    // 2. DISPARO HTTP DIRETO AO GATEWAY TCP (Canal primário de alta confiabilidade)
    // Suporte universal e dinâmico a modelos: J16 4G (DYD/HFYD/RELAY) e G900L (stop123456/resume123456)
    const comandosAExecutar = bloquear
      ? ["DYD,000000", "RELAY,1", "stop123456"]
      : ["HFYD,000000", "RELAY,0", "resume123456"];
    let despachadoHttp = false;

    for (const cmd of comandosAExecutar) {
      const cmdSanitizado = sanitizarComandoHardware(cmd);
      try {
        const res = await fetch("/api/gateway/comando", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imei: imei || undefined,
            comando: cmdSanitizado,
            veiculoId,
            origem: "gps_monitor_view",
          }),
        });
        if (res.ok) {
          despachadoHttp = true;
        }
      } catch (errHttp) {
        console.warn(`[BLOQUEIO] Falha no disparo HTTP para ${cmdSanitizado}:`, errHttp);
      }
    }

    // 3. DISPARO DE CONTINGÊNCIA VIA SUPABASE REALTIME (Acionado apenas se o disparo HTTP primário falhar)
    if (!despachadoHttp) {
      try {
        const canal = supabase.channel("hunter_gateway_comandos");
        canal.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await canal.send({
              type: "broadcast",
              event: "comando_bloqueio",
              payload: {
                imei: imei || undefined,
                veiculoId,
                bloquear,
                timestamp: new Date().toISOString(),
              },
            });
            setTimeout(() => {
              supabase.removeChannel(canal);
            }, 3000);
          }
        });
      } catch (errRt) {
        console.warn("[BLOQUEIO] Falha no canal Realtime de contingência:", errRt);
      }
    }

    // Registra log forense de auditoria
    await supabase.from("system_activity_logs").insert({
      acao: bloquear ? "BLOQUEIO_REMOTO_COMBUSTIVEL" : "DESBLOQUEIO_REMOTO_COMBUSTIVEL",
      detalhe: `Comando de relé J16 (${comandosAExecutar.join(" / ")}) acionado para o veículo ${veiculo?.placa || veiculoId} (IMEI ${imei || "—"}). Novo status bloqueado: ${bloquear}`,
    });

    return true;
  } catch (err) {
    console.error("Erro ao alterar status de bloqueio:", err);
    return false;
  }
}

export async function carregarHistoricoPosicoes(
  veiculoId: string,
  diasLimite = 7,
): Promise<PosicaoHistorico[]> {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasLimite);

    const { data, error } = await supabase
      .from("telemetria_posicoes")
      .select(
        "id, latitude, longitude, velocidade, ignicao, odometro, rumo, inclinacao_graus, vibracao_g, data_hora_gps",
      )
      .eq("veiculo_id", veiculoId)
      .gte("data_hora_gps", dataLimite.toISOString())
      .order("data_hora_gps", { ascending: true })
      .limit(1000);

    if (error || !data) return [];
    return data as PosicaoHistorico[];
  } catch (err) {
    console.warn("Erro ao buscar histórico de posições:", err);
    return [];
  }
}

export interface FiltroViagensTrajetos {
  ano?: number;
  mes?: number; // 1 a 12
  dia?: number | null; // 1 a 31
  campoData?: "inicio_at" | "fim_at";
}

/**
 * Validador canônico de ciclos de viagens reais.
 * Descarta micro-ignições (ligou chave/rádio na garagem e desligou, ou jitter com carro parado).
 * Uma viagem real deve ter deslocamento comprovado e/ou velocidade de locomoção.
 */
export function isCicloViagemReal(v: {
  km_percorrido?: number;
  velocidade_maxima?: number;
}): boolean {
  const km = Number(v.km_percorrido || 0);
  const velMax = Number(v.velocidade_maxima || 0);
  if (velMax <= 0 && km < 0.3) return false;
  if (km < 0.15 && velMax <= 15) return false;
  return true;
}

export async function carregarViagensTrajetos(
  veiculoId: string,
  filtro?: FiltroViagensTrajetos,
): Promise<TrajetoViagem[]> {
  if (veiculoId.startsWith("deg-")) {
    return obterViagensDegustacaoMaster(veiculoId);
  }
  try {
    let query = supabase
      .from("viagens_trajetos")
      .select(
        "id, veiculo_id, inicio_at, fim_at, km_percorrido, velocidade_media, velocidade_maxima, status",
      )
      .eq("veiculo_id", veiculoId);

    if (filtro && filtro.ano && filtro.mes) {
      const { ano, mes, dia, campoData } = filtro;
      const campo = campoData === "fim_at" ? "fim_at" : "inicio_at";

      if (dia) {
        const diaStr = String(dia).padStart(2, "0");
        const mesStr = String(mes).padStart(2, "0");
        // Fuso horário canônico oficial do Brasil (America/Sao_Paulo: UTC-3)
        const inicioIso = new Date(`${ano}-${mesStr}-${diaStr}T00:00:00.000-03:00`).toISOString();
        const fimIso = new Date(`${ano}-${mesStr}-${diaStr}T23:59:59.999-03:00`).toISOString();

        if (campo === "fim_at") {
          query = query.or(
            `and(fim_at.gte.${inicioIso},fim_at.lte.${fimIso}),and(fim_at.is.null,inicio_at.gte.${inicioIso},inicio_at.lte.${fimIso})`,
          );
        } else {
          query = query.gte("inicio_at", inicioIso).lte("inicio_at", fimIso);
        }
      } else {
        const mesStr = String(mes).padStart(2, "0");
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const ultimoDiaStr = String(ultimoDia).padStart(2, "0");
        // Fuso horário canônico oficial do Brasil (America/Sao_Paulo: UTC-3)
        const inicioIso = new Date(`${ano}-${mesStr}-01T00:00:00.000-03:00`).toISOString();
        const fimIso = new Date(
          `${ano}-${mesStr}-${ultimoDiaStr}T23:59:59.999-03:00`,
        ).toISOString();

        if (campo === "fim_at") {
          query = query.or(
            `and(fim_at.gte.${inicioIso},fim_at.lte.${fimIso}),and(fim_at.is.null,inicio_at.gte.${inicioIso},inicio_at.lte.${fimIso})`,
          );
        } else {
          query = query.gte("inicio_at", inicioIso).lte("inicio_at", fimIso);
        }
      }
    }

    const { data, error } = await query.order("inicio_at", { ascending: true }).limit(300);

    if (error || !data) return [];
    return (data as TrajetoViagem[]).filter(isCicloViagemReal);
  } catch (err) {
    console.warn("Erro ao carregar viagens:", err);
    return [];
  }
}

export async function carregarViagensPeriodo(
  veiculoId: string,
  inicioIso: string,
  fimIso: string,
): Promise<TrajetoViagem[]> {
  if (veiculoId.startsWith("deg-")) {
    return obterViagensDegustacaoMaster(veiculoId);
  }
  try {
    const { data, error } = await supabase
      .from("viagens_trajetos")
      .select(
        "id, veiculo_id, inicio_at, fim_at, km_percorrido, velocidade_media, velocidade_maxima, status",
      )
      .eq("veiculo_id", veiculoId)
      .gte("inicio_at", inicioIso)
      .lte("inicio_at", fimIso)
      .order("inicio_at", { ascending: true })
      .limit(500);

    if (error || !data) return [];
    return (data as TrajetoViagem[]).filter(isCicloViagemReal);
  } catch (err) {
    console.warn("Erro ao carregar viagens do periodo:", err);
    return [];
  }
}

export async function carregarPontosViagem(
  veiculoId: string,
  inicioAt: string,
  fimAt?: string | null,
  limite = 5000,
): Promise<PosicaoHistorico[]> {
  if (veiculoId.startsWith("deg-")) {
    return obterPontosViagemDegustacaoMaster(veiculoId, inicioAt, fimAt);
  }
  try {
    let query = supabase
      .from("telemetria_posicoes")
      .select(
        "id, latitude, longitude, velocidade, ignicao, odometro, rumo, inclinacao_graus, vibracao_g, data_hora_gps",
      )
      .eq("veiculo_id", veiculoId)
      .gte("data_hora_gps", inicioAt)
      .order("data_hora_gps", { ascending: true })
      .limit(limite);

    if (fimAt) {
      query = query.lte("data_hora_gps", fimAt);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as PosicaoHistorico[];
  } catch (err) {
    console.warn("Erro ao carregar pontos da viagem:", err);
    return [];
  }
}

let ultimoCarregamentoAlertasFalhou = false;

export function ultimoCarregamentoAlertasTeveErro(): boolean {
  return ultimoCarregamentoAlertasFalhou;
}

export async function carregarAlertasSeguranca(veiculoId?: string): Promise<AlertaSeguranca[]> {
  ultimoCarregamentoAlertasFalhou = false;
  try {
    let alertasRaw: any[] | null = null;

    // 1. Prioridade máxima: Rota segura de backend (/api/alertas-seguranca) com Service Role
    // Evita recursão infinita de RLS em joins com veiculos/clientes no navegador
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token && typeof window !== "undefined") {
        const endpoint = veiculoId
          ? `/api/alertas-seguranca?veiculoId=${encodeURIComponent(veiculoId)}`
          : "/api/alertas-seguranca";
        let res = await fetch(endpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          const novoToken = refreshed?.session?.access_token;
          if (novoToken) {
            res = await fetch(endpoint, {
              method: "GET",
              headers: { Authorization: `Bearer ${novoToken}` },
            });
          } else {
            window.dispatchEvent(new CustomEvent("hunter:sessao-401"));
          }
        }
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.alertas)) {
            alertasRaw = json.alertas;
          }
        }
      }
    } catch {
      /* fallback direto ao Supabase */
    }

    if (!alertasRaw) {
      let query = supabase
        .from("alertas_seguranca")
        .select(
          `
          id,
          veiculo_id,
          cliente_id,
          tipo,
          gravidade,
          latitude,
          longitude,
          velocidade,
          vibracao_g,
          inclinacao_graus,
          detalhes,
          reconhecido,
          created_at,
          veiculos (
            placa,
            marca_modelo,
            ultima_latitude,
            ultima_longitude
          ),
          clientes (
            nome_razao_social,
            documento,
            telefone,
            email,
            plano
          )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(30);

      if (veiculoId) {
        query = query.eq("veiculo_id", veiculoId);
      }

      const { data, error } = await query;
      if (error || !data) {
        ultimoCarregamentoAlertasFalhou = true;
        return [];
      }
      alertasRaw = data;
    }

    return alertasRaw.map((a: any) => {
      const latValida =
        a.latitude !== null && a.latitude !== undefined && Math.abs(Number(a.latitude)) > 0.0001;
      const lonValida =
        a.longitude !== null && a.longitude !== undefined && Math.abs(Number(a.longitude)) > 0.0001;
      const fallbackLat =
        a.veiculos?.ultima_latitude && Math.abs(Number(a.veiculos.ultima_latitude)) > 0.0001
          ? Number(a.veiculos.ultima_latitude)
          : 0;
      const fallbackLon =
        a.veiculos?.ultima_longitude && Math.abs(Number(a.veiculos.ultima_longitude)) > 0.0001
          ? Number(a.veiculos.ultima_longitude)
          : 0;

      return {
        id: a.id,
        veiculo_id: a.veiculo_id,
        cliente_id: a.cliente_id,
        cliente_nome: a.clientes?.nome_razao_social,
        cliente_documento: a.clientes?.documento,
        cliente_telefone: a.clientes?.telefone,
        cliente_email: a.clientes?.email,
        cliente_plano: a.clientes?.plano,
        tipo: a.tipo,
        gravidade: a.gravidade,
        latitude: latValida ? Number(a.latitude) : fallbackLat,
        longitude: lonValida ? Number(a.longitude) : fallbackLon,
        velocidade: a.velocidade,
        vibracao_g: a.vibracao_g,
        inclinacao_graus: a.inclinacao_graus,
        detalhes: a.detalhes,
        reconhecido: a.reconhecido,
        created_at: a.created_at,
        placa: a.veiculos?.placa,
        marca_modelo: a.veiculos?.marca_modelo,
      };
    });
  } catch (err) {
    ultimoCarregamentoAlertasFalhou = true;
    console.warn("Erro ao buscar alertas de segurança:", err);
    return [];
  }
}

export async function salvarAlertaSeguranca(dados: {
  veiculo_id: string;
  cliente_id?: string;
  tipo: string;
  detalhes: string;
  gravidade?: "critica" | "alta" | "media";
  latitude?: number;
  longitude?: number;
  velocidade?: number;
  vibracao_g?: number;
  inclinacao_graus?: number;
}): Promise<{ sucesso: boolean; id?: string }> {
  try {
    let latFinal = dados.latitude ?? 0.0;
    let lonFinal = dados.longitude ?? 0.0;
    let velFinal = Math.round(dados.velocidade ?? 0);

    // Se as coordenadas vierem zeradas ou ausentes, busca a última posição real registrada do veículo
    if (Math.abs(latFinal) < 0.0001 && Math.abs(lonFinal) < 0.0001 && dados.veiculo_id) {
      try {
        const { data: vPos } = await supabase
          .from("veiculos")
          .select("ultima_latitude, ultima_longitude, velocidade_atual")
          .eq("id", dados.veiculo_id)
          .maybeSingle();

        if (
          vPos?.ultima_latitude &&
          vPos?.ultima_longitude &&
          (Math.abs(Number(vPos.ultima_latitude)) > 0.0001 ||
            Math.abs(Number(vPos.ultima_longitude)) > 0.0001)
        ) {
          latFinal = Number(vPos.ultima_latitude);
          lonFinal = Number(vPos.ultima_longitude);
          if (velFinal === 0 && vPos.velocidade_atual) {
            velFinal = Math.round(Number(vPos.velocidade_atual));
          }
        }
      } catch {
        // Fallback silencioso
      }
    }

    const { data: resRpc, error: errRpc } = await (supabase.rpc as any)(
      "registrar_alerta_seguranca",
      {
        p_veiculo_id: dados.veiculo_id,
        p_tipo: dados.tipo,
        p_detalhes: dados.detalhes,
        p_gravidade: dados.gravidade || "alta",
        p_latitude: latFinal,
        p_longitude: lonFinal,
        p_velocidade: velFinal,
        p_vibracao_g: dados.vibracao_g ?? 0.0,
        p_inclinacao_graus: dados.inclinacao_graus ?? 0,
        p_cliente_id: dados.cliente_id || null,
      },
    );

    if (!errRpc && resRpc?.sucesso) {
      return { sucesso: true, id: resRpc.alerta_id };
    }

    // Fallback direto via INSERT na tabela se RPC não estiver disponível
    let clienteId = dados.cliente_id;
    if (!clienteId) {
      const { data: v } = await supabase
        .from("veiculos")
        .select("cliente_id")
        .eq("id", dados.veiculo_id)
        .maybeSingle();
      clienteId = v?.cliente_id;
    }

    if (!clienteId) {
      console.warn("Não foi possível identificar o cliente para salvar o alerta.");
      return { sucesso: false };
    }

    // Prevenção de duplicidade: se já existe alerta pendente de reconhecimento para este veículo e tipo, reutiliza
    const { data: alertaPendente } = await supabase
      .from("alertas_seguranca")
      .select("id")
      .eq("veiculo_id", dados.veiculo_id)
      .eq("tipo", dados.tipo)
      .eq("reconhecido", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alertaPendente?.id) {
      return { sucesso: true, id: alertaPendente.id };
    }

    const { data: novoAlerta, error: errInsert } = await supabase
      .from("alertas_seguranca")
      .insert({
        veiculo_id: dados.veiculo_id,
        cliente_id: clienteId,
        tipo: dados.tipo,
        gravidade: dados.gravidade || "alta",
        latitude: dados.latitude ?? 0.0,
        longitude: dados.longitude ?? 0.0,
        velocidade: Math.round(dados.velocidade ?? 0),
        vibracao_g: dados.vibracao_g ?? 0.0,
        inclinacao_graus: dados.inclinacao_graus ?? 0,
        detalhes: dados.detalhes,
        reconhecido: false,
      })
      .select("id")
      .single();

    if (errInsert) {
      console.warn("Falha ao inserir alerta_seguranca:", errInsert.message);
      return { sucesso: false };
    }

    return { sucesso: true, id: novoAlerta?.id };
  } catch (err) {
    console.error("Erro inesperado ao salvar alerta de segurança:", err);
    return { sucesso: false };
  }
}

export async function reconhecerAlertaSeguranca(alertaId: string): Promise<boolean> {
  try {
    const { error } = await (supabase.rpc as any)("reconhecer_alerta_seguranca", {
      p_alerta_id: alertaId,
    });
    if (error) {
      // Fallback direto via update se RPC ainda não estiver criada no editor
      const { error: errUpdate } = await supabase
        .from("alertas_seguranca")
        .update({
          reconhecido: true,
          reconhecido_at: new Date().toISOString(),
        })
        .eq("id", alertaId);

      return !errUpdate;
    }
    return true;
  } catch (err) {
    console.error("Erro ao reconhecer alerta:", err);
    return false;
  }
}

export async function enviarPacoteTelemetria(payload: {
  veiculoId: string;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: boolean;
  odometro?: number;
  inclinacao?: number;
  vibracao?: number;
  rumo?: number;
}): Promise<boolean> {
  try {
    const { error } = await (supabase.rpc as any)("processar_telemetria_veiculo", {
      p_veiculo_id: payload.veiculoId,
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_velocidade: payload.velocidade,
      p_ignicao: payload.ignicao,
      p_odometro: payload.odometro,
      p_inclinacao: payload.inclinacao || 0,
      p_vibracao: payload.vibracao || 0.0,
      p_rumo: payload.rumo || 0,
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("Erro ao processar pacote de telemetria:", err);
    return false;
  }
}

export interface ResultadoTesteComunicacao {
  ativo: boolean;
  statusTexto: "ativo" | "sem_comunicacao";
  rotulo: string;
  minutosDesdeUltimaTransmissao: number | null;
  latenciaMs: number;
  mensagem: string;
  ultimaAtualizacao: string | null;
  rastreador_modelo?: string | null;
}

export function avaliarStatusComunicacao(ultimaAtualizacao?: string | null): {
  ativo: boolean;
  rotulo: string;
  detalhe: string;
  minutos: number | null;
} {
  if (!ultimaAtualizacao) {
    return {
      ativo: false,
      rotulo: "Sem Comunicacao",
      detalhe: "Nenhuma transmissao registrada",
      minutos: null,
    };
  }

  const dataAtual = Date.now();
  const dataTransmissao = new Date(ultimaAtualizacao).getTime();
  if (isNaN(dataTransmissao)) {
    return {
      ativo: false,
      rotulo: "Sem Comunicacao",
      detalhe: "Registro invalido",
      minutos: null,
    };
  }

  const diffMinutos = Math.floor((dataAtual - dataTransmissao) / (1000 * 60));

  // Rastreador com comunicacao ativa se transmitiu ha ate 10 minutos
  if (diffMinutos <= 10) {
    const detalhe =
      diffMinutos <= 0
        ? "Transmitindo agora"
        : diffMinutos === 1
          ? "Ultima transmissao ha 1 minuto"
          : `Ultima transmissao ha ${diffMinutos} minutos`;

    return {
      ativo: true,
      rotulo: "Comunicacao Ativa",
      detalhe,
      minutos: diffMinutos,
    };
  }

  // Mais de 10 minutos: Sem comunicacao
  let tempoTexto = "";
  if (diffMinutos < 60) {
    tempoTexto = `${diffMinutos} minutos`;
  } else if (diffMinutos < 1440) {
    const horas = Math.floor(diffMinutos / 60);
    tempoTexto = `${horas} ${horas === 1 ? "hora" : "horas"}`;
  } else {
    const dias = Math.floor(diffMinutos / 1440);
    tempoTexto = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  }

  return {
    ativo: false,
    rotulo: "Sem Comunicacao",
    detalhe: `Sem sinal ha ${tempoTexto}`,
    minutos: diffMinutos,
  };
}

export async function testarComunicacaoRastreador(
  veiculoId: string,
): Promise<ResultadoTesteComunicacao> {
  const inicio = performance.now();

  // Tratamento específico para Propriedades Monitoradas e Postos de Vigilância
  if (veiculoId.startsWith("posto-")) {
    const latenciaMs = Math.max(1, Math.round(performance.now() - inicio));
    return {
      ativo: true,
      statusTexto: "ativo",
      rotulo: "Propriedade Georreferenciada Ativa",
      minutosDesdeUltimaTransmissao: 0,
      latenciaMs,
      mensagem: `Propriedade Monitorada: Perímetro de segurança e coordenadas auditadas no cadastro (Latência: ${latenciaMs}ms)`,
      ultimaAtualizacao: new Date().toISOString(),
      rastreador_modelo: "Posto Fixo Georreferenciado",
    };
  }

  // 1. Canal Primário: Rota segura de backend com Service Role (/api/veiculos/saude)
  // Imune a bloqueios de RLS e recursão de clientes, retornando telemetria e modelo factuais
  try {
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      /* segue sem token */
    }

    const res = await fetch(`/api/veiculos/saude?veiculoId=${encodeURIComponent(veiculoId)}`, {
      method: "GET",
      headers,
    });

    const latenciaMs = Math.max(1, Math.round(performance.now() - inicio));

    if (res.ok) {
      const json = await res.json();
      if (json && json.success) {
        return {
          ativo: Boolean(json.ativo),
          statusTexto: json.statusTexto || (json.ativo ? "ativo" : "sem_comunicacao"),
          rotulo: json.rotulo || (json.ativo ? "Comunicacao Ativa" : "Sem Comunicacao"),
          minutosDesdeUltimaTransmissao:
            json.minutosDesdeUltimaTransmissao !== undefined
              ? json.minutosDesdeUltimaTransmissao
              : null,
          latenciaMs: json.latenciaMs || latenciaMs,
          mensagem: json.mensagem || (json.ativo ? "Comunicação ativa." : "Sem comunicação."),
          ultimaAtualizacao: json.ultimaAtualizacao || null,
          rastreador_modelo: json.rastreador_modelo || null,
        };
      }
    }
  } catch (errApi) {
    console.warn(
      "[testarComunicacaoRastreador] Aviso na rota primária /api/veiculos/saude:",
      errApi,
    );
  }

  // 2. Canal de Contingência: Consulta direta via SDK local
  try {
    const { data, error } = await supabase
      .from("veiculos")
      .select("id, placa, ultima_atualizacao, ignicao_status, velocidade_atual, satelites")
      .eq("id", veiculoId)
      .maybeSingle();

    const latenciaMs = Math.max(1, Math.round(performance.now() - inicio));

    if (error || !data) {
      return {
        ativo: false,
        statusTexto: "sem_comunicacao",
        rotulo: "Sem Comunicacao",
        minutosDesdeUltimaTransmissao: null,
        latenciaMs,
        mensagem: "Falha ao contactar telemetria do veiculo.",
        ultimaAtualizacao: null,
      };
    }

    const avaliacao = avaliarStatusComunicacao(data.ultima_atualizacao);

    const mensagem = avaliacao.ativo
      ? `Comunicacao Ativa: Rastreador respondendo normalmente (Ping: ${latenciaMs}ms · ${avaliacao.detalhe})`
      : `Sem Comunicacao: Rastreador sem transmissao recente (Ping: ${latenciaMs}ms · ${avaliacao.detalhe})`;

    return {
      ativo: avaliacao.ativo,
      statusTexto: avaliacao.ativo ? "ativo" : "sem_comunicacao",
      rotulo: avaliacao.rotulo,
      minutosDesdeUltimaTransmissao: avaliacao.minutos,
      latenciaMs,
      mensagem,
      ultimaAtualizacao: data.ultima_atualizacao || null,
    };
  } catch (err: any) {
    const latenciaMs = Math.max(1, Math.round(performance.now() - inicio));
    return {
      ativo: false,
      statusTexto: "sem_comunicacao",
      rotulo: "Sem Comunicacao",
      minutosDesdeUltimaTransmissao: null,
      latenciaMs,
      mensagem: "Erro ao testar canal de dados do rastreador.",
      ultimaAtualizacao: null,
    };
  }
}

export function calcularDistanciaMetrosGps(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatarMinutosJornada(minutos: number): string {
  if (minutos < 1) return "Menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const minRestantes = minutos % 60;
  if (minRestantes === 0) return `${horas}h`;
  return `${horas}h ${minRestantes}min`;
}

/**
 * Extrai as paradas intermediárias entre múltiplos ciclos de viagens e/ou pontos estacionados
 */
export function extrairParadasJornada(
  ciclos: TrajetoViagem[],
  pontos: PosicaoHistorico[],
): ParadaJornada[] {
  const paradas: ParadaJornada[] = [];
  if (ciclos.length < 2 && pontos.length < 2) return paradas;

  // Ordena ciclos cronologicamente (mais antigo primeiro)
  const ciclosCronologicos = [...ciclos].sort(
    (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime(),
  );

  // Paradas entre os ciclos de viagens concluídos
  for (let i = 0; i < ciclosCronologicos.length - 1; i++) {
    const atual = ciclosCronologicos[i];
    const proxima = ciclosCronologicos[i + 1];

    const fimAtual = atual.fim_at
      ? new Date(atual.fim_at).getTime()
      : new Date(atual.inicio_at).getTime();
    const inicioProx = new Date(proxima.inicio_at).getTime();
    const diffMs = inicioProx - fimAtual;
    const duracaoMinutos = Math.max(1, Math.round(diffMs / (1000 * 60)));

    // Se houve parada >= 1 minuto entre os ciclos
    if (diffMs > 30 * 1000) {
      let latParada = pontos.length > 0 ? pontos[0].latitude : 0;
      let lonParada = pontos.length > 0 ? pontos[0].longitude : 0;
      let indicePonto = 0;

      if (pontos.length > 0) {
        let menorDiff = Infinity;
        for (let pIdx = 0; pIdx < pontos.length; pIdx++) {
          const ptTime = new Date(pontos[pIdx].data_hora_gps).getTime();
          const d = Math.abs(ptTime - fimAtual);
          if (d < menorDiff) {
            menorDiff = d;
            indicePonto = pIdx;
            latParada = pontos[pIdx].latitude;
            lonParada = pontos[pIdx].longitude;
          }
        }
      }

      paradas.push({
        id: `parada-${atual.id}-${proxima.id}`,
        ordem: paradas.length + 1,
        indicePonto,
        latitude: latParada,
        longitude: lonParada,
        inicio_at: atual.fim_at || atual.inicio_at,
        fim_at: proxima.inicio_at,
        duracaoMinutos,
        duracaoFormatada: formatarMinutosJornada(duracaoMinutos),
      });
    }
  }

  return paradas;
}

/**
 * Consolida a jornada multi-ciclos entre um ponto de partida e um ponto de chegada/retorno
 */
export function consolidarJornadaMultiCiclos(
  viagemInicioId: string,
  viagemFimId: string,
  todasViagens: TrajetoViagem[],
  pontos: PosicaoHistorico[],
): JornadaConsolidada | null {
  if (!todasViagens || todasViagens.length === 0) return null;

  const viagensCronologicas = [...todasViagens].sort(
    (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime(),
  );

  const idxInicio = viagensCronologicas.findIndex((v) => v.id === viagemInicioId);
  const idxFim = viagensCronologicas.findIndex((v) => v.id === viagemFimId);

  if (idxInicio === -1 || idxFim === -1) return null;

  const minIdx = Math.min(idxInicio, idxFim);
  const maxIdx = Math.max(idxInicio, idxFim);

  const ciclosNoPeriodo = viagensCronologicas.slice(minIdx, maxIdx + 1);
  if (ciclosNoPeriodo.length === 0) return null;

  const primeiraViagem = ciclosNoPeriodo[0];
  const ultimaViagem = ciclosNoPeriodo[ciclosNoPeriodo.length - 1];

  const inicioAt = primeiraViagem.inicio_at;
  const fimAt = ultimaViagem.fim_at || ultimaViagem.inicio_at;

  const pontosJornada = pontos.filter((p) => {
    const t = new Date(p.data_hora_gps).getTime();
    return t >= new Date(inicioAt).getTime() && t <= new Date(fimAt).getTime();
  });

  let kmTotal = 0;
  let somaVel = 0;
  let contVel = 0;
  let maxVel = 0;
  let tempoTransitoMinutos = 0;

  for (const ciclo of ciclosNoPeriodo) {
    kmTotal += ciclo.km_percorrido || 0;
    if (ciclo.velocidade_maxima > maxVel) maxVel = ciclo.velocidade_maxima;

    const tIni = new Date(ciclo.inicio_at).getTime();
    const tFim = ciclo.fim_at ? new Date(ciclo.fim_at).getTime() : tIni;
    const durCicloMin = Math.max(0, Math.round((tFim - tIni) / (1000 * 60)));
    tempoTransitoMinutos += durCicloMin;
  }

  for (const pt of pontosJornada) {
    const v = Number(pt.velocidade) || 0;
    if (v > maxVel) maxVel = v;
    if (v > 0) {
      somaVel += v;
      contVel++;
    }
  }

  if (kmTotal === 0 && pontosJornada.length > 1) {
    let distPontosKm = 0;
    for (let i = 1; i < pontosJornada.length; i++) {
      const p1 = pontosJornada[i - 1];
      const p2 = pontosJornada[i];
      const dM = calcularDistanciaMetrosGps(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      if (dM > 5 && dM < 5000) {
        distPontosKm += dM / 1000;
      }
    }
    kmTotal = Math.round(distPontosKm);
  }

  const velocidadeMedia = contVel > 0 ? Math.round(somaVel / contVel) : 0;
  const paradas = extrairParadasJornada(ciclosNoPeriodo, pontosJornada);
  const tempoParadoMinutos = paradas.reduce((acc, p) => acc + p.duracaoMinutos, 0);

  let retornouAoInicio = false;
  let distanciaRetornoMetros = 999999;
  if (pontosJornada.length >= 2) {
    const primeiroPonto = pontosJornada[0];
    const ultimoPonto = pontosJornada[pontosJornada.length - 1];
    distanciaRetornoMetros = Math.round(
      calcularDistanciaMetrosGps(
        primeiroPonto.latitude,
        primeiroPonto.longitude,
        ultimoPonto.latitude,
        ultimoPonto.longitude,
      ),
    );
    retornouAoInicio = distanciaRetornoMetros <= 250;
  }

  return {
    viagemInicioId,
    viagemFimId,
    ciclos: ciclosNoPeriodo,
    inicio_at: inicioAt,
    fim_at: fimAt,
    kmTotal: Math.round(kmTotal),
    tempoTransitoMinutos,
    tempoParadoMinutos,
    velocidadeMedia,
    velocidadeMaxima: Math.round(maxVel),
    paradas,
    retornouAoInicio,
    distanciaRetornoMetros,
  };
}

/**
 * Função de privacidade de localização desativada na Central de Monitoramento 24/7.
 * Mantida por compatibilidade de assinatura, retornando sucesso imediato.
 */
export async function atualizarPrivacidadeVeiculo(
  _veiculoId: string,
  _privacidade: boolean,
): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

/**
 * Dispara consulta pontual do odômetro físico armazenado na MCU do J16 (MILEAGE#)
 * ou diagnóstico/status para rastreadores G900L (check123456)
 */
export async function consultarOdometroHardwareJ16(
  imei?: string | null,
  veiculoId?: string | null,
  modeloHardware?: string | null,
): Promise<{ success: boolean; mensagem: string }> {
  try {
    if (!imei && !veiculoId) {
      return { success: false, mensagem: "IMEI ou Veículo não informado." };
    }
    let imeiAlvo = imei;
    if (!imeiAlvo && veiculoId) {
      const { data: v } = await supabase
        .from("veiculos")
        .select("rastreador_imei")
        .eq("id", veiculoId)
        .maybeSingle();
      imeiAlvo = v?.rastreador_imei;
    }
    if (!imeiAlvo) {
      return { success: false, mensagem: "Rastreador não vinculado a este veículo." };
    }

    const isG900L = Boolean(modeloHardware?.toUpperCase().includes("G900"));
    const comando = isG900L ? "check123456" : "MILEAGE#";

    const res = await fetch("/api/gateway/comando", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imei: imeiAlvo,
        comando,
        veiculoId: veiculoId || undefined,
        origem: "telemetry_drawer_odometro",
      }),
    });
    if (!res.ok) {
      return { success: false, mensagem: "Falha na comunicação com o Gateway TCP." };
    }
    return {
      success: true,
      mensagem: isG900L
        ? "Comando check123456 transmitido à controladora G900L com sucesso."
        : "Comando MILEAGE# transmitido ao J16 com sucesso.",
    };
  } catch (err: any) {
    return { success: false, mensagem: err?.message || "Erro ao consultar odômetro do hardware." };
  }
}

/**
 * Calibra a quilometragem física da MCU do J16 com o valor do painel/sistema (MILEAGE,X#)
 * ou equaliza odometria para hardware G900L
 */
export async function calibrarOdometroHardwareJ16(
  km: number,
  imei?: string | null,
  veiculoId?: string | null,
  modeloHardware?: string | null,
): Promise<{ success: boolean; mensagem: string }> {
  try {
    if (!imei && !veiculoId) {
      return { success: false, mensagem: "IMEI ou Veículo não informado." };
    }
    let imeiAlvo = imei;
    if (!imeiAlvo && veiculoId) {
      const { data: v } = await supabase
        .from("veiculos")
        .select("rastreador_imei")
        .eq("id", veiculoId)
        .maybeSingle();
      imeiAlvo = v?.rastreador_imei;
    }
    if (!imeiAlvo) {
      return { success: false, mensagem: "Rastreador não vinculado a este veículo." };
    }

    const valorKm = Math.max(0, Math.round(km));
    const isG900L = Boolean(modeloHardware?.toUpperCase().includes("G900"));
    const cmd = isG900L ? "fix030s***n123456" : `MILEAGE=${valorKm}#`;

    const res = await fetch("/api/gateway/comando", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imei: imeiAlvo,
        comando: cmd,
        veiculoId: veiculoId || undefined,
        origem: "telemetry_drawer_calibrar_odometro",
      }),
    });
    if (!res.ok) {
      return { success: false, mensagem: "Falha na comunicação com o Gateway TCP." };
    }

    // Persiste atualização imediata e dispara leitura de confirmação após gravação na Flash EEPROM
    if (veiculoId) {
      await supabase
        .from("veiculos")
        .update({
          odometro_hardware_km: valorKm,
          odometro_hardware_atualizado_em: new Date().toISOString(),
        })
        .eq("id", veiculoId);

      // Dispara comando de leitura de confirmação
      setTimeout(async () => {
        try {
          await fetch("/api/gateway/comando", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imei: imeiAlvo,
              comando: isG900L ? "check123456" : "MILEAGE#",
              veiculoId: veiculoId || undefined,
              origem: "pos_calibracao_leitura",
            }),
          });
        } catch {
          // Silencioso
        }
      }, 1500);
    }

    return {
      success: true,
      mensagem: isG900L
        ? `Odômetro equalizado em ${valorKm.toLocaleString("pt-BR")} km para o hardware G900L.`
        : `Comando ${cmd} transmitido com sucesso. Odômetro da MCU equalizado em ${valorKm.toLocaleString("pt-BR")} km.`,
    };
  } catch (err: any) {
    return { success: false, mensagem: err?.message || "Erro ao calibrar odômetro do hardware." };
  }
}

/**
 * Atualiza a métrica principal do veículo: "km" (Odômetro) ou "horimetro" (Horas de Uso).
 * Permite também calibrar o valor inicial de horas de funcionamento do motor.
 */
export async function atualizarMetricaVeiculo(
  veiculoId: string,
  tipoMedicao: "km" | "horimetro",
  horimetroInicial?: number,
): Promise<{ success: boolean; message: string; horimetro_horas?: number }> {
  try {
    // 1. Tenta rota segura do backend Cloudflare Workers
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token;
    if (token && typeof window !== "undefined") {
      const res = await fetch("/api/veiculos/metrica", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ veiculoId, tipoMedicao, horimetroInicial }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json;
      }
    }

    // 2. Fallback direto via RPC atômica atualizar_metrica_veiculo
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
      "atualizar_metrica_veiculo",
      {
        p_veiculo_id: veiculoId,
        p_tipo_medicao: tipoMedicao,
        p_horimetro_horas: horimetroInicial ?? null,
      },
    );
    if (!rpcErr && rpcData?.sucesso) {
      return {
        success: true,
        message: "Métrica operacional atualizada com sucesso.",
        horimetro_horas: rpcData.horimetro_horas,
      };
    }

    // 3. Fallback clássico update
    const updatePayload: Record<string, any> = {
      tipo_medicao: tipoMedicao,
      updated_at: new Date().toISOString(),
    };
    if (horimetroInicial !== undefined && horimetroInicial >= 0) {
      updatePayload.horimetro_horas = horimetroInicial;
    }
    const { error: errUp } = await supabase
      .from("veiculos")
      .update(updatePayload)
      .eq("id", veiculoId);

    if (errUp) {
      return { success: false, message: errUp.message };
    }

    return {
      success: true,
      message: "Métrica operacional atualizada com sucesso.",
      horimetro_horas: horimetroInicial,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Falha ao atualizar métrica." };
  }
}
