import React from "react";
import {
  getGlossyPinWithVehicleSvg,
  getGlossyPin3DSvg,
  normalizarTipoVeiculo,
} from "../utils/vehicle3dIcons";

export interface Vehicle3DGraphicProps {
  tipo?: string | null;
  corStatus?: string;
  size?: number;
  rumo?: number;
  className?: string;
  iconeGenerico?: boolean;
}

/**
 * Componente React para renderizar o Pino 3D com o veículo no interior ou o pino clássico
 */
export const Vehicle3DGraphic: React.FC<Vehicle3DGraphicProps> = ({
  tipo = "carro",
  corStatus = "#10B981",
  size = 40,
  rumo = 0,
  className = "",
  iconeGenerico,
}) => {
  const [useGenerico, setUseGenerico] = React.useState(iconeGenerico || false);
  const idRef = React.useRef(`prev-${Math.random().toString(36).slice(2, 7)}`);

  React.useEffect(() => {
    if (iconeGenerico !== undefined) {
      setUseGenerico(iconeGenerico);
      return;
    }
    const update = () => {
      const stored = localStorage.getItem("@hunter_icone_mapa_generico");
      setUseGenerico(stored === "true");
    };
    update();
    window.addEventListener("hunter_preferencia_mapa_alterada", update);
    return () => window.removeEventListener("hunter_preferencia_mapa_alterada", update);
  }, [iconeGenerico]);

  const tipoNormalizado = normalizarTipoVeiculo(tipo);

  if (useGenerico) {
    const pinHtml = getGlossyPin3DSvg(corStatus, idRef.current);
    return (
      <div
        className={`inline-flex items-center justify-center relative select-none ${className}`}
        style={{
          width: size,
          height: size,
          filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.35))",
        }}
        dangerouslySetInnerHTML={{ __html: pinHtml }}
      />
    );
  }

  const pinWithVehicleHtml = getGlossyPinWithVehicleSvg(tipoNormalizado, corStatus, idRef.current);

  return (
    <div
      className={`inline-flex items-center justify-center relative select-none ${className}`}
      style={{
        width: size,
        height: size,
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.38))",
      }}
      dangerouslySetInnerHTML={{ __html: pinWithVehicleHtml }}
    />
  );
};
