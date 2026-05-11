'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { chatAPI } from '@/utils/api';
import { useIsAuthenticated, useUser } from '@/context/authStore';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function MessagesPage() {
  const router = useRouter();
  const isAuth = useIsAuthenticated();
  const user = useUser();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAuth) { router.push('/login'); return; }
    initSocket();
    // X2: if URL has ?guide=X&listing=Y, auto-create or open that conversation
    const guideParam = searchParams.get('guide');
    const listingParam = searchParams.get('listing');
    const init = async () => {
      try {
        if (guideParam && listingParam) {
          // Try to create (server returns existing if it already exists due to UNIQUE constraint check)
          const { data } = await chatAPI.createConversation({
            guide_user_id: guideParam,
            listing_id: listingParam,
          });
          // Refetch list, then open the new/existing conversation
          await fetchConversations();
          if (data?.id || data?.conversation?.id) {
            const convId = data.id || data.conversation.id;
            // Find it in the list and select it
            setTimeout(() => {
              setConversations((convs) => {
                const found = convs.find((c) => c.id === convId);
                if (found) setActiveConv(found);
                return convs;
              });
            }, 100);
          }
          // Clean the URL so a refresh doesn't try to recreate
          window.history.replaceState({}, '', '/messages');
        } else {
          await fetchConversations();
        }
      } catch (err) {
        toast.error('Could not start conversation');
        await fetchConversations();
      }
    };
    init();
    return () => { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } };
  }, [isAuth]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeConvIdRef = useRef(null);
  // Keep the ref in sync so socket listeners can read the current value without re-registering
  useEffect(() => { activeConvIdRef.current = activeConv?.id || null; }, [activeConv]);

  const initSocket = () => {
    const token = localStorage.getItem('bl_token');
    // The API URL env var includes /api at the end; strip it for the socket connection
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const socketUrl = apiUrl.replace(/\/api\/?$/, '');
    socketRef.current = io(socketUrl, { auth: { token } });

    socketRef.current.on('new_message', (msg) => {
      // Only append if it belongs to the conversation the user is currently viewing.
      // This prevents stale messages from leaking across conversations after switching.
      if (msg.conversation_id !== activeConvIdRef.current) return;
      setMessages((prev) => [...prev, msg]);
    });
    socketRef.current.on('user_typing', () => {
      setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    });
  };

  const fetchConversations = async () => {
    try {
      const { data } = await chatAPI.getConversations();
      setConversations(data.conversations || data || []);
    } catch {
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (conv) => {
    setActiveConv(conv);
    if (socketRef.current && activeConv) socketRef.current.emit('leave_conversation', activeConv.id);
    socketRef.current?.emit('join_conversation', conv.id);
    try {
      const { data } = await chatAPI.getMessages(conv.id);
      setMessages(data.messages || data || []);
    } catch {
      toast.error('Failed to load messages');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      socketRef.current?.emit('send_message', { conversation_id: activeConv.id, content: newMessage.trim() });
      setNewMessage('');
    } catch {
      toast.error('Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    socketRef.current?.emit('typing', { conversation_id: activeConv?.id });
  };

  const getOtherPerson = (conv) => {
    if (!user) return { name: '...', avatar: null };
    return user.role === 'guide'
      ? { name: (conv.traveler_first || '') + ' ' + (conv.traveler_last || ''), avatar: conv.traveler_avatar }
      : { name: (conv.guide_first || '') + ' ' + (conv.guide_last || ''), avatar: conv.guide_avatar };
  };

  if (!isAuth) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={user?.role === 'guide' ? '/guide/dashboard' : '/dashboard'} className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="font-bold text-gray-900">Messages</span>
          </Link>
          <Link href={user?.role === 'guide' ? '/guide/dashboard' : '/dashboard'} className="text-sm text-gray-600 hover:text-brand-orange">
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-card overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
          <div className="flex h-full">
            {/* Sidebar */}
            <div className={`${activeConv ? "hidden sm:flex" : "flex"} w-full sm:w-80 border-r border-gray-100 flex-col`}>
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Conversations</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p className="text-3xl mb-2">💬</p>
                    <p className="text-sm">No conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const other = getOtherPerson(conv);
                    const isActive = activeConv?.id === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className={`w-full p-4 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${isActive ? 'bg-orange-50 border-l-2 border-l-brand-orange' : ''}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                          {other.avatar ? (
                            <img src={other.avatar} alt={other.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-brand-orange flex items-center justify-center text-white font-bold">
                              {other.name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{other.name}</p>
                          <p className="text-xs text-gray-500 truncate">{conv.listing_title}</p>
                        </div>
                        {conv.last_message_at && (
                          <span className="text-xs text-gray-400 flex-shrink-0">{format(new Date(conv.last_message_at), 'MMM d')}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chat area */}
            <div className={`${activeConv ? "flex" : "hidden sm:flex"} flex-1 flex-col`}>
              {!activeConv ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <p className="text-5xl mb-4">💬</p>
                    <p className="font-semibold text-gray-600">Select a conversation</p>
                    <p className="text-sm text-gray-400">Choose from the left to start chatting</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                    {(() => {
                      const other = getOtherPerson(activeConv);
                      return (
                        <>
                          <div className="w-9 h-9 rounded-full bg-brand-orange flex items-center justify-center text-white font-bold text-sm">
                            {other.name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{other.name}</p>
                            <p className="text-xs text-gray-500">{activeConv.listing_title}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.map((msg, i) => {
                      const isMe = msg.sender_id === user?.id;
                      return (
                        <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-brand-orange text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                            <p>{msg.content}</p>
                            <p className={`text-xs mt-1 ${isMe ? 'text-orange-100' : 'text-gray-400'}`}>
                              {msg.created_at ? format(new Date(msg.created_at), 'HH:mm') : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {typing && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm text-gray-500 italic">typing...</div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <form onSubmit={sendMessage} className="p-4 border-t border-gray-100 flex gap-2">
                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleTyping}
                      placeholder="Type a message..."
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-orange"
                    />
                    <button type="submit" disabled={sending || !newMessage.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
