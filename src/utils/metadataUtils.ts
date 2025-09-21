import * as fs from 'fs';
import * as path from 'path';

export interface MetadataResponse {
	responseType: 'success' | 'error';
	timeGenerated?: string;
	error?: string;
}

export interface RequestParams {
	prompt: string;
	aspectRatio?: string;
	negativePrompt?: string;
	stylePreset?: string;
	model: string;
	outputImageFileName: string;
}

export function saveMetadata(
	filePath: string,
	requestParams: RequestParams,
	response?: MetadataResponse,
	error?: Error | string
): void {
	try {
		const metadata = {
			timestamp: new Date().toISOString(),
			request: requestParams,
			response: response || {
				responseType: 'error',
				error: error instanceof Error ? error.message : String(error)
			}
		};

		const metadataPath = filePath.replace(/\.(png|jpg|jpeg)$/i, '.txt');
		fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
	} catch (err) {
		console.error('Failed to save metadata:', err);
	}
}
