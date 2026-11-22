import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  obterModulosPadraoPorPerfil,
  MODULOS_SISTEMA,
} from "../../features/seguranca/services/usuarioService";
import {
  podeAcessarModulo,
  podeAcessarRota,
  MODULOS_SISTEMA_REGRAS,
} from "../../shared/lib/permissoesModulos";
import type { UserSession } from "../../features/auth/services/authService";

describe("Hunter — Permissões de Módulos por Perfil e Limitação de Operador", () => {
  test("1. Pré-seleção de módulos padrão por perfil", () => {
    // Administrador: todos os módulos
    const modulosAdm = obterModulosPadraoPorPerfil("adm");
    assert.equal(modulosAdm.length, MODULOS_SISTEMA.length);
    assert.ok(modulosAdm.includes("usuarios"));
    assert.ok(modulosAdm.includes("central-seguranca"));

    // Operador: módulos pertinentes solicitados
    const modulosOp = obterModulosPadraoPorPerfil("operador");
    assert.ok(modulosOp.includes("atendimento"), "deve incluir atendimento");
    assert.ok(modulosOp.includes("clientes"), "deve incluir clientes");
    assert.ok(modulosOp.includes("estoque"), "deve incluir estoque");
    assert.ok(!modulosOp.includes("financeiro"), "nao deve incluir financeiro");
    assert.ok(modulosOp.includes("instalacao"), "deve incluir instalacao");
    assert.ok(modulosOp.includes("monitor-gps"), "deve incluir monitor-gps");
    assert.ok(!modulosOp.includes("mensalidades"), "nao deve incluir mensalidades");
    assert.ok(modulosOp.includes("temas"), "deve incluir temas");
    assert.ok(modulosOp.includes("configuracoes"), "deve incluir configuracoes");

    // Operador NÃO deve ter módulos exclusivos de ADM
    assert.ok(!modulosOp.includes("usuarios"), "não deve ter usuários");
    assert.ok(!modulosOp.includes("central-seguranca"), "não deve ter central-segurança");
    assert.ok(!modulosOp.includes("logs"), "não deve ter logs");
    assert.ok(!modulosOp.includes("dispositivos"), "não deve ter dispositivos");
    assert.ok(!modulosOp.includes("rastreadores"), "não deve ter rastreadores j16");

    // Instalador: apenas instalacao
    const modulosInst = obterModulosPadraoPorPerfil("instalador");
    assert.deepEqual(modulosInst, ["instalacao"]);

    // Cliente: apenas módulos do cliente (incluindo configuracoes)
    const modulosCli = obterModulosPadraoPorPerfil("cliente");
    assert.deepEqual(modulosCli, [
      "monitor-gps",
      "manutencao",
      "mensalidades",
      "atendimento",
      "configuracoes",
    ]);
  });

  test("2. Painel Geral (/inicio) é a tela de início a todos os usuários", () => {
    const perfis: Array<UserSession["role"]> = [
      "superadmin",
      "adm",
      "operador",
      "instalador",
      "cliente",
    ];

    for (const r of perfis) {
      const sessao: UserSession = {
        userId: "user-test",
        email: "teste@teste.com",
        nome: "Teste",
        role: r,
        modulos: r === "operador" ? [] : ["todos"],
        isSuperAdmin: r === "superadmin",
        isAdmin: r === "superadmin" || r === "adm",
        isOperador: r === "superadmin" || r === "adm" || r === "operador",
        isCliente: r === "cliente",
        isInstalador: r === "instalador",
        isMotorista: r === "motorista",
      };

      assert.equal(
        podeAcessarRota(sessao, "/inicio"),
        true,
        `Perfil ${r} deve ter acesso garantido à rota /inicio`,
      );
    }
  });

  test("3. Operador sem personalização no banco herda os módulos canônicos e operador restrito acessa estritamente o permitido", () => {
    const sessaoOpPadrao: UserSession = {
      userId: "op-vazio",
      email: "joao@operador.sigoguardiao.local",
      nome: "Joao Operador",
      role: "operador",
      modulos: [], // Sem personalização prévia no banco: herda módulos canônicos do operador
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    // Operador padrão acessa os módulos operacionais canônicos
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "atendimento"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "clientes"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "estoque"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "financeiro"), false);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "instalacao"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "monitor-gps"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "mensalidades"), false);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "temas"), true);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "logs"), true);
    assert.equal(podeAcessarRota(sessaoOpPadrao, "/configuracao/logs"), true);

    // E NUNCA acessa governança administrativa
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "usuarios"), false);
    assert.equal(podeAcessarModulo(sessaoOpPadrao, "central-seguranca"), false);
    assert.equal(podeAcessarRota(sessaoOpPadrao, "/usuarios"), false);

    // Operador com lista personalizada e restrita acessa apenas o que foi liberado
    const sessaoOpRestrito: UserSession = {
      ...sessaoOpPadrao,
      modulos: ["atendimento"],
    };
    assert.equal(podeAcessarModulo(sessaoOpRestrito, "atendimento"), true);
    assert.equal(podeAcessarModulo(sessaoOpRestrito, "estoque"), false);
    assert.equal(podeAcessarModulo(sessaoOpRestrito, "financeiro"), false);
    assert.equal(podeAcessarRota(sessaoOpRestrito, "/estoque"), false);
  });

  test("4. Operador NUNCA acessa módulos de governança administrativa", () => {
    const sessaoOpComModulos: UserSession = {
      userId: "op-ativo",
      email: "operador@hunter.local",
      nome: "Operador Completo",
      role: "operador",
      modulos: [
        "atendimento",
        "clientes",
        "estoque",
        "financeiro",
        "instalacao",
        "monitor-gps",
        "mensalidades",
        "temas",
      ],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    // Módulos operacionais liberados
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "estoque"), true);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "financeiro"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "mensalidades"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "monitor-gps"), true);

    // Módulos de governança administrativa permanecem estritamente bloqueados
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "usuarios"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "central-seguranca"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "logs"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "dispositivos"), false);
    assert.equal(podeAcessarModulo(sessaoOpComModulos, "rastreadores"), false);

    assert.equal(podeAcessarRota(sessaoOpComModulos, "/usuarios"), false);
    assert.equal(podeAcessarRota(sessaoOpComModulos, "/configuracao/central-seguranca"), false);
    assert.equal(podeAcessarRota(sessaoOpComModulos, "/configuracao/logs"), false);
    assert.equal(podeAcessarRota(sessaoOpComModulos, "/dispositivos"), false);
    assert.equal(podeAcessarRota(sessaoOpComModulos, "/configuracao/rastreador-j16"), false);
  });

  test("5. Administrador e SuperADM acessam os módulos administrativos", () => {
    const sessaoAdm: UserSession = {
      userId: "adm-1",
      email: "andre@adm.hunter.local",
      nome: "Andre ADM",
      role: "adm",
      modulos: MODULOS_SISTEMA.map((m) => m.id),
      isSuperAdmin: false,
      isAdmin: true,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    assert.equal(podeAcessarModulo(sessaoAdm, "usuarios"), true);
    assert.equal(podeAcessarModulo(sessaoAdm, "central-seguranca"), true);
    assert.equal(podeAcessarModulo(sessaoAdm, "logs"), true);
    assert.equal(podeAcessarModulo(sessaoAdm, "dispositivos"), true);
    assert.equal(podeAcessarRota(sessaoAdm, "/usuarios"), true);
  });

  test("6. Instalador Técnico: Bloqueio estrito de Rotas e Trajetos Inteligentes e acesso a Troca de Senha", () => {
    const sessaoInstalador: UserSession = {
      userId: "inst-1",
      email: "carlos@instalador.hunter.local",
      nome: "Carlos Instalador",
      role: "instalador",
      modulos: ["instalacao"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: false,
      isInstalador: true,
      isMotorista: false,
    };

    // Bloqueado categoricamente em rotas e trajetos inteligentes
    assert.equal(podeAcessarModulo(sessaoInstalador, "rotas"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/rotas"), false);

    // Bloqueado em outros módulos não autorizados
    assert.equal(podeAcessarModulo(sessaoInstalador, "monitor-gps"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/monitor-gps"), false);
    assert.equal(podeAcessarModulo(sessaoInstalador, "frota"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/frota"), false);
    assert.equal(podeAcessarModulo(sessaoInstalador, "financeiro"), false);

    // Permitido estritamente em Instalações, Painel Geral e Configurações (Troca de Senha)
    assert.equal(podeAcessarModulo(sessaoInstalador, "instalacao"), true);
    assert.equal(podeAcessarRota(sessaoInstalador, "/instalacao"), true);
    assert.equal(podeAcessarRota(sessaoInstalador, "/inicio"), true);
    assert.equal(podeAcessarRota(sessaoInstalador, "/configuracoes"), true);
  });
});
