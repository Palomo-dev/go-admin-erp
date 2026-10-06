'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { promedioEstrellas, type ValoracionMesa } from './cartaQrMesaLogica';
import { cargarValoracionesDeSesion } from './cartaQrMesaService';
import { useTextosCartaQr } from './textosCartaQr';

/**
 * Valoración de la visita en la ficha de un pedido «Comer aquí» (POS › Pedidos
 * online › el pedido): lo que la mesa valoró desde la Carta QR al terminar.
 * Sin valoraciones (o sin la migración) no se pinta.
 */
export function ValoracionVisitaCard({ tableSessionId }: { tableSessionId: string }) {
  const t = useTextosCartaQr();
  const [vals, setVals] = useState<ValoracionMesa[]>([]);
  useEffect(() => {
    let vigente = true;
    cargarValoracionesDeSesion(tableSessionId).then((v) => vigente && setVals(v));
    return () => {
      vigente = false;
    };
  }, [tableSessionId]);
  if (vals.length === 0) return null;
  const promedio = promedioEstrellas(vals);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          {t('valoracion.titulo')}
          {promedio != null && (
            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
              <Star aria-hidden="true" className="size-4 fill-warning text-warning" strokeWidth={1.5} />
              {t('valoracion.estrellas', { n: promedio })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {vals.map((v) => (
            <li key={v.id} className="text-sm">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-0.5" role="img" aria-label={t('valoracion.estrellas', { n: v.estrellas })}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} aria-hidden="true" className={cn('size-3.5', i <= v.estrellas ? 'fill-warning text-warning' : 'text-fg-muted')} strokeWidth={1.5} />
                  ))}
                </span>
                {v.comensal && <span className="text-fg-secondary">{v.comensal}</span>}
              </span>
              {v.aspectos.length > 0 && <span className="block text-fg-secondary">{t('valoracion.aspectos', { lista: v.aspectos.join(', ') })}</span>}
              <span className="block text-fg">{v.comentario ? `«${v.comentario}»` : <span className="text-fg-muted">{t('valoracion.sinComentario')}</span>}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
