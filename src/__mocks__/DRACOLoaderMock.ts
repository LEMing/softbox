export const dracoInstances: DRACOLoader[] = [];

export class DRACOLoader {
  setDecoderPath = jest.fn().mockReturnThis();
  setDecoderConfig = jest.fn().mockReturnThis();
  dispose = jest.fn();

  constructor() {
    dracoInstances.push(this);
  }
}

export const resetDracoMock = () => {
  dracoInstances.length = 0;
};
