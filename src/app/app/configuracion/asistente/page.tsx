'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
const choices: { value: EditableLevel; label: string; description: string }[] = [
  { value: 'off', label: 'Solo orientación', description: 'Responde preguntas y explica el sistema. No habilita acciones de lectura ni de escritura.' },
  { value: 'read', label: 'Consultar datos', description: 'Además de orientar, permite consultar datos con las herramientas disponibles. No crea ni modifica registros.' },
  { value: 'write_low', label: 'Crear registros de catálogo', description: 'Permite proponer la creación de clientes, proveedores, categorías y productos. Cada escritura requiere confirmación explícita.' },
  { value: 'write_full', label: 'Operación completa (predeterminado)', description: 'Permite usar todas las herramientas disponibles, incluidas las de clientes, proveedores, productos, categorías y facturas. Se mantienen los permisos del usuario, los módulos habilitados y la confirmación explícita antes de escribir.' },
];

export default function AssistantSettingsPage() {
  const { organization } = useOrganization();
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <Link href="/app/configuracion" className="text-sm underline underline-offset-4">Volver a configuración</Link>
      <h1 className="text-2xl font-semibold">Configuración de GO Assistant</h1>
      <p className="text-muted-foreground">Los cambios se aplican únicamente a tu organización activa, no a las demás organizaciones.</p>
      {organization?.id ? (
        <SettingsForm key={organization.id} organizationId={organization.id} />
      ) : <p role="status">Selecciona una organización para consultar su configuración.</p>}
    </main>
  );
}

function SettingsForm({ organizationId }: { organizationId: number }) {
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
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar la configuración.');
      if (controller.signal.aborted) return;
      setSettings(data);
      // Conservar la elección explícita del administrador, incluso si es restrictiva.
      form.reset({ capability_level: data.capability_level });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo conectar.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); saveController.current?.abort(); };
  }, [organizationId, reload, form]);

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
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      if (controller.signal.aborted) return;
      setSettings(data);
      form.reset(values);
      setNotice('Configuración guardada para esta organización. Se aplicará en los próximos mensajes del asistente.');
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo conectar.');
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  if (loading) return <p role="status">Cargando configuración…</p>;
  if (!settings) return (
    <div className="space-y-3"><p role="alert">{error}</p><Button onClick={() => setReload((value) => value + 1)}>Reintentar</Button></div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué puede hacer el asistente</CardTitle>
        <CardDescription>GO Assistant tiene operación completa (write_full) por defecto para todas las organizaciones, incluidas las nuevas, sin activación previa. Un administrador puede restringir el nivel de su organización. Los permisos de cada usuario, los módulos contratados, las herramientas habilitadas y las confirmaciones siguen aplicándose.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!settings.can_manage && <p role="status">Solo un administrador de esta organización puede cambiar esta configuración.</p>}
        <Form {...form}>
          <form onSubmit={(event) => { event.preventDefault(); }} className="space-y-5">
            <FormField control={form.control} name="capability_level" render={({ field }) => (
              <FormItem>
                <FormLabel>Nivel de capacidad</FormLabel>
                <FormControl>
                  <select {...field} disabled={!settings.can_manage || saving} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                    {choices.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.value})</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="space-y-3 text-sm">
              {choices.map((item) => <p key={item.value}><strong>{item.label}:</strong> {item.description}</p>)}
              <p>Elegir write_low restringe el asistente al catálogo, sin facturas, pagos ni ajustes contables. Ningún nivel concede permisos adicionales a los usuarios ni elimina las confirmaciones.</p>
            </div>
            {settings.can_manage && (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={saving || !choice || selected === settings.capability_level}>
                    {saving ? 'Guardando…' : 'Guardar nivel'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cambiar el nivel de esta organización?</AlertDialogTitle>
                    <AlertDialogDescription>Nuevo nivel: {choice?.label} ({selected}). {choice?.description} No se modificarán otras organizaciones ni las preferencias de voz, modelos o herramientas. Las propuestas seguirán sujetas a permisos y confirmación.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { void form.handleSubmit(save)(); }}>Confirmar cambio</AlertDialogAction>
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
