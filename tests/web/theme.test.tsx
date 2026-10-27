// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from '../../src/web/components/ThemeSwitch';
import { applyTheme, savedTheme } from '../../src/web/theme';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme switch', () => {
  it('follows the device by default', () => {
    expect(savedTheme()).toBe('auto');
    render(<ThemeSwitch />);
    expect(screen.getByRole('radio', { name: 'Auto' }).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('forces dark, remembers it, and returns to auto', () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(savedTheme()).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(savedTheme()).toBe('auto');
  });

  it('applies a saved choice before the app renders', () => {
    localStorage.setItem('fairshift.theme', 'light');
    applyTheme(savedTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ThemeSwitch />);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
