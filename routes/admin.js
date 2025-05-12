const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { isAdmin } = require('../middleware/auth');
const User = require('../models/User');

// Middleware to ensure only admins can access these routes
router.use(isAdmin);

// Admin dashboard
router.get('/', (req, res) => {
  res.render('admin/dashboard', {
    path: '/admin',
    session: req.session
  });
});

// Create admin account page
router.get('/create-account', (req, res) => {
  res.render('admin/create-account', {
    path: '/admin/create-account',
    session: req.session
  });
});

// Search users
router.get('/search-users', async (req, res) => {
  try {
    const { q: searchTerm, admins } = req.query;
    
    // Build search query
    const query = {
      $or: [
        { username: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    };

    // Add role filter if admins only
    if (admins === 'true') {
      query.role = 'admin';
    }

    // Search users
    const users = await User.find(query)
      .select('username email role')
      .limit(10);

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while searching users'
    });
  }
});

// Handle admin account creation
router.post('/create-account', async (req, res) => {
  try {
    const {
      currentAdminPassword,
      newAdminUsername,
      newAdminEmail,
      newAdminPassword,
      confirmPassword
    } = req.body;

    // Verify current admin password
    const currentAdmin = await User.findOne({ username: req.session.username });
    const isValidPassword = await bcrypt.compare(currentAdminPassword, currentAdmin.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current admin password is incorrect'
      });
    }

    // Check if passwords match
    if (newAdminPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [
        { username: newAdminUsername },
        { email: newAdminEmail }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newAdminPassword, salt);

    // Create new admin user
    const newAdmin = new User({
      username: newAdminUsername,
      email: newAdminEmail,
      password: hashedPassword,
      role: 'admin'
    });

    await newAdmin.save();

    res.status(200).json({
      success: true,
      message: 'Admin account created successfully'
    });

  } catch (error) {
    console.error('Error creating admin account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the admin account'
    });
  }
});

module.exports = router; 