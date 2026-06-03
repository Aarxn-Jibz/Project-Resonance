import { defineConfig } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['DEDUP_KV'],
          r2Buckets: ['STEMS_BUCKET'],
          d1Databases: ['LIBRARY_DB'],
          bindings: {
            ML_WORKER_URL: 'http://mock-modal.internal/separate',
            WEBHOOK_SECRET: 'test-secret',
            R2_PUBLIC_URL: 'https://pub-test.r2.dev',
          },
        },
      },
    },
  },
})
