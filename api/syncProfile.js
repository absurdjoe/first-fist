// api/syncProfile.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI; // Make sure this is in your Vercel Environment Variables
const client = new MongoClient(uri);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, username, weight, academy, stats, history } = req.body;
    if (!uid) return res.status(400).json({ error: 'Missing UID' });

    try {
        await client.connect();
        const database = client.db('first_fist');
        const users = database.collection('user_profiles');

        // Upsert: Update the user if they exist, create them if they don't
        await users.updateOne(
            { uid: uid }, 
            {
                $set: {
                    username: username,
                    weight: weight,
                    academy: academy,
                    stats: stats,
                    history: history,
                    last_synced: new Date()
                }
            },
            { upsert: true }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Database connection failed' });
    } finally {
        await client.close();
    }
}