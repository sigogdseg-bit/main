import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type * as net from "node:net";

process.env.GATEWAY_TEST_MODE = "true";
process.env.NODE_ENV = "test";

const {
  extrairFramesDoBufferTcp,
  montarPacoteComandoCoban,
  processarPacote,
  conexoesAtivas,
  enviarComandoParaRastreador,
  aguardarRespostaHardwareJ16,
} = await import("../../../deploy/hunter-gateway/src/hunter-gps-gateway.js");

class MockSocket extends EventEmitter {
  public written: Buffer[] = [];
  public destroyed = false;
  public remoteAddress = "127.0.0.1";
  public remotePort = 54321;

  write(data: Buffer | string): boolean {
    const buf = typeof data === "string" ? Buffer.from(data, "ascii") : data;
    this.written.push(buf);
    return true;
  }

  destroy(): this {
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}

describe("Hunter GPS Gateway — Protocolo Coban (GPS103) e Framing TCP", () => {
  it("1. Login Coban (##,imei:359710040000000,A;) deve responder exatamente 'LOAD' (4c 4f 41 44)", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {});

    const loginFrame = Buffer.from("##,imei:359710040000000,A;");
    await processarPacote(socket, loginFrame);

    const mock = socket as unknown as MockSocket;
    assert.ok(mock.written.length > 0, "Deveria ter enviado resposta de handshake");
    const resp = mock.written[0];
    assert.equal(resp.toString("ascii"), "LOAD", "Resposta deve ser exatamente LOAD");
    assert.equal(resp.toString("hex"), "4c4f4144", "Bytes HEX devem ser exatamente 4c 4f 41 44");

    const conn = conexoesAtivas.get(socket);
    assert.equal(conn?.imei, "359710040000000", "IMEI deve ser associado à conexão");
    assert.equal(conn?.protocoloDispositivo, "coban", "Protocolo deve ser marcado como coban");

    conexoesAtivas.delete(socket);
  });

  it("2. Heartbeat Coban (359710040000000;) deve responder imediatamente 'ON' (4f 4e)", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {});

    const hbtFrame = Buffer.from("359710040000000;");
    await processarPacote(socket, hbtFrame);

    const mock = socket as unknown as MockSocket;
    assert.ok(mock.written.length > 0, "Deveria ter enviado resposta de heartbeat");
    const resp = mock.written[0];
    assert.equal(resp.toString("ascii"), "ON", "Resposta deve ser exatamente ON");
    assert.equal(resp.toString("hex"), "4f4e", "Bytes HEX devem ser exatamente 4f 4e");

    const conn = conexoesAtivas.get(socket);
    assert.equal(conn?.imei, "359710040000000", "IMEI deve ser extraído do heartbeat");
    assert.equal(conn?.protocoloDispositivo, "coban", "Protocolo deve ser marcado como coban");

    conexoesAtivas.delete(socket);
  });

  it("3. Montagem de comandos Coban B, C,30s, J, K deve gerar envelope oficial **,imei:<imei>,<cmd>;", () => {
    const imei = "359710040000000";

    const pktJ = montarPacoteComandoCoban(imei, "J");
    assert.equal(pktJ.toString("ascii"), `**,imei:${imei},J;`);
    assert.equal(
      pktJ.toString("hex"),
      "2a2a2c696d65693a3335393731303034303030303030302c4a3b",
      "HEX exato de **,imei:359710040000000,J;",
    );

    const pktB = montarPacoteComandoCoban(imei, "B");
    assert.equal(pktB.toString("ascii"), `**,imei:${imei},B;`);

    const pktC = montarPacoteComandoCoban(imei, "C,30s");
    assert.equal(pktC.toString("ascii"), `**,imei:${imei},C,30s;`);

    const pktK = montarPacoteComandoCoban(imei, "K");
    assert.equal(pktK.toString("ascii"), `**,imei:${imei},K;`);

    // Não deve duplicar prefixo se já vier pré-formatado
    const pktPre = montarPacoteComandoCoban(imei, `**,imei:${imei},J;`);
    assert.equal(pktPre.toString("ascii"), `**,imei:${imei},J;`);
  });

  it("4. Resolução de resposta Coban jt (bloqueio), kt (desbloqueio) e tracker", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {
      imei: "359710040000000",
      protocoloDispositivo: "coban",
      releStatus: false,
    });

    // 1. Recebe jt -> releStatus vira true
    await processarPacote(socket, Buffer.from("imei:359710040000000,jt;"));
    assert.equal(conexoesAtivas.get(socket)?.releStatus, true, "jt deve armar o relé (true)");

    // 2. Recebe kt -> releStatus vira false
    await processarPacote(socket, Buffer.from("imei:359710040000000,kt;"));
    assert.equal(conexoesAtivas.get(socket)?.releStatus, false, "kt deve desarmar o relé (false)");

    // 3. Recebe tracker -> listener síncrono recebe resposta
    const promessaResp = aguardarRespostaHardwareJ16("359710040000000", 1000);
    await processarPacote(socket, Buffer.from("imei:359710040000000,tracker,2611231030,F;"));
    const resp = await promessaResp;
    assert.ok(resp?.includes("tracker"), "Listener deve receber frame com tracker");

    conexoesAtivas.delete(socket);
  });

  it("5. Trava de segurança viária: bloqueia comando 'J' quando bloqueadorInstalado === false", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {
      imei: "359710040000000",
      protocoloDispositivo: "coban",
      bloqueadorInstalado: false,
      placa: "TESTE99",
    });

    const resultado = await enviarComandoParaRastreador("359710040000000", "J");
    assert.equal(resultado.enviado, false, "Comando de corte deve ser recusado");
    assert.equal(resultado.enfileirado, false, "Não deve ser enfileirado quando recusado");

    const mock = socket as unknown as MockSocket;
    assert.equal(mock.written.length, 0, "Nenhum byte de corte deve trafegar pelo rádio");

    conexoesAtivas.delete(socket);
  });

  it("6. Framing TCP: concatenação e fragmentação para Coban e GT06", () => {
    // 6.1. Coban Concatenado (2 frames no mesmo buffer TCP)
    const chunkCobanConcat = Buffer.from("##,imei:359710040000000,A;\r\n359710040000000;\r\n");
    const resCobanConcat = extrairFramesDoBufferTcp(chunkCobanConcat);
    assert.equal(resCobanConcat.frames.length, 2, "Deve extrair 2 frames Coban");
    assert.equal(resCobanConcat.frames[0].toString("ascii"), "##,imei:359710040000000,A;");
    assert.equal(resCobanConcat.frames[1].toString("ascii"), "359710040000000;");
    assert.equal(resCobanConcat.bufferRestante.length, 0, "Buffer restante deve ser vazio");

    // 6.2. Coban Fragmentado (frame partido em 2 chunks)
    const partCoban1 = Buffer.from("##,imei:35971004000");
    const resCobanPart1 = extrairFramesDoBufferTcp(partCoban1);
    assert.equal(resCobanPart1.frames.length, 0, "Chunk 1 incompleto não gera frame");
    assert.equal(resCobanPart1.bufferRestante.toString("ascii"), "##,imei:35971004000");

    const partCoban2 = Buffer.concat([resCobanPart1.bufferRestante, Buffer.from("0000,A;")]);
    const resCobanPart2 = extrairFramesDoBufferTcp(partCoban2);
    assert.equal(resCobanPart2.frames.length, 1, "Chunk 2 completa o frame");
    assert.equal(resCobanPart2.frames[0].toString("ascii"), "##,imei:359710040000000,A;");
    assert.equal(resCobanPart2.bufferRestante.length, 0);

    // 6.3. GT06 Concatenado (Login 10 bytes + Heartbeat 10 bytes no mesmo buffer)
    const gt06Frame1 = Buffer.from("7878050100014ebc0d0a", "hex");
    const gt06Frame2 = Buffer.from("7878051300014ebc0d0a", "hex");
    const chunkGt06Concat = Buffer.concat([gt06Frame1, gt06Frame2]);
    const resGt06Concat = extrairFramesDoBufferTcp(chunkGt06Concat);
    assert.equal(resGt06Concat.frames.length, 2, "Deve extrair 2 frames GT06");
    assert.equal(resGt06Concat.frames[0].toString("hex"), "7878050100014ebc0d0a");
    assert.equal(resGt06Concat.frames[1].toString("hex"), "7878051300014ebc0d0a");
    assert.equal(resGt06Concat.bufferRestante.length, 0);

    // 6.4. GT06 Fragmentado (10 bytes partidos em 6 bytes + 4 bytes)
    const partGt06_1 = Buffer.from("787805010001", "hex");
    const resGt06Part1 = extrairFramesDoBufferTcp(partGt06_1);
    assert.equal(resGt06Part1.frames.length, 0, "Chunk 1 GT06 incompleto não gera frame");
    assert.equal(resGt06Part1.bufferRestante.toString("hex"), "787805010001");

    const partGt06_2 = Buffer.concat([resGt06Part1.bufferRestante, Buffer.from("4ebc0d0a", "hex")]);
    const resGt06Part2 = extrairFramesDoBufferTcp(partGt06_2);
    assert.equal(resGt06Part2.frames.length, 1, "Chunk 2 GT06 completa o frame");
    assert.equal(resGt06Part2.frames[0].toString("hex"), "7878050100014ebc0d0a");
    assert.equal(resGt06Part2.bufferRestante.length, 0);
  });

  after(() => {
    for (const socket of conexoesAtivas.keys()) {
      try {
        socket.destroy();
      } catch {}
    }
    conexoesAtivas.clear();
  });
});
