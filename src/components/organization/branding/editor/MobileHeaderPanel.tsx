'use client';

import { CelularEncabezado } from '@/components/sitio-web/editor/inspector/CelularEncabezado';

/**
 * Celular del encabezado en el editor viejo: es el mismo apartado «Celular» del panel
 * Encabezado (una sola fuente para el menú, el logo, el orden, los íconos y el menú inferior).
 */
interface MobileHeaderPanelProps {
  settings: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (updates: any) => void;
}

export default function MobileHeaderPanel({ settings, onUpdate }: MobileHeaderPanelProps) {
  return <CelularEncabezado ajustes={settings as Record<string, unknown>} cambiar={onUpdate} />;
}
