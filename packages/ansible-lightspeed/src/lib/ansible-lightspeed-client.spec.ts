import { AnsibleLightspeedClient, AnsibleLightspeedError } from './client';
import { AnsibleLightspeedConfig } from './types';

describe('AnsibleLightspeedClient', () => {
  const mockConfig: AnsibleLightspeedConfig = {
    baseUrl: 'https://api.example.com',
    fetchFunction: jest.fn(),
  };

  let client: AnsibleLightspeedClient;

  beforeEach(() => {
    client = new AnsibleLightspeedClient(mockConfig);
  });

  describe('constructor', () => {
    it('should create an instance with the provided config', () => {
      expect(client).toBeInstanceOf(AnsibleLightspeedClient);
    });

    it('should use default fetch when fetchFunction is not provided', () => {
      const configWithoutFetch: AnsibleLightspeedConfig = {
        baseUrl: 'https://api.example.com',
      };
      const clientWithoutFetch = new AnsibleLightspeedClient(configWithoutFetch);
      expect(clientWithoutFetch).toBeInstanceOf(AnsibleLightspeedClient);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const config = client.getConfig();
      expect(config).toEqual(mockConfig);
      expect(config).not.toBe(mockConfig);
    });
  });

  describe('AnsibleLightspeedError', () => {
    it('should create an error with message, status, and response', () => {
      const error = new AnsibleLightspeedError('Test error', 400, { detail: 'Bad request' });
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(400);
      expect(error.response).toEqual({ detail: 'Bad request' });
      expect(error.name).toBe('AnsibleLightspeedError');
    });
  });
});