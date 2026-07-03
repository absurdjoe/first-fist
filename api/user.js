import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

// Initialize Firebase Admin securely
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}

const uri = process.env.MONGODB_URI;
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

// Middleware to Verify Token
async function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Missing token');
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
}

export default async function handler(req, res) {
    try {
        const decodedToken = await verifyToken(req);
        const uid = decodedToken.uid; // 100% secure, verified by Google

        const dbClient = await clientPromise;
        const db = dbClient.db("firstfist_db");
        const collection = db.collection("users");

        // GET: Sync profile to a new phone
        if (req.method === 'GET') {
            const user = await collection.findOne({ uid: uid });
            if (user) return res.status(200).json({ exists: true, username: user.username });
            return res.status(200).json({ exists: false });
        }

        // POST: Claim a new username
        if (req.method === 'POST') {
            const { username } = req.body;
            const cleanUsername = username.trim();

            const existing = await collection.findOne({ username: cleanUsername });
            if (existing && existing.uid !== uid) {
                return res.status(409).json({ error: 'Username taken. Choose another.' });
            }

            await collection.updateOne(
                { uid: uid },
                { $set: { uid, username: cleanUsername, email: decodedToken.email, lastLogin: new Date() } },
                { upsert: true }
            );

            return res.status(201).json({ success: true, username: cleanUsername });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized or Token Expired' });
    }
}