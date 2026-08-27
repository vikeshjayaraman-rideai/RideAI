import {getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, updateDoc} from '@react-native-firebase/firestore';
import {getAuth} from '@react-native-firebase/auth';
import { GroupRider } from '../components/GroupRidersSection';

//const db = getFirestore();

export interface TripStop {
  id: string;
  name: string;
  description: string;
  type: 'meeting' | 'checkpoint' | 'tea' | 'lunch' | 'fuel' | 'hidden_gem' | 'destination';
  time: string;
  duration: string;
  lat?: number;
  lng?: number;
  distance?: string;
}

export interface TripPlan {
  id: string;
  uid: string;
  title: string;
  origin: string;
  destination: string;
  date: string;
  startTime: string;
  riderCount: number;
  totalDistance: string;
  totalDuration: string;
  difficulty: string;
  stops: any[];
  weatherAdvice: string;
  tips: string[];
  createdAt: string;
  sharedWith?: SharePermission[];
  status?: TripStatus;
  startedAt?: string;
  endedAt?: string;
  riders?: any[];
  creatorName?: string;
creatorPhoto?: string;
}

export interface SharePermission {
  uid: string;
  email: string;
  name: string;
  permission: 'view' | 'edit';
  sharedAt: string;
}

export type TripStatus = 'planned' | 'active' | 'completed';

export const startTrip = async (tripId: string): Promise<void> => {
  const db = getFirestore();
  const tripRef = doc(collection(db, 'trips'), tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) return;
  const trip = snap.data() as TripPlan;
  await setDoc(tripRef, {
    ...trip,
    status: 'active',
    startedAt: new Date().toISOString(),
  }, {merge: true});
};

export const endTrip = async (tripId: string): Promise<void> => {
  const db = getFirestore();
  const tripRef = doc(collection(db, 'trips'), tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) return;
  const trip = snap.data() as TripPlan;
  await setDoc(tripRef, {
    ...trip,
    status: 'completed',
    endedAt: new Date().toISOString(),
  }, {merge: true});
};

export const getTripById = async (id: string): Promise<TripPlan | null> => {
  const db = getFirestore();
  const snap = await getDoc(doc(collection(db, 'trips'), id));
  return snap.exists() ? (snap.data() as TripPlan) : null;
};
export const saveTripPlan = async (plan: TripPlan): Promise<void> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  const db = getFirestore();
  console.log('Saving trip with stops:', plan.stops.length);
  await setDoc(doc(collection(db, 'trips'), plan.id), {...plan, uid});
};
export const getUserTrips = async (): Promise<TripPlan[]> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const db = getFirestore();
  const q = query(collection(db, 'trips'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const trips = snap.docs.map(d => d.data() as TripPlan);
  console.log('Returning trips:', trips.length, trips[0]?.title);
  return trips;
};

export const searchUsers = async (searchQuery: string): Promise<any[]> => {
  const db = getFirestore();
  const currentUid = getAuth().currentUser?.uid;
  const snap = await getDocs(collection(db, 'users'));
  const results: any[] = [];
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.uid === currentUid) return;
    const q = searchQuery.toLowerCase();
    if (
      data.email?.toLowerCase().includes(q) ||
      data.name?.toLowerCase().includes(q)
    ) {
      results.push(data);
    }
  });
  return results.slice(0, 10);
};

export const shareTripWithUser = async (
  tripId: string,
  user: any,
  permission: 'view' | 'edit',
): Promise<void> => {
  const db = getFirestore();
  const tripRef = doc(collection(db, 'trips'), tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) return;
  const trip = snap.data() as TripPlan;
  const sharedWith = trip.sharedWith || [];
  const existing = sharedWith.findIndex((s: any) => s.uid === user.uid);
  const newShare: SharePermission = {
    uid: user.uid,
    email: user.email,
    name: user.name,
    permission,
    sharedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    sharedWith[existing] = newShare;
  } else {
    sharedWith.push(newShare);
  }
  await setDoc(tripRef, {...trip, sharedWith}, {merge: true});
};

export const revokeShareAccess = async (
  tripId: string,
  userId: string,
): Promise<void> => {
  const db = getFirestore();
  const tripRef = doc(collection(db, 'trips'), tripId);
  const snap = await getDoc(tripRef);
  if (!snap.exists()) return;
  const trip = snap.data() as TripPlan;
  const sharedWith = (trip.sharedWith || []).filter(
    (s: any) => s.uid !== userId,
  );
  await setDoc(tripRef, {...trip, sharedWith}, {merge: true});
};

// ── REPLACE getSharedWithMeTrips to also include rider trips ─────────────────
export const getSharedWithMeTrips = async (): Promise<TripPlan[]> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const db = getFirestore();
  const snap = await getDocs(collection(db, 'trips'));
  return snap.docs
    .map(d => d.data() as TripPlan)
    .filter(t =>
      t.sharedWith?.some((s: any) => s.uid === uid) ||
      t.riders?.some((r: any) => r.uid === uid && r.status === 'accepted')
    );
};

export const getMyInvites = async (): Promise<any[]> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const db = getFirestore();
  const snap = await getDocs(
    query(
      collection(db, 'trip_invites'),
      where('inviteeUid', '==', uid),
      where('status', '==', 'pending'),
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};


export const respondToInvite = async (
  inviteId: string,
  tripId: string,
  accept: boolean,
): Promise<void> => {
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;

  const status = accept ? 'accepted' : 'declined';

  // 1. Update invite doc status
  await updateDoc(doc(collection(db, 'trip_invites'), inviteId), { status });

  // 2. Update rider status in trip doc
  const tripSnap = await getDoc(doc(collection(db, 'trips'), tripId));
  if (!tripSnap.exists()) return;
  const trip = tripSnap.data() as TripPlan;

  const riders = (trip.riders || []).map((r: any) =>
    r.uid === uid ? { ...r, status } : r
  );

  if (accept) {
    // Add to sharedWith so rider can see the trip plan
    const sharedWith = trip.sharedWith || [];
    const alreadyShared = sharedWith.find((s: any) => s.uid === uid);
    const responderSnap = await getDoc(doc(collection(db, 'users'), uid));
    const responderData = responderSnap.exists() ? responderSnap.data() : {};
    const newShare = {
      uid,
      name: responderData.name || 'Rider',
      email: responderData.email || '',
      permission: 'view',
      sharedAt: new Date().toISOString(),
    };
    const updatedShared = alreadyShared
      ? sharedWith.map((s: any) => s.uid === uid ? newShare : s)
      : [...sharedWith, newShare];

    await updateDoc(doc(collection(db, 'trips'), tripId), {
      riders,
      sharedWith: updatedShared,
    });
  } else {
    // Remove rider + remove from sharedWith
    const filteredRiders = riders.filter((r: any) => r.uid !== uid);
    const filteredShared = (trip.sharedWith || []).filter((s: any) => s.uid !== uid);
    await updateDoc(doc(collection(db, 'trips'), tripId), {
      riders: filteredRiders,
      sharedWith: filteredShared,
    });
  }

  // 3. Notify the trip creator
  const respSnap = await getDoc(doc(collection(db, 'users'), uid));
  const responderName = respSnap.exists() ? respSnap.data()?.name : 'A rider';

  await setDoc(doc(collection(db, 'notifications'), `${tripId}_${uid}_response`), {
    type: 'invite_response',
    notifType: 'response',
    recipientUid: trip.uid,
    senderUid: uid,
    senderName: responderName,
    tripId,
    tripTitle: trip.title,
    status,
    message: accept
      ? `${responderName} accepted your invite and joined "${trip.title}"`
      : `${responderName} declined your invite to "${trip.title}"`,
    read: false,
    createdAt: new Date().toISOString(),
  });
};

// Get all notifications for current user (invites + responses)
export const getMyNotifications = async (): Promise<any[]> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const db = getFirestore();

  // Get pending invites for this user
  const inviteSnap = await getDocs(
    query(collection(db, 'trip_invites'), where('inviteeUid', '==', uid), where('status', '==', 'pending'))
  );
  const invites = inviteSnap.docs.map(d => ({
    id: d.id, ...d.data(), notifType: 'invite',
  }));

  // Get response notifications sent TO this user (as trip creator)
  const responseSnap = await getDocs(
    query(collection(db, 'notifications'), where('recipientUid', '==', uid), where('read', '==', false))
  );
  const responses = responseSnap.docs.map(d => ({
    id: d.id, ...d.data(), notifType: 'response',
  }));

  // Combine and sort by date
  return [...invites, ...responses].sort((a: any, b: any) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

// Mark notification as read
export const markNotificationRead = async (notifId: string): Promise<void> => {
  const db = getFirestore();
  try {
    await updateDoc(doc(collection(db, 'notifications'), notifId), { read: true });
  } catch {}
};

// Get unread notification count (for badge)
export const getUnreadNotificationCount = async (): Promise<number> => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return 0;
  const db = getFirestore();

  const [inviteSnap, responseSnap] = await Promise.all([
    getDocs(query(collection(db, 'trip_invites'), where('inviteeUid', '==', uid), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', uid), where('read', '==', false))),
  ]);

  return inviteSnap.size + responseSnap.size;
};

export const getGroupTrips = async (): Promise<TripPlan[]> => {
  // Trips where current user is an accepted/invited rider (not the creator)
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const db = getFirestore();
  const snap = await getDocs(collection(db, 'trips'));
  return snap.docs
    .map(d => d.data() as TripPlan)
    .filter(t =>
      t.uid !== uid &&
      t.riders?.some((r: any) => r.uid === uid && r.status === 'accepted')
    );
};
