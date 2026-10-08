'use client';

/**
 * «QR de la mesa»: el código que el cliente escanea para pedir desde la mesa.
 * Por mesa (menú de la tarjeta) o en lote (todas las mesas visibles de la sede
 * o de una zona), con hoja imprimible.
 *
 * La URL es `https://<sitio>/menu?mesa=<id>` (`urlQrMesa`, contrato con el
 * sitio). El host es el del sitio publicado de la organización (`useUrlSitio`:
 * dominio propio verificado o subdominio), nunca un literal. Si la mesa es de
 * una sede que el sitio sirve aparte (`/<slug>` o dominio propio), el QR lleva
 * a la carta de ESA sede: su Carta QR, su carta y su caja. Sin sitio
 * publicado no hay QR: se explica y se enlaza a Sitio web.
 */
import { useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useUrlSitio } from '@/components/sitio-web/useUrlSitio';
import { escaparHtml, urlQrMesa } from '@/lib/pos/mesas/qrMesa';

export interface MesaParaQr {
  id: string;
  name: string;
  zone: string | null;
  /** `restaurant_tables.branch_id`: decide a qué sitio (principal o de la sede) lleva el QR. */
  branchId?: number | null;
}

interface Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesas: readonly MesaParaQr[];
  /** Encabezado de la hoja (nombre de la mesa, de la zona o de la sede). */
  titulo: string;
}

export function MesaQrDialog({ abierto, onAbiertoChange, mesas, titulo }: Props) {
  const t = useTranslations('posMesas.qr');
  const { organization } = useOrganization();
  const sitio = useUrlSitio(organization?.id ?? null);
  // Sedes de BranchContext (`select('*')`: slug, dominio propio, publicada en la web, principal).
  // Fuera de BranchProvider no hay sedes: el QR va al sitio principal, como antes.
  const branches = useBranchOpcional()?.branches ?? [];
  const sedeDe = (branchId: number | null | undefined) =>
    typeof branchId === 'number' ? branches.find((b) => b.id === branchId) ?? null : null;
  const hojaRef = useRef<HTMLDivElement>(null);

  const imprimir = () => {
    const html = hojaRef.current?.innerHTML;
    if (!html) return;
    const ventana = window.open('', '_blank', 'width=900,height=700');
    if (!ventana) return;
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:16px;color:#111}
  .hoja{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
  .qr{border:1px dashed #999;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}
  .qr svg{width:220px;height:220px}
  .qr h3{margin:8px 0 0;font-size:20px}
  .qr p{margin:4px 0 0;font-size:13px;color:#444}
  @media print{body{margin:0}}
</style></head><body><div class="hoja">${html}</div></body></html>`);
    ventana.document.close();
    ventana.focus();
    ventana.print();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" aria-hidden="true" />
            {t('titulo', { mesa: titulo })}
          </DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>

        {sitio.cargando ? (
          <Skeleton className="h-64 w-full" />
        ) : !sitio.host ? (
          <div className="rounded-lg border border-line-warning bg-warning-subtle p-4 text-sm text-warning-text">
            <p>{t('sinSitio')}</p>
            <Link href="/app/sitio-web" className="mt-2 inline-block font-medium underline">
              {t('irASitio')}
            </Link>
          </div>
        ) : mesas.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinMesas')}</p>
        ) : (
          <div ref={hojaRef} className="grid gap-4 sm:grid-cols-2">
            {mesas.map((mesa) => {
              const url = urlQrMesa(sitio.host, mesa.id, sedeDe(mesa.branchId));
              if (!url) return null;
              return (
                <div key={mesa.id} className="qr flex flex-col items-center rounded-xl border border-dashed border-line p-4 text-center">
                  <QRCodeSVG value={url} size={180} level="M" includeMargin role="img" aria-label={t('codigoDe', { mesa: mesa.name })} />
                  <h3 className="mt-2 text-lg font-semibold text-fg">{mesa.name}</h3>
                  {mesa.zone && <p className="text-sm text-fg-secondary">{mesa.zone}</p>}
                  <p className="text-sm text-fg-secondary">{t('escanea')}</p>
                  <p className="mt-1 break-all text-xs text-fg-muted">{url}</p>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onAbiertoChange(false)}>
            {t('cerrar')}
          </Button>
          <Button onClick={imprimir} disabled={!sitio.host || mesas.length === 0}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('imprimir')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
