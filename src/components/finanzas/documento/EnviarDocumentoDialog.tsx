'use client';

/**
 * «Enviar» un documento por correo (Figma C10 `739:50870`; FINANZAS-DOCUMENTOS-V2
 * §2.2). Generaliza el diálogo de la factura de venta: el PDF lo arma el motor
 * de documentos en el servidor y el correo sale por el canal transaccional del
 * CRM. Cada documento pone su ruta (`POST <endpoint>` con
 * `{ para, mensaje, clave }`) y sus textos; las etiquetas comunes (Para,
 * Mensaje, Enviar) son las del diálogo de facturas, en los 4 idiomas.
 *
 * La organización la resuelve la ruta con la sesión (`withOrg`); el encabezado
 * `x-organization-id` solo dice cuál de las del usuario está activa.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Send } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { nuevaClaveIdempotencia } from '@/lib/finanzas/pagos/contrato';

export interface ResultadoEnvioDocumento {
  destino: string;
  adjunto: boolean;
  /** Estado del documento tras el envío, si la ruta lo devuelve (cotización: borrador → enviada). */
  status?: string;
}

export interface TextosEnviarDocumento {
  titulo: string;
  descripcion?: string;
  /** Título del aviso de éxito («Cotización enviada»). */
  enviado: string;
  /** «Se envió a {destino} con el PDF adjunto.» ya armado con el destino. */
  enviadoA: (destino: string) => string;
  enviadoSinAdjunto: (destino: string) => string;
}

export interface EnviarDocumentoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Ruta que envía (`/api/cotizaciones/<id>/enviar`). */
  endpoint: string;
  /** Prefijo de la clave de idempotencia (`'cotizacion'`, `'factura'`). */
  tipoClave: string;
  /** Correo propuesto (el del tercero); se puede cambiar. */
  correo?: string | null;
  textos: TextosEnviarDocumento;
  /** Texto de un error por su código. Sin él, el mensaje del servidor o el genérico de facturas. */
  mensajeError?: (codigo: string, mensajeServidor: string | null) => string;
  onEnviado?: (r: ResultadoEnvioDocumento) => void;
}

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EnviarDocumentoDialog({ abierto, onAbiertoChange, endpoint, tipoClave, correo, textos, mensajeError, onEnviado }: EnviarDocumentoDialogProps) {
  const t = useTranslations('facturasVenta.enviar');
  const [para, setPara] = useState(correo ?? '');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClaveIdempotencia(tipoClave));

  useEffect(() => {
    if (!abierto) return;
    setPara(correo ?? '');
    setMensaje('');
    setError(null);
    clave.current = nuevaClaveIdempotencia(tipoClave);
  }, [abierto, correo, tipoClave]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const org = getOrganizationId();
      const r = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({ para: para.trim() || undefined, mensaje: mensaje.trim() || null, clave: clave.current }),
      });
      const c = (await r.json().catch(() => ({}))) as { codigo?: string; error?: string; resultado?: ResultadoEnvioDocumento };
      if (!r.ok) {
        const codigo = c.codigo ?? 'error_desconocido';
        if (mensajeError) setError(mensajeError(codigo, c.error ?? null));
        else {
          const k = `errores.${codigo}`;
          setError(t.has(k) ? t(k as never) : c.error ?? t('errores.error_desconocido'));
        }
        return;
      }
      const destino = c.resultado?.destino ?? para;
      toastSuccess(textos.enviado, c.resultado?.adjunto ? textos.enviadoA(destino) : textos.enviadoSinAdjunto(destino));
      onEnviado?.({ destino, adjunto: !!c.resultado?.adjunto, status: c.resultado?.status });
      onAbiertoChange(false);
    } catch {
      setError(t('errores.error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={textos.titulo}
      descripcion={textos.descripcion}
      icono={Send}
      ancho={520}
      primario={{ etiqueta: t('enviar'), onClick: () => void enviar(), cargando: enviando, deshabilitada: !para.trim(), motivo: t('sinCorreo') }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('para')}>
          {(c) => (
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
              <input id={c.id} type="email" autoComplete="email" value={para} onChange={(e) => setPara(e.target.value)} className={`${CLASES_CAMPO} pl-9`} />
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
