'use client';

/**
 * Límite de error para el contenido de una pestaña.
 *
 * Cierra el parcial del ítem 11 (tester r2): el `.catch()` del `next/dynamic`
 * de `PlantillasPage` solo cubre el fallo de IMPORT (chunk que no baja, export
 * renombrado). Un `throw` en tiempo de RENDER dentro del componente cargado
 * seguía tumbando toda la página de plantillas, incluida la pestaña de email.
 *
 * React no ofrece límites de error con hooks: tiene que ser una clase con
 * `getDerivedStateFromError`. Es la única clase de la fase, y a propósito.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nombre legible de la pestaña, para el aviso y el log. */
  label: string;
  fallback?: ReactNode;
}

interface State {
  failed: boolean;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[plantillas] error de render en la pestaña ${this.props.label}`, error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <p className="font-medium">No se pudo mostrar la pestaña {this.props.label}</p>
        <p className="mt-1">
          El resto de la página sigue funcionando. Recarga para volver a intentarlo; si el problema continúa, avisa al
          equipo con la hora exacta (el detalle queda en la consola del navegador).
        </p>
      </div>
    );
  }
}
