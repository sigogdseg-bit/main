import { useState, useEffect, useMemo } from "react";
import {
  Car,
  EyeOff,
  Gauge,
  Key,
  Filter,
  Check,
  Settings2,
  FileText,
  Users,
  ShieldCheck,
  UserCheck,
  RotateCcw,
  Search,
  QrCode,
  Copy,
  MessageSquareShare,
  Bell,
  MessageSquare,
  Send,
  Sliders,
  Building2,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { ModoPerfilEmulado } from "@/features/auth/types";
import {
  MODOS_PERFIS_DISPONIVEIS,
  MODOS_PERFIS_EMULAVEIS,
  obterRotuloModoPerfil,
} from "@/features/auth/constants/modosPerfis";
import { useGpsRealtime } from "@/features/monitor-gps/hooks/useGpsRealtime";
import { MudarMinhaSenhaModal } from "@/features/auth/components/MudarMinhaSenhaModal";
import { AjusteOdometroModal } from "@/features/monitor-gps/components/AjusteOdometroModal";
import { ModalConfirmarDesligarPrivacidade } from "@/features/monitor-gps/components/ModalConfirmarDesligarPrivacidade";
import { RelatorioGerencialModal } from "@/features/relatorios/components/RelatorioGerencialModal";
import { relatorioGerencialConfigService } from "@/features/relatorios/services/relatorioGerencialConfigService";
import { atualizarPrivacidadeVeiculo } from "@/features/monitor-gps/services/gpsService";
import { ouvirAtualizacoesAlertasCliente } from "@/features/monitor-gps/services/protecaoVeiculoService";
import { toast } from "sonner";
import { Vehicle3DGraphic } from "@/features/monitor-gps/components/Vehicle3DGraphic";
import type { ModoPlacaMapa } from "@/features/monitor-gps/utils/vehicle3dIcons";
import { useCardTheme } from "@/shared/lib/card-theme";
import { supabase } from "@/integrations/supabase/client";
import { ModalCienciaDesativarNfModal } from "./components/ModalCienciaDesativarNfModal";
import { ModalCentralAlertasConta } from "./components/ModalCentralAlertasConta";
import { ModalEnvioRapidoWhatsapp } from "@/features/chat/components/ModalEnvioRapidoWhatsapp";
import {
  obterConfigPixSistema,
  obterConfigPixSistemaSync,
  salvarConfigPixSistema,
  ConfigPixSistema,
} from "@/shared/lib/pixSistemaService";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import {
  salvarPreferenciaUsuario,
  carregarPreferenciasDoBanco,
} from "@/shared/lib/userPreferencesService";
import { carregarClientes } from "@/features/clientes/services/clienteService";
import { carregarPostosVigilancia } from "@/features/vigilantes/services/vigilanteService";
import type { PostoVigilancia } from "@/features/vigilantes/types";

export interface ClienteOpcao {
  id: string;
  nome_razao_social: string;
  user_id?: string;
  documento?: string;
  plano?: any;
  status?: string;
  telefone?: string;
}

export function ConfiguracoesView() {
  const {
    session,
    sessaoOriginal,
    clienteEmulado,
    perfilEmulado,
    emularCliente,
    emularModoPerfil,
    desfazerEmulacao,
  } = useAuth();
  const modoAtivo: ModoPerfilEmulado =
    perfilEmulado || (clienteEmulado ? "cliente" : "superadmin");
  const { veiculos, recarregar } = useGpsRealtime();

  const cardTheme = useCardTheme(session?.userId);
  const isNeumorph = (cardTheme.variant ?? "neumorphic") === "neumorphic";

  // Modais State
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [modalAjusteOdometroAberto, setModalAjusteOdometroAberto] = useState(false);
  const [modalConfirmarPrivacidadeAberto, setModalConfirmarPrivacidadeAberto] = useState(false);
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);
  const [modalEnvioWhatsappAberto, setModalEnvioWhatsappAberto] = useState(false);
  const [modalCentralAlertasAberto, setModalCentralAlertasAberto] = useState(false);
  const [disparandoRelatorio, setDisparandoRelatorio] = useState(false);

  const handleDispararRelatorioImediato = async () => {
    setDisparandoRelatorio(true);
    const toastId = toast.loading(
      "Gerando e enviando Relatório de Métricas ao WhatsApp do SuperADM...",
    );
    try {
      const res = await relatorioGerencialConfigService.dispararAgora();
      if (res.sucesso) {
        toast.success("Relatório de Métricas despachado para o WhatsApp com sucesso!", {
          id: toastId,
        });
      } else {
        toast.error(`Falha ao despachar relatório: ${res.mensagem}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Erro inesperado: ${err?.message || "Serviço indisponível"}`, { id: toastId });
    } finally {
      setDisparandoRelatorio(false);
    }
  };

  // Configuração da Chave Pix Oficial do Sistema (SuperADM)
  const [configPix, setConfigPix] = useState<ConfigPixSistema>(obterConfigPixSistemaSync);
  const [salvandoPix, setSalvandoPix] = useState(false);
  const [qrCodePixPreview, setQrCodePixPreview] = useState<string>("");
  const [chavePixCopiada, setChavePixCopiada] = useState(false);

  useEffect(() => {
    obterConfigPixSistema().then((cfg) => {
      setConfigPix(cfg);
    });
  }, []);

  useEffect(() => {
    if (configPix.chavePix) {
      try {
        const payload = gerarPayloadPix({
          chavePix: configPix.chavePix,
          nomeRecebedor: configPix.titular || "GD Rastreamento",
          cidadeRecebedor: configPix.cidade || "BRASIL",
          valor: 1.0,
          identificador: "TESTEPIX",
        });
        gerarQrCodePixDataUrl(payload)
          .then((url) => setQrCodePixPreview(url))
          .catch(() => setQrCodePixPreview(""));
      } catch {
        setQrCodePixPreview("");
      }
    }
  }, [configPix.chavePix, configPix.titular, configPix.cidade]);

  const handleSalvarPix = async () => {
    if (!configPix.chavePix.trim()) {
      toast.error("Por favor, informe uma chave PIX válida!");
      return;
    }
    setSalvandoPix(true);
    try {
      await salvarConfigPixSistema(configPix);
      toast.success("Chave PIX Oficial do Sistema salva com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar Chave PIX: " + (err?.message || "falha desconhecida"));
    } finally {
      setSalvandoPix(false);
    }
  };

  const handleCopiarChavePix = () => {
    if (!configPix.chavePix) return;
    navigator.clipboard.writeText(configPix.chavePix);
    setChavePixCopiada(true);
    toast.success("Chave PIX copiada para a área de transferência!");
    setTimeout(() => setChavePixCopiada(false), 2000);
  };

  // Preferências de Notificação de Notas Fiscais (NFs)
  const [notificarNf, setNotificarNf] = useState<boolean>(true);
  const [canaisNf, setCanaisNf] = useState<{ push: boolean; whatsapp: boolean }>({
    push: true,
    whatsapp: true,
  });
  const [modalCienciaNfAberto, setModalCienciaNfAberto] = useState(false);
  const [salvandoPreferenciaNf, setSalvandoPreferenciaNf] = useState(false);
  const [clienteIdAtivo, setClienteIdAtivo] = useState<string | null>(null);

  useEffect(() => {
    async function carregarPreferenciaCliente() {
      try {
        let cId = clienteEmulado?.id || session?.clienteId;
        if (!cId && session?.userId) {
          const { data: cli } = await supabase
            .from("clientes")
            .select("id, notificar_nf_pendente, canais_notificacao_nf")
            .eq("user_id", session.userId)
            .maybeSingle();
          if (cli) {
            cId = cli.id;
            const canais = (cli.canais_notificacao_nf as {
              push?: boolean;
              whatsapp?: boolean;
            } | null) || {
              push: true,
              whatsapp: true,
            };
            const geralAtivo = cli.notificar_nf_pendente !== false;
            const pAtivo = geralAtivo && canais.push !== false;
            const wAtivo = geralAtivo && canais.whatsapp !== false;
            setCanaisNf({ push: pAtivo, whatsapp: wAtivo });
            setNotificarNf(pAtivo || wAtivo);
          }
        } else if (cId) {
          const { data: cli } = await supabase
            .from("clientes")
            .select("notificar_nf_pendente, canais_notificacao_nf")
            .eq("id", cId)
            .maybeSingle();
          if (cli) {
            const canais = (cli.canais_notificacao_nf as {
              push?: boolean;
              whatsapp?: boolean;
            } | null) || {
              push: true,
              whatsapp: true,
            };
            const geralAtivo = cli.notificar_nf_pendente !== false;
            const pAtivo = geralAtivo && canais.push !== false;
            const wAtivo = geralAtivo && canais.whatsapp !== false;
            setCanaisNf({ push: pAtivo, whatsapp: wAtivo });
            setNotificarNf(pAtivo || wAtivo);
          }
        }
        setClienteIdAtivo(cId || null);
      } catch (err) {
        console.warn("Erro ao carregar preferências de NF:", err);
      }
    }

    carregarPreferenciaCliente();
  }, [session?.clienteId, session?.userId, clienteEmulado?.id]);

  useEffect(() => {
    if (!clienteIdAtivo) return;
    const unsub = ouvirAtualizacoesAlertasCliente((dados) => {
      if (dados.clienteId && dados.clienteId !== clienteIdAtivo) return;
      if (dados.canaisNotificacaoNf || typeof dados.notificarNfPendente === "boolean") {
        const geral = dados.notificarNfPendente !== false;
        const pAtivo = geral && dados.canaisNotificacaoNf?.push !== false;
        const wAtivo = geral && dados.canaisNotificacaoNf?.whatsapp !== false;
        setCanaisNf({ push: pAtivo, whatsapp: wAtivo });
        setNotificarNf(pAtivo || wAtivo);
      } else if (dados.alertasOperacionais) {
        const nfP = dados.alertasOperacionais.nf_pronta_download;
        const nfE = dados.alertasOperacionais.alerta_nf_expurgo;
        if (nfP || nfE) {
          const pAtivo = Boolean((nfP?.ativo && nfP?.app) || (nfE?.ativo && nfE?.app));
          const wAtivo = Boolean((nfP?.ativo && nfP?.whatsapp) || (nfE?.ativo && nfE?.whatsapp));
          const ativoGeral = Boolean(
            (nfP?.ativo && (nfP.app || nfP.whatsapp || nfP.ligacao)) ||
            (nfE?.ativo && (nfE.app || nfE.whatsapp || nfE.ligacao)),
          );
          setCanaisNf({ push: pAtivo, whatsapp: wAtivo });
          setNotificarNf(ativoGeral);
        }
      }
    });
    return () => unsub();
  }, [clienteIdAtivo]);

  const handleAlternarNotificacaoNfGeral = () => {
    if (notificarNf) {
      setModalCienciaNfAberto(true);
    } else {
      salvarPreferenciaCanaisNf({ push: true, whatsapp: true }, false);
    }
  };

  const handleAlternarCanalNf = (canal: "push" | "whatsapp") => {
    const novosCanais = { ...canaisNf, [canal]: !canaisNf[canal] };
    if (!novosCanais.push && !novosCanais.whatsapp) {
      setModalCienciaNfAberto(true);
      return;
    }
    salvarPreferenciaCanaisNf(novosCanais, false);
  };

  const salvarPreferenciaCanaisNf = async (
    novosCanais: { push: boolean; whatsapp: boolean },
    comCiencia = false,
  ) => {
    if (!clienteIdAtivo) return;
    setSalvandoPreferenciaNf(true);
    try {
      const ativo = Boolean(novosCanais.push || novosCanais.whatsapp);
      let ligacaoExistente = false;
      let opsAtuais: Record<string, any> = {};
      try {
        const resAtual = await supabase
          .from("clientes")
          .select("canais_notificacao_nf, alertas_operacionais")
          .eq("id", clienteIdAtivo)
          .maybeSingle();
        if (!resAtual.error && resAtual.data) {
          ligacaoExistente = Boolean((resAtual.data.canais_notificacao_nf as any)?.ligacao);
          opsAtuais = ((resAtual.data as any).alertas_operacionais as Record<string, any>) || {};
        }
      } catch {
        // Fallback silencioso
      }

      const canaisCompletos = {
        push: novosCanais.push,
        whatsapp: novosCanais.whatsapp,
        ligacao: ligacaoExistente,
      };
      const novasOps = {
        ...opsAtuais,
        nf_pronta_download: {
          ...(opsAtuais.nf_pronta_download || {}),
          ativo,
          app: novosCanais.push,
          whatsapp: novosCanais.whatsapp,
          ligacao: Boolean(opsAtuais.nf_pronta_download?.ligacao ?? ligacaoExistente),
        },
        alerta_nf_expurgo: {
          ...(opsAtuais.alerta_nf_expurgo || {}),
          ativo,
          app: novosCanais.push,
          whatsapp: novosCanais.whatsapp,
          ligacao: Boolean(opsAtuais.alerta_nf_expurgo?.ligacao ?? ligacaoExistente),
        },
      };

      let salvouBanco = false;
      let tentarFallbackDireto = false;

      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        "salvar_preferencias_alertas_cliente" as any,
        {
          p_cliente_id: clienteIdAtivo,
          p_alertas_operacionais: novasOps,
          p_contatos_alertas: null,
          p_notificar_nf_pendente: ativo,
          p_canais_notificacao_nf: canaisCompletos,
          p_ciencia_expurgo_sem_notificacao_nf: comCiencia ? true : null,
        },
      );

      if (!rpcErr && (rpcRes as any)?.sucesso !== false) {
        salvouBanco = true;
      } else if (!rpcErr && (rpcRes as any)?.sucesso === false) {
        throw new Error(
          String((rpcRes as any)?.erro || "Não foi possível gravar as preferências de NF."),
        );
      } else if (rpcErr) {
        const msgErr = `${rpcErr.code || ""} ${rpcErr.message || ""}`.toLowerCase();
        const rpcAusente =
          msgErr.includes("pgrst202") ||
          msgErr.includes("42883") ||
          msgErr.includes("could not find the function") ||
          msgErr.includes("function");
        if (!rpcAusente) {
          throw rpcErr;
        }
        tentarFallbackDireto = true;
      }

      if (!salvouBanco && tentarFallbackDireto) {
        const updatePayload: Record<string, any> = {
          notificar_nf_pendente: ativo,
          canais_notificacao_nf: canaisCompletos,
          alertas_operacionais: novasOps,
        };
        if (comCiencia) {
          updatePayload.ciencia_expurgo_sem_notificacao_nf = true;
          updatePayload.ciencia_expurgo_em = new Date().toISOString();
        }

        const { error } = await supabase
          .from("clientes")
          .update(updatePayload)
          .eq("id", clienteIdAtivo);

        if (error) {
          const fallbackPayload: Record<string, any> = {
            notificar_nf_pendente: ativo,
            canais_notificacao_nf: novosCanais,
          };
          if (comCiencia) {
            fallbackPayload.ciencia_expurgo_sem_notificacao_nf = true;
            fallbackPayload.ciencia_expurgo_em = new Date().toISOString();
          }
          const { error: errFallback } = await supabase
            .from("clientes")
            .update(fallbackPayload)
            .eq("id", clienteIdAtivo);
          if (errFallback) throw errFallback;
        }
      }

      setCanaisNf(novosCanais);
      setNotificarNf(ativo);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("hunter_configuracao_alertas_cliente_alterada", {
            detail: {
              clienteId: clienteIdAtivo,
              alertasOperacionais: novasOps,
              notificarNfPendente: ativo,
              canaisNotificacaoNf: canaisCompletos,
            },
          }),
        );
      }
      if (ativo) {
        toast.success("Preferências de notificação de Notas Fiscais salvas com sucesso");
      } else {
        toast.success("Notificações desativadas. Ciência de expurgo registrada.");
        setModalCienciaNfAberto(false);
      }
    } catch (err: any) {
      toast.error("Falha ao salvar preferência de notificações: " + err.message);
    } finally {
      setSalvandoPreferenciaNf(false);
    }
  };

  // Seleção de Veículo para Configurações Específicas
  const [veiculoSelecionadoId, setVeiculoSelecionadoId] = useState<string>("");

  useEffect(() => {
    if (veiculos.length > 0 && !veiculoSelecionadoId) {
      setVeiculoSelecionadoId(veiculos[0].id);
    }
  }, [veiculos, veiculoSelecionadoId]);

  const veiculoSelecionado = useMemo(() => {
    return veiculos.find((v) => v.id === veiculoSelecionadoId) || null;
  }, [veiculos, veiculoSelecionadoId]);

  // Estados Globais no LocalStorage e Sincronizados com BD
  const [iconeGenerico, setIconeGenerico] = useState<boolean>(() => {
    return localStorage.getItem("@hunter_icone_mapa_generico") === "true";
  });

  const [filtroStatus, setFiltroStatus] = useState<string>(() => {
    return localStorage.getItem("@hunter_filtro_status_operacional") || "todos";
  });

  const [filtroVeiculosIds, setFiltroVeiculosIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("@hunter_filtro_veiculos_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modo de Operação: SuperADM / Admin vs Modo Cliente (Emulação Real)
  const isSuperAdmReal = Boolean(
    sessaoOriginal?.isSuperAdmin ||
    sessaoOriginal?.isAdmin ||
    sessaoOriginal?.role === "adm" ||
    session?.isSuperAdmin ||
    session?.isAdmin ||
    session?.role === "adm" ||
    clienteEmulado,
  );

  const [listaClientes, setListaClientes] = useState<ClienteOpcao[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [modoOperacao, setModoOperacao] = useState<"superadm" | "cliente">(() => {
    return clienteEmulado ? "cliente" : "superadm";
  });

  // Propriedades Monitoradas (Postos Fixos)
  const [postosFixos, setPostosFixos] = useState<PostoVigilancia[]>([]);
  const [carregandoPostos, setCarregandoPostos] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregandoPostos(true);
    carregarPostosVigilancia(session?.clienteId || undefined)
      .then((lista) => {
        if (ativo && Array.isArray(lista)) {
          setPostosFixos(lista);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregandoPostos(false);
      });
    return () => {
      ativo = false;
    };
  }, [session?.clienteId]);

  useEffect(() => {
    if (isSuperAdmReal) {
      setCarregandoClientes(true);
      // Carrega catálogo via rota segura /api/clientes (evita bloqueio por RLS)
      carregarClientes()
        .then((clientes) => {
          if (Array.isArray(clientes)) {
            const ativos = clientes
              .filter((c) => c.status !== "cancelado")
              .map((c) => ({
                id: c.id,
                nome_razao_social: c.nome_razao_social,
                documento: c.documento,
                plano: c.plano,
                status: c.status,
                telefone: c.telefone,
                user_id: c.user_id,
              }));
            setListaClientes(ativos);
          }
        })
        .catch(() => {
          // Fallback para Supabase direto
          supabase
            .from("clientes")
            .select("id, nome_razao_social, documento, plano, status, telefone, user_id")
            .neq("status", "cancelado")
            .order("nome_razao_social", { ascending: true })
            .then(({ data, error }) => {
              if (!error && data) {
                setListaClientes(data as ClienteOpcao[]);
              }
            });
        })
        .finally(() => {
          setCarregandoClientes(false);
        });
    }
  }, [isSuperAdmReal]);

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return listaClientes;
    const termo = buscaCliente.toLowerCase();
    return listaClientes.filter(
      (c) =>
        c.nome_razao_social?.toLowerCase().includes(termo) ||
        (c.documento && c.documento.includes(termo)),
    );
  }, [listaClientes, buscaCliente]);

  // Veículos disponíveis para visualização operacional
  const veiculosDisponiveis = useMemo(() => {
    if (!session) return [];
    if (session.isCliente && session.clienteId) {
      return veiculos.filter((v) => v.cliente_id === session.clienteId);
    }
    return veiculos;
  }, [veiculos, session]);

  const [modoPlaca, setModoPlaca] = useState<ModoPlacaMapa>(() => {
    return (localStorage.getItem("@hunter_modo_placa_mapa") as ModoPlacaMapa) || "auto";
  });

  // Sincroniza do banco de dados na montagem
  useEffect(() => {
    if (session?.userId) {
      carregarPreferenciasDoBanco(session.userId).then((prefs) => {
        if (prefs) {
          if (prefs.icone_mapa_pin !== undefined) setIconeGenerico(prefs.icone_mapa_pin);
          if (prefs.modo_placa_mapa) setModoPlaca(prefs.modo_placa_mapa);
        }
      });
    }
  }, [session?.userId]);

  // Handlers para persistir no LocalStorage e no Banco de Dados (Disponibilidade Imediata Multi-Dispositivo)
  const handleSetIconeGenerico = (val: boolean) => {
    setIconeGenerico(val);
    salvarPreferenciaUsuario({ icone_mapa_pin: val }, session?.userId);
    toast.success("Ícone do mapa atualizado com sucesso");
  };

  const handleSetModoPlaca = (val: ModoPlacaMapa) => {
    setModoPlaca(val);
    salvarPreferenciaUsuario({ modo_placa_mapa: val }, session?.userId);
    toast.success(
      val === "com_placa"
        ? "Exibição com placa ativada"
        : val === "sem_placa"
          ? "Exibição sem placa ativada (apenas ícone)"
          : "Exibição automática de placa ativada (se houver mais de 1 veículo)",
    );
  };

  const handleSetFiltroStatus = (val: string) => {
    setFiltroStatus(val);
    localStorage.setItem("@hunter_filtro_status_operacional", val);
  };

  const handleToggleVeiculoFiltro = (id: string) => {
    setFiltroVeiculosIds((prev) => {
      const isSelected = prev.includes(id);
      const next = isSelected ? prev.filter((vId) => vId !== id) : [...prev, id];
      localStorage.setItem("@hunter_filtro_veiculos_ids", JSON.stringify(next));
      window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));
      return next;
    });
  };

  const handleToggleTodosVeiculosFiltro = () => {
    const next: string[] = [];
    setFiltroVeiculosIds(next);
    localStorage.setItem("@hunter_filtro_veiculos_ids", JSON.stringify(next));
    window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));
    toast.success("Exibindo todos os veículos cadastrados");
  };

  // Lógica de Privacidade
  const [salvandoPrivacidade, setSalvandoPrivacidade] = useState(false);
  const handleAlternarPrivacidade = async () => {
    if (!veiculoSelecionado) return;
    const isAtiva = veiculoSelecionado.privacidade_localizacao !== false;
    if (isAtiva) {
      setModalConfirmarPrivacidadeAberto(true);
      return;
    }
    await executarAlteracaoPrivacidade(true);
  };

  const executarAlteracaoPrivacidade = async (novoStatus: boolean) => {
    if (!veiculoSelecionado) return;
    setSalvandoPrivacidade(true);
    const toastId = toast.loading(
      novoStatus ? "Ativando privacidade..." : "Desmarcando privacidade...",
    );
    try {
      const res = await atualizarPrivacidadeVeiculo(veiculoSelecionado.id, novoStatus);
      if (res.success) {
        toast.success(novoStatus ? "Privacidade ativada!" : "Privacidade desmarcada!", {
          id: toastId,
        });
        veiculoSelecionado.privacidade_localizacao = novoStatus;
      } else {
        toast.error(`Erro: ${res.error}`, { id: toastId });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(`Erro ao salvar: ${msg}`, { id: toastId });
    } finally {
      setSalvandoPrivacidade(false);
      setModalConfirmarPrivacidadeAberto(false);
    }
  };

  if (!session) return null;

  const isMotorista = Boolean(session?.isMotorista);
  const isInstalador = Boolean(session?.isInstalador);
  const modoEquipeCentral = Boolean(
    (session.isSuperAdmin || session.isAdmin || session.isOperador) &&
    !clienteEmulado &&
    !session.isCliente,
  );
  const podeGerenciarCentralAlertas = Boolean(
    !isInstalador &&
    !isMotorista &&
    !session.isAuditor &&
    !session.isSuperAdminAuditor &&
    session.role !== "superadmin_auditor" &&
    !session.isReadOnly &&
    (modoEquipeCentral || Boolean(clienteIdAtivo)),
  );

  // Estilos de container e cards fiéis ao padrão de Estoque e Suprimentos com suporte total a tema escuro
  const pageContainerClass = isNeumorph
    ? "bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-6 lg:p-8 rounded-3xl min-h-[85vh] transition-all duration-300 space-y-6 max-w-7xl mx-auto border border-slate-300/40 dark:border-slate-800/80"
    : "space-y-6 max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 transition-all duration-300";

  const cardMetricClass = isNeumorph
    ? "p-5 rounded-[22px] bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] border border-slate-300/60 dark:border-slate-800/80 transition-transform"
    : "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-transform";

  const inputInsetClass = isNeumorph
    ? "w-full py-2.5 px-4 rounded-xl bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] border border-slate-300/50 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC] transition"
    : "w-full py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-orange-500/50 transition";

  return (
    <div className="flex-1 flex flex-col">
      <div className={pageContainerClass}>
        {/* Topo: Título e Identidade Canônica Hunter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-700/20">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl shrink-0 ${
                isNeumorph
                  ? "bg-[#eaf0f8] dark:bg-slate-900 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-800 text-orange-600 dark:text-orange-400"
                  : isInstalador
                    ? "bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 border border-indigo-500/30"
                    : "bg-orange-500/20 text-orange-500 dark:text-orange-400 border border-orange-500/30"
              }`}
            >
              {isInstalador ? (
                <Key className="w-6 h-6 text-indigo-500" />
              ) : (
                <Settings2 className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-wide text-slate-900 dark:text-slate-100">
                  {isInstalador ? "Segurança da Conta" : "Configurações do Sistema"}
                </h1>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isNeumorph
                      ? "bg-[#9EBCEE] dark:bg-orange-500/20 text-slate-800 dark:text-orange-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border border-transparent dark:border-orange-500/30"
                      : isInstalador
                        ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
                        : "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                  }`}
                >
                  {isInstalador ? "ACESSO TÉCNICO" : "PREFERÊNCIAS"}
                </span>
              </div>
              <p className="text-xs opacity-75">
                {isInstalador
                  ? "Alteração de senha de acesso da conta de instalador técnico"
                  : isMotorista
                    ? "Sincronização de odômetro do veículo e alteração de senha de acesso"
                    : "Ícones 3D no mapa, filtros de visibilidade, calibração do odômetro e proteções do veículo"}
              </p>
            </div>
          </div>
        </div>

        {/* --- SEÇÃO GLOBAL: VISUAL E PREFERÊNCIAS DO MAPA (Inacessível para Motoristas e Instaladores) --- */}
        {!isMotorista && !isInstalador && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                Preferências do Mapa e Filtros
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. Card: Ícone do Veículo no Mapa */}
              <div className={`${cardMetricClass} flex flex-col gap-4`}>
                <div>
                  <h3 className="font-bold text-sm">Ícone do Veículo no Mapa</h3>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    Escolha como seu veículo será representado no mapa em tempo real.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSetIconeGenerico(false)}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition cursor-pointer ${
                      !iconeGenerico
                        ? isNeumorph
                          ? "bg-[#9EBCEE]/30 dark:bg-orange-500/20 border-orange-500/70 dark:border-orange-400/50 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none text-slate-900 dark:text-slate-100"
                          : "border-orange-500 bg-orange-500/10 shadow-xs"
                        : isNeumorph
                          ? "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:border-orange-400/50 text-slate-700 dark:text-slate-300"
                          : "border-slate-200 dark:border-slate-700 hover:border-orange-400/50"
                    }`}
                  >
                    <Vehicle3DGraphic
                      tipo="carro"
                      size={46}
                      corStatus="#10B981"
                      iconeGenerico={false}
                      className="mb-1"
                    />
                    <span className="text-xs font-black">Pin Veículo (3D)</span>
                    <span className="text-[10px] opacity-65">Tipo no Interior do Pin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetIconeGenerico(true)}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition cursor-pointer ${
                      iconeGenerico
                        ? isNeumorph
                          ? "bg-[#9EBCEE]/30 dark:bg-orange-500/20 border-orange-500/70 dark:border-orange-400/50 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none text-slate-900 dark:text-slate-100"
                          : "border-orange-500 bg-orange-500/10 shadow-xs"
                        : isNeumorph
                          ? "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/50 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:border-orange-400/50 text-slate-700 dark:text-slate-300"
                          : "border-slate-200 dark:border-slate-700 hover:border-orange-400/50"
                    }`}
                  >
                    <Vehicle3DGraphic
                      size={46}
                      corStatus="#EF4444"
                      iconeGenerico={true}
                      className="mb-1"
                    />
                    <span className="text-xs font-black text-center">Pin Clássico (3D)</span>
                    <span className="text-[10px] opacity-65">Genérico sem Veículo</span>
                  </button>
                </div>

                {/* Opções de Exibição da Placa: Com Placa, Automático ou Sem Placa */}
                <div className="pt-3 border-t border-slate-700/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Identificação por Placa no Mapa</span>
                    <span className="text-[10px] font-bold opacity-65">
                      {modoPlaca === "com_placa"
                        ? "Sempre visível"
                        : modoPlaca === "sem_placa"
                          ? "Oculta (apenas ícone)"
                          : "Mais de 1 veículo"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "com_placa", label: "Com Placa" },
                      { id: "auto", label: "Automático" },
                      { id: "sem_placa", label: "Sem Placa" },
                    ].map((opt) => {
                      const isAtivo = modoPlaca === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSetModoPlaca(opt.id as ModoPlacaMapa)}
                          className={`min-h-[32px] px-2 py-1 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                            isAtivo
                              ? isNeumorph
                                ? "bg-[#9EBCEE] dark:bg-orange-600 text-slate-900 dark:text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none font-black border border-slate-300/40 dark:border-orange-500"
                                : "bg-orange-500 text-slate-950 font-black shadow"
                              : isNeumorph
                                ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-700 hover:text-slate-950 dark:hover:text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Legenda com Ícones Reais dos Status em Tempo Real */}
                <div className="pt-3 border-t border-slate-700/15 flex items-center justify-around text-[10px] font-bold">
                  <div className="flex items-center gap-1.5" title="Offline ou sem sinal">
                    <Vehicle3DGraphic
                      size={22}
                      corStatus="#EF4444"
                      iconeGenerico={iconeGenerico}
                      tipo="carro"
                    />
                    <span className="text-rose-600 dark:text-rose-400">Offline</span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Online com ignição desligada">
                    <Vehicle3DGraphic
                      size={22}
                      corStatus="#2563EB"
                      iconeGenerico={iconeGenerico}
                      tipo="carro"
                    />
                    <span className="text-blue-600 dark:text-blue-400">Desligado</span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Online com ignição ligada">
                    <Vehicle3DGraphic
                      size={22}
                      corStatus="#10B981"
                      iconeGenerico={iconeGenerico}
                      tipo="carro"
                    />
                    <span className="text-orange-600 dark:text-orange-400">Ligado</span>
                  </div>
                </div>
              </div>

              {/* 2. Card: Modo de Operação do Sistema (Lista Suspensa de Todos os Perfis) */}
              {isSuperAdmReal && (
                <div
                  className={`${cardMetricClass} flex flex-col gap-4 transition-all duration-300 ${
                    modoAtivo !== "superadmin"
                      ? "border-2 border-amber-500/50 bg-amber-500/5 shadow-md"
                      : ""
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <h3 className="font-extrabold text-sm sm:text-base">
                          Modo de Operação do Sistema
                        </h3>
                        {modoAtivo !== "superadmin" ? (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                            Modo {obterRotuloModoPerfil(modoAtivo)} Ativo
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/25">
                            SuperADM (Global Irrestrito)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-70 mt-0.5">
                        Alterne entre o perfil irrestrito de Super Administrador e a visão idêntica
                        a qualquer um dos 13 perfis operacionais do sistema.
                      </p>
                    </div>

                    {modoAtivo !== "superadmin" && (
                      <button
                        type="button"
                        onClick={() => {
                          desfazerEmulacao();
                          setModoOperacao("superadm");
                          toast.success("Modo SuperADM restaurado com sucesso");
                        }}
                        className="text-xs font-black px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto bg-amber-600 hover:bg-amber-700 text-white shadow-sm active:scale-95"
                        title="Desfazer emulação e retornar à conta Super Administrador"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Voltar para SuperADM</span>
                      </button>
                    )}
                  </div>

                  {/* Seletor em Lista Suspensa: 12 Perfis Emuláveis (sem redundância de SuperADM para SuperADM) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black flex items-center justify-between">
                      <span>Selecionar perfil para emulação tática:</span>
                      <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">
                        {MODOS_PERFIS_EMULAVEIS.length} perfis operacionais
                      </span>
                    </label>
                    <div className="relative">
                      <select
                        value={modoAtivo === "superadmin" ? "" : modoAtivo}
                        onChange={(e) => {
                          const novoModo = e.target.value as ModoPerfilEmulado;
                          if (!novoModo || novoModo === "superadmin") {
                            desfazerEmulacao();
                            setModoOperacao("superadm");
                            toast.success("Modo SuperADM restaurado");
                          } else {
                            if (novoModo === "cliente") {
                              setModoOperacao("cliente");
                            }
                            emularModoPerfil(novoModo);
                            toast.success(`Modo ${obterRotuloModoPerfil(novoModo)} ativado`);
                          }
                        }}
                        className={`${inputInsetClass} font-bold cursor-pointer text-xs sm:text-sm`}
                      >
                        <option value="">
                          {modoAtivo === "superadmin"
                            ? `-- Selecione o perfil para emular visão (${MODOS_PERFIS_EMULAVEIS.length} perfis) --`
                            : "Restaurar Visão Normal (SuperADM)"}
                        </option>
                        {MODOS_PERFIS_EMULAVEIS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.rotulo} — {item.descricao}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Seção de Seleção de Cliente (quando em modo cliente) */}
                  {(modoOperacao === "cliente" ||
                    modoAtivo === "cliente" ||
                    Boolean(clienteEmulado)) && (
                    <div className="flex flex-col gap-3 pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-bold">Escolha o cliente para emular:</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {listaClientes.length} cadastrados
                          </span>
                        </div>

                        {/* Campo de Busca Opcional para Filtrar a Lista Suspensa */}
                        {listaClientes.length > 3 && (
                          <div className="relative w-full sm:w-64">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 text-slate-500" />
                            <input
                              type="text"
                              placeholder="Filtrar por nome ou CPF/CNPJ..."
                              value={buscaCliente}
                              onChange={(e) => setBuscaCliente(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl border border-slate-300/80 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                            />
                          </div>
                        )}
                      </div>

                      {/* Lista Suspensa (Dropdown Select) com suporte a centenas de clientes */}
                      <div className="relative">
                        <select
                          value={clienteEmulado?.id || ""}
                          onChange={(e) => {
                            const idEscolhido = e.target.value;
                            if (!idEscolhido) {
                              desfazerEmulacao();
                              toast.success("Emulação cancelada. Retornado ao modo global.");
                              return;
                            }
                            const cli = listaClientes.find((c) => c.id === idEscolhido);
                            if (cli) {
                              emularCliente({
                                id: cli.id,
                                nome: cli.nome_razao_social,
                                userId: cli.user_id,
                                documento: cli.documento,
                                plano: cli.plano,
                                telefone: cli.telefone,
                              });
                              toast.success(
                                `Modo Cliente ativado: emulando ${cli.nome_razao_social}`,
                              );
                            }
                          }}
                          className={`${inputInsetClass} font-bold cursor-pointer text-xs sm:text-sm`}
                          disabled={carregandoClientes}
                        >
                          <option value="">
                            {carregandoClientes
                              ? "Carregando clientes cadastrados..."
                              : clientesFiltrados.length === 0
                                ? "Nenhum cliente encontrado no filtro"
                                : `-- Selecione o cliente na lista suspensa (${clientesFiltrados.length}) --`}
                          </option>
                          {clientesFiltrados.map((cli) => {
                            const doc = cli.documento ? ` • ${cli.documento}` : "";
                            const plan = cli.plano
                              ? ` • Plano ${String(cli.plano).toUpperCase()}`
                              : " • Plano BÁSICO";
                            return (
                              <option key={cli.id} value={cli.id}>
                                {cli.nome_razao_social} {doc} {plan}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Card do Cliente Atualmente Emulado com Ação Rápida */}
                      {clienteEmulado && (
                        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 dark:text-amber-200">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-xs sm:text-sm truncate">
                                  {clienteEmulado.nome}
                                </span>
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500 text-white shrink-0">
                                  Emulando
                                </span>
                              </div>
                              <span className="text-[11px] opacity-80 block truncate font-mono">
                                {clienteEmulado.documento ? `${clienteEmulado.documento} • ` : ""}
                                {clienteEmulado.plano
                                  ? `Plano ${String(clienteEmulado.plano).toUpperCase()}`
                                  : "Plano MASTER"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              desfazerEmulacao();
                              toast.success("Emulação cancelada. Retornado ao modo global.");
                            }}
                            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition active:scale-95 shrink-0 cursor-pointer shadow-xs"
                          >
                            Voltar ao Modo Global
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Card Consolidado: Veículos Visíveis no Mapa (Quando houver mais de 1 veículo para ADM ou Frota Cliente) */}
              {veiculosDisponiveis.length > 1 ? (
                <div className={`${cardMetricClass} flex flex-col gap-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <h3 className="font-bold text-sm">Veículos Visíveis no Mapa</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/25">
                          {filtroVeiculosIds.length === 0
                            ? `Todos os ${veiculosDisponiveis.length} veículos visíveis`
                            : `${filtroVeiculosIds.length} de ${veiculosDisponiveis.length} selecionados`}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-70 mt-0.5">
                        Marque quais veículos deseja acompanhar na lista e no mapa operacional.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleTodosVeiculosFiltro}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-auto ${
                        isNeumorph
                          ? "bg-[#eaf0f8] dark:bg-slate-800 text-orange-700 dark:text-orange-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border border-orange-300/50 dark:border-orange-700 hover:text-orange-950 dark:hover:text-white"
                          : "text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                      <span>Mostrar Todos</span>
                    </button>
                  </div>

                  {/* Checklist com os veículos disponíveis */}
                  <div
                    className={`grid gap-2 max-h-[300px] overflow-y-auto pr-1 ${
                      veiculosDisponiveis.length === 2
                        ? "grid-cols-1 sm:grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    }`}
                  >
                    {veiculosDisponiveis.map((v) => {
                      const isVisivel =
                        filtroVeiculosIds.length === 0 || filtroVeiculosIds.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleToggleVeiculoFiltro(v.id)}
                          className={`flex items-start gap-2.5 p-2.5 rounded-2xl border transition text-left cursor-pointer ${
                            isVisivel
                              ? isNeumorph
                                ? "bg-[#9EBCEE]/25 dark:bg-orange-950/40 border-orange-500/60 dark:border-orange-500/50 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none text-slate-900 dark:text-slate-100"
                                : "border-orange-500/50 bg-orange-500/5 dark:bg-orange-500/10 text-slate-900 dark:text-slate-100"
                              : isNeumorph
                                ? "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/40 dark:border-slate-800 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none text-slate-700 dark:text-slate-400 opacity-60"
                                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60 text-slate-700 dark:text-slate-400"
                          }`}
                        >
                          <div
                            className={`h-4 w-4 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition ${
                              isVisivel
                                ? "bg-orange-600 border-orange-600 text-white"
                                : "border-slate-400/60 bg-transparent"
                            }`}
                          >
                            {isVisivel && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-black truncate">{v.placa}</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                                  isVisivel
                                    ? "bg-orange-500/20 text-orange-700 dark:text-orange-300"
                                    : "bg-slate-200/50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400"
                                }`}
                              >
                                {isVisivel ? "Visível" : "Oculto"}
                              </span>
                            </div>
                            <div className="text-[10px] opacity-75 mt-0.5 truncate">
                              {v.marca_modelo || "Veículo"}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtro por Condição Integrado */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/15">
                    <span className="text-[11px] font-bold opacity-75 mr-1">Condição:</span>
                    {[
                      { id: "todos", label: "Todos" },
                      { id: "em_rota", label: "Em Rota" },
                      { id: "parado", label: "Ligado" },
                      { id: "estacionado", label: "Estacionado" },
                    ].map((s) => {
                      const isActive = filtroStatus === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSetFiltroStatus(s.id)}
                          className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                            isActive
                              ? isNeumorph
                                ? "bg-[#9EBCEE] dark:bg-orange-600 text-slate-900 dark:text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none font-black border border-slate-300/40 dark:border-orange-500"
                                : "bg-orange-500 text-slate-950 shadow"
                              : isNeumorph
                                ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-700 hover:text-slate-950 dark:hover:text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Para clientes com 1 veículo: Opção de Condição */
                <div className={`${cardMetricClass} flex flex-col gap-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-sm">Veículos Visíveis no Mapa</h3>
                      <p className="text-[11px] opacity-70 mt-0.5">
                        Filtre a visualização dos seus veículos no mapa pela condição atual.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/15">
                    <span className="text-[11px] font-bold opacity-75 mr-1">Condição:</span>
                    {[
                      { id: "todos", label: "Todos" },
                      { id: "em_rota", label: "Em Rota" },
                      { id: "parado", label: "Ligado" },
                      { id: "estacionado", label: "Estacionado" },
                    ].map((s) => {
                      const isActive = filtroStatus === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSetFiltroStatus(s.id)}
                          className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                            isActive
                              ? isNeumorph
                                ? "bg-[#9EBCEE] dark:bg-orange-600 text-slate-900 dark:text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none font-black border border-slate-300/40 dark:border-orange-500"
                                : "bg-orange-500 text-slate-950 shadow"
                              : isNeumorph
                                ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-700 hover:text-slate-950 dark:hover:text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Card Consolidado: Propriedades Monitoradas (Postos Fixos) */}
              <div className={`${cardMetricClass} flex flex-col gap-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="font-bold text-sm">Propriedades Monitoradas (Postos Fixos)</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 font-mono">
                        {postosFixos.length}{" "}
                        {postosFixos.length === 1 ? "propriedade" : "propriedades"}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-70 mt-0.5">
                      Perímetros georreferenciados cadastrados para monitoramento patrimonial
                      contínuo.
                    </p>
                  </div>
                </div>

                {carregandoPostos ? (
                  <div className="py-6 text-center text-xs opacity-60">
                    Carregando postos fixos cadastrados...
                  </div>
                ) : postosFixos.length === 0 ? (
                  <div className="py-6 text-center text-xs opacity-60">
                    Nenhuma propriedade monitorada ou posto fixo cadastrado.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {postosFixos.map((posto) => (
                      <div
                        key={posto.id}
                        className={`p-3 rounded-2xl border transition flex flex-col justify-between gap-2 ${
                          isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/40 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-2xs"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-black truncate block text-slate-900 dark:text-slate-100">
                                {posto.nome}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {posto.ativo ? "Propriedade Ativa" : "Inativa"}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                            Raio {posto.raio_metros || 100}m
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {posto.endereco ||
                              `Lat: ${Number(posto.latitude).toFixed(4)}, Lon: ${Number(posto.longitude).toFixed(4)}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* --- SEÇÃO DO VEÍCULO: ODÔMETRO, PROTEÇÃO E PRIVACIDADE (Inacessível para Instaladores) --- */}
        {!isInstalador && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                {isMotorista
                  ? "Calibração e Odômetro do Veículo"
                  : "Configurações Específicas do Veículo"}
              </h2>
            </div>

            <div className={`${cardMetricClass} space-y-5`}>
              {veiculos.length > 0 ? (
                <>
                  <div>
                    <label className="block text-[11px] font-bold opacity-70 uppercase tracking-wider mb-2">
                      {isMotorista
                        ? "Veículo Atribuído para Sincronização"
                        : "Selecione o Veículo para Configurar"}
                    </label>
                    <select
                      value={veiculoSelecionadoId}
                      onChange={(e) => setVeiculoSelecionadoId(e.target.value)}
                      className={`${inputInsetClass} font-bold appearance-none cursor-pointer`}
                    >
                      {veiculos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.placa} - {v.marca_modelo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={`grid gap-3.5 ${
                      isMotorista ? "grid-cols-1 max-w-md mx-auto" : "grid-cols-1 sm:grid-cols-2"
                    }`}
                  >
                    {/* 1. Sincronizar Odômetro (Acessível para Motorista e Gestão) */}
                    <button
                      type="button"
                      onClick={() => setModalAjusteOdometroAberto(true)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition group cursor-pointer ${
                        isNeumorph
                          ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/50 dark:border-slate-800 text-slate-800 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:text-orange-900 dark:hover:text-orange-300 hover:shadow-[4px_4px_10px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                          : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-orange-500/50 hover:bg-orange-500/5 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400"
                      }`}
                    >
                      <div
                        className={`p-2.5 rounded-xl ${
                          isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-800 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-orange-500/10"
                        }`}
                      >
                        <Gauge className="h-6 w-6 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="text-xs font-bold text-center">Sincronizar Odômetro</span>
                      <span className="text-[10px] opacity-60 text-center">
                        Calibrar KM do painel físico
                      </span>
                    </button>

                    {/* 2. Modo Privativo: Apenas Clientes e Gestores (Inacessível para Motoristas) */}
                    {!isMotorista && (
                      <button
                        type="button"
                        onClick={handleAlternarPrivacidade}
                        disabled={salvandoPrivacidade}
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition group cursor-pointer ${
                          veiculoSelecionado?.privacidade_localizacao !== false
                            ? isNeumorph
                              ? "bg-amber-500/15 dark:bg-amber-950/40 border-amber-400/60 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
                            : isNeumorph
                              ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/50 dark:border-slate-800 text-slate-800 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[4px_4px_10px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                              : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-500/50 hover:text-orange-600"
                        }`}
                      >
                        <div
                          className={`p-2.5 rounded-xl ${
                            isNeumorph
                              ? "bg-[#eaf0f8] dark:bg-slate-800 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                              : "bg-amber-500/10"
                          }`}
                        >
                          <EyeOff
                            className={`h-6 w-6 transition-transform group-hover:scale-110 ${
                              veiculoSelecionado?.privacidade_localizacao !== false
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-orange-600 dark:text-orange-400"
                            }`}
                          />
                        </div>
                        <span className="text-xs font-bold text-center">
                          Modo Privativo (
                          {veiculoSelecionado?.privacidade_localizacao !== false
                            ? "Ligado"
                            : "Desligado"}
                          )
                        </span>
                        <span className="text-[10px] opacity-60 text-center">
                          Ocultar localização em tempo real
                        </span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-6 opacity-60 text-xs">
                  Nenhum veículo disponível para configurar.
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- SEÇÃO DE GOVERNANÇA: RELATÓRIO GERENCIAL DIÁRIO (Exclusivo SuperADM) --- */}
        {session.isSuperAdmin && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                Relatório Gerencial
              </h2>
            </div>

            <div className={cardMetricClass}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">Relatório Diário de Métricas e Governança</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400">
                      Disparo Programado
                    </span>
                  </div>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    Configure os números de WhatsApp, envio via Push, horário de recebimento e
                    marque ou desmarque as seções ativas (Frota, Alertas, Financeiro, Chips e
                    Infraestrutura).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleDispararRelatorioImediato}
                    disabled={disparandoRelatorio}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer justify-center flex-1 sm:flex-initial ${
                      isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-orange-800 dark:text-orange-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-orange-300/50 dark:border-orange-700 hover:text-orange-950 dark:hover:text-white active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                        : "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
                    }`}
                  >
                    <Send className={`h-4 w-4 ${disparandoRelatorio ? "animate-spin" : ""}`} />
                    <span>{disparandoRelatorio ? "Enviando..." : "Enviar Agora no WhatsApp"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalRelatorioAberto(true)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer justify-center flex-1 sm:flex-initial ${
                      isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-indigo-800 dark:text-indigo-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-indigo-300/50 dark:border-indigo-700 hover:text-indigo-950 dark:hover:text-white active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                        : "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20"
                    }`}
                  >
                    <FileText className="h-4 w-4 text-indigo-500" />
                    <span>Configurar Relatório</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- SEÇÃO DE RECEBIMENTO: CHAVE PIX OFICIAL DO SISTEMA (Exclusivo SuperADM) --- */}
        {session.isSuperAdmin && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                Chave PIX Oficial do Sistema
              </h2>
            </div>

            <div className={`${cardMetricClass} space-y-5`}>
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">
                      Chave PIX para Recebimento de Mensalidades
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400">
                      Recebimento Imediato
                    </span>
                  </div>
                  <p className="text-[11px] opacity-70 mt-0.5 max-w-2xl">
                    Esta chave é utilizada pelo sistema para gerar o QR Code oficial, o código Copia
                    e Cola e nos lembretes automáticos de vencimento e atalhos rápidos de pagamento
                    no WhatsApp.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
                  <button
                    type="button"
                    onClick={() => setModalEnvioWhatsappAberto(true)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex-1 sm:flex-none ${
                      isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-orange-800 dark:text-orange-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-orange-300/50 dark:border-orange-700 hover:text-orange-950"
                        : "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30"
                    }`}
                    title="Abrir WhatsApp com atalho para envio de cobrança ou lembrete Pix"
                  >
                    <MessageSquareShare className="h-3.5 w-3.5 text-emerald-500" />
                    <span>WhatsApp Cobrança</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopiarChavePix}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex-1 sm:flex-none ${
                      isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/50 dark:border-slate-700"
                        : "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    {chavePixCopiada ? (
                      <Check className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{chavePixCopiada ? "Copiado!" : "Copiar Chave"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSalvarPix}
                    disabled={salvandoPix}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer disabled:opacity-50 shadow-xs flex-1 sm:flex-none"
                  >
                    <span>{salvandoPix ? "Salvando..." : "Salvar Chave PIX"}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-center">
                <div className="md:col-span-2 lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold opacity-70 uppercase tracking-wider mb-1.5">
                        Tipo de Chave
                      </label>
                      <select
                        value={configPix.tipoChave}
                        onChange={(e) =>
                          setConfigPix((prev) => ({
                            ...prev,
                            tipoChave: e.target.value as any,
                          }))
                        }
                        className={`${inputInsetClass} font-bold appearance-none cursor-pointer`}
                      >
                        <option value="email">E-mail</option>
                        <option value="cpf_cnpj">CNPJ ou CPF</option>
                        <option value="telefone">Telefone Celular</option>
                        <option value="aleatoria">Chave Aleatória (EVP)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold opacity-70 uppercase tracking-wider mb-1.5">
                        Chave PIX
                      </label>
                      <input
                        type="text"
                        value={configPix.chavePix}
                        onChange={(e) =>
                          setConfigPix((prev) => ({
                            ...prev,
                            chavePix: e.target.value,
                          }))
                        }
                        placeholder="Ex: pix@oficial.tec.br ou 24992494030"
                        className={`${inputInsetClass} font-mono`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold opacity-70 uppercase tracking-wider mb-1.5">
                        Nome do Favorecido / Titular
                      </label>
                      <input
                        type="text"
                        value={configPix.titular}
                        onChange={(e) =>
                          setConfigPix((prev) => ({
                            ...prev,
                            titular: e.target.value,
                          }))
                        }
                        placeholder="Ex: GD Rastreamento Tecnologia Ltda"
                        className={inputInsetClass}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold opacity-70 uppercase tracking-wider mb-1.5">
                        Cidade do Favorecido
                      </label>
                      <input
                        type="text"
                        value={configPix.cidade}
                        onChange={(e) =>
                          setConfigPix((prev) => ({
                            ...prev,
                            cidade: e.target.value,
                          }))
                        }
                        placeholder="Ex: Volta Redonda"
                        className={inputInsetClass}
                      />
                    </div>
                  </div>
                </div>

                {/* QR Code Preview */}
                <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Pré-visualização do QR Code
                  </div>
                  {qrCodePixPreview ? (
                    <img
                      src={qrCodePixPreview}
                      alt="QR Code PIX Teste"
                      className="w-28 h-28 object-contain rounded-lg border border-slate-100 dark:border-slate-800"
                    />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300">
                      Sem Chave
                    </div>
                  )}
                  <span className="text-[10px] font-mono text-orange-600 dark:text-orange-400 mt-2 truncate max-w-[160px]">
                    {configPix.chavePix || "Não configurada"}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- SEÇÃO: NOTIFICAÇÕES DE NOTAS FISCAIS (NFs) --- */}
        {clienteIdAtivo && !isInstalador && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                Notas Fiscais e Comprovantes
              </h2>
            </div>

            <div className={`${cardMetricClass} space-y-4`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/50 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">Notificações de NFs para Download</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        notificarNf
                          ? canaisNf.push && canaisNf.whatsapp
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {notificarNf
                        ? canaisNf.push && canaisNf.whatsapp
                          ? "Push e WhatsApp Ativos (com Arquivo Anexo)"
                          : canaisNf.push
                            ? "Apenas Web Push Ativo"
                            : "Apenas WhatsApp Ativo (com Arquivo Anexo)"
                        : "Desativado (Expurgo Direto)"}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    Escolha de forma independente como deseja ser avisado sobre novos abastecimentos
                    e despesas com recibo anexado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAlternarNotificacaoNfGeral}
                  disabled={salvandoPreferenciaNf}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer w-full sm:w-auto justify-center ${
                    notificarNf
                      ? isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-rose-700 dark:text-rose-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-rose-300/50 dark:border-rose-700 hover:text-rose-900"
                        : "text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20"
                      : isNeumorph
                        ? "bg-[#eaf0f8] dark:bg-slate-800 text-orange-800 dark:text-orange-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-orange-300/50 dark:border-orange-700 hover:text-orange-950"
                        : "text-orange-700 dark:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20"
                  }`}
                >
                  <span>{notificarNf ? "Desativar Todos" : "Ativar Todos"}</span>
                </button>
              </div>

              {/* Controles granulares por canal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Canal 1: Web Push / Central do App */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                    isNeumorph
                      ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                      : "bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl ${
                        canaisNf.push
                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                      }`}
                    >
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>Web Push e Central do App</span>
                        {canaisNf.push && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Notificação na tela do celular e computador
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlternarCanalNf("push")}
                    disabled={salvandoPreferenciaNf}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      canaisNf.push
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
                    }`}
                  >
                    {canaisNf.push ? "Ativo" : "Inativo"}
                  </button>
                </div>

                {/* Canal 2: WhatsApp com Anexo */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                    isNeumorph
                      ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                      : "bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl ${
                        canaisNf.whatsapp
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                      }`}
                    >
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>WhatsApp com Arquivo Anexo</span>
                        {canaisNf.whatsapp && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Envia comprovante em PDF ou imagem para visualização direta
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAlternarCanalNf("whatsapp")}
                    disabled={salvandoPreferenciaNf}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      canaisNf.whatsapp
                        ? "bg-orange-600 text-white hover:bg-orange-500"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
                    }`}
                  >
                    {canaisNf.whatsapp ? "Ativo" : "Inativo"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- SEÇÃO: CENTRAL UNIFICADA DE ALERTAS E CANAIS --- */}
        {podeGerenciarCentralAlertas && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
                Central de Alertas e Canais
              </h2>
            </div>

            <div className={cardMetricClass}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm">
                      {modoEquipeCentral
                        ? "Alertas da Operação, Bot WhatsApp e Frota (Equipe Técnica)"
                        : "Alertas da Conta, Canais e Telefones"}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      App, WhatsApp e Ligação
                    </span>
                  </div>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    {modoEquipeCentral
                      ? "Ative ou desative notificações de cadastros, contratos, degustação, retornos de comandos J16, defesa SMS e testes de ligação MacroDroid por usuário."
                      : "Escolha de forma independente quais alertas receber no App, WhatsApp ou Ligação Telefônica, defina números autorizados e execute testes imediatos."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalCentralAlertasAberto(true)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-2xl text-xs font-bold transition cursor-pointer w-full sm:w-auto justify-center ${
                    isNeumorph
                      ? "bg-[#eaf0f8] dark:bg-slate-800 text-orange-800 dark:text-orange-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-orange-300/50 dark:border-orange-700 hover:text-orange-950 dark:hover:text-white active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                      : "text-orange-700 dark:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20"
                  }`}
                >
                  <Bell className="h-4 w-4 text-orange-500" />
                  <span>Abrir Central de Alertas</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* --- SEÇÃO GLOBAL: SEGURANÇA DA CONTA (Acessível por todos, única para Instaladores) --- */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider opacity-90">
              Segurança da Conta
            </h2>
          </div>

          <div className={cardMetricClass}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm">Alteração de Senha</h3>
                <p className="text-[11px] opacity-70 mt-0.5">
                  Renove sua credencial de acesso regularmente para manter sua conta blindada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalSenhaAberto(true)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer w-full sm:w-auto justify-center ${
                  isNeumorph
                    ? "bg-[#eaf0f8] dark:bg-slate-800 text-indigo-800 dark:text-indigo-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-indigo-300/50 dark:border-indigo-700 hover:text-indigo-950 dark:hover:text-white"
                    : "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20"
                }`}
              >
                <Key className="h-4 w-4 text-indigo-500" />
                <span>Alterar Senha</span>
              </button>
            </div>
          </div>
        </section>

        {/* Modais com Portal Global e Zero Corte de Viewport */}
        {modalSenhaAberto && <MudarMinhaSenhaModal onFechar={() => setModalSenhaAberto(false)} />}
        {modalRelatorioAberto && (
          <RelatorioGerencialModal
            aberto={modalRelatorioAberto}
            onClose={() => setModalRelatorioAberto(false)}
          />
        )}
        {modalCienciaNfAberto && (
          <ModalCienciaDesativarNfModal
            aberto={modalCienciaNfAberto}
            carregando={salvandoPreferenciaNf}
            onFechar={() => setModalCienciaNfAberto(false)}
            onConfirmar={() => salvarPreferenciaCanaisNf({ push: false, whatsapp: false }, true)}
          />
        )}
        {!isInstalador && modalAjusteOdometroAberto && veiculoSelecionado && (
          <AjusteOdometroModal
            veiculo={veiculoSelecionado}
            onFechar={() => setModalAjusteOdometroAberto(false)}
            onOdometroAtualizado={(_novoKm) => {
              // Força recarregamento imediato sem depender do delay do Realtime
              recarregar();
            }}
          />
        )}
        {!isMotorista && !isInstalador && modalConfirmarPrivacidadeAberto && veiculoSelecionado && (
          <ModalConfirmarDesligarPrivacidade
            aberto={modalConfirmarPrivacidadeAberto}
            placa={veiculoSelecionado.placa}
            identificador={veiculoSelecionado.marca_modelo}
            carregando={salvandoPrivacidade}
            onFechar={() => setModalConfirmarPrivacidadeAberto(false)}
            onConfirmar={() => executarAlteracaoPrivacidade(false)}
          />
        )}
        {modalEnvioWhatsappAberto && (
          <ModalEnvioRapidoWhatsapp
            aberto={modalEnvioWhatsappAberto}
            onClose={() => setModalEnvioWhatsappAberto(false)}
          />
        )}
        {podeGerenciarCentralAlertas && modalCentralAlertasAberto && (
          <ModalCentralAlertasConta
            aberto={modalCentralAlertasAberto}
            onClose={() => setModalCentralAlertasAberto(false)}
            clienteId={modoEquipeCentral ? null : clienteIdAtivo}
            userId={session.userId}
            isEquipeTecnica={modoEquipeCentral}
            nomeAlvo={
              clienteEmulado?.nome ||
              (!modoEquipeCentral ? session.nome || "Minha Conta" : "Equipe Técnica SuperADM")
            }
            onSalvo={(ops) => {
              if (!modoEquipeCentral && (ops.nf_pronta_download || ops.alerta_nf_expurgo)) {
                const nfP = ops.nf_pronta_download;
                const nfE = ops.alerta_nf_expurgo;
                const pushAtivo = Boolean((nfP?.ativo && nfP?.app) || (nfE?.ativo && nfE?.app));
                const whatsAtivo = Boolean(
                  (nfP?.ativo && nfP?.whatsapp) || (nfE?.ativo && nfE?.whatsapp),
                );
                const geralAtivo = Boolean(
                  (nfP?.ativo && (nfP.app || nfP.whatsapp || nfP.ligacao)) ||
                  (nfE?.ativo && (nfE.app || nfE.whatsapp || nfE.ligacao)),
                );
                setCanaisNf({ push: pushAtivo, whatsapp: whatsAtivo });
                setNotificarNf(geralAtivo);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
