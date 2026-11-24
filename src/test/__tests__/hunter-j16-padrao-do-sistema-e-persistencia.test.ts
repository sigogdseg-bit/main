import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VALORES_PADRAO_CANONICO_J16,
  CHECKBOXES_PADRAO_CANONICO_J16,
  obterConfigPadraoSistemaJ16,
  extrairTelefoneNumeroCenter,
  atualizarSenhaEmComandoCoban,
} from "../../features/seguranca/lib/rastreadorJ16Constantes";

describe("Hunter — Padrão do Sistema J16 e Persistência de Configuração", () => {
  test("1. Configuração Canônica Homologada de Fábrica possui parâmetros corretos", () => {
    // Parâmetros de rede e operadora
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.servidorDns,
      "gps.oficial.tec.br",
      "DNS canônico deve apontar para o subdomínio oficial do GD Rastreamento",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.portaTcp,
      "7003",
      "Porta TCP homologada GT06 do GD Segurança é 7003 (porta 7002 preservada para o Guardião)",
    );
    assert.equal(VALORES_PADRAO_CANONICO_J16.apnNome, "voxter.br", "APN M2M padrão é voxter.br");
    assert.equal(VALORES_PADRAO_CANONICO_J16.apnUser, "algar", "Usuário APN padrão é algar");
    assert.equal(VALORES_PADRAO_CANONICO_J16.apnPass, "1212", "Senha APN padrão é 1212");

    // Timers de transmissão (30s movimento sustentável / 1800s parado)
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.timerMovimento,
      "30",
      "Timer em movimento deve ser de 30s para conformidade estrita com a franquia de 20 MB e curvas preservadas",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.timerParado,
      "3600",
      "Timer parado deve ser de 3600s (1 hora - padrão homologado Voxter)",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.anguloIntervalo,
      "10",
      "Intervalo de curva deve ser de 10s conforme homologado no hardware e sustentabilidade de dados M2M",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.anguloGrau,
      "20",
      "Ângulo de inflexão deve ser de 20 graus para desenho de curvas sem oscilações em retas",
    );

    // Heartbeat e telemetria (keep-alive com NAT da operadora M2M)
    assert.equal(VALORES_PADRAO_CANONICO_J16.hbtLigado, "300", "HBT com chave ligada é 300s");
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.hbtDesligado,
      "300",
      "HBT desligado é 300s para manter socket TCP/NAT aberto sem perda de comandos de bloqueio",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.ignicaoFisicaCmd,
      "SZCS#ACCLINE=1",
      "Ignição física deve ser fio laranja (ACCLINE=1)",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.medicaoInternaMeterCmd,
      "SZCS#GT06SEL=1#GT06METER=1",
      "Odômetro interno de MCU deve estar ativo",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.ledsComando,
      "SZCS#LED_ENABLE=0",
      "Modo discreto com LEDs apagados",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.anguloHabilitarCmd,
      "SZCS#ANGLE,SEND=1",
      "Detecção de curva deve ser habilitada no hardware antes de calibrar ângulo",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.voltagemOdometroIexvolCmd,
      "SZCS#GT06IEXVOL=2",
      "Pacote estendido GT06 com voltagem 12V e odômetro deve estar configurado",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.sleepMtkCmd,
      "SZCS#MTK_DISSLP=0",
      "Sono da CPU MTK ao parar deve estar ativo",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.sleepGpsCmd,
      "SZCS#GPS_DISSLP=0",
      "Repouso do GPS ao parar deve estar ativo",
    );
    assert.equal(VALORES_PADRAO_CANONICO_J16.defenseCmd, "DEFENSE,1#");
    assert.equal(VALORES_PADRAO_CANONICO_J16.senalmCmd, "SENALM,ON,0#");
    assert.equal(VALORES_PADRAO_CANONICO_J16.bateriaFracaCmd, "BATALM,ON,0#");
    assert.equal(VALORES_PADRAO_CANONICO_J16.bateriaCortadaCmd, "POWERALM,ON,0,5,10#");
    assert.equal(VALORES_PADRAO_CANONICO_J16.modoVeiculoSleepCmd, "SZCS#SLPDISCONNECT=0");
    assert.equal(VALORES_PADRAO_CANONICO_J16.economiaParadaCmd, "SENDS,1#");
    assert.equal(VALORES_PADRAO_CANONICO_J16.sensorGSensibilidadeCmd, "LEVEL,3#");
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.senhaDispositivoCmd,
      "PASSWORD,<senha antiga>,<nova senha>#",
      "Comando de troca de senha deve conter apenas indicação <senha antiga> e <nova senha>",
    );
    assert.equal(VALORES_PADRAO_CANONICO_J16.resetFinalCmd, "RESET#");
  });

  test("2. Checkboxes do Padrão do Sistema possuem os comandos canônicos habilitados inicialmente", () => {
    // Comandos essenciais habilitados por padrão (IP Dedicado direto sem overhead DNS)
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.servidorDns, false);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.ipDedicado, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.portaTcp, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.apnNome, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.apnUser, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.apnPass, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.timerMovimento, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.timerParado, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.hbtLigado, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.hbtDesligado, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.anguloHabilitar, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.anguloIntervalo, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.anguloGrau, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.ignicaoFisica, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.medicaoInternaMeter, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.voltagemOdometroIexvol, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.sleepMtk, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.sleepGps, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.gmtUniversal, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.ledsDiagnostico, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.defenseAlarme, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.senalmVibracao, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.bateriaFraca, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.bateriaCortada, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.modoVeiculoSleep, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.economiaParada, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.sensorGSensibilidade, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.alertaGuincho, true);
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.resetFinal, true);

    // Consultas diagnósticas e opcionais desabilitadas por padrão no lote inicial
    assert.equal(
      CHECKBOXES_PADRAO_CANONICO_J16.paramDiagnostico,
      false,
      "Leitura EEPROM desmarcada no lote de escrita inicial",
    );
    assert.equal(
      CHECKBOXES_PADRAO_CANONICO_J16.statusDiagnostico,
      false,
      "Consulta de status desmarcada no lote de escrita inicial",
    );
    assert.equal(
      CHECKBOXES_PADRAO_CANONICO_J16.relayDiagnostico,
      false,
      "Auditoria de relé desmarcada no lote de escrita inicial",
    );
    assert.equal(
      CHECKBOXES_PADRAO_CANONICO_J16.ipDedicado,
      true,
      "IP dedicado direto fica marcado por padrão para economia de overhead DNS",
    );
    assert.equal(
      CHECKBOXES_PADRAO_CANONICO_J16.servidorDns,
      false,
      "DNS fica desmarcado no padrão em prol do IP direto",
    );
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.numeroSos, false, "SOS é opcional");
    assert.equal(CHECKBOXES_PADRAO_CANONICO_J16.numeroCenter, false, "Center é opcional");
  });

  test("3. obterConfigPadraoSistemaJ16 retorna padrão sem erros no ambiente Node (SSR)", () => {
    const config = obterConfigPadraoSistemaJ16();
    assert.ok(config.valores, "Valores devem estar definidos");
    assert.ok(config.checkboxes, "Checkboxes devem estar definidos");
    assert.equal(config.valores.servidorDns, "gps.oficial.tec.br");
    assert.equal(config.checkboxes.timerMovimento, true);
  });

  test("4. Deduplicação canônica de tripla contingência (HTTP síncrono + Realtime Broadcast + Postgres changes) descarta duplicatas em menos de 4s", () => {
    const mapaDeduplicacao = new Map<string, number>();
    const imei = "863874085222366";
    const resposta = "RELAY:0";
    const chave = `${imei}::${resposta.trim()}`;

    // 1ª entrega (via HTTP síncrono): deve ser aceita
    const agora1 = 1000;
    const tsAnterior1 = mapaDeduplicacao.get(chave);
    const deveProcessar1 = !tsAnterior1 || agora1 - tsAnterior1 >= 4000;
    assert.equal(deveProcessar1, true, "Primeira entrega deve ser processada");
    mapaDeduplicacao.set(chave, agora1);

    // 2ª entrega (via Realtime broadcast após 1000ms): deve ser descartada como duplicata
    const agora2 = 2000;
    const tsAnterior2 = mapaDeduplicacao.get(chave);
    const deveProcessar2 = !tsAnterior2 || agora2 - tsAnterior2 >= 4000;
    assert.equal(
      deveProcessar2,
      false,
      "Segunda entrega síncrona/broadcast redundante deve ser descartada",
    );

    // 3ª entrega (via Postgres changes após 1500ms): deve ser descartada como duplicata
    const agora3 = 2500;
    const tsAnterior3 = mapaDeduplicacao.get(chave);
    const deveProcessar3 = !tsAnterior3 || agora3 - tsAnterior3 >= 4000;
    assert.equal(
      deveProcessar3,
      false,
      "Terceira entrega via Postgres changes redundante deve ser descartada",
    );

    // Nova resposta legítima 10 segundos depois: deve ser aceita
    const agora4 = 12000;
    const tsAnterior4 = mapaDeduplicacao.get(chave);
    const deveProcessar4 = !tsAnterior4 || agora4 - tsAnterior4 >= 4000;
    assert.equal(
      deveProcessar4,
      true,
      "Nova resposta legítima após janela de 4s deve ser processada normalmente",
    );
  });

  test("5. extrairTelefoneNumeroCenter isola perfeitamente o número sem contaminar com a senha", () => {
    // Casos com formatos variados
    assert.equal(
      extrairTelefoneNumeroCenter("5524992494030"),
      "5524992494030",
      "Número puro deve ser mantido",
    );
    assert.equal(
      extrairTelefoneNumeroCenter("admin#123456#5524992494030#"),
      "5524992494030",
      "Deve extrair o telefone sem prefixar a senha antiga",
    );
    assert.equal(
      extrairTelefoneNumeroCenter("admin#654321#24981012184#"),
      "24981012184",
      "Deve isolar o telefone com qualquer senha mestre",
    );
    assert.equal(
      extrairTelefoneNumeroCenter("admin#00000000000#"),
      "00000000000",
      "Deve isolar número de desativação",
    );
    assert.equal(
      extrairTelefoneNumeroCenter("CENTER,A,5524992494030#"),
      "5524992494030",
      "Deve extrair de comando Concox",
    );
  });

  test("6. atualizarSenhaEmComandoCoban substitui senhas legadas em comandos Coban", () => {
    assert.equal(
      atualizarSenhaEmComandoCoban("time zone123456 0", "654321"),
      "time zone654321 0",
      "Deve atualizar senha no time zone",
    );
    assert.equal(
      atualizarSenhaEmComandoCoban("check123456", "998877"),
      "check998877",
      "Deve atualizar senha no check",
    );
    assert.equal(
      atualizarSenhaEmComandoCoban("status123456", "998877"),
      "status998877",
      "Deve atualizar senha no status",
    );
    assert.equal(
      atualizarSenhaEmComandoCoban("reset123456", "998877"),
      "reset998877",
      "Deve atualizar senha no reset",
    );
    assert.equal(
      atualizarSenhaEmComandoCoban("extpower123456 on", "998877"),
      "extpower998877 on",
      "Deve atualizar senha no extpower",
    );
    assert.equal(
      atualizarSenhaEmComandoCoban("move123456 0200", "998877"),
      "move998877 0200",
      "Deve atualizar senha no move",
    );
  });

  test("7. Integridade do código de persistência e geração de comandos em lote com nova senha", () => {
    const code = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/seguranca/components/RastreadorJ16View.tsx"),
      "utf8",
    );

    // Deve atualizar senhaDispositivoCmd e numeroCenter ao salvar nova senha
    assert.ok(
      code.includes("setSenhaDispositivoCmd(`PASSWORD,123456,${senhaLimpa}#`);"),
      "Deve atualizar setSenhaDispositivoCmd com a nova senha",
    );
    assert.ok(
      code.includes("setNumeroCenter((prev) => {"),
      "Deve atualizar setNumeroCenter com a nova senha",
    );
    assert.ok(
      code.includes("`admin#${senhaLimpa}#${tel}#`"),
      "Deve formatar numeroCenter com admin#<novaSenha>#<telefone>#",
    );

    // aplicarPadraoDoSistema deve preservar a senha customizada
    assert.ok(
      code.includes("const configPadrao = obterConfigPadraoSistemaJ16();"),
      "aplicarPadraoDoSistema deve ler a configuração atual do sistema",
    );
    assert.ok(
      code.includes("const senhaFinal ="),
      "aplicarPadraoDoSistema deve computar senhaFinal preservando customizada",
    );

    // lote de comandos deve injetar senhaAtiva no admin# e no PASSWORD
    assert.ok(
      code.includes("`admin#${senhaAtiva}#${numParte}#`"),
      "obterComandosBatchAtivos deve gerar comando admin# com senhaAtiva",
    );
    assert.ok(
      code.includes("`PASSWORD,123456,${senhaAtiva}#`"),
      "obterComandosBatchAtivos deve gerar PASSWORD com senhaAtiva",
    );
  });
});
