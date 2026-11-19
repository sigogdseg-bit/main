import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

describe("Hunter — Infográficos como Filtros Interativos e Perfil Locatário", () => {
  it("1. ClienteHomeView.tsx deve implementar infográficos como botões de filtro clicáveis", () => {
    const caminho = path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(conteudo.includes("filtroStatus"), "Deve declarar estado filtroStatus");
    assert.ok(
      conteudo.includes('setFiltroStatus("todos")'),
      "Deve permitir filtrar por todos os veículos",
    );
    assert.ok(
      conteudo.includes('setFiltroStatus(filtroStatus === "online" ? "todos" : "online")'),
      "Deve permitir filtrar/alternar veículos online",
    );
    assert.ok(
      conteudo.includes('setFiltroStatus(filtroStatus === "offline" ? "todos" : "offline")'),
      "Deve permitir filtrar/alternar veículos offline",
    );
    assert.ok(
      conteudo.includes('setFiltroStatus(filtroStatus === "alertas" ? "todos" : "alertas")'),
      "Deve permitir filtrar/alternar veículos com alertas",
    );
    assert.ok(
      conteudo.includes("ring-emerald-300"),
      "Deve aplicar feedback visual com destaque para filtro online",
    );
  });

  it("2. ClienteHomeView.tsx deve proteger informações financeiras para o perfil Locatário", () => {
    const caminho = path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(conteudo.includes("isLocatario"), "Deve verificar se o usuário é locatário");
    assert.ok(
      conteudo.includes("mensalidadePendente && !isLocatario"),
      "Deve ocultar alerta de mensalidade para perfil locatário",
    );
  });

  it("3. Backend server.ts deve implementar handleApiLocatarios com endpoints e RLS", () => {
    const caminho = path.join(rootDir, "src/server.ts");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes("handleApiLocatarios"),
      "Deve implementar função handleApiLocatarios",
    );
    assert.ok(
      conteudo.includes("/api/locatarios/validar-convite"),
      "Deve implementar validação pública de link de convite",
    );
    assert.ok(
      conteudo.includes("/api/locatarios/concluir-auto-cadastro"),
      "Deve implementar auto-cadastro do locatário",
    );
    assert.ok(
      conteudo.includes("/api/locatarios/gerar-link-convite"),
      "Deve implementar geração de link de convite pelo cliente titular",
    );
    assert.ok(
      conteudo.includes("/api/locatarios/bloquear"),
      "Deve implementar bloqueio e desbloqueio de acesso do locatário",
    );
    assert.ok(
      conteudo.includes("/api/locatarios/resetar-senha"),
      "Deve implementar redefinição segura de senha do locatário",
    );
  });

  it("4. Backend server.ts deve filtrar veículos estritamente autorizados para o perfil Locatário", () => {
    const caminho = path.join(rootDir, "src/server.ts");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes('role === "locatario"'),
      "Deve verificar role locatario na rota de veículos do monitor",
    );
    assert.ok(
      conteudo.includes("veiculos_permitidos"),
      "Deve consultar e restringir aos veiculos_permitidos",
    );
  });

  it("5. Gateway de comandos deve blindar comandos de bloqueio e desbloqueio de forma estritamente independente", () => {
    const caminho = path.join(rootDir, "src/server.ts");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes('userRole === "locatario"'),
      "Deve validar perfil locatario no gateway de comandos",
    );
    assert.ok(
      conteudo.includes("pode_bloquear"),
      "Deve checar permissão independente pode_bloquear",
    );
    assert.ok(
      conteudo.includes("pode_desbloquear"),
      "Deve checar permissão independente pode_desbloquear",
    );
    assert.ok(
      conteudo.includes("ehComandoBloqueio(comandoTexto)"),
      "Deve identificar comandos de bloqueio individualmente",
    );
    assert.ok(
      conteudo.includes("ehComandoDesbloqueio(comandoTexto)"),
      "Deve identificar comandos de desbloqueio individualmente",
    );
  });

  it("6. Funções utilitárias de hardware devem discriminar bloqueio e desbloqueio com independência estrita", async () => {
    const { ehComandoBloqueio, ehComandoDesbloqueio } =
      await import("../../shared/lib/hunterHardwareComandos");

    // Bloqueios
    assert.equal(ehComandoBloqueio("RELAY,1"), true);
    assert.equal(ehComandoBloqueio("RELAY,1#"), true);
    assert.equal(ehComandoBloqueio("DYD"), true);
    assert.equal(ehComandoBloqueio("DYD,000000"), true);
    assert.equal(ehComandoBloqueio("STOP123456"), true);

    // Desbloqueios NÃO devem ser reconhecidos como bloqueio
    assert.equal(ehComandoBloqueio("RELAY,0"), false);
    assert.equal(ehComandoBloqueio("HFYD"), false);
    assert.equal(ehComandoBloqueio("RESUME123456"), false);

    // Desbloqueios
    assert.equal(ehComandoDesbloqueio("RELAY,0"), true);
    assert.equal(ehComandoDesbloqueio("RELAY,0#"), true);
    assert.equal(ehComandoDesbloqueio("HFYD"), true);
    assert.equal(ehComandoDesbloqueio("HFYD,000000"), true);
    assert.equal(ehComandoDesbloqueio("RESUME123456"), true);

    // Bloqueios NÃO devem ser reconhecidos como desbloqueio
    assert.equal(ehComandoDesbloqueio("RELAY,1"), false);
    assert.equal(ehComandoDesbloqueio("DYD"), false);
    assert.equal(ehComandoDesbloqueio("STOP123456"), false);
  });

  it("7. GpsMonitorView.tsx deve conter lista suspensa de clientes para ADM e Operador (padrão todos)", () => {
    const caminho = path.join(rootDir, "src/features/monitor-gps/components/GpsMonitorView.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes("clienteFiltroSelecionado"),
      "Deve declarar estado clienteFiltroSelecionado com padrão todos",
    );
    assert.ok(
      conteudo.includes("listaClientesUnicos"),
      "Deve extrair e agrupar dinamicamente listaClientesUnicos",
    );
    assert.ok(
      conteudo.includes("Todos os Clientes"),
      "Deve possuir opção padrão 'Todos os Clientes'",
    );
    assert.ok(
      conteudo.includes("isOperadorOuAdmin"),
      "Deve exibir seletor estritamente para perfis de gestão (ADM e Operador)",
    );
  });

  it("8. ClienteHomeView.tsx deve integrar o ModalGerenciarLocatarios e seção de postos fixos", () => {
    const caminho = path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes("ModalGerenciarLocatarios"),
      "Deve importar e renderizar ModalGerenciarLocatarios",
    );
    assert.ok(
      conteudo.includes("modalLocatariosAberto"),
      "Deve controlar estado modalLocatariosAberto",
    );
    assert.ok(
      conteudo.includes("secao-postos-fixos"),
      "Deve renderizar seção secao-postos-fixos para propriedades monitoradas do cliente",
    );
    assert.ok(
      conteudo.includes("carregarPostosVigilancia"),
      "Deve carregar postos fixos do cliente autenticado",
    );
  });

  it("9. Rota pública /cadastro-locatario deve existir e validar convite com campos independentes", () => {
    const caminho = path.join(rootDir, "src/routes/cadastro-locatario.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes('createFileRoute("/cadastro-locatario")'),
      "Deve criar rota TanStack /cadastro-locatario",
    );
    assert.ok(conteudo.includes("validarConviteLocatario"), "Deve invocar validarConviteLocatario");
    assert.ok(
      conteudo.includes("concluirAutoCadastroLocatario"),
      "Deve invocar concluirAutoCadastroLocatario",
    );
    assert.ok(conteudo.includes("pode_bloquear"), "Deve exibir permissão independente de bloqueio");
    assert.ok(
      conteudo.includes("pode_desbloquear"),
      "Deve exibir permissão independente de desbloqueio",
    );
  });

  it("10. ModalNovoPosto.tsx deve vincular compulsoriamente cada posto fixo a um cliente", () => {
    const caminho = path.join(rootDir, "src/features/vigilantes/components/ModalNovoPosto.tsx");
    const conteudo = fs.readFileSync(caminho, "utf-8");

    assert.ok(
      conteudo.includes("clienteId"),
      "Deve conter estado clienteId para seleção do cliente titular",
    );
    assert.ok(
      conteudo.includes("Cliente Titular da Propriedade (Posto Fixo)"),
      "Deve exibir label explícito de vínculo do posto ao cliente",
    );
    assert.ok(
      conteudo.includes("salvarPostoVigilancia"),
      "Deve persistir cliente_id ao salvar posto de vigilância",
    );
  });

  it("12. Dropdown de locatários deve existir e filtrar veículos para clientes com locatários em ClienteHomeView e GpsMonitorView", () => {
    const homeConteudo = fs.readFileSync(
      path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx"),
      "utf-8",
    );
    assert.ok(
      homeConteudo.includes("locatarios.length > 0"),
      "ClienteHomeView deve exibir dropdown estritamente se houver locatários cadastrados",
    );
    assert.ok(
      homeConteudo.includes("locatarioFiltroSelecionado"),
      "ClienteHomeView deve manter estado locatarioFiltroSelecionado",
    );
    assert.ok(
      homeConteudo.includes("Todos os Locatários"),
      "ClienteHomeView deve ter opção padrão 'Todos os Locatários'",
    );

    const gpsConteudo = fs.readFileSync(
      path.join(rootDir, "src/features/monitor-gps/components/GpsMonitorView.tsx"),
      "utf-8",
    );
    assert.ok(
      gpsConteudo.includes("locatariosCliente.length > 0"),
      "GpsMonitorView deve exibir dropdown se o cliente selecionado/titular tiver locatários",
    );
    assert.ok(
      gpsConteudo.includes("locatarioFiltroSelecionado"),
      "GpsMonitorView deve manter estado locatarioFiltroSelecionado",
    );
    assert.ok(
      gpsConteudo.includes("Todos os Locatários"),
      "GpsMonitorView deve ter opção padrão 'Todos os Locatários'",
    );
  });

  it("13. Gate 5: Proibição estrita de caractere comercial em arquivos alterados e novos", () => {
    const arquivos = [
      "src/features/clientes/components/ClienteHomeView.tsx",
      "src/shared/lib/hunterHardwareComandos.ts",
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
      "src/routes/cadastro-locatario.tsx",
      "src/features/locatarios/components/ModalGerenciarLocatarios.tsx",
      "src/features/locatarios/services/locatarioService.ts",
      "src/features/locatarios/types.ts",
      "src/features/vigilantes/components/ModalNovoPosto.tsx",
    ];

    arquivos.forEach((rel) => {
      const conteudo = fs.readFileSync(path.join(rootDir, rel), "utf-8");
      // Remove operadores lógicos legítimos &&
      const semOperadoresLogicos = conteudo.replace(/&&/g, "");
      // Remove entidades HTML seguras
      const semEntidades = semOperadoresLogicos.replace(/&(amp|lt|gt|quot|apos|copy);/g, "");

      const matches = semEntidades.match(/&/g);
      assert.equal(
        matches,
        null,
        `Arquivo ${rel} não deve conter caractere comercial proibido isolado: ${matches}`,
      );
    });
  });
});
