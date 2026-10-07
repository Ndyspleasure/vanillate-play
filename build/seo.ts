import type { Plugin } from 'vite';
import { GAMES } from '../src/games/catalog.ts';

/** Emits sitemap.xml (and a Sitemap line in robots.txt) when SITE_URL is known at build time. */
export function seo(): Plugin {
  return {
    name: 'vm-seo',
    apply: 'build',
    generateBundle() {
      const site = (process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');
      if (!site) return;
      const paths = ['/', '/games', '/privacy', ...GAMES.map((g) => `/games/${g.id}`)];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n` });
    },
  };
}
