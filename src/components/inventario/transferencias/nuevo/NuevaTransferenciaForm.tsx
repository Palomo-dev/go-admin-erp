'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Info, Save, Search, Send, Trash2 } from 'lucide-react';
import { BranchBadgeActiva, CampoNumero, EmptyState, FormField, FormSection, PageHeader } from '@/components/kit';
import { AgregarProductosDialog } from '@/components/kit/documento';
import type { ProductoDocumento } from '@/components/kit/documento/edicionDocumentoLogica';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { branchService } from '@/lib/services/branchService';
import { ErrorPeticionTraslado, clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import type { ProductoTrasladable } from '@/lib/inventario/transferencias/contrato';
import {
  RUTA_TRASLADOS,
  claveRenglon,
  disponibleRenglon,
  leerPrefill,
  nuevaClave,
  rutaTraslado,
  totalesRenglones,
  validarRenglones,
  type RenglonFormulario,
} from '@/lib/inventario/transferencias/logica';
import { cn } from '@/utils/Utils';
import { useCantidad, useMensajeErrorTraslado } from '../piezas';

const LOTE_AUTOMATICO = 'auto';

interface SucursalOpcion {
  id: number;
  nombre: string;
}

/**
 * Nuevo traslado y edición de uno pendiente (Figma 589:322911 escritorio,
 * 975:186790 móvil). Origen de las sucursales del usuario, destino distinto,
 * nota; productos por «Agregar productos» (el diálogo del kit, con escáner)
 * con lo disponible en el origen por lote. «Crear sin despachar» deja el
 * traslado pendiente; «Crear y despachar» descuenta el origen ahora (P7) y
 * nunca más de lo disponible (P5). Los productos con seriales se despachan
 * desde el detalle, donde se escanea cada serial. Conserva `?producto_id&origen`.
 */
export function NuevaTransferenciaForm({ trasladoId }: { trasladoId?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('inventarioTraslados.nuevo');
  const tc = useTranslations('inventarioTraslados.comun');
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();
  const moneda = useMonedaOrganizacion();
  const { formatPlain } = useFormatDate();
  const permisos = usePermisosInventario();
  const { branches, branchFilter, isLoading: cargandoSucursales } = useBranch();
  const edicion = typeof trasladoId === 'number';

  const [destinos, setDestinos] = useState<SucursalOpcion[]>([]);
  const [origen, setOrigen] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [renglones, setRenglones] = useState<RenglonFormulario[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [guardando, setGuardando] = useState<'crear' | 'despachar' | null>(null);
  const [intento, setIntento] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [cargaEdicion, setCargaEdicion] = useState<'cargando' | 'listo' | 'noEditable' | 'error'>(edicion ? 'cargando' : 'listo');
  const [codigo, setCodigo] = useState<string>('');
  const clave = useRef(nuevaClave('traslado'));
  const porId = useRef(new Map<number, ProductoTrasladable>());

  const origenes: SucursalOpcion[] = useMemo(() => branches.filter((b) => b.id != null).map((b) => ({ id: Number(b.id), nombre: b.name })), [branches]);
  const nombreDe = useCallback((id: number | null) => destinos.find((b) => b.id === id)?.nombre ?? origenes.find((b) => b.id === id)?.nombre ?? '', [destinos, origenes]);

  // Todas las sucursales activas de la organización (destino).
  useEffect(() => {
    const org = getOrganizationId();
    if (!org) return;
    branchService
      .getBranches(org)
      .then((bs) => setDestinos(bs.filter((b) => b.is_active !== false && b.id != null).map((b) => ({ id: Number(b.id), nombre: b.name }))))
      .catch(() => setDestinos([]));
  }, []);

  // Relee lo disponible de los productos de la lista en el origen elegido.
  const refrescarDisponible = useCallback(async (org: number, ids: number[]) => {
    if (ids.length === 0) return new Map<number, ProductoTrasladable>();
    const productos = await clienteTraslados.productos({ origen: org, ids, limite: 100 });
    const m = new Map(productos.map((p) => [p.product_id, p]));
    m.forEach((p, id) => porId.current.set(id, p));
    return m;
  }, []);

  // Nuevo: origen del enlace (?origen) o de la sucursal del encabezado; producto del enlace (?producto_id).
  useEffect(() => {
    if (edicion || cargandoSucursales || origen !== null) return;
    const pre = leerPrefill(params);
    const candidato = pre.origen ?? branchFilter ?? origenes[0]?.id ?? null;
    const valido = candidato !== null && origenes.some((o) => o.id === candidato) ? candidato : (origenes[0]?.id ?? null);
    setOrigen(valido);
    if (valido && pre.productoId) {
      refrescarDisponible(valido, [pre.productoId])
        .then((m) => {
          const p = m.get(pre.productoId!);
          if (p) setRenglones([{ clave: claveRenglon(p.product_id, null), producto: p, lot_id: null, cantidad: null }]);
        })
        .catch(() => undefined);
    }
  }, [edicion, cargandoSucursales, origenes, branchFilter, params, origen, refrescarDisponible]);

  // Edición: carga el traslado pendiente.
  useEffect(() => {
    if (!edicion) return;
    let vigente = true;
    clienteTraslados
      .detalle(trasladoId!)
      .then(async (d) => {
        if (!vigente) return;
        setCodigo(d.traslado.code);
        if (d.traslado.estado !== 'pending' || !d.permisos.trasladar) {
          setCargaEdicion('noEditable');
          return;
        }
        setOrigen(d.traslado.origen.id);
        setDestino(d.traslado.destino.id);
        setNotas(d.traslado.notas ?? '');
        const m = await refrescarDisponible(d.traslado.origen.id, [...new Set(d.items.map((i) => i.product_id))]);
        if (!vigente) return;
        setRenglones(
          d.items
            .filter((i) => m.has(i.product_id))
            .map((i) => ({ clave: claveRenglon(i.product_id, i.lote?.id ?? null), producto: m.get(i.product_id)!, lot_id: i.lote?.id ?? null, cantidad: i.cantidad })),
        );
        setCargaEdicion('listo');
      })
      .catch(() => vigente && setCargaEdicion('error'));
    return () => {
      vigente = false;
    };
  }, [edicion, trasladoId, refrescarDisponible]);

  const cambiarOrigen = (nuevo: number) => {
    setOrigen(nuevo);
    if (destino === nuevo) setDestino(null);
    const ids = [...new Set(renglones.map((r) => r.producto.product_id))];
    refrescarDisponible(nuevo, ids)
      .then((m) =>
        setRenglones((rs) =>
          rs
            .filter((r) => m.has(r.producto.product_id))
            .map((r) => {
              const p = m.get(r.producto.product_id)!;
              const lote = r.lot_id !== null && p.lotes.some((l) => l.lot_id === r.lot_id) ? r.lot_id : null;
              return { ...r, producto: p, lot_id: lote, clave: claveRenglon(p.product_id, lote) };
            }),
        ),
      )
      .catch(() => undefined);
  };

  const buscar = useCallback(
    async (texto: string, filtros: { conStock: boolean }, senal: AbortSignal): Promise<ProductoDocumento[]> => {
      if (!origen) return [];
      const productos = await clienteTraslados.productos({ origen, q: texto || undefined, limite: 30 }, senal);
      productos.forEach((p) => porId.current.set(p.product_id, p));
      return productos
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

  const alAgregar = (p: ProductoDocumento) => {
    const producto = porId.current.get(p.id);
    if (!producto) return;
    setRenglones((rs) => {
      if (rs.some((r) => r.producto.product_id === producto.product_id && r.lot_id === null)) {
        toast({ title: t('yaEsta', { nombre: producto.nombre }) });
        return rs;
      }
      return [...rs, { clave: claveRenglon(producto.product_id, null), producto, lot_id: null, cantidad: null }];
    });
    window.setTimeout(() => {
      const campos = document.querySelectorAll<HTMLInputElement>('[data-cantidad-traslado]');
      campos[campos.length - 1]?.focus();
    }, 50);
  };

  const actualizar = (claveR: string, cambio: Partial<RenglonFormulario>) =>
    setRenglones((rs) =>
      rs.map((r) => {
        if (r.clave !== claveR) return r;
        const nuevo = { ...r, ...cambio };
        return { ...nuevo, clave: 'lot_id' in cambio ? claveRenglon(nuevo.producto.product_id, nuevo.lot_id) : r.clave };
      }),
    );

  const errores = validarRenglones(renglones);
  const totales = totalesRenglones(renglones);
  const conSeriales = renglones.some((r) => r.producto.track_serial);
  const avisos = Object.keys(errores).length;
  const listo = !!origen && !!destino && origen !== destino && renglones.length > 0 && avisos === 0;

  const guardar = async (despachar: boolean) => {
    setIntento(true);
    setErrorServidor(null);
    if (!listo || !origen || !destino) return;
    setGuardando(despachar ? 'despachar' : 'crear');
    const datos = {
      origen,
      destino,
      notas: notas.trim() || null,
      items: renglones.map((r) => ({ product_id: r.producto.product_id, quantity: r.cantidad ?? 0, lot_id: r.lot_id })),
    };
    try {
      if (edicion) {
        const r = await clienteTraslados.editar(trasladoId!, datos);
        toast({ title: t('guardado', { codigo: r.code }) });
        router.push(despachar ? `${rutaTraslado(r.id)}?despachar=1` : rutaTraslado(r.id));
        return;
      }
      // Con seriales se despacha desde el detalle: allí se escanea cada serial.
      const despacharAqui = despachar && !conSeriales;
      const r = await clienteTraslados.crear({ ...datos, despachar: despacharAqui, clave: clave.current });
      if (r.creado && r.codigo) {
        toast({ variant: 'destructive', title: t('creadoSinDespachar', { codigo: r.code, motivo: mensajeError(new ErrorPeticionTraslado(r.codigo, 409, r.detalle ?? null)) }) });
        router.push(rutaTraslado(r.id));
        return;
      }
      toast({ title: despacharAqui ? t('creadoDespachado', { codigo: r.code }) : t('creado', { codigo: r.code }) });
      router.push(despachar && conSeriales ? `${rutaTraslado(r.id)}?despachar=1` : rutaTraslado(r.id));
    } catch (e) {
      setErrorServidor(mensajeError(e));
      setGuardando(null);
    }
  };

  const titulo = edicion ? t('tituloEditar', { codigo: codigo || '…' }) : t('titulo');
  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('tituloCorto'), href: RUTA_TRASLADOS },
    { etiqueta: edicion ? codigo || '…' : t('titulo') },
  ];
  const volverA = edicion && trasladoId ? rutaTraslado(trasladoId) : RUTA_TRASLADOS;

  const cabecera = (
    <PageHeader
      titulo={titulo}
      subtitulo={t('subtitulo')}
      icono={ArrowLeftRight}
      variante="form"
      volverA={volverA}
      migas={migas}
      debajo={<BranchBadgeActiva />}
      acciones={
        cargaEdicion === 'listo' && permisos.trasladar ? (
          <>
            <Button variant="ghost" className="h-10" onClick={() => router.push(volverA)} disabled={guardando !== null}>
              {t('cancelar')}
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => guardar(false)} disabled={guardando !== null}>
              <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {edicion ? t('guardar') : t('crearSinDespachar')}
            </Button>
            <Button className="h-10 gap-2" onClick={() => guardar(true)} disabled={guardando !== null}>
              <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {guardando === 'despachar' ? t('despachando') : edicion ? t('guardarYDespachar') : t('crearYDespachar')}
            </Button>
          </>
        ) : undefined
      }
      movil={{
        titulo,
        subtitulo: origen && destino ? tc('rutaDe', { origen: nombreDe(origen), destino: nombreDe(destino) }) : undefined,
        ocultarBarra: true,
      }}
    />
  );

  if (permisos.resueltos && !permisos.trasladar) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: tc('volver'), href: RUTA_TRASLADOS }} />
      </div>
    );
  }
  if (!cargandoSucursales && origenes.length === 0) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }
  if (cargaEdicion !== 'listo') {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        {cargaEdicion === 'cargando' ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : cargaEdicion === 'noEditable' ? (
          <EmptyState titulo={t('noEditable.titulo')} descripcion={t('noEditable.descripcion')} icono={ArrowLeftRight} accion={{ etiqueta: t('noEditable.ver'), href: volverA }} />
        ) : (
          <EmptyState variante="error" titulo={t('errorCarga')} />
        )}
      </div>
    );
  }

  const errorRenglon = (r: RenglonFormulario): string | null => {
    const e = errores[r.clave];
    if (!e || (!intento && e === 'cantidad_requerida')) return null;
    if (e === 'supera_disponible') return t('errores.supera_disponible', { n: cantidad(disponibleRenglon(r)) });
    return t(`errores.${e}`);
  };

  const selectorLote = (r: RenglonFormulario, compacto = false) => {
    if (!r.producto.track_lots) {
      return (
        <Select disabled value="sin">
          <SelectTrigger className={cn('h-10 border-line bg-subtle text-fg-muted', compacto && 'h-9')} aria-label={t('loteDe', { producto: r.producto.nombre })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sin">{tc('sinLote')}</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Select value={r.lot_id === null ? LOTE_AUTOMATICO : String(r.lot_id)} onValueChange={(v) => actualizar(r.clave, { lot_id: v === LOTE_AUTOMATICO ? null : Number(v) })}>
        <SelectTrigger className={cn('h-10 border-line-strong bg-surface', compacto && 'h-9')} aria-label={t('loteDe', { producto: r.producto.nombre })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LOTE_AUTOMATICO}>{t('lote.automatico')}</SelectItem>
          {r.producto.lotes.map((l) => (
            <SelectItem key={l.lot_id} value={String(l.lot_id)} disabled={l.vencido}>
              {l.vence ? t('lote.vence', { codigo: l.codigo, fecha: formatPlain(l.vence) }) : l.codigo}
              {l.vencido ? ` · ${t('lote.vencido')}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const campoCantidad = (r: RenglonFormulario, sufijo = 'e') => {
    const error = errorRenglon(r);
    return (
      <>
        <CampoNumero
          valor={r.cantidad}
          onValorChange={(v) => actualizar(r.clave, { cantidad: v })}
          decimales={r.producto.track_serial ? 0 : 3}
          minimo={0}
          alinear="derecha"
          data-cantidad-traslado=""
          aria-label={t('cantidadDe', { producto: r.producto.nombre })}
          aria-invalid={!!error}
          aria-describedby={error ? `traslado-error-${sufijo}-${r.clave}` : undefined}
        />
        {error && (
          <p id={`traslado-error-${sufijo}-${r.clave}`} className="mt-1 text-xs text-danger-text" role="alert">
            {error}
          </p>
        )}
      </>
    );
  };

  const seccionProductos = (
    <FormSection
      titulo={t('productos.titulo', {
        productos: t('productos.nProductos', { count: totales.productos, n: totales.productos }),
        unidades: t('productos.nUnidades', { count: totales.unidades, n: cantidad(totales.unidades) }),
      })}
      descripcion={origen ? t('productos.ayuda', { origen: nombreDe(origen) }) : t('productos.ayudaSinOrigen')}
    >
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setAgregando(true)}
          disabled={!origen}
          className="flex h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm text-fg-muted hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Search aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('productos.buscar')}
        </button>

        {renglones.length === 0 ? (
          <p className={cn('rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-secondary', intento && 'border-line-danger text-danger-text')}>
            {t('productos.vacio')}
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('productos.tabla')}</caption>
                <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{t('columnas.producto')}</th>
                    <th scope="col" className="w-60 px-3 py-3 font-medium">{t('columnas.lote')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.disponible')}</th>
                    <th scope="col" className="w-36 px-3 py-3 font-medium">{t('columnas.cantidad')}</th>
                    {permisos.costos && <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.costo')}</th>}
                    <th scope="col" className="w-12 px-2 py-3">
                      <span className="sr-only">{t('columnas.quitar')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r) => (
                    <tr key={r.clave} className="border-t border-line align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-fg">{r.producto.nombre}</p>
                        <p className="text-xs text-fg-secondary">
                          {[r.producto.sku ? tc('sku', { sku: r.producto.sku }) : null, r.producto.variante, r.producto.track_serial ? t('conSeriales') : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td className="px-3 py-3">{selectorLote(r)}</td>
                      <td className={cn('px-3 py-3 text-right tabular-nums', disponibleRenglon(r) > 0 ? 'text-fg' : 'text-danger-text')}>
                        {cantidad(disponibleRenglon(r))}
                      </td>
                      <td className="px-3 py-3">{campoCantidad(r)}</td>
                      {permisos.costos && (
                        <td className="px-3 py-3 text-right tabular-nums text-fg">
                          {r.producto.costo_promedio !== null ? moneda.formatear(r.producto.costo_promedio) : '—'}
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
                          aria-label={t('quitar', { producto: r.producto.nombre })}
                        >
                          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-3 md:hidden">
              {renglones.map((r) => {
                const disponible = disponibleRenglon(r);
                const error = errores[r.clave];
                return (
                  <li key={r.clave} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-fg">{r.producto.variante ? `${r.producto.nombre} · ${r.producto.variante}` : r.producto.nombre}</p>
                        <p className="text-xs text-fg-secondary">{t('disponibleEnOrigen', { n: cantidad(disponible) })}</p>
                        {error === 'supera_disponible' && <p className="text-xs text-warning-text">{t('soloHay', { n: cantidad(disponible) })}</p>}
                      </div>
                      <div className="w-28">{campoCantidad(r, 'm')}</div>
                    </div>
                    {r.producto.track_lots && <div className="mt-3">{selectorLote(r, true)}</div>}
                    <Button
                      variant="ghost"
                      className="mt-2 h-8 gap-1 px-2 text-danger-text"
                      onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('quitarCorto')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </FormSection>
  );

  return (
    <div className="flex flex-col gap-4 pb-28 lg:gap-5 lg:pb-0">
      {cabecera}

      <FormSection titulo={t('ruta.titulo')} columnas={3}>
        <FormField etiqueta={t('ruta.saleDe')} obligatorio ayuda={t('ruta.ayudaOrigen')} error={intento && !origen ? t('ruta.requerido') : null}>
          {(c) => (
            <Select value={origen ? String(origen) : ''} onValueChange={(v) => cambiarOrigen(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('ruta.elegir')} />
              </SelectTrigger>
              <SelectContent>
                {origenes.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField
          etiqueta={t('ruta.llegaA')}
          obligatorio
          ayuda={t('ruta.ayudaDestino')}
          error={intento && !destino ? t('ruta.requerido') : null}
        >
          {(c) => (
            <Select value={destino ? String(destino) : ''} onValueChange={(v) => setDestino(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('ruta.elegir')} />
              </SelectTrigger>
              <SelectContent>
                {destinos
                  .filter((b) => b.id !== origen)
                  .map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('ruta.nota')}>
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} placeholder={t('ruta.notaPlaceholder')} className="h-10 border-line-strong bg-surface" />
        </FormField>
      </FormSection>

      {seccionProductos}

      {errorServidor && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {errorServidor}
        </p>
      )}

      <p className="hidden items-start gap-2 rounded-lg bg-subtle px-4 py-3 text-[13px] text-fg-secondary md:flex">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('pie')}
      </p>

      {/* Móvil: barra fija con el resumen y las dos acciones (Figma 975:186790). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 md:hidden">
        <p className="mb-2 text-[13px] text-fg-secondary">
          {[
            t('productos.nProductos', { count: totales.productos, n: totales.productos }),
            t('productos.nUnidades', { count: totales.unidades, n: cantidad(totales.unidades) }),
            avisos > 0 ? t('nAvisos', { count: avisos, n: avisos }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={() => guardar(false)} disabled={guardando !== null}>
            {edicion ? t('guardar') : t('guardarBorrador')}
          </Button>
          <Button className="h-11" onClick={() => guardar(true)} disabled={guardando !== null}>
            {guardando === 'despachar' ? t('despachando') : t('crearYDespachar')}
          </Button>
        </div>
      </div>

      <AgregarProductosDialog
        abierto={agregando}
        onAbiertoChange={setAgregando}
        variante="venta"
        titulo={t('productos.dialogoTitulo')}
        descripcion={origen ? t('productos.dialogoDescripcion', { origen: nombreDe(origen) }) : undefined}
        moneda={moneda}
        buscar={buscar}
        onAgregar={alAgregar}
      />
    </div>
  );
}
