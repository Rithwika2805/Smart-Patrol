const express = require('express');
const router = express.Router();

const stationService = require('../services/stationService');

// Route to get all stations
router.get('/', stationService.getAllStations);

// Route to create a station
router.post('/', stationService.createStation);

module.exports = router;