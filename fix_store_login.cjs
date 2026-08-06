const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf-8');

const target = `  login: (userData, authMethod = 'google') => {
    const user = userData || {`;
const replace = `  login: (userData, authMethod = 'google') => {
    if (userData && userData.email === 'syaswanthkumar66@gmail.com') {
      userData.isAdmin = true;
    }
    const user = userData || {`;

code = code.replace(target, replace);
fs.writeFileSync('src/store.ts', code);
