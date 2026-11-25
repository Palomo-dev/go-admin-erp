'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheck, Download, RefreshCw, Settings } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { nombreUsuario, puede } from '@/components/crm/acciones/catalogosCrmLogica';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { healthScoreService } from '@/lib/services/crm/healthScoreService';
import { logError } from '@/lib/utils/errorMessage';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { csvSalud, FILTROS_INICIALES, filtrarPanel, ordenarPanel, type AccionSalud, type ChipSalud, type FilaSalud, type FiltrosSalud, type OrdenSalud } from './saludLogica';
import { useSaludPanel } from './useSaludPanel';
import { useTextosSalud } from './useTextosSalud';
import { SaludResumen } from './SaludResumen';
import { SaludTabla, SaludTablaCargando } from './SaludTabla';
import { SaludListaMovil } from './SaludListaMovil';
import { AccionSaludAbierta, type AccionSaludPendiente } from './AccionSaludAbierta';

/**
 * /app/crm/salud — «Salud/Panel — lista priorizada» (Figma 1415:19) con sus
 * estados: sin datos suficientes (1424:840685), cargando (1424:841103), error,
 * sin permiso y móvil (1424:841631).
 *
 * Puntaje y banda: `fn_customer_health` + `health_score_configs.config`
 * (`composeHealthResult`, el mismo cálculo del cron y de la ficha). Orden por
 * defecto: banda roja primero y, dentro, ingresos 12 m × caída. «Recalcular»
 * (menú «⋯») va por `POST /api/crm/health/refresh` (sesión; misma pasada que
 * el cron). «Exportar» descarga las filas visibles en CSV.
 */
interface SaludViewProps {
  organizationId: number;
}

const ORDENES: OrdenSalud[] = ['ingresos', 'puntaje', 'caida'];

/** «Configurar factores»: los factores viven en Configuración › CRM › Salud de clientes (Figma pág. 10, S1). */
const SECCION_CONFIG = 'crm.salud';

export function SaludView({ organizationId }: SaludViewProps) {
  const t = useTranslations('crm.redSalud');
  const tc = useTranslations('crmSalud');
  const te = useTranslations('crm.accionesRapidas.errores');
  const idioma = useLocale();
  const { formatear, textoMotivos } = useTextosSalud();
  const { timezone } = useOrgTimezone();
  const escritorio = useEsEscritorio();
  const cat = useCatalogosCrm();
  const d = useSaludPanel(organizationId, timezone);
  const [filtros, setFiltros] = useState<FiltrosSalud>(FILTROS_INICIALES);
  const [recalculando, setRecalculando] = useState(false);
  const [pendiente, setPendiente] = useState<AccionSaludPendiente | null>(null);

  const sinPermiso = !cat.cargando && !cat.error && !puede(cat.permisos, 'crm.customers.view');
  const visibles = useMemo(() => ordenarPanel(filtrarPanel(d.filas, filtros, cat.usuarioId), filtros.orden), [d.filas, filtros, cat.usuarioId]);
  const n = (x: number) => new Intl.NumberFormat(idioma).format(x);
  const sinDatos = !d.cargando && !d.error && d.filas.length === 0;

  const recalculado = (() => {
    if (!d.ultimoCalculo) return null;
    const fecha = new Date(d.ultimoCalculo);
    const hora = formatDateInTz(fecha, timezone, { locale: idioma, hour: 'numeric', minute: '2-digit' });
    return toPlainDate(fecha, timezone) === toPlainDate(new Date(), timezone)
      ? t('recalculadoHoy', { hora })
      : t('recalculadoEl', { fecha: formatDateInTz(fecha, timezone, { locale: idioma, day: '2-digit', month: '2-digit' }), hora });
  })();

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const r = await healthScoreService.refreshAllHealthScores();
      toast({
        title: t('recalculo.hecho'),
        description: r.reason === 'config_inactive' ? t('recalculo.inactiva') : t('recalculo.detalle', { clientes: n(r.customers), cambiaron: n(r.customers_updated) }),
      });
      await d.recargar();
    } catch (err) {
      logError('[Salud] recalcular', err);
      toast({ title: t('recalculo.error'), variant: 'destructive' });
    } finally {
      setRecalculando(false);
    }
  };

  const exportar = () => {
    const csv = csvSalud(
      visibles.map((f) => ({
        celdas: [f.nombre, f.contacto ?? '', nombreUsuario(cat.usuarios, f.responsableId) ?? '', f.score, t(`banda.${f.band}`), f.cambio ?? '', textoMotivos(f.motivos, f.resultado), Math.round(f.ingresos), f.accion ? t(`accion.${f.accion}`) : ''],
      })),
      [t('csv.cliente'), t('csv.contacto'), t('csv.responsable'), t('csv.puntaje'), t('csv.banda'), t('csv.cambio'), t('csv.porque'), t('csv.ingresos'), t('csv.accion')],
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salud-clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const alAccion = (accion: AccionSalud, fila: FilaSalud) =>
    setPendiente({ accion, clienteId: fila.id, nombre: fila.nombre, cliente: fila.resultado.cliente, clave: Date.now() });

  const chips: { valor: ChipSalud; etiqueta: string }[] = escritorio
    ? [
        { valor: 'red', etiqueta: t('filtros.red') },
        { valor: 'yellow', etiqueta: t('filtros.yellow') },
        { valor: 'bajaron', etiqueta: t('filtros.bajaron') },
        { valor: 'mios', etiqueta: t('filtros.mios') },
      ]
    : [
        { valor: 'red', etiqueta: t('filtros.redN', { n: n(d.resumen.conteo.red) }) },
        { valor: 'yellow', etiqueta: t('filtros.yellowN', { n: n(d.resumen.conteo.yellow) }) },
      ];

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={sinPermiso ? t('sinPermiso.subtitulo') : recalculado ? `${t('subtitulo')} · ${recalculado}` : t('subtitulo')}
        icono={CircleCheck}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.salud') }]}
        cargando={d.cargando}
        acciones={
          !sinPermiso && (
            <>
              <AtajoConfigurar seccion={SECCION_CONFIG} etiqueta={tc('configurarFactores')} />
              <button type="button" onClick={exportar} disabled={visibles.length === 0} className={clasesBoton({ variante: 'secundario' })}>
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('exportar')}
              </button>
              <RowActionsMenu
                orientacion="horizontal"
                tamano="md"
                titulo={t('titulo')}
                acciones={[
                  { id: 'recalcular', etiqueta: recalculando ? t('recalculando') : t('recalcular'), icono: RefreshCw, onSelect: () => void recalcular() },
                  { id: 'recargar', etiqueta: t('recargar'), icono: RefreshCw, onSelect: () => void d.recargar() },
                ]}
              />
            </>
          )
        }
        movil={{
          menu: sinPermiso
            ? undefined
            : [
                { id: 'factores', etiqueta: tc('configurarFactores'), icono: Settings, onSelect: () => abrirConfiguracion({ seccionId: SECCION_CONFIG }) },
                { id: 'recalcular', etiqueta: t('recalcular'), icono: RefreshCw, onSelect: () => void recalcular() },
                { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: exportar },
              ],
        }}
      />

      {sinPermiso ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : d.error ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={te(claveError(d.error))} onReintentar={() => void d.recargar()} />
        </div>
      ) : sinDatos ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="empty"
            icono={CircleCheck}
            titulo={t('vacio.titulo')}
            descripcion={t('vacio.descripcion')}
            accionSecundaria={{ etiqueta: t('vacio.comoSeCalcula'), onClick: () => abrirConfiguracion({ seccionId: SECCION_CONFIG }) }}
          />
        </div>
      ) : (
        <>
          <SaludResumen resumen={d.resumen} tendencia={d.tendencia} errorTendencia={d.errorTendencia} cargando={d.cargando} formatear={formatear} />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <ChipsOpcion
              multiple
              etiqueta={t('filtros.grupo')}
              opciones={chips}
              valor={filtros.chips}
              onValorChange={(v) => setFiltros((f) => ({ ...f, chips: v }))}
            />
            {escritorio && (
              <div className="lg:ml-auto lg:w-80">
                <SelectCrm
                  aria-label={t('orden.etiqueta')}
                  valor={filtros.orden}
                  onValorChange={(orden) => setFiltros((f) => ({ ...f, orden: (orden || 'ingresos') as OrdenSalud }))}
                  opciones={ORDENES.map((o) => ({ valor: o, etiqueta: t(`orden.${o}`) }))}
                />
              </div>
            )}
          </div>

          {d.cargando ? (
            <SaludTablaCargando />
          ) : visibles.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="search" onLimpiarFiltros={() => setFiltros({ ...FILTROS_INICIALES, chips: [] })} />
            </div>
          ) : escritorio ? (
            <SaludTabla filas={visibles} usuarios={cat.usuarios} atenuada={d.recargando || recalculando} onAccion={alAccion} />
          ) : (
            <SaludListaMovil filas={visibles} atenuada={d.recargando || recalculando} onAccion={alAccion} />
          )}
        </>
      )}

      <AccionSaludAbierta pendiente={pendiente} onCerrado={() => setPendiente(null)} />
    </div>
  );
}

export default SaludView;
