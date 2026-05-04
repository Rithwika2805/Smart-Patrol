const express = require('express');
const router = express.Router();

const stationService = require('../services/stationService');

router.get('/', stationService.getAllStations);
router.post('/', stationService.createStation);

module.exports = router;