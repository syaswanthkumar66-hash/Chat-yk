import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card, Button, Icon, cn } from './UI';
import { useStore, shallowEqual } from '../store';
import { GroupCall } from './GroupCall';
import { WebRTCConnectivityTester } from './WebRTCConnectivityTester';

export const AdminCallTester = () => {
  const { user } = useStore(s => ({
    user: s.user
  }), shallowEqual);

  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleCreateCall = (type: 'voice' | 'video') => {
    const newCallId = 'test-call-' + Math.random().toString(36).substr(2, 9);
    setCallType(type);
    setActiveCallId(newCallId);
    setGeneratedLink(window.location.origin + '/?join_call=' + newCallId + '&type=' + type);
  };

  const copyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10 pb-20"
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Live Call Tester</h3>
        <p className="text-xs font-black text-neutral-muted uppercase tracking-widest">
          Test Group Video and Voice Calls. Create a test room, share the link, and join directly from here to debug A/V pipelines.
        </p>
      </div>

      {!activeCallId ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
            <div className="mx-auto size-16 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center">
              <Icon name="videocam" className="text-3xl" />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase text-slate-800">Video Call Test</h4>
              <p className="text-xs text-slate-500 font-bold uppercase mt-2">Test Multi-party Video streams</p>
            </div>
            <Button onClick={() => handleCreateCall('video')} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12">
              Start Video Test
            </Button>
          </Card>

          <Card className="p-8 space-y-6 border-none shadow-xl shadow-primary/5 rounded-[2rem] bg-white text-center hover:scale-[1.02] transition-transform">
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
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center md:text-left">
              <h4 className="text-sm font-black uppercase text-slate-800">Test Call Active: <span className="text-primary">{activeCallId}</span></h4>
              <p className="text-xs text-slate-500">Share this link to invite peers to the test.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input type="text" readOnly value={generatedLink || ''} className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-xs text-slate-600 outline-none" />
              <Button onClick={copyLink} className="bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl px-4 h-10">
                <Icon name="content_copy" className="text-sm" />
              </Button>
              <Button onClick={() => setActiveCallId(null)} className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 h-10">
                End
              </Button>
            </div>
          </Card>
          
          <div className="h-[600px] w-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-200/50 relative">
            <GroupCall 
              roomId={activeCallId}
              type={callType}
              onClose={() => setActiveCallId(null)}
              inline={true}
            />
          </div>
        </div>
      )}

      {/* Embedded WebRTC Connectivity Tester for deeper diagnostic metrics */}
      <div className="pt-8 border-t border-slate-200">
        <WebRTCConnectivityTester />
      </div>
    </motion.div>
  );
};
