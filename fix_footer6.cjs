const fs = require('fs');
let code = fs.readFileSync('src/components/GroupCall.tsx', 'utf-8');

// find the exact index
const idx = code.indexOf(`          )}
          )}
          
          <button 
            onClick={handleRequestEndCall}`);

if (idx !== -1) {
  const replaceStr = `          )}
            </>
          )}
          
          <button 
            onClick={handleRequestEndCall}`;
  code = code.substring(0, idx) + replaceStr + code.substring(idx + 95);
  // let's just do replace again but be more permissive
}

code = code.replace(/}\)\s*}\)\s*<button\s*onClick=\{handleRequestEndCall\}/g, 
`)}
  </>
)}
<button onClick={handleRequestEndCall}`);

fs.writeFileSync('src/components/GroupCall.tsx', code);
