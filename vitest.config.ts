import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/tests/**/*.test.ts'],
    env: {
      VITEST: 'true',
      DATABASE_URL: ':memory:',
    },
  },
})
