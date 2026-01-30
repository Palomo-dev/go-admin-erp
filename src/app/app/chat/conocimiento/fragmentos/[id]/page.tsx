'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Loader2 } from 'lucide-react';
import KnowledgeService, {
  KnowledgeFragment,
  EmbeddingInfo
} from '@/lib/services/knowledgeService';
import {
  FragmentDetailHeader,
  FragmentContentEditor,
  FragmentMetadataPanel
} from '@/components/chat/conocimiento/fragmentos/id';

interface FragmentWithEmbedding extends KnowledgeFragment {
  embedding_info: EmbeddingInfo | null;
}

export default function FragmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const fragmentId = params.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [fragment, setFragment] = useState<FragmentWithEmbedding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [priority, setPriority] = useState(5);

  const [memberId, setMemberId] = useState<number | null>(null);

  useEffect(() => {
    const getMemberId = async () => {
      if (!organizationId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        setMemberId(data.id);
      }
    };

    getMemberId();
  }, [organizationId]);

  const loadData = useCallback(async () => {
    if (!organizationId || !fragmentId) return;

    setLoading(true);
    try {
      const service = new KnowledgeService(organizationId);
      const fragmentData = await service.getFragmentWithEmbedding(fragmentId);

      if (!fragmentData) {
        toast({
          title: 'Error',
          description: 'No se encontró el fragmento',
          variant: 'destructive'
        });
        router.push('/app/chat/conocimiento');
        return;
      }

      setFragment(fragmentData);
      setTitle(fragmentData.title);
      setContent(fragmentData.content);
      setTags(fragmentData.tags || []);
      setPriority(fragmentData.priority || 5);
    } catch (error) {
      console.error('Error cargando fragmento:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el fragmento',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, fragmentId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasChanges = fragment ? (
    title !== fragment.title ||
    content !== fragment.content ||
    JSON.stringify(tags) !== JSON.stringify(fragment.tags || []) ||
    priority !== (fragment.priority || 5)
  ) : false;

  const handleBack = () => {
    if (fragment?.source_id) {
      router.push(`/app/chat/conocimiento/fuentes/${fragment.source_id}`);
    } else {
      router.push('/app/chat/conocimiento');
    }
  };

  const handleSave = async () => {
    if (!organizationId || !memberId || !fragmentId) return;

    setSaving(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.updateFragmentWithVersion(fragmentId, {
        title: title.trim(),
        content: content.trim(),
        tags,
        priority
      }, memberId);

      toast({
        title: 'Fragmento actualizado',
        description: 'Los cambios se guardaron correctamente. Nueva versión creada.'
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar el fragmento',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!organizationId || !memberId || !fragmentId) return;

    try {
      const service = new KnowledgeService(organizationId);
      await service.toggleFragmentStatus(fragmentId, memberId);

      toast({
        title: fragment?.is_active ? 'Fragmento desactivado' : 'Fragmento activado',
        description: fragment?.is_active 
          ? 'El fragmento ya no aparecerá en búsquedas'
          : 'El fragmento ahora está disponible para búsquedas'
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive'
      });
    }
  };

  const handleReindex = async () => {
    if (!organizationId || !memberId || !fragmentId) return;

    setReindexing(true);
    try {
      const service = new KnowledgeService(organizationId);
      await service.reindexSingleFragment(fragmentId, memberId);

      toast({
        title: 'Reindexación iniciada',
        description: 'El fragmento se está reindexando. Esto puede tomar unos segundos.'
      });

      setTimeout(async () => {
        await loadData();
        setReindexing(false);
      }, 3000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo iniciar la reindexación',
        variant: 'destructive'
      });
      setReindexing(false);
    }
  };

  if (loading && !fragment) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando fragmento...</p>
        </div>
      </div>
    );
  }

  if (!fragment) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <FragmentDetailHeader
        title={title}
        isActive={fragment.is_active}
        hasEmbedding={fragment.has_embedding || false}
        version={fragment.version}
        contentHash={fragment.content_hash}
        updatedAt={fragment.updated_at}
        hasChanges={hasChanges}
        saving={saving}
        reindexing={reindexing}
        onBack={handleBack}
        onSave={handleSave}
        onToggle={handleToggle}
        onReindex={handleReindex}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FragmentContentEditor
              title={title}
              content={content}
              tags={tags}
              onTitleChange={setTitle}
              onContentChange={setContent}
              onTagsChange={setTags}
            />
          </div>
          <div className="lg:col-span-1">
            <FragmentMetadataPanel
              sourceName={fragment.source?.name}
              sourceIcon={fragment.source?.icon || undefined}
              version={fragment.version}
              contentHash={fragment.content_hash}
              priority={priority}
              usageCount={fragment.usage_count}
              positiveFeedback={fragment.positive_feedback}
              negativeFeedback={fragment.negative_feedback}
              createdAt={fragment.created_at}
              updatedAt={fragment.updated_at}
              hasEmbedding={fragment.has_embedding || false}
              embeddingInfo={fragment.embedding_info}
              onPriorityChange={setPriority}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
