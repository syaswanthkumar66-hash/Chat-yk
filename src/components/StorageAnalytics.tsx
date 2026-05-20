import { useAppStore } from '../store';
import { Icon, Card, Button } from './UI';

export const StorageAnalytics = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Storage Usage</h2>
        <Card className="p-8 space-y-8 bg-white border-primary/5 shadow-2xl shadow-primary/5">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <p className="text-4xl font-black text-slate-900 italic">124.5 <span className="text-sm font-black text-slate-400 uppercase tracking-widest not-italic ml-1">GB</span></p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Used of 256 GB Total</p>
            </div>
            <div className="size-20 rounded-full border-8 border-primary/5 border-t-primary flex items-center justify-center text-xs font-black text-primary italic shadow-inner">
              48%
            </div>
          </div>

          <div className="h-3 w-full bg-primary/5 rounded-full overflow-hidden flex shadow-inner">
            <div className="h-full bg-primary w-[30%] shadow-[0_0_10px_rgba(230,126,110,0.3)]" />
            <div className="h-full bg-emerald-500 w-[15%]" />
            <div className="h-full bg-amber-500 w-[10%]" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <div className="size-3 rounded-full bg-primary shadow-lg shadow-primary/30" />
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Media</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">78.2 GB</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30" />
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Documents</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">32.1 GB</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-3 rounded-full bg-amber-500 shadow-lg shadow-amber-500/30" />
              <div className="flex-1">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">Apps</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">14.2 GB</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-6 flex flex-col items-center gap-4 text-center cursor-pointer bg-white border-primary/5 hover:border-primary/20 hover:bg-primary/5 transition-all group shadow-sm hover:shadow-xl">
            <div className="size-14 rounded-2xl bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-all">
              <Icon name="cleaning_services" className="text-2xl" />
            </div>
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Clear Cache</p>
          </Card>
          <Card className="p-6 flex flex-col items-center gap-4 text-center cursor-pointer bg-white border-primary/5 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all group shadow-sm hover:shadow-xl">
            <div className="size-14 rounded-2xl bg-emerald-500/5 text-emerald-500 flex items-center justify-center group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
              <Icon name="auto_delete" className="text-2xl" />
            </div>
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Large Files</p>
          </Card>
        </div>
      </div>
    </div>
  );
};
