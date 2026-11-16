'use client';

/**
 * Recursos humanos › Turnos (Figma 20.8): Programación · Plantillas · Rotaciones.
 *
 * Reemplaza a las páginas viejas de turnos, plantillas de turno y rotaciones
 * (`/app/hrm/plantillas-turno` y `/app/hrm/rotaciones` redirigen aquí con
 * `?vista=`). La cabecera es `PageHeader` con el icono del catálogo
 * (`CalendarRange`, decisión 6) y la barra de pestañas del módulo debajo.
 */
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarRange, Plus } from 'lucide-react';
import { PageHeader, SegmentedControl, clasesBoton, useOpcionUrl, useParametrosUrl } from '@/components/kit';
import { NavPestanasHrm } from '@/components/hrm/navegacion/NavPestanasHrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { esFechaPlana } from '@/lib/services/hrm/tipos';
import { lunesDe } from '@/lib/hrm/turnos/programacion';
import { RUTA_HRM } from '@/components/hrm/estructura/comun';
import { ProgramacionSemana, type CabeceraProgramacion } from './ProgramacionSemana';
import { PlantillasTurno } from './PlantillasTurno';
import { RotacionesTurno } from './RotacionesTurno';

const VISTAS = ['programacion', 'plantillas', 'rotaciones'] as const;
type Vista = (typeof VISTAS)[number];

interface Cabecera {
  subtitulo: string | undefined;
  acciones: React.ReactNode;
  cargando: boolean;
  sinPermiso: boolean;
}

export function TurnosPage({ rrhhMiga = true }: { rrhhMiga?: boolean }) {
  const t = useTranslations('hrmTurnos');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const [vista, setVista] = useOpcionUrl<Vista>('vista', VISTAS, 'programacion');
  const { leer, fijar } = useParametrosUrl();
  const semana = leer('semana');
  const lunes = esFechaPlana(semana) ? lunesDe(semana) : lunesDe(hoy);
  const [cab, setCab] = useState<Cabecera>({ subtitulo: undefined, acciones: null, cargando: true, sinPermiso: false });

  const onProgramacion = useCallback((c: CabeceraProgramacion) => setCab({ subtitulo: c.subtitulo, acciones: c.acciones, cargando: c.cargando, sinPermiso: c.sinPermiso }), []);
  const onLista = useCallback(
    (c: { subtitulo: string | undefined; puedeCrear: boolean; crear: () => void }, etiqueta: string) =>
      setCab({
        subtitulo: c.subtitulo,
        acciones: c.puedeCrear ? (
          <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={c.crear}>
            <Plus aria-hidden className="size-4" strokeWidth={1.5} />
            {etiqueta}
          </button>
        ) : null,
        cargando: c.subtitulo === undefined,
        sinPermiso: false,
      }),
    []
  );

  const selector = (
    <SegmentedControl
      etiqueta={t('vistas.etiqueta')}
      valor={vista}
      onValorChange={(v) => {
        setCab((c) => ({ ...c, acciones: null }));
        setVista(v);
      }}
      opciones={[
        { valor: 'programacion', etiqueta: t('vistas.programacion') },
        { valor: 'plantillas', etiqueta: t('vistas.plantillas') },
        { valor: 'rotaciones', etiqueta: t('vistas.rotaciones') },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={cab.sinPermiso ? undefined : cab.subtitulo}
        icono={CalendarRange}
        migas={rrhhMiga ? [{ etiqueta: t('rrhh'), href: RUTA_HRM }, { etiqueta: t('titulo') }] : [{ etiqueta: t('titulo') }]}
        debajo={cab.sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        cargando={cab.cargando}
        acciones={cab.sinPermiso ? undefined : cab.acciones}
      />
      {vista === 'programacion' ? (
        <ProgramacionSemana
          lunes={lunes}
          onLunesChange={(l) => fijar({ semana: l === lunesDe(hoy) ? null : l }, 'replace')}
          hoy={hoy}
          onCabecera={onProgramacion}
          selector={selector}
        />
      ) : vista === 'plantillas' ? (
        <PlantillasTurno
          selector={selector}
          onCabecera={(c) => onLista(c, t('plantillas.nueva'))}
          onVerUso={() => setVista('programacion')}
        />
      ) : (
        <RotacionesTurno selector={selector} hoy={hoy} onCabecera={(c) => onLista(c, t('rotaciones.nueva'))} />
      )}
    </div>
  );
}
