'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Repeat, TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { ErrorApiCrm, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';

/**
 * «Inscribir en secuencia» desde Salud (Figma 1424:914 y acción sugerida de
 * la lista). Reutiliza las rutas de Secuencias: `GET /api/crm/sequences` y
 * `POST /api/crm/sequences/[id]/enroll` con `customer_id` (solo admin; la RPC
 * `fn_enroll_in_sequence` no duplica). Como en `EnrollDialog`, se envían
 * mensajes reales: hay que confirmarlo.
 */
interface SecuenciaLista {
  id: string;
  name: string;
  is_active: boolean;
  steps?: { is_active?: boolean }[];
}

export function InscribirSecuenciaDialog({ cliente, onCerrar }: { cliente: { id: string; nombre: string } | null; onCerrar: () => void }) {
  const t = useTranslations('crm.redSalud.secuencia');
  const idAviso = useId();
  const [secuencias, setSecuencias] = useState<SecuenciaLista[] | null>(null);
  const [elegida, setElegida] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abierto = !!cliente;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setSecuencias(null);
    setElegida('');
    setConfirmo(false);
    setError(null);
    pedirCrm<SecuenciaLista[]>('/api/crm/sequences')
      .then(({ data }) => {
        if (!vivo) return;
        const activas = (data ?? []).filter((s) => s.is_active);
        setSecuencias(activas);
        if (activas.length === 1) setElegida(activas[0].id);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setSecuencias([]);
        setError(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? t('soloAdmin') : t('errorCarga'));
      });
    return () => {
      vivo = false;
    };
  }, [abierto, t]);

  const inscribir = async () => {
    if (!cliente || !elegida) return;
    setOcupado(true);
    setError(null);
    try {
      await pedirCrm(`/api/crm/sequences/${encodeURIComponent(elegida)}/enroll`, { method: 'POST', cuerpo: { customer_id: cliente.id } });
      const nombre = secuencias?.find((s) => s.id === elegida)?.name ?? '';
      toast({ title: t('hecho', { secuencia: nombre }) });
      emitirCambioCrm({ entidad: 'customer', id: cliente.id, accion: 'secuencia' });
      onCerrar();
    } catch (e) {
      const motivo = e instanceof ErrorApiCrm ? ((e.cuerpo?.skipped as { reason?: string }[] | undefined)?.[0]?.reason ?? '') : '';
      if (e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403)) setError(t('soloAdmin'));
      else if (motivo.includes('already_active')) setError(t('yaInscrito'));
      else setError(t('error'));
    } finally {
      setOcupado(false);
    }
  };

  const sinSecuencias = secuencias !== null && secuencias.length === 0;
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('titulo')}
      descripcion={cliente ? t('descripcion', { nombre: cliente.nombre }) : undefined}
      icono={Repeat}
      ancho={440}
      primario={{
        etiqueta: t('inscribir'),
        onClick: () => void inscribir(),
        cargando: ocupado,
        deshabilitada: !elegida || !confirmo,
        motivo: !elegida ? t('elegirPrimero') : !confirmo ? t('confirmarPrimero') : undefined,
      }}
    >
      {secuencias === null ? (
        <span className="h-10 animate-pulse rounded-lg bg-subtle motion-reduce:animate-none" aria-busy="true" />
      ) : sinSecuencias && !error ? (
        <p className="text-sm text-fg-secondary">
          {t('sinSecuencias')}{' '}
          <Link href="/app/crm/secuencias" className="font-medium text-link hover:underline">{t('irSecuencias')}</Link>
        </p>
      ) : (
        <>
          {!sinSecuencias && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('elegir')}
              <SelectCrm
                valor={elegida}
                onValorChange={setElegida}
                placeholder={t('elegirPlaceholder')}
                opciones={(secuencias ?? []).map((s) => ({ valor: s.id, etiqueta: s.steps ? `${s.name} · ${t('pasos', { n: s.steps.filter((p) => p.is_active !== false).length })}` : s.name }))}
              />
            </label>
          )}
          <div id={idAviso} className="flex gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-[13px] text-warning-text">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {t('aviso')}
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={confirmo} onCheckedChange={(v) => setConfirmo(v === true)} aria-describedby={idAviso} />
            {t('confirmo')}
          </label>
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </Dialogo>
  );
}
