'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import ConversationFilesService, {
  ConversationFile,
  FileStats
} from '@/lib/services/conversationFilesService';
import {
  FilesHeader,
  FilesList
} from '@/components/chat/conversations/id/files';

export default function CRMConversationFilesPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [stats, setStats] = useState<FileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && conversationId) {
      loadData();
      checkUserRole();
    }
  }, [organizationId, conversationId]);

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const service = new ConversationFilesService(organizationId);

      const [filesData, statsData] = await Promise.all([
        service.getConversationFiles(conversationId),
        service.getFileStats(conversationId),
      ]);

      setFiles(filesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando archivos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los archivos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkUserRole = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select(`
          role_id,
          roles:role_id (name)
        `)
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (member?.roles) {
        const roleData = member.roles as any;
        setUserRole(roleData?.name || null);
      }
    } catch (error) {
      console.error('Error verificando rol:', error);
    }
  };

  const handleDownload = async (file: ConversationFile) => {
    if (!organizationId) return;

    try {
      const service = new ConversationFilesService(organizationId);
      const url = await service.getSignedUrl(file, 60);

      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Descarga iniciada',
        description: `Descargando ${file.file_name}`,
      });
    } catch (error) {
      console.error('Error descargando archivo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar el archivo',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLink = async (file: ConversationFile) => {
    if (!organizationId) return;

    try {
      const service = new ConversationFilesService(organizationId);
      const url = await service.getSignedUrl(file, 3600);

      await navigator.clipboard.writeText(url);

      toast({
        title: 'Enlace copiado',
        description: 'El enlace expira en 1 hora',
      });
    } catch (error) {
      console.error('Error copiando enlace:', error);
      toast({
        title: 'Error',
        description: 'No se pudo copiar el enlace',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (file: ConversationFile) => {
    if (!organizationId) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ConversationFilesService(organizationId);
      await service.deleteFile(file.id, user.id);

      setFiles((prev) => prev.filter((f) => f.id !== file.id));

      if (stats) {
        setStats({
          ...stats,
          totalFiles: stats.totalFiles - 1,
          totalSize: stats.totalSize - file.size_bytes,
        });
      }

      toast({
        title: 'Archivo eliminado',
        description: `${file.file_name} ha sido eliminado`,
      });
    } catch (error) {
      console.error('Error eliminando archivo:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el archivo',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const canDelete = userRole === 'admin' || userRole === 'owner' || userRole === 'Administrador';

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <FilesHeader
        conversationId={conversationId}
        stats={stats}
        loading={loading}
      />

      <div className="flex-1 overflow-y-auto">
        <FilesList
          files={files}
          loading={loading}
          onDownload={handleDownload}
          onCopyLink={handleCopyLink}
          onDelete={handleDelete}
          canDelete={canDelete}
        />
      </div>
    </div>
  );
}
