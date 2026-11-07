import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PresetPicker } from '../PresetPicker';

describe('PresetPicker', () => {
  it('renders a chip per preset', () => {
    render(<PresetPicker active="studio" onSelect={jest.fn()} />);
    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'studio',
      'product',
      'neutral',
      'dark',
      'outdoor',
    ]);
  });

  it('marks only the active chip as pressed', () => {
    render(<PresetPicker active="dark" onSelect={jest.fn()} />);
    const chips = screen.getAllByRole('button');
    const pressed = chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('dark');
  });

  it('reports the clicked preset via onSelect', () => {
    const onSelect = jest.fn();
    render(<PresetPicker active="studio" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('outdoor'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('outdoor');
  });

  it('is labelled as a group for assistive tech', () => {
    render(<PresetPicker active="studio" onSelect={jest.fn()} />);
    expect(screen.getByRole('group', { name: 'Visual preset' })).toBeInTheDocument();
  });
});
