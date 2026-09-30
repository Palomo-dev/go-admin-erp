'use client';

/**
 * «Primeros pasos» y «Todavía no hay movimientos» (Figma 445:137617 escritorio,
 * 448:205616 móvil — «Inicio — vacío (organización nueva)»).
 *
 * Anotación §C.4: el onboarding deja de ser una franja (`OnboardingBanner`,
 * que se pintaba encima de todo, solo los 3 primeros días y con estilos fuera
 * del manual) y pasa a ser el contenido de «Hoy» mientras no haya datos. Los
 * pasos y su estado salen de `GET /api/inicio/primeros-pasos`; «Ir» solo
 * aparece si la persona ve esa página en su menú. En móvil se listan solo los
 * pendientes, como en el diseño.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Package, Plus, Upload } from 'lucide-react';
import { EmptyState, StatusBadge, clasesBoton } from '@/components/kit';
import { porcentajePasos, type PrimerosPasos as DatosPasos } from '@/lib/dashboard/primerosPasos';
import { cn } from '@/utils/Utils';

export function PrimerosPasos({ datos, onOcultar }: { datos: DatosPasos; onOcultar: () => void }) {
  const t = useTranslations('home.primerosPasos');
  const total = datos.pasos.length;
  return (
    <section aria-labelledby="inicio-pasos-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inicio-pasos-titulo" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        <StatusBadge
          estado="progreso"
          tono="marca"
          apariencia="suave"
          etiqueta={t('progreso', { hechos: datos.hechos, total, pct: porcentajePasos(datos) })}
        />
        <span className="flex-1" />
        <button type="button" onClick={onOcultar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}>
          {t('ocultar')}
        </button>
      </div>
      <p className="text-[13px] leading-[18px] text-fg-secondary">{t('descripcion')}</p>
      <ul className="flex flex-col gap-1.5">
        {datos.pasos.map((p) => (
          <li key={p.id} className={cn('flex min-h-8 items-center gap-2.5 py-1.5', p.hecho && 'max-lg:hidden')} data-paso={p.id}>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[18px] shrink-0 items-center justify-center rounded',
                p.hecho ? 'bg-brand-action text-fg-on-brand' : 'border border-line-strong bg-surface',
              )}
            >
              {p.hecho && <Check className="size-3" strokeWidth={2} />}
            </span>
            <span className="flex-1 text-sm leading-5 text-fg">
              {t(`pasos.${p.id}`)}
              <span className="sr-only"> · {t(p.hecho ? 'hecho' : 'pendiente')}</span>
            </span>
            {p.hecho ? (
              <span aria-hidden="true" className="text-[13px] leading-[18px] text-success-text">
                {t('hecho')}
              </span>
            ) : p.href ? (
              <Link href={p.href} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} aria-label={t('irA', { paso: t(`pasos.${p.id}`) })}>
                {t('ir')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Todavía no hay movimientos» en lugar de ventas y actividad (Figma 448:73622). */
export function SinMovimientos({ hrefProductos, hrefPos, className }: { hrefProductos: string | null; hrefPos: string | null; className?: string }) {
  const t = useTranslations('home.primerosPasos');
  return (
    <EmptyState
      icono={Package}
      titulo={t('sinMovimientosTitulo')}
      descripcion={t('sinMovimientosDesc')}
      accionSecundaria={hrefProductos ? { etiqueta: t('agregarProductos'), href: hrefProductos, icono: Upload } : undefined}
      accion={hrefPos ? { etiqueta: t('abrirPos'), href: hrefPos, icono: Plus } : undefined}
      className={className}
    />
  );
}
