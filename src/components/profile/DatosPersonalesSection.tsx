'use client';

import { useState, useRef, FormEvent } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { Save, Edit2, Upload, X, Mail } from 'lucide-react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';
import { changeLanguage } from '@/i18n/provider';
import { isValidLocale } from '@/i18n/config';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface Profile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  lang?: string; // En la BD es preferred_language
  status: string;
  created_at: string;
  updated_at?: string;
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
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [fullName, setFullName] = useState(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim());
  const [phone, setPhone] = useState(profile?.phone || '');
  const [lang, setLang] = useState(profile?.lang || 'es');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);

  // Cambio de correo electrónico
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => {
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setFirstName(profile?.first_name || '');
    setLastName(profile?.last_name || '');
    setFullName(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim());
    setPhone(profile?.phone || '');
    setLang(profile?.lang || 'es');
    setTempAvatar(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const maxSize = 2 * 1024 * 1024; // 2MB

    // Validar tamaño y formato
    if (file.size > maxSize) {
      toast.error('La imagen es demasiado grande. El tamaño máximo permitido es 2MB.');
      e.target.value = ''; // Limpiar el input
      return;
    }

    if (!['jpg', 'jpeg', 'png', 'webp'].includes(fileExt || '')) {
      toast.error('Formato de archivo no permitido. Use JPG, PNG o WEBP.');
      e.target.value = ''; // Limpiar el input
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
    toast.loading('Subiendo imagen...', { id: 'upload-avatar' });
    
    try {
      // Verificar tamaño y formato antes de subir
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('La imagen es demasiado grande. El tamaño máximo permitido es 2MB.');
      }
      
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(fileExt?.toLowerCase() || '')) {
        throw new Error('Formato de archivo no permitido. Use JPG, PNG o WEBP.');
      }

      // Optimizar imagen antes de subir (si es posible)
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { 
          cacheControl: '3600',
          upsert: true 
        });
        
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      toast.success('Imagen subida correctamente', { id: 'upload-avatar' });
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
      
      // Dividir el nombre completo en nombre y apellido
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { data, error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          avatar_url: updatedAvatarUrl,
          preferred_language: lang, // Usar preferred_language en lugar de lang
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('*')
        .single();
        
      if (error) throw error;
      
      // Sincronizar idioma en runtime si cambió
      if (lang && isValidLocale(lang)) {
        changeLanguage(lang);
      }
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

  const handleOpenEmailDialog = () => {
    setNewEmail('');
    setConfirmEmail('');
    setShowEmailDialog(true);
  };

  const handleRequestEmailChange = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedNew = newEmail.trim().toLowerCase();
    const trimmedConfirm = confirmEmail.trim().toLowerCase();

    if (!emailRegex.test(trimmedNew)) {
      toast.error('Ingresa un correo electrónico válido');
      return;
    }
    if (trimmedNew === (user?.email || '').toLowerCase()) {
      toast.error('El nuevo correo debe ser diferente al actual');
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      toast.error('Los correos no coinciden. Verifica que estén escritos igual.');
      return;
    }
    setShowEmailConfirm(true);
  };

  const handleConfirmEmailChange = async () => {
    setChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim().toLowerCase(),
      });

      if (error) throw error;

      setShowEmailConfirm(false);
      setShowEmailDialog(false);
      setNewEmail('');
      setConfirmEmail('');
      toast.success(
        `Correo de confirmación enviado a ${newEmail.trim().toLowerCase()}. Revisa tu bandeja de entrada y haz clic en el enlace para completar el cambio.`,
        { duration: 6000 }
      );
    } catch (error) {
      console.error('Error al cambiar correo:', error);
      const msg = error instanceof Error ? error.message : 'Intenta nuevamente en unos minutos.';
      toast.error(`Error al cambiar el correo: ${msg}`);
    } finally {
      setChangingEmail(false);
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
            className="flex items-center px-3 py-1.5 text-sm rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
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
                src={tempAvatar || getAvatarUrl(avatarUrl) || ''}
                alt="Avatar" 
                fill
                className="rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center relative overflow-hidden">
                <span className="text-2xl font-bold text-gray-500 dark:text-gray-300">
                  {profile?.first_name?.charAt(0).toUpperCase() || '?'}
                </span>
                {editing && (
                  <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                       onClick={() => fileInputRef.current?.click()}>
                    <Upload size={24} className="text-white" />
                  </div>
                )}
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
              placeholder="Nombre y Apellido"
              disabled={!editing || loading}
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500 dark:disabled:text-gray-400"
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Correo electrónico
            </label>
            <div className="flex gap-2">
              <input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleOpenEmailDialog}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap"
              >
                <Mail size={16} />
                Cambiar
              </button>
            </div>
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Teléfono
            </label>
            <PhoneInput
              id="phone"
              value={phone}
              onChange={setPhone}
              disabled={!editing || loading}
              inputClassName="px-3 py-2 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-500 dark:disabled:text-gray-400"
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
              className="flex items-center px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
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

      {/* Dialog: Solicitar nuevo correo */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar correo electrónico</DialogTitle>
            <DialogDescription>
              Ingresa tu nuevo correo electrónico. Te enviaremos un enlace de confirmación
              a la nueva dirección para verificar que te pertenece.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Correo actual
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700/50">
                {user?.email}
              </p>
            </div>
            <div>
              <label htmlFor="newEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nuevo correo
              </label>
              <input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nuevo@correo.com"
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="confirmEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirma el nuevo correo
              </label>
              <input
                id="confirmEmail"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="repite el nuevo correo"
                className={`w-full px-3 py-2 rounded-md border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                  confirmEmail && confirmEmail.trim().toLowerCase() !== newEmail.trim().toLowerCase()
                    ? 'border-red-400 focus:ring-red-500'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRequestEmailChange();
                  }
                }}
              />
              {confirmEmail && confirmEmail.trim().toLowerCase() !== newEmail.trim().toLowerCase() && (
                <p className="mt-1 text-xs text-red-600">Los correos no coinciden</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowEmailDialog(false)}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRequestEmailChange}
              className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Enviar confirmación
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar cambio de correo */}
      <AlertDialog open={showEmailConfirm} onOpenChange={setShowEmailConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de cambiar tu correo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará un enlace de confirmación a <strong>{newEmail.trim().toLowerCase()}</strong>.
              Deberás abrir ese correo y hacer clic en el enlace para completar el cambio.
              Tu correo actual (<strong>{user?.email}</strong>) seguirá activo hasta que confirmes el nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changingEmail}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEmailChange}
              disabled={changingEmail}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {changingEmail ? (
                <span className="flex items-center">
                  <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                  Enviando...
                </span>
              ) : (
                'Sí, cambiar mi correo'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
