import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MODOS_PERFIS_DISPONIVEIS,
  MODOS_PERFIS_EMULAVEIS,
  obterRotuloModoPerfil,
} from "../../features/auth/constants/modosPerfis";
import type { ModoPerfilEmulado, UserSession } from "../../features/auth/types";
import { MODULOS_SISTEMA_REGRAS } from "../../shared/lib/permissoesModulos";
import { obterModulosPadraoPorPerfil } from "../../features/seguranca/services/usuarioService";

const rootDir = process.cwd();

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
    assert.equal(
      obterRotuloModoPerfil("supervisor_geral"),
      "Supervisor Geral (Veículos e Vigilantes)",
    );
    assert.equal(
      obterRotuloModoPerfil("supervisor_vigilante"),
      "Supervisor de Vigilante (Postos Fixos)",
    );
    assert.equal(obterRotuloModoPerfil("vigilante"), "Vigilante (Rondas e Escala Tática)");
    assert.equal(obterRotuloModoPerfil("instalador"), "Instalador Técnico");
    assert.equal(obterRotuloModoPerfil("motorista"), "Motorista");
    assert.equal(obterRotuloModoPerfil("financeiro"), "Financeiro");
    assert.equal(obterRotuloModoPerfil("revendedor"), "Revendedor (Franquia)");
    assert.equal(obterRotuloModoPerfil("vendedor"), "Vendedor Autorizado");
    assert.equal(obterRotuloModoPerfil("superadmin_auditor"), "S.adm Auditor (Consulta Read-Only)");
    assert.equal(obterRotuloModoPerfil("cliente"), "Cliente (Titular Plano Master)");
    assert.equal(
      obterRotuloModoPerfil("cliente_degustacao"),
      "Cliente Degustação (Trial Master 24h)",
    );
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

  test("4. MODOS_PERFIS_EMULAVEIS deve conter estritamente 12 perfis e excluir SuperADM", () => {
    assert.equal(MODOS_PERFIS_EMULAVEIS.length, 12);
    const idsEmulaveis = MODOS_PERFIS_EMULAVEIS.map((m) => m.id);
    assert.ok(!idsEmulaveis.includes("superadmin"), "SuperADM nao deve estar na lista de emulacao");
  });

  test("5. AppHeader e Configuracoes: Header limpo sem seletor permanente e banner sob demanda", () => {
    const caminhoHeader = path.join(rootDir, "src/features/layout/components/AppHeader.tsx");
    const conteudoHeader = fs.readFileSync(caminhoHeader, "utf-8");

    // O header nao deve conter o seletor permanente 'Visão:'
    assert.ok(
      !conteudoHeader.includes("Visão:") && !conteudoHeader.includes("VISÃO:"),
      "AppHeader nao deve ter seletor permanente de Visao",
    );
    // Deve usar MODOS_PERFIS_EMULAVEIS no banner
    assert.ok(
      conteudoHeader.includes("MODOS_PERFIS_EMULAVEIS"),
      "AppHeader deve usar MODOS_PERFIS_EMULAVEIS no banner ativo",
    );
  });

  test("6. Isolamento estrito de veiculos: InicioHubView nao renderiza ClienteHomeView para perfis sem veiculos", () => {
    const caminhoHub = path.join(rootDir, "src/features/inicio/components/InicioHubView.tsx");
    const conteudoHub = fs.readFileSync(caminhoHub, "utf-8");

    assert.ok(
      conteudoHub.includes("perfilOperaVeiculos"),
      "InicioHubView deve condicionar Meus Veiculos a perfilOperaVeiculos",
    );
    assert.ok(
      conteudoHub.includes("perfilOperaVeiculos && visaoClienteAtiva"),
      "InicioHubView nao deve renderizar ClienteHomeView se perfil nao opera veiculos",
    );
  });

  test("7. Regras Canônicas Validadas pelo Usuário: Permissões refinadas de Supervisor, Financeiro e Operador", () => {
    const modulosSupervisorGeral = obterModulosPadraoPorPerfil("supervisor", "geral");
    assert.ok(modulosSupervisorGeral.includes("monitor-gps"));
    assert.ok(modulosSupervisorGeral.includes("vigilantes"));
    assert.ok(modulosSupervisorGeral.includes("rotas"));
    assert.ok(modulosSupervisorGeral.includes("frota"));
    assert.ok(modulosSupervisorGeral.includes("abastecimento"));
    assert.ok(modulosSupervisorGeral.includes("manutencao"));
    // Supervisor Geral NÃO deve ter acesso a instalacao, clientes, financeiro ou estoque
    assert.ok(
      !modulosSupervisorGeral.includes("instalacao"),
      "Supervisor Geral nao acessa instalacao",
    );
    assert.ok(!modulosSupervisorGeral.includes("clientes"), "Supervisor Geral nao acessa clientes");
    assert.ok(
      !modulosSupervisorGeral.includes("financeiro"),
      "Supervisor Geral nao acessa financeiro",
    );
    assert.ok(!modulosSupervisorGeral.includes("estoque"), "Supervisor Geral nao acessa estoque");

    const modulosFinanceiro = obterModulosPadraoPorPerfil("financeiro");
    assert.ok(modulosFinanceiro.includes("financeiro"));
    assert.ok(modulosFinanceiro.includes("mensalidades"));
    assert.ok(modulosFinanceiro.includes("propostas"));
    assert.ok(modulosFinanceiro.includes("clientes"));
    assert.ok(modulosFinanceiro.includes("revendedores"));
    assert.ok(modulosFinanceiro.includes("instalacao"));
    assert.ok(modulosFinanceiro.includes("estoque"));
    // Financeiro da GD NÃO acessa abastecimento ou manutencao da frota dos clientes
    assert.ok(
      !modulosFinanceiro.includes("abastecimento"),
      "Financeiro nao acessa abastecimento do cliente",
    );
    assert.ok(
      !modulosFinanceiro.includes("manutencao"),
      "Financeiro nao acessa manutencao do cliente",
    );
    assert.ok(!modulosFinanceiro.includes("monitor-gps"), "Financeiro nao acessa monitor-gps");

    const modulosOperador = obterModulosPadraoPorPerfil("operador");
    assert.ok(modulosOperador.includes("monitor-gps"));
    assert.ok(modulosOperador.includes("vigilantes"), "Operador deve ter acesso a vigilantes");
    assert.ok(modulosOperador.includes("propostas"), "Operador deve ter acesso a propostas");
    assert.ok(
      !modulosOperador.includes("mensalidades"),
      "Operador nao acessa mensalidades/cobranca",
    );
    assert.ok(!modulosOperador.includes("financeiro"), "Operador nao acessa financeiro");
  });
});
