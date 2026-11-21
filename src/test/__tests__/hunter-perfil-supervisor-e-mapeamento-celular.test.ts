import { test, describe } from "node:test";
import assert from "node:assert/strict";

const memoryStorage = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
  removeItem: (k: string) => memoryStorage.delete(k),
  clear: () => memoryStorage.clear(),
  key: (i: number) => Array.from(memoryStorage.keys())[i] || null,
  get length() {
    return memoryStorage.size;
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

import { podeAcessarModulo } from "../../shared/lib/permissoesModulos";
import type { UserSession } from "../../features/auth/types";
import { calcularDistanciaMetros } from "../../features/monitor-gps/services/protecaoVeiculoService";
import { obterModulosPadraoPorPerfil } from "../../features/seguranca/services/usuarioService";

function criarSessaoSupervisor(custom: Partial<UserSession>): UserSession {
  return {
    userId: "sup-id-1",
    email: "supervisor@gdseguranca.com.br",
    nome: "Supervisor Operacional",
    role: "supervisor",
    modulos: [],
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    isSupervisor: true,
    ...custom,
  };
}

describe("Hunter — Perfil Supervisor e Mapeamento de Rondas no Celular", () => {
  test("1. Permite acesso completo a veículos e vigilantes para Supervisor Geral", () => {
    const sessionSupervisorGeral = criarSessaoSupervisor({
      userId: "user-sup-geral-1",
      email: "supervisor.geral@gdseguranca.com.br",
      nome: "Supervisor Geral",
      tipoSupervisor: "geral",
      acessoVeiculos: true,
      modulos: [
        "monitor-gps",
        "rotas",
        "frota",
        "abastecimento",
        "vigilantes",
        "atendimento",
        "chat",
        "configuracoes",
        "temas",
      ],
    });

    // Módulos de veículos e frota
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "monitor-gps"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "rotas"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "frota"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "abastecimento"), true);

    // Módulos de vigilantes e rondas
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "vigilantes"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "atendimento"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorGeral, "chat"), true);
  });

  test("2. Restringe acesso a veículos para Supervisor Exclusivo de Vigilantes", () => {
    const sessionSupervisorVigilante = criarSessaoSupervisor({
      userId: "user-sup-vig-1",
      email: "supervisor.vigilante@gdseguranca.com.br",
      nome: "Supervisor de Vigilância",
      tipoSupervisor: "vigilante",
      acessoVeiculos: false,
      modulos: ["vigilantes", "atendimento", "chat", "configuracoes", "temas"],
    });

    // Bloqueio estrito de veículos
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "monitor-gps"), false);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "rotas"), false);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "frota"), false);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "abastecimento"), false);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "motoristas"), false);

    // Liberação estrita de vigilantes e utilitários
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "vigilantes"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "atendimento"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "chat"), true);
    assert.equal(podeAcessarModulo(sessionSupervisorVigilante, "configuracoes"), true);
  });

  test("3. Obter módulos padrão diferencia Supervisor Geral de Supervisor Vigilante", () => {
    const modulosGeral = obterModulosPadraoPorPerfil("supervisor", "geral");
    const modulosVigilante = obterModulosPadraoPorPerfil("supervisor", "vigilante");

    assert.ok(modulosGeral.includes("monitor-gps"));
    assert.ok(modulosGeral.includes("rotas"));
    assert.ok(modulosGeral.includes("vigilantes"));

    assert.ok(!modulosVigilante.includes("monitor-gps"));
    assert.ok(!modulosVigilante.includes("rotas"));
    assert.ok(modulosVigilante.includes("vigilantes"));
  });

  test("4. Calcula distâncias geodésicas reais e estimativa de tempo para a ronda", () => {
    // Coordenadas simuladas de 3 postos/pontos em Volta Redonda - RJ
    const ponto1 = { lat: -22.50852, lng: -44.0885 }; // Portaria Principal
    const ponto2 = { lat: -22.5094, lng: -44.0872 }; // Guarita Fundos
    const ponto3 = { lat: -22.5101, lng: -44.0891 }; // Depósito Sul

    const dist12 = calcularDistanciaMetros(ponto1.lat, ponto1.lng, ponto2.lat, ponto2.lng);
    const dist23 = calcularDistanciaMetros(ponto2.lat, ponto2.lng, ponto3.lat, ponto3.lng);
    const dist31 = calcularDistanciaMetros(ponto3.lat, ponto3.lng, ponto1.lat, ponto1.lng);

    assert.ok(dist12 > 50, "dist12 deve ser maior que 50 metros");
    assert.ok(dist23 > 50, "dist23 deve ser maior que 50 metros");
    assert.ok(dist31 > 50, "dist31 deve ser maior que 50 metros");

    const distanciaTotalCircuito = dist12 + dist23 + dist31;
    // Velocidade de patrulha a pé estimada em ~75 m/min (~4.5 km/h)
    const minutosEstimados = Math.ceil(distanciaTotalCircuito / 75);

    assert.ok(minutosEstimados >= 3, "minutosEstimados deve ser >= 3");
  });
});
