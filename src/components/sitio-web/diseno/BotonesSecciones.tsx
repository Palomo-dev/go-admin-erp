'use client';

/**
 * Grupo «Botones de las secciones» de Estilo del sitio (Figma P2, nota «el mismo control sirve
 * para … los botones de las secciones», 2026-11-07): forma, relleno, tamaño y mayúsculas de
 * `tema.tokens.boton`, con «Volver a lo de hoy» y una muestra con el botón principal y el
 * secundario. Solo presentación: qué escribe cada control está en `botonesSecciones.ts`.
 */
import { useId, type CSSProperties } from 'react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import {
  FORMAS_BOTON_TEMA,
  RELLENOS_BOTON_TEMA,
  TAMANOS_BOTON_TEMA,
  radioMuestraBoton,
  type BotonesSecciones,
  type CambioBotonesSecciones,
  type FormaBotonTema,
  type RellenoBotonTema,
  type TamanoBotonTema,
} from '@/lib/website/v2/botonesSecciones';
import { radioBoton, textoSobreAcento, type EstiloEditable } from '@/lib/website/v2/tokensEstilo';
import { useTextosDiseno } from './textos';

export interface BotonesSeccionesGrupoProps {
  valor: BotonesSecciones;
  onCambiar: (c: CambioBotonesSecciones) => void;
  /** Estilo en edición: colores, redondeo y «Botones» de hoy para la muestra. */
  estilo: EstiloEditable;
  /** ¿Se puede escribir `tema.tokens`? Sin eso, los controles salen deshabilitados con su motivo. */
  disponible: boolean;
  deshabilitado?: boolean;
}

/** Relleno de hoy («Botones», `estiloBoton`) en el vocabulario de los tokens, para la muestra. */
const RELLENO_DE_HOY: Record<EstiloEditable['estiloBoton'], RellenoBotonTema> = {
  solido: 'solido',
  contorno: 'contorno',
  pastilla: 'solido',
  sombra_dura: 'sombra_dura',
};

const TAMANO_MUESTRA: Record<TamanoBotonTema, string> = {
  s: 'h-8 px-3 text-xs',
  m: 'h-10 px-4 text-sm',
  l: 'h-12 px-6 text-base',
};

function estiloMuestra(relleno: RellenoBotonTema, radio: number, acento: string, sobreAcento: string): CSSProperties {
  const base: CSSProperties = { borderRadius: `${radio}px`, borderWidth: 1, borderStyle: 'solid' };
  if (relleno === 'contorno') return { ...base, borderColor: acento, color: acento, backgroundColor: 'transparent' };
  if (relleno === 'fantasma') return { ...base, borderColor: 'transparent', color: acento, backgroundColor: 'transparent' };
  if (relleno === 'sombra_dura') return { ...base, borderColor: '#111111', color: sobreAcento, backgroundColor: acento, boxShadow: '3px 3px 0 #111111' };
  return { ...base, borderColor: acento, color: sobreAcento, backgroundColor: acento };
}

export function BotonesSeccionesGrupo({ valor, onCambiar, estilo, disponible, deshabilitado }: BotonesSeccionesGrupoProps) {
  const t = useTextosDiseno();
  const tb = (k: string, v?: Record<string, string | number>) => t(`botonesSecciones.${k}`, v);
  const id = useId();
  const idMay = `${id}-mayusculas`;
  const bloqueado = !disponible || deshabilitado;
  const motivo = disponible ? undefined : t('panel.motivoPendiente');
  const opciones = <V extends string>(valores: readonly V[], grupo: string) =>
    valores.map((v) => ({ valor: v, etiqueta: tb(`${grupo}.${v}`), deshabilitada: bloqueado, motivo }));

  // Sin el interruptor, el sitio pinta lo de hoy: nada elegido, aunque el preset guarde tokens.
  const forma = valor.activo ? valor.forma : null;
  const relleno = valor.activo ? valor.relleno : null;
  const tamano = valor.activo ? valor.tamano : null;
  const delPreset = [
    valor.forma && tb(`formaOpcion.${valor.forma}`),
    valor.relleno && tb(`rellenoOpcion.${valor.relleno}`),
    valor.tamano && tb(`tamanoOpcion.${valor.tamano}`),
  ].filter(Boolean) as string[];

  // Muestra: lo que se vería con lo elegido; sin elegir, el botón de hoy (Redondeo + «Botones»).
  const radioHoy = radioBoton(estilo);
  const radio = forma ? radioMuestraBoton(forma, estilo.radio) : radioHoy;
  const rellenoMuestra = relleno ?? RELLENO_DE_HOY[estilo.estiloBoton];
  const sobreAcento = textoSobreAcento(estilo.acento);
  const claseMuestra = cn(
    'inline-flex items-center justify-center whitespace-nowrap font-semibold',
    TAMANO_MUESTRA[tamano ?? 'm'],
    valor.mayusculas && 'uppercase tracking-[.08em]',
  );

  return (
    <div className="flex flex-col gap-3" data-grupo="botones-secciones">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-titulo`} className="text-[13px] font-semibold leading-[18px] text-fg">
          {tb('titulo')}
        </h3>
        <p className="text-xs leading-4 text-fg-secondary">{tb('ayuda')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-forma`} className="text-xs font-semibold leading-4 text-fg-secondary">{tb('forma')}</span>
        <ChipsOpcion<FormaBotonTema | ''>
          aria-labelledby={`${id}-forma`}
          opciones={opciones(FORMAS_BOTON_TEMA, 'formaOpcion')}
          valor={forma ?? ''}
          onValorChange={(v) => v && onCambiar({ forma: v })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-relleno`} className="text-xs font-semibold leading-4 text-fg-secondary">{tb('relleno')}</span>
        <ChipsOpcion<RellenoBotonTema | ''>
          aria-labelledby={`${id}-relleno`}
          opciones={opciones(RELLENOS_BOTON_TEMA, 'rellenoOpcion')}
          valor={relleno ?? ''}
          onValorChange={(v) => v && onCambiar({ relleno: v })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-tamano`} className="text-xs font-semibold leading-4 text-fg-secondary">{tb('tamano')}</span>
        <ChipsOpcion<TamanoBotonTema | ''>
          aria-labelledby={`${id}-tamano`}
          opciones={opciones(TAMANOS_BOTON_TEMA, 'tamanoOpcion')}
          valor={tamano ?? ''}
          onValorChange={(v) => v && onCambiar({ tamano: v })}
        />
      </div>
      <div className="flex items-start justify-between gap-3" title={motivo}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={idMay} className={cn('text-[13px] font-medium leading-[18px] text-fg', bloqueado && 'opacity-60')}>
            {tb('mayusculas')}
          </label>
          <p className="text-[11px] leading-[14px] text-fg-muted">{tb('mayusculasAyuda')}</p>
        </div>
        <Switch
          id={idMay}
          checked={valor.mayusculas}
          disabled={bloqueado}
          onCheckedChange={(v) => onCambiar({ mayusculas: v })}
          className="mt-0.5 shrink-0"
        />
      </div>

      <p className="text-xs leading-4 text-fg-secondary">
        {valor.activo ? tb('estadoActivo') : delPreset.length > 0 ? tb('estadoPreset', { valores: delPreset.join(' · ') }) : tb('estadoHoy')}
      </p>
      {valor.activo && (
        <button
          type="button"
          disabled={bloqueado}
          onClick={() => onCambiar({ volverAHoy: true })}
          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}
        >
          {tb('volver')}
        </button>
      )}
      <p className="text-[11px] leading-[14px] text-fg-muted">{tb('relacion')}</p>

      <div
        role="img"
        aria-label={`${tb('muestra')}: ${tb('muestraPrincipal')}, ${tb('muestraSecundario')}`}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"
        style={{ backgroundColor: estilo.fondo }}
        data-muestra="botones-secciones"
      >
        <span aria-hidden="true" className={claseMuestra} style={estiloMuestra(rellenoMuestra, radio, estilo.acento, sobreAcento)}>
          {tb('muestraPrincipal')}
        </span>
        <span aria-hidden="true" className={claseMuestra} style={estiloMuestra('contorno', radio, estilo.texto, estilo.texto)}>
          {tb('muestraSecundario')}
        </span>
      </div>
    </div>
  );
}
