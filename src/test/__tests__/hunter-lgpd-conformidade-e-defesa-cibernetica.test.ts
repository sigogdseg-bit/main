import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

describe("GD Segurança — LGPD (Lei nº 13.709/2018) e Defesa Cibernética", () => {
  const serverPath = path.resolve(process.cwd(), "src/server.ts");
  const serverContent = fs.readFileSync(serverPath, "utf-8");

  test("1. Servidor deve conter o módulo handleApiLgpd implementado", () => {
    assert.ok(
      serverContent.includes("async function handleApiLgpd"),
      "O servidor deve definir a função handleApiLgpd para atendimento do Art. 18 da LGPD",
    );
    assert.ok(
      serverContent.includes("handleApiLgpd(request, env)"),
      "O pipeline principal do servidor deve interceptar as rotas da LGPD",
    );
  });

  test("2. Endpoint /api/lgpd/solicitar deve implementar salvaguardas contra IDOR e injeção", () => {
    assert.ok(
      serverContent.includes('url.pathname === "/api/lgpd/solicitar"'),
      "Deve possuir rota formal /api/lgpd/solicitar",
    );
    assert.ok(
      serverContent.includes("tiposPermitidos"),
      "Deve validar estritamente o rol taxativo de solicitações permitidas",
    );
    assert.ok(
      serverContent.includes("userEmailAuth !== emailLimpo"),
      "Deve bloquear personificação conferindo e-mail autenticado quando houver sessão ativa (anti-IDOR)",
    );
    assert.ok(
      serverContent.includes("LGPD-"),
      "Deve gerar protocolo único rastreável com prefixo LGPD",
    );
  });

  test("3. Endpoint /api/lgpd/consultar deve implementar DLP e mascaramento de dados", () => {
    assert.ok(
      serverContent.includes('url.pathname === "/api/lgpd/consultar"'),
      "Deve possuir rota /api/lgpd/consultar",
    );
    assert.ok(
      serverContent.includes("titular_documento_mascarado"),
      "Deve ofuscar o documento do titular na consulta para evitar vazamento",
    );
    assert.ok(
      serverContent.includes("titular_email_mascarado"),
      "Deve ofuscar o e-mail do titular na consulta pública de protocolo",
    );
  });

  test("4. Endpoint /api/lgpd/tramitar deve exigir perfil administrativo estrito (RBAC)", () => {
    assert.ok(
      serverContent.includes('url.pathname === "/api/lgpd/tramitar"'),
      "Deve possuir rota administrativa /api/lgpd/tramitar",
    );
    assert.ok(
      serverContent.includes("rolesAdmin"),
      "Deve restringir a tramitação a superadmin, adm e superadmin_auditor",
    );
    assert.ok(
      serverContent.includes("tramitacao_lgpd_executada"),
      "Deve registrar trilha forense imutável em system_activity_logs",
    );
  });

  test("5. Endpoint /api/lgpd/meus-dados deve garantir direito de acesso do titular (Art. 18, II)", () => {
    assert.ok(
      serverContent.includes('url.pathname === "/api/lgpd/meus-dados"'),
      "Deve possuir rota /api/lgpd/meus-dados para espelho do titular",
    );
    assert.ok(
      serverContent.includes("acesso_dados_titular_lgpd"),
      "Deve registrar auditoria do acesso realizado pelo titular",
    );
  });

  test("6. Tabela public.lgpd_solicitacoes deve existir no catálogo de segurança e migrations", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261018140000_hunter_dev_modulos_seg_suite.sql",
    );
    const migracaoSql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      migracaoSql.includes("CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes"),
      "A tabela lgpd_solicitacoes deve existir no schema do banco",
    );
    assert.ok(
      migracaoSql.includes("ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY"),
      "A tabela de solicitações LGPD deve possuir RLS ativo",
    );
  });

  test("7. Regra Pétrea Hunter-Guardian: Ausência estrita do caractere comercial proibido no módulo LGPD", () => {
    const trechoLgpd = serverContent.slice(
      serverContent.indexOf("async function handleApiLgpd"),
      serverContent.indexOf("async function handleApiConvites"),
    );
    const linhas = trechoLgpd.split("\n");
    const violacoes = linhas.filter(
      (l) => !l.includes("&&") && (l.includes(" & ") || l.includes(" &") || l.includes("& ")),
    );
    assert.equal(
      violacoes.length,
      0,
      `Proibido o uso do caractere comercial isolado nas linhas: ${violacoes.join(" | ")}`,
    );
  });
});
