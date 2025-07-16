const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

dotenv.config()
const app = express()
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY)

app.use(cors())
app.use(express.json())

const admin = require('firebase-admin');
const serviceKeyBase64 = process.env.FB_SERVICE_KEY_BASE64;

try {
  const serviceAccount = JSON.parse(Buffer.from(serviceKeyBase64, 'base64').toString('utf-8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  process.exit(1);
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@am.ochad9p.mongodb.net/?retryWrites=true&w=majority&appName=AM`
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
    },
})

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  try {
    try {
      const userInfo = await admin.auth().verifyIdToken(token);
      req.tokenEmail = userInfo.email;
      return next();
    } catch (error) {
      const decodedToken = await admin.auth().verifyIdToken(token, true);
      req.tokenEmail = decodedToken.email;
      return next();
    }
  } catch (error) {
    return res.status(401).send({ message: 'invalid token' });
  }
};

async function run() {
   
    const db = client.db('BiteLogDB')
    const usersCollection = db.collection('users')
    const mealsCollection = db.collection('meals')
    const mealRequestsCollection = db.collection('mealRequests')
    const upcomingMealsCollection = db.collection('upcomingMeals')
    const reviewsCollection = db.collection('reviews')
    const membershipCollection = db.collection('membership')
    const paymentCollection = db.collection('payments')

    app.post('/users', async (req, res) => {
        const { email, name, photoURL } = req.body;
        if (!email) return res.status(400).send({ message: 'Email is required' });
        const userExists = await usersCollection.findOne({ email });
        if (userExists) return res.status(200).send({ message: 'User already exists', inserted: false, user: userExists });
        const user = { email, name: name || email.split('@')[0], photoURL: photoURL || '', role: 'user', mealsAdded: 0, badge: 'Bronze', last_log_in: new Date().toISOString() };
        try {
            const result = await usersCollection.insertOne(user);
            user._id = result.insertedId;
            res.status(201).send({ message: 'User created successfully', inserted: true, user });
        } catch (error) {
            res.status(500).send({ error: 'Failed to create user' });
        }
    });

    app.get('/users/:email', verifyFirebaseToken, async (req, res) => {
        const email = req.params.email;
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.send(user);
    });

    app.get('/users', verifyFirebaseToken, async (req, res) => {
        const search = req.query.search || ''
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const skip = (page - 1) * limit
        const query = { role: 'user', $or: [ { name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } } ] }
        const totalCount = await usersCollection.countDocuments(query)
        const users = await usersCollection.find(query).skip(skip).limit(limit).toArray()
        res.send({ users, totalCount })
    })

    app.patch('/users/admin/:id', verifyFirebaseToken, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role: 'admin' } });
            res.send(result);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.get('/membership/packages', async (req, res) => {
        try {
            const packages = await membershipCollection.find().sort({ level: 1 }).toArray()
            res.json(packages)
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' })
        }
    })

    app.get('/membership/packages/:id', async (req, res) => {
        const { id } = req.params
        try {
            const packageData = await membershipCollection.findOne({ _id: new ObjectId(id) })
            if (!packageData) return res.status(404).json({ message: 'Package not found' })
            res.json(packageData)
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' })
        }
    })

    app.get('/user/membership/:email', verifyFirebaseToken, async (req, res) => {
        const email = req.params.email;
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        const lastPayment = await db.collection('payments').find({ email }).sort({ paid_at: -1 }).limit(1).toArray();
        if (!lastPayment[0]) return res.send({ badge: null, membershipId: null });
        res.send({ badge: lastPayment[0].membershipBadge, membershipId: lastPayment[0].membershipId });
    });

    app.get('/meals', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const search = req.query.search || '';
            const category = req.query.category || '';
            const priceRange = req.query.priceRange || '';
            const sortBy = req.query.sortBy || 'postTime';
            const order = req.query.order === 'asc' ? 1 : -1;
            const hasReviewsOnly = req.query.hasReviewsOnly === 'true';
            const limit = 10;
            const skip = (page - 1) * limit;
            let query = {};
            if (hasReviewsOnly) query.reviews_count = { $gt: 0 };
            if (search) query.$text = { $search: search };
            if (category) query.category = category;
            if (priceRange) {
                const [min, max] = priceRange.split('-').map(Number);
                query.price = { $gte: min, $lte: max };
            }
            const projection = search ? { score: { $meta: 'textScore' } } : {};
            const totalCount = await mealsCollection.countDocuments(query);
            const meals = await mealsCollection.find(query).project(projection).sort(search ? { score: { $meta: 'textScore' } } : { [sortBy]: order }).skip(skip).limit(limit).toArray();
            res.send({ meals, totalCount });
        } catch (err) {
            res.status(500).send({ error: 'Server Error' });
        }
    });

    app.get('/meals/:id', async (req, res) => {
        try {
            let mealId
            try { mealId = new ObjectId(req.params.id) } catch { return res.status(400).json({ message: 'Invalid meal ID format' }) }
            const meal = await mealsCollection.findOne({ _id: mealId })
            if (!meal) return res.status(404).json({ message: 'Meal not found' })
            const reviews = await reviewsCollection.find({ mealId }).sort({ createdAt: -1 }).toArray()
            const reviewCount = await reviewsCollection.countDocuments({ mealId })
            res.json({ meal, reviews, reviewCount })
        } catch (error) {
            res.status(500).json({ message: 'Server error', error: error.message })
        }
    })

    app.post('/meals/:id/reviews', verifyFirebaseToken, async (req, res) => {
        const mealId = req.params.id;
        const { text, email, username, photoURL } = req.body;
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        if (!text || !email || !username) return res.status(400).json({ message: 'Missing required fields' });
        try {
            const meal = await mealsCollection.findOne({ _id: new ObjectId(mealId) });
            if (!meal) return res.status(404).json({ message: 'Meal not found' });
            const review = { mealId: new ObjectId(mealId), mealTitle: meal.title, text, email, username, photoURL, createdAt: new Date() };
            await reviewsCollection.insertOne(review);
            await mealsCollection.updateOne({ _id: new ObjectId(mealId) }, { $inc: { reviews_count: 1 } });
            res.status(201).json({ message: 'Review submitted' });
        } catch (err) {
            res.status(500).json({ message: 'Error posting review' });
        }
    });

    app.get('/meals/:id/reviews', async (req, res) => {
        try {
            const mealId = req.params.id;
            if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid meal ID' });
            const reviews = await reviewsCollection.find({ mealId: new ObjectId(mealId) }).sort({ createdAt: -1 }).toArray();
            res.json(reviews);
        } catch (err) {
            res.status(500).json({ message: 'Error fetching reviews' });
        }
    });

    app.get('/reviews/user/:email', verifyFirebaseToken, async (req, res) => {
        try {
            const email = req.params.email;
            if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const query = { email };
            const totalCount = await reviewsCollection.countDocuments(query);
            const reviews = await reviewsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
            res.json({ reviews, totalCount });
        } catch {
            res.status(500).json({ message: 'Failed to fetch reviews' });
        }
    });

    app.get('/meals-by-ids', verifyFirebaseToken, async (req, res) => {
        try {
            const idsParam = req.query.ids;
            if (!idsParam) return res.status(400).json({ message: 'No IDs provided' });
            const ids = idsParam.split(',').map(id => new ObjectId(id));
            const meals = await mealsCollection.find({ _id: { $in: ids } }).toArray();
            res.send(meals);
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    app.delete('/reviews/:id', verifyFirebaseToken, async (req, res) => {
        const id = req.params.id;
        try {
            const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
            if (!review) return res.status(404).json({ message: 'Review not found' });
            if (review.email !== req.tokenEmail) return res.status(403).json({ message: 'Forbidden: Not your review' });
            const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Failed to delete review' });
        }
    });

    app.patch('/reviews/:id', verifyFirebaseToken, async (req, res) => {
        const id = req.params.id;
        const { text } = req.body;
        try {
            const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
            if (!review) return res.status(404).json({ message: 'Review not found' });
            if (review.email !== req.tokenEmail) return res.status(403).json({ message: 'Forbidden: Not your review' });
            const result = await reviewsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { text, updatedAt: new Date() } });
            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Failed to update review' });
        }
    });

    app.delete('/meal-requests/:id', verifyFirebaseToken, async (req, res) => {
        const id = req.params.id;
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: 'User email is required' });
        if (req.tokenEmail !== email) return res.status(403).json({ error: 'Forbidden' });
        try {
            const result = await mealRequestsCollection.deleteOne({ _id: new ObjectId(id), userEmail: email });
            if (result.deletedCount === 1) res.json({ message: 'Request deleted successfully' });
            else res.status(404).json({ error: 'Request not found or unauthorized' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete request' });
        }
    });

    app.get('/meal-categories', async (req, res) => {
        const cats = await mealsCollection.distinct('category');
        res.send(cats);
    });

    app.get('/price-ranges', async (req, res) => {
        const prices = await mealsCollection.distinct("price");
        const sorted = prices.sort((a, b) => a - b);
        res.send(sorted.map(p => ({ label: `$${p}`, value: `${p}-${p}` })));
    });

    app.post('/meals/:id/request', verifyFirebaseToken, async (req, res) => {
        try {
            const mealId = req.params.id;
            const { email, username, photoURL } = req.body;
            if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
            if (!email || !username) return res.status(400).json({ message: 'Missing required fields' });
            if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid meal ID format' });
            const meal = await mealsCollection.findOne({ _id: new ObjectId(mealId) });
            if (!meal) return res.status(404).json({ message: 'Meal not found' });
            const requestDoc = { mealId: new ObjectId(mealId), mealTitle: meal.title, userEmail: email, userName: username, photoURL: photoURL || '', status: 'pending', createdAt: new Date() };
            await mealRequestsCollection.insertOne(requestDoc);
            res.status(201).json({ message: 'Meal request submitted successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    app.get('/meal-requests', verifyFirebaseToken, async (req, res) => {
        try {
            const email = req.query.email;
            const search = req.query.search || '';
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const query = email ? { userEmail: email } : { $or: [ { userName: { $regex: search, $options: 'i' } }, { userEmail: { $regex: search, $options: 'i' } } ] };
            const totalCount = await mealRequestsCollection.countDocuments(query);
            const result = await mealRequestsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
            res.send({ requests: result, totalCount });
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.patch('/meal-requests/:id/serve', verifyFirebaseToken, async (req, res) => {
        const result = await mealRequestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: 'delivered' } });
        res.send(result);
    });

    app.put('/meals/:id', verifyFirebaseToken, async (req, res) => {
        try {
            const id = req.params.id;
            const updatedMeal = req.body;
            const result = await mealsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedMeal });
            if (result.matchedCount === 0) return res.status(404).json({ message: 'Meal not found' });
            res.json({ message: 'Meal updated successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.delete('/meals/:id', verifyFirebaseToken, async (req, res) => {
        try {
            const id = req.params.id;
            const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
            if (!meal) return res.status(404).json({ message: 'Meal not found' });
            const result = await mealsCollection.deleteOne({ _id: new ObjectId(id) });
            if (result.deletedCount === 0) return res.status(404).json({ message: 'Meal not found' });
            if (meal.distributorEmail) await usersCollection.updateOne({ email: meal.distributorEmail, role: 'admin' }, { $inc: { mealsAdded: -1 } });
            res.status(200).json({ message: 'Meal deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.get('/meals/count/:email', verifyFirebaseToken, async (req, res) => {
        const email = req.params.email
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        const count = await mealsCollection.countDocuments({ distributorEmail: email })
        res.send({ count })
    })

    app.post('/meals', verifyFirebaseToken, async (req, res) => {
        try {
            const meal = req.body
            meal.rating = meal.rating || 0
            meal.likes = meal.likes || 0
            meal.reviews_count = meal.reviews_count || 0
            meal.postTime = meal.postTime || new Date().toISOString()
            const result = await mealsCollection.insertOne(meal)
            if (meal.distributorEmail) await usersCollection.updateOne({ email: meal.distributorEmail }, { $inc: { mealsAdded: 1 } })
            res.status(201).send({ message: 'Meal added successfully', insertedId: result.insertedId })
        } catch {
            res.status(500).send({ error: 'Failed to add meal' })
        }
    })

    app.post('/meals/:id/like', verifyFirebaseToken, async (req, res) => {
        const mealId = req.params.id;
        const { email } = req.body;
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        if (!email) return res.status(400).json({ message: 'User email is required' });
        try {
            const mealObjectId = new ObjectId(mealId);
            const like = await db.collection('likes').findOne({ mealId: mealObjectId, email });
            if (like) {
                await db.collection('likes').deleteOne({ _id: like._id });
                await db.collection('meals').updateOne({ _id: mealObjectId }, { $inc: { likes: -1 } });
                return res.status(200).json({ message: 'Like removed', liked: false });
            } else {
                await db.collection('likes').insertOne({ mealId: mealObjectId, email, likedAt: new Date() });
                await db.collection('meals').updateOne({ _id: mealObjectId }, { $inc: { likes: 1 } });
                return res.status(201).json({ message: 'Meal liked', liked: true });
            }
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    app.patch('/like-upcoming-meal/:id', verifyFirebaseToken, async (req, res) => {
        const mealId = req.params.id;
        const userEmail = req.body.email;
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'forbidden access' });
        if (!userEmail) return res.status(400).send({ message: 'User email is required' });
        const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
        if (!meal) return res.status(404).send({ message: 'Meal not found' });
        const isLiked = meal.likedBy?.includes(userEmail);
        if (isLiked) {
            await upcomingMealsCollection.updateOne({ _id: new ObjectId(mealId) }, { $inc: { likes: -1 }, $pull: { likedBy: userEmail } });
            const updatedMeal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
            return res.send({ message: 'Meal unliked successfully', meal: updatedMeal });
        } else {
            await upcomingMealsCollection.updateOne({ _id: new ObjectId(mealId) }, { $inc: { likes: 1 }, $addToSet: { likedBy: userEmail } });
            const updatedMeal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
            if (updatedMeal.likes >= 10) {
                const { _id, ...mealToPublish } = updatedMeal;
                mealToPublish.postedAt = new Date();
                await mealsCollection.insertOne(mealToPublish);
                await upcomingMealsCollection.deleteOne({ _id: new ObjectId(mealId) });
                return res.send({ message: 'Meal published to main collection!', meal: mealToPublish });
            }
            return res.send({ message: 'Meal liked successfully', meal: updatedMeal });
        }
    });

    app.post('/meals/:id/rate', verifyFirebaseToken, async (req, res) => {
        const mealId = req.params.id;
        const { rating, email } = req.body;
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Invalid rating value' });
        if (!email) return res.status(400).json({ message: 'Email is required' });
        try {
            const meal = await mealsCollection.findOne({ _id: new ObjectId(mealId) });
            if (!meal) return res.status(404).json({ message: 'Meal not found' });
            if (meal.ratedBy && meal.ratedBy.includes(email)) return res.status(400).json({ message: 'You have already rated this meal' });
            const updatedRatings = { ...meal.ratings };
            updatedRatings[rating] = (updatedRatings[rating] || 0) + 1;
            const newReviewsCount = (meal.reviews_count || 0) + 1;
            await mealsCollection.updateOne({ _id: new ObjectId(mealId) }, { $set: { ratings: updatedRatings, reviews_count: newReviewsCount }, $push: { ratedBy: email } });
            res.json({ message: 'Rating submitted successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.patch('/meals/:id/rate', verifyFirebaseToken, async (req, res) => {
        try {
            const { id } = req.params;
            const { rating, email } = req.body;
            if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
            const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
            if (!meal) return res.status(404).send({ message: "Meal not found" });
            const userRatings = meal.userRatings || {};
            const prevRating = userRatings[email];
            const updateOps = { [`ratings.${rating}`]: 1 };
            if (prevRating) updateOps[`ratings.${prevRating}`] = -1;
            await mealsCollection.updateOne({ _id: new ObjectId(id) }, { $inc: updateOps, $set: { [`userRatings.${email}`]: rating } });
            res.send({ message: "Rating updated successfully" });
        } catch (err) {
            res.status(500).send({ message: "Server error" });
        }
    });

    app.get('/upcoming-meals', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1
            const limit = parseInt(req.query.limit) || 10
            const skip = (page - 1) * limit
            const totalCount = await upcomingMealsCollection.estimatedDocumentCount()
            const meals = await upcomingMealsCollection.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()
            res.send({ meals, totalCount })
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' })
        }
    })

    app.post('/publish-meal/:id', verifyFirebaseToken, async (req, res) => {
        const mealId = req.params.id;
        if (!ObjectId.isValid(mealId)) return res.status(400).json({ message: 'Invalid meal ID' });
        const meal = await upcomingMealsCollection.findOne({ _id: new ObjectId(mealId) });
        if (!meal) return res.status(404).json({ message: 'Meal not found' });
        delete meal._id;
        meal.postTime = new Date();
        await mealsCollection.insertOne(meal);
        await upcomingMealsCollection.deleteOne({ _id: new ObjectId(mealId) });
        res.status(200).json({ message: 'Meal published successfully' });
    });

    app.post('/upcoming-meals', verifyFirebaseToken, async (req, res) => {
        try {
            const meal = req.body
            meal.createdAt = new Date()
            const result = await upcomingMealsCollection.insertOne(meal)
            res.status(201).json({ message: 'Upcoming meal added', id: result.insertedId })
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' })
        }
    })

    app.get('/payments', verifyFirebaseToken, async (req, res) => {
        try {
            const { email, page = 1, limit = 10 } = req.query;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;
            if (email && req.tokenEmail !== email) return res.status(403).json({ message: 'Forbidden' });
            const query = email ? { email } : {};
            const totalCount = await db.collection('payments').countDocuments(query);
            const payments = await db.collection('payments').find(query).sort({ paid_at: -1 }).skip(skip).limit(limitNum).toArray();
            res.send({ payments, totalCount });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.post('/payments', verifyFirebaseToken, async (req, res) => {
        try {
            const { email, amount, transactionId, paymentMethod, membershipId, membershipBadge } = req.body;
            if (req.tokenEmail !== email) return res.status(403).send({ message: 'forbidden access' });
            if (!email || !transactionId || !membershipId) return res.status(400).json({ message: 'Missing required fields' });
            const paymentData = { email, amount, transactionId, membershipId: new ObjectId(membershipId), paymentMethod, paid_at_string: new Date().toISOString(), paid_at: new Date() };
            const insertResult = await paymentCollection.insertOne(paymentData);
            await db.collection('users').updateOne({ email }, { $set: { badge: membershipBadge || 'Bronze' } });
            res.status(201).json({ message: 'Payment successful, user badge updated', insertedId: insertResult.insertedId });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.post('/create-payment-intent', verifyFirebaseToken, async (req, res) => {
        const amountInCents = req.body.amountInCents
        try {
            const paymentIntent = await stripe.paymentIntents.create({ amount: amountInCents, currency: 'usd', payment_method_types: ['card'] });
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