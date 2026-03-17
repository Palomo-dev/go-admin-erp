'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Save,
  Loader2,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/utils/Utils';
import type { WebsitePage } from '@/lib/services/websitePageBuilderService';

export type DevicePreview = 'desktop' | 'tablet' | 'mobile';

interface EditorHeaderProps {
  pages: WebsitePage[];
  currentPageId: string;
  onPageChange: (pageId: string) => void;
  devicePreview: DevicePreview;
  onDeviceChange: (device: DevicePreview) => void;
  isSaving: boolean;
  onSave: () => void;
  hasChanges: boolean;
  previewUrl: string | null;
}

export default function EditorHeader({
  pages,
  currentPageId,
  onPageChange,
  devicePreview,
  onDeviceChange,
  isSaving,
  onSave,
  hasChanges,
  previewUrl,
}: EditorHeaderProps) {
  const currentPage = pages.find((p) => p.id === currentPageId);

  const devices: { id: DevicePreview; icon: typeof Monitor; label: string }[] = [
    { id: 'desktop', icon: Monitor, label: 'Escritorio' },
    { id: 'tablet', icon: Tablet, label: 'Tablet' },
    { id: 'mobile', icon: Smartphone, label: 'Móvil' },
  ];

  return (
    <div className="h-14 bg-blue-600 text-white flex items-center justify-between px-4 border-b border-blue-700 shrink-0">
      {/* Left: Back + Page name */}
      <div className="flex items-center gap-3">
        <Link
          href="/app/organizacion/branding"
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-sm text-blue-200">Editando:</span>
          <Select value={currentPageId} onValueChange={onPageChange}>
            <SelectTrigger className="h-8 w-[180px] bg-white/10 border-white/20 text-white text-sm">
              <SelectValue placeholder="Seleccionar página" />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.id} value={page.id}>
                  {page.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Center: Device Preview Toggle */}
      <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
        {devices.map((device) => {
          const Icon = device.icon;
          return (
            <button
              key={device.id}
              onClick={() => onDeviceChange(device.id)}
              title={device.label}
              className={cn(
                'p-1.5 rounded transition-colors',
                devicePreview === device.id
                  ? 'bg-white/20 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Right: Preview + Save */}
      <div className="flex items-center gap-2">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-white/10 transition-colors text-gray-300 hover:text-white"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver sitio
          </a>
        )}

        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaving || !hasChanges}
          className={cn(
            'h-8 text-sm',
            hasChanges
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-gray-600 hover:bg-gray-500'
          )}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );
}
