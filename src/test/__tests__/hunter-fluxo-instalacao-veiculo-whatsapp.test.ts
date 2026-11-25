import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  notificarInstaladorNovoServicoWhatsapp,
  notificarClienteAgendamentoInstalacaoWhatsapp,
  processarMensagemWhatsappRecebida,
  parsearNovaDataHoraInstaladorWhatsapp,
  formatarTipoVeiculoLabel,
} from "../../features/chat/services/whatsappAutoMonitoramentoService";

function criarMockSupabaseFluxoInstalacao() {
  let sessoes: any[] = [];
  const instalacoes: any[] = [
    {
      id: "inst-001",
      cliente_id: "cli-001",
      instalador_id: "inst-user-001",
      veiculo_id: "veic-001",
      tipo_veiculo: "moto",
      placa: "A DEFINIR",
      marca: "Veículo",
      modelo: "Padrão",
      rastreador_imei: "869890084963382",
      local_tipo: "oficina",
      local_endereco: "Rua das Oficinas, 120 — Volta Redonda/RJ",
      status: "agendada",
      data_agendamento: "2026-11-18",
      hora_agendamento: "10:00",
    },
  ];
  const clientes: any[] = [
    {
      id: "cli-001",
      nome_razao_social: "Weidisson Silva",
      telefone: "552499924121",
      instalador_id: "inst-user-001",
      status: "pendente",
      status_agendamento: "aguardando_agendamento",
      data_agendamento: null,
      hora_agendamento: null,
    },
  ];
  const profiles: any[] = [
    {
      id: "inst-user-001",
      nome: "Gilmar da Silva Barbosa",
      telefone: "5524998112233",
      role: "instalador",
      ativo: true,
      endereco_instalacao: "Rua das Oficinas, 120 — Volta Redonda/RJ",
    },
    {
      id: "adm-user-001",
      nome: "Super Administrador",
      telefone: "5524992494030",
      role: "superadmin",
      ativo: true,
    },
  ];
  const notificacoes: any[] = [];
  const historicos: any[] = [];

  function aplicarUpdateArray(arr: any[], filtro: any, payload: any) {
    for (let i = 0; i < arr.length; i++) {
      if (filtro.id && arr[i].id === filtro.id) {
        arr[i] = { ...arr[i], ...payload };
      }
    }
  }

  const supabaseMock: any = {
    _sessoes: () => sessoes,
    _instalacoes: () => instalacoes,
    _clientes: () => clientes,
    _notificacoes: () => notificacoes,
    _historicos: () => historicos,
    from: (tabela: string) => {
      const filtro: any = {};
      const qb: any = {
        select: (_cols?: string) => qb,
        eq: (col: string, val: any) => {
          filtro[col] = val;
          return qb;
        },
        in: (col: string, vals: any[]) => {
          filtro[`${col}_in`] = vals;
          return qb;
        },
        neq: (col: string, val: any) => {
          filtro[`${col}_neq`] = val;
          return qb;
        },
        or: (cond: string) => {
          filtro.or = cond;
          return qb;
        },
        order: (_col: string, _opts?: any) => qb,
        limit: (_n: number) => qb,
        maybeSingle: async () => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            const found = sessoes.find((s) => {
              if (filtro.telefone && s.telefone === filtro.telefone) return true;
              if (filtro.or && s.telefone) {
                return filtro.or.includes(s.telefone) || filtro.or.includes(s.telefone.slice(-8));
              }
              return false;
            });
            return { data: found || null, error: null };
          }
          if (tabela === "instalacoes") {
            const found = instalacoes.find((x) => !filtro.id || x.id === filtro.id);
            return { data: found || null, error: null };
          }
          if (tabela === "clientes") {
            const found = clientes.find((x) => !filtro.id || x.id === filtro.id);
            return { data: found || null, error: null };
          }
          if (tabela === "profiles") {
            const found = profiles.find((x) => !filtro.id || x.id === filtro.id);
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        insert: async (payload: any) => {
          if (tabela === "notificacoes_sistema") notificacoes.push(payload);
          if (tabela === "instalacoes_historico_atendimentos") historicos.push(payload);
          if (tabela === "whatsapp_sessoes_dialogo") {
            sessoes.push({ id: `sessao-${Date.now()}-${Math.random()}`, ...payload });
          }
          return { data: payload, error: null };
        },
        upsert: async (payload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            const idx = sessoes.findIndex((s) => s.telefone === payload.telefone);
            if (idx >= 0) {
              sessoes[idx] = { ...sessoes[idx], ...payload };
            } else {
              sessoes.push({ id: `sessao-${Date.now()}-${Math.random()}`, ...payload });
            }
          }
          return { data: payload, error: null };
        },
        update: (payload: any) => {
          const updFiltro: any = {};
          const uq: any = {
            eq: (col: string, val: any) => {
              updFiltro[col] = val;
              if (tabela === "instalacoes") aplicarUpdateArray(instalacoes, updFiltro, payload);
              if (tabela === "clientes") aplicarUpdateArray(clientes, updFiltro, payload);
              if (tabela === "whatsapp_sessoes_dialogo") {
                const idx = sessoes.findIndex((s) => s[col] === val);
                if (idx >= 0) sessoes[idx] = { ...sessoes[idx], ...payload };
              }
              return Promise.resolve({ data: payload, error: null });
            },
          };
          return uq;
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            if (tabela === "whatsapp_sessoes_dialogo") {
              sessoes = sessoes.filter((s) => s[col] !== val);
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
        then: (resolve: (val: any) => void) => {
          if (tabela === "profiles") {
            let list = [...profiles];
            if (filtro.role_in) {
              list = list.filter((p) => filtro.role_in.includes(p.role));
            }
            if (filtro.role) {
              list = list.filter((p) => p.role === filtro.role);
            }
            if (filtro.ativo !== undefined) {
              list = list.filter((p) => p.ativo === filtro.ativo);
            }
            resolve({ data: list, error: null });
            return;
          }
          if (tabela === "clientes") {
            resolve({ data: clientes, error: null });
            return;
          }
          if (tabela === "instalacoes") {
            resolve({ data: instalacoes, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return qb;
    },
  };

  return supabaseMock;
}

describe("Fluxo de Cadastro Simplificado de Veículo, Preenchimento pelo Instalador e Agendamento via WhatsApp da Central", () => {
  it("1. Operador escolhe apenas tipo de veículo e atribui rastreador; instalador preenche dados completos na conclusão", () => {
    const repoRoot = process.cwd();

    const modalDistribuir = fs.readFileSync(
      path.join(
        repoRoot,
        "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
      ),
      "utf-8",
    );
    assert.ok(
      modalDistribuir.includes("setInstaladorPreencheVeiculo] = useState(true)"),
      "ModalDistribuirInstalacoesVeiculos deve iniciar com instaladorPreencheVeiculo=true por padrão",
    );
    assert.ok(
      !modalDistribuir.includes('toast.error("Informe a Marca e Modelo do veículo.")'),
      "Não deve exigir marca/modelo do operador quando o instalador preencherá os dados do veículo",
    );

    const modalFinalizar = fs.readFileSync(
      path.join(
        repoRoot,
        "src/features/instalacoes/components/ModalFinalizarInstalacaoTecnica.tsx",
      ),
      "utf-8",
    );
    assert.ok(
      modalFinalizar.includes("Dados do Veículo (Preenchimento pelo Instalador)"),
      "ModalFinalizarInstalacaoTecnica deve exibir seção para o instalador preencher os dados do veículo",
    );
    assert.ok(
      modalFinalizar.includes("limparPlaceholderVeiculo"),
      "ModalFinalizarInstalacaoTecnica deve limpar placeholders A DEFINIR / Veículo Padrão",
    );
    assert.ok(
      modalFinalizar.includes("marca_modelo: marcaModeloConcat") &&
        modalFinalizar.includes("chassi: rawChassi || null"),
      "ModalFinalizarInstalacaoTecnica deve persistir marca_modelo, placa, chassi, ano, cor e tipo_veiculo",
    );

    const modalNova = fs.readFileSync(
      path.join(repoRoot, "src/features/instalacoes/components/NovaInstalacaoModal.tsx"),
      "utf-8",
    );
    assert.ok(
      modalNova.includes("exigirDadosVeiculo"),
      "NovaInstalacaoModal não deve exigir dados completos do veículo quando operador cria OS pendente",
    );
    assert.ok(
      modalNova.includes("limparPlaceholderCampo"),
      "NovaInstalacaoModal deve limpar placeholders para o instalador",
    );
  });

  it("2. Parser de data/horário do instalador interpreta DD/MM/AAAA HH:MM, DD/MM HHh e apenas HH:MM", () => {
    assert.deepEqual(parsearNovaDataHoraInstaladorWhatsapp("20/11/2026 14:30"), {
      dataIso: "2026-11-20",
      hora: "14:30",
    });
    assert.deepEqual(parsearNovaDataHoraInstaladorWhatsapp("16:45", "2026-11-20"), {
      dataIso: "2026-11-20",
      hora: "16:45",
    });
    assert.equal(formatarTipoVeiculoLabel("moto"), "Motocicleta");
    assert.equal(parsearNovaDataHoraInstaladorWhatsapp("sem data valida", "2026-11-20"), null);
  });

  it("3. Ciclo completo via WhatsApp da Central: Novo Serviço -> Agendamento -> Troca de Data -> Troca de Horário -> Confirmação -> Notificação ADM", async () => {
    const supabaseMock = criarMockSupabaseFluxoInstalacao();
    const mensagensEnviadas: Array<{ telefone: string; mensagem: string }> = [];

    (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__ = async (tel: string, msg: string) => {
      mensagensEnviadas.push({ telefone: tel, mensagem: msg });
      return true;
    };

    try {
      // 3.1 Operador atribui o serviço e o instalador recebe WhatsApp de novo serviço
      const resNovoServ = await notificarInstaladorNovoServicoWhatsapp(supabaseMock, {
        instalacaoId: "inst-001",
        instaladorId: "inst-user-001",
        clienteId: "cli-001",
        clienteNome: "Weidisson Silva",
        tipoVeiculo: "moto",
        placa: "A DEFINIR",
        rastreadorImei: "869890084963382",
        localTipo: "oficina",
      });

      assert.equal(resNovoServ.enviado, true);
      assert.equal(mensagensEnviadas.length, 1);
      assert.equal(mensagensEnviadas[0].telefone, "5524998112233");
      assert.ok(mensagensEnviadas[0].mensagem.includes("Novo Serviço de Instalação"));
      assert.ok(mensagensEnviadas[0].mensagem.includes("Motocicleta"));
      assert.ok(mensagensEnviadas[0].mensagem.includes("869890084963382"));
      assert.ok(!mensagensEnviadas[0].mensagem.includes("&"));

      // 3.2 Instalador agenda no app e Central dispara WhatsApp pro cliente com endereço e opções 1, 2 e 3
      const resAgend = await notificarClienteAgendamentoInstalacaoWhatsapp(supabaseMock, {
        instalacaoId: "inst-001",
        clienteId: "cli-001",
        instaladorId: "inst-user-001",
        data: "2026-11-18",
        hora: "10:00",
        localTipo: "oficina",
        localEndereco: "Rua das Oficinas, 120 — Volta Redonda/RJ",
      });

      assert.equal(resAgend.enviado, true);
      assert.equal(mensagensEnviadas.length, 2);
      const msgCliInicial = mensagensEnviadas[1].mensagem;
      assert.equal(mensagensEnviadas[1].telefone, "552499924121");
      assert.ok(msgCliInicial.includes("18/11/2026"));
      assert.ok(msgCliInicial.includes("10:00"));
      assert.ok(msgCliInicial.includes("Rua das Oficinas, 120"));
      assert.ok(msgCliInicial.includes("Confirma"));
      assert.ok(msgCliInicial.includes("Solicitar nova data"));
      assert.ok(msgCliInicial.includes("Novo horário"));
      assert.ok(!msgCliInicial.includes("&"));

      // 3.3 Cliente escolhe opção 2 (Solicitar nova data)
      const respOp2 = await processarMensagemWhatsappRecebida(
        {
          remetente: "552499924121",
          texto: "2",
        },
        supabaseMock,
      );
      assert.equal(respOp2.acaoExecutada, "agendamento_instalacao_pedir_nova_data");
      assert.ok(respOp2.resposta.includes("nova data"));

      // 3.4 Cliente informa a nova data pretendida e Central encaminha para o instalador
      const respDataCli = await processarMensagemWhatsappRecebida(
        {
          remetente: "552499924121",
          texto: "20/11/2026",
        },
        supabaseMock,
      );
      assert.equal(respDataCli.acaoExecutada, "agendamento_instalacao_nova_data_encaminhada");
      assert.equal(mensagensEnviadas.length, 3);
      assert.equal(mensagensEnviadas[2].telefone, "5524998112233");
      assert.ok(mensagensEnviadas[2].mensagem.includes("20/11/2026"));

      // 3.5 Instalador responde via WhatsApp da Central com nova data e horário (20/11/2026 14:30)
      const respInstNovaData = await processarMensagemWhatsappRecebida(
        {
          remetente: "5524998112233",
          texto: "20/11/2026 14:30",
        },
        supabaseMock,
      );
      assert.equal(
        respInstNovaData.acaoExecutada,
        "agendamento_instalacao_reagendado_e_enviado_cliente",
      );
      assert.equal(supabaseMock._instalacoes()[0].data_agendamento, "2026-11-20");
      assert.equal(supabaseMock._instalacoes()[0].hora_agendamento, "14:30");
      assert.equal(mensagensEnviadas.length, 4);
      assert.equal(mensagensEnviadas[3].telefone, "552499924121");
      assert.ok(mensagensEnviadas[3].mensagem.includes("20/11/2026"));
      assert.ok(mensagensEnviadas[3].mensagem.includes("14:30"));

      // 3.6 Cliente escolhe opção 3 (Novo horário) -> pede 16:30 -> Instalador responde 16:30
      const respOp3 = await processarMensagemWhatsappRecebida(
        {
          remetente: "552499924121",
          texto: "3",
        },
        supabaseMock,
      );
      assert.equal(respOp3.acaoExecutada, "agendamento_instalacao_pedir_novo_horario");

      const respHoraCli = await processarMensagemWhatsappRecebida(
        {
          remetente: "552499924121",
          texto: "16:30",
        },
        supabaseMock,
      );
      assert.equal(respHoraCli.acaoExecutada, "agendamento_instalacao_novo_horario_encaminhado");
      assert.equal(mensagensEnviadas.length, 5);
      assert.equal(mensagensEnviadas[4].telefone, "5524998112233");

      const respInstNovaHora = await processarMensagemWhatsappRecebida(
        {
          remetente: "5524998112233",
          texto: "16:30",
        },
        supabaseMock,
      );
      assert.equal(
        respInstNovaHora.acaoExecutada,
        "agendamento_instalacao_reagendado_e_enviado_cliente",
      );
      assert.equal(supabaseMock._instalacoes()[0].hora_agendamento, "16:30");
      assert.equal(mensagensEnviadas.length, 6);
      assert.equal(mensagensEnviadas[5].telefone, "552499924121");
      assert.ok(mensagensEnviadas[5].mensagem.includes("16:30"));

      // 3.7 Cliente responde 1 (Confirma) -> Instalador e ADM recebem mensagem via WhatsApp da Central
      const respConfirmacao = await processarMensagemWhatsappRecebida(
        {
          remetente: "552499924121",
          texto: "1",
        },
        supabaseMock,
      );
      assert.equal(respConfirmacao.acaoExecutada, "agendamento_instalacao_confirmado");
      assert.ok(respConfirmacao.resposta.includes("Agendamento Confirmado"));
      assert.equal(supabaseMock._sessoes().length, 0);

      const msgsParaInstalador = mensagensEnviadas.filter((m) => m.telefone === "5524998112233");
      const ultimaMsgInstalador = msgsParaInstalador[msgsParaInstalador.length - 1];
      assert.ok(ultimaMsgInstalador.mensagem.includes("Agendamento Confirmado pelo Cliente"));

      const msgsParaAdm = mensagensEnviadas.filter((m) => m.telefone === "5524992494030");
      assert.ok(msgsParaAdm.length >= 1, "ADM deve receber a mensagem de agendamento realizado");
      assert.ok(msgsParaAdm[0].mensagem.includes("Agendamento Realizado"));
      assert.ok(msgsParaAdm[0].mensagem.includes("20/11/2026 às 16:30"));
      assert.ok(msgsParaAdm[0].mensagem.includes("Rua das Oficinas, 120"));

      for (const m of mensagensEnviadas) {
        assert.ok(!m.mensagem.includes("&"), "Nenhuma mensagem WhatsApp deve conter caractere &");
      }
    } finally {
      delete (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__;
    }
  });

  it("4. Trata entradas inválidas no agendamento WhatsApp e expõe endpoint autenticado /api/whatsapp/instalacao-evento no server.ts", async () => {
    const supabaseMock = criarMockSupabaseFluxoInstalacao();
    const mensagensEnviadas: Array<{ telefone: string; mensagem: string }> = [];

    (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__ = async (tel: string, msg: string) => {
      mensagensEnviadas.push({ telefone: tel, mensagem: msg });
      return true;
    };

    try {
      await notificarClienteAgendamentoInstalacaoWhatsapp(supabaseMock, {
        instalacaoId: "inst-001",
        clienteId: "cli-001",
        instaladorId: "inst-user-001",
        data: "2026-11-18",
        hora: "10:00",
        localTipo: "oficina",
        localEndereco: "Rua das Oficinas, 120",
      });

      const respInvalidaCli = await processarMensagemWhatsappRecebida(
        { remetente: "552499924121", texto: "Talvez semana que vem" },
        supabaseMock,
      );
      assert.equal(respInvalidaCli.acaoExecutada, "agendamento_instalacao_opcoes_invalidas");
      assert.ok(respInvalidaCli.resposta.includes("Confirma"));

      await processarMensagemWhatsappRecebida(
        { remetente: "552499924121", texto: "2" },
        supabaseMock,
      );
      await processarMensagemWhatsappRecebida(
        { remetente: "552499924121", texto: "22/11/2026" },
        supabaseMock,
      );

      const respInvalidaInst = await processarMensagemWhatsappRecebida(
        { remetente: "5524998112233", texto: "depois eu vejo" },
        supabaseMock,
      );
      assert.equal(
        respInvalidaInst.acaoExecutada,
        "agendamento_instalacao_formato_invalido_instalador",
      );
      assert.ok(respInvalidaInst.resposta.includes("DD/MM/AAAA HH:MM"));

      const serverSrc = fs.readFileSync(path.join(process.cwd(), "src/server.ts"), "utf-8");
      assert.ok(
        serverSrc.includes('url.pathname === "/api/whatsapp/instalacao-evento"'),
        "server.ts deve expor /api/whatsapp/instalacao-evento",
      );
      assert.ok(
        serverSrc.includes("notificarInstaladorNovoServicoWhatsapp") &&
          serverSrc.includes("notificarClienteAgendamentoInstalacaoWhatsapp"),
        "server.ts deve integrar ambas as funções de disparo da Central WhatsApp",
      );
    } finally {
      delete (globalThis as any).__HUNTER_WHATSAPP_TEST_SENDER__;
    }
  });

  it("5. Alinha todos os tipos de veículo da UI/service (incluindo moto_eletrica e quadriciculo) com chk_tipo_veiculo e índice parcial uq_veiculos_placa_real", () => {
    const repoRoot = process.cwd();
    const migrationSql = fs.readFileSync(
      path.join(
        repoRoot,
        "supabase/migrations/20261112190000_hunter_tipo_veiculo_moto_eletrica_e_placa_flexivel.sql",
      ),
      "utf-8",
    );

    assert.ok(
      migrationSql.includes("DROP CONSTRAINT IF EXISTS chk_tipo_veiculo") &&
        migrationSql.includes("ADD CONSTRAINT chk_tipo_veiculo"),
      "Migration deve recriar chk_tipo_veiculo",
    );
    assert.ok(
      migrationSql.includes("'moto_eletrica'") &&
        migrationSql.includes("'quadriciculo'") &&
        migrationSql.includes("'equipamento'") &&
        migrationSql.includes("'van'") &&
        migrationSql.includes("'ambulancia'"),
      "chk_tipo_veiculo deve aceitar moto_eletrica, quadriciculo, equipamento, van e ambulancia",
    );
    assert.ok(
      migrationSql.includes("DROP CONSTRAINT veiculos_placa_key") &&
        migrationSql.includes("CREATE UNIQUE INDEX uq_veiculos_placa_real") &&
        migrationSql.includes("'SEMPLACA'") &&
        migrationSql.includes("'A DEFINIR'"),
      "Migration deve remover veiculos_placa_key rígido e criar uq_veiculos_placa_real parcial para SEMPLACA e A DEFINIR",
    );

    const modalDistribuir = fs.readFileSync(
      path.join(
        repoRoot,
        "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
      ),
      "utf-8",
    );
    const modalFinalizar = fs.readFileSync(
      path.join(
        repoRoot,
        "src/features/instalacoes/components/ModalFinalizarInstalacaoTecnica.tsx",
      ),
      "utf-8",
    );

    assert.ok(
      modalDistribuir.includes('<option value="moto_eletrica">') &&
        modalDistribuir.includes('<option value="quadriciculo">') &&
        !modalDistribuir.includes('<option value="quadriciclo">'),
      "ModalDistribuirInstalacoesVeiculos deve usar valores canônicos moto_eletrica e quadriciculo",
    );
    assert.ok(
      modalFinalizar.includes('<option value="moto_eletrica">') &&
        modalFinalizar.includes('<option value="quadriciculo">') &&
        !modalFinalizar.includes('<option value="quadriciclo">'),
      "ModalFinalizarInstalacaoTecnica deve usar valores canônicos moto_eletrica e quadriciculo",
    );

    const clienteService = fs.readFileSync(
      path.join(repoRoot, "src/features/clientes/services/clienteService.ts"),
      "utf-8",
    );
    assert.ok(
      clienteService.includes('rawTipo === "quadriciclo" ? "quadriciculo"') &&
        clienteService.includes('"moto_eletrica"'),
      "cadastrarVeiculoParaCliente deve normalizar quadriciclo e suportar moto_eletrica",
    );
  });
});
