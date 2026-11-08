'use client';

/**
 * Anular un anticipo a proveedor (P7 del Contador). «Sin usar» no significa
 * «sin desembolso»: el contra-asiento que vuelve a cargar la caja o el banco
 * solo corrige una salida registrada que NUNCA ocurrió. Por eso el diálogo
 * pregunta primero qué pasó:
 *
 * - «El desembolso no ocurrió» → motivo, soporte y la fecha del ajuste
 *   documentado (no futura; la base rechaza un periodo cerrado) →
 *   `POST /api/anticipos-proveedor/[id]/anular` (`fn_anticipo_proveedor_anular_por_error`).
 * - «El dinero sí salió» → no se anula: «Registrar devolución» (dinero que
 *   regresa, con soporte) o mantener el derecho frente al proveedor.
 */
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { AvisoTonal, CampoFecha, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { FilaAnticipoProveedor } from '@/lib/finanzas/anticiposProveedor/contrato';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';
type QuePaso = 'no_ocurrio' | 'si_salio';

export interface AnularAnticipoDialogProps {
  anticipo: FilaAnticipoProveedor | null;
  onAbiertoChange: (abierto: boolean) => void;
  onAnulado: () => void;
  /** «El dinero sí salió»: abre la devolución real del mismo anticipo. */
  onDevolver: (anticipo: FilaAnticipoProveedor) => void;
  /** Permiso para registrar la devolución (finance.void). */
  puedeDevolver: boolean;
}

export function AnularAnticipoDialog({ anticipo, onAbiertoChange, onAnulado, onDevolver, puedeDevolver }: AnularAnticipoDialogProps) {
  const t = useTranslations(NS);
  const moneda = useMonedaOrganizacion();
  const { getToday } = useFormatDate(anticipo?.sucursalId ?? null);
  const idPregunta = useId();
  const [quePaso, setQuePaso] = useState<QuePaso | null>(null);
  const [motivo, setMotivo] = useState('');
  const [soporte, setSoporte] = useState('');
  const [fecha, setFecha] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoy = getToday();

  useEffect(() => {
    if (!anticipo) return;
    setQuePaso(null);
    setMotivo('');
    setSoporte('');
    setFecha(hoy);
    setTocado(false);
    setError(null);
    // Solo al abrir otro anticipo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anticipo?.id]);

  const faltaMotivo = motivo.trim().length < 3;
  const faltaSoporte = soporte.trim().length < 3;
  const faltaFecha = !fecha || fecha > hoy;

  const anular = async () => {
    setTocado(true);
    if (!anticipo || quePaso !== 'no_ocurrio' || faltaMotivo || faltaSoporte || faltaFecha) return;
    setEnviando(true);
    setError(null);
    try {
      await anticiposProveedorService.anularPorError(anticipo.id, { motivo: motivo.trim(), soporte: soporte.trim(), fechaAjuste: fecha });
      toastSuccess(t('anular.exito', { proveedor: anticipo.proveedor }));
      onAbiertoChange(false);
      onAnulado();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!anticipo}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('anular.titulo')}
      descripcion={anticipo ? t('anular.descripcion', { proveedor: anticipo.proveedor, monto: moneda.formatear(anticipo.valor), recibo: anticipo.recibo ?? '—' }) : undefined}
      icono={Ban}
      ancho={560}
      primario={{
        etiqueta: t('anular.confirmar'),
        onClick: () => void anular(),
        cargando: enviando,
        destructiva: true,
        deshabilitada: quePaso !== 'no_ocurrio',
        motivo: t('anular.soloSiNoOcurrio'),
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span id={idPregunta} className="text-sm font-medium text-fg">
            {t('anular.pregunta')}
          </span>
          <RadioGroup aria-labelledby={idPregunta} value={quePaso ?? ''} onValueChange={(v) => setQuePaso(v as QuePaso)}>
            <Opcion valor="no_ocurrio" etiqueta={t('anular.opciones.noOcurrio.titulo')} ayuda={t('anular.opciones.noOcurrio.ayuda')} />
            <Opcion valor="si_salio" etiqueta={t('anular.opciones.siSalio.titulo')} ayuda={t('anular.opciones.siSalio.ayuda')} />
          </RadioGroup>
        </div>

        {quePaso === 'si_salio' && anticipo && (
          <AvisoTonal
            tono="informacion"
            titulo={t('anular.siSalio.titulo')}
            descripcion={t('anular.siSalio.descripcion')}
            acciones={[
              ...(puedeDevolver
                ? [
                    {
                      etiqueta: t('acciones.devolver'),
                      onClick: () => {
                        onAbiertoChange(false);
                        onDevolver(anticipo);
                      },
                    },
                  ]
                : []),
              { etiqueta: t('anular.siSalio.mantener'), onClick: () => onAbiertoChange(false) },
            ]}
          />
        )}

        {quePaso === 'no_ocurrio' && (
          <>
            <FormField etiqueta={t('anular.motivo')} obligatorio error={tocado && faltaMotivo ? t('validacion.motivo') : null}>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder={t('anular.motivoPlaceholder')} />
            </FormField>
            <FormField etiqueta={t('anular.soporte')} obligatorio ayuda={t('anular.soporteAyuda')} error={tocado && faltaSoporte ? t('validacion.soporte') : null}>
              <Input value={soporte} onChange={(e) => setSoporte(e.target.value)} maxLength={500} />
            </FormField>
            <FormField etiqueta={t('anular.fechaAjuste')} obligatorio ayuda={t('anular.fechaAjusteAyuda')} error={tocado && faltaFecha ? t('validacion.fechaAjuste') : null}>
              {(c) => <CampoFecha id={c.id} aria-describedby={c['aria-describedby']} required max={hoy} hoy={hoy} valor={fecha} onValorChange={setFecha} />}
            </FormField>
            <AvisoTonal
              tono="advertencia"
              titulo={t('anular.consecuenciasTitulo')}
              descripcion={
                <ul className="list-disc pl-4">
                  <li>{t('anular.consecuencias.pago')}</li>
                  <li>{t('anular.consecuencias.asiento')}</li>
                  <li>{t('anular.consecuencias.saldo')}</li>
                </ul>
              }
            />
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

function Opcion({ valor, etiqueta, ayuda }: { valor: QuePaso; etiqueta: string; ayuda: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem id={id} value={valor} className="mt-0.5" />
      <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal">
        <span className="text-sm text-fg">{etiqueta}</span>
        <span className="text-xs text-fg-muted">{ayuda}</span>
      </Label>
    </div>
  );
}
