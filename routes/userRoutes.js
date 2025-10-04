const express = require('express');
const router = express.Router();
const publisherController = require('../controllers/userController');

router.post('/publishers', publisherController.createPublisher);
router.get('/publishers', publisherController.getAllPublishers);
router.post('/publishers/login', publisherController.loginPublisher);


module.exports = router;
