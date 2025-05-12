const User = require('../models/User');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
};

// Middleware to check if user is an admin
const isAdmin = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const user = await User.findById(req.session.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Add user info to request for convenience
    req.user = user;
    next();
  } catch (error) {
    console.error('Error in admin middleware:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking admin status'
    });
  }
};

module.exports = {
  isAuthenticated,
  isAdmin
}; 