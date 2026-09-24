'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock, Hash, Package, Pencil, Plus, Star, StarOff, StickyNote, Trash2, Truck } from 'lucide-react';
import { AccionRapida, DataTable, ListCard, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { productoService } from '@/lib/services/productoService';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useProductoDetalle } from '../ContextoProducto';
import {
  DialogoProveedorProducto,
  type DatosProveedorProducto,
  type ProveedorOrg,
} from './DialogoProveedorProducto';
import {
  HistorialComprasProducto,
  aCompra,
  ultimaCompraPorProveedor,
  type CompraProducto,
} from './HistorialComprasProducto';

interface FilaProveedor {
  id: number;
  supplier_id: number;
  cost: number;
  lead_time_days: number | null;
  min_order_qty: number | null;
  is_preferred: boolean;
  supplier_sku: string | null;
  notes: string | null;
  supplier: ProveedorOrg | null;
}

const LIMITE_COMPRAS = 200;
const RUTA_PROVEEDORES = '/app/inventario/proveedores';

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Sub-pestaña «Proveedores» (A.10; Figma `Producto — Proveedores y
 * etiquetas`): tabla (tarjetas en móvil) con costo en la moneda de la
 * organización, última compra, días de entrega, pedido mínimo, SKU,
 * preferido (★, uno solo), notas, editar y eliminar; diálogo agregar/editar
 * con búsqueda y alta rápida de proveedor; e historial de compras.
 * Escribe en `product_suppliers` (RLS por organización).
 */
export function ProveedoresProducto() {
  const t = useTranslations('productoDetalle.proveedores');
  const tc = useTranslations('productoDetalle.comun');
  const tt = useTranslations('productoDetalle.acciones');
  const { toast } = useToast();
  const { producto, organizacionId, resumen, permisos, recargar, moneda, fechas, mensajeError } = useProductoDetalle();
  const locale = useLocaleIntl();

  const [filas, setFilas] = useState<FilaProveedor[]>([]);
  const [catalogo, setCatalogo] = useState<ProveedorOrg[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compras, setCompras] = useState<CompraProducto[]>([]);
  const [totalCompras, setTotalCompras] = useState(0);
  const [cargandoCompras, setCargandoCompras] = useState(true);
  const [errorCompras, setErrorCompras] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<DatosProveedorProducto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<FilaProveedor | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [cambiandoPreferido, setCambiandoPreferido] = useState<number | null>(null);

  const eliminado = producto.status === 'deleted';
  const sinPermiso = !!resumen && !permisos.editar;
  const bloqueado = eliminado || sinPermiso;
  const motivo = eliminado ? tt('motivoEliminado') : sinPermiso ? tt('motivoSinPermiso') : undefined;
  const cantidad = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }), [locale]);

  const cargar = useCallback(async () => {
    setError(null);
    const [ps, sup] = await Promise.all([
      supabase
        .from('product_suppliers')
        .select('id, supplier_id, cost, lead_time_days, min_order_qty, is_preferred, supplier_sku, notes, supplier:suppliers(id, uuid, name, nit)')
        .eq('product_id', producto.id)
        .order('is_preferred', { ascending: false })
        .order('id', { ascending: true }),
      supabase.from('suppliers').select('id, uuid, name, nit').eq('organization_id', organizacionId).order('name'),
    ]);
    const e = ps.error ?? sup.error;
    if (e) setError(mensajeError(e));
    else {
      setFilas(
        ((ps.data ?? []) as unknown as (Omit<FilaProveedor, 'cost' | 'min_order_qty'> & { cost: unknown; min_order_qty: unknown })[]).map((r) => ({
          ...r,
          cost: n(r.cost) ?? 0,
          min_order_qty: n(r.min_order_qty),
          is_preferred: !!r.is_preferred,
        })),
      );
      setCatalogo((sup.data ?? []) as ProveedorOrg[]);
    }
    setCargando(false);
  }, [producto.id, organizacionId, mensajeError]);

  const cargarCompras = useCallback(async () => {
    setCargandoCompras(true);
    setErrorCompras(null);
    try {
      const r = await productoService.historial(organizacionId, producto.id, { tipos: ['compra'], limite: LIMITE_COMPRAS });
      setCompras(r.eventos.map((e) => aCompra(e, producto.id)));
      setTotalCompras(r.total);
    } catch (e) {
      setErrorCompras(mensajeError(e));
    } finally {
      setCargandoCompras(false);
    }
  }, [organizacionId, producto.id, mensajeError]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);
  useEffect(() => {
    void cargarCompras();
  }, [cargarCompras]);

  const ultima = useMemo(() => ultimaCompraPorProveedor(compras), [compras]);
  const disponibles = useMemo(() => catalogo.filter((s) => !filas.some((f) => f.supplier_id === s.id)), [catalogo, filas]);
  // Como antes: sin proveedores libres (y con alguno asignado) no se puede agregar;
  // si la organización no tiene ninguno, el diálogo permite crearlo.
  const sinLibres = disponibles.length === 0 && filas.length > 0;
  const motivoAgregar = motivo ?? (sinLibres ? t('motivoSinLibres') : undefined);

  const abrirAgregar = () =>
    setDialogo({
      supplier_id: null,
      cost: resumen?.costo ?? null,
      lead_time_days: 0,
      min_order_qty: 1,
      supplier_sku: '',
      notes: '',
      is_preferred: filas.length === 0,
    });

  const abrirEditar = (f: FilaProveedor) =>
    setDialogo({
      id: f.id,
      supplier_id: f.supplier_id,
      cost: f.cost,
      lead_time_days: f.lead_time_days,
      min_order_qty: f.min_order_qty,
      supplier_sku: f.supplier_sku ?? '',
      notes: f.notes ?? '',
      is_preferred: f.is_preferred,
    });

  /** Deja a los demás sin preferido (un solo preferido por producto). */
  const quitarPreferidoAOtros = async (excepto: number | null) => {
    let q = supabase.from('product_suppliers').update({ is_preferred: false, updated_at: new Date().toISOString() }).eq('product_id', producto.id).eq('is_preferred', true);
    if (excepto !== null) q = q.neq('id', excepto);
    const { error: e } = await q;
    if (e) throw e;
  };

  const guardar = async (d: DatosProveedorProducto) => {
    if (!d.supplier_id) return;
    setGuardando(true);
    const campos = {
      cost: d.cost ?? 0,
      lead_time_days: d.lead_time_days ?? 0,
      min_order_qty: d.min_order_qty ?? 1,
      supplier_sku: d.supplier_sku.trim() || null,
      notes: d.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (d.id === undefined) {
        if (filas.some((f) => f.supplier_id === d.supplier_id)) {
          toast({ variant: 'destructive', title: t('toasts.duplicado') });
          return;
        }
        if (d.is_preferred) await quitarPreferidoAOtros(null);
        const { error: e } = await supabase
          .from('product_suppliers')
          .insert({ product_id: producto.id, supplier_id: d.supplier_id, is_preferred: d.is_preferred, ...campos });
        if (e) {
          if (e.code === '23505') {
            toast({ variant: 'destructive', title: t('toasts.duplicado') });
            return;
          }
          throw e;
        }
        toast({ title: t('toasts.agregado'), description: t('toasts.agregadoDetalle') });
      } else {
        if (d.is_preferred) await quitarPreferidoAOtros(d.id);
        const { error: e } = await supabase
          .from('product_suppliers')
          .update({ ...campos, is_preferred: d.is_preferred })
          .eq('id', d.id)
          .eq('product_id', producto.id);
        if (e) throw e;
        toast({ title: t('toasts.actualizado'), description: t('toasts.actualizadoDetalle') });
      }
      setDialogo(null);
      await Promise.all([cargar(), recargar()]);
    } catch (e) {
      toast({ variant: 'destructive', title: t('toasts.errorGuardar'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  const hacerPreferido = async (f: FilaProveedor) => {
    if (f.is_preferred || bloqueado) return;
    setCambiandoPreferido(f.id);
    try {
      await quitarPreferidoAOtros(f.id);
      const { error: e } = await supabase
        .from('product_suppliers')
        .update({ is_preferred: true, updated_at: new Date().toISOString() })
        .eq('id', f.id)
        .eq('product_id', producto.id);
      if (e) throw e;
      setFilas((fs) => fs.map((x) => ({ ...x, is_preferred: x.id === f.id })));
      toast({ title: t('toasts.preferido', { nombre: f.supplier?.name ?? '' }) });
      await recargar();
    } catch (e) {
      toast({ variant: 'destructive', title: t('toasts.errorGuardar'), description: mensajeError(e) });
      await cargar();
    } finally {
      setCambiandoPreferido(null);
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const { error: e } = await supabase.from('product_suppliers').delete().eq('id', aEliminar.id).eq('product_id', producto.id);
      if (e) throw e;
      toast({ title: t('toasts.eliminado'), description: t('toasts.eliminadoDetalle') });
      setAEliminar(null);
      await Promise.all([cargar(), recargar()]);
    } catch (e) {
      toast({ variant: 'destructive', title: t('toasts.errorEliminar'), description: mensajeError(e) });
    } finally {
      setEliminando(false);
    }
  };

  const fecha = (v: string) => formatDateInTz(v, fechas.timezone, { locale, day: '2-digit', month: 'short', year: 'numeric' });

  const accionesDe = (f: FilaProveedor): AccionFila[] => [
    { id: 'editar', etiqueta: tc('editar'), icono: Pencil, onSelect: () => abrirEditar(f), deshabilitada: bloqueado, motivo },
    {
      id: 'preferido',
      etiqueta: t('acciones.hacerPreferido'),
      icono: Star,
      onSelect: () => void hacerPreferido(f),
      oculta: f.is_preferred,
      deshabilitada: bloqueado,
      motivo,
    },
    { id: 'eliminar', etiqueta: tc('eliminar'), icono: Trash2, destructiva: true, onSelect: () => setAEliminar(f), deshabilitada: bloqueado, motivo },
  ];

  const nombre = (f: FilaProveedor) => f.supplier?.name ?? tc('desconocido');
  const enlace = (f: FilaProveedor) =>
    f.supplier?.uuid ? (
      <Link href={`${RUTA_PROVEEDORES}/${f.supplier.uuid}`} className="font-medium text-fg hover:text-link hover:underline">
        {nombre(f)}
      </Link>
    ) : (
      <span className="font-medium text-fg">{nombre(f)}</span>
    );

  const estrella = (f: FilaProveedor) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void hacerPreferido(f);
      }}
      disabled={bloqueado || cambiandoPreferido !== null}
      aria-pressed={f.is_preferred}
      aria-label={f.is_preferred ? t('acciones.esPreferido', { nombre: nombre(f) }) : t('acciones.hacerPreferidoDe', { nombre: nombre(f) })}
      title={motivo ?? (f.is_preferred ? t('acciones.esPreferidoCorto') : t('acciones.hacerPreferido'))}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed',
        f.is_preferred ? 'text-warning' : 'text-fg-muted hover:bg-hover hover:text-warning',
      )}
    >
      {f.is_preferred ? <Star className="size-4 fill-current" aria-hidden /> : <StarOff className="size-4" aria-hidden />}
    </button>
  );

  const costoConUltima = (f: FilaProveedor) => {
    const u = ultima.get(f.supplier_id);
    return (
      <div className="flex flex-col items-end">
        <span>{moneda.formatear(f.cost)}</span>
        {u && (
          <span className="text-xs font-normal text-fg-secondary" title={t('ultimaCompraTitulo')}>
            {t('ultimaCompra', { costo: moneda.formatear(u.costoUnitario), fecha: fecha(u.fecha) })}
          </span>
        )}
      </div>
    );
  };

  const columnas: ColumnaTabla<FilaProveedor>[] = [
    {
      id: 'proveedor',
      encabezado: t('columnas.proveedor'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          {enlace(f)}
          {f.supplier?.nit && <span className="text-xs text-fg-secondary">{t('nit', { nit: f.supplier.nit })}</span>}
        </div>
      ),
    },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: costoConUltima },
    { id: 'dias', encabezado: t('columnas.diasEntrega'), variante: 'importe', celda: (f) => t('dias', { n: f.lead_time_days ?? 0 }) },
    { id: 'minimo', encabezado: t('columnas.pedidoMinimo'), variante: 'importe', celda: (f) => (f.min_order_qty !== null ? cantidad.format(f.min_order_qty) : '—') },
    { id: 'sku', encabezado: t('columnas.sku'), variante: 'mono', celda: (f) => f.supplier_sku || '—', ocultarDebajo: 'xl' },
    { id: 'preferido', encabezado: t('columnas.preferido'), alinear: 'centro', celda: estrella, ancho: 96 },
    {
      id: 'notas',
      encabezado: t('columnas.notas'),
      ocultarDebajo: 'xl',
      celda: (f) => (f.notes ? <span className="line-clamp-2 max-w-[220px] text-fg-secondary" title={f.notes}>{f.notes}</span> : '—'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label={t('titulo')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
            <p className="text-sm text-fg-secondary">{t('subtitulo')}</p>
          </div>
          <Button onClick={abrirAgregar} disabled={cargando || !!error || !!motivoAgregar} title={motivoAgregar} className="gap-1.5">
            <Plus className="size-4" aria-hidden /> {t('agregar')}
          </Button>
        </div>
        {motivoAgregar && sinLibres && !motivo && <p className="text-xs text-fg-secondary">{motivoAgregar}</p>}

        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(f) => String(f.id)}
          etiquetaFila={nombre}
          estado={cargando ? 'cargando' : error ? 'error' : 'listo'}
          onReintentar={() => {
            setCargando(true);
            void cargar();
          }}
          error={{ titulo: t('estados.errorTitulo'), descripcion: error ?? undefined }}
          vacio={{
            titulo: t('estados.vacioTitulo'),
            descripcion: t('estados.vacioDescripcion'),
            icono: Truck,
            accion: bloqueado ? undefined : { etiqueta: t('agregarPrimero'), onClick: abrirAgregar, icono: Plus },
          }}
          accionesRapidas={(f) => (
            <AccionRapida etiqueta={tc('editar')} icono={Pencil} soloIcono onClick={() => abrirEditar(f)} deshabilitada={bloqueado} motivo={motivo} />
          )}
          acciones={accionesDe}
          tarjetaMovil={(f) => {
            const u = ultima.get(f.supplier_id);
            return (
              <ListCard
                icono={Truck}
                titulo={nombre(f)}
                insignia={f.is_preferred ? <Star className="size-4 shrink-0 fill-current text-warning" aria-label={t('acciones.esPreferidoCorto')} /> : undefined}
                subtitulo={f.supplier?.nit ? t('nit', { nit: f.supplier.nit }) : undefined}
                valor={moneda.formatear(f.cost)}
                datos={[
                  { icono: CalendarClock, texto: t('dias', { n: f.lead_time_days ?? 0 }), etiqueta: t('columnas.diasEntrega') },
                  f.min_order_qty !== null
                    ? { icono: Package, texto: t('minimoCorto', { n: cantidad.format(f.min_order_qty) }), etiqueta: t('columnas.pedidoMinimo') }
                    : null,
                  f.supplier_sku ? { icono: Hash, texto: <span className="font-mono">{f.supplier_sku}</span>, etiqueta: t('columnas.sku') } : null,
                  u ? { icono: Truck, texto: t('ultimaCompra', { costo: moneda.formatear(u.costoUnitario), fecha: fecha(u.fecha) }), etiqueta: t('ultimaCompraTitulo') } : null,
                  f.notes ? { icono: StickyNote, texto: f.notes, etiqueta: t('columnas.notas') } : null,
                ]}
                acciones={accionesDe(f)}
              />
            );
          }}
        />
      </section>

      <HistorialComprasProducto
        compras={compras}
        total={totalCompras}
        limite={LIMITE_COMPRAS}
        cargando={cargandoCompras}
        error={errorCompras}
        onReintentar={() => void cargarCompras()}
      />

      <DialogoProveedorProducto
        abierto={dialogo !== null}
        onAbiertoChange={(v) => !v && !guardando && setDialogo(null)}
        inicial={dialogo ?? { supplier_id: null, cost: null, lead_time_days: 0, min_order_qty: 1, supplier_sku: '', notes: '', is_preferred: false }}
        disponibles={disponibles}
        nombreEditando={(() => {
          const f = dialogo?.id !== undefined ? filas.find((x) => x.id === dialogo.id) : undefined;
          return f ? `${nombre(f)}${f.supplier?.nit ? ` · ${t('nit', { nit: f.supplier.nit })}` : ''}` : undefined;
        })()}
        moneda={moneda}
        guardando={guardando}
        onGuardar={(d) => void guardar(d)}
        onProveedorCreado={(p) => setCatalogo((c) => [...c, p].sort((a, b) => a.name.localeCompare(b.name)))}
      />

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(v) => !v && !eliminando && setAEliminar(null)}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion', { nombre: aEliminar ? nombre(aEliminar) : '' })}
        confirmLabel={eliminando ? tc('eliminando') : tc('eliminar')}
        cancelLabel={tc('cancelar')}
        variant="destructive"
        loading={eliminando}
        onConfirm={eliminar}
      />
    </div>
  );
}
