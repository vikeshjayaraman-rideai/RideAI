import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export const db = firestore();
export const firebaseAuth = auth();

// Firestore collections
export const COLLECTIONS = {
  USERS: 'users',
  TRIPS: 'trips',
  GROUP_RIDES: 'group_rides',
  EXPENSES: 'expenses',
};