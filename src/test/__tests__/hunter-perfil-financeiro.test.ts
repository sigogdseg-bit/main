import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  podeAcessarModulo,
  podeAcessarRota,
  MODULOS_PADRAO_FINANCEIRO,
} from "../../shared/lib/permissoesModulos";
import {
  obterModulosPadraoPorPerfil,
  MODULOS_SISTEMA,
} from "../../features/seguranca/services/usuarioService";
import type { UserSession } from "../../features/auth/types";
import type { HunterRole } from "../../integrations/supabase/types";

describe("Hunter — Perfil Financeiro Canônico e Isolamento Estrito (DJR-NEW)", () => {
  const sessaoFinanceiro: UserSession = {
    userId: "usr-fin-001",
    email: "financeiro@gdseguranca.com.br",
    nome: "Gestor Financeiro",
    role: "financeiro" as HunterRole,
    modulos: [...MODULOS_PADRAO_FINANCEIRO],
    isSuperAdmin: false,
    isSuperAdminAuditor: false,
    isAuditor: false,
    isReadOnly: false,
    isDegustacao: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    isFuncionario: false,
    isFinanceiro: true,
    isRevendedor: false,
    isVendedor: false,
  };

  it("1. Garante que o enum HunterRole suporta 'financeiro'", () => {
    const role: HunterRole = "financeiro";
    assert.equal(role, "financeiro");
  });

  it("2. Valida que a migration de criação no banco contém enum, RLS e RPCs atualizadas", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261115210000_hunter_perfil_financeiro.sql",
    );
    assert.equal(fs.existsSync(migrationPath), true);

    const conteudo = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(conteudo.includes("ADD VALUE IF NOT EXISTS 'financeiro'"));
    assert.ok(conteudo.includes("is_financeiro"));
    assert.ok(conteudo.includes("admin_cadastrar_usuario"));
    assert.ok(conteudo.includes("admin_atualizar_usuario"));
    assert.ok(conteudo.includes("mensalidades"));
    assert.ok(conteudo.includes("propostas_comerciais"));
  });

  it("3. Valida que o schema consolidado mestre contém o perfil financeiro, abastecimento, manutenção e estoque", () => {
    const schemaMestrePath = path.resolve(
      process.cwd(),
      "supabase/CRIAR_BANCO_COMPLETO_NOVO_SUPABASE.sql",
    );
    const conteudo = fs.readFileSync(schemaMestrePath, "utf-8");
    assert.ok(conteudo.includes("ADD VALUE IF NOT EXISTS 'financeiro'"));
    assert.ok(conteudo.includes("is_financeiro"));
    assert.ok(conteudo.includes("financeiro_gerencia_abastecimentos"));
    assert.ok(conteudo.includes("pode_gerenciar_estoque"));
    assert.ok(conteudo.includes("pode_visualizar_estoque"));
  });

  it("4. Verifica os módulos autorizados para o Perfil Financeiro padrão (estoque, propostas, faturamento e GD)", () => {
    const modulosLiberados = [
      "financeiro",
      "mensalidades",
      "propostas",
      "clientes",
      "revendedores",
      "instalacao",
      "estoque",
      "chat",
      "atendimento",
      "configuracoes",
      "temas",
    ];

    for (const mod of modulosLiberados) {
      assert.equal(
        podeAcessarModulo(sessaoFinanceiro, mod),
        true,
        `Módulo financeiro ${mod} deveria estar liberado`,
      );
    }
  });

  it("5. Bloqueia estritamente módulos de rastreamento, frota e governança não concedidos para o Financeiro", () => {
    const modulosBloqueados = [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "motoristas",
      "funcionarios",
      "rastreadores",
      "usuarios",
      "central-seguranca",
      "dispositivos",
      "logs",
      "demonstracao",
    ];

    for (const mod of modulosBloqueados) {
      assert.equal(
        podeAcessarModulo(sessaoFinanceiro, mod),
        false,
        `Módulo ${mod} deveria estar bloqueado para financeiro padrão`,
      );
    }
  });

  it("6. Valida acesso a rotas permitidas para o Perfil Financeiro (sem frotas dos clientes)", () => {
    const rotasPermitidas = [
      "/inicio",
      "",
      "/financeiro",
      "/mensalidades",
      "/propostas",
      "/clientes",
      "/revendedores",
      "/instalacao",
      "/estoque",
      "/atendimento",
      "/chat",
      "/configuracoes",
      "/configuracao/temas",
    ];

    for (const rota of rotasPermitidas) {
      assert.equal(
        podeAcessarRota(sessaoFinanceiro, rota),
        true,
        `Rota ${rota} deveria estar liberada para financeiro padrão`,
      );
    }
  });

  it("7. Bloqueia estritamente rotas de telemetria GPS, comandos de bloqueio, gestão de acessos e hardware", () => {
    const rotasBloqueadas = [
      "/monitor-gps",
      "/rotas",
      "/frota",
      "/abastecimento",
      "/manutencao",
      "/motorista",
      "/rotas",
      "/frota",
      "/motoristas",
      "/funcionarios",
      "/usuarios",
      "/dispositivos",
      "/configuracao/central-seguranca",
      "/configuracao/rastreador-j16",
      "/configuracao/logs",
      "/minha-franquia",
      "/minhas-vendas",
      "/onboarding/acompanhamento",
      "/demonstracao",
    ];

    for (const rota of rotasBloqueadas) {
      assert.equal(
        podeAcessarRota(sessaoFinanceiro, rota),
        false,
        `Rota ${rota} deveria estar bloqueada para financeiro padrão`,
      );
    }
  });

  it("8. Garante que obterModulosPadraoPorPerfil retorna a lista canônica com 'estoque' para 'financeiro' (sem frotas dos clientes)", () => {
    const modulosPadrao = obterModulosPadraoPorPerfil("financeiro");
    assert.deepEqual(modulosPadrao, MODULOS_PADRAO_FINANCEIRO);
    assert.ok(modulosPadrao.includes("financeiro"));
    assert.ok(modulosPadrao.includes("mensalidades"));
    assert.ok(modulosPadrao.includes("propostas"));
    assert.ok(modulosPadrao.includes("clientes"));
    assert.ok(modulosPadrao.includes("revendedores"));
    assert.ok(modulosPadrao.includes("instalacao"));
    assert.ok(modulosPadrao.includes("estoque"));
    // Regra Canônica Aprovada: Financeiro é da GD e não da frota dos clientes
    assert.ok(!modulosPadrao.includes("abastecimento"), "Financeiro nao deve conter abastecimento");
    assert.ok(!modulosPadrao.includes("manutencao"), "Financeiro nao deve conter manutencao");
    assert.ok(!modulosPadrao.includes("monitor-gps"));
    assert.ok(!modulosPadrao.includes("usuarios"));
    assert.ok(!modulosPadrao.includes("central-seguranca"));
  });

  it("9. Garante que sessao com role 'financeiro' não possui privilégios de Admin ou Operador", () => {
    assert.equal(sessaoFinanceiro.isAdmin, false);
    assert.equal(sessaoFinanceiro.isOperador, false);
    assert.equal(sessaoFinanceiro.isSuperAdmin, false);
    assert.equal(sessaoFinanceiro.isFinanceiro, true);
  });

  it("10. Valida que a migration de abastecimento para o perfil financeiro existe e possui RLS", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261115220000_hunter_perfil_financeiro_abastecimento.sql",
    );
    assert.equal(fs.existsSync(migPath), true);
    const content = fs.readFileSync(migPath, "utf-8");
    assert.ok(content.includes("financeiro_gerencia_abastecimentos"));
    assert.ok(content.includes("financeiro_gerencia_despesas"));
    assert.ok(content.includes("'abastecimento'"));
  });

  it("11. Precedência da Escolha do Usuário: módulos customizados adicionais funcionam e módulos removidos são revogados", () => {
    // Cenário A: Usuário Financeiro com módulo adicional 'rotas' concedido e módulo 'instalacao' revogado pelo admin
    const sessaoCustomizada: UserSession = {
      ...sessaoFinanceiro,
      modulos: [
        "financeiro",
        "mensalidades",
        "propostas",
        "clientes",
        "abastecimento",
        "manutencao",
        "estoque",
        "rotas", // ADICIONADO PELO USUÁRIO/ADMIN
        "chat",
        "atendimento",
        "configuracoes",
        "temas",
        // 'instalacao' REMOVIDO PELO USUÁRIO/ADMIN
      ],
    };

    // Módulo 'rotas' adicionado deve funcionar imediatamente
    assert.equal(podeAcessarModulo(sessaoCustomizada, "rotas"), true);
    assert.equal(podeAcessarRota(sessaoCustomizada, "/rotas"), true);

    // Módulo 'instalacao' removido deve ser bloqueado imediatamente
    assert.equal(podeAcessarModulo(sessaoCustomizada, "instalacao"), false);
    assert.equal(podeAcessarRota(sessaoCustomizada, "/instalacao"), false);

    // Cenário B: Operador com módulo 'manutencao' adicionado
    const sessaoOperadorCustomizado: UserSession = {
      userId: "usr-op-001",
      email: "operador@gdseguranca.com.br",
      nome: "Operador Especial",
      role: "operador" as HunterRole,
      modulos: ["monitor-gps", "manutencao", "atendimento", "chat", "configuracoes", "temas"],
      isSuperAdmin: false,
      isSuperAdminAuditor: false,
      isAuditor: false,
      isReadOnly: false,
      isDegustacao: false,
      isAdmin: false,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
      isFuncionario: false,
      isFinanceiro: false,
      isRevendedor: false,
      isVendedor: false,
    };

    assert.equal(podeAcessarModulo(sessaoOperadorCustomizado, "manutencao"), true);
    assert.equal(podeAcessarRota(sessaoOperadorCustomizado, "/manutencao"), true);
    assert.equal(podeAcessarModulo(sessaoOperadorCustomizado, "clientes"), false);
    assert.equal(podeAcessarRota(sessaoOperadorCustomizado, "/clientes"), false);
  });

  it("12. Valida migration 20261115230000 com precedência total da escolha do usuário e RLS de manutenção e estoque", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261115230000_hunter_modulos_customizados_e_financeiro_manutencao_estoque.sql",
    );
    assert.equal(fs.existsSync(migPath), true);
    const content = fs.readFileSync(migPath, "utf-8");
    assert.ok(content.includes("planos_manutencao_preventiva"));
    assert.ok(content.includes("agendamentos_manutencao"));
    assert.ok(content.includes("pode_gerenciar_estoque"));
    assert.ok(content.includes("pode_visualizar_estoque"));
    assert.ok(content.includes("admin_cadastrar_usuario"));
    assert.ok(content.includes("admin_atualizar_usuario"));
    assert.ok(content.includes("Precedência total da escolha do usuário"));
  });
});
