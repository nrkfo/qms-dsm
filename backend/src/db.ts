import sqlite3 from 'sqlite3';
import path from 'path';
import { setupLogger } from './utils/logger';

const logger = setupLogger('БазаДанных');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.critical('Ошибка при открытии SQLite базы данных! База заблокирована (SQLITE_BUSY / locked) или отсутствует доступ.', err);
  } else {
    logger.info('Успешное подключение к базе данных SQLite.');
    
    // Enable performance optimizations and foreign keys
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) logger.error('Ошибка при установке PRAGMA journal_mode = WAL!', err);
    });
    db.run('PRAGMA synchronous = NORMAL;', (err) => {
      if (err) logger.error('Ошибка при установке PRAGMA synchronous = NORMAL!', err);
    });
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) logger.error('Ошибка при установке PRAGMA foreign_keys = ON (ограничения внешних ключей)!', err);
    });
    
    // Create initial tables
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT, -- 'Admin', 'Inspector', 'Viewer'
        permissions TEXT DEFAULT '[]'
      )`);

      // Lots table
      db.run(`CREATE TABLE IF NOT EXISTS lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        tv_model_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      )`);
      
      // Migration: Add tv_model_id to existing lots table if missing
      db.all(`PRAGMA table_info(lots)`, (err, rows: any[]) => {
        if (err) return logger.error('Ошибка при проверке схемы таблицы lots (PRAGMA table_info)!', err);
        const hasColumn = rows.some(r => r.name === 'tv_model_id');
        if (!hasColumn) {
          db.run(`ALTER TABLE lots ADD COLUMN tv_model_id INTEGER`, (err) => {
            if (err) logger.error('Ошибка при миграции схемы: не удалось добавить tv_model_id в lots!', err);
            else logger.info('Успешно выполнена миграция схемы: добавлена колонка tv_model_id в таблицу lots.');
          });
        }
      });




      // Module Logs Tables (Persistence)
      const modules = [
        'oqa_tv', 'oqa_pallets', 'oqa_labels', 
        'iqc_aql', 'iqc_panels', 'iqc_eps', 
        'iqc_covers', 'iqc_components', 'oqa_patrol'
      ];

      modules.forEach(mod => {
        if (mod === 'iqc_panels') {
          db.run(`CREATE TABLE IF NOT EXISTS iqc_panels_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_id INTEGER,
            user_id INTEGER,
            date TEXT,
            data TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            defect_type TEXT GENERATED ALWAYS AS (json_extract(data, '$.defect')) VIRTUAL,
            part_code TEXT GENERATED ALWAYS AS (json_extract(data, '$.partCode')) VIRTUAL,
            FOREIGN KEY(lot_id) REFERENCES lots(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_iqc_panels_date ON iqc_panels_logs (date)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_iqc_panels_lot ON iqc_panels_logs (lot_id)`);
          db.all(`PRAGMA table_info(iqc_panels_logs)`, (err, rows: any[]) => {
            if (err || !rows) return;
            const hasDefectType = rows.some(r => r.name === 'defect_type');
            if (hasDefectType) {
              db.run(`CREATE INDEX IF NOT EXISTS idx_panels_defect ON iqc_panels_logs (defect_type)`);
              db.run(`CREATE INDEX IF NOT EXISTS idx_panels_part ON iqc_panels_logs (part_code)`);
            }
          });
        } else if (mod === 'oqa_tv') {
          db.run(`CREATE TABLE IF NOT EXISTS oqa_tv_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_id INTEGER,
            user_id INTEGER,
            date TEXT,
            data TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            defect_type TEXT GENERATED ALWAYS AS (json_extract(data, '$.defects')) VIRTUAL,
            tv_model TEXT GENERATED ALWAYS AS (json_extract(data, '$.model')) VIRTUAL,
            FOREIGN KEY(lot_id) REFERENCES lots(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_oqa_tv_date ON oqa_tv_logs (date)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_oqa_tv_lot ON oqa_tv_logs (lot_id)`);
          db.all(`PRAGMA table_info(oqa_tv_logs)`, (err, rows: any[]) => {
            if (err || !rows) return;
            const hasDefectType = rows.some(r => r.name === 'defect_type');
            if (hasDefectType) {
              db.run(`CREATE INDEX IF NOT EXISTS idx_tv_defect ON oqa_tv_logs (defect_type)`);
              db.run(`CREATE INDEX IF NOT EXISTS idx_tv_model ON oqa_tv_logs (tv_model)`);
            }
          });
        } else {
          db.run(`CREATE TABLE IF NOT EXISTS ${mod}_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_id INTEGER,
            user_id INTEGER,
            date TEXT,
            data TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(lot_id) REFERENCES lots(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
          )`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_${mod}_date ON ${mod}_logs (date)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_${mod}_lot ON ${mod}_logs (lot_id)`);
        }

        // Migration: Add timestamp to existing module log tables
        db.all(`PRAGMA table_info(${mod}_logs)`, (err, rows: any[]) => {
          if (err) return;
          const hasCol = rows.some(r => r.name === 'timestamp');
          if (!hasCol) {
            db.run(`ALTER TABLE ${mod}_logs ADD COLUMN timestamp DATETIME`);
          }
        });
      });

      // Suppliers table
      db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        is_active INTEGER DEFAULT 1
      )`);

      // Articles table
      db.run(`CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER,
        name TEXT,
        category TEXT DEFAULT 'General',
        drawing_url TEXT,
        specs TEXT,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS components_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tv_model_id INTEGER,
        article TEXT,
        name TEXT,
        FOREIGN KEY(tv_model_id) REFERENCES tv_models(id) ON DELETE CASCADE
      )`);

      // Migration: Add columns if they don't exist
      db.run(`ALTER TABLE suppliers ADD COLUMN is_active INTEGER DEFAULT 1`, (err) => {});
      db.run(`ALTER TABLE articles ADD COLUMN category TEXT DEFAULT 'General'`, (err) => {});
      db.run(`ALTER TABLE articles ADD COLUMN drawing_url TEXT`, (err) => {});
      db.run(`ALTER TABLE articles ADD COLUMN specs TEXT`, (err) => {});
      db.run(`ALTER TABLE articles ADD COLUMN is_active INTEGER DEFAULT 1`, (err) => {});

      // Settings table
      db.run(`CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);

      // Daily KPI facts table
      db.run(`CREATE TABLE IF NOT EXISTS daily_kpi_facts (
        date TEXT PRIMARY KEY,
        mes_fact INTEGER DEFAULT 0,
        aql_plan INTEGER DEFAULT 0
      )`);


      // Audit logs disabled

      // TV Models table
      db.run(`CREATE TABLE IF NOT EXISTS tv_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        mn_keyword TEXT UNIQUE,
        label_sn_len INTEGER,
        label_mn_len INTEGER,
        label_ean_len INTEGER,
        label_sn_fix TEXT,
        label_mn_fix TEXT,
        label_ean_fix TEXT,
        label_parsing_config TEXT,
        pallet_barcode_len INTEGER,
        pallet_barcode_fix TEXT,
        pallet_parsing_config TEXT,
        pallet_keyword TEXT
      )`);

      // Migration: Add label config columns if they don't exist
      db.run(`ALTER TABLE tv_models ADD COLUMN label_sn_len INTEGER`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_mn_len INTEGER`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_ean_len INTEGER`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_sn_fix TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_mn_fix TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_ean_fix TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN label_parsing_config TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN pallet_barcode_len INTEGER`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN pallet_barcode_fix TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN pallet_parsing_config TEXT`, (err) => {});
      db.run(`ALTER TABLE tv_models ADD COLUMN pallet_keyword TEXT`, (err) => {});
      db.run(`ALTER TABLE components_master ADD COLUMN tv_model_id INTEGER`, (err) => {});

      // TV Tests table
      db.run(`CREATE TABLE IF NOT EXISTS tv_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT
      )`);

      // Breaks table
      db.run(`CREATE TABLE IF NOT EXISTS breaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        start_time TEXT,
        end_time TEXT
      )`);

      // Add default breaks
      db.run(`INSERT OR IGNORE INTO breaks (name, start_time, end_time) VALUES ('Первый перерыв', '10:00', '10:15')`);
      db.run(`INSERT OR IGNORE INTO breaks (name, start_time, end_time) VALUES ('Обед', '12:00', '13:00')`);
      db.run(`INSERT OR IGNORE INTO breaks (name, start_time, end_time) VALUES ('Второй перерыв', '15:00', '15:15')`);

      // Add default settings
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('label_timer_limit', '3600000')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('data_retention_days', '90')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('aql_mode', 'Normal')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('backup_schedule', '03:00')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('label_sn_len', '18')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('label_mn_len', '21')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('label_ean_len', '13')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('api_key', 'qms_dsm_mes_connect_2024_static_prod')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('mes_dashboard_url', '')`);
      db.run(`INSERT OR IGNORE INTO global_settings (key, value) VALUES ('auto_close_shift_time', '17:00')`);

      // Add default admin if not exists (password: admin)
      db.run(`INSERT OR IGNORE INTO users (username, password, role, permissions) VALUES ('admin', '$2b$10$m0IhNu/sYYVr7yHGLdw1veWWK8Kp4687PSJ1e97RYXckFXSUtZ9.S', 'Admin', '["admin_panel","oqa_tv","oqa_pallets","oqa_labels","iqc_aql","iqc_panels","iqc_eps","iqc_covers","iqc_components","oqa_patrol"]')`);

      // Run Migrations for Generated Columns on Existing Tables
      db.all(`PRAGMA table_info(iqc_panels_logs)`, (err, rows: any[]) => {
        if (err || !rows) return;
        const hasDefectType = rows.some(r => r.name === 'defect_type');
        if (!hasDefectType && rows.length > 0) {
          console.log('[Migration] Migrating iqc_panels_logs to Generated Columns schema...');
          db.serialize(() => {
            db.run(`ALTER TABLE iqc_panels_logs RENAME TO iqc_panels_logs_old`);
            db.run(`CREATE TABLE iqc_panels_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lot_id INTEGER,
              user_id INTEGER,
              date TEXT,
              data TEXT,
              status TEXT,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              defect_type TEXT GENERATED ALWAYS AS (json_extract(data, '$.defect')) VIRTUAL,
              part_code TEXT GENERATED ALWAYS AS (json_extract(data, '$.partCode')) VIRTUAL,
              FOREIGN KEY(lot_id) REFERENCES lots(id),
              FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            db.run(`INSERT INTO iqc_panels_logs (id, lot_id, user_id, date, data, status, timestamp)
                    SELECT id, lot_id, user_id, date, data, status, timestamp FROM iqc_panels_logs_old`);
            db.run(`DROP TABLE iqc_panels_logs_old`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_iqc_panels_date ON iqc_panels_logs (date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_iqc_panels_lot ON iqc_panels_logs (lot_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_panels_defect ON iqc_panels_logs (defect_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_panels_part ON iqc_panels_logs (part_code)`);
            console.log('[Migration] iqc_panels_logs migration to Generated Columns complete.');
          });
        }
      });

      db.all(`PRAGMA table_info(oqa_tv_logs)`, (err, rows: any[]) => {
        if (err || !rows) return;
        const hasDefectType = rows.some(r => r.name === 'defect_type');
        if (!hasDefectType && rows.length > 0) {
          console.log('[Migration] Migrating oqa_tv_logs to Generated Columns schema...');
          db.serialize(() => {
            db.run(`ALTER TABLE oqa_tv_logs RENAME TO oqa_tv_logs_old`);
            db.run(`CREATE TABLE oqa_tv_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lot_id INTEGER,
              user_id INTEGER,
              date TEXT,
              data TEXT,
              status TEXT,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              defect_type TEXT GENERATED ALWAYS AS (json_extract(data, '$.defects')) VIRTUAL,
              tv_model TEXT GENERATED ALWAYS AS (json_extract(data, '$.model')) VIRTUAL,
              FOREIGN KEY(lot_id) REFERENCES lots(id),
              FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            db.run(`INSERT INTO oqa_tv_logs (id, lot_id, user_id, date, data, status, timestamp)
                    SELECT id, lot_id, user_id, date, data, status, timestamp FROM oqa_tv_logs_old`);
            db.run(`DROP TABLE oqa_tv_logs_old`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_oqa_tv_date ON oqa_tv_logs (date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_oqa_tv_lot ON oqa_tv_logs (lot_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_tv_defect ON oqa_tv_logs (defect_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_tv_model ON oqa_tv_logs (tv_model)`);
            console.log('[Migration] oqa_tv_logs migration to Generated Columns complete.');
          });
        }
      });


    });
  }
});

export default db;

