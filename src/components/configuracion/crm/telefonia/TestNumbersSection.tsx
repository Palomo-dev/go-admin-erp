'use client';

/**
 * Números de prueba del agente de voz — Configuración › CRM › Telefonía.
 *
 * Números del propio equipo (con consentimiento) que quedan exentos SOLO del
 * tope semanal de la Ley 2300 de 2023, para que el equipo pueda probar su
 * agente más de una vez por semana. La franja horaria legal, los excluidos, las
 * bajas, los topes diarios y los créditos siguen aplicando.
 *
 * Esta pantalla no decide nada: la ruta `/api/crm/settings/telephony/test-numbers`
 * exige admin, toma la organización de la sesión y normaliza el número; la base
 * vuelve a exigir admin (RLS), aplica el tope de 10 y guarda quién y cuándo.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { FormField } from '@/components/kit/FormField';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  MAX_ETIQUETA_NUMERO_PRUEBA,
  MAX_NUMEROS_PRUEBA,
  normalizarNumeroPrueba,
  type NumeroPrueba,
} from '@/lib/services/crm/voiceAgent/numerosPrueba';

const RUTA = '/api/crm/settings/telephony/test-numbers';

async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` } as T & { error?: string };
  }
}

export function TestNumbersSection() {
  const t = useTranslations('vozCampanasDisparo.numerosPrueba');
  const { formatDateTime } = useFormatDate();
  const [numeros, setNumeros] = useState<NumeroPrueba[]>([]);
  const [max, setMax] = useState(MAX_NUMEROS_PRUEBA);
  const [cargando, setCargando] = useState(true);
  // El permiso lo decide el servidor (`requireOrgAdminOrPermission`): un 403 de
  // la ruta es la única fuente de «no puedes gestionarlos».
  const [sinPermiso, setSinPermiso] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [telefono, setTelefono] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(RUTA, { cache: 'no-store' });
      const body = await leerJson<{ data?: NumeroPrueba[]; max?: number }>(res);
      if (res.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setSinPermiso(false);
      setNumeros(body.data ?? []);
      if (typeof body.max === 'number') setMax(body.max);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'Error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const limpio = telefono.trim();
  const normalizado = limpio ? normalizarNumeroPrueba(limpio) : null;
  const invalido = limpio !== '' && !normalizado;
  const lleno = numeros.length >= max;

  const agregar = async () => {
    if (!normalizado) return;
    setGuardando(true);
    try {
      const res = await fetch(RUTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizado, label: etiqueta.trim() || null }),
      });
      const body = await leerJson<{ data?: NumeroPrueba }>(res);
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setTelefono('');
      setEtiqueta('');
      toast({ title: t('agregado') });
      await cargar();
    } catch (err) {
      toast({ title: t('errorAgregar'), description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: string) => {
    setQuitando(id);
    try {
      const res = await fetch(RUTA, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = await leerJson<{ success?: boolean }>(res);
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast({ title: t('quitado') });
      await cargar();
    } catch (err) {
      toast({ title: t('errorQuitar'), description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setQuitando(null);
    }
  };

  return (
    <section aria-labelledby="tel-numeros-prueba-titulo" className="space-y-3">
      <h3 id="tel-numeros-prueba-titulo" className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {t('titulo')}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('descripcion')}</p>
      <div
        role="note"
        className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">{t('aviso')}</p>
          <p className="text-xs">{t('avisoSigue')}</p>
        </div>
      </div>

      {sinPermiso ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('soloAdmin')}</p>
      ) : cargando && numeros.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t('cargando')}
        </p>
      ) : errorCarga ? (
        <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300">
          <p>
            {t('errorCargar')}: {errorCarga}
          </p>
          <Button size="sm" variant="outline" onClick={() => void cargar()}>
            {t('reintentar')}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            {t('contador', { usados: numeros.length, max })}
          </p>
          {numeros.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('vacio')}</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {numeros.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{n.phone_e164}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {n.label ? `${n.label} · ` : ''}
                      {t('agregadoEl', { fecha: formatDateTime(n.created_at) })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={quitando !== null}
                    aria-label={t('quitarAria', { numero: n.phone_e164 })}
                    onClick={() => void quitar(n.id)}
                  >
                    {quitando === n.id ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                    )}
                    {t('quitar')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {lleno ? (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
              {t('lleno')}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField etiqueta={t('etiquetaNumero')} error={invalido ? t('invalido') : null} obligatorio>
                <PhoneInput
                  formato="e164"
                  autoComplete="off"
                  value={telefono}
                  disabled={guardando}
                  onChange={setTelefono}
                  showValidation={false}
                />
              </FormField>
              <FormField etiqueta={t('etiquetaNombre')}>
                <Input
                  type="text"
                  maxLength={MAX_ETIQUETA_NUMERO_PRUEBA}
                  placeholder={t('placeholderNombre')}
                  value={etiqueta}
                  disabled={guardando}
                  onChange={(e) => setEtiqueta(e.target.value)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={guardando || !normalizado}
                  onClick={() => void agregar()}
                >
                  {guardando ? t('agregando') : t('agregar')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
