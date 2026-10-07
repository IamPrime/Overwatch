import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UploadForm } from './UploadForm';
import { detectFood, detectFoodFromText, fetchNutritionImage } from '../lib/api';
import { expectFriendly } from '../test/rawErrors';
// The real API client only ever throws FriendlyErrors (see lib/api.js), so the fakes do too.
import { FriendlyError } from '../lib/errors';

vi.mock('../lib/api', () => ({
  detectFood: vi.fn(),
  detectFoodFromText: vi.fn(),
  fetchNutritionImage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks these browser APIs that UploadForm touches.
  window.matchMedia = () => ({ matches: false });
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};

  detectFood.mockResolvedValue({ tag: '2 fried eggs and black beans', tagToken: 'photo-sig' });
  detectFoodFromText.mockResolvedValue({ tag: '2 slices pizza', tagToken: 'text-sig' });
  fetchNutritionImage.mockResolvedValue({ blobUrl: 'blob:nutrition', usage: null });
});

afterEach(cleanup);

async function analysePhoto() {
  const { container } = render(<UploadForm token="test-token" onUsageChange={vi.fn()} />);
  const photo = new File(['fake image bytes'], 'meal.jpg', { type: 'image/jpeg' });

  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [photo] } });
  fireEvent.click(screen.getByRole('button', { name: /analyse photo/i }));
  // Reading the file and detecting are async - wait for the confirm step to appear.
  await screen.findByText('Looks like:');
}

describe('UploadForm photo confirmation', () => {
  test('does not spend a Wolfram lookup until the user confirms the detected food', async () => {
    await analysePhoto();

    expect(detectFood).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('2 fried eggs and black beans')).toBeTruthy();
    expect(fetchNutritionImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Look up nutrition' }));

    expect(await screen.findByAltText('Nutrition facts for 2 fried eggs and black beans')).toBeTruthy();
    // Confirming unchanged reuses the photo detection's signature.
    expect(fetchNutritionImage).toHaveBeenCalledWith('2 fried eggs and black beans', 'photo-sig', 'test-token');
    expect(detectFoodFromText).not.toHaveBeenCalled();
  });

  test('an edited name goes through the text path before the single Wolfram lookup', async () => {
    await analysePhoto();

    fireEvent.change(screen.getByDisplayValue('2 fried eggs and black beans'), {
      target: { value: 'actually two slices of pizza' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up nutrition' }));

    expect(await screen.findByAltText('Nutrition facts for 2 slices pizza')).toBeTruthy();
    expect(detectFoodFromText).toHaveBeenCalledWith('actually two slices of pizza', 'test-token');
    expect(fetchNutritionImage).toHaveBeenCalledTimes(1);
    expect(fetchNutritionImage).toHaveBeenCalledWith('2 slices pizza', 'text-sig', 'test-token');
  });
});

describe('UploadForm non-food input', () => {
  test('shows the server\'s not-food message and never looks anything up', async () => {
    detectFoodFromText.mockRejectedValue(
      new FriendlyError("That doesn't sound like food or drink - Angalia can only look up nutrition for things you eat or drink."),
    );
    render(<UploadForm token="test-token" onUsageChange={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/chicken caesar salad/i), { target: { value: 'hydrogen peroxide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look it up' }));

    expect(await screen.findByText(/doesn't sound like food or drink/i)).toBeTruthy();
    expect(fetchNutritionImage).not.toHaveBeenCalled();
  });

  test('a photo of something that is not food offers describing it instead', async () => {
    detectFood.mockRejectedValue(new FriendlyError("That doesn't look like food or drink - try another photo, or describe what you're eating."));
    const { container } = render(<UploadForm token="test-token" onUsageChange={vi.fn()} />);

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'cat.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse photo/i }));

    expect(await screen.findByText(/doesn't look like food or drink.*describe it instead/i)).toBeTruthy();
    expect(fetchNutritionImage).not.toHaveBeenCalled();
  });
});

describe('UploadForm photo errors', () => {
  test('a photo the browser cannot read shows a plain message instead of nothing', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        readAsDataURL() {
          setTimeout(() => this.onerror(new ProgressEvent('error')));
        }
      },
    );
    try {
      const { container } = render(<UploadForm token="test-token" onUsageChange={vi.fn()} />);
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [new File(['x'], 'broken.heic', { type: 'image/heic' })] },
      });
      fireEvent.click(screen.getByRole('button', { name: /analyse photo/i }));

      const prompt = await screen.findByText(/describe it instead/i);
      expectFriendly(prompt.textContent.replace(/ Describe it instead:$/, ''));
      expect(detectFood).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
