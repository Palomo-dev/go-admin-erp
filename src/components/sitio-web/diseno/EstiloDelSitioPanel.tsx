'use client';

/**
 * Panel «Estilo del sitio» (Figma A/06a escritorio, A/06g móvil, y el MISMO
 * panel en el estilo global del editor, A/05f): presets del giro, ajustes de
 * fondo, texto y acento con el aviso de contraste AA y «Corregir
 * automáticamente», par tipográfico, redondeo, botones y movimiento.
 *
 * No guarda ni lee nada: recibe el estilo y avisa cada cambio (`onCambiar`,
 * `onElegirPreset`). Lo montan Diseño (`PaginaDiseno`) y, cuando el área
 * editor lo conecte, el editor en lugar de `GlobalSettingsPanel`.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, type OpcionChip } from '@/components/kit';
import { StylePresetCard } from '../ui/StylePresetCard';
import { FontPairOption } from '../ui/FontPairOption';
import { ColorField } from '../ui/ColorField';
import {
  ESTILOS_BOTON,
  MOVIMIENTOS_SITIO,
  RADIOS_SITIO,
  type EstiloBoton,
  type EstiloEditable,
  type MovimientoSitio,
  type RadioSitio,
} from '@/lib/website/v2/tokensEstilo';
import {
  claseDeFuentes,
  paresTipograficos,
  type ClaseFuentes,
  type EstiloCatalogo,
  type GiroCatalogo,
} from '@/lib/website/contrato/catalogoPlantillas';
import { familiaCss, muestraDeEstilo, nombreFuentes } from './catalogo';
import { useFuentesSitio } from './useFuentesSitio';
import { CLASE_TAMANO_ICONO, ICONO_GRUPO_ESTILO, TRAZO_ICONO, type GrupoEstilo } from '../ui/iconosSitio';
import { useTextosDiseno } from './textos';

/** Presets visibles antes de «Ver los N presets…» (A/06a: cuatro, 2 × 2). */
export const PRESETS_VISIBLES = 4;
/** Pares tipográficos visibles antes de «Ver más pares» (A/06a: dos). */
export const PARES_VISIBLES = 2;

export interface EstiloDelSitioPanelProps {
  estilo: EstiloEditable;
  /** Presets del giro (catálogo). */
  presets: readonly EstiloCatalogo[];
  /** Preset del que parte el estilo actual (resaltado), si se sabe. */
  seleccionado: EstiloCatalogo | null;
  onElegirPreset: (preset: EstiloCatalogo) => void;
  onCambiar: (parcial: Partial<EstiloEditable>) => void;
  giro: GiroCatalogo | null;
  /** Paleta del logo para el campo Acento. */
  coloresLogo?: readonly string[];
  /** ¿El sitio público ya aplica redondeo, botones y movimiento? */
  extendidos: boolean;
  deshabilitado?: boolean;
  /**
   * Oculta (solo a la vista) el título «Estilo del sitio» por debajo de lg:
   * en Diseño móvil ese texto ya está en la cabecera del shell (A/06g). El
   * editor no lo pasa y conserva su título.
   */
  cabeceraSoloEscritorio?: boolean;
  className?: string;
}

const RADIOS: readonly `${RadioSitio}`[] = RADIOS_SITIO.map((r) => `${r}` as `${RadioSitio}`);

/** Redondeo con su unidad («0 px», «12 px»): la cifra sola no dice qué mide. */
export function etiquetaRadio(radio: `${RadioSitio}` | RadioSitio): string {
  return `${radio} px`;
}

/**
 * Título de un grupo del panel con su icono de 16 px (Manual §5: el icono
 * acompaña al texto). Así «Colores», «Tipografía» o «Botones» se encuentran
 * de un vistazo al bajar por el panel, sobre todo en el celular.
 */
function TituloGrupo({ grupo, id, children }: { grupo: GrupoEstilo; id?: string; children: ReactNode }) {
  const Icono = ICONO_GRUPO_ESTILO[grupo];
  return (
    <h3 id={id} className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
      <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
      {children}
    </h3>
  );
}

export function EstiloDelSitioPanel({
  estilo,
  presets,
  seleccionado,
  onElegirPreset,
  onCambiar,
  giro,
  coloresLogo,
  extendidos,
  deshabilitado,
  cabeceraSoloEscritorio,
  className,
}: EstiloDelSitioPanelProps) {
  const t = useTextosDiseno();
  const id = useId();
  const [todosPresets, setTodosPresets] = useState(false);
  const [todosPares, setTodosPares] = useState(false);

  // El preset con el que se entra va primero y el orden ya no cambia al elegir otro.
  const primero = useRef<string | null>(null);
  if (primero.current === null && seleccionado) primero.current = seleccionado.id;
  const idPrimero = primero.current;
  const ordenados = useMemo(() => {
    const i = presets.findIndex((p) => p.id === idPrimero);
    return i > 0 ? [presets[i], ...presets.slice(0, i), ...presets.slice(i + 1)] : [...presets];
  }, [presets, idPrimero]);
  const visibles = todosPresets ? ordenados : ordenados.slice(0, PRESETS_VISIBLES);

  const pares = useMemo(() => {
    const todos = paresTipograficos(presets);
    const actual = todos.findIndex((p) => p.titulos === estilo.fuenteTitulos && p.cuerpo === estilo.fuenteCuerpo);
    if (actual < 0) {
      const clase: ClaseFuentes = seleccionado?.claseFuentes ?? claseDeFuentes(estilo.fuenteTitulos, estilo.fuenteCuerpo);
      return [{ titulos: estilo.fuenteTitulos, cuerpo: estilo.fuenteCuerpo, clase }, ...todos];
    }
    return [todos[actual], ...todos.slice(0, actual), ...todos.slice(actual + 1)];
  }, [presets, estilo.fuenteTitulos, estilo.fuenteCuerpo, seleccionado?.claseFuentes]);
  const paresVisibles = todosPares ? pares : pares.slice(0, PARES_VISIBLES);

  useFuentesSitio([...visibles.flatMap((p) => [p.fuenteTitulos, p.fuenteCuerpo]), ...paresVisibles.map((p) => p.titulos)]);

  const muestra = giro ? { texto: t(`muestra.${giro}.texto`), boton: t(`muestra.${giro}.boton`) } : null;
  const motivo = extendidos ? undefined : t('panel.motivoPendiente');
  const opciones = <V extends string>(valores: readonly V[], etiqueta: (v: V) => string): OpcionChip<V>[] =>
    valores.map((v) => ({ valor: v, etiqueta: etiqueta(v), deshabilitada: !extendidos || deshabilitado, motivo }));

  const etiquetaGrupo = (sufijo: string) => `${id}-${sufijo}`;

  return (
    <section
      aria-labelledby={etiquetaGrupo('titulo')}
      className={cn('flex flex-col gap-5 rounded-xl border border-line bg-surface p-4', className)}
    >
      <header className={cn('flex flex-col gap-0.5', cabeceraSoloEscritorio && 'max-lg:sr-only')}>
        <h2 id={etiquetaGrupo('titulo')} className="text-base font-semibold leading-6 text-fg">
          {t('panel.titulo')}
        </h2>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('panel.descripcion')}</p>
      </header>

      <div className="flex flex-col gap-2">
        <TituloGrupo grupo="presets" id={etiquetaGrupo('presets')}>{t('panel.presets')}</TituloGrupo>
        {presets.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('panel.sinPresets')}</p>
        ) : (
          <div role="radiogroup" aria-labelledby={etiquetaGrupo('presets')} className="grid grid-cols-2 gap-3">
            {visibles.map((p) => (
              <StylePresetCard
                key={p.id}
                nombre={p.nombre}
                fuentes={nombreFuentes(p)}
                muestra={muestraDeEstilo(p)}
                seleccionado={seleccionado?.id === p.id}
                onSeleccionar={() => onElegirPreset(p)}
                textoMuestra={muestra?.texto}
                textoBoton={muestra?.boton}
                deshabilitado={deshabilitado}
              />
            ))}
          </div>
        )}
        {presets.length > PRESETS_VISIBLES && (
          <button
            type="button"
            aria-expanded={todosPresets}
            onClick={() => setTodosPresets((v) => !v)}
            className="self-start rounded-md text-[13px] font-medium leading-[18px] text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {todosPresets
              ? t('panel.verMenos')
              : t('panel.verTodos', { n: presets.length, giro: giro ? t(`giroEnFrase.${giro}`) : '' }).trim()}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <TituloGrupo grupo="colores">{t('panel.ajustes')}</TituloGrupo>
        <ColorField etiqueta={t('panel.fondo')} valor={estilo.fondo} onCambiar={(fondo) => onCambiar({ fondo })} deshabilitado={deshabilitado} />
        <ColorField
          etiqueta={t('panel.texto')}
          valor={estilo.texto}
          fondo={estilo.fondo}
          onCambiar={(texto) => onCambiar({ texto })}
          deshabilitado={deshabilitado}
        />
        <ColorField
          etiqueta={t('panel.acento')}
          valor={estilo.acento}
          fondo={estilo.fondo}
          coloresLogo={coloresLogo}
          onCambiar={(acento) => onCambiar({ acento })}
          deshabilitado={deshabilitado}
        />
      </div>

      <div className="flex flex-col gap-2">
        <TituloGrupo grupo="tipografia" id={etiquetaGrupo('tipografia')}>{t('panel.tipografia')}</TituloGrupo>
        <div role="radiogroup" aria-labelledby={etiquetaGrupo('tipografia')} className="flex flex-col gap-2">
          {paresVisibles.map((p) => (
            <FontPairOption
              key={`${p.titulos}|${p.cuerpo}`}
              titulos={p.titulos}
              texto={p.cuerpo}
              descripcion={t(`clase.${p.clase}`)}
              familiaMuestra={familiaCss(p.titulos)}
              seleccionado={p.titulos === estilo.fuenteTitulos && p.cuerpo === estilo.fuenteCuerpo}
              onSeleccionar={() => onCambiar({ fuenteTitulos: p.titulos, fuenteCuerpo: p.cuerpo })}
              deshabilitado={deshabilitado}
            />
          ))}
        </div>
        {pares.length > PARES_VISIBLES && (
          <button
            type="button"
            aria-expanded={todosPares}
            onClick={() => setTodosPares((v) => !v)}
            className="self-start rounded-md text-[13px] font-medium leading-[18px] text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {todosPares ? t('panel.verMenosPares') : t('panel.verMasPares', { n: pares.length - PARES_VISIBLES })}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <TituloGrupo grupo="redondeo" id={etiquetaGrupo('redondeo')}>{t('panel.redondeo')}</TituloGrupo>
        <ChipsOpcion
          aria-labelledby={etiquetaGrupo('redondeo')}
          opciones={opciones(RADIOS, etiquetaRadio)}
          valor={`${estilo.radio}` as `${RadioSitio}`}
          onValorChange={(v) => onCambiar({ radio: Number(v) as RadioSitio })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <TituloGrupo grupo="botones" id={etiquetaGrupo('botones')}>{t('panel.botones')}</TituloGrupo>
        <ChipsOpcion
          aria-labelledby={etiquetaGrupo('botones')}
          opciones={opciones<EstiloBoton>(ESTILOS_BOTON, (b) => t(`boton.${b}`))}
          valor={estilo.estiloBoton}
          onValorChange={(estiloBoton) => onCambiar({ estiloBoton })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <TituloGrupo grupo="movimiento" id={etiquetaGrupo('movimiento')}>{t('panel.movimiento')}</TituloGrupo>
        <ChipsOpcion
          aria-labelledby={etiquetaGrupo('movimiento')}
          opciones={opciones<MovimientoSitio>(MOVIMIENTOS_SITIO, (m) => t(`movimiento.${m}`))}
          valor={estilo.movimiento}
          onValorChange={(movimiento) => onCambiar({ movimiento })}
        />
        {!extendidos && <p className="text-xs leading-4 text-fg-secondary">{t('panel.pendiente')}</p>}
      </div>
    </section>
  );
}
