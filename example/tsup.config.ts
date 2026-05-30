import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['**/*.ts'],
  format: ['esm'],
  clean: true,
  dts: false, 
  sourcemap: true,
  watch: true,

  bundle: false, 
  splitting: false,

  onSuccess: 'node dist/app.mjs'
})
