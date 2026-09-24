'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageIcon, Loader2, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { combinarDetalle, combinacionesVariantes, incompleto } from '@/lib/inventario/importacion/web';
import { costoMaximoDetalles, MAX_DETALLES_WEB } from '@/lib/inventario/importacion/costosWeb';
import { detallarWeb, ErrorApi } from './apiImportacion';
import type { AsistenteImportacion } from './useAsistenteImportacion';

const PAGINA = 50;
const CONCURRENCIA = 5;

interface Props {
  a: AsistenteImportacion;
  orgId: number | undefined;
  onError: (m: string) => void;
  onInfo: (m: string) => void;
}

export function PasoSeleccionWeb({ a, orgId, onError, onInfo }: Props) {
  const t = useTranslations('productosImportar.web');
  const [visibles, setVisibles] = useState(PAGINA);
  const [detallando, setDetallando] = useState<{ actual: number; total: number } | null>(null);
  const [enCurso, setEnCurso] = useState<Set<number>>(new Set());
  const detener = useRef(false);
  const web = a.web;
  if (!web) return null;

  const pendientes = web.productos.map((p, i) => ({ p, i })).filter(({ p, i }) => web.seleccion.has(i) && p.url && incompleto(p)).slice(0, MAX_DETALLES_WEB);

  const completar = async () => {
    detener.current = false;
    setDetallando({ actual: 0, total: pendientes.length });
    let hechos = 0;
    let cobrados = 0;
    try {
      for (let b = 0; b < pendientes.length; b += CONCURRENCIA) {
        if (detener.current) break;
        const lote = pendientes.slice(b, b + CONCURRENCIA);
        setEnCurso(new Set(lote.map((x) => x.i)));
        const respuestas = await Promise.allSettled(lote.map((x) => detallarWeb(orgId, x.p.url!)));
        respuestas.forEach((r, k) => {
          if (r.status === 'fulfilled') {
            cobrados += r.value.creditos;
            if (r.value.producto) a.actualizarProductoWeb(lote[k].i, combinarDetalle(lote[k].p, r.value.producto));
          } else if (r.reason instanceof ErrorApi && r.reason.status === 402) {
            detener.current = true;
          }
        });
        if (detener.current && respuestas.some((r) => r.status === 'rejected' && r.reason instanceof ErrorApi && r.reason.status === 402)) onError(t('sinSaldo'));
        hechos += lote.length;
        setDetallando({ actual: hechos, total: pendientes.length });
      }
    } finally {
      a.sumarCreditosWeb(cobrados);
      setEnCurso(new Set());
      setDetallando(null);
      onInfo(t('creditosCobrados', { n: cobrados }));
    }
  };

  const todos = web.seleccion.size === web.productos.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <Checkbox checked={todos ? true : web.seleccion.size > 0 ? 'indeterminate' : false} onCheckedChange={() => a.alternarSeleccionWeb('todos')} />
          {t('seleccionarTodos', { sel: web.seleccion.size, total: web.productos.length })}
        </label>
        {detallando ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('completando', { actual: detallando.actual, total: detallando.total })}
            </span>
            <Button variant="outline" size="sm" onClick={() => (detener.current = true)}>
              <Square className="size-3.5" aria-hidden="true" /> {t('detener')}
            </Button>
          </div>
        ) : (
          pendientes.length > 0 && (
            <Button variant="outline" size="sm" onClick={completar} className="self-start sm:self-auto">
              <Sparkles className="size-4" aria-hidden="true" /> {t('completar', { n: pendientes.length })} · {t('hastaCreditos', { n: costoMaximoDetalles(pendientes.length) })}
            </Button>
          )
        )}
      </div>
      <p className="text-xs text-fg-secondary">{t('creditosSesion', { n: web.creditos })}</p>

      <ul className="flex flex-col gap-2">
        {web.productos.slice(0, visibles).map((p, i) => {
          const elegido = web.seleccion.has(i);
          const variantes = combinacionesVariantes(p.variants).length;
          const numero = (campo: 'price' | 'compare_price' | 'stock' | 'cost', valor: string) =>
            a.actualizarProductoWeb(i, { [campo]: valor === '' ? undefined : Number(valor) } as Partial<typeof p>);
          return (
            <li key={i} className={cn('flex gap-3 rounded-xl border p-3 transition-colors', elegido ? 'border-line-brand bg-brand-tint/40' : 'border-line bg-surface')}>
              <Checkbox className="mt-1" checked={elegido} onCheckedChange={() => a.alternarSeleccionWeb(i)} aria-label={t('elegir', { nombre: p.name })} />
              {p.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg border border-line object-cover sm:size-16" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle sm:size-16" aria-hidden="true">
                  <ImageIcon className="size-5 text-fg-muted" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input value={p.name} onChange={(e) => a.actualizarProductoWeb(i, { name: e.target.value })} className="h-8 text-sm font-medium" aria-label={t('campos.nombre')} />
                  {enCurso.has(i) && <Loader2 className="size-4 shrink-0 animate-spin text-brand" aria-label={t('obteniendo')} />}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(
                    [
                      ['price', t('campos.precio'), p.price],
                      ['compare_price', t('campos.comparacion'), p.compare_price],
                      ['cost', t('campos.costo'), p.cost],
                      ['stock', t('campos.stock'), p.stock],
                    ] as const
                  ).map(([campo, etiqueta, valor]) => (
                    <label key={campo} className="flex flex-col gap-0.5 text-[11px] text-fg-secondary">
                      {etiqueta}
                      <Input type="number" inputMode="decimal" min={0} value={valor ?? ''} onChange={(e) => numero(campo, e.target.value)} className="h-8 text-xs" />
                    </label>
                  ))}
                  <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-fg-secondary sm:col-span-1">
                    {t('campos.categoria')}
                    <Input value={p.category ?? ''} onChange={(e) => a.actualizarProductoWeb(i, { category: e.target.value })} className="h-8 text-xs" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {incompleto(p) && !enCurso.has(i) && (
                    <Badge tono="advertencia" tamano="sm">
                      {t('datosIncompletos')}
                    </Badge>
                  )}
                  {p.brand && (
                    <Badge tono="neutro" tamano="sm">
                      {p.brand}
                    </Badge>
                  )}
                  {variantes > 0 && (
                    <Badge tono="informacion" tamano="sm">
                      {t('variantes', { n: variantes })}
                    </Badge>
                  )}
                  {!!p.images?.length && <span className="text-[11px] text-fg-muted">{t('imagenes', { n: p.images.length })}</span>}
                </div>
                {p.description && <p className="line-clamp-2 text-xs text-fg-secondary">{p.description}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {visibles < web.productos.length && (
        <Button variant="ghost" onClick={() => setVisibles((v) => v + PAGINA)} className="self-center">
          {t('verMas', { n: Math.min(PAGINA, web.productos.length - visibles), total: web.productos.length - visibles })}
        </Button>
      )}
    </div>
  );
}
