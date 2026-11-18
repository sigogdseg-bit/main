import { supabase } from "@/integrations/supabase/client";
import {
  calcularDistanciaMetros,
  pontoDentroDoPoligono,
} from "@/features/monitor-gps/services/protecaoVeiculoService";
import type {
  Vigilante,
  PostoVigilancia,
  RondaCheckpoint,
  TurnoVigilancia,
  RegistroRonda,
} from "../types";

/**
 * Busca a lista de vigilantes cadastrados
 */
export async function carregarVigilantes(somenteAtivos = false): Promise<Vigilante[]> {
  try {
    let query = supabase.from("vigilantes").select("*").order("nome", { ascending: true });
    if (somenteAtivos) {
      query = query.eq("ativo", true);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Vigilante[];
  } catch (err) {
    console.warn("Erro ao carregar vigilantes:", err);
    return [];
  }
}

/**
 * Cadastra ou atualiza vigilante
 */
export async function salvarVigilante(vigilante: Partial<Vigilante>): Promise<Vigilante | null> {
  try {
    if (vigilante.id) {
      const { data, error } = await supabase
        .from("vigilantes")
        .update({
          nome: vigilante.nome,
          cpf: vigilante.cpf || null,
          matricula: vigilante.matricula || null,
          telefone: vigilante.telefone || null,
          turno_padrao: vigilante.turno_padrao || "12x36",
          ativo: vigilante.ativo ?? true,
          observacoes: vigilante.observacoes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", vigilante.id)
        .select()
        .single();
      if (error) throw error;
      return data as Vigilante;
    } else {
      const { data, error } = await supabase
        .from("vigilantes")
        .insert({
          nome: vigilante.nome!,
          cpf: vigilante.cpf || null,
          matricula: vigilante.matricula || null,
          telefone: vigilante.telefone || null,
          turno_padrao: vigilante.turno_padrao || "12x36",
          ativo: vigilante.ativo ?? true,
          observacoes: vigilante.observacoes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Vigilante;
    }
  } catch (err) {
    console.error("Erro ao salvar vigilante:", err);
    return null;
  }
}

/**
 * Remove vigilante
 */
export async function excluirVigilante(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("vigilantes").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao excluir vigilante:", err);
    return false;
  }
}

/**
 * Busca postos de vigilância / propriedades monitoradas
 */
export async function carregarPostosVigilancia(): Promise<PostoVigilancia[]> {
  try {
    const { data, error } = await supabase
      .from("postos_vigilancia")
      .select("*")
      .order("nome", { ascending: true });
    if (error) throw error;
    return (data || []) as PostoVigilancia[];
  } catch (err) {
    console.warn("Erro ao carregar postos de vigilância:", err);
    return [];
  }
}

/**
 * Cadastra ou atualiza posto de vigilância (com suporte a perímetro em polígono)
 */
export async function salvarPostoVigilancia(
  posto: Partial<PostoVigilancia>,
): Promise<PostoVigilancia | null> {
  try {
    if (posto.id) {
      const { data, error } = await supabase
        .from("postos_vigilancia")
        .update({
          nome: posto.nome,
          cliente_id: posto.cliente_id || null,
          endereco: posto.endereco || null,
          latitude: posto.latitude,
          longitude: posto.longitude,
          raio_metros: posto.raio_metros || 100,
          perimetro_poligono: posto.perimetro_poligono || null,
          ativo: posto.ativo ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", posto.id)
        .select()
        .single();
      if (error) throw error;
      return data as PostoVigilancia;
    } else {
      const { data, error } = await supabase
        .from("postos_vigilancia")
        .insert({
          nome: posto.nome!,
          cliente_id: posto.cliente_id || null,
          endereco: posto.endereco || null,
          latitude: posto.latitude!,
          longitude: posto.longitude!,
          raio_metros: posto.raio_metros || 100,
          perimetro_poligono: posto.perimetro_poligono || null,
          ativo: posto.ativo ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PostoVigilancia;
    }
  } catch (err) {
    console.error("Erro ao salvar posto de vigilância:", err);
    return null;
  }
}

/**
 * Busca checkpoints de ronda de um posto
 */
export async function carregarCheckpoints(postoId: string): Promise<RondaCheckpoint[]> {
  try {
    const { data, error } = await supabase
      .from("rondas_checkpoints")
      .select("*")
      .eq("posto_id", postoId)
      .order("ordem", { ascending: true });
    if (error) throw error;
    return (data || []) as RondaCheckpoint[];
  } catch (err) {
    console.warn("Erro ao carregar checkpoints:", err);
    return [];
  }
}

/**
 * Salva ou atualiza um checkpoint com horário e tolerância estrita de 3 minutos
 */
export async function salvarCheckpoint(
  checkpoint: Partial<RondaCheckpoint>,
): Promise<RondaCheckpoint | null> {
  try {
    if (checkpoint.id) {
      const { data, error } = await supabase
        .from("rondas_checkpoints")
        .update({
          nome: checkpoint.nome,
          latitude: checkpoint.latitude,
          longitude: checkpoint.longitude,
          ordem: checkpoint.ordem ?? 1,
          horario_previsto: checkpoint.horario_previsto,
          tolerancia_minutos: checkpoint.tolerancia_minutos ?? 3,
          raio_captura_metros: checkpoint.raio_captura_metros ?? 20,
          cor_marcador: checkpoint.cor_marcador || "#2563eb",
          ativo: checkpoint.ativo ?? true,
        })
        .eq("id", checkpoint.id)
        .select()
        .single();
      if (error) throw error;
      return data as RondaCheckpoint;
    } else {
      const { data, error } = await supabase
        .from("rondas_checkpoints")
        .insert({
          posto_id: checkpoint.posto_id!,
          nome: checkpoint.nome!,
          latitude: checkpoint.latitude!,
          longitude: checkpoint.longitude!,
          ordem: checkpoint.ordem ?? 1,
          horario_previsto: checkpoint.horario_previsto!,
          tolerancia_minutos: checkpoint.tolerancia_minutos ?? 3,
          raio_captura_metros: checkpoint.raio_captura_metros ?? 20,
          cor_marcador: checkpoint.cor_marcador || "#2563eb",
          ativo: checkpoint.ativo ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as RondaCheckpoint;
    }
  } catch (err) {
    console.error("Erro ao salvar checkpoint:", err);
    return null;
  }
}

/**
 * Exclui um checkpoint
 */
export async function excluirCheckpoint(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("rondas_checkpoints").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao excluir checkpoint:", err);
    return false;
  }
}

/**
 * Busca turnos ativos ou agendados
 */
export async function carregarTurnos(): Promise<TurnoVigilancia[]> {
  try {
    const { data, error } = await supabase
      .from("turnos_vigilancia")
      .select("*, vigilante:vigilantes(*), posto:postos_vigilancia(*)")
      .order("data_turno", { ascending: false })
      .order("hora_inicio", { ascending: false });
    if (error) throw error;
    return (data || []) as TurnoVigilancia[];
  } catch (err) {
    console.warn("Erro ao carregar turnos:", err);
    return [];
  }
}

/**
 * Salva ou inicia um turno associando o vigilante ao IMEI do rastreador portátil
 */
export async function salvarTurno(
  turno: Partial<TurnoVigilancia>,
): Promise<TurnoVigilancia | null> {
  try {
    if (turno.id) {
      const { data, error } = await supabase
        .from("turnos_vigilancia")
        .update({
          vigilante_id: turno.vigilante_id,
          posto_id: turno.posto_id,
          rastreador_imei: turno.rastreador_imei,
          data_turno: turno.data_turno,
          hora_inicio: turno.hora_inicio,
          hora_fim: turno.hora_fim,
          status: turno.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", turno.id)
        .select("*, vigilante:vigilantes(*), posto:postos_vigilancia(*)")
        .single();
      if (error) throw error;
      return data as TurnoVigilancia;
    } else {
      const { data, error } = await supabase
        .from("turnos_vigilancia")
        .insert({
          vigilante_id: turno.vigilante_id!,
          posto_id: turno.posto_id!,
          rastreador_imei: turno.rastreador_imei!,
          data_turno: turno.data_turno || new Date().toISOString().slice(0, 10),
          hora_inicio: turno.hora_inicio || "18:00:00",
          hora_fim: turno.hora_fim || "06:00:00",
          status: turno.status || "em_andamento",
        })
        .select("*, vigilante:vigilantes(*), posto:postos_vigilancia(*)")
        .single();
      if (error) throw error;
      return data as TurnoVigilancia;
    }
  } catch (err) {
    console.error("Erro ao salvar turno de vigilância:", err);
    return null;
  }
}

/**
 * Dispara notificação via proxy seguro de WhatsApp
 */
export async function notificarAlertaRondaWhatsapp(
  telefoneDestino: string,
  mensagem: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telefone: telefoneDestino,
        mensagem,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("Falha ao disparar alerta WhatsApp da ronda:", err);
    return false;
  }
}

/**
 * Converte string "HH:MM:SS" ou "HH:MM" para minutos do dia
 */
export function converterHoraParaMinutos(horarioStr: string): number {
  if (!horarioStr) return 0;
  const partes = horarioStr.split(":").map((v) => parseInt(v, 10) || 0);
  const horas = partes[0] || 0;
  const minutos = partes[1] || 0;
  return horas * 60 + minutos;
}

/**
 * Avalia se o vigilante está no checkpoint respeitando a margem estrita de 3 minutos
 * Tolerância: 3 minutos antes e 3 minutos depois do horário previsto.
 */
export function verificarJanelaHorarioCheckpoint(
  horarioPrevisto: string,
  horarioAtualMinutos: number,
  toleranciaMinutos: number = 3,
): { dentroJanela: boolean; atrasado: boolean; adiantado: boolean; diferencaMinutos: number } {
  const previstoMinutos = converterHoraParaMinutos(horarioPrevisto);
  const diferenca = horarioAtualMinutos - previstoMinutos;

  const dentroJanela = Math.abs(diferenca) <= toleranciaMinutos;
  const atrasado = diferenca > toleranciaMinutos;
  const adiantado = diferenca < -toleranciaMinutos;

  return {
    dentroJanela,
    atrasado,
    adiantado,
    diferencaMinutos: diferenca,
  };
}

/**
 * Avalia a posição do rastreador portátil do vigilante em relação ao perímetro e aos checkpoints
 */
export function avaliarPosicaoVigilante(
  latitudeRastreador: number,
  longitudeRastreador: number,
  posto: PostoVigilancia,
  checkpoints: RondaCheckpoint[],
  dataHoraAgora: Date = new Date(),
): {
  dentroDoPerimetro: boolean;
  checkpointMaisProximo: {
    checkpoint: RondaCheckpoint;
    distanciaMetros: number;
    dentroRaioCaptura: boolean;
    janelaHorario: ReturnType<typeof verificarJanelaHorarioCheckpoint>;
  } | null;
} {
  // 1. Verifica se está no perímetro (polígono se houver, ou raio)
  let dentroDoPerimetro = false;
  if (posto.perimetro_poligono?.coordinates && posto.perimetro_poligono.coordinates.length >= 3) {
    dentroDoPerimetro = pontoDentroDoPoligono(
      [latitudeRastreador, longitudeRastreador],
      posto.perimetro_poligono.coordinates,
    );
  } else {
    const distPosto = calcularDistanciaMetros(
      latitudeRastreador,
      longitudeRastreador,
      posto.latitude,
      posto.longitude,
    );
    dentroDoPerimetro = distPosto <= (posto.raio_metros || 100);
  }

  // 2. Avalia checkpoints
  if (!checkpoints || checkpoints.length === 0) {
    return { dentroDoPerimetro, checkpointMaisProximo: null };
  }

  const minutosAgora = dataHoraAgora.getHours() * 60 + dataHoraAgora.getMinutes();
  let maisProximo: {
    checkpoint: RondaCheckpoint;
    distanciaMetros: number;
    dentroRaioCaptura: boolean;
    janelaHorario: ReturnType<typeof verificarJanelaHorarioCheckpoint>;
  } | null = null;

  for (const cp of checkpoints) {
    const dist = calcularDistanciaMetros(
      latitudeRastreador,
      longitudeRastreador,
      cp.latitude,
      cp.longitude,
    );
    const janela = verificarJanelaHorarioCheckpoint(
      cp.horario_previsto,
      minutosAgora,
      cp.tolerancia_minutos ?? 3,
    );
    const dentroRaio = dist <= (cp.raio_captura_metros ?? 20);

    if (!maisProximo || dist < maisProximo.distanciaMetros) {
      maisProximo = {
        checkpoint: cp,
        distanciaMetros: Math.round(dist),
        dentroRaioCaptura: dentroRaio,
        janelaHorario: janela,
      };
    }
  }

  return {
    dentroDoPerimetro,
    checkpointMaisProximo: maisProximo,
  };
}
