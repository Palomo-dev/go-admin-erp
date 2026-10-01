'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Plus, Trash2 } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { SpaceSearchSelect } from '@/components/crm/oportunidades/SpaceSearchSelect';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { numeroDeCampo, subtotal, totalLineas, type Lineas } from './lineasLogica';

/**
 * «Líneas» del formulario en página (Figma 778:32176 / 778:33132): productos,
 * espacios del PMS y otros conceptos, con el total calculado por
 * `lineasLogica.totalLineas` (único). Reutiliza los buscadores de producto y
 * de espacio del formulario anterior. Se guardan con la oportunidad, en la
 * misma transacción (`crm_create/update_opportunity`).
 *
 * Productos: «+ Agregar producto» abre el diálogo «Agregar productos» del kit
 * (Figma 1042:34652, el mismo de la factura y la orden de compra: buscador,
 * escáner, precio de la lista y stock de la sucursal) y la fila muestra el
 * nombre, como el Figma 778:32176. Antes cada fila traía el buscador viejo
 * `ProductSearchSelect`, cuyo panel desbordaba con nombres largos.
 */
type Clase = 'products' | 'spaces' | 'custom';

export interface LineasOportunidadProps {
  lineas: Lineas;
  onCambiar: (l: Lineas) => void;
  moneda: ContextoMoneda;
  deshabilitado?: boolean;
}

type Espacio = { id: string; label: string; floor_zone?: string; status: string; type_name?: string; base_rate: number };

export function LineasOportunidad({ lineas, onCambiar, moneda, deshabilitado }: LineasOportunidadProps) {
  const t = useTranslations('crm.oportunidad.lineas');
  const [clase, setClase] = useState<Clase>('products');
  const [agregandoProductos, setAgregandoProductos] = useState(false);
  const sucursales = useBranchOpcional();
  const selectedBranchId = sucursales?.selectedBranchId ?? null;
  const nombreSucursal = sucursales?.branches.find((b) => b.id === selectedBranchId)?.name ?? null;
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  useEffect(() => {
    if (clase === 'spaces' && espacios.length === 0) void opportunitiesService.getSpaces().then(setEspacios, () => setEspacios([]));
  }, [clase, espacios.length]);

  const num = (valor: number, cambiar: (n: number) => void, etiqueta: string) => (
    <input key={String(valor)} aria-label={etiqueta} inputMode="decimal" defaultValue={String(valor)} onBlur={(e) => cambiar(numeroDeCampo(e.target.value))} disabled={deshabilitado} className={`${CLASE_CAMPO} w-24 text-right`} />
  );
  const quitar = (k: Clase, i: number) => onCambiar({ ...lineas, [k]: lineas[k].filter((_, j) => j !== i) });
  const agregar = () => {
    if (clase === 'products') setAgregandoProductos(true);
    else if (clase === 'spaces') onCambiar({ ...lineas, spaces: [...lineas.spaces, { space_id: '', nights: 1, unit_price: 0 }] });
    else onCambiar({ ...lineas, custom: [...lineas.custom, { concept: '', quantity: 1, unit_price: 0 }] });
  };

  const filas =
    clase === 'products'
      ? lineas.products.map((l, i) => ({
          clave: l.id ?? `p${i}`,
          elegir: <span className="block min-w-0 truncate text-fg" title={l.nombre ?? undefined}>{l.nombre ?? t('elegirProducto')}</span>,
          cantidad: num(l.quantity, (n) => onCambiar({ ...lineas, products: lineas.products.map((x, j) => (j === i ? { ...x, quantity: n } : x)) }), t('cantidad')),
          precio: num(l.unit_price, (n) => onCambiar({ ...lineas, products: lineas.products.map((x, j) => (j === i ? { ...x, unit_price: n } : x)) }), t('precio')),
          total: subtotal(l.quantity, l.unit_price),
          i,
        }))
      : clase === 'spaces'
        ? lineas.spaces.map((l, i) => ({
            clave: l.id ?? `s${i}`,
            elegir: <SpaceSearchSelect spaces={espacios} selectedSpaceId={l.space_id} onSelect={(id, s) => onCambiar({ ...lineas, spaces: lineas.spaces.map((x, j) => (j === i ? { ...x, space_id: id, nombre: s?.label ?? null, unit_price: x.unit_price || s?.base_rate || 0 } : x)) })} placeholder={l.nombre ?? t('elegirEspacio')} />,
            cantidad: num(l.nights, (n) => onCambiar({ ...lineas, spaces: lineas.spaces.map((x, j) => (j === i ? { ...x, nights: Math.max(1, Math.round(n)) } : x)) }), t('noches')),
            precio: num(l.unit_price, (n) => onCambiar({ ...lineas, spaces: lineas.spaces.map((x, j) => (j === i ? { ...x, unit_price: n } : x)) }), t('precio')),
            total: subtotal(l.nights, l.unit_price),
            i,
          }))
        : lineas.custom.map((l, i) => ({
            clave: l.id ?? `c${i}`,
            elegir: <input aria-label={t('concepto')} value={l.concept} onChange={(e) => onCambiar({ ...lineas, custom: lineas.custom.map((x, j) => (j === i ? { ...x, concept: e.target.value } : x)) })} maxLength={500} disabled={deshabilitado} className={CLASE_CAMPO} />,
            cantidad: num(l.quantity, (n) => onCambiar({ ...lineas, custom: lineas.custom.map((x, j) => (j === i ? { ...x, quantity: n } : x)) }), t('cantidad')),
            precio: num(l.unit_price, (n) => onCambiar({ ...lineas, custom: lineas.custom.map((x, j) => (j === i ? { ...x, unit_price: n } : x)) }), t('precio')),
            total: subtotal(l.quantity, l.unit_price),
            i,
          }));

  // Un producto que ya está en las líneas suma una unidad en vez de duplicar la fila.
  const agregarProducto = (p: { id: number; nombre: string; precio: number }) => {
    const ya = lineas.products.findIndex((x) => x.product_id === p.id);
    onCambiar({
      ...lineas,
      products:
        ya >= 0
          ? lineas.products.map((x, j) => (j === ya ? { ...x, quantity: x.quantity + 1 } : x))
          : [...lineas.products, { product_id: p.id, nombre: p.nombre, quantity: 1, unit_price: p.precio || 0 }],
    });
  };

  return (
    <section aria-labelledby="lineas-oportunidad" className="flex flex-col gap-3 border-t border-line pt-4">
      <header className="flex items-start gap-2">
        <Package aria-hidden="true" className="mt-0.5 size-4 text-fg-secondary" strokeWidth={1.5} />
        <div className="flex flex-col">
          <h3 id="lineas-oportunidad" className="text-sm font-semibold text-fg">{t('titulo')}</h3>
          <p className="text-xs text-fg-secondary">{t('descripcion')}</p>
        </div>
      </header>
      <SegmentedControl etiqueta={t('titulo')} valor={clase} onValorChange={setClase} tamano="sm" opciones={(['products', 'spaces', 'custom'] as const).map((k) => ({ valor: k, etiqueta: t(`clases.${k}`, { n: lineas[k].length }) }))} />
      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-subtle text-xs text-fg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">{t(`columna.${clase}`)}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{clase === 'spaces' ? t('noches') : t('cantidad')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('precio')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('total')}</th>
                <th scope="col" className="w-10"><span className="sr-only">{t('quitar')}</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-t border-line">
                  <td className="px-3 py-2">{f.elegir}</td>
                  <td className="px-3 py-2 text-right">{f.cantidad}</td>
                  <td className="px-3 py-2 text-right">{f.precio}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{formatMoneda(f.total, moneda)}</td>
                  <td className="px-1 text-right">
                    <button type="button" aria-label={t('quitar')} onClick={() => quitar(clase, f.i)} disabled={deshabilitado} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"><Trash2 aria-hidden="true" className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={agregar} disabled={deshabilitado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          <Plus aria-hidden="true" className="size-4" />
          {t(`agregar.${clase}`)}
        </button>
        <span className="text-sm font-semibold text-fg">{t('totalGeneral', { total: formatMoneda(totalLineas(lineas), moneda) })}</span>
      </div>
      <AgregarProductosDocumento
        abierto={agregandoProductos}
        onAbiertoChange={setAgregandoProductos}
        variante="venta"
        sucursal={selectedBranchId}
        nombreSucursal={nombreSucursal}
        moneda={moneda}
        impuestos={[]}
        sinCrear
        onAgregar={agregarProducto}
      />
    </section>
  );
}
