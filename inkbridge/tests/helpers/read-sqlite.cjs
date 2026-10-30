// An independent standard SQLite reader, outside Playwright's module loader.
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(process.argv[2],{readOnly:true});
try{
  if(db.prepare('PRAGMA application_id').get().application_id!==0x494e4b42)throw Error('Not an InkBridge database');
  console.log(JSON.stringify(db.prepare('SELECT body,document_json FROM contents WHERE id=?').get(process.argv[3])));
}finally{db.close();}
