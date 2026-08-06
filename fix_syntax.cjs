const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

code = code.replace(`            )}
          </div>
        )}
        )}
      </main>`, `            )}
          </div>
        )}
      </main>`);

fs.writeFileSync('src/components/GroupCall.tsx', code);
