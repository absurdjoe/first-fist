import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

// Failsafe: Ensure environment variables are loaded
if (!uri) {
  throw new Error('Please add your Mongo URI to Vercel Environment Variables');
}

let client;
let clientPromise;

// MongoDB Connection Caching for Serverless Environments
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

    const { handle, vector, force, score, stability } = req.body;

    // --- DATA SANITIZATION & TYPE CASTING ---
    // Ensure data types are correct so your MongoDB analytics remain clean
    const cleanHandle = (handle && typeof handle === 'string') ? handle.trim() : 'Guest';
    const cleanVector = (vector && typeof vector === 'string') ? vector : 'unknown';
    
    // Cast to Numbers to prevent string injection, fallback to 0 if NaN
    const cleanForce = Number(force) || 0;
    const cleanScore = Number(score) || 0;
    const cleanStability = Number(stability) || 100; 

    // Insert the clean summary object
    await collection.insertOne({
      handle: cleanHandle,
      vector: cleanVector,
      force: cleanForce,
      score: cleanScore,
      stability: cleanStability,
      timestamp: new Date() // Used for your 90-day Auto-Delete (TTL) index!
    });

    return res.status(201).json({ success: true });
  } catch (e) {
    // Crucial: Log the actual error to Vercel so you can debug if the database connection drops
    console.error("Telemetry API Error:", e);
    return res.status(500).json({ error: 'Telemetry logging failed' });
  }
}