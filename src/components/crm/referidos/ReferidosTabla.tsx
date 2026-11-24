'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, UserRound, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationCompact } from '@/components/kit/PaginationCompact';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import type { AccionFila } from '@/components/kit/acciones';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { ReferralStatusBadge } from './referralMeta';
import { esMonetaria, puedeRechazar, type CampoOrden, type Orden } from './referidosLogica';
import { SiguientePasoBoton, type AccionPaso } from './SiguientePasoBoton';
import { useReferidosFormato } from './useReferidosFormato';

export interface ReferidosTablaProps {
  filas: readonly ReferralView[];
  cargando: boolean;
  ocupadoId: string | null;
  orden: Orden;
  onOrden: (campo: CampoOrden) => void;
  onPaso: (r: ReferralView, paso: AccionPaso) => void;
  onRechazar: (r: ReferralView) => void;
  pagina: number;
  tamano: number;
  total: number;
  onPagina: (p: number) => void;
}

const TH = 'h-11 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-secondary';
const TD = 'px-3 py-3 align-middle';

/** Celda «Recompensa»: valor y su situación (aún no convertido, pendiente, pagada, no aplica). */
export function useCeldaRecompensa() {
  const { t, dinero, porcentaje, valor, fecha } = useReferidosFormato();
  return (r: ReferralView): { valor: string; detalle: string } => {
    const p = r.program;
    if (r.status === 'rejected' || (r.status === 'converted' && !p)) return { valor: '—', detalle: t('recompensa.noAplica') };
    if (r.status !== 'converted' || !p) return { valor: '—', detalle: t('recompensa.noConvertido') };
    const v = p.reward_type === 'discount' ? porcentaje(p.reward_amount) : esMonetaria(p) ? dinero(p.reward_amount) : valor(p);
    return { valor: v, detalle: r.reward_paid ? t('recompensa.pagadaEl', { fecha: fecha(r.reward_paid_at) }) : t('recompensa.pendientePago') };
  };
}

function Encabezado({ campo, etiqueta, orden, onOrden }: { campo: CampoOrden; etiqueta: string; orden: Orden; onOrden: (c: CampoOrden) => void }) {
  const { t } = useReferidosFormato();
  const activo = orden.campo === campo;
  const Icono = !activo ? ArrowUpDown : orden.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={TH} aria-sort={activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onOrden(campo)} aria-label={t('tabla.ordenar', { columna: etiqueta })} className="inline-flex w-full items-center justify-between gap-2 rounded hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {etiqueta}
        <Icono aria-hidden="true" className="size-3.5 text-fg-muted" strokeWidth={1.5} />
      </button>
    </th>
  );
}

/**
 * Tabla de escritorio de Referidos (Figma 1298:768716; fila 1298:768687):
 * Referido · Referido por · Programa · Estado · Recompensa · Registrado ·
 * Siguiente paso, con «Rechazar» en el menú «⋯» y paginación «Ir a».
 */
export function ReferidosTabla(p: ReferidosTablaProps) {
  const { t, fecha, recompensa } = useReferidosFormato();
  const celdaRecompensa = useCeldaRecompensa();
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse" aria-busy={p.cargando || undefined}>
          <thead>
            <tr className="border-b border-line bg-subtle">
              <Encabezado campo="referido" etiqueta={t('tabla.referido')} orden={p.orden} onOrden={p.onOrden} />
              <th scope="col" className={TH}>{t('tabla.referidoPor')}</th>
              <th scope="col" className={TH}>{t('tabla.programa')}</th>
              <th scope="col" className={TH}>{t('tabla.estado')}</th>
              <th scope="col" className={TH}>{t('tabla.recompensa')}</th>
              <Encabezado campo="registrado" etiqueta={t('tabla.registrado')} orden={p.orden} onOrden={p.onOrden} />
              <th scope="col" className={TH}>{t('tabla.siguiente')}</th>
              <th scope="col" className="w-12 px-2"><span className="sr-only">{t('tabla.acciones')}</span></th>
            </tr>
          </thead>
          <tbody>
            {p.cargando && p.filas.length === 0
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {[40, 32, 36, 20, 24, 16, 32].map((w, j) => (
                      <td key={j} className={TD}><Skeleton className="h-4" style={{ width: `${w * 4}px`, maxWidth: '100%' }} /></td>
                    ))}
                    <td />
                  </tr>
                ))
              : p.filas.map((r) => {
                  const rec = celdaRecompensa(r);
                  const contacto = r.referred_email || r.referred_phone;
                  const menu: AccionFila[] = [
                    ...(r.referrer ? [{ id: 'referidor', etiqueta: t('menu.verReferidor'), icono: UserRound, onSelect: () => router.push(`/app/crm/clientes/${r.referrer!.id}`) }] : []),
                    ...(puedeRechazar(r) ? [{ id: 'rechazar', etiqueta: t('menu.rechazar'), icono: XCircle, destructiva: true, onSelect: () => p.onRechazar(r) }] : []),
                  ];
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-hover/40">
                      <td className={TD}>
                        <p className="max-w-[220px] truncate text-sm font-medium text-fg">{r.referred_name}</p>
                        {contacto && <p className="max-w-[220px] truncate text-xs text-fg-secondary">{contacto}</p>}
                      </td>
                      <td className={TD}>
                        {r.referrer ? (
                          <Link href={`/app/crm/clientes/${r.referrer.id}`} className="text-sm text-fg underline-offset-2 hover:underline">
                            {r.referrer.full_name ?? t('sinNombre')}
                          </Link>
                        ) : (
                          <span className="text-sm text-fg-muted">{t('sinNombre')}</span>
                        )}
                      </td>
                      <td className={TD}>
                        <p className="text-sm text-fg">{r.program?.name ?? t('programa.sin')}</p>
                        <p className="text-xs text-fg-secondary">{r.program ? recompensa(r.program) : t('programa.sinRecompensa')}</p>
                      </td>
                      <td className={TD}><ReferralStatusBadge status={r.status} /></td>
                      <td className={TD}>
                        <p className="text-sm tabular-nums text-fg">{rec.valor}</p>
                        <p className="text-xs text-fg-secondary">{rec.detalle}</p>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-sm text-fg`}>{fecha(r.created_at)}</td>
                      <td className={TD}><SiguientePasoBoton referido={r} ocupado={p.ocupadoId === r.id} onPaso={p.onPaso} /></td>
                      <td className="px-2 text-right">{menu.length > 0 && <RowActionsMenu acciones={menu} titulo={t('menu.titulo', { nombre: r.referred_name })} />}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {p.total > 0 && (
        <PaginationCompact pagina={p.pagina} tamano={p.tamano} total={p.total} onPaginaChange={p.onPagina} cargando={p.cargando} className="border-t border-line px-4 py-2" />
      )}
    </div>
  );
}
