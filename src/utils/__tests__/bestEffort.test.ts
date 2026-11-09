import { bestEffort } from '../bestEffort';

describe('bestEffort', () => {
  it('runs the action', () => {
    const action = jest.fn();

    bestEffort(action);

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('swallows an error thrown by the action', () => {
    const failing = () => {
      throw new Error('already inactive');
    };

    expect(() => bestEffort(failing)).not.toThrow();
  });
});
