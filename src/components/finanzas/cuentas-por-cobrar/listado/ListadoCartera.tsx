'use client';

/**
 * Cuentas por cobrar — listado (Figma `448:201605` y estados; móvil `449:214437`).
 * Un solo componente para Finanzas y para el POS (D3): en el POS la ruta pide
 * `origen=pos` (ventas del POS, permiso `pos.view`) y el detalle queda dentro
 * del POS. Paginado en el servidor (`GET /api/cartera` → `fn_cxc_listado`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Bell, CircleDollarSign, Clock, Download, Eye, RefreshCw, User, WalletCards } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { TRAMOS_ANTIGUEDAD, tramoAntiguedad, type TramoAntiguedad } from '@/lib/finanzas/cartera/antiguedad';
import {
  CAMPOS_ORDEN_CARTERA,
  ESTADOS_CARTERA,
  FILTROS_CARTERA,
  ordenCarteraRpc,
  type FilaCartera,
  type RespuestaListadoCartera,
} from '@/lib/finanzas/cartera/listadoCartera';
import { enviarRecordatorio, pedirListadoCartera } from '@/lib/finanzas/cartera/clienteCartera';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { BandaAntiguedad } from '@/components/kit';

export interface ListadoCarteraProps {
  origen: 'finanzas' | 'pos';
}

export function rutasCartera(origen: 'finanzas' | 'pos') {
  const base = origen === 'pos' ? '/app/pos/cuentas-por-cobrar' : '/app/finanzas/cuentas-por-cobrar';
  return {
    base,
    detalle: (id: string) => `${base}/${id}`,
    cliente: (customerId: string) => `${base}/cliente/${customerId}`,
  };
}

export function ListadoCartera({ origen }: ListadoCarteraProps) {
  const t = useTranslations('cartera');
  const router = useRouter();
  const entero = useFormatoEntero();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { branchFilter } = useBranch();
  const { formatDate, getToday } = useFormatDate();
  const rutas = rutasCartera(origen);
  const enPos = origen === 'pos';
  const puedeCobrar = enPos ? permisos.posCrear || permisos.crear : permisos.crear;

  const l = useListadoServidor({
    filtros: [...FILTROS_CARTERA],
    camposOrden: [...CAMPOS_ORDEN_CARTERA],
    ordenPorDefecto: { campo: 'vencimiento', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  const [datos, setDatos] = useState<RespuestaListadoCartera | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cobrarId, setCobrarId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    if (enPos) q.set('origen', 'pos');
    q.set('orden', ordenCarteraRpc(l.orden?.campo, l.orden?.direccion));
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, branchFilter, enPos]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirListadoCartera(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e: { codigo?: string }) => !cancelado && setError(e?.codigo ?? 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const resumen = datos?.resumen ?? null;
  const monedaResumen = resumen?.monedas.length === 1 ? resumen.monedas[0] : moneda.code;
  const fmt = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(monedaResumen)), [moneda, monedaResumen]);
  const fmtFila = useCallback((f: FilaCartera, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural') };
  const tramoActivo = (TRAMOS_ANTIGUEDAD as readonly string[]).includes(l.filtros.tramo ?? '') ? (l.filtros.tramo as TramoAntiguedad) : null;

  const badge = (f: FilaCartera) => {
    if (f.estado === 'overdue' || f.dias > 0) return <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: f.dias })} />;
    return <StatusBadge estado={f.estado} />;
  };

  const recordar = async (filasARecordar: readonly FilaCartera[]) => {
    setEnviando(true);
    let enviados = 0;
    let sinCorreo = 0;
    for (const f of filasARecordar) {
      if (!f.cliente_email) {
        sinCorreo += 1;
        continue;
      }
      try {
        const r = await enviarRecordatorio(f.id, { canal: 'correo', origen: enPos ? 'pos' : 'finanzas' });
        if (r.enviado) enviados += 1;
      } catch {
        /* se cuenta abajo */
      }
    }
    setEnviando(false);
    if (enviados > 0) toastSuccess(t('recordatorio.enviados', { count: enviados }), sinCorreo > 0 ? t('recordatorio.sinCorreo', { count: sinCorreo }) : undefined);
    else toastError(t('recordatorio.ninguno'), sinCorreo > 0 ? t('recordatorio.sinCorreo', { count: sinCorreo }) : undefined);
    recargar();
  };

  const accionesDe = (f: FilaCartera): AccionFila[] => [
    { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(rutas.detalle(f.id)) },
    { id: 'cobrar', etiqueta: t('listado.acciones.registrarAbono'), icono: CircleDollarSign, onSelect: () => setCobrarId(f.id), oculta: !puedeCobrar || f.saldo <= 0 },
    {
      id: 'recordar',
      etiqueta: t('listado.acciones.recordatorio'),
      icono: Bell,
      onSelect: () => void recordar([f]),
      deshabilitada: !f.cliente_email,
      motivo: t('recordatorio.clienteSinCorreo'),
      oculta: f.saldo <= 0,
    },
    { id: 'cliente', etiqueta: t('listado.acciones.carteraCliente'), icono: User, onSelect: () => f.cliente_id && router.push(rutas.cliente(f.cliente_id)), oculta: !f.cliente_id },
  ];

  const exportar = async (ids?: ReadonlySet<string>) => {
    setExportando(true);
    try {
      const todas: FilaCartera[] = [];
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      for (let pagina = 1; pagina <= 25; pagina++) {
        base.set('pagina', String(pagina));
        const r = await pedirListadoCartera(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
      const elegidas = ids ? todas.filter((f) => ids.has(f.id)) : todas;
      descargarCsv(
        `cuentas-por-cobrar_${getToday()}.csv`,
        aCsv([
          [t('listado.columnas.cliente'), t('listado.columnas.documento'), t('listado.columnas.vencimiento'), t('listado.columnas.moneda'), t('listado.columnas.monto'), t('listado.columnas.saldo'), t('listado.columnas.dias'), t('listado.columnas.estado'), t('listado.columnas.sucursal')],
          ...elegidas.map((f) => [
            f.cliente,
            f.numero,
            formatDate(f.vencimiento),
            f.moneda,
            formatNumeroMoneda(f.monto, moneda.paraDocumento(f.moneda)),
            formatNumeroMoneda(f.saldo, moneda.paraDocumento(f.moneda)),
            f.dias,
            t(`estados.${f.estado}` as never),
            f.sucursal,
          ]),
        ]),
      );
    } catch {
      toastError(t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  const chips: ChipFiltro[] = [
    l.filtros.estado && l.filtros.estado !== 'abiertas' ? { clave: 'estado', etiqueta: t(`listado.filtros.estados.${l.filtros.estado}` as never) } : null,
    tramoActivo ? { clave: 'tramo', etiqueta: t(`antiguedad.tramos.${tramoActivo}`) } : null,
    l.filtros.sin_recordatorio_dias ? { clave: 'sin_recordatorio_dias', etiqueta: t('listado.filtros.sinRecordatorioChip', { dias: l.filtros.sin_recordatorio_dias }) } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: t('listado.filtros.clienteChip') } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const columnas: ColumnaTabla<FilaCartera>[] = [
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.cliente ?? t('listado.sinCliente')}</span>
          {f.cliente_doc && <span className="truncate text-xs text-fg-secondary">{f.cliente_doc}</span>}
        </div>
      ),
    },
    {
      id: 'documento',
      encabezado: t('listado.columnas.documento'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate tabular-nums text-fg">{f.numero ?? t(`listado.origen.${f.origen}`)}</span>
          <span className="text-xs text-fg-muted">{t(`listado.origen.${f.origen}`)}</span>
        </div>
      ),
    },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vencimiento'),
      ordenable: true,
      celda: (f) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap">{formatDate(f.vencimiento)}</span>
          {f.dias > 0 && f.saldo > 0 && <span className="text-xs text-danger-text">{t('listado.vencidaHace', { dias: f.dias })}</span>}
        </div>
      ),
    },
    { id: 'monto', encabezado: t('listado.columnas.monto'), variante: 'importe', ocultarDebajo: 'lg', celda: (f) => fmtFila(f, f.monto) },
    { id: 'saldo', encabezado: t('listado.columnas.saldo'), ordenable: true, variante: 'importe', celda: (f) => <span className="font-medium text-fg">{fmtFila(f, f.saldo)}</span> },
    {
      id: 'cuotas',
      encabezado: t('listado.columnas.cuotas'),
      ocultarDebajo: 'xl',
      alinear: 'centro',
      celda: (f) => (f.cuotas > 0 ? t('listado.cuotasDe', { pendientes: f.cuotas_pendientes, total: f.cuotas }) : <span className="text-fg-muted">—</span>),
    },
    {
      id: 'antiguedad',
      encabezado: t('listado.columnas.antiguedad'),
      ordenable: true,
      ocultarDebajo: 'lg',
      celda: (f) => (f.saldo > 0 ? t(`antiguedad.tramos.${tramoAntiguedad(f.dias)}`) : <span className="text-fg-muted">—</span>),
    },
    { id: 'estado', encabezado: t('listado.columnas.estado'), celda: badge },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const seleccionadas = filas.filter((f) => seleccion.has(f.id));

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('listado.subtitulo', { count: resumen?.cuentas_abiertas ?? 0, n: entero(resumen?.cuentas_abiertas ?? 0) })}
        icono={WalletCards}
        cargando={cargando}
        migas={
          enPos
            ? [{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('titulo') }]
            : [{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.cartera') }, { etiqueta: t('titulo') }]
        }
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button
              type="button"
              onClick={recargar}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('listado.actualizar')}
            </button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'exportar', etiqueta: t('listado.exportar'), icono: Download, onSelect: () => void exportar(), deshabilitada: exportando, motivo: t('listado.exportando') }]}
            />
          </>
        }
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')}>
        <StatCard etiqueta={t('listado.kpis.porCobrar')} icono={WalletCards} cargando={!datos} valor={fmt(resumen?.por_cobrar ?? 0)} onClick={() => l.setFiltro('estado', null)} />
        <StatCard etiqueta={t('listado.kpis.alDia')} icono={Clock} cargando={!datos} valor={fmt(resumen?.al_dia ?? 0)} onClick={() => l.setFiltro('tramo', 'al_dia')} />
        <StatCard
          etiqueta={t('listado.kpis.vencida')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={fmt(resumen?.vencida ?? 0)}
          tono={resumen && resumen.vencida > 0 ? 'peligro' : 'neutro'}
          detalle={resumen ? t('listado.kpis.vencidasDetalle', { count: resumen.cuentas_vencidas, n: entero(resumen.cuentas_vencidas) }) : undefined}
          onClick={() => l.setFiltro('estado', 'overdue')}
        />
        <StatCard
          etiqueta={t('listado.kpis.promedioCobro')}
          icono={Clock}
          cargando={!datos}
          valor={resumen?.promedio_cobro_dias != null ? t('listado.kpis.dias', { dias: Math.round(resumen.promedio_cobro_dias) }) : '—'}
          detalle={t('listado.kpis.promedioDetalle')}
        />
      </KpiStrip>

      <BandaAntiguedad
        tramos={resumen?.tramos ?? []}
        formatear={fmt}
        seleccionado={tramoActivo}
        onSeleccionar={(tramo) => l.setFiltro('tramo', tramo)}
        cargando={!datos}
      />

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('listado.buscar.placeholder')} etiqueta={t('listado.buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('listado.filtros.estado')}>
              {(c) => (
                <Select value={l.filtros.estado ?? 'abiertas'} onValueChange={(v) => l.setFiltro('estado', v === 'abiertas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_CARTERA.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`listado.filtros.estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.recordatorio')}>
              {(c) => (
                <Select value={l.filtros.sin_recordatorio_dias ?? 'todos'} onValueChange={(v) => l.setFiltro('sin_recordatorio_dias', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {['3', '7', '15', '30'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {t('listado.filtros.sinRecordatorio', { dias: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(rutas.detalle(f.id))}
        etiquetaFila={(f) => `${f.cliente ?? ''} ${f.numero ?? ''}`.trim()}
        acciones={accionesDe}
        tonoFila={(f) => (f.dias > 0 && f.saldo > 0 ? 'peligro' : undefined)}
        accionesRapidas={(f) =>
          f.saldo > 0 ? (
            <div className="flex items-center">
              {puedeCobrar && (
                <button
                  type="button"
                  title={t('listado.acciones.registrarAbono')}
                  aria-label={t('listado.cobrarA', { cliente: f.cliente ?? '' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCobrarId(f.id);
                  }}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              )}
              <button
                type="button"
                title={t('listado.acciones.recordatorio')}
                aria-label={t('listado.recordarA', { cliente: f.cliente ?? '' })}
                disabled={!f.cliente_email || enviando}
                onClick={(e) => {
                  e.stopPropagation();
                  void recordar([f]);
                }}
                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
              >
                <Bell aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          ) : null
        }
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={WalletCards}
            titulo={f.cliente ?? t('listado.sinCliente')}
            subtitulo={f.numero ?? t(`listado.origen.${f.origen}`)}
            meta={<span className={f.dias > 0 ? 'text-danger-text' : undefined}>{t('listado.venceEl', { fecha: formatDate(f.vencimiento) })}</span>}
            valor={fmtFila(f, f.saldo)}
            estado={badge(f)}
            acciones={accionesDe(f)}
            onClick={() => router.push(rutas.detalle(f.id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{ titulo: t('listado.vacio.titulo'), descripcion: t('listado.vacio.descripcion'), icono: WalletCards }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('listado.sinPermiso'), descripcion: t('listado.sinPermisoDescripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[
          { id: 'recordar', etiqueta: t('listado.acciones.recordatorio'), icono: Bell, onClick: () => void recordar(seleccionadas), cargando: enviando },
          { id: 'exportar', etiqueta: t('listado.exportar'), icono: Download, onClick: () => void exportar(seleccion), cargando: exportando },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {cobrarId && (
        <RegistrarPagoConectado
          abierto={cobrarId !== null}
          onAbiertoChange={(v) => !v && setCobrarId(null)}
          destino={{ tipo: 'cuenta', id: cobrarId }}
          origen={enPos ? 'pos_cxc' : 'cxc'}
          onRegistrado={recargar}
        />
      )}
    </div>
  );
}
