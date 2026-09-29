'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { CampoNumero } from '../CampoNumero';
import { FormField } from '../FormField';
import { useKitT } from '../useIdiomaKit';
import { ImpuestosLinea } from './ImpuestosLinea';
import { simboloMoneda } from './documentoLineasLogica';
import {
  productoRapidoInicial,
  validarProductoRapido,
  type DatosProductoRapido,
  type OpcionImpuesto,
  type ProductoDocumento,
  type VarianteDocumento,
} from './edicionDocumentoLogica';

/**
 * Formulario rápido de producto dentro de «Agregar productos» (Figma
 * «Diálogo / Crear producto» venta `1045:105410` · compra `1045:105970`):
 * nombre, SKU o código, precio de venta (venta) o costo del proveedor
 * (compra), impuesto y «Controla inventario». «Crear y agregar» lo crea con el
 * servicio del catálogo que pasa la pantalla (`onCrear`) y vuelve como línea.
 */
export interface FormularioRapidoProductoProps {
  variante: VarianteDocumento;
  /** Lo escrito en el buscador (nombre o código). */
  texto: string;
  moneda: ContextoMoneda | string;
  impuestos: readonly OpcionImpuesto[];
  onCrear: (datos: DatosProductoRapido) => Promise<ProductoDocumento>;
  onCreado: (producto: ProductoDocumento) => void;
  onCancelar: () => void;
  /** Mensaje de un error del servidor (sku repetido, sin permiso). */
  mensajeError?: (error: unknown) => string;
}

export function FormularioRapidoProducto({ variante, texto, moneda, impuestos, onCrear, onCreado, onCancelar, mensajeError }: FormularioRapidoProductoProps) {
  const t = useKitT();
  const [datos, setDatos] = useState<DatosProductoRapido>(() =>
    productoRapidoInicial(texto, impuestos.find((i) => i.predeterminado)?.id ?? null),
  );
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refNombre = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    refNombre.current?.focus();
  }, []);

  const errores = validarProductoRapido(datos);
  const textoError = (c: keyof typeof errores) => (intentado && errores[c] ? t(`documentoEdicion.crearProducto.errores.${errores[c]}` as never) : null);
  const cambiar = (c: Partial<DatosProductoRapido>) => setDatos((d) => ({ ...d, ...c }));

  const crear = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    setGuardando(true);
    setError(null);
    try {
      const p = await onCrear({ ...datos, nombre: datos.nombre.trim(), sku: datos.sku.trim() });
      onCreado(p);
    } catch (e) {
      setError(mensajeError ? mensajeError(e) : t('documentoEdicion.crearProducto.errorCrear'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
    >
      {error && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <FormField etiqueta={t('documentoEdicion.crearProducto.nombre')} obligatorio error={textoError('nombre')}>
        {(c) => (
          <Input
            ref={refNombre}
            id={c.id}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            aria-required={c['aria-required']}
            value={datos.nombre}
            maxLength={200}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            className="h-10"
          />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('documentoEdicion.crearProducto.sku')} obligatorio error={textoError('sku')}>
          <Input value={datos.sku} maxLength={60} onChange={(e) => cambiar({ sku: e.target.value })} className="h-10" />
        </FormField>
        <FormField
          etiqueta={variante === 'venta' ? t('documentoEdicion.crearProducto.precio') : t('documentoEdicion.crearProducto.costo')}
          obligatorio
          error={textoError('precio')}
        >
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={datos.precio}
              prefijo={simboloMoneda(moneda)}
              decimales={typeof moneda === 'string' ? 2 : moneda.decimals}
              minimo={0}
              onValorChange={(v) => cambiar({ precio: v })}
            />
          )}
        </FormField>
      </div>
      <FormField etiqueta={t('documentoEdicion.crearProducto.impuesto')}>
        {() => (
          <ImpuestosLinea
            opciones={impuestos}
            valor={{ ids: datos.impuestos, incluido: false }}
            onValorChange={(v) => cambiar({ impuestos: [...v.ids] })}
            sinIncluido
            etiqueta={t('documentoEdicion.crearProducto.impuesto')}
          />
        )}
      </FormField>
      <label className="flex items-center gap-2 text-sm text-fg">
        <Checkbox checked={datos.controlaStock} onCheckedChange={(v) => cambiar({ controlaStock: v === true })} className="size-[18px] rounded" />
        {t('documentoEdicion.crearProducto.controlaStock')}
      </label>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          {t('comun.cancelar')}
        </button>
        <button
          type="submit"
          disabled={guardando}
          aria-busy={guardando || undefined}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {t('documentoEdicion.crearProducto.crear')}
        </button>
      </div>
    </form>
  );
}
