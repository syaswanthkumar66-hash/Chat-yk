import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { Button, Icon, Avatar } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, doc, getDoc, setDoc } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';

const TAKEN_USERNAMES = ['sarah_c', 'admin', 'system', 'root'];

const PRELOADED_AVATARS = [
  'https://picsum.photos/seed/avatar1/200',
  'https://picsum.photos/seed/avatar2/200',
  'https://picsum.photos/seed/avatar3/200',
  'https://picsum.photos/seed/avatar4/200',
  'https://picsum.photos/seed/avatar5/200',
  'https://picsum.photos/seed/avatar6/200',
];

export const Onboarding = () => {
  const { login } = useAppStore();
  const [step, setStep] = useState<'login' | 'profile'>('login');
  const [profile, setProfile] = useState({
    username: '',
    displayName: '',
    avatar: `https://picsum.photos/seed/${Math.random()}/200`,
    description: ''
  });
  const [error, setError] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected'>('connecting');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background backend server warm-up on mount
  useEffect(() => {
    let isMounted = true;
    const targetUrl = BACKEND_URL || window.location.origin;
    
    const pingBackend = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        
        await fetch(`${targetUrl}/api/health`, {
          signal: controller.signal,
          mode: 'no-cors',
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        
        if (isMounted) {
          setBackendStatus('connected');
          console.log("Onboarding: Secure backend gateway pre-warmed.");
        }
      } catch (err) {
        if (isMounted) {
          setBackendStatus('connecting');
          // Retry to warm it up
          setTimeout(pingBackend, 3000);
        }
      }
    };

    pingBackend();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Firebase redirect results cleanly on mount
  useEffect(() => {
    setIsLoading(true);
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          const user = result.user;
          try {
            const token = await user.getIdToken();
            await fetch(`${BACKEND_URL}/api/auth/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token })
            });
          } catch (e) {
            console.warn('Backend API notification failed', e);
          }
          
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            login({
              id: user.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate
            });
          } else {
            setProfile(prev => ({
              ...prev,
              displayName: user.displayName || '',
              avatar: user.photoURL || prev.avatar
            }));
            setStep('profile');
          }
        }
      })
      .catch((err: any) => {
        console.error("Redirect error: ", err);
        if (err.code === 'auth/unauthorized-domain') {
          setError('This domain is not authorized for Firebase Auth. Please add your Vercel domain to Firebase Console > Authentication > Settings > Authorized Domains.');
        } else {
          setError(err.message || 'Failed to complete Google login.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [login]);

  // Handle active sessions reactively
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setIsLoading(true);
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            login({
              id: firebaseUser.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate
            });
          } else {
            setProfile(prev => ({
              ...prev,
              displayName: firebaseUser.displayName || '',
              avatar: firebaseUser.photoURL || prev.avatar
            }));
            setStep('profile');
          }
        } catch (err) {
          console.error("Error in onboarding auto-sync:", err);
        } finally {
          setIsLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, [login]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      try {
        const token = await user.getIdToken();
        await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch (e) {
        console.warn('Backend API notification failed', e);
      }
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        login({
          id: user.uid,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar,
          description: userData.description,
          isAdmin: userData.isAdmin,
          joinDate: userData.joinDate
        });
      } else {
        setProfile(prev => ({
          ...prev,
          displayName: user.displayName || '',
          avatar: user.photoURL || prev.avatar
        }));
        setStep('profile');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError('URGENT: This domain is not authorized. You MUST add your current domain url to Firebase Console > Authentication > Settings > Authorized Domains for Google Login to work.');
      } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        console.log("Popup blocked, falling back to redirect...");
        const provider = new GoogleAuthProvider();
        signInWithRedirect(auth, provider).catch(redirectErr => {
           setError('Popup and redirect blocked. Please use a standard browser like Safari/Chrome.');
        });
      } else {
        setError(err.message || 'Failed to login with Google');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!profile.username || !profile.displayName) {
      setError('Please fill in all required fields');
      return;
    }
    if (TAKEN_USERNAMES.includes(profile.username.toLowerCase())) {
      setError('Username is already taken');
      return;
    }
    
    if (!auth.currentUser) {
      setError('Not authenticated');
      return;
    }
    
    try {
      setIsLoading(true);
      setError('');
      const userData = {
        id: auth.currentUser.uid,
        email: auth.currentUser.email,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
        description: profile.description,
        isAdmin: auth.currentUser.email === 'admin@protocol.net' || auth.currentUser.email === 'syaswanthkumar66@gmail.com',
        joinDate: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', auth.currentUser.uid), userData);
      
      login(userData);
    } catch (err: any) {
      console.error(err);
      setError('Failed to setup profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarSelect = (url: string) => {
    setProfile(prev => ({ ...prev, avatar: url }));
    setShowAvatarPicker(false);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => ({ ...prev, avatar: reader.result as string }));
        setShowAvatarPicker(false);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-6 bg-bg-light relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 size-64 md:size-96 bg-primary/10 blur-[80px] md:blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -right-24 size-64 md:size-96 bg-primary/5 blur-[80px] md:blur-[100px] rounded-full" />
      </div>

      {/* Network Connection Badge */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-md border border-slate-100 px-3 py-1.5 rounded-full shadow-sm">
        <div className={`size-2 rounded-full ${
          backendStatus === 'connected' 
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' 
            : 'bg-amber-500 animate-pulse'
        }`} />
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 select-none">
          {backendStatus === 'connected' ? 'Secure Gateway Active' : 'Connecting to Gateway...'}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {step === 'login' ? (
          <motion.div 
            key="login"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-6 md:space-y-8">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="size-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 rotate-3">
                  <Icon name="share_reviews" className="text-3xl" fill />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">Connect</h2>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1.5">Private Digital Ecosystem</p>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 p-3 rounded-xl border border-red-100"
                >
                  <p className="text-[8px] text-red-500 font-black uppercase tracking-widest text-center">
                    {error}
                  </p>
                </motion.div>
              )}

              <div className="space-y-6">
                <p className="text-slate-500 text-xs text-center font-medium leading-relaxed px-2">
                  Authorize via Social Cloud backend for real-time encrypted communication with the global developer network.
                </p>
                <Button 
                  onClick={handleGoogleLogin} 
                  disabled={isLoading}
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest italic text-xs shadow-xl shadow-primary/20"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <>
                      <Icon name="mail" className="text-lg mr-2" />
                      Continue with Google
                    </>
                  )}
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-50 text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300">Secured by Social Cloud Protocol</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="profile"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="bg-white p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-6 md:space-y-8">
              <div className="text-center space-y-2 md:space-y-3">
                <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-slate-900 uppercase italic">Setup Identity</h2>
                <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Define your digital presence</p>
              </div>

              <div className="flex flex-col items-center gap-4 md:gap-6">
                <div 
                  className="relative group cursor-pointer" 
                  onClick={() => !isLoading && setShowAvatarPicker(true)}
                >
                  <div className="size-24 md:size-32 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden ring-4 md:ring-8 ring-white shadow-inner">
                    <Avatar src={profile.avatar} className="size-full" />
                  </div>
                  <div className="absolute inset-0 bg-primary/20 rounded-[2rem] md:rounded-[2.5rem] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all backdrop-blur-[2px]">
                    <Icon name="edit" className="text-white text-2xl md:text-3xl" />
                  </div>
                  <button 
                    disabled={isLoading}
                    className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 size-8 md:size-10 rounded-xl md:rounded-2xl bg-primary text-white border-2 md:border-4 border-white flex items-center justify-center shadow-xl disabled:opacity-50"
                  >
                    <Icon name="edit" className="text-sm md:text-lg" />
                  </button>
                </div>
                <p className="text-[8px] md:text-[9px] font-black text-primary uppercase tracking-[0.2em] animate-pulse">Tap to change avatar</p>
              </div>

              <div className="space-y-4 md:space-y-5">
                <div className="space-y-1 md:space-y-2">
                  <label className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Backend Team Identity</label>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    value={profile.displayName}
                    disabled={isLoading}
                    onChange={(e) => {
                      setProfile(prev => ({ ...prev, displayName: e.target.value }));
                      setError('');
                    }}
                    className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-xs md:text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300 disabled:opacity-50 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1 md:space-y-2">
                  <label className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Unique User ID</label>
                  <div className="relative">
                    <span className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-300 font-black italic text-xs md:text-sm">@</span>
                    <input 
                      type="text" 
                      placeholder="username"
                      value={profile.username}
                      disabled={isLoading}
                      onChange={(e) => {
                        setProfile(prev => ({ ...prev, username: e.target.value.replace(/\s+/g, '_').toLowerCase() }));
                        setError('');
                      }}
                      className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl pl-8 md:pl-10 pr-4 md:pr-5 py-3 md:py-4 text-xs md:text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300 disabled:opacity-50 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div className="space-y-1 md:space-y-2">
                  <label className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Backend Team Bio</label>
                  <textarea 
                    placeholder="Tell us about yourself..."
                    value={profile.description}
                    disabled={isLoading}
                    onChange={(e) => setProfile(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-xs md:text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none h-20 md:h-28 placeholder:text-slate-300 disabled:opacity-50 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 p-2 md:p-3 rounded-xl border border-red-100"
                >
                  <p className="text-[8px] md:text-[10px] text-red-500 font-black uppercase tracking-widest text-center">
                    {error}
                  </p>
                </motion.div>
              )}

              <Button 
                onClick={handleComplete} 
                disabled={isLoading}
                className="w-full h-14 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-widest italic text-xs md:text-sm shadow-xl shadow-primary/20"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Configuring Identity...</span>
                  </div>
                ) : (
                  <span>Complete Setup</span>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar Picker Modal */}
      <AnimatePresence>
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isLoading && setShowAvatarPicker(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 gap-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight italic">Choose Avatar</h3>
                <button 
                  disabled={isLoading}
                  onClick={() => setShowAvatarPicker(false)} 
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {PRELOADED_AVATARS.map((url) => (
                  <button 
                    key={`avatar-choice-${url}`} 
                    disabled={isLoading}
                    onClick={() => handleAvatarSelect(url)}
                    className="aspect-square rounded-2xl overflow-hidden border-2 border-transparent hover:border-primary transition-all active:scale-95 disabled:opacity-50"
                  >
                    <img src={url} className="size-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
                <button 
                  disabled={isLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-2 text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                >
                  <Icon name="upload" />
                  <span className="text-[10px] font-bold uppercase">Upload</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                  />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
