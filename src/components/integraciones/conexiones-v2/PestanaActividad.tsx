'use client';

/**
 * Actividad (diseño 85-14): eventos de `integration_events` de todas las conexiones, con chips
 * rápidos Todas · Con error · por conexión · Hoy, y los filtros finos de la barra («Filtros»:
 * conexión, resultado, sentido, fechas). Todo en la URL (`useListadoServidor`), paginado en el
 * servidor como la página vieja de Eventos (25 · 50 · 100). El panel de detalle explica el error,
 * lleva a las credenciales y, a pedido, muestra el cuerpo completo del evento (lo que hacía la
 * página vieja `/eventos/[id]`: copiar el id, descargar el JSON). `?evento=<id>` lo abre directo.
 * En celular el detalle es una hoja y la tabla pasa a tarjetas. Fechas en la zona de la organización.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import {
  ChipsOpcion,
  DataTable,
  FilaDato,
  ListCard,
  ListaDatos,
  Pagination,
  PanelAdaptable,
  StatusBadge,
  clasesBoton,
  useEsEscritorio,
  useParametrosUrl,
  type ColumnaTabla,
  type EstadoTabla,
  type ListadoServidor,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, nextPlainDay } from '@/lib/utils/dateDisplay';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { guardarArchivo } from '@/lib/documents/cliente';
import { apiConexiones, type ConexionResumen, type EventoCompleto, type EventoResumen } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { LogoServicio } from './logos';
import { claveTipoEvento, codigoErrorEvento, resultadoEvento } from './presentacion';
import { cambiosPorFiltroRapido, filtroRapidoDeUrl, type FiltroRapidoActividad } from './filtrosConexiones';

export interface PestanaActividadProps {
  conexiones: ConexionResumen[];
  listado: ListadoServidor;
  nombreConexion: (id: string) => string;
  /** Contador que la cabecera incrementa para exportar la página actual a CSV. */
  exportar: number;
  /** Total de eventos del filtro actual (la cabecera deshabilita «Exportar» si es 0) y errores de 30 días (subtítulo). */
  onTotal: (total: number, errores30d: number) => void;
}

export function PestanaActividad({ conexiones, listado, nombreConexion, exportar, onTotal }: PestanaActividadProps) {
  const t = useTranslations('integracionesConexiones');
  const url = useParametrosUrl();
  const { formatTime, formatDate, formatDateTime, getToday, toDate, toInstant } = useFormatDate();
  const esEscritorio = useEsEscritorio();
  const [eventos, setEventos] = useState<EventoResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [totalErrores, setTotalErrores] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventoUrl = url.leer('evento');
  const [elegido, setElegido] = useState<EventoResumen | null>(null);

  const f = listado.filtros;
  const filtroRapido = filtroRapidoDeUrl(f);
  const hoy = getToday();

  /** Periodo (hoy · 7 días · 30 días) → instantes ISO en la zona de la organización. */
  const rango = useMemo(() => {
    const dias = f.periodo === 'hoy' ? 1 : f.periodo === '7d' ? 7 : f.periodo === '30d' ? 30 : 0;
    if (!dias) return { desde: null, hasta: null };
    const desdeDia = addPlainDays(hoy, 1 - dias);
    return {
      desde: toInstant(desdeDia, '00:00'),
      hasta: new Date(Date.parse(toInstant(nextPlainDay(hoy), '00:00')) - 1).toISOString(),
    };
  }, [f.periodo, hoy, toInstant]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiConexiones.eventos({
        errores: f.errores === '1',
        conexion: f.conexion || null,
        estado: f.estado || null,
        sentido: f.sentido === 'inbound' || f.sentido === 'outbound' ? f.sentido : null,
        soloWebhooks: f.webhooks === '1',
        soloPruebas: f.pruebas === '1',
        desde: rango.desde,
        hasta: rango.hasta,
        q: listado.busqueda || null,
        pagina: listado.pagina,
        tamano: listado.tamano,
      });
      setEventos(r.eventos);
      setTotal(r.total);
      setTotalErrores(r.errores);
      onTotal(r.total, r.errores);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [f.errores, f.conexion, f.estado, f.sentido, f.webhooks, f.pruebas, rango, listado.busqueda, listado.pagina, listado.tamano, onTotal, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // `?evento=<id>` (enlace viejo `/eventos/[id]` o compartido): abre el detalle aunque no esté en la página.
  useEffect(() => {
    if (!eventoUrl) return;
    const enPagina = eventos.find((e) => e.id === eventoUrl);
    if (enPagina) {
      setElegido(enPagina);
      return;
    }
    let vigente = true;
    apiConexiones
      .evento(eventoUrl)
      .then((e) => vigente && setElegido(e))
      .catch(() => vigente && toast.error(t('actividad.detalle.noEncontrado')));
    return () => {
      vigente = false;
    };
  }, [eventoUrl, eventos, t]);

  const elegir = (e: EventoResumen | null) => {
    setElegido(e);
    url.fijar({ evento: e?.id ?? null }, 'replace');
  };

  const porId = useMemo(() => new Map(conexiones.map((c) => [c.id, c])), [conexiones]);
  const tipoEvento = useCallback(
    (e: EventoResumen) => {
      const clave = claveTipoEvento(e.tipo);
      return clave ? t(`actividad.tipos.${clave}`) : e.tipo;
    },
    [t],
  );

  const opciones = [
    { valor: 'todas' as FiltroRapidoActividad, etiqueta: t('actividad.filtro.todas') },
    { valor: 'errores' as FiltroRapidoActividad, etiqueta: t('actividad.filtro.conError', { n: totalErrores }) },
    ...conexiones.slice(0, 8).map((c) => ({ valor: `c:${c.id}` as FiltroRapidoActividad, etiqueta: nombreConexion(c.id) })),
    { valor: 'hoy' as FiltroRapidoActividad, etiqueta: t('actividad.filtro.hoy') },
  ];

  const hora = (iso: string) => (toDate(new Date(iso)) === hoy ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`);

  const badge = (e: EventoResumen) => {
    const r = resultadoEvento(e);
    return <StatusBadge estado={r.clave} etiqueta={t(`actividad.resultado.${r.clave}`)} tono={r.tono} />;
  };

  const columnas: ColumnaTabla<EventoResumen>[] = [
    { id: 'hora', encabezado: t('actividad.col.hora'), celda: (e) => hora(e.creado), ancho: 140 },
    {
      id: 'conexion',
      encabezado: t('actividad.col.conexion'),
      celda: (e) => (
        <span className="flex items-center gap-2">
          <LogoServicio id={porId.get(e.conexionId)?.proveedor ?? 'x'} tamano="sm" />
          <span className="truncate">{nombreConexion(e.conexionId)}</span>
        </span>
      ),
      ocultarDebajo: 'md',
    },
    {
      id: 'evento',
      encabezado: t('actividad.col.evento'),
      celda: (e) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{tipoEvento(e)}</p>
          {e.referencia && <p className="truncate text-xs text-fg-muted">{t('actividad.referencia', { ref: e.referencia })}</p>}
        </div>
      ),
    },
    { id: 'sentido', encabezado: t('actividad.col.sentido'), celda: (e) => t(`actividad.sentido.${e.sentido}`), ocultarDebajo: 'lg' },
    { id: 'resultado', encabezado: t('actividad.col.resultado'), celda: badge },
  ];

  // Exportar CSV (la página vieja de Eventos lo tenía): la página cargada con los filtros actuales.
  useEffect(() => {
    if (exportar === 0 || eventos.length === 0) return;
    const csv = aCsv([
      [t('actividad.col.hora'), t('actividad.col.conexion'), t('actividad.col.evento'), t('actividad.col.sentido'), t('actividad.col.resultado'), t('actividad.detalle.referencia'), t('actividad.detalle.id')],
      ...eventos.map((e) => [formatDateTime(e.creado), nombreConexion(e.conexionId), tipoEvento(e), t(`actividad.sentido.${e.sentido}`), t(`actividad.resultado.${resultadoEvento(e).clave}`), e.referencia ?? '', e.id]),
    ]);
    descargarCsv(t('actividad.archivoExportacion'), csv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportar]);

  const estado: EstadoTabla = cargando ? 'cargando' : error ? 'error' : eventos.length === 0 ? (listado.hayCriterios || filtroRapido !== 'todas' ? 'sinResultados' : 'vacio') : 'listo';

  const detalle = elegido && (
    <DetalleEvento
      evento={elegido}
      conexion={porId.get(elegido.conexionId) ?? null}
      nombre={nombreConexion(elegido.conexionId)}
      tipo={tipoEvento(elegido)}
      fecha={formatDateTime(elegido.creado)}
    />
  );

  const pie = (
    <Pagination
      pagina={listado.pagina}
      tamano={listado.tamano}
      total={total}
      onPaginaChange={listado.setPagina}
      onTamanoChange={listado.setTamano}
      opcionesTamano={[20, 50, 100]}
      sustantivo={{ singular: t('actividad.sustantivo.singular'), plural: t('actividad.sustantivo.plural') }}
      cargando={cargando}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible">
        <ChipsOpcion<FiltroRapidoActividad>
          opciones={opciones}
          valor={filtroRapido}
          onValorChange={(v) => {
            listado.actualizar({ filtros: { ...f, ...sinNulos(cambiosPorFiltroRapido(v)) } });
            setElegido(null);
          }}
          etiqueta={t('actividad.filtro.aria')}
          className="w-max flex-nowrap sm:w-auto sm:flex-wrap"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          etiqueta={t('actividad.tabla')}
          columnas={columnas}
          filas={eventos}
          obtenerId={(e) => e.id}
          estado={estado}
          onFilaClick={elegir}
          etiquetaFila={(e) => `${nombreConexion(e.conexionId)} · ${tipoEvento(e)}`}
          tonoFila={(e) => (e.estado === 'error' ? 'peligro' : undefined)}
          // Celular (85-52): logo, tipo de evento, resultado, «conexión · referencia · sentido» y hora.
          tarjetaMovil={(e) => (
            <ListCard
              miniatura={<LogoServicio id={porId.get(e.conexionId)?.proveedor ?? 'x'} titulo={nombreConexion(e.conexionId)} />}
              titulo={tipoEvento(e)}
              subtitulo={[nombreConexion(e.conexionId), e.referencia ? t('actividad.referencia', { ref: e.referencia }) : null, t(`actividad.sentido.${e.sentido}`)].filter(Boolean).join(' · ')}
              meta={hora(e.creado)}
              estado={badge(e)}
              onClick={() => elegir(e)}
            />
          )}
          termino={listado.busqueda}
          onLimpiarFiltros={() => {
            listado.limpiarTodo();
            setElegido(null);
          }}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('actividad.vacioTitulo'), descripcion: t('actividad.vacioTexto') }}
          pie={pie}
        />
        {esEscritorio ? (
          <aside aria-label={t('actividad.detalle.titulo')} className="hidden self-start rounded-xl border border-line bg-surface p-4 lg:block">
            <h2 className="mb-3 text-base font-semibold text-fg">{t('actividad.detalle.titulo')}</h2>
            {detalle || <p className="text-sm text-fg-secondary">{t('actividad.detalle.elige')}</p>}
          </aside>
        ) : (
          elegido && (
            <PanelAdaptable abierto onAbiertoChange={(v) => !v && elegir(null)} titulo={t('actividad.detalle.titulo')}>
              {detalle}
            </PanelAdaptable>
          )
        )}
      </div>
    </div>
  );
}

/** `null` → `''` para que `escribirEstadoListado` quite la clave de la URL. */
function sinNulos(cambios: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v ?? '']));
}

function DetalleEvento({ evento, conexion, nombre, tipo, fecha }: { evento: EventoResumen; conexion: ConexionResumen | null; nombre: string; tipo: string; fecha: string }) {
  const t = useTranslations('integracionesConexiones');
  const { formatDateTime } = useFormatDate();
  const codigo = codigoErrorEvento(evento.error);
  const ambiente = conexion ? (conexion.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas')) : null;
  const [completo, setCompleto] = useState<EventoCompleto | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [verDatos, setVerDatos] = useState(false);

  useEffect(() => {
    setCompleto(null);
    setVerDatos(false);
  }, [evento.id]);

  const cargarCompleto = async (): Promise<EventoCompleto | null> => {
    if (completo) return completo;
    setCargandoDatos(true);
    try {
      const e = await apiConexiones.evento(evento.id);
      setCompleto(e);
      return e;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('comun.errorCarga'));
      return null;
    } finally {
      setCargandoDatos(false);
    }
  };

  const alternarDatos = async () => {
    if (verDatos) {
      setVerDatos(false);
      return;
    }
    if (await cargarCompleto()) setVerDatos(true);
  };

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(evento.id);
      toast.success(t('comun.copiado'));
    } catch {
      toast.error(t('actividad.detalle.noCopiado'));
    }
  };

  const descargarJson = async () => {
    const e = await cargarCompleto();
    if (!e) return;
    guardarArchivo(new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' }), `evento-${e.id}.json`);
  };

  return (
    <div className="flex flex-col gap-4">
      {evento.estado === 'error' && (
        <div role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3">
          <p className="text-sm font-semibold text-danger-text">{t(`actividad.explicacion.${codigo ?? 'otro'}.titulo`)}</p>
          <p className="mt-1 text-sm text-danger-text">{t(`actividad.explicacion.${codigo ?? 'otro'}.texto`)}</p>
          {codigo === 'otro' && evento.error && <p className="mt-1 break-words text-xs text-danger-text">{evento.error}</p>}
        </div>
      )}
      <ListaDatos etiqueta={t('actividad.detalle.titulo')}>
        <FilaDato etiqueta={t('actividad.detalle.conexion')} valor={ambiente ? `${nombre} · ${ambiente}` : nombre} />
        <FilaDato etiqueta={t('actividad.detalle.fecha')} valor={fecha} />
        <FilaDato etiqueta={t('actividad.detalle.evento')} valor={tipo} />
        <FilaDato etiqueta={t('actividad.detalle.sentido')} valor={t(`actividad.sentido.${evento.sentido}`)} />
        {evento.origen && <FilaDato etiqueta={t('actividad.detalle.origen')} valor={evento.origen} />}
        {evento.referencia && <FilaDato etiqueta={t('actividad.detalle.referencia')} valor={evento.referencia} />}
        {completo?.procesado && <FilaDato etiqueta={t('actividad.detalle.procesado')} valor={formatDateTime(completo.procesado)} />}
        <FilaDato
          etiqueta={t('actividad.detalle.id')}
          valor={
            <span className="flex items-center justify-end gap-1">
              <code className="truncate font-mono text-xs">{evento.id}</code>
              <button type="button" aria-label={t('actividad.detalle.copiarId')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => void copiarId()}>
                <Copy aria-hidden="true" className="size-4" />
              </button>
            </span>
          }
        />
      </ListaDatos>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void alternarDatos()} aria-expanded={verDatos} aria-busy={cargandoDatos || undefined} disabled={cargandoDatos}>
          {verDatos ? t('actividad.detalle.ocultarDatos') : t('actividad.detalle.verDatos')}
        </button>
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => void descargarJson()} disabled={cargandoDatos}>
          <Download aria-hidden="true" className="size-4" />
          {t('actividad.detalle.descargarJson')}
        </button>
        {evento.estado === 'error' && (
          <Link href={`/app/integraciones/conexiones/${evento.conexionId}`} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
            {t('actividad.detalle.irCredenciales')}
          </Link>
        )}
      </div>
      {verDatos && completo && (
        <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-subtle p-3 font-mono text-xs leading-5 text-fg" aria-label={t('actividad.detalle.datos')}>
          {JSON.stringify(completo.datos, null, 2)}
        </pre>
      )}
    </div>
  );
}
