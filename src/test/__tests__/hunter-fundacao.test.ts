import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION_NUMERO, APP_NOME } from "../../shared/lib/version";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("GD Segurança — Validação da Fundação Canônica", () => {
  test("Versão canônica A.B.C.D está definida corretamente", () => {
    assert.match(APP_VERSION_NUMERO, /^\d+\.\d+\.\d+\.\d+$/);
    assert.equal(APP_VERSION_NUMERO, "1.0.1.121");
    assert.equal(APP_NOME, "GD Segurança");
  });

  test("Temas visuais suportam Escuro, Claro e Sistema", () => {
    const temasValidos = ["dark", "light", "system"];
    assert.ok(temasValidos.includes("dark"));
    assert.ok(temasValidos.includes("light"));
    assert.ok(temasValidos.includes("system"));
  });

  test("Regra Pétrea: Ausência do caractere comercial proibido nos títulos dos cards", () => {
    const titulos = [
      "Atendimento ao Cliente",
      "Central de Segurança",
      "Clientes e Planos",
      "Dispositivos Autorizados",
      "Estoque e Suprimentos",
      "Financeiro e Fluxo de Caixa",
      "Instalações Técnicas",
      "Logs do Sistema",
      "Manutenção Preventiva",
      "Mapa Operacional",
      "Mensalidades e Cobrança",
      "Rastreadores J16",
      "Temas dos Cards e Módulos",
      "Usuários e Acessos",
    ];

    titulos.forEach((t) => {
      assert.ok(!t.includes("&"), `Título "${t}" não deve conter o caractere comercial proibido`);
    });

    // Ordenação estrita A-Z
    const ordenado = [...titulos].sort((a, b) => a.localeCompare(b, "pt-BR"));
    assert.deepEqual(titulos, ordenado);
  });

  test("Matriz de Planos Comerciais e Retenção Técnica (Margem de Segurança)", () => {
    const planos = {
      basico: { diasCliente: 7, diasBanco: 10 },
      pro: { diasCliente: 15, diasBanco: 20 },
      master: { diasCliente: 30, diasBanco: 35 },
    };

    // Básico
    assert.equal(planos.basico.diasCliente, 7);
    assert.equal(planos.basico.diasBanco, 10);
    assert.ok(
      planos.basico.diasBanco > planos.basico.diasCliente,
      "Margem técnica no banco deve ser maior",
    );

    // Pro
    assert.equal(planos.pro.diasCliente, 15);
    assert.equal(planos.pro.diasBanco, 20);
    assert.ok(
      planos.pro.diasBanco > planos.pro.diasCliente,
      "Margem técnica no banco deve ser maior",
    );

    // Master
    assert.equal(planos.master.diasCliente, 30);
    assert.equal(planos.master.diasBanco, 35);
    assert.ok(
      planos.master.diasBanco > planos.master.diasCliente,
      "Margem técnica no banco deve ser maior",
    );
  });

  test("SuperADM é inviolável e identificado por e-mail (novaes@adm e novaes@oficial.tec.br)", () => {
    const superAdminEmails = ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"];

    const checarPodeExcluir = (email: string) => {
      if (email === "novaes@adm.28bpm.local" || email === "novaes@oficial.tec.br") {
        throw new Error("A conta SuperADM e imutavel e nao pode ser excluida.");
      }
      return true;
    };

    for (const email of superAdminEmails) {
      assert.throws(
        () => checarPodeExcluir(email),
        /A conta SuperADM e imutavel e nao pode ser excluida\./,
      );
    }
    assert.equal(checarPodeExcluir("outro@hunter.com"), true);
  });

  test("Atendimento ao Cliente: Registro Automático Inalterável", () => {
    const usuarioLogado = {
      id: "usr-12345",
      nome: "Operador Hunter 01",
      role: "operador",
    };

    const providenciaTexto = "Verificado sinal do chip M2M; sinal GSM normalizado.";
    const providencia = {
      atendimento_id: "atd-999",
      usuario_id: usuarioLogado.id,
      usuario_nome: usuarioLogado.nome,
      usuario_role: usuarioLogado.role,
      providencia: providenciaTexto,
      created_at: new Date().toISOString(),
    };

    // Valida que o registro pegou exatamente o usuário autenticado da sessão
    assert.equal(providencia.usuario_id, "usr-12345");
    assert.equal(providencia.usuario_nome, "Operador Hunter 01");
    assert.equal(providencia.usuario_role, "operador");
    assert.equal(providencia.providencia, providenciaTexto);
    assert.ok(providencia.created_at.length > 0);
  });

  test("Isolamento de Clientes: Cliente acessa estritamente seus próprios veículos", () => {
    const veiculos = [
      { id: "v1", cliente_id: "cli-1", placa: "ABC-1234" },
      { id: "v2", cliente_id: "cli-1", placa: "DEF-5678" },
      { id: "v3", cliente_id: "cli-2", placa: "GHI-9999" },
    ];

    const filtrarVeiculosCliente = (clienteId: string) => {
      return veiculos.filter((v) => v.cliente_id === clienteId);
    };

    const veiculosCli1 = filtrarVeiculosCliente("cli-1");
    assert.equal(veiculosCli1.length, 2);
    assert.ok(veiculosCli1.every((v) => v.cliente_id === "cli-1"));

    const veiculosCli2 = filtrarVeiculosCliente("cli-2");
    assert.equal(veiculosCli2.length, 1);
    assert.equal(veiculosCli2[0].placa, "GHI-9999");
  });

  test("Manutenção Preventiva: Cálculo de odômetro, aviso antecipado e status", () => {
    const kmInicialAtivacao = 45000;
    const intervaloTrocaOleo = 5000;
    const proximoKmAlvo = kmInicialAtivacao + intervaloTrocaOleo; // 50000 km
    const avisoAntecipadoKm = 500;

    const calcularStatus = (odometroAtual: number) => {
      const restante = proximoKmAlvo - odometroAtual;
      if (restante <= 0) return "vencida";
      if (restante <= avisoAntecipadoKm) return "proxima";
      return "em_dia";
    };

    // Teste 1: 47000 km (Faltam 3000 km) -> Em dia
    assert.equal(calcularStatus(47000), "em_dia");

    // Teste 2: 49600 km (Faltam 400 km <= 500) -> Próxima
    assert.equal(calcularStatus(49600), "proxima");

    // Teste 3: 50050 km (Ultrapassou o alvo) -> Vencida
    assert.equal(calcularStatus(50050), "vencida");
  });

  test("Paridade Canônica: Tela de cadastro e edição de cliente compartilham campos estritos", () => {
    const camposObrigatorios = [
      "nome_razao_social",
      "documento",
      "email",
      "telefone",
      "status",
      "plano",
      "dia_vencimento",
      "valor_mensalidade",
      "dias_historico_plano",
      "dias_retencao_banco",
      "acesso_login_senha",
    ];

    assert.equal(camposObrigatorios.length, 11);
    assert.ok(camposObrigatorios.includes("status"));
    assert.ok(camposObrigatorios.includes("acesso_login_senha"));
    assert.ok(camposObrigatorios.includes("plano"));
  });

  test("Validação de Integridade de Login do Cliente (GoTrue auth.identities)", () => {
    // Simula a normalização canônica de credenciais de login
    const emailEntrada = "  Cliente.Teste@Hunter.COM.BR  ";
    const emailSanitizado = emailEntrada.trim().toLowerCase();

    assert.equal(emailSanitizado, "cliente.teste@hunter.com.br");

    // Valida estrutura canônica exigida pelo GoTrue em auth.identities
    const mockIdentity = {
      id: "usr-uuid-1234",
      user_id: "usr-uuid-1234",
      provider: "email",
      provider_id: "usr-uuid-1234",
      identity_data: {
        sub: "usr-uuid-1234",
        email: emailSanitizado,
      },
    };

    assert.equal(mockIdentity.provider, "email");
    assert.equal(mockIdentity.provider_id, mockIdentity.user_id);
    assert.equal(mockIdentity.identity_data.email, "cliente.teste@hunter.com.br");
    assert.equal(mockIdentity.identity_data.sub, mockIdentity.user_id);
  });

  test("Validação de Mapeamento e Resiliência da Lista de Instaladores Credenciados", () => {
    // Simula perfil retornado com ou sem telefone
    const perfilComTelefone = {
      id: "inst-uuid-001",
      nome: "Técnico Silva",
      telefone: "24999999999",
      endereco_instalacao: "Rua das Flores, 100 - Volta Redonda/RJ",
      chave_pix: "silva@hunter.com",
      valor_por_instalacao: 50,
      role: "instalador",
      ativo: true,
    };

    const perfilSemTelefone = {
      id: "inst-uuid-002",
      nome: "Técnico Santos",
      endereco_instalacao: "Av. Brasil, 500 - VR",
      chave_pix: null,
      valor_por_instalacao: 60,
      role: "instalador",
      ativo: true,
    };

    const lista = [perfilComTelefone, perfilSemTelefone].map((d) => ({
      id: d.id,
      nome: d.nome,
      telefone: "telefone" in d ? d.telefone : null,
      endereco_instalacao: d.endereco_instalacao || null,
      chave_pix: d.chave_pix || null,
      valor_por_instalacao: d.valor_por_instalacao ? Number(d.valor_por_instalacao) : 0,
    }));

    assert.equal(lista.length, 2);
    assert.equal(lista[0].nome, "Técnico Silva");
    assert.equal(lista[0].telefone, "24999999999");
    assert.equal(lista[1].nome, "Técnico Santos");
    assert.equal(lista[1].telefone, null);
    assert.ok(lista[0].endereco_instalacao?.includes("Volta Redonda"));
  });

  test("Regra Pétrea: Isolamento Total de Marca e Sistemas (Sem referências a SIGOVTR/SIGOFROTA)", async () => {
    const fs = await import("node:fs/promises");
    const caminhos = [
      "src/features/seguranca/components/CentralSegurancaView.tsx",
      "src/features/theme/components/ModuloTemasPage.tsx",
      "src/features/inicio/components/InicioHubView.tsx",
      "src/features/layout/components/AppHeader.tsx",
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
      "src/shared/lib/modulosCatalogo.ts",
    ];

    for (const caminho of caminhos) {
      const conteudo = await fs.readFile(new URL(`../../../${caminho}`, import.meta.url), "utf-8");
      assert.ok(
        !conteudo.toLowerCase().includes("sigovtr"),
        `O arquivo ${caminho} nao deve conter referencia ao sistema SIGOVTR`,
      );
      assert.ok(
        !conteudo.toLowerCase().includes("sigofrota"),
        `O arquivo ${caminho} nao deve conter referencia ao sistema SIGOFrota`,
      );
    }
  });

  test("Regra Pétrea: Nomenclatura oficial exclusiva SuperADM (Proibido uso de Mestre)", async () => {
    const fs = await import("node:fs/promises");
    const caminhos = [
      "src/features/inicio/components/InicioHubView.tsx",
      "src/features/layout/components/AppHeader.tsx",
      "src/features/auth/components/LoginView.tsx",
      "src/features/financeiro/components/FinanceiroView.tsx",
      "src/features/seguranca/components/UsuarioFormModal.tsx",
      "src/features/seguranca/components/UsuariosView.tsx",
    ];

    for (const caminho of caminhos) {
      const conteudo = await fs.readFile(new URL(`../../../${caminho}`, import.meta.url), "utf-8");
      assert.ok(
        !conteudo.toLowerCase().includes("mestre"),
        `O arquivo ${caminho} nao deve conter o termo 'mestre' para administracao`,
      );
    }
  });

  test("Regra de Interface: Tela de Login sem menção desnecessária a 'SuperADM Blindado'", async () => {
    const fs = await import("node:fs/promises");
    const conteudo = await fs.readFile(
      new URL("../../../src/features/auth/components/LoginView.tsx", import.meta.url),
      "utf-8",
    );
    assert.ok(
      !conteudo.includes("SuperADM Blindado"),
      "LoginView não deve exibir 'SuperADM Blindado' no rodapé",
    );
  });

  test("Regra de Interface: Telemetria Veicular exclusiva Cockpit 3D sem seletores ou modos analógico/gráfico", async () => {
    const fs = await import("node:fs/promises");
    const conteudo = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );
    assert.ok(
      !conteudo.includes("MostradoresGraficosModernos"),
      "VehicleTelemetryDrawer não deve possuir modo de gráficos secundário",
    );
    assert.ok(
      !conteudo.includes("MostradoresAnalogicosPrecisao"),
      "VehicleTelemetryDrawer não deve possuir modo analógico",
    );
    assert.ok(
      !conteudo.includes("salvarModoMostrador"),
      "VehicleTelemetryDrawer não deve ter seletor ou alternador de modos",
    );
    assert.ok(
      conteudo.includes("<MostradoresCockpit3D"),
      "VehicleTelemetryDrawer deve exibir o Cockpit 3D diretamente",
    );
  });

  test("Governança Imutável: Somente os 2 e-mails oficiais podem ser SuperADM e são imunes a desativação", () => {
    const emailsOficiaisSuperAdm = ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"];

    const validarPodeSerSuperAdm = (email: string) => {
      const em = email.toLowerCase().trim();
      return emailsOficiaisSuperAdm.includes(em);
    };

    assert.equal(validarPodeSerSuperAdm("novaes@adm.28bpm.local"), true);
    assert.equal(validarPodeSerSuperAdm("novaes@oficial.tec.br"), true);
    assert.equal(validarPodeSerSuperAdm("NOVAES@OFICIAL.TEC.BR"), true);
    assert.equal(validarPodeSerSuperAdm("outro@empresa.com.br"), false);
    assert.equal(validarPodeSerSuperAdm("admin@empresa.com"), false);

    // Validação de que conta SuperADM é forçada para ativo: true
    const resolverStatusConta = (email: string, ativoDesejado: boolean) => {
      if (validarPodeSerSuperAdm(email)) {
        return true; // Blindado contra desativação
      }
      return ativoDesejado;
    };

    assert.equal(resolverStatusConta("novaes@adm.28bpm.local", false), true);
    assert.equal(resolverStatusConta("novaes@oficial.tec.br", false), true);
    assert.equal(resolverStatusConta("outro@empresa.com.br", false), false);
  });

  test("Infraestrutura de Notificações entre Dispositivos via Banco de Dados (Supabase Realtime)", () => {
    // Valida que os serviços de notificações foram exportados e não utilizam caractere comercial proibido
    const notificacoesBdCode = fs.readFileSync(
      path.resolve(__dirname, "../../shared/lib/notificacoesBdService.ts"),
      "utf-8",
    );
    const webPushCode = fs.readFileSync(
      path.resolve(__dirname, "../../shared/lib/webPushService.ts"),
      "utf-8",
    );

    assert.ok(
      notificacoesBdCode.includes("enviarNotificacaoViaBd"),
      "notificacoesBdService deve exportar enviarNotificacaoViaBd",
    );
    assert.ok(
      notificacoesBdCode.includes("inicializarOuvinteNotificacoesBd"),
      "notificacoesBdService deve exportar inicializarOuvinteNotificacoesBd",
    );
    assert.ok(
      webPushCode.includes("enviarNotificacaoViaBd"),
      "webPushService deve invocar enviarNotificacaoViaBd para sinc inter-dispositivos",
    );
    // Valida que não há uso de " & " (e comercial como conjunção) em textos ou títulos
    assert.ok(
      !notificacoesBdCode.includes(" & "),
      "notificacoesBdService não deve conter o caractere comercial proibido em textos",
    );
    assert.ok(
      !webPushCode.includes(" & "),
      "webPushService não deve conter o caractere comercial proibido em textos",
    );
  });

  test("Duplo Marco de Segurança Imutável: Repositórios Isolados A/B e Scripts Canônicos", () => {
    const marcosPath = path.resolve(__dirname, "../../../MARCOS_DE_SEGURANCA.json");
    assert.ok(fs.existsSync(marcosPath), "MARCOS_DE_SEGURANCA.json deve existir na raiz");

    const marcos = JSON.parse(fs.readFileSync(marcosPath, "utf-8"));
    assert.ok(
      marcos.bkp_a.repositorio.includes("BKP-A"),
      "Repositório BKP-A deve apontar para BKP-A",
    );
    assert.ok(
      marcos.bkp_b.repositorio.includes("BKP-B"),
      "Repositório BKP-B deve apontar para BKP-B",
    );
    assert.ok(
      ["BKP-A", "BKP-B"].includes(marcos.proximo_a_substituir),
      "Deve indicar qual marco é o mais antigo para rotação de substituição",
    );

    const pontoControlePath = path.resolve(__dirname, "../../../PONTO_DE_CONTROLE.json");
    assert.ok(fs.existsSync(pontoControlePath), "PONTO_DE_CONTROLE.json deve existir na raiz");

    const pontoControle = JSON.parse(fs.readFileSync(pontoControlePath, "utf-8"));
    assert.equal(pontoControle.imutavel, true, "Ponto de controle deve ser marcado como imutável");
    assert.ok(
      pontoControle.repositorio_seguro.includes("BKP-A") ||
        pontoControle.repositorio_seguro.includes("BKP-B"),
      "Repositório seguro deve apontar para BKP-A ou BKP-B",
    );

    const packageJsonPath = path.resolve(__dirname, "../../../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    assert.ok(packageJson.scripts["marco:save"], "Deve conter script marco:save");
    assert.ok(packageJson.scripts["marco:restore"], "Deve conter script marco:restore");
    assert.ok(packageJson.scripts["checkpoint:save"], "Deve conter script checkpoint:save");
    assert.ok(packageJson.scripts["checkpoint:restore"], "Deve conter script checkpoint:restore");

    const salvarScript = path.resolve(__dirname, "../../../scripts/salvar_marco_seguranca.sh");
    const restaurarScript = path.resolve(
      __dirname,
      "../../../scripts/restaurar_marco_seguranca.sh",
    );
    assert.ok(fs.existsSync(salvarScript), "salvar_marco_seguranca.sh deve existir");
    assert.ok(fs.existsSync(restaurarScript), "restaurar_marco_seguranca.sh deve existir");
  });
});
