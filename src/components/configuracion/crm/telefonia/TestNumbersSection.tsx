'use client';

/**
 * Números de prueba del agente de voz — Configuración › Telefonía y voz
 * (Figma 1810:145821 listo, 1811:908520 estados, 1811:908595 móvil).
 *
 * Números del propio equipo (con consentimiento) que quedan exentos SOLO del
 * tope semanal de la Ley 2300 de 2023, para que el equipo pueda probar su
 * agente más de una vez por semana. La franja horaria legal, los excluidos, las
 * bajas, los topes diarios y los créditos siguen aplicando.
 *
 * Esta pantalla no decide nada: la ruta `/api/crm/settings/telephony/test-numbers`
 * toma la organización de la sesión, dice `puedeEditar` (admin, resuelto en el
 * servidor), exige admin para agregar y quitar y normaliza el número; la base
 * vuelve a exigir admin (RLS), aplica el tope de 10 y guarda quién y cuándo.
 * Un miembro sin permiso ve la lista en solo lectura (Figma «Sin permiso»).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { FormField } from '@/components/kit/FormField';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatearTelefono } from '@/lib/utils/telefono';
import { cn } from '@/utils/Utils';
import {
  MAX_ETIQUETA_NUMERO_PRUEBA,
  MAX_NUMEROS_PRUEBA,
  normalizarNumeroPrueba,
  type NumeroPruebaConAutor,
} from '@/lib/services/crm/voiceAgent/numerosPrueba';

const RUTA = '/api/crm/settings/telephony/test-numbers';
const ID_CAMPO_NUMERO = 'tel-numero-prueba';

async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: `HTTP ${res.status}` } as T & { error?: string };
  }
}

export function TestNumbersSection() {
  const t = useTranslations('vozCampanasDisparo.numerosPrueba');
  const { formatDate } = useFormatDate();
  const [numeros, setNumeros] = useState<NumeroPruebaConAutor[]>([]);
  const [max, setMax] = useState(MAX_NUMEROS_PRUEBA);
  const [cargando, setCargando] = useState(true);
  // El permiso lo decide el servidor (`puedeEditar` de la ruta; un 403 al
  // escribir también lo apaga). Hasta saberlo no se ofrece escribir.
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [telefono, setTelefono] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [abrirAlta, setAbrirAlta] = useState(false);
  const cajaAlta = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(RUTA, { cache: 'no-store' });
      const body = await leerJson<{ data?: NumeroPruebaConAutor[]; max?: number; puedeEditar?: boolean }>(res);
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setNumeros(body.data ?? []);
      setPuedeEditar(body.puedeEditar === true);
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

  // «Agregar número» del estado vacío abre el alta y lleva el foco al número.
  useEffect(() => {
    if (!abrirAlta) return;
    cajaAlta.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [abrirAlta]);

  const limpio = telefono.trim();
  const normalizado = limpio ? normalizarNumeroPrueba(limpio) : null;
  const invalido = limpio !== '' && !normalizado;
  const lleno = numeros.length >= max;
  const vacio = numeros.length === 0;

  const agregar = async () => {
    if (!normalizado) return;
    setGuardando(true);
    try {
      const res = await fetch(RUTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizado, label: etiqueta.trim() || null }),
      });
      const body = await leerJson<{ data?: NumeroPruebaConAutor }>(res);
      if (res.status === 403) setPuedeEditar(false);
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
      if (res.status === 403) setPuedeEditar(false);
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast({ title: t('quitado') });
      await cargar();
    } catch (err) {
      toast({ title: t('errorQuitar'), description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setQuitando(null);
    }
  };

  const titulo = (n: NumeroPruebaConAutor) => [formatearTelefono(n.phone_e164), n.label].filter(Boolean).join(' · ');
  const autoria = (n: NumeroPruebaConAutor) =>
    n.created_by_name ? t('agregadoPor', { nombre: n.created_by_name, fecha: formatDate(n.created_at) }) : t('agregadoEl', { fecha: formatDate(n.created_at) });

  const contador = (
    <Badge tono={lleno ? 'advertencia' : vacio ? 'neutro' : 'marca'} apariencia="suave" tamano="sm" className="tabular-nums">
      {t('contadorCorto', { usados: numeros.length, max })}
    </Badge>
  );
  const listo = !cargando || numeros.length > 0;

  return (
    <section aria-labelledby="tel-numeros-prueba-titulo" className="flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="tel-numeros-prueba-titulo" className="text-base font-semibold leading-6 text-fg">
            {t('titulo')}
          </h3>
          <p className="hidden text-[13px] leading-[18px] text-fg-secondary md:block">{t('subtitulo')}</p>
        </div>
        {listo && !errorCarga && <div className="shrink-0 md:hidden">{contador}</div>}
      </header>

      <p className="text-sm text-fg-secondary md:hidden">{t('explicacionCorta')}</p>
      <p className="hidden text-[13px] leading-[18px] text-fg-secondary md:block">{t('explicacion')}</p>

      {cargando && numeros.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('cargando')}
        </p>
      ) : errorCarga ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger-text">
          <span>
            {t('errorCargar')}: {errorCarga}
          </span>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void cargar()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('reintentar')}
          </button>
        </div>
      ) : (
        <>
          <div className="hidden items-center gap-2 md:flex" aria-live="polite">
            {contador}
            <span className="text-xs text-fg-muted">{t('notaTope', { max })}</span>
          </div>

          {!puedeEditar ? (
            <>
              {vacio ? (
                <p className="text-sm text-fg-secondary">{t('vacio')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5 text-sm text-fg">
                  {numeros.map((n) => (
                    <li key={n.id} className="tabular-nums">
                      {titulo(n)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[13px] leading-[18px] text-fg-muted">{t('soloLectura')}</p>
            </>
          ) : (
            <>
              {vacio && !abrirAlta ? (
                <div className="flex flex-col items-start gap-3 rounded-lg bg-subtle p-4">
                  <p className="text-sm text-fg-secondary">{t('vacioDescripcion')}</p>
                  <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setAbrirAlta(true)}>
                    <Plus className="size-4" aria-hidden="true" />
                    {t('agregarNumero')}
                  </button>
                </div>
              ) : (
                !vacio && (
                  <ul className="flex flex-col gap-2">
                    {numeros.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 md:px-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg tabular-nums">
                            <span className="md:hidden">{formatearTelefono(n.phone_e164)}</span>
                            <span className="hidden md:inline">{titulo(n)}</span>
                          </p>
                          <p className="truncate text-[13px] leading-[18px] text-fg-secondary">
                            <span className="md:hidden">{[n.label, n.created_by_name, formatDate(n.created_at)].filter(Boolean).join(' · ')}</span>
                            <span className="hidden md:inline">{autoria(n)}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                          disabled={quitando !== null}
                          aria-label={t('quitarAria', { numero: formatearTelefono(n.phone_e164) })}
                          onClick={() => void quitar(n.id)}
                        >
                          {quitando === n.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                          <span className="hidden md:inline">{t('quitar')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {lleno ? (
                <>
                  <AvisoTonal tono="advertencia" titulo={t('topeTitulo', { max })} descripcion={t('topeDescripcion')} rol="status" />
                  <div>
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled>
                      {t('agregarNumero')}
                    </button>
                  </div>
                </>
              ) : (
                (!vacio || abrirAlta) && (
                  <div ref={cajaAlta} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-start">
                    <FormField id={ID_CAMPO_NUMERO} etiqueta={t('campoNumero')} error={invalido ? t('invalidoFormato') : null} ayuda={invalido ? undefined : t('ayudaNumero')} obligatorio>
                      <PhoneInput formato="e164" autoComplete="off" value={telefono} disabled={guardando} onChange={setTelefono} showValidation={false} />
                    </FormField>
                    <FormField etiqueta={t('campoEtiqueta')} ayuda={t('ayudaEtiqueta')} className="hidden md:flex">
                      <Input
                        type="text"
                        maxLength={MAX_ETIQUETA_NUMERO_PRUEBA}
                        placeholder={t('placeholderEtiqueta')}
                        value={etiqueta}
                        disabled={guardando}
                        onChange={(e) => setEtiqueta(e.target.value)}
                      />
                    </FormField>
                    <button
                      type="button"
                      className={cn(clasesBoton({ variante: 'secundario' }), 'w-full md:mt-[26px] md:w-auto')}
                      disabled={guardando || !normalizado}
                      onClick={() => void agregar()}
                    >
                      {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                      {guardando ? t('agregando') : t('agregarNumero')}
                    </button>
                  </div>
                )
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
