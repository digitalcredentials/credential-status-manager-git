import fs from 'fs';
const wd = process.cwd();
const packageJsonFileName = 'package.json';
const packageJsonFilePath = `${wd}/${packageJsonFileName}`;
import json from packageJsonFilePath;
json.type = 'module';
fs.writeFileSync(packageJsonFilePath, JSON.stringify(json, null, 2))
