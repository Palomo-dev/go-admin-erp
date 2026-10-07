'use client';

import type { MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import MenuGroupEditor from '../MenuGroupEditor';
import MenuGroupManager from '../MenuGroupManager';
import MenuTreeEditor from '../MenuTreeEditor';
import type { ZonaGlobal } from './zonaGlobal';
import { useTranslations } from 'next-intl';

/**
 * Constructor del menú en una hoja lateral dentro del editor (Figma
 * 1791:903425): el lienzo sigue a la vista y no se sale de la página.
 *
 * - Encabezado con menú nombrado → `MenuGroupEditor` de ese menú (guarda al
 *   momento, como siempre).
 * - Encabezado sin menú nombrado → `MenuTreeEditor` (páginas «en el header»);
 *   sus cambios van al `pendingUpdatesRef` del editor y se guardan con
 *   «Guardar», igual que cuando vivía en el acordeón.
 * - Pie → `MenuGroupManager` (menús nombrados del pie).
 */
export interface HojaMenuProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  zona: ZonaGlobal;
  organizationId: number;
  /** Menú nombrado asignado al encabezado (`header_menu_id`), si hay. */
  menuEncabezado: { id: string; name: string } | null;
  pendingMenuUpdatesRef: MutableRefObject<Map<string, Record<string, unknown>>>;
  onPendingChanges: (hayPendientes: boolean) => void;
}

export function HojaMenu({
  abierto,
  onAbiertoChange,
  zona,
  organizationId,
  menuEncabezado,
  pendingMenuUpdatesRef,
  onPendingChanges,
}: HojaMenuProps) {
  const t = useTranslations('branding.editor');
  const esPie = zona === 'footer';
  const titulo = esPie
    ? t('hojaMenu.menusPie')
    : t('hojaMenu.menuEncabezado', { menu: menuEncabezado ? menuEncabezado.name : t('hojaMenu.paginasSitio') });
  const subtitulo = esPie || menuEncabezado ? t('hojaMenu.subtituloAlMomento') : t('hojaMenu.subtituloConGuardar');

  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      subtitulo={subtitulo}
      ancho={640}
      pie={
        <Button type="button" onClick={() => onAbiertoChange(false)}>
          {t('hojaMenu.listo')}
        </Button>
      }
    >
      {esPie ? (
        <MenuGroupManager organizationId={organizationId} />
      ) : menuEncabezado ? (
        <MenuGroupEditor menuId={menuEncabezado.id} organizationId={organizationId} />
      ) : (
        <MenuTreeEditor
          organizationId={organizationId}
          pendingUpdatesRef={pendingMenuUpdatesRef}
          onPendingChanges={onPendingChanges}
        />
      )}
    </HojaDetalle>
  );
}
