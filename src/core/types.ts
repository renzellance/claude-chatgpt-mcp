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

// Enhanced with async operations
export interface ChatGPTToolArgs {
	operation: "ask" | "get_conversations" | "generate_image" | "start_image_generation" | "check_generation_status" | "get_latest_image";
	prompt?: string;
	conversation_id?: string;
	image_style?: string;
	image_size?: string;
	max_retries?: number;
	download_image?: boolean;
	save_path?: string;
	cleanup_after?: boolean;
	generation_id?: string; // For async operations
}

export interface AppleScriptResult {
	success: boolean;
	data?: any;
	error?: string;
}

// New async-specific types
export interface GenerationStatus {
	id: string;
	status: 'pending' | 'generating' | 'completed' | 'failed';
	prompt: string;
	timestamp: number;
	error?: string;
	imagePath?: string;
}

export interface AsyncImageGeneration {
	id: string;
	prompt: string;
	style?: string;
	size?: string;
	conversation_id?: string;
	started_at: number;
}

export interface GenerationTracker {
	activeGenerations: Map<string, AsyncImageGeneration>;
	completedGenerations: Map<string, GenerationStatus>;
	getStatus(id: string): GenerationStatus | null;
	cleanup(): void;
}