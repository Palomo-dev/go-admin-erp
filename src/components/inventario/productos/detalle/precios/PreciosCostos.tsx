'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, CalendarDays, DollarSign, TrendingUp } from 'lucide-react';
import { DataTable, ListCard, SegmentedControl, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { productoService } from '@/lib/services/productoService';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { calcularMargen, descuentoComparacion, tonoMargen, variacionPorcentual } from '../../logica/margen';
import { useProductoDetalle } from '../ContextoProducto';
import {
  aFilasVigencia,
  estadoVigencia,
  programadoDe,
  serieGrafico,
  type EstadoVigencia,
  type FilaVigencia,
  type TipoVigencia,
} from './datosPrecios';
import { DialogoCosto } from './DialogoCosto';
import { DialogoPrecio } from './DialogoPrecio';
import { GraficoPrecios } from './GraficoPrecios';

const LIMITE = 500;

/**
 * Precios y costos (Figma `Producto — Stock y Precios`, A.9 de
 * PARIDAD-DETALLE-PRODUCTO-FIDELIDAD): precio y costo vigentes reales, lo
 * programado, «Actualizar precio» y «Actualizar costo» (vigencia programable,
 * en el servidor), gráfico real de evolución y el historial de precios y de
 * costos (Vigente · Programado · Cancelado) con cambio %.
 */
export function PreciosCostos() {
  const t = useTranslations('productoDetalle.precios');
  const ta = useTranslations('productoDetalle.acciones');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, cargandoResumen, permisos, moneda, fechas, recargar, mensajeError } = useProductoDetalle();
  const locale = useLocaleIntl();

  const [filas, setFilas] = useState<FilaVigencia[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<TipoVigencia>('precio');
  const [incluirVariantes, setIncluirVariantes] = useState(false);
  const [dialogo, setDialogo] = useState<TipoVigencia | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const { eventos } = await productoService.historial(organizacionId, producto.id, { tipos: ['precio', 'costo'], limite: LIMITE });
      setFilas(aFilasVigencia(eventos));
      setAhora(Date.now());
      setEstado('listo');
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
      setEstado('error');
    }
  }, [organizacionId, producto.id, mensajeError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tieneVariantes = (producto.children ?? []).length > 0;
  const motivo =
    producto.status === 'deleted' ? ta('motivoEliminado') : resumen && !permisos.editar ? ta('motivoSinPermiso') : undefined;
  const bloqueado = !!motivo || !resumen;

  const precio = resumen?.precio ?? null;
  const comparacion = resumen?.precio_comparacion ?? null;
  const costo = resumen?.costo ?? null;
  const descuento = descuentoComparacion(precio, comparacion);
  const margen = calcularMargen(precio, costo);
  const precioProgramado = programadoDe(filas, 'precio', producto.id, ahora);
  const costoProgramado = programadoDe(filas, 'costo', producto.id, ahora);
  const serie = useMemo(() => serieGrafico(filas, producto.id, ahora), [filas, producto.id, ahora]);
  const nombreVariante = useMemo(() => new Map((producto.children ?? []).map((v) => [v.id, v.name])), [producto.children]);

  const visibles = useMemo(
    () => filas.filter((f) => f.tipo === vista && (incluirVariantes || f.productId === producto.id)),
    [filas, vista, incluirVariantes, producto.id],
  );
  const conteo = (tipo: TipoVigencia) => filas.filter((f) => f.tipo === tipo && (incluirVariantes || f.productId === producto.id)).length;

  const tras = async () => {
    await Promise.all([recargar(), cargar()]);
  };

  const fechaHora = (v: string | null) => formatDateTimeInTz(v, fechas.timezone, { locale });
  const porcentaje = useMemo(
    () => new Intl.NumberFormat(locale, { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );

  const badgeVigencia = (f: FilaVigencia): ReactNode => {
    const e: EstadoVigencia = estadoVigencia(f, ahora);
    if (e === 'cancelado') return <Badge tono="neutro" tamano="sm">{t('vigencias.cancelado')}</Badge>;
    if (e === 'programado') return <Badge tono="informacion" tamano="sm">{t('vigencias.programado')}</Badge>;
    if (e === 'vigente') return <Badge tono="exito" tamano="sm">{t('vigencias.vigente')}</Badge>;
    return <span className="tabular-nums text-fg">{fechaHora(f.hasta)}</span>;
  };

  const cambio = (f: FilaVigencia): ReactNode => {
    const v = variacionPorcentual(f.anterior, f.valor);
    if (v === null) return <span className="text-fg-muted">—</span>;
    return (
      <Badge tono={v > 0 ? 'exito' : v < 0 ? 'peligro' : 'neutro'} tamano="sm">
        {t('porcentaje', { valor: porcentaje.format(v) })}
      </Badge>
    );
  };

  const descuentoFila = (f: FilaVigencia): ReactNode => {
    const d = descuentoComparacion(f.valor, f.comparacion);
    return d === null ? <span className="text-fg-muted">—</span> : <Badge tono="peligro" tamano="sm">{t('descuento', { valor: d })}</Badge>;
  };

  const nombreProducto = (f: FilaVigencia) =>
    f.productId === producto.id ? t('tabla.productoPrincipal') : (f.productoNombre ?? nombreVariante.get(f.productId) ?? `#${f.productId}`);

  const columnas: ColumnaTabla<FilaVigencia>[] = [
    {
      id: 'desde',
      encabezado: t('tabla.desde'),
      celda: (f) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <CalendarDays className="size-3.5 text-fg-muted" aria-hidden />
          {fechaHora(f.desde)}
        </span>
      ),
    },
    { id: 'hasta', encabezado: t('tabla.hasta'), celda: badgeVigencia },
    ...(incluirVariantes
      ? [{ id: 'producto', encabezado: t('tabla.producto'), celda: (f: FilaVigencia) => nombreProducto(f) } satisfies ColumnaTabla<FilaVigencia>]
      : []),
    {
      id: 'valor',
      encabezado: vista === 'precio' ? t('tabla.precio') : t('tabla.costo'),
      variante: 'importe',
      alinear: 'derecha',
      celda: (f) => <span className={f.cancelado ? 'text-fg-muted line-through' : 'font-semibold'}>{moneda.formatear(f.valor)}</span>,
    },
    ...(vista === 'precio'
      ? ([
          {
            id: 'comparacion',
            encabezado: t('tabla.comparacion'),
            alinear: 'derecha',
            variante: 'importe',
            celda: (f) =>
              f.comparacion ? <span className="text-fg-muted line-through">{moneda.formatear(f.comparacion)}</span> : <span className="text-fg-muted">—</span>,
          },
          { id: 'descuento', encabezado: t('tabla.descuento'), alinear: 'centro', celda: descuentoFila },
        ] satisfies ColumnaTabla<FilaVigencia>[])
      : ([
          { id: 'proveedor', encabezado: t('tabla.proveedor'), celda: (f) => f.proveedor ?? <span className="text-fg-muted">—</span> },
        ] satisfies ColumnaTabla<FilaVigencia>[])),
    { id: 'cambio', encabezado: t('tabla.cambio'), alinear: 'centro', celda: cambio },
  ];

  const estadoTabla: EstadoTabla = estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : visibles.length === 0 ? 'vacio' : 'listo';

  const botonAccion = (tipo: TipoVigencia, icono: ReactNode, texto: string, primario: boolean) => (
    <Button
      variant={primario ? 'default' : 'outline'}
      onClick={() => setDialogo(tipo)}
      disabled={bloqueado}
      title={motivo}
      aria-describedby={motivo ? 'precios-motivo' : undefined}
      className="w-full sm:w-auto"
    >
      {icono}
      {texto}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Tarjetas: precio, costo y programado (A.9 #1-#3) */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tarjeta titulo={t('precioActual')} ayuda={t('precioActualAyuda')} cargando={cargandoResumen && !resumen}>
          <p className="text-3xl font-semibold tabular-nums text-fg">{precio !== null ? moneda.formatear(precio) : t('sinPrecio')}</p>
          {descuento !== null && comparacion !== null && (
            <p className="mt-1 flex items-center gap-2 text-sm">
              <Badge tono="peligro" tamano="sm">
                {t('descuento', { valor: descuento })}
              </Badge>
              <span className="text-fg-muted line-through tabular-nums">{moneda.formatear(comparacion)}</span>
            </p>
          )}
          {resumen?.precio_desde && <p className="mt-2 text-xs text-fg-secondary">{t('vigenteDesde', { fecha: fechaHora(resumen.precio_desde) })}</p>}
        </Tarjeta>

        <Tarjeta titulo={t('costoActual')} ayuda={t('costoActualAyuda')} cargando={cargandoResumen && !resumen}>
          <p className="text-3xl font-semibold tabular-nums text-fg">{costo !== null ? moneda.formatear(costo) : t('sinCosto')}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-fg-secondary">
            {margen !== null ? <Badge tono={tonoMargen(margen)} tamano="sm">{t('margen', { valor: margen })}</Badge> : t('sinMargen')}
          </p>
          {resumen?.costo_desde && <p className="mt-2 text-xs text-fg-secondary">{t('vigenteDesde', { fecha: fechaHora(resumen.costo_desde) })}</p>}
        </Tarjeta>

        {(precioProgramado || costoProgramado) && (
          <Tarjeta titulo={t('programado.titulo')} ayuda={t('programado.ayuda')} icono={<CalendarClock className="size-4 text-info-text" aria-hidden />}>
            <ul className="flex flex-col gap-2 text-sm">
              {precioProgramado && (
                <li>
                  <span className="font-semibold tabular-nums text-fg">{moneda.formatear(precioProgramado.valor)}</span>{' '}
                  <span className="text-fg-secondary">
                    {t('programado.precio', { fecha: fechaHora(precioProgramado.desde) })}
                  </span>
                </li>
              )}
              {costoProgramado && (
                <li>
                  <span className="font-semibold tabular-nums text-fg">{moneda.formatear(costoProgramado.valor)}</span>{' '}
                  <span className="text-fg-secondary">
                    {t('programado.costo', { fecha: fechaHora(costoProgramado.desde) })}
                  </span>
                </li>
              )}
            </ul>
            <p className="mt-2 text-xs text-fg-muted">{t('programado.nota')}</p>
          </Tarjeta>
        )}
      </div>

      {/* Acciones (A.9 #4 y «Actualizar costo», Nuevo) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {botonAccion('precio', <TrendingUp className="size-4" aria-hidden />, t('actualizarPrecio'), true)}
        {botonAccion('costo', <DollarSign className="size-4" aria-hidden />, t('actualizarCosto'), false)}
        {motivo && (
          <p id="precios-motivo" className="text-xs text-fg-secondary">
            {motivo}
          </p>
        )}
      </div>

      {/* Gráfico (A.9 #11) */}
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="precios-grafico">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="precios-grafico" className="text-base font-semibold text-fg">
            {t('grafico.titulo')}
          </h3>
          {estado === 'listo' && serie.length > 0 && (
            <span className="text-xs text-fg-secondary">{t('grafico.cambios', { count: Math.max(serie.length - 1, 0) })}</span>
          )}
        </div>
        {estado === 'cargando' ? (
          <Skeleton className="h-64 w-full" />
        ) : estado === 'error' ? (
          <p className="flex h-40 items-center justify-center text-sm text-danger-text">{error ?? tc('errorCargar')}</p>
        ) : (
          <GraficoPrecios serie={serie} moneda={moneda} timezone={fechas.timezone} ahora={ahora} />
        )}
      </section>

      {/* Historial de precios y de costos (A.9 #12-#16) */}
      <section className="flex flex-col gap-3" aria-labelledby="precios-historial">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="precios-historial" className="text-base font-semibold text-fg">
            {t('tabla.titulo')}
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {tieneVariantes && (
              <label className="flex items-center gap-2 text-sm text-fg">
                <Switch checked={incluirVariantes} onCheckedChange={setIncluirVariantes} />
                {t('tabla.incluirVariantes')}
              </label>
            )}
            <SegmentedControl<TipoVigencia>
              etiqueta={t('tabla.titulo')}
              valor={vista}
              onValorChange={setVista}
              opciones={[
                { valor: 'precio', etiqueta: t('tabla.precios'), contador: estado === 'listo' ? conteo('precio') : undefined },
                { valor: 'costo', etiqueta: t('tabla.costos'), contador: estado === 'listo' ? conteo('costo') : undefined },
              ]}
            />
          </div>
        </div>

        <DataTable<FilaVigencia>
          etiqueta={vista === 'precio' ? t('tabla.precios') : t('tabla.costos')}
          columnas={columnas}
          filas={visibles}
          obtenerId={(f) => f.clave}
          estado={estadoTabla}
          filasEsqueleto={4}
          onReintentar={() => void cargar()}
          error={{ descripcion: error ?? undefined }}
          vacio={{
            titulo: vista === 'precio' ? t('tabla.vacioPrecios') : t('tabla.vacioCostos'),
            descripcion: t('tabla.vacioAyuda'),
            icono: vista === 'precio' ? TrendingUp : DollarSign,
          }}
          tarjetaMovil={(f) => (
            <ListCard
              icono={CalendarDays}
              titulo={fechaHora(f.desde)}
              subtitulo={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {t('tabla.hasta')}: {badgeVigencia(f)}
                </span>
              }
              valor={<span className={f.cancelado ? 'text-fg-muted line-through' : undefined}>{moneda.formatear(f.valor)}</span>}
              meta={incluirVariantes ? nombreProducto(f) : vista === 'costo' ? (f.proveedor ?? undefined) : undefined}
              etiquetas={
                <>
                  {vista === 'precio' && f.comparacion ? (
                    <span className="text-xs text-fg-muted line-through tabular-nums">{moneda.formatear(f.comparacion)}</span>
                  ) : null}
                  {vista === 'precio' && descuentoComparacion(f.valor, f.comparacion) !== null ? descuentoFila(f) : null}
                  {variacionPorcentual(f.anterior, f.valor) !== null ? cambio(f) : null}
                </>
              }
            />
          )}
        />
      </section>

      <DialogoPrecio abierto={dialogo === 'precio'} onAbiertoChange={(v) => setDialogo(v ? 'precio' : null)} onGuardado={() => void tras()} />
      <DialogoCosto abierto={dialogo === 'costo'} onAbiertoChange={(v) => setDialogo(v ? 'costo' : null)} onGuardado={() => void tras()} />
    </div>
  );
}

function Tarjeta({
  titulo,
  ayuda,
  icono,
  cargando,
  children,
}: {
  titulo: string;
  ayuda: string;
  icono?: ReactNode;
  cargando?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label={titulo}>
      <div className="mb-2 flex items-center gap-2">
        {icono}
        <div>
          <h3 className="text-sm font-medium text-fg">{titulo}</h3>
          <p className="text-xs text-fg-muted">{ayuda}</p>
        </div>
      </div>
      {cargando ? <Skeleton className="h-9 w-40" /> : children}
    </section>
  );
}
