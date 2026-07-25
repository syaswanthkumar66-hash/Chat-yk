import React, { useState, useEffect } from 'react';
import { Card, Button, Icon } from './UI';
import { webrtcService } from '../services/webrtcService';

export const WebRTCConnectivityTester = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [candidates, setCandidates] = useState<{ type: string; protocol: string; foundation: string; url?: string }[]>([]);

  // Custom credentials override state
  const [customUrl, setCustomUrl] = useState('turn:free.expressturn.com:3478');
  const [customUsername, setCustomUsername] = useState('000000002100245221');
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

      let gatheredRelays = 0;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const c = event.candidate;
          if (c.type === 'relay') {
            gatheredRelays++;
            log(`✅ [TURN SUCCESS] Relay candidate gathered: ${c.type} (${c.protocol}) via ${c.relatedAddress || 'TURN relay'}`);
          } else {
            log(`Candidate gathered: ${c.type} (${c.protocol}) via ${c.relatedAddress || 'local'}`);
          }
          setCandidates(prev => [...prev, {
            type: c.type,
            protocol: c.protocol,
            foundation: c.foundation,
            url: c.relatedAddress
          }]);
        } else {
          log('ICE gathering completed.');
          if (mode === 'turn' || mode === 'all') {
            if (gatheredRelays > 0) {
              log(`🎉 [PASSED] TURN server verified! Gathered ${gatheredRelays} active relay candidate(s).`);
            } else if (mode === 'turn') {
              log(`⚠️ [WARNING] No relay candidates were gathered. Check username/password or firewall settings.`);
            }
          }
          pc.close();
          setIsTesting(false);
        }
      };

      pc.onicecandidateerror = (event: any) => {
        const errUrl = event.url || '';
        if (errUrl.includes('transport=tcp')) {
          log(`[INFO] Probe note: ${event.errorText} (${event.errorCode}) on ${errUrl} - ExpressTURN standard transport is UDP on 3478.`);
        } else if (errUrl.includes('stun:free.expressturn.com')) {
          log(`[INFO] Probe note: ${event.errorText} (${event.errorCode}) on ${errUrl} - STUN bindings use Google STUN servers.`);
        } else {
          log(`[ICE ERROR] URL: ${errUrl} Error text: ${event.errorText}. Code: ${event.errorCode}`);
        }
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

export const Admin1On1CallTester = () => {
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [pingCount, setPingCount] = useState(0);
  const [pongCount, setPongCount] = useState(0);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [audioActive, setAudioActive] = useState(false);
  const [isLoopingPing, setIsLoopingPing] = useState(false);

  const pc1Ref = React.useRef<RTCPeerConnection | null>(null);
  const pc2Ref = React.useRef<RTCPeerConnection | null>(null);
  const dc1Ref = React.useRef<RTCDataChannel | null>(null);
  const pingIntervalRef = React.useRef<any>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);

  const logTest = (msg: string) => {
    setTestLogs(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const startTestCall = async () => {
    try {
      setCallStatus('connecting');
      setTestLogs([]);
      setPingCount(0);
      setPongCount(0);
      setLastLatency(null);

      logTest('Initiating 1-on-1 WebRTC connection test...');

      const pc1 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const pc2 = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

      pc1Ref.current = pc1;
      pc2Ref.current = pc2;

      // ICE candidate exchange
      pc1.onicecandidate = (e) => {
        if (e.candidate) pc2.addIceCandidate(e.candidate).catch(console.error);
      };
      pc2.onicecandidate = (e) => {
        if (e.candidate) pc1.addIceCandidate(e.candidate).catch(console.error);
      };

      // DataChannel setup
      const dc1 = pc1.createDataChannel('ping_data_channel');
      dc1Ref.current = dc1;

      dc1.onopen = () => {
        logTest('DataChannel opened successfully! Connection established.');
        setCallStatus('connected');
      };

      dc1.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'pong') {
            const rtt = Date.now() - data.sentAt;
            setPongCount(prev => prev + 1);
            setLastLatency(rtt);
            logTest(`Received PONG response #${data.id} (RTT: ${rtt}ms)`);
          }
        } catch (err) {
          logTest(`DataChannel message received: ${e.data}`);
        }
      };

      pc2.ondatachannel = (e) => {
        const dc2 = e.channel;
        dc2.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.type === 'ping') {
              logTest(`Peer B received PING #${data.id}. Sending PONG reply...`);
              dc2.send(JSON.stringify({ type: 'pong', id: data.id, sentAt: data.sentAt }));
            }
          } catch (err) {
            console.error('DataChannel error on Peer B:', err);
          }
        };
      };

      // Audio stream setup for test listening/sending
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();

        dest.stream.getAudioTracks().forEach(track => {
          pc1.addTrack(track, dest.stream);
        });

        pc2.ontrack = (evt) => {
          logTest(`Peer B received audio stream track: kind=${evt.track.kind}, ID=${evt.track.id}`);
          if (audioElRef.current) {
            audioElRef.current.srcObject = evt.streams[0];
            audioElRef.current.play().catch(console.warn);
          }
        };
      }

      // SDP Offer / Answer exchange
      const offer = await pc1.createOffer();
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);

      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);

      logTest('SDP Offer/Answer exchange completed successfully.');
    } catch (err: any) {
      logTest(`Failed to establish test call: ${err.message || String(err)}`);
      setCallStatus('error');
    }
  };

  const sendPing = () => {
    if (!dc1Ref.current || dc1Ref.current.readyState !== 'open') {
      logTest('Cannot send ping: DataChannel is not open.');
      return;
    }
    const id = pingCount + 1;
    setPingCount(id);
    const payload = JSON.stringify({ type: 'ping', id, sentAt: Date.now() });
    dc1Ref.current.send(payload);
    logTest(`Sent PING #${id} to Peer B`);
  };

  const playRandomSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const frequencies = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C E G C E G
      const randomFreq = frequencies[Math.floor(Math.random() * frequencies.length)];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(randomFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(randomFreq / 2, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);

      setAudioActive(true);
      setTimeout(() => setAudioActive(false), 500);
      logTest(`Played random test sound wave (${Math.round(randomFreq)} Hz)`);
    } catch (e: any) {
      logTest(`Failed to play test sound: ${e.message}`);
    }
  };

  const toggleLoopingPing = () => {
    if (isLoopingPing) {
      clearInterval(pingIntervalRef.current);
      setIsLoopingPing(false);
      logTest('Stopped auto ping loop.');
    } else {
      setIsLoopingPing(true);
      sendPing();
      pingIntervalRef.current = setInterval(() => {
        sendPing();
      }, 1500);
      logTest('Started continuous ping loop (1s interval).');
    }
  };

  const stopTestCall = () => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (dc1Ref.current) dc1Ref.current.close();
    if (pc1Ref.current) pc1Ref.current.close();
    if (pc2Ref.current) pc2Ref.current.close();
    if (audioCtxRef.current) audioCtxRef.current.close().catch(console.warn);

    setCallStatus('idle');
    setIsLoopingPing(false);
    logTest('Stopped test call session and cleaned up WebRTC instances.');
  };

  return (
    <Card className="p-6 bg-slate-900 border-slate-800 border overflow-hidden space-y-6">
      <audio ref={audioElRef} autoPlay playsInline className="hidden" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Icon name="phone_in_talk" className="text-emerald-400 animate-pulse" />
            1-on-1 Admin Test Call & Audio Loopback
          </h3>
          <p className="text-xs text-slate-400">
            Establish two 1-on-1 WebRTC connections, send Ping data packets, and play random test sounds to verify sending/listening.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {callStatus === 'idle' ? (
            <Button
              onClick={startTestCall}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl px-5 py-2.5 text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/20"
            >
              Start 1-on-1 Test Call
            </Button>
          ) : (
            <Button
              onClick={stopTestCall}
              className="bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl px-5 py-2.5 text-xs uppercase tracking-widest shadow-lg shadow-red-600/20"
            >
              End Call Test
            </Button>
          )}
        </div>
      </div>

      {callStatus !== 'idle' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Connection</span>
            <span className={`text-xs font-black uppercase tracking-wider ${callStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`}>
              {callStatus}
            </span>
          </div>

          <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Pings Sent</span>
            <span className="text-sm font-mono font-bold text-white">{pingCount}</span>
          </div>

          <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Pongs Received</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{pongCount}</span>
          </div>

          <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">RTT Latency</span>
            <span className="text-sm font-mono font-bold text-cyan-400">{lastLatency !== null ? `${lastLatency} ms` : '--'}</span>
          </div>
        </div>
      )}

      {callStatus === 'connected' && (
        <div className="flex flex-wrap items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5">
          <Button
            onClick={sendPing}
            className="bg-primary hover:bg-primary-hover text-white font-black text-xs uppercase tracking-widest py-2.5 px-4 rounded-xl"
          >
            Send Data Ping
          </Button>

          <Button
            onClick={toggleLoopingPing}
            className={`font-black text-xs uppercase tracking-widest py-2.5 px-4 rounded-xl ${isLoopingPing ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
          >
            {isLoopingPing ? 'Pause Auto Ping' : 'Loop Ping (1s)'}
          </Button>

          <Button
            onClick={playRandomSound}
            className={`font-black text-xs uppercase tracking-widest py-2.5 px-4 rounded-xl ${audioActive ? 'bg-emerald-500 text-white animate-bounce' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            Play Random Sound
          </Button>
        </div>
      )}

      <div className="bg-black/60 rounded-xl p-4 border border-white/5 font-mono text-[10px] sm:text-xs text-emerald-400 h-48 overflow-y-auto">
        {testLogs.length === 0 ? (
          <div className="text-slate-500 italic flex h-full items-center justify-center">Click "Start 1-on-1 Test Call" to begin diagnostics...</div>
        ) : (
          testLogs.map((logMsg, idx) => <div key={idx} className="mb-1 leading-tight">{logMsg}</div>)
        )}
      </div>
    </Card>
  );
};

