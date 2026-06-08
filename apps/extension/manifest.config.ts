import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Tessera',
  version: '0.0.0',
  description: 'Capture web highlights into a synced, AI-assisted study platform.',
  action: { default_popup: 'index.html', default_title: 'Tessera' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'alarms', 'contextMenus', 'storage', 'scripting'],
  host_permissions: ['<all_urls>'],
});
