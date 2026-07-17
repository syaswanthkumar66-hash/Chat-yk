const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

code = `import { WebRTCConnectivityTester } from './WebRTCConnectivityTester';\n` + code;

const search = `                </Card>
              </div>
            )}
          </motion.div>
        )}

        </main>`;

const replace = `                </Card>
              </div>
              <div className="mt-8">
                <WebRTCConnectivityTester />
              </div>
            )}
          </motion.div>
        )}

        </main>`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/AdminPanel.tsx', code);
