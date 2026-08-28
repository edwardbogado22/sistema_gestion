import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // El proyecto usa el patrón estándar fetch-on-mount/fetch-on-dep-change
      // (setLoading(true) + fetch + setState en el .then) en todas las páginas;
      // esta regla lo trata como anti-patrón de "derived state" y no aplica acá.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
