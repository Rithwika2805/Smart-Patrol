const express = require('express');
const router = express.Router();
const crimeController = require('../controllers/crimeController');

router.get('/', crimeController.getAllCrimes);
router.get('/stats', crimeController.getCrimeStats);
router.get('/hotspots', crimeController.getHotspots);
router.post('/predict-risk', crimeController.predictRisk);
router.get('/:id', crimeController.getCrimeById);
router.post('/', crimeController.createCrime);
router.put('/:id', crimeController.updateCrime);
router.delete('/:id', crimeController.deleteCrime);

module.exports = router;
