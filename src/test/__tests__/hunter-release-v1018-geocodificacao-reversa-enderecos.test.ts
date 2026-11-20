import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { APP_VERSION_NUMERO } from "../../shared/lib/version";

describe("Hunter — Release v1.0.1.8: Geocodificação Reversa e Endereço Legível nos Cards de Veículos", () => {
  const rootDir = process.cwd();

  it("1. Versão deve ser rigorosamente incrementada para 1.0.1.8 ou superior", () => {
    assert.ok(APP_VERSION_NUMERO >= "1.0.1.8");
  });

  it("2. HunterVehicleCard deve exibir endereço legível e NUNCA expor coordenadas brutas (Lat/Lon)", () => {
    const caminhoCard = path.join(
      rootDir,
      "src/features/clientes/components/HunterVehicleCard.tsx",
    );
    const conteudoCard = fs.readFileSync(caminhoCard, "utf-8");

    // Proibição estrita da interpolação de latitude/longitude na linha de localização
    assert.ok(
      !conteudoCard.includes("Lat ${veiculo.latitude"),
      "Não pode interpolar 'Lat ${veiculo.latitude}' no texto de localização",
    );
    assert.ok(
      !conteudoCard.includes("Lon ${veiculo.longitude"),
      "Não pode interpolar 'Lon ${veiculo.longitude}' no texto de localização",
    );

    // Deve integrar obterEnderecoPorCoordenadas e estado enderecoLocal
    assert.ok(
      conteudoCard.includes("obterEnderecoPorCoordenadas"),
      "Deve importar e utilizar obterEnderecoPorCoordenadas",
    );
    assert.ok(
      conteudoCard.includes("enderecoLocal"),
      "Deve gerenciar o estado reativo enderecoLocal",
    );
    assert.ok(
      conteudoCard.includes("Identificando endereço..."),
      "Deve exibir placeholder amigável enquanto identifica o endereço",
    );
  });

  it("3. ClienteHomeView deve repassar enderecoTexto e pré-carregar endereços dos veículos", () => {
    const caminhoHome = path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx");
    const conteudoHome = fs.readFileSync(caminhoHome, "utf-8");

    assert.ok(
      conteudoHome.includes("enderecosMap"),
      "Deve manter o mapa reativo de endereços geocodificados",
    );
    assert.ok(
      conteudoHome.includes("enderecoTexto={enderecosMap[v.id]}"),
      "Deve repassar enderecoTexto={enderecosMap[v.id]} para os cards dos veículos",
    );
    assert.ok(
      conteudoHome.includes("obterEnderecoPorCoordenadas"),
      "Deve invocar obterEnderecoPorCoordenadas no pré-carregamento dos veículos",
    );
  });

  it("4. Backend server.ts deve implementar endpoint /api/geocodificar com suporte a lat e lon", () => {
    const caminhoServer = path.join(rootDir, "src/server.ts");
    const conteudoServer = fs.readFileSync(caminhoServer, "utf-8");

    assert.ok(
      conteudoServer.includes("handleApiGeocodificar"),
      "Deve conter a função handleApiGeocodificar",
    );
    assert.ok(
      conteudoServer.includes('url.searchParams.get("lat")'),
      "Deve extrair o parâmetro lat da query string",
    );
    assert.ok(
      conteudoServer.includes('url.searchParams.get("lon")'),
      "Deve extrair o parâmetro lon da query string",
    );
    assert.ok(
      conteudoServer.includes("GD-Seguranca-Geocoding"),
      "Deve incluir User-Agent auditado e institucional",
    );
  });

  it("5. compartilhamentoService deve chamar rota interna de mesma origem sem risco de CORS", () => {
    const caminhoServico = path.join(
      rootDir,
      "src/features/monitor-gps/services/compartilhamentoService.ts",
    );
    const conteudoServico = fs.readFileSync(caminhoServico, "utf-8");

    assert.ok(
      conteudoServico.includes("/api/geocodificar"),
      "Deve priorizar a rota interna de mesma origem /api/geocodificar",
    );
    assert.ok(
      !conteudoServico.includes("Lat: ${lat.toFixed(5)}"),
      "Não pode retornar string bruta de coordenadas como fallback",
    );
    assert.ok(
      conteudoServico.includes("Localização em monitoramento"),
      "Deve utilizar fallback amigável 'Localização em monitoramento'",
    );
  });

  it("6. Gate 5: Proibição estrita de caractere comercial proibido nos arquivos alterados", () => {
    const arquivosVerificar = [
      "src/features/clientes/components/HunterVehicleCard.tsx",
      "src/features/clientes/components/ClienteHomeView.tsx",
      "src/features/monitor-gps/services/compartilhamentoService.ts",
    ];
    const regexAmpersandProibido = /(?<!&)&(?!&)/;

    for (const arq of arquivosVerificar) {
      const conteudo = fs.readFileSync(path.join(rootDir, arq), "utf-8");
      const linhas = conteudo.split("\n");
      linhas.forEach((linha, idx) => {
        const linhaSemDuplo = linha.replace(/&&/g, "");
        assert.ok(
          !regexAmpersandProibido.test(linhaSemDuplo),
          `Violação de Gate 5 em ${arq}:${idx + 1}: ${linha}`,
        );
      });
    }
  });
});
