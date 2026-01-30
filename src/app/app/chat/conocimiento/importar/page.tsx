'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, AlignLeft, Loader2 } from 'lucide-react';
import KnowledgeService, {
  KnowledgeSource,
  ImportFragmentData,
  ImportResult
} from '@/lib/services/knowledgeService';
import {
  ImportHeader,
  FileUploadZone,
  TextInputZone,
  ImportSettings,
  PreviewTable,
  ImportActions
} from '@/components/chat/conocimiento/importar';

type ImportMode = 'csv' | 'text';

export default function ImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [memberId, setMemberId] = useState<number | null>(null);

  const [importMode, setImportMode] = useState<ImportMode>('csv');
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: 'csv' | 'text' } | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [textContent, setTextContent] = useState('');
  const [separator, setSeparator] = useState('---');

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [generateEmbeddings, setGenerateEmbeddings] = useState(true);
  const [defaultTags, setDefaultTags] = useState<string[]>([]);

  const [parsedFragments, setParsedFragments] = useState<ImportFragmentData[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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

  const loadSources = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const service = new KnowledgeService(organizationId);
      const sourcesData = await service.getSources();
      setSources(sourcesData.filter(s => s.is_active));
    } catch (error) {
      console.error('Error cargando fuentes:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const parseContent = useCallback(() => {
    if (!organizationId) return;
    setParseError(null);

    try {
      const service = new KnowledgeService(organizationId);
      let fragments: ImportFragmentData[] = [];

      if (importMode === 'csv' && fileContent) {
        fragments = service.parseCSV(fileContent);
      } else if (importMode === 'text' && textContent) {
        fragments = service.parseTextBlocks(textContent, separator);
      }

      if (defaultTags.length > 0) {
        fragments = fragments.map(f => ({
          ...f,
          tags: [...(f.tags || []), ...defaultTags]
        }));
      }

      setParsedFragments(fragments);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Error al procesar el contenido');
      setParsedFragments([]);
    }
  }, [organizationId, importMode, fileContent, textContent, separator, defaultTags]);

  useEffect(() => {
    parseContent();
  }, [parseContent]);

  const handleFileSelect = (content: string, fileName: string, fileType: 'csv' | 'text') => {
    setFileContent(content);
    setSelectedFile({ name: fileName, type: fileType });
    setImportMode(fileType);
    setImportResult(null);
  };

  const handleClearFile = () => {
    setFileContent('');
    setSelectedFile(null);
    setParsedFragments([]);
    setImportResult(null);
  };

  const handleTextChange = (text: string) => {
    setTextContent(text);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!organizationId || !memberId || parsedFragments.length === 0) return;

    setImporting(true);
    try {
      const service = new KnowledgeService(organizationId);
      const result = await service.importFragments(
        parsedFragments,
        selectedSourceId,
        memberId,
        generateEmbeddings
      );

      setImportResult(result);

      if (result.success) {
        toast({
          title: 'Importación completada',
          description: `Se importaron ${result.successCount} fragmentos correctamente`
        });
      } else {
        toast({
          title: 'Error en la importación',
          description: 'Algunos fragmentos no pudieron ser importados',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo completar la importación',
        variant: 'destructive'
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFileContent('');
    setTextContent('');
    setSelectedFile(null);
    setParsedFragments([]);
    setImportResult(null);
    setParseError(null);
  };

  const validFragments = parsedFragments.filter(f => f.title?.trim() && f.content?.trim());

  if (loading && sources.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <ImportHeader onBack={() => router.push('/app/chat/conocimiento')} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Tabs value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800">
                  <TabsTrigger 
                    value="csv" 
                    className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900"
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Archivo CSV
                  </TabsTrigger>
                  <TabsTrigger 
                    value="text"
                    className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900"
                  >
                    <AlignLeft className="h-4 w-4 mr-2" />
                    Texto Plano
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="csv" className="mt-4">
                  <FileUploadZone
                    onFileSelect={handleFileSelect}
                    selectedFile={selectedFile}
                    onClear={handleClearFile}
                  />
                </TabsContent>

                <TabsContent value="text" className="mt-4">
                  <TextInputZone
                    textContent={textContent}
                    separator={separator}
                    onTextChange={handleTextChange}
                    onSeparatorChange={setSeparator}
                  />
                </TabsContent>
              </Tabs>

              <PreviewTable fragments={parsedFragments} />
            </div>

            <div className="lg:col-span-1">
              <ImportSettings
                sources={sources}
                selectedSourceId={selectedSourceId}
                generateEmbeddings={generateEmbeddings}
                defaultTags={defaultTags}
                onSourceChange={setSelectedSourceId}
                onEmbeddingsChange={setGenerateEmbeddings}
                onTagsChange={setDefaultTags}
              />
            </div>
          </div>

          <ImportActions
            fragmentCount={parsedFragments.length}
            validCount={validFragments.length}
            importing={importing}
            result={importResult}
            onImport={handleImport}
            onReset={handleReset}
          />

          {parseError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
              {parseError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
