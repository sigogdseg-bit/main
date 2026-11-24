import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calcularEstadoPulsoCentral } from "../../features/monitor-gps/hooks/useGpsRealtime";

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
});
