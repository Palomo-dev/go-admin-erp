'use client';

/**
 * Corrección controlada de un período cerrado (Figma 20.19.5, decisión 5): nunca se
 * edita lo cerrado. El servidor recalcula la colilla con su entrada y las reglas
 * del cierre más la novedad del ajuste, y guarda la diferencia con su motivo
 * (`fn_hr_nomina_ajuste_guardar`). Luego se cierra el ajuste y se paga con el período.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Wrench } from 'lucide-react';
import { CampoNumero, DialogoMotivo, FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ajustarPeriodo, codigoDeError, type ColillaPeriodo } from './apiNomina';
import { CONCEPTOS_AJUSTE, ajusteEnDias, type ConceptoAjuste } from './nominaLogica';
import { useErrorNomina } from './piezasNomina';

export function DialogoAjuste({
  abierto,
  onAbiertoChange,
  periodoId,
  colillas,
  vinculoInicial,
  onHecho,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  periodoId: string;
  colillas: readonly ColillaPeriodo[];
  vinculoInicial: string | null;
  onHecho: () => void;
}) {
  const t = useTranslations('hrmNomina.ajuste');
  const tc = useTranslations('hrmNomina.conceptos');
  const mensajeError = useErrorNomina();
  const [vinculo, setVinculo] = useState('');
  const [concepto, setConcepto] = useState<ConceptoAjuste>('BONIFICACION_SALARIAL');
  const [valor, setValor] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setVinculo(vinculoInicial ?? '');
    setConcepto('BONIFICACION_SALARIAL');
    setValor(null);
    setError(null);
  }, [abierto, vinculoInicial]);

  const personas = useMemo(
    () => [...colillas].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '')).map((c) => ({ id: c.vinculo_id, nombre: c.nombre ?? '—' })),
    [colillas]
  );
  const dias = ajusteEnDias(concepto);
  const falta = !vinculo ? t('faltaPersona') : !(valor && valor > 0) ? t('faltaValor') : null;

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      icono={Wrench}
      destructiva={false}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      textoConfirmar={t('confirmar')}
      etiquetaMotivo={t('motivo')}
      placeholder={t('motivoPlaceholder')}
      consecuencias={[t('c1'), t('c2'), t('c3')]}
      bloqueo={falta}
      cargando={cargando}
      error={error}
      onConfirmar={async (motivo) => {
        if (falta) return;
        setCargando(true);
        setError(null);
        try {
          await ajustarPeriodo(periodoId, {
            vinculo_id: vinculo,
            motivo,
            novedades: [{ concepto, valor: dias ? null : valor, cantidad: dias ? valor : null }],
          });
          toast.success(t('hecho'));
          onHecho();
          onAbiertoChange(false);
        } catch (e) {
          setError(mensajeError(codigoDeError(e)));
        } finally {
          setCargando(false);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <FormField etiqueta={t('persona')} obligatorio>
          {(c) => (
            <Select value={vinculo} onValueChange={setVinculo}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirPersona')} />
              </SelectTrigger>
              <SelectContent>
                {personas.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('concepto')} obligatorio>
            {(c) => (
              <Select value={concepto} onValueChange={(v) => setConcepto(v as ConceptoAjuste)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCEPTOS_AJUSTE.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tc(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={dias ? t('dias') : t('valor')} obligatorio>
            {(c) => <CampoNumero id={c.id} valor={valor} onValorChange={setValor} decimales={dias ? 1 : 0} minimo={0} alinear="derecha" />}
          </FormField>
        </div>
      </div>
    </DialogoMotivo>
  );
}
