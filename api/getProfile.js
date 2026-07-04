// api/getProfile.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'Missing UID' });

    try {
        await client.connect();
        const user = await client.db('first_fist').collection('user_profiles').findOne({ uid: uid });
        
        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({ error: 'Profile not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    } finally {
        await client.close();
    }
}