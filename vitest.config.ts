import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sandbox integration tests deliberately sleep ~3s waiting on the mock
    // client's fake SMS delivery timer — give the suite room to breathe.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
