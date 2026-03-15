'use strict';
const D = require('better-sqlite3')('C:/Users/eadno1/.nexl/app-data/nexl-data.db');

console.log('\n--- file_revisions (latest 20) ---');
const revs = D.prepare("SELECT id, file_path, revision_no, saved_by, size_bytes, datetime(saved_at/1000,'unixepoch') as ts FROM file_revisions ORDER BY saved_at DESC LIMIT 20").all();
console.log(JSON.stringify(revs, null, 2));

console.log('\n--- file_metadata ---');
const meta = D.prepare("SELECT file_path, revision_count, last_saved_by, datetime(last_saved_at/1000,'unixepoch') as last_ts FROM file_metadata").all();
console.log(JSON.stringify(meta, null, 2));

D.close();
