import type { TipoVeiculo } from "../types";
export type { TipoVeiculo };

export interface TipoVeiculoConfig {
  id: TipoVeiculo;
  label: string;
  categoria: "leve" | "utilitario" | "pesado" | "duas_rodas" | "nautico";
  descricao: string;
}

export const LISTA_TIPOS_VEICULO: TipoVeiculoConfig[] = [
  { id: "carro", label: "Carro", categoria: "leve", descricao: "Passeio / Sedan / Hatch" },
  { id: "suv", label: "SUV", categoria: "leve", descricao: "Utilitário esportivo" },
  {
    id: "camionete",
    label: "Camionete",
    categoria: "utilitario",
    descricao: "Picape / Cabine dupla",
  },
  {
    id: "van",
    label: "Van",
    categoria: "utilitario",
    descricao: "Van / Furgão / Transporte",
  },
  {
    id: "ambulancia",
    label: "Ambulância",
    categoria: "utilitario",
    descricao: "Resgate / Emergência / Saúde",
  },
  { id: "caminhao", label: "Caminhão", categoria: "pesado", descricao: "Carga pesada / Truck" },
  { id: "onibus", label: "Ônibus", categoria: "pesado", descricao: "Coletivo / Rodoviário" },
  { id: "moto", label: "Moto", categoria: "duas_rodas", descricao: "Motocicleta / Scooter" },
  {
    id: "moto_eletrica",
    label: "Moto Elétrica",
    categoria: "duas_rodas",
    descricao: "Scooter Elétrica / Ciclomotor / E-Bike",
  },
  {
    id: "quadriciculo",
    label: "Quadriciclo",
    categoria: "utilitario",
    descricao: "ATV 4x4 Off-Road",
  },
  { id: "triciclo", label: "Triciclo", categoria: "duas_rodas", descricao: "Triciclo motorizado" },
  { id: "jetski", label: "Jet Ski", categoria: "nautico", descricao: "Embarcação náutica" },
  {
    id: "maquina",
    label: "Máquina",
    categoria: "pesado",
    descricao: "Maquinário Pesado / Agrícola / Industrial / Trator / Escavadeira",
  },
];

export function normalizarTipoVeiculo(tipo?: string | null): TipoVeiculo {
  if (!tipo) return "carro";
  const t = tipo.toLowerCase().trim();
  if (
    t === "moto_eletrica" ||
    t === "moto eletrica" ||
    t === "moto elétrica" ||
    t === "scooter eletrica" ||
    t === "scooter elétrica" ||
    t === "e-bike" ||
    t === "ebike" ||
    t === "ciclomotor"
  )
    return "moto_eletrica";
  if (
    t === "maquina" ||
    t === "máquina" ||
    t === "trator" ||
    t === "escavadeira" ||
    t === "retroescavadeira" ||
    t === "pa carregadeira" ||
    t === "pá carregadeira" ||
    t === "agricola" ||
    t === "agrícola" ||
    t === "colheitadeira" ||
    t === "empilhadeira"
  )
    return "maquina";
  if (t === "jetski" || t === "jet ski" || t === "embarcacao") return "jetski";
  if (t === "suv") return "suv";
  if (t === "camionete" || t === "picape" || t === "pickup") return "camionete";
  if (t === "van" || t === "furgao" || t === "furgão" || t === "furgonette") return "van";
  if (
    t === "ambulancia" ||
    t === "ambulância" ||
    t === "resgate" ||
    t === "samu" ||
    t === "uti movel" ||
    t === "uti móvel"
  )
    return "ambulancia";
  if (t === "caminhao" || t === "caminhão" || t === "carreta") return "caminhao";
  if (t === "onibus" || t === "ônibus" || t === "microonibus") return "onibus";
  if (t === "moto" || t === "motocicleta") return "moto";
  if (t === "quadriciculo" || t === "quadriciclo") return "quadriciculo";
  if (t === "triciclo") return "triciclo";
  return "carro";
}

export function obterRotuloTipoVeiculo(tipo?: string | null): string {
  const normalizado = normalizarTipoVeiculo(tipo);
  const found = LISTA_TIPOS_VEICULO.find((item) => item.id === normalizado);
  return found ? found.label : "Carro";
}

/**
 * Retorna o SVG 3D isométrico renderizado com perspectiva volumétrica, iluminação e sombras
 */
export function getVehicleSvg3DContent(tipo: TipoVeiculo, corStatus: string = "#10B981"): string {
  switch (tipo) {
    case "moto":
      return `
        <!-- Sombra 3D projetada no piso -->
        <ellipse cx="24" cy="28" rx="7" ry="17" fill="rgba(0,0,0,0.55)" filter="blur(2px)" />
        <!-- Pneu Traseiro com perfil 3D -->
        <rect x="21.5" y="32" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Pneu Dianteiro com perfil 3D -->
        <rect x="21.5" y="5" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Chassi e motor com detalhe cromado -->
        <path d="M20 20 L28 20 L26 31 L22 31 Z" fill="#1E293B" stroke="#334155" stroke-width="0.8"/>
        <!-- Tanque de combustível / Carenagem aerodinâmica 3D -->
        <path d="M24 12 C28 14 28 23 27 27 C26 29 22 29 21 27 C20 23 20 14 24 12 Z" fill="${corStatus}" />
        <path d="M24 13 C26 14 26 21 25.5 25 C25 26 24 26 23.5 25 C23 21 23 14 24 13 Z" fill="rgba(255,255,255,0.4)" />
        <!-- Guidão esportivo 3D -->
        <line x1="14" y1="15" x2="34" y2="15" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
        <circle cx="14" cy="15" r="1.5" fill="#334155"/>
        <circle cx="34" cy="15" r="1.5" fill="#334155"/>
        <!-- Farol Dianteiro LED com feixe de luz -->
        <polygon points="21,5 27,5 28,1 20,1" fill="#FFFFFF" opacity="0.95"/>
      `;

    case "moto_eletrica":
      return `
        <!-- Sombra 3D projetada no piso -->
        <ellipse cx="24" cy="28" rx="8" ry="17" fill="rgba(0,0,0,0.55)" filter="blur(2px)" />
        <!-- Pneu Traseiro com perfil 3D -->
        <rect x="21.5" y="32" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#06B6D4" stroke-width="0.8"/>
        <!-- Pneu Dianteiro com perfil 3D -->
        <rect x="21.5" y="5" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#06B6D4" stroke-width="0.8"/>
        <!-- Pack de Bateria de Íons de Lítio Central com LED status elétrico -->
        <rect x="20" y="20" width="8" height="11" rx="2" fill="#0F172A" stroke="#06B6D4" stroke-width="1.2"/>
        <rect x="22" y="22" width="4" height="7" rx="1" fill="#06B6D4" opacity="0.85"/>
        <!-- Raio Elétrico indicador no pack de energia -->
        <path d="M24.5 23 L23 25.5 L24.5 25.5 L23.5 28 L25.5 25 L24 25 Z" fill="#FFFFFF" />
        <!-- Carenagem aerodinâmica e moderna Scooter / Moto Elétrica 3D -->
        <path d="M24 10 C29 13 29 22 28 27 C27 30 21 30 20 27 C19 22 19 13 24 10 Z" fill="${corStatus}" />
        <path d="M24 11 C27 13 27 20 26.5 24 C26 25 24 25 23.5 24 C22 20 22 13 24 11 Z" fill="rgba(255,255,255,0.4)" />
        <!-- Guidão Futurista 3D com manoplas ergonômicas -->
        <line x1="13" y1="14" x2="35" y2="14" stroke="#F8FAFC" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="13" cy="14" r="1.6" fill="#06B6D4"/>
        <circle cx="35" cy="14" r="1.6" fill="#06B6D4"/>
        <!-- Farol Full LED de Alta Intensidade -->
        <polygon points="20,4 28,4 27,1 21,1" fill="#E0F2FE" opacity="0.98"/>
        <circle cx="24" cy="3" r="1.5" fill="#38BDF8"/>
      `;

    case "jetski":
      return `
        <!-- Sombra e rastro de água 3D -->
        <ellipse cx="24" cy="27" rx="10" ry="18" fill="rgba(0,0,0,0.45)" filter="blur(2px)" />
        <path d="M18 41 L24 47 L30 41 Z" fill="${corStatus}" opacity="0.4" />
        <!-- Casco náutico em V aerodinâmico 3D -->
        <path d="M24 4 C32 12 33 34 29 42 C27 44 21 44 19 42 C15 34 16 12 24 4 Z" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <!-- Deck superior colorido com brilho de gelcoat -->
        <path d="M24 7 C30 14 30 32 27 38 C25 40 23 40 21 38 C18 32 18 14 24 7 Z" fill="${corStatus}"/>
        <path d="M24 8 C27 14 27 28 25 34 C24.5 35 23.5 35 23 34 C21 28 21 14 24 8 Z" fill="rgba(255,255,255,0.35)"/>
        <!-- Assento náutico duplo texturizado -->
        <rect x="21" y="21" width="6" height="15" rx="3" fill="#1E293B" stroke="#0F172A" stroke-width="0.8"/>
        <!-- Guidão marítimo -->
        <line x1="16" y1="16" x2="32" y2="16" stroke="#E2E8F0" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Farol marítimo de proa -->
        <polygon points="22,6 26,6 25,3 23,3" fill="#FFFFFF"/>
      `;

    case "quadriciculo":
      return `
        <!-- Sombra 3D -->
        <rect x="11" y="7" width="26" height="34" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- 4 Rodas Off-road largas com cravos salientes -->
        <rect x="8" y="7" width="6" height="11" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="34" y="7" width="6" height="11" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="8" y="29" width="6" height="12" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="34" y="29" width="6" height="12" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <!-- Chassi tubular ATV -->
        <rect x="13" y="11" width="22" height="26" rx="4" fill="#0F172A" stroke="#1E293B" stroke-width="1.2"/>
        <!-- Carenagem superior 3D -->
        <path d="M16 11 L32 11 L30 35 L18 35 Z" fill="${corStatus}"/>
        <!-- Assento central -->
        <rect x="20.5" y="18" width="7" height="14" rx="3.5" fill="#1E293B"/>
        <!-- Guidão com protetores de mão -->
        <line x1="13" y1="14" x2="35" y2="14" stroke="#F1F5F9" stroke-width="2.4" stroke-linecap="round"/>
        <!-- Faróis duplos LED -->
        <circle cx="18" cy="11" r="2" fill="#FFFFFF"/>
        <circle cx="30" cy="11" r="2" fill="#FFFFFF"/>
      `;

    case "triciclo":
      return `
        <!-- Sombra 3D -->
        <polygon points="24,6 38,40 10,40" fill="rgba(0,0,0,0.5)" filter="blur(2px)"/>
        <!-- Roda Dianteira Central -->
        <rect x="21.5" y="5" width="5" height="10" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- 2 Rodas Traseiras Largas -->
        <rect x="8" y="30" width="6.5" height="12" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <rect x="33.5" y="30" width="6.5" height="12" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Corpo delta 3D aerodinâmico -->
        <path d="M24 10 L35 34 L32 40 L16 40 L13 34 Z" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Teto / Cockpit esportivo com reflexo -->
        <path d="M24 14 L30 30 L18 30 Z" fill="#0F172A"/>
        <path d="M24 15 L28 28 L20 28 Z" fill="rgba(255,255,255,0.3)"/>
        <!-- Guidão / Frente esportiva -->
        <line x1="16" y1="13" x2="32" y2="13" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
      `;

    case "caminhao":
      return `
        <!-- Sombra pesada 3D -->
        <rect x="11" y="4" width="26" height="42" rx="5" fill="rgba(0,0,0,0.6)" filter="blur(2.5px)"/>
        <!-- Chassi com rodagem dupla traseira -->
        <rect x="9" y="31" width="4" height="12" rx="1.5" fill="#090D16"/>
        <rect x="35" y="31" width="4" height="12" rx="1.5" fill="#090D16"/>
        <!-- Carroceria / Baú de Carga 3D -->
        <rect x="12" y="18" width="24" height="26" rx="2" fill="#1E293B" stroke="#334155" stroke-width="1.2"/>
        <line x1="12" y1="31" x2="36" y2="31" stroke="#0F172A" stroke-width="1"/>
        <!-- Cabine pesada frontal 3D -->
        <rect x="12" y="4" width="24" height="15" rx="3" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa panorâmico com reflexo -->
        <path d="M14 6 L34 6 L33 11 L15 11 Z" fill="#0F172A"/>
        <path d="M15 7 L27 7 L26 10 L16 10 Z" fill="rgba(255,255,255,0.4)"/>
        <!-- Defletores de ar no teto -->
        <rect x="16" y="13" width="16" height="4" rx="1" fill="#334155"/>
        <!-- Faróis de topo e milha -->
        <circle cx="14" cy="5" r="1.5" fill="#FFFFFF"/>
        <circle cx="34" cy="5" r="1.5" fill="#FFFFFF"/>
      `;

    case "onibus":
      return `
        <!-- Sombra 3D alongada -->
        <rect x="12" y="3" width="24" height="43" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2.5px)"/>
        <!-- Carroceria 3D monobloco alongada -->
        <rect x="13" y="3" width="22" height="42" rx="4.5" fill="${corStatus}" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Para-brisa frontal grande e inclinado -->
        <path d="M15 5 L33 5 L32 10 L16 10 Z" fill="#0F172A"/>
        <path d="M16 6 L28 6 L27 9 L17 9 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Janelas laterais de passageiros em vidro fumê -->
        <rect x="14.5" y="12" width="2" height="26" rx="0.5" fill="#0B132B"/>
        <rect x="31.5" y="12" width="2" height="26" rx="0.5" fill="#0B132B"/>
        <!-- Climatizador / Ar-condicionado no teto 3D -->
        <rect x="18" y="16" width="12" height="16" rx="2" fill="#1E293B" stroke="#334155" stroke-width="0.8"/>
        <!-- Faróis duplos de LED -->
        <circle cx="16" cy="4" r="1.5" fill="#FFFFFF"/>
        <circle cx="32" cy="4" r="1.5" fill="#FFFFFF"/>
      `;

    case "camionete":
      return `
        <!-- Sombra 3D -->
        <rect x="11" y="4" width="26" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Cabine Dupla 3D -->
        <rect x="13" y="4" width="22" height="24" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa frontal e traseiro -->
        <path d="M15 7 L33 7 L32 12 L16 12 Z" fill="#0F172A"/>
        <path d="M16 8 L27 8 L26 11 L17 11 Z" fill="rgba(255,255,255,0.4)"/>
        <rect x="16" y="24" width="16" height="3" rx="1" fill="#0F172A"/>
        <!-- Caçamba traseira aberta com protetor em relevo -->
        <rect x="13" y="28" width="22" height="15" rx="2" fill="#1E293B" stroke="#0F172A" stroke-width="1"/>
        <rect x="15" y="30" width="18" height="11" rx="1" fill="#0F172A"/>
        <line x1="18" y1="30" x2="18" y2="41" stroke="#334155" stroke-width="1"/>
        <line x1="24" y1="30" x2="24" y2="41" stroke="#334155" stroke-width="1"/>
        <line x1="30" y1="30" x2="30" y2="41" stroke="#334155" stroke-width="1"/>
        <!-- Faróis de LED dianteiros -->
        <rect x="14" y="4" width="4" height="2" rx="0.5" fill="#FFFFFF"/>
        <rect x="30" y="4" width="4" height="2" rx="0.5" fill="#FFFFFF"/>
      `;

    case "van":
      return `
        <!-- Sombra 3D alongada e encorpada -->
        <rect x="12" y="3.5" width="24" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2.2px)"/>
        <!-- Carroceria 3D Van / Furgão -->
        <rect x="13.5" y="3.5" width="21" height="40" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1.1"/>
        <!-- Para-brisa frontal amplo com coluna A -->
        <path d="M15.5 6 L32.5 6 L31.5 12 L16.5 12 Z" fill="#0B132B"/>
        <!-- Reflexo especular do vidro frontal -->
        <path d="M17 7 L28 7 L27 10.5 L17.5 10.5 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Vidros laterais dianteiros do motorista/passageiro -->
        <rect x="14" y="13" width="1.8" height="6" rx="0.5" fill="#0B132B"/>
        <rect x="32.2" y="13" width="1.8" height="6" rx="0.5" fill="#0B132B"/>
        <!-- Frisos longitudinais de reforço no teto da van -->
        <line x1="17.5" y1="15" x2="17.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="21.5" y1="15" x2="21.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="26.5" y1="15" x2="26.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="30.5" y1="15" x2="30.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <!-- Vigia traseira / Vidro duplo traseiro -->
        <rect x="16.5" y="39.5" width="6.5" height="2" rx="0.5" fill="#0B132B"/>
        <rect x="25" y="39.5" width="6.5" height="2" rx="0.5" fill="#0B132B"/>
        <!-- Faróis de LED dianteiros -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas verticais traseiras em LED -->
        <rect x="14" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
        <rect x="32.5" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
      `;

    case "ambulancia":
      return `
        <!-- Sombra 3D projetada no piso -->
        <rect x="12" y="3.5" width="24" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2.2px)"/>
        <!-- Carroceria 3D Furgão de Resgate / Ambulância -->
        <rect x="13.5" y="3.5" width="21" height="40" rx="4" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Faixas reflexivas laterais de emergência -->
        <rect x="13.5" y="14" width="2.5" height="24" fill="#EF4444"/>
        <rect x="32" y="14" width="2.5" height="24" fill="#EF4444"/>
        <!-- Para-brisa frontal amplo -->
        <path d="M15.5 6 L32.5 6 L31.5 12 L16.5 12 Z" fill="#0B132B"/>
        <path d="M17 7 L28 7 L27 10.5 L17.5 10.5 Z" fill="rgba(255,255,255,0.5)"/>
        <!-- Barra de Giroflex de Emergência Luminosa (Sirene Vermelha e Azul) -->
        <rect x="18" y="13" width="12" height="3.5" rx="1.5" fill="#0F172A"/>
        <rect x="19" y="13.5" width="4.5" height="2.5" rx="1" fill="#EF4444"/>
        <circle cx="24" cy="14.7" r="1" fill="#FFFFFF"/>
        <rect x="24.5" y="13.5" width="4.5" height="2.5" rx="1" fill="#3B82F6"/>
        <!-- Cruz Vermelha Médica de Resgate no Teto -->
        <circle cx="24" cy="26" r="6" fill="#FEE2E2" stroke="#EF4444" stroke-width="0.8"/>
        <rect x="22.5" y="22.5" width="3" height="7" rx="0.5" fill="#EF4444"/>
        <rect x="20.5" y="24.5" width="7" height="3" rx="0.5" fill="#EF4444"/>
        <!-- Faróis de LED dianteiros de alta intensidade -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas traseiras de emergência -->
        <rect x="14" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
        <rect x="32.5" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
      `;

    case "suv":
      return `
        <!-- Sombra volumétrica 3D -->
        <rect x="12" y="4" width="24" height="40" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Carroceria encorpada SUV 3D -->
        <rect x="13" y="4" width="22" height="38" rx="5" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa esportivo e vigia traseira -->
        <path d="M15 7 L33 7 L32 13 L16 13 Z" fill="#0F172A"/>
        <path d="M16 8 L27 8 L26 12 L17 12 Z" fill="rgba(255,255,255,0.4)"/>
        <rect x="16" y="35" width="16" height="3" rx="1" fill="#0F172A"/>
        <!-- Barras de teto longitudinais / Rack de expedição -->
        <rect x="14.5" y="14" width="1.8" height="20" rx="0.9" fill="#0F172A"/>
        <rect x="31.7" y="14" width="1.8" height="20" rx="0.9" fill="#0F172A"/>
        <!-- Teto solar panorâmico com reflexo de vidro -->
        <rect x="18" y="16" width="12" height="15" rx="2" fill="#090E17"/>
        <path d="M19 17 L28 17 L26 23 L19 23 Z" fill="rgba(255,255,255,0.2)"/>
        <!-- Faróis de LED dianteiros -->
        <polygon points="14,4 18,4 17,6 14,6" fill="#FFFFFF"/>
        <polygon points="34,4 30,4 31,6 34,6" fill="#FFFFFF"/>
      `;

    case "maquina":
      return `
        <!-- Sombra 3D de Maquinário Pesado -->
        <rect x="9" y="4" width="30" height="42" rx="6" fill="rgba(0,0,0,0.65)" filter="blur(2.5px)"/>
        <!-- Esteiras / Rodados Tratorados Laterais de Alta Carga com garras -->
        <rect x="8" y="6" width="6.5" height="38" rx="3" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <rect x="33.5" y="6" width="6.5" height="38" rx="3" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <!-- Garras das esteiras/pneus -->
        <line x1="8" y1="12" x2="14.5" y2="12" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="18" x2="14.5" y2="18" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="24" x2="14.5" y2="24" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="30" x2="14.5" y2="30" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="36" x2="14.5" y2="36" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="12" x2="40" y2="12" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="18" x2="40" y2="18" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="24" x2="40" y2="24" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="30" x2="40" y2="30" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="36" x2="40" y2="36" stroke="#475569" stroke-width="1.2"/>
        <!-- Chassi Central Blindado e Motor (Amarelo Ouro Industrial / Cor de Status) -->
        <rect x="13.5" y="5" width="21" height="40" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Concha / Lâmina Frontal de Ataque -->
        <path d="M12 4 L36 4 L34 8 L14 8 Z" fill="#F59E0B" stroke="#78350F" stroke-width="1"/>
        <!-- Cabine do Operador com Estrutura ROPS/FOPS Reforçada -->
        <rect x="16" y="20" width="16" height="18" rx="3" fill="#0B132B" stroke="#0F172A" stroke-width="1"/>
        <rect x="17.5" y="22" width="13" height="14" rx="2" fill="rgba(255,255,255,0.2)"/>
        <!-- Teto Reforçado da Cabine com Faróis de Trabalho Noturno -->
        <rect x="15" y="24" width="18" height="12" rx="2" fill="#F59E0B" stroke="#0F172A" stroke-width="1"/>
        <circle cx="17.5" cy="22" r="1.2" fill="#FEF08A"/>
        <circle cx="30.5" cy="22" r="1.2" fill="#FEF08A"/>
        <!-- Giroflex / Luz de Advertência Âmbar Central no Teto -->
        <circle cx="24" cy="27" r="2" fill="#F59E0B" stroke="#B45309" stroke-width="0.8"/>
        <!-- Escapamento Vertical Industrial -->
        <circle cx="16.5" cy="12" r="1.5" fill="#334155" stroke="#0F172A" stroke-width="0.8"/>
      `;

    case "carro":
    default:
      return `
        <!-- Sombra dinâmica 3D projetada no solo -->
        <rect x="12" y="4" width="24" height="40" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Carroceria Sedan / Esportiva 3D com linhas aerodinâmicas -->
        <rect x="13.5" y="4" width="21" height="38" rx="5" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa dianteiro aerodinâmico em vidro fumê escuro -->
        <path d="M15.5 7 L32.5 7 L31 14 L17 14 Z" fill="#0B132B"/>
        <!-- Reflexo especular no para-brisa dando brilho vítreo 3D -->
        <path d="M17 8 L28 8 L26 13 L18 13 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Teto do veículo com frisos aerodinâmicos -->
        <rect x="16" y="16" width="16" height="13" rx="2" fill="#0F172A" opacity="0.35"/>
        <!-- Vidro traseiro com curvatura -->
        <path d="M17 31 L31 31 L29.5 35 L18.5 35 Z" fill="#0B132B"/>
        <!-- Faróis de LED modernos com feixe frontal luminoso -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas traseiras em LED vermelho vítreo -->
        <rect x="15" y="40.5" width="4" height="1.5" rx="0.5" fill="#EF4444"/>
        <rect x="29" y="40.5" width="4" height="1.5" rx="0.5" fill="#EF4444"/>
      `;
  }
}

/**
 * Determina a cor canônica de status do veículo conforme o padrão estabelecido no sistema:
 * - Verde (#10B981): Em Rota (Movimento / Em Trânsito)
 * - Âmbar (#F59E0B): Parado com Ignição Ligada
 * - Azul (#0284C7): Estacionado com Ignição Desligada
 * - Vermelho (#EF4444): Alerta de Emergência / Acidente ou Bloqueio Ativo
 * - Cinza (#64748B): Desconectado / Inativo prolongado
 */
export function obterCorStatusVeiculo(
  veiculo?: {
    velocidade?: number | null;
    ignicao?: boolean | null;
    status_operacional?: string | null;
    bloqueado?: boolean | null;
    alerta_acidente?: boolean | null;
  } | null,
): string {
  if (!veiculo) return "#0284C7";

  // 1. Alerta crítico (acidente, pânico) ou bloqueio ativo: Vermelho canônico
  if (veiculo.alerta_acidente || veiculo.bloqueado || veiculo.status_operacional === "bloqueado") {
    return "#EF4444";
  }

  const velocidade = Number(veiculo.velocidade) || 0;
  const ignicao = Boolean(veiculo.ignicao);
  const statusOp = veiculo.status_operacional;

  // 2. Em rota / em trânsito:
  // - Com ignição ligada: velocidade > 3 km/h ou status em_rota / em_movimento -> Verde canônico
  // - Com ignição desligada: apenas deslocamento real (> 10 km/h, ex: reboque/guincho) -> Verde;
  //   oscilações leves de GNSS com motor desligado (<= 10 km/h) permanecem Azul (estacionado).
  const emMovimentoReal = ignicao
    ? statusOp === "em_rota" || statusOp === "em_movimento" || velocidade > 3
    : velocidade > 10;

  if (emMovimentoReal) {
    return "#10B981";
  }

  // 3. Parado com motor ligado contínuo (status operacional parado_ligado após histerese de 120s): Âmbar canônico
  if (statusOp === "parado_ligado") {
    return "#F59E0B";
  }

  // 4. Estacionado com ignição desligada: Azul canônico do sistema
  return "#0284C7";
}

/**
 * Paleta harmônica de cores para o Pino 3D Glossy (Volumétrico)
 * Suporta com fidelidade estética os 5 estados canônicos do sistema:
 * - Verde (#10B981): Em Rota (Movimento)
 * - Azul (#0284C7 / #2563EB): Estacionado com Ignição Desligada
 * - Âmbar / Laranja (#F59E0B / #F97316): Parado com Ignição Ligada
 * - Vermelho (#EF4444): Alerta / Acidente / Bloqueado
 * - Cinza Slate (#64748B): Desconectado / Inativo prolongado
 */
export interface PaletaGlossyPin {
  gradTopo: string;
  gradCentro: string;
  gradBase: string;
  flancoLuz: string;
  flancoEscuro: string;
  furoSombra: string;
  furoLuz: string;
  fundoVitrine: string;
}

export function obterPaletaGlossyPin(corHex: string = "#0284C7"): PaletaGlossyPin {
  const c = corHex.toUpperCase();
  const isGreen =
    c.includes("10B981") ||
    c.includes("059669") ||
    c.includes("16A34A") ||
    c.includes("34D399") ||
    c.includes("22C55E");
  const isBlue =
    c.includes("2563EB") ||
    c.includes("3B82F6") ||
    c.includes("1D4ED8") ||
    c.includes("60A5FA") ||
    c.includes("38BDF8") ||
    c.includes("0284C7") ||
    c.includes("0EA5E9");
  const isAmber =
    c.includes("F97316") ||
    c.includes("EA580C") ||
    c.includes("F59E0B") ||
    c.includes("D97706") ||
    c.includes("FB923C") ||
    c.includes("EAB308");
  const isGray =
    c.includes("64748B") ||
    c.includes("475569") ||
    c.includes("334155") ||
    c.includes("94A3B8") ||
    c.includes("6B7280") ||
    c.includes("71717A");

  if (isGreen) {
    return {
      gradTopo: "#34D399",
      gradCentro: "#10B981",
      gradBase: "#059669",
      flancoLuz: "#047857",
      flancoEscuro: "#064E3B",
      furoSombra: "#047857",
      furoLuz: "#10B981",
      fundoVitrine: "#FFFFFF",
    };
  }
  if (isBlue) {
    return {
      gradTopo: "#60A5FA",
      gradCentro: "#2563EB",
      gradBase: "#1D4ED8",
      flancoLuz: "#1E40AF",
      flancoEscuro: "#1E3A8A",
      furoSombra: "#1E40AF",
      furoLuz: "#2563EB",
      fundoVitrine: "#FFFFFF",
    };
  }
  if (isAmber) {
    return {
      gradTopo: "#FEF08A",
      gradCentro: "#FBBF24",
      gradBase: "#F59E0B",
      flancoLuz: "#D97706",
      flancoEscuro: "#B45309",
      furoSombra: "#D97706",
      furoLuz: "#FBBF24",
      fundoVitrine: "#FFFFFF",
    };
  }
  if (isGray) {
    return {
      gradTopo: "#94A3B8",
      gradCentro: "#64748B",
      gradBase: "#334155",
      flancoLuz: "#475569",
      flancoEscuro: "#1E293B",
      furoSombra: "#475569",
      furoLuz: "#64748B",
      fundoVitrine: "#FFFFFF",
    };
  }
  return {
    gradTopo: "#FF4D4D",
    gradCentro: "#DC2626",
    gradBase: "#991B1B",
    flancoLuz: "#B91C1C",
    flancoEscuro: "#7F1D1D",
    furoSombra: "#991B1B",
    furoLuz: "#DC2626",
    fundoVitrine: "#FFFFFF",
  };
}

/**
 * Retorna o modelo 3D isométrico/volumétrico do veículo para renderização
 * no interior da vitrine circular do Pin 3D.
 * Cada um dos 13 modelos possui detalhes tridimensionais, iluminação e sombras.
 */
export function getMiniaturaVeiculo3D(tipo: TipoVeiculo, corStatus: string = "#10B981"): string {
  switch (tipo) {
    case "suv":
      return `
        <!-- SUV 3D Encorpado de Alta Visibilidade -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25" width="3.5" height="4.5" rx="1.5" fill="#0F172A" />
        <rect x="38" y="25" width="3.5" height="4.5" rx="1.5" fill="#0F172A" />
        <circle cx="24.2" cy="27.2" r="1" fill="#E2E8F0" />
        <circle cx="39.7" cy="27.2" r="1" fill="#E2E8F0" />
        <path d="M21.5 24.5 L24 22 L39.5 22 L42 25 L41.5 27.8 L22 27.8 Z" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
        <path d="M25.5 22 L28 17.5 L38.5 17.5 L40 22 Z" fill="#0F172A" />
        <line x1="27" y1="16.5" x2="39" y2="16.5" stroke="#475569" stroke-width="1.4" stroke-linecap="round" />
        <path d="M27 21.3 L29 18.5 L33 18.5 L31.5 21.3 Z" fill="#38BDF8" opacity="0.9" />
        <path d="M34 21.3 L35 18.5 L38.5 18.5 L39.5 21.3 Z" fill="#0284C7" opacity="0.9" />
        <polygon points="21.5,24.5 23,24 23,26 21.5,26" fill="#FEF08A" />
      `;

    case "camionete":
      return `
        <!-- Camionete / Picape Cabine Dupla 3D (Silhueta Alta Visibilidade) -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25" width="3.5" height="4.5" rx="1.5" fill="#0F172A" />
        <rect x="38" y="25" width="3.5" height="4.5" rx="1.5" fill="#0F172A" />
        <circle cx="24.2" cy="27.2" r="1" fill="#E2E8F0" />
        <circle cx="39.7" cy="27.2" r="1" fill="#E2E8F0" />
        <path d="M21.5 24.5 L24 22 L34.5 22 L34.5 24.5 L42.5 24.5 L42 27.5 L22 27.5 Z" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
        <path d="M34 18.5 L36.5 24.5" stroke="#334155" stroke-width="1.6" stroke-linecap="round" />
        <path d="M25 22 L27.5 17.5 L34 17.5 L34 22 Z" fill="#0F172A" />
        <path d="M26.5 21.5 L28.5 18.5 L33 18.5 L33 21.5 Z" fill="#38BDF8" opacity="0.9" />
        <polygon points="21.5,24.5 23,24 23,26 21.5,26" fill="#FBBF24" />
        <rect x="41.5" y="24.5" width="1" height="2" rx="0.3" fill="#EF4444" />
      `;

    case "van":
      return `
        <!-- Van / Furgão Comercial 3D -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <rect x="38" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <circle cx="24.1" cy="27.5" r="1" fill="#CBD5E1" />
        <circle cx="39.6" cy="27.5" r="1" fill="#CBD5E1" />
        <path d="M21.5 25.5 L23.5 21 L26.5 17 L40.5 17 L42 19 L42 27.5 L22 27.5 Z" fill="#334155" stroke="#0F172A" stroke-width="0.8" />
        <path d="M23.8 21 L26.2 17.8 L29.5 17.8 L29.5 22.5 L23.5 22.5 Z" fill="#38BDF8" opacity="0.9" />
        <line x1="33" y1="18" x2="33" y2="27" stroke="#0F172A" stroke-width="0.8" />
        <polygon points="21.5,25.5 23,25 23,26.8 21.5,26.8" fill="#FEF08A" />
      `;

    case "ambulancia":
      return `
        <!-- Ambulância Médica de Emergência 3D -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <rect x="38" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <path d="M21.5 25.5 L23.5 21 L26.5 17.5 L40.5 17.5 L42 19.5 L42 27.5 L22 27.5 Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1" />
        <rect x="22" y="23.5" width="20" height="2" fill="#EF4444" />
        <rect x="35" y="20" width="2" height="6" rx="0.4" fill="#EF4444" />
        <rect x="33" y="22" width="6" height="2" rx="0.4" fill="#EF4444" />
        <rect x="29" y="15.5" width="6" height="2.2" rx="0.8" fill="#0F172A" />
        <rect x="29.3" y="15.8" width="2.4" height="1.6" rx="0.5" fill="#EF4444" />
        <rect x="32.3" y="15.8" width="2.4" height="1.6" rx="0.5" fill="#3B82F6" />
        <polygon points="21.5,25.5 23,25 23,26.8 21.5,26.8" fill="#FEF08A" />
      `;

    case "caminhao":
      return `
        <!-- Caminhão de Carga Pesada 3D -->
        <ellipse cx="32" cy="28.5" rx="10" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22" y="25" width="3.5" height="4.5" rx="1.2" fill="#0F172A" />
        <rect x="34" y="25" width="3.2" height="4.5" rx="1.2" fill="#0F172A" />
        <rect x="38" y="25" width="3.2" height="4.5" rx="1.2" fill="#0F172A" />
        <path d="M21 27.5 L21 19 L23 16.5 L28 16.5 L28 27.5 Z" fill="#0284C7" stroke="#0F172A" stroke-width="0.8" />
        <rect x="21.5" y="17.5" width="5.5" height="4" rx="0.8" fill="#38BDF8" opacity="0.9" />
        <rect x="29" y="16" width="13.5" height="10.5" rx="1" fill="#475569" stroke="#0F172A" stroke-width="0.8" />
        <line x1="30" y1="19.5" x2="41.5" y2="19.5" stroke="#64748B" stroke-width="0.8" />
        <line x1="30" y1="23.5" x2="41.5" y2="23.5" stroke="#64748B" stroke-width="0.8" />
        <polygon points="21,24.5 22.5,24 22.5,26 21,26" fill="#FBBF24" />
      `;

    case "onibus":
      return `
        <!-- Ônibus Panorâmico 3D -->
        <ellipse cx="32" cy="28.5" rx="10" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <rect x="38" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <path d="M21.5 26 L22.5 20 L25 17.5 L41.5 17.5 L42.5 20 L42.5 27 L22 27 Z" fill="#2563EB" stroke="#0F172A" stroke-width="0.8" />
        <rect x="23" y="19" width="4.5" height="3.5" rx="0.5" fill="#BAE6FD" />
        <rect x="28.5" y="19" width="4" height="3.5" rx="0.5" fill="#BAE6FD" />
        <rect x="33.5" y="19" width="4" height="3.5" rx="0.5" fill="#BAE6FD" />
        <rect x="38.5" y="19" width="3" height="3.5" rx="0.5" fill="#BAE6FD" />
        <polygon points="21.5,25 22.5,24.5 22.5,26.5 21.5,26.5" fill="#FEF08A" />
      `;

    case "moto":
      return `
        <!-- Motocicleta 3D de Alta Visibilidade -->
        <ellipse cx="32" cy="28.5" rx="8.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <circle cx="23.5" cy="26" r="3.5" fill="#0F172A" />
        <circle cx="23.5" cy="26" r="1.8" fill="#E2E8F0" />
        <circle cx="40.5" cy="26" r="3.5" fill="#0F172A" />
        <circle cx="40.5" cy="26" r="1.8" fill="#E2E8F0" />
        <line x1="23.5" y1="26" x2="28" y2="18.5" stroke="#334155" stroke-width="1.8" stroke-linecap="round" />
        <line x1="40.5" y1="26" x2="33" y2="24" stroke="#475569" stroke-width="1.6" stroke-linecap="round" />
        <path d="M27 20 C29 17.5, 33 17.5, 34 21 L30 23.5 Z" fill="#EF4444" stroke="#0F172A" stroke-width="0.8" />
        <path d="M33 21 C35 21, 38 21.5, 39 23 L34 23.5 Z" fill="#0F172A" />
        <line x1="26.5" y1="18" x2="29.5" y2="18" stroke="#0F172A" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="27" cy="19.5" r="1.2" fill="#FEF08A" />
      `;

    case "moto_eletrica":
      return `
        <!-- Scooter / Moto Elétrica 3D -->
        <ellipse cx="32" cy="28.5" rx="8.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <circle cx="24" cy="26.5" r="3" fill="#0F172A" />
        <circle cx="24" cy="26.5" r="1.4" fill="#06B6D4" />
        <circle cx="40" cy="26.5" r="3" fill="#0F172A" />
        <circle cx="40" cy="26.5" r="1.4" fill="#06B6D4" />
        <path d="M23.5 25 L26 19 L28 19 L28 25 L36 25 L39 21 L40.5 25 Z" fill="#0EA5E9" stroke="#0F172A" stroke-width="0.8" />
        <path d="M32.5 19.5 L30.5 23 L33 23 L31.5 26.5 L35 22.5 L32.8 22.5 Z" fill="#FFFFFF" />
        <line x1="25" y1="18.5" x2="28" y2="18.5" stroke="#0F172A" stroke-width="1.5" stroke-linecap="round" />
        <circle cx="25.5" cy="19.8" r="1.2" fill="#67E8F9" />
      `;

    case "quadriciculo":
      return `
        <!-- Quadriciclo ATV 4x4 3D -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="21" y="24" width="4" height="5.5" rx="1.5" fill="#0F172A" stroke="#334155" stroke-width="0.6" />
        <rect x="39" y="24" width="4" height="5.5" rx="1.5" fill="#0F172A" stroke="#334155" stroke-width="0.6" />
        <path d="M23 23 L26 19 L38 19 L41 23 Z" fill="#F97316" stroke="#0F172A" stroke-width="0.8" />
        <rect x="29" y="19" width="6" height="3" rx="1" fill="#0F172A" />
        <line x1="25" y1="17.5" x2="29" y2="17.5" stroke="#0F172A" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="25" cy="20.5" r="1" fill="#FEF08A" />
      `;

    case "triciclo":
      return `
        <!-- Triciclo Chopper 3D -->
        <ellipse cx="32" cy="28.5" rx="9" ry="2" fill="rgba(15,23,42,0.22)" />
        <circle cx="22.5" cy="26" r="3.2" fill="#0F172A" />
        <line x1="22.5" y1="26" x2="28" y2="18" stroke="#94A3B8" stroke-width="1.8" stroke-linecap="round" />
        <rect x="37" y="23.5" width="5" height="6" rx="1.8" fill="#0F172A" />
        <path d="M27 20 C29 18.5, 33 18.5, 34 22 L31 24.5 Z" fill="#8B5CF6" stroke="#0F172A" stroke-width="0.8" />
        <rect x="33" y="20.5" width="4" height="2.5" rx="1" fill="#0F172A" />
        <line x1="26" y1="17.5" x2="29" y2="17.5" stroke="#0F172A" stroke-width="1.5" stroke-linecap="round" />
      `;

    case "jetski":
      return `
        <!-- Jet Ski Náutico 3D sobre Ondas -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <path d="M21 26.5 L25 23 L39 23 L41.5 25.5 L38.5 28.5 L23 28.5 Z" fill="#0F172A" />
        <path d="M21 26.5 L24.5 22.5 L39 22.5 L40.5 24.5 L38.5 26.5 Z" fill="#0284C7" />
        <path d="M25 22.5 L28 19 L36 19 L37 22.5 Z" fill="#38BDF8" />
        <rect x="30" y="19.5" width="5.5" height="2.5" rx="1" fill="#0F172A" />
        <line x1="27" y1="18" x2="29" y2="18" stroke="#0F172A" stroke-width="1.4" stroke-linecap="round" />
        <path d="M20 28 Q 23 26.5 26 28 Q 29 29.5 32 28 Q 35 26.5 38 28 Q 41 29.5 44 28" fill="none" stroke="#38BDF8" stroke-width="1.2" stroke-linecap="round" />
      `;

    case "maquina":
      return `
        <!-- Máquina Pesada / Trator Industrial 3D -->
        <ellipse cx="32" cy="28.5" rx="9.5" ry="2" fill="rgba(15,23,42,0.22)" />
        <circle cx="23.5" cy="26" r="2.8" fill="#0F172A" />
        <circle cx="23.5" cy="26" r="1.3" fill="#F59E0B" />
        <circle cx="38" cy="25" r="4.2" fill="#0F172A" />
        <circle cx="38" cy="25" r="2.2" fill="#F59E0B" />
        <rect x="29" y="16.5" width="8" height="7.5" rx="1.2" fill="#0F172A" />
        <rect x="29.8" y="17.5" width="6.4" height="4.5" rx="0.8" fill="#BAE6FD" opacity="0.9" />
        <circle cx="33" cy="15.5" r="1.2" fill="#F59E0B" stroke="#B45309" stroke-width="0.5" />
        <rect x="23" y="21.5" width="7" height="5" rx="1" fill="#F59E0B" stroke="#B45309" stroke-width="0.8" />
        <line x1="26" y1="17.5" x2="26" y2="21.5" stroke="#334155" stroke-width="1.5" stroke-linecap="round" />
        <polygon points="19.5,23 22.5,22 22.5,27 19.5,27" fill="#D97706" stroke="#78350F" stroke-width="0.6" />
      `;

    case "carro":
    default:
      return `
        <!-- Carro Sedan 3D de Alta Visibilidade -->
        <ellipse cx="32" cy="28.5" rx="9" ry="2" fill="rgba(15,23,42,0.22)" />
        <rect x="22.5" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <rect x="38.3" y="25.5" width="3.2" height="4" rx="1.2" fill="#0F172A" />
        <circle cx="24.1" cy="27.5" r="1" fill="#E2E8F0" />
        <circle cx="39.9" cy="27.5" r="1" fill="#E2E8F0" />
        <path d="M21.5 25 L24.5 23 L39.5 23 L42.5 25.5 L41.5 28 L22.5 28 Z" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
        <path d="M25.5 23 L28.5 18 L36.5 18 L39 23 Z" fill="#0F172A" />
        <path d="M27 22.3 L29.5 19 L32.5 19 L30.5 22.3 Z" fill="#38BDF8" opacity="0.9" />
        <path d="M33.5 22.3 L34.5 19 L37 19 L38 22.3 Z" fill="#0284C7" opacity="0.9" />
        <polygon points="21.5,25 23,24.5 23,26.5 21.5,26.5" fill="#FEF08A" />
        <rect x="41.8" y="25.5" width="0.8" height="2" rx="0.3" fill="#EF4444" />
      `;
  }
}

/**
 * Retorna o SVG completo do Pino 3D com o tipo de veículo no interior (estilo Pin 3D Volumétrico com Vitrine).
 * Reproduz com fidelidade estética o pino de localização 3D estilizado com chanfro lateral,
 * reflexos especulares curvados de vidro/resina brilhante, parede cilíndrica interna sombreada,
 * e a miniatura tridimensional do modelo de veículo assentada no interior do anel circular.
 */
export function getGlossyPinWithVehicleSvg(
  tipo: TipoVeiculo,
  corHex: string = "#0284C7",
  id: string = "hunter-vpin",
): string {
  const paleta = obterPaletaGlossyPin(corHex);
  const miniaturaSvg = getMiniaturaVeiculo3D(tipo, corHex);

  return `
    <svg width="100%" height="100%" viewBox="0 0 64 60.5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradiente da Face Frontal 3D da Gota -->
        <linearGradient id="${id}-front" x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="45%" stop-color="${paleta.gradCentro}"/>
          <stop offset="100%" stop-color="${paleta.gradBase}"/>
        </linearGradient>

        <!-- Gradiente de Profundidade Lateral (Chanfro 3D / Extrusão) -->
        <linearGradient id="${id}-bevel-3d" x1="16" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="60%" stop-color="${paleta.flancoLuz}"/>
          <stop offset="100%" stop-color="${paleta.flancoEscuro}"/>
        </linearGradient>

        <!-- Gradiente da Parede Interna do Anel Cilíndrico 3D (Efeito Vitrine) -->
        <linearGradient id="${id}-wall-depth" x1="32" y1="8" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.furoSombra}"/>
          <stop offset="65%" stop-color="${paleta.furoSombra}"/>
          <stop offset="100%" stop-color="${paleta.furoLuz}"/>
        </linearGradient>

        <!-- Gradiente de Fundo Luminoso da Vitrine Circular (Branco Puro com relevo suave) -->
        <radialGradient id="${id}-vitrine-bg" cx="32" cy="21" r="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="80%" stop-color="#F8FAFC"/>
          <stop offset="100%" stop-color="#E2E8F0"/>
        </radialGradient>

        <!-- Brilho Especular Superior de Vidro / Resina (Arco Superior Curvo) -->
        <linearGradient id="${id}-spec-top" x1="20" y1="4" x2="44" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
          <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- 1. Ponto de Contato Sutil no Asfalto na Ponta Exata do Pino -->
      <ellipse cx="32" cy="60" rx="5.5" ry="1.2" fill="rgba(0,0,0,0.5)" />

      <!-- 2. Extrusão / Chanfro 3D Traseiro (Espessura e Volume Tridimensional) -->
      <path d="
        M 32 60.5
        C 27.5 50, 15 35, 15 22
        C 15 12.6, 22.6 5, 32 5
        C 41.4 5, 49 12.6, 49 22
        C 49 35, 36.5 50, 32 60.5
        Z
      " fill="${paleta.flancoEscuro}" opacity="0.6" transform="translate(1.5, 0)" />

      <!-- 3. Corpo Frontal Principal do Pino 3D com Abertura Anular Central -->
      <path fill-rule="evenodd" clip-rule="evenodd" d="
        M 32 60.5
        C 27.5 50, 15 35, 15 22
        C 15 12.6, 22.6 5, 32 5
        C 41.4 5, 49 12.6, 49 22
        C 49 35, 36.5 50, 32 60.5
        Z
        M 32 36
        C 39.73 36, 46 29.73, 46 22
        C 46 14.27, 39.73 8, 32 8
        C 24.27 8, 18 14.27, 18 22
        C 18 29.73, 24.27 36, 32 36
        Z
      " fill="url(#${id}-front)" stroke="url(#${id}-bevel-3d)" stroke-width="1.3" />

      <!-- 4. Parede Interna Cilíndrica do Anel com Profundidade 3D e Fundo Branco Luminoso -->
      <circle cx="32" cy="22" r="14" fill="#FFFFFF" stroke="url(#${id}-wall-depth)" stroke-width="1.3" />
      <circle cx="32" cy="22" r="13" fill="url(#${id}-vitrine-bg)" />
      <circle cx="32" cy="22" r="13" fill="none" stroke="rgba(15,23,42,0.12)" stroke-width="0.8" />

      <!-- 5. Miniatura 3D Volumétrica do Tipo de Veículo Assentada na Vitrine -->
      <g class="hunter-pin-vehicle-model">
        ${miniaturaSvg}
      </g>

      <!-- 6. Efeito Glossy / Vidro: Reflexo Especular Curvo no Topo (Arco Iluminado) -->
      <path d="
        M 21 16
        C 23.5 9.5, 27.5 6.5, 32 6.5
        C 36.5 6.5, 40.5 9.5, 43 16
        C 39.5 11.5, 36 9.5, 32 9.5
        C 28 9.5, 24.5 11.5, 21 16
        Z
      " fill="url(#${id}-spec-top)" />

      <!-- 7. Ponto de Luz Intensa (Hotspot Especular Branco Curvado) -->
      <ellipse cx="25" cy="13.5" rx="3.5" ry="2" transform="rotate(-30 25 13.5)" fill="#FFFFFF" opacity="0.85" />
    </svg>
  `;
}

/**
 * Retorna o SVG completo do Pino 3D Glossy volumétrico genérico (sem veículo)
 */
export function getGlossyPin3DSvg(corHex: string = "#EF4444", id: string = "hunter-pin"): string {
  const paleta = obterPaletaGlossyPin(corHex);

  return `
    <svg width="100%" height="100%" viewBox="0 0 64 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradiente da Face Frontal 3D Perfeitamente Simétrica -->
        <linearGradient id="${id}-front" x1="32" y1="4" x2="32" y2="57.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="45%" stop-color="${paleta.gradCentro}"/>
          <stop offset="100%" stop-color="${paleta.gradBase}"/>
        </linearGradient>

        <!-- Gradiente de Profundidade e Borda Volumétrica 3D -->
        <linearGradient id="${id}-edge-light" x1="16" y1="4" x2="48" y2="57.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="60%" stop-color="${paleta.flancoLuz}"/>
          <stop offset="100%" stop-color="${paleta.flancoEscuro}"/>
        </linearGradient>

        <!-- Gradiente da Parede Interna do Furo 3D -->
        <linearGradient id="${id}-hole-wall" x1="32" y1="13" x2="32" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.furoSombra}"/>
          <stop offset="70%" stop-color="${paleta.furoSombra}"/>
          <stop offset="100%" stop-color="${paleta.furoLuz}"/>
        </linearGradient>

        <!-- Brilho Especular Superior de Vidro / Resina (Arco Superior) -->
        <linearGradient id="${id}-spec-top" x1="20" y1="4" x2="44" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- 1. Ponto de Contato Sutil no Asfalto na Ponta Exata do Pino -->
      <ellipse cx="32" cy="57" rx="5" ry="1" fill="rgba(0,0,0,0.45)" />

      <!-- 2. Corpo Frontal Principal do Pino 3D com Furo Anular Central (100% RETO E SIMÉTRICO) -->
      <path fill-rule="evenodd" clip-rule="evenodd" d="
        M 32 57.5
        C 28 48, 16 34, 16 21
        C 16 12.16, 23.16 5, 32 5
        C 40.84 5, 48 12.16, 48 21
        C 48 34, 36 48, 32 57.5
        Z
        M 32 27
        C 35.31 27, 38 24.31, 38 21
        C 38 17.69, 35.31 15, 32 15
        C 28.69 15, 26 17.69, 26 21
        C 26 24.31, 28.69 27, 32 27
        Z
      " fill="url(#${id}-front)" stroke="url(#${id}-edge-light)" stroke-width="1.2" />

      <!-- 3. Parede Interna do Furo Cilíndrico com Profundidade 3D -->
      <circle cx="32" cy="21" r="6" fill="none" stroke="url(#${id}-hole-wall)" stroke-width="1.3" />

      <!-- 4. Efeito Glossy / Vidro: Reflexo Especular Curvo no Topo (Arco Iluminado) -->
      <path d="
        M 21 15
        C 23 9, 27 6, 32 6
        C 37 6, 41 9, 43 15
        C 40 11, 36 9, 32 9
        C 28 9, 24 11, 21 15
        Z
      " fill="url(#${id}-spec-top)" />

      <!-- 5. Ponto de Luz Intensa (Hotspot Especular Branco Curvado) -->
      <ellipse cx="25" cy="13" rx="3.5" ry="2" transform="rotate(-30 25 13)" fill="#FFFFFF" opacity="0.85" />
    </svg>
  `;
}

/**
 * Calcula o ângulo da mini-placa para alinhamento longitudinal com a via
 * Garante que a placa fique perfeitamente paralela à rua e sempre legível (sem ponta-cabeça).
 */
export function calcularAnguloPlacaVia(anguloRumo: number): number {
  let anguloPlacaVia = (((anguloRumo - 90) % 360) + 360) % 360;
  if (anguloPlacaVia > 90 && anguloPlacaVia < 270) {
    anguloPlacaVia -= 180;
  }
  return anguloPlacaVia;
}

/**
 * Gera o HTML da Mini Placa Mercosul assentada no solo da via
 * Usado com rotationAlignment: "map" e pitchAlignment: "map" no MapLibre 3D
 */
export function gerarMiniPlacaSoloHtml(params: {
  placa: string;
  anguloRumo: number;
  isSelected?: boolean;
}): string {
  const { placa, anguloRumo, isSelected } = params;
  const anguloPlacaVia = calcularAnguloPlacaVia(anguloRumo);

  return `
    <div class="mini-placa-solo-mercosul" style="
      transform: rotate(${anguloPlacaVia}deg);
      transform-origin: center center;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      background: #FFFFFF;
      border: 1.2px solid ${isSelected ? "#2563EB" : "#0F172A"};
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.65)${isSelected ? ", 0 0 10px #2563EB80" : ""};
      overflow: hidden;
      white-space: nowrap;
      font-family: monospace;
      text-align: center;
      user-select: none;
      cursor: pointer;
    ">
      <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center;">
        <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
      </div>
      <div style="color: #0F172A; font-size: 11px; font-weight: 900; padding: 1px 6px; line-height: 14px; letter-spacing: 0.2px;">
        ${placa}
      </div>
    </div>
  `;
}

/**
 * Gera o HTML do Pino 3D Glossy flutuando verticalmente no ar acima do veículo
 * Usado com rotationAlignment: "viewport" e pitchAlignment: "viewport"
 */
export function gerarPinoFlutuanteHtml(params: {
  corStatus: string;
  temAlerta?: boolean;
  isEmRota?: boolean;
  isSelected?: boolean;
  cleanId?: string;
}): string {
  const { corStatus, temAlerta, isEmRota, isSelected, cleanId = "hunter" } = params;
  const pinSvg = getGlossyPin3DSvg(corStatus, `pin-${cleanId}`);

  return `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
      ${
        temAlerta
          ? `<div style="position: absolute; width: 56px; height: 56px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>`
          : isEmRota
            ? `<div style="position: absolute; width: 50px; height: 50px; border-radius: 50%; background: ${corStatus}30; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>`
            : ""
      }

      <!-- Pino 3D Glossy em pé (100% RETO E VERTICAL) com animação suave de levitação -->
      <div class="hunter-pin-floating" style="
        position: relative;
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4))${isSelected ? ` drop-shadow(0 0 16px ${corStatus})` : ""};
      ">
        ${pinSvg}
      </div>

      <!-- Sombra oval de flutuação / levitação que pulsa suavemente no ar -->
      <div class="hunter-pin-shadow" style="
        width: 18px;
        height: 5px;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%);
        border-radius: 50%;
        margin-top: 1px;
        z-index: 5;
      "></div>
    </div>
  `;
}

export type ModoPlacaMapa = "com_placa" | "auto" | "sem_placa";

/**
 * Formata o identificador visual do veículo (placa ou chassi).
 * Para veículos sem placa (como máquinas, tratores, motos elétricas), caso a placa não esteja informada,
 * utiliza os últimos 6 dígitos/caracteres do chassi para identificação no mapa e em cards.
 */
export function formatarPlacaOuChassi(placa?: string | null, chassi?: string | null): string {
  const p = (placa || "").trim().toUpperCase();
  const c = (chassi || "").trim().toUpperCase();
  if (p && !["SEM PLACA", "SEMPLACA", "A DEFINIR"].includes(p)) {
    return p;
  }
  if (c) {
    return c.length >= 6 ? c.slice(-6) : c;
  }
  return p || "SEM PLACA";
}

/**
 * Determina se a placa Mercosul deve ser exibida no mapa:
 * - "sem_placa": nunca exibe (apenas o ícone limpo na via)
 * - "com_placa": sempre exibe acima do ícone
 * - "auto" (padrão): exibe acima do ícone apenas se houver mais de um veículo no mapa
 */
export function deveExibirPlacaNoMapa(totalVeiculos: number): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return totalVeiculos > 1;
  }
  const modo = localStorage.getItem("@hunter_modo_placa_mapa") || "auto";
  if (modo === "sem_placa") return false;
  if (modo === "com_placa") return true;
  return totalVeiculos > 1;
}

/**
 * Gera o HTML completo de marcação 3D com orientação do rumo, halo de status e placa Mercosul.
 * Quando iconeGenerico é true, renderiza o Pino 3D vertical com a ponta exatamente na rua
 * e a placa posicionada ACIMA do ícone (quando habilitada).
 */
export function gerarMarcador3DHtml(params: {
  placa: string;
  chassi?: string | null;
  tipo?: string | null;
  corStatus: string;
  anguloRumo?: number;
  isSelected?: boolean;
  temAlerta?: boolean;
  isEmRota?: boolean;
  iconeGenerico?: boolean;
  mostrarPlaca?: boolean;
}): string {
  const {
    placa,
    chassi,
    tipo,
    corStatus,
    anguloRumo = 0,
    isSelected,
    temAlerta,
    isEmRota,
    iconeGenerico,
    mostrarPlaca,
  } = params;
  const tipoNormalizado = normalizarTipoVeiculo(tipo);
  const placaFormatada = formatarPlacaOuChassi(placa, chassi);
  const cleanId =
    (mostrarPlaca === false ? "marker" : placaFormatada.replace(/[^a-zA-Z0-9]/g, "")) || "marker";
  const exibirPlaca = mostrarPlaca !== false;

  if (iconeGenerico) {
    const pinSvg = getGlossyPin3DSvg(corStatus, `pin-${cleanId}`);

    return `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; user-select: none;">
        ${
          temAlerta
            ? `<div style="position: absolute; bottom: 0px; left: 50%; margin-left: -25px; width: 50px; height: 50px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
            : isEmRota
              ? `<div style="position: absolute; bottom: 0px; left: 50%; margin-left: -23px; width: 46px; height: 46px; border-radius: 50%; background: ${corStatus}30; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
              : ""
        }

        <!-- Indicador direcional suave na via sob o pino (quando em movimento) -->
        ${
          isEmRota
            ? `<div class="hunter-generico-seta" style="
                position: absolute;
                bottom: 0px;
                left: 50%;
                margin-left: -10px;
                width: 20px;
                height: 20px;
                transform: rotate(${anguloRumo}deg);
                transform-origin: center center;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                z-index: 5;
              ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L17 14L12 11L7 14L12 2Z" fill="${corStatus}" opacity="0.9" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>
                </svg>
              </div>`
            : ""
        }

        <!-- 1. Placa Mercosul ACIMA do Ícone (apenas se mais de 1 veículo ou com placa ativa) -->
        ${
          exibirPlaca
            ? `
          <div class="mini-placa-mercosul" style="
            height: 18px;
            margin-bottom: 2px;
            box-sizing: border-box;
            background: #FFFFFF;
            border: 1.2px solid ${isSelected ? "#2563EB" : "#0F172A"};
            border-radius: 3.5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.35)${isSelected ? ", 0 0 8px #2563EB80" : ""};
            overflow: hidden;
            white-space: nowrap;
            font-family: monospace;
            text-align: center;
            pointer-events: none;
            z-index: 20;
          ">
            <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center; padding: 0 4px;">
              <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
            </div>
            <div style="color: #0F172A; font-size: 10px; font-weight: 900; padding: 0 5.5px; line-height: 12px; letter-spacing: 0.2px;">
              ${placaFormatada}
            </div>
          </div>
        `
            : ""
        }

        <!-- 2. Pino 3D Glossy em pé (100% RETO E VERTICAL) sem flutuação vertical artificial -->
        <div class="hunter-3d-pin-standing" style="
          position: relative;
          width: 44px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35))${isSelected ? ` drop-shadow(0 0 12px ${corStatus})` : ""};
        ">
          ${pinSvg}
        </div>

        <!-- 3. Sombra de contato no solo exatamente sob a ponta do pino (fora do fluxo para 0px de erro) -->
        <div class="hunter-pin-shadow-fixed" style="
          position: absolute;
          bottom: 0px;
          left: 50%;
          margin-left: -7px;
          width: 14px;
          height: 4px;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 5;
        "></div>
      </div>
    `;
  }

  // Novo padrão: Pino 3D com o Tipo de Veículo no Interior da Vitrine
  const vPinSvg = getGlossyPinWithVehicleSvg(tipoNormalizado, corStatus, `vpin-${cleanId}`);

  return `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; user-select: none;">
      ${
        temAlerta
          ? `<div style="position: absolute; bottom: 0px; left: 50%; margin-left: -27px; width: 54px; height: 54px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
          : isEmRota
            ? `<div style="position: absolute; bottom: 0px; left: 50%; margin-left: -25px; width: 50px; height: 50px; border-radius: 50%; background: ${corStatus}30; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
            : ""
      }

      <!-- Indicador direcional suave na via sob o pino com orientação do rumo -->
      <div class="vehicle-via-aligned hunter-generico-seta" style="
        position: absolute;
        bottom: 0px;
        left: 50%;
        margin-left: -12px;
        width: 24px;
        height: 24px;
        transform: rotate(${anguloRumo}deg);
        transform-origin: center center;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
        z-index: 5;
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L17 14L12 11L7 14L12 2Z" fill="${corStatus}" opacity="0.95" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>
        </svg>
      </div>

      <!-- 1. Placa Mercosul ACIMA do Pino (apenas se mais de 1 veículo ou com placa ativa) -->
      ${
        exibirPlaca
          ? `
        <div class="mini-placa-mercosul" style="
          height: 18px;
          margin-bottom: 2px;
          box-sizing: border-box;
          background: #FFFFFF;
          border: 1.2px solid ${isSelected ? "#2563EB" : "#0F172A"};
          border-radius: 3.5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.35)${isSelected ? ", 0 0 8px #2563EB80" : ""};
          overflow: hidden;
          white-space: nowrap;
          font-family: monospace;
          text-align: center;
          pointer-events: none;
          z-index: 20;
        ">
          <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center; padding: 0 4px;">
            <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
          </div>
          <div style="color: #0F172A; font-size: 10px; font-weight: 900; padding: 0 5.5px; line-height: 12px; letter-spacing: 0.2px;">
            ${placaFormatada}
          </div>
        </div>
      `
          : ""
      }

      <!-- 2. Pino 3D Glossy com Veículo no Interior em pé na via (sem flutuação vertical) -->
      <div class="hunter-3d-pin-standing vehicle-3d-symbol" style="
        position: relative;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.38))${isSelected ? ` drop-shadow(0 0 14px ${corStatus})` : ""};
      ">
        ${vPinSvg}
      </div>

      <!-- 3. Sombra de contato no solo exatamente sob a ponta do pino (fora do fluxo para 0px de erro) -->
      <div class="hunter-pin-shadow-fixed" style="
        position: absolute;
        bottom: 0px;
        left: 50%;
        margin-left: -8px;
        width: 16px;
        height: 4px;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%);
        border-radius: 50%;
        pointer-events: none;
        z-index: 5;
      "></div>
    </div>
  `;
}
