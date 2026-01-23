const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');
const subService = require('../services/subscriptionService');
const configService = require('../services/configService');

// Public Routes
router.post('/login', authController.login);

router.get('/subscribe/config', (req, res) => {
    const configStr = configService.getGeneratedConfigString();
    res.setHeader('Content-Type', 'application/json');
    res.send(configStr);
});

router.get('/subscribe/qr', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const basePath = process.env.BASE_PATH || '';
        const fullUrl = `${protocol}://${host}${basePath}/api/subscribe/config`;
        
        const qr = await QRCode.toDataURL(fullUrl);
        const img = Buffer.from(qr.split(',')[1], 'base64');
        
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length
        });
        res.end(img); 
    } catch (e) {
        res.status(500).send('Error generating QR');
    }
});

// Protected Routes
router.use(auth);

// Subscriptions
router.get('/subs', (req, res) => {
    res.json(subService.getSubscriptions());
});

router.post('/subs', (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
    subService.addSubscription(name, url);
    res.json({ success: true });
});

router.delete('/subs/:name', (req, res) => {
    subService.deleteSubscription(req.params.name);
    res.json({ success: true });
});

router.post('/subs/:name/update', async (req, res) => {
    try {
        const count = await subService.updateSubscription(req.params.name);
        res.json({ success: true, count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/nodes', (req, res) => {
    res.json(subService.getAllNodes());
});

// Mappings
router.get('/mappings', (req, res) => {
    res.json(configService.loadMappings());
});

router.post('/mappings', (req, res) => {
    configService.saveMappings(req.body);
    res.json({ success: true });
});

module.exports = router;
