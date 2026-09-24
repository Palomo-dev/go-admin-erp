/**
 * Ciclo de vida de los carritos de la pantalla del POS (`/app/pos`).
 *
 * Extracción LITERAL (paso 1 del plan `docs/implementacion/POS-PLAN.md`, L1-L4
 * y L34) de lo que vivía dentro de `src/app/app/pos/page.tsx`: la página sigue
 * siendo dueña de su estado y le pasa a estas funciones los servicios y los
 * «puertos» con los que lo cambia (`setCarts`, `activar`…). El orden de las
 * llamadas y los casos de error son los mismos de antes; no se cambió ninguna
 * regla.
 */
import type { Cart, Customer } from '@/components/pos/types';

/** Lo que estas funciones necesitan de `POSService`. */
export interface ServicioCarritos {
  getActiveCarts(branchId?: number | null): Promise<Cart[]>;
  createCart(branchId: number): Promise<Cart>;
  removeCart(cartId: string): Promise<void>;
  setCartCustomer(cartId: string, customerId?: string): Promise<Cart>;
}

/** Lo que estas funciones necesitan de `KitchenService`. */
export interface ServicioComandas {
  markTicketAsDelivered(ticketId: number): Promise<unknown>;
}

/** Cerrojo compartido entre llamadas (un `useRef(false)` en la página). */
export interface Cerrojo {
  current: boolean;
}

export type ResultadoCrearCarrito = 'creado' | 'sin_sucursal' | 'error';

/**
 * L2: crea un carrito en la sucursal elegida. Sin sucursal concreta («Todas»)
 * no se crea y se avisa. El carrito nuevo se AÑADE a los que ya hay en
 * pantalla y queda activo.
 */
export async function crearCarrito(d: {
  servicio: Pick<ServicioCarritos, 'createCart'>;
  branchId: number | null;
  /** Hoy: `toast.error('Seleccione una sucursal antes de crear un carrito')`. */
  avisarSinSucursal: () => void;
  /** Hoy: agrega el carrito al estado, lo activa y limpia el cliente elegido. */
  agregar: (carrito: Cart) => void;
  /** Hoy: `alert('Error al crear nuevo carrito')`. */
  avisarError: () => void;
}): Promise<ResultadoCrearCarrito> {
  try {
    // Usar branch_id actual seleccionado por el usuario
    if (!d.branchId) {
      d.avisarSinSucursal();
      return 'sin_sucursal';
    }
    const newCart = await d.servicio.createCart(d.branchId);
    d.agregar(newCart);
    return 'creado';
  } catch (error) {
    console.error('Error creating new cart:', error);
    d.avisarError();
    return 'error';
  }
}

/**
 * L1: al entrar al POS (o al cambiar de sucursal, L38) se cargan los carritos
 * vivos de la sucursal; con carritos, el primero queda activo; sin carritos
 * —o si la lectura falla— se crea uno. Dos inicializaciones solapadas
 * (StrictMode, cambio de sucursal mientras carga) no crean dos carritos: la
 * segunda sale sin hacer nada mientras el cerrojo está puesto.
 */
export async function inicializarCarritos(d: {
  servicio: Pick<ServicioCarritos, 'getActiveCarts'>;
  branchId: number | null;
  cerrojo: Cerrojo;
  /** Marca la página como cargando (antes de leer). */
  empezar: () => void;
  /** Quita las marcas de carga (siempre, al final). */
  terminar: () => void;
  /** Muestra los carritos leídos y activa el primero. */
  mostrar: (carritos: Cart[]) => void;
  crearCarrito: () => Promise<unknown>;
}): Promise<void> {
  // Dos inicializaciones solapadas (StrictMode, cambio de sucursal mientras
  // carga) con el almacenamiento vacío creaban un carrito cada una.
  if (d.cerrojo.current) return;
  d.cerrojo.current = true;
  d.empezar();
  try {
    // Cargar carritos existentes
    // Solo los carritos de ESTA sucursal (pos_carts_<org> guarda los de todas).
    const existingCarts = await d.servicio.getActiveCarts(d.branchId);

    if (existingCarts.length > 0) {
      d.mostrar(existingCarts);
    } else {
      // Crear primer carrito
      await d.crearCarrito();
    }
  } catch (error) {
    console.error('Error initializing POS:', error);
    // Crear carrito por defecto en caso de error
    await d.crearCarrito();
  } finally {
    d.cerrojo.current = false;
    d.terminar();
  }
}

/**
 * L3: cerrar la pestaña de un carrito. Si tenía comanda, se marca entregada;
 * se borra de `pos_carts_<org>` (si solo saliera del estado, volvería al
 * regresar al POS); si era el activo se activa el primero que queda; si no
 * queda ninguno, se crea uno. Un error se registra y no se propaga.
 */
export async function cerrarCarrito(d: {
  cartId: string;
  carts: Cart[];
  activeCartId: string;
  servicio: Pick<ServicioCarritos, 'removeCart'>;
  cocina: ServicioComandas;
  setCarts: (carritos: Cart[]) => void;
  activar: (cartId: string) => void;
  crearCarrito: () => Promise<unknown>;
}): Promise<void> {
  try {
    // Marcar kitchen_ticket como entregado si el carrito tenía uno
    const cartToRemove = d.carts.find(c => c.id === d.cartId);
    if (cartToRemove?.kitchen_ticket_id) {
      await d.cocina.markTicketAsDelivered(cartToRemove.kitchen_ticket_id);
    }

    // Borrarlo también de localStorage: si solo sale del estado, vuelve
    // (con sus productos) en cuanto se navega y se regresa al POS.
    await d.servicio.removeCart(d.cartId);

    const updatedCarts = d.carts.filter(cart => cart.id !== d.cartId);
    d.setCarts(updatedCarts);

    // Si el carrito activo fue eliminado, cambiar a otro
    if (d.cartId === d.activeCartId && updatedCarts.length > 0) {
      d.activar(updatedCarts[0].id);
    } else if (updatedCarts.length === 0) {
      // Crear nuevo carrito si no quedan
      await d.crearCarrito();
    }
  } catch (error) {
    console.error('Error removing cart:', error);
  }
}

/**
 * L4: al terminar el cobro se marca entregada la comanda (si había), se quita
 * de la pantalla el carrito cobrado y se activa el primero que queda o, si era
 * el único, se crea uno. Después se cierra el diálogo. (El servicio ya lo
 * borró de `pos_carts_<org>` al cobrar.)
 */
export async function completarCobro(d: {
  checkoutCart: Cart | null;
  carts: Cart[];
  cocina: ServicioComandas;
  setCarts: (carritos: Cart[]) => void;
  activar: (cartId: string) => void;
  crearCarrito: () => Promise<unknown>;
  /** Hoy: `setCheckoutCart(null); setShowCheckout(false)`. */
  cerrarDialogo: () => void;
}): Promise<void> {
  try {
    // Marcar kitchen_ticket como entregado si existe
    if (d.checkoutCart?.kitchen_ticket_id) {
      await d.cocina.markTicketAsDelivered(d.checkoutCart.kitchen_ticket_id);
    }

    // Remover el carrito completado
    if (d.checkoutCart) {
      const checkoutCartId = d.checkoutCart.id;
      const updatedCarts = d.carts.filter(cart => cart.id !== checkoutCartId);
      d.setCarts(updatedCarts);

      // Crear nuevo carrito si era el único
      if (updatedCarts.length === 0) {
        await d.crearCarrito();
      } else {
        d.activar(updatedCarts[0].id);
      }
    }

    // El recibo se muestra automáticamente en el CheckoutDialog
    // Cerrar el dialog después de procesar
    d.cerrarDialogo();
  } catch (error) {
    console.error('Error completing checkout:', error);
  }
}

/**
 * L34: asignar (o quitar) el cliente del carrito activo. Solo viaja el id del
 * cliente: si el cajero eligió una habitación ocupada, la habitación se
 * IGNORA (la venta no se carga a la habitación). Se fija tal cual; el
 * rediseño no lo cambia.
 */
export async function asignarClienteAlCarrito(d: {
  servicio: Pick<ServicioCarritos, 'setCartCustomer'>;
  activeCartId: string;
  customer?: Customer;
  actualizar: (carrito: Cart) => void;
  /** Hoy: `alert('Error al asignar cliente al carrito')`. */
  avisarError: () => void;
}): Promise<void> {
  if (!d.activeCartId) return;

  try {
    const updatedCart = await d.servicio.setCartCustomer(d.activeCartId, d.customer?.id);
    d.actualizar(updatedCart);
  } catch (error) {
    console.error('Error setting cart customer:', error);
    d.avisarError();
  }
}
