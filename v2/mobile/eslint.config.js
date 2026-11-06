// Config plana de ESLint 9 para Expo (SDK 54). La usa `npx expo lint`.
// Dependencias fijadas en package-lock.json; no instala paquetes al ejecutar lint.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['*.config.js', 'scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: { Buffer: 'readonly' },
    },
  },
  {
    files: ['*.config.js', 'scripts/**/*.{js,cjs}'],
    languageOptions: {
      globals: { __dirname: 'readonly' },
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'android/**', 'ios/**', 'modules/**/build/**'],
  },
]);
