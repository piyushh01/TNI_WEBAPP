import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Runs the Vercel-style functions in /api during `npm run dev`, so features
// like "Add Reportee" work locally too. Unknown /api routes fall through to
// the proxy below (the legacy Express server).
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = (req.url || '').match(/^\/api\/([a-z0-9-]+)(?:\?|$)/)?.[1]
        const file = name && path.resolve(__dirname, 'api', `${name}.js`)
        if (!file || !fs.existsSync(file)) return next()
        try {
          let raw = ''
          for await (const chunk of req) raw += chunk
          req.body = raw ? JSON.parse(raw) : {}
          res.status = code => { res.statusCode = code; return res }
          res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
          const mod = await server.ssrLoadModule(file)
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Expose .env (including server-only keys) to the dev API functions.
  Object.assign(process.env, loadEnv(mode, __dirname, ''))
  return {
    plugins: [react(), tailwindcss(), vercelApiDev()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  }
})
