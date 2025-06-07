const { Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');

// For now, we'll just export the sequelize instance
// TODO: Import and associate all models when they're implemented
const db = {
  sequelize,
  Sequelize
};

module.exports = db; 