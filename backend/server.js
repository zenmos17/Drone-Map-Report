const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');

// Initialize Express app
const app = express();
const PORT = 3333;
let wsServer = null;

// Simple in-memory session storage (for demo - use session library in production)
const sessions = {};

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = (parts.shift() || '').trim();
    const value = decodeURIComponent(parts.join('='));
    if (key) list[key] = value;
  });

  return list;
}

function getSessionIdFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return req.headers['x-session-id'] || cookies.adminSessionId || null;
}

function broadcastRealtime(type, payload = {}) {
  if (!wsServer) {
    return;
  }

  const message = JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    ...payload
  });

  wsServer.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}


// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Save file with timestamp to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to set Content-Type header for responses
app.use((req, res, next) => {
  const sid = getSessionIdFromRequest(req);
  if (sid && sessions[sid]) {
    res.setHeader('X-Session-Valid', 'true');
  }
  next();
});

// Protect admin pages from direct URL access without login
app.use((req, res, next) => {
  if (req.path === '/admin' || req.path === '/admin.html') {
    const sid = getSessionIdFromRequest(req);
    if (!sid || !sessions[sid]) {
      return res.redirect('/login.html');
    }
  }
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve uploaded images
app.use('/uploads', express.static(uploadsDir));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const reportUpload = upload.fields([
  { name: 'images', maxCount: 20 },
  { name: 'image', maxCount: 1 }
]);

// API endpoint: POST a new drone report
app.post('/report', reportUpload, (req, res) => {
  const { reporterName, reporterPhone, location, description, latitude, longitude, altitude } = req.body;

  // Validate required inputs
  if (!reporterName || !reporterPhone || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'Reporter name, reporter phone, latitude, and longitude are required'
    });
  }

  // Parse coordinates
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const alt = altitude ? parseFloat(altitude) : null;

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: 'Invalid coordinates'
    });
  }

  const uploadedImages = [
    ...(Array.isArray(req.files?.images) ? req.files.images : []),
    ...(Array.isArray(req.files?.image) ? req.files.image : [])
  ];

  const imageFilenames = uploadedImages
    .map((file) => file?.filename)
    .filter((name) => typeof name === 'string' && name.trim());

  // Prepare data for database
  const data = {
    reporterName,
    reporterPhone: (reporterPhone || '').trim(),
    location: (location || '').trim(),
    description: (description || '').trim(),
    latitude: lat,
    longitude: lng,
    altitude: alt,
    imageFilenames
  };

  // Insert report into database
  db.insertReport(data, (err, report) => {
    if (err) {
      // Delete uploaded files if database insert fails
      uploadedImages.forEach((file) => {
        if (!file?.path) {
          return;
        }
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting file:', unlinkErr);
        });
      });
      return res.status(500).json({
        error: 'Failed to create report'
      });
    }
    broadcastRealtime('reports_updated', { reason: 'created', reportId: report?.id || null });
    res.status(201).json(report);
  });
});

// API endpoint: GET all drone reports
app.get('/reports', (req, res) => {
  db.getAllReports((err, reports) => {
    if (err) {
      return res.status(500).json({
        error: 'Failed to fetch reports'
      });
    }
    res.json(reports);
  });
});

// ============================================
// AUTHENTICATION & ADMIN ENDPOINTS
// ============================================

// API endpoint: Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.authenticateUser(username, password, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session with user role
    const sessionId = Date.now().toString();
    sessions[sessionId] = { 
      username, 
      role: user.role || 'admin',
      createdAt: new Date() 
    };

    res.setHeader('Set-Cookie', `adminSessionId=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`);
    res.json({ success: true, username, role: user.role || 'admin' });
  });
});

// API endpoint: Logout
app.post('/logout', (req, res) => {
  const requestedId = req.body?.sessionId;
  const sessionId = requestedId || getSessionIdFromRequest(req);

  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }

  res.setHeader('Set-Cookie', 'adminSessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true });
});

// Middleware: Check if session is valid
function requireAuth(req, res, next) {
  const sessionId = getSessionIdFromRequest(req);
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.sessionId = sessionId;
  req.username = sessions[sessionId].username;
  req.userRole = sessions[sessionId].role;
  next();
}

// Middleware: Check if user is superadmin
function requireSuperAdmin(req, res, next) {
  const sessionId = getSessionIdFromRequest(req);
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (sessions[sessionId].role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: Superadmin access required' });
  }
  
  req.sessionId = sessionId;
  req.username = sessions[sessionId].username;
  req.userRole = sessions[sessionId].role;
  next();
}

// API endpoint: Check auth status
app.get('/auth-status', (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  
  if (sessionId && sessions[sessionId]) {
    res.json({ 
      authenticated: true, 
      username: sessions[sessionId].username,
      role: sessions[sessionId].role 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// API endpoint: Delete report (Superadmin only)
app.delete('/report/:id', requireAuth, (req, res) => {
  const sessionId = getSessionIdFromRequest(req);
  const userRole = sessions[sessionId]?.role;
  
  // Only superadmin can delete reports
  if (userRole !== 'superadmin') {
    return res.status(403).json({ error: 'ไม่อนุญาต: เฉพาะผู้ดูแลระบบระดับสูงเท่านั้นที่สามารถลบรายงานได้' });
  }

  const reportId = req.params.id;

  // First get report data so we can delete image file after deleting DB row
  db.getReport(reportId, (err, report) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to query report' });
    }

    db.getReportImageFilenames(reportId, (imageErr, imageFilenames) => {
      if (imageErr) {
        return res.status(500).json({ error: 'Failed to query report images' });
      }

      db.deleteReport(reportId, (deleteErr, result) => {
        if (deleteErr) {
          return res.status(500).json({ error: 'Failed to delete report' });
        }

        const legacyImages = report && report.image_filename ? [report.image_filename] : [];
        const allImages = Array.from(new Set([...(imageFilenames || []), ...legacyImages]));

        allImages.forEach((filename) => {
          const imagePath = path.join(uploadsDir, filename);
          fs.unlink(imagePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting image:', unlinkErr);
          });
        });

        broadcastRealtime('reports_updated', { reason: 'deleted', reportId: Number(reportId) });
        res.json({ success: true, message: 'Report deleted' });
      });
    });
  });
});

// API endpoint: Change password
app.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  // Verify current password
  db.authenticateUser(req.username, currentPassword, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    db.updateUserPassword(req.username, newPassword, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update password' });
      }

      res.json({ success: true, message: 'Password changed successfully' });
    });
  });
});

// API endpoint: Mark report as viewed (Admin only)
app.put('/report/:id/viewed', requireAuth, (req, res) => {
  const reportId = req.params.id;
  const viewed = req.body.viewed === true;

  db.updateReportViewed(reportId, viewed, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update report viewed status' });
    }

    broadcastRealtime('reports_updated', { reason: 'viewed', reportId: Number(reportId) });
    res.json({ success: true, message: 'Report viewed status updated' });
  });
});


// API endpoint: Update report status (Admin only)
app.put('/report/:id/status', requireAuth, (req, res) => {
  const reportId = req.params.id;
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(req.body, 'viewed')) {
    payload.viewed = req.body.viewed === true;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'reported')) {
    payload.reported = req.body.reported === true;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'reportNote')) {
    payload.reportNote = req.body.reportNote;
  }

  db.updateReportStatus(reportId, payload, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update report status' });
    }

    broadcastRealtime('reports_updated', { reason: 'status', reportId: Number(reportId) });
    res.json({ success: true, message: 'Report status updated' });
  });
});

// ============================================
// USER MANAGEMENT ENDPOINTS (Superadmin only)
// ============================================

// API endpoint: Get all users (Superadmin only)
app.get('/admin/users', requireSuperAdmin, (req, res) => {
  db.getAllUsers((err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
    res.json(users);
  });
});

// API endpoint: Create new user (Superadmin only)
app.post('/admin/users', requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  if (!['admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either "admin" or "superadmin"' });
  }

  db.createUser(username, password, role, (err, result) => {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      return res.status(500).json({ error: 'Failed to create user' });
    }
    res.status(201).json(result);
  });
});

// API endpoint: Delete user (Superadmin only)
app.delete('/admin/users/:id', requireSuperAdmin, (req, res) => {
  const userId = req.params.id;

  // Prevent deleting yourself
  const sessionId = getSessionIdFromRequest(req);
  const currentUser = sessions[sessionId];
  
  if (currentUser && currentUser.username === 'superadmin' && userId === '1') {
    return res.status(400).json({ error: 'Cannot delete the default superadmin user' });
  }

  db.deleteUser(userId, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete user' });
    }
    
    if (result.deletedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, message: 'User deleted successfully' });
  });
});

// API endpoint: Update user role (Superadmin only)
app.put('/admin/users/:id/role', requireSuperAdmin, (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (!role || !['admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Valid role (admin or superadmin) is required' });
  }

  db.updateUserRole(userId, role, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update user role' });
    }
    
    if (result.updatedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, message: 'User role updated successfully' });
  });
});

// API endpoint: Change user password (Superadmin can change any user's password)
app.post('/admin/users/:id/password', requireSuperAdmin, (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  // First get the username from user ID
  db.getAllUsers((err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    const user = users.find(u => u.id == userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the password
    db.updateUserPassword(user.username, newPassword, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to update password' });
      }

      res.json({ success: true, message: 'Password updated successfully' });
    });
  });
});

// Serve admin page
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});

wsServer = new WebSocketServer({
  server,
  path: '/ws'
});

wsServer.on('connection', (socket) => {
  socket.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString()
  }));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  if (wsServer) {
    wsServer.close();
  }
  db.closeDatabase();
  process.exit(0);
});

