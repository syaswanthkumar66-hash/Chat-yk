const fs = require('fs');
let viewFile = fs.readFileSync('src/components/UserProfileView.tsx', 'utf8');

const targetStr = `function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 5000) {
       return 'just now';
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();`;

const replaceStr = `function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 5000) {
       return 'Just now';
    }`;

viewFile = viewFile.replace(targetStr, replaceStr);

fs.writeFileSync('src/components/UserProfileView.tsx', viewFile);
