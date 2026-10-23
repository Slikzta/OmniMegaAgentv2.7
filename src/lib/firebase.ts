import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import rawFirebaseConfig from '../../firebase-applet-config.json';

// Read Firebase API key from environment variable (FIREBASE_API_KEY or shared GEMINI_API_KEY)
const resolvedApiKey =
  (typeof process !== 'undefined' && (process.env?.FIREBASE_API_KEY || process.env?.GEMINI_API_KEY)) ||
  rawFirebaseConfig.apiKey ||
  '';

const firebaseConfig = {
  ...rawFirebaseConfig,
  apiKey: resolvedApiKey,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

// Connection test
async function testConnection() {
  if (!firebaseConfig.apiKey) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
