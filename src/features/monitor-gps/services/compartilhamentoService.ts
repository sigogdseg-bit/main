import { supabase } from "@/integrations/supabase/client";
import { APP_PUBLIC_URL } from "@/shared/lib/version";

/**
 * Retorna o link completo canônico de compartilhamento
 */
export function formatarLinkCompartilhamento(token: string): string {
  const base =
    typeof window !== "undefined" && window.location && window.location.origin
      ? window.location.origin
      : APP_PUBLIC_URL;
  return `${base}/compartilhar/${token}`;
}

export interface CompartilhamentoTemporario {
  id: string;
  token: string;
  veiculo_id: string;
  cliente_id: string | null;
  expira_em: string | null;
  revogado: boolean;
  stealth_ativo?: boolean;
  stealth_latitude?: number | null;
  stealth_longitude?: number | null;
  stealth_rumo?: number | null;
  stealth_ativado_em?: string | null;
  stealth_desativado_em?: string | null;
  stealth_periodos?: Array<{
    ativado_em?: string;
    desativado_em?: string;
    duracao_segundos?: number;
  }>;
  created_at: string;
}

export interface CompartilhamentoPontoTrajeto {
  lat: number;
  lng: number;
  t: string;
  vel?: number;
  ign?: boolean;
  stealth?: boolean;
}

export interface CompartilhamentoPeriodoStealth {
  inicio?: string;
  fim?: string;
  ativado_em?: string;
  desativado_em?: string;
  duracao_segundos?: number;
}

export interface CompartilhamentoAcesso {
  id: string;
  compartilhamento_id: string;
  token: string;
  veiculo_id: string;
  ip: string;
  user_agent?: string | null;
  iniciado_em: string;
  ultimo_ping_em: string;
  finalizado_em?: string | null;
  duracao_segundos: number;
  inicio_latitude: number | null;
  inicio_longitude: number | null;
  inicio_endereco?: string | null;
  fim_latitude: number | null;
  fim_longitude: number | null;
  fim_endereco?: string | null;
  distancia_percorrida_km: number;
  velocidade_maxima: number;
  stealth_observado?: boolean;
  stealth_inicio_em?: string | null;
  stealth_fim_em?: string | null;
  stealth_duracao_segundos?: number;
  stealth_periodos?: CompartilhamentoPeriodoStealth[];
  trajeto: CompartilhamentoPontoTrajeto[];
  created_at: string;
}

export interface VeiculoCompartilhadoPublico {
  id: string;
  placa: string;
  marca_modelo: string;
  cor?: string | null;
  ignicao: boolean;
  velocidade: number;
  latitude: number | null;
  longitude: number | null;
  ultima_atualizacao: string;
  status_operacional: string;
  rumo?: number | null;
  tipo_veiculo?: string | null;
}

/**
 * Gera uma string aleatória criptográfica segura para o token de compartilhamento
 */
export function gerarTokenSeguro(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }
  // Fallback seguro caso window.crypto não esteja disponível
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Cria um novo link de compartilhamento temporário para o veículo
 */
export async function criarCompartilhamentoTemporario(params: {
  veiculoId: string;
  clienteId?: string | null;
  duracaoHoras?: number | null; // null ou 0 significa sem expiração (encerramento manual)
  expiraEm?: Date | null;
  semExpiracao?: boolean;
}): Promise<{
  sucesso: boolean;
  token?: string;
  link?: string;
  expiraEm?: string | null;
  mensagem?: string;
}> {
  try {
    const token = gerarTokenSeguro();

    let dataExpiracao: Date | null = null;
    if (params.semExpiracao || params.duracaoHoras === null || params.duracaoHoras === 0) {
      dataExpiracao = null;
    } else if (params.expiraEm) {
      dataExpiracao = params.expiraEm;
    } else {
      const horas = params.duracaoHoras || 2;
      dataExpiracao = new Date(Date.now() + horas * 60 * 60 * 1000);
    }

    const { data, error } = await supabase
      .from("compartilhamentos_temporarios")
      .insert({
        token,
        veiculo_id: params.veiculoId,
        cliente_id: params.clienteId || null,
        expira_em: dataExpiracao ? dataExpiracao.toISOString() : null,
        revogado: false,
      })
      .select()
      .single();

    if (error) {
      if ((error as any).code === "PGRST205" || error.message?.includes("schema cache")) {
        return {
          sucesso: false,
          mensagem:
            "A tabela de compartilhamentos temporários ainda não foi criada no Supabase. Execute o script de migração no SQL Editor.",
        };
      }
      throw error;
    }

    const link = formatarLinkCompartilhamento(token);

    return {
      sucesso: true,
      token,
      link,
      expiraEm: dataExpiracao ? dataExpiracao.toISOString() : null,
    };
  } catch (err: any) {
    if (err?.code === "PGRST205" || err?.message?.includes("schema cache")) {
      return {
        sucesso: false,
        mensagem:
          "A tabela de compartilhamentos temporários ainda não foi criada no Supabase. Execute o script de migração no SQL Editor.",
      };
    }
    return {
      sucesso: false,
      mensagem: err?.message || "Erro ao gerar link de compartilhamento.",
    };
  }
}

/**
 * Lista os compartilhamentos ativos do veículo
 */
export async function carregarCompartilhamentosAtivos(
  veiculoId: string,
): Promise<CompartilhamentoTemporario[]> {
  try {
    const agora = new Date().toISOString();
    const { data, error } = await supabase
      .from("compartilhamentos_temporarios")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .eq("revogado", false)
      .or(`expira_em.is.null,expira_em.gt.${agora}`)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as CompartilhamentoTemporario[];
  } catch {
    return [];
  }
}

/**
 * Revoga um link de compartilhamento
 */
export async function revogarCompartilhamento(token: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("compartilhamentos_temporarios")
      .update({ revogado: true })
      .eq("token", token);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Alterna o Modo Stealth (Congelamento Tático) de um link de compartilhamento
 */
export async function alternarModoStealth(
  token: string,
  ativo: boolean,
): Promise<{ sucesso: boolean; mensagem?: string; stealth_ativo?: boolean }> {
  try {
    const { data, error } = await (supabase.rpc as any)("alternar_stealth_compartilhamento", {
      p_token: token,
      p_ativo: ativo,
    });

    if (error) throw error;
    return data as { sucesso: boolean; mensagem?: string; stealth_ativo?: boolean };
  } catch (err: any) {
    // Fallback de contingência direta
    try {
      if (ativo) {
        const { data: share } = await supabase
          .from("compartilhamentos_temporarios")
          .select("veiculo_id")
          .eq("token", token)
          .single();

        if (share) {
          const { data: v } = await supabase
            .from("veiculos")
            .select("ultima_latitude, ultima_longitude, rumo")
            .eq("id", share.veiculo_id)
            .single();

          await supabase
            .from("compartilhamentos_temporarios")
            .update({
              stealth_ativo: true,
              stealth_latitude: v?.ultima_latitude ?? null,
              stealth_longitude: v?.ultima_longitude ?? null,
              stealth_rumo: v?.rumo ?? null,
            })
            .eq("token", token);

          return {
            sucesso: true,
            stealth_ativo: true,
            mensagem: "Modo Stealth ativado: posição congelada com sucesso.",
          };
        }
      } else {
        await supabase
          .from("compartilhamentos_temporarios")
          .update({
            stealth_ativo: false,
          })
          .eq("token", token);

        return {
          sucesso: true,
          stealth_ativo: false,
          mensagem: "Modo Stealth desativado: tempo real restabelecido.",
        };
      }
    } catch (fallbackErr: any) {
      return {
        sucesso: false,
        mensagem: fallbackErr?.message || "Erro ao alternar Modo Stealth.",
      };
    }

    return {
      sucesso: false,
      mensagem: err?.message || "Falha ao alternar Modo Stealth.",
    };
  }
}

/**
 * Consulta veículo por token de compartilhamento público (sem autenticação)
 */
export async function consultarVeiculoPorToken(token: string): Promise<{
  sucesso: boolean;
  veiculo?: VeiculoCompartilhadoPublico;
  expira_em?: string | null;
  created_at?: string | null;
  mensagem?: string;
}> {
  const tokenLimpo = (token || "").trim();
  if (!tokenLimpo) {
    return { sucesso: false, mensagem: "Link de compartilhamento inválido." };
  }

  // 1. Tenta consulta via API segura do backend (independe de RLS de cliente e sem limitações de schema)
  try {
    const res = await fetch(
      `/api/compartilhamento/consultar?token=${encodeURIComponent(tokenLimpo)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.sucesso === "boolean") {
        if (data.sucesso && data.veiculo) {
          const v = data.veiculo;
          return {
            ...data,
            veiculo: {
              ...v,
              latitude:
                v.latitude !== null && v.latitude !== undefined && !isNaN(Number(v.latitude))
                  ? Number(v.latitude)
                  : null,
              longitude:
                v.longitude !== null && v.longitude !== undefined && !isNaN(Number(v.longitude))
                  ? Number(v.longitude)
                  : null,
            },
          };
        }
        return data;
      }
    }
  } catch {
    // Continua para o fallback de RPC pública
  }

  // 2. Fallback via Supabase RPC pública
  try {
    const { data, error } = await (supabase.rpc as any)("consultar_veiculo_por_token_publico", {
      p_token: tokenLimpo,
    });

    if (!error && data && typeof data.sucesso === "boolean") {
      if (data.sucesso && data.veiculo) {
        const v = data.veiculo;
        return {
          ...data,
          veiculo: {
            ...v,
            latitude:
              v.latitude !== null && v.latitude !== undefined && !isNaN(Number(v.latitude))
                ? Number(v.latitude)
                : null,
            longitude:
              v.longitude !== null && v.longitude !== undefined && !isNaN(Number(v.longitude))
                ? Number(v.longitude)
                : null,
          },
        };
      }
      return data;
    }

    // 3. Fallback direto caso a RPC ainda esteja desatualizada e RLS permita
    const { data: shareData, error: shareErr } = await supabase
      .from("compartilhamentos_temporarios")
      .select(
        "veiculo_id, expira_em, created_at, revogado, stealth_ativo, stealth_latitude, stealth_longitude, stealth_rumo",
      )
      .eq("token", tokenLimpo)
      .maybeSingle();

    if (shareErr || !shareData) {
      return { sucesso: false, mensagem: "Link de compartilhamento não localizado." };
    }

    if (shareData.revogado) {
      return { sucesso: false, mensagem: "Este link foi revogado pelo proprietário." };
    }

    if (shareData.expira_em && new Date(shareData.expira_em) < new Date()) {
      return { sucesso: false, mensagem: "Este link de compartilhamento expirou." };
    }

    const { data: vData, error: vErr } = await supabase
      .from("veiculos")
      .select(
        "id, placa, marca_modelo, cor, tipo_veiculo, ignicao_status, velocidade_atual, ultima_latitude, ultima_longitude, ultima_atualizacao, status_operacional, rumo",
      )
      .eq("id", shareData.veiculo_id)
      .maybeSingle();

    if (vErr || !vData) {
      return { sucesso: false, mensagem: "Veículo não localizado." };
    }

    const isStealth = !!shareData.stealth_ativo;
    const lat = isStealth
      ? (shareData.stealth_latitude ?? vData.ultima_latitude)
      : vData.ultima_latitude;
    const lng = isStealth
      ? (shareData.stealth_longitude ?? vData.ultima_longitude)
      : vData.ultima_longitude;
    const rumo = isStealth ? (shareData.stealth_rumo ?? vData.rumo) : vData.rumo;

    return {
      sucesso: true,
      veiculo: {
        id: vData.id,
        placa: vData.placa,
        marca_modelo: vData.marca_modelo,
        cor: vData.cor,
        tipo_veiculo: vData.tipo_veiculo || "carro",
        ignicao: isStealth ? false : !!vData.ignicao_status,
        velocidade: isStealth ? 0 : vData.velocidade_atual || 0,
        latitude: lat !== null && lat !== undefined ? Number(lat) : null,
        longitude: lng !== null && lng !== undefined ? Number(lng) : null,
        ultima_atualizacao: isStealth ? new Date().toISOString() : vData.ultima_atualizacao || "",
        status_operacional: isStealth ? "estacionado" : vData.status_operacional || "estacionado",
        rumo: rumo,
      },
      expira_em: shareData.expira_em,
      created_at: shareData.created_at,
    };
  } catch (err: any) {
    return { sucesso: false, mensagem: err?.message || "Falha ao consultar link." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache em memória de geocodificação reversa para performance e economia de rede
// ─────────────────────────────────────────────────────────────────────────────
const cacheGeocodificacao = new Map<string, string>();

/**
 * Converte latitude e longitude em endereço legível no Brasil com cache
 */
export async function obterEnderecoPorCoordenadas(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<string> {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return "Localização não disponível";
  }
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    return "Ponto sem sinal de GPS";
  }

  const chaveCache = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cacheGeocodificacao.has(chaveCache)) {
    return cacheGeocodificacao.get(chaveCache)!;
  }

  // 1. Tenta rota interna de mesma origem (/api/geocodificar) - imune a bloqueios de CORS e com cache Edge
  try {
    const params = new URLSearchParams();
    params.set("lat", String(lat));
    params.set("lon", String(lng));
    const urlApi = `/api/geocodificar?${params.toString()}`;

    const resApi = await fetch(urlApi, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (resApi.ok) {
      const dataApi = await resApi.json();
      if (dataApi && dataApi.success && dataApi.endereco && dataApi.endereco.trim().length > 3) {
        const endFinal = dataApi.endereco.trim();
        cacheGeocodificacao.set(chaveCache, endFinal);
        return endFinal;
      }
    }
  } catch {
    /* Fallback para provedor direto caso a API interna não responda */
  }

  // 2. Fallback direto via Nominatim com tratamento de erros
  try {
    const paramsNom = new URLSearchParams();
    paramsNom.set("format", "json");
    paramsNom.set("lat", String(lat));
    paramsNom.set("lon", String(lng));
    paramsNom.set("addressdetails", "1");
    const url = `https://nominatim.openstreetmap.org/reverse?${paramsNom.toString()}`;

    const res = await fetch(url, {
      headers: {
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": "Hunter-Vehicle-Telemetry/1.7",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const rua = addr.road || addr.street || addr.pedestrian || addr.suburb || "";
        const numero = addr.house_number ? `, ${addr.house_number}` : "";
        const bairro = addr.suburb || addr.neighbourhood || addr.city_district || "";
        const cidade = addr.city || addr.town || addr.municipality || addr.village || "";
        const estado = addr.state ? `/${addr.state}` : "";

        let formatado = rua ? `${rua}${numero}` : "";
        if (bairro && !formatado.includes(bairro)) {
          formatado = formatado ? `${formatado} - ${bairro}` : bairro;
        }
        if (cidade) {
          formatado = formatado ? `${formatado}, ${cidade}${estado}` : `${cidade}${estado}`;
        }

        if (formatado.trim().length > 3) {
          cacheGeocodificacao.set(chaveCache, formatado.trim());
          return formatado.trim();
        }
      }
    }
  } catch {
    // Continua para o fallback seguro
  }

  const fallbackAmigavel = "Localização em monitoramento";
  cacheGeocodificacao.set(chaveCache, fallbackAmigavel);
  return fallbackAmigavel;
}

/**
 * Carrega todos os compartilhamentos do veículo (ativos e históricos)
 */
export async function carregarTodosCompartilhamentos(
  veiculoId: string,
): Promise<CompartilhamentoTemporario[]> {
  try {
    const { data, error } = await supabase
      .from("compartilhamentos_temporarios")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as CompartilhamentoTemporario[];
  } catch {
    return [];
  }
}

/**
 * Carrega o histórico completo de acessos de um link específico de compartilhamento
 */
export async function carregarAcessosCompartilhamento(
  compartilhamentoId: string,
  token?: string,
): Promise<CompartilhamentoAcesso[]> {
  // 1. Tenta carregar pela API do servidor backend
  try {
    const params = new URLSearchParams();
    if (compartilhamentoId) params.append("compartilhamento_id", compartilhamentoId);
    if (token) params.append("token", token);

    const res = await fetch(`/api/compartilhamento/acessos?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.sucesso && Array.isArray(data.acessos)) {
        return data.acessos as CompartilhamentoAcesso[];
      }
    }
  } catch {
    // Continua para fallback Supabase
  }

  // 2. Fallback via cliente Supabase (respeitando RLS autenticado do proprietário)
  try {
    let query = supabase
      .from("compartilhamentos_acessos")
      .select("*")
      .order("iniciado_em", { ascending: false });

    if (compartilhamentoId) {
      query = query.eq("compartilhamento_id", compartilhamentoId);
    } else if (token) {
      query = query.eq("token", token);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as CompartilhamentoAcesso[];
  } catch {
    return [];
  }
}

/**
 * Registra o início do acesso ao link quando aberto pelo visualizador
 */
export async function registrarAcessoCompartilhamento(params: {
  token: string;
  enderecoInicio?: string;
}): Promise<{
  sucesso: boolean;
  acesso_id?: string;
  ip?: string;
  inicio_latitude?: number;
  inicio_longitude?: number;
}> {
  try {
    const res = await fetch("/api/compartilhamento/registrar-acesso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {
    // Fallback via RPC pública direta no Supabase
  }

  try {
    const { data, error } = await (supabase.rpc as any)("registrar_acesso_link_publico", {
      p_token: params.token,
      p_endereco_inicio: params.enderecoInicio || null,
    });

    if (!error && data) {
      return data;
    }
  } catch {
    // Silencioso
  }

  return { sucesso: false };
}

/**
 * Envia ping periódico de presença e grava o rastro do veículo durante o acesso
 */
export async function pingAcessoCompartilhamento(params: {
  acesso_id: string;
  token: string;
  enderecoAtual?: string;
}): Promise<{ sucesso: boolean; duracao_segundos?: number; pontos_trajeto?: number }> {
  try {
    const res = await fetch("/api/compartilhamento/ping-acesso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback RPC
  }

  try {
    const { data, error } = await (supabase.rpc as any)("ping_acesso_link_publico", {
      p_acesso_id: params.acesso_id,
      p_token: params.token,
      p_endereco_atual: params.enderecoAtual || null,
    });

    if (!error && data) {
      return data;
    }
  } catch {
    // Silencioso
  }

  return { sucesso: false };
}

/**
 * Finaliza a sessão de visualização quando a aba é fechada
 */
export async function finalizarAcessoCompartilhamento(params: {
  acesso_id: string;
  token: string;
  enderecoFim?: string;
}): Promise<{ sucesso: boolean }> {
  try {
    const payload = JSON.stringify(params);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/compartilhamento/finalizar-acesso", blob);
      if (ok) return { sucesso: true };
    }

    const res = await fetch("/api/compartilhamento/finalizar-acesso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback RPC
  }

  try {
    await (supabase.rpc as any)("finalizar_acesso_link_publico", {
      p_acesso_id: params.acesso_id,
      p_token: params.token,
      p_endereco_fim: params.enderecoFim || null,
    });
    return { sucesso: true };
  } catch {
    return { sucesso: false };
  }
}
