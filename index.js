require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

// verifyToken: to verify the access token


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
    const donationRequestCollection = client.db('redDropDB').collection('donationRequests')

    // verifyAdmin: to verify if user is admin or not
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.user?.email;
        if (!email) {
          return res.status(401).send({ error: 'Unauthorized' });
        }

        const user = await redDropUsers.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }

        if (user.role !== 'admin') {
          return res.status(403).send({ error: 'Forbidden: Admins only' });
        }

        next();
      } catch (error) {
        console.error("verifyAdmin error:", error);
        res.status(500).send({ error: 'Internal server error' });
      }
    };

    // get all users
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await redDropUsers.find().toArray()
      res.send(result)
    })


    // get user profile details
    app.get('/user-data/:email', verifyToken, async (req, res) => {
      const requestedEmail = req.params.email;
      const query = { email: requestedEmail }
      const result = await redDropUsers.findOne(query)
      res.send(result)
    })

    // get user status API
    app.get('/user-status/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await redDropUsers.findOne({ email });
      if (!user) return res.status(404).send({ message: 'User not found' });

      res.send({ status: user.status });
    });

    // get user role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await redDropUsers.findOne({ email });
      if (!user) return res.status(404).send({ role: null });
      res.send({ role: user.role });
    });

    // get my donation requests API
    app.get('/my-donation-requests/:email', verifyToken, async (req, res) => {
      const requestedEmail = req.params.email
      const result = await donationRequestCollection.find({ requesterEmail: requestedEmail }).toArray()
      res.send(result)
    })

    // get stats data for admin
    app.get('/dashboard-stats', verifyToken, verifyAdmin, async (req, res) => {
      const usersCount = await redDropUsers.estimatedDocumentCount();
      const requestsCount = await donationRequestCollection.estimatedDocumentCount();
      // total fund
      res.send({
        users: usersCount,
        requests: requestsCount
      })
    })

    // post users to Database
    app.post('/users', async (req, res) => {
      const userData = req.body
      const result = await redDropUsers.insertOne(userData)
      res.send(result)
    })

    // post donation requests
    app.post('/donation-requests', verifyToken, async (req, res) => {
      const donationData = req.body;
      const result = await donationRequestCollection.insertOne(donationData);
      res.send(result);
    });

    // update user data
    app.patch('/update-user-data/:id', verifyToken, async (req, res) => {
      const requestedId = req.params.id
      const updateData = req.body;

      const result = await redDropUsers.updateOne(
        { _id: new ObjectId(requestedId) },
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
  console.log(`RedDrop is running on port: ${port}`)
})