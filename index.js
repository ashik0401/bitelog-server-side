const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

dotenv.config()
const app = express()
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@am.ochad9p.mongodb.net/?retryWrites=true&w=majority&appName=AM`
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
})

async function run() {
    await client.connect()

    const db = client.db('BiteLogDB')
    const usersCollection = db.collection('users')
    const mealsCollection = db.collection('meals')
    const reviewsCollection = db.collection('reviews')
    const membershipCollection = db.collection('membership')
    const paymentCollection = db.collection('payments')



    app.get('/users/:email', async (req, res) => {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.send(user);
    });




    app.get('/users', async (req, res) => {
        const search = req.query.search || ''
        const query = {
            role: 'user',
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ],
        }
        const users = await usersCollection.find(query).toArray()
        res.send(users)
    })

    app.post('/users', async (req, res) => {
        const email = req.body.email
        const userExists = await usersCollection.findOne({ email })
        if (userExists) {
            return res.status(200).send({ message: 'User already exists', inserted: false })
        }
        const user = {
            ...req.body,
            badge: 'Bronze',
            last_log_in: new Date().toISOString(),
        }
        const result = await usersCollection.insertOne(user)
        res.send(result)
    })



    app.patch('/users/admin/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: 'admin' } }
            );

            res.send(result);
        } catch (error) {
            console.error('Error making user admin:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });





    app.get('/membership/packages', async (req, res) => {
        try {
            const packages = await membershipCollection.find().sort({ level: 1 }).toArray()
            res.json(packages)
        } catch (error) {
            console.error('Error fetching membership packages:', error)
            res.status(500).json({ message: 'Internal server error' })
        }
    })


    app.get('/membership/packages/:id', async (req, res) => {
        const { id } = req.params

        try {
            const packageData = await membershipCollection.findOne({ _id: new ObjectId(id) })

            if (!packageData) {
                return res.status(404).json({ message: 'Package not found' })
            }

            res.json(packageData)
        } catch (error) {
            console.error('Error fetching membership package by ID:', error)
            res.status(500).json({ message: 'Internal server error' })
        }
    })


    app.get('/user/membership/:email', async (req, res) => {
        const email = req.params.email;
        const lastPayment = await db.collection('payments')
            .find({ email })
            .sort({ paid_at: -1 })
            .limit(1)
            .toArray();

        if (!lastPayment[0]) return res.send({ badge: null, membershipId: null });

        res.send({
            badge: lastPayment[0].membershipBadge,
            membershipId: lastPayment[0].membershipId,
        });
    });




    app.get('/meals', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1
            const search = req.query.search || ''
            const category = req.query.category || ''
            const priceRange = req.query.priceRange || ''
            const limit = 10
            const skip = (page - 1) * limit
            const query = {}

            if (search) {
                query.title = { $regex: search, $options: 'i' }
            }
            if (category) {
                query.category = category
            }
            if (priceRange) {
                const [min, max] = priceRange.split('-').map(Number)
                query.price = { $gte: min, $lte: max }
            }

            const meals = await mealsCollection.find(query).skip(skip).limit(limit).toArray()
            res.send(meals)
        } catch {
            res.status(500).send({ error: 'Server Error' })
        }
    })

    app.get('/meals/:id', async (req, res) => {
        try {
            let mealId
            try {
                mealId = new ObjectId(req.params.id)
            } catch {
                return res.status(400).json({ message: 'Invalid meal ID format' })
            }

            const meal = await mealsCollection.findOne({ _id: mealId })
            if (!meal) return res.status(404).json({ message: 'Meal not found' })

            const reviews = await reviewsCollection.find({ mealId }).sort({ createdAt: -1 }).toArray()
            const reviewCount = await reviewsCollection.countDocuments({ mealId })

            res.json({ meal, reviews, reviewCount })
        } catch (error) {
            console.error('Error in GET /meals/:id:', error)
            res.status(500).json({ message: 'Server error', error: error.message })
        }
    })

    app.post('/meals/:id/like', async (req, res) => {
        try {
            const userEmail = req.body.email
            if (!userEmail) {
                return res.status(400).json({ message: 'User email required' })
            }

            const mealId = new ObjectId(req.params.id)
            const meal = await mealsCollection.findOne({ _id: mealId })
            if (!meal) return res.status(404).json({ message: 'Meal not found' })

            const alreadyLiked = (meal.likedBy || []).includes(userEmail)

            const update = alreadyLiked
                ? { $pull: { likedBy: userEmail }, $inc: { likes: -1 } }
                : { $addToSet: { likedBy: userEmail }, $inc: { likes: 1 } }

            await mealsCollection.updateOne({ _id: mealId }, update)

            let updatedMeal = await mealsCollection.findOne({ _id: mealId })

            if (updatedMeal.likes < 0) {
                await mealsCollection.updateOne({ _id: mealId }, { $set: { likes: 0 } })
                updatedMeal = await mealsCollection.findOne({ _id: mealId })
            }

            return res.status(200).json({ likes: updatedMeal.likes })
        } catch (error) {
            console.error('Like error:', error)
            return res.status(500).json({ message: 'Server error', error: error.message })
        }
    })


    app.put('/meals/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const updatedMeal = req.body;

            const result = await mealsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedMeal }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ message: 'Meal not found' });
            }

            res.json({ message: 'Meal updated successfully' });
        } catch (error) {
            console.error('PUT meal error:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });





    app.get('/meals/count/:email', async (req, res) => {
        const email = req.params.email
        const count = await mealsCollection.countDocuments({ distributorEmail: email })
        res.send({ count })
    })

    app.post('/meals', async (req, res) => {
        try {
            const meal = req.body
            meal.rating = meal.rating || 0
            meal.likes = meal.likes || 0
            meal.reviews_count = meal.reviews_count || 0
            meal.postTime = meal.postTime || new Date().toISOString()
            const result = await mealsCollection.insertOne(meal)
            res.status(201).send({ message: 'Meal added successfully', insertedId: result.insertedId })
        } catch {
            res.status(500).send({ error: 'Failed to add meal' })
        }
    })


    app.get('/payments', async (req, res) => {
        try {
            const { email } = req.query;

            const query = email ? { email } : {};
            const payments = await db.collection('payments')
                .find(query)
                .sort({ paid_at: -1 })
                .toArray();

            res.send(payments);
        } catch (error) {
            console.error('Error fetching payments:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });



    app.post('/payments', async (req, res) => {
        try {
            const {
                email,
                amount,
                transactionId,
                paymentMethod,
                membershipId,
                membershipBadge
            } = req.body;

            if (!email || !transactionId || !membershipId) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            const paymentData = {
                email,
                amount,
                transactionId,
                membershipId: new ObjectId(membershipId),
                paymentMethod,
                paid_at_string: new Date().toISOString(),
                paid_at: new Date()
            };

            const insertResult = await paymentCollection.insertOne(paymentData);

            await db.collection('users').updateOne(
                { email },
                { $set: { badge: membershipBadge || 'Bronze' } }
            );

            res.status(201).json({
                message: 'Payment successful, user badge updated',
                insertedId: insertResult.insertedId
            });
        } catch (error) {
            console.error('Error saving payment:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });



    app.post('/create-payment-intent', async (req, res) => {
        const amountInCents = req.body.amountInCents
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amountInCents, // Amount in cents
                currency: 'usd',
                payment_method_types: ['card'],
            });

            res.json({ clientSecret: paymentIntent.client_secret });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('BiteLog Server is running')
})

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})
