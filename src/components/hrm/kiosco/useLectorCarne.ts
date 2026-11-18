'use client';

/**
 * Lectura de carnés en el kiosco (plan de Marcación M1). Tres fuentes, la misma salida:
 *  - Web NFC (Chrome en Android): `NDEFReader` entrega el número de serie (UID) del
 *    carné en cada lectura, aunque el carné no tenga registros NDEF.
 *  - App GO Admin (Capacitor) con `@capgo/capacitor-nfc` (`nfcService`): el `id` del tag.
 *  - Lector USB que «teclea» (GO Admin Escritorio o cualquier navegador): el código
 *    llega como teclas rápidas terminadas en Enter (`teclaLector`).
 * El valor nunca se interpreta aquí: `leerCarne` le da la forma y la base decide.
 */
import { useEffect, useRef, useState } from 'react';
import { leerCarne, teclaLector, TECLADO_VACIO, type TipoCarne } from '@/lib/hrm/kiosco/kiosco';
import { isNfcAvailable, startNfcScan, stopNfcScan } from '@/lib/services/nfcService';

interface LecturaNdef extends Event {
  serialNumber?: string;
}
interface LectorNdef extends EventTarget {
  scan(o?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((e: LecturaNdef) => void) | null;
}

export type FuenteLector = 'web_nfc' | 'app_nfc' | 'teclado';

/** Una misma lectura repetida en 4 s no se manda dos veces. */
const VENTANA_REPETIDA_MS = 4_000;

export function useLectorCarne(activo: boolean, alLeer: (c: { tipo: TipoCarne; valor: string }) => void): { fuentes: FuenteLector[] } {
  const [fuentes, setFuentes] = useState<FuenteLector[]>(['teclado']);
  const cb = useRef(alLeer);
  cb.current = alLeer;
  const activoRef = useRef(activo);
  activoRef.current = activo;
  const ultima = useRef<{ v: string; en: number } | null>(null);

  const entregar = (texto: string | null | undefined, origen: 'nfc' | 'teclado') => {
    if (!activoRef.current || !texto) return;
    const c = leerCarne(texto, origen);
    if (!c) return;
    const ahora = Date.now();
    if (ultima.current && ultima.current.v === c.valor && ahora - ultima.current.en < VENTANA_REPETIDA_MS) return;
    ultima.current = { v: c.valor, en: ahora };
    cb.current(c);
  };

  // Lector USB que teclea.
  useEffect(() => {
    let estado = TECLADO_VACIO;
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA')) return;
      const r = teclaLector(estado, e.key, e.timeStamp || performance.now());
      estado = r.estado;
      if (r.lectura) entregar(r.lectura, 'teclado');
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Web NFC (Android con Chrome).
  useEffect(() => {
    const Ctor = (window as unknown as { NDEFReader?: new () => LectorNdef }).NDEFReader;
    if (!Ctor) return;
    const control = new AbortController();
    const lector = new Ctor();
    lector.onreading = (e) => entregar(e.serialNumber ?? null, 'nfc');
    lector
      .scan({ signal: control.signal })
      .then(() => setFuentes((f) => (f.includes('web_nfc') ? f : [...f, 'web_nfc'])))
      .catch(() => undefined);
    return () => control.abort();
  }, []);

  // App nativa (Capacitor): escaneos de 60 s encadenados mientras el kiosco espera.
  useEffect(() => {
    if (!isNfcAvailable()) return;
    setFuentes((f) => (f.includes('app_nfc') ? f : [...f, 'app_nfc']));
    let vivo = true;
    const ciclo = async () => {
      while (vivo) {
        const r = await startNfcScan(60_000);
        if (!vivo) break;
        if (r.success && r.data?.id) entregar(r.data.id, 'nfc');
        else if (r.error && r.error !== 'timeout') await new Promise((ok) => setTimeout(ok, 5_000));
      }
    };
    void ciclo();
    return () => {
      vivo = false;
      void stopNfcScan();
    };
  }, []);

  return { fuentes };
}
