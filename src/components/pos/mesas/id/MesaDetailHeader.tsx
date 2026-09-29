'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, GitMerge, Plus, History, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, RowActionsMenu, StatusBadge, type AccionFila } from '@/components/kit';

interface MesaDetailHeaderProps {
  mesaNombre: string;
  session: any;
  onRefresh: () => void;
  onCombinar: () => void;
  onAddProduct: () => void;
  onVerHistorial: () => void;
  getEstadoBadge: () => React.ReactNode;
}

/**
 * Cabecera del detalle de mesa: `PageHeader` del kit en variante `detail`
 * (migas a Mesas, badge de estado, ⋯ con Historial y Combinar, primaria
 * «Agregar producto»). En móvil la barra del shell lleva «←» y el mismo menú.
 */
export function MesaDetailHeader({
  mesaNombre,
  session,
  onRefresh,
  onCombinar,
  onAddProduct,
  onVerHistorial,
  getEstadoBadge,
}: MesaDetailHeaderProps) {
  const t = useTranslations('posMesas');

  const accionesMas: AccionFila[] = [
    { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: onVerHistorial },
    { id: 'combinar', etiqueta: t('detalle.combinarMesa'), icono: GitMerge, onSelect: onCombinar },
  ];

  const badge = session ? getEstadoBadge() : <StatusBadge estado="free" etiqueta={t('detalle.disponible')} tono="exito" tamano="md" />;

  return (
    <PageHeader
      variante="detail"
      titulo={mesaNombre}
      subtitulo={session?.restaurant_tables?.zone || undefined}
      icono={UtensilsCrossed}
      migas={[{ etiqueta: t('titulo'), href: '/app/pos/mesas' }, { etiqueta: mesaNombre }]}
      volverA="/app/pos/mesas"
      badge={badge}
      acciones={
        <>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={onRefresh}
            aria-label={t('acciones.actualizar')}
            title={t('acciones.actualizar')}
          >
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
          <RowActionsMenu orientacion="horizontal" tamano="md" acciones={accionesMas} />
          <Button className="h-10 gap-2" onClick={onAddProduct}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detalle.agregarProducto')}
          </Button>
        </>
      }
      movil={{
        accion: (
          <RowActionsMenu
            orientacion="horizontal"
            tamano="md"
            titulo={mesaNombre}
            acciones={[
              { id: 'agregar', etiqueta: t('detalle.agregarProducto'), icono: Plus, onSelect: onAddProduct },
              { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: onRefresh },
              ...accionesMas.map((a, i) => (i === 0 ? { ...a, separadorAntes: true } : a)),
            ]}
          />
        ),
      }}
    />
  );
}
