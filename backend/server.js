require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Debug logging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.url}`);
    next();
});

app.use('/api', apiRoutes);
app.use('/proxy/api', apiRoutes);

// Serve Frontend (Production)
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.use('/proxy', express.static(frontendDist));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({error: 'Not Found'});
    
    const index = path.join(frontendDist, 'index.html');
    if (require('fs').existsSync(index)) {
        res.sendFile(index);
    } else {
        res.send('Proxy Ray Web Backend is running. Frontend not built.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
