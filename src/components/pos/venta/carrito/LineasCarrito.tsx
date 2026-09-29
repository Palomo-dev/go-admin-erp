'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, CheckCircle, ChefHat, Package, Plus, Send, StickyNote, UserRound, type LucideIcon } from 'lucide-react';
import { CartLine, CartTag, Dialogo, useAtajos, type Atajo } from '@/components/kit';
import { CachedProductImage } from '@/components/pos/CachedProductImage';
import type { DestinoNota } from '@/components/pos/cocina/ChipsNotasRapidas';
import type { CartItem } from '@/components/pos/types';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { estadoCocinaLinea } from '@/lib/pos/cocina/lineasCarrito';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { decimalesCantidad, esMedido, simboloUnidad } from '@/lib/pos/peso/modoVenta';
import {
  accionCantidad,
  impuestoDeLinea,
  lineaVecina,
  lineasRecienAgregadas,
  requiresPreparation,
  tonoEstadoCocinaLinea,
  tonoNota,
  varianteDeProducto,
  vistaEstadoTicket,
  type CartProduct,
  type EstadoTicketCocina,
} from '@/lib/pos/venta/lineaCarrito';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { EditorDescuentoLinea } from './EditorDescuentoLinea';
import { EditorNotaLinea } from './EditorNotaLinea';

/**
 * Líneas del carrito del POS con `CartLine` del kit (paso 6 del plan,
 * POS-UX-V2 D3): dos renglones en escritorio, tres en móvil (< lg), etiquetas
 * `CartTag` (cocina, modificadores, notas, descuento), descuento y nota
 * editados en el sitio, confirmación al llegar a 0 y los atajos de la línea
 * con foco (+ − D N T Supr, registrados aquí con `useAtajos`: `CartLine` no
 * escucha el teclado).
 *
 * Solo pinta y enruta: cada acción es un callback de `CartView`, que llama a
 * `POSService` exactamente como antes. Ningún importe se calcula aquí.
 */
export interface EditorNotaAbierto {
  itemId: string | null;
  destino: DestinoNota;
  alergia: boolean;
  texto: string;
}

export interface EditorDescuentoAbierto {
  itemId: string | null;
  texto: string;
}

export interface LineasCarritoProps {
  cartId: string;
  branchId: number;
  items: CartItem[];
  /** Moneda de la organización (`useMonedaOrganizacion()`). */
  moneda: ContextoMoneda;
  formatear: (valor: number) => string;
  /** En espera o con deuda: controles deshabilitados. */
  bloqueada: boolean;
  /** Índices de las líneas sin impuesto configurado (`useLineasSinImpuesto`). */
  indicesSinImpuesto: ReadonlySet<number>;
  /** Estado del ticket de cocina del carrito (solo si hay ticket y ya se conoce). */
  estadoTicket: string | null;
  descuentosFrecuentes: Record<number, number[]>;
  /** false apaga los atajos de la línea (p. ej. con el cobro abierto). */
  atajosActivos?: boolean;
  onCantidad: (itemId: string, cantidad: number) => void;
  /** Línea por peso o medida: reabre «Pesar» en «cambiar peso» (chip o P). */
  onCambiarPeso?: (item: CartItem) => void;
  onQuitar: (itemId: string) => void;
  onExcluirImpuesto: (itemId: string) => void;
  /** Alterna «Incluido» de la línea. */
  onIncluido: (itemId: string) => void;
  nota: EditorNotaAbierto;
  onNotaAbrir: (itemId: string, destino: DestinoNota) => void;
  onNotaDestino: (itemId: string, destino: DestinoNota) => void;
  onNotaAlergia: (alergia: boolean) => void;
  onNotaTexto: (texto: string) => void;
  onNotaGuardar: (itemId: string) => void;
  onNotaCancelar: () => void;
  descuento: EditorDescuentoAbierto;
  onDescuentoAbrir: (item: CartItem) => void;
  onDescuentoTexto: (texto: string) => void;
  onDescuentoAplicar: (itemId: string, monto: number) => void;
  onDescuentoCancelar: () => void;
}

const ICONO_TICKET: Record<EstadoTicketCocina, LucideIcon> = {
  new: Send,
  preparing: ChefHat,
  ready: CheckCircle,
  delivered: Check,
};

/** Duración del resaltado de una línea recién agregada (D3c). */
const MS_RESALTADO = 1000;

export function LineasCarrito({
  cartId,
  branchId,
  items,
  moneda,
  formatear,
  bloqueada,
  indicesSinImpuesto,
  estadoTicket,
  descuentosFrecuentes,
  atajosActivos = true,
  onCantidad,
  onCambiarPeso,
  onQuitar,
  onExcluirImpuesto,
  onIncluido,
  nota,
  onNotaAbrir,
  onNotaDestino,
  onNotaAlergia,
  onNotaTexto,
  onNotaGuardar,
  onNotaCancelar,
  descuento,
  onDescuentoAbrir,
  onDescuentoTexto,
  onDescuentoAplicar,
  onDescuentoCancelar,
}: LineasCarritoProps) {
  const t = useTranslations('posVenta.carrito');
  const tNotas = useTranslations('posNotasLinea');
  const tAtajos = useTranslations('posVenta.atajos');
  const escritorio = useMediaQuery('(min-width: 1024px)');
  const layout = escritorio ? 'escritorio' : 'movil';

  // ── Foco: la línea con foco (anillo) y la parada de tabulador de la lista (↑ ↓).
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [enfocada, setEnfocada] = useState<string | null>(null);
  const [activa, setActiva] = useState<string | null>(null);
  const ids = items.map((i) => i.id);
  const idActiva = activa && ids.includes(activa) ? activa : ids[0] ?? null;

  // ── «−» en 1: confirmar antes de quitar (C-11).
  const [porQuitar, setPorQuitar] = useState<CartItem | null>(null);
  const pedirCantidad = (item: CartItem, cantidad: number) => {
    if (accionCantidad(cantidad) === 'confirmarQuitar') setPorQuitar(item);
    else onCantidad(item.id, cantidad);
  };

  // ── Recién agregada: resaltado ~1 s (solo líneas nuevas del mismo carrito).
  const [resaltadas, setResaltadas] = useState<ReadonlySet<string>>(() => new Set());
  const previo = useRef<{ cartId: string; ids: Set<string> } | null>(null);
  const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());
  const firmaIds = ids.join('|');
  useEffect(() => {
    const actuales = firmaIds ? firmaIds.split('|') : [];
    const anteriores = previo.current && previo.current.cartId === cartId ? previo.current.ids : null;
    previo.current = { cartId, ids: new Set(actuales) };
    const nuevas = lineasRecienAgregadas(anteriores, actuales);
    if (nuevas.length === 0) return;
    setResaltadas((prev) => new Set([...Array.from(prev), ...nuevas]));
    const timer = setTimeout(() => {
      temporizadores.current.delete(timer);
      setResaltadas((prev) => new Set(Array.from(prev).filter((id) => !nuevas.includes(id))));
    }, MS_RESALTADO);
    temporizadores.current.add(timer);
  }, [firmaIds, cartId]);
  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => pendientes.forEach((timer) => clearTimeout(timer));
  }, []);

  // ── Atajos de la línea con foco (POS-UX-V2 §3). Solo con el foco dentro de
  // una línea; las letras nunca dentro de un campo ni durante una ráfaga del lector.
  const lineaConFoco = (): CartItem | null => {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    if (!el) return null;
    return items.find((i) => refs.current.get(i.id)?.contains(el)) ?? null;
  };
  const hayLinea = () => !bloqueada && lineaConFoco() !== null;
  const conLinea = (fn: (item: CartItem) => void) => () => {
    const item = lineaConFoco();
    if (item) fn(item);
  };
  const enfocarLinea = (id: string | null) => {
    if (!id) return;
    setActiva(id);
    refs.current.get(id)?.focus();
  };
  const destinoNotaDe = (item: CartItem): DestinoNota => (!item.notes && item.customer_note ? 'cliente' : 'cocina');
  const grupo = tAtajos('grupos.linea');
  const atajos: Atajo[] = [
    // ± 1 no aplica a una línea por peso o medida: su cantidad se cambia en «Pesar» (P).
    { tecla: teclaAtajo('lineaMas'), descripcion: tAtajos('lineaMas'), grupo, cuando: hayLinea, accion: conLinea((i) => !esMedido(i.product) && pedirCantidad(i, i.quantity + 1)) },
    { tecla: teclaAtajo('lineaMenos'), descripcion: tAtajos('lineaMenos'), grupo, cuando: hayLinea, accion: conLinea((i) => !esMedido(i.product) && pedirCantidad(i, i.quantity - 1)) },
    {
      tecla: teclaAtajo('lineaPeso'),
      descripcion: tAtajos('lineaPeso'),
      grupo,
      cuando: () => hayLinea() && !!onCambiarPeso && !!lineaConFoco() && esMedido(lineaConFoco()?.product),
      accion: conLinea((i) => onCambiarPeso?.(i)),
    },
    { tecla: teclaAtajo('lineaDescuento'), descripcion: tAtajos('lineaDescuento'), grupo, cuando: hayLinea, accion: conLinea((i) => onDescuentoAbrir(i)) },
    { tecla: teclaAtajo('lineaNota'), descripcion: tAtajos('lineaNota'), grupo, cuando: hayLinea, accion: conLinea((i) => onNotaAbrir(i.id, destinoNotaDe(i))) },
    { tecla: teclaAtajo('lineaImpuesto'), descripcion: tAtajos('lineaImpuesto'), grupo, cuando: hayLinea, accion: conLinea((i) => onExcluirImpuesto(i.id)) },
    {
      tecla: teclaAtajo('lineaQuitar'),
      descripcion: tAtajos('lineaQuitar'),
      grupo,
      cuando: hayLinea,
      accion: conLinea((i) => {
        // El foco pasa a la vecina (la de abajo; si era la última, la de arriba).
        const pos = ids.indexOf(i.id);
        const vecina = ids[pos + 1] ?? ids[pos - 1] ?? null;
        onQuitar(i.id);
        enfocarLinea(vecina);
      }),
    },
  ];
  useAtajos(atajos, { activo: atajosActivos, hayRafaga: hayRafagaDelLector });

  const etiquetasDe = (item: CartItem): ReactNode[] => {
    const nombre = item.product.name;
    const etiquetas: ReactNode[] = [];

    // Estado del ticket de cocina, en las líneas que se preparan.
    if (estadoTicket && requiresPreparation(item.product as CartProduct | undefined)) {
      const vista = vistaEstadoTicket(estadoTicket);
      etiquetas.push(
        <CartTag key="ticket" tono={vista.tono} icono={ICONO_TICKET[vista.clave]}>
          {t(`cocina.${vista.clave}`)}
        </CartTag>,
      );
    }

    // La línea frente a lo enviado a cocina (por línea, no por ticket).
    const estado = estadoCocinaLinea(item);
    const tonoEstado = tonoEstadoCocinaLinea(estado);
    if (tonoEstado) {
      etiquetas.push(
        <CartTag key="estado-cocina" tono={tonoEstado} icono={ChefHat}>
          {estado === 'enviada' ? tNotas('enviada', { cantidad: item.kitchen_sent_qty ?? 0 }) : tNotas('cambioPendiente')}
        </CartTag>,
      );
    }

    // Modificadores elegidos: «{nombre} (+$X)».
    (item.modifiers ?? []).forEach((mod, i) => {
      etiquetas.push(
        <CartTag key={`mod-${mod.modifierId}-${i}`} tono="advertencia" icono={Plus} anchoMaximo={190}>
          {mod.extraPrice > 0 ? t('modificadorConPrecio', { nombre: mod.name, precio: formatear(mod.extraPrice) }) : mod.name}
        </CartTag>,
      );
    });

    // Notas: cocina (azul; alergia en rojo) y cliente (verde). Se ocultan mientras se edita la nota de la línea.
    if (nota.itemId !== item.id) {
      if (item.notes) {
        const texto = item.is_allergy ? tNotas('alergiaBadge', { nota: item.notes }) : item.notes;
        etiquetas.push(
          <CartTag
            key="nota-cocina"
            tono={tonoNota('cocina', item.is_allergy === true)}
            icono={item.is_allergy ? AlertTriangle : StickyNote}
            anchoMaximo={150}
            titulo={tNotas('notaCocina')}
            etiquetaAccesible={t('notaEtiqueta', { tipo: tNotas('notaCocina'), nota: texto })}
            onClick={() => onNotaAbrir(item.id, 'cocina')}
            deshabilitada={bloqueada}
          >
            {texto}
          </CartTag>,
        );
      }
      if (item.customer_note) {
        etiquetas.push(
          <CartTag
            key="nota-cliente"
            tono={tonoNota('cliente', false)}
            icono={UserRound}
            anchoMaximo={150}
            titulo={tNotas('notaCliente')}
            etiquetaAccesible={t('notaEtiqueta', { tipo: tNotas('notaCliente'), nota: item.customer_note })}
            onClick={() => onNotaAbrir(item.id, 'cliente')}
            deshabilitada={bloqueada}
          >
            {item.customer_note}
          </CartTag>,
        );
      }
    }

    // Descuento aplicado, editable (D). Se oculta mientras se edita.
    if (item.discount_amount && item.discount_amount > 0 && descuento.itemId !== item.id) {
      etiquetas.push(
        <CartTag
          key="descuento"
          origen="manual"
          atajo={teclaAtajo('lineaDescuento')}
          etiquetaAccesible={t('editarDescuentoDe', { nombre, monto: formatear(item.discount_amount) })}
          onClick={() => onDescuentoAbrir(item)}
          deshabilitada={bloqueada}
        >
          -{formatear(item.discount_amount)}
        </CartTag>,
      );
    }
    return etiquetas;
  };

  return (
    <>
      <ul className="flex flex-col gap-1.5" aria-label={t('lista')}>
        {items.map((item, itemIndex) => {
          const cartProduct = item.product as CartProduct | undefined;
          const editandoNota = nota.itemId === item.id;
          const editandoDescuento = descuento.itemId === item.id;
          return (
            <li
              key={item.id}
              data-linea-carrito=""
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setEnfocada((prev) => (prev === item.id ? null : prev));
                }
              }}
              onKeyDown={(e) => {
                // ↑ ↓ mueven el foco entre líneas cuando el foco está en la línea misma.
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                if (e.target !== refs.current.get(item.id) || hayRafagaDelLector()) return;
                e.preventDefault();
                enfocarLinea(lineaVecina(ids, item.id, e.key === 'ArrowDown' ? 1 : -1));
              }}
            >
              <CartLine
                ref={(el) => {
                  if (el) refs.current.set(item.id, el);
                  else refs.current.delete(item.id);
                }}
                linea={{
                  id: item.id,
                  nombre: item.product.name,
                  variante: varianteDeProducto(cartProduct),
                  sku: item.product.sku,
                  miniatura: (
                    <CachedProductImage
                      src={cartProduct?.image}
                      alt=""
                      mode="thumb"
                      className="size-full object-cover"
                      fallback={<Package className="size-4" strokeWidth={1.5} />}
                    />
                  ),
                  cantidad: item.quantity,
                  unidad: esMedido(item.product) ? simboloUnidad(item.product.unit_code) || item.product.unit_code : item.product.unit_code,
                  medida: esMedido(item.product),
                  decimales: esMedido(item.product) ? decimalesCantidad(item.product) : 0,
                  precioUnitario: item.unit_price,
                  total: item.total,
                  impuesto: impuestoDeLinea(item, indicesSinImpuesto.has(itemIndex)),
                }}
                moneda={moneda}
                etiquetas={etiquetasDe(item)}
                incluido={item.tax_included ?? false}
                onIncluidoChange={() => onIncluido(item.id)}
                onCantidad={(n) => pedirCantidad(item, n)}
                onCambiarPeso={onCambiarPeso && esMedido(item.product) ? () => onCambiarPeso(item) : undefined}
                onNota={() => onNotaAbrir(item.id, destinoNotaDe(item))}
                conNota={!!(item.notes || item.customer_note)}
                onExcluirImpuesto={() => onExcluirImpuesto(item.id)}
                onQuitar={() => onQuitar(item.id)}
                onAgregarDescuento={() => onDescuentoAbrir(item)}
                conDescuento={!!item.discount_amount && item.discount_amount > 0}
                onFoco={() => {
                  setEnfocada(item.id);
                  setActiva(item.id);
                }}
                bloqueada={bloqueada}
                resaltada={resaltadas.has(item.id)}
                enfocada={enfocada === item.id}
                layout={layout}
                tabIndex={item.id === idActiva ? 0 : -1}
                editorDescuento={
                  editandoDescuento ? (
                    <EditorDescuentoLinea
                      nombre={item.product.name}
                      valor={descuento.texto}
                      onValor={onDescuentoTexto}
                      onAplicar={(monto) => onDescuentoAplicar(item.id, monto)}
                      onCancelar={onDescuentoCancelar}
                      frecuentes={descuentosFrecuentes[item.product_id]}
                      formatear={formatear}
                      deshabilitado={bloqueada}
                    />
                  ) : undefined
                }
                editorNota={
                  editandoNota ? (
                    <EditorNotaLinea
                      branchId={branchId}
                      destino={nota.destino}
                      alergia={nota.alergia}
                      texto={nota.texto}
                      onDestino={(d) => onNotaDestino(item.id, d)}
                      onAlergia={onNotaAlergia}
                      onTexto={onNotaTexto}
                      onGuardar={() => onNotaGuardar(item.id)}
                      onCancelar={onNotaCancelar}
                    />
                  ) : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      <Dialogo
        abierto={porQuitar !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setPorQuitar(null);
        }}
        ancho={440}
        titulo={t('confirmarQuitarTitulo', { nombre: porQuitar?.product.name ?? '' })}
        descripcion={t('confirmarQuitarDescripcion')}
        primario={{
          etiqueta: t('quitar'),
          destructiva: true,
          onClick: () => {
            // La misma llamada de siempre: cantidad 0 quita la línea en el servicio (L7).
            if (porQuitar) onCantidad(porQuitar.id, 0);
            setPorQuitar(null);
          },
        }}
      />
    </>
  );
}
