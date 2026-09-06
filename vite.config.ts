import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Served from https://<user>.github.io/Powder-Plant/ on GitHub Pages, so
  // every asset URL needs that repo-name prefix. A custom domain (or any
  // host that serves from the root) would set this back to "/".
  base: "/Powder-Plant/",
})
