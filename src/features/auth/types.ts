import type { HunterRole, PlanoCliente } from "@/integrations/supabase/types";

export interface ClienteEmulado {
  id: string;
  nome: string;
  userId?: string;
  documento?: string;
  plano?: PlanoCliente;
  telefone?: string;
}

export interface UserSession {
  userId: string;
  email: string;
  nome: string;
  role: HunterRole;
  plano?: PlanoCliente;
  planoContratado?: PlanoCliente;
  isTrialMaster?: boolean;
  diasRestantesTrial?: number;
  clienteId?: string;
  clienteCreatedAt?: string;
  modulos: string[];
  isSuperAdmin: boolean;
  isSuperAdminAuditor?: boolean;
  isAuditor?: boolean;
  isReadOnly?: boolean;
  isDegustacao?: boolean;
  degustacaoPrimeiroAcessoEm?: string;
  degustacaoExpiraEm?: string;
  degustacaoRevalidadaEm?: string;
  isAdmin: boolean;
  isOperador: boolean;
  isCliente: boolean;
  isInstalador: boolean;
  isMotorista: boolean;
  isVigilante?: boolean;
  isFuncionario?: boolean;
  isLocatario?: boolean;
  locatarioClienteId?: string;
  veiculosPermitidos?: string[];
  podeBloquear?: boolean;
  podeDesbloquear?: boolean;
  podeBloquearDesbloquear?: boolean;
  isFinanceiro?: boolean;
  isRevendedor?: boolean;
  isVendedor?: boolean;
  revendedorId?: string;
  vendedorId?: string;
  acessoMapaMotorista?: boolean;
  valorPorInstalacao?: number;
  valor_instalacao_sem_bloqueador?: number;
  valor_instalacao_com_bloqueador?: number;
  chavePix?: string;
  enderecoInstalacao?: string;
  mapThemePreference?: "streets" | "dark" | "satellite";
  primeiroAcesso?: boolean;
  visivelNoChat?: boolean;
}

export interface LoginAuditPayload {
  sessionId: string;
  userId?: string;
  email: string;
  role: string;
  status: "sucesso" | "falha";
  userAgent?: string;
}
