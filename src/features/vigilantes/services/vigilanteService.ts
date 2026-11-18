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
    if (!error && data && data.length > 0) {
      return data as Vigilante[];
    }
  } catch {
    /* Fallback */
  }

  // Fallback em localStorage com chave local
  try {
    const raw = localStorage.getItem("gd_vigilantes_cadastrados");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
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
      if (!error && data) return data as Vigilante;
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
      if (!error && data) return data as Vigilante;
    }
  } catch {
    /* Fallback */
  }

  // Fallback em localStorage
  try {
    const raw = localStorage.getItem("gd_vigilantes_cadastrados");
    const lista: Vigilante[] = raw ? JSON.parse(raw) : [];
    if (vigilante.id) {
      const idx = lista.findIndex((v) => v.id === vigilante.id);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], ...vigilante } as Vigilante;
        localStorage.setItem("gd_vigilantes_cadastrados", JSON.stringify(lista));
        return lista[idx];
      }
    } else {
      const novo: Vigilante = {
        id: crypto.randomUUID(),
        nome: vigilante.nome!,
        cpf: vigilante.cpf || null,
        matricula: vigilante.matricula || null,
        telefone: vigilante.telefone || null,
        turno_padrao: vigilante.turno_padrao || "12x36",
        ativo: vigilante.ativo ?? true,
        observacoes: vigilante.observacoes || null,
        created_at: new Date().toISOString(),
      };
      lista.push(novo);
      localStorage.setItem("gd_vigilantes_cadastrados", JSON.stringify(lista));
      return novo;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Remove vigilante
 */
export async function excluirVigilante(id: string): Promise<boolean> {
  try {
    await supabase.from("vigilantes").delete().eq("id", id);
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("gd_vigilantes_cadastrados");
    if (raw) {
      const lista: Vigilante[] = JSON.parse(raw);
      const filtrados = lista.filter((v) => v.id !== id);
      localStorage.setItem("gd_vigilantes_cadastrados", JSON.stringify(filtrados));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Busca postos de vigilância / propriedades monitoradas
 */
export async function carregarPostosVigilancia(): Promise<PostoVigilancia[]> {
  // 1. Tenta buscar via endpoint de alta disponibilidade no servidor
  try {
    const res = await fetch("/api/vigilantes/postos");
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json?.postos)) {
        return json.postos as PostoVigilancia[];
      }
    }
  } catch {
    /* Fallback para Supabase direto */
  }

  // 2. Tenta buscar na tabela dedicada postos_vigilancia
  try {
    const { data, error } = await supabase
      .from("postos_vigilancia")
      .select("*")
      .order("nome", { ascending: true });
    if (!error && data && data.length > 0) {
      return data as PostoVigilancia[];
    }
  } catch {
    /* Fallback para areas_seguras */
  }

  // 3. Busca na tabela nativa areas_seguras onde tipo = 'posto_vigilancia'
  try {
    const { data, error } = await supabase
      .from("areas_seguras")
      .select("*")
      .eq("tipo", "posto_vigilancia")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((a: any) => ({
        id: a.id,
        cliente_id: a.cliente_id,
        nome: a.nome,
        endereco: a.poligono_geojson?.endereco || null,
        latitude: a.latitude,
        longitude: a.longitude,
        raio_metros: a.raio_metros || 100,
        perimetro_poligono: a.poligono_geojson?.coordinates
          ? {
              type: "Polygon" as const,
              coordinates: a.poligono_geojson.coordinates,
            }
          : null,
        ativo: a.ativo ?? true,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));
    }
  } catch (err) {
    console.warn("Erro ao buscar postos em areas_seguras:", err);
  }

  // 4. Fallback localStorage
  try {
    const raw = localStorage.getItem("gd_postos_vigilancia");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Cadastra ou atualiza posto de vigilância (com suporte a perímetro em polígono)
 */
export async function salvarPostoVigilancia(
  posto: Partial<PostoVigilancia>,
): Promise<PostoVigilancia | null> {
  // 1. Tenta salvar via endpoint canônico seguro com Service Role
  try {
    const res = await fetch("/api/vigilantes/postos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(posto),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.posto) {
        return json.posto as PostoVigilancia;
      }
    }
  } catch {
    /* Fallback para Supabase direto */
  }

  // 2. Tenta salvar na tabela dedicada postos_vigilancia
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
      if (!error && data) return data as PostoVigilancia;
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
      if (!error && data) return data as PostoVigilancia;
    }
  } catch {
    /* Fallback imediato para areas_seguras */
  }

  // 3. Persistência de alta disponibilidade na tabela real areas_seguras
  try {
    const geojsonSalvar = {
      type: "Polygon",
      coordinates: posto.perimetro_poligono?.coordinates || [],
      endereco: posto.endereco || null,
    };

    if (posto.id) {
      const { data, error } = await supabase
        .from("areas_seguras")
        .update({
          nome: posto.nome,
          tipo: "posto_vigilancia",
          latitude: posto.latitude,
          longitude: posto.longitude,
          raio_metros: posto.raio_metros || 100,
          poligono_geojson: geojsonSalvar,
          ativo: posto.ativo ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", posto.id)
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          nome: data.nome,
          endereco: posto.endereco || null,
          latitude: data.latitude,
          longitude: data.longitude,
          raio_metros: data.raio_metros,
          perimetro_poligono: posto.perimetro_poligono || null,
          ativo: data.ativo,
        };
      }
    } else {
      const { data, error } = await supabase
        .from("areas_seguras")
        .insert({
          nome: posto.nome!,
          tipo: "posto_vigilancia",
          latitude: posto.latitude!,
          longitude: posto.longitude!,
          raio_metros: posto.raio_metros || 100,
          poligono_geojson: geojsonSalvar,
          regra_entrada: "permitida",
          regra_saida: "permitida",
          tolerancia_metros: 50,
          ativo: posto.ativo ?? true,
        })
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          nome: data.nome,
          endereco: posto.endereco || null,
          latitude: data.latitude,
          longitude: data.longitude,
          raio_metros: data.raio_metros,
          perimetro_poligono: posto.perimetro_poligono || null,
          ativo: data.ativo,
        };
      }
    }
  } catch (err) {
    console.warn("Erro ao salvar posto em areas_seguras:", err);
  }

  // 4. Fallback em localStorage
  try {
    const raw = localStorage.getItem("gd_postos_vigilancia");
    const lista: PostoVigilancia[] = raw ? JSON.parse(raw) : [];
    if (posto.id) {
      const idx = lista.findIndex((p) => p.id === posto.id);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], ...posto } as PostoVigilancia;
        localStorage.setItem("gd_postos_vigilancia", JSON.stringify(lista));
        return lista[idx];
      }
    } else {
      const novo: PostoVigilancia = {
        id: crypto.randomUUID(),
        nome: posto.nome!,
        endereco: posto.endereco || null,
        latitude: posto.latitude!,
        longitude: posto.longitude!,
        raio_metros: posto.raio_metros || 100,
        perimetro_poligono: posto.perimetro_poligono || null,
        ativo: posto.ativo ?? true,
        created_at: new Date().toISOString(),
      };
      lista.push(novo);
      localStorage.setItem("gd_postos_vigilancia", JSON.stringify(lista));
      return novo;
    }
  } catch {
    /* ignore */
  }
  return null;
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
    if (!error && data && data.length > 0) {
      return data as RondaCheckpoint[];
    }
  } catch {
    /* ignore */
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(`gd_checkpoints_${postoId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
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
      if (!error && data) return data as RondaCheckpoint;
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
      if (!error && data) return data as RondaCheckpoint;
    }
  } catch {
    /* ignore */
  }

  // Fallback localStorage
  try {
    const postoId = checkpoint.posto_id!;
    const raw = localStorage.getItem(`gd_checkpoints_${postoId}`);
    const lista: RondaCheckpoint[] = raw ? JSON.parse(raw) : [];

    if (checkpoint.id) {
      const idx = lista.findIndex((c) => c.id === checkpoint.id);
      if (idx >= 0) {
        lista[idx] = { ...lista[idx], ...checkpoint } as RondaCheckpoint;
        localStorage.setItem(`gd_checkpoints_${postoId}`, JSON.stringify(lista));
        return lista[idx];
      }
    } else {
      const novo: RondaCheckpoint = {
        id: crypto.randomUUID(),
        posto_id: postoId,
        nome: checkpoint.nome!,
        latitude: checkpoint.latitude!,
        longitude: checkpoint.longitude!,
        ordem: checkpoint.ordem ?? lista.length + 1,
        horario_previsto: checkpoint.horario_previsto!,
        tolerancia_minutos: checkpoint.tolerancia_minutos ?? 3,
        raio_captura_metros: checkpoint.raio_captura_metros ?? 20,
        cor_marcador: checkpoint.cor_marcador || "#2563eb",
        ativo: true,
        created_at: new Date().toISOString(),
      };
      lista.push(novo);
      localStorage.setItem(`gd_checkpoints_${postoId}`, JSON.stringify(lista));
      return novo;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Exclui um checkpoint
 */
export async function excluirCheckpoint(id: string): Promise<boolean> {
  try {
    await supabase.from("rondas_checkpoints").delete().eq("id", id);
  } catch {
    /* ignore */
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("gd_checkpoints_")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const lista: RondaCheckpoint[] = JSON.parse(raw);
          const filtrados = lista.filter((c) => c.id !== id);
          if (filtrados.length !== lista.length) {
            localStorage.setItem(key, JSON.stringify(filtrados));
            return true;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return true;
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
    if (!error && data && data.length > 0) {
      return data as TurnoVigilancia[];
    }
  } catch {
    /* ignore */
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem("gd_turnos_vigilancia");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
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
      if (!error && data) return data as TurnoVigilancia;
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
      if (!error && data) return data as TurnoVigilancia;
    }
  } catch {
    /* ignore */
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem("gd_turnos_vigilancia");
    const lista: TurnoVigilancia[] = raw ? JSON.parse(raw) : [];

    // Busca vigilante e posto para enriquecer
    const vigilantes = await carregarVigilantes();
    const postos = await carregarPostosVigilancia();
    const vig = vigilantes.find((v) => v.id === turno.vigilante_id);
    const pst = postos.find((p) => p.id === turno.posto_id);

    if (turno.id) {
      const idx = lista.findIndex((t) => t.id === turno.id);
      if (idx >= 0) {
        lista[idx] = {
          ...lista[idx],
          ...turno,
          vigilante: vig || lista[idx].vigilante,
          posto: pst || lista[idx].posto,
        } as TurnoVigilancia;
        localStorage.setItem("gd_turnos_vigilancia", JSON.stringify(lista));
        return lista[idx];
      }
    } else {
      const novo: TurnoVigilancia = {
        id: crypto.randomUUID(),
        vigilante_id: turno.vigilante_id!,
        posto_id: turno.posto_id!,
        rastreador_imei: turno.rastreador_imei!,
        data_turno: turno.data_turno || new Date().toISOString().slice(0, 10),
        hora_inicio: turno.hora_inicio || "18:00:00",
        hora_fim: turno.hora_fim || "06:00:00",
        status: turno.status || "em_andamento",
        vigilante: vig,
        posto: pst,
        created_at: new Date().toISOString(),
      };
      lista.push(novo);
      localStorage.setItem("gd_turnos_vigilancia", JSON.stringify(lista));
      return novo;
    }
  } catch {
    /* ignore */
  }
  return null;
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
