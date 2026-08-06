const fs = require('fs');
let code = fs.readFileSync('src/components/AdminCallTester.tsx', 'utf-8');

const strToReplace = `          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
            <div className="mx-auto size-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
              <Icon name="graphic_eq" className="text-3xl" />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase text-slate-800">Walkie Talkie Test</h4>
              <p className="text-xs text-slate-500 font-bold uppercase mt-2">Test P2P Audio Broadcast</p>
            </div>
            <Button onClick={() => handleCreateCall('walkie-talkie')} className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl h-12">
              Start Walkie Talkie
            </Button>
          </Card>`;

code = code.replace(strToReplace, "");
fs.writeFileSync('src/components/AdminCallTester.tsx', code);
