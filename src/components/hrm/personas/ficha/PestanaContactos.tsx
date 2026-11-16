'use client';

/**
 * Contactos de emergencia (Figma 95-hrm-03-03 y 03-15). Los ve RR. HH. y el
 * jefe inmediato (decisión 9); los edita quien tiene «editar identificación».
 * Lectura: `GET /api/hrm/personas/[id]/contactos` (queda registrada). Nada se
 * borra: «Eliminar contacto» lo retira.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { AvatarIniciales, AvisoTonal, ChipsOpcion, ConfirmDialog, Dialogo, EmptyState, FormField, Skeleton, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PARENTESCOS } from '@/lib/hrm/personas/catalogo';
import { guardarIdentificacion, useCarga } from '../apiPersonas';
import type { ContextoFicha } from './FichaEmpleado';

interface Contacto {
  id?: string;
  full_name: string;
  relationship: string | null;
  phone: string;
  alt_phone: string | null;
  priority: number;
}

export function PestanaContactos({ ficha }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.contactos');
  const tc = useTranslations('hrmPersonas.comun');
  const { carga, recargar } = useCarga<{ contactos: Contacto[]; editar: boolean }>(
    ficha.permisos.ver_contactos ? `/api/hrm/personas/${ficha.persona.id}/contactos` : null
  );
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [quitar, setQuitar] = useState<Contacto | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (!ficha.permisos.ver_contactos || carga.estado === 'sinPermiso') {
    return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />;
  }
  if (carga.estado === 'error' || carga.estado === 'noExiste') {
    return <EmptyState variante="error" titulo={tc('errorCarga')} onReintentar={() => void recargar()} />;
  }
  if (carga.estado === 'cargando') return <Skeleton className="h-48 w-full" />;
  const { contactos, editar } = carga.datos;

  const guardar = async (c: Contacto, activo = true) => {
    setGuardando(true);
    try {
      await guardarIdentificacion(ficha.persona.id, {
        contactos_emergencia: [{ ...(c.id ? { id: c.id } : {}), full_name: c.full_name.trim(), relationship: c.relationship, phone: c.phone.trim(), alt_phone: c.alt_phone?.trim() || null, priority: c.priority, is_active: activo }],
      });
      toast.success(activo ? t('guardado') : t('eliminado'));
      setEditando(null);
      setQuitar(null);
      void recargar();
    } catch {
      toast.error(tc('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta
      titulo={t('titulo')}
      accion={
        editar ? (
          <button
            type="button"
            onClick={() => setEditando({ full_name: '', relationship: null, phone: '', alt_phone: null, priority: Math.min(3, contactos.length + 1) })}
            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          >
            <Plus aria-hidden className="size-4" strokeWidth={1.5} />
            {t('agregar')}
          </button>
        ) : undefined
      }
      pie={<p className="text-xs text-fg-secondary">{t('nota')}</p>}
    >
      {contactos.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contactos.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg bg-subtle p-3">
              <AvatarIniciales nombre={c.full_name} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                  {c.full_name}
                  <StatusBadge estado="prioridad" tono={c.priority === 1 ? 'marca' : 'neutro'} etiqueta={t('prioridad', { n: c.priority })} />
                </p>
                <p className="truncate text-sm text-fg-secondary">
                  {[c.relationship ? tc(`parentescos.${c.relationship}`) : null, c.phone, c.alt_phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <a href={`tel:${c.phone.replace(/\s/g, '')}`} aria-label={t('llamar', { nombre: c.full_name })} title={t('llamar', { nombre: c.full_name })} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Phone aria-hidden className="size-4" strokeWidth={1.5} />
              </a>
              {editar && (
                <button type="button" onClick={() => setEditando(c)} aria-label={t('editarContacto')} title={t('editarContacto')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                  <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <Dialogo
          abierto
          onAbiertoChange={(a) => !a && setEditando(null)}
          titulo={editando.id ? t('editarContacto') : t('nuevoContacto')}
          descripcion={ficha.persona.nombre}
          ancho={520}
          primario={{
            etiqueta: tc('guardar'),
            onClick: () => void guardar(editando),
            cargando: guardando,
            deshabilitada: !editando.full_name.trim() || !editando.relationship || !editando.phone.trim(),
          }}
          secundarios={editando.id ? [{ etiqueta: t('eliminar'), onClick: () => setQuitar(editando), destructiva: true }] : undefined}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('nombre')} obligatorio>
              <Input value={editando.full_name} onChange={(e) => setEditando({ ...editando, full_name: e.target.value })} className="h-10" />
            </FormField>
            <FormField etiqueta={t('parentesco')} obligatorio>
              {(c) => (
                <Select value={editando.relationship ?? undefined} onValueChange={(v) => setEditando({ ...editando, relationship: v })}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={tc('elegir')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENTESCOS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {tc(`parentescos.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('celular')} obligatorio>
              <Input value={editando.phone} onChange={(e) => setEditando({ ...editando, phone: e.target.value })} inputMode="tel" className="h-10" />
            </FormField>
            <FormField etiqueta={t('otroTelefono')}>
              <Input value={editando.alt_phone ?? ''} onChange={(e) => setEditando({ ...editando, alt_phone: e.target.value })} inputMode="tel" className="h-10" />
            </FormField>
          </div>
          <FormField etiqueta={t('prioridadEtiqueta')} className="mt-4">
            {(c) => (
              <ChipsOpcion<string>
                aria-labelledby={c.idEtiqueta}
                valor={String(editando.priority)}
                onValorChange={(v) => setEditando({ ...editando, priority: Number(v) })}
                opciones={[
                  { valor: '1', etiqueta: t('primero') },
                  { valor: '2', etiqueta: '2' },
                  { valor: '3', etiqueta: '3' },
                ]}
              />
            )}
          </FormField>
          <AvisoTonal className="mt-4" tono="informacion" compacto titulo={t('quienVe')} />
        </Dialogo>
      )}
      <ConfirmDialog
        abierto={quitar !== null}
        onAbiertoChange={(a) => !a && setQuitar(null)}
        titulo={t('eliminarTitulo')}
        descripcion={t('eliminarDescripcion', { nombre: quitar?.full_name ?? '' })}
        textoConfirmar={t('eliminar')}
        tono="peligro"
        icono={Trash2}
        cargando={guardando}
        onConfirmar={() => (quitar ? guardar(quitar, false) : undefined)}
      />
    </Tarjeta>
  );
}
