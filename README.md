# SmartPOS - School Feeding & Management System

SmartPOS is a comprehensive web-based platform designed to manage school feeding programs, student accounts, restaurant and cafeteria operations, inventory, finances, and parent engagement.

Built with a modern tech stack, the platform offers a robust administrative dashboard for overseeing students, finances, inventory, transactions, and system audits, while providing dedicated access portals for administrators, finance officers, restaurant staff, students, and parents.

## ✨ Features

* **Role-Based Access Control:** Distinct portals and permissions for Admins, Finance Officers, Restaurant Staff, Students, and Parents.
* **Admin Dashboard:** Centralised view to manage users, students, inventory, finances, and system operations.
* **Student Portal:** Students can log in with their Admission Number or assigned credentials to access their account and meal information.
* **Parent Portal:** Parents can monitor balances, view transactions, and manage student feeding accounts.
* **Restaurant & POS Management:** Manage cafeteria sales, meal purchases, receipts, and daily transactions.
* **Inventory Management:** Track stock levels, suppliers, purchases, stock movements, and low-stock alerts.
* **Finance Management:** Monitor revenue, expenses, student wallet transactions, and financial reports.
* **Student Wallet System:** Cashless feeding system where students can purchase meals using their wallet balance.
* **Audit Logging:** Every mutating action (create, update, delete, login, approval) is silently logged to an audit table to maintain a secure trail of system events.
* **User Approvals:** Certain user registrations or account actions may require manual admin approval before gaining access.

## 🚀 Tech Stack

### Frontend

* **React 18** - Component-based UI.
* **Vite** - Extremely fast frontend tooling.
* **TypeScript** - Strongly typed codebase.
* **React Router** - Client-side routing.
* **Axios** - HTTP client for API requests with JWT interception.

### Backend

* **Node.js & Express** - High-performance web server.
* **TypeScript** - Strongly typed server logic.
* **Prisma ORM** - Next-generation Node.js and TypeScript ORM.
* **Supabase (PostgreSQL)** - Managed PostgreSQL database with connection pooling.
* **JSON Web Tokens (JWT)** - Secure, stateless authentication.
* **Bcrypt** - Password hashing.

## 🛠️ Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v18+)
* A [Supabase](https://supabase.com/) project (or local PostgreSQL database)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/BKerio/SmartPOS.git
   cd SmartPOS
   ```

2. **Setup the Backend:**

   ```bash
   cd backend
   npm install
   ```

   * Copy `.env.example` to `.env` and fill in your Supabase connection strings and JWT secret:

   ```bash
   cp .env.example .env
   ```

   * Push the schema to your database and seed it:

   ```bash
   npx prisma db push
   npm run db:seed
   ```

3. **Setup the Frontend:**

   ```bash
   cd ../frontend
   npm install
   ```

   * Make sure your frontend `.env` points to the backend (default: `http://localhost:5000/api`).

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

* **Email:** `admin@smartpos.com`
* **Password:** `Admin@12345`

## 📂 Project Structure

```text
SmartPOS/
├── backend/
│   ├── index.ts               # Express entry point
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.ts            # Default admin & sample data
│   ├── routes/                # API endpoints (admin, students, finance, inventory, POS)
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
