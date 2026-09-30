import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import QuantityStepper from './QuantityStepper.js';

describe('QuantityStepper', () => {
  it('goes no higher than the stock', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={3} max={3} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('goes no lower than one', () => {
    render(<QuantityStepper value={1} max={5} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeEnabled();
  });
});
