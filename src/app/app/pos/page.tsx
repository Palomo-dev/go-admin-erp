'use client';

import { useState, useEffect, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, useDefaultLayout } from 'react-resizable-panels';
import { ShoppingCart, Users, Settings, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { useAtajos } from '@/components/kit/useAtajos';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import { CartView } from '@/components/pos/CartView';
import { CartTabs } from '@/components/pos/CartTabs';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
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

/** Clave de localStorage con el ancho elegido para el panel de carrito/pago. */
const POS_LAYOUT_ID = 'pos-layout-productos-carrito';

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
  // muestra el estado de la caja y «⋯ Caja y dispositivo», y la barra inferior
  // se oculta con el carrito abierto o cobrando, donde manda la botonera «Cobrar».
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
    ocultarBarra: mobileView === 'cart' || showCheckout,
  });
  // Atajos de la pantalla (mapa canónico, src/lib/pos/venta/atajos.ts). Con el
  // cobro abierto manda el cobro. El resto de atajos los registra cada pieza.
  useAtajos(
    [
      { tecla: teclaAtajo('mapa'), accion: () => setMapaAtajos(true), descripcion: tAtajos('mapa') },
      { tecla: teclaAtajo('caja'), accion: abrirDialogoCaja, descripcion: tAtajos('caja') },
      { tecla: teclaAtajo('pantallaCliente'), accion: () => abrirMenuPantallaCliente(), descripcion: tAtajos('pantallaCliente') },
    ],
    { activo: !showCheckout, hayRafaga: hayRafagaDelLector },
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

    try {
      const updatedCart = await POSService.addItemToCart(activeCartId, product, cantidad, modifiers);
      updateCartInState(updatedCart);
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

        {/* Contenido principal - Layout Responsive */}
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
            <>
              {/* Botón volver a productos - solo móvil */}
              <div className="lg:hidden shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileView('products')}
                  className="text-xs dark:text-gray-400 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Seguir comprando
                </Button>
              </div>

              {/* Selector de cliente */}
              <Card className="dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200 shadow-sm shrink-0">
                <CardHeader className="p-2 sm:p-3 pb-1.5 sm:pb-2">
                  <CardTitle className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm dark:text-white text-gray-900">
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>Cliente</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3 pt-0">
                  <CustomerSelector
                    selectedCustomer={activeCart?.customer}
                    onCustomerSelect={handleCustomerSelect}
                  />
                </CardContent>
              </Card>

              {/* Pestañas de carritos */}
              <div className="shrink-0">
                <CartTabs
                  carts={carts}
                  activeCartId={activeCartId}
                  onCartSelect={setActiveCartId}
                  onNewCart={createNewCart}
                  onRemoveCart={removeCart}
                />
              </div>

              {/* Vista del carrito activo */}
              {activeCart && (
                <div className="shrink-0">
                  <CartView
                    cart={activeCart}
                    onCartUpdate={handleCartUpdate}
                    onCheckout={handleCheckout}
                    onHold={handleHoldCart}
                    onSendComanda={handleSendComanda}
                    cashSessionActive={!!cashSession}
                  />
                </div>
              )}
            </>
          );

          if (isDesktopLayout) {
            return (
              <PanelGroup
                id={POS_LAYOUT_ID}
                orientation="horizontal"
                defaultLayout={defaultLayout}
                onLayoutChanged={onLayoutChanged}
                className="flex-1 min-h-0"
              >
                <Panel id="productos" defaultSize="75%" minSize="35%" className="h-full overflow-y-auto">
                  {productsPane}
                </Panel>
                <PanelResizeHandle
                  title="Arrastra para ampliar el carrito · doble clic para restablecer"
                  className="group relative mx-1.5 w-1.5 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-500 active:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors cursor-ew-resize"
                >
                  <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-1 rounded-full bg-gray-400/60 dark:bg-gray-500/60 group-hover:bg-white/80" />
                </PanelResizeHandle>
                <Panel
                  id="carrito"
                  defaultSize="25%"
                  minSize="20%"
                  maxSize="60%"
                  className="h-full flex flex-col space-y-2 overflow-y-auto pb-2 min-h-0"
                >
                  {cartPane}
                </Panel>
              </PanelGroup>
            );
          }

          return (
            <div className="flex-1 flex flex-col gap-2 sm:gap-3 overflow-hidden">
              {/* === MÓVIL: Vista Productos (pantalla completa) === */}
              <div className={cn('overflow-hidden', mobileView === 'products' ? 'flex-1' : 'hidden')}>
                {productsPane}
              </div>

              {/* === MÓVIL: Vista Carrito (pantalla completa) === */}
              <div className={cn(
                'flex flex-col space-y-2 overflow-y-auto pb-20 min-h-0',
                mobileView === 'cart' ? 'flex-1' : 'hidden',
              )}>
                {cartPane}
              </div>
            </div>
          );
        })()}

        {/* === BOTÓN FLOTANTE CARRITO - Solo móvil === */}
        {mobileView === 'products' && (
          <button
            onClick={() => setMobileView('cart')}
            className={cn(
              'lg:hidden fixed bottom-[calc(var(--shell-barra-inferior,0px)+1.5rem)] right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-xl text-white font-semibold text-sm transition-all active:scale-95',
              activeCart && activeCart.items.length > 0
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-600 hover:bg-gray-700',
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            {activeCart && activeCart.items.length > 0 ? (
              <>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {activeCart.items.reduce((sum, i) => sum + i.quantity, 0)}
                </span>
                <span>{formatear(activeCart.total)}</span>
              </>
            ) : (
              <span>Carrito</span>
            )}
          </button>
        )}

        {/* Dialog de checkout */}
        {checkoutCart && (
          <CheckoutDialog
            key={checkoutCart.id}
            cart={checkoutCart}
            open={showCheckout}
            onOpenChange={setShowCheckout}
            onCheckoutComplete={handleCheckoutComplete}
          />
        )}
      </div>
    </div>
  );
}
