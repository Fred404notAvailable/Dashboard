const db = require('better-sqlite3')('database.sqlite');
db.prepare('UPDATE users SET password_hash = ?').run('$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm');
console.log('Password hash updated securely');
