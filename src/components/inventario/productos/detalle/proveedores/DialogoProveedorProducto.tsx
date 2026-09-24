'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Truck } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { MonedaProducto } from '../ContextoProducto';
import { HojaNuevoProveedor } from './HojaNuevoProveedor';

export interface ProveedorOrg {
  id: number;
  uuid: string | null;
  name: string;
  nit: string | null;
}

export interface DatosProveedorProducto {
  /** Fila de `product_suppliers` (solo en editar). */
  id?: number;
  supplier_id: number | null;
  cost: number | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  supplier_sku: string;
  notes: string;
  is_preferred: boolean;
}

/**
 * «Agregar proveedor» / «Editar proveedor» (A.10 #10-#19): proveedor con
 * búsqueda (y alta rápida con el formulario de proveedores; solo lectura al
 * editar), costo en la moneda de la organización, días de entrega, pedido
 * mínimo, SKU del proveedor, notas y preferido.
 */
export function DialogoProveedorProducto({
  abierto,
  onAbiertoChange,
  inicial,
  disponibles,
  nombreEditando,
  moneda,
  guardando,
  onGuardar,
  onProveedorCreado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  inicial: DatosProveedorProducto;
  /** Proveedores de la organización que aún no están en el producto. */
  disponibles: readonly ProveedorOrg[];
  /** Nombre (y NIT) del proveedor al editar. */
  nombreEditando?: string;
  moneda: MonedaProducto;
  guardando: boolean;
  onGuardar: (datos: DatosProveedorProducto) => void;
  onProveedorCreado: (p: ProveedorOrg) => void;
}) {
  const t = useTranslations('productoDetalle.proveedores');
  const tc = useTranslations('productoDetalle.comun');
  const [datos, setDatos] = useState<DatosProveedorProducto>(inicial);
  const [intentado, setIntentado] = useState(false);
  const [hojaNuevo, setHojaNuevo] = useState(false);
  const editando = inicial.id !== undefined;

  useEffect(() => {
    if (abierto) {
      setDatos(inicial);
      setIntentado(false);
    }
  }, [abierto, inicial]);

  const set = <K extends keyof DatosProveedorProducto>(k: K, v: DatosProveedorProducto[K]) => setDatos((d) => ({ ...d, [k]: v }));

  const opciones = useMemo(
    () => disponibles.map((p) => ({ value: String(p.id), label: p.name, sublabel: p.nit ? t('nit', { nit: p.nit }) : undefined })),
    [disponibles, t],
  );

  const errorProveedor = intentado && !datos.supplier_id ? t('dialogo.proveedorRequerido') : null;
  const negativo = (v: number | null) => v !== null && v < 0;
  const errorNumeros = negativo(datos.cost) || negativo(datos.lead_time_days) || negativo(datos.min_order_qty);

  const guardar = () => {
    setIntentado(true);
    if (!datos.supplier_id || errorNumeros) return;
    onGuardar(datos);
  };

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={editando ? t('dialogo.tituloEditar') : t('dialogo.tituloAgregar')}
        descripcion={editando ? t('dialogo.descripcionEditar') : t('dialogo.descripcionAgregar')}
        icono={Truck}
        textoCancelar={tc('cancelar')}
        ancho={560}
        primario={{
          etiqueta: guardando ? tc('guardando') : editando ? tc('guardarCambios') : tc('agregar'),
          onClick: guardar,
          cargando: guardando,
        }}
      >
        {editando ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-fg-secondary">{t('dialogo.proveedor')}</span>
            <span className="text-sm font-medium text-fg">{nombreEditando}</span>
          </div>
        ) : (
          <FormField etiqueta={t('dialogo.proveedor')} obligatorio error={errorProveedor}>
            {() => (
              <div>
                <SearchSelect
                  options={opciones}
                  value={datos.supplier_id ? String(datos.supplier_id) : ''}
                  onValueChange={(v) => set('supplier_id', v ? Number(v) : null)}
                  placeholder={t('dialogo.proveedorPlaceholder')}
                  searchPlaceholder={t('dialogo.proveedorBuscar')}
                  emptyText={t('dialogo.proveedorVacio')}
                  onCreate={() => setHojaNuevo(true)}
                  createLabel={(texto) => t('dialogo.crearCon', { nombre: texto })}
                  createEmptyLabel={t('dialogo.crear')}
                />
              </div>
            )}
          </FormField>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('dialogo.costo')} error={negativo(datos.cost) ? t('dialogo.negativo') : null}>
            <CampoNumero valor={datos.cost} onValorChange={(v) => set('cost', v)} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
          </FormField>
          <FormField etiqueta={t('dialogo.diasEntrega')} error={negativo(datos.lead_time_days) ? t('dialogo.negativo') : null}>
            <CampoNumero valor={datos.lead_time_days} onValorChange={(v) => set('lead_time_days', v)} sufijo={t('dialogo.diasSufijo')} decimales={0} minimo={0} />
          </FormField>
          <FormField etiqueta={t('dialogo.pedidoMinimo')} error={negativo(datos.min_order_qty) ? t('dialogo.negativo') : null}>
            <CampoNumero valor={datos.min_order_qty} onValorChange={(v) => set('min_order_qty', v)} decimales={2} minimo={0} />
          </FormField>
          <FormField etiqueta={t('dialogo.sku')}>
            <Input value={datos.supplier_sku} onChange={(e) => set('supplier_sku', e.target.value)} placeholder={t('dialogo.skuPlaceholder')} className="font-mono" maxLength={80} />
          </FormField>
        </div>

        <FormField etiqueta={t('dialogo.notas')}>
          <Textarea value={datos.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('dialogo.notasPlaceholder')} rows={2} maxLength={1000} />
        </FormField>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-fg">{t('dialogo.preferido')}</span>
            <span className="text-xs text-fg-secondary">{t('dialogo.preferidoAyuda')}</span>
          </span>
          <Switch checked={datos.is_preferred} onCheckedChange={(v) => set('is_preferred', v)} />
        </label>
      </Dialogo>

      <HojaNuevoProveedor
        abierto={hojaNuevo}
        onAbiertoChange={setHojaNuevo}
        onCreado={(p) => {
          const nuevo: ProveedorOrg = { id: p.id, uuid: p.uuid ?? null, name: p.name, nit: p.nit ?? null };
          onProveedorCreado(nuevo);
          set('supplier_id', p.id);
        }}
      />
    </>
  );
}
