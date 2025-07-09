const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
dotenv.config()
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion } = require('mongodb')

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

    app.get('/meal-categories', async (req, res) => {
        try {
            const categories = await mealsCollection.distinct('category')
            res.send(categories)
        } catch {
            res.status(500).send({ error: 'Server Error' })
        }
    })

    app.get('/price-ranges', async (req, res) => {
        try {
            const minDoc = await mealsCollection.find().sort({ price: 1 }).limit(1).toArray()
            const maxDoc = await mealsCollection.find().sort({ price: -1 }).limit(1).toArray()
            if (!minDoc.length || !maxDoc.length) return res.send([])

            const minPrice = Math.floor(minDoc[0].price)
            const maxPrice = Math.ceil(maxDoc[0].price)
            const step = 10
            const ranges = []

            for (let start = minPrice; start < maxPrice; start += step) {
                const end = start + step
                ranges.push({ label: `${start} - ${end}`, value: `${start}-${end}` })
            }

            res.send(ranges)
        } catch {
            res.status(500).send({ error: 'Server error generating price ranges' })
        }
    })

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
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('BiteLog Server is running')
})

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})
