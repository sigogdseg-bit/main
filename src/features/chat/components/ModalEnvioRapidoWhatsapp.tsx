// ModalEnvioRapidoWhatsapp.tsx — GD Rastreamento
// Painel direto de disparo de mensagens WhatsApp para Clientes, Motoristas e Usuários
// Integrado ao Micro-Gateway Baileys (Fly.io) com lista inteligente de contatos

import { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Send,
  X,
  Search,
  ExternalLink,
  Copy,
  Sparkles,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Car,
  User,
  Wrench,
  ShieldCheck,
  RefreshCw,
  PhoneCall,
  UserPlus,
  Paperclip,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { supabase } from "@/integrations/supabase/client";
import {
  enviarMensagemWhatsappOperador,
  normalizarTelefoneParaWhatsapp,
  obterUrlChatbotX,
  DocumentoWhatsappEnvio,
} from "@/shared/lib/chatbotxBridge";
import {
  carregarContatosParaWhatsapp,
  ContatoWhatsappItem,
  formatarTelefoneVisual,
  obterDadosCobrancaClienteFactual,
} from "../services/whatsappContatosService";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  obterConfigPixSistemaSync,
  gerarMensagemLembreteVencimentoLeve,
  gerarLembreteVencimentoComQrCode,
} from "@/shared/lib/pixSistemaService";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { APP_PUBLIC_URL } from "@/shared/lib/version";

export interface ModalEnvioRapidoWhatsappProps {
  aberto: boolean;
  onClose: () => void;
  contatoInicial?: {
    nome: string;
    telefone: string;
  } | null;
}

export function ModalEnvioRapidoWhatsapp({
  aberto,
  onClose,
  contatoInicial,
}: ModalEnvioRapidoWhatsappProps) {
  const { session } = useAuth();
  const [contatos, setContatos] = useState<ContatoWhatsappItem[]>([]);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  // Chips de Filtro Contextuais conforme os tipos de contato presentes
  const abasDisponiveis = useMemo(() => {
    const abas: { id: string; label: string }[] = [{ id: "todos", label: "Todos os Contatos" }];

    const temTipo = (t: string) => contatos.some((c) => c.tipo === t);

    if (temTipo("cliente")) abas.push({ id: "cliente", label: "Clientes" });
    if (temTipo("motorista")) abas.push({ id: "motorista", label: "Motoristas" });
    if (temTipo("revendedor")) abas.push({ id: "revendedor", label: "Revendedores" });
    if (temTipo("vendedor")) abas.push({ id: "vendedor", label: "Vendedores" });
    if (temTipo("instalador")) abas.push({ id: "instalador", label: "Instaladores" });
    if (temTipo("usuario")) abas.push({ id: "usuario", label: "Equipe Interna" });

    return abas;
  }, [contatos]);

  // Se o filtro selecionado deixar de existir na lista (ex: troca de usuário), reseta para "todos"
  useEffect(() => {
    if (filtroTipo !== "todos" && !abasDisponiveis.some((a) => a.id === filtroTipo)) {
      setFiltroTipo("todos");
    }
  }, [abasDisponiveis, filtroTipo]);

  // Contato Selecionado
  const [contatoSelecionado, setContatoSelecionado] = useState<ContatoWhatsappItem | null>(null);
  const [modoNumeroManual, setModoNumeroManual] = useState(false);
  const [numeroManual, setNumeroManual] = useState("");
  const [nomeManual, setNomeManual] = useState("");

  // Conteúdo da Mensagem
  const [mensagem, setMensagem] = useState("");
  const [documento, setDocumento] = useState<DocumentoWhatsappEnvio | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Status do Gateway
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [gatewayNumero, setGatewayNumero] = useState<string | null>(null);
  const [checandoGateway, setChecandoGateway] = useState(false);

  // Checa status do Gateway WhatsApp via proxy canônico do servidor
  const verificarGateway = async () => {
    setChecandoGateway(true);
    try {
      const res = await fetch("/api/whatsapp/status", { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const json = await res.json();
        if (json.conectado) {
          setGatewayOnline(true);
          setGatewayNumero(json.numero || null);
          setChecandoGateway(false);
          return;
        }
      }
    } catch {
      /* gateway offline */
    }

    setGatewayOnline(false);
    setChecandoGateway(false);
  };

  const isParceiro = Boolean(session?.isRevendedor || session?.isVendedor);

  // Carrega contatos e verifica status do gateway ao abrir o modal
  useEffect(() => {
    if (aberto) {
      setCarregandoContatos(true);
      carregarContatosParaWhatsapp(session)
        .then((lista) => {
          setContatos(lista);
          // Se tiver contato inicial pré-selecionado
          if (contatoInicial?.telefone) {
            const foneNorm = normalizarTelefoneParaWhatsapp(contatoInicial.telefone);
            const match = lista.find((c) => c.telefone === foneNorm);
            if (match) {
              selecionarContato(match);
            } else if (!isParceiro) {
              setModoNumeroManual(true);
              setNumeroManual(contatoInicial.telefone);
              setNomeManual(contatoInicial.nome || "Contato");
            }
          }
        })
        .finally(() => setCarregandoContatos(false));

      verificarGateway();
    } else {
      // Reseta estados transitórios
      setBusca("");
      setModoNumeroManual(false);
      setContatoSelecionado(null);
      setMensagem("");
      setDocumento(null);
    }
  }, [aberto, contatoInicial, session, isParceiro]);

  // Contatos filtrados por texto e tipo
  const contatosFiltrados = useMemo(() => {
    let lista = contatos;
    if (filtroTipo !== "todos") {
      lista = lista.filter((c) => c.tipo === filtroTipo);
    }
    if (!busca.trim()) return lista;

    const termo = busca.toLowerCase().trim();
    return lista.filter((c) => {
      const matchNome = c.nome.toLowerCase().includes(termo);
      const matchTelefone = c.telefone.includes(termo) || c.telefoneFormatado.includes(termo);
      const matchDoc = c.documento ? c.documento.includes(termo) : false;
      const matchVeiculo = c.veiculos
        ? c.veiculos.some((v) => v.toLowerCase().includes(termo))
        : false;
      return matchNome || matchTelefone || matchDoc || matchVeiculo;
    });
  }, [contatos, filtroTipo, busca]);

  const nomeDestino = modoNumeroManual
    ? nomeManual || "Contato"
    : contatoSelecionado?.nome || "Contato";
  const primeiroNome = nomeDestino.split(" ")[0] || "Contato";

  const telefoneDestino = modoNumeroManual
    ? normalizarTelefoneParaWhatsapp(numeroManual)
    : contatoSelecionado?.telefone || "";

  // Seleção rápida de contato
  const selecionarContato = (contato: ContatoWhatsappItem) => {
    setContatoSelecionado(contato);
    setModoNumeroManual(false);
    const pNome = contato.nome.split(" ")[0] || "Cliente";
    setMensagem(
      `Olá, ${pNome}! Aqui é da equipe do GD Rastreamento. Entramos em contato a respeito do seu atendimento. Como podemos ajudar?`,
    );
  };

  // Templates Rápidos de Mensagem
  const TEMPLATES = [
    {
      id: "lembrete_3dias",
      titulo: "Lembrete Leve (3 Dias)",
      icone: "📅",
      texto: `Olá, ${primeiroNome}! Lembramos que a sua mensalidade do serviço de aluguel de rastreador com automonitoramento GD Rastreamento vence em 3 dias com QR Code e Chave PIX oficial.`,
    },
    {
      id: "pix_link",
      titulo: "Link de Pagamento e PIX",
      icone: "💳",
      texto: `Olá, ${primeiroNome}! Segue o link de pagamento e dados oficiais de PIX para quitação da sua mensalidade.`,
    },
    {
      id: "suporte",
      titulo: "Suporte e Atendimento",
      icone: "💬",
      texto: `Olá, ${primeiroNome}! Aqui é da equipe do GD Rastreamento. Entramos em contato a respeito do auto-monitoramento do seu veículo. Como podemos ajudar hoje?`,
    },
    {
      id: "alerta",
      titulo: "Aviso de Segurança",
      icone: "🚨",
      texto: `Olá, ${primeiroNome}! Identificamos um evento de alerta de segurança em seu veículo monitorado pelo GD Rastreamento. Por favor, verifique o seu aplicativo ou nos responda aqui para averiguação.`,
    },
    {
      id: "agendamento",
      titulo: "Instalação e Suporte",
      icone: "🔧",
      texto: `Olá, ${primeiroNome}! Aqui é da equipe técnica do GD Rastreamento. Gostaríamos de confirmar os detalhes do agendamento da instalação do seu rastreador veicular.`,
    },
    {
      id: "financeiro",
      titulo: "Mensalidade Geral",
      icone: "📄",
      texto: `Olá, ${primeiroNome}! Lembramos que a mensalidade do seu plano de rastreamento veicular GD Rastreamento está disponível. Qualquer dúvida ou para solicitar a 2ª via com chave PIX, estamos à disposição!`,
    },
    {
      id: "rastreamento",
      titulo: "Rastreamento Ativo",
      icone: "📍",
      texto: `Olá, ${primeiroNome}! Informamos que a telemetria do seu veículo está ativa e transmitindo normalmente no sistema GD Rastreamento. Tenha um excelente dia!`,
    },
  ];

  const handleCopiarMensagem = () => {
    if (!mensagem) return;
    navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    toast.success("Mensagem copiada para a área de transferência!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleSelecionarDocumento = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limite preventivo de 15 MB
    const limiteBytes = 15 * 1024 * 1024;
    if (file.size > limiteBytes) {
      toast.error("O documento selecionado excede o limite máximo permitido de 15 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setDocumento({
        nome: file.name,
        base64,
        mimetype: file.type || "application/octet-stream",
        tamanho: file.size,
      });
      toast.success(`Documento "${file.name}" anexado para envio via WhatsApp!`);
    };
    reader.onerror = () => {
      toast.error("Falha ao carregar o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoverDocumento = () => {
    setDocumento(null);
    toast.info("Documento removido.");
  };

  const handleEnviarGateway = async () => {
    if (!telefoneDestino || telefoneDestino.length < 10) {
      toast.error("Selecione um contato ou informe um telefone com DDD válido.");
      return;
    }
    if (!mensagem.trim() && !documento) {
      toast.error("Digite o texto da mensagem ou insira um documento para envio.");
      return;
    }

    if (isParceiro) {
      if (modoNumeroManual || !contatoSelecionado) {
        toast.error(
          "Envio não autorizado: você só pode enviar mensagens para contatos vinculados ao seu cadastro.",
        );
        return;
      }
      const permitido = contatos.some((c) => c.telefone === telefoneDestino);
      if (!permitido) {
        toast.error("Este número não pertence à sua rede de clientes ou equipe vinculada.");
        return;
      }
    }

    const tipoDestino = modoNumeroManual ? "adicional" : contatoSelecionado?.tipo || "adicional";

    setEnviando(true);
    try {
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: nomeDestino,
        telefone: telefoneDestino,
        mensagem: mensagem.trim(),
        operadorNome: session?.nome || "Operador GD Rastreamento",
        clienteId: contatoSelecionado?.id,
        tipoContato: tipoDestino,
        documento: documento || undefined,
      });

      if (res.sucesso) {
        toast.success(
          documento
            ? `Mensagem e documento transmitidos com sucesso para ${nomeDestino} via WhatsApp Gateway!`
            : `Mensagem transmitida com sucesso para ${nomeDestino} via WhatsApp Gateway!`,
        );

        if (isParceiro) {
          // Despacho de cópia transparente para o SuperADM (se habilitado nas configurações)
          (async () => {
            try {
              const { data: cfg } = await supabase
                .from("relatorio_gerencial_config")
                .select("copia_whatsapp_parceiros, telefones")
                .limit(1)
                .maybeSingle();

              if (cfg?.copia_whatsapp_parceiros !== false) {
                let telefonesSuper: string[] = [];
                if (Array.isArray(cfg?.telefones) && cfg.telefones.length > 0) {
                  telefonesSuper = cfg.telefones
                    .map((t: any) => String(t.telefone || "").replace(/\D/g, ""))
                    .filter((num: string) => num.length >= 10)
                    .map((num: string) => (num.startsWith("55") ? num : `55${num}`));
                }
                if (telefonesSuper.length === 0) {
                  telefonesSuper = ["5524992494030"];
                }

                const agoraSP = new Date().toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                });
                const papelParceiro = session?.isRevendedor
                  ? "Revendedor / Franquia"
                  : "Vendedor Autorizado";

                const textoCopia = `📋 *[CÓPIA PARA O SUPERADM]*\n*Remetente:* ${session?.nome || "Parceiro"} (${papelParceiro})\n*Destinatário:* ${nomeDestino} (${telefoneDestino})\n*Vínculo:* ${contatoSelecionado?.tipoRotulo || "Contato da Base"}\n*Data/Hora:* ${agoraSP}\n\n*Mensagem Enviada:*\n"${mensagem.trim()}"${documento ? `\n\n📎 *Documento Anexado:* ${documento.nome}` : ""}`;

                for (const tel of telefonesSuper) {
                  await enviarMensagemWhatsappOperador({
                    clienteNome: "SuperADM (Cópia)",
                    telefone: tel,
                    mensagem: textoCopia,
                    operadorNome: session?.nome || "Sistema",
                    tipoContato: "operador",
                    documento: documento || undefined,
                  }).catch(() => null);
                }
              }
            } catch (errCopia) {
              console.warn("Aviso ao despachar cópia para SuperADM:", errCopia);
            }
          })();
        }

        onClose();
      } else {
        const isErroRede =
          res.erro?.includes("Erro de rede") ||
          res.erro?.includes("Load failed") ||
          res.erro?.includes("Failed to fetch") ||
          res.erro?.includes("503");

        if (isErroRede) {
          toast.error(
            "Gateway WhatsApp offline ou aguardando conexão. Verifique a Central e o status de conexão.",
            { duration: 6000 },
          );
        } else {
          toast.error(res.erro || "Falha ao enviar mensagem pelo WhatsApp Gateway.");
        }
      }
    } catch (e: any) {
      toast.error(`Erro ao disparar: ${e?.message || String(e)}`);
    } finally {
      setEnviando(false);
    }
  };

  const podeAcessarWhatsapp = Boolean(
    session?.isAdmin || session?.isOperador || session?.isRevendedor || session?.isVendedor,
  );
  if (!aberto || !podeAcessarWhatsapp) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200 transition-colors">
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-500/5 dark:bg-emerald-950/20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                    Disparo Direto de Mensagem WhatsApp
                  </h3>
                  {/* Badge de Status do Gateway */}
                  <button
                    type="button"
                    onClick={() => verificarGateway()}
                    disabled={checandoGateway}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition hover:opacity-80 cursor-pointer ${
                      gatewayOnline
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : checandoGateway
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    }`}
                    title={
                      gatewayOnline
                        ? `Gateway Online (${gatewayNumero ? "+" + formatarTelefoneVisual(gatewayNumero) : "Central Conectada"}). Clique para revalidar.`
                        : "Gateway Offline. Clique para revalidar conexão."
                    }
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        gatewayOnline
                          ? "bg-emerald-500 animate-pulse"
                          : checandoGateway
                            ? "bg-amber-500 animate-ping"
                            : "bg-rose-500"
                      }`}
                    />
                    {gatewayOnline
                      ? `Gateway GD Online (${gatewayNumero ? "+" + formatarTelefoneVisual(gatewayNumero) : "Central GD Conectada"})`
                      : checandoGateway
                        ? "Checando Gateway GD..."
                        : "Gateway GD Desconectado"}
                    <RefreshCw
                      className={`h-2.5 w-2.5 ml-0.5 ${checandoGateway ? "animate-spin" : ""}`}
                    />
                  </button>

                  {!checandoGateway && (
                    <a
                      href="/api/whatsapp/qrcode"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 underline underline-offset-2 ml-1"
                      title={
                        gatewayOnline
                          ? "Desconectar e ler novo QR Code para trocar a linha GD Segurança"
                          : "Abrir tela de pareamento e ler QR Code da Linha GD Segurança"
                      }
                    >
                      <ExternalLink className="h-3 w-3" />{" "}
                      {gatewayOnline ? "Trocar Linha GD" : "Conectar Linha GD"}
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Comunicação rápida e auditada com Clientes, Motoristas e Equipe Operacional
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo com Rolagem Interna */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* ETAPA 1: Seleção de Destinatário */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Destinatário</span>
                </label>
                <div className="flex items-center gap-1">
                  {!isParceiro ? (
                    <button
                      type="button"
                      onClick={() => {
                        setModoNumeroManual(!modoNumeroManual);
                        if (!modoNumeroManual) setContatoSelecionado(null);
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition border cursor-pointer ${
                        modoNumeroManual
                          ? "bg-emerald-500 text-white border-emerald-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {modoNumeroManual ? "← Escolher da Lista" : "+ Digitar Número Avulso"}
                    </button>
                  ) : (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                      Contatos Vinculados
                    </span>
                  )}
                </div>
              </div>

              {/* Se estiver no Modo Manual */}
              {modoNumeroManual ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      Nome do Destinatário
                    </label>
                    <input
                      type="text"
                      value={nomeManual}
                      onChange={(e) => setNomeManual(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      Telefone com DDD (apenas números)
                    </label>
                    <input
                      type="tel"
                      value={numeroManual}
                      onChange={(e) => setNumeroManual(e.target.value)}
                      placeholder="Ex: 24992501512"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              ) : (
                /* Modo Lista de Contatos */
                <div className="space-y-2">
                  {/* Destinatário Selecionado em Destaque */}
                  {contatoSelecionado && (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                          {contatoSelecionado.tipo === "cliente" ? (
                            <Car className="h-4 w-4" />
                          ) : contatoSelecionado.tipo === "motorista" ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Wrench className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm truncate">
                              {contatoSelecionado.nome}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                              {contatoSelecionado.tipoRotulo}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                            <span className="font-mono">
                              {contatoSelecionado.telefoneFormatado}
                            </span>
                            {contatoSelecionado.veiculos &&
                              contatoSelecionado.veiculos.length > 0 && (
                                <span className="text-[11px] font-semibold opacity-90 truncate">
                                  • Placas: {contatoSelecionado.veiculos.join(", ")}
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setContatoSelecionado(null)}
                        className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-500/20 transition cursor-pointer"
                        title="Trocar contato"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Campo de Busca e Filtros de Tipo */}
                  {!contatoSelecionado && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Buscar por nome, telefone, veículo ou placa..."
                          className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        />
                        {busca && (
                          <button
                            type="button"
                            onClick={() => setBusca("")}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Chips de Filtro */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                        {abasDisponiveis.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFiltroTipo(tab.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                              filtroTipo === tab.id
                                ? "bg-emerald-500 text-white border-emerald-600 shadow-2xs"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Lista de Contatos com Rolagem */}
                      <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
                        {carregandoContatos ? (
                          <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                            <span>Carregando lista de contatos do sistema...</span>
                          </div>
                        ) : contatosFiltrados.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Nenhum contato encontrado com o termo "{busca}".
                          </div>
                        ) : (
                          contatosFiltrados.map((contato) => (
                            <button
                              key={`${contato.tipo}_${contato.id}_${contato.telefone}`}
                              type="button"
                              onClick={() => selecionarContato(contato)}
                              className="w-full text-left p-2.5 sm:px-3 sm:py-2 hover:bg-emerald-500/10 dark:hover:bg-emerald-950/30 transition flex items-center justify-between gap-2 group cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                                    {contato.nome}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                      contato.tipo === "cliente"
                                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                        : contato.tipo === "motorista"
                                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                          : contato.tipo === "vendedor"
                                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                            : contato.tipo === "revendedor"
                                              ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                                              : contato.tipo === "instalador"
                                                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                                                : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                                    }`}
                                  >
                                    {contato.tipoRotulo}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span className="font-mono">{contato.telefoneFormatado}</span>
                                  {contato.veiculos && contato.veiculos.length > 0 && (
                                    <span className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                                      • Placas: {contato.veiculos.join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition shrink-0">
                                Selecionar →
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ETAPA 2: Templates Rápidos de Mensagem */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Modelos Rápidos de 1 Toque</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TEMPLATES.map((tpl) => {
                  const ehTemplatePlano =
                    tpl.id === "financeiro" || tpl.id === "pix_link" || tpl.id === "lembrete_3dias";
                  const bloqPlano =
                    ehTemplatePlano && (modoNumeroManual || contatoSelecionado?.tipo !== "cliente");

                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={bloqPlano}
                      onClick={() => {
                        if (bloqPlano) {
                          toast.error(
                            "Mensagens referentes ao plano e mensalidades são exclusivas para o cliente titular.",
                          );
                          return;
                        }

                        if (tpl.id === "lembrete_3dias") {
                          const cfgPix = obterConfigPixSistemaSync();
                          const clienteId = contatoSelecionado?.id || "";

                          obterDadosCobrancaClienteFactual(
                            clienteId,
                            contatoSelecionado?.valorMensalidade,
                            contatoSelecionado?.diaVencimento,
                            {
                              statusCliente: contatoSelecionado?.statusCliente,
                              temVeiculoAtivo: contatoSelecionado?.temVeiculoAtivo,
                            },
                          ).then((dadosCobranca) => {
                            if (dadosCobranca.isento || dadosCobranca.valor <= 0) {
                              toast.info(
                                dadosCobranca.mensagemAviso ||
                                  `O cliente ${contatoSelecionado?.nome || "selecionado"} possui cadastro isento de mensalidade (R$ 0,00) e não possui faturas pendentes.`,
                              );
                              return;
                            }

                            gerarLembreteVencimentoComQrCode({
                              clienteNome: contatoSelecionado?.nome || "Cliente",
                              valor: dadosCobranca.valor,
                              dataVencimentoFormatada: dadosCobranca.dataVencimentoFormatada,
                              diasRestantes: dadosCobranca.diasRestantes,
                              veiculoIdentificacao: contatoSelecionado?.veiculos?.[0],
                              chavePixCustomizada: cfgPix.chavePix,
                            }).then(({ mensagem: msgLembrete, documento: docQr }) => {
                              setMensagem(msgLembrete);
                              if (docQr) {
                                setDocumento(docQr);
                                toast.success(
                                  "Lembrete com valor factual e imagem do QR Code PIX anexada para envio!",
                                );
                              } else {
                                toast.success(
                                  "Modelo de Lembrete Leve gerado com Chave PIX oficial!",
                                );
                              }
                            });
                          });
                          return;
                        }

                        if (tpl.id === "pix_link") {
                          const cfgPix = obterConfigPixSistemaSync();
                          const clienteId = contatoSelecionado?.id || "";

                          obterDadosCobrancaClienteFactual(
                            clienteId,
                            contatoSelecionado?.valorMensalidade,
                            contatoSelecionado?.diaVencimento,
                            {
                              statusCliente: contatoSelecionado?.statusCliente,
                              temVeiculoAtivo: contatoSelecionado?.temVeiculoAtivo,
                            },
                          ).then((dadosCobranca) => {
                            if (dadosCobranca.isento || dadosCobranca.valor <= 0) {
                              toast.info(
                                dadosCobranca.mensagemAviso ||
                                  `O cliente ${contatoSelecionado?.nome || "selecionado"} possui cadastro isento de mensalidade (R$ 0,00) e não possui faturas pendentes.`,
                              );
                              return;
                            }

                            const valor = dadosCobranca.valor;
                            const valorFmt = valor.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            });
                            let payload = "";
                            try {
                              payload = gerarPayloadPix({
                                chavePix: cfgPix.chavePix,
                                nomeRecebedor: cfgPix.titular || "GD Rastreamento",
                                cidadeRecebedor: cfgPix.cidade || "BRASIL",
                                valor,
                                identificador: "PAGAMENTO",
                              });
                            } catch {
                              /* fallback */
                            }
                            let texto = `Olá, ${primeiroNome}! Tudo bem? Esperamos que esteja tendo um excelente dia.\n\n`;
                            texto += `Segue o link e os dados oficiais para pagamento via PIX da mensalidade do serviço de aluguel de rastreador com automonitoramento GD Rastreamento:\n\n`;
                            texto += `💵 *Valor:* R$ ${valorFmt}\n`;
                            texto += `🔑 *Chave PIX Oficial:* ${cfgPix.chavePix}\n`;
                            if (cfgPix.titular) {
                              texto += `👤 *Titular:* ${cfgPix.titular}\n`;
                            }
                            texto += `\n`;
                            if (payload) {
                              texto += `📱 *PIX COPIA E COLA (Basta copiar e colar no aplicativo do seu banco):*\n${payload}\n\n`;
                              texto += `🖼️ *A imagem do QR Code para pagamento instantâneo segue em anexo nesta mensagem.*\n\n`;
                            }
                            texto += `🔗 *Acesse o portal para pagar ou emitir comprovante:*\n${APP_PUBLIC_URL}/cliente/financeiro\n\n`;
                            texto += `Após o pagamento, o comprovante pode ser enviado diretamente por aqui.\nAgradecemos pela parceria e confiança!\n\nEquipe GD Rastreamento`;
                            setMensagem(texto);

                            if (payload) {
                              gerarQrCodePixDataUrl(payload).then((dataUrl) => {
                                if (dataUrl) {
                                  const primeiroSlug = primeiroNome
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]/g, "");
                                  setDocumento({
                                    nome: `qrcode-pix-${primeiroSlug}-mensalidade.png`,
                                    base64: dataUrl,
                                    mimetype: "image/png",
                                    tamanho: Math.round((dataUrl.length * 3) / 4),
                                  });
                                  toast.success(
                                    "Link PIX com valor factual e imagem do QR Code anexada para envio!",
                                  );
                                } else {
                                  toast.success(
                                    "Mensagem com Link de Pagamento e PIX gerada com sucesso!",
                                  );
                                }
                              });
                            } else {
                              toast.success(
                                "Mensagem com Link de Pagamento e PIX gerada com sucesso!",
                              );
                            }
                          });
                          return;
                        }

                        setMensagem(tpl.texto);
                      }}
                      title={
                        bloqPlano
                          ? "Inadmissível: Mensagens administrativas do plano são restritas ao cliente titular"
                          : tpl.titulo
                      }
                      className={`p-2 rounded-xl text-left border transition text-xs group ${
                        bloqPlano
                          ? "bg-slate-100/50 dark:bg-slate-800/40 border-slate-200/50 dark:border-slate-800/50 opacity-40 cursor-not-allowed"
                          : "bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:border-emerald-500/30 border-slate-200 dark:border-slate-700 cursor-pointer"
                      }`}
                    >
                      <div className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center gap-1.5 truncate">
                        <span>{tpl.icone}</span>
                        <span className="truncate">{tpl.titulo}</span>
                      </div>
                      {bloqPlano && (
                        <div className="text-[9px] text-rose-500 font-semibold truncate mt-0.5">
                          Exclusivo Cliente
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ETAPA 3: Caixa de Texto da Mensagem */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Mensagem a Ser Transmitida</span>
                </label>
                <button
                  type="button"
                  onClick={handleCopiarMensagem}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiado ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-bold">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                rows={4}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Digite a mensagem para o destinatário..."
                className="w-full p-3 text-xs sm:text-sm rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                <span>
                  Destino:{" "}
                  {telefoneDestino
                    ? `+${formatarTelefoneVisual(telefoneDestino)}`
                    : "Aguardando seleção"}
                </span>
                <span>{mensagem.length} caracteres</span>
              </div>
            </div>

            {/* ETAPA 4: Inserir Documento para Envio */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Documento para Envio (Opcional)</span>
                </label>
                {documento && (
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {(documento.tamanho ? documento.tamanho / 1024 : 0).toFixed(1)} KB
                  </span>
                )}
              </div>

              {!documento ? (
                <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-500/5 hover:border-emerald-500/40 transition cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                  <Paperclip className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold">
                    Inserir documento (PDF, DOCX, XLSX, TXT ou Imagem)
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleSelecionarDocumento}
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0 overflow-hidden flex items-center justify-center">
                      {documento.mimetype.startsWith("image/") ? (
                        <img
                          src={documento.base64}
                          alt="QR Code Anexo"
                          className="h-10 w-10 object-contain rounded-lg border border-emerald-500/40 bg-white"
                        />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{documento.nome}</p>
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate">
                        {documento.mimetype.startsWith("image/")
                          ? "Imagem do QR Code PIX"
                          : documento.mimetype}{" "}
                        • {(documento.tamanho ? documento.tamanho / 1024 : 0).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoverDocumento}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                    title="Remover documento anexo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé de Ações Canônicas */}
          <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 bg-[#eaf0f8]/90 dark:bg-slate-900/80 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleEnviarGateway}
              disabled={enviando || !telefoneDestino || (!mensagem.trim() && !documento)}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {enviando ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Transmitindo...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>
                    {documento ? "Enviar Mensagem e Documento" : "Enviar via WhatsApp Gateway"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
