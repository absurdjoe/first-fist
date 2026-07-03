import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("CRITICAL: MONGODB_URI is missing from environment variables.");
}

let client;
let clientPromise;

// MongoDB Connection Caching for Serverless
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

export default async function handler(req, res) {
    // Reject unsupported methods immediately
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const dbClient = await clientPromise;
        const db = dbClient.db("firstfist_db");
        const collection = db.collection("telemetry_logs");

        const { username, vector, force, score, stability } = req.body;

        // --- DATA SANITIZATION & SHIELDING ---
        // 1. Truncate Strings: Prevent malicious users from sending 10MB text blocks
        let cleanUsername = (username && typeof username === 'string') ? username.trim() : 'Guest';
        if (cleanUsername.length > 30) cleanUsername = cleanUsername.substring(0, 30);

        let cleanVector = (vector && typeof vector === 'string') ? vector.trim() : 'unknown';
        if (cleanVector.length > 20) cleanVector = cleanVector.substring(0, 20);
        
        // 2. Number Boundaries: Prevent integer overflow database crashes
        const cleanForce = Math.min(Math.max(Number(force) || 0, 0), 10000); 
        const cleanScore = Math.min(Math.max(Number(score) || 0, 0), 100);
        const cleanStability = Math.min(Math.max(Number(stability) || 100, 0), 100); 

        // Insert the clean summary object
        await collection.insertOne({
            username: cleanUsername,
            vector: cleanVector,
            force: cleanForce,
            score: cleanScore,
            stability: cleanStability,
            timestamp: new Date() 
        });

        return res.status(201).json({ success: true });
    } catch (e) {
        // Crucial: Log the actual error to Vercel so you can debug
        console.error("Telemetry API Error:", e);
        // We return a 500, but the frontend ignores it so the user's UI doesn't crash
        return res.status(500).json({ error: 'Telemetry logging failed' });
    }
}