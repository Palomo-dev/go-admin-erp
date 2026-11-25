'use client';

/**
 * Paso 5 · Cumplimiento (Figma 1683:136171 lista y 1687:183908 sin política).
 *
 *  - Política de datos: `comm_settings.data_policy_url` por
 *    GET/PATCH `/api/crm/settings/telephony` (bloquea: sin ella «Siguiente» se
 *    deshabilita y el campo queda en error).
 *  - Identidad: `voice_agents.identity_disclosure` del agente elegido.
 *  - Números de prueba: GET/POST/DELETE `/api/crm/settings/telephony/test-numbers`
 *    (solo administradores; el servidor lo decide).
 *  - RNE (opcional): GET/POST `/api/crm/voice-agents/campaigns/[id]/rne`.
 *  - Baja voluntaria: siempre activa (`fn_can_contact`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Ban, CircleAlert, CircleCheck, FileText, Loader2, Phone, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { FormField } from '@/components/kit/FormField';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { enmascararTelefono } from '@/lib/services/crm/telefonoEnmascarado';
import { politicaValida } from './asistenteVozLogica';
import type { AgenteVoz, Lectura, Telefonia } from './useDatosAsistenteVoz';

const MAX_BYTES_RNE = 8 * 1024 * 1024;

function Tarjeta({ children, tono }: { children: React.ReactNode; tono?: 'peligro' }) {
  return (
    <section className={cn('flex flex-col gap-2 rounded-xl border bg-surface p-4', tono === 'peligro' ? 'border-danger ring-1 ring-danger' : 'border-line')}>
      {children}
    </section>
  );
}

function Cabecera({ icono, titulo, insignia }: { icono: React.ReactNode; titulo: string; insignia?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold leading-6 text-fg">
        {icono}
        {titulo}
      </h2>
      {insignia}
    </div>
  );
}

export function PasoCumplimiento({
  telefonia,
  recargarTelefonia,
  agente,
  campanaId,
  asegurarBorrador,
}: {
  telefonia: Lectura<Telefonia>;
  recargarTelefonia: () => void;
  agente: AgenteVoz | null;
  campanaId: string | null;
  /** Guarda el borrador si aún no existe y devuelve su id (el RNE se registra por campaña). */
  asegurarBorrador: () => Promise<string | null>;
}) {
  const t = useTranslations('crm.campanaVozAsistente.cumplimiento');
  return (
    <div className="flex flex-col gap-4">
      <BloquePolitica telefonia={telefonia} recargar={recargarTelefonia} />
      <Tarjeta>
        <Cabecera
          icono={
            agente?.identity_disclosure ? (
              <CircleCheck aria-hidden="true" className="size-4 text-success-text" strokeWidth={1.5} />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4 text-warning-text" strokeWidth={1.5} />
            )
          }
          titulo={t('identidad.titulo')}
          insignia={
            <Badge tono={agente?.identity_disclosure ? 'exito' : 'advertencia'} apariencia="contorno" tamano="sm">
              {agente?.identity_disclosure ? t('identidad.lista') : t('identidad.falta')}
            </Badge>
          }
        />
        <p className="text-[13px] leading-[18px] text-fg-secondary">
          {agente?.identity_disclosure
            ? t('identidad.texto', { agente: agente.name, frase: agente.identity_disclosure })
            : t('identidad.sinFrase', { agente: agente?.name ?? '' })}
        </p>
      </Tarjeta>
      <BloqueNumerosPrueba />
      <BloqueRne campanaId={campanaId} asegurarBorrador={asegurarBorrador} />
      <Tarjeta>
        <Cabecera
          icono={<Ban aria-hidden="true" className="size-4 text-danger-text" strokeWidth={1.5} />}
          titulo={t('baja.titulo')}
          insignia={
            <Badge tono="exito" apariencia="contorno" tamano="sm">
              {t('baja.activa')}
            </Badge>
          }
        />
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('baja.texto')}</p>
      </Tarjeta>
    </div>
  );
}

function BloquePolitica({ telefonia, recargar }: { telefonia: Lectura<Telefonia>; recargar: () => void }) {
  const t = useTranslations('crm.campanaVozAsistente.cumplimiento.politica');
  const pathname = usePathname();
  const params = useSearchParams();
  const actual = telefonia.estado === 'listo' ? telefonia.datos.politicaUrl ?? '' : '';
  const puedeEditar = telefonia.estado === 'listo' && telefonia.datos.puedeEditar;
  const [valor, setValor] = useState(actual);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setValor(actual), [actual]);
  const lista = politicaValida(actual);
  const limpio = valor.trim();
  const invalida = limpio !== '' && !politicaValida(limpio);

  const enlaceTelefonia = (() => {
    const q = new URLSearchParams(params?.toString() ?? '');
    q.set('config', 'crm.telefonia');
    return `${pathname ?? ''}?${q.toString()}`;
  })();

  const guardar = async () => {
    setGuardando(true);
    try {
      await pedirCrm('/api/crm/settings/telephony', { method: 'PATCH', cuerpo: { data_policy_url: limpio || null } });
      toast({ title: t('guardada') });
      recargar();
    } catch (e) {
      toast({ title: t('errorGuardar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta tono={telefonia.estado === 'listo' && !lista ? 'peligro' : undefined}>
      <Cabecera
        icono={
          lista ? (
            <CircleCheck aria-hidden="true" className="size-4 text-success-text" strokeWidth={1.5} />
          ) : (
            <CircleAlert aria-hidden="true" className="size-4 text-danger-text" strokeWidth={1.5} />
          )
        }
        titulo={t('titulo')}
        insignia={
          telefonia.estado === 'listo' ? (
            <Badge tono={lista ? 'exito' : 'peligro'} apariencia="contorno" tamano="sm">
              {lista ? t('lista') : t('falta')}
            </Badge>
          ) : undefined
        }
      />
      <FormField
        etiqueta={t('etiqueta')}
        obligatorio
        ayuda={lista ? t('ayuda') : puedeEditar ? undefined : t('soloAdmin')}
        error={invalida ? t('invalida') : telefonia.estado === 'listo' && !lista && limpio === '' ? t('error') : null}
      >
        <Input
          type="url"
          inputMode="url"
          value={valor}
          readOnly={!puedeEditar}
          placeholder="https://tuempresa.co/politica-de-datos"
          onChange={(e) => setValor(e.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {puedeEditar && limpio !== actual && !invalida && (
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={guardando} onClick={() => void guardar()}>
            {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {t('guardar')}
          </button>
        )}
        {!lista && (
          <Link href={enlaceTelefonia} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('configurar')}
          </Link>
        )}
      </div>
    </Tarjeta>
  );
}

interface NumeroPrueba {
  id: string;
  phone_e164: string;
  label: string | null;
}

function BloqueNumerosPrueba() {
  const t = useTranslations('crm.campanaVozAsistente.cumplimiento.prueba');
  const [estado, setEstado] = useState<'cargando' | 'error' | 'sinPermiso' | 'listo'>('cargando');
  const [numeros, setNumeros] = useState<NumeroPrueba[]>([]);
  const [max, setMax] = useState(10);
  const [agregando, setAgregando] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { data, extra } = await pedirCrm<NumeroPrueba[]>('/api/crm/settings/telephony/test-numbers');
      setNumeros(data ?? []);
      if (typeof extra.max === 'number') setMax(extra.max);
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async () => {
    setOcupado('nuevo');
    try {
      await pedirCrm('/api/crm/settings/telephony/test-numbers', { method: 'POST', cuerpo: { phone: telefono, label: etiqueta.trim() || undefined } });
      toast({ title: t('agregado') });
      setTelefono('');
      setEtiqueta('');
      setAgregando(false);
      await cargar();
    } catch (e) {
      toast({ title: t('errorAgregar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async (id: string) => {
    setOcupado(id);
    try {
      await pedirCrm('/api/crm/settings/telephony/test-numbers', { method: 'DELETE', cuerpo: { id } });
      toast({ title: t('quitado') });
      await cargar();
    } catch (e) {
      toast({ title: t('errorQuitar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Tarjeta>
      <Cabecera
        icono={<Phone aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />}
        titulo={t('titulo')}
        insignia={
          estado === 'listo' ? (
            <Badge tono="neutro" tamano="sm">
              {t('cuenta', { n: numeros.length, max })}
            </Badge>
          ) : undefined
        }
      />
      {estado === 'cargando' && <Loader2 aria-label={t('titulo')} className="size-4 animate-spin text-fg-muted" />}
      {estado === 'sinPermiso' && <p className="text-[13px] text-fg-secondary">{t('soloAdmin')}</p>}
      {estado === 'error' && <p className="text-[13px] text-danger-text">{t('errorCargar')}</p>}
      {estado === 'listo' && (
        <>
          {numeros.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">{t('vacio')}</p>
          ) : (
            <ul className="flex flex-col">
              {numeros.map((n) => (
                <li key={n.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
                  <span className="truncate text-sm text-fg">{n.label || t('sinEtiqueta')}</span>
                  <span className="hidden text-sm tabular-nums text-fg-secondary sm:block">{enmascararTelefono(n.phone_e164)}</span>
                  <button
                    type="button"
                    aria-label={t('quitar', { etiqueta: n.label || enmascararTelefono(n.phone_e164) || '' })}
                    disabled={ocupado !== null}
                    onClick={() => void quitar(n.id)}
                    className="rounded-md p-1.5 text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                  >
                    {ocupado === n.id ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {agregando ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
              <FormField etiqueta={t('telefono')} obligatorio>
                <PhoneInput value={telefono} onChange={setTelefono} />
              </FormField>
              <FormField etiqueta={t('etiqueta')}>
                <Input value={etiqueta} maxLength={80} onChange={(e) => setEtiqueta(e.target.value)} />
              </FormField>
              <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => setAgregando(false)}>
                {t('cancelar')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'primario' })} disabled={!telefono.trim() || ocupado !== null} onClick={() => void agregar()}>
                {ocupado === 'nuevo' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                {t('agregar')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-4 text-fg-muted">{t('ayuda')}</p>
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'shrink-0' })}
                disabled={numeros.length >= max}
                onClick={() => setAgregando(true)}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('anadir')}
              </button>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}

interface VerificacionRne {
  checked_at: string;
  file_name: string | null;
  excluded_targets: number;
}

function BloqueRne({ campanaId, asegurarBorrador }: { campanaId: string | null; asegurarBorrador: () => Promise<string | null> }) {
  const t = useTranslations('crm.campanaVozAsistente.cumplimiento.rne');
  const { formatDate } = useFormatDate();
  const entrada = useRef<HTMLInputElement>(null);
  const [verificacion, setVerificacion] = useState<VerificacionRne | null>(null);
  const [puede, setPuede] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (!campanaId) return;
    let vivo = true;
    pedirCrm<VerificacionRne | null>(`/api/crm/voice-agents/campaigns/${encodeURIComponent(campanaId)}/rne`)
      .then(({ data, extra }) => {
        if (!vivo) return;
        setVerificacion(data ?? null);
        setPuede(extra.puede_verificar === true);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [campanaId]);

  const subir = async (archivo: File) => {
    if (archivo.size > MAX_BYTES_RNE) {
      toast({ title: t('demasiadoGrande'), variant: 'destructive' });
      return;
    }
    setSubiendo(true);
    try {
      const id = campanaId ?? (await asegurarBorrador());
      if (!id) return;
      const contenido = await archivo.text();
      const { data } = await pedirCrm<VerificacionRne>(`/api/crm/voice-agents/campaigns/${encodeURIComponent(id)}/rne`, {
        method: 'POST',
        cuerpo: { nombre_archivo: archivo.name, contenido },
      });
      setVerificacion(data);
      toast({ title: t('subido') });
    } catch (e) {
      toast({ title: t('errorSubir'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <Tarjeta>
      <Cabecera
        icono={<FileText aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />}
        titulo={t('titulo')}
        insignia={
          <Badge tono="neutro" tamano="sm">
            {t('opcional')}
          </Badge>
        }
      />
      <p className="text-[13px] leading-[18px] text-fg-secondary">{t('texto')}</p>
      <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[13px] text-fg">
          {verificacion
            ? t('ultimo', { archivo: verificacion.file_name || t('archivo'), fecha: formatDate(verificacion.checked_at), n: verificacion.excluded_targets })
            : t('sinArchivo')}
        </span>
        {puede ? (
          <>
            <input ref={entrada} type="file" accept=".csv,.txt,text/plain,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && void subir(e.target.files[0])} />
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'shrink-0' })} disabled={subiendo} onClick={() => entrada.current?.click()}>
              {subiendo ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {subiendo ? t('subiendo') : t('subir')}
            </button>
          </>
        ) : (
          <span className="text-xs text-fg-muted">{t('soloAdmin')}</span>
        )}
      </div>
      <p className="text-xs text-info-text">{t('pie')}</p>
    </Tarjeta>
  );
}
