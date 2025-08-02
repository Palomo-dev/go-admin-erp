'use client';

import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UseFormReturn } from 'react-hook-form';
import { Bell, Mail, Smartphone } from 'lucide-react';

interface TareaRemindersProps {
  form: UseFormReturn<any>;
}

const TareaReminders: React.FC<TareaRemindersProps> = ({ form }) => {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="remind_before_minutes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Recordar antes (minutos)</FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="15"
                {...field}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value) : null;
                  field.onChange(value);
                }}
                value={field.value || ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-3">
        <FormField
          control={form.control}
          name="remind_email"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Recordatorio por email
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="remind_push"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Recordatorio push
                </FormLabel>
              </div>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};

export default TareaReminders;
