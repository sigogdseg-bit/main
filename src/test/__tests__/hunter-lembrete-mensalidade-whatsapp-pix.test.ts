import test from "node:test";
import assert from "node:assert/strict";
import {
  dispararLembretePreventivoMensalidadeWhatsApp,
  formatarCompetenciaMensalidade,
} from "../../features/mensalidades/services/mensalidadeService";

test("HUNTER — Cobrança Recorrente Preventiva via WhatsApp com PIX", async (t) => {
  await t.test("1. Deve retornar erro se o cliente não possuir telefone cadastrado", async () => {
    const res = await dispararLembretePreventivoMensalidadeWhatsApp(
      { id: "cli-mock-1", nome: "Cliente Mock", telefone: null },
      {
        id: "fat-mock-1",
        valor: 79.9,
        dataVencimento: "2026-11-10",
        mesReferencia: 11,
        anoReferencia: 2026,
      },
    );
    assert.equal(res.sucesso, false);
    assert.match(res.erro || "", /sem telefone cadastrado/);
  });

  await t.test(
    "2. Deve formatar a competência no padrão oficial com sigla do mês (NOV/2026)",
    () => {
      assert.equal(formatarCompetenciaMensalidade(11, 2026), "NOV/2026");
      assert.equal(formatarCompetenciaMensalidade(1, 2026), "JAN/2026");
      assert.equal(formatarCompetenciaMensalidade(12, 2026), "DEZ/2026");
      assert.equal(formatarCompetenciaMensalidade(0, 2026), "Taxa de Ativação");
    },
  );

  await t.test(
    "3. Deve enviar mensagem formatada no padrão canônico com mock seguro (zero tráfego externo)",
    async () => {
      const originalFetch = globalThis.fetch;
      let payloadCapturado: any = null;

      globalThis.fetch = (async (_url: any, opts: any) => {
        payloadCapturado = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ id: "msg-teste-123", success: true }),
        };
      }) as any;

      try {
        const res = await dispararLembretePreventivoMensalidadeWhatsApp(
          { id: "cli-mock-2", nome: "Alex", telefone: "(24) 99999-0000" },
          {
            id: "fat-mock-2",
            valor: 60.97,
            dataVencimento: "2026-11-10",
            mesReferencia: 11,
            anoReferencia: 2026,
            chavePix: "financeiro@oficial.tec.br",
          },
        );

        assert.equal(res.sucesso, true);
        assert.ok(payloadCapturado);
        assert.equal(payloadCapturado.recipient, "5524999990000");
        assert.match(payloadCapturado.message, /Vencimento do Plano \(NOV\/2026\)/);
        assert.match(
          payloadCapturado.message,
          /fatura de NOV\/2026 com vencimento em 10\/11\/2026 no valor de R\$ 60\.97/,
        );
        assert.match(payloadCapturado.message, /Segurança Privada e Rastreamento Tático/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
