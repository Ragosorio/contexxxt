// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = process.env.SITE_URL ?? (productionHost ? `https://${productionHost}` : 'http://localhost:4321');
const socialImage = new URL('/og-card.png', site).href;

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: 'Context OS',
      description: 'Un sistema operativo de contexto para trabajar con agentes sin escribir megaprompts.',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/context-os-mark.svg', replacesTitle: false },
      customCss: ['./src/styles/starlight.css'],
      social: [
        {
          icon: 'github',
          label: 'Context OS en GitHub',
          href: 'https://github.com/Ragosorio/contexxxt',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/Ragosorio/contexxxt/edit/main/',
      },
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: [
        { label: '← Producto Context OS', link: '/' },
        { label: 'Inicio de documentación', link: '/docs/' },
        {
          label: 'Empezar',
          items: [
            { label: 'Elige tu recorrido', link: '/docs/empezar/recorridos/' },
            { label: 'Modelo mental', link: '/docs/empezar/modelo-mental/' },
            { label: 'Inicio rápido', link: '/docs/empezar/inicio-rapido/' },
          ],
        },
        {
          label: 'Sin instalar',
          items: [
            { label: 'Audita tu chat', link: '/docs/chat/auditoria/' },
            { label: 'Diseña tus espacios', link: '/docs/chat/espacios/' },
            { label: 'Configura memoria', link: '/docs/chat/memoria/' },
            { label: 'Prompts copiables', link: '/docs/chat/prompts/' },
          ],
        },
        {
          label: 'Conceptos',
          items: [
            { label: 'Fundamentos del curso', link: '/docs/conceptos/fundamentos/' },
            { label: 'Dónde vive cada dato', link: '/docs/conceptos/donde-vive/' },
            { label: 'Presupuesto de contexto', link: '/docs/conceptos/presupuesto/' },
          ],
        },
        {
          label: 'Modo código',
          items: [
            { label: 'Proyecto existente', link: '/docs/codigo/proyecto-existente/' },
            { label: 'Proyecto nuevo', link: '/docs/codigo/proyecto-nuevo/' },
            { label: 'Archivos y autoridad', link: '/docs/codigo/archivos/' },
            { label: 'Skill y agentes', link: '/docs/codigo/skill-y-agentes/' },
            { label: 'Handoffs y checkpoints', link: '/docs/codigo/handoffs/' },
          ],
        },
        {
          label: 'Proveedores',
          items: [
            { label: 'Matriz de capacidades', link: '/docs/proveedores/' },
            { label: 'ChatGPT y Codex', link: '/docs/proveedores/openai/' },
            { label: 'Claude y Cowork', link: '/docs/proveedores/anthropic/' },
          ],
        },
        {
          label: 'Mantener',
          items: [
            { label: 'Diagnóstico', link: '/docs/mantener/diagnostico/' },
            { label: 'Curación y caducidad', link: '/docs/mantener/curacion/' },
            { label: 'Seguridad y privacidad', link: '/docs/mantener/seguridad/' },
            { label: 'Evaluaciones', link: '/docs/mantener/evaluaciones/' },
          ],
        },
        {
          label: 'Referencia',
          items: [
            { label: 'CLI', link: '/docs/referencia/cli/' },
            { label: 'Esquemas', link: '/docs/referencia/esquemas/' },
            { label: 'Changelog', link: '/docs/referencia/changelog/' },
          ],
        },
      ],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: socialImage } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: socialImage } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0b1739' } },
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
