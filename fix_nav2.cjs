const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf-8');

// I'll just use regex
code = code.replace(/<\/button>\s*<AnimatePresence>/, `              </button>
            </div>
          )}
        </nav>
        <AnimatePresence>`);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
