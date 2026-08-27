// components/CaptureMemoryModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Image, TextInput, Alert, ActivityIndicator, ScrollView,
  FlatList, PermissionsAndroid, Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { uploadPhoto } from '../services/storageService';
import { saveTripMemory, validateHiddenGem, TAG_CONFIG, MemoryTag } from '../services/echoService';

interface Props {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  currentLocation: { lat: number; lng: number } | null;
  currentAddress: string;
}

export default function CaptureMemoryModal({ visible, onClose, tripId, currentLocation, currentAddress }: Props) {
  useEffect(() => {
    if (visible) {
      console.log('CaptureModal opened - location:', JSON.stringify(currentLocation), 'address:', currentAddress);
    }
  }, [visible]);

  const [step, setStep] = useState<'source' | 'tag' | 'details' | 'validating'>('source');
  const [photos, setPhotos] = useState<string[]>([]); // local URIs
  const [selectedTag, setSelectedTag] = useState<MemoryTag>('just_vibes');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [autoChangedTag, setAutoChangedTag] = useState(false);

  // ── Request camera permission ───────────────────────────────────────────────
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ]);
      const allGranted = Object.values(granted).every(
        v => v === PermissionsAndroid.RESULTS.GRANTED
      );
      if (!allGranted) {
        Alert.alert('Permission needed', 'Please allow camera and storage access in Settings.');
        return false;
      }
      return true;
    } catch { return false; }
  };

  // ── Launch camera ───────────────────────────────────────────────────────────
  const MAX_PHOTOS = 3;

  const handleCamera = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Max photos', `Maximum ${MAX_PHOTOS} photos per memory.`);
      return;
    }
    const ok = await requestCameraPermission();
    if (!ok) return;
    launchCamera({ mediaType: 'photo', quality: 0.8, saveToPhotos: false }, (res) => {
      if (res.didCancel) return;
      if (res.errorCode) {
        Alert.alert('Camera error', res.errorMessage || 'Could not open camera');
        return;
      }
      if (res.assets?.[0]?.uri) {
        setPhotos(prev => [...prev, res.assets![0].uri!]);
        setStep('tag');
      }
    });
  };

  // ── Launch gallery (multiple) ───────────────────────────────────────────────
  const handleGallery = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Max photos', `Maximum ${MAX_PHOTOS} photos per memory.`);
      return;
    }
    const ok = await requestCameraPermission();
    if (!ok) return;
    const remaining = MAX_PHOTOS - photos.length;
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, selectionLimit: remaining },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode) {
          Alert.alert('Gallery error', res.errorMessage || 'Could not open gallery');
          return;
        }
        if (res.assets?.length) {
          const uris = res.assets.map(a => a.uri!).filter(Boolean);
          setPhotos(prev => [...prev, ...uris]);
          setStep('tag');
        }
      }
    );
  };

  // ── Add more photos ─────────────────────────────────────────────────────────
  const handleAddMore = () => {
    Alert.alert('Add Photos', 'Choose source', [
      { text: '📷 Camera', onPress: async () => {
        launchCamera({ mediaType: 'photo', quality: 0.8 }, (res) => {
          if (res.assets?.[0]?.uri) setPhotos(prev => [...prev, res.assets![0].uri!]);
        });
      }},
      { text: '🖼️ Gallery', onPress: async () => {
        launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 3 }, (res) => {
          if (res.assets?.length) {
            setPhotos(prev => [...prev, ...res.assets!.map(a => a.uri!).filter(Boolean)]);
          }
        });
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Tag selection with auto-change ─────────────────────────────────────────
  const handleTagSelect = async (tag: MemoryTag) => {
    setSelectedTag(tag);
    setAutoChangedTag(false);
    if (tag === 'hidden_gem' && currentLocation) {
      setStep('validating');
      const result = await validateHiddenGem(currentLocation.lat, currentLocation.lng);
      setValidationResult(result);
      if (!result.isValid) {
        // Auto-change tag to scenic_view as best alternative
        setSelectedTag('scenic_view');
        setAutoChangedTag(true);
      }
      setStep('details');
    } else {
      setValidationResult(null);
      setStep('details');
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!currentLocation) { Alert.alert('No GPS', 'Location not available yet.'); return; }
    if (!name.trim()) { Alert.alert('Required', 'Please add a name for this memory.'); return; }
    if (photos.length === 0) { Alert.alert('Required', 'Please add at least one photo.'); return; }
    setSaving(true);
    try {
      // Upload all photos
      const uploadedURLs: string[] = [];
      for (const uri of photos) {
        const url = await uploadPhoto(uri, `memory_${Date.now()}_${Math.random()}.jpg`);
        uploadedURLs.push(url);
      }

      const isHiddenGem = selectedTag === 'hidden_gem' && validationResult?.isValid;
      // If user tagged as hidden_gem but validation failed — auto-change to scenic_view
      const finalTag = selectedTag === 'hidden_gem' && !isHiddenGem ? 'scenic_view' : selectedTag;

      await saveTripMemory(tripId, {
        tripId,
        photoURL: uploadedURLs[0],
        photoURLs: uploadedURLs,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        address: currentAddress || `${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`,
        tag: finalTag,
        name: name.trim(),
        description: description.trim(),
        isHiddenGem,
        validatedHiddenGem: isHiddenGem,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      });

      Alert.alert(
        isHiddenGem ? '💎 Hidden Gem Saved!' : '📸 Memory Saved!',
        `${uploadedURLs.length} photo${uploadedURLs.length > 1 ? 's' : ''} added to your Echoes!`,
        [{ text: 'Awesome!', onPress: handleClose }]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not save memory. Try again.');
    }
    setSaving(false);
  };

  const handleClose = () => {
    setStep('source');
    setPhotos([]);
    setSelectedTag('just_vibes');
    setName('');
    setDescription('');
    setValidationResult(null);
    setAutoChangedTag(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.panel}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={step === 'source' ? handleClose : () => setStep(step === 'details' ? 'tag' : 'source')} style={s.backBtn}>
              <Text style={s.backBtnText}>{step === 'source' ? '✕' : '←'}</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>
              {step === 'source' ? '📸 Add Memory' :
               step === 'tag' ? '🏷️ Tag This Moment' :
               step === 'validating' ? '🔍 Checking...' : '✏️ Details'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

            {/* Step 1 — Photo source */}
            {step === 'source' && (
              <View style={s.sourceStep}>
                <Text style={s.stepDesc}>📍 {currentAddress || 'Getting your location...'}</Text>
                <View style={s.sourceButtons}>
                  <TouchableOpacity style={s.sourceBtn} onPress={handleCamera}>
                    <Text style={s.sourceBtnIcon}>📷</Text>
                    <Text style={s.sourceBtnTitle}>Camera</Text>
                    <Text style={s.sourceBtnSub}>Capture right now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.sourceBtn} onPress={handleGallery}>
                    <Text style={s.sourceBtnIcon}>🖼️</Text>
                    <Text style={s.sourceBtnTitle}>Gallery</Text>
                    <Text style={s.sourceBtnSub}>Up to 3 photos</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.hint}>GPS location and timestamp saved automatically</Text>
              </View>
            )}

            {/* Step 2 — Tag */}
            {step === 'tag' && (
              <View style={s.tagStep}>
                {/* Photos preview */}
                <FlatList
                  horizontal
                  data={photos}
                  keyExtractor={(_, i) => i.toString()}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.photosPreview}
                  renderItem={({ item, index }) => (
                    <View style={s.photoThumbWrap}>
                      <Image source={{ uri: item }} style={s.photoThumb} />
                      <TouchableOpacity style={s.removePhotoBtn}
                        onPress={() => setPhotos(prev => prev.filter((_, i) => i !== index))}>
                        <Text style={s.removePhotoBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  ListFooterComponent={
                    <TouchableOpacity style={s.addMoreBtn} onPress={handleAddMore}>
                      <Text style={s.addMoreIcon}>+</Text>
                      <Text style={s.addMoreText}>Add more</Text>
                    </TouchableOpacity>
                  }
                />
                <Text style={s.photoCount}>{photos.length} photo{photos.length !== 1 ? 's' : ''} selected</Text>

                <Text style={s.tagTitle}>What is this moment?</Text>
                <View style={s.tagGrid}>
                  {(Object.entries(TAG_CONFIG) as [MemoryTag, any][]).map(([tag, config]) => (
                    <TouchableOpacity key={tag}
                      style={[s.tagBtn, { borderColor: config.color }]}
                      onPress={() => handleTagSelect(tag)}>
                      <Text style={s.tagEmoji}>{config.emoji}</Text>
                      <Text style={[s.tagLabel, { color: config.color }]}>{config.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Validating */}
            {step === 'validating' && (
              <View style={s.validatingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={s.validatingText}>Checking Google Maps within 500m...</Text>
              </View>
            )}

            {/* Step 3 — Details */}
            {step === 'details' && (
              <View style={s.detailsStep}>
                {/* Photos scroll */}
                <FlatList
                  horizontal
                  data={photos}
                  keyExtractor={(_, i) => i.toString()}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.photosPreview}
                  renderItem={({ item }) => (
                    <Image source={{ uri: item }} style={s.photoThumb} />
                  )}
                />

                {/* Validation result */}
                {validationResult && (
                  <View style={[s.validationBanner, {
                    backgroundColor: validationResult.isValid ? '#05966922' : '#DC262622',
                    borderColor: validationResult.isValid ? '#059669' : '#DC2626',
                  }]}>
                    <Text style={[s.validationIcon]}>
                      {validationResult.isValid ? '💎' : '⚠️'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.validationText, { color: validationResult.isValid ? '#059669' : '#DC2626' }]}>
                        {validationResult.reason}
                      </Text>
                      {autoChangedTag && (
                        <Text style={s.autoChangedText}>
                          Tag changed to 🏔️ Scenic View automatically
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Current tag with change option */}
                <View style={s.currentTagRow}>
                  <View style={[s.currentTagBadge, { backgroundColor: TAG_CONFIG[selectedTag].color + '22' }]}>
                    <Text style={[s.currentTagText, { color: TAG_CONFIG[selectedTag].color }]}>
                      {TAG_CONFIG[selectedTag].emoji} {TAG_CONFIG[selectedTag].label}
                    </Text>
                  </View>
                  <TouchableOpacity style={s.changeTagBtn} onPress={() => setStep('tag')}>
                    <Text style={s.changeTagBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>Name this memory *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Stunning Valley View..."
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />

                <Text style={s.inputLabel}>Description (optional)</Text>
                <TextInput
                  style={[s.input, s.inputMultiline]}
                  placeholder="What made this moment special?"
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline numberOfLines={3}
                />

                <Text style={s.locationLine}>📍 {currentAddress || 'Location captured'}</Text>

                <TouchableOpacity
                  style={[s.saveBtn, saving && s.saveBtnDisabled]}
                  onPress={handleSave} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={s.saveBtnText}>
                        💾 Save {photos.length} photo{photos.length !== 1 ? 's' : ''} to Echoes
                      </Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', borderTopWidth: 0.5, borderColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sourceStep: { padding: 20 },
  stepDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 24, textAlign: 'center' },
  sourceButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  sourceBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, gap: 8 },
  sourceBtnIcon: { fontSize: 36 },
  sourceBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  sourceBtnSub: { fontSize: 11, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  tagStep: { padding: 20 },
  photosPreview: { paddingBottom: 12, gap: 8 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: 10 },
  removePhotoBtn: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  removePhotoBtnText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  addMoreBtn: { width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  addMoreIcon: { fontSize: 24, color: colors.primary },
  addMoreText: { fontSize: 10, color: colors.textMuted },
  photoCount: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  tagTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 14, textAlign: 'center' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tagBtn: { width: '47%', backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, gap: 6 },
  tagEmoji: { fontSize: 28 },
  tagLabel: { fontSize: 13, fontWeight: '700' },
  validatingWrap: { padding: 60, alignItems: 'center', gap: 16 },
  validatingText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  detailsStep: { padding: 16 },
  validationBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 0.5 },
  validationIcon: { fontSize: 20 },
  validationText: { fontSize: 13, fontWeight: '600' },
  autoChangedText: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  currentTagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  currentTagBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  currentTagText: { fontSize: 13, fontWeight: '700' },
  changeTagBtn: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border },
  changeTagBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  inputLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderRadius: 12, padding: 12, color: colors.text, fontSize: 14, borderWidth: 0.5, borderColor: colors.border, marginBottom: 14 },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  locationLine: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
