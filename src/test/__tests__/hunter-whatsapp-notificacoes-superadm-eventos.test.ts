import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Notificações Imediatas via WhatsApp para o SuperADM", () => {
  const serverPath = path.resolve(process.cwd(), "src/server.ts");
  const serverContent = fs.readFileSync(serverPath, "utf-8");

  test("1. Função auxiliar despacharNotificacaoWhatsappSuperAdm está implementada no server", () => {
    assert.ok(
      serverContent.includes("async function despacharNotificacaoWhatsappSuperAdm"),
      "Função despacharNotificacaoWhatsappSuperAdm deve existir no servidor",
    );
    assert.ok(
      serverContent.includes("https://gps.oficial.tec.br/gd/whatsapp"),
      "Deve apontar para o gateway Baileys oficial do GD na VPS",
    );
    assert.ok(
      serverContent.includes("hunter-guardiao-whatsapp-secret-key-2026"),
      "Deve utilizar o token secreto de autenticação do micro-gateway",
    );
  });

  test("2. Auto-Cadastro de Instalador dispara WhatsApp imediato para o SuperADM", () => {
    assert.ok(
      serverContent.includes("novo_instalador_auto_cadastro"),
      "Endpoint de cadastro de instalador deve registrar a notificação",
    );
    assert.ok(
      serverContent.includes("GD RASTREAMENTO — NOVO CREDENCIAMENTO DE INSTALADOR"),
      "Deve conter o título padronizado com identidade do GD Rastreamento",
    );
    assert.ok(
      serverContent.includes("Mão de Obra (Sem Bloqueador)"),
      "Deve detalhar valores de mão de obra do instalador",
    );
  });

  test("3. Auto-Cadastro de Cliente dispara WhatsApp imediato para o SuperADM com veículos", () => {
    assert.ok(
      serverContent.includes("novo_cliente_auto_cadastro"),
      "Endpoint de cadastro de cliente deve registrar a notificação",
    );
    assert.ok(
      serverContent.includes("GD RASTREAMENTO — NOVO AUTO-CADASTRO DE CLIENTE"),
      "Deve conter o título padronizado de novo cliente",
    );
    assert.ok(
      serverContent.includes("Veículos Adicionados"),
      "Deve listar os veículos cadastrados pelo cliente",
    );
  });

  test("4. Solicitação de Novo Veículo pelo Cliente dispara WhatsApp imediato para o SuperADM", () => {
    assert.ok(
      serverContent.includes("nova_solicitacao_veiculo_cliente"),
      "Endpoint de solicitação de veículo deve registrar a notificação",
    );
    assert.ok(
      serverContent.includes("GD RASTREAMENTO — SOLICITAÇÃO DE NOVO VEÍCULO"),
      "Deve conter o título padronizado de solicitação de novo veículo",
    );
    assert.ok(
      serverContent.includes("Nova ordem gerada. Atribua o instalador em:"),
      "Deve direcionar o operador para atribuir instalador e kit",
    );
  });

  test("5. Regra Pétrea: Ausência do caractere comercial proibido nas mensagens", () => {
    const idxInst = serverContent.indexOf("novo_instalador_auto_cadastro");
    const idxCli = serverContent.indexOf("novo_cliente_auto_cadastro");
    const idxVeic = serverContent.indexOf("nova_solicitacao_veiculo_cliente");

    const trechosMensagens = [
      serverContent.slice(idxInst - 600, idxInst + 200),
      serverContent.slice(idxCli - 600, idxCli + 200),
      serverContent.slice(idxVeic - 600, idxVeic + 200),
    ];

    for (const trecho of trechosMensagens) {
      assert.ok(
        !trecho.includes(" & "),
        "Não deve conter o caractere comercial proibido em textos de interface ou notificações",
      );
    }
  });

  test("6. Assinatura Eletrônica de Contrato dispara notificação WhatsApp para quem está cadastrado no relatório gerencial / SuperADM", () => {
    assert.ok(
      serverContent.includes("notificacao_contrato_assinado_cliente"),
      "Endpoint assinar-dispositivo deve disparar notificação de contrato assinado",
    );
    assert.ok(
      serverContent.includes("CONTRATO ASSINADO ELETRONICAMENTE"),
      "Deve conter o título oficial com identidade canônica",
    );
    assert.ok(
      serverContent.includes("notificacao_contrato_assinado_recebido"),
      "Endpoint assinar deve registrar o recebimento do contrato formalizado",
    );
  });

  test("7. Relatório Gerencial é estritamente restrito ao SuperADM no backend e no frontend", () => {
    const configViewPath = path.resolve(
      process.cwd(),
      "src/features/configuracoes/ConfiguracoesView.tsx",
    );
    const modalRelatorioPath = path.resolve(
      process.cwd(),
      "src/features/relatorios/components/RelatorioGerencialModal.tsx",
    );
    const configViewContent = fs.readFileSync(configViewPath, "utf-8");
    const modalRelatorioContent = fs.readFileSync(modalRelatorioPath, "utf-8");

    // Backend: server.ts
    assert.ok(
      serverContent.includes('isSuperAdmEmail || userRole === "superadmin"'),
      "Backend deve checar se é SuperADM",
    );
    assert.ok(
      serverContent.includes(
        "Acesso restrito: apenas o SuperADM pode visualizar e configurar o Relatório Gerencial.",
      ),
      "Backend deve rejeitar qualquer usuário que não seja SuperADM",
    );

    // Frontend: ConfiguracoesView.tsx
    assert.ok(
      configViewContent.includes("session.isSuperAdmin && ("),
      "Seção de Relatório Gerencial deve ser exibida exclusivamente para o SuperADM",
    );

    // Frontend: RelatorioGerencialModal.tsx
    assert.ok(
      modalRelatorioContent.includes("!session?.isSuperAdmin"),
      "Modal de Relatório Gerencial deve bloquear renderização para não-SuperADM",
    );
  });

  test("8. ModalContratosCliente possui reatividade em tempo real via Supabase Realtime", () => {
    const modalContratosPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalContratosCliente.tsx",
    );
    const modalContratosContent = fs.readFileSync(modalContratosPath, "utf-8");

    assert.ok(
      modalContratosContent.includes("realtime-contratos-cliente-"),
      "ModalContratosCliente deve subscrever canal Supabase Realtime para contratos do cliente",
    );
    assert.ok(
      modalContratosContent.includes('table: "contratos_clientes"'),
      "Deve escutar alterações da tabela contratos_clientes",
    );
  });

  test("9. Auto-Cadastro de Revendedor dispara WhatsApp imediato para o SuperADM", () => {
    assert.ok(
      serverContent.includes("novo_revendedor_cadastro"),
      "Endpoint de cadastro de parceiro deve registrar a notificação para revendedor",
    );
    assert.ok(
      serverContent.includes("GD RASTREAMENTO — NOVO CADASTRO DE REVENDEDOR"),
      "Deve conter o título oficial padronizado com identidade do GD Rastreamento",
    );
    assert.ok(
      serverContent.includes("Cota Base da Matriz"),
      "Deve detalhar a cota base da matriz para a franquia",
    );
  });

  test("10. Auto-Cadastro de Vendedor dispara WhatsApp imediato para o SuperADM", () => {
    assert.ok(
      serverContent.includes("novo_vendedor_cadastro"),
      "Endpoint de cadastro de parceiro deve registrar a notificação para vendedor",
    );
    assert.ok(
      serverContent.includes("GD RASTREAMENTO — NOVO CADASTRO DE VENDEDOR"),
      "Deve conter o título oficial padronizado para novo vendedor",
    );
    assert.ok(
      serverContent.includes("Franquia Vinculada") || serverContent.includes("Vínculo"),
      "Deve identificar a franquia vinculada do vendedor",
    );
  });
});
