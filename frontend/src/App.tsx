import { useState, useEffect } from 'react';
import './App.css';
import { SentimentChart } from './SentimentChart'; // Make sure this import is here


interface JournalEntry {
  id: number;
  entry_date: string;
  content: string;
}

interface SentimentDataPoint {
  date: string;
  score: number;
}

interface Topic {
  topic_id: number;
  keywords: string[];
}

function App() {
  const [importMessage, setImportMessage] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);

  // Function to fetch all entries from the backend
  const fetchEntries = () => {
    fetch('http://localhost:8000/api/entries')
      .then(response => response.json())
      .then(data => setEntries(data))
      .catch(console.error);
  };

  // Function to fetch sentiment analysis data
  const fetchSentimentData = () => {
    fetch('http://localhost:8000/api/analysis/sentiment')
      .then(response => response.json())
      .then(data => setSentimentData(data))
      .catch(console.error);
  };

  const fetchTopicData = () => {
    fetch('http://localhost:8000/api/analysis/topics')
      .then(response => response.json())
      .then(data => setTopicData(data))
      .catch(console.error);
  };

  // Use useEffect to fetch data when the component first loads
  useEffect(() => {
    fetchEntries();
    fetchSentimentData();
    fetchTopicData();
  }, []);

  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        setImportMessage(data.message);
        // After importing, refresh all data
        fetchEntries();
        fetchSentimentData();
        fetchTopicData();
      })
      .catch(error => setImportMessage(`Error: ${error.message}`));
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Smriti: The Entire History of You</h1>
      </header>
      <div className="card">
        <h2>Actions</h2>
        <button onClick={handleImport}>Import Journal Entries</button>
        {importMessage && <p><i>{importMessage}</i></p>}
      </div>

      <div className="card">
        <h2>Sentiment Over Time</h2>
        <SentimentChart data={sentimentData} />
      </div>

      <div className="card">
        <h2>Entries</h2>
        <div className="entry-list">
          {entries.map(entry => (
            <div key={entry.id} className="entry-item">
              <h3>{entry.entry_date}</h3>
              <p>{entry.content.substring(0, 200)}...</p>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
  <h2>Discovered Topics</h2>
  {topicData.length > 0 ? (
    <ul>
      {topicData.map(topic => (
        <li key={topic.topic_id}>
          <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')}
        </li>
      ))}
    </ul>
  ) : (
    <p><i>Not enough entries to analyze topics. (Need at least 5)</i></p>
  )}
</div>
    </div>
  );
}

export default App;