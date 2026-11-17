'use client';

/**
 * Marcación › Dispositivos (Figma 20.28.1, 20.28.2, 20.28.10 y 20.28.13), en la
 * versión de M0: pantallas de QR y etiquetas NFC de la sede. Los equipos que
 * llegan con M1/M2 (kiosco, lector, terminales) aparecen si ya existen, pero solo
 * se activan o desactivan. Nunca se borra un punto: las marcas lo referencian.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ExternalLink, House, MonitorSmartphone, Plus, Power, RefreshCw } from 'lucide-react';
import {
  ConfirmDialog,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  SearchInput,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorPersonas, pedir, type Carga } from '../personas/apiPersonas';
import { InsigniaEstado } from '../asistencia/comunAsistencia';
import { iconoDispositivo } from './comunMarcacion';
import { DialogoCodigoEtiqueta } from './DialogoAgregarPunto';
import {
  accionesDispositivo,
  coincideDispositivo,
  estadoDispositivo,
  haceCuanto,
  tipoDispositivo,
  tonoEstadoDispositivo,
  type Dispositivo,
  type EstadoDispositivo,
  type RespuestaDispositivos,
} from './marcacionVista';

const ESTADOS: readonly EstadoDispositivo[] = ['en_linea', 'activa', 'sin_conexion', 'desactivado'];

export function rutaPantallaQr(id: string): string {
  return `/marcacion/pantalla/${id}`;
}

export function VistaDispositivos({
  carga,
  recargar,
  onAgregar,
}: {
  carga: Carga<RespuestaDispositivos>;
  recargar: () => Promise<void>;
  onAgregar: () => void;
}) {
  const t = useTranslations('hrmMarcacionRrhh');
  const td = useTranslations('hrmMarcacionRrhh.dispositivos');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const puede = !!datos?.puede_gestionar;
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoDispositivo | null>(null);
  const [confirmar, setConfirmar] = useState<{ accion: 'regenerar' | 'desactivar'; d: Dispositivo } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState<{ id: string; codigo: string; nombre: string } | null>(null);
  const ahora = Date.now();

  const todos = useMemo(() => datos?.dispositivos ?? [], [datos]);
  // Pocas filas por sede: se filtra en cada render (el estado depende de la hora actual).
  const filas = todos.filter((d) => coincideDispositivo(d, texto) && (!estado || estadoDispositivo(d, ahora) === estado));
  const chips: ChipFiltro[] = estado ? [{ clave: 'estado', etiqueta: t('filtros.chipEstado', { valor: td(`estados.${estado}`) }) }] : [];

  const accionar = async (d: Dispositivo, accion: 'regenerar' | 'activar' | 'desactivar') => {
    setEnviando(true);
    try {
      const r = await pedir<{ id: string; tipo?: string; codigo?: string | null }>(`/api/hrm/marcacion/dispositivos/${d.id}`, {
        metodo: 'POST',
        cuerpo: { accion },
      });
      if (accion === 'regenerar') {
        if (r.codigo) setCodigo({ id: d.id, codigo: r.codigo, nombre: d.nombre });
        else toast.success(td('regenerada', { nombre: d.nombre }), { description: td('regeneradaPantallaDesc') });
      } else {
        toast.success(td(accion === 'activar' ? 'activada' : 'desactivada', { nombre: d.nombre }));
      }
      setConfirmar(null);
      void recargar();
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(c === 'sin_permiso' ? td('errores.sinPermiso') : td('errores.guardar'));
    } finally {
      setEnviando(false);
    }
  };

  const accionesDe = (d: Dispositivo): AccionFila[] => {
    const a = accionesDispositivo(d, puede);
    const etiqueta = tipoDispositivo(d) === 'etiqueta_nfc';
    return [
      {
        id: 'abrir',
        etiqueta: td('acciones.abrirPantalla'),
        icono: ExternalLink,
        onSelect: () => window.open(rutaPantallaQr(d.id), '_blank', 'noopener'),
        oculta: !a.abrirPantalla,
      },
      {
        id: 'regenerar',
        etiqueta: etiqueta ? td('acciones.regenerarCodigo') : td('acciones.regenerarClave'),
        icono: RefreshCw,
        onSelect: () => setConfirmar({ accion: 'regenerar', d }),
        oculta: !a.regenerar,
      },
      {
        id: 'activar',
        etiqueta: td('acciones.activar'),
        icono: Power,
        onSelect: () => void accionar(d, 'activar'),
        oculta: !a.activar,
      },
      {
        id: 'desactivar',
        etiqueta: td('acciones.desactivar'),
        icono: Power,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setConfirmar({ accion: 'desactivar', d }),
        oculta: !a.desactivar,
      },
    ];
  };

  const textoConexion = (d: Dispositivo): string => {
    if (tipoDispositivo(d) === 'etiqueta_nfc') return td('noSeConecta');
    const h = haceCuanto(d.ultima_conexion, ahora);
    if (!h) return td('nunca');
    return h.unidad === 'ahora' ? td('hace.ahora') : td(`hace.${h.unidad}`, { n: h.n });
  };
  const textoTipo = (d: Dispositivo) => td(`tipos.${tipoDispositivo(d)}`);
  const insignia = (d: Dispositivo) => {
    const e = estadoDispositivo(d, ahora);
    return <InsigniaEstado tono={tonoEstadoDispositivo(e)}>{td(`estados.${e}`)}</InsigniaEstado>;
  };

  const columnas: ColumnaTabla<Dispositivo>[] = [
    {
      id: 'dispositivo',
      encabezado: td('columnas.dispositivo'),
      celda: (d) => {
        const Icono = iconoDispositivo(tipoDispositivo(d));
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
              <Icono className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{d.nombre}</p>
              {(d.descripcion || d.chip) && (
                <p className="truncate text-xs text-fg-secondary">{[d.descripcion, d.chip ? td(`chips.${d.chip}`) : null].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
        );
      },
    },
    { id: 'tipo', encabezado: td('columnas.tipo'), ocultarDebajo: 'md', celda: textoTipo },
    { id: 'sede', encabezado: td('columnas.sede'), ocultarDebajo: 'lg', celda: (d) => d.sede ?? '—' },
    { id: 'estado', encabezado: td('columnas.estado'), celda: insignia },
    { id: 'conexion', encabezado: td('columnas.conexion'), ocultarDebajo: 'lg', celda: (d) => <span className="whitespace-nowrap">{textoConexion(d)}</span> },
    { id: 'hoy', encabezado: td('columnas.hoy'), alinear: 'derecha', celda: (d) => <span className="tabular-nums">{d.activo || d.hoy > 0 ? d.hoy : '—'}</span> },
  ];

  const estadoTabla =
    carga.estado === 'cargando'
      ? 'cargando'
      : carga.estado === 'sinPermiso'
        ? 'sinPermiso'
        : carga.estado !== 'listo'
          ? 'error'
          : todos.length === 0
            ? 'vacio'
            : filas.length === 0
              ? 'sinResultados'
              : 'listo';

  const limpiar = () => setEstado(null);
  const etiquetaConfirmar = confirmar && tipoDispositivo(confirmar.d) === 'etiqueta_nfc';

  return (
    <>
      {carga.estado !== 'sinPermiso' && (carga.estado !== 'listo' || todos.length > 0) && (
        <ListToolbar
          busqueda={
            <SearchInput value={texto} onChange={setTexto} cargando={carga.estado === 'cargando'} placeholder={td('buscar')} etiqueta={td('buscar')} />
          }
          filtros={
            <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={td('verDispositivos', { n: filas.length })}>
              <FormField etiqueta={td('columnas.estado')}>
                {(c) => (
                  <Select value={estado ?? '__todos'} onValueChange={(v) => setEstado(v === '__todos' ? null : (v as EstadoDispositivo))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {ESTADOS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {td(`estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={limpiar} onLimpiarTodo={limpiar} /> : undefined}
        />
      )}

      <DataTable
        etiqueta={td('tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(d) => d.id}
        estado={estadoTabla}
        etiquetaFila={(d) => d.nombre}
        acciones={accionesDe}
        tarjetaMovil={(d) => (
          <ListCard
            icono={iconoDispositivo(tipoDispositivo(d))}
            titulo={d.nombre}
            subtitulo={`${textoTipo(d)} · ${textoConexion(d)}`}
            meta={d.descripcion ?? undefined}
            estado={insignia(d)}
            acciones={accionesDe(d)}
          />
        )}
        vacio={{
          titulo: td('vacio.titulo'),
          descripcion: td('vacio.descripcion'),
          icono: MonitorSmartphone,
          accion: puede ? { etiqueta: td('agregar'), onClick: onAgregar, icono: Plus } : undefined,
        }}
        sinResultados={{ titulo: td('sinResultados.titulo'), descripcion: td('sinResultados.descripcion'), icono: MonitorSmartphone }}
        error={{ titulo: td('error.titulo'), descripcion: td('error.descripcion'), icono: MonitorSmartphone }}
        sinPermiso={{
          titulo: t('sinPermiso.titulo'),
          descripcion: t('sinPermiso.descripcion'),
          accion: { etiqueta: t('comun.irAlInicio'), href: '/app/inicio', icono: House },
        }}
        onLimpiarFiltros={() => {
          limpiar();
          setTexto('');
        }}
        onReintentar={() => void recargar()}
        termino={texto}
      />

      <ConfirmDialog
        abierto={confirmar !== null}
        onAbiertoChange={(a) => !a && setConfirmar(null)}
        tono={confirmar?.accion === 'desactivar' ? 'peligro' : 'advertencia'}
        icono={confirmar?.accion === 'desactivar' ? Power : RefreshCw}
        titulo={
          confirmar?.accion === 'desactivar'
            ? td('confirmar.desactivarTitulo', { nombre: confirmar.d.nombre })
            : etiquetaConfirmar
              ? td('confirmar.regenerarCodigoTitulo', { nombre: confirmar?.d.nombre ?? '' })
              : td('confirmar.regenerarClaveTitulo', { nombre: confirmar?.d.nombre ?? '' })
        }
        descripcion={
          confirmar?.accion === 'desactivar'
            ? td('confirmar.desactivarDesc')
            : etiquetaConfirmar
              ? td('confirmar.regenerarCodigoDesc')
              : td('confirmar.regenerarClaveDesc')
        }
        textoConfirmar={
          confirmar?.accion === 'desactivar' ? td('confirmar.desactivar') : etiquetaConfirmar ? td('confirmar.regenerarCodigo') : td('confirmar.regenerarClave')
        }
        cargando={enviando}
        onConfirmar={() => (confirmar ? accionar(confirmar.d, confirmar.accion) : undefined)}
      />

      <DialogoCodigoEtiqueta etiqueta={codigo} onCerrar={() => setCodigo(null)} />
    </>
  );
}
