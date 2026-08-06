'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const SPHINX_BUILD_BIN = process.env.SPHINX_BUILD_BIN || 'sphinx-build';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

const CONFIG = 'conf.py';
const BUILD_DIR = '_build/chelys';
const EXPORT_ARCHIVE = '.chelys-export.zip';

const CANDIDATE_SOURCES = ['.', 'source', 'doc', 'docs', 'docs/source'];

const BUILDERS = {
	pdf: { builder: 'latexpdf', subdir: 'latex', extension: '.pdf' },
	html: { builder: 'html', subdir: 'html', archive: true },
	epub: { builder: 'epub', subdir: 'epub', extension: '.epub' },
	latex: { builder: 'latex', subdir: 'latex', archive: true },
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

async function resolveSource(workDir, mainFile, requested) {
	if (requested) {
		if (await exists(path.join(workDir, requested, CONFIG))) {
			return requested;
		}
		throw new Error(`No ${CONFIG} found in "${requested}".`);
	}

	const candidates = [path.posix.dirname(mainFile || '.'), ...CANDIDATE_SOURCES];
	for (const candidate of candidates) {
		const normalised = candidate === '' ? '.' : candidate;
		if (await exists(path.join(workDir, normalised, CONFIG))) {
			return normalised;
		}
	}

	throw new Error(
		`No ${CONFIG} found at the project root or in ${CANDIDATE_SOURCES.slice(1).join(', ')}. Sphinx builds a configured project, not a single file; "sphinx-quickstart" scaffolds one.`,
	);
}

async function findByExtension(dir, extension) {
	const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
	const match = entries.find(
		(entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension),
	);
	return match ? path.join(match.parentPath ?? match.path, match.name) : null;
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = isTrue(options.export);
	const requested = format === 'canvas-pdf' ? 'pdf' : format;
	const target = BUILDERS[requested] ? requested : 'pdf';
	const spec = BUILDERS[target];

	if (target !== 'pdf' && !isExport) {
		return {
			status: 1,
			log: `The ${target} target is download-only. Use Export to download it.`,
			format,
		};
	}

	let sourceDir;
	try {
		sourceDir = await resolveSource(
			workDir,
			mainFile,
			String(options.sourceDir || '').trim(),
		);
	} catch (error) {
		return { status: 1, log: error.message, format };
	}

	const args = ['-M', spec.builder, sourceDir, BUILD_DIR];

	if (isTrue(options.freshEnv)) {
		args.push('-E');
	}
	if (isTrue(options.nitpicky)) {
		args.push('-n');
	}
	if (isTrue(options.warningsAsErrors)) {
		args.push('-W', '--keep-going');
	}
	if (isTrue(options.parallel ?? true)) {
		args.push('-j', 'auto');
	}

	const build = await run(SPHINX_BUILD_BIN, args, workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	const outputDir = path.join(workDir, BUILD_DIR, spec.subdir);
	if (!(await exists(outputDir))) {
		return {
			status: 1,
			log: `${build.log}\nThe ${spec.builder} builder completed without producing ${BUILD_DIR}/${spec.subdir}.`,
			format,
		};
	}

	if (!spec.archive) {
		const artifact = await findByExtension(outputDir, spec.extension);
		if (!artifact) {
			return {
				status: 1,
				log: `${build.log}\nNo ${spec.extension} file found in ${BUILD_DIR}/${spec.subdir}.`,
				format,
			};
		}
		return {
			status: 0,
			log: build.log,
			format: target === 'pdf' ? format || 'pdf' : target,
			mimeType:
				target === 'pdf' ? 'application/pdf' : 'application/epub+zip',
			outputPath: path.relative(workDir, artifact),
		};
	}

	const archive = path.join(workDir, EXPORT_ARCHIVE);
	await fs.rm(archive, { force: true });
	const zip = await run(PYTHON_BIN, ['-m', 'zipfile', '-c', archive, '.'], outputDir);
	if (zip.status !== 0) {
		return {
			status: 1,
			log: `${build.log}\nFailed to archive ${BUILD_DIR}/${spec.subdir}:\n${zip.log}`,
			format,
		};
	}

	return {
		status: 0,
		log: `${build.log}\nArchived ${BUILD_DIR}/${spec.subdir} for download.`,
		format: 'zip',
		mimeType: 'application/zip',
		outputPath: EXPORT_ARCHIVE,
	};
};
