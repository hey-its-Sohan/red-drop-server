require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const serviceAccount = require('./red-drop-firebase-adminsdk.json')

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zodydsc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Firebase admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// verifyToken.js


const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // you now have uid, email, etc.
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(403).json({ message: 'Forbidden: Invalid token' });
  }
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const redDropCollection = client.db('redDropDB').collection('redDrop')
    const redDropUsers = client.db('redDropDB').collection('users')

    // get user profile details
    app.get('/user-data/:email', verifyToken, async (req, res) => {
      const requestedEmail = req.params.email;
      const query = { email: requestedEmail }
      const result = await redDropUsers.findOne(query)
      res.send(result)
    })

    // post users to Database
    app.post('/users', async (req, res) => {
      const userData = req.body
      const result = await redDropUsers.insertOne(userData)
      res.send(result)
    })

    // update user data
    app.patch('/update-user-data/:email', verifyToken, async (req, res) => {
      const requestedEmail = req.params.email
      const updateData = req.body;
      const result = await redDropUsers.updateOne(
        { email: requestedEmail },
        { $set: updateData }
      );
      res.send(result)

    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Donate Your Red Drop!')
})

app.listen(port, () => {
  console.log(`Share Bite is running on port: ${port}`)
})