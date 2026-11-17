'use client';

import { Suspense } from 'react';
import { KioscoApp } from '@/components/hrm/kiosco/KioscoApp';

/**
 * GO Admin Kiosco (Figma 20.29; plan de Marcación M1), fuera del shell de /app y
 * sin sesión de usuario: la tablet o el computador se autentican con su propia
 * clave contra `/api/hrm/kiosco/**`. `?modo=lector` es el lector de carnés de
 * GO Admin Escritorio (sin QR en pantalla).
 */
export default function KioscoPage() {
  return (
    <Suspense fallback={null}>
      <KioscoApp />
    </Suspense>
  );
}
