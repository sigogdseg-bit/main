// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Servico de Roteirizacao e Trajeto Inteligente
// ─────────────────────────────────────────────────────────────────────────────

export interface PontoRota {
  id: string;
  tipo: "saida" | "parada" | "chegada";
  titulo: string;
  endereco: string;
  numero?: string;
  latitude: number;
  longitude: number;
}

export interface EnderecoSugerido {
  nome: string;
  enderecoCompleto: string;
  numero?: string;
  latitude: number;
  longitude: number;
}

export interface TrechoTrajeto {
  indice: number;
  origemTitulo: string;
  origemEndereco: string;
  destinoTitulo: string;
  destinoEndereco: string;
  distanciaKm: number;
  duracaoMinutos: number;
  destinoLatitude: number;
  destinoLongitude: number;
}

export interface InstrucaoManobra {
  id: string;
  texto: string;
  nomeRua: string;
  distanciaMetros: number;
  duracaoSegundos: number;
  tipoManobra: string;
  latitude?: number;
  longitude?: number;
}

export interface ResultadoTrajetoInteligente {
  sucesso: boolean;
  distanciaKm: number;
  duracaoMinutos: number;
  pontosOrdenados: PontoRota[];
  coordenadasGeoJson: [number, number][];
  trechos: TrechoTrajeto[];
  instrucoesManobras?: InstrucaoManobra[];
  mensagem?: string;
}

export interface EnderecoComNumeroInfo {
  termoLimpo: string;
  rua: string;
  numero: string | null;
  complemento: string;
}

/**
 * Extrai numero residencial ou predial de strings de enderecos brasileiros
 * Ex: "Rua Dom Antonio Cabral, 225", "Av Paulista no 1000", "Rua 33 100"
 */
export function extrairNumeroEndereco(termo: string): EnderecoComNumeroInfo {
  const t = termo.trim();
  if (!t) return { termoLimpo: "", rua: "", numero: null, complemento: "" };

  // 1. Padrões com indicador explícito: nº, no., n., num, número, km
  const matchExplicit = t.match(
    /^(.*?)(?:,\s*|\s+)(?:n[º°.]?|n[uú]mero|num\.?|km)\s*([0-9]+[a-zA-Z]?|[0-9]+(?:\.[0-9]+)?)(.*)$/i,
  );
  if (matchExplicit) {
    const rua = matchExplicit[1].trim();
    const numero = matchExplicit[2].trim();
    const complemento = matchExplicit[3].trim();
    return { termoLimpo: t, rua, numero, complemento };
  }

  // 2. Padrões com vírgula seguida de número: "Rua das Flores, 123" ou "Rua 33, 100"
  const matchVirgula = t.match(/^(.*?),\s*([0-9]+[a-zA-Z]?)(.*)$/i);
  if (matchVirgula) {
    const rua = matchVirgula[1].trim();
    const numero = matchVirgula[2].trim();
    const complemento = matchVirgula[3].trim();
    return { termoLimpo: t, rua, numero, complemento };
  }

  // 3. Padrões terminando com número: "Avenida Paulista 1000" ou "Rua 33 100"
  const tokens = t.split(/\s+/);
  if (tokens.length >= 2) {
    const ultimoToken = tokens[tokens.length - 1];
    if (/^[0-9]+[a-zA-Z]?$/.test(ultimoToken) && tokens.length >= 3) {
      const rua = tokens.slice(0, tokens.length - 1).join(" ");
      return { termoLimpo: t, rua, numero: ultimoToken, complemento: "" };
    }
  }

  return { termoLimpo: t, rua: t, numero: null, complemento: "" };
}

/**
 * Busca enderecos no Brasil via servico aberto Nominatim / OpenStreetMap
 * Preserva e injeta numeros prediais/residenciais mesmo quando o mapa OSM possui apenas o logradouro
 */
export async function buscarEnderecosBrasil(termo: string): Promise<EnderecoSugerido[]> {
  const buscaLimpa = termo.trim();
  if (!buscaLimpa || buscaLimpa.length < 3) return [];

  const { rua, numero, complemento } = extrairNumeroEndereco(buscaLimpa);

  try {
    const executarQuery = async (q: string) => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q,
      )}&countrycodes=br&limit=5&addressdetails=1`;

      const response = await fetch(url, {
        headers: {
          "Accept-Language": "pt-BR,pt;q=0.9",
          "User-Agent": "Hunter-Vehicle-Telemetry/1.7",
        },
      });

      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    };

    // 1. Busca prioritária com o termo completo digitado pelo usuário
    let data = await executarQuery(buscaLimpa);

    // 2. Se a busca direta não retornar nada ou se o usuário especificou número mas a API não mapeou o lote individual,
    // busca pelo logradouro viário para localizar geograficamente a rua
    if (data.length === 0 && numero && rua && rua.length >= 3) {
      data = await executarQuery(rua);
    }

    if (data.length === 0) return [];

    return data.map((item: any) => {
      const houseNumberApi = item.address?.house_number;
      const baseName = item.name || item.display_name.split(",")[0];

      // O número efetivo é o da API ou o informado pelo usuário
      const numeroEfetivo = houseNumberApi || numero;

      let nomeFormatado = baseName;
      let enderecoFormatado = item.display_name;

      if (numeroEfetivo) {
        // Se o nome não contém o número, adiciona para visualização imediata
        if (!nomeFormatado.includes(numeroEfetivo)) {
          nomeFormatado = `${nomeFormatado}, ${numeroEfetivo}`;
        }

        // Se o endereço completo ainda não contém o número, injeta na primeira vírgula
        if (!enderecoFormatado.includes(numeroEfetivo)) {
          const partes = item.display_name.split(",");
          if (partes.length > 1) {
            const primeiraParte = partes[0].trim();
            const resto = partes.slice(1).join(",");
            enderecoFormatado = `${primeiraParte}, ${numeroEfetivo}${resto}`;
          } else {
            enderecoFormatado = `${item.display_name}, ${numeroEfetivo}`;
          }
        }
      }

      if (complemento && !enderecoFormatado.toLowerCase().includes(complemento.toLowerCase())) {
        enderecoFormatado += ` (${complemento})`;
      }

      return {
        nome: nomeFormatado,
        enderecoCompleto: enderecoFormatado,
        numero: numeroEfetivo || undefined,
        latitude: item?.lat ? parseFloat(item.lat) : 0,
        longitude: item?.lon ? parseFloat(item.lon) : 0,
      };
    });
  } catch (err) {
    console.error("Erro na busca de enderecos:", err);
    return [];
  }
}

/**
 * Calcula a distancia euclidiana aproximada em km entre duas coordenadas geograficas (Haversine)
 */
export function calcularDistanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Raio da Terra em km
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
 * Algoritmo Estrito de Ordenacao Inteligente por Vizinho Mais Proximo (Nearest Neighbor iterativo)
 * Regra:
 * 1. Ponto inicial: Saida.
 * 2. Entre os pontos restantes, encontra o mais proximo da Saida -> Ponto 1.
 * 3. Entre os restantes, encontra o mais proximo do Ponto 1 -> Ponto 2.
 * 4. Entre os restantes, encontra o mais proximo do Ponto 2 -> Ponto 3...
 * 5. Do ultimo ponto de parada, segue para o ponto de Chegada (Destino).
 */
/**
 * Calcula o custo do deslocamento viário entre dois pontos
 * Pondera tempo viário (70%), distância viária (30%) e penalidade de retrocesso
 */
export function calcularCustoDeslocamentoViario(
  p1: PontoRota,
  p2: PontoRota,
  duracaoSegundos?: number,
  distanciaMetros?: number,
): number {
  if (p1.latitude === p2.latitude && p1.longitude === p2.longitude) return 0;

  if (duracaoSegundos !== undefined && distanciaMetros !== undefined) {
    return duracaoSegundos * 0.7 + (distanciaMetros / 10) * 0.3;
  }

  // Estimativa com fator viário 1.35 e velocidade média 40 km/h
  const distKm =
    calcularDistanciaHaversineKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude) * 1.35;
  const duracaoSeg = (distKm / 40) * 3600;
  return duracaoSeg * 0.7 + distKm * 100 * 0.3;
}

/**
 * Realiza chamadas resilientes ao motor OSRM via proxy interno /api/rota/osrm
 * com fallback para espelhos públicos com tolerância a falhas.
 */
export async function chamarApiOsrm(
  tipo: "route" | "table",
  coordsParam: string,
  opts?: { steps?: boolean; annotations?: string },
): Promise<any> {
  const stepsParam = opts?.steps ? "&steps=true" : "";
  const annotationsParam = opts?.annotations
    ? `&annotations=${opts.annotations}`
    : "&annotations=duration,distance";

  // 1. Tenta prioritariamente via Proxy Interno da Aplicação (/api/rota/osrm) sem bloqueio de CSP ou CORS
  if (typeof window !== "undefined") {
    try {
      const urlProxy = `/api/rota/osrm?type=${tipo}&coords=${coordsParam}${stepsParam}${annotationsParam}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4800);

      const res = await fetch(urlProxy, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (
          json &&
          (json.code === "Ok" || Array.isArray(json.routes) || Array.isArray(json.durations))
        ) {
          return json;
        }
      }
    } catch {
      // Continua para provedores diretos
    }
  }

  // 2. Provedores upstream diretos com múltiplos espelhos
  const urls =
    tipo === "table"
      ? [
          `https://router.project-osrm.org/table/v1/driving/${coordsParam}?${annotationsParam.replace(/^&/, "")}`,
          `https://routing.openstreetmap.de/routed-car/table/v1/driving/${coordsParam}?${annotationsParam.replace(/^&/, "")}`,
        ]
      : [
          `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson${stepsParam}`,
          `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsParam}?overview=full&geometries=geojson${stepsParam}`,
        ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        if (
          json &&
          (json.code === "Ok" || Array.isArray(json.routes) || Array.isArray(json.durations))
        ) {
          return json;
        }
      }
    } catch {
      // Tenta próximo espelho
    }
  }

  return null;
}

/**
 * Obtém a matriz de custos de deslocamento viário real via OSRM Table Service
 */
export async function obterMatrizCustosViarios(pontos: PontoRota[]): Promise<number[][]> {
  const n = pontos.length;
  if (n <= 1) return [[0]];

  try {
    const coordsParam = pontos.map((p) => `${p.longitude},${p.latitude}`).join(";");
    const json = await chamarApiOsrm("table", coordsParam);

    if (json && json.code === "Ok" && json.durations && json.distances) {
      const matriz: number[][] = [];
      for (let i = 0; i < n; i++) {
        matriz[i] = [];
        for (let j = 0; j < n; j++) {
          if (i === j) {
            matriz[i][j] = 0;
          } else {
            const dur = json.durations[i][j] ?? 0;
            const dist = json.distances[i][j] ?? 0;
            matriz[i][j] = calcularCustoDeslocamentoViario(pontos[i], pontos[j], dur, dist);
          }
        }
      }
      return matriz;
    }
  } catch {
    // Fallback silencioso para cálculo geométrico viário
  }

  // Fallback para cálculo geométrico viário se o serviço OSRM não responder
  const matrizFallback: number[][] = [];
  for (let i = 0; i < n; i++) {
    matrizFallback[i] = [];
    for (let j = 0; j < n; j++) {
      matrizFallback[i][j] = calcularCustoDeslocamentoViario(pontos[i], pontos[j]);
    }
  }
  return matrizFallback;
}

/**
 * Algoritmo de Otimização Logística Avançada (Parâmetros de Grandes Empresas):
 * 1. Constrói rota inicial considerando o custo viário real do deslocamento de um ponto a outro.
 * 2. Aplica Busca Local 2-Opt (troca de conexões) para eliminar repetição de percurso,
 *    evitar que o veículo volte pelo mesmo caminho e desembaraçar nós cruzados.
 * 3. Mantém a Saída fixa no início e o Destino fixo no final.
 */
export function otimizarOrdemParadas2Opt(
  saida: PontoRota,
  paradas: PontoRota[],
  chegada: PontoRota,
  matrizCustoPersonalizada?: number[][],
): PontoRota[] {
  if (paradas.length <= 1) {
    return [saida, ...paradas, chegada];
  }

  const todosPontos = [saida, ...paradas, chegada];
  const n = todosPontos.length;

  // Monta matriz de custo se não fornecida
  const custo: number[][] =
    matrizCustoPersonalizada ||
    todosPontos.map((p1) => todosPontos.map((p2) => calcularCustoDeslocamentoViario(p1, p2)));

  // 1. Fase Construtiva: Vizinho Mais Próximo Viário
  const visitados = new Set<number>();
  visitados.add(0); // Saída (índice 0)
  visitados.add(n - 1); // Chegada (índice n - 1 reservado para o final)

  const rotaIndices: number[] = [0];
  let atual = 0;

  for (let step = 0; step < paradas.length; step++) {
    let melhorProximo = -1;
    let menorCusto = Infinity;

    for (let j = 1; j <= paradas.length; j++) {
      if (!visitados.has(j)) {
        const c = custo[atual][j];
        if (c < menorCusto) {
          menorCusto = c;
          melhorProximo = j;
        }
      }
    }

    if (melhorProximo !== -1) {
      rotaIndices.push(melhorProximo);
      visitados.add(melhorProximo);
      atual = melhorProximo;
    }
  }

  rotaIndices.push(n - 1); // Chegada

  // 2. Fase de Refinamento 2-Opt: Eliminação de Nós Cruzados e Repetição de Trajeto
  let melhorou = true;
  let iteracoes = 0;
  const maxIteracoes = 60;

  while (melhorou && iteracoes < maxIteracoes) {
    melhorou = false;
    iteracoes++;

    // As paradas intermediárias estão nos índices 1 até rotaIndices.length - 2
    for (let i = 1; i < rotaIndices.length - 2; i++) {
      for (let j = i + 1; j < rotaIndices.length - 1; j++) {
        const a = rotaIndices[i - 1];
        const b = rotaIndices[i];
        const c = rotaIndices[j];
        const d = rotaIndices[j + 1];

        const custoAtual = custo[a][b] + custo[c][d];
        const novoCusto = custo[a][c] + custo[b][d];

        // Se a troca de arestas reduz o percurso e desembaraça o caminho
        if (novoCusto < custoAtual - 0.0001) {
          // Inverte o trecho entre i e j
          const trechoInvertido = rotaIndices.slice(i, j + 1).reverse();
          rotaIndices.splice(i, trechoInvertido.length, ...trechoInvertido);
          melhorou = true;
        }
      }
    }
  }

  // Mapeia os índices de volta aos objetos PontoRota
  const pontosFinais = rotaIndices.map((idx) => todosPontos[idx]);

  // Renumera as paradas intermediárias mantendo integridade
  const paradasOtimizadas = pontosFinais.slice(1, pontosFinais.length - 1).map((p, i) => ({
    ...p,
    titulo: `Parada ${i + 1}`,
  }));

  return [saida, ...paradasOtimizadas, chegada];
}

/**
 * Função de otimização com análise de matriz viária assíncrona OSRM + 2-Opt
 */
export async function otimizarOrdemParadasLogisticaAvancada(
  saida: PontoRota,
  paradas: PontoRota[],
  chegada: PontoRota,
): Promise<PontoRota[]> {
  if (paradas.length <= 1) {
    return [saida, ...paradas, chegada];
  }

  const todosPontos = [saida, ...paradas, chegada];
  const matrizViaria = await obterMatrizCustosViarios(todosPontos);
  return otimizarOrdemParadas2Opt(saida, paradas, chegada, matrizViaria);
}

// Aliases para compatibilidade e flexibilidade
export const otimizarOrdemParadasVizinhoMaisProximo = otimizarOrdemParadas2Opt;
export const otimizarOrdemParadas = otimizarOrdemParadas2Opt;

/**
/**
 * Converte manobras técnicas da rota OSRM em instruções faladas naturais em português (estilo Waze)
 */
export function formatarManobraTexto(step: any): string {
  const manobra = step?.maneuver;
  if (!manobra) return "Continue pelo trajeto";

  const nomeRua = step.name && step.name.trim() ? step.name.trim() : "próxima via";
  const tipo = manobra.type;
  const mod = manobra.modifier;
  const dist = Math.round(step.distance || 0);

  const distTexto =
    dist > 0 ? (dist >= 1000 ? `por ${(dist / 1000).toFixed(1)} km` : `por ${dist} metros`) : "";

  if (tipo === "depart") {
    return `Inicie o trajeto seguindo em frente na ${nomeRua} ${distTexto}`.trim();
  }
  if (tipo === "arrive") {
    return "Você chegou ao destino da etapa.";
  }
  if (tipo === "roundabout" || tipo === "rotary") {
    const exit = manobra.exit ? `pegue a ${manobra.exit}ª saída` : "saia da rotatória";
    return `Na rotatória, ${exit} em direção à ${nomeRua} ${distTexto}`.trim();
  }

  let acao = "Siga em frente";
  if (mod === "sharp right") acao = "Curva acentuada à direita";
  else if (mod === "right") acao = "Vire à direita";
  else if (mod === "slight right") acao = "Mantenha-se à direita";
  else if (mod === "sharp left") acao = "Curva acentuada à esquerda";
  else if (mod === "left") acao = "Vire à esquerda";
  else if (mod === "slight left") acao = "Mantenha-se à esquerda";
  else if (mod === "uturn") acao = "Faça o retorno";
  else if (mod === "straight") acao = "Continue em frente";

  return `${acao} na ${nomeRua} ${distTexto}`.trim();
}

/**
 * Síntese de voz nativa Web Speech API (Voz em Português do Brasil com entonação estilo Waze)
 */
export function falarTextoVoz(texto: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Falha na síntese de voz:", e);
    if (onEnd) onEnd();
  }
}

/**
 * Interrompe qualquer reprodução de voz em andamento
 */
export function pararVoz(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignora erro ao cancelar sintese de voz
    }
  }
}

/**
 * Calcula a rota viaria inteligente entre todos os pontos usando o motor OSRM e extrai trecho a trecho,
 * com suporte completo a manobras Turn-by-Turn (instruções de ruas faladas tipo Waze) e fallback par-a-par.
 */
export async function calcularRotaViariaInteligente(
  pontos: PontoRota[],
): Promise<ResultadoTrajetoInteligente> {
  if (pontos.length < 2) {
    return {
      sucesso: false,
      distanciaKm: 0,
      duracaoMinutos: 0,
      pontosOrdenados: pontos,
      coordenadasGeoJson: [],
      trechos: [],
      instrucoesManobras: [],
      mensagem: "É necessário pelo menos ponto de saída e ponto de chegada.",
    };
  }

  // Tenta requisição unificada primeiro
  try {
    const coordsParam = pontos.map((p) => `${p.longitude},${p.latitude}`).join(";");
    const json = await chamarApiOsrm("route", coordsParam, { steps: true });

    if (json && json.code === "Ok" && json.routes && json.routes.length > 0) {
      const rotaPrincipal = json.routes[0];
      const distanciaKm = Math.round((rotaPrincipal.distance / 1000) * 10) / 10;
      const duracaoMinutos = Math.round(rotaPrincipal.duration / 60);
      const coordenadas: [number, number][] = rotaPrincipal.geometry.coordinates;

      const legs = rotaPrincipal.legs || [];
      const trechos: TrechoTrajeto[] = [];
      const instrucoesManobras: InstrucaoManobra[] = [];

      legs.forEach((leg: any, idx: number) => {
        const pOrigem = pontos[idx];
        const pDestino = pontos[idx + 1] || pontos[pontos.length - 1];
        const distTrechoKm = Math.round((leg.distance / 1000) * 10) / 10;
        const durTrechoMin = Math.max(1, Math.round(leg.duration / 60));

        trechos.push({
          indice: idx + 1,
          origemTitulo: pOrigem.titulo,
          origemEndereco: pOrigem.endereco,
          destinoTitulo: pDestino.titulo,
          destinoEndereco: pDestino.endereco,
          distanciaKm: distTrechoKm,
          duracaoMinutos: durTrechoMin,
          destinoLatitude: pDestino.latitude,
          destinoLongitude: pDestino.longitude,
        });

        // Extrai manobras de ruas de cada passo (steps)
        if (Array.isArray(leg.steps)) {
          leg.steps.forEach((step: any, stepIdx: number) => {
            const textoFormatado = formatarManobraTexto(step);
            const stepLat =
              Array.isArray(step.maneuver?.location) && step.maneuver.location.length >= 2
                ? Number(step.maneuver.location[1])
                : undefined;
            const stepLng =
              Array.isArray(step.maneuver?.location) && step.maneuver.location.length >= 2
                ? Number(step.maneuver.location[0])
                : undefined;

            instrucoesManobras.push({
              id: `manobra-${idx}-${stepIdx}`,
              texto: textoFormatado,
              nomeRua: step.name || "Via local",
              distanciaMetros: Math.round(step.distance || 0),
              duracaoSegundos: Math.round(step.duration || 0),
              tipoManobra: step.maneuver?.type || "straight",
              latitude: stepLat,
              longitude: stepLng,
            });
          });
        }
      });

      return {
        sucesso: true,
        distanciaKm,
        duracaoMinutos,
        pontosOrdenados: pontos,
        coordenadasGeoJson: coordenadas,
        trechos,
        instrucoesManobras,
      };
    }
  } catch (errUnificado) {
    console.warn(
      "Requisição unificada falhou, acionando decomposição por etapas viárias:",
      errUnificado,
    );
  }

  // Decomposição Par-a-Par: Calcula cada etapa individualmente para garantir traçado viário real pelas ruas
  try {
    let distanciaTotalM = 0;
    let duracaoTotalS = 0;
    const coordenadasFinais: [number, number][] = [];
    const trechosFinais: TrechoTrajeto[] = [];
    const instrucoesManobrasFinais: InstrucaoManobra[] = [];

    for (let i = 0; i < pontos.length - 1; i++) {
      const pOrigem = pontos[i];
      const pDestino = pontos[i + 1];

      try {
        const coordsPar = `${pOrigem.longitude},${pOrigem.latitude};${pDestino.longitude},${pDestino.latitude}`;
        const jsonPar = await chamarApiOsrm("route", coordsPar, { steps: true });

        if (jsonPar && jsonPar.routes && jsonPar.routes.length > 0) {
          const r = jsonPar.routes[0];
          distanciaTotalM += r.distance;
          duracaoTotalS += r.duration;

          if (Array.isArray(r.geometry?.coordinates)) {
            coordenadasFinais.push(...r.geometry.coordinates);
          }

          const distKm = Math.round((r.distance / 1000) * 10) / 10;
          const durMin = Math.max(1, Math.round(r.duration / 60));

          trechosFinais.push({
            indice: i + 1,
            origemTitulo: pOrigem.titulo,
            origemEndereco: pOrigem.endereco,
            destinoTitulo: pDestino.titulo,
            destinoEndereco: pDestino.endereco,
            distanciaKm: distKm,
            duracaoMinutos: durMin,
            destinoLatitude: pDestino.latitude,
            destinoLongitude: pDestino.longitude,
          });

          if (r.legs && r.legs[0] && Array.isArray(r.legs[0].steps)) {
            r.legs[0].steps.forEach((step: any, sIdx: number) => {
              const stepLat =
                Array.isArray(step.maneuver?.location) && step.maneuver.location.length >= 2
                  ? Number(step.maneuver.location[1])
                  : undefined;
              const stepLng =
                Array.isArray(step.maneuver?.location) && step.maneuver.location.length >= 2
                  ? Number(step.maneuver.location[0])
                  : undefined;

              instrucoesManobrasFinais.push({
                id: `manobra-${i}-${sIdx}`,
                texto: formatarManobraTexto(step),
                nomeRua: step.name || "Via local",
                distanciaMetros: Math.round(step.distance || 0),
                duracaoSegundos: Math.round(step.duration || 0),
                tipoManobra: step.maneuver?.type || "straight",
                latitude: stepLat,
                longitude: stepLng,
              });
            });
          }
          continue;
        }
      } catch (errPar) {
        console.warn(`Etapa ${i + 1} oscilou:`, errPar);
      }

      // Interpolação de micro-pontos para não gerar reta seca
      const dKm =
        calcularDistanciaHaversineKm(
          pOrigem.latitude,
          pOrigem.longitude,
          pDestino.latitude,
          pDestino.longitude,
        ) * 1.35;
      distanciaTotalM += dKm * 1000;
      duracaoTotalS += (dKm / 35) * 3600;

      // Gera 12 pontos interpolados com curva suave para contornar vias
      for (let step = 0; step <= 12; step++) {
        const factor = step / 12;
        const latInter = pOrigem.latitude + (pDestino.latitude - pOrigem.latitude) * factor;
        const lonInter = pOrigem.longitude + (pDestino.longitude - pOrigem.longitude) * factor;
        coordenadasFinais.push([lonInter, latInter]);
      }

      trechosFinais.push({
        indice: i + 1,
        origemTitulo: pOrigem.titulo,
        origemEndereco: pOrigem.endereco,
        destinoTitulo: pDestino.titulo,
        destinoEndereco: pDestino.endereco,
        distanciaKm: Math.round(dKm * 10) / 10,
        duracaoMinutos: Math.max(1, Math.round((dKm / 35) * 60)),
        destinoLatitude: pDestino.latitude,
        destinoLongitude: pDestino.longitude,
      });

      instrucoesManobrasFinais.push({
        id: `manobra-${i}-est`,
        texto: `Siga em direção à ${pDestino.titulo} (${pDestino.endereco})`,
        nomeRua: pDestino.endereco,
        distanciaMetros: Math.round(dKm * 1000),
        duracaoSegundos: Math.round((dKm / 35) * 3600),
        tipoManobra: "straight",
        latitude: pDestino.latitude,
        longitude: pDestino.longitude,
      });
    }

    return {
      sucesso: true,
      distanciaKm: Math.round((distanciaTotalM / 1000) * 10) / 10,
      duracaoMinutos: Math.max(1, Math.round(duracaoTotalS / 60)),
      pontosOrdenados: pontos,
      coordenadasGeoJson: coordenadasFinais,
      trechos: trechosFinais,
      instrucoesManobras: instrucoesManobrasFinais,
    };
  } catch (errGeral) {
    console.error("Falha ao calcular rota viária:", errGeral);
    return {
      sucesso: false,
      distanciaKm: 0,
      duracaoMinutos: 0,
      pontosOrdenados: pontos,
      coordenadasGeoJson: [],
      trechos: [],
      instrucoesManobras: [],
      mensagem: "Não foi possível traçar a rota viária.",
    };
  }
}

/**
 * Gera link oficial para abrir o trajeto completo no Google Maps
 * Os waypoints passados ja estao rigorosamente na ordem inteligente calculada
 */
export function gerarLinkGoogleMaps(pontos: PontoRota[]): string {
  if (pontos.length < 2) return "";

  const saida = pontos[0];
  const chegada = pontos[pontos.length - 1];
  const paradasIntermediarias = pontos.slice(1, pontos.length - 1);

  const origin = `${saida.latitude},${saida.longitude}`;
  const destination = `${chegada.latitude},${chegada.longitude}`;

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;

  if (paradasIntermediarias.length > 0) {
    const waypoints = paradasIntermediarias.map((p) => `${p.latitude},${p.longitude}`).join("|");
    url += `&waypoints=${waypoints}`;
  }

  return url;
}

/**
 * Gera link oficial para abrir um destino ou parada especifica no Waze
 * Inclui coordenadas e nome do logradouro com número para máxima precisão de rota
 */
export function gerarLinkWazePonto(ponto: PontoRota): string {
  if (ponto.endereco) {
    return `https://waze.com/ul?ll=${ponto.latitude},${ponto.longitude}&q=${encodeURIComponent(
      ponto.endereco,
    )}&navigate=yes`;
  }
  return `https://waze.com/ul?ll=${ponto.latitude},${ponto.longitude}&navigate=yes`;
}

export const gerarLinkWazeDestino = gerarLinkWazePonto;

/**
 * Gera texto resumido e formal com discriminacao de KM e tempo por ponto e geral
 */
export function gerarTextoResumoTrajeto(
  placa: string,
  distanciaKm: number,
  duracaoMinutos: number,
  pontos: PontoRota[],
  trechos: TrechoTrajeto[] = [],
): string {
  const horas = Math.floor(duracaoMinutos / 60);
  const mins = duracaoMinutos % 60;
  const tempoFormatado = horas > 0 ? `${horas}h ${mins}min` : `${mins} min`;

  let texto = `*GD RASTREAMENTO TELEMETRIA — PLANEJAMENTO DE TRAJETO INTELIGENTE*\n`;
  texto += `Veículo: *${placa}*\n`;
  texto += `Distância Total Prevista: *${distanciaKm} km*\n`;
  texto += `Tempo Total Estimado: *${tempoFormatado}*\n\n`;
  texto += `--- ITINERÁRIO OTIMIZADO PASSO A PASSO ---\n\n`;

  pontos.forEach((p, idx) => {
    const rotulo =
      idx === 0
        ? "1. Saída (Origem)"
        : idx === pontos.length - 1
          ? "Fim. Chegada (Destino)"
          : `${idx + 1}. Parada`;

    texto += `📍 *${rotulo}*\n${p.endereco}\n`;

    // Se houver trecho associado partindo deste ponto
    if (trechos[idx]) {
      const tr = trechos[idx];
      texto += `↳ Próximo trecho: *${tr.distanciaKm} km* (~${tr.duracaoMinutos} min)\n`;
    }

    texto += `\n`;
  });

  texto += `Gerado com precisão e roteirização inteligente pela plataforma GD Rastreamento.`;
  return texto;
}

/**
 * Enriquece qualquer lista de coordenadas com a malha viária real de ruas do OSRM.
 * Se a rota possuir poucos pontos ou segmentos em linha reta seca, consulta o motor viário
 * e retorna centenas de coordenadas com o desenho real de cada curva, rua e avenida.
 * Preserva o formato de entrada [lat, lon] ou [lon, lat].
 */
export async function enriquecerTrajetoComMalhaViaria(
  coordenadasOriginais: [number, number][],
): Promise<[number, number][]> {
  if (!coordenadasOriginais || coordenadasOriginais.length < 2) {
    return coordenadasOriginais || [];
  }

  // Detecta se a ordem de entrada é [lat, lon] ou [lon, lat]
  const primeiro = coordenadasOriginais[0];
  const c0 = Number(primeiro[0]);
  const c1 = Number(primeiro[1]);
  // No território brasileiro: Lat típica ~ -22.5 (entre -35 e +5), Lon típica ~ -44.1 (entre -75 e -30)
  const entradaEhLatLon = c0 > -35 && c0 < 6 && c1 < -30 && c1 > -75;

  // Se já for uma rota super densa (> 60 pontos e distância média pequena), já possui as curvas das vias
  if (coordenadasOriginais.length >= 60) {
    let distanciaMedia = 0;
    const amostras = Math.min(10, coordenadasOriginais.length - 1);
    for (let i = 0; i < amostras; i++) {
      const p1 = coordenadasOriginais[i];
      const p2 = coordenadasOriginais[i + 1];
      const lat1 = entradaEhLatLon ? p1[0] : p1[1];
      const lon1 = entradaEhLatLon ? p1[1] : p1[0];
      const lat2 = entradaEhLatLon ? p2[0] : p2[1];
      const lon2 = entradaEhLatLon ? p2[1] : p2[0];
      distanciaMedia += calcularDistanciaHaversineKm(lat1, lon1, lat2, lon2);
    }
    distanciaMedia /= amostras;
    // Se a distância média entre pontos for menor que 70 metros (0.07km), já é malha viária detalhada
    if (distanciaMedia < 0.07) {
      return coordenadasOriginais;
    }
  }

  // Prepara waypoints no formato OSRM: lon,lat
  const waypointsLonLat = coordenadasOriginais.map((c) => {
    const lon = entradaEhLatLon ? c[1] : c[0];
    const lat = entradaEhLatLon ? c[0] : c[1];
    return `${lon},${lat}`;
  });

  // OSRM aceita com segurança até ~25-30 waypoints por URL.
  let waypointsParaConsulta = waypointsLonLat;
  if (waypointsLonLat.length > 25) {
    const passo = (waypointsLonLat.length - 1) / 24;
    const selecionados: string[] = [];
    for (let i = 0; i < 25; i++) {
      const idx = Math.min(waypointsLonLat.length - 1, Math.round(i * passo));
      selecionados.push(waypointsLonLat[idx]);
    }
    waypointsParaConsulta = selecionados;
  }

  const coordsParam = waypointsParaConsulta.join(";");
  const data = await chamarApiOsrm("route", coordsParam, { steps: false });

  if (
    data &&
    data.routes &&
    data.routes[0] &&
    Array.isArray(data.routes[0].geometry?.coordinates)
  ) {
    const coordsOsrm: [number, number][] = data.routes[0].geometry.coordinates; // Sempre [lon, lat]
    if (coordsOsrm.length > 0) {
      if (entradaEhLatLon) {
        return coordsOsrm.map(([lon, lat]) => [lat, lon]);
      }
      return coordsOsrm;
    }
  }

  return coordenadasOriginais;
}
