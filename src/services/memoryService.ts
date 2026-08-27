import {
  getFirestore, collection, doc, setDoc, getDocs,
  getDoc, updateDoc, deleteDoc, query, where, orderBy,
  arrayUnion, arrayRemove,
} from '@react-native-firebase/firestore';
import {getAuth} from '@react-native-firebase/auth';
import {getStorage, ref} from '@react-native-firebase/storage';


export type MemoryType = 'hidden_gem' | 'scenic_view' | 'food_stop' | 'landmark' | 'rest_stop' | 'general';

export interface RideMemory {
  id: string;
  uid: string;
  userName: string;
  userPhoto: string;
  title: string;
  description: string;
  type: MemoryType;
  photos: string[];
  location: {
    lat: number;
    lng: number;
    address: string;
    placeName: string;
    postType?: PostType;
feeling?: Feeling;
music?: {title: string; spotifyUrl?: string};
taggedUsers?: TaggedUser[];
  };
  tripId?: string;
  tripTitle?: string;
  likes: string[];
  createdAt: string;
}

export const MEMORY_TYPES: {value: MemoryType; label: string; icon: string; color: string}[] = [
  {value: 'hidden_gem', label: 'Hidden Gem', icon: '💎', color: '#DB2777'},
  {value: 'scenic_view', label: 'Scenic View', icon: '🏔️', color: '#2563EB'},
  {value: 'food_stop', label: 'Food Stop', icon: '🍽️', color: '#DC2626'},
  {value: 'landmark', label: 'Landmark', icon: '🏛️', color: '#D97706'},
  {value: 'rest_stop', label: 'Rest Stop', icon: '☕', color: '#059669'},
  {value: 'general', label: 'Ride Memory', icon: '🏍️', color: '#7C3AED'},
];


export const FEELINGS: {value: Feeling; label: string; emoji: string}[] = [
  {value: 'amazing', label: 'Amazing', emoji: '🤩'},
  {value: 'adventurous', label: 'Adventurous', emoji: '🏔️'},
  {value: 'peaceful', label: 'Peaceful', emoji: '😌'},
  {value: 'tired', label: 'Tired but happy', emoji: '😅'},
  {value: 'excited', label: 'Excited', emoji: '🤸'},
  {value: 'grateful', label: 'Grateful', emoji: '🙏'},
  {value: 'proud', label: 'Proud', emoji: '💪'},
  {value: 'nostalgic', label: 'Nostalgic', emoji: '🥹'},
];

export const POST_TYPES: {value: PostType; label: string; icon: string; color: string}[] = [
  {value: 'personal', label: 'Personal Post', icon: '👤', color: '#2563EB'},
  {value: 'community', label: 'Community', icon: '👥', color: '#059669'},
  {value: 'group', label: 'Group Ride', icon: '🏍️', color: '#D97706'},
  {value: 'sponsored', label: 'Sponsored', icon: '📢', color: '#7C3AED'},
];

export interface TaggedUser {
  uid: string;
  name: string;
  photoURL?: string;
}

// Replace uploadBytes with putFile for react-native-firebase
export const uploadMemoryPhoto = async (uri: string, memoryId: string, index: number): Promise<string> => {
  try {
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('image', {
      uri: uri,
      type: 'image/jpeg',
      name: `photo_${index}.jpg`,
    } as any);

    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7',
      },
      body: formData,
    });

    const data = await response.json();
    if (data.success) {
      return data.data.link;
    }
    throw new Error('Upload failed: ' + data.data?.error);
  } catch (e) {
    console.error('Imgur upload error:', e);
    throw e;
  }
};

export const createMemory = async (
  memory: Omit<RideMemory, 'id' | 'uid' | 'userName' | 'userPhoto' | 'likes' | 'createdAt'>,
  photoUris: string[],
): Promise<string> => {
  const db = getFirestore();
  const auth = getAuth();
  const uid = auth.currentUser?.uid || '';
  const memoryId = `memory_${Date.now()}`;

  // Upload photos
  const photoURLs: string[] = [];
  for (let i = 0; i < photoUris.length; i++) {
    const url = await uploadMemoryPhoto(photoUris[i], memoryId, i);
    photoURLs.push(url);
  }

  // Get user profile
  let userName = auth.currentUser?.displayName || 'Rider';
  let userPhoto = auth.currentUser?.photoURL || '';
  try {
    const userSnap = await getDoc(doc(collection(db, 'users'), uid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      userName = userData.name || userName;
      userPhoto = userData.photoURL || userPhoto;
    }
  } catch (e) {}

 const newMemory: any = {
    id: memoryId,
    uid,
    userName,
    userPhoto,
    title: memory.title,
    description: memory.description || '',
    type: memory.type,
    postType: memory.postType || 'personal',
    photos: photoURLs,
    location: {
      lat: memory.location?.lat || 0,
      lng: memory.location?.lng || 0,
      address: memory.location?.address || '',
      placeName: memory.location?.placeName || '',
    },
    likes: [],
    createdAt: new Date().toISOString(),
  };

// Add optional fields — only if they have real values (no undefined)
  if (memory.feeling) newMemory.feeling = memory.feeling;
  if ((memory as any).music?.title) {
    const m = (memory as any).music;
    newMemory.music = {
      title: m.title,
      ...(m.spotifyUrl && {spotifyUrl: m.spotifyUrl}),
      ...(m.previewUrl && {previewUrl: m.previewUrl}),
      ...(m.artwork && {artwork: m.artwork}),
    };
  }
  if ((memory as any).taggedUsers?.length > 0) {
    newMemory.taggedUsers = (memory as any).taggedUsers.map((u: any) => ({
      uid: u.uid,
      name: u.name,
      ...(u.photoURL && {photoURL: u.photoURL}),
    }));
  }
  if ((memory as any).tripId) newMemory.tripId = (memory as any).tripId;
  if ((memory as any).tripTitle) newMemory.tripTitle = (memory as any).tripTitle;

  await setDoc(doc(collection(db, 'memories'), memoryId), newMemory);
  return memoryId;
};

export const getFeedMemories = async (followingUids: string[]): Promise<RideMemory[]> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];

  // Include own memories + following
  const uidsToFetch = [...new Set([uid, ...followingUids])];

  if (uidsToFetch.length === 0) return [];

  // Firestore 'in' query supports max 10 items
  const chunks = [];
  for (let i = 0; i < uidsToFetch.length; i += 10) {
    chunks.push(uidsToFetch.slice(i, i + 10));
  }

  let allMemories: RideMemory[] = [];
  for (const chunk of chunks) {
    const snap = await getDocs(
      query(collection(db, 'memories'), where('uid', 'in', chunk)),
    );
    allMemories = allMemories.concat(snap.docs.map(d => d.data() as RideMemory));
  }

  // Sort by createdAt descending
  return allMemories.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

export const getMyMemories = async (): Promise<RideMemory[]> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, 'memories'), where('uid', '==', uid)),
  );
  return snap.docs
    .map(d => d.data() as RideMemory)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getHiddenGems = async (): Promise<RideMemory[]> => {
  const db = getFirestore();
  const snap = await getDocs(
    query(collection(db, 'memories'), where('type', '==', 'hidden_gem')),
  );
  return snap.docs.map(d => d.data() as RideMemory);
};



export interface TaggedUser {
  uid: string;
  name: string;
  photoURL?: string;
}

export interface RideMemory {
  id: string;
  uid: string;
  userName: string;
  userPhoto: string;
  title: string;
  description: string;
  type: MemoryType;
  postType: PostType;
  photos: string[];
  location: {
    lat: number;
    lng: number;
    address: string;
    placeName: string;
  };
  tripId?: string;
  tripTitle?: string;
  feeling?: Feeling;
music?: {
  title: string;
  artist?: string;
  artwork?: string;
  deezerTrackId?: string;  // store this instead of previewUrl
  previewUrl?: string;     // keep for backward compat but don't rely on it
}
  taggedUsers?: TaggedUser[];
  likes: string[];
  createdAt: string;
}

export const likeMemory = async (memoryId: string): Promise<void> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(collection(db, 'memories'), memoryId), {
    likes: arrayUnion(uid),
  });
};

export const unlikeMemory = async (memoryId: string): Promise<void> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(collection(db, 'memories'), memoryId), {
    likes: arrayRemove(uid),
  });
};

export const deleteMemory = async (memoryId: string): Promise<void> => {
  const db = getFirestore();
  await deleteDoc(doc(collection(db, 'memories'), memoryId));
};

export const followUser = async (targetUid: string): Promise<void> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid || uid === targetUid) return;
  await updateDoc(doc(collection(db, 'users'), uid), {following: arrayUnion(targetUid)});
  await updateDoc(doc(collection(db, 'users'), targetUid), {followers: arrayUnion(uid)});
};

export const unfollowUser = async (targetUid: string): Promise<void> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(collection(db, 'users'), uid), {following: arrayRemove(targetUid)});
  await updateDoc(doc(collection(db, 'users'), targetUid), {followers: arrayRemove(uid)});
};

export const getFollowing = async (): Promise<string[]> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDoc(doc(collection(db, 'users'), uid));
  return snap.exists() ? (snap.data()?.following || []) : [];
};
