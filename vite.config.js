import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { checkPublicEnv } from './src/security/build/checkPublicEnv.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  checkPublicEnv(environment)
  const { PORT = '3001' } = environment
  return {
    base: environment.VITE_ASSET_BASE_URL || '/',
    plugins: [react()],
    server: {
      watch: { ignored: ['**/.integration/**'] },
      proxy: {
        '/api': `http://127.0.0.1:${PORT}`,
        '/uploads': `http://127.0.0.1:${PORT}`,
      },
    },
  }
})
