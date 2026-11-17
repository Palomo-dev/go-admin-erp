'use client';

/**
 * Nómina › Períodos (Figma 20.16 y, con la nómina apagada, 20.25.1).
 *
 * Tabla de períodos con su estado, empleados, neto, costo y pendientes (bloqueos y
 * alertas del motor). Menú de la fila (16.3): abrir, preliquidar o recalcular y
 * eliminar un período abierto sin cálculo (16.5, confirmación destructiva).
 * Estados: cargando, vacío, sin resultados, error y sin permiso (16.6–16.10).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarRange, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  ConfirmDialog,
  DataTable,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  StatusBadge,
  calcularRango,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { codigoDeError, eliminarPeriodo, preliquidar, rutaPeriodo, type ResumenNomina } from './apiNomina';
import {
  FILTROS_PERIODOS_VACIOS,
  accionesPeriodo,
  conteoFiltrosPeriodos,
  estadoPeriodo,
  filtrarPeriodos,
  type EstadoPeriodo,
  type FilaPeriodo,
  type FiltrosPeriodos,
  type TipoPeriodo,
} from './nominaLogica';
import { EstadoPeriodoBadge, InsigniaSoloPreliquidacion, useDinero, useErrorNomina, useFechas, useNombrePeriodo } from './piezasNomina';

const ESTADOS_FILTRO: readonly EstadoPeriodo[] = ['abierto', 'preliquidado', 'en_revision', 'cerrado', 'pagado', 'contabilizado'];
const TIPOS_FILTRO: readonly TipoPeriodo[] = ['ordinaria', 'prima', 'cesantias'];

export function VistaPeriodos({
  resumen,
  estado,
  onReintentar,
  onRecargar,
  onNuevo,
  soloTipos,
}: {
  resumen: ResumenNomina | null;
  estado: 'cargando' | 'error' | 'sinPermiso' | 'listo';
  onReintentar: () => void;
  onRecargar: () => void;
  onNuevo?: () => void;
  /** Prestaciones reutiliza la tabla solo con los períodos de prima o cesantías. */
  soloTipos?: readonly TipoPeriodo[];
}) {
  const t = useTranslations('hrmNomina.periodos');
  const te = useTranslations('hrmNomina.estados');
  const tt = useTranslations('hrmNomina.tipos');
  const router = useRouter();
  const f = useFechas();
  const dinero = useDinero();
  const nombrar = useNombrePeriodo();
  const mensajeError = useErrorNomina();
  const [filtros, setFiltros] = useState<FiltrosPeriodos>(FILTROS_PERIODOS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [borrar, setBorrar] = useState<FilaPeriodo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const habilitada = resumen?.habilitada ?? false;
  const permisos = resumen?.permisos;
  const todas = useMemo(
    () => (resumen?.periodos ?? []).filter((p) => !soloTipos || soloTipos.includes(p.tipo)),
    [resumen, soloTipos]
  );
  const filas = useMemo(
    () => filtrarPeriodos(todas, filtros, (p) => `${nombrar(p)} ${p.fecha_pago ? f.corta(p.fecha_pago) : ''}`),
    [todas, filtros, nombrar, f]
  );
  const rango = calcularRango(pagina, tamano, filas.length);
  const visibles = filas.slice(rango.desde ? rango.desde - 1 : 0, rango.hasta);

  const cambiar = (p: Partial<FiltrosPeriodos>) => {
    setFiltros((x) => ({ ...x, ...p }));
    setPagina(1);
  };
  const limpiar = () => cambiar({ estados: [], tipos: [] });

  const abrir = (p: FilaPeriodo) => router.push(rutaPeriodo(p.id));

  const correr = async (p: FilaPeriodo) => {
    setOcupado(p.id);
    try {
      const r = await preliquidar(p.id);
      toast.success(r.reutilizado ? t('sinCambios') : t('preliquidado', { n: r.totales.empleados }));
      onRecargar();
    } catch (e) {
      toast.error(mensajeError(codigoDeError(e)));
    } finally {
      setOcupado(null);
    }
  };

  const accionesDe = (p: FilaPeriodo): AccionFila[] => {
    const a = accionesPeriodo({
      estado: estadoPeriodo(p.estado),
      permisos: permisos ?? { ver: true, procesar: false, cerrar: false, pagar: false, salario: false },
      habilitada,
      bloqueos: p.bloqueos,
      conCalculo: p.version !== null,
      revisionAprobada: false,
    });
    return [
      { id: 'abrir', etiqueta: t('menu.abrir'), icono: Eye, onSelect: () => abrir(p) },
      { id: 'preliquidar', etiqueta: t('menu.preliquidar'), icono: RefreshCw, onSelect: () => void correr(p), oculta: !a.preliquidar.visible, deshabilitada: ocupado === p.id },
      { id: 'recalcular', etiqueta: t('menu.recalcular'), icono: RefreshCw, onSelect: () => void correr(p), oculta: !a.recalcular.visible, deshabilitada: ocupado === p.id },
      {
        id: 'eliminar',
        etiqueta: t('menu.eliminar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setBorrar(p),
        oculta: !a.eliminar.visible,
        deshabilitada: !a.eliminar.habilitada,
        motivo: a.eliminar.motivo ? t('menu.eliminarConCalculo') : undefined,
      },
    ];
  };

  const rangoPago = (p: FilaPeriodo) =>
    [
      f.rangoCorto(p.desde, p.hasta),
      p.fecha_pago
        ? estadoPeriodo(p.estado) === 'pagado' || estadoPeriodo(p.estado) === 'contabilizado'
          ? t('pagada', { fecha: f.sinAnio(p.fecha_pago) })
          : t('pago', { fecha: f.sinAnio(p.fecha_pago) })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const pendientes = (p: FilaPeriodo) =>
    p.bloqueos || p.avisos ? (
      <div className="flex flex-wrap gap-1">
        {p.bloqueos ? <StatusBadge estado="bloqueo" tono="peligro" apariencia="contorno" etiqueta={t('nBloqueos', { n: p.bloqueos })} /> : null}
        {p.avisos ? <StatusBadge estado="aviso" tono="advertencia" apariencia="contorno" etiqueta={t('nAlertas', { n: p.avisos })} /> : null}
      </div>
    ) : (
      <span className="text-fg-muted">—</span>
    );

  const estadoCelda = (p: FilaPeriodo) => (
    <div className="flex flex-wrap items-center gap-1">
      <EstadoPeriodoBadge estado={p.estado} />
      {!habilitada && estadoPeriodo(p.estado) !== 'abierto' ? <InsigniaSoloPreliquidacion /> : null}
    </div>
  );

  const columnas: ColumnaTabla<FilaPeriodo>[] = [
    {
      id: 'periodo',
      encabezado: t('columnas.periodo'),
      celda: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{nombrar(p)}</p>
          <p className="truncate text-xs text-fg-secondary">{rangoPago(p)}</p>
        </div>
      ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoCelda },
    { id: 'empleados', encabezado: t('columnas.empleados'), alinear: 'derecha', ocultarDebajo: 'md', celda: (p) => <span className="tabular-nums">{p.empleados ?? '—'}</span> },
    {
      id: 'neto',
      encabezado: habilitada ? t('columnas.neto') : t('columnas.netoPreliquidado'),
      variante: 'importe',
      celda: (p) => (p.version === null ? <span className="text-fg-muted">—</span> : dinero(p.neto)),
    },
    {
      id: 'costo',
      encabezado: t('columnas.costo'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (p) => (p.version === null ? <span className="text-fg-muted">—</span> : dinero(p.costo_empleador)),
    },
    { id: 'pendientes', encabezado: t('columnas.pendientes'), ocultarDebajo: 'lg', celda: pendientes },
  ];

  const chips: ChipFiltro[] = [
    ...(filtros.estados.length ? [{ clave: 'estados', etiqueta: filtros.estados.map((e) => te(e)).join(', ') }] : []),
    ...(filtros.tipos.length ? [{ clave: 'tipos', etiqueta: filtros.tipos.map((x) => tt(x)).join(', ') }] : []),
  ];

  const estadoTabla =
    estado === 'cargando' ? 'cargando' : estado === 'sinPermiso' ? 'sinPermiso' : estado === 'error' ? 'error' : filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo';

  return (
    <>
      {(todas.length > 0 || estado === 'cargando' || filtros.texto || conteoFiltrosPeriodos(filtros) > 0) && estado !== 'error' ? (
        <ListToolbar
          busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} />}
          filtros={
            <FilterPanel conteo={conteoFiltrosPeriodos(filtros)} onLimpiar={limpiar} textoVerResultados={t('verN', { n: filas.length })}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
                {ESTADOS_FILTRO.map((e) => (
                  <label key={e} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                    <Checkbox
                      checked={filtros.estados.includes(e)}
                      onCheckedChange={(v) => cambiar({ estados: v === true ? [...filtros.estados, e] : filtros.estados.filter((x) => x !== e) })}
                    />
                    {te(e)}
                  </label>
                ))}
              </fieldset>
              {!soloTipos ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.tipo')}</legend>
                  {TIPOS_FILTRO.map((x) => (
                    <label key={x} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                      <Checkbox
                        checked={filtros.tipos.includes(x)}
                        onCheckedChange={(v) => cambiar({ tipos: v === true ? [...filtros.tipos, x] : filtros.tipos.filter((y) => y !== x) })}
                      />
                      {tt(x)}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </FilterPanel>
          }
          chips={chips.length ? <FilterChips chips={chips} onQuitar={(c) => cambiar(c === 'estados' ? { estados: [] } : { tipos: [] })} onLimpiarTodo={limpiar} /> : undefined}
        />
      ) : null}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(p) => p.id}
        estado={estadoTabla}
        onFilaClick={abrir}
        etiquetaFila={(p) => nombrar(p)}
        acciones={accionesDe}
        tarjetaMovil={(p) => (
          <ListCard
            icono={CalendarRange}
            titulo={nombrar(p)}
            subtitulo={rangoPago(p)}
            valor={p.version === null ? undefined : dinero(p.neto)}
            meta={p.empleados !== null ? t('nEmpleados', { n: p.empleados }) : undefined}
            estado={estadoCelda(p)}
            onClick={() => abrir(p)}
            acciones={accionesDe(p)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: CalendarRange,
          accion: permisos?.procesar && onNuevo ? { etiqueta: t('nuevo'), onClick: onNuevo, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={() => {
          setFiltros(FILTROS_PERIODOS_VACIOS);
          setPagina(1);
        }}
        termino={filtros.texto}
        error={{ titulo: t('error') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={onReintentar}
        pie={
          filas.length > 0 ? (
            <Pagination
              pagina={rango.pagina}
              tamano={tamano}
              total={filas.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              opcionesTamano={[10, 25, 50]}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            />
          ) : undefined
        }
      />

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(v) => !v && setBorrar(null)}
        tono="peligro"
        icono={Trash2}
        titulo={t('eliminar.titulo')}
        descripcion={borrar ? t('eliminar.descripcion', { nombre: nombrar(borrar) }) : ''}
        textoConfirmar={t('eliminar.confirmar')}
        cargando={ocupado === borrar?.id}
        onConfirmar={async () => {
          if (!borrar) return;
          setOcupado(borrar.id);
          try {
            await eliminarPeriodo(borrar.id);
            toast.success(t('eliminar.hecho'));
            setBorrar(null);
            onRecargar();
          } catch (e) {
            toast.error(mensajeError(codigoDeError(e)));
          } finally {
            setOcupado(null);
          }
        }}
      />
    </>
  );
}
