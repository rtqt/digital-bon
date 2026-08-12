# DigitalBon POS

DigitalBon is a robust, multi-tenant Point of Sale (POS) and loss-prevention engine designed specifically for cafes and hospitality franchises. 

It is built to solve the most critical issue in cash-heavy hospitality environments: **cash leakage and accountability**. It achieves this through a strict, multi-role architecture, dual-blind shift reconciliation, and immutable system logging.

## Tech Stack
- **Frontend**: Next.js 14, React 18, Tailwind CSS v3, shadcn/ui, Apollo Client.
- **Backend**: Node.js, Express, Apollo GraphQL Server.
- **Database**: MongoDB (Mongoose).
- **Real-time**: GraphQL Subscriptions via WebSockets (`graphql-ws`).

## Quick Start (Development)

### 1. Prerequisites
- Node.js (v18+)
- MongoDB running locally or a MongoDB Atlas URI

### 2. Environment Setup

**Server (`/server/.env`):**
```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/digitalbon
JWT_SECRET=your_super_secret_jwt_key
```

**Client (`/client/.env.local`):**
```env
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
NEXT_PUBLIC_GRAPHQL_WS_URL=ws://localhost:4000/graphql
```

### 3. Installation & Running

Open two terminal instances.

**Terminal 1 (Server):**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 (Client):**
```bash
cd client
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

## Documentation

This project follows the [Diátaxis](https://diataxis.fr/) documentation framework. Please refer to the `/docs` folder for comprehensive documentation tailored for developers maintaining and extending this system:

- **Tutorials**: Practical, step-by-step guides for onboarding. (See: `docs/tutorials/`)
- **How-To Guides**: Goal-oriented recipes for achieving specific technical tasks. (See: `docs/how-to/`)
- **Reference**: Technical descriptions of the system machinery (Schemas, APIs, Permissions). (See: `docs/reference/`)
- **Explanation**: Discussions clarifying the architectural decisions and business logic. (See: `docs/explanation/`)
