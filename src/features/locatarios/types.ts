export interface LocatarioCliente {
  id: string;
  cliente_id: string;
  user_id?: string | null;
  nome: string;
  email: string;
  telefone?: string | null;
  cpf_cnpj?: string | null;
  veiculos_permitidos: string[];
  pode_bloquear: boolean;
  pode_desbloquear: boolean;
  pode_bloquear_desbloquear?: boolean;
  ativo: boolean;
  convite_token?: string | null;
  convite_expira_em?: string | null;
  created_at?: string;
  updated_at?: string;
  cliente_nome?: string;
}

export interface DadosCadastroLocatario {
  nome: string;
  email: string;
  telefone?: string;
  cpf_cnpj?: string;
  veiculos_permitidos: string[];
  pode_bloquear: boolean;
  pode_desbloquear: boolean;
  pode_bloquear_desbloquear?: boolean;
  senha?: string;
}

export interface ConviteLocatarioResultado {
  success: boolean;
  message: string;
  link?: string;
  url_convite?: string;
  token?: string;
  locatario_id?: string;
}

export interface ValidacaoConviteLocatario {
  valido: boolean;
  mensagem?: string;
  cliente_nome?: string;
  pode_bloquear?: boolean;
  pode_desbloquear?: boolean;
  pode_bloquear_desbloquear?: boolean;
  veiculos_disponiveis?: {
    id: string;
    placa: string;
    marca_modelo: string;
  }[];
}
