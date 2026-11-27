export type TipoVeiculo =
  | "jetski"
  | "carro"
  | "suv"
  | "camionete"
  | "caminhao"
  | "onibus"
  | "van"
  | "ambulancia"
  | "moto"
  | "moto_eletrica"
  | "quadriciculo"
  | "triciclo"
  | "maquina"
  | "trator"
  | "equipamento"
  | "propriedade"
  | "posto"
  | "pessoa"
  | "vigilante"
  | "portatil"
  | "ronda"
  | "outro";

export interface VeiculoGps {
  id: string;
  cliente_id: string;
  cliente_user_id?: string | null;
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_plano?: string;
  privacidade_localizacao?: boolean;
  placa: string;
  chassi?: string | null;
  marca_modelo: string;
  cor?: string;
  ano?: number;
  tipo_veiculo?: TipoVeiculo;
  ignicao: boolean;
  ignicao_status?: boolean;
  gps_fixado?: boolean;
  bloqueado: boolean;
  bloqueador_instalado?: boolean;
  tipo_bloqueador?: "rele_combustivel" | "outro" | "sem_bloqueador" | null;
  bloqueador_detalhes?: string | null;
  sinal_gsm?: number;
  rele_status?: boolean;
  velocidade: number;
  odometro: number; // Odômetro Oficial do Sistema (Medidor 7: Média Fusional em Tempo Real)
  odometro_wgs84_km?: number | null; // Medidor 1: Geodésico Elipsoidal WGS-84 Base
  odometro_cinematico_km?: number | null; // Medidor 2: Cinemático paralelo acumulado por integração v * dt
  odometro_hardware_km?: number | null; // Medidor 3: Interno acumulado pela MCU do J16 (MILEAGE#)
  odometro_hardware_atualizado_em?: string | null; // Data e hora ISO da última leitura física da MCU
  odometro_motor_a_km?: number | null; // Medidor 4: Motor A - Fusão Bayesiana 1D persistida 24/7
  odometro_motor_b_km?: number | null; // Medidor 5: Motor B - Haversine Esférico persistido 24/7
  odometro_motor_c_km?: number | null; // Medidor 6: Motor C - EKF 1D Canônico Taylor 4ª Ordem persistido 24/7
  odometro_motor_media_km?: number | null; // Medidor 7: Média Fusional Consensual (M1+M4+M5+M6)/4
  odometro_motor_a_pesos?: { gnssOuArco: number; cinematico: number; mcuJ16: number } | null;
  odometro_motor_b_pesos?: { gnssOuArco: number; cinematico: number; mcuJ16: number } | null;
  odometro_motor_c_pesos?: { gnssOuArco: number; cinematico: number; mcuJ16: number } | null;
  odometro_motor_a_estado?: string | null;
  odometro_motor_b_estado?: string | null;
  odometro_motor_c_estado?: string | null;
  horimetro?: number;
  horimetro_horas?: number;
  tipo_medicao?: "km" | "horimetro";
  regra_horimetro?: "pos_chave" | "ignicao";
  horimetro_modo?: "pos_chave" | "ignicao_ligada";
  latitude: number;
  longitude: number;
  voltagem?: number; // Compatibilidade com campo voltagem
  bateria_veiculo_v?: number; // Tensão da bateria do veículo em Volts (ex: 12.6V, 24.0V)
  bateria_rastreador_pct?: number; // Carga da bateria interna do rastreador (0 a 100%)
  bateria_rastreador_status?:
    "carregando" | "completa" | "bateria_interna" | "critica" | "desconhecido";
  alimentacao_externa?: boolean; // True se ligado na bateria do carro (VCC), false se na bateria de backup
  satelites?: number;
  rumo?: number;
  inclinacao_graus?: number;
  vibracao_g?: number;
  alerta_acidente?: boolean;
  alerta_tipo?: string;
  ultima_atualizacao: string;
  status_operacional: "em_rota" | "parado_ligado" | "estacionado" | "bloqueado";
  rastreador_id?: string | null;
  rastreador_imei?: string | null;
  rastreador_modelo?: string | null;
}

export type MapEngine = "leaflet" | "maplibre";
export type ModoVisualizacao = "2D" | "3D";
export type MapTheme = "dark" | "streets" | "satellite";

export interface PosicaoHistorico {
  id: number;
  latitude: number;
  longitude: number;
  velocidade: number;
  ignicao: boolean;
  odometro?: number;
  bateria_veiculo_v?: number;
  bateria_rastreador_pct?: number;
  rumo?: number;
  inclinacao_graus?: number;
  vibracao_g?: number;
  data_hora_gps: string;
}

export interface TrajetoViagem {
  id: string;
  veiculo_id: string;
  inicio_at: string;
  fim_at: string | null;
  km_percorrido: number;
  velocidade_media: number;
  velocidade_maxima: number;
  status: string;
}

export interface AlertaSeguranca {
  id: string;
  veiculo_id: string;
  cliente_id: string;
  cliente_nome?: string;
  cliente_documento?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_plano?: string;
  tipo:
    | "colisao_impacto"
    | "capotamento_inclinacao"
    | "parada_repentina_colisao"
    | "comportamento_anormal"
    | "bateria_desconectada"
    | string;
  gravidade: "critica" | "alta" | "media";
  latitude: number;
  longitude: number;
  velocidade: number;
  vibracao_g: number;
  inclinacao_graus: number;
  detalhes: string;
  reconhecido: boolean;
  created_at: string;
  placa?: string;
  marca_modelo?: string;
}

export interface ParadaJornada {
  id: string;
  ordem: number;
  indicePonto: number;
  latitude: number;
  longitude: number;
  inicio_at: string;
  fim_at: string;
  duracaoMinutos: number;
  duracaoFormatada: string;
  endereco?: string;
}

export interface JornadaConsolidada {
  viagemInicioId: string;
  viagemFimId: string;
  ciclos: TrajetoViagem[];
  inicio_at: string;
  fim_at: string;
  kmTotal: number;
  tempoTransitoMinutos: number;
  tempoParadoMinutos: number;
  velocidadeMedia: number;
  velocidadeMaxima: number;
  paradas: ParadaJornada[];
  retornouAoInicio: boolean;
  distanciaRetornoMetros: number;
}
