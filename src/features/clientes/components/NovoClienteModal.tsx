import { useState, useEffect, useCallback } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  Users,
  Check,
  Sparkles,
  Wrench,
  Clock,
  Key,
  Copy,
  MessageCircle,
  ShieldCheck,
  RefreshCw,
  ShieldAlert,
  Lock,
  Unlock,
  Edit3,
  CalendarClock,
  MapPin,
  Car,
  Trash2,
  AlertTriangle,
  History,
  FileDown,
  FileText,
  Calendar,
  Radio,
  Cpu,
  Smartphone,
  Info,
  EyeOff,
  ScanLine,
  Layers,
  Plus,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { Cliente, InstaladorResumo, StatusCliente, TipoRenovacaoContrato } from "../types";
import type { PlanoCliente } from "@/integrations/supabase/types";
import {
  listarEquipamentosHabilitadosInstalacao,
  type EquipamentoHabilitado,
} from "@/features/estoque/services/rastreadorChipService";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";
import { ModalDistribuirInstalacoesVeiculos } from "./ModalDistribuirInstalacoesVeiculos";
import {
  cadastrarClienteCompleto,
  atualizarClienteCompleto,
  carregarInstaladoresAtivos,
  carregarVeiculosDoCliente,
  carregarEquipamentoDoCliente,
  bloquearDesbloquearVeiculo,
  editarVeiculo,
  excluirVeiculo,
  excluirCliente,
  gerarPendenciaInstalacaoCliente,
} from "../services/clienteService";
import { emitirContratoPrestacaoServicosPdf } from "../services/contratoPdfService";
import { APP_NOME, APP_PUBLIC_URL } from "@/shared/lib/version";
import {
  obterTaxaInstalacaoPadrao,
  salvarTaxaInstalacaoPadrao,
} from "../services/taxaInstalacaoService";
import { HistoricoClienteModal } from "./HistoricoClienteModal";
import { ModalBloqueioSeguroVeiculo } from "@/features/monitor-gps/components/ModalBloqueioSeguroVeiculo";
import {
  type TipoVeiculo,
  LISTA_TIPOS_VEICULO,
  obterRotuloTipoVeiculo,
} from "@/features/monitor-gps/utils/vehicle3dIcons";
import { Vehicle3DGraphic } from "@/features/monitor-gps/components/Vehicle3DGraphic";
import { toast } from "sonner";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { formatarTelefone } from "@/shared/utils/mascaras";

interface NovoClienteModalProps {
  clienteEdicao?: Cliente | null;
  onFechar: () => void;
  onSucesso: () => void;
}

export function NovoClienteModal({ clienteEdicao, onFechar, onSucesso }: NovoClienteModalProps) {
  const { session } = useAuth();
  const isSuperAdmin =
    !!session?.isSuperAdmin ||
    session?.email === "novaes@adm.28bpm.local" ||
    session?.email === "novaes@oficial.tec.br";
  const isEdicao = !!clienteEdicao;
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false);
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);
  const [excluindoCliente, setExcluindoCliente] = useState(false);

  const handleConfirmarExclusaoCliente = async () => {
    if (!clienteEdicao?.id) return;
    setExcluindoCliente(true);
    try {
      const res = await excluirCliente(clienteEdicao.id);
      if (res.success) {
        toast.success(res.message || "Cliente excluído com sucesso.");
        setModalExclusaoAberto(false);
        onSucesso?.();
        onFechar();
      } else {
        toast.error(res.message || "Não foi possível excluir o cliente.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir o cliente.");
    } finally {
      setExcluindoCliente(false);
    }
  };

  const [nome, setNome] = useState(clienteEdicao?.nome_razao_social || "");
  const [documento, setDocumento] = useState(clienteEdicao?.documento || "");
  const [email, setEmail] = useState(clienteEdicao?.email || "");
  const [telefone, setTelefone] = useState(formatarTelefone(clienteEdicao?.telefone || ""));
  const [status, setStatus] = useState<StatusCliente>(
    clienteEdicao?.status || "aguardando_instalacao",
  );
  const [diaVencimento, setDiaVencimento] = useState(clienteEdicao?.dia_vencimento || 10);
  const [valorMensalidade, setValorMensalidade] = useState(
    clienteEdicao?.valor_mensalidade || 79.9,
  );
  const [privacidadeLocalizacao, setPrivacidadeLocalizacao] = useState<boolean>(false);
  const [taxaInstalacao, setTaxaInstalacao] = useState<number>(() =>
    clienteEdicao?.taxa_instalacao !== undefined
      ? Number(clienteEdicao.taxa_instalacao)
      : obterTaxaInstalacaoPadrao(),
  );

  const handleBlurTaxaInstalacao = () => {
    const padraoAtual = obterTaxaInstalacaoPadrao();
    if (taxaInstalacao !== padraoAtual && taxaInstalacao >= 0) {
      const confirmou = window.confirm(
        `O valor informado de Taxa de Instalação (R$ ${taxaInstalacao.toFixed(2)}) é diferente do padrão do sistema (R$ ${padraoAtual.toFixed(2)}).\n\nDeseja salvar R$ ${taxaInstalacao.toFixed(2)} como o NOVO VALOR PADRÃO de cobrança para todos os novos cadastros?`,
      );
      if (confirmou) {
        salvarTaxaInstalacaoPadrao(taxaInstalacao);
        toast.success(
          `R$ ${taxaInstalacao.toFixed(2)} definido como o novo padrão global para todos os novos cadastros!`,
        );
      } else {
        toast.info(
          `Valor de R$ ${taxaInstalacao.toFixed(2)} será aplicado somente para este cliente.`,
        );
      }
    }
  };

  // Instaladores e Agendamento
  const [instaladores, setInstaladores] = useState<InstaladorResumo[]>([]);
  const [carregandoInstaladores, setCarregandoInstaladores] = useState(false);
  const [instaladorId, setInstaladorId] = useState<string>(clienteEdicao?.instalador_id || "");

  // Plano e retencao
  const [plano, setPlano] = useState<PlanoCliente>(clienteEdicao?.plano || "basico");
  const [diasHistorico, setDiasHistorico] = useState(clienteEdicao?.dias_historico_plano || 7);
  const [diasRetencao, setDiasRetencao] = useState(clienteEdicao?.dias_retencao_banco || 10);

  // Gestão Contratual, Vigência, Renovação e Foro de Volta Redonda/RJ
  const [mesesContrato, setMesesContrato] = useState<number>(clienteEdicao?.meses_contrato || 12);
  const [dataInicioContrato, setDataInicioContrato] = useState<string>(
    clienteEdicao?.data_inicio_contrato || new Date().toISOString().split("T")[0],
  );
  const [tipoRenovacao, setTipoRenovacao] = useState<TipoRenovacaoContrato>(
    clienteEdicao?.tipo_renovacao || "mesma_vigencia",
  );
  const [mesesRenovacao, setMesesRenovacao] = useState<number>(
    clienteEdicao?.meses_renovacao || 12,
  );
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [temFidelidade, setTemFidelidade] = useState<boolean>(
    clienteEdicao?.tem_fidelidade ?? true,
  );
  const [regraHorimetro, setRegraHorimetro] = useState<"pos_chave" | "ignicao_ligada">(
    clienteEdicao?.regra_horimetro || "pos_chave",
  );
  const [horimetroInicial, setHorimetroInicial] = useState<number>(0);

  // Veículos existentes e gerenciamento individual na frota
  const [veiculosExistentes, setVeiculosExistentes] = useState<
    {
      id: string;
      placa: string;
      marca_modelo: string;
      ano?: number | null;
      cor?: string | null;
      tipo_veiculo?: string | null;
      ativo: boolean;
      bloqueado: boolean;
      rastreador_id?: string | null;
    }[]
  >([]);
  const [carregandoVeiculos, setCarregandoVeiculos] = useState(false);
  const [veiculoEmEdicao, setVeiculoEmEdicao] = useState<{
    id: string;
    placa: string;
    marca_modelo: string;
    ano?: number | null;
    cor?: string | null;
    tipo_veiculo?: string | null;
  } | null>(null);
  const [veiculoExcluindoId, setVeiculoExcluindoId] = useState<string | null>(null);
  const [processandoAcaoVeiculo, setProcessandoAcaoVeiculo] = useState<string | null>(null);
  const [gerandoPendencia, setGerandoPendencia] = useState(false);
  const [modalDistribuirAberto, setModalDistribuirAberto] = useState(false);

  // Acesso e Login Unificado do Cliente
  const [criarUsuario, setCriarUsuario] = useState(!isEdicao);
  const [alterarSenha, setAlterarSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [credenciaisCriadas, setCredenciaisCriadas] = useState<{
    email: string;
    senha: string;
    nome: string;
    telefone?: string;
  } | null>(null);

  const [salvando, setSalvando] = useState(false);

  // Equipamento em Comodato (Empréstimo) e Conectividade M2M
  const [rastreadorImei, setRastreadorImei] = useState("");
  const [rastreadorModelo, setRastreadorModelo] = useState("J16 4G");
  const [chipOperadora, setChipOperadora] = useState("Vivo");
  const [chipIccid, setChipIccid] = useState("");
  const [chipLinha, setChipLinha] = useState("");
  const [placaInicial, setPlacaInicial] = useState("");
  const [chassiInicial, setChassiInicial] = useState("");
  const [marcaModeloInicial, setMarcaModeloInicial] = useState("");
  const [anoInicial, setAnoInicial] = useState<number | undefined>(new Date().getFullYear());
  const [corInicial, setCorInicial] = useState("");
  const [tipoVeiculoInicial, setTipoVeiculoInicial] = useState<TipoVeiculo>("carro");

  // Kits e Equipamentos Habilitados em Estoque (IMEI + ICCID vinculados)
  const [equipamentosHabilitados, setEquipamentosHabilitados] = useState<EquipamentoHabilitado[]>(
    [],
  );
  const [carregandoEquipamentos, setCarregandoEquipamentos] = useState(false);
  const [equipamentoSelecionadoId, setEquipamentoSelecionadoId] = useState<string>("");
  const [scannerKitAberto, setScannerKitAberto] = useState(false);

  const recarregarEquipamentos = useCallback(async () => {
    setCarregandoEquipamentos(true);
    try {
      const lista = await listarEquipamentosHabilitadosInstalacao();
      setEquipamentosHabilitados(lista);
    } finally {
      setCarregandoEquipamentos(false);
    }
  }, []);

  const handleSelecionarEquipamento = (eq: EquipamentoHabilitado) => {
    setEquipamentoSelecionadoId(eq.rastreador_id);
    setRastreadorImei(eq.imei);
    setRastreadorModelo(eq.modelo || "J16 4G");
    setChipIccid(eq.iccid);
    setChipOperadora(eq.operadora || "Vivo");
    if (eq.linha) setChipLinha(eq.linha);
    toast.success(`Kit selecionado: IMEI ${eq.imei} e Chip ${eq.iccid}`);
  };

  const recarregarInstaladores = useCallback(async () => {
    setCarregandoInstaladores(true);
    try {
      const lista = await carregarInstaladoresAtivos();
      setInstaladores(lista);
    } finally {
      setCarregandoInstaladores(false);
    }
  }, []);

  const recarregarVeiculos = useCallback(async () => {
    if (!clienteEdicao?.id) return;
    setCarregandoVeiculos(true);
    try {
      const lista = await carregarVeiculosDoCliente(clienteEdicao.id);
      setVeiculosExistentes(lista);
    } finally {
      setCarregandoVeiculos(false);
    }
  }, [clienteEdicao?.id]);

  useEffect(() => {
    recarregarInstaladores();
    recarregarEquipamentos();
    if (clienteEdicao) {
      setNome(clienteEdicao.nome_razao_social || "");
      setDocumento(clienteEdicao.documento || "");
      setEmail(clienteEdicao.email || "");
      setTelefone(formatarTelefone(clienteEdicao.telefone || ""));
      setStatus(clienteEdicao.status || "aguardando_instalacao");
      setInstaladorId(clienteEdicao.instalador_id || "");
      setPlano(clienteEdicao.plano || "basico");
      setDiaVencimento(clienteEdicao.dia_vencimento ?? 10);
      setValorMensalidade(clienteEdicao.valor_mensalidade ?? 79.9);
      setTaxaInstalacao(
        clienteEdicao.taxa_instalacao !== undefined
          ? Number(clienteEdicao.taxa_instalacao)
          : obterTaxaInstalacaoPadrao(),
      );
      setDiasHistorico(clienteEdicao.dias_historico_plano ?? 7);
      setDiasRetencao(clienteEdicao.dias_retencao_banco ?? 10);
      setMesesContrato(clienteEdicao.meses_contrato || 12);
      setDataInicioContrato(
        clienteEdicao.data_inicio_contrato || new Date().toISOString().split("T")[0],
      );
      setTipoRenovacao(clienteEdicao.tipo_renovacao || "mesma_vigencia");
      setMesesRenovacao(clienteEdicao.meses_renovacao || 12);
      setPrivacidadeLocalizacao(false);
      setTemFidelidade(clienteEdicao.tem_fidelidade ?? true);
      setRegraHorimetro(clienteEdicao.regra_horimetro || "pos_chave");
      setCriarUsuario(!clienteEdicao.user_id);
      setAlterarSenha(false);
      setSenha("");

      recarregarVeiculos();

      carregarEquipamentoDoCliente(clienteEdicao.id).then((eq) => {
        if (eq) {
          setRastreadorImei(eq.rastreadorImei || "");
          setRastreadorModelo(eq.rastreadorModelo || "J16 4G");
          setChipOperadora(eq.chipOperadora || "Vivo");
          setChipIccid(eq.chipIccid || "");
          setChipLinha(eq.chipLinha || "");
          if (eq.placa) setPlacaInicial(eq.placa);
          if (eq.marcaModelo) setMarcaModeloInicial(eq.marcaModelo);
          if (eq.ano) setAnoInicial(eq.ano);
          if (eq.cor) setCorInicial(eq.cor);
          if (eq.tipoVeiculo) setTipoVeiculoInicial(eq.tipoVeiculo as TipoVeiculo);
          if (eq.horimetroInicial) setHorimetroInicial(eq.horimetroInicial);
          if (eq.kitId) setEquipamentoSelecionadoId(eq.kitId);
        }
      });
    } else {
      setNome("");
      setDocumento("");
      setEmail("");
      setTelefone("");
      setStatus("aguardando_instalacao");
      setInstaladorId("");
      setPlano("basico");
      setDiaVencimento(10);
      setValorMensalidade(79.9);
      setTaxaInstalacao(obterTaxaInstalacaoPadrao());
      setDiasHistorico(7);
      setDiasRetencao(10);
      setMesesContrato(12);
      setDataInicioContrato(new Date().toISOString().split("T")[0]);
      setTipoRenovacao("mesma_vigencia");
      setMesesRenovacao(12);
      setPrivacidadeLocalizacao(false);
      setTemFidelidade(true);
      setRegraHorimetro("pos_chave");
      setHorimetroInicial(0);
      setCriarUsuario(true);
      setAlterarSenha(false);
      setSenha("");
      setVeiculosExistentes([]);
      setRastreadorImei("");
      setRastreadorModelo("J16 4G");
      setChipOperadora("Vivo");
      setChipIccid("");
      setChipLinha("");
      setPlacaInicial("");
      setMarcaModeloInicial("");
      setAnoInicial(new Date().getFullYear());
      setCorInicial("");
      setTipoVeiculoInicial("carro");
    }
  }, [clienteEdicao, recarregarInstaladores, recarregarVeiculos, recarregarEquipamentos]);

  const handleBaixarContrato = async () => {
    try {
      setGerandoPdf(true);
      const clienteMock: Cliente = {
        id: clienteEdicao?.id || "NOVO-CLIENTE",
        nome_razao_social: nome.trim() || `Cliente ${APP_NOME}`,
        documento: documento.trim() || null,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        status,
        plano,
        dia_vencimento: diaVencimento,
        valor_mensalidade: valorMensalidade,
        taxa_instalacao: taxaInstalacao,
        dias_historico_plano: diasHistorico,
        dias_retencao_banco: diasRetencao,
        meses_contrato: mesesContrato,
        data_inicio_contrato: dataInicioContrato,
        tipo_renovacao: tipoRenovacao,
        meses_renovacao: mesesRenovacao,
        foro_comarca: "Volta Redonda/RJ",
        created_at: clienteEdicao?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const veiculosFormatados =
        veiculosExistentes.length > 0
          ? veiculosExistentes.map((v) => ({
              placa: v.placa,
              marca_modelo: v.marca_modelo,
              ano: v.ano,
              cor: v.cor,
            }))
          : placaInicial.trim()
            ? [
                {
                  placa: placaInicial.trim().toUpperCase(),
                  marca_modelo: marcaModeloInicial.trim() || "Veículo não especificado",
                  ano: anoInicial ? Number(anoInicial) : undefined,
                  cor: corInicial.trim() || undefined,
                },
              ]
            : undefined;

      await emitirContratoPrestacaoServicosPdf({
        cliente: clienteMock,
        veiculos: veiculosFormatados,
        usuarioEmissor: session?.nome || "Administração",
      });

      toast.success("Contrato oficial de prestação de serviços baixado em PDF!");
    } catch (err: any) {
      console.error("Erro ao emitir contrato PDF:", err);
      toast.error(err?.message || "Falha ao emitir contrato PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  const [veiculoParaBloqueioSeguro, setVeiculoParaBloqueioSeguro] = useState<
    (typeof veiculosExistentes)[0] | null
  >(null);

  const handleToggleBloqueio = async (veiculo: (typeof veiculosExistentes)[0]) => {
    if (veiculo.bloqueado) {
      if (
        !window.confirm(
          `Confirma desativar o bloqueio e liberar a partida do veículo ${veiculo.placa}?`,
        )
      ) {
        return;
      }
      setProcessandoAcaoVeiculo(veiculo.id);
      try {
        const res = await bloquearDesbloquearVeiculo(veiculo.id, false);
        if (res.success) {
          toast.success(res.message);
          await recarregarVeiculos();
        } else {
          toast.error(res.message);
        }
      } finally {
        setProcessandoAcaoVeiculo(null);
      }
    } else {
      setVeiculoParaBloqueioSeguro(veiculo);
    }
  };

  const handleSalvarEdicaoVeiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoEmEdicao) return;
    setProcessandoAcaoVeiculo(veiculoEmEdicao.id);
    try {
      const res = await editarVeiculo(veiculoEmEdicao.id, {
        placa: veiculoEmEdicao.placa,
        marca_modelo: veiculoEmEdicao.marca_modelo,
        ano: veiculoEmEdicao.ano,
        cor: veiculoEmEdicao.cor,
        tipo_veiculo: veiculoEmEdicao.tipo_veiculo,
        instaladorId: (veiculoEmEdicao as any).instalador_id || null,
      });
      if (res.success) {
        toast.success(res.message);
        setVeiculoEmEdicao(null);
        await recarregarVeiculos();
      } else {
        toast.error(res.message);
      }
    } finally {
      setProcessandoAcaoVeiculo(null);
    }
  };

  const handleExcluirVeiculo = async (veiculoId: string) => {
    setProcessandoAcaoVeiculo(veiculoId);
    try {
      const res = await excluirVeiculo(veiculoId);
      if (res.success) {
        toast.success(res.message);
        setVeiculoExcluindoId(null);
        await recarregarVeiculos();
      } else {
        toast.error(res.message);
      }
    } finally {
      setProcessandoAcaoVeiculo(null);
    }
  };

  const handleGerarPendenciaInstalacao = async () => {
    if (!clienteEdicao?.id) return;
    if (!instaladorId) {
      toast.error("Selecione o instalador credenciado antes de gerar a pendência.");
      return;
    }
    setGerandoPendencia(true);
    try {
      const res = await gerarPendenciaInstalacaoCliente(clienteEdicao.id, instaladorId);
      if (res.success) {
        toast.success(res.message);
        setStatus("aguardando_instalacao");
        if (onSucesso) {
          onSucesso();
        }
        onFechar();
      } else {
        toast.error(res.message);
      }
    } finally {
      setGerandoPendencia(false);
    }
  };

  const gerarSenhaForte = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!";
    let s = "";
    for (let i = 0; i < 10; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSenha(s);
    toast.info("Senha forte gerada com sucesso!");
  };

  const selecionarPlano = (p: PlanoCliente) => {
    setPlano(p);
    if (p === "basico") {
      setDiasHistorico(7);
      setDiasRetencao(10);
      setValorMensalidade(59.9);
    } else if (p === "pro") {
      setDiasHistorico(15);
      setDiasRetencao(20);
      setValorMensalidade(79.9);
    } else if (p === "master") {
      setDiasHistorico(30);
      setDiasRetencao(35);
      setValorMensalidade(119.9);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o Nome ou Razão Social do cliente.");
      return;
    }

    const precisaValidarSenha =
      (!isEdicao && criarUsuario) ||
      (isEdicao && (alterarSenha || (!clienteEdicao?.user_id && criarUsuario)));

    if (precisaValidarSenha) {
      if (!email.trim()) {
        toast.error("Informe o e-mail para liberar o login de acesso do cliente.");
        return;
      }
      if (!senha || senha.length < 6) {
        toast.error("A senha de acesso deve ter no mínimo 6 caracteres.");
        return;
      }
    }

    setSalvando(true);
    try {
      if (isEdicao && clienteEdicao?.id) {
        const res = await atualizarClienteCompleto({
          id: clienteEdicao.id,
          nome: nome.trim(),
          documento: documento.trim() || undefined,
          email: email.trim() || undefined,
          telefone: telefone.trim() || undefined,
          status,
          plano,
          diaVencimento: Number(diaVencimento),
          valorMensalidade: Number(valorMensalidade),
          diasHistorico: Number(diasHistorico),
          diasRetencao: Number(diasRetencao),
          senha: precisaValidarSenha ? senha : undefined,
          instaladorId: instaladorId || null,
          mesesContrato: Number(mesesContrato),
          dataInicioContrato,
          tipoRenovacao,
          mesesRenovacao: Number(mesesRenovacao),
          foroComarca: "Volta Redonda/RJ",
          taxaInstalacao: Number(taxaInstalacao),
          privacidadeLocalizacao,
          regraHorimetro,
          temFidelidade,
          rastreadorImei: rastreadorImei.trim() || undefined,
          rastreadorModelo: rastreadorModelo.trim() || undefined,
          chipOperadora: chipOperadora.trim() || undefined,
          chipIccid: chipIccid.trim() || undefined,
          chipLinha: chipLinha.trim() || undefined,
          placa: placaInicial.trim().toUpperCase() || undefined,
          marcaModelo: marcaModeloInicial.trim() || undefined,
          ano: anoInicial ? Number(anoInicial) : undefined,
          cor: corInicial.trim() || undefined,
          tipoVeiculo: tipoVeiculoInicial,
          horimetroInicial: Number(horimetroInicial) || 0,
          kitId: equipamentoSelecionadoId || undefined,
        });

        if (res.success) {
          toast.success(res.message);

          if (precisaValidarSenha && senha) {
            setCredenciaisCriadas({
              nome: nome.trim(),
              email: email.trim(),
              senha,
              telefone: telefone.trim() || undefined,
            });
          } else {
            onFechar();
            onSucesso();
          }
        } else {
          toast.error(res.message);
        }
      } else {
        const isSemPlacaInicial =
          (tipoVeiculoInicial as string) === "maquina" ||
          (tipoVeiculoInicial as string) === "trator" ||
          (tipoVeiculoInicial as string) === "moto_eletrica";
        const chassiLimpoInicial = chassiInicial.trim().toUpperCase();
        const sufixoChassi = chassiLimpoInicial.length >= 6 ? chassiLimpoInicial.slice(-6) : null;
        const placaFormatadaInicial =
          placaInicial.trim().toUpperCase() ||
          (isSemPlacaInicial ? sufixoChassi || "SEM PLACA" : undefined);

        const res = await cadastrarClienteCompleto({
          nome: nome.trim(),
          documento: documento.trim() || undefined,
          email: email.trim() || undefined,
          telefone: telefone.trim() || undefined,
          plano,
          diaVencimento: Number(diaVencimento),
          valorMensalidade: Number(valorMensalidade),
          taxaInstalacao: Number(taxaInstalacao),
          diasHistorico: Number(diasHistorico),
          diasRetencao: Number(diasRetencao),
          privacidadeLocalizacao,
          regraHorimetro,
          temFidelidade,
          criarUsuario,
          senha: criarUsuario ? senha : undefined,
          instaladorId: instaladorId || undefined,
          mesesContrato: Number(mesesContrato),
          dataInicioContrato,
          tipoRenovacao,
          mesesRenovacao: Number(mesesRenovacao),
          foroComarca: "Volta Redonda/RJ",
          rastreadorImei: rastreadorImei.trim() || undefined,
          rastreadorModelo: rastreadorModelo.trim() || undefined,
          chipOperadora: chipOperadora.trim() || undefined,
          chipIccid: chipIccid.trim() || undefined,
          chipLinha: chipLinha.trim() || undefined,
          placa: placaFormatadaInicial,
          chassi: chassiLimpoInicial || undefined,
          marcaModelo: marcaModeloInicial.trim() || undefined,
          ano: anoInicial ? Number(anoInicial) : undefined,
          cor: corInicial.trim() || undefined,
          tipoVeiculo: tipoVeiculoInicial,
          horimetroInicial: Number(horimetroInicial) || 0,
        });

        if (res.success) {
          toast.success(res.message || "Cliente cadastrado com sucesso!");

          if (criarUsuario && senha) {
            setCredenciaisCriadas({
              nome: nome.trim(),
              email: email.trim(),
              senha,
              telefone: telefone.trim() || undefined,
            });
          } else {
            onFechar();
            onSucesso();
          }
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: any) {
      console.error("Erro ao salvar cliente:", err);
      toast.error(err?.message || "Falha ao processar dados do cliente.");
    } finally {
      setSalvando(false);
    }
  };

  // Modal de Credenciais Geradas com Sucesso (após cadastro ou redefinição de senha)
  if (credenciaisCriadas) {
    const textoCredenciais = `*${APP_NOME.toUpperCase()} — ACESSO LIBERADO*\nOlá, ${credenciaisCriadas.nome}!\nSeu acesso à plataforma ${APP_NOME} está ativo.\n\n🌐 Acesso Web: ${APP_PUBLIC_URL}/login\n📧 E-mail: ${credenciaisCriadas.email}\n🔑 Senha: ${credenciaisCriadas.senha}\n\nRecomendamos alterar sua senha após o primeiro acesso.`;

    const copiarTextoCredenciais = () => {
      navigator.clipboard.writeText(textoCredenciais);
      setCopiado(true);
      toast.success("Credenciais copiadas com sucesso!");
      setTimeout(() => setCopiado(false), 2500);
    };

    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-orange-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 text-center text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto my-auto">
            <div className="h-14 w-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 mx-auto">
              <ShieldCheck className="h-8 w-8 animate-pulse" />
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                {isEdicao ? "Credenciais Atualizadas com Sucesso!" : "Acesso Criado com Sucesso!"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                O cliente já pode acessar a plataforma utilizando os dados abaixo
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-left font-mono text-xs space-y-2.5 shadow-xs">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Cliente
                </span>
                <span className="text-slate-800 dark:text-slate-200 font-bold">
                  {credenciaisCriadas.nome}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Login / E-mail
                </span>
                <span className="text-orange-600 dark:text-orange-400 font-bold select-all">
                  {credenciaisCriadas.email}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Senha de Acesso
                </span>
                <span className="text-sky-600 dark:text-sky-400 font-bold select-all text-sm tracking-wider">
                  {credenciaisCriadas.senha}
                </span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={copiarTextoCredenciais}
                className="w-full px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-orange-950/40 cursor-pointer"
              >
                {copiado ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <Copy className="h-4 w-4 text-white" />
                )}
                <span>
                  {copiado
                    ? "Copiado para a Área de Transferência!"
                    : "Copiar Credenciais de Acesso"}
                </span>
              </button>
            </div>

            <button
              onClick={() => {
                setCredenciaisCriadas(null);
                onFechar();
                onSucesso();
              }}
              className="w-full py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              Concluir e Voltar
            </button>
          </div>
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col text-slate-800 dark:text-slate-100">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/80 dark:bg-slate-950/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isEdicao ? "Editar Ficha do Cliente" : "Cadastrar Novo Cliente"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ficha cadastral unificada, plano comercial e credenciais de acesso
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isEdicao && clienteEdicao && (
                <button
                  type="button"
                  onClick={() => setModalHistoricoAberto(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 text-xs font-semibold border border-slate-300/70 dark:border-slate-700/60 transition shadow-xs"
                  title="Visualizar histórico 360 do cliente"
                >
                  <History className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  <span>Histórico 360°</span>
                </button>
              )}
              <button
                type="button"
                onClick={onFechar}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Formulário Principal com Paridade Exata de Telas */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 custom-scrollbar">
              {clienteEdicao?.pendente_configuracao_operador && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-[11px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Auto-Cadastro Pendente de Finalização</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Este cliente preencheu os dados e os veículos através do link de convite. Defina
                    o plano, a mensalidade e confirme o instalador técnico responsável. Ao salvar, a
                    pendência operacional será concluída.
                  </p>
                </div>
              )}

              {/* 1. Identificação Básica */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo / Razão Social *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: João da Silva / Transportes SA"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone / Celular
                  </label>
                  <input
                    type="text"
                    value={telefone}
                    onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail (Login de Acesso) *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                />
              </div>

              {/* 2. Status do Cliente e Situação da Instalação */}
              <div className="space-y-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Status Operacional do Cliente
                  </label>
                  {isEdicao && (
                    <span className="text-[10px] text-slate-500">
                      Definido pelo ciclo de instalação e financeiro
                    </span>
                  )}
                </div>

                {isEdicao ? (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusCliente)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:border-orange-500 shadow-xs"
                  >
                    <option value="aguardando_instalacao">Aguardando Instalação Física</option>
                    <option value="ativo">Ativo / Em Operação</option>
                    <option value="bloqueado">Bloqueado / Inadimplente</option>
                    <option value="cancelado">Cancelado / Inativo</option>
                  </select>
                ) : null}

                {/* Card explicativo dinâmico conforme status */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 shadow-xs ${
                    status === "aguardando_instalacao"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
                      : status === "ativo"
                        ? "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {status === "aguardando_instalacao" ? (
                    <Clock className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  ) : status === "ativo" ? (
                    <Check className="h-5 w-5 shrink-0 mt-0.5 text-orange-600 dark:text-orange-400" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  )}
                  <div className="text-xs">
                    <div className="font-semibold flex items-center gap-1.5">
                      {status === "aguardando_instalacao" && (
                        <>
                          <Wrench className="h-3.5 w-3.5" />
                          <span>Aguardando Instalação Física</span>
                        </>
                      )}
                      {status === "ativo" && <span>Cliente Ativo na Frota</span>}
                      {status === "bloqueado" && <span>Cliente Bloqueado</span>}
                      {status === "cancelado" && <span>Contrato Cancelado</span>}
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {status === "aguardando_instalacao"
                        ? "O veículo, placa e rastreador J16 serão associados pelo técnico no módulo de Instalação. Ao concluir a instalação física, o status migrará automaticamente para Ativo."
                        : status === "ativo"
                          ? "O cliente possui acesso ativo à telemetria veicular, relatórios de rota e mapa em tempo real."
                          : "O acesso do cliente está temporariamente restrito no sistema e aplicativo."}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Atribuicao de Instalador e Ponto de Atendimento */}
              <div className="space-y-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Instalador Responsável
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => recarregarInstaladores()}
                      disabled={carregandoInstaladores}
                      title="Recarregar lista de técnicos"
                      className="text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors p-1"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${carregandoInstaladores ? "animate-spin text-orange-600 dark:text-orange-400" : ""}`}
                      />
                    </button>
                    <span className="text-[10px] text-slate-500">
                      Ponto de atendimento para agendamento
                    </span>
                  </div>
                </div>

                <select
                  value={instaladorId}
                  onChange={(e) => {
                    const novoId = e.target.value;
                    setInstaladorId(novoId);
                    if (novoId) {
                      const inst = instaladores.find((i) => i.id === novoId);
                      if (inst) {
                        const valorSugerido =
                          Number(
                            inst.valor_instalacao_sem_bloqueador ?? inst.valor_por_instalacao,
                          ) || 0;
                        if (valorSugerido > 0) {
                          setTaxaInstalacao(valorSugerido);
                          toast.info(
                            `Valor de instalação sugerido automaticamente do instalador (${inst.nome}): R$ ${valorSugerido.toFixed(2)}. Você pode editá-lo se necessário.`,
                          );
                        }
                      }
                    }
                  }}
                  onFocus={() => {
                    if (instaladores.length === 0) {
                      recarregarInstaladores();
                    }
                  }}
                  disabled={carregandoInstaladores}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 disabled:opacity-60 shadow-xs"
                >
                  <option value="">
                    {carregandoInstaladores
                      ? "Carregando técnicos credenciados..."
                      : "Selecione um instalador credenciado (Opcional)"}
                  </option>
                  {instaladores.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.nome} {inst.endereco_instalacao ? `— ${inst.endereco_instalacao}` : ""}
                    </option>
                  ))}
                </select>

                {/* Alerta caso nenhum instalador ativo seja retornado */}
                {!carregandoInstaladores ? (
                  instaladores.length === 0 ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400/90 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span>
                        Nenhum técnico cadastrado com perfil instalador e ativo no sistema.
                      </span>
                    </p>
                  ) : null
                ) : null}

                {/* Detalhes do instalador selecionado */}
                {(() => {
                  const instSelecionado = instaladores.find((i) => i.id === instaladorId);
                  if (!instSelecionado) return null;
                  return (
                    <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-xs space-y-1.5 animate-fadeIn shadow-xs">
                      <div className="font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5" />
                        <span>Técnico: {instSelecionado.nome}</span>
                      </div>
                      {instSelecionado.endereco_instalacao ? (
                        <div className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400 mt-0.5" />
                          <span>{instSelecionado.endereco_instalacao}</span>
                        </div>
                      ) : null}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        O cliente visualizará o nome e o endereço deste técnico ao entrar no sistema
                        até a conclusão da instalação.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* 4. Veículos do Cliente para Instalação e Rastreamento */}
              <div className="space-y-3 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Car className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Veículos para Rastreamento ({veiculosExistentes.length})
                    </label>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isEdicao && clienteEdicao?.id ? (
                      <button
                        type="button"
                        onClick={() => setModalDistribuirAberto(true)}
                        className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        title="Abrir lista completa para distribuir instaladores e kits de comodato por veículo"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>Distribuir Instalações e Equipamentos por Veículo</span>
                      </button>
                    ) : null}

                    {isEdicao ? (
                      <button
                        type="button"
                        onClick={handleGerarPendenciaInstalacao}
                        disabled={gerandoPendencia}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>
                          {gerandoPendencia ? "Gerando..." : "Gerar Pendência para Instalador"}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  O técnico credenciado inclui os dados do veículo fisicamente na conclusão da
                  instalação. No cadastro do cliente é possível bloquear, editar e excluir veículos
                  separadamente.
                </p>

                {/* Lista de Veículos Cadastrados na Frota */}
                {isEdicao && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 block">
                      Veículos Cadastrados na Frota
                    </span>

                    {carregandoVeiculos ? (
                      <div className="py-4 text-center text-xs text-slate-500">
                        Carregando veículos da frota...
                      </div>
                    ) : veiculosExistentes.length === 0 ? (
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 shadow-xs space-y-2">
                        <p>
                          Nenhum veículo ativo na frota ainda. Gere a pendência para o técnico
                          realizar o agendamento e a instalação física, ou adicione veículos e kits
                          agora.
                        </p>
                        <button
                          type="button"
                          onClick={() => setModalDistribuirAberto(true)}
                          className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Adicionar Veículo e Distribuir Instalação</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {veiculosExistentes.map((vex) => {
                          const temRastreadorAtivo = vex.ativo && Boolean(vex.rastreador_id);
                          return (
                            <div
                              key={vex.id}
                              className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 space-y-2 shadow-xs"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Vehicle3DGraphic tipo={vex.tipo_veiculo} size={28} />
                                  <span className="px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300/70 dark:border-slate-700">
                                    {vex.placa}
                                  </span>
                                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                                    {vex.marca_modelo}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    {obterRotuloTipoVeiculo(vex.tipo_veiculo)}
                                  </span>
                                  {vex.ano || vex.cor ? (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      ({[vex.ano, vex.cor].filter(Boolean).join(" • ")})
                                    </span>
                                  ) : null}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                      vex.bloqueado
                                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                        : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
                                    }`}
                                  >
                                    {vex.bloqueado ? "Bloqueado" : "Desbloqueado"}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                      temRastreadorAtivo
                                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
                                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                    }`}
                                  >
                                    {temRastreadorAtivo ? "Rastreando" : "Aguardando Instalação"}
                                  </span>
                                </div>
                              </div>

                              {/* Ações Individuais: Bloquear/Desbloquear, Editar, Excluir */}
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                                <button
                                  type="button"
                                  disabled={processandoAcaoVeiculo === vex.id}
                                  onClick={() => handleToggleBloqueio(vex)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shadow-xs ${
                                    vex.bloqueado
                                      ? "bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                                      : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                  }`}
                                >
                                  {vex.bloqueado ? (
                                    <Unlock className="h-3 w-3" />
                                  ) : (
                                    <Lock className="h-3 w-3" />
                                  )}
                                  <span>{vex.bloqueado ? "Desbloquear" : "Bloquear"}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setModalDistribuirAberto(true)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1 transition shadow-xs cursor-pointer"
                                  title="Definir instalador credenciado e kit de rastreador deste veículo"
                                >
                                  <Wrench className="h-3 w-3" />
                                  <span>Instalação e Kit</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setVeiculoEmEdicao(vex)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/70 dark:border-slate-700 flex items-center gap-1 transition shadow-xs"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>Editar</span>
                                </button>

                                {veiculoExcluindoId === vex.id ? (
                                  <div className="flex items-center gap-1.5 animate-fadeIn">
                                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                                      Excluir?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={processandoAcaoVeiculo === vex.id}
                                      onClick={() => handleExcluirVeiculo(vex.id)}
                                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition"
                                    >
                                      Sim
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setVeiculoExcluindoId(null)}
                                      className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] transition"
                                    >
                                      Não
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setVeiculoExcluindoId(vex.id)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                                    title="Excluir veículo"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Formulário Inline de Edição do Veículo */}
                              {veiculoEmEdicao?.id === vex.id ? (
                                <div className="p-3 rounded-xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 space-y-2 animate-fadeIn mt-2 shadow-xs">
                                  <div className="text-[11px] font-bold text-orange-600 dark:text-orange-400 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <Edit3 className="h-3.5 w-3.5" />
                                      <span>Editar Veículo {vex.placa}</span>
                                    </div>
                                    <Vehicle3DGraphic
                                      tipo={veiculoEmEdicao.tipo_veiculo}
                                      size={28}
                                    />
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Tipo de Veículo *
                                      </label>
                                      <select
                                        value={veiculoEmEdicao.tipo_veiculo || "carro"}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            tipo_veiculo: e.target.value,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                                      >
                                        {LISTA_TIPOS_VEICULO.map((tv) => (
                                          <option key={tv.id} value={tv.id}>
                                            {tv.label} ({tv.descricao})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Placa *
                                      </label>
                                      <input
                                        type="text"
                                        value={veiculoEmEdicao.placa}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            placa: e.target.value
                                              .toUpperCase()
                                              .replace(/[^A-Z0-9]/g, "")
                                              .slice(0, 7),
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs font-mono font-bold text-slate-800 dark:text-slate-100 uppercase focus:outline-none focus:border-orange-500 shadow-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Marca e Modelo *
                                      </label>
                                      <input
                                        type="text"
                                        value={veiculoEmEdicao.marca_modelo}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            marca_modelo: e.target.value,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Ano
                                      </label>
                                      <input
                                        type="number"
                                        value={veiculoEmEdicao.ano || ""}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            ano: e.target.value ? Number(e.target.value) : null,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                                      />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Cor
                                      </label>
                                      <input
                                        type="text"
                                        value={veiculoEmEdicao.cor || ""}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            cor: e.target.value,
                                          })
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                                      />
                                    </div>

                                    <div className="sm:col-span-3">
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                                        Instalador Técnico Credenciado (deste veículo)
                                      </label>
                                      <select
                                        value={(veiculoEmEdicao as any).instalador_id || ""}
                                        onChange={(e) =>
                                          setVeiculoEmEdicao({
                                            ...veiculoEmEdicao,
                                            instalador_id: e.target.value,
                                          } as any)
                                        }
                                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                                      >
                                        <option value="">Selecione o Instalador...</option>
                                        {instaladores.map((inst) => (
                                          <option key={inst.id} value={inst.id}>
                                            {inst.nome}{" "}
                                            {inst.endereco_instalacao
                                              ? "(" + inst.endereco_instalacao + ")"
                                              : ""}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setVeiculoEmEdicao(null)}
                                      className="px-2.5 py-1 rounded text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processandoAcaoVeiculo === vex.id}
                                      onClick={handleSalvarEdicaoVeiculo}
                                      className="px-3 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition shadow-xs"
                                    >
                                      Salvar Veículo
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Equipamento em Comodato e Conectividade M2M (Apenas no Cadastro Inicial; na Edição utiliza-se a tela de Distribuição de Frota) */}
                {!isEdicao && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-300/70 dark:border-slate-800 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-none space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-emerald-200 dark:border-emerald-800 text-orange-600 dark:text-orange-400">
                          <Radio className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Equipamento em Comodato e Conectividade M2M
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isEdicao
                              ? "Configuração e vinculação de kit de rastreador, IMEI e chip M2M para a ordem de instalação e veículo"
                              : "Configuração administrativa de chip, rastreador e veículo inicial para a ordem de serviço"}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 self-start sm:self-auto">
                        <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        COMODATO · CCB ARTS. 579 A 585
                      </span>
                    </div>

                    {/* Banner de Esclarecimento Operacional e Jurídico */}
                    <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-emerald-200/70 dark:border-emerald-800/60 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-emerald-950 dark:text-orange-200 leading-relaxed">
                        <strong>Regra de Campo e Comodato {APP_NOME}:</strong> Os equipamentos
                        permanecem sob regime de empréstimo de uso gratuito (comodato) durante o
                        contrato. A administração informa os dados do chip e do rastreador
                        previamente, pois o instalador não gerencia chips M2M e apenas{" "}
                        <u>confere fisicamente o IMEI</u> na instalação do veículo.
                      </div>
                    </div>

                    {/* Seletor do Kit Habilitado para Instalação (Operador Determina o Kit) */}
                    <div className="space-y-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Cpu className="w-4 h-4 text-amber-500" />
                            <span>Kit de Instalação (Equipamentos Habilitados no Estoque)</span>
                          </span>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            Selecione o kit físico com IMEI e ICCID já vinculados que o instalador
                            receberá para este veículo.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setScannerKitAberto(true)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm shrink-0"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                          <span>Escanear Código da Caixa</span>
                        </button>
                      </div>

                      {carregandoEquipamentos ? (
                        <div className="text-xs text-slate-500 py-2 font-mono">
                          Carregando kits habilitados no estoque...
                        </div>
                      ) : equipamentosHabilitados.length === 0 ? (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong>Nenhum equipamento habilitado no estoque.</strong>
                            <p className="text-[11px] mt-0.5">
                              Para liberar aparelhos para instalação, acesse o módulo de{" "}
                              <strong>Estoque &gt; Rastreadores e Chips</strong> e vincule o IMEI ao
                              ICCID do chip M2M. Você também pode preencher manualmente abaixo para
                              contingência.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                            Escolha o Kit Disponível ({equipamentosHabilitados.length} liberados no
                            estoque):
                          </label>
                          <select
                            value={equipamentoSelecionadoId}
                            onChange={(e) => {
                              const eq = equipamentosHabilitados.find(
                                (item) => item.rastreador_id === e.target.value,
                              );
                              if (eq) handleSelecionarEquipamento(eq);
                              else if (!e.target.value) {
                                setEquipamentoSelecionadoId("");
                              }
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-500/40 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 transition shadow-inner"
                          >
                            <option value="">-- Selecione o Kit Liberado no Estoque --</option>
                            {equipamentoSelecionadoId &&
                              !equipamentosHabilitados.some(
                                (eq) => eq.rastreador_id === equipamentoSelecionadoId,
                              ) && (
                                <option value={equipamentoSelecionadoId}>
                                  [Kit Vinculado ao Cliente] IMEI: {rastreadorImei || "Vinculado"} |
                                  Chip: {chipIccid || "Vinculado"} ({chipOperadora})
                                </option>
                              )}
                            {equipamentosHabilitados.map((eq) => (
                              <option key={eq.rastreador_id} value={eq.rastreador_id}>
                                IMEI: {eq.imei} | Chip: {eq.iccid} ({eq.operadora}) - {eq.modelo}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Dados de Conectividade M2M e Rastreador */}
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            IMEI do Rastreador (15 dígitos) *
                          </label>
                          <input
                            type="text"
                            maxLength={15}
                            value={rastreadorImei}
                            onChange={(e) => setRastreadorImei(e.target.value.replace(/\D/g, ""))}
                            placeholder="Ex: 864502049182341"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-orange-700 dark:text-orange-400 focus:outline-none focus:border-orange-500 transition shadow-inner"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            Modelo do Rastreador
                          </label>
                          <input
                            type="text"
                            value={rastreadorModelo}
                            onChange={(e) => setRastreadorModelo(e.target.value)}
                            placeholder="Ex: J16 4G"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            Operadora M2M
                          </label>
                          <select
                            value={chipOperadora}
                            onChange={(e) => setChipOperadora(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                          >
                            <option value="Algar">Algar Telecom</option>
                            <option value="Vivo">Vivo M2M</option>
                            <option value="Claro">Claro M2M</option>
                            <option value="TIM">TIM M2M</option>
                            <option value="Arqia">Arqia / Datora</option>
                            <option value="Vodafone/Kore">Vodafone / Kore</option>
                            <option value="Multi-Operadora">Multi-Operadora (eSIM)</option>
                            <option value="Outra">Outra Operadora</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            Linha Telefônica M2M
                          </label>
                          <input
                            type="text"
                            value={chipLinha}
                            onChange={(e) => setChipLinha(e.target.value)}
                            placeholder="(24) 99999-0000"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                            ICCID do Chip (19-20 dígitos)
                          </label>
                          <input
                            type="text"
                            maxLength={22}
                            value={chipIccid}
                            onChange={(e) => setChipIccid(e.target.value.replace(/\D/g, ""))}
                            placeholder="8955..."
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grid 3: Dados do Veículo Vinculado ao Contrato / Comodato */}
                    {!isEdicao ||
                    veiculosExistentes.length === 0 ||
                    veiculosExistentes.length === 1 ||
                    veiculosExistentes.some((v) => !v.placa || v.placa === "A DEFINIR") ? (
                      <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                            Veículo Vinculado ao Contrato
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              Símbolo 3D:
                            </span>
                            <Vehicle3DGraphic tipo={tipoVeiculoInicial} size={28} />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              Tipo de Veículo *
                            </label>
                            <select
                              value={tipoVeiculoInicial}
                              onChange={(e) => setTipoVeiculoInicial(e.target.value as TipoVeiculo)}
                              className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                            >
                              {LISTA_TIPOS_VEICULO.map((tv) => (
                                <option key={tv.id} value={tv.id}>
                                  {tv.label} ({tv.descricao})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              {(tipoVeiculoInicial as string) === "maquina" ||
                              (tipoVeiculoInicial as string) === "trator" ||
                              (tipoVeiculoInicial as string) === "moto_eletrica"
                                ? "Placa (Opcional p/ máquinas e motos elétricas)"
                                : "Placa"}
                            </label>
                            <input
                              type="text"
                              maxLength={10}
                              value={placaInicial}
                              onChange={(e) => setPlacaInicial(e.target.value.toUpperCase())}
                              placeholder={
                                (tipoVeiculoInicial as string) === "maquina" ||
                                (tipoVeiculoInicial as string) === "trator" ||
                                (tipoVeiculoInicial as string) === "moto_eletrica"
                                  ? "Opcional (Chassi/Nº)"
                                  : "ABC1D23"
                              }
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 uppercase focus:outline-none focus:border-orange-500 transition shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              Chassi{" "}
                              {(tipoVeiculoInicial as string) === "moto_eletrica" ||
                              (tipoVeiculoInicial as string) === "maquina" ||
                              (tipoVeiculoInicial as string) === "trator"
                                ? "(6 dígitos p/ mapa)"
                                : ""}
                            </label>
                            <input
                              type="text"
                              maxLength={25}
                              value={chassiInicial}
                              onChange={(e) => setChassiInicial(e.target.value.toUpperCase())}
                              placeholder="Últimos 6 dígitos p/ mapa"
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 uppercase focus:outline-none focus:border-orange-500 transition shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              Marca / Modelo
                            </label>
                            <input
                              type="text"
                              value={marcaModeloInicial}
                              onChange={(e) => setMarcaModeloInicial(e.target.value)}
                              placeholder="Ex: Toyota Corolla"
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              Ano
                            </label>
                            <input
                              type="number"
                              value={anoInicial || ""}
                              onChange={(e) =>
                                setAnoInicial(e.target.value ? Number(e.target.value) : undefined)
                              }
                              placeholder="2024"
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                              Cor
                            </label>
                            <input
                              type="text"
                              value={corInicial}
                              onChange={(e) => setCorInicial(e.target.value)}
                              placeholder="Ex: Prata"
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 transition shadow-inner"
                            />
                          </div>
                        </div>

                        {/* Suporte Especial a Horímetro para Veículos Tipo Máquina */}
                        {((tipoVeiculoInicial as string) === "maquina" ||
                          (tipoVeiculoInicial as string) === "trator") && (
                          <div className="mt-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                            <div className="space-y-0.5">
                              <span className="text-xs font-black text-amber-500 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Veículo Operado por Horímetro (Horas)</span>
                              </span>
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                Máquinas não utilizam quilometragem (KM). Todo o controle
                                operacional, telemetria e manutenções preventivas serão calculados
                                por horas de funcionamento.
                              </p>
                            </div>
                            <div className="w-full sm:w-44 shrink-0">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                                Horímetro Inicial (h) *
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={horimetroInicial}
                                onChange={(e) => setHorimetroInicial(Number(e.target.value))}
                                placeholder="0.0"
                                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-500/50 rounded-xl text-xs font-mono font-bold text-amber-500 focus:outline-none focus:border-amber-400 shadow-inner"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                            <span>
                              O rastreador e chip configurados serão vinculados à frota ativa e à
                              ordem de serviço deste cliente.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Acesso do Cliente ao Sistema (Login e Senha) — Sempre Visível */}
              <div className="space-y-2.5 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Key className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Acesso do Cliente ao Sistema
                    </label>
                  </div>

                  {!isEdicao ? (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={criarUsuario}
                        onChange={(e) => setCriarUsuario(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-orange-600 focus:ring-orange-500"
                      />
                      <span>Liberar login agora</span>
                    </label>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={alterarSenha || (!clienteEdicao?.user_id && criarUsuario)}
                        onChange={(e) => {
                          setAlterarSenha(e.target.checked);
                          if (!clienteEdicao?.user_id) {
                            setCriarUsuario(e.target.checked);
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-orange-600 focus:ring-orange-500"
                      />
                      <span>
                        {clienteEdicao?.user_id ? "Redefinir Senha de Acesso" : "Criar Login Agora"}
                      </span>
                    </label>
                  )}
                </div>

                {/* Bloco de Definição de Senha */}
                {((!isEdicao && criarUsuario) ||
                  (isEdicao && (alterarSenha || (!clienteEdicao?.user_id && criarUsuario)))) && (
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800/80 space-y-2.5 animate-fadeIn shadow-xs">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {isEdicao
                        ? "Defina uma nova senha para o cliente. As credenciais serão sincronizadas imediatamente."
                        : "O cliente poderá acessar imediatamente o aplicativo e web utilizando o e-mail cadastrado acima."}
                    </p>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {isEdicao ? "Nova Senha de Acesso" : "Senha Inicial de Acesso"} *
                        </label>
                        <button
                          type="button"
                          onClick={gerarSenhaForte}
                          className="text-[10px] text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-semibold flex items-center gap-1 transition"
                        >
                          <RefreshCw className="h-3 w-3" /> Gerar Senha Forte
                        </button>
                      </div>
                      <input
                        type="text"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                      />
                    </div>
                  </div>
                )}

                {isEdicao && !alterarSenha && clienteEdicao?.user_id && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-300/60 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 shadow-xs">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                      <span>Login ativo vinculado ao e-mail {clienteEdicao.email}</span>
                    </div>
                    <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                      Conta Ativa
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Seleção do Plano Comercial */}
              <div className="space-y-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Plano Comercial do Cliente
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "basico", label: "Básico", hist: "7 dias", ret: "10 dias" },
                    { id: "pro", label: "Pro", hist: "15 dias", ret: "20 dias" },
                    { id: "master", label: "Master", hist: "30 dias", ret: "35 dias" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selecionarPlano(p.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition shadow-xs ${
                        plano === p.id
                          ? "bg-orange-500/15 border-orange-500/50 text-orange-700 dark:text-orange-300 shadow"
                          : "bg-white dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="font-bold text-xs capitalize">{p.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {p.hist} visíveis
                      </div>
                      <div className="text-[9px] text-orange-600 dark:text-orange-400 font-mono">
                        ({p.ret} no banco)
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Dados Financeiros */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dia do Vencimento
                  </label>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {[5, 10, 15, 25].map((dia) => (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => setDiaVencimento(dia)}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition border cursor-pointer ${
                          Number(diaVencimento) === dia
                            ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                            : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300/60 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        {dia}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={diaVencimento}
                    onChange={(e) => setDiaVencimento(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                    placeholder="Outro dia (1-31)"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 leading-tight">
                    {isEdicao
                      ? `Ao alterar o dia de vencimento, todas as faturas e cobranças futuras pendentes deste cliente serão automaticamente recalculadas para o dia ${diaVencimento}.`
                      : new Date().getDate() > Number(diaVencimento)
                        ? `Como o dia ${diaVencimento} ja passou neste mes, a 1ª fatura vencera no proximo mes com a pro-rata dos dias restantes.`
                        : `1ª fatura com vencimento no dia ${diaVencimento} do mes atual.`}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Valor da Mensalidade (R$)
                  </label>
                  <MoedaInput
                    value={valorMensalidade}
                    onChange={setValorMensalidade}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Taxa Instalação e Ativação
                    </label>
                    <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase">
                      No Ato
                    </span>
                  </div>
                  <MoedaInput
                    value={taxaInstalacao}
                    onChange={setTaxaInstalacao}
                    onBlur={handleBlurTaxaInstalacao}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono shadow-xs"
                    placeholder="350,00"
                    title="Paga no ato da contratação. Caso altere, o sistema permite salvar como novo padrão global para todos."
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Padrão: R$ 350,00
                  </p>
                </div>
              </div>

              {/* 6. Gestão Contratual, Vigência e Emissão de Contrato */}
              <div className="space-y-3 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Contrato de Prestação de Serviços e Vigência
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Defina o prazo de vigência, regras de renovação e emita o contrato formal em
                      PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBaixarContrato}
                    disabled={gerandoPdf}
                    className="px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/40 text-orange-700 dark:text-orange-300 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {gerandoPdf ? "Gerando PDF..." : "Baixar Contrato (PDF)"}
                  </button>
                </div>

                {/* Grid: Fidelidade Contratual e Regra de Horímetro */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Fidelidade Contratual
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTemFidelidade(true)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border ${
                          temFidelidade
                            ? "bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-400"
                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Com Fidelidade
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemFidelidade(false)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border ${
                          !temFidelidade
                            ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-400"
                            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Sem Fidelidade
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {temFidelidade
                        ? "Plano padrão com comodato de equipamento e carência."
                        : "Livre de carência. Cliente pode cancelar sem multa contratual."}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Horímetro Operacional</span>
                    </label>
                    <div className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                        <span className="font-semibold">Horas com Ignição Ligada</span>
                      </div>
                      <span className="text-[10px] font-mono text-orange-600 dark:text-orange-400 font-bold uppercase">
                        Automático
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Acumula automaticamente o tempo de operação sempre que o motor estiver ligado.
                    </span>
                  </div>
                </div>

                {/* Tempo de Contrato (Vigência) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Tempo de Contrato (Meses de Vigência)
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[
                      { m: 12, label: "12 Meses (1 Ano)" },
                      { m: 24, label: "24 Meses (2 Anos)" },
                      { m: 36, label: "36 Meses (3 Anos)" },
                      { m: 48, label: "48 Meses (4 Anos)" },
                    ].map((item) => (
                      <button
                        key={item.m}
                        type="button"
                        onClick={() => {
                          setMesesContrato(item.m);
                          if (tipoRenovacao === "mesma_vigencia") {
                            setMesesRenovacao(item.m);
                          }
                        }}
                        className={`p-2 rounded-xl text-xs font-bold transition border shadow-xs ${
                          mesesContrato === item.m
                            ? "bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-400"
                            : "bg-white dark:bg-slate-900 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data de Início do Contrato */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Data de Início da Vigência
                    </label>
                    <input
                      type="date"
                      value={dataInicioContrato}
                      onChange={(e) => setDataInicioContrato(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Regra de Renovação do Contrato
                    </label>
                    <select
                      value={tipoRenovacao}
                      onChange={(e) => {
                        const t = e.target.value as TipoRenovacaoContrato;
                        setTipoRenovacao(t);
                        if (t === "mesma_vigencia") {
                          setMesesRenovacao(mesesContrato);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                    >
                      <option value="mesma_vigencia">
                        Mesmo período contratado ({mesesContrato} meses)
                      </option>
                      <option value="tempo_personalizado">
                        Informar tempo de renovação personalizado
                      </option>
                      <option value="mensal_ate_cancelamento">
                        Automático mês a mês até cancelamento
                      </option>
                    </select>
                  </div>

                  {tipoRenovacao === "tempo_personalizado" && (
                    <div className="mt-2 p-2.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 shadow-xs">
                      <label className="block text-[11px] text-slate-700 dark:text-slate-300 mb-1">
                        Quantidade de Meses por Ciclo de Renovação:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={mesesRenovacao}
                        onChange={(e) => setMesesRenovacao(Math.max(1, Number(e.target.value)))}
                        className="w-32 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 shadow-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Quadro Informativo de Foro e Geração de Parcelas */}
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800/80 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Foro de Eleição Mandatório:
                    </span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      Comarca de Volta Redonda/RJ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Taxa de Instalação e Ativação (No Ato):
                    </span>
                    <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                      R$ {Number(taxaInstalacao || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Parcelas Contratadas:
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {mesesContrato}x de R$ {Number(valorMensalidade || 0).toFixed(2)} (Total: R${" "}
                      {(mesesContrato * Number(valorMensalidade || 0)).toFixed(2)})
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                    <span>
                      Ao salvar, a <b>Taxa de Instalação e Ativação</b> e as{" "}
                      <b>{mesesContrato} parcelas mensais</b> com vencimento todo dia{" "}
                      <b>{diaVencimento}</b> serão geradas automaticamente no sistema.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações do Rodapé Fixo na Base */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-[#eaf0f8]/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div>
                {isEdicao && clienteEdicao && session?.isAdmin && (
                  <button
                    type="button"
                    onClick={() => setModalExclusaoAberto(true)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition min-h-[44px] flex items-center justify-center gap-1.5 shadow-xs"
                    title="Excluir cliente e todos os seus vínculos"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Excluir Cliente</span>
                  </button>
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={onFechar}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 border border-slate-300/60 dark:border-slate-700/60 transition min-h-[44px] flex items-center justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white transition shadow disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                >
                  {salvando ? "Salvando..." : isEdicao ? "Salvar Alterações" : "Cadastrar Cliente"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {modalHistoricoAberto && clienteEdicao && (
          <HistoricoClienteModal
            cliente={clienteEdicao}
            onFechar={() => setModalHistoricoAberto(false)}
          />
        )}

        {veiculoParaBloqueioSeguro && (
          <ModalBloqueioSeguroVeiculo
            veiculo={veiculoParaBloqueioSeguro}
            onConfirmarBloqueio={async (veiculoId, bloquear) => {
              const res = await bloquearDesbloquearVeiculo(veiculoId, bloquear);
              await recarregarVeiculos();
              return res.success;
            }}
            onFechar={() => {
              setVeiculoParaBloqueioSeguro(null);
              recarregarVeiculos();
            }}
          />
        )}

        {modalExclusaoAberto && clienteEdicao && (
          <ModalPortal>
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
              <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
                <div className="p-4 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/60 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Excluir Cliente
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                        Ação destrutiva e irreversível
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 overflow-y-auto space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>Atenção: Remoção Permanente</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Você está prestes a excluir permanentemente o cadastro de{" "}
                      <b className="font-semibold text-rose-900 dark:text-rose-200">
                        {clienteEdicao.nome_razao_social}
                      </b>
                      {clienteEdicao.documento && ` (${clienteEdicao.documento})`}.
                    </p>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-300/60 dark:border-slate-800/60 space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Esta operação executará automaticamente:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-500 dark:text-slate-400">
                      <li>Exclusão de todos os veículos e liberação de rastreadores.</li>
                      <li>Exclusão do histórico de viagens, telemetrias e agendamentos.</li>
                      <li>Cancelamento das parcelas contratuais e transações financeiras.</li>
                      <li>Remoção da conta de login e acesso ao sistema.</li>
                    </ul>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 flex justify-end gap-2 bg-[#eaf0f8]/80 dark:bg-slate-950/60 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalExclusaoAberto(false)}
                    disabled={excluindoCliente}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarExclusaoCliente}
                    disabled={excluindoCliente}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Trash2 className={`h-3.5 w-3.5 ${excluindoCliente ? "animate-spin" : ""}`} />
                    <span>{excluindoCliente ? "Excluindo..." : "Confirmar Exclusão"}</span>
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Leitor de Código de Barras por Câmera para Seleção Rápida de Kit */}
        {scannerKitAberto && (
          <CameraBarcodeScannerModal
            open={scannerKitAberto}
            onClose={() => setScannerKitAberto(false)}
            titulo="Escanear Código da Caixa do Rastreador"
            subtitulo="Aponte a câmera para o código de barras contendo o IMEI para selecionar o kit."
            onScanSucesso={(codigo) => {
              const codigoLimpo = codigo.replace(/\D/g, "");
              const encontrado = equipamentosHabilitados.find(
                (eq) => eq.imei.replace(/\D/g, "") === codigoLimpo,
              );
              if (encontrado) {
                handleSelecionarEquipamento(encontrado);
              } else {
                setRastreadorImei(codigoLimpo);
                toast.warning(
                  `IMEI ${codigoLimpo} identificado, mas não possui chip vinculado no estoque. Vincule no módulo de Estoque para habilitar.`,
                );
              }
            }}
          />
        )}

        {/* Modal de Distribuição de Instalações e Equipamentos por Veículo */}
        {modalDistribuirAberto && clienteEdicao?.id && (
          <ModalDistribuirInstalacoesVeiculos
            clienteId={clienteEdicao.id}
            clienteNome={clienteEdicao.nome_razao_social}
            instaladorPadraoId={instaladorId}
            aberto={modalDistribuirAberto}
            onFechar={() => setModalDistribuirAberto(false)}
            onSucesso={async () => {
              setModalDistribuirAberto(false);
              await recarregarVeiculos();
              await recarregarEquipamentos();
            }}
          />
        )}
      </div>
    </ModalPortal>
  );
}
