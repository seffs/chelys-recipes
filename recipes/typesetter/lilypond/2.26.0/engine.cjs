'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const LILYPOND_BIN = process.env.LILYPOND_BIN || 'lilypond';
const FLUIDSYNTH_BIN = process.env.FLUIDSYNTH_BIN || 'fluidsynth';
const LAME_BIN = process.env.LAME_BIN || 'lame';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const SOUNDFONT = process.env.SOUNDFONT || '/usr/share/sounds/sf2/FluidR3_GM.sf2';

const OUTPUT_BASE = 'chelys-output';
const EXPORT_ARCHIVE = '.chelys-export.zip';

const BACKENDS = {
	pdf: ['--pdf'],
	png: ['--png'],
	svg: ['-dbackend=svg'],
	midi: ['--pdf'],
	mp3: ['--pdf'],
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

async function collect(workDir, extension) {
	const entries = await fs.readdir(workDir, { withFileTypes: true });
	return entries
		.filter(
			(entry) =>
				entry.isFile() &&
				entry.name.startsWith(OUTPUT_BASE) &&
				entry.name.toLowerCase().endsWith(extension),
		)
		.map((entry) => entry.name)
		.sort();
}

async function findMidi(workDir) {
	for (const candidate of [`${OUTPUT_BASE}.midi`, `${OUTPUT_BASE}.mid`]) {
		if (await exists(path.join(workDir, candidate))) {
			return candidate;
		}
	}
	const generated = await collect(workDir, '.midi');
	return generated[0] || null;
}

async function archive(workDir, files) {
	await fs.rm(path.join(workDir, EXPORT_ARCHIVE), { force: true });
	return run(PYTHON_BIN, ['-m', 'zipfile', '-c', EXPORT_ARCHIVE, ...files], workDir);
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = isTrue(options.export);
	const requested = format === 'canvas-pdf' ? 'pdf' : format;
	const target = BACKENDS[requested] ? requested : 'pdf';

	try {
		await fs.access(path.join(workDir, mainFile));
	} catch {
		return {
			status: 1,
			log: `Could not find LilyPond source file: ${mainFile}`,
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

	const args = [...BACKENDS[target], '-o', OUTPUT_BASE];

	if (!isTrue(options.pointAndClick)) {
		args.push('-dno-point-and-click');
	}
	if (isTrue(options.crop)) {
		args.push('-dcrop');
	}
	if (target === 'png') {
		const resolution = Number(options.resolution) || 300;
		args.push(`-dresolution=${resolution}`);
	}

	const paperSize = String(options.paperSize || '').trim();
	if (paperSize) {
		args.push(`-dpaper-size="${paperSize}"`);
	}

	args.push(mainFile);

	const build = await run(LILYPOND_BIN, args, workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	if (target === 'pdf') {
		const cropped = `${OUTPUT_BASE}.cropped.pdf`;
		const plain = `${OUTPUT_BASE}.pdf`;
		const engraved =
			isTrue(options.crop) && (await exists(path.join(workDir, cropped)))
				? cropped
				: plain;

		if (!(await exists(path.join(workDir, engraved)))) {
			return {
				status: 1,
				log: `${build.log}\nLilyPond completed without producing ${engraved}.`,
				format,
			};
		}

		const artifacts = [];
		const midi = await findMidi(workDir);
		if (midi) {
			artifacts.push({
				id: 'midi',
				name: midi,
				mimeType: 'audio/midi',
				outputPath: midi,
			});
		}

		return {
			status: 0,
			log: build.log,
			format: format || 'pdf',
			mimeType: 'application/pdf',
			outputPath: engraved,
			artifacts,
		};
	}

	if (target === 'png' || target === 'svg') {
		const files = await collect(workDir, `.${target}`);
		if (files.length === 0) {
			return {
				status: 1,
				log: `${build.log}\nLilyPond completed without producing any ${target.toUpperCase()} pages.`,
				format,
			};
		}
		const zip = await archive(workDir, files);
		if (zip.status !== 0) {
			return {
				status: 1,
				log: `${build.log}\nFailed to archive the ${target.toUpperCase()} pages:\n${zip.log}`,
				format,
			};
		}
		return {
			status: 0,
			log: `${build.log}\nArchived ${files.length} ${target.toUpperCase()} page(s) for download.`,
			format: 'zip',
			mimeType: 'application/zip',
			outputPath: EXPORT_ARCHIVE,
		};
	}

	const midi = await findMidi(workDir);
	if (!midi) {
		return {
			status: 1,
			log: `${build.log}\nNo MIDI file was produced. Add a \\midi block to the score to enable audio output.`,
			format,
		};
	}

	if (target === 'midi') {
		return {
			status: 0,
			log: build.log,
			format: 'midi',
			mimeType: 'audio/midi',
			outputPath: midi,
		};
	}

	const wav = `${OUTPUT_BASE}.wav`;
	const mp3 = `${OUTPUT_BASE}.mp3`;

	const synth = await run(
		FLUIDSYNTH_BIN,
		['-ni', '-F', wav, '-r', '44100', SOUNDFONT, midi],
		workDir,
	);
	if (synth.status !== 0) {
		return {
			status: synth.status,
			log: `${build.log}\nFailed to synthesise ${midi}:\n${synth.log}`,
			format,
		};
	}

	const encode = await run(LAME_BIN, ['--quiet', '-V', '2', wav, mp3], workDir);
	if (encode.status !== 0) {
		return {
			status: encode.status,
			log: `${build.log}\nFailed to encode ${wav}:\n${encode.log}`,
			format,
		};
	}

	return {
		status: 0,
		log: `${build.log}\nSynthesised ${midi} and encoded it as MP3.`,
		format: 'mp3',
		mimeType: 'audio/mpeg',
		outputPath: mp3,
	};
};
