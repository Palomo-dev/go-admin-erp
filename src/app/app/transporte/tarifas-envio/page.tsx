'use client';

/**
 * /app/transporte/tarifas-envio — Tarifas de envío. El cuerpo vive en
 * `TarifasEnvio` (src/components/transporte/tarifas-envio), el MISMO componente
 * que monta Sitio web › Ventas en línea › Envíos: cambiarlo aquí lo cambia allá.
 */
import { TarifasEnvio } from '@/components/transporte/tarifas-envio';

export default function TarifasEnvioPage() {
  return <TarifasEnvio conCabecera />;
}
