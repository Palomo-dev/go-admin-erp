'use client';

/**
 * Estado global del diálogo de Configuración (Figma pág. 10, sección 12).
 * Se monta UNA vez en el layout de /app, dentro de los proveedores del shell
 * (los paneles usan organización, sucursal y módulos).
 *
 * - El estado vive en la URL (`?config=chat.ia`, ver `dialogoUrl.ts`) sobre la
 *   pantalla actual: abrir hace `pushState` (Next 15 sincroniza
 *   `useSearchParams` sin volver a montar la página), cambiar de sección hace
 *   `replaceState` y cerrar vuelve atrás; así «Atrás» cierra el diálogo.
 * - Se abre con `abrirConfiguracion()` (evento), con Ctrl+, (Cmd+, en Mac) y
 *   con cualquier enlace a las rutas viejas de Configuración, que se
 *   intercepta aquí para abrir el diálogo sobre la pantalla actual.
 * - Cambios sin guardar: los paneles se registran (`useRegistrarCambios`); al
 *   cerrar, cambiar de sección o pulsar «Atrás» con cambios, se confirma con
 *   el `ConfirmDialog` del kit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/kit';
import { destinoDesdeRutaVieja, esRutaVieja, hrefConDialogo, hrefSinDialogo, leerDestino, type DestinoDialogo } from '../config/dialogoUrl';
import { EVENTO_ABRIR_CONFIGURACION, recordarPantalla, type OpcionesAbrirConfiguracion } from './abrirConfiguracion';
import { CambiosContext, type CambiosPanel } from './cambiosSinGuardar';
import { ConfiguracionDialogo } from './ConfiguracionDialogo';

/** Marca de las entradas del historial que abrió el diálogo (cerrar = volver atrás). */
const MARCA = '__goConfig';

function hrefActual(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function entradaPropia(): boolean {
  const estado = window.history.state as Record<string, unknown> | null;
  return estado?.[MARCA] === true;
}

/** Ctrl+, (Cmd+, en Mac): abre Configuración, como en los editores y en Claude Code. */
export function esAtajoConfiguracion(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return e.key === ',' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
}

export function ConfiguracionDialogoRaiz() {
  const t = useTranslations('configuracionDialogo');
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const enRutaVieja = esRutaVieja(pathname);
  const destino = enRutaVieja || !searchParams ? null : leerDestino(searchParams);

  const [registro, setRegistro] = useState<CambiosPanel | null>(null);
  const [pendiente, setPendiente] = useState<(() => void) | null>(null);
  const registroRef = useRef(registro);
  registroRef.current = registro;
  const ultimoDestino = useRef<DestinoDialogo | null>(null);
  const cerrando = useRef(false);

  // Última pantalla vista (sin el diálogo): la redirección de las rutas viejas abre el diálogo sobre ella.
  const query = searchParams?.toString() ?? '';
  useEffect(() => {
    if (!pathname || esRutaVieja(pathname)) return;
    recordarPantalla(hrefSinDialogo(query ? `${pathname}?${query}` : pathname));
  }, [pathname, query]);

  const hayCambios = () => (registroRef.current?.cambios ?? 0) > 0;

  /** Abre o cambia de sección. Abrir apila una entrada; cambiar la reemplaza. */
  const irA = useCallback((d: DestinoDialogo) => {
    const url = hrefConDialogo(hrefActual(), d);
    if (leerDestino(new URLSearchParams(window.location.search))) {
      window.history.replaceState({ [MARCA]: entradaPropia() }, '', url);
    } else {
      window.history.pushState({ [MARCA]: true }, '', url);
    }
  }, []);

  const cerrarYa = useCallback(() => {
    cerrando.current = true;
    if (entradaPropia()) window.history.back();
    else window.history.replaceState(null, '', hrefSinDialogo(hrefActual()));
  }, []);

  /** Ejecuta `accion`; si el panel tiene cambios sin guardar, primero pregunta. */
  const intentar = useCallback((accion: () => void) => {
    if (hayCambios()) setPendiente(() => accion);
    else accion();
  }, []);

  const abrir = useCallback(
    (d: DestinoDialogo) => {
      const actual = leerDestino(new URLSearchParams(window.location.search));
      if (actual && actual.seccionId === d.seccionId && !d.ancla) return;
      if (actual) intentar(() => irA(d));
      else irA(d);
    },
    [intentar, irA],
  );

  // «Atrás» con cambios sin guardar: se vuelve a poner el diálogo y se pregunta.
  useEffect(() => {
    if (destino) {
      ultimoDestino.current = destino;
      cerrando.current = false;
      return;
    }
    const previo = ultimoDestino.current;
    if (previo && hayCambios() && !cerrando.current) {
      window.history.pushState({ [MARCA]: true }, '', hrefConDialogo(hrefActual(), previo));
      setPendiente(() => cerrarYa);
      return;
    }
    ultimoDestino.current = null;
    cerrando.current = false;
    // `destino` cambia de identidad en cada render: basta su forma serializada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(destino), cerrarYa]);

  // Evento `abrirConfiguracion()`.
  useEffect(() => {
    const alAbrir = (e: Event) => {
      const o = ((e as CustomEvent<OpcionesAbrirConfiguracion>).detail ?? {}) as OpcionesAbrirConfiguracion;
      abrir({ seccionId: o.seccionId ?? null, ancla: o.ancla, movido: o.movido });
    };
    window.addEventListener(EVENTO_ABRIR_CONFIGURACION, alAbrir);
    return () => window.removeEventListener(EVENTO_ABRIR_CONFIGURACION, alAbrir);
  }, [abrir]);

  // Ctrl+, / Cmd+,
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!esAtajoConfiguracion(e)) return;
      e.preventDefault();
      if (!leerDestino(new URLSearchParams(window.location.search))) irA({ seccionId: null });
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [irA]);

  // Enlaces a las rutas viejas: se abren como diálogo sobre la pantalla actual
  // (en captura, antes que el `onClick` de `next/link`, que respeta `defaultPrevented`).
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (esRutaVieja(window.location.pathname)) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.getAttribute('href') ?? '', window.location.href);
      if (url.origin !== window.location.origin) return;
      const d = destinoDesdeRutaVieja(url.pathname, url.search, url.hash);
      if (!d) return;
      e.preventDefault();
      abrir(d);
    };
    document.addEventListener('click', alClic, true);
    return () => document.removeEventListener('click', alClic, true);
  }, [abrir]);

  const quitarMovido = useCallback(() => {
    const actual = leerDestino(new URLSearchParams(window.location.search));
    if (actual?.movido) window.history.replaceState({ [MARCA]: entradaPropia() }, '', hrefConDialogo(hrefActual(), { ...actual, movido: undefined }));
  }, []);

  /** «Abrir» de una sección que es otra pantalla: cierra el diálogo (sin dejarlo en el historial) y navega. */
  const abrirEnlace = useCallback(
    (href: string) => {
      intentar(() => {
        cerrando.current = true;
        window.history.replaceState(null, '', hrefSinDialogo(hrefActual()));
        router.push(href);
      });
    },
    [intentar, router],
  );

  // Con «Atrás» y cambios sin guardar se mantiene el diálogo montado mientras se pregunta.
  const mostrado = destino ?? (registro && registro.cambios > 0 && !cerrando.current ? ultimoDestino.current : null);

  return (
    <>
      {mostrado && (
        <CambiosContext.Provider value={setRegistro}>
          <ConfiguracionDialogo
            destino={mostrado}
            cambios={registro}
            onNavegar={abrir}
            onCerrar={() => intentar(cerrarYa)}
            onAbrirEnlace={abrirEnlace}
            onMovidoVisto={quitarMovido}
          />
        </CambiosContext.Provider>
      )}
      <ConfirmDialog
        abierto={pendiente !== null}
        onAbiertoChange={(v) => {
          if (!v) setPendiente(null);
        }}
        tono="advertencia"
        titulo={t('confirmar.titulo')}
        descripcion={t('confirmar.descripcion')}
        textoConfirmar={t('confirmar.descartar')}
        textoCancelar={t('confirmar.seguir')}
        onConfirmar={() => {
          const accion = pendiente;
          registroRef.current?.descartar();
          setRegistro(null);
          registroRef.current = null;
          setPendiente(null);
          accion?.();
        }}
      />
    </>
  );
}
