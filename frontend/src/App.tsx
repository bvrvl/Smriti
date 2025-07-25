import { useState, useEffect } from 'react';

import './App.css';
import { NerDisplay } from './NerDisplay';
import { HeatmapDisplay } from './HeatmapDisplay';
import { ConnectionEngine } from './ConnectionEngine';
import { CommonConnections } from './CommonConnections';
import { OnThisDay } from './OnThisDay';
import { LoadingSpinner } from './LoadingSpinner';
import { SentimentAnalysis } from './SentimentAnalysis';

// --- Type Definitions for API data ---
interface JournalEntry { id: number; entry_date: string; content: string; tags: string | null; }
interface Topic { topic_id: number; keywords: string[]; }
interface EntityCount { text: string; count: number; }
interface NerData { people: EntityCount[]; places: EntityCount[]; orgs: EntityCount[]; }

function App() {
  // --- State Management ---
  const [isLoading, setIsLoading] = useState({
    entries: true,
    topics: true,
    ner: true,
    onThisDay: true,
    sentiment: true, // Keep a general sentiment flag for the heatmap
  });

  const [importMessage, setImportMessage] = useState('');
  
  // State variables for data that is shared across multiple components.
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [nerData, setNerData] = useState<NerData | null>(null);
  const [onThisDayData, setOnThisDayData] = useState<JournalEntry[]>([]);
  const [topicData, setTopicData] = useState<Topic[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]); // For the heatmap
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);

  // --- Data Fetching ---
  // This function fetches all the necessary data for the dashboard.
  const fetchAllData = () => {
    setIsLoading({ entries: true, topics: true, ner: true, onThisDay: true, sentiment: true });

    Promise.all([
      fetch('http://localhost:8000/api/entries'),
      fetch('http://localhost:8000/api/analysis/topics'),
      fetch('http://localhost:8000/api/analysis/ner'),
      fetch('http://localhost:8000/api/on-this-day'),
      fetch('http://localhost:8000/api/analysis/sentiment') // For the heatmap
    ]).then(async ([entriesRes, topicsRes, nerRes, onThisDayRes, sentimentRes]) => {
      // Once all fetches are complete, parse their JSON responses.
      const entriesData = await entriesRes.json();
      const topicsData = await topicsRes.json();
      const nerData = await nerRes.json();
      const onThisDayData = await onThisDayRes.json();
      const sentimentData = await sentimentRes.json();

      // Set all state variables to trigger a single re-render.
      setEntries(entriesData);
      setFilteredEntries(entriesData);
      setTopicData(topicsData);
      setNerData(nerData);
      setOnThisDayData(onThisDayData);
      setSentimentData(sentimentData);
    }).catch(error => {
      console.error("Failed to fetch initial data:", error);
    }).finally(() => {
      setIsLoading({ entries: false, topics: false, ner: false, onThisDay: false, sentiment: false });
    });
  };

  // This `useEffect` runs only once when the component first loads.
  useEffect(() => {
    fetchAllData();
  }, []);

  // --- User Actions ---
  const handleImport = () => {
    setImportMessage('Importing...');
    fetch('http://localhost:8000/api/import', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setImportMessage(data.message);
        fetchAllData(); // Re-fetch all data to update the dashboard.
      })
      .catch(error => {
        console.error("Import failed:", error);
        setImportMessage('An error occurred during import.');
      });
  };

  const handleEntityClick = (entityText: string) => {
    const filtered = entries.filter(entry => entry.content.includes(entityText));
    setFilteredEntries(filtered);
  };
  
  const resetFilter = () => {
    setFilteredEntries(entries);
  };

  // --- Render Logic ---
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
          <h2>On This Day in Your History</h2>
          <OnThisDay entries={onThisDayData} isLoading={isLoading.onThisDay} />
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Heatmap</h2>
          {isLoading.sentiment ? <LoadingSpinner /> : <HeatmapDisplay sentimentData={sentimentData} />}
        </div>

        <div className="card grid-col-span-12">
          {isLoading.ner ? <LoadingSpinner /> : <NerDisplay nerData={nerData} onEntityClick={handleEntityClick} />}
        </div>
        
        <div className="card grid-col-span-6">
          <h2>Connection Engine</h2>
          {isLoading.ner ? <LoadingSpinner /> : <ConnectionEngine nerData={nerData} />}
        </div>

        <div className="card grid-col-span-6">
          <h2>Common Connection Discovery</h2>
          {isLoading.ner ? <LoadingSpinner /> : <CommonConnections nerData={nerData} />}
        </div>

        <div className="card grid-col-span-12">
          <h2>Sentiment Analysis</h2>
          {/* This new component handles its own data fetching and loading states internally. */}
          <SentimentAnalysis />
        </div>

        <div className="card grid-col-span-6">
          <h2>Discovered Topics</h2>
          {isLoading.topics ? <LoadingSpinner /> : (
            <ul className="topics-list">
              {topicData.length > 0 ? topicData.map(topic => (
                <li key={topic.topic_id}>
                  <strong>Topic {topic.topic_id + 1}:</strong> {topic.keywords.join(', ')}
                </li>
              )) : <p><i>No topics found. (Requires at least 5 entries).</i></p>}
            </ul>
          )}
        </div>

        <div className="card grid-col-span-6">
          <h2>Entries ({filteredEntries.length} of {entries.length})</h2>
          {isLoading.entries ? <LoadingSpinner /> : (
            <div className="entry-list">
              {filteredEntries.map(entry => (
                <div key={entry.id} className="entry-item">
                  <h3>{entry.entry_date}</h3>
                  <p>{entry.content.substring(0, 100)}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;