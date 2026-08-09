'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Printer, Receipt, ChefHat, FileText, Monitor, Usb, Package, FileCheck } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PreviewViewer } from './PreviewViewer';
import { usePreviewBusiness } from './usePreviewBusiness';
import {
  usePrintPreview,
  type DocumentKind,
  type RenderPath,
  type PaperOption,
} from './usePrintPreview';

const DOCUMENTS: Array<{ value: DocumentKind; label: string; description: string; icon: typeof Receipt }> = [
  { value: 'sale_ticket', label: 'Ticket de venta', description: 'Recibo de caja con pagos', icon: Receipt },
  { value: 'pre_cuenta', label: 'Pre-cuenta', description: 'Cuenta de mesa sin pago', icon: FileText },
  { value: 'kitchen_ticket', label: 'Comanda', description: 'Orden para cocina o bar', icon: ChefHat },
  { value: 'shipment_guide', label: 'Guia de envio', description: 'Guia con corte automatico', icon: Package },
  { value: 'electronic_invoice', label: 'Factura electronica', description: 'Factura DIAN con CUFE y QR', icon: FileCheck },
];

const PATHS: Array<{ value: RenderPath; label: string; description: string; icon: typeof Monitor }> = [
  { value: 'html', label: 'HTML', description: 'Navegador e impresoras del sistema', icon: Monitor },
  { value: 'escpos', label: 'ESC/POS', description: 'Termicas por red, USB o Bluetooth', icon: Usb },
];

const WIDTHS: PaperOption[] = ['80mm', '58mm'];

/**
 * Avance horizontal de un caracter en Courier New, en fracciones de em.
 *
 * Es una fuente monoespaciada, asi que el ancho de una linea es exactamente
 * `numeroDeCaracteres * fontSize * 0.6`. De ahi se despeja el tamano que hace
 * que `charsPerLine` columnas quepan justo en el area imprimible, en vez de
 * fijar un tamano a ojo: con 11px, 48 columnas median 317px sobre un papel de
 * 272px y el ticket se salia de la hoja.
 *
 * La negrita no altera este calculo (en una monoespaciada el avance no cambia)
 * pero es imprescindible: el trazo normal de Courier New es tan fino que apenas
 * quema el papel termico y la prueba salia casi invisible.
 */
const COURIER_CHAR_ADVANCE_EM = 0.6;

/**
 * Previsualizacion de impresiones.
 *
 * Renderiza los tickets con las mismas funciones que usan el agente y el ERP
 * (`@printing`), de modo que sirve para validar un cambio de plantilla sin
 * gastar papel ni depender de tener una impresora conectada.
 */
export function ImpresionesPage({ embedded = false }: { embedded?: boolean }) {
  const [kind, setKind] = useState<DocumentKind>('pre_cuenta');
  const [path, setPath] = useState<RenderPath>('html');
  const [width, setWidth] = useState<PaperOption>('80mm');

  const { business, isLoading: isLoadingBusiness, isReal } = usePreviewBusiness();
  const preview = usePrintPreview(kind, path, width, business);
  const { paper } = preview;

  const handlePrintTest = () => {
    if (path === 'html') {
      if (!preview.html) return;
      const win = window.open('', '_blank', `width=${paper.rollCssPx + 60},height=700`);
      if (!win) return;
      win.document.write(preview.html);
      win.document.close();
      win.onload = () => {
        win.focus();
        win.print();
      };
    } else {
      if (!preview.text) return;
      const win = window.open('', '_blank', `width=${paper.rollCssPx + 60},height=700`);
      if (!win) return;
      const fontSizePx =
        Math.floor((paper.cssPx / (paper.charsPerLine * COURIER_CHAR_ADVANCE_EM)) * 100) / 100;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Simulacion monoespaciada</title>
        <style>
          @page{margin:0;size:${paper.rollMm}mm auto}
          body{
            font-family:'Courier New',monospace;
            font-size:${fontSizePx}px;
            font-weight:700;
            line-height:1.35;
            white-space:pre;
            padding:6px ${paper.safeMarginMm}mm;
            color:#000;
            -webkit-print-color-adjust:exact;print-color-adjust:exact;
          }
        </style>
        </head><body>${preview.text.replace(/</g, '&lt;')}</body></html>`);
      win.document.close();
      win.onload = () => {
        win.focus();
        win.print();
      };
    }
  };

  return (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6"}>
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/app/pos/configuracion">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <Printer className="h-6 w-6 text-blue-600" />
                </div>
                Previsualizacion de Impresiones
              </h1>
              <p className="text-gray-500 dark:text-gray-400">POS / Configuracion / Impresiones</p>
            </div>
          </div>

          <Button onClick={handlePrintTest} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            {path === 'html' ? 'Imprimir prueba' : 'Imprimir simulacion'}
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button onClick={handlePrintTest} variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            {path === 'html' ? 'Imprimir prueba' : 'Imprimir simulacion'}
          </Button>
        </div>
      )}

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Que quieres revisar
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Se usan las mismas plantillas que imprimen las impresoras. La cabecera (logo, razon
            social, NIT, direccion y sucursal) es la de tu negocio; el cliente, los productos y el
            domicilio son de ejemplo, elegidos para forzar los casos que suelen descuadrar el ticket.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <OptionGroup label="Documento">
            {DOCUMENTS.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={kind === opt.value}
                onClick={() => setKind(opt.value)}
                icon={opt.icon}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </OptionGroup>

          <OptionGroup label="Camino de impresion">
            {PATHS.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={path === opt.value}
                onClick={() => setPath(opt.value)}
                icon={opt.icon}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </OptionGroup>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ancho de papel</p>
            <div className="flex flex-wrap items-center gap-2">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWidth(w)}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors',
                    width === w
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300',
                  )}
                >
                  {w}
                </button>
              ))}

              <div className="flex flex-wrap gap-2 ml-2">
                <Badge variant="outline">Rollo {paper.rollMm} mm</Badge>
                <Badge variant="outline">Imprimible {paper.printableMm} mm</Badge>
                <Badge variant="outline">Margen {paper.safeMarginMm} mm</Badge>
                <Badge variant="outline">{paper.charsPerLine} columnas</Badge>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              El ancho imprimible es menor que el del rollo porque los bordes quedan fuera del
              alcance del cabezal. La pagina se declara al ancho del rollo, para que el driver no
              la escale, y esos bordes se reservan con el margen.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Vista previa
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            {path === 'html'
              ? 'Renderizado al ancho exacto que tendra en la impresora.'
              : 'Texto tal como lo recibe la impresora termica, con la regla de columnas.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLoadingBusiness && !isReal && (
            <p className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              No se pudieron cargar los datos de tu negocio, asi que la cabecera es de ejemplo.
              Completalos en Configuracion de la organizacion para verlos aqui.
            </p>
          )}

          {path === 'escpos' && (
            <p className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              El boton imprime una <strong>simulacion</strong>: el texto en fuente monoespaciada
              enviado a la impresora del sistema. Sirve para revisar la maquetacion en columnas,
              pero no son comandos ESC/POS reales, asi que no prueba como responde una termica por
              red, USB o Bluetooth.
            </p>
          )}

          {path === 'escpos' && business?.businessLogoUrl && (
            <p className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
              El logo no aparece en esta vista porque aqui se muestra el texto que viaja a la
              impresora, y el logo viaja aparte como imagen. En papel se imprime centrado sobre el
              nombre del negocio. Usa la vista HTML para revisar como se ve.
            </p>
          )}
          <PreviewViewer preview={preview} path={path} />
        </CardContent>
      </Card>
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

interface OptionButtonProps {
  selected: boolean;
  onClick: () => void;
  icon: typeof Receipt;
  label: string;
  description: string;
}

function OptionButton({ selected, onClick, icon: Icon, label, description }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border-2 text-left transition-colors',
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300',
      )}
    >
      <Icon className={cn('h-5 w-5 mb-2', selected ? 'text-blue-600' : 'text-gray-400')} />
      <p className="font-medium text-gray-900 dark:text-white text-sm">{label}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  );
}
