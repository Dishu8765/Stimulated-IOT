require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'silabs-prep/envmonitor/readings';
const HISTORY_SIZE = parseInt(process.env.HISTORY_SIZE || '100', 10);

// ─── In-memory ring buffer ────────────────────────────────────────────────────
// Stores the last HISTORY_SIZE readings so a freshly-connected browser can
// immediately render a chart without waiting for new MQTT messages.
const history = [];

function addReading(reading) {
  reading.ts = reading.ts || new Date().toISOString();
  history.push(reading);
  if (history.length > HISTORY_SIZE) {
    history.shift(); // drop oldest
  }
  return reading;
}

// ─── Express + Socket.io ─────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// REST — send full history to a newly-connected client
app.get('/api/readings', (req, res) => {
  res.json(history);
});

// REST — inject a fake reading for testing without the Wokwi simulator
app.post('/api/simulate', (req, res) => {
  const { temp, humidity, emergency } = req.body;

  if (temp === undefined || humidity === undefined) {
    return res.status(400).json({ error: 'temp and humidity are required' });
  }

  const reading = addReading({
    temp: parseFloat(temp),
    humidity: parseFloat(humidity),
    emergency: Boolean(emergency),
  });

  io.emit('reading', reading);
  console.log('[simulate] injected reading:', reading);
  res.json({ ok: true, reading });
});

// Socket.io — send history on connection
io.on('connection', (socket) => {
  console.log('[socket.io] client connected:', socket.id);
  socket.emit('history', history);

  socket.on('disconnect', () => {
    console.log('[socket.io] client disconnected:', socket.id);
  });
});

// ─── MQTT subscriber ─────────────────────────────────────────────────────────
console.log(`[mqtt] connecting to ${MQTT_BROKER} …`);
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log(`[mqtt] connected — subscribing to "${MQTT_TOPIC}"`);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) console.error('[mqtt] subscribe error:', err);
  });
});

mqttClient.on('message', (topic, payload) => {
  try {
    const raw = JSON.parse(payload.toString());

    // Firmware publishes: { "temp": 24.5, "humidity": 55, "emergency": false }
    const reading = addReading({
      temp: parseFloat(raw.temp),
      humidity: parseFloat(raw.humidity),
      emergency: Boolean(raw.emergency),
    });

    io.emit('reading', reading);
    console.log(`[mqtt] received → temp=${reading.temp}°C  hum=${reading.humidity}%  emergency=${reading.emergency}`);
  } catch (e) {
    console.warn('[mqtt] could not parse payload:', payload.toString(), e.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('[mqtt] error:', err.message);
});

mqttClient.on('offline', () => {
  console.warn('[mqtt] broker offline — will reconnect automatically');
});

// ─── Start ───────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Backend running at http://localhost:${PORT}`);
  console.log(`   REST  GET  /api/readings`);
  console.log(`   REST  POST /api/simulate`);
  console.log(`   MQTT subscribing to: ${MQTT_TOPIC}\n`);
});
