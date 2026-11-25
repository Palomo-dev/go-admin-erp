'use client';

/**
 * «Identidades por canal» (pestaña de Identidades, Figma CRM 1436:19): cómo
 * se reconoce a cada cliente en cada canal. Solo lectura por
 * `GET /api/crm/identities`; las identidades las crean los canales al recibir
 * mensajes y la fusión las pasa al principal.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { SearchInput } from '@/components/kit/SearchInput';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { IdentidadCanal } from '@/lib/services/crm/identidadesCanalService';

const CANALES = ['website', 'whatsapp', 'instagram', 'facebook', 'email'] as const;

export function IdentidadesCanalPanel() {
  const t = useTranslations('crm.duplicados.canales');
  const { formatDateTime } = useFormatDate();
  const [q, setQ] = useState('');
  const [canal, setCanal] = useState('');
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [filas, setFilas] = useState<IdentidadCanal[]>([]);
  const [limite, setLimite] = useState(200);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (canal) qs.set('canal', canal);
    pedirCrm<{ identidades: IdentidadCanal[]; limite: number }>(`/api/crm/identities${qs.size ? `?${qs}` : ''}`, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setFilas(data.identidades);
        setLimite(data.limite);
        setEstado(data.identidades.length > 0 ? 'listo' : q.trim() || canal ? 'sinResultados' : 'vacio');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [q, canal, revision]);

  const nombreCanal = (tipo: string | null | undefined) => (tipo && (CANALES as readonly string[]).includes(tipo) ? t(`tipos.${tipo}`) : (tipo ?? t('sinCanal')));

  const columnas: ColumnaTabla<IdentidadCanal>[] = [
    {
      id: 'identidad',
      encabezado: t('columnas.identidad'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{f.identity_value}</p>
          <p className="truncate text-xs text-fg-secondary">{f.identity_type}</p>
        </div>
      ),
    },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      celda: (f) =>
        f.cliente ? (
          <Link href={`/app/clientes/${f.cliente.id}`} className="truncate text-sm text-brand-action hover:underline">
            {f.cliente.nombre ?? t('sinNombre')}
          </Link>
        ) : (
          <span className="text-sm text-fg-secondary">{t('sinCliente')}</span>
        ),
    },
    { id: 'canal', encabezado: t('columnas.canal'), celda: (f) => <span className="text-sm text-fg">{f.canal?.nombre ?? nombreCanal(f.canal?.tipo)}</span>, ocultarDebajo: 'md' },
    {
      id: 'verificada',
      encabezado: t('columnas.verificada'),
      celda: (f) => <StatusBadge estado={f.verified ? 'verificada' : 'sinVerificar'} etiqueta={t(f.verified ? 'verificada' : 'sinVerificar')} tono={f.verified ? 'exito' : 'neutro'} tamano="sm" />,
      ocultarDebajo: 'lg',
    },
    { id: 'ultima', encabezado: t('columnas.ultimaVez'), celda: (f) => <span className="text-sm text-fg-secondary">{f.last_seen_at ? formatDateTime(f.last_seen_at) : '—'}</span>, ocultarDebajo: 'sm' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} className="sm:max-w-sm sm:flex-1" />
        <div className="sm:w-56">
          <SelectCrm
            valor={canal}
            onValorChange={setCanal}
            opcionVacia={t('todos')}
            opciones={CANALES.map((c) => ({ valor: c, etiqueta: t(`tipos.${c}`) }))}
            aria-label={t('columnas.canal')}
          />
        </div>
      </div>
      <DataTable
        etiqueta={t('etiqueta')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estado}
        termino={q}
        onReintentar={() => setRevision((n) => n + 1)}
        onLimpiarFiltros={() => {
          setQ('');
          setCanal('');
        }}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        error={{ titulo: t('error') }}
        tarjetaMovil={(f) => (
          <div className="flex flex-col gap-1">
            <p className="truncate text-sm font-medium text-fg">{f.identity_value}</p>
            <p className="truncate text-xs text-fg-secondary">
              {[f.cliente?.nombre ?? t('sinCliente'), f.canal?.nombre ?? nombreCanal(f.canal?.tipo)].join(' · ')}
            </p>
          </div>
        )}
      />
      {estado === 'listo' && <p className="text-xs text-fg-secondary">{t('nota', { limite })}</p>}
    </div>
  );
}
