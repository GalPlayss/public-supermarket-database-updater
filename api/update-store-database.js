import * as manager from './modules/manager';
import { initializeApp } from "firebase/app";
import {ref, set } from 'firebase/database'
import {getDatabase} from 'firebase-admin/database'

import * as admin from 'firebase-admin'

const serviceAccount = require("../firebase_key.json");

export const config = {
  maxDuration: 60,
};

export default async function updatedatabase() {
  // Initialize SpeedInsights with example configuration
  let now = Date.now()
  let msg = await manager.downloadStores(['TivTaam', 'RamiLevi', 'HaziHinam','Stop_Market', 'osherad', 'doralon'])
  if(msg){
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "______" // private
    });
    
    let database = getDatabase(app);
      
    await set(ref(database, "/"), {
      "last-updated": Date.now().toString(),
      "supermarkets": msg[0][0],
      "supermarkets-counter": msg[0][1],
      "items": msg[1][0],
      "items-counter": msg[1][1],
    });
  }
  
  return {
    "Time":Date.now() - now,
    "successful":"true",//,
    "supermarkets-counter":msg[0][1],
    "items-counter":msg[1][1],
  }
}
