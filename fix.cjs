const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.substring(0, code.indexOf('      {isLoggedIn       {isLoggedIn'));
code += '      {isLoggedIn && <NotificationPrompt />}\n      <PWAInstallPrompt />\n      {isLoggedIn && onlineDevices.length > 1 && (backendSyncStatus === \'mismatch\' || backendSyncStatus === \'syncing\' || backendSyncStatus === \'checking\') && <QuickProfileSwitcher />}\n    </div>\n  );\n}\n';
fs.writeFileSync('src/App.tsx', code);
