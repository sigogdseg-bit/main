import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  CheckCircle2,
  MapPin,
  Smartphone,
  Globe,
  Clock,
  RotateCcw,
  Download,
  AlertTriangle,
  Lock,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { APP_NOME, APP_EMPRESA, APP_CNPJ } from "@/shared/lib/version";

export const Route = createFileRoute("/assinar")({
  component: PaginaAssinaturaCliente,
});

interface ContratoParaAssinar {
  id: string;
  numero_contrato: string;
  tipo_contrato: string;
  selo_autenticidade: string;
  codigo_verificacao: string;
  status: string;
  data_emissao: string;
  data_assinatura?: string | null;
  assinado_por_nome?: string | null;
  valor_mensalidade: number;
  valor_total_contrato: number;
  hash_pdf_original: string | null;
  hash_pdf_assinado: string | null;
  cliente: {
    nome_razao_social: string;
    documento: string;
    telefone: string;
    veiculos: Array<{ placa: string; marca?: string; modelo?: string; ano?: number }>;
  };
}

function PaginaAssinaturaCliente() {
  const [codigoUrl, setCodigoUrl] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [contrato, setContrato] = useState<ContratoParaAssinar | null>(null);

  // Estados de Evidências Periciais do Dispositivo
  const [ipCliente, setIpCliente] = useState<string>("Detectando conexão...");
  const [localizacao, setLocalizacao] = useState<{
    latitude: number;
    longitude: number;
    precisao: number;
    autorizado: boolean;
  } | null>(null);
  const [solicitandoLocalizacao, setSolicitandoLocalizacao] = useState(false);
  const [localizacaoRecusada, setLocalizacaoRecusada] = useState(false);

  // Canvas da Assinatura
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [temAssinatura, setTemAssinatura] = useState(false);

  // Aceite formal
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);
  const [assinaturaConcluida, setAssinaturaConcluida] = useState(false);
  const [trilhaAudit, setTrilhaAudit] = useState<any | null>(null);

  // Lê código da URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cod =
        params.get("codigo") || params.get("token") || params.get("id") || params.get("selo") || "";
      if (cod) {
        setCodigoUrl(cod);
        carregarContrato(cod);
      } else {
        setCarregando(false);
        setErro("Nenhum código de verificação ou contrato informado no link.");
      }
    }
  }, []);

  // Busca dados do contrato para exibição
  const carregarContrato = async (codigo: string) => {
    try {
      setCarregando(true);
      setErro(null);

      const res = await fetch("/api/contratos/obter-para-assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErro(
          errJson?.message || "Contrato não localizado ou indisponível. Verifique o link recebido.",
        );
        return;
      }

      const json = await res.json();
      if (json?.success && json?.contrato) {
        setContrato(json.contrato);
        if (json.contrato.status === "assinado") {
          setAssinaturaConcluida(true);
        }
      } else {
        setErro("Contrato não encontrado para este identificador.");
      }
    } catch (err: any) {
      setErro(err?.message || "Falha de conexão ao carregar o contrato.");
    } finally {
      setCarregando(false);
    }
  };

  // Captura automática de geolocalização com consentimento
  const solicitarGeolocalizacao = useCallback(() => {
    if (!navigator.geolocation) {
      toast.warning("Seu navegador não suporta geolocalização por GPS.");
      return;
    }

    setSolicitandoLocalizacao(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizacao({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          precisao: Math.round(pos.coords.accuracy),
          autorizado: true,
        });
        setLocalizacaoRecusada(false);
        setSolicitandoLocalizacao(false);
        toast.success("Geolocalização capturada com sucesso para a trilha pericial!");
      },
      (err) => {
        console.warn("Acesso à localização não permitido:", err);
        setLocalizacaoRecusada(true);
        setSolicitandoLocalizacao(false);
        toast.info(
          "Geolocalização não concedida. O contrato ainda pode ser assinado com validação por IP e dispositivo.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // Solicita geolocalização automaticamente ao carregar
  useEffect(() => {
    if (contrato && contrato.status !== "assinado" && !localizacao && !localizacaoRecusada) {
      solicitarGeolocalizacao();
    }
  }, [contrato, localizacao, localizacaoRecusada, solicitarGeolocalizacao]);

  // Redimensiona e inicializa o canvas de assinatura com suporte a retina display
  const inicializarCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "#0f172a"; // slate-900
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  useEffect(() => {
    if (contrato && !assinaturaConcluida) {
      inicializarCanvas();
    }
  }, [contrato, assinaturaConcluida]);

  // Ações do Canvas de Assinatura
  const obterPosicaoCanvas = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const iniciarDesenho = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = obterPosicaoCanvas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDesenhando(true);
    setTemAssinatura(true);
  };

  const desenhar = (e: React.MouseEvent | React.TouchEvent) => {
    if (!desenhando) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = obterPosicaoCanvas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const finalizarDesenho = () => {
    setDesenhando(false);
  };

  const limparAssinatura = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemAssinatura(false);
    inicializarCanvas();
  };

  // Submissão da Assinatura Eletrônica do Cliente
  const handleConfirmarAssinatura = async () => {
    if (!contrato) return;

    if (!temAssinatura) {
      toast.error("Por favor, faça sua assinatura ou rubrica no quadro antes de confirmar.");
      return;
    }

    if (!aceitouTermos) {
      toast.error("É obrigatório marcar a declaração de concordância e aceite formal dos termos.");
      return;
    }

    try {
      setEnviandoAssinatura(true);

      const canvas = canvasRef.current;
      const rubricaBase64 = canvas ? canvas.toDataURL("image/png") : null;

      const deviceInfo = {
        user_agent: navigator.userAgent,
        plataforma: (navigator as any).userAgentData?.platform || navigator.platform,
        tela: `${window.screen.width}x${window.screen.height}`,
        fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const payload = {
        codigo: codigoUrl,
        contrato_id: contrato.id,
        assinatura_rubrica_base64: rubricaBase64,
        geolocalizacao: localizacao,
        device_info: deviceInfo,
        declaracao_aceite: true,
      };

      const res = await fetch("/api/contratos/assinar-dispositivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Contrato assinado eletronicamente com sucesso e validade jurídica!");
        setAssinaturaConcluida(true);
        setTrilhaAudit(json.trilha_auditoria || null);
        if (json.contrato) {
          setContrato((prev) => (prev ? { ...prev, ...json.contrato } : json.contrato));
        }
      } else {
        toast.error(json.message || "Falha ao processar assinatura eletrônica.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro de comunicação ao enviar assinatura.");
    } finally {
      setEnviandoAssinatura(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-md border border-slate-700/60 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-bold text-white">Carregando Contrato Seguro</h2>
          <p className="text-xs text-slate-400">
            Acessando cadeia de custódia e preparando ambiente de assinatura eletrônica...
          </p>
        </div>
      </div>
    );
  }

  if (erro || !contrato) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-white">Documento Não Localizado</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {erro || "O identificador informado não corresponde a um contrato ativo no sistema."}
          </p>
          <div className="pt-2">
            <a
              href="/verificar"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Conferência Pública de Documentos</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 selection:bg-orange-500 selection:text-white">
      {/* Cabeçalho Oficial */}
      <header className="max-w-3xl w-full mx-auto space-y-3 pb-6 border-b border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-700 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>{APP_NOME.toUpperCase()}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  Assinatura Eletrônica
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Portal Oficial de Autenticação e Aceite Digital
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-400 block font-mono">CONTRATO OFICIAL</span>
            <span className="text-xs font-bold text-orange-400 font-mono">
              {contrato.numero_contrato}
            </span>
          </div>
        </div>

        {/* Amparo Jurídico */}
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <Lock className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong className="text-slate-200">Validade Jurídica e Força Executiva: </strong>
            Documento formalizado conforme o Art. 10, § 2º da Medida Provisória nº 2.200-2/2001 e
            Lei Federal nº 14.063/2020. Equiparado a título executivo extrajudicial (Art. 784, III
            do CPC).
          </p>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-3xl w-full mx-auto py-6 space-y-6">
        {/* TELA DE SUCESSO: QUANDO O CONTRATO JÁ ESTÁ ASSINADO */}
        {assinaturaConcluida ? (
          <div className="bg-slate-900 border border-orange-500/40 rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center mx-auto text-orange-400 shadow-lg shadow-orange-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-black text-white">Contrato Assinado com Sucesso!</h2>
              <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                A assinatura eletrônica de{" "}
                <strong className="text-orange-400 font-bold">
                  {contrato.cliente.nome_razao_social}
                </strong>{" "}
                foi confirmada, vinculada à trilha de auditoria pericial e gravada no banco de dados
                com selo de integridade imutável.
              </p>
            </div>

            {/* Quadro de Resumo Forense */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  Selo de Autenticidade:
                </span>
                <p className="font-mono font-bold text-orange-400">{contrato.selo_autenticidade}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  Código de Verificação:
                </span>
                <p className="font-mono font-bold text-sky-400">{contrato.codigo_verificacao}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  Data da Assinatura:
                </span>
                <p className="text-slate-200">
                  {contrato.data_assinatura
                    ? new Date(contrato.data_assinatura).toLocaleString("pt-BR")
                    : new Date().toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono">Signatário:</span>
                <p className="text-slate-200 font-semibold">
                  {contrato.assinado_por_nome || contrato.cliente.nome_razao_social}
                </p>
              </div>
              <div className="col-span-1 sm:col-span-2 space-y-1 pt-1 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  Hash Criptográfico SHA-256 Definitivo:
                </span>
                <p className="font-mono text-[11px] text-orange-400 break-all select-all bg-slate-900 p-2 rounded-lg border border-slate-800">
                  {contrato.hash_pdf_assinado ||
                    trilhaAudit?.hash_forense_aceite ||
                    "Gravado e Certificado na Cadeia de Custódia"}
                </p>
              </div>
            </div>

            {/* Ações pós-assinatura */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href={`/verificar?codigo=${contrato.codigo_verificacao}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 transition shadow-lg shadow-orange-600/20"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Verificar Autenticidade Pública</span>
              </a>

              <a
                href={`/api/contratos/download/${contrato.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
              >
                <Download className="h-4 w-4" />
                <span>Baixar Cópia Oficial (PDF)</span>
              </a>
            </div>
          </div>
        ) : (
          /* DOCUMENTO CONTRATUAL COMPLETO NA ÍNTEGRA COM ASSINATURA NO FINAL */
          <div className="space-y-6">
            {/* Barra de Ações Superior do Documento */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <FileText className="h-4 w-4 text-orange-400" />
                <span>
                  Exibindo o <strong className="text-white">Documento Oficial Completo</strong> para
                  leitura e assinatura
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/contratos/download/${contrato.codigo_verificacao}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition"
                >
                  <Download className="h-3.5 w-3.5 text-orange-400" />
                  <span>Baixar Minuta em PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
                >
                  <span>🖨️ Imprimir</span>
                </button>
              </div>
            </div>

            {/* O DOCUMENTO CONTRATUAL COMPLETO (FOLHA OFICIAL) */}
            <article className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-10 space-y-8 shadow-2xl text-slate-200 leading-relaxed font-sans">
              {/* Cabeçalho do Documento */}
              <div className="border-b border-slate-800 pb-6 text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Documento Oficial Certificado</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase">
                  CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA PRIVADA E RASTREAMENTO TÁTICO
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-400 pt-2">
                  <span>
                    CONTRATO Nº:{" "}
                    <strong className="text-orange-400">{contrato.numero_contrato}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    SELO: <strong className="text-sky-400">{contrato.selo_autenticidade}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    CÓDIGO:{" "}
                    <strong className="text-orange-400">{contrato.codigo_verificacao}</strong>
                  </span>
                </div>
              </div>

              {/* Preâmbulo */}
              <section className="text-xs sm:text-sm text-slate-300 text-justify leading-relaxed p-4 rounded-xl bg-slate-950 border border-slate-800/80">
                <p>
                  Pelo presente instrumento particular, as partes qualificadas têm entre si justo e
                  acordado o presente{" "}
                  <strong className="text-white">
                    CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA PRIVADA, RASTREAMENTO TÁTICO E
                    MONITORAMENTO VEICULAR
                  </strong>
                  , em conformidade com o Código Civil Brasileiro (Lei nº 10.406/2002), a Lei Geral
                  de Proteção de Dados Pessoais (Lei nº 13.709/2018), a Lei do Software (Lei nº
                  9.609/1998) e o Código de Defesa do Consumidor (Lei nº 8.078/1990), regendo-se
                  pelas cláusulas e condições a seguir estipuladas sob os princípios da probidade e
                  da boa-fé objetiva (art. 422 do Código Civil).
                </p>
              </section>

              {/* 1. Identificação das Partes Contratantes */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide border-b border-slate-800 pb-1 flex items-center gap-2">
                  <span>1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      CONTRATADA:
                    </span>
                    <p className="font-bold text-white text-sm">
                      DARIO DE NOVAES GONÇALVES JÚNIOR - MEI
                    </p>
                    <p className="text-slate-300">CNPJ: 26.581.175/0001-23</p>
                    <p className="text-slate-400">
                      Endereço: Rua Dom Antônio Cabral, nº 225, Bairro São Luiz, Volta Redonda/RJ,
                      CEP 27286-210
                    </p>
                    <p className="text-slate-400">
                      Plataforma Oficial:{" "}
                      <span className="text-orange-400 font-mono">
                        GD Segurança Privada (https://gd.oficial.tec.br)
                      </span>
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      CONTRATANTE:
                    </span>
                    <p className="font-bold text-white text-sm">
                      {contrato.cliente.nome_razao_social || "Não informado"}
                    </p>
                    <p className="text-slate-300 font-mono">
                      CPF/CNPJ: {contrato.cliente.documento || "Não informado"}
                    </p>
                    <p className="text-slate-400">
                      Telefone/WhatsApp: {contrato.cliente.telefone || "Não informado"}
                    </p>
                    <p className="text-slate-400">
                      Endereço:{" "}
                      {(contrato.cliente as any).endereco || "Conforme cadastro no sistema"}
                    </p>
                  </div>
                </div>
              </section>

              {/* 2. Do Objeto do Contrato */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide border-b border-slate-800 pb-1">
                  2. DO OBJETO DO CONTRATO E MODALIDADE DE SERVIÇO
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 text-justify leading-relaxed">
                  Constitui objeto deste instrumento a prestação de serviços especializados de{" "}
                  <strong className="text-white">
                    SEGURANÇA PRIVADA, RASTREAMENTO TÁTICO VEICULAR E PROTEÇÃO PATRIMONIAL
                  </strong>
                  , com a cessão em regime de comodato de equipamento eletrônico de rastreamento
                  telemático GPS/GNSS devidamente HOMOLOGADO PELA ANATEL, acompanhado de chip SIM
                  Card M2M/LTE dedicado para transmissão de dados. A plataforma digital proprietária{" "}
                  <strong className="text-white">{APP_NOME.toUpperCase()}</strong> é disponibilizada
                  ao CONTRATANTE para acompanhamento tático em tempo real, telemetria, rotas e
                  alertas.
                </p>
              </section>

              {/* 3. Parâmetros da Contratação */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide border-b border-slate-800 pb-1">
                  3. PARÂMETROS DO PLANO E CONDIÇÕES PACTUADAS
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                    <tbody className="divide-y divide-slate-800">
                      <tr className="bg-slate-950/60">
                        <td className="p-3 font-bold text-slate-400 w-1/3">Plano Contratado</td>
                        <td className="p-3 font-semibold text-white uppercase font-mono">
                          {(contrato.cliente as any).plano || "Master"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-400">Vigência Inicial</td>
                        <td className="p-3 text-slate-200">
                          12 (doze) meses com renovação automática
                        </td>
                      </tr>
                      <tr className="bg-slate-950/60">
                        <td className="p-3 font-bold text-slate-400">
                          Mensalidade do Plano de Serviço
                        </td>
                        <td className="p-3 font-bold text-orange-400">
                          {contrato.valor_mensalidade > 0
                            ? `R$ ${contrato.valor_mensalidade.toFixed(2)} / mês`
                            : "Incluso / Cortesia Comercial"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-400">Dia de Vencimento Mensal</td>
                        <td className="p-3 text-slate-200">
                          Todo dia {(contrato.cliente as any).dia_vencimento || 10} de cada mês
                        </td>
                      </tr>
                      <tr className="bg-slate-950/60">
                        <td className="p-3 font-bold text-slate-400">Equipamentos e Chips</td>
                        <td className="p-3 text-slate-300">
                          Cedidos em comodato inclusos no plano de serviço
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-bold text-slate-400">Indenização por Extravio</td>
                        <td className="p-3 text-slate-300">
                          R$ 450,00 por rastreador + R$ 50,00 por chip SIM M2M
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 4. Veículos e Equipamentos Vinculados */}
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide border-b border-slate-800 pb-1">
                  4. VEÍCULOS E EQUIPAMENTOS EM COMODATO (RASTREADORES E CHIPS)
                </h3>
                {contrato.cliente.veiculos && contrato.cliente.veiculos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {contrato.cliente.veiculos.map((v: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-orange-400 text-sm">
                            🚗 {v.placa || "SEM PLACA"}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold border border-orange-500/30">
                            Homologado ANATEL
                          </span>
                        </div>
                        <p className="font-semibold text-white">
                          {v.modelo || v.marca_modelo || "Veículo Cadastrado"}
                          {v.ano ? ` • Ano ${v.ano}` : ""}
                          {v.cor ? ` • Cor ${v.cor}` : ""}
                        </p>
                        <p className="text-slate-400 font-mono text-[11px]">
                          Hardware: {v.rastreador_modelo || "J16 4G LTE"} • IMEI:{" "}
                          {v.rastreador_imei || v.imei || "Vinculado na Ativação"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic p-3 rounded-xl bg-slate-950 border border-slate-800">
                    Veículos e rastreadores cadastrados no sistema e vinculados a este contrato.
                  </p>
                )}
              </section>

              {/* 5. Cláusulas e Condições Gerais (1ª a 12ª) */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wide border-b border-slate-800 pb-1">
                  5. CLÁUSULAS E CONDIÇÕES GERAIS DO CONTRATO
                </h3>
                <div className="space-y-3.5 text-xs text-slate-300 text-justify leading-relaxed">
                  <p>
                    <strong className="text-white">
                      CLÁUSULA PRIMEIRA - DA NATUREZA DA OPERAÇÃO E PRESTAÇÃO DE SERVIÇOS:
                    </strong>{" "}
                    A CONTRATADA presta serviços de segurança privada, rastreamento tático veicular
                    e proteção patrimonial através de hardware homologado pela ANATEL em regime de
                    comodato com conectividade M2M e plataforma digital GD Segurança Privada.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA SEGUNDA - DA PROTEÇÃO E GESTÃO PATRIMONIAL:
                    </strong>{" "}
                    O presente instrumento tem por escopo o rastreamento tático, monitoramento e
                    gestão patrimonial preventiva. Em caso de sinistro, furto ou roubo, a CONTRATADA
                    prestará apoio técnico por meio de sua telemetria e o CONTRATANTE acionará as
                    autoridades competentes (Polícia Militar via 190 ou Polícia Civil).
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA TERCEIRA - DO MONITORAMENTO E DAS LIMITAÇÕES TÉCNICAS:
                    </strong>{" "}
                    A transmissão de dados depende diretamente de satélites GPS/GNSS e cobertura de
                    dados móveis (GPRS/LTE/4G). Interferências externas como áreas de sombra
                    celular, garagens fechadas, subsolos, condições climáticas adversas ou uso
                    ilícito de bloqueadores de radiofrequência (jammers) podem degradar
                    temporariamente a transmissão dos dados, sem responsabilização da CONTRATADA.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA QUARTA - DA REMUNERAÇÃO DOS SERVIÇOS E ENCARGOS MORATÓRIOS:
                    </strong>{" "}
                    O valor mensal remunera a prestação dos serviços de segurança, rastreamento
                    tático e conectividade com comodato dos equipamentos. O não pagamento no
                    vencimento sujeita o CONTRATANTE a multa moratória de 2%, juros de mora de 1% ao
                    mês e atualização monetária pelo IPCA/IBGE. Atrasos superiores a 5 dias ensejam
                    suspensão temporária do acesso à plataforma e atrasos superiores a 30 dias
                    autorizam rescisão com recolhimento dos equipamentos e cobrança legal.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA QUINTA - DO PRAZO CONTRATUAL, DA VIGÊNCIA E RENOVAÇÃO:
                    </strong>{" "}
                    O contrato possui vigência de 12 (doze) meses, renovando-se automaticamente por
                    iguais períodos caso não haja denúncia por escrito com 30 dias de antecedência.
                    O cancelamento imotivado antes do término pelo CONTRATANTE enseja multa
                    compensatória de 20% sobre as parcelas vincendas (art. 416 do Código Civil).
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA SEXTA - DO REGIME DE COMODATO E DEVOLUÇÃO OBRIGATÓRIA:
                    </strong>{" "}
                    Os rastreadores e chips M2M são cedidos sob regime de comodato para a prestação
                    dos serviços. Encerrado o contrato por qualquer motivo, o CONTRATANTE obriga-se
                    a devolver os equipamentos em até 10 dias úteis, sob pena de indenização de R$
                    450,00 por rastreador e R$ 50,00 por chip SIM M2M, além de reintegração de
                    posse.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA SÉTIMA - DAS OBRIGAÇÕES E RESPONSABILIDADES DO CONTRATANTE:
                    </strong>{" "}
                    O CONTRATANTE compromete-se a zelar pelo perfeito funcionamento dos bens em
                    comodato, manter o sigilo de suas senhas, utilizar a ferramenta estritamente
                    para fins lícitos e cientificar previamente condutores terceiros quanto à
                    existência do rastreador, em estrita conformidade com a LGPD.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA OITAVA - DAS OBRIGAÇÕES DA CONTRATADA E LIMITAÇÃO DE
                      RESPONSABILIDADE:
                    </strong>{" "}
                    A CONTRATADA compromete-se a manter a plataforma acessível com padrões habituais
                    de mercado, prestar suporte técnico e substituir equipamentos com vício de
                    fabricação.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA NONA - DA PROTEÇÃO DE DADOS PESSOAIS (LGPD — LEI Nº 13.709/2018):
                    </strong>{" "}
                    O CONTRATANTE atua como controlador de seus dados e a CONTRATADA como operadora
                    técnica. Os dados são protegidos com criptografia e trilhas de auditoria, sendo
                    vedada sua comercialização ou compartilhamento com terceiros.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA DÉCIMA - DA PROPRIEDADE INTELECTUAL:
                    </strong>{" "}
                    A plataforma GD Segurança Privada, marcas, logotipos e interfaces constituem
                    propriedade intelectual exclusiva de Dario de Novaes Gonçalves Júnior, sendo
                    concedida apenas licença de uso pessoal, temporária e intransferível.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA DÉCIMA PRIMEIRA - DA ASSINATURA ELETRÔNICA E FORÇA EXECUTIVA:
                    </strong>{" "}
                    As partes reconhecem a plena validade jurídica, eficácia probatória e
                    executividade deste contrato formalizado eletronicamente por meio digital (Art.
                    10, § 2º da MP nº 2.200-2/2001 e Art. 784, III do CPC), gerando hash
                    criptográfico SHA-256 e selo de autenticidade imutável conferível em
                    https://gd.oficial.tec.br/verificar.
                  </p>

                  <p>
                    <strong className="text-white">
                      CLÁUSULA DÉCIMA SEGUNDA - DO FORO DE ELEIÇÃO:
                    </strong>{" "}
                    Fica eleito o Foro da Comarca de Volta Redonda/RJ para dirimir eventuais dúvidas
                    ou litígios decorrentes deste contrato, renunciando a qualquer outro por mais
                    privilegiado que seja.
                  </p>
                </div>
              </section>

              {/* Declaração Formal de Ciência e Aceite */}
              <section className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider block">
                  DECLARAÇÃO FORMAL DE ACEITE E CIÊNCIA:
                </span>
                <p className="text-xs text-slate-300 text-justify leading-relaxed">
                  O(A) CONTRATANTE declara, sob as penas da lei, que leu e compreendeu integralmente
                  todas as 12 cláusulas e condições deste Contrato de Prestação de Serviços, que as
                  aceita em sua totalidade de forma irrevogável e vinculante, reconhecendo o
                  presente instrumento como juridicamente válido e dotado de força de título
                  executivo extrajudicial.
                </p>
              </section>

              {/* NO FINAL DO DOCUMENTO INTEIRO — ÁREA DE ASSINATURA ELETRÔNICA */}
              <section className="pt-6 border-t-2 border-orange-500/40 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[11px] uppercase font-bold text-orange-400 tracking-wider">
                      Etapa Final de Formalização
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-orange-400" />
                      <span>ASSINATURA ELETRÔNICA DO CLIENTE</span>
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Volta Redonda/RJ, {new Date().toLocaleDateString("pt-BR")}
                  </span>
                </div>

                {/* Trilha Pericial do Aparelho */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-sky-400" />
                    <span>Trilha Pericial e Evidências Digitais do Dispositivo</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-slate-500 text-[10px] block">Conexão de Origem:</span>
                      <span className="font-semibold text-slate-300">
                        IP autenticado e auditado pelo servidor
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-slate-500 text-[10px] block">Horário Atômico:</span>
                      <span className="font-semibold text-slate-300">
                        {new Date().toLocaleString("pt-BR")} (Horário de Brasília)
                      </span>
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between pt-1 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-500 text-[10px] block">
                          Geolocalização GPS:
                        </span>
                        {localizacao ? (
                          <span className="font-mono text-orange-400 font-bold">
                            Lat: {localizacao.latitude.toFixed(4)}, Lon:{" "}
                            {localizacao.longitude.toFixed(4)} (±{localizacao.precisao}m)
                          </span>
                        ) : (
                          <span className="text-slate-400">Pendente de autorização</span>
                        )}
                      </div>
                      {!localizacao && (
                        <button
                          type="button"
                          onClick={solicitarGeolocalizacao}
                          disabled={solicitandoLocalizacao}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 transition cursor-pointer"
                        >
                          {solicitandoLocalizacao ? "Obtendo GPS..." : "Autorizar Localização"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quadro de Rubrica / Assinatura Manuscrita com o Dedo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>✍️ Desenhe sua Assinatura ou Rubrica:</span>
                    </label>
                    <button
                      type="button"
                      onClick={limparAssinatura}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Limpar e Refazer</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Use o dedo na tela do seu celular (ou o mouse no computador) para assinar no
                    quadro abaixo:
                  </p>

                  <div className="relative w-full h-44 bg-white rounded-xl border-2 border-dashed border-slate-400 overflow-hidden touch-none select-none shadow-inner">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={iniciarDesenho}
                      onMouseMove={desenhar}
                      onMouseUp={finalizarDesenho}
                      onMouseLeave={finalizarDesenho}
                      onTouchStart={iniciarDesenho}
                      onTouchMove={desenhar}
                      onTouchEnd={finalizarDesenho}
                      className="w-full h-full cursor-crosshair"
                    />

                    {!temAssinatura && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs">
                        <span>✍️ Assine ou rubrique com o dedo aqui</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkbox de Aceite Formal */}
                <div className="p-4 rounded-xl bg-slate-950 border border-orange-500/30 space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aceitouTermos}
                      onChange={(e) => setAceitouTermos(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-700 text-orange-600 focus:ring-orange-500 focus:ring-offset-slate-900 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 leading-relaxed">
                      Eu,{" "}
                      <strong className="text-white font-bold">
                        {contrato.cliente.nome_razao_social}
                      </strong>
                      , portador(a) do CPF/CNPJ{" "}
                      <strong className="text-white font-mono">{contrato.cliente.documento}</strong>
                      , declaro que li integralmente todas as páginas e cláusulas deste documento,
                      concordo expressamente com todos os seus termos e firmo eletronicamente o
                      presente{" "}
                      <strong className="text-orange-400">
                        Contrato Oficial nº {contrato.numero_contrato}
                      </strong>
                      , com plena validade jurídica e força executiva nos termos do Art. 10, § 2º da
                      Medida Provisória nº 2.200-2/2001 e Lei Federal nº 14.063/2020.
                    </span>
                  </label>
                </div>

                {/* Botão de Confirmação Definitiva */}
                <button
                  type="button"
                  onClick={handleConfirmarAssinatura}
                  disabled={enviandoAssinatura || !temAssinatura || !aceitouTermos}
                  className="w-full py-4 rounded-xl text-sm font-black text-white bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 hover:from-orange-500 hover:to-amber-600 transition shadow-xl shadow-orange-600/30 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {enviandoAssinatura ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Gravando Assinatura e Emitindo Selo SGD...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      <span>Confirmar e Assinar Eletronicamente (1 Toque)</span>
                    </>
                  )}
                </button>

                <div className="text-center">
                  <span className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span>
                      Criptografia SHA-256 • Selo de Autenticidade SGD • Trilha Forense Imutável
                    </span>
                  </span>
                </div>
              </section>
            </article>
          </div>
        )}
      </main>

      {/* Rodapé Informativo */}
      <footer className="max-w-3xl w-full mx-auto text-center pt-6 border-t border-slate-800/80 text-xs text-slate-500 space-y-1">
        <p>
          {APP_EMPRESA} — CNPJ {APP_CNPJ}
        </p>
        <p className="text-[11px] text-slate-600">
          GD Rastreamento — Sistema Integrado de Governança Operacional e Rastreamento Veicular
        </p>
      </footer>
    </div>
  );
}
