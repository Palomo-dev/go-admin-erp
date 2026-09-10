'use client';

/**
 * SoftphoneShell — monta el SoftphoneProvider global para todo /app/*.
 *
 * El dock flotante y el aviso de llamada entrante YA NO se montan aquí: viven en
 * `AppLayout`, que es donde se sabe si la organización tiene el módulo de CRM
 * activo. El motivo es de orden de montaje: `ModuleProvider` vive DENTRO de
 * `AppLayout`, que a su vez es hijo de este componente, así que consultar aquí
 * el acceso a módulos rompía la aplicación entera con
 * «useModuleContext must be used within a ModuleProvider».
 *
 * El provider sí envuelve siempre a `children`, porque `useSoftphone()` está
 * pensado para poder llamarse sin provider y devolver `{ available: false }`;
 * quitarlo cambiaría ese contrato para el resto de la aplicación.
 */

import type { ReactNode } from 'react';
import { SoftphoneProvider } from './SoftphoneProvider';

export function SoftphoneShell({ children }: { children: ReactNode }) {
  return <SoftphoneProvider>{children}</SoftphoneProvider>;
}
