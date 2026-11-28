export type NivelProtecao = "bloquear" | "detectar" | "exposto";

export interface ProtecaoAtaque {
  nome: string;
  nivel: NivelProtecao;
  como: string;
}

export interface CategoriaProtecao {
  categoria: string;
  itens: ProtecaoAtaque[];
}

export const PROTECOES_ATAQUES_BASE: CategoriaProtecao[] = [
  {
    categoria: "Injeção de código",
    itens: [
      {
        nome: "SQL Injection",
        nivel: "bloquear",
        como: "PostgREST + prepared statements + RLS estrito em todas as tabelas do schema public.",
      },
      {
        nome: "NoSQL Injection",
        nivel: "bloquear",
        como: "Não há banco NoSQL exposto; API tipada e sanitizada pelo PostgREST.",
      },
      {
        nome: "Command Injection (RCE)",
        nivel: "bloquear",
        como: "Cloudflare Workers e runtime serverless — sem shell, sem child_process, sem filesystem arbitrário.",
      },
      {
        nome: "LDAP / XPath / SSRF interno",
        nivel: "bloquear",
        como: "Sem conectores LDAP/XML; fetch server-side restrito a hosts permitidos e validados.",
      },
      {
        nome: "XSS refletido / armazenado",
        nivel: "bloquear",
        como: "React escapa por padrão; CSP restritiva; nenhum dangerouslySetInnerHTML com input de usuário.",
      },
      {
        nome: "XSS via DOM",
        nivel: "bloquear",
        como: "Sanitização por escape do React + CSP sem 'unsafe-inline' em scripts de terceiros.",
      },
      {
        nome: "HTML/CSS Injection",
        nivel: "bloquear",
        como: "Conteúdo renderizado por componentes tipados; CSS controlado por classes Tailwind estáticas.",
      },
    ],
  },
  {
    categoria: "Sessão, autenticação e credenciais",
    itens: [
      {
        nome: "Brute force de senha",
        nivel: "bloquear",
        como: "Lockout escalonado progressivo no servidor (5 falhas/15m, 10/1h, 20/24h) via login_lockouts.",
      },
      {
        nome: "Credential stuffing",
        nivel: "bloquear",
        como: "Detecção algorítmica de falhas com múltiplos IPs em janela de 24h + lockout escalonado.",
      },
      {
        nome: "Password spraying",
        nivel: "bloquear",
        como: "Monitoramento por IP e identificador bloqueia ataques distribuídos de baixa frequência.",
      },
      {
        nome: "Roubo de sessão / hijack de token",
        nivel: "detectar",
        como: "JWT no navegador com TLS 1.3 e TOFU de dispositivo mitigam; XSS residual ainda pode capturar token.",
      },
      {
        nome: "Session fixation",
        nivel: "bloquear",
        como: "Supabase Auth rotaciona o refresh token a cada autenticação e renovação.",
      },
      {
        nome: "Bypass de validação client-side",
        nivel: "bloquear",
        como: "Validação autoritativa no servidor e em RPCs SECURITY DEFINER; checagens client não são autoritativas.",
      },
      {
        nome: "JWT tampering / alg=none",
        nivel: "bloquear",
        como: "Tokens assinados criptograficamente; verificação server-side rejeita alg=none e assinaturas inválidas.",
      },
      {
        nome: "Clickjacking (iframe overlay)",
        nivel: "bloquear",
        como: "CSP frame-ancestors com allowlist restrita + X-Frame-Options SAMEORIGIN.",
      },
      {
        nome: "CSRF em rotas sensíveis",
        nivel: "bloquear",
        como: "Autenticação por Bearer em cabeçalho (não em cookie) — CSRF clássico não se aplica; SameSite estrito.",
      },
      {
        nome: "Phishing / engenharia social",
        nivel: "detectar",
        como: "Política TOFU de aparelhos reduz impacto; anomalias de login são registradas. Vetor humano.",
      },
      {
        nome: "Enumeração de usuários",
        nivel: "bloquear",
        como: "Mensagem de erro genérica no login e fallback neutro no bot WhatsApp para comandos não autorizados.",
      },
      {
        nome: "Recuperação de senha abusada",
        nivel: "detectar",
        como: "Rate-limit na autenticação e registro em system_login_logs para revisão de padrões.",
      },
    ],
  },
  {
    categoria: "Autorização e dados",
    itens: [
      {
        nome: "Broken Access Control (IDOR)",
        nivel: "bloquear",
        como: "RLS em todas as tabelas públicas; cliente só acessa estritamente veículos e rastreadores do seu tenant.",
      },
      {
        nome: "Escalada de privilégio (user -> admin)",
        nivel: "bloquear",
        como: "Triggers PostgreSQL blindam contas SuperADM contra rebaixamento e bloqueiam promoções indevidas.",
      },
      {
        nome: "Mass assignment",
        nivel: "bloquear",
        como: "Validação rígida de payloads nas rotas; campos sensíveis de controle nunca são aceitos do cliente.",
      },
      {
        nome: "Exposição de dados sensíveis",
        nivel: "bloquear",
        como: "TLS 1.3 em trânsito + AES-256 em repouso + RLS estrito + blur DLP ao perder foco da janela.",
      },
      {
        nome: "Vazamento por logs / mensagens de erro",
        nivel: "bloquear",
        como: "Stacks sanitizados em produção; dados confidenciais nunca são impressos em log de aplicação.",
      },
    ],
  },
  {
    categoria: "Transporte e cabeçalhos HTTP",
    itens: [
      {
        nome: "MITM / downgrade HTTPS",
        nivel: "bloquear",
        como: "TLS 1.3 obrigatório, HSTS com preload e upgrade-insecure-requests no CSP.",
      },
      {
        nome: "MIME sniffing",
        nivel: "bloquear",
        como: "X-Content-Type-Options: nosniff.",
      },
      {
        nome: "Vazamento de referer",
        nivel: "bloquear",
        como: "Referrer-Policy: strict-origin-when-cross-origin.",
      },
      {
        nome: "Plugins/Flash legado",
        nivel: "bloquear",
        como: "CSP object-src 'none' e X-Permitted-Cross-Domain-Policies: none.",
      },
      {
        nome: "Sequestro de base tag",
        nivel: "bloquear",
        como: "CSP base-uri 'self'.",
      },
    ],
  },
  {
    categoria: "Rede e disponibilidade",
    itens: [
      {
        nome: "DDoS volumétrico (L3/L4)",
        nivel: "bloquear",
        como: "Mitigação de borda da Cloudflare antes de atingir o servidor de aplicação.",
      },
      {
        nome: "DDoS aplicação (L7) / Slowloris",
        nivel: "bloquear",
        como: "Regras gerenciadas da Cloudflare e limites de conexão do runtime.",
      },
      {
        nome: "Ataques via bots / scraping / cadastro abusivo",
        nivel: "bloquear",
        como: "Monitoramento anti-abuso nas rotas públicas detecta tempmail e rajadas em cadastro_monitoramento_eventos.",
      },
      {
        nome: "Abuso de API por usuário logado",
        nivel: "detectar",
        como: "Toda ação é registrada em system_activity_logs; rajadas volumétricas aparecem no UEBA.",
      },
      {
        nome: "Amplificação (DNS/NTP)",
        nivel: "bloquear",
        como: "Não há serviços UDP expostos no Edge; DNS operado com proteção contra amplificação.",
      },
    ],
  },
  {
    categoria: "Arquivos, upload e supply chain",
    itens: [
      {
        nome: "Upload malicioso executável",
        nivel: "bloquear",
        como: "Apenas tipos MIME permitidos; servidos sem execução direta no navegador.",
      },
      {
        nome: "Malware embutido em imagem",
        nivel: "exposto",
        como: "Sem antivírus no upload — risco residual assumido (imagens não são executadas pelo browser).",
      },
      {
        nome: "Path traversal em upload",
        nivel: "bloquear",
        como: "Storage gera nomes canônicos UUID; caminho não é montado a partir do input do usuário.",
      },
      {
        nome: "Dependência vulnerável (supply chain)",
        nivel: "detectar",
        como: "Auditoria de dependências em builds e lockfile estrito em produção.",
      },
      {
        nome: "Typosquatting de pacote",
        nivel: "detectar",
        como: "Instalação controlada via registro oficial npm; sem installs anônimos em CI de produção.",
      },
    ],
  },
  {
    categoria: "Cadeia de custódia e auditoria",
    itens: [
      {
        nome: "Adulteração de logs",
        nivel: "bloquear",
        como: "system_activity_logs encadeado em SHA-256 (chain_seq, prev_hash, chain_hash) com verificação via RPC.",
      },
      {
        nome: "Adulteração de PDF emitido",
        nivel: "bloquear",
        como: "Hash SHA-256 registrado em documentos_emitidos com conferência pública de autenticidade.",
      },
      {
        nome: "Repudiação de ação privilegiada",
        nivel: "bloquear",
        como: "Toda ação administrativa fica registrada em admin_audit_logs com quem, quando e diff jsonb.",
      },
      {
        nome: "Backup e salvaguarda imutável",
        nivel: "bloquear",
        como: "Duplo Marco de Segurança (BKP-A e BKP-B) isolado e verificável fora do fluxo de release.",
      },
    ],
  },
  {
    categoria: "Defesa proativa e governança de dados",
    itens: [
      {
        nome: "Armadilhas e Honeytokens (Deception)",
        nivel: "bloquear",
        como: "Contas-armadilha monitoradas em honeytokens_deception; tentativa de acesso bloqueia por 48h no ato.",
      },
      {
        nome: "Proteção de Tela e Anti-Exfiltração (DLP)",
        nivel: "bloquear",
        como: "Ofuscamento automático por blur ao perder foco da janela e bloqueio preventivo de impressão.",
      },
      {
        nome: "Análise Comportamental (UEBA)",
        nivel: "bloquear",
        como: "Monitora rajadas atípicas de requisições (>25 req/janela) e varreduras anômalas com alerta imediato.",
      },
      {
        nome: "Monitoramento de Integridade de Schema (FIM)",
        nivel: "bloquear",
        como: "Checksums SHA-256 reais das funções SECURITY DEFINER e políticas RLS apurados ao vivo no Postgres.",
      },
    ],
  },
  {
    categoria: "Riscos residuais assumidos",
    itens: [
      {
        nome: "Insider threat (admin malicioso)",
        nivel: "detectar",
        como: "Todo ato de admin fica auditado em admin_audit_logs; mitigação real é procedural (menor privilégio).",
      },
      {
        nome: "Aparelho perdido / roubado",
        nivel: "detectar",
        como: "Sessão expira, dispositivo revogável via política TOFU e reload remoto via Realtime.",
      },
      {
        nome: "Ransomware / malware no endpoint",
        nivel: "exposto",
        como: "Fora do escopo do sistema — depende de antivírus/EDR e política de endpoint do usuário.",
      },
      {
        nome: "Ataque físico ao servidor",
        nivel: "bloquear",
        como: "Infraestrutura gerenciada em datacenter Tier-III com controle físico auditado.",
      },
    ],
  },
];

export const NIVEL_LABEL: Record<NivelProtecao, string> = {
  bloquear: "Bloqueia",
  detectar: "Detecta",
  exposto: "Exposto",
};

export const NIVEL_COR: Record<NivelProtecao, string> = {
  bloquear: "text-emerald-600 dark:text-emerald-400",
  detectar: "text-sky-600 dark:text-sky-400",
  exposto: "text-amber-600 dark:text-amber-400",
};

export function contarPorNivel(
  dados: CategoriaProtecao[] = PROTECOES_ATAQUES_BASE,
): Record<NivelProtecao, number> {
  const acc: Record<NivelProtecao, number> = {
    bloquear: 0,
    detectar: 0,
    exposto: 0,
  };
  for (const cat of dados) {
    for (const item of cat.itens) {
      acc[item.nivel] = (acc[item.nivel] || 0) + 1;
    }
  }
  return acc;
}
