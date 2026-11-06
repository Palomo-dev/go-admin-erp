'use client';

import { useTranslations } from 'next-intl';
import { AvisoTonal, FilaDato, ListaDatos, clasesBoton } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { accionDe, errorDePendiente, esReversa, responsableDe, type FilaPendiente } from '@/lib/finanzas/pendientesContables';
import { useEtiquetasPendiente } from './useEtiquetasPendiente';

interface DetallePendienteProps {
  fila: FilaPendiente | null;
  onCerrar: () => void;
  formatear: (valor: number) => string;
  puedeReintentar: boolean;
  reintentando: boolean;
  onReintentar: (fila: FilaPendiente) => void;
}

/** Figma «Panel / Detalle del pendiente». */
export function DetallePendiente({
  fila,
  onCerrar,
  formatear,
  puedeReintentar,
  reintentando,
  onReintentar,
}: DetallePendienteProps) {
  const t = useTranslations('pendientesContables');
  const { formatDate, formatDateTime } = useFormatDate();
  const { documento, dato } = useEtiquetasPendiente();

  if (!fila) return null;
  const { accion, href } = accionDe(fila);
  const reintentable = fila.reintentable && !fila.periodoCerrado;

  return (
    <HojaDetalle
      abierto
      onAbiertoChange={(abierto) => !abierto && onCerrar()}
      titulo={documento(fila)}
      subtitulo={t('detalle.desde', { fecha: formatDate(fila.creado) })}
      ancho={560}
      ocupado={reintentando}
      pie={
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={onCerrar}>
            {t('detalle.cerrar')}
          </button>
          {puedeReintentar && reintentable && (
            <button
              type="button"
              className={clasesBoton({ variante: 'primario' })}
              disabled={reintentando}
              onClick={() => onReintentar(fila)}
            >
              {reintentando ? t('detalle.reintentando') : t('detalle.reintentar')}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <AvisoTonal
          tono="advertencia"
          titulo={t(`errores.${errorDePendiente(fila.motivo)}`)}
          descripcion={fila.detalle ?? undefined}
          accion={href ? { etiqueta: t(`acciones.${accion}`), href } : undefined}
        />
        <ListaDatos>
          <FilaDato
            etiqueta={t('columnas.documento')}
            valor={fila.importe === null ? documento(fila) : `${documento(fila)} · ${formatear(fila.importe)}`}
          />
          <FilaDato etiqueta={t('detalle.dato')} valor={dato(fila)} />
          <FilaDato etiqueta={t('detalle.sede')} valor={fila.sede ?? '—'} />
          <FilaDato etiqueta={t('columnas.responsable')} valor={t(`responsables.${responsableDe(fila)}`)} />
          <FilaDato
            etiqueta={t('detalle.intentos')}
            valor={
              fila.ultimoIntento
                ? t('detalle.intentosUltimo', { n: fila.intentos, fecha: formatDateTime(fila.ultimoIntento) })
                : fila.intentos
            }
          />
        </ListaDatos>
        <p className="text-sm text-fg-secondary">
          {fila.periodoCerrado
            ? t('detalle.notaPeriodoCerrado')
            : esReversa(fila.motivo)
              ? t('detalle.notaReversa')
              : fila.reintentable
                ? t('detalle.notaReintento')
                : t('detalle.notaSinClave')}
        </p>
      </div>
    </HojaDetalle>
  );
}
