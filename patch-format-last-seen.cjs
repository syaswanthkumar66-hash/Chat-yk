const fs = require('fs');
let viewFile = fs.readFileSync('src/components/UserProfileView.tsx', 'utf8');

viewFile = viewFile.replace(
  `function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);`,
  `function formatLastSeen(lastSeen?: string | null): string {
  if (!lastSeen) return 'Offline';
  try {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 5000) {
       return 'just now';
    }
`
);

fs.writeFileSync('src/components/UserProfileView.tsx', viewFile);
