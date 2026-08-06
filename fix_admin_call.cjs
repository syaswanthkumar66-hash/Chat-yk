const fs = require('fs');
let code = fs.readFileSync('src/components/AdminCallTester.tsx', 'utf-8');

const target1 = `  const [callType, setCallType] = useState<'voice' | 'video' | 'walkie-talkie'>('video');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleCreateCall = (type: 'voice' | 'video' | 'walkie-talkie') => {`;

const replace1 = `  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleCreateCall = (type: 'voice' | 'video') => {`;

code = code.replace(target1, replace1);

const targetGrid = `className="grid grid-cols-1 md:grid-cols-3 gap-6"`;
const replaceGrid = `className="grid grid-cols-1 md:grid-cols-2 gap-6"`;
code = code.replace(targetGrid, replaceGrid);

const walkieTalkieCardRegex = /<Card className="p-8 space-y-6 border-none shadow-xl shadow-primary\/5 rounded-\[\2rem\] bg-white text-center hover:scale-\[1.02\] transition-transform">[\s\S]*?Walkie Talkie Test[\s\S]*?<\/Card>/;

const updatedCode = code.replace(walkieTalkieCardRegex, "");
fs.writeFileSync('src/components/AdminCallTester.tsx', updatedCode);
