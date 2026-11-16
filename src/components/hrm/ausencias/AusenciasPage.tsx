'use client';

/**
 * Recursos humanos › Ausencias (Figma 20.13 y 20.14): una sola ruta con tres
 * sub-pestañas en la URL (`?seccion=`): Vacaciones (por defecto), Incapacidades y
 * licencias, y Permisos. Cada vista dibuja su `PageHeader` con el icono de su
 * sección (`TreePalm`, `HeartPulse`, `DoorOpen`) y las pestañas del módulo debajo.
 */
import { IncapacidadesVista } from './IncapacidadesVista';
import { PermisosVista } from './PermisosVista';
import { useSeccion } from './piezasAusencias';
import { VacacionesVista } from './VacacionesVista';

export function AusenciasPage() {
  const [seccion, setSeccion] = useSeccion();
  if (seccion === 'incapacidades') return <IncapacidadesVista seccion={seccion} onSeccion={setSeccion} />;
  if (seccion === 'permisos') return <PermisosVista seccion={seccion} onSeccion={setSeccion} />;
  return <VacacionesVista seccion={seccion} onSeccion={setSeccion} />;
}
