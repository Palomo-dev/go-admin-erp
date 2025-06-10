'use client';

import { useState, useRef, FormEvent } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { Save, Edit2, Upload, X } from 'lucide-react';
import Image from 'next/image';
import toast from 'react-hot-toast';

interface Profile {
  id: string;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  lang?: string;
  status: string;
  created_at: string;
}

interface DatosPersonalesSectionProps {
  profile: Profile | null;
  user: User | null;
  onProfileUpdated: (profile: Profile) => void;
}

const lenguajes = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
];

export default function DatosPersonalesSection({ profile, user, onProfileUpdated }: DatosPersonalesSectionProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [lang, setLang] = useState(profile?.lang || 'es');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => {
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setLang(profile?.lang || 'es');
    setTempAvatar(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (file.size > maxSize) {
      toast.error('La imagen es demasiado grande. El tamaño máximo permitido es 2MB.');
      return;
    }

    // Mostrar vista previa antes de subir
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setTempAvatar(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!user) throw new Error('No hay un usuario autenticado');
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    setUploading(true);
    
    try {
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { 
          cacheControl: '3600',
          upsert: true 
        });
        
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error('Error al subir avatar:', error);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    setLoading(true);
    
    try {
      let updatedAvatarUrl = avatarUrl;
      
      // Si hay un archivo nuevo para subir
      if (fileInputRef.current?.files?.length) {
        const file = fileInputRef.current.files[0];
        updatedAvatarUrl = await uploadAvatar(file);
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          avatar_url: updatedAvatarUrl,
          lang: lang,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('*')
        .single();
        
      if (error) throw error;
      
      toast.success('Información actualizada correctamente');
      onProfileUpdated(data);
      setEditing(false);
      setTempAvatar(null);
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      toast.error('Error al actualizar la información');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !avatarUrl) return;
    
    setLoading(true);
    
    try {
      // Extraer el nombre del archivo del avatar actual
      const fileNameMatch = avatarUrl.match(/avatars\/(.*)/);
      
      if (fileNameMatch && fileNameMatch[1]) {
        // Eliminar el archivo de Storage
        const { error: deleteError } = await supabase.storage
          .from('profiles')
          .remove([`avatars/${fileNameMatch[1]}`]);
          
        if (deleteError) console.error('Error al eliminar avatar:', deleteError);
      }
      
      // Actualizar el perfil sin avatar
      const { data, error } = await supabase
        .from('profiles')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('*')
        .single();
        
      if (error) throw error;
      
      toast.success('Avatar eliminado correctamente');
      onProfileUpdated(data);
      setAvatarUrl('');
      setTempAvatar(null);
    } catch (error) {
      console.error('Error al eliminar avatar:', error);
      toast.error('Error al eliminar avatar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          Datos personales
        </h2>
        {!editing ? (
          <button
            onClick={handleEdit}
            className="flex items-center px-3 py-1.5 text-sm rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
          >
            <Edit2 size={16} className="mr-1.5" />
            Editar
          </button>
        ) : null}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
          <div className="relative w-24 h-24">
            {(tempAvatar || avatarUrl) ? (
              <Image 
                src={tempAvatar || avatarUrl || ''}
                alt="Avatar" 
                fill
                className="rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-500 dark:text-gray-300">
                  {profile?.full_name?.charAt(0).toUpperCase() || 
                   profile?.first_name?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
            )}
          </div>
          
          {editing && (
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex gap-2">
                <input
                  type="file"
                  id="avatar"
                  accept="image/png, image/jpeg"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  disabled={loading || uploading}
                >
                  <Upload size={16} className="mr-1.5" />
                  Subir foto
                </button>
                {(avatarUrl || tempAvatar) && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="flex items-center px-3 py-1.5 text-sm rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
                    disabled={loading}
                  >
                    <X size={16} className="mr-1.5" />
                    Eliminar
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                PNG o JPG. Máximo 2MB.
              </p>
            </div>
          )}
        </div>
        
        {/* Campos del formulario */}
        <div className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={!editing || loading}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500 dark:disabled:text-gray-400"
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400"
            />
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Teléfono
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!editing || loading}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500 dark:disabled:text-gray-400"
            />
          </div>
          
          <div>
            <label htmlFor="lang" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Idioma preferido
            </label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              disabled={!editing || loading}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500 dark:disabled:text-gray-400"
            >
              {lenguajes.map((lenguaje) => (
                <option key={lenguaje.value} value={lenguaje.value}>
                  {lenguaje.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {editing && (
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-400"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center">
                  <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                  Guardando...
                </span>
              ) : (
                <>
                  <Save size={16} className="mr-1.5" />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
