import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type * as net from "node:net";

process.env.GATEWAY_TEST_MODE = "true";
process.env.NODE_ENV = "test";

const {
  processarAutoThrottleCoban,
  dispararComandoRepousoCoban,
  limparAutoThrottleCoban,
  autoThrottleCobanPorImei,
  modeloRastreadorPorImei,
  isModeloG900L,
  COBAN_THROTTLE_HYSTERESIS_MS,
  COBAN_THROTTLE_COOLDOWN_MS,
  processarPacote,
  conexoesAtivas,
} = await import("../../../deploy/hunter-gateway/src/hunter-gps-gateway.js");

class MockSocket extends EventEmitter {
  public written: Buffer[] = [];
  public destroyed = false;
  public writable = true;
  public remoteAddress = "127.0.0.1";
  public remotePort = 54321;

  write(data: Buffer | string): boolean {
    const buf = typeof data === "string" ? Buffer.from(data, "ascii") : data;
    this.written.push(buf);
    return true;
  }

  destroy(): this {
    this.destroyed = true;
    this.writable = false;
    this.emit("close");
    return this;
  }
}

describe("Hunter GPS Gateway — Auto-Throttle Coban / G900L", () => {
  const TEST_IMEI = "865893084677543";

  beforeEach(() => {
    limparAutoThrottleCoban(TEST_IMEI);
    modeloRastreadorPorImei.set(TEST_IMEI, "G900L");
  });

  it("1. Transição ON para OFF: Deve agendar timer de 120s e despachar C,05m após os 120s para G900L", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });
    const t0 = 1_000_000;

    // 1.1 Inicia veículo ligado (modo 10s)
    const resOn = processarAutoThrottleCoban(TEST_IMEI, true, 20, socket, t0);
    assert.equal(resOn.acao, "enviado_10s");
    const mock = socket as unknown as MockSocket;
    assert.equal(mock.written.length, 1);
    assert.equal(mock.written[0].toString("ascii"), `**,imei:${TEST_IMEI},C,10s;`);

    // 1.2 Veículo desliga a chave e para (velocidade 0) em t0 + 10s
    const tOff = t0 + 10_000;
    const resOff = processarAutoThrottleCoban(TEST_IMEI, false, 0, socket, tOff);
    assert.equal(resOff.acao, "timer_repouso_iniciado");

    const estado = autoThrottleCobanPorImei.get(TEST_IMEI);
    assert.ok(estado, "Estado do IMEI deve existir na memória");
    assert.ok(estado?.timerRepouso !== null, "Timer de repouso de 120s deve estar ativo");
    assert.equal(estado?.modoAtual, "10s", "Modo permanece 10s durante o período de histerese");
    assert.equal(mock.written.length, 1, "Não deve enviar C,05m antes dos 120s");

    // Pacotes adicionais de parada enquanto o timer corre não devem reiniciar o timer
    const resOffRepetido = processarAutoThrottleCoban(TEST_IMEI, false, 0, socket, tOff + 20_000);
    assert.equal(resOffRepetido.acao, "timer_repouso_mantido");

    // 1.3 Decorridos os 120s de histerese (tOff + 120_000)
    const tDisparo = tOff + COBAN_THROTTLE_HYSTERESIS_MS;
    const despachou = dispararComandoRepousoCoban(TEST_IMEI, tDisparo);
    assert.equal(despachou, true, "Deve despachar C,05m após 120s");

    assert.equal(mock.written.length, 2);
    assert.equal(mock.written[1].toString("ascii"), `**,imei:${TEST_IMEI},C,05m;`);
    assert.equal(estado?.modoAtual, "05m", "Modo em memória deve ser atualizado para '05m'");
    assert.equal(estado?.timerRepouso, null, "Timer de repouso deve ser limpo");

    conexoesAtivas.delete(socket);
  });

  it("2. Cancelamento do Timer de Repouso: Se ignição religar antes de 120s, o timer deve ser cancelado", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });
    const t0 = 2_000_000;

    // Veículo inicialmente em modo 10s
    processarAutoThrottleCoban(TEST_IMEI, true, 15, socket, t0);
    const mock = socket as unknown as MockSocket;
    assert.equal(mock.written.length, 1);

    // Desliga ignição em t0 + 5s (inicia timer de 120s)
    processarAutoThrottleCoban(TEST_IMEI, false, 0, socket, t0 + 5_000);
    const estado = autoThrottleCobanPorImei.get(TEST_IMEI);
    assert.ok(estado?.timerRepouso !== null, "Timer deve estar agendado");

    // Religa a ignição 35s depois (antes dos 120s)
    const tReligou = t0 + 40_000;
    const resReligou = processarAutoThrottleCoban(TEST_IMEI, true, 0, socket, tReligou);
    assert.equal(resReligou.acao, "timer_repouso_cancelado");
    assert.equal(estado?.timerRepouso, null, "Timer de repouso deve ser anulado");
    assert.equal(estado?.modoAtual, "10s", "Permanece em modo 10s");

    // Confirma que nenhum novo comando foi disparado desnecessariamente
    assert.equal(mock.written.length, 1, "Não deve disparar comandos extras");

    // Ao tentar disparar o repouso cancelado, nada acontece
    const tentouRepouso = dispararComandoRepousoCoban(TEST_IMEI, t0 + 130_000);
    assert.equal(
      tentouRepouso,
      false,
      "Disparo de repouso não deve ocorrer se timer foi cancelado e veículo está ligado",
    );
    assert.equal(mock.written.length, 1);

    conexoesAtivas.delete(socket);
  });

  it("3. Transição Imediata OFF para ON: Veículo em repouso (05m) liga a chave e recebe C,10s imediatamente", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });
    const t0 = 3_000_000;

    // Configura veículo em repouso ('05m') com cooldown decorrido
    const estadoInicial = {
      imei: TEST_IMEI,
      modoAtual: "05m" as const,
      ultimoEnvioTimestamp: t0 - 70_000, // 70s atrás (> 60s)
      timerRepouso: null,
      socketRef: socket,
    };
    autoThrottleCobanPorImei.set(TEST_IMEI, estadoInicial);

    // Motorista vira a chave (ignicao = true)
    const resOn = processarAutoThrottleCoban(TEST_IMEI, true, 0, socket, t0);
    assert.equal(resOn.acao, "enviado_10s");

    const mock = socket as unknown as MockSocket;
    assert.equal(mock.written.length, 1);
    assert.equal(mock.written[0].toString("ascii"), `**,imei:${TEST_IMEI},C,10s;`);

    const estado = autoThrottleCobanPorImei.get(TEST_IMEI);
    assert.equal(estado?.modoAtual, "10s");
    assert.equal(estado?.ultimoEnvioTimestamp, t0);

    conexoesAtivas.delete(socket);
  });

  it("4. Trava Anti-Spam: Deve bloquear despachos automáticos repetidos em intervalo inferior a 60s", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });
    const t0 = 4_000_000;

    // 4.1 Primeiro despacho em t0
    const res1 = processarAutoThrottleCoban(TEST_IMEI, true, 10, socket, t0);
    assert.equal(res1.acao, "enviado_10s");

    // Força modo para 05m para simular tentativa rápida de religar
    const estado = autoThrottleCobanPorImei.get(TEST_IMEI)!;
    estado.modoAtual = "05m";

    // 4.2 Tentativa aos 20s (apenas 20s decorridos < 60s cooldown)
    const tSpam = t0 + 20_000;
    const resSpam = processarAutoThrottleCoban(TEST_IMEI, true, 10, socket, tSpam);
    assert.equal(resSpam.acao, "cooldown_ativo");

    const mock = socket as unknown as MockSocket;
    assert.equal(mock.written.length, 1, "Não deve enviar comando durante cooldown anti-spam");

    // 4.3 Tentativa aos 65s (65s decorridos >= 60s cooldown)
    const tLiberado = t0 + 65_000;
    const resLiberado = processarAutoThrottleCoban(TEST_IMEI, true, 10, socket, tLiberado);
    assert.equal(resLiberado.acao, "enviado_10s");
    assert.equal(mock.written.length, 2, "Comando deve ser liberado após cooldown de 60s");

    conexoesAtivas.delete(socket);
  });

  it("5. Limpeza de Timers e Estado no Descarte/Desconexão do Socket", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });
    processarAutoThrottleCoban(TEST_IMEI, false, 0, socket);

    const estado = autoThrottleCobanPorImei.get(TEST_IMEI);
    assert.ok(estado?.timerRepouso !== null, "Timer deve existir");

    limparAutoThrottleCoban(TEST_IMEI);
    assert.equal(autoThrottleCobanPorImei.has(TEST_IMEI), false, "Estado deve ser removido");

    conexoesAtivas.delete(socket);
  });

  it("6. Integração do Frame Coban 'acc on' e 'acc off' via processarPacote para G900L", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, { imei: TEST_IMEI, modeloRastreador: "G900L" });

    // Frame ASCII 'acc on' Coban
    const frameAccOn = Buffer.from(`**,imei:${TEST_IMEI},acc on;`);
    await processarPacote(socket, frameAccOn);

    const mock = socket as unknown as MockSocket;
    const enviou10s = mock.written.some((b) => b.toString("ascii").includes("C,10s"));
    assert.ok(enviou10s, "Deve despachar C,10s na chegada de 'acc on' para G900L");

    const conn = conexoesAtivas.get(socket);
    assert.equal(conn?.ignicaoStatus, true);

    conexoesAtivas.delete(socket);
  });

  it("7. Teste Negativo de Isolamento: Rastreador não-G900L (ex: 'Voxter J16 4G') NUNCA dispara C,10s nem C,05m ao enviar pacotes 0x13", async () => {
    const socketJ16 = new MockSocket() as unknown as net.Socket;
    const imeiJ16 = "863874085222366"; // Volvo XC 60 T6 (AXH0E44)
    limparAutoThrottleCoban(imeiJ16);
    modeloRastreadorPorImei.set(imeiJ16, "Voxter J16 4G");

    conexoesAtivas.set(socketJ16, {
      imei: imeiJ16,
      modeloRastreador: "Voxter J16 4G",
      placa: "AXH0E44",
      modeloVeiculo: "Volvo XC 60 T6",
    });

    const mock = socketJ16 as unknown as MockSocket;

    // 7.1 Pacote 0x13 Heartbeat com ignição ligada (TerminalInfo = 0x06: Bit 1 = 1)
    // Formato GT06: 0x78 0x78 0x0A 0x13 <termInfo=0x06> <voltage=0x06> <gsm=0x04> <language=0x00 0x01> <serial=0x00 0x01> <crc=0x00 0x00> <0x0D 0x0A>
    const pktHbtLigado = Buffer.from([
      0x78, 0x78, 0x0a, 0x13, 0x06, 0x06, 0x04, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x0d, 0x0a,
    ]);
    await processarPacote(socketJ16, pktHbtLigado);

    // O socket deve receber estritamente o ACK GT06 (0x7878 0x05 0x13...) e JAMAIS qualquer frame Coban C,10s
    assert.ok(mock.written.length > 0, "Deve responder ACK GT06");
    for (const pkt of mock.written) {
      const ascii = pkt.toString("ascii");
      assert.ok(
        !ascii.includes("C,10s"),
        "NUNCA deve enviar comando Coban C,10s para hardware J16",
      );
      assert.ok(!ascii.includes("**,imei:"), "NUNCA deve enviar envelope Coban para hardware J16");
    }

    // Verifica que autoThrottleCobanPorImei NÃO registrou modo 10s nem timer
    const estadoJ16 = autoThrottleCobanPorImei.get(imeiJ16);
    assert.equal(estadoJ16, undefined, "Não deve criar estado de Auto-Throttle para hardware J16");

    // 7.2 Pacote 0x13 Heartbeat com ignição desligada (TerminalInfo = 0x04: Bit 1 = 0)
    const pktHbtDesligado = Buffer.from([
      0x78, 0x78, 0x0a, 0x13, 0x04, 0x06, 0x04, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x0d, 0x0a,
    ]);
    await processarPacote(socketJ16, pktHbtDesligado);

    // Não deve haver nenhum timer de repouso
    const estadoJ16Off = autoThrottleCobanPorImei.get(imeiJ16);
    assert.equal(
      estadoJ16Off?.timerRepouso,
      undefined,
      "Não deve agendar timer de repouso para J16",
    );

    // Tentar disparar repouso retorna false silenciosamente
    const tentouRepousoJ16 = dispararComandoRepousoCoban(imeiJ16, Date.now() + 150_000);
    assert.equal(tentouRepousoJ16, false, "Disparo de repouso deve recusar J16");

    // Chamada direta a processarAutoThrottleCoban retorna modelo_nao_elegivel
    const resDireto = processarAutoThrottleCoban(imeiJ16, false, 0, socketJ16);
    assert.equal(resDireto.acao, "modelo_nao_elegivel");

    // Nenhum comando Coban C,05m foi gravado no socket
    for (const pkt of mock.written) {
      const ascii = pkt.toString("ascii");
      assert.ok(!ascii.includes("C,05m"), "NUNCA deve enviar C,05m para J16");
    }

    conexoesAtivas.delete(socketJ16);
  });

  it("8. Normalização e Validação do Modelo G900L: Aceita variações e bloqueia não-identificados", () => {
    // Variações homologadas G900L (com e sem espaços)
    assert.equal(isModeloG900L("G900L"), true);
    assert.equal(isModeloG900L("G900 L"), true); // Fiat Mobi RNM1B70 no banco
    assert.equal(isModeloG900L("g900l"), true);
    assert.equal(isModeloG900L("Coban G900L 4G"), true);

    // Modelos que NUNCA devem ativar o Auto-Throttle
    assert.equal(isModeloG900L("J16 4G"), false);
    assert.equal(isModeloG900L("Voxter J16 4G"), false);
    assert.equal(isModeloG900L("GT06"), false);
    assert.equal(isModeloG900L("TK103"), false);
    assert.equal(isModeloG900L(""), false);
    assert.equal(isModeloG900L(null), false);
    assert.equal(isModeloG900L(undefined), false);
  });
});
