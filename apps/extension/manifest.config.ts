import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Tessera',
  version: '0.0.0',
  description: 'Capture web highlights into a synced, AI-assisted study platform.',
  // The action icon keeps opening the popup; the side panel is reached *through*
  // the popup (OPN-1) — so we deliberately do NOT set openPanelOnActionClick.
  action: { default_popup: 'index.html', default_title: 'Tessera' },
  side_panel: { default_path: 'sidepanel.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'alarms', 'contextMenus', 'storage', 'scripting', 'sidePanel'],
  host_permissions: ['<all_urls>'],
  commands: {
    'save-selection': {
      suggested_key: { default: 'Alt+Shift+H' },
      description: 'Save the current selection to Tessera',
    },
  },
});
