'use client';

/**
 * Cabecera de los catálogos de domicilio de Logística: «Zonas y tarifas» (/app/logistica/zonas) y
 * «Reglas de despacho» (/app/logistica/reglas), Figma 2792:413 y 2794:1488.
 *
 * Los AJUSTES de Logística no viven aquí: están en Configuración › Logística (decisión de
 * configuración unificada, docs/configuracion/UNIFICACION-CONFIGURACION.md). Esta cabecera solo
 * lleva el atajo «Configurar», las migas, el `BranchBadge` (patrón 9) y las dos pestañas, que
 * navegan entre las dos rutas.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BranchBadgeActiva, PageHeader, TabBar, type PestanaTab } from '@/components/kit';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';

export const SECCION_CONFIG_LOGISTICA = 'logistica.general';
export const RUTAS_ZONAS = { zonas: '/app/logistica/zonas', reglas: '/app/logistica/reglas' } as const;
type PestanaZonas = keyof typeof RUTAS_ZONAS;

export interface CabeceraZonasProps {
  pestana: PestanaZonas;
  titulo: string;
  subtitulo: string;
  icono: LucideIcon;
  acciones?: ReactNode;
}

export function CabeceraZonas({ pestana, titulo, subtitulo, icono, acciones }: CabeceraZonasProps) {
  const t = useTranslations('logistica.zonas.pagina');
  const router = useRouter();
  const pestanas: PestanaTab<PestanaZonas>[] = (['zonas', 'reglas'] as const).map((valor) => ({ valor, etiqueta: t(`pestanas.${valor}`) }));
  return (
    <PageHeader
      titulo={titulo}
      subtitulo={subtitulo}
      icono={icono}
      migas={[{ etiqueta: t('migaLogistica'), href: '/app/logistica' }, { etiqueta: t(`pestanas.${pestana}`) }]}
      acciones={
        <>
          <AtajoConfigurar seccion={SECCION_CONFIG_LOGISTICA} />
          {acciones}
        </>
      }
      debajo={
        <div className="flex flex-col gap-4">
          <div>
            <BranchBadgeActiva />
          </div>
          <TabBar
            id="logistica-zonas-reglas"
            pestanas={pestanas}
            valor={pestana}
            onValorChange={(v) => router.push(RUTAS_ZONAS[v])}
            etiqueta={t('pestanas.etiqueta')}
          />
        </div>
      }
    />
  );
}
