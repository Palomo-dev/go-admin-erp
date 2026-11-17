import { Suspense } from 'react';
import { MarcacionPage } from '@/components/hrm/marcacion/MarcacionPage';

/** Recursos humanos › Marcación: en vivo, métodos por sede y dispositivos (Figma 20.26–20.28). */
export default function Page() {
  return (
    <Suspense>
      <MarcacionPage />
    </Suspense>
  );
}
