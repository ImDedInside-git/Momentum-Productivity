// jshint esversion:6
require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const session = require("express-session");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer"); // Add nodemailer import
const app = express();
const taskController = require('./taskController');

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "your_secret_key",
  resave: false,
  saveUninitialized: true
}));

// Create a connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Get a connection from the pool
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL: " + err.stack);
    return;
  }
  console.log("Connected to MySQL as id " + connection.threadId);

  // Create users table
  const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT 'user@example.com',
    dob DATE DEFAULT '1900-01-01',
    role VARCHAR(50) DEFAULT 'user',
    isAdmin BOOLEAN DEFAULT FALSE,
    theme_preference ENUM('light', 'dark') DEFAULT 'light'
  )`;

  // Create tasks table with new fields
  const createTasksTable = `CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority ENUM('urgent', 'scheduled', 'completed') DEFAULT 'scheduled',
    estimated_time INT,
    actual_time INT,
    due_date DATE,
    status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

  // Create daily_stats table
  const createDailyStatsTable = `CREATE TABLE IF NOT EXISTS daily_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    date DATE,
    total_tasks INT DEFAULT 0,
    completed_tasks INT DEFAULT 0,
    total_estimated_time INT DEFAULT 0,
    total_actual_time INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_user_date (user_id, date)
  )`;

  connection.query(createUsersTable, (err) => {
    if (err) {
      console.error("Error creating users table:", err);
      return;
    }
    console.log("Users table ready");
  });

  connection.query(createTasksTable, (err) => {
    if (err) {
      console.error("Error creating tasks table:", err);
      return;
    }
    console.log("Tasks table ready");
  });

  connection.query(createDailyStatsTable, (err) => {
    if (err) {
      console.error("Error creating daily_stats table:", err);
      return;
    }
    console.log("Daily stats table ready");
  });

  // Release the connection back to the pool
  connection.release();
});

// Default items
const defaultItems = [
  { name: "Complete Robotics Project.", description: "Finish the robotics project by the end of the week.", due_date: "2023-04-30", user_id: null },
  { name: "Discuss Start-up Ideas.", description: "Prepare a presentation for the startup ideas meeting.", due_date: "2023-04-25", user_id: null }
];

// Theme middleware
app.use((req, res, next) => {
  if (req.session.userId) {
    pool.query('SELECT theme_preference FROM users WHERE id = ?', [req.session.userId], (err, results) => {
      if (err) {
        console.error("Error fetching user theme:", err);
        req.session.theme = 'light';
      } else {
        req.session.theme = results[0]?.theme_preference || 'light';
      }
      next();
    });
  } else {
    next();
  }
});

// Home route
app.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Get user's theme preference
  pool.query('SELECT theme_preference FROM users WHERE id = ?', [req.session.userId], (err, userResults) => {
    if (err) {
      console.error("Error fetching user theme:", err);
      return res.redirect("/login");
    }

    const userTheme = userResults[0]?.theme_preference || 'light';
    req.session.theme = userTheme;

    // Check if user is admin and redirect to admin dashboard
    pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
      if (err) {
        console.error("Error checking admin status:", err);
        return res.redirect("/login");
      }

      if (results[0] && results[0].isAdmin) {
        return res.redirect("/admin");
      }

      const today = new Date().toISOString().split('T')[0];
      
      // Get tasks with priority-based sorting
      const tasksQuery = `SELECT * FROM tasks 
         WHERE user_id = ? 
         ORDER BY 
           CASE priority
             WHEN 'urgent' THEN 1
             WHEN 'scheduled' THEN 2
             WHEN 'completed' THEN 3
           END,
           due_date ASC`;
    
      // Get today's productivity stats and priority overview
      const statsQuery = `SELECT 
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND DATE(created_at) = ?) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND DATE(created_at) = ? AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND priority = 'urgent') as urgent_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND priority = 'scheduled') as scheduled_tasks,
        (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND priority = 'completed') as completed_priority_tasks`;

      // Get upcoming deadlines (next 3 days)
      const upcomingQuery = `SELECT 
        COUNT(*) as upcoming_count,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_upcoming
      FROM tasks 
      WHERE user_id = ? 
      AND due_date BETWEEN ? AND DATE_ADD(?, INTERVAL 3 DAY)
      AND status != 'completed'`;

      pool.query(tasksQuery, [req.session.userId], (err, tasks) => {
        if (err) {
          console.error(err);
          tasks = [];
        }

        // Get productivity stats and priority overview
        pool.query(statsQuery, [
          req.session.userId, today,
          req.session.userId, today,
          req.session.userId,
          req.session.userId,
          req.session.userId
        ], (err, stats) => {
          if (err) {
            console.error(err);
            stats = [{
              total_tasks: 0,
              completed_tasks: 0,
              urgent_tasks: 0,
              scheduled_tasks: 0,
              completed_priority_tasks: 0
            }];
          }

          const todayStats = stats[0] || {
            total_tasks: 0,
            completed_tasks: 0,
            urgent_tasks: 0,
            scheduled_tasks: 0,
            completed_priority_tasks: 0
          };

          // Get upcoming deadlines
          pool.query(upcomingQuery, [req.session.userId, today, today], (err, upcoming) => {
            if (err) {
              console.error(err);
              upcoming = [{
                upcoming_count: 0,
                urgent_upcoming: 0
              }];
            }

            const upcomingStats = upcoming[0] || {
              upcoming_count: 0,
              urgent_upcoming: 0
            };

            // Calculate productivity score
            const productivityScore = todayStats.total_tasks > 0 
              ? Math.round((todayStats.completed_tasks / todayStats.total_tasks) * 100) 
              : 0;

            res.render("list", {
              listTitle: "My Tasks",
              newListItems: tasks,
              session: req.session,
              todayStats: todayStats,
              upcomingStats: upcomingStats,
              productivityScore: productivityScore,
              theme: userTheme
            });
          });
        });
      });
    });
  });
});

// Registration route
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, password, confirmPassword, email, dob } = req.body;
  
  // Validate input
  if (!username || !password || !confirmPassword || !email || !dob) {
    return res.render("register", { error: "All fields are required" });
  }

  // Check if passwords match
  if (password !== confirmPassword) {
    return res.render("register", { error: "Passwords do not match" });
  }

  try {
    // Get a connection from the pool
    pool.getConnection(async (err, connection) => {
      if (err) {
        console.error("Error getting connection from pool:", err);
        return res.render("register", { error: "Database connection error. Please try again." });
      }

      try {
        // Check if username exists
        const [userResults] = await connection.promise().query(
          "SELECT id FROM users WHERE username = ?",
          [username]
        );

        if (userResults.length > 0) {
          connection.release();
          return res.render("register", { error: "Username already exists" });
        }

        // Check if email exists
        const [emailResults] = await connection.promise().query(
          "SELECT id FROM users WHERE email = ?",
          [email]
        );

        if (emailResults.length > 0) {
          connection.release();
          return res.render("register", { error: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await connection.promise().query(
          "INSERT INTO users (username, password, email, dob, role) VALUES (?, ?, ?, ?, 'user')",
          [username, hashedPassword, email, dob]
        );

        connection.release();
        res.redirect("/login");
      } catch (error) {
        console.error("Registration error:", error);
        connection.release();
        res.render("register", { error: "Registration failed. Please try again." });
      }
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.render("register", { error: "An unexpected error occurred. Please try again." });
  }
});

// Login route
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  pool.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
    if (error) {
      console.error('Login error:', error);
      return res.render("login", { error: "Login failed. Please try again." });
    }
    if (results.length === 0) {
      return res.render("login", { error: "Invalid username or password." });
    }
    const user = results[0];
    // Use bcrypt to compare hashed passwords
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render("login", { error: "Invalid username or password." });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.redirect("/");
  });
});

// Logout route
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Add new item
app.post("/", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const { taskName, description, dueDate, priority, estimatedTime } = req.body;
  const task = {
    title: taskName,
    description: description || null,
    due_date: dueDate || null,
    priority: priority || 'scheduled',
    estimated_time: estimatedTime || null,
    user_id: req.session.userId
  };

  pool.query("INSERT INTO tasks SET ?", task, (err) => {
    if (err) console.error(err);
    res.redirect("/");
  });
});

// Delete item
app.post("/delete", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const taskId = req.body.checkbox;
  const query = req.session.role === 'admin' 
    ? "DELETE FROM tasks WHERE id = ?"
    : "DELETE FROM tasks WHERE id = ? AND user_id = ?";
  
  const queryParams = req.session.role === 'admin' 
    ? [taskId]
    : [taskId, req.session.userId];

  pool.query(query, queryParams, (err) => {
    if (err) console.error(err);
    res.redirect("/");
  });
});

// About page
app.get("/about", (req, res) => {
  const message = req.session.message;
  // Clear the message after reading it
  req.session.message = null;
  res.render("about", {
    listTitle: "About",
    session: req.session,
    message: message || null
  });
});

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Handle comment submissions
app.post("/send-comment", (req, res) => {
    const { comment, email } = req.body;

    const mailOptions = {
        from: email || 'anonymous@todoapp.com',
        to: 'shettipavan75@gmail.com',
        subject: 'New Comment from To-Do App',
        text: `Comment: ${comment}\nFrom: ${email || 'Anonymous'}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            req.session.message = {
                type: 'error',
                text: 'Error sending comment. Please try again later.'
            };
        } else {
            console.log('Email sent:', info.response);
            req.session.message = {
                type: 'success',
                text: 'Thank you for your comment! We will get back to you soon.'
            };
        }
        res.redirect('/about');
    });
});

// Add Task page
app.get("/add-task", function (req, res) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.render("add-task", { session: req.session });
});

// Add Task POST route
app.post("/add-task", function (req, res) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  const { taskName, description, dueDate } = req.body;
  
  // Format the datetime string to MySQL format
  const formattedDueDate = dueDate ? new Date(dueDate).toISOString().slice(0, 19).replace('T', ' ') : null;
  
  const task = {
    title: taskName,
    description: description || null,
    due_date: formattedDueDate,
    user_id: req.session.userId
  };

  // Validate due date
  if (dueDate) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDate);
    if (due < today) {
      return res.render("add-task", { session: req.session, error: "Due date cannot be before today." });
    }
  }

  pool.query("INSERT INTO tasks SET ?", task, (err) => {
    if (err) {
      console.error(err);
      return res.render("add-task", { session: req.session, error: "Error adding task. Please try again." });
    }
    res.redirect("/");
  });
});

// Profile route
app.get("/account", function (req, res) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  pool.query("SELECT username, email, dob, role, theme_preference FROM users WHERE id = ?", [req.session.userId], (err, results) => {
    if (err) {
      console.error("MySQL error on /account:", err);
      return res.render("profile", {
        user: {
          username: req.session.username || 'Unknown',
          email: req.session.email || 'Unknown',
          dob: req.session.dob || 'Unknown',
          role: req.session.role || 'user'
        },
        session: req.session,
        theme: req.session.theme || 'light',
        error: "Could not fetch full profile from database. Displaying session info only.",
        success: null,
        info: null
      });
    }
    if (results.length > 0) {
      res.render("profile", { 
        user: results[0], 
        session: req.session, 
        theme: results[0].theme_preference || req.session.theme || 'light',
        error: null,
        success: null,
        info: null
      });
    } else {
      res.render("profile", {
        user: {
          username: req.session.username || 'Unknown',
          email: req.session.email || 'Unknown',
          dob: req.session.dob || 'Unknown',
          role: req.session.role || 'user'
        },
        session: req.session,
        theme: req.session.theme || 'light',
        error: "User not found in database. Displaying session info only.",
        success: null,
        info: null
      });
    }
  });
});

// Update profile route
app.post("/update-profile", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    // Get current user data
    const [userResults] = await pool.promise().query(
      "SELECT * FROM users WHERE id = ?",
      [req.session.userId]
    );

    if (userResults.length === 0) {
      return res.render("profile", {
        user: userResults[0],
        session: req.session,
        theme: req.session.theme || 'light',
        error: "User not found",
        success: null,
        info: null
      });
    }

    const user = userResults[0];

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.render("profile", {
        user: user,
        session: req.session,
        theme: user.theme_preference || req.session.theme || 'light',
        error: "Current password is incorrect",
        success: null,
        info: null
      });
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.render("profile", {
        user: user,
        session: req.session,
        theme: user.theme_preference || req.session.theme || 'light',
        error: "New passwords do not match",
        success: null,
        info: null
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.promise().query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, req.session.userId]
    );

    return res.render("profile", {
      user: user,
      session: req.session,
      theme: user.theme_preference || req.session.theme || 'light',
      success: "Password updated successfully",
      error: null,
      info: null
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.render("profile", {
      user: userResults[0],
      session: req.session,
      theme: req.session.theme || 'light',
      error: "An error occurred while updating your password",
      success: null,
      info: null
    });
  }
});

// Update task status and time tracking
app.post("/update-task", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const { taskId, status, actualTime, priority } = req.body;
  const today = new Date().toISOString().split('T')[0];

  // Update the task status and priority
  const updateQuery = "UPDATE tasks SET status = ?, priority = ?, actual_time = ? WHERE id = ? AND user_id = ?";
  const updateParams = [
    status || 'pending', 
    status === 'completed' ? 'completed' : (priority || 'scheduled'), 
    status === 'completed' ? (actualTime || 0) : null, 
    taskId, 
    req.session.userId
  ];

  pool.query(updateQuery, updateParams, (err, result) => {
    if (err) {
      console.error("Error updating task:", err);
      return res.redirect("/");
    }

    // Only update daily stats if the status is changing to completed
    if (status === 'completed') {
      const statsQuery = `
        INSERT INTO daily_stats (user_id, date, completed_tasks, total_actual_time)
        VALUES (?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE
        completed_tasks = completed_tasks + 1,
        total_actual_time = total_actual_time + ?`;

      pool.query(statsQuery, [req.session.userId, today, actualTime || 0, actualTime || 0], (err) => {
        if (err) {
          console.error("Error updating daily stats:", err);
        }
      });
    } else if (status === 'pending') {
      // Decrement completed tasks count when uncompleting a task
      const statsQuery = `
        UPDATE daily_stats 
        SET completed_tasks = GREATEST(0, completed_tasks - 1)
        WHERE user_id = ? AND date = ?`;

      pool.query(statsQuery, [req.session.userId, today], (err) => {
        if (err) {
          console.error("Error updating daily stats:", err);
        }
      });
    }

    res.redirect("/");
  });
});

// Update theme preference
app.post("/update-theme", express.json(), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const { theme } = req.body;
  if (!theme || !['light', 'dark'].includes(theme)) {
    return res.status(400).json({ success: false, error: 'Invalid theme' });
  }

  // Update theme in database
  pool.query(
    'UPDATE users SET theme_preference = ? WHERE id = ?',
    [theme, req.session.userId],
    (err) => {
      if (err) {
        console.error('Error updating theme:', err);
        return res.status(500).json({ success: false, error: 'Failed to update theme' });
      }

      // Update session
      req.session.theme = theme;
      res.json({ success: true });
    }
  );
});

// Calendar route
app.get("/calendar", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  const query = req.session.role === 'admin' 
    ? `SELECT tasks.*, users.username 
       FROM tasks 
       LEFT JOIN users ON tasks.user_id = users.id 
       WHERE tasks.due_date IS NOT NULL 
       ORDER BY tasks.due_date ASC`
    : `SELECT * FROM tasks 
       WHERE user_id = ? 
       AND due_date IS NOT NULL 
       ORDER BY due_date ASC`;
  
  const queryParams = req.session.role === 'admin' ? [] : [req.session.userId];

  pool.query(query, queryParams, (err, tasks) => {
    if (err) {
      console.error("Calendar query error:", err);
      tasks = [];
    }

    // Format tasks for calendar display
    const formattedTasks = tasks.map(task => ({
      ...task,
      title: task.title,
      description: task.description || '',
      start: task.due_date,
      end: task.due_date,
      className: `event-${task.priority || 'scheduled'}`,
      allDay: true,
      extendedProps: {
        status: task.status,
        estimatedTime: task.estimated_time,
        actualTime: task.actual_time,
        assignedTo: task.username || req.session.username
      }
    }));

    res.render("calendar", { 
      tasks: formattedTasks,
      session: req.session,
      theme: req.session.theme || 'light'
    });
  });
});

// Analytics route
app.get("/analytics", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Get user's theme preference
  pool.query('SELECT theme_preference FROM users WHERE id = ?', [req.session.userId], (err, userResults) => {
    if (err) {
      console.error("Error fetching user theme:", err);
      return res.redirect("/login");
    }

    const userTheme = userResults[0]?.theme_preference || 'light';
    req.session.theme = userTheme;

    // Get task statistics with proper aggregation
    const statsQuery = req.session.role === 'admin'
      ? `SELECT 
           COUNT(*) as total_tasks,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
           SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_tasks,
           SUM(CASE WHEN priority = 'scheduled' THEN 1 ELSE 0 END) as scheduled_tasks
         FROM tasks`
      : `SELECT 
           COUNT(*) as total_tasks,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
           SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_tasks,
           SUM(CASE WHEN priority = 'scheduled' THEN 1 ELSE 0 END) as scheduled_tasks
         FROM tasks 
         WHERE user_id = ?`;

    const queryParams = req.session.role === 'admin' ? [] : [req.session.userId];

    pool.query(statsQuery, queryParams, (err, stats) => {
      if (err) {
        console.error("Error fetching task stats:", err);
        stats = [{
          total_tasks: 0,
          completed_tasks: 0,
          urgent_tasks: 0,
          scheduled_tasks: 0
        }];
      }

      const statsData = stats[0] || {
        total_tasks: 0,
        completed_tasks: 0,
        urgent_tasks: 0,
        scheduled_tasks: 0
      };

      const totalTasks = parseInt(statsData.total_tasks) || 0;
      const completedTasks = parseInt(statsData.completed_tasks) || 0;
      const urgentTasks = parseInt(statsData.urgent_tasks) || 0;
      const scheduledTasks = parseInt(statsData.scheduled_tasks) || 0;

      // Calculate completion rate
      const completionRate = totalTasks > 0 
        ? Math.round((completedTasks / totalTasks) * 100) 
        : 0;

      // Get weekly completion data with proper date handling
      const weeklyQuery = req.session.role === 'admin'
        ? `SELECT 
             DATE(created_at) as date,
             COUNT(*) as completed
           FROM tasks 
           WHERE status = 'completed'
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        : `SELECT 
             DATE(created_at) as date,
             COUNT(*) as completed
           FROM tasks 
           WHERE status = 'completed'
           AND user_id = ?
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
           GROUP BY DATE(created_at)
           ORDER BY date ASC`;

      // Get daily activity data with proper day mapping
      const dailyActivityQuery = req.session.role === 'admin'
        ? `SELECT 
             DAYOFWEEK(created_at) as day,
             COUNT(*) as count
           FROM tasks
           WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DAYOFWEEK(created_at)
           ORDER BY day`
        : `SELECT 
             DAYOFWEEK(created_at) as day,
             COUNT(*) as count
           FROM tasks
           WHERE user_id = ?
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DAYOFWEEK(created_at)
           ORDER BY day`;

      pool.query(weeklyQuery, queryParams, (err, weeklyData) => {
        if (err) {
          console.error("Error fetching weekly data:", err);
          weeklyData = [];
        }

        // Generate labels for the last 7 days
        const weeklyLabels = [];
        const weeklyCompletions = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          weeklyLabels.push(dateStr);
          
          const dayData = weeklyData.find(d => {
            const taskDate = new Date(d.date);
            return taskDate.toISOString().split('T')[0] === dateStr;
          });
          weeklyCompletions.push(dayData ? parseInt(dayData.completed) : 0);
        }

        // Get daily activity data
        pool.query(dailyActivityQuery, queryParams, (err, dailyData) => {
          if (err) {
            console.error("Error fetching daily activity:", err);
            dailyData = [];
          }

          // Initialize array with 7 zeros (one for each day)
          const dailyActivity = Array(7).fill(0);
          
          // Fill in the actual data
          dailyData.forEach(item => {
            // Adjust day index (MySQL's DAYOFWEEK returns 1-7, we want 0-6)
            const dayIndex = item.day - 1;
            dailyActivity[dayIndex] = parseInt(item.count) || 0;
          });

          res.render("analytics", {
            totalTasks,
            completedTasks,
            urgentTasks,
            scheduledTasks,
            productivityScore: completionRate,
            weeklyLabels,
            weeklyCompletions,
            dailyActivity,
            session: req.session,
            theme: userTheme
          });
        });
      });
    });
  });
});

// Admin Dashboard route
app.get("/admin", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    // Get all users except the current admin
    const usersQuery = `
      SELECT 
        u.id as user_id,
        u.username,
        u.email,
        u.role,
        COUNT(t.id) as total_tasks,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        MAX(t.created_at) as last_activity
      FROM users u
      LEFT JOIN tasks t ON u.id = t.user_id
      WHERE u.id != ?
      GROUP BY u.id, u.username, u.email, u.role
      ORDER BY u.username`;

    pool.query(usersQuery, [req.session.userId], (err, users) => {
      if (err) {
        console.error("Admin dashboard error:", err);
        users = [];
      }

      res.render("admin", {
        users: users,
        session: req.session,
        theme: req.session.theme || 'light',
        searchQuery: ''
      });
    });
  });
});

// Admin delete user route
app.post("/admin/delete-user", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const { userId } = req.body;

    // Don't allow admin to delete themselves
    if (parseInt(userId) === req.session.userId) {
      return res.redirect("/admin");
    }

    // First delete all tasks associated with the user
    pool.query("DELETE FROM tasks WHERE user_id = ?", [userId], (err) => {
      if (err) {
        console.error("Error deleting user tasks:", err);
        return res.redirect("/admin");
      }

      // Then delete the user
      pool.query("DELETE FROM users WHERE id = ?", [userId], (err) => {
        if (err) {
          console.error("Error deleting user:", err);
        }
        res.redirect("/admin");
      });
    });
  });
});

// Admin view user tasks route
app.get("/admin/user/:userId", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const userId = req.params.userId;

    // Get user info
    pool.query('SELECT username FROM users WHERE id = ?', [userId], (err, userResults) => {
      if (err || !userResults[0]) {
        return res.redirect("/admin");
      }

      // Get user's tasks
      const tasksQuery = `
        SELECT * FROM tasks 
        WHERE user_id = ? 
        ORDER BY 
          CASE priority
            WHEN 'urgent' THEN 1
            WHEN 'scheduled' THEN 2
            WHEN 'completed' THEN 3
          END,
          due_date ASC`;

      pool.query(tasksQuery, [userId], (err, tasks) => {
        if (err) {
          console.error("Error fetching user tasks:", err);
          tasks = [];
        }

        res.render("admin-user", {
          user: userResults[0],
          tasks: tasks,
          session: req.session,
          theme: req.session.theme || 'light'
        });
      });
    });
  });
});

// Admin delete task route
app.post("/admin/delete-task", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const { taskId, userId } = req.body;

    pool.query("DELETE FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId], (err) => {
      if (err) {
        console.error("Error deleting task:", err);
      }
      res.redirect(`/admin/user/${userId}`);
    });
  });
});

// Diagrams route
app.get("/diagrams", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    res.render("diagrams", {
      session: req.session,
      theme: req.session.theme || 'light'
    });
  });
});

// Report route
app.get("/report", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    res.render("report", {
      session: req.session,
      theme: req.session.theme || 'light'
    });
  });
});

// Submit report route
app.post("/submit-report", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const { reportTitle, reportType, reportDate, reportContent, status } = req.body;
    
    // Create reports table if it doesn't exist
    const createReportsTable = `CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      type ENUM('weekly', 'monthly', 'quarterly', 'annual') NOT NULL,
      report_date DATE NOT NULL,
      content TEXT NOT NULL,
      status ENUM('draft', 'final') NOT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`;

    pool.query(createReportsTable, (err) => {
      if (err) {
        console.error("Error creating reports table:", err);
        return res.redirect("/report");
      }

      // Insert the report
      const report = {
        title: reportTitle,
        type: reportType,
        report_date: reportDate,
        content: reportContent,
        status: status,
        created_by: req.session.userId
      };

      pool.query("INSERT INTO reports SET ?", report, (err) => {
        if (err) {
          console.error("Error inserting report:", err);
          return res.redirect("/report");
        }

        res.redirect("/report");
      });
    });
  });
});

// Create user account route
app.post("/admin/create-user", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const { username, email, password, isAdmin, dob } = req.body;

    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res.redirect("/admin");
      }

      // Create the user with default values if not provided
      const newUser = {
        username,
        email: email || 'user@example.com',
        password: hashedPassword,
        isAdmin: isAdmin === 'true',
        role: isAdmin === 'true' ? 'admin' : 'user',
        dob: dob || '1900-01-01'
      };

      pool.query("INSERT INTO users SET ?", newUser, (err) => {
        if (err) {
          console.error("Error creating user account:", err);
          return res.redirect("/admin");
        }
        res.redirect("/admin");
      });
    });
  });
});

// Update username route
app.post("/admin/update-username", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // Check if user is admin
  pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, results) => {
    if (err || !results[0] || !results[0].isAdmin) {
      return res.redirect("/");
    }

    const { userId, newUsername } = req.body;

    // Don't allow admin to change their own username
    if (parseInt(userId) === req.session.userId) {
      return res.redirect("/admin");
    }

    // Update the username
    pool.query("UPDATE users SET username = ? WHERE id = ?", [newUsername, userId], (err) => {
      if (err) {
        console.error("Error updating username:", err);
      }
      res.redirect("/admin");
    });
  });
});

// Admin search user route
app.get('/admin/search-user', async (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.redirect('/login');
  }

  try {
    const searchUsername = req.query.searchUsername || '';
    const showAdmins = req.query.showAdmins === 'on';
    
    let query = `
      SELECT u.*, 
        COUNT(t.id) as total_tasks,
        SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END) as completed_tasks
      FROM users u
      LEFT JOIN tasks t ON u.id = t.user_id
      WHERE u.id != ?
    `;
    
    const params = [req.session.user.id];
    
    if (searchUsername) {
      query += ` AND u.username LIKE ?`;
      params.push(`%${searchUsername}%`);
    }
    
    if (showAdmins) {
      query += ` AND u.isAdmin = 1`;
    }
    
    query += ` GROUP BY u.id ORDER BY u.username`;

    const users = await pool.promise().query(query, params);
    
    res.render('admin', {
      users: users[0],
      session: req.session,
      theme: req.session.theme || 'light',
      searchQuery: searchUsername,
      showAdmins: showAdmins
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).send('Error searching users');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
