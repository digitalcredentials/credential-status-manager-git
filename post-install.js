const fs = require('fs');
const wd = process.cwd();
const packageJsonFileName = 'package.json';
const packageJsonFilePath = `${wd}/${packageJsonFileName}`;
const json = require(packageJsonFilePath);
json.type = 'module';
fs.writeFileSync(packageJsonFilePath, JSON.stringify(json, null, 2))

