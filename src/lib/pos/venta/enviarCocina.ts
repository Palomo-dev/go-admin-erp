/**
 * «Enviar a cocina» desde el carrito del POS, L58 del plan. Extracción
 * LITERAL de `handleSendComanda` de `src/app/app/pos/page.tsx`, con sus
 * dependencias inyectadas (servicios, traductor `posCocina`, avisos):
 *
 * - Solo van las líneas cuya categoría exige preparación. Sin ninguna y sin
 *   comanda previa ⇒ aviso «sin preparación» y nada más.
 * - La llave de la ronda se guarda en el carrito ANTES de enviar: un reintento
 *   tras un corte es la misma ronda y la cocina no recibe dos comandas.
 * - La base decide qué es nuevo, qué cambió y qué se quitó (ronda
 *   transaccional N2) y devuelve las comandas (normales y de ajuste).
 * - Sin comandas ⇒ «sin cambios»; ronda repetida ⇒ «ya enviada» (no se
 *   reimprime); si no ⇒ se imprime cada comanda por estación y se avisa
 *   «enviado» o «sin impresora» para las estaciones sin impresora.
 * - Un error de la ruta sale como `Error` con el texto traducido de su código.
 */
import type { Cart, Category, Product } from '@/components/pos/types';
import { estacionDeCategoria, estacionEfectiva } from '@/lib/pos/estacionEfectiva';
import {
  itemsParaImprimir,
  lineaParaRonda,
  type ItemImpreso,
  type RespuestaRonda,
  type TextosAjusteImpreso,
} from '@/lib/pos/cocina/lineasCarrito';
import { CocinaError, type PeticionRonda } from '@/components/pos/cocina/cocinaCliente';

/** Traductor del namespace `posCocina` (el de next-intl cumple esta forma). */
export interface TraductorCocina {
  (clave: string, valores?: Record<string, string | number>): string;
  has(clave: string): boolean;
}

/** Comanda que se manda a imprimir (`PrintJobsService.enqueueKitchenTicket`). */
export interface ComandaImpresa {
  ticketId: number;
  tableName?: string;
  serverName?: string;
  createdAt: string;
  items: ItemImpreso[];
  businessName?: string;
  branchName?: string;
}

export interface DepsEnviarCocina {
  servicio: {
    setCartKitchenRoundKey(cartId: string, roundKey: string | null): Promise<Cart>;
    applyKitchenRound(cartId: string, respuesta: RespuestaRonda): Promise<Cart>;
  };
  enviarRonda: (peticion: PeticionRonda) => Promise<RespuestaRonda>;
  encolarImpresion: (branchId: number, comanda: ComandaImpresa) => Promise<{ enqueued: number; skippedStations: string[] }>;
  /** Nombre del cajero para la comanda; si falla o no hay, va «POS». */
  nombreCajero: () => Promise<string | null | undefined>;
  /** Llave nueva de ronda (hoy `crypto.randomUUID()`). */
  nuevaLlave: () => string;
  /** Refleja en la pantalla el carrito guardado. */
  actualizarCarrito: (cart: Cart) => void;
  t: TraductorCocina;
  avisar: { info: (mensaje: string) => unknown; success: (mensaje: string) => unknown };
  nombreNegocio?: string;
}

// La categoría llega como `category` (tipo del POS) o `categories` (embed de PostgREST).
type ProductWithCategory = Product & { categories?: Category | Category[] | null; variant_data?: unknown; station?: string | null };

export async function enviarACocina(cart: Cart, d: DepsEnviarCocina): Promise<void> {
  if (!cart.branch_id) return;
  const tCocina = d.t;

  // Filtrar solo items que requieren preparación
  const prepItems = cart.items.filter((item) => {
    const product = item.product as ProductWithCategory | undefined;
    const cat = product?.category || product?.categories;
    const requiresPrep = Array.isArray(cat) ? cat[0]?.requires_preparation : cat?.requires_preparation;
    return requiresPrep === true;
  });

  // Sin líneas de preparación y nada enviado antes: no hay qué mandar. Si ya
  // se envió algo (hay comanda), la ronda sí va: anula lo que se quitó.
  if (prepItems.length === 0 && !cart.kitchen_ticket_id) {
    d.avisar.info(tCocina('sinPreparacion'));
    return;
  }

  // Obtener nombre del usuario actual
  let serverName = 'POS';
  try {
    const name = await d.nombreCajero();
    if (name) serverName = name;
  } catch {
    // fallback: usar 'POS'
  }

  // TODAS las líneas de preparación, con su id estable: la base decide qué
  // es nuevo, qué cambió (cantidad, nota, alergia) y qué se quitó, y lo
  // manda en una sola ronda transaccional (N2). Ya no se compara por
  // nombre + cantidad ni se depende de la comanda guardada en pantalla.
  const lines = prepItems.map((item) => {
    const product = item.product as ProductWithCategory | undefined;
    // Estación propia del producto (en variantes ya viene resuelta con la del
    // padre desde ProductSearch) y, si no tiene, la de su categoría.
    const station = estacionEfectiva({
      propia: product?.station,
      categoria: estacionDeCategoria(product?.category || product?.categories),
    });
    return lineaParaRonda(item, station, (product?.variant_data as Record<string, string> | null | undefined) || null);
  });

  // La llave de la ronda se guarda ANTES de enviar: si la red falla y el
  // cajero reintenta, es la misma ronda y la cocina no recibe dos comandas.
  let roundKey = cart.kitchen_round_key;
  if (!roundKey) {
    roundKey = d.nuevaLlave();
    d.actualizarCarrito(await d.servicio.setCartKitchenRoundKey(cart.id, roundKey));
  }

  let respuesta: RespuestaRonda;
  try {
    respuesta = await d.enviarRonda({
      cart_id: cart.id,
      branch_id: cart.branch_id,
      round_key: roundKey,
      server_name: serverName,
      legacy_ticket_id: cart.kitchen_ticket_id ?? null,
      lines,
    });
  } catch (err) {
    const codigo = err instanceof CocinaError ? err.codigo : 'error_interno';
    throw new Error(tCocina.has(`errores.${codigo}`) ? tCocina(`errores.${codigo}`) : tCocina('errores.error_interno'));
  }
  d.actualizarCarrito(await d.servicio.applyKitchenRound(cart.id, respuesta));

  if (respuesta.tickets.length === 0) {
    d.avisar.info(tCocina('sinCambios'));
    return;
  }
  // Reintento de una ronda que ya había entrado: la cocina ya la tiene y ya se imprimió.
  if (respuesta.replayed) {
    d.avisar.info(tCocina('yaEnviada'));
    return;
  }

  const textos: TextosAjusteImpreso = {
    mesa: 'POS',
    ajuste: (original) => tCocina('impreso.ajuste', { id: original ?? '' }),
    mas: (n) => tCocina('impreso.mas', { cantidad: n }),
    menos: (n) => tCocina('impreso.menos', { cantidad: n }),
    anular: tCocina('impreso.anular'),
    notaCambiada: tCocina('impreso.nota'),
    alergia: tCocina('impreso.alergia'),
  };
  let enqueued = 0;
  const skippedStations = new Set<string>();
  for (const ticket of respuesta.tickets) {
    const impresion = await d.encolarImpresion(cart.branch_id, {
      ticketId: ticket.id,
      tableName: ticket.ticket_type === 'adjustment' ? `${textos.mesa} · ${textos.ajuste(ticket.adjusts_ticket_id)}` : textos.mesa,
      serverName,
      createdAt: ticket.created_at,
      items: itemsParaImprimir(ticket, textos),
      businessName: d.nombreNegocio,
      branchName: undefined,
    });
    enqueued += impresion.enqueued;
    impresion.skippedStations.forEach((s) => skippedStations.add(s));
  }

  const nuevas = respuesta.tickets.filter((t) => t.ticket_type === 'order').reduce((n, t) => n + t.items.length, 0);
  const ajustes = respuesta.tickets.filter((t) => t.ticket_type === 'adjustment').reduce((n, t) => n + t.items.length, 0);
  if (enqueued === 0 && skippedStations.size > 0) {
    d.avisar.info(tCocina('sinImpresora', { estaciones: Array.from(skippedStations).join(', ') }));
  } else {
    d.avisar.success(tCocina('enviado', { nuevas, ajustes }));
  }
}
