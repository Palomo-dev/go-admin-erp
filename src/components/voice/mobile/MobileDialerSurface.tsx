'use client';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ALTO_BARRA_APP, useCabeceraMovilTemporal } from '@/components/shell/header/cabeceraMovil';
/** El marcador en reposo vive en el shell: comparte su header, navegación y permisos. */
export function MobileDialerSurface({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const t = useTranslations('phoneVisual'); const pathname = usePathname(); const initialPath = useRef(pathname);
  const header = useMemo(() => ({ modo: 'page' as const, titulo: t('phone'), subtitulo: '', accion: null, ocultarBarra: false, onVolver: onClose }), [t, onClose]);
  useCabeceraMovilTemporal(header);
  useEffect(() => { if (initialPath.current !== pathname) onClose(); }, [pathname, onClose]);
  return <div role="region" aria-label={t('phone')} className="fixed inset-x-0 z-30 flex min-h-0 flex-col overflow-hidden bg-canvas" style={{ top: 'calc(56px + env(safe-area-inset-top, 0px))', bottom: `var(--shell-barra-inferior, ${ALTO_BARRA_APP})` }}>{children}</div>;
}
