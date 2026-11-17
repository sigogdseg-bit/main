import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Radio,
  Copy,
  Check,
  Zap,
  Globe,
  Server,
  Cpu,
  Clock,
  SlidersHorizontal,
  Terminal,
  Send,
  RefreshCw,
  Car,
  Power,
  BatteryCharging,
  Signal,
  Layers,
  Wifi,
  CheckCircle2,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  Play,
  X,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Gauge,
  Lock,
  Unlock,
  ShieldAlert,
  Smartphone,
  Shield,
  Save,
  Usb,
  Scale,
  Key,
  Eye,
  EyeOff,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  PhoneCall,
  Settings,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { TiltCard } from "@/shared/components/TiltCard";
import {
  ehComandoConsultaSomenteLeitura,
  sanitizarComandoHardware,
} from "@/shared/lib/hunterHardwareComandos";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import { dispararNotificacaoNativaAlerta } from "@/shared/lib/webPushService";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import {
  adicionarComandoEmAguardo,
  marcarComandoConcluido,
  carregarLogsHistoricoConsole,
  salvarLogNoHistoricoConsole,
  limparHistoricoLogsConsole,
  obterCanaisAlerta,
  salvarCanaisAlerta,
  inscreverAtualizacaoCanais,
  type CanaisAlertaComandoAguardo,
} from "../services/comandosEmAguardoService";
import { ModalConfiguracaoCanaisAlerta } from "./ModalConfiguracaoCanaisAlerta";
import { AbaConfiguracaoUsb } from "./AbaConfiguracaoUsb";
import { AbaSimuladorCargaRastreadores } from "./AbaSimuladorCargaRastreadores";
import {
  AbaComparativoPadroesRastreador,
  type ParametrosPadraoComparativo,
} from "./AbaComparativoPadroesRastreador";

interface ParametrosHardwareAuditados {
  apn?: string | null;
  dns?: string | null;
  porta?: string | null;
  usuario?: string | null;
  senha?: string | null;
  freq?: string | null;
  hbt?: string | null;
  carreg?: string | null;
  sleep?: string | null;
  relay?: string | null; // "1" (Cortado/Bloqueado) | "0" (Liberado/Normal)
  meter?: string | null; // "1" (Medição interna GT06METER ativa) | "0"
  iexvol?: string | null; // "2" (Pacotes estendidos de voltagem e odômetro) | "0"
  odometro?: number | string | null;
  sos?: string | null;
  center?: string | null;
  jammer?: string | null;
  senalm?: string | null;
  moving?: string | null;
  vibl?: string | null;
  angulo?: string | null; // Detecção de curva (ex: "3-015" ou "15°")
  sends?: string | null; // Duração do GPS ligado após parar (em minutos, ex: "1", "5", "300")
  defense?: string | null;
  batalm?: string | null;
  poweralm?: string | null;
  slpdisconnect?: string | null;
  accline?: string | null;
  angleSend?: string | null;
  mtkDisslp?: string | null;
  gpsDisslp?: string | null;
  leds?: string | null; // "1" (LEDs Ativos) | "0" (Modo Discreto)
  password?: string | null;
  auditadoEm?: string | null;
  respostaBruta?: string | null;
}

export interface ComandoEmAguardoItem {
  id: string;
  imei: string;
  placa?: string;
  modelo?: string;
  clienteNome?: string;
  comando: string;
  horaDisparo: string;
  timestampInicio: number;
  hbtSegundos: number; // Ex: 300s se desligado, ou 30s se ligado
  segundosRestantes: number;
  status: "aguardando" | "concluido" | "cancelado";
  respostaHardware?: string;
}

function extrairParametrosDeRespostaJ16(
  resposta: string,
  ultimoComandoEnviado?: string,
): Partial<ParametrosHardwareAuditados> {
  const result: Partial<ParametrosHardwareAuditados> = {
    auditadoEm: new Date().toISOString(),
    respostaBruta: resposta,
  };

  const upper = (resposta || "").toUpperCase();
  const cmdUpper = (ultimoComandoEnviado || "").toUpperCase();

  // Se o hardware respondeu com erro explícito ou rejeição, não extrai nem assume parâmetros
  if (
    upper.includes("ERROR") ||
    upper.includes("FAIL") ||
    upper.includes("REJECT") ||
    upper.includes("WRONG") ||
    upper.includes("NOT SUPPORT") ||
    upper.includes("PASSWORD ERROR") ||
    upper.includes("INVALID")
  ) {
    return result;
  }

  // 1. APN (ex: "APN:voxter.br,algar,1212;" ou "APN,voxter.br,algar,1212#" ou confirmação "APN:OK" / "SETOK")
  const matchApn = resposta.match(
    /(?:SETOK:\s*)?APN[:=,\s]([a-zA-Z0-9._-]+)(?:[,:]([a-zA-Z0-9._-]+))?(?:[,:]([a-zA-Z0-9._-]+))?/i,
  );
  if (matchApn && matchApn[1] && !matchApn[1].toUpperCase().includes("OK")) {
    result.apn = matchApn[1];
    if (matchApn[2]) result.usuario = matchApn[2];
    if (matchApn[3]) result.senha = matchApn[3];
  } else if (
    (upper.includes("APN:OK") ||
      upper.includes("APN,OK") ||
      (upper.includes("OK") && cmdUpper.startsWith("APN,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/APN,([^,#]+)(?:,([^,#]+))?(?:,([^,#]+))?#/i);
    if (matchCmd) {
      if (matchCmd[1]) result.apn = matchCmd[1];
      if (matchCmd[2]) result.usuario = matchCmd[2];
      if (matchCmd[3]) result.senha = matchCmd[3];
    }
  }

  // 2. SERVER / DNS / IP (ex: "SERVER:1,gps.oficial.tec.br,7003,0;" ou confirmação "SERVER:OK")
  const matchServer =
    resposta.match(/(?:SETOK:\s*)?SERVER[:=,\s](?:[0-1],)?([a-zA-Z0-9._-]+),(\d+)/i) ||
    resposta.match(/(?:SETOK:\s*)?IP[:=,\s]([a-zA-Z0-9._-]+),(\d+)/i) ||
    resposta.match(/(?:SETOK:\s*)?DNS[:=,\s]([a-zA-Z0-9._-]+),(\d+)/i);
  if (matchServer && !matchServer[1].toUpperCase().includes("OK")) {
    result.dns = matchServer[1];
    result.porta = matchServer[2];
  } else if (
    (upper.includes("SERVER:OK") ||
      upper.includes("IP:OK") ||
      upper.includes("DNS:OK") ||
      (upper.includes("OK") && cmdUpper.startsWith("SERVER,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/SERVER,[0-1],([^,#]+),(\d+)/i);
    if (matchCmd) {
      result.dns = matchCmd[1];
      result.porta = matchCmd[2];
    }
  }

  // 3. TIMER / FREQ (ex: "TIMER ACC ON:15s, ACC OFF:1800s" ou "TIMER:15,1800" ou confirmação "TIMER:OK")
  const matchTimerAcc = resposta.match(/TIMER\s+ACC\s+ON:(\d+)s?,\s*ACC\s+OFF:(\d+)s?/i);
  if (matchTimerAcc) {
    result.freq = `${matchTimerAcc[1]}-${matchTimerAcc[2]}`;
  } else {
    const matchTimer =
      resposta.match(/(?:SETOK:\s*)?TIMER[:=,\s](\d+)(?:[,\-;](\d+))?/i) ||
      resposta.match(/(?:SETOK:\s*)?FREQ[:=,\s](\d+)(?:[-,;](\d+))?/i) ||
      resposta.match(/(?:SETOK:\s*)?GAPTIME[:=,\s](\d+)(?:[-,;](\d+))?/i);
    if (matchTimer && !matchTimer[1].toUpperCase().includes("OK")) {
      const t1 = matchTimer[1];
      const t2 = matchTimer[2] || "0";
      result.freq = `${t1}-${t2}`;
    } else if (
      (upper.includes("TIMER:OK") ||
        upper.includes("TIMER,OK") ||
        (upper.includes("OK") && cmdUpper.startsWith("TIMER,"))) &&
      ultimoComandoEnviado
    ) {
      const matchCmd = ultimoComandoEnviado.match(/TIMER,(\d+),(\d+)#/i);
      if (matchCmd) {
        result.freq = `${matchCmd[1]}-${matchCmd[2]}`;
      }
    }
  }

  // 4. HBT (ex: "HBT:120" ou "HBT=120" ou confirmação "HBT:OK")
  const matchHbt = resposta.match(/(?:SETOK:\s*)?HBT[:=,\s](\d+)/i);
  if (matchHbt && !matchHbt[1].toUpperCase().includes("OK")) {
    result.hbt = matchHbt[1];
  } else if (
    (upper.includes("HBT:OK") ||
      upper.includes("HBT,OK") ||
      (upper.includes("OK") && cmdUpper.startsWith("HBT,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/HBT,(\d+)/i);
    if (matchCmd) {
      result.hbt = matchCmd[1];
    }
  }

  // 5. SLEEP (ex: "SLEEP:18000-0" ou "READOK: MTK_DISSLP=0" ou "SETOK: SLPDISCONNECT=0")
  const matchSleep =
    resposta.match(/(?:(?:SETOK|READOK):\s*)?SLEEP[:=,\s]([0-9]+(?:[-,\s][0-9]+)?)/i) ||
    resposta.match(/(?:(?:SETOK|READOK):\s*)?SLPDISCONNECT[:=,\s]([0-9]+)/i) ||
    resposta.match(/(?:(?:SETOK|READOK):\s*)?MTK_DISSLP[:=,\s]([0-9]+)/i) ||
    resposta.match(/(?:(?:SETOK|READOK):\s*)?GPS_DISSLP[:=,\s]([0-9]+)/i);
  if (matchSleep) {
    result.sleep = matchSleep[1].replace(/[, ]/g, "-");
  }

  // 5.1 SENDS (Duração de vigília do GPS após parar, em minutos, ex: "SENDS:1" ou "SENDS:300;")
  const matchSends = resposta.match(/SENDS[:=,\s](\d+)/i);
  if (matchSends) {
    result.sends = matchSends[1];
  }

  // 6. CARREG / CHARGE / POWER (ex: "CHARGE:1" ou "POWER:ON" ou "CARREG:1")
  if (
    upper.includes("CHARGE:1") ||
    upper.includes("POWER:ON") ||
    upper.includes("CARREG:1") ||
    upper.includes("CHARGING:1") ||
    upper.includes("EXT:1") ||
    upper.includes("VEXT:ON")
  ) {
    result.carreg = "1";
  } else if (
    upper.includes("CHARGE:0") ||
    upper.includes("POWER:OFF") ||
    upper.includes("CARREG:0") ||
    upper.includes("CHARGING:0") ||
    upper.includes("EXT:0") ||
    upper.includes("VEXT:OFF") ||
    upper.includes("CUT")
  ) {
    result.carreg = "0";
  }

  // 7. RELAY / CORTE (ex: "Relay:CUT" / "Relay:RESUME" / "RELAY:1" / "RELAY:0")
  if (
    upper.includes("RELAY:CUT") ||
    upper.includes("RELAY:1") ||
    upper.includes("RELAY,1=SUCCESS") ||
    upper.includes("DYD=SUCCESS")
  ) {
    result.relay = "1";
  } else if (
    upper.includes("RELAY:RESUME") ||
    upper.includes("RELAY:0") ||
    upper.includes("RELAY,0=SUCCESS") ||
    upper.includes("HFYD=SUCCESS")
  ) {
    result.relay = "0";
  }

  // 8. GT06METER (Medição interna de distância)
  if (
    upper.includes("GT06METER=1") ||
    upper.includes("GT06METER=.O") ||
    upper.includes("GT06METER:1")
  ) {
    result.meter = "1";
  } else if (upper.includes("GT06METER=0") || upper.includes("GT06METER:0")) {
    result.meter = "0";
  } else if (
    (upper.includes("SZCS:OK") || (upper.includes("OK") && cmdUpper.includes("SZCS#"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.includes("GT06METER=1")) result.meter = "1";
    if (ultimoComandoEnviado.includes("GT06METER=0")) result.meter = "0";
    const matchVib = ultimoComandoEnviado.match(/VIBL=(\d+)/i);
    if (matchVib) result.vibl = matchVib[1];
  }

  // 9. SOS (ex: "SOS:13122012031" ou "SOS,A,13122012031#")
  const matchSos = resposta.match(/SOS[:=,\sA]*([0-9]{8,15})/i);
  if (matchSos && matchSos[1]) {
    result.sos = matchSos[1];
  } else if (
    (upper.includes("SOS:OK") || (upper.includes("OK") && cmdUpper.startsWith("SOS,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/SOS,[A-Z],([0-9]+)/i);
    if (matchCmd) result.sos = matchCmd[1];
  }

  // 10. CENTER (ex: "CENTER:13122012031" ou "CENTER,A,13122012031#")
  const matchCenter = resposta.match(/CENTER[:=,\sA]*([0-9]{8,15})/i);
  if (matchCenter && matchCenter[1]) {
    result.center = matchCenter[1];
  } else if (
    (upper.includes("CENTER:OK") || (upper.includes("OK") && cmdUpper.startsWith("CENTER,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/CENTER,[A-Z],([0-9]+)/i);
    if (matchCmd) result.center = matchCmd[1];
  }

  // 11. JAMMER (Anti-jammer RF)
  if (upper.includes("JAMMER:ON") || upper.includes("JAMMER=ON") || upper.includes("JAMMER,ON")) {
    result.jammer = "ON";
  } else if (
    upper.includes("JAMMER:OFF") ||
    upper.includes("JAMMER=OFF") ||
    upper.includes("JAMMER,OFF")
  ) {
    result.jammer = "OFF";
  } else if (
    (upper.includes("JAMMER:OK") || (upper.includes("OK") && cmdUpper.startsWith("JAMMER,"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.toUpperCase().includes("JAMMER,ON")) result.jammer = "ON";
    if (ultimoComandoEnviado.toUpperCase().includes("JAMMER,OFF")) result.jammer = "OFF";
  }

  // 12. SENALM (Sensor de movimento / guincho)
  if (upper.includes("SENALM:ON") || upper.includes("SENALM=ON") || upper.includes("SENALM,ON")) {
    result.senalm = "ON";
  } else if (
    upper.includes("SENALM:OFF") ||
    upper.includes("SENALM=OFF") ||
    upper.includes("SENALM,OFF")
  ) {
    result.senalm = "OFF";
  } else if (
    (upper.includes("SENALM:OK") || (upper.includes("OK") && cmdUpper.startsWith("SENALM,"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.toUpperCase().includes("SENALM,ON")) result.senalm = "ON";
    if (ultimoComandoEnviado.toUpperCase().includes("SENALM,OFF")) result.senalm = "OFF";
  }

  // 12.1 MOVING (Alerta de deslocamento / guincho)
  const matchMoving = resposta.match(/MOVING[:=,\s](ON|OFF)(?:,([0-9]+))?(?:,([0-9]+))?/i);
  if (matchMoving && matchMoving[1]) {
    result.moving = matchMoving[1].toUpperCase();
  } else if (
    upper.includes("MOVING:ON") ||
    upper.includes("MOVING=ON") ||
    upper.includes("MOVING,ON")
  ) {
    result.moving = "ON";
  } else if (
    upper.includes("MOVING:OFF") ||
    upper.includes("MOVING=OFF") ||
    upper.includes("MOVING,OFF")
  ) {
    result.moving = "OFF";
  } else if (
    (upper.includes("MOVING:OK") || (upper.includes("OK") && cmdUpper.startsWith("MOVING,"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.toUpperCase().includes("MOVING,ON")) result.moving = "ON";
    if (ultimoComandoEnviado.toUpperCase().includes("MOVING,OFF")) result.moving = "OFF";
  }

  // 13. VIBL / SENSORRANGE / LEVEL (Sensibilidade à vibração do G-Sensor)
  const matchVibl =
    resposta.match(/(?:SZCS#)?VIBL[:=,\s]([0-9]+)/i) ||
    resposta.match(/(?:SETOK:\s*)?SENSORRANGE[:=,\s]([0-9]+)/i) ||
    resposta.match(/SENSORRANGE[:=,\s]([0-9]+)/i) ||
    resposta.match(/LEVEL[:=,\s]([0-9]+)/i);
  if (matchVibl && matchVibl[1]) {
    result.vibl = matchVibl[1];
  } else if (
    (upper.includes("SENSORRANGE:OK") ||
      upper.includes("SENSORRANGE,OK") ||
      upper.includes("LEVEL:OK") ||
      upper.includes("LEVEL,OK") ||
      (upper.includes("OK") &&
        (cmdUpper.startsWith("SENSORRANGE,") || cmdUpper.startsWith("LEVEL,")))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd =
      ultimoComandoEnviado.match(/SENSORRANGE,(\d+)/i) ||
      ultimoComandoEnviado.match(/LEVEL,(\d+)/i);
    if (matchCmd) result.vibl = matchCmd[1];
  }

  // 14. MILEAGE / ODOMETRO / METER
  const matchMileage =
    resposta.match(/(?:Cur Mileage Value:|MILEAGE|METER|ODO)[:=,\s]([0-9]+(?:\.[0-9]+)?)/i) ||
    resposta.match(/Cur Mileage Value:\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    resposta.match(/MILEAGE[:=,\s]([0-9]+(?:\.[0-9]+)?)/i);
  if (matchMileage && matchMileage[1]) {
    result.odometro = matchMileage[1];
  } else if (
    (upper.includes("SET MILEAGE OK") ||
      upper.includes("SETOK: MILEAGE") ||
      (upper.includes("OK") && cmdUpper.startsWith("MILEAGE="))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/MILEAGE=([0-9]+(?:\.[0-9]+)?)/i);
    if (matchCmd && matchCmd[1]) {
      result.odometro = matchCmd[1];
    }
  }

  // 15. GT06IEXVOL (Pacotes estendidos de telemetria e voltagem)
  const matchIexvol = resposta.match(/GT06IEXVOL[:=,\s]([0-9]+)/i);
  if (matchIexvol && matchIexvol[1]) {
    result.iexvol = matchIexvol[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("GT06IEXVOL=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/GT06IEXVOL=(\d+)/i);
    if (matchCmd && matchCmd[1]) {
      result.iexvol = matchCmd[1];
    }
  }

  // 16. ANGLE / DETECÇÃO DE CURVA (ex: "SETOK: ANGLEVALUE=3-015" ou "SZCS#ANGLEVALUE=...")
  const matchAngle =
    resposta.match(/ANGLEVALUE[:=,\s]([0-9]+-[0-9]+|[0-9]+)/i) ||
    resposta.match(/ANGLE[:=,\s]([0-9]+)/i);
  if (matchAngle && matchAngle[1]) {
    result.angulo = matchAngle[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("ANGLEVALUE=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/ANGLEVALUE=([0-9]+-[0-9]+|[0-9]+)/i);
    if (matchCmd && matchCmd[1]) {
      result.angulo = matchCmd[1];
    }
  }

  // 17. DEFENSE (Nível de Defesa / Alarme)
  const matchDefense = resposta.match(/DEFENSE[:=,\s]([0-9]+|ON|OFF)/i);
  if (matchDefense && matchDefense[1]) {
    result.defense = matchDefense[1].toUpperCase();
  } else if (
    (upper.includes("DEFENSE:OK") || (upper.includes("OK") && cmdUpper.startsWith("DEFENSE,"))) &&
    ultimoComandoEnviado
  ) {
    const matchCmd = ultimoComandoEnviado.match(/DEFENSE,([0-9]+|ON|OFF)/i);
    if (matchCmd && matchCmd[1]) result.defense = matchCmd[1].toUpperCase();
  }

  // 18. BATALM (Alarme de Bateria Fraca)
  const matchBatalm = resposta.match(/BATALM[:=,\s](ON|OFF)/i);
  if (matchBatalm && matchBatalm[1]) {
    result.batalm = matchBatalm[1].toUpperCase();
  } else if (
    (upper.includes("BATALM:OK") || (upper.includes("OK") && cmdUpper.startsWith("BATALM,"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.toUpperCase().includes("BATALM,ON")) result.batalm = "ON";
    if (ultimoComandoEnviado.toUpperCase().includes("BATALM,OFF")) result.batalm = "OFF";
  }

  // 19. POWERALM (Alarme de Corte de Energia Externa 12V)
  const matchPoweralm = resposta.match(/POWERALM[:=,\s](ON|OFF)/i);
  if (matchPoweralm && matchPoweralm[1]) {
    result.poweralm = matchPoweralm[1].toUpperCase();
  } else if (
    (upper.includes("POWERALM:OK") || (upper.includes("OK") && cmdUpper.startsWith("POWERALM,"))) &&
    ultimoComandoEnviado
  ) {
    if (ultimoComandoEnviado.toUpperCase().includes("POWERALM,ON")) result.poweralm = "ON";
    if (ultimoComandoEnviado.toUpperCase().includes("POWERALM,OFF")) result.poweralm = "OFF";
  }

  // 20. SLPDISCONNECT (Modo Carro 0 vs Modo Moto 1)
  const matchSlpDisconnect = resposta.match(/SLPDISCONNECT[:=,\s]([0-1])/i);
  if (matchSlpDisconnect && matchSlpDisconnect[1]) {
    result.slpdisconnect = matchSlpDisconnect[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("SLPDISCONNECT=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/SLPDISCONNECT=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.slpdisconnect = matchCmd[1];
  }

  // 21. ACCLINE (Ignição Física Pós-Chave)
  const matchAccLine = resposta.match(/ACCLINE[:=,\s]([0-1])/i);
  if (matchAccLine && matchAccLine[1]) {
    result.accline = matchAccLine[1];
  } else if ((upper.includes("SETOK") || upper.includes("OK")) && cmdUpper.includes("ACCLINE=")) {
    const matchCmd = ultimoComandoEnviado?.match(/ACCLINE=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.accline = matchCmd[1];
  }

  // 22. ANGLE,SEND (Habilitação de Curva)
  const matchAngleSend = resposta.match(/ANGLE,SEND[:=,\s]([0-1])/i);
  if (matchAngleSend && matchAngleSend[1]) {
    result.angleSend = matchAngleSend[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("ANGLE,SEND=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/ANGLE,SEND=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.angleSend = matchCmd[1];
  }

  // 23. MTK_DISSLP (Sono CPU MTK)
  const matchMtkDisslp = resposta.match(/MTK_DISSLP[:=,\s]([0-1])/i);
  if (matchMtkDisslp && matchMtkDisslp[1]) {
    result.mtkDisslp = matchMtkDisslp[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("MTK_DISSLP=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/MTK_DISSLP=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.mtkDisslp = matchCmd[1];
  }

  // 24. GPS_DISSLP (Repouso GPS)
  const matchGpsDisslp = resposta.match(/GPS_DISSLP[:=,\s]([0-1])/i);
  if (matchGpsDisslp && matchGpsDisslp[1]) {
    result.gpsDisslp = matchGpsDisslp[1];
  } else if (
    (upper.includes("SETOK") || upper.includes("OK")) &&
    cmdUpper.includes("GPS_DISSLP=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/GPS_DISSLP=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.gpsDisslp = matchCmd[1];
  }

  // 25. LED_ENABLE / LEDS (Modo Discreto vs Luzes Ativas)
  const matchLed =
    resposta.match(/(?:LED_ENABLE|LED)[:=,\s]([0-1]|ON|OFF)/i) ||
    resposta.match(/(?:SETOK|READOK):\s*LED_ENABLE=([0-1])/i);
  if (matchLed && matchLed[1]) {
    const val = matchLed[1].toUpperCase();
    result.leds = val === "1" || val === "ON" ? "1" : "0";
  } else if (
    (upper.includes("SETOK") || upper.includes("OK") || upper.includes("READOK")) &&
    cmdUpper.includes("LED_ENABLE=")
  ) {
    const matchCmd = ultimoComandoEnviado?.match(/LED_ENABLE=([0-1])/i);
    if (matchCmd && matchCmd[1]) result.leds = matchCmd[1];
  } else if (upper.includes("LED:ON") || upper.includes("LED,ON")) {
    result.leds = "1";
  } else if (upper.includes("LED:OFF") || upper.includes("LED,OFF")) {
    result.leds = "0";
  }

  // 26. PASSWORD (Senha do Aparelho / Proteção de Hardware)
  const matchPassword = resposta.match(/(?:PASSWORD|PASW)[:=,\s]([a-zA-Z0-9]+)/i);
  if (matchPassword && matchPassword[1] && !matchPassword[1].toUpperCase().includes("OK")) {
    result.password = matchPassword[1];
  }

  return result;
}

function carregarAuditoriaLocal(imei: string): ParametrosHardwareAuditados | null {
  try {
    const saved = localStorage.getItem(`hunter_j16_auditoria_${imei}`);
    if (saved) return JSON.parse(saved);
  } catch {
    // Silencioso
  }
  return null;
}

function salvarAuditoriaLocal(imei: string, dados: ParametrosHardwareAuditados) {
  try {
    localStorage.setItem(`hunter_j16_auditoria_${imei}`, JSON.stringify(dados));
  } catch {
    // Silencioso
  }
}

type CampoOrdenacao =
  | "cliente"
  | "modelo"
  | "imei"
  | "ultimaComunicacao"
  | "apn"
  | "dns"
  | "porta"
  | "usuario"
  | "senha"
  | "freq"
  | "hbt"
  | "carreg"
  | "sleep"
  | "odometro"
  | "rele";

interface DispositivoJ16 {
  id: string;
  imei: string;
  modelo: string;
  status: string; // 'instalado' | 'estoque'
  ultimaComunicacao?: string | null;
  veiculoId?: string | null;
  placa?: string | null;
  marcaModelo?: string | null;
  clienteId?: string | null;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  ignicaoStatus?: boolean | null;
  voltagem?: number | null;
  bateriaVeiculoV?: number | null;
  bateriaRastreadorPct?: number | null;
  satelites?: number | null;
  velocidade?: number | null;
  odometroKm?: number | null;
  ultimaLatitude?: number | null;
  ultimaLongitude?: number | null;
  ultimaAtualizacao?: string | null;
  releStatus?: boolean | null;
  sinalGsm?: number | null;
  bloqueado?: boolean | null;
  isTcpOnline?: boolean;
  // Parâmetros reais do hardware (auditoria física)
  parametrosAuditados?: ParametrosHardwareAuditados | null;
}

interface LogTerminal {
  id: string;
  hora: string;
  tipo: "envio" | "status" | "resposta" | "info" | "erro";
  texto: string;
  imei?: string;
}

import {
  VALORES_PADRAO_CANONICO_J16,
  CHECKBOXES_PADRAO_CANONICO_J16,
  STORAGE_KEY_CONFIG_PADRAO_SISTEMA,
  VERSAO_PADRAO_SISTEMA_J16,
  obterConfigPadraoSistemaJ16,
} from "../lib/rastreadorJ16Constantes";

export function RastreadorJ16View() {
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [dispositivos, setDispositivos] = useState<DispositivoJ16[]>([]);
  const [clientesWhatsapp, setClientesWhatsapp] = useState<
    Array<{ id: string; nome: string; telefone: string }>
  >([]);
  const dispositivosRef = useRef<DispositivoJ16[]>([]);
  dispositivosRef.current = dispositivos;
  const [carregandoDispositivos, setCarregandoDispositivos] = useState(true);

  // Ordenação da tabela por cabeçalho
  const [campoOrdenacao, setCampoOrdenacao] = useState<CampoOrdenacao>("ultimaComunicacao");
  const [direcaoOrdenacao, setDirecaoOrdenacao] = useState<"asc" | "desc">("desc");

  const alternarOrdenacao = (campo: CampoOrdenacao) => {
    if (campoOrdenacao === campo) {
      setDirecaoOrdenacao((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setCampoOrdenacao(campo);
      setDirecaoOrdenacao("asc");
    }
  };

  // Chaves de armazenamento persistente
  const STORAGE_KEY_SELECTED_IMEIS = "hunter_j16_selected_imeis";
  const STORAGE_KEY_BATCH_PARAMS = "hunter_j16_batch_params_habilitados";
  const STORAGE_KEY_COMANDOS_EDITADOS = "hunter_j16_comandos_editados";

  // Seleção múltipla de dispositivos (Persistido no localStorage - respeita o estado deixado pelo usuário)
  const [selectedImeis, setSelectedImeis] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const salvo = localStorage.getItem("hunter_j16_selected_imeis");
        if (salvo) {
          const parsed = JSON.parse(salvo);
          if (Array.isArray(parsed)) {
            return new Set(parsed);
          }
        }
      } catch (err) {
        console.warn("Falha ao recuperar selectedImeis do localStorage", err);
      }
    }
    return new Set<string>();
  });
  const [modoVisualizacao, setModoVisualizacao] = useState<"tabela" | "cards">("tabela");
  const [itensPorPagina, setItensPorPagina] = useState<number>(10);
  const [paginaAtual, setPaginaAtual] = useState<number>(1);

  const [buscaDispositivo, setBuscaDispositivo] = useState("");
  const sessaoAtual = obterSessaoCacheada();
  const isAuditor = Boolean(
    sessaoAtual?.isSuperAdminAuditor ||
    sessaoAtual?.isAuditor ||
    sessaoAtual?.role === "superadmin_auditor" ||
    sessaoAtual?.isReadOnly,
  );
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "online" | "instalados" | "aguardando" | "estoque"
  >("todos");
  const [filtroModelo, setFiltroModelo] = useState<"todos" | "j16" | "g900l">("todos");

  // Terminal e envio de comandos
  const [comandoLivre, setComandoLivre] = useState("TIMER,12,1800#");
  const [enviandoComando, setEnviandoComando] = useState(false);
  const [dispositivoModalComandos, setDispositivoModalComandos] = useState<DispositivoJ16 | null>(
    null,
  );
  const [progressoBatch, setProgressoBatch] = useState<{
    ativo: boolean;
    total: number;
    atual: number;
    comandoAtual: string;
  } | null>(null);

  const [logsTerminal, setLogsTerminal] = useState<LogTerminal[]>(() => {
    const historico = carregarLogsHistoricoConsole();
    if (historico.length > 0) return historico as LogTerminal[];
    return [
      {
        id: "init-1",
        hora: formatarHoraBrasil(new Date(), true),
        tipo: "info",
        texto:
          "Console GT06 / J16 iniciado. Pronto para transmissão de comandos via TCP/GPRS e Supabase Realtime.",
      },
    ];
  });
  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const ultimosComandosDespachadosRef = useRef<Record<string, { cmd: string; timestamp: number }>>(
    {},
  );
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ultimasRespostasProcessadasRef = useRef<Map<string, number>>(new Map());

  // ── Alertas de Comandos em Aguardo (HBT / Spooler nos mesmos moldes dos alertas do sistema) ──
  const [alertaAguardoAtivo, setAlertaAguardoAtivo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("hunter_j16_alerta_aguardo_ativo") !== "false";
  });
  const [somAlertaAguardoMudo, setSomAlertaAguardoMudo] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("hunter_j16_alerta_aguardo_mudo") === "true";
  });
  const [comandosEmAguardo, setComandosEmAguardo] = useState<ComandoEmAguardoItem[]>([]);
  const [alertaAguardoExpandido, setAlertaAguardoExpandido] = useState<boolean>(true);
  const [abaFocoVeiculoAlerta, setAbaFocoVeiculoAlerta] = useState<string>("todos");
  const audioContextAguardoRef = useRef<AudioContext | null>(null);

  // ── Preferências Granulares de Canais de Alerta (App / WhatsApp / Ligação nos mesmos moldes dos alertas do sistema) ──
  const [canaisAlertaComando, setCanaisAlertaComando] = useState<CanaisAlertaComandoAguardo>(() =>
    obterCanaisAlerta(),
  );
  const [modalConfigurarCanaisAberto, setModalConfigurarCanaisAberto] = useState(false);

  useEffect(() => {
    return inscreverAtualizacaoCanais((novos) => {
      setCanaisAlertaComando(novos);
    });
  }, []);

  const salvarCanaisAlertaLocal = (novos: CanaisAlertaComandoAguardo) => {
    setCanaisAlertaComando(novos);
    salvarCanaisAlerta(novos);
    toast.success("Preferências de canais de alerta salvas com sucesso!");
  };

  // Efeito sonoro suave tático de conclusão de comando (sem arquivo externo)
  const tocarSomConclusaoComando = useCallback(() => {
    if (somAlertaAguardoMudo) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextAguardoRef.current) {
        audioContextAguardoRef.current = new AudioCtx();
      }
      const ctx = audioContextAguardoRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, [somAlertaAguardoMudo]);

  // Contagem regressiva viva de segundos restantes para comandos em aguardo do Heartbeat
  useEffect(() => {
    if (comandosEmAguardo.length === 0) return;
    const interval = setInterval(() => {
      const agora = Date.now();
      setComandosEmAguardo((prev) =>
        prev
          .map((item) => {
            if (item.status !== "aguardando") return item;
            const decorridoSeg = Math.floor((agora - item.timestampInicio) / 1000);
            const restante = Math.max(0, item.hbtSegundos - decorridoSeg);
            return {
              ...item,
              segundosRestantes: restante,
            };
          })
          .filter((item) => {
            if (item.status === "concluido" || item.status === "cancelado") {
              const decorridoConclusao = (agora - item.timestampInicio) / 1000;
              return decorridoConclusao < item.hbtSegundos + 12;
            }
            return true;
          }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [comandosEmAguardo.length]);

  // Parâmetros Canônicos de Produção GD Rastreamento (Iniciados a partir do Padrão do Sistema)
  const configPadraoInicial = obterConfigPadraoSistemaJ16();

  const [servidorDns, setServidorDns] = useState(configPadraoInicial.valores.servidorDns);
  const [portaTcp, setPortaTcp] = useState(configPadraoInicial.valores.portaTcp);
  const [ipDedicado, setIpDedicado] = useState(configPadraoInicial.valores.ipDedicado);
  const [usarIpDireto, setUsarIpDireto] = useState(configPadraoInicial.valores.usarIpDireto);
  const [apnNome, setApnNome] = useState(configPadraoInicial.valores.apnNome);
  const [apnUser, setApnUser] = useState(configPadraoInicial.valores.apnUser);
  const [apnPass, setApnPass] = useState(configPadraoInicial.valores.apnPass);
  const [timerMovimento, setTimerMovimento] = useState(configPadraoInicial.valores.timerMovimento);
  const [timerParado, setTimerParado] = useState(configPadraoInicial.valores.timerParado);
  const [hbtLigado, setHbtLigado] = useState(configPadraoInicial.valores.hbtLigado);
  const [hbtDesligado, setHbtDesligado] = useState(configPadraoInicial.valores.hbtDesligado);
  const [anguloIntervalo, setAnguloIntervalo] = useState(
    configPadraoInicial.valores.anguloIntervalo,
  );
  const [anguloGrau, setAnguloGrau] = useState(configPadraoInicial.valores.anguloGrau);
  const [numeroSos, setNumeroSos] = useState(
    configPadraoInicial.valores.numeroSos || VALORES_PADRAO_CANONICO_J16.numeroSos,
  );
  const [numeroCenter, setNumeroCenter] = useState(
    configPadraoInicial.valores.numeroCenter || VALORES_PADRAO_CANONICO_J16.numeroCenter,
  );
  // Senha Mestre Salva do Dispositivo (injetada dinamicamente em admin, DYD, HFYD, RELAY e PASSWORD)
  const [senhaDispositivoPadrao, setSenhaDispositivoPadrao] = useState(
    configPadraoInicial.valores.senhaDispositivoPadrao ||
      VALORES_PADRAO_CANONICO_J16.senhaDispositivoPadrao ||
      "123456",
  );
  const [mostrarSenhaPadrao, setMostrarSenhaPadrao] = useState(false);
  const [modalAlterarSenhaAberto, setModalAlterarSenhaAberto] = useState(false);
  const [senhaAtualForm, setSenhaAtualForm] = useState("");
  const [novaSenhaForm, setNovaSenhaForm] = useState("");
  const [confirmarSenhaForm, setConfirmarSenhaForm] = useState("");
  const [formatoSenhaForm, setFormatoSenhaForm] = useState<"PASSWORD" | "MCU_ZHEN">("PASSWORD");
  const [enviandoAlteracaoSenha, setEnviandoAlteracaoSenha] = useState(false);
  const [senhaDispositivoCmd, setSenhaDispositivoCmd] = useState(
    configPadraoInicial.valores.senhaDispositivoCmd ||
      VALORES_PADRAO_CANONICO_J16.senhaDispositivoCmd,
  );
  const [ignicaoFisicaCmd, setIgnicaoFisicaCmd] = useState(
    configPadraoInicial.valores.ignicaoFisicaCmd,
  );
  const [medicaoInternaMeterCmd, setMedicaoInternaMeterCmd] = useState(
    configPadraoInicial.valores.medicaoInternaMeterCmd,
  );
  const [gmtComando, setGmtComando] = useState(configPadraoInicial.valores.gmtComando);
  const [ledsComando, setLedsComando] = useState(configPadraoInicial.valores.ledsComando);
  const [paramComando, setParamComando] = useState(configPadraoInicial.valores.paramComando);
  const [statusComando, setStatusComando] = useState(configPadraoInicial.valores.statusComando);
  const [relayConsultaComando, setRelayConsultaComando] = useState(
    configPadraoInicial.valores.relayConsultaComando,
  );
  const [alertaGuinchoCmd, setAlertaGuinchoCmd] = useState(
    configPadraoInicial.valores.alertaGuinchoCmd,
  );
  const [anguloHabilitarCmd, setAnguloHabilitarCmd] = useState(
    configPadraoInicial.valores.anguloHabilitarCmd ||
      VALORES_PADRAO_CANONICO_J16.anguloHabilitarCmd,
  );
  const [voltagemOdometroIexvolCmd, setVoltagemOdometroIexvolCmd] = useState(
    configPadraoInicial.valores.voltagemOdometroIexvolCmd ||
      VALORES_PADRAO_CANONICO_J16.voltagemOdometroIexvolCmd,
  );
  const [sleepMtkCmd, setSleepMtkCmd] = useState(
    configPadraoInicial.valores.sleepMtkCmd || VALORES_PADRAO_CANONICO_J16.sleepMtkCmd,
  );
  const [sleepGpsCmd, setSleepGpsCmd] = useState(
    configPadraoInicial.valores.sleepGpsCmd || VALORES_PADRAO_CANONICO_J16.sleepGpsCmd,
  );
  const [defenseCmd, setDefenseCmd] = useState(
    configPadraoInicial.valores.defenseCmd || VALORES_PADRAO_CANONICO_J16.defenseCmd,
  );
  const [senalmCmd, setSenalmCmd] = useState(
    configPadraoInicial.valores.senalmCmd || VALORES_PADRAO_CANONICO_J16.senalmCmd,
  );
  const [bateriaFracaCmd, setBateriaFracaCmd] = useState(
    configPadraoInicial.valores.bateriaFracaCmd || VALORES_PADRAO_CANONICO_J16.bateriaFracaCmd,
  );
  const [bateriaCortadaCmd, setBateriaCortadaCmd] = useState(
    configPadraoInicial.valores.bateriaCortadaCmd || VALORES_PADRAO_CANONICO_J16.bateriaCortadaCmd,
  );
  const [alertaIgnicaoImediataCmd, setAlertaIgnicaoImediataCmd] = useState(
    configPadraoInicial.valores.alertaIgnicaoImediataCmd ||
      VALORES_PADRAO_CANONICO_J16.alertaIgnicaoImediataCmd,
  );
  const [modoVeiculoSleepCmd, setModoVeiculoSleepCmd] = useState(
    configPadraoInicial.valores.modoVeiculoSleepCmd ||
      VALORES_PADRAO_CANONICO_J16.modoVeiculoSleepCmd,
  );
  const [economiaParadaCmd, setEconomiaParadaCmd] = useState(
    configPadraoInicial.valores.economiaParadaCmd || VALORES_PADRAO_CANONICO_J16.economiaParadaCmd,
  );
  const [sensorGSensibilidadeCmd, setSensorGSensibilidadeCmd] = useState(
    configPadraoInicial.valores.sensorGSensibilidadeCmd ||
      VALORES_PADRAO_CANONICO_J16.sensorGSensibilidadeCmd,
  );
  const [resetFinalCmd, setResetFinalCmd] = useState(
    configPadraoInicial.valores.resetFinalCmd || VALORES_PADRAO_CANONICO_J16.resetFinalCmd,
  );

  const [consoleCopiado, setConsoleCopiado] = useState(false);
  const [comandoModalConfig, setComandoModalConfig] = useState<(typeof catalogoComandos)[0] | null>(
    null,
  );

  // Navegação de Abas do Módulo: "remoto" (GPRS/TCP) vs "usb" (Bancada Serial USB) vs "simulador" (Bancada Virtual) vs "comparativo" (Teste A/B 20MB)
  const [abaPrincipal, setAbaPrincipal] = useState<"remoto" | "usb" | "simulador" | "comparativo">(
    "remoto",
  );
  const [origemParametrosComparativo, setOrigemParametrosComparativo] = useState<{
    nome: string;
    timestamp: string;
  } | null>(null);

  // Filtro e Busca do Catálogo de Comandos
  const [buscaComandoCatalogo, setBuscaComandoCatalogo] = useState("");
  const [grupoComandoFiltro, setGrupoComandoFiltro] = useState<string>("todos");
  const [comandoSelecionadoDropdown, setComandoSelecionadoDropdown] = useState<string>("");

  // Comandos editados no catálogo de comandos (Persistido no localStorage)
  const [comandosEditados, setComandosEditados] = useState<Record<number, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const salvo = localStorage.getItem(STORAGE_KEY_COMANDOS_EDITADOS);
        if (salvo) {
          const parsed = JSON.parse(salvo);
          if (typeof parsed === "object" && parsed !== null) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn("Falha ao recuperar comandos editados do localStorage", err);
      }
    }
    return {};
  });

  // Dispositivo selecionado único (quando há exatamente 1 IMEI marcado na listagem)
  const dispositivoUnicoSelecionado = useMemo(() => {
    if (selectedImeis.size === 1) {
      const imei = Array.from(selectedImeis)[0];
      return dispositivos.find((d) => d.imei === imei) || null;
    }
    return null;
  }, [selectedImeis, dispositivos]);

  // Sincroniza compulsoriamente para o WhatsApp do Cliente:
  // 1. Se há um dispositivo único com cliente vinculado -> usa o WhatsApp dele.
  // 2. Se não houver dispositivo específico selecionado ou campo estiver vazio -> mantém por padrão o WhatsApp do cliente titular.
  useEffect(() => {
    if (dispositivoUnicoSelecionado?.clienteTelefone) {
      setNumeroSos(dispositivoUnicoSelecionado.clienteTelefone);
      setNumeroCenter(dispositivoUnicoSelecionado.clienteTelefone);
    } else if (!numeroSos || !numeroCenter) {
      const fonePadrao =
        clientesWhatsapp[0]?.telefone ||
        dispositivos.find((d) => d.clienteTelefone)?.clienteTelefone ||
        VALORES_PADRAO_CANONICO_J16.numeroSos;
      if (fonePadrao) {
        if (!numeroSos) setNumeroSos(fonePadrao);
        if (!numeroCenter) setNumeroCenter(fonePadrao);
      }
    }
  }, [dispositivoUnicoSelecionado, clientesWhatsapp, dispositivos, numeroSos, numeroCenter]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_COMANDOS_EDITADOS, JSON.stringify(comandosEditados));
      } catch (err) {
        console.warn("Falha ao persistir comandos editados no localStorage", err);
      }
    }
  }, [comandosEditados]);

  const handleAlterarComando = (num: number, novoValor: string) => {
    setComandosEditados((prev) => ({ ...prev, [num]: novoValor }));
  };

  const handleResetarComando = (num: number) => {
    setComandosEditados((prev) => {
      const next = { ...prev };
      delete next[num];
      return next;
    });
  };

  // Checkbox de Habilitação para Envio no Batch (Persistido no localStorage; padrão inicial já marcado com os parâmetros canônicos do sistema)
  const [parametrosHabilitadosBatch, setParametrosHabilitadosBatch] = useState<
    Record<string, boolean>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const salvoConfig = localStorage.getItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA);
        if (salvoConfig) {
          const parsedConfig = JSON.parse(salvoConfig);
          if (parsedConfig?.versao !== VERSAO_PADRAO_SISTEMA_J16) {
            return configPadraoInicial.checkboxes;
          }
        }
        const salvo = localStorage.getItem(STORAGE_KEY_BATCH_PARAMS);
        if (salvo) {
          const parsed = JSON.parse(salvo);
          if (typeof parsed === "object" && parsed !== null) {
            return { ...configPadraoInicial.checkboxes, ...parsed };
          }
        }
      } catch (err) {
        console.warn("Falha ao recuperar parâmetros habilitados do batch", err);
      }
    }
    return configPadraoInicial.checkboxes;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_BATCH_PARAMS, JSON.stringify(parametrosHabilitadosBatch));
      } catch (err) {
        console.warn("Falha ao persistir parâmetros habilitados do batch", err);
      }
    }
  }, [parametrosHabilitadosBatch]);

  const alternarTodosParametrosBatch = (habilitar: boolean) => {
    setParametrosHabilitadosBatch({
      servidorDns: habilitar,
      portaTcp: habilitar,
      ipDedicado: habilitar,
      apnNome: habilitar,
      apnUser: habilitar,
      apnPass: habilitar,
      timerMovimento: habilitar,
      timerParado: habilitar,
      hbtLigado: habilitar,
      hbtDesligado: habilitar,
      anguloHabilitar: habilitar,
      anguloIntervalo: habilitar,
      anguloGrau: habilitar,
      medicaoInternaMeter: habilitar,
      ignicaoFisica: habilitar,
      voltagemOdometroIexvol: habilitar,
      sleepMtk: habilitar,
      sleepGps: habilitar,
      gmtUniversal: habilitar,
      ledsDiagnostico: habilitar,
      paramDiagnostico: habilitar,
      statusDiagnostico: habilitar,
      relayDiagnostico: habilitar,
      alertaGuincho: habilitar,
      defenseAlarme: habilitar,
      senalmVibracao: habilitar,
      bateriaFraca: habilitar,
      bateriaCortada: habilitar,
      alertaIgnicaoImediata: habilitar,
      modoVeiculoSleep: habilitar,
      economiaParada: habilitar,
      sensorGSensibilidade: habilitar,
      resetFinal: habilitar,
      numeroSos: habilitar,
      numeroCenter: habilitar,
    });
  };

  // Aplica compulsoriamente os valores e checkboxes do Padrão Canônico do Sistema (Padrão Ouro)
  const aplicarPadraoDoSistema = () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Proibido alterar configurações do sistema.",
      );
      return;
    }
    const padraoValores = { ...VALORES_PADRAO_CANONICO_J16 };
    const padraoCheckboxes = { ...CHECKBOXES_PADRAO_CANONICO_J16 };

    setServidorDns(padraoValores.servidorDns);
    setPortaTcp(padraoValores.portaTcp);
    setIpDedicado(padraoValores.ipDedicado);
    setUsarIpDireto(padraoValores.usarIpDireto);
    setApnNome(padraoValores.apnNome);
    setApnUser(padraoValores.apnUser);
    setApnPass(padraoValores.apnPass);
    setTimerMovimento(padraoValores.timerMovimento);
    setTimerParado(padraoValores.timerParado);
    setHbtLigado(padraoValores.hbtLigado);
    setHbtDesligado(padraoValores.hbtDesligado);
    setAnguloIntervalo(padraoValores.anguloIntervalo);
    setAnguloGrau(padraoValores.anguloGrau);
    setNumeroSos(padraoValores.numeroSos);
    setNumeroCenter(padraoValores.numeroCenter);
    setSenhaDispositivoPadrao(padraoValores.senhaDispositivoPadrao || "123456");
    setSenhaDispositivoCmd(padraoValores.senhaDispositivoCmd);
    setIgnicaoFisicaCmd(padraoValores.ignicaoFisicaCmd);
    setMedicaoInternaMeterCmd(padraoValores.medicaoInternaMeterCmd);
    setGmtComando(padraoValores.gmtComando);
    setLedsComando(padraoValores.ledsComando);
    setParamComando(padraoValores.paramComando);
    setStatusComando(padraoValores.statusComando);
    setRelayConsultaComando(padraoValores.relayConsultaComando);
    setAlertaGuinchoCmd(padraoValores.alertaGuinchoCmd);
    setAnguloHabilitarCmd(padraoValores.anguloHabilitarCmd);
    setVoltagemOdometroIexvolCmd(padraoValores.voltagemOdometroIexvolCmd);
    setSleepMtkCmd(padraoValores.sleepMtkCmd);
    setSleepGpsCmd(padraoValores.sleepGpsCmd);
    setDefenseCmd(padraoValores.defenseCmd);
    setSenalmCmd(padraoValores.senalmCmd);
    setBateriaFracaCmd(padraoValores.bateriaFracaCmd);
    setBateriaCortadaCmd(padraoValores.bateriaCortadaCmd);
    setAlertaIgnicaoImediataCmd(padraoValores.alertaIgnicaoImediataCmd);
    setModoVeiculoSleepCmd(padraoValores.modoVeiculoSleepCmd);
    setEconomiaParadaCmd(padraoValores.economiaParadaCmd);
    setSensorGSensibilidadeCmd(padraoValores.sensorGSensibilidadeCmd);
    setResetFinalCmd(padraoValores.resetFinalCmd);

    setParametrosHabilitadosBatch(padraoCheckboxes);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          STORAGE_KEY_CONFIG_PADRAO_SISTEMA,
          JSON.stringify({
            versao: VERSAO_PADRAO_SISTEMA_J16,
            valores: padraoValores,
            checkboxes: padraoCheckboxes,
          }),
        );
        localStorage.setItem(STORAGE_KEY_BATCH_PARAMS, JSON.stringify(padraoCheckboxes));
      } catch (err) {
        console.warn("Falha ao salvar padrão no localStorage", err);
      }
    }
    toast.success("Configuração Padrão do Sistema (Padrão Ouro) aplicada com sucesso!");
  };

  // Salva especificamente a senha padrão do dispositivo no sistema e nos parâmetros
  const handleSalvarSenhaDispositivoPadrao = (novaSenha: string) => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Proibido alterar senhas do sistema ou hardware.",
      );
      return;
    }
    const senhaLimpa = novaSenha.trim();
    if (!senhaLimpa) {
      toast.error("A senha não pode estar em branco.");
      return;
    }
    setSenhaDispositivoPadrao(senhaLimpa);
    if (typeof window !== "undefined") {
      try {
        const salvo = localStorage.getItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA);
        let parsed: {
          valores?: Record<string, string>;
          checkboxes?: Record<string, boolean>;
        } = {};
        if (salvo) {
          try {
            parsed = JSON.parse(salvo);
          } catch {
            parsed = {};
          }
        }
        const novoPadrao = {
          ...parsed,
          valores: {
            ...(parsed.valores || VALORES_PADRAO_CANONICO_J16),
            senhaDispositivoPadrao: senhaLimpa,
          },
          checkboxes: parsed.checkboxes || parametrosHabilitadosBatch,
        };
        localStorage.setItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA, JSON.stringify(novoPadrao));
      } catch (err) {
        console.warn("Falha ao salvar senha padrão do sistema no localStorage", err);
      }
    }
    toast.success(`Senha padrão do sistema (${senhaLimpa}) salva com sucesso!`);
  };

  // Salva a configuração atual (valores e seleções de checkboxes) como o novo Padrão do Sistema
  const salvarNovoPadraoSistema = () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Proibido salvar novos padrões de configuração.",
      );
      return;
    }
    const novoPadrao = {
      versao: VERSAO_PADRAO_SISTEMA_J16,
      valores: {
        servidorDns,
        portaTcp,
        ipDedicado,
        usarIpDireto,
        apnNome,
        apnUser,
        apnPass,
        timerMovimento,
        timerParado,
        hbtLigado,
        hbtDesligado,
        anguloIntervalo,
        anguloGrau,
        numeroSos,
        numeroCenter,
        senhaDispositivoPadrao,
        senhaDispositivoCmd,
        ignicaoFisicaCmd,
        medicaoInternaMeterCmd,
        voltagemOdometroIexvolCmd,
        sleepMtkCmd,
        sleepGpsCmd,
        gmtComando,
        ledsComando,
        paramComando,
        statusComando,
        relayConsultaComando,
        alertaGuinchoCmd,
        defenseCmd,
        senalmCmd,
        bateriaFracaCmd,
        bateriaCortadaCmd,
        alertaIgnicaoImediataCmd,
        modoVeiculoSleepCmd,
        economiaParadaCmd,
        sensorGSensibilidadeCmd,
        resetFinalCmd,
      },
      checkboxes: parametrosHabilitadosBatch,
    };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA, JSON.stringify(novoPadrao));
        localStorage.setItem(STORAGE_KEY_BATCH_PARAMS, JSON.stringify(parametrosHabilitadosBatch));
      } catch (err) {
        console.warn("Falha ao salvar novo padrão do sistema no localStorage", err);
      }
    }
    toast.success("Nova configuração padrão do sistema salva com sucesso!");
  };

  // Executa a alteração de senha (GPRS ou apenas salvar)
  const handleExecutarAlteracaoSenha = async (modo: "gprs" | "salvar_apenas") => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Proibido alterar senhas de hardware.",
      );
      return;
    }
    const atual = senhaAtualForm.trim() || senhaDispositivoPadrao.trim() || "123456";
    const nova = novaSenhaForm.trim();
    const conf = confirmarSenhaForm.trim();

    if (!nova) {
      toast.error("Informe a nova senha.");
      return;
    }
    if (nova.length < 4) {
      toast.error("A nova senha deve possuir pelo menos 4 caracteres (recomendado 6 dígitos).");
      return;
    }
    if (nova !== conf) {
      toast.error("A nova senha e a confirmação não conferem.");
      return;
    }

    const cmd =
      formatoSenhaForm === "PASSWORD"
        ? `PASSWORD,${atual},${nova}#`
        : `zhencbpwd,${atual},${nova}#`;

    if (modo === "salvar_apenas") {
      handleSalvarSenhaDispositivoPadrao(nova);
      setModalAlterarSenhaAberto(false);
      return;
    }

    if (modo === "gprs") {
      const imeisParaEnvio = Array.from(selectedImeis);
      if (imeisParaEnvio.length === 0) {
        toast.error("Selecione ao menos um dispositivo na tabela para transmitir via GPRS.");
        return;
      }

      setEnviandoAlteracaoSenha(true);
      try {
        for (const imei of imeisParaEnvio) {
          const disp = dispositivos.find((d) => d.imei === imei);
          await dispararAcaoRapida(imei, cmd, `Alterar Senha (${cmd})`, disp?.veiculoId);
        }
        handleSalvarSenhaDispositivoPadrao(nova);
        toast.success(`Comando "${cmd}" transmitido via GPRS e nova senha salva no sistema!`);
        setModalAlterarSenhaAberto(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Falha ao despachar alteração de senha: ${msg}`);
      } finally {
        setEnviandoAlteracaoSenha(false);
      }
    }
  };

  // Aplica os parâmetros selecionados ou otimizados no Comparativo de Padrões
  const handleAplicarParametrosDoComparativo = useCallback(
    (params: ParametrosPadraoComparativo) => {
      const sess = obterSessaoCacheada();
      if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
        toast.error(
          "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Aplicação de parâmetros de hardware é restrita ao SuperADM.",
        );
        return;
      }
      setTimerMovimento(params.timerMovimento.toString());
      setTimerParado(params.timerParado.toString());
      setHbtLigado(params.hbtLigado.toString());
      setHbtDesligado(params.hbtDesligado.toString());
      setAnguloGrau(params.anguloGrau.toString());
      setAnguloIntervalo(params.anguloIntervalo.toString());
      setAnguloHabilitarCmd(params.anguloHabilitado ? "SZCS#ANGLE,SEND=1" : "SZCS#ANGLE,SEND=0");
      setEconomiaParadaCmd(params.modoEconomiaParada ? "SENDS,1#" : "SENDS,0#");
      setSensorGSensibilidadeCmd(`LEVEL,${params.sensibilidadeGSensor}#`);
      setVoltagemOdometroIexvolCmd(
        params.pacoteEstendidoIexvol ? "SZCS#GT06IEXVOL=2" : "SZCS#GT06IEXVOL=0",
      );

      // Habilita as checkboxes dos parâmetros para estarem ativas no envio em lote
      setParametrosHabilitadosBatch((prev) => ({
        ...prev,
        timerMovimento: true,
        timerParado: true,
        hbtLigado: true,
        hbtDesligado: true,
        anguloHabilitar: params.anguloHabilitado,
        anguloGrau: true,
        anguloIntervalo: true,
        economiaParada: true,
        sensorGSensibilidade: true,
        voltagemOdometroIexvol: true,
      }));

      setOrigemParametrosComparativo({
        nome: params.nome,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      });

      setAbaPrincipal("remoto");

      toast.success(
        `Parâmetros do "${params.nome}" carregados nos Parâmetros Canônicos do Sistema! Você pode revisá-los, enviá-los aos dispositivos e, se desejar, salvá-los como Padrão do Sistema.`,
      );
    },
    [],
  );

  const obterComandosBatchAtivos = useCallback(() => {
    const comandos: { cmd: string; nome: string }[] = [];
    const servidorAlvo = usarIpDireto ? ipDedicado : servidorDns;
    const modoServidor = usarIpDireto ? "0" : "1";
    const senhaAtiva = (senhaDispositivoPadrao || "123456").trim() || "123456";

    // ─────────────────────────────────────────────────────────────
    // Se o filtro selecionado for G900L (Coban / Cantrack 4G)
    // Dispara a Sequência Automática Canônica Coban
    // ─────────────────────────────────────────────────────────────
    if (filtroModelo === "g900l") {
      if (
        parametrosHabilitadosBatch.servidorDns ||
        parametrosHabilitadosBatch.portaTcp ||
        parametrosHabilitadosBatch.ipDedicado
      ) {
        comandos.push({
          cmd: `adminip${senhaAtiva} ${servidorAlvo} ${portaTcp}`,
          nome: `1. Apontar Servidor e Porta G900L (adminip${senhaAtiva} ${servidorAlvo} ${portaTcp})`,
        });
      }
      if (
        parametrosHabilitadosBatch.apnNome ||
        parametrosHabilitadosBatch.apnUser ||
        parametrosHabilitadosBatch.apnPass
      ) {
        const apnCmd =
          apnUser && apnPass
            ? `apn${senhaAtiva} ${apnNome} ${apnUser} ${apnPass}`
            : `apn${senhaAtiva} ${apnNome}`;
        comandos.push({
          cmd: apnCmd,
          nome: `2. Configurar APN M2M G900L (${apnCmd})`,
        });
      }
      if (parametrosHabilitadosBatch.timerMovimento || parametrosHabilitadosBatch.timerParado) {
        const segMov = String(timerMovimento || "30").padStart(3, "0");
        comandos.push({
          cmd: `fix${segMov}s***n${senhaAtiva}`,
          nome: `3. Frequência de Transmissão G900L (fix${segMov}s***n${senhaAtiva})`,
        });
      }
      if (parametrosHabilitadosBatch.hbtLigado || parametrosHabilitadosBatch.hbtDesligado) {
        comandos.push({
          cmd: `hbt${senhaAtiva} ${hbtLigado || "300"}`,
          nome: `4. Heartbeat G900L (hbt${senhaAtiva} ${hbtLigado || "300"})`,
        });
      }
      if (parametrosHabilitadosBatch.gmtUniversal) {
        comandos.push({
          cmd: `time zone${senhaAtiva} 0`,
          nome: `5. Fuso Horário UTC 0 G900L (time zone${senhaAtiva} 0)`,
        });
      }
      if (parametrosHabilitadosBatch.statusDiagnostico) {
        comandos.push({
          cmd: `status${senhaAtiva}`,
          nome: `Status Operacional G900L (status${senhaAtiva})`,
        });
      }
      if (parametrosHabilitadosBatch.paramDiagnostico) {
        comandos.push({
          cmd: `check${senhaAtiva}`,
          nome: `Auditoria de Parâmetros G900L (check${senhaAtiva})`,
        });
      }
      if (parametrosHabilitadosBatch.resetFinal) {
        comandos.push({
          cmd: `reset${senhaAtiva}`,
          nome: `Reinicialização Limpa G900L (reset${senhaAtiva})`,
        });
      }

      return comandos.map((c) => ({
        ...c,
        cmd: c.cmd.trim(),
      }));
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 1: Conectividade Básica e Nuvem (GPRS / APN / Servidor / Relógio)
    // ─────────────────────────────────────────────────────────────
    // 1. Apontar Servidor e Porta TCP (Manual Voxter Itens 1 e 2)
    if (
      parametrosHabilitadosBatch.servidorDns ||
      parametrosHabilitadosBatch.portaTcp ||
      parametrosHabilitadosBatch.ipDedicado
    ) {
      comandos.push({
        cmd: `SERVER,${modoServidor},${servidorAlvo},${portaTcp},0#`,
        nome: "1. Apontar Servidor e Porta TCP (SERVER)",
      });
    }

    // 2. Configurar APN M2M (Manual Voxter Item 3)
    if (
      parametrosHabilitadosBatch.apnNome ||
      parametrosHabilitadosBatch.apnUser ||
      parametrosHabilitadosBatch.apnPass
    ) {
      comandos.push({
        cmd: `APN,${apnNome},${apnUser},${apnPass}#`,
        nome: "2. Configurar APN M2M (APN)",
      });
    }

    // 3. Ajustar Frequência de Transmissão (Timers) (Manual Voxter Item 4)
    if (parametrosHabilitadosBatch.timerMovimento || parametrosHabilitadosBatch.timerParado) {
      comandos.push({
        cmd: `TIMER,${timerMovimento},${timerParado}#`,
        nome: `3. Frequência de Transmissão (TIMER,${timerMovimento},${timerParado}#)`,
      });
    }

    // 4. Configurar Heartbeat Liveness (Ping Plataforma) (Manual Voxter Item 14)
    if (parametrosHabilitadosBatch.hbtLigado || parametrosHabilitadosBatch.hbtDesligado) {
      comandos.push({
        cmd: `HBT,${hbtLigado},${hbtDesligado}#`,
        nome: `4. Heartbeat / Ping Plataforma (HBT,${hbtLigado},${hbtDesligado}#)`,
      });
    }

    // 5. Configurar Timezone Universal UTC 0 (Manual Voxter Item 5)
    if (parametrosHabilitadosBatch.gmtUniversal && gmtComando.trim()) {
      comandos.push({
        cmd: gmtComando.trim(),
        nome: `5. Configurar Timezone (${gmtComando.trim()})`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 2: Ignição Física e Calibração de Hardware (Base para Sensores)
    // ─────────────────────────────────────────────────────────────
    // 6. Ignição Pós-Chave ACCLINE (Fio Laranja físico - PRÉ-REQUISITO para Sleep e Alarmes)
    if (parametrosHabilitadosBatch.ignicaoFisica && ignicaoFisicaCmd.trim()) {
      comandos.push({
        cmd: ignicaoFisicaCmd.trim(),
        nome: `6. Ignição Pós-Chave Física (${ignicaoFisicaCmd.trim()})`,
      });
    }

    // 7. Habilitação de Detecção de Curva (PRÉ-REQUISITO para ANGLEVALUE funcionar)
    if (parametrosHabilitadosBatch.anguloHabilitar && anguloHabilitarCmd.trim()) {
      comandos.push({
        cmd: anguloHabilitarCmd.trim(),
        nome: `7. Habilitar Detecção de Curva (${anguloHabilitarCmd.trim()})`,
      });
    }

    // 8. Calibração do Limiar de Curva Otimizada (Manual Voxter Item 8 - intervalo >= 10s)
    if (parametrosHabilitadosBatch.anguloIntervalo || parametrosHabilitadosBatch.anguloGrau) {
      const segInt = Math.max(10, parseInt(anguloIntervalo, 10) || 10);
      comandos.push({
        cmd: `SZCS#ANGLEVALUE=${segInt}-${String(anguloGrau).padStart(3, "0")}`,
        nome: `8. Calibração de Curva (${segInt}s/${anguloGrau}°)`,
      });
    }

    // 9. Medição Interna de Distância / Odômetro MCU (Homologado na MCU J16)
    if (parametrosHabilitadosBatch.medicaoInternaMeter && medicaoInternaMeterCmd.trim()) {
      comandos.push({
        cmd: medicaoInternaMeterCmd.trim(),
        nome: `9. Ativar Odômetro MCU (${medicaoInternaMeterCmd.trim()})`,
      });
    }

    // 10. Pacote Estendido GT06: Voltagem Externa 12V e Odômetro Estendido
    if (parametrosHabilitadosBatch.voltagemOdometroIexvol && voltagemOdometroIexvolCmd.trim()) {
      comandos.push({
        cmd: voltagemOdometroIexvolCmd.trim(),
        nome: `10. Voltagem 12V e Odômetro GT06 (${voltagemOdometroIexvolCmd.trim()})`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 3: Gerenciamento Inteligente de Energia e Economia ao Parar
    // ─────────────────────────────────────────────────────────────
    // 11. Sono da CPU MTK ao Parar (Poupar bateria do veículo)
    if (parametrosHabilitadosBatch.sleepMtk && sleepMtkCmd.trim()) {
      comandos.push({
        cmd: sleepMtkCmd.trim(),
        nome: `11. Sono CPU MTK ao Parar (${sleepMtkCmd.trim()})`,
      });
    }

    // 12. Repouso do GPS ao Parar (Desativa recepção de satélite no repouso)
    if (parametrosHabilitadosBatch.sleepGps && sleepGpsCmd.trim()) {
      comandos.push({
        cmd: sleepGpsCmd.trim(),
        nome: `12. Repouso GPS ao Parar (${sleepGpsCmd.trim()})`,
      });
    }

    // 13. Modo do Veículo no Sleep (Modo Carro 4G Online vs Modo Moto 4G Offline)
    if (parametrosHabilitadosBatch.modoVeiculoSleep && modoVeiculoSleepCmd.trim()) {
      comandos.push({
        cmd: modoVeiculoSleepCmd.trim(),
        nome: `13. Modo Sleep Carro/Moto (${modoVeiculoSleepCmd.trim()})`,
      });
    }

    // 14. Economia ao Parar (SENDS,1# - aguarda 1 min de vigília antes do repouso)
    if (parametrosHabilitadosBatch.economiaParada && economiaParadaCmd.trim()) {
      comandos.push({
        cmd: economiaParadaCmd.trim(),
        nome: `14. Economia ao Parar (${economiaParadaCmd.trim()})`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 4: Alarmes, Acelerômetro e Segurança Ativa
    // ─────────────────────────────────────────────────────────────
    // 15. Sensibilidade do Sensor G Triaxial (LEVEL)
    if (parametrosHabilitadosBatch.sensorGSensibilidade && sensorGSensibilidadeCmd.trim()) {
      comandos.push({
        cmd: sensorGSensibilidadeCmd.trim(),
        nome: `15. Sensibilidade Sensor G (${sensorGSensibilidadeCmd.trim()})`,
      });
    }

    // 16. Alarme de Vibração / Choque (SENALM)
    if (parametrosHabilitadosBatch.senalmVibracao && senalmCmd.trim()) {
      comandos.push({
        cmd: senalmCmd.trim(),
        nome: `16. Alarme de Choque/Vibração (${senalmCmd.trim()})`,
      });
    }

    // 17. Alarme de Defesa / Vigília Ativa (DEFENSE)
    if (parametrosHabilitadosBatch.defenseAlarme && defenseCmd.trim()) {
      comandos.push({
        cmd: defenseCmd.trim(),
        nome: `17. Modo Defesa/Vigília (${defenseCmd.trim()})`,
      });
    }

    // 18. Alerta de Guincho / Deslocamento (Universal Concox / Manual Voxter Item 18)
    if (parametrosHabilitadosBatch.alertaGuincho && alertaGuinchoCmd.trim()) {
      comandos.push({
        cmd: alertaGuinchoCmd.trim(),
        nome: `18. Alerta de Guincho (${alertaGuinchoCmd.trim()})`,
      });
    }

    // 19. Alarme de Bateria Cortada / Linha 12V (POWERALM)
    if (parametrosHabilitadosBatch.bateriaCortada && bateriaCortadaCmd.trim()) {
      comandos.push({
        cmd: bateriaCortadaCmd.trim(),
        nome: `19. Alerta Corte Linha 12V (${bateriaCortadaCmd.trim()})`,
      });
    }

    // 20. Alarme Instantâneo de Ignição / ACC (ACCALM) - Zera o lag de identificação de desligado
    if (parametrosHabilitadosBatch.alertaIgnicaoImediata && alertaIgnicaoImediataCmd.trim()) {
      comandos.push({
        cmd: alertaIgnicaoImediataCmd.trim(),
        nome: `20. Alerta Instantâneo ACC (${alertaIgnicaoImediataCmd.trim()})`,
      });
    }

    // 21. Alarme de Bateria Interna Fraca (BATALM)
    if (parametrosHabilitadosBatch.bateriaFraca && bateriaFracaCmd.trim()) {
      comandos.push({
        cmd: bateriaFracaCmd.trim(),
        nome: `21. Alerta Bateria Fraca (${bateriaFracaCmd.trim()})`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 5: Discrição e Opcionais
    // ─────────────────────────────────────────────────────────────
    // 21. LEDs de Status Operacionais (Apaga LEDs para instalação oculta / antifurto)
    if (parametrosHabilitadosBatch.ledsDiagnostico && ledsComando.trim()) {
      comandos.push({
        cmd: ledsComando.trim(),
        nome: `21. LEDs Modo Discreto (${ledsComando.trim()})`,
      });
    }

    // 22. Número SOS de Emergência (Manual Voxter Item 15 - opcional)
    if (parametrosHabilitadosBatch.numeroSos) {
      const valSos = numeroSos.trim();
      if (valSos.startsWith("SOS#") || valSos.startsWith("SOS,D")) {
        comandos.push({
          cmd: valSos.endsWith("#") ? valSos : `${valSos}#`,
          nome: `22. Comando SOS (${valSos})`,
        });
      } else if (valSos) {
        const numSosLimpo = valSos.replace(/\D/g, "");
        if (numSosLimpo.length >= 10) {
          comandos.push({
            cmd: `SOS,A,${numSosLimpo}#`,
            nome: `22. Número SOS Emergência (${numSosLimpo})`,
          });
        }
      } else {
        // Se habilitado sem número manual estático, injeta dinamicamente o WhatsApp do cliente
        comandos.push({
          cmd: "SOS,A,{CLIENTE_TELEFONE}#",
          nome: "22. Número SOS Emergência (WhatsApp do Cliente)",
        });
      }
    }

    // 23. Número Master / Central / Admin (Formato Canônico Homologado: admin#<senha>#<numero>#)
    if (parametrosHabilitadosBatch.numeroCenter) {
      const valCenter = numeroCenter.trim();
      if (valCenter === "CENTER#" || valCenter.startsWith("CENTER,D") || valCenter === "PARAM#") {
        comandos.push({
          cmd: valCenter.endsWith("#") ? valCenter : `${valCenter}#`,
          nome: `23. Comando Administrador (${valCenter})`,
        });
      } else if (valCenter.startsWith("admin#") || valCenter.startsWith("CENTER,A,")) {
        // Valida se possui partes válidas com número telefônico
        const partes = valCenter.split("#").filter(Boolean);
        const numParte = partes[2]?.replace(/\D/g, "") || partes[1]?.replace(/\D/g, "");
        if (numParte && numParte.length >= 10) {
          comandos.push({
            cmd: valCenter.endsWith("#") ? valCenter : `${valCenter}#`,
            nome: `23. Administrador do Dispositivo (${valCenter})`,
          });
        } else {
          // Se o comando admin# não possui telefone válido, injeta o WhatsApp do cliente
          const senhaAtiva = partes[1] || senhaDispositivoPadrao.trim() || "123456";
          comandos.push({
            cmd: `admin#${senhaAtiva}#{CLIENTE_TELEFONE}#`,
            nome: "23. Administrador do Dispositivo (WhatsApp do Cliente)",
          });
        }
      } else if (valCenter) {
        const numLimpo = valCenter.replace(/\D/g, "");
        if (numLimpo.length >= 10) {
          const senhaAtiva = senhaDispositivoPadrao.trim() || "123456";
          comandos.push({
            cmd: `admin#${senhaAtiva}#${numLimpo}#`,
            nome: `23. Administrador do Dispositivo (admin#${senhaAtiva}#${numLimpo}#)`,
          });
        }
      } else {
        // Se habilitado sem número manual estático, injeta dinamicamente o WhatsApp do cliente
        const senhaAtiva = senhaDispositivoPadrao.trim() || "123456";
        comandos.push({
          cmd: `admin#${senhaAtiva}#{CLIENTE_TELEFONE}#`,
          nome: "23. Administrador do Dispositivo (WhatsApp do Cliente)",
        });
      }
    }

    // 24. Senha de Proteção / Mestre do Rastreador (PASSWORD - opcional)
    if (parametrosHabilitadosBatch.senhaDispositivo) {
      const cmdSenha =
        senhaDispositivoCmd.trim() ||
        `PASSWORD,123456,${senhaDispositivoPadrao.trim() || "123456"}#`;
      comandos.push({
        cmd: cmdSenha,
        nome: `24. Senha de Proteção (${cmdSenha})`,
      });
    }

    // Consultas de Diagnóstico (Desmarcadas no lote inicial padrão por rodarem antes do RESET)
    if (parametrosHabilitadosBatch.statusDiagnostico && statusComando.trim()) {
      comandos.push({
        cmd: statusComando.trim(),
        nome: `Consulta de Status Operacional (${statusComando.trim()})`,
      });
    }

    if (parametrosHabilitadosBatch.relayDiagnostico && relayConsultaComando.trim()) {
      comandos.push({
        cmd: relayConsultaComando.trim(),
        nome: `Auditoria do Relé (${relayConsultaComando.trim()})`,
      });
    }

    if (parametrosHabilitadosBatch.paramDiagnostico && paramComando.trim()) {
      comandos.push({
        cmd: paramComando.trim(),
        nome: `Leitura de Parâmetros EEPROM (${paramComando.trim()})`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // BLOCO 6: Finalização e Aplicação Limpa (O ÚLTIMO COMANDO OBRIGATÓRIO)
    // ─────────────────────────────────────────────────────────────
    // 24. Reinicialização Limpa da MCU (RESET# - Salva NVRAM, reinicia modem e conecta limpo na Lara)
    if (parametrosHabilitadosBatch.resetFinal && resetFinalCmd.trim()) {
      comandos.push({
        cmd: resetFinalCmd.trim(),
        nome: `Final. Reinicialização Limpa da MCU [Último] (${resetFinalCmd.trim()})`,
      });
    }

    return comandos.map((c) => ({
      ...c,
      cmd: sanitizarComandoHardware(c.cmd),
    }));
  }, [
    parametrosHabilitadosBatch,
    usarIpDireto,
    ipDedicado,
    servidorDns,
    portaTcp,
    apnNome,
    apnUser,
    apnPass,
    timerMovimento,
    timerParado,
    hbtLigado,
    hbtDesligado,
    anguloHabilitarCmd,
    anguloIntervalo,
    anguloGrau,
    ignicaoFisicaCmd,
    medicaoInternaMeterCmd,
    voltagemOdometroIexvolCmd,
    sleepMtkCmd,
    sleepGpsCmd,
    gmtComando,
    ledsComando,
    paramComando,
    statusComando,
    relayConsultaComando,
    alertaGuinchoCmd,
    defenseCmd,
    senalmCmd,
    bateriaFracaCmd,
    bateriaCortadaCmd,
    alertaIgnicaoImediataCmd,
    modoVeiculoSleepCmd,
    economiaParadaCmd,
    sensorGSensibilidadeCmd,
    resetFinalCmd,
    numeroSos,
    numeroCenter,
    senhaDispositivoPadrao,
    senhaDispositivoCmd,
    filtroModelo,
  ]);

  // Copia todos os comandos de hardware atualmente habilitados para a área de transferência
  const handleCopiarComandosBatchAtivos = useCallback(async () => {
    const comandos = obterComandosBatchAtivos();
    if (comandos.length === 0) {
      toast.error("Nenhum comando está habilitado no lote para cópia.");
      return;
    }
    const texto = comandos.map((c) => c.cmd).join("\n");
    if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(texto);
        toast.success(
          `${comandos.length} comando(s) habilitado(s) copiado(s) para a área de transferência!`,
        );
      } catch {
        toast.error("Erro ao copiar comandos para a área de transferência.");
      }
    }
  }, [obterComandosBatchAtivos]);

  // Scroll automático restrito estritamente à janela interna do console (sem afetar o rolamento da página)
  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logsTerminal]);

  // Carregar lista de dispositivos e telemetria
  const carregarDispositivos = useCallback(async () => {
    setCarregandoDispositivos(true);
    try {
      // 1. Canal Primário: Rota segura de backend com Service Role (/api/rastreadores)
      // Imune a recursão RLS de clientes e sem bloqueio de tabelas para client anon
      try {
        const sess = await supabase.auth.getSession();
        const token = sess.data.session?.access_token;
        if (token) {
          const res = await fetch("/api/rastreadores", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.dispositivos)) {
              setDispositivos(json.dispositivos);
              const listaWhats: Array<{ id: string; nome: string; telefone: string }> = [];
              const idsVistos = new Set<string>();
              for (const d of json.dispositivos) {
                if (d.clienteId && d.clienteTelefone && !idsVistos.has(d.clienteId)) {
                  idsVistos.add(d.clienteId);
                  listaWhats.push({
                    id: d.clienteId,
                    nome: d.clienteNome || "Cliente",
                    telefone: d.clienteTelefone,
                  });
                }
              }
              setClientesWhatsapp(listaWhats);
              return;
            }
          }
        }
      } catch (errApi) {
        console.warn("[RastreadorJ16View] Fallback na rota primária /api/rastreadores:", errApi);
      }

      // 2. Fallback direto via Supabase SDK
      const [
        { data: rastreadoresData },
        { data: veiculosData },
        { data: instalacoesData },
        { data: clientesData },
      ] = await Promise.all([
        supabase.from("rastreadores").select(`
            id,
            imei,
            modelo,
            status,
            ultima_comunicacao,
            veiculo_id
          `),
        supabase.from("veiculos").select(`
            id,
            cliente_id,
            placa,
            marca_modelo,
            rastreador_imei,
            rastreador_id,
            ignicao_status,
            voltagem,
            bateria_veiculo_v,
            bateria_rastreador_pct,
            satelites,
            velocidade_atual,
            odometro_km,
            ultima_latitude,
            ultima_longitude,
            ultima_atualizacao,
            rele_status,
            sinal_gsm,
            bloqueado
          `),
        supabase.from("instalacoes").select("id, veiculo_id, rastreador_id, status"),
        supabase.from("clientes").select("id, nome_razao_social, telefone"),
      ]);

      const listaMapeada: DispositivoJ16[] = [];
      const imeisAdicionados = new Set<string>();

      // Indexação prévia O(1) dos clientes para associação de telefones WhatsApp
      const clientesPorId = new Map<string, { nome: string; telefone: string }>();
      const listaClientesWhatsapp: Array<{ id: string; nome: string; telefone: string }> = [];
      if (clientesData) {
        for (const c of clientesData) {
          if (c.id) {
            let telNorm = (c.telefone || "").replace(/\D/g, "");
            if (telNorm.length >= 10 && !telNorm.startsWith("55")) {
              telNorm = "55" + telNorm;
            }
            clientesPorId.set(c.id, {
              nome: c.nome_razao_social || "Cliente",
              telefone: c.telefone || "",
            });
            if (telNorm.length >= 10) {
              listaClientesWhatsapp.push({
                id: c.id,
                nome: c.nome_razao_social || "Cliente",
                telefone: telNorm,
              });
            }
          }
        }
      }
      setClientesWhatsapp(listaClientesWhatsapp);

      // Indexação prévia O(1) para alta performance (Pilar Perf & Org do DJR-LOV)
      const instPorRastreadorId = new Map<string, (typeof instalacoesData)[number]>();
      const instPorVeiculoId = new Map<string, (typeof instalacoesData)[number]>();
      if (instalacoesData) {
        for (const i of instalacoesData) {
          if (i.rastreador_id) instPorRastreadorId.set(i.rastreador_id, i);
          if (i.veiculo_id) instPorVeiculoId.set(i.veiculo_id, i);
        }
      }

      const veicPorId = new Map<string, (typeof veiculosData)[number]>();
      const veicPorRastreadorImei = new Map<string, (typeof veiculosData)[number]>();
      const veicPorRastreadorId = new Map<string, (typeof veiculosData)[number]>();
      if (veiculosData) {
        for (const v of veiculosData) {
          if (v.id) veicPorId.set(v.id, v);
          if (v.rastreador_imei) veicPorRastreadorImei.set(v.rastreador_imei, v);
          if (v.rastreador_id) veicPorRastreadorId.set(v.rastreador_id, v);
        }
      }

      // Mapeia da tabela rastreadores com identificação canônica do status real
      if (rastreadoresData) {
        for (const r of rastreadoresData) {
          if (!r.imei) continue;

          const inst =
            (r.id ? instPorRastreadorId.get(r.id) : null) ||
            (r.veiculo_id ? instPorVeiculoId.get(r.veiculo_id) : null) ||
            null;

          const veic =
            (r.veiculo_id ? veicPorId.get(r.veiculo_id) : null) ||
            veicPorRastreadorImei.get(r.imei) ||
            (r.id ? veicPorRastreadorId.get(r.id) : null) ||
            (inst?.veiculo_id ? veicPorId.get(inst.veiculo_id) : null) ||
            null;

          // Determinação canônica e comprovada do status do hardware
          let statusReal = "estoque";
          const instStatus = (inst?.status || "").toLowerCase();

          if (
            instStatus === "agendada" ||
            instStatus === "em_andamento" ||
            instStatus === "aguardando" ||
            r.status === "aguardando_instalacao" ||
            (veic && !inst && !veic.rastreador_imei)
          ) {
            statusReal = "aguardando_instalacao";
          } else if (
            r.status === "instalado" ||
            instStatus === "concluida" ||
            (veic && veic.rastreador_imei === r.imei)
          ) {
            statusReal = "instalado";
          } else {
            statusReal = "estoque";
          }

          const ultData = veic?.ultima_atualizacao || r.ultima_comunicacao;
          const isRecent = ultData
            ? Date.now() - new Date(ultData).getTime() < 1000 * 60 * 15
            : false;

          const cliR = veic?.cliente_id ? clientesPorId.get(veic.cliente_id) : null;
          let telCliR = (cliR?.telefone || "").replace(/\D/g, "");
          if (telCliR.length >= 10 && !telCliR.startsWith("55")) {
            telCliR = "55" + telCliR;
          }

          listaMapeada.push({
            id: r.id,
            imei: r.imei,
            modelo: r.modelo || "J16 4G",
            status: statusReal,
            ultimaComunicacao: r.ultima_comunicacao,
            veiculoId: veic?.id || r.veiculo_id,
            placa: veic?.placa,
            marcaModelo: veic?.marca_modelo,
            clienteId: veic?.cliente_id || null,
            clienteNome: cliR?.nome || null,
            clienteTelefone: telCliR || null,
            ignicaoStatus: veic?.ignicao_status,
            voltagem: veic?.voltagem,
            bateriaVeiculoV: veic?.bateria_veiculo_v,
            bateriaRastreadorPct: veic?.bateria_rastreador_pct,
            satelites: veic?.satelites,
            velocidade: veic?.velocidade_atual,
            odometroKm: veic?.odometro_km,
            ultimaLatitude: veic?.ultima_latitude ? Number(veic.ultima_latitude) : null,
            ultimaLongitude: veic?.ultima_longitude ? Number(veic.ultima_longitude) : null,
            ultimaAtualizacao: veic?.ultima_atualizacao,
            releStatus: veic?.rele_status,
            sinalGsm: veic?.sinal_gsm,
            bloqueado: veic?.bloqueado,
            isTcpOnline: isRecent,
            parametrosAuditados: carregarAuditoriaLocal(r.imei),
          });
          imeisAdicionados.add(r.imei);
        }
      }

      // Adiciona qualquer veículo que tenha rastreador_imei mas não estava na tabela rastreadores
      if (veiculosData) {
        for (const v of veiculosData) {
          if (v.rastreador_imei && !imeisAdicionados.has(v.rastreador_imei)) {
            const isRecent = v.ultima_atualizacao
              ? Date.now() - new Date(v.ultima_atualizacao).getTime() < 1000 * 60 * 15
              : false;

            const cliV = v.cliente_id ? clientesPorId.get(v.cliente_id) : null;
            let telCliV = (cliV?.telefone || "").replace(/\D/g, "");
            if (telCliV.length >= 10 && !telCliV.startsWith("55")) {
              telCliV = "55" + telCliV;
            }

            listaMapeada.push({
              id: v.id,
              imei: v.rastreador_imei,
              modelo: "J16 4G",
              status: "instalado",
              ultimaComunicacao: v.ultima_atualizacao,
              veiculoId: v.id,
              placa: v.placa,
              marcaModelo: v.marca_modelo,
              clienteId: v.cliente_id || null,
              clienteNome: cliV?.nome || null,
              clienteTelefone: telCliV || null,
              ignicaoStatus: v.ignicao_status,
              voltagem: v.voltagem,
              bateriaVeiculoV: v.bateria_veiculo_v,
              bateriaRastreadorPct: v.bateria_rastreador_pct,
              satelites: v.satelites,
              velocidade: v.velocidade_atual,
              odometroKm: v.odometro_km,
              ultimaLatitude: v.ultima_latitude ? Number(v.ultima_latitude) : null,
              ultimaLongitude: v.ultima_longitude ? Number(v.ultima_longitude) : null,
              ultimaAtualizacao: v.ultima_atualizacao,
              releStatus: v.rele_status,
              sinalGsm: v.sinal_gsm,
              bloqueado: v.bloqueado,
              isTcpOnline: isRecent,
              parametrosAuditados: carregarAuditoriaLocal(v.rastreador_imei),
            });
            imeisAdicionados.add(v.rastreador_imei);
          }
        }
      }

      setDispositivos(listaMapeada);
    } catch (err: unknown) {
      console.error("Erro ao carregar dispositivos J16:", err);
      toast.error("Erro ao sincronizar dispositivos");
    } finally {
      setCarregandoDispositivos(false);
    }
  }, []);

  // Persistência automática da seleção de dispositivos pelo usuário (respeita desmarcações)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SELECTED_IMEIS, JSON.stringify(Array.from(selectedImeis)));
      } catch (err) {
        console.warn("Falha ao salvar selectedImeis no localStorage", err);
      }
    }
  }, [selectedImeis]);

  const adicionarLog = useCallback((tipo: LogTerminal["tipo"], texto: string, imei?: string) => {
    const novoLog: LogTerminal = {
      id: `${Date.now()}-${Math.random()}`,
      hora: formatarHoraBrasil(new Date(), true),
      tipo,
      texto,
      imei,
    };
    salvarLogNoHistoricoConsole(novoLog);
    setLogsTerminal((prev) => [...prev.slice(-100), novoLog]);
  }, []);

  // Escuta global de eventos de log emitidos pelo Watchdog e Spooler TCP de Comandos em Aguardo
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{
        tipo: LogTerminal["tipo"];
        texto: string;
        imei?: string;
      }>;
      if (custom.detail) {
        adicionarLog(custom.detail.tipo, custom.detail.texto, custom.detail.imei);
      }
    };
    window.addEventListener("hunter_j16_console_log", handler);
    return () => window.removeEventListener("hunter_j16_console_log", handler);
  }, [adicionarLog]);

  // Processamento e auditoria canônica de retorno do hardware J16 (tripla contingência: HTTP síncrono, Realtime broadcast e Postgres changes)
  const processarRespostaHardwareJ16 = useCallback(
    async (imei: string, resposta: string, comandoOriginal?: string) => {
      if (!imei || !resposta) return;

      // Deduplicação canônica de tripla contingência (HTTP síncrono, Realtime broadcast e Postgres changes):
      // Descarta entregas idênticas para o mesmo IMEI ocorridas em uma janela de até 4 segundos
      const chaveDeduplicacao = `${imei}::${resposta.trim()}`;
      const agora = Date.now();
      const tsAnterior = ultimasRespostasProcessadasRef.current.get(chaveDeduplicacao);
      if (tsAnterior && agora - tsAnterior < 4000) {
        return;
      }
      ultimasRespostasProcessadasRef.current.set(chaveDeduplicacao, agora);

      // Limpeza periódica do mapa de deduplicação
      if (ultimasRespostasProcessadasRef.current.size > 50) {
        for (const [k, v] of ultimasRespostasProcessadasRef.current.entries()) {
          if (agora - v > 30000) {
            ultimasRespostasProcessadasRef.current.delete(k);
          }
        }
      }

      const respUpper = resposta.toUpperCase();
      const isSetOk =
        respUpper.startsWith("SETOK:") ||
        respUpper.includes("SETOK:") ||
        respUpper.includes("TIMER:OK") ||
        respUpper.includes("HBT:OK") ||
        respUpper.includes("APN:OK") ||
        respUpper.includes("SERVER:OK") ||
        respUpper.includes("DYD=SUCCESS") ||
        respUpper.includes("HFYD=SUCCESS");
      const isErroHardware =
        !isSetOk &&
        (respUpper.startsWith("ERROR") ||
          respUpper.startsWith("FAIL") ||
          respUpper.includes("ERROR:") ||
          respUpper.includes("ERR:") ||
          respUpper.includes("REJECT") ||
          respUpper.includes("WRONG") ||
          respUpper.includes("NOT SUPPORT") ||
          respUpper.includes("PASSWORD ERROR") ||
          respUpper.includes("INVALID"));

      if (isErroHardware) {
        adicionarLog(
          "erro",
          `❌ [RESPOSTA DO J16 (0x15)] IMEI ${imei || "—"}: REJEITADO PELO HARDWARE: "${resposta}"`,
          imei,
        );
        toast.error(`Rastreador (${imei || "J16"}): Comando rejeitado pelo hardware: ${resposta}`);
        return;
      }

      adicionarLog(
        "resposta",
        `📥 [RESPOSTA DO J16 (0x15)] IMEI ${imei || "—"}: "${resposta}"`,
        imei,
      );

      // Atualiza alertas locais de comandos em aguardo se houver
      setComandosEmAguardo((prev) => {
        let tevePendente = false;
        const atualizados = prev.map((item) => {
          if (item.imei === imei && item.status === "aguardando") {
            tevePendente = true;
            return {
              ...item,
              status: "concluido" as const,
              respostaHardware: resposta,
            };
          }
          return item;
        });
        if (tevePendente) {
          tocarSomConclusaoComando();
        }
        return atualizados;
      });

      // Notifica o serviço global de comandos em aguardo
      // Dispara canais de alerta (Push, WhatsApp, Ligação MacroDroid) EXCLUSIVAMENTE
      // se houver comando agendado na fila de aguardo (tevePendente === true).
      // Comandos avulsos executados diretamente pelo operador no console NÃO enviam alertas.
      marcarComandoConcluido(imei, resposta, comandoOriginal);

      // ATUALIZAÇÃO AUTOMÁTICA EM TEMPO REAL DA TABELA COM DADOS 100% REAIS E COMPROVADOS DO HARDWARE
      const ultimoCmd = comandoOriginal || ultimosComandosDespachadosRef.current[imei]?.cmd;
      const paramsNovos = extrairParametrosDeRespostaJ16(resposta, ultimoCmd);

      // Filtra chaves relevantes extraídas além dos metadados
      const camposAuditados = Object.keys(paramsNovos).filter(
        (k) => k !== "auditadoEm" && k !== "respostaBruta",
      );

      if (camposAuditados.length > 0) {
        setDispositivos((prev) =>
          prev.map((d) => {
            if (d.imei === imei) {
              const auditadoAtual = d.parametrosAuditados || {};
              const consolidado: ParametrosHardwareAuditados = {
                ...auditadoAtual,
                ...paramsNovos,
              };
              salvarAuditoriaLocal(imei, consolidado);

              const atualizado = {
                ...d,
                parametrosAuditados: consolidado,
              };

              // Se houver confirmação comprovada do relé pelo J16
              if (paramsNovos.relay === "1") {
                atualizado.bloqueado = true;
                atualizado.releStatus = true;
              } else if (paramsNovos.relay === "0") {
                atualizado.bloqueado = false;
                atualizado.releStatus = false;
              }

              return atualizado;
            }
            return d;
          }),
        );

        // Sincroniza status comprovado do relé no banco de dados veiculos
        if (paramsNovos.relay === "1" || paramsNovos.relay === "0") {
          const isBloq = paramsNovos.relay === "1";
          await supabase
            .from("veiculos")
            .update({
              bloqueado: isBloq,
              rele_status: isBloq,
            })
            .eq("rastreador_imei", imei);
        }

        toast.success(
          `Rastreador (${imei}): Parâmetro(s) [${camposAuditados.join(", ")}] confirmado(s) pelo hardware!`,
        );
        adicionarLog(
          "status",
          `✅ [COMPROVADO PELO HARDWARE] IMEI ${imei} assumiu: ${camposAuditados.map((c) => `${c}=${(paramsNovos as Record<string, unknown>)[c] ?? ""}`).join(", ")}`,
          imei,
        );
      } else {
        toast.success(`Resposta do rastreador (${imei}): ${resposta}`);
      }
    },
    [adicionarLog],
  );

  useEffect(() => {
    carregarDispositivos();

    // Inscrição Realtime no canal do Gateway para status e respostas
    const canal = supabase.channel("hunter_gateway_comandos");
    canalRef.current = canal;

    canal
      .on(
        "broadcast",
        { event: "status_comando" },
        (payload: {
          payload?: {
            imei?: string;
            comando?: string;
            sucesso?: boolean;
            mensagem?: string;
          };
        }) => {
          const { imei, comando, sucesso, mensagem } = payload.payload || {};
          adicionarLog(
            sucesso ? "status" : "erro",
            `📡 [GATEWAY TCP] IMEI ${imei || "—"} | Comando: "${comando}" -> ${mensagem}`,
            imei,
          );
        },
      )
      .on(
        "broadcast",
        { event: "resposta_comando" },
        async (payload: {
          payload?: { imei?: string; resposta?: string; comandoOriginal?: string };
        }) => {
          const { imei, resposta, comandoOriginal } = payload.payload || {};
          if (imei && resposta) {
            await processarRespostaHardwareJ16(imei, resposta, comandoOriginal);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "eventos_veiculo",
          filter: "tipo=eq.comando_resposta",
        },
        async (payload: { new?: { descricao?: string; veiculo_id?: string } }) => {
          const desc = payload.new?.descricao || "";
          const match = desc.match(/Retorno do comando:\s*(.+)$/);
          if (match && match[1]) {
            const respTexto = match[1].trim();
            const matchImei = respTexto.match(/(?:IMEI|ID):(\d{15})/);
            const imeiAlvo =
              matchImei?.[1] ||
              dispositivosRef.current.find((d) => d.veiculoId === payload.new?.veiculo_id)?.imei;
            if (imeiAlvo) {
              await processarRespostaHardwareJ16(imeiAlvo, respTexto);
            }
          }
        },
      )
      .on(
        "broadcast",
        { event: "conexoes_ativas" },
        (payload: { payload?: { conexoes?: Array<{ imei: string }> } }) => {
          const { conexoes } = payload.payload || {};
          if (Array.isArray(conexoes)) {
            const imeisAtivos = new Set(conexoes.map((c) => c.imei));
            setDispositivos((prev) =>
              prev.map((d) => ({
                ...d,
                isTcpOnline: imeisAtivos.has(d.imei) || d.isTcpOnline,
              })),
            );
          }
        },
      )
      .subscribe();

    // Solicita status de conexões ativas
    const timerConexoes = setTimeout(() => {
      canal.send({
        type: "broadcast",
        event: "solicitar_conexoes_ativas",
        payload: {},
      });
    }, 1000);

    return () => {
      clearTimeout(timerConexoes);
      canalRef.current = null;
      canal.unsubscribe();
    };
  }, [carregarDispositivos, processarRespostaHardwareJ16, adicionarLog]);

  const copiarTexto = (texto: string, label: string, id?: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id || texto);
    toast.success(`Copiado: ${label}`);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const copiarTextoConsole = () => {
    if (logsTerminal.length === 0) {
      toast.error("O console está vazio!");
      return;
    }
    const textoCompleto = logsTerminal.map((log) => `[${log.hora}]\n${log.texto}`).join("\n\n");
    navigator.clipboard
      .writeText(textoCompleto)
      .then(() => {
        setConsoleCopiado(true);
        toast.success("Histórico do console copiado para a memória!");
        setTimeout(() => setConsoleCopiado(false), 2000);
      })
      .catch(() => {
        toast.error("Erro ao copiar histórico do console.");
      });
  };

  // Alternância de seleção individual
  const toggleSelectImei = (imei: string) => {
    setSelectedImeis((prev) => {
      const next = new Set(prev);
      if (next.has(imei)) {
        next.delete(imei);
      } else {
        next.add(imei);
      }
      return next;
    });
  };

  // Selecionar ou desmarcar todos os visíveis
  const toggleSelectAll = () => {
    const todosVisiveisImeis = dispositivosFiltrados.map((d) => d.imei);
    const todosJaSelecionados = todosVisiveisImeis.every((imei) => selectedImeis.has(imei));

    setSelectedImeis((prev) => {
      const next = new Set(prev);
      if (todosJaSelecionados) {
        todosVisiveisImeis.forEach((imei) => next.delete(imei));
      } else {
        todosVisiveisImeis.forEach((imei) => next.add(imei));
      }
      return next;
    });
  };

  const servidorAlvo = usarIpDireto ? ipDedicado : servidorDns;
  const modoServidor = usarIpDireto ? "0" : "1";

  const converterComandoParaModeloHardware = (
    cmd: string,
    modeloHardware?: string | null,
    senhaMestre?: string,
  ): string => {
    const isG900L = Boolean(modeloHardware && modeloHardware.toUpperCase().includes("G900"));
    if (!isG900L) {
      return sanitizarComandoHardware(cmd);
    }

    const senha = (senhaMestre || "123456").trim() || "123456";
    const upper = cmd.trim().toUpperCase().replace(/#+$/, "");

    // Mapeamento automático de comandos GT06/J16 para sintaxe Coban G900L:
    if (upper.startsWith("SERVER,") || upper.startsWith("SERVER#") || upper === "SERVER") {
      const partes = cmd.replace(/#+$/, "").split(",");
      if (partes.length >= 4) {
        return `adminip${senha} ${partes[2]} ${partes[3]}`;
      }
      return `adminip${senha} 167.234.233.82 7003`;
    }

    if (upper.startsWith("APN,") || upper.startsWith("APN#") || upper === "APN") {
      const partes = cmd.replace(/#+$/, "").split(",");
      if (partes.length >= 4) {
        return `apn${senha} ${partes[1]} ${partes[2]} ${partes[3]}`;
      } else if (partes.length >= 2) {
        return `apn${senha} ${partes[1]}`;
      }
      return `apn${senha} voxter.br algar 1212`;
    }

    if (upper.startsWith("TIMER,") || upper.startsWith("TIMER#") || upper === "TIMER") {
      const partes = cmd.replace(/#+$/, "").split(",");
      const mov = partes[1] ? String(parseInt(partes[1], 10) || 30).padStart(3, "0") : "030";
      return `fix${mov}s***n${senha}`;
    }

    if (upper.startsWith("HBT,") || upper.startsWith("HBT#") || upper === "HBT") {
      const partes = cmd.replace(/#+$/, "").split(",");
      const seg = partes[1] || "300";
      return `hbt${senha} ${seg}`;
    }

    if (upper.startsWith("GMT,") || upper.startsWith("GMT#") || upper === "GMT") {
      return `time zone${senha} 0`;
    }

    if (upper === "PARAM" || upper.startsWith("PARAM#") || upper.startsWith("CHECK")) {
      return `check${senha}`;
    }

    if (upper === "STATUS" || upper.startsWith("STATUS#") || upper.startsWith("STATUS1")) {
      return `status${senha}`;
    }

    if (upper === "RESET" || upper.startsWith("RESET#") || upper.startsWith("RESET1")) {
      return `reset${senha}`;
    }

    if (
      upper === "WHERE" ||
      upper.startsWith("WHERE#") ||
      upper === "URL" ||
      upper.startsWith("URL#")
    ) {
      return `G${senha}#`;
    }

    if (upper === "RELAY,1" || upper.startsWith("DYD")) {
      return `stop${senha}`;
    }

    if (upper === "RELAY,0" || upper.startsWith("HFYD")) {
      return `resume${senha}`;
    }

    if (upper.startsWith("SOS,A,") || upper.startsWith("ADMIN#")) {
      const nums = cmd.replace(/\D/g, "");
      if (nums.length >= 10) {
        return `admin${senha} ${nums}`;
      }
    }

    return sanitizarComandoHardware(cmd);
  };

  // Disparo direto de comando para um IMEI específico via Gateway TCP/GPRS HTTP e redundância Realtime
  const enviarComandoParaImei = async (
    imeiAlvo: string,
    comandoTexto: string,
    veiculoId?: string | null,
  ) => {
    const dispAlvo = dispositivosRef.current.find((d) => d.imei === imeiAlvo);
    const cmdLimpo = converterComandoParaModeloHardware(
      comandoTexto,
      dispAlvo?.modelo,
      senhaDispositivoPadrao,
    );

    // REGRA IMPERIOSA: S.adm Auditor só pode disparar consultas (leitura), NUNCA alteração de parâmetros
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      const isConsulta = ehComandoConsultaSomenteLeitura(cmdLimpo);

      if (!isConsulta) {
        toast.error(
          "Comando não autorizado: O perfil S.adm Auditor só pode disparar consultas de leitura (STATUS, WHERE, PARAM, RELAY#, MILEAGE#, etc.). Proibido alterar parâmetros ou bloquear veículos.",
        );
        return;
      }
    }

    ultimosComandosDespachadosRef.current[imeiAlvo] = {
      cmd: cmdLimpo,
      timestamp: Date.now(),
    };

    let despachadoComSucesso = false;

    // 1. DISPARO PRIMÁRIO DIRETO VIA PROXY HTTP DO GATEWAY (TCP/GPRS IMEDIATO AO SOCKET)
    try {
      const resHttp = await fetch("/api/gateway/comando", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imei: imeiAlvo,
          comando: cmdLimpo,
          veiculoId: veiculoId || undefined,
          origem: "painel_j16_admin",
        }),
      });

      if (resHttp.ok) {
        const dados = await resHttp.json();
        despachadoComSucesso = true;
        if (dados.enviado) {
          adicionarLog(
            "status",
            `📡 [GATEWAY TCP] Transmitido via socket TCP ativo para IMEI ${imeiAlvo}. Aguardando retorno do hardware (0x15/0x21)...`,
            imeiAlvo,
          );
        } else if (dados.enfileirado) {
          adicionarLog(
            "status",
            `⏳ [SPOOLER GATEWAY] IMEI ${imeiAlvo} offline ou em reconexão. Comando retido no Gateway para disparo automático no login do socket.`,
            imeiAlvo,
          );
        }

        // Se o Gateway obteve a resposta síncrona do hardware (0x15/0x21), processa no mesmo instante
        if (dados.resposta) {
          await processarRespostaHardwareJ16(imeiAlvo, dados.resposta, cmdLimpo);
        } else if (alertaAguardoAtivo) {
          const disp = dispositivosRef.current.find((d) => d.imei === imeiAlvo);
          const isDesligado = disp?.ignicaoStatus === false || !disp?.isTcpOnline;
          const hbtTempo = isDesligado ? Number(hbtDesligado) || 300 : Number(hbtLigado) || 30;

          const novoAlerta = {
            imei: imeiAlvo,
            placa: disp?.placa || "Sem Placa",
            modelo: disp?.marcaModelo || disp?.modelo || "Rastreador J16",
            clienteNome: disp?.clienteNome || undefined,
            comando: cmdLimpo,
            horaDisparo: formatarHoraBrasil(new Date(), true),
            hbtSegundos: hbtTempo,
            segundosRestantes: hbtTempo,
          };

          adicionarComandoEmAguardo(novoAlerta);
        }
      }
    } catch (httpErr) {
      console.warn("Proxy HTTP do Gateway temporariamente indisponível:", httpErr);
    }

    // Se for comando de corte ou liberação de relé, transmite par complementar para compatibilidade total
    const senhaAtivaRele = senhaDispositivoPadrao.trim() || "123456";
    if (cmdLimpo === "RELAY,1" || cmdLimpo.startsWith("DYD")) {
      const complementar = cmdLimpo === "RELAY,1" ? `DYD,${senhaAtivaRele}` : "RELAY,1";
      try {
        await new Promise((r) => setTimeout(r, 400));
        await fetch("/api/gateway/comando", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imei: imeiAlvo,
            comando: complementar,
            veiculoId: veiculoId || undefined,
            origem: "painel_j16_admin",
          }),
        });
      } catch {
        // silencioso
      }
    } else if (cmdLimpo === "RELAY,0" || cmdLimpo.startsWith("HFYD")) {
      const complementar = cmdLimpo === "RELAY,0" ? `HFYD,${senhaAtivaRele}` : "RELAY,0";
      try {
        await new Promise((r) => setTimeout(r, 400));
        await fetch("/api/gateway/comando", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imei: imeiAlvo,
            comando: complementar,
            veiculoId: veiculoId || undefined,
            origem: "painel_j16_admin",
          }),
        });
      } catch {
        // silencioso
      }
    }

    // 2. DISPARO DE CONTINGÊNCIA VIA SUPABASE REALTIME (Acionado apenas se o disparo HTTP primário falhar)
    if (!despachadoComSucesso && canalRef.current) {
      try {
        await canalRef.current.send({
          type: "broadcast",
          event: "comando_terminal",
          payload: {
            imei: imeiAlvo,
            comando: cmdLimpo,
            veiculoId: veiculoId || undefined,
            origem: "painel_j16_admin",
            timestamp: new Date().toISOString(),
          },
        });
        despachadoComSucesso = true;
      } catch (rtErr) {
        console.warn("Aviso ao disparar contingência Realtime para o terminal:", rtErr);
      }
    }
  };

  // Disparo de um comando específico para TODOS os dispositivos selecionados
  const dispararComandoParaSelecionados = async (comandoTexto: string, descricaoLabel?: string) => {
    if (selectedImeis.size === 0) {
      toast.error("Nenhum rastreador selecionado na listagem!");
      return;
    }

    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      const isConsulta = ehComandoConsultaSomenteLeitura(sanitizarComandoHardware(comandoTexto));

      if (!isConsulta) {
        toast.error(
          "Comando não autorizado: O perfil S.adm Auditor só pode disparar consultas de leitura (STATUS, WHERE, PARAM, RELAY#, MILEAGE#, etc.). Proibido alterar parâmetros ou bloquear veículos.",
        );
        return;
      }
    }

    const imeisArray = Array.from(selectedImeis);
    const label = descricaoLabel || comandoTexto;

    setEnviandoComando(true);
    adicionarLog(
      "envio",
      `📤 [DISPARO EM LOTE] Enviando "${comandoTexto}" (${label}) para ${imeisArray.length} dispositivo(s) selecionado(s)...`,
    );

    try {
      for (let i = 0; i < imeisArray.length; i++) {
        const imei = imeisArray[i];
        const veicId = dispositivos.find((d) => d.imei === imei)?.veiculoId;
        await enviarComandoParaImei(imei, comandoTexto, veicId);
        adicionarLog(
          "status",
          `⚡ [${i + 1}/${imeisArray.length}] Comando transmitido para IMEI ${imei}`,
          imei,
        );
        if (i < imeisArray.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      toast.success(
        `Comando "${comandoTexto}" enviado com sucesso para ${imeisArray.length} rastreador(es)!`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      adicionarLog("erro", `❌ Falha no disparo: ${msg}`);
      toast.error("Falha no disparo do comando");
    } finally {
      setEnviandoComando(false);
    }
  };

  // Dispara o comando direto digitado na barra de pesquisa para todos os rastreadores selecionados
  const handleDispararComandoDaBusca = () => {
    const cmd = buscaComandoCatalogo.trim();
    if (!cmd) {
      toast.error("Digite um comando na barra de pesquisa para disparar.");
      return;
    }

    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      const isConsulta = ehComandoConsultaSomenteLeitura(sanitizarComandoHardware(cmd));

      if (!isConsulta) {
        toast.error(
          "Comando não autorizado: O perfil S.adm Auditor só pode disparar consultas de leitura (STATUS, WHERE, PARAM, RELAY#, MILEAGE#, etc.). Proibido alterar parâmetros ou bloquear veículos.",
        );
        return;
      }
    }

    if (selectedImeis.size === 0) {
      toast.error("Selecione ao menos 1 rastreador na listagem para disparar.");
      return;
    }
    dispararComandoParaSelecionados(cmd, `Comando Direto (${cmd})`);
  };

  // Disparo de Ação Rápida individual (1-Clique) com validação comprovada no hardware
  const dispararAcaoRapida = async (
    imeiAlvo: string,
    comandoTexto: string,
    labelAcao: string,
    veiculoId?: string | null,
  ) => {
    adicionarLog(
      "envio",
      `⚡ [AÇÃO RÁPIDA 1-CLIQUE] Transmitindo "${comandoTexto}" (${labelAcao}) para IMEI ${imeiAlvo}...`,
      imeiAlvo,
    );
    try {
      await enviarComandoParaImei(imeiAlvo, comandoTexto, veiculoId);
      adicionarLog(
        "status",
        `📡 [${labelAcao}] Despachado ao socket TCP. Aguardando confirmação do microcontrolador J16...`,
        imeiAlvo,
      );
      toast.success(`${labelAcao} transmitido. Aguardando confirmação do hardware.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      adicionarLog("erro", `❌ Falha ao despachar ${labelAcao}: ${msg}`, imeiAlvo);
      toast.error(`Falha no envio de ${labelAcao}`);
    }
  };

  // Disparo de TODOS OS PARÂMETROS DE UMA SÓ VEZ (Batch Completo) para os selecionados
  const dispararTodosParametrosBatch = async () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui acesso estritamente de consulta (Read-Only). O envio de lotes de parametrização e alteração de hardware é restrito ao SuperADM.",
      );
      return;
    }

    if (selectedImeis.size === 0) {
      toast.error("Selecione pelo menos um dispositivo na listagem acima!");
      return;
    }

    const imeisArray = Array.from(selectedImeis);

    const sequenciaComandos = obterComandosBatchAtivos();
    if (sequenciaComandos.length === 0) {
      toast.error("Nenhum parâmetro selecionado para envio! Marque ao menos um checkbox.");
      return;
    }

    setEnviandoComando(true);
    setProgressoBatch({
      ativo: true,
      total: sequenciaComandos.length * imeisArray.length,
      atual: 0,
      comandoAtual: "Iniciando carga completa de parâmetros...",
    });

    adicionarLog(
      "info",
      `🚀 [CARGA TOTAL DE PARÂMETROS] Iniciando transmissão de ${sequenciaComandos.length} parâmetros para ${imeisArray.length} dispositivo(s) selecionado(s)...`,
    );

    try {
      let passoAtual = 0;
      for (const imei of imeisArray) {
        const disp = dispositivosRef.current.find((d) => d.imei === imei);
        const telCliente = disp?.clienteTelefone;

        adicionarLog(
          "envio",
          `═══════════════════════ Dispositivo IMEI: ${imei} (${disp?.marcaModelo || "Veículo"} - ${disp?.placa || "Sem placa"} | Cliente: ${disp?.clienteNome || "Não atribuído"}) ═══════════════════════`,
          imei,
        );

        for (const item of sequenciaComandos) {
          passoAtual++;

          let cmdFinal = item.cmd;
          let nomeFinal = item.nome;

          // Se for comando de SOS: prioriza o telefone do cliente do rastreador
          if (item.cmd.startsWith("SOS,A,")) {
            const foneSos =
              telCliente ||
              (numeroSos.replace(/\D/g, "").length >= 10 ? numeroSos.replace(/\D/g, "") : "") ||
              clientesWhatsapp[0]?.telefone ||
              VALORES_PADRAO_CANONICO_J16.numeroSos;
            if (foneSos && foneSos.length >= 10) {
              cmdFinal = `SOS,A,${foneSos}#`;
              nomeFinal = `22. Número SOS Cliente (${disp?.clienteNome || "Cliente"}: ${foneSos})`;
            } else {
              adicionarLog(
                "info",
                `⚠️ [${imei}] Dispositivo sem WhatsApp de cliente para SOS - pulando comando malformado.`,
                imei,
              );
              continue;
            }
          }

          // Se for comando de Admin: prioriza o telefone do cliente do rastreador
          if (item.cmd.startsWith("admin#")) {
            const senhaAtiva = senhaDispositivoPadrao.trim() || "123456";
            const foneAdmin =
              telCliente ||
              (numeroCenter.replace(/\D/g, "").length >= 10
                ? numeroCenter.replace(/\D/g, "")
                : "") ||
              clientesWhatsapp[0]?.telefone ||
              VALORES_PADRAO_CANONICO_J16.numeroCenter;
            if (foneAdmin && foneAdmin.length >= 10) {
              cmdFinal = `admin#${senhaAtiva}#${foneAdmin}#`;
              nomeFinal = `23. Administrador Cliente (${disp?.clienteNome || "Cliente"}: ${foneAdmin})`;
            } else {
              adicionarLog(
                "info",
                `⚠️ [${imei}] Dispositivo sem WhatsApp de cliente para Admin - pulando comando malformado.`,
                imei,
              );
              continue;
            }
          }

          setProgressoBatch({
            ativo: true,
            total: sequenciaComandos.length * imeisArray.length,
            atual: passoAtual,
            comandoAtual: `[${imei}] ${nomeFinal} -> "${cmdFinal}"`,
          });

          await enviarComandoParaImei(imei, cmdFinal);
          adicionarLog("status", `📡 [${nomeFinal}] Despachado: "${cmdFinal}"`, imei);

          // Se o comando for calibração de ignição ACCLINE, a MCU reinicia o modem celular (leva ~35s para reabrir socket)
          if (item.cmd.startsWith("SZCS#ACCLINE")) {
            adicionarLog(
              "info",
              `⏳ [SALVAGUARDA DE HARDWARE] O J16 reinicia a interface celular após aplicar ignição física (ACCLINE). Aguardando estabilização da rede celular (30s)...`,
              imei,
            );
            await new Promise((r) => setTimeout(r, 30000));
          } else {
            // Cadência dinâmica de salvaguarda: 5000ms para calibração SZCS e leituras EEPROM (PARAM#/STATUS#), 3500ms para escrita padrão
            const delayMs =
              item.cmd.startsWith("SZCS") ||
              item.cmd.includes("PARAM") ||
              item.cmd.includes("STATUS")
                ? 5000
                : 3500;
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }

      toast.success(
        `Todos os parâmetros foram transmitidos via socket TCP para ${imeisArray.length} dispositivo(s)!`,
      );
      adicionarLog(
        "info",
        `✅ [DISPARO TCP CONCLUÍDO] Todos os ${sequenciaComandos.length} comandos foram transmitidos via socket TCP aos ${imeisArray.length} aparelhos selecionados. Acompanhe abaixo as confirmações [0x15/0x21] do hardware.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      adicionarLog("erro", `❌ Falha durante a carga total de parâmetros: ${msg}`);
      toast.error("Erro durante o envio da carga de parâmetros");
    } finally {
      setEnviandoComando(false);
      setProgressoBatch(null);
    }
  };

  const catalogoComandos: {
    num: number;
    titulo: string;
    exemplo: string;
    desc: string;
    prioridade: "Obrigatório" | "Recomendado" | "Segurança" | "Diagnóstico" | "Opcional";
    categoria: string;
    presets?: { label: string; valor: string }[];
  }[] = useMemo(() => {
    const senhaAtiva = (senhaDispositivoPadrao || "123456").trim() || "123456";

    if (filtroModelo === "g900l") {
      return [
        {
          num: 1,
          titulo: "Conectar Servidor Coban (adminip)",
          exemplo: `adminip${senhaAtiva} ${servidorAlvo} ${portaTcp}`,
          desc: `Aponta o rastreador G900L para o servidor ${servidorAlvo}:${portaTcp} via protocolo Coban.`,
          prioridade: "Obrigatório",
          categoria: "Conectividade",
          presets: [
            {
              label: `IP Direto (${ipDedicado}:${portaTcp})`,
              valor: `adminip${senhaAtiva} ${ipDedicado} ${portaTcp}`,
            },
            {
              label: `DNS Oficial (${servidorDns}:${portaTcp})`,
              valor: `adminip${senhaAtiva} ${servidorDns} ${portaTcp}`,
            },
          ],
        },
        {
          num: 2,
          titulo: "Internet do Chip APN (apn)",
          exemplo:
            apnUser && apnPass
              ? `apn${senhaAtiva} ${apnNome} ${apnUser} ${apnPass}`
              : `apn${senhaAtiva} ${apnNome}`,
          desc: "Cadastra a APN da operadora para conexão 4G LTE do G900L.",
          prioridade: "Obrigatório",
          categoria: "Conectividade",
          presets: [
            {
              label: `APN Algar/Voxter (${apnNome})`,
              valor: `apn${senhaAtiva} ${apnNome} ${apnUser} ${apnPass}`,
            },
            {
              label: `APN Simples (${apnNome})`,
              valor: `apn${senhaAtiva} ${apnNome}`,
            },
          ],
        },
        {
          num: 3,
          titulo: "Intervalo de Transmissão (fix)",
          exemplo: `fix${String(timerMovimento || "30").padStart(3, "0")}s***n${senhaAtiva}`,
          desc: `Transmissão contínua em movimento a cada ${timerMovimento || 30} segundos (protocolo Coban).`,
          prioridade: "Recomendado",
          categoria: "Telemetria",
          presets: [
            {
              label: "30 segundos (Padrão GD - fix030s***n)",
              valor: `fix030s***n${senhaAtiva}`,
            },
            {
              label: "15 segundos (Alta Precisão - fix015s***n)",
              valor: `fix015s***n${senhaAtiva}`,
            },
            {
              label: "60 segundos (Economia - fix060s***n)",
              valor: `fix060s***n${senhaAtiva}`,
            },
            {
              label: "Cancelar Envio Contínuo (nofix)",
              valor: `nofix${senhaAtiva}`,
            },
          ],
        },
        {
          num: 4,
          titulo: "Sinal de Presença (hbt)",
          exemplo: `hbt${senhaAtiva} ${hbtLigado || "300"}`,
          desc: `Heartbeat a cada ${hbtLigado || 300} segundos para manter a conexão ativa no servidor.`,
          prioridade: "Recomendado",
          categoria: "Conectividade",
          presets: [
            { label: `300s (5 minutos)`, valor: `hbt${senhaAtiva} 300` },
            { label: `180s (3 minutos)`, valor: `hbt${senhaAtiva} 180` },
          ],
        },
        {
          num: 5,
          titulo: "Fuso Horário UTC Zero (time zone)",
          exemplo: `time zone${senhaAtiva} 0`,
          desc: "Sincroniza o relógio do G900L no fuso GMT/UTC 0 canônico da plataforma.",
          prioridade: "Obrigatório",
          categoria: "Conectividade",
          presets: [{ label: "UTC 0 (Padrão Plataforma)", valor: `time zone${senhaAtiva} 0` }],
        },
        {
          num: 6,
          titulo: "Auditoria Geral de Parâmetros (check)",
          exemplo: `check${senhaAtiva}`,
          desc: "Retorna todos os parâmetros gravados na controladora G900L (IP, porta, APN, timers).",
          prioridade: "Diagnóstico",
          categoria: "Auditoria",
          presets: [{ label: "Verificar Parâmetros (check)", valor: `check${senhaAtiva}` }],
        },
        {
          num: 7,
          titulo: "Status Operacional (status)",
          exemplo: `status${senhaAtiva}`,
          desc: "Retorna o estado de alimentação 12V, bateria interna, GPS e sinal celular.",
          prioridade: "Diagnóstico",
          categoria: "Auditoria",
          presets: [{ label: "Consultar Status (status)", valor: `status${senhaAtiva}` }],
        },
        {
          num: 8,
          titulo: "Consultar IMEI (imei)",
          exemplo: `imei${senhaAtiva}`,
          desc: "Consulta o número de série IMEI gravado no firmware G900L.",
          prioridade: "Diagnóstico",
          categoria: "Auditoria",
          presets: [{ label: "Ler IMEI", valor: `imei${senhaAtiva}` }],
        },
        {
          num: 9,
          titulo: "Localização Maps (G123456#)",
          exemplo: `G${senhaAtiva}#`,
          desc: "Retorna link com coordenadas no Google Maps e status imediato.",
          prioridade: "Diagnóstico",
          categoria: "Auditoria",
          presets: [{ label: "Obter Localização", valor: `G${senhaAtiva}#` }],
        },
        {
          num: 10,
          titulo: "Modo GPRS Ativo (gprs)",
          exemplo: `gprs${senhaAtiva}`,
          desc: "Ativa o canal de dados GPRS 4G para transmissão direta à plataforma.",
          prioridade: "Obrigatório",
          categoria: "Conectividade",
          presets: [{ label: "Ativar GPRS", valor: `gprs${senhaAtiva}` }],
        },
        {
          num: 11,
          titulo: "Bloqueio Veicular (stop)",
          exemplo: `stop${senhaAtiva}`,
          desc: "Aciona o corte de combustível/ignição do veículo pelo relé G900L.",
          prioridade: "Segurança",
          categoria: "Cadeado Digital",
          presets: [{ label: "Bloquear Veículo (stop)", valor: `stop${senhaAtiva}` }],
        },
        {
          num: 12,
          titulo: "Desbloqueio Veicular (resume)",
          exemplo: `resume${senhaAtiva}`,
          desc: "Libera o relé permitindo a partida normal do veículo.",
          prioridade: "Segurança",
          categoria: "Cadeado Digital",
          presets: [{ label: "Liberar Veículo (resume)", valor: `resume${senhaAtiva}` }],
        },
        {
          num: 13,
          titulo: "Reiniciar Rastreador (reset)",
          exemplo: `reset${senhaAtiva}`,
          desc: "Reinicia a controladora interna do G900L para aplicar os novos parâmetros.",
          prioridade: "Obrigatório",
          categoria: "Hardware",
          presets: [{ label: "Reiniciar Dispositivo (reset)", valor: `reset${senhaAtiva}` }],
        },
      ];
    }

    return [
      {
        num: 1,
        titulo: "Conectar Servidor (SERVER / DNS)",
        exemplo: `SERVER,${modoServidor},${servidorAlvo},${portaTcp},0#`,
        desc: usarIpDireto
          ? `Conecta via IP direto (${ipDedicado}:${portaTcp}) com máxima estabilidade.`
          : `Conecta pelo endereço oficial (${servidorDns}:${portaTcp}) do GD Rastreamento.`,
        prioridade: "Obrigatório",
        categoria: "Conectividade",
        presets: [
          {
            label: "Endereço Oficial (DNS)",
            valor: `SERVER,${modoServidor},${servidorDns},${portaTcp},0#`,
          },
          {
            label: "IP Direto (SERVER)",
            valor: `SERVER,${modoServidor},${ipDedicado},${portaTcp},0#`,
          },
        ],
      },
      {
        num: 2,
        titulo: "Internet do Chip (APN)",
        exemplo: `APN,${apnNome},${apnUser},${apnPass}#`,
        desc: "Cadastra o chip de internet da operadora para o aparelho navegar na rede 4G.",
        prioridade: "Obrigatório",
        categoria: "Conectividade",
        presets: [
          { label: "Chip Atual (APN)", valor: `APN,${apnNome},${apnUser},${apnPass}#` },
          { label: "Consultar Chip (GPRSSET#)", valor: "GPRSSET#" },
        ],
      },
      {
        num: 3,
        titulo: "Intervalo de Envio (TIMER)",
        exemplo: `TIMER,${timerMovimento},${timerParado}#`,
        desc: `Tempo entre posições: a cada ${timerMovimento}s andando e a cada ${timerParado}s com o carro parado.`,
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          {
            label: `Padrão Atual (${timerMovimento}s/${timerParado}s)`,
            valor: `TIMER,${timerMovimento},${timerParado}#`,
          },
          {
            label: "Padrão Oficial Homologado Voxter (30s/3600s - TIMER,30,3600#)",
            valor: "TIMER,30,3600#",
          },
          {
            label: "Equilibrado (30s/1800s - TIMER,30,1800#)",
            valor: "TIMER,30,1800#",
          },
          {
            label: "Alta Precisão (15s/1800s - TIMER,15,1800#)",
            valor: "TIMER,15,1800#",
          },
          {
            label: "Alta Resolução (12s/1800s - TIMER,12,1800#)",
            valor: "TIMER,12,1800#",
          },
        ],
      },
      {
        num: 4,
        titulo: "Sinal de Presença (HBT)",
        exemplo: `HBT,${hbtLigado},${hbtDesligado}#`,
        desc: "Pulso periódico que avisa ao sistema que o aparelho está vivo e conectado.",
        prioridade: "Recomendado",
        categoria: "Conectividade",
        presets: [
          {
            label: `Padrão Atual (${hbtLigado}s/${hbtDesligado}s)`,
            valor: `HBT,${hbtLigado},${hbtDesligado}#`,
          },
          {
            label: "Padrão Oficial Homologado Voxter (300s/300s - HBT,300,300#)",
            valor: "HBT,300,300#",
          },
          {
            label: "Alternativo Conservador (120s/600s - HBT,120,600#)",
            valor: "HBT,120,600#",
          },
          { label: "Mais Frequente (120s/240s - HBT,120,240#)", valor: "HBT,120,240#" },
        ],
      },
      {
        num: 5,
        titulo: "Desenho em Curvas (ANGLEVALUE)",
        exemplo: `SZCS#ANGLEVALUE=${Math.max(10, parseInt(anguloIntervalo, 10) || 10)}-${String(anguloGrau).padStart(3, "0")}`,
        desc: "Garante que as curvas e rotatórias fiquem perfeitamente desenhadas no mapa (a MCU do J16 exige intervalo mínimo de 10s).",
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          {
            label: `Padrão MCU (${Math.max(10, parseInt(anguloIntervalo, 10) || 10)}s/${anguloGrau}° - ANGLEVALUE)`,
            valor: `SZCS#ANGLEVALUE=${Math.max(10, parseInt(anguloIntervalo, 10) || 10)}-${String(anguloGrau).padStart(3, "0")}`,
          },
          {
            label: `Universal Concox (${anguloIntervalo}s/${anguloGrau}° - ANGLE)`,
            valor: `ANGLE,${anguloIntervalo},${anguloGrau}#`,
          },
          { label: "Curva Fechada (10s/30° - ANGLEVALUE)", valor: "SZCS#ANGLEVALUE=10-030" },
          { label: "Consultar Ângulo (CXCS#ANGLEVALUE)", valor: "CXCS#ANGLEVALUE" },
        ],
      },
      {
        num: 6,
        titulo: "Contador de Km da MCU (GT06METER)",
        exemplo: "SZCS#GT06SEL=1#GT06METER=1",
        desc: "Liga, desliga ou consulta o cálculo de quilômetros rodados dentro do próprio aparelho.",
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          { label: "Ativar Odômetro MCU (GT06METER=1)", valor: "SZCS#GT06SEL=1#GT06METER=1" },
          { label: "Desligar Odômetro MCU (GT06METER=0)", valor: "SZCS#GT06METER=0" },
          { label: "Consultar Odômetro MCU (CXCS#GT06METER)", valor: "CXCS#GT06METER" },
          { label: "Consultar Protocolo GT06 (CXCS#GT06SEL)", valor: "CXCS#GT06SEL" },
        ],
      },
      {
        num: 7,
        titulo: "Tipo de Ignição (ACC / ACCLINE)",
        exemplo: "SZCS#ACCLINE=1",
        desc: "Define se a chave ligada é detectada pelo fio físico pós-chave (preciso) ou por movimento.",
        prioridade: "Recomendado",
        categoria: "Hardware",
        presets: [
          { label: "Fio Físico Pós-Chave (ACCLINE=1)", valor: "SZCS#ACCLINE=1" },
          { label: "Por Movimento / Virtual (ACCLINE=0)", valor: "SZCS#ACCLINE=0" },
        ],
      },
      {
        num: 8,
        titulo: "Fuso Horário (GMT)",
        exemplo: "GMT,W,0,0#",
        desc: "Ajusta o relógio interno do aparelho para o horário universal UTC ou Brasília.",
        prioridade: "Recomendado",
        categoria: "Configuração",
        presets: [
          { label: "Horário Universal (GMT-0)", valor: "GMT,W,0,0#" },
          { label: "Horário de Brasília (GMT-3)", valor: "GMT,W,3,0#" },
        ],
      },
      {
        num: 9,
        titulo: "Luzes do Aparelho (LEDS)",
        exemplo: "SZCS#LED_ENABLE=0",
        desc: "Apaga as luzes para o aparelho ficar 100% invisível e discreto no carro.",
        prioridade: "Opcional",
        categoria: "Hardware",
        presets: [
          { label: "Apagar Luzes (LED_ENABLE=0)", valor: "SZCS#LED_ENABLE=0" },
          { label: "Ligar Luzes (LED_ENABLE=1)", valor: "SZCS#LED_ENABLE=1" },
          { label: "Consultar Luzes Zhian (CXCS#LED_ENABLE)", valor: "CXCS#LED_ENABLE" },
          { label: "Consultar Luzes GT06 (LED#)", valor: "LED#" },
        ],
      },
      {
        num: 10,
        titulo: "Sensibilidade de Batida (SENSOR / SENALM)",
        exemplo: "SENALM,ON,0#",
        desc: "Regula o nível de impacto e ativa o alarme de batida ou choque veicular.",
        prioridade: "Opcional",
        categoria: "Hardware",
        presets: [
          { label: "Ativar Alarme Batida (SENALM,ON,0#)", valor: "SENALM,ON,0#" },
          { label: "Desligar Alarme (SENALM,OFF#)", valor: "SENALM,OFF#" },
          { label: "Consultar Alarme (SENALM#)", valor: "SENALM#" },
          { label: "Nível Sensibilidade (LEVEL#)", valor: "LEVEL#" },
          { label: "Sensibilidade G-Sensor (SENSORRANGE,3#)", valor: "SENSORRANGE,3#" },
        ],
      },
      {
        num: 11,
        titulo: "Telefone de Socorro (SOS)",
        exemplo: `SOS,A,${numeroSos ? numeroSos.replace(/\D/g, "") : "24988887777"}#`,
        desc: "Cadastra o telefone que receberá alerta imediato em caso de emergência.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          {
            label: "Cadastrar SOS",
            valor: `SOS,A,${numeroSos ? numeroSos.replace(/\D/g, "") : "24988887777"}#`,
          },
          { label: "Ver Números Salvos (SOS#)", valor: "SOS#" },
          { label: "Apagar SOS (SOS,D,1#)", valor: "SOS,D,1#" },
        ],
      },
      {
        num: 12,
        titulo: "Celular Administrador (ADMIN / CENTER)",
        exemplo: `admin#${senhaDispositivoPadrao}#${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}#`,
        desc: "Cadastra o número administrador mestre no hardware do rastreador para autorização e segurança.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          {
            label: "Padrão Canônico (admin#<senha>#<numero>#)",
            valor: `admin#${senhaDispositivoPadrao}#${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}#`,
          },
          {
            label: "Sintaxe Espaço (admin<senha> <numero>)",
            valor: `admin${senhaDispositivoPadrao} ${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}`,
          },
          {
            label: "Sintaxe Hashtag (admin<senha>#<numero>)",
            valor: `admin${senhaDispositivoPadrao}#${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}`,
          },
          {
            label: "Protocolo Concox (CENTER,A,<numero>#)",
            valor: `CENTER,A,${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}#`,
          },
          { label: "Ver Dono Atual (CENTER#)", valor: "CENTER#" },
          { label: "Ver Todos Parâmetros (PARAM#)", valor: "PARAM#" },
          { label: "Apagar Dono (CENTER,D#)", valor: "CENTER,D#" },
          {
            label: "Desativar Admin (admin#<senha>#00000000000#)",
            valor: `admin#${senhaDispositivoPadrao}#00000000000#`,
          },
        ],
      },
      {
        num: 13,
        titulo: "Bloquear Veículo (RELAY / DYD)",
        exemplo: `DYD,${senhaDispositivoPadrao}`,
        desc: "Corta o combustível do motor para impedir o funcionamento do veículo usando autenticação por senha.",
        prioridade: "Segurança",
        categoria: "Cadeado Digital",
        presets: [
          { label: "Bloquear sem Senha (RELAY,1)", valor: "RELAY,1" },
          { label: "Liberar sem Senha (RELAY,0)", valor: "RELAY,0" },
          { label: "Ver Situação (RELAY#)", valor: "RELAY#" },
          { label: "Bloquear com Senha (DYD,<senha>)", valor: `DYD,${senhaDispositivoPadrao}` },
          { label: "Liberar com Senha (HFYD,<senha>)", valor: `HFYD,${senhaDispositivoPadrao}` },
          {
            label: "Bloquear Relé com Senha (RELAY,<senha>,1)",
            valor: `RELAY,${senhaDispositivoPadrao},1`,
          },
          {
            label: "Liberar Relé com Senha (RELAY,<senha>,0)",
            valor: `RELAY,${senhaDispositivoPadrao},0`,
          },
          { label: "Corte Imediato (SOURCE=1)", valor: "SZCS#SOURCE,OFF,TYPE=1" },
          { label: "Corte Seguro <20km/h (SOURCE=0)", valor: "SZCS#SOURCE,OFF,TYPE=0" },
        ],
      },
      {
        num: 14,
        titulo: "Saúde do Aparelho (STATUS)",
        exemplo: "STATUS#",
        desc: "Verifica bateria do carro, sinal de celular, satélites de GPS e se está bloqueado.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 15,
        titulo: "Ver Configurações (PARAM)",
        exemplo: "PARAM#",
        desc: "Mostra todos os parâmetros e opções salvas na memória do aparelho.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 16,
        titulo: "Onde Está Agora (WHERE)",
        exemplo: "WHERE#",
        desc: "Traz a localização exata de satélite onde o veículo está neste momento.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 17,
        titulo: "Versão do Sistema (VERSION)",
        exemplo: "VERSION#",
        desc: "Mostra o modelo e a versão do programa interno do aparelho.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 18,
        titulo: "Ver Servidor Atual (SERVER)",
        exemplo: "SERVER#",
        desc: "Consulta para qual servidor e porta o rastreador está mandando os dados.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 19,
        titulo: "Ver Conexão do Chip (GPRSSET)",
        exemplo: "GPRSSET#",
        desc: "Consulta a operadora, o sinal e os dados de internet do chip celular.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
      },
      {
        num: 20,
        titulo: "Km Rodados e Odômetro do Aparelho (MILEAGE)",
        exemplo: "MILEAGE#",
        desc: "Consulta, define ou calibra a quilometragem total acumulada no odômetro interno da MCU do rastreador.",
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          { label: "Ver Km Rodados (MILEAGE#)", valor: "MILEAGE#" },
          { label: "Zerar Odômetro (MILEAGE=0#)", valor: "MILEAGE=0#" },
          { label: "Calibrar 50.000 km (MILEAGE=50000#)", valor: "MILEAGE=50000#" },
          { label: "Calibrar 100.000 km (MILEAGE=100000#)", valor: "MILEAGE=100000#" },
          { label: "Ativar Concox (MILEAGE,ON,0#)", valor: "MILEAGE,ON,0#" },
        ],
      },
      {
        num: 21,
        titulo: "Voltagem e Odômetro nos Pacotes (GT06IEXVOL)",
        exemplo: "SZCS#GT06IEXVOL=2",
        desc: "Mostra a voltagem real da bateria do carro (ex: 12.6V ou 24V) e quilômetros nos pacotes de telemetria.",
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          { label: "Mostrar em Volts e Odômetro (GT06IEXVOL=2)", valor: "SZCS#GT06IEXVOL=2" },
          { label: "Consultar Pacotes Estendidos (CXCS#GT06IEXVOL)", valor: "CXCS#GT06IEXVOL" },
          { label: "Padrão de Fábrica (GT06IEXVOL=0)", valor: "SZCS#GT06IEXVOL=0" },
        ],
      },
      {
        num: 22,
        titulo: "Reiniciar Aparelho (RESET)",
        exemplo: "RESET#",
        desc: "Reinicia o aparelho para renovar o sinal sem apagar nenhuma configuração.",
        prioridade: "Diagnóstico",
        categoria: "Hardware",
      },
      {
        num: 23,
        titulo: "Zerar de Fábrica (FACTORY)",
        exemplo: "FACTORY#",
        desc: "Apaga tudo e devolve o aparelho para as configurações originais de fábrica.",
        prioridade: "Diagnóstico",
        categoria: "Hardware",
      },
      {
        num: 24,
        titulo: "Economia ao Parar (SLEEP / MTK_DISSLP)",
        exemplo: "SZCS#MTK_DISSLP=0",
        desc: "Coloca o aparelho em repouso com o carro parado para poupar a bateria e a internet.",
        prioridade: "Recomendado",
        categoria: "Hardware",
        presets: [
          { label: "Dormir no Repouso (MTK_DISSLP=0)", valor: "SZCS#MTK_DISSLP=0" },
          { label: "Sempre Acordado (MTK_DISSLP=1)", valor: "SZCS#MTK_DISSLP=1" },
          { label: "Consultar Modo (CXCS#MTK_DISSLP)", valor: "CXCS#MTK_DISSLP" },
        ],
      },
      {
        num: 25,
        titulo: "Modo Carro ou Moto (SLPDISCONNECT)",
        exemplo: "SZCS#SLPDISCONNECT=0",
        desc: "Para carro fica online no repouso; para moto desliga para não descarregar a bateria.",
        prioridade: "Recomendado",
        categoria: "Conectividade",
        presets: [
          { label: "Carro Online (SLPDISCONNECT=0)", valor: "SZCS#SLPDISCONNECT=0" },
          { label: "Moto Offline (SLPDISCONNECT=1)", valor: "SZCS#SLPDISCONNECT=1" },
          { label: "Consultar Modo (CXCS#SLPDISCONNECT)", valor: "CXCS#SLPDISCONNECT" },
        ],
      },
      {
        num: 26,
        titulo: "Desligar GPS ao Parar (GPS_DISSLP)",
        exemplo: "SZCS#GPS_DISSLP=0",
        desc: "Autoriza a antena de GPS a desligar quando o carro estiver parado na garagem.",
        prioridade: "Recomendado",
        categoria: "Hardware",
        presets: [
          { label: "Desligar GPS ao Parar (GPS_DISSLP=0)", valor: "SZCS#GPS_DISSLP=0" },
          { label: "GPS Sempre Ligado (GPS_DISSLP=1)", valor: "SZCS#GPS_DISSLP=1" },
          { label: "Consultar Estado (CXCS#GPS_DISSLP)", valor: "CXCS#GPS_DISSLP" },
        ],
      },
      {
        num: 27,
        titulo: "Pontos em Curvas (ANGLE)",
        exemplo: "SZCS#ANGLE,SEND=1",
        desc: "Manda pontos extras ao fazer curvas para o traçado ficar perfeito no mapa.",
        prioridade: "Recomendado",
        categoria: "Telemetria",
        presets: [
          { label: "Ligar em Curvas (ANGLE,SEND=1)", valor: "SZCS#ANGLE,SEND=1" },
          { label: "Desligar Curvas (ANGLE,SEND=0)", valor: "SZCS#ANGLE,SEND=0" },
        ],
      },
      {
        num: 28,
        titulo: "Tempo Para Dormir (SENDS)",
        exemplo: "SENDS,1#",
        desc: "Quantos minutos esperar após desligar a chave antes de desligar o GPS.",
        prioridade: "Recomendado",
        categoria: "Hardware",
        presets: [
          { label: "1 Minuto (SENDS,1#)", valor: "SENDS,1#" },
          { label: "2 Minutos (SENDS,2#)", valor: "SENDS,2#" },
          { label: "5 Minutos (SENDS,5#)", valor: "SENDS,5#" },
          { label: "Consultar Tempo (SENDS#)", valor: "SENDS#" },
        ],
      },
      {
        num: 29,
        titulo: "Alerta Bateria Cortada (POWERALM)",
        exemplo: "POWERALM,ON,0,5,10#",
        desc: "Avisa na hora se alguém desconectar ou cortar a bateria do veículo.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "Ligar Alerta (POWERALM,ON)", valor: "POWERALM,ON,0,5,10#" },
          { label: "Desligar Alerta (POWERALM,OFF)", valor: "POWERALM,OFF#" },
          { label: "Consultar Estado (POWERALM#)", valor: "POWERALM#" },
        ],
      },
      {
        num: 30,
        titulo: "Alerta Bateria Fraca (BATALM)",
        exemplo: "BATALM,ON,0#",
        desc: "Avisa quando a bateriazinha interna do aparelho estiver perto de acabar.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "Ligar Alerta (BATALM,ON)", valor: "BATALM,ON,0#" },
          { label: "Desligar Alerta (BATALM,OFF)", valor: "BATALM,OFF#" },
          { label: "Consultar Estado (BATALM#)", valor: "BATALM#" },
        ],
      },
      {
        num: 31,
        titulo: "Alerta de Velocidade (SPEED)",
        exemplo: "SPEED,ON,80,10#",
        desc: "Avisa se o veículo passar do limite de velocidade determinado.",
        prioridade: "Opcional",
        categoria: "Telemetria",
        presets: [
          { label: "Limite 80 km/h (SPEED,ON,80)", valor: "SPEED,ON,80,10#" },
          { label: "Limite 100 km/h (SPEED,ON,100)", valor: "SPEED,ON,100,10#" },
          { label: "Limite 120 km/h (SPEED,ON,120)", valor: "SPEED,ON,120,10#" },
          { label: "Desligar Alerta (SPEED,OFF)", valor: "SPEED,OFF#" },
          { label: "Consultar Limite (SPEED#)", valor: "SPEED#" },
        ],
      },
      {
        num: 32,
        titulo: "Alerta de Guincho (MOVING)",
        exemplo: "MOVING,ON,100,0#",
        desc: "Avisa se o veículo for guinchado ou empurrado com a chave desligada (sintaxe: MOVING,Status,Raio,Modo#).",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "Padrão (100m GPRS) (MOVING,ON,100,0#)", valor: "MOVING,ON,100,0#" },
          { label: "Raio 200m (GPRS) (MOVING,ON,200,0#)", valor: "MOVING,ON,200,0#" },
          { label: "Raio 500m (GPRS) (MOVING,ON,500,0#)", valor: "MOVING,ON,500,0#" },
          { label: "Desligar Alerta (MOVING,OFF#)", valor: "MOVING,OFF#" },
          { label: "Consultar Estado (MOVING#)", valor: "MOVING#" },
        ],
      },
      {
        num: 33,
        titulo: "Alerta de Batida (SENALM)",
        exemplo: "SENALM,ON,0#",
        desc: "Avisa se baterem no carro estacionado ou tentarem arrombar o vidro.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "Ligar Alerta (SENALM,ON)", valor: "SENALM,ON,0#" },
          { label: "Desligar Alerta (SENALM,OFF)", valor: "SENALM,OFF#" },
          { label: "Consultar Estado (SENALM#)", valor: "SENALM#" },
        ],
      },
      {
        num: 34,
        titulo: "Nível do Alarme (DEFENSE)",
        exemplo: "DEFENSE,3#",
        desc: "Regula o grau de proteção do carro ao parar (do desarmado ao alarme total).",
        prioridade: "Recomendado",
        categoria: "Segurança",
        presets: [
          { label: "Defesa Máxima (DEFENSE,3)", valor: "DEFENSE,3#" },
          { label: "Cerca Ativa (DEFENSE,2)", valor: "DEFENSE,2#" },
          { label: "Modo Vigília (DEFENSE,1)", valor: "DEFENSE,1#" },
          { label: "Desarmado (DEFENSE,0)", valor: "DEFENSE,0#" },
          { label: "Consultar Nível (DEFENSE#)", valor: "DEFENSE#" },
        ],
      },
      {
        num: 35,
        titulo: "Ver Sinal de Presença (HBT)",
        exemplo: "HBT#",
        desc: "Mostra os tempos configurados para o aparelho avisar que continua online.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
        presets: [
          { label: "Consultar Sinal (HBT#)", valor: "HBT#" },
          { label: "Padrão GD Rastreamento (3m / 15m - HBT)", valor: "HBT,180,900#" },
        ],
      },
      {
        num: 36,
        titulo: "Raio-X do Aparelho (CXZT)",
        exemplo: "CXZT#",
        desc: "Relatório geral: bateria do carro em Volts, bateria interna, sinal 4G e satélites.",
        prioridade: "Recomendado",
        categoria: "Auditoria",
        presets: [{ label: "Consultar Raio-X (CXZT#)", valor: "CXZT#" }],
      },
      {
        num: 37,
        titulo: "Link do Google Maps (URL)",
        exemplo: "URL#",
        desc: "Recebe o link direto para abrir a localização exata do carro no Google Maps.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
        presets: [{ label: "Gerar Link Maps (URL#)", valor: "URL#" }],
      },
      {
        num: 38,
        titulo: "Ver Operadora do Chip (APN)",
        exemplo: "APN#",
        desc: "Mostra na hora o nome e a operadora do chip de internet cadastrado.",
        prioridade: "Diagnóstico",
        categoria: "Auditoria",
        presets: [{ label: "Ver Chip Rápido (APN#)", valor: "APN#" }],
      },
      {
        num: 39,
        titulo: "Senha do Aparelho (PASSWORD / zhencbpwd)",
        exemplo: "PASSWORD,<senha antiga>,<nova senha>#",
        desc: "Protege o rastreador contra comandos não autorizados. Todos os comandos admin, corte e liberação usam esta senha mestre salva.",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "Consultar Senha (PASSWORD#)", valor: "PASSWORD#" },
          {
            label: "Trocar Senha Voxter (PASSWORD,<senha antiga>,<nova senha>#)",
            valor: "PASSWORD,<senha antiga>,<nova senha>#",
          },
          {
            label: "Trocar Senha MCU (zhencbpwd,<senha antiga>,<nova senha>#)",
            valor: "zhencbpwd,<senha antiga>,<nova senha>#",
          },
        ],
      },
      {
        num: 40,
        titulo: "Alarme Instantâneo Ignição (ACCALM)",
        exemplo: "ACCALM,ON,2#",
        desc: "Dispara aviso imediato ao ligar ou desligar a chave sem esperar o Heartbeat (elimina atraso de desligado).",
        prioridade: "Segurança",
        categoria: "Segurança",
        presets: [
          { label: "GPRS Ativo (Modo 2 - ACCALM,ON,2#)", valor: "ACCALM,ON,2#" },
          { label: "SMS + GPRS (Modo 1 - ACCALM,ON,1#)", valor: "ACCALM,ON,1#" },
          { label: "Desligar Alarme (ACCALM,OFF#)", valor: "ACCALM,OFF#" },
          { label: "Consultar Alarme (ACCALM#)", valor: "ACCALM#" },
        ],
      },
    ];
  }, [
    modoServidor,
    servidorAlvo,
    portaTcp,
    usarIpDireto,
    ipDedicado,
    servidorDns,
    apnNome,
    apnUser,
    apnPass,
    timerMovimento,
    timerParado,
    hbtLigado,
    hbtDesligado,
    anguloIntervalo,
    anguloGrau,
    numeroSos,
    numeroCenter,
    senhaDispositivoPadrao,
    filtroModelo,
  ]);

  // Grupos Canônicos do Catálogo de Comandos J16
  const GRUPOS_COMANDOS: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "todos", label: "Todos", icon: Layers },
    { id: "Auditoria", label: "Auditoria e Diagnóstico", icon: Cpu },
    { id: "Segurança", label: "Segurança e Alarmes", icon: ShieldAlert },
    { id: "Cadeado Digital", label: "Bloqueio e Relé", icon: Lock },
    { id: "Telemetria", label: "Telemetria e Curvas", icon: Gauge },
    { id: "Hardware", label: "Hardware e Sensores", icon: Power },
    { id: "Conectividade", label: "Rede e Conexão", icon: Wifi },
  ];

  // Contagem otimizada em passada única O(N) com useMemo (DJR-LOV Perf)
  const contagemPorGrupo: Record<string, number> = useMemo(() => {
    const cont: Record<string, number> = {
      todos: catalogoComandos.length,
      Auditoria: 0,
      Segurança: 0,
      "Cadeado Digital": 0,
      Telemetria: 0,
      Hardware: 0,
      Conectividade: 0,
    };
    for (const c of catalogoComandos) {
      if (c.categoria === "Hardware" || c.categoria === "Configuração") {
        cont.Hardware++;
      } else if (cont[c.categoria] !== undefined) {
        cont[c.categoria]++;
      }
    }
    return cont;
  }, [catalogoComandos]);

  // Filtragem memoizada do catálogo de comandos (DJR-LOV Perf)
  const comandosFiltrados = useMemo(() => {
    return catalogoComandos.filter((c) => {
      // 1. Filtro por grupo selecionado
      if (grupoComandoFiltro !== "todos") {
        if (grupoComandoFiltro === "Hardware") {
          if (c.categoria !== "Hardware" && c.categoria !== "Configuração") return false;
        } else if (c.categoria !== grupoComandoFiltro) {
          return false;
        }
      }

      // 2. Filtro por comando selecionado no dropdown rápido
      if (comandoSelecionadoDropdown) {
        if (String(c.num) !== comandoSelecionadoDropdown) return false;
      }

      // 3. Filtro por pesquisa textual
      if (buscaComandoCatalogo.trim()) {
        const q = buscaComandoCatalogo.toLowerCase().trim();
        const comandoAtivo = (comandosEditados[c.num] ?? c.exemplo).toLowerCase();
        const bateCmd = comandoAtivo.includes(q);
        const bateExemplo = c.exemplo.toLowerCase().includes(q);
        const bateTitulo = c.titulo.toLowerCase().includes(q);
        const bateDesc = c.desc.toLowerCase().includes(q);
        const bateNum =
          String(c.num) === q || `comando ${c.num}`.includes(q) || `#${c.num}`.includes(q);
        const bateCategoria = c.categoria.toLowerCase().includes(q);
        const batePreset = c.presets?.some(
          (p) => p.valor.toLowerCase().includes(q) || p.label.toLowerCase().includes(q),
        );
        if (
          !bateCmd &&
          !bateExemplo &&
          !bateTitulo &&
          !bateDesc &&
          !bateNum &&
          !bateCategoria &&
          !batePreset
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    catalogoComandos,
    grupoComandoFiltro,
    comandoSelecionadoDropdown,
    buscaComandoCatalogo,
    comandosEditados,
  ]);

  // Estatísticas de status dos dispositivos pré-calculadas em passada única O(N) (DJR-LOV Perf)
  const estatisticasStatus = useMemo(() => {
    let instalados = 0;
    let aguardando = 0;
    let estoque = 0;
    let online = 0;
    for (const d of dispositivos) {
      if (d.status === "instalado") instalados++;
      else if (d.status === "aguardando_instalacao") aguardando++;
      else if (d.status === "estoque") estoque++;
      if (d.isTcpOnline) online++;
    }
    return {
      instalados,
      aguardando,
      estoque,
      online,
      total: dispositivos.length,
    };
  }, [dispositivos]);

  // Filtros dos dispositivos com useMemo
  const dispositivosFiltrados = useMemo(() => {
    return dispositivos.filter((d) => {
      if (filtroModelo === "j16") {
        const mod = (d.modelo || "").toLowerCase();
        if (!mod.includes("j16")) return false;
      }
      if (filtroModelo === "g900l") {
        const mod = (d.modelo || "").toLowerCase();
        if (!mod.includes("g900")) return false;
      }
      if (buscaDispositivo) {
        const q = buscaDispositivo.toLowerCase();
        const batePlaca = (d.placa || "").toLowerCase().includes(q);
        const bateModelo = (d.marcaModelo || "").toLowerCase().includes(q);
        const bateImei = d.imei.toLowerCase().includes(q);
        const bateCliente = (d.clienteNome || "").toLowerCase().includes(q);
        const bateTelefone = (d.clienteTelefone || "").includes(q);
        if (!batePlaca && !bateModelo && !bateImei && !bateCliente && !bateTelefone) return false;
      }
      if (filtroStatus === "online") return d.isTcpOnline;
      if (filtroStatus === "instalados") return d.status === "instalado";
      if (filtroStatus === "aguardando") return d.status === "aguardando_instalacao";
      if (filtroStatus === "estoque") return d.status === "estoque";
      return true;
    });
  }, [dispositivos, buscaDispositivo, filtroStatus, filtroModelo]);

  // Ordenação dos dispositivos por cabeçalho clicável com useMemo e tipagem estrita (DJR-LOV Org)
  const dispositivosOrdenados = useMemo(() => {
    return [...dispositivosFiltrados].sort((a, b) => {
      let valorA: string | number = "";
      let valorB: string | number = "";

      switch (campoOrdenacao) {
        case "cliente":
          valorA = (a.clienteNome || "") + " " + (a.marcaModelo || "") + " " + (a.placa || "");
          valorB = (b.clienteNome || "") + " " + (b.marcaModelo || "") + " " + (b.placa || "");
          break;
        case "modelo":
          valorA = a.modelo || "";
          valorB = b.modelo || "";
          break;
        case "imei":
          valorA = a.imei;
          valorB = b.imei;
          break;
        case "ultimaComunicacao":
          valorA = new Date(a.ultimaAtualizacao || a.ultimaComunicacao || 0).getTime();
          valorB = new Date(b.ultimaAtualizacao || b.ultimaComunicacao || 0).getTime();
          break;
        case "apn":
          valorA = a.parametrosAuditados?.apn || "";
          valorB = b.parametrosAuditados?.apn || "";
          break;
        case "dns":
          valorA = a.parametrosAuditados?.dns || "";
          valorB = b.parametrosAuditados?.dns || "";
          break;
        case "porta":
          valorA = Number(a.parametrosAuditados?.porta || 0);
          valorB = Number(b.parametrosAuditados?.porta || 0);
          break;
        case "usuario":
          valorA = a.parametrosAuditados?.usuario || "";
          valorB = b.parametrosAuditados?.usuario || "";
          break;
        case "senha":
          valorA = a.parametrosAuditados?.senha || "";
          valorB = b.parametrosAuditados?.senha || "";
          break;
        case "freq":
          valorA = a.parametrosAuditados?.freq || "";
          valorB = b.parametrosAuditados?.freq || "";
          break;
        case "hbt":
          valorA = Number(a.parametrosAuditados?.hbt || 0);
          valorB = Number(b.parametrosAuditados?.hbt || 0);
          break;
        case "carreg":
          valorA = a.parametrosAuditados?.carreg || (a.voltagem && a.voltagem > 5 ? "1" : "0");
          valorB = b.parametrosAuditados?.carreg || (b.voltagem && b.voltagem > 5 ? "1" : "0");
          break;
        case "sleep":
          valorA = a.parametrosAuditados?.sleep || "";
          valorB = b.parametrosAuditados?.sleep || "";
          break;
        case "odometro":
          valorA = Number(a.odometroKm || a.parametrosAuditados?.odometro || 0);
          valorB = Number(b.odometroKm || b.parametrosAuditados?.odometro || 0);
          break;
        case "rele":
          valorA =
            a.releStatus !== null && a.releStatus !== undefined
              ? a.releStatus
                ? 1
                : 0
              : a.bloqueado
                ? 1
                : a.parametrosAuditados?.relay === "1"
                  ? 1
                  : 0;
          valorB =
            b.releStatus !== null && b.releStatus !== undefined
              ? b.releStatus
                ? 1
                : 0
              : b.bloqueado
                ? 1
                : b.parametrosAuditados?.relay === "1"
                  ? 1
                  : 0;
          break;
      }

      if (valorA < valorB) return direcaoOrdenacao === "asc" ? -1 : 1;
      if (valorA > valorB) return direcaoOrdenacao === "asc" ? 1 : -1;
      return 0;
    });
  }, [dispositivosFiltrados, campoOrdenacao, direcaoOrdenacao]);

  // Paginação da tabela com useMemo
  const totalPaginas = Math.ceil(dispositivosOrdenados.length / itensPorPagina) || 1;
  const indexInicio = (paginaAtual - 1) * itensPorPagina;
  const dispositivosPaginados = useMemo(() => {
    return dispositivosOrdenados.slice(indexInicio, indexInicio + itensPorPagina);
  }, [dispositivosOrdenados, indexInicio, itensPorPagina]);

  const todosVisiveisSelecionados =
    dispositivosOrdenados.length > 0 &&
    dispositivosOrdenados.every((d) => selectedImeis.has(d.imei));

  const comandosBatchAtivos = obterComandosBatchAtivos();
  const totalComandosAtivos = comandosBatchAtivos.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto select-none animate-in fade-in duration-200 pb-16">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* HEADER PRINCIPAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
            <Radio className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                Rastreadores J16 (4G)
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                PRODUÇÃO ATIVA
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                DISPARO EM LOTE HABILITADO
              </span>
              {isAuditor && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  MODO AUDITOR (SOMENTE LEITURA)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Localização: <strong>Configuração &gt; Rastreadores J16 (4G)</strong> · Seleção
              múltipla e controle integral de parâmetros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          {/* Opção Canônica: Alertas de Comando em Aguardo (HBT / Spooler) */}
          <button
            type="button"
            onClick={() => {
              const proximo = !alertaAguardoAtivo;
              setAlertaAguardoAtivo(proximo);
              localStorage.setItem("hunter_j16_alerta_aguardo_ativo", String(proximo));
              toast.info(
                proximo
                  ? "Alertas de Comando em Aguardo (HBT Spooler) ATIVADOS"
                  : "Alertas de Comando em Aguardo DESATIVADOS",
              );
            }}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              alertaAguardoAtivo
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300/40 dark:border-slate-700 hover:text-slate-200"
            }`}
            title="Ativar ou desativar alertas visuais quando o comando for enviado para veículo em sono/repouso"
          >
            {alertaAguardoAtivo ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Alerta Aguardo HBT</span>
            <span
              className={`h-2 w-2 rounded-full ${alertaAguardoAtivo ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`}
            />
          </button>

          {/* Seletores Rápidos de Canais de Alerta (Padrão Central de Alertas) */}
          <div className="flex items-center gap-1 bg-[#eaf0f8] dark:bg-slate-900 p-1 rounded-2xl border border-slate-300/50 dark:border-slate-800 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                const novos = { ...canaisAlertaComando, app: !canaisAlertaComando.app };
                salvarCanaisAlertaLocal(novos);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border ${
                canaisAlertaComando.app
                  ? "bg-orange-500 text-slate-950 border-orange-400 font-black shadow-xs"
                  : "bg-white/60 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
              title="Notificação no App e Web Push ao responder comando"
            >
              <Bell className="h-3 w-3" />
              <span>App</span>
              {canaisAlertaComando.app && <Check className="h-2.5 w-2.5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const novos = { ...canaisAlertaComando, whatsapp: !canaisAlertaComando.whatsapp };
                salvarCanaisAlertaLocal(novos);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border ${
                canaisAlertaComando.whatsapp
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                  : "bg-white/60 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
              title="Alerta via WhatsApp ao responder comando"
            >
              <MessageSquare className="h-3 w-3" />
              <span>WhatsApp</span>
              {canaisAlertaComando.whatsapp && <Check className="h-2.5 w-2.5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const novos = { ...canaisAlertaComando, ligacao: !canaisAlertaComando.ligacao };
                salvarCanaisAlertaLocal(novos);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border ${
                canaisAlertaComando.ligacao
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                  : "bg-white/60 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
              title="Ligação de Alarme ao responder comando"
            >
              <PhoneCall className="h-3 w-3" />
              <span>Ligação</span>
              {canaisAlertaComando.ligacao && <Check className="h-2.5 w-2.5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => setModalConfigurarCanaisAberto(true)}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              title="Configurar destinatário e ver modelo dos alertas"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={carregarDispositivos}
            disabled={carregandoDispositivos}
            className="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] cursor-pointer"
            title="Atualizar dados dos dispositivos"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${carregandoDispositivos ? "animate-spin text-orange-500" : ""}`}
            />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Banner Informativo Exclusivo do Modo Auditor (Read-Only) */}
      {isAuditor && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Acesso de Auditoria Ativo (Somente Leitura):</span>{" "}
              Consultas de telemetria, status do hardware (STATUS#, PARAM#, RELAY#, MILEAGE#) e
              protocolos estão liberadas. Comandos de alteração de configuração e bloqueio veicular
              estão bloqueados por segurança.
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SELETOR DE ABAS PRINCIPAIS: REDE GPRS (REMOTO) VS BANCADA SERIAL USB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl w-fit">
        <button
          type="button"
          onClick={() => setAbaPrincipal("remoto")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
            abaPrincipal === "remoto"
              ? "bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950 shadow-md"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
          }`}
        >
          <Radio className="h-4 w-4" />
          <span>Dispositivos e Rede Remota (GPRS / TCP)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-200 dark:bg-slate-950/40 dark:text-slate-950">
            {dispositivos.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal("usb")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
            abaPrincipal === "usb"
              ? "bg-orange-500 text-slate-950 shadow-md"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
          }`}
        >
          <Usb className="h-4 w-4" />
          <span>Configuração USB (Bancada Técnica)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-orange-500/20 text-orange-700 dark:text-slate-950 border border-orange-500/30">
            SERIAL
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal("simulador")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
            abaPrincipal === "simulador"
              ? "bg-purple-600 text-white shadow-md"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>Bancada Virtual e Simulador de Carga</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
            CARGA GT06
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaPrincipal("comparativo")}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
            abaPrincipal === "comparativo"
              ? "bg-blue-600 text-white shadow-md"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>Comparativo de Padrões A/B</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
            TESTE A/B · 20MB
          </span>
        </button>
      </div>

      {/* ABA 1: DISPOSITIVOS E REDE REMOTA GPRS / TCP */}
      {abaPrincipal === "remoto" && (
        <>
          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* BANNER DE INFRAESTRUTURA CANÔNICA E INDICADORES BIDIRECIONAIS */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* 1. INSTALADO */}
            <TiltCard
              onClick={() =>
                setFiltroStatus((prev) => (prev === "instalados" ? "todos" : "instalados"))
              }
              spotlightColor="rgba(2, 132, 199, 0.22)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatus === "instalados"
                  ? "bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-500"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:border-sky-500/40 hover:shadow-[4px_4px_10px_#b8c6da]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Instalado
                </span>
                <Car className="h-4 w-4 text-sky-400" />
              </div>
              <div className="text-2xl font-black mt-1">{estatisticasStatus.instalados}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Em operação na frota</div>
            </TiltCard>

            {/* 2. AGENDADO */}
            <TiltCard
              onClick={() =>
                setFiltroStatus((prev) => (prev === "aguardando" ? "todos" : "aguardando"))
              }
              spotlightColor="rgba(147, 51, 234, 0.22)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatus === "aguardando"
                  ? "bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:border-purple-500/40 hover:shadow-[4px_4px_10px_#b8c6da]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Agendado
                </span>
                <Clock className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black mt-1">{estatisticasStatus.aguardando}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Instalação agendada</div>
            </TiltCard>

            {/* 3. ESTOQUE */}
            <TiltCard
              onClick={() => setFiltroStatus((prev) => (prev === "estoque" ? "todos" : "estoque"))}
              spotlightColor="rgba(217, 119, 6, 0.22)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatus === "estoque"
                  ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:border-amber-500/40 hover:shadow-[4px_4px_10px_#b8c6da]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Estoque
                </span>
                <Radio className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black mt-1">{estatisticasStatus.estoque}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Disponíveis para kit</div>
            </TiltCard>

            {/* 4. ATIVO */}
            <TiltCard
              onClick={() => setFiltroStatus((prev) => (prev === "online" ? "todos" : "online"))}
              spotlightColor="rgba(16, 185, 129, 0.22)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatus === "online"
                  ? "bg-orange-600 text-white border-orange-600 shadow-md ring-2 ring-orange-500"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:border-orange-500/40 hover:shadow-[4px_4px_10px_#b8c6da]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Ativo
                </span>
                <Wifi className="h-4 w-4 text-orange-400" />
              </div>
              <div className="text-2xl font-black mt-1">{estatisticasStatus.online}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Ping recente / Conectado</div>
            </TiltCard>

            {/* 5. TOTAL */}
            <TiltCard
              onClick={() => setFiltroStatus("todos")}
              spotlightColor="rgba(100, 116, 139, 0.20)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none col-span-2 sm:col-span-1 ${
                filtroStatus === "todos"
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-800 dark:border-slate-600 shadow-md ring-2 ring-slate-500"
                  : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 hover:border-slate-400 hover:shadow-[4px_4px_10px_#b8c6da]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Total
                </span>
                <Layers className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-2xl font-black mt-1">{estatisticasStatus.total}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Cadastrados no GD Rastreamento</div>
            </TiltCard>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* SEÇÃO 1: PARÂMETROS CANÔNICOS DO SISTEMA COM BOTÃO DE DISPARO EM LOTE */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 truncate">
                      Parâmetros Canônicos do Sistema
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 whitespace-nowrap">
                      {totalComandosAtivos} COMANDOS NO BATCH
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium block">
                    Marque os checkboxes para habilitar ou não o envio de cada comando
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                {/* BOTÕES RÁPIDOS SELECIONAR / DESMARCAR TODOS / PADRÃO DO SISTEMA / SALVAR PADRÃO */}
                <div className="flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto flex-wrap">
                  <button
                    type="button"
                    onClick={() => alternarTodosParametrosBatch(true)}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xs transition cursor-pointer text-center"
                    title="Habilitar todos os comandos para envio no lote"
                  >
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarTodosParametrosBatch(false)}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xs transition cursor-pointer text-center"
                    title="Desmarcar todos os comandos"
                  >
                    Desmarcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={aplicarPadraoDoSistema}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 hover:shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                    title="Carregar e aplicar a configuração padrão do sistema (valores e opções marcadas)"
                  >
                    <SlidersHorizontal className="h-3 w-3 shrink-0" />
                    <span>Padrão do Sistema</span>
                  </button>
                  <button
                    type="button"
                    onClick={salvarNovoPadraoSistema}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 hover:shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                    title="Salvar a configuração atual (valores e opções marcadas) como o novo padrão do sistema"
                  >
                    <Save className="h-3 w-3 shrink-0" />
                    <span>Salvar como Padrão</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopiarComandosBatchAtivos}
                    className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 hover:shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                    title="Copiar todos os comandos atualmente habilitados para implementar nos dispositivos"
                  >
                    <Copy className="h-3 w-3 shrink-0" />
                    <span>Copiar Comandos</span>
                  </button>
                </div>

                {/* BOTÃO PRINCIPAL DE DISPARAR PARÂMETROS HABILITADOS */}
                <button
                  type="button"
                  onClick={dispararTodosParametrosBatch}
                  disabled={
                    enviandoComando || selectedImeis.size === 0 || totalComandosAtivos === 0
                  }
                  className="w-full sm:w-auto justify-center px-4 sm:px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 via-orange-500 to-emerald-600 hover:from-emerald-400 hover:to-orange-500 text-slate-950 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20 active:scale-95 text-center"
                  title={
                    totalComandosAtivos === 0
                      ? "Selecione ao menos um comando para habilitar o envio"
                      : `Disparar ${totalComandosAtivos} parâmetros para ${selectedImeis.size} dispositivo(s)`
                  }
                >
                  {enviandoComando ? (
                    <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Play className="h-4 w-4 fill-slate-950 shrink-0" />
                  )}
                  <span className="text-center leading-tight">
                    Disparar {totalComandosAtivos} Parâmetro(s) (Batch) para {selectedImeis.size}{" "}
                    Dispositivo(s)
                  </span>
                </button>
              </div>
            </div>

            {/* Banner tático se os parâmetros tiverem sido carregados do Comparativo */}
            {origemParametrosComparativo && (
              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-between gap-3 text-xs font-mono shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 shrink-0">
                    <SlidersHorizontal className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <strong className="text-purple-700 dark:text-purple-300 font-black block sm:inline">
                      Parâmetros Carregados do Comparativo ({origemParametrosComparativo.nome}):
                    </strong>
                    <span className="text-slate-600 dark:text-slate-400 block sm:inline sm:ml-1 text-[11px]">
                      Os valores ativos abaixo foram atualizados para teste e envio aos
                      dispositivos. Se desejar torná-los o novo padrão permanente, clique em "Salvar
                      como Padrão".
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOrigemParametrosComparativo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                  title="Dispensar aviso"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Barra de progresso se houver batch ativo */}
            {progressoBatch?.ativo && (
              <div className="p-3.5 rounded-2xl bg-slate-950 text-white border border-orange-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-orange-400 font-bold">{progressoBatch.comandoAtual}</span>
                  <span className="text-slate-400">
                    {progressoBatch.atual} de {progressoBatch.total} comandos
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(progressoBatch.atual / progressoBatch.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* CARD CANÔNICO DE SEGURANÇA: SENHA MESTRE SALVA DO DISPOSITIVO E ADMIN */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900/40 to-emerald-500/10 border border-amber-500/30 shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30">
                    <Key className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                        Senha Mestre Salva do Dispositivo
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Injeção Dinâmica
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Usada automaticamente em todos os comandos protegidos:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        admin#&lt;senha&gt;#numero#
                      </strong>
                      , corte de motor (
                      <strong className="text-slate-700 dark:text-slate-300">DYD</strong>),
                      liberação (
                      <strong className="text-slate-700 dark:text-slate-300">HFYD</strong>),
                      consulta de relé (
                      <strong className="text-slate-700 dark:text-slate-300">RELAY#</strong>) e
                      alteração de senha (
                      <strong className="text-slate-700 dark:text-slate-300">PASSWORD</strong>).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <div className="relative flex items-center">
                    <input
                      type={mostrarSenhaPadrao ? "text" : "password"}
                      value={senhaDispositivoPadrao}
                      onChange={(e) => setSenhaDispositivoPadrao(e.target.value)}
                      placeholder="Ex: 123456"
                      className="w-32 sm:w-36 px-3 py-1.5 pr-8 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white"
                      title="Senha mestre do rastreador salva no sistema"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenhaPadrao((prev) => !prev)}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={mostrarSenhaPadrao ? "Ocultar senha" : "Ver senha"}
                    >
                      {mostrarSenhaPadrao ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSalvarSenhaDispositivoPadrao(senhaDispositivoPadrao)}
                    className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-orange-500 hover:bg-orange-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    title="Salvar esta senha no sistema (localStorage e parâmetros)"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>Salvar Senha</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSenhaAtualForm(senhaDispositivoPadrao);
                      setNovaSenhaForm("");
                      setConfirmarSenhaForm("");
                      setModalAlterarSenhaAberto(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    title="Abrir modal para alterar a senha no hardware (GPRS)"
                  >
                    <Key className="h-3.5 w-3.5" />
                    <span>Alterar Senha</span>
                  </button>
                </div>
              </div>
            </div>

            {/* GRID DE PARÂMETROS COM CHECKBOX INDIVIDUAL POR COMANDO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[
                {
                  id: "servidorDns",
                  label: "Servidor DNS / Coban",
                  valor: servidorDns,
                  setValor: setServidorDns,
                  presets: [
                    {
                      label: "IP Direto (SERVER)",
                      valor: `SERVER,${modoServidor},${ipDedicado},${portaTcp},0#`,
                    },
                    {
                      label: "Coban (adminip)",
                      valor: `adminip${(senhaDispositivoPadrao || "123456").trim()} ${ipDedicado} ${portaTcp}`,
                    },
                  ],
                },
                { id: "portaTcp", label: "Porta TCP", valor: portaTcp, setValor: setPortaTcp },
                {
                  id: "ipDedicado",
                  label: "IP Dedicado (Alternativo)",
                  valor: ipDedicado,
                  setValor: setIpDedicado,
                },
                {
                  id: "apnNome",
                  label: "APN do Chip M2M",
                  valor: apnNome,
                  setValor: setApnNome,
                  presets: [
                    {
                      label: "J16 (APN,voxter.br...)",
                      valor: `APN,${apnNome},${apnUser},${apnPass}#`,
                    },
                    {
                      label: "G900L (apn123456...)",
                      valor: `apn${(senhaDispositivoPadrao || "123456").trim()} ${apnNome} ${apnUser} ${apnPass}`,
                    },
                  ],
                },
                { id: "apnUser", label: "Usuário APN", valor: apnUser, setValor: setApnUser },
                { id: "apnPass", label: "Senha APN", valor: apnPass, setValor: setApnPass },
                {
                  id: "timerMovimento",
                  label: "Timer Movimento (s)",
                  valor: timerMovimento,
                  setValor: setTimerMovimento,
                  presets: [
                    { label: "J16 (30s)", valor: "30" },
                    {
                      label: "G900L (fix030s***n)",
                      valor: `fix030s***n${(senhaDispositivoPadrao || "123456").trim()}`,
                    },
                    { label: "Padrão Ouro (15s)", valor: "15" },
                    { label: "12s (Alta)", valor: "12" },
                  ],
                },
                {
                  id: "timerParado",
                  label: "Timer Parado (s)",
                  valor: timerParado,
                  setValor: setTimerParado,
                  presets: [
                    { label: "Padrão Voxter (3600s / 1h)", valor: "3600" },
                    { label: "1800s (30m)", valor: "1800" },
                    { label: "900s (15m)", valor: "900" },
                  ],
                },
                {
                  id: "hbtLigado",
                  label: "HBT Ligado / Move (s)",
                  valor: hbtLigado,
                  setValor: setHbtLigado,
                  presets: [
                    { label: "J16 (HBT,300,300#)", valor: "HBT,300,300#" },
                    {
                      label: "G900L (hbt123456 300)",
                      valor: `hbt${(senhaDispositivoPadrao || "123456").trim()} 300`,
                    },
                    { label: "300s (5m)", valor: "300" },
                    { label: "120s (2m)", valor: "120" },
                  ],
                },
                {
                  id: "hbtDesligado",
                  label: "HBT Parado / Stop (s)",
                  valor: hbtDesligado,
                  setValor: setHbtDesligado,
                  presets: [
                    { label: "Padrão Voxter (300s / 5m)", valor: "300" },
                    { label: "600s (10m)", valor: "600" },
                    { label: "900s (15m)", valor: "900" },
                  ],
                },
                {
                  id: "anguloIntervalo",
                  label: "Intervalo Ângulo (s) [Mín. 10s]",
                  valor: anguloIntervalo,
                  setValor: setAnguloIntervalo,
                  presets: [
                    { label: "Padrão MCU (10s)", valor: "10" },
                    { label: "15s", valor: "15" },
                    { label: "20s", valor: "20" },
                  ],
                },
                {
                  id: "anguloGrau",
                  label: "Grau de Curva (°)",
                  valor: anguloGrau,
                  setValor: setAnguloGrau,
                  presets: [
                    { label: "Padrão Ouro (20°)", valor: "20" },
                    { label: "Curva Moderada (15°)", valor: "15" },
                    { label: "Sensível (10°)", valor: "10" },
                    { label: "Amplo (30°)", valor: "30" },
                  ],
                },
                {
                  id: "numeroSos",
                  label: "Telefone SOS (Emergência)",
                  valor: numeroSos,
                  setValor: setNumeroSos,
                  placeholder: dispositivoUnicoSelecionado?.clienteTelefone
                    ? `WhatsApp de ${dispositivoUnicoSelecionado.clienteNome || "Cliente"}: ${dispositivoUnicoSelecionado.clienteTelefone}`
                    : `WhatsApp do Cliente (${clientesWhatsapp[0]?.telefone || VALORES_PADRAO_CANONICO_J16.numeroSos})`,
                  presets: [
                    ...(dispositivoUnicoSelecionado?.clienteTelefone
                      ? [
                          {
                            label: `WhatsApp do Veículo (${dispositivoUnicoSelecionado.clienteNome?.split(" ")[0] || "Cliente"}: ${dispositivoUnicoSelecionado.clienteTelefone})`,
                            valor: dispositivoUnicoSelecionado.clienteTelefone,
                          },
                        ]
                      : []),
                    ...(clientesWhatsapp.length > 0
                      ? clientesWhatsapp.map((c) => ({
                          label: `WhatsApp ${c.nome.split(" ")[0]} (${c.telefone})`,
                          valor: c.telefone,
                        }))
                      : [
                          {
                            label: `WhatsApp Cliente Titular (${VALORES_PADRAO_CANONICO_J16.numeroSos})`,
                            valor: VALORES_PADRAO_CANONICO_J16.numeroSos,
                          },
                        ]),
                    { label: "Consultar Salvos (SOS#)", valor: "SOS#" },
                    { label: "Apagar SOS (SOS,D,1#)", valor: "SOS,D,1#" },
                  ],
                },
                {
                  id: "numeroCenter",
                  label: "Telefone Administrador (admin#<senha>#numero#)",
                  valor: numeroCenter,
                  setValor: setNumeroCenter,
                  placeholder: dispositivoUnicoSelecionado?.clienteTelefone
                    ? `WhatsApp de ${dispositivoUnicoSelecionado.clienteNome || "Cliente"}: ${dispositivoUnicoSelecionado.clienteTelefone}`
                    : `WhatsApp do Cliente (${clientesWhatsapp[0]?.telefone || VALORES_PADRAO_CANONICO_J16.numeroCenter})`,
                  presets: [
                    ...(dispositivoUnicoSelecionado?.clienteTelefone
                      ? [
                          {
                            label: `WhatsApp do Veículo (${dispositivoUnicoSelecionado.clienteNome?.split(" ")[0] || "Cliente"}: ${dispositivoUnicoSelecionado.clienteTelefone})`,
                            valor: dispositivoUnicoSelecionado.clienteTelefone,
                          },
                          {
                            label: `Canônico Veículo (admin#<senha>#${dispositivoUnicoSelecionado.clienteTelefone}#)`,
                            valor: `admin#${senhaDispositivoPadrao}#${dispositivoUnicoSelecionado.clienteTelefone}#`,
                          },
                        ]
                      : []),
                    ...(clientesWhatsapp.length > 0
                      ? clientesWhatsapp.map((c) => ({
                          label: `Canônico ${c.nome.split(" ")[0]} (${c.telefone})`,
                          valor: `admin#${senhaDispositivoPadrao}#${c.telefone}#`,
                        }))
                      : [
                          {
                            label: `Canônico Cliente Titular (${VALORES_PADRAO_CANONICO_J16.numeroCenter})`,
                            valor: `admin#${senhaDispositivoPadrao}#${VALORES_PADRAO_CANONICO_J16.numeroCenter}#`,
                          },
                        ]),
                    { label: "Consultar Dono (CENTER#)", valor: "CENTER#" },
                    { label: "Ver Parâmetros (PARAM#)", valor: "PARAM#" },
                    { label: "Apagar Dono (CENTER,D#)", valor: "CENTER,D#" },
                    {
                      label: "Desativar Admin (admin#<senha>#00000000000#)",
                      valor: `admin#${senhaDispositivoPadrao}#00000000000#`,
                    },
                  ],
                },
                {
                  id: "senhaDispositivo",
                  label: "Comando Troca de Senha",
                  valor: senhaDispositivoCmd,
                  setValor: setSenhaDispositivoCmd,
                  presets: [
                    {
                      label: "Concox (PASSWORD,<senha antiga>,<nova senha>#)",
                      valor: "PASSWORD,<senha antiga>,<nova senha>#",
                    },
                    {
                      label: "MCU (zhencbpwd,<senha antiga>,<nova senha>#)",
                      valor: "zhencbpwd,<senha antiga>,<nova senha>#",
                    },
                    { label: "Consultar Senha (PASSWORD#)", valor: "PASSWORD#" },
                  ],
                },
                {
                  id: "ignicaoFisica",
                  label: "Ignição Pós-Chave Física (ACCLINE)",
                  valor: ignicaoFisicaCmd,
                  setValor: setIgnicaoFisicaCmd,
                  presets: [
                    { label: "Fio Laranja (1)", valor: "SZCS#ACCLINE=1" },
                    { label: "Virtual (0)", valor: "SZCS#ACCLINE=0" },
                    { label: "Consultar", valor: "CXCS#ACCLINE" },
                  ],
                },
                {
                  id: "anguloHabilitar",
                  label: "Detecção de Curva (ANGLE,SEND)",
                  valor: anguloHabilitarCmd,
                  setValor: setAnguloHabilitarCmd,
                  presets: [
                    { label: "Habilitar (1)", valor: "SZCS#ANGLE,SEND=1" },
                    { label: "Desabilitar (0)", valor: "SZCS#ANGLE,SEND=0" },
                    { label: "Consultar", valor: "CXCS#ANGLEVALUE" },
                  ],
                },
                {
                  id: "medicaoInternaMeter",
                  label: "Odômetro MCU (GT06METER / MILEAGE)",
                  valor: medicaoInternaMeterCmd,
                  setValor: setMedicaoInternaMeterCmd,
                  presets: [
                    { label: "MCU Ativo (1)", valor: "SZCS#GT06SEL=1#GT06METER=1" },
                    { label: "Concox (MILEAGE ON)", valor: "MILEAGE,ON,0#" },
                    { label: "Desligar (0)", valor: "SZCS#GT06METER=0" },
                    { label: "Consultar MCU", valor: "CXCS#GT06METER" },
                    { label: "Consultar Km", valor: "MILEAGE#" },
                  ],
                },
                {
                  id: "voltagemOdometroIexvol",
                  label: "Voltagem 12V e Odômetro GT06 (GT06IEXVOL)",
                  valor: voltagemOdometroIexvolCmd,
                  setValor: setVoltagemOdometroIexvolCmd,
                  presets: [
                    { label: "Voltagem 12V e Km (2)", valor: "SZCS#GT06IEXVOL=2" },
                    { label: "Apenas Voltagem (1)", valor: "SZCS#GT06IEXVOL=1" },
                    { label: "Padrão GT06 (0)", valor: "SZCS#GT06IEXVOL=0" },
                    { label: "Consultar", valor: "CXCS#GT06IEXVOL" },
                  ],
                },
                {
                  id: "sleepMtk",
                  label: "Sono CPU MTK ao Parar (MTK_DISSLP)",
                  valor: sleepMtkCmd,
                  setValor: setSleepMtkCmd,
                  presets: [
                    { label: "Sono Ativo (0)", valor: "SZCS#MTK_DISSLP=0" },
                    { label: "Sem Sono CPU (1)", valor: "SZCS#MTK_DISSLP=1" },
                    { label: "Consultar", valor: "CXCS#MTK_DISSLP" },
                  ],
                },
                {
                  id: "sleepGps",
                  label: "Repouso GPS ao Parar (GPS_DISSLP)",
                  valor: sleepGpsCmd,
                  setValor: setSleepGpsCmd,
                  presets: [
                    { label: "Repouso GPS (0)", valor: "SZCS#GPS_DISSLP=0" },
                    { label: "GPS Sempre Ligado (1)", valor: "SZCS#GPS_DISSLP=1" },
                    { label: "Consultar", valor: "CXCS#GPS_DISSLP" },
                  ],
                },
                {
                  id: "gmtUniversal",
                  label: "Timezone GMT (Fuso Horário)",
                  valor: gmtComando,
                  setValor: setGmtComando,
                  presets: [
                    { label: "J16 (GMT,W,0,0#)", valor: "GMT,W,0,0#" },
                    {
                      label: "G900L (time zone123456 0)",
                      valor: `time zone${(senhaDispositivoPadrao || "123456").trim()} 0`,
                    },
                    { label: "Brasília (-3h)", valor: "GMT,W,3,0#" },
                  ],
                },
                {
                  id: "ledsDiagnostico",
                  label: "LEDs de Status (SZCS#LED_ENABLE=0 / SZCS#LED_ENABLE=1)",
                  valor: ledsComando,
                  setValor: setLedsComando,
                  presets: [
                    { label: "Apagar LEDs (Modo Discreto)", valor: "SZCS#LED_ENABLE=0" },
                    { label: "Ligar LEDs (Indicadores Ativos)", valor: "SZCS#LED_ENABLE=1" },
                    { label: "Consultar LEDs (CXCS#LED_ENABLE)", valor: "CXCS#LED_ENABLE" },
                  ],
                },
                {
                  id: "defenseAlarme",
                  label: "Alarme de Defesa / Vigília (DEFENSE)",
                  valor: defenseCmd,
                  setValor: setDefenseCmd,
                  presets: [
                    { label: "Modo Vigília (1)", valor: "DEFENSE,1#" },
                    { label: "Cerca Ativa (2)", valor: "DEFENSE,2#" },
                    { label: "Defesa Máxima (3)", valor: "DEFENSE,3#" },
                    { label: "Desligar (0)", valor: "DEFENSE,0#" },
                    { label: "Consultar Nível", valor: "DEFENSE#" },
                  ],
                },
                {
                  id: "senalmVibracao",
                  label: "Alarme de Vibração / Choque (SENALM)",
                  valor: senalmCmd,
                  setValor: setSenalmCmd,
                  presets: [
                    { label: "GPRS Ativo (0)", valor: "SENALM,ON,0#" },
                    { label: "Desligar", valor: "SENALM,OFF#" },
                    { label: "Consultar Alarme", valor: "SENALM#" },
                  ],
                },
                {
                  id: "bateriaFraca",
                  label: "Alarme de Bateria Fraca (BATALM)",
                  valor: bateriaFracaCmd,
                  setValor: setBateriaFracaCmd,
                  presets: [
                    { label: "GPRS Ativo (0)", valor: "BATALM,ON,0#" },
                    { label: "Desligar Alarme", valor: "BATALM,OFF#" },
                    { label: "Consultar", valor: "BATALM#" },
                  ],
                },
                {
                  id: "bateriaCortada",
                  label: "Corte de Energia Externa / 12V (POWERALM)",
                  valor: bateriaCortadaCmd,
                  setValor: setBateriaCortadaCmd,
                  presets: [
                    { label: "GPRS Ativo (5s)", valor: "POWERALM,ON,0,5,10#" },
                    { label: "GPRS Direto", valor: "POWERALM,ON,0#" },
                    { label: "Desligar Alarme", valor: "POWERALM,OFF#" },
                    { label: "Consultar", valor: "POWERALM#" },
                  ],
                },
                {
                  id: "alertaIgnicaoImediata",
                  label: "Alarme Instantâneo Ignição / ACC (ACCALM)",
                  valor: alertaIgnicaoImediataCmd,
                  setValor: setAlertaIgnicaoImediataCmd,
                  presets: [
                    { label: "GPRS Ativo (Modo 2)", valor: "ACCALM,ON,2#" },
                    { label: "SMS + GPRS (Modo 1)", valor: "ACCALM,ON,1#" },
                    { label: "Desligar Alarme", valor: "ACCALM,OFF#" },
                    { label: "Consultar", valor: "ACCALM#" },
                  ],
                },
                {
                  id: "modoVeiculoSleep",
                  label: "Modo Sleep: Carro vs Moto (SLPDISCONNECT)",
                  valor: modoVeiculoSleepCmd,
                  setValor: setModoVeiculoSleepCmd,
                  presets: [
                    { label: "Modo Carro (4G Online)", valor: "SZCS#SLPDISCONNECT=0" },
                    { label: "Modo Moto (4G Offline)", valor: "SZCS#SLPDISCONNECT=1" },
                    { label: "Consultar Modo", valor: "CXCS#SLPDISCONNECT" },
                  ],
                },
                {
                  id: "economiaParada",
                  label: "Economia ao Parar (SENDS - Vigília Pós-Parada)",
                  valor: economiaParadaCmd,
                  setValor: setEconomiaParadaCmd,
                  presets: [
                    { label: "1 min (Máx Economia)", valor: "SENDS,1#" },
                    { label: "2 min", valor: "SENDS,2#" },
                    { label: "5 min", valor: "SENDS,5#" },
                    { label: "300 min (Fábrica)", valor: "SENDS,300#" },
                    { label: "Consultar Tempo", valor: "SENDS#" },
                  ],
                },
                {
                  id: "sensorGSensibilidade",
                  label: "Sensibilidade do Sensor G (LEVEL)",
                  valor: sensorGSensibilidadeCmd,
                  setValor: setSensorGSensibilidadeCmd,
                  presets: [
                    { label: "Padrão (Nível 3)", valor: "LEVEL,3#" },
                    { label: "Mais Sensível (1)", valor: "LEVEL,1#" },
                    { label: "Menos Sensível (5)", valor: "LEVEL,5#" },
                    { label: "Consultar Nível", valor: "LEVEL#" },
                  ],
                },
                {
                  id: "alertaGuincho",
                  label: "Alerta de Guincho (MOVING)",
                  valor: alertaGuinchoCmd,
                  setValor: setAlertaGuinchoCmd,
                  presets: [
                    { label: "Padrão (200m GPRS)", valor: "MOVING,ON,200,0#" },
                    { label: "Sensível (100m GPRS)", valor: "MOVING,ON,100,0#" },
                    { label: "Amplo (300m GPRS)", valor: "MOVING,ON,300,0#" },
                    { label: "Desligar Alerta", valor: "MOVING,OFF#" },
                    { label: "Consultar Estado", valor: "MOVING#" },
                  ],
                },
                {
                  id: "statusDiagnostico",
                  label: "Status e Bateria (STATUS# / status123456)",
                  valor: statusComando,
                  setValor: setStatusComando,
                  presets: [
                    { label: "J16 (STATUS#)", valor: "STATUS#" },
                    {
                      label: "G900L (status123456)",
                      valor: `status${(senhaDispositivoPadrao || "123456").trim()}`,
                    },
                  ],
                },
                {
                  id: "paramDiagnostico",
                  label: "Leitura EEPROM (PARAM# / check123456)",
                  valor: paramComando,
                  setValor: setParamComando,
                  presets: [
                    { label: "J16 (PARAM#)", valor: "PARAM#" },
                    {
                      label: "G900L (check123456)",
                      valor: `check${(senhaDispositivoPadrao || "123456").trim()}`,
                    },
                  ],
                },
                {
                  id: "relayDiagnostico",
                  label: "Auditoria Relé (RELAY#)",
                  valor: relayConsultaComando,
                  setValor: setRelayConsultaComando,
                  presets: [{ label: "RELAY# Padrão", valor: "RELAY#" }],
                },
                {
                  id: "resetFinal",
                  label: "Reinicialização Limpa (RESET# / reset123456)",
                  valor: resetFinalCmd,
                  setValor: setResetFinalCmd,
                  presets: [
                    { label: "J16 (RESET#)", valor: "RESET#" },
                    {
                      label: "G900L (reset123456)",
                      valor: `reset${(senhaDispositivoPadrao || "123456").trim()}`,
                    },
                  ],
                },
              ].map(
                (campo: {
                  id: string;
                  label: string;
                  valor: string;
                  setValor: (v: string) => void;
                  placeholder?: string;
                  presets?: { label: string; valor: string }[];
                }) => {
                  const isFieldCopied = copiadoId === campo.id;
                  const isHabilitado = parametrosHabilitadosBatch[campo.id] ?? false;
                  const isVazioObrigatorio =
                    (campo.id === "numeroSos" || campo.id === "numeroCenter") &&
                    isHabilitado &&
                    !campo.valor.trim() &&
                    !dispositivoUnicoSelecionado?.clienteTelefone;

                  const isDinamicamenteCliente =
                    (campo.id === "numeroSos" || campo.id === "numeroCenter") &&
                    isHabilitado &&
                    !campo.valor.trim() &&
                    Boolean(dispositivoUnicoSelecionado?.clienteTelefone);

                  return (
                    <div
                      key={campo.id}
                      className={`p-2.5 rounded-2xl border transition-all ${
                        isHabilitado
                          ? "bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800"
                          : "bg-slate-100/40 dark:bg-slate-950/40 border-slate-200/50 dark:border-slate-800/40 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                          <input
                            type="checkbox"
                            checked={isHabilitado}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (campo.id === "ipDedicado" && checked) {
                                setUsarIpDireto(true);
                                setParametrosHabilitadosBatch((prev) => ({
                                  ...prev,
                                  ipDedicado: true,
                                  servidorDns: false,
                                }));
                                return;
                              }
                              if (campo.id === "servidorDns" && checked) {
                                setUsarIpDireto(false);
                                setParametrosHabilitadosBatch((prev) => ({
                                  ...prev,
                                  servidorDns: true,
                                  ipDedicado: false,
                                }));
                                return;
                              }
                              setParametrosHabilitadosBatch((prev) => ({
                                ...prev,
                                [campo.id]: checked,
                              }));
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-700 text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />
                          <span className="truncate">{campo.label}</span>
                        </label>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider shrink-0 ${
                            !isHabilitado
                              ? "bg-slate-200 dark:bg-slate-800 text-slate-400"
                              : isVazioObrigatorio
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                : isDinamicamenteCliente
                                  ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                  : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                          }`}
                        >
                          {!isHabilitado
                            ? "Pular"
                            : isVazioObrigatorio
                              ? "WhatsApp do Cliente"
                              : isDinamicamenteCliente
                                ? "WhatsApp do Cliente"
                                : "Enviar"}
                        </span>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={campo.valor}
                          placeholder={campo.placeholder}
                          disabled={!isHabilitado}
                          onChange={(e) => campo.setValor(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-400 placeholder:italic"
                        />
                        <button
                          type="button"
                          onClick={() => copiarTexto(campo.valor, campo.label, campo.id)}
                          className="absolute right-1.5 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer active:scale-95"
                          title={`Copiar ${campo.label}`}
                        >
                          {isFieldCopied ? (
                            <Check className="h-3.5 w-3.5 text-orange-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {campo.presets && campo.presets.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {campo.presets.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              disabled={!isHabilitado}
                              onClick={() => campo.setValor(preset.valor)}
                              className={`text-[9px] font-semibold px-2 py-0.5 rounded-md transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                campo.valor === preset.valor
                                  ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                                  : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>

            {/* SUB-BARRA: ATALHOS RÁPIDOS E ORIENTAÇÃO */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                <span>
                  Todos os {totalComandosAtivos} parâmetros selecionados acima possuem inputs de
                  texto 100% editáveis e atalhos rápidos do manual Voxter v1.1.
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setParametrosHabilitadosBatch((prev) => ({
                      ...prev,
                      paramDiagnostico: true,
                      statusDiagnostico: true,
                      relayDiagnostico: true,
                    }));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-orange-500 hover:text-white dark:hover:bg-orange-600 transition cursor-pointer"
                >
                  Habilitar Todas Consultas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParametrosHabilitadosBatch((prev) => ({
                      ...prev,
                      paramDiagnostico: false,
                      statusDiagnostico: false,
                      relayDiagnostico: false,
                    }));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Pular Consultas
                </button>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* SEÇÃO 2: TABELA COMPLETA DE EQUIPAMENTOS COM PARÂMETROS DO SISTEMA */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
            {/* Barra superior de controles da tabela */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <select
                    value={itensPorPagina}
                    onChange={(e) => {
                      setItensPorPagina(Number(e.target.value));
                      setPaginaAtual(1);
                    }}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-orange-500 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    resultados por página
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("tabela")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      modoVisualizacao === "tabela"
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    Tabela Detalhada
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("cards")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      modoVisualizacao === "cards"
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    Visão Cards
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                {/* Seletor de Modelo de Hardware (J16 vs G900L) */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroModelo("todos");
                      setPaginaAtual(1);
                    }}
                    className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                      filtroModelo === "todos"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroModelo("j16");
                      setPaginaAtual(1);
                    }}
                    className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                      filtroModelo === "j16"
                        ? "bg-orange-500 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                    title="Filtrar estritamente rastreadores modelo J16 4G"
                  >
                    Somente J16
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroModelo("g900l");
                      setPaginaAtual(1);
                    }}
                    className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                      filtroModelo === "g900l"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                    title="Filtrar rastreadores modelo G900L"
                  >
                    Somente G900L
                  </button>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar placa, IMEI, cliente..."
                    value={buscaDispositivo}
                    onChange={(e) => {
                      setBuscaDispositivo(e.target.value);
                      setPaginaAtual(1);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>

                {/* Botão Selecionar Todos */}
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 border flex items-center gap-1.5 shrink-0 ${
                    todosVisiveisSelecionados
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {todosVisiveisSelecionados ? (
                    <>
                      <Square className="h-3.5 w-3.5" />
                      <span>DESMARCAR TODOS</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 text-orange-500" />
                      <span>SELECIONAR TODOS</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Barra de Status de Selecionados e Legenda */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {selectedImeis.size} de {dispositivos.length} dispositivo(s) selecionado(s) para
                  disparo de comando
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                  <Zap className="h-2.5 w-2.5" />
                  CARREG: 1 = 12V Conectado / 0 = Cabo Cortado
                </span>
                {selectedImeis.size > 0 && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-bold hidden md:inline">
                    • Último comando gravado prevalece
                  </span>
                )}
              </div>
            </div>

            {/* TABELA DETALHADA NO ESTILO EXATO DA IMAGEM 2 */}
            {carregandoDispositivos ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw className="h-6 w-6 text-orange-500 animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Sincronizando estado dos rastreadores...</p>
              </div>
            ) : dispositivosFiltrados.length === 0 ? (
              <div className="py-12 text-center space-y-2 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto" />
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Nenhum rastreador encontrado com os filtros atuais.
                </p>
              </div>
            ) : modoVisualizacao === "tabela" ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="p-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="cursor-pointer text-slate-400 hover:text-orange-500"
                        >
                          {todosVisiveisSelecionados ? (
                            <CheckSquare className="h-4 w-4 text-orange-500" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("cliente")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Cliente</span>
                          {campoOrdenacao === "cliente" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("modelo")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Modelo</span>
                          {campoOrdenacao === "modelo" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("imei")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>IMEI</span>
                          {campoOrdenacao === "imei" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("ultimaComunicacao")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Últ. Comunic.</span>
                          {campoOrdenacao === "ultimaComunicacao" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("apn")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>APN</span>
                          {campoOrdenacao === "apn" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("dns")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>DNS</span>
                          {campoOrdenacao === "dns" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("porta")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Porta</span>
                          {campoOrdenacao === "porta" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("usuario")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Usuário</span>
                          {campoOrdenacao === "usuario" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("senha")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Senha</span>
                          {campoOrdenacao === "senha" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("freq")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>FREQ</span>
                          {campoOrdenacao === "freq" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("hbt")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>HBT</span>
                          {campoOrdenacao === "hbt" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("carreg")}
                        title="Status de Alimentação Externa / Carregador do Veículo (1 = Conectado aos 12V/24V e carregando, 0 = Bateria cortada / operando apenas por backup interno)"
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>CARREG (12V)</span>
                          {campoOrdenacao === "carreg" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("sleep")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>SLEEP</span>
                          {campoOrdenacao === "sleep" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("odometro")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <Gauge className="h-3 w-3 text-orange-500" />
                          <span>ODÔMETRO (KM)</span>
                          {campoOrdenacao === "odometro" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => alternarOrdenacao("rele")}
                        className="p-3 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <Lock className="h-3 w-3 text-amber-500" />
                          <span>RELÉ (STATUS)</span>
                          {campoOrdenacao === "rele" ? (
                            direcaoOrdenacao === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-orange-500" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-orange-500" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </th>
                      <th className="p-3 text-right whitespace-nowrap text-slate-500 dark:text-slate-400">
                        <span>AÇÕES RÁPIDAS (1-CLIQUE)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {dispositivosPaginados.map((disp) => {
                      const isChecked = selectedImeis.has(disp.imei);
                      const ultDataFmt = disp.ultimaAtualizacao
                        ? new Date(disp.ultimaAtualizacao).toLocaleString("pt-BR")
                        : disp.ultimaComunicacao
                          ? new Date(disp.ultimaComunicacao).toLocaleString("pt-BR")
                          : "Sem registro";

                      return (
                        <tr
                          key={disp.id}
                          onClick={() => toggleSelectImei(disp.imei)}
                          className={`transition cursor-pointer ${
                            isChecked
                              ? "bg-orange-50/50 dark:bg-orange-950/20 font-medium"
                              : "hover:bg-slate-50 dark:hover:bg-slate-950/40"
                          }`}
                        >
                          <td
                            className="p-3 text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectImei(disp.imei);
                            }}
                          >
                            {isChecked ? (
                              <CheckSquare className="h-4 w-4 text-orange-500 mx-auto" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                            )}
                          </td>

                          {/* Cliente / Veículo e Status Canônico */}
                          <td className="p-3">
                            {disp.status === "instalado" ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0">
                                    INSTALADO
                                  </span>
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                                    {disp.marcaModelo || "Veículo"} - {disp.placa || "Placa"}
                                  </span>
                                </div>
                                {disp.clienteNome && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium pl-0.5 flex items-center gap-1">
                                    <span>👤 {disp.clienteNome}</span>
                                    {disp.clienteTelefone && (
                                      <span className="text-orange-600 dark:text-orange-400 font-mono text-[9px]">
                                        ({disp.clienteTelefone})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : disp.status === "aguardando_instalacao" ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30 shrink-0">
                                    AGENDADO
                                  </span>
                                  <span className="font-semibold text-purple-700 dark:text-purple-300 truncate max-w-[200px]">
                                    {disp.placa
                                      ? `${disp.marcaModelo || "Veículo"} (${disp.placa})`
                                      : "Kit Agendado"}
                                  </span>
                                </div>
                                {disp.clienteNome && (
                                  <div className="text-[10px] text-purple-600/80 dark:text-purple-300/80 font-medium pl-0.5 flex items-center gap-1">
                                    <span>👤 {disp.clienteNome}</span>
                                    {disp.clienteTelefone && (
                                      <span className="font-mono text-[9px]">
                                        ({disp.clienteTelefone})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                  ESTOQUE
                                </span>
                                <span className="text-xs truncate">
                                  Avulso ({disp.imei.slice(-4)})
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Modelo */}
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                            {disp.modelo || "RASTREADOR J16"}
                          </td>

                          {/* IMEI */}
                          <td className="p-3 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <span>{disp.imei}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copiarTexto(disp.imei, "IMEI", `tbl-imei-${disp.imei}`);
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                title="Copiar IMEI"
                              >
                                {copiadoId === `tbl-imei-${disp.imei}` ? (
                                  <Check className="h-3 w-3 text-orange-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Última Comunicação */}
                          <td className="p-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  disp.isTcpOnline ? "bg-orange-500 animate-pulse" : "bg-slate-400"
                                }`}
                              />
                              <span>{ultDataFmt}</span>
                            </div>
                          </td>

                          {/* APN (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {disp.parametrosAuditados?.apn ? (
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {disp.parametrosAuditados.apn}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* DNS (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-orange-600 dark:text-orange-400 font-medium truncate max-w-[140px]">
                            {disp.parametrosAuditados?.dns ? (
                              <span title={disp.parametrosAuditados.dns}>
                                {disp.parametrosAuditados.dns}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* Porta (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {disp.parametrosAuditados?.porta || (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* Usuário APN (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {disp.parametrosAuditados?.usuario || (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* Senha APN (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {disp.parametrosAuditados?.senha || (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* FREQ (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                            {disp.parametrosAuditados?.freq ? (
                              <span>{disp.parametrosAuditados.freq}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px] font-normal">
                                —
                              </span>
                            )}
                          </td>

                          {/* HBT (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {disp.parametrosAuditados?.hbt || (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* CARREG (Real Telemetria / Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-center whitespace-nowrap">
                            {disp.status === "estoque" || !disp.ultimaComunicacao ? (
                              <span
                                title="Rastreador em estoque / sem veículo ou sem comunicação física"
                                className="text-slate-400 dark:text-slate-600 text-[10px] font-normal"
                              >
                                —
                              </span>
                            ) : disp.parametrosAuditados?.carreg ? (
                              <span
                                title={
                                  disp.parametrosAuditados.carreg === "1"
                                    ? "Alimentação externa 12V/24V ativa (Carregando bateria interna)"
                                    : "Alimentação externa desconectada / Cabo cortado (Operando na bateria interna)"
                                }
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                  disp.parametrosAuditados.carreg === "1"
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                <Zap className="h-2.5 w-2.5" />
                                {disp.parametrosAuditados.carreg === "1"
                                  ? "1 (12V ON)"
                                  : "0 (CORTE)"}
                              </span>
                            ) : disp.voltagem !== null &&
                              disp.voltagem !== undefined &&
                              disp.voltagem > 5 ? (
                              <span
                                title="Alimentação externa ativa via voltagem de telemetria (> 5V)"
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"
                              >
                                <Zap className="h-2.5 w-2.5" />1 (12V ON)
                              </span>
                            ) : disp.voltagem !== null &&
                              disp.voltagem !== undefined &&
                              disp.voltagem <= 5 ? (
                              <span
                                title="Alimentação externa cortada / sem alimentação externa (<= 5V)"
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 inline-flex items-center gap-1"
                              >
                                <Zap className="h-2.5 w-2.5" />0 (CORTE)
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px] font-normal">
                                —
                              </span>
                            )}
                          </td>

                          {/* SLEEP (Real Auditado no Hardware) */}
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {disp.parametrosAuditados?.sleep || (
                              <span className="text-slate-400 dark:text-slate-600 text-[10px]">
                                —
                              </span>
                            )}
                          </td>

                          {/* ODÔMETRO (KM) - MCU Interno e WGS-84 */}
                          <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Gauge className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                              <div>
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                  {disp.odometroKm !== null && disp.odometroKm !== undefined
                                    ? `${Number(disp.odometroKm).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
                                    : disp.parametrosAuditados?.odometro
                                      ? `${Number(disp.parametrosAuditados.odometro).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
                                      : "—"}
                                </div>
                                <div className="text-[9px] text-slate-400 flex items-center gap-1">
                                  <span>MCU:</span>
                                  <span
                                    className={
                                      disp.parametrosAuditados?.meter === "1"
                                        ? "text-orange-500 font-semibold"
                                        : "text-amber-500"
                                    }
                                  >
                                    {disp.parametrosAuditados?.meter === "1" ? "ATIVO" : "STANDBY"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* RELÉ (STATUS) - Bloqueio Remoto */}
                          <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                            {disp.releStatus ||
                            disp.bloqueado ||
                            disp.parametrosAuditados?.relay === "1" ? (
                              <span
                                title="Relé de Bloqueio Acionado / Combustível Cortado"
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 inline-flex items-center gap-1"
                              >
                                <Lock className="h-2.5 w-2.5" /> BLOQUEADO
                              </span>
                            ) : (
                              <span
                                title="Relé Desarmado / Veículo Liberado e Pronto para Partida"
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 inline-flex items-center gap-1"
                              >
                                <Unlock className="h-2.5 w-2.5" /> NORMAL
                              </span>
                            )}
                          </td>

                          {/* AÇÕES RÁPIDAS (1-CLIQUE) */}
                          <td
                            className="p-3 whitespace-nowrap text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              {/* STATUS# */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(disp.imei, "STATUS#", "Consulta STATUS#")
                                }
                                title="STATUS#: Consulta passiva de bateria, GSM e satélites"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                              >
                                STATUS
                              </button>

                              {/* PARAM# */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(disp.imei, "PARAM#", "Consulta PARAM#")
                                }
                                title="PARAM#: Leitura dos parâmetros EEPROM gravados na flash"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                              >
                                PARAM
                              </button>

                              {/* RELAY# */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(disp.imei, "RELAY#", "Consulta RELAY#")
                                }
                                title="RELAY#: Consulta estado elétrico do relé"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                              >
                                RELÉ?
                              </button>

                              {/* METER (Ativar medição interna) */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(
                                    disp.imei,
                                    "SZCS#GT06SEL=1#GT06METER=1",
                                    "Ativar Odômetro MCU",
                                  )
                                }
                                title="SZCS#GT06SEL=1#GT06METER=1: Ativa cálculo interno de odômetro MCU"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition cursor-pointer active:scale-95"
                              >
                                METER
                              </button>

                              {/* MILEAGE# (Consultar Odômetro) */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(disp.imei, "MILEAGE#", "Consulta MILEAGE#")
                                }
                                title="MILEAGE#: Consulta quilometragem acumulada no chip J16"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition cursor-pointer active:scale-95"
                              >
                                KM?
                              </button>

                              {/* BLOQUEIO / DESBLOQUEIO */}
                              {disp.releStatus ||
                              disp.bloqueado ||
                              disp.parametrosAuditados?.relay === "1" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispararAcaoRapida(
                                      disp.imei,
                                      "RELAY,0",
                                      "Desbloquear Veículo",
                                      disp.veiculoId,
                                    )
                                  }
                                  title="RELAY,0: Desbloquear veículo / Restaurar combustível"
                                  className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500 hover:bg-orange-600 text-slate-950 transition cursor-pointer active:scale-95 flex items-center gap-1 shadow-xs"
                                >
                                  <Unlock className="h-2.5 w-2.5" /> LIBERAR
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    dispararAcaoRapida(
                                      disp.imei,
                                      "RELAY,1",
                                      "Bloquear Veículo",
                                      disp.veiculoId,
                                    )
                                  }
                                  title="RELAY,1: Cortar combustível / Bloquear veículo"
                                  className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-rose-500 hover:bg-rose-600 text-white transition cursor-pointer active:scale-95 flex items-center gap-1 shadow-xs"
                                >
                                  <Lock className="h-2.5 w-2.5" /> CORTAR
                                </button>
                              )}

                              {/* RESET# */}
                              <button
                                type="button"
                                onClick={() =>
                                  dispararAcaoRapida(disp.imei, "RESET#", "Reiniciar Hardware")
                                }
                                title="RESET#: Reiniciar modem/microcontrolador J16 à distância"
                                className="p-1 rounded-md text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer active:scale-95"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>

                              {/* TODAS AS FUNÇÕES (MODAL) */}
                              <button
                                type="button"
                                onClick={() => setDispositivoModalComandos(disp)}
                                title="Abrir catálogo com todas as 28 funções deste rastreador"
                                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition cursor-pointer active:scale-95 flex items-center gap-1"
                              >
                                <SlidersHorizontal className="h-2.5 w-2.5" />
                                <span>MAIS</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* MODO CARDS ALTERNATIVO */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dispositivosPaginados.map((disp) => {
                  const isChecked = selectedImeis.has(disp.imei);
                  const spotlight =
                    disp.status === "instalado"
                      ? "rgba(2, 132, 199, 0.16)"
                      : disp.status === "aguardando_instalacao"
                        ? "rgba(147, 51, 234, 0.16)"
                        : "rgba(217, 119, 6, 0.16)";
                  return (
                    <TiltCard
                      key={disp.id}
                      onClick={() => toggleSelectImei(disp.imei)}
                      spotlightColor={spotlight}
                      className={`p-4 rounded-2xl border transition cursor-pointer relative space-y-3 ${
                        isChecked
                          ? "bg-orange-50/50 dark:bg-orange-950/20 border-orange-500 ring-2 ring-orange-500/20"
                          : "bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {disp.status === "instalado" ? (
                              <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-xs font-mono font-black">
                                {disp.placa || "INSTALADO"}
                              </span>
                            ) : disp.status === "aguardando_instalacao" ? (
                              <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white text-xs font-mono font-bold">
                                AGENDADO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
                                ESTOQUE
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {disp.marcaModelo ||
                                (disp.status === "aguardando_instalacao"
                                  ? "Kit Agendado"
                                  : "J16 4G")}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-1">
                            IMEI: <strong>{disp.imei}</strong>
                          </div>
                        </div>
                        <div>
                          {isChecked ? (
                            <CheckSquare className="h-5 w-5 text-orange-500" />
                          ) : (
                            <Square className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold">SOCKET TCP</span>
                          <span
                            className={`font-bold ${disp.isTcpOnline ? "text-orange-500" : "text-slate-400"}`}
                          >
                            {disp.isTcpOnline ? "ONLINE" : "STANDBY"}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold">IGNIÇÃO</span>
                          <span
                            className={`font-bold ${disp.ignicaoStatus ? "text-orange-500" : "text-slate-400"}`}
                          >
                            {disp.ignicaoStatus ? "LIGADA" : "DESLIGADA"}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold">BATERIA</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {disp.bateriaVeiculoV
                              ? `${disp.bateriaVeiculoV.toFixed(1)}V`
                              : disp.voltagem
                                ? `${disp.voltagem.toFixed(1)}V`
                                : "—"}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold flex items-center gap-1">
                            <Zap className="h-2.5 w-2.5 text-amber-500" /> CARREG
                          </span>
                          <span
                            className={`font-bold ${
                              disp.status === "estoque" || !disp.ultimaComunicacao
                                ? "text-slate-400"
                                : disp.parametrosAuditados?.carreg === "1" ||
                                    (disp.voltagem !== null &&
                                      disp.voltagem !== undefined &&
                                      disp.voltagem > 5)
                                  ? "text-orange-500"
                                  : "text-rose-500"
                            }`}
                          >
                            {disp.status === "estoque" || !disp.ultimaComunicacao
                              ? "—"
                              : disp.parametrosAuditados?.carreg === "1" ||
                                  (disp.voltagem !== null &&
                                    disp.voltagem !== undefined &&
                                    disp.voltagem > 5)
                                ? "1 (12V ON)"
                                : "0 (CORTE)"}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold">FREQ</span>
                          <span className="font-bold text-sky-500">
                            {disp.parametrosAuditados?.freq || "—"}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold flex items-center gap-1">
                            <Gauge className="h-2.5 w-2.5 text-orange-500" /> ODÔMETRO
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {disp.odometroKm !== null && disp.odometroKm !== undefined
                              ? `${Number(disp.odometroKm).toFixed(1)} km`
                              : disp.parametrosAuditados?.odometro
                                ? `${Number(disp.parametrosAuditados.odometro).toFixed(1)} km`
                                : "—"}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400 block font-bold flex items-center gap-1">
                            <Lock className="h-2.5 w-2.5 text-amber-500" /> RELÉ
                          </span>
                          <span
                            className={`font-bold ${
                              disp.releStatus ||
                              disp.bloqueado ||
                              disp.parametrosAuditados?.relay === "1"
                                ? "text-rose-500"
                                : "text-orange-500"
                            }`}
                          >
                            {disp.releStatus ||
                            disp.bloqueado ||
                            disp.parametrosAuditados?.relay === "1"
                              ? "CORTADO"
                              : "NORMAL"}
                          </span>
                        </div>
                      </div>

                      {/* Ações Rápidas de 1-Clique no Card */}
                      <div
                        className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispararAcaoRapida(disp.imei, "STATUS#", "Consulta STATUS#")
                          }
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                        >
                          STATUS#
                        </button>
                        <button
                          type="button"
                          onClick={() => dispararAcaoRapida(disp.imei, "PARAM#", "Consulta PARAM#")}
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                        >
                          PARAM#
                        </button>
                        <button
                          type="button"
                          onClick={() => dispararAcaoRapida(disp.imei, "RELAY#", "Consulta RELAY#")}
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer active:scale-95"
                        >
                          RELAY#
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispararAcaoRapida(
                              disp.imei,
                              "SZCS#GT06SEL=1#GT06METER=1",
                              "Ativar Odômetro MCU",
                            )
                          }
                          title="SZCS#GT06SEL=1#GT06METER=1: Ativa cálculo interno de odômetro MCU"
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition cursor-pointer active:scale-95"
                        >
                          METER
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispararAcaoRapida(disp.imei, "MILEAGE#", "Consulta MILEAGE#")
                          }
                          title="MILEAGE#: Consulta quilometragem acumulada no chip J16"
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition cursor-pointer active:scale-95"
                        >
                          KM?
                        </button>
                        {disp.releStatus ||
                        disp.bloqueado ||
                        disp.parametrosAuditados?.relay === "1" ? (
                          <button
                            type="button"
                            onClick={() =>
                              dispararAcaoRapida(
                                disp.imei,
                                "RELAY,0",
                                "Desbloquear Veículo",
                                disp.veiculoId,
                              )
                            }
                            className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500 hover:bg-orange-600 text-slate-950 transition cursor-pointer active:scale-95 flex items-center gap-1"
                          >
                            <Unlock className="h-2.5 w-2.5" /> LIBERAR
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              dispararAcaoRapida(
                                disp.imei,
                                "RELAY,1",
                                "Bloquear Veículo",
                                disp.veiculoId,
                              )
                            }
                            className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-rose-500 hover:bg-rose-600 text-white transition cursor-pointer active:scale-95 flex items-center gap-1"
                          >
                            <Lock className="h-2.5 w-2.5" /> CORTAR
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            dispararAcaoRapida(disp.imei, "RESET#", "Reiniciar Hardware")
                          }
                          title="Reiniciar rastreador"
                          className="p-1 rounded-md text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispositivoModalComandos(disp)}
                          title="Abrir catálogo com todas as 28 funções deste rastreador"
                          className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 transition cursor-pointer active:scale-95 ml-auto flex items-center gap-1"
                        >
                          <SlidersHorizontal className="h-2.5 w-2.5" />
                          <span>MAIS</span>
                        </button>
                      </div>
                    </TiltCard>
                  );
                })}
              </div>
            )}

            {/* Paginação inferior */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500">
              <span>
                Exibindo {indexInicio + 1} a{" "}
                {Math.min(indexInicio + itensPorPagina, dispositivosFiltrados.length)} de{" "}
                {dispositivosFiltrados.length} registros
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <span className="px-2 font-bold text-slate-800 dark:text-slate-200">
                  {paginaAtual} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            </div>

            {/* CONSOLE E MONITOR TCP EM TEMPO REAL (ABAIXO DA LISTA DE DISPOSITIVOS) */}
            <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 p-3.5 space-y-2 shadow-inner mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
                    <Terminal className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2">
                      <span>Console e Monitor TCP em Tempo Real</span>
                      <span className="text-[10px] font-normal text-orange-400 bg-orange-500/10 px-1.5 py-0.2 rounded border border-orange-500/20 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                        Gateway de Telemetria • Ativo
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                    {logsTerminal.length} evento(s)
                  </span>
                  <button
                    type="button"
                    onClick={copiarTextoConsole}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-orange-400 hover:text-orange-300 bg-slate-900 hover:bg-slate-800 transition cursor-pointer active:scale-95 border border-slate-800 flex items-center gap-1.5"
                    title="Copiar todo o histórico do console para a área de transferência"
                  >
                    {consoleCopiado ? (
                      <>
                        <Check className="h-3 w-3 text-orange-400" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copiar Console</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      limparHistoricoLogsConsole();
                      setLogsTerminal([
                        {
                          id: `${Date.now()}`,
                          hora: formatarHoraBrasil(new Date(), true),
                          tipo: "info",
                          texto: "Console limpo pelo Administrador.",
                        },
                      ]);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 transition cursor-pointer active:scale-95 border border-slate-800"
                  >
                    Limpar Console
                  </button>
                </div>
              </div>

              {/* Caixa de Logs do Console (Scroll Interno Isolado - Amplo) */}
              <div
                ref={consoleContainerRef}
                className="h-64 sm:h-80 overflow-y-auto font-mono text-[11px] space-y-1 select-text bg-slate-900/60 p-3 rounded-xl border border-slate-800/80"
              >
                {logsTerminal.map((log) => {
                  let cor = "text-slate-300";
                  if (log.tipo === "envio") cor = "text-sky-400 font-bold";
                  if (log.tipo === "status") cor = "text-orange-400";
                  if (log.tipo === "resposta") cor = "text-amber-300 font-black";
                  if (log.tipo === "erro") cor = "text-rose-400 font-bold";
                  if (log.tipo === "info") cor = "text-slate-400";

                  return (
                    <div key={log.id} className="leading-relaxed flex items-start gap-2">
                      <span className="text-slate-600 shrink-0">[{log.hora}]</span>
                      <span className={cor}>{log.texto}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* SEÇÃO 3: CATÁLOGO COMPACTO DE COMANDOS (BOTÕES RÁPIDOS + CONFIGURAÇÃO) */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {filtroModelo === "g900l"
                      ? "Catálogo de Comandos do Hardware G900L (Coban)"
                      : "Catálogo de Comandos do Hardware J16"}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                    {comandosFiltrados.length} de {catalogoComandos.length}
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Disparará para:{" "}
                <strong className="text-orange-600 dark:text-orange-400 font-mono font-bold">
                  {selectedImeis.size} aparelho(s) selecionado(s)
                </strong>
              </span>
            </div>

            {/* Barra de Pesquisa Textual, Dropdown de Seleção Rápida e Filtro por Grupo */}
            <div className="bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
              {/* Linha 1: Input de Pesquisa Textual + Botão Disparar + Dropdown Rápido + Botão Limpar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                {/* Input de Busca Textual e Envio Direto (Largura Reduzida de 7 para 5) */}
                <div className="md:col-span-5 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={buscaComandoCatalogo}
                    onChange={(e) => setBuscaComandoCatalogo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleDispararComandoDaBusca();
                      }
                    }}
                    placeholder="Pesquisar ou digitar comando direto (ex: PARAM#, CXZT#)..."
                    className="w-full pl-9 pr-9 py-2 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 font-mono shadow-2xs"
                    title="Digite um comando e pressione Enter ou clique no botão Disparar"
                  />
                  {buscaComandoCatalogo && (
                    <button
                      type="button"
                      onClick={() => setBuscaComandoCatalogo("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Limpar pesquisa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Botão de Disparar Comando da Barra de Pesquisa */}
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleDispararComandoDaBusca}
                    disabled={
                      !buscaComandoCatalogo.trim() || selectedImeis.size === 0 || enviandoComando
                    }
                    className="w-full py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-orange-500 hover:from-emerald-400 hover:to-orange-400 text-slate-950 transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-center"
                    title={
                      !buscaComandoCatalogo.trim()
                        ? "Digite um comando para disparar"
                        : selectedImeis.size === 0
                          ? "Selecione ao menos 1 aparelho na listagem"
                          : `Disparar "${buscaComandoCatalogo.trim()}" para ${selectedImeis.size} aparelho(s)`
                    }
                  >
                    {enviandoComando ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <Send className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">Disparar</span>
                  </button>
                </div>

                {/* Dropdown Rápido de Seleção Direta de Comandos */}
                <div className="md:col-span-4">
                  <select
                    value={comandoSelecionadoDropdown}
                    onChange={(e) => setComandoSelecionadoDropdown(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-orange-500 text-slate-800 dark:text-slate-200 font-medium shadow-2xs cursor-pointer truncate"
                  >
                    <option value="">
                      ⚡ Selecionar comando da lista ({catalogoComandos.length})...
                    </option>
                    {catalogoComandos.map((c) => (
                      <option key={c.num} value={String(c.num)}>
                        #{c.num} - {c.titulo} ({comandosEditados[c.num] ?? c.exemplo})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botão Limpar Filtros quando algum estiver ativo */}
                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setBuscaComandoCatalogo("");
                      setComandoSelecionadoDropdown("");
                      setGrupoComandoFiltro("todos");
                    }}
                    disabled={
                      !buscaComandoCatalogo &&
                      !comandoSelecionadoDropdown &&
                      grupoComandoFiltro === "todos"
                    }
                    className="w-full py-2 px-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-amber-500/50 hover:text-amber-500 cursor-pointer shadow-2xs"
                    title={`Redefinir todos os filtros e exibir todos os ${catalogoComandos.length} comandos`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Limpar</span>
                  </button>
                </div>
              </div>

              {/* Linha 2: Barra de Filtro por Grupo (Pills Bidirecionais Canônicas) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>Grupos:</span>
                </span>

                {GRUPOS_COMANDOS.map((grp) => {
                  const Icone = grp.icon;
                  const isAtivo = grupoComandoFiltro === grp.id;
                  const totalGrupo = contagemPorGrupo[grp.id] ?? 0;

                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => {
                        // Filtro bidirecional estrito: se já ativo, volta para "todos"
                        setGrupoComandoFiltro(isAtivo && grp.id !== "todos" ? "todos" : grp.id);
                      }}
                      className={`px-2.5 py-1.2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                        isAtivo
                          ? "bg-orange-500 text-slate-950 border-orange-400 shadow-xs"
                          : "bg-white dark:bg-slate-950/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-orange-500/40 hover:bg-slate-100 dark:hover:bg-slate-900"
                      }`}
                      title={`Filtrar grupo: ${grp.label} (${totalGrupo} comandos)`}
                    >
                      <Icone
                        className={`h-3.5 w-3.5 ${isAtivo ? "text-slate-950" : "text-orange-500"}`}
                      />
                      <span>{grp.label}</span>
                      <span
                        className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                          isAtivo
                            ? "bg-slate-950/20 text-slate-950"
                            : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {totalGrupo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid de Botões Compactos Filtrados */}
            {comandosFiltrados.length === 0 ? (
              <div className="bg-white dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-500 mb-1">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Nenhum comando encontrado com os filtros atuais
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Nenhum dos 38 comandos corresponde aos termos de busca ou ao grupo selecionado.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBuscaComandoCatalogo("");
                    setComandoSelecionadoDropdown("");
                    setGrupoComandoFiltro("todos");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-slate-950 hover:bg-orange-400 transition cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Exibir todos os 38 comandos</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {comandosFiltrados.map((c) => {
                  const comandoAtivo = comandosEditados[c.num] ?? c.exemplo;
                  const foiEditado =
                    comandosEditados[c.num] !== undefined && comandosEditados[c.num] !== c.exemplo;

                  return (
                    <div
                      key={c.num}
                      className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-orange-500/40 rounded-2xl p-3 flex flex-col justify-between space-y-2 transition shadow-2xs group"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-5 w-5 rounded-md bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 shrink-0">
                            {c.num}
                          </span>
                          <h3
                            className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate"
                            title={c.titulo}
                          >
                            {c.titulo}
                          </h3>
                        </div>
                        {foiEditado && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                            Editado
                          </span>
                        )}
                      </div>

                      {/* Linha do Comando Ativo */}
                      <div
                        className="bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-xl border border-slate-200/80 dark:border-slate-800/80 font-mono text-[11px] font-bold text-orange-600 dark:text-orange-400 truncate tracking-wide"
                        title={comandoAtivo}
                      >
                        {comandoAtivo}
                      </div>

                      {/* Opções: Se tiver presets exibe Disparar e Configurar; se não tiver presets exibe botão único ocupando largura total */}
                      <div
                        className={
                          c.presets && c.presets.length > 0
                            ? "grid grid-cols-2 gap-1.5 pt-0.5"
                            : "pt-0.5"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => dispararComandoParaSelecionados(comandoAtivo, c.titulo)}
                          disabled={enviandoComando || selectedImeis.size === 0}
                          className={`py-1.5 px-2 rounded-xl text-[11px] font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs active:scale-95 ${
                            c.presets && c.presets.length > 0 ? "" : "w-full"
                          }`}
                          title={`Disparar "${comandoAtivo}" para ${selectedImeis.size} aparelho(s)`}
                        >
                          <Send className="h-3 w-3" />
                          <span>{c.categoria === "Auditoria" ? "Consultar" : "Disparar"}</span>
                        </button>
                        {c.presets && c.presets.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setComandoModalConfig(c)}
                            className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                            title={`Configurar parâmetros de "${c.titulo}"`}
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                            <span>Configurar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ABA 2: BANCADA DE CONFIGURAÇÃO SERIAL USB */}
      {abaPrincipal === "usb" && <AbaConfiguracaoUsb />}

      {/* ABA 3: BANCADA VIRTUAL E SIMULADOR DE CARGA GT06 */}
      {abaPrincipal === "simulador" && <AbaSimuladorCargaRastreadores />}

      {/* ABA 4: COMPARATIVO DE PADRÕES (TESTE A/B E FRANQUIA 20MB) */}
      {abaPrincipal === "comparativo" && (
        <AbaComparativoPadroesRastreador
          onAplicarParametrosCanonicos={handleAplicarParametrosDoComparativo}
        />
      )}

      {/* MODAL DE CONFIGURAÇÃO DE COMANDO ESPECÍFICO */}
      {comandoModalConfig && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl my-auto">
              {/* Cabeçalho */}
              <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/90 dark:bg-slate-950/50">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-sm font-mono font-bold text-orange-600 dark:text-orange-400">
                    {comandoModalConfig.num}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {comandoModalConfig.titulo}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500">
                      {comandoModalConfig.categoria} • {comandoModalConfig.prioridade}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setComandoModalConfig(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {comandoModalConfig.desc}
                </p>

                {/* Input de edição */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Comando Ativo:
                  </label>
                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-orange-500/30 focus-within:border-orange-500">
                    <input
                      type="text"
                      value={comandosEditados[comandoModalConfig.num] ?? comandoModalConfig.exemplo}
                      onChange={(e) => handleAlterarComando(comandoModalConfig.num, e.target.value)}
                      className="w-full bg-transparent font-mono text-sm text-orange-600 dark:text-orange-400 font-bold outline-none px-1"
                    />
                    {comandosEditados[comandoModalConfig.num] !== undefined &&
                      comandosEditados[comandoModalConfig.num] !== comandoModalConfig.exemplo && (
                        <button
                          type="button"
                          onClick={() => handleResetarComando(comandoModalConfig.num)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Restaurar comando original de fábrica"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() =>
                        copiarTexto(
                          comandosEditados[comandoModalConfig.num] ?? comandoModalConfig.exemplo,
                          comandoModalConfig.titulo,
                        )
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Copiar texto"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Presets */}
                {comandoModalConfig.presets && comandoModalConfig.presets.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Atalhos Homologados do Manual:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {comandoModalConfig.presets.map((preset) => {
                        const ativo =
                          (
                            comandosEditados[comandoModalConfig.num] ?? comandoModalConfig.exemplo
                          ).trim() === preset.valor.trim();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              handleAlterarComando(comandoModalConfig.num, preset.valor)
                            }
                            className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer active:scale-95 ${
                              ativo
                                ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/40 font-bold shadow-xs"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé */}
              <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/50">
                <button
                  type="button"
                  onClick={() =>
                    copiarTexto(
                      comandosEditados[comandoModalConfig.num] ?? comandoModalConfig.exemplo,
                      comandoModalConfig.titulo,
                    )
                  }
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copiar Comando</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setComandoModalConfig(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cmd =
                        comandosEditados[comandoModalConfig.num] ?? comandoModalConfig.exemplo;
                      dispararComandoParaSelecionados(cmd, comandoModalConfig.titulo);
                      setComandoModalConfig(null);
                    }}
                    disabled={enviandoComando || selectedImeis.size === 0}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Send className="h-4 w-4" />
                    <span>Disparar ({selectedImeis.size})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL PORTAL: TODAS AS 28 FUNÇÕES CANÔNICAS DO HARDWARE J16 VOXTER */}
      {dispositivoModalComandos && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl my-auto">
              {/* Cabeçalho */}
              <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/90 dark:bg-slate-950/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                    <SlidersHorizontal className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Funções e Comandos do Rastreador J16
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {dispositivoModalComandos.placa
                        ? `${dispositivoModalComandos.marcaModelo || "Veículo"} (${dispositivoModalComandos.placa})`
                        : `Estoque ${dispositivoModalComandos.imei.slice(-4)}`}{" "}
                      • IMEI: <strong>{dispositivoModalComandos.imei}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDispositivoModalComandos(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo com Todas as Funções Categorizadas */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[calc(90vh-130px)]">
                {[
                  {
                    categoria: "1. Consultas e Diagnóstico de Hardware",
                    comandos: [
                      {
                        cmd: "STATUS#",
                        label: "SAÚDE DO APARELHO (STATUS#)",
                        desc: "Status de bateria, GSM, satélites GPS e relé",
                      },
                      {
                        cmd: "PARAM#",
                        label: "CONFIGURAÇÕES (PARAM#)",
                        desc: "Leitura de parâmetros EEPROM na flash",
                      },
                      {
                        cmd: "VERSION#",
                        label: "VERSÃO DO CHIP (VERSION#)",
                        desc: "Versão do firmware do microcontrolador J16",
                      },
                      {
                        cmd: "WHERE#",
                        label: "ONDE ESTÁ AGORA (WHERE#)",
                        desc: "Coordenadas instantâneas de satélite",
                      },
                      {
                        cmd: "RELAY#",
                        label: "SITUAÇÃO DO MOTOR (RELAY#)",
                        desc: "Consulta do estado elétrico do relé de corte",
                      },
                      {
                        cmd: "GPRSSET#",
                        label: "CONEXÃO DO CHIP (GPRSSET#)",
                        desc: "Configurações de rádio e APN GPRS ativas",
                      },
                      {
                        cmd: "SENALM#",
                        label: "ALERTA DE BATIDA (SENALM#)",
                        desc: "Consulta alarme do acelerômetro G-Sensor",
                      },
                      {
                        cmd: "MILEAGE#",
                        label: "KM NO APARELHO (MILEAGE#)",
                        desc: "Consulta do odômetro acumulado no hardware J16",
                      },
                      {
                        cmd: "HBT#",
                        label: "SINAL DE PRESENÇA (HBT#)",
                        desc: "Consulta tempos de heartbeat (keep-alive)",
                      },
                      {
                        cmd: "TIMER#",
                        label: "TEMPO DE ENVIO (TIMER#)",
                        desc: "Consulta intervalos de transmissão ACC ON e OFF",
                      },
                      {
                        cmd: "DEFENSE#",
                        label: "NÍVEL DO ALARME (DEFENSE#)",
                        desc: "Consulta nível de defesa e arme automático",
                      },
                      {
                        cmd: "POWERALM#",
                        label: "BATERIA CORTADA (POWERALM#)",
                        desc: "Consulta alarme de corte da bateria principal",
                      },
                      {
                        cmd: "BATALM#",
                        label: "BATERIA FRACA (BATALM#)",
                        desc: "Consulta alarme de bateria interna fraca",
                      },
                      {
                        cmd: "SPEED#",
                        label: "EXCESSO VELOCIDADE (SPEED#)",
                        desc: "Consulta limiar de excesso de velocidade",
                      },
                      {
                        cmd: "MOVING#",
                        label: "ALERTA DE GUINCHO (MOVING#)",
                        desc: "Consulta alarme de deslocamento / guincho",
                      },
                      {
                        cmd: "SENALM#",
                        label: "ALERTA DE BATIDA (SENALM#)",
                        desc: "Consulta alarme do sensor de vibração",
                      },
                      {
                        cmd: "SOS#",
                        label: "TELEFONES SOS (SOS#)",
                        desc: "Consulta números autorizados de emergência",
                      },
                      {
                        cmd: "CENTER#",
                        label: "CELULAR DO DONO (CENTER#)",
                        desc: "Consulta número da central administradora",
                      },
                      {
                        cmd: "SERVER#",
                        label: "SERVIDOR ATUAL (SERVER#)",
                        desc: "Consulta servidor e porta TCP configurados",
                      },
                      {
                        cmd: "CXZT#",
                        label: "RAIO-X DO APARELHO (CXZT#)",
                        desc: "Radiografia global do fabricante (Voltagem, Sinal 4G, Uptime)",
                      },
                      {
                        cmd: "SCXSZ#",
                        label: "RESUMO MCU FÁBRICA (SCXSZ#)",
                        desc: "Dados estruturados gravados de fábrica na MCU",
                      },
                      {
                        cmd: "URL#",
                        label: "LINK GOOGLE MAPS (URL#)",
                        desc: "Link web imediato do Google Maps com fix GPS",
                      },
                      {
                        cmd: "APN#",
                        label: "OPERADORA DO CHIP (APN#)",
                        desc: "Consulta rápida da APN celular ativa",
                      },
                      {
                        cmd: "ACCALM#",
                        label: "STATUS ALARME IGNIÇÃO (ACCALM#)",
                        desc: "Consulta status do alarme instantâneo de chave/ACC",
                      },
                    ],
                  },
                  {
                    categoria: "2. Odômetro e Curvas (MCU SIMCom A7670)",
                    comandos: [
                      {
                        cmd: "MILEAGE#",
                        label: "CONSULTAR KM NO CHIP (MILEAGE#)",
                        desc: "Consulta a quilometragem total acumulada no aparelho",
                      },
                      {
                        cmd: "CXCS#GT06METER",
                        label: "CONSULTAR STATUS DO ODÔMETRO (CXCS#GT06METER)",
                        desc: "Consulta se a medição de km está ativa na MCU",
                      },
                      {
                        cmd: "CXCS#GT06IEXVOL",
                        label: "CONSULTAR PACOTES ESTENDIDOS (CXCS#GT06IEXVOL)",
                        desc: "Consulta envio de voltagem e odômetro estendidos",
                      },
                      {
                        cmd: "SZCS#GT06SEL=1#GT06METER=1",
                        label: "LIGAR ODÔMETRO (GT06METER=1)",
                        desc: "Ativa acúmulo de km interno no chip",
                      },
                      {
                        cmd: "SZCS#GT06METER=0",
                        label: "DESLIGAR ODÔMETRO (GT06METER=0)",
                        desc: "Desliga medição interna de km",
                      },
                      {
                        cmd: "SZCS#GT06IEXVOL=2",
                        label: "ENVIAR VOLTAGEM E ODÔMETRO (GT06IEXVOL=2)",
                        desc: "Telemetria de bateria externa em Volts e odômetro nos pacotes",
                      },
                      {
                        cmd: "MILEAGE=0#",
                        label: "ZERAR ODÔMETRO (MILEAGE=0#)",
                        desc: "Zera o contador de quilômetros do hardware",
                      },
                      {
                        cmd: "MILEAGE,ON,0#",
                        label: "ODÔMETRO CONCOX (MILEAGE=ON)",
                        desc: "Ativa cálculo de odômetro via protocolo Concox GT06",
                      },
                      {
                        cmd: "SZCS#ANGLE,SEND=1",
                        label: "PONTOS EM CURVAS (ANGLE=1)",
                        desc: "Ativa envio imediato em curvas",
                      },
                      {
                        cmd: "ANGLE,2,10#",
                        label: "PADRÃO CANÔNICO GD RASTREAMENTO 2s/10° (ANGLE,2,10#)",
                        desc: "Detecção canônica GD Rastreamento de curva em 2s e 10 graus de inflexão",
                      },
                      {
                        cmd: "SZCS#ANGLEVALUE=10-020",
                        label: "CURVA PADRÃO MCU 10s/20° (PADRÃO CANÔNICO)",
                        desc: "Detecção de curva calibrada na MCU J16 (10s/20°)",
                      },
                      {
                        cmd: "ANGLE,10,20#",
                        label: "CURVA UNIVERSAL 10s/20° (ANGLE,10,20#)",
                        desc: "Detecção universal Concox de curva em 10s/20°",
                      },
                      {
                        cmd: "CXCS#ANGLEVALUE",
                        label: "CONSULTAR ÂNGULO (CXCS#ANGLEVALUE)",
                        desc: "Consulta valor de curva gravado na MCU",
                      },
                      {
                        cmd: "SZCS#ACCLINE=1",
                        label: "IGNIÇÃO POR FIO (ACCLINE=1)",
                        desc: "Lê pós-chave físico elétrico (SZCS#ACCLINE=1)",
                      },
                      {
                        cmd: "SZCS#ACCLINE=0",
                        label: "IGNIÇÃO POR MOVIMENTO (ACCLINE=0)",
                        desc: "Detecta ignição por movimento (SZCS#ACCLINE=0)",
                      },
                    ],
                  },
                  {
                    categoria: "3. Bloqueio de Combustível e Segurança",
                    comandos: [
                      {
                        cmd: `DYD,${senhaDispositivoPadrao}`,
                        label: "BLOQUEAR COM SENHA (DYD,<senha>)",
                        desc: "Aciona corte de combustível autenticado com senha salva",
                        cor: "rose",
                      },
                      {
                        cmd: `HFYD,${senhaDispositivoPadrao}`,
                        label: "LIBERAR COM SENHA (HFYD,<senha>)",
                        desc: "Restaura alimentação de combustível com senha salva",
                        cor: "emerald",
                      },
                      {
                        cmd: "RELAY,1",
                        label: "BLOQUEAR VEÍCULO (RELAY,1)",
                        desc: "Aciona corte de combustível/energia",
                        cor: "rose",
                      },
                      {
                        cmd: "RELAY,0",
                        label: "DESBLOQUEAR VEÍCULO (RELAY,0)",
                        desc: "Restaura alimentação da bomba",
                        cor: "emerald",
                      },
                      {
                        cmd: "MOVING,ON,100,0#",
                        label: "ATIVAR GUINCHO 100m (MOVING,ON,100,0#)",
                        desc: "Alerta de deslocamento desligado em raio de 100m",
                        cor: "amber",
                      },
                      {
                        cmd: "SZCS#SOURCE,OFF,TYPE=1",
                        label: "CORTE IMEDIATO (SOURCE=1)",
                        desc: "Corta relé sem esperar < 20 km/h",
                        cor: "rose",
                      },
                      {
                        cmd: "SZCS#SOURCE,OFF,TYPE=0",
                        label: "CORTE SEGURO <20KM/H (SOURCE=0)",
                        desc: "Salvaguarda de corte seguro (< 20 km/h)",
                        cor: "amber",
                      },
                      {
                        cmd: "RELAY#",
                        label: "CONSULTAR MOTOR (RELAY#)",
                        desc: "Verifica se relé está cortado ou liberado",
                        cor: "sky",
                      },
                      {
                        cmd: `SOS,A,${numeroSos ? numeroSos.replace(/\D/g, "") : "24988887777"}#`,
                        label: "CADASTRAR SOS (SOS)",
                        desc: "Telefone de alerta de emergência",
                      },
                      {
                        cmd: `admin#${senhaDispositivoPadrao}#${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}#`,
                        label: "CADASTRAR ADMIN (admin#senha#numero#)",
                        desc: "Número administrador mestre que bloqueia comandos de terceiros",
                        cor: "emerald",
                      },
                      {
                        cmd: `admin${senhaDispositivoPadrao} ${numeroCenter ? numeroCenter.replace(/\D/g, "") : "5511999998888"}`,
                        label: "CADASTRAR ADMIN ESPAÇO (admin<senha> <numero>)",
                        desc: "Formato alternativo com espaço testado no chip",
                      },
                      {
                        cmd: `CENTER,A,${numeroCenter ? numeroCenter.replace(/\D/g, "") : "24988887777"}#`,
                        label: "CADASTRAR DONO (CENTER)",
                        desc: "Número central administrador Concox",
                      },
                      {
                        cmd: "CENTER#",
                        label: "CONSULTAR DONO (CENTER#)",
                        desc: "Verifica se há telefone mestre cadastrado",
                        cor: "sky",
                      },
                      {
                        cmd: "PASSWORD#",
                        label: "CONSULTAR SENHA (PASSWORD#)",
                        desc: "Verifica status da senha mestre do rastreador",
                        cor: "sky",
                      },
                      {
                        cmd: "DEFENSE,1#",
                        label: "MODO VIGÍLIA (DEFENSE=1)",
                        desc: "Ativa alarme de defesa do veículo",
                        cor: "sky",
                      },
                      {
                        cmd: "BATALM,ON,0#",
                        label: "ALERTA BATERIA FRACA (BATALM)",
                        desc: "Notifica bateria interna baixa via plataforma",
                        cor: "amber",
                      },
                      {
                        cmd: "POWERALM,ON,0,5,10#",
                        label: "CORTE DE BATERIA (POWERALM)",
                        desc: "Alerta corte de alimentação externa 12V",
                        cor: "rose",
                      },
                      {
                        cmd: "ACCALM,ON,2#",
                        label: "ALARME IGNIÇÃO INSTANTÂNEO (ACCALM,ON,2#)",
                        desc: "Dispara aviso GPRS imediato ao desligar a chave (zera atraso)",
                        cor: "sky",
                      },
                      {
                        cmd: "ACCALM#",
                        label: "CONSULTAR ALARME IGNIÇÃO (ACCALM#)",
                        desc: "Verifica status do envio de alarme instantâneo de chave",
                        cor: "sky",
                      },
                    ],
                  },
                  {
                    categoria: "4. Hardware, Sensores e Manutenção",
                    comandos: [
                      {
                        cmd: "SZCS#MTK_DISSLP=0",
                        label: "ECONOMIA AO PARAR (MTK_DISSLP=0)",
                        desc: "Permite repouso e economia de dados M2M",
                        cor: "emerald",
                      },
                      {
                        cmd: "SZCS#SLPDISCONNECT=0",
                        label: "MODO CARRO ONLINE (SLPDISCONNECT=0)",
                        desc: "Mantém online e pronto no repouso",
                      },
                      {
                        cmd: "SZCS#SLPDISCONNECT=1",
                        label: "MODO MOTO OFFLINE (SLPDISCONNECT=1)",
                        desc: "Desconecta no repouso (poupa bateria 5Ah)",
                      },
                      {
                        cmd: "SZCS#GPS_DISSLP=0",
                        label: "DESLIGAR GPS AO PARAR (GPS_DISSLP=0)",
                        desc: "Desliga satélites com carro parado",
                      },
                      {
                        cmd: "SENDS,1#",
                        label: "DORMIR EM 1 MIN (SENDS=1)",
                        desc: "Desliga GPS e entra em economia após 1 minuto",
                        cor: "emerald",
                      },
                      {
                        cmd: "CXCS#LED_ENABLE",
                        label: "CONSULTAR LUZES (CXCS#LED_ENABLE)",
                        desc: "Verifica se LEDs estão ativos ou em modo discreto",
                        cor: "sky",
                      },
                      {
                        cmd: "SZCS#LED_ENABLE=0",
                        label: "APAGAR LUZES (LED_ENABLE=0)",
                        desc: "Desativa LEDs frontais (SZCS#LED_ENABLE=0)",
                      },
                      {
                        cmd: "SZCS#LED_ENABLE=1",
                        label: "LIGAR LUZES (LED_ENABLE=1)",
                        desc: "Ativa LEDs indicadores frontais (SZCS#LED_ENABLE=1)",
                      },
                      {
                        cmd: "GMT,W,0,0#",
                        label: "FUSO HORÁRIO (GMT-0)",
                        desc: "Alinha relógio interno com UTC",
                      },
                      {
                        cmd: "SENALM,ON,0#",
                        label: "ALERTA DE BATIDA ATIVAR (SENALM)",
                        desc: "Ativa alarme de choque/vibração via plataforma",
                      },
                      {
                        cmd: "LEVEL,3#",
                        label: "SENSIBILIDADE SENSOR G (LEVEL=3)",
                        desc: "Sensibilidade triaxial padrão da MCU (nível 1 a 5)",
                        cor: "sky",
                      },
                      {
                        cmd: "RESET#",
                        label: "REINICIAR APARELHO (RESET#)",
                        desc: "Reinicia MCU sem apagar parâmetros",
                      },
                      {
                        cmd: "FACTORY#",
                        label: "ZERAR DE FÁBRICA (FACTORY#)",
                        desc: "Restaura parâmetros de fábrica",
                        cor: "rose",
                      },
                    ],
                  },
                ].map((secao) => (
                  <div key={secao.categoria} className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono uppercase tracking-wider">
                      {secao.categoria}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {secao.comandos.map((item) => (
                        <div
                          key={item.cmd}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 flex items-center justify-between gap-2 hover:border-orange-500/40 transition"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                              {item.label}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {item.desc}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await dispararAcaoRapida(
                                dispositivoModalComandos.imei,
                                item.cmd,
                                item.label,
                                dispositivoModalComandos.veiculoId,
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shrink-0 transition cursor-pointer active:scale-95 ${
                              item.cor === "rose"
                                ? "bg-rose-500 hover:bg-rose-600 text-white"
                                : item.cor === "emerald"
                                  ? "bg-orange-500 hover:bg-orange-600 text-slate-950"
                                  : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            DISPARAR
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rodapé do Modal */}
              <div className="p-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono text-slate-500">
                <span>Total de 28 funções canônicas homologadas J16</span>
                <button
                  type="button"
                  onClick={() => setDispositivoModalComandos(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {/* MODAL CANÔNICO DE ALTERAÇÃO DE SENHA DO RASTREADOR J16 */}
      {modalAlterarSenhaAberto && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
              {/* Cabeçalho */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-100/80 dark:bg-slate-950/80">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Key className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      Alterar Senha do Rastreador
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Atualiza a credencial no hardware e salva no padrão do sistema
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAlterarSenhaAberto(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* Formato do Protocolo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Protocolo do Comando
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: "PASSWORD" as const,
                        label: "Concox (PASSWORD)",
                        cmd: "PASSWORD,atual,nova#",
                      },
                      {
                        id: "MCU_ZHEN" as const,
                        label: "Zhian MCU",
                        cmd: "zhencbpwd,atual,nova#",
                      },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormatoSenhaForm(f.id)}
                        className={`p-2.5 rounded-xl text-left border transition cursor-pointer ${
                          formatoSenhaForm === f.id
                            ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs"
                        }`}
                      >
                        <div className="text-[11px] font-bold truncate">{f.label}</div>
                        <div className="text-[9px] font-mono opacity-70 truncate mt-0.5">
                          {f.cmd}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campos de Senha */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Senha Atual Gravada no Aparelho
                    </label>
                    <input
                      type="text"
                      value={senhaAtualForm}
                      onChange={(e) => setSenhaAtualForm(e.target.value)}
                      placeholder="Ex: 123456"
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Padrão de fábrica: 123456 (ou a senha anterior definida).
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Nova Senha Mestre
                      </label>
                      <input
                        type="text"
                        value={novaSenhaForm}
                        onChange={(e) => setNovaSenhaForm(e.target.value)}
                        placeholder="Ex: 654321"
                        maxLength={15}
                        className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Recomendado: 6 dígitos numéricos.
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Confirmar Nova Senha
                      </label>
                      <input
                        type="text"
                        value={confirmarSenhaForm}
                        onChange={(e) => setConfirmarSenhaForm(e.target.value)}
                        placeholder="Ex: 654321"
                        maxLength={15}
                        className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Digite novamente para validar.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pré-visualização do Comando Gerado */}
                <div className="p-3 rounded-2xl bg-slate-950 text-white font-mono text-xs border border-slate-800 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Comando Gerado para o Hardware:
                  </div>
                  <div className="text-amber-400 font-bold text-sm tracking-wider">
                    {formatoSenhaForm === "PASSWORD"
                      ? `PASSWORD,${senhaAtualForm || "123456"},${novaSenhaForm || "NOVA_SENHA"}#`
                      : `zhencbpwd,${senhaAtualForm || "123456"},${novaSenhaForm || "NOVA_SENHA"}#`}
                  </div>
                </div>

                {/* Explicação de Injeção Automática */}
                <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-800 dark:text-orange-300 text-xs space-y-1">
                  <strong className="block font-bold">Injeção Dinâmica em Todo o Sistema:</strong>
                  <p className="text-[11px] leading-relaxed text-orange-700 dark:text-orange-400">
                    Ao salvar, a nova senha passa a ser utilizada imediatamente no comando de
                    administrador (
                    <code>
                      admin#{novaSenhaForm || "NOVA_SENHA"}#
                      {numeroCenter ? numeroCenter.replace(/\D/g, "") : "numero"}#
                    </code>
                    ), no corte de motor (<code>DYD</code>), na liberação (<code>HFYD</code>) e na
                    consulta de status.
                  </p>
                </div>
              </div>

              {/* Rodapé de Ações */}
              <div className="p-4 bg-slate-100/90 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalAlterarSenhaAberto(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer text-center"
                >
                  Cancelar
                </button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExecutarAlteracaoSenha("salvar_apenas")}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer text-center"
                    title="Apenas salvar a nova senha no sistema sem enviar ao hardware agora"
                  >
                    Apenas Salvar no Sistema
                  </button>

                  <button
                    type="button"
                    disabled={enviandoAlteracaoSenha}
                    onClick={() => handleExecutarAlteracaoSenha("gprs")}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                    title="Transmitir via GPRS para os dispositivos selecionados e salvar no sistema"
                  >
                    {enviandoAlteracaoSenha ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>Transmitir GPRS e Salvar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE MENSAGENS E CANAIS DE ALERTA DO RASTREADOR */}
      <ModalConfiguracaoCanaisAlerta
        aberto={modalConfigurarCanaisAberto}
        onClose={() => setModalConfigurarCanaisAberto(false)}
        onSalvo={(novos) => setCanaisAlertaComando(novos)}
      />
    </div>
  );
}
