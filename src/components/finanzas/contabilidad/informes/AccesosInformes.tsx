'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { IDS_BORRADORES_TRIBUTARIOS, INFORMES_CONTABLES } from './catalogo';

export function AccesosInformes({ desdeReportes = false }: { desdeReportes?: boolean }) {
  const idsTributarios = new Set<string>([...IDS_BORRADORES_TRIBUTARIOS, 'retenciones-proveedores']);
  const idsTanda3 = new Set(['conciliacion-fiscal', 'informe-gestion', 'registro-accionistas', 'pila']);
  const grupos = [
    { titulo: 'Estados financieros y libros contables', descripcion: 'Comparativo del mismo periodo del año anterior · pesos enteros · PDF y Excel', informes: INFORMES_CONTABLES.filter((informe) => !idsTributarios.has(informe.id)) },
    { titulo: 'Borradores tributarios y certificados', descripcion: 'Precalculados para revisión del contador antes de presentarlos.', informes: INFORMES_CONTABLES.filter((informe) => idsTributarios.has(informe.id) && !idsTanda3.has(informe.id)) },
    { titulo: 'Conciliación fiscal, gestión y registros', descripcion: 'Información preparada con las fuentes y parámetros revisados de la organización.', informes: INFORMES_CONTABLES.filter((informe) => idsTanda3.has(informe.id)) },
  ];
  return <div className="flex flex-col gap-4">{grupos.map((grupo) => <Tarjeta key={grupo.titulo} titulo={grupo.titulo} icono={BookOpen} descripcion={grupo.descripcion}>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {grupo.informes.map((informe) => <Link
        key={informe.id}
        href={desdeReportes ? `/app/reportes/contabilidad/${informe.id}` : `/app/finanzas/contabilidad/informes/${informe.id}`}
        className="rounded-lg border border-line p-3 text-sm transition-colors hover:border-line-brand hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      ><span className="block font-medium text-link">{informe.titulo}</span><span className="mt-1 block text-xs text-fg-secondary">{informe.descripcion}</span></Link>)}
    </div>
  </Tarjeta>)}</div>;
}
