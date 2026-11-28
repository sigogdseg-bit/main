import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { X, Calendar, Activity, AlertTriangle, FileText, Zap } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Cliente } from "../types";
import { toast } from "sonner";
import {
  calcularSha256Buffer,
  registrarDocumentoEmitido,
} from "@/features/seguranca/services/documentosService";
import { aplicarCertidaoAutenticidadePdf } from "@/features/seguranca/services/certidaoPdfHelper";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { APP_NOME, APP_VERSION_NUMERO, APP_DOMINIO } from "@/shared/lib/version";
import { formatarKm, formatarMinutos } from "@/features/monitor-gps/utils/formatadoresViagem";
import { isCicloViagemReal } from "@/features/monitor-gps/services/gpsService";

// ============================================================================
// TIPAGEM
// ============================================================================
interface VeiculoAnalyticsData {
  veiculo_id: string;
  placa: string;
  marca_modelo: string;
  data_referencia: string;
  km_rodado: number;
  tempo_ocioso_minutos: number;
  vel_maxima_atingida: number;
  consumo_kml: number;
  score_conducao: number;
}

// ============================================================================
// COMPONENTE PRINCIPAL (Zero Corte / Modal Global)
// ============================================================================
export function ClienteVeiculosAnalyticsModal({
  cliente,
  onFechar,
}: {
  cliente: Cliente;
  onFechar: () => void;
}) {
  const [periodo, setPeriodo] = useState<7 | 15 | 30>(7);
  const [dados, setDados] = useState<VeiculoAnalyticsData[]>([]);
  const [veiculosCliente, setVeiculosCliente] = useState<
    { id: string; placa: string; marca_modelo: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Filtro opcional por placa (se tivermos vários veículos)
  const [placaFiltro, setPlacaFiltro] = useState<string>("todos");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // 1. Tenta RPC canônica se estiver disponível no Postgres
        let carregouRpc = false;
        try {
          const { data, error } = await supabase.rpc("gerar_analytics_cliente_dia", {
            p_cliente_id: cliente.id,
            p_dias: periodo,
          });
          if (!error && Array.isArray(data) && data.length > 0) {
            setDados(data);
            const placas = Array.from(new Set(data.map((d: any) => d.placa)));
            setVeiculosCliente(placas.map((p) => ({ id: p, placa: p, marca_modelo: "" })));
            carregouRpc = true;
          }
        } catch {
          carregouRpc = false;
        }

        if (carregouRpc) return;

        // 2. Defesa em profundidade / Fallback resiliente direto das tabelas canônicas
        const { data: veics } = await supabase
          .from("veiculos")
          .select("id, placa, marca_modelo")
          .eq("cliente_id", cliente.id);

        if (!veics || veics.length === 0) {
          setDados([]);
          setVeiculosCliente([]);
          return;
        }

        setVeiculosCliente(veics);
        const veicIds = veics.map((v) => v.id);

        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - periodo);
        dataInicio.setHours(0, 0, 0, 0);

        const [resViagens, resAlertas] = await Promise.all([
          supabase
            .from("viagens_trajetos")
            .select(
              "veiculo_id, km_percorrido, velocidade_media, velocidade_maxima, inicio_at, fim_at",
            )
            .in("veiculo_id", veicIds)
            .gte("inicio_at", dataInicio.toISOString())
            .order("inicio_at", { ascending: true }),
          supabase
            .from("alertas_seguranca")
            .select("veiculo_id, created_at")
            .in("veiculo_id", veicIds)
            .gte("created_at", dataInicio.toISOString()),
        ]);

        const viagens = (resViagens.data || []).filter(isCicloViagemReal);
        const alertas = resAlertas.data || [];

        const mapa = new Map<string, VeiculoAnalyticsData>();

        for (const v of viagens) {
          const dataRef = (v.inicio_at || "").substring(0, 10);
          if (!dataRef) continue;
          const chave = `${v.veiculo_id}_${dataRef}`;
          const veicInfo = veics.find((x) => x.id === v.veiculo_id);

          if (!mapa.has(chave)) {
            mapa.set(chave, {
              veiculo_id: v.veiculo_id,
              placa: veicInfo?.placa || "Sem Placa",
              marca_modelo: veicInfo?.marca_modelo || "Veículo",
              data_referencia: dataRef,
              km_rodado: 0,
              tempo_ocioso_minutos: 0,
              vel_maxima_atingida: 0,
              consumo_kml: 0,
              score_conducao: 100,
            });
          }

          const reg = mapa.get(chave)!;
          reg.km_rodado += Number(v.km_percorrido || 0);
          reg.vel_maxima_atingida = Math.max(
            reg.vel_maxima_atingida,
            Number(v.velocidade_maxima || 0),
          );

          if (v.fim_at && v.inicio_at) {
            const minTotal = Math.max(
              0,
              Math.round((new Date(v.fim_at).getTime() - new Date(v.inicio_at).getTime()) / 60000),
            );
            const minMov =
              v.velocidade_media && v.km_percorrido
                ? Math.round((Number(v.km_percorrido) / Number(v.velocidade_media)) * 60)
                : 0;
            reg.tempo_ocioso_minutos += Math.max(0, minTotal - minMov);
          }
        }

        for (const reg of mapa.values()) {
          reg.km_rodado = Number(reg.km_rodado.toFixed(2));
          let score = 100;
          if (reg.vel_maxima_atingida > 90) {
            score -= reg.vel_maxima_atingida - 90;
          }
          if (reg.tempo_ocioso_minutos > 30) {
            score -= 5;
          }
          const numAlertas = alertas.filter(
            (a) =>
              a.veiculo_id === reg.veiculo_id &&
              (a.created_at || "").startsWith(reg.data_referencia),
          ).length;
          score -= numAlertas * 5;
          reg.score_conducao = Math.max(30, Math.min(100, score));
        }

        setDados(Array.from(mapa.values()));
      } catch (err) {
        console.error("Erro ao carregar analytics do cliente:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [cliente.id, periodo]);

  // Lista única de veículos disponíveis
  const veiculosDisponiveis = Array.from(
    new Set([...veiculosCliente.map((v) => v.placa), ...dados.map((d) => d.placa)]),
  ).filter(Boolean);

  // Filtragem
  const dadosFiltrados =
    placaFiltro === "todos" ? dados : dados.filter((d) => d.placa === placaFiltro);

  // Consolidação diária (para o gráfico, caso "todos" os veículos sejam selecionados, precisamos agregar por dia)
  // Se for "todos", tiramos a média de score e soma de km, max vel
  const dadosGrafico = Object.values(
    dadosFiltrados.reduce(
      (acc, d) => {
        const date = d.data_referencia;
        if (!acc[date]) {
          acc[date] = {
            data_referencia: date,
            km_rodado: 0,
            tempo_ocioso_minutos: 0,
            vel_maxima_atingida: 0,
            score_soma: 0,
            count: 0,
          };
        }
        acc[date].km_rodado += Math.round(Number(d.km_rodado || 0));
        acc[date].tempo_ocioso_minutos += Number(d.tempo_ocioso_minutos || 0);
        acc[date].vel_maxima_atingida = Math.max(
          acc[date].vel_maxima_atingida,
          Number(d.vel_maxima_atingida || 0),
        );
        acc[date].score_soma += Number(d.score_conducao || 0);
        acc[date].count += 1;
        return acc;
      },
      {} as Record<string, any>,
    ),
  )
    .map((d: any) => ({
      ...d,
      km_rodado: Number(Number(d.km_rodado).toFixed(2)),
      score_conducao: Math.round(d.score_soma / d.count), // Média do dia
      dataFormatada: new Date(d.data_referencia + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
    }))
    .sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));

  // Totais agregados
  const totalKm = Number(dadosGrafico.reduce((acc, d) => acc + d.km_rodado, 0).toFixed(2));
  const totalOcioso = dadosGrafico.reduce((acc, d) => acc + d.tempo_ocioso_minutos, 0);
  const maxVelocidade = Math.max(0, ...dadosGrafico.map((d) => d.vel_maxima_atingida));
  const avgScore =
    dadosGrafico.length > 0
      ? Math.round(dadosGrafico.reduce((acc, d) => acc + d.score_conducao, 0) / dadosGrafico.length)
      : 0;

  const handleExportarPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF("p", "pt", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const logoBase64 = await carregarLogoEmblemaBase64();

      // Faixa Superior Institucional
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 56, "F");

      doc.setFillColor(16, 185, 129); // emerald-500
      doc.rect(0, 53, pageWidth, 3, "F");

      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", 30, 5, 46, 46);
        } catch {
          // Fallback silencioso
        }
      }

      const offsetTextoX = logoBase64 ? 86 : 40;

      // Cabeçalho
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Dossiê Analítico da Frota (Veículos)", offsetTextoX, 28);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`GD Rastreamento · ${APP_DOMINIO} · Emissão Oficial Autenticada`, offsetTextoX, 42);

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Cliente: ${cliente.nome_razao_social}`, 40, 75);
      doc.text(`Veículo(s): ${placaFiltro === "todos" ? "Todos da Frota" : placaFiltro}`, 40, 90);
      doc.text(`Período de Análise: Últimos ${periodo} dias`, 40, 105);
      doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 40, 120);

      // KPIs
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Resumo de Performance", 40, 145);

      autoTable(doc, {
        startY: 155,
        head: [["Métrica", "Valor Total/Médio"]],
        body: [
          ["Driver Score (Média)", `${avgScore} / 100`],
          ["Velocidade Máxima Atingida", `${maxVelocidade} km/h`],
          ["Total de Km Rodados", formatarKm(totalKm)],
          ["Tempo Total Ocioso", formatarMinutos(totalOcioso)],
        ],
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246] },
      });

      // Dados Diários
      doc.text("Evolução Diária (Consolidada)", 40, (doc as any).lastAutoTable.finalY + 30);

      const tableData = dadosGrafico.map((d) => [
        d.dataFormatada,
        d.score_conducao,
        d.vel_maxima_atingida,
        formatarKm(d.km_rodado),
        formatarMinutos(d.tempo_ocioso_minutos),
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 40,
        head: [["Data", "Score Médio", "Vel Máx (km/h)", "Distância Total", "Ociosidade"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [15, 23, 42] },
      });

      // Rodapé de Autenticidade
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `${APP_NOME} v${APP_VERSION_NUMERO} · Relatório Forense Oficial · Validação em: ${APP_DOMINIO}/auditoria · Página ${i} de ${pageCount}`,
          40,
          doc.internal.pageSize.getHeight() - 20,
        );
      }

      const nomeLimpo = (cliente.nome_razao_social || "cliente")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .toLowerCase();
      const nomeArquivo = `dossie_frota_${nomeLimpo}_${Date.now()}.pdf`;

      await aplicarCertidaoAutenticidadePdf({
        doc,
        tipoDocumento: "DOSSIE_FROTA_TELEMETRIA",
        nomeArquivo,
        descricao: `Dossiê Forense de Veículos da Frota - ${cliente.nome_razao_social} (${placaFiltro === "todos" ? "Todos da Frota" : placaFiltro})`,
        emissorNome: "Operador",
        forcarNovaPagina: true,
        metadataExtra: {
          cliente_id: cliente.id,
          cliente_nome: cliente.nome_razao_social,
          veiculo_filtro: placaFiltro,
          periodo_dias: periodo,
        },
      });

      doc.save(nomeArquivo);
      toast.success("Dossiê Forense emitido e registrado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar dossiê em PDF.");
    }
  };

  return ReactDOM.createPortal(
    <div
      id="modal-veiculos-analytics-overlay"
      className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto select-none"
      onClick={onFechar}
    >
      <div
        className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/50 dark:bg-slate-950/50 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
                Analytics de Frota (Veículos)
              </h2>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {cliente.nome_razao_social}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {veiculosDisponiveis.length > 0 && (
              <select
                value={placaFiltro}
                onChange={(e) => setPlacaFiltro(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none uppercase"
              >
                <option value="todos">Todos os Veículos</option>
                {veiculosDisponiveis.map((placa) => (
                  <option key={placa} value={placa}>
                    {placa}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleExportarPDF}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl px-4 py-2 transition shadow-lg shadow-blue-500/20"
              title="Baixar Dossiê Completo (PDF)"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </button>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as any)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/50 outline-none"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={15}>Últimos 15 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>

            <button
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="p-6">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center space-y-4 text-slate-500">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="font-medium animate-pulse">Consolidando Dossiê Analítico da Frota...</p>
            </div>
          ) : dadosGrafico.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center p-6 text-center text-slate-500 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <AlertTriangle className="h-10 w-10 mb-2 text-amber-500 opacity-70" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Nenhum deslocamento registrado nos últimos {periodo} dias.
              </p>
              {veiculosDisponiveis.length > 0 && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-md space-y-1">
                  <p>
                    Veículo(s) na frota do cliente:{" "}
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {veiculosDisponiveis.join(", ")}
                    </span>
                  </p>
                  <p>
                    Selecione um período mais amplo (15 ou 30 dias) no topo para visualizar viagens
                    anteriores.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-blue-500" /> Score de Condução
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {avgScore} <span className="text-xs font-normal text-slate-500">/100</span>
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-orange-500" /> Velocidade Máxima
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {maxVelocidade} <span className="text-xs font-normal text-slate-500">km/h</span>
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-500" /> Km Rodados
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {totalKm.toLocaleString("pt-BR", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-xs font-normal text-slate-500">km</span>
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Tempo Ocioso
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {formatarMinutos(totalOcioso)}
                  </p>
                </div>
              </div>

              {/* GRÁFICOS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-950/50 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" /> Evolução de Driver Score
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dadosGrafico}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#334155"
                          opacity={0.3}
                        />
                        <XAxis
                          dataKey="dataFormatada"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          domain={[0, 100]}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          dx={-10}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "none",
                            borderRadius: "12px",
                            color: "#f8fafc",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                          }}
                          itemStyle={{ color: "#3b82f6", fontWeight: "bold" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score_conducao"
                          name="Score Médio"
                          stroke="#3b82f6"
                          strokeWidth={4}
                          dot={{ r: 4, strokeWidth: 2, fill: "#0f172a" }}
                          activeDot={{ r: 6, fill: "#3b82f6" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950/50 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" /> Picos de Velocidade Diária (km/h)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dadosGrafico}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#334155"
                          opacity={0.3}
                        />
                        <XAxis
                          dataKey="dataFormatada"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          dx={-10}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "#334155", opacity: 0.1 }}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "none",
                            borderRadius: "12px",
                            color: "#f8fafc",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                        <Bar
                          dataKey="vel_maxima_atingida"
                          name="Vel. Máxima"
                          fill="#f97316"
                          radius={[4, 4, 0, 0]}
                          barSize={24}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
