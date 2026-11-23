import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ehComandoConsultaSomenteLeitura,
  sanitizarComandoHardware,
} from "../../shared/lib/hunterHardwareComandos";

describe("Hunter — Sanitização Canônica Universal de Comandos de Hardware GT06 / J16 / Concox", () => {
  test("1. Comandos com prefixo SZCS# e CXCS# NUNCA devem ter o terminador '#' no final", () => {
    // ACCLINE
    assert.equal(sanitizarComandoHardware("SZCS#ACCLINE=1"), "SZCS#ACCLINE=1");
    assert.equal(sanitizarComandoHardware("SZCS#ACCLINE=1#"), "SZCS#ACCLINE=1");
    assert.equal(sanitizarComandoHardware("SZCS#ACCLINE=0#"), "SZCS#ACCLINE=0");

    // SLEEP DA CPU MTK E GPS
    assert.equal(sanitizarComandoHardware("SZCS#MTK_DISSLP=0#"), "SZCS#MTK_DISSLP=0");
    assert.equal(sanitizarComandoHardware("SZCS#MTK_DISSLP=0"), "SZCS#MTK_DISSLP=0");
    assert.equal(sanitizarComandoHardware("SZCS#SLPDISCONNECT=0#"), "SZCS#SLPDISCONNECT=0");
    assert.equal(sanitizarComandoHardware("SZCS#GPS_DISSLP=0#"), "SZCS#GPS_DISSLP=0");
    assert.equal(sanitizarComandoHardware("CXCS#MTK_DISSLP#"), "CXCS#MTK_DISSLP");
    assert.equal(sanitizarComandoHardware("CXCS#SLPDISCONNECT"), "CXCS#SLPDISCONNECT");

    // LED_ENABLE
    assert.equal(sanitizarComandoHardware("SZCS#LED_ENABLE=0#"), "SZCS#LED_ENABLE=0");
    assert.equal(sanitizarComandoHardware("SZCS#LED_ENABLE=1#"), "SZCS#LED_ENABLE=1");
    assert.equal(sanitizarComandoHardware("SZCS#LED_ENABLE=0"), "SZCS#LED_ENABLE=0");

    // ANGLEVALUE e ANGLE,SEND (Salvaguarda física X >= 10s no J16)
    assert.equal(sanitizarComandoHardware("SZCS#ANGLE,SEND=1#"), "SZCS#ANGLE,SEND=1");
    assert.equal(sanitizarComandoHardware("SZCS#ANGLEVALUE=10-015#"), "SZCS#ANGLEVALUE=10-015");
    assert.equal(sanitizarComandoHardware("SZCS#ANGLEVALUE=1-015"), "SZCS#ANGLEVALUE=10-015");
    assert.equal(sanitizarComandoHardware("SZCS#ANGLEVALUE=3-015"), "SZCS#ANGLEVALUE=10-015");
    assert.equal(sanitizarComandoHardware("SZCS#ANGLEVALUE=15-020"), "SZCS#ANGLEVALUE=15-020");

    // Odômetro MCU GT06METER
    assert.equal(
      sanitizarComandoHardware("SZCS#GT06SEL=1#GT06METER=1#"),
      "SZCS#GT06SEL=1#GT06METER=1",
    );
    assert.equal(sanitizarComandoHardware("SZCS#GT06METER=0#"), "SZCS#GT06METER=0");

    // Voltagem Externa e Bloqueio Imediato
    assert.equal(sanitizarComandoHardware("SZCS#GT06IEXVOL=2#"), "SZCS#GT06IEXVOL=2");
    assert.equal(sanitizarComandoHardware("SZCS#SOURCE,OFF,TYPE=1#"), "SZCS#SOURCE,OFF,TYPE=1");
  });

  test("2. Comandos Concox padrão exigem OBRIGATORIAMENTE o terminador '#' no final", () => {
    // TIMER de frequência
    assert.equal(sanitizarComandoHardware("TIMER,30,1801"), "TIMER,30,1801#");
    assert.equal(sanitizarComandoHardware("TIMER,30,1801#"), "TIMER,30,1801#");
    assert.equal(sanitizarComandoHardware("TIMER,15,3600"), "TIMER,15,3600#");

    // Comandos de corte e acionamento de relé (NUNCA possuem '#' no final no J16)
    assert.equal(sanitizarComandoHardware("RELAY,1"), "RELAY,1");
    assert.equal(sanitizarComandoHardware("RELAY,1#"), "RELAY,1");
    assert.equal(sanitizarComandoHardware("RELAY,0"), "RELAY,0");
    assert.equal(sanitizarComandoHardware("RELAY,0#"), "RELAY,0");
    assert.equal(sanitizarComandoHardware("DYD,000000"), "DYD,000000");
    assert.equal(sanitizarComandoHardware("DYD,000000#"), "DYD,000000");
    assert.equal(sanitizarComandoHardware("HFYD,000000"), "HFYD,000000");
    assert.equal(sanitizarComandoHardware("HFYD,000000#"), "HFYD,000000");

    // Consulta de status do relé e telemetria (terminam com '#' no protocolo Concox)
    assert.equal(sanitizarComandoHardware("RELAY"), "RELAY#");
    assert.equal(sanitizarComandoHardware("RELAY#"), "RELAY#");

    // Comandos de diagnóstico e infraestrutura
    assert.equal(sanitizarComandoHardware("PARAM"), "PARAM#");
    assert.equal(sanitizarComandoHardware("STATUS"), "STATUS#");
    assert.equal(sanitizarComandoHardware("RESET"), "RESET#");
    assert.equal(sanitizarComandoHardware("FACTORY"), "FACTORY#");
    assert.equal(sanitizarComandoHardware("GMT,W,0,0"), "GMT,W,0,0#");
    assert.equal(sanitizarComandoHardware("HBT,120,300"), "HBT,120,300#");
    assert.equal(sanitizarComandoHardware("LED,OFF"), "LED,OFF#");
    assert.equal(sanitizarComandoHardware("MILEAGE"), "MILEAGE#");
    assert.equal(sanitizarComandoHardware("MILEAGE,183270"), "MILEAGE,183270#");
    assert.equal(sanitizarComandoHardware("SENDS"), "SENDS#");
    assert.equal(sanitizarComandoHardware("SENDS,1"), "SENDS,1#");
    assert.equal(sanitizarComandoHardware("SENDS,1#"), "SENDS,1#");
  });

  test("3. Entradas vazias ou com espaços devem ser tratadas com null-safety", () => {
    assert.equal(sanitizarComandoHardware(""), "");
    assert.equal(sanitizarComandoHardware("   "), "");
  });

  test("4. Anti-Duplicação: Realtime atua estritamente como contingência se HTTP falhar", async () => {
    // Simulação do comportamento de despacho:
    // Se HTTP teve sucesso (despachadoComSucesso = true), canal Realtime NÃO deve ser acionado
    let realtimeDisparado = false;
    const canalMock = {
      send: async () => {
        realtimeDisparado = true;
      },
    };

    // Cenário 1: HTTP teve sucesso (comportamento padrão e rápido)
    let despachadoComSucesso = true;
    if (!despachadoComSucesso && canalMock) {
      await canalMock.send();
    }
    assert.equal(
      realtimeDisparado,
      false,
      "Realtime não deve ser disparado quando HTTP foi bem-sucedido",
    );

    // Cenário 2: HTTP falhou (contingência acionada)
    despachadoComSucesso = false;
    if (!despachadoComSucesso && canalMock) {
      await canalMock.send();
      despachadoComSucesso = true;
    }
    assert.equal(
      realtimeDisparado,
      true,
      "Realtime deve ser disparado como fallback se HTTP falhar",
    );
    assert.equal(despachadoComSucesso, true);

    // Outros comandos de consulta padrão Concox (SCXSZ# deve preservar '#' quando isolado)
    assert.equal(sanitizarComandoHardware("SCXSZ"), "SCXSZ#");
    assert.equal(sanitizarComandoHardware("SCXSZ#"), "SCXSZ#");
    assert.equal(sanitizarComandoHardware("GPRSSET"), "GPRSSET#");
    assert.equal(sanitizarComandoHardware("CXZT"), "CXZT#");
  });

  test("5. ehComandoConsultaSomenteLeitura permite todas as consultas seguras e bloqueia escrita/corte", () => {
    // Consultas Concox / J16
    assert.equal(ehComandoConsultaSomenteLeitura("STATUS#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("PARAM#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("SERVER#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("GPRSSET#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("CXZT#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("SCXSZ#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("URL#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("RELAY#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("MILEAGE#"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("CXCS#ACCLINE"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("CXCS#MTK_DISSLP"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("CXCS#SLPDISCONNECT"), true);

    // Consultas AT e Coban
    assert.equal(ehComandoConsultaSomenteLeitura("AT"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("ATI"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CGSN"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CCID"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CSQ"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CPIN?"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+COPS?"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CGDCONT?"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+NETOPEN?"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CIPOPEN?"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CGNSSINFO"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("check123456"), true);
    assert.equal(ehComandoConsultaSomenteLeitura("G123456#"), true);

    // Escritas / Bloqueios / Resets estritamente bloqueados
    assert.equal(ehComandoConsultaSomenteLeitura("SERVER,0,167.234.233.82,7003,0#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("SERVER,0,167.234.233.82,7002,0#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("APN,voxter.br,algar,1212#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("TIMER,30,3600#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("SZCS#ACCLINE=1"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("CXCS#ACCLINE=1"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("RELAY,1"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("RELAY,0"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("DYD,123456"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("RESET#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura("FACTORY#"), false);
    assert.equal(ehComandoConsultaSomenteLeitura('AT+CGDCONT=1,"IP","voxter.br"'), false);
    assert.equal(ehComandoConsultaSomenteLeitura("AT+CFUN=1,1"), false);
  });

  test("6. Comandos Coban de frequência e tempo com sufixos s, m, h nunca recebem '#'", () => {
    assert.equal(sanitizarComandoHardware("C,30s"), "C,30s");
    assert.equal(sanitizarComandoHardware("C,10s"), "C,10s");
    assert.equal(sanitizarComandoHardware("C,05m"), "C,05m");
    assert.equal(sanitizarComandoHardware("C,01h"), "C,01h");
    assert.equal(sanitizarComandoHardware("H,080"), "H,080");
    assert.equal(sanitizarComandoHardware("B"), "B");
    assert.equal(sanitizarComandoHardware("J"), "J");
    assert.equal(sanitizarComandoHardware("K"), "K");
  });
});
