# 🏨 BiteLog - Hostel Management System

BiteLog is a full-featured MERN stack-based Hostel Management System designed for university environments. It enables admins to manage student meals, monitor reviews, and streamline meal distribution. Students can view, request, and review meals, and purchase membership packages for enhanced privileges.


## 🔗 Live Site

🌐 [Visit Live Website](https://bitelog-f22fc.web.app/)

---

## 🚀 Key Features

- 👤 **User Authentication:** Login/Register with email-password and social login (Google).
- 🏠 **Home Page:** Dynamic banner, category-wise meals (Breakfast, Lunch, Dinner), and membership offers.
- 🍽 **Meal Detail Page:** View meal details, ingredients, distributor info, ratings, like and request meals.
- 🗂 **Meal Management:** Add, update, delete, and sort meals by likes and reviews from admin dashboard.
- ✍️ **Review System:** Post, edit, delete reviews with counts and likes.
- 💳 **Stripe Checkout:** Integrated Stripe payments for Silver, Gold, and Platinum memberships.
- 🔒 **Persistent Login:** Maintains login state on private routes after page reload.
- 📱 **Fully Responsive:** Optimized for mobile, tablet, and desktop screens, including dashboards.
- 🔐 **Protected Routes:** User and admin dashboards are protected by role-based access control.
- 🛎 **Smart Notifications:** Sweet alerts and toasts on all actions (CRUD, auth, payments).
- 🔍 **Server-Side Search & Filters:** Advanced filtering, category, price range, and infinite scroll.
- 🔔 **Real-Time Notifications:** Notification icon with newly added meals and live updates.
- 📈 **Upcoming Meals:** Admin can publish meals after 10 likes; users can like upcoming meals (1 per meal).
- 🥇 **User Badges:** Bronze, Silver, Gold, and Platinum badges based on purchased package.
- 🧠 **MongoDB Indexing:** For fast full-text search across meals.

---

## 📁 Pages & Routes

- `/` – Home  
- `/meals` – All Meals with filtering and search  
- `/meal/:id` – Meal Detail Page  
- `/upcoming-meals` – Upcoming meals  
- `/checkout/:package_name` – Stripe payment page  
- `/join` – Login/Register  
- `/dashboard` – User/Admin dashboard with nested routes  

---

## 🛠️ Tech Stack

- **Frontend:** React.js, TailwindCSS, React Router, TanStack Query, Axios, Firebase Auth
- **Backend:** Node.js, Express.js, MongoDB, JWT, Stripe
- **Other Packages:**
  - `react-hook-form`
  - `sweetalert2`
  - `react-infinite-scroll-component`
  - `react-awesome-button`
  - `react-modal`
  - `react-select`

---

## 🛡️ Environment Setup

### 🔐 Environment Variables

#### Client `.env` (Do **NOT** commit this)

VITE_API_BASE_URL=https://your-server.com
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id


#### Server `.env`

PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key



> Ensure `.env` is listed in `.gitignore`.

---

## ✅ Installation & Run Locally

1. **Clone the Repo:**

```bash
git clone https://github.com/your-username/bitelog-hostel-management.git
cd bitelog-hostel-management


cd client
npm install
npm run dev


cd server
npm install
npm run start


📌 Commit Checklist
✅ Client: 20+ notable commits
✅ Server: 12+ notable commits
✅ Fully responsive
✅ Sweet alerts/toasts implemented
✅ JWT and Axios interceptor
✅ .env hidden from GitHub
✅ TanStack Query for all GET requests
✅ Pagination on dashboard tables
✅ All key features implemented


🤝 Contact
Md. Ashik Mahmud
📧 ashikmahmud8346@.com
🔗 [LinkedIn](https://www.linkedin.com/in/ashik-mahmud21/) | [GitHub](https://github.com/ashik0401)
