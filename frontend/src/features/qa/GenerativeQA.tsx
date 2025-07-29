import { useState } from 'react';

export const GenerativeQA = () => {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsGenerating(true);
    setAnswer('');

    fetch('http://localhost:8000/api/generate/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query }),
    })
      .then(res => res.json())
      .then(data => setAnswer(data.answer))
      .catch(console.error)
      .finally(() => setIsGenerating(false));
  };

  return (
    <div>
      <form onSubmit={handleGenerate} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask your journal anything..."
          style={{ flexGrow: 1, padding: '0.5rem' }}
        />
        <button type="submit" disabled={isGenerating}>
          {isGenerating ? 'Thinking...' : 'Ask'}
        </button>
      </form>
      {answer && (
        <div className="qa-answer">
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
};