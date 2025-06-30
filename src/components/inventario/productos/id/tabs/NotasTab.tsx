'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { FileText, Send, Paperclip, Download, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface NotasTabProps {
  producto: any;
}

interface Nota {
  id: number;
  product_id: number;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  user_role?: string;
  user_email?: string;
  content: string;
  created_at: string;
  files?: File[];
}

interface File {
  id: number;
  note_id: number;
  name: string;
  size: number;
  url: string;
  storage_path: string;
  created_at: string;
}

/**
 * Pestaña para gestionar notas y documentos del producto
 */
const NotasTab: React.FC<NotasTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  /**
   * Obtiene el ID de la organización de forma segura, primero del contexto y luego del localStorage
   * @returns El ID de la organización o null si no se encuentra
   */
  const getOrganizationId = (): number | null => {
    // Primero intentamos obtenerlo del contexto
    if (organization?.id) {
      return organization.id;
    }
    
    // Si no está en el contexto, intentamos recuperarlo del localStorage
    try {
      const orgData = obtenerOrganizacionActiva();
      if (orgData && orgData.id) {
        console.log('NotasTab: Usando organización del localStorage:', orgData.id);
        return orgData.id;
      }
    } catch (e) {
      console.error('Error al obtener organización del localStorage:', e);
    }
    
    return null;
  };
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [newNota, setNewNota] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  
  useEffect(() => {
    const fetchNotas = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de la organización de forma segura
        const orgId = getOrganizationId();
        
        // Verificar si tenemos organización
        if (!orgId) {
          console.warn('No hay organización seleccionada para cargar notas');
          setLoading(false);
          return;
        }
        
        // 1. Primero obtenemos las notas del producto
        const { data: notasData, error: notasError } = await supabase
          .from('product_notes')
          .select(`
            *,
            product_note_files(*)
          `)
          .eq('product_id', producto.id)
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        
        if (notasError) throw notasError;
        
        // Si no hay notas, terminamos
        if (!notasData || notasData.length === 0) {
          setNotas([]);
          setLoading(false);
          return;
        }
        
        // 2. Extraer los IDs de usuario únicos de las notas
        // Usamos filtro para crear un array de IDs únicos en lugar de Set
        const userIds: string[] = notasData
          .map(item => item.user_id)
          .filter((id, index, self) => self.indexOf(id) === index);
        
        // 3. Obtener información de los perfiles de los usuarios
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url, email')
          .in('id', userIds);
        
        if (profilesError) throw profilesError;
        
        // 4. Crear un mapa para acceder fácilmente a los datos del perfil por ID
        interface ProfileInfo {
          name: string;
          avatar_url: string | null;
          email: string | null;
        }
        
        const profilesMap: Record<string, ProfileInfo> = {};
        profilesData?.forEach(profile => {
          profilesMap[profile.id] = {
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario',
            avatar_url: profile.avatar_url,
            email: profile.email
          };
        });
        
        // 5. Mapear las notas con sus archivos y datos de usuario
        const notasConUsuarios = notasData.map((nota: any) => ({
          ...nota,
          user_name: profilesMap[nota.user_id]?.name || 'Usuario',
          user_avatar: profilesMap[nota.user_id]?.avatar_url,
          user_role: 'usuario', // Valor por defecto ya que no tenemos esta información en la tabla profiles
          user_email: profilesMap[nota.user_id]?.email,
        }));
        
        setNotas(notasConUsuarios);
      } catch (error) {
        console.error('Error al cargar notas:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar las notas del producto",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchNotas();
  }, [producto.id]);
  
  // Guardar nueva nota
  const handleSaveNote = async () => {
    if (!newNota.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor escriba contenido para la nota",
      });
      return;
    }
    
    // Verificar que tengamos la organización
    const orgId = getOrganizationId();
    if (!orgId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No hay organización seleccionada. Por favor, seleccione una organización.",
      });
      return;
    }
    
    try {
      setSaving(true);
      
      // 1. Crear la nota en la base de datos
      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;
      
      if (!userId) {
        throw new Error('No se pudo obtener el ID del usuario');
      }
      
      const { data: noteData, error: noteError } = await supabase
        .from('product_notes')
        .insert({
          product_id: producto.id,
          user_id: userId,
          content: newNota.trim(),
          organization_id: orgId,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (noteError) throw noteError;
      
      // 2. Si hay archivos seleccionados, subirlos
      const uploadedFiles: File[] = [];
      
      if (selectedFiles && selectedFiles.length > 0) {
        setUploading(true);
        
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${organization?.id}/notes/${noteData.id}/${Date.now()}-${file.name}`;
          
          // Subir archivo a Storage
          const { error: uploadError } = await supabase.storage
            .from('product-documents')
            .upload(fileName, file);
          
          if (uploadError) {
            console.error('Error al subir archivo:', uploadError);
            continue; // Continuar con el siguiente archivo
          }
          
          // Obtener URL pública
          const { data: publicURL } = supabase.storage
            .from('product-documents')
            .getPublicUrl(fileName);
          
          if (!publicURL) continue;
          
          // Guardar referencia en la base de datos
          const { data: fileData, error: fileError } = await supabase
            .from('product_note_files')
            .insert({
              note_id: noteData.id,
              name: file.name,
              size: file.size,
              url: publicURL.publicUrl,
              storage_path: fileName,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();
          
          if (fileError) {
            console.error('Error al guardar referencia del archivo:', fileError);
            continue;
          }
          
          uploadedFiles.push(fileData);
        }
      }
      
      // 3. Actualizar interfaz con la nueva nota
      const { data: userData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, role, email')
        .eq('id', userId)
        .single();
      
      const newNotaObject: Nota = {
        ...noteData,
        user_name: `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() || 'Usuario actual',
        user_avatar: userData?.avatar_url,
        user_role: userData?.role || 'usuario',
        user_email: userData?.email,
        files: uploadedFiles,
      };
      
      setNotas([newNotaObject, ...notas]);
      setNewNota('');
      setSelectedFiles(null);
      
      toast({
        title: "Nota guardada",
        description: "La nota se ha añadido correctamente",
      });
    } catch (error: any) {
      console.error('Error al guardar nota:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar la nota",
      });
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };
  
  // Eliminar nota
  const handleDeleteNote = async (notaId: number) => {
    try {
      setLoading(true);
      
      // Obtener archivos de la nota para eliminarlos del storage
      const notaToDelete = notas.find(n => n.id === notaId);
      if (notaToDelete?.files && notaToDelete.files.length > 0) {
        // Eliminar archivos del storage
        for (const file of notaToDelete.files) {
          if (file.storage_path) {
            await supabase.storage
              .from('product-documents')
              .remove([file.storage_path]);
          }
        }
        
        // Eliminar registros de archivos
        await supabase
          .from('product_note_files')
          .delete()
          .eq('note_id', notaId);
      }
      
      // Eliminar la nota
      const { error } = await supabase
        .from('product_notes')
        .delete()
        .eq('id', notaId);
      
      if (error) throw error;
      
      // Actualizar estado
      setNotas(notas.filter(n => n.id !== notaId));
      
      toast({
        title: "Nota eliminada",
        description: "La nota se ha eliminado correctamente",
      });
    } catch (error: any) {
      console.error('Error al eliminar nota:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo eliminar la nota",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Manejar selección de archivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };
  
  // Formatear tamaño de archivo
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Formatear fecha
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy, HH:mm', { locale: es });
    } catch (e) {
      return 'Fecha inválida';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Editor de nueva nota */}
      <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
        <CardHeader className="pb-3">
          <CardTitle>Nueva Nota</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Escribe una nota o comentario sobre este producto..."
            value={newNota}
            onChange={(e) => setNewNota(e.target.value)}
            className={`min-h-24 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
          />
          
          {selectedFiles && selectedFiles.length > 0 && (
            <div className={`mt-3 p-2 rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <p className="text-sm font-medium mb-2">Archivos seleccionados:</p>
              <ul className="space-y-1">
                {Array.from(selectedFiles).map((file, index) => (
                  <li key={index} className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    {file.name} ({formatFileSize(file.size)})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div>
            <Button 
              variant="outline" 
              size="sm"
              className={theme === 'dark' ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}
            >
              <label htmlFor="file-upload" className="flex items-center cursor-pointer">
                <Paperclip className="mr-2 h-4 w-4" />
                Adjuntar archivos
              </label>
              <input
                id="file-upload"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </Button>
          </div>
          
          <Button 
            onClick={handleSaveNote} 
            disabled={saving || uploading || !newNota.trim()}
          >
            {saving || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? 'Subiendo archivos...' : 'Guardando...'}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Guardar Nota
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
      
      {/* Lista de notas */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">
          Historial de Notas ({notas.length})
        </h3>
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : notas.length === 0 ? (
          <div className={`p-8 text-center rounded-md border ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium">Sin notas</h3>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Este producto no tiene notas ni documentos.
              Agregue una nota o adjunte un archivo para comenzar.
            </p>
          </div>
        ) : (
          notas.map((nota) => (
            <Card key={nota.id} className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 relative w-10 h-10 overflow-hidden rounded-full">
                    {nota.user_avatar ? (
                      <img 
                        src={nota.user_avatar} 
                        alt={nota.user_name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="ml-1 overflow-hidden">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{nota.user_name}</p>
                    <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <p className="truncate">{nota.user_role}</p>
                      {nota.user_email && <p className="truncate">{nota.user_email}</p>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDate(nota.created_at)}
                    </p>
                  </div>
                </div>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Eliminar</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar nota?</AlertDialogTitle>
                      <AlertDialogDescription className={theme === 'dark' ? 'text-gray-400' : ''}>
                        Esta acción eliminará la nota y todos sus archivos adjuntos permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className={theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : ''}>
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => handleDeleteNote(nota.id)}
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardHeader>
              
              <CardContent>
                <p className="whitespace-pre-wrap">{nota.content}</p>
                
                {/* Archivos adjuntos */}
                {nota.files && nota.files.length > 0 && (
                  <div className={`mt-4 p-3 rounded-md ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <p className="text-sm font-medium mb-2">Archivos adjuntos:</p>
                    <ul className="space-y-2">
                      {nota.files.map((file) => (
                        <li 
                          key={file.id} 
                          className="text-sm flex items-center justify-between rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <span className="flex items-center">
                            <FileText className="h-4 w-4 mr-2 text-blue-500" />
                            {file.name} ({formatFileSize(file.size)})
                          </span>
                          <a 
                            href={file.url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default NotasTab;
