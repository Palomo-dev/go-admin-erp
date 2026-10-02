'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { MessagesSquare, Plus, Pencil, RefreshCw } from 'lucide-react';
import { PageHeader, SearchInput, EmptyState, clasesBoton } from '@/components/kit';
import { StaggerList, StaggerItem } from '@/components/shared/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { Objection } from '@/lib/services/crm/objectionService';
import {
  EMPTY_FILTERS,
  filterObjections,
  type ObjectionFilters,
  OBJECTION_CATEGORIES,
} from '@/lib/services/crm/objectionModel';
import { ObjectionEditor } from './ObjectionEditor';
import { ObjectionDetail } from './ObjectionDetail';
import { LiveObjectionContext } from './LiveObjectionContext';
import { useObjections } from './useObjections';
import { useObjectionInsights } from './useObjectionInsights';
export function ObjecionesPage() {
  const t = useTranslations('crm.objecionesNuevo'),
    format = useFormatter();
  const { objections, loading, error, reload, save, toggle, canManage } = useObjections();
  const insights = useObjectionInsights();
  const [filters, setFilters] = useState<ObjectionFilters>(EMPTY_FILTERS),
    [editor, setEditor] = useState<{ row: Objection | null } | null>(null),
    [detail, setDetail] = useState<Objection | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [actionError, setActionError] = useState(false);
  const shown = useMemo(() => filterObjections(objections, filters), [objections, filters]);
  const onToggle = async (row: Objection) => {
    setBusy(row.id);
    setActionError(false);
    try {
      await toggle(row);
    } catch {
      setActionError(true);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    const switched = () => {
      setEditor(null);
      setDetail(null);
      setBusy(null);
      setActionError(false);
    };
    window.addEventListener('organization-changed', switched);
    return () => window.removeEventListener('organization-changed', switched);
  }, []);
  const newButton = (
    <button
      className={clasesBoton({ variante: 'primario' })}
      disabled={!canManage || loading || !!error}
      onClick={() => setEditor({ row: null })}
    >
      <Plus className="size-4" />
      {t('new')}
    </button>
  );
  const category = (value: string | null) =>
    value && t.has(`categories.${value}`) ? t(`categories.${value}`) : (value ?? t('noCategory'));
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        titulo={t('title')}
        subtitulo={t('subtitle')}
        icono={MessagesSquare}
        cargando={loading}
        acciones={
          <div className="flex gap-2">
            <button
              className={clasesBoton({ variante: 'fantasma' })}
              aria-label={t('refresh')}
              onClick={() => {
                void reload();
                void insights.reload();
              }}
            >
              <RefreshCw className="size-4" />
            </button>
            {newButton}
          </div>
        }
      />
      <LiveObjectionContext objections={objections} />
      {loading ? (
        <div
          aria-busy="true"
          aria-label={t('loading')}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : error ? (
        <EmptyState variante="error" onReintentar={() => void reload()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <SearchInput
              value={filters.query}
              onChange={(query) => setFilters({ ...filters, query })}
              onValueChange={(query) => setFilters({ ...filters, query })}
              etiqueta={t('search')}
              placeholder={t('searchHint')}
              className="min-w-48 flex-1"
            />
            <select
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg"
              aria-label={t('category')}
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            >
              <option value="all">{t('allCategories')}</option>
              {OBJECTION_CATEGORIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {category(row.value)}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-fg"
              aria-label={t('status')}
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value as ObjectionFilters['status'] })
              }
            >
              {(['all', 'active', 'inactive'] as const).map((status) => (
                <option key={status} value={status}>
                  {t(status === 'all' ? 'allStates' : status)}
                </option>
              ))}
            </select>
          </div>
          {insights.error && (
            <p role="alert" className="text-sm text-warning-text">
              {t('frequencyUnavailable')}{' '}
              <button className="underline" onClick={() => void insights.reload()}>
                {t('retry')}
              </button>
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-danger-text">
              {t('actionError')}
            </p>
          )}
          {shown.length ? (
            <StaggerList
              as="ul"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              aria-label={t('title')}
            >
              {shown.map((row) => {
                const frequency = insights.data?.frequencies.find(
                  (value) => value.objection_id === row.id,
                );
                return (
                  <StaggerItem
                    as="li"
                    key={row.id}
                    className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="text-left font-semibold text-fg hover:text-brand"
                        onClick={() => setDetail(row)}
                      >
                        {row.title}
                      </button>
                      <Switch
                        aria-label={t(row.is_active ? 'deactivate' : 'activate', {
                          title: row.title,
                        })}
                        checked={row.is_active}
                        disabled={!canManage || busy === row.id}
                        onCheckedChange={() => void onToggle(row)}
                      />
                    </div>
                    <span className="text-xs text-fg-secondary">
                      {category(row.category)} · {t(row.is_active ? 'active' : 'inactive')}
                    </span>
                    <ul className="flex flex-wrap gap-1.5">
                      {row.detection_signals?.slice(0, 6).map((signal) => (
                        <li
                          key={signal}
                          className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs text-fg-secondary"
                        >
                          {signal}
                        </li>
                      ))}
                    </ul>
                    <p className="line-clamp-3 text-sm text-fg-secondary">
                      {row.recommended_response ?? t('noResponse')}
                    </p>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                      <div className="text-xs text-fg-secondary">
                        <p>
                          {insights.loading
                            ? t('loadingFrequency')
                            : insights.error
                              ? t('notAvailable')
                              : t('callCount', { count: frequency?.call_count ?? 0 })}
                        </p>
                        {!insights.loading && !insights.error && (
                          <p>
                            {t('opportunityAdvance', {
                              advanced: frequency?.advanced_opportunity_count ?? 0,
                              total: frequency?.opportunity_count ?? 0,
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className={clasesBoton({ variante: 'fantasma' })}
                          onClick={() => setDetail(row)}
                        >
                          {t('detail')}
                        </button>
                        <button
                          className={clasesBoton({ variante: 'fantasma' })}
                          aria-label={t('editTitle', { title: row.title })}
                          disabled={!canManage}
                          onClick={() => setEditor({ row })}
                        >
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          ) : (
            <EmptyState
              titulo={t(objections.length ? 'noResults' : 'noObjections')}
              descripcion={t(objections.length ? 'noResultsHint' : 'noObjectionsHint')}
              icono={MessagesSquare}
              accion={
                objections.length
                  ? { etiqueta: t('clearFilters'), onClick: () => setFilters(EMPTY_FILTERS) }
                  : undefined
              }
            />
          )}
          <p className="text-xs text-fg-secondary" aria-live="polite">
            {t('resultCount', { count: shown.length, total: format.number(objections.length) })}
          </p>
        </>
      )}
      <ObjectionEditor
        open={!!editor}
        row={editor?.row ?? null}
        onClose={() => setEditor(null)}
        onSave={save}
      />
      <ObjectionDetail
        canManage={canManage}
        objection={detail}
        onClose={() => setDetail(null)}
        onEdit={(row) => setEditor({ row })}
      />
    </div>
  );
}
