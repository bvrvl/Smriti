import { useState, useEffect } from 'react';

interface JournalEntry {
  id: number;
  entry_date: string;
  content: string;
  tags: string | null;
}

export const OnThisDay = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/on-this-day')
      .then(res => res.json())
      .then(data => {
        setEntries(data);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to fetch 'On This Day' entries:", error);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <p><i>Loading memories...</i></p>;
  }

  if (entries.length === 0) {
    return <p><i>No memories from this day in the past.</i></p>;
  }

  return (
    <div className="on-this-day-list">
      {entries.map(entry => (
        <div key={entry.id} className="entry-item">
          <h4>{new Date(entry.entry_date).getFullYear()}</h4>
          <p>{entry.content.substring(0, 250)}...</p>
          {entry.tags && <small>Tags: {entry.tags}</small>}
        </div>
      ))}
    </div>
  );
};