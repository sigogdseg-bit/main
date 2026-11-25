import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
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
  CicloRondaExecucao,
  CheckpointExecutado,
  StatusCheckinRonda,
  TransmissaoPosicaoVigilante,
  AlertaRondaVigilante,
} from "../types";

function gerarId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
}

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
          email: vigilante.email || null,
          usuario_id: vigilante.usuario_id || null,
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
          email: vigilante.email || null,
          usuario_id: vigilante.usuario_id || null,
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
        id: gerarId(),
        nome: vigilante.nome!,
        cpf: vigilante.cpf || null,
        matricula: vigilante.matricula || null,
        telefone: vigilante.telefone || null,
        email: vigilante.email || null,
        usuario_id: vigilante.usuario_id || null,
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
export async function carregarPostosVigilancia(clienteId?: string): Promise<PostoVigilancia[]> {
  // 1. Tenta buscar via endpoint de alta disponibilidade no servidor
  try {
    const sessaoAtual = obterSessaoCacheada();
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token || (sessaoAtual as any)?.token;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const params = new URLSearchParams();
    if (clienteId) params.set("clienteId", clienteId);
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/vigilantes/postos${queryString}`, { headers });
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
    let query = supabase.from("postos_vigilancia").select("*");
    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }
    const { data, error } = await query.order("nome", { ascending: true });
    if (!error && data && data.length > 0) {
      return data as PostoVigilancia[];
    }
  } catch {
    /* Fallback para areas_seguras */
  }

  // 3. Busca na tabela nativa areas_seguras onde tipo = 'posto_vigilancia'
  try {
    let query = supabase.from("areas_seguras").select("*").eq("tipo", "posto_vigilancia");
    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }
    const { data, error } = await query.order("created_at", { ascending: false });

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
      if (Array.isArray(parsed)) {
        if (clienteId) {
          return parsed.filter((p: any) => p.cliente_id === clienteId);
        }
        return parsed;
      }
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
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/api/vigilantes/postos", {
      method: "POST",
      headers,
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
          cliente_id: posto.cliente_id || null,
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
          cliente_id: data.cliente_id,
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
          cliente_id: posto.cliente_id || null,
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
          cliente_id: data.cliente_id,
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
        id: gerarId(),
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
 * Exclui um posto de vigilância
 */
export async function excluirPostoVigilancia(id: string): Promise<boolean> {
  try {
    const sessaoAtual = obterSessaoCacheada();
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token || (sessaoAtual as any)?.token;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/vigilantes/postos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success) return true;
    }
  } catch {}

  try {
    await supabase.from("areas_seguras").delete().eq("id", id);
    return true;
  } catch {
    return false;
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
 * Salva ou atualiza um checkpoint com suporte a tempo de deslocamento relativo e tolerância de 3 minutos
 */
export async function salvarCheckpoint(
  checkpoint: Partial<RondaCheckpoint>,
): Promise<RondaCheckpoint | null> {
  const horarioPrevistoFinal = checkpoint.horario_previsto || "00:00:00";
  const toleranciaFinal = checkpoint.tolerancia_minutos ?? 3;
  const raioFinal = checkpoint.raio_captura_metros ?? 15;

  try {
    if (checkpoint.id) {
      const { data, error } = await supabase
        .from("rondas_checkpoints")
        .update({
          nome: checkpoint.nome,
          latitude: checkpoint.latitude,
          longitude: checkpoint.longitude,
          ordem: checkpoint.ordem ?? 1,
          horario_previsto: horarioPrevistoFinal,
          tolerancia_minutos: toleranciaFinal,
          raio_captura_metros: raioFinal,
          cor_marcador: checkpoint.cor_marcador || "#2563eb",
          tempo_deslocamento_minutos: checkpoint.tempo_deslocamento_minutos ?? null,
          distancia_metros: checkpoint.distancia_metros ?? null,
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
          horario_previsto: horarioPrevistoFinal,
          tolerancia_minutos: toleranciaFinal,
          raio_captura_metros: raioFinal,
          cor_marcador: checkpoint.cor_marcador || "#2563eb",
          tempo_deslocamento_minutos: checkpoint.tempo_deslocamento_minutos ?? null,
          distancia_metros: checkpoint.distancia_metros ?? null,
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

    const idx = checkpoint.id ? lista.findIndex((c) => c.id === checkpoint.id) : -1;
    if (idx >= 0) {
      lista[idx] = {
        ...lista[idx],
        ...checkpoint,
        tolerancia_minutos: toleranciaFinal,
        raio_captura_metros: raioFinal,
        horario_previsto: horarioPrevistoFinal,
      } as RondaCheckpoint;
      localStorage.setItem(`gd_checkpoints_${postoId}`, JSON.stringify(lista));
      return lista[idx];
    } else {
      const novo: RondaCheckpoint = {
        id: checkpoint.id || gerarId(),
        posto_id: postoId,
        nome: checkpoint.nome!,
        latitude: checkpoint.latitude!,
        longitude: checkpoint.longitude!,
        ordem: checkpoint.ordem ?? lista.length + 1,
        horario_previsto: horarioPrevistoFinal,
        tempo_deslocamento_minutos: checkpoint.tempo_deslocamento_minutos ?? 5,
        distancia_metros: checkpoint.distancia_metros ?? 100,
        tolerancia_minutos: toleranciaFinal,
        raio_captura_metros: raioFinal,
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
 * Calcula automaticamente a rota sequencial circular e o tempo de deslocamento entre os checkpoints do posto
 * com margem de tolerância padrão de ±3 minutos (ajustável).
 * Velocidade média tática a pé/patrulha estimada em ~4.5 km/h (~75 metros por minuto).
 */
export async function calcularTemposDeslocamentoCheckpoints(
  postoId: string,
  checkpoints: RondaCheckpoint[],
): Promise<RondaCheckpoint[]> {
  if (!checkpoints || checkpoints.length === 0) return [];

  // Ordena os checkpoints por sequência estrita
  const ordenados = [...checkpoints].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const atualizados: RondaCheckpoint[] = [];

  for (let i = 0; i < ordenados.length; i++) {
    const cpAtual = ordenados[i];
    // Ponto de referência anterior: no primeiro ponto (i = 0), a referência é o último ponto (circuito circular de ronda)
    const cpAnterior = i === 0 ? ordenados[ordenados.length - 1] : ordenados[i - 1];

    let distanciaMetros = 0;
    let minutosEstimados = 5; // Padrão seguro para ronda em posto

    if (
      cpAnterior &&
      (cpAnterior.latitude !== cpAtual.latitude || cpAnterior.longitude !== cpAtual.longitude)
    ) {
      distanciaMetros = Math.round(
        calcularDistanciaMetros(
          cpAnterior.latitude,
          cpAnterior.longitude,
          cpAtual.latitude,
          cpAtual.longitude,
        ),
      );

      // Velocidade estimada de patrulha a pé/perimetral: 75 m/min (~4.5 km/h)
      // Mínimo 2 minutos se houver distância; caso contrário, proporcional
      minutosEstimados = Math.max(2, Math.ceil(distanciaMetros / 75));
    }

    const checkpointAtualizado: RondaCheckpoint = {
      ...cpAtual,
      ordem: i + 1,
      distancia_metros: distanciaMetros,
      tempo_deslocamento_minutos: cpAtual.tempo_deslocamento_minutos ?? minutosEstimados,
      tolerancia_minutos: cpAtual.tolerancia_minutos ?? 3,
      raio_captura_metros: cpAtual.raio_captura_metros ?? 15,
    };

    // Persiste atualização
    await salvarCheckpoint(checkpointAtualizado);
    atualizados.push(checkpointAtualizado);
  }

  try {
    localStorage.setItem(`gd_checkpoints_${postoId}`, JSON.stringify(atualizados));
  } catch {}

  return atualizados;
}

/**
 * Inicia um ciclo dinâmico de ronda 24h contínua no posto.
 * O relógio parte do momento exato do primeiro ponto; os horários dos pontos subsequentes
 * são projetados dinamicamente somando o tempo de deslocamento estipulado.
 */
export async function iniciarCicloRonda(
  postoId: string,
  vigilanteId: string,
  turnoId?: string | null,
  pontoPartidaOrdem: number = 1,
): Promise<CicloRondaExecucao> {
  const checkpoints = await carregarCheckpoints(postoId);
  const ordenados = [...checkpoints].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  // Reordena circularmente caso o vigilante comece a partir de um ponto intermediário
  let listaReordenada = ordenados;
  const idxInicio = ordenados.findIndex((c) => c.ordem === pontoPartidaOrdem);
  if (idxInicio > 0) {
    listaReordenada = [...ordenados.slice(idxInicio), ...ordenados.slice(0, idxInicio)];
  }

  const agora = new Date();
  let minutosAcumulados = 0;

  const checkpointsExecutados: CheckpointExecutado[] = listaReordenada.map((cp, idx) => {
    if (idx > 0) {
      minutosAcumulados += cp.tempo_deslocamento_minutos ?? 5;
    }
    const horaPrevista = new Date(agora.getTime() + minutosAcumulados * 60000).toISOString();

    return {
      checkpoint_id: cp.id,
      ordem: idx + 1,
      nome: cp.nome,
      hora_prevista: horaPrevista,
      status: "pendente",
    };
  });

  // Determina número do ciclo
  let numeroCiclo = 1;
  try {
    const raw = localStorage.getItem(`gd_ciclos_ronda_${postoId}`);
    if (raw) {
      const ciclos: CicloRondaExecucao[] = JSON.parse(raw);
      if (Array.isArray(ciclos) && ciclos.length > 0) {
        numeroCiclo = ciclos.length + 1;
      }
    }
  } catch {}

  const novoCiclo: CicloRondaExecucao = {
    id: gerarId(),
    posto_id: postoId,
    vigilante_id: vigilanteId,
    turno_id: turnoId || null,
    ciclo_numero: numeroCiclo,
    ponto_partida_ordem: pontoPartidaOrdem,
    data_inicio: agora.toISOString(),
    status: "em_andamento",
    checkpoints_executados: checkpointsExecutados,
    created_at: agora.toISOString(),
    updated_at: agora.toISOString(),
  };

  try {
    const raw = localStorage.getItem(`gd_ciclos_ronda_${postoId}`);
    const lista: CicloRondaExecucao[] = raw ? JSON.parse(raw) : [];
    lista.unshift(novoCiclo);
    localStorage.setItem(`gd_ciclos_ronda_${postoId}`, JSON.stringify(lista));
  } catch {}

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuidValido = (v?: string | null): v is string => Boolean(v && UUID_REGEX.test(v));

  try {
    await supabase.from("rondas_execucoes" as any).insert({
      id: novoCiclo.id,
      posto_id: novoCiclo.posto_id,
      vigilante_id: isUuidValido(novoCiclo.vigilante_id) ? novoCiclo.vigilante_id : null,
      turno_id: isUuidValido(novoCiclo.turno_id) ? novoCiclo.turno_id : null,
      ciclo_numero: novoCiclo.ciclo_numero,
      data_inicio: novoCiclo.data_inicio,
      status: novoCiclo.status,
      checkpoints_executados: novoCiclo.checkpoints_executados,
    });
  } catch {
    /* Fallback local garantido */
  }

  return novoCiclo;
}

/**
 * Validação com Presença Física e GPS Absoluto de Alta Precisão.
 * Trava 1: Precisão do sensor GPS (rejeita accuracy > 25m).
 * Trava 2: Raio de captura físico do checkpoint.
 * Avaliação da janela de conformidade dinâmica com tolerância de ±3 minutos.
 */
export async function registrarCheckinGpsAbsoluto(
  cicloId: string,
  checkpointId: string,
  latitude: number,
  longitude: number,
  precisaoGpsMetros: number,
): Promise<{
  sucesso: boolean;
  mensagem: string;
  status?: StatusCheckinRonda;
  distanciaAferidaMetros?: number;
  precisaoGpsMetros?: number;
  cicloAtualizado?: CicloRondaExecucao;
}> {
  // TRAVA DE PRECISÃO ABSOLUTA DO SENSOR GNSS
  if (!precisaoGpsMetros || precisaoGpsMetros > 25) {
    return {
      sucesso: false,
      mensagem: `Precisão do GPS insuficiente (±${Math.round(precisaoGpsMetros || 99)}m). Aproxime-se de área a céu aberto para fixação precisa por satélite (tolerância máxima: ±25m).`,
      precisaoGpsMetros: Math.round(precisaoGpsMetros || 99),
    };
  }

  // Localiza o ciclo ativo
  let ciclo: CicloRondaExecucao | null = null;
  let postoId = "";

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("gd_ciclos_ronda_")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const lista: CicloRondaExecucao[] = JSON.parse(raw);
          const c = lista.find((item) => item.id === cicloId);
          if (c) {
            ciclo = c;
            postoId = c.posto_id;
            break;
          }
        }
      }
    }
  } catch {}

  if (!ciclo) {
    return { sucesso: false, mensagem: "Ciclo de ronda não localizado ou expirado." };
  }

  const checkpointsPosto = await carregarCheckpoints(postoId);
  const cpCadastro = checkpointsPosto.find((c) => c.id === checkpointId);
  if (!cpCadastro) {
    return { sucesso: false, mensagem: "Checkpoint não cadastrado no posto." };
  }

  const cpExecIndex = ciclo.checkpoints_executados.findIndex(
    (c) => c.checkpoint_id === checkpointId && c.status === "pendente",
  );

  if (cpExecIndex < 0) {
    return { sucesso: false, mensagem: "Este ponto já foi registrado ou não está pendente." };
  }

  // TRAVA GEODÉSICA DE PRESENÇA FÍSICA NO PONTO (HAVERSINE)
  const distanciaMetros = calcularDistanciaMetros(
    latitude,
    longitude,
    cpCadastro.latitude,
    cpCadastro.longitude,
  );

  const raioPermitido = cpCadastro.raio_captura_metros ?? 15;
  // Margem física: raio cadastrado + tolerância do sensor (máximo de 25m total)
  const raioEfetivoMaximo = Math.max(raioPermitido, Math.min(25, precisaoGpsMetros + 5));

  if (distanciaMetros > raioEfetivoMaximo) {
    return {
      sucesso: false,
      mensagem: `Você está a ${Math.round(distanciaMetros)}m do ponto "${cpCadastro.nome}". Desloque-se até o local físico do checkpoint (raio permitido: ${raioPermitido}m).`,
      distanciaAferidaMetros: Math.round(distanciaMetros),
      precisaoGpsMetros: Math.round(precisaoGpsMetros),
    };
  }

  // AVALIAÇÃO DA JANELA DE CONFORMIDADE COM TOLERÂNCIA DE ±3 MINUTOS
  const agora = new Date();
  const cpExec = ciclo.checkpoints_executados[cpExecIndex];
  const horaPrevista = new Date(cpExec.hora_prevista);
  const diferencaMinutos = (agora.getTime() - horaPrevista.getTime()) / 60000;
  const tolerancia = cpCadastro.tolerancia_minutos ?? 3;

  let statusCalculado: StatusCheckinRonda = "conforme";
  if (diferencaMinutos > tolerancia) {
    statusCalculado = "atrasado";
  } else if (diferencaMinutos < -tolerancia) {
    statusCalculado = "adiantado";
  }

  // Registra a passagem física auditada
  ciclo.checkpoints_executados[cpExecIndex] = {
    ...cpExec,
    hora_realizada: agora.toISOString(),
    latitude_aferida: latitude,
    longitude_aferida: longitude,
    precisao_gps_metros: Math.round(precisaoGpsMetros),
    distancia_aferida_metros: Math.round(distanciaMetros),
    status: statusCalculado,
  };

  // INÍCIO DINÂMICO PARA OS PONTOS SUBSEQUENTES
  // Recalcula o horário previsto dos próximos pontos pendentes a partir deste instante de check-in
  let acumuladorMinutos = 0;
  for (let j = cpExecIndex + 1; j < ciclo.checkpoints_executados.length; j++) {
    const cpPendente = ciclo.checkpoints_executados[j];
    const cpRef = checkpointsPosto.find((c) => c.id === cpPendente.checkpoint_id);
    acumuladorMinutos += cpRef?.tempo_deslocamento_minutos ?? 5;
    cpPendente.hora_prevista = new Date(agora.getTime() + acumuladorMinutos * 60000).toISOString();
  }

  // Verifica se todos os pontos do ciclo foram concluídos
  const restamPendentes = ciclo.checkpoints_executados.some((c) => c.status === "pendente");
  if (!restamPendentes) {
    ciclo.status = "concluido";
    ciclo.data_fim = agora.toISOString();
  }
  ciclo.updated_at = agora.toISOString();

  // Persiste atualização no localStorage
  try {
    const raw = localStorage.getItem(`gd_ciclos_ronda_${postoId}`);
    if (raw) {
      const lista: CicloRondaExecucao[] = JSON.parse(raw);
      const idx = lista.findIndex((c) => c.id === ciclo!.id);
      if (idx >= 0) {
        lista[idx] = ciclo;
        localStorage.setItem(`gd_ciclos_ronda_${postoId}`, JSON.stringify(lista));
      }
    }
  } catch {}

  try {
    await supabase
      .from("rondas_execucoes" as any)
      .update({
        status: ciclo.status,
        data_fim: ciclo.data_fim || null,
        checkpoints_executados: ciclo.checkpoints_executados,
        updated_at: ciclo.updated_at,
      })
      .eq("id", ciclo.id);
  } catch {}

  const statusMsg =
    statusCalculado === "conforme"
      ? "Presença validada no horário com GPS absoluto!"
      : statusCalculado === "atrasado"
        ? `Presença registrada com atraso (+${Math.round(diferencaMinutos)}min além da janela tolerada).`
        : `Presença registrada com antecedência (${Math.round(Math.abs(diferencaMinutos))}min antes).`;

  return {
    sucesso: true,
    mensagem: `Ponto "${cpCadastro.nome}" registrado com sucesso! ${statusMsg}`,
    status: statusCalculado,
    distanciaAferidaMetros: Math.round(distanciaMetros),
    precisaoGpsMetros: Math.round(precisaoGpsMetros),
    cicloAtualizado: ciclo,
  };
}

/**
 * Carrega o ciclo ativo de ronda para um posto
 */
export async function carregarCicloAtivo(
  postoId: string,
  vigilanteId?: string,
): Promise<CicloRondaExecucao | null> {
  try {
    const raw = localStorage.getItem(`gd_ciclos_ronda_${postoId}`);
    if (raw) {
      const lista: CicloRondaExecucao[] = JSON.parse(raw);
      const ativo = lista.find(
        (c) => c.status === "em_andamento" && (!vigilanteId || c.vigilante_id === vigilanteId),
      );
      if (ativo) return ativo;
    }
  } catch {}

  try {
    let query = supabase
      .from("rondas_execucoes" as any)
      .select("*")
      .eq("posto_id", postoId)
      .eq("status", "em_andamento")
      .order("created_at", { ascending: false })
      .limit(1);

    if (
      vigilanteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vigilanteId)
    ) {
      query = query.eq("vigilante_id", vigilanteId);
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return data as unknown as CicloRondaExecucao;
    }
  } catch {}

  return null;
}

/**
 * Busca escalas agendadas ou ativas de um vigilante
 */
export async function carregarEscalasDoVigilante(
  vigilanteId: string,
  data?: string,
): Promise<TurnoVigilancia[]> {
  try {
    const todosTurnos = await carregarTurnos();
    return todosTurnos.filter(
      (t) => t.vigilante_id === vigilanteId && (!data || t.data_turno === data),
    );
  } catch {
    return [];
  }
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

let turnosTabelaAusente = false;

/**
 * Busca turnos ativos ou agendados
 */
export async function carregarTurnos(): Promise<TurnoVigilancia[]> {
  if (!turnosTabelaAusente) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;

      if (token) {
        const res = await fetch("/api/vigilantes/turnos", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json?.tabelaAusente) {
            turnosTabelaAusente = true;
          } else if (json?.success && Array.isArray(json.dados) && json.dados.length > 0) {
            return json.dados as TurnoVigilancia[];
          }
        }
        if (res.status !== 404) {
          // Não recai para o REST direto do Supabase se o Worker já respondeu
          const raw = localStorage.getItem("gd_turnos_vigilancia");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
          return [];
        }
      }

      const { data, error, status } = await supabase
        .from("turnos_vigilancia")
        .select("*, vigilante:vigilantes(*), posto:postos_vigilancia(*)")
        .order("data_turno", { ascending: false })
        .order("hora_inicio", { ascending: false });
      if (!error && data && data.length > 0) {
        return data as TurnoVigilancia[];
      }
      if (
        error &&
        (status === 404 ||
          error.code === "PGRST205" ||
          error.code === "42P01" ||
          error.message?.includes("Could not find the table") ||
          error.message?.includes("does not exist"))
      ) {
        turnosTabelaAusente = true;
      }
    } catch {
      /* ignore */
    }
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
        id: gerarId(),
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
    const dentroRaio = dist <= (cp.raio_captura_metros ?? 5);

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

/**
 * Calcula a menor distância em metros de um ponto (lat, lng) até o segmento de reta entre ponto A e ponto B
 */
export function calcularMenorDistanciaAteSegmentoMetros(
  pontoLat: number,
  pontoLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dx = bLng - aLng;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return calcularDistanciaMetros(pontoLat, pontoLng, aLat, aLng);
  }

  // Projeção escalar t limitada a [0, 1]
  const t = Math.max(0, Math.min(1, ((pontoLng - aLng) * dx + (pontoLat - aLat) * dy) / lenSq));

  const projLat = aLat + t * dy;
  const projLng = aLng + t * dx;

  return calcularDistanciaMetros(pontoLat, pontoLng, projLat, projLng);
}

/**
 * Avalia se o vigilante está desviado da rota estipulada de ronda ou fora do perímetro
 * Tolerância padrão de afastamento do trajeto da rota: 45 metros.
 */
export function verificarDesvioRotaVigilante(
  posicao: { latitude: number; longitude: number },
  posto: PostoVigilancia,
  checkpoints: RondaCheckpoint[],
  toleranciaAfastamentoMetros: number = 45,
): { emDesvio: boolean; motivo: string; distanciaMetros: number } {
  if (!posicao.latitude || !posicao.longitude) {
    return { emDesvio: false, motivo: "Sem coordenadas válidas", distanciaMetros: 0 };
  }

  // 1. Verificação de Perímetro da Propriedade / Posto
  if (posto.perimetro_poligono?.coordinates && posto.perimetro_poligono.coordinates.length >= 3) {
    const dentroPoligono = pontoDentroDoPoligono(
      [posicao.latitude, posicao.longitude],
      posto.perimetro_poligono.coordinates,
    );
    if (!dentroPoligono) {
      const distCentro = calcularDistanciaMetros(
        posicao.latitude,
        posicao.longitude,
        posto.latitude,
        posto.longitude,
      );
      return {
        emDesvio: true,
        motivo: `Vigilante fora do perímetro delimitado da propriedade (${Math.round(distCentro)}m do centro)`,
        distanciaMetros: Math.round(distCentro),
      };
    }
  } else if (posto.latitude && posto.longitude) {
    const distPosto = calcularDistanciaMetros(
      posicao.latitude,
      posicao.longitude,
      posto.latitude,
      posto.longitude,
    );
    const raioMax = (posto.raio_metros || 100) + 25;
    if (distPosto > raioMax) {
      return {
        emDesvio: true,
        motivo: `Vigilante fora do raio do posto (${Math.round(distPosto)}m, limite: ${raioMax}m)`,
        distanciaMetros: Math.round(distPosto),
      };
    }
  }

  // 2. Verificação de Afastamento da Rota entre Checkpoints
  if (checkpoints && checkpoints.length >= 2) {
    const pontosOrdenados = [...checkpoints].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    let menorDistanciaRota = Infinity;

    for (let i = 0; i < pontosOrdenados.length; i++) {
      const p1 = pontosOrdenados[i];
      const p2 = pontosOrdenados[(i + 1) % pontosOrdenados.length];
      const distSegmento = calcularMenorDistanciaAteSegmentoMetros(
        posicao.latitude,
        posicao.longitude,
        p1.latitude,
        p1.longitude,
        p2.latitude,
        p2.longitude,
      );
      if (distSegmento < menorDistanciaRota) {
        menorDistanciaRota = distSegmento;
      }
    }

    if (menorDistanciaRota > toleranciaAfastamentoMetros) {
      return {
        emDesvio: true,
        motivo: `Afastamento de ${Math.round(menorDistanciaRota)}m do trajeto estipulado da rota (tolerância: ${toleranciaAfastamentoMetros}m)`,
        distanciaMetros: Math.round(menorDistanciaRota),
      };
    }

    return {
      emDesvio: false,
      motivo: "Vigilante no trajeto correto da rota",
      distanciaMetros: Math.round(menorDistanciaRota),
    };
  }

  return { emDesvio: false, motivo: "Dentro da área do posto", distanciaMetros: 0 };
}

/**
 * Verifica se o próximo checkpoint do ciclo de ronda está com horário estipulado atrasado (+3 min)
 */
export function verificarAtrasoProximoPonto(
  postoId: string,
  ciclo: CicloRondaExecucao,
  checkpoints: RondaCheckpoint[],
  agora: Date = new Date(),
): {
  atrasado: boolean;
  checkpoint?: RondaCheckpoint;
  atrasoMinutos: number;
  horaPrevista?: string;
  mensagem?: string;
} {
  if (!ciclo || ciclo.status !== "em_andamento" || !ciclo.checkpoints_executados) {
    return { atrasado: false, atrasoMinutos: 0 };
  }

  const execPendente = ciclo.checkpoints_executados.find((c) => c.status === "pendente");
  if (!execPendente || !execPendente.hora_prevista) {
    return { atrasado: false, atrasoMinutos: 0 };
  }

  const cpRef = checkpoints.find((c) => c.id === execPendente.checkpoint_id);
  const horaPrev = new Date(execPendente.hora_prevista);
  const diffMinutos = (agora.getTime() - horaPrev.getTime()) / 60000;
  const tolerancia = cpRef?.tolerancia_minutos ?? 3;

  if (diffMinutos > tolerancia) {
    const atraso = Math.round(diffMinutos);
    const nomePonto = cpRef?.nome || "Próximo Ponto";
    const horaFmt = horaPrev.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return {
      atrasado: true,
      checkpoint: cpRef,
      atrasoMinutos: atraso,
      horaPrevista: execPendente.hora_prevista,
      mensagem: `Ponto de ronda não atingido no tempo estipulado! "${nomePonto}" deveria ter sido alcançado às ${horaFmt} (${atraso} min além da margem de ±${tolerancia} min).`,
    };
  }

  return {
    atrasado: false,
    checkpoint: cpRef,
    atrasoMinutos: 0,
    horaPrevista: execPendente.hora_prevista,
  };
}

// Cache em memória para anti-spam de alertas (90s)
const ultimosAlertasDisparados = new Map<string, number>();

/**
 * Transmite a posição ao vivo do vigilante para a Central de Monitoramento via Realtime e Broadcast
 */
export async function transmitirPosicaoVigilanteAoVivo(
  dados: TransmissaoPosicaoVigilante,
): Promise<void> {
  const payload = {
    ...dados,
    timestamp: dados.timestamp || new Date().toISOString(),
  };

  // 1. Grava no cache de localStorage
  try {
    localStorage.setItem(`gd_posicao_live_${dados.postoId}`, JSON.stringify(payload));
    localStorage.setItem("gd_ultima_posicao_vigilante_global", JSON.stringify(payload));
  } catch {}

  // 2. Dispara evento local no navegador (para tabs e janelas locais responderem em 0ms)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hunter:posicao_vigilante_live", { detail: payload }));
  }

  // 3. Broadcast no canal Realtime dedicado do posto
  try {
    const canal = supabase.channel(`hunter_ronda_live_${dados.postoId}`);
    await canal.send({
      type: "broadcast",
      event: "posicao_vigilante",
      payload,
    });
  } catch {}
}

/**
 * Registra e despacha alerta de ronda tática (desvio de rota ou atraso em checkpoint)
 */
export async function dispararAlertaRonda(dados: {
  postoId: string;
  postoNome?: string;
  vigilanteId?: string;
  vigilanteNome?: string;
  tipo: "desvio_rota_vigilante" | "ausencia_checkpoint_vigilante";
  gravidade?: "alta" | "critica";
  latitude: number;
  longitude: number;
  detalhes: string;
}): Promise<boolean> {
  const chaveSpam = `${dados.postoId}_${dados.tipo}`;
  const agoraMs = Date.now();
  const ultimoDisparo = ultimosAlertasDisparados.get(chaveSpam);

  // Anti-Spam: evita disparar o mesmo alerta com intervalo menor que 90 segundos
  if (ultimoDisparo && agoraMs - ultimoDisparo < 90000) {
    return false;
  }
  ultimosAlertasDisparados.set(chaveSpam, agoraMs);

  const alertaObj: AlertaRondaVigilante = {
    id: gerarId(),
    postoId: dados.postoId,
    postoNome: dados.postoNome,
    vigilanteId: dados.vigilanteId || "vigilante-plantonista",
    vigilanteNome: dados.vigilanteNome,
    tipo: dados.tipo,
    gravidade: dados.gravidade || "alta",
    latitude: dados.latitude,
    longitude: dados.longitude,
    detalhes: dados.detalhes,
    created_at: new Date().toISOString(),
    reconhecido: false,
  };

  // 1. Salva em localStorage de alertas de ronda
  try {
    const raw = localStorage.getItem(`gd_alertas_ronda_${dados.postoId}`);
    const lista: AlertaRondaVigilante[] = raw ? JSON.parse(raw) : [];
    lista.unshift(alertaObj);
    localStorage.setItem(`gd_alertas_ronda_${dados.postoId}`, JSON.stringify(lista.slice(0, 50)));
  } catch {}

  // 2. Dispara evento local para notificação imediata
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hunter:alerta_ronda", { detail: alertaObj }));
  }

  // 3. Tenta salvar na tabela canônica alertas_seguranca do Supabase
  try {
    await supabase.from("alertas_seguranca").insert({
      veiculo_id: dados.postoId,
      cliente_id: "cliente-gd-seguranca",
      tipo: dados.tipo,
      gravidade: dados.gravidade || "alta",
      latitude: dados.latitude,
      longitude: dados.longitude,
      velocidade: 0,
      vibracao_g: 0,
      inclinacao_graus: 0,
      detalhes: dados.detalhes,
      reconhecido: false,
    });
  } catch {}

  // 4. Envia broadcast no canal de ronda ao vivo
  try {
    const canal = supabase.channel(`hunter_ronda_live_${dados.postoId}`);
    await canal.send({
      type: "broadcast",
      event: "novo_alerta_ronda",
      payload: alertaObj,
    });
  } catch {}

  return true;
}
