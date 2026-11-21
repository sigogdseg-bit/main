import { useState, useEffect } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  FileText,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
  Car,
  User,
  ShieldCheck,
  Send,
  Download,
  Users,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { formatarTelefone } from "@/shared/utils/mascaras";
import {
  obterUltimaProposta,
  criarProposta,
  editarProposta,
  enviarPropostaViaWhatsapp,
} from "../services/propostaService";
import { emitirPropostaComercialPdf } from "../services/propostaPdfService";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  type PropostaComercial,
  type TipoProposta,
  type FaixaFrota,
  FAIXAS_FROTA_PADRAO,
} from "../types/proposta";

interface ModalNovaPropostaProps {
  onFechar: () => void;
  onSucesso: (novaProposta: PropostaComercial, acaoAposSalvar?: "pdf" | "whatsapp") => void;
  propostaParaEditar?: PropostaComercial | null;
}

export function ModalNovaProposta({
  onFechar,
  onSucesso,
  propostaParaEditar,
}: ModalNovaPropostaProps) {
  const { session } = useAuth();
  const isEdicao = Boolean(propostaParaEditar);

  // Base mínima de repasse e sugestão
  const [baseRepasseMinima, setBaseRepasseMinima] = useState<number>(40.0);

  useEffect(() => {
    async function carregarBaseRepasse() {
      try {
        if (session?.isRevendedor && session?.revendedorId) {
          const { data } = await supabase
            .from("revendedores")
            .select("valor_base_sistema")
            .eq("id", session.revendedorId)
            .maybeSingle();
          if (data?.valor_base_sistema) {
            setBaseRepasseMinima(Number(data.valor_base_sistema));
          }
        } else if (session?.isVendedor && session?.vendedorId) {
          const { data } = await supabase
            .from("vendedores")
            .select("valor_base_vendedor")
            .eq("id", session.vendedorId)
            .maybeSingle();
          if (data?.valor_base_vendedor) {
            setBaseRepasseMinima(Number(data.valor_base_vendedor));
          }
        } else {
          setBaseRepasseMinima(40.0);
        }
      } catch (e) {
        console.error("Erro ao carregar base de repasse:", e);
      }
    }
    carregarBaseRepasse();
  }, [session]);

  // Modalidade da Proposta
  const [tipoProposta, setTipoProposta] = useState<TipoProposta>(
    propostaParaEditar?.tipo_proposta || "individual",
  );

  // Dados do Cliente
  const [clienteNome, setClienteNome] = useState(propostaParaEditar?.cliente_nome || "");
  const [clienteTelefone, setClienteTelefone] = useState(
    formatarTelefone(propostaParaEditar?.cliente_telefone || ""),
  );

  // Dados do Veículo (usados apenas no Individual)
  const [veiculoMarca, setVeiculoMarca] = useState(propostaParaEditar?.veiculo_marca || "");
  const [veiculoModelo, setVeiculoModelo] = useState(propostaParaEditar?.veiculo_modelo || "");
  const [veiculoAno, setVeiculoAno] = useState(
    propostaParaEditar?.veiculo_ano || String(new Date().getFullYear()),
  );

  // Valores Individuais
  const [comFidelidadeMeses, setComFidelidadeMeses] = useState<number>(
    propostaParaEditar?.com_fidelidade_meses || 12,
  );

  // Toggle de Condição Promocional (De X por Y)
  const [aplicarPromocao, setAplicarPromocao] = useState<boolean>(
    propostaParaEditar?.aplicar_promocao !== undefined
      ? Boolean(propostaParaEditar.aplicar_promocao)
      : true,
  );

  // Valores Cheios Padrão ("De: X") - Diretrizes Comerciais Hunter:
  // Com Fidelidade: Instalação cheia R$ 380,00 | Mensalidade cheia R$ 120,00
  // Sem Fidelidade: Instalação cheia R$ 420,00 | Mensalidade cheia R$ 160,00
  const [comFidelidadeInstalacaoCheia, setComFidelidadeInstalacaoCheia] = useState<number>(
    propostaParaEditar?.com_fidelidade_instalacao_cheia ?? 380,
  );
  const [comFidelidadeMensalidadeCheia, setComFidelidadeMensalidadeCheia] = useState<number>(
    propostaParaEditar?.com_fidelidade_mensalidade_cheia ?? 120,
  );
  const [semFidelidadeInstalacaoCheia, setSemFidelidadeInstalacaoCheia] = useState<number>(
    propostaParaEditar?.sem_fidelidade_instalacao_cheia ?? 420,
  );
  const [semFidelidadeMensalidadeCheia, setSemFidelidadeMensalidadeCheia] = useState<number>(
    propostaParaEditar?.sem_fidelidade_mensalidade_cheia ?? 160,
  );

  // Valores Promocionais / Finais ("Por: Y")
  const [comFidelidadeInstalacao, setComFidelidadeInstalacao] = useState<number>(
    propostaParaEditar?.com_fidelidade_instalacao ?? 150,
  );
  const [comFidelidadeMensalidade, setComFidelidadeMensalidade] = useState<number>(
    propostaParaEditar?.com_fidelidade_mensalidade ?? 69.9,
  );
  const [semFidelidadeInstalacao, setSemFidelidadeInstalacao] = useState<number>(
    propostaParaEditar?.sem_fidelidade_instalacao ?? 250,
  );
  const [semFidelidadeMensalidade, setSemFidelidadeMensalidade] = useState<number>(
    propostaParaEditar?.sem_fidelidade_mensalidade ?? 89.9,
  );

  // Faixas de Frota
  const [faixasFrota, setFaixasFrota] = useState<FaixaFrota[]>(
    propostaParaEditar?.faixas_frota || FAIXAS_FROTA_PADRAO,
  );

  const [observacoes, setObservacoes] = useState(propostaParaEditar?.observacoes || "");
  const [motivoContraproposta, setMotivoContraproposta] = useState("");
  const [carregandoMemoria, setCarregandoMemoria] = useState(!isEdicao);
  const [memoriaAtiva, setMemoriaAtiva] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Carrega automaticamente a memória dos últimos valores se for uma nova proposta
  useEffect(() => {
    if (isEdicao) return;

    async function carregarMemoriaUltimaProposta() {
      try {
        setCarregandoMemoria(true);
        const ultima = await obterUltimaProposta();
        if (ultima) {
          setComFidelidadeMeses(ultima.com_fidelidade_meses || 12);
          setComFidelidadeInstalacaoCheia(ultima.com_fidelidade_instalacao_cheia ?? 380);
          setComFidelidadeMensalidadeCheia(ultima.com_fidelidade_mensalidade_cheia ?? 120);
          setComFidelidadeInstalacao(ultima.com_fidelidade_instalacao ?? 150);
          setComFidelidadeMensalidade(ultima.com_fidelidade_mensalidade ?? 69.9);
          setSemFidelidadeInstalacaoCheia(ultima.sem_fidelidade_instalacao_cheia ?? 420);
          setSemFidelidadeMensalidadeCheia(ultima.sem_fidelidade_mensalidade_cheia ?? 160);
          setSemFidelidadeInstalacao(ultima.sem_fidelidade_instalacao ?? 250);
          setSemFidelidadeMensalidade(ultima.sem_fidelidade_mensalidade ?? 89.9);
          setAplicarPromocao(
            ultima.aplicar_promocao !== undefined ? Boolean(ultima.aplicar_promocao) : true,
          );
          if (ultima.faixas_frota && ultima.faixas_frota.length > 0) {
            setFaixasFrota(ultima.faixas_frota);
          }
          setMemoriaAtiva(true);
        }
      } catch (err) {
        console.error("Erro ao resgatar memória de propostas:", err);
      } finally {
        setCarregandoMemoria(false);
      }
    }

    carregarMemoriaUltimaProposta();
  }, [isEdicao]);

  const handleAtualizarFaixaFrota = (index: number, campo: keyof FaixaFrota, valor: number) => {
    setFaixasFrota((prev) => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [campo]: valor };
      return clone;
    });
  };

  const handleSalvar = async (acaoAposSalvar?: "pdf" | "whatsapp") => {
    if (!clienteNome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (!clienteTelefone.trim()) {
      toast.error("Informe o telefone do cliente.");
      return;
    }

    if (tipoProposta === "individual") {
      if (!veiculoMarca.trim() || !veiculoModelo.trim()) {
        toast.error("Informe a marca e o modelo do veículo.");
        return;
      }
      if (!veiculoAno.trim()) {
        toast.error("Informe o ano do veículo.");
        return;
      }
    }

    // Validação estrita da regra de repasse
    const isRevendedorOuVendedor = Boolean(session?.isRevendedor || session?.isVendedor);
    if (tipoProposta === "individual") {
      const mensalidadeEfetiva = Number(comFidelidadeMensalidade) || 0;
      if (isRevendedorOuVendedor && mensalidadeEfetiva < baseRepasseMinima) {
        toast.error(
          `A mensalidade (R$ ${mensalidadeEfetiva.toFixed(2)}) não pode ser inferior à sua base de repasse (R$ ${baseRepasseMinima.toFixed(2)}).`,
        );
        return;
      }
    } else {
      if (isRevendedorOuVendedor) {
        for (const f of faixasFrota) {
          const mf = Number(f.mensalidade_com_fidelidade) || 0;
          if (mf < baseRepasseMinima) {
            toast.error(
              `A mensalidade da faixa "${f.rotulo}" (R$ ${mf.toFixed(2)}) não pode ser inferior à sua base de repasse (R$ ${baseRepasseMinima.toFixed(2)}).`,
            );
            return;
          }
        }
      }
    }

    setSalvando(true);
    try {
      let resultado: PropostaComercial | null = null;

      if (isEdicao && propostaParaEditar) {
        resultado = await editarProposta(
          propostaParaEditar.id,
          {
            cliente_nome: clienteNome,
            cliente_telefone: clienteTelefone,
            tipo_proposta: tipoProposta,
            veiculo_marca: veiculoMarca,
            veiculo_modelo: veiculoModelo,
            veiculo_ano: veiculoAno,
            com_fidelidade_meses: Number(comFidelidadeMeses) || 12,
            com_fidelidade_instalacao_cheia: Number.isFinite(Number(comFidelidadeInstalacaoCheia))
              ? Number(comFidelidadeInstalacaoCheia)
              : 380,
            com_fidelidade_mensalidade_cheia: Number.isFinite(Number(comFidelidadeMensalidadeCheia))
              ? Number(comFidelidadeMensalidadeCheia)
              : 120,
            com_fidelidade_instalacao: Number.isFinite(Number(comFidelidadeInstalacao))
              ? Number(comFidelidadeInstalacao)
              : 0,
            com_fidelidade_mensalidade: Number.isFinite(Number(comFidelidadeMensalidade))
              ? Number(comFidelidadeMensalidade)
              : 0,
            sem_fidelidade_instalacao_cheia: Number.isFinite(Number(semFidelidadeInstalacaoCheia))
              ? Number(semFidelidadeInstalacaoCheia)
              : 420,
            sem_fidelidade_mensalidade_cheia: Number.isFinite(Number(semFidelidadeMensalidadeCheia))
              ? Number(semFidelidadeMensalidadeCheia)
              : 160,
            sem_fidelidade_instalacao: Number.isFinite(Number(semFidelidadeInstalacao))
              ? Number(semFidelidadeInstalacao)
              : 0,
            sem_fidelidade_mensalidade: Number.isFinite(Number(semFidelidadeMensalidade))
              ? Number(semFidelidadeMensalidade)
              : 0,
            aplicar_promocao: aplicarPromocao,
            faixas_frota: tipoProposta === "frota" ? faixasFrota : undefined,
            observacoes: observacoes.trim(),
            motivo_contraproposta: motivoContraproposta.trim() || "Renegociação comercial",
            valor_base_repasse: baseRepasseMinima,
            revendedor_id: session?.revendedorId || undefined,
            vendedor_id: session?.vendedorId || undefined,
            origem_emissao: "web",
          },
          propostaParaEditar,
        );

        if (resultado) {
          toast.success(`Contraproposta ${resultado.numero_proposta} atualizada com sucesso!`);
        }
      } else {
        resultado = await criarProposta({
          tipo_proposta: tipoProposta,
          cliente_nome: clienteNome,
          cliente_telefone: clienteTelefone,
          veiculo_marca: veiculoMarca,
          veiculo_modelo: veiculoModelo,
          veiculo_ano: veiculoAno,
          com_fidelidade_meses: Number(comFidelidadeMeses) || 12,
          com_fidelidade_instalacao_cheia: Number.isFinite(Number(comFidelidadeInstalacaoCheia))
            ? Number(comFidelidadeInstalacaoCheia)
            : 380,
          com_fidelidade_mensalidade_cheia: Number.isFinite(Number(comFidelidadeMensalidadeCheia))
            ? Number(comFidelidadeMensalidadeCheia)
            : 120,
          com_fidelidade_instalacao: Number.isFinite(Number(comFidelidadeInstalacao))
            ? Number(comFidelidadeInstalacao)
            : 0,
          com_fidelidade_mensalidade: Number.isFinite(Number(comFidelidadeMensalidade))
            ? Number(comFidelidadeMensalidade)
            : 0,
          sem_fidelidade_instalacao_cheia: Number.isFinite(Number(semFidelidadeInstalacaoCheia))
            ? Number(semFidelidadeInstalacaoCheia)
            : 420,
          sem_fidelidade_mensalidade_cheia: Number.isFinite(Number(semFidelidadeMensalidadeCheia))
            ? Number(semFidelidadeMensalidadeCheia)
            : 160,
          sem_fidelidade_instalacao: Number.isFinite(Number(semFidelidadeInstalacao))
            ? Number(semFidelidadeInstalacao)
            : 0,
          sem_fidelidade_mensalidade: Number.isFinite(Number(semFidelidadeMensalidade))
            ? Number(semFidelidadeMensalidade)
            : 0,
          aplicar_promocao: aplicarPromocao,
          faixas_frota: tipoProposta === "frota" ? faixasFrota : undefined,
          observacoes: observacoes.trim(),
          valor_base_repasse: baseRepasseMinima,
          revendedor_id: session?.revendedorId || undefined,
          vendedor_id: session?.vendedorId || undefined,
          origem_emissao: "web",
        });

        if (resultado) {
          toast.success(`Proposta ${resultado.numero_proposta} cadastrada com sucesso!`);
        }
      }

      if (!resultado) {
        toast.error("Erro ao salvar proposta no sistema.");
        return;
      }

      if (acaoAposSalvar === "pdf") {
        toast.info("Gerando PDF oficial da proposta...");
        const emissorStr = session?.nome
          ? `${session.nome} (${(session.role || "Comercial").toUpperCase()})`
          : "Operador Autorizado";
        await emitirPropostaComercialPdf(resultado, emissorStr);
      } else if (acaoAposSalvar === "whatsapp") {
        toast.info("Enviando proposta oficial via WhatsApp e notificando SuperADM...");
        const emissorStr = session?.nome
          ? `${session.nome} (${(session.role || "Comercial").toUpperCase()})`
          : "Operador Autorizado";

        let pdfBase64: string | undefined;
        let pdfNome: string | undefined;
        try {
          const { gerarPropostaComercialPdfBase64 } =
            await import("../services/propostaPdfService");
          const resPdf = await gerarPropostaComercialPdfBase64(resultado, emissorStr);
          if (resPdf?.base64) {
            pdfBase64 = resPdf.base64;
            pdfNome = resPdf.nomeArquivo;
          }
        } catch (errPdf) {
          console.warn("Aviso ao gerar PDF para envio WhatsApp:", errPdf);
        }

        const resEnvio = await enviarPropostaViaWhatsapp(
          resultado,
          undefined,
          emissorStr,
          pdfBase64,
          pdfNome,
        );
        if (resEnvio.sucesso) {
          toast.success("Proposta despachada com sucesso no WhatsApp!");
        } else {
          toast.warning("Proposta salva. Não foi possível despachar WhatsApp automaticamente.");
        }
      }

      onSucesso(resultado, acaoAposSalvar);
    } catch (err: any) {
      toast.error(err?.message || "Ocorreu uma falha ao emitir a proposta.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto text-slate-800 dark:text-slate-100 transition-colors">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
                {isEdicao ? <Edit3 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                    {isEdicao
                      ? `Editar / Contraproposta — ${propostaParaEditar?.numero_proposta}`
                      : "Montar Proposta Comercial"}
                  </h2>
                  {memoriaAtiva && !isEdicao && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30">
                      <Sparkles className="h-3 w-3" /> Memória Ativa
                    </span>
                  )}
                  {isEdicao && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                      Contraproposta
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Selecione Individual ou Frota (4 faixas). Equipamentos homologados e aviso técnico
                  LIN/CAN inclusos.
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              disabled={salvando}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Corpo com Rolagem Interna Segura */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
            {/* Seletor de Modalidade: Individual vs Frota */}
            <div className="p-1.5 rounded-2xl bg-slate-200/60 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipoProposta("individual")}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  tipoProposta === "individual"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-300 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Car className="h-4 w-4 text-orange-600" />
                <span>Veículo Individual</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoProposta("frota")}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  tipoProposta === "frota"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-300 dark:border-slate-700"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Users className="h-4 w-4 text-sky-600" />
                <span>Frota Corporativa (4 Faixas)</span>
              </button>
            </div>

            {/* Alerta de Governança e Regra de Repasse Mínimo */}
            <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300 font-bold">
                <ShieldCheck className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                <span>
                  Base Mínima de Repasse: R$ {baseRepasseMinima.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                Sugestão (+ R$ 15,00): R$ {(baseRepasseMinima + 15).toFixed(2).replace(".", ",")}
                /mês
              </span>
            </div>

            {/* Seção 1: Dados do Cliente */}
            <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                <User className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span>1. Informações do Cliente ou Empresa</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Nome Completo ou Razão Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Eduardo Silva ou Transportes Ltda"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Telefone / Celular *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ex: (24) 99999-8888"
                    value={clienteTelefone}
                    onChange={(e) => setClienteTelefone(formatarTelefone(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2: Dados do Veículo (Apenas se Individual) */}
            {tipoProposta === "individual" ? (
              <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span>2. Identificação do Veículo</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Toyota, Honda, Fiat"
                      value={veiculoMarca}
                      onChange={(e) => setVeiculoMarca(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Corolla XEi, Civic, Strada"
                      value={veiculoModelo}
                      onChange={(e) => setVeiculoModelo(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Ano de Fabricação *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 2024"
                      value={veiculoAno}
                      onChange={(e) => setVeiculoAno(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 font-medium"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-600 shrink-0" />
                  <span className="font-semibold">
                    Modalidade Frota Ativa: Dispensado o preenchimento de dados de veículos
                    individuais.
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-800 dark:text-sky-300 text-[10px] font-bold">
                  Tabela Escalonada
                </span>
              </div>
            )}

            {/* Banner de Alerta Técnico de Transparência LIN / CAN */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Aviso Técnico Obrigatório sobre Bloqueio Veicular</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                Dependendo do modelo, ano e arquitetura da rede eletrônica multiplexada (CAN ou LIN)
                do veículo, a função de bloqueio remoto não é recomendada ou tecnicamente viável
                para resguardar os módulos e a garantia do fabricante.
              </p>
            </div>

            {/* Seção 3: Planos e Valores */}
            {tipoProposta === "individual" ? (
              /* Formulário Individual */
              <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-3.5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span>3. Valores e Condições (Individual)</span>
                  </div>

                  {/* Botão de Escolha: Promoção (De X por Y) vs Valor Regular */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAplicarPromocao(true)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 ${
                        aplicarPromocao
                          ? "bg-orange-600 text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                      title="Exibe na proposta 'De: R$ X por Valor Promocional: R$ Y'"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Com Promoção (De: X por: Y)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAplicarPromocao(false)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        !aplicarPromocao
                          ? "bg-slate-800 text-white dark:bg-slate-700 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                      title="Exibe na proposta apenas o valor direto fechado"
                    >
                      <span>Sem Promoção (Valor Fixo)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Opção 1: COM Fidelidade */}
                  <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-orange-700 dark:text-orange-400">
                          Plano COM Fidelidade
                        </span>
                        <span className="block text-[10px] text-orange-600/90 dark:text-orange-400/90 font-medium">
                          Rastreador e Chip Inclusos
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-slate-500">Prazo:</span>
                        <input
                          type="number"
                          min={1}
                          max={48}
                          value={comFidelidadeMeses}
                          onChange={(e) => setComFidelidadeMeses(Number(e.target.value))}
                          className="w-12 text-center text-xs py-0.5 px-1 rounded-md bg-white dark:bg-slate-900 border border-orange-500/40 font-bold"
                        />
                        <span className="text-slate-500">meses</span>
                      </div>
                    </div>

                    {aplicarPromocao ? (
                      /* Modo Promocional: De X por Y (100% Editáveis) */
                      <div className="space-y-2.5">
                        <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
                            Taxa de Instalação e Ativação
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                                De (Valor Cheio R$) *
                              </label>
                              <MoedaInput
                                value={comFidelidadeInstalacaoCheia}
                                onChange={setComFidelidadeInstalacaoCheia}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold line-through text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-orange-700 dark:text-orange-400 mb-0.5">
                                Por (Promocional R$) *
                              </label>
                              <MoedaInput
                                value={comFidelidadeInstalacao}
                                onChange={setComFidelidadeInstalacao}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-500/50 font-bold text-orange-600 dark:text-orange-400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
                            Mensalidade Recorrente
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                                De (Valor Cheio R$/mês) *
                              </label>
                              <MoedaInput
                                value={comFidelidadeMensalidadeCheia}
                                onChange={setComFidelidadeMensalidadeCheia}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold line-through text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-orange-700 dark:text-orange-400 mb-0.5">
                                Por (Promocional R$/mês) *
                              </label>
                              <MoedaInput
                                value={comFidelidadeMensalidade}
                                onChange={setComFidelidadeMensalidade}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-500/50 font-bold text-orange-600 dark:text-orange-400"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Modo Regular Fixo (Sem De/Por) */
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Instalação (R$)
                          </label>
                          <MoedaInput
                            value={comFidelidadeInstalacao}
                            onChange={setComFidelidadeInstalacao}
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Mensalidade (R$/mês)
                          </label>
                          <MoedaInput
                            value={comFidelidadeMensalidade}
                            onChange={setComFidelidadeMensalidade}
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold text-orange-600 dark:text-orange-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Opção 2: SEM Fidelidade */}
                  <div className="p-3.5 rounded-xl bg-slate-500/5 border border-slate-300/70 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Plano SEM Fidelidade
                        </span>
                        <span className="block text-[10px] text-slate-500 font-medium">
                          Rastreador e Chip Inclusos
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 italic">Cancelamento Livre</span>
                    </div>

                    {aplicarPromocao ? (
                      /* Modo Promocional: De X por Y (100% Editáveis) */
                      <div className="space-y-2.5">
                        <div className="p-2.5 rounded-lg bg-slate-200/50 dark:bg-slate-900/80 border border-slate-300/80 dark:border-slate-800 space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Taxa de Instalação e Ativação
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                                De (Valor Cheio R$) *
                              </label>
                              <MoedaInput
                                value={semFidelidadeInstalacaoCheia}
                                onChange={setSemFidelidadeInstalacaoCheia}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold line-through text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200 mb-0.5">
                                Por (Promocional R$) *
                              </label>
                              <MoedaInput
                                value={semFidelidadeInstalacao}
                                onChange={setSemFidelidadeInstalacao}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-400 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-200/50 dark:bg-slate-900/80 border border-slate-300/80 dark:border-slate-800 space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Mensalidade Recorrente
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                                De (Valor Cheio R$/mês) *
                              </label>
                              <MoedaInput
                                value={semFidelidadeMensalidadeCheia}
                                onChange={setSemFidelidadeMensalidadeCheia}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold line-through text-slate-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-800 dark:text-slate-200 mb-0.5">
                                Por (Promocional R$/mês) *
                              </label>
                              <MoedaInput
                                value={semFidelidadeMensalidade}
                                onChange={setSemFidelidadeMensalidade}
                                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-400 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Modo Regular Fixo (Sem De/Por) */
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Instalação (R$)
                          </label>
                          <MoedaInput
                            value={semFidelidadeInstalacao}
                            onChange={setSemFidelidadeInstalacao}
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Mensalidade (R$/mês)
                          </label>
                          <MoedaInput
                            value={semFidelidadeMensalidade}
                            onChange={setSemFidelidadeMensalidade}
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Formulário das 4 Faixas de Frota */
              <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span>3. Tabela de Preços por Quantidade de Veículos (Frota)</span>
                  </div>
                  <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
                    Equipamentos e Chips Inclusos
                  </span>
                </div>

                <div className="space-y-3">
                  {faixasFrota.map((faixa, idx) => (
                    <div
                      key={faixa.chave}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-sky-500"></span>
                          {faixa.rotulo}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Preço unitário por veículo
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[9px] font-medium text-orange-700 dark:text-orange-400 mb-0.5">
                            Instal. C/ Fidelidade
                          </label>
                          <MoedaInput
                            value={faixa.instalacao_com_fidelidade}
                            onChange={(val) =>
                              handleAtualizarFaixaFrota(idx, "instalacao_com_fidelidade", val)
                            }
                            className="w-full text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-medium text-orange-700 dark:text-orange-400 mb-0.5">
                            Mensal. C/ Fidelidade
                          </label>
                          <MoedaInput
                            value={faixa.mensalidade_com_fidelidade}
                            onChange={(val) =>
                              handleAtualizarFaixaFrota(idx, "mensalidade_com_fidelidade", val)
                            }
                            className="w-full text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Instal. S/ Fidelidade
                          </label>
                          <MoedaInput
                            value={faixa.instalacao_sem_fidelidade}
                            onChange={(val) =>
                              handleAtualizarFaixaFrota(idx, "instalacao_sem_fidelidade", val)
                            }
                            className="w-full text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Mensal. S/ Fidelidade
                          </label>
                          <MoedaInput
                            value={faixa.mensalidade_sem_fidelidade}
                            onChange={(val) =>
                              handleAtualizarFaixaFrota(idx, "mensalidade_sem_fidelidade", val)
                            }
                            className="w-full text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Justificativa de Contraproposta (se for edição) */}
            {isEdicao && (
              <div className="p-3.5 rounded-2xl bg-sky-500/5 border border-sky-500/30 space-y-1.5">
                <label className="block text-[11px] font-bold text-sky-800 dark:text-sky-300">
                  Motivo ou Condições da Contraproposta / Renegociação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Desconto autorizado para fechamento até amanhã..."
                  value={motivoContraproposta}
                  onChange={(e) => setMotivoContraproposta(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/30 font-medium"
                />
              </div>
            )}

            {/* Observações Adicionais */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Observações Comerciais ou Condições Especiais (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Instalação agendada para sábado na garagem da empresa..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>

          {/* Rodapé Fixo com Ações Claramente Visíveis */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center"
            >
              Cancelar
            </button>

            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => handleSalvar()}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition shadow-xs flex items-center justify-center gap-1.5"
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>{isEdicao ? "Salvar Contraproposta" : "Apenas Salvar"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSalvar("whatsapp")}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs flex items-center justify-center gap-1.5"
                title="Salvar proposta, despachar no WhatsApp do cliente e notificar o SuperADM"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Salvar e Enviar WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleSalvar("pdf")}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition shadow-xs flex items-center justify-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Salvar e Emitir PDF (2 Páginas)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
