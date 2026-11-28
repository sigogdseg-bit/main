import { useState, useEffect, useRef } from "react";
import {
  Bell,
  MessageSquare,
  PhoneCall,
  Check,
  X,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  Lock,
  Info,
  ShieldCheck,
  Send,
  Loader2,
  Car,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { useCardTheme } from "@/shared/lib/card-theme";
import {
  enviarMensagemWhatsappOperador,
  normalizarTelefoneParaWhatsapp,
} from "@/shared/lib/chatbotxBridge";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { formatarTelefoneVisual } from "@/features/chat/services/whatsappContatosService";
import {
  ALERTAS_CONTA_OPERACIONAL_CATALOGO,
  ALERTAS_VEICULO_CATALOGO,
  normalizarTelefoneDigitosBR,
  filtrarContatosPermitidosPorTipo,
  filtrarAlertasCatalogoVisiveis,
  type AlertaCatalogoItem,
  type CanalAlertaItemPreferencia,
} from "@/features/monitor-gps/constants/alertasCatalogo";
import {
  PREFERENCIAS_PADRAO,
  type ContatoAlertaWhatsapp,
  type PreferenciasNotificacao,
} from "@/features/monitor-gps/services/notificacoesService";
import {
  aplicarConfigAlertasTodaFrota,
  carregarConfigAlertasCliente,
  salvarConfigAlertasCliente,
  carregarConfigAlertasEquipe,
  salvarConfigAlertasEquipe,
  obterAlertasOperacionaisPadrao,
  obterAlertasEquipePadrao,
} from "@/features/monitor-gps/services/protecaoVeiculoService";
import { ModalCienciaDesativarNfModal } from "./ModalCienciaDesativarNfModal";

interface ModalCentralAlertasContaProps {
  aberto: boolean;
  onClose: () => void;
  clienteId?: string | null;
  userId?: string | null;
  isEquipeTecnica?: boolean;
  nomeAlvo?: string | null;
  onSalvo?: (alertasOperacionais: Record<string, CanalAlertaItemPreferencia>) => void;
}

const ALERTA_SMS_EQUIPE: AlertaCatalogoItem | undefined = ALERTAS_VEICULO_CATALOGO.find(
  (item) => item.chave === "corte_nao_autorizado_sms",
);

const ALERTAS_FROTA_EQUIPE: AlertaCatalogoItem[] = ALERTAS_VEICULO_CATALOGO.filter(
  (item) => !item.restritoEquipeTecnica,
);

export function ModalCentralAlertasConta({
  aberto,
  onClose,
  clienteId,
  userId,
  isEquipeTecnica = false,
  nomeAlvo,
  onSalvo,
}: ModalCentralAlertasContaProps) {
  const modoEquipe = Boolean(isEquipeTecnica && !clienteId);
  const cardTheme = useCardTheme(userId);
  const isNeumorph = (cardTheme.variant ?? "neumorphic") === "neumorphic";

  const [abaAtiva, setAbaAtiva] = useState<"operacao" | "frota" | "contatos">("operacao");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [alertasOperacionais, setAlertasOperacionais] = useState<
    Record<string, CanalAlertaItemPreferencia>
  >(() => obterAlertasOperacionaisPadrao());
  const [alertasEquipe, setAlertasEquipe] = useState<Record<string, CanalAlertaItemPreferencia>>(
    () => obterAlertasEquipePadrao(),
  );
  const [contatosAlertas, setContatosAlertas] = useState<ContatoAlertaWhatsapp[]>([]);
  const [veiculosFrota, setVeiculosFrota] = useState<
    Array<{ id: string; placa: string; marca_modelo?: string | null; cliente_id?: string | null }>
  >([]);
  const [veiculosSelecionadosIds, setVeiculosSelecionadosIds] = useState<string[]>([]);

  const [alertaDestinatariosAberto, setAlertaDestinatariosAberto] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [testandoContatoId, setTestandoContatoId] = useState<string | null>(null);

  const [modalCienciaNfAberto, setModalCienciaNfAberto] = useState(false);
  const [comCienciaExpurgoNf, setComCienciaExpurgoNf] = useState(false);
  const [acaoPendenteNf, setAcaoPendenteNf] = useState<{
    chave: string;
  } | null>(null);

  const canaisAnterioresRef = useRef<
    Record<string, { app: boolean; whatsapp: boolean; ligacao: boolean }>
  >({});

  useEffect(() => {
    if (!aberto) return;
    setAbaAtiva("operacao");
    setAlertaDestinatariosAberto(null);
    let ativo = true;

    async function carregar() {
      setCarregando(true);
      try {
        if (modoEquipe && userId) {
          const cfgEq = await carregarConfigAlertasEquipe(userId);
          if (!ativo) return;
          setAlertasOperacionais(cfgEq.alertasOperacionais);
          setAlertasEquipe(cfgEq.alertasEquipe);
          setContatosAlertas(cfgEq.contatosAlertas);
        } else {
          const cfgCli = await carregarConfigAlertasCliente(clienteId || null, userId || null);
          if (!ativo) return;
          setAlertasOperacionais(cfgCli.alertasOperacionais);
          setContatosAlertas(cfgCli.contatosAlertas);
        }

        let queryVeic = supabase
          .from("veiculos")
          .select("id, placa, marca_modelo, cliente_id")
          .order("placa", { ascending: true });
        if (!modoEquipe && clienteId) {
          queryVeic = queryVeic.eq("cliente_id", clienteId);
        }
        const { data: listaVeic } = await queryVeic;
        if (ativo && Array.isArray(listaVeic)) {
          setVeiculosFrota(listaVeic);
          setVeiculosSelecionadosIds(listaVeic.map((v) => v.id));
        }
      } catch (err) {
        console.warn("[ModalCentralAlertasConta] Erro ao carregar configurações:", err);
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [aberto, modoEquipe, clienteId, userId]);

  useEffect(() => {
    if (!aberto) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !modalCienciaNfAberto) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [aberto, modalCienciaNfAberto, onClose]);

  if (!aberto || typeof document === "undefined") {
    return null;
  }

  const itensOperacionaisVisiveis: AlertaCatalogoItem[] = modoEquipe
    ? [
        ...filtrarAlertasCatalogoVisiveis(ALERTAS_CONTA_OPERACIONAL_CATALOGO, true),
        ...(ALERTA_SMS_EQUIPE ? [ALERTA_SMS_EQUIPE] : []),
      ]
    : filtrarAlertasCatalogoVisiveis(ALERTAS_CONTA_OPERACIONAL_CATALOGO, false);

  const aplicarMudancaMapa = (
    escopo: "operacao" | "frota",
    chave: string,
    updater: (atual: CanalAlertaItemPreferencia) => CanalAlertaItemPreferencia,
    padraoFallback: CanalAlertaItemPreferencia,
  ) => {
    if (escopo === "operacao") {
      setAlertasOperacionais((prev) => {
        const atual = prev[chave] || padraoFallback;
        const proximo = updater(atual);
        const novoMapa = { ...prev, [chave]: proximo };
        const nfPronta = novoMapa.nf_pronta_download;
        const nfExpurgo = novoMapa.alerta_nf_expurgo;
        if (
          nfPronta?.ativo &&
          (nfPronta.app || nfPronta.whatsapp || nfPronta.ligacao) &&
          nfExpurgo?.ativo &&
          (nfExpurgo.app || nfExpurgo.whatsapp || nfExpurgo.ligacao)
        ) {
          setComCienciaExpurgoNf(false);
        }
        return novoMapa;
      });
    } else {
      setAlertasEquipe((prev) => {
        const atual = prev[chave] || padraoFallback;
        return {
          ...prev,
          [chave]: updater(atual),
        };
      });
    }
  };

  const alternarAtivoItem = (escopo: "operacao" | "frota", item: AlertaCatalogoItem) => {
    const mapa = escopo === "operacao" ? alertasOperacionais : alertasEquipe;
    const atual = mapa[item.chave] || item.padraoCanais;
    const estavaAtivo =
      atual.ativo !== false && Boolean(atual.app || atual.whatsapp || atual.ligacao);

    if (
      estavaAtivo &&
      escopo === "operacao" &&
      !modoEquipe &&
      item.notaExclusao &&
      !comCienciaExpurgoNf
    ) {
      setAcaoPendenteNf({ chave: item.chave });
      setModalCienciaNfAberto(true);
      return;
    }

    const chaveCache = `${escopo}:${item.chave}`;
    if (estavaAtivo) {
      canaisAnterioresRef.current[chaveCache] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
      aplicarMudancaMapa(
        escopo,
        item.chave,
        (a) => ({
          ...a,
          ativo: false,
          app: false,
          whatsapp: false,
          ligacao: false,
        }),
        item.padraoCanais,
      );
    } else {
      const restaurado = canaisAnterioresRef.current[chaveCache];
      const base = restaurado || {
        app: Boolean(item.padraoCanais.app),
        whatsapp: Boolean(item.padraoCanais.whatsapp),
        ligacao: Boolean(item.padraoCanais.ligacao),
      };
      aplicarMudancaMapa(
        escopo,
        item.chave,
        (a) => ({
          ...a,
          ativo: true,
          app: base.app || (!base.whatsapp && !base.ligacao),
          whatsapp: base.whatsapp,
          ligacao: base.ligacao,
        }),
        item.padraoCanais,
      );
    }
  };

  const alternarCanalItem = (
    escopo: "operacao" | "frota",
    item: AlertaCatalogoItem,
    canal: "app" | "whatsapp" | "ligacao",
  ) => {
    const mapa = escopo === "operacao" ? alertasOperacionais : alertasEquipe;
    const atual = mapa[item.chave] || item.padraoCanais;
    const novoValor = !atual[canal];
    const proxApp = canal === "app" ? novoValor : Boolean(atual.app);
    const proxWhats = canal === "whatsapp" ? novoValor : Boolean(atual.whatsapp);
    const proxLig = canal === "ligacao" ? novoValor : Boolean(atual.ligacao);
    const ficaraAtivo = Boolean(proxApp || proxWhats || proxLig);

    if (
      !ficaraAtivo &&
      escopo === "operacao" &&
      !modoEquipe &&
      item.notaExclusao &&
      !comCienciaExpurgoNf
    ) {
      setAcaoPendenteNf({ chave: item.chave });
      setModalCienciaNfAberto(true);
      return;
    }

    const chaveCache = `${escopo}:${item.chave}`;
    if (!ficaraAtivo && (atual.app || atual.whatsapp || atual.ligacao)) {
      canaisAnterioresRef.current[chaveCache] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
    }

    aplicarMudancaMapa(
      escopo,
      item.chave,
      (a) => ({
        ...a,
        ativo: ficaraAtivo,
        app: proxApp,
        whatsapp: proxWhats,
        ligacao: proxLig,
      }),
      item.padraoCanais,
    );
  };

  const atualizarDestinatariosItem = (
    escopo: "operacao" | "frota",
    item: AlertaCatalogoItem,
    campo: "destinatarios_whatsapp" | "destinatarios_ligacao",
    novaLista: string[] | undefined,
  ) => {
    aplicarMudancaMapa(
      escopo,
      item.chave,
      (atual) => {
        const proximo = { ...atual };
        if (novaLista === undefined) {
          delete proximo[campo];
          delete proximo.destinatarios;
        } else {
          proximo[campo] = novaLista;
        }
        return proximo;
      },
      item.padraoCanais,
    );
  };

  const confirmarCienciaDesativacaoNf = () => {
    setComCienciaExpurgoNf(true);
    const pendente = acaoPendenteNf;
    if (pendente) {
      const atual = alertasOperacionais[pendente.chave] || {
        ativo: true,
        app: true,
        whatsapp: true,
        ligacao: false,
      };
      canaisAnterioresRef.current[`operacao:${pendente.chave}`] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
      aplicarMudancaMapa(
        "operacao",
        pendente.chave,
        (a) => ({
          ...a,
          ativo: false,
          app: false,
          whatsapp: false,
          ligacao: false,
        }),
        atual,
      );
    }
    setAcaoPendenteNf(null);
    setModalCienciaNfAberto(false);
    toast.info("Desativação confirmada mediante ciência. Clique em Salvar para gravar.");
  };

  const alternarContatoAtivo = (id: string) => {
    setContatosAlertas((lista) => lista.map((c) => (c.id === id ? { ...c, ativo: !c.ativo } : c)));
  };

  const removerContatoAdicional = (id: string) => {
    const alvo = contatosAlertas.find((c) => c.id === id);
    const digitosAlvo = normalizarTelefoneDigitosBR(alvo?.telefone);

    setContatosAlertas((lista) => lista.filter((c) => c.id !== id));

    if (digitosAlvo) {
      const limparMapa = (prev: Record<string, CanalAlertaItemPreferencia>) => {
        const atualizado = { ...prev };
        for (const k of Object.keys(atualizado)) {
          const regra = atualizado[k];
          if (!regra) continue;
          atualizado[k] = {
            ...regra,
            ...(Array.isArray(regra.destinatarios_whatsapp)
              ? {
                  destinatarios_whatsapp: regra.destinatarios_whatsapp.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosAlvo,
                  ),
                }
              : {}),
            ...(Array.isArray(regra.destinatarios_ligacao)
              ? {
                  destinatarios_ligacao: regra.destinatarios_ligacao.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosAlvo,
                  ),
                }
              : {}),
          };
        }
        return atualizado;
      };
      setAlertasOperacionais(limparMapa);
      setAlertasEquipe(limparMapa);
    }

    toast.success("Número adicional removido da Central de Alertas.");
  };

  const handleAdicionarContato = () => {
    if (!novoNome.trim()) {
      toast.error("Informe um nome ou identificação para o contato.");
      return;
    }
    const foneNorm = normalizarTelefoneParaWhatsapp(novoTelefone);
    if (!foneNorm || foneNorm.length < 10) {
      toast.error("Informe um número de celular válido com DDD.");
      return;
    }
    const digitos = normalizarTelefoneDigitosBR(foneNorm);
    if (contatosAlertas.some((c) => normalizarTelefoneDigitosBR(c.telefone) === digitos)) {
      toast.error("Este número já está cadastrado na Central de Alertas.");
      return;
    }

    const novo: ContatoAlertaWhatsapp = {
      id: `adic-conta-${Date.now()}`,
      nome: novoNome.trim(),
      telefone: foneNorm,
      tipo: "adicional",
      ativo: true,
      padrao: false,
    };
    setContatosAlertas((lista) => [...lista, novo]);
    setNovoNome("");
    setNovoTelefone("");
    toast.success("Número adicionado com sucesso! Clique em Salvar para confirmar.");
  };

  const handleTestarWhatsappContato = async (contato: ContatoAlertaWhatsapp) => {
    const digitos = normalizarTelefoneDigitosBR(contato.telefone);
    if (digitos.length < 10) {
      toast.error("Número inválido para teste WhatsApp.");
      return;
    }
    setTestandoContatoId(`w:${contato.id}`);
    try {
      const res = await enviarMensagemWhatsappOperador({
        telefone: digitos,
        categoriaMensagem: "alerta",
        tipoContato: modoEquipe ? "usuario" : "cliente",
        mensagem:
          `📡 *GD RASTREAMENTO — TESTE DA CENTRAL DE ALERTAS*\n\n` +
          `✅ Canal WhatsApp verificado para *${contato.nome}*.\n` +
          `⏰ *Horário:* ${formatarHoraBrasil(new Date(), true)}`,
      });
      if (res.sucesso) {
        toast.success(`Mensagem de teste WhatsApp enviada para ${contato.nome}!`);
      } else {
        toast.error(`Falha no envio WhatsApp: ${res.erro || "Verifique o gateway"}`);
      }
    } catch (err: any) {
      toast.error(`Erro no teste WhatsApp: ${err?.message || String(err)}`);
    } finally {
      setTestandoContatoId(null);
    }
  };

  const handleTestarLigacaoContato = async (contato: ContatoAlertaWhatsapp) => {
    const digitos = normalizarTelefoneDigitosBR(contato.telefone);
    if (digitos.length < 10) {
      toast.error("Número inválido para teste de ligação.");
      return;
    }
    setTestandoContatoId(`l:${contato.id}`);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const res = await fetch("/api/alerta/ligacao", {
        method: "POST",
        headers,
        body: JSON.stringify({
          telefone: digitos,
          motivo: "Teste de chamada da Central de Alertas",
          forcar: true,
        }),
      });
      const dados = (await res.json().catch(() => ({}))) as {
        sucesso?: boolean;
        detalhe?: string;
        erro?: string;
      };
      if (res.ok && dados.sucesso) {
        toast.success(`Chamada de teste disparada para ${contato.nome}!`);
      } else {
        toast.error(
          `Falha ao disparar ligação: ${dados.erro || dados.detalhe || `HTTP ${res.status}`}`,
        );
      }
    } catch (err: any) {
      toast.error(`Erro ao testar ligação: ${err?.message || "Verifique sua conexão"}`);
    } finally {
      setTestandoContatoId(null);
    }
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      let ok = false;
      if (modoEquipe && userId) {
        ok = await salvarConfigAlertasEquipe({
          userId,
          alertasOperacionais,
          alertasEquipe,
          contatosAlertas,
        });
      } else {
        ok = await salvarConfigAlertasCliente({
          clienteId: clienteId || null,
          userId: userId || null,
          alertasOperacionais,
          contatosAlertas,
          comCienciaExpurgoNf,
        });
      }

      let totalVeiculosAtualizados = 0;
      if (userId && veiculosSelecionadosIds.length > 0) {
        const veiculosAlvo = veiculosFrota.filter((v) => veiculosSelecionadosIds.includes(v.id));
        if (veiculosAlvo.length > 0) {
          const preferenciasFrota: PreferenciasNotificacao = { ...PREFERENCIAS_PADRAO };
          for (const item of ALERTAS_FROTA_EQUIPE) {
            const regra = alertasEquipe[item.chave];
            const ativoItem = regra
              ? regra.ativo !== false && Boolean(regra.app || regra.whatsapp || regra.ligacao)
              : item.padraoAtivo;
            (preferenciasFrota as any)[item.chave] = ativoItem;
          }
          preferenciasFrota.canais_alertas = {
            app: true,
            whatsapp: true,
            ligacao: true,
            por_alerta: alertasEquipe as any,
          };
          const resFrota = await aplicarConfigAlertasTodaFrota({
            veiculos: veiculosAlvo,
            userId,
            preferencias: preferenciasFrota,
            destinatariosWhatsapp: contatosAlertas,
          });
          totalVeiculosAtualizados = resFrota.atualizados;
        }
      }

      if (ok) {
        toast.success(
          totalVeiculosAtualizados > 0
            ? `Preferências salvas e aplicadas em ${totalVeiculosAtualizados} veículo(s) da frota!`
            : "Preferências da Central de Alertas salvas com sucesso!",
        );
        onSalvo?.(alertasOperacionais);
        onClose();
      } else {
        toast.error("Não foi possível salvar as preferências no servidor.");
      }
    } catch (err: any) {
      toast.error(`Erro ao salvar preferências: ${err?.message || "falha inesperada"}`);
    } finally {
      setSalvando(false);
    }
  };

  const renderListaItens = (escopo: "operacao" | "frota", itens: AlertaCatalogoItem[]) => {
    const mapa = escopo === "operacao" ? alertasOperacionais : alertasEquipe;
    const prefixoExpandido = `${escopo}:`;

    return (
      <div className="space-y-2.5">
        {itens.map((item) => {
          const padraoItem =
            escopo === "frota"
              ? {
                  ativo: item.padraoAtivo,
                  app: item.padraoAtivo,
                  whatsapp: item.chave === "panico" || item.chave === "bateria_desconectada",
                  ligacao: false,
                }
              : item.padraoCanais;
          const regra = mapa[item.chave] || padraoItem;
          const ativoItem =
            regra.ativo !== false && Boolean(regra.app || regra.whatsapp || regra.ligacao);
          const tituloVisivel = modoEquipe ? item.tituloEquipe || item.titulo : item.titulo;
          const descVisivel = modoEquipe ? item.descEquipe || item.desc : item.desc;
          const origemVisivel = modoEquipe
            ? item.origemTecnica || item.origemMonitoramento
            : item.origemMonitoramento;
          const chaveExpansao = `${prefixoExpandido}${item.chave}`;
          const expandido = alertaDestinatariosAberto === chaveExpansao;

          const contatosPermitidos = filtrarContatosPermitidosPorTipo(contatosAlertas, item.chave);
          const ativosPermitidos = contatosPermitidos
            .filter((c) => c.ativo !== false)
            .map((c) => normalizarTelefoneDigitosBR(c.telefone))
            .filter((d) => d.length >= 10);

          const customW = Array.isArray(regra.destinatarios_whatsapp);
          const customL = Array.isArray(regra.destinatarios_ligacao);
          const qtdW = customW
            ? regra.destinatarios_whatsapp?.length || 0
            : ativosPermitidos.length;
          const qtdL = customL ? regra.destinatarios_ligacao?.length || 0 : ativosPermitidos.length;
          const avisoVazio = (regra.whatsapp && qtdW === 0) || (regra.ligacao && qtdL === 0);

          const renderSeletorCanal = (
            tituloCanal: string,
            campo: "destinatarios_whatsapp" | "destinatarios_ligacao",
            listaCustom?: string[],
          ) => {
            const modoEspecifico = Array.isArray(listaCustom);
            const selecionados = new Set(
              (listaCustom || []).map((f) => normalizarTelefoneDigitosBR(f)).filter(Boolean),
            );

            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    {tituloCanal}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => atualizarDestinatariosItem(escopo, item, campo, undefined)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        !modoEspecifico
                          ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950"
                          : "bg-white/80 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-700"
                      }`}
                    >
                      Todos os ativos ({ativosPermitidos.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!modoEspecifico) {
                          atualizarDestinatariosItem(escopo, item, campo, [...ativosPermitidos]);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        modoEspecifico
                          ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950"
                          : "bg-white/80 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-700"
                      }`}
                    >
                      Escolher específicos
                    </button>
                  </div>
                </div>

                {modoEspecifico && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {contatosPermitidos.length === 0 ? (
                      <div className="col-span-full text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-2">
                        Nenhum telefone autorizado disponível para este alerta.
                      </div>
                    ) : (
                      contatosPermitidos.map((c) => {
                        const dig = normalizarTelefoneDigitosBR(c.telefone);
                        const marcado = selecionados.has(dig);
                        return (
                          <label
                            key={`${chaveExpansao}-${campo}-${c.id}`}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                              marcado
                                ? "bg-orange-500/10 border-orange-500/40 text-slate-900 dark:text-slate-100"
                                : "bg-white/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">{c.nome}</div>
                              <div className="text-[10px] font-mono opacity-80">
                                +{formatarTelefoneVisual(c.telefone)}
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => {
                                const prox = new Set(selecionados);
                                if (marcado) {
                                  prox.delete(dig);
                                } else if (dig) {
                                  prox.add(dig);
                                }
                                atualizarDestinatariosItem(escopo, item, campo, Array.from(prox));
                              }}
                              className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 shrink-0"
                            />
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div
              key={`${escopo}-${item.chave}`}
              className={`p-3 rounded-2xl border transition space-y-2.5 ${
                ativoItem
                  ? "bg-[#eaf0f8] dark:bg-slate-950/60 border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                  : "bg-slate-100/50 dark:bg-slate-950/30 border-slate-200/50 dark:border-slate-800/40 opacity-80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                    <span>{tituloVisivel}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        ativoItem
                          ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-500 font-normal"
                      }`}
                    >
                      {ativoItem ? "Ativo" : "Desativado"}
                    </span>
                    {item.financeiro && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-bold flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" />
                        <span>Blindagem ADM</span>
                      </span>
                    )}
                    {item.restritoEquipeTecnica && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 font-bold flex items-center gap-0.5">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        <span>Exclusivo Equipe</span>
                      </span>
                    )}
                    {item.notaExclusao && !modoEquipe && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25 font-bold flex items-center gap-0.5">
                        <Info className="h-2.5 w-2.5" />
                        <span>Expurgo 48h</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    {descVisivel}
                  </div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Origem: {origemVisivel}
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={ativoItem}
                  aria-label={`Ativar ou desativar alerta ${tituloVisivel}`}
                  onClick={() => alternarAtivoItem(escopo, item)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                    ativoItem ? "bg-orange-500" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
                      ativoItem ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={Boolean(regra.app)}
                    aria-label={`Canal App para ${tituloVisivel}`}
                    onClick={() => alternarCanalItem(escopo, item, "app")}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                      regra.app
                        ? "bg-orange-500 text-slate-950 border-orange-400 font-black shadow-xs"
                        : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <Bell className="h-3 w-3 shrink-0" />
                    <span>App</span>
                    {regra.app && <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    aria-pressed={Boolean(regra.whatsapp)}
                    aria-label={`Canal WhatsApp para ${tituloVisivel}`}
                    onClick={() => alternarCanalItem(escopo, item, "whatsapp")}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      regra.whatsapp
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                        : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    <span>WhatsApp</span>
                    {regra.whatsapp && <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    aria-pressed={Boolean(regra.ligacao)}
                    aria-label={`Canal Ligação para ${tituloVisivel}`}
                    onClick={() => alternarCanalItem(escopo, item, "ligacao")}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                      regra.ligacao
                        ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                        : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <PhoneCall className="h-3 w-3 shrink-0" />
                    <span>Ligação</span>
                    {regra.ligacao && <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />}
                  </button>
                </div>

                {(regra.whatsapp || regra.ligacao) && (
                  <button
                    type="button"
                    onClick={() => setAlertaDestinatariosAberto(expandido ? null : chaveExpansao)}
                    aria-expanded={expandido}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      avisoVazio
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40"
                        : expandido
                          ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950 border-transparent"
                          : "bg-white/70 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 border-slate-300/70 dark:border-slate-700 hover:border-orange-500/50"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {customW || customL
                        ? `Números (${regra.whatsapp ? `W:${qtdW}` : ""}${regra.whatsapp && regra.ligacao ? " " : ""}${regra.ligacao ? `L:${qtdL}` : ""})`
                        : `Números: Todos (${ativosPermitidos.length})`}
                    </span>
                    {expandido ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                )}
              </div>

              {expandido && (regra.whatsapp || regra.ligacao) && (
                <div className="mt-2 pt-2.5 border-t border-slate-300/60 dark:border-slate-800 space-y-2.5 bg-slate-200/35 dark:bg-slate-900/50 rounded-xl p-2.5">
                  {item.financeiro && (
                    <div className="flex items-start gap-2 text-[10px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Blindagem Administrativa:</strong> alertas financeiros são restritos
                        ao titular e contatos autorizados, nunca enviados a motoristas.
                      </span>
                    </div>
                  )}

                  {regra.whatsapp &&
                    renderSeletorCanal(
                      "Destinatários via WhatsApp",
                      "destinatarios_whatsapp",
                      regra.destinatarios_whatsapp,
                    )}

                  {regra.ligacao &&
                    renderSeletorCanal(
                      "Destinatários via Ligação Telefônica",
                      "destinatarios_ligacao",
                      regra.destinatarios_ligacao,
                    )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-central-alertas-conta"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
      >
        <div
          className={`w-full max-w-2xl max-h-[90vh] my-auto flex flex-col overflow-hidden rounded-3xl border animate-in fade-in zoom-in-95 duration-150 ${
            isNeumorph
              ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl"
          }`}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    id="titulo-central-alertas-conta"
                    className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100"
                  >
                    Central de Alertas e Canais
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      modoEquipe
                        ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25"
                        : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/25"
                    }`}
                  >
                    {modoEquipe ? "Equipe Técnica" : nomeAlvo || "Minha Conta"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {modoEquipe
                    ? "Gerencie recebimentos da central, bot WhatsApp, defesa ativa, frota e testes"
                    : "Configure notificações de NF, cobranças, manutenções, suporte, WhatsApp e ligações"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar Central de Alertas e Canais"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Abas */}
          <div className="p-2 sm:p-2.5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8] dark:bg-slate-950/60 shrink-0">
            <div
              role="tablist"
              aria-label="Seções da Central de Alertas"
              className={`grid gap-2 p-1 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-2xl ${
                modoEquipe ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "operacao"}
                onClick={() => setAbaAtiva("operacao")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                  abaAtiva === "operacao"
                    ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span>{modoEquipe ? "Operação e Gestão" : "Alertas da Conta"}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "frota"}
                onClick={() => setAbaAtiva("frota")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                  abaAtiva === "frota"
                    ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Car className="h-4 w-4 shrink-0" />
                <span>{modoEquipe ? "Frota (Equipe)" : "Alertas da Frota"}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "contatos"}
                onClick={() => setAbaAtiva("contatos")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                  abaAtiva === "contatos"
                    ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Contatos e Testes ({contatosAlertas.filter((c) => c.ativo).length})</span>
              </button>
            </div>
          </div>

          {/* Corpo com rolagem */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {carregando ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando preferências da Central de Alertas...</span>
              </div>
            ) : (
              <>
                {abaAtiva === "operacao" && renderListaItens("operacao", itensOperacionaisVisiveis)}

                {abaAtiva === "frota" && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-800 dark:text-indigo-200">
                      Configure os alertas de telemetria de modo geral para a frota e escolha abaixo
                      em quais veículos deseja aplicar (todos vêm marcados por padrão).
                    </div>

                    {renderListaItens("frota", ALERTAS_FROTA_EQUIPE)}

                    <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          Veículos da Frota ({veiculosSelecionadosIds.length} de{" "}
                          {veiculosFrota.length} marcados)
                        </span>
                        {veiculosFrota.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setVeiculosSelecionadosIds(
                                veiculosSelecionadosIds.length === veiculosFrota.length
                                  ? []
                                  : veiculosFrota.map((v) => v.id),
                              )
                            }
                            className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                          >
                            {veiculosSelecionadosIds.length === veiculosFrota.length
                              ? "Desmarcar todos"
                              : "Marcar todos"}
                          </button>
                        )}
                      </div>

                      {veiculosFrota.length === 0 ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Nenhum veículo encontrado para aplicar em lote.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                          {veiculosFrota.map((v) => {
                            const marcado = veiculosSelecionadosIds.includes(v.id);
                            return (
                              <label
                                key={v.id}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
                                  marcado
                                    ? "bg-orange-500/10 border-orange-500/30 text-slate-900 dark:text-white"
                                    : "bg-white/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={marcado}
                                  onChange={() =>
                                    setVeiculosSelecionadosIds((prev) =>
                                      prev.includes(v.id)
                                        ? prev.filter((id) => id !== v.id)
                                        : [...prev, v.id],
                                    )
                                  }
                                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                />
                                <span className="font-mono font-bold">
                                  {v.placa || "SEM PLACA"}
                                </span>
                                {v.marca_modelo && (
                                  <span className="truncate opacity-80">{v.marca_modelo}</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {abaAtiva === "contatos" && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-800 dark:text-orange-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <span>Números Autorizados e Testes em Tempo Real</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        Ative ou desative destinatários padrão e teste imediatamente os canais de
                        WhatsApp e Ligação MacroDroid no número escolhido.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {contatosAlertas.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                          Nenhum número cadastrado. Adicione um telefone abaixo.
                        </div>
                      ) : (
                        contatosAlertas.map((contato) => {
                          const testandoW = testandoContatoId === `w:${contato.id}`;
                          const testandoL = testandoContatoId === `l:${contato.id}`;
                          return (
                            <div
                              key={contato.id}
                              className="p-3 rounded-2xl bg-white/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {contato.nome}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {contato.tipo === "cliente"
                                      ? "Titular / Principal"
                                      : contato.tipo === "motorista"
                                        ? "Motorista"
                                        : "Adicional"}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                  +{formatarTelefoneVisual(contato.telefone)}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleTestarWhatsappContato(contato)}
                                  disabled={testandoW}
                                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {testandoW ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  <span>Testar WhatsApp</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTestarLigacaoContato(contato)}
                                  disabled={testandoL}
                                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {testandoL ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <PhoneCall className="h-3 w-3" />
                                  )}
                                  <span>Testar Ligação</span>
                                </button>

                                <label className="flex items-center gap-1.5 cursor-pointer text-xs ml-1">
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    {contato.ativo ? "Ativo" : "Inativo"}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={contato.ativo}
                                    onChange={() => alternarContatoAtivo(contato.id)}
                                    className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                                  />
                                </label>

                                {contato.tipo === "adicional" && (
                                  <button
                                    type="button"
                                    onClick={() => removerContatoAdicional(contato.id)}
                                    aria-label={`Remover ${contato.nome}`}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Novo contato adicional */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 space-y-2.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">
                        Adicionar Novo Número para Alertas
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="central-novo-contato-nome" className="sr-only">
                            Nome do contato
                          </label>
                          <input
                            id="central-novo-contato-nome"
                            type="text"
                            placeholder="Nome / Rótulo (ex: Plantão, Financeiro)"
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="w-full min-h-[40px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="central-novo-contato-fone" className="sr-only">
                            Telefone celular com DDD
                          </label>
                          <input
                            id="central-novo-contato-fone"
                            type="tel"
                            placeholder="Telefone celular com DDD"
                            value={novoTelefone}
                            onChange={(e) => setNovoTelefone(e.target.value)}
                            className="w-full min-h-[40px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAdicionarContato}
                        className="w-full min-h-[40px] py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Adicionar Número aos Alertas</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodapé */}
          <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 bg-[#eaf0f8]/95 dark:bg-slate-950/90 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer min-h-[44px] flex items-center justify-center"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || carregando}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px]"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Check className="h-4 w-4 shrink-0" />
              )}
              <span>{salvando ? "Salvando..." : "Salvar Central de Alertas"}</span>
            </button>
          </div>
        </div>
      </div>

      <ModalCienciaDesativarNfModal
        aberto={modalCienciaNfAberto}
        carregando={false}
        onFechar={() => {
          setModalCienciaNfAberto(false);
          setAcaoPendenteNf(null);
        }}
        onConfirmar={confirmarCienciaDesativacaoNf}
      />
    </ModalPortal>
  );
}
