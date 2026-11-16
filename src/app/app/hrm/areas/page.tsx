import { Suspense } from 'react';
import { AreasPage } from '@/components/hrm/estructura/areas/AreasPage';

/** Recursos humanos › Áreas (Figma 20.1). Antes «Departamentos»: las tablas siguen siendo `departments`. */
export default function Page() {
  return (
    <Suspense>
      <AreasPage />
    </Suspense>
  );
}
