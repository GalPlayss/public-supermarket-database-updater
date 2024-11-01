// imports
import { downloadStores } from "./modules/manager.js";
import { ref, set } from "firebase/database";
import { getDatabase } from "firebase-admin/database";
import { readFile } from 'fs/promises';

import admin from 'firebase-admin';


const getServiceAccount = async () => {
    try {
        const serviceAccount = await readFile(new URL('../firebase_key.json', import.meta.url), 'utf-8')
            .then(JSON.parse);
        return serviceAccount;
    } catch (error) {
        console.error('Error reading the service account JSON:', error);
    }
}

// set the vercel server uptime duration to 60 seconds
export const config = {
    maxDuration: 60,
};

// These are the stores that use Cerberus platform for FTP, The other stores are all Shufersal.
const stores = [
    "TivTaam",
    "RamiLevi",
    "HaziHinam",
    "Stop_Market",
    "osherad",
    "doralon",
    // "Keshet",
];

// request handler function
const handler = async(req, res) => {
    const now = Date.now();

    let msg = await downloadStores(stores).catch((err) => console.error(err));

    if (!msg) { // there was an error with the downloading.
        return res.status(404) 
    }

    const serviceAccount = await getServiceAccount();
    if (!serviceAccount) {
        console.error('Service account could not be loaded.');
        return res.status(500).json({ error: "Internal Server Error: Failed to load service account" });
    }
    
    console.log("admin.credential:", admin.credential);

    const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL:
            "<censored>",
    });

    const database = getDatabase(app);

    // put the data into the database and return a sucess message
    const data = {
        "last-updated": Date.now().toString(),
        "supermarkets": msg.stores,
        "supermarkets-counter": msg["store-counter"],
        "items": msg.prices,
        "items-counter": msg["item-counter"],
    };

    await set(ref(database, "/"), data);

    return res.json({
        "time taken to run": Date.now() - now,
        "supermarkets-counter": msg["store-counter"],
        "items-counter": msg["item-counter"],
    });
}

export default handler;