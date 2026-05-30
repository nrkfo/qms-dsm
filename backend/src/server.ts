import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { requestWithRetry, TimeoutError } from './utils/httpClient';
import { setupLogger } from './utils/logger';
import { uploadToGoogleDrive } from './utils/googleDrive';

const logger = setupLogger('Бэкенд');
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'dsm-qms-ultra-secret-key-2026';

// Setup static folder for uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, (req.params.module || 'file') + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fieldSize: 100 * 1024 * 1024, fileSize: 100 * 1024 * 1024 }
});

const safeJsonParse = (str: string, fallback: any = {}) => {
  try { return JSON.parse(str); } catch (e) { return fallback; }
};

const VALID_MODULES = [
  'oqa_tv', 'oqa_pallets', 'oqa_labels', 'oqa_patrol',
  'iqc_aql', 'iqc_panels', 'iqc_eps', 'iqc_covers', 'iqc_components'
];

// --- REAL-TIME UPDATES (SSE) ---
let clients: any[] = [];

const broadcast = (data: any) => {
  clients.forEach(c => {
    try {
      c.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error('SSE broadcast failed for a client');
    }
  });
};

interface UserSession {
  userId: number;
  username: string;
  role: string;
  lastActive: number;
  currentUrl: string;
  selectedLotName?: string | null;
}

let activeSessions: Record<number, UserSession> = {};

// Clean up offline sessions (inactivity threshold: 30 seconds)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(activeSessions).forEach(key => {
    const userId = Number(key);
    if (now - activeSessions[userId].lastActive > 30000) {
      delete activeSessions[userId];
      changed = true;
    }
  });
  if (changed) {
    broadcast({ type: 'USER_SESSIONS_UPDATED', sessions: Object.values(activeSessions) });
  }
}, 10000);

// --- HELPERS ---
const getSetting = (key: string): Promise<string> => {
  return new Promise((resolve) => {
    db.get('SELECT value FROM global_settings WHERE key = ?', [key], (err, row: any) => {
      resolve(row ? row.value : '');
    });
  });
};

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// --- Security Initializations ---


// Auth Middleware
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // Allow unauthenticated GET requests to TV panel resources
  const isPublicPath = req.method === 'GET' && [
    '/api/lots',
    '/api/tv/models',
    '/api/logs/oqa_pallets'
  ].includes(req.path);

  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  // 1. Check API Key first
  if (apiKey) {
    db.get(`SELECT value FROM global_settings WHERE key = 'api_key'`, (err, row: any) => {
      if (!err && row && row.value && row.value === apiKey) {
        (req as any).user = { id: 0, username: 'API_SYSTEM', role: 'Admin' };
        return next();
      }
      if (isPublicPath) return next();
      return res.status(403).json({ error: 'Invalid API Key' });
    });
    return;
  }

  // 2. Check query token (for downloads)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    if (isPublicPath) return next();
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      if (isPublicPath) return next();
      return res.status(401).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  });
};

const checkModulePermission = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const module = req.params.module as string;
  
  // Allow unauthenticated GET requests to oqa_pallets logs (for the public TV screen)
  if (req.method === 'GET' && module === 'oqa_pallets' && !user) {
    return next();
  }
  
  if (!user) return res.status(401).json({ error: 'Access denied' });
  if (user.role === 'Admin') return next();
  
  db.get('SELECT permissions FROM users WHERE id = ?', [user.id], (err, row: any) => {
    if (err || !row) return res.status(500).json({ error: 'Database error' });
    
    let permissions: string[] = [];
    try {
      permissions = JSON.parse(row.permissions || '[]');
    } catch (e) {
      permissions = [];
    }
    
    if (permissions.includes(module)) {
      return next();
    }
    
    // Allow read-only (GET) access to dashboard users so they can see all card details
    if (req.method === 'GET' && permissions.includes('dashboard')) {
      return next();
    }
    
    return res.status(403).json({ error: 'У вас нет доступа к этому модулю.' });
  });
};

// --- API ROUTES ---

// Basic healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DSM-QMS Backend is fully operational' });
});

// SSE Endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Forces Nginx to disable buffering
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Send initial comment to keep client connection warm
  res.write(': ok\n\n');

  // Send a keep-alive heartbeat comment every 20 seconds to prevent connection drops/timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (e) {
      // client connection might have closed
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients = clients.filter(c => c.id !== clientId);
  });
});

// Auth login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user: any) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const validPassword = await bcrypt.compare(password, user.password);
      
      if (validPassword) {
        try { user.permissions = JSON.parse(user.permissions); } catch(e) { user.permissions = []; }
        
        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        delete user.password;
        res.json({ user, token });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    }
  );
});

// Verify current user password
app.post('/api/auth/verify', authenticateToken, (req, res) => {
  const { password } = req.body;
  const userId = (req as any).user.id;
  db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, user: any) => {
    if (err || !user) return res.status(500).json({ error: 'Database error' });
    const valid = await bcrypt.compare(password, user.password);
    if (valid) res.json({ success: true });
    else res.status(401).json({ error: 'Invalid password' });
  });
});

// Heartbeat and Active Sessions
app.post('/api/users/heartbeat', authenticateToken, (req, res) => {
  const { currentUrl, selectedLotName } = req.body;
  const user = (req as any).user;
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const alreadyActive = !!activeSessions[user.id];
  const oldUrl = activeSessions[user.id]?.currentUrl;
  const oldLot = activeSessions[user.id]?.selectedLotName;

  activeSessions[user.id] = {
    userId: user.id,
    username: user.username,
    role: user.role,
    lastActive: now,
    currentUrl: currentUrl || '/',
    selectedLotName: selectedLotName || null
  };

  res.json({ success: true });

  // Broadcast if status changed, page changed, or selected lot changed
  if (!alreadyActive || oldUrl !== currentUrl || oldLot !== selectedLotName) {
    broadcast({ type: 'USER_SESSIONS_UPDATED', sessions: Object.values(activeSessions) });
  }
});

app.get('/api/users/active-sessions', authenticateToken, (req, res) => {
  res.json(Object.values(activeSessions));
});

// Users CRUD
app.get('/api/users', authenticateToken, (req, res) => {
  db.all('SELECT id, username, role, permissions FROM users', [], (err, rows: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsedRows = rows.map(r => {
      try { return { ...r, permissions: JSON.parse(r.permissions) || [] }; }
      catch(e) { return { ...r, permissions: [] }; }
    });
    res.json(parsedRows);
  });
});

app.post('/api/users', authenticateToken, async (req, res) => {
  const { username, password, role, permissions } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const permsStr = JSON.stringify(permissions || []);
  db.run('INSERT INTO users (username, password, role, permissions) VALUES (?, ?, ?, ?)', [username, hashedPassword, role, permsStr], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, username, role, permissions: permissions || [] });
  });
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const { username, password, role } = req.body;
  try {
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?', [username, hashedPassword, role, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    } else {
      db.run('UPDATE users SET username = ?, role = ? WHERE id = ?', [username, role, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id/permissions', authenticateToken, (req, res) => {
  const { permissions } = req.body;
  const permsStr = JSON.stringify(permissions || []);
  db.run('UPDATE users SET permissions = ? WHERE id = ?', [permsStr, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  const userId = req.params.id;
  const modules = [
    'oqa_tv', 'oqa_pallets', 'oqa_labels', 
    'iqc_aql', 'iqc_panels', 'iqc_eps', 
    'iqc_covers', 'iqc_components', 'oqa_patrol'
  ];

  db.serialize(() => {
    modules.forEach(mod => {
      db.run(`UPDATE ${mod}_logs SET user_id = NULL WHERE user_id = ?`, [userId]);
    });
    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Lots CRUD
app.get('/api/lots', authenticateToken, (req, res) => {
  const userId = (req as any).user?.id;
  const userRole = (req as any).user?.role;
  
  if (userRole === 'Admin' || userId === 0) {
    db.all('SELECT * FROM lots ORDER BY id DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  } else {
    db.get('SELECT permissions FROM users WHERE id = ?', [userId], (err, row: any) => {
      let permissions = [];
      if (!err && row && row.permissions) {
        try {
          permissions = JSON.parse(row.permissions);
        } catch (e) {}
      }
      
      let query = "SELECT * FROM lots WHERE status = 'active' ORDER BY id DESC";
      if (permissions.includes('view_all_lots')) {
        query = 'SELECT * FROM lots ORDER BY id DESC';
      }
      
      db.all(query, [], (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(rows);
      });
    });
  }
});

app.post('/api/lots', authenticateToken, (req, res) => {
  const { name, tv_model_id } = req.body;
  db.run('INSERT INTO lots (name, tv_model_id) VALUES (?, ?)', [name, tv_model_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit((req as any).user.id, 'CREATE_LOT', { name, tv_model_id });
    broadcast({ type: 'DATA_UPDATED', module: 'lots', action: 'create' });
    res.json({ id: this.lastID, name, tv_model_id, status: 'active' });
  });
});

app.put('/api/lots/:id', authenticateToken, (req, res) => {
  const { name, tv_model_id, status } = req.body;
  db.run('UPDATE lots SET name = ?, tv_model_id = ?, status = ? WHERE id = ?', [name, tv_model_id, status || 'active', req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    broadcast({ type: 'DATA_UPDATED', module: 'lots', action: 'update' });
    res.json({ success: true });
  });
});

app.delete('/api/lots/:id', authenticateToken, (req, res) => {
  const lotId = req.params.id;
  const modules = [
    'oqa_tv', 'oqa_pallets', 'oqa_labels', 
    'iqc_aql', 'iqc_panels', 'iqc_eps', 
    'iqc_covers', 'iqc_components', 'oqa_patrol'
  ];

  db.serialize(() => {
    modules.forEach(mod => {
      db.run(`DELETE FROM ${mod}_logs WHERE lot_id = ?`, [lotId]);
    });
    db.run('DELETE FROM lots WHERE id = ?', [lotId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      broadcast({ type: 'DATA_UPDATED', module: 'lots', action: 'delete' });
      res.json({ success: true });
    });
  });
});

app.put('/api/logs/:module/:id', authenticateToken, checkModulePermission, async (req, res) => {
  const module = req.params.module as string;
  const id = req.params.id as string;
  let parsedData: any;
  
  try {
    parsedData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON in data field' });
  }

  const status = req.body.status;
  const user_id = (req as any).user.id;
  
  if (!VALID_MODULES.includes(module)) return res.status(400).json({ error: 'Invalid module' });
  
  try {
    // 1. Get old data for Advanced Audit
    const oldRecord = await new Promise<any>((resolve) => {
      db.get(`SELECT * FROM ${module}_logs WHERE id = ?`, [id], (err, row) => resolve(row));
    });

    const result = await new Promise<any>((resolve, reject) => {
      db.run(
        `UPDATE ${module}_logs SET data = ?, status = ? WHERE id = ?`,
        [JSON.stringify(parsedData), status, id],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    if (!oldRecord) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    // 2. Advanced Audit with before/after
    logAudit(user_id, `UPDATE_LOG_${module.toUpperCase()}`, {
      id,
      before: oldRecord ? { data: safeJsonParse(oldRecord.data), status: oldRecord.status } : null,
      after: { data: parsedData, status }
    });
    broadcast({ type: 'DATA_UPDATED', module, action: 'update', id, status });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/logs/:module/:id', authenticateToken, checkModulePermission, async (req, res) => {
  const module = req.params.module as string;
  const id = req.params.id as string;
  const user_id = (req as any).user.id;
  
  if (!VALID_MODULES.includes(module)) return res.status(400).json({ error: 'Invalid module' });

  try {
    // 1. Get old data for audit before delete
    const oldRecord = await new Promise<any>((resolve) => {
      db.get(`SELECT * FROM ${module}_logs WHERE id = ?`, [id], (err, row) => resolve(row));
    });

    if (!oldRecord) return res.status(404).json({ error: 'Запись не найдена' });

    await new Promise<void>((resolve, reject) => {
      db.run(`DELETE FROM ${module}_logs WHERE id = ?`, [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logAudit(user_id, `DELETE_LOG_${module.toUpperCase()}`, {
      id,
      deleted_data: safeJsonParse(oldRecord.data),
      status: oldRecord.status
    });
    broadcast({ type: 'DATA_UPDATED', module, action: 'delete' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PERSISTENCE FOR MODULE LOGS ---

app.get('/api/logs/oqa_labels/last-success', authenticateToken, (req, res) => {
  db.get(
    "SELECT timestamp FROM oqa_labels_logs WHERE status = 'OK' ORDER BY id DESC LIMIT 1",
    [],
    (err, row: any) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const today8AM = new Date();
      today8AM.setHours(8, 0, 0, 0);
      
      const timestamp = row ? row.timestamp : today8AM.toISOString();
      res.json({ timestamp });
    }
  );
});

app.get('/api/logs/:module', authenticateToken, checkModulePermission, (req, res) => {
  const module = req.params.module as string;
  if (!VALID_MODULES.includes(module)) return res.status(400).json({ error: 'Invalid module' });

  const { lot_id } = req.query;
  let query = `
    SELECT l.*, u.username 
    FROM ${module}_logs l 
    LEFT JOIN users u ON l.user_id = u.id 
    WHERE 1=1
  `;
  const params: any[] = [];

  const LOT_INDEPENDENT_MODULES = ['iqc_aql', 'iqc_eps', 'iqc_covers'];
  if (lot_id && lot_id !== 'all' && !LOT_INDEPENDENT_MODULES.includes(module)) {
    query += ' AND l.lot_id = ?';
    params.push(lot_id);
  }

  const { defect_type, part_code, tv_model } = req.query;
  if (defect_type && typeof defect_type === 'string') {
    query += ' AND l.defect_type = ?';
    params.push(defect_type);
  }
  if (part_code && typeof part_code === 'string') {
    query += ' AND l.part_code = ?';
    params.push(part_code);
  }
  if (tv_model && typeof tv_model === 'string') {
    query += ' AND l.tv_model = ?';
    params.push(tv_model);
  }

  const { date } = req.query;
  if (date && typeof date === 'string') {
    const dates = [date];
    if (date.includes('-')) {
      const [y, m, d] = date.split('-');
      dates.push(`${d}.${m}.${y}`);
    } else if (date.includes('.')) {
      const [d, m, y] = date.split('.');
      dates.push(`${y}-${m}-${d}`);
    }
    const uniqueDates = [...new Set(dates)];
    query += ` AND l.date IN (${uniqueDates.map(() => '?').join(',')})`;
    params.push(...uniqueDates);
  }
  if (req.query.full !== 'true') {
    query += ' ORDER BY l.id DESC LIMIT 500';
  } else {
    query += ' ORDER BY l.id DESC';
  }

  db.all(query, params, (err, rows: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = rows.map(r => ({ ...r, data: safeJsonParse(r.data) }));
    res.json(parsed);
  });
});

app.post('/api/logs/:module', authenticateToken, checkModulePermission, (req, res) => {
  const module = req.params.module as string;
  if (!VALID_MODULES.includes(module)) return res.status(400).json({ error: 'Invalid module' });
  const { lot_id, date, data, status } = req.body;
  const user_id = (req as any).user.id;
  const dataStr = JSON.stringify(data);
  const ts = new Date().toISOString();
  db.run(
    `INSERT INTO ${module}_logs (lot_id, user_id, date, data, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [lot_id, user_id, date, dataStr, status, ts],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(user_id, `ADD_LOG_${String(module).toUpperCase()}`, { lot_id, status });
      broadcast({ type: 'DATA_UPDATED', module, action: 'create', lot_id: lot_id ? Number(lot_id) : undefined });
      res.json({ id: this.lastID });
    }
  );
});

// --- METRICS (Dynamic Aggregation from all logs) ---
app.get('/api/metrics', authenticateToken, async (req, res) => {
  const { date, lot_id } = req.query;
  const modules = [
    'oqa_tv', 'oqa_pallets', 'oqa_labels', 
    'iqc_aql', 'iqc_panels', 'iqc_eps', 
    'iqc_covers', 'iqc_components', 'oqa_patrol'
  ];

  // Convert YYYY-MM-DD (from frontend) to DD.MM.YYYY (stored in DB)
  let ruDate = '';
  if (date && typeof date === 'string') {
    const parts = date.split('-');
    if (parts.length === 3) ruDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  try {
    const queries = modules.map(mod => {
      let modQuery = `
        SELECT 
          '${mod}' as module_id,
          COUNT(CASE WHEN status IN ('OK', 'Accept') THEN 1 END) as total_passed,
          COUNT(CASE WHEN status IN ('NG', 'Reject') THEN 1 END) as total_failed,
          GROUP_CONCAT(CASE WHEN status IN ('NG', 'Reject') THEN data END, '||') as defects_data
        FROM ${mod}_logs
        WHERE 1=1
      `;
      const modParams: any[] = [];
      if (date && typeof date === 'string') {
        const dates = [date];
        if (date.includes('-')) {
          const [y, m, d] = date.split('-');
          dates.push(`${d}.${m}.${y}`);
        } else if (date.includes('.')) {
          const [d, m, y] = date.split('.');
          dates.push(`${y}-${m}-${d}`);
        }
        const uniqueDates = [...new Set(dates)];
        modQuery += ` AND date IN (${uniqueDates.map(() => '?').join(',')})`;
        modParams.push(...uniqueDates);
      }
      const LOT_INDEPENDENT_MODULES = ['iqc_aql', 'iqc_eps', 'iqc_covers'];
      if (lot_id && lot_id !== 'all' && !LOT_INDEPENDENT_MODULES.includes(mod)) {
        modQuery += ` AND lot_id = ?`;
        modParams.push(Number(lot_id));
      }
      return { query: modQuery, params: modParams };
    });

    const results = await Promise.all(queries.map(q => new Promise<any>((resolve, reject) => {
      db.get(q.query, q.params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })));

    const processedResults = results.map(row => {
      const topDefects: Record<string, number> = {};
      if (row.defects_data) {
        const dataArr = row.defects_data.split('||');
        dataArr.forEach((d: string) => {
          if (!d) return;
          try {
            const parsed = JSON.parse(d);
            let defectStr = parsed.defect;
            if (!defectStr || defectStr === 'OK') {
              defectStr = parsed.comment || 'Прочие';
            }
            if (defectStr && defectStr !== 'OK' && defectStr !== '-') {
              topDefects[defectStr] = (topDefects[defectStr] || 0) + 1;
            }
          } catch(e) {}
        });
      }
      return {
        module_id: row.module_id,
        total_passed: row.total_passed,
        total_failed: row.total_failed,
        top_defects: Object.entries(topDefects)
          .map(([name, count]) => ({ name, count: count as number }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      };
    });

    res.json(processedResults);
  } catch (err: any) {
    console.error('Metrics aggregation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// High-Performance Defect Aggregation Analytics
app.get('/api/analytics/defects/:module', authenticateToken, (req, res) => {
  const module = req.params.module as string;
  if (!['iqc_panels', 'oqa_tv'].includes(module)) {
    return res.status(400).json({ error: 'Module not supported for defect analytics' });
  }

  const { date, lot_id } = req.query;
  let query = `
    SELECT defect_type, COUNT(*) as count 
    FROM ${module}_logs 
    WHERE status = 'NG' AND defect_type IS NOT NULL AND defect_type != 'OK' AND defect_type != ''
  `;
  const params: any[] = [];

  if (lot_id && lot_id !== 'all') {
    query += ' AND lot_id = ?';
    params.push(lot_id);
  }

  if (date && typeof date === 'string') {
    const dates = [date];
    if (date.includes('-')) {
      const [y, m, d] = date.split('-');
      dates.push(`${d}.${m}.${y}`);
    } else if (date.includes('.')) {
      const [d, m, y] = date.split('.');
      dates.push(`${y}-${m}-${d}`);
    }
    const uniqueDates = [...new Set(dates)];
    query += ` AND date IN (${uniqueDates.map(() => '?').join(',')})`;
    params.push(...uniqueDates);
  }

  query += ' GROUP BY defect_type ORDER BY count DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});



// --- SUPPLIERS & ARTICLES ---
app.get('/api/suppliers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM suppliers', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/suppliers', authenticateToken, (req, res) => {
  const { name } = req.body;
  db.run('INSERT INTO suppliers (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
});

app.put('/api/suppliers/:id', authenticateToken, (req, res) => {
  const { name, is_active } = req.body;
  db.run('UPDATE suppliers SET name = ?, is_active = ? WHERE id = ?', [name, is_active === undefined ? 1 : is_active, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/suppliers/:id', authenticateToken, (req, res) => {
  const supplierId = req.params.id;
  db.serialize(() => {
    db.run('DELETE FROM articles WHERE supplier_id = ?', [supplierId]);
    db.run('DELETE FROM suppliers WHERE id = ?', [supplierId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.get('/api/articles', authenticateToken, (req, res) => {
  const { supplier_id } = req.query;
  let query = 'SELECT * FROM articles';
  const params = [];
  if (supplier_id) {
    query += ' WHERE supplier_id = ?';
    params.push(supplier_id);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/articles', authenticateToken, (req, res) => {
  const { supplier_id, name, category, specs, drawing_url } = req.body;
  db.run('INSERT INTO articles (supplier_id, name, category, specs, drawing_url) VALUES (?, ?, ?, ?, ?)', 
    [supplier_id, name, category || 'General', specs || '', drawing_url || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, supplier_id, name, category, specs, drawing_url, is_active: 1 });
  });
});

app.post('/api/articles/bulk', authenticateToken, (req, res) => {
  const { supplier_id, articles } = req.body;
  db.serialize(() => {
    const stmt = db.prepare('INSERT INTO articles (supplier_id, name, category) VALUES (?, ?, ?)');
    articles.forEach((art: any) => stmt.run(supplier_id, art.name, art.category || 'General'));
    stmt.finalize();
    res.json({ success: true });
  });
});

app.put('/api/articles/:id', authenticateToken, (req, res) => {
  const { name, category, specs, drawing_url, is_active } = req.body;
  db.run(`UPDATE articles SET name = ?, category = ?, specs = ?, drawing_url = ?, is_active = ? WHERE id = ?`, 
    [name, category, specs, drawing_url, is_active === undefined ? 1 : is_active, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/articles/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM articles WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- COMPONENTS MASTER (Independent) ---
app.get('/api/components-master', authenticateToken, (req, res) => {
  const { tv_model_id } = req.query;
  let query = 'SELECT * FROM components_master';
  const params = [];
  
  if (tv_model_id) {
    query += ' WHERE tv_model_id = ?';
    params.push(tv_model_id);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/components-master', authenticateToken, (req, res) => {
  const { article, name, tv_model_id } = req.body;
  db.run('INSERT INTO components_master (article, name, tv_model_id) VALUES (?, ?, ?)', [article, name, tv_model_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, article, name, tv_model_id });
  });
});

app.post('/api/components-master/bulk', authenticateToken, (req, res) => {
  const { tv_model_id, components } = req.body;
  if (!tv_model_id || !Array.isArray(components)) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('INSERT INTO components_master (article, name, tv_model_id) VALUES (?, ?, ?)');
    components.forEach((c: any) => {
      stmt.run(c.article, c.name, tv_model_id);
    });
    stmt.finalize();
    db.run('COMMIT', (err) => {
      if (err) {
        console.error('Transaction commit error:', err);
        return res.status(500).json({ error: 'Failed to commit transaction' });
      }
      res.json({ success: true, count: components.length });
    });
  });
});

app.delete('/api/components-master/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM components_master WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/components-master/:id', authenticateToken, (req, res) => {
  const { article, name } = req.body;
  db.run('UPDATE components_master SET article = ?, name = ? WHERE id = ?', [article, name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


// --- TV MODELS & TESTS ---
app.get('/api/tv/models', authenticateToken, (req, res) => {
  db.all('SELECT * FROM tv_models ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tv/models', authenticateToken, (req, res) => {
  const { 
    name, mn_keyword, 
    label_sn_len, label_mn_len, label_ean_len, 
    label_sn_fix, label_mn_fix, label_ean_fix,
    label_parsing_config,
    pallet_barcode_len, pallet_barcode_fix, pallet_parsing_config, pallet_keyword
  } = req.body;
  db.run('INSERT INTO tv_models (name, mn_keyword, label_sn_len, label_mn_len, label_ean_len, label_sn_fix, label_mn_fix, label_ean_fix, label_parsing_config, pallet_barcode_len, pallet_barcode_fix, pallet_parsing_config, pallet_keyword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
    [name, mn_keyword, label_sn_len, label_mn_len, label_ean_len, label_sn_fix, label_mn_fix, label_ean_fix, label_parsing_config, pallet_barcode_len, pallet_barcode_fix, pallet_parsing_config, pallet_keyword], 
    function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

app.put('/api/tv/models/:id', authenticateToken, (req, res) => {
  const { 
    name, mn_keyword, 
    label_sn_len, label_mn_len, label_ean_len, 
    label_sn_fix, label_mn_fix, label_ean_fix,
    label_parsing_config,
    pallet_barcode_len, pallet_barcode_fix, pallet_parsing_config, pallet_keyword
  } = req.body;
  
  // Build query dynamically to only update fields that are present in req.body
  const updates: string[] = [];
  const params: any[] = [];
  
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (mn_keyword !== undefined) { updates.push('mn_keyword = ?'); params.push(mn_keyword); }
  if (label_sn_len !== undefined) { updates.push('label_sn_len = ?'); params.push(label_sn_len); }
  if (label_mn_len !== undefined) { updates.push('label_mn_len = ?'); params.push(label_mn_len); }
  if (label_ean_len !== undefined) { updates.push('label_ean_len = ?'); params.push(label_ean_len); }
  if (label_sn_fix !== undefined) { updates.push('label_sn_fix = ?'); params.push(label_sn_fix); }
  if (label_mn_fix !== undefined) { updates.push('label_mn_fix = ?'); params.push(label_mn_fix); }
  if (label_ean_fix !== undefined) { updates.push('label_ean_fix = ?'); params.push(label_ean_fix); }
  if (label_parsing_config !== undefined) { updates.push('label_parsing_config = ?'); params.push(label_parsing_config); }
  if (pallet_barcode_len !== undefined) { updates.push('pallet_barcode_len = ?'); params.push(pallet_barcode_len); }
  if (pallet_barcode_fix !== undefined) { updates.push('pallet_barcode_fix = ?'); params.push(pallet_barcode_fix); }
  if (pallet_parsing_config !== undefined) { updates.push('pallet_parsing_config = ?'); params.push(pallet_parsing_config); }
  if (pallet_keyword !== undefined) { updates.push('pallet_keyword = ?'); params.push(pallet_keyword); }
  
  if (updates.length === 0) return res.json({ success: true });
  
  params.push(req.params.id);
  
  db.run(`UPDATE tv_models SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/tv/models/:id', authenticateToken, (req, res) => {
  const modelId = req.params.id;
  db.serialize(() => {
    db.run('UPDATE lots SET tv_model_id = NULL WHERE tv_model_id = ?', [modelId]);
    db.run('DELETE FROM tv_models WHERE id = ?', [modelId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.get('/api/tv/tests', authenticateToken, (req, res) => {
  db.all('SELECT * FROM tv_tests ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tv/tests', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  db.run('INSERT INTO tv_tests (name, description) VALUES (?, ?)', [name, description || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, description });
  });
});

app.put('/api/tv/tests/:id', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  db.run('UPDATE tv_tests SET name = ?, description = ? WHERE id = ?', [name, description, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/tv/tests/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM tv_tests WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Breaks CRUD
app.get('/api/breaks', authenticateToken, (req, res) => {
  db.all('SELECT * FROM breaks ORDER BY start_time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/breaks', authenticateToken, (req, res) => {
  const { name, start_time, end_time } = req.body;
  db.run('INSERT INTO breaks (name, start_time, end_time) VALUES (?, ?, ?)', [name, start_time, end_time], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit((req as any).user.id, 'CREATE_BREAK', { name, start_time, end_time });
    res.json({ id: this.lastID, name, start_time, end_time });
  });
});

app.put('/api/breaks/:id', authenticateToken, (req, res) => {
  const { name, start_time, end_time } = req.body;
  db.run('UPDATE breaks SET name = ?, start_time = ?, end_time = ? WHERE id = ?', [name, start_time, end_time, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit((req as any).user.id, 'UPDATE_BREAK', { id: req.params.id, name, start_time, end_time });
    res.json({ success: true });
  });
});

app.delete('/api/breaks/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM breaks WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit((req as any).user.id, 'DELETE_BREAK', { id: req.params.id });
    res.json({ success: true });
  });
});

// --- SETTINGS & AUDIT ---
const sanitizeAuditDetails = (details: any): any => {};
const logAudit = (userId: number, action: string, details: any) => {};

app.get('/api/kpi/facts', authenticateToken, (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid date parameter' });
  }

  db.get('SELECT * FROM daily_kpi_facts WHERE date = ?', [date], (err, row: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) {
      return res.json({ date, mes_fact: null, aql_plan: null });
    }
    res.json(row);
  });
});

app.get('/api/kpi/last-closed', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM daily_kpi_facts WHERE closed_at IS NOT NULL ORDER BY date DESC LIMIT 1',
    [],
    (err, row: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) {
        return res.json({ date: null, closed_at: null });
      }
      res.json(row);
    }
  );
});

app.post('/api/kpi/facts', authenticateToken, (req, res) => {
  const { date, mes_fact, aql_plan, lot_id } = req.body;
  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid date' });
  }
  const user = (req as any).user;

  const lotQuery = lot_id 
    ? { sql: 'SELECT status FROM lots WHERE id = ?', params: [lot_id] }
    : { sql: 'SELECT status FROM lots ORDER BY id DESC LIMIT 1', params: [] };

  db.get(lotQuery.sql, lotQuery.params, (errLot, rowLot: any) => {
    if (errLot) return res.status(500).json({ error: errLot.message });
    if (rowLot && rowLot.status === 'closed') {
      return res.status(400).json({ error: 'Невозможно завершить смену: текущий лот закрыт.' });
    }

    const closedAtStr = new Date().toLocaleString('ru-RU');
    db.run(
      'INSERT OR REPLACE INTO daily_kpi_facts (date, mes_fact, aql_plan, closed_at) VALUES (?, ?, ?, ?)',
      [date, mes_fact ?? 0, aql_plan ?? 0, closedAtStr],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(user.id, 'SAVE_KPI_FACTS', { date, mes_fact, aql_plan });
        broadcast({ type: 'DATA_UPDATED', module: 'kpi_facts' });
        res.json({ success: true, date, mes_fact, aql_plan, closed_at: closedAtStr });
      }
    );
  });
});

app.get('/api/settings', authenticateToken, (req, res) => {
  db.all('SELECT * FROM global_settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => settings[r.key] = r.value);
    res.json(settings);
  });
});

app.post('/api/settings/api-key/generate', authenticateToken, (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'Admin') return res.status(403).json({ error: 'No permission' });

  const crypto = require('crypto');
  const newKey = `qms_${crypto.randomBytes(24).toString('hex')}`;
  
  // Use INSERT OR REPLACE to ensure it works even if the key was somehow missing
  db.run(`INSERT OR REPLACE INTO global_settings (key, value) VALUES ('api_key', ?)`, [newKey], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(user.id, 'GENERATE_API_KEY', { key_preview: `${newKey.substring(0, 8)}...` });
    res.json({ api_key: newKey });
  });
});

app.put('/api/settings', authenticateToken, (req, res) => {
  const settings = req.body;
  const user_id = (req as any).user.id;
  
  db.serialize(() => {
    Object.keys(settings).forEach(key => {
      db.run('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)', [key, settings[key]]);
    });
    logAudit(user_id, 'UPDATE_SETTINGS', settings);
    res.json({ success: true });
  });
});

app.get('/api/audit-logs', authenticateToken, (req, res) => {
  // Аудит логи отключены
  res.json([]);
});

app.get('/api/backup/download', authenticateToken, (req, res) => {
  const path = require('path');
  const dbPath = path.resolve(__dirname, '../database.sqlite');
  res.download(dbPath, 'dsm_qms_backup.sqlite');
});

app.post('/api/backup/google-drive/test', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'Admin') {
    return res.status(403).json({ error: 'Доступ ограничен' });
  }

  const { google_drive_link, google_drive_credentials } = req.body;
  if (!google_drive_link || !google_drive_credentials) {
    return res.status(400).json({ error: 'Необходимо указать ссылку на папку и JSON-ключ сервисного аккаунта.' });
  }

  const tempBackupPath = path.resolve(__dirname, `../backups/backup_test_${Date.now()}.sqlite`);
  
  try {
    // 1. Create backups directory if missing
    const backupsDir = path.dirname(tempBackupPath);
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // 2. Perform safe non-blocking SQLite VACUUM INTO
    await new Promise<void>((resolve, reject) => {
      db.run(`VACUUM INTO ?`, [tempBackupPath], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // 3. Upload to Google Drive
    const fileName = `qms_test_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.sqlite`;
    const message = await uploadToGoogleDrive(tempBackupPath, fileName, google_drive_link, google_drive_credentials);

    res.json({ success: true, message });
  } catch (err: any) {
    logger.error('Сбой при проверке бэкапа в Google Drive:', err);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up temporary backup file
    if (fs.existsSync(tempBackupPath)) {
      try { fs.unlinkSync(tempBackupPath); } catch (e) {}
    }
  }
});

app.post('/api/backup/google-drive/upload-now', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'Admin') {
    return res.status(403).json({ error: 'Доступ ограничен' });
  }

  const tempBackupPath = path.resolve(__dirname, `../backups/backup_manual_${Date.now()}.sqlite`);

  try {
    const driveLink = await getSetting('google_drive_link');
    const driveCreds = await getSetting('google_drive_credentials');

    if (!driveLink || !driveCreds) {
      return res.status(400).json({ error: 'Резервное копирование в Google Drive не настроено. Укажите ссылку на папку и JSON-ключ в настройках.' });
    }
    
    // 1. Create backups directory if missing
    const backupsDir = path.dirname(tempBackupPath);
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // 2. Safe SQLite VACUUM INTO
    await new Promise<void>((resolve, reject) => {
      db.run(`VACUUM INTO ?`, [tempBackupPath], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // 3. Upload
    const todayStr = new Date().toISOString().split('T')[0];
    const fileName = `backup_manual_${todayStr}_${Date.now()}.sqlite`;
    const message = await uploadToGoogleDrive(tempBackupPath, fileName, driveLink, driveCreds);

    res.json({ success: true, message });
  } catch (err: any) {
    logger.error('Сбой при ручной загрузке бэкапа в Google Drive:', err);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up temporary backup file
    if (fs.existsSync(tempBackupPath)) {
      try { fs.unlinkSync(tempBackupPath); } catch (e) {}
    }
  }
});

app.get('/api/backup/status', authenticateToken, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const latestBackupPath = path.resolve(__dirname, '../backups/backup_latest.sqlite');
  if (fs.existsSync(latestBackupPath)) {
    const stats = fs.statSync(latestBackupPath);
    return res.json({ lastBackupTime: stats.mtime.toISOString() });
  }
  
  const dbPath = path.resolve(__dirname, '../database.sqlite');
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    return res.json({ lastBackupTime: stats.mtime.toISOString() });
  }
  
  res.json({ lastBackupTime: null });
});

// Helper to convert JSON arrays to CSV with semicolon delimiter and UTF-8 BOM
function jsonToCsv(items: any[]): string {
  if (!items || items.length === 0) return '';
  const keysSet = new Set<string>();
  items.forEach(item => {
    Object.keys(item).forEach(k => {
      if (!['lot_id', 'user_id', 'data'].includes(k)) {
        keysSet.add(k);
      }
    });
  });
  const keys = Array.from(keysSet);
  const header = keys.map(k => `"${String(k).replace(/"/g, '""')}"`).join(';');
  const rows = items.map(item => {
    return keys.map(k => {
      let val = item[k];
      if (val === undefined || val === null) {
        val = '';
      } else if (k === 'photos' && Array.isArray(val)) {
        val = `[Фото: ${val.length} шт]`;
      } else if (typeof val === 'string' && val.startsWith('data:image/')) {
        val = '[Изображение]';
      } else if (typeof val === 'object') {
        const strVal = JSON.stringify(val);
        if (strVal.includes('data:image/')) {
          try {
            if (Array.isArray(val)) {
              val = `[Фото: ${val.length} шт]`;
            } else {
              val = '[Изображение]';
            }
          } catch (e) {
            val = '[Изображение]';
          }
        } else {
          val = strVal;
        }
      } else {
        val = String(val);
      }
      return `"${val.replace(/"/g, '""')}"`;
    }).join(';');
  });
  return '\ufeff' + [header, ...rows].join('\r\n');
}

app.get('/api/admin/backup-zip', authenticateToken, async (req, res) => {
  if ((req as any).user.role !== 'Admin') {
    return res.status(403).json({ error: 'Доступ ограничен' });
  }
  
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Fetch all lots
    const lots = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM lots', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    const lotsMap = new Map<number, string>();
    lots.forEach(l => lotsMap.set(l.id, l.name));
    
    const modules = [
      'oqa_tv', 'oqa_pallets', 'oqa_labels', 
      'iqc_aql', 'iqc_panels', 'iqc_eps', 
      'iqc_covers', 'iqc_components', 'oqa_patrol'
    ];
    
    for (const mod of modules) {
      const records = await new Promise<any[]>((resolve, reject) => {
        db.all(`SELECT * FROM ${mod}_logs`, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      if (records.length === 0) continue;
      
      const parsedRecords = records.map(r => {
        let pData = {};
        try {
          pData = JSON.parse(r.data);
        } catch (e) {}
        return {
          id: r.id,
          lot_id: r.lot_id,
          user_id: r.user_id,
          date: r.date,
          status: r.status,
          timestamp: r.timestamp,
          ...pData
        };
      });
      
      const hasLotId = ['oqa_tv', 'oqa_pallets', 'oqa_labels', 'iqc_panels'].includes(mod);
      
      if (hasLotId) {
        const groups = new Map<string, any[]>();
        parsedRecords.forEach(r => {
          const lotName = r.lot_id ? lotsMap.get(r.lot_id) : null;
          const groupName = lotName ? `Лоты/${lotName}` : 'Лоты/Без_Лота';
          if (!groups.has(groupName)) groups.set(groupName, []);
          groups.get(groupName)!.push(r);
        });
        
        groups.forEach((list, groupName) => {
          const csvContent = jsonToCsv(list);
          zip.addFile(`${groupName}/${mod}.csv`, Buffer.from(csvContent, 'utf8'));
        });
      } else if (mod === 'iqc_aql') {
        const groups = new Map<string, any[]>();
        parsedRecords.forEach(r => {
          const lotName = (r as any).lot;
          const groupName = lotName ? `Лоты/${lotName}` : 'Лоты/Без_Лота';
          if (!groups.has(groupName)) groups.set(groupName, []);
          groups.get(groupName)!.push(r);
        });
        
        groups.forEach((list, groupName) => {
          const csvContent = jsonToCsv(list);
          zip.addFile(`${groupName}/${mod}.csv`, Buffer.from(csvContent, 'utf8'));
        });
      } else {
        const csvContent = jsonToCsv(parsedRecords);
        zip.addFile(`Общие_Отчеты/${mod}.csv`, Buffer.from(csvContent, 'utf8'));
      }
    }
    
    if (lots.length > 0) {
      const lotsCsv = jsonToCsv(lots.map(l => ({ ID: l.id, 'Имя Лота': l.name, 'Дата Создания': l.created_at, 'Статус': l.status })));
      zip.addFile('Все_Лоты.csv', Buffer.from(lotsCsv, 'utf8'));
    }
    
    const zipBuffer = zip.toBuffer();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=QMS_Backup_${new Date().toISOString().split('T')[0]}.zip`);
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('Backup ZIP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cache for MES Proxy responses to handle timeouts gracefully
const mesCache = new Map<string, { html: string; timestamp: number }>();

// Proxy for MES Dashboard to avoid CORS
app.post('/api/mes/proxy', authenticateToken, async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  if (!url.startsWith('http')) url = 'http://' + url;

  try {
    // Ignore SSL errors for local IPs
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    // Call the timeout-protected and retry-enabled http client (timeout 5000ms, 2 retries)
    const response = await requestWithRetry(url, { timeout: 5000, retries: 2 });
    const text = await response.text();
    
    // Cache the successful response
    mesCache.set(url, { html: text, timestamp: Date.now() });

    res.json({ html: text });
  } catch (e: any) {
    const cached = mesCache.get(url);
    if (cached) {
      return res.json({ html: cached.html, cached: true });
    }

    if (e instanceof TimeoutError) {
      return res.status(503).json({ error: 'MES Service Unavailable (Timeout)', isTimeout: true });
    }

    console.error("Proxy error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Excel generation endpoint for Panels Check report
app.post('/api/reports/panels-excel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { report_data, records } = req.body;
    if (!report_data || !records) {
      return res.status(400).json({ error: 'report_data and records are required' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Panels Check');

    // Find maximum number of photos across all records
    let maxPhotos = 1;
    if (Array.isArray(records)) {
      for (const r of records) {
        if (r.photos && Array.isArray(r.photos) && r.photos.length > maxPhotos) {
          maxPhotos = r.photos.length;
        }
      }
    }
    if (maxPhotos > 5) maxPhotos = 5;

    // Define columns
    const columns = [
      { key: 'partName', width: 25 },
      { key: 'partCode', width: 25 },
      { key: 'openCell', width: 25 },
      { key: 'qty', width: 15 },
      { key: 'defect', width: 30 },
      { key: 'repair', width: 20 },
      { key: 'responsibility', width: 35 },
      { key: 'process', width: 20 },
      { key: 'comment', width: 30 }
    ];
    for (let i = 0; i < maxPhotos; i++) {
      columns.push({ key: `photo${i}`, width: 42 }); // width 42 is ~280px
    }
    worksheet.columns = columns;

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FF000000' } },
      left: { style: 'thin' as const, color: { argb: 'FF000000' } },
      bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
      right: { style: 'thin' as const, color: { argb: 'FF000000' } }
    };

    const drawCell = (cellRef: string, text: string | number, options: { fillColor?: string, textColor?: string, bold?: boolean, align?: 'left' | 'center' | 'right', border?: boolean } = {}) => {
      const cell = worksheet.getCell(cellRef);
      cell.value = text;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: !!options.bold,
        color: options.textColor ? { argb: 'FF' + options.textColor.replace('#', '') } : undefined
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: options.align || 'left',
        wrapText: true
      };
      if (options.fillColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + options.fillColor.replace('#', '') }
        };
      }
      if (options.border !== false) {
        cell.border = thinBorder;
      }
    };

    // Block 1: General Info Table
    const genInfoRows = [
      ['отчет составил (я) / revised:', report_data.inspector],
      ['Номер лота/Lot Nr.:', report_data.lotNr],
      ['Заказчик/Customer:', report_data.customer],
      ['Вид продукции/Type:', report_data.type],
      ['Бренд/Trade Mark:', report_data.tradeMark],
      ['Модель/Model name:', report_data.modelName],
      ['Assembly Procedures - started:', report_data.assemblyStarted],
      ['Assembly Procedures - finished:', report_data.assemblyFinished]
    ];

    let rowNum = 1;
    for (const row of genInfoRows) {
      worksheet.getRow(rowNum).height = 18;
      drawCell(`A${rowNum}`, row[0], { fillColor: '#C0C0C0', align: 'right', border: true });
      drawCell(`B${rowNum}`, row[1], { fillColor: '#C0C0C0', align: 'left', border: true });
      worksheet.mergeCells(`B${rowNum}:D${rowNum}`);
      worksheet.getCell(`C${rowNum}`).border = thinBorder;
      worksheet.getCell(`D${rowNum}`).border = thinBorder;
      rowNum++;
    }

    // Block 2: Quantitative indicators table
    rowNum += 1;
    const quantRows = [
      ['Количество в ЛОТе', 'LOT Qty', report_data.lotQty],
      ['Кол - во проверенной продукции', 'Ready check qty', report_data.readyQty],
      ['Вид дефектов от поставщика', 'Number of defective KITs issued from supplier', report_data.defectsQty]
    ];

    for (let i = 0; i < quantRows.length; i++) {
      worksheet.getRow(rowNum).height = 30; // Increased height for wrapping
      const row = quantRows[i];
      let valColor = '#000000';
      let valBg = '#FFFFFF';
      let isBold = false;
      
      if (i === 0) {
        valColor = '#FF8C00'; // Orange text for lot qty
        valBg = '#E6E6E6';
        isBold = true; // Make LOT Qty bold
      } else if (i === 1) {
        valBg = '#D2D2D2'; // Gray background for checked qty
      } else if (i === 2) {
        valBg = '#FF9696'; // Red background for defects
      }

      drawCell(`A${rowNum}`, row[0], { border: true, align: 'left' });
      drawCell(`B${rowNum}`, row[1], { border: true, align: 'left' });
      drawCell(`C${rowNum}`, row[2], { fillColor: valBg, textColor: valColor, align: 'center', border: true, bold: isBold });
      worksheet.mergeCells(`C${rowNum}:D${rowNum}`);
      worksheet.getCell(`D${rowNum}`).border = thinBorder;
      rowNum++;
    }

    // Block 3: Defects List Table Headers
    rowNum += 2;
    const headers = [
      'PART NAME',
      'PART CODE',
      'PART CODE OPEN CELL',
      'Количество Qty',
      'Характер дефекта Defect Definition',
      'Ремонт Repaired Y/N',
      'Происхождение дефекта/Responsibility of defect',
      'Обнаружено Process',
      'Comment',
      'Photo'
    ];
    worksheet.getRow(rowNum).height = 50; // Taller row for wrapped text
    
    // Create column letters dynamically based on maxPhotos
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    for (let i = 0; i < maxPhotos; i++) {
      cols.push(String.fromCharCode(74 + i)); // 74 is 'J'
    }

    for (let i = 0; i < headers.length; i++) {
      if (i === 9) { // Photo header
        drawCell(`${cols[i]}${rowNum}`, headers[i], {
          fillColor: '#FFFFFF',
          align: 'center',
          bold: true,
          border: true
        });
        if (maxPhotos > 1) {
          worksheet.mergeCells(`${cols[i]}${rowNum}:${cols[cols.length-1]}${rowNum}`);
          for (let k = i + 1; k < cols.length; k++) {
            worksheet.getCell(`${cols[k]}${rowNum}`).border = thinBorder;
          }
        }
      } else {
        drawCell(`${cols[i]}${rowNum}`, headers[i], {
          fillColor: '#FFFFFF',
          align: 'center',
          bold: true,
          border: true
        });
      }
    }
    rowNum++;

    // Data rows
    for (const record of records) {
      const hasPhotos = record.photos && Array.isArray(record.photos) && record.photos.length > 0;
      worksheet.getRow(rowNum).height = hasPhotos ? 220 : 40; // Increased height for 2x photos (280px ~ 210 points)
      
      const isDefect = record.status === 'NG' || (record.defect && record.defect !== 'OK');
      const rowBg = isDefect ? '#FF9696' : undefined;

      const rowValues = [
        record.partName || 'Panel Xiaomi',
        record.partCode,
        record.openCell,
        Number(record.qty || 1),
        record.defect === 'OK' ? '' : record.defect,
        record.repair || '-',
        record.responsibility || '-',
        record.process || 'IQC',
        record.comment || '',
        '' // Photo column placeholder
      ];

      for (let i = 0; i < 9; i++) { // Render text columns up to index 8
        drawCell(`${cols[i]}${rowNum}`, rowValues[i], {
          align: 'center',
          border: true,
          fillColor: rowBg
        });
      }

      // Merge and outline the Photo columns
      if (maxPhotos > 1) {
        worksheet.mergeCells(`${cols[9]}${rowNum}:${cols[cols.length-1]}${rowNum}`);
      }
      for (let k = 9; k < cols.length; k++) {
        const cell = worksheet.getCell(`${cols[k]}${rowNum}`);
        cell.border = thinBorder;
        if (rowBg) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF' + rowBg.replace('#', '') }
          };
        }
      }

      if (hasPhotos) {
        const photos = record.photos.slice(0, maxPhotos);
        for (let i = 0; i < photos.length; i++) {
          try {
            const p = photos[i];
            const cleanBase64 = p.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(cleanBase64, 'base64');
            
            const imageId = workbook.addImage({
              buffer: imgBuffer as any,
              extension: 'png'
            });

            // Anchor image in the dynamically merged Photo columns
            worksheet.addImage(imageId, {
              tl: { col: 9 + i + 0.05, row: rowNum - 1 + 0.04 },
              ext: { width: 270, height: 270 } // Fits perfectly inside 220pt row / 42char col
            });
          } catch (e: any) {
            console.error('[Excel Generator] Image error:', e.message);
          }
        }
      }
      rowNum++;
    }

    // Set response headers and send Excel binary
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const safeLotName = (report_data.lotNr || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
    const lotName = `_Lot_${safeLotName}`;
    const fileName = `Panels_Check${lotName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('[Excel Route] Error generating Excel:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// --- AUTOMATED BACKUP (Native Node.js SQLite VACUUM INTO every 30 minutes) ---
const runDatabaseBackup = () => {
  const backupsDir = path.resolve(__dirname, '../backups');
  try {
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const backupFileName = `backup_${todayStr}.sqlite`;
    const tempBackupPath = path.join(backupsDir, `backup_temp_${Date.now()}.sqlite`);
    const finalBackupPath = path.join(backupsDir, backupFileName);
    const latestBackupPath = path.join(backupsDir, 'backup_latest.sqlite');

    logger.info('Запуск фонового бэкапа базы данных (SQLite VACUUM INTO)...');

    db.run(`VACUUM INTO ?`, [tempBackupPath], (err) => {
      if (err) {
        logger.error(`Сбой автоматического бэкапа (VACUUM INTO): ${err.message}`);
        if (fs.existsSync(tempBackupPath)) {
          try { fs.unlinkSync(tempBackupPath); } catch (e) {}
        }
        return;
      }

      try {
        // Atomic replace for today's backup file
        if (fs.existsSync(finalBackupPath)) {
          fs.unlinkSync(finalBackupPath);
        }
        fs.renameSync(tempBackupPath, finalBackupPath);

        // Also copy/link to backup_latest.sqlite for backward compatibility
        if (fs.existsSync(latestBackupPath)) {
          fs.unlinkSync(latestBackupPath);
        }
        fs.copyFileSync(finalBackupPath, latestBackupPath);

        logger.info(`Бэкап базы данных успешно завершен: ${backupFileName}`);

        // Rotates backups: keep only last 14 days of backup_YYYY-MM-DD.sqlite files
        const files = fs.readdirSync(backupsDir);
        const backupFiles = files
          .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite') && f !== 'backup_latest.sqlite')
          .map(f => ({ name: f, path: path.join(backupsDir, f), mtime: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
          .sort((a, b) => b.mtime - a.mtime); // Newest first

        if (backupFiles.length > 14) {
          const toDelete = backupFiles.slice(14);
          toDelete.forEach(f => {
            fs.unlinkSync(f.path);
            logger.info(`Удален устаревший файл бэкапа: ${f.name}`);
          });
        }
      } catch (e: any) {
        logger.error(`Ошибка при сохранении бэкапа или ротации: ${e.message}`);
      }
    });
  } catch (err: any) {
    logger.error(`Непредвиденный сбой при инициализации бэкапа: ${err.message}`);
  }
};

const autoCloseShift = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if there are any active lots in the system
    const hasActiveLot = await new Promise<boolean>((resolve) => {
      db.get("SELECT id FROM lots WHERE status = 'active' LIMIT 1", [], (err, row: any) => {
        if (row) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });

    if (!hasActiveLot) {
      logger.info('Автозавершение смены пропущено: в системе нет активных лотов.');
      return;
    }
    
    // 1. Fetch settings
    let mesUrl = await getSetting('mes_dashboard_url') || 'http://192.168.210.210:8000/tablo/lines/1/dashboard/';
    if (mesUrl && !mesUrl.startsWith('http')) mesUrl = 'http://' + mesUrl;
    
    const shiftConfigStr = await getSetting('oqa_shift_config');
    let shiftConfig: any = {};
    try {
      if (shiftConfigStr) shiftConfig = JSON.parse(shiftConfigStr);
    } catch (e) {}

    // 2. Fetch and parse MES Fact
    let factVal = 0;
    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const response = await requestWithRetry(mesUrl, { timeout: 5000, retries: 2 });
      const html = await response.text();
      
      const jsonMatch = html.match(/initialDashboardData\s*=\s*JSON\.parse\(\s*'([\s\S]*?)'\s*\)/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const unescaped = jsonMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (match: string, grp: string) => String.fromCharCode(parseInt(grp, 16)));
          const data = JSON.parse(unescaped);
          const fact = data.metrics?.curr_device_count;
          if (typeof fact === 'number') {
            factVal = fact;
          }
        } catch (e) {}
      }
      
      if (factVal === 0) {
        const labelIndex = html.indexOf('ФАКТ (ШТ)');
        if (labelIndex !== -1) {
          const contentBefore = html.substring(0, labelIndex);
          const matches = [...contentBefore.matchAll(/>(\d{1,5})</g)];
          if (matches.length > 0) {
            const val = parseInt(matches[matches.length - 1][1]);
            if (val > 0) factVal = val;
          }
        }
      }
      
      if (factVal === 0) {
        const fallbackMatch = html.match(/(\d{1,5})\s*ФАКТ\s*\(ШТ\)/i) || 
                              html.match(/ФАКТ\s*\(ШТ\)[\s\S]*?>(\d{1,5})</i);
        if (fallbackMatch && fallbackMatch[1]) {
          factVal = parseInt(fallbackMatch[1]);
        }
      }
    } catch (err: any) {}

    // 3. Fallback to existing saved fact if live fetch yields 0 or fails
    if (factVal === 0) {
      const dbFact = await new Promise<any>((resolve) => {
        db.get('SELECT mes_fact FROM daily_kpi_facts WHERE date = ?', [today], (err, row) => resolve(row));
      });
      if (dbFact && typeof dbFact.mes_fact === 'number') {
        factVal = dbFact.mes_fact;
      }
    }

    // 4. Calculate AQL Plan
    const ratio = (shiftConfig.ratio_checked || 13) / (shiftConfig.ratio_produced || 280);
    const planVal = Math.round(factVal * ratio);

    // 5. Save/Replace daily_kpi_facts
    const closedAtStr = new Date().toLocaleString('ru-RU');
    await new Promise<void>((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO daily_kpi_facts (date, mes_fact, aql_plan, closed_at) VALUES (?, ?, ?, ?)',
        [today, factVal, planVal, closedAtStr],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    logAudit(0, 'AUTO_SAVE_KPI_FACTS', { date: today, mes_fact: factVal, aql_plan: planVal });
    broadcast({ type: 'DATA_UPDATED', module: 'kpi_facts' });

  } catch (e: any) {}
};

// Auto-backup state
let isAutoBackupRunning = false;

// Check every minute if it's time for auto-closing shifts or Google Drive auto-backup
setInterval(() => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Check shift auto-close schedule
  getSetting('auto_close_shift_time').then(closeTime => {
    if (closeTime && time === closeTime) autoCloseShift();
  });
}, 60000);

// Setup Native SQLite backup interval (every 30 minutes)
// Run first backup 5 seconds after startup to allow initial migrations to settle, then repeat every 30 minutes
setTimeout(runDatabaseBackup, 5000);
setInterval(runDatabaseBackup, 30 * 60 * 1000);


app.listen(PORT, () => {
  console.log(`DSM-QMS Backend running on http://localhost:${PORT}`);
});

