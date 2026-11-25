// ============================================================================
// HUNTER GUARDIAN — CATÁLOGO DE PROTOCOLOS HOMOLOGADOS DE BANCADA USB
// Suporte Canônico: WanWay / Concox (GT06), Modem Celular AT (Hayes), Coban / TK (TK103) e G900L (Secumore / Cantrack 4G)
// ============================================================================

export type FamiliaProtocolo = "concox_wanway" | "modem_at" | "coban_tk" | "g900l";

export interface ProtocoloHardwareDef {
  id: FamiliaProtocolo;
  nome: string;
  badge: string;
  terminador: "HASH" | "CRLF";
  gerarComandoServidor: (
    srv: string,
    porta: string,
    modo: string,
  ) => { cmd: string; terminador: "HASH" | "CRLF" };
  gerarComandoApn: (
    apn: string,
    user: string,
    pass: string,
  ) => { cmd: string; terminador: "HASH" | "CRLF" };
  gerarComandoTimers: (
    mov: string,
    parado: string,
    hbt: string,
  ) => { cmd: string; terminador: "HASH" | "CRLF" };
  tituloTimers?: string;
  descTimers?: string;
  labelBotaoTimers?: string;
  suportaTimersMovimento?: boolean;
  suportaServidorViaSerial?: boolean;
  atalhos: { label: string; cmd: string; desc: string; cor: string }[];
  comandosUmToque: {
    titulo: string;
    cmd: string;
    desc: string;
    categoria?: "consulta" | "acao";
    label?: string;
    estilo?: string;
  }[];
  gerarFilaPadraoCanonico: (params: {
    srv: string;
    porta: string;
    modo: string;
    apn: string;
    user: string;
    pass: string;
    mov: string;
    parado: string;
    hbt: string;
  }) => { nome: string; cmd: string; tipo: "HASH" | "CRLF" }[];
}

export const PROTOCOLOS_BANCADA: Record<FamiliaProtocolo, ProtocoloHardwareDef> = {
  concox_wanway: {
    id: "concox_wanway",
    nome: "WanWay / Concox (GT06)",
    badge: "Protocolo GT06 (Hash #)",
    terminador: "HASH",
    gerarComandoServidor: (srv, porta, modo) => ({
      cmd: `SERVER,${modo},${srv},${porta},0#`,
      terminador: "HASH",
    }),
    gerarComandoApn: (apn, user, pass) => ({
      cmd:
        user && pass ? `APN,${apn},${user},${pass}#` : user ? `APN,${apn},${user}#` : `APN,${apn}#`,
      terminador: "HASH",
    }),
    gerarComandoTimers: (mov, parado) => ({
      cmd: `TIMER,${mov},${parado}#`,
      terminador: "HASH",
    }),
    tituloTimers: "3. Timers e Frequência de Transmissão",
    descTimers: "Intervalos canônicos de rastreamento (segundos)",
    labelBotaoTimers: "Gravar Timers e Heartbeat",
    suportaTimersMovimento: true,
    suportaServidorViaSerial: true,
    atalhos: [
      {
        label: "Status (STATUS#)",
        cmd: "STATUS#",
        desc: "Status geral do rastreador",
        cor: "text-sky-400",
      },
      {
        label: "Parâmetros (PARAM#)",
        cmd: "PARAM#",
        desc: "Parâmetros de IP, porta, APN e timers",
        cor: "text-purple-400",
      },
      {
        label: "Servidor (SERVER#)",
        cmd: "SERVER#",
        desc: "Consultar servidor e porta TCP gravados",
        cor: "text-orange-400",
      },
      {
        label: "Chip/GPRS (GPRSSET#)",
        cmd: "GPRSSET#",
        desc: "Dados de operadora, APN e link GPRS",
        cor: "text-orange-400",
      },
      {
        label: "Raio-X (CXZT#)",
        cmd: "CXZT#",
        desc: "Voltagem externa, bateria interna, GSM e GPS",
        cor: "text-amber-400",
      },
      {
        label: "Relé (RELAY#)",
        cmd: "RELAY#",
        desc: "Estado atual do corte/relé de bloqueio",
        cor: "text-rose-400",
      },
      {
        label: "Odômetro (MILEAGE#)",
        cmd: "MILEAGE#",
        desc: "Quilometragem acumulada na MCU",
        cor: "text-indigo-400",
      },
      {
        label: "GPS (WHERE#)",
        cmd: "WHERE#",
        desc: "Coordenadas GPS atuais",
        cor: "text-amber-400",
      },
      {
        label: "Maps (URL#)",
        cmd: "URL#",
        desc: "Link direto do Google Maps",
        cor: "text-sky-300",
      },
      {
        label: "Versão (VERSION#)",
        cmd: "VERSION#",
        desc: "Versão de firmware da MCU",
        cor: "text-slate-300",
      },
    ],
    comandosUmToque: [
      {
        titulo: "Status Geral",
        cmd: "STATUS#",
        desc: "Bateria, GPS, ACC, sinal GSM e relé",
        categoria: "consulta",
      },
      {
        titulo: "Ler Parâmetros",
        cmd: "PARAM#",
        desc: "IP, Porta, APN, timers e heartbeat na memória",
        categoria: "consulta",
      },
      {
        titulo: "Consultar Servidor",
        cmd: "SERVER#",
        desc: "Servidor DNS/IP e porta TCP configurados",
        categoria: "consulta",
      },
      {
        titulo: "Conexão do Chip (GPRS)",
        cmd: "GPRSSET#",
        desc: "APN, operadora, usuário e link de dados",
        categoria: "consulta",
      },
      {
        titulo: "Consultar APN",
        cmd: "APN#",
        desc: "Nome da APN gravada no chip M2M",
        categoria: "consulta",
      },
      {
        titulo: "Raio-X Completo",
        cmd: "CXZT#",
        desc: "Voltagem 12V/24V, bateria interna, GSM e satélites",
        categoria: "consulta",
      },
      {
        titulo: "Resumo MCU Fábrica",
        cmd: "SCXSZ#",
        desc: "Dados estruturados de configuração da placa",
        categoria: "consulta",
      },
      {
        titulo: "Localização GPS",
        cmd: "WHERE#",
        desc: "Coordenadas geográficas atuais",
        categoria: "consulta",
      },
      {
        titulo: "Link Google Maps",
        cmd: "URL#",
        desc: "Gera link direto de localização no Google Maps",
        categoria: "consulta",
      },
      {
        titulo: "Estado do Relé",
        cmd: "RELAY#",
        desc: "Confirma se o bloqueio está cortado ou liberado",
        categoria: "consulta",
      },
      {
        titulo: "Odômetro Interno",
        cmd: "MILEAGE#",
        desc: "Quilometragem total gravada na MCU",
        categoria: "consulta",
      },
      {
        titulo: "Consultar Timers",
        cmd: "TIMER#",
        desc: "Intervalos de transmissão ligado e parado",
        categoria: "consulta",
      },
      {
        titulo: "Consultar Heartbeat",
        cmd: "HBT#",
        desc: "Intervalos de keep-alive / ping na plataforma",
        categoria: "consulta",
      },
      {
        titulo: "Vigília Pós-Parada",
        cmd: "SENDS#",
        desc: "Minutos de GPS ativo após desligar a chave",
        categoria: "consulta",
      },
      {
        titulo: "Número Centro/Admin",
        cmd: "CENTER#",
        desc: "Consulta número administrador cadastrado",
        categoria: "consulta",
      },
      {
        titulo: "Números S.O.S.",
        cmd: "SOS#",
        desc: "Consulta contatos de emergência S.O.S.",
        categoria: "consulta",
      },
      {
        titulo: "Versão Firmware",
        cmd: "VERSION#",
        desc: "Revisão e modelo do software embarcado",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Ignição (ACCLINE)",
        cmd: "CXCS#ACCLINE",
        desc: "1 = pós-chave fio laranja físico, 0 = virtual",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Sono CPU (MTK)",
        cmd: "CXCS#MTK_DISSLP",
        desc: "0 = sleep ativo ao estacionar, 1 = contínuo",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Sono GPS",
        cmd: "CXCS#GPS_DISSLP",
        desc: "0 = desliga GPS ao parar, 1 = GPS contínuo",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Sono 4G (Carro/Moto)",
        cmd: "CXCS#SLPDISCONNECT",
        desc: "0 = 4G online carro, 1 = desconecta no sleep moto",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Odômetro MCU",
        cmd: "CXCS#GT06METER",
        desc: "Verifica contagem interna GT06METER na MCU",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Voltagem Estendida",
        cmd: "CXCS#GT06IEXVOL",
        desc: "Verifica envio de 12V/24V e odômetro nos pacotes",
        categoria: "consulta",
      },
      {
        titulo: "Reg. Curva (ANGLEVALUE)",
        cmd: "CXCS#ANGLEVALUE",
        desc: "Consulta intervalo mínimo e graus da curva",
        categoria: "consulta",
      },
      {
        titulo: "Reg. LEDs Externos",
        cmd: "CXCS#LED_ENABLE",
        desc: "0 = LEDs apagados (discreto), 1 = LEDs ativos",
        categoria: "consulta",
      },
      {
        titulo: "Reiniciar para Lara",
        cmd: "RESET#",
        desc: "Aplica alterações e reconecta no Lara",
        categoria: "acao",
        estilo: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      },
      {
        titulo: "Reset de Fábrica",
        cmd: "FACTORY#",
        desc: "Restaura parâmetros originais de fábrica",
        categoria: "acao",
        estilo: "bg-rose-500/10 text-rose-500 border-rose-500/30",
      },
    ],
    gerarFilaPadraoCanonico: ({ srv, porta, modo, apn, user, pass, mov, parado, hbt }) => {
      const comandoApn =
        user && pass ? `APN,${apn},${user},${pass}#` : user ? `APN,${apn},${user}#` : `APN,${apn}#`;
      const hbtFinal = hbt || "300";
      return [
        { nome: "1. Apontamento Servidor", cmd: `SERVER,${modo},${srv},${porta},0#`, tipo: "HASH" },
        { nome: "2. APN Chip Celular M2M", cmd: comandoApn, tipo: "HASH" },
        { nome: "3. Timers Movimento e Parado", cmd: `TIMER,${mov},${parado}#`, tipo: "HASH" },
        { nome: "4. Heartbeat (HBT)", cmd: `HBT,${hbtFinal},${hbtFinal}#`, tipo: "HASH" },
        { nome: "5. Fuso Horário GMT Zero", cmd: "GMT,W,0,0#", tipo: "HASH" },
        { nome: "6. Ignição Fio Físico", cmd: "SZCS#ACCLINE=1", tipo: "CRLF" },
        { nome: "7. Detecção de Curva", cmd: "SZCS#ANGLE,SEND=1", tipo: "CRLF" },
        {
          nome: "8. Detecção de Curva Calibrada (10s/20°)",
          cmd: "SZCS#ANGLEVALUE=10-020",
          tipo: "CRLF",
        },
        { nome: "9. Odômetro MCU (GT06METER)", cmd: "SZCS#GT06SEL=1#GT06METER=1", tipo: "CRLF" },
        { nome: "10. Protocolo Estendido IEXVOL", cmd: "SZCS#GT06IEXVOL=2", tipo: "CRLF" },
        { nome: "11. Sleep Inteligente CPU", cmd: "SZCS#MTK_DISSLP=0", tipo: "CRLF" },
        { nome: "12. Repouso GPS ao Parar", cmd: "SZCS#GPS_DISSLP=0", tipo: "CRLF" },
        {
          nome: "13. Manter Conexão Sleep (Zero Desconexão)",
          cmd: "SZCS#SLPDISCONNECT=0",
          tipo: "CRLF",
        },
        { nome: "14. Economia de Dados ao Parar", cmd: "SENDS,1#", tipo: "HASH" },
        { nome: "15. Alarme de Deslocamento e Guincho", cmd: "MOVING,ON,200,0#", tipo: "HASH" },
        {
          nome: "16. Alarme de Corte de Bateria Principal",
          cmd: "POWERALM,ON,0,5,10#",
          tipo: "HASH",
        },
        { nome: "17. Alarme de Bateria Backup Fraca", cmd: "BATALM,ON,0#", tipo: "HASH" },
        { nome: "18. Modo Defesa e Vigília Ativa", cmd: "DEFENSE,1#", tipo: "HASH" },
        { nome: "19. Alarme de Vibração e Choque", cmd: "SENALM,ON,0#", tipo: "HASH" },
        { nome: "20. Alarme Instantâneo de Ignição (ACC)", cmd: "ACCALM,ON,2#", tipo: "HASH" },
        { nome: "21. Desativação de LEDs Externos", cmd: "SZCS#LED_ENABLE=0", tipo: "CRLF" },
        { nome: "22. Nível Sensor Movimento G", cmd: "LEVEL,3#", tipo: "HASH" },
        { nome: "23. Leitura Auditoria PARAM#", cmd: "PARAM#", tipo: "HASH" },
        { nome: "24. Leitura Status Geral STATUS#", cmd: "STATUS#", tipo: "HASH" },
        { nome: "25. Reinicialização para Atualizar Lara", cmd: "RESET#", tipo: "HASH" },
      ];
    },
  },
  modem_at: {
    id: "modem_at",
    nome: "Modem Celular AT",
    badge: "Comandos Hayes (CRLF)",
    terminador: "CRLF",
    gerarComandoServidor: (srv, porta, modo) => ({
      cmd: `SERVER,${modo},${srv},${porta},0#`,
      terminador: "HASH",
    }),
    gerarComandoApn: (apn) => ({
      cmd: `AT+CGDCONT=1,"IP","${apn}"`,
      terminador: "CRLF",
    }),
    gerarComandoTimers: () => ({
      cmd: "AT+CPSMS=0",
      terminador: "CRLF",
    }),
    tituloTimers: "3. Gerenciamento de Energia e Conexão (LTE)",
    descTimers: "Manter modem online 24h sem entrar em modo de repouso",
    labelBotaoTimers: "Ativar Conexão Online 24h (CPSMS=0)",
    suportaTimersMovimento: false,
    suportaServidorViaSerial: false,
    atalhos: [
      {
        label: "Testar (AT)",
        cmd: "AT",
        desc: "Teste de comunicação do modem",
        cor: "text-orange-400",
      },
      {
        label: "IMEI (AT+CGSN)",
        cmd: "AT+CGSN",
        desc: "Consultar IMEI gravado no modem",
        cor: "text-orange-400",
      },
      {
        label: "ICCID (AT+CCID)",
        cmd: "AT+CCID",
        desc: "Consultar serial ICCID do chip M2M",
        cor: "text-amber-400",
      },
      {
        label: "Sinal 4G (AT+CSQ)",
        cmd: "AT+CSQ",
        desc: "Consultar sinal 4G LTE",
        cor: "text-amber-400",
      },
      {
        label: "Chip SIM (AT+CPIN?)",
        cmd: "AT+CPIN?",
        desc: "Status de desbloqueio do chip SIM",
        cor: "text-sky-400",
      },
      {
        label: "Operadora (AT+COPS?)",
        cmd: "AT+COPS?",
        desc: "Operadora móvel conectada",
        cor: "text-purple-400",
      },
      {
        label: "APN (AT+CGDCONT?)",
        cmd: "AT+CGDCONT?",
        desc: "Consultar APN e contextos PDP gravados",
        cor: "text-indigo-400",
      },
      {
        label: "Rede 4G (AT+CEREG?)",
        cmd: "AT+CEREG?",
        desc: "Status do registro na torre LTE",
        cor: "text-sky-300",
      },
      {
        label: "IP Dados (AT+CGPADDR=1)",
        cmd: "AT+CGPADDR=1",
        desc: "Consultar IP atribuído pela operadora",
        cor: "text-lime-400",
      },
      {
        label: "GNSS (AT+CGNSSINFO)",
        cmd: "AT+CGNSSINFO",
        desc: "Telemetria de satélites GNSS do módulo",
        cor: "text-slate-300",
      },
    ],
    comandosUmToque: [
      {
        titulo: "Testar Conexão",
        cmd: "AT",
        desc: "Verifica resposta básica do modem",
        categoria: "consulta",
      },
      {
        titulo: "Identificação do Módulo",
        cmd: "ATI",
        desc: "Fabricante, modelo SIMCom A76XX e firmware",
        categoria: "consulta",
      },
      {
        titulo: "Modelo do Chipset",
        cmd: "AT+CGMM",
        desc: "Identifica o código exato do hardware LTE",
        categoria: "consulta",
      },
      {
        titulo: "Versão do Firmware",
        cmd: "AT+CGMR",
        desc: "Revisão completa do firmware celular",
        categoria: "consulta",
      },
      {
        titulo: "Ler IMEI",
        cmd: "AT+CGSN",
        desc: "Identificador único IMEI do hardware",
        categoria: "consulta",
      },
      {
        titulo: "Ler ICCID do Chip",
        cmd: "AT+CCID",
        desc: "Número serial ICCID impresso no chip M2M",
        categoria: "consulta",
      },
      {
        titulo: "Status Chip SIM",
        cmd: "AT+CPIN?",
        desc: "Checa se o chip M2M está READY e desbloqueado",
        categoria: "consulta",
      },
      {
        titulo: "Operadora Conectada",
        cmd: "AT+COPS?",
        desc: "Rede da operadora e tecnologia 4G/2G ativa",
        categoria: "consulta",
      },
      {
        titulo: "Nível de Sinal",
        cmd: "AT+CSQ",
        desc: "Intensidade de recepção celular (0-31)",
        categoria: "consulta",
      },
      {
        titulo: "Registro Rede GSM",
        cmd: "AT+CREG?",
        desc: "Status do registro celular na rede base",
        categoria: "consulta",
      },
      {
        titulo: "Registro Rede 4G LTE",
        cmd: "AT+CEREG?",
        desc: "Conexão ativa na antena LTE da operadora",
        categoria: "consulta",
      },
      {
        titulo: "Consultar APNs (PDP)",
        cmd: "AT+CGDCONT?",
        desc: "Lista as APNs gravadas nos contextos de dados",
        categoria: "consulta",
      },
      {
        titulo: "Conexão de Dados (Attach)",
        cmd: "AT+CGATT?",
        desc: "Anexo ativo a pacotes de dados móveis",
        categoria: "consulta",
      },
      {
        titulo: "Estado Sessão PDP",
        cmd: "AT+CGACT?",
        desc: "Verifica quais perfis de dados estão ativos",
        categoria: "consulta",
      },
      {
        titulo: "Consultar IP Celular",
        cmd: "AT+CGPADDR=1",
        desc: "IP celular atribuído à sessão de dados",
        categoria: "consulta",
      },
      {
        titulo: "Consultar Repouso PSM",
        cmd: "AT+CPSMS?",
        desc: "Verifica se o Power Saving Mode LTE está inativo",
        categoria: "consulta",
      },
      {
        titulo: "Estado Rede TCP (SIMCom)",
        cmd: "AT+NETOPEN?",
        desc: "Consulta status da pilha TCP/IP SIMCom A76XX",
        categoria: "consulta",
      },
      {
        titulo: "Sockets Abertos (CIPOPEN)",
        cmd: "AT+CIPOPEN?",
        desc: "Lista sockets TCP/UDP abertos no módulo LTE",
        categoria: "consulta",
      },
      {
        titulo: "Telemetria GNSS",
        cmd: "AT+CGNSSINFO",
        desc: "Coordenadas e satélites GNSS se expostos no modem",
        categoria: "consulta",
      },
      {
        titulo: "Reiniciar para Lara",
        cmd: "AT+CFUN=1,1",
        desc: "Reinicia o modem celular para aplicar APN e reconectar",
        categoria: "acao",
        estilo: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      },
    ],
    gerarFilaPadraoCanonico: ({ apn }) => [
      { nome: "1. Sincronismo Inicial (AT)", cmd: "AT", tipo: "CRLF" },
      { nome: "2. Desativação de Eco Local (ATE0)", cmd: "ATE0", tipo: "CRLF" },
      { nome: "3. Identificação do Módulo LTE (ATI)", cmd: "ATI", tipo: "CRLF" },
      { nome: "4. Leitura e Confirmação de IMEI (AT+CGSN)", cmd: "AT+CGSN", tipo: "CRLF" },
      { nome: "5. Leitura do ICCID do Chip M2M (AT+CCID)", cmd: "AT+CCID", tipo: "CRLF" },
      { nome: "6. Checagem do Chip SIM (AT+CPIN?)", cmd: "AT+CPIN?", tipo: "CRLF" },
      { nome: "7. Nível de Sinal Celular M2M (AT+CSQ)", cmd: "AT+CSQ", tipo: "CRLF" },
      { nome: "8. Operadora Celular Conectada (AT+COPS?)", cmd: "AT+COPS?", tipo: "CRLF" },
      {
        nome: "9. Gravar APN M2M no Modem (AT+CGDCONT)",
        cmd: `AT+CGDCONT=1,"IP","${apn}"`,
        tipo: "CRLF",
      },
      { nome: "10. Auditoria de APN Gravada (AT+CGDCONT?)", cmd: "AT+CGDCONT?", tipo: "CRLF" },
      {
        nome: "11. Manter Modem Online 24h sem Repouso (AT+CPSMS)",
        cmd: "AT+CPSMS=0",
        tipo: "CRLF",
      },
      { nome: "12. Registro na Rede 4G LTE (AT+CEREG?)", cmd: "AT+CEREG?", tipo: "CRLF" },
      { nome: "13. Anexo de Pacote de Dados (AT+CGATT=1)", cmd: "AT+CGATT=1", tipo: "CRLF" },
      { nome: "14. IP Celular da Sessão (AT+CGPADDR=1)", cmd: "AT+CGPADDR=1", tipo: "CRLF" },
      { nome: "15. Reinicialização para Atualizar Lara", cmd: "AT+CFUN=1,1", tipo: "CRLF" },
    ],
  },
  coban_tk: {
    id: "coban_tk",
    nome: "Coban / TK (TK103)",
    badge: "Protocolo Coban (CRLF)",
    terminador: "CRLF",
    gerarComandoServidor: (srv, porta) => ({
      cmd: `adminip123456 ${srv} ${porta}`,
      terminador: "CRLF",
    }),
    gerarComandoApn: (apn, user, pass) => ({
      cmd: user && pass ? `apn123456 ${apn} ${user} ${pass}` : `apn123456 ${apn}`,
      terminador: "CRLF",
    }),
    gerarComandoTimers: (mov) => ({
      cmd: `fix${mov.padStart(3, "0")}s***n123456`,
      terminador: "CRLF",
    }),
    tituloTimers: "3. Timers e Frequência de Transmissão",
    descTimers: "Intervalos canônicos de rastreamento (segundos)",
    labelBotaoTimers: "Gravar Timers de Rastreamento",
    suportaTimersMovimento: true,
    suportaServidorViaSerial: true,
    atalhos: [
      {
        label: "Verificar (check123456)",
        cmd: "check123456",
        desc: "Checar configuração geral",
        cor: "text-sky-400",
      },
      {
        label: "Status (status123456)",
        cmd: "status123456",
        desc: "Status do rastreador",
        cor: "text-purple-400",
      },
      {
        label: "Ler IMEI (imei123456)",
        cmd: "imei123456",
        desc: "Ler IMEI",
        cor: "text-orange-400",
      },
      {
        label: "Maps / GPS (G123456#)",
        cmd: "G123456#",
        desc: "Link de localização GPS Coban",
        cor: "text-orange-400",
      },
    ],
    comandosUmToque: [
      {
        titulo: "Verificar Configuração",
        cmd: "check123456",
        desc: "Auditoria de parâmetros gravados",
        categoria: "consulta",
      },
      {
        titulo: "Status Geral",
        cmd: "status123456",
        desc: "Diagnóstico de bateria e GPS",
        categoria: "consulta",
      },
      {
        titulo: "Ler IMEI",
        cmd: "imei123456",
        desc: "Consulta número de identificação",
        categoria: "consulta",
      },
      {
        titulo: "Localização Maps",
        cmd: "G123456#",
        desc: "Retorna posição GPS e link do Google Maps",
        categoria: "consulta",
      },
      {
        titulo: "Modo Dados GPRS",
        cmd: "gprs123456",
        desc: "Habilita transmissão de dados",
        categoria: "acao",
      },
      {
        titulo: "Cancelar Timers",
        cmd: "nofix123456",
        desc: "Suspende envio periódico",
        categoria: "acao",
      },
      {
        titulo: "Reiniciar para Lara",
        cmd: "reset123456",
        desc: "Reinicia o rastreador para atualizar o Lara",
        categoria: "acao",
        estilo: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      },
    ],
    gerarFilaPadraoCanonico: ({ srv, porta, apn, user, pass, mov }) => [
      { nome: "1. Habilitar Modo GPRS", cmd: "gprs123456", tipo: "CRLF" },
      { nome: "2. Apontamento Servidor", cmd: `adminip123456 ${srv} ${porta}`, tipo: "CRLF" },
      {
        nome: "3. APN Chip Celular",
        cmd: user && pass ? `apn123456 ${apn} ${user} ${pass}` : `apn123456 ${apn}`,
        tipo: "CRLF",
      },
      {
        nome: "4. Timers Rastreamento",
        cmd: `fix${mov.padStart(3, "0")}s***n123456`,
        tipo: "CRLF",
      },
      { nome: "5. Fuso Horário GMT Zero", cmd: "time zone123456 0", tipo: "CRLF" },
      { nome: "6. Auditoria Geral", cmd: "check123456", tipo: "CRLF" },
      { nome: "7. Reinicialização para Atualizar Lara", cmd: "reset123456", tipo: "CRLF" },
    ],
  },
  g900l: {
    id: "g900l",
    nome: "G900L / A76XX (GT06 4G LTE)",
    badge: "G900L 4G (Hayes AT / GT06)",
    terminador: "CRLF",
    gerarComandoServidor: (srv, porta) => ({
      cmd: `adminip123456 ${srv} ${porta}`,
      terminador: "CRLF",
    }),
    gerarComandoApn: (apn) => ({
      cmd: `AT+CGDCONT=1,"IP","${apn}"`,
      terminador: "CRLF",
    }),
    gerarComandoTimers: (mov) => ({
      cmd: `fix${mov.padStart(3, "0")}s***n123456`,
      terminador: "CRLF",
    }),
    tituloTimers: "3. Timers e Frequência de Transmissão (G900L)",
    descTimers: "Intervalos canônicos de rastreamento do G900L (segundos)",
    labelBotaoTimers: "Gravar Timers G900L",
    suportaTimersMovimento: true,
    suportaServidorViaSerial: true,
    atalhos: [
      {
        label: "Testar (AT)",
        cmd: "AT",
        desc: "Teste de comunicação direta do modem",
        cor: "text-orange-400",
      },
      {
        label: "Identificar (ATI)",
        cmd: "ATI",
        desc: "Identificação do módulo e versão SIMCom",
        cor: "text-orange-400",
      },
      {
        label: "IMEI (AT+CGSN)",
        cmd: "AT+CGSN",
        desc: "Consultar IMEI gravado no módulo LTE",
        cor: "text-purple-400",
      },
      {
        label: "ICCID (AT+CICCID)",
        cmd: "AT+CICCID",
        desc: "Consultar ICCID do chip SIM M2M (SIMCom)",
        cor: "text-amber-400",
      },
      {
        label: "ICCID Legado (AT+CCID)",
        cmd: "AT+CCID",
        desc: "Consultar serial ICCID em modems genéricos",
        cor: "text-amber-300",
      },
      {
        label: "Chip SIM (AT+CPIN?)",
        cmd: "AT+CPIN?",
        desc: "Checar se o chip está READY e inserido",
        cor: "text-sky-400",
      },
      {
        label: "Sinal 4G (AT+CSQ)",
        cmd: "AT+CSQ",
        desc: "Intensidade do sinal celular (0-31)",
        cor: "text-lime-400",
      },
      {
        label: "Operadora (AT+COPS?)",
        cmd: "AT+COPS?",
        desc: "Operadora de rede conectada (ex: Claro BR)",
        cor: "text-sky-300",
      },
      {
        label: "APN (AT+CGDCONT?)",
        cmd: "AT+CGDCONT?",
        desc: "Consultar APN configurada no modem",
        cor: "text-indigo-400",
      },
      {
        label: "Rede 4G (AT+CEREG?)",
        cmd: "AT+CEREG?",
        desc: "Status de registro na antena 4G LTE",
        cor: "text-cyan-400",
      },
      {
        label: "Registro Linha (AT+CREG?)",
        cmd: "AT+CREG?",
        desc: "Status de registro de rede celular voz e SMS",
        cor: "text-cyan-300",
      },
      {
        label: "Centro SMSC (AT+CSCA?)",
        cmd: "AT+CSCA?",
        desc: "Número do centro de mensagens SMS da operadora",
        cor: "text-purple-300",
      },
      {
        label: "IP Dados (AT+CGPADDR=1)",
        cmd: "AT+CGPADDR=1",
        desc: "Consultar IP atribuído pela operadora",
        cor: "text-emerald-400",
      },
      {
        label: "Auth APN (AT+CGAUTH)",
        cmd: 'AT+CGAUTH=1,1,"algar","1212"',
        desc: "Gravar credenciais PAP da APN M2M",
        cor: "text-indigo-400",
      },
      {
        label: "Gravar NVRAM (AT&W)",
        cmd: "AT&W",
        desc: "Salvar configurações ativas na memória permanente do modem",
        cor: "text-amber-400",
      },
      {
        label: "Modo Texto SMS (AT+CMGF=1)",
        cmd: "AT+CMGF=1",
        desc: "Configurar formato de texto para mensagens SMS",
        cor: "text-emerald-400",
      },
      {
        label: "Ler SMS (AT+CMGL)",
        cmd: 'AT+CMGL="ALL"',
        desc: "Listar todas as mensagens SMS na caixa de entrada",
        cor: "text-sky-300",
      },
      {
        label: "Ativar Dados (AT+CGACT=1,1)",
        cmd: "AT+CGACT=1,1",
        desc: "Ativar contexto de dados PDP 4G",
        cor: "text-emerald-400",
      },
      {
        label: "Pilha TCP (AT+NETOPEN)",
        cmd: "AT+NETOPEN",
        desc: "Abrir stack TCP/IP SIMCom",
        cor: "text-cyan-400",
      },
      {
        label: "Conectar GD 7003 (CIPOPEN)",
        cmd: 'AT+CIPOPEN=0,"TCP","167.234.233.82",7003',
        desc: "Conectar socket TCP GD Segurança",
        cor: "text-sky-300",
      },
      {
        label: "Status Sockets (AT+CIPOPEN?)",
        cmd: "AT+CIPOPEN?",
        desc: "Listar conexões ativas no modem",
        cor: "text-sky-400",
      },
      {
        label: "Status Stack (AT+NETOPEN?)",
        cmd: "AT+NETOPEN?",
        desc: "Consultar se a pilha de rede está aberta",
        cor: "text-cyan-300",
      },
      {
        label: "Auditoria MCU (check123456)",
        cmd: "check123456",
        desc: "Consultar parâmetros salvos na MCU (via TTL ou SMS)",
        cor: "text-amber-300",
      },
      {
        label: "Status MCU (status123456)",
        cmd: "status123456",
        desc: "Consultar status geral da placa G900L (via TTL ou SMS)",
        cor: "text-emerald-300",
      },
      {
        label: "Servidor GT06 (SERVER#)",
        cmd: "SERVER#",
        desc: "Consultar servidor GT06 na MCU (via TTL ou SMS)",
        cor: "text-orange-300",
      },
      {
        label: "Parâmetros GT06 (PARAM#)",
        cmd: "PARAM#",
        desc: "Consultar IP, porta e timers GT06 na MCU (via TTL ou SMS)",
        cor: "text-purple-300",
      },
      {
        label: "Status GT06 (STATUS#)",
        cmd: "STATUS#",
        desc: "Consultar status GT06 na MCU (via TTL ou SMS)",
        cor: "text-sky-200",
      },
      {
        label: "Reiniciar (AT+CFUN=1,1)",
        cmd: "AT+CFUN=1,1",
        desc: "Reiniciar modem para aplicar dados",
        cor: "text-rose-400",
      },
    ],
    comandosUmToque: [
      {
        titulo: "Testar Comunicação",
        cmd: "AT",
        desc: "Verifica resposta direta do modem SIMCom A76XX",
        categoria: "consulta",
      },
      {
        titulo: "Identificação do Módulo",
        cmd: "ATI",
        desc: "Modelo do módulo celular e revisão de firmware",
        categoria: "consulta",
      },
      {
        titulo: "Ler IMEI",
        cmd: "AT+CGSN",
        desc: "Número de série IMEI do rastreador G900L",
        categoria: "consulta",
      },
      {
        titulo: "Ler ICCID do Chip (SIMCom)",
        cmd: "AT+CICCID",
        desc: "Número serial ICCID do chip M2M via comando SIMCom",
        categoria: "consulta",
      },
      {
        titulo: "Status Chip SIM",
        cmd: "AT+CPIN?",
        desc: "Confirma se o chip M2M está desbloqueado (READY)",
        categoria: "consulta",
      },
      {
        titulo: "Nível de Sinal 4G",
        cmd: "AT+CSQ",
        desc: "Intensidade da recepção de sinal celular",
        categoria: "consulta",
      },
      {
        titulo: "Operadora Conectada",
        cmd: "AT+COPS?",
        desc: "Operadora de dados conectada no chip",
        categoria: "consulta",
      },
      {
        titulo: "Registro na Torre 4G",
        cmd: "AT+CEREG?",
        desc: "Confirma conexão na antena LTE da operadora",
        categoria: "consulta",
      },
      {
        titulo: "Consultar APN Gravada",
        cmd: "AT+CGDCONT?",
        desc: "Lista APNs e contextos de dados ativos",
        categoria: "consulta",
      },
      {
        titulo: "Consultar IP Celular",
        cmd: "AT+CGPADDR=1",
        desc: "Endereço IP atribuído à sessão de dados",
        categoria: "consulta",
      },
      {
        titulo: "Auditoria Geral MCU",
        cmd: "check123456",
        desc: "Consulta IP, porta e APN gravados na placa G900L",
        categoria: "consulta",
      },
      {
        titulo: "Status Operacional MCU",
        cmd: "status123456",
        desc: "Diagnóstico de bateria, GPS e rede da placa",
        categoria: "consulta",
      },
      {
        titulo: "Parâmetros GT06",
        cmd: "PARAM#",
        desc: "Consulta parâmetros gravados se placa em modo GT06",
        categoria: "consulta",
      },
      {
        titulo: "Status GT06",
        cmd: "STATUS#",
        desc: "Bateria, ACC, relé e GPS se placa em modo GT06",
        categoria: "consulta",
      },
      {
        titulo: "Ativar Conexão 4G (PDP)",
        cmd: "AT+CGACT=1,1",
        desc: "Ativa contexto de dados móveis 4G na operadora",
        categoria: "acao",
        estilo: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      },
      {
        titulo: "Abrir Stack TCP/IP",
        cmd: "AT+NETOPEN",
        desc: "Inicia a pilha de conexão TCP/IP no módulo A76XX",
        categoria: "acao",
        estilo: "bg-cyan-500/10 text-cyan-500 border-cyan-500/30",
      },
      {
        titulo: "Reiniciar Modem LTE",
        cmd: "AT+CFUN=1,1",
        desc: "Aplica parâmetros e reinicia o modem celular",
        categoria: "acao",
        estilo: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      },
      {
        titulo: "Reset da Placa G900L",
        cmd: "reset123456",
        desc: "Reinicia a controladora interna do G900L",
        categoria: "acao",
        estilo: "bg-rose-500/10 text-rose-500 border-rose-500/30",
      },
    ],
    gerarFilaPadraoCanonico: ({ srv, porta, apn, user, pass }) => {
      const fila = [
        { nome: "1. Sincronismo Inicial (AT)", cmd: "AT", tipo: "CRLF" as const },
        { nome: "2. Desativação de Eco Local (ATE0)", cmd: "ATE0", tipo: "CRLF" as const },
        { nome: "3. Identificação do Módulo G900L (ATI)", cmd: "ATI", tipo: "CRLF" as const },
        { nome: "4. Leitura do IMEI (AT+CGSN)", cmd: "AT+CGSN", tipo: "CRLF" as const },
        {
          nome: "5. Leitura do ICCID do Chip M2M (AT+CICCID)",
          cmd: "AT+CICCID",
          tipo: "CRLF" as const,
        },
        { nome: "6. Checagem do Chip SIM (AT+CPIN?)", cmd: "AT+CPIN?", tipo: "CRLF" as const },
        { nome: "7. Nível de Sinal Celular (AT+CSQ)", cmd: "AT+CSQ", tipo: "CRLF" as const },
        { nome: "8. Operadora Celular (AT+COPS?)", cmd: "AT+COPS?", tipo: "CRLF" as const },
        {
          nome: "9. Gravar APN M2M (AT+CGDCONT)",
          cmd: `AT+CGDCONT=1,"IP","${apn}"`,
          tipo: "CRLF" as const,
        },
      ];

      if (user && pass) {
        fila.push({
          nome: "10. Autenticação APN M2M (AT+CGAUTH)",
          cmd: `AT+CGAUTH=1,1,"${user}","${pass}"`,
          tipo: "CRLF" as const,
        });
      }

      fila.push(
        {
          nome: "11. Auditoria de APN Gravada (AT+CGDCONT?)",
          cmd: "AT+CGDCONT?",
          tipo: "CRLF" as const,
        },
        {
          nome: "12. Manter Conexão Online 24h sem Repouso (AT+CPSMS)",
          cmd: "AT+CPSMS=0",
          tipo: "CRLF" as const,
        },
        {
          nome: "13. Registro na Rede 4G LTE (AT+CEREG?)",
          cmd: "AT+CEREG?",
          tipo: "CRLF" as const,
        },
        {
          nome: "14. Anexo aos Pacotes de Dados (AT+CGATT=1)",
          cmd: "AT+CGATT=1",
          tipo: "CRLF" as const,
        },
        {
          nome: "15. Ativação da Sessão de Dados (AT+CGACT=1,1)",
          cmd: "AT+CGACT=1,1",
          tipo: "CRLF" as const,
        },
        {
          nome: "16. Consulta IP Celular da Sessão (AT+CGPADDR=1)",
          cmd: "AT+CGPADDR=1",
          tipo: "CRLF" as const,
        },
        { nome: "17. Iniciar Stack TCP/IP (AT+NETOPEN)", cmd: "AT+NETOPEN", tipo: "CRLF" as const },
        {
          nome: "18. Conectar Socket TCP GD Segurança (AT+CIPOPEN)",
          cmd: `AT+CIPOPEN=0,"TCP","${srv}",${porta}`,
          tipo: "CRLF" as const,
        },
        {
          nome: "19. Persistir Perfil na Memória NVRAM do Modem (AT&W)",
          cmd: "AT&W",
          tipo: "CRLF" as const,
        },
        {
          nome: "20. Auditoria de SMS Recebidos na Caixa de Entrada (AT+CMGL)",
          cmd: 'AT+CMGL="ALL"',
          tipo: "CRLF" as const,
        },
      );

      return fila;
    },
  },
};

/**
 * Parâmetros Canônicos do GD Rastreamento (Padrão em uso no sistema)
 * Usado pelo Modo B do terminal e pelo painel de gravação via SMS / MCU
 */
export const PARAMETROS_CANONICOS_SISTEMA_GD = {
  servidor: "167.234.233.82",
  porta: "7003",
  apn: "voxter.br",
  usuarioApn: "algar",
  senhaApn: "1212",
  timerMovimento: "30",
  timerParado: "3600",
  heartbeat: "300",
  fusoGmt: "0",
  // Padrão G900L / Cantrack / Coban (Padrão canônico L200: ITV:10,3600, TZ:0,0, WM:1)
  g900l: {
    servidor: "adminip123456 167.234.233.82 7003",
    apn: "apn123456 voxter.br algar 1212",
    timerMovimento: "fix010s060m***n123456",
    heartbeat: "hbt123456 300",
    fuso: "time zone123456 0",
    check: "check123456",
    status: "status123456",
    reset: "reset123456",
  },
  // Padrão GT06 / WanWay / Concox (J16)
  gt06: {
    servidor: "SERVER,0,167.234.233.82,7003,0#",
    apn: "APN,voxter.br,algar,1212#",
    timers: "TIMER,30,3600#",
    heartbeat: "HBT,300,300#",
    fuso: "GMT,W,0,0#",
    check: "PARAM#",
    status: "STATUS#",
    reset: "RESET#",
  },
  // Padrão Micodus / Cantrack Hash
  cantrackHash: {
    servidor: "SERVER#167.234.233.82#7003#",
    apn: "APN#voxter.br#algar#1212#",
    timerMovimento: "FREQ#30#",
    heartbeat: "HBT#300#",
    fuso: "TIMEZONE#0#",
    check: "CXZT#",
    status: "STATUS#",
  },
};
