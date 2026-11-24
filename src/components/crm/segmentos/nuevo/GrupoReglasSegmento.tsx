'use client';

/**
 * Un grupo de reglas del constructor de segmentos (Figma CRM 1384:825677):
 * «Todos estos» (el primero) u «O todos estos». Y dentro del grupo («y» en el
 * margen izquierdo); el «o» entre grupos lo pinta la página. Cada regla:
 * campo · operador · valor, en una fila.
 */

import { useTranslations } from 'next-intl';
import { Plus, Trash2, X } from 'lucide-react';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { FILTER_FIELDS, type FilterOperator, type FilterRule } from '../types';
import { reglaCompleta } from './conteoSegmentoLogica';
import { cambiarCampo, cambiarOperador, operadoresDeCampo, puedeAnadirRegla, sinValor, tipoDeCampo } from './reglasSegmentoLogica';

/** Borde de error del kit (FormField State=error). */
const ROJO = 'border-danger focus-visible:ring-danger';

interface Props {
  indice: number;
  reglas: FilterRule[];
  onCambiarRegla: (r: number, regla: FilterRule) => void;
  onQuitarRegla: (r: number) => void;
  onAnadirRegla: () => void;
  onQuitarGrupo: () => void;
  /** Marca en rojo las reglas sin valor (Figma 1388:2472: «Guardar» queda deshabilitado). */
  marcarIncompletas?: boolean;
}

export function GrupoReglasSegmento({ indice, reglas, onCambiarRegla, onQuitarRegla, onAnadirRegla, onQuitarGrupo, marcarIncompletas = false }: Props) {
  const t = useTranslations('crm.segmentos.constructor');
  const titulo = indice === 0 ? t('grupos.todos') : t('grupos.oTodos');
  const campos = FILTER_FIELDS.map((f) => ({ valor: f.value, etiqueta: t(`campos.${f.value}`) }));

  return (
    <section aria-label={titulo} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-base font-semibold text-fg">{titulo}</h3>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
          onClick={onQuitarGrupo}
          aria-label={t('grupos.quitar', { titulo })}
          disabled={indice === 0 && reglas.length === 0}
        >
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      {reglas.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-secondary">{indice === 0 ? t('grupos.vacioPrimero') : t('grupos.vacio')}</p>
      ) : (
        <ol className="mt-2.5 space-y-2.5">
          {reglas.map((regla, r) => {
            const tipo = tipoDeCampo(regla.field);
            const ops = operadoresDeCampo(regla.field).map((op) => ({ valor: op, etiqueta: t(`operadores.${tipo}.${op}`) }));
            const n = r + 1;
            return (
              <li key={r} className="group/regla grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-x-2 gap-y-2 sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] sm:items-center">
                <span className="pt-3 text-[13px] text-fg-secondary sm:pt-0">{r > 0 ? t('grupos.y') : ''}</span>
                <div className="space-y-2 sm:contents">
                  <SelectCrm valor={regla.field} onValorChange={(v) => onCambiarRegla(r, cambiarCampo(regla, v))} opciones={campos} aria-label={t('regla.campo', { n })} />
                  <SelectCrm valor={regla.operator} onValorChange={(v) => onCambiarRegla(r, cambiarOperador(regla, v as FilterOperator))} opciones={ops} aria-label={t('regla.operador', { n })} />
                  <ValorRegla regla={regla} n={n} invalido={marcarIncompletas && !reglaCompleta(regla)} onCambiar={(value) => onCambiarRegla(r, { ...regla, value })} />
                </div>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => onQuitarRegla(r)}
                  aria-label={t('regla.quitar', { n })}
                >
                  <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <button type="button" className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'mt-2.5')} onClick={onAnadirRegla} disabled={!puedeAnadirRegla(reglas)}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('regla.anadir')}
      </button>
    </section>
  );
}

function ValorRegla({ regla, n, invalido, onCambiar }: { regla: FilterRule; n: number; invalido: boolean; onCambiar: (v: FilterRule['value']) => void }) {
  const t = useTranslations('crm.segmentos.constructor');
  if (sinValor(regla.operator)) return <span aria-hidden="true" className="hidden sm:block" />;
  const tipo = tipoDeCampo(regla.field);

  if (tipo === 'date' && regla.operator === 'between') {
    const [desde, hasta] = Array.isArray(regla.value) ? regla.value : ['', ''];
    return (
      <div className="grid grid-cols-2 gap-2">
        <CampoFecha valor={desde} onValorChange={(d) => onCambiar([d, hasta ?? ''])} max={hasta || undefined} aria-label={t('regla.desde', { n })} aria-invalid={invalido && !desde} className={invalido && !desde ? ROJO : undefined} />
        <CampoFecha valor={hasta} onValorChange={(d) => onCambiar([desde ?? '', d])} min={desde || undefined} aria-label={t('regla.hasta', { n })} aria-invalid={invalido && !hasta} className={invalido && !hasta ? ROJO : undefined} />
      </div>
    );
  }
  if (tipo === 'date') {
    return <CampoFecha valor={String(regla.value ?? '')} onValorChange={(d) => onCambiar(d)} aria-label={t('regla.valor', { n })} aria-invalid={invalido} className={invalido ? ROJO : undefined} />;
  }
  return (
    <input
      type={tipo === 'number' ? 'number' : 'text'}
      inputMode={tipo === 'number' ? 'decimal' : undefined}
      className={cn(CLASE_CAMPO, invalido && ROJO)}
      aria-invalid={invalido}
      value={String(regla.value ?? '')}
      onChange={(e) => onCambiar(e.target.value)}
      placeholder={tipo === 'array' ? t('regla.etiquetaPlaceholder') : t('regla.valorPlaceholder')}
      aria-label={t('regla.valor', { n })}
    />
  );
}
