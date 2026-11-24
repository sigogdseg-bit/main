import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type * as net from "node:net";
import type * as http from "node:http";

process.env.GATEWAY_TEST_MODE = "true";
process.env.NODE_ENV = "test";

const {
  processarPacote,
  conexoesAtivas,
  enviarComandoParaRastreador,
  processarAutoThrottleCoban,
  dispararComandoRepousoCoban,
  limparAutoThrottleCoban,
  validarAutenticacaoHttp,
  modeloRastreadorPorImei,
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

describe("Hunter GPS Gateway — Hotfix de Segurança e Protocolo GT06 0x80", () => {
  const TEST_IMEI_GT06 = "865893084699018";

  beforeEach(() => {
    limparAutoThrottleCoban(TEST_IMEI_GT06);
    modeloRastreadorPorImei.set(TEST_IMEI_GT06, "G900L");
  });

  it("a) Socket GT06 (0x7878) com hardware modelo G900L/Coban empacota comandos exclusivamente em binário 0x80 (nunca **,imei:...;)", async () => {
    const socket = new MockSocket() as unknown as net.Socket;

    // Conexão criada na porta 7003 (onde modelo comercial pode ser 'coban' para G900L)
    conexoesAtivas.set(socket, {
      imei: TEST_IMEI_GT06,
      modeloRastreador: "G900L",
      protocoloDispositivo: "coban",
    });

    // Simula chegada de um pacote de Login GT06 real (0x78 0x78 0x0d 0x01 ...)
    // IMEI: 865893084699018 (em BCD de 8 bytes: 08 65 89 30 84 69 90 18)
    const loginPacket = Buffer.from("78780d010865893084699018000100020d0a", "hex");
    await processarPacote(socket, loginPacket);

    const conn = conexoesAtivas.get(socket);
    assert.ok(conn, "Conexão deve existir");
    assert.equal(
      conn?.protocoloTransporte,
      "gt06",
      "Recebimento de header 0x7878 deve definir protocoloTransporte como 'gt06'",
    );

    // Limpa respostas de handshake para focar no envio do comando
    const mock = socket as unknown as MockSocket;
    mock.written = [];

    // Envia comando para o rastreador
    const res = await enviarComandoParaRastreador(TEST_IMEI_GT06, "PARAM#");
    assert.equal(res.enviado, true, "Comando deve ser enviado com sucesso");

    assert.equal(mock.written.length, 1, "Deve ter transmitido 1 pacote no socket");
    const pkt = mock.written[0];

    // O pacote DEVE ser binário GT06 (0x78 0x78 ...) com opcode 0x80
    assert.equal(pkt.readUInt16BE(0), 0x7878, "Header do comando deve ser GT06 0x7878");
    assert.equal(pkt.readUInt8(3), 0x80, "Opcode do protocolo deve ser 0x80 (Comando GT06)");

    // NÃO PODE ser texto ASCII Coban **,imei:...
    const textoAscii = pkt.toString("ascii");
    assert.ok(
      !textoAscii.includes("**,imei:"),
      "Comando NUNCA deve ser empacotado como ASCII Coban em socket GT06",
    );
    assert.ok(!textoAscii.includes("##,imei:"), "Comando NUNCA deve conter cabeçalho Coban ASCII");

    conexoesAtivas.delete(socket);
  });

  it("b) /api/comando e /api/conexoes retornam 401 sem credencial válida", () => {
    // 1. Sem nenhum header de autorização
    const reqSemAuth = {
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    assert.equal(
      validarAutenticacaoHttp(reqSemAuth),
      false,
      "Deve recusar requisição sem cabeçalhos de autenticação",
    );

    // 2. Com token inválido via Bearer
    const reqTokenInvalido = {
      headers: { authorization: "Bearer token-falso-12345" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    assert.equal(
      validarAutenticacaoHttp(reqTokenInvalido),
      false,
      "Deve recusar token inválido via Bearer",
    );

    // 3. Com segredo inválido via x-gateway-secret
    const reqSecretInvalido = {
      headers: { "x-gateway-secret": "segredo-incorreto" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    assert.equal(
      validarAutenticacaoHttp(reqSecretInvalido),
      false,
      "Deve recusar segredo inválido via x-gateway-secret",
    );

    // 4. Com credencial válida via Bearer
    const reqTokenValido = {
      headers: {
        authorization: "Bearer hunter-gateway-secret-2026",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    assert.equal(
      validarAutenticacaoHttp(reqTokenValido),
      true,
      "Deve aceitar credencial válida via Bearer",
    );

    // 5. Com credencial válida via x-gateway-secret
    const reqSecretValido = {
      headers: {
        "x-gateway-secret": "hunter-gateway-secret-2026",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    assert.equal(
      validarAutenticacaoHttp(reqSecretValido),
      true,
      "Deve aceitar credencial válida via x-gateway-secret",
    );
  });

  it("c) processarAutoThrottleCoban não envia C,05m nem C,10s ASCII em socket GT06", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {
      imei: TEST_IMEI_GT06,
      modeloRastreador: "G900L",
      protocoloDispositivo: "coban",
      protocoloTransporte: "gt06", // Transporte ativo é GT06
    });

    const mock = socket as unknown as MockSocket;
    const t0 = 3_000_000;

    // Tentativa com movimento
    const resMovimento = processarAutoThrottleCoban(TEST_IMEI_GT06, true, 25, socket, t0);
    assert.equal(
      resMovimento.acao,
      "modelo_nao_elegivel",
      "Auto-throttle Coban deve ignorar sockets com transporte GT06",
    );
    assert.equal(
      mock.written.length,
      0,
      "Não deve ter despachado nenhum pacote Coban ASCII em movimento",
    );

    // Tentativa com repouso
    const resRepouso = processarAutoThrottleCoban(TEST_IMEI_GT06, false, 0, socket, t0 + 10_000);
    assert.equal(
      resRepouso.acao,
      "modelo_nao_elegivel",
      "Auto-throttle Coban deve ignorar repouso em sockets com transporte GT06",
    );

    const despachouRepouso = dispararComandoRepousoCoban(TEST_IMEI_GT06, t0 + 130_000);
    assert.equal(
      despachouRepouso,
      false,
      "dispararComandoRepousoCoban deve retornar false e não despachar em socket GT06",
    );
    assert.equal(
      mock.written.length,
      0,
      "Nenhum pacote C,05m ou C,10s ASCII deve ser enviado ao socket GT06",
    );

    conexoesAtivas.delete(socket);
  });

  it("d) Gatilho de movimento não deve disparar quando ignicao === false e velocidade for ruído (<= 15 km/h)", () => {
    const socket = new MockSocket() as unknown as net.Socket;
    // Socket em transporte coban_ascii para testar a lógica do gatilho
    conexoesAtivas.set(socket, {
      imei: "359710040000000",
      modeloRastreador: "G900L",
      protocoloDispositivo: "coban",
      protocoloTransporte: "coban_ascii",
    });

    const mock = socket as unknown as MockSocket;
    const t0 = 4_000_000;

    // Com ignicao === false e velocidade 4 km/h (ruído de GPS com carro parado), deve entrar em repouso e NÃO enviar C,10s
    const resRuido = processarAutoThrottleCoban("359710040000000", false, 4, socket, t0);
    assert.equal(
      resRuido.acao,
      "timer_repouso_iniciado",
      "Velocidade de 4 km/h com ignição desligada não deve ativar modo movimento",
    );
    assert.equal(
      mock.written.length,
      0,
      "Não deve despachar C,10s para ruído de GPS com ignição desligada",
    );

    conexoesAtivas.delete(socket);
  });

  it("e) Geração correta de comandos G900L com injeção de senha mestre", async () => {
    const { converterComandoParaModeloHardwareG900L } =
      await import("../../../src/features/seguranca/lib/comandosDispositivoHelper.js");

    const senha = "123456";

    // 1. Timer Movimento + Parado: fix020s060m***n123456
    const cmdTimer = converterComandoParaModeloHardwareG900L("TIMER,20,3600#", senha);
    assert.equal(cmdTimer, `fix020s060m***n${senha}`);

    // Preserva se já gerado no formato nativo
    const cmdFixNativo = converterComandoParaModeloHardwareG900L("fix020s060m***n123456", senha);
    assert.equal(cmdFixNativo, "fix020s060m***n123456");

    // 2. Ângulo de Curva: ANGLE123456 25 (mínimo 25°)
    const cmdAngle = converterComandoParaModeloHardwareG900L("ANGLEVALUE=10-020", senha);
    assert.equal(cmdAngle, `ANGLE${senha} 25`);

    const cmdAngleNativo = converterComandoParaModeloHardwareG900L("ANGLE123456 25", senha);
    assert.equal(cmdAngleNativo, "ANGLE123456 25");

    // 3. Sono Profundo Parado: sleep123456 on / off
    const cmdSleep = converterComandoParaModeloHardwareG900L("MTK_DISSLP=0", senha);
    assert.equal(cmdSleep, `sleep${senha} on`);

    const cmdSleepOff = converterComandoParaModeloHardwareG900L("MTK_DISSLP=1", senha);
    assert.equal(cmdSleepOff, `sleep${senha} off`);

    // 4. Bloqueio / Desbloqueio: stop123456 / resume123456
    const cmdStop = converterComandoParaModeloHardwareG900L("RELAY,1", senha);
    assert.equal(cmdStop, `stop${senha}`);

    const cmdResume = converterComandoParaModeloHardwareG900L("RELAY,0", senha);
    assert.equal(cmdResume, `resume${senha}`);

    // 5. Comandos incompatíveis de MCU/MTK (SZCS# e CXCS#) retornam vazio para G900L
    assert.equal(converterComandoParaModeloHardwareG900L("SZCS#ACCLINE=1", senha), "");
    assert.equal(converterComandoParaModeloHardwareG900L("SZCS#GT06METER=1", senha), "");
    assert.equal(converterComandoParaModeloHardwareG900L("SZCS#GT06IEXVOL=2", senha), "");
    assert.equal(converterComandoParaModeloHardwareG900L("CXCS#ACCLINE", senha), "");
  });
});
