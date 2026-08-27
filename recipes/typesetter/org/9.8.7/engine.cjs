'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const EMACS_BIN = process.env.EMACS_BIN || 'emacs';
const ORG_LISP_DIR = process.env.ORG_LISP_DIR || '/opt/org/lisp';
const LATEXMK_BIN = process.env.LATEXMK_BIN || 'latexmk';

const OUTPUT_BASE = 'chelys-output';
const LATEX_ENGINES = new Set(['pdflatex', 'lualatex', 'xelatex']);

const TARGETS = {
	pdf: {
		backend: 'latex',
		module: 'ox-latex',
		extension: 'pdf',
		mimeType: 'application/pdf',
	},
	html: {
		backend: 'html',
		module: 'ox-html',
		extension: 'html',
		mimeType: 'text/html',
	},
	latex: {
		backend: 'latex',
		module: 'ox-latex',
		extension: 'tex',
		mimeType: 'application/x-tex',
	},
	markdown: {
		backend: 'md',
		module: 'ox-md',
		extension: 'md',
		mimeType: 'text/markdown',
	},
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

function lispString(value) {
	return JSON.stringify(String(value));
}

async function exists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

function latexEngine(options) {
	const requested = String(options.latexEngine || 'pdflatex').trim().toLowerCase();
	return LATEX_ENGINES.has(requested) ? requested : 'pdflatex';
}

function exportExpression(sourcePath, outputPath, spec, options) {
	const evaluateBabel = isTrue(options.babel);
	const engine = latexEngine(options);
	const latexConfig = spec.backend === 'latex'
		? `(setq org-latex-compiler ${lispString(engine)})`
		: '';

	return [
		'(progn',
		"  (require 'org)",
		`  (require '${spec.module})`,
		`  (setq org-export-use-babel ${evaluateBabel ? 't' : 'nil'})`,
		`  (setq org-confirm-babel-evaluate ${evaluateBabel ? 'nil' : 't'})`,
		`  ${latexConfig}`,
		`  (find-file ${lispString(sourcePath)})`,
		`  (org-export-to-file '${spec.backend} ${lispString(outputPath)}))`,
	].filter((line) => line.trim()).join('\n');
}

async function exportWithEmacs(sourcePath, outputPath, spec, options, workDir) {
	const expression = exportExpression(sourcePath, outputPath, spec, options);
	return run(
		EMACS_BIN,
		['-Q', '--batch', '-L', ORG_LISP_DIR, '--eval', expression],
		workDir,
	);
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = isTrue(options.export);
	const requested = format === 'canvas-pdf' ? 'pdf' : format;
	const target = TARGETS[requested] ? requested : 'pdf';
	const spec = TARGETS[target];
	const sourcePath = path.join(workDir, mainFile);

	if (!(await exists(sourcePath))) {
		return {
			status: 1,
			log: `Could not find Org source file: ${mainFile}`,
			format,
		};
	}

	if (target !== 'pdf' && !isExport) {
		return {
			status: 1,
			log: `The ${target} target is download-only. Use Export to download it.`,
			format,
		};
	}

	const sourceDir = path.dirname(sourcePath);
	const outputPath = path.join(sourceDir, `${OUTPUT_BASE}.${spec.extension}`);
	await fs.rm(outputPath, { force: true });

	if (target !== 'pdf') {
		const build = await exportWithEmacs(sourcePath, outputPath, spec, options, workDir);
		if (build.status !== 0) {
			return { status: build.status, log: build.log, format };
		}
		if (!(await exists(outputPath))) {
			return {
				status: 1,
				log: `${build.log}\nOrg export completed without producing ${path.basename(outputPath)}.`,
				format,
			};
		}

		return {
			status: 0,
			log: build.log,
			format: target,
			mimeType: spec.mimeType,
			outputPath: path.relative(workDir, outputPath),
		};
	}

	const texPath = path.join(sourceDir, `${OUTPUT_BASE}.tex`);
	await fs.rm(texPath, { force: true });

	const exported = await exportWithEmacs(sourcePath, texPath, spec, options, workDir);
	if (exported.status !== 0) {
		return { status: exported.status, log: exported.log, format };
	}
	if (!(await exists(texPath))) {
		return {
			status: 1,
			log: `${exported.log}\nOrg LaTeX export completed without producing ${path.basename(texPath)}.`,
			format,
		};
	}

	const engine = latexEngine(options);
	const engineFlag = {
		pdflatex: '-pdf',
		lualatex: '-lualatex',
		xelatex: '-xelatex',
	}[engine];
	const compiled = await run(
		LATEXMK_BIN,
		[
			'-f',
			engineFlag,
			'-interaction=nonstopmode',
			'-halt-on-error',
			'-file-line-error',
			'-outdir=.',
			path.basename(texPath),
		],
		sourceDir,
	);

	const log = [exported.log, compiled.log].filter(Boolean).join('\n');
	if (compiled.status !== 0) {
		return { status: compiled.status, log, format };
	}
	if (!(await exists(outputPath))) {
		return {
			status: 1,
			log: `${log}\nlatexmk completed without producing ${path.basename(outputPath)}.`,
			format,
		};
	}

	return {
		status: 0,
		log,
		format: format || 'pdf',
		mimeType: spec.mimeType,
		outputPath: path.relative(workDir, outputPath),
	};
};
