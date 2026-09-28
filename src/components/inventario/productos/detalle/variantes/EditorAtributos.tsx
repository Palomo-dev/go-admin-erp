'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Tags, X } from 'lucide-react';
import { normalizarBusqueda } from '@/components/kit/arbol';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { mismoTexto, valorEnCatalogo, valoresDeTipo, type TipoCatalogo } from './catalogoAtributos';

/**
 * Editor de los atributos de una variante («Talla: 40», «Color: Negro»):
 * un campo por tipo con sugerencias del catálogo (máx. 12 visibles y
 * «+N más (escribe para buscar)»), «Guardar este valor en el catálogo» y
 * «Agregar atributo» (tipo existente o nuevo). Lo usan el diálogo del detalle
 * (que persiste el catálogo al instante) y el panel de la variante del
 * formulario (que no escribe: los tipos nuevos los crea la RPC al guardar).
 */
export interface EditorAtributosProps {
  atributos: Record<string, string>;
  onChange: (atributos: Record<string, string>) => void;
  tipos: readonly TipoCatalogo[];
  /** Detalle: guarda el valor en `variant_values`. Sin esta prop no hay botón. */
  onGuardarValor?: (tipo: string, valor: string) => Promise<void>;
  /** Detalle: guarda el tipo nuevo en `variant_types` antes de agregarlo. */
  onCrearTipo?: (nombre: string) => Promise<void>;
  deshabilitado?: boolean;
  /** Prefijo de ids (datalist) único en la página. */
  idBase: string;
}

const MAX_SUGERENCIAS = 12;
const MAX_LARGO_SUGERENCIA = 25;

export function EditorAtributos({ atributos, onChange, tipos, onGuardarValor, onCrearTipo, deshabilitado, idBase }: EditorAtributosProps) {
  const t = useTranslations('productoDetalle.variantes.atributos');
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [guardandoValor, setGuardandoValor] = useState<string | null>(null);
  const [creandoTipo, setCreandoTipo] = useState(false);
  const claves = Object.keys(atributos);

  const tiposDisponibles = tipos.filter((tp) => !claves.some((k) => mismoTexto(k, tp.nombre)));

  const cambiarValor = (tipo: string, valor: string) => onChange({ ...atributos, [tipo]: valor });
  const quitar = (tipo: string) => {
    const resto = { ...atributos };
    delete resto[tipo];
    onChange(resto);
  };
  const agregarTipo = async (nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio || claves.some((k) => mismoTexto(k, limpio))) {
      setNuevoTipo('');
      return;
    }
    // Se usa el nombre del catálogo si ya existe (misma grafía en todas las variantes).
    const delCatalogo = tipos.find((tp) => mismoTexto(tp.nombre, limpio))?.nombre ?? limpio;
    if (onCrearTipo && !tipos.some((tp) => tp.id !== null && mismoTexto(tp.nombre, limpio))) {
      setCreandoTipo(true);
      try {
        await onCrearTipo(delCatalogo);
      } catch {
        // El padre ya avisó; el atributo se agrega igual (la RPC lo guarda con la variante).
      } finally {
        setCreandoTipo(false);
      }
    }
    onChange({ ...atributos, [delCatalogo]: '' });
    setNuevoTipo('');
  };
  const guardarValor = async (tipo: string) => {
    if (!onGuardarValor) return;
    setGuardandoValor(tipo);
    try {
      await onGuardarValor(tipo, atributos[tipo] ?? '');
    } catch {
      // El padre muestra el error.
    } finally {
      setGuardandoValor(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {claves.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('sinAtributos')}</p>
      ) : (
        claves.map((tipo, i) => {
          const valor = atributos[tipo] ?? '';
          const sugerencias = valoresDeTipo(tipos, tipo);
          const exacta = sugerencias.some((s) => mismoTexto(s, valor));
          const filtradas =
            valor.trim() && !exacta
              ? sugerencias.filter((s) => normalizarBusqueda(s).includes(normalizarBusqueda(valor)))
              : sugerencias;
          const visibles = filtradas.filter((s) => s.length <= MAX_LARGO_SUGERENCIA).slice(0, MAX_SUGERENCIAS);
          const ocultas = filtradas.length - visibles.length;
          const idLista = `${idBase}-sug-${i}`;
          const idCampo = `${idBase}-attr-${i}`;
          const yaEnCatalogo = valorEnCatalogo(tipos, tipo, valor);
          return (
            <div key={tipo} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor={idCampo} className="w-20 shrink-0 truncate text-sm font-medium text-fg" title={tipo}>
                  {tipo}
                </label>
                <Input
                  id={idCampo}
                  value={valor}
                  onChange={(e) => cambiarValor(tipo, e.target.value)}
                  placeholder={tipo}
                  list={sugerencias.length > 0 ? idLista : undefined}
                  disabled={deshabilitado}
                  autoComplete="off"
                  className="h-10 min-w-0 flex-1"
                />
                {onGuardarValor && (
                  <button
                    type="button"
                    onClick={() => void guardarValor(tipo)}
                    disabled={deshabilitado || !valor.trim() || yaEnCatalogo || guardandoValor !== null}
                    title={yaEnCatalogo ? t('valorEnCatalogo') : t('guardarValor')}
                    aria-label={t('guardarValorDe', { tipo })}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guardandoValor === tipo ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => quitar(tipo)}
                  disabled={deshabilitado}
                  aria-label={t('quitarAtributo', { tipo })}
                  title={t('quitarAtributo', { tipo })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
              {sugerencias.length > 0 && (
                <datalist id={idLista}>
                  {sugerencias.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
              {visibles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 sm:pl-[88px]">
                  {visibles.map((s) => {
                    const activa = mismoTexto(s, valor);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={deshabilitado}
                        aria-pressed={activa}
                        onClick={() => cambiarValor(tipo, s)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          activa ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-subtle text-fg-secondary hover:bg-hover',
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                  {ocultas > 0 && <span className="text-xs text-fg-muted">{t('masValores', { count: ocultas })}</span>}
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-fg">
          <Tags aria-hidden="true" className="size-4 text-fg-secondary" /> {t('agregar')}
        </span>
        {tiposDisponibles.length > 0 && (
          <Select value="" onValueChange={(v) => v && void agregarTipo(v)} disabled={deshabilitado}>
            <SelectTrigger className="h-10 w-full min-w-0 sm:w-44" aria-label={t('tipoExistente')}>
              <SelectValue placeholder={t('tipoExistente')} />
            </SelectTrigger>
            <SelectContent>
              {tiposDisponibles.map((tp) => (
                <SelectItem key={tp.nombre} value={tp.nombre}>
                  {tp.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            value={nuevoTipo}
            onChange={(e) => setNuevoTipo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void agregarTipo(nuevoTipo);
              }
            }}
            placeholder={t('nuevoTipo')}
            aria-label={t('nuevoTipo')}
            disabled={deshabilitado || creandoTipo}
            className="h-10 min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => void agregarTipo(nuevoTipo)}
            disabled={deshabilitado || creandoTipo || !nuevoTipo.trim()}
            title={onCrearTipo ? t('crearTipoCatalogo') : t('crearTipo')}
            aria-label={onCrearTipo ? t('crearTipoCatalogo') : t('crearTipo')}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creandoTipo ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
