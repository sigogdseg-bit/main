// ─────────────────────────────────────────────────────────────────────────────
// Padrão Canônico Homologado do Sistema (Fábrica / Produção GD Rastreamento)
// Extraído de RastreadorJ16View para conformidade com React Fast Refresh
// ─────────────────────────────────────────────────────────────────────────────

export const VALORES_PADRAO_CANONICO_J16 = {
  servidorDns: "gps.oficial.tec.br",
  portaTcp: "7003",
  ipDedicado: "167.234.233.82",
  usarIpDireto: true, // Padrão Oficial Canônico: Conexão via IP Dedicado direto sem overhead DNS
  apnNome: "voxter.br",
  apnUser: "algar",
  apnPass: "1212",
  timerMovimento: "30", // Padrão Ouro Equilibrado: 30s em movimento em retas (economia de 50% de dados e curvas preservadas)
  timerParado: "3600", // Padrão Homologado Voxter: 3600s (1 hora) parado na garagem para cessar tráfego e proteger bateria
  hbtLigado: "300", // Padrão Homologado Voxter: 300s (5 min) mantém NAT e socket TCP sem desperdício de dados
  hbtDesligado: "300", // Padrão Homologado Voxter: 300s (5 min) repouso celular de baixo consumo e túnel aberto para comandos
  anguloHabilitarCmd: "SZCS#ANGLE,SEND=1",
  anguloIntervalo: "10",
  anguloGrau: "20", // Padrão Ouro: Inflexão de 20° desenha curvas perfeitas sem disparos em retas
  numeroSos: "5524992494030", // Padrão Canônico: WhatsApp do Cliente Titular (Dario Novaes)
  numeroCenter: "5524992494030", // Padrão Canônico: WhatsApp do Cliente Titular (Dario Novaes)
  senhaDispositivoPadrao: "123456", // Senha Mestre do Rastreador (Padrão 123456 ou definida pelo usuário)
  senhaDispositivoCmd: "PASSWORD,<senha antiga>,<nova senha>#", // Indicação canônica de parâmetros (sem senha fixa)
  ignicaoFisicaCmd: "SZCS#ACCLINE=1",
  medicaoInternaMeterCmd: "SZCS#GT06SEL=1#GT06METER=1",
  voltagemOdometroIexvolCmd: "SZCS#GT06IEXVOL=2",
  sleepMtkCmd: "SZCS#MTK_DISSLP=0",
  sleepGpsCmd: "SZCS#GPS_DISSLP=0",
  gmtComando: "GMT,W,0,0#",
  ledsComando: "SZCS#LED_ENABLE=0",
  paramComando: "PARAM#",
  statusComando: "STATUS#",
  relayConsultaComando: "RELAY#",
  alertaGuinchoCmd: "MOVING,ON,200,0#",
  defenseCmd: "DEFENSE,1#",
  senalmCmd: "SENALM,ON,0#",
  bateriaFracaCmd: "BATALM,ON,0#",
  bateriaCortadaCmd: "POWERALM,ON,0,5,10#",
  alertaIgnicaoImediataCmd: "ACCALM,ON,2#", // Alarme Instantâneo de Ignição / ACC (elimina lag de desligado)
  modoVeiculoSleepCmd: "SZCS#SLPDISCONNECT=0",
  economiaParadaCmd: "SENDS,1#",
  sensorGSensibilidadeCmd: "LEVEL,3#",
  resetFinalCmd: "RESET#",
};

export const CHECKBOXES_PADRAO_CANONICO_J16: Record<string, boolean> = {
  servidorDns: false, // DNS desmarcado no padrão oficial em favor do IP direto
  portaTcp: true,
  ipDedicado: true, // IP dedicado direto marcado por padrão
  apnNome: true,
  apnUser: true,
  apnPass: true,
  timerMovimento: true,
  timerParado: true,
  hbtLigado: true,
  hbtDesligado: true,
  anguloHabilitar: true, // Pré-requisito de hardware para detecção angular de curva
  anguloIntervalo: true,
  anguloGrau: true,
  numeroSos: false, // Opcional
  numeroCenter: false, // Opcional
  senhaDispositivoPadrao: false,
  senhaDispositivo: false, // Opcional (Senha master de proteção SMS)
  ignicaoFisica: true, // Pré-requisito físico (fio laranja) para sleep e alarmes
  medicaoInternaMeter: true, // Acumulador de odômetro da MCU J16
  voltagemOdometroIexvol: true, // Pré-requisito para pacote estendido GT06 com voltagem 12V e odômetro
  sleepMtk: true, // Sono da CPU MTK ao estacionar para economizar bateria
  sleepGps: true, // Repouso do GPS ao parar
  gmtUniversal: true,
  ledsDiagnostico: true,
  paramDiagnostico: false, // Desmarcado por padrão no lote inicial (leitura não deve rodar antes do RESET)
  statusDiagnostico: false, // Desmarcado por padrão no lote inicial (consulta não deve rodar antes do RESET)
  relayDiagnostico: false, // Desmarcado por padrão no lote inicial (auditoria não deve rodar antes do RESET)
  alertaGuincho: true,
  defenseAlarme: true,
  senalmVibracao: true,
  bateriaFraca: true,
  bateriaCortada: true,
  alertaIgnicaoImediata: true, // Alarme imediato de ignição ligada/desligada via GPRS
  modoVeiculoSleep: true,
  economiaParada: true,
  sensorGSensibilidade: true,
  resetFinal: true, // O ÚLTIMO COMANDO OBRIGATÓRIO (reinicia MCU e reconecta limpo à Lara)
};

export const STORAGE_KEY_CONFIG_PADRAO_SISTEMA = "hunter_j16_config_padrao_sistema";
export const VERSAO_PADRAO_SISTEMA_J16 = "2.1.6.62-gd-seguranca-porta-7003-tcp-isolada";

export const obterConfigPadraoSistemaJ16 = (): {
  valores: typeof VALORES_PADRAO_CANONICO_J16;
  checkboxes: Record<string, boolean>;
} => {
  if (typeof window !== "undefined") {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed && typeof parsed === "object") {
          // Se for versão anterior ou possuir parâmetros legados, auto-migra compulsoriamente para o Padrão Voxter Homologado
          const timerParadoNum = Number(parsed.valores?.timerParado) || 0;
          const hbtDesligadoNum = Number(parsed.valores?.hbtDesligado) || 0;
          const hbtLigadoNum = Number(parsed.valores?.hbtLigado) || 0;

          const isLegado =
            parsed.versao !== VERSAO_PADRAO_SISTEMA_J16 ||
            parsed.valores?.portaTcp !== VALORES_PADRAO_CANONICO_J16.portaTcp ||
            parsed.valores?.servidorDns !== VALORES_PADRAO_CANONICO_J16.servidorDns ||
            parsed.valores?.ipDedicado !== VALORES_PADRAO_CANONICO_J16.ipDedicado ||
            timerParadoNum < 3600 ||
            hbtDesligadoNum < 300 ||
            hbtLigadoNum < 300 ||
            parsed.valores?.timerMovimento !== "30" ||
            parsed.valores?.usarIpDireto !== true ||
            parsed.checkboxes?.servidorDns === true ||
            parsed.checkboxes?.ipDedicado === false ||
            parsed.valores?.anguloGrau !== "20" ||
            parsed.valores?.senhaDispositivoCmd?.includes("161514") ||
            parsed.valores?.senhaDispositivoCmd?.includes("672904");

          if (isLegado) {
            const senhaMigrada =
              parsed.valores?.senhaDispositivoPadrao ||
              VALORES_PADRAO_CANONICO_J16.senhaDispositivoPadrao;
            const migrado = {
              versao: VERSAO_PADRAO_SISTEMA_J16,
              valores: {
                ...VALORES_PADRAO_CANONICO_J16,
                numeroSos: parsed.valores?.numeroSos || VALORES_PADRAO_CANONICO_J16.numeroSos,
                numeroCenter:
                  parsed.valores?.numeroCenter || VALORES_PADRAO_CANONICO_J16.numeroCenter,
                senhaDispositivoPadrao: senhaMigrada,
                senhaDispositivoCmd:
                  senhaMigrada && senhaMigrada !== "123456"
                    ? `PASSWORD,123456,${senhaMigrada}#`
                    : VALORES_PADRAO_CANONICO_J16.senhaDispositivoCmd,
              },
              checkboxes: {
                ...CHECKBOXES_PADRAO_CANONICO_J16,
              },
            };
            try {
              localStorage.setItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA, JSON.stringify(migrado));
              localStorage.setItem(
                "hunter_j16_batch_params_habilitados",
                JSON.stringify(CHECKBOXES_PADRAO_CANONICO_J16),
              );
            } catch {
              // Silencioso
            }
            return {
              valores: migrado.valores,
              checkboxes: migrado.checkboxes,
            };
          }

          const senhaRetorno =
            parsed.valores?.senhaDispositivoPadrao ||
            VALORES_PADRAO_CANONICO_J16.senhaDispositivoPadrao;
          return {
            valores: {
              ...VALORES_PADRAO_CANONICO_J16,
              ...(parsed.valores || {}),
              numeroSos: parsed.valores?.numeroSos || VALORES_PADRAO_CANONICO_J16.numeroSos,
              numeroCenter:
                parsed.valores?.numeroCenter || VALORES_PADRAO_CANONICO_J16.numeroCenter,
              usarIpDireto: true,
              timerMovimento: "30",
              anguloGrau: "20",
              senhaDispositivoPadrao: senhaRetorno,
              senhaDispositivoCmd:
                parsed.valores?.senhaDispositivoCmd &&
                !parsed.valores.senhaDispositivoCmd.includes("161514") &&
                !parsed.valores.senhaDispositivoCmd.includes("672904")
                  ? parsed.valores.senhaDispositivoCmd
                  : senhaRetorno && senhaRetorno !== "123456"
                    ? `PASSWORD,123456,${senhaRetorno}#`
                    : "PASSWORD,<senha antiga>,<nova senha>#",
              timerParado: String(Math.min(3600, Math.max(60, timerParadoNum || 3600))),
              hbtLigado: String(Math.min(300, Math.max(30, hbtLigadoNum || 300))),
              hbtDesligado: String(Math.min(600, Math.max(30, hbtDesligadoNum || 300))),
            },
            checkboxes: {
              ...CHECKBOXES_PADRAO_CANONICO_J16,
              ...(parsed.checkboxes || {}),
              ipDedicado: true,
              servidorDns: false,
            },
          };
        }
      }
    } catch (err) {
      console.warn("Falha ao recuperar config padrão do sistema do localStorage", err);
    }
  }
  return {
    valores: VALORES_PADRAO_CANONICO_J16,
    checkboxes: CHECKBOXES_PADRAO_CANONICO_J16,
  };
};

/**
 * Isola com precisão o número de telefone de uma string de telefone administrador,
 * tratando formatos: "admin#<senha>#<numero>#", "CENTER,A,<numero>#", "5511999998888", etc.
 * Evita concatenação indevida da senha no número do telefone.
 */
export const extrairTelefoneNumeroCenter = (centerVal: string): string => {
  if (!centerVal) return "";
  const limpo = centerVal.trim();
  if (limpo.startsWith("admin#") || limpo.includes("#")) {
    const partes = limpo.split("#").filter(Boolean);
    // Formato admin#senha#telefone
    if (partes.length >= 3) {
      return partes[2].replace(/\D/g, "");
    }
    // Formato admin#telefone
    if (partes.length >= 2) {
      const parte1Limpa = partes[1].replace(/\D/g, "");
      if (parte1Limpa.length >= 10) return parte1Limpa;
    }
  }
  if (limpo.startsWith("CENTER,A,")) {
    return limpo.replace("CENTER,A,", "").replace(/\D/g, "");
  }
  return limpo.replace(/\D/g, "");
};

/**
 * Atualiza ou injeta a senha mestre em comandos com sintaxe Coban (G900L).
 * Preserva o prefixo e sufixos de parâmetros do comando.
 */
export const atualizarSenhaEmComandoCoban = (cmd: string, novaSenha: string): string => {
  if (!cmd) return cmd;
  const limpo = cmd.trim();
  const senha = (novaSenha || "123456").trim() || "123456";

  if (/^time\s+zone\w*\s+(-?\d+)/i.test(limpo)) {
    return limpo.replace(/^time\s+zone\w*/i, `time zone${senha}`);
  }
  if (/^check\w*/i.test(limpo)) {
    return `check${senha}`;
  }
  if (/^status\w*/i.test(limpo)) {
    return `status${senha}`;
  }
  if (/^reset\w*/i.test(limpo)) {
    return `reset${senha}`;
  }
  if (/^stop\w*/i.test(limpo)) {
    return `stop${senha}`;
  }
  if (/^resume\w*/i.test(limpo)) {
    return `resume${senha}`;
  }
  if (/^extpower\w*\s+(on|off)/i.test(limpo)) {
    return limpo.replace(/^extpower\w*/i, `extpower${senha}`);
  }
  if (/^lowbattery\w*\s+(on|off)/i.test(limpo)) {
    return limpo.replace(/^lowbattery\w*/i, `lowbattery${senha}`);
  }
  if (/^shock\w*\s+(on|off)/i.test(limpo)) {
    return limpo.replace(/^shock\w*/i, `shock${senha}`);
  }
  if (/^move\w*\s+(\d+)/i.test(limpo)) {
    return limpo.replace(/^move\w*/i, `move${senha}`);
  }
  if (/^acc\w*\s+(on|off)/i.test(limpo)) {
    return limpo.replace(/^acc\w*/i, `acc${senha}`);
  }
  if (/^sleep\w*\s+(\w+)/i.test(limpo)) {
    return limpo.replace(/^sleep\w*/i, `sleep${senha}`);
  }
  if (/^arm\w*/i.test(limpo)) {
    return `arm${senha}`;
  }
  if (/^disarm\w*/i.test(limpo)) {
    return `disarm${senha}`;
  }
  if (/^adminip\w*\s+/i.test(limpo)) {
    return limpo.replace(/^adminip\w*/i, `adminip${senha}`);
  }
  if (/^apn\w*\s+/i.test(limpo)) {
    return limpo.replace(/^apn\w*/i, `apn${senha}`);
  }
  if (/^admin\w*\s+/i.test(limpo)) {
    return limpo.replace(/^admin\w*/i, `admin${senha}`);
  }
  return limpo;
};
