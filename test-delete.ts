import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'mrponleu20000@gmail.com', 'm123456'); // If I know the password, or I can just simulate it.
    // Wait, I don't know the password. I can't test it directly as the user.
  } catch(e) {
    console.error(e);
  }
}
run();
