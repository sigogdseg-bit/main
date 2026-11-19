// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Controle Canônico de Permissões de Módulos e Rotas (DJR-NEW)
// ─────────────────────────────────────────────────────────────────────────────
// Garante o isolamento estrito de perfis e governança:
// - SuperADM: Acesso irrestrito a todos os módulos e governança máxima imutável.
// - Administrador: Acesso a todos os módulos operacionais, gestão e infraestrutura.
// - Instalador: Acesso restrito e exclusivo ao módulo de instalações técnicas.
// - Cliente: Acesso restrito aos seus próprios veículos e serviços contratados.
// - Operador: Limitado ESTRITAMENTE aos módulos atribuídos pelo administrador.
//   Módulos não liberados NÃO aparecem em menus, hubs e são bloqueados nas rotas.
// ─────────────────────────────────────────────────────────────────────────────

import type { UserSession } from "@/features/auth/services/authService";

export interface ModuloDefinicao {
  id: string;
  nome: string;
  rota: string;
  exclusivoAdmin?: boolean;
  exclusivoSuperAdmin?: boolean;
}

export const MODULOS_SISTEMA_REGRAS: ModuloDefinicao[] = [
  { id: "monitor-gps", nome: "Mapa Operacional", rota: "/monitor-gps" },
  { id: "vigilantes", nome: "Módulo Vigilante e Rondas", rota: "/vigilantes" },
  { id: "rotas", nome: "Rotas e Trajetos Inteligentes", rota: "/rotas" },
  { id: "frota", nome: "Desempenho da Frota", rota: "/frota" },
  { id: "abastecimento", nome: "Abastecimento de Veículos", rota: "/abastecimento" },
  { id: "manutencao", nome: "Manutenção Preventiva", rota: "/manutencao" },
  { id: "instalacao", nome: "Instalações Técnicas", rota: "/instalacao" },
  { id: "clientes", nome: "Clientes e Planos", rota: "/clientes" },
  { id: "motoristas", nome: "Gestão de Motoristas", rota: "/motoristas" },
  { id: "motorista", nome: "Abastecimento de Veículos", rota: "/motorista" },
  { id: "funcionarios", nome: "Gestão de Funcionários", rota: "/funcionarios" },
  { id: "financeiro", nome: "Financeiro e Fluxo de Caixa", rota: "/financeiro" },
  { id: "mensalidades", nome: "Mensalidades e Cobrança", rota: "/mensalidades" },
  { id: "estoque", nome: "Estoque e Suprimentos", rota: "/estoque" },
  { id: "atendimento", nome: "Atendimento e Suporte", rota: "/atendimento" },
  { id: "chat", nome: "Chat em Tempo Real", rota: "/chat" },
  { id: "temas", nome: "Temas dos Cards e Módulos", rota: "/configuracao/temas" },
  { id: "demonstracao", nome: "Módulo Demonstração", rota: "/demonstracao" },
  { id: "configuracoes", nome: "Configurações do Sistema", rota: "/configuracoes" },
  // Módulos estritamente administrativos (Operadores NUNCA têm acesso)
  { id: "usuarios", nome: "Usuários e Acessos", rota: "/usuarios", exclusivoAdmin: true },
  {
    id: "central-seguranca",
    nome: "Central de Segurança",
    rota: "/configuracao/central-seguranca",
    exclusivoAdmin: true,
  },
  {
    id: "dispositivos",
    nome: "Dispositivos Autorizados",
    rota: "/dispositivos",
    exclusivoAdmin: true,
  },
  { id: "logs", nome: "Logs do Sistema", rota: "/configuracao/logs" },
  {
    id: "rastreadores",
    nome: "Rastreadores J16 4G",
    rota: "/configuracao/rastreador-j16",
    exclusivoSuperAdmin: true,
  },
  // Módulos Comerciais e Rede de Vendas
  {
    id: "revendedores",
    nome: "Revendedores e Vendedores",
    rota: "/revendedores",
    exclusivoAdmin: true,
  },
  {
    id: "minha-franquia",
    nome: "Minha Franquia e Equipe",
    rota: "/minha-franquia",
  },
  {
    id: "minhas-vendas",
    nome: "Minhas Vendas e Comissões",
    rota: "/minhas-vendas",
  },
  {
    id: "onboarding-acompanhamento",
    nome: "Acompanhamento da Ativação",
    rota: "/onboarding/acompanhamento",
  },
  {
    id: "propostas",
    nome: "Propostas Comerciais",
    rota: "/propostas",
  },
];

export const MODULOS_PADRAO_OPERADOR: string[] = [
  "abastecimento",
  "atendimento",
  "chat",
  "clientes",
  "configuracoes",
  "estoque",
  "financeiro",
  "frota",
  "instalacao",
  "logs",
  "manutencao",
  "motorista",
  "motoristas",
  "monitor-gps",
  "vigilantes",
  "mensalidades",
  "propostas",
  "temas",
  "demonstracao",
];

export const MODULOS_PADRAO_FINANCEIRO: string[] = [
  "financeiro",
  "mensalidades",
  "propostas",
  "clientes",
  "revendedores",
  "instalacao",
  "abastecimento",
  "manutencao",
  "estoque",
  "chat",
  "atendimento",
  "configuracoes",
  "temas",
];

/**
 * Normaliza aliases de IDs de módulos atribuídos
 */
function aliasesModulo(moduloId: string): string[] {
  const map: Record<string, string[]> = {
    "monitor-gps": ["monitor-gps", "gps_realtime", "mapa", "monitoramento"],
    frota: ["frota", "analytics", "telemetria_frota", "desempenho_frota"],
    abastecimento: ["abastecimento", "motorista", "portal_motorista"],
    manutencao: ["manutencao", "manutencao_preventiva"],
    instalacao: ["instalacao", "instalacoes"],
    motorista: ["motorista", "abastecimento", "portal_motorista"],
    motoristas: ["motoristas", "gestao_motoristas"],
    funcionarios: ["funcionarios", "gestao_funcionarios", "equipe"],
    clientes: ["clientes", "clientes_planos"],
    financeiro: ["financeiro", "financeiro_caixa"],
    mensalidades: ["mensalidades", "cobranca"],
    estoque: ["estoque", "estoque_suprimentos"],
    atendimento: ["atendimento", "atendimento_suporte"],
    chat: ["chat", "chat_realtime", "mensageiro"],
    temas: ["temas", "personalizacao"],
    configuracoes: ["configuracoes", "configuracao"],
    logs: ["logs", "auditoria", "auditoria_logs"],
    rastreadores: ["rastreadores", "rastreador-j16"],
    "central-seguranca": ["central-seguranca", "seguranca"],
    dispositivos: ["dispositivos", "dispositivos_autorizados"],
    revendedores: ["revendedores"],
    "minha-franquia": ["minha-franquia"],
    "minhas-vendas": ["minhas-vendas"],
    propostas: ["propostas"],
    demonstracao: ["demonstracao"],
  };
  return map[moduloId] || [moduloId];
}

/**
 * Normaliza e valida acesso a módulos para o perfil S.adm Auditor.
 * O SuperADM escolhe granularmente os módulos concedidos no cadastro/edição.
 * Cada módulo selecionado concede acesso ao recurso principal e seus submódulos operacionais.
 */
function auditorTemAcessoAoModulo(modulosAuditor: string[], moduloId: string): boolean {
  if (modulosAuditor.includes("todos") || modulosAuditor.includes("*")) {
    return true;
  }
  // Mapeamento hierárquico entre submódulos da plataforma e os módulos concedíveis
  const mapaVinculoAuditor: Record<string, string[]> = {
    "monitor-gps": ["monitor-gps"],
    rotas: ["monitor-gps", "rotas"],
    frota: ["monitor-gps", "frota"],
    abastecimento: ["monitor-gps", "abastecimento", "manutencao"],
    demonstracao: ["monitor-gps", "demonstracao"],
    clientes: ["clientes"],
    motoristas: ["clientes", "motoristas"],
    funcionarios: ["clientes", "funcionarios"],
    propostas: ["clientes", "financeiro", "propostas"],
    revendedores: ["clientes", "revendedores"],
    financeiro: ["financeiro"],
    mensalidades: ["mensalidades", "financeiro"],
    manutencao: ["manutencao"],
    instalacao: ["instalacao"],
    estoque: ["estoque"],
    atendimento: ["atendimento"],
    chat: ["atendimento", "chat"],
    temas: ["temas"],
    configuracoes: ["configuracoes"],
    usuarios: ["usuarios"],
    "central-seguranca": ["central-seguranca"],
    logs: ["logs"],
    dispositivos: ["dispositivos"],
    rastreadores: ["rastreadores"],
  };

  const modulosAutorizantes = mapaVinculoAuditor[moduloId] || [moduloId];
  return modulosAuditor.some((m) => modulosAutorizantes.includes(m));
}

/**
 * Verifica se a sessão do usuário tem permissão para acessar um determinado módulo
 */
export function podeAcessarModulo(session: UserSession | null, moduloId: string): boolean {
  if (!session) return false;

  // SuperADM acessa todos os módulos irrestritamente
  if (session.isSuperAdmin) return true;

  // Degustação do Plano Master: Acessa estritamente os módulos do Cliente no Plano Master
  if (session.isDegustacao) {
    return [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "motoristas",
      "motorista",
      "funcionarios",
      "mensalidades",
      "atendimento",
      "chat",
      "configuracoes",
      "temas",
    ].includes(moduloId);
  }

  // S.adm Auditor: acessa estritamente os módulos autorizados no cadastro pelo SuperADM (100% Read-Only)
  if (session.isSuperAdminAuditor || session.isAuditor || session.role === "superadmin_auditor") {
    const modulosAuditor = session.modulos || [];
    if (modulosAuditor.includes("todos") || modulosAuditor.includes("*")) {
      return true;
    }
    // Módulo de rastreadores concedido para inspeção e consultas do auditor
    if (moduloId === "rastreadores") {
      return true;
    }
    return auditorTemAcessoAoModulo(modulosAuditor, moduloId);
  }

  const def = MODULOS_SISTEMA_REGRAS.find((m) => m.id === moduloId);

  // Módulo exclusivo do SuperADM
  if (def?.exclusivoSuperAdmin) {
    return false;
  }

  // Administrador acessa todos os módulos exceto os exclusivos de SuperADM
  if (session.isAdmin) {
    return true;
  }

  // Financeiro: acessa os módulos financeiros padrão ou a lista personalizada concedida pelo administrador
  if (session.isFinanceiro || session.role === "financeiro") {
    const modulosFinanceiro =
      session.modulos && session.modulos.length > 0 ? session.modulos : MODULOS_PADRAO_FINANCEIRO;
    const aliases = aliasesModulo(moduloId);
    return modulosFinanceiro.some((m) => aliases.includes(m));
  }

  // Módulo exclusivo de Administrador: operador, instalador, cliente e motorista NÃO acessam
  if (def?.exclusivoAdmin) {
    return false;
  }

  // Atendimento e Suporte, Chat em Tempo Real, Configurações do Sistema e Temas:
  // Acessíveis por TODOS os usuários autenticados (preferência visual e comunicação global)
  if (
    moduloId === "atendimento" ||
    moduloId === "chat" ||
    moduloId === "configuracoes" ||
    moduloId === "temas"
  ) {
    return true;
  }

  // Instalador: exclusivamente instalação técnica
  if (session.isInstalador) {
    return moduloId === "instalacao";
  }

  // Revendedor: painel da franquia, minhas vendas e utilitários
  if (session.isRevendedor) {
    return [
      "minha-franquia",
      "minhas-vendas",
      "propostas",
      "atendimento",
      "chat",
      "configuracoes",
      "temas",
    ].includes(moduloId);
  }

  // Vendedor: painel de vendas, comissões e utilitários
  if (session.isVendedor) {
    return ["minhas-vendas", "propostas", "atendimento", "chat", "configuracoes", "temas"].includes(
      moduloId,
    );
  }

  // Motorista: exclusivamente abastecimento, manutenção preventiva e rotas inteligentes.
  // Mapa operacional ao vivo SOMENTE se expressamente autorizado em seu cadastro.
  if (session.isMotorista) {
    if (moduloId === "monitor-gps") {
      return Boolean(session.acessoMapaMotorista);
    }
    return ["rotas", "abastecimento", "manutencao", "motorista"].includes(moduloId);
  }

  // Funcionário: acessa ESTRITAMENTE os módulos delegados pelo seu cliente titular
  if (session.isFuncionario) {
    const modulosPermitidos = session.modulos || [];
    if (modulosPermitidos.includes("todos") || modulosPermitidos.includes("*")) {
      return true;
    }
    const aliases = aliasesModulo(moduloId);
    return modulosPermitidos.some((userMod) => aliases.includes(userMod));
  }

  // Cliente: módulos do cliente titular conforme seu plano comercial contratado (ou degustação Trial Master)
  if (session.isCliente) {
    const isBasicoEstrito = session.plano === "basico" && session.isTrialMaster === false;
    const isProEstrito = session.plano === "pro" && session.isTrialMaster === false;

    if (isBasicoEstrito) {
      // Plano Básico: Rastreamento em tempo real, faturas/PIX, atendimento, chat e configurações
      return ["monitor-gps", "mensalidades", "atendimento", "chat", "configuracoes"].includes(
        moduloId,
      );
    }

    if (isProEstrito) {
      // Plano Pro: Básico mais Rotas Inteligentes, Abastecimento e Manutenção Preventiva
      return [
        "monitor-gps",
        "rotas",
        "abastecimento",
        "manutencao",
        "mensalidades",
        "atendimento",
        "chat",
        "configuracoes",
      ].includes(moduloId);
    }

    // Plano Master ou Degustação Trial Master ativa (ou novo cliente cadastrado)
    return [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "motoristas",
      "motorista",
      "funcionarios",
      "locatarios",
      "mensalidades",
      "atendimento",
      "chat",
      "configuracoes",
    ].includes(moduloId);
  }

  // Locatário: mesmas permissões operacionais do cliente titular, com BLOQUEIO ESTRITO das financeiras
  if (session.isLocatario || session.role === "locatario") {
    // Proibição estrita de acesso a módulos e recursos financeiros
    if (["mensalidades", "financeiro", "propostas"].includes(moduloId)) {
      return false;
    }
    return [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "atendimento",
      "chat",
      "configuracoes",
      "temas",
    ].includes(moduloId);
  }

  // Operador: acessa ESTRITAMENTE os módulos atribuídos ou, se não houver registros
  // customizados no banco de dados, utiliza os módulos padrão autorizados para o operador
  if (session.role === "operador") {
    const modulosOperador =
      session.modulos && session.modulos.length > 0 ? session.modulos : MODULOS_PADRAO_OPERADOR;

    if (modulosOperador.includes("todos") || modulosOperador.includes("*")) {
      return true;
    }
    const aliases = aliasesModulo(moduloId);
    return modulosOperador.some((userMod) => aliases.includes(userMod));
  }

  return false;
}

/**
 * Mapeia uma rota do TanStack Router para seu respectivo módulo e valida acesso
 */
export function podeAcessarRota(session: UserSession | null, rota: string): boolean {
  if (!session) return false;
  if (session.isSuperAdmin) return true;

  // Normaliza rota removendo trailing slashes e query params
  const rotaNormalizada = rota.replace(/\/$/, "").split("?")[0];

  if (session.isDegustacao) {
    // Valida se a rota pertence aos modulos liberados para o Cliente no Plano Master
    if (
      rotaNormalizada === "/inicio" ||
      rotaNormalizada === "" ||
      rotaNormalizada === "/atendimento" ||
      rotaNormalizada === "/chat" ||
      rotaNormalizada === "/configuracoes" ||
      rotaNormalizada === "/configuracao/temas" ||
      rotaNormalizada === "/monitor-gps" ||
      rotaNormalizada === "/rotas" ||
      rotaNormalizada === "/frota" ||
      rotaNormalizada === "/abastecimento" ||
      rotaNormalizada === "/motorista" ||
      rotaNormalizada === "/manutencao" ||
      rotaNormalizada === "/motoristas" ||
      rotaNormalizada === "/funcionarios" ||
      rotaNormalizada === "/mensalidades"
    ) {
      return true;
    }
    return false;
  }

  // S.adm Auditor: acessa estritamente as rotas dos módulos autorizados
  if (session.isSuperAdminAuditor || session.isAuditor || session.role === "superadmin_auditor") {
    const modulosAuditor = session.modulos || [];
    if (modulosAuditor.includes("todos") || modulosAuditor.includes("*")) {
      return true;
    }
    // Recursos globais e neutros permitidos
    if (
      rotaNormalizada === "/inicio" ||
      rotaNormalizada === "" ||
      rotaNormalizada === "/atendimento" ||
      rotaNormalizada === "/chat" ||
      rotaNormalizada === "/configuracoes" ||
      rotaNormalizada === "/configuracao/temas" ||
      rotaNormalizada.startsWith("/configuracao/rastreador-j16")
    ) {
      return true;
    }
    const def = MODULOS_SISTEMA_REGRAS.find((m) => rotaNormalizada.startsWith(m.rota));
    if (!def) return true;
    return auditorTemAcessoAoModulo(modulosAuditor, def.id);
  }

  // Painel Geral / Início e Recursos Globais: acessíveis por todos os usuários autenticados
  if (
    rotaNormalizada === "/inicio" ||
    rotaNormalizada === "" ||
    rotaNormalizada === "/atendimento" ||
    rotaNormalizada === "/chat" ||
    rotaNormalizada === "/configuracoes" ||
    rotaNormalizada === "/configuracao/temas"
  ) {
    // Locatário pode acessar recursos globais
    if (session.isLocatario || session.role === "locatario") {
      return true;
    }
    return true;
  }

  // Regra para Perfil Locatário: mesmas rotas operacionais do cliente titular, bloqueando estritamente financeiro
  if (session.isLocatario || session.role === "locatario") {
    if (
      rotaNormalizada === "/mensalidades" ||
      rotaNormalizada === "/financeiro" ||
      rotaNormalizada === "/propostas" ||
      rotaNormalizada === "/usuarios" ||
      rotaNormalizada === "/clientes" ||
      rotaNormalizada === "/funcionarios" ||
      rotaNormalizada === "/locatarios" ||
      rotaNormalizada.startsWith("/configuracao/central-seguranca") ||
      rotaNormalizada.startsWith("/configuracao/rastreador-j16") ||
      rotaNormalizada.startsWith("/configuracao/logs")
    ) {
      return false;
    }
    return [
      "/inicio",
      "",
      "/monitor-gps",
      "/rotas",
      "/frota",
      "/abastecimento",
      "/manutencao",
      "/atendimento",
      "/chat",
      "/configuracoes",
      "/configuracao/temas",
    ].some((r) => rotaNormalizada === r || rotaNormalizada.startsWith(`${r}/`));
  }

  // Regra para Perfil Financeiro: Precedência dos módulos concedidos (com padrão financeiro canônico)
  if (session.isFinanceiro || session.role === "financeiro") {
    // Rotas estritamente bloqueadas por governança (exclusivas de SuperADM / Administrador / Franquia)
    if (
      rotaNormalizada === "/usuarios" ||
      rotaNormalizada === "/dispositivos" ||
      rotaNormalizada.startsWith("/configuracao/central-seguranca") ||
      rotaNormalizada.startsWith("/configuracao/rastreador-j16") ||
      rotaNormalizada.startsWith("/configuracao/logs") ||
      rotaNormalizada === "/minha-franquia" ||
      rotaNormalizada === "/minhas-vendas" ||
      rotaNormalizada === "/onboarding/acompanhamento" ||
      rotaNormalizada === "/demonstracao"
    ) {
      return false;
    }

    // Rotas operacionais e financeiras: valida permissão pelo módulo correspondente
    if (rotaNormalizada === "/financeiro") return podeAcessarModulo(session, "financeiro");
    if (rotaNormalizada === "/mensalidades") return podeAcessarModulo(session, "mensalidades");
    if (rotaNormalizada === "/propostas") return podeAcessarModulo(session, "propostas");
    if (rotaNormalizada === "/clientes") return podeAcessarModulo(session, "clientes");
    if (rotaNormalizada === "/revendedores") return podeAcessarModulo(session, "revendedores");
    if (rotaNormalizada === "/instalacao") return podeAcessarModulo(session, "instalacao");
    if (rotaNormalizada === "/abastecimento" || rotaNormalizada === "/motorista") {
      return podeAcessarModulo(session, "abastecimento");
    }
    if (rotaNormalizada === "/manutencao") return podeAcessarModulo(session, "manutencao");
    if (rotaNormalizada === "/estoque") return podeAcessarModulo(session, "estoque");
    if (rotaNormalizada === "/monitor-gps") return podeAcessarModulo(session, "monitor-gps");
    if (rotaNormalizada === "/rotas") return podeAcessarModulo(session, "rotas");
    if (rotaNormalizada === "/frota") return podeAcessarModulo(session, "frota");
    if (rotaNormalizada === "/motoristas") return podeAcessarModulo(session, "motoristas");
    if (rotaNormalizada === "/funcionarios") return podeAcessarModulo(session, "funcionarios");

    const moduloEncontrado = MODULOS_SISTEMA_REGRAS.find((m) => m.rota === rotaNormalizada);
    if (!moduloEncontrado) return false;
    return podeAcessarModulo(session, moduloEncontrado.id);
  }

  // Rota de Gestão de Funcionários: acessível pelo Cliente Titular (Plano Master ou Trial) e Administradores
  if (rotaNormalizada === "/funcionarios") {
    if (session.isCliente) {
      if (
        (session.plano === "basico" || session.plano === "pro") &&
        session.isTrialMaster === false
      ) {
        return false;
      }
      return true;
    }
    return session.isAdmin || session.isSuperAdmin;
  }

  // Rota de Desempenho da Frota: acessível por Cliente Titular (Plano Master ou Trial) e Admins/Operadores
  if (rotaNormalizada === "/frota") {
    if (session.isCliente) {
      if (
        (session.plano === "basico" || session.plano === "pro") &&
        session.isTrialMaster === false
      ) {
        return false;
      }
      return true;
    }
    return session.isAdmin || session.isSuperAdmin || session.role === "operador";
  }

  // Rota de Gestão de Motoristas: acessível por Cliente Titular (Plano Master ou Trial) e Admins/Operadores
  if (rotaNormalizada === "/motoristas") {
    if (session.isCliente) {
      if (
        (session.plano === "basico" || session.plano === "pro") &&
        session.isTrialMaster === false
      ) {
        return false;
      }
      return true;
    }
    return session.isAdmin || session.isSuperAdmin || session.role === "operador";
  }

  // Regras para Funcionário: valida se a rota pretendida possui módulo concedido pelo cliente
  if (session.isFuncionario) {
    if (
      rotaNormalizada === "/atendimento" ||
      rotaNormalizada === "/chat" ||
      rotaNormalizada === "/configuracoes" ||
      rotaNormalizada === "/configuracao/temas"
    ) {
      return true;
    }
    if (rotaNormalizada === "/abastecimento" || rotaNormalizada === "/motorista") {
      return podeAcessarModulo(session, "abastecimento");
    }
    if (rotaNormalizada === "/manutencao") {
      return podeAcessarModulo(session, "manutencao");
    }
    if (rotaNormalizada === "/rotas") {
      return podeAcessarModulo(session, "rotas");
    }
    if (rotaNormalizada === "/monitor-gps") {
      return podeAcessarModulo(session, "monitor-gps");
    }
    if (rotaNormalizada === "/frota") {
      return podeAcessarModulo(session, "frota");
    }
    if (rotaNormalizada === "/motoristas") {
      return podeAcessarModulo(session, "motoristas");
    }
    return false;
  }

  // Rota do Abastecimento: acessível por Motoristas, Clientes (Pro, Master ou Trial) e Admins/Operadores
  if (rotaNormalizada === "/abastecimento" || rotaNormalizada === "/motorista") {
    if (session.isCliente) {
      if (session.plano === "basico" && session.isTrialMaster === false) {
        return false;
      }
      return true;
    }
    if (session.role === "operador") {
      return podeAcessarModulo(session, "abastecimento");
    }
    return session.isMotorista || session.isAdmin || session.isSuperAdmin;
  }

  // Rota de Manutenção Preventiva: acessível por Motoristas, Clientes (Pro, Master ou Trial) e Admins/Operadores
  if (rotaNormalizada === "/manutencao") {
    if (session.isCliente) {
      if (session.plano === "basico" && session.isTrialMaster === false) {
        return false;
      }
      return true;
    }
    if (session.role === "operador") {
      return podeAcessarModulo(session, "manutencao");
    }
    return session.isMotorista || session.isAdmin || session.isSuperAdmin;
  }

  // Rota de Rotas e Trajetos Inteligentes: permitida para Motorista, Cliente (Pro, Master ou Trial), Operador e Admins (NUNCA instalador, revendedor ou vendedor)
  if (rotaNormalizada === "/rotas") {
    if (session.isInstalador || session.isRevendedor || session.isVendedor) return false;
    if (session.isCliente) {
      if (session.plano === "basico" && session.isTrialMaster === false) {
        return false;
      }
      return true;
    }
    if (session.role === "operador") {
      return podeAcessarModulo(session, "rotas");
    }
    return session.isMotorista || session.isAdmin || session.isSuperAdmin;
  }

  // Regra Estrita: Revendedores e Vendedores NÃO possuem acesso ao Mapa Operacional, Rotas Inteligentes ou Frota
  if (session.isRevendedor || session.isVendedor) {
    if (
      rotaNormalizada === "/monitor-gps" ||
      rotaNormalizada === "/rotas" ||
      rotaNormalizada === "/frota" ||
      rotaNormalizada === "/instalacao" ||
      rotaNormalizada === "/clientes" ||
      rotaNormalizada === "/motoristas" ||
      rotaNormalizada === "/funcionarios" ||
      rotaNormalizada === "/financeiro" ||
      rotaNormalizada === "/mensalidades" ||
      rotaNormalizada === "/estoque"
    ) {
      return false;
    }
  }

  // Rotas Comerciais e Canais de Vendas
  if (rotaNormalizada === "/revendedores") {
    return session.isAdmin || session.isSuperAdmin;
  }
  if (rotaNormalizada === "/minha-franquia") {
    return session.isRevendedor || session.isAdmin || session.isSuperAdmin;
  }
  if (rotaNormalizada === "/minhas-vendas") {
    return session.isVendedor || session.isRevendedor || session.isAdmin || session.isSuperAdmin;
  }
  if (rotaNormalizada === "/propostas") {
    return (
      session.isVendedor ||
      session.isRevendedor ||
      session.isAdmin ||
      session.isSuperAdmin ||
      session.role === "operador"
    );
  }
  if (rotaNormalizada === "/onboarding/acompanhamento") {
    return session.isCliente || session.isAdmin || session.isSuperAdmin;
  }

  // Rotas de Comunicação, Atendimento e Configurações: acessíveis por todos os usuários autenticados
  if (
    rotaNormalizada === "/atendimento" ||
    rotaNormalizada === "/chat" ||
    rotaNormalizada === "/configuracoes"
  ) {
    return true;
  }

  const moduloEncontrado = MODULOS_SISTEMA_REGRAS.find((m) => m.rota === rotaNormalizada);
  if (!moduloEncontrado) {
    // Se não for rota mapeada restrita (ex: sub-rotas), permite a administradores
    return session.isAdmin;
  }

  return podeAcessarModulo(session, moduloEncontrado.id);
}
