'use client';

/**
 * Tarjeta «Excepciones temporales» (Figma 20.27.1): una fila por excepción de
 * las personas de la sede («Persona — Método · fechas · estado»), «Revocar»
 * con confirmación y «Agregar excepción», que abre el diálogo 20.27.11.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, CalendarCheck, Plus } from 'lucide-react';
import { ConfirmDialog, RowActionsMenu, Skeleton, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { esMetodoSede } from '@/lib/hrm/marcacion/metodos';
import { ErrorEstructura, pedir, type Carga } from '../../estructura/comun';
import { useDias } from '../../asistencia/comunAsistencia';
import { TarjetaMetodo } from './TarjetaMetodo';
import { estadoExcepcion, puedeRevocar, resumenExcepciones, type ExcepcionApi } from './metodosVista';

export interface TarjetaExcepcionesProps {
  carga: Carga<ExcepcionApi[]>;
  /** Ya filtradas por la sede. */
  excepciones: ExcepcionApi[];
  hoy: string;
  puedeGestionar: boolean;
  onAgregar: () => void;
  onRecargar: () => void;
}

export function TarjetaExcepciones({ carga, excepciones, hoy, puedeGestionar, onAgregar, onRecargar }: TarjetaExcepcionesProps) {
  const t = useTranslations('hrmMarcacionMetodos.tarjetas.excepciones');
  const tm = useTranslations('hrmMarcacionMetodos.metodos');
  const dias = useDias();
  const [revocar, setRevocar] = useState<ExcepcionApi | null>(null);
  const [revocando, setRevocando] = useState(false);
  const resumen = resumenExcepciones(excepciones, hoy);

  const confirmarRevocar = async () => {
    if (!revocar) return;
    setRevocando(true);
    try {
      await pedir(`/api/hrm/marcacion/excepciones/${encodeURIComponent(revocar.id)}`, { metodo: 'POST', cuerpo: { accion: 'revocar' } });
      toast.success(t('revocada'));
      setRevocar(null);
      onRecargar();
    } catch (err) {
      const c = err instanceof ErrorEstructura ? err.codigo : 'error_hrm';
      toast.error(c === 'sin_permiso' ? t('errorSinPermiso') : c === 'no_existe' ? t('errorYaRevocada') : t('errorRevocar'));
    } finally {
      setRevocando(false);
    }
  };

  const textoFila = (e: ExcepcionApi): string => {
    const s = estadoExcepcion(e, hoy);
    const partes = [esMetodoSede(e.metodo) ? tm(`${e.metodo}.corto`) : e.metodo, dias.rangoCorto(e.desde, e.hasta), t(`estados.${s}`)];
    if (e.aprobado_por && (s === 'vigente' || s === 'programada' || s === 'vencida')) partes.push(t('aprobo', { nombre: e.aprobado_por }));
    return partes.join(' · ');
  };

  return (
    <TarjetaMetodo
      icono={CalendarCheck}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      resumen={t('resumen', { vigentes: resumen.vigentes, pendientes: resumen.pendientes })}
      control={
        excepciones.length > 0 ? (
          <Badge tono="neutro" apariencia="suave" tamano="sm" className="tabular-nums lg:hidden">
            {String(excepciones.length)}
          </Badge>
        ) : undefined
      }
    >
      {carga.estado === 'cargando' && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      )}
      {(carga.estado === 'error' || carga.estado === 'noExiste') && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary" role="alert">
          <span>{t('errorCargar')}</span>
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onRecargar}>
            {t('reintentar')}
          </button>
        </div>
      )}
      {carga.estado === 'sinPermiso' && <p className="text-[13px] text-fg-secondary">{t('sinPermiso')}</p>}
      {carga.estado === 'listo' &&
        (excepciones.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('vacio')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {excepciones.map((e) => {
              const revocable = puedeGestionar && puedeRevocar(e, hoy);
              return (
                <li key={e.id} className="flex min-h-9 flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 truncate text-[13px] leading-[18px] text-fg-secondary sm:flex-1" title={e.motivo}>
                    {e.nombre}
                  </span>
                  <span className="flex min-w-0 items-center gap-1 sm:justify-end">
                    <span className="min-w-0 flex-1 text-sm leading-5 text-fg sm:flex-none sm:text-right">{textoFila(e)}</span>
                    {revocable && (
                      <RowActionsMenu
                        tamano="sm"
                        titulo={e.nombre}
                        acciones={[{ id: 'revocar', etiqueta: t('revocar'), icono: Ban, destructiva: true, onSelect: () => setRevocar(e) }]}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
      {puedeGestionar && (
        <div>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={onAgregar}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('agregar')}
          </button>
        </div>
      )}
      <ConfirmDialog
        abierto={revocar !== null}
        onAbiertoChange={(a) => !a && !revocando && setRevocar(null)}
        tono="peligro"
        icono={Ban}
        titulo={t('confirmarTitulo')}
        descripcion={revocar ? t('confirmarDetalle', { nombre: revocar.nombre }) : ''}
        textoConfirmar={t('revocar')}
        textoCancelar={t('cancelar')}
        cargando={revocando}
        onConfirmar={confirmarRevocar}
      />
    </TarjetaMetodo>
  );
}
