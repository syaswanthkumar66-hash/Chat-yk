import React, { useState, useEffect } from 'react';
import { Card, Button, Icon } from './UI';
import { webrtcService } from '../services/webrtcService';

export const WebRTCConnectivityTester = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [candidates, setCandidates] = useState<{ type: string; protocol: string; foundation: string; url?: string }[]>([]);

  // Custom credentials override state
  const [customUrl, setCustomUrl] = useState('turn:free.expressturn.com:3478');
  const [customUsername, setCustomUsername] = useState('000000002099639457');
  const [customPassword, setCustomPassword] = useState('tSLm3kXJjgjn59xHqOmR8TvGo+4=');
  const [useCustomCreds, setUseCustomCreds] = useState(false);
  const [showCredsPanel, setShowCredsPanel] = useState(false);

  const log = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runTest = async (mode: 'all' | 'stun' | 'turn' = 'all') => {
    setIsTesting(true);
    setLogs([]);
    setCandidates([]);
    
    try {
      log(`Starting diagnostic test [Mode: ${mode.toUpperCase()}]...`);
      
      let filteredServers: any[] = [];
      
      if (useCustomCreds) {
        log(`Using custom client-side credentials override...`);
        // Add STUN servers if testing all or stun
        if (mode === 'all' || mode === 'stun') {
          filteredServers.push({ urls: 'stun:stun.l.google.com:19302' });
          filteredServers.push({ urls: 'stun:stun1.l.google.com:19302' });
          filteredServers.push({ urls: 'stun:stun2.l.google.com:19302' });
          filteredServers.push({ urls: 'stun:stun3.l.google.com:19302' });
          filteredServers.push({ urls: 'stun:stun4.l.google.com:19302' });
        }
        
        // Add custom TURN server if testing all or turn
        if (mode === 'all' || mode === 'turn') {
          let url = customUrl;
          if (url && !url.startsWith('turn:') && !url.startsWith('stun:') && !url.startsWith('turns:')) {
            url = `turn:${url}`;
          }
          filteredServers.push({
            urls: url,
            username: customUsername,
            credential: customPassword
          });
          filteredServers.push({
            urls: url.includes('?') ? `${url}&transport=tcp` : `${url}?transport=tcp`,
            username: customUsername,
            credential: customPassword
          });
        }
        log(`Configured ${filteredServers.length} servers manually`);
      } else {
        log('Fetching ICE configuration from server...');
        const iceServers = await webrtcService.getIceServers();
        log(`Retrieved ${iceServers.length} ICE server configs`);
        
        filteredServers = [...iceServers];
        if (mode === 'stun') {
          filteredServers = iceServers.map((server: any) => {
            const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
            const stunUrls = urls.filter((u: string) => u.startsWith('stun:'));
            if (stunUrls.length > 0) {
              return { urls: stunUrls };
            }
            return null;
          }).filter((s: any) => s !== null);
          log(`[Filter] STUN servers only mode. Servers: ${filteredServers.length}`);
        } else if (mode === 'turn') {
          filteredServers = iceServers.map((server: any) => {
            const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
            const turnUrls = urls.filter((u: string) => u.startsWith('turn:') || u.startsWith('turns:'));
            if (turnUrls.length > 0) {
              return { 
                ...server, 
                urls: turnUrls 
              };
            }
            return null;
          }).filter((s: any) => s !== null);
          log(`[Filter] TURN servers only mode. Servers: ${filteredServers.length}`);
        }
      }

      // Log configuration details for diagnostics
      filteredServers.forEach((server: any, idx: number) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        const isTurn = urls.some((u: string) => u.startsWith('turn:') || u.startsWith('turns:'));
        if (isTurn) {
          log(`[CONFIG] Server ${idx + 1} (TURN): ${urls.join(', ')} | Auth Username: '${server.username || ''}'`);
        } else {
          log(`[CONFIG] Server ${idx + 1} (STUN): ${urls.join(', ')}`);
        }
      });
      
      const pc = new RTCPeerConnection({
        iceServers: filteredServers,
        iceTransportPolicy: mode === 'turn' ? 'relay' : 'all'
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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Icon name="network_check" className="text-primary" />
            WebRTC Connectivity Diagnostics
          </h3>
          <p className="text-sm text-slate-400">Perform a real-time STUN/TURN gathering test to debug relay issues.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            onClick={() => runTest('all')} 
            disabled={isTesting} 
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {isTesting ? 'Testing...' : 'Full Test'}
          </Button>
          <Button 
            onClick={() => runTest('stun')} 
            disabled={isTesting} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
          >
            STUN Only
          </Button>
          <Button 
            onClick={() => runTest('turn')} 
            disabled={isTesting} 
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
          >
            TURN Only
          </Button>
        </div>
      </div>

      {/* Custom Credentials override section */}
      <div className="mb-6 bg-slate-950/50 border border-slate-800/80 rounded-xl p-4">
        <button 
          onClick={() => setShowCredsPanel(!showCredsPanel)}
          className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white transition-colors w-full text-left"
        >
          <Icon name={showCredsPanel ? "expand_less" : "expand_more"} className="text-primary" />
          <span>Advanced: Client-side Credentials Override</span>
          {useCustomCreds && (
            <span className="ml-2 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[9px] rounded font-bold uppercase">
              Override Active
            </span>
          )}
        </button>
        
        {showCredsPanel && (
          <div className="mt-4 space-y-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="useCustom"
                checked={useCustomCreds}
                onChange={(e) => setUseCustomCreds(e.target.checked)}
                className="rounded border-slate-700 text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="useCustom" className="text-xs font-medium text-slate-300 cursor-pointer">
                Enable local custom credentials (bypasses server config)
              </label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                  TURN Server URL
                </label>
                <input 
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  disabled={!useCustomCreds}
                  placeholder="e.g. turn:free.expressturn.com:3478"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                  Auth Username
                </label>
                <input 
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  disabled={!useCustomCreds}
                  placeholder="Username"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                  Auth Password
                </label>
                <input 
                  type="text"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  disabled={!useCustomCreds}
                  placeholder="Password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary disabled:opacity-40"
                />
              </div>
            </div>
            
            <div className="pt-2">
              <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
                Quick Typo Correction Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => {
                    setCustomPassword('tSlm3kXJjgjn59xHqOmR8TvGo+4=');
                    setUseCustomCreds(true);
                    log(`Applied lowercase 'l' variant password: tSlm3kXJjgjn59xHqOmR8TvGo+4=`);
                  }}
                  disabled={!useCustomCreds}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] py-1 px-2.5 rounded border border-slate-700 disabled:opacity-30 w-auto h-auto min-h-0"
                >
                  Use Lowercase 'l'
                </Button>
                <Button 
                  onClick={() => {
                    setCustomPassword('tSIm3kXJjgjn59xHqOmR8TvGo+4=');
                    setUseCustomCreds(true);
                    log(`Applied uppercase 'I' variant password: tSIm3kXJjgjn59xHqOmR8TvGo+4=`);
                  }}
                  disabled={!useCustomCreds}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] py-1 px-2.5 rounded border border-slate-700 disabled:opacity-30 w-auto h-auto min-h-0"
                >
                  Use Uppercase 'I'
                </Button>
                <Button 
                  onClick={() => {
                    setCustomPassword('tS1m3kXJjgjn59xHqOmR8TvGo+4=');
                    setUseCustomCreds(true);
                    log(`Applied number '1' variant password: tS1m3kXJjgjn59xHqOmR8TvGo+4=`);
                  }}
                  disabled={!useCustomCreds}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] py-1 px-2.5 rounded border border-slate-700 disabled:opacity-30 w-auto h-auto min-h-0"
                >
                  Use Number '1'
                </Button>
              </div>
            </div>
          </div>
        )}
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
