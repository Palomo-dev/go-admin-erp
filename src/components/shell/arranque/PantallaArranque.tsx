'use client';

/**
 * Pantalla de arranque de GO Admin (Figma `02 Componentes` › PantallaArranque).
 *
 * Una sola pantalla para todo lo que pasa antes de montar la app: la usan «/»
 * (que no tiene contenido propio: decide a dónde ir) y `AuthGuard` (mientras
 * confirma la sesión en /app/**). Tres estados:
 *
 * 1. `comprobando` — isotipo, «GO Admin» y barra de progreso de marca.
 * 2. `entrando` — sesión confirmada: logo de la organización con el isotipo
 *    pequeño, su nombre y «Hola, <nombre> · <sucursal>» con lo que ya se sepa.
 * 3. `sinConexion` — no se pudo comprobar la sesión (red o base caída; el
 *    `initError` de SessionContext). Reintenta sola a los 10 s, o al volver la
 *    conexión, y ofrece reintentar ya o iniciar sesión de nuevo.
 *
 * Colores solo con tokens del tema (sin `dark:`); el movimiento respeta
 * `prefers-reduced-motion` (PantallaArranque.module.css).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Isotipo } from '../marca/Firma';
import { AvatarOrganizacion } from '../marca/AvatarOrganizacion';
import type { DatosArranque } from './datosArranque';
import estilos from './PantallaArranque.module.css';

/** Segundos hasta el reintento automático en el estado sin conexión. */
export const SEGUNDOS_REINTENTO = 10;

export type PropsPantallaArranque =
  | { estado: 'comprobando' }
  | { estado: 'entrando'; datos: DatosArranque }
  | {
      estado: 'sinConexion';
      onReintentar: () => void;
      /** Debe borrar la sesión local antes de ir al login (`limpiarSesionMuerta`). */
      onIniciarSesion: () => void | Promise<void>;
    };

function Lienzo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-screen w-full items-center justify-center bg-canvas px-6',
        'pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]',
        className
      )}
    >
      {children}
    </div>
  );
}

function BarraProgreso({ etiqueta }: { etiqueta: string }) {
  return (
    <div role="progressbar" aria-label={etiqueta} className="h-1 w-40 overflow-hidden rounded-full bg-brand-tint">
      <div className={cn('h-full rounded-full bg-brand', estilos.tramo)} />
    </div>
  );
}

function Comprobando() {
  const t = useTranslations('arranque');
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-6 text-center', estilos.aparece)}>
      <div className="flex flex-col items-center gap-3">
        <Isotipo tamano={64} />
        <p className="text-lg tracking-[-0.01em] text-fg">
          <span className="font-bold">GO </span>
          <span className="font-medium">Admin</span>
        </p>
      </div>
      <BarraProgreso etiqueta={t('comprobando')} />
      <p className="text-sm text-fg-secondary">{t('comprobando')}</p>
    </div>
  );
}

function Entrando({ datos }: { datos: DatosArranque }) {
  const t = useTranslations('arranque');
  const { organizacion, usuario, sucursal } = datos;
  const saludo = [usuario ? t('hola', { nombre: usuario }) : null, sucursal].filter(Boolean).join(' · ');
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-6 text-center', estilos.aparece)}>
      <div className="flex max-w-xs flex-col items-center gap-3">
        {organizacion ? (
          <span className="relative inline-flex">
            <AvatarOrganizacion
              id={organizacion.id}
              nombre={organizacion.nombre}
              logoUrl={organizacion.logoUrl}
              px={64}
              className="h-16 w-16 rounded-2xl text-xl"
            />
            <Isotipo tamano={16} className="absolute -bottom-1 -right-1 ring-2 ring-canvas" />
          </span>
        ) : (
          <Isotipo tamano={64} />
        )}
        {organizacion && (
          <p className="line-clamp-2 break-words text-lg font-semibold leading-6 text-fg">{organizacion.nombre}</p>
        )}
        {saludo && <p className="text-sm text-fg-secondary">{saludo}</p>}
      </div>
      <BarraProgreso etiqueta={t('entrando')} />
      <p className="text-sm text-fg-muted">{t('entrando')}</p>
    </div>
  );
}

function SinConexion({
  onReintentar,
  onIniciarSesion,
}: {
  onReintentar: () => void;
  onIniciarSesion: () => void | Promise<void>;
}) {
  const t = useTranslations('arranque');
  const [segundos, setSegundos] = useState(SEGUNDOS_REINTENTO);
  const [saliendo, setSaliendo] = useState(false);
  // El reintento se dispara una sola vez por montaje: al reintentar, AuthGuard
  // vuelve a «comprobando» y, si falla otra vez, este estado se monta de nuevo
  // con la cuenta en 10.
  const reintentado = useRef(false);
  const reintentar = useRef(onReintentar);
  useEffect(() => {
    reintentar.current = onReintentar;
  }, [onReintentar]);

  useEffect(() => {
    const disparar = () => {
      if (reintentado.current) return;
      reintentado.current = true;
      reintentar.current();
    };
    const intervalo = window.setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          window.clearInterval(intervalo);
          // Fuera del setState: no se llama a otro componente mientras React
          // calcula este estado.
          window.setTimeout(disparar, 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    // Si vuelve la conexión, no hace falta esperar.
    window.addEventListener('online', disparar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('online', disparar);
    };
  }, []);

  return (
    <div className={cn('flex w-full max-w-sm flex-col items-center gap-6 text-center', estilos.aparece)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning-subtle text-warning-text">
        <WifiOff className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold leading-6 text-fg">{t('sinConexionTitulo')}</h1>
        <p className="text-sm text-fg-secondary">{t('sinConexionMensaje')}</p>
        {/* Para lectores de pantalla una sola vez; la cuenta visible no se anuncia cada segundo. */}
        <p className="sr-only">{t('reintentoAutomatico', { segundos: SEGUNDOS_REINTENTO })}</p>
      </div>
      <p aria-hidden="true" className="text-xs tabular-nums text-fg-muted">
        {segundos > 0 ? t('reintentoEn', { segundos }) : t('reintentando')}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[240px]">
        <button
          type="button"
          onClick={() => {
            if (reintentado.current) return;
            reintentado.current = true;
            onReintentar();
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand outline-none transition-colors hover:bg-brand-action-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('reintentarAhora')}
        </button>
        <button
          type="button"
          disabled={saliendo}
          onClick={async () => {
            setSaliendo(true);
            try {
              await onIniciarSesion();
            } finally {
              setSaliendo(false);
            }
          }}
          className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
        >
          {t('iniciarSesionDeNuevo')}
        </button>
      </div>
    </div>
  );
}

export function PantallaArranque(props: PropsPantallaArranque) {
  return (
    <Lienzo>
      {props.estado === 'comprobando' && <Comprobando />}
      {props.estado === 'entrando' && <Entrando datos={props.datos} />}
      {props.estado === 'sinConexion' && (
        <SinConexion onReintentar={props.onReintentar} onIniciarSesion={props.onIniciarSesion} />
      )}
    </Lienzo>
  );
}
