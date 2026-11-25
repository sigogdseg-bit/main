import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularEstadoPulsoCentral,
  criarControladorHistereseConexao,
  JANELA_CARENCIA_DESCONEXAO_MS,
  registrarListenerRealtime,
  obterTotalListenersRealtime,
} from "../../features/monitor-gps/hooks/useGpsRealtime";

describe("Hunter — Pulso da Central 24/7 (Anti-Falso-Positivo e Queda Real)", () => {
  it("1. WebSocket SUBSCRIBED + 4 minutos (240s) sem pacotes GPS deve manter indicador VERDE", () => {
    const estado = calcularEstadoPulsoCentral({
      conectado: true,
      navegadorOnline: true,
      erroReconciliacao: false,
      segundosSemSync: 240,
      reconectando: false,
    });

    assert.equal(estado.status, "verde");
    assert.equal(estado.critico, false);
    assert.equal(estado.tempoFormatado, "4m");
    assert.equal(estado.rotulo, "Pulso · há 4m");
    assert.equal(estado.rotuloCompacto, "4m");
  });

  it("2. Queda de rede ou WebSocket desconectado muda para VERMELHO e volta a VERDE ao reconectar", () => {
    // 2a. Queda do WebSocket
    const wsCaiu = calcularEstadoPulsoCentral({
      conectado: false,
      navegadorOnline: true,
      erroReconciliacao: false,
      segundosSemSync: 12,
      reconectando: true,
    });
    assert.equal(wsCaiu.status, "vermelho");
    assert.equal(wsCaiu.critico, true);
    assert.equal(wsCaiu.rotulo, "Reconectando...");

    // 2b. Navegador offline
    const semInternet = calcularEstadoPulsoCentral({
      conectado: true,
      navegadorOnline: false,
      erroReconciliacao: false,
      segundosSemSync: 5,
      reconectando: false,
    });
    assert.equal(semInternet.status, "vermelho");
    assert.equal(semInternet.critico, true);
    assert.equal(semInternet.rotulo, "Sem Internet");

    // 2c. Falha na reconciliação de 5 min
    const erroReconciliacao = calcularEstadoPulsoCentral({
      conectado: true,
      navegadorOnline: true,
      erroReconciliacao: true,
      segundosSemSync: 310,
      reconectando: false,
    });
    assert.equal(erroReconciliacao.status, "vermelho");
    assert.equal(erroReconciliacao.critico, true);
    assert.equal(erroReconciliacao.rotulo, "Falha na Sincronização");

    // 2d. Recuperação (reconectou)
    const recuperado = calcularEstadoPulsoCentral({
      conectado: true,
      navegadorOnline: true,
      erroReconciliacao: false,
      segundosSemSync: 0,
      reconectando: false,
    });
    assert.equal(recuperado.status, "verde");
    assert.equal(recuperado.critico, false);
    assert.equal(recuperado.rotulo, "Pulso · há 0s");
  });

  it("3. GpsMonitorView.tsx delega estado do Pulso da Central sem alarme falso >60s", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      content.includes("calcularEstadoPulsoCentral"),
      "GpsMonitorView deve utilizar calcularEstadoPulsoCentral",
    );
    assert.ok(
      !content.includes("!conectado || segundosSemSync > 60"),
      "GpsMonitorView NÃO pode disparar alerta vermelho apenas por segundosSemSync > 60",
    );
  });

  it("4. Ciclo de vida imutável: ticks visuais de 1s e re-renders NÃO removem nem recriam canal Realtime", () => {
    const hookPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/hooks/useGpsRealtime.ts",
    );
    const hookContent = fs.readFileSync(hookPath, "utf-8");

    // Verifica que o useEffect de subscrição do canal possui array de dependências vazio []
    assert.ok(
      hookContent.includes("registrarListenerRealtime"),
      "useGpsRealtime deve utilizar o gerenciador de canal singleton registrarListenerRealtime",
    );
    assert.ok(
      hookContent.includes("recarregarRef.current = recarregar"),
      "useGpsRealtime deve manter recarregar em ref estável",
    );
    assert.ok(
      hookContent.includes("aplicarPatchImediatoRef.current = aplicarPatchImediato"),
      "useGpsRealtime deve manter aplicarPatchImediato em ref estável",
    );
    assert.ok(
      hookContent.includes(
        "agendarSincronizacaoCompletaRef.current = agendarSincronizacaoCompleta",
      ),
      "useGpsRealtime deve manter agendarSincronizacaoCompleta em ref estável",
    );

    // Testa coordenação de múltiplos ouvintes simultâneos sem destruição prematura do canal
    const antes = obterTotalListenersRealtime();
    const unsub1 = registrarListenerRealtime({
      onVeiculoAtualizado: () => {},
      onTelemetriaAtualizada: () => {},
      onStatusChange: () => {},
    });
    assert.equal(obterTotalListenersRealtime(), antes + 1);

    const unsub2 = registrarListenerRealtime({
      onVeiculoAtualizado: () => {},
      onTelemetriaAtualizada: () => {},
      onStatusChange: () => {},
    });
    assert.equal(obterTotalListenersRealtime(), antes + 2);

    // Desmontar uma instância não remove o canal da outra
    unsub1();
    assert.equal(obterTotalListenersRealtime(), antes + 1);

    unsub2();
    assert.equal(obterTotalListenersRealtime(), antes);
  });

  it("5. Histerese anti-flicker: oscilação rápida (<4s) mantém indicador estável em verde sem piscar 'Sem Conexão'", async () => {
    let transicoesConectado: boolean[] = [];
    let transicoesReconectando: boolean[] = [];
    let reconectouSucesso = false;

    const histerese = criarControladorHistereseConexao({
      aoMudarConectado: (c) => transicoesConectado.push(c),
      aoMudarReconectando: (r) => transicoesReconectando.push(r),
      aoReconectarSucesso: () => {
        reconectouSucesso = true;
      },
      janelaCarenciaMs: 80, // janela encurtada para agilidade do teste
    });

    assert.equal(histerese.obterConectado(), true);
    assert.equal(histerese.obterReconectando(), false);

    // 5a. Oscilação rápida: CLOSED recebido com internet online
    histerese.notificarStatus("CLOSED", true);

    // Imediatamente após CLOSED: reconectando vira true, mas conectado PERMANECE true (dentro dos 4s)
    assert.equal(histerese.obterReconectando(), true);
    assert.equal(histerese.obterConectado(), true);

    // Indicador visual permanece VERDE durante a oscilação rápida
    const estadoDuranteOscilacao = calcularEstadoPulsoCentral({
      conectado: histerese.obterConectado(),
      navegadorOnline: true,
      erroReconciliacao: false,
      segundosSemSync: 1,
      reconectando: histerese.obterReconectando(),
    });
    assert.equal(estadoDuranteOscilacao.status, "verde");
    assert.equal(estadoDuranteOscilacao.critico, false);

    // 5b. WebSocket volta para SUBSCRIBED antes do fim da carência (ex.: 20ms)
    await new Promise((resolve) => setTimeout(resolve, 20));
    histerese.notificarStatus("SUBSCRIBED", true);

    assert.equal(histerese.obterReconectando(), false);
    assert.equal(histerese.obterConectado(), true);
    assert.equal(reconectouSucesso, true);

    // Comprova que 'conectado' NUNCA virou false (zero flicker para vermelho)
    assert.ok(
      !transicoesConectado.includes(false),
      "conectado NÃO pode ter transitado para false durante oscilação transitória",
    );

    // 5c. Queda real de internet: corta imediatamente para vermelho sem carência
    transicoesConectado = [];
    histerese.notificarStatus("CLOSED", false);
    assert.equal(histerese.obterConectado(), false);
    assert.equal(transicoesConectado[0], false);

    const estadoOffline = calcularEstadoPulsoCentral({
      conectado: histerese.obterConectado(),
      navegadorOnline: false,
      erroReconciliacao: false,
      segundosSemSync: 2,
      reconectando: false,
    });
    assert.equal(estadoOffline.status, "vermelho");
    assert.equal(estadoOffline.rotulo, "Sem Internet");

    // 5d. Queda persistente de WebSocket (> janelaCarenciaMs): desliga após expiração
    histerese.notificarStatus("SUBSCRIBED", true);
    assert.equal(histerese.obterConectado(), true);

    transicoesConectado = [];
    histerese.notificarStatus("CLOSED", true);
    assert.equal(histerese.obterConectado(), true); // ainda verde

    // Aguarda carência expirar
    await new Promise((resolve) => setTimeout(resolve, 110));
    assert.equal(histerese.obterConectado(), false); // agora virou false
    assert.equal(transicoesConectado[0], false);

    histerese.destruir();
  });
});
