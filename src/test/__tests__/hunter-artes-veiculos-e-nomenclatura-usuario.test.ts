import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Artes Canônicas de Veículos (dev-modulos) e Nomenclatura Usuário", () => {
  const rootDir = process.cwd();

  it("1. Catálogo de 17 artes canônicas deve existir em public/veiculos e public/vtrs", () => {
    const artesEsperadas = [
      "ambulancia.png",
      "barco.png",
      "caminhao.png",
      "camionete.png",
      "carro.png",
      "jetski.png",
      "maquina.png",
      "moto.png",
      "moto_eletrica.png",
      "nautica.png",
      "onibus.png",
      "quadriciclo.png",
      "suv.png",
      "van.png",
      "vtr-carro.png",
      "vtr-moto.png",
      "vtr-reboque.png",
    ];

    for (const arte of artesEsperadas) {
      assert.ok(
        fs.existsSync(path.join(rootDir, "public/veiculos", arte)),
        `Arte public/veiculos/${arte} deve existir`,
      );
      assert.ok(
        fs.existsSync(path.join(rootDir, "public/vtrs", arte)),
        `Arte public/vtrs/${arte} deve existir`,
      );
    }
  });

  it("2. VehiclePhotoPlaceholder deve suportar todas as novas categorias do dev-modulos", () => {
    const conteudo = fs.readFileSync(
      path.join(rootDir, "src/shared/components/VehiclePhotoPlaceholder.tsx"),
      "utf-8",
    );

    const categoriasObrigatorias = [
      "ambulancia",
      "maquina",
      "jetski",
      "barco",
      "nautica",
      "quadriciclo",
      "moto_eletrica",
      "camionete",
      "carro",
      "suv",
      "moto",
      "caminhao",
      "van",
      "onibus",
    ];

    for (const cat of categoriasObrigatorias) {
      assert.ok(
        conteudo.includes(`"/veiculos/${cat}.png"`),
        `VehiclePhotoPlaceholder deve mapear /veiculos/${cat}.png`,
      );
    }
  });

  it("3. ClienteHomeView e GpsMonitorView devem exibir nomenclatura 'Usuário' em vez de 'Locatário'", () => {
    const home = fs.readFileSync(
      path.join(rootDir, "src/features/clientes/components/ClienteHomeView.tsx"),
      "utf-8",
    );
    assert.ok(
      home.includes("Todos os Usuários"),
      "ClienteHomeView deve exibir 'Todos os Usuários'",
    );
    assert.ok(
      home.includes("Gerenciar Usuários"),
      "ClienteHomeView deve exibir 'Gerenciar Usuários'",
    );
    assert.ok(
      home.includes("Filtrar veículos por usuário"),
      "ClienteHomeView deve ter tooltip atualizado",
    );

    const gps = fs.readFileSync(
      path.join(rootDir, "src/features/monitor-gps/components/GpsMonitorView.tsx"),
      "utf-8",
    );
    assert.ok(gps.includes("Usuário:"), "GpsMonitorView deve exibir label 'Usuário:'");
    assert.ok(gps.includes("Todos os Usuários"), "GpsMonitorView deve exibir 'Todos os Usuários'");
  });

  it("4. ModalGerenciarLocatarios e cadastro-locatario devem adotar nomenclatura 'Usuário' na interface", () => {
    const modal = fs.readFileSync(
      path.join(rootDir, "src/features/locatarios/components/ModalGerenciarLocatarios.tsx"),
      "utf-8",
    );
    assert.ok(modal.includes("Gestão de Usuários"), "Modal deve ter título 'Gestão de Usuários'");
    assert.ok(modal.includes("Usuários Cadastrados"), "Modal deve ter aba 'Usuários Cadastrados'");
    assert.ok(modal.includes("Nome do Usuário"), "Modal deve ter label 'Nome do Usuário'");

    const cadastro = fs.readFileSync(
      path.join(rootDir, "src/routes/cadastro-locatario.tsx"),
      "utf-8",
    );
    assert.ok(
      cadastro.includes("Ativação de Acesso de Usuário"),
      "Página pública de cadastro deve exibir 'Ativação de Acesso de Usuário'",
    );
  });

  it("5. Gate 5: Ausência estrita do caractere comercial proibido isolado nos componentes atualizados", () => {
    const arquivos = [
      "src/shared/components/VehiclePhotoPlaceholder.tsx",
      "src/features/clientes/components/ClienteHomeView.tsx",
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
      "src/features/locatarios/components/ModalGerenciarLocatarios.tsx",
      "src/routes/cadastro-locatario.tsx",
      "src/features/locatarios/services/locatarioService.ts",
    ];

    arquivos.forEach((rel) => {
      const conteudo = fs.readFileSync(path.join(rootDir, rel), "utf-8");
      const semOperadoresLogicos = conteudo.replace(/&&/g, "");
      const semEntidades = semOperadoresLogicos.replace(/&(amp|lt|gt|quot|apos|copy);/g, "");
      const matches = semEntidades.match(/&/g);
      assert.equal(
        matches,
        null,
        `Arquivo ${rel} não deve conter caractere comercial isolado: ${matches}`,
      );
    });
  });
});
