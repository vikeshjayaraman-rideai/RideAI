// screens/GroupChatScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Image,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { getAuth } from '@react-native-firebase/auth';
import {
  getFirestore, collection, getDocs, query, orderBy,
} from '@react-native-firebase/firestore';
import {
  sendRideMessage, subscribeToRideChat, QUICK_MESSAGES,
  EMOJI_LIST, RideMessage,
} from '../services/rideChatService';

export default function GroupChatScreen({ route, navigation }: any) {
  const { tripId, tripTitle } = route.params;
  const currentUid = getAuth().currentUser?.uid || '';
  const chatListRef = useRef<FlatList>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RideMessage | null>(null);
  const [taggedRider, setTaggedRider] = useState<{ uid: string; name: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiders();
    unsubRef.current = subscribeToRideChat(tripId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: false }), 100);
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  const loadRiders = async () => {
    try {
      const db = getFirestore();
      const snap = await getDocs(collection(db, `trips/${tripId}/riderLocations`));
      setRiders(snap.docs.map(d => d.data()).filter((r: any) => r.uid !== currentUid));
    } catch {}
  };

  const handleSend = async () => {
    if (!chatInput.trim()) return;
    setSending(true);
    try {
      await sendRideMessage(tripId, chatInput.trim(), false, taggedRider?.uid, taggedRider?.name,
        replyTo ? { id: replyTo.id, senderName: replyTo.senderName, message: replyTo.message } : undefined);
      setChatInput('');
      setTaggedRider(null);
      setReplyTo(null);
      setShowEmoji(false);
    } catch {}
    setSending(false);
  };

  const handleSendQuick = async (text: string) => {
    setSending(true);
    try {
      await sendRideMessage(tripId, text, true, taggedRider?.uid, taggedRider?.name);
      setTaggedRider(null);
    } catch {}
    setSending(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{tripTitle}</Text>
          <Text style={s.headerSub}>Group Chat · {riders.length + 1} riders</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={item => item.id}
          style={s.messagesList}
          contentContainerStyle={s.messagesContent}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatIcon}>💬</Text>
              <Text style={s.emptyChatText}>No messages yet. Say hi to your group!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.senderUid === currentUid;
            const isAlert = (item as any).isAlert;
            if (isAlert) {
              return (
                <View style={s.alertMsg}>
                  <Text style={s.alertMsgText}>{item.message}</Text>
                </View>
              );
            }
            return (
              <TouchableOpacity
                style={[s.msgRow, isMine && s.msgRowMine]}
                onLongPress={() => setReplyTo(item)}
                activeOpacity={0.85}
              >
                {!isMine && (
                  item.senderPhoto
                    ? <Image source={{ uri: item.senderPhoto }} style={s.msgAvatar} />
                    : <View style={[s.msgAvatar, s.msgAvatarFallback]}>
                        <Text style={s.msgAvatarInitial}>{item.senderName?.charAt(0)}</Text>
                      </View>
                )}
                <View style={[s.msgBubble, isMine && s.msgBubbleMine]}>
                  {!isMine && <Text style={s.msgSender}>{item.senderName}</Text>}
                  {item.replyToMessage && (
                    <View style={s.replyPreviewBubble}>
                      <Text style={s.replyPreviewSender}>{item.replyToSender}</Text>
                      <Text style={s.replyPreviewText} numberOfLines={1}>{item.replyToMessage}</Text>
                    </View>
                  )}
                  {item.taggedName && <Text style={s.msgTag}>@{item.taggedName}</Text>}
                  <Text style={[s.msgText, isMine && s.msgTextMine]}>{item.message}</Text>
                  <View style={s.msgFooter}>
                    <Text style={[s.msgTime, isMine && s.msgTimeMine]}>{formatTime(item.createdAt)}</Text>
                    <TouchableOpacity onPress={() => setReplyTo(item)} style={s.replyBtn}>
                      <Text style={s.replyBtnText}>↩ Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Quick messages */}
      <View style={s.quickBar}>
        {QUICK_MESSAGES.map(q => (
          <TouchableOpacity key={q.id} style={s.quickBtn} onPress={() => handleSendQuick(q.text)} disabled={sending}>
            <Text style={s.quickBtnText}>{q.text}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reply preview */}
      {replyTo && (
        <View style={s.replyPreviewRow}>
          <View style={s.replyPreviewContent}>
            <Text style={s.replyPreviewLabel}>↩ Replying to {replyTo.senderName}</Text>
            <Text style={s.replyPreviewMsg} numberOfLines={1}>{replyTo.message}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tagged rider pill */}
      {taggedRider && (
        <View style={s.taggedPill}>
          <Text style={s.taggedPillText}>@{taggedRider.name}</Text>
          <TouchableOpacity onPress={() => setTaggedRider(null)}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* @ Mention list */}
      {showMentionList && riders.length > 0 && (
        <View style={s.mentionList}>
          {riders.filter(r => r.name?.toLowerCase().includes(mentionQuery)).map((rider: any) => (
            <TouchableOpacity key={rider.uid} style={s.mentionItem}
              onPress={() => {
                const atIdx = chatInput.lastIndexOf('@');
                setChatInput(chatInput.slice(0, atIdx) + `@${rider.name} `);
                setTaggedRider({ uid: rider.uid, name: rider.name });
                setShowMentionList(false);
              }}>
              {rider.photoURL
                ? <Image source={{ uri: rider.photoURL }} style={s.mentionAvatar} />
                : <View style={[s.mentionAvatar, s.mentionAvatarFallback]}>
                    <Text style={s.mentionInitial}>{rider.name?.charAt(0)}</Text>
                  </View>}
              <Text style={s.mentionName}>{rider.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <View style={s.emojiPicker}>
          {EMOJI_LIST.map(e => (
            <TouchableOpacity key={e} style={s.emojiBtn} onPress={() => setChatInput(p => p + e)}>
              <Text style={s.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input row */}
      <View style={s.inputRow}>
        <TouchableOpacity style={s.emojiToggle} onPress={() => setShowEmoji(p => !p)}>
          <Text style={s.emojiToggleText}>😊</Text>
        </TouchableOpacity>
        <TextInput
          style={s.input}
          placeholder="Type a message... (@ to tag)"
          placeholderTextColor={colors.textMuted}
          value={chatInput}
          onChangeText={(text) => {
            setChatInput(text);
            const atIdx = text.lastIndexOf('@');
            if (atIdx >= 0) {
              setMentionQuery(text.slice(atIdx + 1).toLowerCase());
              setShowMentionList(true);
            } else {
              setShowMentionList(false);
            }
          }}
          onFocus={() => setShowEmoji(false)}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && s.sendBtnDisabled]}
          onPress={handleSend} disabled={!chatInput.trim() || sending}>
          <Text style={s.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: colors.text },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesList: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  alertMsg: { alignSelf: 'center', backgroundColor: '#DC262622', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 4, borderWidth: 0.5, borderColor: '#DC2626' },
  alertMsgText: { color: '#DC2626', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  msgRowMine: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#333' },
  msgAvatarFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  msgAvatarInitial: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  msgBubble: { maxWidth: '75%', backgroundColor: colors.card, borderRadius: 14, borderBottomLeftRadius: 4, padding: 10 },
  msgBubbleMine: { backgroundColor: colors.primary, borderBottomLeftRadius: 14, borderBottomRightRadius: 4 },
  msgSender: { color: colors.primary, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  msgTag: { color: '#FFB347', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  replyPreviewBubble: { backgroundColor: '#FFFFFF15', borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: 6, padding: 6, marginBottom: 4 },
  replyPreviewSender: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  replyPreviewText: { color: colors.textSecondary, fontSize: 11 },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  msgTextMine: { color: '#FFF' },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  msgTime: { color: colors.textMuted, fontSize: 10 },
  msgTimeMine: { color: 'rgba(255,255,255,0.6)' },
  replyBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  replyBtnText: { color: colors.textMuted, fontSize: 10 },
  quickBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  quickBtn: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border },
  quickBtnText: { color: colors.text, fontSize: 11 },
  replyPreviewRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 12, marginBottom: 4, gap: 8, borderLeftWidth: 3, borderLeftColor: colors.primary },
  replyPreviewContent: { flex: 1 },
  replyPreviewLabel: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  replyPreviewMsg: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  taggedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '22', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 12, marginBottom: 4, alignSelf: 'flex-start' },
  taggedPillText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  closeBtn: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  mentionList: { backgroundColor: colors.card, marginHorizontal: 12, borderRadius: 12, marginBottom: 4, borderWidth: 0.5, borderColor: colors.border, maxHeight: 120 },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  mentionAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#333' },
  mentionAvatarFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  mentionInitial: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  mentionName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  emojiPicker: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card, marginHorizontal: 12, borderRadius: 12, padding: 8, marginBottom: 4, gap: 2 },
  emojiBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 20 : 12, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 8 },
  emojiToggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emojiToggleText: { fontSize: 22 },
  input: { flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 14, borderWidth: 0.5, borderColor: colors.border },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
