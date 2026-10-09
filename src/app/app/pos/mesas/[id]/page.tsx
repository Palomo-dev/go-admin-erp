'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ShoppingCart, WifiOff, X } from 'lucide-react';
import { Dialogo, DialogoMotivo, KbdButton, useAtajos, type AccionFila } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CheckoutDialog } from '@/components/pos/CheckoutDialog';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import { CartTabs } from '@/components/pos/CartTabs';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';
import { CabeceraPos } from '@/components/pos/venta/CabeceraPos';
import { AperturaCajaDialog } from '@/components/pos/cajas/AperturaCajaDialog';
import { CajasService } from '@/components/pos/cajas/CajasService';
import type { CashSession } from '@/components/pos/cajas/types';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { usePesarConBascula } from '@/components/pos/venta/peso/usePesarConBascula';
import { useNotasRapidas } from '@/components/pos/cocina/ChipsNotasRapidas';
import { SessionTimelineDialog } from '@/components/pos/mesas/id/SessionTimelineDialog';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import { MesasService } from '@/components/pos/mesas/mesasService';
import { LiberarMesaDialog } from '@/components/pos/mesas/LiberarMesaDialog';
import { LiberacionMesaError } from '@/components/pos/mesas/liberacionMesaCliente';
import { useReservasMesas } from '@/components/pos/mesas/useReservasMesas';
import { vistaMesaPlano, type VistaMesaPlano } from '@/components/pos/mesas/plano/estadoMesaPlano';
import { PantallaMesa, type EstadoPantallaMesa, type ModoPantallaMesa } from '@/components/pos/mesas/cuenta/PantallaMesa';
import { PanelCuentaMesa, type EstadoCobroMesa } from '@/components/pos/mesas/cuenta/PanelCuentaMesa';
import { CabeceraMesa } from '@/components/pos/mesas/cuenta/CabeceraMesa';
import { CabeceraMovilMesa } from '@/components/pos/mesas/cuenta/CabeceraMovilMesa';
import { MenuMesa } from '@/components/pos/mesas/cuenta/MenuMesa';
import { FilaClienteMesa, FilaNotaMesa } from '@/components/pos/mesas/cuenta/FilasCuentaMesa';
import { NotaMesaPanel } from '@/components/pos/mesas/cuenta/NotaMesaPanel';
import { EditorLineaMesa } from '@/components/pos/mesas/cuenta/EditorLineaMesa';
import { AbrirMesaFlujo } from '@/components/pos/mesas/cuenta/AbrirMesaFlujo';
import { MoverMesaDialog } from '@/components/pos/mesas/cuenta/MoverMesaDialog';
import { DividirCuentaDialog } from '@/components/pos/mesas/cuenta/DividirCuentaDialog';
import { CobrarPartesDialog } from '@/components/pos/mesas/cuenta/CobrarPartesDialog';
import { PreCuentaMesaDialog } from '@/components/pos/mesas/cuenta/PreCuentaMesaDialog';
import { imprimirPreCuentaMesa, imprimirRondaMesa } from '@/components/pos/mesas/cuenta/impresionMesa';
import {
  agruparCuenta,
  mesaAbandonada,
  minutosDesde,
  textoDuracion,
  carritoMesaConImpuestoIncluido,
  prepararLineasCobroMesa,
  totalesCuenta,
  unirPendientes,
  type LineaMesa,
  type ParteCobro,
  type ParteMesa,
} from '@/components/pos/mesas/cuenta/cuentaMesaLogica';
import {
  agregarProductoMesa,
  asignarClienteMesa,
  cargarCuentaMesa,
  codigoError,
  enviarRondaMesa,
  guardarLineaMesa,
  guardarNotaMesa,
  listarMeseros,
  marcarEstadoMesa,
  marcarServido,
  moverMesa,
  type CuentaMesa,
  type ModoMover,
  type OpcionMesero,
} from '@/components/pos/mesas/cuenta/cuentaMesaService';
import { POSService } from '@/lib/services/posService';
import { branchService } from '@/lib/services/branchService';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { esMedido } from '@/lib/pos/peso/modoVenta';
import { ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { Cart, CartItem, CartItemModifier, CheckoutData, CobroVentaExistente, Customer, Product, Sale } from '@/components/pos/types';
import type { SaleItem } from '@/components/pos/mesas/id/types';
import { CartaQrEnLaCuenta } from '@/components/pos/mesas/solicitudes/CartaQrEnLaCuenta';
import { totalPagadoEnLinea } from '@/components/pos/mesas/solicitudes/cartaQrMesaLogica';
import { CARTA_QR_VACIA, cargarCartaQrDeLaMesa, suscribirPagosEnLinea, type CartaQrDeLaMesa } from '@/components/pos/mesas/solicitudes/cartaQrMesaService';
import { useSolicitudesMesa } from '@/components/pos/mesas/solicitudes/useSolicitudesMesa';
import { useTextosCartaQr } from '@/components/pos/mesas/solicitudes/textosCartaQr';
import { cn } from '@/utils/Utils';

/** Pequeña cola de rondas sin conexión (S5): se envían solas al volver la red. */
const CLAVE_COLA = 'pos-mesas-rondas-en-cola';
type RondaEnCola = { sesionId: string; roundKey: string };
function leerCola(): RondaEnCola[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function escribirCola(cola: RondaEnCola[]) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch {
    /* sin almacenamiento: la ronda se reintenta a mano */
  }
}

export default function MesaCuentaPage() {
  const params = useParams();
  const router = useRouter();
  const tableId = params?.id as string;
  const t = useTranslations('posMesasFlujo');
  const tCocina = useTranslations('posCocina');
  const { organization, branch_id } = useOrganization();
  const { branchFilter, selectedBranchId } = useBranch();
  const { timezone } = useOrgTimezone();
  const moneda = useMonedaOrganizacion();
  const { formatear } = moneda;
  const escritorio = useMediaQuery('(min-width: 1280px)');
  const tableta = useMediaQuery('(min-width: 1024px)');
  const modo: ModoPantallaMesa = escritorio ? 'escritorio' : tableta ? 'tableta' : 'movil';

  const [cuenta, setCuenta] = useState<CuentaMesa | null>(null);
  const [estado, setEstado] = useState<EstadoPantallaMesa>('cargando');
  const [ahora, setAhora] = useState(() => new Date());
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [meseros, setMeseros] = useState<OpcionMesero[]>([]);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [caja, setCaja] = useState<CashSession | null>(null);
  const [requiereCaja, setRequiereCaja] = useState(true);
  const [sucursal, setSucursal] = useState<{ name?: string; address?: string; phone?: string } | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [cola, setCola] = useState<RondaEnCola[]>([]);
  const [mesasPlano, setMesasPlano] = useState<VistaMesaPlano[]>([]);

  // Diálogos
  const [abrir, setAbrir] = useState(false);
  const pendienteAlAbrir = useRef<null | (() => void)>(null);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [editor, setEditor] = useState<{ linea: LineaMesa; soloComensal: boolean } | null>(null);
  const [guardandoLinea, setGuardandoLinea] = useState(false);
  const [mover, setMover] = useState<{ modo: ModoMover; lineaId: string | null } | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [partes, setPartes] = useState<ParteCobro[] | null>(null);
  const [partesAbierto, setPartesAbierto] = useState(false);
  const [precuenta, setPrecuenta] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [cobro, setCobro] = useState<{ parte: ParteCobro | null; propina: { porcentaje: number | null; valor: number } | null } | null>(null);
  const [liberar, setLiberar] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [anular, setAnular] = useState<{ linea: LineaMesa; restar: boolean } | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [aperturaCaja, setAperturaCaja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [modificar, setModificar] = useState<{ linea: LineaMesa; producto: Product } | null>(null);
  const [meseroAbierto, setMeseroAbierto] = useState(false);
  const liberacionFallida = useRef(false);
  const [hojaMovil, setHojaMovil] = useState(false);

  const sesion = cuenta?.sesion ?? null;
  const mesaNombre = cuenta?.mesa.nombre ?? t('mesa');

  // Carta QR: solicitudes de esta mesa, pagos en línea, valoración y quién pidió cada ronda.
  const tq = useTextosCartaQr();
  const [cartaQr, setCartaQr] = useState<CartaQrDeLaMesa>(CARTA_QR_VACIA);
  const [versionCartaQr, setVersionCartaQr] = useState(0);
  const sesionId = sesion?.id ?? null;
  const ventaId = (sesion as { sale_id?: string | null } | null)?.sale_id ?? null;
  useEffect(() => {
    let vigente = true;
    cargarCartaQrDeLaMesa(sesionId, ventaId).then((c) => vigente && setCartaQr(c));
    return () => {
      vigente = false;
    };
  }, [sesionId, ventaId, versionCartaQr]);
  useEffect(() => {
    if (!sesionId) return;
    return suscribirPagosEnLinea(sesionId, () => {
      void cargarRef.current(true);
      setVersionCartaQr((v) => v + 1);
    });
  }, [sesionId]);
  const cargarRef = useRef<(silencioso?: boolean) => Promise<void>>(async () => undefined);
  const solicitudesQr = useSolicitudesMesa(cuenta?.mesa.branchId ?? null, (s) => {
    if (s.mesaId !== tableId) return;
    toast.warning(tq('solicitudes.nuevaTitulo', { mesa: mesaNombre, tipo: tq(`solicitudes.tipo.${s.tipo}`) }), {
      description: s.motivo ? `«${s.motivo}»` : tq('solicitudes.nuevaDetalle'),
    });
    // «Pedir la cuenta» cambia el estado de la mesa; un pago en línea, el saldo.
    void cargarRef.current(true);
    setVersionCartaQr((v) => v + 1);
  });
  const solicitudesDeLaMesa = solicitudesQr.solicitudes.filter((s) => s.mesaId === tableId);
  const lineasConComensal = useMemo(
    () =>
      (cuenta?.lineas ?? []).map((l) =>
        l.quienPidio || !l.pedidoWeb ? l : { ...l, quienPidio: cartaQr.comensales.get(l.pedidoWeb) ?? null },
      ),
    [cuenta, cartaQr.comensales],
  );
  const agrupada = useMemo(() => agruparCuenta(lineasConComensal, cuenta?.comandas ?? []), [lineasConComensal, cuenta]);
  const totales = useMemo(() => totalesCuenta(cuenta?.lineas ?? []), [cuenta]);
  const notasRapidasDatos = useNotasRapidas(cuenta?.mesa.branchId ?? branch_id ?? null, !!cuenta);
  const notasRapidas = useMemo(
    () => (notasRapidasDatos?.notas ?? []).filter((n) => n.kind === 'kitchen' || n.kind === 'allergy').map((n) => ({ texto: n.label, alergia: n.kind === 'allergy' })),
    [notasRapidasDatos],
  );
  const decimales = moneda.decimals ?? 0;

  // Impuestos con su nombre («Impoconsumo 8 %»).
  const [impuestos, setImpuestos] = useState<Array<{ name: string; rate: number }>>([]);
  const nombreImpuesto = useCallback(
    (tasa: number) => {
      const iguales = impuestos.filter((i) => Number(i.rate) === Number(tasa));
      const pct = `${new Intl.NumberFormat(moneda.locale, { maximumFractionDigits: 2 }).format(Number(tasa))} %`;
      return iguales.length === 1 ? `${iguales[0].name} ${pct}` : t('cuenta.impuesto', { tasa: pct });
    },
    [impuestos, t, moneda.locale],
  );

  // ── Carga ────────────────────────────────────────────────────────────────
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setEstado((e) => (e === 'lista' ? e : 'cargando'));
      try {
        const c = await cargarCuentaMesa(tableId);
        setCuenta(c);
        setEstado('lista');
        if (!c.sesion && !silencioso) setAbrir(true);
      } catch (error) {
        const codigo = (error as { code?: string })?.code ?? codigoError(error);
        if (silencioso && cuenta) {
          toast.error(t('pantalla.noActualizada'));
          return;
        }
        setEstado(codigo === '42501' || codigo === 'sin_acceso' || codigo === 'mesa_no_encontrada' ? 'sinPermiso' : 'error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableId, t],
  );

  cargarRef.current = cargar;

  useEffect(() => {
    void cargar();
  }, [cargar, branchFilter]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let vigente = true;
    supabase.auth.getUser().then(({ data }) => vigente && setUsuarioId(data.user?.id ?? null));
    POSService.getOrganizationTaxes()
      .then((tx) => vigente && setImpuestos(((tx ?? []) as Array<{ name: string; rate: number | string; is_active?: boolean }>).filter((x) => x.is_active !== false).map((x) => ({ name: x.name, rate: Number(x.rate) }))))
      .catch(() => undefined);
    CajasService.getActiveSession().then((s) => vigente && setCaja(s)).catch(() => undefined);
    ConfiguracionService.getRequireCashSessionConfig()
      .then((c) => vigente && setRequiereCaja(c.require_cash_session !== false))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!organization?.id) return;
    listarMeseros(organization.id).then(setMeseros).catch(() => setMeseros([]));
  }, [organization?.id]);

  useEffect(() => {
    if (!branch_id) return;
    branchService.getBranchById(branch_id).then((b) => setSucursal(b as typeof sucursal)).catch(() => undefined);
  }, [branch_id]);

  // Pestañas del carrito (escritorio): los carritos del mostrador de la sede.
  const cargarCarritos = useCallback(() => {
    if (!escritorio) return;
    POSService.getActiveCarts(selectedBranchId).then(setCarts).catch(() => setCarts([]));
  }, [escritorio, selectedBranchId]);
  useEffect(() => cargarCarritos(), [cargarCarritos]);

  // Tiempo real: la cocina cambia el estado de las líneas de esta mesa.
  useEffect(() => {
    if (!sesion?.id) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const recargar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void cargar(true), 400);
    };
    const canal = supabase
      .channel(`mesa-cuenta-${sesion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_tickets', filter: `table_session_id=eq.${sesion.id}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_ticket_items', filter: `organization_id=eq.${sesion.organization_id}` }, recargar)
      .subscribe();
    return () => {
      if (espera) clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [sesion?.id, sesion?.organization_id, cargar]);

  // Sin conexión (S5): rondas en cola; al volver la red se envían solas.
  useEffect(() => {
    setEnLinea(typeof navigator === 'undefined' ? true : navigator.onLine);
    setCola(leerCola());
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Plano para «Mover» (D7).
  const { activas: reservasActivas } = useReservasMesas([], branchFilter);
  const cargarMesasPlano = useCallback(async () => {
    const mesas = await MesasService.obtenerMesasConSesiones();
    setMesasPlano(mesas.map((m) => vistaMesaPlano(m, reservasActivas.get(m.id))));
  }, [reservasActivas]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const conSesion = (accion: () => void) => {
    if (sesion) accion();
    else {
      pendienteAlAbrir.current = accion;
      setAbrir(true);
    }
  };

  const agregarLinea = async (producto: Product, modificadores: CartItemModifier[] | undefined, cantidad: number, extra?: { precio?: number; pesaje?: CartItem['pesaje'] }) => {
    if (!sesion) return null;
    try {
      const ids = await agregarProductoMesa(sesion.id, producto, modificadores, cantidad, extra as never);
      await cargar(true);
      toast.success(t('toast.agregado', { producto: producto.name }), { description: t('toast.agregadoDetalle', { mesa: mesaNombre }) });
      return ids[0] ?? null;
    } catch (error) {
      toast.error(
        error instanceof ProductoSinPrecioError
          ? t('toast.sinPrecio', { producto: producto.name })
          : t('toast.errorAgregar'),
      );
      return null;
    }
  };

  const pesar = usePesarConBascula<CartItemModifier>({
    agregar: ({ producto, precio, cantidad, pesaje, modifiers }) => agregarLinea(producto, modifiers, cantidad, { precio, pesaje }),
    deshacer: async (id) => {
      await PedidosService.eliminarItem(id);
      await cargar(true);
    },
    cambiar: async (id, cantidad) => {
      await PedidosService.actualizarCantidadItem(id, cantidad);
      await cargar(true);
    },
  });

  const alElegirProducto = (producto: Product, modificadores?: CartItemModifier[], cantidad = 1) =>
    conSesion(async () => {
      if (esMedido(producto)) {
        try {
          const base = await POSService.precioVigenteProducto(producto.id, producto.name);
          const extras = (modificadores ?? []).reduce((s, m) => s + (Number(m.extraPrice) || 0), 0);
          await pesar.abrirAgregar(producto, { modifiers: modificadores, precio: base + extras });
        } catch {
          toast.error(t('toast.sinPrecio', { producto: producto.name }));
        }
        return;
      }
      await agregarLinea(producto, modificadores, cantidad);
    });

  // La mesa se abrió en `AbrirMesaFlujo`: recarga y sigue con lo que la persona quería hacer.
  const alAbrirMesa = async () => {
    await cargar(true);
    const pendiente = pendienteAlAbrir.current;
    pendienteAlAbrir.current = null;
    pendiente?.();
  };

  const alElegirCliente = async (cliente?: Customer) => {
    if (!sesion) return;
    try {
      await asignarClienteMesa(sesion.id, sesion.sale_id, cliente?.id ?? null);
      await cargar(true);
      toast.success(cliente ? t('toast.cliente', { nombre: cliente.full_name ?? '' }) : t('toast.consumidorFinal'));
    } catch {
      toast.error(t('errores.cliente'));
    }
  };

  const alGuardarNota = async (nota: Parameters<typeof guardarNotaMesa>[1], comensales: number) => {
    if (!sesion) return;
    setGuardandoNota(true);
    try {
      await guardarNotaMesa(sesion.id, nota, comensales);
      setNotaAbierta(false);
      await cargar(true);
      toast.success(t('toast.notaGuardada'));
    } catch {
      toast.error(t('errores.nota'));
    } finally {
      setGuardandoNota(false);
    }
  };

  const alGuardarLinea = async (cambio: { comensal: number | null; notaCocina: string; alergia: boolean }) => {
    if (!editor) return;
    setGuardandoLinea(true);
    try {
      await guardarLineaMesa(
        editor.linea.id,
        editor.soloComensal ? { comensal: cambio.comensal } : { comensal: cambio.comensal, notaCocina: cambio.notaCocina, alergia: cambio.alergia },
      );
      setEditor(null);
      await cargar(true);
    } catch {
      toast.error(t('errores.linea'));
    } finally {
      setGuardandoLinea(false);
    }
  };

  const enviarRonda = async () => {
    if (!sesion || agrupada.porEnviar.length === 0) return;
    const roundKey = crypto.randomUUID();
    if (!enLinea) {
      const nueva = [...leerCola(), { sesionId: sesion.id, roundKey }];
      escribirCola(nueva);
      setCola(nueva);
      toast.warning(t('toast.rondaEnCola', { n: (agrupada.rondas[0]?.numero ?? 0) + 1 }), { description: t('toast.rondaEnColaDetalle') });
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarRondaMesa(sesion, roundKey);
      const impresion = await imprimirRondaMesa({
        sesionId: sesion.id,
        branchId: branch_id ?? null,
        mesa: mesaNombre,
        mesero: cuenta?.meseroNombre,
        organizacion: organization as unknown as Record<string, unknown>,
        sucursal,
        textos: {
          mesa: '',
          ajuste: (original) => tCocina('impreso.ajuste', { id: original ?? '' }),
          mas: (n) => tCocina('impreso.mas', { cantidad: n }),
          menos: (n) => tCocina('impreso.menos', { cantidad: n }),
          anular: tCocina('impreso.anular'),
          notaCambiada: tCocina('impreso.nota'),
          alergia: tCocina('impreso.alergia'),
        },
      }).catch(() => ({ impresas: 0, sinImpresora: false }));
      await cargar(true);
      const estaciones = r.estaciones
        .map((e) => t('toast.estacion', { estacion: t.has(`estaciones.${e.station || 'general'}`) ? t(`estaciones.${e.station || 'general'}`) : e.station, n: e.lineas }))
        .join(' · ');
      toast.success(t('toast.rondaEnviada', { n: r.ronda ?? '' }), {
        description: [estaciones, impresion.sinImpresora ? t('toast.sinImpresora') : impresion.impresas > 0 ? t('toast.impresa') : null]
          .filter(Boolean)
          .join(' · '),
      });
    } catch (error) {
      toast.error(t('errores.ronda'), { description: t.has(`errores.${codigoError(error)}`) ? t(`errores.${codigoError(error)}`) : undefined });
    } finally {
      setEnviando(false);
    }
  };

  // Al volver la red, las rondas en cola salen solas (idempotentes por su round_key).
  useEffect(() => {
    if (!enLinea || cola.length === 0 || !sesion) return;
    let vigente = true;
    (async () => {
      const restantes: RondaEnCola[] = [];
      for (const r of cola) {
        if (r.sesionId !== sesion.id) {
          restantes.push(r);
          continue;
        }
        try {
          await enviarRondaMesa(sesion, r.roundKey);
        } catch {
          restantes.push(r);
        }
      }
      if (!vigente) return;
      escribirCola(restantes);
      setCola(restantes);
      await cargar(true);
      toast.success(t('toast.colaEnviada'));
    })();
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea]);

  const alServido = async (linea: LineaMesa) => {
    try {
      await marcarServido([linea.id]);
      await cargar(true);
    } catch {
      toast.error(t('errores.servido'));
    }
  };

  const alCantidad = async (linea: LineaMesa, n: number) => {
    try {
      if (n <= 0) await PedidosService.eliminarItem(linea.id);
      else await PedidosService.actualizarCantidadItem(linea.id, n);
      await cargar(true);
    } catch {
      toast.error(t('errores.cantidad'));
    }
  };

  const alAnular = async (motivo: string) => {
    if (!anular) return;
    setAnulando(true);
    try {
      if (anular.restar && anular.linea.cantidad > 1) await PedidosService.actualizarCantidadItem(anular.linea.id, anular.linea.cantidad - 1, motivo);
      else await PedidosService.eliminarItem(anular.linea.id, motivo);
      setAnular(null);
      await cargar(true);
      toast.success(t('toast.ajusteEnviado'));
    } catch {
      toast.error(t('errores.anular'));
    } finally {
      setAnulando(false);
    }
  };

  const alModificadores = async (linea: LineaMesa) => {
    if (!linea.productoId) return;
    const producto = await POSService.getProductById(linea.productoId).catch(() => null);
    const padreId = (producto as unknown as { parent_product_id?: number | null } | null)?.parent_product_id;
    const padre = padreId ? await POSService.getProductById(padreId).catch(() => null) : producto;
    if (!padre) {
      toast.error(t('errores.modificadores'));
      return;
    }
    setModificar({ linea, producto: padre });
  };

  const alCambiarVariante = async (variante: { id: number; name?: string } & Partial<Product>, modificadores: CartItemModifier[], cantidad: number) => {
    if (!modificar || !sesion) return;
    const linea = modificar.linea;
    setModificar(null);
    try {
      await PedidosService.eliminarItem(linea.id);
      await agregarProductoMesa(sesion.id, { ...(modificar.producto as Product), ...(variante as Product) }, modificadores, cantidad, { comensal: linea.comensal });
      await cargar(true);
    } catch {
      toast.error(t('errores.modificadores'));
      await cargar(true);
    }
  };

  const alMover = async (destino: VistaMesaPlano, modoMover: ModoMover, lineaIds: string[]) => {
    if (!sesion) return;
    setMoviendo(true);
    try {
      await moverMesa(sesion.id, tableId, destino.id, modoMover, lineaIds);
      setMover(null);
      toast.success(t(`toast.movido.${modoMover}`, { mesa: destino.nombre, n: lineaIds.length }));
      if (modoMover === 'productos') await cargar(true);
      else router.push(`/app/pos/mesas/${destino.id}`);
    } catch (error) {
      toast.error(t('errores.mover'), { description: t.has(`errores.${codigoError(error)}`) ? t(`errores.${codigoError(error)}`) : undefined });
    } finally {
      setMoviendo(false);
    }
  };

  const alCambiarMesero = async (meseroId: string) => {
    if (!sesion) return;
    try {
      await MesasService.cambiarMesero(sesion.id, meseroId);
      setMeseroAbierto(false);
      await cargar(true);
    } catch {
      toast.error(t('errores.mesero'));
    }
  };

  const alPedirCuenta = async () => {
    if (!sesion) return;
    try {
      await MesasService.solicitarCuenta(sesion.id);
      await cargar(true);
      toast.success(t('toast.cuentaPedida', { mesa: mesaNombre }));
    } catch {
      toast.error(t('errores.error'));
    }
  };

  const imprimirPrecuenta = async (soloNavegador: boolean) => {
    if (!cuenta?.sesion) return;
    setImprimiendo(true);
    try {
      const items = (cuenta.sesion.sale_items ?? []).filter((i) => !i.paid_at) as SaleItem[];
      const destino = await imprimirPreCuentaMesa({
        branchId: branch_id ?? null,
        tableId,
        mesa: mesaNombre,
        mesero: cuenta.meseroNombre,
        items,
        subtotal: totales.subtotal,
        impuesto: totales.impuestos.reduce((s, i) => s + i.importe, 0),
        descuento: totales.descuento,
        total: totales.saldo,
        timezone,
        organizacion: organization as unknown as Record<string, unknown>,
        sucursal,
        soloNavegador,
      });
      toast.success(destino === 'impresora' ? t('toast.precuentaImpresa') : t('toast.precuentaNavegador'));
    } finally {
      setImprimiendo(false);
    }
  };

  // ── Cobro (D10, D8b, D11) ────────────────────────────────────────────────
  const sinCaja = requiereCaja && !caja;
  const estadoCobro: EstadoCobroMesa = sinCaja ? 'sinCaja' : agrupada.porEnviar.length + agrupada.rondas.length + agrupada.directas.length === 0 ? 'vacio' : 'listo';

  const abrirCobro = (parte: ParteCobro | null = null, propina: { porcentaje: number | null; valor: number } | null = null) => {
    if (sinCaja) {
      setAperturaCaja(true);
      return;
    }
    if (!sesion?.sale_id) {
      toast.error(t('errores.sinProductos'));
      return;
    }
    liberacionFallida.current = false;
    setCobro({ parte, propina });
  };

  const lineasSinPagarComoCarrito = (): CartItem[] =>
    (cuenta?.lineas ?? [])
      .filter((l) => !l.pagada && l.cantidad > 0)
      .map((l) => ({
        id: l.id,
        cart_id: sesion?.sale_id ?? '',
        product_id: l.productoId ?? 0,
        quantity: l.cantidad,
        unit_price: l.precioUnitario,
        total: l.total,
        tax_amount: l.impuesto,
        tax_rate: l.tasaImpuesto,
        tax_included: l.impuestoIncluido,
        discount_amount: l.descuento,
        created_at: l.creadaAt ?? '',
        updated_at: l.creadaAt ?? '',
        product: { id: l.productoId ?? 0, name: l.variante ? `${l.nombre} · ${l.variante}` : l.nombre, sku: '', status: 'active', organization_id: sesion?.organization_id ?? 0 } as unknown as Product,
      }));

  const carritoDelCobro = (): Cart | null => {
    if (!sesion?.sale_id || !cobro) return null;
    const branch = Number(branch_id ?? cuenta?.mesa.branchId ?? 0);
    const virtual = (importe: number, nombre: string): Cart => ({
      id: sesion.sale_id!,
      organization_id: sesion.organization_id,
      branch_id: branch,
      customer_id: cuenta?.cliente?.id,
      customer: cuenta?.cliente ?? undefined,
      items: [
        {
          id: `parte-${cobro.parte?.id ?? 'saldo'}`,
          cart_id: sesion.sale_id!,
          product_id: 0,
          quantity: 1,
          unit_price: importe,
          total: importe,
          tax_rate: 0,
          tax_amount: 0,
          tax_included: true,
          discount_amount: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          product: { id: 0, name: nombre, sku: 'MESA-PARTE', status: 'active', organization_id: sesion.organization_id } as unknown as Product,
        } as CartItem,
      ],
      tax_included: true,
      subtotal: importe,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: importe,
      status: 'active',
      created_at: sesion.opened_at,
      updated_at: sesion.opened_at,
    });
    // Una parte (por monto) o el saldo tras un abono: línea virtual por el importe.
    if (cobro.parte) return virtual(cobro.parte.importe, t('partes.lineaCobro', { parte: cobro.parte.comensal ? t('partes.comensal', { n: cobro.parte.comensal }) : t('partes.parte', { n: cobro.parte.nombre }), mesa: mesaNombre }));
    if (totales.abonado > 0) return virtual(totales.saldo, t('partes.saldo', { mesa: mesaNombre }));
    // La cuenta entera: cada plato conserva su tasa y si el impuesto va encima.
    // No se apaga la tasa ni se marca «incluido» solo porque hay impuesto.
    const items = prepararLineasCobroMesa(lineasSinPagarComoCarrito());
    return {
      id: sesion.sale_id,
      organization_id: sesion.organization_id,
      branch_id: branch,
      customer_id: cuenta?.cliente?.id,
      customer: cuenta?.cliente ?? undefined,
      status: 'active',
      items,
      total: totales.total,
      subtotal: totales.subtotal,
      tax_amount: totales.impuestos.reduce((s, i) => s + i.importe, 0),
      tax_total: totales.impuestos.reduce((s, i) => s + i.importe, 0),
      tax_included: carritoMesaConImpuestoIncluido(items),
      discount_amount: totales.descuento,
      discount_total: totales.descuento,
      created_at: sesion.opened_at,
      updated_at: sesion.opened_at,
    };
  };

  // El mismo cobro del POS (pos_checkout_v1 en modo settle) y, si el saldo queda en
  // 0, la mesa se libera y pasa a «Por limpiar» en el mismo paso (D11).
  const procesarPago = async (checkoutData: CheckoutData): Promise<Sale> => {
    if (!sesion?.sale_id) throw new Error('sin_venta');
    const porMonto = !!cobro?.parte || totales.abonado > 0;
    const idsDelCobro = new Set(checkoutData.cart.items.map((i) => String(i.id)));
    // Promociones de la cuenta: el servidor suma su uso solo si este cobro la salda.
    const promotionIds = await PedidosService.promocionesDeLaCuenta(sesion.sale_id).catch(() => [] as string[]);
    const settle: CobroVentaExistente = {
      sale_id: sesion.sale_id,
      table_session_id: sesion.id,
      ...(promotionIds.length > 0 ? { promotion_ids: promotionIds } : {}),
      ...(porMonto ? { lineas_sin_cobrar: lineasSinPagarComoCarrito().filter((i) => !idsDelCobro.has(String(i.id))) } : {}),
    };
    const venta = await POSService.checkout({ ...checkoutData, settle });
    // Saldo según el servidor (no un temporizador): solo con 0 se libera la mesa.
    let saldo = 0;
    try {
      const { data } = await supabase.rpc('fn_pos_mesa_saldo', { p_sale_id: sesion.sale_id });
      saldo = Number((data as { saldo?: number } | null)?.saldo ?? 0);
    } catch {
      saldo = cobro?.parte ? Math.max(0, totales.saldo - cobro.parte.importe) : 0;
    }
    if (cobro?.parte && partes) {
      const metodo = checkoutData.payments?.[0]?.method;
      const hora = formatTimeInTz(new Date(), timezone);
      const nuevas = partes.map((p) =>
        p.id === cobro.parte!.id
          ? { ...p, estado: 'pagada' as const, pagadaCon: t('partes.pagadoCon', { metodo: t.has(`metodos.${metodo}`) ? t(`metodos.${metodo}`) : metodo ?? '', hora }) }
          : p,
      );
      setPartes(nuevas);
    }
    if (saldo <= 0.5) {
      try {
        await MesasService.liberarMesa(tableId);
        await marcarEstadoMesa(tableId, 'cleaning').catch(() => false);
      } catch (error) {
        liberacionFallida.current = !(error instanceof LiberacionMesaError && error.codigo === 'saldo_pendiente');
      }
    }
    return venta;
  };

  const alTerminarCobro = async () => {
    const parte = cobro?.parte ?? null;
    setCobro(null);
    if (liberacionFallida.current) {
      // S8: cobrado, pero la mesa no se soltó. Nunca «Error al completar pago».
      toast.error(t('toast.cobradoSinLiberar', { mesa: mesaNombre }), {
        duration: 15000,
        action: { label: t('toast.reintentarLiberar'), onClick: () => setLiberar(true) },
      });
      await cargar(true);
      return;
    }
    const c = await cargarCuentaMesa(tableId).catch(() => null);
    if (!c?.sesion) {
      toast.success(t('toast.cobrada', { mesa: mesaNombre }), { description: t('toast.cobradaDetalle') });
      router.push('/app/pos/mesas');
      return;
    }
    setCuenta(c);
    if (parte) setPartesAbierto(true);
  };

  const alDividir = (lista: ParteMesa[], cobrarPrimera: boolean) => {
    const nuevas: ParteCobro[] = lista.map((p) => ({ ...p, estado: 'pendiente' }));
    setDividir(false);
    if (cobrarPrimera && nuevas[0]) {
      nuevas[0] = { ...nuevas[0], estado: 'cobrando' };
      setPartes(nuevas);
      abrirCobro(nuevas[0]);
    } else {
      setPartes(nuevas);
      setPartesAbierto(true);
    }
  };

  const alCobrarParte = (parte: ParteCobro) => {
    if (!partes) return;
    setPartes(partes.map((p) => (p.id === parte.id ? { ...p, estado: 'cobrando' } : p.estado === 'cobrando' ? { ...p, estado: 'pendiente' } : p)));
    setPartesAbierto(false);
    abrirCobro({ ...parte, estado: 'cobrando' });
  };

  // Partes de esta cuenta en la sesión del navegador (sobreviven a recargar la página).
  useEffect(() => {
    if (!sesion?.id) return;
    try {
      const v = sessionStorage.getItem(`mesa-partes-${sesion.id}`);
      if (v && !partes) setPartes(JSON.parse(v));
    } catch {
      /* nada guardado */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.id]);
  useEffect(() => {
    if (!sesion?.id) return;
    try {
      if (partes) sessionStorage.setItem(`mesa-partes-${sesion.id}`, JSON.stringify(partes));
      else sessionStorage.removeItem(`mesa-partes-${sesion.id}`);
    } catch {
      /* sin almacenamiento */
    }
  }, [partes, sesion?.id]);

  // ── Atajos (F8 enviar, F4 cobrar, F9 caja, P pre-cuenta) ─────────────────
  const dialogoAbierto = abrir || notaAbierta || !!editor || !!mover || dividir || partesAbierto || precuenta || !!cobro || liberar || !!anular || aperturaCaja || clienteAbierto;
  useAtajos(
    [
      { tecla: 'F8', descripcion: t('cuenta.enviar', { n: agrupada.porEnviar.length }), accion: () => void enviarRonda(), cuando: () => agrupada.porEnviar.length > 0 },
      { tecla: 'F4', descripcion: t('cuenta.cobrarMesa'), accion: () => abrirCobro(), cuando: () => !sinCaja },
      { tecla: 'F9', descripcion: t('cuenta.abrirCaja'), accion: () => setAperturaCaja(true), cuando: () => sinCaja },
      { tecla: 'P', descripcion: t('cuenta.precuenta'), accion: () => setPrecuenta(true), cuando: () => !!sesion },
    ],
    { activo: !dialogoAbierto },
  );

  // ── Composición ──────────────────────────────────────────────────────────
  const minutosAbierta = minutosDesde(sesion?.opened_at, ahora);
  const abandonada = !!sesion && mesaAbandonada(sesion.opened_at, cuenta?.ultimoMovimiento, ahora);
  const comensales = sesion?.customers || 1;
  const alergiasLineas = (cuenta?.lineas ?? [])
    .filter((l) => l.alergia && !l.pagada)
    .map((l) => (l.comensal ? `${l.notaCocina} (C${l.comensal})` : l.notaCocina ?? ''))
    .filter(Boolean);

  const menu = (
    <MenuMesa
      comensales={comensales}
      tamano={modo === 'escritorio' ? 'sm' : 'md'}
      deshabilitado={!sesion}
      onPrecuenta={() => setPrecuenta(true)}
      onPedirCuenta={() => void alPedirCuenta()}
      onDividir={() => setDividir(true)}
      onMover={() => {
        void cargarMesasPlano();
        setMover({ modo: 'cuenta', lineaId: null });
      }}
      onCambiarMesero={() => setMeseroAbierto(true)}
      onComensales={() => setNotaAbierta(true)}
      onNota={() => setNotaAbierta(true)}
      onHistorial={() => setHistorial(true)}
      onLiberar={() => setLiberar(true)}
    />
  );

  const masAcciones = (l: LineaMesa): AccionFila[] => [
    {
      id: 'mover',
      etiqueta: t('linea.moverA'),
      icono: ShoppingCart,
      onSelect: () => {
        void cargarMesasPlano();
        setMover({ modo: 'productos', lineaId: l.id });
      },
    },
    ...(!l.porEnviar && l.cantidad > 1 && l.estado !== 'cancelada'
      ? [{ id: 'restar', etiqueta: t('linea.restarUna'), icono: X, onSelect: () => setAnular({ linea: l, restar: true }) }]
      : []),
  ];

  const panel = (
    <div className="relative h-full">
      {/* Ancla de los paneles laterales (nota de la línea, T3). */}
      <EditorLineaMesa
        abierto={!!editor}
        onAbiertoChange={(v) => !v && setEditor(null)}
        ancla={<span className="pointer-events-none absolute left-0 top-36 size-0" aria-hidden="true" />}
        linea={editor?.linea ?? null}
        comensales={comensales}
        notasRapidas={notasRapidas}
        soloComensal={editor?.soloComensal}
        alergiasMesa={cuenta?.nota.alergias ?? []}
        guardando={guardandoLinea}
        onGuardar={(c) => void alGuardarLinea(c)}
      />
      <PanelCuentaMesa
        pagadoEnLinea={totalPagadoEnLinea(cartaQr.pagos)}
        cartaQr={
          solicitudesDeLaMesa.length > 0 || cartaQr.pagos.length > 0 || cartaQr.intentos.length > 0 || cartaQr.valoraciones.length > 0 ? (
            <CartaQrEnLaCuenta
              mesaNombre={mesaNombre}
              solicitudes={solicitudesDeLaMesa}
              pagos={cartaQr.pagos}
              intentos={cartaQr.intentos}
              valoraciones={cartaQr.valoraciones}
              formatear={formatear}
              ahora={ahora}
              enCurso={solicitudesQr.enCurso}
              onAtender={(s, e) => void solicitudesQr.atender(s, e).catch(() => toast.error(tq('solicitudes.errorAtender')))}
            />
          ) : undefined
        }
        mesaNombre={mesaNombre}
        cuenta={agrupada}
        totales={totales}
        formatear={formatear}
        nombreImpuesto={nombreImpuesto}
        ahora={ahora}
        menu={menu}
        cliente={
          <CustomerSelector
            selectedCustomer={cuenta?.cliente ?? undefined}
            onCustomerSelect={(c) => void alElegirCliente(c)}
            open={clienteAbierto}
            onOpenChange={setClienteAbierto}
            atajo="F2"
            disparador={<FilaClienteMesa nombre={cuenta?.cliente?.full_name ?? null} disabled={!sesion} />}
          />
        }
        nota={
          <NotaMesaPanel
            abierto={notaAbierta}
            onAbiertoChange={setNotaAbierta}
            ancla={<FilaNotaMesa nota={cuenta?.nota ?? { alergias: [], instrucciones: '', ritmo: 'junto', notaCliente: '' }} comensales={comensales} alergiasLineas={alergiasLineas} onClick={() => setNotaAbierta(true)} />}
            mesaNombre={mesaNombre}
            nota={cuenta?.nota ?? { alergias: [], instrucciones: '', ritmo: 'junto', notaCliente: '' }}
            comensales={comensales}
            capacidad={cuenta?.mesa.capacidad ?? 4}
            avisoLineas={alergiasLineas.length > 0 ? t('nota.avisoAlergiaLineas', { alergias: alergiasLineas.join(', ') }) : null}
            guardando={guardandoNota}
            onGuardar={(n, c) => void alGuardarNota(n, c)}
          />
        }
        acciones={{
          onCantidad: (l, n) => void alCantidad(l, n),
          onNota: (l) => setEditor({ linea: l, soloComensal: !l.porEnviar }),
          onModificadores: (l) => void alModificadores(l),
          onComensal: (l) => setEditor({ linea: l, soloComensal: !l.porEnviar }),
          onQuitar: (l) => void alCantidad(l, 0),
          onServido: (l) => void alServido(l),
          onAnular: (l) => setAnular({ linea: l, restar: false }),
          masAcciones,
        }}
        onPrecuenta={() => setPrecuenta(true)}
        onDividir={() => setDividir(true)}
        onEnviar={() => void enviarRonda()}
        enviando={enviando}
        onCobrar={() => abrirCobro()}
        estadoCobro={estadoCobro}
        onAbrirCaja={() => setAperturaCaja(true)}
        deshabilitada={!sesion}
      />
    </div>
  );

  const aviso = !enLinea || cola.length > 0 ? (
    <AvisoTonal
      tono="neutro"
      icono={WifiOff}
      titulo={t('avisos.sinConexion', { n: cola.length })}
      descripcion={t('avisos.sinConexionDetalle')}
      compacto
    />
  ) : sinCaja ? (
    <AvisoTonal
      tono="advertencia"
      titulo={t('avisos.sinCaja')}
      descripcion={t('avisos.sinCajaDetalle')}
      accion={{ etiqueta: t('avisos.abrirCaja'), onClick: () => setAperturaCaja(true) }}
      compacto
    />
  ) : abandonada ? (
    <AvisoTonal
      tono="advertencia"
      titulo={t('avisos.abandonada', { tiempo: textoDuracion(minutosAbierta) })}
      descripcion={t('avisos.abandonadaDetalle', { saldo: formatear(totales.saldo), n: agrupada.enCocina })}
      accion={{ etiqueta: t('avisos.resolver'), onClick: () => setLiberar(true) }}
      compacto
    />
  ) : null;

  const pestanaMesa = (
    <div className="flex items-center rounded-md border border-line-brand bg-surface text-brand-deep shadow-sm">
      <span role="tab" aria-selected="true" className="flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium">
        <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {mesaNombre}
        <span className={cn(clasesBadgeTono('marca', 'suave', 'sm'), 'tabular-nums')}>{formatear(totales.saldo)}</span>
        <span className={cn(clasesBadgeTono('neutro', 'suave', 'sm'), 'min-w-5 justify-center tabular-nums')}>{agrupada.porEnviar.length + agrupada.rondas.reduce((s, r) => s + r.lineas.length, 0)}</span>
      </span>
      <button type="button" aria-label={t('volverPlano')} title={t('volverPlano')} onClick={() => router.push('/app/pos/mesas')} className="mr-1 flex size-6 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg">
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );

  // Título y estado de la mesa: los mismos en la cabecera de tableta y en el
  // MobileHeader del celular (Figma M2b).
  const tituloMesa = cuenta?.mesa.zona ? t('cabecera.mesaZona', { mesa: mesaNombre, zona: cuenta.mesa.zona }) : mesaNombre;
  const estadoMesa =
    sesion?.status === 'bill_requested'
      ? { texto: t('estados.porCobrar'), tono: 'advertencia' as const }
      : sesion
        ? { texto: t('estados.ocupada'), tono: 'marca' as const }
        : { texto: t('estados.libre'), tono: 'neutro' as const };

  const catalogo = <ProductSearch onProductSelect={(p, m, c) => alElegirProducto(p, m, c)} bloqueado={!!cobro} />;

  return (
    <div className="h-full">
      <CabeceraMovilMesa titulo={tituloMesa} estado={estadoMesa} />
      <PantallaMesa
        modo={modo}
        estado={estado}
        mesaNombre={mesaNombre}
        cabeceraPos={
          <CabeceraPos
            organizacionNombre={organization?.name}
            cajaAbierta={!!caja}
            cierreBloqueado={false}
            onCaja={() => setAperturaCaja(true)}
            carritosActivos={carts.filter((c) => c.status === 'active').length}
            carritosEnEspera={carts.filter((c) => c.status === 'hold').length}
          />
        }
        pestanas={
          <CartTabs
            carts={carts}
            activeCartId=""
            onCartSelect={(id) => router.push(`/app/pos?carrito=${encodeURIComponent(id)}`)}
            onNewCart={() => router.push('/app/pos')}
            onRemoveCart={async (id) => {
              await POSService.removeCart(id).catch(() => undefined);
              cargarCarritos();
            }}
            atajosActivos={!dialogoAbierto}
            pestanaFija={pestanaMesa}
          />
        }
        cabeceraMesa={
          <CabeceraMesa
            mesa={mesaNombre}
            zona={cuenta?.mesa.zona ?? null}
            estado={estadoMesa.texto}
            tonoEstado={estadoMesa.tono}
            minutos={minutosAbierta}
            critico={abandonada}
            mesero={cuenta?.meseroNombre ?? null}
            comensales={comensales}
            onVolver={() => router.push('/app/pos/mesas')}
            onPrecuenta={sesion ? () => setPrecuenta(true) : undefined}
            menu={menu}
          />
        }
        aviso={aviso}
        catalogo={catalogo}
        panel={modo === 'movil' ? null : panel}
        barraMovil={
          modo === 'movil' ? (
            <>
              <KbdButton variante="primario" tamano="lg" anchoCompleto onClick={() => setHojaMovil(true)}>
                {t('verCuenta', { total: formatear(totales.saldo) })}
              </KbdButton>
              <Sheet open={hojaMovil} onOpenChange={setHojaMovil}>
                <SheetContent side="bottom" hideCloseButton className="flex h-[92dvh] flex-col gap-2 rounded-t-2xl border-line bg-canvas p-3">
                  <SheetTitle className="sr-only">{t('cuenta.titulo', { mesa: mesaNombre })}</SheetTitle>
                  <SheetDescription className="sr-only">{t('cuenta.titulo', { mesa: mesaNombre })}</SheetDescription>
                  {panel}
                </SheetContent>
              </Sheet>
            </>
          ) : null
        }
        onReintentar={() => void cargar()}
        onVolver={() => router.push('/app/pos/mesas')}
      />

      {pesar.dialogo}

      <AbrirMesaFlujo
        abierto={abrir}
        onAbiertoChange={(v) => {
          setAbrir(v);
          if (!v) pendienteAlAbrir.current = null;
        }}
        mesa={cuenta ? { id: tableId, nombre: mesaNombre, zona: cuenta.mesa.zona ?? null, capacidad: cuenta.mesa.capacidad ?? 4 } : null}
        reserva={reservasActivas.get(tableId)}
        tableta={modo !== 'escritorio'}
        onAbierta={() => void alAbrirMesa()}
      />

      {cuenta && (
        <MoverMesaDialog
          abierto={!!mover}
          onAbiertoChange={(v) => !v && setMover(null)}
          mesaNombre={mesaNombre}
          zona={cuenta.mesa.zona}
          mesaId={tableId}
          lineas={cuenta.lineas}
          mesas={mesasPlano}
          formatear={formatear}
          moviendo={moviendo}
          modoInicial={mover?.modo}
          lineaInicial={mover?.lineaId}
          onMover={(d, m, ids) => void alMover(d, m, ids)}
        />
      )}

      <DividirCuentaDialog
        abierto={dividir}
        onAbiertoChange={setDividir}
        mesaNombre={mesaNombre}
        lineas={cuenta?.lineas ?? []}
        comensales={comensales}
        formatear={formatear}
        decimales={decimales}
        tableta={modo !== 'escritorio'}
        onCobrarPrimera={(p) => alDividir(p, true)}
        onDividir={(p) => alDividir(p, false)}
      />

      {partes && (
        <CobrarPartesDialog
          abierto={partesAbierto}
          onAbiertoChange={setPartesAbierto}
          mesaNombre={mesaNombre}
          partes={partes}
          comensales={comensales}
          formatear={formatear}
          saldoServidor={totales.saldo}
          onCobrar={alCobrarParte}
          onUnir={() => setPartes(unirPendientes(partes, t('partes.unidas')))}
          onVolver={() => setPartesAbierto(false)}
        />
      )}

      <PreCuentaMesaDialog
        abierto={precuenta}
        onAbiertoChange={setPrecuenta}
        mesaNombre={mesaNombre}
        comensales={comensales}
        lineas={cuenta?.lineas ?? []}
        totales={totales}
        formatear={formatear}
        nombreImpuesto={nombreImpuesto}
        imprimiendo={imprimiendo}
        onImprimir={() => void imprimirPrecuenta(true)}
        sinCaja={sinCaja}
        onCobrar={(propina) => {
          setPrecuenta(false);
          abrirCobro(null, propina);
        }}
      />

      {cobro && (() => {
        const cart = carritoDelCobro();
        if (!cart) return null;
        return (
          <CheckoutDialog
            key={`${cart.id}-${cobro.parte?.id ?? 'todo'}`}
            cart={cart}
            open
            onOpenChange={(v) => {
              if (!v) {
                setCobro(null);
                if (cobro.parte && partes) setPartes(partes.map((p) => (p.estado === 'cobrando' ? { ...p, estado: 'pendiente' } : p)));
              }
            }}
            onCheckoutComplete={() => void alTerminarCobro()}
            onProcessPayment={procesarPago}
            organization={organization ? { name: organization.name } : undefined}
            branch={sucursal ? { name: sucursal.name, address: sucursal.address, phone: sucursal.phone } : undefined}
            contextoMesa={{
              titulo: cuenta?.mesa.zona ? t('cobro.tituloZona', { mesa: mesaNombre, zona: cuenta.mesa.zona }) : t('cobro.titulo', { mesa: mesaNombre }),
              meseroId: sesion?.server_id ?? null,
              propinaPorcentaje: cobro.propina?.porcentaje ?? null,
              propinaValor: cobro.propina?.valor ?? null,
              postVenta: cobro.parte
                ? { titulo: t('cobro.parteCobrada'), descripcion: t('cobro.parteCobradaDetalle'), primaria: t('cobro.volverPartes') }
                : { titulo: t('cobro.cobrada', { mesa: mesaNombre }), descripcion: t('cobro.cobradaDetalle'), primaria: t('cobro.volverPlano') },
            }}
          />
        );
      })()}

      <LiberarMesaDialog
        abierto={liberar}
        onAbiertoChange={setLiberar}
        tableId={tableId}
        mesaNombre={mesaNombre}
        cajaAbierta={!sinCaja}
        onCobrar={() => abrirCobro()}
        onLiberada={async () => {
          await marcarEstadoMesa(tableId, 'cleaning').catch(() => false);
          toast.success(t('toast.liberada', { mesa: mesaNombre }));
          router.push('/app/pos/mesas');
        }}
      />

      <SessionTimelineDialog open={historial} onOpenChange={setHistorial} tableId={tableId} />

      <DialogoMotivo
        abierto={!!anular}
        onAbiertoChange={(v) => !v && setAnular(null)}
        titulo={anular?.restar ? t('anular.tituloRestar', { producto: anular.linea.nombre }) : t('anular.titulo', { producto: anular?.linea.nombre ?? '' })}
        descripcion={t('anular.descripcion')}
        textoConfirmar={anular?.restar ? t('anular.confirmarRestar') : t('anular.confirmar')}
        onConfirmar={(m) => alAnular(m)}
        cargando={anulando}
        minimo={3}
      />

      {modificar && (
        <VariantSelectorDialog
          open
          onOpenChange={(v) => !v && setModificar(null)}
          product={{ id: modificar.producto.id, name: modificar.producto.name, sku: modificar.producto.sku, price: modificar.producto.price ?? null }}
          onSelectVariant={(v, m, c) => void alCambiarVariante(v as never, m as unknown as CartItemModifier[], c)}
          sucursal={{ filtro: branchFilter }}
          conCantidad
          cantidadInicial={modificar.linea.cantidad}
        />
      )}

      <MeseroDialog
        abierto={meseroAbierto}
        onAbiertoChange={setMeseroAbierto}
        meseros={meseros}
        actual={sesion?.server_id ?? null}
        usuarioId={usuarioId}
        onGuardar={(id) => void alCambiarMesero(id)}
      />

      {!caja && (
        <AperturaCajaDialog
          open={aperturaCaja}
          onOpenChange={setAperturaCaja}
          onSessionOpened={(s) => {
            setCaja(s);
            setAperturaCaja(false);
          }}
        />
      )}
    </div>
  );
}

/** «Cambiar mesero» (T5): los miembros activos de la organización. */
function MeseroDialog({
  abierto,
  onAbiertoChange,
  meseros,
  actual,
  usuarioId,
  onGuardar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  meseros: OpcionMesero[];
  actual: string | null;
  usuarioId: string | null;
  onGuardar: (id: string) => void;
}) {
  const t = useTranslations('posMesasFlujo.mesero');
  const [elegido, setElegido] = useState<string | null>(actual);
  useEffect(() => {
    if (abierto) setElegido(actual);
  }, [abierto, actual]);
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      ancho={440}
      primario={{ etiqueta: t('guardar'), onClick: () => elegido && onGuardar(elegido), deshabilitada: !elegido }}
    >
      <Select value={elegido ?? ''} onValueChange={setElegido}>
        <SelectTrigger aria-label={t('titulo')} className="h-10 border-line-strong bg-surface">
          <SelectValue placeholder={t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {meseros.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.id === usuarioId ? t('tu', { nombre: m.nombre }) : m.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Dialogo>
  );
}
