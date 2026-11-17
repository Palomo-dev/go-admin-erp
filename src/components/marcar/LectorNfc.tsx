'use client';

/**
 * Lector de la etiqueta NFC de la sede (Figma 20.30.2) con Web NFC
 * (`NDEFReader`: Chrome para Android). La etiqueta solo dice en qué sede está
 * la persona: la hora la pone el servidor y la validez la decide `fn_hr_marcar`.
 *
 * - Empieza a leer al montarse (el toque en la pestaña «NFC» da el gesto que el
 *   navegador pide). Si el navegador exige otro gesto, muestra «Activar lectura».
 * - Lee el primer registro de URL o de texto que sea una etiqueta de GO Admin
 *   (`contenidoNdef`) y se lo pasa a `onLeer`. Una etiqueta ajena → `onInvalida`.
 * - Sin Web NFC (iPhone, otros navegadores) no se monta: la pantalla muestra
 *   20.30.3 (`nfcDisponible()`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Nfc } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { contenidoNdef, type RegistroNdef } from './marcarMetodoLogica';
import { PanelLector } from './PanelLector';

interface EventoLecturaNdef extends Event {
  message: { records: readonly RegistroNdef[] };
}
interface LectorNdef extends EventTarget {
  scan(opciones?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((e: EventoLecturaNdef) => void) | null;
  onreadingerror: ((e: Event) => void) | null;
}
type ConstructorLectorNdef = new () => LectorNdef;

function constructorNdef(): ConstructorLectorNdef | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { NDEFReader?: ConstructorLectorNdef }).NDEFReader ?? null;
}

/** ¿Este navegador lee etiquetas NFC? (Web NFC solo existe en Chrome para Android, en contexto seguro). */
export function nfcDisponible(): boolean {
  return constructorNdef() !== null;
}

function decodificar(datos: DataView, codificacion: string): string {
  return new TextDecoder(codificacion).decode(datos);
}

/** Una misma etiqueta leída dos veces seguidas no se manda dos veces. */
const VENTANA_REPETIDA_MS = 5_000;

export function LectorNfc({
  onLeer,
  onInvalida,
  onNoDisponible,
  procesando = false,
}: {
  onLeer: (contenido: string) => void;
  onInvalida: () => void;
  onNoDisponible: () => void;
  procesando?: boolean;
}) {
  const t = useTranslations('hrmMarcacion.nfc');
  const [estado, setEstado] = useState<'leyendo' | 'gesto'>('leyendo');
  const ultima = useRef<{ contenido: string; en: number } | null>(null);
  const callbacks = useRef({ onLeer, onInvalida, onNoDisponible, procesando });
  callbacks.current = { onLeer, onInvalida, onNoDisponible, procesando };
  const control = useRef<AbortController | null>(null);

  const empezar = useCallback(async () => {
    const Ctor = constructorNdef();
    if (!Ctor) {
      callbacks.current.onNoDisponible();
      return;
    }
    control.current?.abort();
    const abortar = new AbortController();
    control.current = abortar;
    const lector = new Ctor();
    lector.onreading = (e) => {
      if (callbacks.current.procesando) return;
      const contenido = contenidoNdef(e.message.records, decodificar);
      if (!contenido) {
        callbacks.current.onInvalida();
        return;
      }
      const ahora = Date.now();
      if (ultima.current && ultima.current.contenido === contenido && ahora - ultima.current.en < VENTANA_REPETIDA_MS) return;
      ultima.current = { contenido, en: ahora };
      callbacks.current.onLeer(contenido);
    };
    lector.onreadingerror = () => callbacks.current.onInvalida();
    try {
      await lector.scan({ signal: abortar.signal });
      setEstado('leyendo');
    } catch (err) {
      if (abortar.signal.aborted) return;
      const nombre = err instanceof DOMException ? err.name : '';
      if (nombre === 'NotAllowedError') setEstado('gesto');
      else callbacks.current.onNoDisponible();
    }
  }, []);

  useEffect(() => {
    void empezar();
    return () => control.current?.abort();
  }, [empezar]);

  if (estado === 'gesto') {
    return (
      <PanelLector icono={Nfc} titulo={t('gesto.titulo')} descripcion={t('gesto.descripcion')}>
        <button type="button" className={clasesBoton({ variante: 'primario', className: 'mt-4' })} onClick={() => void empezar()}>
          <Nfc aria-hidden className="size-4" strokeWidth={1.5} />
          {t('gesto.activar')}
        </button>
      </PanelLector>
    );
  }
  return <PanelLector icono={Nfc} titulo={t('acercar')} descripcion={procesando ? t('registrando') : t('esperando')} animado={!procesando} rol="status" />;
}
