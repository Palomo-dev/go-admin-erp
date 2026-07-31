'use client';

import { useMemo } from 'react';
import {
  buildSaleTicketHTML,
  buildKitchenTicketHTML,
  buildShipmentGuideHTML,
  buildElectronicInvoiceHTML,
  buildPlainTextSaleTicket,
  buildPlainTextTicket,
  buildPlainTextShipmentGuide,
  buildPlainTextElectronicInvoice,
  getPaperSpec,
  type PaperSpec,
} from '@printing';
import {
  buildSampleSaleTicket,
  buildSamplePreCuenta,
  buildSampleKitchenTicket,
  buildSampleShipmentGuide,
  buildSampleElectronicInvoice,
  type PreviewBusiness,
} from './sampleData';

/** Documento a previsualizar. Coincide con `print_jobs.job_type`. */
export type DocumentKind = 'sale_ticket' | 'pre_cuenta' | 'kitchen_ticket' | 'shipment_guide' | 'electronic_invoice';

/**
 * Camino de impresion:
 *   - `html`   lo usan el navegador y las impresoras de sistema (Windows).
 *   - `escpos` lo usan las impresoras termicas por red, USB o Bluetooth.
 */
export type RenderPath = 'html' | 'escpos';

export type PaperOption = '58mm' | '80mm';

export interface OverflowLine {
  text: string;
  length: number;
}

export interface PrintPreview {
  paper: PaperSpec;
  /** Documento HTML completo. Solo para el camino `html`. */
  html: string | null;
  /** Representacion en texto de lo que recibe la impresora termica. */
  text: string | null;
  /**
   * Lineas que no caben en el papel. En ESC/POS cada caracter ocupa una
   * posicion fija, asi que pasarse de `charsPerLine` significa que el texto
   * se corta o salta de linea en la impresora. Debe estar siempre vacio.
   */
  overflow: OverflowLine[];
}

/**
 * Genera la previsualizacion de un ticket con las MISMAS funciones que usan
 * el agente de impresion y el ERP en produccion (`@printing`). No hay una
 * plantilla aparte para la vista previa: si aqui se ve bien, en papel sale
 * bien.
 *
 * `business` es la cabecera real del negocio. Se recibe como parametro en vez
 * de leerla aqui para que el hook siga siendo sincrono y facil de razonar.
 */
export function usePrintPreview(
  kind: DocumentKind,
  path: RenderPath,
  width: PaperOption,
  business?: PreviewBusiness,
): PrintPreview {
  return useMemo(() => {
    const paper = getPaperSpec(width);

    if (kind === 'kitchen_ticket') {
      const payload = buildSampleKitchenTicket(business);
      const text = buildPlainTextTicket(payload, paper);
      return {
        paper,
        html: path === 'html' ? buildKitchenTicketHTML(payload, paper) : null,
        text,
        overflow: findOverflow(text, paper.charsPerLine),
      };
    }

    if (kind === 'shipment_guide') {
      const payload = buildSampleShipmentGuide(business);
      const text = buildPlainTextShipmentGuide(payload, paper);
      const rawHtml = path === 'html' ? buildShipmentGuideHTML(payload, paper) : null;
      const html = rawHtml
        ? rawHtml.replace(
            '</body>',
            `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<script>window.onload=function(){try{document.querySelectorAll('svg[data-barcode]').forEach(function(el){JsBarcode(el,el.getAttribute('data-barcode').trim(),{format:"CODE128",width:2,height:50,displayValue:false,margin:0,background:"#ffffff",lineColor:"#000000"})})}catch(e){}};</script>
</body>`,
          )
        : null;
      return {
        paper,
        html,
        text,
        overflow: findOverflow(text, paper.charsPerLine),
      };
    }

    if (kind === 'electronic_invoice') {
      const payload = buildSampleElectronicInvoice(business);
      const text = buildPlainTextElectronicInvoice(payload, paper);
      return {
        paper,
        html: path === 'html' ? buildElectronicInvoiceHTML(payload, paper) : null,
        text,
        overflow: findOverflow(text, paper.charsPerLine),
      };
    }

    const payload =
      kind === 'pre_cuenta' ? buildSamplePreCuenta(business) : buildSampleSaleTicket(business);
    const text = buildPlainTextSaleTicket(payload, paper);

    return {
      paper,
      html: path === 'html' ? buildSaleTicketHTML(payload, paper) : null,
      text,
      overflow: findOverflow(text, paper.charsPerLine),
    };
  }, [kind, path, width, business]);
}

function findOverflow(text: string, charsPerLine: number): OverflowLine[] {
  return text
    .split('\n')
    .filter((line) => line.length > charsPerLine)
    .map((line) => ({ text: line, length: line.length }));
}
