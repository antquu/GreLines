import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'









function siteHtml(): Plugin {
  let site = 'grenoble';
  return {
    name: 'grelines-site-html',
    configResolved(config) {
      site = ['nancy', 'lyon', 'saint-etienne', 'clermont'].includes(config.env.VITE_SITE) ? config.env.VITE_SITE : 'grenoble';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return site === 'grenoble' ? html : readFileSync(`site/${site}/index.html`, 'utf8');
      },
    },
  };
}

function serverlessFunctions(): Plugin {
  return {
    name: 'grelines-serverless-dev',
    configureServer(server) {
      const mode = server.config.mode;

      const serve = (route: string, file: string, keys: string[]) => {
        server.middlewares.use(route, async (req, res) => {
          try {
            for (const key of keys) delete process.env[key];
            const env = loadEnv(mode, process.cwd(), '');
            for (const key of keys) {
              if (env[key]) process.env[key] = env[key];
            }

            const module = await server.ssrLoadModule(file);
            await module.default(req, res);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'Fonction en échec', detail: String(error) }));
          }
        });
      };

      serve('/api/tcl', '/api/tcl.js', ['GRANDLYON_USERNAME', 'GRANDLYON_PASSWORD']);
      serve('/api/uber', '/api/uber.js', ['UBER_API_TOKEN', 'UBER_AUTH_SCHEME']);
      serve('/api/stan', '/api/stan.js', []);
      serve('/api/gtfsrt', '/api/gtfsrt.js', []);
      serve('/api/where', '/api/where.js', []);
      serve('/api/pdf', '/api/pdf.js', []);
      serve('/api/sncf', '/api/sncf.js', ['SNCF_API_KEY']);
    },
  };
}


export default defineConfig({
  plugins: [react(), serverlessFunctions(), siteHtml()],
  build: {
    manifest: 'asset-manifest.json',
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
