import type { ReactNode } from 'react';
import { MarcoHrm } from '@/components/hrm/navegacion/MarcoHrm';

/** Pestañas del módulo Recursos humanos (Figma 20, decisión 1): 9 de RR. HH. o 6 del jefe. */
export default function HrmLayout({ children }: { children: ReactNode }) {
  return <MarcoHrm>{children}</MarcoHrm>;
}
