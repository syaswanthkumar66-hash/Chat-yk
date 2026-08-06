const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

const target = `          )}
          )}
          
          <button 
            onClick={handleRequestEndCall}`;

const replace = `          )}
            </>
          )}
          
          <button 
            onClick={handleRequestEndCall}`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/GroupCall.tsx', code);
