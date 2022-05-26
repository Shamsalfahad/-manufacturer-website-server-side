const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { use } = require("express/lib/router");
const { is } = require("express/lib/request");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0-shard-00-00.up5jq.mongodb.net:27017,cluster0-shard-00-01.up5jq.mongodb.net:27017,cluster0-shard-00-02.up5jq.mongodb.net:27017/?ssl=true&replicaSet=atlas-w5x22v-shard-0&authSource=admin&retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//jwt token
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

 //data connection
async function run() {
  try {
    await client.connect();
    const toolCollection = client.db("tools-ware").collection("tools");
    const orderCollection = client.db("tools-ware").collection("orders");
    const userCollection = client.db("tools-ware").collection("users");
    const paymentCollection = client.db("tools-ware").collection("payments");

    app.get("/tool", async (req, res) => {
      const query = {};
      const cursor = toolCollection.find(query);
      const tools = await cursor.toArray();
      res.send(tools);
    });

    app.get("/tool", verifyJWT, async (req, res) => {
      const order = await orderCollection.find().toArray();
      res.send(order);
    });

    app.post("/tool", verifyJWT, async (req, res) => {
      const newProduct = req.body;
      const result = await toolCollection.insertOne(newProduct);
      res.send(result);
    });

    app.delete("/tool/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await toolCollection.deleteOne(filter);
      res.send(result);
    });
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const order = req.body;
      const price = parseFloat(order.price);
      const amount = price * 100;
      console.log(order);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });


    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.patch("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedPayment = await orderCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedDoc);
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    app.get("/tool/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tool = await toolCollection.findOne(query);
      res.send(tool);
    });

    app.get("/order", verifyJWT, async (req, res) => {
      const customerEmail = req.query.customerEmail;
      const decodedEmail = req.decoded.email;
      if (customerEmail === decodedEmail) {
        const query = { customerEmail: customerEmail };
        const bookedOrder = await orderCollection.find(query).toArray();
        return res.send(bookedOrder);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
      // console.log("Auth Header", authorization);
      // const authorization = req.headers.authorization;
    });

    app.get("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });

    app.post("/order", async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from tools-ware 😊");
});

app.listen(port, () => {
  console.log(`tools-ware app listening on port ${port}`);
});
