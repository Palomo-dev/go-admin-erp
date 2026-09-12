'use client';

/**
 * SoftphoneShell — passthrough transparente.
 *
 * El `SoftphoneProvider` YA NO se monta aquí: se monta en `AppLayout`, donde se
 * sabe si la organización tiene el módulo de CRM activo (`activeModuleCodes`).
 * Antes el provider se montaba siempre para todo /app/*, lo que provocaba que
 * el navegador pidiera permiso de micrófono al usuario en CADA carga de
 * página, incluso cuando el CRM no estaba activo. Ahora el provider recibe
 * `enabled={activeModuleCodes?.includes('crm')}` y solo inicializa el Device
 * (y por tanto solo toca el micrófono) cuando corresponde.
 *
 * Se mantiene este componente como passthrough para no alterar el árbol de
 * layout (`src/app/app/layout.tsx`); quitarlo requeriría editar el layout y
 * no aporta nada.
 */

import type { ReactNode } from 'react';

export function SoftphoneShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
