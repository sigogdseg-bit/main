export interface Vigilante {
  id: string;
  nome: string;
  cpf?: string | null;
  matricula?: string | null;
  telefone?: string | null;
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
  horario_previsto: string; // "HH:MM:SS" ou "HH:MM"
  tolerancia_minutos: number; // Padrão estrito: 3 minutos
  raio_captura_metros: number; // Padrão cirúrgico: 5 metros (presença física estrita recomendada para GNSS civil)
  cor_marcador: string; // Padrão: '#2563eb' (Azul tático)
  ativo: boolean;
  created_at?: string;
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
