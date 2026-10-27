import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // Domain vocabulary is load-bearing (CLAUDE.md): `any` would let a
      // mis-shaped row through the boundary and silently rename things.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'lib/database.types.ts',
    // Agent worktrees: whole checkouts of their own, linted from their own root.
    '.claude/worktrees/**',
  ]),
]);

export default eslintConfig;
