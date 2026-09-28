'use client';

/**
 * «Enviar» la factura por correo (antes era un aviso): el PDF lo arma el motor
 * de documentos y el correo sale por el canal transaccional del CRM
 * (`POST /api/facturas-venta/[id]/enviar`). WhatsApp queda para el enlace
 * firmado del motor (D6), que aún no existe.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Send } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { nuevaClaveIdempotencia } from '@/lib/finanzas/pagos/contrato';

export interface EnviarFacturaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  facturaId: string;
  numero: string;
  correo?: string | null;
}

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EnviarFacturaDialog({ abierto, onAbiertoChange, facturaId, numero, correo }: EnviarFacturaDialogProps) {
  const t = useTranslations('facturasVenta.enviar');
  const [para, setPara] = useState(correo ?? '');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClaveIdempotencia('factura'));

  useEffect(() => {
    if (!abierto) return;
    setPara(correo ?? '');
    setMensaje('');
    setError(null);
    clave.current = nuevaClaveIdempotencia('factura');
  }, [abierto, correo]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const org = getOrganizationId();
      const r = await fetch(`/api/facturas-venta/${encodeURIComponent(facturaId)}/enviar`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({ para: para.trim() || undefined, mensaje: mensaje.trim() || null, clave: clave.current }),
      });
      const c = (await r.json().catch(() => ({}))) as { codigo?: string; resultado?: { destino: string; adjunto: boolean } };
      if (!r.ok) {
        const k = `errores.${c.codigo ?? 'error_desconocido'}`;
        setError(t.has(k) ? t(k as never) : t('errores.error_desconocido'));
        return;
      }
      toastSuccess(t('enviado'), c.resultado?.adjunto ? t('enviadoA', { destino: c.resultado.destino }) : t('enviadoSinAdjunto', { destino: c.resultado?.destino ?? para }));
      onAbiertoChange(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo', { numero })}
      descripcion={t('descripcion')}
      icono={Send}
      ancho={520}
      primario={{ etiqueta: t('enviar'), onClick: () => void enviar(), cargando: enviando, deshabilitada: !para.trim(), motivo: t('sinCorreo') }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('para')}>
          {(c) => (
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
              <input id={c.id} type="email" value={para} onChange={(e) => setPara(e.target.value)} className={`${CLASES_CAMPO} pl-9`} />
            </div>
          )}
        </FormField>
        <FormField etiqueta={t('mensaje')}>
          {(c) => (
            <textarea
              id={c.id}
              rows={3}
              maxLength={2000}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          )}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
