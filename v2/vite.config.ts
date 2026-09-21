import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wikiAssets } from './wiki-assets'
export default defineConfig({ plugins: [react(), wikiAssets()], build: { outDir: 'dist' } })
