'use client';

import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/kit';
import { esInformeContable } from '@/components/finanzas/contabilidad/informes/catalogo';
import { InformeContablePage } from '@/components/finanzas/contabilidad/informes/InformeContablePage';

export default function Page() {
  const params = useParams();
  const informe = String(params?.informe ?? '');
  if (!esInformeContable(informe)) return <EmptyState variante="search" titulo="Informe no encontrado" accion={{ etiqueta: 'Volver a Contabilidad', href: '/app/finanzas/contabilidad' }} />;
  return <InformeContablePage informe={informe} />;
}
