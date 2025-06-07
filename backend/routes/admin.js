const express = require('express');
const router = express.Router();

// Placeholder admin routes
// TODO: Implement full admin system

// Health check for admin routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'admin',
    timestamp: new Date().toISOString()
  });
});

// Get pending users (placeholder)
router.get('/pending-users', (req, res) => {
  res.status(501).json({ 
    error: 'Admin system not yet implemented',
    message: 'Coming soon! This will list users awaiting approval.'
  });
});

// Approve user (placeholder)
router.post('/approve-user/:id', (req, res) => {
  res.status(501).json({ 
    error: 'Admin system not yet implemented',
    message: 'Coming soon! This will approve pending users.'
  });
});

// Email whitelist management (placeholder)
router.get('/whitelist', (req, res) => {
  res.status(501).json({ 
    error: 'Admin system not yet implemented',
    message: 'Coming soon! This will manage email whitelist patterns.'
  });
});

router.post('/whitelist', (req, res) => {
  res.status(501).json({ 
    error: 'Admin system not yet implemented',
    message: 'Coming soon! This will add email whitelist patterns.'
  });
});

module.exports = router; 