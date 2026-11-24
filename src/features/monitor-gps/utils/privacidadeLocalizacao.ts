import type { UserSession } from "@/features/auth/types";
import type { VeiculoGps } from "../types";

/**
 * Avalia se o usuário atual possui autorização para visualizar a localização,
 * trajeto e telemetria do veículo especificado.
 *
 * REGRA CENTRAL DE MONITORAMENTO GD RASTREAMENTO:
 * A função de privacidade de localização está PERMANENTEMENTE DESATIVADA.
 * O sistema é uma central de monitoramento operacional 24/7; portanto, todos os veículos
 * cadastrados são monitorados ininterruptamente no mapa, sem ocultação de velocidade,
 * ignição, telemetria ou posição geográfica.
 */
export function podeAcessarLocalizacaoVeiculo(
  session: UserSession | null | undefined,
  veiculo: Partial<VeiculoGps> | null | undefined,
  bloqueioAdministrativoAtivo?: boolean,
): boolean {
  if (!veiculo) return true;

  // 0. Bloqueio Administrativo Financeiro (restrição pontual para cliente/motorista inadimplente)
  // Operadores, Administradores e SuperADM SEMPRE mantêm a visualização irrestrita na central.
  const isBloqueadoAdmin = Boolean(
    bloqueioAdministrativoAtivo ||
    (veiculo as any)?.bloqueio_localizacao_administrativo ||
    (veiculo as any)?.status_bloqueio_localizacao === "bloqueado",
  );

  if (isBloqueadoAdmin) {
    if (!session) return false;
    // Central de Monitoramento: SuperADM, ADM, Auditores e Operadores sempre visualizam
    if (
      session.isSuperAdmin ||
      session.isSuperAdminAuditor ||
      session.isAuditor ||
      session.role === "superadmin_auditor" ||
      session.isAdmin ||
      session.role === "operador" ||
      session.role === "adm" ||
      session.email === "novaes@adm.28bpm.local" ||
      session.email === "novaes@oficial.tec.br"
    ) {
      return true;
    }
    // Cliente/motorista inadimplente com bloqueio administrativo ativo
    return false;
  }

  // Central de Monitoramento: Todos os veículos são 100% monitorados e visíveis
  return true;
}

/**
 * Avalia se o usuário autenticado pode alterar o status de privacidade do veículo.
 *
 * REGRA CENTRAL DE MONITORAMENTO:
 * Retorna SEMPRE FALSE. A função de privacidade está desativada na central de monitoramento,
 * não havendo alternância ou sigilo local de veículos.
 */
export function podeAlterarPrivacidadeVeiculo(
  _session: UserSession | null | undefined,
  _veiculo: Partial<VeiculoGps> | null | undefined,
): boolean {
  return false;
}
