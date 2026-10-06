'use client';

/**
 * Un grupo de reglas del constructor de segmentos (Figma CRM 1384:825677):
 * «Todos estos» (el primero) u «O todos estos». Y dentro del grupo; el O entre
 * grupos lo pinta la página. Cada regla: campo · operador · valor.
 */

import { useTranslations } from 'next-intl';
import { Plus, Trash2, X } from 'lucide-react';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { clasesBoton } from '@/components/kit/botonClases';
import { FILTER_FIELDS, type FilterOperator, type FilterRule } from '../types';
import { cambiarCampo, cambiarOperador, operadoresDeCampo, puedeAnadirRegla, sinValor, tipoDeCampo } from './reglasSegmentoLogica';

interface Props {
  indice: number;
  reglas: FilterRule[];
  onCambiarRegla: (r: number, regla: FilterRule) => void;
  onQuitarRegla: (r: number) => void;
  onAnadirRegla: () => void;
  onQuitarGrupo: () => void;
}

export function GrupoReglasSegmento({ indice, reglas, onCambiarRegla, onQuitarRegla, onAnadirRegla, onQuitarGrupo }: Props) {
  const t = useTranslations('crm.segmentos.constructor');
  const titulo = indice === 0 ? t('grupos.todos') : t('grupos.oTodos');
  const campos = FILTER_FIELDS.map((f) => ({ valor: f.value, etiqueta: t(`campos.${f.value}`) }));

  return (
    <section aria-label={titulo} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold text-fg">{titulo}</h3>
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onQuitarGrupo} aria-label={t('grupos.quitar', { titulo })} disabled={indice === 0 && reglas.length === 0}>
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      {reglas.length === 0 ? (
        <p className="text-[13px] text-fg-secondary">{indice === 0 ? t('grupos.vacioPrimero') : t('grupos.vacio')}</p>
      ) : (
        <ol className="space-y-2">
          {reglas.map((regla, r) => {
            const tipo = tipoDeCampo(regla.field);
            const ops = operadoresDeCampo(regla.field).map((op) => ({ valor: op, etiqueta: t(`operadores.${tipo}.${op}`) }));
            const n = r + 1;
            return (
              <li key={r} className="space-y-2">
                {r > 0 && <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{t('grupos.y')}</p>}
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
                  <SelectCrm valor={regla.field} onValorChange={(v) => onCambiarRegla(r, cambiarCampo(regla, v))} opciones={campos} aria-label={t('regla.campo', { n })} />
                  <SelectCrm valor={regla.operator} onValorChange={(v) => onCambiarRegla(r, cambiarOperador(regla, v as FilterOperator))} opciones={ops} aria-label={t('regla.operador', { n })} />
                  <ValorRegla regla={regla} n={n} onCambiar={(value) => onCambiarRegla(r, { ...regla, value })} />
                  <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => onQuitarRegla(r)} aria-label={t('regla.quitar', { n })}>
                    <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={onAnadirRegla} disabled={!puedeAnadirRegla(reglas)}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('regla.anadir')}
      </button>
    </section>
  );
}

function ValorRegla({ regla, n, onCambiar }: { regla: FilterRule; n: number; onCambiar: (v: FilterRule['value']) => void }) {
  const t = useTranslations('crm.segmentos.constructor');
  if (sinValor(regla.operator)) return <span aria-hidden="true" className="hidden sm:block" />;
  const tipo = tipoDeCampo(regla.field);

  if (tipo === 'date' && regla.operator === 'between') {
    const [desde, hasta] = Array.isArray(regla.value) ? regla.value : ['', ''];
    return (
      <div className="grid grid-cols-2 gap-2">
        <CampoFecha valor={desde} onValorChange={(d) => onCambiar([d, hasta ?? ''])} max={hasta || undefined} aria-label={t('regla.desde', { n })} />
        <CampoFecha valor={hasta} onValorChange={(d) => onCambiar([desde ?? '', d])} min={desde || undefined} aria-label={t('regla.hasta', { n })} />
      </div>
    );
  }
  if (tipo === 'date') {
    return <CampoFecha valor={String(regla.value ?? '')} onValorChange={(d) => onCambiar(d)} aria-label={t('regla.valor', { n })} />;
  }
  return (
    <input
      type={tipo === 'number' ? 'number' : 'text'}
      inputMode={tipo === 'number' ? 'decimal' : undefined}
      className={CLASE_CAMPO}
      value={String(regla.value ?? '')}
      onChange={(e) => onCambiar(e.target.value)}
      placeholder={tipo === 'array' ? t('regla.etiquetaPlaceholder') : t('regla.valorPlaceholder')}
      aria-label={t('regla.valor', { n })}
    />
  );
}
