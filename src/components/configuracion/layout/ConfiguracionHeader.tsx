'use client';

import { type ConfigModule, type ConfigSection } from '../config/configModulesRegistry';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ConfiguracionHeaderProps {
  module: ConfigModule | undefined;
  section: ConfigSection | undefined;
  sections: ConfigSection[];
  onSectionChange: (sectionId: string) => void;
}

export function ConfiguracionHeader({ module, section, sections, onSectionChange }: ConfiguracionHeaderProps) {
  if (!module) return null;

  const Icon = module.icon;

  return (
    <div className="border-b">
      <div className="px-6 py-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{module.title}</h1>
          <p className="text-sm text-muted-foreground">{module.description}</p>
        </div>
      </div>
      {sections.length > 1 && (
        <Tabs value={section?.id} onValueChange={onSectionChange}>
          <TabsList className="px-6 bg-transparent justify-start h-auto p-0 gap-2">
            {sections.map((sec) => (
              <TabsTrigger
                key={sec.id}
                value={sec.id}
                className="rounded-t-lg data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-b-none"
              >
                {sec.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </div>
  );
}
