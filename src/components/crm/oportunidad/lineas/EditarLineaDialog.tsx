'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { clasesBoton } from '@/components/kit/botonClases';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';
import { CLASE_CAMPO, type OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { extraModificadores, faltanteStock, subtotal, textoVariante, type LineaConcepto, type LineaEspacio, type LineaProducto } from '../lineasLogica';
import { padreDeVariante, stockPorProducto, type StockSucursal } from './catalogoOportunidad';
import { ConfigurarServicioDialog } from './ConfigurarServicioDialog';
import { HospedajeFormulario } from './HospedajeFormulario';

/**
 * «Editar línea» (Figma 1787:141119): cantidad, precio, modificadores (no
 * mueven stock), «Cambiar variante», stock por sucursal y nota para la
 * cotización; «Eliminar línea». Un servicio se edita en su mini formulario
 * (3c) y el hospedaje en el suyo (3d); un concepto, con concepto, cantidad y
 * precio.
 */
export type LineaEnEdicion =
  | { clase: 'products'; i: number; linea: LineaProducto }
  | { clase: 'spaces'; i: number; linea: LineaEspacio }
  | { clase: 'custom'; i: number; linea: LineaConcepto }
  | null;

export interface EditarLineaDialogProps {
  edicion: LineaEnEdicion;
  onCerrar: () => void;
  moneda: ContextoMoneda;
  usuarios: readonly OpcionUsuario[];
  onGuardarProducto: (i: number, l: LineaProducto) => void;
  onGuardarEspacio: (i: number, l: LineaEspacio) => void;
  onGuardarConcepto: (i: number, l: LineaConcepto) => void;
  onEliminar: (clase: 'products' | 'spaces' | 'custom', i: number) => void;
}

export function EditarLineaDialog(p: EditarLineaDialogProps) {
  const { edicion, onCerrar, moneda } = p;
  const t = useTranslations('crm.oportunidad.editarLinea');
  const sucursales = useBranchOpcional();
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [precio, setPrecio] = useState<number | null>(0);
  const [nota, setNota] = useState('');
  const [concepto, setConcepto] = useState('');
  const [stock, setStock] = useState<StockSucursal[] | null>(null);
  const [padre, setPadre] = useState<{ id: number; nombre: string; sku: string | null } | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [variante, setVariante] = useState<Partial<LineaProducto> | null>(null);

  const producto = edicion?.clase === 'products' && !edicion.linea.es_servicio ? edicion.linea : null;
  useEffect(() => {
    if (!edicion) return;
    const l = edicion.linea as LineaProducto & LineaConcepto & LineaEspacio;
    setCantidad(edicion.clase === 'spaces' ? l.nights : l.quantity);
    setPrecio(l.unit_price);
    setNota(edicion.clase === 'products' ? edicion.linea.notes ?? '' : '');
    setConcepto(edicion.clase === 'custom' ? edicion.linea.concept : '');
    setStock(null);
    setPadre(null);
    setVariante(null);
    if (producto) {
      if (producto.controla_stock) stockPorProducto([producto.product_id]).then((m) => setStock(m.get(producto.product_id) ?? []), () => setStock([]));
      // Variante → su padre; producto simple con modificadores → él mismo (solo modificadores).
      const propio = producto.modifiers?.length ? { id: producto.product_id, nombre: producto.nombre ?? '', sku: producto.sku ?? null } : null;
      padreDeVariante(producto.product_id).then((x) => setPadre(x ?? propio), () => setPadre(propio));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edicion]);

  if (!edicion) return null;

  if (edicion.clase === 'products' && edicion.linea.es_servicio) {
    const l = edicion.linea;
    return (
      <ConfigurarServicioDialog
        abierto
        onAbiertoChange={(x) => !x && onCerrar()}
        servicio={{ id: l.product_id, nombre: l.nombre ?? '', sku: l.sku, tipo: l.tipo_servicio ?? 'standard', precio: l.unit_price, tasa_impuesto: l.tasa_impuesto }}
        inicial={l}
        moneda={moneda}
        usuarios={p.usuarios}
        onListo={(nueva) => {
          p.onGuardarProducto(edicion.i, nueva);
          onCerrar();
        }}
      />
    );
  }

  if (edicion.clase === 'spaces') {
    return (
      <PanelAdaptable abierto onAbiertoChange={(x) => !x && onCerrar()} titulo={t('tituloHospedaje')} descripcion={edicion.linea.nombre ?? undefined} ancho={672}>
        <HospedajeFormulario
          moneda={moneda}
          inicial={edicion.linea}
          onListo={([l]) => {
            if (l) p.onGuardarEspacio(edicion.i, l);
            onCerrar();
          }}
        />
      </PanelAdaptable>
    );
  }

  const base = edicion.linea as LineaProducto | LineaConcepto;
  const actual: LineaProducto | null = producto ? { ...producto, ...(variante ?? {}) } : null;
  const qty = cantidad ?? 0;
  const unit = precio ?? 0;
  const total = subtotal(qty, unit);
  const valido = qty > 0 && unit >= 0 && (edicion.clase !== 'custom' || concepto.trim() !== '');
  const nombreSucursal = (id: number) => sucursales?.branches.find((b) => b.id === id)?.name ?? t('sucursalN', { id });
  const header = sucursales?.selectedBranchId ?? null;

  const guardar = () => {
    if (!valido) return;
    if (edicion.clase === 'custom') p.onGuardarConcepto(edicion.i, { ...edicion.linea, concept: concepto.trim(), quantity: qty, unit_price: unit });
    else if (actual) p.onGuardarProducto(edicion.i, { ...actual, quantity: qty, unit_price: unit, notes: nota.trim() || null });
    onCerrar();
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
      <button type="button" onClick={() => { p.onEliminar(edicion.clase, edicion.i); onCerrar(); }} className={clasesBoton({ variante: 'destructivo', className: 'sm:mr-auto' })}>{t('eliminar')}</button>
      <button type="button" onClick={onCerrar} className={clasesBoton({ variante: 'fantasma' })}>{t('cancelar')}</button>
      <button type="button" onClick={guardar} disabled={!valido} className={clasesBoton()}>{t('guardar')}</button>
    </div>
  );

  return (
    <>
      <PanelAdaptable
        abierto={!cambiando}
        onAbiertoChange={(x) => !x && onCerrar()}
        titulo={t('titulo')}
        descripcion={
          actual ? (
            <span className="flex flex-col">
              <span>{[actual.nombre, actual.variante, actual.sku].filter(Boolean).join(' · ')}</span>
              {padre && (
                <button type="button" onClick={() => setCambiando(true)} className="w-fit text-[13px] font-medium text-brand-deep hover:underline">{t('cambiarVariante')}</button>
              )}
            </span>
          ) : (
            (base as LineaConcepto).concept
          )
        }
        ancho={560}
        pie={pie}
      >
        <div className="flex flex-col gap-4">
          {edicion.clase === 'custom' && (
            <FormField etiqueta={t('concepto')}>
              <input value={concepto} maxLength={500} onChange={(e) => setConcepto(e.target.value)} className={CLASE_CAMPO} />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField etiqueta={t('cantidad')}>
              <CampoNumero valor={cantidad} onValorChange={setCantidad} minimo={0} decimales={2} alinear="derecha" />
            </FormField>
            <FormField etiqueta={t('precio')} ayuda={actual && actual.modifiers?.length ? t('incluyeExtras', { extra: formatMoneda(extraModificadores(actual.modifiers), moneda) }) : undefined}>
              <CampoNumero valor={precio} onValorChange={setPrecio} minimo={0} decimales={moneda.decimals} alinear="derecha" prefijo="$" />
            </FormField>
          </div>
          {actual && (actual.modifiers?.length ?? 0) > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-medium text-fg">{t('modificadores')}</h4>
              <ul className="flex flex-wrap gap-1.5">
                {actual.modifiers!.map((m) => (
                  <li key={m.modifier_id} className="rounded-full bg-subtle px-2.5 py-1 text-xs text-fg-secondary">{m.extra_price > 0 ? `${m.name} + ${formatMoneda(m.extra_price, moneda)}` : m.name}</li>
                ))}
              </ul>
              {padre && <button type="button" onClick={() => setCambiando(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-fit' })}>{t('editarModificadores')}</button>}
            </section>
          )}
          {actual?.controla_stock && (
            <section aria-label={t('stockSucursal')} className="flex flex-col gap-1.5 rounded-lg bg-subtle p-3 text-[13px]">
              {stock === null ? (
                <div className="h-5 animate-pulse rounded bg-surface" />
              ) : stock.length === 0 ? (
                <span className="text-danger-text">{t('sinStock')}</span>
              ) : (
                [...stock].sort((a, b) => Number(b.branch_id === header) - Number(a.branch_id === header) || b.cantidad - a.cantidad).map((s) => {
                  const falta = faltanteStock({ quantity: qty, controla_stock: true }, s.cantidad);
                  return (
                    <div key={s.branch_id} className="flex justify-between gap-3">
                      <span className="text-fg-secondary">{nombreSucursal(s.branch_id)}</span>
                      <span className={falta > 0 ? 'text-warning-text' : 'text-success-text'}>{falta > 0 ? t('disponiblesFaltan', { n: s.cantidad, falta }) : t('disponibles', { n: s.cantidad })}</span>
                    </div>
                  );
                })
              )}
            </section>
          )}
          {edicion.clase === 'products' && (
            <FormField etiqueta={t('nota')}>
              <input value={nota} maxLength={1000} onChange={(e) => setNota(e.target.value)} placeholder={t('notaEj')} className={CLASE_CAMPO} />
            </FormField>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-fg-secondary">{t('totalLinea')}</span>
            <span className="text-lg font-semibold tabular-nums text-fg">{formatMoneda(total, moneda)}</span>
          </div>
        </div>
      </PanelAdaptable>
      {cambiando && padre && actual && (
        <VariantSelectorDialog
          open
          onOpenChange={(x) => !x && setCambiando(false)}
          product={{ id: padre.id, name: padre.nombre, sku: padre.sku ?? '', track_stock: actual.controla_stock ?? undefined }}
          conCantidad
          cantidadInicial={qty || 1}
          varianteInicialId={actual.product_id}
          onSelectVariant={(v, mods, c) => {
            const extra = mods.reduce((s, m) => s + (m.extraPrice || 0), 0);
            setVariante({
              product_id: v.id,
              sku: v.sku || actual.sku,
              variante: textoVariante(v.variant_data),
              modifiers: mods.map((m) => ({ modifier_id: m.modifierId, group_id: m.groupId, name: m.name, group_name: m.groupName, extra_price: m.extraPrice })),
              controla_stock: v.track_stock ?? actual.controla_stock,
            });
            setCantidad(c);
            setPrecio((Number(v.price) || 0) + extra);
            setCambiando(false);
          }}
        />
      )}
    </>
  );
}
