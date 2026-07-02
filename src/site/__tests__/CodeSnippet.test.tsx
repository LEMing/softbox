import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CodeSnippet } from '../CodeSnippet';

const mockClipboard = (writeText: jest.Mock) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
};

describe('CodeSnippet', () => {
  it('copies the install command and confirms on the button', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);

    render(<CodeSnippet />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }));

    expect(writeText).toHaveBeenCalledWith('npm install threedviewer');
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
  });

  it('has a distinct copy button per snippet', () => {
    mockClipboard(jest.fn().mockResolvedValue(undefined));
    render(<CodeSnippet />);
    expect(screen.getByRole('button', { name: 'Copy install command' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy usage code' })).toBeInTheDocument();
  });

  it('stays quiet when the clipboard permission is denied', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('NotAllowedError'));
    mockClipboard(writeText);

    render(<CodeSnippet />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy usage code' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});
