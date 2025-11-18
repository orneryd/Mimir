/**
 * @fileoverview Unit tests for Agentinator preamble generation
 * 
 * Tests the dynamic agent preamble generation system including template loading,
 * LLM API integration, and error handling with mocked dependencies.
 * 
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generatePreambleWithAgentinator } from './agentinator.js';

// Mock fs.promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

// Mock fetch
global.fetch = vi.fn();

describe('Agentinator Preamble Generation', () => {
  const mockAgentinatorPreamble = '# Agentinator v2.0\n\nYou are an expert prompt engineer...';
  const mockWorkerTemplate = '# Worker Agent Template\n\n## Role\n{role_description}...';
  const mockQCTemplate = '# QC Agent Template\n\n## Role\n{role_description}...';
  
  beforeEach(() => {
    // Reset mock calls but keep implementations
    mockReadFile.mockClear();
    vi.mocked(fetch).mockClear();
    
    // Mock file reading
    mockReadFile.mockImplementation(async (filepath: any) => {
      const path = filepath.toString();
      
      if (path.includes('02-agentinator-preamble.md')) {
        return mockAgentinatorPreamble;
      }
      if (path.includes('worker-template.md')) {
        return mockWorkerTemplate;
      }
      if (path.includes('qc-template.md')) {
        return mockQCTemplate;
      }
      
      throw new Error(`File not found: ${path}`);
    });
    
    // Mock successful fetch response by default
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '# Python Developer\n\nYou are a Python developer specializing in Django...'
          }
        }]
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful preamble generation', () => {
    it('should generate worker agent preamble', async () => {
      const result = await generatePreambleWithAgentinator(
        'Python developer specializing in Django REST APIs',
        'worker'
      );

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('content');
      expect(result.name).toBe('Python developer specializing in Django');
      expect(result.role).toBe('Python developer specializing in Django REST APIs');
      expect(result.content).toContain('Python Developer');
    });

    it('should generate QC agent preamble', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '# Security Auditor\n\nYou are a security auditor for API endpoints...'
            }
          }]
        }),
      } as Response);

      const result = await generatePreambleWithAgentinator(
        'Security auditor for API endpoints',
        'qc'
      );

      expect(result.name).toBe('Security auditor for API endpoints');
      expect(result.role).toBe('Security auditor for API endpoints');
      expect(result.content).toContain('Security Auditor');
    });

    it('should truncate agent name to 5 words', async () => {
      const result = await generatePreambleWithAgentinator(
        'Senior Full Stack Developer with expertise in React Angular Vue Svelte',
        'worker'
      );

      expect(result.name).toBe('Senior Full Stack Developer with');
      expect(result.name.split(' ')).toHaveLength(5);
    });

    it('should handle short role descriptions', async () => {
      const result = await generatePreambleWithAgentinator(
        'DevOps Engineer',
        'worker'
      );

      expect(result.name).toBe('DevOps Engineer');
    });

    it('should successfully generate preamble with all required fields', async () => {
      const result = await generatePreambleWithAgentinator('Test Role', 'worker');

      // Verify result structure and content
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('content');
      expect(result.name).toBeTruthy();
      expect(result.role).toBe('Test Role');
      expect(result.content).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should throw error when API returns non-ok status', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(
        generatePreambleWithAgentinator('Test Role', 'worker')
      ).rejects.toThrow('Agentinator API error: 500 Internal Server Error');
    });

    it('should throw error when API returns 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        generatePreambleWithAgentinator('Test Role', 'qc')
      ).rejects.toThrow('Agentinator API error: 404 Not Found');
    });

    it('should throw error when API response is missing content', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: ''
            }
          }]
        }),
      } as Response);

      await expect(
        generatePreambleWithAgentinator('Test Role', 'worker')
      ).rejects.toThrow('Agentinator returned empty preamble');
    });

    it('should throw error when API response has no choices', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: []
        }),
      } as Response);

      await expect(
        generatePreambleWithAgentinator('Test Role', 'worker')
      ).rejects.toThrow('Agentinator returned empty preamble');
    });

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(
        generatePreambleWithAgentinator('Test Role', 'worker')
      ).rejects.toThrow('Failed to generate preamble with Agentinator');
    });

    it('should include original error message in thrown error', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Connection timeout'));

      await expect(
        generatePreambleWithAgentinator('Test Role', 'worker')
      ).rejects.toThrow('Connection timeout');
    });
  });

  describe('Edge cases', () => {
    it('should handle role description with extra whitespace', async () => {
      const result = await generatePreambleWithAgentinator(
        '  Frontend   Developer  with   React  ',
        'worker'
      );

      expect(result.name).toBe('Frontend Developer with React');
    });

    it('should handle single word role description', async () => {
      const result = await generatePreambleWithAgentinator(
        'Developer',
        'worker'
      );

      expect(result.name).toBe('Developer');
      expect(result.role).toBe('Developer');
    });

    it('should handle very long role descriptions', async () => {
      const longRole = 'A' + ' word'.repeat(100);
      const result = await generatePreambleWithAgentinator(longRole, 'worker');

      expect(result.name.split(' ')).toHaveLength(5);
      expect(result.role).toBe(longRole);
    });

    it('should handle special characters in role description', async () => {
      const result = await generatePreambleWithAgentinator(
        'C++ developer (focus on performance & optimization)',
        'worker'
      );

      expect(result.role).toBe('C++ developer (focus on performance & optimization)');
    });

        it('should use MIMIR_LLM_API environment variable if set', async () => {
      const customBaseUrl = 'http://custom-api:8080';
      const customPath = '/v1/chat/completions';
      process.env.MIMIR_LLM_API = customBaseUrl;
      process.env.MIMIR_LLM_API_PATH = customPath;

      await generatePreambleWithAgentinator('Test Role', 'worker');

      expect(fetch).toHaveBeenCalledWith(
        `${customBaseUrl}${customPath}`,
        expect.any(Object)
      );

      delete process.env.MIMIR_LLM_API;
      delete process.env.MIMIR_LLM_API_PATH;
    });
  });
});
