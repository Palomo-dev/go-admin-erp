'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

const schema = z.object({
  capability_level: z.enum(['off', 'read', 'write_low', 'write_full']),
});
type EditableLevel = z.infer<typeof schema>['capability_level'];
type Settings = { capability_level: EditableLevel; can_manage: boolean };
/** Etiqueta y descripción de cada nivel: claves de `configuracionTextos.asistenteConfigPanel`. */
const choices: { value: EditableLevel; label: string; description: string }[] = [
  { value: 'off', label: 'niveles.off.etiqueta', description: 'niveles.off.descripcion' },
  { value: 'read', label: 'niveles.read.etiqueta', description: 'niveles.read.descripcion' },
  { value: 'write_low', label: 'niveles.write_low.etiqueta', description: 'niveles.write_low.descripcion' },
  { value: 'write_full', label: 'niveles.write_full.etiqueta', description: 'niveles.write_full.descripcion' },
];

/**
 * Configuración › Organización › GO Asistente: qué puede hacer el asistente
 * en la organización activa. Antes era la página /app/configuracion/asistente
 * (hoy abre el diálogo); la lógica no cambió. Guarda con su propio botón, tras
 * confirmar: no se integra a la barra «cambios sin guardar» porque el cambio
 * de nivel exige esa confirmación explícita.
 */
export function AsistenteConfigPanel() {
  const { organization } = useOrganization();
  const t = useTranslations('configuracionTextos.asistenteConfigPanel');
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-fg-secondary">{t('soloOrganizacionActiva')}</p>
      {organization?.id ? (
        <SettingsForm key={organization.id} organizationId={organization.id} />
      ) : <p role="status">{t('seleccionaOrganizacion')}</p>}
    </div>
  );
}

function SettingsForm({ organizationId }: { organizationId: number }) {
  const t = useTranslations('configuracionTextos.asistenteConfigPanel');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saveController = useRef<AbortController | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { capability_level: 'write_full' } });
  const selected = form.watch('capability_level');
  const choice = choices.find((item) => item.value === selected);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/ai-assistant/settings', {
      cache: 'no-store', signal: controller.signal,
      headers: { 'X-Organization-Id': String(organizationId) },
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('errorConsultar'));
      if (controller.signal.aborted) return;
      setSettings(data);
      // Conservar la elección explícita del administrador, incluso si es restrictiva.
      form.reset({ capability_level: data.capability_level });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('errorConexion'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); saveController.current?.abort(); };
  }, [organizationId, reload, form, t]);

  async function save(values: z.infer<typeof schema>) {
    if (saving || !settings?.can_manage) return;
    setSaving(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    saveController.current = controller;
    try {
      const response = await fetch('/api/ai-assistant/settings', {
        method: 'PATCH', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Organization-Id': String(organizationId) },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('errorGuardar'));
      if (controller.signal.aborted) return;
      setSettings(data);
      form.reset(values);
      setNotice(t('guardada'));
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('errorConexion'));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  if (loading) return <p role="status">{t('cargando')}</p>;
  if (!settings) return (
    <div className="space-y-3"><p role="alert">{error}</p><Button onClick={() => setReload((value) => value + 1)}>{t('reintentar')}</Button></div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('titulo')}</CardTitle>
        <CardDescription>{t('descripcion')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!settings.can_manage && <p role="status">{t('soloAdministrador')}</p>}
        <Form {...form}>
          <form onSubmit={(event) => { event.preventDefault(); }} className="space-y-5">
            <FormField control={form.control} name="capability_level" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('nivelCapacidad')}</FormLabel>
                <FormControl>
                  <select {...field} disabled={!settings.can_manage || saving} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                    {choices.map((item) => <option key={item.value} value={item.value}>{t(item.label)} ({item.value})</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="space-y-3 text-sm">
              {choices.map((item) => <p key={item.value}><strong>{t(item.label)}:</strong> {t(item.description)}</p>)}
              <p>{t('notaWriteLow')}</p>
            </div>
            {settings.can_manage && (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={saving || !choice || selected === settings.capability_level}>
                    {saving ? t('guardando') : t('guardarNivel')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('confirmar.titulo')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('confirmar.descripcion', { etiqueta: choice ? t(choice.label) : '', nivel: selected, descripcion: choice ? t(choice.description) : '' })}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('confirmar.cancelar')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { void form.handleSubmit(save)(); }}>{t('confirmar.aceptar')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </form>
        </Form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p role="status" aria-live="polite" className="text-sm">{notice}</p>
      </CardContent>
    </Card>
  );
}
