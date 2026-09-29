'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ClipboardCheck, Plus, Save, ScanBarcode, Search, Trash2, X } from 'lucide-react';
import {
  CampoNumero,
  Dialogo,
  EmptyState,
  FormField,
  FormSection,
  PageHeader,
  SegmentedControl,
  BranchBadgeActiva,
} from '@/components/kit';
import { AgregarProductosDialog } from '@/components/kit/documento';
import type { ProductoDocumento } from '@/components/kit/documento/edicionDocumentoLogica';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { formatInstantWithOffset, plainDateToInstant } from '@/lib/utils/dateCore';
import {
  adjustmentService,
  ErrorAjuste,
  RAZON_POR_MODO,
  RAZONES_AJUSTE,
  type ModoAjuste,
  type ProductoParaAjuste,
} from '@/lib/services/adjustmentService';
import { cn } from '@/utils/Utils';
import {
  aBorrador,
  agregarLinea,
  calcularLinea,
  cambiarLote,
  cantidadDeProductoAjuste,
  enteroPositivo,
  lineasDesdeDetalle,
  modoDesdeUrl,
  nuevaClaveAplicar,
  resumirLineas,
  rutaAjuste,
  RUTA_AJUSTES,
  validarAjuste,
  type ErrorLinea,
  type LineaAjuste,
} from './logica';
import { CifraDiferencia, useEtiquetaRazon, useFormatoCantidad, useMensajeErrorAjuste } from './piezas';

const MODOS: readonly ModoAjuste[] = ['entrada', 'salida', 'conteo'];

/** «YYYY-MM-DDTHH:mm» en la zona de la organización (para `<input type="datetime-local">`). */
function horaLocal(instante: Date, zona: string): string {
  return formatInstantWithOffset(instante, zona).slice(0, 16);
}

/**
 * Nuevo ajuste y editar borrador (Figma 586:312944 escritorio; 975:186644 móvil
 * con escáner y Entrada · Salida · Conteo). «Guardar borrador» no mueve
 * existencias (`fn_ajuste_guardar`); «Guardar y aplicar» guarda y aplica en el
 * servidor en una transacción (`fn_ajuste_aplicar`, con clave de idempotencia).
 *
 * Lee `?producto_id`, `?modo` (o el `?type=entrada|salida` de los enlaces que
 * ya existían), `?branchId` y `?desde=<id>` («Duplicar como nuevo conteo»).
 */
export function FormularioAjuste({ ajusteId }: { ajusteId?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('inventarioAjustes.formulario');
  const tc = useTranslations('inventarioAjustes');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const etiquetaRazon = useEtiquetaRazon();
  const mensajeError = useMensajeErrorAjuste();
  const moneda = useMonedaOrganizacion();
  const { timezone } = useFormatDate();
  const { branches, branchFilter, selectedBranchId, isLoading: cargandoSucursales } = useBranch();
  const permisos = usePermisosInventario();

  const editando = ajusteId !== undefined;
  const desdeId = enteroPositivo(params?.get('desde'));
  const productoInicial = enteroPositivo(params?.get('producto_id'));
  const sucursalUrl = enteroPositivo(params?.get('branchId'));

  const [idGuardado, setIdGuardado] = useState<number | null>(ajusteId ?? null);
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoAjuste>(() => modoDesdeUrl(params?.get('modo'), params?.get('type')));
  const [razon, setRazon] = useState<string>(() => RAZON_POR_MODO[modoDesdeUrl(params?.get('modo'), params?.get('type'))]);
  const [fechaLocal, setFechaLocal] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaAjuste[]>([]);
  const [cargando, setCargando] = useState(true);
  const [estadoCarga, setEstadoCarga] = useState<'ok' | 'error' | 'cerrado' | 'noEncontrado'>('ok');
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState<'borrador' | 'aplicar' | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null);
  const [intentoAplicar, setIntentoAplicar] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [sucio, setSucio] = useState(false);
  const clave = useRef<string | null>(null);
  const porId = useRef(new Map<number, ProductoParaAjuste>());

  const org = getOrganizationId();

  // ── Carga inicial ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cargandoSucursales) return;
    let vivo = true;
    const iniciar = async () => {
      setCargando(true);
      try {
        const fuente = editando ? ajusteId : desdeId;
        if (fuente !== null && fuente !== undefined) {
          const d = await adjustmentService.detalle(org, fuente);
          if (editando && d.ajuste.estado !== 'draft') {
            if (vivo) setEstadoCarga('cerrado');
            return;
          }
          const suc = editando ? d.ajuste.sucursal.id : (sucursalUrl ?? d.ajuste.sucursal.id);
          const productos = await adjustmentService.productos(org, suc, { ids: d.renglones.map((r) => r.producto.id) });
          productos.forEach((p) => porId.current.set(p.id, p));
          if (!vivo) return;
          setSucursal(suc);
          setModo(editando ? d.ajuste.modo : 'conteo');
          setRazon(editando ? d.ajuste.razon : RAZON_POR_MODO.conteo);
          setNotas(editando ? (d.ajuste.notas ?? '') : '');
          setFechaLocal(horaLocal(editando ? new Date(d.ajuste.fecha) : new Date(), timezone));
          setLineas(lineasDesdeDetalle(d, productos, !editando));
        } else {
          const suc = sucursalUrl ?? branchFilter ?? selectedBranchId ?? branches[0]?.id ?? null;
          setSucursal(suc);
          setFechaLocal(horaLocal(new Date(), timezone));
          if (suc && productoInicial) {
            const [p] = await adjustmentService.productos(org, suc, { ids: [productoInicial] });
            if (p && vivo) {
              porId.current.set(p.id, p);
              setLineas((ls) => agregarLinea(ls, p).lineas);
            }
          }
        }
        if (vivo) setEstadoCarga('ok');
      } catch (e) {
        if (!vivo) return;
        if (e instanceof ErrorAjuste && e.noEncontrado) setEstadoCarga('noEncontrado');
        else {
          console.error('Error preparando el ajuste:', e);
          setEstadoCarga('error');
        }
      } finally {
        if (vivo) setCargando(false);
      }
    };
    void iniciar();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, [cargandoSucursales, ajusteId, desdeId]);

  // Cambiar de sucursal vuelve a leer la existencia de los renglones.
  const cambiarSucursal = async (nueva: number) => {
    setSucursal(nueva);
    setSucio(true);
    const ids = lineas.map((l) => l.producto.id);
    if (ids.length === 0) return;
    try {
      const productos = await adjustmentService.productos(org, nueva, { ids });
      const mapa = new Map(productos.map((p) => [p.id, p]));
      productos.forEach((p) => porId.current.set(p.id, p));
      setLineas((ls) =>
        ls
          .filter((l) => mapa.has(l.producto.id))
          .map((l) => ({ ...l, producto: mapa.get(l.producto.id)!, lot_id: null, clave: `${l.producto.id}:-`, seriales: [], sistemaGuardado: null }))
          .filter((l, i, arr) => arr.findIndex((x) => x.clave === l.clave) === i),
      );
    } catch (e) {
      toast({ variant: 'destructive', title: mensajeError(e) });
    }
  };

  // Aviso del navegador al salir con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  // ── Buscar y agregar productos (kit/documento: el mismo diálogo de compras y ventas) ──
  const nombreSucursal = branches.find((b) => b.id === sucursal)?.name ?? '';
  const buscar = useCallback(
    async (texto: string, _f: unknown, senal: AbortSignal): Promise<ProductoDocumento[]> => {
      if (!sucursal) return [];
      const productos = await adjustmentService.productos(org, sucursal, { texto, limite: 30 }, senal);
      productos.forEach((p) => porId.current.set(p.id, p));
      return productos.map((p) => {
        const cant = cantidadDeProductoAjuste(p);
        return {
          id: p.id,
          nombre: p.nombre,
          sku: p.sku,
          codigoBarras: p.codigo_barras,
          precio: p.existencias.find((e) => e.lot_id === null)?.costo_promedio ?? p.costo_vigente ?? 0,
          stock: p.existencias.reduce((s, e) => s + e.cantidad, 0),
          controlaStock: true,
          serial: p.controla_serial,
          lotes: p.existencias.filter((e) => e.lot_id !== null && e.cantidad > 0).length || null,
          // «12,400 kg» y «/ kg» en el diálogo para productos por peso o medida.
          unidadVenta: cant.unidad,
          decimalesCantidad: cant.unidad ? cant.decimales : null,
        };
      });
    },
    [org, sucursal],
  );

  const alAgregar = (p: ProductoDocumento) => {
    const producto = porId.current.get(p.id);
    if (!producto) return;
    setSucio(true);
    setLineas((ls) => {
      const r = agregarLinea(ls, producto);
      if (r.yaEstaba) toast({ title: t('yaEsta', { nombre: producto.nombre }) });
      return r.lineas;
    });
    // Foco en la cantidad del renglón nuevo.
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-cantidad-ajuste]');
      inputs[inputs.length - 1]?.focus();
    }, 50);
  };

  const actualizar = (claveLinea: string, cambio: Partial<LineaAjuste>) => {
    setSucio(true);
    setLineas((ls) => ls.map((l) => (l.clave === claveLinea ? { ...l, ...cambio } : l)));
  };
  const quitar = (claveLinea: string) => {
    setSucio(true);
    setLineas((ls) => ls.filter((l) => l.clave !== claveLinea));
  };

  // ── Cálculos y validación ───────────────────────────────────────────────
  const resumen = useMemo(() => resumirLineas(modo, lineas), [modo, lineas]);
  const validacionGuardar = validarAjuste({ sucursal, razon, fechaLocal, modo, lineas }, false);
  const validacionAplicar = validarAjuste({ sucursal, razon, fechaLocal, modo, lineas }, true);
  const errores = intentoAplicar ? validacionAplicar : intentoGuardar ? validacionGuardar : null;
  const errorDe = (clave: string): ErrorLinea | undefined => errores?.lineas[clave];

  const contadoEn = (): string | null => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaLocal)) return null;
    return plainDateToInstant(fechaLocal.slice(0, 10), timezone, fechaLocal.slice(11, 16));
  };

  const guardarBorrador = async (): Promise<number | null> => {
    if (!sucursal) return null;
    const r = await adjustmentService.guardar(
      org,
      aBorrador({ id: idGuardado, sucursal, modo, razon, notas, contadoEn: contadoEn(), lineas }),
    );
    setIdGuardado(r.id);
    setSucio(false);
    return r.id;
  };

  const alGuardarBorrador = async () => {
    setIntentoGuardar(true);
    setIntentoAplicar(false);
    if (!validacionGuardar.valido) {
      toast({ variant: 'destructive', title: t('revisa') });
      return;
    }
    setGuardando('borrador');
    try {
      const id = await guardarBorrador();
      toast({ title: t('borradorGuardado') });
      if (id) router.push(rutaAjuste(id));
    } catch (e) {
      toast({ variant: 'destructive', title: mensajeError(e) });
    } finally {
      setGuardando(null);
    }
  };

  const alPedirAplicar = () => {
    setIntentoAplicar(true);
    if (!validacionAplicar.valido) {
      toast({ variant: 'destructive', title: t('revisa') });
      return;
    }
    clave.current = null;
    setErrorAplicar(null);
    setConfirmar(true);
  };

  const alAplicar = async () => {
    setGuardando('aplicar');
    setErrorAplicar(null);
    try {
      const id = await guardarBorrador();
      if (!id) return;
      // La clave se fija al primer intento: si la red corta y se reintenta, no se aplica dos veces.
      if (!clave.current) clave.current = nuevaClaveAplicar(id);
      const r = await adjustmentService.aplicar(org, id, clave.current);
      setConfirmar(false);
      toast({ title: tc('acciones.aplicar.listo', { codigo: r.code, count: r.movimientos }) });
      if (r.recalculados.length > 0) {
        toast({
          title: tc('acciones.aplicar.recalculadoTitulo', { codigo: r.code }),
          description: tc('acciones.aplicar.recalculadoDescripcion', { count: r.recalculados.length }),
        });
      }
      router.push(rutaAjuste(id));
    } catch (e) {
      // El borrador queda guardado: el siguiente intento lo actualiza, no crea otro.
      setErrorAplicar(mensajeError(e));
    } finally {
      setGuardando(null);
    }
  };

  // ── Estados de la pantalla ──────────────────────────────────────────────
  const titulo = editando ? t('tituloEditar') : t('titulo');
  const volverA = editando && ajusteId ? rutaAjuste(ajusteId) : RUTA_AJUSTES;
  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('listado.titulo'), href: RUTA_AJUSTES },
    { etiqueta: editando ? t('migaEditar') : t('migaNuevo') },
  ];

  if (permisos.resueltos && !permisos.ajustar) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={titulo} icono={ClipboardCheck} variante="form" migas={migas} volverA={volverA} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('volver'), href: RUTA_AJUSTES }} />
      </div>
    );
  }
  if (!cargandoSucursales && branches.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={titulo} icono={ClipboardCheck} variante="form" migas={migas} volverA={volverA} />
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }
  if (estadoCarga !== 'ok') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={titulo} icono={ClipboardCheck} variante="form" migas={migas} volverA={volverA} />
        {estadoCarga === 'cerrado' ? (
          <EmptyState
            titulo={t('cerrado.titulo')}
            descripcion={t('cerrado.descripcion')}
            icono={ClipboardCheck}
            accion={{ etiqueta: t('cerrado.verAjuste'), href: ajusteId ? rutaAjuste(ajusteId) : RUTA_AJUSTES }}
          />
        ) : estadoCarga === 'noEncontrado' ? (
          <EmptyState titulo={t('noEncontrado')} icono={ClipboardCheck} accion={{ etiqueta: t('volver'), href: RUTA_AJUSTES }} />
        ) : (
          <EmptyState variante="error" titulo={t('errorCarga')} onReintentar={() => router.refresh()} />
        )}
      </div>
    );
  }

  const opcionesModo = MODOS.map((m) => ({ valor: m, etiqueta: t(`modos.${m}`) }));
  const etiquetaCantidad = modo === 'conteo' ? t('columnas.contado') : modo === 'entrada' ? t('columnas.entra') : t('columnas.sale');
  const importe = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${moneda.formatear(Math.abs(n))}`);

  const accionesCabecera = (
    <>
      <Button variant="ghost" className="h-10" onClick={() => router.push(volverA)} disabled={guardando !== null}>
        {t('cancelar')}
      </Button>
      <Button variant="outline" className="h-10 gap-2" onClick={() => void alGuardarBorrador()} disabled={guardando !== null || cargando}>
        <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('guardarBorrador')}
      </Button>
      <Button className="h-10 gap-2" onClick={alPedirAplicar} disabled={guardando !== null || cargando}>
        <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {t('guardarYAplicar')}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={titulo}
        subtitulo={t('subtitulo')}
        icono={ClipboardCheck}
        variante="form"
        migas={migas}
        volverA={volverA}
        debajo={<BranchBadgeActiva />}
        acciones={accionesCabecera}
        movil={{ titulo: editando ? t('tituloEditarMovil') : t('tituloMovil'), subtitulo: nombreSucursal || undefined }}
      />

      {/* ── Datos del ajuste ─────────────────────────────────────────── */}
      <FormSection titulo={t('datos.titulo')} columnas={3}>
        <FormField etiqueta={t('datos.sucursal')} obligatorio ayuda={t('datos.sucursalAyuda')} error={errores?.cabecera.includes('sucursal') ? t('errores.sucursal') : null}>
          {(c) => (
            <Select value={sucursal ? String(sucursal) : ''} onValueChange={(v) => void cambiarSucursal(Number(v))} disabled={cargando}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('datos.elegirSucursal')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('datos.razon')} obligatorio error={errores?.cabecera.includes('razon') ? t('errores.razon') : null}>
          {(c) => (
            <Select
              value={razon}
              onValueChange={(v) => {
                setRazon(v);
                setSucio(true);
              }}
            >
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RAZONES_AJUSTE.map((r) => (
                  <SelectItem key={r} value={r}>
                    {etiquetaRazon(r)}
                  </SelectItem>
                ))}
                {!(RAZONES_AJUSTE as readonly string[]).includes(razon) && razon && <SelectItem value={razon}>{razon}</SelectItem>}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField
          etiqueta={modo === 'conteo' ? t('datos.fechaConteo') : t('datos.fecha')}
          obligatorio
          ayuda={t('datos.fechaAyuda', { zona: timezone })}
          error={errores?.cabecera.includes('fecha') ? t('errores.fecha') : null}
        >
          <Input
            type="datetime-local"
            value={fechaLocal}
            max={horaLocal(new Date(), timezone)}
            onChange={(e) => {
              setFechaLocal(e.target.value);
              setSucio(true);
            }}
            className="h-10 border-line-strong bg-surface"
          />
        </FormField>
        <FormField etiqueta={t('datos.modo')} ayuda={t(`ayudaModo.${modo}`)} className="sm:col-span-2 lg:col-span-3">
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              aria-describedby={c['aria-describedby']}
              opciones={opcionesModo}
              valor={modo}
              onValorChange={(v) => {
                setModo(v);
                // La razón por defecto sigue al modo mientras el usuario no haya elegido otra.
                if (razon === RAZON_POR_MODO[modo]) setRazon(RAZON_POR_MODO[v]);
                setSucio(true);
              }}
              anchoCompleto
            />
          )}
        </FormField>
        <FormField etiqueta={t('datos.nota')} className="sm:col-span-2 lg:col-span-3">
          <Textarea
            value={notas}
            maxLength={1000}
            rows={2}
            placeholder={t('datos.notaPlaceholder')}
            onChange={(e) => {
              setNotas(e.target.value);
              setSucio(true);
            }}
            className="border-line-strong bg-surface"
          />
        </FormField>
      </FormSection>

      {/* ── Productos ────────────────────────────────────────────────── */}
      <FormSection
        titulo={modo === 'conteo' ? t('productos.tituloConteo', { n: entero(lineas.length) }) : t('productos.titulo', { n: entero(lineas.length) })}
        descripcion={modo === 'conteo' ? t('productos.descripcionConteo') : t('productos.descripcion')}
        columnas={1}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBuscando(true)}
            disabled={!sucursal || cargando}
            className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm text-fg-muted hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <Search aria-hidden="true" className="size-4" strokeWidth={1.5} />
            <span className="truncate">{t('productos.buscar')}</span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10"
            onClick={() => setBuscando(true)}
            disabled={!sucursal || cargando}
            aria-label={t('productos.escanear')}
            title={t('productos.escanear')}
          >
            <ScanBarcode aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
        {errores?.cabecera.includes('sinRenglones') && (
          <p role="alert" className="text-sm text-danger-text">
            {t('errores.sinRenglones')}
          </p>
        )}

        {cargando ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label={t('cargando')}>
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : lineas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center">
            <p className="text-sm font-medium text-fg">{t('productos.vacioTitulo')}</p>
            <p className="mt-1 text-[13px] text-fg-secondary">{t('productos.vacioDescripcion')}</p>
            <Button type="button" variant="outline" className="mt-3 h-9 gap-2" onClick={() => setBuscando(true)} disabled={!sucursal}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('productos.agregar')}
            </Button>
          </div>
        ) : (
          <>
            {/* Escritorio y tableta: tabla (Figma 586:312944). */}
            <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('productos.tabla')}</caption>
                <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">{t('columnas.producto')}</th>
                    <th scope="col" className="w-48 px-3 py-2.5">{t('columnas.lote')}</th>
                    <th scope="col" className="px-3 py-2.5 text-right">{modo === 'conteo' ? t('columnas.sistema') : t('columnas.existencia')}</th>
                    <th scope="col" className="w-36 px-3 py-2.5">{etiquetaCantidad}</th>
                    <th scope="col" className="px-3 py-2.5 text-right">{modo === 'conteo' ? t('columnas.diferencia') : t('columnas.queda')}</th>
                    <th scope="col" className="px-3 py-2.5 text-right">{t('columnas.costo')}</th>
                    <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">{t('columnas.acciones')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineas.map((l) => (
                    <FilaLinea
                      key={l.clave}
                      linea={l}
                      modo={modo}
                      error={errorDe(l.clave)}
                      etiquetaCantidad={etiquetaCantidad}
                      moneda={moneda.formatear}
                      costos={permisos.costos}
                      onCambio={(c) => actualizar(l.clave, c)}
                      onLote={(lote) => {
                        setSucio(true);
                        setLineas((ls) => cambiarLote(ls, l.clave, lote));
                      }}
                      onQuitar={() => quitar(l.clave)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas con el contado a la derecha (Figma 975:186644). */}
            <ul className="flex flex-col gap-3 sm:hidden">
              {lineas.map((l) => {
                const c = calcularLinea(modo, l);
                const err = errorDe(l.clave);
                return (
                  <li key={l.clave} className={cn('rounded-xl border bg-surface p-4', err ? 'border-line-danger' : 'border-line')}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{l.producto.nombre}</p>
                        <p className="text-[13px] text-fg-secondary">
                          {t('movil.sistema', { n: cantidad(c.sistema, { unidad: cantidadDeProductoAjuste(l.producto).unidad }) })}
                          {l.lot_id ? ` · ${l.producto.lotes.find((x) => x.lot_id === l.lot_id)?.lote ?? ''}` : ''}
                        </p>
                        <p className="text-[13px]">
                          {c.diferencia === null ? (
                            <span className="text-fg-muted">{t('movil.sinCantidad')}</span>
                          ) : c.diferencia === 0 ? (
                            <span className="text-success-text">{t('movil.sinDiferencia')}</span>
                          ) : (
                            <CifraDiferencia
                              valor={c.diferencia}
                              texto={t('movil.diferencia', { n: cantidad(c.diferencia, { signo: true, unidad: cantidadDeProductoAjuste(l.producto).unidad }) })}
                            />
                          )}
                        </p>
                      </div>
                      <div className="w-28 shrink-0">
                        <CampoNumero
                          valor={l.cantidad}
                          onValorChange={(v) => actualizar(l.clave, { cantidad: v })}
                          decimales={cantidadDeProductoAjuste(l.producto, l.cantidad).decimales}
                          sufijo={cantidadDeProductoAjuste(l.producto).unidad ?? undefined}
                          minimo={0}
                          alinear="derecha"
                          aria-label={t('cantidadDe', { etiqueta: etiquetaCantidad, nombre: l.producto.nombre })}
                          aria-invalid={err === 'cantidad' || err === 'negativo'}
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => quitar(l.clave)} aria-label={t('quitar', { nombre: l.producto.nombre })}>
                        <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                    {err && (
                      <p role="alert" className="mt-2 text-xs text-danger-text">
                        {t(`errores.${err}`, { n: cantidad(Math.abs(c.diferencia ?? 0)) })}
                      </p>
                    )}
                    {(l.producto.controla_serial || l.producto.controla_lotes) && (
                      <div className="mt-3">
                        <DetalleLinea linea={l} modo={modo} onCambio={(cambio) => actualizar(l.clave, cambio)} onLote={(lote) => setLineas((ls) => cambiarLote(ls, l.clave, lote))} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </FormSection>

      {/* ── Pie con el resumen (Figma: Productos · Faltantes · Sobrantes · Impacto) ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <dl className="hidden flex-1 grid-cols-4 gap-4 sm:grid" aria-live="polite">
            <div>
              <dt className="text-xs text-fg-secondary">{t('resumen.productos')}</dt>
              <dd className="text-base font-semibold text-fg tabular-nums">{entero(resumen.productos)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('resumen.faltantes')}</dt>
              <dd className="text-base font-semibold tabular-nums">
                <CifraDiferencia valor={resumen.faltantes} texto={cantidad(resumen.faltantes, { signo: true, unidad: t('uds') })} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('resumen.sobrantes')}</dt>
              <dd className="text-base font-semibold tabular-nums">
                <CifraDiferencia valor={resumen.sobrantes} texto={cantidad(resumen.sobrantes, { signo: true, unidad: t('uds') })} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-secondary">{t('resumen.impacto')}</dt>
              <dd className="text-base font-semibold tabular-nums">
                {permisos.costos ? <CifraDiferencia valor={resumen.impacto} texto={importe(resumen.impacto)} /> : '—'}
              </dd>
            </div>
          </dl>
          <p className="text-[13px] text-fg-secondary sm:hidden" aria-live="polite">
            {t('resumen.movil', {
              productos: resumen.productos,
              n: entero(resumen.productos),
              diferencia: cantidad(resumen.neto, { signo: true }),
              impacto: permisos.costos ? importe(resumen.impacto) : '—',
            })}
          </p>
          <p className="hidden max-w-xs text-xs text-fg-secondary lg:block">{t('resumen.nota')}</p>
          <div className="flex gap-3 sm:hidden">
            <Button variant="outline" className="h-11 flex-1" onClick={() => void alGuardarBorrador()} disabled={guardando !== null || cargando}>
              {t('guardarBorrador')}
            </Button>
            <Button className="h-11 flex-1" onClick={alPedirAplicar} disabled={guardando !== null || cargando}>
              {t('aplicar')}
            </Button>
          </div>
        </div>
      </div>

      <AgregarProductosDialog
        abierto={buscando}
        onAbiertoChange={setBuscando}
        variante="venta"
        titulo={t('productos.dialogoTitulo')}
        descripcion={t('productos.dialogoDescripcion', { sucursal: nombreSucursal })}
        moneda={moneda}
        buscar={buscar}
        onAgregar={alAgregar}
      />

      <Dialogo
        abierto={confirmar}
        onAbiertoChange={(v) => {
          if (!v && guardando === null) setConfirmar(false);
        }}
        icono={CheckCircle2}
        titulo={t('confirmar.titulo')}
        descripcion={t('confirmar.descripcion', { count: resumen.conDiferencia, n: entero(resumen.conDiferencia) })}
        primario={{ etiqueta: t('confirmar.aplicar'), onClick: () => void alAplicar(), cargando: guardando === 'aplicar' }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          <li>{t('confirmar.faltantes', { n: cantidad(resumen.faltantes, { signo: true }), productos: resumen.productosFaltantes })}</li>
          <li>{t('confirmar.sobrantes', { n: cantidad(resumen.sobrantes, { signo: true }), productos: resumen.productosSobrantes })}</li>
          {permisos.costos && <li>{t('confirmar.impacto', { importe: importe(resumen.impacto) })}</li>}
        </ul>
        <p className="mt-3 text-xs text-fg-secondary">{t('confirmar.nota')}</p>
        {errorAplicar && (
          <p role="alert" className="mt-3 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {errorAplicar}
          </p>
        )}
      </Dialogo>
    </div>
  );
}

// ── Renglón de escritorio ─────────────────────────────────────────────────

function FilaLinea({
  linea,
  modo,
  error,
  etiquetaCantidad,
  moneda,
  costos,
  onCambio,
  onLote,
  onQuitar,
}: {
  linea: LineaAjuste;
  modo: ModoAjuste;
  error?: ErrorLinea;
  etiquetaCantidad: string;
  moneda: (n: number) => string;
  costos: boolean;
  onCambio: (c: Partial<LineaAjuste>) => void;
  onLote: (lote: number | null) => void;
  onQuitar: () => void;
}) {
  const t = useTranslations('inventarioAjustes.formulario');
  const cantidad = useFormatoCantidad();
  const c = calcularLinea(modo, linea);
  const p = linea.producto;
  // Peso o medida: decimales y unidad del producto (12,400 kg); por unidad, enteros.
  const { decimales, unidad } = cantidadDeProductoAjuste(p, linea.cantidad);
  const pideCosto = (c.diferencia ?? 0) > 0 && (c.costo === null || linea.costo !== null);
  const mostrarDetalle = p.controla_serial && (c.diferencia ?? 0) !== 0;

  return (
    <>
      <tr className={cn('align-middle', error && 'bg-danger-subtle/40')}>
        <td className="px-3 py-2.5">
          <p className="truncate font-medium text-fg">{p.nombre}</p>
          <p className="truncate text-xs text-fg-secondary">
            {[p.sku ? t('sku', { sku: p.sku }) : null, p.controla_serial ? t('conSeriales') : null].filter(Boolean).join(' · ')}
          </p>
        </td>
        <td className="px-3 py-2.5">
          <SelectorLote linea={linea} onLote={onLote} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-fg">
          <span className="flex flex-col items-end">
            <span>{cantidad(c.sistema, { unidad })}</span>
            {linea.sistemaGuardado !== undefined && linea.sistemaGuardado !== null && linea.sistemaGuardado !== c.sistema && (
              <span className="text-xs text-warning-text">{t('alContar', { n: cantidad(linea.sistemaGuardado, { unidad }) })}</span>
            )}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <CampoNumero
            data-cantidad-ajuste=""
            valor={linea.cantidad}
            onValorChange={(v) => onCambio({ cantidad: v })}
            decimales={decimales}
            sufijo={unidad ?? undefined}
            minimo={0}
            alinear="derecha"
            tamano="sm"
            aria-label={t('cantidadDe', { etiqueta: etiquetaCantidad, nombre: p.nombre })}
            aria-invalid={error === 'cantidad' || error === 'negativo'}
          />
        </td>
        <td className="px-3 py-2.5 text-right">
          {modo === 'conteo' ? (
            c.diferencia === null ? (
              <span className="text-fg-muted">—</span>
            ) : (
              <CifraDiferencia valor={c.diferencia} texto={cantidad(c.diferencia, { signo: true, unidad })} />
            )
          ) : (
            <span className={cn('tabular-nums', (c.queda ?? 0) < 0 ? 'text-danger-text' : 'text-fg')}>{cantidad(c.queda, { unidad })}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          {pideCosto && costos ? (
            <div className="ml-auto w-32">
              <CampoNumero
                valor={linea.costo}
                onValorChange={(v) => onCambio({ costo: v })}
                decimales={2}
                minimo={0}
                alinear="derecha"
                tamano="sm"
                prefijo="$"
                aria-label={t('costoDe', { nombre: p.nombre })}
                aria-invalid={error === 'costo'}
              />
            </div>
          ) : (
            <span className="tabular-nums text-fg">{costos && c.costo !== null ? moneda(c.costo) : '—'}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={onQuitar} aria-label={t('quitar', { nombre: p.nombre })}>
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
        </td>
      </tr>
      {(mostrarDetalle || error) && (
        <tr>
          <td colSpan={7} className="px-3 pb-3 pt-0">
            {error && (
              <p role="alert" className="mb-2 text-xs text-danger-text">
                {t(`errores.${error}`, { n: cantidad(Math.abs(c.diferencia ?? 0)) })}
              </p>
            )}
            {mostrarDetalle && <DetalleLinea linea={linea} modo={modo} onCambio={onCambio} onLote={onLote} soloSeriales />}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Lote del renglón ──────────────────────────────────────────────────────

function SelectorLote({ linea, onLote }: { linea: LineaAjuste; onLote: (lote: number | null) => void }) {
  const t = useTranslations('inventarioAjustes.formulario');
  const { formatPlain, getToday } = useFormatDate();
  const p = linea.producto;
  // Lotes conocidos: los del producto y los que tienen fila en la sucursal.
  const opciones = new Map<number, { lote: string; vence: string | null }>();
  p.lotes.forEach((l) => opciones.set(l.lot_id, { lote: l.lote, vence: l.vence }));
  p.existencias.forEach((e) => {
    if (e.lot_id !== null && !opciones.has(e.lot_id)) opciones.set(e.lot_id, { lote: e.lote ?? `#${e.lot_id}`, vence: e.vence });
  });
  if (!p.controla_lotes && opciones.size === 0) {
    return (
      <Select disabled value="sin">
        <SelectTrigger className="h-9 border-line bg-subtle text-fg-muted" aria-label={t('loteDe', { nombre: p.nombre })}>
          <SelectValue placeholder={t('sinLote')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sin">{t('sinLote')}</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const hoy = getToday();
  return (
    <Select value={linea.lot_id ? String(linea.lot_id) : 'sin'} onValueChange={(v) => onLote(v === 'sin' ? null : Number(v))}>
      <SelectTrigger className="h-9 border-line-strong bg-surface" aria-label={t('loteDe', { nombre: p.nombre })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sin">{t('sinLote')}</SelectItem>
        {[...opciones.entries()].map(([id, o]) => (
          <SelectItem key={id} value={String(id)}>
            {o.vence && o.vence < hoy ? t('loteVencido', { lote: o.lote }) : o.vence ? t('loteVence', { lote: o.lote, fecha: formatPlain(o.vence) }) : o.lote}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Seriales (y lote en móvil) ────────────────────────────────────────────

function DetalleLinea({
  linea,
  modo,
  onCambio,
  onLote,
  soloSeriales,
}: {
  linea: LineaAjuste;
  modo: ModoAjuste;
  onCambio: (c: Partial<LineaAjuste>) => void;
  onLote: (lote: number | null) => void;
  soloSeriales?: boolean;
}) {
  const t = useTranslations('inventarioAjustes.formulario');
  const [nuevo, setNuevo] = useState('');
  const c = calcularLinea(modo, linea);
  const p = linea.producto;
  const dif = c.diferencia ?? 0;
  const faltan = Math.abs(dif) - linea.seriales.length;
  const disponibles = p.seriales_en_stock.filter((s) => !linea.seriales.includes(s));

  const agregar = (s: string) => {
    const v = s.trim();
    if (!v || linea.seriales.includes(v)) return;
    onCambio({ seriales: [...linea.seriales, v] });
  };

  return (
    <div className="flex flex-col gap-2">
      {!soloSeriales && p.controla_lotes && (
        <div className="max-w-xs">
          <SelectorLote linea={linea} onLote={onLote} />
        </div>
      )}
      {p.controla_serial && dif !== 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-fg-secondary">{dif < 0 ? t('seriales.salen', { count: Math.abs(dif) }) : t('seriales.entran', { count: Math.abs(dif) })}</span>
          {linea.seriales.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 font-medium text-brand-deep">
              {s}
              <button
                type="button"
                onClick={() => onCambio({ seriales: linea.seriales.filter((x) => x !== s) })}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={t('seriales.quitar', { serial: s })}
              >
                <X aria-hidden="true" className="size-3" strokeWidth={2} />
              </button>
            </span>
          ))}
          {faltan > 0 &&
            (dif < 0 ? (
              <Select value="" onValueChange={agregar}>
                <SelectTrigger className="h-8 w-44 border-line-strong bg-surface text-xs" aria-label={t('seriales.elegir', { nombre: p.nombre })}>
                  <SelectValue placeholder={t('seriales.elegirPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {disponibles.length === 0 ? (
                    <SelectItem value="__ninguno" disabled>
                      {t('seriales.ninguno')}
                    </SelectItem>
                  ) : (
                    disponibles.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregar(nuevo);
                    setNuevo('');
                  }
                }}
                placeholder={t('seriales.escribir')}
                aria-label={t('seriales.escribirDe', { nombre: p.nombre })}
                className="h-8 w-48 border-line-strong bg-surface text-xs"
              />
            ))}
          <span className="text-fg-muted">{dif < 0 ? t('seriales.notaSalida') : t('seriales.notaEntrada')}</span>
        </div>
      )}
    </div>
  );
}

export default FormularioAjuste;
