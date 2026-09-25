declare module 'next/dynamic' {
  import type { ComponentType } from 'react';

  interface DynamicOptions {
    ssr?: boolean;
    loading?: ComponentType;
  }

  export default function dynamic<P = Record<string, never>>(
    loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
    options?: DynamicOptions,
  ): ComponentType<P>;
}
