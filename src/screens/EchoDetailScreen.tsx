// screens/EchoDetailScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, StatusBar, ActivityIndicator, Share, Alert, Modal, TextInput,
  Dimensions, Linking,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Tappable story text — renders @tags as links ──────────────────────────────
const StoryText = ({ text, memories, riders, navigation }: any) => {
  if (!text) return null;
  // Split by @mentions
  const parts = text.split(/(@[^\s,!?.]+)/g);
  return (
    <Text style={s.storyText}>
      {parts.map((part: string, i: number) => {
        if (!part.startsWith('@')) return <Text key={i}>{part}</Text>;
        const tagName = part.slice(1).toLowerCase();
        // Check if it's a rider
        const rider = riders?.find((r: any) => r.name?.toLowerCase() === tagName || r.name?.toLowerCase().includes(tagName));
        // Check if it's a memory/place
        const memory = memories?.find((m: any) => m.name?.toLowerCase().includes(tagName) || m.address?.toLowerCase().includes(tagName));
        const stop = null; // future: match trip stops

        if (rider) {
          return (
            <Text key={i} style={s.storyTagRider}
              onPress={() => navigation?.navigate?.('Profile', { uid: rider.uid })}>
              {part}
            </Text>
          );
        }
        if (memory) {
          return (
            <Text key={i} style={s.storyTagPlace}
              onPress={() => {
                if (memory.lat && memory.lng) {
                  // Switch to map tab and show this memory
                  navigation?.setParams?.({ highlightMemory: memory.id });
                }
              }}>
              {part}
            </Text>
          );
        }
        // Generic tag — just style it
        return <Text key={i} style={s.storyTagGeneric}>{part}</Text>;
      })}
    </Text>
  );
};
import { colors } from '../theme/colors';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  getTripMemories, generateEchoStory, getEchoStory,
  TripMemory, TAG_CONFIG,
} from '../services/echoService';
import {
  getFirestore, collection, getDocs, query, orderBy, limit,
} from '@react-native-firebase/firestore';

let Tts: any = null;
try {
  Tts = require('react-native-tts').default;
  Tts.setDefaultRate(0.45);
  Tts.setDefaultPitch(1.3);
} catch {}

export default function EchoDetailScreen({ route, navigation }: any) {
  const { trip } = route.params;
  const [memories, setMemories] = useState<TripMemory[]>([]);
  const [story, setStory] = useState('');
  const [loading, setLoading] = useState(true);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [editingStory, setEditingStory] = useState(false);
  const [editedStory, setEditedStory] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<{urls: string[], index: number} | null>(null);
  const [activeTab, setActiveTab] = useState<'story' | 'memories' | 'map'>('story');
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadData();
    return () => { Tts?.stop(); };
  }, []);

  const loadData = async () => {
    try {
      const [mems, savedStory] = await Promise.all([
        getTripMemories(trip.id),
        getEchoStory(trip.id),
      ]);
      console.log('Memories loaded:', mems.length);
      mems.forEach((m, i) => console.log(`Memory ${i}:`, m.name, 'lat:', m.lat, 'lng:', m.lng, 'photo:', m.photoURL?.substring(0, 30)));
      setMemories(mems);
      // Auto-select first 5 photos
      const allPhotos = mems.flatMap(m => m.photoURLs || (m.photoURL ? [m.photoURL] : []));
      setSelectedPhotos(allPhotos.slice(0, 5));
      if (savedStory) { setStory(savedStory); setEditedStory(savedStory); }
    } catch (e) { console.error('loadData error:', e); }
    setLoading(false);
  };

  const handleGenerateStory = async () => {
    setGeneratingStory(true);
    try {
      const db = getFirestore();
      // Get chat messages
      const chatSnap = await getDocs(
        query(collection(db, `trips/${trip.id}/rideChat`), orderBy('createdAt', 'asc'), limit(30))
      );
      const chatMessages = chatSnap.docs.map(d => d.data());

      // Get rider location history for speed peaks, off-route events
      const locationSnaps = await Promise.all(
        (trip.riders || []).map(async (r: any) => {
          const snap = await getDocs(collection(db, `trips/${trip.id}/riderLocations`));
          return snap.docs.map(d => ({ ...d.data(), riderName: r.name }));
        })
      );
      const allLocations = locationSnaps.flat();

      // Find off-route events from chat system messages
      const offRouteEvents = chatMessages
        .filter((m: any) => m.isAlert && m.message?.toLowerCase().includes('off route'))
        .map((m: any) => m.message);

      // Find speed peaks
      const speedPeaks = allLocations
        .filter((l: any) => l.speed && (l.speed * 3.6) > 90)
        .map((l: any) => ({ rider: (l as any).riderName, speed: Math.round((l.speed * 3.6)) }));

      // Enrich trip object
      const enrichedTrip = {
        ...trip,
        offRouteEvents,
        speedPeaks: speedPeaks.slice(0, 5),
        totalChatMessages: chatMessages.filter((m: any) => !m.isAlert).length,
      };

      const generatedStory = await generateEchoStory(enrichedTrip, memories, trip.riders || [], chatMessages);
      setStory(generatedStory);
      setEditedStory(generatedStory);
    } catch (e) {
      console.error('Story generation error:', e);
      Alert.alert('Error', 'Could not generate story. Try again.');
    }
    setGeneratingStory(false);
  };

  const handleNarrate = () => {
    if (!story || !Tts) return;
    if (narrating) {
      Tts.stop();
      setNarrating(false);
    } else {
      setNarrating(true);
      Tts.setDefaultLanguage('en-IN');
      Tts.speak(story);
      Tts.addEventListener('tts-finish', () => setNarrating(false));
    }
  };

  const handleShareToFeed = async () => {
    if (!story && !editedStory) {
      Alert.alert('No story yet', 'Generate a story first before sharing to feed.');
      return;
    }
    if (selectedPhotos.length === 0) {
      Alert.alert('No photos', 'Select at least one photo to share.');
      return;
    }
    const taggedRiders = trip.riders?.map((r: any) => r.uid) || [];
    navigation.navigate('CreateMemory', {
      prefillCaption: story || editedStory,
      prefillPhotos: selectedPhotos,
      prefillTitle: trip.title,
      prefillLocation: trip.stops?.[trip.stops?.length - 1]?.name || trip.stops?.[0]?.name || '',
      taggedUsers: taggedRiders,
      fromEchoes: true,
      tripId: trip.id,
    });
  };

  const handleShareToWhatsApp = async (memory?: any) => {
    const caption = memory
      ? `📸 *${memory.name}*\n${memory.description ? memory.description + '\n' : ''}📍 ${memory.address}\n\n🏍️ From my ride: *${trip.title}*\n\n_Shared via RideAI Echoes_`
      : `✨ *${trip.title}*\n\n${story || editedStory}\n\n_Shared via RideAI Echoes 🏍️_`;
    const photos = memory
      ? (memory.photoURLs || [memory.photoURL]).filter(Boolean)
      : selectedPhotos.slice(0, 5);
    console.log('WhatsApp share - photos:', photos.length);
    await shareWithPhoto(caption, photos[0], photos);
  };

  const shareWithPhoto = async (caption: string, photoUrl?: string, extraPhotos?: string[]) => {
    console.log('shareWithPhoto called, photoUrl:', photoUrl?.substring(0, 30));
    
    // Validate URL
    if (!photoUrl || !photoUrl.startsWith('http')) {
      console.log('No valid photo URL — text only share');
      return Share.share({ message: caption, title: trip.title });
    }

    try {
      let RNFS: any = null;
      let RNShare: any = null;
      try { RNFS = require('react-native-fs'); console.log('RNFS loaded'); } catch (e) { console.log('RNFS not available'); }
      try { RNShare = require('react-native-share').default; console.log('RNShare loaded'); } catch (e) { console.log('RNShare not available'); }

      if (RNFS && RNShare) {
        console.log('Downloading photo...');
        const filename = `rideai_echo_${Date.now()}.jpg`;
        const localPath = `${RNFS.CachesDirectoryPath}/${filename}`;
        const downloadResult = await RNFS.downloadFile({ fromUrl: photoUrl, toFile: localPath }).promise;
        console.log('Download result:', downloadResult.statusCode);
        
        if (downloadResult.statusCode === 200) {
          console.log('Sharing local file:', localPath);
          // Check if multiple photos to share
          const allPhotos = extraPhotos?.length ? extraPhotos : [photoUrl];

          if (allPhotos.length > 1) {
            // Download all photos and share as multiple files
            const localPaths: string[] = [localPath];
            for (let i = 1; i < Math.min(allPhotos.length, 5); i++) {
              try {
                const extraPath = `${RNFS.CachesDirectoryPath}/rideai_echo_${Date.now()}_${i}.jpg`;
                const res = await RNFS.downloadFile({ fromUrl: allPhotos[i], toFile: extraPath }).promise;
                if (res.statusCode === 200) localPaths.push(extraPath);
              } catch {}
            }
            console.log('Sharing', localPaths.length, 'photos');
            await RNShare.open({
              message: caption,
              urls: localPaths.map(p => `file://${p}`),
              type: 'image/jpeg',
              title: trip.title,
              failOnCancel: false,
            });
          } else {
            await RNShare.open({
              message: caption,
              url: `file://${localPath}`,
              type: 'image/jpeg',
              title: trip.title,
              failOnCancel: false,
            });
          }
        } else {
          console.log('Download failed, text only');
          await Share.share({ message: caption, title: trip.title });
        }
      } else {
        console.log('Packages not available — text only');
        await Share.share({ message: caption, title: trip.title });
      }
    } catch (e: any) {
      const msg = e?.message || '';
      if (!msg.includes('cancel') && !msg.includes('Cancel')) {
        console.log('Share error:', msg);
        try { await Share.share({ message: caption, title: trip.title }); } catch {}
      }
    }
  };

  const handleShareToInstagram = async (memory?: any) => {
    const caption = memory
      ? `📸 ${memory.name}\n${memory.description || ''}\n📍 ${memory.address}\n\n🏍️ ${trip.title}\n.\n.\n#RideAI #MotoRide #Echoes #BikeLife`
      : `✨ ${trip.title}\n\n${(story || editedStory)?.substring(0, 300)}\n.\n.\n#RideAI #MotoRide #BikeLife #Echoes #MotorcycleLife`;
    const photos = memory
      ? (memory.photoURLs || [memory.photoURL]).filter(Boolean)
      : [selectedPhotos[0]]; // Instagram best with single photo
    await shareWithPhoto(caption, photos[0], photos);
  };

  const handleShareToFacebook = async () => {
    const text = `✨ ${trip.title}\n\n${story || editedStory}\n\n📸 ${selectedPhotos.length} memories from this ride!\n🏍️ RideAI Echoes`;
    await shareWithPhoto(text, selectedPhotos[0], selectedPhotos.slice(0, 5));
  };

  const handleShare = async (type: 'story' | 'memory' = 'story', memory?: any) => {
    const shareText = type === 'memory' && memory
      ? `📸 ${memory.name}\n${memory.description || ''}\n📍 ${memory.address}\n\n🏍️ ${trip.title}\n\nShared via RideAI Echoes`
      : `✨ ${trip.title}\n\n${story}\n\nShared via RideAI Echoes 🏍️`;
    await Share.share({ message: shareText });
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); }
    catch { return iso; }
  };

  const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  ];

  return (
    <View style={s.root}>
      {/* Full screen photo viewer */}
      {photoViewer && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setPhotoViewer(null)}>
          <View style={s.photoViewerOverlay}>
            <TouchableOpacity style={s.photoViewerClose} onPress={() => setPhotoViewer(null)}>
              <Text style={s.photoViewerCloseText}>✕</Text>
            </TouchableOpacity>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              contentOffset={{ x: photoViewer.index * SCREEN_WIDTH, y: 0 }}>
              {photoViewer.urls.map((url, i) => (
                <Image key={i} source={{ uri: url }}
                  style={{ width: SCREEN_WIDTH, height: '100%' }}
                  resizeMode="contain" />
              ))}
            </ScrollView>
            <View style={s.photoViewerCount}>
              <Text style={s.photoViewerCountText}>{photoViewer.urls.length} photo{photoViewer.urls.length > 1 ? 's' : ''}</Text>
            </View>
          </View>
        </Modal>
      )}
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={s.headerSub}>{trip.date} · {trip.totalDistance}</Text>
        </View>
        <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
          <Text style={s.shareBtnText}>↗</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['story', 'memories', 'map'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'story' ? '📖 Story' : tab === 'memories' ? `📸 Memories (${memories.length})` : '🗺️ Map'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={s.content}>

          {/* Story Tab */}
          {activeTab === 'story' && (
            <View style={s.storyTab}>

              {/* Jay header */}
              <View style={s.jayCard}>
                <View style={s.jayCardHeader}>
                  <Text style={s.jayCardIcon}>🤖</Text>
                  <View style={{flex:1}}>
                    <Text style={s.jayCardTitle}>Jay's Echo Story</Text>
                    <Text style={s.jayCardSub}>AI-generated ride recap with photos</Text>
                  </View>
                  {story && (
                    <TouchableOpacity style={[s.narrateBtn, narrating && s.narrateBtnActive]}
                      onPress={handleNarrate}>
                      <Text style={s.narrateBtnText}>{narrating ? '⏹️' : '▶️'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {story ? (
                  editingStory ? (
                    <View>
                      <TextInput
                        style={s.storyEdit}
                        value={editedStory}
                        onChangeText={setEditedStory}
                        multiline
                        autoFocus
                      />
                      <View style={s.editActions}>
                        <TouchableOpacity style={s.editSaveBtn} onPress={async () => {
                          setStory(editedStory);
                          setEditingStory(false);
                          // Persist to Firestore
                          try {
                            const { getFirestore, doc, updateDoc } = require('@react-native-firebase/firestore');
                            await updateDoc(doc(getFirestore(), 'trips', trip.id), {
                              echoStory: editedStory,
                              echoStoryEditedAt: new Date().toISOString(),
                            });
                          } catch (e) { console.log('Save story error:', e); }
                        }}>
                          <Text style={s.editSaveBtnText}>💾 Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.editCancelBtn} onPress={() => {
                          setEditedStory(story); setEditingStory(false);
                        }}>
                          <Text style={s.editCancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <StoryText
                      text={story}
                      memories={memories}
                      riders={trip.riders || []}
                      navigation={navigation}
                    />
                      <View style={s.storyActions}>
                        <TouchableOpacity style={s.editBtn} onPress={() => {
                          setEditedStory(story); setEditingStory(true);
                        }}>
                          <Text style={s.editBtnText}>✏️ Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.regenBtn, generatingStory && s.generateBtnDisabled]}
                          onPress={handleGenerateStory} disabled={generatingStory}>
                          {generatingStory
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Text style={s.regenBtnText}>🔄 Regenerate</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                ) : (
                  <View style={s.noStory}>
                    <Text style={s.noStoryText}>Jay hasn't told your story yet...</Text>
                    <TouchableOpacity
                      style={[s.generateBtn, generatingStory && s.generateBtnDisabled]}
                      onPress={handleGenerateStory} disabled={generatingStory}>
                      {generatingStory
                        ? <><ActivityIndicator size="small" color="#FFF" /><Text style={s.generateBtnText}> Generating...</Text></>
                        : <Text style={s.generateBtnText}>🤖 Generate Echo Story</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Photo selector */}
              {memories.length > 0 && (
                <View style={s.photoSelector}>
                  <Text style={s.photoSelectorTitle}>📸 Photos for post ({selectedPhotos.length}/5 selected)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.photoSelectorList}>
                    {memories.flatMap(m => m.photoURLs || (m.photoURL ? [m.photoURL] : [])).map((url, i) => {
                      const selected = selectedPhotos.includes(url);
                      return (
                        <TouchableOpacity key={i} style={s.photoSelectorItem} onPress={() => {
                          if (!selected && selectedPhotos.length >= 5) {
                            Alert.alert('Max 5 photos', 'Deselect a photo first to add another.');
                            return;
                          }
                        setSelectedPhotos(prev =>
                            selected ? prev.filter(p => p !== url) : [...prev, url].slice(0, 5)
                          );
                        }}>
                          <Image source={{ uri: url }} style={s.photoSelectorThumb} />
                          <View style={[s.photoSelectorCheck, selected && s.photoSelectorCheckSelected]}>
                            {selected && <Text style={s.photoSelectorCheckText}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={s.photoSelectorHint}>Tap to select/deselect · Max 5 photos for sharing</Text>
                </View>
              )}

              {/* Trip stats */}
              <View style={s.statsGrid}>
                <View style={s.statCard}><Text style={s.statValue}>{trip.totalDistance || '—'}</Text><Text style={s.statLabel}>Distance</Text></View>
                <View style={s.statCard}><Text style={s.statValue}>{memories.length}</Text><Text style={s.statLabel}>Memories</Text></View>
                <View style={s.statCard}><Text style={s.statValue}>{memories.filter(m => m.isHiddenGem).length}</Text><Text style={s.statLabel}>💎 Gems</Text></View>
                <View style={s.statCard}><Text style={s.statValue}>{(trip.riders?.length || 0) + 1}</Text><Text style={s.statLabel}>Riders</Text></View>
              </View>

              {/* Share buttons */}
              {story && (
                <View style={s.shareSection}>
                  <Text style={s.shareSectionTitle}>Share your Echo 🏍️</Text>
                  <View style={s.shareRow}>
                    <TouchableOpacity style={[s.shareTypeBtn, { borderColor: colors.primary }]}
                      onPress={handleShareToFeed}>
                      <Text style={s.shareTypeIcon}>📤</Text>
                      <Text style={[s.shareTypeBtnText, { color: colors.primary }]}>Feed</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.shareTypeBtn, { borderColor: '#25D366' }]}
                      onPress={() => handleShareToWhatsApp()}>
                      <Text style={s.shareTypeIcon}>💬</Text>
                      <Text style={[s.shareTypeBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.shareTypeBtn, { borderColor: '#E1306C' }]}
                      onPress={() => handleShareToInstagram()}>
                      <Text style={s.shareTypeIcon}>📷</Text>
                      <Text style={[s.shareTypeBtnText, { color: '#E1306C' }]}>Instagram</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.shareTypeBtn, { borderColor: '#1877F2' }]}
                      onPress={handleShareToFacebook}>
                      <Text style={s.shareTypeIcon}>👍</Text>
                      <Text style={[s.shareTypeBtnText, { color: '#1877F2' }]}>Facebook</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Memories Tab */}
          {activeTab === 'memories' && (
            <View style={s.memoriesTab}>
              {memories.length === 0 ? (
                <View style={s.centered}>
                  <Text style={s.emptyIcon}>📸</Text>
                  <Text style={s.emptyText}>No memories captured yet</Text>
                  <Text style={s.emptySubText}>Use the 📸 button during your next ride</Text>
                </View>
              ) : (
                memories.map((memory, idx) => (
                  <View key={memory.id} style={s.memoryCard}>
                    {/* Multiple photos scroll — tappable */}
                  {(memory.photoURLs?.length || 0) > 1 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      style={s.memoryPhotosScroll}>
                      {(memory.photoURLs || [memory.photoURL]).map((url, i) => (
                        <TouchableOpacity key={i} onPress={() => setPhotoViewer({ urls: memory.photoURLs || [memory.photoURL], index: i })}>
                          <Image source={{ uri: url }} style={s.memoryPhotoMulti} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <TouchableOpacity onPress={() => setPhotoViewer({ urls: [memory.photoURL], index: 0 })}>
                      <Image source={{ uri: memory.photoURL }} style={s.memoryPhoto} />
                    </TouchableOpacity>
                  )}
                  {(memory.photoURLs?.length || 0) > 1 && (
                    <View style={s.photoCountBadge}>
                      <Text style={s.photoCountBadgeText}>📸 {memory.photoURLs!.length}</Text>
                    </View>
                  )}
                    <View style={s.memoryInfo}>
                      <View style={s.memoryTopRow}>
                        <View style={[s.memoryTag, { backgroundColor: TAG_CONFIG[memory.tag]?.color + '22' }]}>
                          <Text style={[s.memoryTagText, { color: TAG_CONFIG[memory.tag]?.color }]}>
                            {TAG_CONFIG[memory.tag]?.emoji} {TAG_CONFIG[memory.tag]?.label}
                          </Text>
                        </View>
                        {memory.isHiddenGem && (
                          <View style={s.hiddenGemBadge}>
                            <Text style={s.hiddenGemText}>💎 Verified Gem</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.memoryName}>{memory.name}</Text>
                      {memory.description ? <Text style={s.memoryDesc}>{memory.description}</Text> : null}
                      <Text style={s.memoryMeta}>
                        👤 {memory.riderName} · ⏰ {memory.timestamp}
                      </Text>
                      <Text style={s.memoryAddress} numberOfLines={1}>📍 {memory.address}</Text>
                    <View style={s.memoryShareRow}>
                      <TouchableOpacity style={[s.memoryShareBtn, {borderColor: '#25D366'}]}
                        onPress={() => handleShareToWhatsApp(memory)}>
                        <Text style={[s.memoryShareBtnText, {color: '#25D366'}]}>💬</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.memoryShareBtn, {borderColor: '#E1306C'}]}
                        onPress={() => handleShareToInstagram(memory)}>
                        <Text style={[s.memoryShareBtnText, {color: '#E1306C'}]}>📷</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.memoryShareBtn, {borderColor: colors.primary}]}
                        onPress={() => handleShareToFeed()}>
                        <Text style={[s.memoryShareBtnText, {color: colors.primary}]}>📤 Feed</Text>
                      </TouchableOpacity>
                    </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Map Tab */}
          {activeTab === 'map' && memories.length > 0 && (
            <View style={s.mapTab}>
              {(() => {
                const validMemories = memories.filter(m => m.lat && m.lng);
                if (validMemories.length === 0) return (
                  <View style={s.centered}>
                    <Text style={s.emptyIcon}>🗺️</Text>
                    <Text style={s.emptyText}>No location data for memories</Text>
                  </View>
                );
                // Calculate center from all memories
                const avgLat = validMemories.reduce((sum, m) => sum + m.lat, 0) / validMemories.length;
                const avgLng = validMemories.reduce((sum, m) => sum + m.lng, 0) / validMemories.length;
                return (
                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={s.map}
                    customMapStyle={darkMapStyle}
                    initialRegion={{
                      latitude: avgLat,
                      longitude: avgLng,
                      latitudeDelta: 0.5,
                      longitudeDelta: 0.5,
                    }}>
                    {validMemories.map(memory => (
                      <Marker key={memory.id}
                        coordinate={{ latitude: memory.lat, longitude: memory.lng }}
                        title={memory.name}
                        description={`${memory.riderName} · ${memory.timestamp}`}
                        onCalloutPress={() => setActiveTab('memories')}>
                        <View style={s.memoryMarker}>
                          <Text style={s.memoryMarkerIcon}>{TAG_CONFIG[memory.tag]?.emoji || '📍'}</Text>
                        </View>
                      </Marker>
                    ))}
                  </MapView>
                );
              })()}
            </View>
          )}

          {activeTab === 'map' && memories.length === 0 && (
            <View style={s.centered}>
              <Text style={s.emptyIcon}>🗺️</Text>
              <Text style={s.emptyText}>No memory locations yet</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backArrow: { fontSize: 22, color: colors.text },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  shareBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { fontSize: 18, color: colors.primary, fontWeight: '700' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: '#FFF' },
  content: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 300 },
  storyTab: { padding: 16, gap: 16 },
  jayCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: colors.border },
  jayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  jayCardIcon: { fontSize: 28 },
  jayCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  jayCardSub: { fontSize: 12, color: colors.textMuted },
  narrateBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  narrateBtnActive: { backgroundColor: '#DC262622' },
  narrateBtnText: { fontSize: 16 },
  storyText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  noStory: { alignItems: 'center', gap: 12 },
  noStoryText: { color: colors.textMuted, fontSize: 14 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  shareRow: { flexDirection: 'row', gap: 8 },
  shareTypeBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  shareTypeBtnText: { fontSize: 11, fontWeight: '700' },
  memoriesTab: { padding: 16, gap: 12 },
  memoryCard: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: colors.border },
  memoryPhoto: { width: '100%', height: 180 },
  memoryPhotosScroll: { height: 180 },
  memoryPhotoMulti: { width: 240, height: 180, marginRight: 4 },
  photoCountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  photoCountBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  memoryInfo: { padding: 12, gap: 6 },
  memoryTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  memoryTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  memoryTagText: { fontSize: 11, fontWeight: '700' },
  hiddenGemBadge: { backgroundColor: '#DB277722', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  hiddenGemText: { color: '#DB2777', fontSize: 11, fontWeight: '700' },
  memoryName: { fontSize: 15, fontWeight: '700', color: colors.text },
  memoryDesc: { fontSize: 13, color: colors.textSecondary },
  memoryMeta: { fontSize: 11, color: colors.textMuted },
  memoryAddress: { fontSize: 11, color: colors.textMuted },
  mapTab: { height: 500, margin: 16, borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  memoryMarker: { backgroundColor: colors.card, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary },
  memoryMarkerIcon: { fontSize: 18 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptySubText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  memoryShareRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  memoryShareBtn: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border },
  storyTagRider: { color: colors.primary, fontWeight: '700' },
  storyTagPlace: { color: '#059669', fontWeight: '700' },
  storyTagGeneric: { color: '#D97706', fontWeight: '600' },
  storyEdit: { backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, lineHeight: 22, minHeight: 200, borderWidth: 0.5, borderColor: colors.primary, marginBottom: 10, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 8 },
  editSaveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, padding: 10, alignItems: 'center' },
  editSaveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  editCancelBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border },
  editCancelBtnText: { color: colors.textMuted, fontSize: 13 },
  storyActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  editBtn: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: colors.border },
  editBtnText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  regenBtn: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 4 },
  regenBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  photoSelector: { backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: colors.border },
  photoSelectorTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 },
  photoSelectorList: { gap: 8, paddingRight: 8 },
  photoSelectorItem: { position: 'relative' },
  photoSelectorThumb: { width: 72, height: 72, borderRadius: 8 },
  photoSelectorCheck: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  photoSelectorCheckSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  photoSelectorCheckText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  photoSelectorHint: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  shareSection: { gap: 8 },
  shareSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  shareTypeIcon: { fontSize: 18 },
  memoryShareBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  photoViewerClose: { position: 'absolute', top: 48, right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  photoViewerCloseText: { color: '#FFF', fontSize: 18 },
  photoViewerCount: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  photoViewerCountText: { color: '#FFF', fontSize: 12 },
});
