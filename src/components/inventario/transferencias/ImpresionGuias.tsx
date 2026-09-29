'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationName } from '@/lib/hooks/useOrganization';
import { clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import type { DetalleTraslado } from '@/lib/inventario/transferencias/contrato';
import { estadoVisible } from '@/lib/inventario/transferencias/logica';
import { useCantidad, useEtiquetaEstadoTraslado } from './piezas';

const ID = 'impresion-guias-traslado';
const MAX_GUIAS = 30;

/**
 * «Imprimir guía de traslado» (menú ⋯ y barra masiva de Figma): una guía por
 * traslado con origen, destino, renglones (lote y seriales) y firmas de quien
 * entrega y quien recibe. Se imprime con el diálogo del navegador (también
 * «Guardar como PDF»); en pantalla no se ve nada.
 */
export function useImpresionGuias() {
  const { toast } = useToast();
  const t = useTranslations('inventarioTraslados.guia');
  const [detalles, setDetalles] = useState<DetalleTraslado[]>([]);

  const imprimir = useCallback(
    async (ids: number[], yaCargados: DetalleTraslado[] = []) => {
      const faltan = ids.filter((id) => !yaCargados.some((d) => d.traslado.id === id)).slice(0, MAX_GUIAS);
      try {
        const leidos = await Promise.all(faltan.map((id) => clienteTraslados.detalle(id)));
        const todos = [...yaCargados, ...leidos].filter((d) => d.traslado.estado !== 'cancelled');
        if (todos.length === 0) {
          toast({ title: t('nada') });
          return;
        }
        setDetalles(todos);
      } catch {
        toast({ variant: 'destructive', title: t('error') });
      }
    },
    [t, toast],
  );

  const nodo = detalles.length > 0 ? <Guias detalles={detalles} onTerminado={() => setDetalles([])} /> : null;
  return { imprimir, nodo };
}

function Guias({ detalles, onTerminado }: { detalles: DetalleTraslado[]; onTerminado: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!montado) return;
    const fin = () => onTerminado();
    window.addEventListener('afterprint', fin, { once: true });
    const espera = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(espera);
      window.removeEventListener('afterprint', fin);
    };
  }, [montado, onTerminado]);

  if (!montado) return null;
  return createPortal(
    <div id={ID}>
      <style>{`@media screen { #${ID} { display: none; } }
@media print {
  body > *:not(#${ID}) { display: none !important; }
  #${ID} { display: block; color: #0f172a; font-size: 12px; }
  #${ID} .guia { break-after: page; page-break-after: always; }
  #${ID} .guia:last-child { break-after: auto; page-break-after: auto; }
  @page { margin: 14mm; }
}`}</style>
      {detalles.map((d) => (
        <Guia key={d.traslado.id} detalle={d} />
      ))}
    </div>,
    document.body,
  );
}

function Guia({ detalle }: { detalle: DetalleTraslado }) {
  const t = useTranslations('inventarioTraslados.guia');
  const etiquetaEstado = useEtiquetaEstadoTraslado();
  const cantidad = useCantidad();
  const { formatDateTime, formatPlain } = useFormatDate();
  const tr = detalle.traslado;
  const conDiferencia = detalle.items.some((i) => i.faltante > 0);

  const fila = (etiqueta: string, valor: ReactNode) => (
    <div>
      <dt style={{ color: '#475569', fontSize: 11 }}>{etiqueta}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{valor}</dd>
    </div>
  );

  return (
    <section className="guia" aria-label={t('titulo', { codigo: tr.code })}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, color: '#475569' }}>{getOrganizationName()}</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>{t('titulo', { codigo: tr.code })}</h1>
        </div>
        <p style={{ margin: 0, fontWeight: 600 }}>{etiquetaEstado(estadoVisible({ estado: tr.estado, con_diferencia: conDiferencia }))}</p>
      </header>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {fila(t('origen'), tr.origen.nombre ?? '—')}
        {fila(t('destino'), tr.destino.nombre ?? '—')}
        {fila(t('creado'), formatDateTime(tr.creado_en))}
        {fila(t('despachado'), tr.despachado_en ? formatDateTime(tr.despachado_en) : '—')}
      </dl>
      {tr.notas && <p style={{ marginBottom: 12 }}>{t('nota', { nota: tr.notas })}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
            <th style={{ padding: '6px 4px' }}>{t('producto')}</th>
            <th style={{ padding: '6px 4px' }}>{t('lote')}</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>{t('cantidad')}</th>
            <th style={{ padding: '6px 4px', textAlign: 'right' }}>{t('recibido')}</th>
          </tr>
        </thead>
        <tbody>
          {detalle.items.map((i) => (
            <tr key={i.id} style={{ borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
              <td style={{ padding: '6px 4px' }}>
                <strong>{i.nombre}</strong>
                {i.sku ? <span style={{ color: '#475569' }}> · {i.sku}</span> : null}
                {i.seriales.length > 0 && (
                  <div style={{ color: '#475569', fontSize: 11 }}>{t('seriales', { lista: i.seriales.map((s) => s.serial).join(', ') })}</div>
                )}
              </td>
              <td style={{ padding: '6px 4px' }}>
                {i.lote ? `${i.lote.codigo}${i.lote.vence ? ` · ${formatPlain(i.lote.vence)}` : ''}` : '—'}
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{cantidad(i.cantidad)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{tr.estado === 'pending' ? '' : cantidad(i.recibido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 56 }}>
        <p style={{ borderTop: '1px solid #0f172a', paddingTop: 6, margin: 0 }}>{t('entrega', { sucursal: tr.origen.nombre ?? '' })}</p>
        <p style={{ borderTop: '1px solid #0f172a', paddingTop: 6, margin: 0 }}>{t('recibe', { sucursal: tr.destino.nombre ?? '' })}</p>
      </div>
    </section>
  );
}
