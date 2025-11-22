interface ApiError {
  title: string;
  message: string;
  details?: string;
}

class ApiClient {
  private baseUrl: string;
  private errorHandler: ((error: ApiError) => void) | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  setErrorHandler(handler: (error: ApiError) => void) {
    this.errorHandler = handler;
  }

  private handleError(error: any, context: string) {
    let apiError: ApiError;

    if (error.status && error.data) {
      // HTTP error with JSON response
      const data = error.data;
      
      // Handle specific error cases
      if (data.details?.includes('NEO4J')) {
        apiError = {
          title: 'Database Connection Error',
          message: 'Failed to connect to the Neo4j database. Please ensure Neo4j is running.',
          details: data.details || 'Check that Docker containers are running: docker-compose up -d',
        };
      } else {
        apiError = {
          title: `${context} Failed`,
          message: data.error || 'An unexpected error occurred.',
          details: data.details || JSON.stringify(data, null, 2),
        };
      }
    } else if (error.message) {
      // Network or fetch error
      apiError = {
        title: 'Network Error',
        message: `Failed to connect to the backend server. Please ensure the server is running on port 9042.`,
        details: error.message,
      };
    } else {
      // Unknown error
      apiError = {
        title: 'Unknown Error',
        message: 'An unexpected error occurred.',
        details: JSON.stringify(error, null, 2),
      };
    }

    console.error(`[API Error] ${context}:`, error);

    if (this.errorHandler) {
      this.errorHandler(apiError);
    }

    throw apiError;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        credentials: 'include', // Send HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw {
          status: response.status,
          statusText: response.statusText,
          data,
        };
      }

      return await response.json();
    } catch (error) {
      this.handleError(error, options.method || 'Request');
      throw error; // This won't be reached due to handleError throwing, but TypeScript needs it
    }
  }

  // Convenience methods
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // File Indexing Methods
  async listIndexedFolders(): Promise<{ folders: Array<{ path: string; recursive: boolean; filePatterns?: string[]; status: string }> }> {
    return this.get('/mcp/list-folders');
  }

  async indexFolder(path: string, recursive: boolean = true, generateEmbeddings: boolean = true): Promise<{ success: boolean; message: string }> {
    return this.post('/mcp/index-folder', { path, recursive, generate_embeddings: generateEmbeddings });
  }

  async removeFolder(path: string): Promise<{ success: boolean; message: string }> {
    return this.post('/mcp/remove-folder', { path });
  }

  // Memory Management
  async saveConversationAsMemory(messages: Array<{ role: string; content: string; timestamp: Date }>): Promise<{ success: boolean; memoryId: string; message: string }> {
    return this.post('/mcp/save-conversation', { messages });
  }
}

export const apiClient = new ApiClient('/api');
export type { ApiError };
