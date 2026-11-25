'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { TONO_BANDA, type AccionSalud, type FilaSalud } from './saludLogica';
import { ICONO_ACCION, useTextosSalud } from './useTextosSalud';

/**
 * «Móvil — clientes en riesgo» (Figma 1424:841631): tarjeta con el nombre,
 * «puntaje · banda», el porqué en una línea y «$ X en 12 meses» con la acción
 * sugerida. Tocar la tarjeta abre el detalle.
 */
export function SaludListaMovil({ filas, atenuada, onAccion }: { filas: readonly FilaSalud[]; atenuada?: boolean; onAccion: (accion: AccionSalud, fila: FilaSalud) => void }) {
  const { t, formatear, textoMotivos } = useTextosSalud();
  return (
    <ul className={cn('flex flex-col gap-2', atenuada && 'opacity-60')} aria-label={t('tabla.titulo')}>
      {filas.map((f) => {
        const Icono = f.accion ? ICONO_ACCION[f.accion] : Eye;
        return (
          <li key={f.id} className="relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/app/crm/salud/${f.id}`} className="min-w-0 truncate text-sm font-semibold text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand">
                {f.nombre}
              </Link>
              <Badge tono={TONO_BANDA[f.band]} tamano="sm" className="shrink-0">{t('movil.puntaje', { score: f.score, banda: t(`bandaMin.${f.band}`) })}</Badge>
            </div>
            <p className="truncate text-xs text-fg-secondary">{textoMotivos(f.motivos, f.resultado)}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium tabular-nums text-fg-secondary">{t('movil.ingresos', { importe: formatear(f.ingresos) })}</span>
              {f.accion ? (
                <button type="button" onClick={() => onAccion(f.accion as AccionSalud, f)} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'relative z-10' })}>
                  <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t(`accionCorta.${f.accion}`)}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
