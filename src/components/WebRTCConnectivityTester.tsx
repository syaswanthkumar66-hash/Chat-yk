import React, { useState, useEffect } from 'react';
import { Card, Button, Icon } from './UI';
import { webrtcService } from '../services/webrtcService';

export const WebRTCConnectivityTester = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [candidates, setCandidates] = useState<{ type: string; protocol: string; foundation: string; url?: string }[]>([]);

  const log = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runTest = async () => {
    setIsTesting(true);
    setLogs([]);
    setCandidates([]);
    
    try {
      log('Fetching ICE configuration...');
      const iceServers = await webrtcService.getIceServers();
      log(`Retrieved ${iceServers.length} ICE server configs`);
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all'
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const c = event.candidate;
          log(`Candidate gathered: ${c.type} (${c.protocol}) via ${c.relatedAddress || 'local'}`);
          setCandidates(prev => [...prev, {
            type: c.type,
            protocol: c.protocol,
            foundation: c.foundation,
            url: c.relatedAddress
          }]);
        } else {
          log('ICE gathering completed.');
          pc.close();
          setIsTesting(false);
        }
      };

      pc.onicecandidateerror = (event: any) => {
        log(`[ERROR] ICE Candidate Error: ${event.errorText} (${event.errorCode}) on ${event.url}`);
      };

      log('Creating data channel to trigger ICE gathering...');
      pc.createDataChannel('test_channel');
      
      const offer = await pc.createOffer();
      log('Setting local description to start gathering...');
      await pc.setLocalDescription(offer);

    } catch (err: any) {
      log(`[FATAL] Test failed: ${err.message || String(err)}`);
      setIsTesting(false);
    }
  };

  return (
    <Card className="p-6 bg-slate-900 border-slate-800 border overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Icon name="network_check" className="text-primary" />
            WebRTC Connectivity Diagnostics
          </h3>
          <p className="text-sm text-slate-400">Perform a real-time STUN/TURN gathering test to debug relay issues.</p>
        </div>
        <Button onClick={runTest} disabled={isTesting} className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-4 py-2 text-sm uppercase tracking-widest">
          {isTesting ? 'Testing...' : 'Run Diagnostics'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-black/50 rounded-xl p-4 border border-white/5 font-mono text-[10px] sm:text-xs text-green-400 h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic flex h-full items-center justify-center">Awaiting test start...</div>
          ) : (
            logs.map((l, i) => <div key={i} className="mb-1 leading-tight">{l}</div>)
          )}
        </div>
        
        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
          <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-widest">Discovered Candidates</h4>
          {candidates.length === 0 ? (
            <div className="text-slate-500 text-xs italic">No candidates gathered yet.</div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {candidates.map((c, i) => (
                <div key={i} className="bg-black/30 p-2 rounded-lg flex items-center justify-between border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{c.type}</span>
                    <span className="text-[10px] text-slate-400 uppercase">{c.protocol}</span>
                  </div>
                  {c.type === 'relay' ? (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[9px] font-bold tracking-widest uppercase">
                      TURN ACTIVE
                    </span>
                  ) : c.type === 'srflx' ? (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-bold tracking-widest uppercase">
                      STUN ACTIVE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-[9px] font-bold tracking-widest uppercase">
                      LOCAL HOST
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
