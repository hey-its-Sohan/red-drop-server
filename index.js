require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const serviceAccount = require('./red-drop-firebase-adminsdk.json')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    // await client.connect();


    const redDropUsers = client.db('redDropDB').collection('users')
    const donationRequestCollection = client.db('redDropDB').collection('donationRequests')
    const blogCollection = client.db('redDropDB').collection('blogCollections')
    const fundCollection = client.db('redDropDB').collection('funds')

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

    // Verify Volunteer middleware
    const verifyAdminOrVolunteer = async (req, res, next) => {
      try {
        const email = req.user?.email;
        if (!email) {
          return res.status(401).send({ error: 'Unauthorized' });
        }

        const user = await redDropUsers.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }

        if (user.role === 'admin' || user.role === 'volunteer') {
          return next();
        }

        return res.status(403).send({ error: 'Forbidden: Admins or Volunteers only' });

      } catch (error) {
        console.error('verifyAdminOrVolunteer error:', error);
        return res.status(500).send({ error: 'Internal server error' });
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

    // get stats data for admin and volunteer
    app.get('/dashboard-stats', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
      const usersCount = await redDropUsers.estimatedDocumentCount();
      const requestsCount = await donationRequestCollection.estimatedDocumentCount();
      // total fund
      const fundResult = await fundCollection.aggregate([
        {
          $group: {
            _id: null,
            totalFund: { $sum: "$amount" }
          }
        }
      ]).toArray();

      const totalFund = fundResult[0]?.totalFund || 0;

      res.send({
        users: usersCount,
        requests: requestsCount,
        totalFund: totalFund
      })
    })


    //  get all blood requests for admin
    app.get('/all-donation-requests', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
      const result = await donationRequestCollection.find().toArray();
      res.send(result);
    });


    // GET all blogs for admin
    app.get('/blogs', verifyToken, verifyAdminOrVolunteer, async (req, res) => {
      const blogs = await blogCollection.find().toArray();
      res.send(blogs);
    });


    // get blog details
    app.get('/blogs-details/:id', async (req, res) => {
      const blogId = req.params.id;
      const result = await blogCollection.findOne({ _id: new ObjectId(blogId) })
      res.send(result);
    });

    // get public blood donation request
    app.get('/blood-donation-requests', async (req, res) => {
      const result = await donationRequestCollection.find({ status: 'Pending' })
        .sort({ donationDate: 1 })
        .toArray();
      res.send(result);
    });

    // get donation request details
    app.get('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const request = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
      res.send(request);
    });

    // get published blog for public blog page
    app.get('/blog-page', async (req, res) => {
      const query = { status: 'Published' }
      const result = await blogCollection.find(query).toArray()
      res.send(result)
    })

    // get blog details
    app.get('/blog-details/:id', async (req, res) => {
      const id = req.params.id
      const blogDetails = await blogCollection.findOne({ _id: new ObjectId(id) })
      res.send(blogDetails)
    })

    // get donor from public search
    app.get('/search-donors', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;
      query = {
        bloodGroup: bloodGroup,
        district: district,
        upazila: upazila,
        status: 'active'
      }
      const result = await redDropUsers.find(query).toArray();
      res.send(result);

    });

    // get funds API
    app.get('/funds', verifyToken, async (req, res) => {
      const page = parseInt(req.query.page) || 1; // defaults to 1 if no page
      const limit = 10;
      const skip = (page - 1) * limit;

      const totalFunds = await fundCollection.countDocuments();
      const totalPages = Math.ceil(totalFunds / limit);
      const funds = await fundCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({ funds, totalPages });

    });


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

    // post blog API
    app.post('/blogs', verifyToken, verifyAdmin, async (req, res) => {
      const blogData = req.body
      const result = await blogCollection.insertOne(blogData)
      res.send(result)
    })

    // Post Payment Intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { amount } = req.body;
      if (!amount) return res.status(400).send({ message: "Amount required" });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(amount) * 100, // convert to cents
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // post fund to DB
    app.post('/funds', verifyToken, async (req, res) => {
      const fund = req.body;

      if (!fund || !fund.amount || !fund.userName || !fund.date) {
        return res.status(400).send({ message: 'Missing fund fields' });
      }

      fund.amount = parseInt(fund.amount, 10);

      const result = await fundCollection.insertOne(fund);
      res.send(result);
    });


    // update user data
    app.patch('/update-user-data/:id', verifyToken, verifyAdmin, async (req, res) => {
      const requestedId = req.params.id
      const updateData = req.body;

      const result = await redDropUsers.updateOne(
        { _id: new ObjectId(requestedId) },
        { $set: updateData }
      );
      res.send(result)

    })

    // Update status
    app.patch('/users/status/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await redDropUsers.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
      res.send(result);
    });

    // Update role
    app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await redDropUsers.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
      res.send(result);
    });

    // PATCH publish blog : admin
    app.patch('/blogs/publish/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await blogCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'Published' } });
      res.send(result);
    });

    // PATCH unpublish blog : admin
    app.patch('/blogs/unpublish/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await blogCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'Draft' } });
      res.send(result);
    });

    // Edit Blog Api
    app.put('/edit-blogs/:id', verifyToken, verifyAdmin, async (req, res) => {
      const blogId = req.params.id;
      const updatedBlog = req.body;
      const result = await blogCollection.updateOne(
        { _id: new ObjectId(blogId) },
        { $set: updatedBlog }
      );
      res.send(result);
    });

    // Update donation request status
    app.patch('/donation-requests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status, donorName, donorEmail } = req.body;
      const updateFields = { status: status || 'Pending' };

      if (donorName) updateFields.donorName = donorName;
      if (donorEmail) updateFields.donorEmail = donorEmail;
      const updatedDoc = {
        $set: updateFields
      };
      const result = await donationRequestCollection.updateOne({ _id: new ObjectId(id) }, updatedDoc);
      res.send(result);
    });


    // delete blog
    app.delete('/blogs/:id', verifyToken, verifyAdmin, async (req, res) => {
      const blogId = req.params.id;
      const result = await blogCollection.deleteOne({ _id: new ObjectId(blogId) });
      res.send(result);
    });

    // delete donation request
    app.delete('/donation-requests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await donationRequestCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });




    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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