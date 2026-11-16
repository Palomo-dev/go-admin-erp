import { MarcarTurno } from '@/components/marcar/MarcarTurno';

/**
 * «Marcar turno» (Figma 20.9). Marca por `POST /api/hrm/marcacion`: la hora,
 * el QR y la ubicación los valida el servidor; el navegador no ve el token.
 */
export default function MarcarPage() {
  return <MarcarTurno />;
}
