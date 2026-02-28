import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure the base path is root so assets load correctly
  base: '/', 
  preview: {
    // This is the missing piece: it tells Vite to listen on all local IPs
    host: true, 
    // Render uses port 10000 by default; let's match it explicitly
    port: 10000,
    allowedHosts: [
      'finnius-ai-frontend.onrender.com',
      '.onrender.com' // Using a wildcard is safer for subdomains
    ],
  },
})
