import type { ModoPerfilEmulado, ItemModoPerfil } from "../types";

export const MODOS_PERFIS_DISPONIVEIS: ItemModoPerfil[] = [
  {
    id: "superadmin",
    rotulo: "SuperADM (Visão Global Irrestrita)",
    descricao: "Governança completa, todos os clientes, veículos e infraestrutura",
    icone: "ShieldCheck",
  },
  {
    id: "operador",
    rotulo: "Operador de Monitoramento",
    descricao: "Cockpit GPS, rastreamento de veículos, rotas, abastecimento e frota",
    icone: "Headphones",
  },
  {
    id: "supervisor_geral",
    rotulo: "Supervisor Geral (Veículos e Vigilantes)",
    descricao: "Operador completo com frotas mais escalas e postos de vigilantes",
    icone: "Car",
  },
  {
    id: "supervisor_vigilante",
    rotulo: "Supervisor de Vigilante (Postos Fixos)",
    descricao: "Exclusivo vigilância patrimonial, postos fixos, rondas e escalas",
    icone: "Shield",
  },
  {
    id: "vigilante",
    rotulo: "Vigilante (Rondas e Escala Tática)",
    descricao: "Visão operacional do vigilante no celular e pontos azuis",
    icone: "Footprints",
  },
  {
    id: "instalador",
    rotulo: "Instalador Técnico",
    descricao: "Apenas instalações técnicas, ordens de serviço e fotos",
    icone: "Wrench",
  },
  {
    id: "motorista",
    rotulo: "Motorista",
    descricao: "Abastecimento, manutenção preventiva e rotas inteligentes",
    icone: "Truck",
  },
  {
    id: "financeiro",
    rotulo: "Financeiro",
    descricao: "Gestão de caixa, mensalidades, faturas PIX e DRE",
    icone: "DollarSign",
  },
  {
    id: "revendedor",
    rotulo: "Revendedor (Franquia)",
    descricao: "Painel da franquia parceira, vendedores vinculados e propostas",
    icone: "Building",
  },
  {
    id: "vendedor",
    rotulo: "Vendedor Autorizado",
    descricao: "Minhas vendas, comissões de rastreamento e propostas",
    icone: "Briefcase",
  },
  {
    id: "superadmin_auditor",
    rotulo: "S.adm Auditor (Consulta Read-Only)",
    descricao: "Auditoria forense e inspeção com bloqueio estrito de escrita",
    icone: "Eye",
  },
  {
    id: "cliente",
    rotulo: "Cliente (Titular Plano Master)",
    descricao: "Visão do cliente titular com veículos próprios e mensalidades",
    icone: "UserCheck",
  },
  {
    id: "cliente_degustacao",
    rotulo: "Cliente Degustação (Trial Master 24h)",
    descricao: "Experiência de degustação comercial do Plano Master",
    icone: "Sparkles",
  },
];

export function obterRotuloModoPerfil(modo: ModoPerfilEmulado): string {
  const item = MODOS_PERFIS_DISPONIVEIS.find((m) => m.id === modo);
  return item ? item.rotulo : "SuperADM";
}

/**
 * Perfis disponíveis estritamente para emulação pelo SuperADM.
 * Exclui o próprio SuperADM pois o administrador já é o SuperADM por definição.
 */
export const MODOS_PERFIS_EMULAVEIS: ItemModoPerfil[] = MODOS_PERFIS_DISPONIVEIS.filter(
  (m) => m.id !== "superadmin",
);
