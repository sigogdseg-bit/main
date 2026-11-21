import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MODOS_PERFIS_DISPONIVEIS,
  obterRotuloModoPerfil,
} from "../../features/auth/constants/modosPerfis";
import type { ModoPerfilEmulado, UserSession } from "../../features/auth/types";
import { MODULOS_SISTEMA_REGRAS } from "../../shared/lib/permissoesModulos";
import { obterModulosPadraoPorPerfil } from "../../features/seguranca/services/usuarioService";

describe("Hunter — Emulação Tática de Modos de Perfis pelo SuperADM", () => {
  test("1. Deve listar os 13 perfis operacionais com identificador, rotulo e descricao", () => {
    assert.equal(MODOS_PERFIS_DISPONIVEIS.length, 13);

    const idsEsperados: ModoPerfilEmulado[] = [
      "superadmin",
      "operador",
      "supervisor_geral",
      "supervisor_vigilante",
      "vigilante",
      "instalador",
      "motorista",
      "financeiro",
      "revendedor",
      "vendedor",
      "superadmin_auditor",
      "cliente",
      "cliente_degustacao",
    ];

    const idsPresentes = MODOS_PERFIS_DISPONIVEIS.map((m) => m.id);
    assert.deepEqual(idsPresentes, idsEsperados);

    for (const item of MODOS_PERFIS_DISPONIVEIS) {
      assert.ok(item.rotulo && item.rotulo.length > 3, `Rotulo invalido para ${item.id}`);
      assert.ok(item.descricao && item.descricao.length > 5, `Descricao invalida para ${item.id}`);
      assert.ok(item.icone && item.icone.length > 0, `Icone invalido para ${item.id}`);
    }
  });

  test("2. Deve retornar o rotulo amigavel correto para cada modo de perfil", () => {
    assert.equal(obterRotuloModoPerfil("superadmin"), "SuperADM (Visão Global Irrestrita)");
    assert.equal(obterRotuloModoPerfil("operador"), "Operador de Monitoramento");
    assert.equal(obterRotuloModoPerfil("supervisor_geral"), "Supervisor Geral (Veículos e Vigilantes)");
    assert.equal(obterRotuloModoPerfil("supervisor_vigilante"), "Supervisor de Vigilante (Postos Fixos)");
    assert.equal(obterRotuloModoPerfil("vigilante"), "Vigilante (Rondas e Escala Tática)");
    assert.equal(obterRotuloModoPerfil("instalador"), "Instalador Técnico");
    assert.equal(obterRotuloModoPerfil("motorista"), "Motorista");
    assert.equal(obterRotuloModoPerfil("financeiro"), "Financeiro");
    assert.equal(obterRotuloModoPerfil("revendedor"), "Revendedor (Franquia)");
    assert.equal(obterRotuloModoPerfil("vendedor"), "Vendedor Autorizado");
    assert.equal(obterRotuloModoPerfil("superadmin_auditor"), "S.adm Auditor (Consulta Read-Only)");
    assert.equal(obterRotuloModoPerfil("cliente"), "Cliente (Titular Plano Master)");
    assert.equal(obterRotuloModoPerfil("cliente_degustacao"), "Cliente Degustação (Trial Master 24h)");
  });

  test("3. Cada perfil emulado deve possuir mapeamento de modulos compativel no sistema", () => {
    assert.ok(MODULOS_SISTEMA_REGRAS.length > 0);
    const modulosSupervisorGeral = obterModulosPadraoPorPerfil("supervisor", "geral");
    assert.ok(modulosSupervisorGeral.includes("monitor-gps"));
    assert.ok(modulosSupervisorGeral.includes("vigilantes"));

    const modulosSupervisorVigilante = obterModulosPadraoPorPerfil("supervisor", "vigilante");
    assert.ok(modulosSupervisorVigilante.includes("vigilantes"));
    assert.ok(!modulosSupervisorVigilante.includes("monitor-gps"));
  });
});
