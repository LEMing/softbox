export const ktx2Instances: KTX2Loader[] = [];

export class KTX2Loader {
  setTranscoderPath = jest.fn().mockReturnThis();
  detectSupport = jest.fn().mockReturnThis();
  dispose = jest.fn();

  constructor() {
    ktx2Instances.push(this);
  }
}

export const resetKtx2Mock = () => {
  ktx2Instances.length = 0;
};
