'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { FormField } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { MultiSelect, type OpcionMulti } from '@/components/kit/MultiSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PropsSeccionFormulario } from '../tipos';
import { PROVEEDOR_VACIO, type ProveedorForm } from '../../logica/formularioProducto';
import { HojaNuevoProveedor } from '../../detalle/proveedores/HojaNuevoProveedor';
import { DialogoNuevaEtiqueta } from '../../detalle/proveedores/DialogoNuevaEtiqueta';
import { hexEtiqueta } from '../../detalle/proveedores/colorEtiqueta';

const ESTACIONES = ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all'] as const;
type Estacion = (typeof ESTACIONES)[number];
const HEREDAR = 'heredar';

const esEstacion = (v: string | null | undefined): v is Estacion => !!v && (ESTACIONES as readonly string[]).includes(v);

/**
 * Sección «Organización y proveedor» del formulario único (Figma `Nuevo
 * producto`): marca, referencia, unidad, estación de cocina/bar (o heredar la
 * de la categoría), proveedor principal con sus condiciones (alta rápida con
 * el formulario de proveedores) y etiquetas (alta rápida). No escribe en la
 * BD salvo las altas rápidas de proveedor y etiqueta, que se agregan al
 * catálogo del formulario.
 */
export function SeccionOrganizacion({
  estado,
  cambiar,
  errores,
  modo,
  catalogos,
  agregarACatalogo,
  organizacionId,
  productUuid,
  moneda,
}: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.organizacion');
  const te = useTranslations('productoForm.errores');
  const [hojaProveedor, setHojaProveedor] = useState(false);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState<string | null>(null);

  const proveedor = estado.proveedor;
  const setProveedor = <K extends keyof ProveedorForm>(k: K, v: ProveedorForm[K]) => cambiar('proveedor', { ...proveedor, [k]: v });

  const categoria = catalogos.categorias.find((c) => c.id === estado.category_id) ?? null;
  const estacionDeCategoria = categoria?.station;
  const estacionCategoria: Estacion | null = esEstacion(estacionDeCategoria) ? estacionDeCategoria : null;
  const ayudaEstacion = estado.station
    ? t('estacion.ayudaPropia')
    : estacionCategoria
      ? t('estacion.ayudaCategoria', { estacion: t(`estacion.opciones.${estacionCategoria}`) })
      : t('estacion.ayudaNinguna');

  const opcionesUnidad = useMemo(
    () => catalogos.unidades.map((u) => ({ value: u.code, label: u.name, sublabel: u.code })),
    [catalogos.unidades],
  );
  const opcionesProveedor = useMemo(
    () => catalogos.proveedores.map((p) => ({ value: String(p.id), label: p.name, sublabel: p.nit ?? undefined })),
    [catalogos.proveedores],
  );
  const opcionesEtiqueta: OpcionMulti[] = useMemo(
    () => catalogos.etiquetas.map((e) => ({ valor: String(e.id), etiqueta: e.name, color: hexEtiqueta(e.color) })),
    [catalogos.etiquetas],
  );

  const nombreProveedor = (id: number) => catalogos.proveedores.find((p) => p.id === id)?.name ?? t('proveedor.desconocido');
  const otros = estado.otros_proveedores.filter((o) => o.supplier_id !== proveedor.supplier_id);

  const elegirProveedor = (valor: string) => {
    const id = valor && valor !== 'none' ? Number(valor) : null;
    if (!id) {
      cambiar('proveedor', { ...PROVEEDOR_VACIO });
      return;
    }
    // Si ya era «otro» proveedor del producto, trae sus condiciones.
    const previo = estado.otros_proveedores.find((o) => o.supplier_id === id);
    cambiar(
      'proveedor',
      previo
        ? {
            supplier_id: id,
            cost: previo.cost,
            lead_time_days: previo.lead_time_days,
            min_order_qty: previo.min_order_qty,
            supplier_sku: previo.supplier_sku ?? '',
            notes: previo.notes ?? '',
          }
        : { ...proveedor, supplier_id: id },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField etiqueta={t('marca')}>
          <Input value={estado.brand} onChange={(e) => cambiar('brand', e.target.value)} placeholder={t('marcaPlaceholder')} maxLength={120} />
        </FormField>
        <FormField etiqueta={t('referencia')}>
          <Input value={estado.reference} onChange={(e) => cambiar('reference', e.target.value)} placeholder={t('referenciaPlaceholder')} maxLength={120} />
        </FormField>
        <FormField etiqueta={t('unidad')}>
          {() => (
            <div>
              <SearchSelect
                options={opcionesUnidad}
                value={estado.unit_code}
                onValueChange={(v) => cambiar('unit_code', v && v !== 'none' ? v : 'UN')}
                placeholder={t('unidadPlaceholder')}
                searchPlaceholder={t('unidadBuscar')}
                emptyText={t('unidadVacio')}
              />
            </div>
          )}
        </FormField>
        <FormField etiqueta={t('estacion.etiqueta')} ayuda={ayudaEstacion}>
          {(campo) => (
            <Select value={estado.station ?? HEREDAR} onValueChange={(v) => cambiar('station', v === HEREDAR ? null : v)}>
              <SelectTrigger id={campo.id} aria-labelledby={campo.idEtiqueta} aria-describedby={campo['aria-describedby']} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HEREDAR}>
                  {estacionCategoria
                    ? t('estacion.heredarDe', { estacion: t(`estacion.opciones.${estacionCategoria}`) })
                    : t('estacion.heredar')}
                </SelectItem>
                {ESTACIONES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t(`estacion.opciones.${e}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField
            etiqueta={t('proveedor.principal')}
            ayuda={t('proveedor.ayuda')}
            error={errores.proveedor ? te(errores.proveedor) : null}
            className="min-w-0 flex-1"
          >
            {() => (
              <div>
                <SearchSelect
                  options={opcionesProveedor}
                  value={proveedor.supplier_id ? String(proveedor.supplier_id) : 'none'}
                  onValueChange={elegirProveedor}
                  placeholder={t('proveedor.placeholder')}
                  searchPlaceholder={t('proveedor.buscar')}
                  emptyText={t('proveedor.vacio')}
                  noneLabel={t('proveedor.ninguno')}
                  onCreate={() => setHojaProveedor(true)}
                  createLabel={(texto) => t('proveedor.crearCon', { nombre: texto })}
                  createEmptyLabel={t('proveedor.nuevo')}
                />
              </div>
            )}
          </FormField>
          <Button type="button" variant="outline" className="h-10 gap-1.5 sm:mb-[22px]" onClick={() => setHojaProveedor(true)}>
            <Plus className="size-4" aria-hidden /> {t('proveedor.nuevo')}
          </Button>
        </div>

        {proveedor.supplier_id !== null && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <FormField etiqueta={t('proveedor.costo')} ayuda={t('proveedor.costoAyuda')}>
                <CampoNumero valor={proveedor.cost} onValorChange={(v) => setProveedor('cost', v)} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
              </FormField>
              <FormField etiqueta={t('proveedor.diasEntrega')}>
                <CampoNumero valor={proveedor.lead_time_days} onValorChange={(v) => setProveedor('lead_time_days', v)} sufijo={t('proveedor.diasSufijo')} decimales={0} minimo={0} />
              </FormField>
              <FormField etiqueta={t('proveedor.pedidoMinimo')}>
                <CampoNumero valor={proveedor.min_order_qty} onValorChange={(v) => setProveedor('min_order_qty', v)} decimales={2} minimo={0} />
              </FormField>
              <FormField etiqueta={t('proveedor.sku')}>
                <Input value={proveedor.supplier_sku} onChange={(e) => setProveedor('supplier_sku', e.target.value)} className="font-mono" maxLength={80} />
              </FormField>
            </div>
            <FormField etiqueta={t('proveedor.notas')}>
              <Textarea value={proveedor.notes} onChange={(e) => setProveedor('notes', e.target.value)} rows={2} maxLength={1000} placeholder={t('proveedor.notasPlaceholder')} />
            </FormField>
          </>
        )}

        {otros.length > 0 && (
          <div className="rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm text-fg-secondary">
            <p>
              {modo === 'duplicar'
                ? t('proveedor.otrosDuplicar', { n: otros.length, nombres: otros.map((o) => nombreProveedor(o.supplier_id)).join(', ') })
                : t('proveedor.otros', { n: otros.length, nombres: otros.map((o) => nombreProveedor(o.supplier_id)).join(', ') })}
            </p>
            {modo === 'editar' && productUuid && (
              <Link href={`/app/inventario/productos/${productUuid}?tab=proveedores`} className="mt-1 inline-block font-medium text-link hover:underline">
                {t('proveedor.gestionar')}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <FormField etiqueta={t('etiquetas.etiqueta')} ayuda={t('etiquetas.ayuda')}>
          {(campo) => (
            <MultiSelect
              id={campo.id}
              aria-labelledby={campo.idEtiqueta}
              aria-describedby={campo['aria-describedby']}
              opciones={opcionesEtiqueta}
              valores={estado.etiquetas.map(String)}
              onValoresChange={(v) => cambiar('etiquetas', v.map(Number))}
              onCrear={(texto) => setNuevaEtiqueta(texto)}
              textoCrear={(texto) => t('etiquetas.crearCon', { nombre: texto })}
              placeholder={t('etiquetas.placeholder')}
              placeholderBusqueda={t('etiquetas.buscar')}
              textoVacio={t('etiquetas.vacio')}
              etiquetaQuitar={(e) => t('etiquetas.quitar', { nombre: e })}
            />
          )}
        </FormField>
      </div>

      <HojaNuevoProveedor
        abierto={hojaProveedor}
        onAbiertoChange={setHojaProveedor}
        onCreado={(p) => {
          agregarACatalogo('proveedores', { id: p.id, name: p.name, nit: p.nit ?? null });
          cambiar('proveedor', { ...PROVEEDOR_VACIO, supplier_id: p.id, cost: estado.cost });
        }}
      />
      <DialogoNuevaEtiqueta
        abierto={nuevaEtiqueta !== null}
        onAbiertoChange={(v) => !v && setNuevaEtiqueta(null)}
        organizacionId={organizacionId}
        nombreInicial={nuevaEtiqueta ?? ''}
        existentes={catalogos.etiquetas.map((e) => e.name)}
        onCreada={(et) => {
          agregarACatalogo('etiquetas', { id: et.id, name: et.name, color: et.color });
          cambiar('etiquetas', [...estado.etiquetas, et.id]);
        }}
      />
    </div>
  );
}
