# SmartPOS — University Facilities Management System

SmartPOS is a comprehensive web-based platform designed to manage university facilities, student accommodations, local properties, and a campus marketplace. 

Built with a modern tech stack, the platform offers a robust administrative dashboard for overseeing users, properties, and system audits, while providing dedicated access portals for students, tenants, and property owners.

## ✨ Features

- **Role-Based Access Control:** Distinct portals and permissions for Admins, Students, Tenants, Owners, and other user types.
- **Admin Dashboard:** Centralised view to manage users, properties, and marketplace items.
- **Student Portal:** Students can log in with their Registration Number to access university-specific services.
- **Property Management:** List, update, and discover properties and accommodations around the university.
- **Campus Marketplace:** A dedicated marketplace for students and locals to buy, sell, or trade items.
- **Audit Logging:** Every mutating action (create, update, delete, login, approval) is silently logged to an audit table to maintain a secure trail of system events.
- **User Approvals:** Certain user registrations (e.g. tenants, owners) require manual admin approval before gaining access.

## 🚀 Tech Stack

### Frontend
- **React 18** — Component-based UI.
- **Vite** — Extremely fast frontend tooling.
- **TypeScript** — Strongly typed codebase.
- **React Router** — Client-side routing.
- **Axios** — HTTP client for API requests with JWT interception.

### Backend
- **Node.js & Express** — High-performance web server.
- **TypeScript** — Strongly typed server logic.
- **Prisma ORM** — Next-generation Node.js and TypeScript ORM.
- **Supabase (PostgreSQL)** — Managed PostgreSQL database with connection pooling.
- **JSON Web Tokens (JWT)** — Secure, stateless authentication.
- **Bcrypt** — Password hashing.

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- A [Supabase](https://supabase.com/) project (or local PostgreSQL database)

### Installation

1. **Clone the repository:**
   ```bash
   git clone git remote add origin https://github.com/BKerio/SmartPOS.git
   cd SmartPOS
   ```

2. **Setup the Backend:**
   ```bash
   cd backend
   npm install
   ```
   - Copy `.env.example` to `.env` and fill in your Supabase connection strings and JWT secret:
     ```bash
     cp .env.example .env
     ```
   - Push the schema to your database and seed it:
     ```bash
     npx prisma db push
     npm run db:seed
     ```

3. **Setup the Frontend:**
   ```bash
   cd ../frontend
   npm install
   ```
   - Make sure your frontend `.env` points to the backend (default: `http://localhost:5000/api`).

### Running the Application

You will need two terminal windows to run both servers simultaneously.

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

The application will be accessible at `http://localhost:5173`. 
You can log into the Admin Dashboard using the default seeded credentials (unless changed in your `.env`):
- **Email:** `admin@smartpos.com`
- **Password:** `Admin@12345`

## 📂 Project Structure

```text
SmartPOS/
├── backend/
│   ├── index.ts               # Express entry point
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.ts            # Default admin & sample data
│   ├── routes/                # API endpoints (admin, students, etc.)
│   ├── middlewares/           # JWT and role guards
│   └── services/              # Prisma and Supabase singletons
└── frontend/
    ├── src/
    │   ├── App.tsx            # Main router and shell
    │   ├── components/        # Reusable UI components
    │   ├── pages/             # Route-level components (Login, Dashboard)
    │   └── services/          # API configurations (Axios)
    └── index.html             # Vite entry HTML
```

## 📜 License

This project is licensed under the ISC License.
