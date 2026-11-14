'use client';

/**
 * «Ajustes de la prueba» del Laboratorio de IA (auditoría 2026-11-14, Agente 3):
 * canal, modelo, creatividad, largo, máximo de fragmentos, tono, idioma y reglas
 * del sistema (Figma 94-chat-recuperado-ia-11). Solo valen para la prueba: no
 * cambian la configuración real. Agrupados en secciones plegables (decisión
 * del dueño, 2026-11-14): Canal y modelo · Respuesta · Tono e idioma (abierta
 * por defecto) · Reglas.
 *
 * Tono e idioma (decisión del dueño, 2026-11-14): desde el commit 374c19bdd la
 * IA que atiende a los clientes usa los de Configuración › Chat › IA, así que
 * vuelven aquí. Empiezan con los de la configuración y viajan en el body de
 * `POST /api/chat/ai/lab-test` (`tono`, `idioma`).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { FormField, SeccionPlegable, Tarjeta } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANGUAGE_OPTIONS, TONE_OPTIONS, fetchCatalogoModelos, type ModeloIA } from '@/lib/services/aiSettingsService';
import type { LabSettings } from '@/lib/services/aiLabService';

/** Valor del selector cuando la prueba usa el modelo de la configuración. */
const MODELO_CONFIG = '__config__';

interface Props {
  ajustes: LabSettings;
  onChange: (ajustes: LabSettings) => void;
  canales: Array<{ valor: string; etiqueta: string }>;
  /** Modelo de la configuración real (para nombrarlo). */
  modeloConfig: string;
  /** Reglas de la configuración real (para volver a ellas). */
  reglasConfig: string;
}

export function AjustesPrueba({ ajustes, onChange, canales, modeloConfig, reglasConfig }: Props) {
  const t = useTranslations('chatModulo.ia.laboratorio');
  const tr = useTranslations('chatRecuperado.laboratorio');
  // Nombres de tonos e idiomas: los mismos de Configuración › Chat › IA.
  const tc = useTranslations('chatConfig.ia');
  const [modelos, setModelos] = useState<ModeloIA[]>([]);

  useEffect(() => {
    let vivo = true;
    fetchCatalogoModelos()
      .then((c) => vivo && setModelos(c.modelos))
      .catch(() => vivo && setModelos([]));
    return () => {
      vivo = false;
    };
  }, []);

  const cambiar = <K extends keyof LabSettings>(clave: K, valor: LabSettings[K]) => onChange({ ...ajustes, [clave]: valor });
  const etiquetaModeloConfig = modeloConfig ? t('modeloConfigCon', { modelo: modelos.find((m) => m.value === modeloConfig)?.label ?? modeloConfig }) : t('modeloConfig');

  return (
    <Tarjeta titulo={t('ajustes')} descripcion={t('ajustesDescripcion')}>
      <div className="flex flex-col gap-3">
        <SeccionPlegable titulo={tr('secciones.canalModelo')}>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('canal')}>
              {(campo) => (
                <Select value={ajustes.simulatedChannel} onValueChange={(v) => cambiar('simulatedChannel', v)}>
                  <SelectTrigger id={campo.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canales.map((c) => (
                      <SelectItem key={c.valor} value={c.valor}>
                        {c.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField etiqueta={t('modelo')}>
              {(campo) => (
                <Select value={ajustes.model || MODELO_CONFIG} onValueChange={(v) => cambiar('model', v === MODELO_CONFIG ? '' : v)}>
                  <SelectTrigger id={campo.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MODELO_CONFIG}>{etiquetaModeloConfig}</SelectItem>
                    {modelos
                      .filter((m) => m.value !== modeloConfig)
                      .map((m) => (
                        <SelectItem key={`${m.provider}:${m.value}`} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
        </SeccionPlegable>

        <SeccionPlegable titulo={tr('secciones.respuesta')}>
          <div className="flex flex-col gap-4">
            <FormField etiqueta={t('creatividad')} ayuda={t('creatividadAyuda')} extra={<span className="font-mono text-xs tabular-nums text-fg-secondary">{ajustes.temperature.toFixed(1)}</span>}>
              {(campo) => (
                <Slider
                  id={campo.id}
                  aria-label={t('creatividad')}
                  value={[ajustes.temperature]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={(v) => cambiar('temperature', v[0])}
                />
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('largoTokens')} ayuda={t('largoAyuda')}>
                {(campo) => (
                  <Input
                    id={campo.id}
                    type="number"
                    min={100}
                    max={2000}
                    step={50}
                    value={ajustes.maxTokens}
                    onChange={(e) => cambiar('maxTokens', Math.min(2000, Math.max(100, parseInt(e.target.value) || 500)))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('maxFragmentos')} ayuda={t('maxFragmentosAyuda')}>
                {(campo) => (
                  <Input
                    id={campo.id}
                    type="number"
                    min={1}
                    max={20}
                    value={ajustes.maxFragments}
                    onChange={(e) => cambiar('maxFragments', Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
                  />
                )}
              </FormField>
            </div>
          </div>
        </SeccionPlegable>

        <SeccionPlegable titulo={tr('secciones.tonoIdioma')} abiertaPorDefecto>
          <div className="grid grid-cols-2 gap-3">
            <FormField etiqueta={tr('tono')}>
              {(campo) => (
                <Select value={ajustes.tone} onValueChange={(v) => cambiar('tone', v)}>
                  <SelectTrigger id={campo.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {tc.has(`tonos.${o.value}`) ? tc(`tonos.${o.value}`) : o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={tr('idioma')}>
              {(campo) => (
                <Select value={ajustes.language} onValueChange={(v) => cambiar('language', v)}>
                  <SelectTrigger id={campo.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {tc.has(`idiomas.${o.value}`) ? tc(`idiomas.${o.value}`) : o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <p className="col-span-2 -mt-1 text-xs text-fg-muted">{tr('tonoIdiomaAyuda')}</p>
          </div>
        </SeccionPlegable>

        <SeccionPlegable titulo={tr('secciones.reglas')}>
          <FormField
            etiqueta={t('reglas')}
            ayuda={t('reglasAyuda')}
            extra={
              ajustes.systemRules !== reglasConfig ? (
                <button
                  type="button"
                  onClick={() => cambiar('systemRules', reglasConfig)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <RotateCw aria-hidden="true" className="size-3" />
                  {tr('reglasRestaurar')}
                </button>
              ) : null
            }
          >
            {(campo) => (
              <Textarea id={campo.id} rows={4} value={ajustes.systemRules} onChange={(e) => cambiar('systemRules', e.target.value)} className="resize-y text-sm" />
            )}
          </FormField>
        </SeccionPlegable>
      </div>
    </Tarjeta>
  );
}
