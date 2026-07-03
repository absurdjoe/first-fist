import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI; 

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
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dbClient = await clientPromise;
    const db = dbClient.db("firstfist_db"); 
    const collection = db.collection("scores");

    // --- GET: FETCH GLOBAL RANKINGS ---
    if (req.method === 'GET') {
      const scores = await collection.find({})
        .sort({ score: -1, force: -1 }) // Sort by Score, tie-break with Force
        .limit(50)
        .toArray();
      return res.status(200).json(scores);
    }

    // --- POST: SUBMIT NEW SCORE ---
    if (req.method === 'POST') {
      const { handle, score, force, city, vector } = req.body;
      
      // Strict payload validation
      if (!handle || typeof score !== 'number' || typeof force !== 'number') {
         return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      const cleanHandle = handle.trim();

      // 1. Fetch the user's existing record
      const existingEntry = await collection.findOne({ handle: cleanHandle });

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
         handle: cleanHandle,
         score,
         force,
         city: city || 'Unknown',
         vector: vector || 'cross',
         date: new Date()
      };

      await collection.updateOne(
        { handle: cleanHandle }, 
        { $set: newScoreData }, 
        { upsert: true } 
      );

      return res.status(201).json({ success: true, data: newScoreData });
    }

  } catch (e) {
    console.error("Leaderboard API Error:", e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}