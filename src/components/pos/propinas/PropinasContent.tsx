'use client';

/**
 * Propinas del POS (Figma `1087:712124`, aprobado el 2026-11-20): pestañas
 * Por liquidar · Liquidaciones · Anuladas · Todas, cifras, «Por persona»,
 * asistente «Liquidar» en 3 pasos, menú ⋯ con anular por motivo, y vistas
 * tableta y móvil.
 *
 * Todo pasa por el servidor (`/api/pos/propinas/**`): listado paginado,
 * cifras, permisos y escrituras. La organización sale de la sesión y las
 * fechas son días de la organización (por defecto «hoy»).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Eye,
  HandCoins,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  UserCheck,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import {
  AvatarIniciales,
  BulkActionBar,
  DataTable,
  DateRangeButton,
  DialogoMotivo,
  FilterChips,
  FilterPanel,
  FormField,
  KpiCompacto,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  TabBar,
  Tarjeta,
  useListadoServidor,
  useOpcionUrl,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { ChipDocumento } from '@/components/kit/documento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useBranch } from '@/lib/context/BranchContext';
import { guardarArchivo } from '@/lib/documents/cliente';
import { filasACsv } from '@/lib/utils/csv';
import {
  anularLiquidacionPropinas,
  anularPropinaConMotivo,
  liquidarPropinas,
  pedirCifrasPropinas,
  pedirLiquidaciones,
  pedirPermisosPropinas,
  pedirPropinas,
} from '@/lib/pos/propinas/clientePropinas';
import { codigoErrorPropina } from '@/lib/pos/propinas/errores';
import { liquidable, numeroEgreso, porcentajeConPropina } from '@/lib/pos/propinas/liquidacionLogica';
import {
  SIN_PERMISOS_PROPINAS,
  TIPOS_PROPINA,
  type CifrasPropinas,
  type FilaLiquidacion,
  type FilaPropina,
  type PaginaLiquidaciones,
  type PaginaPropinas,
  type PermisosPropinasServidor,
  type PersonaPropina,
  type ResultadoLiquidacion,
} from '@/lib/pos/propinas/tiposPropinas';
import { LiquidarDialog } from './LiquidarDialog';
import { PropinaFormDialog, type ModoFormularioPropina } from './PropinaFormDialog';
import { PropinasService } from './propinasService';
import { useEtiquetasPropinas, useFormatoPropinas } from './formatoPropinas';
import type { Mesero } from './types';
import { useMigaVentas } from '@/components/pos/useMigaVentas';

const RUTA = '/app/pos/propinas';
const PESTANAS = ['por_liquidar', 'liquidaciones', 'anuladas', 'todas'] as const;
type Pestana = (typeof PESTANAS)[number];
const FILTROS = ['tipo', 'persona', 'desde', 'hasta', 'fechas', 'estado', 'medio'] as const;

function nuevaSolicitud(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

/**
 * `embedded`: dentro del diálogo de Configuración › POS (`ConfigModals.tsx`):
 * sin migas ni el relleno de página, como `CargosServicioContent`.
 */
export function PropinasContent({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('posPropinas');
  const migaVentas = useMigaVentas();
  const router = useRouter();
  const f = useFormatoPropinas();
  const etiqueta = useEtiquetasPropinas();
  const { branchFilter, selectedBranchId, branches } = useBranch();
  const [pestana, setPestana] = useOpcionUrl<Pestana>('pestana', PESTANAS, 'por_liquidar');

  const l = useListadoServidor({
    filtros: [...FILTROS],
    camposOrden: ['fecha', 'monto'],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [permisos, setPermisos] = useState<PermisosPropinasServidor>(SIN_PERMISOS_PROPINAS);
  const [datos, setDatos] = useState<PaginaPropinas | null>(null);
  const [liquidaciones, setLiquidaciones] = useState<PaginaLiquidaciones | null>(null);
  const [cifras, setCifras] = useState<CifrasPropinas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [meseros, setMeseros] = useState<Mesero[]>([]);
  const [liquidar, setLiquidar] = useState<{ ids: string[] | null } | null>(null);
  const [formulario, setFormulario] = useState<{ modo: ModoFormularioPropina; propina: FilaPropina | null } | null>(null);
  const [anular, setAnular] = useState<FilaPropina[] | null>(null);
  const [anularLiq, setAnularLiq] = useState<FilaLiquidacion | null>(null);
  const [sinPago, setSinPago] = useState<FilaPropina | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);

  // Periodo: «hoy» por defecto (día de la organización); `fechas=todas` lo quita.
  const todasLasFechas = l.filtros.fechas === 'todas';
  const desde = todasLasFechas ? null : (l.filtros.desde ?? f.hoy);
  const hasta = todasLasFechas ? null : (l.filtros.hasta ?? f.hoy);
  const sucursal = branchFilter ?? null;
  const sucursalLiquidar = branchFilter ?? selectedBranchId ?? null;
  const nombreSucursal = branches.find((b) => b.id === sucursalLiquidar)?.name ?? '';

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    if (sucursal) q.set('sucursal', String(sucursal));
    if (pestana === 'liquidaciones') {
      if (l.filtros.estado) q.set('estado', l.filtros.estado);
      if (l.filtros.medio) q.set('medio', l.filtros.medio);
    } else {
      q.set('vista', pestana);
      if (l.filtros.tipo) q.set('tipo', l.filtros.tipo);
      if (l.filtros.persona) q.set('persona', l.filtros.persona);
      q.set('orden', l.orden?.campo ?? 'fecha');
      q.set('dir', l.orden?.direccion ?? 'desc');
    }
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, desde, hasta, sucursal, pestana]);

  const consultaCifras = useMemo(() => {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    if (sucursal) q.set('sucursal', String(sucursal));
    return q.toString();
  }, [desde, hasta, sucursal]);

  useEffect(() => {
    let vigente = true;
    pedirPermisosPropinas()
      .then((p) => vigente && setPermisos(p))
      .catch(() => vigente && setPermisos(SIN_PERMISOS_PROPINAS));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    let vigente = true;
    PropinasService.getServers(sucursalLiquidar, t('sinNombre'))
      .then((m) => vigente && setMeseros(m))
      .catch(() => vigente && setMeseros([]));
    return () => {
      vigente = false;
    };
  }, [sucursalLiquidar, t]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    const q = new URLSearchParams(consulta);
    const peticion = pestana === 'liquidaciones' ? pedirLiquidaciones(q).then((r) => vigente && setLiquidaciones(r)) : pedirPropinas(q).then((r) => vigente && setDatos(r));
    peticion
      .catch((e) => vigente && setError(codigoErrorPropina(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consulta, pestana, recarga]);

  useEffect(() => {
    let vigente = true;
    pedirCifrasPropinas(new URLSearchParams(consultaCifras))
      .then((c) => vigente && setCifras(c))
      .catch(() => vigente && setCifras(null));
    return () => {
      vigente = false;
    };
  }, [consultaCifras, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: sucursal, p: pestana });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const filasLiq = liquidaciones?.filas ?? [];
  const total = pestana === 'liquidaciones' ? (liquidaciones?.total ?? 0) : (datos?.total ?? 0);
  const elegidas = filas.filter((x) => seleccion.has(x.id));
  const montoElegido = elegidas.reduce((a, x) => a + x.monto, 0);
  const pendientes = cifras?.por_liquidar.cantidad ?? 0;
  const conResumenPorPersona = pestana === 'por_liquidar' && (cifras?.por_persona.length ?? 0) > 0;
  const sustantivo = { singular: t('pagina.sustantivo.singular'), plural: t('pagina.sustantivo.plural'), genero: 'femenino' as const };

  const motivoLiquidar = !permisos.liquidar ? t('motivos.sinPermisoLiquidar') : !sucursalLiquidar ? t('motivos.eligeSucursal') : undefined;
  const motivoAnular = !permisos.anular ? t('motivos.sinPermisoAnular') : undefined;

  // ── Acciones de una propina (menú ⋯, clon del menú aprobado) ──
  const accionesDe = (x: FilaPropina): AccionFila[] => {
    const porLiquidar = x.estado === 'por_liquidar';
    return [
      {
        id: 'venta',
        etiqueta: t('acciones.verVenta', { numero: x.venta?.numero ?? '' }),
        icono: Receipt,
        onSelect: () => x.venta && router.push(`/app/pos/ventas/${x.venta.id}`),
        oculta: !x.venta,
      },
      {
        id: 'mesa',
        etiqueta: t('acciones.verMesa', { mesa: x.venta?.mesa ?? '' }),
        icono: UtensilsCrossed,
        onSelect: () => x.venta?.mesa_id && router.push(`/app/pos/mesas/${x.venta.mesa_id}`),
        oculta: !x.venta?.mesa_id,
      },
      {
        id: 'liquidacion',
        etiqueta: t('acciones.verLiquidacion', { codigo: x.liquidacion?.codigo ?? '' }),
        icono: Eye,
        onSelect: () => x.liquidacion && router.push(`${RUTA}/liquidaciones/${x.liquidacion.id}`),
        oculta: !x.liquidacion,
      },
      {
        id: 'reasignar',
        etiqueta: t('acciones.reasignar'),
        icono: UserCheck,
        onSelect: () => setFormulario({ modo: 'reasignar', propina: x }),
        oculta: !porLiquidar,
        deshabilitada: !permisos.registrar,
        motivo: t('motivos.sinPermisoRegistrar'),
      },
      {
        id: 'corregir',
        etiqueta: t('acciones.corregir'),
        icono: Pencil,
        onSelect: () => setFormulario({ modo: 'corregir', propina: x }),
        oculta: !porLiquidar,
        deshabilitada: !permisos.registrar,
        motivo: t('motivos.sinPermisoRegistrar'),
      },
      {
        id: 'sinPago',
        etiqueta: t('acciones.sinPago'),
        icono: CheckCircle2,
        onSelect: () => {
          setErrorDialogo(null);
          setSinPago(x);
        },
        oculta: !porLiquidar,
        deshabilitada: !!motivoLiquidar || !liquidable(x),
        motivo: motivoLiquidar ?? t('motivos.ventaAbierta'),
      },
      {
        id: 'anular',
        etiqueta: t('acciones.anular'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => {
          setErrorDialogo(null);
          setAnular([x]);
        },
        oculta: !porLiquidar,
        deshabilitada: !permisos.anular,
        motivo: motivoAnular,
      },
    ];
  };

  const accionesLiquidacion = (x: FilaLiquidacion): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.verDetalle'), icono: Eye, onSelect: () => router.push(`${RUTA}/liquidaciones/${x.id}`) },
    { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => router.push(`${RUTA}/liquidaciones/${x.id}?imprimir=1`) },
    {
      id: 'anular',
      etiqueta: t('acciones.anularLiquidacion'),
      icono: Ban,
      destructiva: true,
      separadorAntes: true,
      onSelect: () => {
        setErrorDialogo(null);
        setAnularLiq(x);
      },
      oculta: x.estado === 'anulada',
      deshabilitada: !permisos.anularLiquidacion,
      motivo: t('motivos.sinPermisoAnularLiquidacion'),
    },
  ];

  // ── Escrituras ──
  const confirmarAnular = async (motivo: string) => {
    if (!anular) return;
    setOcupado(true);
    setErrorDialogo(null);
    try {
      let revertidos = 0;
      for (const x of anular) revertidos += (await anularPropinaConMotivo(x.id, motivo)).asientosRevertidos;
      toast.success(revertidos > 0 ? t('toast.anuladaConReverso') : t('toast.anulada'));
      setAnular(null);
      setSeleccion(new Set());
      recargar();
    } catch (e) {
      setErrorDialogo(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarSinPago = async (motivo: string) => {
    if (!sinPago || !sucursalLiquidar) return;
    setOcupado(true);
    setErrorDialogo(null);
    try {
      const r = await liquidarPropinas({
        solicitud: nuevaSolicitud(),
        sucursal_id: sinPago.sucursal_id,
        propinas: [sinPago.id],
        reparto: 'atendio',
        medio: 'sin_pago',
        motivo,
      });
      toast.success(t('toast.liquidada', { codigo: r.codigo }));
      setSinPago(null);
      recargar();
    } catch (e) {
      setErrorDialogo(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarAnularLiq = async (motivo: string) => {
    if (!anularLiq) return;
    setOcupado(true);
    setErrorDialogo(null);
    try {
      await anularLiquidacionPropinas(anularLiq.id, motivo);
      toast.success(t('toast.liquidacionAnulada', { codigo: anularLiq.codigo }));
      setAnularLiq(null);
      recargar();
    } catch (e) {
      setErrorDialogo(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setOcupado(false);
    }
  };

  const alLiquidar = (r: ResultadoLiquidacion, imprimir: boolean) => {
    setLiquidar(null);
    setSeleccion(new Set());
    toast.success(t('toast.liquidada', { codigo: r.codigo }));
    router.push(`${RUTA}/liquidaciones/${r.id}${imprimir ? '?imprimir=1' : ''}`);
  };

  const exportar = (lista: readonly FilaPropina[]) => {
    const csv = filasACsv(
      [t('columnas.fecha'), t('columnas.documento'), t('columnas.mesa'), t('columnas.atendio'), t('columnas.cargo'), t('columnas.tipo'), t('columnas.monto'), t('columnas.estado')],
      lista.map((x) => [f.fechaHora(x.fecha), x.venta?.numero, x.venta?.mesa, x.persona.nombre, x.persona.cargo, etiqueta.tipo(x.tipo), x.monto, t(`estados.${x.estado}`)]),
    );
    guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `propinas_${desde ?? 'todas'}_${hasta ?? ''}.csv`);
  };

  // ── Celdas ──
  const documento = (x: FilaPropina) =>
    x.venta?.numero ? (
      <ChipDocumento tipo={x.venta.tipo_numero === 'pedido' ? 'pedido' : 'venta'} numero={x.venta.numero} href={`/app/pos/ventas/${x.venta.id}`} />
    ) : (
      <span className="text-fg-muted">{x.venta ? t('tabla.sinNumero') : t('tabla.manual')}</span>
    );
  const mesa = (x: FilaPropina) =>
    x.venta?.mesa ?? (x.venta?.origen === 'web' ? t('origenes.domicilio') : x.venta ? t('origenes.mostrador') : '—');
  const badgeEstado = (x: FilaPropina) =>
    x.estado === 'por_liquidar' ? (
      x.venta?.abierta ? (
        <StatusBadge estado="pendiente" etiqueta={t('estados.ventaAbierta')} tamano="sm" />
      ) : (
        <StatusBadge estado="pendiente" etiqueta={t('estados.por_liquidar')} tamano="sm" />
      )
    ) : (
      <StatusBadge estado={x.estado === 'liquidada' ? 'pagada' : 'anulada'} etiqueta={t(`estados.${x.estado}`)} tamano="sm" />
    );

  const columnas: ColumnaTabla<FilaPropina>[] = [
    {
      id: 'fecha',
      encabezado: t('columnas.fecha'),
      ordenable: true,
      celda: (x) => (
        <div className="flex flex-col whitespace-nowrap" title={f.fechaHora(x.fecha)}>
          <span className="text-fg">{f.dia(x.fecha)}</span>
          <span className="text-xs text-fg-secondary">{f.hora(x.fecha)}</span>
        </div>
      ),
    },
    { id: 'documento', encabezado: t('columnas.documento'), className: 'whitespace-nowrap', celda: documento },
    { id: 'mesa', encabezado: t('columnas.mesa'), ocultarDebajo: 'lg', celda: (x) => <span className="block max-w-[8rem] truncate">{mesa(x)}</span> },
    {
      id: 'atendio',
      encabezado: t('columnas.atendio'),
      celda: (x) => (
        <div className="flex max-w-[12rem] flex-col">
          <span className="truncate text-fg">{x.persona.nombre ?? t('sinNombre')}</span>
          {x.persona.cargo && <span className="truncate text-xs text-fg-secondary">{x.persona.cargo}</span>}
        </div>
      ),
    },
    { id: 'tipo', encabezado: t('columnas.tipo'), ocultarDebajo: 'md', celda: (x) => etiqueta.tipo(x.tipo) },
    ...(pestana === 'anuladas'
      ? [
          {
            id: 'motivo',
            encabezado: t('columnas.motivo'),
            ocultarDebajo: 'lg' as const,
            celda: (x: FilaPropina) => <span className="block max-w-[14rem] truncate text-fg-secondary" title={x.motivo_anulacion ?? ''}>{x.motivo_anulacion ?? '—'}</span>,
          },
        ]
      : []),
    ...(pestana === 'todas' ? [{ id: 'estado', encabezado: t('columnas.estado'), className: 'whitespace-nowrap', celda: badgeEstado }] : []),
    {
      id: 'monto',
      encabezado: t('columnas.monto'),
      variante: 'importe',
      ordenable: true,
      celda: (x) => <span className={x.estado === 'anulada' ? 'text-fg-muted line-through' : 'text-fg'}>{f.formatear(x.monto)}</span>,
    },
  ];

  const columnasLiq: ColumnaTabla<FilaLiquidacion>[] = [
    { id: 'numero', encabezado: t('liquidaciones.columnas.numero'), variante: 'mono', className: 'whitespace-nowrap', celda: (x) => <span className="font-medium text-fg">{x.codigo}</span> },
    {
      id: 'periodo',
      encabezado: t('liquidaciones.columnas.periodo'),
      celda: (x) => (
        <div className="flex flex-col whitespace-nowrap">
          <span className="text-fg">{f.periodo(x.desde, x.hasta) || f.dia(x.creada_en)}</span>
          <span className="text-xs text-fg-secondary">
            {x.estado === 'anulada'
              ? t('liquidaciones.anuladaEl', { fecha: f.dia(x.anulada_en) })
              : t('liquidaciones.liquidadaEl', { fecha: `${f.dia(x.creada_en)} · ${f.hora(x.creada_en)}` })}
          </span>
        </div>
      ),
    },
    { id: 'personas', encabezado: t('liquidaciones.columnas.personas'), alinear: 'derecha', ocultarDebajo: 'md', celda: (x) => f.entero(x.personas) },
    { id: 'reparto', encabezado: t('liquidaciones.columnas.reparto'), ocultarDebajo: 'lg', celda: (x) => etiqueta.reparto(x.reparto) },
    {
      id: 'pago',
      encabezado: t('liquidaciones.columnas.pagadoCon'),
      ocultarDebajo: 'md',
      celda: (x) => (
        <div className="flex max-w-[14rem] flex-col">
          <span className="truncate text-fg">
            {x.medio === 'efectivo' && x.sesion_caja ? t('liquidaciones.efectivoCaja', { caja: x.sesion_caja }) : etiqueta.medio(x.medio)}
          </span>
          <span className="truncate text-xs text-fg-secondary">
            {x.medio === 'efectivo'
              ? x.estado === 'anulada'
                ? t('liquidaciones.egresoAnulado')
                : t('liquidaciones.egreso', { numero: numeroEgreso(x.movimiento_caja) ?? '—' })
              : x.medio === 'transferencia'
                ? t('liquidaciones.referencias', { refs: x.referencias ?? '—' })
                : ''}
          </span>
        </div>
      ),
    },
    { id: 'total', encabezado: t('liquidaciones.columnas.total'), variante: 'importe', celda: (x) => <span className={x.estado === 'anulada' ? 'text-fg-muted line-through' : 'text-fg'}>{f.formatear(x.total)}</span> },
    {
      id: 'estado',
      encabezado: t('liquidaciones.columnas.estado'),
      className: 'whitespace-nowrap',
      celda: (x) => <StatusBadge estado={x.estado} etiqueta={t(`liquidaciones.estados.${x.estado}`)} tamano="sm" />,
    },
  ];

  // ── Filtros y chips ──
  const personasFiltro: PersonaPropina[] = useMemo(() => {
    const m = new Map<string, PersonaPropina>();
    meseros.forEach((x) => m.set(x.id, { id: x.id, nombre: x.name, cargo: null }));
    (cifras?.por_persona ?? []).forEach((p) => m.set(p.id, p));
    return [...m.values()];
  }, [meseros, cifras]);

  const chips: ChipFiltro[] = [
    !todasLasFechas
      ? { clave: 'periodo', etiqueta: desde === f.hoy && hasta === f.hoy ? t('filtros.fechaHoy') : t('filtros.fechaChip', { rango: f.periodo(desde, hasta) }) }
      : null,
    pestana !== 'liquidaciones' && l.filtros.tipo ? { clave: 'tipo', etiqueta: t('filtros.tipoChip', { tipo: etiqueta.tipo(l.filtros.tipo as never) }) } : null,
    pestana !== 'liquidaciones' && l.filtros.persona
      ? { clave: 'persona', etiqueta: t('filtros.personaChip', { persona: personasFiltro.find((p) => p.id === l.filtros.persona)?.nombre ?? '' }) }
      : null,
    pestana === 'liquidaciones' && l.filtros.estado ? { clave: 'estado', etiqueta: t(`liquidaciones.estados.${l.filtros.estado}` as never) } : null,
    pestana === 'liquidaciones' && l.filtros.medio ? { clave: 'medio', etiqueta: etiqueta.medio(l.filtros.medio as never) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === 'periodo') {
      const resto = Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta'));
      l.actualizar({ filtros: { ...resto, fechas: 'todas' } });
    } else l.setFiltro(clave, null);
  };

  const selectFiltro = (clave: 'tipo' | 'persona' | 'estado' | 'medio', opciones: { valor: string; etiqueta: string }[], etiquetaCampo: string) => (
    <FormField etiqueta={etiquetaCampo}>
      {(c) => (
        <Select value={l.filtros[clave] ?? 'todos'} onValueChange={(v) => l.setFiltro(clave, v === 'todos' ? null : v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  const estadoTabla = (n: number) =>
    error === 'SIN_PERMISO'
      ? ('sinPermiso' as const)
      : cargando && n === 0
        ? ('cargando' as const)
        : error
          ? ('error' as const)
          : n === 0
            ? l.hayCriterios || !todasLasFechas
              ? ('sinResultados' as const)
              : ('vacio' as const)
            : ('listo' as const);

  const porLiquidarMonto = cifras?.por_liquidar.monto ?? 0;
  const pctVentas = porcentajeConPropina(cifras?.ventas);
  const subtitulo = [nombreSucursal || t('pagina.todasSucursales'), todasLasFechas ? t('pagina.todasLasFechas') : f.periodo(desde, hasta)].join(' · ');
  const botonLiquidar = (
    <Button className="h-10 gap-2" disabled={!!motivoLiquidar || pendientes === 0} title={motivoLiquidar} onClick={() => setLiquidar({ ids: null })}>
      <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('pagina.liquidar', { n: pendientes })}
    </Button>
  );

  const pie = (
    <Pagination
      pagina={l.pagina}
      tamano={l.tamano}
      total={total}
      onPaginaChange={l.setPagina}
      onTamanoChange={l.setTamano}
      sustantivo={pestana === 'liquidaciones' ? { singular: t('liquidaciones.sustantivo.singular'), plural: t('liquidaciones.sustantivo.plural') } : sustantivo}
      cargando={cargando}
    />
  );

  const vacioPropinas = {
    titulo: pestana === 'anuladas' ? t('vacios.anuladasTitulo') : t('vacios.titulo'),
    descripcion: pestana === 'anuladas' ? t('vacios.anuladasDescripcion') : t('vacios.descripcion'),
    icono: HandCoins,
    accion: permisos.registrar && pestana !== 'anuladas' ? { etiqueta: t('pagina.nueva'), onClick: () => setFormulario({ modo: 'nueva', propina: null }), icono: Plus } : undefined,
  };

  return (
    <div className={embedded ? 'flex flex-col gap-4 lg:gap-5' : 'flex flex-col gap-4 p-4 sm:p-6 lg:gap-5'}>
      <PageHeader
        titulo={t('pagina.titulo')}
        subtitulo={subtitulo}
        icono={HandCoins}
        cargando={cargando}
        migas={embedded ? undefined : [migaVentas, { etiqueta: t('pagina.titulo') }]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('pagina.actualizar')} title={t('pagina.actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </Button>
            {permisos.registrar && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => setFormulario({ modo: 'nueva', propina: null })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('pagina.nueva')}
              </Button>
            )}
            {permisos.liquidar && botonLiquidar}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('pagina.titulo')}
              acciones={[
                {
                  id: 'exportar',
                  etiqueta: t('pagina.exportar'),
                  icono: Download,
                  onSelect: () => exportar(filas),
                  deshabilitada: pestana === 'liquidaciones' || filas.length === 0,
                  motivo: t('motivos.nadaQueExportar'),
                },
                { id: 'dinero', etiqueta: t('pagina.dineroTerceros'), icono: Users, onSelect: () => router.push('/app/finanzas/dinero-terceros') },
              ]}
            />
          </>
        }
        movil={{
          titulo: t('pagina.titulo'),
          subtitulo,
          accion: permisos.registrar ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setFormulario({ modo: 'nueva', propina: null })} aria-label={t('pagina.nueva')}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Button>
          ) : undefined,
        }}
        debajo={
          <TabBar
            id="propinas"
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={(v) => {
              setPestana(v);
              l.setPagina(1);
            }}
            pestanas={[
              { valor: 'por_liquidar', etiqueta: t('pestanas.por_liquidar'), contador: cifras?.conteos.por_liquidar },
              { valor: 'liquidaciones', etiqueta: t('pestanas.liquidaciones'), contador: cifras?.conteos.liquidaciones },
              { valor: 'anuladas', etiqueta: t('pestanas.anuladas') },
              { valor: 'todas', etiqueta: t('pestanas.todas') },
            ]}
          />
        }
      />

      <div className="hidden md:block">
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard
            etiqueta={t('kpis.porLiquidar')}
            cargando={!cifras}
            valor={f.formatear(porLiquidarMonto)}
            tono={pendientes > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={pendientes > 0 ? AlertTriangle : undefined}
            detalle={cifras ? t('kpis.porLiquidarDetalle', { count: pendientes, n: f.entero(pendientes), personas: cifras.por_liquidar.personas }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.liquidadoMes', { mes: f.mes(new Date()) })}
            cargando={!cifras}
            valor={f.formatear(cifras?.liquidado_mes.monto ?? 0)}
            detalle={cifras ? t('kpis.liquidaciones', { count: cifras.liquidado_mes.liquidaciones }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.promedio')}
            cargando={!cifras}
            valor={f.formatear(cifras?.promedio.monto ?? 0)}
            detalle={cifras ? t('kpis.promedioDetalle', { count: cifras.promedio.cantidad }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.ventasConPropina')}
            cargando={!cifras}
            valor={pctVentas === null ? '—' : `${pctVentas} %`}
            detalle={cifras ? t('kpis.ventasDetalle', { con: cifras.ventas.con_propina, total: cifras.ventas.total }) : undefined}
          />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="md:hidden"
        etiqueta={t('kpis.etiqueta')}
        cargando={!cifras}
        cifras={[
          { id: 'porLiquidar', etiqueta: t('kpis.porLiquidar'), valor: f.formatear(porLiquidarMonto), tono: pendientes > 0 ? 'advertencia' : undefined },
          { id: 'propinas', etiqueta: t('kpis.propinas'), valor: f.entero(pendientes) },
          { id: 'conPropina', etiqueta: t('kpis.conPropina'), valor: pctVentas === null ? '—' : `${pctVentas} %`, tono: 'exito' },
        ]}
      />

      <ListToolbar
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder={pestana === 'liquidaciones' ? t('filtros.buscarLiquidaciones') : t('filtros.buscar')}
            etiqueta={t('filtros.buscarEtiqueta')}
          />
        }
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: f.entero(total) })}>
            <FormField etiqueta={t('filtros.periodo')}>
              {() => (
                <DateRangeButton
                  valor={{ desde: desde ?? f.hoy, hasta: hasta ?? f.hoy }}
                  hoy={f.hoy}
                  max={f.hoy}
                  etiqueta={t('filtros.periodo')}
                  onValorChange={(r) =>
                    l.actualizar({ filtros: { ...Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'fechas')), desde: r.desde, hasta: r.hasta } })
                  }
                />
              )}
            </FormField>
            {pestana === 'liquidaciones' ? (
              <>
                {selectFiltro('estado', [{ valor: 'pagada', etiqueta: t('liquidaciones.estados.pagada') }, { valor: 'anulada', etiqueta: t('liquidaciones.estados.anulada') }], t('filtros.estado'))}
                {selectFiltro(
                  'medio',
                  (['efectivo', 'transferencia', 'sin_pago'] as const).map((m) => ({ valor: m, etiqueta: etiqueta.medio(m) })),
                  t('filtros.medio'),
                )}
              </>
            ) : (
              <>
                {selectFiltro('tipo', TIPOS_PROPINA.map((x) => ({ valor: x, etiqueta: etiqueta.tipo(x) })), t('filtros.tipo'))}
                {selectFiltro('persona', personasFiltro.map((p) => ({ valor: p.id, etiqueta: p.nombre ?? t('sinNombre') })), t('filtros.persona'))}
              </>
            )}
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarTodo} />}
      />

      {pestana === 'liquidaciones' ? (
        <DataTable
          etiqueta={t('liquidaciones.titulo')}
          columnas={columnasLiq}
          filas={filasLiq}
          obtenerId={(x) => x.id}
          estado={estadoTabla(filasLiq.length)}
          onFilaClick={(x) => router.push(`${RUTA}/liquidaciones/${x.id}`)}
          etiquetaFila={(x) => x.codigo}
          acciones={accionesLiquidacion}
          tonoFila={(x) => (x.estado === 'anulada' ? 'peligro' : undefined)}
          tarjetaMovil={(x) => (
            <ListCard
              icono={HandCoins}
              titulo={x.codigo}
              subtitulo={`${f.periodo(x.desde, x.hasta) || f.dia(x.creada_en)} · ${etiqueta.medio(x.medio)}`}
              meta={t('liquidaciones.personasN', { count: x.personas })}
              valor={f.formatear(x.total)}
              estado={<StatusBadge estado={x.estado} etiqueta={t(`liquidaciones.estados.${x.estado}`)} tamano="sm" />}
              acciones={accionesLiquidacion(x)}
              onClick={() => router.push(`${RUTA}/liquidaciones/${x.id}`)}
            />
          )}
          vacio={{ titulo: t('vacios.liquidacionesTitulo'), descripcion: t('vacios.liquidacionesDescripcion'), icono: HandCoins }}
          sinResultados={{ descripcion: t('vacios.sinResultados') }}
          error={{ titulo: t('vacios.error') }}
          sinPermiso={{ titulo: t('vacios.sinPermisoTitulo'), descripcion: t('vacios.sinPermisoDescripcion') }}
          onLimpiarFiltros={l.limpiarTodo}
          onReintentar={recargar}
          termino={l.busqueda}
          pie={pie}
        />
      ) : (
        // La columna de 320 px solo existe cuando hay resumen por persona; si no, la tabla
        // quedaba con un hueco vacío a la derecha.
        <div className={conResumenPorPersona ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-4'}>
          <DataTable
            etiqueta={t(`pestanas.${pestana}`)}
            columnas={columnas}
            filas={filas}
            obtenerId={(x) => x.id}
            estado={estadoTabla(filas.length)}
            orden={l.orden}
            onOrdenar={l.ordenarPor}
            seleccion={pestana === 'por_liquidar' ? seleccion : undefined}
            onSeleccionChange={pestana === 'por_liquidar' ? setSeleccion : undefined}
            etiquetaFila={(x) => `${x.venta?.numero ?? t('tabla.manual')} · ${x.persona.nombre ?? ''} · ${f.formatear(x.monto)}`}
            acciones={accionesDe}
            tonoFila={(x) => (x.estado === 'anulada' ? 'peligro' : undefined)}
            tarjetaMovil={(x, ctx) => (
              <ListCard
                icono={HandCoins}
                titulo={x.persona.nombre ?? t('sinNombre')}
                subtitulo={`${mesa(x)} · ${etiqueta.tipo(x.tipo)}`}
                meta={`${x.venta?.numero ?? t('tabla.manual')} · ${f.hora(x.fecha)}`}
                valor={<span className={x.estado === 'anulada' ? 'text-fg-muted line-through' : undefined}>{f.formatear(x.monto)}</span>}
                estado={badgeEstado(x)}
                acciones={accionesDe(x)}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={vacioPropinas}
            sinResultados={{ descripcion: t('vacios.sinResultados') }}
            error={{ titulo: t('vacios.error') }}
            sinPermiso={{ titulo: t('vacios.sinPermisoTitulo'), descripcion: t('vacios.sinPermisoDescripcion') }}
            onLimpiarFiltros={l.limpiarTodo}
            onReintentar={recargar}
            termino={l.busqueda}
            pie={pie}
          />

          {conResumenPorPersona && (
            <Tarjeta
              titulo={t('porPersona.titulo')}
              icono={Users}
              className="hidden self-start xl:block"
              accion={
                permisos.liquidar ? (
                  <Button variant="link" className="h-auto p-0 text-sm" disabled={!!motivoLiquidar} onClick={() => setLiquidar({ ids: null })}>
                    {t('porPersona.liquidarTodos')}
                  </Button>
                ) : undefined
              }
              pie={
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg-secondary">{t('porPersona.total')}</span>
                  <span className="text-base font-semibold tabular-nums text-fg">{f.formatear(cifras?.por_persona.reduce((a, p) => a + p.monto, 0) ?? 0)}</span>
                </div>
              }
            >
              <ul className="flex flex-col gap-3">
                {cifras?.por_persona.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <AvatarIniciales nombre={p.nombre ?? '?'} tamano="md" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{p.nombre ?? t('sinNombre')}</span>
                      <span className="truncate text-xs text-fg-secondary">{[p.cargo, t('porPersona.propinas', { count: p.cantidad })].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-fg">{f.formatear(p.monto)}</span>
                      <Badge tono="advertencia" apariencia="suave" tamano="sm">
                        {t('estados.por_liquidar')}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}

      {/* Móvil: el botón grande de liquidar (Figma 1087:717068). */}
      {pestana === 'por_liquidar' && permisos.liquidar && pendientes > 0 && seleccion.size === 0 && (
        <Button className="h-12 w-full gap-2 md:hidden" disabled={!!motivoLiquidar} onClick={() => setLiquidar({ ids: null })}>
          <HandCoins aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {t('pagina.liquidarMovil', { count: pendientes, monto: f.formatear(porLiquidarMonto) })}
        </Button>
      )}

      {pestana === 'por_liquidar' && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={total}
          sustantivo={sustantivo}
          acciones={[
            {
              id: 'liquidar',
              etiqueta: t('seleccion.liquidar', { monto: f.formatear(montoElegido) }),
              icono: HandCoins,
              onClick: () => setLiquidar({ ids: [...seleccion] }),
              deshabilitada: !!motivoLiquidar,
              motivo: motivoLiquidar,
            },
            { id: 'exportar', etiqueta: t('pagina.exportar'), icono: Download, onClick: () => exportar(elegidas) },
            {
              id: 'anular',
              etiqueta: t('acciones.anularCorto'),
              icono: Ban,
              destructiva: true,
              onClick: () => {
                setErrorDialogo(null);
                setAnular(elegidas);
              },
              deshabilitada: !permisos.anular,
              motivo: motivoAnular,
            },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <LiquidarDialog
        abierto={liquidar !== null}
        onAbiertoChange={(v) => !v && setLiquidar(null)}
        sucursal={sucursalLiquidar ? { id: sucursalLiquidar, nombre: nombreSucursal } : null}
        periodo={{ desde: desde ?? f.hoy, hasta: hasta ?? f.hoy }}
        seleccionInicial={liquidar?.ids ?? null}
        personasPozo={meseros.map((m) => ({ id: m.id, nombre: m.name, cargo: null }))}
        onLiquidada={alLiquidar}
      />

      <PropinaFormDialog
        modo={formulario?.modo ?? null}
        propina={formulario?.propina}
        meseros={meseros}
        sucursalId={sucursalLiquidar}
        onAbiertoChange={(v) => !v && setFormulario(null)}
        onGuardada={recargar}
      />

      <DialogoMotivo
        abierto={anular !== null}
        onAbiertoChange={(v) => !v && !ocupado && setAnular(null)}
        titulo={
          anular && anular.length === 1
            ? t('anularV2.titulo', { monto: f.formatear(anular[0].monto) })
            : t('anularV2.tituloVarias', { count: anular?.length ?? 0, monto: f.formatear((anular ?? []).reduce((a, x) => a + x.monto, 0)) })
        }
        descripcion={
          anular && anular.length === 1
            ? t('anularV2.descripcion', {
                documento: [anular[0].venta?.numero, anular[0].venta?.mesa, anular[0].persona.nombre].filter(Boolean).join(' · ') || t('tabla.manual'),
              })
            : t('anularV2.descripcionVarias')
        }
        textoConfirmar={t('anularV2.confirmar')}
        motivosRapidos={[t('anularV2.rapidos.duplicada'), t('anularV2.rapidos.errorMonto'), t('anularV2.rapidos.devuelta'), t('anularV2.rapidos.noEra')]}
        etiquetaMotivo={t('anularV2.motivo')}
        minimo={3}
        consecuencias={[t('anularV2.consecuencia1'), t('anularV2.consecuencia2')]}
        cargando={ocupado}
        error={errorDialogo}
        icono={Ban}
        onConfirmar={confirmarAnular}
      />

      <DialogoMotivo
        abierto={sinPago !== null}
        onAbiertoChange={(v) => !v && !ocupado && setSinPago(null)}
        titulo={t('sinPagoDialogo.titulo', { monto: f.formatear(sinPago?.monto ?? 0) })}
        descripcion={t('sinPagoDialogo.descripcion')}
        textoConfirmar={t('sinPagoDialogo.confirmar')}
        motivosRapidos={[t('sinPagoDialogo.rapidos.pagadaPorFuera'), t('sinPagoDialogo.rapidos.nomina')]}
        etiquetaMotivo={t('anularV2.motivo')}
        minimo={3}
        destructiva={false}
        cargando={ocupado}
        error={errorDialogo}
        icono={CheckCircle2}
        onConfirmar={confirmarSinPago}
      />

      <DialogoMotivo
        abierto={anularLiq !== null}
        onAbiertoChange={(v) => !v && !ocupado && setAnularLiq(null)}
        titulo={t('anularLiquidacion.titulo', { codigo: anularLiq?.codigo ?? '' })}
        descripcion={t('anularLiquidacion.descripcion')}
        textoConfirmar={t('anularLiquidacion.confirmar')}
        consecuencias={[
          anularLiq?.medio === 'efectivo' ? t('anularLiquidacion.consecuenciaCaja', { monto: f.formatear(anularLiq?.total ?? 0) }) : t('anularLiquidacion.consecuenciaAsiento'),
          t('anularLiquidacion.consecuenciaPropinas'),
        ]}
        etiquetaMotivo={t('anularV2.motivo')}
        minimo={3}
        cargando={ocupado}
        error={errorDialogo}
        icono={Ban}
        onConfirmar={confirmarAnularLiq}
      />

      <p className="sr-only" aria-live="polite">
        {seleccion.size > 0 ? t('seleccion.resumen', { count: seleccion.size, monto: f.formatear(montoElegido) }) : ''}
      </p>
    </div>
  );
}
