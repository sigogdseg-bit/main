// orientacaoRuaService.ts — GD Rastreamento
// Calcula e gerencia a orientação (heading/rumo) de veículos estacionados para alinhamento canônico com o eixo da via

import type { VeiculoGps } from "../types";

const MAX_CACHE_RUMO_ESTACIONADO = 500;
const cacheRumoEstacionado = new Map<string, number>();

function salvarCacheRumo(chave: string, valor: number): void {
  if (cacheRumoEstacionado.size >= MAX_CACHE_RUMO_ESTACIONADO) {
    const primeiraChave = cacheRumoEstacionado.keys().next().value;
    if (primeiraChave !== undefined) {
      cacheRumoEstacionado.delete(primeiraChave);
    }
  }
  cacheRumoEstacionado.set(chave, valor);
}

/**
 * Calcula o azimute em graus (0 a 360) entre duas coordenadas geográficas
 */
export function calcularAzimuteGraus(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Normaliza um ângulo em graus para o intervalo canônico [0, 360)
 */
export function normalizarGraus(graus: number): number {
  return ((graus % 360) + 360) % 360;
}

/**
 * Retorna o rumo preferencial para o veículo.
 * Se o veículo estiver em movimento, usa o rumo reportado pelo GPS e atualiza o cache.
 * Se o veículo estiver estacionado/parado e o GPS reportar 0 ou nulo, recupera o último rumo
 * válido ou alinha automaticamente com a orientação da via mais próxima.
 */
export function obterRumoVeiculo(veiculo: VeiculoGps): number {
  const chave = veiculo.placa || veiculo.id;
  const isEstacionadoOuParado =
    veiculo.status_operacional === "estacionado" ||
    veiculo.status_operacional === "parado_ligado" ||
    (veiculo.velocidade ?? 0) <= 2;

  // 1. Se o veículo está em rota e possui rumo válido (> 0), memoriza no cache
  if (!isEstacionadoOuParado) {
    if (veiculo.rumo) {
      if (veiculo.rumo > 0) {
        const r = normalizarGraus(veiculo.rumo);
        salvarCacheRumo(chave, r);
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(`sigo_rumo_estacionado_${chave}`, String(r));
          }
        } catch {
          // Ignora erro de acesso ao localStorage
        }
        return r;
      }
    }
  }

  // 2. Se o veículo possui um rumo explícito do GPS maior que 0, utiliza
  if (veiculo.rumo) {
    if (veiculo.rumo > 0) {
      const r = normalizarGraus(veiculo.rumo);
      salvarCacheRumo(chave, r);
      return r;
    }
  }

  // 3. Se estiver estacionado, tenta resgatar do cache em memória ou localStorage
  if (cacheRumoEstacionado.has(chave)) {
    return cacheRumoEstacionado.get(chave)!;
  }

  try {
    if (typeof localStorage !== "undefined") {
      const salvo = localStorage.getItem(`sigo_rumo_estacionado_${chave}`);
      if (salvo !== null) {
        const r = Number(salvo);
        if (!isNaN(r)) {
          salvarCacheRumo(chave, r);
          return r;
        }
      }
    }
  } catch {
    // Ignora erro de leitura do localStorage
  }

  // 4. Se não houver rumo prévio e o veículo estiver estacionado com rumo 0,
  // agenda a consulta assíncrona da geometria da via para orientá-lo ao longo da rua
  if (isEstacionadoOuParado) {
    buscarOrientacaoViaMaisProxima(veiculo);
  }

  return 0;
}

const consultasEmAndamento = new Set<string>();

/**
 * Consulta a malha viária pública (OSRM) para identificar a orientação vetorial exata da rua
 * e alinha o veículo estacionado ao eixo da via automaticamente, sem exigir ação manual.
 */
export async function buscarOrientacaoViaMaisProxima(veiculo: VeiculoGps): Promise<number | null> {
  const chave = veiculo.placa || veiculo.id;
  if (consultasEmAndamento.has(chave)) return null;
  consultasEmAndamento.add(chave);

  try {
    const lat = veiculo.latitude;
    const lon = veiculo.longitude;
    if (!lat || !lon) return null;

    // 1. Consulta até 5 nós viários adjacentes no OSRM nearest
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}?number=5`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const dados = await resp.json();

    if (dados?.code === "Ok") {
      const wps = dados?.waypoints;
      if (Array.isArray(wps)) {
        if (wps.length >= 2) {
          const nomeRuaPrincipal = wps[0]?.name || "";

          // Filtra pontos que pertencem à mesma via ou pega os dois nós mais representativos
          const wpsMesmaRua = wps.filter(
            (w: any) => !nomeRuaPrincipal || !w.name || w.name === nomeRuaPrincipal,
          );

          const pool = wpsMesmaRua.length >= 2 ? wpsMesmaRua : wps;
          const p1 = pool[0]?.location;
          let p2 = pool[1]?.location;

          // Se os nós estiverem sobrepostos, busca o próximo nó diferente na mesma via
          for (let i = 1; i < pool.length; i++) {
            const candidato = pool[i]?.location;
            if (candidato) {
              const difX = candidato[0] !== p1[0];
              const difY = candidato[1] !== p1[1];
              if (difX || difY) {
                p2 = candidato;
                break;
              }
            }
          }

          if (p1) {
            if (p2) {
              const saoDiferentes = p1[0] !== p2[0] || p1[1] !== p2[1];
              if (saoDiferentes) {
                // p1 e p2 são [lon, lat]
                const azimuteBase = calcularAzimuteGraus(p1[1], p1[0], p2[1], p2[0]);
                const azimuteOposto = normalizarGraus(azimuteBase + 180);

                // Se houver histórico de rumo prévio, alinha com o sentido mais coerente com a chegada
                let rumoHistorico = cacheRumoEstacionado.get(chave) || null;
                if (!rumoHistorico) {
                  if (veiculo.rumo) {
                    if (veiculo.rumo > 0) {
                      rumoHistorico = veiculo.rumo;
                    }
                  }
                }
                let azimuteFinal = azimuteBase;

                if (rumoHistorico !== null) {
                  const diffBase = Math.abs(normalizarGraus(azimuteBase - rumoHistorico));
                  const deltaBase = diffBase > 180 ? 360 - diffBase : diffBase;

                  const diffOposto = Math.abs(normalizarGraus(azimuteOposto - rumoHistorico));
                  const deltaOposto = diffOposto > 180 ? 360 - diffOposto : diffOposto;

                  azimuteFinal = deltaOposto < deltaBase ? azimuteOposto : azimuteBase;
                }

                definirRumoVeiculoEstacionado(veiculo, azimuteFinal);
                return azimuteFinal;
              }
            }
          }
        }
      }
    }
  } catch {
    // Silencia em caso de falha de rede externa (resiliência pura)
  } finally {
    consultasEmAndamento.delete(chave);
  }

  return null;
}

/**
 * Define e persiste um rumo explícito para o veículo estacionado
 */
export function definirRumoVeiculoEstacionado(veiculo: VeiculoGps, rumo: number) {
  const chave = veiculo.placa || veiculo.id;
  const normalizado = normalizarGraus(rumo);
  salvarCacheRumo(chave, normalizado);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`sigo_rumo_estacionado_${chave}`, String(normalizado));
    }
  } catch {
    // Ignora erro de gravacao no localStorage
  }
  veiculo.rumo = normalizado;

  // Notifica o sistema para re-renderizar marcadores de mapa imediatamente
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sigo:rumo-veiculo-atualizado", {
        detail: { veiculoId: veiculo.id, placa: veiculo.placa, rumo: normalizado },
      }),
    );
  }
}

/**
 * Gira o veículo estacionado em 90 graus ou inverte o sentido (180 graus)
 */
export function girarVeiculoEstacionado(veiculo: VeiculoGps, deltaGraus: number = 90): number {
  const atual = obterRumoVeiculo(veiculo);
  const novo = normalizarGraus(atual + deltaGraus);
  definirRumoVeiculoEstacionado(veiculo, novo);
  return novo;
}
