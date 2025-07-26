interface JournalEntry {
  id: number;
  entry_date: string;
  content: string;
  tags: string | null;
}

interface OnThisDayProps {
  entries: JournalEntry[];
}

export const OnThisDay = ({ entries }: OnThisDayProps) => {
  if (entries.length === 0) {
    return <p><i>No memories from this day in the past.</i></p>;
  }

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