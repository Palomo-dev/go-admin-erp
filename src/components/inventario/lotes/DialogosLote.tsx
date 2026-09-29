'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Layers, SlidersHorizontal, Trash2 } from 'lucide-react';
import { CampoFecha, CampoNumero, Dialogo, FormField, SupplierPicker, type ProveedorPicker } from '@/components/kit';
import { simboloMoneda } from '@/components/kit/documento';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { buscarProveedores } from '@/lib/services/compras/lecturasCompras';
import type { StockFila } from '@/lib/services/stockService';
import { diferenciaCantidad, LARGO_MOTIVO, MOTIVOS_SALIDA } from '../stock/logica';
import { SelectorProductoStock } from '../stock/SelectorProductoStock';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from '../stock/useInventarioB1';
import { ajustarLote, eliminarLote, guardarLote } from './LotesService';
import type { LoteFila } from './types';

// ─── Nuevo / editar lote (Figma 522:62899) ───────────────────────────────────

export interface DialogoLoteProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  /** Con lote: edición (sin cantidad inicial). */
  lote?: LoteFila | null;
  /** Producto preseleccionado (desde el detalle del producto). */
  producto?: StockFila | null;
  /** Mostrar el costo (permiso `costos`). */
  verCostos: boolean;
  /** Puede registrar la cantidad inicial (permiso `ajustar`). */
  puedeAjustar: boolean;
  onGuardado?: () => void;
}

export function DialogoLote(props: DialogoLoteProps) {
  if (!props.abierto) return null;
  return <FormularioLote {...props} />;
}

function FormularioLote({ abierto, onAbiertoChange, organizacionId, lote, producto: productoInicial, puedeAjustar, onGuardado }: DialogoLoteProps) {
  const edicion = !!lote;
  const t = useTranslations('inventarioLotes.dialogo');
  const { toast } = useToast();
  const mensajeError = useMensajeErrorInventario();
  const moneda = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { branches, sucursalActiva } = useAlcanceSucursales();

  const [producto, setProducto] = useState<StockFila | null>(productoInicial ?? null);
  const [codigo, setCodigo] = useState(lote?.lot_code ?? '');
  const [sucursalId, setSucursalId] = useState<number | null>(lote?.branch_id ?? sucursalActiva);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [vence, setVence] = useState(lote?.expiry_date ?? '');
  const [costo, setCosto] = useState<number | null>(productoInicial?.costo_promedio ?? null);
  const [proveedor, setProveedor] = useState<ProveedorPicker | null>(
    lote?.supplier_id ? { id: String(lote.supplier_id), nombre: lote.proveedor ?? `#${lote.supplier_id}` } : null,
  );
  const [notas, setNotas] = useState(lote?.notas ?? '');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const conCantidad = !edicion && (cantidad ?? 0) > 0;
  const errores = {
    producto: !edicion && !producto ? t('errores.producto') : null,
    sucursal: conCantidad && !sucursalId ? t('errores.sucursal') : null,
    cantidad: cantidad !== null && cantidad < 0 ? t('errores.cantidad') : null,
    costo: conCantidad && (costo === null || costo < 0) ? t('errores.costo') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);
  const err = (k: keyof typeof errores) => (intentado ? errores[k] : null);

  const buscarProv = useCallback(
    async (texto: string, senal: AbortSignal) =>
      (await buscarProveedores(organizacionId, texto, senal)).map((p) => ({ id: String(p.id), nombre: p.name, nit: p.nit, contacto: p.contact, telefono: p.phone })),
    [organizacionId],
  );

  const guardar = async () => {
    setIntentado(true);
    if (hayErrores) return;
    setGuardando(true);
    try {
      const r = await guardarLote(organizacionId, {
        id: lote?.lot_id,
        product_id: lote?.product_id ?? producto!.product_id,
        lot_code: codigo.trim() || null,
        expiry_date: vence || null,
        supplier_id: proveedor ? Number(proveedor.id) : null,
        branch_id: sucursalId,
        notes: notas.trim() || null,
        ...(conCantidad
          ? { cantidad_inicial: cantidad, costo_unitario: costo, motivo: t('motivoEntrada', { codigo: codigo.trim() || '' }).slice(0, LARGO_MOTIVO) }
          : {}),
      });
      toast({
        title: edicion ? t('listoEdicion', { codigo: r.lot_code }) : t('listoNuevo', { codigo: r.lot_code }),
        description: r.numero ? t('listoDocumento', { numero: r.numero }) : undefined,
      });
      onGuardado?.();
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('error'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={edicion ? t('tituloEditar', { codigo: lote!.lot_code }) : t('tituloNuevo')}
      descripcion={edicion ? t('descripcionEditar') : t('descripcionNuevo')}
      icono={Layers}
      ancho={672}
      primario={{ etiqueta: edicion ? t('guardar') : t('crear'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        {edicion ? (
          <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-fg">
            <span className="font-medium">{lote!.nombre}</span>
            {lote!.sku && <span className="text-fg-secondary"> · {lote!.sku}</span>}
          </p>
        ) : (
          <FormField etiqueta={t('producto')} obligatorio error={err('producto')}>
            {(c) => (
              <div aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']}>
                <SelectorProductoStock
                  id={c.id}
                  organizacionId={organizacionId}
                  sucursalId={sucursalId}
                  valor={producto}
                  etiqueta={t('producto')}
                  onCambiar={(f) => {
                    setProducto(f);
                    if (costo === null && f.costo_promedio !== null) setCosto(f.costo_promedio);
                  }}
                />
              </div>
            )}
          </FormField>
        )}
        {!edicion && producto && !producto.con_lotes && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-text">
            <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
            {t('sinManejoLotes')}
          </p>
        )}

        <FormField etiqueta={t('codigo')} ayuda={t('codigoAyuda')}>
          <Input value={codigo} maxLength={60} onChange={(e) => setCodigo(e.target.value)} placeholder={t('codigoPlaceholder')} />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('sucursal')} obligatorio={!edicion} error={err('sucursal')} ayuda={t('sucursalAyuda')}>
            {(c) => (
              <Select value={sucursalId ? String(sucursalId) : ''} onValueChange={(v) => setSucursalId(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10">
                  <SelectValue placeholder={t('elegirSucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {!edicion && (
            <FormField etiqueta={t('cantidadInicial')} error={err('cantidad')} ayuda={puedeAjustar ? t('cantidadAyuda') : t('cantidadSinPermiso')}>
              <CampoNumero valor={cantidad} onValorChange={setCantidad} decimales={3} minimo={0} disabled={!puedeAjustar} sufijo={producto?.unidad ?? t('uds')} />
            </FormField>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('vence')} ayuda={t('venceAyuda')}>
            {(c) => <CampoFecha id={c.id} valor={vence || null} onValorChange={setVence} hoy={getToday()} limpiable />}
          </FormField>
          {!edicion && (
            <FormField etiqueta={t('costo')} obligatorio={conCantidad} error={err('costo')} ayuda={t('costoAyuda')}>
              <CampoNumero valor={costo} onValorChange={setCosto} decimales={moneda.decimals} minimo={0} prefijo={simboloMoneda(moneda)} disabled={!puedeAjustar} />
            </FormField>
          )}
        </div>

        <SupplierPicker proveedor={proveedor} etiqueta={t('proveedor')} buscar={buscarProv} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} />

        {edicion && (
          <FormField etiqueta={t('notas')}>
            <Input value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
          </FormField>
        )}
      </div>
    </Dialogo>
  );
}

// ─── Ajustar cantidad del lote (Figma 522:63102) ─────────────────────────────

const MOTIVOS_AJUSTE_LOTE = ['conteo', ...MOTIVOS_SALIDA] as const;

export interface DialogoAjustarLoteProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  lote: LoteFila | null;
  /** Filas del mismo lote en otras sucursales (para elegir). */
  filasDelLote?: readonly LoteFila[];
  /** «Dar de baja por merma»: nueva cantidad 0 y motivo de merma. */
  darDeBaja?: boolean;
  onGuardado?: () => void;
}

export function DialogoAjustarLote(props: DialogoAjustarLoteProps) {
  if (!props.abierto || !props.lote) return null;
  return <FormularioAjuste {...props} lote={props.lote} />;
}

function FormularioAjuste({ abierto, onAbiertoChange, organizacionId, lote, filasDelLote, darDeBaja, onGuardado }: DialogoAjustarLoteProps & { lote: LoteFila }) {
  const t = useTranslations('inventarioLotes.ajustar');
  const tm = useTranslations('inventarioStock.motivos');
  const { toast } = useToast();
  const cantidad = useCantidadStock();
  const mensajeError = useMensajeErrorInventario();
  const { branches } = useAlcanceSucursales();
  const filas = filasDelLote && filasDelLote.length > 0 ? filasDelLote : [lote];
  const [sucursalId, setSucursalId] = useState<number | null>(lote.branch_id ?? branches[0]?.id ?? null);
  const actual = filas.find((f) => f.branch_id === sucursalId)?.qty_on_hand ?? 0;
  const [nueva, setNueva] = useState<number | null>(darDeBaja ? 0 : null);
  const [motivo, setMotivo] = useState<string>(darDeBaja ? (lote.estado === 'vencido' ? 'merma_vencido' : 'merma_rotura') : 'conteo');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (darDeBaja) setNueva(0);
  }, [sucursalId, darDeBaja]);

  const dif = diferenciaCantidad(actual, nueva);
  const error = !intentado
    ? null
    : nueva === null
      ? t('errores.cantidad')
      : nueva < 0
        ? t('errores.negativa')
        : dif === 0
          ? t('errores.sinCambio')
          : motivo === 'otro' && !motivoOtro.trim()
            ? t('errores.motivo')
            : null;

  const etiquetaMotivo = (m: string) => (m === 'conteo' ? t('motivoConteo') : tm(`salida.${m}`));

  const guardar = async () => {
    setIntentado(true);
    if (!sucursalId || nueva === null || nueva < 0 || dif === 0 || (motivo === 'otro' && !motivoOtro.trim())) return;
    setGuardando(true);
    try {
      const texto = (motivo === 'otro' ? motivoOtro.trim() : etiquetaMotivo(motivo)).slice(0, LARGO_MOTIVO);
      const r = await ajustarLote(organizacionId, lote.lot_id, sucursalId, nueva, texto, null);
      toast({ title: t('listo', { codigo: lote.lot_code }), description: r.numero ? t('listoDocumento', { numero: r.numero }) : undefined });
      onGuardado?.();
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('error'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  const sucursalesOpciones = branches.map((b) => ({ id: b.id, nombre: b.name, qty: filas.find((f) => f.branch_id === b.id)?.qty_on_hand ?? 0 }));

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={darDeBaja ? t('tituloBaja', { codigo: lote.lot_code }) : t('titulo', { codigo: lote.lot_code })}
      descripcion={darDeBaja ? t('descripcionBaja') : t('descripcion')}
      icono={SlidersHorizontal}
      primario={{ etiqueta: darDeBaja ? t('confirmarBaja') : t('confirmar'), onClick: () => void guardar(), cargando: guardando, destructiva: darDeBaja }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('sucursal')} obligatorio>
          {(c) => (
            <Select value={sucursalId ? String(sucursalId) : ''} onValueChange={(v) => setSucursalId(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                <SelectValue placeholder={t('elegirSucursal')} />
              </SelectTrigger>
              <SelectContent>
                {sucursalesOpciones.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {t('opcionSucursal', { sucursal: s.nombre, n: cantidad(s.qty) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField
          etiqueta={t('nuevaCantidad')}
          obligatorio
          error={error && error !== t('errores.motivo') ? error : null}
          ayuda={dif !== null ? t('diferencia', { signo: dif > 0 ? '+' : dif < 0 ? '−' : '', n: cantidad(Math.abs(dif)) }) : undefined}
        >
          <CampoNumero valor={nueva} onValorChange={setNueva} decimales={3} minimo={0} sufijo={lote.unidad ?? t('uds')} />
        </FormField>
        <FormField etiqueta={t('motivo')} obligatorio ayuda={t('motivoAyuda')} error={error === t('errores.motivo') ? error : null}>
          {(c) => (
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_AJUSTE_LOTE.map((m) => (
                  <SelectItem key={m} value={m}>
                    {etiquetaMotivo(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {motivo === 'otro' && (
          <FormField etiqueta={t('motivoOtro')} obligatorio>
            <Input value={motivoOtro} maxLength={LARGO_MOTIVO} onChange={(e) => setMotivoOtro(e.target.value)} />
          </FormField>
        )}
      </div>
    </Dialogo>
  );
}

// ─── Eliminar lote (Figma 520:66749) ─────────────────────────────────────────

export function DialogoEliminarLote({
  abierto,
  onAbiertoChange,
  organizacionId,
  lote,
  onEliminado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  lote: LoteFila | null;
  onEliminado?: () => void;
}) {
  const t = useTranslations('inventarioLotes.eliminar');
  const { toast } = useToast();
  const cantidad = useCantidadStock();
  const mensajeError = useMensajeErrorInventario();
  const [borrando, setBorrando] = useState(false);
  if (!lote) return null;
  const bloqueado = lote.qty_on_hand !== 0 || lote.con_historia;

  const eliminar = async () => {
    setBorrando(true);
    try {
      await eliminarLote(organizacionId, lote.lot_id);
      toast({ title: t('listo', { codigo: lote.lot_code }) });
      onEliminado?.();
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('error'), description: mensajeError(e) });
    } finally {
      setBorrando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { codigo: lote.lot_code })}
      descripcion={
        lote.qty_on_hand !== 0
          ? t('conExistencias', { codigo: lote.lot_code, producto: lote.nombre, n: cantidad(lote.qty_on_hand), sucursal: lote.sucursal ?? '' })
          : lote.con_historia
            ? t('conHistoria', { codigo: lote.lot_code })
            : t('descripcion', { codigo: lote.lot_code, producto: lote.nombre })
      }
      icono={Trash2}
      ancho={440}
      primario={{ etiqueta: t('confirmar'), onClick: () => void eliminar(), cargando: borrando, destructiva: true, deshabilitada: bloqueado, motivo: t('bloqueado') }}
    />
  );
}
