import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'









function serverlessFunctions(): Plugin {
  return {
    name: 'grelines-serverless-dev',
    configureServer(server) {
      const mode = server.config.mode;

      server.middlewares.use('/api/tcl', async (req, res) => {
        try {
          
          
          
          
          
          
          
          
          
          const keys = ['GRANDLYON_USERNAME', 'GRANDLYON_PASSWORD'];
          
          
          
          for (const key of keys) delete process.env[key];
          const env = loadEnv(mode, process.cwd(), '');
          for (const key of keys) {
            if (env[key]) process.env[key] = env[key];
          }

          
          
          const module = await server.ssrLoadModule('/api/tcl.js');
          await module.default(req, res);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Fonction en échec', detail: String(error) }));
        }
      });
    },
  };
}


export default defineConfig({
  plugins: [react(), serverlessFunctions()],
  build: {
    
    
    
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)/.test(id)) return 'react';
          if (id.includes('node_modules/framer-motion')) return 'motion';
          return;
        },
      },
    },
    
    
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://data.mobilites-m.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('origin', 'mon_appli');
          });
        }
      }
    }
  }
})
