import { defineConfig } from '@playwright/test';
import { execSync } from 'child_process';

let hasNativeWebkit = false;
try {
  execSync('/home/razu/.cache/ms-playwright/webkit-2370/minibrowser-gtk/bin/MiniBrowser --help 2>&1', { stdio: 'ignore' });
  hasNativeWebkit = true;
} catch {
  hasNativeWebkit = false;
}

const webkitEngine = hasNativeWebkit ? 'webkit' : 'chromium';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Narrowest supported',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: 'Small Android',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
      },
    },
    {
      name: 'Large Android',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: 'Small iPhone',
      use: {
        browserName: webkitEngine,
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'iPhone',
      use: {
        browserName: webkitEngine,
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: 'Large iPhone',
      use: {
        browserName: webkitEngine,
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: 'Phone in landscape',
      use: {
        browserName: webkitEngine,
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: 'iPad mini portrait',
      use: {
        browserName: webkitEngine,
        viewport: { width: 744, height: 1133 },
      },
    },
    {
      name: 'iPad portrait',
      use: {
        browserName: webkitEngine,
        viewport: { width: 820, height: 1180 },
      },
    },
    {
      name: 'iPad landscape',
      use: {
        browserName: webkitEngine,
        viewport: { width: 1180, height: 820 },
      },
    },
    {
      name: 'iPad Pro landscape',
      use: {
        browserName: webkitEngine,
        viewport: { width: 1366, height: 1024 },
      },
    },
    {
      name: 'Laptop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'Desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
