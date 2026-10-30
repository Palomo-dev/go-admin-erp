'use client';

/**
 * Inventario › Informes › Stock sin seriales (Figma v2).
 * Productos con control de serial cuya existencia supera los seriales en stock
 * o reservados de la sucursal. Solo lectura: no crea seriales; las acciones
 * llevan a Seriales del producto o a un ajuste para registrarlos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Boxes, Building2, CheckCircle2, ClipboardPlus, Package, PackageX, RefreshCw, ScanBarcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BranchBadgeActiva,
  DataTable,
  KpiStrip,
  ListCard,
  PageHeader,
  SearchInput,
  StatCard,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { clasesSelect } from '@/components/reportes/BarraFiltros';
import { ErrorPeticionSeriales, clienteSeriales } from '@/lib/services/seriales/cliente';
import type { FilaStockSinSerial } from '@/lib/services/seriales/contrato';
import { RUTA_SERIALES } from './logica';
import { filtrarStockSinSeriales, num, sucursalesDelReporte, totalesStockSinSeriales } from './logicaStockSinSeriales';

const idFila = (f: FilaStockSinSerial) => `${f.product_id}-${f.branch_id}`;

export function StockSinSerialesPage() {
  const t = useTranslations('inventarioSeriales.stockSinSeriales');
  const router = useRouter();
  const entero = useFormatoEntero();
  const [filas, setFilas] = useState<FilaStockSinSerial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    clienteSeriales
      .stockSinSeriales(ctrl.signal)
      .then((r) => setFilas(r.filas))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ErrorPeticionSeriales ? e.message : t('error'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [t, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const sucursales = useMemo(() => sucursalesDelReporte(filas), [filas]);
  const visibles = useMemo(() => filtrarStockSinSeriales(filas, sucursal, busqueda), [filas, sucursal, busqueda]);
  const tot = useMemo(() => totalesStockSinSeriales(visibles), [visibles]);
  const hayFiltros = busqueda.trim() !== '' || sucursal != null;

  const rutaSerialesProducto = (f: FilaStockSinSerial) => `${RUTA_SERIALES}?producto=${encodeURIComponent(String(f.product_id))}`;

  const acciones = (f: FilaStockSinSerial): AccionFila[] => [
    { id: 'seriales', etiqueta: t('verSeriales'), icono: ScanBarcode, onSelect: () => router.push(rutaSerialesProducto(f)) },
    {
      id: 'ajuste',
      etiqueta: t('registrarAjuste'),
      icono: ClipboardPlus,
      onSelect: () => router.push(`/app/inventario/ajustes/nuevo?branchId=${encodeURIComponent(String(f.branch_id))}`),
    },
  ];

  const columnas: ColumnaTabla<FilaStockSinSerial>[] = [
    {
      id: 'producto',
      encabezado: t('producto'),
      celda: (f) => <span className="font-medium text-fg">{f.nombre}</span>,
    },
    { id: 'sku', encabezado: t('sku'), variante: 'mono', celda: (f) => f.sku || '—', ocultarDebajo: 'sm' },
    { id: 'sucursal', encabezado: t('sucursal'), celda: (f) => f.sucursal, ocultarDebajo: 'md' },
    { id: 'existencia', encabezado: t('existencia'), variante: 'importe', celda: (f) => entero(num(f.qty_on_hand)) },
    { id: 'seriales', encabezado: t('serialesOcupando'), variante: 'importe', celda: (f) => entero(num(f.seriales)), ocultarDebajo: 'lg' },
    {
      id: 'diferencia',
      encabezado: t('diferencia'),
      variante: 'importe',
      celda: (f) => <span className="font-semibold text-warning-text">+{entero(num(f.sin_serial))}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('descripcion')}
        icono={PackageX}
        cargando={cargando}
        migas={[{ etiqueta: t('migasInventario'), href: '/app/inventario' }, { etiqueta: t('migasInformes') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <Button variant="outline" size="icon" className="size-10" onClick={recargar} disabled={cargando} aria-label={t('actualizar')} title={t('actualizar')}>
            <RefreshCw className={cargando ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          </Button>
        }
      />

      <KpiStrip>
        <StatCard etiqueta={t('kpiProductos')} valor={entero(tot.productos)} icono={Package} cargando={cargando} tamano="sm" />
        <StatCard etiqueta={t('kpiSucursales')} valor={entero(tot.sucursales)} icono={Building2} cargando={cargando} tamano="sm" />
        <StatCard etiqueta={t('kpiExistencia')} valor={entero(tot.existencia)} icono={Boxes} cargando={cargando} tamano="sm" />
        <StatCard
          etiqueta={t('kpiSinSerial')}
          valor={entero(tot.sinSerial)}
          icono={PackageX}
          tono={tot.sinSerial > 0 ? 'advertencia' : 'exito'}
          resaltada={tot.sinSerial > 0}
          cargando={cargando}
          tamano="sm"
        />
      </KpiStrip>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} className="sm:max-w-sm sm:flex-1" />
        <select
          aria-label={t('filtroSucursal')}
          className={clasesSelect}
          value={sucursal ?? ''}
          onChange={(e) => setSucursal(e.target.value ? Number(e.target.value) : null)}
          disabled={cargando || sucursales.length < 2}
        >
          <option value="">{t('todasSucursales')}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columnas={columnas}
        filas={visibles}
        obtenerId={idFila}
        etiqueta={t('titulo')}
        estado={cargando ? 'cargando' : error ? 'error' : filas.length > 0 && visibles.length === 0 ? 'sinResultados' : 'listo'}
        acciones={acciones}
        tonoFila={() => 'advertencia'}
        termino={busqueda}
        onReintentar={recargar}
        onLimpiarFiltros={hayFiltros ? () => { setBusqueda(''); setSucursal(null); } : undefined}
        error={{ titulo: t('error'), descripcion: error ?? undefined }}
        sinResultados={{ descripcion: t('sinResultados') }}
        vacio={{
          icono: CheckCircle2,
          titulo: t('vacioTitulo'),
          descripcion: t('vacioDescripcion'),
          accion: { etiqueta: t('irSeriales'), href: RUTA_SERIALES },
        }}
        tarjetaMovil={(f) => (
          <ListCard
            icono={PackageX}
            titulo={f.nombre}
            subtitulo={`${f.sku || '—'} · ${f.sucursal}`}
            meta={`${t('existencia')} ${entero(num(f.qty_on_hand))} · ${t('seriales')} ${entero(num(f.seriales))}`}
            estado={<span className="text-sm font-semibold text-warning-text">+{entero(num(f.sin_serial))}</span>}
            acciones={acciones(f)}
            onClick={() => router.push(rutaSerialesProducto(f))}
          />
        )}
      />
    </div>
  );
}
