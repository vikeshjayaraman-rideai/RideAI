import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithCredential,
  updateProfile,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
} from '@react-native-firebase/firestore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {LoginManager, AccessToken} from 'react-native-fbsdk-next';
import {GOOGLE_WEB_CLIENT_ID} from '@env';

const auth = getAuth();
const db = getFirestore();

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  photoURL?: string;
  bikeBrand?: string;
  bikeModel?: string;
  bikeYear?: string;
  bikeColor?: string;
  vehicleNumber?: string;
  ridingStyle?: string;
  experienceLevel?: string;
  createdAt?: string;
}

export const saveUserProfile = async (profile: UserProfile) => {
  await setDoc(
    doc(collection(db, 'users'), profile.uid),
    profile,
    {merge: true},
  );
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(collection(db, 'users'), uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  name: string,
) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, {displayName: name});
  return result.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const googleCredential = GoogleAuthProvider.credential(
    userInfo.data?.idToken ?? '',
  );
  const result = await signInWithCredential(auth, googleCredential);
  return result.user;
};

export const signInWithFacebook = async () => {
  const result = await LoginManager.logInWithPermissions([
    'public_profile',
    'email',
  ]);
  if (result.isCancelled) {
    throw new Error('Facebook login cancelled');
  }
  const data = await AccessToken.getCurrentAccessToken();
  if (!data) {
    throw new Error('No access token');
  }
  const facebookCredential = FacebookAuthProvider.credential(data.accessToken);
  const authResult = await signInWithCredential(auth, facebookCredential);
  return authResult.user;
};

export const signOut = async () => {
  await firebaseSignOut(auth);
  try {
    await GoogleSignin.signOut();
  } catch (e) {}
  try {
    LoginManager.logOut();
  } catch (e) {}
};

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};