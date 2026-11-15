'use client';

/**
 * Detalle de un área (Figma `95-hrm-01-02`): panel lateral en escritorio y
 * hoja inferior en el celular (`HojaDetalle` del kit). Responsable, área
 * superior, personas, áreas hijas, plazas por sede y cargos del área.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Pencil, Users } from 'lucide-react';
import { FilaDato, ListaDatos, clasesBoton } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import type { AreaArbol } from '@/lib/hrm/estructura/logica';
import type { AreaApi, SedeOpcion } from '@/lib/hrm/estructura/tipos';
import { BadgePlaza, RUTA_AREAS, RUTA_HRM } from '../comun';

interface Props {
  nodo: AreaArbol | null;
  areas: readonly AreaApi[];
  sedes: readonly SedeOpcion[];
  puedeEditar: boolean;
  onCerrar: () => void;
}

export function DetalleArea({ nodo, areas, sedes, puedeEditar, onCerrar }: Props) {
  const t = useTranslations('hrmEstructura.areas.detalle');
  const ta = useTranslations('hrmEstructura.areas');
  const a = nodo?.area ?? null;
  const padre = a?.parent_id ? areas.find((x) => x.id === a.parent_id) : null;
  const nombreSede = (id: number) => sedes.find((s) => s.id === id)?.nombre ?? t('sede', { id });
  const subtitulo = a
    ? [padre ? t('areaDe', { area: padre.nombre }) : t('areaPrincipal'), a.centro_costo ? t('centroCostos', { codigo: a.centro_costo.codigo }) : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <HojaDetalle
      abierto={!!a}
      onAbiertoChange={(v: boolean) => !v && onCerrar()}
      titulo={a?.nombre ?? ''}
      subtitulo={subtitulo}
      ancho={480}
      pie={
        a ? (
          <div className="flex w-full gap-3">
            <Link
              href={`${RUTA_HRM}?area=${encodeURIComponent(a.id)}`}
              className={clasesBoton({ variante: 'secundario', className: 'flex-1' })}
            >
              <Users aria-hidden className="size-4" strokeWidth={1.5} />
              {t('verEmpleados', { n: nodo?.personasTotal ?? 0 })}
            </Link>
            {puedeEditar && (
              <Link href={`${RUTA_AREAS}/${a.id}/editar`} className={clasesBoton({ variante: 'primario', className: 'flex-1' })}>
                <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
                {t('editar')}
              </Link>
            )}
          </div>
        ) : undefined
      }
    >
      {a && nodo && (
        <div className="flex flex-col gap-5">
          <ListaDatos>
            <FilaDato etiqueta={t('responsable')} valor={a.responsable?.nombre ?? t('sinResponsable')} />
            <FilaDato etiqueta={t('areaSuperior')} valor={padre?.nombre ?? t('ninguna')} />
            <FilaDato etiqueta={t('personas')} valor={nodo.personasTotal} />
            <FilaDato
              etiqueta={t('areasHijas')}
              valor={nodo.hijos.length ? nodo.hijos.map((h) => h.area.nombre).join(', ') : t('ninguna')}
            />
          </ListaDatos>

          <section aria-labelledby="detalle-area-plazas" className="flex flex-col gap-2">
            <h3 id="detalle-area-plazas" className="text-xs font-medium text-fg-muted">
              {t('plazasPorSede')}
            </h3>
            {a.plazas.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('sinPlazas')}</p>
            ) : (
              a.plazas.map((p) => (
                <div key={p.sede_id} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{nombreSede(p.sede_id)}</p>
                    <p className="text-xs text-fg-secondary">
                      {p.aprobadas ? t('ocupadasDe', { ocupadas: p.ocupadas, aprobadas: p.aprobadas }) : ta('personas', { n: p.ocupadas })}
                    </p>
                  </div>
                  <BadgePlaza aprobadas={p.aprobadas} ocupadas={p.ocupadas} />
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="detalle-area-cargos" className="flex flex-col gap-2">
            <h3 id="detalle-area-cargos" className="text-xs font-medium text-fg-muted">
              {t('cargos')}
            </h3>
            {a.cargos.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('sinCargos')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {a.cargos.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/app/hrm/cargos/${c.id}`}
                      className="inline-flex rounded-full bg-subtle px-3 py-1 text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {`${c.nombre} · ${c.personas}`}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {a.descripcion && <p className="text-sm text-fg-secondary">{a.descripcion}</p>}
        </div>
      )}
    </HojaDetalle>
  );
}
