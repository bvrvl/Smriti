import { useState, useEffect } from 'react';
import './App.css';
import { SentimentChart } from './SentimentChart';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';

// --- Interfaces for our data shapes ---
interface JournalEntry { id: number; entry_date: string; content: string; }
interface SentimentDataPoint { date: string; score: number; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData {
  people: EntityCount[];
  places: EntityCount[];
  orgs: EntityCount[];
}

function App() {
  // --- State variables ---
  const [importMessage, setImportMessage] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);

  // --- Data fetching functions ---
  const fetchAllData = () => {
    fetch('http://localhost:8000/api/entries').then(res => res.json()).then(setEntries).catch(console.error);
    fetch('http://localhost:8000/api/analysis/sentiment').then(res => res.json()).then(setSentimentData).catch(console.error);
    fetch('http://localhost:8000/api/analysis/topics').then(res => res.json()).then(setTopicData).catch(console.error);
    fetch('http://localhost:8000/api/analysis/ner').then(res => res.json()).then(setNerData).catch(console.error);
    
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        setImportMessage(data.message);
        fetchAllData(); // After importing, refresh all data
      })
      .catch(error => setImportMessage(`Error: ${error.message}`));
  };

  // --- Render component ---
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
        <h2>Sentiment Heatmap</h2>
        <HeatmapDisplay sentimentData={sentimentData} />
      </div>

      <NerDisplay nerData={nerData} />

      <div className="card">
        <h2>Sentiment Over Time</h2>
        <SentimentChart data={sentimentData} />
      </div>

      <div className="card">
        <h2>Discovered Topics</h2>
        {topicData.length > 0 ? (
          <ul> {topicData.map(topic => ( <li key={topic.topic_id}> <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')} </li> ))} </ul>
        ) : ( <p><i>Not enough entries to analyze topics. (Need at least 5)</i></p> )}
      </div>

      <div className="card">
        <h2>Connection Engine</h2>
          <ConnectionEngine nerData={nerData} />
      </div>
      <div className="card">
        <h2>Common Connection Discovery</h2>
          <CommonConnections nerData={nerData} />
      </div>

      <div className="card">
        <h2>Entries</h2>
        <div className="entry-list"> {entries.map(entry => ( <div key={entry.id} className="entry-item"> <h3>{entry.entry_date}</h3> <p>{entry.content.substring(0, 200)}...</p> </div> ))} </div>
      </div>
    </div>
  );
}

export default App;