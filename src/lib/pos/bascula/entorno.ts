/**
 * Qué puede leer este equipo: el puente `scale` de Go Admin Desktop y/o Web
 * Serial (Chrome/Edge fuera del Desktop). Sin dependencias de React ni de
 * servicios, para que el lector y el diálogo no arrastren la sesión.
 */
import { desktopScaleBridge, isDesktop } from '@/lib/utils/desktop';
import { serieDelNavegador, type EntornoBascula } from './transportes';

export function entornoBascula(): EntornoBascula {
  const enDesktop = isDesktop();
  return { desktop: desktopScaleBridge(), serial: enDesktop ? null : serieDelNavegador(), enDesktop };
}
