// Sound-detection worker: `catunes __sounds-worker <dir>` (spawned by
// SoundTagger, never by users). Loads ONNX Runtime Web + YAMNet from the
// downloaded folder and answers each request on stdin — a uint32 byte length
// followed by float32 mono 16 kHz samples — with one JSON line on stdout:
// {"scores":[...521 averaged class scores]} or {"error":"..."}.
//
// It's a separate process so the model's ~0.1–1 s of computation per run
// never freezes the UI or the audio.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}
interface OrtModule {
  env: { wasm: { numThreads: number; wasmBinary?: Uint8Array } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(model: Uint8Array): Promise<{
      outputNames: string[];
      run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
    }>;
  };
}

function reply(msg: object): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

export async function runSoundsWorker(dir: string): Promise<void> {
  let session: Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;
  let ort: OrtModule;
  try {
    ort = (await import(pathToFileURL(join(dir, "ort.wasm.bundle.min.mjs")).href)) as OrtModule;
    ort.env.wasm.numThreads = 1;
    // Hand over the wasm bytes directly: ORT can't fetch() a file:// URL in Node.
    ort.env.wasm.wasmBinary = readFileSync(join(dir, "ort-wasm-simd-threaded.wasm"));
    session = await ort.InferenceSession.create(readFileSync(join(dir, "yamnet.onnx")));
  } catch (e) {
    reply({ error: String(e) });
    process.exit(1);
  }

  let buf = Buffer.alloc(0);
  let running = false;
  const pump = async () => {
    if (running) return;
    running = true;
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const bytes = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      // Copy into an aligned buffer (subarray offsets may not be 4-aligned).
      const wave = new Float32Array(len / 4);
      new Uint8Array(wave.buffer).set(bytes);
      try {
        const out = await session.run({ waveform: new ort.Tensor("float32", wave, [wave.length]) });
        const t = out[session.outputNames[0]!]!;
        const [frames = 1, classes = 521] = t.dims;
        const mean = new Array<number>(classes).fill(0);
        for (let f = 0; f < frames; f++) {
          for (let c = 0; c < classes; c++) mean[c]! += t.data[f * classes + c]! / frames;
        }
        reply({ scores: mean.map((v) => Math.round(v * 1e4) / 1e4) });
      } catch (e) {
        reply({ error: String(e) });
      }
    }
    running = false;
  };
  process.stdin.on("data", (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    void pump();
  });
  process.stdin.on("end", () => process.exit(0));
}
