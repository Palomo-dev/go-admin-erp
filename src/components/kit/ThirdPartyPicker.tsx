'use client';

import { useCallback, useState } from 'react';
import { Contact } from 'lucide-react';
import { documentoTexto } from '@/components/finanzas/documento/documentoTexto';
import { FormularioRapidoTercero } from '@/components/kit/documento/FormularioRapidoTercero';
import type { VarianteTercero } from '@/components/kit/documento/edicionDocumentoLogica';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ClienteDuplicadoError, crearClienteRapido, crearProveedorRapido } from '@/lib/services/documentos/edicionDocumento';
import type { FilaCliente } from '@/lib/services/clientesListadoService';
import type { Supplier } from '@/lib/services/supplierService';
import { buscarTerceros, type FilaTerceroBusqueda } from '@/lib/services/terceros/buscarTerceros';
import { SegmentedControl } from './SegmentedControl';
import { SelectorEntidad, type SelectorEntidadProps } from './SelectorEntidad';
import { useKitT } from './useIdiomaKit';
import {
  interpretarNit,
  opcionTercero,
  type TerceroElegido,
  type TerceroLista,
  type TipoTercero,
} from './terceroPickerLogica';

export type { TerceroElegido, TerceroLista, TipoTercero };

/**
 * Selector de tercero (cliente, proveedor o empleado) sobre `SelectorEntidad`,
 * el mismo cascarón que `CustomerPicker` y `SupplierPicker`.
 *
 * Figma `EAvjINVRnlzFM70GVoWXgl` (no hay ficha propia en 02 Componentes; se
 * apoya en las que ya existen):
 * - `CustomerPicker` `849:558484`
 * - «Elegir cliente/proveedor» Layout=dialog `1041:33841`
 * - formulario rápido `1036:103119` y `1045:105618`
 * - atajo F2 del POS `906:115573`
 *
 * El texto de búsqueda no es el valor: `onCambiar` solo corre al elegir una
 * fila, al crear o al confirmar «Usar NIT» con el dígito de verificación
 * válido. Escribir un nombre no guarda un NIT.
 */
export interface ThirdPartyPickerProps
  extends Omit<
    SelectorEntidadProps<TerceroLista>,
    'valor' | 'aOpcion' | 'icono' | 'etiqueta' | 'buscar' | 'onCambiar' | 'accionTexto' | 'onAccionTexto' | 'panelAlterno' | 'formularioCrear'
  > {
  valor: TerceroElegido | null | undefined;
  onCambiar: (tercero: TerceroElegido) => void;
  etiqueta?: string;
  /** Sucursal del alta rápida de cliente. */
  sucursal?: number | null;
  /**
   * Búsqueda. Por defecto `fn_terceros_buscar` con la organización de la sesión.
   * Los tests pasan la suya para no consultar la base.
   */
  buscar?: SelectorEntidadProps<TerceroLista>['buscar'];
}

const LIMITE = 20;

function deFila(f: FilaTerceroBusqueda): TerceroLista {
  return {
    tipo: f.tipo,
    id: f.id,
    nit: f.documento,
    dv: f.dv,
    nombre: f.nombre,
    email: f.email,
    documento: documentoTexto(f.tipo_doc || (f.dv ? 'nit' : null), f.documento, f.dv),
  };
}

function deCliente(f: FilaCliente): TerceroLista {
  return {
    tipo: 'cliente',
    id: f.id,
    nit: f.identification_number,
    dv: f.dv != null ? String(f.dv) : null,
    nombre: f.full_name?.trim() || 'Sin nombre',
    email: f.email,
    documento: documentoTexto(f.identification_type, f.identification_number, f.dv),
  };
}

function deProveedor(s: Supplier): TerceroLista {
  return {
    tipo: 'proveedor',
    id: String(s.id),
    nit: s.nit ?? null,
    dv: s.dv ?? null,
    nombre: s.name,
    email: s.email ?? null,
    documento: documentoTexto(s.doc_type || (s.nit ? 'nit' : null), s.nit, s.dv),
  };
}

function aValor(fila: TerceroLista): TerceroElegido {
  return { tipo: fila.tipo, id: fila.id, nit: fila.nit, dv: fila.dv, nombre: fila.nombre };
}

export function ThirdPartyPicker({
  valor,
  onCambiar,
  onQuitar,
  etiqueta,
  textos,
  layout = 'campo',
  atajo = 'F2',
  debounceMs = 250,
  sucursal = null,
  buscar,
  onAbiertoChange,
  ...resto
}: ThirdPartyPickerProps) {
  const t = useKitT();
  const [variante, setVariante] = useState<VarianteTercero>('cliente');
  const [nitPendiente, setNitPendiente] = useState<{ nit: string; dv: string } | null>(null);
  const [nombreNit, setNombreNit] = useState('');

  const etiquetaTipo = useCallback(
    (tipo: TipoTercero) => t(`picker.tercero.tipos.${tipo}` as 'picker.tercero.tipos.cliente'),
    [t],
  );

  const buscarPorDefecto = useCallback<SelectorEntidadProps<TerceroLista>['buscar']>(
    async (texto, signal, _filtros, desde) => {
      const org = getOrganizationId();
      if (!org) return { items: [], total: 0 };
      const pagina = await buscarTerceros(supabase, { organizationId: org, texto, limite: LIMITE, desde, signal });
      return { items: pagina.filas.map(deFila), total: pagina.total };
    },
    [],
  );

  const elegir = (fila: TerceroLista) => {
    setNitPendiente(null);
    onCambiar(aValor(fila));
  };

  const valorLista: TerceroLista | null = valor
    ? {
        ...valor,
        documento: documentoTexto(valor.nit ? 'nit' : null, valor.nit, valor.dv),
      }
    : null;

  return (
    <SelectorEntidad<TerceroLista>
      {...resto}
      layout={layout}
      atajo={atajo}
      debounceMs={debounceMs}
      valor={valorLista}
      aOpcion={(fila) => opcionTercero(fila, etiquetaTipo(fila.tipo))}
      icono={Contact}
      etiqueta={etiqueta ?? t('picker.tercero.etiqueta')}
      buscar={buscar ?? buscarPorDefecto}
      onCambiar={elegir}
      onQuitar={onQuitar}
      onAbiertoChange={(abierto) => {
        if (!abierto) {
          setNitPendiente(null);
          setNombreNit('');
        }
        onAbiertoChange?.(abierto);
      }}
      textoCrearNuevo={t('picker.tercero.crear')}
      accionTexto={(texto) => {
        const leido = interpretarNit(texto);
        if (!leido.esNit) return null;
        const mostrado = leido.valido && leido.nit && leido.dv ? documentoTexto('nit', leido.nit, leido.dv) : texto;
        return {
          titulo: t('picker.tercero.usarNit', { nit: mostrado ?? texto }),
          deshabilitada: leido.dvInvalido,
          motivo: leido.dvInvalido ? t('picker.tercero.dvInvalido') : undefined,
        };
      }}
      onAccionTexto={(texto) => {
        const leido = interpretarNit(texto);
        if (!leido.valido || !leido.nit || !leido.dv) return;
        setNombreNit('');
        setNitPendiente({ nit: leido.nit, dv: leido.dv });
      }}
      panelAlterno={
        nitPendiente
          ? (cerrar) => (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const nombre = nombreNit.trim();
                  if (!nombre) return;
                  onCambiar({ tipo: 'nit', id: null, nit: nitPendiente.nit, dv: nitPendiente.dv, nombre });
                  setNitPendiente(null);
                  setNombreNit('');
                  cerrar();
                }}
              >
                <p className="text-sm font-medium text-fg">
                  {t('picker.tercero.usarNit', { nit: documentoTexto('nit', nitPendiente.nit, nitPendiente.dv) ?? nitPendiente.nit })}
                </p>
                <label className="flex flex-col gap-1 text-sm font-medium text-fg">
                  {t('picker.tercero.nombre')}
                  <input
                    autoFocus
                    value={nombreNit}
                    onChange={(e) => setNombreNit(e.target.value)}
                    className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm font-normal text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNitPendiente(null);
                      setNombreNit('');
                    }}
                    className="h-10 rounded-md px-3 text-sm font-medium text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t('picker.tercero.cancelar')}
                  </button>
                  <button
                    type="submit"
                    disabled={!nombreNit.trim()}
                    className="h-10 rounded-md bg-brand-action px-3 text-sm font-medium text-fg-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                  >
                    {t('picker.tercero.confirmar')}
                  </button>
                </div>
              </form>
            )
          : null
      }
      formularioCrear={({ texto, onCreado, onCancelar }) => (
        <div className="flex flex-col gap-3">
          <SegmentedControl<VarianteTercero>
            etiqueta={t('picker.tercero.tipoCrear')}
            anchoCompleto
            valor={variante}
            onValorChange={setVariante}
            opciones={[
              { valor: 'cliente', etiqueta: t('picker.tercero.tipos.cliente') },
              { valor: 'proveedor', etiqueta: t('picker.tercero.tipos.proveedor') },
            ]}
          />
          <FormularioRapidoTercero<TerceroLista>
            key={variante}
            variante={variante}
            texto={texto}
            onCancelar={onCancelar}
            onCreado={onCreado}
            onCrear={async (datos) => {
              const org = getOrganizationId();
              if (!org) throw new Error('sin_organizacion');
              if (variante === 'proveedor') return deProveedor(await crearProveedorRapido(org, datos));
              try {
                return deCliente(await crearClienteRapido(org, sucursal, datos));
              } catch (error) {
                if (error instanceof ClienteDuplicadoError) {
                  const numero = datos.numeroDocumento.replace(/[.\s-]/g, '');
                  return {
                    tipo: 'cliente',
                    id: error.existente.id,
                    nit: numero || null,
                    dv: datos.tipoDocumento === 'nit' && datos.dv ? datos.dv : null,
                    nombre: error.existente.nombre,
                    documento: documentoTexto(datos.tipoDocumento, numero, datos.dv),
                  };
                }
                throw error;
              }
            }}
          />
        </div>
      )}
      textos={{
        placeholder: t('picker.tercero.placeholder'),
        buscar: t('picker.tercero.buscar'),
        vacio: t('picker.tercero.vacio'),
        crear: (texto) => t('picker.tercero.crearTexto', { texto }),
        ...textos,
      }}
    />
  );
}
