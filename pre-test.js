import PackageJson from '@npmcli/package-json';
import fs from 'fs';

// update package.json
const updatePackageJson = async () => {
  const pkgJson = await PackageJson.load('./');
  pkgJson.update({ type: undefined });
  await pkgJson.save();
};

// update tsconfig.spec.json
const updateTsconfig = async () => {
  const tsconfigFilePath = './tsconfig.spec.json';
  const tsconfigJson = JSON.parse(fs.readFileSync(tsconfigFilePath));
  tsconfigJson.compilerOptions.module = 'commonjs';
  fs.writeFileSync(tsconfigFilePath, JSON.stringify(tsconfigJson, null, 2) + '\n');
};

// combine pre-test subscripts
const runPreTest = async () => {
  await updatePackageJson();
  await updateTsconfig();
};

// run pre-test subscripts
runPreTest();
