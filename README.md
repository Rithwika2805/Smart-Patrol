# PATROL-AI

**AI-Driven Police Patrol & Crime Prediction Platform**

> Analyzes past crime data to predict high-risk zones, optimizes patrol routes, and provides real-time intelligence for smarter law enforcement deployment.

---

## Project Structure

```
Patrol-AI/
├── client/
│   └── public/
│       ├── index.html        ← Dashboard
│       ├── map.html          ← Live Map
│       ├── crimes.html       ← Crime Reports
│       ├── officers.html     ← Officer Management
│       ├── patrols.html      ← Patrol Routes
│       ├── analytics.html    ← AI Analytics
│       ├── css/style.css
│       └── js/
│           ├── api.js
│           ├── dashboard.js
│           ├── crimes.js
│           ├── officers.js
│           ├── patrols.js
│           ├── analytics.js
│           └── map.js
├── server/
│   ├── index.js              ← Express entry point
│   ├── db.js                 ← MySQL connection pool
│   ├── controllers/
│   │   ├── crimeController.js
│   │   ├── officerController.js
│   │   └── patrolController.js
│   ├── routes/
│   │   ├── crimeRoutes.js
│   │   ├── officerRoutes.js
│   │   └── patrolRoutes.js
│   ├── services/
│   │   ├── patrolService.js  ← AI suggestions
│   │   ├── routeService.js   ← Route optimization (TSP)
│   │   ├── officerService.js
│   │   └── stationService.js
│   └── package.json
└── database/
    ├── schema.sql            ← Run this first
    └── seed.js               ← Sample data
```

---

## Setup Instructions

### 1. Database Setup (MySQL)

```sql
-- Open MySQL and run:
SOURCE /path/to/Patrol-AI/database/schema.sql;
```

### 2. Configure Environment

```bash
cd server
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Install Server Dependencies

```bash
cd server
npm install
```

### 4. Seed Sample Data (Optional but Recommended)

```bash
cd server
# Edit database/seed.js: set your DB password
node ../database/seed.js
```

### 5. Start the Server

```bash
cd server
npm run dev    # development (auto-reload)
# or
npm start      # production
```

### 6. Open the App

Open your browser and go to: **http://localhost:5000**

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crimes` | All crimes (filter by type/status/date) |
| POST | `/api/crimes` | Report new crime |
| GET | `/api/crimes/stats` | Crime statistics |
| GET | `/api/crimes/hotspots` | All risk hotspots |
| POST | `/api/crimes/predict-risk` | AI risk prediction |
| GET | `/api/officers` | All officers |
| GET | `/api/officers/available` | Available officers |
| POST | `/api/officers` | Add officer |
| GET | `/api/patrols` | All patrols |
| POST | `/api/patrols` | Assign new patrol |
| POST | `/api/patrols/suggest` | AI patrol suggestions |
| GET | `/api/patrols/active` | Live active patrols |
| GET | `/api/patrols/analytics` | Patrol analytics |

---

## Features

- **Live Dashboard** — Real-time stats, crime chart, hotspot list
- **Interactive Map** — Leaflet map with hotspot layers and patrol positions
- **AI Risk Predictor** — Predicts crime risk by zone, hour, and day
- **Patrol Route Optimizer** — Nearest-Neighbor TSP algorithm, risk-weighted
- **Crime Management** — Full CRUD for FIR records
- **Officer Management** — Track availability, shifts, and workload
- **Analytics Charts** — Crime by area/hour, patrol coverage, officer performance

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Charts | Chart.js 4 |
| Maps | Leaflet.js |
| Backend | Node.js + Express |
| Database | MySQL 8 |
| Algorithm | Nearest-Neighbor TSP (route optimization) |

---

## Default Login (after seeding)

The system uses single-user mode. No login required for demo.
For production, add JWT authentication to `server/index.js`.