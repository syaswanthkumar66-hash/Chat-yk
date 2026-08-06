const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

code = code.replace(`          </div>
        ) : (
        {isOneOnOne ? (`, `          </div>
        ) : isOneOnOne ? (`);

fs.writeFileSync('src/components/GroupCall.tsx', code);
