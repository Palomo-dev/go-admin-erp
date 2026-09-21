'use client';

/**
 * Crear/editar una objeción en hoja lateral (brief §3): validación junto al
 * campo con `aria-describedby`, foco al primer error, y retorno de foco al
 * disparador (o al fallback) al cerrar. Sin lógica de negocio: el modelo
 * transforma y el servidor guarda.
 */

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { Objection, ObjectionInput } from '@/lib/services/crm/objectionService';
import {
  OBJECTION_CATEGORIES,
  TITLE_MAX,
  formToPayload,
  objectionToForm,
  validateForm,
  type FormError,
  type ObjectionFormState,
} from '@/lib/services/crm/objectionModel';
import { CategoryChips, categoryChipId } from './CategoryChips';
import { ObjectionEditorFooter } from './ObjectionEditorFooter';

/**
 * Clases de la hoja y del cuerpo (UX móvil, ronda 1; fijadas por
 * `mobileLayout.test.ts`). La hoja NO desplaza: `overflow-hidden` anula el
 * `overflow-y-auto` de `sheetVariants` y `h-dvh` el `h-full` (en iOS `100%`
 * y `100vh` incluyen la barra del navegador; `dvh` la sigue). Solo el cuerpo
 * (`flex-1 min-h-0 overflow-y-auto`) tiene scroll; el pie queda al fondo.
 *
 * Causa raíz del hueco de ~200 px bajo el pie en iPhone: el botón `sr-only`
 * de envío es `position:absolute` y, con el formulario estático, su bloque
 * contenedor era la hoja (`fixed`): quedaba en su posición estática, al final
 * del contenido desbordado del formulario, y hacía a la hoja desplazable
 * (scrollHeight 842 vs 812 medidos). Al enfocar un campo, el teclado de iOS
 * desplaza ese contenedor exterior más allá del final y no lo devuelve al
 * cerrarse: el pie flota y debajo asoma el fondo de la hoja. Con la hoja sin
 * scroll y el formulario `relative`, el botón queda dentro del cuerpo.
 */
export const SHEET_CLASS =
  'flex h-dvh max-h-dvh w-full flex-col gap-0 overflow-hidden bg-gray-50 p-0 ' +
  'dark:bg-gray-950 sm:max-w-xl';
export const BODY_CLASS = 'relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6';

interface Props {
  open: boolean;
  /** Objeción a editar; `null` para crear. */
  objection: Objection | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ObjectionInput, id?: string) => Promise<unknown>;
  /** A dónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback: () => HTMLElement | null;
}

export function ObjectionEditorSheet({
  open,
  objection,
  onOpenChange,
  onSave,
  returnFocusFallback,
}: Props) {
  const [form, setForm] = useState<ObjectionFormState>(() => objectionToForm(null));
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Id a enfocar tras el próximo commit. Efecto, no requestAnimationFrame.
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    if (!open) return;
    setForm(objectionToForm(objection));
    setErrors([]);
    setServerError(null);
  }, [open, objection]);

  const update = (next: ObjectionFormState) => {
    setForm(next);
    if (errors.length) setErrors(validateForm(next));
  };

  const submit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length) {
      setFocusId(
        errs[0].field === 'title'
          ? 'objection-title'
          : categoryChipId(OBJECTION_CATEGORIES[0].value),
      );
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await onSave(formToPayload(form), objection?.id);
      toast({
        title: objection ? 'Objeción actualizada' : 'Objeción creada',
        description: `«${form.title.trim()}»${form.is_active ? '' : ' (inactiva)'}`,
      });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId('objection-server-error');
    } finally {
      setSaving(false);
    }
  };

  const titleError = errors.find((e) => e.field === 'title')?.message;
  const categoryError = errors.find((e) => e.field === 'category')?.message;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        onCloseAutoFocus={onCloseAutoFocus}
        className={SHEET_CLASS}
      >
        <SheetHeader
          className={
            'shrink-0 border-b border-gray-200 bg-white px-4 py-4 pr-12 text-left ' +
            'dark:border-gray-800 dark:bg-gray-900 sm:px-6 sm:pr-12'
          }
        >
          <SheetTitle className="text-gray-900 dark:text-gray-100">
            {objection ? 'Editar objeción' : 'Nueva objeción'}
          </SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            Qué dice el cliente, cómo responder y qué preguntar. El vendedor lo verá al registrarla
            en una oportunidad.
          </SheetDescription>
        </SheetHeader>

        <form
          className={BODY_CLASS}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <Label htmlFor="objection-title" className="text-xs text-gray-700 dark:text-gray-300">
              Título
            </Label>
            <Input
              id="objection-title"
              value={form.title}
              placeholder="Es muy caro"
              autoComplete="off"
              maxLength={TITLE_MAX + 20}
              aria-invalid={!!titleError}
              aria-describedby={titleError ? 'objection-title-error' : 'objection-title-hint'}
              onChange={(e) => update({ ...form, title: e.target.value })}
            />
            {titleError ? (
              <p
                id="objection-title-error"
                role="alert"
                className="mt-1 text-xs text-red-700 dark:text-red-300"
              >
                {titleError}
              </p>
            ) : (
              <p
                id="objection-title-hint"
                className="mt-1 text-xs text-gray-600 dark:text-gray-400"
              >
                Tal como la diría el cliente. Máximo {TITLE_MAX} caracteres.
              </p>
            )}
          </div>

          <CategoryChips
            value={form.category}
            onChange={(category) => update({ ...form, category })}
            error={categoryError}
          />

          <div>
            <Label htmlFor="objection-signals" className="text-xs text-gray-700 dark:text-gray-300">
              Señales de detección
            </Label>
            <Textarea
              id="objection-signals"
              rows={3}
              value={form.signalsText}
              placeholder={'caro\npresupuesto\ncostoso'}
              aria-describedby="objection-signals-hint"
              onChange={(e) => update({ ...form, signalsText: e.target.value })}
            />
            <p
              id="objection-signals-hint"
              className="mt-1 text-xs text-gray-600 dark:text-gray-400"
            >
              Una frase o palabra por línea: lo que dice el cliente cuando aparece esta objeción.
            </p>
          </div>

          <div>
            <Label
              htmlFor="objection-response"
              className="text-xs text-gray-700 dark:text-gray-300"
            >
              Respuesta recomendada
            </Label>
            <Textarea
              id="objection-response"
              rows={4}
              value={form.recommended_response}
              placeholder="Reencuadrar en valor: costo por día frente al ahorro…"
              onChange={(e) => update({ ...form, recommended_response: e.target.value })}
            />
          </div>

          <div>
            <Label
              htmlFor="objection-questions"
              className="text-xs text-gray-700 dark:text-gray-300"
            >
              Preguntas de discovery
            </Label>
            <Textarea
              id="objection-questions"
              rows={3}
              value={form.questionsText}
              placeholder={'¿Con qué lo comparas?\n¿Qué presupuesto tienen asignado?'}
              aria-describedby="objection-questions-hint"
              onChange={(e) => update({ ...form, questionsText: e.target.value })}
            />
            <p
              id="objection-questions-hint"
              className="mt-1 text-xs text-gray-600 dark:text-gray-400"
            >
              Una pregunta por línea.
            </p>
          </div>

          {serverError && (
            <Alert id="objection-server-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>No se pudo guardar</AlertTitle>
              <AlertDescription>
                {serverError}. Revisa los datos y vuelve a intentarlo.
              </AlertDescription>
            </Alert>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
            Guardar
          </button>
        </form>

        <ObjectionEditorFooter
          isActive={form.is_active}
          saving={saving}
          editing={objection !== null}
          onActiveChange={(v) => update({ ...form, is_active: v })}
          onCancel={() => onOpenChange(false)}
          onSubmit={() => void submit()}
        />
      </SheetContent>
    </Sheet>
  );
}
