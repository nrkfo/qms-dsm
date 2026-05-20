#!/usr/bin/env node

/**
 * DSM-QMS Audit Log CLI Viewer
 * Enables real-time database log tailing (-f/--follow) and historical lookups (-n <limit>)
 */

const path = require('path');
const fs = require('fs');

// Dynamically require sqlite3 from the backend node_modules folder
const sqlite3 = require(path.resolve(__dirname, 'backend/node_modules/sqlite3')).verbose();

const dbPath = path.resolve(__dirname, 'backend/database.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error(`\x1b[31m[Error] Database file not found at: ${dbPath}\x1b[0m`);
  console.error(`Make sure to run this script from the project root directory.`);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('\x1b[31m[Error] Opening database failed:\x1b[0m', err.message);
    process.exit(1);
  }
});

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
\x1b[36m=== QMS-DSM Audit Log Terminal Viewer ===\x1b[0m
Allows real-time streaming and browsing of database audit logs.

\x1b[1mUsage:\x1b[0m
  node show-audit-logs.js [options]

\x1b[1mOptions:\x1b[0m
  \x1b[32m-f, --follow\x1b[0m     Stream log updates in real-time (similar to tail -f)
  \x1b[32m-n <number>\x1b[0m      Number of historical log entries to display (default: 50)
  \x1b[32m--action <term>\x1b[0m  Filter logs containing a specific action keyword (e.g. UPDATE, DELETE)
  \x1b[32m-h, --help\x1b[0m       Show this help manual
  `);
  process.exit(0);
}

const follow = args.includes('--follow') || args.includes('-f');

let limit = 50;
const nIndex = args.indexOf('-n');
if (nIndex !== -1 && args[nIndex + 1]) {
  limit = parseInt(args[nIndex + 1], 10) || 50;
}

const actionIndex = args.indexOf('--action');
let actionFilter = null;
if (actionIndex !== -1 && args[actionIndex + 1]) {
  actionFilter = args[actionIndex + 1];
}

const printLog = (row) => {
  const dateObj = new Date(row.timestamp.includes('Z') ? row.timestamp : row.timestamp + 'Z');
  const time = dateObj.toLocaleString('ru-RU');
  const user = row.username || 'System (ID 0)';
  const action = row.action;
  
  const cleanBase64 = (obj) => {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'string' && obj.startsWith('data:image/')) {
        return `<base64_image: ${Math.round(obj.length / 1024)}KB>`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(cleanBase64);
    }
    const cleaned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if ((key === 'photos' || key === 'previewPhotos') && Array.isArray(obj[key])) {
          cleaned[key] = `photos: ${obj[key].length}`;
        } else {
          cleaned[key] = cleanBase64(obj[key]);
        }
      }
    }
    return cleaned;
  };

  let details = '';
  try {
    const parsed = JSON.parse(row.details || '{}');
    const cleaned = cleanBase64(parsed);
    details = JSON.stringify(cleaned, null, 2);
  } catch (e) {
    details = row.details || '';
  }

  // Action colors
  let actionColor = '\x1b[36m'; // Cyan for standard
  if (action.includes('DELETE')) {
    actionColor = '\x1b[31;1m'; // Bold Red for Deletion
  } else if (action.includes('UPDATE')) {
    actionColor = '\x1b[33;1m'; // Bold Yellow for Edits
  } else if (action.includes('CREATE') || action.includes('ADD')) {
    actionColor = '\x1b[32;1m'; // Bold Green for Additions
  }

  console.log(`\x1b[90m[${time}]\x1b[0m \x1b[35m[${user}]\x1b[0m ${actionColor}${action}\x1b[0m`);
  if (details && details !== '{}') {
    const paddedDetails = details.split('\n').map(line => '    ' + line).join('\n');
    console.log(`\x1b[37m${paddedDetails}\x1b[0m`);
  }
  console.log('\x1b[90m' + '—'.repeat(60) + '\x1b[0m');
};

if (follow) {
  console.log('\x1b[32;1m[Streaming] Listening for new audit logs in real-time... (Press Ctrl+C to exit)\x1b[0m\n' + '═'.repeat(60));
  let lastId = 0;

  db.get('SELECT MAX(id) as maxId FROM audit_logs', [], (err, row) => {
    if (err) {
      console.error('Error fetching initial log state:', err.message);
      process.exit(1);
    }
    lastId = row ? row.maxId || 0 : 0;

    // Stream interval loop
    setInterval(() => {
      let query = `
        SELECT a.*, u.username 
        FROM audit_logs a 
        LEFT JOIN users u ON a.user_id = u.id 
        WHERE a.id > ?
      `;
      const params = [lastId];

      if (actionFilter) {
        query += ' AND a.action LIKE ?';
        params.push(`%${actionFilter}%`);
      }

      query += ' ORDER BY a.id ASC';

      db.all(query, params, (err, rows) => {
        if (err || !rows) return;
        rows.forEach(row => {
          printLog(row);
          if (row.id > lastId) {
            lastId = row.id;
          }
        });
      });
    }, 1000);
  });
} else {
  let query = `
    SELECT a.*, u.username 
    FROM audit_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    WHERE 1=1
  `;
  const params = [];

  if (actionFilter) {
    query += ' AND a.action LIKE ?';
    params.push(`%${actionFilter}%`);
  }

  query += ' ORDER BY a.timestamp DESC LIMIT ?';
  params.push(limit);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching logs from database:', err.message);
      process.exit(1);
    }
    
    console.log(`\x1b[32;1m[History] Showing last ${rows.length} audit log entries...\x1b[0m\n` + '═'.repeat(60));
    
    // Reverse rows to display oldest first (chronological history scroll)
    rows.reverse().forEach(row => printLog(row));
    db.close();
  });
}
