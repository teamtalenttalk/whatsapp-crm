# WhatsApp CRM SaaS Platform

A full-featured WhatsApp CRM built with Express.js, Next.js 14, Baileys (WhatsApp Web API), and SQLite. Multi-tenant architecture with real-time messaging, automation, sales management, AI chatbot, and advanced analytics.

## Tech Stack

- **Backend:** Express.js, better-sqlite3, Baileys (WhatsApp), Socket.io
- **Frontend:** Next.js 14, React, Tailwind CSS, TypeScript
- **Database:** SQLite (WAL mode)
- **Real-time:** Socket.io for QR codes, message status, live chat
- **AI:** OpenAI GPT integration (optional, works in demo mode without API key)

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Development

```bash
# Backend
cd backend
npm install
cp .env.example .env   # edit JWT_SECRET, OPENAI_API_KEY (optional)
npm run dev             # runs on port 8097

# Frontend (new terminal)
cd frontend
npm install
npm run dev             # runs on port 3003
```

### Docker (Production)

```bash
# Build and start everything
docker compose up -d --build

# Check health
curl http://localhost:3061/api/health

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8097` | Backend port |
| `JWT_SECRET` | `wa-crm-secret` | JWT signing secret |
| `FRONTEND_URL` | `http://localhost:3003` | CORS origin for frontend |
| `OPENAI_API_KEY` | _(empty)_ | Optional: enables GPT-powered AI chatbot |

## Features

### Core (Phase 1-2)
- Multi-tenant authentication (JWT)
- WhatsApp multi-device management (Baileys)
- Contact/lead management with pipeline stages
- Real-time chat with delivery/read receipts
- Bulk messaging with CTA buttons, list messages, media

### Automation (Phase 3)
- Rule-based chatbot and auto-replies
- Welcome messages (text, buttons, media)
- Message templates
- Campaign scheduling with delivery tracking
- Group grabber and number filter

### Sales & Commerce (Phase 4)
- Product/inventory management with stock tracking
- Sales/billing with invoice generation (PDF)
- Meeting booking with multiple calendars
- Automated alerts: low stock, meeting reminders, daily summary

### Production & Deployment (Phase 5)
- Docker and docker-compose for deployment
- CI/CD pipeline (GitHub Actions)
- Health check endpoint with DB/WhatsApp/memory status
- Rate limiting (general: 60/min, messaging: 30/min, bulk: 10/min)
- Structured API documentation (`GET /api/docs`)
- Performance indexes on all key query columns
- Backup and deploy scripts

### Advanced CRM (Phase 6)
- **AI Chatbot (GPT):** Intelligent auto-responses, business training, analytics
- **Customer Segmentation:** Rule-based segments (tags, stage, purchase history, engagement)
- **Campaign Analytics:** Delivery/open/response rates, timeline, error breakdown, campaign comparison
- **Customer Journey Mapping:** Multi-stage journeys, contact progression tracking
- **Conversion Funnel:** Message-to-sale conversion analysis with 5-stage funnel
- **Drop-off Analysis:** Identify where contacts fall out of the pipeline

## API Overview

Full API documentation available at `GET /api/docs`.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Register tenant |
| `POST /api/auth/login` | Login (returns JWT) |
| `GET /api/health` | Health check |
| `GET /api/docs` | Full API documentation |
| `GET /api/contacts` | List contacts |
| `POST /api/send-message/send` | Send WhatsApp message |
| `POST /api/campaigns/:id/start` | Start campaign |
| `GET /api/campaigns/:id/analytics` | Campaign analytics |
| `POST /api/ai-chat/respond` | AI chatbot response |
| `PUT /api/ai-chat/train` | Train AI with Q&A data |
| `GET /api/segments` | List customer segments |
| `GET /api/journeys` | List customer journeys |
| `GET /api/funnels/conversion` | Conversion funnel |
| `GET /api/funnels/drop-off` | Drop-off analysis |

## Scripts

```bash
# Backup database
./scripts/backup.sh [backup_dir]

# Deploy (Docker)
./scripts/deploy.sh [--build] [--restart]
```

## Architecture

```
whatsapp-crm/
├��─ backend/
│   ├── src/
│   │   ├── index.js              # Express app entry point
│   │   ├── database.js           # SQLite schema and init
│   │   ├── database-indexes.js   # Performance indexes
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT auth middleware
│   │   │   └── rateLimiter.js    # Rate limiting
│   │   ├── routes/               # All API route handlers
│   │   └── services/
│   │       ├���─ whatsapp.js       # Baileys WhatsApp service
│   │       ├─�� scheduler.js      # Campaign/alert scheduler
│   │       └── aiChatbot.js      # GPT-powered chatbot
│   └── data/                     # SQLite DB and uploads
├── frontend/
│   ├── app/
│   │   ├── dashboard/            # All dashboard pages
│   │   ├── login/
│   │   └── register/
│   └── lib/                      # API client, auth, socket
├── scripts/                      # Backup and deploy scripts
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml     # CI/CD pipeline
```

## License

Private / Proprietary
