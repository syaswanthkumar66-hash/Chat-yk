import { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { Send, Upload, Camera } from 'lucide-react';

const BACKEND_URL = 'http://localhost:8080'; // Replace with Render/Fly.io URL in production
const ROOM_ID = 'global-sync-room';

interface Message {
  messageId: string;
  senderId: string;
  message?: string;
  image?: string;
  timestamp: string;
  isMe?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [socketId, setSocketId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    socketRef.current = io(BACKEND_URL, {
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to backend API', socketRef.current?.id);
      setIsConnected(true);
      setSocketId(socketRef.current?.id || null);
      socketRef.current?.emit('join_room', ROOM_ID);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current.on('receive_message', (data: Message) => {
      setMessages((prev) => [...prev, { ...data, isMe: false }]);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const newMessage: Message = {
      messageId: Math.random().toString(36).substring(7),
      message: inputText,
      senderId: socketId || 'unknown',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, { ...newMessage, isMe: true }]);

    socketRef.current?.emit('send_message', {
      roomId: ROOM_ID,
      ...newMessage
    });

    setInputText('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      
      const newMessage: Message = {
        messageId: Math.random().toString(36).substring(7),
        image: base64String,
        senderId: socketId || 'unknown',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, { ...newMessage, isMe: true }]);

      socketRef.current?.emit('send_message', {
        roomId: ROOM_ID,
        ...newMessage
      });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Web & App Sync Chat</h1>
          <p className="text-sm text-gray-500">
            {isConnected ? '🟢 Online - Synced with Mobile App' : '🔴 Disconnected'}
          </p>
        </div>
        <div className="text-sm font-mono text-gray-400">
          ID: {socketId || '...'}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.messageId}
            className={`flex flex-col max-w-md ${msg.isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
          >
            <span className="text-xs text-gray-400 mb-1 px-1">
              {msg.isMe ? 'You (Web)' : 'App / Other User'}
            </span>
            <div
              className={`px-4 py-2 rounded-2xl shadow-sm text-sm ${
                msg.isMe 
                  ? 'bg-blue-600 text-white rounded-br-sm' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.image ? (
                <img src={msg.image} alt="Uploaded" className="max-w-full rounded-lg" />
              ) : (
                msg.message
              )}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-white border-t border-gray-200 p-4">
        <form onSubmit={sendMessage} className="flex items-center gap-3 max-w-4xl mx-auto">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleImageUpload}
          />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0" 
            title="Upload File / Image"
          >
            <Upload size={20} />
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message or share a photo..."
              className="w-full px-4 py-3 bg-gray-100 border-transparent rounded-full focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex items-center justify-center p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send size={20} />
          </button>
        </form>
      </footer>
    </div>
  );
}
