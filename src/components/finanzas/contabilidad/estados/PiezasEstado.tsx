'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, type LucideIcon } from 'lucide-react';
import { CampoFecha, EmptyState, PageHeader, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import type { EstadoCarga } from './clienteEstados';

/** Importe de un estado: negativo entre paréntesis, como en Figma. */
export function useCifra(formatear: (valor: number) => string) {
  return (valor: number | null | undefined): string => {
    if (valor === null || valor === undefined) return '—';
    return valor < 0 ? `(${formatear(Math.abs(valor))})` : formatear(valor);
  };
}

export function PaginaInforme({
  titulo,
  subtitulo,
  migas,
  icono,
  acciones,
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  migas: string;
  icono: LucideIcon;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('estadosFinancieros.comun');
  return (
    <div className="min-h-screen space-y-4 bg-subtle p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        icono={icono}
        acciones={acciones}
        migas={[
          { etiqueta: t('finanzas'), href: '/app/finanzas' },
          { etiqueta: t('informes'), href: '/app/finanzas/contabilidad' },
          { etiqueta: migas },
        ]}
      />
      {children}
    </div>
  );
}

export function FiltrosPeriodo({
  desde,
  hasta,
  hoy,
  onDesde,
  onHasta,
  comparar,
  onComparar,
  onConsultar,
  cargando,
  children,
}: {
  desde: string;
  hasta: string;
  hoy: string;
  onDesde: (dia: string) => void;
  onHasta: (dia: string) => void;
  comparar?: boolean;
  onComparar?: (valor: boolean) => void;
  onConsultar?: () => void;
  cargando?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('estadosFinancieros.comun');
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
      <label className="block min-w-40 space-y-1 text-xs text-fg-secondary">
        <span>{t('desde')}</span>
        <CampoFecha valor={desde} onValorChange={onDesde} max={hasta || undefined} hoy={hoy} limpiable={false} />
      </label>
      <label className="block min-w-40 space-y-1 text-xs text-fg-secondary">
        <span>{t('hasta')}</span>
        <CampoFecha valor={hasta} onValorChange={onHasta} min={desde || undefined} hoy={hoy} limpiable={false} />
      </label>
      {children}
      {onComparar && (
        <label className="flex h-10 items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={!!comparar} onChange={(e) => onComparar(e.target.checked)} />
          {t('anioAnterior')}
        </label>
      )}
      {onConsultar && (
        <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={onConsultar} disabled={cargando || !desde || !hasta}>
          {t('consultar')}
        </button>
      )}
    </div>
  );
}

/** Cargando, error, sin permiso y alcance. `listo` deja pasar el contenido. */
export function CuerpoInforme({
  estado,
  onReintentar,
  children,
}: {
  estado: EstadoCarga;
  onReintentar: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('estadosFinancieros.comun');
  if (estado === 'cargando') {
    return (
      <div className="space-y-2 rounded-lg border border-line bg-surface p-4" aria-busy>
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }
  if (estado === 'sinPermiso') return <EmptyState variante="forbidden" titulo={t('sinPermiso')} descripcion={t('sinPermisoDetalle')} />;
  if (estado === 'alcance') return <EmptyState variante="forbidden" titulo={t('alcance')} descripcion={t('alcanceDetalle')} />;
  if (estado === 'error') return <EmptyState variante="error" titulo={t('error')} onReintentar={onReintentar} />;
  return <>{children}</>;
}

/** Banda inferior de cuadre (Figma: «Cuadra con bancos y caja»). */
export function BandaCuadre({ cuadra, titulo, detalle }: { cuadra: boolean; titulo: string; detalle: string }) {
  const Icono = cuadra ? CircleCheck : CircleAlert;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        cuadra ? 'border-line-success bg-success-subtle text-success-text' : 'border-line-danger bg-danger-subtle text-danger-text',
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">{titulo}</p>
        <p>{detalle}</p>
      </div>
    </div>
  );
}

export function Tabla({ encabezados, etiqueta, children }: { encabezados: ReactNode[]; etiqueta: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm" aria-label={etiqueta}>
        <thead>
          <tr className="border-b border-line text-xs text-fg-secondary">
            {encabezados.map((e, i) => (
              <th key={i} scope="col" className={cn('px-4 py-3 font-medium', i === 0 ? 'text-left' : 'text-right')}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function FilaTitulo({ columnas, children }: { columnas: number; children: ReactNode }) {
  return (
    <tr className="border-b border-line bg-subtle">
      <th scope="colgroup" colSpan={columnas} className="px-4 py-2 text-left text-xs font-semibold text-fg-secondary">{children}</th>
    </tr>
  );
}

export function Fila({
  celdas,
  fuerte,
  sangria,
}: {
  celdas: ReactNode[];
  fuerte?: boolean;
  sangria?: boolean;
}) {
  return (
    <tr className={cn('border-b border-line last:border-b-0', fuerte && 'bg-subtle font-semibold')}>
      {celdas.map((c, i) => (
        <td key={i} className={cn('px-4 py-2 text-fg', i === 0 ? cn('text-left', sangria && 'pl-8') : 'text-right tabular-nums')}>{c}</td>
      ))}
    </tr>
  );
}
