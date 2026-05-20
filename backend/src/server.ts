import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import cron from 'node-cron';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { requestWithRetry, TimeoutError } from './utils/httpClient';

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'dsm-qms-ultra-secret-key-2026';

// Setup static folder for uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Setup assets folder and font extraction
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
const fontPath = path.join(assetsDir, 'DejaVuSans.ttf');
if (!fs.existsSync(fontPath)) {
  console.log('[Font Extractor] Generating DejaVuSans.ttf from frontend base64...');
  try {
    const frontendFontPath = path.resolve(__dirname, '../../frontend/src/assets/fonts/DejaVuSans.ts');
    if (fs.existsSync(frontendFontPath)) {
      const fileContent = fs.readFileSync(frontendFontPath, 'utf8');
      const firstQuote = fileContent.indexOf("'");
      const lastQuote = fileContent.lastIndexOf("'");
      if (firstQuote !== -1 && lastQuote !== -1) {
        const base64Str = fileContent.substring(firstQuote + 1, lastQuote);
        fs.writeFileSync(fontPath, Buffer.from(base64Str, 'base64'));
        console.log('[Font Extractor] DejaVuSans.ttf created successfully.');
      } else {
        console.error('[Font Extractor] Could not parse base64 font from frontend assets.');
      }
    } else {
      console.error('[Font Extractor] Frontend font file not found at:', frontendFontPath);
    }
  } catch (err: any) {
    console.error('[Font Extractor] Failed to extract font:', err.message);
  }
}

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

// --- HELPERS ---
const getSetting = (key: string): Promise<string> => {
  return new Promise((resolve) => {
    db.get('SELECT value FROM global_settings WHERE key = ?', [key], (err, row: any) => {
      resolve(row ? row.value : '');
    });
  });
};

;

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

  req.on('close', () => {
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
    db.run('UPDATE audit_logs SET user_id = NULL WHERE user_id = ?', [userId]);
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
          COUNT(CASE WHEN status IN ('NG', 'Reject') THEN 1 END) as total_failed
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

    res.json(results);
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

// --- TV MODELS & TESTS ---
app.get('/api/tv/models', authenticateToken, (req, res) => {
  db.all('SELECT * FROM tv_models ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`[DEBUG] /api/tv/models fetched ${rows.length} models by user ${(req as any).user?.username || 'unauthenticated'}`);
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
const sanitizeAuditDetails = (details: any): any => {
  if (!details) return details;
  const MAX_STRING_LEN = 2000;

  const traverse = (obj: any, depth = 0): any => {
    if (depth > 10) return '[Object Too Deep]';
    if (typeof obj === 'string') {
      if (obj.length > MAX_STRING_LEN) {
        // Specifically check for image data to provide better placeholder
        if (obj.startsWith('data:image/')) return '[Photo Data]';
        return obj.substring(0, MAX_STRING_LEN) + '... [TRUNCATED]';
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      if (obj.length > 100) return `[Array too large: ${obj.length} items]`;
      return obj.map(v => traverse(v, depth + 1));
    }
    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      const keys = Object.keys(obj);
      if (keys.length > 100) return `[Object too many keys: ${keys.length}]`;
      for (const key of keys) {
        sanitized[key] = traverse(obj[key], depth + 1);
      }
      return sanitized;
    }
    return obj;
  };

  try {
    return traverse(details);
  } catch (e) {
    return { error: 'Sanitization failed', message: String(e) };
  }
};

const logAudit = (userId: number, action: string, details: any) => {
  const sanitized = sanitizeAuditDetails(details);
  const ts = new Date().toISOString();
  db.run('INSERT INTO audit_logs (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)', [userId, action, JSON.stringify(sanitized), ts]);
};

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
  const { date } = req.query;
  let query = `
    SELECT a.*, u.username 
    FROM audit_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (date && typeof date === 'string') {
    // timestamp is YYYY-MM-DD HH:MM:SS
    query += ' AND date(a.timestamp) = ?';
    params.push(date);
  }

  query += ' ORDER BY a.timestamp DESC LIMIT 200';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map((r: any) => ({ ...r, details: safeJsonParse(r.details || '{}') })));
  });
});

app.get('/api/backup/download', authenticateToken, (req, res) => {
  const path = require('path');
  const dbPath = path.resolve(__dirname, '../database.sqlite');
  res.download(dbPath, 'dsm_qms_backup.sqlite');
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
    if (e instanceof TimeoutError) {
      console.warn(`[MES Proxy] Timeout occurred for ${url}. Attempting cache fallback...`);
      const cached = mesCache.get(url);
      if (cached) {
        console.log(`[MES Proxy] Serving cached response for ${url} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return res.json({ html: cached.html, cached: true });
      }
      return res.status(503).json({ error: 'MES Service Unavailable (Timeout)', isTimeout: true });
    }

    console.error("Proxy error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// PDF generation endpoint for Panels Check report
app.post('/api/reports/panels-pdf', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { report_data, records } = req.body;
    if (!report_data || !records) {
      return res.status(400).json({ error: 'report_data and records are required' });
    }

    // Create a new PDF document in Landscape
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 30
    });

    // Pipe the PDF directly to the express response
    res.setHeader('Content-Type', 'application/pdf');
    const safeLotName = (report_data.lotNr || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
    const lotName = `_Lot_${safeLotName}`;
    const fileName = `Panels_Check${lotName}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    doc.pipe(res);

    // Set fallback/default font to DejaVuSans for Cyrillic support
    doc.font(fontPath);

    // Helper cell drawing
    const drawCell = (text: string, x: number, y: number, w: number, h: number, options: { fillColor?: string, textColor?: string, align?: 'right' | 'left' | 'center' | 'justify', border?: boolean } = {}) => {
      if (options.fillColor) {
        doc.fillColor(options.fillColor).rect(x, y, w, h).fill();
      }
      if (options.border !== false) {
        doc.strokeColor('#000000').lineWidth(0.5).rect(x, y, w, h).stroke();
      }
      doc.fillColor(options.textColor || '#000000');
      doc.fontSize(8);
      
      const textHeight = doc.currentLineHeight();
      const yOffset = (h - textHeight) / 2;
      doc.text(text || '', x + 4, y + yOffset, {
        width: w - 8,
        align: options.align || 'left',
        lineBreak: false
      });
    };

    // Block 1: General Info Table
    const genInfoRows = [
      ['отчёт составил (а) /revised:', report_data.inspector],
      ['Номер лота/Lot Nr:', report_data.lotNr],
      ['Заказчик/Customer:', report_data.customer],
      ['Вид продукции/Type:', report_data.type],
      ['Бренд/Trade Mark:', report_data.tradeMark],
      ['Модель/Model name:', report_data.modelName],
      ['Assembly Procedures started', report_data.assemblyStarted],
      ['Assembly Procedures finished', report_data.assemblyFinished]
    ];

    let y = 30;
    for (const row of genInfoRows) {
      drawCell(row[0], 30, y, 150, 15, { fillColor: '#E6E6E6', align: 'right' });
      drawCell(row[1], 180, y, 250, 15, { fillColor: '#FFFFFF', align: 'left' });
      y += 15;
    }

    // Block 2: Quantitative indicators table
    y += 10;
    const quantRows = [
      ['Количество в ЛОТе', 'LOT Q-ty', report_data.lotQty.toString()],
      ['Кол- во Проверенной Продукции', 'Ready Goods q-ty', report_data.readyQty.toString()],
      ['К-во дефектов от поставщика', 'Number of defective KITs issued from supplier', report_data.defectsQty.toString()]
    ];

    for (let i = 0; i < quantRows.length; i++) {
      const row = quantRows[i];
      let valColor = '#000000';
      let valBg = '#FFFFFF';
      
      if (i === 0) {
        valColor = '#FF8C00';
      } else if (i === 1) {
        valBg = '#D2D2D2';
      } else if (i === 2) {
        if (Number(report_data.defectsQty) > 0) {
          valBg = '#FF9696';
        }
      }

      drawCell(row[0], 30, y, 150, 15);
      drawCell(row[1], 180, y, 150, 15);
      drawCell(row[2], 330, y, 100, 15, { fillColor: valBg, textColor: valColor, align: 'center' });
      y += 15;
    }

    // Block 3: Defects List Table
    y += 15;
    const headers = ['PART CODE', 'OPEN CELL', 'NAME', 'Qty', 'DEFECT', 'STATUS', 'COMMENT'];
    const colWidths = [100, 80, 170, 40, 110, 60, 180];
    const totalTableWidth = colWidths.reduce((sum, w) => sum + w, 0);

    const drawHeaders = (headerY: number) => {
      let currentX = 30;
      for (let i = 0; i < headers.length; i++) {
        drawCell(headers[i], currentX, headerY, colWidths[i], 20, {
          fillColor: '#C8C8C8',
          align: 'center'
        });
        currentX += colWidths[i];
      }
      return headerY + 20;
    };

    y = drawHeaders(y);

    for (const record of records) {
      const hasPhotos = record.photos && Array.isArray(record.photos) && record.photos.length > 0;
      const neededHeight = 20 + (hasPhotos ? 50 : 0);

      if (y + neededHeight > 540) {
        doc.addPage();
        y = drawHeaders(30);
      }

      const isDefect = record.status === 'NG' || record.defect !== 'OK';
      const rowBg = isDefect ? '#FFC8C8' : undefined;

      let currentX = 30;
      const rowValues = [
        record.partCode,
        record.openCell,
        record.partName,
        (record.qty || 1).toString(),
        record.defect,
        record.status,
        record.comment || '-'
      ];

      for (let i = 0; i < rowValues.length; i++) {
        drawCell(rowValues[i], currentX, y, colWidths[i], 20, {
          fillColor: rowBg,
          align: (i === 3 || i === 5) ? 'center' : 'left'
        });
        currentX += colWidths[i];
      }
      y += 20;

      if (hasPhotos) {
        drawCell('', 30, y, totalTableWidth, 50, { fillColor: rowBg });

        const photos = record.photos.slice(0, 5);
        const imgH = 42;
        const imgW = 48;
        const gap = 6;
        const totalPhotosW = photos.length * imgW + (photos.length - 1) * gap;
        let photoX = 30 + (totalTableWidth - totalPhotosW) / 2;

        for (const p of photos) {
          try {
            const cleanBase64 = p.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(cleanBase64, 'base64');
            const photoY = y + (50 - imgH) / 2;

            doc.fillColor('#FFFFFF').rect(photoX - 1, photoY - 1, imgW + 2, imgH + 2).fill();
            doc.image(imgBuffer, photoX, photoY, { width: imgW, height: imgH });
            
            photoX += imgW + gap;
          } catch (e: any) {
            console.error('[PDF Generator] Image error:', e.message);
          }
        }
        
        doc.strokeColor('#000000').lineWidth(0.5).rect(30, y, totalTableWidth, 50).stroke();
        y += 50;
      }
    }

    doc.end();
  } catch (err: any) {
    console.error('[PDF Route] Error generating PDF:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Excel generation endpoint for Panels Check report
app.post('/api/reports/panels-excel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { report_data, records } = req.body;
    if (!report_data || !records) {
      return res.status(400).json({ error: 'report_data and records are required' });
    }

    // Create a new Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Panels Check');

    // Define column widths in characters (to ensure a nice look)
    worksheet.columns = [
      { key: 'partCode', width: 22 },
      { key: 'openCell', width: 20 },
      { key: 'partName', width: 30 },
      { key: 'qty', width: 10 },
      { key: 'defect', width: 25 },
      { key: 'status', width: 12 },
      { key: 'comment', width: 35 }
    ];

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
      ['отчёт составил (а) /revised:', report_data.inspector],
      ['Номер лота/Lot Nr:', report_data.lotNr],
      ['Заказчик/Customer:', report_data.customer],
      ['Вид продукции/Type:', report_data.type],
      ['Бренд/Trade Mark:', report_data.tradeMark],
      ['Модель/Model name:', report_data.modelName],
      ['Assembly Procedures started', report_data.assemblyStarted],
      ['Assembly Procedures finished', report_data.assemblyFinished]
    ];

    let rowNum = 2;
    for (const row of genInfoRows) {
      worksheet.getRow(rowNum).height = 20;
      drawCell(`A${rowNum}`, row[0], { fillColor: '#E6E6E6', align: 'right', bold: true });
      drawCell(`B${rowNum}`, row[1], { fillColor: '#FFFFFF', align: 'left' });
      // Merge B to D for value to give it a neat appearance
      worksheet.mergeCells(`B${rowNum}:D${rowNum}`);
      // Fill cell borders for merged cells
      worksheet.getCell(`C${rowNum}`).border = thinBorder;
      worksheet.getCell(`D${rowNum}`).border = thinBorder;
      rowNum++;
    }

    // Block 2: Quantitative indicators table
    rowNum += 1;
    const quantRows = [
      ['Количество в ЛОТе', 'LOT Q-ty', report_data.lotQty],
      ['Кол- во Проверенной Продукции', 'Ready Goods q-ty', report_data.readyQty],
      ['К-во дефектов от поставщика', 'Number of defective KITs issued from supplier', report_data.defectsQty]
    ];

    for (let i = 0; i < quantRows.length; i++) {
      worksheet.getRow(rowNum).height = 20;
      const row = quantRows[i];
      let valColor = '#000000';
      let valBg = '#FFFFFF';
      
      if (i === 0) {
        valColor = '#FF8C00';
      } else if (i === 1) {
        valBg = '#D2D2D2';
      } else if (i === 2) {
        if (Number(report_data.defectsQty) > 0) {
          valBg = '#FF9696';
        }
      }

      drawCell(`A${rowNum}`, row[0], { border: true });
      drawCell(`B${rowNum}`, row[1], { border: true });
      drawCell(`C${rowNum}`, row[2], { fillColor: valBg, textColor: valColor, align: 'center', bold: true, border: true });
      rowNum++;
    }

    // Block 3: Defects List Table Headers
    rowNum += 2;
    const headers = ['PART CODE', 'OPEN CELL', 'NAME', 'Qty', 'DEFECT', 'STATUS', 'COMMENT'];
    worksheet.getRow(rowNum).height = 25;
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    for (let i = 0; i < headers.length; i++) {
      drawCell(`${cols[i]}${rowNum}`, headers[i], {
        fillColor: '#C8C8C8',
        align: 'center',
        bold: true,
        border: true
      });
    }
    rowNum++;

    // Data rows
    for (const record of records) {
      worksheet.getRow(rowNum).height = 22;
      const isDefect = record.status === 'NG' || record.defect !== 'OK';
      const rowBg = isDefect ? '#FFC8C8' : undefined;

      const rowValues = [
        record.partCode,
        record.openCell,
        record.partName,
        Number(record.qty || 1),
        record.defect,
        record.status,
        record.comment || '-'
      ];

      for (let i = 0; i < rowValues.length; i++) {
        drawCell(`${cols[i]}${rowNum}`, rowValues[i], {
          fillColor: rowBg,
          align: (i === 3 || i === 5) ? 'center' : 'left',
          border: true
        });
      }
      rowNum++;

      const hasPhotos = record.photos && Array.isArray(record.photos) && record.photos.length > 0;
      if (hasPhotos) {
        // Create photo row
        const photoRow = rowNum;
        worksheet.getRow(photoRow).height = 75;
        
        // Merge cells A through G
        worksheet.mergeCells(`A${photoRow}:G${photoRow}`);
        
        // Apply styling/border to all cells in merged range to keep grid neat
        for (const col of cols) {
          worksheet.getCell(`${col}${photoRow}`).border = thinBorder;
          if (rowBg) {
            worksheet.getCell(`${col}${photoRow}`).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF' + rowBg.replace('#', '') }
            };
          }
        }

        const photos = record.photos.slice(0, 5);
        for (let i = 0; i < photos.length; i++) {
          try {
            const p = photos[i];
            const cleanBase64 = p.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(cleanBase64, 'base64');
            
            const imageId = workbook.addImage({
              buffer: imgBuffer as any,
              extension: 'png'
            });

            // Anchor image side-by-side using float column offsets in the merged cell
            worksheet.addImage(imageId, {
              tl: { col: i + 0.15, row: photoRow - 1 + 0.1 },
              ext: { width: 85, height: 85 }
            });
          } catch (e: any) {
            console.error('[Excel Generator] Image error:', e.message);
          }
        }
        rowNum++;
      }
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

// --- MAINTENANCE JOB (Retention & Backups) ---
const runMaintenance = async () => {
  console.log('Running system maintenance...');
  const retentionDays = parseInt(await getSetting('data_retention_days') || '90');
  
  const modules = [
    'oqa_tv', 'oqa_pallets', 'oqa_labels', 
    'iqc_aql', 'iqc_panels', 'iqc_eps', 
    'iqc_covers', 'iqc_components', 'oqa_patrol'
  ];

  // 1. Data Retention (Cleanup old logs)
  // We use date column which is YYYY-MM-DD
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  modules.forEach(mod => {
    db.run(`DELETE FROM ${mod}_logs WHERE date < ?`, [cutoffStr], function(err) {
      if (!err && this.changes > 0) console.log(`[Retention] Removed ${this.changes} records from ${mod}_logs`);
    });
  });

  // 1.1 Prune audit_logs older than 30 days (1 month)
  db.run(`DELETE FROM audit_logs WHERE timestamp < datetime('now', '-30 days')`, function(err) {
    if (!err && this.changes > 0) console.log(`[Retention] Pruned ${this.changes} audit logs older than 30 days.`);
  });

  // 2. Scheduled Backup logic can be integrated with a real cron or setInterval
  // For this environment, we simulate a check every hour
};

// Check every hour if it's time for maintenance
setInterval(() => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  getSetting('backup_schedule').then(sched => {
    if (time === sched) runMaintenance();
  });
}, 60000);

// Nightly automated SQLite backup cron job (every day at 20:00)
cron.schedule('0 20 * * *', () => {
  console.log('[Backup Cron] Starting daily scheduled database backup...');
  try {
    const backupsDir = path.resolve(__dirname, '../backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const backupFile = `backup_${todayStr}.sqlite`;
    const backupPath = path.join(backupsDir, backupFile);

    // If file already exists (e.g. from manual trigger or container restart), delete first
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    db.run(`VACUUM INTO ?`, [backupPath], (err) => {
      if (err) {
        console.error('[Backup Cron] Database backup failed (VACUUM INTO):', err.message);
      } else {
        console.log(`[Backup Cron] Database backup successfully created: ${backupFile}`);
        
        // Retention rotation logic: keep only the 14 latest backups
        try {
          const files = fs.readdirSync(backupsDir);
          const backupFiles = files
            .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
            .map(f => {
              const fullPath = path.join(backupsDir, f);
              const stat = fs.statSync(fullPath);
              return { name: f, path: fullPath, mtime: stat.mtimeMs };
            });

          // Sort by modification time ascending (oldest first)
          backupFiles.sort((a, b) => a.mtime - b.mtime);

          // If we have more than 14, delete the oldest ones
          if (backupFiles.length > 14) {
            const filesToDelete = backupFiles.slice(0, backupFiles.length - 14);
            filesToDelete.forEach(file => {
              fs.unlinkSync(file.path);
              console.log(`[Backup Cron] Retention policy: deleted old backup file: ${file.name}`);
            });
          }
        } catch (rotationErr: any) {
          console.error('[Backup Cron] Failed to rotate old backups:', rotationErr.message);
        }
      }
    });
  } catch (err: any) {
    console.error('[Backup Cron] Scheduled backup job encountered an error:', err.message);
  }
});

// Run initial audit log pruning on startup
db.serialize(() => {
  db.run(`DELETE FROM audit_logs WHERE timestamp < datetime('now', '-30 days')`, function(err) {
    if (!err && this.changes > 0) {
      console.log(`[Startup] Pruned ${this.changes} outdated audit log entries older than 30 days.`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`DSM-QMS Backend running on http://localhost:${PORT}`);
});

