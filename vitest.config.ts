import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __PINSAY_SERVER__: JSON.stringify('https://app.pinsay.dev') },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
