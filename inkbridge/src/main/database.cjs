'use strict';

// InkBridge owns this schema. The SQLite engine is Node's public built-in module.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const APPLICATION_ID = 0x494e4b42; // INKB
const SCHEMA_VERSION = 1;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const IDENTIFIER = /^[a-z\d_.:-]{1,128}$/i;

class PersistenceError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function check(condition, message) {
  if (!condition) throw new PersistenceError('INVALID_REQUEST', message);
}

function text(value, name, limit) {
  check(typeof value === 'string' && value.length <= limit, `Invalid ${name}`);
  return value;
}

function identifier(value, name) {
  check(typeof value === 'string' && IDENTIFIER.test(value), `Invalid ${name}`);
  return value;
}

function number(value, name, min, max, integer = false) {
  check(Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value)), `Invalid ${name}`);
  return value;
}

// Canonical JSON is for stable comparisons and idempotency, not execution.
function canonicalJSON(value, depth = 0) {
  check(depth <= 64, 'JSON nesting is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    check(Number.isFinite(value), 'Non-finite JSON number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(item => canonicalJSON(item, depth + 1)).join(',') + ']';
  check(value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'Invalid JSON value');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key], depth + 1)).join(',') + '}';
}

function validateDocument(document) {
  if (document === null || document === undefined) return null;
  check(document && typeof document === 'object' && !Array.isArray(document), 'Invalid Lexical document');
  check(document.root && document.root.type === 'root' && Array.isArray(document.root.children), 'Invalid Lexical root');
  const serialized = canonicalJSON(document);
  check(Buffer.byteLength(serialized) <= 2 * 1024 * 1024, 'Lexical document is too large');
  return serialized;
}

function validateView(view) {
  check(view && typeof view === 'object' && !Array.isArray(view), 'Invalid board view');
  return canonicalJSON({
    x: number(view.x, 'view x', -1e9, 1e9),
    y: number(view.y, 'view y', -1e9, 1e9),
    zoom: number(view.zoom, 'view zoom', .01, 100)
  });
}

class WorkspaceDatabase {
  constructor(filename) {
    check(typeof filename === 'string' && path.isAbsolute(filename), 'Database filename must be absolute');
    this.filename = path.resolve(filename);
    if (/flexnote|onedrive/i.test(this.filename) || this.filename.startsWith('\\\\')) throw new PersistenceError('UNSAFE_DATABASE_PATH', 'InkBridge requires its own local database path');
    this.statements = new Map();
    this.closed = false;

    // Never change journal/header settings on an unrelated existing database.
    const existing = fs.existsSync(this.filename);
    if (existing) {
      const inspection = new DatabaseSync(this.filename, { readOnly: true });
      try {
        if (inspection.prepare('PRAGMA application_id').get().application_id !== APPLICATION_ID) {
          throw new PersistenceError('UNRECOGNIZED_DATABASE', 'This file is not an InkBridge workspace');
        }
        if (inspection.prepare('PRAGMA user_version').get().user_version !== SCHEMA_VERSION) {
          throw new PersistenceError('UNSUPPORTED_SCHEMA', 'Unsupported InkBridge schema version');
        }
      } finally { inspection.close(); }
    } else {
      fs.mkdirSync(path.dirname(this.filename), { recursive: true });
      const handle = fs.openSync(this.filename, 'wx');
      fs.closeSync(handle);
    }

    try {
      this.db = new DatabaseSync(this.filename);
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
      if (!existing) this.initialize();
      this.workspaceId = this.statement('SELECT value FROM meta WHERE key=?').get('workspaceId')?.value;
      if (!UUID.test(this.workspaceId || '')) throw new PersistenceError('INVALID_DATABASE', 'Workspace identity is missing or invalid');
    } catch (error) {
      this.db?.close();
      this.closed = true;
      throw error;
    }
  }

  initialize() {
    this.db.exec(`
      BEGIN IMMEDIATE;
      PRAGMA application_id=${APPLICATION_ID};
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE boards (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, view_json TEXT NOT NULL CHECK(json_valid(view_json))
      ) STRICT;
      CREATE TABLE contents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
        document_json TEXT CHECK(document_json IS NULL OR json_valid(document_json)),
        kind TEXT NOT NULL, tone TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=1)
      ) STRICT;
      CREATE TABLE instances (
        id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES contents(id),
        board_id TEXT NOT NULL REFERENCES boards(id),
        x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL CHECK(width>0),
        height REAL NOT NULL CHECK(height>0), z INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX instances_board ON instances(board_id);
      CREATE INDEX instances_content ON instances(content_id);
      CREATE TABLE commit_receipts (
        request_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
        ack_json TEXT NOT NULL CHECK(json_valid(ack_json))
      ) STRICT;
      PRAGMA user_version=${SCHEMA_VERSION};
    `);
    try {
      this.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('workspaceId', crypto.randomUUID());
      this.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('revision', '0');
      this.db.prepare('INSERT INTO boards(id,title,view_json) VALUES (?,?,?)').run('board-main', '靈感白板', canonicalJSON({ x: 70, y: 100, zoom: 1 }));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  statement(sql) {
    if (this.closed) throw new PersistenceError('DATABASE_CLOSED', 'InkBridge database is closed');
    if (!this.statements.has(sql)) this.statements.set(sql, this.db.prepare(sql));
    return this.statements.get(sql);
  }

  revision() {
    const revision = Number(this.statement('SELECT value FROM meta WHERE key=?').get('revision')?.value);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new PersistenceError('INVALID_DATABASE', 'Invalid workspace revision');
    return revision;
  }

  load() {
    if (this.closed) throw new PersistenceError('DATABASE_CLOSED', 'InkBridge database is closed');
    // A read transaction keeps catalog/content/instances at one logical revision.
    this.db.exec('BEGIN');
    try {
      const graph = {
        workspaceId: this.workspaceId,
        revision: this.revision(),
        boards: this.statement("SELECT b.id,b.title,b.view_json,m.value AS attributes FROM boards b LEFT JOIN meta m ON m.key='board:'||b.id ORDER BY b.id").all().map(row => ({ id: row.id, title: row.title, view: JSON.parse(row.view_json),...(row.attributes?{attributes:JSON.parse(row.attributes)}:{}) })),
        contents: this.statement('SELECT * FROM contents ORDER BY id').all().map(row => ({
          id: row.id, title: row.title, body: row.body, document: row.document_json === null ? null : JSON.parse(row.document_json), kind: row.kind, tone: row.tone, revision: row.revision
        })),
        instances: this.statement("SELECT instances.*,meta.value AS attributes FROM instances LEFT JOIN meta ON meta.key='instance:'||instances.id ORDER BY z,id").all().map(row => ({
          id: row.id, contentId: row.content_id, boardId: row.board_id, x: row.x, y: row.y, width: row.width, height: row.height, z: row.z,...(row.attributes?{attributes:JSON.parse(row.attributes)}:{})
        }))
      };
      for(const [field,prefix] of [['folders','folder:'],['whiteboardInstances','whiteboard-instance:'],['cardMetadata','card:'],['tags','tag:'],['cardTags','card-tag:'],['cardRemarks','remark:']]){
        const records=this.statement('SELECT value FROM meta WHERE key LIKE ? ORDER BY key').all(prefix+'%').map(row=>JSON.parse(row.value));if(records.length)graph[field]=records;
      }
      this.db.exec('COMMIT');
      return graph;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  commit(request) {
    if (this.closed) throw new PersistenceError('DATABASE_CLOSED', 'InkBridge database is closed');
    check(request && typeof request === 'object' && !Array.isArray(request), 'Invalid commit request');
    check(typeof request.requestId === 'string' && UUID.test(request.requestId), 'Invalid request ID');
    number(request.baseRevision, 'base revision', 0, Number.MAX_SAFE_INTEGER, true);
    check(Array.isArray(request.operations) && request.operations.length <= 2000, 'Invalid operations');
    const encoded = canonicalJSON(request);
    check(Buffer.byteLength(encoded) <= 8 * 1024 * 1024, 'Commit is too large');
    const hash = crypto.createHash('sha256').update(encoded).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.statement('SELECT request_hash,ack_json FROM commit_receipts WHERE request_id=?').get(request.requestId);
      if (previous) {
        if (previous.request_hash !== hash) throw new PersistenceError('REQUEST_ID_REUSED', 'Request ID was reused with different data');
        const ack = JSON.parse(previous.ack_json);
        this.db.exec('COMMIT');
        return ack;
      }
      const current = this.revision();
      if (request.baseRevision !== current) throw new PersistenceError('STALE_REVISION', 'Workspace changed before this commit', { expected: current, received: request.baseRevision });
      let changed = false;
      const contentRevisions = {};
      for (const operation of request.operations) {
        check(operation && typeof operation === 'object' && !Array.isArray(operation), 'Invalid operation');
        if (operation.type === 'putContent') {
          const data = operation.data;
          check(data && typeof data === 'object', 'Missing content');
          const id = identifier(data.id, 'content ID');
          const title = text(data.title, 'title', 120);
          const body = text(data.body ?? '', 'body', 500000);
          const document = validateDocument(data.document);
          const kind = data.kind ?? 'text', tone = data.tone ?? 'sage';
          check(['text', 'image'].includes(kind), 'Invalid card kind');
          check(['sage', 'sand', 'rose', 'blue'].includes(tone), 'Invalid card tone');
          const old = this.statement('SELECT * FROM contents WHERE id=?').get(id);
          const different = !old || old.title !== title || old.body !== body || old.document_json !== document || old.kind !== kind || old.tone !== tone;
          const revision = different ? (old?.revision || 0) + 1 : old.revision;
          if (different) {
            this.statement(`INSERT INTO contents(id,title,body,document_json,kind,tone,revision) VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,document_json=excluded.document_json,kind=excluded.kind,tone=excluded.tone,revision=excluded.revision`).run(id, title, body, document, kind, tone, revision);
            changed = true;
            const key='card:'+id,record=this.statement('SELECT value FROM meta WHERE key=?').get(key),metadata=record?JSON.parse(record.value):{},now=new Date().toISOString();
            this.statement('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,canonicalJSON({...metadata,id,createdTime:metadata.createdTime??(old?null:now),lastEditedTime:now}));
          }
          Object.defineProperty(contentRevisions, id, { value: revision, enumerable: true, writable: true, configurable: true });
        } else if (operation.type === 'putInstance') {
          const data = operation.data;
          check(data && typeof data === 'object', 'Missing instance');
          const id = identifier(data.id, 'instance ID'), contentId = identifier(data.contentId, 'content ID'), boardId = identifier(data.boardId, 'board ID');
          const x = number(data.x, 'x', -1e9, 1e9), y = number(data.y, 'y', -1e9, 1e9);
          const width = number(data.width, 'width', 8, 20000), height = number(data.height, 'height', 8, 20000), z = number(data.z, 'z', -1e9, 1e9, true);
          const old = this.statement('SELECT * FROM instances WHERE id=?').get(id);
          if (!old || old.content_id !== contentId || old.board_id !== boardId || old.x !== x || old.y !== y || old.width !== width || old.height !== height || old.z !== z) {
            this.statement(`INSERT INTO instances(id,content_id,board_id,x,y,width,height,z) VALUES (?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET content_id=excluded.content_id,board_id=excluded.board_id,x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,z=excluded.z`).run(id, contentId, boardId, x, y, width, height, z);
            changed = true;
          }
        } else if (operation.type === 'deleteInstance') {
          const result = this.statement('DELETE FROM instances WHERE id=?').run(identifier(operation.id, 'instance ID'));
          changed ||= Number(result.changes) > 0;
          const metadata = this.statement('DELETE FROM meta WHERE key=?').run('instance:'+operation.id);
          changed ||= Number(metadata.changes) > 0;
        } else if (operation.type === 'putBoard') {
          const data = operation.data;
          check(data && typeof data === 'object', 'Missing board');
          const id = identifier(data.id, 'board ID'), title = text(data.title, 'board title', 200), view = validateView(data.view);
          const old = this.statement('SELECT * FROM boards WHERE id=?').get(id);
          if (!old || old.title !== title || old.view_json !== view) {
            this.statement('INSERT INTO boards(id,title,view_json) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,view_json=excluded.view_json').run(id, title, view);
            changed = true;
          }
          if(data.attributes!==undefined){
            check(data.attributes&&typeof data.attributes==='object'&&!Array.isArray(data.attributes),'Invalid board attributes');
            const attributes=canonicalJSON(data.attributes);check(Buffer.byteLength(attributes)<=65536,'Board attributes too large');
            const key='board:'+id,previous=this.statement('SELECT value FROM meta WHERE key=?').get(key);
            if(previous?.value!==attributes){this.statement('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,attributes);changed=true;}
          }
        } else if(operation.type==='deleteCatalog'){
          check(operation.kind==='folder','Unsupported catalog deletion');
          const result=this.statement('DELETE FROM meta WHERE key=?').run('folder:'+identifier(operation.id,'folder ID'));
          changed ||= Number(result.changes)>0;
        } else if(operation.type==='putCatalog'){
          check(['folder','whiteboard-instance','instance','card','tag','card-tag','remark'].includes(operation.kind),'Invalid catalog kind');const data=operation.data,id=identifier(data?.id,'catalog ID');
          if(operation.kind==='folder'){text(data.name,'folder name',255);check(Array.isArray(data.whiteboardInstanceIds),'Invalid folder references');for(const ref of data.whiteboardInstanceIds)identifier(ref,'board instance ID');}
          else if(operation.kind==='whiteboard-instance'){const boardId=identifier(data.whiteboardId,'whiteboard ID');check(!!this.statement('SELECT id FROM boards WHERE id=?').get(boardId),'Catalog whiteboard is missing');}
          else if(['card','remark'].includes(operation.kind))check(!!this.statement('SELECT id FROM contents WHERE id=?').get(id),'Catalog content is missing');
          else if(operation.kind==='instance')check(!!this.statement('SELECT id FROM instances WHERE id=?').get(id),'Catalog instance is missing');
          else if(operation.kind==='tag')text(data.name,'tag name',255);
          else if(operation.kind==='card-tag'){identifier(data.cardId,'tagged card ID');identifier(data.tagId,'tag ID');}
          const value=canonicalJSON(data),key=operation.kind+':'+id,old=this.statement('SELECT value FROM meta WHERE key=?').get(key);
          if(old?.value!==value){this.statement('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);changed=true;}
        } else throw new PersistenceError('INVALID_REQUEST', 'Unknown commit operation');
      }
      const revision = current + (changed ? 1 : 0);
      check(Number.isSafeInteger(revision), 'Workspace revision limit reached');
      if (changed) this.statement('UPDATE meta SET value=? WHERE key=?').run(String(revision), 'revision');
      const ack = { workspaceId: this.workspaceId, requestId: request.requestId, revision, changed, contentRevisions, committedAt: new Date().toISOString() };
      this.statement('INSERT INTO commit_receipts(request_id,request_hash,ack_json) VALUES (?,?,?)').run(request.requestId, hash, canonicalJSON(ack));
      // Only after this succeeds may the worker/IPC promise resolve with ACK.
      this.db.exec('COMMIT');
      return ack;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  history({method,payload}) {
    if(this.closed)throw new PersistenceError('DATABASE_CLOSED','InkBridge database is closed');
    return require('./history-tabs.cjs').historyTabs(this.db,method,payload);
  }

  close() {
    if (this.closed) return;
    this.statements.clear();
    this.db.close();
    this.closed = true;
  }
}

module.exports = { WorkspaceDatabase, PersistenceError, APPLICATION_ID, SCHEMA_VERSION };
