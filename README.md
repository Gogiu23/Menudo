This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Plantilla con IA (editor libre)

La sección «IA» de `/canvas` genera una plantilla desde una petición. La llamada va por `POST /api/template`, que usa cualquier API
compatible con OpenAI. Sin estas variables, la sección avisa y aplica una plantilla estándar (el editor no depende de la IA).

| Variable | Qué es |
| --- | --- |
| `AI_BASE_URL` | URL base del proveedor. Gemini: `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | Nombre del modelo, o varios separados por comas: se prueban en orden si uno falla por demanda, límite o por no existir. Ej.: `gemini-3.8-flash,gemini-3.5-flash,gemini-flash-latest`. Los nombres cambian: en desarrollo, si falla, la respuesta de `/api/template` lista los modelos válidos para tu clave |
| `AI_API_KEY` | Clave del proveedor. Gemini gratis: <https://aistudio.google.com/apikey> |
| `AI_DAILY_LIMIT` | Opcional: tope diario de peticiones por instancia (por defecto 300) |

Ponlas en `.env.local` (y en Vercel → Settings → Environment Variables). La clave solo se lee en el servidor. Para producción con tráfico
real, cambia solo estas variables a un proveedor de pago (por ejemplo Vercel AI Gateway) y ponle un **tope de gasto** a la clave: es
la protección real contra abuso; los límites de la ruta (por IP y diario) viven en memoria de cada instancia.
Diseño: `docs/superpowers/specs/2026-11-24-plantilla-ia-design.md`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
