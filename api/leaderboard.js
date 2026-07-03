import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';

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

if (!uri) {
  throw new Error('Please add your Mongo URI to Vercel Environment Variables');
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

async function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Missing token');
    const token = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(token);
}

export default async function handler(req, res) {
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
        .sort({ score: -1, force: -1 })
        .limit(50)
        .toArray();
      return res.status(200).json(scores);
    }

    // --- POST: SUBMIT NEW SCORE (auth required) ---
    if (req.method === 'POST') {
      let decodedToken;
      try {
        decodedToken = await verifyToken(req);
      } catch (e) {
        return res.status(401).json({ error: 'Unauthorized or Token Expired' });
      }
      const uid = decodedToken.uid;

      const { score, force, vector, city } = req.body;
      if (typeof score !== 'number' || typeof force !== 'number') {
        return res.status(400).json({ error: 'Missing or invalid required fields' });
      }

      // Never trust a client-supplied username — look up the one tied to this uid
      const usersCollection = db.collection("users");
      const userRecord = await usersCollection.findOne({ uid });
      if (!userRecord || !userRecord.username) {
        return res.status(400).json({ error: 'No username on file. Please set a username first.' });
      }
      const verifiedUsername = userRecord.username;

      const existingEntry = await scoresCollection.findOne({ username: verifiedUsername });

      if (existingEntry && existingEntry.score >= score) {
        return res.status(200).json({
          success: true,
          message: 'Score received, but previous high score was retained.',
          data: existingEntry
        });
      }

      const newScoreData = {
        uid,
        username: verifiedUsername,
        score,
        force,
        city: city || 'Unknown',
        vector: vector || 'cross',
        date: new Date()
      };

      await scoresCollection.updateOne(
        { username: verifiedUsername },
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