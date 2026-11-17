'use client';

import { Suspense } from 'react';
import { LetreroAsistencia } from '@/components/hrm/marcacion/metodos/LetreroAsistencia';

/**
 * Letrero de asistencia para imprimir (Figma 20.27.10), fuera del shell de /app.
 * Se abre desde Marcación › Métodos por sede con `?sede=<id>`; los datos los
 * lee de las rutas del servidor con la sesión del usuario.
 */
export default function LetreroPage() {
  return (
    <Suspense fallback={null}>
      <LetreroAsistencia />
    </Suspense>
  );
}
