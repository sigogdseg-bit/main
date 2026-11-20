export interface PlanoManutencaoItem {
  id: string;
  veiculo_id: string;
  item_manutencao: string;
  intervalo_km: number;
  intervalo_meses?: number;
  ultimo_km_realizado: number;
  ultima_data_realizada?: string;
  proximo_km_alvo: number;
  proxima_data_alvo?: string;
  aviso_antecipado_km: number;
  status: "em_dia" | "proxima" | "vencida";
  created_at: string;
  // Campos vinculados do veículo
  cliente_id?: string;
  placa?: string;
  marca_modelo?: string;
  tipo_veiculo?: string;
  tipo_medicao?: "km" | "horimetro";
  odometro_atual?: number;
  horimetro_atual?: number;
  km_restante?: number;
}

export interface AgendamentoManutencao {
  id: string;
  cliente_id: string;
  veiculo_id: string;
  item_manutencao: string;
  data_sugerida: string;
  turno: "manha" | "tarde";
  oficina_parceira?: string;
  observacoes?: string;
  status: "solicitado" | "confirmado" | "concluido" | "cancelado";
  created_at: string;
  placa?: string;
  cliente_nome?: string;
}

export interface NovoAgendamentoPayload {
  veiculo_id: string;
  cliente_id: string;
  item_manutencao: string;
  data_sugerida: string;
  turno: "manha" | "tarde";
  oficina_parceira?: string;
  observacoes?: string;
}

export interface ClienteManutencaoResumo {
  id: string;
  nome_razao_social: string;
  documento?: string | null;
  telefone?: string | null;
  plano: string;
  total_veiculos: number;
}

export interface VeiculoManutencaoResumo {
  id: string;
  cliente_id: string;
  placa: string;
  marca_modelo: string;
  tipo_veiculo?: string;
  tipo_medicao?: "km" | "horimetro";
  odometro_km: number;
  horimetro?: number;
  ano_fabricacao?: number | null;
  cor?: string | null;
  itens_alerta_count?: number;
  itens_vencidos_count?: number;
}

export interface SalvarItemManutencaoPayload {
  id?: string;
  veiculo_id: string;
  item_manutencao: string;
  intervalo_km: number;
  aviso_antecipado_km: number;
  ultimo_km_realizado: number;
}

export interface AlertaWhatsAppInfo {
  clienteNome: string;
  telefone?: string | null;
  placa: string;
  marcaModelo: string;
  odometroAtual: number;
  itemManutencao: string;
  proximoKmAlvo: number;
  kmRestante: number;
  status: "proxima" | "vencida";
}

export type FormaPagamentoManutencao =
  "pix" | "cartao_credito" | "cartao_debito" | "dinheiro" | "boleto" | "outro";

export type { CategoriaDespesa } from "@/features/motoristas/types";

export interface HistoricoManutencaoGasto {
  id: string;
  veiculo_id: string;
  cliente_id: string;
  motorista_id?: string | null;
  motorista_nome?: string | null;
  veiculo_placa?: string | null;
  data_despesa: string;
  categoria: string;
  descricao: string;
  valor: number;
  km_atual?: number | null;
  odometro_km?: number | null;
  forma_pagamento?: string | null;
  oficina_prestador?: string | null;
  plano_manutencao_id?: string | null;
  tipo_despesa?: string | null;
  nf_numero?: string | null;
  nf_foto_url?: string | null;
  comprovante_url?: string | null;
  nf_upload_em?: string | null;
  nf_baixado?: boolean;
  nf_baixado_em?: string | null;
  nf_expirado?: boolean;
  observacoes?: string | null;
  created_at: string;
}

export interface ConcluirManutencaoPayload {
  itemId: string;
  veiculoId: string;
  clienteId: string;
  itemNome: string;
  odometroKm: number;
  intervaloKm: number;
  valorTotal: number;
  formaPagamento: FormaPagamentoManutencao | string;
  dataRealizacao: string;
  oficina?: string;
  nfNumero?: string;
  observacoes?: string;
  nfFile?: File | null;
  motoristaId?: string;
}

export interface LancarGastoVeiculoPayload {
  veiculoId: string;
  clienteId: string;
  descricao: string;
  categoria: string;
  tipoDespesa?: string;
  valorTotal: number;
  formaPagamento: FormaPagamentoManutencao | string;
  odometroKm?: number | null;
  dataRealizacao?: string;
  dataDespesa?: string;
  oficina?: string;
  nfNumero?: string;
  observacoes?: string;
  nfFile?: File | null;
  motoristaId?: string;
  planoManutencaoId?: string;
}
