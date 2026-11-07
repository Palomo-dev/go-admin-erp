'use client';

/**
 * Actividad (diseño 85-14): eventos de `integration_events` de todas las conexiones (sin payload),
 * con chips Todas · Con error · por conexión · Hoy y un panel de detalle que explica el error y
 * lleva a las credenciales. En móvil el detalle es una hoja. Fechas en la zona de la organización.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChipsOpcion, DataTable, FilaDato, ListaDatos, PanelAdaptable, StatusBadge, clasesBoton, useEsEscritorio, useParametrosUrl, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { apiConexiones, type ConexionResumen, type EventoResumen } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { LogoServicio } from './logos';
import { claveTipoEvento, codigoErrorEvento, resultadoEvento } from './presentacion';

type Filtro = 'todas' | 'errores' | 'hoy' | `c:${string}`;

export function PestanaActividad({ conexiones, busqueda }: { conexiones: ConexionResumen[]; busqueda: string }) {
  const t = useTranslations('integracionesConexiones');
  const url = useParametrosUrl();
  const { formatTime, formatDate, formatDateTime, getToday, toDate } = useFormatDate();
  const esEscritorio = useEsEscritorio();
  const conexionUrl = url.leer('conexion');
  const [filtro, setFiltro] = useState<Filtro>(url.leer('errores') === '1' ? 'errores' : conexionUrl ? `c:${conexionUrl}` : 'todas');
  const [eventos, setEventos] = useState<EventoResumen[]>([]);
  const [totalErrores, setTotalErrores] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<EventoResumen | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiConexiones.eventos({
        errores: filtro === 'errores',
        conexion: filtro.startsWith('c:') ? filtro.slice(2) : null,
        limite: 200,
      });
      setEventos(r.eventos);
      setTotalErrores(r.errores);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [filtro, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porId = useMemo(() => new Map(conexiones.map((c) => [c.id, c])), [conexiones]);
  const nombreConexion = useCallback(
    (id: string) => {
      const c = porId.get(id);
      if (!c) return t('actividad.conexionDesconocida');
      return t.has(`servicios.${c.proveedor}.nombre`) ? t(`servicios.${c.proveedor}.nombre`) : c.proveedorNombre || c.nombre;
    },
    [porId, t],
  );
  const tipoEvento = useCallback((e: EventoResumen) => {
    const clave = claveTipoEvento(e.tipo);
    return clave ? t(`actividad.tipos.${clave}`) : e.tipo;
  }, [t]);

  const hoy = getToday();
  const filas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return eventos.filter((e) => {
      if (filtro === 'hoy' && toDate(new Date(e.creado)) !== hoy) return false;
      if (!q) return true;
      return `${nombreConexion(e.conexionId)} ${tipoEvento(e)} ${e.referencia ?? ''}`.toLocaleLowerCase('es').includes(q);
    });
  }, [eventos, filtro, busqueda, hoy, toDate, nombreConexion, tipoEvento]);

  const opciones = [
    { valor: 'todas' as Filtro, etiqueta: t('actividad.filtro.todas') },
    { valor: 'errores' as Filtro, etiqueta: t('actividad.filtro.conError', { n: totalErrores }) },
    ...conexiones.slice(0, 8).map((c) => ({ valor: `c:${c.id}` as Filtro, etiqueta: nombreConexion(c.id) })),
    { valor: 'hoy' as Filtro, etiqueta: t('actividad.filtro.hoy') },
  ];

  const hora = (iso: string) => (toDate(new Date(iso)) === hoy ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`);

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
    {
      id: 'resultado',
      encabezado: t('actividad.col.resultado'),
      celda: (e) => {
        const r = resultadoEvento(e);
        return <StatusBadge estado={r.clave} etiqueta={t(`actividad.resultado.${r.clave}`)} tono={r.tono} />;
      },
    },
  ];

  const estado: EstadoTabla = cargando ? 'cargando' : error ? 'error' : eventos.length === 0 ? 'vacio' : filas.length === 0 ? 'sinResultados' : 'listo';

  const detalle = elegido && (
    <DetalleEvento
      evento={elegido}
      conexion={porId.get(elegido.conexionId) ?? null}
      nombre={nombreConexion(elegido.conexionId)}
      tipo={tipoEvento(elegido)}
      fecha={formatDateTime(elegido.creado)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <ChipsOpcion<Filtro>
        opciones={opciones}
        valor={filtro}
        onValorChange={(v) => {
          setFiltro(v);
          setElegido(null);
        }}
        etiqueta={t('actividad.filtro.aria')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable
          etiqueta={t('actividad.tabla')}
          columnas={columnas}
          filas={filas}
          obtenerId={(e) => e.id}
          estado={estado}
          onFilaClick={setElegido}
          etiquetaFila={(e) => `${nombreConexion(e.conexionId)} · ${tipoEvento(e)}`}
          tonoFila={(e) => (e.estado === 'error' ? 'peligro' : undefined)}
          termino={busqueda}
          onReintentar={() => void cargar()}
          error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
          vacio={{ titulo: t('actividad.vacioTitulo'), descripcion: t('actividad.vacioTexto') }}
        />
        {esEscritorio ? (
          <aside aria-label={t('actividad.detalle.titulo')} className="hidden self-start rounded-xl border border-line bg-surface p-4 lg:block">
            <h2 className="mb-3 text-base font-semibold text-fg">{t('actividad.detalle.titulo')}</h2>
            {detalle || <p className="text-sm text-fg-secondary">{t('actividad.detalle.elige')}</p>}
          </aside>
        ) : (
          elegido && (
            <PanelAdaptable abierto onAbiertoChange={(v) => !v && setElegido(null)} titulo={t('actividad.detalle.titulo')}>
              {detalle}
            </PanelAdaptable>
          )
        )}
      </div>
    </div>
  );
}

function DetalleEvento({ evento, conexion, nombre, tipo, fecha }: { evento: EventoResumen; conexion: ConexionResumen | null; nombre: string; tipo: string; fecha: string }) {
  const t = useTranslations('integracionesConexiones');
  const codigo = codigoErrorEvento(evento.error);
  const ambiente = conexion ? (conexion.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas')) : null;
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
        {evento.referencia && <FilaDato etiqueta={t('actividad.detalle.referencia')} valor={evento.referencia} />}
      </ListaDatos>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/integraciones/eventos/${evento.id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('actividad.detalle.verCompleto')}
        </Link>
        {evento.estado === 'error' && (
          <Link href={`/app/integraciones/conexiones/${evento.conexionId}`} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
            {t('actividad.detalle.irCredenciales')}
          </Link>
        )}
      </div>
    </div>
  );
}
