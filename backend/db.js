const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path (use new database for fresh start)
const dbPath = path.join(__dirname, 'app_fresh.db');

// Create and connect to database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Enable WAL mode for better concurrency
db.run('PRAGMA journal_mode = WAL');

// Initialize database schema
function initializeDatabase() {
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table ready');
      // Check if role column exists, add it if not
      db.all(`PRAGMA table_info(users)`, (schemaErr, columns) => {
        if (schemaErr) {
          console.error('Error reading users schema:', schemaErr.message);
          return;
        }

        const hasRoleColumn = columns.some((col) => col.name === 'role');
        if (!hasRoleColumn) {
          db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'`, (alterErr) => {
            if (alterErr) {
              console.error('Error adding role column:', alterErr.message);
            } else {
              console.log('Added role column to users table');
            }
            // Insert default admin and superadmin users if not exists
            insertDefaultUsers();
          });
        } else {
          // Insert default admin and superadmin users if not exists
          insertDefaultUsers();
        }
      });
    }
  });

  // Create reports table (new schema)
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_name TEXT NOT NULL,
      reporter_phone TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL,
      image_filename TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      viewed INTEGER DEFAULT 0,
      reported INTEGER DEFAULT 0,
      report_note TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating reports table:', err.message);
    } else {
      console.log('Reports table ready');
      // Ensure old database gets reporter_phone column if missing
      db.all(`PRAGMA table_info(reports)`, (schemaErr, columns) => {
        if (schemaErr) {
          console.error('Error reading reports schema:', schemaErr.message);
          return;
        }

        const hasReporterPhone = columns.some((col) => col.name === 'reporter_phone');
        if (!hasReporterPhone) {
          db.run(`ALTER TABLE reports ADD COLUMN reporter_phone TEXT`, (alterErr) => {
            if (alterErr) {
              console.error('Error adding reporter_phone column:', alterErr.message);
            } else {
              console.log('Added reporter_phone column to reports table');
            }
          });
        }

        const hasViewed = columns.some((col) => col.name === 'viewed');
        if (!hasViewed) {
          db.run(`ALTER TABLE reports ADD COLUMN viewed INTEGER DEFAULT 0`, (alterErr) => {
            if (alterErr) {
              console.error('Error adding viewed column:', alterErr.message);
            } else {
              console.log('Added viewed column to reports table');
            }
          });
        }

        const hasReported = columns.some((col) => col.name === 'reported');
        if (!hasReported) {
          db.run(`ALTER TABLE reports ADD COLUMN reported INTEGER DEFAULT 0`, (alterErr) => {
            if (alterErr) {
              console.error('Error adding reported column:', alterErr.message);
            } else {
              console.log('Added reported column to reports table');
            }
          });
        }

        const hasReportNote = columns.some((col) => col.name === 'report_note');
        if (!hasReportNote) {
          db.run(`ALTER TABLE reports ADD COLUMN report_note TEXT`, (alterErr) => {
            if (alterErr) {
              console.error('Error adding report_note column:', alterErr.message);
            } else {
              console.log('Added report_note column to reports table');
            }
          });
        }
      });
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS report_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      image_filename TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating report_images table:', err.message);
    } else {
      console.log('Report images table ready');
    }
  });
}

// Insert default admin and superadmin users
function insertDefaultUsers() {
  const defaultUsers = [
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'superadmin', password: 'superadmin', role: 'superadmin' }
  ];

  defaultUsers.forEach((user) => {
    const checkQuery = 'SELECT * FROM users WHERE username = ?';
    db.get(checkQuery, [user.username], (err, row) => {
      if (!row) {
        const insertQuery = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
        db.run(insertQuery, [user.username, user.password, user.role], (err) => {
          if (err) {
            console.error(`Error inserting default ${user.username}:`, err.message);
          } else {
            console.log(`Default ${user.username} user created: ${user.username}/${user.password} (role: ${user.role})`);
          }
        });
      }
    });
  });
}

// Get all reports ordered by newest first
function getAllReports(callback) {
  const query = `
    SELECT id, reporter_name, reporter_phone, location, description, latitude, longitude, altitude, image_filename, created_at, viewed, reported, report_note 
    FROM reports 
    ORDER BY created_at DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching reports:', err.message);
      callback(err, null);
    } else {
      if (!rows.length) {
        callback(null, rows);
        return;
      }

      const reportIds = rows.map((row) => Number(row.id)).filter(Number.isFinite);
      const placeholders = reportIds.map(() => '?').join(',');
      const imageQuery = `
        SELECT report_id, image_filename
        FROM report_images
        WHERE report_id IN (${placeholders})
        ORDER BY id ASC
      `;

      db.all(imageQuery, reportIds, (imagesErr, imageRows) => {
        if (imagesErr) {
          console.error('Error fetching report images:', imagesErr.message);
          callback(imagesErr, null);
          return;
        }

        const imageMap = new Map();
        imageRows.forEach((item) => {
          const reportId = Number(item.report_id);
          if (!imageMap.has(reportId)) {
            imageMap.set(reportId, []);
          }
          imageMap.get(reportId).push(item.image_filename);
        });

        const reportsWithImages = rows.map((row) => {
          const reportId = Number(row.id);
          const legacy = row.image_filename ? [row.image_filename] : [];
          const extraImages = imageMap.get(reportId) || [];
          const allImageFilenames = Array.from(new Set([...legacy, ...extraImages]));
          return {
            ...row,
            image_filenames: allImageFilenames
          };
        });

        callback(null, reportsWithImages);
      });
    }
  });
}

// Insert a new report
function insertReport(data, callback) {
  const { reporterName, reporterPhone, location, description, latitude, longitude, altitude, imageFilenames } = data;
  const allImageFilenames = Array.isArray(imageFilenames)
    ? imageFilenames.filter((name) => typeof name === 'string' && name.trim())
    : [];
  const primaryImageFilename = allImageFilenames[0] || null;
  const extraImageFilenames = allImageFilenames.slice(1);
  
  const query = `
    INSERT INTO reports (reporter_name, reporter_phone, location, description, latitude, longitude, altitude, image_filename) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [reporterName, reporterPhone, location, description, latitude, longitude, altitude, primaryImageFilename], function(err) {
    if (err) {
      console.error('Error inserting report:', err.message);
      callback(err, null);
    } else {
      const reportId = this.lastID;

      const finishInsert = () => {
        callback(null, {
          id: reportId,
          reporter_name: reporterName,
          reporter_phone: reporterPhone,
          location,
          description,
          latitude,
          longitude,
          altitude,
          image_filename: primaryImageFilename,
          image_filenames: allImageFilenames,
          created_at: new Date().toISOString(),
          viewed: 0,
          reported: 0,
          report_note: null
        });
      };

      if (!extraImageFilenames.length) {
        finishInsert();
        return;
      }

      insertReportImages(reportId, extraImageFilenames, (imageInsertErr) => {
        if (imageInsertErr) {
          callback(imageInsertErr, null);
          return;
        }
        finishInsert();
      });
    }
  });
}

function insertReportImages(reportId, imageFilenames, callback) {
  if (!Array.isArray(imageFilenames) || !imageFilenames.length) {
    callback(null);
    return;
  }

  const query = 'INSERT INTO report_images (report_id, image_filename) VALUES (?, ?)';
  let remaining = imageFilenames.length;
  let done = false;

  imageFilenames.forEach((filename) => {
    db.run(query, [reportId, filename], (err) => {
      if (done) {
        return;
      }

      if (err) {
        done = true;
        console.error('Error inserting report image:', err.message);
        callback(err);
        return;
      }

      remaining -= 1;
      if (remaining === 0) {
        done = true;
        callback(null);
      }
    });
  });
}

function getReportImageFilenames(reportId, callback) {
  const normalizedId = Number(reportId);
  if (!Number.isFinite(normalizedId)) {
    callback(null, []);
    return;
  }

  getReport(normalizedId, (reportErr, report) => {
    if (reportErr) {
      callback(reportErr, null);
      return;
    }

    const query = `
      SELECT image_filename
      FROM report_images
      WHERE report_id = ?
      ORDER BY id ASC
    `;

    db.all(query, [normalizedId], (imagesErr, rows) => {
      if (imagesErr) {
        console.error('Error fetching report image filenames:', imagesErr.message);
        callback(imagesErr, null);
        return;
      }

      const legacy = report?.image_filename ? [report.image_filename] : [];
      const extra = rows.map((row) => row.image_filename).filter(Boolean);
      callback(null, Array.from(new Set([...legacy, ...extra])));
    });
  });
}

// Authenticate user
function authenticateUser(username, password, callback) {
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.get(query, [username, password], (err, row) => {
    if (err) {
      console.error('Error authenticating user:', err.message);
      callback(err, null);
    } else {
      callback(null, row);
    }
  });
}

// Get single report
function getReport(id, callback) {
  const query = 'SELECT * FROM reports WHERE id = ?';
  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('Error fetching report:', err.message);
      callback(err, null);
    } else {
      callback(null, row);
    }
  });
}

// Delete report
function deleteReport(id, callback) {
  const deleteImagesQuery = 'DELETE FROM report_images WHERE report_id = ?';
  const deleteReportQuery = 'DELETE FROM reports WHERE id = ?';

  db.run(deleteImagesQuery, [id], (imageErr) => {
    if (imageErr) {
      console.error('Error deleting report images:', imageErr.message);
      callback(imageErr, null);
      return;
    }

    db.run(deleteReportQuery, [id], function(err) {
      if (err) {
        console.error('Error deleting report:', err.message);
        callback(err, null);
      } else {
        callback(null, { success: true, deletedRows: this.changes });
      }
    });
  });
}

// Update report viewed status
function updateReportViewed(id, viewed, callback) {
  const query = 'UPDATE reports SET viewed = ? WHERE id = ?';
  db.run(query, [viewed ? 1 : 0, id], function(err) {
    if (err) {
      console.error('Error updating report viewed status:', err.message);
      callback(err, null);
    } else {
      callback(null, { success: true, updatedRows: this.changes });
    }
  });
}


// Update report status (viewed/reported/note)
function updateReportStatus(id, data, callback) {
  const updates = [];
  const params = [];

  if (typeof data.viewed === 'boolean') {
    updates.push('viewed = ?');
    params.push(data.viewed ? 1 : 0);
  }

  if (typeof data.reported === 'boolean') {
    updates.push('reported = ?');
    params.push(data.reported ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'reportNote')) {
    updates.push('report_note = ?');
    params.push((data.reportNote || '').trim() || null);
  }

  if (!updates.length) {
    callback(null, { success: true, updatedRows: 0 });
    return;
  }

  params.push(id);
  const query = `UPDATE reports SET ${updates.join(', ')} WHERE id = ?`;

  db.run(query, params, function(err) {
    if (err) {
      console.error('Error updating report status:', err.message);
      callback(err, null);
    } else {
      callback(null, { success: true, updatedRows: this.changes });
    }
  });
}

// Update user password
function updateUserPassword(username, newPassword, callback) {
  const query = 'UPDATE users SET password = ? WHERE username = ?';
  db.run(query, [newPassword, username], function(err) {
    if (err) {
      console.error('Error updating password:', err.message);
      callback(err, null);
    } else {
      callback(null, { success: true });
    }
  });
}

// Get all users (for superadmin)
function getAllUsers(callback) {
  const query = 'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC';
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err.message);
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

// Create new user (for superadmin)
function createUser(username, password, role, callback) {
  const query = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
  db.run(query, [username, password, role], function(err) {
    if (err) {
      console.error('Error creating user:', err.message);
      callback(err, null);
    } else {
      callback(null, { 
        success: true, 
        id: this.lastID,
        username,
        role 
      });
    }
  });
}

// Delete user (for superadmin)
function deleteUser(userId, callback) {
  const query = 'DELETE FROM users WHERE id = ?';
  db.run(query, [userId], function(err) {
    if (err) {
      console.error('Error deleting user:', err.message);
      callback(err, null);
    } else {
      callback(null, { success: true, deletedRows: this.changes });
    }
  });
}

// Update user role (for superadmin)
function updateUserRole(userId, role, callback) {
  const query = 'UPDATE users SET role = ? WHERE id = ?';
  db.run(query, [role, userId], function(err) {
    if (err) {
      console.error('Error updating user role:', err.message);
      callback(err, null);
    } else {
      callback(null, { success: true, updatedRows: this.changes });
    }
  });
}

// Close database connection
function closeDatabase() {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
}

module.exports = {
  getAllReports,
  insertReport,
  authenticateUser,
  getReport,
  deleteReport,
  updateUserPassword,
  updateReportViewed,
  updateReportStatus,
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole,
  getReportImageFilenames,
  closeDatabase
};

