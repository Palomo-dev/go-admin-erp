'use client';

/**
 * «Marcar anticipo recibido…» (Figma 3014:194407 › 06 B): el cliente pagó el anticipo por otro
 * medio (transferencia a la cuenta). Pide el medio y el comprobante; la base registra el pago, lo
 * deja en el historial (ops_audit_log) y quién lo marcó.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MEDIOS_ANTICIPO_MANUAL,
  MarcarAnticipoError,
  marcarAnticipoRecibido,
} from '@/lib/services/contraentregaPedidoService';

export function DialogoMarcarAnticipo({
  abierto,
  onAbiertoChange,
  orderId,
  monto,
  onHecho,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  orderId: string;
  /** «$ 9.000» ya formateado. */
  monto: string;
  onHecho: (ok: boolean, mensaje: string) => void;
}) {
  const t = useTranslations('contraentregaPedidos');
  const [metodo, setMetodo] = useState<string>('transfer');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    if (!referencia.trim()) {
      setError(t('marcar.errores.COMPROBANTE_REQUERIDO'));
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await marcarAnticipoRecibido(orderId, { metodo, referencia: referencia.trim(), motivo: motivo.trim() || null });
      onHecho(true, r.yaPagado ? t('marcar.yaPagado') : t('marcar.hecho', { monto }));
      onAbiertoChange(false);
      setReferencia('');
      setMotivo('');
    } catch (e) {
      const codigo = e instanceof MarcarAnticipoError ? e.codigo : 'OTRO';
      setError(t(`marcar.errores.${codigo}`));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('marcar.titulo')}
      descripcion={t('marcar.descripcion', { monto })}
      icono={BadgeCheck}
      ancho={440}
      primario={{ etiqueta: t('marcar.confirmar'), onClick: () => void guardar(), cargando }}
    >
      <FormField etiqueta={t('marcar.medio')}>
        {(c) => (
          <Select value={metodo} onValueChange={setMetodo}>
            <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEDIOS_ANTICIPO_MANUAL.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`medios.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField etiqueta={t('marcar.comprobante')} obligatorio ayuda={t('marcar.comprobanteAyuda')} error={error}>
        <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
      </FormField>
      <FormField etiqueta={t('marcar.motivo')}>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={2} />
      </FormField>
    </Dialogo>
  );
}
