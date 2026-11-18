import { useState, useEffect, useRef } from "react";
import { X, Building2, Check, Loader2, MapPin, Search } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { MapaEditorPoligono } from "@/features/monitor-gps/components/MapaEditorPoligono";
import { salvarPostoVigilancia } from "../services/vigilanteService";
import type { PostoVigilancia } from "../types";
import { toast } from "sonner";

interface ModalNovoPostoProps {
  postoEmEdicao?: PostoVigilancia | null;
  onFechar: () => void;
  onSalvo: () => void;
}

/**
 * Busca geodésica do endereço no Brasil com suporte a abreviações e backend seguro
 */
async function geocodificarEndereco(
  texto: string,
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const q = texto.trim();
  if (!q || q.length < 3) return null;

  try {
    // 1. Prioridade máxima: Endpoint seguro de backend (imune a CORS, CSP e bloqueios de User-Agent)
    const resApi = await fetch(`/api/geocodificar?q=${encodeURIComponent(q)}`);
    if (resApi.ok) {
      const data = await resApi.json();
      if (
        data?.success &&
        typeof data.latitude === "number" &&
        typeof data.longitude === "number"
      ) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          label: data.label || q,
        };
      }
    }
  } catch (err) {
    console.warn("Falha ao geocodificar via backend:", err);
  }

  const qClean = q
    .replace(/\bav\.?\b/gi, "Avenida")
    .replace(/\br\.?\b/gi, "Rua")
    .replace(/\bsra\.?\b/gi, "Senhora")
    .replace(/\bsto\.?\b/gi, "Santo")
    .replace(/\bsta\.?\b/gi, "Santa")
    .replace(/\bpç\.?\b/gi, "Praça")
    .replace(/\brod\.?\b/gi, "Rodovia")
    .replace(/\balm\.?\b/gi, "Almirante");

  try {
    // 2. Fallback direto Photon (Komoot/OSM)
    const resPhoton = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(qClean)}&limit=1`,
    );
    if (resPhoton.ok) {
      const dPhoton = await resPhoton.json();
      if (dPhoton?.features?.[0]?.geometry?.coordinates) {
        const [lon, lat] = dPhoton.features[0].geometry.coordinates;
        const nomeProp = dPhoton.features[0].properties.name || qClean;
        const cidade = dPhoton.features[0].properties.city || "";
        return {
          latitude: lat,
          longitude: lon,
          label: cidade ? `${nomeProp}, ${cidade}` : nomeProp,
        };
      }
    }
  } catch (err) {
    console.warn("Falha na geocodificação direta:", err);
  }
  return null;
}

export function ModalNovoPosto({ postoEmEdicao, onFechar, onSalvo }: ModalNovoPostoProps) {
  const [nome, setNome] = useState(postoEmEdicao?.nome || "");
  const [endereco, setEndereco] = useState(postoEmEdicao?.endereco || "");
  const [latitude, setLatitude] = useState(postoEmEdicao?.latitude || -22.48);
  const [longitude, setLongitude] = useState(postoEmEdicao?.longitude || -44.05);
  const [raioMetros, setRaioMetros] = useState(postoEmEdicao?.raio_metros || 150);
  const [poligonoPontos, setPoligonoPontos] = useState<[number, number][]>(
    postoEmEdicao?.perimetro_poligono?.coordinates || [],
  );
  const [salvando, setSalvando] = useState(false);
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const timerDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Desloca o mapa para o endereço informado
  const executarBuscaEndereco = async (texto: string, silencioso = false) => {
    if (!texto || texto.trim().length < 4) return;
    setBuscandoEndereco(true);
    try {
      const loc = await geocodificarEndereco(texto);
      if (loc) {
        setLatitude(loc.latitude);
        setLongitude(loc.longitude);
        toast.info(`Mapa deslocado para: ${loc.label}`);
      } else if (!silencioso) {
        toast.warning(
          "Endereço não localizado pelo mapa. Tente incluir bairro ou cidade (ex: Voldac, Volta Redonda).",
        );
      }
    } finally {
      setBuscandoEndereco(false);
    }
  };

  // Monitora digitação do endereço com debounce
  const handleEnderecoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setEndereco(valor);

    if (timerDebounceRef.current) {
      clearTimeout(timerDebounceRef.current);
    }

    if (valor.trim().length >= 5) {
      timerDebounceRef.current = setTimeout(() => {
        executarBuscaEndereco(valor, true);
      }, 900);
    }
  };

  useEffect(() => {
    return () => {
      if (timerDebounceRef.current) {
        clearTimeout(timerDebounceRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome do posto ou propriedade.");
      return;
    }

    if (poligonoPontos.length > 0 && poligonoPontos.length < 3) {
      toast.error("O perímetro em polígono requer no mínimo 3 pontos no mapa.");
      return;
    }

    setSalvando(true);
    try {
      const perimetroGeojson =
        poligonoPontos.length >= 3
          ? {
              type: "Polygon" as const,
              coordinates: poligonoPontos,
            }
          : null;

      const res = await salvarPostoVigilancia({
        id: postoEmEdicao ? postoEmEdicao.id : undefined,
        nome: nome.trim(),
        endereco: endereco.trim() || null,
        latitude,
        longitude,
        raio_metros: raioMetros,
        perimetro_poligono: perimetroGeojson,
        ativo: true,
      });

      if (res) {
        toast.success(
          postoEmEdicao
            ? `Posto "${nome}" atualizado com sucesso!`
            : `Posto "${nome}" cadastrado com sucesso!`,
        );
        onSalvo();
        onFechar();
      } else {
        toast.error("Falha ao salvar posto de vigilância.");
      }
    } catch {
      toast.error("Erro ao salvar posto de vigilância.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  {postoEmEdicao ? "Editar Posto de Vigilância" : "Novo Posto de Vigilância"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Definição da propriedade e demarcação da área geral
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Nome da Propriedade / Posto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 28º Batalhão, Condomínio Alphaville, Fábrica Sul"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Endereço / Referência (Desloca o Mapa Automaticamente)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Ex: av nossa sra do amparo, voldac, volta redonda"
                    value={endereco}
                    onChange={handleEnderecoChange}
                    className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 pr-8 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  />
                  {buscandoEndereco && (
                    <Loader2 className="h-4 w-4 text-emerald-500 animate-spin absolute right-2.5 top-2.5" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => executarBuscaEndereco(endereco, false)}
                  disabled={buscandoEndereco || !endereco.trim()}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
                  title="Deslocar o mapa para este endereço agora"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Deslocar Mapa</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                Ao digitar ou clicar em Deslocar Mapa, o mapa se move instantaneamente para a rua
                informada.
              </span>
            </div>

            {/* Demarcação da Área Geral por Polígono Interativo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                Área Geral da Propriedade (Polígono no Mapa)
              </label>
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
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>
                  {salvando
                    ? "Salvando..."
                    : postoEmEdicao
                      ? "Salvar Alterações"
                      : "Cadastrar Posto de Vigilância"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
