'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const QUARTO_BIN = process.env.QUARTO_BIN || 'quarto';

const OUTPUT_BASE = 'chelys-output';
const PROJECT_FILES = ['_quarto.yml', '_quarto.yaml'];
const IGNORED_DIRS = new Set(['.cache', '.git', '_freeze', 'node_modules']);

const TARGETS = {
	pdf: { to: 'pdf', extension: 'pdf', mimeType: 'application/pdf' },
	typst: { to: 'typst', extension: 'pdf', mimeType: 'application/pdf' },
	beamer: { to: 'beamer', extension: 'pdf', mimeType: 'application/pdf' },
	html: {
		to: 'html',
		extension: 'html',
		mimeType: 'text/html',
		embedResources: true,
	},
	revealjs: {
		to: 'revealjs',
		extension: 'html',
		mimeType: 'text/html',
		embedResources: true,
	},
	docx: {
		to: 'docx',
		extension: 'docx',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	},
	pptx: {
		to: 'pptx',
		extension: 'pptx',
		mimeType:
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	},
	epub: { to: 'epub', extension: 'epub', mimeType: 'application/epub+zip' },
};

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env: process.env });
		const chunks = [];
		child.stdout.on('data', (chunk) => chunks.push(chunk));
		child.stderr.on('data', (chunk) => chunks.push(chunk));
		child.on('error', (error) =>
			resolve({
				status: 1,
				log: `${Buffer.concat(chunks).toString('utf8')}${error.message}`,
			}),
		);
		child.on('close', (code) =>
			resolve({
				status: code ?? 1,
				log: Buffer.concat(chunks).toString('utf8'),
			}),
		);
	});
}

function isTrue(value) {
	return value === true || value === 'true';
}

async function exists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function isProject(workDir) {
	for (const candidate of PROJECT_FILES) {
		if (await exists(path.join(workDir, candidate))) {
			return true;
		}
	}
	return false;
}

async function findNewest(workDir, extension, since) {
	const entries = await fs.readdir(workDir, {
		withFileTypes: true,
		recursive: true,
	});

	let newest = null;
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.toLowerCase().endsWith(`.${extension}`)) {
			continue;
		}
		const parent = entry.parentPath ?? entry.path;
		if (path.relative(workDir, parent).split(path.sep).some((segment) => IGNORED_DIRS.has(segment))) {
			continue;
		}
		const full = path.join(parent, entry.name);
		const stats = await fs.stat(full);
		if (stats.mtimeMs < since) {
			continue;
		}
		if (!newest || stats.mtimeMs > newest.mtimeMs) {
			newest = { path: full, mtimeMs: stats.mtimeMs };
		}
	}

	return newest ? newest.path : null;
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = isTrue(options.export);
	const requested = format === 'canvas-pdf' ? 'pdf' : format;
	const target = TARGETS[requested] ? requested : 'pdf';
	const spec = TARGETS[target];

	try {
		await fs.access(path.join(workDir, mainFile));
	} catch {
		return {
			status: 1,
			log: `Could not find Quarto source file: ${mainFile}`,
			format,
		};
	}

	if (spec.extension !== 'pdf' && !isExport) {
		return {
			status: 1,
			log: `The ${target} target is download-only. Use Export to download it.`,
			format,
		};
	}

	const project = await isProject(workDir);
	const outputName = `${OUTPUT_BASE}.${spec.extension}`;
	const args = ['render', mainFile, '--to', spec.to];

	if (!project) {
		args.push('--output', outputName);
	}

	if (spec.embedResources) {
		args.push('-M', 'embed-resources:true');
	}

	if (!isTrue(options.execute ?? true)) {
		args.push('--no-execute');
	}
	if (isTrue(options.cacheRefresh)) {
		args.push('--cache-refresh');
	}

	const profile = String(options.profile || '').trim();
	if (profile) {
		args.push('--profile', profile);
	}

	const startedAt = Date.now() - 1000;
	const build = await run(QUARTO_BIN, args, workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	let artifact = null;
	if (!project) {
		const direct = path.join(workDir, path.dirname(mainFile), outputName);
		if (await exists(direct)) {
			artifact = direct;
		}
	}
	if (!artifact) {
		artifact = await findNewest(workDir, spec.extension, startedAt);
	}

	if (!artifact) {
		return {
			status: 1,
			log: `${build.log}\nquarto render completed without producing a .${spec.extension} artifact.`,
			format,
		};
	}

	return {
		status: 0,
		log: build.log,
		format: spec.extension === 'pdf' && target === 'pdf' ? format || 'pdf' : target,
		mimeType: spec.mimeType,
		outputPath: path.relative(workDir, artifact),
	};
};
