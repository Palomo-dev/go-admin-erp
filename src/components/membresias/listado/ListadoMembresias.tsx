'use client';

/**
 * Membresías — listado de contratos (Figma C1 984:611196, móvil C6 985:617686; estados F1–F7).
 * Búsqueda, estado, plan, cliente y página viven en la URL (`useListadoServidor`) y se resuelven
 * en `GET /api/membresias/membresias`. No hay alta sin cobro: una membresía nace de una venta,
 * por eso la acción principal lleva al POS.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, CalendarDays, Download, List, PackagePlus, PauseCircle, ScanLine, ShoppingCart, TriangleAlert, UserCheck } from 'lucide-react';
import {
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
  SegmentedControl,
  StatCard,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { FiltroEstado, MembresiaFila } from '@/lib/services/membresias/tipos';
import { BadgeEstadoMembresia } from '../comun/BadgeEstadoMembresia';
import { EstadoPantalla } from '../comun/EstadoPantalla';
import { rangoVigencia, useLineaVigencia } from '../comun/LineaVigencia';
import { esSinPermiso, useCargaMembresias } from '../comun/useCargaMembresias';
import { useExportarMembresias } from '../comun/useExportarMembresias';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import {
  FILTROS_ESTADO,
  RUTA_MEMBRESIAS,
  leerCliente,
  leerFiltroEstado,
  leerPlan,
  rutaDetalle,
  rutaListadoCliente,
} from '../logica';

const CLASE_PRIMARIO =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

export default function ListadoMembresias() {
  const router = useRouter();
  const t = useTranslations('membresias.listado');
  const tc = useTranslations('membresias.comun');
  const to = useTranslations('membresias.origen');
  const tp = useTranslations('membresias.pantalla');
  const te = useTranslations('membresias.exportar');
  const exportacion = useExportarMembresias('membresias');

  const l = useListadoServidor({ filtros: ['estado', 'plan', 'cliente'], tamanoPorDefecto: 20 });
  const estado = leerFiltroEstado(l.filtros.estado);
  const plan = leerPlan(l.filtros.plan);
  const cliente = leerCliente(l.filtros.cliente);

  const consulta = { q: l.busqueda, estado, plan, cliente, pagina: l.pagina, porPagina: l.tamano };
  const carga = useCargaMembresias(JSON.stringify(consulta), () => apiMembresias.membresias(consulta));
  const datos = carga.datos;
  const f = useFormatoMembresias(datos?.zona);
  const lineaVigencia = useLineaVigencia(f);
  const sustantivo = { singular: tc('sustantivo.singular'), plural: tc('sustantivo.plural') };

  const conteo = datos?.conteo;
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;

  const nombrePlan = (id: number | null) => datos?.planes.find((p) => p.id === id)?.nombre ?? `#${id}`;
  const chips: ChipFiltro[] = [
    estado !== 'todas' ? { clave: 'estado', etiqueta: t('chips.estado', { estado: t(`filtros.estados.${estado}`) }) } : null,
    plan ? { clave: 'plan', etiqueta: t('chips.plan', { plan: nombrePlan(plan) }) } : null,
    cliente ? { clave: 'cliente', etiqueta: t('chips.cliente', { cliente: filas[0]?.cliente.nombre ?? '…' }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const filtrar = (valor: FiltroEstado) => l.setFiltro('estado', valor === 'todas' || valor === estado ? null : valor);

  const accionesDe = (m: MembresiaFila): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: UserCheck, onSelect: () => router.push(rutaDetalle(m.id)) },
    {
      id: 'cliente',
      etiqueta: t('acciones.delCliente'),
      icono: List,
      onSelect: () => router.push(rutaListadoCliente(m.cliente.id)),
      oculta: !m.cliente.id || cliente === m.cliente.id,
    },
  ];

  const columnas: ColumnaTabla<MembresiaFila>[] = [
    {
      id: 'miembro',
      encabezado: t('columnas.miembro'),
      celda: (m) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{m.cliente.nombre}</span>
          <span className="truncate text-xs text-fg-secondary tabular-nums">{m.cliente.documento ?? '—'}</span>
        </div>
      ),
    },
    {
      id: 'plan',
      encabezado: t('columnas.plan'),
      celda: (m) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{m.plan.nombre}</span>
          <span className="truncate font-mono text-xs text-fg-secondary">{m.codigo ?? '—'}</span>
        </div>
      ),
    },
    {
      id: 'vigencia',
      encabezado: t('columnas.vigencia'),
      celda: (m) => (
        <div className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-fg tabular-nums">{rangoVigencia(m, f)}</span>
          <span className="truncate text-xs text-fg-secondary">{lineaVigencia(m)}</span>
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (m) => <BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />,
    },
    {
      id: 'sede',
      encabezado: t('columnas.sede'),
      ocultarDebajo: 'xl',
      celda: (m) => <span className="whitespace-nowrap text-fg-secondary">{m.sucursal ?? '—'}</span>,
    },
    {
      id: 'ultimaEntrada',
      encabezado: t('columnas.ultimaEntrada'),
      ocultarDebajo: 'lg',
      celda: (m) => (
        <span className="whitespace-nowrap text-fg-secondary tabular-nums">{m.ultimaEntrada ? f.fechaHora(m.ultimaEntrada) : '—'}</span>
      ),
    },
    {
      id: 'origen',
      encabezado: t('columnas.origen'),
      ocultarDebajo: 'xl',
      celda: (m) => <span className="whitespace-nowrap text-fg-secondary">{m.origen ? to(m.origen) : '—'}</span>,
    },
  ];

  const estadoTabla: EstadoTabla = carga.cargando && !datos
    ? 'cargando'
    : carga.error
      ? esSinPermiso(carga.error)
        ? 'sinPermiso'
        : 'error'
      : filas.length === 0 && (l.hayCriterios || estado !== 'todas')
        ? 'sinResultados'
        : carga.cargando
          ? 'cargando'
          : 'listo';

  const subtitulo = datos
    ? [tc('nMembresias', { count: datos.total }), t('subtituloActivas', { count: datos.conteo.activa })].join(' · ')
    : t('cargando');

  const accionesCabecera: AccionFila[] = [
    { id: 'planes', etiqueta: tc('accesos.planes'), icono: PackagePlus, onSelect: () => router.push(`${RUTA_MEMBRESIAS}/planes`) },
    { id: 'checkin', etiqueta: tc('accesos.checkin'), icono: ScanLine, onSelect: () => router.push(`${RUTA_MEMBRESIAS}/check-in`) },
    {
      id: 'exportar',
      etiqueta: exportacion.exportando ? te('exportando') : te('accion'),
      descripcion: te('descripcionFiltros'),
      icono: Download,
      separadorAntes: true,
      deshabilitada: exportacion.exportando || !datos || datos.total === 0,
      onSelect: () => void exportacion.exportar({ q: l.busqueda, estado, plan, cliente }),
    },
  ];

  const abrir = (m: MembresiaFila) => router.push(rutaDetalle(m.id));

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={tc('membresias')}
        subtitulo={subtitulo}
        icono={UserCheck}
        cargando={carga.cargando}
        migas={[{ etiqueta: tc('modulo'), href: RUTA_MEMBRESIAS }, { etiqueta: tc('membresias') }]}
        acciones={
          <>
            <Link href="/app/pos" className={CLASE_PRIMARIO}>
              <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('venderMembresia')}
            </Link>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={tc('membresias')} acciones={accionesCabecera} />
          </>
        }
        movil={{
          subtitulo: datos ? t('subtituloMovil', { total: datos.total, activas: datos.conteo.activa }) : undefined,
          accion: (
            <Link
              href="/app/pos"
              aria-label={tc('venderMembresia')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ShoppingCart aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ),
        }}
      />

      {!esSinPermiso(carga.error) && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.activas')}
            icono={UserCheck}
            cargando={!conteo}
            valor={conteo ? f.entero(conteo.activa) : '—'}
            tono="exito"
            detalle={conteo ? t('kpis.activasDetalle', { count: conteo.total }) : undefined}
            resaltada={estado === 'activa'}
            onClick={() => filtrar('activa')}
          />
          <StatCard
            etiqueta={t('kpis.porVencer')}
            icono={CalendarClock}
            cargando={!conteo}
            valor={conteo ? f.entero(conteo.porVencer) : '—'}
            tono={conteo && conteo.porVencer > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={conteo && conteo.porVencer > 0 ? TriangleAlert : undefined}
            detalle={conteo ? (conteo.porVencer > 0 ? t('kpis.porVencerDetalle') : t('kpis.nadaPorVencer')) : undefined}
            resaltada={estado === 'por_vencer'}
            onClick={() => filtrar('por_vencer')}
          />
          <StatCard
            etiqueta={t('kpis.enGracia')}
            icono={CalendarDays}
            cargando={!conteo}
            valor={conteo ? f.entero(conteo.en_gracia) : '—'}
            tono={conteo && conteo.en_gracia > 0 ? 'peligro' : 'neutro'}
            detalle={conteo ? t('kpis.vencidasDetalle', { count: conteo.vencida }) : undefined}
            resaltada={estado === 'en_gracia'}
            onClick={() => filtrar('en_gracia')}
          />
          <StatCard
            etiqueta={t('kpis.congeladas')}
            icono={PauseCircle}
            cargando={!conteo}
            valor={conteo ? f.entero(conteo.congelada) : '—'}
            tono="informacion"
            detalle={conteo ? t('kpis.pendientesDetalle', { count: conteo.pendiente }) : undefined}
            resaltada={estado === 'congelada'}
            onClick={() => filtrar('congelada')}
          />
        </KpiStrip>
      )}

      {!esSinPermiso(carga.error) && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={l.busqueda}
              onChange={l.setBusqueda}
              cargando={carga.cargando}
              placeholder={t('buscar.placeholder')}
              etiqueta={t('buscar.etiqueta')}
            />
          }
          filtros={
            <FilterPanel
              conteo={l.filtrosActivos}
              onLimpiar={l.limpiarFiltros}
              titulo={t('filtros.titulo')}
              textoVerResultados={t('filtros.verN', { count: total })}
            >
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <Select value={estado} onValueChange={(v) => l.setFiltro('estado', v === 'todas' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILTROS_ESTADO.map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`filtros.estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.plan')}>
                {(c) => (
                  <Select value={plan ? String(plan) : 'todos'} onValueChange={(v) => l.setFiltro('plan', v === 'todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('filtros.todosLosPlanes')}</SelectItem>
                      {(datos?.planes ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={
            <>
              <SegmentedControl
                etiqueta={t('filtros.estado')}
                tamano="sm"
                valor={estado}
                onValorChange={(v) => l.setFiltro('estado', v === 'todas' ? null : v)}
                opciones={(['todas', 'activa', 'en_gracia', 'congelada', 'pendiente', 'vencida'] as const).map((e) => ({
                  valor: e,
                  etiqueta: t(`filtros.estados.${e}`),
                }))}
                className="hidden max-w-full overflow-x-auto lg:inline-flex"
              />
              <FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />
            </>
          }
        />
      )}

      {carga.error && !esSinPermiso(carga.error) && !datos ? (
        <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('error')} />
      ) : (
        <DataTable
          etiqueta={tc('membresias')}
          columnas={columnas}
          filas={filas}
          obtenerId={(m) => String(m.id)}
          estado={estadoTabla}
          onFilaClick={abrir}
          etiquetaFila={(m) => `${m.cliente.nombre} · ${m.plan.nombre}`}
          acciones={accionesDe}
          tarjetaMovil={(m) => (
            <ListCard
              icono={UserCheck}
              titulo={m.cliente.nombre}
              subtitulo={`${m.plan.nombre} · ${lineaVigencia(m)}`}
              meta={rangoVigencia(m, f)}
              valor={m.estadoVisual === 'activa' || m.estadoVisual === 'en_gracia' ? t('diasCorto', { dias: m.dias ?? 0 }) : '—'}
              estado={<BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />}
              acciones={accionesDe(m)}
              onClick={() => abrir(m)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: UserCheck,
            accion: { etiqueta: t('vacio.irAlPos'), href: '/app/pos', icono: ShoppingCart },
            accionSecundaria: { etiqueta: t('vacio.crearProducto'), href: '/app/inventario/productos/nuevo', icono: PackagePlus },
          }}
          sinResultados={{ descripcion: t('sinResultados') }}
          sinPermiso={{ titulo: tp('sinPermiso.titulo'), descripcion: tp('sinPermiso.descripcion') }}
          error={{ titulo: t('error') }}
          onLimpiarFiltros={l.limpiarTodo}
          onReintentar={carga.recargar}
          termino={l.busqueda}
          pie={
            <Pagination
              pagina={l.pagina}
              tamano={l.tamano}
              total={total}
              onPaginaChange={l.setPagina}
              onTamanoChange={l.setTamano}
              sustantivo={sustantivo}
              cargando={carga.cargando}
            />
          }
        />
      )}
    </div>
  );
}
