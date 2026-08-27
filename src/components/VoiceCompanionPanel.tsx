// components/VoiceCompanionPanel.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated, Easing, Linking, Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUPPORTED_LANGUAGES, RideContext, buildJaySystemPrompt, getJayResponse,
  detectKeywordIntent, findNearbyPlace, getDistanceToPlace,
  checkRouteTraffic, getSpeedAlertMessage, getStopReminderMessage,
  getOffRouteRiderAlert, getNearbyPlaceResponse, getTrafficAlertMessage,
} from '../services/voiceCompanionService';
import { toSsml, detectMessageType, improveIndianPronunciation } from '../services/ssmlHelper';

let Voice: any = null;
try { Voice = require('@react-native-voice/voice').default; } catch {}

let Tts: any = null;
try {
  Tts = require('react-native-tts').default;
  Tts.setDefaultRate(0.45);
  Tts.setDefaultPitch(1.3);
  Tts.setDefaultEngine('com.google.android.tts');
} catch {}

interface Props {
  visible: boolean;
  onClose: () => void;
  rideContext: RideContext;
  isGroup?: boolean;
  tripId?: string; // For reading group chat context
  isVoiceMeetActive?: boolean;
  onNavigateToPlace?: (lat: number, lng: number, name: string) => void;
}

type JayState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function VoiceCompanionPanel({ visible, onClose, rideContext, isGroup, tripId, isVoiceMeetActive, onNavigateToPlace }: Props) {
  const [step, setStep] = useState<'language' | 'active'>('language');
  const [selectedLang, setSelectedLang] = useState('en-IN');

  // Load saved language on mount
  useEffect(() => {
    AsyncStorage.getItem('jay_language').then(lang => {
      if (lang) {
        setSelectedLang(lang);
        selectedLangRef.current = lang;
        setStep('active');
      }
    });
  }, []);
  const [jayState, setJayState] = useState<JayState>('idle');
  const [muted, setMuted] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [lastText, setLastText] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);

  // Group chat context for Jay
  const recentChatRef = useRef<string>('');

  // Fetch recent chat messages as context for Jay
  const fetchChatContext = async () => {
    if (!tripId) return;
    try {
      const { getFirestore, collection, getDocs, query, orderBy, limit } = require('@react-native-firebase/firestore');
      const db = getFirestore();
      const snap = await getDocs(
        query(collection(db, `trips/${tripId}/rideChat`), orderBy('createdAt', 'desc'), limit(10))
      );
      const messages = snap.docs
        .map((d: any) => d.data())
        .reverse()
        .filter((m: any) => !m.isAlert && m.senderUid !== 'system')
        .map((m: any) => `${m.senderName}: ${m.message}`)
        .join('');
      recentChatRef.current = messages;
    } catch {}
  };

  // Refs
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const mutedRef = useRef(false);
  const selectedLangRef = useRef('en-IN');
  const rideContextRef = useRef(rideContext);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);
  const lastSpeedAlert = useRef(0);
  const lastStopReminder = useRef('');
  const lastOffRouteAlert = useRef<Record<string, number>>({});
  const pendingAlerts = useRef<string[]>([]);
  const silenceTimer = useRef<any>(null);
  const restartTimer = useRef<any>(null);
  const lastTrafficCheck = useRef(0);

  // Keep refs in sync
  useEffect(() => { rideContextRef.current = rideContext; }, [rideContext]);
  useEffect(() => { conversationRef.current = conversationHistory; }, [conversationHistory]);
  useEffect(() => { selectedLangRef.current = selectedLang; }, [selectedLang]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<any>(null);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };
  const stopPulse = () => { pulseLoop.current?.stop(); pulseAnim.setValue(1); };

  // ── Queue and speak ──────────────────────────────────────────────────────────
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (mutedRef.current || !Tts) { onDone?.(); return; }
    isSpeakingRef.current = true;
    setJayState('speaking');
    setStatusText('Jay is speaking...');
    setLastText(text);

    Tts.removeAllListeners?.('tts-finish');
    Tts.removeAllListeners?.('tts-cancel');

    const handleDone = () => {
      isSpeakingRef.current = false;
      // Check if there are pending alerts to speak first
      if (pendingAlerts.current.length > 0) {
        const next = pendingAlerts.current.shift()!;
        speak(next, () => {
          if (!mutedRef.current) setTimeout(() => startListening(), 500);
        });
      } else {
        onDone?.();
        if (!mutedRef.current) setTimeout(() => startListening(), 500);
      }
    };

    Tts.addEventListener('tts-finish', handleDone);
    Tts.addEventListener('tts-cancel', handleDone);
    Tts.setDefaultLanguage(selectedLangRef.current);
    const improved = improveIndianPronunciation(text, selectedLangRef.current);
    const msgType = detectMessageType(text);

    // Set rate and pitch based on emotion
    switch(msgType) {
      case 'greeting':
        Tts.setDefaultRate(0.52);
        Tts.setDefaultPitch(1.5);
        break;
      case 'emergency':
        Tts.setDefaultRate(0.38);
        Tts.setDefaultPitch(0.9);
        break;
      case 'warning':
        Tts.setDefaultRate(0.44);
        Tts.setDefaultPitch(1.2);
        break;
      case 'alert':
        Tts.setDefaultRate(0.46);
        Tts.setDefaultPitch(1.1);
        break;
      case 'info':
        Tts.setDefaultRate(0.43);
        Tts.setDefaultPitch(1.1);
        break;
      case 'casual':
      default:
        Tts.setDefaultRate(0.45);
        Tts.setDefaultPitch(1.3);
        break;
    }
    Tts.speak(improved);
  }, []);

  // ── Queue an interrupt alert (polite — after current speech) ─────────────────
  const queueAlert = useCallback((text: string) => {
    if (isSpeakingRef.current || isListeningRef.current) {
      pendingAlerts.current.push(text);
    } else {
      speak(text);
    }
  }, [speak]);

  // ── Start listening ──────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!Voice || isListeningRef.current || isSpeakingRef.current || mutedRef.current) return;
    try {
      isListeningRef.current = true;
      setJayState('listening');
      setStatusText('Listening...');
      startPulse();
      await Voice.start(selectedLangRef.current);
    } catch {
      isListeningRef.current = false;
      setJayState('idle');
      setStatusText('Ready — speak anytime');
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!Voice || !isListeningRef.current) return;
    try { await Voice.stop(); } catch {}
    isListeningRef.current = false;
    stopPulse();
  }, []);

  // ── Handle speech + keyword detection ────────────────────────────────────────
  const handleSpeechResult = useCallback(async (transcript: string) => {
    if (!transcript.trim()) { startListening(); return; }
    await stopListening();
    setJayState('processing');
    setStatusText('Jay is thinking...');
    setLastText(`You: ${transcript}`);

    const ctx = rideContextRef.current;
    const lang = selectedLangRef.current;

    try {
      const intent = detectKeywordIntent(transcript);

      // Keyword intent — find nearby place
      if (intent && ctx.currentLat && ctx.currentLng) {
        const places = await findNearbyPlace(ctx.currentLat, ctx.currentLng, intent);
        if (places.length > 0) {
          const place = places[0];
          const dist = getDistanceToPlace(ctx.currentLat, ctx.currentLng, place.geometry.location.lat, place.geometry.location.lng);
          const placeResponse = getNearbyPlaceResponse(intent, places, dist, lang);
          setConversationHistory(prev => [...prev, { role: 'user', content: transcript }, { role: 'assistant', content: placeResponse }]);
          speak(placeResponse, () => {
            if (['mechanic', 'police', 'hospital', 'fuel'].includes(intent)) {
              setTimeout(() => {
                console.log('Navigating to:', place.name);
                onNavigateToPlace?.(place.geometry.location.lat, place.geometry.location.lng, place.name);
                onClose();
              }, 500);
            }
          });
          return;
        }
      }

      // Traffic intent
      if (intent === 'traffic' && ctx.currentLat && ctx.currentLng) {
        const stops = (ctx as any).stops;
        if (stops?.length > 0) {
          const dest = stops[stops.length - 1];
          const traffic = await checkRouteTraffic(ctx.currentLat, ctx.currentLng, dest.lat, dest.lng);
          if (traffic.hasDelay) {
            const trafficMsg = getTrafficAlertMessage(traffic.delayMins, lang);
            setConversationHistory(prev => [...prev, { role: 'user', content: transcript }, { role: 'assistant', content: trafficMsg }]);
            speak(trafficMsg);
            return;
          }
        }
      }

      // Normal Claude response — include recent group chat as context
      await fetchChatContext();
      const chatContext = recentChatRef.current
        ? `

RECENT GROUP CHAT (last 10 messages from riders):
${recentChatRef.current}

Use this chat history to give context-aware responses. If riders discussed something, Jay knows about it.`
        : '';
      const systemPrompt = buildJaySystemPrompt({ ...ctx, language: lang }) + chatContext;
      const jayResponse = await getJayResponse(transcript, systemPrompt, conversationRef.current);
      setConversationHistory(prev => [...prev, { role: 'user', content: transcript }, { role: 'assistant', content: jayResponse }]);
      speak(jayResponse);

    } catch (e: any) {
      console.log('Jay error:', e?.message);
      speak("Sorry da, quick network hiccup! Try again machan!");
    }
  }, [speak, startListening, stopListening, onNavigateToPlace, onClose]);

  // ── Voice events ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (e: any) => {
      const transcript = e.value?.[0] || '';
      if (transcript) handleSpeechResult(transcript);
    };
    Voice.onSpeechError = () => {
      isListeningRef.current = false;
      stopPulse();
      if (!mutedRef.current && !isSpeakingRef.current) {
        restartTimer.current = setTimeout(() => startListening(), 1500);
      }
    };
    Voice.onSpeechEnd = () => {
      silenceTimer.current = setTimeout(async () => {
        if (isListeningRef.current) { try { await Voice.stop(); } catch {} }
      }, 1000);
    };
    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners());
      clearTimeout(silenceTimer.current);
      clearTimeout(restartTimer.current);
    };
  }, [handleSpeechResult, startListening]);

  // ── Speed alert ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'active') return;
    if (isVoiceMeetActive) return; // Don't interrupt voice meet
    const speed = (rideContext.currentSpeed || 0) * 3.6;
    const now = Date.now();
    if (speed > 100 && now - lastSpeedAlert.current > 30000) {
      lastSpeedAlert.current = now;
      queueAlert(getSpeedAlertMessage(Math.round(speed), selectedLang));
    }
  }, [rideContext.currentSpeed]);

  // ── Stop reminder ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'active' || !rideContext.nextStop) return;
    if (isVoiceMeetActive) return; // Don't interrupt voice meet
    const stop = rideContext.nextStop;
    const key = `${stop.name}_${Math.floor(stop.distance)}`;
    if (stop.distance < 5 && stop.distance > 0.5 && lastStopReminder.current !== key) {
      lastStopReminder.current = key;
      queueAlert(getStopReminderMessage(stop.name, stop.type, stop.distance, selectedLang));
    }
  }, [rideContext.nextStop?.distance]);

  // ── Co-rider off-route alert — only if voice meet is NOT active ─────────────
  useEffect(() => {
    if (step !== 'active' || !rideContext.riders) return;
    if (isVoiceMeetActive) return; // Riders can tell each other directly in voice meet
    const now = Date.now();
    rideContext.riders.forEach(rider => {
      if (rider.status === 'off_route') {
        const lastAlert = lastOffRouteAlert.current[rider.name] || 0;
        if (now - lastAlert > 120000) { // max once per 2 mins per rider
          lastOffRouteAlert.current[rider.name] = now;
          queueAlert(getOffRouteRiderAlert(rider.name, selectedLang));
        }
      } else {
        // Reset when back on route
        delete lastOffRouteAlert.current[rider.name];
      }
    });
  }, [JSON.stringify(rideContext.riders?.map(r => r.status))]);

  // ── Traffic check every 15 mins ──────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'active' || !rideContext.currentLat || !rideContext.currentLng) return;
    const now = Date.now();
    if (now - lastTrafficCheck.current < 900000) return; // 15 mins
    lastTrafficCheck.current = now;
    (async () => {
      const ctx = rideContextRef.current as any;
      const stops = ctx.stops;
      if (!stops?.length) return;
      const dest = stops[stops.length - 1];
      const traffic = await checkRouteTraffic(rideContext.currentLat!, rideContext.currentLng!, dest.lat, dest.lng);
      if (traffic.hasDelay) queueAlert(getTrafficAlertMessage(traffic.delayMins, selectedLang));
    })();
  }, [rideContext.currentLat]);

  // ── Open/close ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && step === 'active' && !muted) setTimeout(() => startListening(), 1000);
    else if (!visible) { stopListening(); Tts?.stop(); }
  }, [visible, step]);

  const handleStartJay = (lang: string) => {
    setSelectedLang(lang);
    selectedLangRef.current = lang;
    AsyncStorage.setItem('jay_language', lang);
    setStep('active');
    const greetingsByLang: Record<string, string[]> = {
      'en-IN': [
        `Woah hey hey hey! Jay in the house da! Your favourite riding buddy is here! Just chat anytime machan!`,
        `Ayyo! Jay here bro! Ready to ride with you da! Talk to me anytime, I'm always listening!`,
        `Hey hey! It's your boy Jay! Let's make this an epic ride machan! I got your back da!`,
        `Woah! Jay activated da! Your AI riding buddy is online! Speed safe, ride smart bro!`,
        `Aye machan! Jay here! Route looks good, weather looks fine — let's goo! Talk to me anytime da!`,
      ],
      'ta-IN': [
        `Ayyo enna da! Jay வந்துட்டேன்! உங்களோட best buddy! பேசுங்க da!`,
        `Hey bro! Jay ready da! Safe-ஆ போவோம், enjoy பண்ணுவோம்! எப்பவும் கேக்குறேன்!`,
        `Woah! Jay here da machan! Route தயாரா இருக்கு! போலாம்!`,
      ],
      'hi-IN': [
        `Aye aye aye! Jay aa gaya bhai! Tera number one riding buddy! Bas baat kar yaar!`,
        `Hey bhai! Jay yahan hoon! Safe ride karo, mast raho! Main hamesha sun raha hoon!`,
        `Woah bhai! Jay ready hai! Chalo shuru karte hain! Koi bhi baat karo da!`,
      ],
      'te-IN': [
        `Woah bro! Jay vacchesaanu da! Mee best riding buddy! Matladandi!`,
        `Hey machan! Jay ready da! Safe ga vellandi, enjoy cheyandi!`,
      ],
      'ml-IN': [
        `Hey hey! Jay vannu da! Ninnude best riding buddy! Samsarikku!`,
        `Woah! Jay ready da machan! Safe aayi po, enjoy cheyyam!`,
      ],
    };
    const list = greetingsByLang[lang] || greetingsByLang['en-IN'];
    const greeting = list[Math.floor(Math.random() * list.length)];
    setTimeout(() => speak(greeting), 300);
  };

  const handleMuteToggle = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    mutedRef.current = newMuted;
    if (newMuted) {
      stopListening(); Tts?.stop();
      isSpeakingRef.current = false;
      setJayState('idle'); setStatusText('Muted');
    } else {
      setStatusText('Listening...');
      setTimeout(() => startListening(), 500);
    }
  };

  const handleClose = () => {
    stopListening(); Tts?.stop();
    isSpeakingRef.current = false; isListeningRef.current = false;
    pendingAlerts.current = [];
    setStep('language'); setJayState('idle'); setConversationHistory([]);
    onClose();
  };

  const stateColor = jayState === 'listening' ? '#059669'
    : jayState === 'processing' ? '#D97706'
    : jayState === 'speaking' ? colors.primary
    : colors.textMuted;

  const stateIcon = jayState === 'listening' ? '🎙️'
    : jayState === 'processing' ? '⏳'
    : jayState === 'speaking' ? '🔊'
    : muted ? '🔇' : '😎';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.panel}>
          {step === 'language' && (
            <>
              <View style={s.header}>
                <View style={s.jayAvatarWrap}>
                  <Text style={s.jayAvatarEmoji}>🤖</Text>
                </View>
                <View style={s.headerInfo}>
                  <Text style={s.headerTitle}>Jay — Ride Companion</Text>
                  <Text style={s.headerSub}>Always-on AI safety buddy</Text>
                </View>
                <TouchableOpacity style={s.langChangeBtn}
                  onPress={() => { stopListening(); Tts?.stop(); setStep('language'); }}>
                  <Text style={s.langChangeBtnText}>🌐</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.langTitle}>Choose your language</Text>
              <Text style={s.langSub}>Jay will talk, alert and help you in this language</Text>
              <View style={s.langGrid}>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <TouchableOpacity key={lang.code} style={s.langBtn} onPress={() => handleStartJay(lang.code)}>
                    <Text style={s.langBtnEmoji}>
                      {lang.code === 'en-IN' ? '🇬🇧' : lang.code === 'ta-IN' ? '🌺' : lang.code === 'hi-IN' ? '🇮🇳' : lang.code === 'te-IN' ? '⭐' : '🌴'}
                    </Text>
                    <Text style={s.langBtnText}>{lang.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Feature list */}
              <View style={s.featureList}>
                {['🔍 Finds nearby mechanic, fuel, hospital', '👮 Police station for emergencies', '🗺️ Traffic & alternate route alerts', '👥 Co-rider off-route voice alerts', '⚡ Speed alerts at 100 km/h'].map((f, i) => (
                  <Text key={i} style={s.featureItem}>{f}</Text>
                ))}
              </View>
            </>
          )}

          {step === 'active' && (
            <>
              <View style={s.header}>
                <Animated.View style={[s.jayAvatarWrap, { transform: [{ scale: jayState === 'listening' ? pulseAnim : 1 }], backgroundColor: stateColor + '22' }]}>
                  <Text style={s.jayAvatarEmoji}>{stateIcon}</Text>
                  <View style={[s.stateDot, { backgroundColor: stateColor }]} />
                </Animated.View>
                <View style={s.headerInfo}>
                  <Text style={s.headerTitle}>Jay — Ride Companion</Text>
                  <Text style={[s.headerSub, { color: stateColor }]}>{statusText}</Text>
                </View>
                <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={s.lastMsgArea}>
                {lastText
                  ? <Text style={s.lastMsgText}>{lastText}</Text>
                  : <Text style={s.lastMsgPlaceholder}>{muted ? 'Jay is muted. Tap unmute to chat.' : 'Just talk — Jay is always listening 👂'}</Text>}
              </View>

              <View style={s.visualArea}>
                {(jayState === 'listening' || jayState === 'speaking') && (
                  <View style={s.waveContainer}>
                    {[1,2,3,4,5,6,7].map(i => (
                      <View key={i} style={[s.waveBar, {
                        height: 8 + (i % 4) * 12,
                        backgroundColor: stateColor,
                        opacity: 0.5 + (i % 3) * 0.17,
                      }]} />
                    ))}
                  </View>
                )}
                {jayState === 'processing' && <Text style={s.processingText}>Thinking...</Text>}
                {jayState === 'idle' && !muted && <Text style={s.idleText}>Say something to Jay 👋</Text>}
              </View>

              {/* Quick help buttons */}
              <View style={s.quickHelp}>
                {[
                  { label: '⛽ Fuel', say: 'find nearby petrol station' },
                  { label: '🔧 Mechanic', say: 'bike problem need mechanic' },
                  { label: '👮 Police', say: 'emergency need police station' },
                  { label: '🏥 Hospital', say: 'need hospital nearby' },
                ].map(btn => (
                  <TouchableOpacity key={btn.label} style={s.quickHelpBtn}
                    onPress={() => handleSpeechResult(btn.say)}>
                    <Text style={s.quickHelpText}>{btn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.controls}>
                <TouchableOpacity style={[s.muteBtn, muted && s.muteBtnActive]} onPress={handleMuteToggle}>
                  <Text style={s.muteBtnIcon}>{muted ? '🔇' : '🎙️'}</Text>
                  <Text style={s.muteBtnText}>{muted ? 'Unmute' : 'Mute'}</Text>
                </TouchableOpacity>
                <View style={s.infoRow}>
                  {isGroup && <View style={s.badge}><Text style={s.badgeText}>👥 Group</Text></View>}
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{SUPPORTED_LANGUAGES.find(l => l.code === selectedLang)?.label}</Text>
                  </View>
                </View>
              </View>
              <Text style={s.hint}>
        {isVoiceMeetActive
          ? '🎙️ Voice meet active — Jay pauses alerts. Call Jay anytime by talking.'
          : '💡 Just talk naturally — no button needed. Jay is always on.'}
      </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 32, borderTopWidth: 0.5, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  jayAvatarWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  jayAvatarEmoji: { fontSize: 26 },
  stateDot: { position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.background },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  langChangeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  langChangeBtnText: { fontSize: 18 },
  closeBtnText: { color: colors.textMuted, fontSize: 16 },
  langTitle: { fontSize: 18, fontWeight: '700', color: colors.text, paddingHorizontal: 20, paddingTop: 20, marginBottom: 4 },
  langSub: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 16 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10 },
  langBtn: { width: '47%', backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, gap: 6 },
  langBtnEmoji: { fontSize: 26 },
  langBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  featureList: { paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  featureItem: { fontSize: 12, color: colors.textSecondary, lineHeight: 20 },
  lastMsgArea: { minHeight: 56, paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center' },
  lastMsgText: { fontSize: 14, color: colors.text, lineHeight: 22, textAlign: 'center' },
  lastMsgPlaceholder: { fontSize: 13, color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  visualArea: { height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  waveContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  waveBar: { width: 6, borderRadius: 3 },
  processingText: { color: '#D97706', fontSize: 14, fontWeight: '600' },
  idleText: { color: colors.textMuted, fontSize: 13 },
  quickHelp: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  quickHelpBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border },
  quickHelpText: { fontSize: 11, color: colors.text, fontWeight: '600' },
  controls: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  muteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 0.5, borderColor: colors.border },
  muteBtnActive: { backgroundColor: '#DC262622', borderColor: '#DC2626' },
  muteBtnIcon: { fontSize: 20 },
  muteBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  infoRow: { flexDirection: 'row', gap: 8 },
  badge: { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: colors.border },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
