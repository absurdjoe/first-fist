import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

// 1. SECURE FIREBASE ADMIN INITIALIZATION (WITH NEWLINE FIX)
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            
            // CRITICAL FIX: Ensure newline characters in the private key are parsed correctly
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT is missing.");
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
    // Reject unsupported methods immediately
    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const dbClient = await clientPromise;
        const db = dbClient.db("firstfist_db"); 
        const scoresCollection = db.collection("scores");

        // --- GET: FETCH GLOBAL RANKINGS ---
        if (req.method === 'GET') {
            const scores = await scoresCollection.find({})
                .sort({ score: -1, force: -1 }) // Sort by Score, tie-break with Force
                .limit(50)
                .toArray();
            return res.status(200).json(scores);
        }

        // --- POST: SUBMIT NEW SCORE (Auth Required) ---
        if (req.method === 'POST') {
            let decodedToken;
            
            // --- PHASE 1: AUTHENTICATION ---
            try {
                decodedToken = await verifyToken(req);
            } catch (authError) {
                console.error("Auth Error on Leaderboard:", authError.message);
                return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
            }
            
            const uid = decodedToken.uid; 
            const { score, force, vector, city } = req.body;

            // Strict payload validation
            if (typeof score !== 'number' || typeof force !== 'number') {
                return res.status(400).json({ error: 'Missing or invalid required fields' });
            }

            // --- PHASE 2: DATABASE OPERATIONS ---
            const usersCollection = db.collection("users");
            const userRecord = await usersCollection.findOne({ uid: uid });
            
            if (!userRecord || !userRecord.username) {
                return res.status(403).json({ error: 'No username on file. Please set a username first.' });
            }
            
            const verifiedUsername = userRecord.username;

            // 1. Fetch the user's existing record using UID
            const existingEntry = await scoresCollection.findOne({ uid: uid });

            // 2. High-Score Protection: Do not overwrite a higher score
            if (existingEntry && existingEntry.score >= score) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'Score received, but previous high score was retained.',
                    data: existingEntry 
                });
            }

            // 3. Upsert the new High Score
            const newScoreData = {
                uid: uid,
                username: verifiedUsername,
                score,
                force,
                city: city || 'Unknown',
                vector: vector || 'cross',
                date: new Date()
            };

            await scoresCollection.updateOne(
                { uid: uid }, 
                { $set: newScoreData }, 
                { upsert: true } 
            );

            return res.status(201).json({ success: true, data: newScoreData });
        }

    } catch (dbError) {
        console.error("Database Error on Leaderboard:", dbError);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}