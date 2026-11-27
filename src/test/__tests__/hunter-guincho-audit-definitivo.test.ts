import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type * as net from "node:net";
import { aplicarPatchTempoRealNaLista } from "../../features/monitor-gps/hooks/useGpsRealtime";
import type { VeiculoGps } from "../../features/monitor-gps/types";

process.env.GATEWAY_TEST_MODE = "true";
process.env.NODE_ENV = "test";

const { processarPacote, conexoesAtivas } =
  await import("../../../deploy/hunter-gateway/src/hunter-gps-gateway.js");

class MockSocket extends EventEmitter {
  public written: Buffer[] = [];
  public destroyed = false;
  public writable = true;
  public remoteAddress = "127.0.0.1";
  public remotePort = 55001;

  write(data: Buffer | string): boolean {
    this.written.push(typeof data === "string" ? Buffer.from(data, "ascii") : data);
    return true;
  }

  destroy(): this {
    this.destroyed = true;
    this.writable = false;
    return this;
  }
}

function buildGt06Location22Packet(accByte: number, speed = 25): Buffer {
  // 0x78 0x78 <len> 0x22 <datetime 6> <sat 1> <lat 4> <lon 4> <speed 1> <course 2> <lbs 8> <acc 1> <serial 2> <crc 2> 0x0D 0x0A
  const payloadLen = 1 + 27 + 2 + 2; // proto(1) + info(27) + serial(2) + crc(2)
  const buf = Buffer.alloc(2 + 1 + payloadLen + 2);
  let i = 0;
  buf[i++] = 0x78;
  buf[i++] = 0x78;
  buf[i++] = payloadLen;
  buf[i++] = 0x22;
  // DateTime UTC
  buf[i++] = 26;
  buf[i++] = 11;
  buf[i++] = 27;
  buf[i++] = 15;
  buf[i++] = 0;
  buf[i++] = 0;
  // Satellites (0xC9 -> 9 sats)
  buf[i++] = 0xc9;
  // Lat / Lon (non-zero Brazil)
  buf.writeUInt32BE(Math.round(22.5 * 1800000), i);
  i += 4;
  buf.writeUInt32BE(Math.round(44.1 * 1800000), i);
  i += 4;
  // Speed
  buf[i++] = speed;
  // CourseStatus: bit 12 (0x1000 GPS fixed) + bit 11 (0x0800 West) + bit 10 = 0 (South)
  buf.writeUInt16BE(0x1800, i);
  i += 2;
  // MCC(2) + MNC(1) + LAC(2) + CellID(3) = 8 bytes
  i += 8;
  // ACC byte (offset + 26)
  buf[i++] = accByte;
  // Serial(2) + CRC(2) + Stop(2)
  buf.writeUInt16BE(1, i);
  i += 2;
  buf.writeUInt16BE(0, i);
  i += 2;
  buf[i++] = 0x0d;
  buf[i++] = 0x0a;
  return buf;
}

describe("Hunter — Auditoria Definitiva e Blindagem do Alerta de Guincho", () => {
  it("1. Gateway 0x22 decodifica ACC sem mascaramento de velocidade e suporta bitmask ACC", async () => {
    const socket = new MockSocket() as unknown as net.Socket;
    conexoesAtivas.set(socket, {
      imei: "865893084600001",
      protocoloDispositivo: "gt06",
      protocoloTransporte: "gt06",
    });

    // ACC explicitamente desligado (0x00) mesmo com velocidade 25 km/h deve manter ignicaoStatus = false (não mascarar)
    await processarPacote(socket, buildGt06Location22Packet(0x00, 25));
    assert.equal(conexoesAtivas.get(socket)?.ignicaoStatus, false);

    // ACC ligado bit 0x01 -> true
    await processarPacote(socket, buildGt06Location22Packet(0x01, 0));
    assert.equal(conexoesAtivas.get(socket)?.ignicaoStatus, true);

    // ACC desligado e depois ACC ligado bitmask 0x03 -> true
    await processarPacote(socket, buildGt06Location22Packet(0x00, 0));
    assert.equal(conexoesAtivas.get(socket)?.ignicaoStatus, false);
    await processarPacote(socket, buildGt06Location22Packet(0x03, 18));
    assert.equal(conexoesAtivas.get(socket)?.ignicaoStatus, true);

    conexoesAtivas.delete(socket);
  });

  it("2. Gateway 0x16/0x26 exige gpsFixado, >= 20 km/h e >= 50m para classificar guincho", () => {
    const gwDeploy = fs.readFileSync(
      path.resolve(process.cwd(), "deploy/hunter-gateway/src/hunter-gps-gateway.ts"),
      "utf-8",
    );
    const gwRoot = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts"),
      "utf-8",
    );

    assert.equal(gwDeploy, gwRoot, "Gateways deploy e scripts devem permanecer idênticos");
    assert.ok(gwDeploy.includes("!gpsFixado ||"));
    assert.ok(gwDeploy.includes("velocidade < 20"));
    assert.ok(gwDeploy.includes("distM < 50"));
    assert.ok(gwDeploy.includes("coordsValidas && gpsFixado && !saltoImpossivel"));
    assert.ok(!gwDeploy.includes("velocidade < 15"));
  });

  it("3. Frontend (gpsService e useGpsRealtime) nunca força ignicao = true quando velocidade > 3", () => {
    const gpsServiceCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/monitor-gps/services/gpsService.ts"),
      "utf-8",
    );
    assert.equal(
      gpsServiceCode.includes("!!v.ignicao_status || velocidade > 3"),
      false,
      "gpsService não deve mascarar ignicao_status false como true via velocidade > 3",
    );

    const listaBase: VeiculoGps[] = [
      {
        id: "v-guincho-1",
        cliente_id: "c-1",
        placa: "RFO6I08",
        marca_modelo: "Teste",
        ignicao: false,
        ignicao_status: false,
        gps_fixado: true,
        bloqueado: false,
        velocidade: 0,
        odometro: 1000,
        latitude: -22.5,
        longitude: -44.1,
        ultima_atualizacao: "2026-11-27T15:00:00.000Z",
        status_operacional: "estacionado",
      },
    ];

    const res = aplicarPatchTempoRealNaLista(listaBase, {
      veiculoId: "v-guincho-1",
      velocidade: 25,
      ignicao: false,
      gps_fixado: true,
      ultima_atualizacao: "2026-11-27T15:00:10.000Z",
    });

    assert.equal(res.alterado, true);
    assert.equal(res.lista[0].ignicao, false, "Ignição desligada real deve ser preservada na UI");
    assert.equal(
      res.lista[0].status_operacional,
      "em_rota",
      "Veículo em deslocamento (> 3 km/h) deve refletir movimento no mapa sem alterar ignicao",
    );
  });

  it("4. GpsMonitorView ALERTA 4 exige gps_fixado, >= 20 km/h, 5 leituras e >= 50m", () => {
    const gpsView = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/monitor-gps/components/GpsMonitorView.tsx"),
      "utf-8",
    );

    assert.ok(gpsView.includes("v.gps_fixado !== false"));
    assert.ok(gpsView.includes("v.velocidade >= 20"));
    assert.ok(gpsView.includes("contagemGuincho >= 5 && distDeslocamentoM >= 50"));
  });

  it("5. Banco de Dados: migration 20261127153000 corrige nome do trigger, filtra pacotes sem fix e sincroniza bundles", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261127153000_hunter_fix_definitivo_guincho_e_telemetria.sql",
    );
    const applyPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const fullPath = path.resolve(process.cwd(), "supabase/CRIAR_BANCO_COMPLETO_NOVO_SUPABASE.sql");

    const migSql = fs.readFileSync(migPath, "utf-8");
    const applySql = fs.readFileSync(applyPath, "utf-8");
    const fullSql = fs.readFileSync(fullPath, "utf-8");

    const marcadoresObrigatorios = [
      "CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(",
      "v_bloquear_posicao_veiculo",
      "CREATE OR REPLACE FUNCTION public.trigger_avaliar_alertas_telemetria()",
      "AND OLD.ignicao_status IS FALSE",
      "AND COALESCE(NEW.gps_fixado, true) = true",
      "AND COALESCE(NEW.velocidade_atual, 0) >= 20",
      "AND v_dist_metros >= 50.0",
      "v_qtd_telem_guincho >= 2",
      "CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()",
      "NOTIFY pgrst, 'reload schema';",
    ];

    for (const marcador of marcadoresObrigatorios) {
      assert.ok(migSql.includes(marcador), `Migration deve conter ${marcador}`);
      assert.ok(applySql.includes(marcador), `APLICAR_NO_SQL_EDITOR deve conter ${marcador}`);
      assert.ok(fullSql.includes(marcador), `CRIAR_BANCO_COMPLETO deve conter ${marcador}`);
    }
  });
});
