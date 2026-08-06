const fs = require('fs');
let code = fs.readFileSync('src/components/ChatDetail.tsx', 'utf-8');

const search = `    incomingMediaUploads,`;
const replace = `    incomingMediaUploads,
    systemSettings,`;
code = code.replace(search, replace);

fs.writeFileSync('src/components/ChatDetail.tsx', code);
