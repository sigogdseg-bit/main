import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VALORES_PADRAO_CANONICO_J16,
  VERSAO_PADRAO_SISTEMA_J16,
  obterConfigPadraoSistemaJ16,
} from "../../features/seguranca/lib/rastreadorJ16Constantes";

describe("Hunter — Isolamento de Portas e Serviços: SIGO Guardião vs GD Segurança", () => {
  const rootDir = process.cwd();

  it("1. Padrão canônico J16 do GD Segurança deve adotar Porta TCP 7003", () => {
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.portaTcp,
      "7003",
      "GD Segurança deve utilizar a porta 7003 para comunicação de rastreadores",
    );
    assert.ok(
      VERSAO_PADRAO_SISTEMA_J16.includes("7003"),
      "Versão do padrão deve refletir a migração para a porta 7003",
    );

    const config = obterConfigPadraoSistemaJ16();
    assert.equal(
      config.valores.portaTcp,
      "7003",
      "obterConfigPadraoSistemaJ16 deve retornar porta 7003 como padrão ativo",
    );
  });

  it("2. Dockerfile e fly.toml do GPS Gateway devem expor e configurar Porta TCP 7003", () => {
    const dockerfilePath = path.join(rootDir, "deploy/hunter-gateway/Dockerfile");
    const flyPath = path.join(rootDir, "deploy/hunter-gateway/fly.toml");

    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
    const flyToml = fs.readFileSync(flyPath, "utf-8");

    assert.ok(dockerfile.includes("PORTA_TCP=7003"), "Dockerfile deve configurar PORTA_TCP=7003");
    assert.ok(dockerfile.includes("EXPOSE 7003"), "Dockerfile deve expor a porta 7003");
    assert.ok(flyToml.includes('PORTA_TCP = "7003"'), "fly.toml deve definir PORTA_TCP = 7003");
    assert.ok(
      flyToml.includes("internal_port = 7003"),
      "fly.toml deve mapear internal_port = 7003",
    );
    assert.ok(flyToml.includes("port = 7003"), "fly.toml deve expor port = 7003");
  });

  it("3. Script do GPS Gateway deve ter fallback padrão na Porta TCP 7003", () => {
    const gatewayScript = path.join(rootDir, "deploy/hunter-gateway/src/hunter-gps-gateway.ts");
    const content = fs.readFileSync(gatewayScript, "utf-8");

    assert.ok(
      content.includes("argPort > 0 ? argPort : 7003"),
      "Fallback do gateway GPS deve ser a porta 7003",
    );
  });

  it("4. Gateway WhatsApp do GD Segurança deve operar na Porta 8082 com sessão isolada (/data/session-gd)", () => {
    const serverPath = path.join(rootDir, "deploy/hunter-whatsapp-gateway/src/server.ts");
    const dockerfilePath = path.join(rootDir, "deploy/hunter-whatsapp-gateway/Dockerfile");
    const flyPath = path.join(rootDir, "deploy/hunter-whatsapp-gateway/fly.toml");

    const serverContent = fs.readFileSync(serverPath, "utf-8");
    const dockerfile = fs.readFileSync(dockerfilePath, "utf-8");
    const flyToml = fs.readFileSync(flyPath, "utf-8");

    // Porta 8082
    assert.ok(
      serverContent.includes('process.env.PORT || "8082"'),
      "Gateway WhatsApp deve escutar na porta 8082 por padrão",
    );
    assert.ok(dockerfile.includes("PORT=8082"), "Dockerfile do WhatsApp deve configurar PORT=8082");
    assert.ok(dockerfile.includes("EXPOSE 8082"), "Dockerfile do WhatsApp deve expor 8082");
    assert.ok(flyToml.includes('PORT = "8082"'), "fly.toml do WhatsApp deve definir PORT = 8082");
    assert.ok(flyToml.includes("internal_port = 8082"), "fly.toml do WhatsApp deve mapear 8082");

    // Sessão isolada (/data/session-gd)
    assert.ok(
      serverContent.includes('process.env.WHATSAPP_SESSION_DIR || "/data/session-gd"'),
      "Gateway WhatsApp deve isolar a sessão do GD em /data/session-gd",
    );
    assert.ok(
      dockerfile.includes("WHATSAPP_SESSION_DIR=/data/session-gd"),
      "Dockerfile deve configurar sessão isolada /data/session-gd",
    );
    assert.ok(
      flyToml.includes('WHATSAPP_SESSION_DIR = "/data/session-gd"'),
      "fly.toml deve configurar sessão /data/session-gd",
    );
  });

  it("5. Servidor Cloudflare Worker (src/server.ts) deve rotear para o Gateway WhatsApp GD na Porta 8082 e disponibilizar /api/whatsapp/qrcode", () => {
    const serverTsPath = path.join(rootDir, "src/server.ts");
    const serverTs = fs.readFileSync(serverTsPath, "utf-8");

    assert.ok(
      serverTs.includes("167.234.233.82:8082"),
      "src/server.ts deve rotear por padrão para o gateway WhatsApp GD na porta 8082",
    );
    assert.ok(
      serverTs.includes('url.pathname === "/api/whatsapp/qrcode"'),
      "src/server.ts deve prover endpoint direto de QR Code /api/whatsapp/qrcode",
    );
    assert.ok(
      serverTs.includes('url.pathname === "/api/whatsapp/disconnect"'),
      "src/server.ts deve prover endpoint /api/whatsapp/disconnect para troca de aparelho",
    );
  });

  it("6. ModalEnvioRapidoWhatsapp deve abrir pareamento no domínio GD (/api/whatsapp/qrcode)", () => {
    const modalPath = path.join(
      rootDir,
      "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx",
    );
    const modalContent = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      modalContent.includes('href="/api/whatsapp/qrcode"'),
      "Botão de conectar/trocar aparelho deve apontar para /api/whatsapp/qrcode no GD Segurança",
    );
    assert.ok(
      !modalContent.includes('href="https://gps.oficial.tec.br/"'),
      "Modal rápido de WhatsApp NÃO deve redirecionar para a raiz do Guardião",
    );
  });

  it("7. Documentação de contas e serviços deve atestar separação explícita de portas", () => {
    const contasPath = path.join(rootDir, "docs/CONTAS-E-SERVICOS.md");
    const contasContent = fs.readFileSync(contasPath, "utf-8");

    assert.ok(
      contasContent.includes("7002") && contasContent.includes("7003"),
      "CONTAS-E-SERVICOS.md deve listar porta 7002 (Guardião) e 7003 (GD Segurança)",
    );
    assert.ok(
      contasContent.includes("8081") && contasContent.includes("8082"),
      "CONTAS-E-SERVICOS.md deve listar porta 8081 (Guardião) e 8082 (GD Segurança)",
    );
  });

  it("8. Blindagem da raiz e desconexão do WhatsApp Gateway: Raiz redireciona para GD e disconnect exige token do SuperADM", () => {
    const serverPath = path.join(rootDir, "deploy/hunter-whatsapp-gateway/src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    // Raiz redireciona estritamente para https://gd.oficial.tec.br
    assert.ok(
      serverContent.includes('res.redirect(302, "https://gd.oficial.tec.br")'),
      "GET / deve redirecionar diretamente para https://gd.oficial.tec.br",
    );

    // Proteção de desconexão
    assert.ok(
      serverContent.includes('app.post("/api/disconnect"'),
      "Deve possuir rota POST /api/disconnect",
    );
    assert.ok(
      serverContent.includes("Acesso negado. Ação restrita estritamente ao SuperADM"),
      "POST /api/disconnect deve validar token e rejeitar acesso não autorizado",
    );
  });
});
