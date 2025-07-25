// Renders the "On This Day" entries, receiving all data as props.

interface JournalEntry {
  id: number;
  entry_date: string;
  content: string;
  tags: string | null;
}

interface OnThisDayProps {
  entries: JournalEntry[];
  isLoading: boolean;
}

export const OnThisDay = ({ entries, isLoading }: OnThisDayProps) => {
  // Display a loading message while the data is being fetched.
  if (isLoading) {
    return <p><i>Loading memories...</i></p>;
  }

  // Display a message if no entries are found for today's date.
  if (entries.length === 0) {
    return <p><i>No memories from this day in the past.</i></p>;
  }

  // Render the list of entries once data is available.
  return (
    <div className="on-this-day-list">
      {entries.map(entry => (
        <div key={entry.id} className="entry-item">
          <h4>{entry.entry_date.substring(0, 4)}</h4>
          <p>{entry.content.substring(0, 250)}...</p>
          {entry.tags && <small>Tags: {entry.tags}</small>}
        </div>
      ))}
    </div>
  );
};