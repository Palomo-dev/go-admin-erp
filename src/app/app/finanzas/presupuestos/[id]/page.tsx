'use client';

import { useParams } from 'next/navigation';
import { EditorPresupuestoPage } from '@/components/finanzas/presupuestos/EditorPresupuestoPage';

export default function Page() {
  const params = useParams();
  const id = (params?.id as string | undefined) ?? '';
  return <EditorPresupuestoPage key={id} id={id} />;
}
