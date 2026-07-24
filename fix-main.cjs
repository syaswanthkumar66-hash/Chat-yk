const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

code = code.replace(/          \/\/ Force check for update on load\n          reg\.update\(\);\n/g, '');
code = code.replace(/        \}\);\n        \n      \/\/ Handle the new service worker taking control[\s\S]*?      \}\);\n    \}\);\n  \}\n\}/g, '        });\n    });\n  }\n}');

fs.writeFileSync('src/main.tsx', code);
