import { supabase } from '@/lib/supabase/config';

export interface ConversationFile {
  id: string;
  organization_id: number;
  message_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, any>;
  created_at: string;
  message?: {
    id: string;
    role: string;
    direction: string;
    created_at: string;
    sender_customer_id?: string;
    sender_member_id?: number;
    customer?: {
      full_name: string;
    };
  };
}

export interface FileStats {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, number>;
}

class ConversationFilesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getConversationFiles(conversationId: string): Promise<ConversationFile[]> {
    const { data: messagesData, error: msgError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);

    if (msgError || !messagesData || messagesData.length === 0) {
      return [];
    }

    const messageIds = messagesData.map(m => m.id);

    const { data, error } = await supabase
      .from('message_attachments')
      .select(`
        id,
        organization_id,
        message_id,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
        metadata,
        created_at
      `)
      .eq('organization_id', this.organizationId)
      .in('message_id', messageIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo archivos:', error);
      throw error;
    }

    const filesWithMessages = await Promise.all(
      (data || []).map(async (att) => {
        const { data: msgData } = await supabase
          .from('messages')
          .select(`
            id,
            role,
            direction,
            created_at,
            sender_customer_id,
            sender_member_id
          `)
          .eq('id', att.message_id)
          .single();

        let customerName = null;
        if (msgData?.sender_customer_id) {
          const { data: custData } = await supabase
            .from('customers')
            .select('full_name')
            .eq('id', msgData.sender_customer_id)
            .single();
          customerName = custData?.full_name;
        }

        return {
          ...att,
          message: msgData ? {
            ...msgData,
            customer: customerName ? { full_name: customerName } : undefined
          } : undefined
        } as ConversationFile;
      })
    );

    return filesWithMessages;
  }

  async getFileStats(conversationId: string): Promise<FileStats> {
    const files = await this.getConversationFiles(conversationId);

    const stats: FileStats = {
      totalFiles: files.length,
      totalSize: 0,
      byType: {}
    };

    files.forEach(file => {
      stats.totalSize += file.size_bytes;
      
      const type = this.getFileCategory(file.mime_type);
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });

    return stats;
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const { data: file, error: fetchError } = await supabase
      .from('message_attachments')
      .select('*')
      .eq('id', fileId)
      .eq('organization_id', this.organizationId)
      .single();

    if (fetchError || !file) {
      throw new Error('Archivo no encontrado');
    }

    const { error: storageError } = await supabase.storage
      .from(file.storage_bucket)
      .remove([file.storage_path]);

    if (storageError) {
      console.error('Error eliminando de storage:', storageError);
    }

    const { error: deleteError } = await supabase
      .from('message_attachments')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      throw deleteError;
    }

    await this.logAuditAction(fileId, 'delete_attachment', userId, {
      file_name: file.file_name,
      file_size: file.size_bytes
    });
  }

  async getPublicUrl(file: ConversationFile): Promise<string> {
    const { data } = supabase.storage
      .from(file.storage_bucket)
      .getPublicUrl(file.storage_path);

    return data.publicUrl;
  }

  async getSignedUrl(file: ConversationFile, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, expiresIn);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  getFileCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'archive';
    return 'other';
  }

  getFileIcon(mimeType: string): string {
    const category = this.getFileCategory(mimeType);
    const icons: Record<string, string> = {
      image: 'Image',
      video: 'Video',
      audio: 'Music',
      pdf: 'FileText',
      document: 'FileText',
      spreadsheet: 'Sheet',
      archive: 'Archive',
      other: 'File'
    };
    return icons[category] || 'File';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private async logAuditAction(
    entityId: string,
    action: string,
    userId: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        entity_type: 'attachment',
        entity_id: entityId,
        action,
        performed_by: userId,
        details
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }
}

export default ConversationFilesService;
