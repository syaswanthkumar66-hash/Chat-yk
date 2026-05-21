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
  SafeAreaView,
  Image,
  ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import io from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';

// Replace with your Render/Fly.io production URL or local network IP (e.g., http://192.168.1.X:8080)
const BACKEND_URL = 'http://192.168.1.100:8080'; 
const ROOM_ID = 'global-sync-room'; 

type Message = {
  messageId: string;
  senderId: string;
  message?: string;
  image?: string;
  timestamp: string;
  isMe?: boolean;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [socketId, setSocketId] = useState<string | null>(null);
  
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Request permissions
    (async () => {
      if (Platform.OS !== 'web') {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        await ImagePicker.requestCameraPermissionsAsync();
      }
    })();

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
      console.log('Got message:', data.message || 'Image received');
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

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      sendImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      sendImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const sendImage = (base64Image: string) => {
    const newMessage: Message = {
      messageId: Math.random().toString(36).substring(7),
      image: base64Image,
      senderId: socketId || 'unknown',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, { ...newMessage, isMe: true }]);

    socketRef.current.emit('send_message', {
      roomId: ROOM_ID,
      ...newMessage
    });
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.isMe;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && <Text style={styles.sender}>Web / User</Text>}
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.messageImage} />
        ) : (
          <Text style={[styles.messageText, isMe ? styles.myMessageText : null]}>
            {item.message}
          </Text>
        )}
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
        style={styles.keyboardView}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.iconButton} onPress={pickImage}>
             <Text style={styles.iconText}>📁</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={takePhoto}>
             <Text style={styles.iconText}>📷</Text>
          </TouchableOpacity>
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
        </View>
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
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  keyboardView: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center'
  },
  iconButton: {
    marginRight: 10,
    padding: 4,
  },
  iconText: {
    fontSize: 20,
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
