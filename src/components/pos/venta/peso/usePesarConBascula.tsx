'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Product } from '@/components/pos/types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePesajeContexto } from '@/lib/pos/peso/usePesajeContexto';
import { useBasculaDelEquipo } from '@/lib/pos/bascula/useBasculaDelEquipo';
import { useLectorBascula } from '@/lib/pos/bascula/useLectorBascula';
import {
  armadoInicial,
  armadoTrasAgregar,
  decidirEscaneoConPesarAbierto,
  decidirPesada,
  observarLectura,
  type ArmadoBascula,
} from '@/lib/pos/bascula/flujoPesada';
import { entradaParaProducto, pesajeBascula, vistaLectura } from '@/lib/pos/bascula/pesada';
import { divisionPorDefecto } from '@/lib/pos/bascula/estabilidad';
import { taraInicial } from '@/lib/pos/bascula/taraSesion';
import { codigoUnidad, esPorPeso, formatoCantidad, type Pesaje } from '@/lib/pos/peso';
import { ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import { POSService } from '@/lib/services/posService';
import { DialogoPesar } from './DialogoPesar';
import { usePesadaEnPantalla } from './usePesadaEnPantalla';

/**
 * «Pesar» con la báscula del equipo y la venta por peso en un paso
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6, §11), independiente de
 * DÓNDE va la línea: el carrito del POS (`usePesarPos`) o el pedido de una
 * mesa («Agregar productos»). Quien lo usa da `agregar(linea)`, `deshacer(id)`
 * y `cambiar(id, …)`; la lógica (lector siempre abierto, lectura nueva,
 * directo o esperar a estabilizar, escaneo con el diálogo abierto, toast con
 * «Deshacer», tara recordada) vive una sola vez aquí y en
 * src/lib/pos/bascula/flujoPesada.ts.
 */

/** Una pesada (o cantidad por medida) lista para ir a su destino. */
export interface LineaPesada<M = unknown> {
  producto: Product;
  /** Precio por unidad de venta con modificadores (el de la línea). */
  precio: number;
  cantidad: number;
  pesaje?: Pesaje;
  modifiers?: M[];
}

export interface DestinoPesada<M = unknown> {
  /** Agrega la línea; devuelve su id (para «Deshacer») o null. */
  agregar: (linea: LineaPesada<M>) => Promise<string | null> | string | null;
  /** Quita una línea agregada («Deshacer»). */
  deshacer: (id: string) => Promise<void> | void;
  /** Cambia la cantidad (y el pesaje) de una línea existente. */
  cambiar: (id: string, cantidad: number, pesaje: Pesaje | undefined) => Promise<void> | void;
}

interface EstadoPesar<M> {
  producto: Product;
  precio: number;
  modo: 'agregar' | 'cambiar';
  lineaId?: string;
  cantidadInicial?: number;
  modifiers?: M[];
  /** Venta en un paso: se agrega sola al estabilizarse. */
  auto?: boolean;
}

export interface PesarConBascula<M = unknown> {
  /**
   * Tocar o escanear un producto por peso o medida. `precio`: el de la línea
   * ya calculado (la mesa); sin él se toma `producto.price` o el vigente, más
   * `extras` (modificadores).
   */
  abrirAgregar: (producto: Product, opciones?: { modifiers?: M[]; precio?: number; extras?: number }) => Promise<void>;
  abrirCambiar: (linea: { id: string; producto: Product; precio: number; cantidad: number }) => void;
  /** Lo que está abierto en «Pesar» (para decidir un escaneo con el diálogo abierto). */
  pendiente: { producto: Product; modo: 'agregar' | 'cambiar' } | null;
  /** Cierra «Pesar» sin agregar. */
  cancelar: () => void;
  dialogo: ReactNode;
}

export function usePesarConBascula<M = unknown>(
  destino: DestinoPesada<M>,
  opciones: { pantallaCliente?: boolean } = {},
): PesarConBascula<M> {
  const t = useTranslations('posPeso.dialogo');
  const tb = useTranslations('posBascula.venta');
  const moneda = useMonedaOrganizacion();
  const contexto = usePesajeContexto();
  // Báscula de este equipo (fase 3): sin ella, «Pesar» sigue con el peso a mano.
  const bascula = useBasculaDelEquipo();
  const [estado, setEstadoInterno] = useState<EstadoPesar<M> | null>(null);
  // El escaneo puede llegar antes del siguiente render: el estado vigente, sin esperar.
  const estadoRef = useRef<EstadoPesar<M> | null>(null);
  const setEstado = useCallback((e: EstadoPesar<M> | null) => {
    estadoRef.current = e;
    setEstadoInterno(e);
  }, []);
  // Lector del equipo abierto mientras la pantalla está montada (la lectura es
  // local: sigue sin internet). Sin báscula no abre nada.
  const lector = useLectorBascula(bascula.config, !!bascula.config);
  const agregarAlEstabilizar = contexto.agregarAlEstabilizar !== false;
  // Lectura nueva desde la última pesada agregada (evita repetir el peso del producto anterior).
  const [armado, setArmado] = useState<ArmadoBascula>(armadoInicial);
  const division = bascula.config?.division ?? divisionPorDefecto(bascula.config?.decimales ?? 3);
  const pesoActual = lector.estado?.peso ?? null;
  useEffect(() => {
    setArmado((a) => observarLectura(a, pesoActual, division));
  }, [pesoActual, division]);
  const pesoActualRef = useRef<number | null>(null);
  pesoActualRef.current = pesoActual;

  const { publicar, retirar } = usePesadaEnPantalla(!!opciones.pantallaCliente && contexto.pesoEnPantallaCliente);
  const cerrar = useCallback(() => {
    setEstado(null);
    retirar();
  }, [retirar, setEstado]);
  const enVivo = useCallback(
    (cantidad: number | null) => {
      if (estado) publicar(estado.producto, estado.precio, cantidad);
    },
    [estado, publicar],
  );

  const avisarError = (error: unknown, producto: Product) => {
    console.error('Error agregando la pesada:', error);
    toast.error(
      error instanceof ProductoSinPrecioError
        ? t(error.causa === 'sin_precio' ? 'sinPrecio' : 'precioNoConsultado', { producto: producto.name })
        : t('errorAgregar', { producto: producto.name }),
    );
  };

  /** Agrega la línea y, si viene de la báscula, «Agregado: … · Deshacer». */
  const agregarLinea = async (linea: LineaPesada<M>) => {
    const id = await destino.agregar(linea);
    if (linea.pesaje?.origen !== 'bascula') return;
    setArmado(armadoTrasAgregar(pesoActualRef.current));
    toast.success(
      tb('agregado', {
        cantidad: formatoCantidad(linea.cantidad, linea.producto),
        producto: linea.producto.name,
        importe: moneda.formatear(linea.cantidad * linea.precio),
      }),
      {
        duration: 4000,
        action: id
          ? {
              label: tb('deshacer'),
              onClick: () => {
                Promise.resolve(destino.deshacer(id)).catch((error) => avisarError(error, linea.producto));
              },
            }
          : undefined,
      },
    );
  };

  const abrirAgregar: PesarConBascula<M>['abrirAgregar'] = async (producto, op = {}) => {
    // Otro escaneo con «Pesar» abierto: nunca se confirma la pendiente de forma implícita.
    const abierto = estadoRef.current;
    if (abierto) {
      const decision = decidirEscaneoConPesarAbierto({ productoAbiertoId: abierto.producto.id, productoNuevoId: producto.id, modo: abierto.modo });
      if (decision === 'ignorar') return;
      toast.info(tb('pesadaCancelada', { producto: abierto.producto.name }));
      cerrar();
    }
    let precio = op.precio;
    if (precio === undefined) {
      let base = Number(producto.price);
      if (!Number.isFinite(base)) {
        try {
          base = await POSService.precioVigenteProducto(producto.id, producto.name);
        } catch (error) {
          avisarError(error, producto);
          return;
        }
      }
      precio = base + (op.extras ?? 0);
    }

    // Venta en un paso: con báscula y una lectura estable, válida y nueva, directo.
    const hayBascula = !!bascula.config && esPorPeso(producto);
    const vista = hayBascula
      ? vistaLectura(entradaParaProducto({ lector: lector.estado, producto, config: bascula.config, tara: taraInicial(producto) }))
      : null;
    const decision = decidirPesada({ porPeso: esPorPeso(producto), hayBascula, agregarAlEstabilizar, vista, armada: armado.armada });
    if (decision.tipo === 'agregar_directo' && vista && bascula.config && vista.neto !== null) {
      const pesaje = pesajeBascula({ basculaId: bascula.config.id, vista, unidadProducto: codigoUnidad(producto.unit_code) || 'KG' });
      try {
        await agregarLinea({ producto, precio, cantidad: pesaje.neto, pesaje, modifiers: op.modifiers });
      } catch (error) {
        avisarError(error, producto);
      }
      return;
    }
    setEstado({ producto, precio, modo: 'agregar', modifiers: op.modifiers, auto: decision.tipo === 'abrir_esperando' });
  };

  const abrirCambiar: PesarConBascula<M>['abrirCambiar'] = (linea) => {
    setEstado({ producto: linea.producto, precio: linea.precio, modo: 'cambiar', lineaId: linea.id, cantidadInicial: linea.cantidad });
  };

  const confirmar = async (cantidad: number, pesaje: Pesaje | undefined) => {
    const actual = estadoRef.current;
    if (!actual) return;
    try {
      if (actual.modo === 'cambiar' && actual.lineaId) {
        await destino.cambiar(actual.lineaId, cantidad, pesaje);
        if (pesaje?.origen === 'bascula') setArmado(armadoTrasAgregar(pesoActualRef.current));
      } else {
        await agregarLinea({ producto: actual.producto, precio: actual.precio, cantidad, pesaje, modifiers: actual.modifiers });
      }
      cerrar();
    } catch (error) {
      avisarError(error, actual.producto);
    }
  };

  const dialogo = (
    <DialogoPesar
      abierto={estado !== null}
      onAbiertoChange={(abierto) => {
        if (!abierto) cerrar();
      }}
      producto={estado?.producto ?? null}
      precioPorUnidad={estado?.precio ?? 0}
      moneda={moneda}
      puedePesarAMano={contexto.puedePesarAMano}
      modo={estado?.modo ?? 'agregar'}
      cantidadInicial={estado?.cantidadInicial ?? null}
      onConfirmar={confirmar}
      onCantidadEnVivo={opciones.pantallaCliente ? enVivo : undefined}
      bascula={bascula.config}
      lector={bascula.config ? lector : null}
      agregarAlEstabilizar={!!estado?.auto}
      lecturaNueva={armado.armada}
    />
  );

  const pendiente = useMemo(() => (estado ? { producto: estado.producto, modo: estado.modo } : null), [estado]);

  return {
    abrirAgregar,
    abrirCambiar,
    pendiente,
    cancelar: cerrar,
    dialogo,
  };
}
