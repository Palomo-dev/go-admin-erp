'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AvisoTonal, CampoFecha, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  claveErrorTasa,
  serieTasas,
  tasaCatalogo,
  validarTasaManual,
  MOTIVO_TASA_MAXIMO,
} from '@/lib/finanzas/monedas/tasasLogica';
import { registrarTasaManual, type MonedaOrganizacion } from '@/lib/services/monedasTasasService';
import { useTasasOrganizacion } from './useTasasOrganizacion';
import { useFormatoTasas } from './useFormatoTasas';

export interface DialogoTasaManualProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  /** Moneda base de la organización. */
  base: string;
  monedas: readonly MonedaOrganizacion[];
  /** La moneda desde la que se abrió (fila o tarjeta); sin ella se elige en el diálogo. */
  monedaInicial: string | null;
  fechaInicial: string;
  /** Día de hoy en la zona de la organización. */
  hoy: string;
  onRegistrada: () => void;
}

/**
 * M4 · «Registrar tasa manual» (captura 82-finanzas-r2-16). Manda sobre la
 * automática ese día para los documentos que se creen desde ahora; no
 * recalcula los ya contabilizados (el diálogo lo dice siempre). Se guarda por
 * `fn_finanzas_registrar_tasa_manual`, que exige el permiso en la base y
 * firma con el usuario de la sesión.
 */
export function DialogoTasaManual({
  abierto,
  onAbiertoChange,
  organizationId,
  base,
  monedas,
  monedaInicial,
  fechaInicial,
  hoy,
  onRegistrada,
}: DialogoTasaManualProps) {
  const t = useTranslations('finanzasMonedasR2.tasaManual');
  const tErr = useTranslations('finanzasMonedasR2.errores');
  const formato = useFormatoTasas(base);
  const elegibles = useMemo(() => monedas.filter((m) => !m.is_base), [monedas]);

  const [moneda, setMoneda] = useState<string | null>(monedaInicial);
  const [fecha, setFecha] = useState(fechaInicial);
  const [tasa, setTasa] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setMoneda(monedaInicial ?? (elegibles.length === 1 ? elegibles[0].code : null));
    setFecha(fechaInicial);
    setTasa(null);
    setMotivo('');
    setIntento(false);
    setErrorServidor(null);
  }, [abierto, monedaInicial, fechaInicial, elegibles]);

  // Lo que ya hay ese día, para el aviso.
  const codigos = useMemo(() => (moneda ? [moneda, base] : []), [moneda, base]);
  const datos = useTasasOrganizacion(abierto ? organizationId : null, codigos, fecha || null, fecha || null);
  const delDia = useMemo(() => {
    if (!moneda || !fecha) return { automatica: null as number | null, manual: null as number | null };
    const serie = serieTasas({ moneda, base, catalogo: datos.catalogo, manuales: datos.manuales });
    const punto = serie.find((p) => p.dia === fecha && p.fuente === 'manual');
    return { automatica: tasaCatalogo(datos.catalogo.get(fecha), moneda, base), manual: punto?.tasa ?? null };
  }, [moneda, fecha, base, datos.catalogo, datos.manuales]);

  const validacion = validarTasaManual({ moneda, fecha, tasa, motivo }, hoy);
  const errorDe = (campo: keyof typeof validacion.errores) => {
    const e = validacion.errores[campo];
    return intento && e ? t(`validacion.${campo}.${e}`) : null;
  };

  const simboloBase = monedas.find((m) => m.is_base)?.symbol ?? '';
  const nombreMoneda = elegibles.find((m) => m.code === moneda)?.name ?? moneda ?? '';

  async function guardar() {
    setIntento(true);
    setErrorServidor(null);
    if (!validacion.valido || !moneda || tasa === null) return;
    setGuardando(true);
    try {
      await registrarTasaManual(organizationId, { moneda, fecha, tasa, motivo: validacion.motivo });
      toast.success(t('guardada', { moneda, dia: formato.dia(fecha) }));
      onRegistrada();
      onAbiertoChange(false);
    } catch (error) {
      const clave = claveErrorTasa(error);
      setErrorServidor(clave ? tErr(clave) : tErr('guardar'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={moneda ? t('subtitulo', { moneda, dia: fecha ? formato.dia(fecha) : '' }) : t('subtituloSinMoneda')}
      ancho={520}
      primario={{ etiqueta: t('guardar'), onClick: guardar, cargando: guardando }}
    >
      {!monedaInicial && (
        <FormField etiqueta={t('moneda')} obligatorio error={errorDe('moneda')}>
          {(campo) => (
            <Select value={moneda ?? ''} onValueChange={(v) => setMoneda(v)}>
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                <SelectValue placeholder={t('monedaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {elegibles.map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {t('opcionMoneda', { codigo: m.code, nombre: m.name })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('fecha')} obligatorio error={errorDe('fecha')}>
          {(campo) => (
            <CampoFecha
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              aria-required
              required
              valor={fecha}
              onValorChange={setFecha}
              max={hoy}
              hoy={hoy}
            />
          )}
        </FormField>
        <FormField etiqueta={t('unidad', { moneda: moneda ?? '—' })} obligatorio error={errorDe('tasa')}>
          {(campo) => (
            <CampoNumero
              id={campo.id}
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              aria-required
              valor={tasa}
              onValorChange={setTasa}
              prefijo={simboloBase || base}
              decimales={6}
              minimo={0}
              inputMode="decimal"
            />
          )}
        </FormField>
      </div>

      <FormField etiqueta={t('motivo')} obligatorio ayuda={t('motivoAyuda')} error={errorDe('motivo')}>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={MOTIVO_TASA_MAXIMO} placeholder={t('motivoPlaceholder')} />
      </FormField>

      {moneda && fecha && delDia.manual !== null ? (
        <AvisoTonal tono="advertencia" titulo={t('avisoManual', { tasa: formato.tasa(delDia.manual) })} descripcion={t('avisoReemplazaManual')} />
      ) : moneda && fecha && delDia.automatica !== null ? (
        <AvisoTonal tono="advertencia" titulo={t('avisoAutomatica', { tasa: formato.tasa(delDia.automatica) })} descripcion={t('avisoReemplaza')} />
      ) : (
        <AvisoTonal tono="informacion" titulo={t('avisoSinTasaTitulo')} descripcion={t('avisoSinTasa', { moneda: nombreMoneda || '—' })} />
      )}

      {errorServidor && <AvisoTonal tono="peligro" rol="alert" titulo={errorServidor} />}
    </Dialogo>
  );
}
