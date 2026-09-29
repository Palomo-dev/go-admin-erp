'use client';

import { useEffect, useRef } from 'react';
import { BarcodeWedgeDetector, type BarcodeWedgeOptions } from '@/lib/pos/barcodeWedge';

interface Options extends BarcodeWedgeOptions {
  /** Se llama con el código escaneado. */
  onScan: (code: string) => void;
  /**
   * Se llama cuando un escaneo se descarta porque hay un diálogo abierto (el
   * cobro, variantes, caja): la pantalla avisa en vez de callarse (D10).
   */
  onDescartado?: (code: string) => void;
  enabled?: boolean;
}

/** Detectores activos (uno por pantalla montada con el lector). */
const detectoresActivos = new Set<BarcodeWedgeDetector>();

/**
 * ¿El lector está a mitad de una ráfaga? (≥ 2 teclas seguidas dentro del
 * margen del detector). Los atajos de una sola tecla (`useAtajos({ hayRafaga })`)
 * lo consultan: 13 dígitos + Enter son un escaneo, no atajos (POS-PLAN R4).
 */
export function hayRafagaDelLector(): boolean {
  for (const d of detectoresActivos) if (d.pending.length >= 2) return true;
  return false;
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

/**
 * Clase de un diálogo que SÍ recibe escaneos: «Pesar» del POS (venta por peso
 * en un paso, PRODUCTOS-POR-PESO-BASCULA.md §11). Escanear otro producto con
 * «Pesar» esperando cancela la pesada pendiente y sigue con el nuevo
 * (`decidirEscaneoConPesarAbierto`); antes el escaneo se perdía.
 */
export const CLASE_DIALOGO_ACEPTA_ESCANEO = 'pos-acepta-escaneo';

/**
 * Con un diálogo abierto (variantes, cobro, caja) el escaneo no debe colarse en el carrito.
 * Exportada (L19 de docs/implementacion/POS-PLAN.md) para probarla con un documento simulado.
 */
export function dialogOpen(doc: Pick<Document, 'querySelector'> = document): boolean {
  const noAcepta = `:not(.${CLASE_DIALOGO_ACEPTA_ESCANEO})`;
  return !!doc.querySelector(
    `[role="dialog"][data-state="open"]${noAcepta}, [role="alertdialog"][data-state="open"]${noAcepta}`,
  );
}

/**
 * Escucha el teclado a nivel de ventana y entrega los códigos que llegan de
 * un lector físico (ver `BarcodeWedgeDetector`). Funciona con el foco en
 * cualquier sitio: buscador, cliente o ningún campo.
 */
export function useHardwareBarcodeScanner({ onScan, onDescartado, enabled = true, ...detectorOptions }: Options): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onDescartadoRef = useRef(onDescartado);
  onDescartadoRef.current = onDescartado;
  const optsRef = useRef(detectorOptions);

  useEffect(() => {
    if (!enabled) return;
    const detector = new BarcodeWedgeDetector(optsRef.current);
    detectoresActivos.add(detector);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const emit = (code: string) => {
      stripFromActiveInput(code);
      if (dialogOpen()) {
        onDescartadoRef.current?.(code);
        return;
      }
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
      detectoresActivos.delete(detector);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled]);
}
