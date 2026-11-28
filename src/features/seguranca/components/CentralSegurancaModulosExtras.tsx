import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Link2,
  RefreshCw,
  Scale,
  FileText,
  UserPlus,
  ListChecks,
  ShieldCheck,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";
import {
  verificarCadeiaCustodiaLogs,
  emitirSinalAtualizacaoMassa,
  executarVerificacaoEmLote,
  type ResultadoCadeiaLogs,
  type SinalVersaoDispositivo,
  type AdminAuditLogItem,
  type EventoAntiAbusoCadastro,
  type ResultadoVerificacaoLote,
} from "../services/segurancaModulosService";

export function PainelCadeiaCustodiaLogs({
  cadeiaInicial,
  onAtualizar,
}: {
  cadeiaInicial: ResultadoCadeiaLogs | null;
  onAtualizar: (res: ResultadoCadeiaLogs | null) => void;
}) {
  const [verificando, setVerificando] = useState(false);

  const executar = async () => {
    setVerificando(true);
    const res = await verificarCadeiaCustodiaLogs();
    onAtualizar(res);
    setVerificando(false);
    if (res?.integra) {
      toast.success(`Cadeia íntegra: ${res.ok}/${res.total} eventos validados via SHA-256.`);
    } else if (res) {
      toast.error("Divergência detectada na cadeia de custódia dos logs!");
    } else {
      toast.error("Não foi possível consultar a cadeia de logs.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cadeia de Custódia dos Logs (SHA-256 Encadeado)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cada registro em system_activity_logs referencia o hash anterior (CPP art. 158-A)
            </p>
          </div>
        </div>
        <button
          onClick={executar}
          disabled={verificando}
          className="px-4 py-2 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer disabled:opacity-50"
        >
          {verificando ? "Validando SHA-256..." : "Verificar Cadeia Agora"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
          <div className="text-[11px] font-bold uppercase text-slate-500">Estado da Cadeia</div>
          <div
            className={`text-lg font-black mt-1 ${
              cadeiaInicial?.integra ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
            }`}
          >
            {cadeiaInicial ? (cadeiaInicial.integra ? "Íntegra" : "Quebra Detectada") : "—"}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
          <div className="text-[11px] font-bold uppercase text-slate-500">Registros Validados</div>
          <div className="text-lg font-black mt-1 text-slate-900 dark:text-slate-100">
            {cadeiaInicial ? `${cadeiaInicial.ok} / ${cadeiaInicial.total}` : "0 / 0"}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
          <div className="text-[11px] font-bold uppercase text-slate-500">Último Hash SHA-256</div>
          <div className="text-xs font-mono mt-1.5 text-slate-700 dark:text-slate-300 break-all">
            {cadeiaInicial?.ultimoHash || "GENESIS"}
          </div>
        </div>
      </div>

      {cadeiaInicial?.quebra && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
          <strong>Quebra localizada no seq #{cadeiaInicial.quebra.chain_seq}:</strong>{" "}
          {cadeiaInicial.quebra.acao} (esperado {cadeiaInicial.quebra.hash_esperado.slice(0, 16)}
          ..., registrado {cadeiaInicial.quebra.hash_registrado.slice(0, 16)}...)
        </div>
      )}
    </div>
  );
}

export function PainelAtualizacaoMassa({
  historico,
  somenteLeitura,
  onRecarregar,
}: {
  historico: SinalVersaoDispositivo[];
  somenteLeitura: boolean;
  onRecarregar: () => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("Atualização obrigatória de segurança e telemetria");
  const [enviando, setEnviando] = useState(false);

  const disparar = async () => {
    if (somenteLeitura) {
      toast.error("Perfil auditor em modo somente leitura.");
      return;
    }
    setEnviando(true);
    const ok = await emitirSinalAtualizacaoMassa(APP_VERSION_NUMERO, motivo);
    setEnviando(false);
    if (ok) {
      toast.success("Sinal Realtime enviado: todos os dispositivos conectados serão recarregados.");
      await onRecarregar();
    } else {
      toast.error("Falha ao emitir sinal de atualização em massa.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Forçar Atualização em Massa de Dispositivos (Realtime)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Limpa caches locais e Service Workers dos navegadores/PWAs conectados e força reload
              para v{APP_VERSION_NUMERO}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={somenteLeitura}
            placeholder="Motivo operacional da atualização..."
            className="flex-1 rounded-2xl px-4 py-2.5 text-xs bg-white/80 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          />
          <button
            onClick={disparar}
            disabled={enviando || somenteLeitura}
            className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer disabled:opacity-50"
          >
            {enviando ? "Transmitindo..." : "Disparar Atualização Agora"}
          </button>
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
        <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">
          Histórico de Sinais Emitidos
        </h4>
        {historico.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum sinal de atualização emitido ainda.</p>
        ) : (
          <div className="space-y-2">
            {historico.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 text-xs"
              >
                <div>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    v{s.versaoAlvo}
                  </span>{" "}
                  — <span className="text-slate-700 dark:text-slate-300">{s.motivo}</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {new Date(s.criadoEm).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PainelGovernancaSeguranca({ onEmitirLaudo }: { onEmitirLaudo: () => void }) {
  const normas = [
    {
      titulo: "LGPD — Princípios, Titulares e Segurança (Lei 13.709/2018)",
      artigos: "Arts. 6º, 18, 37 e 46",
      descricao:
        "Minimização de dados pessoais, isolamento multi-tenant via Row Level Security (RLS), registro formal de operações e atendimento auditável a requisições de acesso, anonimização ou exclusão.",
    },
    {
      titulo: "Cadeia de Custódia de Provas Digitais (Código de Processo Penal)",
      artigos: "Art. 158-A e Art. 158-B",
      descricao:
        "Preservação cronológica imutável via encadeamento SHA-256 em system_activity_logs, registro de hash SHA-256 para todos os laudos e propostas em documentos_emitidos e conferência pública.",
    },
    {
      titulo: "Guarda de Registros de Conexão e Acesso (Marco Civil da Internet)",
      artigos: "Art. 13 e Art. 15 (Lei 12.965/2014)",
      descricao:
        "Armazenamento detalhado de autenticações, falhas, timestamps UTC/BRT, IP e User-Agent em system_login_logs com trilha para detecção de anomalias e força bruta.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Governança de Segurança e Conformidade Legal — {APP_NOME}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Documento vivo das diretrizes técnicas, controles criptográficos e base jurídica
            </p>
          </div>
        </div>
        <button
          onClick={onEmitirLaudo}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Exportar Laudo de Governança (PDF)</span>
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {normas.map((n) => (
          <div
            key={n.titulo}
            className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-2"
          >
            <div className="text-[11px] font-bold uppercase text-orange-600 dark:text-orange-400">
              {n.artigos}
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{n.titulo}</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {n.descricao}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PainelAuditAdmin({ logs }: { logs: AdminAuditLogItem[] }) {
  return (
    <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Log de Ações Administrativas (admin_audit_logs)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Trilha imutável com executor, tabela alvo e estado anterior/novo em JSONB
          </p>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nenhuma ação administrativa registrada até o momento.
        </p>
      ) : (
        <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
          {logs.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {item.acao}{" "}
                  <span className="font-normal text-slate-500">({item.tabelaAlvo})</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {new Date(item.criadoEm).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                Executor: <strong>{item.adminNome}</strong> ({item.adminEmail})
              </div>
              {(item.dadosAnteriores || item.dadosNovos) && (
                <div className="grid sm:grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                  {item.dadosAnteriores && (
                    <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20 overflow-x-auto">
                      <span className="font-bold text-rose-600">Antes:</span>{" "}
                      {JSON.stringify(item.dadosAnteriores)}
                    </div>
                  )}
                  {item.dadosNovos && (
                    <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 overflow-x-auto">
                      <span className="font-bold text-emerald-600">Depois:</span>{" "}
                      {JSON.stringify(item.dadosNovos)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PainelMonitoramentoCadastros({ eventos }: { eventos: EventoAntiAbusoCadastro[] }) {
  return (
    <div className="p-5 rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Monitoramento Anti-Abuso de Cadastros Públicos
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Protege /cadastro-cliente, /cadastro-instalador, /cadastro-parceiro e
            /cadastro-locatario contra e-mails descartáveis e anomalias
          </p>
        </div>
      </div>

      {eventos.length === 0 ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Nenhuma tentativa abusiva ou e-mail descartável bloqueado recentemente.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {eventos.map((ev) => (
            <div
              key={ev.id}
              className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  {ev.motivoBloqueio}
                </div>
                <div className="text-[11px] text-slate-500">
                  Rota: {ev.rota} · E-mail: {ev.email || "—"}
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
                {ev.bloqueado ? "Bloqueado" : "Sinalizado"} ·{" "}
                {new Date(ev.criadoEm).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PainelVerificacaoLote({
  resultadoInicial,
  onAtualizar,
  onEmitirLaudo,
}: {
  resultadoInicial: ResultadoVerificacaoLote | null;
  onAtualizar: (res: ResultadoVerificacaoLote) => void;
  onEmitirLaudo: () => void;
}) {
  const [executando, setExecutando] = useState(false);

  const rodarLote = async () => {
    setExecutando(true);
    const res = await executarVerificacaoEmLote();
    onAtualizar(res);
    setExecutando(false);
    if (res.integridadeGeral) {
      toast.success("Verificação em Lote aprovada: logs e documentos 100% íntegros.");
    } else {
      toast.warning("Verificação em Lote identificou pendências de integridade.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ListChecks className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Verificação Criptográfica em Lote (Logs + Documentos Emitidos)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audita em paralelo a cadeia SHA-256 de system_activity_logs e os hashes de
              documentos_emitidos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={rodarLote}
            disabled={executando}
            className="px-4 py-2 rounded-2xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer disabled:opacity-50"
          >
            {executando ? "Auditando Lote..." : "Executar Verificação em Lote"}
          </button>
          <button
            onClick={onEmitirLaudo}
            className="px-4 py-2 rounded-2xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Laudo PDF
          </button>
        </div>
      </div>

      {resultadoInicial && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase text-slate-500">Veredito Conjunto</div>
            <div
              className={`text-lg font-black mt-1 flex items-center gap-1.5 ${
                resultadoInicial.integridadeGeral ? "text-emerald-600" : "text-amber-500"
              }`}
            >
              {resultadoInicial.integridadeGeral ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              <span>{resultadoInicial.integridadeGeral ? "100% Íntegro" : "Atenção"}</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase text-slate-500">Cadeia de Logs</div>
            <div className="text-lg font-black mt-1 text-slate-900 dark:text-slate-100">
              {resultadoInicial.cadeiaLogs
                ? `${resultadoInicial.cadeiaLogs.ok}/${resultadoInicial.cadeiaLogs.total}`
                : "0/0"}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase text-slate-500">Documentos SHA-256</div>
            <div className="text-lg font-black mt-1 text-slate-900 dark:text-slate-100">
              {resultadoInicial.documentosValidos}/{resultadoInicial.documentosTotal} válidos
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
