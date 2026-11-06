import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// Config plana de ESLint 9 para Next 15. Sin esto, `next lint` no tenia
// configuracion y no se ejecutaba (M-COD-081), asi que reglas utiles como
// react-hooks/exhaustive-deps nunca corrian.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
  {
    // Convención del repo: un parámetro o variable que empieza por "_" está
    // sin usar a propósito (firmas de callbacks, mocks).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Los tests usan dobles de prueba (mocks de Supabase/Stripe, módulos
    // nativos de Expo) donde tipar cada firma no aporta: estas reglas avisan
    // pero no bloquean el lint. El código de la app sigue en "error".
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@next/next/no-assign-module-variable": "warn",
      "react/display-name": "warn",
    },
  },
];

export default eslintConfig;
