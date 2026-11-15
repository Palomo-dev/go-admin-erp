'use client';

/**
 * Marco de las páginas de Recursos humanos.
 *
 * En el Figma corregido (2026-11-15) la barra de pestañas del módulo va DEBAJO
 * del `PageHeader` de cada lista: la página la pone en `debajo={<NavPestanasHrm />}`
 * (Empleados y Aprobaciones ya lo hacen, ver `PAGINAS_CON_PESTANAS_PROPIAS`).
 * Mientras Áreas, Cargos y Plazas (frente «Estructura») no la pongan en su
 * cabecera, este marco la dibuja arriba para que la navegación no se pierda.
 * En detalle y formularios no se dibuja: las migas la reemplazan.
 */
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NavPestanasHrm } from './NavPestanasHrm';
import { muestraPestanasHrm, pestanaHrmActiva } from './navHrmLogica';

/** Listas que ya llevan la barra en su `PageHeader` (`debajo`). */
export const PAGINAS_CON_PESTANAS_PROPIAS: readonly string[] = ['/app/hrm/empleados', '/app/hrm/aprobaciones'];

export function MarcoHrm({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const propia = PAGINAS_CON_PESTANAS_PROPIAS.includes(pestanaHrmActiva(pathname) ?? '');
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      {muestraPestanasHrm(pathname) && !propia && <NavPestanasHrm className="shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
