// scripts/publish-matrix.cjs
const fs = require('node:fs');
const path = require('node:path');

const RECIPES_DIR = 'recipes';
const REGISTRY_PREFIX = 'ghcr.io/';
const DEFAULT_PLATFORMS = ['linux/amd64'];
const SEMVER_DIR = /^\d+\.\d+\.\d+/;

function versionDirs(recipePath) {
  return fs
    .readdirSync(recipePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && SEMVER_DIR.test(dirent.name))
    .map((dirent) => dirent.name)
    .filter((name) => fs.existsSync(path.join(recipePath, name, 'recipe.json')));
}

function dockerMode(manifest) {
  return (manifest.modes ?? []).find((mode) => mode.kind === 'docker');
}

function collect() {
  const include = [];

  for (const categoryId of fs.readdirSync(RECIPES_DIR)) {
    const categoryPath = path.join(RECIPES_DIR, categoryId);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    for (const recipeId of fs.readdirSync(categoryPath)) {
      const recipePath = path.join(categoryPath, recipeId);
      if (!fs.statSync(recipePath).isDirectory()) continue;

      for (const version of versionDirs(recipePath)) {
        const context = path.posix.join(categoryPath, recipeId, version);
        const manifest = JSON.parse(
          fs.readFileSync(path.join(context, 'recipe.json'), 'utf8'),
        );
        const mode = dockerMode(manifest);
        const image = mode?.image ?? '';

        if (!image.startsWith(REGISTRY_PREFIX)) continue;

        if (manifest.version !== version) {
          throw new Error(
            `Recipe "${recipeId}" declares version ${manifest.version} in ${context}`,
          );
        }

        if (!image.endsWith(`:${version}`)) {
          throw new Error(
            `Recipe "${recipeId}" publishes ${image}, expected tag :${version}`,
          );
        }

        const dockerfile = path.posix.join(context, 'Dockerfile');

        if (!fs.existsSync(dockerfile)) {
          throw new Error(`Recipe "${recipeId}" has no Dockerfile in ${context}`);
        }

        include.push({
          name: `${recipeId}-${version}`,
          image,
          repo: image.slice(0, image.lastIndexOf(':')),
          context,
          dockerfile,
          platforms: (mode.platforms ?? DEFAULT_PLATFORMS).join(','),
        });
      }
    }
  }

  return include;
}

const include = collect();

if (include.length === 0) {
  console.error('No publishable recipes found');
  process.exit(1);
}

process.stdout.write(`matrix=${JSON.stringify({ include })}\n`);
