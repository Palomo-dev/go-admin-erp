'use client';

/**
 * Tienda › Reseñas: moderación de las reseñas de producto con el kit
 * (reemplaza en el módulo al `ReviewsModerationPanel` heredado, que no se
 * borra: lo decide el integrador).
 *
 * - Filtro por estado (SegmentedControl con icono y contador de pendientes).
 * - DataTable en escritorio y ListCard en móvil; estados de cargando, vacío
 *   (dice qué esperar), error con «Reintentar» y sin permiso del propio kit.
 * - Aprobar y rechazar como acciones rápidas con icono; responder abre una
 *   hoja (PanelAdaptable) con el texto de la reseña y la respuesta.
 * - Lee y escribe por `/api/sitio-web/tienda/resenas` (permiso
 *   `website.sites.edit` en el servidor); sin permiso, solo lectura.
 * - Fechas con `useFormatDate` (zona de la organización).
 */
import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import {
  DataTable,
  ListCard,
  PaginationCompact,
  PanelAdaptable,
  SegmentedControl,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ResenaTienda } from '@/lib/website/tiendaSitio.server';
import type { EstadoResena } from '@/lib/services/website/resenasProducto';
import { cn } from '@/utils/Utils';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONO_ACCION_RESENA, ICONO_ESTADO_RESENA } from './iconosVentas';
import type { TraductorVentas } from './textos';
import { useResenasTienda, type FiltroResenas } from './useTiendaSitio';

const FILTROS: readonly FiltroResenas[] = ['pending', 'approved', 'rejected', 'all'];

/**
 * Estado de la BD → clave de `estadoTono` (el tono lo da el kit, no la página):
 * «pendiente» ámbar, «aceptada» verde y «rechazada» rojo. La etiqueta visible
 * es la del área («Por revisar», «Aprobada», «Rechazada»).
 */
const ESTADO_KIT: Record<EstadoResena, string> = { pending: 'pendiente', approved: 'aceptada', rejected: 'rechazada' };

export function BadgeResena({ estado, t }: { estado: EstadoResena; t: TraductorVentas }) {
  return <StatusBadge estado={ESTADO_KIT[estado]} etiqueta={t(`tienda.resenas.estados.${estado}`)} icono={ICONO_ESTADO_RESENA[estado]} tamano="sm" />;
}

/** «★ 4/5»: icono + número (el color nunca va solo) y nombre accesible completo. */
export function Calificacion({ valor, t }: { valor: number; t: TraductorVentas }) {
  const Estrella = ICONO_ACCION_RESENA.calificacion;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-[13px] font-medium text-fg" aria-label={t('tienda.resenas.calificacion', { n: valor })} role="img">
      <Estrella aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'fill-warning text-warning-text')} strokeWidth={TRAZO_ICONO} />
      {valor}/5
    </span>
  );
}

export function ModeracionResenas({
  t,
  puedeEditar,
  pendientes,
  alCambiar,
}: {
  t: TraductorVentas;
  puedeEditar: boolean;
  pendientes: number;
  alCambiar: () => void;
}) {
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const [filtro, setFiltro] = useState<FiltroResenas>('pending');
  const [pagina, setPagina] = useState(1);
  const { datos, cargando, fallo, recargar, moderar } = useResenasTienda(filtro, pagina, alCambiar);
  const [abierta, setAbierta] = useState<ResenaTienda | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const editable = puedeEditar && (datos?.puedeEditar ?? true);

  const ejecutar = async (r: ResenaTienda, accion: 'aprobar' | 'rechazar' | 'responder', texto?: string) => {
    setOcupado(r.id);
    try {
      await moderar(r.id, accion, texto);
      toast({ title: t(accion === 'aprobar' ? 'tienda.resenas.aprobada' : accion === 'rechazar' ? 'tienda.resenas.rechazada' : 'tienda.resenas.respondida') });
      return true;
    } catch (error) {
      toast({ title: t('tienda.resenas.errorAccion', { mensaje: (error as Error).message }), variant: 'destructive' });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const abrir = (r: ResenaTienda) => {
    setAbierta(r);
    setRespuesta(r.respuesta ?? '');
  };

  const acciones = (r: ResenaTienda): AccionFila[] =>
    editable
      ? [
          ...(r.estado !== 'approved' ? [{ id: 'aprobar', etiqueta: t('tienda.resenas.aprobar'), icono: ICONO_ACCION_RESENA.aprobar, onSelect: () => void ejecutar(r, 'aprobar') }] : []),
          { id: 'responder', etiqueta: t(r.respuesta ? 'tienda.resenas.editarRespuesta' : 'tienda.resenas.responder'), icono: ICONO_ACCION_RESENA.responder, onSelect: () => abrir(r) },
          ...(r.estado !== 'rejected'
            ? [{ id: 'rechazar', etiqueta: t('tienda.resenas.rechazar'), icono: ICONO_ACCION_RESENA.rechazar, onSelect: () => void ejecutar(r, 'rechazar'), separadorAntes: true }]
            : []),
        ]
      : [];

  /** Aprobar y rechazar a un clic, con icono y texto (no destructivos: se pueden revertir). */
  const accionesRapidas = (r: ResenaTienda) =>
    editable && r.estado === 'pending' ? (
      <span className="flex items-center gap-1">
        <button
          type="button"
          disabled={ocupado === r.id}
          onClick={() => void ejecutar(r, 'aprobar')}
          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
        >
          <ICONO_ACCION_RESENA.aprobar aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-success-text')} strokeWidth={TRAZO_ICONO} />
          {t('tienda.resenas.aprobar')}
        </button>
      </span>
    ) : null;

  const textoResena = (r: ResenaTienda) => (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
        {r.autor}
        {r.compraVerificada && (
          <BadgeCheck aria-label={t('tienda.resenas.compraVerificada')} role="img" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-success-text')} strokeWidth={TRAZO_ICONO} />
        )}
      </p>
      {r.titulo && <p className="truncate text-[13px] font-medium text-fg">{r.titulo}</p>}
      <p className="line-clamp-2 text-[13px] text-fg-secondary">{r.texto || t('tienda.resenas.sinTexto')}</p>
      {r.respuesta && (
        <p className="mt-1 flex items-start gap-1 text-xs text-fg-secondary">
          <ICONO_ACCION_RESENA.responder aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'mt-0.5 shrink-0')} strokeWidth={TRAZO_ICONO} />
          <span className="line-clamp-1">{r.respuesta}</span>
        </p>
      )}
    </div>
  );

  const columnas: ColumnaTabla<ResenaTienda>[] = [
    { id: 'resena', encabezado: t('tienda.resenas.columnas.resena'), celda: textoResena },
    { id: 'producto', encabezado: t('tienda.resenas.columnas.producto'), ocultarDebajo: 'xl', celda: (r) => <span className="text-[13px] text-fg">{r.producto?.nombre ?? '—'}</span> },
    { id: 'calificacion', encabezado: t('tienda.resenas.columnas.calificacion'), ancho: 110, celda: (r) => <Calificacion valor={r.calificacion} t={t} /> },
    { id: 'fecha', encabezado: t('tienda.resenas.columnas.fecha'), ancho: 120, celda: (r) => <span className="tabular-nums text-[13px] text-fg-secondary">{formatDate(r.creadaEn)}</span> },
    { id: 'estado', encabezado: t('tienda.resenas.columnas.estado'), ancho: 140, celda: (r) => <BadgeResena estado={r.estado} t={t} /> },
  ];

  const estadoTabla = cargando ? 'cargando' : fallo === 'sin_permiso' ? 'sinPermiso' : fallo ? 'error' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        etiqueta={t('tienda.resenas.filtroEstado')}
        opciones={FILTROS.map((f) => ({
          valor: f,
          etiqueta: t(`tienda.resenas.filtros.${f}`),
          icono: f === 'all' ? undefined : ICONO_ESTADO_RESENA[f],
          contador: f === 'pending' && pendientes > 0 ? pendientes : undefined,
        }))}
        valor={filtro}
        onValorChange={(v) => {
          setFiltro(v);
          setPagina(1);
        }}
        tamano="sm"
      />
      {!editable && <p className="text-xs text-fg-secondary">{t('tienda.resenas.soloLectura')}</p>}
      <DataTable
        etiqueta={t('tienda.resenas.etiqueta')}
        columnas={columnas}
        filas={datos?.resenas ?? []}
        obtenerId={(r) => r.id}
        estado={estadoTabla}
        onReintentar={() => void recargar()}
        onFilaClick={abrir}
        etiquetaFila={(r) => t('tienda.resenas.detalle', { autor: r.autor })}
        acciones={acciones}
        accionesRapidas={accionesRapidas}
        vacio={{ titulo: t(`tienda.resenas.vacio.${filtro}`), icono: ICONO_ACCION_RESENA.calificacion }}
        error={{ titulo: t('tienda.resenas.errorCarga') }}
        tarjetaMovil={(r) => (
          <ListCard
            inicio="icono"
            icono={ICONO_ACCION_RESENA.calificacion}
            titulo={r.autor}
            subtitulo={r.texto || r.titulo || t('tienda.resenas.sinTexto')}
            datos={[
              r.producto && { icono: ICONO_ACCION_RESENA.calificacion, etiqueta: t('tienda.resenas.columnas.producto'), texto: r.producto.nombre },
              !!r.respuesta && { icono: ICONO_ACCION_RESENA.responder, etiqueta: t('tienda.resenas.respuesta'), texto: r.respuesta },
            ]}
            meta={formatDate(r.creadaEn)}
            valor={<Calificacion valor={r.calificacion} t={t} />}
            estado={<BadgeResena estado={r.estado} t={t} />}
            onClick={() => abrir(r)}
            acciones={acciones(r)}
          />
        )}
        pie={
          datos && datos.total > datos.tamano ? (
            <PaginationCompact pagina={datos.pagina} tamano={datos.tamano} total={datos.total} onPaginaChange={setPagina} cargando={cargando} />
          ) : undefined
        }
      />

      <PanelAdaptable
        abierto={abierta !== null}
        onAbiertoChange={(v) => !v && setAbierta(null)}
        titulo={abierta ? t('tienda.resenas.detalle', { autor: abierta.autor }) : ''}
        descripcion={abierta?.producto?.nombre}
        icono={ICONO_ACCION_RESENA.calificacion}
        ocupado={!!abierta && ocupado === abierta.id}
        pie={
          abierta && editable ? (
            <>
              {abierta.estado !== 'rejected' && (
                <button
                  type="button"
                  disabled={ocupado === abierta.id}
                  onClick={async () => (await ejecutar(abierta, 'rechazar')) && setAbierta(null)}
                  className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                >
                  <ICONO_ACCION_RESENA.rechazar aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-danger-text')} strokeWidth={TRAZO_ICONO} />
                  {t('tienda.resenas.rechazar')}
                </button>
              )}
              {abierta.estado !== 'approved' && (
                <button
                  type="button"
                  disabled={ocupado === abierta.id}
                  onClick={async () => (await ejecutar(abierta, 'aprobar')) && setAbierta(null)}
                  className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                >
                  <ICONO_ACCION_RESENA.aprobar aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-success-text')} strokeWidth={TRAZO_ICONO} />
                  {t('tienda.resenas.aprobar')}
                </button>
              )}
              <button
                type="button"
                disabled={ocupado === abierta.id || respuesta.trim() === (abierta.respuesta ?? '').trim()}
                onClick={async () => (await ejecutar(abierta, 'responder', respuesta)) && setAbierta(null)}
                className={clasesBoton({ variante: 'primario', tamano: 'md' })}
              >
                <ICONO_ACCION_RESENA.responder aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                {t('tienda.resenas.guardarRespuesta')}
              </button>
            </>
          ) : undefined
        }
      >
        {abierta && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Calificacion valor={abierta.calificacion} t={t} />
              <BadgeResena estado={abierta.estado} t={t} />
              {abierta.compraVerificada && <StatusBadge estado="verificado" etiqueta={t('tienda.resenas.compraVerificada')} icono={BadgeCheck} tamano="sm" />}
              <span className="tabular-nums text-xs text-fg-secondary">{formatDate(abierta.creadaEn)}</span>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-3">
              {abierta.titulo && <p className="text-sm font-semibold text-fg">{abierta.titulo}</p>}
              <p className="whitespace-pre-line text-[13px] text-fg-secondary">{abierta.texto || t('tienda.resenas.sinTexto')}</p>
              {abierta.ciudad && <p className="mt-1 text-xs text-fg-muted">{abierta.ciudad}</p>}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <ICONO_ACCION_RESENA.responder aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
                {t('tienda.resenas.respuesta')}
              </span>
              <Textarea
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                disabled={!editable}
                maxLength={1000}
                rows={4}
                placeholder={t('tienda.resenas.respuestaPlaceholder')}
                className="rounded-lg"
              />
            </label>
          </div>
        )}
      </PanelAdaptable>
    </div>
  );
}
