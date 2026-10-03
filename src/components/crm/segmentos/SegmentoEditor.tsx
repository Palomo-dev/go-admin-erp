'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Save, Users } from 'lucide-react';
import { useMigasAreaCrm } from '../campanas/migasCrm';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { normalizarFiltroSegmento } from '@/lib/services/crm/segmentosLogica';
import { filtroDeIdsSegmento, leerCsvMiembrosSegmento } from '@/lib/services/crm/segmentosImportacionLogica';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { SegmentoPreview } from './SegmentoPreview';
import { SegmentoReglas } from './SegmentoReglas';
export function SegmentoEditor({ initial, onCancel }: { initial?: SegmentoRegistro; onCancel?: () => void }) {
  const migas = useMigasAreaCrm('/app/crm/segmentos');
  const t = useTranslations('crm.segmentosNuevo');
  const router = useRouter();
  const query = useSearchParams();
  const intent = useRef(false);
  const active = useRef(true);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; }, []);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dynamic, setDynamic] = useState(initial?.is_dynamic ?? true);
  const [filter, setFilter] = useState<unknown>(() => {
    if (!initial) return { op: 'or', rules: [{ op: 'and', rules: [] }] };
    try { return normalizarFiltroSegmento(initial.filter_json); } catch { return initial.filter_json; }
  });
  const [refresh, setRefresh] = useState(!initial?.members_snapshotted_at);
  const [imported, setImported] = useState<string[] | undefined>();
  const [importInvalid, setImportInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let invalid = false;
  try { normalizarFiltroSegmento(filter); } catch { invalid = true; }
  const save = async () => {
    if (intent.current || !name.trim() || invalid || importInvalid) return;
    intent.current = true; abort.current = new AbortController(); setBusy(true); setError(null);
    try {
      const { data } = await pedirCrm<SegmentoRegistro>(`/api/crm/segments${initial ? `/${initial.id}` : ''}`, { method: initial ? 'PATCH' : 'POST', signal: abort.current.signal,
        cuerpo: { name, description, filter_json: filter, is_dynamic: dynamic, expected_updated_at: initial?.updated_at,
          refresh_members: refresh, member_ids: imported } });
      if (!active.current) return;
      router.push(`/app/crm/segmentos/${data.id}`); router.refresh();
      if (onCancel) onCancel();
    } catch (e) { if (active.current) setError(e instanceof ErrorApiCrm && e.status === 409 ? t('conflict') : t('actionError')); }
    finally { intent.current = false; if (active.current) setBusy(false); }
  };
  const cancel = onCancel ? <button type="button" disabled={busy} onClick={onCancel} className={clasesBoton({ variante: 'secundario' })}>{t('cancel')}</button>
    : <Link href="/app/crm/segmentos" className={clasesBoton({ variante: 'secundario' })}>{t('cancel')}</Link>;
  const actions = <>{cancel}<button type="button" disabled={busy || !name.trim() || invalid || importInvalid} onClick={() => void save()} className={clasesBoton()}><Save className="size-4" aria-hidden="true" strokeWidth={1.5} />{busy ? t('saving') : t('save')}</button></>;
  return <div className="space-y-4 bg-canvas p-4 sm:p-6">
    <PageHeader migas={migas} titulo={initial ? t('edit') : t('new')} subtitulo={t('constructorHelp')} icono={Users} volverA="/app/crm/segmentos" acciones={actions} />
    {error && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{error}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <FormField etiqueta={t('name')} tamanoEtiqueta="sm" obligatorio><input className={CLASE_CAMPO} value={name} maxLength={120} disabled={busy} onChange={e => setName(e.target.value)} /></FormField>
          <FormField etiqueta={t('type')} tamanoEtiqueta="sm">{props => <SegmentedControl aria-labelledby={props.idEtiqueta}
            valor={dynamic ? 'dynamic' : 'static'} onValorChange={v => { setDynamic(v === 'dynamic'); if (v === 'dynamic') setImported(undefined); }} deshabilitado={busy}
            opciones={[{ valor: 'dynamic', etiqueta: t('dynamic') }, { valor: 'static', etiqueta: t('static') }]} />}</FormField>
          </div>

        </div>
        {invalid && <p role="alert" className="text-sm text-danger-text">{t('invalidRules')}</p>}
        <SegmentoReglas value={filter} disabled={busy}
          onChange={next => { setFilter(next); setImported(undefined); setImportInvalid(false); setError(null); }} />
                  <details open={query?.get('import') === '1'} className="text-[13px] text-fg-secondary"><summary className="cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-brand">{t('descriptionImport')}</summary><div className="mt-3 space-y-4">
          <FormField etiqueta={t('description')} tamanoEtiqueta="sm"><textarea className={`${CLASE_CAMPO} min-h-20`} value={description} maxLength={1000} disabled={busy} onChange={e => setDescription(e.target.value)} /></FormField>
          {initial?.is_dynamic === false && !dynamic && <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" checked={refresh} disabled={busy} onChange={e => setRefresh(e.target.checked)} /><span>{t('refreshMembers')}<small className="block text-fg-secondary">{t('refreshHelp')}</small></span></label>}
          <FormField etiqueta={t('import')} ayuda={t('importHelp')}><input type="file" accept=".csv,text/csv" disabled={busy} className={CLASE_CAMPO} onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            try { if (file.size > 1024 * 1024) throw new Error('archivo_grande'); const ids = leerCsvMiembrosSegmento(await file.text()); setImported(ids); setFilter(filtroDeIdsSegmento(ids)); setDynamic(false); setRefresh(true); setError(null); setImportInvalid(false); }
            catch { setError(t('invalidImport')); setImportInvalid(true); }
          }} /></FormField>
          </div></details>
      </div>
      {!invalid && <SegmentoPreview filter={filter} />}
    </div>
    <div className="flex flex-wrap justify-end gap-2 lg:hidden">{actions}</div>
  </div>;
}
