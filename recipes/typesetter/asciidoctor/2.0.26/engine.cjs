'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const ASCIIDOCTOR_BIN = process.env.ASCIIDOCTOR_BIN || 'asciidoctor';
const ASCIIDOCTOR_PDF_BIN = process.env.ASCIIDOCTOR_PDF_BIN || 'asciidoctor-pdf';
const ASCIIDOCTOR_EPUB_BIN =
	process.env.ASCIIDOCTOR_EPUB_BIN || 'asciidoctor-epub3';
const ASCIIDOCTOR_REVEALJS_BIN =
	process.env.ASCIIDOCTOR_REVEALJS_BIN || 'asciidoctor-revealjs';
const PANDOC_BIN = process.env.PANDOC_BIN || 'pandoc';

const OUTPUT_BASE = '.chelys-output';
const DOCBOOK_INTERMEDIATE = '.chelys-docbook.xml';

const TARGETS = {
	pdf: {
		command: ASCIIDOCTOR_PDF_BIN,
		extension: 'pdf',
		mimeType: 'application/pdf',
	},
	html: {
		command: ASCIIDOCTOR_BIN,
		backend: 'html5',
		extension: 'html',
		mimeType: 'text/html',
		attributes: ['data-uri'],
	},
	epub: {
		command: ASCIIDOCTOR_EPUB_BIN,
		extension: 'epub',
		mimeType: 'application/epub+zip',
	},
	revealjs: {
		command: ASCIIDOCTOR_REVEALJS_BIN,
		extension: 'html',
		mimeType: 'text/html',
	},
	docx: {
		command: ASCIIDOCTOR_BIN,
		backend: 'docbook',
		extension: 'docx',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

function commonArgs(target, options) {
	const args = [];

	if (isTrue(options.extensions ?? true)) {
		args.push('-r', 'asciidoctor-diagram', '-r', 'asciidoctor-bibtex');
	}

	args.push(
		'--safe-mode',
		isTrue(options.safeMode ?? true) ? 'safe' : 'unsafe',
	);

	const doctype = String(options.doctype || '').trim();
	if (doctype) {
		args.push('--doctype', doctype);
	}

	if (target.backend) {
		args.push('--backend', target.backend);
	}

	for (const attribute of target.attributes || []) {
		args.push('-a', attribute);
	}

	for (const attribute of String(options.attributes || '').trim().split(/\s+/)) {
		if (attribute) {
			args.push('-a', attribute);
		}
	}

	return args;
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = isTrue(options.export);
	const requested = format === 'canvas-pdf' ? 'pdf' : format;
	const target = TARGETS[requested] ? requested : 'pdf';

	try {
		await fs.access(path.join(workDir, mainFile));
	} catch {
		return {
			status: 1,
			log: `Could not find AsciiDoc source file: ${mainFile}`,
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

	const spec = TARGETS[target];
	const intermediate = target === 'docx' ? DOCBOOK_INTERMEDIATE : null;
	const outputName = intermediate || `${OUTPUT_BASE}.${spec.extension}`;
	const outputPath = path.join(workDir, outputName);

	await fs.rm(outputPath, { force: true });

	const args = commonArgs(spec, options);
	if (target === 'pdf' && isTrue(options.optimize)) {
		args.push('--optimize');
	}
	args.push('-o', outputPath, mainFile);

	const build = await run(spec.command, args, workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	try {
		await fs.access(outputPath);
	} catch {
		return {
			status: 1,
			log: `${build.log}\n${spec.command} completed without producing ${outputName}.`,
			format,
		};
	}

	if (!intermediate) {
		return {
			status: 0,
			log: build.log,
			format: target === 'pdf' ? format || 'pdf' : target,
			mimeType: spec.mimeType,
			outputPath: outputName,
		};
	}

	const converted = `${OUTPUT_BASE}.${spec.extension}`;
	const convert = await run(
		PANDOC_BIN,
		['-f', 'docbook', '-t', 'docx', '-o', converted, intermediate],
		workDir,
	);
	if (convert.status !== 0) {
		return {
			status: convert.status,
			log: `${build.log}\nFailed to convert DocBook to DOCX:\n${convert.log}`,
			format,
		};
	}

	return {
		status: 0,
		log: `${build.log}\nConverted DocBook to DOCX with pandoc.`,
		format: target,
		mimeType: spec.mimeType,
		outputPath: converted,
	};
};
