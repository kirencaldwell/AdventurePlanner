# React + TypeScript + Vite
by kirencaldwell, now with mandatory testing

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Gemini Ask Setup

Ask uses Gemini 2.5 Flash. Google AI Studio offers a free API tier, subject to Google's current model and account quotas. The app also enforces 5 requests per user per minute, 50 per user per day, and 15 per project per minute/100 per project per day. Provider quotas still apply.

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Supabase project's SQL Editor, run [`adventure_planner/supabase/migrations/20261002_add_ask_rate_limit.sql`](adventure_planner/supabase/migrations/20261002_add_ask_rate_limit.sql).
3. Add these server-side environment variables to the Vercel project and redeploy:
  - `GEMINI_API_KEY`: the Google AI Studio key.
  - `SUPABASE_URL`: the Supabase project URL.
  - `SUPABASE_ANON_KEY`: the Supabase anon/publishable key, used only to verify signed-in users.
  - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role/secret key, used only for the quota RPC.
4. Keep `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` out of all `VITE_` variables and client code. `/api/ask` has an entrypoint at both the repository root and `adventure_planner/`, so it works with either Vercel Root Directory setting.

For local use, export the same four variables in the shell that runs the server, apply the migration, then run `npm --prefix adventure_planner run build` followed by `npm --prefix adventure_planner start`. For Vite development, start the built server first and then run `npm --prefix adventure_planner run dev`; the `/api` requests are proxied to port 8099.
