import type { ReactNode } from 'react';
import { MarcoHrm } from '@/components/hrm/navegacion/MarcoHrm';

/** Pestañas del módulo Recursos humanos (Figma 20): Empleados · Áreas · Cargos · Plazas · Aprobaciones. */
export default function HrmLayout({ children }: { children: ReactNode }) {
  return <MarcoHrm>{children}</MarcoHrm>;
}
