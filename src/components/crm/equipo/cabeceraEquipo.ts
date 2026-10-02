import type { ReactNode } from 'react';

/** El padre compone PageHeader; cada pestaña conserva sus acciones y permisos. */
export type CabeceraEquipo = (acciones?: ReactNode, accionMovil?: ReactNode) => ReactNode;
