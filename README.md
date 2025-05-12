# Momentum - To-Do List Web App

Momentum is a modern, feature-rich To-Do List web application designed to help users manage their tasks efficiently. It includes user authentication, an admin dashboard, and a beautiful, responsive UI.

---

## Features

- **User Authentication**
  - Secure registration and login
  - Password hashing for security

- **Task Management**
  - Create, edit, complete, and delete tasks
  - Mark tasks as completed/incomplete
  - View tasks by status (active/completed)
  - Due dates and priorities

- **Admin Dashboard**
  - View all users and their tasks
  - Create, update, and delete user accounts
  - Search and filter users (by username, admin status)
  - View user activity and statistics
  - Delete users and all their tasks

- **User Profile**
  - Update profile information
  - Change password

- **Responsive Design**
  - Works on desktop and mobile devices
  - Light/Dark theme toggle

- **Database Diagrams**
  - Visualize the database schema (for admins)

---

## Main Functions

### User Functions

- **Register**: Create a new user account
- **Login/Logout**: Secure session management
- **Add Task**: Add a new to-do item
- **Edit Task**: Update task details
- **Delete Task**: Remove a task
- **Complete Task**: Mark a task as done
- **View Tasks**: See all your tasks, filter by status

### Admin Functions

- **User Management**: Create, update, delete users
- **Search Users**: Find users by username or filter by admin status
- **View User Tasks**: See all tasks for any user
- **Delete User**: Remove a user and all their tasks
- **Database Diagrams**: Access and view database structure

---

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS, Bootstrap 5, JavaScript
- **Database**: (e.g., SQLite, PostgreSQL, or MySQL)
- **Authentication**: express-session, bcrypt
- **Other**: Bootstrap Icons

---

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm
- (Optional) SQLite/PostgreSQL/MySQL

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/To-Do-List-Web-App.git
   cd To-Do-List-Web-App
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in your settings

4. **Run database migrations**
   ```bash
   npm run migrate
   ```

5. **Start the app**
   ```bash
   npm start
   ```

6. **Visit in your browser**
   ```
   http://localhost:3000
   ```

---

## Folder Structure

/views         # EJS templates
/routes        # Express route handlers
/models        # Database models
/public        # Static assets (CSS, JS, images) 
/views # EJS templates
/routes # Express route handlers
/models # Database models
/public # Static assets (CSS, JS, images)

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## License

[MIT](LICENSE)