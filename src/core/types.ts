/**
 * Core type definitions for the ChatGPT MCP Tool
 */

export interface ChatGPTError extends Error {
	code?: string;
	retryable?: boolean;
}

export interface ImageDownloadResult {
	response: string;
	imagePath?: string;
	cleanupFunction?: () => Promise<void>;
}

export interface CleanupOptions {
	deleteAfterProcessing: boolean;
	maxFileAge: number; // hours
	maxDirectorySize: number; // MB
	keepLastN: number; // files
}

export interface ImageFormat {
	extension: string;
	mimeType: string;
	quality?: number;
}

export interface UISelector {
	type: 'button' | 'menuitem' | 'image';
	identifier: string;
	fallbacks?: string[];
}

export enum ErrorCategory {
	RETRYABLE_UI = "retryable_ui",
	RETRYABLE_NETWORK = "retryable_network", 
	PERMISSION = "permission",
	FATAL = "fatal"
}

export interface ChatGPTToolArgs {
	operation: "ask" | "get_conversations" | "generate_image";
	prompt?: string;
	conversation_id?: string;
	image_style?: string;
	image_size?: string;
	max_retries?: number;
	download_image?: boolean;
	save_path?: string;
	cleanup_after?: boolean;
}

export interface AppleScriptResult {
	success: boolean;
	data?: any;
	error?: string;
}
