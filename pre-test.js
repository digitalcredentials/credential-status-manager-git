import PackageJson from '@npmcli/package-json';

const run = async () => {
  const pkgJson = await PackageJson.load('./');
  pkgJson.update({ type: undefined });
  await pkgJson.save();
};

run();
