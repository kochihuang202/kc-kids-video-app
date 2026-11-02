const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'private-publisher/key.pem');
fs.mkdirSync(path.dirname(file),{recursive:true});
if(!fs.existsSync(file)){const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072});fs.writeFileSync(file,privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});}
const key=crypto.createPublicKey(fs.readFileSync(file)),jwk=key.export({format:'jwk'});
const pub={algorithm:'RSA-SHA256',pem:key.export({type:'spki',format:'pem'}),modulus:Buffer.from(jwk.n,'base64url').toString('base64'),exponent:Buffer.from(jwk.e,'base64url').toString('base64')};
fs.writeFileSync(path.join(root,'src/main/publisher-public.json'),JSON.stringify(pub,null,2));
console.log('Publisher key prepared locally; only public key written to source.');
