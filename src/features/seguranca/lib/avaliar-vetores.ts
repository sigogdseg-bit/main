import { PROTECOES_ATAQUES_BASE, ProtecaoAtaque, CategoriaProtecao } from "./protecoes-ataques";

export interface DadosAuditoriaSistema {
  totalTabelas: number;
  tabelasProtegidasRls: number;
  bloqueiosAtivos: number;
  totalFalhasRecentes: number;
  totalAdmins: number;
  cadeiaLogsIntegra?: boolean;
  cadeiaLogsTotal?: number;
  honeytokensAtivos?: number;
  dlpBlurAtivo?: boolean;
  fimIntegro?: boolean;
  auditoriaDisponivel?: boolean;
}

export function avaliarVetoresDinamicos(auditoria?: DadosAuditoriaSistema): CategoriaProtecao[] {
  if (!auditoria) return PROTECOES_ATAQUES_BASE;

  const totalTabelas = auditoria.totalTabelas || 0;
  const tabelasRls = auditoria.tabelasProtegidasRls || 0;
  const coberturaRls = totalTabelas > 0 ? tabelasRls / totalTabelas : 0;
  const cadeiaOk = auditoria.cadeiaLogsIntegra === true && (auditoria.cadeiaLogsTotal ?? 0) > 0;
  const honeytokensOk = (auditoria.honeytokensAtivos ?? 0) > 0;
  const dlpBlurOk = auditoria.dlpBlurAtivo !== false;
  const fimOk = auditoria.fimIntegro !== false && auditoria.auditoriaDisponivel !== false;

  return PROTECOES_ATAQUES_BASE.map((categoria) => ({
    ...categoria,
    itens: categoria.itens.map((item): ProtecaoAtaque => {
      // Regra 1: SQL Injection e IDOR dependem de 100% de cobertura RLS real no Postgres
      if (item.nome === "SQL Injection" || item.nome === "Broken Access Control (IDOR)") {
        if (totalTabelas === 0) {
          return {
            ...item,
            nivel: "detectar",
            como: "Snapshot de auditoria do banco ainda não confirmado neste ciclo.",
          };
        }
        if (coberturaRls < 1) {
          return {
            ...item,
            nivel: "detectar",
            como: `RLS parcial: ${tabelasRls}/${totalTabelas} tabelas protegidas. Há tabelas públicas sem RLS.`,
          };
        }
      }

      // Regra 2: Cadeia de custódia depende da verificação SHA-256 real
      if (item.nome === "Adulteração de logs" && !cadeiaOk) {
        return {
          ...item,
          nivel: "detectar",
          como: "Cadeia SHA-256 sem confirmação íntegra neste ciclo; verificar histórico na aba Cadeia de Custódia.",
        };
      }

      // Regra 3: Honeytokens dependem de armadilhas ativas no banco
      if (item.nome === "Armadilhas e Honeytokens (Deception)" && !honeytokensOk) {
        return {
          ...item,
          nivel: "exposto",
          como: "Nenhum honeytoken ativo encontrado em honeytokens_deception.",
        };
      }

      // Regra 4: DLP Blur
      if (item.nome === "Proteção de Tela e Anti-Exfiltração (DLP)" && !dlpBlurOk) {
        return {
          ...item,
          nivel: "detectar",
          como: "Ofuscamento por perda de foco (blur) desativado nas diretrizes DLP.",
        };
      }

      // Regra 5: FIM
      if (item.nome === "Monitoramento de Integridade de Schema (FIM)" && !fimOk) {
        return {
          ...item,
          nivel: "detectar",
          como: "Divergência detectada ou verificação FIM indisponível no schema.",
        };
      }

      return item;
    }),
  }));
}
