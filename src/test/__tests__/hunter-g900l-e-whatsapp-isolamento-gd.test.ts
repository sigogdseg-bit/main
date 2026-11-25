import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOLOS_BANCADA,
  PARAMETROS_CANONICOS_SISTEMA_GD,
} from "@/features/seguranca/lib/protocolosBancada";
import { obterMenuPublicoDevBot } from "@/features/chat/services/whatsappAutoMonitoramentoService";

describe("HUNTER-GUARDIAN — Homologação do Rastreador G900L 4G e Isolamento WhatsApp GD", () => {
  it("G900L: Deve estar presente no catálogo de protocolos homologados de bancada USB", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    assert.ok(g900l, "Protocolo g900l deve existir no catálogo PROTOCOLOS_BANCADA");
    assert.equal(g900l.id, "g900l");
    assert.equal(g900l.nome, "G900L / A76XX (GT06 4G LTE)");
    assert.equal(g900l.terminador, "CRLF");
    assert.equal(g900l.suportaServidorViaSerial, true);
    assert.equal(g900l.suportaTimersMovimento, true);
  });

  it("G900L: Deve gerar comando canônico de APN M2M via AT Hayes para modem SIMCom A76XX", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const apnCmd = g900l.gerarComandoApn("voxter.br", "algar", "1212");
    assert.equal(apnCmd.cmd, 'AT+CGDCONT=1,"IP","voxter.br"');
    assert.equal(apnCmd.terminador, "CRLF");
  });

  it("G900L: Deve gerar comando canônico de Servidor para porta 7003", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const srvCmd = g900l.gerarComandoServidor("167.234.233.82", "7003", "0");
    assert.equal(srvCmd.cmd, "adminip123456 167.234.233.82 7003");
    assert.equal(srvCmd.terminador, "CRLF");
  });

  it("G900L: Deve gerar fila canônica com 20 comandos AT diretos via USB com autenticação APN e socket", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const fila = g900l.gerarFilaPadraoCanonico({
      srv: "167.234.233.82",
      porta: "7003",
      modo: "0",
      apn: "voxter.br",
      user: "algar",
      pass: "1212",
      mov: "30",
      parado: "3600",
      hbt: "300",
    });

    assert.ok(Array.isArray(fila));
    assert.equal(fila.length, 20);
    // 1. Sincronismo
    assert.equal(fila[0].cmd, "AT");
    // 5. ICCID SIMCom A76XX
    assert.equal(fila[4].cmd, "AT+CICCID");
    // 9. APN
    assert.equal(fila[8].cmd, 'AT+CGDCONT=1,"IP","voxter.br"');
    // 10. Autenticação APN (PAP/Algar)
    assert.equal(fila[9].cmd, 'AT+CGAUTH=1,1,"algar","1212"');
    // 15. Ativação PDP Contexto 1
    assert.equal(fila[14].cmd, "AT+CGACT=1,1");
    // 16. Consulta IP Celular da Sessão
    assert.equal(fila[15].cmd, "AT+CGPADDR=1");
    // 17. Iniciar Stack TCP/IP
    assert.equal(fila[16].cmd, "AT+NETOPEN");
    // 18. Socket TCP GD Porta 7003
    assert.equal(fila[17].cmd, 'AT+CIPOPEN=0,"TCP","167.234.233.82",7003');
    // 19. Persistência NVRAM no Modem SIMCom
    assert.equal(fila[18].cmd, "AT&W");
    // 20. Auditoria de SMS Recebidos
    assert.equal(fila[19].cmd, 'AT+CMGL="ALL"');
    // Todos comandos devem usar terminação CRLF
    for (const item of fila) {
      assert.equal(item.tipo, "CRLF");
    }
  });

  it("G900L: Atalhos rápidos e comandos de um toque devem conter leitura de IMEI, ICCID, sinal e auditoria", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const cmdsAtalhos = g900l.atalhos.map((a) => a.cmd);
    assert.ok(cmdsAtalhos.includes("AT"));
    assert.ok(cmdsAtalhos.includes("AT+CGSN"));
    assert.ok(cmdsAtalhos.includes("AT+CICCID"));
    assert.ok(cmdsAtalhos.includes("AT+CCID"));
    assert.ok(cmdsAtalhos.includes("AT+CPIN?"));
    assert.ok(cmdsAtalhos.includes("AT+CSQ"));
    assert.ok(cmdsAtalhos.includes("check123456"));
    assert.ok(cmdsAtalhos.includes("status123456"));
    assert.ok(cmdsAtalhos.includes("PARAM#"));
    assert.ok(cmdsAtalhos.includes("STATUS#"));
    assert.ok(cmdsAtalhos.includes("AT&W"));
    assert.ok(cmdsAtalhos.includes("AT+CREG?"));
    assert.ok(cmdsAtalhos.includes('AT+CMGL="ALL"'));
  });

  it("Isolamento WhatsApp: Menu público deve identificar exclusivamente como Assistente GD", () => {
    const menu = obterMenuPublicoDevBot("Dario");
    assert.ok(menu.includes("Assistente GD"), "Deve conter 'Assistente GD'");
    assert.ok(!menu.includes("Guardião Virtual"), "NÃO pode conter 'Guardião Virtual'");
    assert.ok(menu.includes("GD Rastreamento"));
  });

  it("Modo B: Deve exportar os Parâmetros Canônicos do Sistema GD com sintaxes G900L e GT06", () => {
    const params = PARAMETROS_CANONICOS_SISTEMA_GD;
    assert.equal(params.servidor, "167.234.233.82");
    assert.equal(params.porta, "7003");
    assert.equal(params.apn, "voxter.br");
    assert.equal(params.usuarioApn, "algar");
    assert.equal(params.senhaApn, "1212");
    assert.equal(params.timerMovimento, "30");
    assert.equal(params.timerParado, "3600");
    assert.equal(params.heartbeat, "300");
    assert.equal(params.fusoGmt, "0");

    // Sintaxe G900L (Coban / Cantrack com senha 123456)
    assert.equal(params.g900l.servidor, "adminip123456 167.234.233.82 7003");
    assert.equal(params.g900l.apn, "apn123456 voxter.br algar 1212");
    assert.equal(params.g900l.timerMovimento, "fix010s060m***n123456");
    assert.equal(params.g900l.heartbeat, "hbt123456 300");
    assert.equal(params.g900l.fuso, "time zone123456 0");
    assert.equal(params.g900l.check, "check123456");
    assert.equal(params.g900l.status, "status123456");

    // Sintaxe GT06 (WanWay / Concox J16 com hash #)
    assert.equal(params.gt06.servidor, "SERVER,0,167.234.233.82,7003,0#");
    assert.equal(params.gt06.apn, "APN,voxter.br,algar,1212#");
    assert.equal(params.gt06.timers, "TIMER,30,3600#");
    assert.equal(params.gt06.heartbeat, "HBT,300,300#");
    assert.equal(params.gt06.fuso, "GMT,W,0,0#");
    assert.equal(params.gt06.check, "PARAM#");
    assert.equal(params.gt06.status, "STATUS#");
  });
});
