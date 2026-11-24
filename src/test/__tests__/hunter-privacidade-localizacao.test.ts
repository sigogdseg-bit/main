import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  podeAcessarLocalizacaoVeiculo,
  podeAlterarPrivacidadeVeiculo,
} from "../../features/monitor-gps/utils/privacidadeLocalizacao";
import type { UserSession } from "../../features/auth/types";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter - Central de Monitoramento (Função de Privacidade Desativada)", () => {
  const mockVeiculo1: Partial<VeiculoGps> = {
    id: "veic-001",
    cliente_id: "cli-123",
    cliente_user_id: "user-cli-123",
    placa: "ABC1D23",
    marca_modelo: "Toyota Hilux",
    privacidade_localizacao: false,
  };

  const mockVeiculo2: Partial<VeiculoGps> = {
    id: "veic-002",
    cliente_id: "cli-456",
    cliente_user_id: "user-cli-456",
    placa: "XYZ9K88",
    marca_modelo: "VW Gol",
    privacidade_localizacao: false,
  };

  const sessionSuperAdmin: UserSession = {
    userId: "super-001",
    email: "novaes@adm.28bpm.local",
    nome: "SuperADM Novaes",
    role: "superadmin",
    isSuperAdmin: true,
    isAdmin: true,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["todos"],
  };

  const sessionClienteProprietario: UserSession = {
    userId: "user-cli-123",
    email: "cliente.titular@empresa.com",
    nome: "Cliente Titular",
    role: "cliente",
    clienteId: "cli-123",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionOutroCliente: UserSession = {
    userId: "outro-cli-999",
    email: "outro.cliente@gmail.com",
    nome: "Outro Cliente",
    role: "cliente",
    clienteId: "cli-999",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionOperador: UserSession = {
    userId: "op-001",
    email: "operador.central@hunter.com",
    nome: "Operador de Monitoramento",
    role: "operador",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: true,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionAdminGeral: UserSession = {
    userId: "adm-001",
    email: "admin.comum@hunter.com",
    nome: "Administrador Comum",
    role: "adm",
    isSuperAdmin: false,
    isAdmin: true,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["todos"],
  };

  const sessionMotorista: UserSession = {
    userId: "mot-001",
    email: "mot@dario.local",
    nome: "Motorista",
    role: "motorista",
    clienteId: "cli-123",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: true,
    modulos: [],
  };

  it("1. Central de Monitoramento: SuperADM visualiza localização de todos os veículos", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionSuperAdmin, mockVeiculo1), true);
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionSuperAdmin, mockVeiculo2), true);

    const sessionNovaesOficial: UserSession = {
      ...sessionSuperAdmin,
      userId: "super-002",
      email: "novaes@oficial.tec.br",
    };
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionNovaesOficial, mockVeiculo1), true);
  });

  it("2. Central de Monitoramento: Operadores e Administradores visualizam localização sem bloqueio de privacidade", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionOperador, mockVeiculo1), true);
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionAdminGeral, mockVeiculo1), true);
  });

  it("3. Central de Monitoramento: Clientes e Motoristas visualizam veículos monitorados", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionClienteProprietario, mockVeiculo1), true);
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionMotorista, mockVeiculo1), true);
  });

  it("4. Central de Monitoramento: podeAlterarPrivacidadeVeiculo deve retornar SEMPRE FALSE para todos os usuários", () => {
    // Função de privacidade está desativada no sistema
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionSuperAdmin, mockVeiculo1), false);
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionClienteProprietario, mockVeiculo1), false);
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionOperador, mockVeiculo1), false);
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionAdminGeral, mockVeiculo1), false);
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionOutroCliente, mockVeiculo1), false);
  });

  it("5. Bloqueio Administrativo Financeiro: Inadimplência bloqueia cliente, mas preserva acesso da central", () => {
    const bloqueioFinanceiroAtivo = true;

    // SuperADM, Administradores e Operadores continuam vendo mesmo com bloqueio financeiro
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionSuperAdmin, mockVeiculo1, bloqueioFinanceiroAtivo),
      true,
      "SuperADM sempre visualiza",
    );
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionOperador, mockVeiculo1, bloqueioFinanceiroAtivo),
      true,
      "Operador da central sempre visualiza",
    );
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionAdminGeral, mockVeiculo1, bloqueioFinanceiroAtivo),
      true,
      "Administrador sempre visualiza",
    );

    // Cliente e motorista inadimplentes têm a localização bloqueada
    assert.equal(
      podeAcessarLocalizacaoVeiculo(
        sessionClienteProprietario,
        mockVeiculo1,
        bloqueioFinanceiroAtivo,
      ),
      false,
      "Cliente inadimplente tem visualização bloqueada",
    );
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionMotorista, mockVeiculo1, bloqueioFinanceiroAtivo),
      false,
      "Motorista inadimplente tem visualização bloqueada",
    );
  });
});
