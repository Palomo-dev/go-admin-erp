'use client';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { Objection, ObjectionInput } from '@/lib/services/crm/objectionService';
import {
  OBJECTION_CATEGORIES,
  TITLE_MAX,
} from '@/lib/services/crm/objectionModel';
import { useObjectionEditor } from './useObjectionEditor';
export function ObjectionEditor({
  open,
  row,
  onClose,
  onSave,
}: {
  open: boolean;
  row: Objection | null;
  onClose: () => void;
  onSave: (data: ObjectionInput, id?: string) => Promise<unknown>;
}) {
  const t = useTranslations('crm.objecionesNuevo');
  const {form,setForm,saving,error,submit}=useObjectionEditor({open,row,onSave,onSaved:onClose});
  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={(value) => {
        if (!value) onClose();
      }}
      titulo={t(row ? 'edit' : 'new')}
      descripcion={t('editorHint')}
      primario={{
        etiqueta: t(row ? 'save' : 'create'),
        onClick: () => void submit(),
        cargando: saving,
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField etiqueta={t('titleField')} obligatorio>
          <Input
            id="objection-title"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </FormField>
        <FormField etiqueta={t('category')} obligatorio>
          <select
            id="objection-category"
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
          >
            <option value="">{t('chooseCategory')}</option>
            {OBJECTION_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {t(`categories.${category.value}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={t('signals')} ayuda={t('onePerLine')}>
          <Textarea
            id="objection-signals"
            rows={3}
            value={form.signalsText}
            maxLength={20000}
            onChange={(event) => setForm({ ...form, signalsText: event.target.value })}
          />
        </FormField>
        <FormField etiqueta={t('recommended')}>
          <Textarea
            id="objection-response"
            rows={4}
            value={form.recommended_response}
            maxLength={5000}
            onChange={(event) => setForm({ ...form, recommended_response: event.target.value })}
          />
        </FormField>
        <FormField etiqueta={t('questions')} ayuda={t('onePerLine')}>
          <Textarea
            id="objection-questions"
            rows={3}
            value={form.questionsText}
            maxLength={20000}
            onChange={(event) => setForm({ ...form, questionsText: event.target.value })}
          />
        </FormField>
        <label
          className="flex min-h-11 items-center gap-3 text-sm text-fg"
          htmlFor="objection-active"
        >
          <Switch
            id="objection-active"
            checked={form.is_active}
            onCheckedChange={(value) => setForm({ ...form, is_active: value })}
          />
          {t(form.is_active ? 'active' : 'inactive')}
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          {t('save')}
        </button>
      </form>
    </Dialogo>
  );
}
