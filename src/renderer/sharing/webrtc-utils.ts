// Shared WebRTC utilities for P2P session sharing.

import type { ShareMessage } from '../../shared/sharing-types.js';
import { encryptPayload, decryptPayload } from './share-crypto.js';

export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function sendMessage(dc: RTCDataChannel, msg: ShareMessage): void {
  if (dc.readyState === 'open') {
    dc.send(JSON.stringify(msg));
  }
}

export async function encodeConnectionCode(desc: RTCSessionDescription | null, passphrase: string): Promise<string> {
  return encryptPayload(JSON.stringify(desc), passphrase);
}

export async function decodeConnectionCode(code: string, expectedType: 'offer' | 'answer' | undefined, passphrase: string): Promise<RTCSessionDescriptionInit> {
  let decoded: string;
  try {
    decoded = await decryptPayload(code, passphrase);
  } catch {
    throw new Error('连接码无效：无法解密（PIN 码错误？）');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('连接码无效：数据格式错误');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    !('sdp' in parsed) ||
    typeof (parsed as Record<string, unknown>).type !== 'string' ||
    typeof (parsed as Record<string, unknown>).sdp !== 'string'
  ) {
    throw new Error('连接码无效：缺少必要字段');
  }

  const desc = parsed as RTCSessionDescriptionInit;
  if (desc.type !== 'offer' && desc.type !== 'answer') {
    throw new Error('连接码无效：类型异常');
  }

  if (expectedType && desc.type !== expectedType) {
    throw new Error(`连接码无效：期望类型为 ${expectedType}，实际为 ${desc.type}`);
  }

  return desc;
}

export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // Timeout after 10s in case ICE gathering stalls
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, 10_000);
  });
}
