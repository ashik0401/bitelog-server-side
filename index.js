const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@am.ochad9p.mongodb.net/?retryWrites=true&w=majority&appName=AM`;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



async function run() {
    try {

        const db = client.db('BiteLogDB');
        const usersCollection = db.collection('users');
        const mealsCollection = db.collection('meals');





        app.get('/users', async (req, res) => {
            const search = req.query.search || '';
            const query = {
                role: 'user',
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ],
            };
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });


        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExists = await usersCollection.findOne({ email });
            if (userExists) {
                return res.status(200).send({ message: 'User already exists', inserted: false });
            }

            const user = {
                ...req.body,
                badge: 'Bronze',
                last_log_in: new Date().toISOString()
            };

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });



        // Meals section 

        app.get('/meals', async (req, res) => {
            const meals = await mealsCollection.find().toArray();
            res.send(meals);
        });


        app.get('/meals/count/:email', async (req, res) => {
            const email = req.params.email;
            const count = await mealsCollection.countDocuments({ distributorEmail: email });
            res.send({ count });
        });



        app.post('/meals', async (req, res) => {
            try {
                const meal = req.body;

                meal.rating = meal.rating || 0;
                meal.likes = meal.likes || 0;
                meal.reviews_count = meal.reviews_count || 0;
                meal.postTime = meal.postTime || new Date().toISOString();

                const result = await mealsCollection.insertOne(meal);
                res.status(201).send({ message: 'Meal added successfully', insertedId: result.insertedId });
            } catch (error) {
                console.error('Error inserting meal:', error);
                res.status(500).send({ error: 'Failed to add meal' });
            }
        });






        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {


    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('BiteLog Server is running');
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
