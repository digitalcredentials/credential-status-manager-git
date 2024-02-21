const PackageJson = require('@npmcli/package-json');
const fs = require('fs');

// update package.json
const updatePackageJson = async () => {
  const pkgJson = await PackageJson.load('./');
  pkgJson.update({ type: 'module' });
  await pkgJson.save();
};

// update tsconfig.spec.json
const updateTsconfig = async () => {
  const tsconfigFilePath = './tsconfig.spec.json';
  const tsconfigJson = require(tsconfigFilePath);
  tsconfigJson.compilerOptions.module = 'es2022';
  fs.writeFileSync(tsconfigFilePath, JSON.stringify(tsconfigJson, null, 2) + '\n');
};

// combine post-test subscripts
const runPostTest = async () => {
  await updatePackageJson();
  await updateTsconfig();
};

// run post-test subscripts
runPostTest();
