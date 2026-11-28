import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Auditoria Completa Alerta de Reboque (Guincho), Push e Buffer", () => {
  test("1. Gateway TCP: carrega ignicao_status no vínculo, isola buffer histórico e exige distM >= 50 no alarme 0x09", () => {
    const gwPath = path.resolve(
      __dirname,
      "../../../deploy/hunter-gateway/src/hunter-gps-gateway.ts",
    );
    const src = fs.readFileSync(gwPath, "utf-8");

    assert.ok(src.includes("pacoteHistoricoBuffer"), "Deve detectar descarga histórica em buffer");
    assert.ok(
      src.includes("buf.readUInt8(offset + 28) === 0x01"),
      "Deve detectar flag de re-upload no protocolo 0x22",
    );
    assert.ok(
      src.includes("distM === null ||\n            distM < 50") ||
        src.includes("distM === null || distM < 50"),
      "Alarme 0x09 deve exigir referência anterior (distM !== null)",
    );
    assert.ok(
      src.includes("ignicao_status") && src.includes("veiculoPorImei.ignicao_status"),
      "vincularRastreadorAoVeiculo deve inicializar ignicaoStatus ao reconectar",
    );
  });

  test("2. Migração SQL 20261128103000: corrige pg_net para gd.oficial.tec.br, timeout 15s, buffer e janela >= 90s", () => {
    const sqlPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/20261128103000_hunter_fix_completo_alerta_reboque_e_push.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    assert.ok(
      !sql.includes("sigoguardiao.oficial.tec.br"),
      "Nunca apontar pg_net ao outro domínio",
    );
    assert.ok(sql.includes("https://gd.oficial.tec.br/api/push/disparar"));
    assert.ok(sql.includes("timeout_milliseconds := 15000"));
    assert.ok(sql.includes("NEW.data_hora_gps < v_ultima_atualizacao"));
    assert.ok(sql.includes("INTERVAL '180 seconds'"));
    assert.ok(sql.includes(">= 90.0"));
    assert.ok(sql.includes("notificacoes_configuracoes"));
    assert.ok(sql.includes("hunter_alerta_pode_emitir"));
    assert.ok(sql.includes("NOTIFY pgrst, 'reload schema';"));
  });

  test("3. Frontend e Backend: sem destinatários fixos em código e respeito às preferências configuradas", () => {
    const gpsViewPath = path.resolve(
      __dirname,
      "../../features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const gpsViewSrc = fs.readFileSync(gpsViewPath, "utf-8");
    assert.ok(gpsViewSrc.includes("pacoteRecenteGuincho"));

    const serverPath = path.resolve(__dirname, "../../server.ts");
    const serverSrc = fs.readFileSync(serverPath, "utf-8");
    assert.ok(serverSrc.includes("carregarContextoEquipeTecnica"));
    assert.ok(serverSrc.includes("resolverRegraEntregaAlerta"));
    assert.ok(serverSrc.includes("resolverRegraMembroEquipeServer"));
    assert.ok(serverSrc.includes("regras_veiculo?veiculo_id=eq."));
  });
});
