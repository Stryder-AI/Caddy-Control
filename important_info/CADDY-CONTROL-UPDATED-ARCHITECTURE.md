# Caddy Control - Updated System Architecture
## TCP/IP Server + VT-100 GPS Integration

**Deadline:**
**Status:** Frontend Complete, Backend TCP/IP Server Needed  
**Purpose:** Real-time golf cart fleet management with VT-100 GPS tracker integration

---

## CURRENT STATE: FRONTEND IMPLEMENTATION

### What's Already Built (v0.2)

H has completed a production-ready React frontend with the following modules:

#### 1. **Dashboard** (`/`)
- Real-time fleet map with Mapbox GL JS
- Interactive cart markers (28 carts)
- Cart sidebar with detailed stats
- Alert center with toast notifications
- Bypass control interface

#### 2. **Carts Page** (`/carts`)
- Grid view of all carts
- Status indicators (Active, Inactive, Danger)
- Speed, battery, odometer display
- Bypass active indicators
- Click to select and navigate to map

#### 3. **Alert System**
- Real-time alert generation
- Toast notifications
- Alert center panel
- Acknowledgment and resolution tracking
- Alert types:
  - Low battery (<20%)
  - Danger zone entry
  - Tracker offline
  - Bypass triggered

#### 4. **State Management**
- Zustand-based app store
- Real-time cart position updates
- Alert management
- WebSocket integration hooks
- Demo mode with simulation
- Live mode ready for TCP/IP server

#### 5. **Existing Features**
- Manual bypass activation (15 second duration)
- Cart selection and tracking
- Map centering controls
- Responsive glassmorphic UI
- Real-time telemetry display

---

## WHAT'S NEEDED: TCP/IP SERVER BACKEND

### Core Requirements

**1. VT-100 GPS Tracker Integration**
- Receive live GPS coordinates via TCP/IP
- Parse VT-100 protocol data
- Real-time position broadcasting

**2. Bypass Signal Transmission**
- Send bypass command to specific cart
- 15-second override signal
- Confirmation/acknowledgment handling

**3. Battery Calculation**
- Formula-based battery estimation
- Distance-traveled tracking
- 15km maximum range constant

**4. WebSocket Broadcasting**
- Broadcast telemetry to frontend
- Real-time position updates
- Command acknowledgment responses

---

## VT-100 GPS TRACKER PROTOCOL

### Data Format

**NMEA 0183 Standard (GPRMC Sentence)**
```
$GPRMC,hhmmss.ss,A,ddmm.mmmm,N,dddmm.mmmm,W,ss.s,ddd.d,ddmmyy,,,A*hh
```

**Example:**
```
$GPRMC,123519.00,A,3344.6406,N,07251.7665,W,5.2,45.1,050226,,,A*57
```

**Fields:**
1. `hhmmss.ss` - Time (UTC)
2. `A` - Status (A=Active, V=Void)
3. `ddmm.mmmm,N` - Latitude (degrees, minutes, direction)
4. `dddmm.mmmm,W` - Longitude (degrees, minutes, direction)
5. `ss.s` - Speed over ground (knots)
6. `ddd.d` - Course over ground (degrees)
7. `ddmmyy` - Date
8. `*hh` - Checksum

### VT-100 Extended Format

Some VT-100 devices include additional fields:
```
$GPRMC,...*checksum,device_id,battery_voltage,signal_strength
```

---

## TCP/IP SERVER ARCHITECTURE

### Technology Stack

**Backend Framework:**
```javascript
Node.js + Express + Socket.io + Native TCP Server
```

**Key Libraries:**
- `net` (native) - TCP server
- `socket.io` - WebSocket broadcasting
- `nmea-simple` - NMEA sentence parsing
- `redis` - Optional caching layer

### Server Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TCP/IP SERVER                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  TCP SERVER  │────────>│   PARSER     │                 │
│  │  (Port 8800) │         │ NMEA/VT-100  │                 │
│  └──────────────┘         └──────────────┘                 │
│         ↓                         ↓                         │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   COMMAND    │         │  TELEMETRY   │                 │
│  │   SENDER     │         │  PROCESSOR   │                 │
│  └──────────────┘         └──────────────┘                 │
│         ↓                         ↓                         │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  WEBSOCKET   │────────>│   FRONTEND   │                 │
│  │ BROADCASTER  │         │  (Port 3000) │                 │
│  └──────────────┘         └──────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION: TCP SERVER

### File Structure

```
caddy-control-backend/
├── src/
│   ├── server.js              # Main entry point
│   ├── tcp/
│   │   ├── tcpServer.js       # TCP socket server
│   │   └── parser.js          # NMEA/VT-100 parser
│   ├── websocket/
│   │   └── broadcaster.js     # Socket.io WebSocket
│   ├── telemetry/
│   │   ├── processor.js       # Data processing
│   │   └── battery.js         # Battery calculation
│   ├── commands/
│   │   └── sender.js          # Send commands to carts
│   └── utils/
│       ├── validation.js      # Data validation
│       └── logger.js          # Logging utility
├── config/
│   └── server.config.js       # Configuration
├── package.json
└── README.md
```

### Core Implementation

#### 1. **TCP Server** (`tcp/tcpServer.js`)

```javascript
const net = require('net');
const { parseNMEA } = require('./parser');
const { processTelemetry } = require('../telemetry/processor');

const TCP_PORT = process.env.TCP_PORT || 8800;
const clients = new Map(); // Store connected cart sockets

const tcpServer = net.createServer((socket) => {
  let cartId = null;
  
  console.log(`[TCP] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
  
  socket.on('data', (data) => {
    try {
      const raw = data.toString().trim();
      console.log(`[TCP] Received: ${raw}`);
      
      // Parse NMEA sentence
      const parsed = parseNMEA(raw);
      
      if (parsed) {
        // Extract or assign cart ID
        cartId = parsed.deviceId || assignCartId(socket);
        clients.set(cartId, socket);
        
        // Process telemetry
        const telemetry = processTelemetry(parsed, cartId);
        
        // Broadcast to frontend via WebSocket
        broadcastTelemetry(telemetry);
      }
    } catch (error) {
      console.error('[TCP] Parse error:', error.message);
    }
  });
  
  socket.on('error', (error) => {
    console.error('[TCP] Socket error:', error.message);
  });
  
  socket.on('close', () => {
    console.log(`[TCP] Connection closed for cart ${cartId || 'unknown'}`);
    if (cartId) clients.delete(cartId);
  });
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
  console.log(`[TCP] Server listening on port ${TCP_PORT}`);
});

// Send bypass command to specific cart
function sendBypassCommand(cartId, duration = 15) {
  const socket = clients.get(cartId);
  if (socket && socket.writable) {
    const command = `BYPASS:${duration}\n`;
    socket.write(command);
    console.log(`[TCP] Sent bypass command to cart ${cartId}: ${duration}s`);
    return true;
  }
  console.warn(`[TCP] Cart ${cartId} not connected`);
  return false;
}

module.exports = { tcpServer, sendBypassCommand, clients };
```

#### 2. **NMEA Parser** (`tcp/parser.js`)

```javascript
function parseNMEA(sentence) {
  // Validate checksum
  if (!validateChecksum(sentence)) {
    throw new Error('Invalid checksum');
  }
  
  // Remove checksum and split
  const parts = sentence.split('*')[0].split(',');
  
  if (parts[0] !== '$GPRMC') {
    return null; // Only handle GPRMC sentences
  }
  
  // Parse GPRMC fields
  const [
    type,
    time,
    status,
    latStr,
    latDir,
    lngStr,
    lngDir,
    speedKnots,
    course,
    date,
    ...extra
  ] = parts;
  
  if (status !== 'A') {
    throw new Error('GPS status invalid (not Active)');
  }
  
  // Convert lat/lng from NMEA format to decimal degrees
  const lat = convertToDecimal(latStr, latDir);
  const lng = convertToDecimal(lngStr, lngDir);
  
  // Convert knots to km/h
  const speedKph = parseFloat(speedKnots || 0) * 1.852;
  
  // Extract device ID if present in extra fields
  const deviceId = extra.length > 0 ? extra[0] : null;
  
  return {
    lat,
    lng,
    speedKph,
    course: parseFloat(course || 0),
    timestamp: parseGPSTime(time, date),
    deviceId,
    raw: sentence
  };
}

function convertToDecimal(value, direction) {
  if (!value) return 0;
  
  // NMEA format: ddmm.mmmm or dddmm.mmmm
  const degrees = Math.floor(parseFloat(value) / 100);
  const minutes = parseFloat(value) % 100;
  
  let decimal = degrees + (minutes / 60);
  
  // Apply direction
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
}

function validateChecksum(sentence) {
  if (!sentence.includes('*')) return false;
  
  const [data, checksumStr] = sentence.split('*');
  const checksum = parseInt(checksumStr, 16);
  
  // Calculate checksum (XOR of all characters between $ and *)
  let calculated = 0;
  for (let i = 1; i < data.length; i++) {
    calculated ^= data.charCodeAt(i);
  }
  
  return calculated === checksum;
}

function parseGPSTime(timeStr, dateStr) {
  // Parse hhmmss.ss and ddmmyy
  const hours = parseInt(timeStr.substring(0, 2));
  const minutes = parseInt(timeStr.substring(2, 4));
  const seconds = parseInt(timeStr.substring(4, 6));
  
  const day = parseInt(dateStr.substring(0, 2));
  const month = parseInt(dateStr.substring(2, 4)) - 1; // JS months are 0-indexed
  const year = 2000 + parseInt(dateStr.substring(4, 6));
  
  return new Date(year, month, day, hours, minutes, seconds).getTime();
}

module.exports = { parseNMEA };
```

#### 3. **Telemetry Processor** (`telemetry/processor.js`)

```javascript
const { calculateBattery } = require('./battery');

// Store cart state for battery calculation
const cartStates = new Map();

function processTelemetry(parsed, cartId) {
  const prevState = cartStates.get(cartId);
  
  // Calculate distance traveled since last update
  const distanceTraveled = prevState 
    ? calculateDistance(prevState.lat, prevState.lng, parsed.lat, parsed.lng)
    : 0;
  
  // Calculate battery percentage
  const batteryPct = calculateBattery(cartId, distanceTraveled, prevState);
  
  // Get or calculate odometer
  const odometerKm = prevState 
    ? prevState.odometerKm + distanceTraveled
    : 0;
  
  // Determine status
  const status = determineStatus(parsed.speedKph, batteryPct);
  
  const telemetry = {
    cartId,
    lat: parsed.lat,
    lng: parsed.lng,
    speedKph: Math.round(parsed.speedKph * 10) / 10,
    batteryPct: Math.round(batteryPct),
    odometerKm: Math.round(odometerKm * 100) / 100,
    status,
    timestamp: parsed.timestamp || Date.now()
  };
  
  // Update state
  cartStates.set(cartId, telemetry);
  
  return telemetry;
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  // Haversine formula for distance in km
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in km
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function determineStatus(speedKph, batteryPct) {
  if (batteryPct < 10) return 'DANGER';
  if (speedKph < 1) return 'INACTIVE';
  return 'ACTIVE';
}

module.exports = { processTelemetry };
```

#### 4. **Battery Calculator** (`telemetry/battery.js`)

```javascript
// Battery calculation based on distance traveled
// Assumptions:
// - Full battery range: 15 km
// - Linear discharge model
// - Initial battery: 100% if unknown

const BATTERY_RANGE_KM = 15; // Maximum range on full battery
const batteryStates = new Map();

function calculateBattery(cartId, distanceTraveled, prevState) {
  let state = batteryStates.get(cartId);
  
  // Initialize if first time
  if (!state) {
    state = {
      batteryPct: 100,
      totalDistanceOnBattery: 0
    };
  }
  
  // If previous state exists and has battery data, use it
  if (prevState && prevState.batteryPct !== undefined) {
    state.batteryPct = prevState.batteryPct;
    state.totalDistanceOnBattery = prevState.totalDistanceOnBattery || 0;
  }
  
  // Add distance traveled
  state.totalDistanceOnBattery += distanceTraveled;
  
  // Calculate battery drain (linear model)
  const drainPercentage = (distanceTraveled / BATTERY_RANGE_KM) * 100;
  state.batteryPct = Math.max(0, state.batteryPct - drainPercentage);
  
  // Store updated state
  batteryStates.set(cartId, state);
  
  return state.batteryPct;
}

// Reset battery to full (e.g., after charging)
function resetBattery(cartId) {
  batteryStates.set(cartId, {
    batteryPct: 100,
    totalDistanceOnBattery: 0
  });
}

// Set specific battery level
function setBatteryLevel(cartId, percentage) {
  const state = batteryStates.get(cartId) || { totalDistanceOnBattery: 0 };
  state.batteryPct = Math.max(0, Math.min(100, percentage));
  batteryStates.set(cartId, state);
}

module.exports = { calculateBattery, resetBattery, setBatteryLevel };
```

#### 5. **WebSocket Broadcaster** (`websocket/broadcaster.js`)

```javascript
const { Server } = require('socket.io');
const { sendBypassCommand } = require('../tcp/tcpServer');

let io = null;

function initializeWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });
  
  io.on('connection', (socket) => {
    console.log('[WebSocket] Client connected:', socket.id);
    
    // Handle bypass command from frontend
    socket.on('COMMAND', (data) => {
      const { cartId, command } = data;
      
      if (command === 'BYPASS_15S') {
        const success = sendBypassCommand(cartId, 15);
        
        // Send acknowledgment back to frontend
        socket.emit('COMMAND_ACK', {
          cartId,
          command,
          success,
          timestamp: Date.now()
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('[WebSocket] Client disconnected:', socket.id);
    });
  });
  
  console.log('[WebSocket] Server initialized');
}

function broadcastTelemetry(telemetry) {
  if (io) {
    io.emit('cart:position', telemetry);
  }
}

function broadcastAlert(alert) {
  if (io) {
    io.emit('alert:new', alert);
  }
}

module.exports = { initializeWebSocket, broadcastTelemetry, broadcastAlert };
```

#### 6. **Main Server** (`server.js`)

```javascript
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { tcpServer } = require('./tcp/tcpServer');
const { initializeWebSocket } = require('./websocket/broadcaster');

const app = express();
const httpServer = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tcp: tcpServer.listening,
    timestamp: Date.now()
  });
});

// Initialize WebSocket
initializeWebSocket(httpServer);

// Start HTTP server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[HTTP] Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down gracefully...');
  httpServer.close(() => {
    tcpServer.close(() => {
      console.log('[Server] All servers closed');
      process.exit(0);
    });
  });
});
```

---

## FREE TCP/IP SERVER HOSTING OPTIONS

### Option 1: **Railway.app** (RECOMMENDED)
**Why:** Free tier, automatic deployments, built-in TCP support

**Setup:**
```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Initialize project
railway init

# 3. Deploy
railway up

# 4. Add TCP port exposure
railway domain  # Get public URL
```

**Pros:**
- Free $5/month credit (enough for this use case)
- Automatic HTTPS
- GitHub auto-deploy
- Simple TCP port exposure
- Built-in logging

**Cons:**
- Need credit card for verification

---

### Option 2: **Render.com**
**Why:** Free tier, easy setup, good for Node.js

**Setup:**
1. Push code to GitHub
2. Connect Render to GitHub repo
3. Create new "Web Service"
4. Configure:
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add TCP port in settings

**Pros:**
- True free tier (no credit card)
- Auto-deploy from Git
- Simple dashboard

**Cons:**
- Spins down after 15 mins of inactivity (wakes on request)
- TCP support requires custom configuration

---

### Option 3: **Fly.io**
**Why:** Global edge network, good performance

**Setup:**
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch app
flyctl launch

# Deploy
flyctl deploy
```

**Pros:**
- Free tier with 3 shared CPUs
- Global deployment
- Good for IoT applications

**Cons:**
- Requires credit card
- Slightly more complex setup

---

### Option 4: **Oracle Cloud Free Tier**
**Why:** Always free VPS with public IP

**Setup:**
1. Create Oracle Cloud account
2. Launch free tier VM (ARM-based, 4 cores, 24GB RAM)
3. Install Node.js
4. Deploy via Git
5. Open firewall ports

**Pros:**
- Completely free forever
- Full VPS control
- Public static IP
- No spin-down issues

**Cons:**
- Manual server management
- Requires VM setup knowledge

---

### Option 5: **Heroku** (Legacy Free Tier Replacement)
**Note:** Heroku discontinued free tier, but can use Eco Dynos ($5/month)

---

### RECOMMENDED SETUP: Railway.app

**Why Railway:**
1. Easy TCP/IP port exposure
2. Automatic HTTPS for WebSocket
3. GitHub auto-deploy
4. Built-in monitoring
5. Free tier sufficient for demo/production

**Configuration:**

Create `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Create `Procfile`:
```
web: node src/server.js
```

**Environment Variables:**
```env
TCP_PORT=8800
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
```

---

## FRONTEND INTEGRATION CHANGES

### Update AppProvider.tsx

**Current code has WebSocket placeholder:**
```javascript
// Live WebSocket mode
useEffect(() => {
  if (streamMode !== 'live') {
    wsRef.current?.close();
    return;
  }
  try {
    const ws = new WebSocket('ws://localhost:8080/ws');
    // ...
  }
}, [streamMode]);
```

**Change to:**
```javascript
// Live WebSocket mode
useEffect(() => {
  if (streamMode !== 'live') {
    wsRef.current?.close();
    return;
  }
  
  const socketUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const socket = io(socketUrl);
  
  socket.on('connect', () => {
    console.log('[WebSocket] Connected to backend');
  });
  
  socket.on('cart:position', (telemetry) => {
    updateCart(telemetry);
  });
  
  socket.on('alert:new', (alert) => {
    addAlert(alert);
  });
  
  socket.on('COMMAND_ACK', (ack) => {
    console.log('[Command] Acknowledged:', ack);
  });
  
  wsRef.current = socket;
  
  return () => {
    socket.disconnect();
  };
}, [streamMode, updateCart, addAlert]);
```

**Update command sending:**
```javascript
const sendCommand = useCallback((cmd) => {
  if (wsRef.current?.connected) {
    wsRef.current.emit('COMMAND', cmd);
  }
  console.log('[Caddy Control] Command sent:', cmd);
}, []);
```

---

## DEPLOYMENT CHECKLIST

### Backend Deployment

**Step 1: Prepare Repository**
```bash
cd caddy-control-backend
git init
git add .
git commit -m "Initial backend implementation"
git remote add origin <your-repo-url>
git push -u origin main
```

**Step 2: Deploy to Railway**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Link to GitHub repo
railway link

# Deploy
railway up

# Get public URL
railway domain
```

**Step 3: Configure TCP Port**
1. Go to Railway dashboard
2. Select your service
3. Go to "Settings" → "Networking"
4. Click "Add TCP Proxy"
5. Set port 8800
6. Get public TCP endpoint: `tcp://<service-id>.railway.app:8800`

**Step 4: Configure Environment Variables**
```
TCP_PORT=8800
PORT=3001
FRONTEND_URL=https://your-caddy-control.vercel.app
NODE_ENV=production
```

---

### Frontend Deployment

**Update `.env.production`:**
```env
VITE_BACKEND_URL=https://<railway-service>.railway.app
```

**Deploy to Vercel/Netlify:**
```bash
# Already deployed, just update env variable
vercel env add VITE_BACKEND_URL production
```

---

## VT-100 GPS TRACKER CONFIGURATION

### Device Settings

**TCP/IP Connection:**
- **Server Address:** `<railway-service-id>.railway.app`
- **Port:** `8800`
- **Protocol:** TCP
- **Data Format:** NMEA 0183 GPRMC sentences
- **Send Interval:** 5 seconds (recommended)

**Device ID:**
- Each cart should send unique identifier
- Can be IMEI or custom cart ID
- Include in NMEA extended fields or separate message

**Example Configuration Command:**
```
// Via SMS or device management interface
SERVER:<railway-url>,8800,TCP#
INTERVAL:5#
```

---

## TESTING STRATEGY

### 1. Local Testing

**Terminal 1: Start Backend**
```bash
cd caddy-control-backend
npm install
npm start
```

**Terminal 2: Simulate GPS Data**
```bash
# Install netcat
# Send test NMEA sentence
echo '$GPRMC,123519.00,A,3344.6406,N,07251.7665,W,5.2,45.1,050226,,,A*57' | nc localhost 8800
```

**Terminal 3: Start Frontend**
```bash
cd Caddy_Control_v0.2
npm run dev
```

### 2. GPS Simulator Script

Create `test/gps-simulator.js`:
```javascript
const net = require('net');

const CARTS = [
  { id: '01', lat: 33.444406, lng: 72.862765 },
  { id: '02', lat: 33.444506, lng: 72.862865 },
  // ... add more carts
];

function generateNMEA(cart) {
  const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  const date = new Date().toLocaleDateString('en-GB').split('/').reverse().join('').substring(2);
  
  const latDeg = Math.floor(cart.lat);
  const latMin = ((cart.lat - latDeg) * 60).toFixed(4);
  const lngDeg = Math.floor(Math.abs(cart.lng));
  const lngMin = ((Math.abs(cart.lng) - lngDeg) * 60).toFixed(4);
  
  const sentence = `$GPRMC,${time},A,${latDeg}${latMin},N,${lngDeg}${lngMin},W,5.2,45.1,${date},,,A`;
  const checksum = calculateChecksum(sentence);
  
  return `${sentence}*${checksum},${cart.id}`;
}

function calculateChecksum(sentence) {
  let checksum = 0;
  for (let i = 1; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

// Connect and send data
CARTS.forEach(cart => {
  const client = net.connect({ host: 'localhost', port: 8800 }, () => {
    console.log(`Connected cart ${cart.id}`);
    
    setInterval(() => {
      // Simulate movement
      cart.lat += (Math.random() - 0.5) * 0.0001;
      cart.lng += (Math.random() - 0.5) * 0.0001;
      
      const nmea = generateNMEA(cart);
      client.write(nmea + '\n');
      console.log(`Sent: ${nmea}`);
    }, 5000);
  });
});
```

**Run simulator:**
```bash
node test/gps-simulator.js
```

---

## PACKAGE.JSON

### Backend Dependencies

```json
{
  "name": "caddy-control-backend",
  "version": "1.0.0",
  "description": "TCP/IP server for VT-100 GPS tracker integration",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node test/gps-simulator.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## SUCCESS CRITERIA

### Backend
✅ TCP server listening on port 8800  
✅ Parse NMEA GPRMC sentences correctly  
✅ Calculate battery based on distance (15km range)  
✅ Broadcast telemetry via WebSocket  
✅ Receive bypass commands from frontend  
✅ Send bypass signal to VT-100 device  
✅ Handle multiple cart connections  

### Frontend Integration
✅ Connect to WebSocket backend  
✅ Receive real-time cart positions  
✅ Display cart telemetry correctly  
✅ Send bypass commands successfully  
✅ Show command acknowledgment  

### End-to-End
✅ VT-100 device connects to TCP server  
✅ GPS coordinates displayed on map  
✅ Battery calculated and displayed  
✅ Bypass command sent and confirmed  
✅ System runs stable for 4+ hours  

---

## NEXT STEPS (IMMEDIATE)

### Tonight/Tomorrow

**1. Backend Implementation (4-6 hours)**
- Set up Node.js project structure
- Implement TCP server with NMEA parser
- Add battery calculation logic
- Create WebSocket broadcaster
- Test with GPS simulator

**2. Deploy to Railway (1 hour)**
- Push to GitHub
- Deploy via Railway
- Configure TCP port exposure
- Test public endpoint

**3. Frontend Integration (1 hour)**
- Update AppProvider.tsx WebSocket connection
- Update environment variables
- Deploy updated frontend
- Test end-to-end

**4. VT-100 Configuration (1 hour)**
- Configure device TCP settings
- Test real GPS data flow
- Validate bypass commands
- Monitor stability

---

## SUPPORT & MONITORING

### Logging
```javascript
// Structured logging
const log = {
  tcp: (msg) => console.log(`[TCP] ${new Date().toISOString()} - ${msg}`),
  ws: (msg) => console.log(`[WS] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};
```

### Health Monitoring
- HTTP health endpoint: `/health`
- TCP connection count tracking
- WebSocket client count
- Last telemetry timestamp per cart

---

**STATUS:** Architecture complete, ready for implementation  
**Backend:** Not yet implemented (needs tonight/tomorrow)  
**Frontend:** Complete and ready  
**Deadline:** Tomorrow  
**Confidence:** High (straightforward implementation)
