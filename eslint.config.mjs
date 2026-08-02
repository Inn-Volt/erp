import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**'],
  },
  {
    rules: {
      // El proyecto usa `any` puntualmente al leer datos de Supabase/Excel.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Los logos se sirven desde /public y no necesitan next/image.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
