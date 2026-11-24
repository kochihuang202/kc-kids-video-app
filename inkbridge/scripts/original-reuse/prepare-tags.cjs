// Reuse the audited inert factory recovery, with the full 1.1.70 tag parents.
const path=require('node:path');
const {prepareDiaryTodos}=require('./prepare-diary-todos.cjs');
const seeds=['82138','72309','14656','27677','76776','27359','96414','52896','12348','50374','58059','40883'];
if(require.main===module){try{
 console.log(JSON.stringify(prepareDiaryTodos(process.argv[2]||path.join(process.env.LOCALAPPDATA,'Programs/flexnote/resources/app.asar'),{folder:'tag-source',seeds})));
}catch(error){console.error(error);process.exitCode=1;}}
