// Settings-only helper: no application host, database, note or attachment access.
// stdout is consumed privately by check-panel; never run it as a user report.
const {app,safeStorage}=require('electron'),path=require('node:path');
const source=process.env.INKBRIDGE_TEST_SHARE_DEVICE;
if(!source)throw Error('A configured device filename is required');
app.setPath('userData',path.dirname(source));
app.whenReady().then(async()=>{
 const credentials=require('../../src/main/share-credentials.cjs').createShareCredentials({filename:source,safeStorage}),config=await credentials.clientConfig();
 const api=require('../../src/main/share-client.cjs').createShareClient({...config,jobDirectory:path.join(app.getPath('temp'),'inkbridge-share-pairing-unused')});
 const receipt=await api.createPairing();process.stdout.write(JSON.stringify({baseUrl:config.baseUrl,code:receipt.code}));app.quit();
}).catch(error=>{process.stderr.write(error.message);app.exit(1);});
