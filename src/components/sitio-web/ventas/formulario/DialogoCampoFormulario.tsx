'use client';

/**
 * «Editar «Celular con indicativo»» (Figma Parte F: F4 centro en computador, F7 hoja en el celular).
 * Etiqueta, texto de ayuda y texto de ejemplo, con «Volver al texto recomendado». En el celular la
 * hoja trae además «Mostrar en la tienda» y «Requisito» (en el computador están en la fila). El
 * dato que se guarda no cambia: solo cómo se llama en la tienda. Aplica al tocar «Guardar» /
 * «Listo»; el diálogo de opciones guarda todo junto.
 */
import { useEffect, useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { PanelAdaptable, SegmentedControl, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LARGO_AYUDA_CAMPO, LARGO_EJEMPLO_CAMPO, LARGO_ETIQUETA_CAMPO, defCampoFormulario } from '@/lib/website/formularioCheckout';
import { textosDe, textosRecomendados, type FilaFormulario, type TextosCampo } from './formularioLogica';
import { ICONO_CAMPO, useTextosFormulario } from './textosFormulario';

export interface CambiosCampo {
  textos: TextosCampo;
  visible: boolean;
  obligatorio: boolean;
}

export function DialogoCampoFormulario({
  fila,
  abierto,
  onAbiertoChange,
  onListo,
}: {
  fila: FilaFormulario;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onListo: (c: CambiosCampo) => void;
}) {
  const t = useTextosFormulario();
  const esEscritorio = useEsEscritorio();
  const id = useId();
  const def = defCampoFormulario(fila.clave);
  const nombre = t(`campos.${fila.clave}.nombre`);
  const [textos, setTextos] = useState<TextosCampo>(() => textosDe(fila));
  const [visible, setVisible] = useState(fila.visible);
  const [obligatorio, setObligatorio] = useState(fila.obligatorio);

  useEffect(() => {
    if (abierto) {
      setTextos(textosDe(fila));
      setVisible(fila.visible);
      setObligatorio(fila.obligatorio);
    }
  }, [abierto, fila]);

  const poner = (k: keyof TextosCampo, v: string) => setTextos((x) => ({ ...x, [k]: v }));
  const recomendados = textosRecomendados(fila.clave);
  const yaRecomendados = textos.etiqueta === recomendados.etiqueta && textos.ayuda === recomendados.ayuda && textos.placeholder === recomendados.placeholder;
  const listo = () => onListo({ textos, visible, obligatorio });

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('dialogo.titulo', { nombre })}
      descripcion={t('dialogo.descripcion')}
      icono={ICONO_CAMPO[fila.clave]}
      ancho={520}
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('dialogo.cancelar')}
          </button>
          <button type="button" onClick={listo} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {/* Computador (diálogo, F4): «Guardar»; celular (hoja, F7): «Listo». El mismo corte que PanelAdaptable. */}
            {esEscritorio ? t('dialogo.guardar') : t('dialogo.listo')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-dialogo-campo={fila.clave}>
        {/* Celular (F7): en el computador esto está en la fila. */}
        <div className="flex flex-col gap-4 sm:hidden">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={`${id}-visible`} className="flex flex-col">
              <span className="text-sm font-medium text-fg">{t('mostrarEnTienda')}</span>
              {def.motivo && def.fijoVisible ? <span className="text-xs text-fg-secondary">{t(`motivos.${def.motivo}`)}</span> : null}
            </label>
            <Switch id={`${id}-visible`} checked={visible} disabled={def.fijoVisible} onCheckedChange={setVisible} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id={`${id}-requisito`} className="text-sm font-medium text-fg">{t('requisito')}</span>
            <SegmentedControl
              aria-labelledby={`${id}-requisito`}
              anchoCompleto
              deshabilitado={def.fijoObligatorio || !visible}
              opciones={[
                { valor: 'obligatorio', etiqueta: t('obligatorio') },
                { valor: 'opcional', etiqueta: t('opcional') },
              ]}
              valor={obligatorio ? 'obligatorio' : 'opcional'}
              onValorChange={(v) => setObligatorio(v === 'obligatorio')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-etiqueta`} className="text-sm font-medium text-fg">{t('dialogo.etiqueta')}</label>
          <Input id={`${id}-etiqueta`} value={textos.etiqueta} maxLength={LARGO_ETIQUETA_CAMPO} onChange={(e) => poner('etiqueta', e.target.value)} aria-describedby={`${id}-etiqueta-ayuda`} className="h-10 rounded-lg" />
          <p id={`${id}-etiqueta-ayuda`} className="text-xs text-fg-secondary">{t('dialogo.etiquetaAyuda')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-ayuda`} className="text-sm font-medium text-fg">{t('dialogo.ayuda')}</label>
          <Input id={`${id}-ayuda`} value={textos.ayuda} maxLength={LARGO_AYUDA_CAMPO} onChange={(e) => poner('ayuda', e.target.value)} aria-describedby={`${id}-ayuda-ayuda`} className="h-10 rounded-lg" />
          <p id={`${id}-ayuda-ayuda`} className="text-xs text-fg-secondary">{t('dialogo.ayudaAyuda')}</p>
        </div>
        {def.conEjemplo && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-ejemplo`} className="text-sm font-medium text-fg">{t('dialogo.ejemplo')}</label>
            <Input
              id={`${id}-ejemplo`}
              value={textos.placeholder}
              maxLength={LARGO_EJEMPLO_CAMPO}
              placeholder={def.placeholder === null ? t('dialogo.ejemploTienda') : undefined}
              onChange={(e) => poner('placeholder', e.target.value)}
              aria-describedby={`${id}-ejemplo-ayuda`}
              className="h-10 rounded-lg"
            />
            <p id={`${id}-ejemplo-ayuda`} className="text-xs text-fg-secondary">{t('dialogo.ejemploAyuda')}</p>
          </div>
        )}
        <button
          type="button"
          disabled={yaRecomendados}
          onClick={() => setTextos(recomendados)}
          className={`${clasesBoton({ variante: 'fantasma', tamano: 'sm' })} self-start`}
        >
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('dialogo.volver')}
        </button>
      </div>
    </PanelAdaptable>
  );
}
