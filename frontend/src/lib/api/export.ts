import { nativeBridge } from '@/lib/native/bridge';

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export async function saveTextExport(text: string, outputName: string): Promise<void> {
  await nativeBridge.files.saveExport(outputName, encodeUtf8(text));
}

export async function saveJsonExport(payload: unknown, outputName: string): Promise<void> {
  await saveTextExport(JSON.stringify(payload, null, 2), outputName);
}
