'use client';

/**
 * Asistencia (Figma 20.10, `docs/design/figma/96-hrm-f2-10-*`): «Hoy» (quién
 * está, quién falta y quién llegó tarde), «Hojas de tiempo» del período y
 * «Ajustes» de marcas. Para RR. HH. (toda la organización) y para el jefe (su
 * equipo, directo e indirecto); el alcance lo resuelve el servidor.
 *
 * La vista va en la URL (`?vista=hoy|hojas|ajustes`) para que «atrás» vuelva a
 * ella. Hoy se refresca cada 2 min con «actualizado hace N» (decisión 10 del
 * patrón 14: no es Realtime).
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarCheck, ClockArrowUp, Download, MonitorSmartphone, NotebookPen, Plus, ScanQrCode, Settings } from 'lucide-react';
import { DateRangeButton, PageHeader, RowActionsMenu, SegmentedControl, type AccionFila } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useCarga } from '../personas/apiPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import { VistaHoy } from './VistaHoy';
import { VistaHojas } from './VistaHojas';
import { VistaAjustes } from './VistaAjustes';
import { DialogoAjuste } from './DialogoAjuste';
import { RUTA_NOVEDADES, RUTA_TOPES, conSede, useDias, usePeriodo, useSedeActiva } from './comunAsistencia';
import {
  RUTA_DISPOSITIVOS,
  RUTA_METODOS_SEDE,
  destinoQrSede,
  textoDuracion,
  type RespuestaHojas,
  type RespuestaHoy,
} from './asistenciaLogica';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';

type Vista = 'hoy' | 'hojas' | 'ajustes';
const VISTAS: readonly Vista[] = ['hoy', 'hojas', 'ajustes'];
const REFRESCO_MS = 120_000;

/** Lo que el menú ⋯ lee de `GET /api/hrm/marcacion/metodos` (solo las pantallas de QR). */
interface PantallasSede {
  pantallas: { id: string; nombre: string }[];
}

export function AsistenciaPage() {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const sede = useSedeActiva();
  const dias = useDias();
  const periodo = usePeriodo();
  const vistaUrl = sp?.get('vista');
  const vista: Vista = VISTAS.includes(vistaUrl as Vista) ? (vistaUrl as Vista) : 'hoy';
  const [ajustar, setAjustar] = useState(false);

  const urlHoy = vista === 'hoy' ? conSede('/api/hrm/asistencia/hoy', sede) : null;
  const urlHojas = vista === 'hojas' ? conSede(`/api/hrm/asistencia/hojas?desde=${periodo.desde}&hasta=${periodo.hasta}`, sede) : null;
  const hoy = useCarga<RespuestaHoy>(urlHoy);
  const hojas = useCarga<RespuestaHojas>(urlHojas);

  // «actualizado hace N min»: hora de la última carga y un reloj de 30 s.
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hoy.carga.estado === 'listo') setCargadoEn(Date.now());
  }, [hoy.carga]);
  const recargarHoy = hoy.recargar;
  useEffect(() => {
    if (vista !== 'hoy') return;
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    const refresco = setInterval(() => void recargarHoy(), REFRESCO_MS);
    return () => {
      clearInterval(reloj);
      clearInterval(refresco);
    };
  }, [vista, recargarHoy]);

  const cambiarVista = (v: Vista) => {
    const q = new URLSearchParams(sp?.toString() ?? '');
    if (v === 'hoy') q.delete('vista');
    else q.set('vista', v);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const sinPermiso = (vista === 'hoy' && hoy.carga.estado === 'sinPermiso') || (vista === 'hojas' && hojas.carga.estado === 'sinPermiso');
  const datosHoy = hoy.carga.estado === 'listo' ? hoy.carga.datos : null;
  const datosHojas = hojas.carga.estado === 'listo' ? hojas.carga.datos : null;

  let subtitulo: string | undefined;
  if (vista === 'hoy') {
    const fecha = datosHoy?.fecha ?? periodo.hoy;
    const base = t('hoy.subtitulo', { fecha: dias.largo(fecha) });
    const festivo = datosHoy?.festivo ? ` ${t('hoy.festivo')}` : '';
    const minutos = cargadoEn ? Math.max(0, Math.floor((ahora - cargadoEn) / 60_000)) : null;
    subtitulo = `${base}${festivo}${minutos !== null && !sinPermiso ? ` · ${minutos < 1 ? t('hoy.actualizadoRecien') : t('hoy.actualizadoHace', { n: minutos })}` : ''}`;
  } else {
    const base = t('periodo.subtitulo', {
      rango: dias.rango(periodo.desde, periodo.hasta),
    });
    subtitulo = vista === 'hojas' && datosHojas ? `${base} · ${t('hojas.nHojas', { n: datosHojas.filas.length })}` : base;
  }

  const puedeAjustar = vista === 'hoy' ? !!datosHoy : false;
  // Marcación M0 (Figma 20.31.2): accesos a Marcación solo para quien gestiona la
  // asistencia. Las pantallas de la sede se leen una vez (por sede).
  const puedeGestionar = datosHoy?.puede_gestionar ?? datosHojas?.puede_gestionar ?? false;
  const pantallas = useCarga<PantallasSede>(puedeGestionar ? conSede('/api/hrm/marcacion/metodos', sede) : null);
  const mostrarQr = () => {
    const destino = destinoQrSede(pantallas.carga.estado === 'listo' ? pantallas.carga.datos.pantallas : null);
    if (destino.tipo === 'pantalla') window.open(destino.url, '_blank', 'noopener,noreferrer');
    else router.push(destino.url);
  };
  const masAcciones: AccionFila[] = [
    {
      id: 'topes',
      etiqueta: t('acciones.verTopes'),
      icono: ClockArrowUp,
      onSelect: () => router.push(`${RUTA_TOPES}?desde=${periodo.desde}&hasta=${periodo.hasta}`),
    },
    {
      id: 'novedades',
      etiqueta: t('acciones.verNovedades'),
      icono: NotebookPen,
      onSelect: () => router.push(`${RUTA_NOVEDADES}?desde=${periodo.desde}&hasta=${periodo.hasta}`),
    },
    {
      id: 'qr-sede',
      etiqueta: t('acciones.mostrarQrSede'),
      descripcion:
        pantallas.carga.estado === 'listo' && destinoQrSede(pantallas.carga.datos.pantallas).tipo === 'agregar'
          ? t('acciones.mostrarQrSedeSinPantalla')
          : t('acciones.mostrarQrSedeDesc'),
      icono: ScanQrCode,
      onSelect: mostrarQr,
      separadorAntes: true,
      oculta: !puedeGestionar,
      deshabilitada: pantallas.carga.estado === 'cargando',
      motivo: pantallas.carga.estado === 'cargando' ? t('acciones.mostrarQrSedeCargando') : undefined,
    },
    {
      id: 'metodos-sede',
      etiqueta: t('acciones.metodosSede'),
      icono: Settings,
      onSelect: () => router.push(RUTA_METODOS_SEDE),
      oculta: !puedeGestionar,
    },
    {
      id: 'dispositivos',
      etiqueta: t('acciones.dispositivos'),
      icono: MonitorSmartphone,
      onSelect: () => router.push(RUTA_DISPOSITIVOS),
      oculta: !puedeGestionar,
    },
  ];

  const exportar = () => {
    if (!datosHojas) return;
    descargarCsv(
      `hojas-de-tiempo-${periodo.desde}-${periodo.hasta}.csv`,
      aCsv([
        [
          t('hojas.columnas.persona'),
          t('hojas.columnas.cargo'),
          t('hojas.columnas.programadas'),
          t('hojas.columnas.trabajadas'),
          t('hojas.columnas.extras'),
          t('hojas.columnas.nocturnas'),
          t('hojas.columnas.domFest'),
          t('hojas.columnas.ajustes'),
          t('hojas.columnas.estado'),
        ],
        ...datosHojas.filas.map((f) => [
          f.nombre,
          f.cargo ?? '',
          textoDuracion(f.programadas),
          textoDuracion(f.trabajadas),
          textoDuracion(f.extra),
          textoDuracion(f.nocturnas),
          textoDuracion(f.dom_fest),
          String(f.pendientes),
          t(`hojas.estados.${f.estado}`),
        ]),
      ])
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={CalendarCheck}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: t('titulo') }]}
        cargando={(vista === 'hoy' && hoy.carga.estado === 'cargando') || (vista === 'hojas' && hojas.carga.estado === 'cargando')}
        acciones={
          sinPermiso ? undefined : vista === 'hojas' ? (
            <>
              <Button variant="outline" onClick={exportar} disabled={!datosHojas || datosHojas.filas.length === 0}>
                <Download className="size-4" aria-hidden="true" /> {t('acciones.exportar')}
              </Button>
              <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} titulo={t('titulo')} />
            </>
          ) : vista === 'hoy' && puedeAjustar ? (
            <>
              <Button variant="outline" onClick={() => setAjustar(true)}>
                <Plus className="size-4" aria-hidden="true" /> {t('acciones.registrarMarca')}
              </Button>
              <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} titulo={t('titulo')} />
            </>
          ) : undefined
        }
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo }}
      />

      {!sinPermiso && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            etiqueta={t('vistas.etiqueta')}
            valor={vista}
            onValorChange={cambiarVista}
            opciones={[
              { valor: 'hoy', etiqueta: t('vistas.hoy') },
              { valor: 'hojas', etiqueta: t('vistas.hojas') },
              { valor: 'ajustes', etiqueta: t('vistas.ajustes') },
            ]}
          />
          {vista !== 'hoy' && (
            <DateRangeButton
              valor={{ desde: periodo.desde, hasta: periodo.hasta }}
              onValorChange={periodo.cambiar}
              hoy={periodo.hoy}
              etiqueta={t('periodo.etiqueta')}
              className="sm:w-72"
            />
          )}
        </div>
      )}

      {vista === 'hoy' && <VistaHoy carga={hoy.carga} recargar={hoy.recargar} periodo={periodo} />}
      {vista === 'hojas' && <VistaHojas carga={hojas.carga} recargar={hojas.recargar} desde={periodo.desde} hasta={periodo.hasta} />}
      {vista === 'ajustes' && <VistaAjustes desde={periodo.desde} hasta={periodo.hasta} sede={sede} />}

      {datosHoy && (
        <DialogoAjuste
          abierto={ajustar}
          onAbiertoChange={setAjustar}
          zona={datosHoy.zona}
          fecha={datosHoy.fecha}
          personas={datosHoy.filas}
          editarFecha
          hoy={datosHoy.fecha}
          onEnviado={() => void hoy.recargar()}
        />
      )}
    </div>
  );
}
