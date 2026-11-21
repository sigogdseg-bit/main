export interface Vigilante {
  id: string;
  nome: string;
  cpf?: string | null;
  matricula?: string | null;
  telefone?: string | null;
  email?: string | null;
  usuario_id?: string | null;
  turno_padrao: "diurno" | "noturno" | "12x36" | "24x48" | "personalizado";
  ativo: boolean;
  observacoes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PostoVigilancia {
  id: string;
  cliente_id?: string | null;
  nome: string;
  endereco?: string | null;
  latitude: number;
  longitude: number;
  raio_metros: number;
  perimetro_poligono?: {
    type: "Polygon";
    coordinates: [number, number][]; // [[lat, lng], ...]
  } | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RondaCheckpoint {
  id: string;
  posto_id: string;
  nome: string;
  latitude: number;
  longitude: number;
  ordem: number;
  horario_previsto?: string; // Legado: "HH:MM:SS" ou "HH:MM"
  tempo_deslocamento_minutos?: number; // Tempo calculado ou configurado a partir do ponto anterior
  distancia_metros?: number; // Distância metros a partir do ponto anterior
  tolerancia_minutos: number; // Padrão estrito: 3 minutos (ajustável pelo operador/adm)
  raio_captura_metros: number; // Padrão cirúrgico: 15 metros (presença física estrita recomendada para GNSS civil)
  cor_marcador: string; // Padrão: '#2563eb' (Azul tático)
  ativo: boolean;
  created_at?: string;
}

export type StatusCheckinRonda = "pendente" | "conforme" | "atrasado" | "adiantado";

export interface CheckpointExecutado {
  checkpoint_id: string;
  ordem: number;
  nome: string;
  hora_prevista: string; // ISO ou HH:MM
  hora_realizada?: string | null; // ISO
  latitude_aferida?: number | null;
  longitude_aferida?: number | null;
  precisao_gps_metros?: number | null;
  distancia_aferida_metros?: number | null;
  status: StatusCheckinRonda;
}

export interface CicloRondaExecucao {
  id: string;
  posto_id: string;
  vigilante_id: string;
  turno_id?: string | null;
  ciclo_numero: number;
  ponto_partida_ordem: number;
  data_inicio: string; // ISO
  data_fim?: string | null; // ISO
  status: "em_andamento" | "concluido" | "interrompido";
  checkpoints_executados: CheckpointExecutado[];
  created_at?: string;
  updated_at?: string;
}

export interface TurnoVigilancia {
  id: string;
  vigilante_id: string;
  posto_id: string;
  rastreador_imei: string; // IMEI do rastreador pessoal portátil
  data_turno: string; // "YYYY-MM-DD"
  hora_inicio: string; // "HH:MM:SS"
  hora_fim: string; // "HH:MM:SS"
  status: "agendado" | "em_andamento" | "concluido" | "cancelado";
  created_at?: string;
  updated_at?: string;
  // Campos enriquecidos em joins
  vigilante?: Vigilante;
  posto?: PostoVigilancia;
}

export interface RegistroRonda {
  id: string;
  turno_id: string;
  checkpoint_id: string;
  vigilante_id: string;
  posto_id: string;
  data_ronda: string; // "YYYY-MM-DD"
  horario_previsto: string; // "HH:MM:SS"
  horario_realizado?: string | null;
  distancia_metros?: number | null;
  status: "pendente" | "realizado" | "atrasado" | "nao_realizado" | "fora_perimetro";
  alerta_disparado: boolean;
  alerta_whatsapp_enviado: boolean;
  created_at?: string;
  checkpoint?: RondaCheckpoint;
}

export interface TransmissaoPosicaoVigilante {
  postoId: string;
  postoNome?: string;
  vigilanteId: string;
  vigilanteNome?: string;
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
  velocidadeKmH?: number;
  cicloId?: string;
  timestamp?: string;
  statusRota?: "conforme" | "desvio" | "atrasado";
}

export interface AlertaRondaVigilante {
  id: string;
  postoId: string;
  postoNome?: string;
  vigilanteId: string;
  vigilanteNome?: string;
  tipo: "desvio_rota_vigilante" | "ausencia_checkpoint_vigilante";
  gravidade: "alta" | "critica";
  latitude: number;
  longitude: number;
  detalhes: string;
  distanciaMetros?: number;
  atrasoMinutos?: number;
  created_at: string;
  reconhecido?: boolean;
}
