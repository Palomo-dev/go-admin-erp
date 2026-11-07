'use client';

/**
 * Libro diario de trabajo («Asientos»), Contabilidad v2 §4.3. Figma: listo
 * `981:62898`, filtros `981:63945`, cargando `981:65037`, vacío `981:65700`,
 * sin resultados `981:66273`, error `981:66920`, sin permiso `981:67541`,
 * tableta `988:624505`, móvil `989:74744`/`989:75095`/`989:75342`.
 *
 * Paginado en el servidor (`ContabilidadService.listarLibroDiario`): antes se
 * traían todos los asientos y PostgREST los cortaba en 1.000 sin avisar.
 *
 * Acciones que tenía la página anterior y dónde quedan: ver (clic en la fila y
 * menú), publicar y descartar borradores (menú; descartar con confirmación),
 * duplicar (menú, ahora solo en manuales), crear (diálogo con las mismas
 * validaciones), buscar por número o descripción, filtrar por estado, origen y
 * «Ocultar pares revertidos», y los avisos de `AlertasContables`. Nuevas:
 * rango de fechas, cuenta, sucursal y exportar CSV.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, Check, Copy, Download, Eye, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ChipsOpcion,
  ConfirmDialog,
  DataTable,
  DateRangeButton,
  FilterChips,
  FilterPanel,
  KpiStrip,
  ListToolbar,
  PageHeader,
  Pagination,
  PanelAdaptable,
  ResultadoOperacion,
  SearchInput,
  SegmentedControl,
  SelectorCuenta,
  StatCard,
  StatusBadge,
  clasesBoton,
  etiquetaRango,
  inicioDeMes,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type RangoFechas,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { textoComprobante, esTipoComprobante, NOMBRE_COMPROBANTE } from '@/lib/finanzas/contabilidad/comprobante';
import { celdasCsv } from '@/lib/finanzas/pendientesContables';
import {
  FILTROS_VACIOS,
  GRUPOS_FILTRO,
  accionesAsiento,
  conteoFiltros,
  fuentesDeGrupos,
  numeroBuscado,
  textoBusquedaSeguro,
  type EstadoFiltro,
  type FiltrosLibro,
} from '@/lib/finanzas/contabilidad/asientosLogica';
import { grupoOrigen, type GrupoOrigen } from '@/lib/finanzas/contabilidad/origenAsiento';
import { AlertasContables } from '../AlertasContables';
import { EnlaceAsiento, MarcaReversion, OrigenAsiento, EtiquetaOrigen, useNumeroAsiento } from '../piezas';
import { NuevoAsientoDialog } from './NuevoAsientoDialog';
import {
  ContabilidadService,
  mensajeErrorAsiento,
  type ChartAccount,
  type FilaLibroDiario,
  type JournalEntry,
  type PaginaLibroDiario,
  type ResumenLibroDiario,
} from '../ContabilidadService';

const OPCIONES_TAMANO = [25, 50, 100] as const;
const LOTE_EXPORTAR = 500;
const TOPE_EXPORTAR = 10000;

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';

function esSinPermiso(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === '42501' || /permission denied|SIN_PERMISO/i.test(String(e?.message ?? ''));
}

export function AsientosPage() {
  const t = useTranslations('finanzasContabilidadR3.asientos');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const to = useTranslations('finanzasContabilidadR3.comun.origen');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const { branches } = useBranch();
  const permisos = usePermisosFinanzas();
  const numero = useNumeroAsiento();

  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [iniciado, setIniciado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // `?estado=borrador` llega de Periodos (borradores del mes) y del Inicio de Contabilidad.
  const [filtros, setFiltros] = useState<FiltrosLibro>(() => ({ ...FILTROS_VACIOS, estado: estadoDeUrl(searchParams?.get('estado')) }));
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [datos, setDatos] = useState<PaginaLibroDiario | null>(null);
  const [resumen, setResumen] = useState<ResumenLibroDiario | null>(null);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [centros, setCentros] = useState<{ id: string; code: string; name: string }[]>([]);
  const [distribuciones, setDistribuciones] = useState<{ id: string; nombre: string }[]>([]);
  const [dialogo, setDialogo] = useState(false);
  const [descartar, setDescartar] = useState<FilaLibroDiario | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState<{ asiento: JournalEntry; publicado: boolean } | null>(null);
  const consulta = useRef(0);

  // Rango por defecto: el mes en curso de la organización (cuando ya se sabe su zona).
  useEffect(() => {
    if (tzLoading || iniciado) return;
    const hoy = getToday();
    setRango({ desde: inicioDeMes(hoy), hasta: hoy });
    setIniciado(true);
  }, [tzLoading, iniciado, getToday]);

  // «Nuevo asiento» desde el inicio de Contabilidad o el buscador: abre y limpia la URL.
  useEffect(() => {
    if (searchParams?.get('action') !== 'new') return;
    setDialogo(true);
    const q = new URLSearchParams(searchParams.toString());
    q.delete('action');
    const resto = q.toString();
    router.replace(resto ? `${pathname}?${resto}` : pathname ?? '/app/finanzas/contabilidad/asientos');
  }, [searchParams, router, pathname]);

  useEffect(() => {
    Promise.all([
      ContabilidadService.obtenerPlanCuentas(),
      ContabilidadService.listarCentrosCosto().catch(() => [] as { id: string; code: string; name: string }[]),
      ContabilidadService.listarDistribuciones(),
    ])
      .then(([plan, cc, dist]) => {
        setCuentas(plan.filter((c) => c.is_active));
        setCentros(cc);
        setDistribuciones(dist);
      })
      .catch((error) => console.error('Error cargando el plan de cuentas:', error));
  }, []);

  const texto = textoBusquedaSeguro(busqueda);
  const consultaFiltros = useMemo(
    () => ({
      desde: rango?.desde ?? null,
      hasta: rango?.hasta ?? null,
      estado: filtros.estado,
      fuentes: fuentesDeGrupos(filtros.grupos),
      cuenta: filtros.cuenta,
      branchId: filtros.sucursalId,
      texto,
      numero: numeroBuscado(busqueda),
      ocultarPares: filtros.ocultarPares,
    }),
    [rango, filtros, texto, busqueda],
  );

  const cargar = useCallback(async () => {
    if (!iniciado) return;
    const turno = ++consulta.current;
    setEstado('cargando');
    try {
      const pag = await ContabilidadService.listarLibroDiario({ ...consultaFiltros, limite: tamano, desplazamiento: (pagina - 1) * tamano });
      if (turno !== consulta.current) return;
      setDatos(pag);
      setEstado('listo');
    } catch (error) {
      if (turno !== consulta.current) return;
      console.error('No se pudo consultar el libro diario:', error);
      setDatos(null);
      setEstado(esSinPermiso(error) ? 'sinPermiso' : 'error');
    }
  }, [iniciado, consultaFiltros, pagina, tamano]);

  const cargarResumen = useCallback(async () => {
    if (!iniciado) return;
    try {
      setResumen(await ContabilidadService.resumenLibroDiario(rango?.desde ?? null, rango?.hasta ?? null));
    } catch (error) {
      console.error('No se pudo calcular el resumen del libro diario:', error);
      setResumen(null);
    }
  }, [iniciado, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => {
    void cargarResumen();
  }, [cargarResumen]);

  const recargar = () => {
    void cargar();
    void cargarResumen();
  };

  const nombreSucursal = useCallback((id: number | null | undefined) => branches.find((b) => b.id === id)?.name ?? '—', [branches]);

  const publicar = async (asiento: FilaLibroDiario) => {
    setProcesando(true);
    try {
      await ContabilidadService.publicarAsiento(asiento.id);
      toast.success(t('toast.publicado', { numero: numero(asiento.id) }));
      recargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.errorPublicar'));
    } finally {
      setProcesando(false);
    }
  };

  const duplicar = async (asiento: FilaLibroDiario) => {
    setProcesando(true);
    try {
      const copia = await ContabilidadService.duplicarAsiento(asiento.id);
      toast.success(t('toast.duplicado', { numero: numero(copia.id) }));
      router.push(`/app/finanzas/contabilidad/asientos/${copia.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.errorDuplicar'));
    } finally {
      setProcesando(false);
    }
  };

  const confirmarDescarte = async () => {
    if (!descartar) return;
    setProcesando(true);
    try {
      await ContabilidadService.eliminarAsiento(descartar.id);
      toast.success(t('toast.descartado'));
      setDescartar(null);
      recargar();
    } catch (error) {
      toast.error(mensajeErrorAsiento(error instanceof Error ? error : null));
    } finally {
      setProcesando(false);
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const filas: FilaLibroDiario[] = [];
      for (;;) {
        const lote = await ContabilidadService.listarLibroDiario({ ...consultaFiltros, limite: LOTE_EXPORTAR, desplazamiento: filas.length });
        filas.push(...lote.filas);
        if (lote.filas.length + lote.paresOcultos === 0 || filas.length + lote.paresOcultos >= lote.total || filas.length >= TOPE_EXPORTAR) break;
      }
      const encabezado = ['numero', 'fecha', 'descripcion', 'origen', 'documento', 'sucursal', 'importe', 'estado'].map((c) => t(`csv.${c}`));
      const lineas = filas.map((asiento) =>
        [
          asiento.id,
          formatDate(asiento.entry_date),
          asiento.memo ?? '',
          to(grupoOrigen(asiento.source)),
          asiento.source_id ?? '',
          nombreSucursal(asiento.branch_id),
          asiento.importe,
          asiento.posted ? t('estado.publicado') : t('estado.borrador'),
        ]
          .map(celdasCsv)
          .join(','),
      );
      const contenido = `﻿${[encabezado.map(celdasCsv).join(','), ...lineas].join('\n')}`;
      const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = t('csv.archivo');
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo exportar el libro diario:', error);
      toast.error(t('csv.error'));
    } finally {
      setExportando(false);
    }
  };

  const accionesFila = (asiento: FilaLibroDiario): AccionFila[] => {
    const a = accionesAsiento(asiento);
    const lista: AccionFila[] = [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(`/app/finanzas/contabilidad/asientos/${asiento.id}`) },
    ];
    if (a.publicar) lista.push({ id: 'publicar', etiqueta: t('acciones.publicar'), icono: Check, onSelect: () => void publicar(asiento), deshabilitada: procesando });
    if (a.duplicar) lista.push({ id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(asiento), deshabilitada: procesando });
    if (a.descartar) lista.push({ id: 'descartar', etiqueta: t('acciones.descartar'), icono: Trash2, onSelect: () => setDescartar(asiento), destructiva: true });
    return lista;
  };

  const columnas = useMemo<ColumnaTabla<FilaLibroDiario>[]>(
    () => [
      {
        id: 'numero',
        encabezado: t('columnas.numero'),
        ancho: 96,
        celda: (asiento) => <EnlaceAsiento id={asiento.id} className={asiento.source === 'reversal' ? 'text-fg-secondary' : undefined} />,
      },
      { id: 'fecha', encabezado: t('columnas.fecha'), ancho: 120, celda: (asiento) => <span className="whitespace-nowrap">{formatDate(asiento.entry_date)}</span> },
      {
        id: 'descripcion',
        encabezado: t('columnas.descripcion'),
        celda: (asiento) => {
          const comprobante = textoComprobante(asiento.comprobante_prefijo, asiento.comprobante_numero);
          return (
            <span className={asiento.source === 'reversal' ? 'text-fg-secondary' : 'text-fg'}>
              <span className="line-clamp-2 break-words">{asiento.memo || '—'}</span>
              {comprobante && (
                <span className="mt-0.5 block text-xs text-fg-muted">
                  {esTipoComprobante(asiento.comprobante_tipo) ? NOMBRE_COMPROBANTE[asiento.comprobante_tipo] : t('comprobante')} {comprobante}
                </span>
              )}
            </span>
          );
        },
      },
      { id: 'origen', encabezado: t('columnas.origen'), celda: (asiento) => <OrigenAsiento source={asiento.source} sourceId={asiento.source_id} /> },
      { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'xl', celda: (asiento) => nombreSucursal(asiento.branch_id) },
      { id: 'importe', encabezado: t('columnas.importe'), variante: 'importe', alinear: 'derecha', celda: (asiento) => formatear(asiento.importe) },
      {
        id: 'estado',
        encabezado: t('columnas.estado'),
        celda: (asiento) => (
          <span className="flex flex-wrap gap-1">
            <StatusBadge estado={asiento.posted ? 'publicado' : 'borrador'} etiqueta={asiento.posted ? t('estado.publicado') : t('estado.borrador')} />
            {asiento.revertidoPor && <MarcaReversion rol="revertido" numero={asiento.revertidoPor} />}
            {asiento.source === 'reversal' && Number(asiento.source_id) > 0 && <MarcaReversion rol="contraAsiento" numero={Number(asiento.source_id)} />}
          </span>
        ),
      },
    ],
    [t, formatDate, formatear, nombreSucursal],
  );

  const nFiltros = conteoFiltros(filtros);
  const hayCriterio = nFiltros > 0 || !!texto;
  const estadoTabla = estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : estado === 'sinPermiso' ? 'sinPermiso' : datos?.filas.length ? 'listo' : hayCriterio ? 'sinResultados' : 'vacio';
  const cuentaFiltro = filtros.cuenta ? cuentas.find((c) => c.account_code === filtros.cuenta) : null;
  const buscarCuenta = useCallback(
    async (q: string, desde: number) => {
      const s = q.trim().toLowerCase();
      const todas = s ? cuentas.filter((c) => c.account_code.startsWith(s) || c.name.toLowerCase().includes(s)) : cuentas;
      return { items: todas.slice(desde, desde + 50).map((c) => ({ account_code: c.account_code, name: c.name })), total: todas.length };
    },
    [cuentas],
  );

  const chips: ChipFiltro[] = [];
  if (filtros.estado !== 'todos') chips.push({ clave: 'estado', etiqueta: t('chips.estado', { valor: t(`filtros.estados.${filtros.estado}`) }) });
  if (filtros.grupos.length) chips.push({ clave: 'grupos', etiqueta: t('chips.origen', { valor: filtros.grupos.map((g) => to(g)).join(', ') }) });
  if (filtros.cuenta) chips.push({ clave: 'cuenta', etiqueta: t('chips.cuenta', { valor: filtros.cuenta }) });
  if (filtros.sucursalId) chips.push({ clave: 'sucursalId', etiqueta: t('chips.sucursal', { valor: nombreSucursal(filtros.sucursalId) }) });
  if (filtros.ocultarPares) chips.push({ clave: 'ocultarPares', etiqueta: t('filtros.ocultarPares') });

  const cambiarFiltros = (cambio: Partial<FiltrosLibro>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...cambio }));
  };
  const quitarChip = (clave: string) => cambiarFiltros({ [clave]: FILTROS_VACIOS[clave as keyof FiltrosLibro] } as Partial<FiltrosLibro>);

  const puedeCrear = permisos.crear;
  const motivoCrear = !puedeCrear && !permisos.cargando ? t('sinPermisoCrear') : undefined;
  const totalLibro = resumen ? resumen.asientos + resumen.contraAsientos : null;
  const cargandoResumen = resumen === null && estado === 'cargando';
  const rangoTexto = rango ? etiquetaRango(rango, locale) : t('todoElLibro');

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        icono={BookOpen}
        subtitulo={totalLibro === null ? t('subtituloCorto') : t('subtitulo', { asientos: resumen?.asientos ?? 0, contra: resumen?.contraAsientos ?? 0 })}
        migas={[
          { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: tc('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        acciones={
          <>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              onClick={() => void exportar()}
              disabled={exportando || estado !== 'listo' || !datos?.filas.length}
            >
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar')}
            </button>
            <button
              type="button"
              className={clasesBoton({ variante: 'primario' })}
              onClick={() => setDialogo(true)}
              disabled={!!motivoCrear}
              title={motivoCrear}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevoAsiento')}
            </button>
          </>
        }
      />

      <AlertasContables />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.asientos')}
          valor={resumen ? resumen.asientos.toLocaleString(locale) : '—'}
          detalle={resumen ? t('kpis.asientosDetalle', { n: resumen.contraAsientos }) : rangoTexto}
          cargando={cargandoResumen}
        />
        <StatCard
          etiqueta={t('kpis.movimiento')}
          valor={resumen ? formatear(resumen.movimiento) : '—'}
          detalle={t('kpis.movimientoDetalle')}
          cargando={cargandoResumen}
        />
        <StatCard
          etiqueta={t('kpis.borradores')}
          valor={resumen ? resumen.borradores.toLocaleString(locale) : '—'}
          detalle={t('kpis.borradoresDetalle')}
          tono={resumen && resumen.borradores > 0 ? 'advertencia' : undefined}
          onClick={resumen && resumen.borradores > 0 ? () => cambiarFiltros({ estado: 'borradores' }) : undefined}
          cargando={cargandoResumen}
        />
        <StatCard etiqueta={t('kpis.rango')} valor={rangoTexto} detalle={t('kpis.rangoDetalle')} cargando={!iniciado} />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={(v) => {
              setPagina(1);
              setBusqueda(v);
            }}
            placeholder={t('buscar')}
          />
        }
        filtros={
          <div className="flex flex-wrap gap-2">
            {rango ? (
              <DateRangeButton
                valor={rango}
                hoy={getToday()}
                onValorChange={(r) => {
                  setPagina(1);
                  setRango(r);
                }}
                onLimpiar={() => {
                  setPagina(1);
                  setRango(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario' })}
                onClick={() => {
                  const hoy = getToday();
                  setRango({ desde: inicioDeMes(hoy), hasta: hoy });
                }}
              >
                {t('todoElLibro')}
              </button>
            )}
            <FilterPanel
              conteo={nFiltros}
              onLimpiar={() => cambiarFiltros(FILTROS_VACIOS)}
              textoVerResultados={datos ? t('filtros.ver', { n: datos.total }) : undefined}
            >
              <div className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-fg">{t('filtros.origen')}</legend>
                  <ChipsOpcion<GrupoOrigen>
                    multiple
                    etiqueta={t('filtros.origen')}
                    valor={filtros.grupos}
                    onValorChange={(grupos) => cambiarFiltros({ grupos })}
                    opciones={GRUPOS_FILTRO.map((g) => ({ valor: g, etiqueta: to(g) }))}
                  />
                </fieldset>
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-fg">{t('filtros.estado')}</span>
                  <SegmentedControl<EstadoFiltro>
                    etiqueta={t('filtros.estado')}
                    valor={filtros.estado}
                    onValorChange={(estadoFiltro) => cambiarFiltros({ estado: estadoFiltro })}
                    opciones={(['todos', 'publicados', 'borradores'] as const).map((v) => ({ valor: v, etiqueta: t(`filtros.estados.${v}`) }))}
                  />
                </div>
                <div className="space-y-2">
                  <SelectorCuenta
                    etiqueta={t('filtros.cuenta')}
                    valor={cuentaFiltro ? { account_code: cuentaFiltro.account_code, name: cuentaFiltro.name } : null}
                    buscar={buscarCuenta}
                    onCambiar={(c) => cambiarFiltros({ cuenta: c.account_code })}
                  />
                  {filtros.cuenta && (
                    <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => cambiarFiltros({ cuenta: null })}>
                      {t('filtros.quitarCuenta')}
                    </button>
                  )}
                </div>
                {branches.length > 1 && (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-fg">{t('filtros.sucursal')}</legend>
                    <ChipsOpcion<string>
                      etiqueta={t('filtros.sucursal')}
                      valor={filtros.sucursalId ? String(filtros.sucursalId) : 'todas'}
                      onValorChange={(v) => cambiarFiltros({ sucursalId: v === 'todas' ? null : Number(v) })}
                      opciones={[{ valor: 'todas', etiqueta: t('filtros.todasSucursales') }, ...branches.map((b) => ({ valor: String(b.id), etiqueta: b.name }))]}
                    />
                  </fieldset>
                )}
                <label className="flex items-start gap-3">
                  <Switch checked={filtros.ocultarPares} onCheckedChange={(v) => cambiarFiltros({ ocultarPares: v })} />
                  <span>
                    <span className="block text-sm font-medium text-fg">{t('filtros.ocultarPares')}</span>
                    <span className="block text-xs text-fg-secondary">{t('filtros.ocultarParesAyuda')}</span>
                  </span>
                </label>
              </div>
            </FilterPanel>
          </div>
        }
        chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={() => cambiarFiltros(FILTROS_VACIOS)} /> : undefined}
      />

      {datos && datos.paresOcultos > 0 && <p className="text-sm text-fg-secondary">{t('paresOcultos', { n: datos.paresOcultos })}</p>}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={datos?.filas ?? []}
        obtenerId={(asiento) => String(asiento.id)}
        estado={estadoTabla}
        termino={busqueda}
        onFilaClick={(asiento) => router.push(`/app/finanzas/contabilidad/asientos/${asiento.id}`)}
        etiquetaFila={(asiento) => t('etiquetaFila', { numero: numero(asiento.id) })}
        acciones={accionesFila}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          setBusqueda('');
          cambiarFiltros(FILTROS_VACIOS);
        }}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          accion: puedeCrear ? { etiqueta: t('nuevoAsiento'), onClick: () => setDialogo(true), icono: Plus } : undefined,
        }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        tarjetaMovil={(asiento) => (
          <TarjetaAsiento asiento={asiento} fecha={formatDate(asiento.entry_date)} importe={formatear(asiento.importe)} onAbrir={() => router.push(`/app/finanzas/contabilidad/asientos/${asiento.id}`)} />
        )}
        pie={
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={datos?.total ?? 0}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setPagina(1);
              setTamano(n);
            }}
            opcionesTamano={OPCIONES_TAMANO}
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            cargando={estado === 'cargando'}
          />
        }
      />

      <NuevoAsientoDialog
        abierto={dialogo}
        onAbiertoChange={setDialogo}
        cuentas={cuentas}
        centros={centros}
        distribuciones={distribuciones}
        onCreado={(asiento, publicado) => {
          setDialogo(false);
          setResultado({ asiento, publicado });
          recargar();
        }}
      />

      <ConfirmDialog
        abierto={!!descartar}
        onAbiertoChange={(v) => !v && setDescartar(null)}
        titulo={t('descartar.titulo', { numero: descartar ? numero(descartar.id) : '' })}
        descripcion={t('descartar.descripcion')}
        textoConfirmar={t('descartar.confirmar')}
        tono="peligro"
        cargando={procesando}
        onConfirmar={confirmarDescarte}
      />

      <PanelAdaptable
        abierto={!!resultado}
        onAbiertoChange={(v) => !v && setResultado(null)}
        titulo={resultado?.publicado ? t('resultado.tituloPublicado') : t('resultado.tituloBorrador')}
        ancho={520}
      >
        {resultado && (
          <ResultadoOperacion
            titulo={resultado.publicado ? t('resultado.publicado', { numero: numero(resultado.asiento.id) }) : t('resultado.borrador', { numero: numero(resultado.asiento.id) })}
            descripcion={resultado.asiento.memo ?? undefined}
            primaria={{ etiqueta: t('resultado.ver'), onClick: () => router.push(`/app/finanzas/contabilidad/asientos/${resultado.asiento.id}`) }}
            secundarias={[
              {
                etiqueta: t('resultado.otro'),
                onClick: () => {
                  setResultado(null);
                  setDialogo(true);
                },
              },
            ]}
            onCerrar={() => setResultado(null)}
            textoCerrar={t('resultado.cerrar')}
            atajoCerrar={false}
          />
        )}
      </PanelAdaptable>
    </div>
  );
}

/** Figma «Móvil / Libro diario — listo» `989:74744`. */
function TarjetaAsiento({ asiento, fecha, importe, onAbrir }: { asiento: FilaLibroDiario; fecha: string; importe: string; onAbrir: () => void }) {
  const t = useTranslations('finanzasContabilidadR3.asientos');
  const numero = useNumeroAsiento();
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <button type="button" onClick={onAbrir} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-brand">{numero(asiento.id)}</span>
          <span className="font-semibold tabular-nums text-fg">{importe}</span>
        </span>
        <span className="mt-0.5 block text-sm text-fg-secondary">{fecha}</span>
        <span className="mt-1 line-clamp-2 block text-sm text-fg">{asiento.memo || '—'}</span>
      </button>
      <div className="flex flex-wrap items-center gap-1">
        <EtiquetaOrigen source={asiento.source} />
        <StatusBadge estado={asiento.posted ? 'publicado' : 'borrador'} etiqueta={asiento.posted ? t('estado.publicado') : t('estado.borrador')} />
        {asiento.revertidoPor && <MarcaReversion rol="revertido" numero={asiento.revertidoPor} />}
        {asiento.source === 'reversal' && Number(asiento.source_id) > 0 && <MarcaReversion rol="contraAsiento" numero={Number(asiento.source_id)} />}
      </div>
    </div>
  );
}

/** Estado del libro pedido por la URL (`borrador`, `borradores`, `publicados`). */
function estadoDeUrl(valor: string | null | undefined): EstadoFiltro {
  if (valor === 'borrador' || valor === 'borradores') return 'borradores';
  if (valor === 'publicado' || valor === 'publicados') return 'publicados';
  return 'todos';
}
