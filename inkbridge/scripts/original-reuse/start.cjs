const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),privateRoot=path.join(root,'private-original-editor');
if(!fs.existsSync(path.join(privateRoot,'register-original.js')))throw Error('Prepare original sources and run collect.cjs before starting');
const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:process.env.INKBRIDGE_ORIGINAL_PROBE_DATA||path.join(privateRoot,'profiles','desktop')};delete env.ELECTRON_RUN_AS_NODE;
const args=[path.join(__dirname,'host.cjs')];
if(env.INKBRIDGE_ORIGINAL_PROBE_DEBUG_PORT){const port=Number(env.INKBRIDGE_ORIGINAL_PROBE_DEBUG_PORT);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid test debugger port');args.unshift(`--remote-debugging-port=${port}`);}
const child=spawn(require('electron'),args,{env,stdio:'inherit'});child.on('exit',code=>{process.exitCode=code??1;});
