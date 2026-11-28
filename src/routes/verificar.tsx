import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Upload,
  CheckCircle2,
  Copy,
  Clock,
  Download,
  Hash,
  RefreshCw,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  verificarAutenticidadeContrato,
  type ResultadoVerificacaoContrato,
} from "@/features/clientes/services/contratosAssinadosService";
import {
  calcularSha256Buffer,
  extrairHashesCandidatosPdf,
} from "@/features/seguranca/services/documentosService";
import { APP_NOME, APP_EMPRESA } from "@/shared/lib/version";

export const Route = createFileRoute("/verificar")({
  component: PaginaVerificacaoPublica,
});

function PaginaVerificacaoPublica() {
  const [identificador, setIdentificador] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoVerificacaoContrato | null>(null);
  const [verificado, setVerificado] = useState(false);

  const executarVerificacao = useCallback(
    async (idParaBuscar?: string) => {
      const termo = (idParaBuscar || identificador).trim();
      if (!termo) {
        toast.error("Informe o Selo de Autenticidade, Código de Verificação ou Hash SHA-256.");
        return;
      }

      try {
        setCarregando(true);
        setVerificado(false);
        const res = await verificarAutenticidadeContrato(termo);
        setResultado(res);
        setVerificado(true);

        if (res.autentico) {
          toast.success("Documento autêntico localizado com sucesso!");
        } else {
          toast.error("Nenhum contrato autêntico localizado com este identificador.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Erro ao consultar autenticidade.");
      } finally {
        setCarregando(false);
      }
    },
    [identificador],
  );

  // Lê parâmetros da URL ao carregar
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const codigo = params.get("codigo") || params.get("selo") || params.get("hash");
      if (codigo) {
        setIdentificador(codigo);
        executarVerificacao(codigo);
      }
    }
  }, [executarVerificacao]);

  // Upload direto do arquivo PDF para conferir hash
  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCarregando(true);
      toast.info("Calculando hash SHA-256 do documento...");
      const buffer = await file.arrayBuffer();
      const hash = await calcularSha256Buffer(buffer);
      setIdentificador(hash);
      const res = await verificarAutenticidadeContrato(hash);
      if (res.autentico) {
        setResultado(res);
        setVerificado(true);
        toast.success("Documento autêntico localizado com sucesso!");
        return;
      }

      // Fallback para PDFs cujo hash impresso no conteúdo está em metadata->>hash_conteudo
      const candidatos = extrairHashesCandidatosPdf(buffer).filter((h) => h !== hash);
      for (const candidato of candidatos) {
        const resCandidato = await verificarAutenticidadeContrato(candidato);
        if (resCandidato.autentico) {
          setIdentificador(candidato);
          setResultado(resCandidato);
          setVerificado(true);
          toast.success("Documento autêntico localizado com sucesso!");
          return;
        }
      }

      setResultado(res);
      setVerificado(true);
      toast.error("Nenhum documento autêntico localizado com este arquivo PDF.");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao processar arquivo PDF.");
      setCarregando(false);
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const copiarTexto = (txt: string, rotulo: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${rotulo} copiado!`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      {/* Cabeçalho */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-lg shadow-emerald-500/5">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              {APP_NOME} • Portal de Autenticidade
            </h1>
            <p className="text-xs text-slate-400">
              Conferência Pública de Contratos e Documentos com Custódia Forense SHA-256
            </p>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-3xl mx-auto w-full flex-1 py-8 space-y-6">
        {/* Formulário de Busca */}
        <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Search className="h-4 w-4 text-orange-400" />
              <span>Verificar Autenticidade de Documento</span>
            </h2>
            <p className="text-xs text-slate-400">
              Digite o Selo de Autenticidade (SGD-XXXXXXXX), Código de Verificação (6 caracteres),
              Hash SHA-256 ou selecione o arquivo PDF.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              executarVerificacao();
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Ex: SGD-A1B2C3D4 ou K9X2P4 ou Hash SHA-256"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs sm:text-sm transition shadow-lg shadow-orange-600/20 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {carregando ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Verificar</span>
                </>
              )}
            </button>
          </form>

          {/* Opção de Enviar Arquivo PDF */}
          <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80">
            <span>Possui o arquivo PDF original?</span>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer transition border border-slate-700">
              <Upload className="h-3.5 w-3.5 text-orange-400" />
              <span>Enviar Arquivo PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUploadPdf}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Card de Resultado da Verificação */}
        {verificado && resultado && (
          <div
            className={`p-6 rounded-2xl border transition shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200 ${
              resultado.autentico
                ? "bg-slate-900/90 border-orange-500/40 text-slate-100"
                : "bg-red-950/30 border-red-500/40 text-slate-100"
            }`}
          >
            {/* Status Principal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl ${
                    resultado.autentico
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}
                >
                  {resultado.autentico ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <ShieldAlert className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {resultado.autentico
                      ? "CERTIDÃO DE AUTENTICIDADE DIGITAL CONFIRMADA"
                      : "DOCUMENTO NÃO LOCALIZADO OU INCONSISTENTE"}
                  </h3>
                  <p className="text-xs text-slate-400">{resultado.mensagem}</p>
                </div>
              </div>

              {resultado.autentico &&
                (resultado.status === "atualizado" ? (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Substituído por Atualização</span>
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Íntegro e Válido</span>
                  </span>
                ))}
            </div>

            {/* Metadados Forenses do Contrato */}
            {resultado.autentico && (
              <div className="space-y-3 text-xs">
                {resultado.status === "atualizado" && (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-200">
                        DOCUMENTO SUBSTITUÍDO POR ATUALIZAÇÃO
                      </p>
                      <p className="text-[11px] text-amber-300/90">
                        {resultado.motivo_invalidacao ||
                          "Este contrato é autêntico, mas foi substituído por uma versão mais recente aprovada pelo cliente."}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Número do Contrato:</span>
                    <span className="font-bold text-white text-sm">
                      {resultado.numero_contrato || "N/I"}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Cliente / Contratante:</span>
                    <span className="font-bold text-white text-sm">
                      {resultado.cliente_nome || "Cliente"}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Selo de Autenticidade:</span>
                    <button
                      type="button"
                      onClick={() => copiarTexto(resultado.selo_autenticidade || "", "Selo")}
                      className="font-mono font-bold text-orange-400 flex items-center gap-1.5 hover:underline cursor-pointer"
                    >
                      <span>{resultado.selo_autenticidade}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Código de Verificação:</span>
                    <button
                      type="button"
                      onClick={() => copiarTexto(resultado.codigo_verificacao || "", "Código")}
                      className="font-mono font-bold text-sky-400 flex items-center gap-1.5 hover:underline cursor-pointer"
                    >
                      <span>{resultado.codigo_verificacao}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Status no Banco de Dados:
                    </span>
                    <span
                      className={`font-bold capitalize ${
                        resultado.status === "atualizado"
                          ? "text-amber-400"
                          : resultado.status === "assinado"
                            ? "text-orange-400"
                            : "text-sky-400"
                      }`}
                    >
                      {resultado.status === "assinado"
                        ? "Assinado e Homologado"
                        : resultado.status === "atualizado"
                          ? "Substituído por Atualização"
                          : resultado.status === "pendente_assinatura"
                            ? "Aguardando Assinatura"
                            : resultado.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Data de Emissão:</span>
                    <span className="text-slate-200">
                      {resultado.data_emissao
                        ? new Date(resultado.data_emissao).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                          })
                        : "N/I"}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Emitido por:</span>
                    <span className="text-slate-200 font-medium">
                      {resultado.emitido_por_nome || resultado.assinado_por_nome || "N/I"}
                    </span>
                  </div>

                  {resultado.data_assinatura && (
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block text-[11px]">Data da Assinatura:</span>
                      <span className="text-orange-300 font-semibold">
                        {new Date(resultado.data_assinatura).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Hashes SHA-256 */}
                <div className="space-y-2 bg-slate-950/80 p-4 rounded-xl border border-slate-800 font-mono text-[11px]">
                  <div>
                    <div className="flex items-center justify-between text-slate-400 mb-0.5">
                      <span className="text-[10px] uppercase font-bold text-orange-400">
                        Hash SHA-256 do Documento Assinado:
                      </span>
                      {resultado.hash_pdf_assinado && (
                        <button
                          type="button"
                          onClick={() =>
                            copiarTexto(resultado.hash_pdf_assinado || "", "Hash Assinado")
                          }
                          className="hover:text-white flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copiar</span>
                        </button>
                      )}
                    </div>
                    <div className="text-slate-300 break-all select-all">
                      {resultado.hash_pdf_assinado || "Pendente de devolução assinada pelo cliente"}
                    </div>
                  </div>

                  {resultado.hash_pdf_original && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-slate-400 mb-0.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Hash SHA-256 da Minuta Original Emitida:
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            copiarTexto(resultado.hash_pdf_original || "", "Hash Original")
                          }
                          className="hover:text-white flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copiar</span>
                        </button>
                      </div>
                      <div className="text-slate-400 break-all select-all">
                        {resultado.hash_pdf_original}
                      </div>
                    </div>
                  )}
                </div>

                {/* Botão de Download */}
                {resultado.contrato_id && (
                  <div className="pt-2 flex justify-end">
                    <a
                      href={`/api/contratos/download/${resultado.contrato_id}`}
                      download
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700 shadow-md cursor-pointer"
                    >
                      <Download className="h-4 w-4 text-orange-400" />
                      <span>Baixar Documento Original em PDF</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className="max-w-4xl mx-auto w-full pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
        <p>{APP_EMPRESA} • Segurança Cibernética, Rastreamento Veicular e Telemetria Avançada.</p>
        <p className="mt-1 text-[11px] text-slate-600">
          A integridade dos registros é protegida por assinaturas digitais SHA-256 e selos
          criptográficos perpétuos.
        </p>
      </footer>
    </div>
  );
}
