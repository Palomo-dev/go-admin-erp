import { Suspense } from 'react';
import { MarcarTurno } from '@/components/marcar/MarcarTurno';

/**
 * «Marcar turno» (Figma 20.9 y 20.30). Marca por `POST /api/hrm/marcacion`: la
 * hora, el QR, la etiqueta NFC y la ubicación los valida el servidor; el
 * navegador no ve el token. `MarcarTurno` lee `?metodo=` y `?nfc=` de la URL,
 * por eso va dentro de `Suspense` (Next 15 lo exige para `useSearchParams`).
 */
export default function MarcarPage() {
  return (
    <Suspense fallback={null}>
      <MarcarTurno />
    </Suspense>
  );
}
