import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Alertas Veiculares, Despacho Imediato de WhatsApp e Anti-Repetição", () => {
  test("1. Servidor: endpoint /api/push/disparar deve processar tipo e placa e acionar despacharWhatsappAlertaServer", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("despacharWhatsappAlertaServer"),
      "server.ts deve conter a função despacharWhatsappAlertaServer",
    );
    assert.ok(
      content.includes("serverWhatsappAlertDedupCache"),
      "server.ts deve conter cache de deduplicação anti-flood de WhatsApp",
    );
    assert.ok(
      content.includes("tipoNotif"),
      "server.ts deve extrair tipoNotif no endpoint /api/push/disparar",
    );
    assert.ok(
      content.includes("placaNotif"),
      "server.ts deve extrair placaNotif no endpoint /api/push/disparar",
    );
  });

  test("2. Servidor: despacharWhatsappAlertaServer deve respeitar regras_veiculo.canais_alertas e whatsapp_destinatarios", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("canais_alertas,whatsapp_destinatarios"),
      "Deve consultar canais_alertas e whatsapp_destinatarios de regras_veiculo",
    );
    assert.ok(
      content.includes("canais.whatsapp === false"),
      "Deve respeitar caso o canal WhatsApp esteja desligado pelo cliente",
    );
    assert.ok(
      content.includes("https://gps.oficial.tec.br/gd/whatsapp"),
      "Deve usar o gateway de WhatsApp oficial do sistema",
    );
    assert.ok(
      content.includes("whatsapp_alerta_veiculo_enviado"),
      "Deve registrar auditoria do envio de alerta veicular via WhatsApp",
    );
  });

  test("3. Frontend GpsMonitorView: deve possuir deduplicação persistente em sessionStorage e controle de carga inicial", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      content.includes("sigo_cooldowns_telemetria"),
      "GpsMonitorView deve usar sessionStorage com chave sigo_cooldowns_telemetria para evitar repetições ao abrir o app",
    );
    assert.ok(
      content.includes("estadoAnteriorTelemetriaRef"),
      "GpsMonitorView deve memorizar o estado anterior para não disparar em carga estática inicial",
    );
    assert.ok(
      content.includes("houveMudancaIgnicao") && content.includes("houveMudancaVelocidade"),
      "GpsMonitorView só deve reavaliar se houver transição real em ignição ou velocidade",
    );
  });

  test("4. Frontend notificacoesBdService: deve repassar tipo e placa na chamada de /api/push/disparar", () => {
    const notifPath = path.resolve(process.cwd(), "src/shared/lib/notificacoesBdService.ts");
    const content = fs.readFileSync(notifPath, "utf-8");

    assert.ok(
      content.includes('tipo: params.tipo || "alerta"'),
      "notificacoesBdService deve enviar o tipo da notificação no payload de /api/push/disparar",
    );
    assert.ok(
      content.includes("placa: params.placa || null"),
      "notificacoesBdService deve enviar a placa do veículo no payload de /api/push/disparar",
    );
  });

  test("5. Migração SQL e Script Mestre: trigger disparar_push_vapid_ao_inserir_notificacao deve conter tipo e placa", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261019100000_hunter_alertas_whatsapp_push_e_anti_flood.sql",
    );
    const masterPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    const migContent = fs.readFileSync(migPath, "utf-8");
    const masterContent = fs.readFileSync(masterPath, "utf-8");

    assert.ok(
      migContent.includes("'tipo', NEW.tipo") && migContent.includes("'placa', NEW.placa"),
      "Migração deve incluir 'tipo', NEW.tipo e 'placa', NEW.placa no jsonb_build_object",
    );
    assert.ok(
      migContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter invalidação obrigatória de cache PostgREST",
    );
    assert.ok(
      masterContent.includes("'tipo', NEW.tipo") && masterContent.includes("'placa', NEW.placa"),
      "Script mestre deve incluir 'tipo', NEW.tipo e 'placa', NEW.placa",
    );
  });

  test("6. Servidor e Serviços: Controle granular de Push e WhatsApp para NFs e Alertas", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    // Verifica que o servidor respeita o canal Push para NFs e Veículos
    assert.ok(
      serverContent.includes("canais_notificacao_nf") &&
        serverContent.includes("Canal Web Push desativado nas preferências de NF"),
      "server.ts deve validar se o canal Push de NF foi desativado pelo cliente",
    );
    assert.ok(
      serverContent.includes("canais_alertas?.app === false") &&
        serverContent.includes("Canal App / Push desativado nas regras do veículo"),
      "server.ts deve validar se o canal App/Push do veículo foi desativado",
    );

    // Verifica que o nfStorageService envia o anexo no WhatsApp e respeita canais
    const nfPath = path.resolve(
      process.cwd(),
      "src/features/motoristas/services/nfStorageService.ts",
    );
    const nfContent = fs.readFileSync(nfPath, "utf-8");
    assert.ok(
      nfContent.includes("canais_notificacao_nf") &&
        nfContent.includes("extrairBase64Arquivo") &&
        nfContent.includes("documentoWhatsapp"),
      "nfStorageService deve codificar e anexar o arquivo da NF para envio via WhatsApp",
    );

    // Verifica que ConfiguracoesView possui toggles independentes para Push e WhatsApp
    const configPath = path.resolve(
      process.cwd(),
      "src/features/configuracoes/ConfiguracoesView.tsx",
    );
    const configContent = fs.readFileSync(configPath, "utf-8");
    assert.ok(
      configContent.includes("canaisNf") &&
        configContent.includes("Web Push e Central do App") &&
        configContent.includes("WhatsApp com Arquivo Anexo"),
      "ConfiguracoesView deve disponibilizar controle independente de canais Push e WhatsApp",
    );
  });

  test("7. Migração SQL: DDL canais_notificacao_nf em public.clientes com reload do schema", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261102211500_hunter_canais_notificacao_nf_push_whatsapp.sql",
    );
    const masterPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    const migContent = fs.readFileSync(migPath, "utf-8");
    const masterContent = fs.readFileSync(masterPath, "utf-8");

    assert.ok(
      migContent.includes("canais_notificacao_nf JSONB NOT NULL DEFAULT"),
      "Migração deve adicionar coluna canais_notificacao_nf com valor padrão",
    );
    assert.ok(
      masterContent.includes("canais_notificacao_nf JSONB NOT NULL DEFAULT"),
      "Script mestre deve espelhar coluna canais_notificacao_nf",
    );
  });
});
