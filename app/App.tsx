import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  SafeAreaView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import io from 'socket.io-client';

// Replace with your Render/Fly.io production URL once deployed
const BACKEND_URL = 'http://localhost:8080'; 
const ROOM_ID = 'global-sync-room'; 

type Message = {
  messageId: string;
  senderId: string;
  message: string;
  timestamp: string;
  isMe?: boolean;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [socketId, setSocketId] = useState<string | null>(null);
  
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Socket Connection
    socketRef.current = io(BACKEND_URL, {
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to backend API', socketRef.current.id);
      setSocketId(socketRef.current.id);
      
      // Join the global room for syncing with Web
      socketRef.current.emit('join_room', ROOM_ID);
    });

    // Listen for incoming messages from Web / other Mobile apps
    socketRef.current.on('receive_message', (data: Message) => {
      console.log('Got message:', data);
      setMessages((prev) => [...prev, { ...data, isMe: false }]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const newMessage: Message = {
      messageId: Math.random().toString(36).substring(7),
      message: inputText,
      senderId: socketId || 'unknown',
      timestamp: new Date().toISOString(),
    };

    // Optimistically update UI
    setMessages((prev) => [...prev, { ...newMessage, isMe: true }]);

    // Emit to backend
    socketRef.current.emit('send_message', {
      roomId: ROOM_ID,
      ...newMessage
    });

    setInputText('');
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.isMe;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && <Text style={styles.sender}>Web / User</Text>}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : null]}>{item.message}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Realtime App Sync 🎉</Text>
        <Text style={styles.headerSub}>{socketId ? 'Connected' : 'Connecting...'}</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.messageId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  myMessage: {
    backgroundColor: '#3B82F6',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  sender: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#1F2937',
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
