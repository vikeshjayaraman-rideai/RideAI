import React, {useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, StatusBar, Alert,
  Image,
} from 'react-native';
import {colors} from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {saveUserProfile} from '../services/authService';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import {uploadPhoto} from '../services/storageService';
//import {savePhotoLocally} from '../services/storageService';

import {PermissionsAndroid, Platform} from 'react-native';
const BIKE_BRANDS: Record<string, string[]> = {
  'Royal Enfield': ['Bullet 350', 'Classic 350', 'Meteor 350', 'Himalayan', 'Hunter 350', 'Thunderbird', 'Continental GT 650', 'Interceptor 650'],
  'KTM': ['Duke 125', 'Duke 200', 'Duke 250', 'Duke 390', 'Adventure 390', 'Adventure 250', 'RC 390'],
  'Bajaj': ['Pulsar 150', 'Pulsar 200 NS', 'Pulsar RS 200', 'Dominar 400', 'Avenger 220'],
  'Honda': ['CB Shine', 'CB Hornet', 'CB300R', 'Africa Twin', 'CBR 650R', 'Activa'],
  'Yamaha': ['FZ-S', 'FZ25', 'MT-15', 'R15', 'R3', 'FZS-FI'],
  'Suzuki': ['Gixxer 150', 'Gixxer 250', 'Gixxer SF', 'Hayabusa', 'V-Strom 650'],
  'Kawasaki': ['Ninja 300', 'Ninja 400', 'Ninja 650', 'Z650', 'Versys 650'],
  'TVS': ['Apache RTR 160', 'Apache RTR 200', 'Apache RR 310', 'Ronin'],
  'BMW': ['G 310 R', 'G 310 GS', 'F 850 GS', 'S 1000 RR'],
  'Harley Davidson': ['Iron 883', 'Street Bob', 'Fat Boy', 'Road King', 'Pan America'],
};

const COLORS = ['Black', 'White', 'Red', 'Blue', 'Orange', 'Green', 'Yellow', 'Grey', 'Silver', 'Brown'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const RIDING_STYLES = ['Touring', 'Off-road', 'City commute', 'Sport', 'Adventure'];
const EXPERIENCE_LEVELS = ['Beginner (< 1 year)', 'Intermediate (1-3 years)', 'Experienced (3-7 years)', 'Expert (7+ years)'];

const OnboardingScreen = ({navigation, route}: any) => {
  const {uid, email, name, photoURL, existingProfile} = route.params || {};

  const [step, setStep] = useState(1);
  const [profilePhoto, setProfilePhoto] = useState(
    existingProfile?.photoURL || photoURL || '',
  );
  const [bikePhoto, setBikePhoto] = useState(
    existingProfile?.bikePhotoURL || '',
  );
  const [uploading, setUploading] = useState(false);

  const [profile, setProfile] = useState({
    name: existingProfile?.name || name || '',
    email: existingProfile?.email || email || '',
    phone: existingProfile?.phone || '',
    gender: existingProfile?.gender || '',
    bikeBrand: existingProfile?.bikeBrand || '',
    bikeModel: existingProfile?.bikeModel || '',
    bikeYear: existingProfile?.bikeYear || '',
    bikeColor: existingProfile?.bikeColor || '',
    vehicleNumber: existingProfile?.vehicleNumber || '',
    ridingStyle: existingProfile?.ridingStyle || '',
    experienceLevel: existingProfile?.experienceLevel || '',
    photoURL: existingProfile?.photoURL || photoURL || '',
    bikePhotoURL: existingProfile?.bikePhotoURL || '',
  });  
  const update = (key: string, value: string) =>
    setProfile(prev => ({...prev, [key]: value}));

  const handleNext = () => {
    if (step === 1) {
      if (!profile.name || !profile.email) {
        Alert.alert('Required', 'Please enter your name and email.');
        return;
      }
    }
    if (step === 2) {
      if (!profile.bikeBrand || !profile.bikeModel) {
        Alert.alert('Required', 'Please select your bike brand and model.');
        return;
      }
    }
    if (step === 3) {
      handleComplete();
      return;
    }
    setStep(step + 1);
  };

  const handleComplete = async () => {
  const currentUid = uid || existingProfile?.uid;
  await saveUserProfile({
    uid: currentUid,
    ...profile,
    createdAt: existingProfile?.createdAt || new Date().toISOString(),
  });
  navigation.replace('Main', {userName: profile.name});
};


const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    const permissions = [];
    if (Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
    } else {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    }
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const results = await PermissionsAndroid.requestMultiple(permissions);
    return Object.values(results).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  }
  return true;
};

const handlePickPhoto = async (type: 'profile' | 'bike') => {
  const granted = await requestPermissions();
  if (!granted) {
    Alert.alert('Permission denied', 'Please allow camera and storage access in Settings.');
    return;
  }
  Alert.alert('Choose Photo', 'Select photo source', [
    {
      text: 'Camera',
      onPress: () => {
        launchCamera(
          {mediaType: 'photo', quality: 0.8, saveToPhotos: true},
          async response => {
            if (response.didCancel) return;
            if (response.errorCode) {
              Alert.alert('Error', response.errorMessage || 'Camera error');
              return;
            }
            if (response.assets?.[0]?.uri) {
              const uri = response.assets[0].uri!;
              console.log('Got uri:', response.assets[0].uri);
              setUploading(true);
           
             try {
  const fileName = `${type}_${uid}_${Date.now()}.jpg`;
  console.log('Uploading photo:', uri, fileName); // ADD THIS
  const url = await uploadPhoto(uri, fileName);

                if (type === 'profile') {
                  setProfilePhoto(url);
                  update('photoURL', url);
                } else {
                  setBikePhoto(url);
                  update('bikePhotoURL', url);
                }
              } catch (e) {
                Alert.alert('Error', 'Could not save photo.');
              }
              setUploading(false);
            }
          },
        );
      },
    },
    {
      text: 'Gallery',
      onPress: () => {
        launchImageLibrary(
          {mediaType: 'photo', quality: 0.8},
          async response => {
            if (response.didCancel) return;
            if (response.errorCode) {
              Alert.alert('Error', response.errorMessage || 'Gallery error');
              return;
            }
            if (response.assets?.[0]?.uri) {
              const uri = response.assets[0].uri!;
              setUploading(true);
console.log('Starting upload, uri:', response.assets[0].uri);
try {
                const fileName = `${type}_${uid}_${Date.now()}.jpg`;
                const url = await uploadPhoto(uri, fileName);
                if (type === 'profile') {
                  setProfilePhoto(url);
                  update('photoURL', url);
                } else {
                  setBikePhoto(url);
                  update('bikePhotoURL', url);
                }
              } catch (e) {
                console.log('Upload catch error:', JSON.stringify(e), e?.message);
  Alert.alert('Error', 'Could not save photo.');
              }
              setUploading(false);
            }
          },
        );
      },
    },
    {text: 'Cancel', style: 'cancel'},
  ]);
};

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive,
            i === step && styles.progressDotCurrent]} />
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Step 1 — Personal Info */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>👤</Text>
         <Text style={styles.stepTitle}>
  {existingProfile ? 'Edit your info ✏️' : 'Tell us about yourself'}
</Text>
            <Text style={styles.stepSubtitle}>Your profile helps us personalise your ride experience</Text>

                        {/* Profile Photo */}
            <Text style={styles.label}>Profile Photo</Text>
            <TouchableOpacity
            style={styles.photoPickerRow}
            onPress={() => handlePickPhoto('profile')}
            disabled={uploading}>
            {profilePhoto ? (
                <Image source={{uri: profilePhoto}} style={styles.profilePhotoPreview} />
            ) : (
                <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>📷</Text>
                <Text style={styles.photoPlaceholderLabel}>Add Photo</Text>
                </View>
            )}
            <View style={styles.photoPickerInfo}>
                <Text style={styles.photoPickerTitle}>
                {profilePhoto ? '✅ Photo added' : 'Tap to add profile photo'}
                </Text>
                <Text style={styles.photoPickerSubtitle}>
                {uploading ? 'Uploading...' : 'Camera or Gallery'}
                </Text>
            </View>
            </TouchableOpacity>

           {/* Name */}
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Vikesh Kumar"
              placeholderTextColor={colors.textMuted}
              value={profile.name}
              onChangeText={v => update('name', v)}
            />

            {/* Show email as read-only */}
            <Text style={styles.label}>Email</Text>
            <View style={[styles.input, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>{profile.email}</Text>
            </View>

            <Text style={styles.label}>Phone Number</Text>
            <TextInput style={styles.input} placeholder="+91 9999999999"
              placeholderTextColor={colors.textMuted} value={profile.phone}
              onChangeText={v => update('phone', v)} keyboardType="phone-pad" />

            <Text style={styles.label}>Gender</Text>
            <View style={styles.chipGrid}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g}
                  style={[styles.chip, profile.gender === g && styles.chipActive]}
                  onPress={() => update('gender', g)}>
                  <Text style={[styles.chipText, profile.gender === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 2 — Vehicle Details */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>🏍️</Text>
            <Text style={styles.stepTitle}>Your ride</Text>
            <Text style={styles.stepSubtitle}>Tell us about your motorcycle</Text>

            <Text style={styles.label}>Bike Brand *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandScroll}>
              {Object.keys(BIKE_BRANDS).map(brand => (
                <TouchableOpacity key={brand}
                  style={[styles.brandChip, profile.bikeBrand === brand && styles.chipActive]}
                  onPress={() => { update('bikeBrand', brand); update('bikeModel', ''); }}>
                  <Text style={[styles.chipText, profile.bikeBrand === brand && styles.chipTextActive]}>
                    {brand}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {profile.bikeBrand ? (
              <>
                <Text style={styles.label}>Bike Model *</Text>
                <View style={styles.chipGrid}>
                  {BIKE_BRANDS[profile.bikeBrand].map(model => (
                    <TouchableOpacity key={model}
                      style={[styles.chip, profile.bikeModel === model && styles.chipActive]}
                      onPress={() => update('bikeModel', model)}>
                      <Text style={[styles.chipText, profile.bikeModel === model && styles.chipTextActive]}>
                        {model}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.label}>Year of Purchase</Text>
            <TextInput style={styles.input} placeholder="e.g. 2022"
              placeholderTextColor={colors.textMuted} value={profile.bikeYear}
              onChangeText={v => update('bikeYear', v)} keyboardType="numeric" maxLength={4} />

            <Text style={styles.label}>Bike Color</Text>
            <View style={styles.chipGrid}>
              {COLORS.map(c => (
                <TouchableOpacity key={c}
                  style={[styles.chip, profile.bikeColor === c && styles.chipActive]}
                  onPress={() => update('bikeColor', c)}>
                  <Text style={[styles.chipText, profile.bikeColor === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Vehicle Number</Text>
            <TextInput style={styles.input} placeholder="e.g. TN 01 AB 1234"
              placeholderTextColor={colors.textMuted} value={profile.vehicleNumber}
              onChangeText={v => update('vehicleNumber', v.toUpperCase())} autoCapitalize="characters" />
          
            {/* Bike Photo */}
<Text style={styles.label}>Bike Photo</Text>
<TouchableOpacity
  style={styles.photoPickerRow}
  onPress={() => handlePickPhoto('bike')}
  disabled={uploading}>
  {bikePhoto ? (
    <Image source={{uri: bikePhoto}} style={styles.profilePhotoPreview} />
  ) : (
    <View style={styles.photoPlaceholder}>
      <Text style={styles.photoPlaceholderText}>🏍️</Text>
      <Text style={styles.photoPlaceholderLabel}>Add Photo</Text>
    </View>
  )}
  <View style={styles.photoPickerInfo}>
    <Text style={styles.photoPickerTitle}>
      {bikePhoto ? '✅ Bike photo added' : 'Tap to add bike photo'}
    </Text>
    <Text style={styles.photoPickerSubtitle}>
      {uploading ? 'Uploading...' : 'Camera or Gallery'}
    </Text>
  </View>
</TouchableOpacity>

</View>
        )}

        {/* Step 3 — Riding Preferences */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>⚡</Text>
            <Text style={styles.stepTitle}>Your riding style</Text>
            <Text style={styles.stepSubtitle}>Helps AI suggest the perfect routes for you</Text>

            <Text style={styles.label}>Riding Style</Text>
            <View style={styles.chipGrid}>
              {RIDING_STYLES.map(s => (
                <TouchableOpacity key={s}
                  style={[styles.chip, profile.ridingStyle === s && styles.chipActive]}
                  onPress={() => update('ridingStyle', s)}>
                  <Text style={[styles.chipText, profile.ridingStyle === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Experience Level</Text>
            <View style={styles.chipGrid}>
              {EXPERIENCE_LEVELS.map(e => (
                <TouchableOpacity key={e}
                  style={[styles.chip, profile.experienceLevel === e && styles.chipActive]}
                  onPress={() => update('experienceLevel', e)}>
                  <Text style={[styles.chipText, profile.experienceLevel === e && styles.chipTextActive]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Your profile summary</Text>
              <Text style={styles.summaryItem}>👤 {profile.name}</Text>
              <Text style={styles.summaryItem}>📧 {profile.email}</Text>
              <Text style={styles.summaryItem}>🏍️ {profile.bikeBrand} {profile.bikeModel}</Text>
              {profile.vehicleNumber ? <Text style={styles.summaryItem}>🔢 {profile.vehicleNumber}</Text> : null}
            </View>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.bottomBar}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.nextBtn, step === 1 && {flex: 1}]} onPress={handleNext}>
          <Text style={styles.nextBtnText}>
           {step === 3 ? (existingProfile ? '✅ Save Changes' : '🚀 Start Riding!') : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  progressContainer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', paddingTop: 20, paddingBottom: 10, gap: 8,
  },
  progressDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotActive: {backgroundColor: colors.primary},
  progressDotCurrent: {width: 24, borderRadius: 4},
  stepContainer: {paddingHorizontal: 20, paddingTop: 10},
  stepEmoji: {fontSize: 40, marginBottom: 10},
  stepTitle: {fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 6},
  stepSubtitle: {fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 20},
  label: {fontSize: 13, color: colors.textSecondary, marginBottom: 8, marginTop: 16},
  input: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 0.5, borderColor: colors.border,
  },
  chipGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border,
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: 13, color: colors.textSecondary},
  chipTextActive: {color: colors.text, fontWeight: '600'},
  brandScroll: {marginBottom: 8},
  brandChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border, marginRight: 8,
  },
  summaryCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    marginTop: 20, borderWidth: 0.5, borderColor: colors.primary,
  },
  summaryTitle: {fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 10},
  summaryItem: {fontSize: 14, color: colors.textSecondary, marginBottom: 6},
  bottomBar: {
    flexDirection: 'row', padding: 16, gap: 12,
    borderTopWidth: 0.5, borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  backBtn: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border,
  },
  backBtnText: {fontSize: 15, fontWeight: '600', color: colors.textSecondary},
  nextBtn: {
    flex: 2, backgroundColor: colors.primary,
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  nextBtnText: {fontSize: 15, fontWeight: '700', color: colors.text},
  bottomPad: {height: 20},
  photoPickerRow: {
  flexDirection: 'row', alignItems: 'center',
  backgroundColor: colors.card, borderRadius: 12,
  padding: 12, borderWidth: 0.5, borderColor: colors.border, gap: 12,
},
photoPlaceholder: {
  width: 60, height: 60, borderRadius: 30,
  backgroundColor: colors.background, alignItems: 'center',
  justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  borderStyle: 'dashed',
},
photoPlaceholderText: {fontSize: 22},
photoPlaceholderLabel: {fontSize: 9, color: colors.textMuted, marginTop: 2},
profilePhotoPreview: {
  width: 60, height: 60, borderRadius: 30,
  borderWidth: 2, borderColor: colors.primary,
},
photoPickerInfo: {flex: 1},
photoPickerTitle: {fontSize: 14, fontWeight: '600', color: colors.text},
photoPickerSubtitle: {fontSize: 12, color: colors.textSecondary, marginTop: 2},
});

export default OnboardingScreen;