'use client';

import * as pdfjs from 'pdfjs-dist';

import workerSrc from 'pdfjs-dist/build/pdf.worker.entry?worker';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const withPDFDocument = async (source, callback) => {
	let blobUrl = '';
	let loadingTask;

	try {
		const documentSource =
			typeof Blob !== 'undefined' && source instanceof Blob
				? ((blobUrl = URL.createObjectURL(source)), blobUrl)
				: String(source || '').trim();

		if (!documentSource) {
			return undefined;
		}

		loadingTask = pdfjs.getDocument(documentSource);
		const pdf = await loadingTask.promise;
		return await callback(pdf);
	} catch (_error) {
		return undefined;
	} finally {
		if (loadingTask?.destroy) {
			try {
				await loadingTask.destroy();
			} catch {
				// Ignore cleanup failures.
			}
		}
		if (blobUrl) {
			URL.revokeObjectURL(blobUrl);
		}
	}
};

export const extractTextFromPDF = async (file) => {
	return withPDFDocument(file, async (pdf) => {
		const { numPages } = pdf;
		let extractedText = '';

		for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
			const page = await pdf.getPage(pageNumber);

			const textContent = await page.getTextContent();
			const pageText = textContent.items
				.map((item) => ('str' in item ? item.str : ''))
				.join(' ');
			extractedText += pageText;
		}
		return extractedText.length > 0 ? extractedText : undefined;
	});
};

export const renderPDFPageToDataUri = async (
	source,
	{ pageNumber = 1, scale = 1.2 } = {},
) => {
	if (typeof document === 'undefined') {
		return undefined;
	}

	return withPDFDocument(source, async (pdf) => {
		const targetPage = Math.max(1, Math.min(Number(pageNumber) || 1, pdf.numPages || 1));
		const page = await pdf.getPage(targetPage);
		const viewport = page.getViewport({ scale });
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');

		if (!context) {
			return undefined;
		}

		canvas.width = Math.max(1, Math.floor(viewport.width));
		canvas.height = Math.max(1, Math.floor(viewport.height));
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);

		await page.render({
			canvasContext: context,
			viewport,
		}).promise;

		return canvas.toDataURL('image/png');
	});
};
