import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

// 1. SECURE FIREBASE ADMIN INITIALIZATION (WITH NEWLINE FIX)
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            
            // CRITICAL FIX: Ensure newline characters in the private key are parsed correctly
            // Vercel environment variables often escape \n to \\n, causing verification crashes.
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing from environment variables.");
        }
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}

// 2. MONGODB CONNECTION CACHING
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("CRITICAL: MONGODB_URI is missing from environment variables.");
}

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    client = new MongoClient(uri);
    clientPromise = client.connect();
}

// 3. MIDDLEWARE HELPER
async function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Missing or malformed authorization token');
    }
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
}

// 4. MAIN ROUTE HANDLER
export default async function handler(req, res) {
    // Only allow GET and POST
    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let decodedToken;

    // --- PHASE 1: AUTHENTICATION ---
    try {
        decodedToken = await verifyToken(req);
    } catch (authError) {
        console.error("Auth Error:", authError.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const uid = decodedToken.uid; // 100% secure, verified by Google

    // --- PHASE 2: DATABASE OPERATIONS ---
    try {
        const dbClient = await clientPromise;
        const db = dbClient.db("firstfist_db");
        const collection = db.collection("users");

        // GET: Sync profile to a new phone
        if (req.method === 'GET') {
            const user = await collection.findOne({ uid: uid });
            if (user) {
                return res.status(200).json({ exists: true, username: user.username });
            }
            return res.status(200).json({ exists: false });
        }

        // POST: Claim a new username
        if (req.method === 'POST') {
            const { username } = req.body;
            
            if (!username || typeof username !== 'string') {
                return res.status(400).json({ error: 'Invalid username format' });
            }

            const cleanUsername = username.trim();

            // Check if username is already taken by someone else
            const existing = await collection.findOne({ username: cleanUsername });
            if (existing && existing.uid !== uid) {
                return res.status(409).json({ error: 'Username taken. Choose another.' });
            }

            // Upsert user profile
            await collection.updateOne(
                { uid: uid },
                { 
                    $set: { 
                        uid: uid, 
                        username: cleanUsername, 
                        email: decodedToken.email, 
                        lastLogin: new Date() 
                    } 
                },
                { upsert: true }
            );

            return res.status(201).json({ success: true, username: cleanUsername });
        }

    } catch (dbError) {
        // This accurately catches MongoDB connection errors or query failures
        console.error("Database Error:", dbError);
        return res.status(500).json({ error: 'Internal server error while syncing profile.' });
    }
}