const express = require('express');
const router = express.Router();
const patrolController = require('../controllers/patrolController');

router.get('/', patrolController.getAllPatrols);
router.get('/active', patrolController.getActivePatrols);
router.get('/analytics', patrolController.getPatrolAnalytics);
router.post('/suggest', patrolController.generatePatrolSuggestions);
router.get('/:id', patrolController.getPatrolById);
router.post('/', patrolController.createPatrol);
router.put('/:id/status', patrolController.updatePatrolStatus);
router.put('/waypoint/:waypoint_id', patrolController.updateWaypointStatus);

module.exports = router;
