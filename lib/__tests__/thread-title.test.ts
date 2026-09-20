/**
 * A thread's title is whole words or the whole question — never cut mid-word.
 * @jest-environment node
 */
import { THREAD_TITLE_MAX, threadTitle } from '@tappet/core/thread-title';

describe('threadTitle', () => {
  it('keeps a question that fits, whole', () => {
    expect(threadTitle('What should I do at the next service?')).toBe('What should I do at the next service?');
  });

  it('cuts a long one at a word boundary with an ellipsis, never inside a word', () => {
    const long = 'Is it worth replacing the timing belt and water pump together on a car with this many miles?';
    const title = threadTitle(long);
    expect(title.length).toBeLessThanOrEqual(THREAD_TITLE_MAX);
    expect(title.endsWith('…')).toBe(true);
    const words = title.slice(0, -1).split(' ');
    for (const word of words) expect(long.split(' ')).toContain(word);
  });

  it('can still detect the cut that shipped', () => {
    // Six words then forty characters: "What should I do at the" — mid-thought.
    const shipped = (message: string) => {
      const words = message.split(' ').slice(0, 6).join(' ');
      return words.length > 40 ? words.slice(0, 40) + '...' : words;
    };
    expect(shipped('What should I do at the next service?')).toBe('What should I do at the');
    expect(threadTitle('What should I do at the next service?')).not.toBe('What should I do at the');
  });

  it('is never empty', () => {
    expect(threadTitle('   ')).toBe('New Chat');
  });
});
