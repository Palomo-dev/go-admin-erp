'use client';

import React, { memo } from 'react';
import { PanelRightClose, User, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';

export type ChatPanelType = 'profile' | 'search' | null;

interface ChatSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activePanel: ChatPanelType;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function ChatSidePanelComponent({
  isOpen,
  onClose,
  activePanel,
  title,
  icon,
  children
}: ChatSidePanelProps) {
  if (!isOpen || !activePanel) return null;

  const getIcon = () => {
    if (icon) return icon;
    switch (activePanel) {
      case 'profile':
        return <User size={18} />;
      case 'search':
        return <Search size={18} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        'w-80 lg:w-96',
        'bg-white dark:bg-gray-900',
        'border-l border-gray-200 dark:border-gray-700',
        'transition-all duration-300 ease-in-out',
        'overflow-hidden flex-shrink-0'
      )}
    >
      {/* Header del panel */}
      <div className="flex items-center justify-between p-4 min-h-[60px] bg-blue-600 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white flex-shrink-0">
            {getIcon()}
          </span>
          <h2 className="text-lg font-bold text-white truncate">
            {title}
          </h2>
        </div>
        
        {/* Botón para cerrar el panel */}
        <button
          onClick={onClose}
          className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors flex-shrink-0 ml-2"
          aria-label="Cerrar panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Contenido del panel con scroll */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export const ChatSidePanel = memo(ChatSidePanelComponent);
