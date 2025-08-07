import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    specPattern: 'src/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'src/support/e2e.ts',
    videosFolder: '../../dist/cypress/apps/react-integration-tests-e2e/videos',
    screenshotsFolder:
      '../../dist/cypress/apps/react-integration-tests-e2e/screenshots',
    chromeWebSecurity: false,
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
  },
});
