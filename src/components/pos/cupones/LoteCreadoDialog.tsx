'use client';

import { useTranslations } from 'next-intl';
import { CircleCheck } from 'lucide-react';
import { Dialogo } from '@/components/kit';
import { CodigoCupon } from './CodigoCupon';
import { csvLote } from './cuponesVista';
import { useFormatoCupones } from './useFormatoCupones';
import type { DatosLote, LoteCreado } from './types';

const VISIBLES = 8;

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

interface LoteCreadoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  lote: LoteCreado | null;
  datos: DatosLote | null;
}

/** «Lote creado» (Figma 1088:720506): códigos, «Exportar CSV» e «Imprimir tarjetas». */
export function LoteCreadoDialog({ abierto, onAbiertoChange, lote, datos }: LoteCreadoDialogProps) {
  const t = useTranslations('posCupones.loteCreado');
  const formato = useFormatoCupones();
  if (!lote || !datos) return null;

  const prefijo = datos.prefijo;
  const valor = datos.discount_type === 'percentage' ? `${formato.numero(datos.discount_value)} %` : formato.moneda.formatear(datos.discount_value);
  const partes = [
    t('cupones', { n: lote.creados }),
    datos.discount_type === 'percentage' && datos.max_discount_amount
      ? t('conTope', { valor, tope: formato.moneda.formatear(datos.max_discount_amount) })
      : valor,
    datos.min_purchase_amount ? t('compraMinima', { monto: formato.moneda.formatear(datos.min_purchase_amount) }) : null,
    datos.usage_limit ? t('usos', { n: datos.usage_limit }) : null,
  ].filter(Boolean);
  const inicio = datos.start_date && datos.start_date > formato.getToday() ? datos.start_date : null;

  const exportar = () => {
    const blob = new Blob(['﻿', csvLote(lote.codigos)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupones-${prefijo.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank', 'noopener=no,width=900,height=700');
    if (!ventana) return;
    const tarjetas = lote.codigos
      .map((c) => `<div class="t"><div class="v">${escaparHtml(valor)}</div><div class="c">${escaparHtml(c)}</div></div>`)
      .join('');
    ventana.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escaparHtml(t('titulo', { prefijo }))}</title>` +
        '<style>body{font-family:system-ui,sans-serif;margin:12mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}' +
        '.t{border:1px dashed #94a3b8;border-radius:3mm;padding:5mm;text-align:center;break-inside:avoid}' +
        '.v{font-size:14pt;font-weight:600;margin-bottom:2mm}.c{font-family:ui-monospace,monospace;font-size:13pt;letter-spacing:.06em}</style>' +
        `</head><body><div class="g">${tarjetas}</div><script>window.onload=function(){window.print()}</script></body></html>`,
    );
    ventana.document.close();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { prefijo })}
      descripcion={partes.join(' · ')}
      ancho={672}
      sinCancelar
      secundarios={[
        { etiqueta: t('imprimir'), onClick: imprimir },
        { etiqueta: t('exportar'), onClick: exportar },
      ]}
      primario={{ etiqueta: t('listo'), onClick: () => onAbiertoChange(false) }}
    >
      <div className="flex flex-col gap-3">
        <p role="status" className="flex items-start gap-2 rounded-lg bg-success-subtle px-3 py-2 text-sm text-success-text">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {inicio
            ? t('exitoProgramado', { n: lote.creados, prefijo, fecha: formato.diaPlano(inicio) })
            : t('exito', { n: lote.creados, prefijo })}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label={t('codigos')}>
          {lote.codigos.slice(0, VISIBLES).map((c) => (
            <li key={c}>
              <CodigoCupon codigo={c} vivo={false} />
            </li>
          ))}
        </ul>
        {lote.codigos.length > VISIBLES && <p className="text-xs text-fg-secondary">{t('yMas', { n: lote.codigos.length - VISIBLES })}</p>}
      </div>
    </Dialogo>
  );
}
