'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategorySeoCardProps {
  category: Category;
}

export default function CategorySeoCard({ category }: CategorySeoCardProps) {
  if (!category.meta_title && !category.meta_description) return null;

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          SEO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {category.meta_title && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Meta Title</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{category.meta_title}</p>
          </div>
        )}
        {category.meta_description && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Meta Description</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{category.meta_description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
