import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Apunta al dominio de Tailscale (no a la IP de LAN) para que "npm run dev"
      // funcione desde cualquier máquina, esté o no en la red de la facultad.
      // Ese dominio ya resuelve /supabase internamente (ver eval-docente-fix/default.conf
      // en el servidor), así que no hace falta reescribir el path acá.
      '/supabase': {
        target: 'https://server-fce.tail2db1a2.ts.net',
        changeOrigin: true,
      },
    },
  },
})
