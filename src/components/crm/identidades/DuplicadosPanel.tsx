'use client';

/**
 * Posibles duplicados (Figma CRM 1436:19 «listo», 1438:1130 «buscando»,
 * 1438:721 «vacío»). Los grupos los arma el servidor
 * (`GET /api/crm/customer-merges/duplicates` → `crm_find_duplicates`: mismo
 * teléfono, correo o documento; nunca por nombre solo). «Comparar y
 * fusionar» abre la comparación (`/app/crm/identidades/comparar`); «No son
 * el mismo» deja de proponer la pareja (`customer_merge_exclusions`).
 *
 * La búsqueda corre en la petición (no hay un job en segundo plano): mientras
 * responde se ve la barra de «Revisando…» sin porcentaje y los grupos en
 * esqueleto, y los números de arriba conservan la última búsqueda.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AtSign, Hash, Merge, Phone, TriangleAlert, UserX } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatCard } from '@/components/kit/StatCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { ClienteDuplicado, GrupoDuplicados } from '@/lib/services/crm/customerMergeLogica';
import { claveMismo, confianzaGrupo, conteoPorTipo, nombreCliente, nombreSecundarioCliente, urlComparar } from './fusionLogica';

export type EstadoDuplicados = 'cargando' | 'listo' | 'error' | 'sinPermiso';
export interface RespuestaDuplicados {
  grupos: GrupoDuplicados[];
  puedeFusionar: boolean;
  puedeDeshacer: boolean;
  clientesRevisados: number | null;
}

/** Carga los grupos; `recargar` vuelve a buscar conservando lo último mientras responde. */
export function useDuplicados() {
  const [estado, setEstado] = useState<EstadoDuplicados>('cargando');
  const [datos, setDatos] = useState<RespuestaDuplicados | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<RespuestaDuplicados>('/api/crm/customer-merges/duplicates', { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [revision]);

  const recargar = useCallback(() => setRevision((n) => n + 1), []);
  return { estado, datos, recargar };
}

const ICONO = { phone: Phone, email: AtSign, nit: Hash, document: Hash, otro: Hash } as const;

interface Props {
  estado: EstadoDuplicados;
  datos: RespuestaDuplicados | null;
  onRecargar: () => void;
}

export function DuplicadosPanel({ estado, datos, onRecargar }: Props) {
  const t = useTranslations('crm.duplicados');
  const entero = useFormatoEntero();
  const buscando = estado === 'cargando';
  const grupos = datos?.grupos ?? [];
  const porTipo = conteoPorTipo(grupos);
  const revisados = datos?.clientesRevisados ?? null;

  const noSonElMismo = async (g: GrupoDuplicados) => {
    const [a, b] = g.customers;
    try {
      await pedirCrm('/api/crm/customer-merges/exclusions', { method: 'POST', cuerpo: { a: a.id, b: b.id } });
      toast({ title: t('excluida') });
      onRecargar();
    } catch {
      toast({ title: t('errores.generico'), variant: 'destructive' });
    }
  };

  if (estado === 'sinPermiso' || (estado === 'error' && !datos)) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          variante={estado === 'sinPermiso' ? 'forbidden' : 'error'}
          titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : 'error')}
          onReintentar={estado === 'error' ? onRecargar : undefined}
          accion={estado === 'sinPermiso' ? { etiqueta: t('pantalla.volverCrm'), href: '/app/crm' } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {buscando && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <p className="text-[13px] text-fg-secondary">{revisados !== null ? t('revisando', { n: entero(revisados) }) : t('buscando')}</p>
          <div role="progressbar" aria-label={t('buscando')} className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-brand-action" />
          </div>
        </div>
      )}
      {estado === 'error' && datos && <p className="text-[13px] text-danger-text" role="alert">{t('error')}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard etiqueta={t('kpis.telefono')} valor={entero(porTipo.phone)} detalle={t('kpis.telefonoDetalle')} cargando={!datos} />
        <StatCard etiqueta={t('kpis.correo')} valor={entero(porTipo.email)} detalle={t('kpis.correoDetalle')} cargando={!datos} />
        <StatCard
          etiqueta={t('kpis.documento')}
          valor={entero(porTipo.document)}
          detalle={t('kpis.documentoDetalle')}
          tono="advertencia"
          iconoDetalle={TriangleAlert}
          cargando={!datos}
        />
      </div>

      {buscando ? (
        <ul aria-busy="true" aria-label={t('buscando')} className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-4 px-2 py-2">
              <span className="size-4 animate-pulse rounded bg-subtle" />
              <span className="size-8 animate-pulse rounded-lg bg-subtle" />
              <span className="h-3 w-16 animate-pulse rounded-full bg-subtle" />
              <span className="h-3 flex-1 animate-pulse rounded-full bg-subtle" />
              <span className="hidden h-3 w-24 animate-pulse rounded-full bg-subtle sm:block" />
              <span className="hidden h-6 w-24 animate-pulse rounded-full bg-subtle md:block" />
            </li>
          ))}
        </ul>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icono={Merge}
            titulo={t('vacio.titulo')}
            descripcion={revisados !== null ? t('vacio.descripcionTotal', { n: entero(revisados) }) : t('vacio.descripcion')}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('titulo', { n: grupos.length, valor: entero(grupos.length) })}>
          {grupos.map((g) => (
            <FilaGrupo key={`${g.identity_type}:${g.identity_value}`} grupo={g} puedeFusionar={!!datos?.puedeFusionar} onNoSonElMismo={() => void noSonElMismo(g)} />
          ))}
        </ul>
      )}
      {datos && !datos.puedeFusionar && grupos.length > 0 && <p className="text-xs text-fg-secondary">{t('soloLectura')}</p>}
    </div>
  );
}

function FilaGrupo({ grupo: g, puedeFusionar, onNoSonElMismo }: { grupo: GrupoDuplicados; puedeFusionar: boolean; onNoSonElMismo: () => void }) {
  const t = useTranslations('crm.duplicados');
  const clave = claveMismo(g);
  const Icono = ICONO[clave];
  const alta = confianzaGrupo(g) === 'alta';
  const visibles = g.customers.slice(0, 2);
  const resto = g.customers.length - visibles.length;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-col items-start gap-1.5 lg:w-[250px] lg:shrink-0">
        <p className="flex min-w-0 max-w-full items-center gap-2 text-sm text-fg">
          <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className="truncate">{t(`mismo.${clave}`, { valor: g.identity_value })}</span>
        </p>
        <StatusBadge estado={alta ? 'alta' : 'media'} etiqueta={t(alta ? 'confianza.alta' : 'confianza.media')} tono={alta ? 'peligro' : 'advertencia'} tamano="sm" />
      </div>

      <ul className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        {visibles.map((c) => (
          <TarjetaCliente key={c.id} cliente={c} />
        ))}
      </ul>
      {resto > 0 && <span className="shrink-0 text-[13px] text-fg-secondary">{t('mas', { n: resto })}</span>}

      {puedeFusionar && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {g.customers.length === 2 && (
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })} onClick={onNoSonElMismo}>
              <UserX aria-hidden="true" className="size-4 lg:hidden" strokeWidth={1.5} />
              {t('noSonElMismo')}
            </button>
          )}
          <Link href={urlComparar(g)} className={clasesBoton({ tamano: 'sm' })}>
            <Merge aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('compararYFusionar')}
          </Link>
        </div>
      )}
    </li>
  );
}

function TarjetaCliente({ cliente: c }: { cliente: ClienteDuplicado }) {
  const t = useTranslations('crm.duplicados');
  const nombre = nombreCliente(c) ?? t('fusion.sinNombre');
  const partes = [
    nombreSecundarioCliente(c),
    c.opportunities_count > 0 ? t('tarjeta.oportunidades', { n: c.opportunities_count }) : null,
    c.conversations_count > 0 ? t('tarjeta.conversaciones', { n: c.conversations_count }) : null,
  ].filter(Boolean);
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg bg-subtle px-3 py-2">
      <AvatarIniciales nombre={nombre} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fg">{nombre}</p>
        <p className="line-clamp-2 text-xs text-fg-secondary">{partes.length > 0 ? partes.join(' · ') : t('tarjeta.sinActividad')}</p>
      </div>
    </li>
  );
}
