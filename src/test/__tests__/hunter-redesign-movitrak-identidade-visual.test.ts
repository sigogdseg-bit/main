import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Redesign de Identidade Visual e Experiência do Cliente (Padrão Movitrak / Unslop)", () => {
  const caminhoPlacaMercosul = path.resolve(
    process.cwd(),
    "src/shared/components/PlacaMercosulBadge.tsx",
  );
  const caminhoVehiclePhoto = path.resolve(
    process.cwd(),
    "src/shared/components/VehiclePhotoPlaceholder.tsx",
  );
  const caminhoHunterCard = path.resolve(
    process.cwd(),
    "src/features/clientes/components/HunterVehicleCard.tsx",
  );
  const caminhoClienteHome = path.resolve(
    process.cwd(),
    "src/features/clientes/components/ClienteHomeView.tsx",
  );
  const caminhoModalPix = path.resolve(
    process.cwd(),
    "src/features/mensalidades/components/ModalPixRapido.tsx",
  );
  const caminhoMobileNav = path.resolve(
    process.cwd(),
    "src/features/layout/components/MobileBottomNav.tsx",
  );
  const caminhoInicioHub = path.resolve(
    process.cwd(),
    "src/features/inicio/components/InicioHubView.tsx",
  );

  it("1. PlacaMercosulBadge deve existir e conter faixa azul, inscrição BRASIL e bandeira", () => {
    assert.ok(fs.existsSync(caminhoPlacaMercosul), "PlacaMercosulBadge deve existir no shared");
    const conteudo = fs.readFileSync(caminhoPlacaMercosul, "utf-8");
    assert.ok(conteudo.includes("#003399"), "Deve conter o azul oficial do Mercosul");
    assert.ok(conteudo.includes("BRASIL"), "Deve conter a inscrição 'BRASIL'");
    assert.ok(conteudo.includes("bandeira"), "Deve conter a bandeira nacional estilizada");
    assert.ok(conteudo.includes("font-mono"), "Deve utilizar fonte mono/tabular para os dígitos");
  });

  it("2. VehiclePhotoPlaceholder deve suportar foto real e render de estúdio fotográfico por categoria", () => {
    assert.ok(fs.existsSync(caminhoVehiclePhoto), "VehiclePhotoPlaceholder deve existir");
    const conteudo = fs.readFileSync(caminhoVehiclePhoto, "utf-8");
    assert.ok(conteudo.includes("fotoUrl"), "Deve suportar fotoUrl real do veículo");
    assert.ok(conteudo.includes("gradienteMoto"), "Deve conter render tático para motocicletas");
    assert.ok(conteudo.includes("gradienteCarro"), "Deve conter render tático para carros");
    assert.ok(
      conteudo.includes("gradientePicape"),
      "Deve conter render tático para picapes/camionetes",
    );
    assert.ok(conteudo.includes("gradienteCaminhao"), "Deve conter render tático para caminhões");
  });

  it("3. HunterVehicleCard deve exibir foto, placa Mercosul sobreposta, status e grid 2x2", () => {
    assert.ok(fs.existsSync(caminhoHunterCard), "HunterVehicleCard deve existir");
    const conteudo = fs.readFileSync(caminhoHunterCard, "utf-8");
    assert.ok(
      conteudo.includes("PlacaMercosulBadge"),
      "Deve integrar o PlacaMercosulBadge sobreposto",
    );
    assert.ok(conteudo.includes("Online"), "Deve conter badge de Online/Offline");
    assert.ok(conteudo.includes("Atualizado"), "Deve exibir tempo de atualização no grid");
    assert.ok(
      conteudo.includes("Velocidade") || conteudo.includes("Ritmo"),
      "Deve exibir velocidade/ritmo",
    );
    assert.ok(conteudo.includes("Rastreador"), "Deve exibir bateria do rastreador");
    assert.ok(
      conteudo.includes("Ignição") || conteudo.includes("Atividade"),
      "Deve exibir status de ignição",
    );
    assert.ok(conteudo.includes("Localização"), "Deve exibir linha de localização em texto");
  });

  it("4. ClienteHomeView deve fornecer saudação, contadores em pílulas, veículos e acionamento PIX", () => {
    assert.ok(fs.existsSync(caminhoClienteHome), "ClienteHomeView deve existir");
    const conteudo = fs.readFileSync(caminhoClienteHome, "utf-8");
    assert.ok(
      conteudo.includes("Bem-vindo de volta"),
      "Deve conter saudação acolhedora personalizada",
    );
    assert.ok(conteudo.includes("Meus veículos"), "Deve conter título da seção 'Meus veículos'");
    assert.ok(conteudo.includes("Preciso de ajuda"), "Deve conter banner de suporte e central 24h");
    assert.ok(
      conteudo.includes("Pagar com PIX"),
      "Deve conter acionamento de pagamento PIX de 1 toque",
    );
    assert.ok(conteudo.includes("ModalPixRapido"), "Deve integrar o ModalPixRapido");
  });

  it("5. ModalPixRapido deve implementar bottom-sheet com QR Code, valor e botão copiar código", () => {
    assert.ok(fs.existsSync(caminhoModalPix), "ModalPixRapido deve existir");
    const conteudo = fs.readFileSync(caminhoModalPix, "utf-8");
    assert.ok(conteudo.includes("Pagar com PIX"), "Deve ter cabeçalho Pagar com PIX");
    assert.ok(
      conteudo.includes("Copiar código PIX"),
      "Deve ter botão largo preto de copiar código PIX",
    );
    assert.ok(conteudo.includes("qrCodeDataUrl"), "Deve exibir imagem do QR Code escaneável");
  });

  it("6. MobileBottomNav deve implementar navegação móvel de 44px com Início, Mapa, Financeiro e Mais", () => {
    assert.ok(fs.existsSync(caminhoMobileNav), "MobileBottomNav deve existir");
    const conteudo = fs.readFileSync(caminhoMobileNav, "utf-8");
    assert.ok(
      conteudo.includes("md:hidden"),
      "Deve ser responsivo e visível exclusivamente no mobile",
    );
    assert.ok(conteudo.includes("min-h-[44px]"), "Deve respeitar área de toque mínima de 44px");
    assert.ok(conteudo.includes("Início"), "Deve conter aba Início");
    assert.ok(conteudo.includes("Mapa"), "Deve conter aba Mapa");
    assert.ok(conteudo.includes("Financeiro"), "Deve conter aba Financeiro");
    assert.ok(conteudo.includes("Mais"), "Deve conter aba Mais");
  });

  it("7. InicioHubView deve direcionar clientes para Meus Veículos e permitir alternância", () => {
    assert.ok(fs.existsSync(caminhoInicioHub), "InicioHubView deve existir");
    const conteudo = fs.readFileSync(caminhoInicioHub, "utf-8");
    assert.ok(conteudo.includes("ClienteHomeView"), "Deve integrar ClienteHomeView");
    assert.ok(conteudo.includes("visaoClienteAtiva"), "Deve controlar o modo de visão do cliente");
  });

  it("8. Regra Pétrea Hunter-Guardian: Ausência do caractere proibido nos novos arquivos", () => {
    const arquivos = [
      caminhoPlacaMercosul,
      caminhoVehiclePhoto,
      caminhoHunterCard,
      caminhoClienteHome,
      caminhoModalPix,
      caminhoMobileNav,
    ];

    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(arq, "utf-8");
      // Regra Petrea: Proibe o caractere comercial isolado em strings e rotulos
      const charProibido = String.fromCharCode(38);
      const linhasComProibido = conteudo
        .split("\n")
        .filter((l) => !l.includes("&&") && l.includes(` ${charProibido} `));
      assert.equal(
        linhasComProibido.length,
        0,
        `O arquivo ${path.basename(arq)} não deve conter o caractere proibido isolado: ${linhasComProibido.join(" | ")}`,
      );
    }
  });
});
