import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlanStore } from '../planStore';

// Mock fetch globally
global.fetch = vi.fn();

// Get initial default agents from store
const getDefaultAgents = () => {
  const initialState = usePlanStore.getState();
  return initialState.agentTemplates.filter(a => a.id.startsWith('default-'));
};

describe('planStore - Agent Management', () => {
  beforeEach(() => {
    // Reset store state before each test, but keep default agents
    const defaultAgents = getDefaultAgents();
    usePlanStore.setState({
      agentTemplates: defaultAgents,
      agentSearch: '',
      agentOffset: 0,
      hasMoreAgents: true,
      isLoadingAgents: false,
      selectedAgent: null,
      agentOperations: {},
    });

    // Clear all mock calls
    vi.clearAllMocks();
  });

  describe('Default Placeholder Agents', () => {
    it('should initialize with 8 default placeholder agents', () => {
      const store = usePlanStore.getState();
      
      // Get initial state (should have defaults)
      expect(store.agentTemplates.length).toBeGreaterThanOrEqual(8);
    });

    it('should have 4 worker placeholder agents', () => {
      const store = usePlanStore.getState();
      const workerAgents = store.agentTemplates.filter(a => a.agentType === 'worker');
      
      expect(workerAgents.length).toBeGreaterThanOrEqual(4);
    });

    it('should have 4 QC placeholder agents', () => {
      const store = usePlanStore.getState();
      const qcAgents = store.agentTemplates.filter(a => a.agentType === 'qc');
      
      expect(qcAgents.length).toBe(4);
      
      // Verify specific QC agents
      const qcNames = qcAgents.map(a => a.name);
      expect(qcNames).toContain('QC Specialist');
      expect(qcNames).toContain('Security QC');
      expect(qcNames).toContain('Performance QC');
      expect(qcNames).toContain('UX/Accessibility QC');
    });

    it('should have default agents with correct ID prefix', () => {
      const store = usePlanStore.getState();
      const defaultAgents = store.agentTemplates.filter(a => a.id.startsWith('default-'));
      
      expect(defaultAgents.length).toBeGreaterThanOrEqual(8);
    });

    it('should have all required properties on default agents', () => {
      const store = usePlanStore.getState();
      const agent = store.agentTemplates[0];
      
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('role');
      expect(agent).toHaveProperty('agentType');
      expect(agent).toHaveProperty('content');
      expect(agent).toHaveProperty('version');
      expect(agent).toHaveProperty('created');
    });
  });

  describe('fetchAgents', () => {
    it('should fetch agents from API successfully', async () => {
      const mockAgents = [
        {
          id: 'preamble-1',
          name: 'Custom Agent',
          role: 'Custom role',
          agentType: 'worker',
          content: '# Custom Agent',
          version: '1.0',
          created: new Date().toISOString(),
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: mockAgents, hasMore: false }),
      });

      const { fetchAgents } = usePlanStore.getState();
      await fetchAgents('', true);

      const state = usePlanStore.getState();
      
      // Should have fetched agents plus defaults
      expect(state.agentTemplates.length).toBeGreaterThan(0);
      expect(state.isLoadingAgents).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { fetchAgents } = usePlanStore.getState();
      await fetchAgents('', true);

      const state = usePlanStore.getState();
      
      // Should keep defaults even on error
      expect(state.agentTemplates.length).toBeGreaterThanOrEqual(8);
      expect(state.isLoadingAgents).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      (global.fetch as any).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ agents: [], hasMore: false }),
        }), 100))
      );

      const { fetchAgents } = usePlanStore.getState();
      const fetchPromise = fetchAgents('', true);

      // Check loading state is true during fetch
      expect(usePlanStore.getState().isLoadingAgents).toBe(true);

      await fetchPromise;

      // Check loading state is false after fetch
      expect(usePlanStore.getState().isLoadingAgents).toBe(false);
    });

    it('should support pagination with offset', async () => {
      const mockPage1 = [{ id: 'agent-1', name: 'Agent 1', agentType: 'worker' as const, role: '', content: '', version: '1.0', created: '' }];
      const mockPage2 = [{ id: 'agent-2', name: 'Agent 2', agentType: 'worker' as const, role: '', content: '', version: '1.0', created: '' }];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: mockPage1, hasMore: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ agents: mockPage2, hasMore: false }),
        });

      const { fetchAgents } = usePlanStore.getState();
      
      // Fetch first page
      await fetchAgents('', true);
      const state1 = usePlanStore.getState();
      expect(state1.hasMoreAgents).toBe(true);

      // Fetch second page
      await fetchAgents('', false);
      const state2 = usePlanStore.getState();
      expect(state2.hasMoreAgents).toBe(false);
    });

    it('should support search functionality', async () => {
      const searchResults = [
        {
          id: 'preamble-1',
          name: 'Kubernetes Expert',
          role: 'DevOps specializing in Kubernetes',
          agentType: 'worker' as const,
          content: '',
          version: '1.0',
          created: '',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: searchResults, hasMore: false }),
      });

      const { fetchAgents, setAgentSearch } = usePlanStore.getState();
      
      setAgentSearch('kubernetes');
      await fetchAgents('kubernetes', true);

      // Check that the first argument (URL) contains the search parameter
      expect((global.fetch as any).mock.calls[0][0]).toContain('search=kubernetes');
    });
  });

  describe('createAgent', () => {
    it('should create a worker agent successfully', async () => {
      const newAgent = {
        id: 'preamble-new',
        name: 'New Worker',
        role: 'Test role',
        agentType: 'worker' as const,
        content: '# New Worker',
        version: '1.0',
        created: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent: newAgent }),
      });

      const { createAgent } = usePlanStore.getState();
      const result = await createAgent({
        roleDescription: 'Test role',
        agentType: 'worker',
        useAgentinator: false,
      });

      expect(result).toEqual(newAgent);
      
      const state = usePlanStore.getState();
      const found = state.agentTemplates.find(a => a.id === 'preamble-new');
      expect(found).toBeDefined();
    });

    it('should create a QC agent successfully', async () => {
      const newAgent = {
        id: 'preamble-qc',
        name: 'New QC',
        role: 'Test QC role',
        agentType: 'qc' as const,
        content: '# New QC',
        version: '1.0',
        created: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent: newAgent }),
      });

      const { createAgent } = usePlanStore.getState();
      const result = await createAgent({
        roleDescription: 'Test QC role',
        agentType: 'qc',
        useAgentinator: true,
      });

      expect(result.agentType).toBe('qc');
    });

    it('should handle creation errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { createAgent } = usePlanStore.getState();
      
      await expect(
        createAgent({
          roleDescription: 'Test role',
          agentType: 'worker',
        })
      ).rejects.toThrow();
    });
  });

  describe('deleteAgent', () => {
    it('should delete a custom agent successfully', async () => {
      // Add a custom agent first
      usePlanStore.setState({
        agentTemplates: [
          ...usePlanStore.getState().agentTemplates,
          {
            id: 'preamble-to-delete',
            name: 'To Delete',
            role: 'Test',
            agentType: 'worker',
            content: '',
            version: '1.0',
            created: '',
          },
        ],
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { deleteAgent } = usePlanStore.getState();
      await deleteAgent('preamble-to-delete');

      const state = usePlanStore.getState();
      const found = state.agentTemplates.find(a => a.id === 'preamble-to-delete');
      expect(found).toBeUndefined();
    });

    it('should not delete default agents', async () => {
      const initialCount = usePlanStore.getState().agentTemplates.length;

      const { deleteAgent } = usePlanStore.getState();
      await deleteAgent('default-devops');

      const finalCount = usePlanStore.getState().agentTemplates.length;
      
      // Should not make API call or remove agent
      expect(finalCount).toBe(initialCount);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should set loading state during deletion', async () => {
      usePlanStore.setState({
        agentTemplates: [
          ...usePlanStore.getState().agentTemplates,
          {
            id: 'preamble-delete',
            name: 'Delete Me',
            role: 'Test',
            agentType: 'worker',
            content: '',
            version: '1.0',
            created: '',
          },
        ],
      });

      (global.fetch as any).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 100))
      );

      const { deleteAgent } = usePlanStore.getState();
      const deletePromise = deleteAgent('preamble-delete');

      // Check loading state is true during deletion
      expect(usePlanStore.getState().agentOperations['preamble-delete']).toBe(true);

      await deletePromise;

      // Check loading state is false after deletion
      expect(usePlanStore.getState().agentOperations['preamble-delete']).toBe(false);
    });

    it('should handle deletion errors', async () => {
      usePlanStore.setState({
        agentTemplates: [
          ...usePlanStore.getState().agentTemplates,
          {
            id: 'preamble-error',
            name: 'Error Test',
            role: 'Test',
            agentType: 'worker',
            content: '',
            version: '1.0',
            created: '',
          },
        ],
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { deleteAgent } = usePlanStore.getState();
      
      await expect(deleteAgent('preamble-error')).rejects.toThrow();
      
      // Agent should still exist after error
      const found = usePlanStore.getState().agentTemplates.find(a => a.id === 'preamble-error');
      expect(found).toBeDefined();
    });

    it('should clear selectedAgent if deleted agent was selected', async () => {
      const agent = {
        id: 'preamble-selected',
        name: 'Selected',
        role: 'Test',
        agentType: 'worker' as const,
        content: '',
        version: '1.0',
        created: '',
      };

      usePlanStore.setState({
        agentTemplates: [...usePlanStore.getState().agentTemplates, agent],
        selectedAgent: agent,
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { deleteAgent } = usePlanStore.getState();
      await deleteAgent('preamble-selected');

      expect(usePlanStore.getState().selectedAgent).toBeNull();
    });
  });

  describe('setSelectedAgent', () => {
    it('should set selected agent', () => {
      const agent = usePlanStore.getState().agentTemplates[0];
      
      const { setSelectedAgent } = usePlanStore.getState();
      setSelectedAgent(agent);

      expect(usePlanStore.getState().selectedAgent).toEqual(agent);
    });

    it('should clear selected agent', () => {
      const agent = usePlanStore.getState().agentTemplates[0];
      usePlanStore.setState({ selectedAgent: agent });

      const { setSelectedAgent } = usePlanStore.getState();
      setSelectedAgent(null);

      expect(usePlanStore.getState().selectedAgent).toBeNull();
    });
  });

  describe('setAgentSearch', () => {
    it('should update search query', () => {
      const { setAgentSearch } = usePlanStore.getState();
      setAgentSearch('kubernetes');

      expect(usePlanStore.getState().agentSearch).toBe('kubernetes');
    });

    it('should clear search query', () => {
      usePlanStore.setState({ agentSearch: 'test' });

      const { setAgentSearch } = usePlanStore.getState();
      setAgentSearch('');

      expect(usePlanStore.getState().agentSearch).toBe('');
    });
  });

  describe('Agent Operations State', () => {
    it('should track multiple agent operations simultaneously', () => {
      usePlanStore.setState({
        agentOperations: {
          'agent-1': true,
          'agent-2': true,
          'agent-3': false,
        },
      });

      const state = usePlanStore.getState();
      expect(state.agentOperations['agent-1']).toBe(true);
      expect(state.agentOperations['agent-2']).toBe(true);
      expect(state.agentOperations['agent-3']).toBe(false);
    });
  });
});
