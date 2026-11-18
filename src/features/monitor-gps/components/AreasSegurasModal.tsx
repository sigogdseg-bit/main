import { useState, useEffect, useCallback } from "react";
import {
  X,
  Shield,
  Plus,
  Trash2,
  MapPin,
  Home,
  Briefcase,
  Building,
  Car,
  GraduationCap,
  Wrench,
  HelpCircle,
  Clock,
  Check,
  Radio,
  Loader2,
  Pencil,
  LogIn,
  LogOut,
  Bell,
  BellOff,
  Layers,
  CircleDot,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import {
  carregarAreasSeguras,
  salvarAreaSegura,
  excluirAreaSegura,
  calcularCentroidePoligono,
  type AreaSegura,
} from "../services/protecaoVeiculoService";
import { MapaEditorPoligono } from "./MapaEditorPoligono";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { toast } from "sonner";

interface AreasSegurasModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
}

export function AreasSegurasModal({ veiculo, onFechar }: AreasSegurasModalProps) {
  const [areas, setAreas] = useState<AreaSegura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modoCriacao, setModoCriacao] = useState(false);
  const [areaEmEdicao, setAreaEmEdicao] = useState<AreaSegura | null>(null);

  // Form State
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<AreaSegura["tipo"]>("casa");
  const [modoFormato, setModoFormato] = useState<"circular" | "poligono">("circular");
  const [poligonoPontos, setPoligonoPontos] = useState<[number, number][]>([]);
  const [latitude, setLatitude] = useState(veiculo.latitude);
  const [longitude, setLongitude] = useState(veiculo.longitude);
  const [raioMetros, setRaioMetros] = useState(150);
  const [toleranciaMetros, setToleranciaMetros] = useState(50);
  const [regraEntrada, setRegraEntrada] = useState<AreaSegura["regra_entrada"]>("permitida");
  const [regraSaida, setRegraSaida] = useState<AreaSegura["regra_saida"]>("fora_horario");
  const [horaInicio, setHoraInicio] = useState("06:00");
  const [horaFim, setHoraFim] = useState("23:00");
  const [diasSemana, setDiasSemana] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await carregarAreasSeguras(veiculo.id);
      setAreas(res);
    } catch {
      setAreas([]);
    } finally {
      setCarregando(false);
    }
  }, [veiculo.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleIniciarCriacao = () => {
    setAreaEmEdicao(null);
    setNome("");
    setTipo("casa");
    setModoFormato("circular");
    setPoligonoPontos([]);
    setLatitude(veiculo.latitude);
    setLongitude(veiculo.longitude);
    setRaioMetros(150);
    setToleranciaMetros(50);
    setRegraEntrada("permitida");
    setRegraSaida("alertar");
    setHoraInicio("06:00");
    setHoraFim("23:00");
    setDiasSemana([0, 1, 2, 3, 4, 5, 6]);
    setModoCriacao(true);
  };

  const handleIniciarEdicao = (area: AreaSegura) => {
    setAreaEmEdicao(area);
    setNome(area.nome);
    setTipo(area.tipo);
    setLatitude(area.latitude);
    setLongitude(area.longitude);
    setRaioMetros(area.raio_metros);
    setToleranciaMetros(area.tolerancia_metros || 50);
    setRegraEntrada(area.regra_entrada || "permitida");
    setRegraSaida(area.regra_saida || "permitida");
    setHoraInicio(area.hora_inicio ? area.hora_inicio.slice(0, 5) : "06:00");
    setHoraFim(area.hora_fim ? area.hora_fim.slice(0, 5) : "23:00");
    setDiasSemana(
      area.dias_semana && area.dias_semana.length > 0 ? area.dias_semana : [0, 1, 2, 3, 4, 5, 6],
    );

    const pontosGeo = area.poligono_geojson?.coordinates;
    if (Array.isArray(pontosGeo) && pontosGeo.length >= 3) {
      setPoligonoPontos(pontosGeo);
      setModoFormato("poligono");
    } else {
      setPoligonoPontos([]);
      setModoFormato("circular");
    }

    setModoCriacao(true);
  };

  const getIconeTipo = (t: AreaSegura["tipo"]) => {
    switch (t) {
      case "casa":
        return <Home className="h-4 w-4 text-orange-500" />;
      case "trabalho":
        return <Briefcase className="h-4 w-4 text-sky-500" />;
      case "condominio":
        return <Building className="h-4 w-4 text-indigo-500" />;
      case "estacionamento":
        return <Car className="h-4 w-4 text-amber-500" />;
      case "escola":
        return <GraduationCap className="h-4 w-4 text-purple-500" />;
      case "oficina":
        return <Wrench className="h-4 w-4 text-orange-500" />;
      default:
        return <MapPin className="h-4 w-4 text-slate-400" />;
    }
  };

  const alternarDiaSemana = (dia: number) => {
    if (diasSemana.includes(dia)) {
      if (diasSemana.length === 1) {
        toast.warning("Selecione ao menos um dia da semana.");
        return;
      }
      setDiasSemana(diasSemana.filter((d) => d !== dia));
    } else {
      setDiasSemana([...diasSemana, dia].sort());
    }
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome da área segura (ex.: Casa, Trabalho).");
      return;
    }

    if (modoFormato === "poligono" && poligonoPontos.length < 3) {
      toast.error("Para salvar uma área em formato polígono, marque pelo menos 3 pontos no mapa.");
      return;
    }

    setSalvando(true);
    try {
      let latFinal = latitude;
      let lonFinal = longitude;
      let raioFinal = raioMetros;
      let poligonoGeojson: any = null;

      if (modoFormato === "poligono" && poligonoPontos.length >= 3) {
        const centroide = calcularCentroidePoligono(poligonoPontos);
        latFinal = centroide.latitude;
        lonFinal = centroide.longitude;
        raioFinal = centroide.raioAproximadoMetros;
        poligonoGeojson = {
          type: "Polygon",
          coordinates: poligonoPontos,
        };
      }

      const res = await salvarAreaSegura({
        id: areaEmEdicao ? areaEmEdicao.id : undefined,
        veiculo_id: veiculo.id,
        cliente_id: veiculo.cliente_id,
        nome: nome.trim(),
        tipo,
        latitude: latFinal,
        longitude: lonFinal,
        raio_metros: raioFinal,
        poligono_geojson: poligonoGeojson,
        tolerancia_metros: toleranciaMetros,
        regra_entrada: regraEntrada,
        regra_saida: regraSaida,
        hora_inicio: horaInicio ? `${horaInicio}:00` : null,
        hora_fim: horaFim ? `${horaFim}:00` : null,
        dias_semana: diasSemana,
        ativo: true,
      });

      if (res) {
        toast.success(
          areaEmEdicao
            ? `Área segura "${nome}" atualizada com sucesso!`
            : `Área segura "${nome}" cadastrada com sucesso!`,
        );
        setModoCriacao(false);
        setAreaEmEdicao(null);
        setNome("");
        carregar();
      } else {
        toast.error("Falha ao salvar área segura.");
      }
    } catch {
      toast.error("Erro ao salvar área segura.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: string, nomeArea: string) => {
    if (window.confirm(`Deseja realmente remover a área segura "${nomeArea}"?`)) {
      const ok = await excluirAreaSegura(id);
      if (ok) {
        toast.success("Área segura removida.");
        carregar();
      } else {
        toast.error("Não foi possível excluir a área segura.");
      }
    }
  };

  const DIAS_ROTULOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 pb-safe">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Áreas Seguras (Geofence)
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cercas virtuais com regras de entrada, saída e tolerância
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {!modoCriacao ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Áreas cadastradas ({areas.length})
                  </span>
                  <button
                    onClick={handleIniciarCriacao}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20 transition flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nova Área</span>
                  </button>
                </div>

                {carregando ? (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Carregando áreas seguras...
                  </div>
                ) : areas.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                    <div>Nenhuma área segura cadastrada para este veículo.</div>
                    <div className="text-[11px] text-slate-500">
                      Cadastre locais como Casa ou Trabalho para receber alertas de saída fora do
                      horário.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {areas.map((a) => (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
                            {getIconeTipo(a.tipo)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                {a.nome}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                {a.raio_metros}m
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {/* Badge Entrada */}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  a.regra_entrada === "alertar"
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                    : a.regra_entrada === "fora_horario"
                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                      : "bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                                }`}
                              >
                                <LogIn className="h-3 w-3" />
                                <span>Entrada:</span>
                                <span>
                                  {a.regra_entrada === "alertar"
                                    ? "Alertar sempre"
                                    : a.regra_entrada === "fora_horario"
                                      ? `Fora de ${a.hora_inicio?.slice(0, 5) || "06:00"}-${a.hora_fim?.slice(0, 5) || "23:00"}`
                                      : "Livre"}
                                </span>
                              </span>

                              {/* Badge Saída */}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  a.regra_saida === "alertar"
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                    : a.regra_saida === "fora_horario"
                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                      : "bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                                }`}
                              >
                                <LogOut className="h-3 w-3" />
                                <span>Saída:</span>
                                <span>
                                  {a.regra_saida === "alertar"
                                    ? "Alertar sempre"
                                    : a.regra_saida === "fora_horario"
                                      ? `Fora de ${a.hora_inicio?.slice(0, 5) || "06:00"}-${a.hora_fim?.slice(0, 5) || "23:00"}`
                                      : "Livre"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleIniciarEdicao(a)}
                            className="p-2 rounded-xl text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 transition"
                            title="Alterar / Editar área segura"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleExcluir(a.id, a.nome)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                            title="Remover área"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Formulário de Criação / Edição de Área Segura */
              <div className="space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    {areaEmEdicao ? `Editar Área: ${areaEmEdicao.nome}` : "Nova Área Segura"}
                  </span>
                  <button
                    onClick={() => {
                      setModoCriacao(false);
                      setAreaEmEdicao(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Nome */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Nome do Local
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Minha Casa, Trabalho, Condomínio"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Tipo de Local
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="casa">Casa / Residência</option>
                    <option value="trabalho">Trabalho / Empresa</option>
                    <option value="condominio">Condomínio</option>
                    <option value="estacionamento">Estacionamento</option>
                    <option value="escola">Escola / Faculdade</option>
                    <option value="oficina">Oficina / Concessionária</option>
                    <option value="outro">Outro Local</option>
                  </select>
                </div>

                {/* Seletor de Formato da Área: Raio Circular vs Polígono no Mapa */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Formato da Geometria
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModoFormato("circular")}
                      className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                        modoFormato === "circular"
                          ? "bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <CircleDot className="h-4 w-4" />
                      <span>Raio Circular</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModoFormato("poligono")}
                      className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                        modoFormato === "poligono"
                          ? "bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <Layers className="h-4 w-4" />
                      <span>Polígono no Mapa</span>
                    </button>
                  </div>
                </div>

                {modoFormato === "poligono" ? (
                  /* Modo Polígono Interativo */
                  <div className="space-y-3 pt-1">
                    <MapaEditorPoligono
                      pontosIniciais={poligonoPontos}
                      latitudeCentro={latitude}
                      longitudeCentro={longitude}
                      alturaPx={260}
                      onPoligonoChange={(novosPontos, centroide) => {
                        setPoligonoPontos(novosPontos);
                        if (novosPontos.length >= 3) {
                          setLatitude(centroide.latitude);
                          setLongitude(centroide.longitude);
                          setRaioMetros(centroide.raioAproximadoMetros);
                        }
                      }}
                    />

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Tolerância Anti-Falso (m)
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="200"
                        step="10"
                        value={toleranciaMetros}
                        onChange={(e) => setToleranciaMetros(parseInt(e.target.value) || 50)}
                        className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  /* Modo Raio Circular */
                  <>
                    {/* Coordenadas e botão Posição Atual */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Posição Central
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setLatitude(veiculo.latitude);
                            setLongitude(veiculo.longitude);
                            toast.info("Posição preenchida com a localização atual do veículo.");
                          }}
                          className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
                        >
                          <MapPin className="h-3 w-3" />
                          Usar Local do Veículo
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            Latitude
                          </span>
                          <input
                            type="number"
                            step="0.00001"
                            value={latitude}
                            onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            Longitude
                          </span>
                          <input
                            type="number"
                            step="0.00001"
                            value={longitude}
                            onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Raio e Tolerância */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                          Raio da Área (m)
                        </label>
                        <input
                          type="number"
                          min="30"
                          max="5000"
                          step="10"
                          value={raioMetros}
                          onChange={(e) => setRaioMetros(parseInt(e.target.value) || 100)}
                          className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                          Tolerância Anti-Falso (m)
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="200"
                          step="10"
                          value={toleranciaMetros}
                          onChange={(e) => setToleranciaMetros(parseInt(e.target.value) || 50)}
                          className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Regras de Entrada e Saída */}
                <div className="space-y-3 pt-1">
                  <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-orange-500" />
                    <span>Regras de Alerta da Área Segura</span>
                  </div>

                  {/* Regra de Entrada */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                      <LogIn className="h-3.5 w-3.5 text-sky-500" />
                      <span>Regra de Entrada / Chegada</span>
                    </label>
                    <select
                      value={regraEntrada}
                      onChange={(e) => setRegraEntrada(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="alertar">
                        🔔 Alertar sempre ao entrar / chegar nesta área
                      </option>
                      <option value="fora_horario">
                        ⏰ Alertar apenas se entrar fora do horário habitual
                      </option>
                      <option value="permitida">🟢 Livre (sem alerta na entrada / chegada)</option>
                    </select>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {regraEntrada === "alertar" &&
                        "Um alerta em tempo real será emitido a cada chegada confirmada."}
                      {regraEntrada === "fora_horario" &&
                        "Alerta gerado se o veículo chegar fora da janela de horário habitual."}
                      {regraEntrada === "permitida" &&
                        "O veículo pode entrar livremente sem gerar notificação de chegada."}
                    </div>
                  </div>

                  {/* Regra de Saída */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                      <LogOut className="h-3.5 w-3.5 text-rose-500" />
                      <span>Regra de Saída / Partida</span>
                    </label>
                    <select
                      value={regraSaida}
                      onChange={(e) => setRegraSaida(e.target.value as any)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                    >
                      <option value="alertar">🚨 Alertar sempre que sair desta área</option>
                      <option value="fora_horario">
                        ⏰ Alertar apenas se sair fora do horário habitual
                      </option>
                      <option value="permitida">🟢 Livre (sem alerta na saída / partida)</option>
                    </select>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {regraSaida === "alertar" &&
                        "Um alerta de saída será emitido sempre que o veículo deixar o local."}
                      {regraSaida === "fora_horario" &&
                        "Alerta de alta prioridade se o veículo sair fora da janela de horário habitual."}
                      {regraSaida === "permitida" &&
                        "O veículo pode sair livremente sem gerar notificação de saída."}
                    </div>
                  </div>
                </div>

                {/* Janela de Horário Permitido (se Entrada OU Saída for fora_horario) */}
                {(regraEntrada === "fora_horario" || regraSaida === "fora_horario") && (
                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span>Horário Habitual Permitido</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          A partir de
                        </span>
                        <input
                          type="time"
                          value={horaInicio}
                          onChange={(e) => setHoraInicio(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Até</span>
                        <input
                          type="time"
                          value={horaFim}
                          onChange={(e) => setHoraFim(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Alerta será emitido se o veículo{" "}
                      {regraEntrada === "fora_horario" && regraSaida === "fora_horario"
                        ? "entrar ou sair"
                        : regraEntrada === "fora_horario"
                          ? "entrar"
                          : "sair"}{" "}
                      fora do intervalo de {horaInicio} às {horaFim} nos dias selecionados abaixo.
                    </div>
                  </div>
                )}

                {/* Dias da Semana */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    Dias de Aplicação
                  </label>
                  <div className="flex items-center justify-between gap-1">
                    {DIAS_ROTULOS.map((rotulo, idx) => {
                      const ativo = diasSemana.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => alternarDiaSemana(idx)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                            ativo
                              ? "bg-orange-500 text-slate-950 font-black shadow-xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {rotulo}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Botão de Salvar */}
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  {salvando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>
                    {salvando
                      ? areaEmEdicao
                        ? "Salvando Alterações..."
                        : "Cadastrando Área..."
                      : areaEmEdicao
                        ? "Salvar Alterações"
                        : "Salvar Área Segura"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
