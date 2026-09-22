'use client';

import { useEffect, useRef } from 'react';
import { BarcodeWedgeDetector, type BarcodeWedgeOptions } from '@/lib/pos/barcodeWedge';

interface Options extends BarcodeWedgeOptions {
  /** Se llama con el código escaneado. */
  onScan: (code: string) => void;
  enabled?: boolean;
}

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/**
 * El lector escribe el código en el campo que tenga el foco (el buscador del
 * POS, normalmente). Al reconocer el escaneo se retira ese texto del campo
 * con el setter nativo + evento `input`, que es lo que React escucha en un
 * campo controlado: el buscador queda como estaba y no lanza una búsqueda.
 */
function stripFromActiveInput(code: string): void {
  const el = document.activeElement;
  if (!isEditable(el)) return;
  const value = el.value;
  if (!value.endsWith(code)) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;
  setter.call(el, value.slice(0, -code.length));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Con un diálogo abierto (variantes, cobro, caja) el escaneo no debe colarse en el carrito. */
function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * Escucha el teclado a nivel de ventana y entrega los códigos que llegan de
 * un lector físico (ver `BarcodeWedgeDetector`). Funciona con el foco en
 * cualquier sitio: buscador, cliente o ningún campo.
 */
export function useHardwareBarcodeScanner({ onScan, enabled = true, ...detectorOptions }: Options): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const optsRef = useRef(detectorOptions);

  useEffect(() => {
    if (!enabled) return;
    const detector = new BarcodeWedgeDetector(optsRef.current);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = (code: string) => {
      stripFromActiveInput(code);
      if (dialogOpen()) return;
      onScanRef.current(code);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      const result = detector.push({
        key: e.key,
        at: performance.now(),
        withModifier: e.ctrlKey || e.altKey || e.metaKey,
      });
      if (result.type === 'scan') {
        e.preventDefault();
        e.stopPropagation();
        emit(result.code);
        return;
      }
      if (detector.pending.length > 0) {
        idleTimer = setTimeout(() => {
          idleTimer = null;
          const code = detector.flushIdle(performance.now());
          if (code) emit(code);
        }, detector.idleMs);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled]);
}
