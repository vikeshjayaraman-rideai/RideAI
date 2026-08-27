import React, {useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Alert, Image,
} from 'react-native';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';
import Geolocation from '@react-native-community/geolocation';
import {GOOGLE_MAPS_API_KEY} from '@env';
import {colors} from '../theme/colors';
import {createMemory, MEMORY_TYPES, MemoryType, FEELINGS, Feeling, POST_TYPES, PostType, TaggedUser} from '../services/memoryService';
import {searchUsers} from '../services/tripService';

const EMOJIS = ['😂','❤️','🔥','🤩','😎','🏍️','🌄','⛰️','🏖️','🌊','🌈','⭐','🎉','💪','🙏','😅','🤯','💎','🗺️','📍','☕','🍽️','⛽','🏨','🌿','🦅','🐘','🦁','🌺','🍃','🌙','☀️','⚡','🎵','📸','🏆'];

const CreateMemoryScreen = ({route, navigation}: any) => {
  const {
    tripId,
    tripTitle,
    prefillCaption,
    prefillPhotos,
    prefillTitle,
    prefillLocation,
    taggedUsers: prefillTaggedUsers,
    fromEchoes,
  } = route.params || {};

  const [title, setTitle] = useState(prefillTitle || '');
  const [description, setDescription] = useState(prefillCaption || '');
  const [type, setType] = useState<MemoryType>('general');
  const [postType, setPostType] = useState<PostType>('personal');
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [music, setMusic] = useState({title: '', spotifyUrl: '', previewUrl: '', artwork: ''});
  const [musicSearch, setMusicSearch] = useState('');
  const [musicResults, setMusicResults] = useState<any[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);

  // Load actual user names for pre-tagged riders
  React.useEffect(() => {
    if (!prefillTaggedUsers?.length) return;
    const loadTaggedUsers = async () => {
      try {
        const { getFirestore, collection, doc, getDoc } = require('@react-native-firebase/firestore');
        const db = getFirestore();
        const users = await Promise.all(
          prefillTaggedUsers.map(async (uid: string) => {
            const snap = await getDoc(doc(collection(db, 'users'), uid));
            const data = snap.exists() ? snap.data() : {};
            return { uid, name: data.name || uid, photoURL: data.photoURL || '' };
          })
        );
        setTaggedUsers(users);
      } catch (e) { console.log('Load tagged users error:', e); }
    };
    loadTaggedUsers();
  }, []);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [tagSearchResults, setTagSearchResults] = useState<any[]>([]);
  const [tagSearching, setTagSearching] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>(prefillPhotos || []);
  // Location as object with lat/lng or empty
  const [location, setLocation] = useState<any>(
    prefillLocation ? { placeName: prefillLocation, address: prefillLocation, lat: 0, lng: 0 } : { lat: 0, lng: 0, address: '', placeName: '' }
  );

  const handleAddPhoto = () => {
    Alert.alert('Add Photo', 'Choose source', [
      {text: '📷 Camera', onPress: () => {
        launchCamera({mediaType: 'photo', quality: 0.8}, (response) => {
          if (response.assets?.[0]?.uri) setPhotos(prev => [...prev, response.assets![0].uri!]);
        });
      }},
      {text: '🖼️ Gallery', onPress: () => {
        launchImageLibrary({mediaType: 'photo', quality: 0.8, selectionLimit: 5}, (response) => {
          if (response.assets) {
            const uris = response.assets.map((a: any) => a.uri!).filter(Boolean);
            setPhotos(prev => [...prev, ...uris].slice(0, 5));
          }
        });
      }},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const handleGetCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      (pos: any) => {
        const {latitude, longitude} = pos.coords;
        setLocation(prev => ({...prev, lat: latitude, lng: longitude}));
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`)
          .then(r => r.json())
          .then(data => {
            if (data.results?.[0]) {
              const components = data.results[0].address_components || [];
              const placeName =
                components.find((c: any) => c.types.includes('point_of_interest'))?.long_name ||
                components.find((c: any) => c.types.includes('establishment'))?.long_name ||
                components.find((c: any) => c.types.includes('sublocality'))?.long_name ||
                components.find((c: any) => c.types.includes('locality'))?.long_name ||
                components.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name || '';
              setLocation(prev => ({...prev, address: data.results[0].formatted_address, placeName}));
            }
          });
      },
      () => Alert.alert('Error', 'Could not get location.'),
      {enableHighAccuracy: true, timeout: 10000},
    );
  };

  const handleMusicSearch = async (query: string) => {
    setMusicSearch(query);
    if (query.length < 2) { setMusicResults([]); return; }
    setMusicSearching(true);
    try {
      const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=8`);
      const d = await r.json();
      setMusicResults(d.data || []);
    } catch (e) {}
    setMusicSearching(false);
  };

  const handleTagSearch = async (query: string) => {
    setTagSearchQuery(query);
    if (query.length < 2) { setTagSearchResults([]); return; }
    setTagSearching(true);
    try {
      const results = await searchUsers(query);
      setTagSearchResults(results.filter((u: any) => !taggedUsers.find(t => t.uid === u.uid)));
    } catch (e) {}
    setTagSearching(false);
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Missing Info', 'Please add a title.'); return; }
    setSaving(true);
    try {
      const memoryData: any = {title, description, type, postType, photos: [], location};
      if (feeling) memoryData.feeling = feeling;
      if (music.title) memoryData.music = {title: music.title, spotifyUrl: music.spotifyUrl || undefined, previewUrl: music.previewUrl || undefined, artwork: music.artwork || undefined};
      if (taggedUsers.length > 0) memoryData.taggedUsers = taggedUsers;
      if (tripId) memoryData.tripId = tripId;
      if (tripTitle) memoryData.tripTitle = tripTitle;
        // DEBUG
    console.log('Saving memory with feeling:', feeling, 'music:', music.title, 'tags:', taggedUsers.length, 'postType:', postType);
    
      await createMemory(memoryData, photos);
      Alert.alert('🎉 Posted!', 'Your ride memory has been shared!');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not save memory. Please try again.');
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{fromEchoes ? '✨ Share Echo' : '📸 Create Memory'}</Text>
        <TouchableOpacity style={[styles.postBtn, saving && {opacity: 0.6}]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Photos */}
        <View style={styles.photosSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Add Photo</Text>
              <Text style={styles.addPhotoSub}>{photos.length}/5</Text>
            </TouchableOpacity>
            {photos.map((uri, index) => (
              <View key={index} style={styles.photoThumb}>
                <Image source={{uri}} style={styles.photoImage} />
                <TouchableOpacity style={styles.removePhoto} onPress={() => setPhotos(prev => prev.filter((_, i) => i !== index))}>
                  <Text style={styles.removePhotoText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Post Type */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📢 Post Type</Text>
          <View style={styles.chipRow}>
            {POST_TYPES.map(pt => (
              <TouchableOpacity key={pt.value}
                style={[styles.chip, postType === pt.value && {backgroundColor: pt.color, borderColor: pt.color}]}
                onPress={() => setPostType(pt.value)}>
                <Text style={styles.chipIcon}>{pt.icon}</Text>
                <Text style={[styles.chipLabel, postType === pt.value && {color: colors.text, fontWeight: '700'}]}>{pt.label}</Text>
                {pt.value === 'sponsored' && <View style={styles.adBadge}><Text style={styles.adBadgeText}>AD</Text></View>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Memory Type */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏷️ Tag this memory</Text>
          <View style={styles.chipRow}>
            {MEMORY_TYPES.map(t => (
              <TouchableOpacity key={t.value}
                style={[styles.chip, type === t.value && {backgroundColor: t.color, borderColor: t.color}]}
                onPress={() => setType(t.value)}>
                <Text style={styles.chipIcon}>{t.icon}</Text>
                <Text style={[styles.chipLabel, type === t.value && {color: colors.text, fontWeight: '700'}]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Feeling */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>😊 How are you feeling?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.feelingRow}>
              {FEELINGS.map(f => (
                <TouchableOpacity key={f.value}
                  style={[styles.feelingChip, feeling === f.value && styles.feelingChipActive]}
                  onPress={() => setFeeling(feeling === f.value ? null : f.value)}>
                  <Text style={styles.feelingEmoji}>{f.emoji}</Text>
                  <Text style={[styles.feelingLabel, feeling === f.value && {color: colors.primary, fontWeight: '700'}]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Title & Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✍️ Tell the story</Text>
          <TextInput style={styles.titleInput} placeholder="Give this memory a title..." placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} maxLength={80} />
          <TextInput style={styles.descInput} placeholder="What made this spot special? Share the vibe..." placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} multiline maxLength={500} />
          <Text style={styles.charCount}>{description.length}/500</Text>
          {/* Emoji Picker */}
          <TouchableOpacity style={styles.emojiToggleBtn} onPress={() => setShowEmojiPicker(!showEmojiPicker)}>
            <Text style={styles.emojiToggleText}>{showEmojiPicker ? '🔼 Hide Emojis' : '😊 Add Emoji'}</Text>
          </TouchableOpacity>
          {showEmojiPicker && (
            <View style={styles.emojiGrid}>
              {EMOJIS.map(emoji => (
                <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => setDescription(prev => prev + emoji)}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Tag Riders */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Tag Riders</Text>
          {taggedUsers.length > 0 && (
            <View style={styles.taggedList}>
              {taggedUsers.map((user, i) => (
                <View key={i} style={styles.taggedChip}>
                  <Text style={styles.taggedName}>@{user.name}</Text>
                  <TouchableOpacity onPress={() => setTaggedUsers(prev => prev.filter((_, idx) => idx !== i))}>
                    <Text style={styles.taggedRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.tagSearchRow}>
            <TextInput
              style={[styles.titleInput, {flex: 1, marginBottom: 0}]}
              placeholder="Search RideAI users or type name..."
              placeholderTextColor={colors.textMuted}
              value={tagSearchQuery}
              onChangeText={handleTagSearch}
            />
            {tagSearchQuery.length > 0 && (
              <TouchableOpacity style={styles.addManualBtn} onPress={() => {
                if (tagSearchQuery.trim()) {
                  setTaggedUsers(prev => [...prev, {uid: `manual_${Date.now()}`, name: tagSearchQuery.trim()}]);
                  setTagSearchQuery('');
                  setTagSearchResults([]);
                }
              }}>
                <Text style={styles.addManualBtnText}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {tagSearching && <ActivityIndicator color={colors.primary} size="small" style={{marginTop: 8}} />}
          {tagSearchResults.map((user: any) => (
            <TouchableOpacity key={user.uid} style={styles.tagResult}
              onPress={() => {
                setTaggedUsers(prev => [...prev, {uid: user.uid, name: user.name, photoURL: user.photoURL}]);
                setTagSearchQuery('');
                setTagSearchResults([]);
              }}>
              <Text style={styles.tagResultName}>🏍️ {user.name}</Text>
              <Text style={styles.tagResultEmail}>{user.email}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Music */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎵 Add Music</Text>
          {music.title ? (
            <View style={styles.selectedMusic}>
              {music.artwork ? (
                <Image source={{uri: music.artwork}} style={styles.musicArtwork} />
              ) : (
                <Text style={{fontSize: 28}}>🎵</Text>
              )}
              <View style={{flex: 1}}>
                <Text style={styles.selectedMusicTitle} numberOfLines={1}>{music.title}</Text>
                <Text style={styles.selectedMusicSub}>Added to memory</Text>
              </View>
              <TouchableOpacity onPress={() => setMusic({title: '', spotifyUrl: '', previewUrl: '', artwork: ''})}>
                <Text style={{fontSize: 18, color: colors.danger, padding: 4}}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.titleInput}
                placeholder="🔍 Search for a song..."
                placeholderTextColor={colors.textMuted}
                value={musicSearch}
                onChangeText={handleMusicSearch}
              />
              {musicSearching && <ActivityIndicator color={colors.primary} size="small" style={{marginBottom: 8}} />}
              {musicResults.map((track: any, i: number) => (
                <TouchableOpacity key={i} style={styles.musicResult}
                  onPress={() => {
                    setMusic({
                      title: `${track.title} — ${track.artist?.name}`,
                      spotifyUrl: track.link || '',
                      previewUrl: track.preview || '',
                      artwork: track.album?.cover_medium || '',
                    });
                    setMusicResults([]);
                    setMusicSearch('');
                  }}>
                  {track.album?.cover_small ? (
                    <Image source={{uri: track.album.cover_small}} style={styles.musicArtwork} />
                  ) : (
                    <View style={[styles.musicArtwork, {backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center'}]}>
                      <Text>🎵</Text>
                    </View>
                  )}
                  <View style={{flex: 1}}>
                    <Text style={styles.selectedMusicTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.selectedMusicSub} numberOfLines={1}>{track.artist?.name}</Text>
                  </View>
                  <Text style={{fontSize: 11, color: colors.textMuted}}>
                    {Math.floor((track.duration||0)/60)}:{String((track.duration||0)%60).padStart(2,'0')}
                  </Text>
                </TouchableOpacity>
              ))}
              {musicSearch.length > 1 && !musicSearching && musicResults.length === 0 && (
                <Text style={{fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 8}}>No songs found</Text>
              )}
              {musicSearch.length > 1 && (
                <TouchableOpacity style={[styles.locationBtn, {marginTop: 8}]}
                  onPress={() => { setMusic({title: musicSearch, spotifyUrl: '', previewUrl: '', artwork: ''}); setMusicSearch(''); setMusicResults([]); }}>
                  <Text style={styles.locationBtnText}>+ Use "{musicSearch.substring(0,30)}" as song</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 Location</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={handleGetCurrentLocation}>
            <Text style={styles.locationBtnText}>📡 Use Current Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.locationBtn, {backgroundColor: colors.background, borderColor: colors.border}]} onPress={() => setShowLocationSearch(true)}>
            <Text style={styles.locationBtnText}>🔍 {location.placeName || 'Search on Google Maps'}</Text>
          </TouchableOpacity>
          {location?.lat !== undefined && location?.lat !== 0 && (
            <Text style={styles.coordsText}>✅ {location.address || (location.lat ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '')}</Text>
          )}
        </View>

        {tripTitle && (
          <View style={styles.tripLinkCard}>
            <Text style={styles.tripLinkText}>🏍️ Linked to: {tripTitle}</Text>
          </View>
        )}
        <View style={{height: 40}} />
      </ScrollView>

      {/* Location Search Modal */}
      {showLocationSearch && (
        <View style={styles.modalOverlay}>
          <View style={styles.locationModalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📍 Search Location</Text>
              <TouchableOpacity onPress={() => setShowLocationSearch(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{flex: 1, padding: 12}}>
              <GooglePlacesAutocomplete
                placeholder="Search for a place..."
                onPress={(data, details = null) => {
                  if (details) {
                    setLocation({
                      lat: details.geometry.location.lat,
                      lng: details.geometry.location.lng,
                      address: details.formatted_address || data.description,
                      placeName: data.structured_formatting?.main_text || data.description,
                    });
                  }
                  setShowLocationSearch(false);
                }}
                query={{key: GOOGLE_MAPS_API_KEY, language: 'en', components: 'country:in'}}
                fetchDetails={true}
                keyboardShouldPersistTaps="always"
                enablePoweredByContainer={false}
                styles={{
                  container: {flex: 1},
                  textInput: styles.placesInput,
                  listView: {backgroundColor: colors.card},
                  row: {backgroundColor: colors.card, borderBottomWidth: 0.5, borderBottomColor: colors.border, padding: 12},
                  description: {color: colors.text, fontSize: 13},
                  poweredContainer: {display: 'none'},
                }}
                textInputProps={{placeholderTextColor: colors.textMuted, autoFocus: true}}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20},
  backBtn: {padding: 8},
  backArrow: {fontSize: 22, color: colors.text},
  headerTitle: {fontSize: 17, fontWeight: '700', color: colors.text},
  postBtn: {backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8},
  postBtnText: {fontSize: 14, fontWeight: '700', color: colors.text},
  photosSection: {paddingVertical: 12, paddingLeft: 16},
  addPhotoBtn: {
    width: 100, height: 120, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  addPhotoIcon: {fontSize: 28, marginBottom: 4},
  addPhotoText: {fontSize: 12, color: colors.primary, fontWeight: '600'},
  addPhotoSub: {fontSize: 10, color: colors.textMuted, marginTop: 2},
  photoThumb: {width: 100, height: 120, borderRadius: 12, marginRight: 10, overflow: 'hidden'},
  photoImage: {width: '100%', height: '100%'},
  removePhoto: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: {fontSize: 12, color: '#FFF', fontWeight: '700'},
  card: {backgroundColor: colors.card, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 14, borderWidth: 0.5, borderColor: colors.border},
  cardTitle: {fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border,
  },
  chipIcon: {fontSize: 16},
  chipLabel: {fontSize: 12, color: colors.textSecondary},
  adBadge: {backgroundColor: '#7C3AED', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginLeft: 4},
  adBadgeText: {fontSize: 8, color: '#FFF', fontWeight: '700'},
  feelingRow: {flexDirection: 'row', gap: 8},
  feelingChip: {alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border},
  feelingChipActive: {borderColor: colors.primary, backgroundColor: colors.primary + '22'},
  feelingEmoji: {fontSize: 22, marginBottom: 4},
  feelingLabel: {fontSize: 10, color: colors.textSecondary},
  titleInput: {backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15, borderWidth: 0.5, borderColor: colors.border, marginBottom: 10},
  descInput: {backgroundColor: colors.background, borderRadius: 10, padding: 12, color: colors.text, fontSize: 14, borderWidth: 0.5, borderColor: colors.border, height: 100, textAlignVertical: 'top'},
  charCount: {fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4},
  emojiToggleBtn: {backgroundColor: colors.background, borderRadius: 10, padding: 10, marginTop: 8, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border},
  emojiToggleText: {fontSize: 13, color: colors.textSecondary},
  emojiGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8},
  emojiBtn: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: 8},
  emojiText: {fontSize: 22},
  taggedList: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10},
  taggedChip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: colors.primary},
  taggedName: {fontSize: 12, color: colors.primary, fontWeight: '600'},
  taggedRemove: {fontSize: 11, color: colors.danger, fontWeight: '700'},
  tagSearchRow: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  addManualBtn: {backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12},
  addManualBtnText: {fontSize: 12, color: colors.text, fontWeight: '700'},
  tagResult: {padding: 10, borderTopWidth: 0.5, borderTopColor: colors.border},
  tagResultName: {fontSize: 13, color: colors.text, fontWeight: '600'},
  tagResultEmail: {fontSize: 11, color: colors.textMuted},
  selectedMusic: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: colors.primary},
  selectedMusicTitle: {fontSize: 13, color: colors.text, fontWeight: '600'},
  selectedMusicSub: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  musicArtwork: {width: 44, height: 44, borderRadius: 6},
  musicResult: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border},
  locationBtn: {backgroundColor: colors.primary + '22', borderRadius: 10, padding: 12, marginBottom: 10, alignItems: 'center', borderWidth: 0.5, borderColor: colors.primary},
  locationBtnText: {fontSize: 14, color: colors.primary, fontWeight: '600'},
  coordsText: {fontSize: 12, color: colors.success, marginTop: 4},
  tripLinkCard: {backgroundColor: colors.primary + '22', borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 14, borderWidth: 0.5, borderColor: colors.primary},
  tripLinkText: {fontSize: 13, color: colors.primary, fontWeight: '600'},
  modalOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 999},
  locationModalBox: {flex: 1, backgroundColor: colors.card, marginTop: 60, borderTopLeftRadius: 20, borderTopRightRadius: 20},
  modalHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border},
  modalTitle: {fontSize: 16, fontWeight: '700', color: colors.text},
  modalClose: {fontSize: 18, color: colors.textMuted, padding: 4},
  placesInput: {backgroundColor: colors.background, borderRadius: 8, color: colors.text, fontSize: 14, padding: 12, borderWidth: 0.5, borderColor: colors.border},
});

export default CreateMemoryScreen;
