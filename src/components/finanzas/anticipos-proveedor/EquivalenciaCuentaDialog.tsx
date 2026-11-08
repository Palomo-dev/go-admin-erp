'use client';

/**
 * Aprobar como equivalente una cuenta de anticipos fuera de 133005xx (ronda 2 del
 * Contador, ítem 10). La regla es un auxiliar de detalle de ocho dígitos bajo
 * 133005; otro plan necesita la equivalencia aprobada con su nota
 * (`POST /api/anticipos-proveedor/cuenta/equivalencia`, permiso `finance.approve`;
 * la base exige una cuenta de detalle del activo).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import { Dialogo, FilaDato, FormField } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess } from '@/components/ui/use-toast';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';

export interface EquivalenciaCuentaDialogProps {
  cuenta: string | null;
  onCerrar: () => void;
  onAprobada: () => void;
}

export function EquivalenciaCuentaDialog({ cuenta, onCerrar, onAprobada }: EquivalenciaCuentaDialogProps) {
  const t = useTranslations(NS);
  const [nota, setNota] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faltaNota = nota.trim().length < 10;

  const cerrar = () => {
    setNota('');
    setTocado(false);
    setError(null);
    onCerrar();
  };

  const aprobar = async () => {
    setTocado(true);
    if (!cuenta || faltaNota) return;
    setEnviando(true);
    setError(null);
    try {
      await anticiposProveedorService.aprobarEquivalencia({ cuenta, nota });
      toastSuccess(t('equivalencia.exito', { cuenta }));
      cerrar();
      onAprobada();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!cuenta}
      onAbiertoChange={(v) => !v && !enviando && cerrar()}
      titulo={t('equivalencia.titulo')}
      descripcion={t('equivalencia.descripcion')}
      icono={BadgeCheck}
      ancho={520}
      primario={{ etiqueta: t('equivalencia.confirmar'), onClick: () => void aprobar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col">
          <FilaDato etiqueta={t('equivalencia.cuenta')} valor={cuenta ?? '—'} tono="fuerte" />
        </dl>
        <FormField etiqueta={t('equivalencia.nota')} obligatorio ayuda={t('equivalencia.notaAyuda')} error={tocado && faltaNota ? t('validacion.nota') : null}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} rows={4} />
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
