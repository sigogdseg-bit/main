import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Restauração de Veículos, Postos e Dropdown de Clientes", () => {
  const rootDir = process.cwd();

  const caminhoServer = path.join(rootDir, "src/server.ts");
  const caminhoGpsService = path.join(rootDir, "src/features/monitor-gps/services/gpsService.ts");
  const caminhoGpsMonitor = path.join(
    rootDir,
    "src/features/monitor-gps/components/GpsMonitorView.tsx",
  );
  const caminhoClienteHome = path.join(
    rootDir,
    "src/features/clientes/components/ClienteHomeView.tsx",
  );
  const caminhoManutencaoService = path.join(
    rootDir,
    "src/features/manutencao/services/manutencaoService.ts",
  );
  const caminhoVigilanteService = path.join(
    rootDir,
    "src/features/vigilantes/services/vigilanteService.ts",
  );

  test("1. Rota /api/veiculos/monitor e gpsService: Consulta resiliente sem quebra de coluna tipo_medicao", () => {
    assert.ok(fs.existsSync(caminhoServer), "src/server.ts deve existir");
    const conteudoServer = fs.readFileSync(caminhoServer, "utf-8");

    // Na consulta SQL principal de veiculos/monitor não deve solicitar tipo_medicao diretamente
    // para evitar erro 500 no Supabase caso a migration não tenha sido executada
    const trechoMonitor = conteudoServer.slice(
      conteudoServer.indexOf('url.pathname === "/api/veiculos/monitor"'),
      conteudoServer.indexOf("const { data: veiculosFrota"),
    );
    assert.ok(
      !trechoMonitor.includes("tipo_medicao,"),
      "Consulta veiculos/monitor não deve solicitar tipo_medicao diretamente no select SQL",
    );
    assert.ok(
      trechoMonitor.includes("horimetro_modo,"),
      "Consulta veiculos/monitor deve consultar horimetro_modo nativo",
    );

    // No gpsService.ts
    assert.ok(fs.existsSync(caminhoGpsService), "gpsService.ts deve existir");
    const conteudoGps = fs.readFileSync(caminhoGpsService, "utf-8");
    const idxInicio = conteudoGps.indexOf('from("veiculos")');
    const idxFim = conteudoGps.indexOf('.order("placa"', idxInicio);
    const trechoSelectGps = conteudoGps.slice(idxInicio, idxFim);
    assert.ok(
      !trechoSelectGps.includes("tipo_medicao,"),
      "gpsService.ts não deve solicitar tipo_medicao diretamente no select SQL",
    );
    assert.ok(
      trechoSelectGps.includes("horimetro_modo,"),
      "gpsService.ts deve solicitar horimetro_modo nativo no select SQL",
    );
  });

  test("2. GpsMonitorView: Carregamento de clientes cadastrados e eliminação do fallback 'Cliente da Base'", () => {
    assert.ok(fs.existsSync(caminhoGpsMonitor), "GpsMonitorView.tsx deve existir");
    const conteudo = fs.readFileSync(caminhoGpsMonitor, "utf-8");

    assert.ok(
      conteudo.includes("carregarClientes"),
      "GpsMonitorView deve importar e chamar carregarClientes para popular o dropdown",
    );
    assert.ok(
      !conteudo.includes('"Cliente da Base"'),
      "GpsMonitorView NÃO deve exibir o texto estático 'Cliente da Base' no dropdown",
    );
    assert.ok(
      conteudo.includes("clientesBase.forEach"),
      "listaClientesUnicos deve ser populada com os clientes cadastrados da base",
    );
  });

  test("3. ClienteHomeView: Dropdown de clientes para perfil Administrador e Operador", () => {
    assert.ok(fs.existsSync(caminhoClienteHome), "ClienteHomeView.tsx deve existir");
    const conteudo = fs.readFileSync(caminhoClienteHome, "utf-8");

    assert.ok(
      conteudo.includes("clienteFiltroSelecionado"),
      "ClienteHomeView deve conter estado clienteFiltroSelecionado",
    );
    assert.ok(
      conteudo.includes("carregarClientes"),
      "ClienteHomeView deve carregar a lista de clientes para ADM/Operador",
    );
    assert.ok(
      conteudo.includes("Todos os Clientes"),
      "ClienteHomeView deve possuir opção 'Todos os Clientes' na lista suspensa",
    );
    assert.ok(
      conteudo.includes("postosFixosFiltrados"),
      "ClienteHomeView deve filtrar as propriedades monitoradas pelo cliente selecionado",
    );
  });

  test("4. ManutencaoService e VigilanteService: Resiliência contra colunas inexistentes e token de autenticação", () => {
    const conteudoManutencao = fs.readFileSync(caminhoManutencaoService, "utf-8");
    assert.ok(
      !conteudoManutencao.includes("tipo_medicao,\n          odometro_km"),
      "manutencaoService não deve ter tipo_medicao no select SQL",
    );

    const conteudoVigilante = fs.readFileSync(caminhoVigilanteService, "utf-8");
    assert.ok(
      conteudoVigilante.includes("obterSessaoCacheada"),
      "vigilanteService deve consultar a sessão cacheada para obter o token de autenticação",
    );
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido isolado", () => {
    const arquivos = [
      caminhoServer,
      caminhoGpsService,
      caminhoGpsMonitor,
      caminhoClienteHome,
      caminhoManutencaoService,
      caminhoVigilanteService,
    ];
    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(arq, "utf-8");
      const linhas = conteudo.split("\n");
      linhas.forEach((linha, idx) => {
        // Ignora operadores lógicos (&&), entidades HTML (&amp;) ou comentários com URL
        if (
          linha.includes(" && ") ||
          linha.includes("&amp;") ||
          linha.includes("//") ||
          linha.includes("/*")
        ) {
          return;
        }
        assert.ok(
          !/\s+&\s+/.test(linha),
          `Arquivo ${path.basename(arq)} linha ${idx + 1} contém caractere comercial isolado proibido`,
        );
      });
    }
  });
});
