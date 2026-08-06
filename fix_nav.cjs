const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf-8');

const navEndRegex = /<\/div>\s*\}\)\}\s*<\/div>\s*<\/motion\.div>\s*<\/>\s*\}\)\}\s*<\/AnimatePresence>\s*<\/div>\s*\)\}\s*<\/nav>/;
// Wait, I can just replace the strings!

const target1 = `              </button>
              <AnimatePresence>`;
const replace1 = `              </button>
            </div>
          )}
        </nav>
        <AnimatePresence>`;

const target2 = `                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>`;

const replace2 = `                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>`;

// Let's do it using exact match.
code = code.replace(target1, replace1);
code = code.replace(target2, replace2);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
