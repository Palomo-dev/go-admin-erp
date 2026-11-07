'use client';

/**
 * Mis conexiones (diseño 85-01): aviso si alguna necesita atención y tabla con logo, credencial
 * enmascarada, ambiente, «usada por», última prueba, eventos de 24 h y estado.
 * «Probar» llama al proveedor desde el servidor y muestra el resultado tal cual (correcta,
 * rechazada, sin respuesta o sin prueba automática); nunca cambia el estado de la conexión.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Eye, Pause, Play, PlugZap } from 'lucide-react';
import { AvisoTonal, DataTable, StatusBadge, type AccionFila, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { apiConexiones, type ConexionResumen } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { LogoServicio } from './logos';
import { estadoConexion } from './presentacion';

export interface PestanaMisConexionesProps {
  conexiones: ConexionResumen[];
  cargando: boolean;
  error: string | null;
  busqueda: string;
  onLimpiarBusqueda: () => void;
  onReintentar: () => void;
  onVerErrores: () => void;
  onIrCatalogo: () => void;
  onCambio: () => void;
}

export function PestanaMisConexiones({ conexiones, cargando, error, busqueda, onLimpiarBusqueda, onReintentar, onVerErrores, onIrCatalogo, onCambio }: PestanaMisConexionesProps) {
  const t = useTranslations('integracionesConexiones');
  const router = useRouter();
  const { formatDate, formatDateTime } = useFormatDate();
  const [ocupada, setOcupada] = useState<string | null>(null);

  const nombreProveedor = (c: ConexionResumen) =>
    t.has(`servicios.${c.proveedor}.nombre`) ? t(`servicios.${c.proveedor}.nombre`) : c.proveedorNombre || c.nombre;

  const filas = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    if (!q) return conexiones;
    return conexiones.filter((c) => `${c.nombre} ${c.proveedorNombre} ${c.proveedor}`.toLocaleLowerCase('es').includes(q));
  }, [conexiones, busqueda]);

  const conAtencion = conexiones.filter((c) => c.necesitaAtencion);

  const probar = async (c: ConexionResumen) => {
    setOcupada(c.id);
    try {
      const r = await apiConexiones.probar(c.id);
      const texto = t(`misConexiones.prueba.${r.resultado}`, { http: r.http ?? '' });
      if (r.resultado === 'correcta') toast.success(texto);
      else if (r.resultado === 'sin_prueba') toast.info(texto);
      else toast.error(texto);
      onCambio();
    } catch (e) {
      toast.error(t('misConexiones.prueba.error'), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setOcupada(null);
    }
  };

  const cambiarEstado = async (c: ConexionResumen, accion: 'pausar' | 'reanudar') => {
    setOcupada(c.id);
    try {
      await apiConexiones.cambiarEstado(c.id, accion);
      toast.success(t(`misConexiones.${accion === 'pausar' ? 'pausada' : 'reanudada'}`, { nombre: c.nombre }));
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setOcupada(null);
    }
  };

  const usadaPor = (c: ConexionResumen) => {
    if (c.usadaPor.length === 0) return <span className="text-fg-muted">{t('misConexiones.sinUso')}</span>;
    return c.usadaPor
      .map((u) => `${t('misConexiones.metodo', { codigo: u.codigo })}${u.tienda ? ` · ${t('misConexiones.tiendaWeb')}` : ''}`)
      .join(' · ');
  };

  const columnas: ColumnaTabla<ConexionResumen>[] = [
    {
      id: 'conexion',
      encabezado: t('misConexiones.col.conexion'),
      celda: (c) => (
        <div className="flex items-center gap-3">
          <LogoServicio id={c.proveedor} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{nombreProveedor(c)}</p>
            <p className="truncate text-xs text-fg-muted">
              {[c.credencial ? t('misConexiones.credencial', { mascara: c.credencial }) : c.nombre, c.creada ? t('misConexiones.creada', { fecha: formatDate(c.creada) }) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'ambiente',
      encabezado: t('misConexiones.col.ambiente'),
      celda: (c) => (c.ambiente === 'production' ? t('comun.produccion') : t('comun.pruebas')),
      ocultarDebajo: 'md',
    },
    { id: 'uso', encabezado: t('misConexiones.col.usadaPor'), celda: usadaPor, ocultarDebajo: 'lg' },
    {
      id: 'prueba',
      encabezado: t('misConexiones.col.ultimaPrueba'),
      celda: (c) => (c.ultimaPrueba ? formatDateTime(c.ultimaPrueba) : <span className="text-fg-muted">{t('misConexiones.nunca')}</span>),
      ocultarDebajo: 'lg',
    },
    { id: 'eventos', encabezado: t('misConexiones.col.eventos24h'), celda: (c) => c.eventos24h, alinear: 'derecha', ocultarDebajo: 'md' },
    {
      id: 'estado',
      encabezado: t('misConexiones.col.estado'),
      celda: (c) => {
        const e = estadoConexion(c.estado, c.necesitaAtencion);
        return <StatusBadge estado={e.clave} etiqueta={t(`estados.conexion.${e.clave}`)} tono={e.tono} />;
      },
    },
  ];

  const acciones = (c: ConexionResumen): AccionFila[] => {
    const lista: AccionFila[] = [
      { id: 'ver', etiqueta: t('misConexiones.accion.ver'), icono: Eye, onSelect: () => router.push(`/app/integraciones/conexiones/${c.id}`) },
      { id: 'probar', etiqueta: t('misConexiones.accion.probar'), icono: PlugZap, onSelect: () => void probar(c), deshabilitada: ocupada === c.id },
    ];
    if (c.estado === 'paused') {
      lista.push({ id: 'reanudar', etiqueta: t('misConexiones.accion.reanudar'), icono: Play, onSelect: () => void cambiarEstado(c, 'reanudar'), deshabilitada: ocupada === c.id });
    } else if (c.estado === 'connected' || c.estado === 'error') {
      lista.push({ id: 'pausar', etiqueta: t('misConexiones.accion.pausar'), icono: Pause, onSelect: () => void cambiarEstado(c, 'pausar'), deshabilitada: ocupada === c.id, separadorAntes: true });
    }
    return lista;
  };

  const estado: EstadoTabla = cargando ? 'cargando' : error ? 'error' : conexiones.length === 0 ? 'vacio' : filas.length === 0 ? 'sinResultados' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      {!cargando && conAtencion.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          rol="alert"
          titulo={t('misConexiones.atencionTitulo', { n: conAtencion.length })}
          descripcion={conAtencion
            .map((c) => `${nombreProveedor(c)}: ${c.ultimoError ?? (c.errores24h > 0 ? t('misConexiones.erroresHoy', { n: c.errores24h }) : t(`estados.conexion.${estadoConexion(c.estado, true).clave}`))}`)
            .join(' · ')}
          accion={{ etiqueta: t('misConexiones.verErrores'), onClick: onVerErrores }}
        />
      )}
      <DataTable
        etiqueta={t('misConexiones.tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.id}
        estado={estado}
        onFilaClick={(c) => router.push(`/app/integraciones/conexiones/${c.id}`)}
        etiquetaFila={(c) => nombreProveedor(c)}
        acciones={acciones}
        tonoFila={(c) => (c.estado === 'error' ? 'peligro' : c.necesitaAtencion ? 'advertencia' : undefined)}
        termino={busqueda}
        onLimpiarFiltros={onLimpiarBusqueda}
        onReintentar={onReintentar}
        error={{ titulo: t('comun.errorCarga'), descripcion: error ?? undefined }}
        vacio={{ titulo: t('misConexiones.vacioTitulo'), descripcion: t('misConexiones.vacioTexto'), accion: { etiqueta: t('misConexiones.irCatalogo'), onClick: onIrCatalogo } }}
      />
    </div>
  );
}
