'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
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

  // Renderizar avatar
  const renderAvatar = (userId: string) => {
    const initials = renderUser(userId).substring(0, 2).toUpperCase();

    return (
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
        {initials}
      </div>
    );
  };

  // Mostrar estado de carga
  if (loading) {
    return (
      <div className="py-4">
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  // Mostrar error si existe
  if (error) {
    return (
      <div className="w-full py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-400">{error.mensaje || t('notas.errorCarga')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Formulario para agregar nueva nota */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
          {t('notas.agregar')}
        </h3>
        <div>
          <RichTextEditor
            value={nuevaNota}
            onChange={setNuevaNota}
            placeholder={t('notas.placeholder')}
            minHeight={100}
            className="dark:bg-gray-800 dark:border-gray-700"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSaveNote}
              disabled={!nuevaNota.trim() || savingNote}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {savingNote ? t('notas.guardando') : t('notas.guardar')}
            </button>
          </div>
        </div>
      </div>

      {/* Listado de notas */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
          {t('notas.titulo', { n: notas.length })}
        </h3>

        {notas.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h4 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('notas.vacioTitulo')}</h4>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              {t('notas.vacioDescripcion')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notas.map(nota => (
              <div
                key={nota.id}
                className={`border ${nota.is_pinned ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10' : 'border-gray-100 dark:border-gray-700'} rounded-lg p-4`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderAvatar(nota.user_id)}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {renderUser(nota.user_id)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(nota.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => togglePinNote(nota.id, nota.is_pinned)}
                      aria-label={nota.is_pinned ? t('notas.desfijar') : t('notas.fijar')}
                      title={nota.is_pinned ? t('notas.desfijar') : t('notas.fijar')}
                      className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        nota.is_pinned ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteNote(nota.id)}
                      aria-label={t('notas.eliminar')}
                      title={t('notas.eliminar')}
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                {nota.opportunity_name && (
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      {t('notas.oportunidad', { nombre: nota.opportunity_name })}
                    </span>
                  </div>
                )}
                <HtmlContentRenderer html={nota.body} className="mt-3 text-gray-700 dark:text-gray-300" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sección de archivos - Para futura implementación */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h4 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('notas.archivosTitulo')}</h4>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          {t('notas.archivosDescripcion')}
        </p>
      </div>
    </div>
  );
}
