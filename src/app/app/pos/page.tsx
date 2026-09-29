'use client';

import { useState, useEffect, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, useDefaultLayout } from 'react-resizable-panels';
import { Settings, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { useAtajos } from '@/components/kit/useAtajos';
import { KbdButton } from '@/components/kit/KbdButton';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { PanelCarrito } from '@/components/pos/venta/PanelCarrito';
import { BarraCobroMovil } from '@/components/pos/venta/BarraCobroMovil';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { estadoBotonCobrar } from '@/lib/pos/venta/requisitosCarrito';
import { CabeceraPos, abrirMenuPantallaCliente } from '@/components/pos/venta/CabeceraPos';
import { HojaCajaDispositivo } from '@/components/pos/venta/HojaCajaDispositivo';
import { MapaAtajos } from '@/components/pos/venta/MapaAtajos';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { POSService } from '@/lib/services/posService';
import { getPosDisplayEmitter, resolveDisplayCurrency, startPosDisplay, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { Product, Customer, Cart, CartItemModifier } from '@/components/pos/types';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { VentasService, DailySummary } from '@/components/pos/ventas';
import { PrintJobsService } from '@/lib/services/printJobsService';
import KitchenService from '@/lib/services/kitchenService';
import { getUserName } from '@/lib/services/userService';
import { supabase } from '@/lib/supabase/config';
import { toast } from 'sonner';
import { AperturaCajaDialog } from '@/components/pos/cajas/AperturaCajaDialog';
import { CierreCajaDialog } from '@/components/pos/cajas/CierreCajaDialog';
import { startSalesSync } from '@/lib/offline/salesSync';
import { startOfflineSync } from '@/lib/offline/syncStages';
import { CASH_OUTBOX_CHANGED_EVENT } from '@/lib/offline/cashOutbox';
import { isDesktop } from '@/lib/utils/desktop';
import { CajasService } from '@/components/pos/cajas/CajasService';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { useBlindCloseMode } from '@/components/pos/cajas/useBlindCloseMode';
import { usePermisosCaja } from '@/components/pos/cajas/usePermisosCaja';
import { puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import type { CashSession } from '@/components/pos/cajas/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { useTranslations } from 'next-intl';
import { enviarRondaCocina } from '@/components/pos/cocina/cocinaCliente';
import { ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import {
  asignarClienteAlCarrito,
  cerrarCarrito,
  completarCobro,
  crearCarrito,
  inicializarCarritos,
} from '@/lib/pos/venta/carritos';
import { enviarACocina } from '@/lib/pos/venta/enviarCocina';
import { useRouter, useSearchParams } from 'next/navigation';
import { DialogoClienteMembresia } from '@/components/pos/venta/DialogoClienteMembresia';
import { usePesarPos } from '@/components/pos/venta/peso/usePesarPos';
import { esMedido } from '@/lib/pos/peso/modoVenta';
import { claveEnlacePos, debePedirCliente, leerEnlacePos, lineaParaQuitar, type EnlacePos } from '@/lib/pos/venta/membresias';

/**
 * Clave de localStorage con el ancho elegido para el panel del carrito. «-v2»
 * (paso 9, D1): el carrito arranca en 560 px; el reparto 75/25 guardado con
 * la versión anterior no se reutiliza.
 */
const POS_LAYOUT_ID = 'pos-layout-productos-carrito-v2';

export default function POSPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter, isLoading: branchLoading, selectedBranchId } = useBranch();
  const [carts, setCarts] = useState<Cart[]>([]);
  const [activeCartId, setActiveCartId] = useState('');
  // Solo se escribe (el carrito activo es la fuente de verdad del cliente): se conserva el setter.
  const [, setSelectedCustomer] = useState<Customer | undefined>();
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutCart, setCheckoutCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFirstLoadRef = useRef(true);
  const isInitializingRef = useRef(false);
  const [, setLastUpdate] = useState(new Date());
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  // Cabecera (paso 3): apertura/cierre de caja abiertos por programa (F9, la
  // hoja móvil, el botón de la cabecera), hoja «Caja y dispositivo» y mapa F1.
  const [dialogoCaja, setDialogoCaja] = useState(false);
  const [hojaCaja, setHojaCaja] = useState(false);
  const [mapaAtajos, setMapaAtajos] = useState(false);
  // D4: ¿la organización exige caja para cobrar? (`pos_require_cash_session`,
  // la misma configuración que revisa el cobro al abrirse). Mientras se lee, sí.
  const [requiereCaja, setRequiereCaja] = useState(true);
  // F2: lista de clientes del carrito activo (CustomerPicker del kit).
  const [clienteAbierto, setClienteAbierto] = useState(false);
  // Membresías (docs/design/MEMBRESIAS-FASE-1-2.md, frame D1): se agregó una
  // membresía a un carrito sin cliente → diálogo que pide el titular.
  const [pideCliente, setPideCliente] = useState<{ cartId: string; producto: string; productId: number; cantidad: number } | null>(null);
  // Enlace `?cliente=&producto=` (renovar): se aplica una sola vez por enlace.
  const searchParams = useSearchParams();
  const router = useRouter();
  const enlaceAplicadoRef = useRef<string | null>(null);
  const tMembresias = useTranslations('membresias.pos');
  const [, setDailySummary] = useState<DailySummary | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const permisosCaja = usePermisosCaja();
  const { showExpected } = useBlindCloseMode();
  const { formatear } = useMonedaOrganizacion();
  const { timezone } = useOrgTimezone();
  const tHeader = useTranslations('header');
  const tCocina = useTranslations('posCocina');
  const tCobro = useTranslations('posCobroServidor');
  const tCabecera = useTranslations('posVenta.cabecera');
  const tAtajos = useTranslations('posVenta.atajos');
  const tPagina = useTranslations('posVenta.pagina');
  const tBarra = useTranslations('posVenta.barraMovil');
  // Quién puede cerrar la caja lo decide el servidor (`usePermisosCaja`),
  // nunca el nombre del rol (regla dura 6).
  const canClose = cashSession ? puedeCerrarCaja(cashSession, permisosCaja.userId ?? currentUserId, permisosCaja.cerrarCajasAjenas) : false;
  const estadoCaja = cashSession
    ? tHeader('posCashOpen', { time: formatTimeInTz(cashSession.opened_at, timezone) })
    : tHeader('posCashClosed');
  // F9, «Abrir/Cerrar caja» de la cabecera y de la hoja móvil: abre el diálogo
  // que toque (apertura sin caja; cierre si este cajero puede cerrarla).
  const abrirDialogoCaja = () => {
    if (cashSession && !canClose) return;
    setDialogoCaja(true);
  };
  // Shell móvil (Figma MobileHeader Mode=pos y MobileTabBar): la cabecera
  // muestra el estado de la caja y «⋯ Caja y dispositivo». La barra inferior
  // de la app NO se muestra en el POS (Figma B.12 · D3c móvil; regla central en
  // cabeceraMovil.tsx: el POS es un flujo a pantalla completa): abajo mandan el
  // total y «Cobrar» fijos, y para salir está la flecha «←» de la cabecera.
  useCabeceraMovil({
    modo: 'pos',
    estadoPos: { texto: estadoCaja, tono: cashSession ? 'exito' : 'advertencia' },
    accion: (
      <button
        type="button"
        onClick={() => setHojaCaja(true)}
        aria-label={tCabecera('abrirHoja')}
        title={tCabecera('abrirHoja')}
        className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
    ),
  });
  // Atajos de la pantalla (mapa canónico, src/lib/pos/venta/atajos.ts). Con el
  // cobro abierto manda el cobro. El resto de atajos los registra cada pieza.
  useAtajos(
    [
      { tecla: teclaAtajo('mapa'), accion: () => setMapaAtajos(true), descripcion: tAtajos('mapa') },
      { tecla: teclaAtajo('caja'), accion: abrirDialogoCaja, descripcion: tAtajos('caja') },
      { tecla: teclaAtajo('pantallaCliente'), accion: () => abrirMenuPantallaCliente(), descripcion: tAtajos('pantallaCliente') },
      { tecla: teclaAtajo('cliente'), accion: () => setClienteAbierto(true), descripcion: tAtajos('cliente') },
      {
        // Celular o tableta con teclado y la hoja del carrito cerrada: F4 de la barra fija
        // (con la hoja abierta, o en escritorio, lo registra el propio carrito).
        tecla: teclaAtajo('cobrar'),
        descripcion: tAtajos('cobrar'),
        cuando: () => !isDesktopLayout && mobileView === 'products' && !!activeCart,
        accion: () => {
          if (!activeCart) return;
          const estado = estadoBotonCobrar({ caja: !!cashSession, config: { requiereCaja }, carrito: activeCart });
          if (estado === 'listo') handleCheckout(activeCart);
          else if (estado === 'sin-caja') abrirDialogoCaja();
          else if (estado === 'sin-cliente') setClienteAbierto(true);
        },
      },
    ],
    { activo: !showCheckout && !pideCliente, hayRafaga: hayRafagaDelLector },
  );
  // Escritorio (≥ lg): productos y carrito en paneles redimensionables. El
  // ancho elegido se recuerda por navegador; doble clic en el divisor lo
  // restablece. En móvil se conserva la vista de pantalla completa por sección.
  const isDesktopLayout = useMediaQuery('(min-width: 1024px)');
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: POS_LAYOUT_ID,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    onlySaveAfterUserInteractions: true,
  });

  // Cargar userId y rol del usuario actual
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          // Nombre del cajero para la cabecera de la pantalla del cliente (PLAN §4.3).
          getUserName(user.id)
            .then((name) => {
              if (name) getPosDisplayEmitter().setSession({ cashier: { name } });
            })
            .catch(() => undefined);
          // Quién puede cerrar una caja ajena lo decide el servidor
          // (`usePermisosCaja`), nunca el nombre del rol (regla dura 6).
        }
      } catch (err) {
        console.warn('Error loading user info:', err);
      }
    };
    if (organization?.id) {
      loadUserInfo();
    }
  }, [organization]);

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id && !branchLoading) {
      initializePOS();
      loadDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, branchFilter, branchLoading]);

  // Pantalla del cliente (PLAN §12 Fase 0): un emisor por ventana de caja.
  // Arranca con la organización y su moneda; al salir del POS se despide
  // (`bye`) para que la pantalla pase a «Conectando». Si el interruptor
  // maestro está apagado, startPosDisplay no abre ningún transporte. La
  // moneda no condiciona el arranque: si la consulta falla se emite en COP.
  // `isCancelled` cubre la salida del POS mientras startPosDisplay aún carga
  // el interruptor: sin ella, el arranque diferido reabriría transporte y
  // latido en una página que ya no existe.
  useEffect(() => {
    const orgId = organization?.id;
    if (!orgId) return;
    let cancelled = false;
    resolveDisplayCurrency(() => POSService.getBaseCurrency())
      .then((currency) => {
        if (cancelled) return;
        return startPosDisplay({ organizationId: orgId, currency, isCancelled: () => cancelled });
      })
      .catch((err) => console.warn('[pos-display] no se pudo arrancar el emisor:', err));
    // Con dos pestañas de /app/pos la pantalla sigue a la última que saluda:
    // al recuperar el foco esta pestaña vuelve a presentarse (PLAN §8).
    const onFocus = () => getPosDisplayEmitter().reannounce();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      stopPosDisplay();
    };
  }, [organization?.id]);

  // Caja abierta/cerrada y cajero: viajan en `hello` (PLAN §8).
  useEffect(() => {
    getPosDisplayEmitter().setSession({ sessionOpen: !!cashSession });
  }, [cashSession]);

  // Desktop (fase 4B): reproducir las ventas hechas sin conexión al abrir el
  // POS con red y cada vez que vuelva la conectividad real. No-op en navegador.
  useEffect(() => {
    return startSalesSync();
  }, []);

  // Desktop (fase 4F): orquestador de sincronización (clientes → caja:
  // aperturas → ventas → caja: movimientos y cierres) al abrir el POS con
  // red y al volver la conectividad. No-op en navegador.
  useEffect(() => {
    return startOfflineSync();
  }, []);

  // Desktop (fase 4F): la caja abierta/cerrada sin red vive en el outbox
  // local; cuando cambia (apertura, cierre, sincronización) se relee.
  useEffect(() => {
    if (!isDesktop() || !organization?.id) return;
    const onCashOutbox = () => {
      CajasService.getActiveSession()
        .then((session) => setCashSession(session))
        .catch((err) => console.error('Error reloading cash session after outbox change:', err));
    };
    window.addEventListener(CASH_OUTBOX_CHANGED_EVENT, onCashOutbox);
    return () => window.removeEventListener(CASH_OUTBOX_CHANGED_EVENT, onCashOutbox);
  }, [organization?.id]);

  // Suscripción realtime a cash_sessions para que el estado de caja
  // (abierta/cerrada) se actualice de inmediato cuando otra pestaña/terminal
  // abre o cierra la caja, igual que /comandas. Debounce de 300ms.
  useEffect(() => {
    if (!organization?.id) return;

    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const triggerReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Solo recargar la sesión de caja (no los carritos del POS)
        CajasService.getActiveSession()
          .then((session) => setCashSession(session))
          .catch((err) => console.error('Error realtime reload cash session:', err));
      }, 300);
    };

    const unsubscribe = CajasService.subscribeToCashSessions(
      organization.id,
      triggerReload,
      { includeMovements: false }
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, branchFilter]);

  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    ConfiguracionService.getRequireCashSessionConfig()
      .then((config) => {
        if (vigente) setRequiereCaja(config.require_cash_session !== false);
      })
      .catch((err) => console.warn('Error leyendo si la caja es obligatoria:', err));
    return () => {
      vigente = false;
    };
  }, [organization?.id]);

  const loadDashboardData = async () => {
    try {
      const [summary, session] = await Promise.all([
        VentasService.getDailySummary(),
        CajasService.getActiveSession()
      ]);
      setDailySummary(summary);
      setCashSession(session);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const handleSessionOpened = (session: CashSession) => {
    setCashSession(session);
    loadDashboardData();
    const monto = tCabecera('montoInicial', { monto: formatear(session.initial_amount) });
    toast.success(session.pending_sync ? tCabecera('cajaAbiertaSinConexion') : tCabecera('cajaAbiertaToast'), {
      description: session.pending_sync ? `${monto} · ${tCabecera('pendienteSincronizar')}` : monto,
    });
  };

  const handleSessionClosed = (session: CashSession) => {
    // Recargar desde Supabase en lugar de asumir null: podría existir
    // otra caja abierta (global o de otra sucursal) que getActiveSession encontraría.
    CajasService.getActiveSession()
      .then((activeSession) => setCashSession(activeSession))
      .catch((err) => {
        console.error('Error reloading cash session after close:', err);
        setCashSession(null);
      });
    loadDashboardData();
    toast.success(session.pending_sync ? tCabecera('cajaCerradaSinConexion') : tCabecera('cajaCerradaToast'), {
      description: (showExpected ? tCabecera('diferencia', { monto: formatear(Math.abs(session.difference || 0)) }) : tCabecera('cajaCerradaToast'))
        + (session.pending_sync ? ` · ${tCabecera('pendienteSincronizar')}` : '')
    });
  };

  // Carritos (L1-L4 de docs/implementacion/POS-PLAN.md): la lógica vive en
  // src/lib/pos/venta/carritos.ts; aquí solo se conecta con el estado.
  const initializePOS = () =>
    inicializarCarritos({
      servicio: POSService,
      branchId: selectedBranchId,
      cerrojo: isInitializingRef,
      empezar: () => {
        if (isFirstLoadRef.current) {
          setIsLoading(true);
        }
        setIsRefreshing(true);
      },
      terminar: () => {
        isFirstLoadRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      },
      mostrar: (existingCarts) => {
        setCarts(existingCarts);
        setActiveCartId(existingCarts[0].id);
      },
      crearCarrito: createNewCart,
    });

  const createNewCart = () =>
    crearCarrito({
      servicio: POSService,
      branchId: selectedBranchId,
      avisarSinSucursal: () => toast.error(tPagina('seleccioneSucursal')),
      agregar: (newCart) => {
        setCarts(prevCarts => [...prevCarts, newCart]);
        setActiveCartId(newCart.id);
        setSelectedCustomer(undefined);
        setLastUpdate(new Date());
      },
      avisarError: () => toast.error(tPagina('errorCrearCarrito')),
    });

  const removeCart = (cartId: string) =>
    cerrarCarrito({
      cartId,
      carts,
      activeCartId,
      servicio: POSService,
      cocina: KitchenService,
      setCarts,
      activar: setActiveCartId,
      crearCarrito: createNewCart,
    });

  // `cantidad` llega con la cantidad rápida «3*» del buscador (una unidad si no).
  const handleProductSelect = async (product: Product, modifiers?: CartItemModifier[], cantidad = 1) => {
    if (!activeCartId) {
      toast.error(tPagina('sinCarritoActivo'));
      return;
    }

    // Por peso o medida: se pesa (o se escribe la cantidad) antes de agregar; la cantidad rápida «3*» no aplica.
    if (esMedido(product)) {
      await pesar.abrirAgregar(product, modifiers);
      return;
    }

    try {
      const updatedCart = await POSService.addItemToCart(activeCartId, product, cantidad, modifiers);
      updateCartInState(updatedCart);
      // D1 (P1): una membresía necesita el cliente titular; la línea ya quedó en el carrito.
      if (debePedirCliente(product, updatedCart)) {
        setPideCliente({ cartId: updatedCart.id, producto: product.name ?? String(product.id), productId: product.id, cantidad });
      }
    } catch (error) {
      console.error('Error adding product to cart:', error);
      // Sin precio vigente el producto ya no entra gratis: se dice por qué.
      toast.error(error instanceof ProductoSinPrecioError
        ? tCobro(error.causa === 'sin_precio' ? 'productoSinPrecio' : 'precioNoConsultado', { producto: product.name ?? String(product.id) })
        : tPagina('errorAgregar'));
    }
  };

  // L34: la habitación que pueda mandar CustomerSelector se ignora.
  const handleCustomerSelect = (customer?: Customer) =>
    asignarClienteAlCarrito({
      servicio: POSService,
      activeCartId,
      customer,
      actualizar: (updatedCart) => {
        updateCartInState(updatedCart);
        setSelectedCustomer(customer);
      },
      avisarError: () => toast.error(tPagina('errorAsignarCliente')),
    });

  // D1 «Asignar y agregar»: el cliente elegido pasa a ser el del carrito (titular).
  const asignarTitular = (cliente: Customer) =>
    asignarClienteAlCarrito({
      servicio: POSService,
      activeCartId: pideCliente?.cartId ?? activeCartId,
      customer: cliente,
      actualizar: (updatedCart) => {
        updateCartInState(updatedCart);
        setSelectedCustomer(cliente);
        setPideCliente(null);
      },
      avisarError: () => toast.error(tPagina('errorAsignarCliente')),
    });

  // D1 «Quitar la membresía»: deshace solo las unidades recién agregadas.
  const quitarMembresia = async () => {
    if (!pideCliente) return;
    const carrito = carts.find((c) => c.id === pideCliente.cartId);
    const quitar = carrito ? lineaParaQuitar(carrito.items, pideCliente.productId, pideCliente.cantidad) : null;
    try {
      if (quitar) {
        const updatedCart = quitar.nuevaCantidad > 0
          ? await POSService.updateCartItemQuantity(pideCliente.cartId, quitar.itemId, quitar.nuevaCantidad)
          : await POSService.removeItemFromCart(pideCliente.cartId, quitar.itemId);
        updateCartInState(updatedCart);
      }
      setPideCliente(null);
    } catch (error) {
      console.error('Error quitando la membresía del carrito:', error);
      toast.error(tMembresias('dialogo.errorQuitar'));
    }
  };

  // Enlace de renovación `/app/pos?cliente=<uuid>&producto=<id>` (o solo
  // `?producto=`): el cliente se valida en la organización activa y el
  // producto se agrega una vez; después se limpia la URL.
  const aplicarEnlace = async (enlace: EnlacePos, cartId: string) => {
    if (enlace.clienteId) {
      let existe = false;
      try {
        existe = await POSService.existeClienteEnOrganizacion(enlace.clienteId);
      } catch (error) {
        console.error('Error validando el cliente del enlace:', error);
      }
      if (existe) {
        try {
          updateCartInState(await POSService.setCartCustomer(cartId, enlace.clienteId));
        } catch (error) {
          console.error('Error asignando el cliente del enlace:', error);
          toast.error(tPagina('errorAsignarCliente'));
        }
      } else {
        toast.error(tMembresias('enlace.clienteNoEncontrado'));
      }
    }
    if (enlace.productoId !== null) {
      const producto = await POSService.getProductById(enlace.productoId);
      if (!producto || producto.status !== 'active') {
        toast.error(tMembresias('enlace.productoNoEncontrado'));
        return;
      }
      await handleProductSelect(producto);
    }
  };

  useEffect(() => {
    const enlace = leerEnlacePos(searchParams);
    if (!enlace) {
      enlaceAplicadoRef.current = null;
      return;
    }
    if (!organization?.id || isLoading || !activeCartId) return;
    const clave = claveEnlacePos(enlace);
    if (enlaceAplicadoRef.current === clave) return;
    enlaceAplicadoRef.current = clave;
    router.replace('/app/pos', { scroll: false });
    void aplicarEnlace(enlace, activeCartId);
    // Solo el enlace y la disponibilidad del carrito disparan el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, organization?.id, isLoading, activeCartId]);

  const updateCartInState = (updatedCart: Cart) => {
    setCarts(prevCarts => 
      prevCarts.map(cart => 
        cart.id === updatedCart.id ? updatedCart : cart
      )
    );
    setLastUpdate(new Date());
  };

  const handleCartUpdate = (updatedCart: Cart) => {
    updateCartInState(updatedCart);
  };

  // Productos por peso o medida: «Pesar» (agregar una pesada o cambiar el peso de una línea).
  const pesar = usePesarPos({ cartId: activeCartId, actualizar: updateCartInState });

  const handleCheckout = (cart: Cart) => {
    setCheckoutCart(cart);
    setShowCheckout(true);
  };

  const handleCheckoutComplete = () =>
    completarCobro({
      checkoutCart,
      carts,
      cocina: KitchenService,
      setCarts,
      activar: setActiveCartId,
      crearCarrito: createNewCart,
      cerrarDialogo: () => {
        setCheckoutCart(null);
        setShowCheckout(false);
      },
    });

  const handleHoldCart = (cart: Cart, reason?: string) => {
    updateCartInState(cart);
    toast.success(reason ? tPagina('enEsperaConMotivo', { motivo: reason }) : tPagina('enEspera'));
  };

  // L58: la lógica de «Enviar a cocina» vive en src/lib/pos/venta/enviarCocina.ts.
  const handleSendComanda = (cart: Cart) =>
    enviarACocina(cart, {
      servicio: POSService,
      enviarRonda: enviarRondaCocina,
      encolarImpresion: (branchId, comanda) => PrintJobsService.enqueueKitchenTicket(branchId, comanda),
      nombreCajero: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        return user ? getUserName(user.id) : null;
      },
      nuevaLlave: () => crypto.randomUUID(),
      actualizarCarrito: updateCartInState,
      t: tCocina,
      avisar: toast,
      nombreNegocio: organization?.name,
    });

  // Obtener carrito activo
  const activeCart = carts.find(cart => cart.id === activeCartId);

  // La pestaña que el cajero tiene delante es lo que ve el cliente. Las
  // mutaciones las avisa posService al guardar; aquí se cubre el cambio de
  // pestaña y la eliminación (el emisor deduplica si ambos avisan lo mismo).
  useEffect(() => {
    getPosDisplayEmitter().setActiveCart(activeCart ?? null);
  }, [activeCart]);

  // Contadores de la cabecera: los mismos carritos de la sucursal que las pestañas.
  const carritosActivos = carts.filter(c => c.status === 'active').length;
  const carritosEnEspera = carts.filter(c => c.status === 'hold').length;

  // Estados de carga
  if (orgLoading || branchLoading || (isLoading && carts.length === 0)) {
    return (
      <div className="flex h-full flex-col gap-3 bg-canvas p-2 sm:p-4" aria-busy="true">
        <Skeleton className="hidden h-16 w-full rounded-xl lg:block" />
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-8 w-2/3 rounded-lg" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
          <Skeleton className="hidden w-[400px] shrink-0 rounded-xl lg:block" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-4">
        <EmptyState
          variante="error"
          icono={Settings}
          titulo={tCabecera('organizacionNoEncontrada')}
          descripcion={tCabecera('configureOrganizacion')}
        />
      </div>
    );
  }

  return (
    <div className={cn("h-full bg-canvas p-2 sm:p-4", isRefreshing && "opacity-60 pointer-events-none")}>
      <div className="w-full h-full flex flex-col space-y-2 sm:space-y-3">
        {/* Cabecera (escritorio y tableta ≥ lg; en celular la lleva el MobileHeader Mode=pos y su «⋯»). */}
        <CabeceraPos
          organizacionNombre={organization?.name}
          cajaAbierta={!!cashSession}
          cierreBloqueado={!!cashSession && !canClose}
          onCaja={abrirDialogoCaja}
          carritosActivos={carritosActivos}
          carritosEnEspera={carritosEnEspera}
        />
        {/* Apertura y cierre de caja: abiertos por programa (cabecera, F9, hoja móvil, «Abrir caja para cobrar»). */}
        {cashSession ? (
          canClose && (
            <CierreCajaDialog
              session={cashSession}
              onSessionClosed={handleSessionClosed}
              open={dialogoCaja}
              onOpenChange={setDialogoCaja}
            />
          )
        ) : (
          <AperturaCajaDialog onSessionOpened={handleSessionOpened} open={dialogoCaja} onOpenChange={setDialogoCaja} />
        )}
        <HojaCajaDispositivo
          abierta={hojaCaja}
          onAbiertaChange={setHojaCaja}
          cajaAbierta={!!cashSession}
          estadoCaja={estadoCaja}
          cierreBloqueado={!!cashSession && !canClose}
          onCaja={abrirDialogoCaja}
          onAtajos={() => setMapaAtajos(true)}
          carritosActivos={carritosActivos}
          carritosEnEspera={carritosEnEspera}
        />
        <MapaAtajos abierto={mapaAtajos} onAbiertoChange={setMapaAtajos} />

        {/* Contenido principal: productos | carrito (paso 9) */}
        {(() => {
          const productsPane = (
            <ProductSearch
              onProductSelect={(product, modifiers, cantidad) => {
                handleProductSelect(product, modifiers, cantidad);
              }}
              bloqueado={showCheckout}
            />
          );

          const cartPane = (
            <PanelCarrito
              carts={carts}
              activeCart={activeCart}
              activeCartId={activeCartId}
              onCartSelect={setActiveCartId}
              onNewCart={createNewCart}
              onRemoveCart={removeCart}
              sinSucursal={!selectedBranchId}
              onClienteSelect={handleCustomerSelect}
              clienteAbierto={clienteAbierto}
              onClienteAbiertoChange={setClienteAbierto}
              atajosActivos={!showCheckout && !pideCliente}
              carrito={{
                onPedirCliente: () => setClienteAbierto(true),
                onCartUpdate: handleCartUpdate,
                onCheckout: handleCheckout,
                onHold: handleHoldCart,
                onSendComanda: handleSendComanda,
                cashSessionActive: !!cashSession,
                requiereCaja,
                onAbrirCaja: abrirDialogoCaja,
                onCambiarPeso: pesar.abrirCambiar,
              }}
            />
          );

          if (isDesktopLayout) {
            // D1: divisor arrastrable con el carrito a 560 px por defecto
            // (mínimo 400); el ancho elegido se recuerda en el navegador.
            return (
              <PanelGroup
                id={POS_LAYOUT_ID}
                orientation="horizontal"
                defaultLayout={defaultLayout}
                onLayoutChanged={onLayoutChanged}
                className="flex-1 min-h-0"
              >
                <Panel id="productos" minSize="35%" className="h-full min-h-0">
                  {productsPane}
                </Panel>
                <PanelResizeHandle
                  title={tPagina('divisor')}
                  className="group relative mx-2 w-1.5 shrink-0 cursor-ew-resize rounded-full bg-line transition-colors hover:bg-brand-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:bg-brand-action"
                >
                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong group-hover:bg-surface" />
                </PanelResizeHandle>
                <Panel id="carrito" defaultSize="560px" minSize="400px" maxSize="60%" className="h-full min-h-0">
                  {cartPane}
                </Panel>
              </PanelGroup>
            );
          }

          return (
            <div className="flex-1 flex flex-col gap-2 sm:gap-3 overflow-hidden">
              {/* Celular y tableta vertical (< 1024, D2): la grilla ocupa la pantalla, la barra fija lleva
                  el total y «Cobrar · F4» (o «Abrir caja para cobrar») y el carrito se abre en una hoja. */}
              <div className="min-h-0 flex-1 overflow-hidden">{productsPane}</div>
              <Sheet open={mobileView === 'cart'} onOpenChange={(abierta) => setMobileView(abierta ? 'cart' : 'products')}>
                <SheetContent side="bottom" hideCloseButton className="flex h-[92dvh] flex-col gap-2 rounded-t-2xl border-line bg-canvas p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <SheetTitle className="text-base font-semibold text-fg">{tBarra('hojaCarrito')}</SheetTitle>
                    <SheetDescription className="sr-only">{tBarra('etiqueta')}</SheetDescription>
                    <KbdButton variante="fantasma" tamano="sm" icono={ArrowLeft} onClick={() => setMobileView('products')}>
                      {tBarra('seguirComprando')}
                    </KbdButton>
                  </div>
                  {cartPane}
                </SheetContent>
              </Sheet>
              {mobileView === 'products' && (
                <BarraCobroMovil
                  unidades={activeCart ? activeCart.items.reduce((sum, i) => sum + i.quantity, 0) : 0}
                  total={formatear(activeCart?.total ?? 0)}
                  estado={activeCart ? estadoBotonCobrar({ caja: !!cashSession, config: { requiereCaja }, carrito: activeCart }) : 'vacio'}
                  onVerCarrito={() => setMobileView('cart')}
                  onCobrar={() => activeCart && handleCheckout(activeCart)}
                  onAbrirCaja={abrirDialogoCaja}
                />
              )}
            </div>
          );
        })()}

        {/* Dialog de checkout */}
        {checkoutCart && (
          <CheckoutDialog
            key={checkoutCart.id}
            cart={checkoutCart}
            open={showCheckout}
            onOpenChange={setShowCheckout}
            onCheckoutComplete={handleCheckoutComplete}
            onPedirCliente={() => {
              setShowCheckout(false);
              setClienteAbierto(true);
            }}
          />
        )}

        {/* Productos por peso o medida: «Pesar». */}
        {pesar.dialogo}

        {/* D1: la membresía recién agregada pide su cliente titular. */}
        <DialogoClienteMembresia
          abierto={!!pideCliente}
          onAbiertoChange={(abierto) => {
            if (!abierto) setPideCliente(null);
          }}
          producto={pideCliente?.producto ?? ''}
          onAsignar={asignarTitular}
          onQuitar={quitarMembresia}
        />
      </div>
    </div>
  );
}
