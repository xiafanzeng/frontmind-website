import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { releaseProfile } from './config/release-profile.mjs';

export default defineConfig({
  site: releaseProfile.siteUrl,
  integrations: [react()],
  server: {
    host: true,
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('./client/src'),
        '@shared': path.resolve('./shared'),
      },
    },
    preview: {
      allowedHosts: [
        '.manuspre.computer',
        '.manus.computer',
        '.manus-asia.computer',
        '.manuscomputer.ai',
        '.manusvm.computer',
        'localhost',
        '127.0.0.1',
      ],
    },
  },
});
