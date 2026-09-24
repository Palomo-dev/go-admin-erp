'use client';

/**
 * `/app/pos/ventas/nuevo` (D3): la venta nueva es la pantalla del POS. Sin
 * `?duplicar=` redirige al POS; con `?duplicar={id}` crea antes un carrito del
 * POS con las líneas de esa venta (`duplicarVentaEnPos`). Sustituye a
 * `NuevaVentaPage`, que tenía su propio carrito (segunda implementación).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { duplicarVentaEnPos } from '@/lib/pos/ventas/duplicarEnPos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function NuevaVenta() {
  const t = useTranslations('posVentas.nueva');
  const router = useRouter();
  const params = useSearchParams();
  const duplicar = params?.get('duplicar') ?? null;
  const hecho = useRef(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    if (!duplicar || !UUID.test(duplicar)) {
      router.replace('/app/pos');
      return;
    }
    duplicarVentaEnPos(duplicar)
      .then((r) => {
        if (r.agregadas === 0) toastError(t('ninguna'));
        else if (r.omitidas > 0) toastSuccess(t('conOmitidas', { n: r.agregadas, omitidas: r.omitidas }));
        else toastSuccess(t('lista', { n: r.agregadas }));
        router.replace('/app/pos');
      })
      .catch(() => setFallo(true));
  }, [duplicar, router, t]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface">
        {fallo ? (
          <EmptyState
            variante="error"
            titulo={t('error')}
            accion={{ etiqueta: t('irAlPos'), href: '/app/pos' }}
          />
        ) : (
          <EmptyState variante="empty" icono={Copy} titulo={duplicar ? t('preparando') : t('abriendo')} />
        )}
      </div>
    </div>
  );
}
