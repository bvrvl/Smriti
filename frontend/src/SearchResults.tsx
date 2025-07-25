interface JournalEntry { id: number; entry_date: string; content: string; }

interface SearchResultsProps {
  results: JournalEntry[];
}

export const SearchResults = ({ results }: SearchResultsProps) => {
  if (results.length === 0) {
    return <p>No results found.</p>;
  }

  return (
    <div className="entry-list">
      {results.map(entry => (
        <div key={entry.id} className="entry-item">
          <h3>{entry.entry_date.substring(0, 10)}</h3>
          <p>{entry.content}</p>
        </div>
      ))}
    </div>
  );
};