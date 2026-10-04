'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Navegación de presentación: los registros y permisos los resuelve cada página. */
interface Options {
  pathname: string;
  ready: boolean;
  canManage: boolean;
  scope: number | null;
  onTarget: (target: string | null) => void;
  blocked: () => boolean;
}

export function editorTarget(url: URL): string | null {
  const value = url.searchParams.get('editor');
  return value === 'new' || value === 'example' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '') ? value : null;
}

export function useInPageEditorNavigation(options: Options) {
  const latest = useRef(options); latest.current = options;
  const previousScope = useRef(options.scope);
  const handled = useRef<string | null>(null);
  const editorUrl = useRef<string | null>(null);
  const apply = useCallback(() => {
    const current = latest.current;
    if (!current.ready || window.location.pathname !== current.pathname) return;
    const target = current.canManage ? editorTarget(new URL(window.location.href)) : null;
    const signature = `${current.scope}:${target ?? ''}`;
    if (handled.current === signature) return;
    handled.current = signature;
    editorUrl.current = target ? window.location.href : null;
    current.onTarget(target);
  }, []);

  const open = useCallback((target: string) => {
    if (!latest.current.canManage || latest.current.blocked()) return;
    const url = new URL(window.location.href);
    url.pathname = latest.current.pathname; url.searchParams.set('editor', target);
    window.history.pushState(window.history.state, '', url);
    apply();
  }, [apply]);
  const close = useCallback(() => {
    const url = new URL(window.location.href); url.searchParams.delete('editor');
    window.history.replaceState(window.history.state, '', url);
    handled.current = null; editorUrl.current = null;
    latest.current.onTarget(null);
  }, []);

  useEffect(() => {
    if (previousScope.current !== options.scope) {
      const changedOrganization = previousScope.current !== null;
      previousScope.current = options.scope;
      handled.current = null; editorUrl.current = null;
      // La primera resolución de sesión conserva el enlace profundo; un cambio real lo retira.
      if (changedOrganization) {
        const url = new URL(window.location.href); url.searchParams.delete('editor');
        window.history.replaceState(window.history.state, '', url);
      }
    }
    apply();
  }, [options.ready, options.canManage, options.scope, apply]);
  useEffect(() => {
    const onPop = () => {
      // Atrás durante un guardado no desmonta el formulario ni permite otra mutación.
      if (latest.current.blocked() && editorUrl.current) {
        window.history.pushState(window.history.state, '', editorUrl.current);
        return;
      }
      apply();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [apply]);
  return { open, close };
}
