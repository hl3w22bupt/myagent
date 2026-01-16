/**
 * Unified Result Type System
 * Based on refactored skill output schema
 */

export type ResultType =
  | 'text'        // Plain text (summarize)
  | 'markdown'    // Markdown formatted text
  | 'code'        // Code snippet with syntax highlighting
  | 'table'       // Structured data table (web-search)
  | 'infographic' // Image visualization (infographic-generator)
  | 'video'       // Video file (remotion-generator)
  | 'report'      // Structured report (code-analysis)
  | 'mixed'       // Multiple content types combined
  | 'error';      // Error message

export interface BaseResult {
  result_type: ResultType;
  success: boolean;
  content: any;
  metadata: Record<string, any>;
}

export interface TextResult extends BaseResult {
  result_type: 'text';
  content: {
    text: string;
    title?: string;
  };
}

export interface TableResult extends BaseResult {
  result_type: 'table';
  content: {
    type: string;
    title: string;
    columns: string[];
    rows: any[][];
  };
}

export interface MediaContent {
  path: string;              // Relative to outputs/
  mime_type: string;
  size?: number;             // File size in bytes
  duration?: number;         // For video/audio in seconds
  fps?: number;             // For video
  resolution?: string;      // For video/image
  thumbnail_path?: string;  // Optional thumbnail
}

export interface InfographicResult extends BaseResult {
  result_type: 'infographic';
  content: MediaContent & {
    title?: string;
    description?: string;
  };
}

export interface VideoResult extends BaseResult {
  result_type: 'video';
  content: MediaContent;
}

export interface ReportResult extends BaseResult {
  result_type: 'report';
  content: {
    type: string;
    title: string;
    summary?: string;
    data: Record<string, any>;
  };
}

export interface ErrorResult extends BaseResult {
  result_type: 'error';
  content: {
    error: string;
    code?: string;
    suggestions?: string[];
  };
}

export type AnyResult = TextResult | TableResult | InfographicResult | VideoResult | ReportResult | ErrorResult;
