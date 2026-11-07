'use client';

/**
 * Consignaciones — lista de notas (Figma `2335:138595`, captura
 * `docs/design/figma/88-terceros-consignaciones-lista.png`): mercancía tuya en
 * poder de un consignatario. KPIs Entregado (a costo) · Vendido sin liquidar ·
 * Devuelto · Por cobrar (neto de comisión), búsqueda por nota o consignatario,
 * estado y acceso a la liquidación de cada nota.
 *
 * Lectura `GET /api/consignaciones`; nueva nota por `NuevaNotaConsignacionDialog`.
 * Mientras la migración no esté aplicada, «pendiente de activar».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, Download, Eye, PackageCheck, PackagePlus, Plus, Receipt, Undo2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import {
  BADGE_ESTADO_NOTA,
  RUTA_CONSIGNACIONES,
  filtrarNotas,
  kpisConsignaciones,
  unidadesNota,
  type EstadoNota,
  type NotaConsignacion,
  type RespuestaListadoConsignaciones,
} from '@/lib/finanzas/consignaciones/consignaciones';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { consignacionesService } from './consignacionesService';
import { NuevaNotaConsignacionDialog } from './NuevaNotaConsignacionDialog';

const NS = 'finanzasTercerosR4.consignaciones';

export function ListadoConsignaciones() {
  const t = useTranslations(NS);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const fmt = moneda.formatear;
  const { formatDate } = useFormatDate();
  const entero = useFormatoEntero();

  const [datos, setDatos] = useState<RespuestaListadoConsignaciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoNota | 'todos'>('todos');
  const [nueva, setNueva] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    consignacionesService
      .listar()
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const pendiente = datos?.pendiente === true;
  const notas = useMemo(() => datos?.notas ?? [], [datos]);
  const filas = useMemo(() => filtrarNotas(notas, texto, estado === 'todos' ? null : estado), [notas, texto, estado]);
  const kpis = useMemo(() => kpisConsignaciones(notas), [notas]);
  const abrir = (n: NotaConsignacion) => router.push(`${RUTA_CONSIGNACIONES}/${n.id}`);

  const exportar = () => {
    const csv = aCsv([
      [t('columnas.nota'), t('columnas.consignatario'), t('columnas.fecha'), t('columnas.unidades'), t('columnas.costo'), t('columnas.estado')],
      ...filas.map((n) => [n.numero, n.consignatario, formatDate(n.fecha), unidadesNota(n), formatNumeroMoneda(n.costoTotal, moneda.code), t(`estados.${n.estado}`)]),
    ]);
    descargarCsv(t('archivoExportacion'), csv);
  };

  const accionesDe = (n: NotaConsignacion): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => abrir(n) },
    ...(permisos.crear && n.estado !== 'liquidada'
      ? [{ id: 'liquidar', etiqueta: t('acciones.liquidar'), icono: Receipt, onSelect: () => abrir(n) }]
      : []),
  ];

  const badge = (n: NotaConsignacion) => <StatusBadge estado={BADGE_ESTADO_NOTA[n.estado]} etiqueta={t(`estados.${n.estado}`)} />;

  const columnas: ColumnaTabla<NotaConsignacion>[] = [
    { id: 'nota', encabezado: t('columnas.nota'), celda: (n) => <span className="font-medium text-fg">{n.numero}</span> },
    { id: 'consignatario', encabezado: t('columnas.consignatario'), celda: (n) => <span className="truncate">{n.consignatario || t('sinConsignatario')}</span> },
    { id: 'fecha', encabezado: t('columnas.fecha'), ocultarDebajo: 'lg', celda: (n) => <span className="whitespace-nowrap tabular-nums">{formatDate(n.fecha)}</span> },
    { id: 'unidades', encabezado: t('columnas.unidades'), variante: 'importe', ocultarDebajo: 'lg', celda: (n) => entero(unidadesNota(n)) },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: (n) => fmt(n.costoTotal) },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', celda: badge },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (texto || estado !== 'todos' ? 'sinResultados' : 'vacio') : 'listo';
  const puedeCrear = permisos.crear && !pendiente;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ClipboardList}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.consignacion') }, { etiqueta: t('migas.notas') }]}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={filas.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.exportar')}
            </button>
            {permisos.crear && (
              <button type="button" onClick={() => setNueva(true)} disabled={pendiente} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.nueva')}
              </button>
            )}
          </>
        }
        movil={{
          subtitulo: t('subtitulo'),
          accion: puedeCrear ? (
            <button
              type="button"
              onClick={() => setNueva(true)}
              aria-label={t('acciones.nueva')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {pendiente && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}

      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={setTexto} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <SegmentedControl
            aria-label={t('filtros.estado')}
            valor={estado}
            onValorChange={(v) => setEstado(v as EstadoNota | 'todos')}
            opciones={[
              { valor: 'todos', etiqueta: t('filtros.todos') },
              { valor: 'en_consignacion', etiqueta: t('estados.en_consignacion') },
              { valor: 'por_liquidar', etiqueta: t('estados.por_liquidar') },
              { valor: 'liquidada', etiqueta: t('estados.liquidada') },
            ]}
          />
        }
      />

      {!pendiente && (
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.entregado')} icono={PackageCheck} cargando={!datos} valor={fmt(kpis.entregado)} detalle={t('kpis.aCosto')} />
          <StatCard etiqueta={t('kpis.vendidoSinLiquidar')} icono={Receipt} cargando={!datos} valor={fmt(kpis.vendidoSinLiquidar)} />
          <StatCard etiqueta={t('kpis.devuelto')} icono={Undo2} cargando={!datos} valor={fmt(kpis.devuelto)} />
          <StatCard etiqueta={t('kpis.porCobrar')} icono={Wallet} cargando={!datos} valor={fmt(kpis.porCobrar)} detalle={t('kpis.netoComision')} />
        </KpiStrip>
      )}

      {!pendiente && (
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(n) => n.id}
          estado={estadoTabla}
          onFilaClick={abrir}
          etiquetaFila={(n) => t('etiquetaFila', { numero: n.numero, consignatario: n.consignatario })}
          acciones={accionesDe}
          tarjetaMovil={(n) => (
            <ListCard
              icono={ClipboardList}
              titulo={`${n.numero} · ${n.consignatario || t('sinConsignatario')}`}
              subtitulo={[formatDate(n.fecha), t('unidadesN', { n: entero(unidadesNota(n)) })].join(' · ')}
              valor={fmt(n.costoTotal)}
              estado={badge(n)}
              acciones={accionesDe(n)}
              onClick={() => abrir(n)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: PackagePlus,
            accion: puedeCrear ? { etiqueta: t('acciones.nueva'), onClick: () => setNueva(true), icono: Plus } : undefined,
          }}
          sinResultados={{ descripcion: t('sinResultados') }}
          error={{ titulo: t('errorCarga') }}
          sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
          onReintentar={recargar}
          termino={texto}
        />
      )}

      <NuevaNotaConsignacionDialog
        abierto={nueva}
        onAbiertoChange={setNueva}
        cuentaConsignacion={datos?.cuenta ?? null}
        onEntregada={(r) => router.push(`${RUTA_CONSIGNACIONES}/${r.nota_id}`)}
      />
    </div>
  );
}
