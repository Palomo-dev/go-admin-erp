'use client';

/**
 * Actualizar PUC con vista previa (Figma 2327:127003). La vista previa se lee
 * al entrar (no escribe); «Aplicar actualización» exige marcar la casilla de
 * confirmación; «Revertir la última actualización» está en «⋯».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListChecks, RefreshCw, Undo2 } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ActualizarPucService,
  resumenVistaPrevia,
  type FilaReclasificacion,
  type FilaRegla,
  type FilaRenombre,
  type ResultadoAplicar,
  type VistaPrevia,
} from './ActualizarPucService';

type Estado = 'cargando' | 'listo' | 'error';

function detalleError(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? '');
}

export function ActualizarPucPage() {
  const t = useTranslations('finanzasContabilidadR3.puc');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const { formatear } = useMonedaOrganizacion();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAplicar | null>(null);
  const [revertirAbierto, setRevertirAbierto] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    setConfirmado(false);
    try {
      setVista(await ActualizarPucService.vistaPrevia());
      setEstado('listo');
    } catch (error) {
      console.error('No se pudo leer la vista previa del PUC:', error);
      setVista(null);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aplicar = async () => {
    setAplicando(true);
    try {
      const r = await ActualizarPucService.aplicar();
      setResultado(r);
      toastSuccess(r.ya_aplicado ? t('toast.yaAplicado') : t('toast.aplicado'));
      await cargar();
    } catch (error) {
      toastError(t('toast.error', { detalle: detalleError(error) }));
    } finally {
      setAplicando(false);
    }
  };

  const revertir = async () => {
    setRevirtiendo(true);
    try {
      await ActualizarPucService.revertir();
      toastSuccess(t('toast.revertido'));
      setRevertirAbierto(false);
      setResultado(null);
      await cargar();
    } catch (error) {
      const detalle = detalleError(error);
      toastError(detalle.includes('no_hay_corrida') ? t('toast.sinCorrida') : t('toast.error', { detalle }));
    } finally {
      setRevirtiendo(false);
    }
  };

  const resumen = vista ? resumenVistaPrevia(vista) : null;
  const colReclas = useMemo<ColumnaTabla<FilaReclasificacion>[]>(() => {
    // Neto deudor sin letra; acreedor con «C» (Figma).
    const neto = (v: number) => (v < 0 ? t('reclasificaciones.netoCredito', { valor: formatear(-v) }) : formatear(v));
    return [
      { id: 'origen', encabezado: t('reclasificaciones.origen'), variante: 'mono', celda: (f) => f.origen },
      { id: 'destino', encabezado: t('reclasificaciones.destino'), variante: 'mono', celda: (f) => f.destino },
      { id: 'debito', encabezado: t('reclasificaciones.debito'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => formatear(f.debito) },
      { id: 'credito', encabezado: t('reclasificaciones.credito'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => formatear(f.credito) },
      { id: 'neto', encabezado: t('reclasificaciones.neto'), variante: 'importe', celda: (f) => neto(f.neto) },
      { id: 'motivo', encabezado: t('reclasificaciones.motivo'), ocultarDebajo: 'lg', celda: (f) => f.motivo },
    ];
  }, [t, formatear]);

  const colRenombres = useMemo<ColumnaTabla<FilaRenombre>[]>(
    () => [
      { id: 'codigo', encabezado: t('renombres.codigo'), variante: 'mono', ancho: 140, celda: (f) => f.origen },
      { id: 'actual', encabezado: t('renombres.actual'), celda: (f) => f.actual },
      { id: 'propuesto', encabezado: t('renombres.propuesto'), celda: (f) => f.propuesto },
    ],
    [t],
  );

  const colReglas = useMemo<ColumnaTabla<FilaRegla>[]>(
    () => [
      { id: 'regla', encabezado: t('reglas.regla'), celda: (f) => f.nombre || `${f.source_type} ${f.event_type}` },
      { id: 'origen', encabezado: t('reglas.origen'), ocultarDebajo: 'lg', celda: (f) => f.source_type },
      { id: 'lado', encabezado: t('reglas.lado'), ocultarDebajo: 'md', celda: (f) => f.lado },
      { id: 'actual', encabezado: t('reglas.actual'), variante: 'mono', celda: (f) => f.actual },
      { id: 'propuesto', encabezado: t('reglas.propuesto'), variante: 'mono', celda: (f) => f.propuesto || '—' },
      {
        id: 'estado',
        encabezado: t('reglas.estado'),
        celda: (f) =>
          f.editada ? (
            <StatusBadge estado="editada" etiqueta={t('reglas.editada')} tono="advertencia" />
          ) : (
            <StatusBadge estado="se actualiza" etiqueta={t('reglas.seActualiza')} tono="informacion" />
          ),
      },
    ],
    [t],
  );

  const acciones: AccionFila[] = [
    { id: 'recargar', etiqueta: t('recargar'), icono: RefreshCw, onSelect: () => void cargar() },
    { id: 'revertir', etiqueta: t('revertir'), icono: Undo2, destructiva: true, onSelect: () => setRevertirAbierto(true) },
  ];

  const asiento = resultado?.journal_entry_id ?? resultado?.asientos?.[0] ?? null;
  const puedeAplicar = estado === 'listo' && !!resumen && !resumen.alDia;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[
          { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: tc('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        movil={{ subtitulo: t('subtituloMovil') }}
        acciones={
          <>
            {puedeAplicar && (
              <button
                type="button"
                className={clasesBoton({ variante: 'primario' })}
                disabled={!confirmado || aplicando}
                title={!confirmado ? t('aplicarMotivo') : undefined}
                onClick={() => void aplicar()}
              >
                {t('aplicar')}
              </button>
            )}
            <RowActionsMenu acciones={acciones} titulo={t('masAcciones')} orientacion="horizontal" tamano="md" />
          </>
        }
      />

      {resultado && (
        <AvisoTonal
          tono="exito"
          rol="status"
          titulo={resultado.ya_aplicado ? t('resultado.yaAplicado') : t('resultado.aplicado')}
          descripcion={t('resultado.corrida', { id: resultado.corrida_id })}
          accion={asiento != null ? { etiqueta: t('resultado.verAsiento', { id: asiento }), href: `/app/finanzas/contabilidad/asientos/${asiento}` } : undefined}
        />
      )}

      {estado === 'error' && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('error.titulo')}
          descripcion={t('error.descripcion')}
          accion={{ etiqueta: t('error.reintentar'), onClick: () => void cargar() }}
        />
      )}

      {estado === 'listo' && resumen?.alDia ? (
        <EmptyState variante="empty" titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
      ) : estado !== 'error' ? (
        <>
          <KpiStrip etiqueta={t('kpis.resumen')} columnas={3}>
            <StatCard etiqueta={t('kpis.renombres')} valor={resumen?.renombres ?? '—'} cargando={estado === 'cargando'} />
            <StatCard
              etiqueta={t('kpis.reclasificaciones')}
              valor={resumen?.reclasificaciones ?? '—'}
              detalle={t('kpis.conMovimientos')}
              cargando={estado === 'cargando'}
            />
            <StatCard
              etiqueta={t('kpis.reglas')}
              valor={resumen?.reglasPorAjustar ?? '—'}
              detalle={resumen && resumen.reglasEditadas > 0 ? t('kpis.editadas', { n: resumen.reglasEditadas }) : undefined}
              cargando={estado === 'cargando'}
            />
          </KpiStrip>
          {vista && <p className="text-sm text-fg-secondary">{t('sector', { sector: vista.sector })}</p>}

          <section className="space-y-3" aria-labelledby="puc-reclasificaciones">
            <div>
              <h2 id="puc-reclasificaciones" className="text-base font-semibold text-fg">{t('reclasificaciones.titulo')}</h2>
              <p className="text-sm text-fg-secondary">{t('reclasificaciones.descripcion')}</p>
            </div>
            <DataTable
              etiqueta={t('reclasificaciones.titulo')}
              columnas={colReclas}
              filas={vista?.reclasificaciones ?? []}
              obtenerId={(f) => `${f.origen}-${f.destino}`}
              estado={estado === 'cargando' ? 'cargando' : 'listo'}
              vacio={{ titulo: t('reclasificaciones.vacio'), descripcion: undefined, compacto: true }}
            />
          </section>

          <section className="space-y-3" aria-labelledby="puc-renombres">
            <h2 id="puc-renombres" className="text-base font-semibold text-fg">{t('renombres.titulo')}</h2>
            <DataTable
              etiqueta={t('renombres.titulo')}
              columnas={colRenombres}
              filas={vista?.renombres ?? []}
              obtenerId={(f) => f.origen}
              estado={estado === 'cargando' ? 'cargando' : 'listo'}
              vacio={{ titulo: t('renombres.vacio'), descripcion: undefined, compacto: true }}
            />
          </section>

          <section className="space-y-3" aria-labelledby="puc-reglas">
            <div>
              <h2 id="puc-reglas" className="text-base font-semibold text-fg">{t('reglas.titulo')}</h2>
              <p className="text-sm text-fg-secondary">{t('reglas.descripcion')}</p>
            </div>
            <DataTable
              etiqueta={t('reglas.titulo')}
              columnas={colReglas}
              filas={vista?.reglas ?? []}
              obtenerId={(f) => `${f.id}-${f.lado}`}
              estado={estado === 'cargando' ? 'cargando' : 'listo'}
              vacio={{ titulo: t('reglas.vacio'), descripcion: undefined, compacto: true }}
            />
          </section>

          {puedeAplicar && (
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-line-strong accent-brand"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              {t('confirmar')}
            </label>
          )}
        </>
      ) : null}

      <ConfirmDialog
        abierto={revertirAbierto}
        onAbiertoChange={setRevertirAbierto}
        titulo={t('revertirDialogo.titulo')}
        descripcion={t('revertirDialogo.descripcion')}
        textoConfirmar={t('revertirDialogo.confirmar')}
        tono="peligro"
        icono={Undo2}
        cargando={revirtiendo}
        onConfirmar={revertir}
      />
    </div>
  );
}
