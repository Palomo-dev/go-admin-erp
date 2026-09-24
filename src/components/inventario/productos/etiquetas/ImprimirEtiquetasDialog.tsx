'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, Loader2, Printer, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField, HojaEtiquetas, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cargarProductosEtiquetables, type ProductoEtiquetable } from '@/lib/services/etiquetasProductoService';
import { claveErrorCodigos, generarCodigosFaltantes, type CodigoAsignado } from '@/lib/services/codigosBarrasService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { agruparEan13 } from '@/lib/utils/codigoBarras';
import {
  CAMPOS_POR_DEFECTO,
  PLANTILLAS_ETIQUETA,
  PLANTILLA_POR_DEFECTO,
  cantidadSegunStock,
  contarPaginas,
  distribuirEnPaginas,
  etiquetasPorHoja,
  expandirEtiquetas,
  normalizarCantidad,
  normalizarInicio,
  plantillaPorId,
  tamanoPagina,
  totalEtiquetas,
  MAX_ETIQUETAS,
  type CamposEtiqueta,
  type DatosEtiqueta,
} from '@/lib/utils/etiquetasImpresion';
import { guardarTrabajo, payloadEstacion } from './trabajoEtiquetas';

/**
 * «Imprimir etiquetas» (Figma `Diálogo · Imprimir etiquetas`, sección
 * `516:274675`; estados listo · sin código · generando · error · hoja móvil).
 *
 * Productos seleccionados (un producto con variantes se imprime por
 * variante), cantidad por fila (1 por defecto o «según el stock de la
 * sucursal»), formato de la plantilla `Doc/Etiqueta de producto`, qué se
 * imprime, vista previa fiel y dos salidas: la página de impresión del
 * navegador (`/imprimir/etiquetas`, con `@page`) y, si la sucursal tiene
 * estación de impresión, la cola `print_jobs`.
 *
 * Sin código de barras: aviso con «Generar códigos ahora» (RPC
 * `codigos_barras_generar_faltantes`, solo rellena huecos).
 */
export interface ImprimirEtiquetasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Productos elegidos (padres o sin variantes; sus variantes se incluyen solas). */
  productIds: number[];
  /** Se generaron códigos: el catálogo puede refrescar esas filas. */
  onCodigosGenerados?: (asignados: CodigoAsignado[]) => void;
}

type ModoCantidad = 'fija' | 'stock';
type Estado = 'cargando' | 'listo' | 'error';

const ANCHO_VISTA_PX = 300;
const PX_POR_MM = 96 / 25.4;

export function ImprimirEtiquetasDialog({ abierto, onAbiertoChange, productIds, onCodigosGenerados }: ImprimirEtiquetasDialogProps) {
  const t = useTranslations('inventarioEtiquetas.imprimir');
  const tc = useTranslations('inventarioEtiquetas.codigos');
  const td = useTranslations('inventarioEtiquetas.doc');
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { branchFilter, branches, selectedBranchId } = useBranch();
  // Precios con la moneda base de la organización, sus decimales y el locale de su
  // país (antes: siempre sin decimales y con locale es-CO, así 12,99 US$ salía 13).
  const { formatear: formatearPrecio } = useMonedaOrganizacion();

  const [estado, setEstado] = useState<Estado>('cargando');
  const [filas, setFilas] = useState<ProductoEtiquetable[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [modo, setModo] = useState<ModoCantidad>('fija');
  const [aplicarTodos, setAplicarTodos] = useState('1');
  const [plantillaId, setPlantillaId] = useState(PLANTILLA_POR_DEFECTO);
  const [inicio, setInicio] = useState('1');
  const [campos, setCampos] = useState<CamposEtiqueta>(CAMPOS_POR_DEFECTO);
  const [generando, setGenerando] = useState<number[] | null>(null);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);
  const [impresorasEstacion, setImpresorasEstacion] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const sucursalEstacion = selectedBranchId ?? branchFilter;
  const nombreSucursal =
    branchFilter !== null ? branches.find((b) => b.id === branchFilter)?.name ?? null : null;
  const plantilla = plantillaPorId(plantillaId);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    setEstado('cargando');
    try {
      const datos = await cargarProductosEtiquetables(orgId, productIds, branchFilter);
      setFilas(datos);
      setCantidades(Object.fromEntries(datos.map((d) => [d.productId, 1])));
      setModo('fija');
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [orgId, productIds, branchFilter]);

  useEffect(() => {
    if (!abierto) return;
    setErrorGenerar(null);
    void cargar();
  }, [abierto, cargar]);

  // ¿Hay estación de impresión en la sucursal? Sin ella no se ofrece enviar.
  useEffect(() => {
    if (!abierto || sucursalEstacion === null) {
      setImpresorasEstacion(0);
      return;
    }
    let vigente = true;
    PrintJobsService.getProductLabelPrinters(sucursalEstacion)
      .then((p) => vigente && setImpresorasEstacion(p.length))
      .catch(() => vigente && setImpresorasEstacion(0));
    return () => {
      vigente = false;
    };
  }, [abierto, sucursalEstacion]);

  const cantidadDe = (f: ProductoEtiquetable) => cantidades[f.productId] ?? 1;
  const sinCodigo = useMemo(() => filas.filter((f) => !f.codigo), [filas]);
  const total = totalEtiquetas(filas.map(cantidadDe));
  const inicioN = normalizarInicio(plantilla, Number(inicio));
  const paginas = contarPaginas(total, plantilla, inicioN);

  const datosDe = useCallback(
    (f: ProductoEtiquetable): DatosEtiqueta => ({
      productId: f.productId,
      nombre: f.nombre,
      variante: f.variante,
      precio: f.precio !== null ? formatearPrecio(f.precio) : null,
      precioComparacion: f.precioComparacion !== null ? formatearPrecio(f.precioComparacion) : null,
      sku: f.sku,
      codigo: f.codigo,
    }),
    [formatearPrecio],
  );

  const primeraHoja = useMemo((): (DatosEtiqueta | null)[] => {
    const etiquetas = expandirEtiquetas(filas.map((f) => ({ dato: datosDe(f), cantidad: cantidades[f.productId] ?? 1 })));
    const hojas = distribuirEnPaginas(etiquetas.slice(0, etiquetasPorHoja(plantilla)), plantilla, inicioN);
    return hojas[0] ?? Array<null>(etiquetasPorHoja(plantilla)).fill(null);
  }, [filas, cantidades, datosDe, plantilla, inicioN]);

  const cambiarModo = (m: ModoCantidad) => {
    setModo(m);
    setCantidades(
      Object.fromEntries(filas.map((f) => [f.productId, m === 'stock' ? cantidadSegunStock(f.stock, f.rastreaStock) : 1])),
    );
  };

  const generar = async (ids: number[]) => {
    if (!orgId || ids.length === 0) return;
    setGenerando(ids);
    setErrorGenerar(null);
    try {
      const asignados = await generarCodigosFaltantes(orgId, ids, false);
      const porId = new Map(asignados.map((a) => [a.productId, a.codigo]));
      setFilas((prev) => prev.map((f) => (porId.has(f.productId) ? { ...f, codigo: porId.get(f.productId) ?? f.codigo } : f)));
      if (asignados.length) {
        toast({ title: tc('generados', { n: asignados.length }) });
        onCodigosGenerados?.(asignados);
      }
    } catch (e) {
      setErrorGenerar(tc(claveErrorCodigos(e)));
    } finally {
      setGenerando(null);
    }
  };

  const filasConCantidad = () => filas.map((f) => ({ datos: datosDe(f), cantidad: cantidadDe(f) }));

  const abrirImpresion = (imprimirAlAbrir: boolean) => {
    const id = guardarTrabajo({
      plantillaId,
      inicio: inicioN,
      campos,
      etiquetas: expandirEtiquetas(filasConCantidad().map((f) => ({ dato: f.datos, cantidad: f.cantidad }))),
      imprimirAlAbrir,
    });
    if (!id) {
      toast({ variant: 'destructive', title: t('errorAlmacenamiento') });
      return;
    }
    const ventana = window.open(`/imprimir/etiquetas?trabajo=${id}`, '_blank');
    if (!ventana) toast({ variant: 'destructive', title: t('ventanaBloqueada') });
  };

  const enviarEstacion = async () => {
    if (sucursalEstacion === null) return;
    setEnviando(true);
    try {
      const r = await PrintJobsService.enqueueProductLabels(sucursalEstacion, payloadEstacion(filasConCantidad(), campos, t('rotuloAntes')));
      if (r.enqueued === 0) toast({ variant: 'destructive', title: t('sinEstacion') });
      else toast({ title: r.printedLocally > 0 ? t('estacionImpreso') : t('estacionEnCola'), description: t('totalEtiquetas', { n: (total) }) });
      if (r.enqueued > 0) onAbiertoChange(false);
    } catch {
      toast({ variant: 'destructive', title: t('errorEstacion') });
    } finally {
      setEnviando(false);
    }
  };

  const hojaTexto = plantilla.tipo === 'rollo' ? t('resumenRollo', { n: (total) }) : t('resumenHojas', {
    n: (total),
    hojas: (paginas),
    papel: t(`papel.${plantilla.papel ?? 'carta'}`),
    casilla: inicioN,
  });
  const nadaQueImprimir = total === 0;
  const demasiadas = total > MAX_ETIQUETAS;
  const motivo = nadaQueImprimir ? t('motivoCero') : demasiadas ? t('motivoTope', { n: (MAX_ETIQUETAS) }) : undefined;

  const pagina = tamanoPagina(plantilla);
  const escala = ANCHO_VISTA_PX / (pagina.anchoMm * PX_POR_MM);

  const descripcion = [
    t('seleccionados', { n: (productIds.length) }),
    nombreSucursal ?? (branches.length > 1 ? t('todasSucursales') : null),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={descripcion}
      icono={Printer}
      ancho={1024}
      pie={estado === 'listo' ? hojaTexto : undefined}
      secundarios={[
        ...(impresorasEstacion > 0
          ? [
              {
                etiqueta: t('enviarEstacion'),
                onClick: () => void enviarEstacion(),
                cargando: enviando,
                deshabilitada: estado !== 'listo' || !!motivo,
                motivo,
              },
            ]
          : []),
        {
          etiqueta: t('vistaPrevia'),
          onClick: () => abrirImpresion(false),
          deshabilitada: estado !== 'listo' || !!motivo,
          motivo,
        },
      ]}
      primario={{
        etiqueta: t('imprimir'),
        onClick: () => abrirImpresion(true),
        deshabilitada: estado !== 'listo' || !!motivo,
        motivo: estado !== 'listo' ? t('motivoCargando') : motivo,
      }}
    >
      {estado === 'cargando' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-fg-secondary" role="status">
          <Loader2 aria-hidden="true" className="size-6 animate-spin text-brand" />
          {t('cargando')}
        </div>
      )}

      {estado === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <span className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('errorCarga')}
          </span>
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover"
          >
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reintentar')}
          </button>
        </div>
      )}

      {estado === 'listo' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-5">
            {filas.length === 0 ? (
              <p className="rounded-lg bg-subtle px-4 py-6 text-center text-sm text-fg-secondary">{t('sinProductos')}</p>
            ) : (
              <>
                {sinCodigo.length > 0 && (
                  <div role="status" className="flex flex-col gap-3 rounded-lg border border-line-warning bg-warning-subtle px-4 py-3 text-sm text-warning-text sm:flex-row sm:items-center">
                    <span className="flex flex-1 items-start gap-2">
                      <Barcode aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                      {t('avisoSinCodigo', { n: sinCodigo.length, total: filas.length })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void generar(sinCodigo.map((f) => f.productId))}
                      disabled={generando !== null}
                      className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover disabled:opacity-50"
                    >
                      {generando && generando.length > 1 && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                      {t('generarAhora', { n: sinCodigo.length })}
                    </button>
                  </div>
                )}
                {errorGenerar && (
                  <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                    {errorGenerar}
                  </p>
                )}

                <section className="flex flex-col gap-3" aria-labelledby="etq-productos">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id="etq-productos" className="text-sm font-semibold text-fg">
                      {t('productosYCantidad')}
                    </h3>
                    <SegmentedControl
                      etiqueta={t('modoCantidad')}
                      tamano="sm"
                      valor={modo}
                      onValorChange={cambiarModo}
                      opciones={[
                        { valor: 'fija', etiqueta: t('cantidadFija') },
                        { valor: 'stock', etiqueta: t('segunStock') },
                      ]}
                    />
                  </div>
                  <ul className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {filas.map((f) => (
                      <li key={f.productId} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{f.nombre}</p>
                          <p className="truncate text-xs text-fg-secondary">
                            {[f.variante, modo === 'stock' && f.rastreaStock ? t('stockEn', { n: (f.stock ?? 0) }) : null]
                              .filter(Boolean)
                              .join(' · ') || ' '}
                          </p>
                        </div>
                        <div className="hidden w-40 shrink-0 text-xs sm:block">
                          {f.codigo ? (
                            <span className="font-mono text-fg-secondary">{agruparEan13(f.codigo)}</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-line-warning bg-warning-subtle px-2 py-0.5 text-warning-text">{td('sinCodigo')}</span>
                              <button
                                type="button"
                                onClick={() => void generar([f.productId])}
                                disabled={generando !== null}
                                className="text-link hover:underline disabled:opacity-50"
                              >
                                {generando?.length === 1 && generando[0] === f.productId ? t('generando') : t('generarUno')}
                              </button>
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={MAX_ETIQUETAS}
                          aria-label={t('cantidadDe', { nombre: [f.nombre, f.variante].filter(Boolean).join(' ') })}
                          value={String(cantidadDe(f))}
                          onChange={(e) => setCantidades((c) => ({ ...c, [f.productId]: normalizarCantidad(e.target.value) }))}
                          className="h-10 w-20 shrink-0 text-right tabular-nums"
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label htmlFor="etq-aplicar-todos" className="text-fg-secondary">
                      {t('aplicarATodos')}
                    </label>
                    <Input
                      id="etq-aplicar-todos"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={aplicarTodos}
                      onChange={(e) => setAplicarTodos(e.target.value)}
                      className="h-10 w-20 text-right tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = normalizarCantidad(aplicarTodos);
                        setModo('fija');
                        setCantidades(Object.fromEntries(filas.map((f) => [f.productId, n])));
                      }}
                      className="h-10 rounded-lg border border-line-strong bg-surface px-3 font-medium text-fg hover:bg-hover"
                    >
                      {t('aplicarALos', { n: (filas.length) })}
                    </button>
                    <span className="ml-auto font-medium text-fg" aria-live="polite">
                      {t('totalEtiquetas', { n: (total) })}
                    </span>
                  </div>
                </section>
              </>
            )}

            <section className="flex flex-col gap-3" aria-labelledby="etq-formato">
              <h3 id="etq-formato" className="text-sm font-semibold text-fg">
                {t('formato')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <FormField etiqueta={t('tamano')}>
                  {(c) => (
                    <Select value={plantillaId} onValueChange={setPlantillaId}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANTILLAS_ETIQUETA.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {t(`plantillas.${p.id}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('empezarEn')} ayuda={plantilla.tipo === 'rollo' ? t('empezarEnRollo') : undefined}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={etiquetasPorHoja(plantilla)}
                    disabled={plantilla.tipo === 'rollo'}
                    value={plantilla.tipo === 'rollo' ? '1' : inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    className="h-10 text-right tabular-nums"
                  />
                </FormField>
              </div>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="etq-campos">
              <h3 id="etq-campos" className="text-sm font-semibold text-fg">
                {t('queSeImprime')}
              </h3>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {(Object.keys(CAMPOS_POR_DEFECTO) as (keyof CamposEtiqueta)[]).map((campo) => (
                  <label key={campo} className="flex items-center gap-3 text-sm text-fg">
                    <Switch
                      checked={campos[campo]}
                      disabled={campo === 'precioComparacion' && !campos.precio}
                      onCheckedChange={(v) => setCampos((c) => ({ ...c, [campo]: v }))}
                    />
                    {t(`campos.${campo}`)}
                  </label>
                ))}
              </div>
            </section>

            {sucursalEstacion !== null && impresorasEstacion === 0 && (
              <p className="text-xs text-fg-muted">{t('sinEstacionNota')}</p>
            )}
          </div>

          <aside className="flex flex-col gap-2" aria-label={t('vistaPreviaTitulo')}>
            <h3 className="text-sm font-semibold text-fg">{t('vistaPreviaTitulo')}</h3>
            <div className="flex justify-center rounded-lg border border-line bg-subtle p-3">
              <div
                className="overflow-hidden shadow-sm"
                style={{ width: pagina.anchoMm * PX_POR_MM * escala, height: pagina.altoMm * PX_POR_MM * escala }}
              >
                <HojaEtiquetas
                  plantilla={plantilla}
                  celdas={primeraHoja}
                  campos={campos}
                  textoSinCodigo={td('sinCodigo')}
                  textoInvalido={td('codigoInvalido')}
                  guias
                  style={{ transform: `scale(${escala})`, transformOrigin: 'top left' }}
                />
              </div>
            </div>
            <p className="text-xs text-fg-secondary">{hojaTexto}</p>
          </aside>
        </div>
      )}
    </Dialogo>
  );
}
