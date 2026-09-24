'use client';

/**
 * Estado de cuenta del cliente (Figma X3 `740:52422`): periodo (días de la
 * organización), ver o descargar el PDF del motor de documentos
 * (`estado-cuenta`, con el texto legal configurable) y enviarlo por correo
 * (`POST /api/clientes/[id]/estado-cuenta/enviar`). Reemplaza el `.txt`.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText, Mail } from 'lucide-react';
import { DateRangeButton, Dialogo, FormField, inicioDeMes } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { abrirDocumento, descargarDocumento } from '@/lib/documents/cliente';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface EstadoCuentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  clienteId: string;
  clienteNombre?: string | null;
  correo?: string | null;
  hoy: string;
  origen?: 'pos' | 'finanzas';
}

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function EstadoCuentaDialog({ abierto, onAbiertoChange, clienteId, clienteNombre, correo, hoy, origen = 'finanzas' }: EstadoCuentaDialogProps) {
  const t = useTranslations('cartera.estadoCuenta');
  const [rango, setRango] = useState({ desde: inicioDeMes(hoy), hasta: hoy });
  const [para, setPara] = useState(correo ?? '');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setRango({ desde: inicioDeMes(hoy), hasta: hoy });
    setPara(correo ?? '');
    setMensaje('');
  }, [abierto, hoy, correo]);

  const enviar = async () => {
    setEnviando(true);
    try {
      const org = getOrganizationId();
      const r = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/estado-cuenta/enviar`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({ para: para.trim() || undefined, desde: rango.desde, hasta: rango.hasta, mensaje: mensaje.trim() || null, origen }),
      });
      const c = (await r.json().catch(() => ({}))) as { codigo?: string; resultado?: { destino: string; adjunto: boolean } };
      if (!r.ok) {
        const clave = `errores.${c.codigo ?? 'error_desconocido'}`;
        toastError(t('noEnviado'), t.has(clave) ? t(clave as never) : t('errores.error_desconocido'));
        return;
      }
      toastSuccess(t('enviado'), c.resultado?.adjunto ? t('enviadoA', { destino: c.resultado.destino }) : t('enviadoSinAdjunto', { destino: c.resultado?.destino ?? para }));
      onAbiertoChange(false);
    } finally {
      setEnviando(false);
    }
  };

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarDocumento('estado-cuenta', clienteId, { desde: rango.desde, hasta: rango.hasta });
    } catch {
      toastError(t('errorPdf'));
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={clienteNombre ?? undefined}
      icono={FileText}
      ancho={560}
      secundarios={[
        { etiqueta: t('ver'), onClick: () => abrirDocumento('estado-cuenta', clienteId, { desde: rango.desde, hasta: rango.hasta }) },
        { etiqueta: t('descargar'), onClick: () => void descargar(), cargando: descargando },
      ]}
      primario={{ etiqueta: t('enviarCorreo'), onClick: () => void enviar(), cargando: enviando, deshabilitada: !para.trim(), motivo: t('sinCorreo') }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('periodo')}>
          <DateRangeButton valor={rango} hoy={hoy} max={hoy} onValorChange={setRango} etiqueta={t('periodo')} />
        </FormField>
        <FormField etiqueta={t('para')}>
          {(c) => (
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
              <input id={c.id} type="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder={t('paraPlaceholder')} className={`${CLASES_CAMPO} pl-9`} />
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
        <p className="flex items-start gap-2 text-xs text-fg-muted">
          <Download aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
          {t('nota')}
        </p>
      </div>
    </Dialogo>
  );
}
