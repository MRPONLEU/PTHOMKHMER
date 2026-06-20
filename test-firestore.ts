import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);
async function run() {
  try {
    // Note: Node environment won't have authentication state automatically unless we log in. 
    // Which means it will be unauthenticated. Let me just test if the code syntax is OK.
    console.log("Config loaded");
  } catch(e) {
    console.error(e);
  }
}
run();
