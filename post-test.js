const PackageJson = require('@npmcli/package-json');

const run = async () => {
  const pkgJson = await PackageJson.load('./');
  pkgJson.update({ type: 'module' });
  await pkgJson.save();
};

run();
