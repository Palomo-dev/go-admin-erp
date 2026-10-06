'use client';

/**
 * Historial de versiones (Figma A/05h): panel derecho «Historial de versiones · Las versiones
 * publicadas y los guardados automáticos» con el borrador actual, la versión en línea, las
 * publicadas y los guardados automáticos. Al elegir una: «Ver esta versión» (la pinta en el
 * lienzo sin tocar el borrador) y «Restaurar», que pide confirmación («Se copia a tu borrador…
 * Lo que está en línea no cambia hasta que publiques»).
 *
 * Estados: cargando, vacío («Aún no has publicado…»), error con «Reintentar».
 */
import { useCallback, useEffect, useState } from 'react';
import { Eye, RotateCcw, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ConfirmDialog, EmptyState, Skeleton, StatusBadge, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import type { RevisionResumen } from '@/lib/website/v2/tipos';
import type { InstantaneaBorrador } from '@/lib/website/v2/tiposEditor';
import { useTextosEditor } from './textos';

export interface PanelHistorialProps {
  sitioId: string;
  borradorActualizadoEn: string | null;
  autorBorrador?: string | null;
  cambiosBorrador: number | null;
  /** Se recarga la lista cuando cambia (tras publicar o restaurar). */
  marca: string | null;
  onCerrar: () => void;
  onVer: (revision: RevisionResumen) => void;
  onRestaurar: (origen: { tipo: 'revision' | 'instantanea'; id: string }) => Promise<boolean>;
  className?: string;
}

type Elemento =
  | { tipo: 'revision'; id: string; revision: RevisionResumen; fecha: string }
  | { tipo: 'instantanea'; id: string; instantanea: InstantaneaBorrador; fecha: string };

export function PanelHistorial(p: PanelHistorialProps) {
  const t = useTextosEditor();
  const { formatDateTime, formatDate } = useFormatDate(null);
  const [elementos, setElementos] = useState<Elemento[] | null>(null);
  const [error, setError] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Elemento | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    setElementos(null);
    try {
      const [revisiones, instantaneas] = await Promise.all([
        clienteSitiosV2.revisiones(p.sitioId),
        // Los guardados automáticos dependen de una migración pendiente: sin ella, no hay ninguno.
        clienteSitiosV2.instantaneas(p.sitioId).catch((e) => {
          if (e instanceof ErrorApiSitio && e.codigo === 'no_disponible') return [] as InstantaneaBorrador[];
          throw e;
        }),
      ]);
      const lista: Elemento[] = [
        ...revisiones.map((r): Elemento => ({ tipo: 'revision', id: r.id, revision: r, fecha: r.publicadaEn })),
        ...instantaneas.map((i): Elemento => ({ tipo: 'instantanea', id: i.id, instantanea: i, fecha: i.creadaEn })),
      ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      setElementos(lista);
    } catch {
      setError(true);
    }
  }, [p.sitioId]);

  useEffect(() => {
    void cargar();
  }, [cargar, p.marca]);

  const restaurar = async () => {
    if (!confirmar) return;
    setRestaurando(true);
    const ok = await p.onRestaurar({ tipo: confirmar.tipo, id: confirmar.id });
    setRestaurando(false);
    if (ok) {
      setConfirmar(null);
      setElegido(null);
    }
  };

  const titulo = (e: Elemento) => {
    if (e.tipo === 'instantanea') return t('historial.autoguardado');
    const r = e.revision;
    if (r.enLinea) return r.nota ? t('historial.enLineaNota', { nota: r.nota }) : t('historial.enLinea');
    return r.nota ? t('historial.nota', { nota: r.nota }) : t('historial.version', { n: r.numero });
  };

  return (
    <aside aria-label={t('historial.titulo')} className={cn('flex min-h-0 flex-col bg-surface', p.className)}>
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-6 text-fg">{t('historial.titulo')}</h2>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('historial.descripcion')}</p>
        </div>
        <button
          type="button"
          onClick={p.onCerrar}
          aria-label={t('historial.cerrar')}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2 rounded-xl border border-line p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{t('historial.borradorActual')}</p>
            <p className="text-[13px] leading-[18px] text-fg-secondary">
              {[
                p.borradorActualizadoEn ? formatDateTime(p.borradorActualizadoEn) : null,
                p.autorBorrador,
                p.cambiosBorrador !== null ? t(p.cambiosBorrador === 1 ? 'historial.cambiosUno' : 'historial.cambios', { n: p.cambiosBorrador }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <StatusBadge estado="guardado en borrador" etiqueta={t('historial.guardadoBorrador')} />
        </div>

        {error ? (
          <EmptyState variante="error" titulo={t('historial.errorTitulo')} descripcion={t('historial.errorDescripcion')} onReintentar={() => void cargar()} compacto />
        ) : elementos === null ? (
          <div aria-busy="true" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : elementos.length === 0 ? (
          <EmptyState titulo={t('historial.vacioTitulo')} descripcion={t('historial.vacioDescripcion')} compacto />
        ) : (
          <ul className="flex flex-col gap-2">
            {elementos.map((e) => {
              const activo = elegido === e.id;
              const autor = e.tipo === 'revision' ? e.revision.autor : e.instantanea.autor;
              return (
                <li key={`${e.tipo}-${e.id}`}>
                  <div className={cn('flex flex-col gap-3 rounded-xl border p-3 transition-colors', activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface')}>
                    <button
                      type="button"
                      onClick={() => setElegido(activo ? null : e.id)}
                      aria-expanded={activo}
                      className="flex items-start justify-between gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{titulo(e)}</span>
                        <span className="block text-[13px] leading-[18px] text-fg-secondary">
                          {[formatDateTime(e.fecha), autor].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {e.tipo === 'revision' ? (
                        <StatusBadge estado="publicado" etiqueta={e.revision.enLinea ? t('historial.badgeEnLinea') : t('historial.badgePublicado')} />
                      ) : (
                        <StatusBadge estado="guardado en borrador" etiqueta={t('historial.guardadoBorrador')} />
                      )}
                    </button>
                    {activo && (
                      <div className="flex flex-wrap gap-2">
                        {e.tipo === 'revision' && (
                          <button type="button" onClick={() => p.onVer(e.revision)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                            <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            {t('historial.ver')}
                          </button>
                        )}
                        <button type="button" onClick={() => setConfirmar(e)} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
                          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          {t('historial.restaurar')}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        abierto={confirmar !== null}
        onAbiertoChange={(a) => !a && !restaurando && setConfirmar(null)}
        titulo={t('historial.confirmarTitulo', { fecha: confirmar ? formatDate(confirmar.fecha) : '' })}
        descripcion={
          p.cambiosBorrador
            ? t('historial.confirmarDescripcion', { n: p.cambiosBorrador })
            : t('historial.confirmarDescripcionSinCambios')
        }
        textoConfirmar={t('historial.confirmar')}
        icono={RotateCcw}
        tono="marca"
        cargando={restaurando}
        onConfirmar={restaurar}
      />
    </aside>
  );
}
