export interface AssRenderAdapter {
  renderFrame(input: {
    assText: string;
    timeMs: number;
    width: number;
    height: number;
    fonts: string[];
  }): Promise<ImageData | Uint8Array>;
  dispose?: () => void;
}

