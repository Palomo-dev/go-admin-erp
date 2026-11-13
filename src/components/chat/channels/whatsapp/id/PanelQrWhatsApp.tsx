'use client';

/**
 * Pestaña «Código QR» de WhatsApp (Figma 91-chat-23): aviso de riesgo, casilla
 * «Entiendo el riesgo» (sin ella no se genera el código), QR con los pasos,
 * «Generar otro código», «Detener» y «Borrar sesión» con confirmación. Usa las
 * mismas rutas de siempre (`/api/integrations/whatsapp/qr/*`).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Power, RefreshCw, Trash2 } from 'lucide-react';
import { AvisoTonal, ConfirmDialog, clasesBoton } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

type EstadoQr = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'reconnecting' | 'banned' | 'error';

const TONO: Record<EstadoQr, 'neutro' | 'advertencia' | 'informacion' | 'exito' | 'peligro'> = {
  disconnected: 'neutro',
  connecting: 'advertencia',
  qr_ready: 'advertencia',
  connected: 'exito',
  reconnecting: 'advertencia',
  banned: 'peligro',
  error: 'peligro',
};

export function PanelQrWhatsApp({ channelId }: { channelId: string }) {
  const t = useTranslations('chatModulo.canales.detalleCanal.whatsapp.qr');
  const [acepta, setAcepta] = useState(false);
  const [estado, setEstado] = useState<{ status: EstadoQr; qr: string | null; phone?: string | null }>({ status: 'disconnected', qr: null });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const consultar = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/whatsapp/qr/status?channel_id=${encodeURIComponent(channelId)}`);
      if (res.ok) setEstado(await res.json());
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  }, [channelId]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  useEffect(() => {
    if (estado.status !== 'connecting' && estado.status !== 'reconnecting' && estado.status !== 'qr_ready') return;
    const id = setInterval(consultar, 3000);
    return () => clearInterval(id);
  }, [estado.status, consultar]);

  const llamar = async (accion: 'start' | 'stop' | 'logout') => {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/whatsapp/qr/${accion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.error || t('error'));
      setEstado(accion === 'start' ? datos : { status: 'disconnected', qr: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setOcupado(false);
    }
  };

  const conectado = estado.status === 'connected';
  const enCurso = conectado || estado.status === 'connecting' || estado.status === 'qr_ready' || estado.status === 'reconnecting';

  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="peligro" titulo={t('riesgoTitulo')} descripcion={t('riesgoDescripcion')} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
        <Checkbox checked={acepta} onCheckedChange={(v) => setAcepta(v === true)} />
        {t('entiendo')}
      </label>

      {error && <AvisoTonal tono="peligro" compacto titulo={error} />}

      {estado.status === 'qr_ready' && estado.qr && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0 self-start rounded-xl border border-line bg-white p-3">
            {estado.qr.startsWith('data:image') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estado.qr} alt={t('qrAlt')} width={160} height={160} />
            ) : (
              <QRCodeSVG value={estado.qr} size={160} level="M" aria-label={t('qrAlt')} />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-fg">{t('escanea')}</p>
            <ol className="list-inside list-decimal text-[13px] leading-6 text-fg-secondary">
              <li>{t('paso1')}</li>
              <li>{t('paso2')}</li>
              <li>{t('paso3')}</li>
            </ol>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={TONO[estado.status]} tamano="sm">
          {t(`estados.${estado.status}`)}
        </Badge>
        {conectado && estado.phone && <span className="text-[13px] text-fg-secondary">{estado.phone.replace(/@s\.whatsapp\.net$/, '')}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(!enCurso || estado.status === 'qr_ready') && (
          <button type="button" onClick={() => llamar('start')} disabled={!acepta || ocupado} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {estado.status === 'qr_ready' ? t('otroCodigo') : t('generar')}
          </button>
        )}
        {enCurso && (
          <button type="button" onClick={() => llamar('stop')} disabled={ocupado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Power aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detener')}
          </button>
        )}
        {(conectado || estado.status === 'disconnected') && (
          <button type="button" onClick={() => setConfirmarBorrar(true)} disabled={ocupado} className={clasesBoton({ variante: 'destructivo', tamano: 'sm' })}>
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('borrar')}
          </button>
        )}
      </div>

      <ConfirmDialog
        abierto={confirmarBorrar}
        onAbiertoChange={setConfirmarBorrar}
        titulo={t('borrarTitulo')}
        descripcion={t('borrarDescripcion')}
        textoConfirmar={t('borrar')}
        tono="peligro"
        onConfirmar={async () => {
          setConfirmarBorrar(false);
          await llamar('logout');
        }}
      />
    </div>
  );
}
