const fs = require('fs');
const path = require('path');
const dir = 'c:/Fiori/zgpms/webapp/controller';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(f => {
    let p = path.join(dir, f);
    let code = fs.readFileSync(p, 'utf8');
    
    if (code.includes('Fragment.load') || code.includes('Fragment.byId')) {
        if (!code.includes('"sap/ui/core/Fragment"')) {
            console.log('Fixing: ' + f);
            let regex = /sap\.ui\.define\(\[\s*([\s\S]*?)\s*\],\s*function\s*\(([\s\S]*?)\)\s*\{/;
            let match = code.match(regex);
            if (match) {
                let arrayStr = match[1];
                let funcArgs = match[2];
                
                let newArrayStr = arrayStr + ',\n\t"sap/ui/core/Fragment"';
                let newFuncArgs = funcArgs + ', Fragment';
                
                let newDef = 'sap.ui.define([' + newArrayStr + '\n], function (' + newFuncArgs + ') {';
                code = code.replace(match[0], newDef);
                fs.writeFileSync(p, code);
                console.log('Updated ' + f);
            }
        } else {
             console.log('Already has Fragment: ' + f);
        }
    }
});
