'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { productoService } from '@/lib/services/productoService';

interface ProductoOpcion {
  id: number;
  name: string;
  sku: string | null;
}

/**
 * «Generar seriales» desde Inventario > Seriales. Crea seriales `in_stock`
 * hasta el cupo de la sede (`fn_producto_generar_seriales`) y no mueve stock.
 * No reutiliza el diálogo del detalle del producto: ese depende de su hook.
 */
export function DialogoGenerarDesdeListado({
  abierto,
  onAbiertoChange,
  sucursales,
  sucursalInicial,
  productoInicial,
  cantidadInicial,
  onHecho,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  sucursales: readonly { id: number; name: string }[];
  sucursalInicial: number | null;
  productoInicial: { id: number; nombre: string; sku: string | null } | null;
  cantidadInicial: number | null;
  onHecho: () => void;
}) {
  const t = useTranslations('inventarioSeriales.listado.generar');
  const { toast } = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState<ProductoOpcion[]>([]);
  const [producto, setProducto] = useState<ProductoOpcion | null>(null);
  const [sucursal, setSucursal] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [lista, setLista] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setBusqueda(productoInicial?.nombre ?? '');
    setProducto(productoInicial ? { id: productoInicial.id, name: productoInicial.nombre, sku: productoInicial.sku } : null);
    setOpciones([]);
    setSucursal(sucursalInicial ? String(sucursalInicial) : sucursales[0] ? String(sucursales[0].id) : '');
    setCantidad(cantidadInicial && cantidadInicial > 0 ? String(cantidadInicial) : '');
    setLista('');
    setError(null);
    // `productoInicial` y `sucursales` cambian de identidad en cada render del listado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, productoInicial?.id, productoInicial?.nombre, sucursalInicial, cantidadInicial]);

  useEffect(() => {
    if (!abierto) return;
    const texto = busqueda.trim();
    if (texto.length < 2 || (producto && texto === producto.name)) {
      setOpciones([]);
      return;
    }
    let vigente = true;
    const timer = setTimeout(() => {
      const limpio = texto.replace(/[%_,.()]/g, '');
      if (!limpio) return;
      void supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', getOrganizationId())
        .eq('track_serial', true)
        .or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`)
        .limit(20)
        .then(({ data }) => {
          if (vigente) setOpciones((data ?? []) as ProductoOpcion[]);
        });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [abierto, busqueda, producto]);

  const serialesLista = lista.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  const nCantidad = Number(cantidad);
  const puede = !!producto && !!sucursal && (serialesLista.length > 0 || (Number.isInteger(nCantidad) && nCantidad > 0));

  const confirmar = async () => {
    if (!producto || !sucursal || !puede) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await productoService.generarSeriales(getOrganizationId(), producto.id, Number(sucursal), serialesLista.length > 0
        ? { seriales: serialesLista }
        : { cantidad: nCantidad });
      toast({ title: t('hecho', { count: r.creados.length }) });
      onHecho();
      onAbiertoChange(false);
    } catch {
      setError(t('error'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('noMueveStock')}
      ancho={560}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void confirmar(),
        cargando: guardando,
        deshabilitada: !puede,
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('producto')}>
          <Input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              if (producto && e.target.value !== producto.name) setProducto(null);
            }}
            placeholder={t('buscar')}
            className="h-10"
          />
        </FormField>
        {opciones.length > 0 && (
          <ul className="max-h-40 overflow-auto rounded-lg border border-line">
            {opciones.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
                  onClick={() => {
                    setProducto(p);
                    setBusqueda(p.name);
                    setOpciones([]);
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  {p.sku && <span className="font-mono text-xs text-fg-muted">{p.sku}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {busqueda.trim().length >= 2 && !producto && opciones.length === 0 && (
          <p className="text-xs text-fg-muted">{t('sinProductos')}</p>
        )}
        <FormField etiqueta={t('sucursal')}>
          {(c) => (
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger id={c.id} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('cantidad')}>
          <Input value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="h-10" />
        </FormField>
        <FormField etiqueta={t('lista')}>
          <Textarea value={lista} onChange={(e) => setLista(e.target.value)} rows={4} className="font-mono text-sm" />
        </FormField>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </div>
    </Dialogo>
  );
}
