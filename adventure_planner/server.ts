import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8099;
const DATA_FILE = path.join(__dirname, 'trips.json');

app.use(cors());
app.use(bodyParser.json());

// GLOBAL LOGGER for debugging Ingress paths
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// 1. API ROUTES FIRST
app.get('/api/trips', async (req, res) => {
  console.log('GET /api/trips');
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.json([]);
    } else {
      console.error('Error reading data:', error);
      res.status(500).json({ error: 'Failed to read data' });
    }
  }
});

app.post('/api/trips', async (req, res) => {
  console.log('POST /api/trips');
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// 2. STATIC FILES SECOND
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// 3. FALLBACK THIRD - only for non-API requests
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
