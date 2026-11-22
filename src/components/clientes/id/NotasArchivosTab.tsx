'use client';

/**
 * Notas del cliente en «Notas y documentos» (Figma 06 Clientes 332:116009):
 * agregar nota, la lista con la fijada destacada, fijar y eliminar. Los
 * documentos van al lado (`DocumentUploader` del CRM, en la página).
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { Pin, Save, StickyNote, Trash2 } from 'lucide-react';
import { AvatarIniciales, EmptyState, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { mensajeError, useFechasFicha } from './useFechasFicha';

// Interfaces para el componente
interface Nota {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  user_id: string;
  user_name?: string;
  related_type: string;
  related_id: string;
  opportunity_name?: string;
}

interface PerfilUsuario {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
}

const FECHA_NOTA: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

interface NotasArchivosTabProps {
  clienteId: string;
  organizationId: number;
}

export default function NotasArchivosTab({ clienteId, organizationId }: NotasArchivosTabProps) {
  const t = useTranslations('clientes.ficha');
  const { instante } = useFechasFicha();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [users, setUsers] = useState<Record<string, PerfilUsuario>>({});
  const [savingNote, setSavingNote] = useState(false);

  // Cargar notas existentes
  useEffect(() => {
    const fetchNotas = async () => {
      try {
        setLoading(true);
        setError(null);

        // Obtener IDs de oportunidades del cliente
        const { data: oppsData } = await supabase
          .from('opportunities')
          .select('id, name')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        const oppIds = (oppsData || []).map(o => o.id);
        const oppNameMap: Record<string, string> = {};
        (oppsData || []).forEach(o => { oppNameMap[o.id] = o.name; });

        // Notas del cliente
        let query = supabase
          .from('notes')
          .select('*')
          .eq('organization_id', organizationId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        if (oppIds.length > 0) {
          query = query.or(`related_type.eq.customer,related_type.eq.opportunity`)
            .or(`related_id.eq.${clienteId},related_id.in.(${oppIds.join(',')})`);
        } else {
          query = query.eq('related_type', 'customer').eq('related_id', clienteId);
        }

        const { data: notasData, error: notasError } = await query;

        if (notasError) throw notasError;

        if (notasData) {
          // Enriquecer notas con nombre de oportunidad
          const notasEnriquecidas = notasData.map(note => ({
            ...note,
            opportunity_name: note.related_type === 'opportunity' ? oppNameMap[note.related_id] : undefined,
          }));

          // Recolectar IDs de usuarios únicos
          const userIds = Array.from(new Set(notasEnriquecidas.map(note => note.user_id)));

          // Obtener información de los usuarios
          if (userIds.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, avatar_url')
              .in('id', userIds);

            if (usersError) throw usersError;

            // Crear mapa de usuarios para fácil acceso
            const usersMap: Record<string, PerfilUsuario> = {};
            usersData?.forEach(user => {
              usersMap[user.id] = user;
            });

            setUsers(usersMap);
          }

          setNotas(notasEnriquecidas);
        }
      } catch (err) {
        console.error('Error al cargar notas:', err);
        setError({ mensaje: mensajeError(err) });
      } finally {
        setLoading(false);
      }
    };

    fetchNotas();
  }, [clienteId, organizationId]);

  // Guardar nueva nota
  const handleSaveNote = async () => {
    if (!nuevaNota.trim()) return;

    try {
      setSavingNote(true);

      // Obtener el usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(t('notas.noAutenticado'));
      }

      // Guardar la nueva nota
      const { data, error } = await supabase
        .from('notes')
        .insert([
          {
            organization_id: organizationId,
            user_id: user.id,
            body: nuevaNota,
            related_type: 'customer',
            related_id: clienteId,
            is_pinned: false
          }
        ])
        .select();

      if (error) throw error;

      // Si la nota se guardó exitosamente
      if (data && data.length > 0) {
        setNotas([data[0], ...notas]);
        setNuevaNota('');

        // Actualizar la información del usuario si no existe
        if (!users[user.id]) {
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .eq('id', user.id)
            .single();

          if (!userError && userData) {
            setUsers({...users, [user.id]: userData});
          }
        }
      }
    } catch (err) {
      console.error('Error al guardar nota:', err);
      alert(mensajeError(err) || t('notas.errorGuardar'));
    } finally {
      setSavingNote(false);
    }
  };

  // Fijar/desfijar nota
  const togglePinNote = async (notaId: string, isPinned: boolean) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update({ is_pinned: !isPinned })
        .eq('id', notaId);

      if (error) throw error;

      // Actualizar estado local
      setNotas(notas.map(nota =>
        nota.id === notaId
          ? {...nota, is_pinned: !nota.is_pinned}
          : nota
      ));
    } catch (err) {
      console.error('Error al actualizar nota:', err);
      alert(mensajeError(err) || t('notas.errorActualizar'));
    }
  };

  // Eliminar nota
  const handleDeleteNote = async (notaId: string) => {
    if (!confirm(t('notas.confirmarEliminar'))) return;

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', notaId);

      if (error) throw error;

      // Actualizar estado local
      setNotas(notas.filter(nota => nota.id !== notaId));
    } catch (err) {
      console.error('Error al eliminar nota:', err);
      alert(mensajeError(err) || t('notas.errorEliminar'));
    }
  };

  // Formatear fecha (created_at es timestamptz: zona de la organización)
  const formatDate = (dateString: string) => instante(dateString, FECHA_NOTA);

  // Renderizar usuario
  const renderUser = (userId: string) => {
    const user = users[userId];

    if (!user) return t('comun.usuario');

    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || t('comun.usuario');
  };

  // Mostrar estado de carga
  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  // Mostrar error si existe
  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-4 text-sm text-danger-text">
        {error.mensaje || t('notas.errorCarga')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Figma 332:116009: «Agregar nota» y, debajo, las notas con la fijada destacada. */}
      <section aria-labelledby="notas-agregar" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
        <h3 id="notas-agregar" className="text-[13px] font-semibold leading-[19px] text-fg">
          {t('notas.agregar')}
        </h3>
        <RichTextEditor value={nuevaNota} onChange={setNuevaNota} placeholder={t('notas.placeholder')} minHeight={100} />
        <div className="flex justify-end">
          <button type="button" onClick={handleSaveNote} disabled={!nuevaNota.trim() || savingNote} className={clasesBoton({ tamano: 'sm' })}>
            <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {savingNote ? t('notas.guardando') : t('notas.guardar')}
          </button>
        </div>
      </section>

      <section aria-labelledby="notas-lista" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
        <h3 id="notas-lista" className="text-[13px] font-semibold leading-[19px] text-fg">
          {t('notas.titulo', { n: notas.length })}
        </h3>

        {notas.length === 0 ? (
          <EmptyState compacto icono={StickyNote} titulo={t('notas.vacioTitulo')} descripcion={t('notas.vacioDescripcion')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {notas.map((nota) => (
              <li
                key={nota.id}
                className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 ${nota.is_pinned ? 'border-line-warning bg-warning-subtle' : 'border-line bg-surface'}`}
              >
                <div className="flex items-start gap-2">
                  <AvatarIniciales nombre={renderUser(nota.user_id)} tamano="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold leading-4 text-fg">{renderUser(nota.user_id)}</p>
                    <p className="text-[11px] leading-4 text-fg-muted">{formatDate(nota.created_at)}</p>
                  </div>
                  {nota.is_pinned && (
                    <Badge tono="advertencia" apariencia="contorno" tamano="sm" className="bg-surface">
                      {t('notas.fijada')}
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePinNote(nota.id, nota.is_pinned)}
                    aria-label={nota.is_pinned ? t('notas.desfijar') : t('notas.fijar')}
                    title={nota.is_pinned ? t('notas.desfijar') : t('notas.fijar')}
                    aria-pressed={nota.is_pinned}
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${nota.is_pinned ? 'text-warning-text' : 'text-fg-secondary'}`}
                  >
                    <Pin aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(nota.id)}
                    aria-label={t('notas.eliminar')}
                    title={t('notas.eliminar')}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-danger-subtle hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
                {nota.opportunity_name && (
                  <Badge tono="marca" tamano="sm" className="self-start">
                    {t('notas.oportunidad', { nombre: nota.opportunity_name })}
                  </Badge>
                )}
                <HtmlContentRenderer html={nota.body} className="break-words text-[13px] leading-[18px] text-fg" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
