const fs = require('fs');
const path = require('path');
function walk(dir) {
	fs.readdirSync(dir).forEach(file => {
		let fullPath = path.join(dir, file);
		if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
		else if (fullPath.endsWith('.xml')) {
			let content = fs.readFileSync(fullPath, 'utf8');
			if (content.includes('type="Number"') || content.includes('type="number"')) {
				content = content.replace(/type="[nN]umber"/g, 'type="Text"');
				fs.writeFileSync(fullPath, content);
				console.log('Fixed ' + fullPath);
			}
		}
	});
}
walk('webapp/view');
