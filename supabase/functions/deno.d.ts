/**
 * Declaraciones de tipos para Deno runtime.
 *
 * Este archivo suple los tipos globales de Deno cuando el IDE no puede
 * resolver las librerías `deno.ns` / `deno.window` del tsconfig.json de
 * la carpeta de Edge Functions. Cubre los usos más comunes dentro de
 * las Edge Functions de Supabase (env vars, serve, crypto, etc.).
 *
 * NO es un reemplazo completo del runtime de Deno; se extiende según
 * se necesiten más APIs.
 */

declare const Deno: {
  env: {
    get(name: string): string | undefined;
    set(name: string, value: string): void;
    toObject(): Record<string, string>;
  };
  serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  serve(
    options: {
      port?: number;
      hostname?: string;
      onListen?: (params: { hostname: string; port: number }) => void;
    },
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  cwd(): string;
  readTextFile(path: string | URL): Promise<string>;
  writeTextFile(path: string | URL, data: string): Promise<void>;
  args: string[];
};

declare namespace Deno {
  export type Reader = {
    read(p: Uint8Array): Promise<number | null>;
  };
  export type Writer = {
    write(p: Uint8Array): Promise<number>;
  };
}

// Declaraciones de módulos para imports con esquemas de Deno (jsr:, npm:)
// que el TypeScript Language Server del IDE no puede resolver nativamente
// sin la extensión de Deno instalada.

declare module "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare module "npm:@supabase/supabase-js@2" {
  type PostgrestBuilder = Promise<{ data: any; error: any }> & {
    select(columns?: string): PostgrestBuilder;
    eq(column: string, value: any): PostgrestBuilder;
    neq(column: string, value: any): PostgrestBuilder;
    in(column: string, values: any[]): PostgrestBuilder;
    is(column: string, value: any): PostgrestBuilder;
    not(column: string, operator: string, value: any): PostgrestBuilder;
    like(column: string, pattern: string): PostgrestBuilder;
    ilike(column: string, pattern: string): PostgrestBuilder;
    or(filters: string): PostgrestBuilder;
    order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): PostgrestBuilder;
    limit(n: number, opts?: any): PostgrestBuilder;
    range(from: number, to: number): PostgrestBuilder;
    single(): Promise<{ data: any; error: any }>;
    maybeSingle(): Promise<{ data: any; error: any }>;
    then<T>(onfulfilled?: (value: { data: any; error: any }) => T | PromiseLike<T>): Promise<T>;
  };

  export interface SupabaseClient {
    auth: {
      getUser(token?: string): Promise<{ data: { user: any }; error: any }>;
    };
    from(table: string): {
      select(columns?: string): PostgrestBuilder;
      insert(values: any | any[]): PostgrestBuilder;
      update(values: any): PostgrestBuilder;
      delete(): PostgrestBuilder;
      upsert(values: any | any[]): PostgrestBuilder;
    };
    storage: {
      from(bucket: string): {
        upload(path: string, body: any, opts?: any): Promise<{ data: any; error: any }>;
        getPublicUrl(path: string): { data: { publicUrl: string } };
        remove(paths: string[]): Promise<{ data: any; error: any }>;
      };
    };
  }
  export function createClient(url: string, key: string, opts?: any): SupabaseClient;
}
