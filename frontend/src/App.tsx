import { useState, useEffect } from 'react';
import './App.css';
import { SentimentChart } from './SentimentChart';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';

// --- Interfaces ---
interface JournalEntry { id: number; entry_date: string; content: string; }
interface SentimentDataPoint { date: string; score: number; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

function App() {
  // --- State ---
  const [importMessage, setImportMessage] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentDataPoint[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);

  // --- Data Fetching ---
  const fetchAllData = async () => {
      try {
          const [entriesRes, sentimentRes, topicsRes, nerRes] = await Promise.all([
              fetch('http://localhost:8000/api/entries'),
              fetch('http://localhost:8000/api/analysis/sentiment'),
              fetch('http://localhost:8000/api/analysis/topics'),
              fetch('http://localhost:8000/api/analysis/ner')
          ]);
          const [entriesData, sentimentData, topicsData, nerData] = await Promise.all([
              entriesRes.json(), sentimentRes.json(), topicsRes.json(), nerRes.json()
          ]);
          setEntries(entriesData);
          setFilteredEntries(entriesData);
          setSentimentData(sentimentData);
          setTopicData(topicsData);
          setNerData(nerData);
      } catch (error) { console.error("Failed to fetch data:", error); }
  };

  useEffect(() => { fetchAllData(); }, []);

  const handleImport = async () => {
      setImportMessage('Importing...');
      try {
          const response = await fetch('http://localhost:8000/api/import', { method: 'POST' });
          const data = await response.json();
          setImportMessage(data.message);
          await fetchAllData();
      } catch (error) { const msg = error instanceof Error ? error.message : 'Unknown error'; setImportMessage(`Error: ${msg}`); }
  };

  // --- Interactivity ---
  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };

  const resetFilter = () => {
    setFilteredEntries(entries);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Smriti: The Entire History of You</h1>
      </header>

      <div className="card grid-col-span-12">
        <div className="actions-card-content">
          <button onClick={handleImport}>Import Journal Entries</button>
          <button onClick={resetFilter}>Reset Entry Filter</button>
          {importMessage && <p><i>{importMessage}</i></p>}
        </div>
      </div>
      
      <div className="dashboard-container">
        <div className="card grid-col-span-12">
          <h2>Sentiment Heatmap</h2>
          <HeatmapDisplay sentimentData={sentimentData} />
        </div>

        <div className="card grid-col-span-12">
          <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />
        </div>

        <div className="card grid-col-span-6">
          <h2>Connection Engine</h2>
          <ConnectionEngine nerData={nerData} />
        </div>

        <div className="card grid-col-span-6">
          <h2>Common Connection Discovery</h2>
          <CommonConnections nerData={nerData} />
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Over Time</h2>
          <SentimentChart data={sentimentData} />
        </div>

        <div className="card grid-col-span-6">
          <h2>Discovered Topics</h2>
          <ul className="topics-list">
            {topicData.length > 0 ? topicData.map(topic => (
              <li key={topic.topic_id}>
                <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')}
              </li>
            )) : <p><i>Import entries to analyze topics.</i></p>}
          </ul>
        </div>

        <div className="card grid-col-span-6">
          <h2>Entries ({filteredEntries.length} of {entries.length})</h2>
          <div className="entry-list">
            {filteredEntries.map(entry => (
              <div key={entry.id} className="entry-item">
                <h3>{entry.entry_date}</h3>
                <p>{entry.content.substring(0, 100)}...</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;