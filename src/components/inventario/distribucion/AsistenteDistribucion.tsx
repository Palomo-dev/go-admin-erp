'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Info, Search, Trash2, Waypoints } from 'lucide-react';
import { CampoNumero, EmptyState, PanelAdaptable, Stepper, StatusBadge } from '@/components/kit';
import { AgregarProductosDialog } from '@/components/kit/documento';
import type { ProductoDocumento } from '@/components/kit/documento/edicionDocumentoLogica';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { clienteDistribucion, clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import type { OrdenDistribuible, ProductoTrasladable } from '@/lib/inventario/transferencias/contrato';
import { evaluarReparto, nuevaClave, productosDeOrden, type ProductoReparto, type Reparto } from '@/lib/inventario/transferencias/logica';
import { useCantidad, useMensajeErrorTraslado } from '@/components/inventario/transferencias/piezas';
import { cn } from '@/utils/Utils';

type Paso = 'que' | 'reparto' | 'revisar';
const SUELTOS = 'sueltos';

export interface AsistenteDistribucionProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  origen: { id: number; nombre: string } | null;
  /** Sucursales destino posibles (todas menos el origen). */
  destinos: readonly { id: number; nombre: string }[];
  onCreado: () => void;
}

/**
 * «Nueva distribución» (Figma 607:163577 · 163711 · 163905): 1) qué
 * distribuir —una orden de producción completada en el origen o productos
 * sueltos—; 2) reparto por sucursal con el tope de lo disponible en el origen
 * y de lo que falta distribuir de la orden; 3) revisar y crear un traslado por
 * sucursal en UNA transacción (`fn_distribucion_crear`), con «Marcar en
 * tránsito al crear» (despacha: sale del origen hoy). Idempotente: repetir la
 * creación no duplica los traslados.
 */
export function AsistenteDistribucion({ abierto, onAbiertoChange, origen, destinos, onCreado }: AsistenteDistribucionProps) {
  const t = useTranslations('inventarioDistribucion.asistente');
  const { toast } = useToast();
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();
  const moneda = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();

  const [paso, setPaso] = useState<Paso>('que');
  const [ordenes, setOrdenes] = useState<OrdenDistribuible[] | null>(null);
  const [fuente, setFuente] = useState<string>('');
  const [sueltos, setSueltos] = useState<ProductoTrasladable[]>([]);
  const [reparto, setReparto] = useState<Reparto>({});
  const [despachar, setDespachar] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClave('distribucion'));
  const porId = useRef(new Map<number, ProductoTrasladable>());

  useEffect(() => {
    if (!abierto || !origen) return;
    setPaso('que');
    setReparto({});
    setSueltos([]);
    setError(null);
    setDespachar(true);
    clave.current = nuevaClave('distribucion');
    setOrdenes(null);
    let vigente = true;
    clienteDistribucion
      .ordenes(origen.id)
      .then((o) => {
        if (!vigente) return;
        setOrdenes(o);
        setFuente(o.length > 0 ? String(o[0].id) : SUELTOS);
      })
      .catch(() => {
        if (!vigente) return;
        setOrdenes([]);
        setFuente(SUELTOS);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, origen]);

  const orden = ordenes?.find((o) => String(o.id) === fuente) ?? null;
  const productos: ProductoReparto[] = useMemo(
    () => (orden ? productosDeOrden(orden) : sueltos.map((p) => ({ product_id: p.product_id, nombre: p.nombre, maximo: p.disponible }))),
    [orden, sueltos],
  );
  const conSeriales = orden ? false : sueltos.some((p) => p.track_serial);
  const idsDestino = useMemo(() => destinos.map((d) => d.id), [destinos]);
  const resultado = useMemo(() => evaluarReparto(productos, idsDestino, reparto), [productos, idsDestino, reparto]);

  const buscar = useCallback(
    async (texto: string, filtros: { conStock: boolean }, senal: AbortSignal): Promise<ProductoDocumento[]> => {
      if (!origen) return [];
      const r = await clienteTraslados.productos({ origen: origen.id, q: texto || undefined, limite: 30 }, senal);
      r.forEach((p) => porId.current.set(p.product_id, p));
      return r
        .filter((p) => !filtros.conStock || p.disponible > 0)
        .map((p) => ({
          id: p.product_id,
          nombre: p.variante ? `${p.nombre} · ${p.variante}` : p.nombre,
          sku: p.sku,
          codigoBarras: p.barcode,
          precio: p.costo_promedio ?? 0,
          stock: p.disponible,
          controlaStock: true,
          serial: p.track_serial,
          lotes: p.lotes.length || null,
        }));
    },
    [origen],
  );

  const cambiarCantidad = (productId: number, destino: number, valor: number | null) =>
    setReparto((r) => ({ ...r, [productId]: { ...(r[productId] ?? {}), [destino]: valor } }));

  const crear = async () => {
    if (!origen || !resultado.valido) return;
    setCreando(true);
    setError(null);
    try {
      const r = await clienteDistribucion.crear({
        origen: origen.id,
        production_order_id: orden?.id ?? null,
        despachar: despachar && !conSeriales,
        envios: resultado.envios,
        clave: clave.current,
      });
      toast({ title: t('listo', { count: r.traslados.length, n: r.traslados.length }) });
      onAbiertoChange(false);
      onCreado();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCreando(false);
    }
  };

  const pasos = [
    { valor: 'que' as const, etiqueta: t('pasos.que') },
    { valor: 'reparto' as const, etiqueta: t('pasos.reparto') },
    { valor: 'revisar' as const, etiqueta: t('pasos.revisar') },
  ];
  const descripcion =
    paso === 'que' ? t('descripcionQue', { origen: origen?.nombre ?? '' }) : paso === 'reparto' ? t('descripcionReparto') : t('descripcionRevisar');
  const puedeSeguir = paso === 'que' ? productos.length > 0 && productos.some((p) => p.maximo > 0) : paso === 'reparto' ? resultado.valido : false;

  const cuerpoQue = () => {
    if (ordenes === null) return <Skeleton className="h-40 rounded-xl" aria-label={t('cargando')} />;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <label htmlFor="distribucion-fuente" className="shrink-0 text-sm font-medium text-fg">
            {t('queDistribuir')}
          </label>
          <Select value={fuente} onValueChange={(v) => { setFuente(v); setReparto({}); }}>
            <SelectTrigger id="distribucion-fuente" className="h-10 flex-1 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ordenes.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {t('ordenOpcion', {
                    numero: o.numero,
                    producto: o.producto.nombre,
                    n: cantidad(o.producido),
                    unidad: (o.producto.unidad ?? '').trim(),
                    fecha: o.completado_en ? formatDate(o.completado_en) : '—',
                  })}
                </SelectItem>
              ))}
              <SelectItem value={SUELTOS}>{t('sueltos')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {orden ? (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('queDistribuir')}</caption>
              <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">{t('columnas.producto')}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t('columnas.producido')}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t('columnas.disponible')}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t('columnas.ya')}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t('columnas.por')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-fg">{orden.producto.nombre}</td>
                  <td className="px-3 py-3 tabular-nums">{cantidad(orden.producido)}</td>
                  <td className="px-3 py-3 tabular-nums">{cantidad(orden.disponible)}</td>
                  <td className="px-3 py-3 tabular-nums">{cantidad(orden.ya_distribuido)}</td>
                  <td className="px-3 py-3 font-medium tabular-nums">{cantidad(orden.por_distribuir)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {ordenes.length === 0 && <p className="text-[13px] text-fg-secondary">{t('sinOrdenes', { origen: origen?.nombre ?? '' })}</p>}
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="flex h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm text-fg-muted hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Search aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('agregarProducto')}
            </button>
            {sueltos.length > 0 && (
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                {sueltos.map((p) => (
                  <li key={p.product_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{p.nombre}</span>
                      <span className="block text-xs text-fg-secondary">{t('disponibleN', { n: cantidad(p.disponible) })}</span>
                    </span>
                    <Button variant="ghost" size="icon" className="size-9" onClick={() => setSueltos((s) => s.filter((x) => x.product_id !== p.product_id))} aria-label={t('quitar', { producto: p.nombre })}>
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-4 py-3 text-[13px] text-info-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('notaMaximo')}
        </p>
      </div>
    );
  };

  const cuerpoReparto = () => {
    if (destinos.length === 0) return <EmptyState compacto titulo={t('sinDestinos')} icono={Waypoints} />;
    return (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('pasos.reparto')}</caption>
            <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t('columnas.producto')}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t('columnas.por')}</th>
                {destinos.map((d) => (
                  <th key={d.id} scope="col" className="min-w-32 px-3 py-3 font-medium">{d.nombre}</th>
                ))}
                <th scope="col" className="px-3 py-3 font-medium">{t('columnas.queda')}</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const queda = resultado.queda[p.product_id] ?? p.maximo;
                return (
                  <tr key={p.product_id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-fg">{p.nombre}</td>
                    <td className="px-3 py-3 tabular-nums">{cantidad(p.maximo)}</td>
                    {destinos.map((d) => (
                      <td key={d.id} className="px-3 py-2">
                        <CampoNumero
                          valor={reparto[p.product_id]?.[d.id] ?? null}
                          onValorChange={(v) => cambiarCantidad(p.product_id, d.id, v)}
                          decimales={3}
                          minimo={0}
                          alinear="derecha"
                          aria-label={t('cantidadPara', { producto: p.nombre, sucursal: d.nombre })}
                          aria-invalid={queda < 0}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <StatusBadge estado={queda < 0 ? 'vencido' : 'activo'} etiqueta={cantidad(queda)} tono={queda < 0 ? 'peligro' : 'exito'} apariencia="contorno" tamano="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {resultado.excedidos.length > 0 && (
          <p role="alert" className="rounded-lg bg-danger-subtle px-4 py-3 text-[13px] text-danger-text">
            {resultado.excedidos
              .map((e) => t('excedido', { producto: e.nombre, repartido: cantidad(e.repartido), maximo: cantidad(e.maximo) }))
              .join(' ')}
          </p>
        )}
      </div>
    );
  };

  const cuerpoRevisar = () => (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('pasos.revisar')}</caption>
          <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t('columnas.traslado')}</th>
              <th scope="col" className="px-3 py-3 font-medium">{t('columnas.destino')}</th>
              <th scope="col" className="px-3 py-3 font-medium">{t('columnas.productos')}</th>
              <th scope="col" className="px-3 py-3 font-medium">{t('columnas.unidades')}</th>
            </tr>
          </thead>
          <tbody>
            {resultado.envios.map((e, i) => (
              <tr key={e.destino} className="border-t border-line">
                <td className="px-4 py-3 text-fg">{t('nuevoN', { n: i + 1 })}</td>
                <td className="px-3 py-3 text-fg">{destinos.find((d) => d.id === e.destino)?.nombre ?? `#${e.destino}`}</td>
                <td className="px-3 py-3">{t('nProductos', { count: e.items.length, n: e.items.length })}</td>
                <td className="px-3 py-3 tabular-nums">{cantidad(e.items.reduce((s, x) => s + x.quantity, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-4 py-3 text-[13px] text-info-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('notaCrear', { origen: origen?.nombre ?? '' })}
      </p>
      <label className={cn('flex items-center gap-2 text-sm text-fg', conSeriales && 'opacity-60')}>
        <Checkbox checked={despachar && !conSeriales} disabled={conSeriales} onCheckedChange={(v) => setDespachar(v === true)} className="size-[18px] rounded" />
        {t('marcarTransito')}
      </label>
      {conSeriales && <p className="text-[13px] text-fg-secondary">{t('conSeriales')}</p>}
      {error && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );

  const anterior: Record<Paso, Paso | null> = { que: null, reparto: 'que', revisar: 'reparto' };
  const siguiente: Record<Paso, Paso | null> = { que: 'reparto', reparto: 'revisar', revisar: null };

  return (
    <>
      <PanelAdaptable
        abierto={abierto}
        onAbiertoChange={(v) => !creando && onAbiertoChange(v)}
        titulo={t('titulo')}
        descripcion={descripcion}
        icono={Waypoints}
        ancho={1120}
        ocupado={creando}
        bloquearClicFuera
        debajoCabecera={
          <Stepper
            pasos={pasos}
            actual={paso}
            onPasoClick={(v) => (pasos.findIndex((p) => p.valor === v) < pasos.findIndex((p) => p.valor === paso) ? setPaso(v) : undefined)}
            resumenMovil={(n, total, etiqueta) => t('resumenPaso', { n, total, etiqueta })}
            etiqueta={t('titulo')}
          />
        }
        pie={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {anterior[paso] && (
              <Button variant="ghost" className="h-10 gap-2" onClick={() => setPaso(anterior[paso]!)} disabled={creando}>
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('atras')}
              </Button>
            )}
            <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={creando}>
              {t('cancelar')}
            </Button>
            {siguiente[paso] ? (
              <Button className="h-10 gap-2" onClick={() => setPaso(siguiente[paso]!)} disabled={!puedeSeguir}>
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('siguiente')}
              </Button>
            ) : (
              <Button className="h-10 gap-2" onClick={crear} disabled={creando || !resultado.valido}>
                <Waypoints aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {creando ? t('creando') : t('crear', { count: resultado.envios.length, n: resultado.envios.length })}
              </Button>
            )}
          </div>
        }
      >
        {paso === 'que' ? cuerpoQue() : paso === 'reparto' ? cuerpoReparto() : cuerpoRevisar()}
      </PanelAdaptable>
      <AgregarProductosDialog
        abierto={agregando}
        onAbiertoChange={setAgregando}
        variante="venta"
        titulo={t('agregarTitulo')}
        descripcion={t('agregarDescripcion', { origen: origen?.nombre ?? '' })}
        moneda={moneda}
        buscar={buscar}
        onAgregar={(p) => {
          const producto = porId.current.get(p.id);
          if (producto) setSueltos((s) => (s.some((x) => x.product_id === producto.product_id) ? s : [...s, producto]));
        }}
      />
    </>
  );
}
