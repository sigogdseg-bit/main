import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Car,
  Search,
  LayoutGrid,
  List,
  Bell,
  Headphones,
  MessageCircle,
  QrCode,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { carregarVeiculosGps, avaliarStatusComunicacao } from "@/features/monitor-gps/services/gpsService";
import type { VeiculoGps } from "@/features/monitor-gps/types";
import { HunterVehicleCard } from "./HunterVehicleCard";
import { ModalPixRapido } from "@/features/mensalidades/components/ModalPixRapido";
import {
  listarMensalidades,
  verificarStatusFinanceiroCliente,
  formatarCompetenciaMensalidade,
  type StatusFinanceiroCliente,
} from "@/features/mensalidades/services/mensalidadeService";
import type { MensalidadeItem } from "@/features/mensalidades/types";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";

interface ClienteHomeViewProps {
  onAlternarParaModulos?: () => void;
}

/**
 * Componente ClienteHomeView
 * Experiência móvel e desktop de elite para o cliente final:
 * - Saudação com avatar personalizado e contadores operacionais
 * - Grid de veículos com o padrão Movitrak (fotos reais, placa Mercosul e telemetria 2x2)
 * - Banner de suporte 24h com acionamento de WhatsApp
 * - Resumo financeiro com acionamento de PIX de 1 toque
 * - Transição fluida entre visão de veículos e visão de módulos
 */
export const ClienteHomeView: React.FC<ClienteHomeViewProps> = ({ onAlternarParaModulos }) => {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [veiculos, setVeiculos] = useState<VeiculoGps[]>([]);
  const [carregandoVeiculos, setCarregandoVeiculos] = useState(true);
  const [busca, setBusca] = useState("");
  const [modoVisualizacao, setModoVisualizacao] = useState<"grid" | "lista">("grid");

  // Dados Financeiros e Modal PIX
  const [mensalidadePendente, setMensalidadePendente] = useState<MensalidadeItem | null>(null);
  const [statusFinanceiro, setStatusFinanceiro] = useState<StatusFinanceiroCliente | null>(null);
  const [modalPixAberto, setModalPixAberto] = useState(false);
  const [pixPayload, setPixPayload] = useState("");
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState("");
  const [gerandoPix, setGerandoPix] = useState(false);

  // Carrega os veículos do cliente autenticado
  useEffect(() => {
    let ativo = true;
    async function carregar() {
      setCarregandoVeiculos(true);
      try {
        const lista = await carregarVeiculosGps();
        if (ativo) {
          setVeiculos(lista);
        }
      } catch (err) {
        console.error("Erro ao carregar veículos do cliente:", err);
      } finally {
        if (ativo) {
          setCarregandoVeiculos(false);
        }
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  // Carrega o status financeiro e a primeira mensalidade pendente para pagamento
  useEffect(() => {
    let ativo = true;
    async function carregarFinanceiro() {
      if (!session?.userId) return;
      try {
        const status = await verificarStatusFinanceiroCliente(
          session.userId,
          session.clienteId,
          session.isMotorista,
        );
        if (ativo) setStatusFinanceiro(status);

        const lista = await listarMensalidades(session.userId);
        if (ativo && lista && lista.length > 0) {
          const pendente = lista.find((m) => m.status === "pendente" || m.status === "vencido");
          if (pendente) {
            setMensalidadePendente(pendente);
          }
        }
      } catch (err) {
        console.error("Erro ao checar dados financeiros do cliente:", err);
      }
    }
    carregarFinanceiro();
    return () => {
      ativo = false;
    };
  }, [session?.userId, session?.clienteId, session?.isMotorista]);

  // Filtro de busca de veículos
  const veiculosFiltrados = useMemo(() => {
    if (!busca.trim()) return veiculos;
    const termo = busca.toLowerCase().trim();
    return veiculos.filter(
      (v) =>
        (v.placa && v.placa.toLowerCase().includes(termo)) ||
        (v.marca_modelo && v.marca_modelo.toLowerCase().includes(termo)) ||
        (v.cliente_nome && v.cliente_nome.toLowerCase().includes(termo)),
    );
  }, [veiculos, busca]);

  // Contadores rápidos de telemetria baseados na comunicação factual do rastreador
  const totalVeiculos = veiculos.length;
  const onlineVeiculos = veiculos.filter(
    (v) => avaliarStatusComunicacao(v.ultima_atualizacao).ativo,
  ).length;
  const offlineVeiculos = totalVeiculos - onlineVeiculos;
  const estacionadosVeiculos = veiculos.filter(
    (v) => !v.ignicao && v.velocidade <= 3,
  ).length;
  const emRotaVeiculos = veiculos.filter(
    (v) => v.ignicao || v.velocidade > 3,
  ).length;
  const totalAlertas = veiculos.filter((v) => v.alerta_acidente || v.bloqueado).length;

  // Abertura rápida do PIX
  const handleAbrirPix = async (item: MensalidadeItem) => {
    setGerandoPix(true);
    setModalPixAberto(true);
    try {
      const valor = item.valor || 54.9;
      const chavePix = APP_CHAVE_PIX_PADRAO;
      const nomeRecebedor = "GD SEGURANCA";
      const cidadeRecebedor = "SAO LUIS";
      const identificador = `MENSALIDADE${item.mes_referencia || "08"}${item.ano_referencia || "2026"}`;

      const payload = gerarPayloadPix({
        chavePix,
        nomeRecebedor,
        cidadeRecebedor,
        valor,
        identificador,
      });

      const qrCode = await gerarQrCodePixDataUrl(payload);
      setPixPayload(payload);
      setPixQrCodeUrl(qrCode);
    } catch (err) {
      console.error("Falha ao gerar PIX:", err);
      toast.error("Erro ao gerar QR Code do PIX.");
    } finally {
      setGerandoPix(false);
    }
  };

  // Redirecionamento para o mapa com seleção
  const handleVerNoMapa = (veiculo: VeiculoGps) => {
    try {
      localStorage.setItem("@hunter_veiculo_selecionado_id", veiculo.id);
    } catch {}
    navigate({ to: "/monitor-gps" as any });
  };

  // Redirecionamento para o cockpit / monitor
  const handleAbrirCockpit = (veiculo: VeiculoGps) => {
    try {
      localStorage.setItem("@hunter_veiculo_selecionado_id", veiculo.id);
      localStorage.setItem("@hunter_abrir_cockpit", "true");
    } catch {}
    navigate({ to: "/monitor-gps" as any });
  };

  // Nome do cliente e inicial
  const nomeCliente = session?.nome || "Cliente";
  const primeiroNome = nomeCliente.split(" ")[0] || "Cliente";
  const inicial = primeiroNome.charAt(0).toUpperCase() || "C";

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none pb-12">
      {/* 1. Header do Cliente com Degradê Institucional e Contadores em Pílulas */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600 text-white p-5 sm:p-7 shadow-[0_12px_32px_rgba(234,88,12,0.22)]">
        {/* Círculos de Iluminação Suave no Fundo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-black/10 rounded-full blur-xl pointer-events-none" />

        {/* Linha Superior: Avatar, Saudação e Botão de Notificações */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Avatar Circular com Inicial */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-orange-700/80 border-2 border-white/70 flex items-center justify-center font-black text-xl sm:text-2xl text-white shadow-md shrink-0">
              {inicial}
            </div>
            <div>
              <span className="text-xs sm:text-sm text-white/80 font-medium block">
                Bem-vindo de volta,
              </span>
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-tight">
                {primeiroNome} !
              </h1>
            </div>
          </div>

          {/* Botão de Alertas / Notificações */}
          <Link
            to="/chat"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white text-orange-600 hover:bg-orange-50 flex items-center justify-center shadow-md relative transition-transform active:scale-95 cursor-pointer"
            title="Central de Notificações e Chat"
          >
            <Bell className="w-5 h-5 text-slate-800" />
            {totalAlertas > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white animate-pulse">
                {totalAlertas}
              </span>
            )}
          </Link>
        </div>

        {/* Faixa Horizontal de Contadores Rápidos em Pílulas */}
        <div className="relative z-10 grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-white/20">
          {/* Veículos */}
          <div className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl bg-black/15 backdrop-blur-xs border border-white/10">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black">
              <Car className="w-3.5 h-3.5" />
              <span className="font-mono font-tabular">{totalVeiculos}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium">veículos</span>
          </div>

          {/* Online */}
          <div
            className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl bg-black/15 backdrop-blur-xs border border-white/10"
            title={`${onlineVeiculos} veículo(s) com rastreador comunicando em tempo real (${estacionadosVeiculos} estacionado(s), ${emRotaVeiculos} em movimento)`}
          >
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span className="font-mono font-tabular">{onlineVeiculos}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium">online</span>
          </div>

          {/* Offline */}
          <div
            className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl bg-black/15 backdrop-blur-xs border border-white/10"
            title={`${offlineVeiculos} veículo(s) sem comunicação recente com o servidor`}
          >
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-white/90">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="font-mono font-tabular">{offlineVeiculos}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium">offline</span>
          </div>

          {/* Alertas */}
          <div className="flex flex-col items-center justify-center py-1 px-2 rounded-2xl bg-black/15 backdrop-blur-xs border border-white/10">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black">
              <Bell className="w-3.5 h-3.5 text-amber-300" />
              <span className="font-mono font-tabular">{totalAlertas}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium">alertas</span>
          </div>
        </div>
      </div>

      {/* 2. Seção de Alerta Financeiro com Botão PIX de 1 Toque (Caso Haja Mensalidade) */}
      {mensalidadePendente && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:shadow-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-slate-900 dark:text-slate-100">
                  Mensalidade{" "}
                  {formatarCompetenciaMensalidade(
                    mensalidadePendente.mes_referencia,
                    mensalidadePendente.ano_referencia,
                  )}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    mensalidadePendente.status === "vencido"
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {mensalidadePendente.status === "vencido" ? "Vencida" : "Em aberto"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Valor:{" "}
                <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-sm font-tabular">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(mensalidadePendente.valor || 54.9)}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleAbrirPix(mensalidadePendente)}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-slate-900 hover:bg-black dark:bg-orange-500 dark:hover:bg-orange-600 text-white font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer shrink-0"
          >
            <QrCode className="w-4 h-4 text-orange-400 dark:text-white" />
            <span>Pagar com PIX</span>
          </button>
        </div>
      )}

      {/* 3. Barra de Título e Ferramentas: Meus Veículos, Busca e Alternador de Visão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Meus veículos
          </h2>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {veiculosFiltrados.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Campo de Busca Rápida */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar placa ou modelo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-xs transition"
            />
          </div>

          {/* Alternador de Visualização (Grade / Lista) */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setModoVisualizacao("grid")}
              className={`p-1.5 rounded-xl transition ${
                modoVisualizacao === "grid"
                  ? "bg-white dark:bg-slate-900 text-orange-600 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title="Visualização em Grade de Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setModoVisualizacao("lista")}
              className={`p-1.5 rounded-xl transition ${
                modoVisualizacao === "lista"
                  ? "bg-white dark:bg-slate-900 text-orange-600 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title="Visualização em Lista Compacta"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Lista dos Veículos do Cliente */}
      {carregandoVeiculos ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-80 rounded-3xl bg-slate-200/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
      ) : veiculosFiltrados.length === 0 ? (
        <div className="rounded-3xl p-8 sm:p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
            <Car className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Nenhum veículo encontrado
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {busca
              ? `Não localizamos nenhum veículo correspondente ao termo "${busca}".`
              : "Nenhum veículo ativo está vinculado à sua conta no momento."}
          </p>
        </div>
      ) : modoVisualizacao === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {veiculosFiltrados.map((v) => (
            <HunterVehicleCard
              key={v.id}
              veiculo={v}
              onVerNoMapa={handleVerNoMapa}
              onAbrirCockpit={handleAbrirCockpit}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {veiculosFiltrados.map((v) => (
            <div
              key={v.id}
              onClick={() => handleVerNoMapa(v)}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-orange-500/50 shadow-xs hover:shadow-md transition-all flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                      {v.placa}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {v.marca_modelo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        v.velocidade > 3 || v.ignicao
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-400"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          v.velocidade > 3 || v.ignicao
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-slate-400"
                        }`}
                      />
                      {v.velocidade > 3 ? "Em Rota" : v.ignicao ? "Ligado" : "Estacionado"}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="font-mono font-tabular text-slate-700 dark:text-slate-300 font-bold">
                      {v.velocidade} km/h
                    </span>
                  </div>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
            </div>
          ))}
        </div>
      )}

      {/* 5. Banner "Preciso de Ajuda - Fale com Nossa Central 24h" (WhatsApp) */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-5 sm:p-6 shadow-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Glow e Detalhe Visual */}
        <div className="absolute right-0 top-0 w-48 h-48 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
            <Headphones className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h3 className="font-black text-base sm:text-lg text-white tracking-tight">
              Preciso de ajuda
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Fale com nossa central 24h</p>
          </div>
        </div>

        <Link
          to="/chat"
          className="relative z-10 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-md transition-all active:scale-98 cursor-pointer shrink-0"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Falar agora</span>
        </Link>
      </div>

      {/* 6. Acesso Alternativo aos Módulos Operacionais Avançados */}
      {onAlternarParaModulos && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onAlternarParaModulos}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-xs active:scale-98"
          >
            <Layers className="w-4 h-4 text-orange-500" />
            <span>Ver Todos os Módulos Operacionais</span>
          </button>
        </div>
      )}

      {/* Modal de Pagamento PIX Instantâneo */}
      {mensalidadePendente && (
        <ModalPixRapido
          aberto={modalPixAberto}
          onFechar={() => setModalPixAberto(false)}
          valor={mensalidadePendente.valor || 54.9}
          qrCodeDataUrl={pixQrCodeUrl}
          pixCopiaECola={pixPayload}
          descricao={`Mensalidade ${formatarCompetenciaMensalidade(mensalidadePendente.mes_referencia, mensalidadePendente.ano_referencia)}`}
        />
      )}
    </div>
  );
};
