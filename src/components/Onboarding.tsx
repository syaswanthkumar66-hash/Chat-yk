import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { useAppStore } from '../store';
import { BACKEND_URL } from '../config';
import { Button, Icon, Avatar, Card } from './UI';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, doc, getDoc, setDoc } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
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
      });
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setError('');
      const provider = new GoogleAuthProvider();
      // Always try popup first, it works well on desktop and most Vercel deployments
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
      
      // Check if user exists in Firestore
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
        // New user, move to profile setup step
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
        // Automatically fallback to redirect when popups are blocked 
        console.log("Popup blocked, falling back to redirect...");
        const provider = new GoogleAuthProvider();
        signInWithRedirect(auth, provider).catch(redirectErr => {
           setError('Popup and redirect blocked. Please use a standard browser like Safari/Chrome.');
        });
      } else {
        setError(err.message || 'Failed to login with Google');
      }
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
                <Button onClick={handleGoogleLogin} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest italic text-xs shadow-xl shadow-primary/20">
                  <Icon name="mail" className="text-lg mr-2" />
                  Continue with Google
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-50 text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300">Secured by Social Cloud Protocol</p>
              </div>
            </div>
            
            <div className="mt-6 text-center" />
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
                <div className="relative group cursor-pointer" onClick={() => setShowAvatarPicker(true)}>
                  <div className="size-24 md:size-32 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden ring-4 md:ring-8 ring-white shadow-inner">
                    <Avatar src={profile.avatar} className="size-full" />
                  </div>
                  <div className="absolute inset-0 bg-primary/20 rounded-[2rem] md:rounded-[2.5rem] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all backdrop-blur-[2px]">
                    <Icon name="edit" className="text-white text-2xl md:text-3xl" />
                  </div>
                  <button className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 size-8 md:size-10 rounded-xl md:rounded-2xl bg-primary text-white border-2 md:border-4 border-white flex items-center justify-center shadow-xl">
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
                    onChange={(e) => {
                      setProfile(prev => ({ ...prev, displayName: e.target.value }));
                      setError('');
                    }}
                    className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-xs md:text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300"
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
                      onChange={(e) => {
                        setProfile(prev => ({ ...prev, username: e.target.value.replace(/\s+/g, '_').toLowerCase() }));
                        setError('');
                      }}
                      className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl pl-8 md:pl-10 pr-4 md:pr-5 py-3 md:py-4 text-xs md:text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div className="space-y-1 md:space-y-2">
                  <label className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Backend Team Bio</label>
                  <textarea 
                    placeholder="Tell us about yourself..."
                    value={profile.description}
                    onChange={(e) => setProfile(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-white border border-primary/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-xs md:text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none h-20 md:h-28 placeholder:text-slate-300"
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

              <Button onClick={handleComplete} className="w-full h-14 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-widest italic text-xs md:text-sm shadow-xl shadow-primary/20">
                Complete Setup
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
              onClick={() => setShowAvatarPicker(false)}
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
                <button onClick={() => setShowAvatarPicker(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="close" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {PRELOADED_AVATARS.map((url) => (
                  <button 
                    key={`avatar-choice-${url}`} 
                    onClick={() => handleAvatarSelect(url)}
                    className="aspect-square rounded-2xl overflow-hidden border-2 border-transparent hover:border-primary transition-all active:scale-95"
                  >
                    <img src={url} className="size-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-2 text-primary hover:bg-primary/5 transition-all"
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
