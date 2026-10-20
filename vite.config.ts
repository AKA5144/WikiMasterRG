
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  base: '/WikiMasterRG/',

  server: {
    proxy: {
      '/silentblue-api': {
        target: 'https://silentblue.remywiki.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/api.php',
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log(
              '[SilentBlue proxy]',
              req.method,
              req.url
            )
          })

          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(
              '[SilentBlue response]',
              proxyRes.statusCode,
              req.url
            )
          })
        },
      },
    },
  },
})
