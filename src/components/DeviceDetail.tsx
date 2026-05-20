import { useAppStore } from '../store';
import { Icon, Card, Button } from './UI';
import { motion } from 'framer-motion';

export const DeviceDetail = () => {
  const { activeDeviceId, setActiveDeviceId, devices } = useAppStore();
  const device = devices.find(d => d.id === activeDeviceId);

  if (!device) return null;

  return (
    <div className="flex flex-col h-screen bg-bg-light overflow-hidden">
      <header className="px-6 py-4 flex items-center justify-between bg-bg-light/80 backdrop-blur-xl border-b border-primary/5 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveDeviceId(null)} className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
            <Icon name="chevron_left" />
          </button>
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic leading-none truncate max-w-[150px]">{device.name}</h3>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Device Status: Live</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="size-11 rounded-2xl bg-white flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 border border-white shadow-sm">
            <Icon name="edit" />
          </button>
          <button className="size-11 rounded-2xl bg-white flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 border border-white shadow-sm">
            <Icon name="power_settings_new" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-10 no-scrollbar">
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="size-40 rounded-[2.5rem] bg-white border-8 border-slate-50 shadow-2xl shadow-slate-200 flex items-center justify-center text-slate-400 relative">
            <Icon name={device.type === 'desktop' ? 'laptop_mac' : 'smartphone'} className="text-7xl" />
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute bottom-4 right-4 size-6 rounded-full border-4 border-white bg-emerald-500 shadow-lg shadow-emerald-500/50" 
            />
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{device.name}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3">Connected via Wi-Fi Direct</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-6 space-y-4 bg-white border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Current Speed</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 italic">45.2</span>
              <span className="text-xs font-black text-slate-400 uppercase">Mbps</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
              <Icon name="trending_up" className="text-xs" />
              12.5% UP
            </div>
          </Card>

          <Card className="p-6 space-y-4 bg-white border-slate-100 shadow-xl shadow-slate-200/50">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Signal Strength</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 italic">92</span>
              <span className="text-xs font-black text-slate-400 uppercase">%</span>
            </div>
            <div className="flex gap-1 h-4 items-end">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`flex-1 rounded-full bg-primary ${i <= 4 ? 'opacity-100' : 'opacity-20'}`} style={{ height: `${i * 20}%` }} />
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-8 px-2">
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Total Sent</p>
            <p className="text-2xl font-black text-slate-900 italic">12.4 <span className="text-xs font-black text-slate-400 uppercase tracking-widest not-italic ml-1">GB</span></p>
          </div>
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Total Received</p>
            <p className="text-2xl font-black text-slate-900 italic">8.7 <span className="text-xs font-black text-slate-400 uppercase tracking-widest not-italic ml-1">GB</span></p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Transfers</h3>
            <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">View All</button>
          </div>
          
          <div className="space-y-3">
            {[
              { name: 'vacation_photos.zip', size: '450 MB', status: 'sent' },
              { name: 'Project_Final_v2.pdf', size: '12 MB', status: 'received' },
              { name: 'Presentation_Recording.mp4', size: '1.2 GB', status: 'sending' }
            ].map((item, i) => (
              <Card key={i} className="flex items-center gap-4 p-4 bg-white border-slate-100 hover:border-primary/20 transition-all group">
                <div className="size-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                  <Icon name={item.name.endsWith('zip') ? 'folder_zip' : item.name.endsWith('pdf') ? 'description' : 'movie'} className="text-xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 uppercase tracking-tight italic truncate">{item.name}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{item.size} • {item.status}</p>
                </div>
                {item.status === 'sending' ? (
                  <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : (
                  <div className="size-6 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                    <Icon name="check" className="text-xs" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </main>

      <footer className="p-6 bg-bg-light/80 backdrop-blur-xl border-t border-primary/5 space-y-3">
        <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest italic text-sm shadow-xl shadow-primary/20">
          <Icon name="edit" />
          Rename Device
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-primary/5">
            <Icon name="block" />
            Block
          </Button>
          <Button variant="secondary" className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-primary/5">
            <Icon name="delete" />
            Clear
          </Button>
        </div>
      </footer>
    </div>
  );
};
