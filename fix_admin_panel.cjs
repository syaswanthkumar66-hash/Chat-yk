const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf-8');

const importTarget = `import { AdminCallTester } from './AdminCallTester';`;
const importReplace = `import { AdminCallTester } from './AdminCallTester';\nimport { AdminWalkieTalkieTester } from './AdminWalkieTalkieTester';`;
code = code.replace(importTarget, importReplace);

const tabTarget = `{ id: 'call_tester', label: 'Call Tester', icon: 'video_call' }`;
const tabReplace = `{ id: 'call_tester', label: 'Call Tester', icon: 'video_call' },\n  { id: 'walkie_talkie', label: 'Walkie Talkie', icon: 'graphic_eq' }`;
code = code.replace(tabTarget, tabReplace);

const stateTarget = `const [activeTab, setActiveTab] = useState<'monitor' | 'helpdesk' | 'user_manage' | 'users' | 'broadcast' | 'integrations' | 'security' | 'settings' | 'website' | 'test_mode' | 'call_tester'>('monitor');`;
const stateReplace = `const [activeTab, setActiveTab] = useState<'monitor' | 'helpdesk' | 'user_manage' | 'users' | 'broadcast' | 'integrations' | 'security' | 'settings' | 'website' | 'test_mode' | 'call_tester' | 'walkie_talkie'>('monitor');`;
code = code.replace(stateTarget, stateReplace);

const renderTarget = `        {activeTab === 'call_tester' && (
          <AdminCallTester />
        )}`;
const renderReplace = `        {activeTab === 'call_tester' && (
          <AdminCallTester />
        )}
        {activeTab === 'walkie_talkie' && (
          <AdminWalkieTalkieTester />
        )}`;
code = code.replace(renderTarget, renderReplace);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
