'use client';

/**
 * Miembros — las personas con membresía (P8: Miembros = personas; Membresías = contratos).
 * Una fila por cliente con su membresía vigente (la de mejor estado), el vencimiento, la última
 * entrada y cuántas membresías tiene. La fila abre la vigente o, si no tiene, su listado.
 * Datos: `GET /api/membresias/miembros` (búsqueda, filtro y página en la URL).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { List, ShoppingCart, User, UserCheck, Users } from 'lucide-react';
import {
  AvatarIniciales,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { MiembroFila } from '@/lib/services/membresias/tipos';
import { BadgeEstadoMembresia } from '../comun/BadgeEstadoMembresia';
import { EstadoPantalla } from '../comun/EstadoPantalla';
import { esSinPermiso, useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { RUTA_MEMBRESIAS, leerFiltroMiembros, rutaDetalle, rutaListadoCliente, type FiltroMiembros } from '../logica';

export default function ListadoMiembros() {
  const router = useRouter();
  const t = useTranslations('membresias.miembros');
  const tc = useTranslations('membresias.comun');
  const tp = useTranslations('membresias.pantalla');

  const l = useListadoServidor({ filtros: ['vigencia'], tamanoPorDefecto: 20 });
  const vigencia = leerFiltroMiembros(l.filtros.vigencia);
  const consulta = { q: l.busqueda, estado: vigencia, pagina: l.pagina, porPagina: l.tamano };
  const carga = useCargaMembresias(JSON.stringify(consulta), () => apiMembresias.miembros(consulta));
  const datos = carga.datos;
  const f = useFormatoMembresias(datos?.zona);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;

  const abrir = (m: MiembroFila) => router.push(m.vigente ? rutaDetalle(m.vigente.id) : rutaListadoCliente(m.cliente.id));

  const accionesDe = (m: MiembroFila): AccionFila[] => [
    { id: 'vigente', etiqueta: t('acciones.verVigente'), icono: UserCheck, onSelect: () => m.vigente && router.push(rutaDetalle(m.vigente.id)), oculta: !m.vigente },
    { id: 'todas', etiqueta: t('acciones.verMembresias'), icono: List, onSelect: () => router.push(rutaListadoCliente(m.cliente.id)) },
    { id: 'ficha', etiqueta: t('acciones.verFicha'), icono: User, onSelect: () => router.push(`/app/clientes/${m.cliente.id}`) },
  ];

  const opcionesFiltro: Array<{ valor: FiltroMiembros; etiqueta: string }> = [
    { valor: 'todos', etiqueta: t('filtros.todos') },
    { valor: 'con_vigente', etiqueta: t('filtros.conVigente') },
    { valor: 'sin_vigente', etiqueta: t('filtros.sinVigente') },
  ];
  const chips: ChipFiltro[] =
    vigencia !== 'todos'
      ? [{ clave: 'vigencia', etiqueta: vigencia === 'con_vigente' ? t('filtros.conVigente') : t('filtros.sinVigente') }]
      : [];

  const columnas: ColumnaTabla<MiembroFila>[] = [
    {
      id: 'miembro',
      encabezado: t('columnas.miembro'),
      celda: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={m.cliente.nombre} src={m.cliente.avatarUrl} tamano="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-fg">{m.cliente.nombre}</span>
            <span className="truncate text-xs text-fg-secondary tabular-nums">{m.cliente.documento ?? '—'}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'vigente',
      encabezado: t('columnas.vigente'),
      celda: (m) =>
        m.vigente ? (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="truncate text-fg">{m.vigente.plan.nombre}</span>
            <BadgeEstadoMembresia estado={m.vigente.estadoVisual} dias={m.vigente.dias} />
          </div>
        ) : (
          <span className="text-fg-secondary">{t('sinVigente')}</span>
        ),
    },
    {
      id: 'vence',
      encabezado: t('columnas.vence'),
      celda: (m) => <span className="whitespace-nowrap tabular-nums">{m.vigente ? f.fecha(m.vigente.hasta) : '—'}</span>,
    },
    {
      id: 'entrada',
      encabezado: t('columnas.ultimaEntrada'),
      ocultarDebajo: 'lg',
      celda: (m) => <span className="whitespace-nowrap tabular-nums text-fg-secondary">{m.ultimaEntrada ? f.fechaHora(m.ultimaEntrada) : '—'}</span>,
    },
    {
      id: 'membresias',
      encabezado: t('columnas.membresias'),
      alinear: 'derecha',
      ocultarDebajo: 'md',
      celda: (m) => <span className="tabular-nums">{f.entero(m.membresias)}</span>,
    },
  ];

  const estadoTabla: EstadoTabla =
    carga.cargando && !datos
      ? 'cargando'
      : carga.error
        ? esSinPermiso(carga.error)
          ? 'sinPermiso'
          : 'error'
        : filas.length === 0 && l.hayCriterios
          ? 'sinResultados'
          : carga.cargando
            ? 'cargando'
            : 'listo';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={datos ? t('subtitulo', { count: datos.total }) : t('cargando')}
        icono={Users}
        cargando={carga.cargando}
        migas={[{ etiqueta: tc('modulo'), href: RUTA_MEMBRESIAS }, { etiqueta: t('titulo') }]}
        acciones={
          <Link
            href="/app/pos"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tc('venderMembresia')}
          </Link>
        }
        movil={{
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
        <ListToolbar
          busqueda={
            <SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={carga.cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />
          }
          filtros={
            <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} titulo={t('filtros.titulo')} textoVerResultados={t('filtros.verN', { count: total })}>
              <FormField etiqueta={t('filtros.vigencia')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={vigencia}
                    onValorChange={(v) => l.setFiltro('vigencia', v === 'todos' ? null : v)}
                    opciones={opcionesFiltro}
                  />
                )}
              </FormField>
            </FilterPanel>
          }
          chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
        />
      )}

      {carga.error && !esSinPermiso(carga.error) && !datos ? (
        <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('error')} />
      ) : (
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(m) => m.cliente.id}
          estado={estadoTabla}
          onFilaClick={abrir}
          etiquetaFila={(m) => m.cliente.nombre}
          acciones={accionesDe}
          tarjetaMovil={(m) => (
            <ListCard
              avatar={{ nombre: m.cliente.nombre, src: m.cliente.avatarUrl }}
              titulo={m.cliente.nombre}
              subtitulo={m.vigente ? t('movil.vigente', { plan: m.vigente.plan.nombre, fecha: f.fechaCorta(m.vigente.hasta) }) : t('sinVigente')}
              meta={m.ultimaEntrada ? t('movil.ultimaEntrada', { fecha: f.fechaHora(m.ultimaEntrada) }) : m.cliente.documento ?? undefined}
              estado={m.vigente ? <BadgeEstadoMembresia estado={m.vigente.estadoVisual} dias={m.vigente.dias} /> : undefined}
              acciones={accionesDe(m)}
              onClick={() => abrir(m)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: Users,
            accion: { etiqueta: t('vacio.irAlPos'), href: '/app/pos', icono: ShoppingCart },
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
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
              cargando={carga.cargando}
            />
          }
        />
      )}
    </div>
  );
}
