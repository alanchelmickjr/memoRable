/**
 * WireGuard Mesh Tests
 *
 * Tests for WireGuard mesh network service.
 * Verifies: key generation, IP allocation, config generation, mesh coordination.
 */

import {
  generateKeyPair,
  generatePresharedKey,
  allocateMeshIP,
  generateDeviceConfig,
  toConfFile,
  MeshCoordinator,
  WireGuardKeyPair,
  MeshDevice
} from '../../../src/services/wireguard/mesh.js';

describe('WireGuard Mesh Module', () => {
  // ==========================================================================
  // Key Generation
  // ==========================================================================
  describe('Key Generation', () => {
    test('generateKeyPair creates valid keypair', () => {
      const keypair = generateKeyPair();

      expect(keypair).toHaveProperty('privateKey');
      expect(keypair).toHaveProperty('publicKey');
      expect(typeof keypair.privateKey).toBe('string');
      expect(typeof keypair.publicKey).toBe('string');
      expect(keypair.privateKey.length).toBeGreaterThan(0);
      expect(keypair.publicKey.length).toBeGreaterThan(0);
    });

    test('generateKeyPair creates unique keypairs', () => {
      const keypair1 = generateKeyPair();
      const keypair2 = generateKeyPair();

      expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
      expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
    });

    test('generatePresharedKey creates valid key', () => {
      const psk = generatePresharedKey();

      expect(typeof psk).toBe('string');
      expect(psk.length).toBeGreaterThan(0);
    });

    test('generatePresharedKey creates unique keys', () => {
      const psk1 = generatePresharedKey();
      const psk2 = generatePresharedKey();

      expect(psk1).not.toBe(psk2);
    });
  });

  // ==========================================================================
  // IP Allocation
  // ==========================================================================
  describe('IP Allocation', () => {
    test('allocateMeshIP returns valid IP', () => {
      const ip = allocateMeshIP(5);

      expect(ip).toBe('10.100.0.5');
    });

    test('allocateMeshIP throws on invalid index', () => {
      expect(() => allocateMeshIP(0)).toThrow();
      expect(() => allocateMeshIP(255)).toThrow();
      expect(() => allocateMeshIP(-1)).toThrow();
    });

    test('allocateMeshIP handles boundary values', () => {
      expect(allocateMeshIP(1)).toBe('10.100.0.1');
      expect(allocateMeshIP(254)).toBe('10.100.0.254');
    });
  });

  // ==========================================================================
  // Config Generation
  // ==========================================================================
  describe('Config Generation', () => {
    const mockDevice: MeshDevice = {
      deviceId: 'glasses-001',
      deviceType: 'smartglasses',
      publicKey: 'test-public-key-1',
      meshIP: '10.100.0.2',
      lastSeen: new Date(),
      capabilities: ['video', 'audio']
    };

    const mockPeers: MeshDevice[] = [
      {
        deviceId: 'robot-001',
        deviceType: 'robot',
        publicKey: 'test-public-key-2',
        meshIP: '10.100.0.3',
        endpoint: '192.168.1.100:51820',
        lastSeen: new Date(),
        capabilities: ['audio', 'movement']
      },
      {
        deviceId: 'pendant-001',
        deviceType: 'pendant',
        publicKey: 'test-public-key-3',
        meshIP: '10.100.0.4',
        lastSeen: new Date(),
        capabilities: ['vitals', 'location']
      }
    ];

    test('generateDeviceConfig creates valid config structure', () => {
      const config = generateDeviceConfig(mockDevice, mockPeers);

      expect(config).toHaveProperty('interface');
      expect(config).toHaveProperty('peers');
      expect(config.interface).toHaveProperty('privateKey');
      expect(config.interface).toHaveProperty('address');
      expect(Array.isArray(config.peers)).toBe(true);
    });

    test('generateDeviceConfig includes all peers except self', () => {
      const allDevices = [mockDevice, ...mockPeers];
      const config = generateDeviceConfig(mockDevice, allDevices);

      // Should have 2 peers (not including self)
      expect(config.peers.length).toBe(2);

      // Should not include self
      const peerKeys = config.peers.map(p => p.publicKey);
      expect(peerKeys).not.toContain(mockDevice.publicKey);
    });

    test('generateDeviceConfig includes endpoint when available', () => {
      const config = generateDeviceConfig(mockDevice, mockPeers);

      const robotPeer = config.peers.find(p => p.publicKey === 'test-public-key-2');
      expect(robotPeer?.endpoint).toBe('192.168.1.100:51820');

      const pendantPeer = config.peers.find(p => p.publicKey === 'test-public-key-3');
      expect(pendantPeer?.endpoint).toBeUndefined();
    });

    test('toConfFile generates valid WireGuard format', () => {
      const config = generateDeviceConfig(mockDevice, mockPeers);
      const confFile = toConfFile(config);

      expect(confFile).toContain('[Interface]');
      expect(confFile).toContain('PrivateKey =');
      expect(confFile).toContain('Address =');
      expect(confFile).toContain('[Peer]');
      expect(confFile).toContain('PublicKey =');
      expect(confFile).toContain('AllowedIPs =');
    });

    test('toConfFile includes endpoint only when present', () => {
      const config = generateDeviceConfig(mockDevice, mockPeers);
      const confFile = toConfFile(config);

      // Robot has endpoint
      expect(confFile).toContain('Endpoint = 192.168.1.100:51820');

      // Count Endpoint occurrences (should be 1, not 2)
      const endpointMatches = confFile.match(/Endpoint =/g);
      expect(endpointMatches?.length).toBe(1);
    });
  });

  // ==========================================================================
  // Mesh Coordinator
  // ==========================================================================
  describe('MeshCoordinator', () => {
    let coordinator: MeshCoordinator;

    beforeEach(() => {
      coordinator = new MeshCoordinator();
    });

    test('registerDevice adds device to mesh', async () => {
      const result = await coordinator.registerDevice(
        'glasses-001',
        'smartglasses',
        ['video', 'audio']
      );

      expect(result.device.deviceId).toBe('glasses-001');
      expect(result.device.deviceType).toBe('smartglasses');
      expect(result.device.meshIP).toBe('10.100.0.2'); // First device gets .2
      expect(result.config).toBeDefined();
    });

    test('registerDevice assigns sequential IPs', async () => {
      const result1 = await coordinator.registerDevice('device-1', 'type-a');
      const result2 = await coordinator.registerDevice('device-2', 'type-b');
      const result3 = await coordinator.registerDevice('device-3', 'type-c');

      expect(result1.device.meshIP).toBe('10.100.0.2');
      expect(result2.device.meshIP).toBe('10.100.0.3');
      expect(result3.device.meshIP).toBe('10.100.0.4');
    });

    test('registerDevice updates existing device', async () => {
      await coordinator.registerDevice('device-1', 'type-a');
      const result2 = await coordinator.registerDevice('device-1', 'type-a', [], '1.2.3.4:51820');

      // Should still be only one device
      expect(coordinator.getDevices().length).toBe(1);
      // Should have updated endpoint
      expect(result2.device.endpoint).toBe('1.2.3.4:51820');
    });

    test('getDevices returns all devices', async () => {
      await coordinator.registerDevice('device-1', 'type-a');
      await coordinator.registerDevice('device-2', 'type-b');
      await coordinator.registerDevice('device-3', 'type-c');

      const devices = coordinator.getDevices();
      expect(devices.length).toBe(3);
    });

    test('getDevicesByType filters correctly', async () => {
      await coordinator.registerDevice('glasses-1', 'smartglasses');
      await coordinator.registerDevice('glasses-2', 'smartglasses');
      await coordinator.registerDevice('robot-1', 'robot');

      const glasses = coordinator.getDevicesByType('smartglasses');
      expect(glasses.length).toBe(2);

      const robots = coordinator.getDevicesByType('robot');
      expect(robots.length).toBe(1);
    });

    test('getDevicesWithCapability filters correctly', async () => {
      await coordinator.registerDevice('device-1', 'type-a', ['video', 'audio']);
      await coordinator.registerDevice('device-2', 'type-b', ['audio']);
      await coordinator.registerDevice('device-3', 'type-c', ['location']);

      const audioDevices = coordinator.getDevicesWithCapability('audio');
      expect(audioDevices.length).toBe(2);

      const videoDevices = coordinator.getDevicesWithCapability('video');
      expect(videoDevices.length).toBe(1);
    });

    test('removeDevice removes device from mesh', async () => {
      await coordinator.registerDevice('device-1', 'type-a');
      await coordinator.registerDevice('device-2', 'type-b');

      expect(coordinator.getDevices().length).toBe(2);

      const removed = coordinator.removeDevice('device-1');
      expect(removed).toBe(true);
      expect(coordinator.getDevices().length).toBe(1);
    });

    test('heartbeat updates lastSeen', async () => {
      await coordinator.registerDevice('device-1', 'type-a');

      const before = coordinator.getDevices()[0].lastSeen;
      await new Promise(resolve => setTimeout(resolve, 10));

      coordinator.heartbeat('device-1');
      const after = coordinator.getDevices()[0].lastSeen;

      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    test('pruneStaleDevices removes old devices', async () => {
      await coordinator.registerDevice('device-1', 'type-a');

      // Manually set lastSeen to old date
      const devices = coordinator.getDevices();
      devices[0].lastSeen = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      const pruned = coordinator.pruneStaleDevices(5 * 60 * 1000); // 5 minute threshold
      expect(pruned).toContain('device-1');
      expect(coordinator.getDevices().length).toBe(0);
    });

    test('exportState and importState preserve mesh', async () => {
      await coordinator.registerDevice('device-1', 'glasses', ['video']);
      await coordinator.registerDevice('device-2', 'robot', ['audio']);

      const state = coordinator.exportState();

      const newCoordinator = new MeshCoordinator();
      newCoordinator.importState(state);

      expect(newCoordinator.getDevices().length).toBe(2);
      expect(newCoordinator.getDevicesByType('glasses').length).toBe(1);
    });
  });
});
