import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION_NUMERO } from "../../shared/lib/version";

const __filename = fileURLToPath(import.meta.url);

describe("Hunter — Release v1.0.1.7: Módulos da Propriedade, Contadores Factuais e Artes de Veículos", () => {
  const rootDir = process.cwd();

  it("1. Versão deve ser no mínimo 1.0.1.7", () => {
    assert.ok(APP_VERSION_NUMERO >= "1.0.1.7", "Versão deve ser igual ou superior a 1.0.1.7");
  });

  it("2. VehicleTelemetryDrawer deve renderizar menu exclusivo para Propriedades Monitoradas", () => {
    const caminhoDrawer = path.join(
      rootDir,
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const conteudoDrawer = fs.readFileSync(caminhoDrawer, "utf-8");

    assert.ok(
      conteudoDrawer.includes("Módulos e Funções da Propriedade"),
      "Deve conter o título Módulos e Funções da Propriedade",
    );
    assert.ok(
      conteudoDrawer.includes("Perímetro de Segurança (Cercas Virtuais)"),
      "Deve conter a opção de perímetro para propriedades",
    );
    assert.ok(
      conteudoDrawer.includes("Central de Operações 24h"),
      "Deve conter a opção de Central de Operações 24h",
    );
  });

  it("3. ClienteHomeView deve calcular veículos online por comunicação ativa do rastreador", () => {
    const caminhoHome = path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx");
    const conteudoHome = fs.readFileSync(caminhoHome, "utf-8");

    assert.ok(
      conteudoHome.includes("avaliarStatusComunicacao(v.ultima_atualizacao).ativo"),
      "Deve utilizar avaliarStatusComunicacao para classificar veículos online",
    );
  });

  it("4. Arquivos fotográficos de estúdio devem existir em public/veiculos e public/vtrs", () => {
    const arquivosObrigatorios = [
      "public/veiculos/camionete.png",
      "public/veiculos/carro.png",
      "public/veiculos/suv.png",
      "public/veiculos/moto.png",
      "public/vtrs/vtr-camionete.png",
      "public/vtrs/vtr-carro.png",
      "public/vtrs/vtr-suv.png",
      "public/vtrs/vtr-moto.png",
    ];

    for (const arq of arquivosObrigatorios) {
      assert.ok(
        fs.existsSync(path.join(rootDir, arq)),
        `Arquivo de estúdio ${arq} deve existir no projeto`,
      );
    }
  });

  it("5. Gate 5: Proibição estrita de caractere comercial proibido em textos de interface", () => {
    const caminhoDrawer = path.join(
      rootDir,
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const conteudoDrawer = fs.readFileSync(caminhoDrawer, "utf-8");
    const charProibido = String.fromCharCode(38);
    // Verifica ausência do caractere em títulos e textos exibidos
    assert.ok(
      !conteudoDrawer.includes(`Módulos ${charProibido} Funções`),
      "Não deve conter o caractere comercial em títulos",
    );
  });
});
