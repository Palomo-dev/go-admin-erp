'use client';

/**
 * Cabecera de Equipo comercial (Figma CRM 1411:837770, 1411:838455,
 * 1412:837868): `PageHeader` con migas «CRM › Equipo», icono y subtítulo de la
 * pestaña, sus acciones, y debajo el SegmentedControl Equipos · Territorios ·
 * Asignación. Desempeño (1412:838392) no lleva segmentos.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, type PageHeaderMovil } from '@/components/kit/PageHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SEGMENTOS_EQUIPO, type PestanaEquipo } from './equipoPantallaLogica';

export interface CabeceraEquipoProps {
  pestana: PestanaEquipo;
  onPestana: (p: PestanaEquipo) => void;
  titulo?: string;
  subtitulo: ReactNode;
  icono: LucideIcon;
  acciones?: ReactNode;
  cargando?: boolean;
  movil?: PageHeaderMovil;
  volverA?: string;
}

export function CabeceraEquipo({ pestana, onPestana, titulo, subtitulo, icono, acciones, cargando, movil, volverA }: CabeceraEquipoProps) {
  const t = useTranslations('crm.equipo.pantalla');
  const conSegmentos = pestana !== 'desempeno';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo={titulo ?? t('titulo')}
        subtitulo={subtitulo}
        icono={icono}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.equipo'), href: conSegmentos ? undefined : '/app/crm/equipo' }]}
        acciones={acciones}
        cargando={cargando}
        movil={movil}
        volverA={volverA}
      />
      {conSegmentos && (
        <SegmentedControl
          etiqueta={t('segmentos.aria')}
          valor={pestana as (typeof SEGMENTOS_EQUIPO)[number]}
          onValorChange={(v) => onPestana(v)}
          opciones={SEGMENTOS_EQUIPO.map((v) => ({ valor: v, etiqueta: t(`segmentos.${v}`) }))}
          className="max-w-full self-start overflow-x-auto"
        />
      )}
    </div>
  );
}
