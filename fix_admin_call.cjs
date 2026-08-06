const fs = require('fs');
let code = fs.readFileSync('src/components/AdminCallTester.tsx', 'utf-8');

const target1 = `  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleCreateCall = (type: 'voice' | 'video') => {`;

const replace1 = `  const [callType, setCallType] = useState<'voice' | 'video' | 'walkie-talkie'>('video');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleCreateCall = (type: 'voice' | 'video' | 'walkie-talkie') => {`;

code = code.replace(target1, replace1);

const target2 = `          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
            <div className="mx-auto size-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
              <Icon name="call" className="text-3xl" />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase text-slate-800">Voice Call Test</h4>
              <p className="text-xs text-slate-500 font-bold uppercase mt-2">Test Multi-party Audio streams</p>
            </div>
            <Button onClick={() => handleCreateCall('voice')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12">
              Start Voice Test
            </Button>
          </Card>
        </div>`;

const replace2 = `          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
            <div className="mx-auto size-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
              <Icon name="call" className="text-3xl" />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase text-slate-800">Voice Call Test</h4>
              <p className="text-xs text-slate-500 font-bold uppercase mt-2">Test Multi-party Audio streams</p>
            </div>
            <Button onClick={() => handleCreateCall('voice')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12">
              Start Voice Test
            </Button>
          </Card>

          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
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
          </Card>
        </div>`;

code = code.replace(target2, replace2);

const targetGrid = `className="grid grid-cols-1 md:grid-cols-2 gap-6"`;
const replaceGrid = `className="grid grid-cols-1 md:grid-cols-3 gap-6"`;
code = code.replace(targetGrid, replaceGrid);

fs.writeFileSync('src/components/AdminCallTester.tsx', code);
