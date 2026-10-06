'use client';

/**
 * Posibles duplicados (Figma CRM 1436:19 listo, 1438:1130 buscando, 1438:721
 * vacío, 1438:1553 error). Los grupos los arma el servidor
 * (`GET /api/crm/customer-merges/duplicates` → `crm_find_duplicates`: mismo
 * teléfono, correo o documento). Fusionar es una transacción
 * (`POST /api/crm/customer-merges`) que se puede deshacer 30 días; «No son el
 * mismo» deja de proponer la pareja.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Fingerprint, Mail, Merge, Phone, UserX } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { CampoFusion, ClienteDuplicado, GrupoDuplicados } from '@/lib/services/crm/customerMergeLogica';
import { DialogoFusion } from './DialogoFusion';
import { choicesParaApi, claveErrorFusion, nombreCliente, tipoIdentidad } from './fusionLogica';

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';
interface Respuesta { grupos: GrupoDuplicados[]; puedeFusionar: boolean; puedeDeshacer: boolean }

const ICONO = { phone: Phone, email: Mail, document: Fingerprint, otro: Fingerprint } as const;

export function DuplicadosPanel({ onCambio }: { onCambio?: () => void }) {
  const t = useTranslations('crm.duplicados');
  const entero = useFormatoEntero();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [revision, setRevision] = useState(0);
  const [abierto, setAbierto] = useState<GrupoDuplicados | null>(null);
  const [fusionando, setFusionando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<Respuesta>('/api/crm/customer-merges/duplicates', { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [revision]);

  const recargar = useCallback(() => {
    setRevision((n) => n + 1);
    onCambio?.();
  }, [onCambio]);

  const deshacer = async (mergeId: string) => {
    try {
      await pedirCrm(`/api/crm/customer-merges/${encodeURIComponent(mergeId)}/undo`, { method: 'POST', cuerpo: {} });
      toast({ title: t('deshecha') });
      recargar();
    } catch (e) {
      toast({ title: t('noDeshecha'), description: t(`errores.${claveErrorFusion(e instanceof ErrorApiCrm ? e.codigo : null)}`), variant: 'destructive' });
    }
  };

  const fusionar = async (principal: ClienteDuplicado, secundario: ClienteDuplicado, elecciones: Partial<Record<CampoFusion, string>>) => {
    setFusionando(true);
    setError(null);
    try {
      const { data } = await pedirCrm<{ id: string }>('/api/crm/customer-merges', {
        method: 'POST',
        cuerpo: { primary_id: principal.id, secondary_id: secundario.id, choices: choicesParaApi(elecciones, secundario.id) },
      });
      setAbierto(null);
      toast({
        title: t('fusionada', { nombre: nombreCliente(principal) ?? t('fusion.sinNombre') }),
        description: t('fusionadaDetalle'),
        action: datos?.puedeDeshacer ? (
          <ToastAction altText={t('deshacer')} onClick={() => void deshacer(data.id)}>
            {t('deshacer')}
          </ToastAction>
        ) : undefined,
      });
      recargar();
    } catch (e) {
      // La RPC es una transacción: si falló, nada cambió.
      setError(t(`errores.${claveErrorFusion(e instanceof ErrorApiCrm ? e.codigo : null)}`));
    } finally {
      setFusionando(false);
    }
  };

  const noSonElMismo = async (g: GrupoDuplicados) => {
    const [a, b] = g.customers;
    try {
      await pedirCrm('/api/crm/customer-merges/exclusions', { method: 'POST', cuerpo: { a: a.id, b: b.id } });
      toast({ title: t('excluida') });
      recargar();
    } catch {
      toast({ title: t('errores.generico'), variant: 'destructive' });
    }
  };

  if (estado === 'cargando' && !datos) {
    return (
      <div aria-busy="true" aria-label={t('buscando')} className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-subtle" />)}
      </div>
    );
  }
  if (estado === 'error' || estado === 'sinPermiso') {
    return <EmptyState variante={estado === 'sinPermiso' ? 'forbidden' : 'error'} titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : 'error')} onReintentar={estado === 'error' ? recargar : undefined} />;
  }
  const grupos = datos?.grupos ?? [];
  if (grupos.length === 0) {
    return <EmptyState icono={Fingerprint} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />;
  }

  return (
    <section aria-labelledby="duplicados-titulo" className="space-y-3">
      <h2 id="duplicados-titulo" className="text-base font-semibold text-fg">{t('titulo', { n: grupos.length, valor: entero(grupos.length) })}</h2>
      <ul className="space-y-3">
        {grupos.map((g) => {
          const tipo = tipoIdentidad(g.identity_type);
          const Icono = ICONO[tipo];
          return (
            <li key={`${g.identity_type}:${g.identity_value}`} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Icono aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{t(`mismo.${tipo}`, { valor: g.identity_value })}</p>
                {datos?.puedeFusionar && (
                  <div className="flex gap-2">
                    {g.customers.length === 2 && (
                      <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => void noSonElMismo(g)}>
                        <UserX aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('noSonElMismo')}
                      </button>
                    )}
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => { setError(null); setAbierto(g); }}>
                      <Merge aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('revisar')}
                    </button>
                  </div>
                )}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.customers.map((c) => (
                  <li key={c.id} className="min-w-0 rounded-lg bg-subtle px-3 py-2">
                    <p className="truncate text-sm text-fg">{nombreCliente(c) ?? t('fusion.sinNombre')}</p>
                    <p className="truncate text-xs text-fg-secondary">{t('conteos', { conversaciones: c.conversations_count, oportunidades: c.opportunities_count })}</p>
                  </li>
                ))}
              </ul>
              {g.customers.length > 2 && <StatusBadge estado="varios" etiqueta={t('varios', { n: g.customers.length })} tono="advertencia" tamano="sm" />}
            </li>
          );
        })}
      </ul>
      {!datos?.puedeFusionar && <p className="text-xs text-fg-secondary">{t('soloLectura')}</p>}

      <DialogoFusion grupo={abierto} fusionando={fusionando} error={error} onCerrar={() => setAbierto(null)} onFusionar={(p, s, e) => void fusionar(p, s, e)} />
    </section>
  );
}
