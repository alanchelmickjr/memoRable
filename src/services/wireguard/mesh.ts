/**
 * WireGuard Mesh Network for MemoRable Sensors
 *
 * Secure, fast, peer-to-peer communication between devices.
 * Works offline (mesh between local devices).
 * Cloud is a peer, not a requirement.
 *
 * Use cases:
 * - AR Glasses ↔ Companion Robot (local, low latency)
 * - Pendant ↔ Home Hub (local, safety critical)
 * - All devices ↔ Cloud (when available, for sync)
 */

import { randomBytes, createHash } from 'crypto';
import { execSync } from 'child_process';

// =============================================================================
// Types
// =============================================================================

export interface WireGuardKeyPair {
  privateKey: string;  // Base64, NEVER share
  publicKey: string;   // Base64, shared with peers
}

export interface WireGuardPeer {
  publicKey: string;
  allowedIPs: string;        // CIDR, what IPs to route through this peer
  endpoint?: string;         // host:port, optional for mesh peers
  persistentKeepalive?: number; // Seconds, for NAT traversal
}

export interface WireGuardInterface {
  privateKey: string;
  address: string;           // CIDR, this device's mesh IP
  listenPort?: number;       // UDP port to listen on
  dns?: string;              // Optional DNS server
}

export interface WireGuardConfig {
  interface: WireGuardInterface;
  peers: WireGuardPeer[];
}

export interface MeshDevice {
  deviceId: string;
  deviceType: string;
  publicKey: string;
  meshIP: string;            // e.g., 10.100.0.5
  endpoint?: string;         // Public endpoint if available
  lastSeen: Date;
  capabilities: string[];    // e.g., ['audio', 'video', 'location']
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate WireGuard keypair
 * Uses wg command if available, falls back to crypto
 */
export function generateKeyPair(): WireGuardKeyPair {
  try {
    // Try using wg command (most reliable)
    const privateKey = execSync('wg genkey', { encoding: 'utf8' }).trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
      encoding: 'utf8',
      shell: '/bin/bash'
    }).trim();
    return { privateKey, publicKey };
  } catch {
    // Fallback: generate using crypto (Curve25519)
    // Note: This is a simplified version, production should use proper Curve25519
    const privateKeyBytes = randomBytes(32);
    // Clamp private key per Curve25519 spec
    privateKeyBytes[0] &= 248;
    privateKeyBytes[31] &= 127;
    privateKeyBytes[31] |= 64;

    const privateKey = privateKeyBytes.toString('base64');
    // Public key derivation would need actual Curve25519 - for now, hash as placeholder
    const publicKey = createHash('sha256')
      .update(privateKeyBytes)
      .digest()
      .toString('base64');

    console.warn('[WireGuard] Using fallback key generation - install wireguard-tools for production');
    return { privateKey, publicKey };
  }
}

/**
 * Generate pre-shared key for additional security between specific peers
 */
export function generatePresharedKey(): string {
  try {
    return execSync('wg genpsk', { encoding: 'utf8' }).trim();
  } catch {
    return randomBytes(32).toString('base64');
  }
}

// =============================================================================
// Configuration Generation
// =============================================================================

/**
 * Mesh IP allocation
 * Uses 10.100.0.0/24 subnet for mesh devices
 */
const MESH_SUBNET = '10.100.0';
const MESH_CIDR = 24;

/**
 * Allocate mesh IP for a device
 * @param deviceIndex Unique index (1-254)
 */
export function allocateMeshIP(deviceIndex: number): string {
  if (deviceIndex < 1 || deviceIndex > 254) {
    throw new Error('Device index must be between 1 and 254');
  }
  return `${MESH_SUBNET}.${deviceIndex}`;
}

/**
 * Generate WireGuard configuration for a device
 */
export function generateDeviceConfig(
  device: MeshDevice,
  peers: MeshDevice[],
  options: {
    listenPort?: number;
    includeCloudPeer?: boolean;
    cloudEndpoint?: string;
    cloudPublicKey?: string;
  } = {}
): WireGuardConfig {
  const keyPair = generateKeyPair();

  const config: WireGuardConfig = {
    interface: {
      privateKey: keyPair.privateKey,
      address: `${device.meshIP}/${MESH_CIDR}`,
      listenPort: options.listenPort || 51820
    },
    peers: []
  };

  // Add mesh peers
  for (const peer of peers) {
    if (peer.deviceId === device.deviceId) continue; // Skip self

    config.peers.push({
      publicKey: peer.publicKey,
      allowedIPs: `${peer.meshIP}/32`,
      endpoint: peer.endpoint,
      persistentKeepalive: 25 // Keep NAT mappings alive
    });
  }

  // Add cloud peer if configured
  if (options.includeCloudPeer && options.cloudPublicKey) {
    config.peers.push({
      publicKey: options.cloudPublicKey,
      allowedIPs: `${MESH_SUBNET}.1/32`, // Cloud is always .1
      endpoint: options.cloudEndpoint,
      persistentKeepalive: 25
    });
  }

  return config;
}

/**
 * Convert config to WireGuard conf file format
 */
export function toConfFile(config: WireGuardConfig): string {
  let conf = `[Interface]
PrivateKey = ${config.interface.privateKey}
Address = ${config.interface.address}
`;

  if (config.interface.listenPort) {
    conf += `ListenPort = ${config.interface.listenPort}\n`;
  }

  if (config.interface.dns) {
    conf += `DNS = ${config.interface.dns}\n`;
  }

  for (const peer of config.peers) {
    conf += `
[Peer]
PublicKey = ${peer.publicKey}
AllowedIPs = ${peer.allowedIPs}
`;

    if (peer.endpoint) {
      conf += `Endpoint = ${peer.endpoint}\n`;
    }

    if (peer.persistentKeepalive) {
      conf += `PersistentKeepalive = ${peer.persistentKeepalive}\n`;
    }
  }

  return conf;
}

// =============================================================================
// Mesh Coordinator
// =============================================================================

/**
 * Coordinates WireGuard mesh network
 * Tracks devices, allocates IPs, distributes peer configurations
 */
export class MeshCoordinator {
  private devices: Map<string, MeshDevice> = new Map();
  private nextIndex: number = 2; // Start at 2, .1 is cloud

  private cloudConfig?: {
    publicKey: string;
    endpoint: string;
  };

  constructor(cloudConfig?: { publicKey: string; endpoint: string }) {
    this.cloudConfig = cloudConfig;
  }

  /**
   * Register a new device in the mesh
   */
  async registerDevice(
    deviceId: string,
    deviceType: string,
    capabilities: string[] = [],
    endpoint?: string
  ): Promise<{ device: MeshDevice; config: WireGuardConfig }> {
    // Check if already registered
    if (this.devices.has(deviceId)) {
      const existing = this.devices.get(deviceId)!;
      existing.lastSeen = new Date();
      if (endpoint) existing.endpoint = endpoint;

      return {
        device: existing,
        config: this.generateConfigForDevice(existing)
      };
    }

    // Allocate new device
    const keyPair = generateKeyPair();
    const meshIP = allocateMeshIP(this.nextIndex++);

    const device: MeshDevice = {
      deviceId,
      deviceType,
      publicKey: keyPair.publicKey,
      meshIP,
      endpoint,
      lastSeen: new Date(),
      capabilities
    };

    this.devices.set(deviceId, device);

    // Generate config with all current peers
    const config = this.generateConfigForDevice(device);

    // Notify existing devices of new peer (in production, push update)
    await this.notifyPeersOfNewDevice(device);

    return { device, config };
  }

  /**
   * Remove a device from the mesh
   */
  removeDevice(deviceId: string): boolean {
    return this.devices.delete(deviceId);
  }

  /**
   * Get all devices in the mesh
   */
  getDevices(): MeshDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by type
   */
  getDevicesByType(deviceType: string): MeshDevice[] {
    return this.getDevices().filter(d => d.deviceType === deviceType);
  }

  /**
   * Get devices with specific capability
   */
  getDevicesWithCapability(capability: string): MeshDevice[] {
    return this.getDevices().filter(d => d.capabilities.includes(capability));
  }

  /**
   * Generate WireGuard config for a specific device
   */
  private generateConfigForDevice(device: MeshDevice): WireGuardConfig {
    const peers = this.getDevices().filter(d => d.deviceId !== device.deviceId);

    return generateDeviceConfig(device, peers, {
      includeCloudPeer: !!this.cloudConfig,
      cloudEndpoint: this.cloudConfig?.endpoint,
      cloudPublicKey: this.cloudConfig?.publicKey
    });
  }

  /**
   * Notify existing peers of a new device
   * In production, this would push config updates
   */
  private async notifyPeersOfNewDevice(_device: MeshDevice): Promise<void> {
    // TODO: Implement push notification to existing devices
    // Could use:
    // - WebSocket push
    // - Gun.js sync
    // - MQTT message
    console.log(`[Mesh] New device registered, ${this.devices.size} total devices in mesh`);
  }

  /**
   * Health check - remove stale devices
   */
  pruneStaleDevices(maxAgeMs: number = 5 * 60 * 1000): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [deviceId, device] of this.devices) {
      if (now - device.lastSeen.getTime() > maxAgeMs) {
        this.devices.delete(deviceId);
        pruned.push(deviceId);
      }
    }

    return pruned;
  }

  /**
   * Update device last seen timestamp
   */
  heartbeat(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = new Date();
      return true;
    }
    return false;
  }

  /**
   * Export mesh state for persistence
   */
  exportState(): { devices: MeshDevice[]; nextIndex: number } {
    return {
      devices: this.getDevices(),
      nextIndex: this.nextIndex
    };
  }

  /**
   * Import mesh state from persistence
   */
  importState(state: { devices: MeshDevice[]; nextIndex: number }): void {
    this.devices.clear();
    for (const device of state.devices) {
      this.devices.set(device.deviceId, {
        ...device,
        lastSeen: new Date(device.lastSeen)
      });
    }
    this.nextIndex = state.nextIndex;
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  generateKeyPair,
  generatePresharedKey,
  allocateMeshIP,
  generateDeviceConfig,
  toConfFile,
  MeshCoordinator
};
