import { supabase } from "@/integrations/supabase/client";

export interface AreaSegura {
  id: string;
  veiculo_id: string | null;
  cliente_id: string | null;
  nome: string;
  tipo: "casa" | "trabalho" | "condominio" | "estacionamento" | "escola" | "oficina" | "outro";
  latitude: number;
  longitude: number;
  raio_metros: number;
  poligono_geojson?: any;
  regra_entrada: "permitida" | "alertar" | "fora_horario";
  regra_saida: "permitida" | "alertar" | "fora_horario";
  hora_inicio?: string | null; // "00:00:00"
  hora_fim?: string | null; // "05:30:00"
  dias_semana?: number[]; // [0,1,2,3,4,5,6]
  tolerancia_metros: number;
  ativo: boolean;
  created_at?: string;
}

export interface HorarioUtilizacao {
  id: string;
  veiculo_id: string;
  cliente_id: string | null;
  dias_semana: number[]; // 0=domingo, 1=segunda...
  hora_inicio: string; // "06:00"
  hora_fim: string; // "22:00"
  permitir_fim_de_semana: boolean;
  ativo: boolean;
  created_at?: string;
}

import {
  type CanaisAlertas,
  CANAIS_ALERTAS_PADRAO,
  CANAL_ALERTAS_CONFIG_REALTIME,
  PREFERENCIAS_PADRAO,
  salvarPreferenciasNotificacao,
  type CanalItemConfig,
  type ContatoAlertaWhatsapp,
  type PreferenciasNotificacao,
} from "./notificacoesService";
import {
  ALERTAS_CONTA_OPERACIONAL_CATALOGO,
  ALERTAS_VEICULO_CATALOGO,
  normalizarTelefoneDigitosBR,
  type CanalAlertaItemPreferencia,
} from "../constants/alertasCatalogo";

export type { ContatoAlertaWhatsapp, CanaisAlertas, CanalAlertaItemPreferencia };

export interface RegrasVeiculo {
  id?: string;
  veiculo_id: string;
  cliente_id?: string | null;
  limite_velocidade_geral: number;
  tolerancia_excesso_segundos: number;
  alerta_movimento_nao_autorizado: boolean;
  alerta_ignicao_fora_horario: boolean;
  alerta_baixa_tensao_v: number;
  minutos_limite_sem_comunicacao: number;
  alertas_ativos?: Record<string, boolean>;
  canais_alertas?: CanaisAlertas;
  whatsapp_destinatarios?: ContatoAlertaWhatsapp[];
}

/**
 * Distância Haversine em metros entre dois pontos de latitude/longitude
 */
export function calcularDistanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Raio da Terra em metros
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

/**
 * Algoritmo Ray-Casting clássico (ponto em polígono)
 */
export function pontoDentroDoPoligono(
  ponto: [number, number], // [lat, lng]
  poligono: [number, number][], // [[lat, lng], ...]
): boolean {
  if (!poligono || poligono.length < 3) return false;
  const [x, y] = ponto;
  let inside = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const xi = poligono[i][0];
    const yi = poligono[i][1];
    const xj = poligono[j][0];
    const yj = poligono[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calcula o centroide (média de lat e lon) de um polígono
 */
export function calcularCentroidePoligono(pontos: [number, number][]): {
  latitude: number;
  longitude: number;
  raioAproximadoMetros: number;
} {
  if (!pontos || pontos.length === 0) {
    return { latitude: 0, longitude: 0, raioAproximadoMetros: 100 };
  }
  let sumLat = 0;
  let sumLon = 0;
  for (const [lat, lon] of pontos) {
    sumLat += lat;
    sumLon += lon;
  }
  const centroLat = sumLat / pontos.length;
  const centroLon = sumLon / pontos.length;

  let maxDist = 0;
  for (const [lat, lon] of pontos) {
    const d = calcularDistanciaMetros(centroLat, centroLon, lat, lon);
    if (d > maxDist) maxDist = d;
  }

  return {
    latitude: centroLat,
    longitude: centroLon,
    raioAproximadoMetros: Math.max(50, Math.round(maxDist)),
  };
}

/**
 * Verifica se um ponto geográfico está dentro do perímetro da área segura
 * considerando polígono (se configurado) ou raio e margem de tolerância.
 */
export function verificarPontoNaAreaSegura(
  lat: number,
  lon: number,
  area: {
    latitude: number;
    longitude: number;
    raio_metros: number;
    tolerancia_metros?: number;
    poligono_geojson?: any;
  },
): { dentro: boolean; distanciaMetros: number } {
  // Se a área possuir polígono estruturado
  if (
    area.poligono_geojson &&
    Array.isArray(area.poligono_geojson.coordinates) &&
    area.poligono_geojson.coordinates.length >= 3
  ) {
    const coords = area.poligono_geojson.coordinates as [number, number][];
    const dentroPoligono = pontoDentroDoPoligono([lat, lon], coords);
    const distCentro = calcularDistanciaMetros(lat, lon, area.latitude, area.longitude);
    return { dentro: dentroPoligono, distanciaMetros: Math.round(distCentro) };
  }

  const dist = calcularDistanciaMetros(lat, lon, area.latitude, area.longitude);
  const margem = area.tolerancia_metros || 0;
  const dentro = dist <= area.raio_metros + margem;
  return { dentro, distanciaMetros: Math.round(dist) };
}

/**
 * Avalia se o horário e dia atual estão dentro da janela de utilização esperada
 */
export function verificarHorarioPermitido(
  horarios: HorarioUtilizacao[],
  dataReferencia = new Date(),
): { permitido: boolean; motivo?: string } {
  if (!horarios || horarios.length === 0) {
    return { permitido: true }; // Sem restrição cadastrada
  }

  const regraAtiva = horarios.find((h) => h.ativo);
  if (!regraAtiva) return { permitido: true };

  const diaSemana = dataReferencia.getDay(); // 0 a 6
  const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;

  if (ehFimDeSemana && !regraAtiva.permitir_fim_de_semana) {
    return {
      permitido: false,
      motivo: "Uso fora do padrão: veículo utilizado no fim de semana sem autorização configurada.",
    };
  }

  if (!regraAtiva.dias_semana.includes(diaSemana)) {
    return {
      permitido: false,
      motivo: `Uso fora do padrão: utilização em dia da semana não previsto na configuração.`,
    };
  }

  // Compara horários
  const horaMin = `${String(dataReferencia.getHours()).padStart(2, "0")}:${String(
    dataReferencia.getMinutes(),
  ).padStart(2, "0")}`;

  const inicio = regraAtiva.hora_inicio.slice(0, 5);
  const fim = regraAtiva.hora_fim.slice(0, 5);

  if (horaMin < inicio || horaMin > fim) {
    return {
      permitido: false,
      motivo: `Ignição ou movimento fora do horário configurado (${inicio} às ${fim}).`,
    };
  }

  return { permitido: true };
}

/**
 * Busca áreas seguras cadastradas para o veículo
 */
export async function carregarAreasSeguras(veiculoId: string): Promise<AreaSegura[]> {
  try {
    const { data, error } = await supabase
      .from("areas_seguras")
      .select("*")
      .or(`veiculo_id.eq.${veiculoId},veiculo_id.is.null`)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as AreaSegura[];
  } catch (err) {
    console.warn("Erro ao carregar áreas seguras:", err);
    return [];
  }
}

/**
 * Salva ou atualiza uma área segura
 */
export async function salvarAreaSegura(area: Partial<AreaSegura>): Promise<AreaSegura | null> {
  try {
    if (area.id) {
      const { data, error } = await supabase
        .from("areas_seguras")
        .update({
          nome: area.nome,
          tipo: area.tipo,
          latitude: area.latitude,
          longitude: area.longitude,
          raio_metros: area.raio_metros,
          poligono_geojson: area.poligono_geojson || null,
          regra_entrada: area.regra_entrada,
          regra_saida: area.regra_saida,
          hora_inicio: area.hora_inicio,
          hora_fim: area.hora_fim,
          dias_semana: area.dias_semana,
          tolerancia_metros: area.tolerancia_metros,
          ativo: area.ativo ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", area.id)
        .select()
        .single();

      if (error) throw error;
      return data as AreaSegura;
    } else {
      const { data, error } = await supabase
        .from("areas_seguras")
        .insert({
          veiculo_id: area.veiculo_id || null,
          cliente_id: area.cliente_id || null,
          nome: area.nome!,
          tipo: area.tipo || "outro",
          latitude: area.latitude!,
          longitude: area.longitude!,
          raio_metros: area.raio_metros || 100,
          poligono_geojson: area.poligono_geojson || null,
          regra_entrada: area.regra_entrada || "permitida",
          regra_saida: area.regra_saida || "permitida",
          hora_inicio: area.hora_inicio || null,
          hora_fim: area.hora_fim || null,
          dias_semana: area.dias_semana || [0, 1, 2, 3, 4, 5, 6],
          tolerancia_metros: area.tolerancia_metros || 50,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AreaSegura;
    }
  } catch (err) {
    console.error("Erro ao salvar área segura:", err);
    return null;
  }
}

/**
 * Remove uma área segura
 */
export async function excluirAreaSegura(areaId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("areas_seguras").delete().eq("id", areaId);
    return !error;
  } catch (err) {
    console.error("Erro ao excluir área segura:", err);
    return false;
  }
}

/**
 * Busca regra de horário de utilização do veículo
 */
export async function carregarHorarioUtilizacao(
  veiculoId: string,
): Promise<HorarioUtilizacao | null> {
  try {
    const { data, error } = await supabase
      .from("horarios_utilizacao")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .maybeSingle();

    if (error || !data) return null;
    return data as HorarioUtilizacao;
  } catch {
    return null;
  }
}

/**
 * Salva ou atualiza regra de horário de utilização
 */
export async function salvarHorarioUtilizacao(
  horario: Partial<HorarioUtilizacao> & { veiculo_id: string },
): Promise<boolean> {
  try {
    if (horario.id) {
      const { error } = await supabase
        .from("horarios_utilizacao")
        .update({
          dias_semana: horario.dias_semana || [1, 2, 3, 4, 5],
          hora_inicio: horario.hora_inicio || "06:00:00",
          hora_fim: horario.hora_fim || "22:00:00",
          permitir_fim_de_semana: !!horario.permitir_fim_de_semana,
          ativo: horario.ativo ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", horario.id);

      return !error;
    } else {
      const { error } = await supabase.from("horarios_utilizacao").insert({
        veiculo_id: horario.veiculo_id,
        cliente_id: horario.cliente_id || null,
        dias_semana: horario.dias_semana || [1, 2, 3, 4, 5],
        hora_inicio: horario.hora_inicio || "06:00:00",
        hora_fim: horario.hora_fim || "22:00:00",
        permitir_fim_de_semana: !!horario.permitir_fim_de_semana,
        ativo: true,
      });

      return !error;
    }
  } catch {
    return false;
  }
}

/**
 * Carrega regras e parâmetros gerais do veículo
 */
export async function carregarRegrasVeiculo(veiculoId: string): Promise<RegrasVeiculo> {
  const padrao: RegrasVeiculo = {
    veiculo_id: veiculoId,
    limite_velocidade_geral: 110,
    tolerancia_excesso_segundos: 15,
    alerta_movimento_nao_autorizado: true,
    alerta_ignicao_fora_horario: true,
    alerta_baixa_tensao_v: 11.5,
    minutos_limite_sem_comunicacao: 30,
    canais_alertas: CANAIS_ALERTAS_PADRAO,
    whatsapp_destinatarios: [],
  };

  try {
    const { data, error } = await supabase
      .from("regras_veiculo")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .maybeSingle();

    if (error || !data) return padrao;

    const ativos = (data.alertas_ativos as any) || {};
    const canais = data.canais_alertas || ativos.canais_alertas || CANAIS_ALERTAS_PADRAO;
    const destinatarios = data.whatsapp_destinatarios || ativos.whatsapp_destinatarios || [];

    return {
      ...padrao,
      ...data,
      canais_alertas: {
        app: canais.app !== undefined ? Boolean(canais.app) : true,
        whatsapp: canais.whatsapp !== undefined ? Boolean(canais.whatsapp) : true,
        ligacao: canais.ligacao !== undefined ? Boolean(canais.ligacao) : false,
        ...(canais.por_alerta ? { por_alerta: canais.por_alerta } : {}),
      },
      whatsapp_destinatarios: Array.isArray(destinatarios) ? destinatarios : [],
    };
  } catch {
    return padrao;
  }
}

/**
 * Salva regras e parâmetros gerais do veículo de forma persistente
 */
export async function salvarRegrasVeiculo(regras: RegrasVeiculo): Promise<boolean> {
  try {
    const payloadAtualizacao: Record<string, any> = {
      limite_velocidade_geral: regras.limite_velocidade_geral,
      tolerancia_excesso_segundos: regras.tolerancia_excesso_segundos,
      alerta_movimento_nao_autorizado: regras.alerta_movimento_nao_autorizado,
      alerta_ignicao_fora_horario: regras.alerta_ignicao_fora_horario,
      alerta_baixa_tensao_v: regras.alerta_baixa_tensao_v,
      minutos_limite_sem_comunicacao: regras.minutos_limite_sem_comunicacao,
      canais_alertas: regras.canais_alertas || CANAIS_ALERTAS_PADRAO,
      whatsapp_destinatarios: regras.whatsapp_destinatarios || [],
      updated_at: new Date().toISOString(),
    };

    if (regras.alertas_ativos) {
      payloadAtualizacao.alertas_ativos = {
        ...regras.alertas_ativos,
        canais_alertas: regras.canais_alertas || CANAIS_ALERTAS_PADRAO,
        whatsapp_destinatarios: regras.whatsapp_destinatarios || [],
      };
    }

    const { data: existente } = await supabase
      .from("regras_veiculo")
      .select("id")
      .eq("veiculo_id", regras.veiculo_id)
      .maybeSingle();

    let sucesso = false;
    if (existente?.id) {
      const { error } = await supabase
        .from("regras_veiculo")
        .update(payloadAtualizacao)
        .eq("id", existente.id);

      if (!error) {
        sucesso = true;
      } else {
        // Fallback Expand and Contract sem colunas adicionais
        const { error: errFallback } = await supabase
          .from("regras_veiculo")
          .update({
            limite_velocidade_geral: regras.limite_velocidade_geral,
            tolerancia_excesso_segundos: regras.tolerancia_excesso_segundos,
            alerta_movimento_nao_autorizado: regras.alerta_movimento_nao_autorizado,
            alerta_ignicao_fora_horario: regras.alerta_ignicao_fora_horario,
            alerta_baixa_tensao_v: regras.alerta_baixa_tensao_v,
            minutos_limite_sem_comunicacao: regras.minutos_limite_sem_comunicacao,
            alertas_ativos: payloadAtualizacao.alertas_ativos || regras.alertas_ativos,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existente.id);
        sucesso = !errFallback;
      }
    } else {
      const { error } = await supabase.from("regras_veiculo").insert({
        veiculo_id: regras.veiculo_id,
        cliente_id: regras.cliente_id || null,
        ...payloadAtualizacao,
      });

      if (!error) {
        sucesso = true;
      } else {
        const { error: errFallback } = await supabase.from("regras_veiculo").insert({
          veiculo_id: regras.veiculo_id,
          cliente_id: regras.cliente_id || null,
          limite_velocidade_geral: regras.limite_velocidade_geral,
          tolerancia_excesso_segundos: regras.tolerancia_excesso_segundos,
          alerta_movimento_nao_autorizado: regras.alerta_movimento_nao_autorizado,
          alerta_ignicao_fora_horario: regras.alerta_ignicao_fora_horario,
          alerta_baixa_tensao_v: regras.alerta_baixa_tensao_v,
          minutos_limite_sem_comunicacao: regras.minutos_limite_sem_comunicacao,
          alertas_ativos: payloadAtualizacao.alertas_ativos || regras.alertas_ativos,
        });
        sucesso = !errFallback;
      }
    }

    if (sucesso && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("hunter_regras_veiculo_alteradas", {
          detail: { veiculoId: regras.veiculo_id, regras },
        }),
      );
    }

    return sucesso;
  } catch {
    return false;
  }
}

/**
 * Carrega a lista consolidada de contatos autorizados para alertas WhatsApp do veículo.
 * Padrão estrito: Celular do cliente titular ativo por padrão, motoristas listados e contatos extras preservados.
 */
export async function carregarContatosAlertaVeiculo(
  veiculoId: string,
  clienteId?: string | null,
  destinatariosSalvos?: ContatoAlertaWhatsapp[],
  supabaseClient?: any,
): Promise<ContatoAlertaWhatsapp[]> {
  const client = supabaseClient || supabase;
  const contatosMap = new Map<string, ContatoAlertaWhatsapp>();

  // 1. Indexa destinatários previamente salvos por telefone para preservar preferências
  const salvosPorTelefone = new Map<string, ContatoAlertaWhatsapp>();
  if (Array.isArray(destinatariosSalvos)) {
    for (const d of destinatariosSalvos) {
      if (d.telefone) {
        salvosPorTelefone.set(d.telefone.replace(/\D/g, ""), d);
      }
    }
  }

  // 2. Busca celular do cliente titular
  let clienteTelefone = "";
  let clienteNome = "Cliente Titular";
  let targetClienteId = clienteId;

  if (!targetClienteId && veiculoId) {
    try {
      const { data: v } = await client
        .from("veiculos")
        .select("cliente_id")
        .eq("id", veiculoId)
        .maybeSingle();
      if (v?.cliente_id) targetClienteId = v.cliente_id;
    } catch (err) {
      console.warn("Erro ao buscar cliente_id do veículo:", err);
    }
  }

  if (targetClienteId) {
    try {
      let cli: any = null;
      const resCli = await client
        .from("clientes")
        .select("id, nome_razao_social, telefone, contatos_alertas")
        .eq("id", targetClienteId)
        .maybeSingle();

      if (!resCli?.error && resCli?.data) {
        cli = resCli.data;
      } else if (resCli?.error) {
        const resCliFallback = await client
          .from("clientes")
          .select("id, nome_razao_social, telefone")
          .eq("id", targetClienteId)
          .maybeSingle();
        cli = resCliFallback?.data || null;
      }

      if (cli) {
        clienteNome = cli.nome_razao_social || cli.nome || "Cliente Titular";
        clienteTelefone = cli.telefone || "";
        if (Array.isArray(cli.contatos_alertas)) {
          for (const d of cli.contatos_alertas) {
            if (d?.tipo === "adicional" && d?.telefone) {
              const limpoExtra = d.telefone.replace(/\D/g, "");
              if (limpoExtra && !salvosPorTelefone.has(limpoExtra)) {
                salvosPorTelefone.set(limpoExtra, {
                  ...d,
                  ativo: Boolean(d.ativo),
                  padrao: false,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar dados do cliente titular:", err);
    }
  }

  // Insere cliente titular como contato padrão
  if (clienteTelefone) {
    const limpo = clienteTelefone.replace(/\D/g, "");
    const salvo = salvosPorTelefone.get(limpo);
    contatosMap.set(limpo, {
      id: `cli-${targetClienteId || "padrao"}`,
      nome: `${clienteNome} (Cliente Titular)`,
      telefone: clienteTelefone,
      tipo: "cliente",
      ativo: salvo ? salvo.ativo : true, // Padrão: ATIVO
      padrao: true,
    });
  }

  // 3. Busca motoristas vinculados ao cliente
  if (targetClienteId) {
    try {
      const { data: motoristas } = await client
        .from("motoristas")
        .select("id, nome, telefone")
        .eq("cliente_id", targetClienteId)
        .eq("ativo", true);

      for (const mot of motoristas || []) {
        if (!mot.telefone) continue;
        const limpoMot = mot.telefone.replace(/\D/g, "");
        if (contatosMap.has(limpoMot)) continue;

        const salvo = salvosPorTelefone.get(limpoMot);
        contatosMap.set(limpoMot, {
          id: `mot-${mot.id}`,
          nome: `${mot.nome} (Motorista)`,
          telefone: mot.telefone,
          tipo: "motorista",
          ativo: salvo ? salvo.ativo : false, // Motoristas iniciam desativados até o usuário habilitar
          padrao: false,
        });
      }
    } catch (err) {
      console.warn("Erro ao buscar motoristas do cliente:", err);
    }
  }

  // 4. Preserva contatos adicionais cadastrados manualmente (inclusive salvos no perfil da conta)
  for (const d of salvosPorTelefone.values()) {
    if (d.tipo !== "cliente" && d.tipo !== "motorista" && d.telefone) {
      const limpoAdic = d.telefone.replace(/\D/g, "");
      if (!contatosMap.has(limpoAdic)) {
        contatosMap.set(limpoAdic, {
          ...d,
          padrao: false,
        });
      }
    }
  }

  return Array.from(contatosMap.values());
}

export interface ConfigAlertasCliente {
  clienteId: string | null;
  userId: string | null;
  alertasOperacionais: Record<string, CanalAlertaItemPreferencia>;
  contatosAlertas: ContatoAlertaWhatsapp[];
  notificarNfPendente: boolean;
  canaisNotificacaoNf: { push: boolean; whatsapp: boolean; ligacao?: boolean };
}

export function obterAlertasOperacionaisPadrao(): Record<string, CanalAlertaItemPreferencia> {
  const mapa: Record<string, CanalAlertaItemPreferencia> = {};
  for (const item of ALERTAS_CONTA_OPERACIONAL_CATALOGO) {
    mapa[item.chave] = {
      ativo: item.padraoCanais.ativo ?? item.padraoAtivo,
      app: item.padraoCanais.app,
      whatsapp: item.padraoCanais.whatsapp,
      ligacao: Boolean(item.padraoCanais.ligacao),
    };
  }
  return mapa;
}

/**
 * Carrega o catálogo consolidado de telefones autorizados para alertas da conta
 * (Cliente titular ou gestor da conta, motoristas vinculados e números adicionais).
 */
export async function carregarContatosAlertasConta(
  clienteId?: string | null,
  userId?: string | null,
  contatosSalvos?: ContatoAlertaWhatsapp[],
  supabaseClient?: any,
): Promise<ContatoAlertaWhatsapp[]> {
  const client = supabaseClient || supabase;
  const contatosMap = new Map<string, ContatoAlertaWhatsapp>();
  const salvosPorTelefone = new Map<string, ContatoAlertaWhatsapp>();

  if (Array.isArray(contatosSalvos)) {
    for (const c of contatosSalvos) {
      const limpo = normalizarTelefoneDigitosBR(c?.telefone);
      if (limpo) salvosPorTelefone.set(limpo, c);
    }
  }

  let targetClienteId = clienteId || null;
  let cliData: any = null;

  if (!targetClienteId && userId) {
    try {
      const resCliUid = await client
        .from("clientes")
        .select("id, nome_razao_social, telefone, contatos_alertas")
        .eq("user_id", userId)
        .maybeSingle();
      if (!resCliUid?.error && resCliUid?.data) {
        cliData = resCliUid.data;
        targetClienteId = cliData.id;
      } else if (resCliUid?.error) {
        const fallbackUid = await client
          .from("clientes")
          .select("id, nome_razao_social, telefone")
          .eq("user_id", userId)
          .maybeSingle();
        if (fallbackUid?.data) {
          cliData = fallbackUid.data;
          targetClienteId = cliData.id;
        }
      }
    } catch {
      // fallback silencioso
    }
  } else if (targetClienteId) {
    try {
      const resCli = await client
        .from("clientes")
        .select("id, nome_razao_social, telefone, contatos_alertas")
        .eq("id", targetClienteId)
        .maybeSingle();
      if (!resCli?.error && resCli?.data) {
        cliData = resCli.data;
      } else if (resCli?.error) {
        const fallbackCli = await client
          .from("clientes")
          .select("id, nome_razao_social, telefone")
          .eq("id", targetClienteId)
          .maybeSingle();
        cliData = fallbackCli?.data || null;
      }
    } catch {
      // fallback silencioso
    }
  }

  if (Array.isArray(cliData?.contatos_alertas)) {
    for (const c of cliData.contatos_alertas) {
      const limpo = normalizarTelefoneDigitosBR(c?.telefone);
      if (limpo && !salvosPorTelefone.has(limpo)) {
        salvosPorTelefone.set(limpo, c);
      }
    }
  }

  if (cliData?.telefone) {
    const limpoCli = normalizarTelefoneDigitosBR(cliData.telefone);
    if (limpoCli) {
      const salvo = salvosPorTelefone.get(limpoCli);
      contatosMap.set(limpoCli, {
        id: `cli-${targetClienteId || "padrao"}`,
        nome: `${cliData.nome_razao_social || "Cliente Titular"} (Cliente Titular)`,
        telefone: cliData.telefone,
        tipo: "cliente",
        ativo: salvo ? salvo.ativo : true,
        padrao: true,
      });
    }
  } else if (userId) {
    try {
      const { data: prof } = await client
        .from("profiles")
        .select("id, nome, telefone")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.telefone) {
        const limpoProf = normalizarTelefoneDigitosBR(prof.telefone);
        if (limpoProf) {
          const salvo = salvosPorTelefone.get(limpoProf);
          contatosMap.set(limpoProf, {
            id: `cli-prof-${prof.id}`,
            nome: `${prof.nome || "Titular da Conta"} (Conta Principal)`,
            telefone: prof.telefone,
            tipo: "cliente",
            ativo: salvo ? salvo.ativo : true,
            padrao: true,
          });
        }
      }
    } catch {
      // fallback silencioso
    }
  }

  if (targetClienteId) {
    try {
      const { data: motoristas } = await client
        .from("motoristas")
        .select("id, nome, telefone")
        .eq("cliente_id", targetClienteId)
        .eq("ativo", true);

      for (const mot of motoristas || []) {
        if (!mot.telefone) continue;
        const limpoMot = normalizarTelefoneDigitosBR(mot.telefone);
        if (!limpoMot || contatosMap.has(limpoMot)) continue;
        const salvo = salvosPorTelefone.get(limpoMot);
        contatosMap.set(limpoMot, {
          id: `mot-${mot.id}`,
          nome: `${mot.nome} (Motorista)`,
          telefone: mot.telefone,
          tipo: "motorista",
          ativo: salvo ? salvo.ativo : false,
          padrao: false,
        });
      }
    } catch {
      // fallback silencioso
    }
  }

  for (const d of salvosPorTelefone.values()) {
    if (d.tipo !== "cliente" && d.tipo !== "motorista" && d.telefone) {
      const limpoAdic = normalizarTelefoneDigitosBR(d.telefone);
      if (limpoAdic && !contatosMap.has(limpoAdic)) {
        contatosMap.set(limpoAdic, {
          ...d,
          padrao: false,
        });
      }
    }
  }

  return Array.from(contatosMap.values());
}

/**
 * Carrega configurações dos 7 alertas de conta e operacionais do usuário/cliente.
 */
export async function carregarConfigAlertasCliente(
  clienteId?: string | null,
  userId?: string | null,
  supabaseClient?: any,
): Promise<ConfigAlertasCliente> {
  const client = supabaseClient || supabase;
  const padraoOps = obterAlertasOperacionaisPadrao();

  let targetClienteId = clienteId || null;
  let targetUserId = userId || null;
  let cliData: any = null;
  let userPrefsAtivos: any = null;

  try {
    if (targetClienteId) {
      const res = await client
        .from("clientes")
        .select(
          "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf, alertas_operacionais, contatos_alertas",
        )
        .eq("id", targetClienteId)
        .maybeSingle();

      if (!res?.error && res?.data) {
        cliData = res.data;
      } else if (res?.error) {
        const resFallback = await client
          .from("clientes")
          .select(
            "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf",
          )
          .eq("id", targetClienteId)
          .maybeSingle();
        cliData = resFallback?.data || null;
      }
    } else if (targetUserId) {
      const res = await client
        .from("clientes")
        .select(
          "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf, alertas_operacionais, contatos_alertas",
        )
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!res?.error && res?.data) {
        cliData = res.data;
        targetClienteId = res.data.id;
      } else if (res?.error) {
        const resFallback = await client
          .from("clientes")
          .select(
            "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf",
          )
          .eq("user_id", targetUserId)
          .maybeSingle();
        if (resFallback?.data) {
          cliData = resFallback.data;
          targetClienteId = resFallback.data.id;
        }
      }
    }

    if (cliData?.user_id && !targetUserId) {
      targetUserId = cliData.user_id;
    }

    if (targetUserId) {
      const { data: cfgUser } = await client
        .from("notificacoes_configuracoes")
        .select("alertas_ativos")
        .eq("user_id", targetUserId)
        .is("veiculo_id", null)
        .maybeSingle();
      if (cfgUser?.alertas_ativos) {
        userPrefsAtivos = cfgUser.alertas_ativos;
      }
    }
  } catch (err) {
    console.warn("[carregarConfigAlertasCliente] Aviso ao carregar preferências:", err);
  }

  const nfGeralAtivo = cliData?.notificar_nf_pendente !== false;
  const nfCanaisRaw = (cliData?.canais_notificacao_nf as any) || {
    push: true,
    whatsapp: true,
    ligacao: false,
  };

  const salvosOps =
    (cliData?.alertas_operacionais && Object.keys(cliData.alertas_operacionais).length > 0
      ? cliData.alertas_operacionais
      : null) ||
    userPrefsAtivos?.alertas_operacionais ||
    {};

  const alertasOperacionais: Record<string, CanalAlertaItemPreferencia> = { ...padraoOps };
  for (const item of ALERTAS_CONTA_OPERACIONAL_CATALOGO) {
    const salvoItem = salvosOps?.[item.chave];
    if (salvoItem) {
      const ativoItem =
        typeof salvoItem.ativo === "boolean"
          ? salvoItem.ativo
          : Boolean(salvoItem.app || salvoItem.whatsapp || salvoItem.ligacao);
      alertasOperacionais[item.chave] = {
        ...padraoOps[item.chave],
        ...salvoItem,
        ativo: ativoItem,
        app: ativoItem
          ? salvoItem.app !== undefined
            ? Boolean(salvoItem.app)
            : Boolean(padraoOps[item.chave]?.app ?? true)
          : false,
        whatsapp: ativoItem
          ? salvoItem.whatsapp !== undefined
            ? Boolean(salvoItem.whatsapp)
            : Boolean(padraoOps[item.chave]?.whatsapp ?? true)
          : false,
        ligacao: ativoItem
          ? salvoItem.ligacao !== undefined
            ? Boolean(salvoItem.ligacao)
            : Boolean(padraoOps[item.chave]?.ligacao ?? false)
          : false,
      };
    } else if (item.chave === "nf_pronta_download" || item.chave === "alerta_nf_expurgo") {
      const pAtivo = nfGeralAtivo && nfCanaisRaw.push !== false;
      const wAtivo = nfGeralAtivo && nfCanaisRaw.whatsapp !== false;
      const lAtivo = nfGeralAtivo && nfCanaisRaw.ligacao === true;
      const algoAtivo = pAtivo || wAtivo || lAtivo;
      alertasOperacionais[item.chave] = {
        ativo: algoAtivo,
        app: pAtivo,
        whatsapp: wAtivo,
        ligacao: lAtivo,
      };
    }
  }

  const contatosSalvos = Array.isArray(cliData?.contatos_alertas)
    ? cliData.contatos_alertas
    : Array.isArray(userPrefsAtivos?.contatos_alertas)
      ? userPrefsAtivos.contatos_alertas
      : [];

  const contatosAlertas = await carregarContatosAlertasConta(
    targetClienteId,
    targetUserId,
    contatosSalvos,
    client,
  );

  return {
    clienteId: targetClienteId,
    userId: targetUserId,
    alertasOperacionais,
    contatosAlertas,
    notificarNfPendente: nfGeralAtivo,
    canaisNotificacaoNf: {
      push: nfGeralAtivo && nfCanaisRaw.push !== false,
      whatsapp: nfGeralAtivo && nfCanaisRaw.whatsapp !== false,
      ligacao: nfGeralAtivo && nfCanaisRaw.ligacao === true,
    },
  };
}

/**
 * Persiste configurações de alertas operacionais/conta e lista de contatos em camada dupla:
 * 1. Tabela clientes (alertas_operacionais, contatos_alertas, notificar_nf_pendente e canais_notificacao_nf)
 * 2. Tabela notificacoes_configuracoes (fallback para usuários sem cliente vinculado ou pré-migration)
 * 3. Sincronização instantânea local e via Realtime Broadcast
 */
export async function salvarConfigAlertasCliente(params: {
  clienteId?: string | null;
  userId?: string | null;
  alertasOperacionais: Record<string, CanalAlertaItemPreferencia>;
  contatosAlertas: ContatoAlertaWhatsapp[];
  comCienciaExpurgoNf?: boolean;
}): Promise<boolean> {
  let sucesso = false;

  const nfPronta = params.alertasOperacionais?.nf_pronta_download;
  const nfExpurgo = params.alertasOperacionais?.alerta_nf_expurgo;
  const nfAtivo =
    Boolean(nfPronta?.ativo && (nfPronta.app || nfPronta.whatsapp || nfPronta.ligacao)) ||
    Boolean(nfExpurgo?.ativo && (nfExpurgo.app || nfExpurgo.whatsapp || nfExpurgo.ligacao));
  const nfPush =
    Boolean(nfPronta?.ativo && nfPronta.app) || Boolean(nfExpurgo?.ativo && nfExpurgo.app);
  const nfWhatsapp =
    Boolean(nfPronta?.ativo && nfPronta.whatsapp) ||
    Boolean(nfExpurgo?.ativo && nfExpurgo.whatsapp);
  const nfLigacao =
    Boolean(nfPronta?.ativo && nfPronta.ligacao) || Boolean(nfExpurgo?.ativo && nfExpurgo.ligacao);

  const canaisNfSync = {
    push: nfPush,
    whatsapp: nfWhatsapp,
    ligacao: nfLigacao,
  };

  try {
    if (params.clienteId) {
      let tentouFallbackDireto = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          "salvar_preferencias_alertas_cliente" as any,
          {
            p_cliente_id: params.clienteId,
            p_alertas_operacionais: params.alertasOperacionais,
            p_contatos_alertas: params.contatosAlertas,
            p_notificar_nf_pendente: nfAtivo,
            p_canais_notificacao_nf: canaisNfSync,
            p_ciencia_expurgo_sem_notificacao_nf: params.comCienciaExpurgoNf ? true : null,
          },
        );

        if (!rpcErr && (rpcRes as any)?.sucesso !== false) {
          sucesso = true;
        } else {
          const msgErr = `${rpcErr?.code || ""} ${rpcErr?.message || ""}`.toLowerCase();
          if (
            msgErr.includes("pgrst202") ||
            msgErr.includes("42883") ||
            msgErr.includes("could not find the function") ||
            msgErr.includes("function")
          ) {
            tentouFallbackDireto = true;
          }
        }
      } catch {
        tentouFallbackDireto = true;
      }

      if (!sucesso && tentouFallbackDireto) {
        const payloadCliente: Record<string, any> = {
          alertas_operacionais: params.alertasOperacionais,
          contatos_alertas: params.contatosAlertas,
          notificar_nf_pendente: nfAtivo,
          canais_notificacao_nf: canaisNfSync,
        };

        if (params.comCienciaExpurgoNf) {
          payloadCliente.ciencia_expurgo_sem_notificacao_nf = true;
          payloadCliente.ciencia_expurgo_em = new Date().toISOString();
        }

        const { error } = await supabase
          .from("clientes")
          .update(payloadCliente)
          .eq("id", params.clienteId);

        if (!error) {
          sucesso = true;
        } else {
          const payloadEssencial: Record<string, any> = {
            notificar_nf_pendente: nfAtivo,
            canais_notificacao_nf: canaisNfSync,
          };
          if (params.comCienciaExpurgoNf) {
            payloadEssencial.ciencia_expurgo_sem_notificacao_nf = true;
            payloadEssencial.ciencia_expurgo_em = new Date().toISOString();
          }
          const { error: errEssencial } = await supabase
            .from("clientes")
            .update(payloadEssencial)
            .eq("id", params.clienteId);
          if (!errEssencial) sucesso = true;
        }
      }
    }

    if (!params.clienteId && params.userId) {
      const { data: existente } = await supabase
        .from("notificacoes_configuracoes")
        .select("id, alertas_ativos")
        .eq("user_id", params.userId)
        .is("veiculo_id", null)
        .maybeSingle();

      const mergedAtivos = {
        ...((existente?.alertas_ativos as Record<string, any>) || {}),
        alertas_operacionais: params.alertasOperacionais,
        contatos_alertas: params.contatosAlertas,
      };

      if (existente?.id) {
        const { error: errU } = await supabase
          .from("notificacoes_configuracoes")
          .update({
            alertas_ativos: mergedAtivos,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existente.id);
        if (!errU) sucesso = true;
      } else {
        const { error: errI } = await supabase.from("notificacoes_configuracoes").insert({
          user_id: params.userId,
          veiculo_id: null,
          alertas_ativos: mergedAtivos,
        });
        if (!errI) sucesso = true;
      }
    }

    if (sucesso && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("hunter_configuracao_alertas_cliente_alterada", {
          detail: {
            clienteId: params.clienteId || null,
            userId: params.userId || null,
            alertasOperacionais: params.alertasOperacionais,
            contatosAlertas: params.contatosAlertas,
            notificarNfPendente: nfAtivo,
            canaisNotificacaoNf: canaisNfSync,
          },
        }),
      );

      try {
        const canal = supabase.channel(CANAL_ALERTAS_CONFIG_REALTIME);
        canal.send({
          type: "broadcast",
          event: "alertas_cliente_atualizados",
          payload: {
            clienteId: params.clienteId || null,
            userId: params.userId || null,
            alertasOperacionais: params.alertasOperacionais,
            contatosAlertas: params.contatosAlertas,
          },
        });
      } catch {
        // fallback silencioso
      }
    }

    return sucesso;
  } catch (err) {
    console.warn("[salvarConfigAlertasCliente] Erro ao salvar alertas da conta:", err);
    return false;
  }
}

/**
 * Lista os veículos vinculados ao cliente para aplicação em lote de alertas na frota.
 */
export async function carregarVeiculosFrotaCliente(
  clienteId?: string | null,
): Promise<Array<{ id: string; placa: string | null; cliente_id: string | null }>> {
  if (!clienteId) return [];
  try {
    const { data, error } = await supabase
      .from("veiculos")
      .select("id, placa, cliente_id")
      .eq("cliente_id", clienteId)
      .order("placa", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    return data.map((v: any) => ({
      id: String(v.id),
      placa: v.placa || null,
      cliente_id: v.cliente_id || null,
    }));
  } catch {
    return [];
  }
}

/**
 * Aplica em lote as configurações de alertas, canais e telefones para toda a frota informada,
 * preservando limites numéricos específicos de cada veículo (velocidade, tensão, tempo sem sinal).
 */
export async function aplicarConfigAlertasTodaFrota(params: {
  veiculos: Array<{ id: string; cliente_id?: string | null }>;
  userId: string;
  preferencias: PreferenciasNotificacao;
  destinatariosWhatsapp: ContatoAlertaWhatsapp[];
}): Promise<{ sucesso: boolean; atualizados: number }> {
  let atualizados = 0;

  for (const v of params.veiculos) {
    if (!v?.id) continue;
    try {
      const regraAtual = await carregarRegrasVeiculo(v.id);
      const prefsComCanais: PreferenciasNotificacao = {
        ...PREFERENCIAS_PADRAO,
        ...params.preferencias,
        whatsapp_destinatarios: params.destinatariosWhatsapp,
      };

      const salvouRegras = await salvarRegrasVeiculo({
        ...regraAtual,
        veiculo_id: v.id,
        cliente_id: v.cliente_id ?? regraAtual.cliente_id ?? null,
        alerta_movimento_nao_autorizado: Boolean(prefsComCanais.movimento_fora_horario),
        alerta_ignicao_fora_horario: Boolean(prefsComCanais.ignicao_fora_horario),
        alertas_ativos: {
          ...prefsComCanais,
          canais_por_alerta: prefsComCanais.canais_alertas?.por_alerta || {},
          canais_alertas: prefsComCanais.canais_alertas || CANAIS_ALERTAS_PADRAO,
          whatsapp_destinatarios: params.destinatariosWhatsapp,
        } as any,
        canais_alertas: prefsComCanais.canais_alertas || CANAIS_ALERTAS_PADRAO,
        whatsapp_destinatarios: params.destinatariosWhatsapp,
      });

      const salvouPrefs = await salvarPreferenciasNotificacao(params.userId, prefsComCanais, v.id);
      if (salvouRegras || salvouPrefs) {
        atualizados++;
      }
    } catch {
      // continua aplicação nos demais veículos da frota
    }
  }

  return { sucesso: atualizados > 0, atualizados };
}

/**
 * Escuta atualizações de alertas de conta e NF em tempo real entre abas e dispositivos.
 */
export function ouvirAtualizacoesAlertasCliente(
  callback: (dados: {
    clienteId?: string | null;
    userId?: string | null;
    alertasOperacionais?: Record<string, CanalAlertaItemPreferencia>;
    contatosAlertas?: ContatoAlertaWhatsapp[];
    notificarNfPendente?: boolean;
    canaisNotificacaoNf?: { push: boolean; whatsapp: boolean; ligacao?: boolean };
  }) => void,
): () => void {
  const handlerLocal = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail) callback(custom.detail);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("hunter_configuracao_alertas_cliente_alterada", handlerLocal);
  }

  const canal = supabase
    .channel(`hunter_alertas_conta_${Date.now()}`)
    .on("broadcast", { event: "alertas_cliente_atualizados" }, (payload: any) => {
      if (payload?.payload) callback(payload.payload);
    })
    .subscribe();

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hunter_configuracao_alertas_cliente_alterada", handlerLocal);
    }
    try {
      supabase.removeChannel(canal);
    } catch {
      // ignora
    }
  };
}

export const ALERTAS_EQUIPE_TECNICA_CHAVES = ALERTAS_VEICULO_CATALOGO.filter(
  (item) => !item.restritoEquipeTecnica,
).map((item) => item.chave);

export interface ConfigAlertasEquipe {
  userId: string;
  alertasOperacionais: Record<string, CanalAlertaItemPreferencia>;
  alertasEquipe: Record<string, CanalAlertaItemPreferencia>;
  contatosAlertas: ContatoAlertaWhatsapp[];
}

export function obterAlertasEquipePadrao(): Record<string, CanalAlertaItemPreferencia> {
  const mapa: Record<string, CanalAlertaItemPreferencia> = {};
  for (const item of ALERTAS_VEICULO_CATALOGO) {
    if (item.restritoEquipeTecnica) continue;
    const whatsappPadrao = item.chave === "panico" || item.chave === "bateria_desconectada";
    mapa[item.chave] = {
      ativo: item.padraoAtivo,
      app: item.padraoAtivo,
      whatsapp: whatsappPadrao,
      ligacao: false,
    };
  }
  return mapa;
}

/**
 * Carrega catálogo de telefones da equipe técnica (profiles SuperADM/ADM/Operador,
 * telefones do relatório gerencial e números adicionais salvos).
 */
export async function carregarContatosEquipeTecnica(
  userId?: string | null,
  contatosSalvos?: ContatoAlertaWhatsapp[],
  supabaseClient?: any,
): Promise<ContatoAlertaWhatsapp[]> {
  const client = supabaseClient || supabase;
  const contatosMap = new Map<string, ContatoAlertaWhatsapp>();
  const salvosPorTelefone = new Map<string, ContatoAlertaWhatsapp>();

  if (Array.isArray(contatosSalvos)) {
    for (const c of contatosSalvos) {
      const limpo = normalizarTelefoneDigitosBR(c?.telefone);
      if (limpo) salvosPorTelefone.set(limpo, c);
    }
  }

  try {
    const { data: profs } = await client
      .from("profiles")
      .select("id, nome, email, telefone, role, ativo")
      .in("role", ["superadmin", "adm", "operador"])
      .eq("ativo", true);

    for (const p of profs || []) {
      if (!p?.telefone) continue;
      const limpo = normalizarTelefoneDigitosBR(p.telefone);
      if (limpo.length < 10) continue;
      const salvo = salvosPorTelefone.get(limpo);
      const papelRotulo =
        p.role === "superadmin" ? "SuperADM" : p.role === "adm" ? "Administrador" : "Operador";
      contatosMap.set(limpo, {
        id: `eq-prof-${p.id}`,
        nome: `${p.nome || p.email || "Equipe"} (${papelRotulo})`,
        telefone: p.telefone,
        tipo: "cliente",
        ativo: salvo ? salvo.ativo : true,
        padrao: Boolean(userId && p.id === userId) || p.role === "superadmin",
      });
    }
  } catch {
    // fallback silencioso
  }

  try {
    const { data: cfgRel } = await client
      .from("relatorio_gerencial_config")
      .select("telefones")
      .limit(1)
      .maybeSingle();

    if (Array.isArray(cfgRel?.telefones)) {
      for (const itemTel of cfgRel.telefones) {
        const telRaw = typeof itemTel === "string" ? itemTel : itemTel?.telefone;
        const nomeRaw =
          typeof itemTel === "string" ? "Central SuperADM" : itemTel?.nome || "Central SuperADM";
        const limpo = normalizarTelefoneDigitosBR(telRaw);
        if (limpo.length < 10 || contatosMap.has(limpo)) continue;
        const salvo = salvosPorTelefone.get(limpo);
        contatosMap.set(limpo, {
          id: `eq-rel-${limpo}`,
          nome: `${nomeRaw} (Central Gerencial)`,
          telefone: telRaw,
          tipo: "adicional",
          ativo: salvo ? salvo.ativo : true,
          padrao: false,
        });
      }
    }
  } catch {
    // fallback silencioso
  }

  for (const d of salvosPorTelefone.values()) {
    if (!d?.telefone) continue;
    const limpoAdic = normalizarTelefoneDigitosBR(d.telefone);
    if (limpoAdic.length >= 10 && !contatosMap.has(limpoAdic)) {
      contatosMap.set(limpoAdic, {
        ...d,
        padrao: false,
      });
    }
  }

  return Array.from(contatosMap.values());
}

/**
 * Carrega configurações individuais do membro da equipe técnica a partir de
 * notificacoes_configuracoes (exclusivamente veiculo_id IS NULL).
 */
export async function carregarConfigAlertasEquipe(
  userId: string,
  supabaseClient?: any,
): Promise<ConfigAlertasEquipe> {
  const client = supabaseClient || supabase;
  const padraoOps = obterAlertasOperacionaisPadrao();
  const smsCatalogo = ALERTAS_VEICULO_CATALOGO.find((i) => i.chave === "corte_nao_autorizado_sms");
  if (smsCatalogo) {
    padraoOps.corte_nao_autorizado_sms = {
      ativo: smsCatalogo.padraoCanais.ativo ?? true,
      app: smsCatalogo.padraoCanais.app,
      whatsapp: smsCatalogo.padraoCanais.whatsapp,
      ligacao: Boolean(smsCatalogo.padraoCanais.ligacao),
    };
  }
  const padraoEquipe = obterAlertasEquipePadrao();

  let userAtivos: any = null;
  if (userId) {
    try {
      const { data: cfg } = await client
        .from("notificacoes_configuracoes")
        .select("alertas_ativos")
        .eq("user_id", userId)
        .is("veiculo_id", null)
        .maybeSingle();
      if (cfg?.alertas_ativos) {
        userAtivos = cfg.alertas_ativos;
      }
    } catch {
      // fallback silencioso
    }
  }

  const salvosOps = userAtivos?.alertas_operacionais || {};
  const alertasOperacionais: Record<string, CanalAlertaItemPreferencia> = { ...padraoOps };
  for (const [chave, pad] of Object.entries(padraoOps)) {
    const salvoItem = salvosOps?.[chave];
    if (salvoItem && typeof salvoItem === "object") {
      const ativoItem =
        typeof salvoItem.ativo === "boolean"
          ? salvoItem.ativo
          : Boolean(salvoItem.app || salvoItem.whatsapp || salvoItem.ligacao);
      alertasOperacionais[chave] = {
        ...pad,
        ...salvoItem,
        ativo: ativoItem,
        app: ativoItem ? (salvoItem.app !== undefined ? Boolean(salvoItem.app) : pad.app) : false,
        whatsapp: ativoItem
          ? salvoItem.whatsapp !== undefined
            ? Boolean(salvoItem.whatsapp)
            : pad.whatsapp
          : false,
        ligacao: ativoItem
          ? salvoItem.ligacao !== undefined
            ? Boolean(salvoItem.ligacao)
            : Boolean(pad.ligacao)
          : false,
      };
    }
  }

  const salvosEquipe = userAtivos?.alertas_equipe || {};
  const alertasEquipe: Record<string, CanalAlertaItemPreferencia> = { ...padraoEquipe };
  for (const [chave, pad] of Object.entries(padraoEquipe)) {
    const salvoItem = salvosEquipe?.[chave];
    if (salvoItem && typeof salvoItem === "object") {
      const ativoItem =
        typeof salvoItem.ativo === "boolean"
          ? salvoItem.ativo
          : Boolean(salvoItem.app || salvoItem.whatsapp || salvoItem.ligacao);
      alertasEquipe[chave] = {
        ...pad,
        ...salvoItem,
        ativo: ativoItem,
        app: ativoItem ? (salvoItem.app !== undefined ? Boolean(salvoItem.app) : pad.app) : false,
        whatsapp: ativoItem
          ? salvoItem.whatsapp !== undefined
            ? Boolean(salvoItem.whatsapp)
            : pad.whatsapp
          : false,
        ligacao: ativoItem
          ? salvoItem.ligacao !== undefined
            ? Boolean(salvoItem.ligacao)
            : Boolean(pad.ligacao)
          : false,
      };
    }
  }

  const contatosSalvos = Array.isArray(userAtivos?.contatos_alertas)
    ? userAtivos.contatos_alertas
    : [];
  const contatosAlertas = await carregarContatosEquipeTecnica(userId, contatosSalvos, client);

  return {
    userId,
    alertasOperacionais,
    alertasEquipe,
    contatosAlertas,
  };
}

/**
 * Persiste preferências de alertas operacionais e acompanhamento de frota da equipe técnica
 * em notificacoes_configuracoes (registro veiculo_id IS NULL), propagando em tempo real.
 */
export async function salvarConfigAlertasEquipe(params: {
  userId: string;
  alertasOperacionais: Record<string, CanalAlertaItemPreferencia>;
  alertasEquipe?: Record<string, CanalAlertaItemPreferencia>;
  contatosAlertas: ContatoAlertaWhatsapp[];
}): Promise<boolean> {
  if (!params.userId) return false;
  try {
    const { data: existente } = await supabase
      .from("notificacoes_configuracoes")
      .select("id, alertas_ativos")
      .eq("user_id", params.userId)
      .is("veiculo_id", null)
      .maybeSingle();

    const mergedAtivos: Record<string, any> = {
      ...((existente?.alertas_ativos as Record<string, any>) || {}),
      alertas_operacionais: params.alertasOperacionais,
      contatos_alertas: params.contatosAlertas,
    };
    if (params.alertasEquipe) {
      mergedAtivos.alertas_equipe = params.alertasEquipe;
    }

    let sucesso = false;
    if (existente?.id) {
      const { error } = await supabase
        .from("notificacoes_configuracoes")
        .update({
          alertas_ativos: mergedAtivos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id);
      sucesso = !error;
    } else {
      const { error } = await supabase.from("notificacoes_configuracoes").insert({
        user_id: params.userId,
        veiculo_id: null,
        alertas_ativos: mergedAtivos,
      });
      sucesso = !error;
    }

    if (sucesso && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("hunter_configuracao_alertas_equipe_alterada", {
          detail: {
            userId: params.userId,
            alertasOperacionais: params.alertasOperacionais,
            alertasEquipe: params.alertasEquipe,
            contatosAlertas: params.contatosAlertas,
          },
        }),
      );

      try {
        const canal = supabase.channel(CANAL_ALERTAS_CONFIG_REALTIME);
        canal.send({
          type: "broadcast",
          event: "alertas_equipe_atualizados",
          payload: {
            userId: params.userId,
            alertasOperacionais: params.alertasOperacionais,
            alertasEquipe: params.alertasEquipe,
            contatosAlertas: params.contatosAlertas,
          },
        });
      } catch {
        // fallback silencioso
      }
    }

    return sucesso;
  } catch (err) {
    console.warn("[salvarConfigAlertasEquipe] Erro ao salvar alertas da equipe:", err);
    return false;
  }
}

export function ouvirAtualizacoesAlertasEquipe(
  callback: (dados: {
    userId?: string | null;
    alertasOperacionais?: Record<string, CanalAlertaItemPreferencia>;
    alertasEquipe?: Record<string, CanalAlertaItemPreferencia>;
    contatosAlertas?: ContatoAlertaWhatsapp[];
  }) => void,
): () => void {
  const handlerLocal = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail) callback(custom.detail);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("hunter_configuracao_alertas_equipe_alterada", handlerLocal);
  }

  const canal = supabase
    .channel(`hunter_alertas_equipe_${Date.now()}`)
    .on("broadcast", { event: "alertas_equipe_atualizados" }, (payload: any) => {
      if (payload?.payload) callback(payload.payload);
    })
    .subscribe();

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hunter_configuracao_alertas_equipe_alterada", handlerLocal);
    }
    try {
      supabase.removeChannel(canal);
    } catch {
      // ignora
    }
  };
}

/**
 * Escuta atualizações de regras do veículo em tempo real via Supabase Realtime
 */
export function ouvirAtualizacoesRegrasVeiculo(
  veiculoId: string,
  callback: (regras: RegrasVeiculo) => void,
): () => void {
  const handlerLocal = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.veiculoId === veiculoId && custom.detail?.regras) {
      callback(custom.detail.regras);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("hunter_regras_veiculo_alteradas", handlerLocal);
  }

  const canal = supabase
    .channel(`hunter_regras_${veiculoId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "regras_veiculo",
        filter: `veiculo_id=eq.${veiculoId}`,
      },
      (payload) => {
        const novo = payload.new as any;
        if (novo) {
          callback(novo);
        }
      },
    )
    .subscribe();

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hunter_regras_veiculo_alteradas", handlerLocal);
    }
    supabase.removeChannel(canal);
  };
}
